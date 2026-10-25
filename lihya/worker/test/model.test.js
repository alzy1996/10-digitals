import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  buildModelInput,
  decodeModelOutput,
  FIXED_PROMPT,
  isQuotaError,
  MODEL_ID,
  outputSize,
  runModel,
  sniffImageType,
} from '../src/model.js';
import { fakeAi, jpegBytes, PNG_BYTES, toBase64 } from './helpers.js';

// PRD 7.5 step 4, verbatim.
const PRD_PROMPT =
  'Image 0 is a real photo of a man. Image 1 shows the exact target beard on the same man. Make the beard from image 1 photorealistic on the man in image 0. Keep his face, skin, eyes, hair, lighting, clothes and background exactly as in image 0. Match the beard shape, length, lines and color of image 1 exactly. Realistic hair strands, natural skin texture. No text.';

async function parseInput(input) {
  return new Response(input.multipart.body, { headers: { 'Content-Type': input.multipart.contentType } }).formData();
}

async function bytesOf(file) {
  return new Uint8Array(await file.arrayBuffer());
}

describe('model choice and prompt', () => {
  it('uses FLUX.2 [klein] 4B only', () => {
    expect(MODEL_ID).toBe('@cf/black-forest-labs/flux-2-klein-4b');
    expect(MODEL_ID).not.toMatch(/9b|dev/);
  });

  it('uses the PRD prompt word for word', () => {
    expect(FIXED_PROMPT).toBe(PRD_PROMPT);
  });
});

describe('outputSize', () => {
  it('keeps the aspect ratio with the long side at 1024 in steps of 16', () => {
    expect(outputSize(504, 504)).toEqual({ width: 1024, height: 1024 });
    expect(outputSize(504, 378)).toEqual({ width: 1024, height: 768 });
    expect(outputSize(300, 500)).toEqual({ width: 608, height: 1024 });
  });

  it('never goes below 256 or above 1024 (at most 4 output tiles)', () => {
    expect(outputSize(64, 511)).toEqual({ width: 256, height: 1024 });
    const { width, height } = outputSize(511, 401);
    expect(width).toBeLessThanOrEqual(1024);
    expect(height).toBeLessThanOrEqual(1024);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(Math.ceil(width / 512) * Math.ceil(height / 512)).toBeLessThanOrEqual(4);
  });
});

describe('buildModelInput', () => {
  it('sends prompt, both images, size and seed as multipart fields', async () => {
    const source = jpegBytes(504, 504);
    const guide = jpegBytes(504, 504, { sof: 0xc2 });
    const input = buildModelInput({ source, guide, seed: 77, width: 1024, height: 1024 });
    expect(input.multipart.contentType).toMatch(/^multipart\/form-data; ?boundary=/);
    const form = await parseInput(input);
    expect([...new Set(form.keys())].sort()).toEqual(['height', 'input_image_0', 'input_image_1', 'prompt', 'seed', 'width']);
    expect(form.get('prompt')).toBe(PRD_PROMPT);
    expect(await bytesOf(form.get('input_image_0'))).toEqual(source);
    expect(await bytesOf(form.get('input_image_1'))).toEqual(guide);
    expect(form.get('input_image_0').type).toBe('image/jpeg');
    expect(form.get('width')).toBe('1024');
    expect(form.get('height')).toBe('1024');
    expect(form.get('seed')).toBe('77');
  });

  it('folds a uint32 seed into 0..2^31-1 the same way every time', async () => {
    const make = (seed) => parseInput(buildModelInput({ source: jpegBytes(64, 64), guide: jpegBytes(64, 64), seed, width: 256, height: 256 }));
    expect((await make(3000000000)).get('seed')).toBe('852516352');
    expect((await make(4294967295)).get('seed')).toBe('2147483647');
    expect((await make(2147483647)).get('seed')).toBe('2147483647');
  });
});

describe('decodeModelOutput', () => {
  it('decodes { image: base64 }', async () => {
    const jpeg = jpegBytes(1024, 1024);
    const out = await decodeModelOutput({ image: toBase64(jpeg) });
    expect(out.contentType).toBe('image/jpeg');
    expect(out.bytes).toEqual(jpeg);
  });

  it('accepts a data URL, raw bytes and a stream', async () => {
    const png = new Uint8Array([...PNG_BYTES, 0, 0, 0, 0]);
    expect((await decodeModelOutput({ image: `data:image/png;base64,${toBase64(png)}` })).contentType).toBe('image/png');
    expect((await decodeModelOutput(png)).contentType).toBe('image/png');
    expect((await decodeModelOutput(png.buffer)).contentType).toBe('image/png');
    const stream = new Response(jpegBytes(64, 64)).body;
    expect((await decodeModelOutput(stream)).contentType).toBe('image/jpeg');
  });

  it('throws when there is no image', async () => {
    await expect(decodeModelOutput({})).rejects.toThrow();
    await expect(decodeModelOutput({ image: toBase64(new TextEncoder().encode('hello world, not an image')) })).rejects.toThrow();
    await expect(decodeModelOutput(null)).rejects.toThrow();
  });

  it('sniffs WebP', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('base64ToBytes ignores whitespace', () => {
    expect(base64ToBytes('AAEC\n/w==')).toEqual(new Uint8Array([0, 1, 2, 255]));
  });
});

describe('runModel and quota errors', () => {
  it('calls the binding with the model id and returns the image', async () => {
    const ai = fakeAi();
    const out = await runModel(ai, { source: jpegBytes(504, 504), guide: jpegBytes(504, 504), seed: 1, width: 1024, height: 1024 });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].model).toBe(MODEL_ID);
    expect(out.contentType).toBe('image/jpeg');
  });

  it('recognises the daily neuron allocation error', () => {
    expect(isQuotaError(new Error('4006: you have used up your daily free allocation of 10,000 neurons'))).toBe(true);
    expect(isQuotaError(new Error('AiError: 3040: capacity temporarily exceeded'))).toBe(false);
  });
});
