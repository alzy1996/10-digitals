// Face shape (PRD 5.4).
//
// Measures (front shot):
//   hairline       walk up the face midline from landmark 10 until the class mask
//                  switches from skin to hair or background. Bald or shaved heads,
//                  caps (kumma, massar) and bangs give an estimate marked
//                  hairlineEstimated (10 + 10 % of the 10-152 distance, at least
//                  where a cap edge was found).
//   face length    hairline to chin (152)
//   forehead width face-skin mask width 25 % of the face length below the hairline
//                  (face-oval width at that line when there is no usable mask)
//   cheekbone      234 to 454      jaw width   172 to 397
//   jaw angle      angle at the gonion (172 / 397) between the ramus (toward the
//                  jaw-contour points 93/132 and 323/361) and the line to the chin
//                  152, in the image plane of the front shot, averaged over both
//                  sides.
//
// Calibration: MediaPipe's 234 / 454 sit at the ear front, wider than the
// cheekbones a barber looks at, and the mesh jaw contour is softer than bone, so
// raw landmark ratios do not match the PRD's barber-oriented thresholds. Before
// the rules run, the ratios are scaled so that the MediaPipe canonical face (the
// population-average mesh) lands on an oval prototype (length / cheek 1.45,
// forehead / cheek 0.93, jaw / cheek 0.88, jaw angle 130 deg). The reported
// jawAngleDeg uses the same offset. Reported millimetre measures are raw.
//
// Rules (starting rules, tune in QA) become soft scores: each condition is a
// sigmoid of the distance to its threshold, a shape's score is the product of its
// conditions raised to 1 / sqrt(n) (between a strict AND and a plain geometric
// mean, so one clearly failed condition still costs a shape with many conditions),
// and the seven scores are normalised to sum to 1.

import { CANONICAL_VERTICES } from '../mesh/tessellation.js';
import { FACE_OVAL, MEASURE } from '../mesh/zones.js';
import { CLASSES } from '../models/classes.js';
import { sigmoid } from './pixels.js';

export const SHAPES = Object.freeze(['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle']);

/** Face code (style JSON "faces") for each shape. */
export const SHAPE_CODES = Object.freeze({
  oval: 'OV',
  round: 'RD',
  square: 'SQ',
  oblong: 'OB',
  heart: 'HT',
  diamond: 'DM',
  triangle: 'TR',
});

/** PRD 5.4 thresholds and the softness of each condition. */
export const SHAPE_RULES = Object.freeze({
  oblongRatio: 1.55,
  ovalRatio: [1.35, 1.55],
  roundRatio: 1.25,
  squareRatio: 1.35,
  oblongWithin: 0.1,
  squareWithin: 0.08,
  roundJawAbove: 135,
  squareJawBelow: 125,
  ovalSoftJawAbove: 125,
  heartJawToForehead: 0.8,
  diamondSideToCheek: 0.85,
  softRatio: 0.03,
  softWidth: 0.02,
  softAngle: 3,
});

/** Oval prototype the canonical (average) mesh is mapped onto. */
export const OVAL_PROTOTYPE = Object.freeze({ ratio: 1.45, foreheadToCheek: 0.93, jawToCheek: 0.88, jawAngle: 130 });

/** Default hairline offset above landmark 10, as a share of the 10-152 distance. */
export const HAIRLINE_DEFAULT = 0.1;

const RAMUS = Object.freeze({ R: [93, 132], L: [323, 361] });
const CHIN_SIDE = Object.freeze({ R: 149, L: 378 });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const dist = (a, b) => len(sub(a, b));

function angleAt(o, a, b) {
  const u = sub(a, o);
  const v = sub(b, o);
  const c = (u[0] * v[0] + u[1] * v[1]) / ((len(u) * len(v)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Face axes in the image: up (chin -> landmark 10) and side (customer's right -> left). */
export function faceAxes(P) {
  const top = P[MEASURE.top];
  const chin = P[MEASURE.chin];
  const L = dist(top, chin) || 1;
  const up = [(top[0] - chin[0]) / L, (top[1] - chin[1]) / L];
  let side = [-up[1], up[0]];
  const lr = sub(P[MEASURE.cheekL], P[MEASURE.cheekR]);
  if (side[0] * lr[0] + side[1] * lr[1] < 0) side = [-side[0], -side[1]];
  return { up, side, L };
}

/** Default hairline: HAIRLINE_DEFAULT of the 10-152 distance above landmark 10. */
export function estimatedHairline(P) {
  const { up, L } = faceAxes(P);
  const top = P[MEASURE.top];
  return [top[0] + up[0] * HAIRLINE_DEFAULT * L, top[1] + up[1] * HAIRLINE_DEFAULT * L];
}

const isSkin = (c) => c === CLASSES.FACE_SKIN || c === CLASSES.BODY_SKIN;

/**
 * Hairline from a class mask. P: landmark pixels at the mask size. Returns
 * { point, estimated, reason } where reason is 'hair', 'bald', 'cover' (cap or
 * scarf), 'bangs' or 'mask'.
 */
export function hairlineFromMask(categories, w, h, P) {
  const { up, L } = faceAxes(P);
  const top = P[MEASURE.top];
  const fallback = estimatedHairline(P);
  const maxSteps = Math.round(0.6 * L);
  let run = 0;
  let firstNon = -1;
  const counts = new Map();
  for (let t = 0; t <= maxSteps; t++) {
    const x = Math.round(top[0] + up[0] * t);
    const y = Math.round(top[1] + up[1] * t);
    if (x < 0 || y < 0 || x >= w || y >= h) {
      if (firstNon < 0) firstNon = t;
      counts.set(CLASSES.BACKGROUND, (counts.get(CLASSES.BACKGROUND) || 0) + 1);
      run++;
    } else {
      const c = categories[y * w + x];
      if (isSkin(c)) {
        run = 0;
        firstNon = -1;
        counts.clear();
        continue;
      }
      if (firstNon < 0) firstNon = t;
      counts.set(c, (counts.get(c) || 0) + 1);
      run++;
    }
    if (run >= 3) break;
  }
  if (run < 3) return { point: fallback, estimated: true, reason: 'bald' };
  let cls = CLASSES.BACKGROUND;
  let best = -1;
  for (const [c, n] of counts) {
    if (n > best) {
      best = n;
      cls = c;
    }
  }
  const at = [top[0] + up[0] * firstNon, top[1] + up[1] * firstNon];
  const frac = firstNon / L;
  if (cls === CLASSES.HAIR) {
    if (frac < 0.02) return { point: fallback, estimated: true, reason: 'bangs' };
    return { point: at, estimated: false, reason: 'hair' };
  }
  if (cls === CLASSES.BACKGROUND) {
    return { point: fallback, estimated: true, reason: frac > 0.3 ? 'bald' : 'mask' };
  }
  const coverFrac = Math.max(frac, HAIRLINE_DEFAULT);
  return { point: [top[0] + up[0] * coverFrac * L, top[1] + up[1] * coverFrac * L], estimated: true, reason: 'cover' };
}

/** Width of the face-oval polygon along the side axis through point q. */
export function ovalWidthAt(P, q, side) {
  const ring = FACE_OVAL.map((i) => P[i]);
  let minT = Infinity;
  let maxT = -Infinity;
  // Line q + t * side; intersect with each edge a + s * (b - a), s in [0, 1].
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const e = sub(b, a);
    const den = side[0] * e[1] - side[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const d = sub(a, q);
    const t = (d[0] * e[1] - d[1] * e[0]) / den;
    const s = (d[0] * side[1] - d[1] * side[0]) / den;
    if (s < 0 || s > 1) continue;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  return Number.isFinite(minT) && Number.isFinite(maxT) ? maxT - minT : NaN;
}

/** Face-skin width of the mask along the side axis through q (NaN when the scan fails). */
export function maskWidthAt(categories, w, h, q, side, maxHalf) {
  const extent = (dir) => {
    let run = 0;
    let last = 0;
    for (let t = 0; t <= maxHalf; t++) {
      const x = Math.round(q[0] + dir * side[0] * t);
      const y = Math.round(q[1] + dir * side[1] * t);
      const c = x < 0 || y < 0 || x >= w || y >= h ? CLASSES.BACKGROUND : categories[y * w + x];
      if (c === CLASSES.FACE_SKIN) {
        run = 0;
        last = t;
      } else if (++run >= 3) {
        return last;
      }
    }
    return NaN;
  };
  const a = extent(1);
  const b = extent(-1);
  return Number.isFinite(a) && Number.isFinite(b) ? a + b : NaN;
}

/**
 * Raw measures in pixels. P: landmark pixels (array of [x, y]); hairline: [x, y] or
 * null (estimate); foreheadWidth: px from the mask or null (face-oval fallback).
 */
export function measureFace(P, { hairline = null, foreheadWidth = null } = {}) {
  const { up, side } = faceAxes(P);
  const hl = hairline || estimatedHairline(P);
  const chin = P[MEASURE.chin];
  const faceLength = dist(hl, chin);
  const q = [hl[0] - up[0] * 0.25 * faceLength, hl[1] - up[1] * 0.25 * faceLength];
  const cheek = dist(P[MEASURE.cheekL], P[MEASURE.cheekR]);
  let forehead = foreheadWidth;
  if (!(forehead > 0.5 * cheek && forehead < 1.2 * cheek)) forehead = ovalWidthAt(P, q, side);
  const jaw = dist(P[MEASURE.jawL], P[MEASURE.jawR]);
  const mid = (ids) => [(P[ids[0]][0] + P[ids[1]][0]) / 2, (P[ids[0]][1] + P[ids[1]][1]) / 2];
  const jawAngle =
    (angleAt(P[MEASURE.jawR], mid(RAMUS.R), chin) + angleAt(P[MEASURE.jawL], mid(RAMUS.L), chin)) / 2;
  const chinAngle = angleAt(chin, P[CHIN_SIDE.R], P[CHIN_SIDE.L]);
  return { faceLength, forehead, cheek, jaw, jawAngle, chinAngle, hairline: hl, foreheadLine: q };
}

const CANON = (() => {
  const P = [];
  for (let i = 0; i < 468; i++) P.push([CANONICAL_VERTICES[3 * i], -CANONICAL_VERTICES[3 * i + 1]]);
  return measureFace(P);
})();

/** Ratio scale factors and angle offset of the canonical-face calibration. */
export const CALIBRATION = Object.freeze({
  ratio: OVAL_PROTOTYPE.ratio / (CANON.faceLength / CANON.cheek),
  forehead: OVAL_PROTOTYPE.foreheadToCheek / (CANON.forehead / CANON.cheek),
  jaw: OVAL_PROTOTYPE.jawToCheek / (CANON.jaw / CANON.cheek),
  jawAngleOffset: OVAL_PROTOTYPE.jawAngle - CANON.jawAngle,
  chinAngle: CANON.chinAngle,
});

const gt = (x, t, s) => sigmoid((x - t) / s);
const lt = (x, t, s) => sigmoid((t - x) / s);
const softAnd = (fs) => Math.exp(fs.reduce((acc, f) => acc + Math.log(Math.max(1e-6, f)), 0) / Math.sqrt(fs.length));

/** Calibrated features { ratio, F, C, J, jawAngle, chinAngle } (widths relative to cheek = 1). */
export function calibratedFeatures(m) {
  return {
    ratio: (m.faceLength / m.cheek) * CALIBRATION.ratio,
    F: (m.forehead / m.cheek) * CALIBRATION.forehead,
    C: 1,
    J: (m.jaw / m.cheek) * CALIBRATION.jaw,
    jawAngle: m.jawAngle + CALIBRATION.jawAngleOffset,
    chinAngle: m.chinAngle,
  };
}

/** Raw (unnormalised) soft score of each shape from calibrated features. */
export function shapeEvidence(f) {
  const R = SHAPE_RULES;
  const { ratio, F, C, J, jawAngle, chinAngle } = f;
  const widest = Math.max(F, C, J);
  const spread = (widest - Math.min(F, C, J)) / widest;
  const pointed = lt(chinAngle, CALIBRATION.chinAngle - 2, 3);
  return {
    oblong: softAnd([gt(ratio, R.oblongRatio, R.softRatio), lt(spread, R.oblongWithin, R.softWidth)]),
    oval: softAnd([
      gt(ratio, R.ovalRatio[0], R.softRatio),
      lt(ratio, R.ovalRatio[1], R.softRatio),
      gt(C / F, 1, R.softWidth),
      gt(C / J, 1, R.softWidth),
      gt(F / J, 1, R.softWidth),
      gt(jawAngle, R.ovalSoftJawAbove, R.softAngle),
    ]),
    round: softAnd([lt(ratio, R.roundRatio, R.softRatio), gt(jawAngle, R.roundJawAbove, R.softAngle)]),
    square: softAnd([
      lt(ratio, R.squareRatio, R.softRatio),
      lt(spread, R.squareWithin, R.softWidth),
      lt(jawAngle, R.squareJawBelow, R.softAngle),
    ]),
    heart: softAnd([
      gt(F / C, 1, R.softWidth),
      gt(C / J, 1, R.softWidth),
      lt(J / F, R.heartJawToForehead, R.softWidth),
      pointed,
    ]),
    diamond: softAnd([lt(F / C, R.diamondSideToCheek, R.softWidth), lt(J / C, R.diamondSideToCheek, R.softWidth)]),
    triangle: softAnd([gt(J / C, 1, R.softWidth), gt(C / F, 1, R.softWidth)]),
  };
}

/** Rounds a distribution to 2 decimals that still sum to exactly 1 (largest remainder). */
export function roundDistribution(values) {
  const keys = Object.keys(values);
  const cents = keys.map((k) => values[k] * 100);
  const floors = cents.map(Math.floor);
  let left = 100 - floors.reduce((s, v) => s + v, 0);
  const order = keys.map((_, i) => i).sort((a, b) => cents[b] - floors[b] - (cents[a] - floors[a]));
  for (const i of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return Object.fromEntries(keys.map((k, i) => [k, floors[i] / 100]));
}

/** Normalised scores (sum 1, 2 decimals), top shape and runner-up. */
export function shapeScores(measures) {
  const ev = shapeEvidence(calibratedFeatures(measures));
  const total = SHAPES.reduce((s, k) => s + ev[k], 0) || 1;
  const raw = Object.fromEntries(SHAPES.map((k) => [k, ev[k] / total]));
  const scores = roundDistribution(raw);
  const ranked = [...SHAPES].sort((a, b) => raw[b] - raw[a] || SHAPES.indexOf(a) - SHAPES.indexOf(b));
  return { scores, top: ranked[0], second: ranked[1] };
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * FaceProfile faceShape block. P: landmark pixels; mmPerPx: scale of those pixels;
 * mask: { categories, width, height } at the same pixel size, or null.
 */
export function analyzeFaceShape(P, mmPerPx, mask = null) {
  let hairline = null;
  let hairlineEstimated = true;
  let hairlineReason = 'mask';
  let foreheadWidth = null;
  if (mask && mask.categories) {
    const hl = hairlineFromMask(mask.categories, mask.width, mask.height, P);
    hairline = hl.point;
    hairlineEstimated = hl.estimated;
    hairlineReason = hl.reason;
  }
  const first = measureFace(P, { hairline });
  if (mask && mask.categories) {
    const { side } = faceAxes(P);
    foreheadWidth = maskWidthAt(mask.categories, mask.width, mask.height, first.foreheadLine, side, 0.75 * first.cheek);
  }
  const m = foreheadWidth ? measureFace(P, { hairline, foreheadWidth }) : first;
  const { scores, top, second } = shapeScores(m);
  const k = Number.isFinite(mmPerPx) && mmPerPx > 0 ? mmPerPx : NaN;
  const mm = (px) => (Number.isFinite(k) ? round1(px * k) : null);
  return {
    top,
    second,
    scores,
    jawAngleDeg: Math.round(m.jawAngle + CALIBRATION.jawAngleOffset),
    measures: {
      faceLengthMm: mm(m.faceLength),
      foreheadWidthMm: mm(m.forehead),
      cheekboneWidthMm: mm(m.cheek),
      jawWidthMm: mm(m.jaw),
      lengthToCheek: Math.round((m.faceLength / m.cheek) * 1000) / 1000,
      chinAngleDeg: Math.round(m.chinAngle),
      hairlineEstimated,
      hairlineSource: hairlineReason,
    },
    hairlinePx: m.hairline,
    foreheadLinePx: m.foreheadLine,
  };
}
