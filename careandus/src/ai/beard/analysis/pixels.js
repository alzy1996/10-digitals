// Pixel helpers shared by capture and analysis. The math works on plain
// ImageData-like objects ({ data: RGBA bytes, width, height }) so unit tests can
// feed synthetic images; only the canvas helpers at the bottom need a browser.

import { srgbToLinear, linearToSrgb, linearRgbToLab, clamp } from './color.js';

/** sRGB byte -> linear 0..1. */
export const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i);
  return t;
})();

const LIN_STEPS = 4096;
const LINEAR_TO_SRGB = (() => {
  const t = new Uint8ClampedArray(LIN_STEPS + 1);
  for (let i = 0; i <= LIN_STEPS; i++) t[i] = Math.round(linearToSrgb(i / LIN_STEPS));
  return t;
})();

/** linear 0..1 -> sRGB byte (clamped). */
export function linearToSrgb8(lin) {
  return LINEAR_TO_SRGB[(clamp(lin, 0, 1) * LIN_STEPS + 0.5) | 0];
}

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

/** CIE L* from relative luminance Y (0..1). */
export function lstarFromY(y) {
  return y > EPS ? 116 * Math.cbrt(y) - 16 : KAPPA * y;
}

const UNIT_GAINS = Object.freeze([1, 1, 1]);

/** Linear RGB of pixel i (byte offset / 4) with per-channel gains. */
export function linearAt(data, p, gains = UNIT_GAINS) {
  const o = p * 4;
  return [
    SRGB_TO_LINEAR[data[o]] * gains[0],
    SRGB_TO_LINEAR[data[o + 1]] * gains[1],
    SRGB_TO_LINEAR[data[o + 2]] * gains[2],
  ];
}

/** CIELAB of pixel p (index, not byte offset) after white-balance gains in linear RGB. */
export function labAt(data, p, gains = UNIT_GAINS) {
  const lin = linearAt(data, p, gains);
  return linearRgbToLab([clamp(lin[0], 0, 1), clamp(lin[1], 0, 1), clamp(lin[2], 0, 1)]);
}

/** L* of pixel p after gains (luminance only, cheaper than labAt). */
export function lightnessAt(data, p, gains = UNIT_GAINS) {
  const o = p * 4;
  const y =
    0.2126729 * SRGB_TO_LINEAR[data[o]] * gains[0] +
    0.7151522 * SRGB_TO_LINEAR[data[o + 1]] * gains[1] +
    0.072175 * SRGB_TO_LINEAR[data[o + 2]] * gains[2];
  return lstarFromY(clamp(y, 0, 1));
}

/** 8-bit luma (Rec. 601 on gamma values), as a Float32Array. */
export function grayOf(img) {
  const { data, width, height } = img;
  const n = width * height;
  const out = new Float32Array(n);
  for (let p = 0, o = 0; p < n; p++, o += 4) out[p] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  return out;
}

/**
 * Mean filter over a (2r+1)^2 window, O(1) per pixel with running sums. Windows are
 * clipped at the borders and normalised by the clipped size.
 */
export function boxFilter(src, w, h, r, out = new Float32Array(w * h)) {
  if (r <= 0) {
    out.set(src);
    return out;
  }
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    const first = Math.min(r, w - 1);
    for (let x = 0; x <= first; x++) acc += src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = x - r < 0 ? 0 : x - r;
      const hi = x + r > w - 1 ? w - 1 : x + r;
      tmp[row + x] = acc / (hi - lo + 1);
      const add = x + r + 1;
      const rem = x - r;
      if (add < w) acc += src[row + add];
      if (rem >= 0) acc -= src[row + rem];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    const first = Math.min(r, h - 1);
    for (let y = 0; y <= first; y++) acc += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = y - r < 0 ? 0 : y - r;
      const hi = y + r > h - 1 ? h - 1 : y + r;
      out[y * w + x] = acc / (hi - lo + 1);
      const add = y + r + 1;
      const rem = y - r;
      if (add < h) acc += tmp[add * w + x];
      if (rem >= 0) acc -= tmp[rem * w + x];
    }
  }
  return out;
}

/**
 * Precomputes the guide statistics of a guided filter (He, Sun, Tang 2010) so
 * several inputs can be filtered against the same guide cheaply.
 * I: guide in 0..1, r: window radius, eps: edge-preserving regulariser.
 */
export function guidedFilterPrep(I, w, h, r, eps) {
  const n = w * h;
  const meanI = boxFilter(I, w, h, r);
  const II = new Float32Array(n);
  for (let k = 0; k < n; k++) II[k] = I[k] * I[k];
  const corrII = boxFilter(II, w, h, r);
  const denom = new Float32Array(n);
  for (let k = 0; k < n; k++) denom[k] = corrII[k] - meanI[k] * meanI[k] + eps;
  return { I, w, h, r, meanI, denom };
}

/** Guided filter of p against a prepared guide. Returns a new Float32Array. */
export function guidedFilterApply(prep, p) {
  const { I, w, h, r, meanI, denom } = prep;
  const n = w * h;
  const meanP = boxFilter(p, w, h, r);
  const Ip = new Float32Array(n);
  for (let k = 0; k < n; k++) Ip[k] = I[k] * p[k];
  const corrIp = boxFilter(Ip, w, h, r);
  const a = Ip;
  const b = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const ak = (corrIp[k] - meanI[k] * meanP[k]) / denom[k];
    a[k] = ak;
    b[k] = meanP[k] - ak * meanI[k];
  }
  const meanA = boxFilter(a, w, h, r, corrIp);
  const meanB = boxFilter(b, w, h, r, meanP);
  const q = new Float32Array(n);
  for (let k = 0; k < n; k++) q[k] = meanA[k] * I[k] + meanB[k];
  return q;
}

/** One-shot guided filter. */
export function guidedFilter(I, p, w, h, r, eps) {
  return guidedFilterApply(guidedFilterPrep(I, w, h, r, eps), p);
}

/** [minX, minY, maxX, maxY] of a polygon. */
export function polygonBBox(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/**
 * Calls fn(pixelIndex, x, y) for every pixel whose centre lies inside the polygon
 * (even-odd rule, scanline fill), clipped to the w x h image. Returns the count.
 */
export function forEachPixelInPolygon(poly, w, h, fn) {
  if (!poly || poly.length < 3) return 0;
  const [, by0, , by1] = polygonBBox(poly);
  const yStart = Math.max(0, Math.ceil(by0 - 0.5));
  const yEnd = Math.min(h - 1, Math.floor(by1 - 0.5));
  const xs = [];
  let count = 0;
  const n = poly.length;
  for (let y = yStart; y <= yEnd; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = poly[i][1];
      const yj = poly[j][1];
      if (yi > cy !== yj > cy) {
        xs.push(poly[i][0] + ((cy - yi) * (poly[j][0] - poly[i][0])) / (yj - yi));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) {
        fn(y * w + x, x, y);
        count++;
      }
    }
  }
  return count;
}

/** Andrew's monotone chain convex hull of [x, y] points, counter-clockwise in a y-up frame. */
export function convexHull(points) {
  const pts = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Linear-interpolated percentile (0..100) of a numeric array. NaN when empty. */
export function percentile(values, pct) {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort();
  const pos = (clamp(pct, 0, 100) / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Hermite smoothstep from e0 to e1 (works for e0 > e1 too, giving a falling edge). */
export function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Logistic function. */
export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/** Pixel landmarks (array of [x, y, z]) from normalized landmarks. z is scaled by width. */
export function landmarksToPixels(landmarks, w, h) {
  return landmarks.map((l) => [l.x * w, l.y * h, (l.z || 0) * w]);
}

/** Lets the browser paint and handle input between heavy steps. */
export function yieldToEventLoop() {
  if (typeof globalThis.scheduler !== 'undefined' && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------------ */
/* Canvas helpers (browser only)                                             */
/* ------------------------------------------------------------------------ */

/** A 2D-capable canvas: OffscreenCanvas when available, else a detached <canvas>. */
export function makeCanvas(w, h) {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(cw, ch);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  return c;
}

/** A visible-DOM <canvas> (for Shot.canvas, which screens may append to the page). */
export function makeDomCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function context2d(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

/**
 * Draws the source rectangle (sx, sy, sw, sh) of an image/canvas/video into a new
 * dw x dh canvas and returns { canvas, ctx, img } where img is its ImageData.
 */
export function cropToImageData(source, sx, sy, sw, sh, dw, dh) {
  const canvas = makeCanvas(dw, dh);
  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, ctx, img };
}

/** Natural size of an image-like source. */
export function sourceSize(source) {
  const w = source.videoWidth || source.naturalWidth || source.width || 0;
  const h = source.videoHeight || source.naturalHeight || source.height || 0;
  return { width: w, height: h };
}
