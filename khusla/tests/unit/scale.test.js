import { describe, expect, it } from 'vitest';
import { irisWidthPx, mmPerPxFromIris, computeScale, roundLengthCm, IRIS_A, IRIS_B } from '../../src/ai/analysis/scale.js';

function irisPts(cx, cy, r, tilt = 0) {
  const pts = Array.from({ length: 478 }, () => [0, 0, 0]);
  const put = (center, ids, x) => {
    pts[center] = [x, cy, 0];
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    ids.forEach((id, i) => {
      const a = angles[i] + tilt;
      pts[id] = [x + r * Math.cos(a), cy + r * Math.sin(a), 0];
    });
  };
  put(468, IRIS_A, cx - 60);
  put(473, IRIS_B, cx + 60);
  return pts;
}

describe('Iris scale (PRD 5.3)', () => {
  it('picks the horizontal pair and converts iris width to mm per px', () => {
    const pts = irisPts(500, 400, 12); // 24 px iris
    expect(irisWidthPx(pts, IRIS_A)).toBeCloseTo(24, 5);
    expect(mmPerPxFromIris(24)).toBeCloseTo(11.7 / 24, 6);
    const s = computeScale(pts, 0);
    expect(s.mmPerPx).toBeCloseTo(0.4875, 4);
    expect(s.source).toBe('iris');
  });
  it('uses the larger (nearer) eye when the head is turned', () => {
    const pts = irisPts(500, 400, 12);
    for (const id of IRIS_B) pts[id] = [pts[473][0] + (pts[id][0] - pts[473][0]) * 0.8, pts[id][1], 0];
    expect(computeScale(pts, 20).irisPx).toBeCloseTo(24, 4);
    expect(computeScale(pts, 0).irisPx).toBeCloseTo(21.6, 4);
  });
  it('rounds lengths to 0.5 cm', () => {
    expect(roundLengthCm(17.74)).toBe(17.5);
    expect(roundLengthCm(17.76)).toBe(18);
    expect(roundLengthCm(46.2)).toBe(46);
  });
});
