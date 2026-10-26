// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import { pointInPolygon } from '../../src/ai/mesh/zones.js';
import {
  laplacianVariance,
  sharpnessOf,
  qualityVerdict,
  lightingOf,
  cheekBalance,
  exposure,
  faceBox,
  QUALITY,
  CHEEK_PATCH,
} from '../../src/ai/capture/quality.js';
import { convexHull, boxFilter } from '../../src/ai/analysis/pixels.js';

function checkerboard(w, h, cell) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) * 200 + 20;
  return g;
}

describe('sharpness (Laplacian variance)', () => {
  it('is zero on a flat image and large on fine detail', () => {
    expect(laplacianVariance(new Float32Array(100 * 100).fill(128), 100, 100)).toBe(0);
    expect(laplacianVariance(checkerboard(100, 100, 2), 100, 100)).toBeGreaterThan(1000);
  });

  it('drops as the image is blurred', () => {
    const sharp = checkerboard(120, 120, 3);
    const soft = boxFilter(sharp, 120, 120, 1);
    const softer = boxFilter(sharp, 120, 120, 3);
    const v0 = laplacianVariance(sharp, 120, 120);
    const v1 = laplacianVariance(soft, 120, 120);
    const v2 = laplacianVariance(softer, 120, 120);
    expect(v1).toBeLessThan(v0);
    expect(v2).toBeLessThan(v1);
    expect(v2).toBeLessThan(QUALITY.sharpMin * 4);
  });

  it('reads RGBA images', () => {
    const w = 40;
    const data = new Uint8ClampedArray(w * w * 4);
    const g = checkerboard(w, w, 1);
    for (let p = 0; p < w * w; p++) {
      data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = g[p];
      data[p * 4 + 3] = 255;
    }
    expect(sharpnessOf({ data, width: w, height: w })).toBeGreaterThan(QUALITY.sharpMin);
  });
});

describe('capture hints (PRD 5.2)', () => {
  const good = { irisPx: 30, faceFrac: 0.5, faceL: 60, cheekDiff: 3, sharpness: 400 };

  it('passes a good frame', () => {
    const v = qualityVerdict(good);
    expect(v.hints).toEqual([]);
    expect(v.distanceOk && v.exposureOk && v.balanceOk && v.sharpOk).toBe(true);
  });

  it('asks to come closer when the iris is under 18 px', () => {
    expect(qualityVerdict({ ...good, irisPx: 17.9 }).hints).toEqual(['closer']);
    expect(qualityVerdict({ ...good, irisPx: 18 }).hints).toEqual([]);
  });

  it('asks to move back when the face fills the frame', () => {
    expect(qualityVerdict({ ...good, faceFrac: 0.95 }).hints).toEqual(['farther']);
  });

  it('flags a face L* under 25 or over 85', () => {
    expect(qualityVerdict({ ...good, faceL: 24 }).hints).toEqual(['dark']);
    expect(qualityVerdict({ ...good, faceL: 86 }).hints).toEqual(['bright']);
    expect(qualityVerdict({ ...good, faceL: 25 }).exposureOk).toBe(true);
  });

  it('asks to face the light when the cheeks differ by more than 12 L*', () => {
    expect(qualityVerdict({ ...good, cheekDiff: 12.5 }).hints).toEqual(['light']);
    expect(qualityVerdict({ ...good, cheekDiff: 12 }).hints).toEqual([]);
    expect(qualityVerdict({ ...good, cheekDiff: 20, checkBalance: false }).hints).toEqual([]);
  });

  it('flags blur and keeps the priority order', () => {
    expect(qualityVerdict({ ...good, sharpness: 5 }).hints).toEqual(['blur']);
    expect(qualityVerdict({ irisPx: 10, faceFrac: 0.3, faceL: 20, cheekDiff: 30, sharpness: 1 }).hints).toEqual([
      'closer',
      'dark',
      'light',
      'blur',
    ]);
  });
});

describe('lighting balance on a synthetic face', () => {
  const W = 400;
  const H = 400;
  const landmarks = [];
  for (let i = 0; i < 468; i++) {
    landmarks.push({ x: (200 + CANONICAL_VERTICES[3 * i] * 18) / W, y: (190 - CANONICAL_VERTICES[3 * i + 1] * 18) / H, z: 0 });
  }
  const P = landmarks.map((l) => [l.x * W, l.y * H]);

  function image(leftValue, rightValue) {
    const data = new Uint8ClampedArray(W * H * 4);
    const left = convexHull(CHEEK_PATCH.L.map((i) => P[i]));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        // The customer's left side is on the image right (un-mirrored frame).
        const v = x >= 200 || pointInPolygon([x + 0.5, y + 0.5], left) ? leftValue : rightValue;
        data[o] = v;
        data[o + 1] = v * 0.8;
        data[o + 2] = v * 0.68;
        data[o + 3] = 255;
      }
    }
    return { data, width: W, height: H };
  }

  it('reports the face L* and a small difference under even light', () => {
    const res = lightingOf(image(190, 190), P);
    expect(res.diff).toBeLessThan(0.5);
    expect(res.faceL).toBeGreaterThan(50);
    expect(res.faceL).toBeLessThan(80);
  });

  it('reports the cheek difference under side light', () => {
    const res = lightingOf(image(210, 120), P);
    expect(res.left).toBeGreaterThan(res.right);
    expect(res.diff).toBeGreaterThan(QUALITY.cheekDiffMax);
  });

  it('exposes the exposure and balance checks on their own', () => {
    expect(exposure(20)).toBe('dark');
    expect(exposure(90)).toBe('bright');
    expect(exposure(50)).toBeNull();
    expect(exposure(NaN)).toBeNull();
    expect(cheekBalance(image(210, 120), P).ok).toBe(false);
    expect(cheekBalance(image(170, 168), P).ok).toBe(true);
  });

  it('boxes the face from the landmarks', () => {
    const box = faceBox(landmarks, W, H);
    expect(box.w).toBeCloseTo(2 * 18 * Math.max(...Array.from({ length: 468 }, (_, i) => Math.abs(CANONICAL_VERTICES[3 * i]))), 0);
    const padded = faceBox(landmarks, W, H, 0.1);
    expect(padded.w).toBeCloseTo(box.w * 1.2, 6);
  });
});
