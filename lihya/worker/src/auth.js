// Firebase ID token verification (PRD 7.5), done the way the Firebase docs
// describe for third-party JWT libraries:
//   header: alg RS256, kid = one of Google's securetoken public keys
//   payload: exp in the future, iat and auth_time in the past,
//            aud = <project id>, iss = https://securetoken.google.com/<project id>,
//            sub = non-empty uid (at most 128 characters)
// Anonymous sign-ins (Try at home customers) are refused: the AI Final Look is
// a chair-side feature for staff accounts only.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './http.js';

export const SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Small tolerance for clock drift between Google and Cloudflare.
export const CLOCK_SKEW_SECONDS = 10;
const MAX_TOKEN_LENGTH = 4096;

let remoteJwks = null;

/** Google's securetoken JWKS, fetched lazily and cached per isolate by jose. */
export function googleJwks() {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(SECURETOKEN_JWKS_URL), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 6 * 60 * 60 * 1000,
    });
  }
  return remoteJwks;
}

/** The token from "Authorization: Bearer <token>", or null. */
export function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer[ ]+([A-Za-z0-9_\-.]+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (token.length > MAX_TOKEN_LENGTH || token.split('.').length !== 3) return null;
  return token;
}

function authFail(reason) {
  return new HttpError(401, 'auth', { reason });
}

// Google's key set could not be loaded (network, timeout, bad response): not the caller's fault.
const KEY_SET_FAILURES = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC']);

function verifyError(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  if (code === '' || KEY_SET_FAILURES.has(code)) return new HttpError(503, 'upstream', { service: 'jwks' });
  if (code === 'ERR_JWT_EXPIRED') return authFail('expired');
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') return authFail('claims');
  if (code === 'ERR_JWKS_NO_MATCHING_KEY' || code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return authFail('signature');
  if (code === 'ERR_JOSE_ALG_NOT_ALLOWED') return authFail('algorithm');
  return authFail('invalid');
}

/**
 * Verify a Firebase ID token.
 * @param {string} token
 * @param {{ projectId: string, jwks?: Function, now?: Date }} options
 *   jwks: a jose key getter (tests inject createLocalJWKSet); defaults to Google's JWKS.
 * @returns {Promise<{ uid: string, provider: string, email: string|null, emailVerified: boolean }>}
 * @throws {HttpError} 401 'auth' (reason), 403 'anonymous', 503 'upstream' (key set unavailable)
 */
export async function verifyFirebaseIdToken(token, { projectId, jwks, now } = {}) {
  if (typeof projectId !== 'string' || projectId === '') throw new HttpError(500, 'config', { field: 'FIREBASE_PROJECT_ID' });
  if (typeof token !== 'string' || token === '') throw authFail('missing');

  const currentDate = now instanceof Date ? now : new Date();
  let payload;
  let header;
  try {
    const result = await jwtVerify(token, jwks || googleJwks(), {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate,
    });
    payload = result.payload;
    header = result.protectedHeader;
  } catch (err) {
    throw verifyError(err);
  }

  if (!header || typeof header.kid !== 'string' || header.kid === '') throw authFail('signature');

  const nowSec = Math.floor(currentDate.getTime() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - CLOCK_SKEW_SECONDS) throw authFail('expired');
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + CLOCK_SKEW_SECONDS) throw authFail('claims');
  if (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + CLOCK_SKEW_SECONDS) throw authFail('claims');
  if (typeof payload.sub !== 'string' || payload.sub === '' || payload.sub.length > 128) throw authFail('claims');

  const firebase = payload.firebase && typeof payload.firebase === 'object' ? payload.firebase : null;
  const provider = firebase && typeof firebase.sign_in_provider === 'string' ? firebase.sign_in_provider : '';
  if (provider === '') throw authFail('claims');
  if (provider === 'anonymous') throw new HttpError(403, 'anonymous');

  return {
    uid: payload.sub,
    provider,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
  };
}
