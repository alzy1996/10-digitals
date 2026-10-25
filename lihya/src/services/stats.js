// Daily stats per Muscat day: shops/{shopId}/dailyStats/{dayKey}
// { consultations, approvals, totalDecisionSeconds, aiRenders, addOns, topStyles: { styleId: count } }.
// Counters use FieldValue.increment so several barbers' phones (and offline
// queues) add up correctly. consultations.js bumps consultations, approvals,
// decision seconds, top styles and add-ons itself; screens bump aiRenders
// (bumpAiRender) when an AI preview is rendered.

import { documentId, query, where } from 'firebase/firestore';
import { dayKey as muscatDayKey } from '../lib/time.js';
import { statsOp } from './ops.js';
import { colRef, commitOps, listenDoc, listenQuery, requireShopId, requireUser } from './db.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkKey(key) {
  if (!DAY_RE.test(String(key))) throw new Error(`Invalid dayKey: ${key}`);
  return key;
}

/** Stats doc with every counter present (zeros for a day without activity). */
export function normalizeStats(data, key) {
  const d = data || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const topStyles = {};
  for (const [id, n] of Object.entries(d.topStyles || {})) if (num(n) > 0) topStyles[id] = num(n);
  return {
    dayKey: key || d.id || null,
    consultations: num(d.consultations),
    approvals: num(d.approvals),
    totalDecisionSeconds: num(d.totalDecisionSeconds),
    aiRenders: num(d.aiRenders),
    addOns: num(d.addOns),
    topStyles,
  };
}

/** Add deltas to a day's counters (increments; negative values undo). */
export function bumpStats(shopId, dayKey, deltas) {
  requireShopId(shopId);
  const user = requireUser();
  const op = statsOp(shopId, checkKey(dayKey), deltas, user.uid);
  if (op) commitOps([op], 'stats.bump');
}

/** One AI Final Look render today (dashboard "AI previews used vs cap"). */
export function bumpAiRender(shopId) {
  bumpStats(shopId, muscatDayKey(), { aiRenders: 1 });
}

/** cb(stats) with zeros when the day has no doc yet. */
export function watchDailyStats(shopId, dayKey, cb, onError) {
  requireShopId(shopId);
  checkKey(dayKey);
  return listenDoc(`shops/${shopId}/dailyStats/${dayKey}`, (data, meta) => cb(normalizeStats(data, dayKey), meta), onError);
}

/** cb([stats]) for every day from startKey to endKey (inclusive) that has a doc, oldest first. */
export function watchStatsRange(shopId, startKey, endKey, cb, onError) {
  requireShopId(shopId);
  const q = query(
    colRef(`shops/${shopId}/dailyStats`),
    where(documentId(), '>=', checkKey(startKey)),
    where(documentId(), '<=', checkKey(endKey)),
  );
  return listenQuery(
    q,
    (list, meta) =>
      cb(
        list.map((d) => normalizeStats(d, d.id)).sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1)),
        meta,
      ),
    onError,
    { label: 'dailyStats' },
  );
}
