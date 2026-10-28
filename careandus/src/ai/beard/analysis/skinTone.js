// Skin tone and undertone (PRD 5.6). Colour science only, no model.
//
// Samples: both upper cheeks and the forehead, face-skin class pixels only; the
// top 5 % L* (shine) and bottom 10 % (shadow, stubble) are dropped. Pixels go
// white-balanced sRGB -> linear RGB (gains) -> XYZ (D65) -> CIELAB (color.js).
//
// ITA (individual typology angle) = atan2(L* - 50, b*) * 180 / pi.
// Monk Skin Tone: nearest of the 10 MST swatches by CIEDE2000.
//   Monk Skin Tone Scale by Dr. Ellis Monk, released by Google under CC BY 4.0
//   (https://skintone.google). Swatch values from the published scale.
// Undertone from the hue angle h = atan2(b*, a*): warm above 62 deg, cool below
// 52 deg, neutral between; olive when a* < 9, b* > 14 and h > 58 (starting
// thresholds, tuned in QA).

import { hexToLab, deltaE2000, labToLch, clamp } from './color.js';
import { labAt, convexHull, forEachPixelInPolygon, percentile } from './pixels.js';
import { CLASSES } from '../models/classes.js';
import { CHEEK_PATCH, FOREHEAD_PATCH } from '../capture/quality.js';

export const MST_SWATCHES = Object.freeze([
  '#f6ede4',
  '#f3e7db',
  '#f7ead0',
  '#eadaba',
  '#d7bd96',
  '#a07e56',
  '#825c43',
  '#604134',
  '#3a312a',
  '#292420',
]);

export const MST_LAB = Object.freeze(MST_SWATCHES.map((h) => Object.freeze(hexToLab(h))));

/** ITA band keys, lightest first (PRD 5.6). */
export const ITA_BANDS = Object.freeze(['veryLight', 'light', 'intermediate', 'tan', 'brown', 'dark']);

export const UNDERTONE = Object.freeze({ warmAbove: 62, coolBelow: 52, oliveA: 9, oliveB: 14, oliveH: 58 });

/** Individual typology angle in degrees. */
export function itaOf([L, , b]) {
  return (Math.atan2(L - 50, b) * 180) / Math.PI;
}

/** PRD bands: > 55 very light, 41..55 light, 28..41 intermediate, 10..28 tan, -30..10 brown, < -30 dark. */
export function itaBand(ita) {
  if (ita > 55) return 'veryLight';
  if (ita > 41) return 'light';
  if (ita > 28) return 'intermediate';
  if (ita > 10) return 'tan';
  if (ita >= -30) return 'brown';
  return 'dark';
}

/** Monk Skin Tone 1..10 nearest to a Lab colour (CIEDE2000). */
export function nearestMst(lab) {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < MST_LAB.length; k++) {
    const d = deltaE2000(lab, MST_LAB[k]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best + 1;
}

/** Hue angle h = atan2(b*, a*) in degrees, 0..360. */
export function hueAngle(lab) {
  return labToLch(lab)[2];
}

/** 'warm' | 'cool' | 'neutral' | 'olive' from a skin Lab colour. */
export function undertoneOf(lab) {
  const [, a, b] = lab;
  const h = hueAngle(lab);
  if (a < UNDERTONE.oliveA && b > UNDERTONE.oliveB && h > UNDERTONE.oliveH) return 'olive';
  if (h > UNDERTONE.warmAbove) return 'warm';
  if (h < UNDERTONE.coolBelow) return 'cool';
  return 'neutral';
}

/**
 * Skin pixels of the cheek and forehead patches as Lab colours.
 * img: ImageData-like; landmarksPx: array of [x, y] in img pixels; categories:
 * Uint8Array class mask at the image size or null; gains: linear RGB gains.
 * Returns { all, left, right, forehead } arrays of [L, a, b].
 */
export function sampleSkin(img, landmarksPx, categories, gains, { step = 1 } = {}) {
  const out = { all: [], left: [], right: [], forehead: [] };
  const regions = [
    ['left', CHEEK_PATCH.L],
    ['right', CHEEK_PATCH.R],
    ['forehead', FOREHEAD_PATCH],
  ];
  for (const [key, ring] of regions) {
    const hull = convexHull(ring.map((i) => landmarksPx[i]));
    forEachPixelInPolygon(hull, img.width, img.height, (p, x, y) => {
      if (step > 1 && (x % step || y % step)) return;
      if (categories && categories[p] !== CLASSES.FACE_SKIN) return;
      const lab = labAt(img.data, p, gains);
      out[key].push(lab);
      out.all.push(lab);
    });
  }
  return out;
}

/** Drops the top 5 % and bottom 10 % by L*. */
export function trimByLightness(labs) {
  if (labs.length < 10) return labs.slice();
  const Ls = labs.map((c) => c[0]);
  const lo = percentile(Ls, 10);
  const hi = percentile(Ls, 95);
  return labs.filter((c) => c[0] >= lo && c[0] <= hi);
}

/** Mean of Lab colours. */
export function meanLab(labs) {
  if (!labs.length) return null;
  let L = 0;
  let a = 0;
  let b = 0;
  for (const c of labs) {
    L += c[0];
    a += c[1];
    b += c[2];
  }
  return [L / labs.length, a / labs.length, b / labs.length];
}

const round1 = (v) => Math.round(v * 10) / 10;

/** Region weights of the skin colour: both cheeks and the forehead count about equally. */
export const SKIN_REGION_WEIGHTS = Object.freeze({ left: 0.35, right: 0.35, forehead: 0.3 });
const MIN_REGION_SAMPLES = 20;

/**
 * Skin colour of the sampled regions: the trimmed mean of each region, averaged
 * with SKIN_REGION_WEIGHTS (so a large, shiny forehead patch does not outvote the
 * cheeks). Falls back to the pooled trimmed mean when no region has enough pixels.
 */
export function regionSkinLab(regions) {
  let wsum = 0;
  const acc = [0, 0, 0];
  for (const [key, wt] of Object.entries(SKIN_REGION_WEIGHTS)) {
    const labs = regions[key];
    if (!labs || labs.length < MIN_REGION_SAMPLES) continue;
    const m = meanLab(trimByLightness(labs));
    acc[0] += m[0] * wt;
    acc[1] += m[1] * wt;
    acc[2] += m[2] * wt;
    wsum += wt;
  }
  if (wsum > 0) return acc.map((v) => v / wsum);
  return regions.all ? meanLab(trimByLightness(regions.all)) : null;
}

/**
 * Skin result. samples: either { all, left, right, forehead } from sampleSkin or a
 * plain array of Lab colours. opts: { whiteCard: boolean }. Returns the FaceProfile
 * skin block { ita, mst, undertone, confidence, lab } plus itaBand, or null when
 * there are no samples.
 */
export function skinFromSamples(samples, opts = {}) {
  const regions = Array.isArray(samples) ? { all: samples } : samples || {};
  const lab = regionSkinLab(regions);
  if (!lab) return null;
  const count = regions.all ? regions.all.length : 0;
  const ita = itaOf(lab);
  const mst = nearestMst(lab);
  const undertone = undertoneOf(lab);
  let balance = 1;
  const l = regions.left && regions.left.length ? meanLab(trimByLightness(regions.left)) : null;
  const r = regions.right && regions.right.length ? meanLab(trimByLightness(regions.right)) : null;
  if (l && r) balance = 1 - clamp((Math.abs(l[0] - r[0]) - 4) / 16, 0, 1);
  const countConf = clamp(count / 1500, 0, 1);
  // Distance to the nearest undertone threshold: a hue right on a boundary is a coin toss.
  const h = hueAngle(lab);
  const edge = Math.min(Math.abs(h - UNDERTONE.warmAbove), Math.abs(h - UNDERTONE.coolBelow));
  const hueConf = clamp(edge / 6, 0.3, 1);
  const base = opts.whiteCard ? 0.55 : 0.4;
  const confidence = clamp(base + 0.2 * countConf + 0.15 * balance + 0.1 * hueConf, 0, opts.whiteCard ? 0.98 : 0.85);
  return {
    ita: round1(ita),
    mst,
    undertone,
    confidence: Math.round(confidence * 100) / 100,
    lab: lab.map(round1),
    itaBand: itaBand(ita),
  };
}
