// Products and services: the salon's own list only (manual or CSV). Prices live only here.
import { collection, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, created, updated, snapList, newId } from './base.js';
import { logAudit, diffFields } from './audit.js';

export function watchProducts(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'products'), (s) => cb(snapList(s).sort((a, b) => (a.name || a.nameAr).localeCompare(b.name || b.nameAr))), () => cb([]));
}

export function saveProduct(salonId, product) {
  const id = product.id || newId('p');
  const data = {
    name: (product.name || '').trim(),
    nameAr: (product.nameAr || '').trim(),
    category: product.category,
    priceOmr: Math.round(Number(product.priceOmr) * 1000) / 1000,
    active: product.active !== false,
    ...(product.id ? { createdAt: product.createdAt, createdBy: product.createdBy, ...updated() } : created()),
  };
  fire(setDoc(doc(db, 'salons', salonId, 'products', id), data), 'product');
  logAudit(salonId, product.id ? 'product.update' : 'product.create', `salons/${salonId}/products/${id}`, diffFields(product.id ? product : {}, data));
  return id;
}

/** One audit entry per import (PRD 11.3). */
export function importProducts(salonId, rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + 400)) batch.set(doc(db, 'salons', salonId, 'products', newId('p')), { ...r, ...created() });
    fire(batch.commit(), 'productImport');
  }
  logAudit(salonId, 'product.import', `salons/${salonId}/products`, { rows: [null, String(rows.length)] });
}

export const ADD_ON_CATEGORIES = ['treatment', 'retail'];
export function countAddOns(productIds, products) {
  return productIds.filter((id) => ADD_ON_CATEGORIES.includes(products.find((p) => p.id === id)?.category)).length;
}
