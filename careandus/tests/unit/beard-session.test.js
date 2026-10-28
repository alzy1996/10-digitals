import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  initialSessionState,
  sessionReducer,
  canSaveLook,
  decisionSecondsBetween,
  hasSessionData,
  mergeOverrides,
  snapshotOf,
  restoreSnapshot,
  sessionPath,
  releasePhotos,
  cleanLookParams,
  cleanLookCode,
  cleanIssuedCode,
  sameValue,
} from '../../src/screens/beard/state/SessionContext.jsx';
import { useSession } from '../../src/screens/beard/state/session.js';
import { getStyle, paramsFromStyle, validateParams, MAX_ZONE_MM } from '../../src/ai/beard/lib/look.js';
import { findCode, lastCode, lookKey, rememberCode } from '../../src/screens/beard/home/codeCache.js';
import STYLES from '../../src/data/beard/styles.json';

const T0 = new Date('2026-10-25T06:00:00Z');
const later = (s) => new Date(T0.getTime() + s * 1000);
const run = (state, ...actions) => actions.reduce((s, a) => sessionReducer(s, a), state);
/** A complete, clean LookParams (the goatee's) under any style id. */
const params = (styleId) => ({ ...paramsFromStyle(getStyle('goatee')), styleId });
/** What an anonymous Try at home script could write into a Look Code. */
const forged = () => ({
  ...params('sunnah'),
  zones: { ...params('sunnah').zones, C: 1e9, J_L: -40, K_L: 'x' },
  lines: { cheek: 'faded', cheekOffset: 9, neckline: { evil: true }, sideburn: 'blended', edge: 'sharp', mustacheEdge: 'at' },
  finish: {},
  colorId: 7,
  mustacheId: 'walrus-xl',
  presetId: 'nope',
  greyTarget: 1e6,
  fadeStartMm: -5,
  shape: { chin: 'x'.repeat(5000), fadeB: [0, 9e9], lengthAdjustable: 'EAR', jFront: 'yes' },
  thumb: `data:image/jpeg;base64,${'A'.repeat(2000)}`,
});
const fakeCanvas = () => ({ width: 640, height: 480 });

afterEach(() => vi.restoreAllMocks());

describe('session reducer', () => {
  it('starts empty with every contract field', () => {
    const s = initialSessionState();
    expect(Object.keys(s).sort()).toEqual(
      [
        'activeParams',
        'aiResult',
        'answers',
        'approvals',
        'approved',
        'captureMode',
        'client',
        'consultationId',
        'cutCard',
        'favoriteLookId',
        'issuedCode',
        'keepPhotos',
        'keepProfileConsent',
        'lookCode',
        'looks',
        'overrides',
        'priceItems',
        'profile',
        'ranked',
        'safety',
        'shots',
        'startedAt',
        'whiteCard',
      ].sort(),
    );
    expect(s.shots).toEqual({ front: null, left: null, right: null, chinUp: null });
    expect(s.captureMode).toBe('full');
    expect(hasSessionData(s)).toBe(false);
    expect(typeof useSession).toBe('function');
  });

  it('sets startedAt on the first shot only', () => {
    let s = run(initialSessionState(), { type: 'setShot', id: 'front', shot: { canvas: fakeCanvas() }, now: T0 });
    expect(s.startedAt).toEqual(T0);
    s = run(s, { type: 'setShot', id: 'left', shot: { canvas: fakeCanvas() }, now: later(30) });
    expect(s.startedAt).toEqual(T0);
    expect(s.shots.left).toBeTruthy();
    expect(run(s, { type: 'setShot', id: 'nose', shot: {}, now: T0 })).toBe(s);
    s = run(s, { type: 'clearShots' });
    expect(s.shots.front).toBe(null);
    expect(s.startedAt).toEqual(T0);
  });

  it('sets startedAt when a Look Code loads', () => {
    const s = run(initialSessionState(), { type: 'setLookCode', lookCode: { code: 'ABC234', styleId: 'goatee', params: params('goatee') }, now: T0 });
    expect(s.startedAt).toEqual(T0);
    expect(s.lookCode.code).toBe('ABC234');
  });

  it('keeps at most 3 looks', () => {
    let s = initialSessionState();
    for (let i = 1; i <= 3; i++) {
      expect(canSaveLook(s)).toEqual({ ok: true });
      s = run(s, { type: 'saveLook', look: { id: `l${i}`, params: params('goatee') } });
    }
    expect(s.looks).toHaveLength(3);
    expect(canSaveLook(s)).toEqual({ ok: false, reason: 'max' });
    expect(run(s, { type: 'saveLook', look: { id: 'l4', params: params('goatee') } })).toBe(s);
  });

  it('updates, removes and favorites looks', () => {
    let s = run(
      initialSessionState(),
      { type: 'saveLook', look: { id: 'a', params: params('goatee') } },
      { type: 'saveLook', look: { id: 'b', params: params('balbo') } },
      { type: 'setFavorite', id: 'b' },
    );
    expect(s.favoriteLookId).toBe('b');
    expect(run(s, { type: 'setFavorite', id: 'zzz' }).favoriteLookId).toBe('b');
    s = run(s, { type: 'updateLook', id: 'a', patch: { id: 'hijack', thumb: 'data:x' } });
    expect(s.looks[0]).toMatchObject({ id: 'a', thumb: 'data:x' });
    s = run(s, { type: 'removeLook', id: 'b' });
    expect(s.looks.map((l) => l.id)).toEqual(['a']);
    expect(s.favoriteLookId).toBe(null);
  });

  it('approves a look with the decision time from the start', () => {
    let s = run(
      initialSessionState(),
      { type: 'setShot', id: 'front', shot: { canvas: fakeCanvas() }, now: T0 },
      { type: 'saveLook', look: { id: 'a', params: params('goatee') } },
    );
    s = run(s, { type: 'approve', lookId: 'a', now: later(74.4) });
    expect(s.approved).toEqual({ lookId: 'a', params: params('goatee'), at: later(74.4), decisionSeconds: 74 });
  });

  it('approves the active design when no saved look is named, and ignores an empty approval', () => {
    let s = run(initialSessionState(), { type: 'approve', lookId: null, now: T0 });
    expect(s.approved).toBe(null);
    s = run(s, { type: 'setActiveParams', params: params('khatt') });
    s = run(s, { type: 'approve', lookId: 'missing', now: T0 });
    expect(s.approved).toMatchObject({ lookId: null, params: params('khatt'), decisionSeconds: 0 });
    expect(run(s, { type: 'clearApproval' }).approved).toBe(null);
  });

  it('clamps decision seconds to 0..3600', () => {
    expect(decisionSecondsBetween(T0, later(5000))).toBe(3600);
    expect(decisionSecondsBetween(T0, later(-20))).toBe(0);
    expect(decisionSecondsBetween(null, T0)).toBe(0);
    expect(decisionSecondsBetween(T0.toISOString(), later(61))).toBe(61);
  });

  it('records overrides, zone confirmations, answers and safety answers', () => {
    let s = run(
      initialSessionState(),
      { type: 'setOverride', key: 'faceShape', value: 'square' },
      { type: 'setOverride', key: 'zones.K_L', value: 'patchy' },
      { type: 'setOverride', key: 'zones.K_R', value: 'thick' },
      { type: 'setOverride', key: 'eyeColor', value: 'blue' },
      { type: 'setAnswer', key: 'workRule', value: 'short' },
      { type: 'setAnswer', key: 'favouriteFood', value: 'x' },
      { type: 'setSafety', key: 'metallicSaltProducts', value: 'unsure' },
      { type: 'setSafety', key: 'other', value: true },
    );
    expect(s.overrides).toEqual({ faceShape: 'square', undertone: null, ageBand: null, mst: null, zones: { K_L: 'patchy' } });
    expect(s.answers.workRule).toBe('short');
    expect(s.answers).not.toHaveProperty('favouriteFood');
    expect(s.safety).toEqual({ patchTest48h: null, metallicSaltProducts: 'unsure', pureHenna: null, irritationToday: null });
    s = run(s, { type: 'setOverride', key: 'zones.K_L', value: null });
    expect(s.overrides.zones).toEqual({});
  });

  it('puts a removed look back at its place with the same id and the favourite (Undo)', () => {
    let s = run(
      initialSessionState(),
      { type: 'saveLook', look: { id: 'a', params: params('circle-beard'), thumb: 'data:a' } },
      { type: 'saveLook', look: { id: 'b', params: params('goatee'), thumb: 'data:b' } },
      { type: 'saveLook', look: { id: 'c', params: params('chin-strap'), thumb: 'data:c' } },
      { type: 'setFavorite', id: 'b' },
    );
    const removed = s.looks[1];
    s = run(s, { type: 'removeLook', id: 'b' });
    expect(s.favoriteLookId).toBe(null);
    s = run(s, { type: 'restoreLook', look: removed, index: 1, favorite: true });
    expect(s.looks.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(s.looks[1]).toBe(removed);
    expect(s.favoriteLookId).toBe('b');
    // Already there, or no room: nothing changes.
    expect(run(s, { type: 'restoreLook', look: removed, index: 0 })).toBe(s);
    const full = run(s, { type: 'removeLook', id: 'a' }, { type: 'saveLook', look: { id: 'd', params: params('goatee') } });
    expect(run(full, { type: 'restoreLook', look: s.looks[0], index: 0 })).toBe(full);
    // Out-of-range indexes clamp; no favourite flag keeps the current favourite.
    const back = run(s, { type: 'removeLook', id: 'c' }, { type: 'restoreLook', look: s.looks[2], index: 99 });
    expect(back.looks.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(back.favoriteLookId).toBe('b');
    const first = run(s, { type: 'removeLook', id: 'c' }, { type: 'restoreLook', look: s.looks[2], index: -3 });
    expect(first.looks.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(run(s, { type: 'removeLook', id: 'c' }, { type: 'restoreLook', look: { id: 'c', params: { styleId: 5 } }, index: 2 }).looks).toHaveLength(2);
  });

  it('keeps the Try at home code of the current look (no photo, no params copy)', () => {
    const ic = { code: 'GJVK55', key: 'goatee|{}', styleId: 'goatee', createdAt: T0.getTime(), expiresAt: later(86400).getTime(), extra: 'x' };
    // No look on screen (the session was wiped while the code was being made): nothing to keep.
    expect(run(initialSessionState(), { type: 'setIssuedCode', issuedCode: ic }).issuedCode).toBe(null);
    let s = run(initialSessionState(), { type: 'setActiveParams', params: params('goatee') }, { type: 'setIssuedCode', issuedCode: ic });
    expect(s.issuedCode).toEqual({ code: 'GJVK55', key: 'goatee|{}', styleId: 'goatee', createdAt: T0.getTime(), expiresAt: later(86400).getTime() });
    expect(hasSessionData(s)).toBe(true);
    expect(run(s, { type: 'setIssuedCode', issuedCode: { code: 'X', key: '' , expiresAt: 1 } })).toBe(s);
    expect(run(s, { type: 'setIssuedCode', issuedCode: { code: 'TOO-LONG-CODE-1', key: 'k', expiresAt: 1 } })).toBe(s);
    s = run(s, { type: 'setIssuedCode', issuedCode: null });
    expect(s.issuedCode).toBe(null);
    expect(cleanIssuedCode({ code: 'ABC234', key: 'k' })).toBe(null);
  });

  it('normalizes the client, capture mode, keepPhotos and resets', () => {
    let s = run(
      initialSessionState(),
      { type: 'setClient', client: { id: 'c1', displayName: '  Salim ' } },
      { type: 'setCaptureMode', mode: 'quick' },
      { type: 'setCaptureMode', mode: 'turbo' },
      { type: 'setKeepPhotos', value: 1 },
      { type: 'setConsultationId', id: 'k9' },
    );
    expect(s.client).toEqual({ id: 'c1', displayName: 'Salim', walkIn: false });
    expect(s.captureMode).toBe('quick');
    expect(s.keepPhotos).toBe(true);
    expect(run(s, { type: 'setClient', client: { walkIn: true } }).client).toEqual({ id: null, displayName: null, walkIn: true });
    expect(hasSessionData(s)).toBe(true);
    s = run(s, { type: 'reset' });
    expect(s).toEqual(initialSessionState());
  });
});

describe('profile overrides without the AI module', () => {
  const profile = {
    faceShape: { top: 'oval', scores: {} },
    skin: { mst: 5, undertone: 'warm' },
    ageBand: { band: '25-34', source: 'model', confidence: 0.7 },
    beard: { zones: { K_L: { density: 70, lengthMm: 3, confidence: 0.5 }, C: { density: 80, lengthMm: 4, confidence: 0.9 } }, growability: 75 },
    overrides: { faceShape: null, undertone: null, ageBand: null },
  };

  it('applies chips and zone confirmations without touching the original', () => {
    const out = mergeOverrides(profile, { faceShape: 'round', undertone: 'olive', ageBand: '35-44', mst: 12, zones: { K_L: 'none', C: 'medium', X: 'dense' } });
    expect(out.faceShape.top).toBe('round');
    expect(out.skin).toEqual({ mst: 10, undertone: 'olive' });
    expect(out.ageBand).toEqual({ band: '35-44', source: 'model', confidence: 1 });
    expect(out.overrides).toEqual({ faceShape: 'round', undertone: 'olive', ageBand: '35-44' });
    expect(out.beard.zones.K_L).toEqual({ density: 0, lengthMm: 0, confidence: 1 });
    expect(out.beard.zones.C).toEqual({ density: 60, lengthMm: 4, confidence: 1 });
    expect(profile.faceShape.top).toBe('oval');
    expect(profile.beard.zones.K_L.density).toBe(70);
    expect(mergeOverrides(null, {})).toBe(null);
  });
});

describe('snapshot and wipe helpers', () => {
  it('keeps no photo in the stored snapshot and restores the rest', () => {
    const canvas = fakeCanvas();
    let s = run(
      initialSessionState(),
      { type: 'setClient', client: { id: 'c1', displayName: 'Salim' } },
      { type: 'setShot', id: 'front', shot: { canvas, landmarks: [] }, now: T0 },
      { type: 'saveLook', look: { id: 'a', params: params('goatee'), thumb: 'data:image/jpeg;base64,AAAA' } },
      { type: 'setAiResult', result: { blob: {}, url: 'blob:x' } },
      { type: 'approve', lookId: 'a', now: later(40) },
      { type: 'setCutCard', cutCard: { rows: [] } },
    );
    const snap = snapshotOf(s);
    expect(snap).not.toHaveProperty('shots');
    expect(snap).not.toHaveProperty('aiResult');
    expect(snap.looks[0].thumb).toBe(null);
    expect(JSON.stringify(snap)).not.toMatch(/data:image|blob:/);
    expect(snap.issuedCode).toBe(null);
    const back = restoreSnapshot(initialSessionState(), structuredClone(snap));
    expect(back.shots).toEqual({ front: null, left: null, right: null, chinUp: null });
    expect(back.client).toEqual({ id: 'c1', displayName: 'Salim', walkIn: false });
    expect(back.approved).toMatchObject({ lookId: 'a', decisionSeconds: 40 });
    expect(back.approved.at).toBeInstanceOf(Date);
    expect(back.startedAt).toEqual(T0);
    expect(back.cutCard).toEqual({ rows: [] });
    expect(run(initialSessionState(), { type: 'restore', snapshot: snap }).looks).toHaveLength(1);
    expect(restoreSnapshot(s, null)).toBe(s);
  });

  it('drops canvases and revokes object URLs', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const front = fakeCanvas();
    const left = fakeCanvas();
    const s = run(
      initialSessionState(),
      { type: 'setShot', id: 'front', shot: { canvas: front, url: 'blob:shot' }, now: T0 },
      { type: 'setShot', id: 'left', shot: { canvas: left }, now: T0 },
      { type: 'saveLook', look: { id: 'a', params: params('goatee'), thumb: 'blob:thumb' } },
      { type: 'saveLook', look: { id: 'b', params: params('goatee'), thumb: 'data:image/png;base64,AA' } },
      { type: 'setAiResult', result: { blob: {}, url: 'blob:ai' } },
    );
    releasePhotos(s);
    expect(front).toEqual({ width: 0, height: 0 });
    expect(left).toEqual({ width: 0, height: 0 });
    expect(revoke.mock.calls.map((c) => c[0]).sort()).toEqual(['blob:ai', 'blob:shot', 'blob:thumb']);
  });

  it('restores a stored snapshot only through the clean look params', () => {
    const bad = forged();
    const snap = {
      client: { id: 'c1', displayName: 'Salim' },
      activeParams: bad,
      looks: [{ id: 'a', styleId: 'sunnah', params: bad }, { id: 'b', params: { styleId: 7 } }, { id: 'c', params: params('goatee') }],
      favoriteLookId: 'b',
      approved: { lookId: 'a', params: bad, at: T0.toISOString(), decisionSeconds: 30 },
      lookCode: { code: 'ZK4823', styleId: 'sunnah', params: bad },
      issuedCode: { code: 'HXAGFZ', key: 'k', styleId: 'goatee', createdAt: 1, expiresAt: 2 },
    };
    const back = restoreSnapshot(initialSessionState(), structuredClone(snap));
    expect(back.activeParams.zones.C).toBe(MAX_ZONE_MM);
    expect(back.activeParams).not.toHaveProperty('thumb');
    expect(back.looks.map((l) => l.id)).toEqual(['a', 'c']);
    expect(back.favoriteLookId).toBe(null);
    expect(back.approved.params.finish).toBe('matte');
    expect(back.approved.at).toEqual(T0);
    expect(back.lookCode.params.zones.C).toBe(MAX_ZONE_MM);
    expect(back.issuedCode).toEqual(snap.issuedCode);
    for (const p of [back.activeParams, back.looks[0].params, back.approved.params, back.lookCode.params]) expect(validateParams(p)).toEqual([]);
    const noLook = restoreSnapshot(initialSessionState(), { activeParams: { styleId: null }, approved: { params: 'x' }, lookCode: { code: 'A', params: null } });
    expect(noLook.activeParams).toBe(null);
    expect(noLook.approved).toBe(null);
    expect(noLook.lookCode).toBe(null);
  });

  it('builds mode paths', () => {
    expect(sessionPath('chair', 'salon1', 'capture')).toBe('/beard/capture');
    expect(sessionPath('chair', 'salon1', '')).toBe('/home');
    expect(sessionPath('home', 'salon1', '/studio')).toBe('/t/salon1/beard/studio');
    expect(sessionPath('home', 'salon1')).toBe('/t/salon1/beard');
  });
});

describe('look params entering the session (forged Look Codes, old snapshots)', () => {
  it('leaves every catalog look untouched (same object)', () => {
    for (const style of STYLES) {
      const p = paramsFromStyle(style);
      expect(cleanLookParams(p)).toBe(p);
    }
  });

  it('clamps lengths, drops unknown keys and replaces unknown ids', () => {
    const bad = forged();
    const p = cleanLookParams(bad);
    expect(p).not.toBe(bad);
    expect(validateParams(p)).toEqual([]);
    expect(p.zones.C).toBe(MAX_ZONE_MM);
    expect(p.zones.J_L).toBe(0);
    expect(p.zones.K_L).toBe(0);
    expect(p).not.toHaveProperty('thumb');
    expect(JSON.stringify(p)).not.toMatch(/data:image/);
    expect(p.lines).toEqual({ cheek: 'natural', cheekOffset: 1, neckline: '2f', necklineOffset: 0, sideburn: 'blended', edge: 'soft', mustacheEdge: 'at' });
    expect(p.finish).toBe('matte');
    expect(p.colorId).toBe('natural');
    expect(p.mustacheId).toBe(null);
    expect(p.presetId).toBe(null);
    expect(p.greyTarget).toBe(100);
    expect(p.fadeStartMm).toBe(0);
    expect(p.shape).toEqual({ chin: 'natural', jFront: false, mustacheFloating: false, fadeB: [0, MAX_ZONE_MM], flare: false, lengthAdjustable: null });
    // Cleaning is idempotent: the clean copy comes back as itself.
    expect(cleanLookParams(p)).toBe(p);
  });

  it('refuses values that are not a look', () => {
    for (const v of [null, undefined, 'goatee', 7, [], {}, { styleId: 7 }, { styleId: '  ' }, { styleId: 'x'.repeat(101) }, { styleId: null, zones: {} }]) {
      expect(cleanLookParams(v)).toBe(null);
    }
    expect(cleanLookParams({ styleId: ' goatee ' }).styleId).toBe('goatee');
    expect(cleanLookCode({ code: 'ABC234', params: { styleId: 7 } })).toBe(null);
    expect(cleanLookCode({ code: '', params: params('goatee') })).toBe(null);
    expect(cleanLookCode({ code: 'ABC234', styleId: 99, params: params('goatee') })).toEqual({ code: 'ABC234', styleId: 'goatee', params: params('goatee') });
  });

  it('cleans setActiveParams, saveLook, updateLook, setLookCode and approve', () => {
    const bad = forged();
    let s = run(initialSessionState(), { type: 'setActiveParams', params: bad });
    expect(s.activeParams.zones.C).toBe(MAX_ZONE_MM);
    expect(s.activeParams).not.toHaveProperty('thumb');
    // A value without a string style id is ignored; null clears.
    expect(run(s, { type: 'setActiveParams', params: { ...bad, styleId: 3 } })).toBe(s);
    expect(run(s, { type: 'setActiveParams', params: null }).activeParams).toBe(null);
    // The same clean object stays the same object (the Studio compares looks by reference).
    const clean = params('goatee');
    s = run(s, { type: 'setActiveParams', params: clean });
    expect(s.activeParams).toBe(clean);
    expect(run(s, { type: 'setActiveParams', params: clean })).toBe(s);

    s = run(s, { type: 'saveLook', look: { id: 'a', params: bad, thumb: 'data:t' } }, { type: 'saveLook', look: { id: 'b', params: { styleId: {} } } });
    expect(s.looks.map((l) => l.id)).toEqual(['a']);
    expect(s.looks[0].styleId).toBe('sunnah');
    expect(s.looks[0].params.finish).toBe('matte');
    expect(run(s, { type: 'saveLook', look: { id: 'a', params: clean } })).toBe(s);

    s = run(s, { type: 'updateLook', id: 'a', patch: { params: { ...clean, zones: { ...clean.zones, C: 5000 } } } });
    expect(s.looks[0].params.zones.C).toBe(MAX_ZONE_MM);
    expect(run(s, { type: 'updateLook', id: 'a', patch: { params: 'oops' } })).toBe(s);

    s = run(s, { type: 'setLookCode', lookCode: { code: 'BDTY45', styleId: 'sunnah', params: bad }, now: T0 });
    expect(s.lookCode.params.finish).toBe('matte');
    expect(s.lookCode).toEqual({ code: 'BDTY45', styleId: 'sunnah', params: s.lookCode.params });
    expect(run(s, { type: 'setLookCode', lookCode: { code: 'BDTY45', params: { finish: {} } } })).toBe(s);
    expect(run(s, { type: 'setLookCode', lookCode: null }).lookCode).toBe(null);

    // approve re-checks whatever it takes, even a value that skipped the actions.
    const sneaky = { ...initialSessionState(), activeParams: bad };
    const approved = run(sneaky, { type: 'approve', lookId: null, now: T0 }).approved;
    expect(approved.params.zones.C).toBe(MAX_ZONE_MM);
    expect(approved.params).not.toHaveProperty('thumb');
    expect(run({ ...initialSessionState(), activeParams: { styleId: 1 } }, { type: 'approve', now: T0 }).approved).toBe(null);
  });

  it('compares plain values deeply', () => {
    expect(sameValue({ a: [1, { b: 2 }], c: null }, { c: null, a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameValue(null, {})).toBe(false);
  });
});

describe('session lifetime helpers', () => {
  it('asks both approvals again after a new look is approved', () => {
    const s0 = run(initialSessionState(), { type: 'setActiveParams', params: params('goatee') }, { type: 'approve', now: T0 });
    const s1 = run(s0, { type: 'setApprovals', approvals: { customerAt: T0 } }, { type: 'setApprovals', approvals: { stylistAt: later(5) } });
    expect(s1.approvals.customerAt).toEqual(T0);
    expect(s1.approvals.stylistAt).toEqual(later(5));
    const s2 = run(s1, { type: 'approve', now: later(60) });
    expect(s2.approvals).toEqual({ customerAt: null, stylistAt: null });
  });

  it('keeps price items as a short list of unique ids', () => {
    const s = run(initialSessionState(), { type: 'setPriceItems', items: ['p1', 'p1', '', 7, 'p2'] });
    expect(s.priceItems).toEqual(['p1', 'p2']);
  });

  it('brings a Try at home code back after a reload (session snapshot to the code cache)', () => {
    const look = params('goatee');
    const key = lookKey('goatee', look);
    const entry = { code: 'GJVK55', key, styleId: 'goatee', createdAt: Date.now(), expiresAt: Date.now() + 86400000 };
    const s = run(initialSessionState(), { type: 'setActiveParams', params: look }, { type: 'setIssuedCode', issuedCode: entry });
    const back = restoreSnapshot(initialSessionState(), structuredClone(snapshotOf(s)));
    // Same look after the reload, so the same key finds the same code.
    expect(lookKey(back.activeParams.styleId, back.activeParams)).toBe(key);
    expect(back.issuedCode.code).toBe('GJVK55');
    expect(findCode('shop-reload', key)).toBe(null);
    expect(rememberCode('shop-reload', back.issuedCode)).toMatchObject({ code: 'GJVK55', key });
    expect(findCode('shop-reload', key).code).toBe('GJVK55');
    expect(lastCode('shop-reload').code).toBe('GJVK55');
    expect(rememberCode('shop-reload', { ...entry, expiresAt: Date.now() - 1 })).toBe(null);
    expect(rememberCode('', entry)).toBe(null);
  });
});
