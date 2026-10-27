import { describe, expect, it } from 'vitest';
import { classifyFace, faceShape } from '../../src/ai/hair/analysis/faceShape.js';

// Canonical measures per shape (px): faceLength, cheekW, jawW, foreheadW, jawAngle
const CASES = {
  oval: { faceLength: 210, cheekW: 145, jawW: 118, foreheadW: 128, jawAngle: 132 },
  round: { faceLength: 170, cheekW: 150, jawW: 128, foreheadW: 130, jawAngle: 142 },
  square: { faceLength: 185, cheekW: 150, jawW: 142, foreheadW: 146, jawAngle: 118 },
  oblong: { faceLength: 240, cheekW: 140, jawW: 132, foreheadW: 136, jawAngle: 128 },
  heart: { faceLength: 200, cheekW: 140, jawW: 105, foreheadW: 150, jawAngle: 130 },
  diamond: { faceLength: 205, cheekW: 150, jawW: 112, foreheadW: 115, jawAngle: 130 },
  triangle: { faceLength: 195, cheekW: 140, jawW: 152, foreheadW: 122, jawAngle: 128 },
};

describe('Face-shape rules (PRD 5.4)', () => {
  for (const [shape, m] of Object.entries(CASES)) {
    it(`classifies a synthetic ${shape} face`, () => {
      const r = classifyFace(m);
      expect(r.top).toBe(shape);
      const sum = Object.values(r.scores).reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.97);
      expect(sum).toBeLessThan(1.03);
    });
  }

  it('measures a synthetic landmark set + face-skin mask end to end', () => {
    const w = 400;
    const h = 500;
    const labels = new Uint8Array(w * h);
    const pts = Array.from({ length: 478 }, () => [200, 250, 0]);
    // hairline at y=100, chin at y=310 (faceLength 210); face-skin rows from 100 to 310
    pts[10] = [200, 130, 0];
    pts[152] = [200, 310, 0];
    pts[234] = [127.5, 200, 0];
    pts[454] = [272.5, 200, 0];
    pts[172] = [141, 280, 0];
    pts[397] = [259, 280, 0];
    pts[54] = [138, 140, 0];
    pts[284] = [262, 140, 0];
    for (let y = 100; y <= 310; y += 1) {
      const half = y < 200 ? 72 : 72 - (y - 200) * 0.25;
      for (let x = Math.round(200 - half); x <= Math.round(200 + half); x += 1) labels[y * w + x] = 3;
    }
    for (let y = 40; y < 100; y += 1) for (let x = 120; x < 280; x += 1) labels[y * w + x] = 1;
    const r = faceShape(pts, labels, w, h);
    expect(Math.round(r.measures.hairlineY)).toBe(100);
    expect(r.measures.faceLength).toBeCloseTo(210, 0);
    expect(['oval', 'oblong', 'diamond', 'heart']).toContain(r.top);
  });
});
