import { describe, it, expect } from 'vitest';
import STYLES from '../../src/data/styles.json';
import { jawlineDelta, jawlineDetail, jawlineLabels, faceMeasures, lateralMm } from '../../src/ai/recommend/jawline.js';
import { paramsFromStyle, setZoneLength } from '../../src/lib/look.js';

const style = (id) => STYLES.find((s) => s.id === id);
const params = (id) => paramsFromStyle(style(id));

const round = {
  scale: { mmPerPx: 0.08 },
  faceShape: {
    top: 'round',
    jawAngleDeg: 141,
    measures: { faceLengthMm: 170, foreheadWidthMm: 130, cheekboneWidthMm: 142, jawWidthMm: 128, lengthToCheek: 1.197, chinAngleDeg: 120 },
  },
};
const square = {
  scale: { mmPerPx: 0.08 },
  faceShape: {
    top: 'square',
    jawAngleDeg: 118,
    measures: { faceLengthMm: 178, foreheadWidthMm: 136, cheekboneWidthMm: 140, jawWidthMm: 134, lengthToCheek: 1.271 },
  },
};
const oblong = { faceShape: { top: 'oblong', jawAngleDeg: 126, measures: { faceLengthMm: 215, foreheadWidthMm: 128, cheekboneWidthMm: 134, jawWidthMm: 124 } } };

describe('jawlineDelta (PRD 6.2)', () => {
  it('returns exactly the contract fields', () => {
    expect(Object.keys(jawlineDelta(round, params('goatee'))).sort()).toEqual(['jawSoftPct', 'lengthPct', 'widthPct']);
  });

  it('round face + chin length reads longer, more with more length', () => {
    const goatee = jawlineDelta(round, params('goatee'));
    expect(goatee.lengthPct).toBeGreaterThan(3);
    expect(goatee.widthPct).toBe(0);
    const shortChin = jawlineDelta(round, setZoneLength(params('goatee'), 'C', 8));
    const longChin = jawlineDelta(round, setZoneLength(params('goatee'), 'C', 30));
    expect(longChin.lengthPct).toBeGreaterThan(goatee.lengthPct);
    expect(goatee.lengthPct).toBeGreaterThan(shortChin.lengthPct);
    expect(jawlineDelta(round, params('ducktail')).lengthPct).toBeGreaterThan(goatee.lengthPct);
  });

  it('square jaw + cheek volume reads softer', () => {
    for (const id of ['corporate', 'full-medium', 'khatt']) {
      const d = jawlineDelta(square, params(id));
      expect(d.jawSoftPct, id).toBeGreaterThan(3);
    }
    expect(jawlineDelta(square, params('full-medium')).jawSoftPct).toBeGreaterThan(jawlineDelta(square, params('corporate')).jawSoftPct);
    // no jaw or cheek hair: the jaw angle does not change
    expect(jawlineDelta(square, params('goatee')).jawSoftPct).toBe(0);
  });

  it('a flat, boxed bottom keeps the jaw more angular than a rounded one', () => {
    const p = params('corporate');
    const flat = { ...p, shape: { ...p.shape, chin: 'flat' } };
    expect(jawlineDelta(square, flat).jawSoftPct).toBeLessThan(jawlineDelta(square, p).jawSoftPct);
  });

  it('cheek and sideburn volume adds width and shortens how long the face reads', () => {
    const d = jawlineDelta(oblong, params('short-boxed'));
    expect(d.widthPct).toBeGreaterThan(3);
    expect(d.lengthPct).toBeLessThan(0);
  });

  it('clean shave changes nothing', () => {
    expect(jawlineDelta(round, params('clean-shave'))).toEqual({ lengthPct: 0, jawSoftPct: 0, widthPct: 0 });
  });

  it('hair offsets grow more slowly than hair length', () => {
    expect(lateralMm(0)).toBe(0);
    expect(lateralMm(10)).toBeCloseTo(6, 6);
    expect(lateralMm(100)).toBeLessThan(50);
    expect(lateralMm(60)).toBeGreaterThan(lateralMm(30));
  });
});

describe('jawlineDelta degrades gracefully', () => {
  it('works without any profile', () => {
    const d = jawlineDelta(null, params('full-medium'));
    for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
    expect(jawlineDetail(undefined, null).lengthPct).toBe(0);
  });

  it('uses the shape prototype when measures are missing', () => {
    const p = { faceShape: { top: 'round', scores: { round: 1 } } };
    const m = faceMeasures(p);
    expect(m.source).toBe('shape');
    expect(m.length / m.cheek).toBeCloseTo(1.2, 2);
    expect(jawlineDelta(p, params('goatee')).lengthPct).toBeGreaterThan(0);
  });

  it('converts pixel measures with the iris scale', () => {
    const p = { scale: { mmPerPx: 0.1 }, faceShape: { top: 'oval', jawAngleDeg: 130, measures: { faceLengthPx: 1900, cheekPx: 1400, jawPx: 1200, foreheadPx: 1300 } } };
    const m = faceMeasures(p);
    expect(m.source).toBe('measures');
    expect(m.length).toBeCloseTo(190, 6);
    expect(m.cheek).toBeCloseTo(140, 6);
    expect(m.jaw).toBeCloseTo(120, 6);
  });

  it('uses the ratio when only lengthToCheek is known (no iris scale)', () => {
    const p = { faceShape: { top: 'oval', measures: { faceLengthMm: null, cheekboneWidthMm: null, lengthToCheek: 1.5 } } };
    const m = faceMeasures(p);
    expect(m.source).toBe('ratio');
    expect(m.length / m.cheek).toBeCloseTo(1.5, 6);
  });

  it('reports before and after ratios for the overlay', () => {
    const d = jawlineDetail(round, params('goatee'));
    expect(d.after.ratio).toBeGreaterThan(d.before.ratio);
    expect(d.after.lengthMm).toBeGreaterThan(d.before.lengthMm);
    expect(d.addMm.chin).toBeGreaterThan(0);
  });
});

describe('jawlineLabels', () => {
  it('turns deltas into overlay captions, biggest first', () => {
    expect(jawlineLabels({ lengthPct: 8.2, jawSoftPct: -6.4, widthPct: 1 })).toEqual([
      { key: 'catalog.jaw.longer', vars: { pct: 8 } },
      { key: 'catalog.jaw.sharper', vars: { pct: 6 } },
    ]);
    expect(jawlineLabels({ lengthPct: -3, jawSoftPct: 12, widthPct: 20 })[0]).toEqual({ key: 'catalog.jaw.wider', vars: { pct: 20 } });
    expect(jawlineLabels({ lengthPct: 0.5, jawSoftPct: 0, widthPct: 1 })).toEqual([{ key: 'catalog.jaw.same', vars: {} }]);
    expect(jawlineLabels(null)).toEqual([{ key: 'catalog.jaw.same', vars: {} }]);
  });
});
