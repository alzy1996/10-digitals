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
// anything else -> code 'failed'. A network failure is code 'offline'.

import { getIdToken } from '../../services/auth.js';

/** Request timeout (ms). FLUX klein usually answers in a few seconds. */
export const REQUEST_TIMEOUT_MS = 60000;

/** Error with a machine-readable code: 'cap' | 'failed' | 'offline' | 'disabled'. */
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
export function createCloudflareFlux({ url, getToken = getIdToken, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  // Resolved on every call, so the default instance follows the build's env.
  const baseUrl = () => (url === undefined ? workerBaseUrl() : String(url || '').replace(/\/+$/, ''));
  const doFetch = fetchImpl || (typeof fetch === 'function' ? (...args) => fetch(...args) : null);

  async function post(base, form, token) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      return await doFetch(`${base}/render`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
      try {
        const body = await res.json();
        if (body && (body.code === 'disabled' || body.error === 'disabled')) code = 'disabled';
        if (body && (body.code === 'cap' || body.error === 'cap')) code = 'cap';
      } catch {
        // Not JSON: keep 'failed'.
      }
      throw finalLookError(code, `AI preview failed (${res.status})`, { status: res.status });
    }
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    const blob = await res.blob();
    if (!blob || !blob.size || (type && !type.startsWith('image/'))) {
      throw finalLookError('failed', 'AI preview returned no image', { status: res.status });
    }
    return blob.type ? blob : new Blob([blob], { type: type || 'image/jpeg' });
  }

  return { id: 'cloudflareFlux', available: () => !!baseUrl(), render };
}

/** The default instance (VITE_AI_WORKER_URL, the signed-in user's ID token). */
export const cloudflareFlux = createCloudflareFlux();
