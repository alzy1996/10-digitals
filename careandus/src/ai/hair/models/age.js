// Age band (PRD 5.7). Option A: FairFace age classifier (ONNX, q4) via transformers.js from the pinned CDN.
// Only used when FEATURES.ageModel is true (license confirmation pending, see BUILD_NOTES.md).
// The number is never shown; it only pre-selects a chip. Confidence < 0.5 → nothing pre-selected.
import { AGE_MODEL_ID, TRANSFORMERS_MODULE } from './cdn.js';
import { FEATURES } from '../../../config/app.js';

let pipePromise = null;

export function onWifiOrUnknown() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!c) return true;
  if (c.saveData) return false;
  if (c.type) return c.type === 'wifi' || c.type === 'ethernet';
  return c.effectiveType === '4g';
}

async function getPipe() {
  if (!pipePromise) {
    pipePromise = (async () => {
      const tf = await import(/* @vite-ignore */ TRANSFORMERS_MODULE);
      tf.env.allowLocalModels = false;
      return tf.pipeline('image-classification', AGE_MODEL_ID, { dtype: 'q4' });
    })().catch((e) => {
      pipePromise = null;
      throw e;
    });
  }
  return pipePromise;
}

// FairFace labels -> PRD bands (split decades across neighbouring bands)
const SPLIT = {
  '0-2': {},
  '3-9': {},
  '10-19': { '18-24': 0.6 },
  '20-29': { '18-24': 0.5, '25-34': 0.5 },
  '30-39': { '25-34': 0.5, '35-44': 0.5 },
  '40-49': { '35-44': 0.5, '45-54': 0.5 },
  '50-59': { '45-54': 0.5, '55+': 0.5 },
  '60-69': { '55+': 1 },
  'more than 70': { '55+': 1 },
};

export function bandsFromLabels(preds) {
  const bands = { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
  for (const p of preds) {
    const split = SPLIT[p.label] || {};
    for (const [b, w] of Object.entries(split)) bands[b] += p.score * w;
  }
  const [band, score] = Object.entries(bands).sort((a, b) => b[1] - a[1])[0];
  return { band: score >= 0.5 ? band : null, confidence: Math.round(score * 100) / 100, source: 'model' };
}

/** @param {HTMLCanvasElement} faceCrop */
export async function estimateAge(faceCrop) {
  if (!FEATURES.ageModel || !onWifiOrUnknown()) return { band: null, confidence: 0, source: 'chips' };
  try {
    const pipe = await getPipe();
    const preds = await pipe(faceCrop.toDataURL('image/jpeg', 0.9), { top_k: 9 });
    return bandsFromLabels(preds);
  } catch {
    return { band: null, confidence: 0, source: 'chips' };
  }
}
