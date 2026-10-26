// KHUSLA "AI Final Look" worker (Cloudflare Workers Free plan + Workers AI + KV).
//
// Routes
//   OPTIONS *                CORS preflight (only for origins in ALLOWED_ORIGINS)
//   GET  /quota?salonId=ID   today's usage for the salon and the account
//   POST /render             multipart: salonId, seed?, source, guide, styleName?, styleDesc?
//
// Privacy: images are only held in memory for the length of one request. Nothing is stored,
// cached or logged except the two daily counters in KV. Log lines carry short codes only.

import { createRemoteJWKSet, jwtVerify } from 'jose';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

// Apache 2.0 licensed. Never switch to FLUX.2 klein 9B or FLUX.2 dev (non-commercial licenses).
export const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

export const BASE_PROMPT =
  'Image 0 is a real photo of a woman. Image 1 shows the target haircut, length and hair color drawn on the same woman. Make the hair from image 1 photorealistic on the woman in image 0. Keep her face, skin, eyes, makeup, expression, clothing and background exactly as in image 0. Match the hair length, cut shape, fringe, color and color placement of image 1. Realistic hair strands and shine. No text.';

export const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';

export const MAX_IMAGE_BYTES = 400 * 1024; // per image
export const MAX_IMAGE_SIDE = 512; // exclusive: width and height must both be < 512
export const MAX_BODY_BYTES = 900 * 1024; // two images plus the small text fields
export const MAX_STYLE_CHARS = 120;
export const KV_TTL_SECONDS = 172800; // 2 days
export const MAX_SEED = 4294967295; // uint32

export const SALON_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SEED_RE = /^\d{1,10}$/;
const BEARER_RE = /^Bearer\s+([A-Za-z0-9._-]{1,4096})$/;
// Keep letters (any script, with their combining marks), decimal digits, spaces and . , - ' ( )
const STYLE_DISALLOWED_RE = /[^\p{L}\p{M}\p{Nd} .,\-'()]/gu;

export const ALLOW_METHODS = 'GET, POST, OPTIONS';
export const ALLOW_HEADERS = 'Authorization, Content-Type, X-Firebase-AppCheck';
export const EXPOSE_HEADERS =
  'X-Khusla-Used, X-Khusla-Cap, X-Khusla-Account-Used, X-Khusla-Resets-At';

const DEFAULTS = { accountCap: 80, salonCap: 20, outputSize: 768 };

// ---------------------------------------------------------------------------------------------
// Errors and responses
// ---------------------------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(status, code, { body, headers } = {}) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.headers = headers;
  }
}

const badRequest = () => new HttpError(400, 'bad_request');

function log(level, event, fields = {}) {
  // Only short, non-sensitive diagnostics. Never bodies, images, tokens or prompts.
  const line = JSON.stringify({ event, ...fields });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

function shortMessage(err) {
  return String(err?.message ?? err ?? '').slice(0, 160);
}

export function parseAllowedOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function matchOrigin(request, allowedOrigins) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
}

function buildHeaders(origin, extra) {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.append('Vary', 'Origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  }
  return headers;
}

function jsonResponse(status, body, origin, extraHeaders) {
  const headers = buildHeaders(origin, extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

function preflightResponse(origin) {
  if (!origin) return jsonResponse(403, { error: 'origin' }, null);
  const headers = buildHeaders(origin);
  headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
  headers.set('Access-Control-Max-Age', '7200');
  return new Response(null, { status: 204, headers });
}

export function quotaHeaders(quota) {
  return {
    'X-Khusla-Used': String(quota.used),
    'X-Khusla-Cap': String(quota.cap),
    'X-Khusla-Account-Used': String(quota.accountUsed),
    'X-Khusla-Resets-At': quota.resetsAt,
  };
}

function capError(quota, nowMs) {
  const retryAfter = Math.max(1, Math.ceil((Date.parse(quota.resetsAt) - nowMs) / 1000));
  return new HttpError(429, 'cap', {
    body: { resetsAt: quota.resetsAt },
    headers: { ...quotaHeaders(quota), 'Retry-After': String(retryAfter) },
  });
}

// ---------------------------------------------------------------------------------------------
// Config, dates
// ---------------------------------------------------------------------------------------------

function envInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function readConfig(env) {
  const size = envInt(env.OUTPUT_SIZE, DEFAULTS.outputSize, 256, 1024);
  return {
    projectId: String(env.FIREBASE_PROJECT_ID ?? '').trim(),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    accountCap: envInt(env.ACCOUNT_DAILY_CAP, DEFAULTS.accountCap, 0, 1000000),
    salonCap: envInt(env.SALON_DAILY_CAP, DEFAULTS.salonCap, 0, 1000000),
    outputSize: Math.round(size / 16) * 16,
  };
}

// Workers AI free neurons reset at 00:00 UTC (04:00 Asia/Muscat), so the counters use UTC days.
export function utcDayKey(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcMidnight(nowMs) {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export function capKeys(salonId, day) {
  return { salon: `salon:${salonId}:${day}`, account: `acct:${day}` };
}

// ---------------------------------------------------------------------------------------------
// Auth: Firebase ID token
// ---------------------------------------------------------------------------------------------

let remoteJwks = null;
function googleJwks() {
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(JWKS_URL));
  return remoteJwks;
}

export async function verifyFirebaseIdToken(token, env, keySet = googleJwks()) {
  const projectId = String(env.FIREBASE_PROJECT_ID ?? '').trim();
  const { payload } = await jwtVerify(token, keySet, {
    issuer: 'https://securetoken.google.com/' + projectId,
    audience: projectId,
    algorithms: ['RS256'],
  });
  return payload;
}

async function authenticate(request, env, cfg, deps) {
  if (!cfg.projectId) {
    log('error', 'config', { missing: 'FIREBASE_PROJECT_ID' });
    throw new HttpError(500, 'internal');
  }
  const match = BEARER_RE.exec((request.headers.get('Authorization') ?? '').trim());
  if (!match) throw new HttpError(401, 'auth');
  const token = match[1];

  let payload;
  try {
    payload = await deps.verifyToken(token, env);
  } catch {
    throw new HttpError(401, 'auth');
  }
  const uid = typeof payload?.sub === 'string' ? payload.sub : '';
  if (!uid || uid.length > 128) throw new HttpError(401, 'auth');
  if (payload.firebase?.sign_in_provider === 'anonymous') throw new HttpError(401, 'auth');

  const appCheckHeader = (request.headers.get('X-Firebase-AppCheck') ?? '').trim();
  const appCheck = appCheckHeader && appCheckHeader.length <= 8192 ? appCheckHeader : null;
  return { uid, token, appCheck };
}

// ---------------------------------------------------------------------------------------------
// Firestore REST with the caller's own ID token (security rules apply as that user)
// ---------------------------------------------------------------------------------------------

async function firestoreGet(path, auth, cfg, deps) {
  const url = `${FIRESTORE_BASE}/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/${path}`;
  const headers = { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' };
  if (auth.appCheck) headers['X-Firebase-AppCheck'] = auth.appCheck;

  let res;
  try {
    res = await deps.fetch(url, { method: 'GET', headers, cache: 'no-store' });
  } catch (err) {
    log('error', 'firestore_fetch_failed', { message: shortMessage(err) });
    throw new HttpError(502, 'upstream');
  }
  if (res.status !== 200) {
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    return { status: res.status, doc: null };
  }
  try {
    return { status: 200, doc: await res.json() };
  } catch {
    log('error', 'firestore_bad_json', {});
    throw new HttpError(502, 'upstream');
  }
}

export function firestoreNumber(value) {
  if (!value || typeof value !== 'object') return undefined;
  let n;
  if ('integerValue' in value) n = Number(value.integerValue);
  else if ('doubleValue' in value) n = Number(value.doubleValue);
  else return undefined;
  return Number.isFinite(n) ? n : undefined;
}

// Returns { cap } (the salon's daily cap) or throws auth / not_staff / ai_off / upstream.
async function checkSalonAccess(salonId, auth, cfg, deps) {
  const salonPath = `salons/${salonId}`;
  const [staff, salon] = await Promise.all([
    firestoreGet(`${salonPath}/staff/${encodeURIComponent(auth.uid)}`, auth, cfg, deps),
    firestoreGet(salonPath, auth, cfg, deps),
  ]);

  if (staff.status === 401) throw new HttpError(401, 'auth');
  if (staff.status === 403 || staff.status === 404) throw new HttpError(403, 'not_staff');
  if (staff.status !== 200) {
    log('error', 'firestore_status', { doc: 'staff', status: staff.status });
    throw new HttpError(502, 'upstream');
  }
  if (staff.doc?.fields?.active?.booleanValue !== true) throw new HttpError(403, 'not_staff');

  if (salon.status === 401) throw new HttpError(401, 'auth');
  if (salon.status === 403) throw new HttpError(403, 'not_staff');
  if (salon.status === 404) throw new HttpError(403, 'ai_off');
  if (salon.status !== 200) {
    log('error', 'firestore_status', { doc: 'salon', status: salon.status });
    throw new HttpError(502, 'upstream');
  }
  const settings = salon.doc?.fields?.settings?.mapValue?.fields;
  if (settings?.aiPreview?.booleanValue !== true) throw new HttpError(403, 'ai_off');

  const custom = firestoreNumber(settings?.aiDailyCap);
  const salonCap = custom !== undefined && custom >= 0 ? Math.floor(custom) : cfg.salonCap;
  return { cap: Math.min(salonCap, cfg.accountCap) };
}

// ---------------------------------------------------------------------------------------------
// KV counters
// ---------------------------------------------------------------------------------------------

async function readCount(kv, key) {
  const value = await kv.get(key);
  const n = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function readUsage(kv, keys) {
  const [salon, account] = await Promise.all([readCount(kv, keys.salon), readCount(kv, keys.account)]);
  return { salon, account };
}

// Called only after a successful render. Re-reads first so renders that finished while the
// model was running are not overwritten, then writes both counters.
async function incrementUsage(kv, keys, before) {
  let latest = before;
  try {
    latest = await readUsage(kv, keys);
  } catch {
    // keep the values read before the render
  }
  const next = {
    salon: Math.max(latest.salon, before.salon) + 1,
    account: Math.max(latest.account, before.account) + 1,
  };
  const results = await Promise.allSettled([
    kv.put(keys.salon, String(next.salon), { expirationTtl: KV_TTL_SECONDS }),
    kv.put(keys.account, String(next.account), { expirationTtl: KV_TTL_SECONDS }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') log('error', 'kv_put_failed', { message: shortMessage(r.reason) });
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Input parsing and validation
// ---------------------------------------------------------------------------------------------

async function readBodyLimited(request, limit) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n > limit) throw badRequest();
  }
  if (!request.body) throw badRequest();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        reader.cancel().catch(() => {});
        throw badRequest();
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Returns { width, height } from the first SOF marker, or null if this is not a readable JPEG.
export function jpegDimensions(bytes) {
  const b = bytes;
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i += 1; // fill byte
      marker = b[i + 1];
    }
    i += 2;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue; // standalone markers
    if (marker === 0xd9 || marker === 0xda) return null; // EOI or scan data before any SOF
    if (i + 1 >= b.length) return null;
    const segmentLength = (b[i] << 8) | b[i + 1];
    if (segmentLength < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 6 >= b.length) return null;
      const height = (b[i + 3] << 8) | b[i + 4];
      const width = (b[i + 5] << 8) | b[i + 6];
      return { width, height };
    }
    i += segmentLength;
  }
  return null;
}

export function detectImageType(b) {
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function sanitizeStyleText(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(STYLE_DISALLOWED_RE, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, MAX_STYLE_CHARS).join('').trim();
}

export function buildPrompt(styleName, styleDesc) {
  const name = sanitizeStyleText(styleName).replace(/[ .]+$/, '');
  if (!name) return BASE_PROMPT;
  const desc = sanitizeStyleText(styleDesc);
  return `${BASE_PROMPT} Style: ${name}.${desc ? ` ${desc}` : ''}`;
}

function stringField(form, name) {
  const value = form.get(name);
  if (value === null) return null;
  if (typeof value !== 'string') throw badRequest();
  return value;
}

async function jpegField(form, name) {
  const value = form.get(name);
  if (value === null || typeof value === 'string' || typeof value.arrayBuffer !== 'function') {
    throw badRequest();
  }
  if (typeof value.size === 'number' && (value.size === 0 || value.size > MAX_IMAGE_BYTES)) {
    throw badRequest();
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw badRequest();
  const dims = jpegDimensions(bytes);
  if (
    !dims ||
    dims.width < 1 || dims.height < 1 ||
    dims.width >= MAX_IMAGE_SIDE || dims.height >= MAX_IMAGE_SIDE
  ) {
    throw badRequest();
  }
  return bytes;
}

async function parseRenderForm(request) {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw badRequest();
  const raw = await readBodyLimited(request, MAX_BODY_BYTES);

  let form;
  try {
    form = await new Response(raw, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    throw badRequest();
  }

  const salonId = stringField(form, 'salonId');
  if (salonId === null || !SALON_ID_RE.test(salonId)) throw badRequest();

  let seed = null;
  const seedRaw = stringField(form, 'seed');
  if (seedRaw !== null && seedRaw.trim() !== '') {
    const s = seedRaw.trim();
    if (!SEED_RE.test(s)) throw badRequest();
    seed = Number(s);
    if (seed > MAX_SEED) throw badRequest();
  }

  const styleName = stringField(form, 'styleName') ?? '';
  const styleDesc = stringField(form, 'styleDesc') ?? '';

  const source = await jpegField(form, 'source');
  const guide = await jpegField(form, 'guide');

  return { salonId, seed, styleName, styleDesc, source, guide };
}

// ---------------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------------

export function isCapacityError(err) {
  const status = Number(err?.status ?? err?.statusCode);
  if (status === 429) return true;
  const message = String(err?.message ?? err ?? '');
  return (
    /\b(?:3036|3040|4006)\b/.test(message) ||
    /neurons?|free allocation|capacity|rate limit|too many requests|account limited/i.test(message)
  );
}

export function base64ToBytes(input) {
  let s = String(input);
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    if (comma !== -1) s = s.slice(comma + 1);
  }
  if (/\s/.test(s)) s = s.replace(/\s+/g, '');
  if (/[-_]/.test(s)) s = s.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s);
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function modelResultToBytes(result) {
  if (result === null || result === undefined) return null;
  if (typeof result === 'string') return base64ToBytes(result);
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (ArrayBuffer.isView(result)) {
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
  }
  if (typeof ReadableStream !== 'undefined' && result instanceof ReadableStream) {
    return new Uint8Array(await new Response(result).arrayBuffer());
  }
  if (result instanceof Response) return new Uint8Array(await result.arrayBuffer());
  if (typeof result === 'object') {
    const image = result.image ?? result.result?.image;
    if (image !== undefined && image !== null) return modelResultToBytes(image);
  }
  return null;
}

async function runModel(env, { prompt, size, seed, source, guide }) {
  // flux-2-klein-4b only takes multipart input. Steps are fixed (4) for klein and are not sent.
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(size));
  form.append('height', String(size));
  if (seed !== null) form.append('seed', String(seed));
  form.append('input_image_0', new Blob([source], { type: 'image/jpeg' }), 'source.jpg');
  form.append('input_image_1', new Blob([guide], { type: 'image/jpeg' }), 'guide.jpg');

  const formResponse = new Response(form);
  const formStream = formResponse.body;
  const formContentType = formResponse.headers.get('content-type');

  return env.AI.run(MODEL, {
    multipart: { body: formStream, contentType: formContentType },
  });
}

// ---------------------------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------------------------

async function handleQuota(request, url, env, cfg, deps, origin) {
  const auth = await authenticate(request, env, cfg, deps);
  const salonId = url.searchParams.get('salonId');
  if (!salonId || !SALON_ID_RE.test(salonId)) throw badRequest();
  const access = await checkSalonAccess(salonId, auth, cfg, deps);

  const nowMs = deps.now();
  const keys = capKeys(salonId, utcDayKey(nowMs));
  const usage = await readUsage(env.KHUSLA_CAPS, keys);
  const quota = {
    used: usage.salon,
    cap: access.cap,
    accountUsed: usage.account,
    accountCap: cfg.accountCap,
    resetsAt: nextUtcMidnight(nowMs),
  };
  return jsonResponse(200, quota, origin, quotaHeaders(quota));
}

async function handleRender(request, env, cfg, deps, origin) {
  const auth = await authenticate(request, env, cfg, deps);
  const input = await parseRenderForm(request);
  const access = await checkSalonAccess(input.salonId, auth, cfg, deps);

  const nowMs = deps.now();
  const keys = capKeys(input.salonId, utcDayKey(nowMs));
  const kv = env.KHUSLA_CAPS;
  const before = await readUsage(kv, keys);
  const quota = {
    used: before.salon,
    cap: access.cap,
    accountUsed: before.account,
    accountCap: cfg.accountCap,
    resetsAt: nextUtcMidnight(nowMs),
  };
  if (before.salon >= access.cap || before.account >= cfg.accountCap) throw capError(quota, nowMs);

  let result;
  try {
    result = await runModel(env, {
      prompt: buildPrompt(input.styleName, input.styleDesc),
      size: cfg.outputSize,
      seed: input.seed,
      source: input.source,
      guide: input.guide,
    });
  } catch (err) {
    if (isCapacityError(err)) {
      log('warn', 'model_capacity', { message: shortMessage(err) });
      throw capError(quota, nowMs);
    }
    log('error', 'model_error', { message: shortMessage(err) });
    throw new HttpError(502, 'model', { headers: quotaHeaders(quota) });
  }

  let bytes;
  try {
    bytes = await modelResultToBytes(result);
  } catch {
    bytes = null;
  }
  const contentType = bytes && bytes.byteLength > 0 ? detectImageType(bytes) : null;
  if (!contentType) {
    log('error', 'model_bad_output', {});
    throw new HttpError(502, 'model', { headers: quotaHeaders(quota) });
  }

  const after = await incrementUsage(kv, keys, before);
  const headers = buildHeaders(origin, {
    ...quotaHeaders({ ...quota, used: after.salon, accountUsed: after.account }),
    'Content-Type': contentType,
  });
  return new Response(bytes, { status: 200, headers });
}

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

export const defaultDeps = {
  verifyToken: (token, env) => verifyFirebaseIdToken(token, env),
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
};

/**
 * @param {Request} request
 * @param {object} env  Worker bindings: AI, KHUSLA_CAPS and the [vars]
 * @param {{ verifyToken?: Function, fetch?: Function, now?: Function }} [deps]  test seams
 * @returns {Promise<Response>}
 */
export async function handleRequest(request, env, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const cfg = readConfig(env);
  const origin = matchOrigin(request, cfg.allowedOrigins);

  if (request.method === 'OPTIONS') return preflightResponse(origin);
  if (!origin) return jsonResponse(403, { error: 'origin' }, null);

  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/render') {
      if (request.method !== 'POST') {
        throw new HttpError(405, 'method', { headers: { Allow: 'POST, OPTIONS' } });
      }
      return await handleRender(request, env, cfg, d, origin);
    }
    if (path === '/quota') {
      if (request.method !== 'GET') {
        throw new HttpError(405, 'method', { headers: { Allow: 'GET, OPTIONS' } });
      }
      return await handleQuota(request, url, env, cfg, d, origin);
    }
    throw new HttpError(404, 'not_found');
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { error: err.code, ...(err.body ?? {}) }, origin, err.headers);
    }
    log('error', 'internal', { message: shortMessage(err) });
    return jsonResponse(500, { error: 'internal' }, origin);
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
