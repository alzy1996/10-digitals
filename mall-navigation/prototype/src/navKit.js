/**
 * The trip-only modules (v0.5: their own chunk, so the first screen keeps its load budget): the walk simulator and the
 * next-turn model. The App loads it with the route screens (and on idle) and uses it only on navigate / arrived.
 */
export { createSimulator } from './sim/simulator.js'
export { nextTurnFor } from './ui/hudModel.js'
