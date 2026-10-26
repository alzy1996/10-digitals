// Consent log: who, when, what — never the photo.
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, uid } from './base.js';

export function logConsent(salonId, { type, clientId = null, consultationId = null, granted }) {
  return fire(
    addDoc(collection(db, 'salons', salonId, 'consents'), { type, clientId, consultationId, granted: Boolean(granted), at: serverTimestamp(), by: uid() }),
    'consent',
  );
}
