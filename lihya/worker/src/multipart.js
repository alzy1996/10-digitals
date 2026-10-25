// Reading and checking the POST /render form.
//
// Fields: source (JPEG), guide (JPEG), seed (integer, optional), shopId.
// Any other field, including a "prompt", is ignored. The body is read with a
// hard byte limit (also without a Content-Length header) before it is parsed.

import { HttpError } from './http.js';
import { isJpeg, jpegSize } from './jpeg.js';
import { isValidShopId } from './firestore.js';
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES, MAX_INPUT_SIDE, MIN_INPUT_SIDE, SEED_MAX } from './config.js';

/** Whole request body as bytes, refusing more than `maxBytes` (413 'too_large'). */
export async function readBodyLimited(request, maxBytes = MAX_BODY_BYTES) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && declared.trim() !== '') {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'bad_request', { field: 'body' });
    if (n > maxBytes) throw new HttpError(413, 'too_large', { maxBytes });
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'too_large', { maxBytes });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isFileLike(value) {
  return value !== null && typeof value === 'object' && typeof value.arrayBuffer === 'function';
}

function single(form, name) {
  const all = form.getAll(name);
  if (all.length > 1) throw new HttpError(400, 'bad_request', { field: name, reason: 'repeated' });
  return all.length === 1 ? all[0] : null;
}

/** Bytes and frame size of one JPEG field, or a 400/413 HttpError. */
export async function readJpegField(form, name) {
  const value = single(form, name);
  if (!isFileLike(value)) throw new HttpError(400, 'bad_request', { field: name, reason: 'missing' });
  if (value.size > MAX_IMAGE_BYTES) throw new HttpError(413, 'too_large', { field: name, maxBytes: MAX_IMAGE_BYTES });
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (!isJpeg(bytes)) throw new HttpError(400, 'bad_request', { field: name, reason: 'not_jpeg' });
  const size = jpegSize(bytes);
  if (!size) throw new HttpError(400, 'bad_request', { field: name, reason: 'not_jpeg' });
  if (size.width > MAX_INPUT_SIDE || size.height > MAX_INPUT_SIDE) {
    throw new HttpError(400, 'bad_request', { field: name, reason: 'too_big', maxSide: MAX_INPUT_SIDE });
  }
  if (size.width < MIN_INPUT_SIDE || size.height < MIN_INPUT_SIDE) {
    throw new HttpError(400, 'bad_request', { field: name, reason: 'too_small', minSide: MIN_INPUT_SIDE });
  }
  return { bytes, width: size.width, height: size.height };
}

/** Seed from the form: an integer in 0..4294967295 (the app sends uint32), or a random one when absent. */
export function parseSeed(value, random = randomSeed) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return random();
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value.trim())) {
    throw new HttpError(400, 'bad_request', { field: 'seed' });
  }
  const n = Number(value.trim());
  if (!Number.isSafeInteger(n) || n > SEED_MAX) throw new HttpError(400, 'bad_request', { field: 'seed' });
  return n;
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** shopId from a form or query value (400 when missing or malformed). */
export function parseShopId(value) {
  if (typeof value !== 'string' || !isValidShopId(value.trim())) {
    throw new HttpError(400, 'bad_request', { field: 'shopId' });
  }
  return value.trim();
}

/**
 * Parse and check the render form.
 * @returns {Promise<{ shopId: string, seed: number,
 *   source: { bytes, width, height }, guide: { bytes, width, height } }>}
 */
export async function parseRenderForm(request, { maxBytes = MAX_BODY_BYTES, random = randomSeed } = {}) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType.trim())) {
    throw new HttpError(415, 'media_type', { expected: 'multipart/form-data' });
  }
  const body = await readBodyLimited(request, maxBytes);
  let form;
  try {
    form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData();
  } catch (err) {
    throw new HttpError(400, 'bad_request', { field: 'body' });
  }
  const shopId = parseShopId(single(form, 'shopId'));
  const seedValue = single(form, 'seed');
  const seed = parseSeed(typeof seedValue === 'string' || seedValue === null ? seedValue : '-', random);
  const source = await readJpegField(form, 'source');
  const guide = await readJpegField(form, 'guide');
  return { shopId, seed, source, guide };
}
