// Workers AI call for the AI Final Look (PRD 7.5).
//
// Model: @cf/black-forest-labs/flux-2-klein-4b ONLY (Apache 2.0, commercial use
// allowed). Never FLUX.2 [klein] 9B or FLUX.2 [dev]: both are non-commercial.
//
// Input format (Cloudflare changelog "Launching FLUX.2 [klein] 4B on Workers AI",
// 2026-01-15, and the model schema in cloudflare/cloudflare-docs
// src/content/workers-ai-models/flux-2-klein-4b.json): the binding takes
// { multipart: { body, contentType } } built from a FormData with
//   prompt (required), input_image_0..input_image_3 (binary, each smaller than 512x512),
//   width / height (256..1920), seed, guidance; steps are fixed at 4.
// Output: { image: <base64 string> }.
//
// The prompt is fixed (PRD 7.5 step 4). A prompt sent by the client is never
// used, so the Worker cannot be turned into a general image generator.

import { MODEL_SEED_MODULO, OUTPUT_LONG_SIDE, OUTPUT_MIN_SIDE, OUTPUT_STEP } from './config.js';

export const MODEL_ID = '@cf/black-forest-labs/flux-2-klein-4b';

export const FIXED_PROMPT =
  'Image 0 is a real photo of a man. Image 1 shows the exact target beard on the same man. ' +
  'Make the beard from image 1 photorealistic on the man in image 0. ' +
  'Keep his face, skin, eyes, hair, lighting, clothes and background exactly as in image 0. ' +
  'Match the beard shape, length, lines and color of image 1 exactly. ' +
  'Realistic hair strands, natural skin texture. No text.';

function roundStep(value) {
  return Math.max(OUTPUT_STEP, Math.round(value / OUTPUT_STEP) * OUTPUT_STEP);
}

/**
 * Output size with the source's aspect ratio, the longer side 1024 px, both
 * sides multiples of 16 within 256..1024 (at most 4 output tiles of 512 x 512).
 */
export function outputSize(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const scale = OUTPUT_LONG_SIDE / Math.max(w, h);
  const clampSide = (v) => Math.min(OUTPUT_LONG_SIDE, Math.max(OUTPUT_MIN_SIDE, roundStep(v * scale)));
  return { width: clampSide(w), height: clampSide(h) };
}

/**
 * The binding input for one render. The only place that knows the model's
 * field names: if Cloudflare changes them, change this function.
 * @param {{ source: Uint8Array, guide: Uint8Array, seed: number, width: number, height: number }} input
 * @returns {{ multipart: { body: ReadableStream, contentType: string } }}
 */
export function buildModelInput({ source, guide, seed, width, height }) {
  const form = new FormData();
  form.append('prompt', FIXED_PROMPT);
  form.append('input_image_0', new Blob([source], { type: 'image/jpeg' }), 'source.jpg');
  form.append('input_image_1', new Blob([guide], { type: 'image/jpeg' }), 'guide.jpg');
  form.append('width', String(width));
  form.append('height', String(height));
  // Same client seed, same model seed; folded into 0..2^31-1 so any integer type accepts it.
  form.append('seed', String(Math.abs(Math.floor(Number(seed) || 0)) % MODEL_SEED_MODULO));
  // FormData does not expose its serialized body or boundary; a Response builds both.
  const serialized = new Response(form);
  return {
    multipart: {
      body: serialized.body,
      contentType: serialized.headers.get('content-type'),
    },
  };
}

/** 'image/jpeg' | 'image/png' | 'image/webp' from the magic bytes, or null. */
export function sniffImageType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Base64 (optionally a data: URL) to bytes; native decoder when the runtime has one. */
export function base64ToBytes(text) {
  const clean = String(text).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(clean);
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function streamToBytes(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Image bytes and type from whatever the binding returned
 * ({ image: base64 } today; raw bytes or a stream are accepted as well).
 * @returns {Promise<{ bytes: Uint8Array, contentType: string }>}
 * @throws {Error} when the result holds no image
 */
export async function decodeModelOutput(result) {
  let bytes = null;
  if (result instanceof Uint8Array) bytes = result;
  else if (result instanceof ArrayBuffer) bytes = new Uint8Array(result);
  else if (result instanceof ReadableStream) bytes = await streamToBytes(result);
  else if (result && typeof result.image === 'string' && result.image !== '') bytes = base64ToBytes(result.image);
  const contentType = bytes ? sniffImageType(bytes) : null;
  if (!contentType) throw new Error('model returned no image');
  return { bytes, contentType };
}

/** True when the error says the account's free daily neurons are used up. */
export function isQuotaError(err) {
  const text = `${err && err.message ? err.message : err}`;
  return /\b4006\b/.test(text) || /neurons?/i.test(text) || /daily free allocation/i.test(text);
}

/**
 * Run the model once.
 * @param {{ run: Function }} ai  the Workers AI binding (env.AI)
 * @returns {Promise<{ bytes: Uint8Array, contentType: string }>}
 */
export async function runModel(ai, input) {
  const result = await ai.run(MODEL_ID, buildModelInput(input));
  return decodeModelOutput(result);
}
