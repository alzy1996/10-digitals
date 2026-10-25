import { describe, expect, it } from 'vitest';
import { pushPullFill } from '../../src/ai/models/inpaint.js';

function makeImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      data[i] = 40 + x; // horizontal ramp
      data[i + 1] = 60 + y; // vertical ramp
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe('Quick shorten classic fill (offline fallback)', () => {
  it('fills a hole smoothly from its surroundings without blocks', () => {
    const w = 120;
    const h = 100;
    const img = makeImage(w, h);
    const hole = new Uint8Array(w * h);
    for (let y = 30; y < 70; y += 1) for (let x = 40; x < 80; x += 1) {
      hole[y * w + x] = 1;
      img.data[(y * w + x) * 4] = 255; // "hair" to remove
      img.data[(y * w + x) * 4 + 1] = 0;
    }
    const out = pushPullFill(img, hole);
    let maxStep = 0;
    let maxErr = 0;
    for (let y = 30; y < 70; y += 1) {
      for (let x = 40; x < 80; x += 1) {
        const i = (y * w + x) * 4;
        maxStep = Math.max(maxStep, Math.abs(out[i] - out[i + 4]), Math.abs(out[i + 1] - out[i + w * 4 + 1]));
        maxErr = Math.max(maxErr, Math.abs(out[i] - (40 + x)), Math.abs(out[i + 1] - (60 + y)));
      }
    }
    expect(maxStep).toBeLessThanOrEqual(4); // no block edges
    expect(maxErr).toBeLessThan(25); // close to what surrounds the hole
    // pixels outside the hole are untouched
    expect(out[0]).toBe(40);
    expect(out[(5 * w + 100) * 4 + 1]).toBe(65);
  });
});
