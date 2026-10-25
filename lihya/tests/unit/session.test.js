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
} from '../../src/state/SessionContext.jsx';
import { useSession } from '../../src/hooks/useSession.js';

const T0 = new Date('2026-10-25T06:00:00Z');
const later = (s) => new Date(T0.getTime() + s * 1000);
const run = (state, ...actions) => actions.reduce((s, a) => sessionReducer(s, a), state);
const params = (styleId) => ({ styleId, zones: { C: 10 }, lines: {} });
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
        'approved',
        'captureMode',
        'client',
        'consultationId',
        'cutCard',
        'favoriteLookId',
        'keepPhotos',
        'lookCode',
        'looks',
        'overrides',
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

  it('builds mode paths', () => {
    expect(sessionPath('chair', 'shop1', 'capture')).toBe('/s/shop1/capture');
    expect(sessionPath('chair', 'shop1', '')).toBe('/s/shop1');
    expect(sessionPath('home', 'shop1', '/studio')).toBe('/try/shop1/studio');
    expect(sessionPath('home', 'shop1')).toBe('/try/shop1');
  });
});
