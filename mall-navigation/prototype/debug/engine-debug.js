/**
 * Engine debug page: loads the demo venue, mounts the engine full screen, shows a sample route and exposes
 * `window.__engine` (and `window.__debug` helpers) for headless screenshots.
 *
 * Routes come from src/routing (real steps with turns and landmarks) and the walker from src/sim (the same values the
 * App sends), so the Walk view scenarios here match the app.
 *
 * URL params: ?hud=1 shows a small stats box; ?lang=ar; ?route=cinema|car|food|kitchen|none; ?style=classic;
 * ?view=fpv|floor|top|stack; ?simT=<seconds> places the simulated walker on the route.
 */
import { loadVenue } from '../src/data/venue.js'
import { findRouteToTarget } from '../src/routing/route.js'
import { createSimulator } from '../src/sim/simulator.js'
import { engine } from '../src/engine/engine.js'

const params = new URLSearchParams(location.search)

const index = await loadVenue('/venues/demo-muscat/venue.json')
const mapEl = document.getElementById('map')
engine.mount(mapEl)
engine.setVenue(index)
if (params.get('style')) engine.setSceneStyle(params.get('style'))
if (params.get('theme')) engine.setTheme(params.get('theme'))

const anchorNode = (id) => index.anchorById.get(id).nodeId
const SAMPLES = {
  cinema: () => findRouteToTarget(index, anchorNode('A-G-ENT-S'), 'occ-majlis-cinemas'),
  kitchen: () => findRouteToTarget(index, anchorNode('A-G-ENT-S'), 'occ-muttrah-kitchen'),
  food: () => findRouteToTarget(index, anchorNode('A-L1-LA'), 'occ-biryani-bay'),
  car: () => findRouteToTarget(index, index.bayById.get('bay-B1-043').nodeId, 'occ-sidab-fresh', { stepFree: true }),
  tocar: () => findRouteToTarget(index, anchorNode('A-L1-C3'), 'bay-B1-043', { stepFree: true }),
}
const routes = Object.fromEntries(Object.entries(SAMPLES).map(([k, f]) => [k, f()]))

let current = null

/** Level of a step (where it starts). */
const stepLevel = (r, i) => r.points[Math.max(0, r.steps[i]?.from ?? 0)]?.levelId

/** The App's next-turn point for a step (DESIGN-GLASS 7.6): its end, or the connector's boarding point. */
function nextTurnFor(r, i) {
  let k = i
  while (r.steps[k + 1] && r.steps[k].kind === 'start') k++
  const st = r.steps[k]
  if (!st) return null
  const idx = st.kind === 'connector' ? (st.connector?.boardIndex ?? st.from) : st.to
  const p = r.points[idx]
  const kind = st.kind === 'arrive' ? 'arrive' : st.kind === 'connector' ? 'connector' : 'turn'
  return { levelId: p.levelId, x: p.x, y: p.y, kind, label: { en: st.text.en.split(/[,.]/)[0], ar: st.text.ar.split(/[،.]/)[0] } }
}

function showSample(name) {
  const r = routes[name] ?? null
  current = r
  engine.showRoute(r)
  engine.setMarker('walker', null)
  if (r) {
    const first = r.points[0]
    const last = r.points[r.points.length - 1]
    engine.setMarker('you', { levelId: first.levelId, x: first.x, y: first.y, state: 'exact' })
    engine.setMarker('dest', name === 'tocar' ? null : { levelId: last.levelId, x: last.x, y: last.y })
    engine.setActiveStep(0, { fly: false })
    engine.setNextTurn(nextTurnFor(r, 0))
  } else {
    engine.setMarker('you', null)
    engine.setMarker('dest', null)
    engine.setNextTurn(null)
  }
  return r
}

const walkerValue = (s) => ({
  levelId: s.levelId,
  x: s.x,
  y: s.y,
  headingDeg: s.headingDeg,
  ...(s.onConnector && s.elevation != null ? { elevation: s.elevation, connectorId: s.connectorId } : {}),
})

/**
 * Put the simulated walker t seconds into the current route (stepping through the walk like playback, so the
 * engine's walked distance follows). Returns the simulator state.
 */
function walkTo(t) {
  const r = current
  if (!r) return null
  const sim = createSimulator({ route: r, index })
  let s = sim.getState()
  let step = -1
  for (let k = 0; k <= t; k += 0.25) {
    s = sim.tick(k === 0 ? 0 : 0.25)
    if (s.stepIndex !== step) {
      step = s.stepIndex
      engine.setActiveStep(step, { fly: false })
      engine.setNextTurn(nextTurnFor(r, step))
    }
    engine.setMarker('walker', walkerValue(s))
  }
  sim.dispose()
  engine.setMarker('you', null)
  return s
}

const lang = params.get('lang') === 'ar' ? 'ar' : 'en'
engine.setLanguage(lang)
document.documentElement.lang = lang
showSample(params.get('route') ?? 'cinema')
if (params.get('simT')) walkTo(Number(params.get('simT')))

engine.onPick((hit) => {
  window.__lastPick = hit
  console.info('pick', JSON.stringify(hit))
})

const hud = document.getElementById('hud')
if (params.get('hud') === '1') {
  hud.hidden = false
  engine.onRender(() => {
    const s = engine.getStats()
    hud.textContent = `calls ${s.drawCalls}  tris ${s.triangles}\nframe ${s.frameMs} ms  frames ${s.totalFramesRendered}`
  })
}

/**
 * ?walkhud=1: a rough mock of the Walk view HUD (DESIGN-GLASS 7.1 boxes at 390 x 844) so the 3D composition can be
 * judged with the chrome in place: engine padding (top 220, bottom 287) + obstacles, glass boxes, and a frost bubble
 * moved by onAnchors (its icon centre on the nextTurn anchor). Debug only; the real HUD is src/ui.
 */
/** ?mappad=1: the map views' chrome as the app reserves it (header capsule + bottom sheet). */
if (params.get('mappad') === '1') {
  const sheet = Math.round(innerHeight * 0.38)
  engine.setViewportPadding({ top: 88, bottom: sheet, left: 0, right: 0 })
  engine.setScreenObstacles([
    { x: 12, y: 12, w: innerWidth - 24, h: 64 },
    { x: 12, y: innerHeight - sheet, w: innerWidth - 24, h: sheet - 12 },
  ])
}
/** ?walkpad=1: the Walk view HUD's space (padding + obstacles) without drawing it. */
if (params.get('walkpad') === '1') {
  const dome = Math.round(Math.min(Math.max(210, innerHeight * 0.34), innerHeight * 0.4))
  engine.setViewportPadding({ top: 220, bottom: dome, left: 0, right: 0 })
  engine.setScreenObstacles([
    { x: 12, y: 8, w: innerWidth - 24, h: 204 },
    { x: 0, y: innerHeight - dome, w: innerWidth, h: dome },
  ])
}
if (params.get('walkhud') === '1') {
  const W = innerWidth
  const H = innerHeight
  const dome = Math.round(Math.min(Math.max(210, H * 0.34), H * 0.4))
  const box = (x, y, w, h, css = '') => {
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;${css}`
    document.body.appendChild(d)
    return d
  }
  const glass = 'background:linear-gradient(180deg,rgba(24,33,42,.78),rgba(14,20,25,.84));border:1px solid rgba(255,255,255,.14);border-radius:24px;backdrop-filter:blur(24px) saturate(160%);color:#fff;font:15px/20px system-ui;'
  const pewter = 'background:linear-gradient(180deg,rgba(78,87,98,.94),rgba(70,79,89,.96));border:1px solid rgba(255,255,255,.22);border-radius:24px;color:#fff;font:14px/16px system-ui;padding:8px 12px;'
  const cw = (W - 24 - 12) / 3
  ;['Arrival 17:42', 'Distance 95 m', 'Steps ≈ 130'].forEach((t, i) => (box(12 + i * (cw + 6), 8, cw, 48, pewter).textContent = t))
  const card = box(12, 64, W - 24, 104, glass + 'padding:12px 16px;display:flex;gap:12px;align-items:center;')
  card.innerHTML = '<div style="width:52px;height:52px;border-radius:18px;background:linear-gradient(180deg,#5FF5D6,#22D3BE 55%,#14B8A6);box-shadow:0 0 22px -4px rgba(38,217,199,.8)"></div><div><div style="color:#C9D2DB">Turn left at</div><div style="font-size:24px;line-height:30px">the atrium</div></div>'
  box(12, 176, 250, 36, glass + 'border-radius:18px;padding:4px 12px;font:600 14px/28px system-ui;').innerHTML = '<span style="background:#FFB547;color:#1B1205;border-radius:14px;padding:3px 10px">SIMULATION</span> Not your live position'
  box(0, H - dome, W, dome, glass + 'border-radius:0;clip-path:ellipse(78% 100% at 50% 100%);')
  box(W / 2 - 36, H - 12 - 72, 72, 72, 'border-radius:50%;background:radial-gradient(circle at 50% 35%,#8BFBE6,#2CE5C8 45%,#12A99A);box-shadow:0 0 0 6px rgba(38,217,199,.18),0 0 36px rgba(38,217,199,.65)')
  for (const x of [12, 76, W - 12 - 56 - 64, W - 12 - 56]) box(x, H - 12 - 64, 56, 56, pewter + 'border-radius:50%')
  const bubble = box(0, 0, 0, 0, 'pointer-events:none;will-change:transform')
  bubble.innerHTML =
    '<div style="position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#5EF2DC,#14B8A6);border:2px solid #fff"></div>' +
    '<div style="position:absolute;left:1px;top:-62px;min-width:150px;padding:8px 14px;border-radius:18px;background:linear-gradient(180deg,rgba(246,248,250,.88),rgba(238,242,246,.84));color:#0B1218;font:600 17px/22px system-ui;white-space:nowrap">Turn left<div style="font:400 14px/18px system-ui;color:#3A4654">and 42 m straight</div></div>'
  engine.setViewportPadding({ top: 220, bottom: dome, left: 0, right: 0 })
  engine.setScreenObstacles([
    { x: 12, y: 8, w: W - 24, h: 204 },
    { x: 0, y: H - dome, w: W, h: dome },
  ])
  engine.onAnchors((a) => {
    const n = a.nextTurn
    bubble.style.display = n && n.visible ? 'block' : 'none'
    if (n && n.visible) bubble.style.transform = `translate3d(${Math.round(n.x * 2) / 2}px, ${Math.round(n.y * 2) / 2}px, 0)`
  })
}

const v = params.get('view')
if (v) engine.setView({ mode: v, levelId: current ? stepLevel(current, 0) : undefined, fit: v === 'fpv' ? 'none' : 'route' }, { durationMs: 0 })

window.__engine = engine
window.__debug = { index, routes, showSample, walkTo, nextTurnFor, stepLevel, get route() { return current } }
window.__debugReady = true
