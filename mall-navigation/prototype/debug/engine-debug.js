/**
 * Engine debug page: loads the demo venue, mounts the engine full screen, shows a hard-coded sample
 * route and exposes `window.__engine` (and `window.__debug` helpers) for headless screenshots.
 *
 * The sample route is computed here with a tiny Dijkstra over `edgesFrom` so this page does not
 * depend on src/routing. Steps are coarse (one per level run / connector) - enough to exercise
 * setActiveStep, dotted other-level parts and connector light columns.
 *
 * URL params: ?hud=1 shows a small stats box; ?lang=ar; ?route=cinema|car|none.
 */
import { loadVenue, otherNodeId } from '../src/data/venue.js'
import { engine } from '../src/engine/engine.js'

const params = new URLSearchParams(location.search)

/**
 * Shortest path by length (Dijkstra, binary-heap free: the graph is small).
 * @returns {{ nodeIds: string[], edges: object[] } | null}
 */
function shortestPath(index, fromId, toId, { stepFree = false } = {}) {
  const dist = new Map([[fromId, 0]])
  const prev = new Map()
  const done = new Set()
  const open = new Set([fromId])
  while (open.size) {
    let cur = null
    let best = Infinity
    for (const id of open) {
      const d = dist.get(id)
      if (d < best) {
        best = d
        cur = id
      }
    }
    open.delete(cur)
    if (cur === toId) break
    done.add(cur)
    for (const e of index.edgesFrom.get(cur) ?? []) {
      if (stepFree && !e.stepFree) continue
      const nxt = otherNodeId(e, cur)
      if (done.has(nxt)) continue
      const cost = best + (e.kind === 'lift' ? 30 : e.lengthM)
      if (cost < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, cost)
        prev.set(nxt, { id: cur, edge: e })
        open.add(nxt)
      }
    }
  }
  if (!dist.has(toId)) return null
  const nodeIds = [toId]
  const edges = []
  let c = toId
  while (c !== fromId) {
    const p = prev.get(c)
    edges.unshift(p.edge)
    nodeIds.unshift(p.id)
    c = p.id
  }
  return { nodeIds, edges }
}

/** Build a CONTRACT-shaped Route with coarse steps. */
function makeRoute(index, path, stepFree) {
  const points = path.nodeIds.map((id) => {
    const n = index.nodeById.get(id)
    return { x: n.point[0], y: n.point[1], levelId: n.levelId, nodeId: id }
  })
  const steps = []
  let runStart = 0
  const levelName = (id) => index.levelById.get(id)?.name ?? { en: id, ar: id }
  const pushWalk = (from, to) => {
    if (to <= from) return
    let d = 0
    for (let i = from + 1; i <= to; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    steps.push({
      index: steps.length,
      kind: steps.length === 0 ? 'start' : 'walk',
      levelId: points[from].levelId,
      text: { en: `Walk ${Math.round(d)} m on ${levelName(points[from].levelId).en}`, ar: `امشِ ${Math.round(d)} م` },
      distanceM: d,
      etaS: d / 1.2,
      from,
      to,
      landmark: null,
      connector: null,
      turn: null,
    })
  }
  path.edges.forEach((e, i) => {
    if (e.kind === 'walk' || e.kind === 'parking_walk') return
    pushWalk(runStart, i)
    const conn = index.connectorById.get(e.connectorId)
    const toStop = conn?.stops.find((s) => s.levelId === points[i + 1].levelId)
    steps.push({
      index: steps.length,
      kind: 'connector',
      levelId: points[i].levelId,
      text: { en: `Take ${conn?.name.en ?? e.kind} to ${levelName(points[i + 1].levelId).en}`, ar: conn?.name.ar ?? '' },
      distanceM: e.lengthM,
      etaS: 30,
      from: i,
      to: i + 1,
      landmark: null,
      connector: { id: e.connectorId, type: e.kind, toLevelId: points[i + 1].levelId, buttonLabel: toStop?.buttonLabel ?? { en: '', ar: '' } },
      turn: null,
    })
    runStart = i + 1
  })
  pushWalk(runStart, points.length - 1)
  steps.push({
    index: steps.length,
    kind: 'arrive',
    levelId: points[points.length - 1].levelId,
    text: { en: 'Arrive', ar: 'وصلت' },
    distanceM: 0,
    etaS: 0,
    from: points.length - 1,
    to: points.length - 1,
    landmark: null,
    connector: null,
    turn: null,
  })
  const lengthM = steps.reduce((s, st) => s + (st.kind === 'connector' ? 0 : st.distanceM), 0)
  return { nodeIds: path.nodeIds, points, edges: path.edges, lengthM, etaS: lengthM / 1.2, steps, stepFree }
}

const index = await loadVenue('/venues/demo-muscat/venue.json')
const mapEl = document.getElementById('map')
engine.mount(mapEl)
engine.setVenue(index)

const routes = {}
const occ = (id) => index.occupantById.get(id)
const anchorNode = (id) => index.anchorById.get(id).nodeId
const cinema = shortestPath(index, anchorNode('A-G-ENT-S'), occ('occ-majlis-cinemas').entranceNodeIds[0])
if (cinema) routes.cinema = makeRoute(index, cinema, false)
const bay = index.bayById.get('bay-B1-043')
const car = shortestPath(index, bay.nodeId, occ('occ-sidab-fresh').entranceNodeIds[0], { stepFree: true })
if (car) routes.car = makeRoute(index, car, true)
const food = shortestPath(index, anchorNode('A-L1-LA'), occ('occ-biryani-bay').entranceNodeIds[0])
if (food) routes.food = makeRoute(index, food, false)

function showSample(name) {
  const r = routes[name] ?? null
  engine.showRoute(r)
  if (r) {
    const first = r.points[0]
    const last = r.points[r.points.length - 1]
    engine.setMarker('you', { levelId: first.levelId, x: first.x, y: first.y, state: 'exact' })
    engine.setMarker('dest', { levelId: last.levelId, x: last.x, y: last.y })
  } else {
    engine.setMarker('you', null)
    engine.setMarker('dest', null)
  }
  return r
}

const lang = params.get('lang') === 'ar' ? 'ar' : 'en'
engine.setLanguage(lang)
document.documentElement.lang = lang
showSample(params.get('route') ?? 'cinema')

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

window.__engine = engine
window.__debug = { index, routes, showSample, shortestPath, makeRoute }
window.__debugReady = true
