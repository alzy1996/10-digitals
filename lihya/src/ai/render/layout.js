// Beard layout in face-texture space: every zone, line and mustache shape the barber
// designs, as polygons and polylines in normalised texture coordinates (0..1,
// y DOWN, i.e. x = u, y = 1 - v of the MediaPipe canonical UV). The procedural
// texture (beardTextures.js) and the Outline drawing (inpaint.js) rasterise these.
//
// Scale: the canonical face model is metric (cm); its UV layout maps about
// TEX_PER_MM texture units to one millimetre on the face.
//
// Left / right are the CUSTOMER'S own sides (see src/ai/mesh/zones.js): the
// customer's left side (_L, landmarks 263 / 454 / 291) has u > 0.5.

import { CANONICAL_UV } from '../mesh/uv.js';
import {
  ZONE_POLYGONS,
  CHEEK_LINE_NATURAL_L,
  CHEEK_LINE_NATURAL_R,
  CHEEK_LINE_HIGH_L,
  CHEEK_LINE_HIGH_R,
  CHEEK_LINE_LOW_L,
  CHEEK_LINE_LOW_R,
  MUSTACHE_EDGE_L,
  MUSTACHE_EDGE_R,
  JAW_CONTOUR,
  LIPS_OUTER,
} from '../mesh/zones.js';
import MUSTACHES from '../../data/mustaches.json';
import LINES from '../../data/lines.json';
import { clamp, isNum, lerp, smoothstep } from './util.js';

/** Texture units (0..1) per millimetre on the face. */
export const TEX_PER_MM = 0.0048;
/** Projected length of the jaw contour (ear to ear, front view), mm. */
export const JAW_ARC_MM = 278;

/** Zone of each JAW_CONTOUR point (customer's sides). */
export const JAW_ZONES = Object.freeze([
  'B_R', 'B_R', 'B_R', 'J_R', 'J_R', 'J_R', 'J_R', 'J_R', 'C', 'C', 'C', 'C', 'C',
  'J_L', 'J_L', 'J_L', 'J_L', 'J_L', 'B_L', 'B_L', 'B_L',
]);

const MUSTACHE_MAP = new Map((Array.isArray(MUSTACHES) ? MUSTACHES : []).map((m) => [m.id, m]));
const CHEEK_OPTIONS = new Map(
  ((LINES && LINES.types) || []).filter((t) => t.id === 'cheek').flatMap((t) => t.options.map((o) => [o.id, o])),
);
const EDGE_OPTIONS = new Map(
  ((LINES && LINES.types) || []).filter((t) => t.id === 'edge').flatMap((t) => t.options.map((o) => [o.id, o])),
);

/** Default mustache shape when a look has a mustache length but no mustache id. */
export const DEFAULT_MUSTACHE = Object.freeze({ id: 'natural', widthFactor: 1, thicknessMm: 11, ends: 'trim', overLip: false, waxed: false });

/** Texture point of landmark i. */
export const T = (i) => [CANONICAL_UV[2 * i], 1 - CANONICAL_UV[2 * i + 1]];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const len = (a) => Math.hypot(a[0], a[1]);
const mixP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

export function arcLengths(poly) {
  const out = [0];
  for (let k = 1; k < poly.length; k++) out.push(out[k - 1] + len(sub(poly[k], poly[k - 1])));
  return out;
}

export function pointAtArc(poly, cum, s) {
  if (s <= 0) return poly[0].slice();
  for (let k = 1; k < poly.length; k++) {
    if (s <= cum[k]) {
      const seg = cum[k] - cum[k - 1];
      const t = seg > 1e-12 ? (s - cum[k - 1]) / seg : 0;
      return mixP(poly[k - 1], poly[k], t);
    }
  }
  return poly[poly.length - 1].slice();
}

/** n points evenly spaced by arc length. */
export function resample(poly, n) {
  const cum = arcLengths(poly);
  const total = cum[cum.length - 1];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pointAtArc(poly, cum, (total * i) / (n - 1)));
  return out;
}

/** Closest point on a polyline: { point, s (arc position), k (segment) }. */
export function projectOnPolyline(poly, p) {
  const cum = arcLengths(poly);
  let best = { d: Infinity, point: poly[0], s: 0, k: 0 };
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1];
    const ab = sub(poly[k], a);
    const l2 = ab[0] * ab[0] + ab[1] * ab[1];
    const t = l2 > 1e-12 ? clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2, 0, 1) : 0;
    const q = add(a, scale(ab, t));
    const d = len(sub(p, q));
    if (d < best.d) best = { d, point: q, s: cum[k - 1] + t * Math.sqrt(l2), k };
  }
  return best;
}

/** Quadratic Bezier sampled at n points. */
function bezier2(a, c, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** y of a polyline (sorted or not by x) at x, linear between the bracketing points; null outside. */
function yAtX(poly, x) {
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1];
    const b = poly[k];
    const lo = Math.min(a[0], b[0]);
    const hi = Math.max(a[0], b[0]);
    if (x >= lo && x <= hi && hi - lo > 1e-9) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
  }
  return null;
}

const SIDES = {
  L: {
    natural: CHEEK_LINE_NATURAL_L,
    high: CHEEK_LINE_HIGH_L,
    low: CHEEK_LINE_LOW_L,
    edge: MUSTACHE_EDGE_L,
    lower: ZONE_POLYGONS.K_L.slice(ZONE_POLYGONS.K_L.indexOf(291)),
    sign: 1,
  },
  R: {
    natural: CHEEK_LINE_NATURAL_R,
    high: CHEEK_LINE_HIGH_R,
    low: CHEEK_LINE_LOW_R,
    edge: MUSTACHE_EDGE_R,
    lower: ZONE_POLYGONS.K_R.slice().reverse().slice(ZONE_POLYGONS.K_R.slice().reverse().indexOf(61)),
    sign: -1,
  },
};

const LINE_SAMPLES = 25;

/** Cheek line option { level, curve } for a LookParams lines.cheek id. */
export function cheekOption(id) {
  return CHEEK_OPTIONS.get(id) || { id: 'natural', level: null, curve: 'natural' };
}

/** Edge sharpness 0..1 (soft 0.3, crisp 0.75, razor 1). */
export function edgeSharpness(id) {
  const o = EDGE_OPTIONS.get(id);
  return o && isNum(o.sharpness) ? o.sharpness : 0.75;
}

/** Edge softness (blur sigma) in mm for an edge finish. */
export function edgeSigmaMm(id) {
  const s = edgeSharpness(id);
  return lerp(2.4, 0.18, clamp((s - 0.3) / 0.7, 0, 1));
}

/**
 * The cheek line of one side in texture coords, from the sideburn bottom to the
 * mustache edge. type: lines.cheek id; offset -1..1 (positive raises, toward the
 * HIGH limit line; negative lowers, toward the LOW limit line).
 */
export function cheekLine(side, type = 'natural', offset = 0) {
  const def = SIDES[side];
  const N = resample(def.natural.map(T), LINE_SAMPLES);
  const H = resample(def.high.map(T), LINE_SAMPLES);
  const Lo = resample(def.low.map(T), LINE_SAMPLES);
  const edge = def.edge.map(T);
  const opt = cheekOption(type);
  const level = isNum(opt.level) ? clamp(opt.level, 0, 1) : null;
  const mixLines = (A, B, t) => A.map((p, i) => mixP(p, B[i], t));
  let line;
  if (opt.curve === 'straight' || opt.curve === 'curved') {
    const start = N[0];
    const end = mixP(Lo[Lo.length - 1], H[H.length - 1], level === null ? 0.5 : level);
    if (opt.curve === 'straight') {
      line = resample([start, end], LINE_SAMPLES);
    } else {
      const mid = mixP(start, end, 0.5);
      const d = sub(end, start);
      // Perpendicular toward the eye (up in texture space).
      let nrm = [-d[1], d[0]];
      if (nrm[1] > 0) nrm = scale(nrm, -1);
      const ctrl = add(mid, scale(nrm, 0.22));
      line = bezier2(start, ctrl, end, LINE_SAMPLES);
    }
  } else if (opt.curve === 'jaw') {
    line = mixLines(Lo, H, level === null ? 0.25 : level);
  } else if (level === null) {
    line = N;
  } else if (level >= 0.5) {
    line = mixLines(N, H, (level - 0.5) / 0.5);
  } else {
    line = mixLines(Lo, N, level / 0.5);
  }
  const off = isNum(offset) ? clamp(offset, -1, 1) : 0;
  if (off > 0) line = mixLines(line, H, off);
  else if (off < 0) line = mixLines(line, Lo, -off);
  // Snap the end onto the mustache edge.
  const proj = projectOnPolyline(edge, line[line.length - 1]);
  line[line.length - 1] = proj.point;
  return { line, endS: proj.s, edge };
}

/** K ring of one side for a cheek line: line, mustache edge below its end, K floor. */
function cheekRing(side, type, offset) {
  const def = SIDES[side];
  const { line, endS, edge } = cheekLine(side, type, offset);
  const cum = arcLengths(edge);
  const below = edge.filter((_, k) => cum[k] > endS + 1e-6);
  return { ring: [...line, ...below, ...def.lower.map(T)], line };
}

/** Pushes the JAW_CONTOUR vertices of a ring outward (away from the face centre) by d. */
function skirt(ring, ids, d) {
  const jaw = new Set(JAW_CONTOUR);
  const c = [0.5, 0.42];
  return ring.map((p, k) => {
    if (!jaw.has(ids[k])) return p;
    const dir = sub(p, c);
    const l = len(dir) || 1;
    return add(p, scale(dir, d / l));
  });
}

/** Mustache definition for a LookParams (catalog entry merged over defaults). */
export function mustacheDef(params) {
  const id = params && params.mustacheId;
  const m = id ? MUSTACHE_MAP.get(id) : null;
  const base = { ...DEFAULT_MUSTACHE };
  if (m) {
    if (isNum(m.widthFactor)) base.widthFactor = m.widthFactor;
    if (isNum(m.thicknessMm)) base.thicknessMm = m.thicknessMm;
    if (typeof m.ends === 'string') base.ends = m.ends;
    base.overLip = m.overLip === true;
    base.waxed = m.waxed === true;
    base.id = m.id;
  }
  return base;
}

const UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const NOSE_BASE = [98, 97, 2, 326, 327];

/**
 * Mustache shape: { body: ring, lower: polyline (left to right in x), ends: [{ pts,
 * widths }], tails: [x], center, halfWidth, lipEdgeShift }.
 */
export function mustacheShape(params) {
  const def = mustacheDef(params);
  const MM = TEX_PER_MM;
  const edgeId = (params && params.lines && params.lines.mustacheEdge) || 'at';
  let shift = edgeId === 'over' ? 1.8 : edgeId === 'short' ? -1.4 : 0.4;
  if (def.overLip) shift = Math.max(shift, 1.8);
  if (def.ends === 'hang') shift = Math.max(shift, 3.4);
  const lip = resample(UPPER_LIP.map(T), 23).map((p) => [p[0], p[1] + shift * MM]);
  const cR = T(57);
  const cL = T(287);
  const center = [(cR[0] + cL[0]) / 2, lip[11][1]];
  const half0 = (cL[0] - cR[0]) / 2;
  const half = half0 * clamp(def.widthFactor, 0.6, 1.6);
  // Lower edge: from the right end, through the lip line, to the left end. The
  // corners droop a little, following the mouth corners.
  const droop = (1 + Math.max(0, def.widthFactor - 1) * 1.2) * 1.2 * MM;
  const endR = [center[0] - half, lip[0][1] + droop];
  const endL = [center[0] + half, lip[lip.length - 1][1] + droop];
  const lower = [endR, ...lip, endL];
  const noseLimit = [
    [T(98)[0] - 7 * MM, T(98)[1] + 1.5 * MM],
    ...NOSE_BASE.map(T).map((p) => [p[0], p[1] + 0.8 * MM]),
    [T(327)[0] + 7 * MM, T(327)[1] + 1.5 * MM],
  ];
  const thick = clamp(def.thicknessMm, 1.5, 20) * MM;
  const ends = def.ends;
  const taperAt = (x) => {
    const d = clamp(Math.abs(x - center[0]) / half, 0, 1);
    if (ends === 'pyramid') return 1 - 0.8 * smoothstep(0.3, 1, d);
    if (ends === 'brush') return 1 - 0.12 * smoothstep(0.85, 1, d);
    if (ends === 'hang') return 1 - 0.3 * smoothstep(0.6, 1, d);
    return 1 - 0.5 * smoothstep(0.5, 1, d);
  };
  const upper = lower.map((p) => {
    let y = p[1] - thick * taperAt(p[0]);
    const lim = yAtX(noseLimit, p[0]);
    const limY = lim === null ? noseLimit[0][1] : lim;
    if (y < limY) y = Math.min(p[1] - 0.6 * MM, limY);
    return [p[0], y];
  });
  const body = [...lower, ...upper.slice().reverse()];

  // Waxed or styled ends: tapered strokes from each end point.
  const endPaths = [];
  const tails = [];
  const tEnd = thick * taperAt(endL[0]);
  for (const side of [1, -1]) {
    const e = side > 0 ? endL : endR;
    const startPt = [e[0] - side * 1.5 * MM, e[1] - tEnd * 0.45];
    const P = (dx, dy) => [startPt[0] + side * dx * MM, startPt[1] + dy * MM];
    let pts = null;
    let w0 = tEnd * 0.9;
    let w1 = 0.8 * MM;
    if (ends === 'pulled') pts = [P(0, 0), P(6, -0.6), P(12, -1.4), P(18, -2.6)];
    else if (ends === 'curl-up') pts = [P(0, 0), P(6, -0.5), P(10, -2.5), P(12, -6), P(11, -9), P(8.5, -9.5), P(7.5, -7.5)];
    else if (ends === 'waxed-up') {
      pts = [P(0, 0), P(2.5, -3), P(3.5, -9), P(3.8, -17)];
      w0 = Math.max(1.8 * MM, tEnd * 0.6);
      w1 = 0.6 * MM;
    } else if (ends === 'curl-cheek') {
      pts = [P(0, 0), P(5, -2.5), P(9, -7), P(10.5, -12), P(9.5, -15)];
      w1 = 1.6 * MM;
    } else if (ends === 'down-to-jaw' || ends === 'down-long') {
      const top = [e[0] - side * 1.2 * MM, e[1] - tEnd * 0.3];
      const jawPt = jawPointBelow(top[0]);
      const bottom = [top[0] + side * 1 * MM, jawPt[1] + 1.5 * MM];
      pts = resample([top, [top[0] + side * 1.5 * MM, lerp(top[1], bottom[1], 0.5)], bottom], 8);
      w0 = (ends === 'down-to-jaw' ? 8.5 : 3.6) * MM;
      w1 = (ends === 'down-to-jaw' ? 7.5 : 2.6) * MM;
      if (ends === 'down-long') tails.push(bottom[0]);
    }
    if (pts) {
      const widths = pts.map((_, i) => lerp(w0, w1, i / (pts.length - 1)));
      endPaths.push({ pts, widths, side });
    }
  }
  return { def, body, lower, upper, ends: endPaths, tails, center, halfWidth: half, lipEdgeShift: shift };
}

/** Jaw contour point (texture coords) directly below x (nearest by x in the front half). */
export function jawPointBelow(x) {
  const pts = JAW_CONTOUR.map(T);
  const y = yAtX(pts.slice(3, 18), x);
  if (y !== null) return [x, y];
  let best = pts[10];
  for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
  return best;
}

/** Arc-length fraction (0 at 234, 1 at 454) of each JAW_CONTOUR point, canonical front view. */
export const JAW_U = (() => {
  const pts = JAW_CONTOUR.map(T);
  const cum = arcLengths(pts);
  const total = cum[cum.length - 1] || 1;
  return Object.freeze(cum.map((c) => c / total));
})();

/**
 * Everything the texture painters need, for one LookParams.
 * Returns { zones: { id: ring }, cheek: { L, R }, lips, nose, mustache|null,
 *   connectors: [ring], clipJ: ring|null, clipC: ring|null, sideburnGap: [polyline],
 *   bTop: { L: y, R: y }, bBottom: { L: y, R: y }, jaw: { pts, zones } }.
 */
export function beardLayout(params) {
  const p = params && typeof params === 'object' ? params : {};
  const lines = p.lines || {};
  const shape = p.shape || {};
  const zl = p.zones || {};
  const MM = TEX_PER_MM;
  const zones = {};
  const ids = {};
  for (const id of ['M', 'S', 'C', 'J_L', 'J_R', 'B_L', 'B_R']) {
    ids[id] = ZONE_POLYGONS[id];
    zones[id] = skirt(ZONE_POLYGONS[id].map(T), ZONE_POLYGONS[id], 0.035);
  }
  const cheek = {};
  for (const side of ['L', 'R']) {
    const { ring, line } = cheekRing(side, lines.cheek || 'natural', lines.cheekOffset || 0);
    zones[`K_${side}`] = ring;
    cheek[side] = line;
  }

  const lips = LIPS_OUTER.map(T);
  const r98 = T(98);
  const l327 = T(327);
  const nose = [
    [r98[0] - 1.5 * MM, r98[1] + 0.5 * MM],
    ...NOSE_BASE.map(T),
    [l327[0] + 1.5 * MM, l327[1] + 0.5 * MM],
    [l327[0] + 1.5 * MM, l327[1] - 30 * MM],
    [r98[0] - 1.5 * MM, r98[1] - 30 * MM],
  ];

  const hasM = (zl.M || 0) > 0.2;
  const mustache = hasM ? mustacheShape(p) : null;

  // Circle beard: connector bands from the mustache corners around the mouth to the chin.
  const connectors = [];
  if (shape.chin === 'ring') {
    for (const side of ['L', 'R']) {
      const s = SIDES[side].sign;
      const corner = T(side === 'L' ? 287 : 57);
      const mouth = T(side === 'L' ? 291 : 61);
      const path = [
        corner,
        [mouth[0] + s * 2.6 * MM, mouth[1] + 1.2 * MM],
        [T(side === 'L' ? 375 : 146)[0] + s * 2.2 * MM, T(side === 'L' ? 375 : 146)[1] + 1.5 * MM],
        [T(side === 'L' ? 321 : 91)[0] + s * 1.2 * MM, T(side === 'L' ? 321 : 91)[1] + 2.5 * MM],
        T(side === 'L' ? 335 : 106),
      ];
      connectors.push({ pts: resample(path, 12), width: 6.5 * MM });
    }
  }

  // Front of the jaw only (extended goatee, anchor, balbo).
  const clipJ = shape.jFront ? [[0.5 - 0.235, -1], [0.5 + 0.235, -1], [0.5 + 0.235, 2], [0.5 - 0.235, 2]] : null;
  // Royale strip: a narrow vertical band on the chin.
  let clipC = shape.chin === 'strip' ? [[0.5 - 7 * MM, -1], [0.5 + 7 * MM, -1], [0.5 + 7 * MM, 2], [0.5 - 7 * MM, 2]] : null;
  // A chin-only beard (goatee, Van Dyke) takes its chin shape on the face too.
  const chinOnly = ['K_L', 'K_R', 'J_L', 'J_R'].every((id) => !((zl[id] || 0) > 0.2));
  if (!clipC && chinOnly && shape.chin === 'round') {
    // Rounded goatee: narrower than the mouth under the lip, a full round chin.
    clipC = [[0.415, 0.69], [0.585, 0.69], [0.603, 0.78], [0.614, 0.86], [0.602, 0.93], [0.565, 0.99], [0.5, 1.01], [0.435, 0.99], [0.398, 0.93], [0.386, 0.86], [0.397, 0.78]];
  } else if (!clipC && chinOnly && shape.chin === 'pointed') {
    clipC = [[0.405, 0.69], [0.595, 0.69], [0.61, 0.8], [0.585, 0.9], [0.5, 1.03], [0.415, 0.9], [0.39, 0.8]];
  }

  // Disconnected sideburns: a skin gap along the bottom of the sideburn.
  const sideburnGap = lines.sideburn === 'disconnected' ? [[366, 401, 361].map(T), [137, 177, 132].map(T)] : [];

  const ringY = (ring, fn) => ring.reduce((m, q) => fn(m, q[1]), fn === Math.min ? Infinity : -Infinity);
  const bTop = { L: ringY(ZONE_POLYGONS.B_L.map(T), Math.min), R: ringY(ZONE_POLYGONS.B_R.map(T), Math.min) };
  const bBottom = { L: ringY(ZONE_POLYGONS.B_L.map(T), Math.max), R: ringY(ZONE_POLYGONS.B_R.map(T), Math.max) };

  return {
    zones,
    ids,
    cheek,
    lips,
    nose,
    mustache,
    connectors,
    clipJ,
    clipC,
    sideburnGap,
    bTop,
    bBottom,
    jaw: { pts: JAW_CONTOUR.map(T), zones: JAW_ZONES, u: JAW_U },
  };
}
