// Growth timeline (PRD 7.3). Slider stops: today, 1, 2, 4, 8 and 12 weeks. Per zone:
//   length(t) = min(target, current + rate x days)
// Coverage follows the patch map (the measured density per zone), so weak zones look
// patchy at the right moment and fill in as the hair gets long enough to lie over
// the gaps. Pure functions; the renderers feed the result to the beard texture.

import { clamp, isNum, smoothstep } from './util.js';

export const ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);

/** Default beard growth, mm per day (PRD 4.7). */
export const DEFAULT_GROWTH_MM_PER_DAY = 0.4;
/** Length difference that still counts as "the same length" (mm). */
export const LENGTH_TOLERANCE_MM = 2;

/** Slider stops. labelKey is the slider label; render.json holds the strings. */
export const TIMELINE_STOPS = Object.freeze([
  Object.freeze({ days: 0, key: 'today', labelKey: 'render.timeline.today' }),
  Object.freeze({ days: 7, key: 'week1', labelKey: 'render.timeline.week1' }),
  Object.freeze({ days: 14, key: 'week2', labelKey: 'render.timeline.week2', noteKey: 'render.timeline.awkward' }),
  Object.freeze({ days: 28, key: 'week4', labelKey: 'render.timeline.week4' }),
  Object.freeze({ days: 56, key: 'week8', labelKey: 'render.timeline.week8', noteKey: 'render.timeline.fullShape' }),
  Object.freeze({ days: 84, key: 'week12', labelKey: 'render.timeline.week12' }),
]);

/**
 * Coverage of one zone (0..1) from the measured density alone, i.e. how much of the
 * skin the zone's follicles can cover once the hair is long.
 *
 * zone: profile.beard.zones[id] = { density 0..100, lengthMm, confidence 0..1 }.
 * A zone the barber confirmed (confidence 1) uses its density as is. A shaved zone
 * (length under 1 mm) does not show how the hair grows, so it counts as full
 * unless confirmed. Otherwise the measured density is trusted by its confidence.
 */
export function densityCover(zone) {
  if (!zone || !isNum(zone.density)) return 1;
  const fromDensity = clamp(0.12 + 0.88 * Math.pow(clamp(zone.density, 0, 100) / 75, 0.8), 0, 1);
  const conf = isNum(zone.confidence) ? zone.confidence : 0;
  if (conf >= 0.99) return fromDensity;
  if (!isNum(zone.lengthMm) || zone.lengthMm < 1) return 1;
  const w = smoothstep(0.35, 0.75, conf);
  return 1 + (fromDensity - 1) * w;
}

/**
 * Visible coverage (0..1) of a zone at a given hair length: the follicle cover from
 * the patch map, plus long hair lying over the gaps (up to 60 % of them by 40 mm).
 */
export function coverAtLength(baseCover, lengthMm) {
  if (!(lengthMm > 0)) return 0;
  const lie = 0.6 * smoothstep(5, 40, lengthMm);
  return clamp(baseCover + (1 - baseCover) * lie, 0, 1);
}

/** Current length of each zone from the profile (0 when unknown). */
export function currentLengths(profile) {
  const zones = profile && profile.beard && profile.beard.zones;
  const out = {};
  for (const z of ZONES) {
    const v = zones && zones[z] ? zones[z].lengthMm : 0;
    out[z] = isNum(v) && v > 0 ? v : 0;
  }
  return out;
}

/** Coverage per zone for the given lengths. */
export function zoneCoverage(lengths, profile) {
  const zones = profile && profile.beard && profile.beard.zones;
  const out = {};
  for (const z of ZONES) {
    const L = lengths && isNum(lengths[z]) ? lengths[z] : 0;
    out[z] = coverAtLength(densityCover(zones ? zones[z] : null), L);
  }
  return out;
}

function nearestStop(days) {
  let best = TIMELINE_STOPS[0];
  for (const s of TIMELINE_STOPS) if (Math.abs(s.days - days) < Math.abs(best.days - days)) best = s;
  return best;
}

/**
 * The look after `days` of growth.
 *
 * @param {object} params LookParams (target)
 * @param {object|null} profile FaceProfile (current lengths and patch map)
 * @param {number} days 0..84 (any value >= 0 works)
 * @param {number} [rateMmPerDay=0.4]
 * @returns {{ params: object, coverage: Record<string, number>, labelKey: string,
 *   lengths: Record<string, number>, complete: boolean, days: number }}
 *   params is a copy of the input with zones replaced by the lengths at that day.
 *   labelKey: the nearest stop's label; the week-2 stop reads "Week 2: awkward stage"
 *   while the look is still growing in, the week-8 stop "Week 8: full shape" once
 *   every zone has reached its target.
 */
export function growthAt(params, profile, days, rateMmPerDay = DEFAULT_GROWTH_MM_PER_DAY) {
  const p = params && typeof params === 'object' ? params : {};
  const target = p.zones || {};
  const d = isNum(days) && days > 0 ? days : 0;
  const rate = isNum(rateMmPerDay) && rateMmPerDay > 0 ? rateMmPerDay : DEFAULT_GROWTH_MM_PER_DAY;
  const cur = currentLengths(profile);
  const lengths = {};
  let complete = true;
  let growing = false;
  for (const z of ZONES) {
    const t = isNum(target[z]) && target[z] > 0 ? target[z] : 0;
    const L = Math.min(t, cur[z] + rate * d);
    lengths[z] = Math.round(L * 10) / 10;
    if (t - L > LENGTH_TOLERANCE_MM) complete = false;
    if (t > 6 && t - L > LENGTH_TOLERANCE_MM) growing = true;
  }
  const stop = nearestStop(d);
  let labelKey = stop.labelKey;
  if (stop.key === 'week2' && growing) labelKey = stop.noteKey;
  if (stop.key === 'week8' && complete) labelKey = stop.noteKey;
  return {
    params: { ...p, zones: { ...target, ...lengths } },
    coverage: zoneCoverage(lengths, profile),
    labelKey,
    lengths,
    complete,
    days: d,
  };
}
