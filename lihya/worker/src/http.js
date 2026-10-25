// Response helpers. Every response leaves through finalizeResponse(), which adds
// Cache-Control: no-store, a few hardening headers and, only for an allowed
// Origin, the CORS headers. Nothing is ever cached or stored.

export const ALLOWED_REQUEST_HEADERS = 'Authorization, Content-Type, X-Firebase-AppCheck';
export const EXPOSED_HEADERS = 'X-Lihya-Used, X-Lihya-Cap, X-Lihya-Seed';
export const PREFLIGHT_MAX_AGE = '600';

/** An error that maps straight to an HTTP status and a small JSON body. */
export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(status, code, extra = {}, headers = {}) {
  return jsonResponse(status, { error: code, ...extra }, headers);
}

export function httpErrorResponse(err) {
  const headers = {};
  if (err.status === 401) headers['WWW-Authenticate'] = 'Bearer';
  if (err.status === 405 && err.extra && err.extra.allow) headers.Allow = err.extra.allow;
  const extra = { ...err.extra };
  delete extra.allow;
  return errorResponse(err.status, err.code, extra, headers);
}

/** CORS headers for an allowed origin (null origin = no CORS headers). */
export function corsHeaders(origin, { preflight = false, methods = '' } = {}) {
  if (!origin) return {};
  const headers = {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
  if (preflight) {
    headers['Access-Control-Allow-Methods'] = methods;
    headers['Access-Control-Allow-Headers'] = ALLOWED_REQUEST_HEADERS;
    headers['Access-Control-Max-Age'] = PREFLIGHT_MAX_AGE;
  } else {
    headers['Access-Control-Expose-Headers'] = EXPOSED_HEADERS;
  }
  return headers;
}

/** Copy of `response` with the shared headers added (Cache-Control: no-store on every response). */
export function finalizeResponse(response, origin, corsOptions = {}) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!headers.has('Vary')) headers.set('Vary', 'Origin');
  for (const [key, value] of Object.entries(corsHeaders(origin, corsOptions))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
