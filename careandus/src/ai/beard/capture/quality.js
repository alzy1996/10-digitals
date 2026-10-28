// Frame quality checks for the guided capture (PRD 5.2): sharpness (Laplacian
// variance on a downscaled face crop), exposure (face L*) and lighting balance
// (left vs right cheek L*). Pure functions on ImageData-like objects.

import { lightnessAt, grayOf, convexHull, forEachPixelInPolygon, percentile } from '../analysis/pixels.js';

export const QUALITY = Object.freeze({
  /** Iris narrower than this (px in the analysed frame) -> 'closer'. */
  irisMinPx: 18,
  /** Face box wider/taller than this share of the frame -> 'farther'. */
  faceMaxFrac: 0.9,
  /** Face L* under / over these -> 'dark' / 'bright'. */
  lDark: 25,
  lBright: 85,
  /** Left vs right cheek L* difference over this -> 'light' (turn to face the light). */
  cheekDiffMax: 12,
  /** Width of the face crop the sharpness is measured on. */
  sharpWidth: 160,
  /** Minimum Laplacian variance on that crop (calibrated on a sharp portrait and blurred copies). */
  sharpMin: 25,
});

/** Upper-cheek reference patches (landmark rings), customer's own sides. */
export const CHEEK_PATCH = Object.freeze({
  L: Object.freeze([330, 347, 280, 352, 425, 266]),
  R: Object.freeze([101, 118, 50, 123, 205, 36]),
});

/** Forehead patch between the brows and landmark 10 (eyebrow hairs excluded). */
export const FOREHEAD_PATCH = Object.freeze([69, 108, 151, 337, 299, 297, 338, 10, 109, 67]);

/** Variance of the 4-neighbour Laplacian of a grayscale image. */
export function laplacianVariance(gray, w, h) {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const k = row + x;
      const v = gray[k - 1] + gray[k + 1] + gray[k - w] + gray[k + w] - 4 * gray[k];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Laplacian variance of an ImageData-like image. */
export function sharpnessOf(img) {
  return laplacianVariance(grayOf(img), img.width, img.height);
}

/**
 * Face box in pixels from normalized landmarks: { x, y, w, h } around the face
 * oval, optionally padded by `pad` of its size on every side.
 */
export function faceBox(landmarks, width, height, pad = 0) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 468; i++) {
    const p = landmarks[i];
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const w = (x1 - x0) * width;
  const h = (y1 - y0) * height;
  return { x: x0 * width - pad * w, y: y0 * height - pad * h, w: w * (1 + 2 * pad), h: h * (1 + 2 * pad) };
}

/** Median L* of the pixels inside a landmark patch (convex hull of the rings), with gains. */
export function patchLightness(img, landmarksPx, ring, gains) {
  const hull = convexHull(ring.map((i) => landmarksPx[i]));
  const values = [];
  forEachPixelInPolygon(hull, img.width, img.height, (p) => {
    values.push(lightnessAt(img.data, p, gains));
  });
  return values.length ? percentile(values, 50) : NaN;
}

/**
 * Face lightness and cheek balance. landmarksPx: array of [x, y] in img pixels.
 * Returns { faceL, left, right, diff } (L* units).
 */
export function lightingOf(img, landmarksPx, gains) {
  const { left, right } = cheekBalance(img, landmarksPx, gains);
  const fore = patchLightness(img, landmarksPx, FOREHEAD_PATCH, gains);
  const vals = [left, right, fore].filter((v) => Number.isFinite(v));
  const faceL = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : NaN;
  const diff = Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : 0;
  return { faceL, left, right, diff };
}

/** Exposure verdict of a face L*: 'dark' under 25, 'bright' over 85, else null. */
export function exposure(faceL) {
  if (!Number.isFinite(faceL)) return null;
  if (faceL < QUALITY.lDark) return 'dark';
  if (faceL > QUALITY.lBright) return 'bright';
  return null;
}

/** Left vs right upper-cheek L*: { left, right, diff, ok } (ok when diff <= 12). */
export function cheekBalance(img, landmarksPx, gains) {
  const left = patchLightness(img, landmarksPx, CHEEK_PATCH.L, gains);
  const right = patchLightness(img, landmarksPx, CHEEK_PATCH.R, gains);
  const diff = Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : 0;
  return { left, right, diff, ok: diff <= QUALITY.cheekDiffMax };
}

/**
 * Quality verdict. Inputs: { irisPx, faceFrac, faceL, cheekDiff, sharpness,
 * checkBalance }. Returns { hints (array of hint keys), exposureOk, sharpOk, balanceOk,
 * distanceOk } with hints in priority order (distance, exposure, light, blur).
 */
export function qualityVerdict({ irisPx, faceFrac, faceL, cheekDiff, sharpness, checkBalance = true }) {
  const hints = [];
  const closer = Number.isFinite(irisPx) && irisPx < QUALITY.irisMinPx;
  const farther = Number.isFinite(faceFrac) && faceFrac > QUALITY.faceMaxFrac;
  if (closer) hints.push('closer');
  if (farther) hints.push('farther');
  const exp = exposure(faceL);
  const dark = exp === 'dark';
  const bright = exp === 'bright';
  if (dark) hints.push('dark');
  if (bright) hints.push('bright');
  const unbalanced = checkBalance && Number.isFinite(cheekDiff) && cheekDiff > QUALITY.cheekDiffMax;
  if (unbalanced) hints.push('light');
  const blurry = Number.isFinite(sharpness) && sharpness < QUALITY.sharpMin;
  if (blurry) hints.push('blur');
  return {
    hints,
    distanceOk: !closer && !farther,
    exposureOk: !dark && !bright,
    balanceOk: !unbalanced,
    sharpOk: !blurry,
  };
}
