// Nails (from Nail Mirror): the salon's own polishes, saved nail looks, and the
// designed manicure that consultations, Look Codes and booking requests store.
// A design is colours + polish ids + shape + art. Never a photo or a thumbnail.
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase.js';
import { fire, created, updated, snapList, clean, newId } from '../base.js';
import { logAudit, diffFields } from '../audit.js';
import { FIELDS, FINGER_KEYS, NAIL_FINISHES, NAIL_SHAPES, NAIL_TYPES, pick } from '../schema.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

function paint(p) {
  if (!p || !HEX.test(p.hex || '')) return null;
  return {
    polishId: ID.test(p.polishId || '') ? p.polishId : null,
    hex: p.hex,
    hex2: HEX.test(p.hex2 || '') ? p.hex2 : null,
    finish: NAIL_FINISHES.includes(p.finish) ? p.finish : 'creme',
  };
}

/** Only what the rules accept: unknown keys, brand names and images are dropped. */
export function sanitizeNailDesign(d = {}) {
  const perFinger = {};
  for (const f of FINGER_KEYS) {
    const p = paint(d.perFinger?.[f]);
    if (p) perFinger[f] = p;
  }
  const base = paint(d.base);
  if (!base) throw new Error('nail-design-base');
  const length = Number(d.length);
  return clean({
    base,
    perFinger,
    shape: NAIL_SHAPES.includes(d.shape) ? d.shape : 'natural',
    length: Number.isFinite(length) ? Math.max(-1, Math.min(3, length)) : 0,
    art: /^[a-z0-9-]{1,40}$/.test(d.art || '') ? d.art : 'none',
    artHex: HEX.test(d.artHex || '') ? d.artHex : null,
    type: NAIL_TYPES.includes(d.type) ? d.type : null,
  });
}

export function watchPolishes(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'nails_polishes'), (s) => cb(snapList(s)), () => cb([]));
}

/** Add or edit one of the salon's polishes. Prices and stock are the salon's own. */
export function savePolish(salonId, polish) {
  const id = polish.id || newId('pol');
  const data = clean(pick(polish, FIELDS.nailPolish));
  if (!HEX.test(data.hex || '')) throw new Error('bad-hex');
  const stamped = polish.id ? { ...data, createdAt: polish.createdAt, createdBy: polish.createdBy, ...updated() } : { ...data, ...created() };
  fire(setDoc(doc(db, 'salons', salonId, 'nails_polishes', id), stamped), 'polish');
  logAudit(salonId, polish.id ? 'nails.polish.update' : 'nails.polish.create', `salons/${salonId}/nails_polishes/${id}`, diffFields(polish.id ? polish : {}, data));
  return id;
}

/** Try at home: the salon's visible polishes (public read needs hidden == false and tryAtHome on). */
export async function publicPolishes(salonId) {
  try {
    const s = await getDocs(query(collection(db, 'salons', salonId, 'nails_polishes'), where('hidden', '==', false)));
    return snapList(s).filter((p) => p.active !== false);
  } catch {
    return [];
  }
}

/** CSV import (rows already validated): one batch per 400 rows, one audit entry per import. */
export function importPolishes(salonId, rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + 400)) {
      const data = clean(pick(r, FIELDS.nailPolish));
      if (!HEX.test(data.hex || '')) continue;
      batch.set(doc(db, 'salons', salonId, 'nails_polishes', newId('pol')), { ...data, ...created() });
    }
    fire(batch.commit(), 'polishImport');
  }
  logAudit(salonId, 'nails.polish.import', `salons/${salonId}/nails_polishes`, { rows: [null, String(rows.length)] });
}

export function deletePolish(salonId, id) {
  fire(deleteDoc(doc(db, 'salons', salonId, 'nails_polishes', id)), 'polish');
  logAudit(salonId, 'nails.polish.delete', `salons/${salonId}/nails_polishes/${id}`, {});
}

export function watchNailLooks(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'nails_looks'), (s) => cb(snapList(s)), () => cb([]));
}

export function saveNailLook(salonId, look) {
  const id = look.id || newId('nlook');
  const base = clean({ name: look.name || null, nameAr: look.nameAr || null, design: sanitizeNailDesign(look.design), hidden: Boolean(look.hidden), signature: Boolean(look.signature) });
  const data = look.id ? { ...base, createdAt: look.createdAt, createdBy: look.createdBy, ...updated() } : { ...base, ...created() };
  fire(setDoc(doc(db, 'salons', salonId, 'nails_looks', id), data), 'nailLook');
  logAudit(salonId, 'nails.look.save', `salons/${salonId}/nails_looks/${id}`, { name: [null, look.name || look.nameAr || id] });
  return id;
}

export function deleteNailLook(salonId, id) {
  fire(deleteDoc(doc(db, 'salons', salonId, 'nails_looks', id)), 'nailLook');
  logAudit(salonId, 'nails.look.delete', `salons/${salonId}/nails_looks/${id}`, {});
}
