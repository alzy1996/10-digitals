/**
 * Dallni prototype app: a 3D mall map that is always on screen, with one task per bottom sheet.
 *
 * Screens (CONTRACT.md section 3, src/ui): home -> search -> place -> navigate -> arrived, the car flow
 * (scan plate -> save -> Car Card -> Take me there) and the scan sheet (set you-are-here from a plate).
 * State lives in memory only (no localStorage). The walk is a SIMULATION, never live positioning.
 *
 * Engine use: the singleton engine (src/engine/engine.js) is driven imperatively from effects and event
 * handlers; React never re-renders the 3D scene. The engine is a lazy chunk (src/engineHost.js): the sheet
 * renders at once and engine calls made before the chunk arrives are queued.
 *
 * v0.2 (DESIGN-GLASS.md, CONTRACT.md 3b): storm glass look, and the first-person **Walk view** (`view.mode === 'fpv'`):
 * the simulated walk seen at eye height inside the 3D model (a SIMULATION, never camera AR or live positioning). It is
 * the default view while "Simulate walk" plays; the Map button in its bottom bar goes back to the overhead map (the
 * walk keeps playing there). In the Walk view the navigate sheet and the header give way to the HUD (src/ui/WalkHud.jsx,
 * a lazy chunk), the engine follows the walker by itself, and the HUD measures the free area for the engine.
 *
 * Bottom sheets fold (src/ui/Sheet.jsx, src/ui/sheetModel.js): peek / half / full, half by default (search: full while
 * typing). The snap is UI state here (`state.sheet`, per sheet: it resets when the screen's sheet changes; never
 * stored); each sheet reports its settled rect and the App frames the map in the free area above it.
 */
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { engine, loadEngine } from './engineHost.js'
import { loadVenue } from './data/venue.js'
import { findRouteToTarget, resolveTarget, travelTimesFrom } from './routing/route.js'
import { createSearch } from './search/search.js'
import { createSimulator } from './sim/simulator.js'
import { dirFor, t } from './i18n/strings.js'
import { Header } from './ui/Header.jsx'
import { MapControls, WalkViewButton } from './ui/MapControls.jsx'
import { MapView } from './ui/MapView.jsx'
import { HomeScreen } from './ui/HomeScreen.jsx'
import { SearchScreen } from './ui/SearchScreen.jsx'
import { PlaceScreen } from './ui/PlaceScreen.jsx'
import { NavigateScreen } from './ui/NavigateScreen.jsx'
import { ArrivedScreen } from './ui/ArrivedScreen.jsx'
import { CarScreen } from './ui/CarScreen.jsx'
import { ScanSheet } from './ui/ScanSheet.jsx'
import { bayForPlate, entityInfo, isParkingLevel, levelButtonLabel, levelName, pick } from './ui/model.js'
import { plateLabel } from './routing/names.js'
import { initialLang, readUrlParams, rememberLang } from './ui/urlState.js'
import { nextTurnFor } from './ui/hudModel.js'
import { SheetContext } from './ui/Sheet.jsx'
import { defaultSnap } from './ui/sheetModel.js'

/** The Walk view HUD loads on demand (it is not part of the first screen: PLAN.md 19.2 load budget). */
const loadWalkHud = () => import('./ui/WalkHud.jsx')
const WalkHud = lazy(loadWalkHud)

const VENUE_URL = `${import.meta.env.BASE_URL}venues/demo-muscat/venue.json`
/** Camera while following the simulated walker: about 35 m of route visible above the step card. */
const FOLLOW = { distance: 115, tiltDeg: 52 }
const TOAST_MS = 3200
/** How long "Route ended · Undo" stays (PLAN.md section 9: undo instead of "Are you sure?"). */
const UNDO_MS = 5000
const ROUTE_SCREENS = new Set(['place', 'navigate', 'arrived'])
/** Browser theme colour per theme (DESIGN-GLASS.md 2.1): storm retail / parking. */
const THEME_COLOR = { sunlight: '#0E1418', basement: '#070A0D' }

const INITIAL = {
  ready: false,
  error: null,
  no3d: false,
  lang: 'en',
  screen: 'home',
  returnTo: 'home',
  you: null,
  car: null,
  targetId: null,
  stepFree: false,
  query: '',
  tile: null,
  category: null,
  stepIndex: 0,
  view: { mode: 'stack', levelId: null },
  userView: false,
  carStage: 'scan',
  plateId: null,
  sim: { active: false, playing: false, done: false, speed: 1, distanceDoneM: 0, phase: 'walk', connectorType: null, onConnector: false, rideProgress: 0 },
  toast: null,
  undo: null,
  /** bottom sheet snap: `snap` applies while the sheet is `key` (sheetKeyOf); otherwise the screen's default */
  sheet: { key: null, snap: null },
}

function reducer(state, action) {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch }
    case 'sim':
      return { ...state, sim: { ...state.sim, ...action.patch } }
    case 'view':
      return { ...state, view: { ...state.view, ...action.patch } }
    default:
      return state
  }
}

/** Level picker buttons (app.css .level-btn, .levels-compact .level-btn): full and compact height, CSS px. */
const LEVEL_BTN_PX = 56
const LEVEL_BTN_COMPACT_PX = 48

/** Which sheet is up: the snap resets to its default when this changes (another screen, car stage, search mode). */
function sheetKeyOf(s) {
  if (s.screen === 'car') return `car:${s.car && s.carStage === 'card' ? 'card' : s.carStage}`
  if (s.screen === 'search') return `search:${s.tile || s.category ? 'list' : 'type'}`
  return s.screen
}

/** You-are-here from a QR plate (exact). Bay codes in the label read as painted (names.plateLabel). */
function youFromAnchor(index, anchorId) {
  const a = index.anchorById.get(anchorId)
  if (!a) return null
  const node = index.nodeById.get(a.nodeId)
  return { anchorId: a.id, nodeId: a.nodeId, levelId: a.levelId, x: node?.point[0] ?? a.point[0], y: node?.point[1] ?? a.point[1], label: plateLabel(index, a), source: 'plate' }
}

/** You-are-here at the end of a (simulated) route. */
function youFromRouteEnd(route, label) {
  const last = route.points[route.points.length - 1]
  return { anchorId: null, nodeId: last.nodeId, levelId: last.levelId, x: last.x, y: last.y, label, source: 'sim' }
}

function stepLevelOf(route, i) {
  const step = route?.steps?.[i]
  return step ? route.points[Math.max(0, step.from)]?.levelId : null
}

/**
 * Where the Walk view stands for a step before the walk plays: the step's start (a zero-length "Start at" step: the
 * next step's), facing along the first leg of the route that is at least 4 m long. A short jog out of a doorway would
 * otherwise turn the narrow first-person view away from where the walk really goes: on the demo route, the route point
 * 5 m ahead (the follow camera's rule once the walk plays) is the corner 3 m out of the south entrance, and facing it
 * shows the Lift A wall instead of the corridor, the escalator and the fountain the step says to face (QA round 1,
 * compared at the -5° pitch). The cost is one short glance toward that corner when Play is pressed.
 * @returns {{ levelId: string, x: number, y: number, headingDeg: number } | null}
 */
function walkStand(route, i) {
  const steps = route?.steps ?? []
  let k = Math.max(0, Math.min(steps.length - 1, i))
  while (steps[k + 1] && steps[k].to <= steps[k].from) k++
  const step = steps[k]
  if (!step) return null
  const pts = route.points
  const a = pts[Math.max(0, step.from)]
  let heading = null
  let first = null
  let run = 0
  for (let j = Math.max(0, step.from); j < pts.length - 1 && run < 15; j++) {
    const p = pts[j]
    const q = pts[j + 1]
    if (p.levelId !== a.levelId || q.levelId !== a.levelId) break
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    const b = (Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI
    if (len > 0.3 && first == null) first = b
    if (len >= 4) {
      heading = b
      break
    }
    run += len
  }
  return { levelId: a.levelId, x: a.x, y: a.y, headingDeg: ((heading ?? first ?? 0) + 360) % 360 }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL, (s) => ({ ...s, lang: initialLang(readUrlParams().lang) }))
  const stateRef = useRef(state)
  stateRef.current = state
  const indexRef = useRef(null)
  const searchRef = useRef(null)
  const pendingRef = useRef({ step: null, simT: null, play: false })
  const simRef = useRef(null)
  const simMeta = useRef({ step: -1, level: null, lastUi: 0, doneTimer: 0, phase: null })
  /** "Simulate walk" from a map view: the walk starts once the dive into the Walk view is over. */
  const startTimer = useRef(0)
  const topRef = useRef(null)
  const sheetRef = useRef(null)
  const shownRouteRef = useRef(undefined)
  const toastTimer = useRef(0)
  const undoTimer = useRef(0)
  const undoRef = useRef(null)
  /** The map view to go back to from the Walk view (DESIGN-GLASS 7.3 Map button: default Floor). */
  const mapModeRef = useRef('floor')
  /** "Simulate walk" opens the Walk view unless the shopper went back to the map during this trip. */
  const walkPrefRef = useRef(true)
  /** The Walk view HUD's measured layout (padding + obstacles), merged with the Arrived sheet on arrival. */
  const walkLayoutRef = useRef(null)
  const layoutRef = useRef(null)

  const patch = useCallback((p) => dispatch({ type: 'patch', patch: p }), [])
  /** View state, also written to stateRef at once so simulator callbacks in the same tick see the new mode. */
  const setViewState = useCallback((p) => {
    stateRef.current = { ...stateRef.current, view: { ...stateRef.current.view, ...p } }
    dispatch({ type: 'view', patch: p })
  }, [])
  const index = state.ready ? indexRef.current : null
  const { lang, screen, you, car, view } = state

  // ------------------------------------------------------------------ load venue + URL test hooks
  useEffect(() => {
    let cancelled = false
    loadVenue(VENUE_URL)
      .then((idx) => {
        if (cancelled) return
        indexRef.current = idx
        searchRef.current = createSearch(idx)
        const p = readUrlParams()
        const startId = p.from && idx.anchorById.has(p.from) ? p.from : idx.venue.meta.defaultStartAnchorId
        const youNow = youFromAnchor(idx, startId)
        const carNow = p.car && idx.bayById.has(p.car) ? { bayId: p.car, savedAt: Date.now(), plateId: null } : null
        const target = p.to ? resolveTarget(idx, p.to) : null
        let scr = p.screen ?? 'home'
        if (ROUTE_SCREENS.has(scr) && !target) scr = 'home'
        const carLevel = carNow ? idx.bayById.get(carNow.bayId).levelId : null
        const parkingTop = [...idx.levels].filter((l) => l.kind === 'parking').sort((a, b) => b.ordinal - a.ordinal)[0]?.id
        let levelId = youNow?.levelId ?? idx.levels[0].id
        if (scr === 'car') levelId = carLevel ?? parkingTop ?? levelId
        if (p.level && idx.levelById.has(p.level)) levelId = p.level
        const defaultMode = scr === 'car' || scr === 'navigate' || scr === 'arrived' ? 'floor' : 'stack'
        // the Walk view needs a route (navigate / arrived); elsewhere view=fpv opens the Floor view
        const urlView = p.view === 'fpv' && scr !== 'navigate' && scr !== 'arrived' ? 'floor' : p.view
        pendingRef.current = { step: p.step, simT: p.simT, play: p.play, style: p.style }
        const tileNow = p.tile && ['food', 'restrooms', 'prayer', 'pharmacy', 'kids', 'exit'].includes(p.tile) ? p.tile : null
        const carStage = carNow ? 'card' : 'scan'
        dispatch({
          type: 'patch',
          patch: {
            ready: true,
            screen: scr,
            returnTo: 'home',
            you: youNow,
            car: carNow,
            targetId: target ? p.to : null,
            stepFree: p.stepFree,
            query: p.q ?? '',
            tile: tileNow,
            view: { mode: urlView ?? defaultMode, levelId },
            userView: Boolean(urlView),
            carStage,
            // ?sheet=peek|half|full: the first screen's sheet snap (test hook)
            sheet: p.sheet ? { key: sheetKeyOf({ screen: scr, car: carNow, carStage, tile: tileNow, category: null }), snap: p.sheet } : { key: null, snap: null },
          },
        })
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: 'patch', patch: { error: String(err?.message ?? err) } })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // the 3D engine chunk downloads after the first screen is up (PLAN.md 19.2), never competing with venue.json
  useEffect(() => {
    if (!state.ready) return undefined
    let handle = 0
    const go = () => {
      loadEngine().catch(() => {
        // MapView reports the failed download (no3d: 'load') and offers Try again
      })
    }
    if (typeof window.requestIdleCallback === 'function') {
      handle = window.requestIdleCallback(go, { timeout: 600 })
      return () => window.cancelIdleCallback?.(handle)
    }
    handle = setTimeout(go, 0)
    return () => clearTimeout(handle)
  }, [state.ready])

  // ------------------------------------------------------------------ derived data
  const route = useMemo(() => {
    if (!index || !you || !state.targetId) return null
    return findRouteToTarget(index, you.nodeId, state.targetId, { stepFree: state.stepFree })
  }, [index, you, state.targetId, state.stepFree])
  const routeRef = useRef(route)
  routeRef.current = route

  const info = useMemo(() => (index && state.targetId ? entityInfo(index, state.targetId) : null), [index, state.targetId])
  const focusLevelId = view.levelId
  const theme = index && focusLevelId && isParkingLevel(index, focusLevelId) ? 'basement' : 'sunlight'

  // ------------------------------------------------------------------ engine: venue, language, theme, markers
  useEffect(() => {
    if (!index) return
    engine.setVenue(index)
    // v0.2 storm glass by default; ?style=classic is the v0.1 look exactly (classic scene + v0.1 ribbon)
    const style = pendingRef.current.style === 'classic' ? 'classic' : 'storm'
    engine.setSceneStyle(style)
    engine.setPathStyle(style === 'classic' ? 'ribbon' : 'glow')
    shownRouteRef.current = undefined
    // the engine starts in its own default view: apply ours (from the URL or defaults) right away
    const v = stateRef.current.view
    engine.setView({ mode: v.mode, levelId: v.levelId, fit: 'level' }, { durationMs: 0 })
  }, [index])

  useEffect(() => {
    engine.setLanguage(lang)
    const root = document.documentElement
    root.lang = lang
    root.dir = dirFor(lang)
    rememberLang(lang)
    document.title = lang === 'ar' ? 'دلّني · محاكي ثلاثي الأبعاد' : 'Dallni 3D Simulator'
  }, [lang])

  useEffect(() => {
    engine.setTheme(theme)
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  }, [theme])

  useEffect(() => {
    if (!index) return
    engine.setMarker('you', you && !state.sim.active ? { levelId: you.levelId, x: you.x, y: you.y, state: 'exact' } : null)
  }, [index, you, state.sim.active])

  useEffect(() => {
    if (!index) return
    const bay = car ? index.bayById.get(car.bayId) : null
    engine.setMarker('car', bay ? { levelId: bay.levelId, x: bay.center[0], y: bay.center[1], headingDeg: bay.angleDeg } : null)
  }, [index, car])

  // route + destination marker (only re-sent when the shown route really changes)
  const shownRoute = index && ROUTE_SCREENS.has(screen) ? route : null
  useEffect(() => {
    if (!index) return
    if (shownRouteRef.current === shownRoute) return
    shownRouteRef.current = shownRoute
    engine.showRoute(shownRoute)
  }, [index, shownRoute])

  // destination marker: none when the destination is the saved car (the car marker is the destination);
  // on arrival only its green ring, on the floor in front of the door (PLAN.md 19.2)
  const destIsCar = Boolean(car && state.targetId && car.bayId === state.targetId)
  useEffect(() => {
    if (!index) return
    const last = shownRoute?.points[shownRoute.points.length - 1]
    engine.setMarker('dest', last && !destIsCar ? { levelId: last.levelId, x: last.x, y: last.y, ...(screen === 'arrived' ? { state: 'arrived' } : {}) } : null)
  }, [index, shownRoute, destIsCar, screen])

  // v0.2 target ring + beam at the next turn (CONTRACT 3b setNextTurn; DESIGN-GLASS 7.6): the end of the current step
  // (a connector step: where you board it; while riding an escalator: where you step off), none on Arrived. A lift or
  // the stairs keep it at the boarding stop on this floor until the step changes at the exit (the Walk view does not
  // draw the other floor while you wait at the doors)
  const stepIndex = state.stepIndex
  const riding = Boolean(state.sim.active && state.sim.onConnector && state.sim.connectorType === 'escalator')
  useEffect(() => {
    if (!index) return
    if (screen !== 'navigate' || !shownRoute) {
      engine.setNextTurn(null)
      return
    }
    const nt = nextTurnFor(index, shownRoute, stepIndex)
    const st = shownRoute.steps[stepIndex]
    const exit = riding && st?.kind === 'connector' ? shownRoute.points[st.connector?.exitIndex ?? st.to] : null
    engine.setNextTurn(nt && exit ? { ...nt, levelId: exit.levelId, x: exit.x, y: exit.y } : nt)
  }, [index, shownRoute, screen, stepIndex, riding])

  // chevrons flow (and the engine renders frames) only while the simulated walk plays; idle = 0 frames otherwise
  const animating = Boolean(screen === 'navigate' && state.sim.active && state.sim.playing && !state.sim.done)
  useEffect(() => {
    engine.setPathAnimating(animating, { flowMps: 1.2 * state.sim.speed + 0.6 })
  }, [animating, state.sim.speed])

  // QR plate pins while a scan sheet asks the shopper to tap the plate in front of them
  const scanPins = screen === 'scan' ? true : screen === 'car' && state.carStage !== 'card' ? ['parking_pillar'] : null
  const scanKey = Array.isArray(scanPins) ? scanPins.join(',') : String(scanPins)
  useEffect(() => {
    if (!index) return
    engine.setScanPins(scanPins)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, scanKey])

  // ------------------------------------------------------------------ toasts ("Now on Level 1")
  const showToast = useCallback((levelId, ms = TOAST_MS) => {
    const idx = indexRef.current
    if (!idx) return
    clearTimeout(toastTimer.current)
    patch({ toast: { levelId, key: Date.now() } })
    toastTimer.current = setTimeout(() => patch({ toast: null }), ms)
  }, [patch])
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(undoTimer.current)
      clearTimeout(startTimer.current)
    },
    [],
  )

  // ------------------------------------------------------------------ camera helpers
  const goView = useCallback((mode, levelId, fit = 'level', opts) => {
    setViewState({ mode, levelId })
    engine.setView({ mode, levelId, fit }, opts)
  }, [setViewState])

  /**
   * Arrival framing: face the shop's sign so both lines read (or look into the car's bay from the aisle). The engine
   * does it the first-person way in the Walk view (DESIGN-GLASS 6.3) and the map way elsewhere.
   */
  const frameArrival = useCallback((durationMs = 1200) => {
    const r = routeRef.current
    const idx = indexRef.current
    const s = stateRef.current
    if (!r || !idx) return
    const last = r.points[r.points.length - 1]
    const target = s.targetId ? resolveTarget(idx, s.targetId) : null
    if (target?.type === 'bay') {
      // at the car: look into its bay from the aisle, the painted code upright and in front of the car
      const bay = idx.bayById.get(s.targetId)
      engine.flyToBay({ levelId: bay.levelId, x: bay.center[0], y: bay.center[1], angleDeg: bay.angleDeg, w: bay.w, l: bay.l }, durationMs)
    } else {
      // at a shop: face its front, close enough to read the sign (PLAN.md 19.2 arrival)
      engine.flyToShopFront({ levelId: last.levelId, x: last.x, y: last.y }, durationMs)
    }
  }, [])

  /** Show one navigation step: highlight it and fly the camera (route-up). */
  const showStep = useCallback((i, { initial = false } = {}) => {
    const r = routeRef.current
    const s = stateRef.current
    if (!r) return
    const step = r.steps[i]
    if (!step) return
    const level = stepLevelOf(r, i)
    if (s.view.mode === 'fpv') {
      // Walk view: no map flight; the eye glides to the step's start, facing along it (while a walk is loaded the
      // engine stands on the walker instead)
      if (level !== s.view.levelId) setViewState({ levelId: level })
      const stand = simRef.current ? null : walkStand(r, i)
      engine.setActiveStep(i, stand ? { fly: false } : undefined)
      if (stand) engine.flyTo(stand, 900)
      return
    }
    // Step view: the floor of the step (or 2D). The stacked Overview is one tap away and stays if picked.
    const mode = s.userView ? s.view.mode : s.view.mode === 'top' ? 'top' : 'floor'
    if (mode === 'stack') {
      // Overview of a trip: frame the whole route on the stacked floors it uses
      engine.setActiveStep(i, { fly: false })
      goView('stack', level, 'route')
      return
    }
    if (i === 0 && initial) {
      engine.setActiveStep(0, { fly: false })
      goView(mode, level, 'route')
      return
    }
    if (mode !== s.view.mode || level !== s.view.levelId) {
      setViewState({ mode, levelId: level })
      engine.setView({ mode, levelId: level, fit: 'none' })
    }
    engine.setActiveStep(i)
  }, [goView, setViewState])

  // ------------------------------------------------------------------ simulator
  // While riding, the walker carries the simulator's own height and connector: the engine never guesses
  // a height from x/y (parking aisles run under the escalators of the floors above).
  const walkerValue = (s) => ({
    levelId: s.levelId,
    x: s.x,
    y: s.y,
    headingDeg: s.headingDeg,
    ...(s.onConnector && s.elevation != null ? { elevation: s.elevation, connectorId: s.connectorId } : {}),
  })

  const handleSim = useCallback((s) => {
    const meta = simMeta.current
    const sim = simRef.current
    const playing = Boolean(sim?.isPlaying())
    const mode = stateRef.current.view.mode
    const newStep = s.stepIndex !== meta.step
    // the step first, then the walker: the engine measures the walked distance from where the step starts (the Walk
    // view looks 5 m ahead of that distance)
    if (newStep) {
      meta.step = s.stepIndex
      engine.setActiveStep(s.stepIndex, { fly: false })
    }
    engine.setMarker('walker', walkerValue(s))
    if (newStep) {
      // the map follow camera re-frames on a new step; the Overview keeps its own framing, the Walk view follows by itself
      if (playing && mode !== 'stack' && mode !== 'fpv') engine.flyTo({ levelId: s.levelId, x: s.x, y: s.y, headingDeg: s.headingDeg, ...FOLLOW }, 900)
      dispatch({ type: 'patch', patch: { stepIndex: s.stepIndex } })
    }
    // a new floor is announced when the shopper steps off the lift / escalator / stairs, not while riding
    if (s.levelId !== meta.level && !s.onConnector) {
      const prev = meta.level
      meta.level = s.levelId
      setViewState({ levelId: s.levelId })
      if (prev && !meta.silent) showToast(s.levelId)
    }
    const now = performance.now()
    if (now - meta.lastUi > 150 || s.done || s.phase !== meta.phase) {
      meta.lastUi = now
      meta.phase = s.phase
      dispatch({
        type: 'sim',
        patch: { distanceDoneM: s.distanceDoneM, phase: s.phase, connectorType: s.connectorType, onConnector: s.onConnector, rideProgress: s.rideProgress ?? 0, done: s.done, playing },
      })
    }
    if (s.done && !playing && !meta.doneTimer && stateRef.current.screen === 'navigate' && stateRef.current.sim.playing) {
      // Walk view: turn to face the shop's sign (or the car's bay) as the walk ends, then the Arrived sheet comes up
      if (mode === 'fpv') frameArrival(900)
      meta.doneTimer = setTimeout(() => {
        meta.doneTimer = 0
        engine.setFollow(false)
        if (stateRef.current.screen === 'navigate') dispatch({ type: 'patch', patch: { screen: 'arrived' } })
      }, 900)
    }
  }, [showToast, setViewState, frameArrival])

  const ensureSim = useCallback(() => {
    if (simRef.current) return simRef.current
    const r = routeRef.current
    const s = stateRef.current
    const sim = createSimulator({ route: r, speedMultiplier: s.sim.speed, index: indexRef.current })
    simMeta.current = { step: s.stepIndex, level: stepLevelOf(r, s.stepIndex), lastUi: 0, doneTimer: 0, phase: null }
    sim.onChange(handleSim)
    simRef.current = sim
    return sim
  }, [handleSim])

  const stopSim = useCallback(() => {
    const sim = simRef.current
    clearTimeout(startTimer.current)
    clearTimeout(simMeta.current.doneTimer)
    simMeta.current.doneTimer = 0
    if (!sim) return
    sim.dispose()
    simRef.current = null
    engine.setMarker('walker', null)
    engine.setFollow(false)
    dispatch({ type: 'sim', patch: { active: false, playing: false, done: false, distanceDoneM: 0, phase: 'walk', connectorType: null, onConnector: false, rideProgress: 0 } })
  }, [])

  const playSim = useCallback(() => {
    const r = routeRef.current
    if (!r) return
    clearTimeout(startTimer.current)
    const fresh = !simRef.current
    const st0 = stateRef.current
    if (fresh && st0.view.mode !== 'fpv' && walkPrefRef.current && !st0.no3d) {
      // a walk that has not started yet opens the Walk view first: dive in at the step's start facing along the route,
      // then start walking (diving straight onto a walker that is turning out of a doorway would face a wall)
      const stand = walkStand(r, st0.stepIndex)
      mapModeRef.current = st0.view.mode
      engine.setFollow(false)
      setViewState({ mode: 'fpv', levelId: stand?.levelId ?? stepLevelOf(r, st0.stepIndex) })
      engine.setView({ mode: 'fpv', levelId: stand?.levelId })
      if (stand) engine.flyTo(stand, 0)
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      startTimer.current = setTimeout(() => {
        const s = stateRef.current
        if (routeRef.current === r && !simRef.current && s.screen === 'navigate' && s.view.mode === 'fpv') playSimRef.current()
      }, reduced ? 0 : 1150)
      return
    }
    const sim = ensureSim()
    if (fresh) sim.seekStep(stateRef.current.stepIndex)
    if (sim.getState().done) {
      simMeta.current.step = 0
      sim.seekStep(0)
      dispatch({ type: 'patch', patch: { stepIndex: 0 } })
    }
    const s = sim.getState()
    const st = stateRef.current
    const v = st.view
    if (v.mode === 'fpv' || (walkPrefRef.current && !st.no3d)) {
      // v0.2: the walk plays in the first-person Walk view (the engine follows the walker by itself)
      if (v.mode !== 'fpv') {
        mapModeRef.current = v.mode
        engine.setFollow(false)
        engine.setView({ mode: 'fpv', levelId: s.levelId })
      }
      setViewState({ mode: 'fpv', levelId: s.levelId })
    } else {
      // the overhead map follows the walker (v0.1)
      const mode = v.mode === 'stack' ? 'floor' : v.mode
      setViewState({ mode, levelId: s.levelId })
      engine.setView({ mode, levelId: s.levelId, fit: 'none' })
      engine.flyTo({ levelId: s.levelId, x: s.x, y: s.y, headingDeg: s.headingDeg, ...FOLLOW }, 1000)
      engine.setFollow(true)
    }
    dispatch({ type: 'sim', patch: { active: true, playing: true, done: false } })
    sim.play()
  }, [ensureSim, setViewState])
  const playSimRef = useRef(playSim)
  playSimRef.current = playSim

  /** Into the first-person Walk view (the "Walk view" pill, the View menu's 4th row). */
  const enterWalk = useCallback(() => {
    const s = stateRef.current
    const r = routeRef.current
    if (!r || s.no3d || s.view.mode === 'fpv') return
    walkPrefRef.current = true
    mapModeRef.current = s.view.mode
    const sim = simRef.current
    const level = sim ? sim.getState().levelId : s.screen === 'arrived' ? r.points[r.points.length - 1].levelId : stepLevelOf(r, s.stepIndex)
    engine.setFollow(false)
    setViewState({ mode: 'fpv', levelId: level })
    patch({ userView: true })
    engine.setView({ mode: 'fpv', levelId: level })
    if (s.screen === 'arrived') frameArrival()
    else if (!sim) {
      const stand = walkStand(r, s.stepIndex)
      if (stand) engine.flyTo(stand, 900)
    }
  }, [patch, setViewState, frameArrival])

  /**
   * Back from the Walk view to the overhead map (bottom bar Map, the mini-map, the Arrived Map button, the View menu).
   * Only a chosen map (the Map buttons, the View menu) makes "Simulate walk" stay on the map for the rest of the trip;
   * a tap on the mini-map (`{ via: 'dome' }`) only looks at it.
   */
  const leaveWalk = useCallback((opts) => {
    const s = stateRef.current
    const r = routeRef.current
    if (s.view.mode !== 'fpv') return
    if (opts?.via !== 'dome') walkPrefRef.current = false
    clearTimeout(startTimer.current)
    const sim = simRef.current
    const playing = Boolean(sim?.isPlaying())
    let mode = mapModeRef.current
    if (mode === 'fpv' || (mode === 'stack' && (playing || s.screen === 'arrived'))) mode = 'floor'
    patch({ userView: true })
    if (s.screen === 'arrived' && r) {
      const last = r.points[r.points.length - 1]
      setViewState({ mode, levelId: last.levelId })
      engine.setView({ mode, levelId: last.levelId, fit: 'none' })
      frameArrival()
      return
    }
    const level = sim ? sim.getState().levelId : s.view.levelId
    setViewState({ mode, levelId: level })
    // the rise out of the Walk view ends over the walker, route-up; while the walk plays the map follows it again
    engine.setView({ mode, levelId: level, fit: mode === 'stack' ? 'route' : 'none' })
    if (playing) engine.setFollow(true)
  }, [patch, setViewState, frameArrival])

  const pauseSim = useCallback(() => {
    simRef.current?.pause()
    engine.setFollow(false)
    dispatch({ type: 'sim', patch: { playing: false } })
  }, [])

  const setSpeed = useCallback((m) => {
    simRef.current?.setSpeed(m)
    dispatch({ type: 'sim', patch: { speed: m } })
  }, [])

  // leaving the route screens, or a new route, ends the simulation
  useEffect(() => {
    if (screen !== 'navigate' && screen !== 'arrived') stopSim()
  }, [screen, stopSim])
  useEffect(() => {
    stopSim()
    // a new trip: "Simulate walk" opens the Walk view again
    walkPrefRef.current = true
  }, [route, stopSim])
  useEffect(() => () => simRef.current?.dispose(), [])

  // ------------------------------------------------------------------ bottom sheet snap (UI state, per sheet)
  const sheetKey = sheetKeyOf(state)
  const sheetKeyRef = useRef(sheetKey)
  sheetKeyRef.current = sheetKey
  const sheetSnap = state.sheet.key === sheetKey && state.sheet.snap ? state.sheet.snap : defaultSnap(screen, { filtered: Boolean(state.tile || state.category) })
  const setSheetSnap = useCallback((snap) => {
    dispatch({ type: 'patch', patch: { sheet: { key: sheetKeyRef.current, snap } } })
  }, [])
  /** The settled sheet's visible rect ({ top, height, snap, heights, ... }, app px), reported by Sheet.jsx. */
  const sheetLayoutRef = useRef(null)
  /** Last settled snap per sheet: a fold / unfold of the same sheet re-frames the map in the new free area. */
  const lastSnapRef = useRef({ key: null, snap: null })
  const refitAfterSnapRef = useRef(null)
  const onSheetLayout = useCallback((layout) => {
    sheetLayoutRef.current = layout
    layoutRef.current?.()
    const key = sheetKeyRef.current
    const prev = lastSnapRef.current
    const snap = layout?.snap ?? null
    lastSnapRef.current = { key, snap }
    // only a snap change of the sheet already up (the screen's own framing handles a new sheet), after the new
    // padding has reached the engine above: shifting the view alone would leave the step / model under the sheet
    if (prev.key === key && prev.snap != null && snap != null && prev.snap !== snap) refitAfterSnapRef.current?.()
  }, [])
  /** Highest top edge of a sheet at full: under the header (in the Walk view: under the HUD's top row). */
  const sheetTopLimit = useCallback(() => {
    const header = topRef.current?.querySelector('.header')
    const r = header?.getBoundingClientRect()
    if (r && r.height > 0) return Math.round(r.bottom + 8)
    return Math.round(walkLayoutRef.current?.padding?.top ?? 88)
  }, [])
  const sheetCtx = useMemo(
    () => ({ snap: sheetSnap, setSnap: setSheetSnap, lang, topLimit: sheetTopLimit, onLayout: onSheetLayout }),
    [sheetSnap, setSheetSnap, lang, sheetTopLimit, onSheetLayout],
  )

  // ------------------------------------------------------------------ viewport padding (free map area) + UI obstacles
  // the floating "Walk view" pill (navigate, map views): DESIGN-GLASS 7.5
  const walkPill = Boolean(index && route && screen === 'navigate' && view.mode !== 'fpv' && !state.no3d)
  /** last values sent to the engine: it renders a frame on every call, so only real changes are sent (idle = 0 frames) */
  const sentRef = useRef({ padding: '', obstacles: '' })
  useLayoutEffect(() => {
    if (!index) return undefined
    const sendPadding = (p) => {
      const v = { top: Math.round(p.top), right: Math.round(p.right), bottom: Math.round(p.bottom), left: Math.round(p.left) }
      const key = JSON.stringify(v)
      if (key === sentRef.current.padding) return
      sentRef.current.padding = key
      engine.setViewportPadding(v)
    }
    const sendObstacles = (rects) => {
      const v = rects.map((r) => ({ ...r, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }))
      const key = JSON.stringify(v)
      if (key === sentRef.current.obstacles) return
      sentRef.current.obstacles = key
      engine.setScreenObstacles(v)
    }
    const update = () => {
      const s = stateRef.current
      const fpv = s.view.mode === 'fpv'
      const wl = fpv ? walkLayoutRef.current : null
      const sheet = sheetRef.current
      if (fpv && !sheet) {
        // Walk view: the HUD measures the free area between its top column and the dome (WalkHud onLayout)
        if (wl) {
          sendPadding(wl.padding)
          sendObstacles(wl.obstacles)
        }
        return
      }
      const top = topRef.current
      const header = top?.querySelector('.header')
      const appEl = document.querySelector('.app')
      const appH = appEl?.clientHeight ?? window.innerHeight
      // the sheet's settled visible rect (Sheet.jsx onLayout; while it moves its box is taller and slid down)
      const sl = sheet ? sheetLayoutRef.current : null
      const sheetRect = sheet ? { left: sheet.offsetLeft, top: sl ? sl.top : sheet.offsetTop, width: sheet.offsetWidth, height: sl ? sl.height : sheet.offsetHeight } : null
      document.documentElement.style.setProperty('--sheet-top', `${Math.round(sheetRect ? sheetRect.top : appH * 0.7)}px`)
      const levels = top?.querySelector('.levels')
      const ctrls = top?.querySelector('.map-ctrls')
      const pill = document.querySelector('.walk-pill')
      const pillRect = pill?.getBoundingClientRect()
      // a sheet pulled up over the map controls (full) hides them: they never draw on the sheet
      if (ctrls) {
        const vc = ctrls.querySelector('.view-ctrl')?.getBoundingClientRect()
        ctrls.classList.toggle('ctrls-covered', Boolean(sheetRect && vc && vc.height > 0 && sheetRect.top < vc.bottom + 8))
      }
      // Arrived on a map: the shop's sign must read whole, so the free area starts under the View control too (on a
      // 360 px phone the wide sign otherwise frames behind it; the level picker is an obstacle below). The same when
      // the strip between the header and a pulled-up sheet is short: the model is framed under the View control, not
      // behind it
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0
      const shortStrip = Boolean(sheetRect) && sheetRect.top - headerBottom < 300
      const vcR = !fpv && (s.screen === 'arrived' || shortStrip) && !ctrls?.classList.contains('ctrls-covered') ? top?.querySelector('.view-ctrl')?.getBoundingClientRect() : null
      // (Arrived in the Walk view: the HUD's SIMULATION row on top, the Arrived sheet at the bottom)
      const topPx = fpv ? (wl?.padding.top ?? 0) : header ? Math.max(headerBottom, vcR && vcR.height > 0 ? vcR.bottom : 0) + 8 : 0
      // sheets float 12 px above the bottom edge: everything below the sheet's top is taken
      const bottomPx = sheetRect ? appH - sheetRect.top + 8 : 0
      // the level picker never runs under the sheet (nor the Walk view pill below it): compact buttons, then scrolling,
      // and none at all when not even one level fits (the sheet is at full). The cap is a whole number of buttons (no
      // half-cut level); MapControls keeps the active level in view (and scrolls snap to whole buttons). The classes go
      // on the wrapper: React owns the picker's own className (its "more above / below" state)
      if (levels) {
        const wrap = levels.parentElement
        // (viewport coordinates: the app is fixed to the viewport; 8 px clear of the sheet)
        const floor = Math.min(sheetRect ? sheetRect.top : window.innerHeight, pillRect && pillRect.height > 0 ? pillRect.top - 4 : Infinity)
        const lt = levels.getBoundingClientRect().top
        const frame = levels.offsetHeight - levels.clientHeight
        const room = Math.floor(floor - lt - 8 - frame)
        const count = levels.querySelectorAll('.level-btn').length
        const compact = count * LEVEL_BTN_PX > room
        const bh = compact ? LEVEL_BTN_COMPACT_PX : LEVEL_BTN_PX
        const n = Math.floor(room / bh)
        wrap?.classList.toggle('levels-compact', compact)
        wrap?.classList.toggle('levels-hidden', n < 1)
        // one or two levels show: no edge fades (the active level would sit in one), the chevrons alone say "more"
        wrap?.classList.toggle('levels-few', n <= 2 && n < count)
        const cap = `${Math.max(1, Math.min(n, count)) * bh + frame}px`
        if (levels.style.maxHeight !== cap) levels.style.maxHeight = cap
      }
      const rtl = document.documentElement.dir === 'rtl'
      const host = document.querySelector('.map-layer')?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth }
      // the level picker's column at the end edge (measured: wider screens centre the controls)
      const lr = levels && !levels.parentElement?.classList.contains('levels-hidden') ? levels.getBoundingClientRect() : null
      const side = lr && lr.width > 0 ? Math.round(rtl ? lr.right - host.left + 8 : host.right - lr.left + 8) : 0
      // fits frame the area between the header, the picker and the sheet; key points inside it are also kept
      // clear of the View control and the picker by the engine (clearOfUi), using the obstacles below
      sendPadding({ top: topPx, bottom: bottomPx, left: rtl ? Math.max(side, 0) : 0, right: rtl ? 0 : Math.max(side, 0) })
      // screen areas covered by UI: labels and pins on the map keep out of them; the sheet's rect is tagged so the
      // engine also culls everything below its top edge (nothing draws under or below the sheet)
      const appRect = appEl?.getBoundingClientRect() ?? { left: 0, top: 0 }
      const rects = wl ? [...wl.obstacles] : []
      const add = (el) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) rects.push({ x: r.left - host.left - 4, y: r.top - host.top - 4, w: r.width + 8, h: r.height + 8 })
      }
      add(header)
      if (!ctrls?.classList.contains('ctrls-covered')) {
        add(top?.querySelector('.view-ctrl'))
        if (lr) add(levels)
      }
      add(pill)
      if (sheetRect) rects.push({ x: appRect.left + sheetRect.left - host.left, y: appRect.top + sheetRect.top - host.top - 6, w: sheetRect.width, h: sheetRect.height + 6, kind: 'sheet' })
      sendObstacles(rects)
    }
    layoutRef.current = update
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(update)
    if (topRef.current) ro.observe(topRef.current)
    if (sheetRef.current) ro.observe(sheetRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [index, screen, state.carStage, state.plateId, lang, state.sim.active, state.no3d, view.mode, walkPill])

  /** The Walk view HUD reports its layout (free area + obstacles); the App forwards it to the engine. */
  const onWalkLayout = useCallback((layout) => {
    walkLayoutRef.current = layout
    layoutRef.current?.()
  }, [])
  // the engine's anchors drive the turn bubble and the mini-map (stable functions: one subscription each)
  const onAnchors = useCallback((cb) => engine.onAnchors(cb), [])
  const getAnchors = useCallback(() => engine.getAnchors(), [])
  // fetch the Walk view chunk while the shopper reads the first step, so the HUD is there when the walk starts
  useEffect(() => {
    if (screen === 'navigate' && !state.no3d) loadWalkHud().catch(() => {})
  }, [screen, state.no3d])

  // ------------------------------------------------------------------ camera per screen
  useEffect(() => {
    if (!index) return
    let s = stateRef.current
    const r = routeRef.current
    if (s.view.mode === 'fpv' && screen !== 'navigate' && screen !== 'arrived') {
      // the Walk view belongs to a trip: any other screen rises back to the map view it came from
      const mode = mapModeRef.current === 'fpv' ? 'floor' : mapModeRef.current
      setViewState({ mode })
      engine.setView({ mode, levelId: s.view.levelId, fit: 'none' })
      s = stateRef.current
    }
    switch (screen) {
      case 'home': {
        if (s.you) goView(s.view.mode, s.you.levelId, 'level')
        break
      }
      case 'scan': {
        // the plates to tap are pins on one floor: the floor you are on (Floor view, or 2D if picked)
        const level = s.you?.levelId ?? s.view.levelId
        if (level) goView(s.view.mode === 'top' ? 'top' : 'floor', level, 'level')
        break
      }
      case 'place': {
        if (!r) break
        const destLevel = r.points[r.points.length - 1].levelId
        goView(s.view.mode === 'top' ? 'top' : 'floor', destLevel, 'route')
        break
      }
      case 'navigate': {
        if (!r) break
        const pending = pendingRef.current
        pendingRef.current = { step: null, simT: null, play: false }
        let i = Math.min(stateRef.current.stepIndex, r.steps.length - 1)
        if (pending.step === 'connector') i = Math.max(0, r.steps.findIndex((st) => st.kind === 'connector'))
        else if (pending.step != null) i = Math.min(pending.step, r.steps.length - 1)
        if (pending.simT != null) {
          const sim = ensureSim()
          // walk up to that time in 1 s steps, as playback would, so the engine's walked distance follows the walker;
          // "Now on Level 1" only when the deep link lands within the toast's time after stepping off
          const T = Math.max(0, pending.simT)
          let changedAt = -Infinity
          let lvl = sim.getState().levelId
          simMeta.current.silent = true
          for (let k = 0; k <= T; k += 1) {
            const sk = sim.seekTime(Math.min(k, T))
            if (sk.levelId !== lvl && !sk.onConnector) {
              lvl = sk.levelId
              changedAt = Math.min(k, T)
            }
          }
          simMeta.current.silent = false
          const st = sim.seekTime(T)
          // (a deep link keeps it a little longer: the 3D scene is still being built when the page opens)
          if (T - changedAt <= TOAST_MS / 1000) showToast(st.levelId, TOAST_MS + 6000)
          const mode = s.view.mode === 'stack' ? 'floor' : s.view.mode
          setViewState({ mode, levelId: st.levelId })
          dispatch({
            type: 'sim',
            patch: { active: true, playing: false, done: st.done, distanceDoneM: st.distanceDoneM, phase: st.phase, connectorType: st.connectorType, onConnector: st.onConnector, rideProgress: st.rideProgress ?? 0 },
          })
          engine.setView({ mode, levelId: st.levelId, fit: 'none' }, { durationMs: 0 })
          // (the Walk view stands on the walker by itself)
          if (mode !== 'fpv') engine.flyTo({ levelId: st.levelId, x: st.x, y: st.y, headingDeg: st.headingDeg, ...FOLLOW }, 0)
          break
        }
        if (i !== stateRef.current.stepIndex) dispatch({ type: 'patch', patch: { stepIndex: i } })
        showStep(i, { initial: i === 0 })
        if (pending.play) setTimeout(() => playSim(), 300)
        break
      }
      case 'arrived': {
        if (!r) break
        const last = r.points[r.points.length - 1]
        const mode = s.view.mode === 'stack' ? 'floor' : s.view.mode
        engine.setFollow(false)
        setViewState({ mode, levelId: last.levelId })
        // the Walk view stays first-person: it faces the sign from the corridor (DESIGN-GLASS 6.3)
        if (mode !== 'fpv') engine.setView({ mode, levelId: last.levelId, fit: 'none' })
        frameArrival(1200)
        break
      }
      case 'car': {
        const mode = s.view.mode === 'stack' ? 'floor' : s.view.mode
        if (s.carStage === 'card' && s.car) {
          const bay = index.bayById.get(s.car.bayId)
          dispatch({ type: 'view', patch: { mode, levelId: bay.levelId } })
          engine.setView({ mode, levelId: bay.levelId, fit: 'none' })
          engine.flyTo({ levelId: bay.levelId, x: bay.center[0], y: bay.center[1], distance: 120, tiltDeg: 55, clear: [{ x: bay.center[0], y: bay.center[1], pin: true }] }, 1200)
        } else if (s.carStage === 'confirm' && s.plateId) {
          const plate = index.anchorById.get(s.plateId)
          dispatch({ type: 'view', patch: { mode, levelId: plate.levelId } })
          engine.setView({ mode, levelId: plate.levelId, fit: 'none' })
          engine.flyTo({ levelId: plate.levelId, x: plate.point[0], y: plate.point[1], distance: 100, tiltDeg: 55, clear: [{ x: plate.point[0], y: plate.point[1], pin: true }] }, 1200)
        } else {
          const parkingTop = [...index.levels].filter((l) => l.kind === 'parking').sort((a, b) => b.ordinal - a.ordinal)[0]?.id
          const level = isParkingLevel(index, s.view.levelId) ? s.view.levelId : parkingTop
          goView(mode, level, 'level')
        }
        break
      }
      default:
        break
    }
    if (typeof window !== 'undefined' && window.__dallni) window.__dallni.ready = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, screen, route, state.carStage, state.plateId])

  // ------------------------------------------------------------------ re-fit after a sheet snap
  refitAfterSnapRef.current = () => {
    const s = stateRef.current
    const r = routeRef.current
    // the shopper's own map choice, the Walk view and a playing walk (camera follows the walker) keep their camera
    if (!index || s.no3d || s.userView || s.view.mode === 'fpv' || s.sim.playing) return
    if (s.screen === 'arrived') {
      frameArrival(600)
      return
    }
    if (s.screen === 'navigate' && r) {
      if (s.view.mode === 'stack') engine.setView({ mode: 'stack', levelId: s.view.levelId, fit: 'route' })
      else engine.setActiveStep(s.stepIndex)
      return
    }
    if (ROUTE_SCREENS.has(s.screen) && r) {
      engine.setView({ mode: s.view.mode, levelId: s.view.levelId, fit: 'route' })
      return
    }
    if (s.screen === 'home') engine.setView({ mode: s.view.mode, levelId: s.view.levelId, fit: 'level' })
  }

  // ------------------------------------------------------------------ actions
  const toggleLang = () => patch({ lang: lang === 'ar' ? 'en' : 'ar' })

  const onViewMode = (mode) => {
    const s = stateRef.current
    const r = routeRef.current
    if (mode === 'fpv') {
      enterWalk()
      return
    }
    if (s.view.mode === 'fpv') {
      mapModeRef.current = mode
      leaveWalk()
      return
    }
    patch({ userView: true })
    if (s.screen === 'navigate' && r) {
      const level = simRef.current ? simRef.current.getState().levelId : stepLevelOf(r, s.stepIndex)
      setViewState({ mode, levelId: level })
      if (simRef.current && s.sim.playing && mode !== 'stack') {
        // back to Floor / 2D during a walk: the camera follows the walker again
        const st = simRef.current.getState()
        engine.setView({ mode, levelId: level, fit: 'none' })
        engine.flyTo({ levelId: st.levelId, x: st.x, y: st.y, headingDeg: st.headingDeg, ...FOLLOW }, 900)
        engine.setFollow(true)
        return
      }
      if (mode === 'stack') {
        engine.setFollow(false)
        engine.setView({ mode, levelId: level, fit: 'route' })
        return
      }
      engine.setView({ mode, levelId: level, fit: 'none' })
      engine.setActiveStep(s.stepIndex)
      return
    }
    if (ROUTE_SCREENS.has(s.screen) && r) {
      goView(mode, s.view.levelId, 'route')
      return
    }
    goView(mode, s.view.levelId ?? s.you?.levelId, 'level')
  }

  const onLevel = (levelId) => {
    const s = stateRef.current
    patch({ userView: true })
    if (s.sim.playing) pauseSim()
    const mode = s.view.mode === 'stack' ? 'floor' : s.view.mode
    goView(mode, levelId, ROUTE_SCREENS.has(s.screen) && routeRef.current ? 'route' : 'level')
  }

  const openPlace = (id, from = stateRef.current.screen) => {
    patch({ targetId: id, screen: 'place', returnTo: from === 'search' ? 'search' : 'home', stepIndex: 0, userView: false })
  }

  const goStep = (i) => {
    const r = routeRef.current
    const s = stateRef.current
    if (!r) return
    if (i >= r.steps.length) {
      if (simRef.current?.isPlaying()) pauseSim()
      patch({ screen: 'arrived' })
      return
    }
    const k = Math.max(0, i)
    const prevLevel = stepLevelOf(r, s.stepIndex)
    const nextLevel = stepLevelOf(r, k)
    patch({ stepIndex: k })
    if (simRef.current) {
      simMeta.current.step = k
      simRef.current.seekStep(k)
      engine.setActiveStep(k)
      return
    }
    showStep(k)
    if (k > s.stepIndex && nextLevel !== prevLevel && r.steps[k].kind !== 'connector') showToast(nextLevel)
  }

  const onPick = useCallback((hit) => {
    const s = stateRef.current
    const idx = indexRef.current
    if (!idx || !hit) return
    if (s.screen === 'scan' && hit.type === 'anchor') {
      patch({ you: youFromAnchor(idx, hit.id), screen: s.returnTo === 'scan' ? 'home' : s.returnTo })
      return
    }
    if (s.screen === 'car' && s.carStage !== 'card' && hit.type === 'anchor' && idx.anchorById.get(hit.id)?.kind === 'parking_pillar') {
      patch({ plateId: hit.id, carStage: 'confirm' })
      return
    }
    if ((s.screen === 'home' || s.screen === 'search' || s.screen === 'place') && (hit.type === 'occupant' || hit.type === 'amenity')) {
      patch({ targetId: hit.id, screen: 'place', returnTo: s.screen === 'place' ? s.returnTo : s.screen, stepIndex: 0, userView: false })
    }
  }, [patch])

  useEffect(() => engine.onPick(onPick), [onPick])

  /** End the route at once, with a 5 s Undo (PLAN.md section 9: undo instead of "Are you sure?"). */
  const endRoute = () => {
    const s = stateRef.current
    undoRef.current = { targetId: s.targetId, stepIndex: s.stepIndex, stepFree: s.stepFree, returnTo: s.returnTo }
    stopSim()
    clearTimeout(undoTimer.current)
    patch({ screen: 'home', targetId: null, stepIndex: 0, undo: { key: Date.now() } })
    undoTimer.current = setTimeout(() => {
      undoRef.current = null
      patch({ undo: null })
    }, UNDO_MS)
  }

  const undoEndRoute = () => {
    const u = undoRef.current
    clearTimeout(undoTimer.current)
    undoRef.current = null
    if (!u) {
      patch({ undo: null })
      return
    }
    patch({ undo: null, screen: 'navigate', targetId: u.targetId, stepIndex: u.stepIndex, stepFree: u.stepFree, returnTo: u.returnTo, userView: false })
  }

  // any other screen change retires the undo offer
  useEffect(() => {
    if (screen !== 'home' && stateRef.current.undo) {
      clearTimeout(undoTimer.current)
      undoRef.current = null
      patch({ undo: null })
    }
  }, [screen, patch])

  const arriveAndStay = (next) => {
    const r = routeRef.current
    const s = stateRef.current
    const youNext = r && info ? youFromRouteEnd(r, info.name) : s.you
    stopSim()
    patch({ you: youNext, ...next })
  }

  // test hooks (CONTRACT.md): window.__dallni
  useEffect(() => {
    window.__dallni = {
      engine,
      ready: window.__dallni?.ready ?? false,
      getState: () => stateRef.current,
      setState: (partial) => dispatch({ type: 'patch', patch: partial }),
      get index() {
        return indexRef.current
      },
      get route() {
        return routeRef.current
      },
      get sim() {
        return simRef.current
      },
      /** Bottom sheet: snap the current sheet ('peek' | 'half' | 'full'); read its settled rect and snap heights. */
      setSheet: (snap) => {
        if (snap === 'peek' || snap === 'half' || snap === 'full') dispatch({ type: 'patch', patch: { sheet: { key: sheetKeyRef.current, snap } } })
      },
      getSheet: () => (sheetLayoutRef.current && sheetRef.current ? { ...sheetLayoutRef.current } : null),
    }
  }, [])

  // ------------------------------------------------------------------ render
  if (state.error) {
    return (
      <div className="app grid place-items-center p-6 text-center">
        <div className="flex flex-col gap-4 items-center max-w-sm">
          <p className="title">{t('app.loadError', lang)}</p>
          <p className="caption">{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
            {t('app.retry', lang)}
          </button>
        </div>
      </div>
    )
  }

  const pulse =
    index && you && !state.sim.active && view.mode !== 'stack' && view.levelId === you.levelId && (screen === 'home' || screen === 'scan' || screen === 'place')
      ? { levelId: you.levelId, x: you.x, y: you.y }
      : null
  const etaToCarS =
    index && you && car ? (travelTimesFrom(index, you.nodeId, { stepFree: state.stepFree }).get(index.bayById.get(car.bayId)?.nodeId)?.etaS ?? null) : null
  // v0.2 first-person Walk view (a SIMULATION inside the 3D model): the HUD replaces the header and the navigate sheet
  const walking = Boolean(index && route && view.mode === 'fpv' && (screen === 'navigate' || screen === 'arrived'))
  const carBay = index && car ? index.bayById.get(car.bayId) : null

  return (
    <div className="app">
      <MapView onError={(e) => patch({ no3d: e?.kind === 'load' ? 'load' : 'webgl' })} pulse={pulse} />
      {state.no3d ? (
        <div className="map-fallback" role="status">
          <p>{t(state.no3d === 'load' ? 'app.no3dLoad' : 'app.no3d', lang)}</p>
          {state.no3d === 'load' ? (
            <button type="button" className="btn btn-primary btn-block mt-3" onClick={() => location.reload()}>
              {t('app.retry', lang)}
            </button>
          ) : null}
        </div>
      ) : null}

      {walking ? (
        <Suspense fallback={null}>
          <WalkHud
            index={index}
            lang={lang}
            route={route}
            stepIndex={state.stepIndex}
            sim={state.sim}
            levelId={view.levelId}
            car={carBay ? { levelId: carBay.levelId, x: carBay.center[0], y: carBay.center[1] } : null}
            arrived={screen === 'arrived'}
            onAnchors={onAnchors}
            getAnchors={getAnchors}
            onEnd={endRoute}
            onPlay={playSim}
            onPause={pauseSim}
            onSpeed={setSpeed}
            onNext={() => goStep(state.stepIndex + 1)}
            onOpenMap={leaveWalk}
            onLayout={onWalkLayout}
            bubbleTopInset={state.toast ? 64 : 0}
          />
        </Suspense>
      ) : (
        <div className="top" ref={topRef}>
          <Header index={index} lang={lang} onToggleLang={toggleLang} />
          {index && screen !== 'search' && !state.no3d ? (
            <MapControls
              index={index}
              lang={lang}
              view={view}
              onView={onViewMode}
              onLevel={onLevel}
              routeLevelIds={ROUTE_SCREENS.has(screen) ? route?.levelIds : null}
              walkAvailable={Boolean(route && (screen === 'navigate' || screen === 'arrived'))}
            />
          ) : null}
        </div>
      )}

      {walkPill ? <WalkViewButton lang={lang} onClick={enterWalk} hidden={Boolean(state.toast)} /> : null}

      {state.toast && index ? (
        <div className="toast" role="status" key={state.toast.key}>
          <span className="level-chip" aria-hidden="true">
            <bdi dir="ltr">{levelButtonLabel(index, state.toast.levelId, lang)}</bdi>
          </span>
          <span>{t('nav.nowOn', lang, { level: levelName(index, state.toast.levelId, lang) })}</span>
        </div>
      ) : null}

      {state.undo && index && screen === 'home' ? (
        <div className="toast toast-undo" role="status" key={state.undo.key}>
          <span className="flex-1 min-w-0">{t('nav.ended', lang)}</span>
          <button type="button" className="undo-btn" onClick={undoEndRoute}>
            {t('common.undo', lang)}
          </button>
        </div>
      ) : null}

      <SheetContext.Provider value={sheetCtx}>
      {!index ? (
        <section className="sheet" aria-busy="true">
          <div className="sheet-handle" />
          <p className="subtitle py-6 text-center">{t('app.loading', lang)}</p>
        </section>
      ) : null}

      {index && screen === 'home' ? (
        <HomeScreen
          ref={sheetRef}
          index={index}
          lang={lang}
          you={you}
          car={car}
          onScan={() => patch({ screen: 'scan', returnTo: 'home' })}
          onSearchFocus={() => patch({ screen: 'search', tile: null, category: null })}
          onTile={(id) => patch({ screen: 'search', tile: id, category: null, query: '' })}
          onCar={() => patch({ screen: 'car', carStage: car ? 'card' : 'scan', plateId: null })}
        />
      ) : null}

      {index && screen === 'search' ? (
        <SearchScreen
          ref={sheetRef}
          index={index}
          lang={lang}
          search={searchRef.current}
          you={you}
          stepFree={state.stepFree}
          query={state.query}
          tile={state.tile}
          category={state.category}
          onQuery={(q) => patch({ query: q })}
          onTile={(id) => patch({ tile: id, category: null, query: '' })}
          onCategory={(c) => patch({ category: c, tile: null })}
          onPick={(id) => openPlace(id, 'search')}
          onCar={() => patch({ screen: 'car', carStage: car ? 'card' : 'scan', plateId: null })}
          onBack={() => {
            const s = stateRef.current
            if (s.tile || s.category) patch({ tile: null, category: null })
            else patch({ screen: 'home', query: '' })
          }}
        />
      ) : null}

      {index && screen === 'place' ? (
        <PlaceScreen
          ref={sheetRef}
          index={index}
          lang={lang}
          info={info}
          route={route}
          you={you}
          stepFree={state.stepFree}
          onToggleStepFree={() => patch({ stepFree: !state.stepFree })}
          onGo={() => patch({ screen: 'navigate', stepIndex: 0, userView: false })}
          onBack={() => patch({ screen: state.returnTo, targetId: state.returnTo === 'search' ? state.targetId : null })}
        />
      ) : null}

      {index && screen === 'navigate' && route && !walking ? (
        <NavigateScreen
          ref={sheetRef}
          lang={lang}
          route={route}
          stepIndex={state.stepIndex}
          sim={state.sim}
          onNext={() => goStep(state.stepIndex + 1)}
          onPrev={() => goStep(state.stepIndex - 1)}
          onEnd={endRoute}
          onPlay={playSim}
          onPause={pauseSim}
          onSpeed={setSpeed}
        />
      ) : null}

      {index && screen === 'arrived' ? (
        <ArrivedScreen
          ref={sheetRef}
          index={index}
          lang={lang}
          info={info}
          simulated
          hasCar={Boolean(car) && info?.type !== 'bay'}
          onFound={() => arriveAndStay({ screen: 'home', targetId: null, stepIndex: 0 })}
          onBackToCar={() => arriveAndStay({ screen: 'navigate', targetId: car.bayId, stepIndex: 0, userView: false })}
          onAnother={() => arriveAndStay({ screen: 'search', targetId: null, stepIndex: 0, query: '', tile: null, category: null })}
        />
      ) : null}

      {index && screen === 'car' ? (
        <CarScreen
          ref={sheetRef}
          index={index}
          lang={lang}
          car={car}
          stage={state.carStage}
          plateId={state.plateId}
          you={you}
          etaToCarS={etaToCarS}
          stepFree={state.stepFree}
          onPickPlate={(id) => patch({ plateId: id, carStage: 'confirm' })}
          onSave={(plateId) => {
            const bay = bayForPlate(index, plateId)
            if (bay) patch({ car: { bayId: bay.id, savedAt: Date.now(), plateId }, carStage: 'card' })
          }}
          onRescan={() => patch({ carStage: 'scan', plateId: null })}
          onTakeMeThere={() => patch({ targetId: car.bayId, screen: 'navigate', stepIndex: 0, userView: false })}
          onForget={() => patch({ car: null, carStage: 'scan' })}
          onToggleStepFree={() => patch({ stepFree: !state.stepFree })}
          onBack={() => patch({ screen: 'home' })}
        />
      ) : null}

      {index && screen === 'scan' ? (
        <ScanSheet
          ref={sheetRef}
          index={index}
          lang={lang}
          you={you}
          onPick={(id) => patch({ you: youFromAnchor(index, id), screen: state.returnTo === 'scan' ? 'home' : state.returnTo })}
          onBack={() => patch({ screen: state.returnTo === 'scan' ? 'home' : state.returnTo })}
        />
      ) : null}
      </SheetContext.Provider>

      <span className="sr-only" aria-live="polite">
        {index && you ? t('home.youAreHere', lang, { place: pick(you.label, lang) }) : ''}
      </span>
    </div>
  )
}
