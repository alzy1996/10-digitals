// Pinned model and runtime URLs. Models load from their official CDNs (never from
// Firebase Hosting) and the service worker in vite.config.js caches these exact URL
// patterns CacheFirst, so analysis works offline after the first load. Keep the
// patterns stable: changing a host or path breaks the offline cache.

/** @mediapipe/tasks-vision version installed in package.json. */
export const MEDIAPIPE_VERSION = '1.1.1';

/** jsDelivr WASM runtime for MediaPipe Tasks Vision (pinned to the npm version). */
export const MP_WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/**
 * WASM base used at runtime. VITE_MP_WASM_BASE exists for local tests only (for
 * example a folder that serves node_modules/@mediapipe/tasks-vision/wasm); it is
 * never set in production builds.
 */
export function mediapipeWasmBase() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  const override = env.VITE_MP_WASM_BASE;
  return override ? String(override).replace(/\/+$/, '') : MP_WASM_CDN;
}

/** Face Landmarker, float16, version 1 (478 landmarks incl. iris, transformation matrix). */
export const FACE_LANDMARKER = Object.freeze({
  key: 'landmarker',
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  bytes: 3758596,
});

/**
 * Selfie multiclass segmenter, 256x256, float32, version 1. Google publishes no
 * float16 build of this model.
 */
export const SELFIE_MULTICLASS = Object.freeze({
  key: 'segmenter',
  url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
  bytes: 16371837,
});

/** Bytes of the first-load models (excluding the lazy age model). */
export const FIRST_LOAD_MODEL_BYTES = FACE_LANDMARKER.bytes + SELFIE_MULTICLASS.bytes;

/**
 * Age band model (PRD 5.1 Option A): onnx-community/fairface_age_image_detection-ONNX,
 * an ONNX export of dima806/fairface_age_image_detection (Apache-2.0), loaded from
 * Hugging Face through transformers.js, q4 weights.
 */
export const AGE_MODEL = Object.freeze({
  key: 'age',
  id: 'onnx-community/fairface_age_image_detection-ONNX',
  dtype: 'q4',
  license: 'Apache-2.0',
});

/**
 * onnxruntime-web version that @huggingface/transformers 4.3.1 depends on
 * (node_modules/@huggingface/transformers/package.json). The WASM files must match
 * the JS glue exactly; a unit test keeps this constant in sync with node_modules.
 */
export const ORT_WEB_VERSION = '1.31.0-dev.20260914-8d85527a0';

/** jsDelivr folder that holds the onnxruntime-web WASM binaries for a version. */
export function ortWasmBase(version = ORT_WEB_VERSION) {
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
}
