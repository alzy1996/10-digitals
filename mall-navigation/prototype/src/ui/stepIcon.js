/**
 * Icon name for a navigation step (pure JS, no React, so the HUD model and tests can use it).
 * Names are src/ui/icons.jsx names. Turn arrows follow the walking direction and are never mirrored in Arabic.
 * Arrival is the flag (DESIGN-GLASS.md 7.3: "arrive: flag on the ok tile").
 * @param {object|null|undefined} step CONTRACT Step
 * @returns {string}
 */
export function stepIconName(step) {
  if (!step) return 'turn_straight'
  if (step.kind === 'start') return 'start'
  if (step.kind === 'arrive') return 'flag'
  if (step.kind === 'connector') {
    const c = step.connector
    if (c?.type === 'lift') return 'lift'
    if (c?.type === 'stairs') return 'stairs'
    return c?.direction === 'down' ? 'escalator_down' : 'escalator_up'
  }
  switch (step.turn) {
    case 'left':
      return 'turn_left'
    case 'right':
      return 'turn_right'
    case 'slight_left':
      return 'turn_slight_left'
    case 'slight_right':
      return 'turn_slight_right'
    case 'uturn':
      return 'turn_uturn'
    default:
      return 'turn_straight'
  }
}
