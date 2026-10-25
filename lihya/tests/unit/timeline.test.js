import { describe, it, expect } from 'vitest';
import RENDER_STRINGS from '../../src/lib/i18n/ns/render.json';
import {
  TIMELINE_STOPS,
  growthAt,
  densityCover,
  coverAtLength,
  zoneCoverage,
  currentLengths,
  DEFAULT_GROWTH_MM_PER_DAY,
  ZONES,
} from '../../src/ai/render/timeline.js';

const zonesAll = (mm) => Object.fromEntries(ZONES.map((z) => [z, mm]));

function profileWith(zones) {
  return { beard: { zones, greyRatio: 0, colorLab: [18, 2, 3] } };
}

const shaved = profileWith(Object.fromEntries(ZONES.map((z) => [z, { density: 70, lengthMm: 0, confidence: 0.4 }])));

describe('TIMELINE_STOPS', () => {
  it('has today, 1, 2, 4, 8 and 12 weeks in order', () => {
    expect(TIMELINE_STOPS.map((s) => s.days)).toEqual([0, 7, 14, 28, 56, 84]);
    expect(TIMELINE_STOPS[0].key).toBe('today');
  });

  it('every label key exists in render.json in both languages', () => {
    for (const s of TIMELINE_STOPS) {
      for (const key of [s.labelKey, s.noteKey].filter(Boolean)) {
        expect(RENDER_STRINGS.en[key], key).toBeTruthy();
        expect(RENDER_STRINGS.ar[key], key).toBeTruthy();
      }
    }
    expect(RENDER_STRINGS.en['render.timeline.awkward']).toBe('Week 2: awkward stage');
    expect(RENDER_STRINGS.en['render.timeline.fullShape']).toBe('Week 8: full shape');
  });
});

describe('growthAt', () => {
  const target = { styleId: 'full-medium', zones: zonesAll(30), lines: { cheek: 'natural' } };

  it('length(t) = min(target, current + rate x days) per zone', () => {
    const profile = profileWith({ ...Object.fromEntries(ZONES.map((z) => [z, { density: 80, lengthMm: 2, confidence: 0.8 }])) });
    const g = growthAt(target, profile, 14, 0.5);
    for (const z of ZONES) expect(g.lengths[z]).toBeCloseTo(Math.min(30, 2 + 0.5 * 14), 5);
    const late = growthAt(target, profile, 84, 0.5);
    for (const z of ZONES) expect(late.lengths[z]).toBe(30);
  });

  it('uses 0.4 mm per day by default and returns a new params object', () => {
    expect(DEFAULT_GROWTH_MM_PER_DAY).toBe(0.4);
    const g = growthAt(target, shaved, 28);
    expect(g.lengths.C).toBeCloseTo(11.2, 5);
    expect(g.params.zones.C).toBeCloseTo(11.2, 5);
    expect(g.params.lines).toEqual(target.lines);
    expect(target.zones.C).toBe(30);
    expect(g.params).not.toBe(target);
  });

  it('never grows a zone the look keeps shaved', () => {
    const goatee = { zones: { ...zonesAll(0), C: 15, S: 10 } };
    const g = growthAt(goatee, shaved, 84);
    expect(g.lengths.K_L).toBe(0);
    expect(g.lengths.C).toBe(15);
    expect(g.coverage.K_L).toBe(0);
  });

  it('labels week 2 as the awkward stage while the beard grows in, week 8 as full shape when done', () => {
    expect(growthAt(target, shaved, 14).labelKey).toBe('render.timeline.awkward');
    const shortLook = { zones: zonesAll(8) };
    expect(growthAt(shortLook, shaved, 56).labelKey).toBe('render.timeline.fullShape');
    expect(growthAt(target, shaved, 56).labelKey).toBe('render.timeline.week8');
    expect(growthAt(target, shaved, 0).labelKey).toBe('render.timeline.today');
    expect(growthAt(target, shaved, 84).labelKey).toBe('render.timeline.week12');
  });

  it('treats negative or missing days as today and works without a profile', () => {
    const g = growthAt(target, null, -5);
    expect(g.days).toBe(0);
    for (const z of ZONES) expect(g.lengths[z]).toBe(0);
    const g2 = growthAt(target, null, Number.NaN);
    expect(g2.days).toBe(0);
  });

  it('weak zones look patchy at first and fill in as the hair lies over the gaps', () => {
    const zones = Object.fromEntries(ZONES.map((z) => [z, { density: 85, lengthMm: 0, confidence: 1 }]));
    zones.K_L = { density: 20, lengthMm: 0, confidence: 1 };
    const profile = profileWith(zones);
    const w2 = growthAt(target, profile, 14);
    const w12 = growthAt(target, profile, 84);
    expect(w2.coverage.K_L).toBeLessThan(w2.coverage.C - 0.3);
    expect(w12.coverage.K_L).toBeGreaterThan(w2.coverage.K_L);
    expect(w12.coverage.K_L).toBeLessThan(1);
  });
});

describe('coverage helpers', () => {
  it('densityCover trusts confirmed densities and ignores unconfirmed shaved zones', () => {
    expect(densityCover({ density: 20, lengthMm: 0, confidence: 1 })).toBeLessThan(0.45);
    expect(densityCover({ density: 20, lengthMm: 0, confidence: 0.5 })).toBe(1);
    expect(densityCover({ density: 90, lengthMm: 4, confidence: 0.9 })).toBe(1);
    expect(densityCover(null)).toBe(1);
  });

  it('coverAtLength is 0 for no hair and grows with length', () => {
    expect(coverAtLength(0.5, 0)).toBe(0);
    expect(coverAtLength(0.5, 3)).toBeCloseTo(0.5, 5);
    expect(coverAtLength(0.5, 40)).toBeCloseTo(0.8, 5);
  });

  it('zoneCoverage and currentLengths read the profile', () => {
    const profile = profileWith({ C: { density: 80, lengthMm: 6, confidence: 0.9 } });
    expect(currentLengths(profile).C).toBe(6);
    expect(currentLengths(profile).M).toBe(0);
    const cov = zoneCoverage({ C: 10, M: 0 }, profile);
    expect(cov.C).toBeGreaterThan(0.9);
    expect(cov.M).toBe(0);
  });
});
