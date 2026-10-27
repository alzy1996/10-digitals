// White balance: white card tap (Pro accuracy) or gray-world on the background, gains capped at ±15%.
import { LIN } from '../analysis/imageOps.js';
import { linearToSrgb } from '../analysis/color.js';

export const GRAY_WORLD_CAP = 0.15;

/** Mean RGB of a square around (x, y). */
export function sampleSquare(img, x, y, half) {
  const s = [0, 0, 0];
  let n = 0;
  for (let yy = Math.max(0, Math.round(y - half)); yy <= Math.min(img.height - 1, Math.round(y + half)); yy += 1) {
    for (let xx = Math.max(0, Math.round(x - half)); xx <= Math.min(img.width - 1, Math.round(x + half)); xx += 1) {
      const i = (yy * img.width + xx) * 4;
      s[0] += img.data[i];
      s[1] += img.data[i + 1];
      s[2] += img.data[i + 2];
      n += 1;
    }
  }
  return s.map((v) => v / Math.max(1, n));
}

/** Gains (linear light) that neutralize the white card. */
export function cardGains(img, point) {
  const half = Math.max(4, Math.round(img.width * 0.02));
  const rgb = sampleSquare(img, point.x, point.y, half);
  const lin = rgb.map((c) => Math.max(0.002, LIN[Math.round(c)]));
  const mean = (lin[0] + lin[1] + lin[2]) / 3;
  return { gains: lin.map((c) => mean / c), source: 'card', cardRgb: rgb };
}

/** Gray-world over background pixels (labels === 0), gains capped at ±15%. */
export function grayWorldGains(img, labels) {
  const s = [0, 0, 0];
  let n = 0;
  const d = img.data;
  for (let i = 0; i < img.width * img.height; i += 1) {
    if (labels && labels[i] !== 0) continue;
    const p = i * 4;
    s[0] += LIN[d[p]];
    s[1] += LIN[d[p + 1]];
    s[2] += LIN[d[p + 2]];
    n += 1;
  }
  if (n < 500) return { gains: [1, 1, 1], source: 'none' };
  const mean = (s[0] + s[1] + s[2]) / 3;
  const gains = s.map((c) => Math.min(1 + GRAY_WORLD_CAP, Math.max(1 - GRAY_WORLD_CAP, mean / Math.max(1e-6, c))));
  return { gains, source: 'gray-world' };
}

/** New ImageData-like object with gains applied in linear light. */
export function applyGains(img, gains) {
  const luts = gains.map((g) => {
    const t = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i += 1) t[i] = Math.round(linearToSrgb(LIN[i] * g) * 255);
    return t;
  });
  const out = new Uint8ClampedArray(img.data.length);
  for (let p = 0; p < img.data.length; p += 4) {
    out[p] = luts[0][img.data[p]];
    out[p + 1] = luts[1][img.data[p + 1]];
    out[p + 2] = luts[2][img.data[p + 2]];
    out[p + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}
