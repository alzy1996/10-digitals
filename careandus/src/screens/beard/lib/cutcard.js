// Cut Card logic (PRD 3.1, 4.3, 4.6, 4.7, 11.1): the approved look becomes a measured
// cut plan. Pure functions, no React, no Firebase: the Cut Card screen, the PDF/PNG,
// the stored consultation summary and the tests all share this.
//
// buildCutCard({ params, profile, style, guardChart, colors, safety, answers, growthMmPerDay, now, front })
//   -> { rows, cheekLine, neckline, mustacheEdge, sideburn, color, finish, trimDays, nextVisitDays,
//        nextVisitBasis, approx, ... }
//
// The params are normalised first (cutCardParams), so a look from a restored session or
// a Look Code can never put an unknown id or an out-of-range number on the printed card.
//
// Notes and flags are language-neutral ({ key, vars } and ids); CutCardDocument
// translates them with the report namespace (src/lib/i18n/ns/report.json).
// Left and right are always the customer's own sides.

import { mmToGuard, validateGuardChart, DEFAULT_GUARD_CHART } from './guards.js';
import { LIMITS } from './config.js';
import { addDaysToKey, dayKey as muscatDayKey, toDate } from './time.js';
import { clampParams, COLOR_IDS, FINISH_IDS, LINE_ENUMS, MUSTACHE_IDS, DEFAULT_COLOR_ID, DEFAULT_FINISH } from '../../../ai/beard/lib/look.js';
import { CUT_CARD_LANDMARKS, VISIT_DAYS } from '../../../ai/beard/index.js';
import COLORS from '../../../data/beard/colors.json';
import LINES from '../../../data/beard/lines.json';
import REASONS from '../../../data/beard/reasons.json';

export const CUT_CARD_VERSION = 1;

/** Zones in Cut Card order (same ids as src/ai/mesh/zones.js), customer's own left / right. */
export const CUT_ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);

/** A zone at or under this length is shaved (matches mmToGuard). */
export const SHAVE_MM = 0.25;

/** One finger above the Adam's apple is about 15 mm; two fingers about 30 mm ("about 3 cm", PRD 4.3). */
export const FINGER_MM = 15;
/** necklineOffset -1..1 moves the neckline by up to this many mm (positive = higher, away from the Adam's apple). */
export const NECKLINE_OFFSET_MM = 10;

/**
 * Cheek-line height above the jaw at mid-cheek (mm) per cheek-line type, used when the
 * card has no front shot with an iris scale. Measured with cheekLineHeight on a
 * frontal adult portrait run through the app's own pipeline (MediaPipe landmarks,
 * iris scale 11.7 mm); the card marks them "typical face, check by eye".
 */
export const CHEEK_DEFAULT_MM = Object.freeze({ natural: 34, low: 25, medium: 33, high: 45, curved: 38, straight: 34 });
/** Height of the LOW (cheekOffset -1) and HIGH (cheekOffset +1) limit lines on that portrait (mm). */
export const CHEEK_LIMIT_MM = Object.freeze({ low: 17, high: 50 });

/** Next visit suggestion bounds (days). */
export const NEXT_VISIT_MIN_DAYS = 7;
export const NEXT_VISIT_MAX_DAYS = 42;

/** Growth learning bounds (PRD 4.7), same as the client service. */
export const GROWTH_MIN = 0.1;
export const GROWTH_MAX = 1.5;
/** Growth rate range the owner can set in Settings (same as the shop settings limits). */
export const SHOP_GROWTH_MIN = 0.05;
export const SHOP_GROWTH_MAX = 2;
const LEARN_MIN_DAYS = 3;
const LEARN_MAX_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;
const {
  JAW_CONTOUR,
  MOUTH_CORNERS,
  CHIN_BOTTOM,
  FOREHEAD_TOP,
  CHEEK_LINE_NATURAL_L,
  CHEEK_LINE_NATURAL_R,
  CHEEK_LINE_HIGH_L,
  CHEEK_LINE_HIGH_R,
  CHEEK_LINE_LOW_L,
  CHEEK_LINE_LOW_R,
  MUSTACHE_EDGE_L,
  MUSTACHE_EDGE_R,
} = CUT_CARD_LANDMARKS;
const SAFETY_ORDER = ['patchTest48h', 'metallicSaltProducts', 'pureHenna', 'irritationToday'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const numOr = (v, d) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) ? n : d;
};

const LINE_OPTIONS = new Map(LINES.types.map((t) => [t.id, new Map(t.options.map((o) => [o.id, o]))]));
const SAFETY_QUESTIONS = new Map((REASONS.safetyQuestions || []).map((q) => [q.id, q]));

function lineOption(type, id) {
  const m = LINE_OPTIONS.get(type);
  return (m && m.get(id)) || null;
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/* ------------------------------------------------------------------ cheek line */

// The cheek line is built exactly as the renderer draws it (src/ai/render/layout.js
// cheekLine, in face-texture space), here in image pixels of the front shot, so the
// height on the card is the line the customer approved on screen:
//   natural            the natural mesh line
//   jaw-curve types    LOW..HIGH limit lines mixed by lines.json "level" (low, medium)
//   natural-curve      NATURAL..HIGH (level >= 0.5) or LOW..NATURAL (level < 0.5) (high)
//   straight / curved  from the sideburn bottom to the mustache edge at "level"
//                      between the LOW and HIGH line ends; curved bulges toward the eye
// then cheekOffset blends the whole line toward HIGH (+1) or LOW (-1), and the end is
// snapped onto the mustache edge.

const CHEEK_SIDES = Object.freeze({
  L: { natural: CHEEK_LINE_NATURAL_L, high: CHEEK_LINE_HIGH_L, low: CHEEK_LINE_LOW_L, edge: MUSTACHE_EDGE_L, mouth: MOUTH_CORNERS.L },
  R: { natural: CHEEK_LINE_NATURAL_R, high: CHEEK_LINE_HIGH_R, low: CHEEK_LINE_LOW_R, edge: MUSTACHE_EDGE_R, mouth: MOUTH_CORNERS.R },
});
const LINE_SAMPLES = 25;
/** Bulge of the curved line: the control point sits this fraction of the chord away from its middle. */
const CURVE_BULGE = 0.22;

const vSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const vScale = (a, s) => [a[0] * s, a[1] * s];
const vLen = (a) => Math.hypot(a[0], a[1]);
const vMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function arcLengths(poly) {
  const out = [0];
  for (let k = 1; k < poly.length; k++) out.push(out[k - 1] + vLen(vSub(poly[k], poly[k - 1])));
  return out;
}

function pointAtArc(poly, cum, s) {
  if (s <= 0) return poly[0].slice();
  for (let k = 1; k < poly.length; k++) {
    if (s <= cum[k]) {
      const seg = cum[k] - cum[k - 1];
      return vMix(poly[k - 1], poly[k], seg > 1e-12 ? (s - cum[k - 1]) / seg : 0);
    }
  }
  return poly[poly.length - 1].slice();
}

/** n points evenly spaced by arc length. */
function resample(poly, n) {
  const cum = arcLengths(poly);
  const total = cum[cum.length - 1];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pointAtArc(poly, cum, (total * i) / (n - 1)));
  return out;
}

/** Closest point of a polyline to p. */
function projectOnPolyline(poly, p) {
  let best = poly[0];
  let bestD = Infinity;
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1];
    const ab = vSub(poly[k], a);
    const l2 = ab[0] * ab[0] + ab[1] * ab[1];
    const t = l2 > 1e-12 ? clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2, 0, 1) : 0;
    const q = vAdd(a, vScale(ab, t));
    const d = vLen(vSub(p, q));
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function bezier2(a, c, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** { level, curve } of a cheek line type (lines.json), natural when unknown. */
function cheekOption(type) {
  const o = lineOption('cheek', type);
  if (!o) return { level: null, curve: 'natural' };
  return { level: isNum(o.level) ? clamp(o.level, 0, 1) : null, curve: o.curve || 'natural' };
}

/**
 * One side's cheek line in image pixels (same construction as the renderer).
 * `up` is the face-up unit vector in the image (chin toward forehead).
 */
function cheekLinePx(P, up, side, type, offset) {
  const def = CHEEK_SIDES[side];
  const N = resample(def.natural.map(P), LINE_SAMPLES);
  const H = resample(def.high.map(P), LINE_SAMPLES);
  const Lo = resample(def.low.map(P), LINE_SAMPLES);
  const { level, curve } = cheekOption(type);
  const mixLines = (A, B, t) => A.map((p, i) => vMix(p, B[i], t));
  let line;
  if (curve === 'straight' || curve === 'curved') {
    const start = N[0];
    const end = vMix(Lo[Lo.length - 1], H[H.length - 1], level === null ? 0.5 : level);
    if (curve === 'straight') {
      line = resample([start, end], LINE_SAMPLES);
    } else {
      const d = vSub(end, start);
      let nrm = [-d[1], d[0]];
      if (nrm[0] * up[0] + nrm[1] * up[1] < 0) nrm = vScale(nrm, -1);
      line = bezier2(start, vAdd(vMix(start, end, 0.5), vScale(nrm, CURVE_BULGE)), end, LINE_SAMPLES);
    }
  } else if (curve === 'jaw') {
    line = mixLines(Lo, H, level === null ? 0.25 : level);
  } else if (level === null) {
    line = N;
  } else if (level >= 0.5) {
    line = mixLines(N, H, (level - 0.5) / 0.5);
  } else {
    line = mixLines(Lo, N, level / 0.5);
  }
  const off = clamp(offset, -1, 1);
  if (off > 0) line = mixLines(line, H, off);
  else if (off < 0) line = mixLines(line, Lo, -off);
  line = line.slice();
  line[line.length - 1] = projectOnPolyline(def.edge.map(P), line[line.length - 1]);
  return line;
}

/** V values where a polyline crosses the face-vertical line U = u. */
function crossings(points, u, U, V) {
  const hits = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k];
    const b = points[k + 1];
    const ua = U(a);
    const ub = U(b);
    if (ua === ub || (ua - u) * (ub - u) > 0) continue;
    const t = (u - ua) / (ub - ua);
    hits.push(V(a) + t * (V(b) - V(a)));
  }
  return hits;
}

function landmarkSource(front) {
  if (!front) return null;
  const landmarks = front.landmarks;
  const width = front.width || (front.canvas && front.canvas.width);
  const height = front.height || (front.canvas && front.canvas.height);
  if (!Array.isArray(landmarks) || landmarks.length < 468 || !width || !height) return null;
  return { landmarks, width, height };
}

/**
 * Cheek-line height above the jaw at mid-cheek, in pixels, averaged over both sides
 * (null when it cannot be measured). Mid-cheek is halfway across the face between the
 * sideburn end of the cheek line and the mouth corner; the height is measured along
 * the face's own vertical (head roll does not matter).
 */
function cheekHeightPx(src, type, offset) {
  const { landmarks, width, height } = src;
  const P = (i) => {
    const l = landmarks[i];
    return [(l.x !== undefined ? l.x : l[0]) * width, (l.y !== undefined ? l.y : l[1]) * height];
  };
  const top = P(FOREHEAD_TOP);
  const chin = P(CHIN_BOTTOM);
  const dl = vLen(vSub(top, chin));
  if (!(dl > 0)) return null;
  const up = [(top[0] - chin[0]) / dl, (top[1] - chin[1]) / dl];
  const across = [-up[1], up[0]];
  const U = (p) => p[0] * across[0] + p[1] * across[1];
  const V = (p) => p[0] * up[0] + p[1] * up[1];
  const jaw = JAW_CONTOUR.map(P);
  const out = [];
  for (const side of ['L', 'R']) {
    const def = CHEEK_SIDES[side];
    const u = (U(P(def.natural[0])) + U(P(def.mouth))) / 2;
    const lineHits = crossings(cheekLinePx(P, up, side, type, offset), u, U, V);
    const jawHits = crossings(jaw, u, U, V);
    if (!lineHits.length || !jawHits.length) continue;
    const px = Math.max(...lineHits) - Math.min(...jawHits);
    if (px > 0) out.push(px);
  }
  return out.length ? out.reduce((s, x) => s + x, 0) / out.length : null;
}

/**
 * Cheek-line height above the jaw at mid-cheek (mm). With a front shot and the iris
 * scale it is measured on the customer's own face; otherwise the documented defaults
 * (CHEEK_DEFAULT_MM, measured the same way on the metric canonical face) are used,
 * with cheekOffset moving the height toward CHEEK_LIMIT_MM.high (+1) or .low (-1)
 * just as the renderer blends the line toward the HIGH or LOW limit line.
 * @returns {{ mm: number, source: 'measured'|'default' }}
 */
export function cheekLineHeight({ type = 'natural', offset = 0, front = null, mmPerPx = null } = {}) {
  const off = clamp(numOr(offset, 0), -1, 1);
  const id = lineOption('cheek', type) ? type : 'natural';
  const src = landmarkSource(front);
  const scale = numOr(mmPerPx, NaN);
  if (src && scale > 0) {
    try {
      const px = cheekHeightPx(src, id, off);
      if (px !== null) return { mm: Math.round(px * scale), source: 'measured' };
    } catch (err) {
      console.warn('cutcard: cheek line could not be measured, using defaults', err);
    }
  }
  const base = CHEEK_DEFAULT_MM[id] ?? CHEEK_DEFAULT_MM.natural;
  const target = off > 0 ? CHEEK_LIMIT_MM.high : CHEEK_LIMIT_MM.low;
  return { mm: Math.round(base + (target - base) * Math.abs(off)), source: 'default' };
}

/* ------------------------------------------------------------------ neckline */

/**
 * Neckline position (PRD 4.3): 1 finger about 15 mm, 2 fingers about 30 mm above the
 * Adam's apple, moved by necklineOffset (+ raises it). "Follows jaw" has no finger
 * measure: the neck is cleaned right up to the jaw curve.
 */
export function necklinePosition(type = '2f', offset = 0) {
  const opt = lineOption('neckline', type);
  const followsJaw = type === 'jaw' || Boolean(opt && opt.followsJaw);
  const squared = type === 'squared' || Boolean(opt && opt.squared);
  if (followsJaw) return { type: 'jaw', fingers: null, mmAboveAdamsApple: null, followsJaw: true, squared: false };
  const baseFingers = isNum(opt && opt.fingers) ? opt.fingers : type === '1f' ? 1 : 2;
  const baseMm = isNum(opt && opt.mmAboveAdamsApple) ? opt.mmAboveAdamsApple : baseFingers * FINGER_MM;
  const mm = Math.round(clamp(baseMm + clamp(numOr(offset, 0), -1, 1) * NECKLINE_OFFSET_MM, 5, 60));
  return {
    type: opt ? type : '2f',
    fingers: Math.max(1, Math.round(mm / FINGER_MM)),
    mmAboveAdamsApple: mm,
    followsJaw: false,
    squared,
  };
}

/* ------------------------------------------------------------------ color safety */

function safetyIdsFor(color) {
  if (!color) return [];
  if (Array.isArray(color.safety)) return SAFETY_ORDER.filter((id) => color.safety.includes(id));
  if (color.chemical === true) return SAFETY_ORDER.slice();
  if (color.type === 'vegetable') return ['metallicSaltProducts', 'irritationToday'];
  if (color.type === 'temporary') return ['irritationToday'];
  return [];
}

const RISK_FALLBACK = {
  patchTest48h: [false, null],
  metallicSaltProducts: ['yes', 'unsure', null],
  pureHenna: [true],
  irritationToday: [true],
};

/**
 * Safety questions for a color with the session answers (PRD 4.4, 11.1).
 * safetyFlags = the questions whose answer is a risk by reasons.json riskWhen (an
 * unanswered patch test or metallic-salt question counts as a risk). `level` per
 * question: 'ask' (not answered yet: the barber asks now), 'stop' (answered with a
 * risk: no chemical service today) or 'ok'.
 */
export function colorSafety(colorId, safety, colors = COLORS) {
  const list = Array.isArray(colors) && colors.length ? colors : COLORS;
  const color = list.find((c) => c && c.id === colorId) || null;
  const answers = safety && typeof safety === 'object' ? safety : {};
  const questions = safetyIdsFor(color).map((id) => {
    const q = SAFETY_QUESTIONS.get(id);
    const riskWhen = q && Array.isArray(q.riskWhen) ? q.riskWhen : RISK_FALLBACK[id] || [];
    // Only a yes/no or a chip id is an answer; anything else reads as not answered yet.
    const given = answers[id];
    const answer = typeof given === 'boolean' || (typeof given === 'string' && given !== '') ? given : null;
    const risk = riskWhen.includes(answer);
    return { id, answer, risk, level: answer === null ? 'ask' : risk ? 'stop' : 'ok' };
  });
  return {
    id: color ? color.id : colorId || 'natural',
    type: color ? color.type : 'none',
    chemical: Boolean(color && color.chemical),
    safetyFlags: questions.filter((q) => q.risk).map((q) => q.id),
    questions,
    blocked: questions.some((q) => q.level === 'stop'),
  };
}

/* ------------------------------------------------------------------ growth and visits */

function zoneMap(v) {
  const src = v && typeof v === 'object' ? v.zonesMm || v.zones || v : {};
  const out = {};
  for (const z of CUT_ZONES) {
    const n = numOr(src[z], NaN);
    if (Number.isFinite(n) && n >= 0) out[z] = n;
  }
  return out;
}

/**
 * Learned growth rate (PRD 4.7) from two measured visits:
 * prev = { zonesMm, at } (what the client left with), curr = { zonesMm, at } (measured
 * at the start of the next visit). Median growth over the zones that grew, mm/day,
 * clamped to 0.1..1.5 and rounded to 2 decimals. null when it cannot learn (fewer than
 * 3 or more than 120 days apart, or no zone grew).
 */
export function growthRateFromVisits(prev, curr) {
  if (!prev || !curr) return null;
  const a = toDate(prev.at);
  const b = toDate(curr.at);
  const days = (b.getTime() - a.getTime()) / DAY_MS;
  if (!Number.isFinite(days) || days < LEARN_MIN_DAYS || days > LEARN_MAX_DAYS) return null;
  const before = zoneMap(prev);
  const after = zoneMap(curr);
  const rates = [];
  for (const z of CUT_ZONES) {
    if (before[z] === undefined || after[z] === undefined || after[z] <= before[z]) continue;
    rates.push((after[z] - before[z]) / days);
  }
  const m = median(rates);
  return m === null ? null : round2(clamp(m, GROWTH_MIN, GROWTH_MAX));
}

/**
 * Growth rate to use: the client's learned rate or the shop's default (Settings,
 * 0.05..2 mm/day) when valid, else the PRD default 0.4 mm/day.
 */
export function effectiveGrowth(growthMmPerDay) {
  const g = numOr(growthMmPerDay, NaN);
  return Number.isFinite(g) && g > 0 ? clamp(g, SHOP_GROWTH_MIN, SHOP_GROWTH_MAX) : LIMITS.growthMmPerDayDefault;
}

/**
 * The style's trim interval for this customer (days): style.trimDays is written for the
 * PRD default growth of 0.4 mm/day, so a faster grower needs the trim sooner and a slower
 * one later (trimDays x 0.4 / rate), 1..42 days. null when the style has none.
 */
export function trimIntervalDays(trimDays, growthMmPerDay) {
  const base = numOr(trimDays, NaN);
  if (!(base > 0)) return null;
  const rate = effectiveGrowth(growthMmPerDay);
  return clamp(Math.round((base * LIMITS.growthMmPerDayDefault) / rate), 1, NEXT_VISIT_MAX_DAYS);
}

/** Days between shop visits for a visit-frequency answer ('weekly' 7, 'biweekly' 14, 'monthly' 30), else null. */
export function visitFrequencyDays(answer) {
  const days = typeof answer === 'string' && Object.prototype.hasOwnProperty.call(VISIT_DAYS, answer) ? VISIT_DAYS[answer] : null;
  return isNum(days) && days > 0 ? days : null;
}

/** Days the shortest kept zone takes to grow out of shape (a quarter of its length, at least 2 mm); null when nothing is kept. */
function growthToleranceDays(zonesMm, growthMmPerDay) {
  const kept = Object.values(zoneMap(zonesMm)).filter((mm) => mm > SHAVE_MM);
  if (!kept.length) return null;
  return Math.max(2, Math.min(...kept) * 0.25) / effectiveGrowth(growthMmPerDay);
}

/**
 * Next shop visit: one rule for the Cut Card, the stored consultation and the Done
 * screen (chair:F18). `need` is the style's trim interval for this customer
 * (trimIntervalDays); a style without one uses the growth tolerance of the shortest kept
 * zone. Then:
 *   need < 7 days (stubble, circle beard...): he keeps it up at home between visits and
 *     the shop visit follows how often he said he comes (weekly when he did not say)
 *     -> basis 'homeTrim' ('visits' / 'growth' for a style without a trim interval);
 *   he comes more often than the style needs -> his rhythm, basis 'visits';
 *   otherwise -> the trim interval, basis 'trim' ('growth' without one).
 * Always 7..42 days, so the card never shows a trim interval that disagrees with the
 * next visit without saying why (the basis is printed with it).
 *
 * @param {object} o
 * @param {number|null} [o.trimDays] the style's trimDays
 * @param {string|null} [o.visitFrequency] session.answers.visitFrequency
 * @param {object|null} [o.zonesMm] the approved lengths (for a style without trimDays)
 * @param {number|null} [o.growthMmPerDay] learned or shop growth rate
 * @returns {{ days: number, basis: 'trim'|'growth'|'visits'|'homeTrim', trimDays: number|null, visitDays: number|null }}
 */
export function nextVisitPlan({ trimDays = null, visitFrequency = null, zonesMm = null, growthMmPerDay = null } = {}) {
  const trim = trimIntervalDays(trimDays, growthMmPerDay);
  const visit = visitFrequencyDays(visitFrequency);
  const need = trim !== null ? trim : growthToleranceDays(zonesMm, growthMmPerDay);
  const fit = (days) => clamp(Math.round(days), NEXT_VISIT_MIN_DAYS, NEXT_VISIT_MAX_DAYS);
  let days;
  let basis;
  if (need === null || need < NEXT_VISIT_MIN_DAYS) {
    days = visit !== null ? visit : NEXT_VISIT_MIN_DAYS;
    basis = trim !== null ? 'homeTrim' : visit !== null ? 'visits' : 'growth';
  } else if (visit !== null && visit < need) {
    days = visit;
    basis = 'visits';
  } else {
    days = need;
    basis = trim !== null ? 'trim' : 'growth';
  }
  return { days: fit(days), basis, trimDays: trim, visitDays: visit };
}

/**
 * Suggested days to the next visit (nextVisitPlan(...).days), 7..42.
 * @param {{ trimDays?, visitFrequency?, zonesMm?, growthMmPerDay? }} o
 */
export function suggestNextVisitDays(o = {}) {
  return nextVisitPlan(o).days;
}

/** The Done screen's next-visit chips (days). */
export const NEXT_VISIT_CHIPS = Object.freeze([7, 14, 21, 30]);

/**
 * The next-visit chips with the suggestion itself among them (so a card's 10 or 42 days
 * is kept as it is, never snapped to the nearest chip), in order, without duplicates.
 */
export function nextVisitChoices(suggested) {
  const n = Number(suggested);
  const extra = suggested !== null && suggested !== undefined && Number.isFinite(n) && n > 0 ? [Math.round(n)] : [];
  return [...new Set([...NEXT_VISIT_CHIPS, ...extra])].sort((a, b) => a - b);
}

/** The next visit as a Date (same time of day, `days` later) and its Muscat dayKey. */
export function nextVisitDate(days, from = new Date()) {
  const start = toDate(from);
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const n = Math.max(0, Math.round(numOr(days, 0)));
  const date = new Date(base.getTime() + n * DAY_MS);
  return { date, dayKey: addDaysToKey(muscatDayKey(base), n) };
}

/* ------------------------------------------------------------------ rows */

function fadeOf(params, style) {
  const shape = (params && params.shape) || (style && style.shape) || {};
  const fadeB = Array.isArray(shape.fadeB) && shape.fadeB.length === 2 ? shape.fadeB.map((x) => numOr(x, NaN)) : null;
  const start = numOr(params && params.fadeStartMm, NaN);
  if (Number.isFinite(start)) return { from: Math.max(0, start), to: fadeB && Number.isFinite(fadeB[1]) ? fadeB[1] : null };
  if (fadeB && Number.isFinite(fadeB[0])) return { from: Math.max(0, fadeB[0]), to: Number.isFinite(fadeB[1]) ? fadeB[1] : null };
  return null;
}

function rowNote({ zone, mm, guard, currentMm, fade, params, shape }) {
  if (guard.kind === 'shave') return { key: 'report.note.shave', vars: {} };
  if ((zone === 'B_L' || zone === 'B_R') && fade) {
    const to = fade.to !== null && fade.to > fade.from ? Math.min(fade.to, mm) : mm;
    return { key: 'report.note.fade', vars: { from: round1(fade.from), to: round1(to) } };
  }
  if (isNum(currentMm) && currentMm + 1 < mm) {
    return { key: 'report.note.keepNatural', vars: { mm: round1(mm), now: round1(currentMm) } };
  }
  if (guard.kind === 'scissor') return { key: 'report.note.scissor', vars: { mm: Math.round(mm) } };
  if (zone === 'M' && params.mustacheId) return { key: 'report.note.mustache', vars: { id: params.mustacheId } };
  if (zone === 'C' && shape && shape.chin && shape.chin !== 'natural') return { key: 'report.note.chin', vars: { shape: shape.chin } };
  return null;
}

/* ------------------------------------------------------------------ build */

/** Line defaults when neither the look nor the style has a known option (same as src/lib/look.js). */
const DEFAULT_LINE_IDS = Object.freeze({ cheek: 'natural', neckline: '2f', sideburn: 'blended', edge: 'soft', mustacheEdge: 'at' });
const STYLE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

const isText = (v) => typeof v === 'string' && v !== '';

/**
 * The look the card prints, made safe (code:extra-1): params can come from the session
 * snapshot or a Look Code, so nothing is trusted. clampParams (src/lib/look.js) fills
 * and clamps every number (zones 0..200 mm, offsets -1..1, grey 0..100, fade start);
 * unknown ids fall back to the style's own value, then to the defaults: line options
 * per type, finish 'matte', color 'natural', mustache none, chin shape 'natural'.
 * The style fills what the look leaves out (zones, lines, shape).
 */
export function cutCardParams(params, style = null, colors = COLORS) {
  const raw = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const st = style && typeof style === 'object' ? style : {};
  const objOr = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  const p = clampParams({
    ...raw,
    zones: objOr(raw.zones) || objOr(st.zones) || {},
    lines: { ...(objOr(st.lines) || {}), ...(objOr(raw.lines) || {}) },
    shape: objOr(raw.shape) || objOr(st.shape) || {},
  });
  const styleLines = objOr(st.lines) || {};
  for (const type of Object.keys(DEFAULT_LINE_IDS)) {
    const allowed = LINE_ENUMS[type] || [];
    if (allowed.includes(p.lines[type])) continue;
    p.lines[type] = allowed.includes(styleLines[type]) ? styleLines[type] : DEFAULT_LINE_IDS[type];
  }
  const colorIds = Array.isArray(colors) && colors.length ? colors.filter((c) => c && isText(c.id)).map((c) => c.id) : COLOR_IDS;
  if (!colorIds.includes(p.colorId)) p.colorId = DEFAULT_COLOR_ID;
  if (!FINISH_IDS.includes(p.finish)) p.finish = DEFAULT_FINISH;
  if (p.mustacheId !== null && !MUSTACHE_IDS.includes(p.mustacheId)) p.mustacheId = MUSTACHE_IDS.includes(st.mustacheId) ? st.mustacheId : null;
  const ownId = isText(p.styleId) && STYLE_ID_RE.test(p.styleId) ? p.styleId : null;
  p.styleId = ownId || (isText(st.id) && STYLE_ID_RE.test(st.id) ? st.id : null);
  return p;
}

/** The shop chart when it is a valid chart (validateGuardChart), else the default chart. */
function chartOf(guardChart) {
  return Array.isArray(guardChart) && guardChart.length && validateGuardChart(guardChart).length === 0 ? guardChart : DEFAULT_GUARD_CHART;
}

/** A guard label as two strings (a shop chart label may be a plain string). */
function labelOf(label, fallback) {
  if (isText(label)) return { en: label, ar: label };
  const l = label && typeof label === 'object' ? label : {};
  const en = isText(l.en) ? l.en : isText(l.ar) ? l.ar : fallback;
  return { en, ar: isText(l.ar) ? l.ar : en };
}

/**
 * Build the Cut Card for an approved look (ARCHITECTURE 6).
 *
 * @param {object} o
 * @param {object} o.params LookParams (zones in mm, lines, mustacheId, fadeStartMm, colorId, greyTarget, finish, shape);
 *   normalised by cutCardParams, so a broken look still makes a valid card
 * @param {object} [o.profile] effective FaceProfile (scale.mmPerPx, beard.zones[z].lengthMm)
 * @param {object} [o.style] the style (trimDays, zones fallback, shape)
 * @param {Array}  [o.guardChart] the shop's guard chart (settings.guardChart)
 * @param {Array}  [o.colors] colors catalog (src/data/colors.json shape)
 * @param {object} [o.safety] session safety answers
 * @param {object} [o.answers] session answers (visitFrequency drives the next visit with the trim interval)
 * @param {number} [o.growthMmPerDay] the client's learned or the shop's default growth rate
 * @param {Date}   [o.now]
 * @param {object} [o.front] front Shot ({ landmarks, width, height }) to measure the cheek line
 */
export function buildCutCard({
  params,
  profile = null,
  style = null,
  guardChart = DEFAULT_GUARD_CHART,
  colors = COLORS,
  safety = null,
  answers = null,
  growthMmPerDay = null,
  now = new Date(),
  front = null,
} = {}) {
  const catalog = Array.isArray(colors) && colors.length ? colors : COLORS;
  const p = cutCardParams(params, style, catalog);
  const lines = p.lines;
  const shape = p.shape;
  const chart = chartOf(guardChart);
  const beardZones = (profile && profile.beard && profile.beard.zones) || {};
  const sideburnJoin = lines.sideburn;
  const fade = fadeOf(p, null) || (sideburnJoin === 'skin-fade' ? { from: 0, to: null } : null);

  const rows = CUT_ZONES.map((zone) => {
    const mm = Math.max(0, round1(numOr(p.zones[zone], 0)));
    const g = mmToGuard(mm, chart);
    const guard = { kind: g.kind, guardId: isText(g.guardId) ? g.guardId : null, label: labelOf(g.label, g.guardId || ''), mm: g.mm };
    const lengthMm = beardZones[zone] ? beardZones[zone].lengthMm : null;
    const current = isNum(lengthMm) && lengthMm >= 0 ? round1(lengthMm) : null;
    const note = rowNote({ zone, mm, guard, currentMm: current, fade, params: p, shape });
    return { zone, mm, guard, note, shaved: g.kind === 'shave', currentMm: current };
  });

  const cheekType = lines.cheek;
  const cheek = cheekLineHeight({
    type: cheekType,
    offset: lines.cheekOffset,
    front,
    mmPerPx: profile && profile.scale ? profile.scale.mmPerPx : null,
  });
  const neckline = necklinePosition(lines.neckline, lines.necklineOffset);
  const growth = effectiveGrowth(growthMmPerDay);
  const zonesMm = Object.fromEntries(rows.map((r) => [r.zone, r.mm]));
  const styleTrim = style && isNum(style.trimDays) && style.trimDays > 0 ? style.trimDays : null;
  const visitFrequency = answers && typeof answers === 'object' && isText(answers.visitFrequency) ? answers.visitFrequency : null;
  const plan = nextVisitPlan({ trimDays: styleTrim, visitFrequency, zonesMm, growthMmPerDay: growth });
  const at = toDate(now);
  const created = Number.isNaN(at.getTime()) ? new Date() : at;
  const color = colorSafety(p.colorId, safety, catalog);

  return {
    version: CUT_CARD_VERSION,
    styleId: p.styleId,
    rows,
    shavedZones: rows.filter((r) => r.shaved).map((r) => r.zone),
    cheekLine: { type: cheekType, mmAboveJaw: cheek.mm, offset: lines.cheekOffset, source: cheek.source },
    neckline,
    mustacheEdge: lines.mustacheEdge,
    mustache: { id: p.mustacheId, mm: zonesMm.M, edge: lines.mustacheEdge },
    sideburn: {
      join: sideburnJoin,
      fadeStartMm: fade ? round1(fade.from) : null,
      fadeEndMm: fade ? round1(fade.to !== null && fade.to > fade.from ? fade.to : Math.max(zonesMm.B_L, zonesMm.B_R)) : null,
    },
    edge: lines.edge,
    color: { ...color, greyTarget: p.greyTarget },
    finish: p.finish,
    trimDays: plan.trimDays,
    styleTrimDays: styleTrim,
    nextVisitDays: plan.days,
    nextVisitBasis: plan.basis,
    visitFrequency: plan.visitDays !== null ? visitFrequency : null,
    nextVisitDayKey: nextVisitDate(plan.days, created).dayKey,
    growthMmPerDay: growth,
    approx: true,
    createdAt: created.toISOString(),
  };
}

/** The visit-frequency answer the card should follow ('weekly' | 'biweekly' | 'monthly' | null). */
function answeredFrequency(answers) {
  const v = answers && typeof answers === 'object' ? answers.visitFrequency : null;
  return visitFrequencyDays(v) !== null ? v : null;
}

/**
 * true when a card's next visit was not planned with these answers (a card built before
 * the visit-frequency answer was passed in, or restored from an older session).
 */
export function needsVisitReplan(card, answers) {
  if (!card || typeof card !== 'object' || !Array.isArray(card.rows)) return false;
  return card.nextVisitBasis === undefined || (card.visitFrequency ?? null) !== answeredFrequency(answers);
}

/**
 * The same card with its next visit planned again for these answers (nextVisitPlan with
 * the card's own trim interval, lengths and growth rate). Everything else is unchanged.
 */
export function replanNextVisit(card, answers) {
  if (!card || typeof card !== 'object' || !Array.isArray(card.rows)) return card;
  const styleTrim = card.styleTrimDays !== undefined ? card.styleTrimDays : card.trimDays;
  const visitFrequency = answeredFrequency(answers);
  const plan = nextVisitPlan({ trimDays: styleTrim, visitFrequency, zonesMm: cutCardZonesMm(card), growthMmPerDay: card.growthMmPerDay });
  const at = toDate(card.createdAt);
  const created = Number.isNaN(at.getTime()) ? new Date() : at;
  return {
    ...card,
    trimDays: plan.trimDays,
    styleTrimDays: isNum(styleTrim) && styleTrim > 0 ? styleTrim : null,
    nextVisitDays: plan.days,
    nextVisitBasis: plan.basis,
    visitFrequency: plan.visitDays !== null ? visitFrequency : null,
    nextVisitDayKey: nextVisitDate(plan.days, created).dayKey,
  };
}

/** Zones (mm) of a card, for recordVisitLengths and the share text. */
export function cutCardZonesMm(card) {
  const out = {};
  for (const r of (card && card.rows) || []) out[r.zone] = r.mm;
  return out;
}
