// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import {
  SHAPES,
  measureFace,
  shapeScores,
  analyzeFaceShape,
  hairlineFromMask,
  estimatedHairline,
  roundDistribution,
  calibratedFeatures,
  OVAL_PROTOTYPE,
} from '../../src/ai/analysis/faceShape.js';
import { CLASSES } from '../../src/ai/models/classes.js';

// Width factor per canonical height (cm), interpolated between these knots:
// above the brows, brows, cheekbones, mouth, gonion, chin.
const KNOTS = [9.5, 5.0, 0.7, -3.0, -6.2, -9.5];

function widthFactor(y, f) {
  if (y >= KNOTS[0]) return f[0];
  for (let i = 0; i < KNOTS.length - 1; i++) {
    if (y <= KNOTS[i] && y >= KNOTS[i + 1]) {
      const t = (KNOTS[i] - y) / (KNOTS[i] - KNOTS[i + 1]);
      return f[i] + (f[i + 1] - f[i]) * t;
    }
  }
  return f[f.length - 1];
}

/** The canonical face warped (x by height band, y uniformly), in image pixels (y down). */
function face({ sy = 1, f = [1, 1, 1, 1, 1, 1] } = {}, s = 20, c = 400) {
  const P = [];
  for (let i = 0; i < 468; i++) {
    const x = CANONICAL_VERTICES[3 * i];
    const y = CANONICAL_VERTICES[3 * i + 1];
    P.push([c + x * widthFactor(y, f) * s, c - y * sy * s]);
  }
  return P;
}

// One synthetic landmark set per shape (PRD 5.4 starting rules).
const SETS = {
  oval: {},
  oblong: { sy: 1.16, f: [1.04, 1.04, 1, 1.03, 1.08, 1.0] },
  round: { sy: 0.82, f: [1, 1, 1, 1.02, 0.95, 1.15] },
  square: { sy: 0.9, f: [1.05, 1.05, 1, 1.0, 1.12, 0.95] },
  heart: { sy: 1.0, f: [1.13, 1.13, 1, 0.92, 0.84, 0.78] },
  diamond: { sy: 1.0, f: [0.82, 0.82, 1, 0.93, 0.88, 0.95] },
  triangle: { sy: 1.0, f: [0.97, 0.97, 1, 1.08, 1.2, 1.1] },
};

describe('face shape rules (PRD 5.4)', () => {
  it.each(SHAPES)('a synthetic %s face classifies as %s', (shape) => {
    const res = shapeScores(measureFace(face(SETS[shape])));
    expect(res.top).toBe(shape);
    expect(res.scores[shape]).toBeGreaterThan(0.5);
  });

  it('scores sum to exactly 1 with two decimals', () => {
    for (const shape of SHAPES) {
      const { scores } = shapeScores(measureFace(face(SETS[shape])));
      const sum = Object.values(scores).reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 100)).toBe(100);
      for (const v of Object.values(scores)) expect(Math.round(v * 100)).toBeCloseTo(v * 100, 6);
      expect(Object.keys(scores).sort()).toEqual([...SHAPES].sort());
    }
  });

  it('maps the canonical (average) face onto the oval prototype', () => {
    const f = calibratedFeatures(measureFace(face()));
    expect(f.ratio).toBeCloseTo(OVAL_PROTOTYPE.ratio, 6);
    expect(f.F).toBeCloseTo(OVAL_PROTOTYPE.foreheadToCheek, 6);
    expect(f.J).toBeCloseTo(OVAL_PROTOTYPE.jawToCheek, 6);
    expect(f.jawAngle).toBeCloseTo(OVAL_PROTOTYPE.jawAngle, 6);
  });

  it('reads a wider gonion as a sharper jaw angle', () => {
    const soft = measureFace(face(SETS.round)).jawAngle;
    const sharp = measureFace(face(SETS.square)).jawAngle;
    expect(sharp).toBeLessThan(soft - 10);
  });

  it('is invariant to image scale and position', () => {
    const a = shapeScores(measureFace(face(SETS.heart, 20, 400)));
    const b = shapeScores(measureFace(face(SETS.heart, 7, 150)));
    expect(b.scores).toEqual(a.scores);
  });

  it('rounds a distribution with the largest-remainder rule', () => {
    const r = roundDistribution({ a: 1 / 3, b: 1 / 3, c: 1 / 3 });
    expect(r.a + r.b + r.c).toBeCloseTo(1, 10);
  });
});

describe('hairline from the class mask', () => {
  const W = 800;
  const H = 800;

  function maskWith(hairlineY, aboveClass = CLASSES.HAIR) {
    const m = new Uint8Array(W * H).fill(CLASSES.BACKGROUND);
    for (let y = 0; y < H; y++) {
      for (let x = 150; x < 650; x++) {
        if (y >= hairlineY) m[y * W + x] = CLASSES.FACE_SKIN;
        else if (y >= hairlineY - 120) m[y * W + x] = aboveClass;
      }
    }
    return m;
  }

  it('walks up from landmark 10 to the skin / hair switch', () => {
    const P = face();
    const top = P[10][1];
    const res = hairlineFromMask(maskWith(Math.round(top - 30)), W, H, P);
    expect(res.estimated).toBe(false);
    expect(res.reason).toBe('hair');
    expect(Math.abs(res.point[1] - (top - 30))).toBeLessThanOrEqual(1.5);
  });

  it('estimates the hairline for a bald or shaved head', () => {
    const P = face();
    const m = new Uint8Array(W * H).fill(CLASSES.FACE_SKIN);
    const res = hairlineFromMask(m, W, H, P);
    expect(res.estimated).toBe(true);
    expect(res.reason).toBe('bald');
    expect(res.point).toEqual(estimatedHairline(P));
  });

  it('estimates the hairline under a cap and never below the default', () => {
    const P = face();
    const res = hairlineFromMask(maskWith(Math.round(P[10][1] - 5), CLASSES.OTHERS), W, H, P);
    expect(res.estimated).toBe(true);
    expect(res.reason).toBe('cover');
    expect(res.point[1]).toBeLessThanOrEqual(estimatedHairline(P)[1] + 1e-9);
  });

  it('reports the face-shape block with measures in mm', () => {
    const P = face(SETS.oval);
    const top = P[10][1];
    const out = analyzeFaceShape(P, 0.5, { categories: maskWith(Math.round(top - 30)), width: W, height: H });
    expect(out.measures.hairlineEstimated).toBe(false);
    expect(out.measures.faceLengthMm).toBeGreaterThan(0);
    expect(out.measures.cheekboneWidthMm).toBeCloseTo(0.5 * 20 * 15.33, 0);
    expect(typeof out.jawAngleDeg).toBe('number');
    expect(SHAPES).toContain(out.top);
  });
});
