// Runs beard and Outline texture generation in a module Worker (textureWorker.js)
// when the browser has one, else on the main thread after yielding once, and keeps
// the results in a small cache keyed by the params hash: a look is drawn once and
// re-used by AR, Photo Studio and the thumbnails until the params change.

import { getBeardTextures, textureKey } from './beardTextures.js';
import { getOutlineTextures, outlineKey } from './inpaint.js';

const CACHE_MAX = 10;
const cache = new Map();
const inflight = new Map();
const waiting = new Map();
let worker = null;
let workerBroken = false;
let nextId = 1;

/** Only the profile fields texture generation reads (plain, cloneable). */
export function slimProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const beard = profile.beard && typeof profile.beard === 'object' ? profile.beard : null;
  const gains = profile.calibration && Array.isArray(profile.calibration.gains) ? profile.calibration.gains.slice(0, 3) : null;
  return {
    beard: beard
      ? {
          zones: beard.zones ? JSON.parse(JSON.stringify(beard.zones)) : null,
          greyRatio: beard.greyRatio ?? null,
          colorLab: Array.isArray(beard.colorLab) ? beard.colorLab.slice(0, 3) : null,
          colorId: beard.colorId ?? null,
        }
      : null,
    calibration: { gains },
  };
}

const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Cache key of a job. */
export function jobKey(kind, params, profile, opts = {}) {
  return `${kind}|${kind === 'outline' ? outlineKey(params, profile, opts) : textureKey(params, profile, opts)}`;
}

function remember(key, tex) {
  cache.delete(key);
  cache.set(key, tex);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function failAllToMainThread() {
  const jobs = [...waiting.values()];
  waiting.clear();
  for (const job of jobs) job.fallback();
}

function getWorker() {
  if (workerBroken || typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./textureWorker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('Texture worker unavailable; drawing on the main thread', err);
    workerBroken = true;
    worker = null;
    return null;
  }
  worker.onmessage = (event) => {
    const { id, ok, tex, error } = event.data || {};
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    if (ok) job.resolve(tex);
    else job.reject(new Error(error || 'texture job failed'));
  };
  worker.onerror = (event) => {
    console.warn('Texture worker failed; drawing on the main thread', event && event.message);
    workerBroken = true;
    try {
      worker.terminate();
    } catch (err) {
      console.warn('Texture worker terminate failed', err);
    }
    worker = null;
    failAllToMainThread();
  };
  return worker;
}

function runHere(kind, params, profile, opts) {
  return kind === 'outline' ? getOutlineTextures(params, profile, opts) : getBeardTextures(params, profile, opts);
}

/**
 * Generates (or returns the cached) textures for a look.
 * @param {'beard'|'outline'} kind
 * @param {object} params LookParams
 * @param {object|null} profile FaceProfile
 * @param {object} [opts] generateBeardTextures / buildOutlineTextures options
 * @returns {Promise<object>} the texture set
 */
export function textureJob(kind, params, profile, opts = {}) {
  const key = jobKey(kind, params, profile, opts);
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    return Promise.resolve(hit);
  }
  const running = inflight.get(key);
  if (running) return running;
  const promise = new Promise((resolve, reject) => {
    const here = () => {
      try {
        resolve(runHere(kind, params, profile, opts));
      } catch (err) {
        reject(err);
      }
    };
    const w = getWorker();
    if (!w) {
      // Yield once so the caller can show its progress state before the work starts.
      setTimeout(here, 0);
      return;
    }
    const id = nextId++;
    waiting.set(id, { resolve, reject, fallback: here });
    try {
      w.postMessage({ id, kind, params: plain(params), profile: slimProfile(profile), opts: plain(opts) || {} });
    } catch (err) {
      waiting.delete(id);
      console.warn('Texture job could not be posted; drawing on the main thread', err);
      here();
    }
  }).then(
    (tex) => {
      inflight.delete(key);
      remember(key, tex);
      return tex;
    },
    (err) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, promise);
  return promise;
}

/** The cached textures for a job, or null (never starts work). */
export function cachedTextures(kind, params, profile, opts = {}) {
  return cache.get(jobKey(kind, params, profile, opts)) || null;
}

/** Drops cached textures (after a session wipe) and stops the worker. */
export function clearTextureJobs() {
  cache.clear();
  if (worker) {
    try {
      worker.terminate();
    } catch (err) {
      console.warn('Texture worker terminate failed', err);
    }
    worker = null;
    failAllToMainThread();
  }
}
