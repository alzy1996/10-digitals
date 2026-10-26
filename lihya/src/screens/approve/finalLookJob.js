// The one AI Final Look in flight (PRD 7.5), held in memory only. It starts from the
// "Allow once" tap on the consent screen (so one consent makes one request, also under
// React StrictMode) and lives until the result screen is left: then both images are
// revoked and dropped. Nothing here is ever written to storage, and a reload forgets
// it, so the consent is asked again every time.
//
// Steps: 1. a fresh Photo Studio render of the chosen look on the front shot (the guide
// image and the "Your design" panel), 2. renderFinalLook. The daily AI counter and the
// consultation's aiPreviewUsed flag are updated once per successful render.

import { renderFinalLook, renderStudio } from '../../ai/index.js';
import { bumpAiRender } from '../../services/stats.js';
import { updateConsultation } from '../../services/consultations.js';
import { MAX_AI_RETRIES } from './aiMessages.js';

const listeners = new Set();
let job = null;
let seq = 0;
let holders = 0;
/** Consultations (shop + session start) that got a successful AI render on this phone. */
const usedFor = new Set();

function usedKey(shopId, startedAt) {
  const ms = startedAt instanceof Date ? startedAt.getTime() : Number(startedAt) || 0;
  return `${shopId || ''}|${ms}`;
}

/** true when this consultation already had a successful AI render (for aiPreviewUsed). */
export function aiPreviewUsedFor(shopId, startedAt) {
  return usedFor.has(usedKey(shopId, startedAt));
}

function emit() {
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch (err) {
      console.error('finalLookJob: listener failed', err);
    }
  }
}

/** useSyncExternalStore subscribe. */
export function subscribeFinalLook(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The current job (immutable snapshot) or null. */
export function currentFinalLook() {
  return job;
}

function revoke(url) {
  if (typeof url !== 'string' || !url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // already revoked
  }
}

function shrink(canvas) {
  if (!canvas || typeof canvas !== 'object' || !('width' in canvas)) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // detached canvas
  }
}

function isLive(id, attempt) {
  return Boolean(job) && job.id === id && job.attempt === attempt && !job.cancelled;
}

function patch(id, change) {
  if (!job || job.id !== id) return;
  job = { ...job, ...change };
  emit();
}

const DESIGN_SIDE = 720;

/**
 * Square face-and-beard crop (canvas pixels) for showing the design next to the AI
 * result at the same framing: the landmark box, a little above the brows, the beard
 * below the chin, at least 1.45 face widths wide, kept inside the frame.
 */
export function designCrop(landmarks, width, height) {
  const pts = Array.isArray(landmarks) ? landmarks : [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    const x = (p && (p.x ?? p[0])) * width;
    const y = (p && (p.y ?? p[1])) * height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (!(x1 > x0 && y1 > y0)) {
    const side = Math.min(width, height);
    return { x: (width - side) / 2, y: (height - side) / 2, w: side, h: side };
  }
  const bw = x1 - x0;
  const bh = y1 - y0;
  const top = y0 - 0.08 * bh;
  const bottom = y1 + 0.3 * bh;
  const side = Math.min(width, height, Math.max(bottom - top, bw * 1.45));
  const cx = (x0 + x1) / 2;
  const x = Math.min(Math.max(0, cx - side / 2), width - side);
  const y = Math.min(Math.max(0, top - (side - (bottom - top)) / 2), height - side);
  return { x, y, w: side, h: side };
}

function designUrl(canvas, landmarks) {
  return new Promise((resolve) => {
    if (!canvas || !canvas.width || typeof document === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const crop = designCrop(landmarks, canvas.width, canvas.height);
      const out = document.createElement('canvas');
      const side = Math.min(DESIGN_SIDE, Math.round(crop.w)) || DESIGN_SIDE;
      out.width = side;
      out.height = side;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, side, side);
      out.toBlob(
        (blob) => {
          shrink(out);
          resolve(blob ? URL.createObjectURL(blob) : null);
        },
        'image/jpeg',
        0.9,
      );
    } catch (err) {
      console.warn('finalLookJob: design image could not be encoded', err);
      resolve(null);
    }
  });
}

function randomSeed() {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    // fall through
  }
  return Math.floor(Math.random() * 4294967295);
}

async function run(id, attempt) {
  const start = job;
  if (!start || start.id !== id) return;
  let studio = start.studio;
  try {
    if (!studio) {
      patch(id, { step: 'design' });
      const canvas = await renderStudio({ shot: start.shot, params: start.params, profile: start.profile, maxSize: 1280 });
      if (!job || job.id !== id) {
        shrink(canvas);
        return;
      }
      const url = await designUrl(canvas, start.shot.landmarks);
      if (!job || job.id !== id) {
        revoke(url);
        shrink(canvas);
        return;
      }
      if (url && typeof start.trackUrl === 'function') start.trackUrl(url);
      studio = { canvas, url };
      patch(id, { studio });
    }
    if (!isLive(id, attempt)) return;
    patch(id, { step: 'ai' });
    const result = await renderFinalLook({
      shot: start.shot,
      studioCanvas: studio.canvas,
      seed: (start.seed + attempt) >>> 0,
      shopId: start.shopId,
    });
    if (!isLive(id, attempt)) {
      revoke(result && result.url);
      return;
    }
    if (typeof start.trackUrl === 'function') start.trackUrl(result.url);
    usedFor.add(usedKey(start.shopId, start.startedAt));
    try {
      bumpAiRender(start.shopId);
      if (start.consultationId) updateConsultation(start.shopId, start.consultationId, { aiPreviewUsed: true });
    } catch (err) {
      console.warn('finalLookJob: AI render could not be counted', err);
    }
    patch(id, { status: 'done', step: null, result, error: null });
  } catch (err) {
    if (!isLive(id, attempt)) return;
    console.warn('finalLookJob: AI preview failed', err);
    patch(id, { status: 'error', step: null, error: err, designFailed: !studio });
  }
}

/**
 * Start the AI Final Look right after the customer allowed it. Replaces any earlier job.
 * @param {{ shopId: string, shot: object, params: object, profile: object|null, lookId: string|null,
 *   consultationId: string|null, startedAt: Date|null, trackUrl?: (url: string) => void }} opts
 * @returns {string} job id (passed to the result screen in the route state)
 */
export function startFinalLook({ shopId, shot, params, profile = null, lookId = null, consultationId = null, startedAt = null, trackUrl } = {}) {
  releaseFinalLook();
  seq += 1;
  const id = `ai-${Date.now().toString(36)}-${seq}`;
  job = {
    id,
    shopId,
    shot,
    params,
    profile,
    lookId,
    consultationId,
    startedAt,
    trackUrl,
    seed: randomSeed(),
    status: 'working',
    step: 'design',
    studio: null,
    result: null,
    error: null,
    designFailed: false,
    retries: 0,
    attempt: 0,
    cancelled: false,
  };
  emit();
  run(id, 0);
  return id;
}

/** Try a failed render once more (MAX_AI_RETRIES per consent). Returns true when started. */
export function retryFinalLook(id) {
  if (!job || job.id !== id || job.status !== 'error' || job.retries >= MAX_AI_RETRIES) return false;
  const attempt = job.attempt + 1;
  job = { ...job, status: 'working', step: job.studio ? 'ai' : 'design', error: null, retries: job.retries + 1, attempt };
  emit();
  run(id, attempt);
  return true;
}

/** Stop waiting for the render; a late result is revoked as soon as it arrives. */
export function cancelFinalLook(id) {
  if (!job || job.id !== id || job.status !== 'working') return;
  patch(id, { cancelled: true, status: 'cancelled', step: null });
}

/** Revoke and drop both images and forget the job. */
export function releaseFinalLook() {
  if (!job) return;
  const old = job;
  job = null;
  if (old.result) revoke(old.result.url);
  if (old.studio) {
    revoke(old.studio.url);
    shrink(old.studio.canvas);
  }
  emit();
}

/**
 * The result screen holds the job while it is mounted. The returned function lets go;
 * when nobody holds it any more (checked after the current task, so React StrictMode's
 * test unmount does not count) the job is released and `onReleased` runs.
 */
export function holdFinalLook() {
  holders += 1;
  let done = false;
  return (onReleased) => {
    if (done) return;
    done = true;
    holders -= 1;
    setTimeout(() => {
      if (holders > 0) return;
      releaseFinalLook();
      if (typeof onReleased === 'function') onReleased();
    }, 0);
  };
}
