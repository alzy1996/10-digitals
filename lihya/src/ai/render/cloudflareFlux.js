// AI Final Look provider: the LIHYA Cloudflare Worker (worker/ folder), which runs
// FLUX.2 [klein] 4B on Workers AI (free daily allocation, capped by the Worker).
//
// POST <VITE_AI_WORKER_URL>/render, multipart/form-data:
//   source  JPEG  the customer's photo, face and beard crop, 504 x 504
//   guide   JPEG  the Photo Studio render at the same crop (the exact target beard)
//   prompt  text  the fixed prompt (provider.js FINAL_LOOK_PROMPT)
//   seed    text  integer
//   shopId  text  the shop whose daily cap is counted
// Authorization: Bearer <Firebase ID token>. The Worker verifies the token and the
// staff membership, keeps no image and logs no request body.
//
// Responses: 200 image/* -> the result Blob; 429 -> daily cap reached (code 'cap');
// 403 'disabled' -> code 'disabled'; 403 'not_allowed' (the shop is not on the Worker's
// allowlist) or 'email_not_verified' -> code 'notAllowed'; anything else -> code 'failed'.
// A network failure is code 'offline'.
//
// GET <VITE_AI_WORKER_URL>/quota?shopId=<id> (same headers) -> the Worker's own count
// for the owner dashboard (fetchAiQuota). The Worker counts per UTC day: its caps reset
// at 00:00 UTC, 04:00 Muscat.

import { getIdToken } from '../../services/auth.js';
import { getAppCheckToken } from '../../lib/firebase.js';

/** Request timeout (ms). FLUX klein usually answers in a few seconds. */
export const REQUEST_TIMEOUT_MS = 60000;
/** GET /quota timeout (ms): the dashboard falls back to its own count when it is slow. */
export const QUOTA_TIMEOUT_MS = 8000;

/** Error with a machine-readable code: 'cap' | 'failed' | 'offline' | 'disabled' | 'notAllowed'. */
export function finalLookError(code, message, extra = {}) {
  const err = new Error(message || `AI preview ${code}`);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/** The configured Worker base URL without a trailing slash ('' when not set). */
export function workerBaseUrl(env = typeof import.meta !== 'undefined' ? import.meta.env : null) {
  const raw = env && env.VITE_AI_WORKER_URL ? String(env.VITE_AI_WORKER_URL).trim() : '';
  return raw.replace(/\/+$/, '');
}

const isOffline = () => typeof navigator !== 'undefined' && navigator && navigator.onLine === false;

/** Worker error codes (JSON { error }) that become a client error code. */
const WORKER_CODES = Object.freeze({ disabled: 'disabled', cap: 'cap', not_allowed: 'notAllowed', email_not_verified: 'notAllowed' });

const countOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/**
 * GET /quota body -> { usedToday, cap, accountUsed, accountCap, enabled, allowed, day, resetsAt }
 * with every unknown or broken field as null.
 */
export function parseQuota(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    usedToday: countOrNull(b.usedToday),
    cap: countOrNull(b.cap),
    accountUsed: countOrNull(b.accountUsed),
    accountCap: countOrNull(b.accountCap),
    enabled: typeof b.enabled === 'boolean' ? b.enabled : null,
    allowed: typeof b.allowed === 'boolean' ? b.allowed : null,
    day: typeof b.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null,
    resetsAt: typeof b.resetsAt === 'string' && Number.isFinite(Date.parse(b.resetsAt)) ? b.resetsAt : null,
  };
}

/**
 * Creates the Cloudflare FLUX provider.
 * @param {object} [deps]
 * @param {string} [deps.url] Worker base URL (default VITE_AI_WORKER_URL)
 * @param {(force: boolean) => Promise<string|null>} [deps.getToken] Firebase ID token
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {number} [deps.timeoutMs]
 * @returns {{ id: 'cloudflareFlux', available: () => boolean,
 *   render: (req: { sourceJpeg: Blob, guideJpeg: Blob, prompt: string, seed: number, shopId: string }) => Promise<Blob> }}
 */
export function createCloudflareFlux({ url, getToken = getIdToken, getAppCheck = getAppCheckToken, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  // Resolved on every call, so the default instance follows the build's env.
  const baseUrl = () => (url === undefined ? workerBaseUrl() : String(url || '').replace(/\/+$/, ''));
  const doFetch = fetchImpl || (typeof fetch === 'function' ? (...args) => fetch(...args) : null);

  // The App Check token (when App Check is set up) lets the Worker's Firestore reads pass enforcement.
  async function renderHeaders(token) {
    const headers = { Authorization: `Bearer ${token}` };
    const appCheckToken = getAppCheck ? await getAppCheck().catch(() => null) : null;
    if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
    return headers;
  }

  async function post(base, form, token) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      return await doFetch(`${base}/render`, {
        method: 'POST',
        headers: await renderHeaders(token),
        body: form,
        cache: 'no-store',
        credentials: 'omit',
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw finalLookError('failed', 'AI preview timed out', { cause: err });
      // The request never got an answer: offline when the device says so, otherwise the
      // Worker could not be reached (DNS, CORS, captive portal).
      throw finalLookError(isOffline() ? 'offline' : 'failed', 'AI preview network error', { cause: err, reason: 'network' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function render({ sourceJpeg, guideJpeg, prompt, seed, shopId } = {}) {
    const base = baseUrl();
    if (!base || !doFetch) throw finalLookError('disabled', 'AI preview Worker URL is not set');
    if (isOffline()) throw finalLookError('offline', 'Device is offline');
    if (!sourceJpeg || !guideJpeg) throw finalLookError('failed', 'AI preview needs a source and a guide image');
    if (!shopId) throw finalLookError('failed', 'AI preview needs a shop id');
    const token = await getToken(false);
    if (!token) throw finalLookError('failed', 'AI preview needs a signed-in staff member', { reason: 'auth' });

    const makeForm = () => {
      const form = new FormData();
      form.append('source', sourceJpeg, 'source.jpg');
      form.append('guide', guideJpeg, 'guide.jpg');
      form.append('prompt', String(prompt || ''));
      form.append('seed', String(Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 0));
      form.append('shopId', String(shopId));
      return form;
    };

    let res = await post(base, makeForm(), token);
    if (res.status === 401) {
      // The ID token may have expired between screens: refresh once.
      const fresh = await getToken(true);
      if (fresh) res = await post(base, makeForm(), fresh);
    }
    if (res.status === 429) throw finalLookError('cap', "Today's AI previews are used up", { status: 429 });
    if (!res.ok) {
      let code = 'failed';
      let reason;
      try {
        const body = await res.json();
        const workerCode = body && (typeof body.error === 'string' ? body.error : body.code);
        if (typeof workerCode === 'string' && Object.prototype.hasOwnProperty.call(WORKER_CODES, workerCode)) {
          code = WORKER_CODES[workerCode];
          if (workerCode === 'email_not_verified') reason = 'emailNotVerified';
        }
      } catch {
        // Not JSON: keep 'failed'.
      }
      throw finalLookError(code, `AI preview failed (${res.status})`, reason ? { status: res.status, reason } : { status: res.status });
    }
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    const blob = await res.blob();
    if (!blob || !blob.size || (type && !type.startsWith('image/'))) {
      throw finalLookError('failed', 'AI preview returned no image', { status: res.status });
    }
    return blob.type ? blob : new Blob([blob], { type: type || 'image/jpeg' });
  }

  async function getQuota(base, shopId, token, signal) {
    return doFetch(`${base}/quota?shopId=${encodeURIComponent(shopId)}`, {
      method: 'GET',
      headers: await renderHeaders(token),
      cache: 'no-store',
      credentials: 'omit',
      signal,
    });
  }

  /**
   * The Worker's AI usage for a shop today (GET /quota), with the same ID token and App
   * Check headers as /render, so it keeps working when Firestore enforces App Check.
   * Resolves null (never rejects) without a Worker URL, offline, signed out, on a
   * refusal, a timeout or a broken answer: the dashboard then shows its own count.
   * @param {string} shopId
   * @param {{ signal?: AbortSignal }} [opts] abort to stop waiting (resolves null)
   * @returns {Promise<{ usedToday, cap, accountUsed, accountCap, enabled, allowed, day, resetsAt } | null>}
   */
  async function quota(shopId, { signal } = {}) {
    const base = baseUrl();
    if (!base || !doFetch || !shopId || isOffline()) return null;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), QUOTA_TIMEOUT_MS) : null;
    const stop = () => ctrl && ctrl.abort();
    if (signal && ctrl) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', stop, { once: true });
    }
    try {
      const token = await getToken(false);
      if (!token || (ctrl && ctrl.signal.aborted)) return null;
      let res = await getQuota(base, String(shopId), token, ctrl ? ctrl.signal : undefined);
      if (res.status === 401) {
        const fresh = await getToken(true);
        if (!fresh) return null;
        res = await getQuota(base, String(shopId), fresh, ctrl ? ctrl.signal : undefined);
      }
      if (!res.ok) return null;
      return parseQuota(await res.json());
    } catch (err) {
      if (!(err && err.name === 'AbortError')) console.warn('AI quota not available', err);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', stop);
    }
  }

  return { id: 'cloudflareFlux', available: () => !!baseUrl(), render, quota };
}

/** The default instance (VITE_AI_WORKER_URL, the signed-in user's ID token). */
export const cloudflareFlux = createCloudflareFlux();

/**
 * The Worker's AI preview usage for a shop today (owner dashboard, consent screen):
 * { usedToday, cap, accountUsed, accountCap, enabled, allowed, day, resetsAt } for the
 * Worker's UTC day (resets 04:00 Muscat), or null when it cannot be asked.
 * @param {string} shopId
 * @param {{ signal?: AbortSignal }} [opts]
 */
export function fetchAiQuota(shopId, opts) {
  return cloudflareFlux.quota(shopId, opts);
}
