// Rule-based recommendation engine (PRD 6.1). Ranks every visible style for one face
// in well under 50 ms, offline, with up to 3 reason chips per style. No LLM.
//
//   score = 100 x (0.30 Face + 0.25 Grow + 0.15 Contrast + 0.10 Age + 0.10 Life + 0.10 Local)
//           - penalties (+ the Eid boost)
//
// Face     sum over shapes of share(shape) x (1.0 if the shape is in style.faces or
//          faces is ['all'], else 0.2). A barber override of the face shape counts as 100 %.
// Grow     sum over the style's zones of weight x min(1, density / required).
// Contrast beard L* vs skin L*: high contrast favours crisp and razor lines, low contrast
//          favours fuller, longer styles that stay visible.
// Age      style.ageFit[band], default 0.8 (theatrical and very long styles carry a lower
//          55+ value in the catalog; a style the customer picked himself keeps 0.8).
// Life     trim interval vs visit frequency and daily grooming time; neutral when unanswered.
// Local    localFit / 5 (the owner edits localFit per style).
// Penalty  -25 when any zone the style needs is under 40 % density (and under the style's
//          own requirement), with a warning chip per weak zone group.
// Shaved   a freshly shaved face shows no stubble to read, so its zero densities say
//          nothing about growth: they count as unknown (neutral, no penalty) until the
//          barber confirms zones with one tap (isFreshlyShaved, catalog.warn.shaved_confirm).
// Work     'clean' shows the clean shave only; 'short' hides styles longer than short and
//          the theatrical ones. Occasion 'eid' adds +10 to crisp and razor-lined styles.
//
// Deterministic: the same profile and catalog always give the same list, whatever the
// input order (sort: score desc, then style.order, then id).

import COLORS from '../../data/colors.json';
import { hexToLab } from '../analysis/color.js';
// Barber's one-tap zone confirmations as densities: the same table as the profile's
// applyOverrides, so a zone confirmed 'none' reads 0 in the ranking and in the profile.
import { ZONE_CONFIRM_DENSITY } from '../analysis/zoneConfirm.js';
import { paramsFromStyle, lengthClassOf } from '../../lib/look.js';
import { jawlineDetail } from './jawline.js';
import { pickReasons, warningsFor, faceChipFor, trimReason, POINTS } from './reasons.js';

export const ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);
export const SHAPES = Object.freeze(['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle']);
/** Face code used in style.faces for each face shape. */
export const SHAPE_CODES = Object.freeze({ oval: 'OV', round: 'RD', square: 'SQ', oblong: 'OB', heart: 'HT', diamond: 'DM', triangle: 'TR' });

export const WEIGHTS = Object.freeze({ face: 0.3, grow: 0.25, contrast: 0.15, age: 0.1, life: 0.1, local: 0.1 });
export const FACE_MISFIT = 0.2;
export const WEAK_DENSITY = 40;
export const WEAK_PENALTY = 25;
export const EID_BOOST = POINTS.occasion;
export const DEFAULT_AGE_FIT = 0.8;
export const VISIT_DAYS = Object.freeze({ weekly: 7, biweekly: 14, monthly: 30 });

/** Values used when the profile does not have the input (same for every style, so the ranking is unaffected). */
export const NEUTRAL = Object.freeze({ face: 0.6, contrast: 0.7, life: 0.75, density: 50 });

/** Minutes of daily grooming a style needs, by length class; crisp and razor edges add upkeep. */
const GROOM_NEED = Object.freeze({ none: 5, stubble: 2, short: 4, medium: 6, long: 9, xlong: 12 });
const EDGE_UPKEEP = Object.freeze({ soft: 0, crisp: 1, razor: 2 });
/** Line definition (contrast rewards it) and visibility of length (low contrast rewards it). */
const EDGE_DEFINITION = Object.freeze({ soft: 0.3, crisp: 0.75, razor: 1 });
const VISIBILITY = Object.freeze({ none: 0, stubble: 0.2, short: 0.45, medium: 0.7, long: 0.9, xlong: 1 });
/** Generic zone weights for styles that carry none (shop signature styles from older data). */
const FALLBACK_WEIGHTS = Object.freeze({ M: 0.12, S: 0.03, C: 0.15, J_L: 0.12, J_R: 0.12, K_L: 0.18, K_R: 0.18, B_L: 0.05, B_R: 0.05 });
const GREY_HAIR_L = 75;
const MST_HEX = Object.freeze(['#f6ede4', '#f3e7db', '#f7ead0', '#eadaba', '#d7bd96', '#a07e56', '#825c43', '#604134', '#3a312a', '#292420']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

const COLOR_L = new Map(COLORS.filter((c) => c.hex).map((c) => [c.id, hexToLab(c.hex)[0]]));
const MST_L = MST_HEX.map((h) => hexToLab(h)[0]);

/** Whether a work rule ('clean' | 'short' | 'none' | null) allows the style. */
export function workRuleAllows(style, rule) {
  if (!style) return false;
  if (rule === 'clean') return lengthClassOf(style) === 'none';
  if (rule === 'short') {
    const lc = lengthClassOf(style);
    return (lc === 'none' || lc === 'stubble' || lc === 'short') && style.theatrical !== true;
  }
  return true;
}

/**
 * Face-shape shares used for the Face term: { shape: share } summing to 1, or null when
 * unknown. A barber override (overrides.faceShape, profile.overrides.faceShape, or a
 * top shape that is not the analysed winner) counts as 100 %.
 */
export function faceShares(profile, overrides) {
  const fs = profile && profile.faceShape;
  const forced = (overrides && overrides.faceShape) || (profile && profile.overrides && profile.overrides.faceShape) || null;
  if (forced && SHAPE_CODES[forced]) return { [forced]: 1 };
  const scores = fs && fs.scores;
  if (scores && typeof scores === 'object') {
    const val = (s) => (isNum(scores[s]) && scores[s] > 0 ? scores[s] : 0);
    let total = 0;
    let best = null;
    for (const s of SHAPES) {
      total += val(s);
      if (val(s) > (best ? val(best) : 0)) best = s;
    }
    const top = fs.top;
    if (top && SHAPE_CODES[top] && best && top !== best && val(top) < val(best)) return { [top]: 1 };
    if (total > 0) return Object.fromEntries(SHAPES.map((s) => [s, val(s) / total]));
  }
  if (fs && fs.top && SHAPE_CODES[fs.top]) return { [fs.top]: 1 };
  return null;
}

/** Face term (0..1) of a style for the given shape shares. */
export function faceFit(style, shares) {
  if (!shares) return NEUTRAL.face;
  const faces = Array.isArray(style.faces) && style.faces.length ? style.faces : ['all'];
  const all = faces.includes('all');
  let f = 0;
  for (const s of SHAPES) {
    const share = shares[s] || 0;
    if (!share) continue;
    f += share * (all || faces.includes(SHAPE_CODES[s]) ? 1 : FACE_MISFIT);
  }
  return clamp(f, 0, 1);
}

/** Face zones read to decide whether a face is freshly shaved (the neck is often shaved anyway). */
const SHAVED_ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R']);
export const SHAVED_MEAN_BELOW = 12;
export const SHAVED_MAX_BELOW = 25;

/**
 * True when the face reads as freshly shaved: the face zones the barber has not confirmed
 * (at least 2 of them) average under 12 % density and none reaches 25 %. Growth cannot be
 * read then; the screens ask the barber to confirm the zones (catalog.warn.shaved_confirm).
 * Pass the session overrides so confirmed zones (already merged into an effective profile)
 * are not taken for measurements.
 */
export function isFreshlyShaved(profile, overrides = null) {
  const zones = profile && profile.beard && profile.beard.zones;
  if (!zones) return false;
  const conf = (overrides && overrides.zones) || {};
  const ds = SHAVED_ZONES.filter((z) => !(conf[z] && ZONE_CONFIRM_DENSITY[conf[z]] !== undefined))
    .map((z) => zones[z] && zones[z].density)
    .filter(isNum);
  if (ds.length < 2) return false;
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  return mean < SHAVED_MEAN_BELOW && Math.max(...ds) < SHAVED_MAX_BELOW;
}

/**
 * Zone densities { zone: 0..100 | undefined } with the barber's confirmations applied.
 * Measured densities of a freshly shaved face are left out (unknown); confirmations count.
 */
export function zoneDensities(profile, overrides) {
  const zones = (profile && profile.beard && profile.beard.zones) || {};
  const conf = (overrides && overrides.zones) || {};
  const shaved = isFreshlyShaved(profile, overrides);
  const out = {};
  for (const z of ZONES) {
    if (conf[z] && ZONE_CONFIRM_DENSITY[conf[z]] !== undefined) out[z] = ZONE_CONFIRM_DENSITY[conf[z]];
    else if (!shaved && zones[z] && isNum(zones[z].density)) out[z] = clamp(zones[z].density, 0, 100);
  }
  return out;
}

/** The zone weights a style uses for Grow (normalised to sum 1); {} for the clean shave. */
export function styleWeights(style) {
  const src = style && style.weights && typeof style.weights === 'object' ? style.weights : null;
  let entries;
  if (src) {
    entries = Object.entries(src).filter(([z, w]) => ZONES.includes(z) && isNum(w) && w > 0);
  } else {
    const zones = (style && style.zones) || {};
    entries = Object.entries(FALLBACK_WEIGHTS).filter(([z]) => isNum(zones[z]) && zones[z] > 0);
  }
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return total > 0 ? Object.fromEntries(entries.map(([z, w]) => [z, w / total])) : {};
}

/**
 * Grow term and grow-ability for one style: { grow 0..1, growability 0..100 | null,
 * weak: [zone], needs: [zone], allKnown }. Unknown zones count as 50 and are never called weak.
 * A style that needs no zone (clean shave) has Grow 1: any face can wear it.
 */
export function growFor(style, densities) {
  const weights = styleWeights(style);
  const needs = Object.keys(weights);
  if (!needs.length) return { grow: 1, growability: 100, weak: [], needs, allKnown: true };
  const required = (style && style.required) || {};
  let grow = 0;
  let mean = 0;
  let known = 0;
  const weak = [];
  for (const z of needs) {
    const w = weights[z];
    const req = isNum(required[z]) && required[z] > 0 ? required[z] : 50;
    const d = densities ? densities[z] : undefined;
    const has = isNum(d);
    const dd = has ? d : NEUTRAL.density;
    grow += w * Math.min(1, dd / req);
    mean += w * dd;
    if (has) {
      known += 1;
      if (d < Math.min(WEAK_DENSITY, req)) weak.push(z);
    }
  }
  return { grow: clamp(grow, 0, 1), growability: known ? Math.round(mean) : null, weak, needs, allKnown: known === needs.length };
}

/**
 * Beard / skin contrast: { level 0..1 | null, beardDarker }. level 0 at |delta L*| <= 15,
 * 1 at >= 50. The beard L* is lifted toward grey by the grey ratio.
 */
export function contrastOf(profile) {
  const skin = profile && profile.skin;
  const beard = profile && profile.beard;
  let skinL = skin && Array.isArray(skin.lab) && isNum(skin.lab[0]) ? skin.lab[0] : null;
  if (skinL === null && skin && isNum(skin.mst) && skin.mst >= 1 && skin.mst <= 10) skinL = MST_L[Math.round(skin.mst) - 1];
  let beardL = beard && Array.isArray(beard.colorLab) && isNum(beard.colorLab[0]) ? beard.colorLab[0] : null;
  if (beardL === null && beard && COLOR_L.has(beard.colorId)) beardL = COLOR_L.get(beard.colorId);
  if (skinL === null || beardL === null) return { level: null, beardDarker: false };
  const g = beard && isNum(beard.greyRatio) ? clamp(beard.greyRatio, 0, 100) / 100 : 0;
  const L = beardL * (1 - g) + GREY_HAIR_L * g;
  const dL = skinL - L;
  return { level: clamp((Math.abs(dL) - 15) / 35, 0, 1), beardDarker: dL > 0 };
}

/** Contrast term (0..1) of a style at a contrast level. */
export function contrastFit(style, level) {
  const lc = lengthClassOf(style);
  if (!isNum(level) || lc === 'none') return NEUTRAL.contrast;
  const edge = style.lines && style.lines.edge;
  const d = EDGE_DEFINITION[edge] !== undefined ? EDGE_DEFINITION[edge] : 0.5;
  const v = VISIBILITY[lc];
  return clamp(level * (0.5 + 0.5 * d) + (1 - level) * (0.4 + 0.6 * v), 0, 1);
}

/** Age term (0..1). chosen: the customer picked this style himself (no theatrical drop). */
export function ageFitOf(style, band, chosen = false) {
  if (!band || chosen) return DEFAULT_AGE_FIT;
  const fit = style.ageFit && isNum(style.ageFit[band]) ? style.ageFit[band] : DEFAULT_AGE_FIT;
  return clamp(fit, 0, 1);
}

/** Daily grooming minutes a style needs. */
export function groomNeed(style) {
  const lc = lengthClassOf(style);
  const edge = style.lines && style.lines.edge;
  return GROOM_NEED[lc] + (EDGE_UPKEEP[edge] || 0);
}

/**
 * Life term (0..1) or null when neither question was answered.
 * Visit: a style that needs a trim more often than he visits loses points (0.4 + 0.6 x ratio);
 * stubble and the clean shave (trim every 4 days or less) are kept at home, so 5+ minutes
 * of daily grooming covers them. Grooming: 10+ minutes covers everything; less than the
 * style needs costs 1/12 per missing minute (floor 0.2).
 */
export function lifeFit(style, answers) {
  const a = answers || {};
  const trim = Math.max(1, Number(style.trimDays) || 7);
  const grooming = isNum(a.grooming) ? a.grooming : null;
  const parts = [];
  const visit = VISIT_DAYS[a.visitFrequency];
  if (visit) {
    const r = trim / visit;
    let v = r >= 1 ? 1 : 0.4 + 0.6 * r;
    if (trim <= 4 && grooming !== null && grooming >= 5) v = Math.max(v, 0.85);
    parts.push(v);
  }
  if (grooming !== null) {
    const need = groomNeed(style);
    parts.push(grooming >= 10 || grooming >= need ? 1 : clamp(1 - (need - grooming) / 12, 0.2, 1));
  }
  if (!parts.length) return null;
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

/** Whether the Eid / wedding occasion boosts this style (crisp or razor lines, or tagged 'eid'). */
export function eidBoosted(style) {
  const edge = style.lines && style.lines.edge;
  return edge === 'crisp' || edge === 'razor' || (Array.isArray(style.tags) && style.tags.includes('eid'));
}

function localOf(style, settings) {
  const map = settings && settings.localFit && typeof settings.localFit === 'object' ? settings.localFit : null;
  const v = map && isNum(map[style.id]) ? map[style.id] : Number(style.localFit);
  return clamp(Number.isFinite(v) ? v : 3, 0, 5) / 5;
}

function topOf(shares, profile) {
  if (!shares) return null;
  const fs = profile && profile.faceShape;
  const keys = Object.keys(shares);
  if (keys.length === 1) return keys[0];
  if (fs && fs.top && shares[fs.top] !== undefined) return fs.top;
  return SHAPES.reduce((best, s) => ((shares[s] || 0) > (shares[best] || 0) ? s : best), SHAPES[0]);
}

/** Context shared by every style of one recommend() call. */
export function buildContext(profile, { answers = null, settings = null, overrides = null, chosen = null } = {}) {
  const a = answers || {};
  const shares = faceShares(profile, overrides);
  const contrast = contrastOf(profile);
  const band = (overrides && overrides.ageBand) || (profile && profile.ageBand && profile.ageBand.band) || null;
  return {
    profile: profile || null,
    answers: a,
    settings: settings || {},
    shares,
    top: topOf(shares, profile),
    densities: zoneDensities(profile, overrides),
    contrast,
    band,
    chosen: new Set(Array.isArray(chosen) ? chosen : []),
    eid: a.occasion === 'eid',
  };
}

/** Ranked entry for one style (ignores hiding rules). */
export function scoreStyle(style, ctx) {
  const params = paramsFromStyle(style, { profile: ctx.profile });
  const jaw = jawlineDetail(ctx.profile, params);
  const face = faceFit(style, ctx.shares);
  const g = growFor(style, ctx.densities);
  const contrast = contrastFit(style, ctx.contrast.level);
  const age = ageFitOf(style, ctx.band, ctx.chosen.has(style.id));
  const lifeRaw = lifeFit(style, ctx.answers);
  const life = lifeRaw === null ? NEUTRAL.life : lifeRaw;
  const local = localOf(style, ctx.settings);
  const base =
    100 *
    (WEIGHTS.face * face +
      WEIGHTS.grow * g.grow +
      WEIGHTS.contrast * contrast +
      WEIGHTS.age * age +
      WEIGHTS.life * life +
      WEIGHTS.local * local);
  const penalty = g.weak.length ? WEAK_PENALTY : 0;
  const boost = ctx.eid && eidBoosted(style) ? EID_BOOST : 0;
  const raw = Math.round((base - penalty + boost) * 1000) / 1000;
  const score = clamp(round1(raw), 0, 100);
  const parts = { face, grow: g.grow, contrast, age, life, local };
  const reasons = pickReasons({
    style: { ...style, lengthClass: lengthClassOf(style) },
    parts,
    weak: g.weak,
    needsZones: g.needs,
    growKnown: g.allKnown,
    faceChip: faceChipFor(ctx.shares, ctx.top, jaw),
    contrastLevel: ctx.contrast.level,
    beardDarker: ctx.contrast.beardDarker,
    eid: boost > 0,
  });
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    styleId: style.id,
    style,
    score,
    rawScore: raw,
    growability: g.growability,
    growUnknown: !g.allKnown,
    reasons,
    warnings: warningsFor(g.weak),
    jawline: { lengthPct: jaw.lengthPct, jawSoftPct: jaw.jawSoftPct, widthPct: jaw.widthPct },
    trim: trimReason(style.trimDays),
    parts: {
      face: r3(face),
      grow: r3(g.grow),
      contrast: r3(contrast),
      age: r3(age),
      life: r3(life),
      local: r3(local),
      penalty,
      boost,
      points: {
        face: round1(POINTS.face * face),
        grow: round1(POINTS.grow * g.grow),
        contrast: round1(POINTS.contrast * contrast),
        age: round1(POINTS.age * age),
        life: round1(POINTS.life * life),
        local: round1(POINTS.local * local),
      },
    },
  };
}

/**
 * Sort order of Ranked lists: score desc, then style.order, then id. Scores clamped at 100
 * (the Eid boost can pass it) are told apart by the unclamped rawScore first.
 */
export function compareRanked(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const ra = isNum(a.rawScore) ? a.rawScore : a.score;
  const rb = isNum(b.rawScore) ? b.rawScore : b.score;
  if (rb !== ra) return rb - ra;
  const oa = isNum(a.style.order) ? a.style.order : Number.MAX_SAFE_INTEGER;
  const ob = isNum(b.style.order) ? b.style.order : Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return String(a.styleId) < String(b.styleId) ? -1 : String(a.styleId) > String(b.styleId) ? 1 : 0;
}

/**
 * Ranks the styles for a face (PRD 6.1). profile: FaceProfile (the effective one, with
 * overrides applied) or null; styles: catalog styles (hidden ones are skipped);
 * opts: { answers, settings, overrides (session overrides: faceShape, ageBand, zones),
 * chosen (style ids the customer picked himself) }. Returns Ranked[] without the styles
 * the work rule hides.
 */
export function recommend(profile, styles, opts = {}) {
  const ctx = buildContext(profile, opts || {});
  const rule = ctx.answers.workRule || null;
  const out = [];
  const seen = new Set();
  for (const style of Array.isArray(styles) ? styles : []) {
    if (!style || !style.id || style.hidden === true || seen.has(style.id)) continue;
    seen.add(style.id);
    if (!workRuleAllows(style, rule)) continue;
    out.push(scoreStyle(style, ctx));
  }
  out.sort(compareRanked);
  return out;
}

/** Number of visible styles a work rule hides (for the "hidden by the work rule" notice). */
export function hiddenByWorkRule(styles, rule) {
  return (Array.isArray(styles) ? styles : []).filter((s) => s && s.hidden !== true && !workRuleAllows(s, rule)).length;
}
