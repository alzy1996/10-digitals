import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  autoId,
  coarseLabels,
  compactCutCard,
  diffFields,
  firestoreSafe,
  generateLookCode,
  isValidEmail,
  learnGrowthRate,
  mergeSettings,
  normalizeEmail,
  normalizeLookCode,
  normalizePhone,
  normalizeProduct,
  productKey,
  sanitizeParams,
  sanitizeSettingsPatch,
  sanitizeStylePatch,
  searchKey,
  styleData,
} from '../../src/services/model.js';
import { auditOp, statsDeltaData } from '../../src/services/ops.js';
import { DEFAULT_GUARD_CHART } from '../../src/lib/guards.js';
import { LIMITS } from '../../src/config/app.js';

describe('search key', () => {
  it('treats Arabic letter variants, diacritics and tatweel as the same name', () => {
    expect(searchKey('أحمد')).toBe(searchKey('احمد'));
    expect(searchKey('إبراهيم')).toBe(searchKey('ابراهيم'));
    expect(searchKey('فاطمة')).toBe(searchKey('فاطمه'));
    expect(searchKey('مصطفى')).toBe(searchKey('مصطفي'));
    expect(searchKey('مُحَمَّد')).toBe(searchKey('محمد'));
    expect(searchKey('محـــمد')).toBe(searchKey('محمد'));
  });

  it('lower-cases Latin names, collapses spaces and maps Arabic digits', () => {
    expect(searchKey('  Salim   NASSER ')).toBe('salim nasser');
    expect(searchKey('علي ٢')).toBe('علي 2');
  });
});

describe('email, phone, codes, ids', () => {
  it('normalizes and validates email', () => {
    expect(normalizeEmail('  New.Barber@Lihya.TEST ')).toBe('new.barber@lihya.test');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });

  it('normalizes Omani and international phones', () => {
    expect(normalizePhone('9123 4567')).toEqual({ value: '+96891234567', valid: true });
    expect(normalizePhone('+968 9123 4567')).toEqual({ value: '+96891234567', valid: true });
    expect(normalizePhone('٩١٢٣٤٥٦٧')).toEqual({ value: '+96891234567', valid: true });
    expect(normalizePhone('+44 7700 900123')).toEqual({ value: '+447700900123', valid: true });
    expect(normalizePhone('')).toEqual({ value: null, valid: true });
    expect(normalizePhone('12ab')).toEqual({ value: null, valid: false });
  });

  it('makes Look Codes from the alphabet without 0, O, 1, I', () => {
    const re = new RegExp(`^[${LIMITS.lookCodeAlphabet}]{6}$`);
    const codes = new Set();
    for (let i = 0; i < 500; i += 1) {
      const c = generateLookCode();
      expect(c).toMatch(re);
      expect(c).not.toMatch(/[0O1I]/);
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThan(490);
  });

  it('normalizes typed Look Codes', () => {
    expect(normalizeLookCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeLookCode('OIO101')).toBeNull();
    expect(normalizeLookCode('ABC23')).toBeNull();
  });

  it('makes 20-character auto ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => autoId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});

describe('firestoreSafe and audit diffs', () => {
  it('drops undefined, nulls NaN and wraps nested arrays', () => {
    const out = firestoreSafe({ a: undefined, b: NaN, c: [1, [2, 3]], d: { e: [[4]] } });
    expect(out).toEqual({ b: null, c: [1, { list: [2, 3] }], d: { e: [{ list: [4] }] } });
  });

  it('diffs only changed keys of the patch', () => {
    const before = { aiPreview: false, aiDailyCap: 20, guardChart: [{ id: '1', mm: 3 }] };
    const after = { aiPreview: true, aiDailyCap: 20, guardChart: [{ id: '1', mm: 3 }], skip: undefined };
    expect(diffFields(before, after, 'settings.')).toEqual({ 'settings.aiPreview': [false, true] });
  });

  it('stores array before/after values without nested arrays', () => {
    const changed = diffFields({ order: ['a', 'b'] }, { order: ['b', 'a'] });
    const op = auditOp('s1', 'u1', { action: 'style.order', path: 'shops/s1/styles', changedFields: changed });
    expect(op.path).toMatch(/^shops\/s1\/audit\/[A-Za-z0-9]{20}$/);
    expect(op.data.changedFields.order).toEqual([{ list: ['a', 'b'] }, { list: ['b', 'a'] }]);
    expect(op.data.by).toBe('u1');
  });

  it('turns Timestamps into dates and sentinels into null in diffs', () => {
    const ts = { toDate: () => new Date('2026-10-25T10:00:00Z') };
    Object.setPrototypeOf(ts, { constructor: function Timestamp() {} });
    const d = diffFields({ at: ts }, { at: new Date('2026-10-26T10:00:00Z') });
    expect(d.at[0]).toEqual(new Date('2026-10-25T10:00:00Z'));
  });
});

describe('settings', () => {
  it('merges over the defaults and repairs a bad guard chart', () => {
    expect(mergeSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    const s = mergeSettings({ aiPreview: true, guardChart: [{ id: 'x', mm: -1 }] });
    expect(s.aiPreview).toBe(true);
    expect(s.guardChart).toBe(DEFAULT_GUARD_CHART);
    expect(s.aiDailyCap).toBe(20);
    expect(s.retentionDays).toBe(365);
    expect(s.growthMmPerDay).toBe(0.4);
    expect(s.defaultLanguage).toBe('ar');
    expect(s.tryAtHome).toBe(true);
  });

  it('clamps and validates an owner patch', () => {
    const { value, errors } = sanitizeSettingsPatch({
      aiDailyCap: 500,
      retentionDays: '90',
      growthMmPerDay: 0.456,
      whatsapp: '91234567',
      defaultLanguage: 'en',
      unknown: 1,
    });
    expect(errors).toEqual([]);
    expect(value).toEqual({ aiDailyCap: 80, retentionDays: 90, growthMmPerDay: 0.46, whatsapp: '+96891234567', defaultLanguage: 'en' });
  });

  it('rejects bad values without writing them', () => {
    const { value, errors } = sanitizeSettingsPatch({ aiPreview: 'yes', growthMmPerDay: 'x', guardChart: [{ id: 'a', mm: 5 }, { id: 'b', mm: 2 }] });
    expect(errors.sort()).toEqual(['aiPreview', 'growthMmPerDay', 'guardChart']);
    expect(value).toEqual({});
  });

  it('accepts a valid guard chart', () => {
    const { value, errors } = sanitizeSettingsPatch({ guardChart: DEFAULT_GUARD_CHART });
    expect(errors).toEqual([]);
    expect(value.guardChart).toHaveLength(DEFAULT_GUARD_CHART.length);
    expect(value.guardChart[0].label).toEqual(DEFAULT_GUARD_CHART[0].label);
  });
});

describe('products (prices only from the owner, OMR 3 decimals)', () => {
  it('normalizes a CSV row', () => {
    const { value, errors } = normalizeProduct({ name: ' Beard oil ', nameAr: 'زيت لحية', category: 'Oil', priceOmr: '3.5 OMR', active: 'true' });
    expect(errors).toEqual([]);
    expect(value).toEqual({ name: 'Beard oil', nameAr: 'زيت لحية', category: 'oil', priceOmr: 3.5, active: true });
  });

  it('rounds to 3 decimals and reads Arabic digits', () => {
    expect(normalizeProduct({ name: 'A', category: 'dye', priceOmr: 1.23456 }).value.priceOmr).toBe(1.235);
    expect(normalizeProduct({ name: 'A', category: 'dye', priceOmr: '١٫٥٠٠ ر.ع.' }).value.priceOmr).toBe(1.5);
  });

  it('rejects missing names, unknown categories and ambiguous or negative prices', () => {
    expect(normalizeProduct({ name: '', category: 'oil', priceOmr: 1 }).errors).toEqual(['name']);
    expect(normalizeProduct({ name: 'A', category: 'food', priceOmr: 1 }).errors).toEqual(['category']);
    expect(normalizeProduct({ name: 'A', category: 'oil', priceOmr: '1,500' }).errors).toEqual(['priceOmr']);
    expect(normalizeProduct({ name: 'A', category: 'oil', priceOmr: -2 }).errors).toEqual(['priceOmr']);
  });

  it('validates only present keys on update', () => {
    expect(normalizeProduct({ priceOmr: 2 }, { partial: true })).toEqual({ value: { priceOmr: 2 }, errors: [] });
  });

  it('matches re-imported rows by name and category', () => {
    expect(productKey({ name: 'Beard  Oil', category: 'oil' })).toBe(productKey({ name: 'beard oil', category: 'oil' }));
  });
});

describe('what a consultation stores', () => {
  it('keeps the designed look and drops unknown nested data', () => {
    const p = sanitizeParams({
      styleId: 'goatee',
      zones: { C: 15.04, S: 400, X: 3 },
      lines: { cheek: 'low', cheekOffset: 0.2 },
      fadeStartMm: '2',
      finish: 'oiled',
      landmarks: [{ x: 1 }],
      shape: { chin: 'round', fadeB: [2, 6] },
    });
    expect(p.zones).toEqual({ C: 15, S: 300 });
    expect(p.lines.cheek).toBe('low');
    expect(p.lines.neckline).toBeNull();
    expect(p.fadeStartMm).toBe(2);
    expect(p.landmarks).toBeUndefined();
    expect(p.shape).toEqual({ chin: 'round', fadeB: [2, 6] });
  });

  it('summarizes a full Cut Card into the stored shape', () => {
    const card = {
      rows: [
        { zone: 'C', mm: 15, guard: { kind: 'guard', guardId: '4', label: {}, mm: 13 }, note: '' },
        { zone: 'K_L', mm: 0, guard: { kind: 'shave', guardId: null }, note: 'clean' },
        { zone: 'M', mm: 30, guard: { kind: 'scissor', guardId: null }, note: { key: 'cutcard.scissorKeep' } },
      ],
      cheekLine: { type: 'low', mmAboveJaw: 22 },
      neckline: { type: '2f', fingers: 2, mmAboveAdamsApple: 30 },
      color: { id: 'natural', safetyFlags: ['patchTest48h'] },
    };
    expect(compactCutCard(card)).toEqual({
      zonesMm: { C: 15, K_L: 0, M: 30 },
      guards: { C: '4', K_L: 'shave', M: 'scissor' },
      cheekLineMm: 22,
      necklineMm: 30,
      notes: { K_L: 'clean', M: 'cutcard.scissorKeep' },
      safetyFlags: ['patchTest48h'],
    });
    expect(compactCutCard(null)).toBeNull();
  });

  it('keeps client profiles to labels only', () => {
    const labels = coarseLabels({
      faceShape: { top: 'square', scores: { square: 0.8 }, measures: { jawRatio: 0.9 } },
      skin: { mst: 6.4, undertone: 'olive', lab: [50, 10, 20] },
      ageBand: { band: '25-34' },
      beard: { growability: 71.6 },
    });
    expect(labels).toEqual({ faceShape: 'square', mst: 6, undertone: 'olive', ageBand: '25-34', growability: 72 });
    expect(coarseLabels({ faceShape: 'blob', mst: 40 })).toEqual({ faceShape: null, mst: 10, undertone: null, ageBand: null, growability: null });
  });
});

describe('styles', () => {
  it('writes a catalog style with explicit hidden/signature flags', () => {
    const d = styleData({ id: 'goatee', zones: { C: 15 }, order: 90, createdAt: 'x' });
    expect(d).toMatchObject({ id: 'goatee', hidden: false, signature: false, order: 90 });
    expect(d.createdAt).toBeUndefined();
  });

  it('never lets a patch change the id or signature flag', () => {
    expect(sanitizeStylePatch({ id: 'x', signature: true, hidden: 1, localFit: 9, order: '20' })).toEqual({ hidden: false, localFit: 5, order: 20 });
  });
});

describe('learned growth rate', () => {
  const day = 24 * 60 * 60 * 1000;
  const t0 = new Date('2026-10-01T08:00:00Z');

  it('learns mm per day from the last cut and today\'s measure', () => {
    const prev = { zonesMm: { C: 5, K_L: 3, M: 6 }, at: t0 };
    const rate = learnGrowthRate(prev, { C: 9, K_L: 7, M: 10 }, new Date(t0.getTime() + 10 * day), null);
    expect(rate).toBe(0.4);
  });

  it('blends with the previous value and ignores too-short gaps', () => {
    const prev = { zonesMm: { C: 5 }, at: t0 };
    expect(learnGrowthRate(prev, { C: 11 }, new Date(t0.getTime() + 10 * day), 0.4)).toBe(0.5);
    expect(learnGrowthRate(prev, { C: 6 }, new Date(t0.getTime() + 1 * day), 0.4)).toBe(0.4);
    expect(learnGrowthRate(null, { C: 6 }, new Date(), 0.3)).toBe(0.3);
  });
});

describe('stats deltas', () => {
  it('builds increments only for non-zero deltas', () => {
    expect(statsDeltaData({ consultations: 0, topStyles: {} }, 'u')).toBeNull();
    const d = statsDeltaData({ approvals: 1, totalDecisionSeconds: 80.4, topStyles: { goatee: 1, x: 0 } }, 'u');
    expect(Object.keys(d).sort()).toEqual(['approvals', 'topStyles', 'totalDecisionSeconds', 'updatedAt', 'updatedBy']);
    expect(Object.keys(d.topStyles)).toEqual(['goatee']);
    expect(d.updatedBy).toBe('u');
  });
});
