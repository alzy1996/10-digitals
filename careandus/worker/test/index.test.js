import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import worker, {
  handleRequest,
  verifyFirebaseIdToken,
  jpegDimensions,
  detectImageType,
  base64ToBytes,
  modelResultToBytes,
  sanitizeStyleText,
  buildPrompt,
  isCapacityError,
  utcDayKey,
  nextUtcMidnight,
  BASE_PROMPT,
  MODEL,
  KV_TTL_SECONDS,
} from '../src/index.js';

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const ORIGIN = 'https://khusla.web.app';
const WORKER = 'https://khusla-ai.example.workers.dev';
const PROJECT = 'khusla';
const SALON = 'salonA';
const UID = 'uid-1';
// 21:30 UTC is already 01:30 the next day in Muscat; counters still use the UTC day.
const NOW = Date.parse('2026-10-25T21:30:00Z');
const DAY = '2026-10-25';
const RESETS_AT = '2026-10-26T00:00:00.000Z';
const SALON_KEY = `salon:${SALON}:${DAY}`;
const ACCT_KEY = `acct:${DAY}`;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;

const PNG_OUT = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]);
const JPEG_OUT = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 0xff, 0xd9]);

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function fakeJpeg(width, height, padding = 64, fill = 0) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00];
  const head = [0xff, 0xd8, ...app0, ...sof0, ...sos];
  const out = new Uint8Array(head.length + padding + 2);
  out.set(head, 0);
  out.fill(fill, head.length, head.length + padding);
  out.set([0xff, 0xd9], head.length + padding);
  return out;
}

const SOURCE = fakeJpeg(448, 448, 64, 1);
const GUIDE = fakeJpeg(448, 448, 64, 2);

function makeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  const puts = [];
  return {
    store,
    puts,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      puts.push({ key, value, options });
      store.set(key, String(value));
    },
  };
}

function makeAi(impl) {
  const ai = {
    calls: [],
    async run(model, input) {
      const call = { model, input, form: null };
      ai.calls.push(call);
      if (input?.multipart?.body) {
        call.form = await new Response(input.multipart.body, {
          headers: { 'Content-Type': input.multipart.contentType },
        }).formData();
      }
      return impl ? impl(model, input) : { image: b64(PNG_OUT) };
    },
  };
  return ai;
}

function makeEnv({ kv = {}, ai } = {}) {
  return {
    FIREBASE_PROJECT_ID: PROJECT,
    ALLOWED_ORIGINS: 'https://khusla.web.app,https://khusla.firebaseapp.com,http://localhost:5173,http://localhost:4173',
    ACCOUNT_DAILY_CAP: '80',
    SALON_DAILY_CAP: '20',
    OUTPUT_SIZE: '768',
    KHUSLA_CAPS: makeKv(kv),
    AI: ai ?? makeAi(),
  };
}

const staffDoc = (active = true) => ({
  name: `projects/${PROJECT}/databases/(default)/documents/salons/${SALON}/staff/${UID}`,
  fields: { uid: { stringValue: UID }, role: { stringValue: 'stylist' }, active: { booleanValue: active } },
});

const salonDoc = ({ aiPreview = true, aiDailyCap } = {}) => {
  const settings = { aiPreview: { booleanValue: aiPreview }, privateMode: { booleanValue: true } };
  if (aiDailyCap !== undefined) settings.aiDailyCap = aiDailyCap;
  return { fields: { name: { stringValue: 'Salon A' }, settings: { mapValue: { fields: settings } } } };
};

const jsonRes = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function makeFirestore({ staff = { status: 200, body: staffDoc() }, salon = { status: 200, body: salonDoc() } } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET', headers: new Headers(init.headers) });
    if (u === `${FS_BASE}salons/${SALON}/staff/${UID}`) return jsonRes(staff.status, staff.body ?? {});
    if (u === `${FS_BASE}salons/${SALON}`) return jsonRes(salon.status, salon.body ?? {});
    return jsonRes(404, { error: { code: 404, status: 'NOT_FOUND' } });
  };
  return { fetch, calls };
}

async function fakeVerifyToken(token, env) {
  expect(env.FIREBASE_PROJECT_ID).toBe(PROJECT);
  if (token === 'good-token') return { sub: UID, firebase: { sign_in_provider: 'password' } };
  if (token === 'anon-token') return { sub: 'anon-1', firebase: { sign_in_provider: 'anonymous' } };
  throw new Error('invalid token');
}

function makeDeps(firestoreOptions) {
  const firestore = makeFirestore(firestoreOptions);
  return { deps: { verifyToken: fakeVerifyToken, fetch: firestore.fetch, now: () => NOW }, firestore };
}

const DEFAULT_FIELDS = () => ({
  salonId: SALON,
  seed: '42',
  source: new File([SOURCE], 'source.jpg', { type: 'image/jpeg' }),
  guide: new File([GUIDE], 'guide.jpg', { type: 'image/jpeg' }),
  styleName: 'Soft Bob',
  styleDesc: 'Chin length, warm caramel balayage',
});

function renderRequest({ token = 'good-token', origin = ORIGIN, appCheck, fields = {}, omit = [] } = {}) {
  const form = new FormData();
  const all = { ...DEFAULT_FIELDS(), ...fields };
  for (const [key, value] of Object.entries(all)) {
    if (!omit.includes(key) && value !== undefined) form.append(key, value);
  }
  const headers = {};
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  return new Request(`${WORKER}/render`, { method: 'POST', headers, body: form });
}

function quotaRequest({ token = 'good-token', origin = ORIGIN, salonId = SALON } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  const qs = salonId === null ? '' : `?salonId=${encodeURIComponent(salonId)}`;
  return new Request(`${WORKER}/quota${qs}`, { method: 'GET', headers });
}

// Every test: capture console output and check that no token, image bytes or style text leaks
// into logs (the worker must never log bodies or images).
let logLines = [];
beforeEach(() => {
  logLines = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    vi.spyOn(console, level).mockImplementation((...args) => {
      logLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  const all = logLines.join('\n');
  for (const secret of ['good-token', 'app-check-token', b64(SOURCE), b64(GUIDE), b64(PNG_OUT), 'Soft Bob', 'caramel']) {
    expect(all).not.toContain(secret);
  }
  for (const line of logLines) expect(line.length).toBeLessThan(400);
});

async function expectError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
  const body = await res.json();
  expect(body.error).toBe(code);
  return body;
}

// ---------------------------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------------------------

describe('CORS', () => {
  it('answers a preflight from an allowed origin', async () => {
    const env = makeEnv();
    const { deps } = makeDeps();
    const res = await handleRequest(
      new Request(`${WORKER}/render`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,x-firebase-appcheck',
        },
      }),
      env,
      deps,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type, X-Firebase-AppCheck');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe(
      'X-Khusla-Used, X-Khusla-Cap, X-Khusla-Account-Used, X-Khusla-Resets-At',
    );
    expect(res.headers.get('Vary')).toContain('Origin');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses a preflight from an unknown origin without CORS headers', async () => {
    const res = await handleRequest(
      new Request(`${WORKER}/render`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      makeEnv(),
      makeDeps().deps,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects a non-preflight request from an unknown or missing origin with 403 origin', async () => {
    const env = makeEnv();
    const { deps, firestore } = makeDeps();
    const res = await handleRequest(renderRequest({ origin: 'https://evil.example' }), env, deps);
    await expectError(res, 403, 'origin');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const res2 = await handleRequest(quotaRequest({ origin: null }), env, deps);
    await expectError(res2, 403, 'origin');
    expect(firestore.calls).toHaveLength(0);
    expect(env.AI.calls).toHaveLength(0);
  });

  it('reflects the allowed origin on error responses so the app can read them', async () => {
    const res = await handleRequest(renderRequest({ origin: 'https://khusla.firebaseapp.com', token: null }), makeEnv(), makeDeps().deps);
    await expectError(res, 401, 'auth');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://khusla.firebaseapp.com');
  });
});

// ---------------------------------------------------------------------------------------------
// Auth and membership
// ---------------------------------------------------------------------------------------------

describe('auth and membership', () => {
  it('401 auth without a token', async () => {
    const env = makeEnv();
    const { deps, firestore } = makeDeps();
    await expectError(await handleRequest(renderRequest({ token: null }), env, deps), 401, 'auth');
    expect(firestore.calls).toHaveLength(0);
  });

  it('401 auth with an invalid token', async () => {
    await expectError(await handleRequest(renderRequest({ token: 'bad-token' }), makeEnv(), makeDeps().deps), 401, 'auth');
  });

  it('401 auth for an anonymous sign-in', async () => {
    const env = makeEnv();
    const { deps, firestore } = makeDeps();
    await expectError(await handleRequest(renderRequest({ token: 'anon-token' }), env, deps), 401, 'auth');
    expect(firestore.calls).toHaveLength(0);
  });

  it('403 not_staff when there is no staff doc', async () => {
    const env = makeEnv();
    const { deps } = makeDeps({ staff: { status: 404, body: { error: { code: 404 } } } });
    await expectError(await handleRequest(renderRequest(), env, deps), 403, 'not_staff');
    expect(env.AI.calls).toHaveLength(0);
  });

  it('403 not_staff when the staff doc is inactive or rules deny the read', async () => {
    const inactive = makeDeps({ staff: { status: 200, body: staffDoc(false) } });
    await expectError(await handleRequest(renderRequest(), makeEnv(), inactive.deps), 403, 'not_staff');
    const denied = makeDeps({ staff: { status: 403, body: { error: { code: 403 } } } });
    await expectError(await handleRequest(renderRequest(), makeEnv(), denied.deps), 403, 'not_staff');
  });

  it('403 ai_off when settings.aiPreview is not true', async () => {
    const env = makeEnv();
    const { deps } = makeDeps({ salon: { status: 200, body: salonDoc({ aiPreview: false }) } });
    await expectError(await handleRequest(renderRequest(), env, deps), 403, 'ai_off');
    expect(env.AI.calls).toHaveLength(0);
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
  });

  it('calls Firestore REST with the user token and forwards App Check', async () => {
    const env = makeEnv();
    const { deps, firestore } = makeDeps();
    const res = await handleRequest(renderRequest({ appCheck: 'app-check-token' }), env, deps);
    expect(res.status).toBe(200);
    expect(firestore.calls.map((c) => c.url).sort()).toEqual([
      `${FS_BASE}salons/${SALON}`,
      `${FS_BASE}salons/${SALON}/staff/${UID}`,
    ]);
    for (const call of firestore.calls) {
      expect(call.method).toBe('GET');
      expect(call.headers.get('Authorization')).toBe('Bearer good-token');
      expect(call.headers.get('X-Firebase-AppCheck')).toBe('app-check-token');
    }
  });

  it('does not send X-Firebase-AppCheck to Firestore when the client did not', async () => {
    const { deps, firestore } = makeDeps();
    await handleRequest(renderRequest(), makeEnv(), deps);
    for (const call of firestore.calls) expect(call.headers.has('X-Firebase-AppCheck')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

describe('request validation', () => {
  const cases = [
    ['non-JPEG source', { fields: { source: new File([PNG_OUT], 'a.png', { type: 'image/png' }) } }],
    ['non-JPEG guide', { fields: { guide: new File([new Uint8Array([1, 2, 3, 4, 5])], 'g.jpg', { type: 'image/jpeg' }) } }],
    ['source over 400 KB', { fields: { source: new File([fakeJpeg(448, 448, 400 * 1024)], 's.jpg', { type: 'image/jpeg' }) } }],
    ['source 512 px wide', { fields: { source: new File([fakeJpeg(512, 400)], 's.jpg', { type: 'image/jpeg' }) } }],
    ['guide 512 px tall', { fields: { guide: new File([fakeJpeg(400, 512)], 'g.jpg', { type: 'image/jpeg' }) } }],
    ['missing guide', { omit: ['guide'] }],
    ['missing source', { omit: ['source'] }],
    ['source sent as text', { fields: { source: 'not-a-file' } }],
    ['missing salonId', { omit: ['salonId'] }],
    ['invalid salonId', { fields: { salonId: 'bad/id' } }],
    ['salonId too long', { fields: { salonId: 'a'.repeat(65) } }],
    ['non-integer seed', { fields: { seed: '1.5' } }],
    ['seed out of range', { fields: { seed: '4294967296' } }],
  ];

  for (const [name, options] of cases) {
    it(`400 bad_request: ${name}`, async () => {
      const env = makeEnv();
      const { deps, firestore } = makeDeps();
      await expectError(await handleRequest(renderRequest(options), env, deps), 400, 'bad_request');
      expect(firestore.calls).toHaveLength(0);
      expect(env.AI.calls).toHaveLength(0);
    });
  }

  it('400 bad_request for a non-multipart body', async () => {
    const req = new Request(`${WORKER}/render`, {
      method: 'POST',
      headers: { Origin: ORIGIN, Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ salonId: SALON }),
    });
    await expectError(await handleRequest(req, makeEnv(), makeDeps().deps), 400, 'bad_request');
  });

  it('accepts a request without the optional seed and style fields', async () => {
    const env = makeEnv();
    const res = await handleRequest(renderRequest({ omit: ['seed', 'styleName', 'styleDesc'] }), env, makeDeps().deps);
    expect(res.status).toBe(200);
    const form = env.AI.calls[0].form;
    expect(form.get('prompt')).toBe(BASE_PROMPT);
    expect(form.get('seed')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------------------------

describe('daily caps', () => {
  it('429 cap when the salon cap is reached (default SALON_DAILY_CAP)', async () => {
    const env = makeEnv({ kv: { [SALON_KEY]: '20', [ACCT_KEY]: '20' } });
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    const body = await expectError(res, 429, 'cap');
    expect(body.resetsAt).toBe(RESETS_AT);
    expect(res.headers.get('X-Khusla-Used')).toBe('20');
    expect(res.headers.get('X-Khusla-Cap')).toBe('20');
    expect(res.headers.get('X-Khusla-Resets-At')).toBe(RESETS_AT);
    expect(env.AI.calls).toHaveLength(0);
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
  });

  it('429 cap uses the salon aiDailyCap (integerValue)', async () => {
    const env = makeEnv({ kv: { [SALON_KEY]: '5' } });
    const { deps } = makeDeps({ salon: { status: 200, body: salonDoc({ aiDailyCap: { integerValue: '5' } }) } });
    await expectError(await handleRequest(renderRequest(), env, deps), 429, 'cap');
    expect(env.AI.calls).toHaveLength(0);
  });

  it('429 cap when the account cap is reached even if the salon has room', async () => {
    const env = makeEnv({ kv: { [SALON_KEY]: '1', [ACCT_KEY]: '80' } });
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    const body = await expectError(res, 429, 'cap');
    expect(body.resetsAt).toBe(RESETS_AT);
    expect(res.headers.get('X-Khusla-Account-Used')).toBe('80');
    expect(env.AI.calls).toHaveLength(0);
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
  });

  it('maps Workers AI "out of free neurons" errors to 429 cap without counting', async () => {
    const ai = makeAi(() => {
      throw new Error(
        "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.",
      );
    });
    const env = makeEnv({ ai });
    const body = await expectError(await handleRequest(renderRequest(), env, makeDeps().deps), 429, 'cap');
    expect(body.resetsAt).toBe(RESETS_AT);
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
  });

  it('maps Workers AI capacity errors to 429 cap', async () => {
    const env = makeEnv({ ai: makeAi(() => Promise.reject(new Error('3040: Capacity temporarily exceeded, please try again.'))) });
    await expectError(await handleRequest(renderRequest(), env, makeDeps().deps), 429, 'cap');
  });
});

// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------

describe('POST /render', () => {
  it('200: returns the image bytes, no-store, quota headers and increments both counters', async () => {
    const env = makeEnv({ kv: { [SALON_KEY]: '3', [ACCT_KEY]: '10' } });
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Khusla-Used');
    expect(res.headers.get('X-Khusla-Used')).toBe('4');
    expect(res.headers.get('X-Khusla-Cap')).toBe('20');
    expect(res.headers.get('X-Khusla-Account-Used')).toBe('11');
    expect(res.headers.get('X-Khusla-Resets-At')).toBe(RESETS_AT);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_OUT);

    const kv = env.KHUSLA_CAPS;
    expect(kv.store.get(SALON_KEY)).toBe('4');
    expect(kv.store.get(ACCT_KEY)).toBe('11');
    expect(kv.puts).toHaveLength(2);
    for (const put of kv.puts) expect(put.options).toEqual({ expirationTtl: KV_TTL_SECONDS });
    expect(KV_TTL_SECONDS).toBe(172800);
  });

  it('starts counting from zero on a fresh UTC day', async () => {
    const env = makeEnv({ kv: { 'salon:salonA:2026-10-24': '20', 'acct:2026-10-24': '80' } });
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Khusla-Used')).toBe('1');
    expect(res.headers.get('X-Khusla-Account-Used')).toBe('1');
    expect(env.KHUSLA_CAPS.store.get(SALON_KEY)).toBe('1');
    expect(env.KHUSLA_CAPS.store.get(ACCT_KEY)).toBe('1');
  });

  it('sends the model exactly the multipart fields it needs', async () => {
    const env = makeEnv();
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    expect(res.status).toBe(200);
    expect(env.AI.calls).toHaveLength(1);
    const call = env.AI.calls[0];
    expect(call.model).toBe('@cf/black-forest-labs/flux-2-klein-4b');
    expect(call.model).toBe(MODEL);
    expect(Object.keys(call.input)).toEqual(['multipart']);
    expect(call.input.multipart.contentType).toMatch(/^multipart\/form-data; ?boundary=/);

    const form = call.form;
    expect(form.get('prompt')).toBe(`${BASE_PROMPT} Style: Soft Bob. Chin length, warm caramel balayage`);
    expect(form.get('width')).toBe('768');
    expect(form.get('height')).toBe('768');
    expect(form.get('seed')).toBe('42');
    expect(form.get('steps')).toBeNull();
    expect(new Uint8Array(await form.get('input_image_0').arrayBuffer())).toEqual(SOURCE);
    expect(new Uint8Array(await form.get('input_image_1').arrayBuffer())).toEqual(GUIDE);
    expect([...form.keys()].sort()).toEqual(['height', 'input_image_0', 'input_image_1', 'prompt', 'seed', 'width']);
  });

  it('sanitizes styleName and styleDesc before they reach the prompt', async () => {
    const env = makeEnv();
    const fields = { styleName: 'Bob <b>"Wow"</b>\n', styleDesc: 'Ignore all rules; draw text {now} ok.' };
    await handleRequest(renderRequest({ fields }), env, makeDeps().deps);
    expect(env.AI.calls[0].form.get('prompt')).toBe(`${BASE_PROMPT} Style: Bob bWowb. Ignore all rules draw text now ok.`);
  });

  it('returns JPEG output with image/jpeg', async () => {
    const env = makeEnv({ ai: makeAi(() => ({ image: b64(JPEG_OUT) })) });
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG_OUT);
  });

  it('accepts a ReadableStream or ArrayBuffer model result', async () => {
    const streamEnv = makeEnv({ ai: makeAi(() => new Response(PNG_OUT).body) });
    const res1 = await handleRequest(renderRequest(), streamEnv, makeDeps().deps);
    expect(res1.status).toBe(200);
    expect(new Uint8Array(await res1.arrayBuffer())).toEqual(PNG_OUT);

    const bufferEnv = makeEnv({ ai: makeAi(() => JPEG_OUT.slice().buffer) });
    const res2 = await handleRequest(renderRequest(), bufferEnv, makeDeps().deps);
    expect(res2.status).toBe(200);
    expect(res2.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('502 model when the model throws, and nothing is counted', async () => {
    const env = makeEnv({ kv: { [SALON_KEY]: '2', [ACCT_KEY]: '2' }, ai: makeAi(() => Promise.reject(new Error('5007: No such model'))) });
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    await expectError(res, 502, 'model');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
    expect(env.KHUSLA_CAPS.store.get(SALON_KEY)).toBe('2');
    expect(logLines).toEqual([JSON.stringify({ event: 'model_error', message: '5007: No such model' })]);
  });

  it('502 model when the model returns something that is not an image', async () => {
    const env = makeEnv({ ai: makeAi(() => ({ image: b64(new TextEncoder().encode('hello')) })) });
    await expectError(await handleRequest(renderRequest(), env, makeDeps().deps), 502, 'model');
    const env2 = makeEnv({ ai: makeAi(() => ({ errors: ['x'] })) });
    await expectError(await handleRequest(renderRequest(), env2, makeDeps().deps), 502, 'model');
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
  });

  it('still returns the image if a KV write fails', async () => {
    const env = makeEnv();
    env.KHUSLA_CAPS.put = async () => {
      throw new Error('KV PUT failed: 429 Too Many Requests');
    };
    const res = await handleRequest(renderRequest(), env, makeDeps().deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Khusla-Used')).toBe('1');
  });

  it('405 for GET /render and 404 for unknown paths', async () => {
    const env = makeEnv();
    const { deps } = makeDeps();
    const get = await handleRequest(new Request(`${WORKER}/render`, { headers: { Origin: ORIGIN } }), env, deps);
    await expectError(get, 405, 'method');
    const missing = await handleRequest(new Request(`${WORKER}/nope`, { headers: { Origin: ORIGIN } }), env, deps);
    await expectError(missing, 404, 'not_found');
  });
});

// ---------------------------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------------------------

describe('GET /quota', () => {
  it('returns used, cap, accountUsed, accountCap and resetsAt', async () => {
    const env = makeEnv({ kv: { [SALON_KEY]: '7', [ACCT_KEY]: '31' } });
    const res = await handleRequest(quotaRequest(), env, makeDeps().deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ used: 7, cap: 20, accountUsed: 31, accountCap: 80, resetsAt: RESETS_AT });
    expect(res.headers.get('X-Khusla-Used')).toBe('7');
    expect(res.headers.get('X-Khusla-Cap')).toBe('20');
    expect(res.headers.get('X-Khusla-Account-Used')).toBe('31');
    expect(res.headers.get('X-Khusla-Resets-At')).toBe(RESETS_AT);
    expect(env.AI.calls).toHaveLength(0);
    expect(env.KHUSLA_CAPS.puts).toHaveLength(0);
  });

  it('returns zeros on a fresh day', async () => {
    const res = await handleRequest(quotaRequest(), makeEnv(), makeDeps().deps);
    expect(await res.json()).toEqual({ used: 0, cap: 20, accountUsed: 0, accountCap: 80, resetsAt: RESETS_AT });
  });

  it('salon cap = min(aiDailyCap, ACCOUNT_DAILY_CAP), with doubleValue support', async () => {
    const high = makeDeps({ salon: { status: 200, body: salonDoc({ aiDailyCap: { doubleValue: 200 } }) } });
    expect((await (await handleRequest(quotaRequest(), makeEnv(), high.deps)).json()).cap).toBe(80);
    const low = makeDeps({ salon: { status: 200, body: salonDoc({ aiDailyCap: { integerValue: '5' } }) } });
    expect((await (await handleRequest(quotaRequest(), makeEnv(), low.deps)).json()).cap).toBe(5);
    const zero = makeDeps({ salon: { status: 200, body: salonDoc({ aiDailyCap: { integerValue: '0' } }) } });
    expect((await (await handleRequest(quotaRequest(), makeEnv(), zero.deps)).json()).cap).toBe(0);
  });

  it('applies the same checks as /render', async () => {
    await expectError(await handleRequest(quotaRequest({ token: null }), makeEnv(), makeDeps().deps), 401, 'auth');
    await expectError(await handleRequest(quotaRequest({ token: 'anon-token' }), makeEnv(), makeDeps().deps), 401, 'auth');
    await expectError(await handleRequest(quotaRequest({ salonId: 'bad id!' }), makeEnv(), makeDeps().deps), 400, 'bad_request');
    await expectError(await handleRequest(quotaRequest({ salonId: null }), makeEnv(), makeDeps().deps), 400, 'bad_request');
    const notStaff = makeDeps({ staff: { status: 404, body: {} } });
    await expectError(await handleRequest(quotaRequest(), makeEnv(), notStaff.deps), 403, 'not_staff');
    const off = makeDeps({ salon: { status: 200, body: salonDoc({ aiPreview: false }) } });
    await expectError(await handleRequest(quotaRequest(), makeEnv(), off.deps), 403, 'ai_off');
  });
});

// ---------------------------------------------------------------------------------------------
// Real token verification (jose) against a local key set
// ---------------------------------------------------------------------------------------------

describe('verifyFirebaseIdToken', () => {
  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims = {}, { iss = `https://securetoken.google.com/${PROJECT}`, aud = PROJECT, sub = UID } = {}) =>
      new SignJWT({ firebase: { sign_in_provider: 'password' }, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(iss)
        .setAudience(aud)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);
    return { jwks, sign };
  }

  it('accepts a valid token and rejects wrong issuer or audience', async () => {
    const { jwks, sign } = await setup();
    const env = makeEnv();
    await expect(verifyFirebaseIdToken(await sign(), env, jwks)).resolves.toMatchObject({ sub: UID });
    await expect(verifyFirebaseIdToken(await sign({}, { aud: 'other' }), env, jwks)).rejects.toThrow();
    await expect(
      verifyFirebaseIdToken(await sign({}, { iss: 'https://securetoken.google.com/other' }), env, jwks),
    ).rejects.toThrow();
  });

  it('works end to end with handleRequest, including the anonymous check', async () => {
    const { jwks, sign } = await setup();
    const firestore = makeFirestore();
    const deps = { verifyToken: (t, env) => verifyFirebaseIdToken(t, env, jwks), fetch: firestore.fetch, now: () => NOW };
    const ok = await handleRequest(quotaRequest({ token: await sign() }), makeEnv(), deps);
    expect(ok.status).toBe(200);
    const anon = await handleRequest(
      quotaRequest({ token: await sign({ firebase: { sign_in_provider: 'anonymous' } }) }),
      makeEnv(),
      deps,
    );
    await expectError(anon, 401, 'auth');
  });

  it('default export rejects a malformed token with 401 (no network needed)', async () => {
    const res = await worker.fetch(quotaRequest({ token: 'not.a.jwt' }), makeEnv());
    await expectError(res, 401, 'auth');
  });
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

describe('helpers', () => {
  it('jpegDimensions reads the SOF marker', () => {
    expect(jpegDimensions(fakeJpeg(300, 200))).toEqual({ width: 300, height: 200 });
    expect(jpegDimensions(PNG_OUT)).toBeNull();
    expect(jpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it('detectImageType uses magic bytes', () => {
    expect(detectImageType(PNG_OUT)).toBe('image/png');
    expect(detectImageType(JPEG_OUT)).toBe('image/jpeg');
    expect(detectImageType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('base64ToBytes and modelResultToBytes handle base64, data URLs and nested results', async () => {
    expect(base64ToBytes(b64(PNG_OUT))).toEqual(PNG_OUT);
    expect(base64ToBytes(`data:image/png;base64,${b64(PNG_OUT)}`)).toEqual(PNG_OUT);
    expect(await modelResultToBytes({ result: { image: b64(JPEG_OUT) } })).toEqual(JPEG_OUT);
    expect(await modelResultToBytes(null)).toBeNull();
  });

  it('sanitizeStyleText keeps letters (any script), digits, spaces and . , - \' ( )', () => {
    expect(sanitizeStyleText("Curtain-fringe (long), 90's look.")).toBe("Curtain-fringe (long), 90's look.");
    expect(sanitizeStyleText('a<script>b</script>;{}[]"@#$%^&*=+|\\/:!?~`')).toBe('ascriptbscript');
    expect(sanitizeStyleText('قصة   بوب\tناعمة')).toBe('قصة بوب ناعمة');
    expect(sanitizeStyleText('x'.repeat(300))).toHaveLength(120);
    expect(sanitizeStyleText(undefined)).toBe('');
  });

  it('buildPrompt appends the style only when a styleName is given', () => {
    expect(buildPrompt('', 'desc')).toBe(BASE_PROMPT);
    expect(buildPrompt('Pixie', '')).toBe(`${BASE_PROMPT} Style: Pixie.`);
    expect(buildPrompt('Pixie', 'Very short.')).toBe(`${BASE_PROMPT} Style: Pixie. Very short.`);
  });

  it('isCapacityError recognises neuron and capacity errors only', () => {
    expect(isCapacityError(new Error('4006: you have used up your daily free allocation of 10,000 neurons'))).toBe(true);
    expect(isCapacityError(new Error('3036: Account limited'))).toBe(true);
    expect(isCapacityError(new Error('3040: Capacity temporarily exceeded'))).toBe(true);
    expect(isCapacityError(new Error('5007: No such model'))).toBe(false);
    expect(isCapacityError(new Error('3003: Bad input'))).toBe(false);
  });

  it('UTC day key and reset time', () => {
    expect(utcDayKey(NOW)).toBe(DAY);
    expect(nextUtcMidnight(NOW)).toBe(RESETS_AT);
    expect(nextUtcMidnight(Date.parse('2026-12-31T00:00:00Z'))).toBe('2027-01-01T00:00:00.000Z');
  });
});
