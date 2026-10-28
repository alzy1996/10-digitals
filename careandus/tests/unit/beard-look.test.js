import { describe, it, expect } from 'vitest';
import STYLES from '../../src/data/beard/styles.json';
import {
  paramsFromStyle,
  clampParams,
  validateParams,
  applyPreset,
  scaleLength,
  setZoneLength,
  setColor,
  safetyFor,
  safetyFlags,
  lookSummary,
  filterStyles,
  matchesLength,
  matchesMaintenance,
  lengthClassOf,
  LENGTH_FILTERS,
  MAINTENANCE_FILTERS,
  LOOK_ZONES,
  PRESETS,
  checkLookParams,
  MAX_ZONE_MM,
} from '../../src/ai/beard/lib/look.js';

const style = (id) => STYLES.find((s) => s.id === id);
const ARABIC_DIGITS = /[٠-٩۰-۹]/;

describe('paramsFromStyle', () => {
  it('builds a valid look for every catalog style', () => {
    for (const s of STYLES) {
      const p = paramsFromStyle(s);
      expect(validateParams(p), s.id).toEqual([]);
      expect(p.styleId).toBe(s.id);
      expect(p.zones).toEqual(s.zones);
      expect(p.lines).toEqual({ ...s.lines, cheekOffset: 0, necklineOffset: 0 });
      expect(p.mustacheId).toBe(s.mustacheId);
      expect(p.colorId).toBe('natural');
      expect(p.finish).toBe('matte');
      expect(p.greyTarget).toBeNull();
      expect(p.shape).toEqual(s.shape);
      expect(p.shape).not.toBe(s.shape);
    }
  });

  it('sets the fade start from the faded beard and the Sunnah chin from its default', () => {
    expect(paramsFromStyle(style('beard-fade')).fadeStartMm).toBe(0);
    expect(paramsFromStyle(style('corporate')).fadeStartMm).toBeNull();
    expect(paramsFromStyle(style('sunnah')).zones.C).toBe(80);
  });

  it('keeps a longer Sunnah chin the profile measured confidently', () => {
    const profile = (mm, confidence) => ({ beard: { zones: { C: { density: 90, lengthMm: mm, confidence } } } });
    expect(paramsFromStyle(style('sunnah'), { profile: profile(110, 0.8) }).zones.C).toBe(110);
    expect(paramsFromStyle(style('sunnah'), { profile: profile(110, 0.3) }).zones.C).toBe(80);
    expect(paramsFromStyle(style('sunnah'), { profile: profile(40, 0.9) }).zones.C).toBe(80);
    expect(paramsFromStyle(style('goatee'), { profile: profile(110, 0.9) }).zones.C).toBe(15);
  });

  it('works for a style missing optional fields (older signature styles)', () => {
    const p = paramsFromStyle({ id: 'sig-x', zones: { C: 12 } });
    expect(p.zones.C).toBe(12);
    expect(p.zones.K_L).toBe(0);
    expect(validateParams(p)).toEqual([]);
  });
});

describe('clampParams and validateParams', () => {
  it('clamps lengths to 0..200 mm and offsets to -1..1 without touching the input', () => {
    const input = paramsFromStyle(style('corporate'));
    input.zones.C = 250;
    input.zones.M = -5;
    delete input.zones.N;
    input.lines.cheekOffset = 3;
    input.lines.necklineOffset = -2;
    input.greyTarget = 140;
    const snapshot = JSON.stringify(input);
    const out = clampParams(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out.zones.C).toBe(200);
    expect(out.zones.M).toBe(0);
    expect(out.zones.N).toBe(0);
    expect(out.lines.cheekOffset).toBe(1);
    expect(out.lines.necklineOffset).toBe(-1);
    expect(out.greyTarget).toBe(100);
    expect(Object.keys(out.zones)).toEqual(LOOK_ZONES);
    expect(validateParams(out)).toEqual([]);
  });

  it('reports each problem as an i18n key', () => {
    const p = paramsFromStyle(style('goatee'));
    expect(validateParams({ ...p, styleId: '' })).toContain('catalog.err.style');
    expect(validateParams({ ...p, zones: { ...p.zones, C: 300 } })).toEqual(['catalog.err.zoneRange']);
    expect(validateParams({ ...p, zones: { ...p.zones, C: 'x' } })).toEqual(['catalog.err.zones']);
    expect(validateParams({ ...p, lines: { ...p.lines, cheek: 'zigzag' } })).toEqual(['catalog.err.cheek']);
    expect(validateParams({ ...p, lines: { ...p.lines, neckline: '3f' } })).toEqual(['catalog.err.neckline']);
    expect(validateParams({ ...p, lines: { ...p.lines, cheekOffset: 2 } })).toEqual(['catalog.err.offset']);
    expect(validateParams({ ...p, mustacheId: 'nope' })).toEqual(['catalog.err.mustache']);
    expect(validateParams({ ...p, colorId: 'purple' })).toEqual(['catalog.err.color']);
    expect(validateParams({ ...p, colorId: null })).toEqual([]);
    expect(validateParams({ ...p, greyTarget: 101 })).toEqual(['catalog.err.grey']);
    expect(validateParams({ ...p, finish: 'glitter' })).toEqual(['catalog.err.finish']);
    expect(validateParams({ ...p, fadeStartMm: -1 })).toEqual(['catalog.err.fade']);
    expect(validateParams({ ...p, presetId: 'party' })).toEqual(['catalog.err.preset']);
    expect(validateParams(null)).toEqual(['catalog.err.style']);
    expect(validateParams({ ...p, lines: null })).toEqual(['catalog.err.lines']);
  });
});

describe('applyPreset (Gulf line-ups)', () => {
  it("light 'awarid caps cheeks and sideburns and lowers the cheek line", () => {
    const base = paramsFromStyle(style('corporate'));
    const p = applyPreset(base, 'light-awarid');
    expect(p.zones.K_L).toBe(3);
    expect(p.zones.K_R).toBe(3);
    expect(p.zones.B_L).toBe(3);
    expect(p.zones.C).toBe(15);
    expect(p.lines.cheek).toBe('low');
    expect(p.presetId).toBe('light-awarid');
    expect(validateParams(p)).toEqual([]);
    // never grows a shaved zone
    expect(applyPreset(paramsFromStyle(style('goatee')), 'light-awarid').zones.K_L).toBe(0);
  });

  it('Eid and wedding line-ups set razor lines and reset changed offsets', () => {
    const base = { ...paramsFromStyle(style('full-medium')) };
    base.lines = { ...base.lines, cheekOffset: 0.4, necklineOffset: 0.3 };
    const eid = applyPreset(base, 'eid-lineup');
    expect(eid.lines.edge).toBe('razor');
    expect(eid.lines.cheek).toBe('straight');
    expect(eid.lines.cheekOffset).toBe(0);
    expect(eid.lines.necklineOffset).toBe(0.3); // neckline type unchanged (2f)
    expect(eid.zones).toEqual(base.zones);
    const wedding = applyPreset(base, 'wedding-lineup');
    expect(wedding.lines.edge).toBe('razor');
    expect(wedding.finish).toBe('balm');
    expect(validateParams(wedding)).toEqual([]);
  });

  it('works on top of any style; unknown presets change nothing', () => {
    for (const s of STYLES) {
      for (const pr of PRESETS) expect(validateParams(applyPreset(paramsFromStyle(s), pr.id)), `${s.id} ${pr.id}`).toEqual([]);
    }
    const p = paramsFromStyle(style('khatt'));
    expect(applyPreset(p, 'nope')).toEqual(clampParams(p));
  });
});

describe('length controls', () => {
  it('scaleLength scales every zone, clamps at 200 mm, keeps a Sunnah-trimmed mustache', () => {
    const p = scaleLength(paramsFromStyle(style('corporate')), 2);
    expect(p.zones.C).toBe(30);
    expect(p.zones.N).toBe(0);
    expect(scaleLength(paramsFromStyle(style('viking')), 2).zones.C).toBe(200);
    const sunnah = scaleLength(paramsFromStyle(style('sunnah')), 1.5);
    expect(sunnah.zones.M).toBe(2);
    expect(sunnah.zones.C).toBe(120);
    expect(scaleLength(paramsFromStyle(style('corporate')), 0).zones.C).toBe(0);
    const half = scaleLength(paramsFromStyle(style('short-boxed')), 0.55);
    for (const z of LOOK_ZONES) expect(half.zones[z] * 2).toBe(Math.round(half.zones[z] * 2));
    expect(scaleLength(paramsFromStyle(style('goatee')), 'x')).toEqual(clampParams(paramsFromStyle(style('goatee'))));
  });

  it('setZoneLength sets one zone or both sides of a group', () => {
    const base = paramsFromStyle(style('corporate'));
    const k = setZoneLength(base, 'K', 9);
    expect(k.zones.K_L).toBe(9);
    expect(k.zones.K_R).toBe(9);
    expect(k.zones.J_L).toBe(15);
    expect(setZoneLength(base, 'C', 300).zones.C).toBe(200);
    expect(setZoneLength(base, 'J_L', 4).zones.J_R).toBe(15);
    expect(setZoneLength(base, 'Q', 4)).toEqual(clampParams(base));
    expect(base.zones.K_L).toBe(15);
  });
});

describe('color helpers', () => {
  it('grey blending starts at 50 % kept; other colors clear the grey target', () => {
    const base = paramsFromStyle(style('corporate'));
    expect(setColor(base, 'grey-blend').greyTarget).toBe(50);
    expect(setColor({ ...base, greyTarget: 75 }, 'grey-blend').greyTarget).toBe(75);
    expect(setColor({ ...base, greyTarget: 75 }, 'henna').greyTarget).toBeNull();
    expect(setColor(base, 'unknown').colorId).toBe('natural');
  });

  it('asks the safety questions before chemical color and flags risky answers', () => {
    expect(safetyFor('natural')).toEqual([]);
    expect(safetyFor('jet-black').map((q) => q.id)).toEqual(['patchTest48h', 'metallicSaltProducts', 'pureHenna', 'irritationToday']);
    expect(safetyFlags('jet-black', {})).toEqual(['patchTest48h', 'metallicSaltProducts']);
    expect(safetyFlags('jet-black', { patchTest48h: true, metallicSaltProducts: 'no', pureHenna: false, irritationToday: false })).toEqual([]);
    expect(safetyFlags('jet-black', { patchTest48h: true, metallicSaltProducts: 'unsure', pureHenna: true, irritationToday: false })).toEqual([
      'metallicSaltProducts',
      'pureHenna',
    ]);
    expect(safetyFlags('henna', { metallicSaltProducts: 'yes', irritationToday: false })).toEqual(['metallicSaltProducts']);
  });
});

describe('See all styles filters', () => {
  it('every style falls in exactly one length filter and one maintenance filter', () => {
    for (const s of STYLES) {
      expect(LENGTH_FILTERS.filter((f) => matchesLength(s, f.id)), s.id).toHaveLength(1);
      expect(MAINTENANCE_FILTERS.filter((f) => matchesMaintenance(s, f.id)), s.id).toHaveLength(1);
    }
  });

  it('filters styles and ranked lists', () => {
    const long = filterStyles(STYLES, { length: 'long' }).map((s) => s.id);
    expect(long).toEqual(expect.arrayContaining(['full-long', 'bandholz', 'viking', 'sunnah']));
    expect(long).not.toContain('corporate');
    const easy = filterStyles(STYLES, { maintenance: 'low' });
    for (const s of easy) expect(s.trimDays).toBeGreaterThanOrEqual(11);
    const ranked = STYLES.map((s) => ({ styleId: s.id, style: s }));
    // catalog order is kept (designer stubble sits higher in the Gulf-first order)
    expect(filterStyles(ranked, { length: 'stubble', maintenance: 'high' }).map((r) => r.styleId)).toEqual([
      'designer-stubble',
      'light-stubble',
      'short-stubble',
    ]);
    expect(filterStyles(STYLES, {})).toHaveLength(34);
    expect(filterStyles(STYLES, { length: 'all', maintenance: 'all' })).toHaveLength(34);
  });

  it('derives a length class when a signature style has none', () => {
    expect(lengthClassOf({ zones: { C: 30 } })).toBe('medium');
    expect(lengthClassOf({ zones: {} })).toBe('none');
    expect(lengthClassOf({ zones: { C: 120 } })).toBe('xlong');
  });
});

describe('lookSummary', () => {
  it('reads as one line in both languages with Latin digits', () => {
    const p = setColor(paramsFromStyle(style('short-boxed')), 'dark-brown');
    const en = lookSummary(p, 'en');
    expect(en).toBe('Short boxed beard · up to 14 mm · Crisp (trimmer) · Natural short · Dark brown');
    const ar = lookSummary(p, 'ar');
    expect(ar.startsWith('لحية قصيرة مربعة')).toBe(true);
    expect(ar).toContain('14 مم');
    expect(ARABIC_DIGITS.test(ar)).toBe(false);
    expect(lookSummary(paramsFromStyle(style('clean-shave')), 'en')).toBe('Clean shave · shaved');
    const sig = lookSummary({ ...paramsFromStyle(style('goatee')), styleId: 'sig-1' }, 'en', { name: { en: 'House goatee', ar: 'غوتي المحل' } });
    expect(sig.startsWith('House goatee')).toBe(true);
    expect(lookSummary(applyPreset(paramsFromStyle(style('khatt')), 'wedding-lineup'), 'en')).toContain('Balm-shaped');
  });
});

describe('checkLookParams (Look Codes anyone can write: SEC-01, code:F6)', () => {
  const boxed = () => paramsFromStyle(style('short-boxed'));

  it('passes a look made in the app unchanged', () => {
    const p = boxed();
    const { params, errors } = checkLookParams(p);
    expect(errors).toEqual([]);
    expect(params).toEqual(clampParams(p));
  });

  it('clamps lengths and drops unknown keys such as a picture', () => {
    const raw = { ...boxed(), zones: { ...boxed().zones, C: 1e9, K_L: -4 }, thumb: `data:image/jpeg;base64,${'A'.repeat(5000)}`, evil: { x: 1 } };
    const { params, errors } = checkLookParams(raw);
    expect(errors).toEqual([]);
    expect(params.zones.C).toBe(MAX_ZONE_MM);
    expect(params.zones.K_L).toBe(0);
    expect(params).not.toHaveProperty('thumb');
    expect(params).not.toHaveProperty('evil');
    expect(JSON.stringify(params).length).toBeLessThan(1000);
  });

  it('refuses unknown options and wrong types', () => {
    expect(checkLookParams({ ...boxed(), finish: {} }).errors).toContain('catalog.err.finish');
    expect(checkLookParams({ ...boxed(), lines: { ...boxed().lines, cheek: 'faded', edge: 'sharp' } }).errors).toEqual(
      expect.arrayContaining(['catalog.err.cheek', 'catalog.err.edge']),
    );
    expect(checkLookParams({ ...boxed(), colorId: 7 }).errors).toContain('catalog.err.color');
    expect(checkLookParams({ ...boxed(), mustacheId: 'walrus-xxl' }).errors).toContain('catalog.err.mustache');
    expect(checkLookParams({ ...boxed(), styleId: 'x'.repeat(81) }).errors).toContain('catalog.err.style');
    expect(checkLookParams({ ...boxed(), styleId: '<b>bold</b>' }).errors).toContain('catalog.err.style');
  });

  it('a missing or broken lines map falls back to the default lines', () => {
    const { params, errors } = checkLookParams({ ...boxed(), lines: 'oops' });
    expect(errors).toEqual([]);
    expect(params.lines.cheek).toBe('natural');
  });

  it('takes the style from the code when the params carry none', () => {
    const { styleId, ...rest } = boxed();
    expect(styleId).toBe('short-boxed');
    expect(checkLookParams(rest, 'short-boxed').params.styleId).toBe('short-boxed');
    expect(checkLookParams(rest, null).errors).toContain('catalog.err.style');
    expect(checkLookParams(null, 'goatee').errors).toEqual([]);
    expect(checkLookParams([1, 2], 'goatee').params.styleId).toBe('goatee');
  });

  it('keeps only known shape values', () => {
    const raw = { ...boxed(), shape: { chin: 'x'.repeat(5000), lengthAdjustable: 'thumb', fadeB: [5, 'nope'], flare: 'yes' } };
    const { params } = checkLookParams(raw);
    expect(params.shape).toEqual({ chin: 'natural', jFront: false, mustacheFloating: false, fadeB: null, flare: false, lengthAdjustable: null });
    const fade = checkLookParams({ ...boxed(), shape: { chin: 'round', fadeB: [0, 999], lengthAdjustable: 'C' } }).params.shape;
    expect(fade).toMatchObject({ chin: 'round', fadeB: [0, MAX_ZONE_MM], lengthAdjustable: 'C' });
  });
});
