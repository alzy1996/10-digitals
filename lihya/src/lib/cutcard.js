// Cut Card logic (PRD 3.1, 4.3, 4.6, 4.7, 11.1): the approved look becomes a measured
// cut plan. Pure functions, no React, no Firebase: the Cut Card screen, the PDF/PNG,
// the stored consultation summary and the tests all share this.
//
// buildCutCard({ params, profile, style, guardChart, colors, safety, growthMmPerDay, now, front })
//   -> { rows, cheekLine, neckline, mustacheEdge, sideburn, color, finish, trimDays, nextVisitDays, approx, ... }
//
// Notes and flags are language-neutral ({ key, vars } and ids); CutCardDocument
// translates them with the report namespace (src/lib/i18n/ns/report.json).
// Left and right are always the customer's own sides.

import { mmToGuard, DEFAULT_GUARD_CHART } from './guards.js';
import { LIMITS } from '../config/app.js';
import { addDaysToKey, dayKey as muscatDayKey, toDate } from './time.js';
import {
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
} from '../ai/mesh/zones.js';
import COLORS from '../data/colors.json';
import LINES from '../data/lines.json';
import REASONS from '../data/reasons.json';

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
 * Cheek-line height above the jaw at mid-cheek (mm) per cheek-line type when no front
 * shot is available: measured with cheekLineHeight on the MediaPipe canonical face
 * model (metric, adult) seen from the front. tests/unit/cutcard.test.js re-measures
 * them, so they stay in step with the mesh lines and lines.json.
 */
export const CHEEK_DEFAULT_MM = Object.freeze({ natural: 30, low: 20, medium: 28, high: 40, curved: 35, straight: 30 });
/** Height of the LOW (cheekOffset -1) and HIGH (cheekOffset +1) limit lines on the canonical face (mm). */
export const CHEEK_LIMIT_MM = Object.freeze({ low: 14, high: 44 });

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
    const answer = answers[id] === undefined ? null : answers[id];
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
 * Suggested days to the next visit: the time the shortest kept zone needs to grow
 * out of shape (a quarter of its length, at least 2 mm) at the client's growth rate,
 * 7..42 days. A fully shaved look gets the weekly minimum.
 */
export function suggestNextVisitDays(zonesMm, growthMmPerDay) {
  const rate = effectiveGrowth(growthMmPerDay);
  const kept = Object.values(zoneMap(zonesMm)).filter((mm) => mm > SHAVE_MM);
  if (!kept.length) return NEXT_VISIT_MIN_DAYS;
  const tolerance = Math.max(2, Math.min(...kept) * 0.25);
  return clamp(Math.round(tolerance / rate), NEXT_VISIT_MIN_DAYS, NEXT_VISIT_MAX_DAYS);
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

/**
 * Build the Cut Card for an approved look (ARCHITECTURE 6).
 *
 * @param {object} o
 * @param {object} o.params LookParams (zones in mm, lines, mustacheId, fadeStartMm, colorId, greyTarget, finish, shape)
 * @param {object} [o.profile] effective FaceProfile (scale.mmPerPx, beard.zones[z].lengthMm)
 * @param {object} [o.style] the style (trimDays, zones fallback, shape)
 * @param {Array}  [o.guardChart] the shop's guard chart (settings.guardChart)
 * @param {Array}  [o.colors] colors catalog (src/data/colors.json shape)
 * @param {object} [o.safety] session safety answers
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
  growthMmPerDay = null,
  now = new Date(),
  front = null,
} = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const zonesIn = p.zones || (style && style.zones) || {};
  const lines = { ...((style && style.lines) || {}), ...(p.lines || {}) };
  const shape = p.shape || (style && style.shape) || {};
  const chart = Array.isArray(guardChart) && guardChart.length ? guardChart : DEFAULT_GUARD_CHART;
  const beardZones = (profile && profile.beard && profile.beard.zones) || {};
  const sideburnJoin = lines.sideburn || 'blended';
  const fade = fadeOf(p, style) || (sideburnJoin === 'skin-fade' ? { from: 0, to: null } : null);

  const rows = CUT_ZONES.map((zone) => {
    const mm = Math.max(0, round1(numOr(zonesIn[zone], 0)));
    const g = mmToGuard(mm, chart);
    const guard = { kind: g.kind, guardId: g.guardId, label: g.label, mm: g.mm };
    const current = beardZones[zone] && isNum(beardZones[zone].lengthMm) ? round1(beardZones[zone].lengthMm) : null;
    const note = rowNote({ zone, mm, guard, currentMm: current, fade, params: p, shape });
    return { zone, mm, guard, note, shaved: g.kind === 'shave', currentMm: current };
  });

  const cheekType = lines.cheek || 'natural';
  const cheek = cheekLineHeight({
    type: cheekType,
    offset: lines.cheekOffset,
    front,
    mmPerPx: profile && profile.scale ? profile.scale.mmPerPx : null,
  });
  const neckline = necklinePosition(lines.neckline || '2f', lines.necklineOffset);
  const growth = effectiveGrowth(growthMmPerDay);
  const zonesMm = Object.fromEntries(rows.map((r) => [r.zone, r.mm]));
  const nextVisitDays = suggestNextVisitDays(zonesMm, growth);
  const at = toDate(now);
  const created = Number.isNaN(at.getTime()) ? new Date() : at;
  const colorId = p.colorId || 'natural';
  const color = colorSafety(colorId, safety, colors);
  const grey = numOr(p.greyTarget, NaN);

  return {
    version: CUT_CARD_VERSION,
    styleId: p.styleId || (style && style.id) || null,
    rows,
    shavedZones: rows.filter((r) => r.shaved).map((r) => r.zone),
    cheekLine: { type: cheekType, mmAboveJaw: cheek.mm, offset: clamp(numOr(lines.cheekOffset, 0), -1, 1), source: cheek.source },
    neckline,
    mustacheEdge: lines.mustacheEdge || 'at',
    mustache: { id: p.mustacheId || null, mm: zonesMm.M, edge: lines.mustacheEdge || 'at' },
    sideburn: {
      join: sideburnJoin,
      fadeStartMm: fade ? round1(fade.from) : null,
      fadeEndMm: fade ? round1(fade.to !== null && fade.to > fade.from ? fade.to : Math.max(zonesMm.B_L, zonesMm.B_R)) : null,
    },
    edge: lines.edge || 'soft',
    color: { ...color, greyTarget: Number.isFinite(grey) ? Math.round(grey) : null },
    finish: p.finish || 'matte',
    trimDays: style && isNum(style.trimDays) && style.trimDays > 0 ? style.trimDays : null,
    nextVisitDays,
    nextVisitDayKey: nextVisitDate(nextVisitDays, created).dayKey,
    growthMmPerDay: growth,
    approx: true,
    createdAt: created.toISOString(),
  };
}

/** Zones (mm) of a card, for recordVisitLengths and the share text. */
export function cutCardZonesMm(card) {
  const out = {};
  for (const r of (card && card.rows) || []) out[r.zone] = r.mm;
  return out;
}
