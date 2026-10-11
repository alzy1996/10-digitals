// src/ops/exits.js
/**
 * Exits in emergency mode (PLAN S20): the entrance plates. Straight-line distance only on the same level (routing
 * stops in an emergency); from another level the exits are on the ground level, reached by the stairs (never lifts).
 */
export function nearestExits(index, you) {
  const exits = [...index.anchorById.values()].filter((a) => a.kind === 'entrance')
  return exits
    .map((a) => ({ anchorId: a.id, label: a.label, levelId: a.levelId, distanceM: you && you.levelId === a.levelId ? Math.hypot(a.point[0] - you.x, a.point[1] - you.y) : null }))
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || (a.anchorId < b.anchorId ? 1 : -1))
}
