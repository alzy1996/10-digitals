// Chair / home session state (ARCHITECTURE 2). Everything about the customer in the
// chair lives here, in memory: photos (shots), the face profile, answers, saved looks,
// the approval and the Cut Card. Photos never leave this phone.
//
// Session wipe (PRD 8.5): "Next customer" (wipe('next')) or 10 minutes without a tap
// or key press (wipe('idle')) drops every photo from memory (canvases shrunk to 0x0,
// object URLs revoked) and clears the IndexedDB 'session' store. Before/after photos
// survive only in the 'saved' store, and only when the customer agreed (keepPhotos).
//
// The state transitions are a pure reducer (sessionReducer) so they are tested in node.
// A small snapshot without any image (client, answers, looks without thumbnails, the
// approval and the Cut Card) is kept in the 'session' store so a reload in the middle
// of a consultation (for example iOS reloading the PWA after WhatsApp) does not lose
// the Cut Card; it expires with the same 10-minute idle rule.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '../config/app.js';
import { STORES, idbClearStore, idbDelete, idbGet, idbPut, pruneSaved, saveBeforeAfter as idbSaveBeforeAfter } from '../lib/idb.js';

export const SHOT_IDS = Object.freeze(['front', 'left', 'right', 'chinUp']);
export const OVERRIDE_KEYS = Object.freeze(['faceShape', 'undertone', 'ageBand', 'mst']);
export const ANSWER_KEYS = Object.freeze(['workRule', 'visitFrequency', 'grooming', 'occasion']);
export const SAFETY_KEYS = Object.freeze(['patchTest48h', 'metallicSaltProducts', 'pureHenna', 'irritationToday']);
export const ZONE_CONFIRM_LABELS = Object.freeze(['dense', 'medium', 'patchy', 'none']);
export const CAPTURE_MODES = Object.freeze(['full', 'quick']);
export const WIPE_REASONS = Object.freeze(['next', 'idle', 'manual']);

/** Same values as ZONE_CONFIRM_DENSITY in src/ai/analysis/profile.js (barber's zone confirmation). */
const ZONE_CONFIRM_DENSITY = Object.freeze({ dense: 85, medium: 60, patchy: 30, none: 0 });
const SNAPSHOT_KEY = 'snapshot';
const PERSIST_DELAY_MS = 400;
const IDLE_CHECK_MS = 15000;

/* ------------------------------------------------------------------ pure state */

export function initialSessionState() {
  return {
    client: null,
    captureMode: 'full',
    shots: { front: null, left: null, right: null, chinUp: null },
    whiteCard: null,
    profile: null,
    overrides: { faceShape: null, undertone: null, ageBand: null, mst: null, zones: {} },
    answers: { workRule: null, visitFrequency: null, grooming: null, occasion: null },
    ranked: [],
    activeParams: null,
    looks: [],
    favoriteLookId: null,
    approved: null,
    startedAt: null,
    lookCode: null,
    consultationId: null,
    aiResult: null,
    cutCard: null,
    keepPhotos: false,
    safety: { patchTest48h: null, metallicSaltProducts: null, pureHenna: null, irritationToday: null },
  };
}

function toValidDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Seconds from the start of the consultation to the approval, clamped to 0..3600. */
export function decisionSecondsBetween(startedAt, at) {
  const a = toValidDate(startedAt);
  const b = toValidDate(at);
  if (!a || !b) return 0;
  const s = Math.round((b.getTime() - a.getTime()) / 1000);
  return Math.min(LIMITS.decisionSecondsMax, Math.max(0, s));
}

function normalizeClient(c) {
  if (!c || typeof c !== 'object') return null;
  const id = typeof c.id === 'string' && c.id ? c.id : null;
  const displayName = typeof c.displayName === 'string' && c.displayName.trim() ? c.displayName.trim() : null;
  return { id, displayName, walkIn: Boolean(c.walkIn) || (!id && !displayName) };
}

/** true when the session holds anything about a customer (so a wipe has work to do). */
export function hasSessionData(s) {
  if (!s) return false;
  return Boolean(
    s.client ||
      SHOT_IDS.some((id) => s.shots && s.shots[id]) ||
      s.profile ||
      s.activeParams ||
      (s.looks && s.looks.length) ||
      s.approved ||
      s.lookCode ||
      s.consultationId ||
      s.aiResult ||
      s.cutCard ||
      s.startedAt,
  );
}

/**
 * Pure reducer for every session change. Actions carry their own time (`now`) and ids
 * so the reducer stays deterministic. Unknown actions and invalid values return the
 * same state object.
 */
export function sessionReducer(state, action) {
  const s = state || initialSessionState();
  const a = action || {};
  switch (a.type) {
    case 'setClient':
      return { ...s, client: normalizeClient(a.client) };
    case 'setCaptureMode':
      return CAPTURE_MODES.includes(a.mode) && a.mode !== s.captureMode ? { ...s, captureMode: a.mode } : s;
    case 'setShot': {
      if (!SHOT_IDS.includes(a.id)) return s;
      const shots = { ...s.shots, [a.id]: a.shot || null };
      const startedAt = s.startedAt || (a.shot ? toValidDate(a.now) || new Date() : null);
      return { ...s, shots, startedAt };
    }
    case 'clearShots':
      return { ...s, shots: { front: null, left: null, right: null, chinUp: null }, whiteCard: null };
    case 'setWhiteCard':
      return { ...s, whiteCard: a.whiteCard || null };
    case 'setProfile':
      return { ...s, profile: a.profile || null };
    case 'setOverride': {
      const key = String(a.key || '');
      if (key.startsWith('zones.')) {
        const zone = key.slice(6);
        if (!zone) return s;
        const zones = { ...s.overrides.zones };
        if (a.value === null || a.value === undefined) delete zones[zone];
        else if (ZONE_CONFIRM_LABELS.includes(a.value)) zones[zone] = a.value;
        else return s;
        return { ...s, overrides: { ...s.overrides, zones } };
      }
      if (key === 'zones') {
        const zones = {};
        for (const [z, v] of Object.entries(a.value || {})) if (ZONE_CONFIRM_LABELS.includes(v)) zones[z] = v;
        return { ...s, overrides: { ...s.overrides, zones } };
      }
      if (!OVERRIDE_KEYS.includes(key)) return s;
      return { ...s, overrides: { ...s.overrides, [key]: a.value === undefined ? null : a.value } };
    }
    case 'setAnswer':
      if (!ANSWER_KEYS.includes(a.key)) return s;
      return { ...s, answers: { ...s.answers, [a.key]: a.value === undefined ? null : a.value } };
    case 'setRanked':
      return { ...s, ranked: Array.isArray(a.ranked) ? a.ranked : [] };
    case 'setActiveParams':
      return { ...s, activeParams: a.params || null };
    case 'saveLook': {
      if (!a.look || !a.look.id || s.looks.length >= (a.max || LIMITS.maxLooks)) return s;
      return { ...s, looks: [...s.looks, a.look] };
    }
    case 'removeLook': {
      if (!s.looks.some((l) => l.id === a.id)) return s;
      return {
        ...s,
        looks: s.looks.filter((l) => l.id !== a.id),
        favoriteLookId: s.favoriteLookId === a.id ? null : s.favoriteLookId,
      };
    }
    case 'updateLook': {
      if (!s.looks.some((l) => l.id === a.id)) return s;
      const patch = { ...(a.patch || {}) };
      delete patch.id;
      return { ...s, looks: s.looks.map((l) => (l.id === a.id ? { ...l, ...patch } : l)) };
    }
    case 'setFavorite': {
      if (a.id === null || a.id === undefined) return { ...s, favoriteLookId: null };
      return s.looks.some((l) => l.id === a.id) ? { ...s, favoriteLookId: a.id } : s;
    }
    case 'approve': {
      const look = a.lookId ? s.looks.find((l) => l.id === a.lookId) : null;
      const params = look ? look.params : s.activeParams;
      if (!params) return s;
      const at = toValidDate(a.now) || new Date();
      return {
        ...s,
        approved: { lookId: look ? look.id : null, params, at, decisionSeconds: decisionSecondsBetween(s.startedAt, at) },
      };
    }
    case 'clearApproval':
      return s.approved ? { ...s, approved: null } : s;
    case 'setLookCode': {
      const lc = a.lookCode || null;
      const startedAt = s.startedAt || (lc ? toValidDate(a.now) || new Date() : null);
      return { ...s, lookCode: lc, startedAt };
    }
    case 'setConsultationId':
      return { ...s, consultationId: a.id || null };
    case 'setAiResult':
      return { ...s, aiResult: a.result || null };
    case 'setCutCard':
      return { ...s, cutCard: a.cutCard || null };
    case 'setKeepPhotos':
      return { ...s, keepPhotos: Boolean(a.value) };
    case 'setSafety':
      if (!SAFETY_KEYS.includes(a.key)) return s;
      return { ...s, safety: { ...s.safety, [a.key]: a.value === undefined ? null : a.value } };
    case 'restore':
      return restoreSnapshot(s, a.snapshot);
    case 'reset':
      return initialSessionState();
    default:
      return s;
  }
}

/** Result of saveLook for the current state: { ok, reason? }. */
export function canSaveLook(state, max = LIMITS.maxLooks) {
  if (!state || !Array.isArray(state.looks)) return { ok: true };
  return state.looks.length >= max ? { ok: false, reason: 'max' } : { ok: true };
}

/**
 * Overrides applied to a profile without the AI module (used until the facade's
 * applyOverrides is loaded): face shape, undertone, age band, MST and the barber's
 * zone confirmations. Grow-ability is recomputed only by applyOverrides.
 */
export function mergeOverrides(profile, overrides) {
  if (!profile) return profile;
  const o = overrides || {};
  const out = {
    ...profile,
    faceShape: profile.faceShape ? { ...profile.faceShape } : profile.faceShape,
    skin: profile.skin ? { ...profile.skin } : profile.skin,
    ageBand: profile.ageBand ? { ...profile.ageBand } : profile.ageBand,
    beard: profile.beard ? { ...profile.beard, zones: { ...(profile.beard.zones || {}) } } : profile.beard,
    overrides: { faceShape: null, undertone: null, ageBand: null, ...(profile.overrides || {}) },
  };
  if (o.faceShape && out.faceShape) {
    out.faceShape.top = o.faceShape;
    out.overrides.faceShape = o.faceShape;
  }
  if (o.undertone && out.skin) {
    out.skin.undertone = o.undertone;
    out.overrides.undertone = o.undertone;
  }
  if (o.ageBand) {
    out.ageBand = { band: o.ageBand, source: profile.ageBand ? profile.ageBand.source : 'none', confidence: 1 };
    out.overrides.ageBand = o.ageBand;
  }
  if (o.mst !== null && o.mst !== undefined && Number.isFinite(Number(o.mst)) && out.skin) {
    out.skin.mst = Math.min(10, Math.max(1, Math.round(Number(o.mst))));
  }
  if (o.zones && out.beard) {
    for (const [zone, label] of Object.entries(o.zones)) {
      const density = ZONE_CONFIRM_DENSITY[label];
      const z = out.beard.zones[zone];
      if (density === undefined || !z) continue;
      out.beard.zones[zone] = { ...z, density, confidence: 1, lengthMm: label === 'none' ? 0 : z.lengthMm };
    }
  }
  return out;
}

/** The part of the session that may be kept in IndexedDB: no canvas, no image, no thumbnail. */
export function snapshotOf(s) {
  return {
    client: s.client,
    captureMode: s.captureMode,
    whiteCard: s.whiteCard ? { rect: s.whiteCard.rect || null, gains: s.whiteCard.gains || null } : null,
    profile: s.profile,
    overrides: s.overrides,
    answers: s.answers,
    activeParams: s.activeParams,
    looks: s.looks.map((l) => ({ id: l.id, styleId: l.styleId, params: l.params, thumb: null, savedAt: l.savedAt || null })),
    favoriteLookId: s.favoriteLookId,
    approved: s.approved,
    startedAt: s.startedAt,
    lookCode: s.lookCode,
    consultationId: s.consultationId,
    cutCard: s.cutCard,
    keepPhotos: s.keepPhotos,
    safety: s.safety,
  };
}

/** Merge a stored snapshot into a fresh state (photos stay empty: they were never stored). */
export function restoreSnapshot(state, snap) {
  if (!snap || typeof snap !== 'object') return state;
  const base = initialSessionState();
  const pickObj = (v, d) => (v && typeof v === 'object' && !Array.isArray(v) ? v : d);
  const approved = snap.approved && snap.approved.params ? { ...snap.approved, at: toValidDate(snap.approved.at) || new Date() } : null;
  return {
    ...base,
    client: normalizeClient(snap.client),
    captureMode: CAPTURE_MODES.includes(snap.captureMode) ? snap.captureMode : base.captureMode,
    whiteCard: snap.whiteCard || null,
    profile: snap.profile || null,
    overrides: { ...base.overrides, ...pickObj(snap.overrides, {}), zones: { ...pickObj(snap.overrides && snap.overrides.zones, {}) } },
    answers: { ...base.answers, ...pickObj(snap.answers, {}) },
    activeParams: snap.activeParams || null,
    looks: Array.isArray(snap.looks) ? snap.looks.filter((l) => l && l.id).slice(0, LIMITS.maxLooks) : [],
    favoriteLookId: snap.favoriteLookId || null,
    approved,
    startedAt: toValidDate(snap.startedAt),
    lookCode: snap.lookCode || null,
    consultationId: snap.consultationId || null,
    cutCard: snap.cutCard || null,
    keepPhotos: Boolean(snap.keepPhotos),
    safety: { ...base.safety, ...pickObj(snap.safety, {}) },
  };
}

/** '/s/<id>/<sub>' or '/try/<id>/<sub>'; path('') is the mode's home. */
export function sessionPath(mode, shopId, sub = '') {
  const root = `${mode === 'home' ? '/try' : '/s'}/${encodeURIComponent(shopId || '')}`;
  const rest = String(sub || '').replace(/^\/+/, '');
  return rest ? `${root}/${rest}` : root;
}

/* ------------------------------------------------------------------ resources */

function isBlobUrl(u) {
  return typeof u === 'string' && u.startsWith('blob:');
}

function revoke(url) {
  if (!isBlobUrl(url)) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // already revoked
  }
}

function shrinkCanvas(c) {
  if (!c || typeof c !== 'object' || !('width' in c)) return;
  try {
    c.width = 0;
    c.height = 0;
  } catch {
    // detached or transferred canvas
  }
}

/** Free every photo the state holds: shot canvases (and their URLs), thumbnails, the AI result. */
export function releasePhotos(s) {
  if (!s) return;
  for (const id of SHOT_IDS) {
    const shot = s.shots && s.shots[id];
    if (!shot) continue;
    shrinkCanvas(shot.canvas);
    revoke(shot.url);
  }
  for (const l of s.looks || []) revoke(l.thumb);
  if (s.aiResult) revoke(s.aiResult.url);
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.toBlob !== 'function' || !canvas.width) {
      resolve(null);
      return;
    }
    try {
      canvas.toBlob((b) => resolve(b || null), 'image/jpeg', 0.9);
    } catch (err) {
      console.warn('session: photo could not be encoded', err);
      resolve(null);
    }
  });
}

async function toImageBlob(v) {
  if (!v) return null;
  if (typeof Blob !== 'undefined' && v instanceof Blob) return v;
  if (typeof v.toBlob === 'function') return canvasToBlob(v);
  if (v.blob) return toImageBlob(v.blob);
  if (v.canvas) return canvasToBlob(v.canvas);
  if (typeof v === 'string' && v.startsWith('data:')) {
    try {
      return await (await fetch(v)).blob();
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ provider */

const SessionContext = createContext(null);

export function SessionProvider({ mode = 'chair', shopId, children }) {
  const sessionMode = mode === 'home' ? 'home' : 'chair';
  const [state, setState] = useState(initialSessionState);
  const stateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  const [applyFn, setApplyFn] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const idleListenersRef = useRef(new Set());
  const extraUrlsRef = useRef(new Set());
  const savedIdsRef = useRef([]);
  const generationRef = useRef(0);
  const persistTimerRef = useRef(null);
  const lookSeqRef = useRef(0);

  const dispatch = useCallback((action) => {
    const prev = stateRef.current;
    const next = sessionReducer(prev, action);
    if (next !== prev) {
      stateRef.current = next;
      setState(next);
    }
    return next;
  }, []);

  const touch = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  /* ---- wipe */
  const wipe = useCallback(async (reason = 'manual') => {
    const s = stateRef.current;
    generationRef.current += 1;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    releasePhotos(s);
    for (const u of extraUrlsRef.current) revoke(u);
    extraUrlsRef.current.clear();
    const savedIds = savedIdsRef.current;
    savedIdsRef.current = [];
    stateRef.current = initialSessionState();
    setState(stateRef.current);
    lastActivityRef.current = Date.now();
    // Free GPU textures, the texture worker and the shared renderer that may hold the last photo.
    import('../ai/index.js')
      .then((m) => m.clearRenderCaches && m.clearRenderCaches())
      .catch(() => {});
    const jobs = [idbClearStore(STORES.session)];
    if (!s.keepPhotos) for (const id of savedIds) jobs.push(idbDelete(STORES.saved, id));
    await Promise.all(jobs);
    if (reason === 'idle') {
      for (const cb of [...idleListenersRef.current]) {
        try {
          cb(reason);
        } catch (err) {
          console.error('session: idle wipe listener failed', err);
        }
      }
    }
  }, []);

  const onIdleWipe = useCallback((cb) => {
    if (typeof cb !== 'function') return () => {};
    idleListenersRef.current.add(cb);
    return () => idleListenersRef.current.delete(cb);
  }, []);

  /* ---- restore the snapshot of an interrupted consultation (no photos) */
  useEffect(() => {
    let alive = true;
    const gen = generationRef.current;
    (async () => {
      try {
        const stored = await idbGet(STORES.session, SNAPSHOT_KEY);
        if (!alive || gen !== generationRef.current) return;
        const fresh =
          stored &&
          stored.mode === sessionMode &&
          stored.shopId === shopId &&
          Number.isFinite(stored.savedAt) &&
          Date.now() - stored.savedAt < LIMITS.sessionIdleMs;
        if (fresh && !hasSessionData(stateRef.current)) {
          dispatch({ type: 'restore', snapshot: stored.state });
          lastActivityRef.current = stored.savedAt;
        } else if (stored && !fresh) {
          await idbClearStore(STORES.session);
        }
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    if (sessionMode === 'chair') {
      pruneSaved(LIMITS.retentionDaysDefault).catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [dispatch, sessionMode, shopId]);

  /* ---- keep the snapshot up to date (debounced) */
  useEffect(() => {
    if (!hydrated) return undefined;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    if (!hasSessionData(state)) {
      idbDelete(STORES.session, SNAPSHOT_KEY).catch(() => {});
      return undefined;
    }
    const gen = generationRef.current;
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      if (gen !== generationRef.current) return;
      let snap;
      try {
        snap = snapshotOf(stateRef.current);
      } catch (err) {
        console.warn('session: snapshot failed', err);
        return;
      }
      idbPut(STORES.session, SNAPSHOT_KEY, { mode: sessionMode, shopId, savedAt: Date.now(), state: snap }).catch(() => {});
    }, PERSIST_DELAY_MS);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [state, hydrated, sessionMode, shopId]);

  /* ---- idle timer: 10 minutes without a tap or key press wipes the session */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const check = () => {
      if (Date.now() - lastActivityRef.current < LIMITS.sessionIdleMs) return;
      if (!hasSessionData(stateRef.current)) {
        lastActivityRef.current = Date.now();
        return;
      }
      wipe('idle');
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('pointerdown', onActivity, { capture: true, passive: true });
    window.addEventListener('keydown', onActivity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, IDLE_CHECK_MS);
    return () => {
      window.removeEventListener('pointerdown', onActivity, { capture: true });
      window.removeEventListener('keydown', onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [wipe]);

  /* ---- the facade's applyOverrides, loaded once a profile exists (the AI chunk is in use by then) */
  useEffect(() => {
    if (!state.profile || applyFn) return undefined;
    let alive = true;
    import('../ai/index.js')
      .then((m) => {
        if (alive && typeof m.applyOverrides === 'function') setApplyFn(() => m.applyOverrides);
      })
      .catch((err) => console.warn('session: applyOverrides not available, using the local merge', err));
    return () => {
      alive = false;
    };
  }, [state.profile, applyFn]);

  const effectiveProfile = useMemo(() => {
    if (!state.profile) return null;
    if (applyFn) {
      try {
        return applyFn(state.profile, state.overrides);
      } catch (err) {
        console.warn('session: applyOverrides failed, using the local merge', err);
      }
    }
    return mergeOverrides(state.profile, state.overrides);
  }, [state.profile, state.overrides, applyFn]);

  /* ---- actions */
  const actions = useMemo(() => {
    const now = () => new Date();
    return {
      path: (sub = '') => sessionPath(sessionMode, shopId, sub),
      setClient: (client) => dispatch({ type: 'setClient', client }),
      setCaptureMode: (m) => dispatch({ type: 'setCaptureMode', mode: m }),
      setShot: (id, shot) => {
        touch();
        dispatch({ type: 'setShot', id, shot, now: now() });
      },
      clearShots: () => dispatch({ type: 'clearShots' }),
      setWhiteCard: (wc) => dispatch({ type: 'setWhiteCard', whiteCard: wc }),
      setProfile: (p) => dispatch({ type: 'setProfile', profile: p }),
      setOverride: (key, value) => dispatch({ type: 'setOverride', key, value }),
      setAnswer: (key, value) => dispatch({ type: 'setAnswer', key, value }),
      setRanked: (list) => dispatch({ type: 'setRanked', ranked: list }),
      setActiveParams: (p) => dispatch({ type: 'setActiveParams', params: p }),
      saveLook: ({ styleId, params, thumb } = {}) => {
        const check = canSaveLook(stateRef.current);
        if (!check.ok) return check;
        if (!params) return { ok: false, reason: 'invalid' };
        lookSeqRef.current += 1;
        const id = `look-${Date.now().toString(36)}-${lookSeqRef.current}`;
        const look = { id, styleId: styleId || params.styleId || null, params, thumb: thumb || null, savedAt: now() };
        dispatch({ type: 'saveLook', look, max: LIMITS.maxLooks });
        return { ok: true, id };
      },
      removeLook: (id) => {
        const look = stateRef.current.looks.find((l) => l.id === id);
        if (look) revoke(look.thumb);
        dispatch({ type: 'removeLook', id });
      },
      updateLook: (id, patch) => {
        const look = stateRef.current.looks.find((l) => l.id === id);
        if (look && patch && 'thumb' in patch && patch.thumb !== look.thumb) revoke(look.thumb);
        dispatch({ type: 'updateLook', id, patch });
      },
      setFavorite: (id) => dispatch({ type: 'setFavorite', id }),
      approve: (lookId) => {
        touch();
        const next = dispatch({ type: 'approve', lookId, now: now() });
        return next.approved;
      },
      clearApproval: () => dispatch({ type: 'clearApproval' }),
      setLookCode: (lc) => dispatch({ type: 'setLookCode', lookCode: lc, now: now() }),
      setConsultationId: (id) => dispatch({ type: 'setConsultationId', id }),
      setAiResult: (r) => {
        const prev = stateRef.current.aiResult;
        if (prev && (!r || r.url !== prev.url)) revoke(prev.url);
        dispatch({ type: 'setAiResult', result: r });
      },
      setCutCard: (c) => dispatch({ type: 'setCutCard', cutCard: c }),
      setKeepPhotos: (b) => dispatch({ type: 'setKeepPhotos', value: b }),
      setSafety: (key, value) => dispatch({ type: 'setSafety', key, value }),
      wipe,
      touch,
      onIdleWipe,
      /** Revoke this object URL at the next wipe (screens that create photo URLs register them here). */
      trackObjectUrl: (url) => {
        if (isBlobUrl(url)) extraUrlsRef.current.add(url);
        return url;
      },
      /**
       * Keep the before/after pair on this device when the customer agreed (keepPhotos)
       * and the session has a saved client. before defaults to the front shot; after is
       * a Blob, a canvas or { blob }. Resolves the saved id or null.
       */
      keepBeforeAfter: async ({ before, after } = {}) => {
        const s = stateRef.current;
        if (!s.keepPhotos || !s.client || !s.client.id) return null;
        const [b, a] = await Promise.all([toImageBlob(before || (s.shots.front && s.shots.front.canvas)), toImageBlob(after || s.aiResult)]);
        if (!b || !a) return null;
        const id = await idbSaveBeforeAfter(s.client.id, { before: b, after: a, at: (s.approved && s.approved.at) || now() });
        if (id) savedIdsRef.current.push(id);
        return id;
      },
    };
  }, [dispatch, onIdleWipe, sessionMode, shopId, touch, wipe]);

  const value = useMemo(
    () => ({
      mode: sessionMode,
      shopId,
      ...state,
      effectiveProfile,
      hydrated,
      hasData: hasSessionData(state),
      ...actions,
    }),
    [state, effectiveProfile, hydrated, actions, sessionMode, shopId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The chair / home session. Throws outside <SessionProvider>. */
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
