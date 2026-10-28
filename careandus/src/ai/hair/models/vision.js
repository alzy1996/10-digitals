// Shared MediaPipe Tasks Vision loader: the JS runtime is code-split, the wasm comes from the pinned CDN.
import { wasmBase } from './cdn.js';

let visionModule = null;
let filesetPromise = null;

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function vision() {
  if (!visionModule) visionModule = await import('@mediapipe/tasks-vision');
  return visionModule;
}

export async function fileset() {
  if (!filesetPromise) {
    filesetPromise = (async () => {
      const v = await vision();
      return v.FilesetResolver.forVisionTasks(wasmBase(import.meta.env));
    })().catch((e) => {
      filesetPromise = null;
      throw e;
    });
  }
  return filesetPromise;
}

/** iOS Safari + GPU delegate scrambles segmenter classes (mediapipe #6142): CPU there. */
export function segmenterDelegate() {
  return isIOS() ? 'CPU' : 'GPU';
}
