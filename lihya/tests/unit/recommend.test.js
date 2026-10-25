import { describe, it, expect } from 'vitest';
import STYLES from '../../src/data/styles.json';
import I18N from '../../src/lib/i18n/ns/catalog.json';
import {
  recommend,
  workRuleAllows,
  hiddenByWorkRule,
  faceShares,
  faceFit,
  growFor,
  contrastOf,
  contrastFit,
  lifeFit,
  eidBoosted,
  isFreshlyShaved,
  WEAK_PENALTY,
  EID_BOOST,
} from '../../src/ai/recommend/score.js';
import { trimReason, pairingHints, warningsFor, workRuleNotice, MAX_REASONS } from '../../src/ai/recommend/reasons.js';

const ZONES = ['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N'];
const SHAPES = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle'];

/** FaceProfile shaped like src/ai/analysis/profile.js output (PRD 5.8). */
function makeProfile({
  top = 'oval',
  scores = null,
  density = 80,
  zones = {},
  band = '25-34',
  skinL = 62,
  beardL = 18,
  grey = 5,
  angle = 130,
  measures = {},
} = {}) {
  const sc = scores || Object.fromEntries(SHAPES.map((s) => [s, s === top ? 1 : 0]));
  return {
    version: 1,
    capturedAt: '2026-10-25T09:12:00+04:00',
    scale: { mmPerPx: 0.08, source: 'iris', confidence: 0.9 },
    faceShape: { top, scores: sc, jawAngleDeg: angle, measures },
    skin: { ita: 25, mst: 5, undertone: 'warm', confidence: 0.8, lab: [skinL, 12, 18] },
    ageBand: { band, source: 'model', confidence: 0.7 },
    beard: {
      zones: Object.fromEntries(ZONES.map((z) => [z, { density: zones[z] ?? density, lengthMm: 2, confidence: 0.8 }])),
      growability: density,
      greyRatio: grey,
      colorId: 'natural-black',
      colorLab: [beardL, 2, 3],
    },
    calibration: { whiteCard: false, gains: [1, 1, 1] },
    overrides: { faceShape: null, undertone: null, ageBand: null },
  };
}

/** Seeded Fisher-Yates so the shuffle test is reproducible. */
function shuffled(list, seed) {
  const a = list.slice();
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const byId = (list) => Object.fromEntries(list.map((r) => [r.styleId, r]));
const top6 = (list) => list.slice(0, 6).map((r) => `${r.styleId}:${r.score}`);

describe('recommend: output contract', () => {
  it('returns Ranked entries for every visible style, sorted by score then order then id', () => {
    const list = recommend(makeProfile({ top: 'round' }), STYLES, { answers: {} });
    expect(list).toHaveLength(34);
    for (const r of list) {
      expect(typeof r.styleId).toBe('string');
      expect(r.style.id).toBe(r.styleId);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.growability).toBeGreaterThanOrEqual(0);
      expect(r.growability).toBeLessThanOrEqual(100);
      expect(Array.isArray(r.reasons)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(Object.keys(r.jawline).sort()).toEqual(['jawSoftPct', 'lengthPct', 'widthPct']);
    }
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      expect(a.score).toBeGreaterThanOrEqual(b.score);
      if (a.score === b.score && a.rawScore === b.rawScore) {
        expect(a.style.order < b.style.order || (a.style.order === b.style.order && a.styleId < b.styleId)).toBe(true);
      }
    }
  });

  it('applies the PRD formula exactly', () => {
    const list = recommend(makeProfile({ top: 'square' }), STYLES, { answers: { occasion: 'eid' } });
    for (const r of list) {
      const p = r.parts;
      const expected = 100 * (0.3 * p.face + 0.25 * p.grow + 0.15 * p.contrast + 0.1 * p.age + 0.1 * p.life + 0.1 * p.local) - p.penalty + p.boost;
      expect(Math.abs(r.rawScore - expected), r.styleId).toBeLessThan(0.05);
      expect(r.score).toBe(Math.min(100, Math.max(0, Math.round(r.rawScore * 10) / 10)));
      expect(p.local).toBeCloseTo(r.style.localFit / 5, 3);
    }
  });

  it('skips hidden styles and handles a missing profile', () => {
    const styles = STYLES.map((s) => (s.id === 'goatee' ? { ...s, hidden: true } : s));
    const list = recommend(makeProfile(), styles, {});
    expect(list.find((r) => r.styleId === 'goatee')).toBeUndefined();
    expect(list).toHaveLength(33);
    const blind = recommend(null, STYLES);
    expect(blind).toHaveLength(34);
    for (const r of blind) {
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.reasons.find((x) => x.id === 'grow_ok')).toBeUndefined();
    }
  });
});

describe('recommend: determinism', () => {
  const profiles = [
    makeProfile({ top: 'round', scores: { oval: 0.21, round: 0.72, square: 0.04, oblong: 0.02, heart: 0.01, diamond: 0, triangle: 0 } }),
    makeProfile({ top: 'square', zones: { K_L: 35, K_R: 30 }, band: '55+' }),
    makeProfile({ top: 'oblong', density: 55, skinL: 70, beardL: 50 }),
  ];
  const answers = { workRule: 'none', visitFrequency: 'biweekly', grooming: 5, occasion: 'eid' };

  it('returns the same top 6 in the same order on 20 runs', () => {
    for (const p of profiles) {
      const first = top6(recommend(p, STYLES, { answers }));
      for (let i = 0; i < 20; i++) expect(top6(recommend(p, STYLES, { answers }))).toEqual(first);
    }
  });

  it('does not depend on the order of the style list', () => {
    for (const p of profiles) {
      const ref = recommend(p, STYLES, { answers }).map((r) => `${r.styleId}:${r.score}`);
      for (let seed = 1; seed <= 20; seed++) {
        const got = recommend(p, shuffled(STYLES, seed), { answers }).map((r) => `${r.styleId}:${r.score}`);
        expect(got).toEqual(ref);
      }
    }
  });

  it('does not change its inputs', () => {
    const p = profiles[1];
    const before = JSON.stringify([p, STYLES]);
    recommend(p, STYLES, { answers, overrides: { zones: { K_L: 'none' } } });
    expect(JSON.stringify([p, STYLES])).toBe(before);
  });
});

describe('recommend: penalties and warning chips', () => {
  it('a full beard with patchy cheeks loses 25 points and shows the cheek warning', () => {
    const dense = byId(recommend(makeProfile({ density: 85 }), STYLES));
    const patchy = byId(recommend(makeProfile({ density: 85, zones: { K_L: 30, K_R: 32 } }), STYLES));
    const fm = patchy['full-medium'];
    expect(fm.parts.penalty).toBe(WEAK_PENALTY);
    expect(fm.warnings.map((w) => w.key)).toEqual(['catalog.reason.grow_warn']);
    expect(fm.warnings[0].zones).toEqual(['K_L', 'K_R']);
    expect(fm.score).toBeLessThan(dense['full-medium'].score - 25);
    expect(fm.reasons.find((r) => r.id === 'grow_ok')).toBeUndefined();
    // styles that do not need the cheeks are not penalised
    for (const id of ['goatee', 'balbo', 'van-dyke', 'clean-shave']) {
      expect(patchy[id].parts.penalty, id).toBe(0);
      expect(patchy[id].warnings, id).toEqual([]);
    }
  });

  it('PRD example: connectors at 35% push Balbo and Van Dyke above a full beard', () => {
    const list = recommend(makeProfile({ top: 'square', density: 80, zones: { K_L: 35, K_R: 35 } }), STYLES);
    const pos = (id) => list.findIndex((r) => r.styleId === id);
    expect(pos('balbo')).toBeLessThan(pos('full-medium'));
    expect(pos('van-dyke')).toBeLessThan(pos('full-medium'));
    expect(pos('balbo')).toBeLessThan(pos('corporate'));
  });

  it('zone-specific warnings, collapsed when many zones are weak', () => {
    const r = byId(recommend(makeProfile({ density: 85, zones: { C: 20 } }), STYLES)).goatee;
    expect(r.warnings.map((w) => w.key)).toEqual(['catalog.warn.patchy_chin']);
    const many = byId(recommend(makeProfile({ density: 20 }), STYLES))['full-medium'];
    expect(many.warnings).toHaveLength(1);
    expect(many.warnings[0].key).toBe('catalog.warn.under40');
    expect(many.warnings[0].vars.count).toBeGreaterThan(2);
    expect(many.parts.penalty).toBe(WEAK_PENALTY);
    expect(warningsFor([])).toEqual([]);
  });

  it('respects the barber zone confirmations (dense / medium / patchy / none)', () => {
    const p = makeProfile({ density: 85 });
    const base = byId(recommend(p, STYLES))['full-medium'];
    const none = byId(recommend(p, STYLES, { overrides: { zones: { K_L: 'none' } } }))['full-medium'];
    expect(base.parts.penalty).toBe(0);
    expect(none.parts.penalty).toBe(WEAK_PENALTY);
    const lifted = byId(recommend(makeProfile({ zones: { K_L: 20, K_R: 20 } }), STYLES, { overrides: { zones: { K_L: 'dense', K_R: 'dense' } } }))['full-medium'];
    expect(lifted.parts.penalty).toBe(0);
  });

  it('a freshly shaved face is not read as unable to grow; confirmations still count', () => {
    const shaved = makeProfile({ density: 2, zones: { B_L: 8, N: 17 } });
    expect(isFreshlyShaved(shaved)).toBe(true);
    expect(isFreshlyShaved(makeProfile({ density: 80 }))).toBe(false);
    expect(isFreshlyShaved(makeProfile({ density: 20 }))).toBe(false);
    const list = recommend(shaved, STYLES);
    for (const r of list) {
      expect(r.parts.penalty, r.styleId).toBe(0);
      expect(r.warnings, r.styleId).toEqual([]);
      expect(r.reasons.map((x) => x.id), r.styleId).not.toContain('grow_ok');
      if (r.styleId !== 'clean-shave') {
        expect(r.growability, r.styleId).toBeNull();
        expect(r.growUnknown, r.styleId).toBe(true);
      }
    }
    expect(list.findIndex((r) => r.styleId === 'corporate')).toBeLessThan(15);
    const confirmed = byId(recommend(shaved, STYLES, { overrides: { zones: { K_L: 'patchy', K_R: 'patchy' } } }))['full-medium'];
    expect(confirmed.parts.penalty).toBe(WEAK_PENALTY);
    expect(confirmed.warnings[0].key).toBe('catalog.reason.grow_warn');
    expect(I18N.en['catalog.warn.shaved_confirm']).toMatch(/Confirm each zone/);
    // partial confirmations merged into the effective profile do not flip the shaved test
    const overrides = { zones: { K_L: 'dense', K_R: 'dense', C: 'dense' } };
    const effective = JSON.parse(JSON.stringify(shaved));
    for (const z of ['K_L', 'K_R', 'C']) effective.beard.zones[z] = { density: 85, lengthMm: 0, confidence: 1 };
    expect(isFreshlyShaved(effective, overrides)).toBe(true);
    const fm = byId(recommend(effective, STYLES, { overrides }))['full-medium'];
    expect(fm.parts.penalty).toBe(0);
    expect(fm.growUnknown).toBe(true);
    // a mustache-only face is not "shaved": the rest really reads empty
    expect(isFreshlyShaved(makeProfile({ density: 2, zones: { M: 70 } }))).toBe(false);
  });

  it('weak sideburns do not penalise the faded beard, whose sideburns fade to skin', () => {
    const r = byId(recommend(makeProfile({ density: 85, zones: { B_L: 30, B_R: 28 } }), STYLES));
    expect(r['beard-fade'].parts.penalty).toBe(0);
    expect(r.corporate.parts.penalty).toBe(WEAK_PENALTY);
    expect(r.corporate.warnings.map((w) => w.key)).toEqual(['catalog.warn.patchy_sideburns']);
    expect(r['beard-fade'].score).toBeGreaterThan(r.corporate.score);
  });

  it('light stubble is not penalised for cheeks that cover its own lower requirement', () => {
    const r = byId(recommend(makeProfile({ density: 80, zones: { K_L: 35, K_R: 35 } }), STYLES));
    expect(r['light-stubble'].parts.penalty).toBe(0);
    expect(r['designer-stubble'].parts.penalty).toBe(WEAK_PENALTY);
  });
});

describe('recommend: work rule and occasion', () => {
  const p = makeProfile({ top: 'oval' });

  it('clean-shave only leaves the clean shave', () => {
    const list = recommend(p, STYLES, { answers: { workRule: 'clean' } });
    expect(list.map((r) => r.styleId)).toEqual(['clean-shave']);
    expect(hiddenByWorkRule(STYLES, 'clean')).toBe(33);
    expect(workRuleNotice(33)).toEqual({ key: 'catalog.warn.work_rule_hidden', id: 'work_rule_hidden', vars: { n: 33 } });
    expect(workRuleNotice(0)).toBeNull();
  });

  it('short and neat only hides long and theatrical styles', () => {
    const list = recommend(p, STYLES, { answers: { workRule: 'short' } });
    expect(list.length).toBeGreaterThan(10);
    for (const r of list) {
      expect(['none', 'stubble', 'short']).toContain(r.style.lengthClass);
      expect(r.style.theatrical).toBe(false);
    }
    const ids = list.map((r) => r.styleId);
    for (const id of ['full-medium', 'full-long', 'sunnah', 'garibaldi', 'mutton-chops', 'van-dyke']) expect(ids).not.toContain(id);
    for (const id of ['clean-shave', 'designer-stubble', 'khatt', 'short-boxed', 'corporate', 'goatee']) expect(ids).toContain(id);
  });

  it('no rule shows everything', () => {
    expect(recommend(p, STYLES, { answers: { workRule: 'none' } })).toHaveLength(34);
    expect(recommend(p, STYLES, { answers: { workRule: null } })).toHaveLength(34);
    expect(workRuleAllows(STYLES[0], 'none')).toBe(true);
  });

  it('Eid or wedding adds exactly +10 to crisp and razor-lined styles, with the eid chip', () => {
    const plain = byId(recommend(p, STYLES, { answers: { occasion: 'none' } }));
    const eid = byId(recommend(p, STYLES, { answers: { occasion: 'eid' } }));
    for (const s of STYLES) {
      const diff = Math.round((eid[s.id].rawScore - plain[s.id].rawScore) * 1000) / 1000;
      if (eidBoosted(s)) {
        expect(diff, s.id).toBe(EID_BOOST);
        expect(eid[s.id].reasons.map((r) => r.id), s.id).toContain('eid_ready');
      } else {
        expect(diff, s.id).toBe(0);
        expect(eid[s.id].reasons.map((r) => r.id), s.id).not.toContain('eid_ready');
      }
    }
    expect(eidBoosted(STYLES.find((s) => s.id === 'khatt'))).toBe(true);
    expect(eidBoosted(STYLES.find((s) => s.id === 'full-long'))).toBe(false);
  });
});

describe('recommend: reason chips', () => {
  const cases = [
    makeProfile({ top: 'round', angle: 141 }),
    makeProfile({ top: 'square', angle: 118 }),
    makeProfile({ top: 'oblong', angle: 126 }),
    makeProfile({ top: 'heart' }),
    makeProfile({ top: 'oval', density: 30 }),
  ];

  it('never more than 3 chips, all translatable, biggest contribution first', () => {
    for (const p of cases) {
      for (const answers of [{}, { occasion: 'eid', visitFrequency: 'weekly', grooming: 10 }]) {
        for (const r of recommend(p, STYLES, { answers })) {
          expect(r.reasons.length).toBeLessThanOrEqual(MAX_REASONS);
          expect(new Set(r.reasons.map((x) => x.id)).size).toBe(r.reasons.length);
          for (let i = 1; i < r.reasons.length; i++) expect(r.reasons[i - 1].contribution).toBeGreaterThanOrEqual(r.reasons[i].contribution);
          for (const x of [...r.reasons, ...r.warnings]) {
            expect(I18N.en[x.key], x.key).toBeTruthy();
            expect(I18N.ar[x.key], x.key).toBeTruthy();
          }
        }
      }
    }
  });

  it('face chips follow the face shape and the jawline numbers', () => {
    const round = byId(recommend(cases[0], STYLES));
    expect(round.goatee.reasons.map((r) => r.id)).toContain('face_elongate');
    expect(round.goatee.jawline.lengthPct).toBeGreaterThan(0);
    const square = byId(recommend(cases[1], STYLES));
    expect(square.corporate.reasons.map((r) => r.id)).toContain('face_soften');
    const oblong = byId(recommend(cases[2], STYLES));
    expect(oblong['short-boxed'].reasons.map((r) => r.id)).toContain('face_widen');
    const heart = byId(recommend(cases[3], STYLES));
    expect(heart['full-medium'].reasons.map((r) => r.id)).toContain('face_balance_chin');
    // a round face never gets the square-jaw chip
    for (const r of Object.values(round)) expect(r.reasons.map((x) => x.id)).not.toContain('face_soften');
  });

  it('low maintenance chip carries the trim interval', () => {
    const r = byId(recommend(cases[0], STYLES, { answers: { visitFrequency: 'biweekly', grooming: 10 } }))['full-medium'];
    const chip = r.reasons.find((x) => x.id === 'low_maint');
    expect(chip).toBeTruthy();
    expect(chip.key).toBe('catalog.reason.low_maint');
    expect(I18N.en[chip.key]).toBe('Trim every 2 weeks');
    expect(trimReason(14).key).toBe('catalog.reason.low_maint');
    expect(trimReason(21)).toMatchObject({ key: 'catalog.reason.low_maint_weeks', vars: { weeks: 3 } });
    expect(trimReason(7).key).toBe('catalog.reason.low_maint_week');
    expect(trimReason(4)).toMatchObject({ key: 'catalog.reason.low_maint_days', vars: { days: 4 } });
    expect(trimReason(2).key).toBe('catalog.reason.low_maint_2days');
    expect(trimReason(1).cardKey).toBe('catalog.trim.day');
    expect(trimReason(12).key).toBe('catalog.reason.low_maint_days_many');
  });

  it('high contrast chip only for a dark beard on lighter skin with defined lines', () => {
    const dark = byId(recommend(makeProfile({ skinL: 70, beardL: 15 }), STYLES));
    expect(dark.khatt.reasons.map((r) => r.id)).toContain('high_contrast');
    const light = byId(recommend(makeProfile({ skinL: 70, beardL: 60 }), STYLES));
    for (const r of Object.values(light)) expect(r.reasons.map((x) => x.id)).not.toContain('high_contrast');
  });

  it('haircut pairing hints (PRD 6.4)', () => {
    const s = (id) => STYLES.find((x) => x.id === id);
    expect(pairingHints(s('full-medium')).map((h) => h.id)).toEqual(['high_fade_full']);
    expect(pairingHints(s('full-medium'))[0].suggestStyleId).toBe('beard-fade');
    expect(pairingHints(s('designer-stubble')).map((h) => h.id)).toEqual(['mid_fade_designer']);
    expect(pairingHints(s('full-long')).map((h) => h.id)).toEqual(['high_fade_full', 'long_top_connected']);
    expect(pairingHints(s('goatee'))).toEqual([]);
  });
});

describe('recommend: score terms', () => {
  it('Face: 1.0 for listed shapes, 0.2 for others, overrides count as 100 %', () => {
    const goatee = STYLES.find((s) => s.id === 'goatee'); // RD OV TR
    expect(faceFit(goatee, { round: 1 })).toBe(1);
    expect(faceFit(goatee, { square: 1 })).toBeCloseTo(0.2, 6);
    expect(faceFit(goatee, { round: 0.5, square: 0.5 })).toBeCloseTo(0.6, 6);
    expect(faceFit(STYLES.find((s) => s.id === 'sunnah'), { square: 1 })).toBe(1);
    const p = makeProfile({ top: 'round' });
    expect(faceShares(p, { faceShape: 'square' })).toEqual({ square: 1 });
    const overridden = { ...p, faceShape: { ...p.faceShape, top: 'heart' } };
    expect(faceShares(overridden)).toEqual({ heart: 1 });
    const a = byId(recommend(p, STYLES)).goatee.parts.face;
    const b = byId(recommend(p, STYLES, { overrides: { faceShape: 'square' } })).goatee.parts.face;
    expect(a).toBe(1);
    expect(b).toBeCloseTo(0.2, 3);
  });

  it('Grow: weighted min(1, density / required); clean shave needs nothing', () => {
    const goatee = STYLES.find((s) => s.id === 'goatee');
    const g = growFor(goatee, { C: 30, S: 50 });
    expect(g.grow).toBeCloseTo(0.65 * 0.5 + 0.35 * 1, 6);
    expect(g.weak).toEqual(['C']);
    expect(g.growability).toBe(Math.round(0.65 * 30 + 0.35 * 50));
    expect(growFor(STYLES.find((s) => s.id === 'clean-shave'), {})).toMatchObject({ grow: 1, growability: 100, weak: [] });
  });

  it('Contrast: crisp lines win at high contrast, long styles at low contrast', () => {
    const khatt = STYLES.find((s) => s.id === 'khatt');
    const long = STYLES.find((s) => s.id === 'full-long');
    const high = contrastOf(makeProfile({ skinL: 72, beardL: 15 })).level;
    const low = contrastOf(makeProfile({ skinL: 70, beardL: 62 })).level;
    expect(high).toBeGreaterThan(0.8);
    expect(low).toBe(0);
    expect(contrastFit(khatt, high)).toBeGreaterThan(contrastFit(long, high));
    expect(contrastFit(long, low)).toBeGreaterThan(contrastFit(khatt, low));
    expect(contrastOf(makeProfile({ skinL: 72, beardL: 15, grey: 90 })).level).toBeLessThan(high);
  });

  it('Age: theatrical styles drop for 55+ unless the customer picked them', () => {
    const young = byId(recommend(makeProfile({ band: '25-34' }), STYLES));
    const old = byId(recommend(makeProfile({ band: '55+' }), STYLES));
    const picked = byId(recommend(makeProfile({ band: '55+' }), STYLES, { chosen: ['garibaldi'] }));
    expect(old.garibaldi.parts.age).toBeLessThan(young.garibaldi.parts.age);
    expect(picked.garibaldi.parts.age).toBe(0.8);
    expect(old.corporate.parts.age).toBe(0.8);
    expect(old.sunnah.parts.age).toBeGreaterThan(0.8);
  });

  it('Life: neutral when unanswered, matches trim interval to visits and grooming', () => {
    const s = (id) => STYLES.find((x) => x.id === id);
    expect(lifeFit(s('full-medium'), {})).toBeNull();
    expect(lifeFit(s('full-medium'), { visitFrequency: 'biweekly', grooming: 10 })).toBe(1);
    expect(lifeFit(s('bandholz'), { visitFrequency: 'monthly', grooming: 0 })).toBeLessThan(lifeFit(s('bandholz'), { visitFrequency: 'monthly', grooming: 10 }));
    expect(lifeFit(s('khatt'), { visitFrequency: 'monthly' })).toBeLessThan(lifeFit(s('khatt'), { visitFrequency: 'weekly' }));
    // stubble is kept at home with a trimmer when he grooms 5 minutes a day
    expect(lifeFit(s('light-stubble'), { visitFrequency: 'monthly', grooming: 5 })).toBeGreaterThan(0.85);
    const r = byId(recommend(makeProfile(), STYLES, {}))['full-medium'];
    expect(r.parts.life).toBe(0.75);
  });
});

describe('recommend: performance', () => {
  it('ranks 40 styles in under 50 ms', () => {
    const extra = STYLES.slice(0, 6).map((s, i) => ({ ...s, id: `sig-${s.id}-${i}`, signature: true, order: 1000 + i }));
    const forty = [...STYLES, ...extra];
    expect(forty).toHaveLength(40);
    const p = makeProfile({ top: 'round' });
    const answers = { workRule: 'none', visitFrequency: 'weekly', grooming: 5, occasion: 'eid' };
    recommend(p, forty, { answers });
    const times = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      const list = recommend(p, forty, { answers });
      times.push(performance.now() - t0);
      expect(list).toHaveLength(40);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(50);
    expect(times[times.length - 1]).toBeLessThan(150);
  });
});
