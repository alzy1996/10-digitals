// Review fixes in the Firebase layer: what a stored look may hold, client search
// tokens, safe "next" paths, once-only stats, Look Code clamping, demo stats floor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARAM_KEYS,
  nameMatches,
  nameQueryToken,
  nameTokens,
  phoneQueryToken,
  phoneTokens,
  sanitizeParams,
  sanitizeStylePatch,
  styleData,
} from '../../src/services/model.js';
import { safeNextPath, emailLinkUrl } from '../../src/services/auth.js';
import { lookCodeParams } from '../../src/services/lookCodes.js';
import { floorDeltas } from '../../src/services/shops.js';
import { validateParams } from '../../src/lib/look.js';
import { hasLangPref } from '../../src/lib/i18n/useT.js';
import { PREF_KEYS } from '../../src/config/app.js';

describe('a stored look holds style parameters only (SEC-01, SEC-05)', () => {
  it('keeps only the LookParams keys: no thumbnail, no unknown scalars', () => {
    const p = sanitizeParams({
      styleId: 'goatee',
      zones: { C: 15 },
      thumb: 'data:image/jpeg;base64,AAAA',
      note: 'x',
      score: 3,
      finish: 'oiled',
    });
    expect(Object.keys(p).every((k) => PARAM_KEYS.includes(k))).toBe(true);
    expect(p.thumb).toBeUndefined();
    expect(p.note).toBeUndefined();
    expect(p.finish).toBe('oiled');
  });

  it('bounds every value: zones 0..300, offsets -1..1 (0 when missing), grey 0..100, text', () => {
    const p = sanitizeParams({
      styleId: 'x y',
      zones: { C: 1e9, M: -4 },
      lines: { cheek: 'low', cheekOffset: 7, extra: 'y', edge: { evil: true } },
      greyTarget: 500,
      fadeStartMm: 999,
      finish: {},
      colorId: 7,
      shape: { chin: 'round', blob: 'z', fadeB: [2, 'x'], jFront: 'yes', lengthAdjustable: 'C' },
    });
    expect(p.styleId).toBeNull();
    expect(p.zones).toEqual({ C: 300, M: 0 });
    expect(p.lines).toEqual({
      cheek: 'low',
      cheekOffset: 1,
      neckline: null,
      necklineOffset: 0,
      sideburn: null,
      edge: null,
      mustacheEdge: null,
    });
    expect(p.greyTarget).toBe(100);
    expect(p.fadeStartMm).toBe(300);
    expect(p.finish).toBeNull();
    expect(p.colorId).toBeNull();
    expect(p.shape).toEqual({ chin: 'round', jFront: null, fadeB: [2, null], lengthAdjustable: 'C' });
  });

  it('drops unknown style keys and keeps names short', () => {
    const d = styleData({ id: 'g', name: { en: 'A'.repeat(200), ar: 'ب' }, zones: { C: 15 }, blob: 'x', order: -1e9 });
    expect(d.blob).toBeUndefined();
    expect(d.name.en).toHaveLength(80);
    expect(d.order).toBe(-100000);
    expect(sanitizeStylePatch({ blob: 'x', name: 42, localFit: 3 })).toEqual({ name: { en: '', ar: '' }, localFit: 3 });
    expect(sanitizeStylePatch({ name: 'Goatee' }).name).toEqual({ en: 'Goatee', ar: 'Goatee' });
  });
});

describe('client search tokens (chair F17)', () => {
  it('finds a client by the start of any word, Arabic variants and case ignored', () => {
    const t = nameTokens('أحمد سالم (تجريبي)');
    expect(t).toContain('سالم');
    expect(t).toContain('سا');
    expect(t).toContain(nameQueryToken('احمد'));
    expect(nameTokens('خالد حمد')).toContain(nameQueryToken('حمد'));
    expect(nameTokens('Hamad Al Balushi')).toContain(nameQueryToken('balushi'));
    expect(nameTokens('Hamad Al Balushi')).toContain(nameQueryToken('Al Balushi'));
  });

  it('finds Arabic family names without the article', () => {
    expect(nameTokens('سالم البلوشي')).toContain('بلوشي');
    expect(nameMatches('بلوشي', 'سالم البلوشي')).toBe(true);
  });

  it('matches multi-word queries word by word on the device', () => {
    expect(nameMatches('Al Balushi', 'Hamad Al Balushi')).toBe(true);
    expect(nameMatches('ham bal', 'Hamad Al Balushi')).toBe(true);
    expect(nameMatches('hamad salim', 'Hamad Al Balushi')).toBe(false);
    expect(nameMatches('سالم', 'أحمد سالم (تجريبي)')).toBe(true);
  });

  it('keeps the token list bounded', () => {
    const t = nameTokens('Abdulrahman Mohammed Abdullah Al Mahrouqi Bin Saif Al Hinai Al Busaidi');
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.every((x) => x.length <= 15)).toBe(true);
  });

  it('finds a phone by any 4 or more of its digits', () => {
    const t = phoneTokens('+96891234567');
    expect(t).toContain('9123');
    expect(t).toContain('4567');
    expect(t).toContain('91234567');
    expect(t).not.toContain('968');
    expect(t.length).toBeLessThanOrEqual(20);
    expect(phoneQueryToken('9123')).toBe('9123');
    expect(phoneQueryToken('+968 9123 4567')).toBe('91234567');
    expect(phoneQueryToken('٩١٢٣')).toBe('9123');
    expect(phoneQueryToken('912')).toBeNull();
    expect(phoneTokens(null)).toEqual([]);
  });
});

describe('safe next path (SEC-07)', () => {
  it('refuses control characters and backslashes that browsers turn into //host', () => {
    expect(safeNextPath('/\t/example.com')).toBe('/');
    expect(safeNextPath('/\n/example.com')).toBe('/');
    expect(safeNextPath('/\r/example.com')).toBe('/');
    expect(safeNextPath('/\\example.com')).toBe('/');
    expect(safeNextPath('//example.com')).toBe('/');
    expect(safeNextPath('https://example.com/s/x')).toBe('/');
    expect(safeNextPath('/s/abc/../..//example.com')).toBe('/');
  });

  it('keeps ordinary app paths with their query and hash', () => {
    expect(safeNextPath('/s/abc/capture?mode=quick#top')).toBe('/s/abc/capture?mode=quick#top');
    expect(safeNextPath('/join/abc')).toBe('/join/abc');
    expect(safeNextPath('', '/x')).toBe('/x');
    expect(safeNextPath(null)).toBe('/');
  });

  it('never puts an unsafe path into the sign-in email link', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.test' } });
    try {
      expect(emailLinkUrl('/\t/evil.com')).toBe('https://app.test/login');
      expect(emailLinkUrl('/s/abc')).toBe('https://app.test/login?next=%2Fs%2Fabc');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Look Code params are clamped before use (SEC-01, code F6)', () => {
  it('clamps lengths, drops a thumbnail and fills the style', () => {
    const p = lookCodeParams({
      styleId: 'goatee',
      params: { zones: { C: 1e9, M: 5 }, thumb: 'data:image/jpeg;base64,AAAA' },
    });
    expect(p.zones.C).toBe(200);
    expect(p.zones.M).toBe(5);
    expect(p.thumb).toBeUndefined();
    expect(p.styleId).toBe('goatee');
    expect(validateParams(p)).toEqual([]);
  });

  it('reports a look whose options do not exist (shown as not found)', () => {
    const p = lookCodeParams({ styleId: 'goatee', params: { finish: {}, lines: { cheek: 'faded' } } });
    expect(validateParams(p).length).toBeGreaterThan(0);
  });
});

describe('demo stats never go below zero (SEC-04)', () => {
  it('limits negative deltas to what the day has', () => {
    const out = floorDeltas(
      { consultations: -3, approvals: -2, totalDecisionSeconds: -300, addOns: 0, topStyles: { a: -2, b: 1 } },
      { consultations: 2, approvals: 5, totalDecisionSeconds: 100, topStyles: { a: 1 } },
    );
    expect(out).toMatchObject({ consultations: -2, approvals: -2, totalDecisionSeconds: -100, topStyles: { a: -1, b: 1 } });
  });

  it('leaves deltas alone when the day is unknown', () => {
    const d = { consultations: -1, topStyles: {} };
    expect(floorDeltas(d, null)).toBe(d);
  });
});

describe('the shop default language applies only without a device choice (PRD-01)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const storage = (value) => ({ getItem: (k) => (k === PREF_KEYS.lang ? value : null) });

  it('is false on a fresh device and for junk values', () => {
    vi.stubGlobal('localStorage', storage(null));
    expect(hasLangPref()).toBe(false);
    vi.stubGlobal('localStorage', storage('fr'));
    expect(hasLangPref()).toBe(false);
  });

  it('is true once the person picked a language', () => {
    vi.stubGlobal('localStorage', storage('en'));
    expect(hasLangPref()).toBe(true);
  });

  it('is false when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(hasLangPref()).toBe(false);
  });
});

// ------------------------------------------------------------------ once-only stats

const commits = [];
let user = { uid: 'barber1', isAnonymous: false };
let cached = null;

vi.mock('../../src/services/db.js', async () => {
  const actual = await vi.importActual('../../src/services/db.js');
  return {
    ...actual,
    commitOps: (ops, label, opts = {}) => {
      commits.push({ ops: ops.filter(Boolean), label, opts });
      return Promise.resolve();
    },
    currentUser: () => user,
    requireUser: () => {
      if (!user || user.isAnonymous) throw actual.codedError('auth/not-signed-in');
      return user;
    },
    readCachedDoc: async () => cached,
  };
});

async function freshConsultations() {
  vi.resetModules();
  return import('../../src/services/consultations.js');
}

const statsOps = () => commits.filter((c) => c.ops.some((op) => op.path.includes('/dailyStats/')));

describe('approval and add-on stats are counted once (chair F1, code F11)', () => {
  beforeEach(() => {
    commits.length = 0;
    user = { uid: 'barber1', isAnonymous: false };
    cached = null;
  });
  afterEach(() => vi.resetModules());

  it('sends the count with a server-time stamp in its own quiet batch, before the data', async () => {
    const c = await freshConsultations();
    c.approveConsultation('s1', 'k1', { params: { styleId: 'goatee', zones: { C: 15 } }, decisionSeconds: 94, startedAt: new Date('2026-10-26T08:00:00Z') });
    expect(commits).toHaveLength(2);
    const [count, data] = commits;
    expect(count.opts.quietDenied).toBe(true);
    expect(count.ops[0].path).toBe('shops/s1/consultations/k1');
    expect(Object.keys(count.ops[0].data)).toContain('approvalCountedAt');
    expect(count.ops[1].path).toBe('shops/s1/dailyStats/2026-10-26');
    expect(data.ops).toHaveLength(1);
    expect(data.ops[0].data.status).toBe('approved');
    expect(data.opts.quietDenied).toBeUndefined();
  });

  it('does not count a second approval on the same page', async () => {
    const c = await freshConsultations();
    c.approveConsultation('s1', 'k1', { params: { styleId: 'goatee' }, decisionSeconds: 94 });
    c.approveConsultation('s1', 'k1', { params: { styleId: 'goatee' }, decisionSeconds: 169 });
    expect(statsOps()).toHaveLength(1);
    expect(commits).toHaveLength(3);
  });

  it('after a reload the count batch is the one the rules refuse (stamp already set)', async () => {
    let c = await freshConsultations();
    c.approveConsultation('s1', 'k1', { params: { styleId: 'goatee' }, decisionSeconds: 94 });
    c = await freshConsultations();
    c.approveConsultation('s1', 'k1', { params: { styleId: 'goatee' }, decisionSeconds: 169, dayKey: '2026-10-25' });
    const counts = statsOps();
    expect(counts).toHaveLength(2);
    // Same shape both times: stamp + increments in one batch, so the server refuses it whole.
    expect(counts[1].ops.map((op) => op.path)).toEqual(['shops/s1/consultations/k1', 'shops/s1/dailyStats/2026-10-25']);
    expect(counts[1].opts.quietDenied).toBe(true);
  });

  it('counts add-ons once, only when there are some', async () => {
    const c = await freshConsultations();
    c.completeConsultation('s1', 'k2', { rating: 5, addOns: [] });
    expect(statsOps()).toHaveLength(0);
    const c2 = await freshConsultations();
    c2.completeConsultation('s1', 'k3', { rating: 5, addOns: ['p1', 'p2'] });
    c2.completeConsultation('s1', 'k3', { rating: 4, addOns: ['p1', 'p2'] });
    const counts = statsOps();
    expect(counts).toHaveLength(1);
    expect(Object.keys(counts[0].ops[0].data)).toContain('addOnsCountedAt');
  });
});

describe('cancel is safe from a session wipe (code F12)', () => {
  beforeEach(() => {
    commits.length = 0;
    user = { uid: 'barber1', isAnonymous: false };
    cached = null;
  });

  it('cancels a draft quietly', async () => {
    const c = await freshConsultations();
    cached = { id: 'k1', status: 'draft' };
    await expect(c.cancelConsultation('s1', 'k1')).resolves.toBe(true);
    expect(commits[0].ops[0].data.status).toBe('cancelled');
    expect(commits[0].opts.quietDenied).toBe(true);
  });

  it('leaves an approved consultation alone (this page or this phone knows it)', async () => {
    const c = await freshConsultations();
    c.approveConsultation('s1', 'k1', { params: { styleId: 'goatee' } });
    commits.length = 0;
    await expect(c.cancelConsultation('s1', 'k1')).resolves.toBe(false);
    cached = { id: 'k9', status: 'approved' };
    await expect(c.cancelConsultation('s1', 'k9')).resolves.toBe(false);
    expect(commits).toHaveLength(0);
  });

  it('never throws: signed out, bad ids, or a write that cannot start', async () => {
    const c = await freshConsultations();
    user = null;
    await expect(c.cancelConsultation('s1', 'k1')).resolves.toBe(false);
    user = { uid: 'barber1', isAnonymous: false };
    await expect(c.cancelConsultation('', 'k1')).resolves.toBe(false);
    await expect(c.cancelConsultation('s1', null)).resolves.toBe(false);
  });
});
