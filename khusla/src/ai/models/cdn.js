// Pinned CDN locations for every model and runtime. Never served from Firebase Hosting
// (Spark transfer is limited); the service worker caches them CacheFirst (vite.config.js).
// No import.meta here so vite.config.js can import these constants too.

export const MP_VERSION = '1.1.1'; // must equal the @mediapipe/tasks-vision version in package.json
export const MP_WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

export const MODELS = {
  faceLandmarker:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  multiclass:
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
  hair: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite',
};

// Lazy models (loaded only when used, cached by the service worker).
export const ORT_VERSION = '1.23.2';
export const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const ORT_MODULE = `${ORT_CDN}ort.wasm.min.mjs`;
// MI-GAN (Picsart AI Research, MIT code and MIT weights license): ONNX pipeline with pre/post-processing inside.
export const MIGAN_URL = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';

export const TRANSFORMERS_VERSION = '3.8.1';
export const TRANSFORMERS_MODULE = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`;
export const AGE_MODEL_ID = 'onnx-community/fairface_age_image_detection-ONNX';

// Hosts the service worker caches CacheFirst (pinned, immutable URLs only).
export const CACHE_HOSTS = [
  { prefix: 'https://storage.googleapis.com/mediapipe-models/', cache: 'khusla-models' },
  { prefix: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/`, cache: 'khusla-runtime' },
  { prefix: ORT_CDN, cache: 'khusla-runtime' },
  { prefix: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/`, cache: 'khusla-runtime' },
  { prefix: 'https://huggingface.co/', cache: 'khusla-lazy-models' },
  { prefix: 'https://cas-bridge.xethub.hf.co/', cache: 'khusla-lazy-models' },
  { prefix: 'https://cdn-lfs.hf.co/', cache: 'khusla-lazy-models' },
];

// Dev/test override: VITE_MP_WASM_BASE lets a local copy of the wasm be used (e.g. offline QA).
export function wasmBase(env = {}) {
  return env.VITE_MP_WASM_BASE || MP_WASM_CDN;
}
