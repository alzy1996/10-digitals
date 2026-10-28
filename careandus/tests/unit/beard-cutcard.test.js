import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildCutCard,
  cheekLineHeight,
  necklinePosition,
  colorSafety,
  growthRateFromVisits,
  suggestNextVisitDays,
  nextVisitPlan,
  trimIntervalDays,
  visitFrequencyDays,
  cutCardParams,
  needsVisitReplan,
  replanNextVisit,
  nextVisitDate,
  effectiveGrowth,
  cutCardZonesMm,
  nextVisitChoices,
  NEXT_VISIT_CHIPS,
  CHEEK_DEFAULT_MM,
  CHEEK_LIMIT_MM,
} from '../../src/screens/beard/lib/cutcard.js';
import { CANONICAL_VERTICES } from '../../src/ai/beard/mesh/tessellation.js';
import { DEFAULT_GUARD_CHART } from '../../src/screens/beard/lib/guards.js';
import STYLES from '../../src/data/beard/styles.json';
import COLORS from '../../src/data/beard/colors.json';
import { VISIT_DAYS } from '../../src/ai/beard/recommend/score.js';
import CutCardDocument, { colorLine, visitReason } from '../../src/screens/beard/reports/CutCardDocument.jsx';
import { jawOutline, jawRuler, pathPoints, JAW_RULER_PX_PER_MM } from '../../src/screens/beard/reports/jawRuler.js';
import { blockBreaks, paginate, addProbeFix, H2C_PROBE_FIX_ID, BREAK_ABOVE_PX } from '../../src/screens/beard/reports/raster.js';
import { zoneDiagramModel } from '../../src/screens/beard/ui/zoneDiagramGeometry.js';

// The test runner has no React plugin, so JSX compiles to React.createElement.
globalThis.React = React;

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

describe('broken looks (code:extra-1)', () => {
  it('never puts an unknown id or an out-of-range number on the card', () => {
    const s = style('goatee');
    const bad = {
      styleId: { evil: true },
      zones: { M: -5, S: 'x', C: 9999, J_L: null, N: Infinity },
      lines: { cheek: 'faded', cheekOffset: 7, neckline: 'sharp', necklineOffset: -9, sideburn: {}, edge: 42, mustacheEdge: 'way-over' },
      mustacheId: 'not-a-mustache',
      fadeStartMm: 'abc',
      colorId: { id: 'natural' },
      greyTarget: 400,
      finish: {},
      shape: { chin: { x: 1 }, fadeB: ['a', 3] },
    };
    const card = buildCutCard({ params: bad, style: s, safety: { patchTest48h: {}, irritationToday: [true] } });
    expect(card.styleId).toBe('goatee');
    expect(card.finish).toBe('matte');
    expect(card.color.id).toBe('natural');
    expect(card.color.greyTarget).toBe(100);
    // Unknown line ids fall back to the style's own lines.
    expect(card.cheekLine).toMatchObject({ type: s.lines.cheek, offset: 1 });
    expect(card.neckline.type).toBe(s.lines.neckline);
    expect(card.sideburn.join).toBe(s.lines.sideburn);
    expect(card.edge).toBe(s.lines.edge);
    expect(card.mustacheEdge).toBe(s.lines.mustacheEdge);
    const bare = buildCutCard({ params: bad });
    expect(bare.cheekLine.type).toBe('natural');
    expect(bare.neckline.type).toBe('2f');
    expect(bare.sideburn.join).toBe('blended');
    expect(bare.edge).toBe('soft');
    expect(bare.mustacheEdge).toBe('at');
    expect(bare.styleId).toBe(null);
    expect(card.mustache.id).toBe(null);
    expect(row(card, 'M').mm).toBe(0);
    expect(row(card, 'S').mm).toBe(0);
    expect(row(card, 'C').mm).toBe(200);
    expect(row(card, 'N').mm).toBe(0);
    for (const r of card.rows) {
      expect(typeof r.guard.label.en).toBe('string');
      expect(typeof r.guard.label.ar).toBe('string');
    }
    for (const v of [card.finish, card.edge, card.mustacheEdge, card.sideburn.join, card.cheekLine.type, card.neckline.type]) {
      expect(typeof v).toBe('string');
    }
  });

  it('keeps the style lines when the look has unknown ones, and treats odd safety answers as not answered', () => {
    const s = style('beard-fade');
    const p = cutCardParams({ styleId: s.id, zones: s.zones, lines: { sideburn: 'nope', edge: 'razor' }, mustacheId: s.mustacheId }, s);
    expect(p.lines.sideburn).toBe(s.lines.sideburn);
    expect(p.lines.edge).toBe('razor');
    const card = buildCutCard({ params: { ...paramsOf(style('full-medium')), colorId: 'grey-blend' }, safety: { patchTest48h: {}, metallicSaltProducts: 'no' } });
    const q = Object.fromEntries(card.color.questions.map((x) => [x.id, x]));
    expect(q.patchTest48h).toMatchObject({ answer: null, level: 'ask' });
    expect(q.metallicSaltProducts).toMatchObject({ answer: 'no', level: 'ok' });
  });

  it('survives a missing look, a broken guard chart and a string style id', () => {
    const empty = buildCutCard({ params: null });
    expect(empty.rows).toHaveLength(10);
    expect(empty.styleId).toBe(null);
    const chart = buildCutCard({ params: { zones: { C: 8 } }, guardChart: [{ id: 'z', mm: 'x' }] });
    expect(row(chart, 'C').guard.guardId).toBe('3');
    const odd = buildCutCard({ params: { styleId: '../../x', zones: { C: 5 } } });
    expect(odd.styleId).toBe(null);
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

  it('scales the trim interval by his growth rate (catalog intervals are for 0.4 mm/day)', () => {
    expect(trimIntervalDays(14, 0.4)).toBe(14);
    expect(trimIntervalDays(14, 0.8)).toBe(7);
    expect(trimIntervalDays(14, 0.2)).toBe(28);
    expect(trimIntervalDays(21, 0.1)).toBe(42);
    expect(trimIntervalDays(4, null)).toBe(4);
    expect(trimIntervalDays(null, 0.4)).toBe(null);
    expect(trimIntervalDays(0, 0.4)).toBe(null);
    expect(effectiveGrowth(null)).toBe(0.4);
    expect(effectiveGrowth(9)).toBe(2);
    expect(effectiveGrowth(0.05)).toBe(0.05);
    expect(effectiveGrowth(-1)).toBe(0.4);
  });

  it('uses the same visit-frequency days as the recommendation engine', () => {
    expect(visitFrequencyDays('weekly')).toBe(VISIT_DAYS.weekly);
    expect(visitFrequencyDays('biweekly')).toBe(VISIT_DAYS.biweekly);
    expect(visitFrequencyDays('monthly')).toBe(VISIT_DAYS.monthly);
    expect(visitFrequencyDays(null)).toBe(null);
    expect(visitFrequencyDays('toString')).toBe(null);
  });

  it('suggests the next visit from the trim interval and how often he comes (one rule)', () => {
    const sunnah = style('sunnah');
    const circle = style('circle-beard');
    const plan = (s, visitFrequency, growthMmPerDay = 0.4) =>
      nextVisitPlan({ trimDays: s.trimDays, visitFrequency, zonesMm: s.zones, growthMmPerDay });
    // Sunnah (trim every 14 days) for a man who comes every 2 weeks: 14, never 7.
    expect(plan(sunnah, 'biweekly')).toEqual({ days: 14, basis: 'trim', trimDays: 14, visitDays: 14 });
    expect(plan(sunnah, null)).toMatchObject({ days: 14, basis: 'trim' });
    // He comes weekly: his rhythm, and the card says why.
    expect(plan(sunnah, 'weekly')).toMatchObject({ days: 7, basis: 'visits' });
    // He comes monthly but the shape needs a trim at 14 days.
    expect(plan(sunnah, 'monthly')).toMatchObject({ days: 14, basis: 'trim' });
    // A faster grower needs the trim sooner.
    expect(plan(sunnah, null, 0.8)).toMatchObject({ days: 7, basis: 'trim', trimDays: 7 });
    // Circle beard (trim every 4 days): kept up at home, the shop visit follows his answer.
    expect(plan(circle, 'biweekly')).toEqual({ days: 14, basis: 'homeTrim', trimDays: 4, visitDays: 14 });
    expect(plan(circle, null)).toMatchObject({ days: 7, basis: 'homeTrim' });
    expect(plan(style('bandholz'), 'monthly')).toMatchObject({ days: 21, basis: 'trim' });
    expect(suggestNextVisitDays({ trimDays: 14, visitFrequency: 'biweekly' })).toBe(14);
  });

  it('falls back to the growth of the shortest kept zone for a style without a trim interval', () => {
    const fm = style('full-medium');
    expect(nextVisitPlan({ zonesMm: fm.zones, growthMmPerDay: 0.4 })).toMatchObject({ days: 19, basis: 'growth', trimDays: null });
    expect(nextVisitPlan({ zonesMm: fm.zones, growthMmPerDay: 0.4, visitFrequency: 'weekly' })).toMatchObject({ days: 7, basis: 'visits' });
    expect(nextVisitPlan({ zonesMm: style('clean-shave').zones })).toMatchObject({ days: 7, basis: 'growth' });
    expect(nextVisitPlan({ zonesMm: style('bandholz').zones, growthMmPerDay: 0.4 }).days).toBe(42);
    expect(nextVisitPlan({ zonesMm: style('clean-shave').zones, visitFrequency: 'monthly' })).toMatchObject({ days: 30, basis: 'visits' });
  });

  it('puts the plan on the card: the trim interval never contradicts the next visit without a reason', () => {
    const s = style('sunnah');
    const card = buildCutCard({ params: paramsOf(s), style: s, answers: { visitFrequency: 'biweekly' }, now: new Date('2026-10-26T06:00:00Z') });
    expect(card).toMatchObject({ trimDays: 14, styleTrimDays: 14, nextVisitDays: 14, nextVisitBasis: 'trim', visitFrequency: 'biweekly' });
    expect(card.nextVisitDayKey).toBe('2026-11-09');
    const c = style('circle-beard');
    const home = buildCutCard({ params: paramsOf(c), style: c, answers: { visitFrequency: 'biweekly' } });
    expect(home).toMatchObject({ trimDays: 4, nextVisitDays: 14, nextVisitBasis: 'homeTrim' });
    for (const id of STYLES.map((x) => x.id)) {
      for (const visitFrequency of [null, 'weekly', 'biweekly', 'monthly']) {
        const st = style(id);
        const k = buildCutCard({ params: paramsOf(st), style: st, answers: { visitFrequency } });
        expect(k.nextVisitDays).toBeGreaterThanOrEqual(7);
        expect(k.nextVisitDays).toBeLessThanOrEqual(42);
        if (k.nextVisitBasis === 'trim') expect(k.nextVisitDays).toBe(k.trimDays);
        if (k.trimDays !== null && k.nextVisitDays !== k.trimDays) expect(['visits', 'homeTrim']).toContain(k.nextVisitBasis);
      }
    }
  });

  it('re-plans a card that was built without his visit-frequency answer', () => {
    const s = style('sunnah');
    const at = new Date('2026-10-26T06:00:00Z');
    const card = buildCutCard({ params: paramsOf(s), style: s, now: at });
    expect(needsVisitReplan(card, { visitFrequency: null })).toBe(false);
    expect(needsVisitReplan(card, { visitFrequency: 'weekly' })).toBe(true);
    expect(needsVisitReplan(card, { visitFrequency: 'not-an-answer' })).toBe(false);
    const weekly = replanNextVisit(card, { visitFrequency: 'weekly' });
    expect(weekly).toMatchObject({ nextVisitDays: 7, nextVisitBasis: 'visits', visitFrequency: 'weekly', trimDays: 14, nextVisitDayKey: '2026-11-02' });
    expect(needsVisitReplan(weekly, { visitFrequency: 'weekly' })).toBe(false);
    expect(weekly.rows).toBe(card.rows);
    expect(replanNextVisit(card, { visitFrequency: 'weekly' })).toEqual(buildCutCard({ params: paramsOf(s), style: s, now: at, answers: { visitFrequency: 'weekly' } }));
    // An older card (trimDays was the catalog value, no plan fields) is planned as well.
    const { styleTrimDays, nextVisitBasis, visitFrequency, ...old } = card;
    expect([styleTrimDays, nextVisitBasis, visitFrequency]).toEqual([14, 'trim', null]);
    expect(needsVisitReplan(old, {})).toBe(true);
    expect(replanNextVisit(old, { visitFrequency: 'biweekly' })).toMatchObject({ nextVisitDays: 14, nextVisitBasis: 'trim', styleTrimDays: 14 });
  });

  it('dates the next visit on the Muscat calendar', () => {
    const { date, dayKey } = nextVisitDate(14, new Date('2026-10-25T21:00:00Z'));
    expect(dayKey).toBe('2026-11-09');
    expect(date.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    const s = style('full-medium');
    const card = buildCutCard({ params: paramsOf(s), style: s, growthMmPerDay: 0.4, now: new Date('2026-10-25T06:00:00Z') });
    expect(card.nextVisitDays).toBe(14);
    expect(card.nextVisitDayKey).toBe('2026-11-08');
    expect(card.growthMmPerDay).toBe(0.4);
  });
});

describe('next visit on the Done screen (code:F9)', () => {
  it('offers the card suggestion itself, never snapped to the nearest chip', () => {
    expect(NEXT_VISIT_CHIPS).toEqual([7, 14, 21, 30]);
    expect(nextVisitChoices(42)).toEqual([7, 14, 21, 30, 42]);
    expect(nextVisitChoices(10)).toEqual([7, 10, 14, 21, 30]);
    expect(nextVisitChoices(14)).toEqual([7, 14, 21, 30]);
    expect(nextVisitChoices(null)).toEqual([7, 14, 21, 30]);
    expect(nextVisitChoices(undefined)).toEqual([7, 14, 21, 30]);
    expect(nextVisitChoices(-3)).toEqual([7, 14, 21, 30]);
    // Every card the builder can make has its own chip.
    for (const st of STYLES) {
      for (const visitFrequency of [null, 'weekly', 'biweekly', 'monthly']) {
        const card = buildCutCard({ params: paramsOf(st), style: st, answers: { visitFrequency } });
        expect(nextVisitChoices(card.nextVisitDays)).toContain(card.nextVisitDays);
      }
    }
  });
});

describe('Cut Card document', () => {
  const sunnah = style('sunnah');
  const data = (card, extra = {}) => ({
    card,
    params: null,
    shop: { name: 'Test Barbers', nameAr: 'حلاق الاختبار' },
    barber: { name: 'Ali' },
    client: null,
    approved: { at: new Date('2026-10-26T06:00:00Z'), decisionSeconds: 95 },
    ...extra,
  });
  const html = (card, lang = 'en', variant = 'print') => renderToStaticMarkup(React.createElement(CutCardDocument, { data: data(card), lang, variant }));

  it('says grey blending once, with how much grey is kept (chair:F15)', () => {
    const card = buildCutCard({ params: paramsOf(sunnah, { colorId: 'grey-blend', greyTarget: 50 }), style: sunnah });
    expect(colorLine(card, COLORS, 'en')).toBe('Grey blending, 50% grey kept');
    expect(colorLine(card, COLORS, 'ar')).toBe('تمويه الشيب، يبقى 50% من الشيب');
    const ar = html(card, 'ar');
    expect(ar).toContain('تمويه الشيب، يبقى 50% من الشيب');
    expect(ar).not.toContain('تمويه الشيب، تمويه الشيب');
    expect(html(card, 'en')).not.toMatch(/25 \/ 50 \/ 75/);
    const brown = buildCutCard({ params: paramsOf(sunnah, { colorId: 'dark-brown', greyTarget: 25 }), style: sunnah });
    expect(colorLine(brown, COLORS, 'en')).toBe('Dark brown, 25% grey kept');
    const plain = buildCutCard({ params: paramsOf(sunnah, { colorId: 'dark-brown' }), style: sunnah });
    expect(colorLine(plain, COLORS, 'en')).toBe('Dark brown');
    expect(colorLine(buildCutCard({ params: paramsOf(sunnah) }), COLORS, 'en')).toBe('Natural, no color');
  });

  it('prints a dash, never crashes, for a value that is not text (code:extra-1)', () => {
    const card = buildCutCard({ params: paramsOf(sunnah), style: sunnah });
    const broken = { ...card, finish: {}, edge: { x: 1 }, sideburn: { ...card.sideburn, join: ['blended'] }, cheekLine: { ...card.cheekLine, type: {} } };
    for (const variant of ['print', 'share', 'screen']) {
      let out = '';
      expect(() => {
        out = html(broken, 'en', variant);
      }).not.toThrow();
      expect(out).not.toContain('[object Object]');
    }
  });

  it('marks every zone row as a page-break block (chair:F2)', () => {
    const card = buildCutCard({ params: paramsOf(sunnah), style: sunnah });
    for (const variant of ['print', 'share']) {
      const rows = html(card, 'ar', variant).match(/<tr data-pdf-block=""/g) || [];
      expect(rows).toHaveLength(10);
    }
  });

  it('lays the barber ruler along the jaw of the front diagram (PRD-09)', () => {
    const card = buildCutCard({ params: paramsOf(sunnah), style: sunnah });
    const out = html(card, 'en');
    expect(out).not.toContain('Longest zone');
    expect(out).toContain('Brass ruler along the jaw: a tick every 5 mm, a long tick every 10 mm');
    const ruler = jawRuler();
    expect(out).toContain(`d="${ruler.d}"`);
    // Drawn once, over the front view only.
    expect(out.split(ruler.d).length - 1).toBe(1);
  });

  it('says why the next visit is not the trim interval (chair:F18)', () => {
    const circle = style('circle-beard');
    const home = buildCutCard({ params: paramsOf(circle), style: circle, answers: { visitFrequency: 'biweekly' } });
    expect(visitReason(home, 'en')).toBe('He keeps the shape at home between salon visits');
    const out = html(home, 'en');
    expect(out).toContain('Trim every 4 days');
    expect(out).toContain('He keeps the shape at home between salon visits');
    const weekly = buildCutCard({ params: paramsOf(sunnah), style: sunnah, answers: { visitFrequency: 'weekly' } });
    expect(visitReason(weekly, 'en')).toBe('Next visit follows how often he comes: every week');
    expect(visitReason(weekly, 'ar')).toBe('الزيارة القادمة حسب عدد مرات حضوره: كل أسبوع');
    const trim = buildCutCard({ params: paramsOf(sunnah), style: sunnah, answers: { visitFrequency: 'biweekly' } });
    expect(visitReason(trim, 'en')).toBe('');
    expect(html(trim, 'en', 'share')).toContain('Trim every 14 days');
  });
});

describe('jaw ruler geometry', () => {
  it('follows the drawn jaw from ear to ear under the chin', () => {
    const outline = jawOutline();
    const band = pathPoints(zoneDiagramModel({ view: 'front' }).shapes.J_R);
    const outer = band.slice(0, band.length / 2);
    expect(outline[0]).toEqual(outer[0]);
    expect(outline[outline.length - 1]).toEqual([300 - outer[0][0], outer[0][1]]);
    // Left to right across the face, and down to the chin in the middle.
    for (let i = 1; i < outline.length; i++) expect(outline[i][0]).toBeGreaterThanOrEqual(outline[i - 1][0] - 1e-9);
    expect(Math.max(...outline.map((p) => p[1]))).toBe(283);
  });

  it('puts a tick every 5 mm from the middle of the chin, outside the face', () => {
    const ruler = jawRuler();
    expect(ruler.zero).toEqual([150, 283]);
    expect(ruler.lengthMm).toBeGreaterThan(150);
    expect(ruler.lengthMm).toBeLessThan(260);
    const majors = ruler.ticks.filter((t) => t.major);
    expect(majors.length).toBeGreaterThan(10);
    // The tick at the chin is a long one pointing straight down.
    expect(ruler.ticks[0]).toMatchObject({ x1: 150, x2: 150, major: true });
    expect(ruler.ticks[0].y2).toBeGreaterThan(ruler.ticks[0].y1);
    // Ticks mark the jaw about 5 mm apart (along the curve, so the chord is a little shorter).
    const right = ruler.ticks.filter((t) => t.at[0] >= 150).sort((a, b) => a.at[1] - b.at[1] || b.at[0] - a.at[0]).reverse();
    expect(right.length).toBeGreaterThan(15);
    for (let i = 1; i < right.length; i++) {
      const gap = Math.hypot(right[i].at[0] - right[i - 1].at[0], right[i].at[1] - right[i - 1].at[1]) / JAW_RULER_PX_PER_MM;
      expect(gap).toBeGreaterThan(4.2);
      expect(gap).toBeLessThanOrEqual(5.1);
    }
    // Every tick points away from the middle of the face.
    for (const t of ruler.ticks) {
      const d1 = Math.hypot(t.x1 - 150, t.y1 - 190);
      const d2 = Math.hypot(t.x2 - 150, t.y2 - 190);
      expect(d2).toBeGreaterThan(d1);
    }
    expect(jawRuler({ outline: null })).toBe(null);
  });
});

describe('raster page breaks and the html2canvas probe fix (chair:F2)', () => {
  const box = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom }) });

  it('offers a break under every block and just above it', () => {
    const blocks = [box(110, 130), box(130, 150), box(150, 170)];
    const node = { getBoundingClientRect: () => ({ top: 100 }), querySelectorAll: () => blocks };
    expect(blockBreaks(node)).toEqual([8, 28, 30, 48, 50, 70]);
    expect(BREAK_ABOVE_PX).toBe(2);
    // A page of 45 px ends between rows, never inside one.
    expect(paginate(70, blockBreaks(node), 45)).toEqual([
      [0, 30],
      [30, 70],
    ]);
  });

  it('adds one probe style while any export runs and removes it after the last', () => {
    const styles = new Map();
    const doc = {
      head: { appendChild: (el) => styles.set(el.id, el) },
      createElement: () => ({ id: '', textContent: '', remove() {
        styles.delete(this.id);
      } }),
      getElementById: (id) => styles.get(id) || null,
    };
    const a = addProbeFix(doc);
    const b = addProbeFix(doc);
    expect(styles.size).toBe(1);
    expect(styles.get(H2C_PROBE_FIX_ID).textContent).toContain('display: inline !important');
    a();
    a();
    expect(styles.size).toBe(1);
    b();
    expect(styles.size).toBe(0);
    expect(typeof addProbeFix(null)).toBe('function');
  });
});
