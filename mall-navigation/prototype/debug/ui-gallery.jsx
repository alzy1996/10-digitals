/**
 * Dev-only gallery for the v0.2 Walk view HUD and the glass screens (DESIGN-GLASS.md), with real venue data and a
 * stand-in first-person scene drawn in Canvas2D (the real one is the 3D engine's). Not part of the app build.
 *
 *   /debug/ui-gallery.html?scene=hud&lang=en&route=car&step=5&into=3     the full Walk view HUD at one moment
 *   &anchor=visible|near|edge-left|edge-right|behind                     where the next turn is on screen
 *   &ride=1                                                              mid lift ride (lift card)
 *   &play=1                                                              the walk playing (Pause on the bar)
 *   /debug/ui-gallery.html?scene=parts&lang=ar                            every component on its own
 *   /debug/ui-gallery.html?scene=arrived&lang=en                          Arrived in the Walk view
 *   /debug/ui-gallery.html?scene=controls&lang=en                         map view: View menu + "Walk view" pill
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import '../src/ui/app.css'
import { loadVenue } from '../src/data/venue.js'
import { findRouteToTarget } from '../src/routing/route.js'
import { buildSimPlan, simStateAt } from '../src/sim/simulator.js'
import { dirFor } from '../src/i18n/strings.js'
import { WalkHud } from '../src/ui/WalkHud.jsx'
import { StatChips } from '../src/ui/StatChips.jsx'
import { TurnCard } from '../src/ui/TurnCard.jsx'
import { SimulationTag } from '../src/ui/SimulationTag.jsx'
import { TurnBubble } from '../src/ui/TurnBubble.jsx'
import { MiniMapDome } from '../src/ui/MiniMapDome.jsx'
import { BottomBar } from '../src/ui/BottomBar.jsx'
import { LiftCard } from '../src/ui/LiftCard.jsx'
import { ArrivedScreen } from '../src/ui/ArrivedScreen.jsx'
import { NavigateScreen } from '../src/ui/NavigateScreen.jsx'
import { MapControls, WalkViewButton } from '../src/ui/MapControls.jsx'
import { bubbleContent, cumulativeM, standPoint, tripProgress } from '../src/ui/hudModel.js'
import { entityInfo } from '../src/ui/model.js'

const q = new URLSearchParams(location.search)
const SCENE = q.get('scene') ?? 'hud'
const LANG = q.get('lang') === 'ar' ? 'ar' : 'en'
// a fixed clock so shots are repeatable: 17:30 in Muscat
const NOW = Number(q.get('now')) || Date.UTC(2026, 9, 9, 13, 30, 0)
document.documentElement.lang = LANG
document.documentElement.dir = dirFor(LANG)
document.documentElement.dataset.theme = 'sunlight'

const gstyle = document.createElement('style')
gstyle.textContent = `
  html, body, #root { height: 100%; }
  body { margin: 0; background:
    radial-gradient(70% 38% at 64% 42%, rgba(255,159,85,0.50) 0%, rgba(214,112,60,0.22) 34%, rgba(20,28,33,0) 72%),
    radial-gradient(90% 50% at 18% 12%, rgba(126,140,152,0.30) 0%, rgba(126,140,152,0) 70%),
    linear-gradient(180deg, #121A1F 0%, #1D262C 22%, #2B2D2F 45%, #0A0F12 100%);
    background-size: 100% 844px; background-color: #0A0F12; }
  .g-stage { position: fixed; inset: 0; overflow: hidden; }
  .g-scroll { min-height: 100%; padding: 16px 12px 40px; display: flex; flex-direction: column; gap: 14px; }
  .g-label { font: 500 14px/20px "Readex Pro", system-ui; color: #C9D2DB; margin: 8px 4px -6px; letter-spacing: 0.02em; }
  .g-box { position: relative; border-radius: 20px; overflow: hidden; }
  .g-scene { position: absolute; inset: 0; width: 100%; height: 100%; }
`
document.head.appendChild(gstyle)

/** Sim time at which the walker is `into` metres into step `stepIndex` (or at `t` seconds). */
function simAt(route, index, { stepIndex = null, into = 0, t = null, ride = false }) {
  const plan = buildSimPlan(route, { index })
  if (t != null) return simStateAt(plan, t)
  if (ride) {
    for (let s = 0; s < 600; s += 0.25) {
      const st = simStateAt(plan, s)
      if (st.onConnector && st.phase === 'ride' && (st.connectorType === 'lift' || st.connectorType === 'stairs') && (st.rideProgress ?? 0) > 0.55) return st
    }
  }
  if (stepIndex != null) {
    const cum = cumulativeM(route)
    const target = cum[route.steps[stepIndex].from] + into
    for (let s = 0; s < 900; s += 0.1) {
      const st = simStateAt(plan, s)
      if (st.stepIndex >= stepIndex && st.distanceDoneM >= target - 0.05) return st
    }
  }
  return simStateAt(plan, 0)
}

function appSim(st, { playing = false } = {}) {
  return {
    active: true,
    playing,
    done: st.done,
    speed: 1,
    distanceDoneM: st.distanceDoneM,
    phase: st.phase,
    connectorType: st.connectorType,
    onConnector: st.onConnector,
    rideProgress: st.rideProgress ?? 0,
  }
}

/** A fake anchors source (the engine's onAnchors / getAnchors, CONTRACT 3b). */
function fakeAnchors(anchors) {
  return {
    onAnchors: (cb) => {
      const id = requestAnimationFrame(() => cb(anchors))
      return () => cancelAnimationFrame(id)
    },
    getAnchors: () => anchors,
  }
}

// ---------------------------------------------------------------- stand-in first-person scene (Canvas2D)
const EYE = 1.6
const PITCH = (-10 * Math.PI) / 180
const FOV = (70 * Math.PI) / 180

function makeCam(W, H, free) {
  const f = H / 2 / Math.tan(FOV / 2)
  const cx = W / 2
  const cy = (free.top + free.bottom) / 2
  const F = [0, Math.sin(PITCH), Math.cos(PITCH)]
  const U = [0, Math.cos(PITCH), -Math.sin(PITCH)]
  return (X, Y, Z) => {
    const yc = Y * U[1] + Z * U[2]
    const zc = Y * F[1] + Z * F[2]
    if (zc <= 0.05) return null
    return [cx + (f * X) / zc, cy - (f * yc) / zc, zc]
  }
}

/** Draw a corridor with storefronts, a ceiling with light panels, a glossy floor and the teal path to the turn. */
function drawScene(canvas, { W, H, free, turn, turnZ, ring }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const P = makeCam(W, H, free)
  const poly = (pts, fill) => {
    const s = pts.map((p) => P(...p))
    if (s.some((v) => !v)) return
    ctx.beginPath()
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }
  const FL = -EYE
  const CE = 4.6 - EYE
  const WALL = 3.5 - EYE
  const HW = 6
  const far = 90
  // ceiling, floor
  poly([[-HW, CE, 1], [HW, CE, 1], [HW, CE, far], [-HW, CE, far]], '#2B3239')
  const hz = P(0, 0, 1e4)
  const g = ctx.createLinearGradient(0, hz ? hz[1] : 280, 0, H)
  g.addColorStop(0, '#7F8A95')
  g.addColorStop(0.18, '#5B656F')
  g.addColorStop(1, '#3A424B')
  poly([[-HW, FL, 0.6], [HW, FL, 0.6], [HW, FL, far], [-HW, FL, far]], g)
  // far end: the storm sky through the entrance glass
  const fe = [P(-HW, FL, far), P(HW, CE, far)]
  if (fe[0] && fe[1]) {
    const sg = ctx.createLinearGradient(0, fe[1][1], 0, fe[0][1])
    sg.addColorStop(0, '#1D262C')
    sg.addColorStop(0.55, '#B47F5F')
    sg.addColorStop(1, '#2B2D2F')
    ctx.fillStyle = sg
    ctx.fillRect(fe[0][0], fe[1][1], fe[1][0] - fe[0][0], fe[0][1] - fe[1][1])
  }
  // walls: storefronts with category-coloured signs, bulkheads above
  const SIGNS = ['#9F3F19', '#8F1D52', '#5F2CB4', '#176C75', '#1C6F3E', '#774E2B', '#17667D', '#6A3AC3', '#9C2056']
  for (const side of [-1, 1]) {
    for (let k = 0; k < 12; k++) {
      const z0 = 2 + k * 7.5
      const z1 = z0 + 7.1
      if (side === Math.sign(turn) && z1 > turnZ - 3 && z0 < turnZ + 3) continue // the side corridor at the turn
      const x = side * HW
      poly([[x, FL, z0], [x, WALL, z0], [x, WALL, z1], [x, FL, z1]], '#5D666F')
      poly([[x, FL + 0.1, z0 + 0.3], [x, WALL - 0.9, z0 + 0.3], [x, WALL - 0.9, z1 - 0.3], [x, FL + 0.1, z1 - 0.3]], 'rgba(157,191,204,0.32)')
      poly([[x, WALL - 0.8, z0 + 0.6], [x, WALL - 0.1, z0 + 0.6], [x, WALL - 0.1, z1 - 0.6], [x, WALL - 0.8, z1 - 0.6]], SIGNS[(k * 2 + (side > 0 ? 1 : 0)) % SIGNS.length])
      poly([[x, WALL, z0], [x, CE, z0], [x, CE, z1], [x, WALL, z1]], '#454D56')
      poly([[x, WALL, z0], [x, WALL + 0.05, z0], [x, WALL + 0.05, z1], [x, WALL, z1]], '#D5DCE3')
    }
  }
  // ceiling light panels + their soft reflections on the floor
  for (let z = 3; z < far; z += 6) {
    for (const x of [-2.2, 2.2]) {
      poly([[x - 0.3, CE - 0.01, z], [x + 0.3, CE - 0.01, z], [x + 0.3, CE - 0.01, z + 2.4], [x - 0.3, CE - 0.01, z + 2.4]], '#EAF2F8')
      poly([[x - 0.35, FL + 0.002, z], [x + 0.35, FL + 0.002, z], [x + 0.35, FL + 0.002, z + 2.4], [x - 0.35, FL + 0.002, z + 2.4]], 'rgba(234,242,248,0.08)')
    }
  }
  // the glowing path: body, rims, glow, white chevrons, fading in from 1 to 5 m
  const seg = (x0, z0, x1, z1, w, fill) => {
    const dx = x1 - x0
    const dz = z1 - z0
    const l = Math.hypot(dx, dz) || 1
    const nx = (-dz / l) * w
    const nz = (dx / l) * w
    poly([[x0 + nx, FL + 0.03, z0 + nz], [x1 + nx, FL + 0.03, z1 + nz], [x1 - nx, FL + 0.03, z1 - nz], [x0 - nx, FL + 0.03, z0 - nz]], fill)
  }
  const fade = (z) => Math.min(1, Math.max(0, (z - 1) / 4))
  for (let z = 1; z < turnZ; z += 0.5) {
    const a = fade(z)
    seg(0, z, 0, z + 0.5, 1.05, `rgba(16,181,211,${0.18 * a})`)
    seg(0, z, 0, z + 0.5, 0.7, `rgba(94,242,220,${0.95 * a})`)
    seg(0, z, 0, z + 0.5, 0.62, `rgba(20,184,166,${0.62 * a + 0.2})`)
  }
  const tx = Math.sign(turn)
  for (let x = 0; Math.abs(x) < 14; x += tx * 0.5) {
    seg(x, turnZ, x + tx * 0.5, turnZ, 1.05, 'rgba(16,181,211,0.18)')
    seg(x, turnZ, x + tx * 0.5, turnZ, 0.7, 'rgba(94,242,220,0.9)')
    seg(x, turnZ, x + tx * 0.5, turnZ, 0.62, 'rgba(20,184,166,0.8)')
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let z = 3.4; z < turnZ - 1.5; z += 2.4) {
    const a = P(-0.45, FL + 0.035, z)
    const b = P(0, FL + 0.035, z + 0.26)
    const c = P(0.45, FL + 0.035, z)
    if (!a || !b || !c) continue
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.lineTo(c[0], c[1])
    ctx.strokeStyle = `rgba(255,255,255,${0.92 * fade(z)})`
    ctx.lineWidth = Math.max(1.5, (0.14 * (H / 2 / Math.tan(FOV / 2))) / b[2])
    ctx.stroke()
  }
  // target ring + beam at the turn
  if (ring) {
    const c0 = P(0, FL + 0.04, turnZ)
    if (c0) {
      for (const [r, wdt, col] of [[1.6, 0.5, 'rgba(16,181,211,0.18)'], [1.1, 0.08, '#5EF2DC'], [0.7, 0.03, 'rgba(94,242,220,0.45)'], [0.35, 0.03, 'rgba(94,242,220,0.45)']]) {
        ctx.beginPath()
        for (let k = 0; k <= 48; k++) {
          const th = (k / 48) * Math.PI * 2
          const p = P(Math.cos(th) * r, FL + 0.04, turnZ + Math.sin(th) * r)
          if (p) (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
        }
        ctx.strokeStyle = col
        ctx.lineWidth = Math.max(1, (wdt * 603) / c0[2])
        ctx.stroke()
      }
      const top = P(0, FL + 2.2, turnZ)
      const bg = ctx.createLinearGradient(0, c0[1], 0, top[1])
      bg.addColorStop(0, 'rgba(94,242,220,0.9)')
      bg.addColorStop(1, 'rgba(94,242,220,0)')
      ctx.fillStyle = bg
      ctx.fillRect(c0[0] - 1.5, top[1], 3, c0[1] - top[1])
    }
  }
}

function useVenue() {
  const [data, setData] = useState(null)
  useEffect(() => {
    loadVenue('/venues/demo-muscat/venue.json').then((index) => {
      const start = index.anchorById.get(index.venue.meta.defaultStartAnchorId).nodeId
      const kitchen = findRouteToTarget(index, start, 'occ-muttrah-kitchen')
      const toCar = findRouteToTarget(index, index.anchorById.get('A-L1-C3').nodeId, 'bay-B1-043', { stepFree: true })
      setData({ index, kitchen, toCar })
    })
  }, [])
  return data
}

const noop = () => {}

function HudScene({ data }) {
  const { index } = data
  const route = q.get('route') === 'kitchen' ? data.kitchen : data.toCar
  const ride = q.get('ride') === '1'
  const stepParam = q.get('step')
  const st = useMemo(
    () => simAt(route, index, { stepIndex: stepParam != null ? Number(stepParam) : route === data.toCar ? 5 : 3, into: Number(q.get('into') ?? 3), t: q.get('t') != null ? Number(q.get('t')) : null, ride }),
    [route, index, stepParam, ride, data.toCar],
  )
  const sim = appSim(st, { playing: q.get('play') === '1' })
  const canvasRef = useRef(null)
  const [layout, setLayout] = useState(null)
  const step = route.steps[st.stepIndex]
  const prog = tripProgress(route, st.stepIndex, sim)
  const turnZ = Math.max(6, Math.min(40, prog.stepLeftM))
  const turnSign = step.turn === 'left' || step.turn === 'slight_left' ? -1 : 1
  const mode = q.get('anchor') ?? (prog.stepLeftM < 6 ? 'near' : 'visible')
  const W = window.innerWidth
  const H = window.innerHeight
  const anchors = useMemo(() => {
    if (!layout) return null
    const P = makeCam(W, H, layout.free)
    const top = P(0, -EYE + 2.2, turnZ)
    const floor = P(0, -EYE + 0.05, turnZ)
    const base = { levelId: st.levelId, distanceM: prog.stepLeftM, floorX: floor?.[0] ?? null, floorY: floor?.[1] ?? null }
    let nextTurn = { ...base, x: top[0], y: top[1], visible: true, behind: false, relBearingDeg: 0 }
    if (mode === 'edge-left') nextTurn = { ...base, x: -80, y: 300, visible: false, behind: false, relBearingDeg: -64 }
    if (mode === 'edge-right') nextTurn = { ...base, x: W + 80, y: 300, visible: false, behind: false, relBearingDeg: 64 }
    if (mode === 'behind') nextTurn = { ...base, x: null, y: null, visible: false, behind: true, relBearingDeg: 170 }
    if (mode === 'near') nextTurn = { ...nextTurn, distanceM: 4 }
    return {
      frame: 1,
      mode: 'fpv',
      camera: { headingDeg: st.headingDeg, pitchDeg: -10, fovDeg: 70 },
      nextTurn,
      destination: null,
      walker: { x: null, y: null, visible: false, headingDeg: st.headingDeg, levelId: st.levelId, mapX: st.x, mapY: st.y },
    }
  }, [layout, W, H, turnZ, mode, st, prog.stepLeftM])
  const src = useMemo(() => (anchors ? fakeAnchors(anchors) : { onAnchors: undefined, getAnchors: undefined }), [anchors])

  useEffect(() => {
    if (!layout || !canvasRef.current) return
    drawScene(canvasRef.current, { W, H, free: layout.free, turn: turnSign, turnZ, ring: !ride })
  }, [layout, W, H, turnSign, turnZ, ride])

  const bay = data.index.bayById.get('bay-B1-043')
  return (
    <div className="g-stage map-layer">
      <canvas ref={canvasRef} className="g-scene" />
      <WalkHud
        index={index}
        lang={LANG}
        route={route}
        stepIndex={st.stepIndex}
        sim={sim}
        levelId={st.levelId}
        car={route === data.toCar ? { levelId: bay.levelId, x: bay.center[0], y: bay.center[1] } : null}
        nowMs={NOW}
        onAnchors={src.onAnchors}
        getAnchors={src.getAnchors}
        onEnd={noop}
        onPlay={noop}
        onPause={noop}
        onSpeed={noop}
        onNext={noop}
        onOpenMap={noop}
        onLayout={(l) => setLayout((prev) => (prev && JSON.stringify(prev.free) === JSON.stringify(l.free) ? prev : l))}
      />
    </div>
  )
}

function ArrivedScene({ data }) {
  const { index, kitchen } = data
  const info = entityInfo(index, 'occ-muttrah-kitchen')
  return (
    <div className="g-stage map-layer">
      <WalkHud index={index} lang={LANG} route={kitchen} stepIndex={kitchen.steps.length - 1} sim={{ active: false }} levelId="L1" arrived nowMs={NOW} onOpenMap={noop} />
      <ArrivedScreen index={index} lang={LANG} info={info} simulated hasCar onFound={noop} onBackToCar={noop} onAnother={noop} />
    </div>
  )
}

/** Map-view navigate screen with the v0.2 additions: the View menu's 4th row and the floating Walk view pill. */
function ControlsScene({ data }) {
  const { index, kitchen } = data
  const sheetRef = useRef(null)
  useEffect(() => {
    const set = () => sheetRef.current && document.documentElement.style.setProperty('--sheet-top', `${sheetRef.current.offsetTop}px`)
    set()
    const id = setTimeout(set, 400)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="app">
      <div className="map-layer" />
      <div className="top">
        <MapControls index={index} lang={LANG} view={{ mode: 'floor', levelId: 'G' }} onView={noop} onLevel={noop} routeLevelIds={kitchen.levelIds} walkAvailable />
      </div>
      <WalkViewButton lang={LANG} onClick={noop} />
      <NavigateScreen
        ref={sheetRef}
        lang={LANG}
        route={kitchen}
        stepIndex={1}
        sim={{ active: false, playing: false, done: false, speed: 1, distanceDoneM: 0 }}
        onNext={noop}
        onPrev={noop}
        onEnd={noop}
        onPlay={noop}
        onPause={noop}
        onSpeed={noop}
      />
    </div>
  )
}

function Box({ height, children, style }) {
  return (
    <div className="g-box" style={{ height, ...style }}>
      {children}
    </div>
  )
}

function PartsScene({ data }) {
  const { index, kitchen, toCar } = data
  const W = Math.min(window.innerWidth - 24, 560)
  const turnStep = 5
  const stTurn = simAt(toCar, index, { stepIndex: turnStep, into: 3 })
  const simTurn = appSim(stTurn)
  const pTurn = tripProgress(toCar, turnStep, simTurn)
  const liftStep = toCar.steps.findIndex((s) => s.kind === 'connector')
  const stRide = simAt(toCar, index, { ride: true })
  const lastK = kitchen.steps.length - 1
  const escK = kitchen.steps.findIndex((s) => s.kind === 'connector')
  const bubbleAt = (x, y, near = false) =>
    fakeAnchors({ frame: 1, mode: 'fpv', camera: { headingDeg: 0, pitchDeg: -10, fovDeg: 70 }, nextTurn: { x, y, visible: true, behind: false, relBearingDeg: 0, distanceM: near ? 3 : 20, levelId: 'L1' }, destination: null, walker: null })
  const edge = (rel, behind = false) =>
    fakeAnchors({ frame: 1, mode: 'fpv', camera: { headingDeg: 0, pitchDeg: -10, fovDeg: 70 }, nextTurn: { x: null, y: null, visible: false, behind, relBearingDeg: rel, distanceM: 20, levelId: 'L1' }, destination: null, walker: null })
  const a1 = bubbleAt(60, 112)
  const a2 = bubbleAt(W - 40, 112)
  const a3 = edge(70)
  const a4 = edge(-70)
  const a5 = edge(175, true)
  const stand = standPoint(toCar, turnStep)
  const bay = index.bayById.get('bay-B1-043')
  const sims = [
    { active: false, playing: false, done: false, speed: 1 },
    { active: true, playing: true, done: false, speed: 2 },
  ]
  return (
    <div className="g-scroll">
      <p className="g-label">StatChips</p>
      <StatChips lang={LANG} arrivalMs={NOW + pTurn.remainS * 1000} distanceLeftM={pTurn.remainM} />
      <p className="g-label">TurnCard · turn (towards a landmark)</p>
      <TurnCard index={index} lang={LANG} route={toCar} stepIndex={turnStep} distanceM={pTurn.stepLeftM} />
      <p className="g-label">TurnCard · lift (button to press) / escalator / arrive / start</p>
      <TurnCard index={index} lang={LANG} route={toCar} stepIndex={liftStep} distanceM={14} />
      <TurnCard index={index} lang={LANG} route={kitchen} stepIndex={escK} distanceM={42} />
      <TurnCard index={index} lang={LANG} route={kitchen} stepIndex={lastK} distanceM={8} />
      <TurnCard index={index} lang={LANG} route={kitchen} stepIndex={0} distanceM={0} />
      <p className="g-label">SimulationTag</p>
      <div style={{ display: 'flex' }}>
        <SimulationTag lang={LANG} />
      </div>
      <p className="g-label">TurnBubble · anchored (box toward the inline end) · flipped at the edge</p>
      <Box height={150} style={{ background: 'rgba(0,0,0,0.25)' }}>
        <TurnBubble lang={LANG} content={bubbleContent(index, toCar, turnStep, LANG)} onAnchors={a1.onAnchors} getAnchors={a1.getAnchors} free={{ top: 0, bottom: 150, left: 0, right: W }} />
      </Box>
      <Box height={150} style={{ background: 'rgba(0,0,0,0.25)' }}>
        <TurnBubble lang={LANG} content={bubbleContent(index, toCar, liftStep, LANG, { active: true, onConnector: true, phase: 'wait' })} onAnchors={a2.onAnchors} getAnchors={a2.getAnchors} free={{ top: 0, bottom: 150, left: 0, right: W }} />
      </Box>
      <p className="g-label">TurnBubble · off screen right / left / behind</p>
      <Box height={64} style={{ background: 'rgba(0,0,0,0.25)' }}>
        <TurnBubble lang={LANG} content={bubbleContent(index, toCar, turnStep, LANG)} onAnchors={a3.onAnchors} getAnchors={a3.getAnchors} free={{ top: 0, bottom: 64, left: 0, right: W }} />
        <TurnBubble lang={LANG} content={bubbleContent(index, toCar, turnStep, LANG)} onAnchors={a4.onAnchors} getAnchors={a4.getAnchors} free={{ top: 0, bottom: 64, left: 0, right: W }} />
      </Box>
      <Box height={64} style={{ background: 'rgba(0,0,0,0.25)' }}>
        <TurnBubble lang={LANG} content={bubbleContent(index, toCar, turnStep, LANG)} onAnchors={a5.onAnchors} getAnchors={a5.getAnchors} free={{ top: 0, bottom: 64, left: 0, right: W }} />
      </Box>
      <p className="g-label">MiniMapDome · Level 1, heading-up, route, connector ring</p>
      <Box height={287}>
        <MiniMapDome index={index} lang={LANG} route={toCar} levelId={stand.levelId} position={{ levelId: stTurn.levelId, x: stTurn.x, y: stTurn.y }} headingDeg={stTurn.headingDeg} distanceDoneM={stTurn.distanceDoneM} />
      </Box>
      <p className="g-label">MiniMapDome · parking B1 with the car</p>
      <Box height={287}>
        <MiniMapDome
          index={index}
          lang={LANG}
          route={toCar}
          levelId="B1"
          position={(() => {
            const st = simAt(toCar, index, { stepIndex: toCar.steps.length - 1, into: 12 })
            return { levelId: st.levelId, x: st.x, y: st.y }
          })()}
          headingDeg={simAt(toCar, index, { stepIndex: toCar.steps.length - 1, into: 12 }).headingDeg}
          distanceDoneM={simAt(toCar, index, { stepIndex: toCar.steps.length - 1, into: 12 }).distanceDoneM}
          car={{ levelId: bay.levelId, x: bay.center[0], y: bay.center[1] }}
        />
      </Box>
      <p className="g-label">BottomBar · not started / playing at 2x</p>
      {sims.map((s, k) => (
        <Box key={k} height={96}>
          <BottomBar lang={LANG} sim={s} canNext={k === 0} onEnd={noop} onSpeed={noop} onPlay={noop} onPause={noop} onNext={noop} onOpenMap={noop} />
        </Box>
      ))}
      <p className="g-label">LiftCard · mid ride</p>
      <Box height={340}>
        <LiftCard index={index} lang={LANG} step={toCar.steps[liftStep]} active progress={stRide.rideProgress ?? 0.6} />
      </Box>
    </div>
  )
}

function Gallery() {
  const data = useVenue()
  useEffect(() => {
    if (data) requestAnimationFrame(() => requestAnimationFrame(() => (window.__galleryReady = true)))
  }, [data])
  if (!data) return null
  if (SCENE === 'parts') return <PartsScene data={data} />
  if (SCENE === 'arrived') return <ArrivedScene data={data} />
  if (SCENE === 'controls') return <ControlsScene data={data} />
  return <HudScene data={data} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
)
