// Catalog: cuts, fringes, styles, shades, techniques (seeded from src/data) + signature looks.
// Never invents brands, codes, products or prices.
import { collection, doc, getDocs, onSnapshot, query, where, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, updated, snapList, clean, newId } from './base.js';
import { logAudit, diffFields } from './audit.js';
import cuts from '../data/cuts.json';
import fringes from '../data/fringes.json';
import styles from '../data/styles.json';
import shades from '../data/shades.json';
import techniques from '../data/techniques.json';

export const BASE = { cuts, fringes, styles, shades, techniques, looks: [] };
export const KINDS = ['cuts', 'fringes', 'styles', 'shades', 'techniques', 'looks'];

function withOwnerFields(item) {
  return { ...item, hidden: false, localFit: 0.5, ...updated() };
}

export async function seedCatalog(salonId) {
  const all = [];
  for (const kind of ['cuts', 'fringes', 'styles', 'shades', 'techniques']) for (const item of BASE[kind]) all.push([kind, item]);
  for (let i = 0; i < all.length; i += 400) {
    const batch = writeBatch(db);
    for (const [kind, item] of all.slice(i, i + 400)) batch.set(doc(db, 'salons', salonId, kind, item.id), withOwnerFields(item));
    await batch.commit();
  }
}

/** Merge the base JSON with the salon's Firestore docs (owner edits win). */
export function mergeCatalog(remote) {
  const out = {};
  for (const kind of KINDS) {
    const byId = new Map(BASE[kind].map((x) => [x.id, { hidden: false, localFit: 0.5, ...x }]));
    for (const d of remote[kind] || []) byId.set(d.id, { ...(byId.get(d.id) || {}), ...d });
    out[kind] = [...byId.values()];
  }
  return out;
}

export function watchCatalog(salonId, cb) {
  const remote = {};
  const unsubs = KINDS.map((kind) =>
    onSnapshot(
      collection(db, 'salons', salonId, kind),
      (s) => {
        remote[kind] = snapList(s);
        cb(mergeCatalog(remote));
      },
      () => {
        remote[kind] = [];
        cb(mergeCatalog(remote));
      },
    ),
  );
  cb(mergeCatalog(remote));
  return () => unsubs.forEach((u) => u());
}

/** Try at home: public read of non-hidden items. Falls back to the base JSON when offline. */
export async function publicCatalog(salonId) {
  const remote = {};
  try {
    await Promise.all(
      ['cuts', 'fringes', 'styles', 'shades', 'techniques'].map(async (kind) => {
        const s = await getDocs(query(collection(db, 'salons', salonId, kind), where('hidden', '==', false)));
        remote[kind] = snapList(s);
      }),
    );
    const merged = mergeCatalog(remote);
    // only items the salon publishes (present remotely) when the remote read worked
    for (const kind of ['cuts', 'fringes', 'styles', 'shades', 'techniques']) {
      if (remote[kind]?.length) {
        const ids = new Set(remote[kind].map((x) => x.id));
        merged[kind] = merged[kind].filter((x) => ids.has(x.id));
      }
    }
    return merged;
  } catch {
    return mergeCatalog({});
  }
}

export function setItem(salonId, kind, item, patch) {
  const next = clean({ ...item, ...patch, ...updated() });
  delete next._pending;
  fire(setDoc(doc(db, 'salons', salonId, kind, item.id), next), 'catalog');
  logAudit(salonId, `catalog.${kind}.update`, `salons/${salonId}/${kind}/${item.id}`, diffFields(item, { ...item, ...patch }));
}

export function setHidden(salonId, kind, item, hidden) {
  setItem(salonId, kind, item, { hidden });
}

export function setLocalFit(salonId, kind, item, localFit) {
  setItem(salonId, kind, item, { localFit: Math.max(0, Math.min(1, localFit)) });
}

export function saveSignatureLook(salonId, look) {
  const id = look.id || newId('look');
  const data = clean({
    id,
    name: look.name,
    params: look.params,
    signature: true,
    hidden: Boolean(look.hidden),
    ...updated(),
  });
  fire(setDoc(doc(db, 'salons', salonId, 'looks', id), data), 'look');
  logAudit(salonId, 'catalog.looks.save', `salons/${salonId}/looks/${id}`, { name: [null, look.name?.en || look.name?.ar || id] });
  return id;
}

export function deleteSignatureLook(salonId, id) {
  fire(deleteDoc(doc(db, 'salons', salonId, 'looks', id)), 'look');
  logAudit(salonId, 'catalog.looks.delete', `salons/${salonId}/looks/${id}`, {});
}
