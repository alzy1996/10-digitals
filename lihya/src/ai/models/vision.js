// Lazy MediaPipe Tasks Vision runtime: the JS bundle is imported on first use (its
// own 'mediapipe' chunk) and the WASM fileset is resolved once for every task.

import { mediapipeWasmBase } from './cdn.js';

let visionPromise = null;
let filesetPromise = null;

/** The @mediapipe/tasks-vision module namespace. */
export function loadVision() {
  if (!visionPromise) {
    visionPromise = import('@mediapipe/tasks-vision').catch((err) => {
      visionPromise = null;
      throw err;
    });
  }
  return visionPromise;
}

/** WasmFileset for FaceLandmarker / ImageSegmenter (shared). */
export function loadFileset() {
  if (!filesetPromise) {
    filesetPromise = loadVision()
      .then((vision) => vision.FilesetResolver.forVisionTasks(mediapipeWasmBase()))
      .catch((err) => {
        filesetPromise = null;
        throw err;
      });
  }
  return filesetPromise;
}

/**
 * Runs the given task factory with the GPU delegate first and falls back to the CPU
 * delegate when the GPU path cannot start (no WebGL2, blocked context, driver bug).
 * Returns { task, delegate }.
 */
export async function createWithFallback(factory, preferGpu = true) {
  if (preferGpu) {
    try {
      const task = await factory('GPU');
      return { task, delegate: 'GPU' };
    } catch (err) {
      console.warn('MediaPipe GPU delegate unavailable, using CPU', err);
    }
  }
  const task = await factory('CPU');
  return { task, delegate: 'CPU' };
}
