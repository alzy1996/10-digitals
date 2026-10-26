import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/services/auth.js', () => ({
  getIdToken: vi.fn(async (force) => (force ? 'fresh-token' : 'id-token')),
}));

const { getIdToken } = await import('../../src/services/auth.js');
const { createCloudflareFlux, workerBaseUrl, parseQuota, REQUEST_TIMEOUT_MS, QUOTA_TIMEOUT_MS } = await import('../../src/ai/render/cloudflareFlux.js');
const { finalLookErrorInfo, unavailableReason } = await import('../../src/screens/approve/aiMessages.js');
const {
  FINAL_LOOK_PROMPT,
  FINAL_LOOK_SIZE,
  finalLookAvailable,
  finalLookCrop,
  getProvider,
  noneProvider,
  renderFinalLook,
} = await import('../../src/ai/render/provider.js');

const PRD_PROMPT =
  'Image 0 is a real photo of a man. Image 1 shows the exact target beard on the same man. Make the beard from image 1 photorealistic on the man in image 0. Keep his face, skin, eyes, hair, lighting, clothes and background exactly as in image 0. Match the beard shape, length, lines and color of image 1 exactly. Realistic hair strands, natural skin texture. No text.';

const jpeg = (name) => new Blob([`jpeg-${name}`], { type: 'image/jpeg' });
const request = () => ({ sourceJpeg: jpeg('source'), guideJpeg: jpeg('guide'), prompt: FINAL_LOOK_PROMPT, seed: 42, shopId: 'shop-1' });

function fakeResponse(status, { body = null, type = 'image/jpeg', json = null } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
    blob: async () => body || new Blob(['result-bytes'], { type }),
    json: async () => {
      if (json === null) throw new Error('not json');
      return json;
    },
  };
}

/** A synthetic landmark set: a face in the middle of a 800 x 1000 frame. */
function syntheticLandmarks() {
  const pts = [];
  for (let i = 0; i < 478; i++) {
    const a = (i / 478) * Math.PI * 2;
    pts.push({ x: 0.5 + 0.18 * Math.cos(a), y: 0.45 + 0.24 * Math.sin(a), z: 0 });
  }
  // Iris rings 11.7 mm across about 30 px.
  for (const [c, cx] of [[468, 0.42], [473, 0.58]]) {
    pts[c] = { x: cx, y: 0.38, z: 0 };
    pts[c + 1] = { x: cx + 0.019, y: 0.38, z: 0 };
    pts[c + 2] = { x: cx, y: 0.365, z: 0 };
    pts[c + 3] = { x: cx - 0.019, y: 0.38, z: 0 };
    pts[c + 4] = { x: cx, y: 0.395, z: 0 };
  }
  return pts;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getIdToken.mockClear();
});

describe('prompt and availability', () => {
  it('uses the PRD 7.5 prompt verbatim and a 504 px square', () => {
    expect(FINAL_LOOK_PROMPT).toBe(PRD_PROMPT);
    expect(FINAL_LOOK_SIZE).toBe(504);
    expect(FINAL_LOOK_SIZE).toBeLessThan(512);
  });

  it('is available only with AI preview on, a Worker URL and a connection', () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubEnv('VITE_AI_WORKER_URL', 'https://lihya-ai.example.workers.dev/');
    expect(workerBaseUrl()).toBe('https://lihya-ai.example.workers.dev');
    expect(finalLookAvailable({ aiPreview: true })).toBe(true);
    expect(finalLookAvailable({ aiPreview: false })).toBe(false);
    expect(finalLookAvailable({})).toBe(false);
    expect(finalLookAvailable(null)).toBe(false);
    vi.stubGlobal('navigator', { onLine: false });
    expect(finalLookAvailable({ aiPreview: true })).toBe(false);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubEnv('VITE_AI_WORKER_URL', '');
    expect(finalLookAvailable({ aiPreview: true })).toBe(false);
  });

  it('picks the none provider unless AI preview is on and configured', async () => {
    vi.stubEnv('VITE_AI_WORKER_URL', '');
    expect(getProvider({ aiPreview: true }).id).toBe('none');
    vi.stubEnv('VITE_AI_WORKER_URL', 'https://w.example');
    expect(getProvider({ aiPreview: true }).id).toBe('cloudflareFlux');
    expect(getProvider({ aiPreview: false }).id).toBe('none');
    await expect(noneProvider.render(request())).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('cloudflareFlux provider', () => {
  it('POSTs the multipart fields to /render with the Firebase ID token', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const fetchImpl = vi.fn(async () => fakeResponse(200));
    const p = createCloudflareFlux({ url: 'https://w.example/', fetchImpl });
    const blob = await p.render(request());
    expect(blob.size).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://w.example/render');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer id-token');
    expect(init.cache).toBe('no-store');
    const form = init.body;
    expect(form.get('prompt')).toBe(PRD_PROMPT);
    expect(form.get('seed')).toBe('42');
    expect(form.get('shopId')).toBe('shop-1');
    expect(await form.get('source').text()).toBe('jpeg-source');
    expect(await form.get('guide').text()).toBe('jpeg-guide');
  });

  it('maps HTTP 429 to the daily cap', async () => {
    const p = createCloudflareFlux({ url: 'https://w.example', fetchImpl: async () => fakeResponse(429, { type: 'application/json', json: { error: 'cap' } }) });
    await expect(p.render(request())).rejects.toMatchObject({ code: 'cap', status: 429 });
  });

  it('maps other errors to failed, and a disabled answer to disabled', async () => {
    const p500 = createCloudflareFlux({ url: 'https://w.example', fetchImpl: async () => fakeResponse(500, { type: 'text/plain' }) });
    await expect(p500.render(request())).rejects.toMatchObject({ code: 'failed', status: 500 });
    const off = createCloudflareFlux({ url: 'https://w.example', fetchImpl: async () => fakeResponse(403, { type: 'application/json', json: { code: 'disabled' } }) });
    await expect(off.render(request())).rejects.toMatchObject({ code: 'disabled' });
    const notImage = createCloudflareFlux({ url: 'https://w.example', fetchImpl: async () => fakeResponse(200, { type: 'text/html' }) });
    await expect(notImage.render(request())).rejects.toMatchObject({ code: 'failed' });
  });

  it('reports offline when the device is offline, failed when the Worker is unreachable', async () => {
    const reject = async () => {
      throw new TypeError('Failed to fetch');
    };
    vi.stubGlobal('navigator', { onLine: true });
    const p = createCloudflareFlux({ url: 'https://w.example', fetchImpl: reject });
    await expect(p.render(request())).rejects.toMatchObject({ code: 'failed', reason: 'network' });
    vi.stubGlobal('navigator', { onLine: false });
    await expect(p.render(request())).rejects.toMatchObject({ code: 'offline' });
  });

  it('is disabled without a Worker URL and refreshes an expired token once', async () => {
    await expect(createCloudflareFlux({ url: '', fetchImpl: async () => fakeResponse(200) }).render(request())).rejects.toMatchObject({ code: 'disabled' });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(401, { type: 'text/plain' }))
      .mockResolvedValueOnce(fakeResponse(200));
    const p = createCloudflareFlux({ url: 'https://w.example', fetchImpl });
    await p.render(request());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('times out with failed', async () => {
    vi.useFakeTimers();
    const fetchImpl = (url, init) =>
      new Promise((resolve, rejectFn) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          rejectFn(err);
        });
      });
    const p = createCloudflareFlux({ url: 'https://w.example', fetchImpl });
    const done = p.render(request());
    const check = expect(done).rejects.toMatchObject({ code: 'failed' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
    await check;
    vi.useRealTimers();
  });
});

describe('allowlist answers (SEC-08)', () => {
  it('maps not_allowed and email_not_verified to notAllowed with its own message', async () => {
    const json = (error) => async () => fakeResponse(403, { type: 'application/json', json: { error } });
    const notAllowed = createCloudflareFlux({ url: 'https://w.example', fetchImpl: json('not_allowed') });
    const err = await notAllowed.render(request()).catch((e) => e);
    expect(err).toMatchObject({ code: 'notAllowed', status: 403 });
    expect(finalLookErrorInfo(err)).toEqual({ code: 'notAllowed', key: 'approve.ai.notAllowed', retry: false });
    const unverified = createCloudflareFlux({ url: 'https://w.example', fetchImpl: json('email_not_verified') });
    const err2 = await unverified.render(request()).catch((e) => e);
    expect(err2).toMatchObject({ code: 'notAllowed', reason: 'emailNotVerified' });
    expect(finalLookErrorInfo(err2).key).toBe('approve.ai.emailNotVerified');
    const notStaff = createCloudflareFlux({ url: 'https://w.example', fetchImpl: json('not_staff') });
    await expect(notStaff.render(request())).rejects.toMatchObject({ code: 'failed' });
  });

  it('says before the consent when the Worker does not allow the shop or the cap is used up', () => {
    const base = { settings: { aiPreview: true }, online: true, available: true, hasLook: true, hasPhoto: true };
    expect(unavailableReason(base)).toBe(null);
    expect(unavailableReason({ ...base, quota: null })).toBe(null);
    expect(unavailableReason({ ...base, quota: { allowed: false, usedToday: 0, cap: 0 } })).toBe('notAllowed');
    expect(unavailableReason({ ...base, quota: { allowed: true, usedToday: 20, cap: 20 } })).toBe('cap');
    expect(unavailableReason({ ...base, quota: { allowed: true, usedToday: 3, cap: 20, accountUsed: 80, accountCap: 80 } })).toBe('cap');
    expect(unavailableReason({ ...base, quota: { allowed: true, usedToday: 3, cap: 20, accountUsed: 10, accountCap: 80 } })).toBe(null);
    expect(unavailableReason({ ...base, settings: { aiPreview: false }, quota: { allowed: false } })).toBe('disabled');
  });
});

describe('fetchAiQuota (GET /quota)', () => {
  const body = { usedToday: 3, cap: 20, accountUsed: 11, accountCap: 80, enabled: true, allowed: true, day: '2026-10-26', resetsAt: '2026-10-27T00:00:00.000Z' };

  it('sends the ID token and the App Check token, and returns the Worker day numbers', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const fetchImpl = vi.fn(async () => fakeResponse(200, { type: 'application/json', json: body }));
    const p = createCloudflareFlux({ url: 'https://w.example/', fetchImpl, getAppCheck: async () => 'app-check-token' });
    expect(await p.quota('shop 1')).toEqual(body);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://w.example/quota?shopId=shop%201');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check-token' });
    expect(init.cache).toBe('no-store');
  });

  it('leaves the App Check header out when there is no token, and refreshes an expired ID token once', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(401, { type: 'application/json', json: { error: 'auth' } }))
      .mockResolvedValueOnce(fakeResponse(200, { type: 'application/json', json: body }));
    const p = createCloudflareFlux({ url: 'https://w.example', fetchImpl, getAppCheck: async () => null });
    expect(await p.quota('s1')).toMatchObject({ usedToday: 3, cap: 20 });
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer id-token' });
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('resolves null without a URL, offline, on a refusal, a network error or a timeout', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = async () => fakeResponse(200, { type: 'application/json', json: body });
    expect(await createCloudflareFlux({ url: '', fetchImpl: ok }).quota('s1')).toBe(null);
    expect(await createCloudflareFlux({ url: 'https://w.example', fetchImpl: ok }).quota('')).toBe(null);
    const refused = async () => fakeResponse(403, { type: 'application/json', json: { error: 'not_staff' } });
    expect(await createCloudflareFlux({ url: 'https://w.example', fetchImpl: refused }).quota('s1')).toBe(null);
    const broken = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await createCloudflareFlux({ url: 'https://w.example', fetchImpl: broken }).quota('s1')).toBe(null);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await createCloudflareFlux({ url: 'https://w.example', fetchImpl: ok }).quota('s1')).toBe(null);
    vi.stubGlobal('navigator', { onLine: true });
    vi.useFakeTimers();
    const hang = (url, init) =>
      new Promise((resolve, rejectFn) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          rejectFn(err);
        });
      });
    const pending = createCloudflareFlux({ url: 'https://w.example', fetchImpl: hang }).quota('s1');
    await vi.advanceTimersByTimeAsync(QUOTA_TIMEOUT_MS + 10);
    expect(await pending).toBe(null);
    vi.useRealTimers();
    const ctrl = new AbortController();
    const stopped = createCloudflareFlux({ url: 'https://w.example', fetchImpl: hang }).quota('s1', { signal: ctrl.signal });
    ctrl.abort();
    expect(await stopped).toBe(null);
    warn.mockRestore();
  });

  it('keeps only well-formed numbers', () => {
    expect(parseQuota({ usedToday: -1, cap: '20', accountUsed: 2.7, accountCap: null, enabled: 'yes', day: 'today', resetsAt: 'soon' })).toEqual({
      usedToday: null,
      cap: null,
      accountUsed: 2,
      accountCap: null,
      enabled: null,
      allowed: null,
      day: null,
      resetsAt: null,
    });
    expect(parseQuota(null).usedToday).toBe(null);
  });
});

describe('renderFinalLook', () => {
  function fakeCanvasEnv() {
    const drawn = [];
    const make = () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect: () => {},
          drawImage: (...args) => drawn.push({ canvas, args }),
          set fillStyle(v) {},
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'low',
        }),
        toBlob: (cb, type) => cb(new Blob([`jpeg-${canvas.width}x${canvas.height}`], { type })),
      };
      return canvas;
    };
    vi.stubGlobal('document', { createElement: () => make() });
    return drawn;
  }

  it('sends the same square crop of the photo and the Studio render, 504 x 504', async () => {
    const drawn = fakeCanvasEnv();
    vi.stubGlobal('navigator', { onLine: true });
    const shot = { canvas: { width: 800, height: 1000 }, width: 800, height: 1000, landmarks: syntheticLandmarks() };
    const studioCanvas = { width: 640, height: 800 };
    const render = vi.fn(async () => new Blob(['ai'], { type: 'image/jpeg' }));
    const out = await renderFinalLook({ shot, studioCanvas, seed: 7, shopId: 'shop-9', provider: { id: 'test', render } });
    expect(out.blob.size).toBeGreaterThan(0);
    expect(out.url.startsWith('blob:')).toBe(true);
    URL.revokeObjectURL(out.url);
    const req = render.mock.calls[0][0];
    expect(req.prompt).toBe(PRD_PROMPT);
    expect(req.seed).toBe(7);
    expect(req.shopId).toBe('shop-9');
    expect(await req.sourceJpeg.text()).toBe('jpeg-504x504');
    expect(await req.guideJpeg.text()).toBe('jpeg-504x504');
    const [fromShot, fromStudio] = drawn;
    expect(fromShot.args[0]).toBe(shot.canvas);
    expect(fromStudio.args[0]).toBe(studioCanvas);
    const [sx, sy, sw, sh] = fromShot.args.slice(1, 5);
    expect(sw).toBeCloseTo(sh, 5);
    expect(fromStudio.args[1]).toBeCloseTo(sx * 0.8, 5);
    expect(fromStudio.args[2]).toBeCloseTo(sy * 0.8, 5);
    expect(fromStudio.args[3]).toBeCloseTo(sw * 0.8, 5);
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy + sh).toBeLessThanOrEqual(1000);
  });

  it('refuses without a face, when off or when offline', async () => {
    fakeCanvasEnv();
    const shot = { canvas: { width: 800, height: 1000 }, width: 800, height: 1000, landmarks: syntheticLandmarks() };
    await expect(renderFinalLook({ shot: { ...shot, landmarks: [] }, studioCanvas: { width: 800, height: 1000 }, shopId: 's' })).rejects.toMatchObject({ code: 'failed' });
    vi.stubEnv('VITE_AI_WORKER_URL', '');
    await expect(renderFinalLook({ shot, studioCanvas: { width: 800, height: 1000 }, shopId: 's' })).rejects.toMatchObject({ code: 'disabled' });
    vi.stubGlobal('navigator', { onLine: false });
    const render = vi.fn();
    await expect(renderFinalLook({ shot, studioCanvas: { width: 800, height: 1000 }, shopId: 's', provider: { id: 't', render } })).rejects.toMatchObject({ code: 'offline' });
    expect(render).not.toHaveBeenCalled();
  });

  it('finalLookCrop stays inside the frame', () => {
    const shot = { canvas: { width: 800, height: 1000 }, width: 800, height: 1000, landmarks: syntheticLandmarks() };
    const c = finalLookCrop(shot, { width: 400, height: 500 });
    expect(c.shot.w).toBe(c.shot.h);
    expect(c.shot.x).toBeGreaterThanOrEqual(0);
    expect(c.shot.y).toBeGreaterThanOrEqual(0);
    expect(c.shot.x + c.shot.w).toBeLessThanOrEqual(800);
    expect(c.shot.y + c.shot.h).toBeLessThanOrEqual(1000);
    expect(c.studio.w).toBeCloseTo(c.shot.w / 2, 5);
  });
});
