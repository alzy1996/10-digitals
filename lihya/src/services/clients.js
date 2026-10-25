// Clients: shops/{shopId}/clients/{clientId}. Labels only: display name, optional
// phone, consent, coarse profile labels (face shape, MST, undertone, age band,
// grow-ability), learned growth rate and visit dates. Never an image, never
// measures or ratios.

import { Timestamp, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import {
  RECENT_CLIENTS_DEFAULT,
  SEARCH_LIMIT,
  autoId,
  cleanText,
  coarseLabels,
  learnGrowthRate,
  normalizePhone,
  searchKey,
  zoneLengths,
} from './model.js';
import { auditOp, createdStamp, updatedStamp } from './ops.js';
import { consentOp } from './consents.js';
import {
  codedError,
  colRef,
  commitOps,
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
  return { displayName: name, displayNameLower: searchKey(name) };
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

/**
 * Search by name prefix (Arabic letter variants and case ignored), or by phone when
 * the text is a phone number. Up to 10 results. Works offline from the cache.
 */
export async function searchClients(shopId, text) {
  requireShopId(shopId);
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const col = colRef(`shops/${shopId}/clients`);
  const digits = raw.replace(/[^\d٠-٩+]/g, '');
  if (digits.length >= 8) {
    const phone = normalizePhone(raw);
    if (phone.valid && phone.value) {
      return readQuery(query(col, where('phone', '==', phone.value), limit(SEARCH_LIMIT)));
    }
  }
  const key = searchKey(raw);
  if (!key) return [];
  const q = query(
    col,
    where('displayNameLower', '>=', key),
    where('displayNameLower', '<=', `${key}`),
    orderBy('displayNameLower'),
    limit(SEARCH_LIMIT),
  );
  return readQuery(q);
}

/** New client at the chair. Returns the id at once (offline-safe). */
export function createClient(shopId, { displayName, phone } = {}) {
  requireShopId(shopId);
  const me = requireUser();
  const id = autoId();
  commitOps(
    [
      {
        path: `shops/${shopId}/clients/${id}`,
        data: {
          ...nameFields(displayName),
          phone: phoneField(phone),
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
  if (patch.phone !== undefined) change.phone = phoneField(patch.phone);
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
        phone: phone.value,
        demo: false,
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
