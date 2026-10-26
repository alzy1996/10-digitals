// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import { irisWidthPx, irisForScale, mmPerPx, IRIS_MM } from '../../src/ai/analysis/scale.js';

const IRIS_RADIUS_CM = IRIS_MM / 20;

/**
 * Synthetic 478 landmarks: the canonical face (cm, y up, z toward the viewer) at
 * `s` px per cm, orthographic, centred in a W x H frame, plus iris rings
 * (11.7 mm across) at the eye centres. irisScale scales one eye's ring.
 */
function syntheticLandmarks({ W = 1000, H = 1000, s = 20, irisScale = { L: 1, R: 1 }, ringOrder = [0, 1, 2, 3] } = {}) {
  const pts = [];
  for (let i = 0; i < 468; i++) {
    pts.push([CANONICAL_VERTICES[3 * i], CANONICAL_VERTICES[3 * i + 1], CANONICAL_VERTICES[3 * i + 2]]);
  }
  const eye = (a, b) => [(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, (pts[a][2] + pts[b][2]) / 2];
  for (const [center, side] of [
    [eye(33, 133), 'R'],
    [eye(263, 362), 'L'],
  ]) {
    const r = IRIS_RADIUS_CM * irisScale[side];
    const ring = [
      [center[0] + r, center[1], center[2]],
      [center[0], center[1] + r, center[2]],
      [center[0] - r, center[1], center[2]],
      [center[0], center[1] - r, center[2]],
    ];
    pts.push(center, ...ringOrder.map((k) => ring[k]));
  }
  return pts.map(([x, y, z]) => ({ x: (W / 2 + x * s) / W, y: (H / 2 - y * s) / H, z: (-z * s) / W }));
}

describe('iris scale (PRD 5.3)', () => {
  it('measures the horizontal iris diameter in pixels', () => {
    const lm = syntheticLandmarks({ s: 20 });
    expect(irisWidthPx(lm, 1000, 1000, 'L')).toBeCloseTo(23.4, 6);
    expect(irisWidthPx(lm, 1000, 1000, 'R')).toBeCloseTo(23.4, 6);
  });

  it('converts iris width to millimetres per pixel (11.7 / irisPx)', () => {
    const lm = syntheticLandmarks({ s: 20 });
    const res = mmPerPx(lm, 1000, 1000, 0);
    expect(res.source).toBe('iris');
    expect(res.mmPerPx).toBeCloseTo(0.5, 6);
    // 30 mm on the face plane is 60 px at this scale.
    expect(30 / res.mmPerPx).toBeCloseTo(60, 4);
  });

  it('picks the horizontal pair at run time, whatever the ring order', () => {
    for (const order of [
      [1, 0, 3, 2],
      [3, 2, 1, 0],
      [0, 2, 1, 3],
    ]) {
      const lm = syntheticLandmarks({ s: 15, ringOrder: order });
      expect(irisWidthPx(lm, 1000, 1000, 'L')).toBeCloseTo(IRIS_MM * 1.5, 6);
    }
  });

  it('works on non-square frames (normalized coordinates)', () => {
    const lm = syntheticLandmarks({ W: 1280, H: 720, s: 12 });
    expect(irisWidthPx(lm, 1280, 720, 'R')).toBeCloseTo(IRIS_MM * 1.2, 6);
  });

  it('averages both eyes when |yaw| < 10', () => {
    const lm = syntheticLandmarks({ s: 20, irisScale: { L: 1.1, R: 0.9 } });
    const iris = irisForScale(lm, 1000, 1000, 6);
    expect(iris.eye).toBe('both');
    expect(iris.px).toBeCloseTo(23.4, 6);
    expect(irisForScale(lm, 1000, 1000, -9.9).eye).toBe('both');
  });

  it('uses the eye nearer the camera when the head is turned', () => {
    const lm = syntheticLandmarks({ s: 20, irisScale: { L: 0.8, R: 1.05 } });
    // yaw > 0: customer turned to his left, so his right eye is nearer.
    const left = irisForScale(lm, 1000, 1000, 40);
    expect(left.eye).toBe('R');
    expect(left.px).toBeCloseTo(23.4 * 1.05, 6);
    const right = irisForScale(lm, 1000, 1000, -40);
    expect(right.eye).toBe('L');
    expect(right.px).toBeCloseTo(23.4 * 0.8, 6);
    expect(mmPerPx(lm, 1000, 1000, 40).mmPerPx).toBeCloseTo(IRIS_MM / (23.4 * 1.05), 6);
  });

  it('is more confident with a larger iris and agreeing eyes', () => {
    const near = mmPerPx(syntheticLandmarks({ s: 25 }), 1000, 1000, 0);
    const far = mmPerPx(syntheticLandmarks({ s: 10 }), 1000, 1000, 0);
    const uneven = mmPerPx(syntheticLandmarks({ s: 25, irisScale: { L: 1.3, R: 0.75 } }), 1000, 1000, 0);
    expect(near.confidence).toBeGreaterThan(far.confidence);
    expect(near.confidence).toBeGreaterThan(uneven.confidence);
    expect(near.confidence).toBeLessThanOrEqual(1);
  });

  it('falls back to the face width with low confidence when there is no iris', () => {
    const lm = syntheticLandmarks({ s: 20 }).slice(0, 468);
    const res = mmPerPx(lm, 1000, 1000, 0);
    expect(res.source).toBe('faceWidth');
    expect(res.confidence).toBeLessThan(0.5);
    expect(res.mmPerPx).toBeGreaterThan(0.3);
    expect(res.mmPerPx).toBeLessThan(0.7);
    expect(Number.isNaN(irisWidthPx(lm, 1000, 1000, 'L'))).toBe(true);
  });
});
