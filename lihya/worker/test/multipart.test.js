import { describe, expect, it } from 'vitest';
import { parseRenderForm, parseSeed, readBodyLimited } from '../src/multipart.js';
import { jpegBytes, PNG_BYTES, renderRequest, SHOP_ID, WORKER_URL } from './helpers.js';

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
}

const fields = (extra = {}) => ({
  shopId: SHOP_ID,
  seed: '42',
  source: jpegBytes(504, 504),
  guide: jpegBytes(504, 504),
  ...extra,
});

describe('parseRenderForm', () => {
  it('reads shopId, seed and both JPEGs, ignoring a client prompt', async () => {
    const parsed = await parseRenderForm(renderRequest({ fields: fields({ prompt: 'draw a cat' }) }));
    expect(parsed.shopId).toBe(SHOP_ID);
    expect(parsed.seed).toBe(42);
    expect(parsed.source).toMatchObject({ width: 504, height: 504 });
    expect(parsed.guide.bytes).toEqual(jpegBytes(504, 504));
    expect(Object.keys(parsed).sort()).toEqual(['guide', 'seed', 'shopId', 'source']);
  });

  it('draws a random seed when none is sent', async () => {
    const f = fields();
    delete f.seed;
    const parsed = await parseRenderForm(renderRequest({ fields: f }), { random: () => 9 });
    expect(parsed.seed).toBe(9);
  });

  it('refuses a missing image', async () => {
    const f = fields();
    delete f.guide;
    const err = await failure(parseRenderForm(renderRequest({ fields: f })));
    expect(err).toMatchObject({ status: 400, code: 'bad_request', extra: { field: 'guide', reason: 'missing' } });
  });

  it('refuses images of 512 px or more on a side', async () => {
    const err = await failure(parseRenderForm(renderRequest({ fields: fields({ source: jpegBytes(512, 504) }) })));
    expect(err).toMatchObject({ status: 400, extra: { field: 'source', reason: 'too_big' } });
    const tall = await failure(parseRenderForm(renderRequest({ fields: fields({ guide: jpegBytes(504, 1024) }) })));
    expect(tall).toMatchObject({ status: 400, extra: { field: 'guide', reason: 'too_big' } });
  });

  it('accepts 511 px and refuses tiny images', async () => {
    const ok = await parseRenderForm(renderRequest({ fields: fields({ source: jpegBytes(511, 511) }) }));
    expect(ok.source.width).toBe(511);
    const err = await failure(parseRenderForm(renderRequest({ fields: fields({ source: jpegBytes(63, 504) }) })));
    expect(err).toMatchObject({ status: 400, extra: { field: 'source', reason: 'too_small' } });
  });

  it('refuses a PNG sent as source', async () => {
    const err = await failure(parseRenderForm(renderRequest({ fields: fields({ source: PNG_BYTES }) })));
    expect(err).toMatchObject({ status: 400, extra: { field: 'source', reason: 'not_jpeg' } });
  });

  it('refuses a bad or repeated shopId', async () => {
    const bad = await failure(parseRenderForm(renderRequest({ fields: fields({ shopId: 'a/b' }) })));
    expect(bad).toMatchObject({ status: 400, extra: { field: 'shopId' } });

    const form = new FormData();
    form.append('shopId', SHOP_ID);
    form.append('shopId', 'other');
    form.append('source', new Blob([jpegBytes(504, 504)], { type: 'image/jpeg' }), 's.jpg');
    form.append('guide', new Blob([jpegBytes(504, 504)], { type: 'image/jpeg' }), 'g.jpg');
    const req = new Request(`${WORKER_URL}/render`, { method: 'POST', body: form });
    const repeated = await failure(parseRenderForm(req));
    expect(repeated).toMatchObject({ status: 400, extra: { field: 'shopId', reason: 'repeated' } });
  });

  it('refuses a body that is not multipart', async () => {
    const req = new Request(`${WORKER_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: SHOP_ID }),
    });
    const err = await failure(parseRenderForm(req));
    expect(err).toMatchObject({ status: 415, code: 'media_type' });
  });

  it('refuses a declared body over the limit without reading it', async () => {
    const req = new Request(`${WORKER_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(3 * 1024 * 1024) },
      body: 'x',
    });
    const err = await failure(parseRenderForm(req));
    expect(err).toMatchObject({ status: 413, code: 'too_large' });
  });

  it('refuses a streamed body over the limit', async () => {
    let sent = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent >= 10) {
          controller.close();
          return;
        }
        sent += 1;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const req = new Request(`${WORKER_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
      body: stream,
      duplex: 'half',
    });
    const err = await failure(parseRenderForm(req, { maxBytes: 200 * 1024 }));
    expect(err).toMatchObject({ status: 413, code: 'too_large' });
    expect(sent).toBeLessThan(10);
  });

  it('refuses a broken multipart body', async () => {
    const req = new Request(`${WORKER_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=abc' },
      body: 'this is not multipart',
    });
    const err = await failure(parseRenderForm(req));
    expect(err).toMatchObject({ status: 400, extra: { field: 'body' } });
  });
});

describe('readBodyLimited and parseSeed', () => {
  it('reads the exact bytes', async () => {
    const req = new Request(`${WORKER_URL}/render`, { method: 'POST', body: new Uint8Array([1, 2, 3]) });
    expect(await readBodyLimited(req, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('accepts integer seeds in 0..4294967295 only (the app sends uint32)', () => {
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed('2147483648')).toBe(2147483648);
    expect(parseSeed('4294967295')).toBe(4294967295);
    expect(() => parseSeed('4294967296')).toThrow();
    expect(() => parseSeed('99999999999')).toThrow();
    expect(() => parseSeed('-1')).toThrow();
    expect(() => parseSeed('1.5')).toThrow();
    expect(() => parseSeed('abc')).toThrow();
    const random = parseSeed(null);
    expect(Number.isInteger(random)).toBe(true);
    expect(random).toBeGreaterThanOrEqual(0);
    expect(random).toBeLessThanOrEqual(4294967295);
  });
});
