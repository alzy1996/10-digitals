// MediaPipe Face Landmarker: 478 landmarks (468 mesh + 10 iris) and the facial
// transformation matrix (head pose). One instance serves the live capture loop
// (VIDEO mode), still photos (IMAGE mode) and the AR renderer; it switches its
// running mode with setOptions only when the caller needs the other mode.
//
// Landmarks are normalized to the frame (x, y in 0..1, top-left origin, y down;
// z is relative depth on roughly the x scale, smaller = closer to the camera).
// Always detect on the UN-mirrored frame: a mirrored frame swaps the mesh sides.
//
// matrix is the 4x4 transformation from the canonical face model to camera space,
// column-major (translation in elements 12..14). Camera space: x right, y up,
// z toward the viewer (the face sits at negative z). See capture/poseGate.js.

import { FACE_LANDMARKER, SELFIE_MULTICLASS } from './cdn.js';
import { loadFileset, loadVision, createWithFallback } from './vision.js';
import { fetchModelBytes, setModelStatus, modelStatus, subscribeDownloads, downloadState } from './status.js';
import { getSegmenter } from './segmenter.js';

export { modelStatus };

let instance = null;
let delegate = null;
let modelBytes = null;
let loadPromise = null;
let mode = 'VIDEO';
let modeQueue = Promise.resolve();
let pendingMode = null;
let imageJobs = 0;
let lastVideoTs = -1;
let recreating = null;

const OPTIONS = {
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFacialTransformationMatrixes: true,
  outputFaceBlendshapes: false,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

async function create(preferGpu) {
  const [vision, fileset] = await Promise.all([loadVision(), loadFileset()]);
  const factory = (d) =>
    vision.FaceLandmarker.createFromOptions(fileset, {
      ...OPTIONS,
      baseOptions: { modelAssetBuffer: modelBytes, delegate: d },
    });
  const made = await createWithFallback(factory, preferGpu);
  mode = 'VIDEO';
  modeQueue = Promise.resolve();
  pendingMode = null;
  return made;
}

/** The shared FaceLandmarker (loads the model on first call). */
export function getLandmarker() {
  if (instance) return Promise.resolve(instance);
  if (!loadPromise) {
    setModelStatus('landmarker', 'loading');
    loadPromise = (async () => {
      modelBytes = await fetchModelBytes(FACE_LANDMARKER.key, FACE_LANDMARKER.url, FACE_LANDMARKER.bytes);
      const made = await create(true);
      instance = made.task;
      delegate = made.delegate;
      setModelStatus('landmarker', 'ready');
      return instance;
    })().catch((err) => {
      loadPromise = null;
      setModelStatus('landmarker', 'error');
      throw err;
    });
  }
  return loadPromise;
}

/** { ready, delegate, mode } for diagnostics. */
export function landmarkerInfo() {
  return { ready: !!instance, delegate, mode };
}

function switchMode(target) {
  if (pendingMode === target) return modeQueue;
  if (mode === target && pendingMode === null) return Promise.resolve();
  pendingMode = target;
  modeQueue = modeQueue
    .then(async () => {
      if (!instance) return;
      if (mode !== target) await instance.setOptions({ runningMode: target });
      mode = target;
    })
    .catch((err) => {
      console.error('FaceLandmarker mode switch failed', err);
    })
    .finally(() => {
      if (pendingMode === target) pendingMode = null;
    });
  return modeQueue;
}

/** Replaces a GPU instance that failed at run time with a CPU one. */
function recreateOnCpu(err) {
  if (recreating || delegate === 'CPU') return;
  console.warn('FaceLandmarker GPU run failed, switching to CPU', err);
  const old = instance;
  instance = null;
  recreating = create(false)
    .then((made) => {
      instance = made.task;
      delegate = made.delegate;
      try {
        if (old) old.close();
      } catch (closeErr) {
        console.warn(closeErr);
      }
    })
    .catch((createErr) => {
      setModelStatus('landmarker', 'error');
      console.error(createErr);
    })
    .finally(() => {
      recreating = null;
    });
}

function pack(result) {
  const faces = result && result.faceLandmarks;
  if (!faces || !faces.length || !faces[0] || faces[0].length < 468) return null;
  const landmarks = faces[0].map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const m = result.facialTransformationMatrixes && result.facialTransformationMatrixes[0];
  const matrix = m && m.data && m.data.length === 16 ? Array.from(m.data) : null;
  return { landmarks, matrix };
}

/**
 * Synchronous per-frame detection for live video. Returns null when no face is
 * found, while the model is still loading, or for the frame or two needed to
 * switch back from IMAGE mode. timestampMs must increase (performance.now()).
 */
export function detectVideo(video, timestampMs) {
  if (!instance || imageJobs > 0) return null;
  if (mode !== 'VIDEO' || pendingMode) {
    switchMode('VIDEO');
    return null;
  }
  const ts = Math.max(Math.floor(timestampMs), lastVideoTs + 1);
  lastVideoTs = ts;
  try {
    return pack(instance.detectForVideo(video, ts));
  } catch (err) {
    recreateOnCpu(err);
    return null;
  }
}

/**
 * Detection on a still image (canvas, ImageBitmap, img, ImageData, video frame).
 * Async because the shared instance may first have to switch to IMAGE mode:
 * always await it. Resolves { landmarks, matrix } or null when no face is found.
 */
export async function detectImage(source) {
  imageJobs += 1;
  try {
    await getLandmarker();
    if (recreating) await recreating;
    await switchMode('IMAGE');
    if (!instance) return null;
    try {
      return pack(instance.detect(source));
    } catch (err) {
      if (delegate !== 'GPU') throw err;
      recreateOnCpu(err);
      await recreating;
      await switchMode('IMAGE');
      return instance ? pack(instance.detect(source)) : null;
    }
  } finally {
    imageJobs -= 1;
  }
}

/**
 * Loads the face models. Resolves when the landmarker is ready; a segmenter
 * failure is reported through modelStatus() and does not reject (analysis then
 * falls back to landmark-only geometry). onProgress({ fraction, loaded, total,
 * stage }) reports bytes across every model being loaded; stage is the model key
 * ('landmarker' | 'segmenter') whose download moved last, or 'ready' at the end.
 */
export async function loadModels({ onProgress, segmenter = true } = {}) {
  const keys = segmenter ? ['landmarker', 'segmenter'] : ['landmarker'];
  const expected = { landmarker: FACE_LANDMARKER.bytes, segmenter: SELFIE_MULTICLASS.bytes };
  let lastStage = keys[0];
  const report = (stage) => {
    if (typeof onProgress !== 'function') return;
    let loaded = 0;
    let total = 0;
    for (const k of keys) {
      const st = downloadState(k);
      const ready = modelStatus()[k] === 'ready';
      const t = (st && st.total) || expected[k];
      total += t;
      loaded += ready || (st && st.done) ? t : st ? Math.min(st.loaded, t) : 0;
    }
    onProgress({ fraction: total ? Math.min(1, loaded / total) : 1, loaded, total, stage });
  };
  const unsub = subscribeDownloads((all) => {
    for (const k of keys) {
      if (all[k] && !all[k].done) lastStage = k;
    }
    report(lastStage);
  });
  report(lastStage);
  try {
    const jobs = [getLandmarker()];
    if (segmenter) {
      jobs.push(
        getSegmenter().catch((err) => {
          console.warn('Segmenter unavailable; analysis uses landmarks only', err);
          return null;
        }),
      );
    }
    await Promise.all(jobs);
  } finally {
    unsub();
  }
  report('ready');
}
