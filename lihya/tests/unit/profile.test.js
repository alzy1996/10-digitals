// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  applyOverrides,
  toCoarseProfile,
  analyzeShots,
  STEP_KEYS,
  ZONE_CONFIRM_DENSITY,
} from '../../src/ai/analysis/profile.js';
import { beardColor, nearestShade, naturalShades, FALLBACK_COLOR_ID, MIN_HAIR_SAMPLES } from '../../src/ai/analysis/beardColor.js';
import { growabilityOf } from '../../src/ai/analysis/beardDensity.js';
import { hexToLab } from '../../src/ai/analysis/color.js';
import { ZONE_IDS } from '../../src/ai/mesh/zones.js';

/** A FaceProfile shaped exactly like PRD 5.8. */
function sampleProfile() {
  const zones = Object.fromEntries(ZONE_IDS.map((z) => [z, { density: 50, lengthMm: 3, confidence: 0.5 }]));
  zones.M = { density: 82, lengthMm: 4, confidence: 0.9 };
  zones.C = { density: 77, lengthMm: 5, confidence: 0.85 };
  return {
    version: 1,
    capturedAt: '2026-10-25T09:12:00+04:00',
    scale: { mmPerPx: 0.081, source: 'iris', confidence: 0.9 },
    faceShape: {
      top: 'oval',
      scores: { oval: 0.72, round: 0.21, square: 0.04, oblong: 0.02, heart: 0.01, diamond: 0, triangle: 0 },
      jawAngleDeg: 131,
      measures: { faceLengthMm: 190, foreheadWidthMm: 125, cheekboneWidthMm: 140, jawWidthMm: 118 },
    },
    skin: { ita: 21.3, mst: 5, undertone: 'warm', confidence: 0.8, lab: [58, 12, 21] },
    ageBand: { band: '25-34', source: 'model', confidence: 0.66 },
    beard: { zones, growability: 60, greyRatio: 12, colorId: 'natural-black', colorLab: [20, 2, 3] },
    calibration: { whiteCard: true, gains: [1.04, 1.0, 0.93] },
    overrides: { faceShape: null, undertone: null, ageBand: null },
  };
}

describe('applyOverrides', () => {
  it('applies the barber\'s corrections without changing the input', () => {
    const p = sampleProfile();
    const before = JSON.stringify(p);
    const out = applyOverrides(p, { faceShape: 'square', undertone: 'olive', ageBand: '35-44', mst: 7 });
    expect(JSON.stringify(p)).toBe(before);
    expect(out.faceShape.top).toBe('square');
    expect(out.faceShape.scores).toEqual(p.faceShape.scores);
    expect(out.skin.undertone).toBe('olive');
    expect(out.skin.mst).toBe(7);
    expect(out.ageBand).toEqual({ band: '35-44', source: 'model', confidence: 1 });
    expect(out.overrides).toEqual({ faceShape: 'square', undertone: 'olive', ageBand: '35-44' });
  });

  it('turns zone confirmations into densities and recomputes grow-ability', () => {
    const p = sampleProfile();
    const out = applyOverrides(p, { zones: { K_L: 'none', K_R: 'dense', J_L: 'patchy', J_R: 'medium', bogus: 'dense', C: 'unknown' } });
    expect(out.beard.zones.K_L).toEqual({ density: ZONE_CONFIRM_DENSITY.none, lengthMm: 0, confidence: 1 });
    expect(out.beard.zones.K_R.density).toBe(ZONE_CONFIRM_DENSITY.dense);
    expect(out.beard.zones.J_L.density).toBe(ZONE_CONFIRM_DENSITY.patchy);
    expect(out.beard.zones.J_R.density).toBe(ZONE_CONFIRM_DENSITY.medium);
    expect(out.beard.zones.C).toEqual(p.beard.zones.C);
    expect(out.beard.zones.bogus).toBeUndefined();
    expect(out.beard.growability).toBe(growabilityOf(out.beard.zones));
  });

  it('ignores empty overrides and a missing profile', () => {
    const p = sampleProfile();
    expect(applyOverrides(p, {})).toEqual(p);
    expect(applyOverrides(p, null)).toEqual(p);
    expect(applyOverrides(null, { faceShape: 'round' })).toBeNull();
  });

  it('clamps an MST override to 1..10', () => {
    expect(applyOverrides(sampleProfile(), { mst: 14 }).skin.mst).toBe(10);
    expect(applyOverrides(sampleProfile(), { mst: '3' }).skin.mst).toBe(3);
  });
});

describe('toCoarseProfile (what may be saved, PRD 5.8)', () => {
  it('keeps labels only', () => {
    const coarse = toCoarseProfile(applyOverrides(sampleProfile(), { faceShape: 'round' }));
    expect(coarse).toEqual({ faceShape: 'round', mst: 5, undertone: 'warm', ageBand: '25-34', growability: 60 });
    const json = JSON.stringify(coarse);
    for (const banned of ['lab', 'measures', 'gains', 'mmPerPx', 'colorLab', 'scores']) expect(json).not.toContain(banned);
  });

  it('handles a missing profile and a missing age band', () => {
    expect(toCoarseProfile(null)).toEqual({ faceShape: null, mst: null, undertone: null, ageBand: null, growability: null });
    const p = sampleProfile();
    p.ageBand = { band: null, source: 'none', confidence: 0 };
    expect(toCoarseProfile(p).ageBand).toBeNull();
  });
});

describe('beard colour', () => {
  const colors = [
    { id: 'natural', type: 'none' },
    { id: 'jet-black', hex: '#0b0b0d', type: 'permanent' },
    { id: 'natural-black', hex: '#1f1a17', type: 'permanent' },
    { id: 'dark-brown', hex: '#3b2a20', type: 'permanent' },
    { id: 'light-brown', hex: '#8a6748', type: 'permanent' },
    { id: 'blonde', hex: '#c9a66b', type: 'permanent' },
    { id: 'henna', hex: '#b5481f', type: 'vegetable' },
  ];

  it('matches natural shades only', () => {
    expect(naturalShades(colors).map((c) => c.id)).toEqual(['jet-black', 'natural-black', 'dark-brown', 'light-brown', 'blonde']);
    expect(nearestShade(hexToLab('#b8471e'), colors)).not.toBe('henna');
    expect(nearestShade(hexToLab('#8c694a'), colors)).toBe('light-brown');
  });

  it('uses the median of the beard samples, then scalp hair, then the fallback', () => {
    const brown = Array.from({ length: MIN_HAIR_SAMPLES }, () => hexToLab('#3c2b21'));
    expect(beardColor(brown, [], colors)).toMatchObject({ colorId: 'dark-brown', source: 'beard' });
    const blond = Array.from({ length: MIN_HAIR_SAMPLES }, () => hexToLab('#c8a56a'));
    expect(beardColor(brown.slice(0, 5), blond, colors)).toMatchObject({ colorId: 'blonde', source: 'scalp' });
    const none = beardColor([], [], colors);
    expect(none.colorId).toBe(FALLBACK_COLOR_ID);
    expect(none.source).toBe('default');
    expect(none.colorLab).toHaveLength(3);
    expect(beardColor([], [], []).colorId).toBe('natural-black');
  });
});

describe('analyzeShots', () => {
  it('needs a front shot', async () => {
    await expect(analyzeShots({})).rejects.toThrow(/front shot/);
    await expect(analyzeShots(null)).rejects.toThrow(/front shot/);
  });

  it('names its steps for the progress screen', () => {
    expect(STEP_KEYS).toEqual(['prepare', 'scale', 'segment', 'faceShape', 'skin', 'beard', 'color', 'age', 'done']);
  });
});
