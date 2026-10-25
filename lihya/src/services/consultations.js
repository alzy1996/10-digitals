// Consultations: shops/{shopId}/consultations/{id}
// { clientId, barberUid, styleId, params, cutCard, status 'draft'|'approved'|'done'|'cancelled',
//   startedAt, approvedAt, decisionSeconds (0..3600), aiPreviewUsed, addOns [productId],
//   rating, nextVisitDays, dayKey (Muscat), demo, created/updated }.
// dailyStats are bumped in the same batch: consultations on create; approvals,
// decision seconds and the style's count on the first approval; add-ons on done.

import { Timestamp, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { dayKey as muscatDayKey, toDate } from '../lib/time.js';
import { LIMITS } from '../config/app.js';
import { MAX_ADDONS, RANGE_LIMIT, autoId, clampInt, compactCutCard, sanitizeParams } from './model.js';
import { createdStamp, statsOp, updatedStamp } from './ops.js';
import { codedError, colRef, commitOps, listenQuery, readQuery, requireShopId, requireUser } from './db.js';

// What this phone knows about consultations it created or approved, so stats are
// counted once per consultation even when a screen calls approve twice.
const known = new Map();

const KNOWN_MAX = 500;

function keyOf(shopId, id) {
  return `${shopId}/${id}`;
}

function remember(key, info) {
  known.delete(key);
  known.set(key, info);
  if (known.size > KNOWN_MAX) known.delete(known.keys().next().value);
}

function validDate(value) {
  if (value === null || value === undefined) return null;
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addOnIds(list) {
  if (!Array.isArray(list)) return [];
  const ids = list.map((x) => (typeof x === 'string' ? x : x && typeof x.id === 'string' ? x.id : null)).filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_ADDONS).map((id) => id.slice(0, 64));
}

/**
 * Start a consultation (status draft) for a client (or a walk-in: clientId null).
 * Returns the id at once; the write syncs in the background.
 */
export function createConsultation(shopId, { clientId = null, styleId = null, params = null, startedAt = null } = {}) {
  requireShopId(shopId);
  const me = requireUser();
  const id = autoId();
  const started = validDate(startedAt) || new Date();
  const day = muscatDayKey(started);
  const cleanParams = sanitizeParams(params);
  const style = String(styleId || cleanParams?.styleId || '').slice(0, 80);
  const ops = [
    {
      path: `shops/${shopId}/consultations/${id}`,
      data: {
        clientId: typeof clientId === 'string' && clientId ? clientId : null,
        barberUid: me.uid,
        styleId: style,
        params: cleanParams,
        cutCard: null,
        status: 'draft',
        startedAt: Timestamp.fromDate(started),
        approvedAt: null,
        decisionSeconds: null,
        aiPreviewUsed: false,
        addOns: [],
        rating: null,
        nextVisitDays: null,
        dayKey: day,
        demo: false,
        ...createdStamp(me.uid),
      },
    },
    statsOp(shopId, day, { consultations: 1 }, me.uid),
  ];
  remember(keyOf(shopId, id), { dayKey: day, approved: false, done: false });
  commitOps(ops, 'consultation.create');
  if (typeof clientId === 'string' && clientId) {
    // Separate batch: a client deleted meanwhile must not cost the consultation itself.
    commitOps(
      [{ path: `shops/${shopId}/clients/${clientId}`, data: { lastVisitAt: serverTimestamp(), ...updatedStamp(me.uid) }, update: true }],
      'client.visit',
    );
  }
  return id;
}

/** Change the draft: styleId, params, clientId or aiPreviewUsed. */
export function updateConsultation(shopId, id, patch = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  const change = {};
  if (patch.params !== undefined) change.params = sanitizeParams(patch.params);
  if (patch.styleId !== undefined) change.styleId = String(patch.styleId || '').slice(0, 80);
  else if (change.params?.styleId) change.styleId = change.params.styleId;
  if (patch.clientId !== undefined) change.clientId = typeof patch.clientId === 'string' && patch.clientId ? patch.clientId : null;
  if (patch.aiPreviewUsed !== undefined) change.aiPreviewUsed = patch.aiPreviewUsed === true;
  if (!Object.keys(change).length) return;
  commitOps(
    [{ path: `shops/${shopId}/consultations/${id}`, data: { ...change, ...updatedStamp(me.uid) }, update: true }],
    'consultation.update',
  );
}

/**
 * The customer tapped "This is my look": status approved with the final params,
 * the Cut Card summary and the decision time (seconds, clamped to 0..3600).
 */
export function approveConsultation(shopId, id, { params, cutCard, decisionSeconds, aiPreviewUsed } = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  const cleanParams = sanitizeParams(params);
  const seconds = clampInt(decisionSeconds, 0, LIMITS.decisionSecondsMax, 0);
  const data = {
    status: 'approved',
    approvedAt: serverTimestamp(),
    decisionSeconds: seconds,
    cutCard: compactCutCard(cutCard),
    ...updatedStamp(me.uid),
  };
  if (cleanParams) {
    data.params = cleanParams;
    if (cleanParams.styleId) data.styleId = cleanParams.styleId;
  }
  if (aiPreviewUsed !== undefined) data.aiPreviewUsed = aiPreviewUsed === true;
  const ops = [{ path: `shops/${shopId}/consultations/${id}`, data, update: true }];
  const k = keyOf(shopId, id);
  const info = known.get(k) || { dayKey: muscatDayKey(), approved: false, done: false };
  if (!info.approved) {
    const styleId = data.styleId || null;
    ops.push(
      statsOp(
        shopId,
        info.dayKey,
        { approvals: 1, totalDecisionSeconds: seconds, topStyles: styleId ? { [styleId]: 1 } : {} },
        me.uid,
      ),
    );
    remember(k, { ...info, approved: true });
  }
  commitOps(ops, 'consultation.approve');
}

/** After the cut: status done with the rating (1..5), next visit (days) and add-ons sold. */
export function completeConsultation(shopId, id, { rating, nextVisitDays, addOns } = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  const ids = addOnIds(addOns);
  const data = {
    status: 'done',
    rating: clampInt(rating, 1, 5, null),
    nextVisitDays: clampInt(nextVisitDays, 0, 365, null),
    addOns: ids,
    ...updatedStamp(me.uid),
  };
  const ops = [{ path: `shops/${shopId}/consultations/${id}`, data, update: true }];
  const k = keyOf(shopId, id);
  const info = known.get(k) || { dayKey: muscatDayKey(), approved: true, done: false };
  if (!info.done && ids.length) ops.push(statsOp(shopId, info.dayKey, { addOns: ids.length }, me.uid));
  remember(k, { ...info, done: true });
  commitOps(ops, 'consultation.complete');
}

/** The customer left without a look. */
export function cancelConsultation(shopId, id) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  commitOps(
    [{ path: `shops/${shopId}/consultations/${id}`, data: { status: 'cancelled', ...updatedStamp(me.uid) }, update: true }],
    'consultation.cancel',
  );
}

function rangeQuery(shopId, startKey, endKey) {
  return query(
    colRef(`shops/${shopId}/consultations`),
    where('dayKey', '>=', startKey),
    where('dayKey', '<=', endKey),
    orderBy('dayKey'),
    limit(RANGE_LIMIT),
  );
}

function millis(v) {
  const d = validDate(v);
  return d ? d.getTime() : 0;
}

function shapeRange(list, includeDemo) {
  return list
    .filter((c) => includeDemo || c.demo !== true)
    .sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : millis(a.startedAt) - millis(b.startedAt)));
}

/**
 * Live consultations for Muscat days startKey..endKey (inclusive):
 * cb([consultation], meta), oldest first. Demo docs only with opts.includeDemo.
 */
export function watchConsultationsRange(shopId, startKey, endKey, cb, opts = {}, onError) {
  requireShopId(shopId);
  const includeDemo = Boolean(opts && opts.includeDemo);
  return listenQuery(rangeQuery(shopId, startKey, endKey), cb, onError || (opts && opts.onError), {
    label: 'consultations',
    map: (list) => shapeRange(list, includeDemo),
  });
}

/** One-time read of the same range (reports). Resolves [consultation]. */
export async function listConsultationsRange(shopId, startKey, endKey, opts = {}) {
  requireShopId(shopId);
  const list = await readQuery(rangeQuery(shopId, startKey, endKey));
  return shapeRange(list, Boolean(opts && opts.includeDemo));
}
