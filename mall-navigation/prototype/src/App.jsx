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
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { engine, loadEngine } from './engineHost.js'
import { loadVenue } from './data/venue.js'
import { findRouteToTarget, resolveTarget, travelTimesFrom } from './routing/route.js'
import { createSearch } from './search/search.js'
import { createSimulator } from './sim/simulator.js'
import { dirFor, t } from './i18n/strings.js'
import { Header } from './ui/Header.jsx'
import { MapControls } from './ui/MapControls.jsx'
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

const VENUE_URL = `${import.meta.env.BASE_URL}venues/demo-muscat/venue.json`
/** Camera while following the simulated walker: about 35 m of route visible above the step card. */
const FOLLOW = { distance: 115, tiltDeg: 52 }
const TOAST_MS = 3200
/** How long "Route ended · Undo" stays (PLAN.md section 9: undo instead of "Are you sure?"). */
const UNDO_MS = 5000
const ROUTE_SCREENS = new Set(['place', 'navigate', 'arrived'])

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

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL, (s) => ({ ...s, lang: initialLang(readUrlParams().lang) }))
  const stateRef = useRef(state)
  stateRef.current = state
  const indexRef = useRef(null)
  const searchRef = useRef(null)
  const pendingRef = useRef({ step: null, simT: null, play: false })
  const simRef = useRef(null)
  const simMeta = useRef({ step: -1, level: null, lastUi: 0, doneTimer: 0, phase: null })
  const topRef = useRef(null)
  const sheetRef = useRef(null)
  const shownRouteRef = useRef(undefined)
  const toastTimer = useRef(0)
  const undoTimer = useRef(0)
  const undoRef = useRef(null)

  const patch = useCallback((p) => dispatch({ type: 'patch', patch: p }), [])
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
        pendingRef.current = { step: p.step, simT: p.simT, play: p.play }
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
            tile: p.tile && ['food', 'restrooms', 'prayer', 'pharmacy', 'kids', 'exit'].includes(p.tile) ? p.tile : null,
            view: { mode: p.view ?? defaultMode, levelId },
            userView: Boolean(p.view),
            carStage: carNow ? 'card' : 'scan',
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'basement' ? '#0B0F14' : '#FFFFFF')
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

  // QR plate pins while a scan sheet asks the shopper to tap the plate in front of them
  const scanPins = screen === 'scan' ? true : screen === 'car' && state.carStage !== 'card' ? ['parking_pillar'] : null
  const scanKey = Array.isArray(scanPins) ? scanPins.join(',') : String(scanPins)
  useEffect(() => {
    if (!index) return
    engine.setScanPins(scanPins)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, scanKey])

  // ------------------------------------------------------------------ toasts ("Now on Level 1")
  const showToast = useCallback((levelId) => {
    const idx = indexRef.current
    if (!idx) return
    clearTimeout(toastTimer.current)
    patch({ toast: { levelId, key: Date.now() } })
    toastTimer.current = setTimeout(() => patch({ toast: null }), TOAST_MS)
  }, [patch])
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(undoTimer.current)
    },
    [],
  )

  // ------------------------------------------------------------------ camera helpers
  const goView = useCallback((mode, levelId, fit = 'level', opts) => {
    dispatch({ type: 'view', patch: { mode, levelId } })
    engine.setView({ mode, levelId, fit }, opts)
  }, [])

  /** Show one navigation step: highlight it and fly the camera (route-up). */
  const showStep = useCallback((i, { initial = false } = {}) => {
    const r = routeRef.current
    const s = stateRef.current
    if (!r) return
    const step = r.steps[i]
    if (!step) return
    const level = stepLevelOf(r, i)
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
      dispatch({ type: 'view', patch: { mode, levelId: level } })
      engine.setView({ mode, levelId: level, fit: 'none' })
    }
    engine.setActiveStep(i)
  }, [goView])

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
    engine.setMarker('walker', walkerValue(s))
    const playing = Boolean(sim?.isPlaying())
    const stacked = stateRef.current.view.mode === 'stack'
    if (s.stepIndex !== meta.step) {
      meta.step = s.stepIndex
      engine.setActiveStep(s.stepIndex, { fly: false })
      // the follow camera re-frames on a new step; the Overview keeps its own framing
      if (playing && !stacked) engine.flyTo({ levelId: s.levelId, x: s.x, y: s.y, headingDeg: s.headingDeg, ...FOLLOW }, 900)
      dispatch({ type: 'patch', patch: { stepIndex: s.stepIndex } })
    }
    // a new floor is announced when the shopper steps off the lift / escalator / stairs, not while riding
    if (s.levelId !== meta.level && !s.onConnector) {
      const prev = meta.level
      meta.level = s.levelId
      dispatch({ type: 'view', patch: { levelId: s.levelId } })
      if (prev) showToast(s.levelId)
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
      meta.doneTimer = setTimeout(() => {
        meta.doneTimer = 0
        engine.setFollow(false)
        if (stateRef.current.screen === 'navigate') dispatch({ type: 'patch', patch: { screen: 'arrived' } })
      }, 900)
    }
  }, [showToast])

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
    const fresh = !simRef.current
    const sim = ensureSim()
    if (fresh) sim.seekStep(stateRef.current.stepIndex)
    if (sim.getState().done) {
      simMeta.current.step = 0
      sim.seekStep(0)
      dispatch({ type: 'patch', patch: { stepIndex: 0 } })
    }
    const s = sim.getState()
    const v = stateRef.current.view
    const mode = v.mode === 'stack' ? 'floor' : v.mode
    dispatch({ type: 'view', patch: { mode, levelId: s.levelId } })
    engine.setView({ mode, levelId: s.levelId, fit: 'none' })
    engine.flyTo({ levelId: s.levelId, x: s.x, y: s.y, headingDeg: s.headingDeg, ...FOLLOW }, 1000)
    engine.setFollow(true)
    dispatch({ type: 'sim', patch: { active: true, playing: true, done: false } })
    sim.play()
  }, [ensureSim])

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
  }, [route, stopSim])
  useEffect(() => () => simRef.current?.dispose(), [])

  // ------------------------------------------------------------------ viewport padding (free map area) + UI obstacles
  useLayoutEffect(() => {
    if (!index) return undefined
    const update = () => {
      const top = topRef.current
      const header = top?.querySelector('.header')
      const topPx = header ? header.getBoundingClientRect().bottom + 8 : 0
      const sheet = sheetRef.current
      // layout box of the sheet (offset*, not getBoundingClientRect: the sheet slides in with a transform)
      const sheetRect = sheet ? { left: sheet.offsetLeft, top: sheet.offsetTop, width: sheet.offsetWidth, height: sheet.offsetHeight } : null
      const bottomPx = sheet ? sheet.offsetHeight + 8 : 0
      const levels = top?.querySelector('.levels')
      // the level picker never runs under the sheet: compact buttons, then scrolling inside the space above it
      if (levels) {
        // (viewport coordinates: the app is fixed to the viewport; 16 px left for the "more levels" chevron)
        const room = Math.floor((sheetRect ? sheetRect.top : window.innerHeight) - levels.getBoundingClientRect().top - 16)
        levels.classList.toggle('levels-compact', room < 226)
        levels.style.maxHeight = `${Math.max(104, room)}px`
      }
      document.documentElement.style.setProperty('--sheet-top', `${Math.round(sheetRect ? sheetRect.top : window.innerHeight * 0.7)}px`)
      const rtl = document.documentElement.dir === 'rtl'
      const host = document.querySelector('.map-layer')?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth }
      // the level picker's column at the end edge (measured: wider screens centre the controls)
      const lr = levels?.getBoundingClientRect()
      const side = lr && lr.width > 0 ? Math.round(rtl ? lr.right - host.left + 8 : host.right - lr.left + 8) : 0
      // fits frame the area between the header, the picker and the sheet; key points inside it are also kept
      // clear of the View control and the picker by the engine (clearOfUi), using the obstacles below
      engine.setViewportPadding({ top: topPx, bottom: bottomPx, left: rtl ? Math.max(side, 0) : 0, right: rtl ? 0 : Math.max(side, 0) })
      // screen areas covered by UI: labels and pins on the map keep out of them
      const appRect = document.querySelector('.app')?.getBoundingClientRect() ?? { left: 0, top: 0 }
      const rects = []
      const add = (el) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) rects.push({ x: r.left - host.left - 4, y: r.top - host.top - 4, w: r.width + 8, h: r.height + 8 })
      }
      add(header)
      add(top?.querySelector('.view-ctrl'))
      add(levels)
      if (sheetRect) rects.push({ x: appRect.left + sheetRect.left - host.left, y: appRect.top + sheetRect.top - host.top - 6, w: sheetRect.width, h: sheetRect.height + 6 })
      engine.setScreenObstacles(rects)
    }
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
  }, [index, screen, state.carStage, state.plateId, lang, state.sim.active, state.no3d])

  // ------------------------------------------------------------------ camera per screen
  useEffect(() => {
    if (!index) return
    const s = stateRef.current
    const r = routeRef.current
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
          const st = sim.seekTime(pending.simT)
          const mode = s.view.mode === 'stack' ? 'floor' : s.view.mode
          dispatch({ type: 'view', patch: { mode, levelId: st.levelId } })
          dispatch({ type: 'sim', patch: { active: true, playing: false, done: st.done, distanceDoneM: st.distanceDoneM, phase: st.phase, connectorType: st.connectorType } })
          engine.setView({ mode, levelId: st.levelId, fit: 'none' }, { durationMs: 0 })
          engine.flyTo({ levelId: st.levelId, x: st.x, y: st.y, headingDeg: st.headingDeg, ...FOLLOW }, 0)
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
        dispatch({ type: 'view', patch: { mode, levelId: last.levelId } })
        engine.setView({ mode, levelId: last.levelId, fit: 'none' })
        const target = s.targetId ? resolveTarget(index, s.targetId) : null
        if (target?.type === 'bay') {
          // at the car: look into its bay from the aisle, the painted code upright and in front of the car
          const bay = index.bayById.get(s.targetId)
          engine.flyToBay({ levelId: bay.levelId, x: bay.center[0], y: bay.center[1], angleDeg: bay.angleDeg, w: bay.w, l: bay.l }, 1200)
        } else {
          // at a shop: face its front, close enough to read the sign (PLAN.md 19.2 arrival)
          engine.flyToShopFront({ levelId: last.levelId, x: last.x, y: last.y }, 1200)
        }
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

  // ------------------------------------------------------------------ actions
  const toggleLang = () => patch({ lang: lang === 'ar' ? 'en' : 'ar' })

  const onViewMode = (mode) => {
    const s = stateRef.current
    const r = routeRef.current
    patch({ userView: true })
    if (s.screen === 'navigate' && r) {
      const level = simRef.current ? simRef.current.getState().levelId : stepLevelOf(r, s.stepIndex)
      dispatch({ type: 'view', patch: { mode, levelId: level } })
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
          />
        ) : null}
      </div>

      {state.toast && index ? (
        <div className="toast" role="status" key={state.toast.key}>
          <span className="level-chip">{levelButtonLabel(index, state.toast.levelId, lang)}</span>
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

      {index && screen === 'navigate' && route ? (
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

      <span className="sr-only" aria-live="polite">
        {index && you ? t('home.youAreHere', lang, { place: pick(you.label, lang) }) : ''}
      </span>
    </div>
  )
}
