import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { bearerToken, verifyFirebaseIdToken } from '../src/auth.js';
import { makeKeys, NOW, PROJECT_ID, signToken, UID } from './helpers.js';

let keys;
let otherKeys;

beforeAll(async () => {
  keys = await makeKeys('kid-a');
  otherKeys = await makeKeys('kid-a');
});

async function expectHttpError(promise, status, code, reason) {
  let caught = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  expect(caught.name).toBe('HttpError');
  expect(caught.status).toBe(status);
  expect(caught.code).toBe(code);
  if (reason !== undefined) expect(caught.extra.reason).toBe(reason);
  return caught;
}

function verify(token, extra = {}) {
  return verifyFirebaseIdToken(token, { projectId: PROJECT_ID, jwks: keys.jwks, now: NOW, ...extra });
}

describe('verifyFirebaseIdToken', () => {
  it('accepts a valid Google sign-in token', async () => {
    const user = await verify(await signToken(keys));
    expect(user).toEqual({ uid: UID, provider: 'google.com', email: 'barber@example.com', emailVerified: true });
  });

  it('accepts an email-link (password provider) token', async () => {
    const token = await signToken(keys, { claims: { firebase: { sign_in_provider: 'password' } } });
    const user = await verify(token);
    expect(user.provider).toBe('password');
  });

  it('rejects anonymous sign-ins with 403', async () => {
    const token = await signToken(keys, { claims: { firebase: { sign_in_provider: 'anonymous' }, email: null } });
    await expectHttpError(verify(token), 403, 'anonymous');
  });

  it('rejects a token without the firebase claim', async () => {
    const token = await signToken(keys, { claims: { firebase: null } });
    await expectHttpError(verify(token), 401, 'auth', 'claims');
  });

  it('rejects the wrong audience', async () => {
    const token = await signToken(keys, { claims: { aud: 'another-project' } });
    await expectHttpError(verify(token), 401, 'auth', 'claims');
  });

  it('rejects the wrong issuer', async () => {
    const token = await signToken(keys, { claims: { iss: 'https://securetoken.google.com/another-project' } });
    await expectHttpError(verify(token), 401, 'auth', 'claims');
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await signToken(keys, { claims: { iat: now - 7200, exp: now - 3600, auth_time: now - 7200 } });
    await expectHttpError(verify(token), 401, 'auth', 'expired');
  });

  it('rejects a token issued in the future', async () => {
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await signToken(keys, { claims: { iat: now + 600, exp: now + 4200 } });
    await expectHttpError(verify(token), 401, 'auth', 'claims');
  });

  it('rejects auth_time in the future and a missing auth_time', async () => {
    const now = Math.floor(NOW.getTime() / 1000);
    await expectHttpError(verify(await signToken(keys, { claims: { auth_time: now + 600 } })), 401, 'auth', 'claims');
    await expectHttpError(verify(await signToken(keys, { claims: { auth_time: null } })), 401, 'auth', 'claims');
  });

  it('rejects an empty or too long subject', async () => {
    await expectHttpError(verify(await signToken(keys, { claims: { sub: '' } })), 401, 'auth');
    await expectHttpError(verify(await signToken(keys, { claims: { sub: 'x'.repeat(129) } })), 401, 'auth', 'claims');
  });

  it('rejects a token signed by another key with the same kid', async () => {
    const token = await signToken(keys, { signWith: otherKeys.privateKey });
    await expectHttpError(verify(token), 401, 'auth', 'signature');
  });

  it('rejects an unknown kid and a missing kid', async () => {
    await expectHttpError(verify(await signToken(keys, { kid: 'kid-unknown' })), 401, 'auth', 'signature');
    await expectHttpError(verify(await signToken(keys, { kid: null })), 401, 'auth', 'signature');
  });

  it('rejects a symmetric (HS256) token', async () => {
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await new SignJWT({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: UID,
      iat: now - 10,
      exp: now + 3000,
      auth_time: now - 10,
      firebase: { sign_in_provider: 'google.com' },
    })
      .setProtectedHeader({ alg: 'HS256', kid: 'kid-a' })
      .sign(new TextEncoder().encode('a-shared-secret-that-is-long-enough-123456'));
    const err = await expectHttpError(verify(token), 401, 'auth');
    expect(['algorithm', 'signature']).toContain(err.extra.reason);
  });

  it('rejects garbage and missing tokens', async () => {
    await expectHttpError(verify('not.a.token'), 401, 'auth', 'invalid');
    await expectHttpError(verify(''), 401, 'auth', 'missing');
  });

  it('answers 503 when Google keys cannot be loaded', async () => {
    const token = await signToken(keys);
    const failing = async () => {
      throw new TypeError('fetch failed');
    };
    await expectHttpError(verify(token, { jwks: failing }), 503, 'upstream');
  });

  it('needs a project id', async () => {
    const token = await signToken(keys);
    await expectHttpError(verifyFirebaseIdToken(token, { projectId: '', jwks: keys.jwks, now: NOW }), 500, 'config');
  });
});

describe('bearerToken', () => {
  const req = (value) => new Request('https://w.example/render', { headers: value === undefined ? {} : { Authorization: value } });

  it('reads a Bearer JWT', () => {
    expect(bearerToken(req('Bearer aaa.bbb.ccc'))).toBe('aaa.bbb.ccc');
    expect(bearerToken(req('Bearer   aaa.bbb.ccc'))).toBe('aaa.bbb.ccc');
    expect(bearerToken(req('bearer aaa.bbb.ccc'))).toBe('aaa.bbb.ccc');
  });

  it('refuses other schemes and malformed values', () => {
    expect(bearerToken(req(undefined))).toBeNull();
    expect(bearerToken(req('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(bearerToken(req('Bearer aaa.bbb'))).toBeNull();
    expect(bearerToken(req('Bearer aaa.bbb.ccc extra'))).toBeNull();
    expect(bearerToken(req(`Bearer ${'a'.repeat(5000)}.b.c`))).toBeNull();
  });
});
