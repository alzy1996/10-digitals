// AI Final Look (PRD 7.5): optional, cloud, consent-gated, capped, OFF by default.
//
// Provider interface: render({ sourceJpeg, guideJpeg, prompt, seed }) -> Promise<Blob>.
// Providers: cloudflareFlux (the LIHYA Worker, when the owner turned AI preview on
// and VITE_AI_WORKER_URL is set) and none. A paid provider can be added here later
// without touching the screens.
//
// Flow (the screen shows the consent sheet and logs the consent first):
//   1. crop the face and beard region of the photo and resize it below 512 px per
//      side (504 x 504, the Workers AI input limit), JPEG;
//   2. the guide image is the Photo Studio render at the same crop;
//   3. the fixed prompt below, verbatim;
//   4. the result is returned as { blob, url } (an object URL) and never stored:
//      the screen shows it beside the AR preview, labelled "AI preview", and revokes
//      the URL when the session is wiped.

import { faceBeardCrop } from './frame.js';
import { makeCanvas, isNum } from './util.js';
import { cloudflareFlux, finalLookError, workerBaseUrl } from './cloudflareFlux.js';

/** The fixed prompt (PRD 7.5 step 4), verbatim. */
export const FINAL_LOOK_PROMPT =
  'Image 0 is a real photo of a man. Image 1 shows the exact target beard on the same man. ' +
  'Make the beard from image 1 photorealistic on the man in image 0. ' +
  'Keep his face, skin, eyes, hair, lighting, clothes and background exactly as in image 0. ' +
  'Match the beard shape, length, lines and color of image 1 exactly. ' +
  'Realistic hair strands, natural skin texture. No text.';

/** Side of the square images sent to the Worker (below 512, the Workers AI limit). */
export const FINAL_LOOK_SIZE = 504;
/** JPEG quality of the uploaded crops. */
export const FINAL_LOOK_JPEG_QUALITY = 0.9;

/** The "none" provider: AI preview is off. */
export const noneProvider = Object.freeze({
  id: 'none',
  available: () => false,
  render: () => Promise.reject(finalLookError('disabled', 'AI preview is off')),
});

/** Every provider by id. */
export const PROVIDERS = Object.freeze({ cloudflareFlux, none: noneProvider });

const online = () => typeof navigator !== 'undefined' && !!navigator && navigator.onLine === true;

/**
 * True when the AI Final Look can be offered: the owner turned AI preview on, the
 * Worker URL is configured and the device is online.
 * @param {{ aiPreview?: boolean }|null} settings shop settings (useShop().settings)
 */
export function finalLookAvailable(settings) {
  return !!settings && settings.aiPreview === true && !!workerBaseUrl() && online();
}

/** The provider for a shop's settings (none unless AI preview is on and configured). */
export function getProvider(settings) {
  return settings && settings.aiPreview === true && cloudflareFlux.available() ? PROVIDERS.cloudflareFlux : PROVIDERS.none;
}

/**
 * The square crop (in shot pixels) sent to the AI, and the same crop in the Photo
 * Studio canvas (which may be smaller than the shot: renderStudio's maxSize).
 * @returns {{ shot: { x, y, w, h }, studio: { x, y, w, h } }}
 */
export function finalLookCrop(shot, studioCanvas) {
  const W = shot.width || shot.canvas.width;
  const H = shot.height || shot.canvas.height;
  const crop = faceBeardCrop(shot.landmarks, W, H);
  const kx = studioCanvas.width / W;
  const ky = studioCanvas.height / H;
  return {
    shot: crop,
    studio: { x: crop.x * kx, y: crop.y * ky, w: crop.w * kx, h: crop.h * ky },
  };
}

function toJpeg(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function' && typeof canvas.toBlob !== 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(finalLookError('failed', 'JPEG encoding failed'))), 'image/jpeg', quality);
  });
}

async function cropJpeg(source, rect, size) {
  const c = makeCanvas(size, size);
  if (!c) throw finalLookError('failed', 'AI preview needs a canvas');
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
  return toJpeg(c, FINAL_LOOK_JPEG_QUALITY);
}

/**
 * The two JPEGs for the AI: the photo crop and the Photo Studio render at the same
 * crop, both FINAL_LOOK_SIZE square.
 * @returns {Promise<{ sourceJpeg: Blob, guideJpeg: Blob, crop: object }>}
 */
export async function finalLookInputs(shot, studioCanvas) {
  const crop = finalLookCrop(shot, studioCanvas);
  const [sourceJpeg, guideJpeg] = await Promise.all([
    cropJpeg(shot.canvas, crop.shot, FINAL_LOOK_SIZE),
    cropJpeg(studioCanvas, crop.studio, FINAL_LOOK_SIZE),
  ]);
  return { sourceJpeg, guideJpeg, crop };
}

function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967295);
}

/**
 * Makes the AI Final Look. Call only after the customer allowed it (consent sheet)
 * and finalLookAvailable(settings) is true.
 *
 * @param {object} opts
 * @param {object} opts.shot the front Shot (un-mirrored, with landmarks)
 * @param {HTMLCanvasElement} opts.studioCanvas renderStudio() result for that shot
 * @param {number} [opts.seed] integer seed (random when omitted)
 * @param {string} opts.shopId shop whose daily cap counts the render
 * @param {object} [opts.provider] provider override (default: cloudflareFlux when configured)
 * @returns {Promise<{ blob: Blob, url: string }>} never stored; revoke the URL when done.
 *   Rejects with err.code 'cap' (HTTP 429: "Today's AI previews are used up"),
 *   'offline', 'disabled' or 'failed'.
 */
export async function renderFinalLook({ shot, studioCanvas, seed, shopId, provider = null } = {}) {
  if (!shot || !shot.canvas || !shot.landmarks || shot.landmarks.length < 468) {
    throw finalLookError('failed', 'AI preview needs a photo with a face', { reason: 'noFace' });
  }
  if (!studioCanvas || !studioCanvas.width) throw finalLookError('failed', 'AI preview needs the Photo Studio render');
  const p = provider || (cloudflareFlux.available() ? cloudflareFlux : noneProvider);
  if (p === noneProvider) throw finalLookError('disabled', 'AI preview is off');
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    throw finalLookError('offline', 'Device is offline');
  }
  const { sourceJpeg, guideJpeg } = await finalLookInputs(shot, studioCanvas);
  const blob = await p.render({
    sourceJpeg,
    guideJpeg,
    prompt: FINAL_LOOK_PROMPT,
    seed: isNum(seed) ? Math.floor(seed) >>> 0 : randomSeed(),
    shopId,
  });
  return { blob, url: URL.createObjectURL(blob) };
}
