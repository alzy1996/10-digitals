// Optional age-band estimate (PRD 5.1 Option A, 5.7).
//
// Model: onnx-community/fairface_age_image_detection-ONNX, the ONNX export of
// dima806/fairface_age_image_detection (Apache-2.0, commercial use allowed), q4
// weights, run by transformers.js on the onnxruntime-web WASM backend. Both are
// loaded only through dynamic import (the lazy 'age-runtime' chunk), only on
// Wi-Fi or another unmetered link, and kept by the browser cache
// (transformers.js useBrowserCache) and the service worker.
//
// FairFace predicts 9 age classes (0-2 up to 70+). They are mapped to the LIHYA bands
// 18-24, 25-34, 35-44, 45-54, 55+ by overlap-weighted probability. A band is only
// pre-selected when its probability is at least 0.5; otherwise (or when the model
// is not loaded) the band is null and the chips ask instead. The age number is
// never shown to the customer.

import { AGE_MODEL, ORT_WEB_VERSION, ortWasmBase } from './cdn.js';
import { isUnmetered } from './platform.js';
import { setModelStatus, modelStatus } from './status.js';
import { FLAGS } from '../../config/app.js';

export const AGE_BANDS = Object.freeze(['18-24', '25-34', '35-44', '45-54', '55+']);
export const AGE_CONFIDENCE_MIN = 0.5;

/** Band ranges as [from, to) in years; 55+ is capped at 90 for the overlap maths. */
const BAND_RANGES = Object.freeze({
  '18-24': [18, 25],
  '25-34': [25, 35],
  '35-44': [35, 45],
  '45-54': [45, 55],
  '55+': [55, 90],
});

/**
 * Age range [from, to) in years of a FairFace label such as '20-29', '3-9',
 * 'more than 70' or '70+'. null when the label has no number.
 */
export function parseAgeLabel(label) {
  const s = String(label || '').toLowerCase();
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  if (nums.length >= 2) return [nums[0], nums[1] + 1];
  if (/more|over|plus|\+|above|older/.test(s)) return [nums[0], 90];
  return [nums[0], nums[0] + 1];
}

/**
 * Maps classifier output [{ label, score }] to band probabilities. Each class's
 * probability is split over the bands by the share of its age range that falls in
 * each band; mass below 18 goes to 18-24 (customers are adults, the youngest band
 * is the nearest). Returns { probs: { band: p }, band, confidence } where band is
 * null when the top probability is under AGE_CONFIDENCE_MIN.
 */
export function bandsFromAgeClasses(results) {
  const probs = Object.fromEntries(AGE_BANDS.map((b) => [b, 0]));
  let total = 0;
  for (const r of results || []) {
    const range = parseAgeLabel(r && r.label);
    const score = Number(r && r.score) || 0;
    if (!range || score <= 0) continue;
    total += score;
    const [a, b] = range;
    const span = Math.max(1e-6, b - a);
    let assigned = 0;
    for (const band of AGE_BANDS) {
      const [lo, hi] = BAND_RANGES[band];
      const overlap = Math.max(0, Math.min(b, hi) - Math.max(a, lo));
      if (overlap > 0) {
        const share = (score * overlap) / span;
        probs[band] += share;
        assigned += share;
      }
    }
    if (a < 18) probs['18-24'] += Math.max(0, score - assigned);
  }
  if (total > 0) for (const band of AGE_BANDS) probs[band] /= total;
  let best = null;
  let bestP = 0;
  for (const band of AGE_BANDS) {
    if (probs[band] > bestP) {
      bestP = probs[band];
      best = band;
    }
  }
  const confidence = Math.round(bestP * 100) / 100;
  return { probs, band: bestP >= AGE_CONFIDENCE_MIN ? best : null, confidence };
}

/**
 * True when the age model may be used now: already loaded, or the feature is on
 * and the link is unmetered (Wi-Fi / ethernet; data saver off; desktop when the
 * browser does not report the link type).
 */
export function canLoadAgeModel(nav) {
  if (modelStatus().age === 'ready') return true;
  if (!FLAGS.ageModel) return false;
  return isUnmetered(nav);
}

let classifier = null;
let loadPromise = null;

/** Points onnxruntime-web at the pinned jsDelivr WASM build, keeping the file variant transformers.js chose. */
function pinOrtWasm(env) {
  const onnx = env && env.backends && env.backends.onnx;
  if (!onnx || !onnx.wasm) return;
  const runtime = onnx.versions && onnx.versions.web ? String(onnx.versions.web) : ORT_WEB_VERSION;
  if (runtime !== ORT_WEB_VERSION) {
    console.warn(`onnxruntime-web ${runtime} differs from the pinned ${ORT_WEB_VERSION}; using the runtime version`);
  }
  const base = ortWasmBase(runtime);
  const cur = onnx.wasm.wasmPaths;
  const file = (u) => String(u).split('/').pop();
  if (cur && typeof cur === 'object' && cur.mjs && cur.wasm) {
    onnx.wasm.wasmPaths = { mjs: base + file(cur.mjs), wasm: base + file(cur.wasm) };
  } else {
    onnx.wasm.wasmPaths = base;
  }
}

/**
 * Downloads (first time) and prepares the age model. Resolves true when ready,
 * false when not allowed right now or when loading failed (the chips then ask).
 * opts.onProgress(fraction 0..1) reports the model download.
 */
export function loadAgeModel(opts = {}) {
  if (classifier) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  if (!canLoadAgeModel()) return Promise.resolve(false);
  setModelStatus('age', 'loading');
  loadPromise = (async () => {
    const tf = await import('@huggingface/transformers');
    const { env, pipeline } = tf;
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    pinOrtWasm(env);
    const files = {};
    const progress_callback =
      typeof opts.onProgress === 'function'
        ? (e) => {
            if (!e || e.status !== 'progress' || !e.file) return;
            files[e.file] = { loaded: Number(e.loaded) || 0, total: Number(e.total) || 0 };
            let loaded = 0;
            let total = 0;
            for (const f of Object.values(files)) {
              loaded += f.loaded;
              total += f.total;
            }
            if (total > 0) opts.onProgress(Math.min(1, loaded / total));
          }
        : undefined;
    classifier = await pipeline('image-classification', AGE_MODEL.id, {
      dtype: AGE_MODEL.dtype,
      device: 'wasm',
      progress_callback,
    });
    setModelStatus('age', 'ready');
    return true;
  })().catch((err) => {
    console.warn('Age model not available; age chips will ask instead', err);
    classifier = null;
    setModelStatus('age', 'error');
    return false;
  });
  loadPromise.finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

/**
 * Age band of a face crop (a canvas holding the face with some margin). Resolves
 * { band, source: 'model', confidence } or { band: null, source: 'none',
 * confidence: 0 } when the model is not loaded or fails.
 */
export async function estimateAgeBand(faceCanvas) {
  if (!classifier) return { band: null, source: 'none', confidence: 0 };
  try {
    const out = await classifier(faceCanvas, { top_k: null });
    const list = Array.isArray(out) && Array.isArray(out[0]) ? out[0] : out;
    const { band, confidence } = bandsFromAgeClasses(list);
    return { band, source: 'model', confidence };
  } catch (err) {
    console.warn('Age estimate failed', err);
    return { band: null, source: 'none', confidence: 0 };
  }
}
