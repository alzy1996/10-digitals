/**
 * Indoor routing over the venue walking graph (CONTRACT.md section 3, `src/routing/`).
 *
 * - One ngraph.graph per profile ('default' | 'stepFree') per VenueIndex, cached in a WeakMap.
 * - A* (ngraph.path) with `oriented: true`, so one-way escalators are only ever ridden in their direction.
 * - Edge weight = travel time in seconds at the contract speeds (see costs.js).
 * - Step-free profile: every edge that is not step-free (escalators, stairs, flagged walk edges) is left out
 *   of that profile's graph, so it can never be used.
 * - Default profile only: lifts carry a soft preference penalty (LIFT_PREFERENCE_PENALTY_S) in the search
 *   weight, so people who can use escalators are sent to them and lifts stay free for prams and wheelchairs,
 *   unless the lift saves more than that. The penalty never appears in etaS (which is always the real
 *   contract-speed time). The step-free profile has no penalty.
 * - Heuristic = straight-line distance / 1.2 m/s + |ordinal difference| x per-floor lower bound. The
 *   per-floor bound is measured from the venue's own vertical edges (capped at 20 s) so the heuristic is
 *   admissible and consistent: A* returns the cheapest route for the profile's weights.
 *
 * Pure JS: no DOM, no three.js.
 */
import createGraph from 'ngraph.graph'
import { aStar } from 'ngraph.path'
import { edgeCostS, isStepFreeEdge, SPEEDS } from './costs.js'
import { buildSteps, clearLandmarkCache } from './instructions.js'
import { bayCode } from './names.js'

/**
 * @typedef {{ x: number, y: number, levelId: string, nodeId: string }} RoutePoint
 * @typedef {object} Route
 * @property {string[]} nodeIds        node ids in walking order
 * @property {RoutePoint[]} points     one per node, same order
 * @property {object[]} edges          edges[i] joins nodeIds[i] -> nodeIds[i + 1]. These are the venue's own
 *   edge objects (never copied or reversed), so `edge.from` may equal nodeIds[i + 1] on a two-way edge.
 * @property {number} lengthM          walk lengths + connector horizontal travel (sum of edge.lengthM)
 * @property {number} etaS             travel time at the contract speeds
 * @property {import('./instructions.js').Step[]} steps
 * @property {boolean} stepFree
 * @property {string} fromNodeId       extra
 * @property {string} toNodeId         extra
 * @property {string[]} levelIds       extra: levels in the order the route visits them (no repeats in a row)
 */

/** Upper cap for the per-floor heuristic term (seconds). */
const MAX_PER_FLOOR_S = 20

/**
 * Search-weight penalty (seconds) on lift edges in the default (not step-free) profile. Not part of etaS.
 * Default-profile shoppers take the escalator unless the lift is more than this much faster.
 */
export const LIFT_PREFERENCE_PENALTY_S = 30

/**
 * Search weight of an edge for a profile: real travel time plus the default-profile lift preference.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {object} edge
 * @param {boolean} stepFree
 */
export function edgeWeight(index, edge, stepFree) {
  const t = edgeCostS(index, edge)
  return !stepFree && edge.kind === 'lift' ? t + LIFT_PREFERENCE_PENALTY_S : t
}

/** @type {WeakMap<object, { default?: Profile, stepFree?: Profile }>} */
const profileCache = new WeakMap()

/**
 * @typedef {object} Profile
 * @property {boolean} stepFree
 * @property {object} graph                         ngraph.graph instance
 * @property {{ find(from: string, to: string): object[] }} finder
 * @property {Map<string, { to: string, cost: number, etaS: number, edge: object }[]>} adj
 *   allowed moves leaving each node (cost = search weight, etaS = real travel time)
 * @property {number} xyRate                         seconds per metre of straight-line distance (heuristic)
 * @property {number} perFloorS                      seconds per floor (heuristic)
 */

/**
 * Build (or fetch from cache) the routing graph for one profile.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {boolean} stepFree
 * @returns {Profile}
 */
export function getRoutingProfile(index, stepFree) {
  if (!index || !(index.nodeById instanceof Map)) throw new TypeError('routing: expected a VenueIndex from indexVenue()')
  let entry = profileCache.get(index)
  if (!entry) {
    entry = {}
    profileCache.set(index, entry)
  }
  const key = stepFree ? 'stepFree' : 'default'
  if (!entry[key]) entry[key] = buildProfile(index, Boolean(stepFree))
  return entry[key]
}

/** Drop cached graphs for a venue (call after editing a VenueIndex in place). */
export function clearRoutingCache(index) {
  profileCache.delete(index)
  travelCache.delete(index)
  clearLandmarkCache(index)
}

function buildProfile(index, stepFree) {
  const ordinalOf = (levelId) => index.levelById.get(levelId)?.ordinal ?? 0

  // Cheapest allowed move for every ordered node pair (the graph is not a multigraph).
  /** @type {Map<string, { from: string, to: string, cost: number, edge: object }>} */
  const moves = new Map()
  const addMove = (from, to, edge, cost) => {
    const key = `${from}\u0000${to}`
    const prev = moves.get(key)
    if (!prev || cost < prev.cost) moves.set(key, { from, to, cost, edge })
  }
  for (const edge of index.edgeById?.values?.() ?? edgesFromIndex(index)) {
    if (stepFree && !isStepFreeEdge(edge)) continue
    const cost = edgeWeight(index, edge, stepFree)
    addMove(edge.from, edge.to, edge, cost)
    if (!edge.oneWay) addMove(edge.to, edge.from, edge, cost)
  }

  const graph = createGraph()
  for (const node of index.nodeById.values()) {
    graph.addNode(node.id, { x: node.point[0], y: node.point[1], ordinal: ordinalOf(node.levelId) })
  }
  /** @type {Map<string, { to: string, cost: number, etaS: number, edge: object }[]>} */
  const adj = new Map()
  for (const id of index.nodeById.keys()) adj.set(id, [])
  for (const m of moves.values()) {
    graph.addLink(m.from, m.to, { cost: m.cost, edge: m.edge })
    adj.get(m.from).push({ to: m.to, cost: m.cost, etaS: edgeCostS(index, m.edge), edge: m.edge })
  }

  // Admissible, consistent heuristic constants measured from this graph.
  let xyRate = 1 / SPEEDS.walkMps
  for (const m of moves.values()) {
    const a = index.nodeById.get(m.from).point
    const b = index.nodeById.get(m.to).point
    const xy = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (xy > 1e-6) xyRate = Math.min(xyRate, m.cost / xy)
  }
  let perFloorS = MAX_PER_FLOOR_S
  for (const m of moves.values()) {
    const na = index.nodeById.get(m.from)
    const nb = index.nodeById.get(m.to)
    const floors = Math.abs(ordinalOf(na.levelId) - ordinalOf(nb.levelId))
    if (floors === 0) continue
    const xy = Math.hypot(nb.point[0] - na.point[0], nb.point[1] - na.point[1])
    perFloorS = Math.min(perFloorS, Math.max(0, (m.cost - xy * xyRate) / floors))
  }

  const finder = aStar(graph, {
    oriented: true,
    distance: (_to, _from, link) => link.data.cost,
    heuristic: (a, b) =>
      Math.hypot(b.data.x - a.data.x, b.data.y - a.data.y) * xyRate +
      Math.abs(b.data.ordinal - a.data.ordinal) * perFloorS,
  })

  return { stepFree, graph, finder, adj, xyRate, perFloorS }
}

function edgesFromIndex(index) {
  const seen = new Set()
  const out = []
  for (const list of index.edgesFrom.values()) {
    for (const e of list) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        out.push(e)
      }
    }
  }
  return out
}

/**
 * Fastest route between two graph nodes.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {string} fromNodeId
 * @param {string} toNodeId
 * @param {{ stepFree?: boolean }} [options]
 * @returns {Route | null} null when either node is unknown or no route exists for the profile
 */
export function findRoute(index, fromNodeId, toNodeId, { stepFree = false } = {}) {
  const profile = getRoutingProfile(index, stepFree)
  if (!index.nodeById.has(fromNodeId) || !index.nodeById.has(toNodeId)) return null
  const path = profile.finder.find(fromNodeId, toNodeId)
  if (!path || path.length === 0) return null
  // ngraph.path returns the path from target back to source.
  const nodeIds = path.map((n) => n.id).reverse()
  if (nodeIds[0] !== fromNodeId || nodeIds[nodeIds.length - 1] !== toNodeId) return null
  const edges = []
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const link = profile.graph.getLink(nodeIds[i], nodeIds[i + 1])
    if (!link) return null
    edges.push(link.data.edge)
  }
  return assembleRoute(index, nodeIds, edges, Boolean(stepFree))
}

/**
 * Build a Route object from an explicit node/edge path (used by findRoute; also handy for tests and for
 * replaying a stored route).
 */
export function assembleRoute(index, nodeIds, edges, stepFree = false) {
  const points = nodeIds.map((id) => {
    const n = index.nodeById.get(id)
    return { x: n.point[0], y: n.point[1], levelId: n.levelId, nodeId: n.id }
  })
  let lengthM = 0
  let etaS = 0
  for (const e of edges) {
    lengthM += Number.isFinite(e.lengthM) ? e.lengthM : 0
    etaS += edgeCostS(index, e)
  }
  const levelIds = []
  for (const p of points) if (levelIds[levelIds.length - 1] !== p.levelId) levelIds.push(p.levelId)
  return {
    nodeIds,
    points,
    edges,
    lengthM: round2(lengthM),
    etaS: round1(etaS),
    steps: buildSteps(index, nodeIds, edges),
    stepFree,
    fromNodeId: nodeIds[0],
    toNodeId: nodeIds[nodeIds.length - 1],
    levelIds,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Targets: occupants, amenities, bays, anchors, connectors -> graph nodes
// ---------------------------------------------------------------------------------------------------------

/**
 * Resolve any routable id (occupant, amenity, bay, anchor, connector or node id) to its graph node(s).
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {string} id
 * @returns {{ type: 'occupant'|'amenity'|'bay'|'anchor'|'connector'|'node', id: string, nodeIds: string[],
 *   levelId: string | null, name: { en: string, ar: string } | null } | null}
 */
export function resolveTarget(index, id) {
  if (typeof id !== 'string' || !id) return null
  const occ = index.occupantById.get(id)
  if (occ) {
    const nodeIds = (occ.entranceNodeIds ?? []).filter((n) => index.nodeById.has(n))
    const levelId = nodeIds.length ? index.nodeById.get(nodeIds[0]).levelId : (index.unitById.get(occ.unitIds?.[0])?.levelId ?? null)
    return { type: 'occupant', id, nodeIds, levelId, name: occ.name }
  }
  const am = index.amenityById.get(id)
  if (am) return { type: 'amenity', id, nodeIds: keep(index, [am.nodeId]), levelId: am.levelId, name: am.name }
  const bay = index.bayById.get(id)
  if (bay) {
    const code = bayCode(index, bay)
    return { type: 'bay', id, nodeIds: keep(index, [bay.nodeId]), levelId: bay.levelId, name: { en: `Bay ${code.en}`, ar: `الموقف ${code.ar}` } }
  }
  const anchor = index.anchorById.get(id)
  if (anchor) return { type: 'anchor', id, nodeIds: keep(index, [anchor.nodeId]), levelId: anchor.levelId, name: anchor.label }
  const conn = index.connectorById.get(id)
  if (conn) {
    return { type: 'connector', id, nodeIds: keep(index, (conn.stops ?? []).map((s) => s.nodeId)), levelId: conn.stops?.[0]?.levelId ?? null, name: conn.name }
  }
  const node = index.nodeById.get(id)
  if (node) return { type: 'node', id, nodeIds: [id], levelId: node.levelId, name: null }
  return null
}

function keep(index, ids) {
  return ids.filter((n) => typeof n === 'string' && index.nodeById.has(n))
}

/**
 * Fastest route from a node to an occupant / amenity / bay / anchor / connector (best of its entrances).
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {string} fromNodeId
 * @param {string} targetId
 * @param {{ stepFree?: boolean }} [options]
 * @returns {Route | null}
 */
export function findRouteToTarget(index, fromNodeId, targetId, options = {}) {
  const target = resolveTarget(index, targetId)
  if (!target || target.nodeIds.length === 0) return null
  if (target.nodeIds.length === 1) return findRoute(index, fromNodeId, target.nodeIds[0], options)
  const times = travelTimesFrom(index, fromNodeId, options)
  let bestNode = null
  let bestT = Infinity
  for (const n of target.nodeIds) {
    const t = times.get(n)?.etaS ?? Infinity
    if (t < bestT) {
      bestT = t
      bestNode = n
    }
  }
  return bestNode ? findRoute(index, fromNodeId, bestNode, options) : null
}

// ---------------------------------------------------------------------------------------------------------
// Single-source travel times (Dijkstra) for "nearest" lists and minutes on search results
// ---------------------------------------------------------------------------------------------------------

/** @type {WeakMap<object, Map<string, Map<string, { etaS: number, lengthM: number, weightS: number }>>>} */
const travelCache = new WeakMap()
const TRAVEL_CACHE_SIZE = 12

/**
 * Travel time and length from one node to every reachable node, along the same routes findRoute picks
 * (same profile weights; etaS is the real travel time).
 * Results are cached per venue, profile and start node.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {string} fromNodeId
 * @param {{ stepFree?: boolean }} [options]
 * @returns {Map<string, { etaS: number, lengthM: number, weightS: number }>} unreachable nodes are absent;
 *   weightS is the profile's search weight (etaS plus any lift preference penalty)
 */
export function travelTimesFrom(index, fromNodeId, { stepFree = false } = {}) {
  const profile = getRoutingProfile(index, stepFree)
  let perVenue = travelCache.get(index)
  if (!perVenue) {
    perVenue = new Map()
    travelCache.set(index, perVenue)
  }
  const key = `${stepFree ? 1 : 0}|${fromNodeId}`
  const hit = perVenue.get(key)
  if (hit) {
    perVenue.delete(key)
    perVenue.set(key, hit)
    return hit
  }
  const result = dijkstra(profile, fromNodeId)
  perVenue.set(key, result)
  if (perVenue.size > TRAVEL_CACHE_SIZE) perVenue.delete(perVenue.keys().next().value)
  return result
}

/**
 * Rank targets (occupant / amenity / bay / anchor ids) by travel time from a node. Unreachable targets are
 * dropped. Useful for "nearest restroom" lists.
 * @returns {{ id: string, nodeId: string, etaS: number, lengthM: number }[]}
 */
export function rankByTravelTime(index, fromNodeId, targetIds, options = {}) {
  const times = travelTimesFrom(index, fromNodeId, options)
  const out = []
  for (const id of targetIds) {
    const target = resolveTarget(index, id)
    if (!target) continue
    let best = null
    for (const n of target.nodeIds) {
      const t = times.get(n)
      if (t && (!best || t.etaS < best.etaS)) best = { id, nodeId: n, etaS: t.etaS, lengthM: t.lengthM }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => a.etaS - b.etaS || a.lengthM - b.lengthM || (a.id < b.id ? -1 : 1))
}

function dijkstra(profile, fromNodeId) {
  /** @type {Map<string, { etaS: number, lengthM: number, weightS: number }>} */
  const best = new Map()
  if (!profile.adj.has(fromNodeId)) return best
  const heap = new MinHeap()
  heap.push(0, fromNodeId, { etaS: 0, lengthM: 0 })
  const settled = new Set()
  while (heap.size) {
    const { key: w, value: id, extra } = heap.pop()
    if (settled.has(id)) continue
    settled.add(id)
    best.set(id, { etaS: round1(extra.etaS), lengthM: round2(extra.lengthM), weightS: round1(w) })
    for (const m of profile.adj.get(id)) {
      if (settled.has(m.to)) continue
      heap.push(w + m.cost, m.to, {
        etaS: extra.etaS + m.etaS,
        lengthM: extra.lengthM + (Number.isFinite(m.edge.lengthM) ? m.edge.lengthM : 0),
      })
    }
  }
  return best
}

class MinHeap {
  constructor() {
    /** @type {{ key: number, value: string, extra: { etaS: number, lengthM: number } }[]} */
    this.items = []
  }
  get size() {
    return this.items.length
  }
  push(key, value, extra) {
    const items = this.items
    items.push({ key, value, extra })
    let i = items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (items[p].key <= items[i].key) break
      ;[items[p], items[i]] = [items[i], items[p]]
      i = p
    }
  }
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && items[l].key < items[m].key) m = l
        if (r < items.length && items[r].key < items[m].key) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }
    return top
  }
}

function round1(x) {
  return Math.round(x * 10) / 10
}
function round2(x) {
  return Math.round(x * 100) / 100
}
