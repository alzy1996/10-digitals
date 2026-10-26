// Shops: "Create your shop" bootstrap, shop and settings edits, the shop picker
// list, the public info doc for Try at home, and demo data.

import { Timestamp, collectionGroup, limit, onSnapshot, query, where } from 'firebase/firestore';
import { addDaysToKey, dayKey as muscatDayKey, muscatDayRange } from '../lib/time.js';
import STYLES from '../data/styles.json';
import { paramsFromStyle } from '../lib/look.js';
import { DEFAULT_SETTINGS, cleanText, autoId, diffFields, mergeSettings, sanitizeSettingsPatch } from './model.js';
import { DEMO_COUNTS, demoOps, reverseStats, shopOps } from './seed.js';
import { auditOp, statsOp, updatedStamp } from './ops.js';
import {
  LISTEN_OPTIONS,
  codedError,
  colRef,
  commitOps,
  listenDoc,
  readDoc,
  isDemoClosing,
  readQuery,
  recall,
  requireDb,
  requireShopId,
  requireUser,
  snapMeta,
} from './db.js';
import { DEMO_SHOP, demoMode } from '../lib/appMode.js';

export { DEFAULT_SETTINGS, mergeSettings };

function ownerNameOf(user) {
  const fromName = cleanText(user.displayName, 80);
  if (fromName) return fromName;
  const email = user.email || '';
  return cleanText(email.split('@')[0], 80) || 'Owner';
}

/**
 * Create a shop in one batch: shop doc (default settings + guard chart), my owner
 * staff doc, the public info doc, every catalog style, demo content and an audit
 * entry. No products are written (the owner adds them). Returns the new shopId at
 * once; the batch syncs in the background (works offline).
 */
export function createShop({ name, nameAr, whatsapp } = {}) {
  const user = requireUser();
  requireDb();
  const shopName = cleanText(name, 80);
  const shopNameAr = cleanText(nameAr, 80);
  if (!shopName && !shopNameAr) throw codedError('invalid-argument', 'name');
  const shopId = autoId();
  const styles = Array.isArray(STYLES) ? STYLES : [];
  const ops = [
    ...shopOps({
      shopId,
      uid: user.uid,
      ownerName: ownerNameOf(user),
      ownerEmail: user.email || null,
      name: shopName,
      nameAr: shopNameAr,
      whatsapp,
      styles,
    }),
    ...demoOps({ shopId, uid: user.uid, styles, paramsFromStyle }).ops,
    auditOp(shopId, user.uid, {
      action: 'shop.create',
      path: `shops/${shopId}`,
      changedFields: {
        name: [null, shopName || shopNameAr],
        nameAr: [null, shopNameAr || shopName],
        styles: [0, styles.length],
        demoClients: [0, DEMO_COUNTS.clients],
        demoConsultations: [0, DEMO_COUNTS.consultations],
      },
    }),
  ];
  commitOps(ops, 'shop.create');
  return shopId;
}

let demoShopId = null;

/**
 * Demo mode only: the first open makes the demo shop (createShop with DEMO_SHOP: the 34
 * styles, the demo clients and consultations) in this browser. Once per page load, so a
 * double effect never makes two shops. Returns the shopId.
 */
export function createDemoShop() {
  if (!demoMode) throw codedError('demo/off', 'createDemoShop is for demo mode only');
  if (!demoShopId) demoShopId = createShop({ ...DEMO_SHOP });
  return demoShopId;
}

/** cb(shop|null, meta). Readable by active staff of the shop. */
export function watchShop(shopId, cb, onError) {
  requireShopId(shopId);
  return listenDoc(`shops/${shopId}`, cb, onError, { remember: true });
}

/** Rename the shop (name, nameAr). Mirrors the names into the public info doc. */
export function updateShop(shopId, patch = {}) {
  requireShopId(shopId);
  const user = requireUser();
  const change = {};
  if (patch.name !== undefined) change.name = cleanText(patch.name, 80);
  if (patch.nameAr !== undefined) change.nameAr = cleanText(patch.nameAr, 80);
  if (change.name === '') throw codedError('invalid-argument', 'name');
  if (!Object.keys(change).length) return;
  const before = recall(`shops/${shopId}`) || {};
  commitOps(
    [
      { path: `shops/${shopId}`, data: { ...change, ...updatedStamp(user.uid) }, update: true },
      { path: `shops/${shopId}/public/info`, data: { ...change, ...updatedStamp(user.uid) }, merge: true },
      auditOp(shopId, user.uid, { action: 'shop.update', path: `shops/${shopId}`, changedFields: diffFields(before, change) }),
    ],
    'shop.update',
  );
}

/**
 * Change settings (guard chart, growth rate, language, AI preview and cap,
 * retention, Try at home, WhatsApp). Invalid values throw before anything is
 * written. tryAtHome, whatsapp and defaultLanguage are mirrored into the public
 * info doc (the Try at home page opens in the shop's language).
 */
export function updateSettings(shopId, patch = {}) {
  requireShopId(shopId);
  const user = requireUser();
  const { value, errors } = sanitizeSettingsPatch(patch);
  if (errors.length) throw codedError('invalid-argument', `settings: ${errors.join(', ')}`);
  const keys = Object.keys(value);
  if (!keys.length) return;
  const data = { ...updatedStamp(user.uid) };
  for (const k of keys) data[`settings.${k}`] = value[k];
  const ops = [{ path: `shops/${shopId}`, data, update: true }];
  const pub = {};
  if ('tryAtHome' in value) pub.tryAtHome = value.tryAtHome;
  if ('whatsapp' in value) pub.whatsapp = value.whatsapp;
  if ('defaultLanguage' in value) pub.defaultLanguage = value.defaultLanguage;
  if (Object.keys(pub).length) {
    ops.push({ path: `shops/${shopId}/public/info`, data: { ...pub, ...updatedStamp(user.uid) }, merge: true });
  }
  const before = mergeSettings(recall(`shops/${shopId}`)?.settings);
  ops.push(
    auditOp(shopId, user.uid, {
      action: 'settings.update',
      path: `shops/${shopId}`,
      changedFields: diffFields(before, value, 'settings.'),
    }),
  );
  commitOps(ops, 'settings.update');
}

/**
 * Shops I belong to (collection-group query on staff.uid):
 * cb([{ shopId, role, active, name, nameAr }], meta). Names come from each shop doc
 * (readable while my staff doc is active).
 */
export function watchMyShops(uid, cb, onError) {
  if (!uid) {
    cb([], { hasPendingWrites: false, fromCache: false });
    return () => {};
  }
  const q = query(collectionGroup(requireDb(), 'staff'), where('uid', '==', uid));
  let entries = [];
  let meta = { hasPendingWrites: false, fromCache: true };
  const names = new Map();
  const shopListeners = new Map();
  let closed = false;

  const emit = () => {
    if (closed) return;
    const list = entries
      .map((e) => ({ ...e, name: names.get(e.shopId)?.name ?? null, nameAr: names.get(e.shopId)?.nameAr ?? null }))
      .sort((a, b) => String(a.name || a.nameAr || a.shopId).localeCompare(String(b.name || b.nameAr || b.shopId)));
    cb(list, meta);
  };

  const syncShopListeners = () => {
    const wanted = new Set(entries.filter((e) => e.active).map((e) => e.shopId));
    for (const [shopId, unsub] of shopListeners) {
      if (!wanted.has(shopId)) {
        unsub();
        shopListeners.delete(shopId);
        names.delete(shopId);
      }
    }
    for (const shopId of wanted) {
      if (shopListeners.has(shopId)) continue;
      const unsub = listenDoc(
        `shops/${shopId}`,
        (shop) => {
          names.set(shopId, shop ? { name: shop.name || null, nameAr: shop.nameAr || null } : null);
          emit();
        },
        (err) => {
          if (err?.code !== 'permission-denied') console.warn('watchMyShops: shop name unavailable', err);
        },
        { remember: true },
      );
      shopListeners.set(shopId, unsub);
    }
  };

  const unsubStaff = onSnapshot(
    q,
    LISTEN_OPTIONS,
    (snap) => {
      meta = snapMeta(snap);
      entries = snap.docs
        .map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          const shopRef = d.ref.parent.parent;
          return shopRef ? { shopId: shopRef.id, role: data.role || null, active: data.active === true } : null;
        })
        .filter(Boolean);
      syncShopListeners();
      emit();
    },
    (err) => {
      if (isDemoClosing()) return;
      if (typeof onError === 'function') onError(err);
      else console.error('watchMyShops failed', err);
    },
  );

  return () => {
    closed = true;
    unsubStaff();
    for (const unsub of shopListeners.values()) unsub();
    shopListeners.clear();
  };
}

/**
 * Public info for Try at home: cb({ name, nameAr, tryAtHome, whatsapp, defaultLanguage? }|null, meta).
 * When Try at home is off the rules hide the doc from the public: cb(null, { denied: true }).
 */
export function watchPublicInfo(shopId, cb, onError) {
  requireShopId(shopId);
  return listenDoc(
    `shops/${shopId}/public/info`,
    cb,
    (err) => {
      if (err?.code === 'permission-denied') cb(null, { hasPendingWrites: false, fromCache: false, denied: true });
      else if (typeof onError === 'function') onError(err);
      else console.error('watchPublicInfo failed', err);
    },
    { retry: false },
  );
}

/** Add the demo clients and consultations again (all demo: true). Returns the counts. */
export function seedDemoData(shopId) {
  requireShopId(shopId);
  const user = requireUser();
  const guardChart = mergeSettings(recall(`shops/${shopId}`)?.settings).guardChart;
  const { ops } = demoOps({ shopId, uid: user.uid, styles: STYLES, paramsFromStyle, guardChart });
  ops.push(
    auditOp(shopId, user.uid, {
      action: 'demo.seed',
      path: `shops/${shopId}`,
      changedFields: { demoClients: [0, DEMO_COUNTS.clients], demoConsultations: [0, DEMO_COUNTS.consultations] },
    }),
  );
  commitOps(ops, 'demo.seed');
  return { ...DEMO_COUNTS };
}

const COUNTERS = ['consultations', 'approvals', 'totalDecisionSeconds', 'aiRenders', 'addOns'];

/**
 * Negative stats deltas limited so no counter goes below 0 (the rules refuse a
 * negative counter). `stats` is the day's current doc, or null when unknown (no
 * limit is applied then, as before).
 */
export function floorDeltas(deltas, stats) {
  if (!stats) return deltas;
  const out = { ...deltas, topStyles: {} };
  for (const k of COUNTERS) {
    const d = Number(deltas[k]);
    if (!Number.isFinite(d) || d >= 0) continue;
    const have = Math.max(0, Number(stats[k]) || 0);
    out[k] = Math.max(d, -have);
  }
  for (const [id, raw] of Object.entries(deltas.topStyles || {})) {
    const d = Number(raw);
    if (!Number.isFinite(d)) continue;
    out.topStyles[id] = d >= 0 ? d : Math.max(d, -Math.max(0, Number(stats.topStyles?.[id]) || 0));
  }
  return out;
}

/**
 * Delete every demo client and consultation and take their numbers back out of
 * dailyStats. Needs a read of the demo docs (works from the cache offline).
 * Resolves { deleted } once the deletions are queued.
 */
export async function deleteDemoData(shopId) {
  requireShopId(shopId);
  const user = requireUser();
  const [clients, consultations] = await Promise.all([
    readQuery(query(colRef(`shops/${shopId}/clients`), where('demo', '==', true))),
    readQuery(query(colRef(`shops/${shopId}/consultations`), where('demo', '==', true))),
  ]);
  const ops = [
    ...clients.map((c) => ({ path: `shops/${shopId}/clients/${c.id}`, delete: true })),
    ...consultations.map((c) => ({ path: `shops/${shopId}/consultations/${c.id}`, delete: true })),
  ];
  const reverse = reverseStats(consultations);
  const current = await Promise.all(
    Object.keys(reverse).map((key) => readDoc(`shops/${shopId}/dailyStats/${key}`).catch(() => null)),
  );
  Object.entries(reverse).forEach(([key, deltas], i) => {
    ops.push(statsOp(shopId, key, floorDeltas(deltas, current[i]), user.uid));
  });
  const deleted = clients.length + consultations.length;
  if (deleted) {
    ops.push(
      auditOp(shopId, user.uid, {
        action: 'demo.delete',
        path: `shops/${shopId}`,
        changedFields: { demoClients: [clients.length, 0], demoConsultations: [consultations.length, 0] },
      }),
    );
    commitOps(ops, 'demo.delete');
  }
  return { deleted, clients: clients.length, consultations: consultations.length };
}

const PURGE_LIMIT = 400;

/**
 * Owner only: delete consultations older than the shop's retention period
 * (settings.retentionDays, Muscat days) and clients not seen since then. Clients
 * who never visited (imported from CSV: lastVisitAt null) go when they were added
 * before the cutoff. Spark has no scheduled functions, so the owner's app runs
 * this (for example when the owner dashboard opens). Consent logs, the audit log
 * and daily totals are kept. Deletes at most 400 of each kind per call; `more` is
 * true when another call is needed.
 * Resolves { deleted, consultations, clients, cutoffKey, more }.
 */
export async function purgeExpiredData(shopId, { now = new Date() } = {}) {
  requireShopId(shopId);
  const user = requireUser();
  const days = mergeSettings(recall(`shops/${shopId}`)?.settings).retentionDays;
  const cutoffKey = addDaysToKey(muscatDayKey(now), -days);
  const cutoffAt = Timestamp.fromDate(muscatDayRange(cutoffKey).start);
  const clientsCol = colRef(`shops/${shopId}/clients`);
  const [consultations, seen, neverSeen] = await Promise.all([
    readQuery(query(colRef(`shops/${shopId}/consultations`), where('dayKey', '<', cutoffKey), limit(PURGE_LIMIT))),
    readQuery(query(clientsCol, where('lastVisitAt', '<', cutoffAt), limit(PURGE_LIMIT))),
    readQuery(query(clientsCol, where('lastVisitAt', '==', null), where('createdAt', '<', cutoffAt), limit(PURGE_LIMIT))),
  ]);
  const clients = [...new Map([...seen, ...neverSeen].map((c) => [c.id, c])).values()];
  const deleted = consultations.length + clients.length;
  if (deleted) {
    commitOps(
      [
        ...consultations.map((c) => ({ path: `shops/${shopId}/consultations/${c.id}`, delete: true })),
        ...clients.map((c) => ({ path: `shops/${shopId}/clients/${c.id}`, delete: true })),
        auditOp(shopId, user.uid, {
          action: 'data.purge',
          path: `shops/${shopId}`,
          changedFields: {
            consultations: [consultations.length, 0],
            clients: [clients.length, 0],
            olderThan: [null, cutoffKey],
          },
        }),
      ],
      'data.purge',
    );
  }
  return {
    deleted,
    consultations: consultations.length,
    clients: clients.length,
    cutoffKey,
    more: consultations.length === PURGE_LIMIT || seen.length === PURGE_LIMIT || neverSeen.length === PURGE_LIMIT,
  };
}
