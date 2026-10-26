// LIHYA AI Final Look Worker (PRD 7.5). Cloudflare Workers Free plan.
//
//   POST /render   multipart: source (JPEG), guide (JPEG), seed, shopId
//                  -> 200 image/jpeg|png|webp (the AI preview), headers
//                     X-Lihya-Used / X-Lihya-Cap (this shop today) and X-Lihya-Seed
//   GET  /quota?shopId=<id>
//                  -> 200 { usedToday, cap, accountUsed, accountCap, enabled, allowed, day, resetsAt }
//                     (UTC day: the caps reset at 00:00 UTC, 04:00 Muscat)
//   OPTIONS        CORS preflight for the two routes above
//
// Every request needs an allowed Origin (ALLOWED_ORIGINS) and
// "Authorization: Bearer <Firebase ID token>" of a staff account (not anonymous,
// email_verified true: email-link and Google sign-ins always are) that is active
// staff of the shop (checked through Firestore with the user's own token, so the
// security rules decide). /render also needs shops/{shopId}.settings.aiPreview == true,
// the shop on the allowlist (KV ai:allowed:<shopId> or the AI_SHOPS var, set by Sam;
// anyone can create a shop in the app, so the shared daily budget is only for shops
// he lists) and a free slot under the caps. A shop's cap is min(settings.aiDailyCap
// ?? 20, its allowlist number (default 20), ACCOUNT_DAILY_CAP).
//
// Errors are JSON { error: <code>, ...details }:
//   400 bad_request {field, reason?}   401 auth {reason}
//   403 anonymous | email_not_verified | not_staff | disabled | not_allowed | origin
//   404 not_found   405 method          413 too_large           415 media_type
//   429 cap {scope: 'account'|'shop', resetsAt}                500 config | internal
//   502 model | upstream {service}      503 busy | upstream {service: 'jwks'}
//
// Privacy: images live in memory for one request only. Nothing is stored or
// cached (Cache-Control: no-store), and the access log holds the route,
// status, error code and timings only, never a header, field or image.

import { allowanceFromKv, allowlistKey, readConfig, normalizeOrigin, shopCapFrom } from './config.js';
import { HttpError, errorResponse, finalizeResponse, httpErrorResponse, jsonResponse } from './http.js';
import { bearerToken, verifyFirebaseIdToken } from './auth.js';
import { loadShopAccess } from './firestore.js';
import { CapStoreError, nextUtcMidnightIso, readUsage, release, reserve } from './caps.js';
import { isQuotaError, outputSize, runModel } from './model.js';
import { parseRenderForm, parseShopId } from './multipart.js';

export const ROUTES = Object.freeze({ '/render': 'POST', '/quota': 'GET' });

const APP_CHECK_PATTERN = /^[A-Za-z0-9_\-.]{20,4096}$/;

function defaultLog(entry) {
  // The project lint allows console.warn / console.error only; this is the access line.
  console.warn(JSON.stringify(entry));
}

function nowFrom(deps) {
  return typeof deps.now === 'function' ? deps.now() : new Date();
}

function requireBindings(env, config) {
  if (!config.projectId) throw new HttpError(500, 'config', { field: 'FIREBASE_PROJECT_ID' });
  if (!env || !env.LIHYA_CAPS || typeof env.LIHYA_CAPS.get !== 'function') throw new HttpError(500, 'config', { field: 'LIHYA_CAPS' });
}

function appCheckTokenOf(request) {
  const value = (request.headers.get('X-Firebase-AppCheck') || '').trim();
  return APP_CHECK_PATTERN.test(value) ? value : null;
}

async function authenticate(request, config, deps) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'auth', { reason: 'missing' });
  const user = await verifyFirebaseIdToken(token, { projectId: config.projectId, jwks: deps.jwks, now: nowFrom(deps) });
  // A password account made through the public API has an unverified email: no AI for it.
  if (!user.emailVerified) throw new HttpError(403, 'email_not_verified');
  return { token, user };
}

/**
 * Whether the shop may use the AI Final Look, and the most renders a day it may set:
 * the KV key ai:allowed:<shopId> when it exists, else the AI_SHOPS var, else not allowed.
 * @returns {Promise<{ allowed: boolean, maxCap: number }>}
 */
export async function shopAllowance(kv, config, shopId) {
  let raw;
  try {
    raw = await kv.get(allowlistKey(shopId));
  } catch (err) {
    throw new CapStoreError('kv read failed', { cause: err });
  }
  const fromKv = allowanceFromKv(raw);
  if (fromKv) return fromKv;
  if (config.aiShops.has(shopId)) return { allowed: true, maxCap: config.aiShops.get(shopId) };
  return { allowed: false, maxCap: 0 };
}

function shopAccess(request, config, deps, { shopId, uid, token }) {
  const fetchImpl = typeof deps.fetch === 'function' ? deps.fetch : (input, init) => fetch(input, init);
  return loadShopAccess({
    projectId: config.projectId,
    shopId,
    uid,
    idToken: token,
    appCheckToken: appCheckTokenOf(request),
    fetchImpl,
  });
}

/** 429 body for a reached cap. */
export function capResponse(scope, resetsAt, now = new Date()) {
  const seconds = Math.max(1, Math.ceil((Date.parse(resetsAt) - now.getTime()) / 1000));
  return errorResponse(429, 'cap', { scope, resetsAt }, { 'Retry-After': String(seconds) });
}

async function handleRender(request, env, config, deps, meta) {
  requireBindings(env, config);
  if (!env.AI || typeof env.AI.run !== 'function') throw new HttpError(500, 'config', { field: 'AI' });
  const kv = env.LIHYA_CAPS;
  const { token, user } = await authenticate(request, config, deps);
  const form = await parseRenderForm(request, { random: deps.random });
  const access = await shopAccess(request, config, deps, { shopId: form.shopId, uid: user.uid, token });
  if (!access.settings.aiPreview) throw new HttpError(403, 'disabled');
  const allowance = await shopAllowance(kv, config, form.shopId);
  if (!allowance.allowed) throw new HttpError(403, 'not_allowed');

  const shopCap = shopCapFrom(access.settings.aiDailyCap, config.accountCap, allowance.maxCap);
  const reservation = await reserve(kv, {
    shopId: form.shopId,
    accountCap: config.accountCap,
    shopCap,
    now: nowFrom(deps),
    sleep: deps.sleep,
  });
  if (!reservation.ok) {
    meta.error = 'cap';
    meta.scope = reservation.scope;
    return capResponse(reservation.scope, reservation.resetsAt, nowFrom(deps));
  }

  const size = outputSize(form.source.width, form.source.height);
  const modelStarted = Date.now();
  let image;
  try {
    image = await runModel(env.AI, {
      source: form.source.bytes,
      guide: form.guide.bytes,
      seed: form.seed,
      width: size.width,
      height: size.height,
    });
  } catch (err) {
    meta.modelMs = Date.now() - modelStarted;
    const released = await release(kv, reservation, { sleep: deps.sleep });
    if (!released) meta.release = 'failed';
    if (isQuotaError(err)) {
      meta.error = 'cap';
      meta.scope = 'account';
      const now = nowFrom(deps);
      return capResponse('account', nextUtcMidnightIso(now), now);
    }
    meta.exception = err && err.name ? String(err.name) : 'Error';
    throw new HttpError(502, 'model');
  }
  meta.modelMs = Date.now() - modelStarted;

  return new Response(image.bytes, {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Content-Disposition': 'inline; filename="lihya-ai-preview"',
      'X-Lihya-Used': String(reservation.shopUsed),
      'X-Lihya-Cap': String(shopCap),
      'X-Lihya-Seed': String(form.seed),
    },
  });
}

async function handleQuota(request, url, env, config, deps) {
  requireBindings(env, config);
  const { token, user } = await authenticate(request, config, deps);
  const shopId = parseShopId(url.searchParams.get('shopId'));
  const access = await shopAccess(request, config, deps, { shopId, uid: user.uid, token });
  const [allowance, usage] = await Promise.all([
    shopAllowance(env.LIHYA_CAPS, config, shopId),
    readUsage(env.LIHYA_CAPS, shopId, nowFrom(deps)),
  ]);
  return jsonResponse(200, {
    usedToday: usage.shopUsed,
    cap: allowance.allowed ? shopCapFrom(access.settings.aiDailyCap, config.accountCap, allowance.maxCap) : 0,
    accountUsed: usage.accountUsed,
    accountCap: config.accountCap,
    enabled: access.settings.aiPreview && allowance.allowed,
    allowed: allowance.allowed,
    day: usage.day,
    resetsAt: usage.resetsAt,
  });
}

function toErrorResponse(err, meta) {
  if (err instanceof HttpError) {
    meta.error = err.code;
    return httpErrorResponse(err);
  }
  if (err instanceof CapStoreError) {
    meta.error = 'busy';
    return errorResponse(503, 'busy', {}, { 'Retry-After': '2' });
  }
  meta.error = 'internal';
  meta.exception = err && err.name ? String(err.name) : 'Error';
  return errorResponse(500, 'internal');
}

/**
 * The whole Worker. `deps` exists for tests:
 *   { jwks, fetch, now, sleep, random, log }
 */
export async function handleRequest(request, env, deps = {}) {
  const started = Date.now();
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const config = readConfig(env);
  const origin = normalizeOrigin(request.headers.get('Origin'));
  const allowedOrigin = origin !== null && config.allowedOrigins.includes(origin) ? origin : null;
  const routeMethod = Object.prototype.hasOwnProperty.call(ROUTES, url.pathname) ? ROUTES[url.pathname] : null;
  const meta = {};
  let corsOptions = {};
  let response;

  try {
    if (!routeMethod) throw new HttpError(404, 'not_found');
    if (method === 'OPTIONS') {
      if (!allowedOrigin) throw new HttpError(403, 'origin');
      corsOptions = { preflight: true, methods: `${routeMethod}, OPTIONS` };
      response = new Response(null, { status: 204 });
    } else if (method !== routeMethod) {
      throw new HttpError(405, 'method', { allow: `${routeMethod}, OPTIONS` });
    } else if (!allowedOrigin) {
      throw new HttpError(403, 'origin');
    } else if (routeMethod === 'POST') {
      response = await handleRender(request, env, config, deps, meta);
    } else {
      response = await handleQuota(request, url, env, config, deps);
    }
  } catch (err) {
    response = toErrorResponse(err, meta);
  }

  const final = finalizeResponse(response, allowedOrigin, corsOptions);
  const log = typeof deps.log === 'function' ? deps.log : defaultLog;
  const entry = { route: routeMethod ? url.pathname : 'other', method, status: final.status, ms: Date.now() - started };
  if (meta.error) entry.error = meta.error;
  if (meta.scope) entry.scope = meta.scope;
  if (meta.exception) entry.exception = meta.exception;
  if (meta.modelMs !== undefined) entry.modelMs = meta.modelMs;
  if (meta.release) entry.release = meta.release;
  log(entry);
  return final;
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
