/**
 * Travel-time model shared by routing (edge weights), instructions (step ETAs) and anyone who needs the
 * same numbers (simulator, UI). Speeds come from CONTRACT.md section 3:
 * walk 1.2 m/s, escalator 0.5 m/s + 5 s, lift 45 s wait + 4 s per floor, stairs 15 s per floor.
 * Pure JS, no DOM.
 */

export const SPEEDS = Object.freeze({
  walkMps: 1.2,
  escalatorMps: 0.5,
  escalatorBoardS: 5,
  liftWaitS: 45,
  liftPerFloorS: 4,
  stairsPerFloorS: 15,
})

/** Edge kinds that move you between levels. */
export const CONNECTOR_EDGE_KINDS = Object.freeze(['escalator', 'lift', 'stairs'])

/** True for escalator / lift / stairs edges. */
export function isConnectorEdge(edge) {
  return CONNECTOR_EDGE_KINDS.includes(edge?.kind)
}

/**
 * Whether an edge can be used on a step-free (wheelchair, buggy, pram) route.
 * Missing flags default by kind: escalators and stairs are never step-free.
 */
export function isStepFreeEdge(edge) {
  if (edge.kind === 'escalator' || edge.kind === 'stairs') return false
  return edge.stepFree !== false
}

/**
 * Number of floors an edge crosses (|ordinal difference|), 0 for same-level edges.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {object} edge
 */
export function floorsCrossed(index, edge) {
  const a = index.nodeById.get(edge.from)
  const b = index.nodeById.get(edge.to)
  const la = a ? index.levelById.get(a.levelId) : null
  const lb = b ? index.levelById.get(b.levelId) : null
  if (!la || !lb) return 0
  return Math.abs(la.ordinal - lb.ordinal)
}

/**
 * Time in seconds to traverse one edge at the contract speeds.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {object} edge
 * @returns {number}
 */
export function edgeCostS(index, edge) {
  const len = Number.isFinite(edge.lengthM) ? Math.max(0, edge.lengthM) : 0
  switch (edge.kind) {
    case 'escalator':
      return len / SPEEDS.escalatorMps + SPEEDS.escalatorBoardS
    case 'lift':
      return SPEEDS.liftWaitS + SPEEDS.liftPerFloorS * Math.max(1, floorsCrossed(index, edge))
    case 'stairs':
      return SPEEDS.stairsPerFloorS * Math.max(1, floorsCrossed(index, edge))
    default:
      return len / SPEEDS.walkMps
  }
}
