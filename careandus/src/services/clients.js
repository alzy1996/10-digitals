// Clients: labels only (PRD 10.2). The "reacted to dye / scalp sensitive" answer is never stored.
import { collection, doc, onSnapshot, setDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, created, updated, snapList, newId, uid, clean } from './base.js';
import { logAudit } from './audit.js';
import { pick, FIELDS } from './schema.js';

export function watchClients(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'clients'), (s) => cb(snapList(s).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))), () => cb([]));
}

export function searchClients(clients, q) {
  const s = q.trim().toLowerCase();
  if (!s) return clients.slice(0, 8);
  return clients.filter((c) => c.displayName?.toLowerCase().includes(s) || (c.phone || '').includes(s)).slice(0, 20);
}

export function createClient(salonId, { displayName, phone = null, demo = false }) {
  const id = newId('c');
  fire(setDoc(doc(db, 'salons', salonId, 'clients', id), { displayName: displayName.trim().slice(0, 80), phone: phone || null, demo, visits: 0, ...created() }), 'client');
  return id;
}

/**
 * Save profile labels with consent. `labels` comes from ai.profileLabels(profile).
 */
export function saveClientProfile(salonId, client, { labels, history, shrinkagePct, growthCmPerMonth }) {
  const data = clean({
    consent: { profile: true, at: serverTimestamp(), by: uid() },
    profile: pick(labels.profile, FIELDS.clientProfile),
    hair: pick(labels.hair, FIELDS.clientHair),
    history: pick(history, FIELDS.clientHistory),
    shrinkagePct: typeof shrinkagePct === 'number' ? shrinkagePct : undefined,
    growthCmPerMonth: typeof growthCmPerMonth === 'number' ? growthCmPerMonth : undefined,
    ...updated(),
  });
  fire(setDoc(doc(db, 'salons', salonId, 'clients', client.id), data, { merge: true }), 'clientProfile');
}

export function markVisit(salonId, clientId) {
  fire(setDoc(doc(db, 'salons', salonId, 'clients', clientId), { lastVisitAt: serverTimestamp(), visits: increment(1), ...updated() }, { merge: true }), 'clientVisit');
}

export function importClients(salonId, rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + 400)) {
      batch.set(doc(db, 'salons', salonId, 'clients', newId('c')), { displayName: r.displayName, phone: r.phone || null, demo: false, visits: 0, ...created() });
    }
    fire(batch.commit(), 'clientImport');
  }
  logAudit(salonId, 'client.import', `salons/${salonId}/clients`, { rows: [null, String(rows.length)] });
}
