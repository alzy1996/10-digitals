// The barber's one-tap zone confirmations (PRD 5.5) as densities 0..100. One table
// for the whole app: the effective profile (applyOverrides), its grow-ability and the
// style ranking (recommend/score.js) all read a confirmed zone the same way, so a
// zone confirmed as 'none' counts as no hair everywhere.

export const ZONE_CONFIRM_DENSITY = Object.freeze({ dense: 85, medium: 60, patchy: 30, none: 0 });
