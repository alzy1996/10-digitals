// Booking requests (from Nail Mirror, now for every service): a customer at home
// sends the look she designed with a name or phone. The look only, never a photo.
import { collection, doc, onSnapshot, setDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, committed, updated, snapList, newId, clean } from './base.js';
import { currentUser } from './auth.js';
import { sanitizeSectionParams } from './consultations.js';
import { normalizeOmanPhone } from '../reports/csv.js';
import { REQUEST_STATUS, SECTIONS } from './schema.js';

export async function sendRequest(salonId, { section, params, customerName = '', customerPhone = '', note = '', preferredDate = '', lang = 'ar' }) {
  if (!SECTIONS.includes(section)) throw new Error('bad-section');
  const phone = customerPhone ? normalizeOmanPhone(customerPhone) : '';
  if (customerPhone && !phone) throw new Error('bad-phone');
  const name = String(customerName).trim().slice(0, 60);
  if (!name && !phone) throw new Error('need-contact');
  const id = newId('r');
  const me = currentUser();
  await committed(
    setDoc(doc(db, 'salons', salonId, 'requests', id), clean({
      section,
      params: sanitizeSectionParams(section, params),
      customerName: name,
      customerPhone: phone,
      note: String(note).trim().slice(0, 300),
      preferredDate: String(preferredDate).slice(0, 40),
      status: 'new',
      lang,
      createdAt: serverTimestamp(),
      createdBy: me ? me.uid : 'public',
    })),
    'request',
  );
  return id;
}

export function watchRequests(salonId, cb) {
  return onSnapshot(query(collection(db, 'salons', salonId, 'requests'), orderBy('createdAt', 'desc')), (s) => cb(snapList(s)), () => cb([]));
}

export function setRequestStatus(salonId, id, status) {
  if (!REQUEST_STATUS.includes(status)) throw new Error('bad-status');
  fire(setDoc(doc(db, 'salons', salonId, 'requests', id), { status, ...updated() }, { merge: true }), 'request');
}
