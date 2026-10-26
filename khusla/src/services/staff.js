import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, committed, readDoc, updated, created, snapList, uid } from './base.js';
import { currentUser } from './auth.js';
import { logAudit, diffFields } from './audit.js';

export function watchStaff(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'staff'), (s) => cb(snapList(s)), () => cb([]));
}

export function watchMe(salonId, cb) {
  return onSnapshot(doc(db, 'salons', salonId, 'staff', uid()), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null));
}

export async function getMyStaff(salonId) {
  try {
    const s = await readDoc(doc(db, 'salons', salonId, 'staff', uid()));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  } catch {
    return null;
  }
}

export function updateStaff(salonId, member, patch) {
  if (member.uid === uid() && patch.role && patch.role !== member.role) throw new Error('own-role');
  const next = { ...member, ...patch, ...updated() };
  delete next.id;
  delete next._pending;
  fire(setDoc(doc(db, 'salons', salonId, 'staff', member.uid), next), 'staff');
  logAudit(salonId, 'staff.update', `salons/${salonId}/staff/${member.uid}`, diffFields(member, { ...member, ...patch }));
}

export function removeStaff(salonId, member) {
  if (member.uid === uid()) throw new Error('own-remove');
  fire(deleteDoc(doc(db, 'salons', salonId, 'staff', member.uid)), 'staff');
  logAudit(salonId, 'staff.remove', `salons/${salonId}/staff/${member.uid}`, { role: [member.role, null] });
}

/** Join a salon from an invite link: create own staff doc with the invite's role. */
export async function acceptInvite(salonId) {
  const me = uid();
  const email = (currentUser()?.email || '').toLowerCase();
  const inv = await readDoc(doc(db, 'salons', salonId, 'invites', email));
  if (!inv.exists()) throw Object.assign(new Error('no-invite'), { code: 'no-invite' });
  const batch = writeBatch(db);
  batch.set(doc(db, 'salons', salonId, 'staff', me), {
    uid: me,
    name: currentUser()?.displayName || email,
    email,
    role: inv.data().role,
    active: true,
    ...created(),
  });
  batch.set(doc(db, 'users', me), { salonIds: arrayUnion(salonId), lastSalonId: salonId, updatedAt: serverTimestamp() }, { merge: true });
  await committed(batch.commit(), 'join');
  fire(deleteDoc(doc(db, 'salons', salonId, 'invites', email)), 'invite');
  return inv.data().role;
}
