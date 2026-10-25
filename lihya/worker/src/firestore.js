// Membership and shop settings through the Firestore REST API, called with the
// user's own Firebase ID token (Authorization: Bearer) so the project's
// security rules decide what the Worker may read. No Admin SDK, no service
// account, no API key. When the app sends its App Check token
// (X-Firebase-AppCheck), it is passed on, so Firestore App Check enforcement
// can stay on.
//
// Reads (field masks keep the answers tiny):
//   shops/{shopId}/staff/{uid}  -> active, role       (200 + active == true required)
//   shops/{shopId}              -> settings.aiPreview, settings.aiDailyCap

import { HttpError } from './http.js';
import { UPSTREAM_TIMEOUT_MS } from './config.js';

export const FIRESTORE_ORIGIN = 'https://firestore.googleapis.com';

const SHOP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidShopId(shopId) {
  return typeof shopId === 'string' && SHOP_ID_PATTERN.test(shopId);
}

function isValidUidSegment(uid) {
  return typeof uid === 'string' && uid !== '' && uid !== '.' && uid !== '..' && !uid.includes('/') && uid.length <= 128;
}

/** REST URL of a document with an optional field mask. */
export function documentUrl(projectId, segments, fieldPaths = []) {
  const path = segments.map((s) => encodeURIComponent(s)).join('/');
  const base = `${FIRESTORE_ORIGIN}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
  if (fieldPaths.length === 0) return base;
  const query = fieldPaths.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  return `${base}?${query}`;
}

/** Firestore REST Value -> plain JS value. */
export function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('booleanValue' in value) return value.booleanValue === true;
  if ('integerValue' in value) {
    const n = Number(value.integerValue);
    return Number.isFinite(n) ? n : null;
  }
  if ('doubleValue' in value) {
    const n = Number(value.doubleValue);
    return Number.isFinite(n) ? n : null;
  }
  if ('stringValue' in value) return String(value.stringValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('mapValue' in value) return fromFields((value.mapValue && value.mapValue.fields) || {});
  if ('arrayValue' in value) {
    const items = (value.arrayValue && value.arrayValue.values) || [];
    return items.map((item) => fromValue(item));
  }
  return null;
}

export function fromFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = fromValue(value);
  return out;
}

async function getDocument(url, { idToken, appCheckToken, fetchImpl }) {
  const headers = { Authorization: `Bearer ${idToken}`, Accept: 'application/json' };
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (err) {
    throw new HttpError(502, 'upstream', { service: 'firestore' });
  }
  if (response.status !== 200) {
    if (response.body) await response.body.cancel().catch(() => {});
    return { status: response.status, data: null };
  }
  let doc;
  try {
    doc = await response.json();
  } catch (err) {
    throw new HttpError(502, 'upstream', { service: 'firestore' });
  }
  return { status: 200, data: fromFields(doc && doc.fields) };
}

function denialFor(status) {
  if (status === 401) return new HttpError(401, 'auth', { reason: 'firestore' });
  if (status === 403 || status === 404) return new HttpError(403, 'not_staff');
  return new HttpError(502, 'upstream', { service: 'firestore' });
}

/**
 * Check that the signed-in user is active staff of the shop and read the AI settings.
 * @returns {Promise<{ role: string|null, settings: { aiPreview: boolean, aiDailyCap: number|null } }>}
 * @throws {HttpError} 403 'not_staff', 401 'auth' (Firestore refused the token), 502 'upstream'
 */
export async function loadShopAccess({ projectId, shopId, uid, idToken, appCheckToken = null, fetchImpl = fetch }) {
  if (!isValidShopId(shopId)) throw new HttpError(400, 'bad_request', { field: 'shopId' });
  if (!isValidUidSegment(uid)) throw new HttpError(403, 'not_staff');
  const options = { idToken, appCheckToken, fetchImpl };
  const [staff, shop] = await Promise.all([
    getDocument(documentUrl(projectId, ['shops', shopId, 'staff', uid], ['active', 'role']), options),
    getDocument(documentUrl(projectId, ['shops', shopId], ['settings.aiPreview', 'settings.aiDailyCap']), options),
  ]);

  if (staff.status !== 200) throw denialFor(staff.status);
  if (staff.data.active !== true) throw new HttpError(403, 'not_staff');
  if (shop.status !== 200) throw denialFor(shop.status);

  const settings = shop.data.settings && typeof shop.data.settings === 'object' ? shop.data.settings : {};
  return {
    role: typeof staff.data.role === 'string' ? staff.data.role : null,
    settings: {
      aiPreview: settings.aiPreview === true,
      aiDailyCap: typeof settings.aiDailyCap === 'number' ? settings.aiDailyCap : null,
    },
  };
}
