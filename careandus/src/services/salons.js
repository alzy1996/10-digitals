// Salons, users, publicSalons. "Create your salon" bootstrap + seed (PRD 10.7).
import { doc, onSnapshot, writeBatch, serverTimestamp, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { created, updated, fire, committed, readDoc, pendingOf, newId, uid, clean } from './base.js';
import { SALON_SETTINGS_DEFAULT, SECTIONS_DEFAULT } from '../config/app.js';
import { SCHEMA_VERSION, SECTIONS } from './schema.js';
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
/** { hair, nails, beard } with only known keys, at least one on. */
export function cleanSections(s = SECTIONS_DEFAULT) {
  const out = {};
  for (const k of SECTIONS) out[k] = Boolean(s?.[k]);
  if (!SECTIONS.some((k) => out[k])) throw new Error('no-section');
  return out;
}

/** The services that are on, in the fixed order hair, nails, beard. */
export function sectionsOn(s) {
  return SECTIONS.filter((k) => s?.[k]);
}

export async function createSalon({ name, nameAr, whatsapp, ownerName, sections = SECTIONS_DEFAULT, withDemo = true }) {
  const me = uid();
  const on = cleanSections(sections);
  const salonId = newId('s');
  const batch = writeBatch(db);
  batch.set(doc(db, 'salons', salonId), clean({
    name: name || nameAr,
    nameAr: nameAr || name,
    languages: ['ar', 'en'],
    timezone: 'Asia/Muscat',
    schemaVersion: SCHEMA_VERSION,
    sections: on,
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
    sections: sectionsOn(on),
    ...created(),
  });
  batch.set(doc(db, 'users', me), { salonIds: [salonId], lastSalonId: salonId, updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, 'publicSalons', salonId), {
    name: name || nameAr,
    nameAr: nameAr || name,
    tryAtHome: SALON_SETTINGS_DEFAULT.tryAtHome,
    whatsapp: whatsapp || null,
    sections: on,
    ...updated(),
  });
  await committed(batch.commit(), 'salon');
  await seedCatalog(salonId);
  if (withDemo) await seedDemo(salonId);
  logAudit(salonId, 'salon.create', `salons/${salonId}`, { name: [null, name || nameAr] });
  return salonId;
}

export function updateSalon(salon, input) {
  const patch = input.sections ? { ...input, sections: cleanSections(input.sections) } : input;
  const next = clean({ ...patch, ...updated() });
  const ref = doc(db, 'salons', salon.id);
  fire(setDoc(ref, next, { merge: true }), 'salon');
  if ('name' in patch || 'nameAr' in patch || 'whatsapp' in patch || patch.sections || patch.settings?.tryAtHome !== undefined) {
    fire(setDoc(doc(db, 'publicSalons', salon.id), clean({
      name: patch.name ?? salon.name,
      nameAr: patch.nameAr ?? salon.nameAr,
      whatsapp: patch.whatsapp ?? salon.whatsapp ?? null,
      tryAtHome: patch.settings?.tryAtHome ?? salon.settings?.tryAtHome ?? true,
      sections: patch.sections ?? salon.sections,
      ...updated(),
    })), 'publicSalon');
  }
  logAudit(salon.id, 'salon.update', `salons/${salon.id}`, diffFields(salon, { ...salon, ...patch }));
}

export function updateSettings(salon, settingsPatch) {
  const settings = { ...SALON_SETTINGS_DEFAULT, ...salon.settings, ...settingsPatch };
  updateSalon(salon, { settings });
}
