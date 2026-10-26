// Shared fakes for the Worker tests: a local RS256 key set standing in for
// Google's securetoken JWKS, Firebase-shaped ID tokens, an in-memory KV, a
// Firestore REST fake, a Workers AI fake and hand-built JPEG byte streams.

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

export const PROJECT_ID = 'lihya';
export const ORIGIN = 'https://lihya.web.app';
export const WORKER_URL = 'https://lihya-render.example.workers.dev';
export const SHOP_ID = 'Shop01abcDEF23ghiJK4';
export const UID = 'barberUid0123456789abcdefghi';
export const NOW = new Date('2026-10-25T09:30:00.000Z');

// ------------------------------------------------------------------ tokens

export async function makeKeys(kid = 'test-key-1') {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { kid, privateKey, jwk, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

/**
 * A Firebase-shaped ID token signed with `keys`.
 * Options override single claims; pass null to leave a claim out.
 */
export async function signToken(keys, options = {}) {
  const now = Math.floor((options.now || NOW).getTime() / 1000);
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: UID,
    user_id: UID,
    iat: now - 60,
    exp: now + 3540,
    auth_time: now - 600,
    email: 'barber@example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com', identities: {} },
    ...options.claims,
  };
  for (const [key, value] of Object.entries(claims)) {
    if (value === null) delete claims[key];
  }
  const header = { alg: 'RS256', typ: 'JWT' };
  if (options.kid !== null) header.kid = options.kid || keys.kid;
  return new SignJWT(claims).setProtectedHeader(header).sign(options.signWith || keys.privateKey);
}

// ------------------------------------------------------------------ KV

export class MemoryKV {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
    this.puts = [];
    this.failPuts = 0;
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async put(key, value, options) {
    if (this.failPuts > 0) {
      this.failPuts -= 1;
      throw new Error('KV PUT failed: 429 Too Many Requests');
    }
    this.store.set(key, String(value));
    this.puts.push({ key, value: String(value), options });
  }

  async delete(key) {
    this.store.delete(key);
  }
}

// ------------------------------------------------------------------ Firestore REST

export function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  const fields = {};
  for (const [k, v] of Object.entries(value)) fields[k] = toValue(v);
  return { mapValue: { fields } };
}

function docResponse(name, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toValue(v);
  return new Response(JSON.stringify({ name, fields, createTime: '2026-10-01T00:00:00Z', updateTime: '2026-10-01T00:00:00Z' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function statusResponse(status) {
  return new Response(JSON.stringify({ error: { code: status, status: 'ERROR' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Firestore REST fake. `staff` / `shop` are document data objects or an HTTP
 * status number (404, 403, 500...). Records every call.
 */
export function fakeFirestore({ staff = { active: true, role: 'barber' }, shop = { settings: { aiPreview: true, aiDailyCap: 20 } } } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers || {});
    calls.push({ url, method: init.method || 'GET', authorization: headers.get('Authorization'), appCheck: headers.get('X-Firebase-AppCheck') });
    const path = decodeURIComponent(new URL(url).pathname);
    const isStaff = path.includes('/staff/');
    const spec = isStaff ? staff : shop;
    if (typeof spec === 'number') return statusResponse(spec);
    if (spec instanceof Error) throw spec;
    return docResponse(path, spec);
  };
  return { fetch: fetchImpl, calls };
}

// ------------------------------------------------------------------ JPEG bytes

const hi = (n) => (n >> 8) & 0xff;
const lo = (n) => n & 0xff;

function segment(marker, payload) {
  const length = payload.length + 2;
  return [0xff, marker, hi(length), lo(length), ...payload];
}

/**
 * A structurally valid JPEG header (SOI, APP0, optional Exif APP1 holding a
 * thumbnail frame header, DQT, SOFn, SOS, a few data bytes, EOI).
 */
export function jpegBytes(width, height, { sof = 0xc0, exifThumb = null, fill = false } = {}) {
  const out = [0xff, 0xd8];
  out.push(...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]));
  if (exifThumb) {
    const thumbSof = [0xff, 0xc0, 0x00, 0x11, 0x08, hi(exifThumb.height), lo(exifThumb.height), hi(exifThumb.width), lo(exifThumb.width), 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
    out.push(...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd8, ...thumbSof, 0xff, 0xd9]));
  }
  out.push(...segment(0xdb, [0x00, ...new Array(64).fill(1)]));
  if (fill) out.push(0xff, 0xff);
  out.push(...segment(sof, [0x08, hi(height), lo(height), hi(width), lo(width), 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]));
  out.push(...segment(0xda, [0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]));
  out.push(0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0);
  out.push(0xff, 0xd9);
  return new Uint8Array(out);
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

export function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ------------------------------------------------------------------ Workers AI

/** Workers AI fake: records the parsed multipart form, returns { image: base64 } or throws. */
export function fakeAi({ output = jpegBytes(1024, 1024), error = null } = {}) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      const form = await new Response(input.multipart.body, {
        headers: { 'Content-Type': input.multipart.contentType },
      }).formData();
      calls.push({ model, form });
      if (error) throw error;
      return { image: toBase64(output) };
    },
  };
}

// ------------------------------------------------------------------ requests

/** POST /render request with a multipart body built from `fields`. */
export function renderRequest({ token, origin = ORIGIN, fields, appCheck, headers: extraHeaders = {} } = {}) {
  const form = new FormData();
  const values = fields || { shopId: SHOP_ID, seed: '1234', source: jpegBytes(504, 504), guide: jpegBytes(504, 504) };
  for (const [name, value] of Object.entries(values)) {
    if (value instanceof Uint8Array) form.append(name, new Blob([value], { type: 'image/jpeg' }), `${name}.jpg`);
    else form.append(name, value);
  }
  const headers = { ...extraHeaders };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  return new Request(`${WORKER_URL}/render`, { method: 'POST', headers, body: form });
}

export function makeEnv({ kv = new MemoryKV(), ai = fakeAi(), vars = {} } = {}) {
  return {
    AI: ai,
    LIHYA_CAPS: kv,
    FIREBASE_PROJECT_ID: PROJECT_ID,
    ALLOWED_ORIGINS: 'https://lihya.web.app,https://lihya.firebaseapp.com,http://localhost:5173',
    ACCOUNT_DAILY_CAP: '80',
    ...vars,
  };
}
