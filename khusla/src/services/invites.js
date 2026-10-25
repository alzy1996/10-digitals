import { collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, snapList, uid } from './base.js';
import { logAudit } from './audit.js';

export function watchInvites(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'invites'), (s) => cb(snapList(s)), () => cb([]));
}

export function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}

export function createInvite(salonId, email, role) {
  const e = email.trim().toLowerCase();
  if (!isEmail(e)) throw new Error('bad-email');
  if (!['manager', 'stylist'].includes(role)) throw new Error('bad-role');
  fire(setDoc(doc(db, 'salons', salonId, 'invites', e), { email: e, role, createdAt: serverTimestamp(), createdBy: uid() }), 'invite');
  logAudit(salonId, 'invite.create', `salons/${salonId}/invites/${e}`, { role: [null, role] });
  return `${location.origin}/join?salon=${encodeURIComponent(salonId)}`;
}

export function deleteInvite(salonId, email) {
  fire(deleteDoc(doc(db, 'salons', salonId, 'invites', email)), 'invite');
  logAudit(salonId, 'invite.delete', `salons/${salonId}/invites/${email}`, {});
}
