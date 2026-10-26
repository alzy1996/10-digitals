// Clients: shops/{shopId}/clients/{clientId}. Labels only: display name, optional
// phone, consent, coarse profile labels (face shape, MST, undertone, age band,
// grow-ability), learned growth rate and visit dates. Never an image, never
// measures or ratios.

import { Timestamp, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import {
  RANGE_LIMIT,
  RECENT_CLIENTS_DEFAULT,
  SEARCH_LIMIT,
  autoId,
  cleanText,
  coarseLabels,
  digitsOf,
  learnGrowthRate,
  nameMatches,
  nameQueryToken,
  nameTokens,
  normalizePhone,
  phoneQueryToken,
  phoneTokens,
  searchKey,
  zoneLengths,
} from './model.js';
import { auditOp, createdStamp, updatedStamp } from './ops.js';
import { consentOp } from './consents.js';
import {
  codedError,
  colRef,
  commitOps,
  listenDoc,
  listenQuery,
  readDoc,
  readQuery,
  requireShopId,
  requireUser,
} from './db.js';
import { toDate } from '../lib/time.js';

function nameFields(displayName) {
  const name = cleanText(displayName, 80);
  if (!name) throw codedError('invalid-argument', 'displayName');
  return { displayName: name, displayNameLower: searchKey(name), searchTokens: nameTokens(name) };
}

function phoneField(raw) {
  const p = normalizePhone(raw);
  if (!p.valid) throw codedError('invalid-argument', 'phone');
  return p.value;
}

/** Most recent visitors first: cb([client], meta). n defaults to 20 (max 50). */
export function watchRecentClients(shopId, n, cb, onError) {
  requireShopId(shopId);
  const size = Math.min(50, Math.max(1, Number(n) || RECENT_CLIENTS_DEFAULT));
  const q = query(colRef(`shops/${shopId}/clients`), orderBy('lastVisitAt', 'desc'), limit(size));
  return listenQuery(q, cb, onError, { label: 'recentClients' });
}

/** One client document, live (labels, phone, learned growth rate). cb(client|null, meta). */
export function watchClient(shopId, id, cb, onError) {
  requireShopId(shopId);
  if (!id) throw codedError('invalid-argument', 'clientId');
  return listenDoc(`shops/${shopId}/clients/${id}`, cb, onError, { label: 'client' });
}

/** Every client of the shop (labels only), by name, for exports. Demo clients only when asked. */
export async function listClients(shopId, { includeDemo = false } = {}) {
  requireShopId(shopId);
  const q = query(colRef(`shops/${shopId}/clients`), orderBy('displayNameLower'), limit(RANGE_LIMIT));
  const list = await readQuery(q);
  return includeDemo ? list : list.filter((c) => !c.demo);
}

/** cb(true|false): whether any demo client or consultation is left (one cheap read each). */
export function watchDemoPresence(shopId, cb, onError) {
  requireShopId(shopId);
  const state = { clients: false, consultations: false, seen: 0 };
  const report = () => {
    if (state.seen >= 2) cb(state.clients || state.consultations);
  };
  const watch = (col) => {
    let first = true;
    return listenQuery(
      query(colRef(`shops/${shopId}/${col}`), where('demo', '==', true), limit(1)),
      (list) => {
        state[col] = list.length > 0;
        if (first) {
          first = false;
          state.seen += 1;
        }
        report();
      },
      onError,
      { label: `demoPresence.${col}` },
    );
  };
  const unsubs = [watch('clients'), watch('consultations')];
  return () => unsubs.forEach((u) => u && u());
}

// Candidates read per search before the on-device filter (multi-word names).
const SEARCH_READ = 40;

function byName(a, b) {
  return String(a.displayNameLower || '').localeCompare(String(b.displayNameLower || ''));
}

/** Wait for every read; fail only when nothing was found and a read failed. */
async function settle(reads, found) {
  const results = await Promise.allSettled(reads);
  if (!found.size) {
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
  return [...found.values()].sort(byName).slice(0, SEARCH_LIMIT);
}

/**
 * Search by the start of any word of the name (Arabic letter variants and case
 * ignored, "Al Balushi" or "سالم" find "Hamad Al Balushi" or "أحمد سالم"), or by
 * phone: a full number, or any 4 or more of its digits ("9123" finds +968 9123 4567).
 * Up to 10 results, by name. Works offline from the cache. Clients saved before
 * search tokens existed are still found by the start of their full name.
 */
export async function searchClients(shopId, text) {
  requireShopId(shopId);
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const col = colRef(`shops/${shopId}/clients`);
  const found = new Map();
  const add = (list) => {
    for (const c of list || []) if (c && c.id && !found.has(c.id)) found.set(c.id, c);
  };
  const reads = [];

  const digits = digitsOf(raw);
  const isNumber = /^[\s\d٠-٩۰-۹+()-]+$/.test(raw);
  if (isNumber && digits.length >= 4) {
    const token = phoneQueryToken(raw);
    if (token) reads.push(readQuery(query(col, where('phoneTokens', 'array-contains', token), limit(SEARCH_LIMIT))).then(add));
    if (digits.length >= 8) {
      const phone = normalizePhone(raw);
      if (phone.valid && phone.value) {
        reads.push(readQuery(query(col, where('phone', '==', phone.value), limit(SEARCH_LIMIT))).then(add));
      }
    }
    return settle(reads, found);
  }

  const key = searchKey(raw);
  if (!key) return [];
  const token = nameQueryToken(raw);
  if (token) {
    reads.push(
      readQuery(query(col, where('searchTokens', 'array-contains', token), limit(SEARCH_READ))).then((list) =>
        add(list.filter((c) => nameMatches(raw, c.displayName || c.displayNameLower))),
      ),
    );
  }
  // Older clients without tokens: the start of the whole name.
  reads.push(
    readQuery(
      query(
        col,
        where('displayNameLower', '>=', key),
        where('displayNameLower', '<=', `${key}\uf8ff`),
        orderBy('displayNameLower'),
        limit(SEARCH_LIMIT),
      ),
    ).then(add),
  );
  return settle(reads, found);
}

/** New client at the chair. Returns the id at once (offline-safe). */
export function createClient(shopId, { displayName, phone } = {}) {
  requireShopId(shopId);
  const me = requireUser();
  const id = autoId();
  const names = nameFields(displayName);
  const phoneValue = phoneField(phone);
  commitOps(
    [
      {
        path: `shops/${shopId}/clients/${id}`,
        data: {
          ...names,
          phone: phoneValue,
          phoneTokens: phoneTokens(phoneValue),
          demo: false,
          lastVisitAt: serverTimestamp(),
          ...createdStamp(me.uid),
        },
      },
    ],
    'client.create',
  );
  return id;
}

/** Change display name or phone. */
export function updateClient(shopId, id, patch = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  const change = {};
  if (patch.displayName !== undefined) Object.assign(change, nameFields(patch.displayName));
  if (patch.phone !== undefined) {
    change.phone = phoneField(patch.phone);
    change.phoneTokens = phoneTokens(change.phone);
  }
  if (!Object.keys(change).length) return;
  commitOps([{ path: `shops/${shopId}/clients/${id}`, data: { ...change, ...updatedStamp(me.uid) }, update: true }], 'client.update');
}

/**
 * Save the coarse profile labels after the customer agreed ("Save to client"):
 * writes profile + consent { profile: true, at, by } and logs a profile_save
 * consent in the same batch. Screens do not call logConsent for this.
 */
export function saveClientProfile(shopId, id, coarse) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  commitOps(
    [
      {
        path: `shops/${shopId}/clients/${id}`,
        data: {
          profile: coarseLabels(coarse),
          consent: { profile: true, at: serverTimestamp(), by: me.uid },
          ...updatedStamp(me.uid),
        },
        update: true,
      },
      consentOp(shopId, me.uid, { type: 'profile_save', clientId: id, granted: true }),
    ],
    'client.profile',
  );
}

/**
 * Record the beard lengths (mm per zone) the client leaves with at this visit.
 * Optional measuredMm = lengths measured at the start of this visit: compared with
 * the last recorded lengths, it teaches the client's growth rate (growthMmPerDay).
 * Returns a handled promise (the client read can need the cache or the network).
 */
export function recordVisitLengths(shopId, id, { zonesMm, at, measuredMm } = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  const when = at ? toDate(at) : new Date();
  const visitAt = Number.isNaN(when.getTime()) ? new Date() : when;
  const path = `shops/${shopId}/clients/${id}`;
  const lengths = zoneLengths(zonesMm);
  const run = (async () => {
    let growth;
    if (measuredMm) {
      try {
        const client = await readDoc(path);
        const prev = client?.lastLengths;
        const learned = learnGrowthRate(
          prev ? { zonesMm: prev.zonesMm, at: prev.at } : null,
          zoneLengths(measuredMm),
          visitAt,
          client?.growthMmPerDay ?? null,
        );
        if (learned !== null && learned !== (client?.growthMmPerDay ?? null)) growth = learned;
      } catch (err) {
        console.warn('recordVisitLengths: previous visit not available, growth not updated', err);
      }
    }
    const data = {
      lastLengths: { zonesMm: lengths, at: Timestamp.fromDate(visitAt) },
      lastVisitAt: Timestamp.fromDate(visitAt),
      ...updatedStamp(me.uid),
    };
    if (growth !== undefined) data.growthMmPerDay = growth;
    await commitOps([{ path, data, update: true }], 'client.visit');
  })();
  run.catch(() => {});
  return run;
}

/**
 * Import rows from the clients CSV ({ displayName, phone }); rows without a name,
 * with a bad phone, or repeating a phone already in the file are skipped.
 * Returns { imported, skipped }.
 */
export function importClients(shopId, rows) {
  requireShopId(shopId);
  const me = requireUser();
  const seen = new Set();
  const ops = [];
  let skipped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = cleanText(row?.displayName ?? row?.name, 80);
    const phone = normalizePhone(row?.phone);
    if (!name || !phone.valid || (phone.value && seen.has(phone.value))) {
      skipped += 1;
      continue;
    }
    if (phone.value) seen.add(phone.value);
    ops.push({
      path: `shops/${shopId}/clients/${autoId()}`,
      data: {
        displayName: name,
        displayNameLower: searchKey(name),
        searchTokens: nameTokens(name),
        phone: phone.value,
        phoneTokens: phoneTokens(phone.value),
        demo: false,
        // Never visited yet: the retention purge uses createdAt for these (shops.purgeExpiredData).
        lastVisitAt: null,
        ...createdStamp(me.uid),
      },
    });
  }
  const imported = ops.length;
  if (imported) {
    ops.push(
      auditOp(shopId, me.uid, {
        action: 'client.import',
        path: `shops/${shopId}/clients`,
        changedFields: { imported: [0, imported], skipped: [0, skipped] },
      }),
    );
    commitOps(ops, 'client.import');
  }
  return { imported, skipped };
}
