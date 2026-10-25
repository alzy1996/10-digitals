import { describe, expect, it } from 'vitest';
import {
  buildCutCard,
  cheekLineHeight,
  necklinePosition,
  colorSafety,
  growthRateFromVisits,
  suggestNextVisitDays,
  nextVisitDate,
  effectiveGrowth,
  cutCardZonesMm,
  CHEEK_DEFAULT_MM,
  CHEEK_LIMIT_MM,
} from '../../src/lib/cutcard.js';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import { DEFAULT_GUARD_CHART } from '../../src/lib/guards.js';
import STYLES from '../../src/data/styles.json';
import COLORS from '../../src/data/colors.json';

const style = (id) => STYLES.find((s) => s.id === id);
const paramsOf = (s, extra = {}) => ({
  styleId: s.id,
  zones: { ...s.zones },
  lines: { ...s.lines, cheekOffset: 0, necklineOffset: 0 },
  mustacheId: s.mustacheId,
  fadeStartMm: null,
  colorId: 'natural',
  greyTarget: null,
  finish: 'matte',
  shape: { ...s.shape },
  ...extra,
});
const row = (card, zone) => card.rows.find((r) => r.zone === zone);

// Canonical face (cm) projected into an un-mirrored 1000 x 1000 frame at 25 px per cm:
// subject's left (+x) lands on the image's right, y flips to image-down.
const PX_PER_CM = 25;
const SYNTH = {
  width: 1000,
  height: 1000,
  landmarks: Array.from({ length: 468 }, (_, i) => ({
    x: 0.5 + (CANONICAL_VERTICES[3 * i] * PX_PER_CM) / 1000,
    y: 0.45 - (CANONICAL_VERTICES[3 * i + 1] * PX_PER_CM) / 1000,
    z: 0,
  })),
};
const SYNTH_MM_PER_PX = 10 / PX_PER_CM;

describe('rows and guards', () => {
  it('maps lengths to guards at the edges of the chart (0, 1.4, 1.5, 25, 26 mm)', () => {
    const zones = { M: 0, S: 1.4, C: 1.5, J_L: 25, J_R: 26, K_L: 0.2, K_R: 3, B_L: 6, B_R: 4.5, N: 0 };
    const card = buildCutCard({ params: { styleId: 'x', zones, lines: {} }, guardChart: DEFAULT_GUARD_CHART });
    expect(card.rows.map((r) => r.zone)).toEqual(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);
    expect(row(card, 'M').guard.kind).toBe('shave');
    expect(row(card, 'M').note.key).toBe('report.note.shave');
    expect(row(card, 'K_L').guard.kind).toBe('shave');
    expect(row(card, 'S').guard.guardId).toBe('0.5');
    expect(row(card, 'C').guard.guardId).toBe('0.5');
    expect(row(card, 'J_L').guard).toMatchObject({ kind: 'guard', guardId: '8', mm: 25 });
    expect(row(card, 'J_R').guard.kind).toBe('scissor');
    expect(row(card, 'J_R').note).toEqual({ key: 'report.note.scissor', vars: { mm: 26 } });
    expect(row(card, 'K_R').guard.guardId).toBe('1');
    expect(row(card, 'B_L').guard.guardId).toBe('2');
    expect(card.shavedZones).toEqual(['M', 'K_L', 'N']);
  });

  it('uses the shop guard chart', () => {
    const chart = [
      { id: 'a', label: { en: 'A', ar: 'A' }, mm: 2 },
      { id: 'b', label: { en: 'B', ar: 'B' }, mm: 9 },
    ];
    const card = buildCutCard({ params: { zones: { C: 8, M: 12 } }, guardChart: chart });
    expect(row(card, 'C').guard.guardId).toBe('b');
    expect(row(card, 'M').guard.kind).toBe('scissor');
    expect(row(card, 'M').note.vars.mm).toBe(12);
  });

  it('writes "scissor, keep X mm" for every zone over 25 mm', () => {
    const s = style('full-long');
    const card = buildCutCard({ params: paramsOf(s), style: s });
    for (const r of card.rows) {
      expect(r.guard.kind).toBe('scissor');
      expect(r.note).toEqual({ key: 'report.note.scissor', vars: { mm: 60 } });
    }
  });

  it('notes the sideburn fade and the fade start', () => {
    const s = style('beard-fade');
    const card = buildCutCard({ params: paramsOf(s), style: s });
    expect(row(card, 'B_L').note).toEqual({ key: 'report.note.fade', vars: { from: 0, to: 10 } });
    expect(row(card, 'B_R').note.key).toBe('report.note.fade');
    expect(card.sideburn).toEqual({ join: 'skin-fade', fadeStartMm: 0, fadeEndMm: 10 });
    const later = buildCutCard({ params: paramsOf(s, { fadeStartMm: 3 }), style: s });
    expect(later.sideburn.fadeStartMm).toBe(3);
    expect(row(later, 'B_L').note.vars).toEqual({ from: 3, to: 10 });
  });

  it('asks to keep a zone natural when his beard is still shorter than the target', () => {
    const s = style('full-medium');
    const profile = { beard: { zones: { C: { density: 80, lengthMm: 12, confidence: 1 }, K_L: { density: 60, lengthMm: 31, confidence: 1 } } } };
    const card = buildCutCard({ params: paramsOf(s), style: s, profile });
    expect(row(card, 'C').note).toEqual({ key: 'report.note.keepNatural', vars: { mm: 30, now: 12 } });
    expect(row(card, 'K_L').note).toEqual({ key: 'report.note.scissor', vars: { mm: 30 } });
    expect(row(card, 'C').currentMm).toBe(12);
    const c = style('corporate');
    const short = buildCutCard({ params: paramsOf(c), style: c, profile: { beard: { zones: { K_R: { lengthMm: 15.5 } } } } });
    expect(row(short, 'K_R').note).toBe(null);
  });

  it('carries the mustache, chin shape, finish, trim interval and the approx flag', () => {
    const s = style('van-dyke');
    const card = buildCutCard({ params: paramsOf(s, { finish: 'waxed', shape: { ...s.shape, chin: 'pointed' } }), style: s });
    expect(row(card, 'M').note).toEqual({ key: 'report.note.mustache', vars: { id: 'natural-short' } });
    expect(row(card, 'C').note).toEqual({ key: 'report.note.chin', vars: { shape: 'pointed' } });
    expect(card.mustacheEdge).toBe('at');
    expect(card.mustache).toEqual({ id: 'natural-short', mm: 10, edge: 'at' });
    expect(card.finish).toBe('waxed');
    expect(card.trimDays).toBe(7);
    expect(card.approx).toBe(true);
    expect(card.styleId).toBe('van-dyke');
    expect(cutCardZonesMm(card)).toEqual(s.zones);
  });
});

describe('cheek line', () => {
  const TYPES = ['natural', 'low', 'medium', 'high', 'curved', 'straight'];
  const measure = (type, offset = 0, front = SYNTH, mmPerPx = SYNTH_MM_PER_PX) => cheekLineHeight({ type, offset, front, mmPerPx });

  it('uses the documented defaults without a front shot', () => {
    for (const type of TYPES) expect(cheekLineHeight({ type })).toEqual({ mm: CHEEK_DEFAULT_MM[type], source: 'default' });
    expect(cheekLineHeight({ type: 'unknown-line' }).mm).toBe(CHEEK_DEFAULT_MM.natural);
    expect(CHEEK_DEFAULT_MM.low).toBeLessThan(CHEEK_DEFAULT_MM.natural);
    expect(CHEEK_DEFAULT_MM.high).toBeGreaterThan(CHEEK_DEFAULT_MM.natural);
  });

  it('moves the default toward the HIGH (+1) or LOW (-1) limit line like the renderer', () => {
    for (const type of TYPES) {
      expect(cheekLineHeight({ type, offset: 1 }).mm).toBe(CHEEK_LIMIT_MM.high);
      expect(cheekLineHeight({ type, offset: -1 }).mm).toBe(CHEEK_LIMIT_MM.low);
      expect(cheekLineHeight({ type, offset: 5 }).mm).toBe(CHEEK_LIMIT_MM.high);
    }
    const n = CHEEK_DEFAULT_MM.natural;
    expect(cheekLineHeight({ type: 'natural', offset: 0.5 }).mm).toBe(Math.round(n + 0.5 * (CHEEK_LIMIT_MM.high - n)));
    expect(cheekLineHeight({ type: 'natural', offset: -0.5 }).mm).toBe(Math.round(n - 0.5 * (n - CHEEK_LIMIT_MM.low)));
  });

  it('measures on the face from the front shot landmarks and the iris scale', () => {
    const nat = measure('natural');
    expect(nat.source).toBe('measured');
    expect(nat.mm).toBeGreaterThan(20);
    expect(nat.mm).toBeLessThan(80);
    const low = measure('natural', -1).mm;
    const high = measure('natural', 1).mm;
    for (const type of TYPES) {
      // every type blends into the same LOW / HIGH limit lines at the ends of the offset
      expect(Math.abs(measure(type, -1).mm - low)).toBeLessThanOrEqual(1);
      expect(Math.abs(measure(type, 1).mm - high)).toBeLessThanOrEqual(1);
      const steps = [-1, -0.5, 0, 0.5, 1].map((o) => measure(type, o).mm);
      for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
      expect(measure(type).mm).toBeGreaterThan(low);
      expect(measure(type).mm).toBeLessThan(high);
    }
    expect(measure('low').mm).toBeLessThan(measure('medium').mm);
    expect(measure('medium').mm).toBeLessThan(measure('high').mm);
    expect(measure('curved').mm).toBeGreaterThan(measure('straight').mm);
    // twice the scale, twice the millimetres
    expect(Math.abs(measure('natural', 0, SYNTH, SYNTH_MM_PER_PX * 2).mm - nat.mm * 2)).toBeLessThanOrEqual(1);
  });

  it('follows the renderer offset: +0.3 moves the line 30 % of the way to the HIGH line', () => {
    const nat = measure('natural').mm;
    const high = measure('natural', 1).mm;
    const low = measure('natural', -1).mm;
    expect(Math.abs(measure('natural', 0.3).mm - (nat + 0.3 * (high - nat)))).toBeLessThanOrEqual(1);
    expect(Math.abs(measure('natural', -0.4).mm - (nat - 0.4 * (nat - low)))).toBeLessThanOrEqual(1);
  });

  it('keeps the documented defaults in step with the line construction', () => {
    // each type sits at the same relative height between the LOW and HIGH lines on the
    // canonical face as its default does between CHEEK_LIMIT_MM.low and .high
    const low = measure('natural', -1).mm;
    const high = measure('natural', 1).mm;
    for (const type of TYPES) {
      const rel = (measure(type).mm - low) / (high - low);
      const relDefault = (CHEEK_DEFAULT_MM[type] - CHEEK_LIMIT_MM.low) / (CHEEK_LIMIT_MM.high - CHEEK_LIMIT_MM.low);
      expect(Math.abs(rel - relDefault)).toBeLessThan(0.06);
    }
  });

  it('measures along the face, so a tilted head reads the same', () => {
    const a = (15 * Math.PI) / 180;
    const cx = 0.5;
    const cy = 0.5;
    const tilted = {
      ...SYNTH,
      landmarks: SYNTH.landmarks.map((l) => ({
        x: cx + (l.x - cx) * Math.cos(a) - (l.y - cy) * Math.sin(a),
        y: cy + (l.x - cx) * Math.sin(a) + (l.y - cy) * Math.cos(a),
        z: 0,
      })),
    };
    for (const type of ['natural', 'curved']) {
      expect(Math.abs(measure(type, 0, tilted).mm - measure(type).mm)).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to defaults when the scale or the landmarks are missing', () => {
    expect(cheekLineHeight({ type: 'natural', front: SYNTH, mmPerPx: null }).source).toBe('default');
    expect(cheekLineHeight({ type: 'natural', front: { width: 10, height: 10, landmarks: [] }, mmPerPx: 0.5 }).source).toBe('default');
  });

  it('is part of the card, measured when the front shot and profile scale are given', () => {
    const s = style('corporate');
    const card = buildCutCard({ params: paramsOf(s), style: s, profile: { scale: { mmPerPx: SYNTH_MM_PER_PX } }, front: SYNTH });
    expect(card.cheekLine.type).toBe('natural');
    expect(card.cheekLine.source).toBe('measured');
    expect(card.cheekLine.mmAboveJaw).toBe(measure('natural').mm);
    const raised = buildCutCard({ params: paramsOf(s, { lines: { ...s.lines, cheekOffset: 0.5 } }), style: s });
    expect(raised.cheekLine).toMatchObject({ source: 'default', offset: 0.5, mmAboveJaw: cheekLineHeight({ type: 'natural', offset: 0.5 }).mm });
  });
});

describe('neckline', () => {
  it('turns fingers into millimetres above the Adam\'s apple', () => {
    expect(necklinePosition('1f')).toEqual({ type: '1f', fingers: 1, mmAboveAdamsApple: 15, followsJaw: false, squared: false });
    expect(necklinePosition('2f')).toMatchObject({ fingers: 2, mmAboveAdamsApple: 30 });
    expect(necklinePosition('squared')).toMatchObject({ fingers: 2, mmAboveAdamsApple: 30, squared: true });
    expect(necklinePosition('jaw')).toEqual({ type: 'jaw', fingers: null, mmAboveAdamsApple: null, followsJaw: true, squared: false });
  });

  it('applies the neckline offset', () => {
    expect(necklinePosition('2f', 0.5).mmAboveAdamsApple).toBe(35);
    expect(necklinePosition('2f', -1).mmAboveAdamsApple).toBe(20);
    expect(necklinePosition('1f', 1).mmAboveAdamsApple).toBe(25);
    expect(necklinePosition('1f', -1).mmAboveAdamsApple).toBe(5);
  });

  it('is part of the card', () => {
    const s = style('sunnah');
    const card = buildCutCard({ params: paramsOf(s), style: s });
    expect(card.neckline).toMatchObject({ type: '1f', fingers: 1, mmAboveAdamsApple: 15 });
  });
});

describe('color safety flags', () => {
  it('has no flags for natural color or salt and pepper', () => {
    expect(colorSafety('natural', null).safetyFlags).toEqual([]);
    expect(colorSafety('natural', null).questions).toEqual([]);
    expect(colorSafety('salt-pepper', null).safetyFlags).toEqual([]);
    const card = buildCutCard({ params: { zones: { C: 10 }, colorId: 'natural' } });
    expect(card.color.safetyFlags).toEqual([]);
    expect(card.color.blocked).toBe(false);
  });

  it('asks every question for an oxidative dye and flags the unanswered patch test and metallic salts', () => {
    const c = colorSafety('jet-black', {});
    expect(c.chemical).toBe(true);
    expect(c.questions.map((q) => q.id)).toEqual(['patchTest48h', 'metallicSaltProducts', 'pureHenna', 'irritationToday']);
    expect(c.safetyFlags).toEqual(['patchTest48h', 'metallicSaltProducts']);
    expect(c.questions.every((q) => q.level === 'ask')).toBe(true);
    expect(c.blocked).toBe(false);
  });

  it('clears the flags when the answers are safe', () => {
    const c = colorSafety('dark-brown', { patchTest48h: true, metallicSaltProducts: 'no', pureHenna: false, irritationToday: false });
    expect(c.safetyFlags).toEqual([]);
    expect(c.questions.map((q) => q.level)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('stops chemical color on a risky answer, including "not sure" about metallic salts', () => {
    expect(colorSafety('jet-black', { patchTest48h: false, metallicSaltProducts: 'no', pureHenna: false, irritationToday: false })).toMatchObject({
      safetyFlags: ['patchTest48h'],
      blocked: true,
    });
    const unsure = colorSafety('grey-blend', { patchTest48h: true, metallicSaltProducts: 'unsure', pureHenna: false, irritationToday: false });
    expect(unsure.safetyFlags).toEqual(['metallicSaltProducts']);
    expect(unsure.questions.find((q) => q.id === 'metallicSaltProducts')).toMatchObject({ answer: 'unsure', level: 'stop' });
    expect(colorSafety('blonde', { patchTest48h: true, metallicSaltProducts: 'no', pureHenna: true, irritationToday: false }).safetyFlags).toEqual([
      'pureHenna',
    ]);
  });

  it('asks only the questions that apply to henna and temporary color', () => {
    expect(colorSafety('henna', {}).questions.map((q) => q.id)).toEqual(['metallicSaltProducts', 'irritationToday']);
    expect(colorSafety('henna-katam', { metallicSaltProducts: 'yes', irritationToday: false }).safetyFlags).toEqual(['metallicSaltProducts']);
    expect(colorSafety('temp-color', { irritationToday: true })).toMatchObject({ safetyFlags: ['irritationToday'], blocked: true });
  });

  it('reads the colors list it is given and keeps the grey target', () => {
    const custom = [...COLORS, { id: 'shop-dye', type: 'permanent', chemical: true }];
    expect(colorSafety('shop-dye', {}, custom).questions).toHaveLength(4);
    expect(colorSafety('shop-dye', {}, custom).safetyFlags).toEqual(['patchTest48h', 'metallicSaltProducts']);
    const card = buildCutCard({ params: { zones: { C: 10 }, colorId: 'grey-blend', greyTarget: 50 }, safety: { patchTest48h: true } });
    expect(card.color.id).toBe('grey-blend');
    expect(card.color.greyTarget).toBe(50);
    expect(card.color.safetyFlags).toEqual(['metallicSaltProducts']);
    expect(card.color.questions.map((q) => q.level)).toEqual(['ok', 'ask', 'ask', 'ask']);
  });
});

describe('growth and next visit', () => {
  it('learns the growth rate from two measured visits (PRD 4.7)', () => {
    const prev = { zonesMm: { C: 10, K_L: 5, K_R: 5, M: 0 }, at: '2026-10-01T10:00:00+04:00' };
    const curr = { zonesMm: { C: 14, K_L: 9, K_R: 10, M: 0 }, at: '2026-10-11T10:00:00+04:00' };
    expect(growthRateFromVisits(prev, curr)).toBe(0.4);
  });

  it('clamps and refuses what it cannot learn', () => {
    const at0 = new Date('2026-09-01T08:00:00Z');
    const at10 = new Date('2026-09-11T08:00:00Z');
    expect(growthRateFromVisits({ zonesMm: { C: 0 }, at: at0 }, { zonesMm: { C: 40 }, at: at10 })).toBe(1.5);
    expect(growthRateFromVisits({ zonesMm: { C: 10 }, at: at0 }, { zonesMm: { C: 10.2 }, at: at10 })).toBe(0.1);
    expect(growthRateFromVisits({ zonesMm: { C: 10 }, at: at0 }, { zonesMm: { C: 12 }, at: new Date('2026-09-02T08:00:00Z') })).toBe(null);
    expect(growthRateFromVisits({ zonesMm: { C: 10 }, at: at0 }, { zonesMm: { C: 8 }, at: at10 })).toBe(null);
    expect(growthRateFromVisits(null, { zonesMm: { C: 8 }, at: at10 })).toBe(null);
    expect(growthRateFromVisits({ zonesMm: { C: 1 }, at: at0 }, { zonesMm: { C: 30 }, at: new Date('2027-03-01T08:00:00Z') })).toBe(null);
  });

  it('suggests the next visit from the shortest kept zone and the growth rate', () => {
    expect(suggestNextVisitDays(style('full-medium').zones, 0.4)).toBe(19);
    expect(suggestNextVisitDays(style('full-medium').zones, 0.8)).toBe(9);
    expect(suggestNextVisitDays(style('clean-shave').zones, 0.4)).toBe(7);
    expect(suggestNextVisitDays(style('bandholz').zones, 0.4)).toBe(42);
    expect(effectiveGrowth(null)).toBe(0.4);
    expect(effectiveGrowth(9)).toBe(2);
    expect(effectiveGrowth(0.05)).toBe(0.05);
    expect(effectiveGrowth(-1)).toBe(0.4);
  });

  it('dates the next visit on the Muscat calendar', () => {
    const { date, dayKey } = nextVisitDate(14, new Date('2026-10-25T21:00:00Z'));
    expect(dayKey).toBe('2026-11-09');
    expect(date.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    const s = style('full-medium');
    const card = buildCutCard({ params: paramsOf(s), style: s, growthMmPerDay: 0.4, now: new Date('2026-10-25T06:00:00Z') });
    expect(card.nextVisitDays).toBe(19);
    expect(card.nextVisitDayKey).toBe('2026-11-13');
    expect(card.growthMmPerDay).toBe(0.4);
  });
});
