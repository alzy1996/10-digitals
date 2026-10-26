// Regrowth Preview (PRD 7.5) and growth-rate learning (PRD 4.12).
const WEEKS_PER_MONTH = 4.345;

export function rootBandCm(weeks, growthCmPerMonth = 1.25) {
  return Math.max(0, (growthCmPerMonth * weeks) / WEEKS_PER_MONTH);
}

// How hard the regrowth line is for a technique: 1 = hard line (global), lower = soft.
const HARDNESS = {
  global: 1,
  drench: 1,
  root: 1,
  gloss: 0.5,
  highlights: 0.6,
  partial: 0.55,
  babylights: 0.45,
  lowlights: 0.5,
  chunky: 0.7,
  balayage: 0.25,
  foilyage: 0.3,
  ombre: 0.15,
  sombre: 0.1,
  reverse: 0.2,
  melt: 0.25,
  shadow: 0.1,
  money: 0.35,
  peekaboo: 0.15,
  split: 0.9,
  chroma: 0.35,
};

export function lineSoftness(mask) {
  return 1 - (HARDNESS[mask] ?? 0.8);
}

/** L* of what grows back: her pigmented root mixed with grey/white strands (grey reads about L* 75). */
export function effectiveRootL(naturalL, greyPct = 0) {
  const g = Math.max(0, Math.min(1, greyPct / 100));
  return naturalL * (1 - g) + 75 * g;
}

/**
 * Low-maintenance score 0..100 from the visible root-line contrast at 8 weeks.
 * naturalL: L* of her natural root; colorL: L* of the colored hair next to the root.
 */
export function lowMaintenanceScore({ mask, naturalL, colorL }) {
  const dL = Math.abs(naturalL - colorL);
  const visible = dL * (HARDNESS[mask] ?? 0.8);
  return Math.round(Math.max(0, Math.min(100, 100 - visible * 2.4)));
}

/** Learn her own growth rate after two visits from measured regrowth. */
export function learnGrowthRate({ regrowthCm, lastVisitAt, now = new Date(), fallback = 1.25 }) {
  if (!regrowthCm || !lastVisitAt) return fallback;
  const months = (now - new Date(lastVisitAt)) / (1000 * 3600 * 24 * 30.44);
  if (months < 0.75) return fallback;
  const rate = regrowthCm / months;
  if (rate < 0.3 || rate > 3) return fallback;
  return Math.round(rate * 100) / 100;
}
