// White balance (PRD 5.2 "Pro accuracy").
//
// With a card: the customer holds plain white paper beside the cheek in the front
// shot and the barber taps it. The card is region-grown from the tap over bright,
// low-chroma, uniform pixels; per-channel gains in linear RGB then make its mean
// neutral (a* and b* near 0). Green is the reference channel (gain 1).
//
// Without a card: gray-world on the background-class pixels, gains capped at
// +/-15 % so a coloured wall cannot push skin tones far.
//
// Gains apply to every analysis of the session: multiply linear RGB, then convert.

import { SRGB_TO_LINEAR, linearToSrgb8, labAt, makeCanvas, context2d } from '../analysis/pixels.js';
import { clamp } from '../analysis/color.js';
import { CLASSES } from '../models/classes.js';
import { FACE_OVAL, pointInPolygon } from '../mesh/zones.js';

export const CARD = Object.freeze({
  /** Longest side of the image the region grows on. */
  workSize: 640,
  /** Seed (and every card pixel) must be at least this light. */
  minL: 45,
  /** Upper chroma bound: allows a tint from coloured shop light, rejects skin. */
  maxChroma: 32,
  /** Max colour step between neighbours (uniform surface, stops at edges). */
  maxStep: 3.5,
  /** Max distance from the seed colour (smooth light falloff across the card). */
  maxFromSeed: 14,
  /** Area limits as a share of the image. */
  minArea: 0.0015,
  maxArea: 0.35,
  minPixels: 120,
  /** Gain limits: a "card" that needs more correction than this is not white paper. */
  gainMin: 0.55,
  gainMax: 1.8,
  /** Share of the region allowed inside the excluded area (the face). */
  maxExcluded: 0.2,
});

export const GRAY_WORLD_CAP = 0.15;

/** Gains [r, 1, b] that make the linear RGB colour `lin` neutral. */
export function neutralGains(lin) {
  const [r, g, b] = lin;
  if (!(r > 0 && g > 0 && b > 0)) return [1, 1, 1];
  return [g / r, 1, g / b];
}

/** Copy of an ImageData-like image with gains applied in linear RGB (sRGB in, sRGB out). */
export function applyGains(img, gains, out) {
  const src = img.data;
  const n = img.width * img.height;
  const dst = out ? out.data : new Uint8ClampedArray(src.length);
  const [gr, gg, gb] = gains || [1, 1, 1];
  for (let p = 0, o = 0; p < n; p++, o += 4) {
    dst[o] = linearToSrgb8(SRGB_TO_LINEAR[src[o]] * gr);
    dst[o + 1] = linearToSrgb8(SRGB_TO_LINEAR[src[o + 1]] * gg);
    dst[o + 2] = linearToSrgb8(SRGB_TO_LINEAR[src[o + 2]] * gb);
    dst[o + 3] = src[o + 3];
  }
  if (out) return out;
  return { data: dst, width: img.width, height: img.height };
}

/** Trimmed mean of linear RGB over the listed pixel indices (drops clipped and the darkest 10 %). */
function trimmedLinearMean(data, pixels) {
  const rows = [];
  for (const p of pixels) {
    const o = p * 4;
    if (data[o] >= 250 || data[o + 1] >= 250 || data[o + 2] >= 250) continue;
    const r = SRGB_TO_LINEAR[data[o]];
    const g = SRGB_TO_LINEAR[data[o + 1]];
    const b = SRGB_TO_LINEAR[data[o + 2]];
    rows.push([r, g, b, 0.2126 * r + 0.7152 * g + 0.0722 * b]);
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a[3] - b[3]);
  const from = Math.floor(rows.length * 0.1);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let k = from; k < rows.length; k++) {
    r += rows[k][0];
    g += rows[k][1];
    b += rows[k][2];
    n++;
  }
  return { mean: [r / n, g / n, b / n], used: n, total: pixels.length, clipped: pixels.length - rows.length };
}

/**
 * Region-grows a white card from pixel (px, py) of an ImageData-like image.
 * opts.exclude: polygon (array of [x, y] in pixels) where a card cannot be, such as
 * the face oval (teeth and the whites of the eyes are bright and neutral too).
 * Returns { rect: { x, y, w, h } (pixels), pixels: number[], gains: [r, g, b] }
 * or null when the tap is not on a usable card.
 */
export function whiteCardFromImageData(img, px, py, { exclude = null } = {}) {
  const { data, width: w, height: h } = img;
  const sx = Math.round(px);
  const sy = Math.round(py);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  if (exclude && pointInPolygon([sx + 0.5, sy + 0.5], exclude)) return null;
  const labCache = new Map();
  const lab = (p) => {
    let v = labCache.get(p);
    if (!v) {
      v = labAt(data, p);
      labCache.set(p, v);
    }
    return v;
  };
  // Seed colour: median-ish of the 5 x 5 patch around the tap (robust to one odd pixel).
  const patch = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) patch.push(lab(y * w + x));
    }
  }
  patch.sort((a, b) => a[0] - b[0]);
  const seed = patch[Math.floor(patch.length / 2)];
  const chroma = (c) => Math.hypot(c[1], c[2]);
  if (seed[0] < CARD.minL + 5 || chroma(seed) > CARD.maxChroma) return null;

  const visited = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  visited[sy * w + sx] = 1;
  const pixels = [];
  const maxPixels = Math.floor(CARD.maxArea * w * h) + 1;
  let x0 = sx;
  let x1 = sx;
  let y0 = sy;
  let y1 = sy;
  const ok = (c, from) => {
    if (c[0] < CARD.minL || chroma(c) > CARD.maxChroma) return false;
    const dSeed = Math.hypot(c[0] - seed[0], c[1] - seed[1], c[2] - seed[2]);
    if (dSeed > CARD.maxFromSeed) return false;
    return Math.hypot(c[0] - from[0], c[1] - from[1], c[2] - from[2]) <= CARD.maxStep;
  };
  while (stack.length) {
    const p = stack.pop();
    pixels.push(p);
    if (pixels.length > maxPixels) return null;
    const x = p % w;
    const y = (p - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const c = lab(p);
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) {
      if (q < 0 || visited[q]) continue;
      if (ok(lab(q), c)) {
        visited[q] = 1;
        stack.push(q);
      }
    }
  }
  if (pixels.length < Math.max(CARD.minPixels, CARD.minArea * w * h)) return null;
  if (exclude) {
    let inside = 0;
    for (const p of pixels) {
      const x = p % w;
      if (pointInPolygon([x + 0.5, (p - x) / w + 0.5], exclude)) inside++;
    }
    if (inside > CARD.maxExcluded * pixels.length) return null;
  }
  const stats = trimmedLinearMean(data, pixels);
  if (!stats || stats.used < CARD.minPixels * 0.5 || stats.clipped > 0.5 * stats.total) return null;
  const gains = neutralGains(stats.mean);
  if (gains.some((g) => g < CARD.gainMin || g > CARD.gainMax)) return null;
  return { rect: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, pixels, gains };
}

/**
 * Barber taps the card on a captured shot. xNorm / yNorm: tap position as a share
 * of the shot width / height (the shot is never mirrored). Returns
 * { rect: { x, y, w, h } (shares of the shot), gains: [r, g, b] } or null.
 */
export function whiteCardFromTap(shot, xNorm, yNorm) {
  if (!shot || !shot.canvas) return null;
  const sw = shot.width || shot.canvas.width;
  const sh = shot.height || shot.canvas.height;
  const s = Math.min(1, CARD.workSize / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s));
  const h = Math.max(1, Math.round(sh * s));
  const canvas = makeCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.drawImage(shot.canvas, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const exclude =
    shot.landmarks && shot.landmarks.length >= 468 ? FACE_OVAL.map((i) => [shot.landmarks[i].x * w, shot.landmarks[i].y * h]) : null;
  const res = whiteCardFromImageData(img, xNorm * w, yNorm * h, { exclude });
  if (!res) return null;
  const gains = res.gains.map((g) => Math.round(g * 1000) / 1000);
  return { rect: { x: res.rect.x / w, y: res.rect.y / h, w: res.rect.w / w, h: res.rect.h / h }, gains };
}

/**
 * Gray-world gains from the background-class pixels of a segmented image.
 * categories: Uint8Array at the image size (or null: then the whole image is used).
 * Gains are capped at 1 +/- cap; [1, 1, 1] when there is too little background.
 */
export function grayWorldGains(img, categories, { cap = GRAY_WORLD_CAP, cls = CLASSES.BACKGROUND } = {}) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const step = n > 200000 ? 2 : 1;
  const pixels = [];
  for (let p = 0; p < n; p += step) {
    if (categories && categories[p] !== cls) continue;
    const o = p * 4;
    const mx = Math.max(data[o], data[o + 1], data[o + 2]);
    if (mx < 12) continue;
    pixels.push(p);
  }
  if (pixels.length < 0.02 * (n / step)) return [1, 1, 1];
  const stats = trimmedLinearMean(data, pixels);
  if (!stats) return [1, 1, 1];
  return neutralGains(stats.mean).map((g) => Math.round(clamp(g, 1 - cap, 1 + cap) * 1000) / 1000);
}
