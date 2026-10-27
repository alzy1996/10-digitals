// Face shape (PRD 5.4). Starting rules, tuned in QA on 30 labelled photos.
import { dist } from './imageOps.js';

export const SHAPES = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle'];
const FACE_SKIN = 3;

/** Walk up the midline from landmark 10 until face-skin turns to hair or background. */
export function findHairline(pts, labels, w, h) {
  const top = pts[10];
  const chin = pts[152];
  const x = Math.round(top[0]);
  let y = Math.round(top[1]);
  if (!labels) return { y: top[1], confidence: 0.4 };
  const at = (yy) => labels[Math.max(0, Math.min(h - 1, yy)) * w + Math.max(0, Math.min(w - 1, x))];
  if (at(y) !== FACE_SKIN) {
    // fringe or covered forehead: keep landmark 10 as the best guess
    return { y: top[1], confidence: 0.45 };
  }
  const limit = Math.max(0, Math.round(top[1] - (chin[1] - top[1]) * 0.6));
  let gap = 0;
  while (y > limit) {
    y -= 1;
    if (at(y) !== FACE_SKIN) {
      gap += 1;
      if (gap >= 3) return { y: y + 3, confidence: 0.85 };
    } else gap = 0;
  }
  return { y: limit, confidence: 0.5 };
}

/** Width of the face-skin run through the midline at row y. */
export function skinWidthAt(labels, w, h, cx, y) {
  const row = Math.max(0, Math.min(h - 1, Math.round(y))) * w;
  const x0 = Math.round(cx);
  if (labels[row + x0] !== FACE_SKIN) return 0;
  let l = x0;
  let r = x0;
  let gap = 0;
  while (l > 0 && gap < 4) {
    l -= 1;
    gap = labels[row + l] === FACE_SKIN ? 0 : gap + 1;
  }
  gap = 0;
  while (r < w - 1 && gap < 4) {
    r += 1;
    gap = labels[row + r] === FACE_SKIN ? 0 : gap + 1;
  }
  return Math.max(0, r - l - 8);
}

function angleAt(p, a, b) {
  const v1 = [a[0] - p[0], a[1] - p[1]];
  const v2 = [b[0] - p[0], b[1] - p[1]];
  const c = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Geometric measures from landmarks (+ face-skin mask for hairline and forehead width). */
export function measureFace(pts, labels, w, h) {
  const hl = findHairline(pts, labels, w, h);
  const chin = pts[152];
  const faceLength = chin[1] - hl.y;
  const cheekW = dist(pts[234], pts[454]);
  const jawW = dist(pts[172], pts[397]);
  let foreheadW = 0;
  if (labels) foreheadW = skinWidthAt(labels, w, h, pts[10][0], hl.y + faceLength * 0.25);
  if (!foreheadW) foreheadW = dist(pts[54], pts[284]) * 1.05; // landmark fallback (temples)
  const jawAngle = (angleAt(pts[172], pts[234], pts[152]) + angleAt(pts[397], pts[454], pts[152])) / 2;
  return { faceLength, cheekW, jawW, foreheadW, jawAngle, hairlineY: hl.y, hairlineConfidence: hl.confidence };
}

const sig = (x) => 1 / (1 + Math.exp(-x));
const ge = (x, t, s) => sig((x - t) / s);
const le = (x, t, s) => sig((t - x) / s);

/** Fuzzy version of the PRD rules -> normalized scores for the 7 shapes. */
export function classifyFace(m) {
  const R = m.faceLength / m.cheekW;
  const f = m.foreheadW;
  const c = m.cheekW;
  const j = m.jawW;
  const mx = Math.max(f, c, j);
  const spread = (mx - Math.min(f, c, j)) / mx;
  const cheekWidest = ge(c - Math.max(f, j), 0, 0.02 * c);
  const diamond = cheekWidest * le(f / c, 0.85, 0.03) * le(j / c, 0.85, 0.03);
  const raw = {
    oblong: ge(R, 1.55, 0.04) * le(spread, 0.1, 0.03),
    // oval and diamond share "cheekbones widest"; a narrow forehead and jaw pulls toward diamond
    oval: ge(R, 1.35, 0.04) * le(R, 1.55, 0.04) * cheekWidest * ge(m.jawAngle, 125, 4) * (1 - 0.8 * diamond),
    round: le(R, 1.25, 0.04) * ge(m.jawAngle, 135, 4),
    square: le(R, 1.35, 0.04) * le(spread, 0.08, 0.02) * le(m.jawAngle, 125, 4),
    heart: ge(f - c, 0, 0.02 * c) * ge(c - j, 0, 0.02 * c) * le(j / f, 0.8, 0.03),
    diamond,
    triangle: ge(j - c, 0, 0.02 * c) * ge(c - f, 0, 0.02 * c),
  };
  const floor = 0.002;
  let sum = 0;
  for (const k of SHAPES) {
    raw[k] = raw[k] + floor;
    sum += raw[k];
  }
  const scores = {};
  for (const k of SHAPES) scores[k] = Math.round((raw[k] / sum) * 100) / 100;
  const top = SHAPES.reduce((a, b) => (scores[b] > scores[a] ? b : a), SHAPES[0]);
  return { top, scores, ratio: Math.round(R * 100) / 100 };
}

export function faceShape(pts, labels, w, h) {
  const m = measureFace(pts, labels, w, h);
  return { ...classifyFace(m), measures: m };
}

export function topTwo(scores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
}
