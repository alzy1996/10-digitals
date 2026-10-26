// Products and services: shops/{shopId}/products/{productId}
// { name, nameAr, category, priceOmr (3 decimals), active, created/updated }.
// The only place prices live. Nothing is ever seeded: the owner types them in
// or imports the CSV template.

import { PRODUCT_CATEGORIES, autoId, diffFields, normalizeProduct, productKey } from './model.js';
import { auditOp, createdStamp, updatedStamp } from './ops.js';
import { codedError, colRef, commitOps, listenQuery, recall, requireShopId, requireUser } from './db.js';

function sortProducts(list) {
  return [...list].sort(
    (a, b) =>
      Number(b.active !== false) - Number(a.active !== false) ||
      PRODUCT_CATEGORIES.indexOf(a.category) - PRODUCT_CATEGORIES.indexOf(b.category) ||
      String(a.name || '').localeCompare(String(b.name || '')),
  );
}

/** cb([product], meta): active first, then by category and name. */
export function watchProducts(shopId, cb, onError) {
  requireShopId(shopId);
  return listenQuery(colRef(`shops/${shopId}/products`), cb, onError, {
    remember: true,
    rememberAs: `shops/${shopId}/products`,
    label: 'products',
    map: sortProducts,
  });
}

function invalid(errors) {
  const err = codedError('invalid-argument', `product: ${errors.join(', ')}`);
  err.fields = errors;
  return err;
}

/** Add one product. Throws (code invalid-argument, err.fields) on bad input. Returns the id. */
export function addProduct(shopId, p) {
  requireShopId(shopId);
  const me = requireUser();
  const { value, errors } = normalizeProduct(p);
  if (errors.length) throw invalid(errors);
  const id = autoId();
  const path = `shops/${shopId}/products/${id}`;
  commitOps(
    [
      { path, data: { ...value, ...createdStamp(me.uid), ...updatedStamp(me.uid) } },
      auditOp(shopId, me.uid, { action: 'product.add', path, changedFields: diffFields({}, value) }),
    ],
    'product.add',
  );
  return id;
}

/** Change name, nameAr, category, priceOmr or active. */
export function updateProduct(shopId, id, patch) {
  requireShopId(shopId);
  const me = requireUser();
  if (!id) throw codedError('invalid-argument', 'id');
  const { value, errors } = normalizeProduct(patch, { partial: true });
  if (errors.length) throw invalid(errors);
  if (!Object.keys(value).length) return;
  const path = `shops/${shopId}/products/${id}`;
  const before = recall(path) || {};
  commitOps(
    [
      { path, data: { ...value, ...updatedStamp(me.uid) }, update: true },
      auditOp(shopId, me.uid, { action: 'product.update', path, changedFields: diffFields(before, value) }),
    ],
    'product.update',
  );
}

/**
 * Import rows from the products CSV ({ name, nameAr, category, priceOmr, active }).
 * A row with the same name and category as a product already on this phone updates
 * it instead of adding a duplicate. Returns { imported, updated, skipped }.
 */
export function importProducts(shopId, rows) {
  requireShopId(shopId);
  const me = requireUser();
  const known = new Map();
  for (const p of recall(`shops/${shopId}/products`) || []) known.set(productKey(p), p.id);
  const ops = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const { value, errors } = normalizeProduct(row);
    if (errors.length) {
      skipped += 1;
      continue;
    }
    const key = productKey(value);
    const existing = known.get(key);
    if (existing) {
      ops.push({ path: `shops/${shopId}/products/${existing}`, data: { ...value, ...updatedStamp(me.uid) }, update: true });
      updated += 1;
    } else {
      const id = autoId();
      known.set(key, id);
      ops.push({ path: `shops/${shopId}/products/${id}`, data: { ...value, ...createdStamp(me.uid), ...updatedStamp(me.uid) } });
      imported += 1;
    }
  }
  if (ops.length) {
    ops.push(
      auditOp(shopId, me.uid, {
        action: 'product.import',
        path: `shops/${shopId}/products`,
        changedFields: { imported: [0, imported], updated: [0, updated], skipped: [0, skipped] },
      }),
    );
    commitOps(ops, 'product.import');
  }
  return { imported, updated, skipped };
}
