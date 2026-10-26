// Salons, users, publicSalons. "Create your salon" bootstrap + seed (PRD 10.7).
import { doc, onSnapshot, writeBatch, serverTimestamp, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { created, updated, fire, committed, readDoc, pendingOf, newId, uid, clean } from './base.js';
import { SALON_SETTINGS_DEFAULT } from '../config/app.js';
import { SCHEMA_VERSION } from './schema.js';
import { seedCatalog } from './catalog.js';
import { seedDemo } from './demo.js';
import { logAudit, diffFields } from './audit.js';
import { currentUser } from './auth.js';

export function watchSalon(salonId, cb) {
  return onSnapshot(doc(db, 'salons', salonId), (s) => cb(s.exists() ? { id: s.id, ...s.data(), _pending: pendingOf(s) } : null), () => cb(null));
}

export function watchUser(cb) {
  return onSnapshot(doc(db, 'users', uid()), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}

export async function getPublicSalon(salonId) {
  const s = await readDoc(doc(db, 'publicSalons', salonId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

/** Names of the salons in the user's list (public profile first, salon doc as fallback). */
export async function getSalonSummaries(ids) {
  const list = await Promise.all(
    ids.map(async (id) => {
      try {
        const pub = await getPublicSalon(id);
        if (pub) return pub;
        const s = await readDoc(doc(db, 'salons', id));
        return s.exists() ? { id, name: s.data().name, nameAr: s.data().nameAr } : null;
      } catch {
        return null;
      }
    }),
  );
  return list.filter(Boolean);
}

export function setLastSalon(salonId) {
  return fire(setDoc(doc(db, 'users', uid()), { salonIds: arrayUnion(salonId), lastSalonId: salonId, updatedAt: serverTimestamp() }, { merge: true }), 'user');
}

/**
 * One batch: salon + owner staff + users doc + publicSalons. Then catalog seed and demo data.
 */
export async function createSalon({ name, nameAr, whatsapp, ownerName, withDemo = true }) {
  const me = uid();
  const salonId = newId('s');
  const batch = writeBatch(db);
  batch.set(doc(db, 'salons', salonId), clean({
    name: name || nameAr,
    nameAr: nameAr || name,
    languages: ['ar', 'en'],
    timezone: 'Asia/Muscat',
    schemaVersion: SCHEMA_VERSION,
    settings: { ...SALON_SETTINGS_DEFAULT },
    whatsapp: whatsapp || null,
    ...created(),
  }));
  batch.set(doc(db, 'salons', salonId, 'staff', me), {
    uid: me,
    name: ownerName || currentUser()?.displayName || currentUser()?.email || 'Owner',
    email: (currentUser()?.email || '').toLowerCase(),
    role: 'owner',
    active: true,
    ...created(),
  });
  batch.set(doc(db, 'users', me), { salonIds: [salonId], lastSalonId: salonId, updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, 'publicSalons', salonId), {
    name: name || nameAr,
    nameAr: nameAr || name,
    tryAtHome: SALON_SETTINGS_DEFAULT.tryAtHome,
    whatsapp: whatsapp || null,
    ...updated(),
  });
  await committed(batch.commit(), 'salon');
  await seedCatalog(salonId);
  if (withDemo) await seedDemo(salonId);
  logAudit(salonId, 'salon.create', `salons/${salonId}`, { name: [null, name || nameAr] });
  return salonId;
}

export function updateSalon(salon, patch) {
  const next = clean({ ...patch, ...updated() });
  const ref = doc(db, 'salons', salon.id);
  fire(setDoc(ref, next, { merge: true }), 'salon');
  if ('name' in patch || 'nameAr' in patch || 'whatsapp' in patch || patch.settings?.tryAtHome !== undefined) {
    fire(setDoc(doc(db, 'publicSalons', salon.id), clean({
      name: patch.name ?? salon.name,
      nameAr: patch.nameAr ?? salon.nameAr,
      whatsapp: patch.whatsapp ?? salon.whatsapp ?? null,
      tryAtHome: patch.settings?.tryAtHome ?? salon.settings?.tryAtHome ?? true,
      ...updated(),
    })), 'publicSalon');
  }
  logAudit(salon.id, 'salon.update', `salons/${salon.id}`, diffFields(salon, { ...salon, ...patch }));
}

export function updateSettings(salon, settingsPatch) {
  const settings = { ...SALON_SETTINGS_DEFAULT, ...salon.settings, ...settingsPatch };
  updateSalon(salon, { settings });
}
