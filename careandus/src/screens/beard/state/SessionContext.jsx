// Beard chair / home session (LIHYA's SessionContext on Care & Us). Everything about the
// customer in the chair lives here, in memory only: photos (shots), the face profile, answers,
// saved looks, the approval and the Cut Card. Photos never leave this phone and are never
// written anywhere: leaving the beard screens (Next client, Add another service, the shared
// idle wipe) unmounts the provider, which shrinks every canvas and revokes every object URL.
//
// The state transitions are a pure reducer (sessionReducer) so they are tested in node.
// Every look that enters the session goes through cleanLookParams: lengths are clamped and
// unknown ids replaced, so a forged Look Code cannot put an image, an object or an absurd
// length on the Cut Card.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '../lib/config.js';
// The one shared table of the barber's zone confirmations (a dependency-free leaf module, not the AI facade).
import { ZONE_CONFIRM_DENSITY } from '../../../ai/beard/analysis/zoneConfirm.js';
import { useSession as useSharedSession } from '../../../hooks/useSession.jsx';
import {
  CHIN_SHAPES,
  COLOR_IDS,
  DEFAULT_COLOR_ID,
  DEFAULT_FINISH,
  FINISH_IDS,
  LINE_ENUMS,
  LINE_TYPES,
  LOOK_ZONES,
  MAX_ZONE_MM,
  MUSTACHE_IDS,
  PRESETS,
  clampParams,
  validateParams,
} from '../../../ai/beard/lib/look.js';

export const SHOT_IDS = Object.freeze(['front', 'left', 'right', 'chinUp']);
export const OVERRIDE_KEYS = Object.freeze(['faceShape', 'undertone', 'ageBand', 'mst']);
export const ANSWER_KEYS = Object.freeze(['workRule', 'visitFrequency', 'grooming', 'occasion']);
export const SAFETY_KEYS = Object.freeze(['patchTest48h', 'metallicSaltProducts', 'pureHenna', 'irritationToday']);
export const ZONE_CONFIRM_LABELS = Object.freeze(['dense', 'medium', 'patchy', 'none']);
export const CAPTURE_MODES = Object.freeze(['full', 'quick']);
export const WIPE_REASONS = Object.freeze(['next', 'idle', 'manual', 'newCustomer', 'lookCode']);

/** Longest style id kept (catalog ids and signature ids `sig-<base>-<6>` are far shorter). */
const MAX_STYLE_ID = 100;
/** Longest Look Code kept in the session. */
const MAX_CODE = 12;

/* ------------------------------------------------------------------ look params */

const DEFAULT_LOOK = clampParams({});
const PRESET_IDS = Object.freeze(PRESETS.map((p) => p.id));

/** Deep equality for plain JSON values (key order does not matter). */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
}

function fadePair(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const pair = v.map((x) => Number(x));
  if (!pair.every(Number.isFinite)) return null;
  return pair.map((x) => Math.round(Math.min(MAX_ZONE_MM, Math.max(0, x)) * 10) / 10);
}

/**
 * A LookParams that is safe to keep in the session, or null when the value is not a look
 * (not an object, or no string styleId). clampParams bounds every length, offset, grey and
 * fade value and drops unknown keys (an image data URL, for example); validateParams then
 * finds unknown ids, which fall back to the defaults (finish matte, color natural, the
 * default line, no mustache, no preset). A value that is already clean comes back as the
 * same object, so screens can keep comparing looks by reference.
 */
export function cleanLookParams(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (typeof p.styleId !== 'string') return null;
  const styleId = p.styleId.trim();
  if (!styleId || styleId.length > MAX_STYLE_ID) return null;
  const c = clampParams({ ...p, styleId });
  const shape = {
    ...c.shape,
    chin: CHIN_SHAPES.includes(c.shape.chin) ? c.shape.chin : DEFAULT_LOOK.shape.chin,
    fadeB: fadePair(c.shape.fadeB),
    lengthAdjustable: LOOK_ZONES.includes(c.shape.lengthAdjustable) ? c.shape.lengthAdjustable : null,
  };
  let out = { ...c, shape };
  if (validateParams(out).length) {
    const lines = { ...out.lines };
    for (const type of LINE_TYPES) if (!LINE_ENUMS[type].includes(lines[type])) lines[type] = DEFAULT_LOOK.lines[type];
    out = {
      ...out,
      lines,
      mustacheId: MUSTACHE_IDS.includes(out.mustacheId) ? out.mustacheId : null,
      colorId: COLOR_IDS.includes(out.colorId) ? out.colorId : DEFAULT_COLOR_ID,
      finish: FINISH_IDS.includes(out.finish) ? out.finish : DEFAULT_FINISH,
      presetId: PRESET_IDS.includes(out.presetId) ? out.presetId : null,
    };
    if (validateParams(out).length) return null;
  }
  return sameValue(out, p) ? p : out;
}

function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}

function finiteOrNull(v) {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * The Look Code loaded in the chair: { code, styleId, params } with clean params, or null
 * when it carries no usable look.
 */
export function cleanLookCode(lc) {
  if (!lc || typeof lc !== 'object') return null;
  const code = cleanText(lc.code, MAX_CODE);
  const params = cleanLookParams(lc.params);
  if (!code || !params) return null;
  return { code, styleId: cleanText(lc.styleId, MAX_STYLE_ID) || params.styleId, params };
}

/**
 * The Look Code made for this look on the customer's phone (Try at home, S22), kept so a
 * reload shows the same code: { code, key, styleId, createdAt, expiresAt } or null.
 * `key` identifies the look (style plus every parameter); no photo, no params copy.
 */
export function cleanIssuedCode(ic) {
  if (!ic || typeof ic !== 'object') return null;
  const code = cleanText(ic.code, MAX_CODE);
  const key = typeof ic.key === 'string' && ic.key ? ic.key : null;
  const expiresAt = finiteOrNull(ic.expiresAt);
  if (!code || !key || expiresAt === null) return null;
  return {
    code,
    key,
    styleId: cleanText(ic.styleId, MAX_STYLE_ID),
    createdAt: finiteOrNull(ic.createdAt),
    expiresAt,
  };
}

/** A saved look with clean params (thumb and savedAt kept), or null. */
function cleanLook(look) {
  if (!look || typeof look !== 'object' || typeof look.id !== 'string' || !look.id) return null;
  const params = cleanLookParams(look.params);
  if (!params) return null;
  const styleId = cleanText(look.styleId, MAX_STYLE_ID) || params.styleId;
  if (params === look.params && styleId === look.styleId) return look;
  return { ...look, styleId, params };
}

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
    // Care & Us: both must agree on the Cut Card (the customer, then the barber).
    approvals: { customerAt: null, stylistAt: null },
    // The salon's own products / services picked on the Cut Card (ids only).
    priceItems: [],
    startedAt: null,
    lookCode: null,
    // Try at home: the Look Code made on this phone for the current look (S22), so a reload shows the same code.
    issuedCode: null,
    consultationId: null,
    aiResult: null,
    cutCard: null,
    keepPhotos: false,
    // Customer's answer on the profile screen: save the coarse labels to his record (null = not asked).
    keepProfileConsent: null,
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
      s.issuedCode ||
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
    case 'setActiveParams': {
      if (a.params === null || a.params === undefined) return s.activeParams ? { ...s, activeParams: null } : s;
      const params = cleanLookParams(a.params);
      if (!params) return s;
      return params === s.activeParams ? s : { ...s, activeParams: params };
    }
    case 'saveLook': {
      if (s.looks.length >= (a.max || LIMITS.maxLooks)) return s;
      const look = cleanLook(a.look);
      if (!look || s.looks.some((l) => l.id === look.id)) return s;
      return { ...s, looks: [...s.looks, look] };
    }
    case 'restoreLook': {
      // Undo of a removal: the same look (same id) back at its old place, and the favourite back.
      if (s.looks.length >= (a.max || LIMITS.maxLooks)) return s;
      const look = cleanLook(a.look);
      if (!look || s.looks.some((l) => l.id === look.id)) return s;
      const at = Number.isInteger(a.index) ? Math.min(Math.max(0, a.index), s.looks.length) : s.looks.length;
      const looks = [...s.looks.slice(0, at), look, ...s.looks.slice(at)];
      return { ...s, looks, favoriteLookId: a.favorite ? look.id : s.favoriteLookId };
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
      if ('params' in patch) {
        const params = cleanLookParams(patch.params);
        if (!params) return s;
        patch.params = params;
      }
      if ('styleId' in patch && typeof patch.styleId !== 'string') delete patch.styleId;
      return { ...s, looks: s.looks.map((l) => (l.id === a.id ? { ...l, ...patch } : l)) };
    }
    case 'setFavorite': {
      if (a.id === null || a.id === undefined) return { ...s, favoriteLookId: null };
      return s.looks.some((l) => l.id === a.id) ? { ...s, favoriteLookId: a.id } : s;
    }
    case 'approve': {
      const look = a.lookId ? s.looks.find((l) => l.id === a.lookId) : null;
      const params = cleanLookParams(look ? look.params : s.activeParams);
      if (!params) return s;
      const at = toValidDate(a.now) || new Date();
      return {
        ...s,
        approved: { lookId: look ? look.id : null, params, at, decisionSeconds: decisionSecondsBetween(s.startedAt, at) },
        approvals: { customerAt: null, stylistAt: null },
      };
    }
    case 'setApprovals': {
      const patch = a.approvals || {};
      const next = { ...s.approvals };
      for (const k of ['customerAt', 'stylistAt']) if (k in patch) next[k] = toValidDate(patch[k]);
      return { ...s, approvals: next };
    }
    case 'setPriceItems':
      return { ...s, priceItems: Array.isArray(a.items) ? [...new Set(a.items.filter((x) => typeof x === 'string' && x))].slice(0, 20) : [] };
    case 'clearApproval':
      return s.approved ? { ...s, approved: null } : s;
    case 'setLookCode': {
      if (a.lookCode === null || a.lookCode === undefined) return { ...s, lookCode: null };
      const lc = cleanLookCode(a.lookCode);
      if (!lc) return s;
      const startedAt = s.startedAt || toValidDate(a.now) || new Date();
      return { ...s, lookCode: lc, startedAt };
    }
    case 'setIssuedCode': {
      if (a.issuedCode === null || a.issuedCode === undefined) return s.issuedCode ? { ...s, issuedCode: null } : s;
      // The code belongs to the look on screen: after a wipe (Start over) a late answer is dropped.
      if (!s.activeParams) return s;
      const ic = cleanIssuedCode(a.issuedCode);
      return ic ? { ...s, issuedCode: ic } : s;
    }
    case 'setConsultationId':
      return { ...s, consultationId: a.id || null };
    case 'setAiResult':
      return { ...s, aiResult: a.result || null };
    case 'setCutCard':
      return { ...s, cutCard: a.cutCard || null };
    case 'setKeepPhotos':
      return { ...s, keepPhotos: Boolean(a.value) };
    case 'setKeepProfileConsent':
      return { ...s, keepProfileConsent: a.value === null || a.value === undefined ? null : Boolean(a.value) };
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
    issuedCode: s.issuedCode,
    consultationId: s.consultationId,
    cutCard: s.cutCard,
    keepPhotos: s.keepPhotos,
    keepProfileConsent: s.keepProfileConsent,
    safety: s.safety,
  };
}

/** Merge a stored snapshot into a fresh state (photos stay empty: they were never stored). */
export function restoreSnapshot(state, snap) {
  if (!snap || typeof snap !== 'object') return state;
  const base = initialSessionState();
  const pickObj = (v, d) => (v && typeof v === 'object' && !Array.isArray(v) ? v : d);
  const approvedParams = snap.approved && typeof snap.approved === 'object' ? cleanLookParams(snap.approved.params) : null;
  const approved = approvedParams
    ? { ...snap.approved, params: approvedParams, at: toValidDate(snap.approved.at) || new Date() }
    : null;
  const looks = Array.isArray(snap.looks) ? snap.looks.map(cleanLook).filter(Boolean).slice(0, LIMITS.maxLooks) : [];
  return {
    ...base,
    client: normalizeClient(snap.client),
    captureMode: CAPTURE_MODES.includes(snap.captureMode) ? snap.captureMode : base.captureMode,
    whiteCard: snap.whiteCard || null,
    profile: snap.profile || null,
    overrides: { ...base.overrides, ...pickObj(snap.overrides, {}), zones: { ...pickObj(snap.overrides && snap.overrides.zones, {}) } },
    answers: { ...base.answers, ...pickObj(snap.answers, {}) },
    activeParams: cleanLookParams(snap.activeParams),
    looks,
    favoriteLookId: looks.some((l) => l.id === snap.favoriteLookId) ? snap.favoriteLookId : null,
    approved,
    startedAt: toValidDate(snap.startedAt),
    lookCode: cleanLookCode(snap.lookCode),
    issuedCode: cleanIssuedCode(snap.issuedCode),
    consultationId: snap.consultationId || null,
    cutCard: snap.cutCard || null,
    keepPhotos: Boolean(snap.keepPhotos),
    keepProfileConsent: snap.keepProfileConsent === true || snap.keepProfileConsent === false ? snap.keepProfileConsent : null,
    safety: { ...base.safety, ...pickObj(snap.safety, {}) },
  };
}

/**
 * Chair: '/beard/<sub>' and path('') is the stylist home ('/home').
 * Home: '/t/<salonId>/beard/<sub>' and path('') is the Try at home landing.
 */
export function sessionPath(mode, shopId, sub = '') {
  const rest = String(sub || '').replace(/^\/+/, '');
  if (mode === 'home') {
    const root = `/t/${encodeURIComponent(shopId || '')}/beard`;
    return rest ? `${root}/${rest}` : root;
  }
  return rest ? `/beard/${rest}` : '/home';
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

/* ------------------------------------------------------------------ provider */

const SessionContext = createContext(null);

/** The Look Code the shared session was started with (S16 Look Code entry), as a beard look. */
function lookCodeFromShared(shared) {
  if (!shared || shared.section !== 'beard' || !shared.lookCode) return null;
  return cleanLookCode({ code: shared.lookCode, params: shared.look });
}

function initialFor(mode, shared) {
  const s = initialSessionState();
  if (mode !== 'chair' || !shared) return s;
  const client = shared.client ? { id: shared.client.id || null, displayName: shared.client.displayName || null } : null;
  let next = sessionReducer(s, { type: 'setClient', client });
  const lc = lookCodeFromShared(shared);
  if (lc) {
    next = sessionReducer(next, { type: 'setLookCode', lookCode: lc, now: new Date() });
    next = sessionReducer(next, { type: 'setActiveParams', params: lc.params });
  }
  if (shared.consultationId && shared.section === 'beard') next = sessionReducer(next, { type: 'setConsultationId', id: shared.consultationId });
  return next;
}

export function SessionProvider({ mode = 'chair', shopId, children }) {
  const sessionMode = mode === 'home' ? 'home' : 'chair';
  const shared = useSharedSession();
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const [state, setState] = useState(() => initialFor(sessionMode, shared));
  const stateRef = useRef(state);
  const [applyFn, setApplyFn] = useState(null);
  const extraUrlsRef = useRef(new Set());
  const lookSeqRef = useRef(0);
  const mountedRef = useRef(false);

  const dispatch = useCallback((action) => {
    const prev = stateRef.current;
    const next = sessionReducer(prev, action);
    if (next !== prev) {
      stateRef.current = next;
      setState(next);
    }
    return next;
  }, []);

  /** The shared idle timer watches taps itself; nothing to record here. */
  const touch = useCallback(() => {}, []);

  /** Drop every photo the session holds in memory (canvases, object URLs, render caches). */
  const releaseMemory = useCallback((s) => {
    releasePhotos(s);
    for (const u of extraUrlsRef.current) revoke(u);
    extraUrlsRef.current.clear();
    // Free GPU textures, the texture worker and the shared renderer that may hold the last photo.
    import('../../../ai/beard/index.js')
      .then((m) => m.clearRenderCaches && m.clearRenderCaches())
      .catch(() => {});
  }, []);

  /* ---- wipe: this beard session only (the shared session is wiped by its own owner) */
  const wipe = useCallback(async () => {
    const s = stateRef.current;
    stateRef.current = initialSessionState();
    if (mountedRef.current) setState(stateRef.current);
    releaseMemory(s);
  }, [releaseMemory]);

  const onIdleWipe = useCallback(() => () => {}, []);

  /* ---- leaving the beard screens ends the session: photos go with it */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseMemory(stateRef.current);
    };
  }, [releaseMemory]);

  /* ---- the facade's applyOverrides, loaded once a profile exists (the AI chunk is in use by then) */
  useEffect(() => {
    if (!state.profile || applyFn) return undefined;
    let alive = true;
    import('../../../ai/beard/index.js')
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
      setShot: (id, shot) => dispatch({ type: 'setShot', id, shot, now: now() }),
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
        if (!cleanLookParams(params)) return { ok: false, reason: 'invalid' };
        lookSeqRef.current += 1;
        const id = `look-${Date.now().toString(36)}-${lookSeqRef.current}`;
        const look = { id, styleId: styleId || params.styleId || null, params, thumb: thumb || null, savedAt: now() };
        const next = dispatch({ type: 'saveLook', look, max: LIMITS.maxLooks });
        return next.looks.some((l) => l.id === id) ? { ok: true, id } : { ok: false, reason: 'invalid' };
      },
      removeLook: (id) => {
        const look = stateRef.current.looks.find((l) => l.id === id);
        // The thumbnail is revoked when the session ends, not now: Undo (restoreLook) shows it again.
        if (look && isBlobUrl(look.thumb)) extraUrlsRef.current.add(look.thumb);
        dispatch({ type: 'removeLook', id });
      },
      restoreLook: (look, index, favorite = false) => {
        const s = stateRef.current;
        if (!look || !look.id || !cleanLookParams(look.params)) return { ok: false, reason: 'invalid' };
        if (s.looks.some((l) => l.id === look.id)) return { ok: false, reason: 'exists' };
        const check = canSaveLook(s);
        if (!check.ok) return check;
        dispatch({ type: 'restoreLook', look, index, favorite: Boolean(favorite), max: LIMITS.maxLooks });
        return { ok: true, id: look.id };
      },
      updateLook: (id, patch) => {
        const look = stateRef.current.looks.find((l) => l.id === id);
        if (look && patch && 'thumb' in patch && patch.thumb !== look.thumb) revoke(look.thumb);
        dispatch({ type: 'updateLook', id, patch });
      },
      setFavorite: (id) => dispatch({ type: 'setFavorite', id }),
      approve: (lookId) => {
        const next = dispatch({ type: 'approve', lookId, now: now() });
        return next.approved;
      },
      clearApproval: () => dispatch({ type: 'clearApproval' }),
      setApprovals: (approvals) => dispatch({ type: 'setApprovals', approvals }),
      setPriceItems: (items) => dispatch({ type: 'setPriceItems', items }),
      setLookCode: (lc) => dispatch({ type: 'setLookCode', lookCode: lc, now: now() }),
      setIssuedCode: (ic) => dispatch({ type: 'setIssuedCode', issuedCode: ic }),
      setConsultationId: (id) => {
        dispatch({ type: 'setConsultationId', id });
        // The shared visit knows this service's consultation ("Add another service", one visit).
        const sh = sharedRef.current;
        if (sessionMode === 'chair' && sh && typeof sh.patch === 'function') sh.patch({ consultationId: id || null });
      },
      setAiResult: (r) => {
        const prev = stateRef.current.aiResult;
        if (prev && (!r || r.url !== prev.url)) revoke(prev.url);
        dispatch({ type: 'setAiResult', result: r });
      },
      setCutCard: (c) => dispatch({ type: 'setCutCard', cutCard: c }),
      setKeepPhotos: () => dispatch({ type: 'setKeepPhotos', value: false }),
      setKeepProfileConsent: (b) => dispatch({ type: 'setKeepProfileConsent', value: b }),
      setSafety: (key, value) => dispatch({ type: 'setSafety', key, value }),
      wipe,
      touch,
      onIdleWipe,
      /** Revoke this object URL when the session ends (screens that create photo URLs register them here). */
      trackObjectUrl: (url) => {
        if (isBlobUrl(url)) extraUrlsRef.current.add(url);
        return url;
      },
    };
  }, [dispatch, onIdleWipe, sessionMode, shopId, touch, wipe]);

  const value = useMemo(
    () => ({
      mode: sessionMode,
      shopId,
      ...state,
      visitId: shared ? shared.visitId || null : null,
      effectiveProfile,
      hydrated: true,
      hasData: hasSessionData(state),
      ...actions,
    }),
    [state, effectiveProfile, actions, sessionMode, shopId, shared],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The beard chair / home session. Throws outside <SessionProvider>. */
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside the beard SessionProvider');
  return ctx;
}
