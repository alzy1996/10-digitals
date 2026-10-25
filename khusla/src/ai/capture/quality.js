// Capture quality checks: sharpness, exposure, iris size, light balance (PRD 5.2).
export const MIN_IRIS_PX = 18;
export const MAX_CHEEK_DIFF = 12;

/** Variance of the Laplacian over a gray region (0..255 scale). */
export function sharpness(gray, w, h, rect) {
  const x0 = Math.max(1, Math.round(rect.x));
  const y0 = Math.max(1, Math.round(rect.y));
  const x1 = Math.min(w - 1, Math.round(rect.x + rect.w));
  const y1 = Math.min(h - 1, Math.round(rect.y + rect.h));
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      s += lap;
      s2 += lap * lap;
      n += 1;
    }
  }
  if (!n) return 0;
  const mean = s / n;
  return s2 / n - mean * mean;
}

/** Mean luminance and clipped share inside a region of an RGBA buffer. */
export function exposure(data, w, rect) {
  let sum = 0;
  let clip = 0;
  let n = 0;
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.round(rect.x + rect.w);
  const y1 = Math.round(rect.y + rect.h);
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * w + x) * 4;
      if (i + 2 >= data.length) continue;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += l;
      if (l > 250 || l < 5) clip += 1;
      n += 1;
    }
  }
  return { mean: n ? sum / n : 0, clipped: n ? clip / n : 1 };
}

export function exposureOk({ mean, clipped }) {
  return mean > 70 && mean < 215 && clipped < 0.06;
}

/** Returns the first problem hint key or null. */
export function qualityHint({ irisPx, cheekDiff, sharp, expo, minSharp = 18 }) {
  if (irisPx && irisPx < MIN_IRIS_PX) return 'capture.closer';
  if (expo && expo.mean <= 70) return 'capture.moreLight';
  if (expo && (expo.mean >= 215 || expo.clipped >= 0.06)) return 'capture.lessLight';
  if (cheekDiff > MAX_CHEEK_DIFF) return 'capture.faceLight';
  if (sharp !== undefined && sharp < minSharp) return 'capture.holdStill';
  return null;
}
