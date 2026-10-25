// MediaPipe Image Segmenter with selfie_multiclass_256x256: per-pixel classes
// background, hair, body skin, face skin, clothes, others.
//
// iOS Safari with the GPU delegate returns scrambled classes (MediaPipe issue
// 6142), so iOS always runs on the CPU. Other platforms start on the GPU and run
// a class self-test on the first real face frame (verifySegmenter): face-skin must
// cover most of the landmark face oval and the area just above the forehead must
// belong to the person, not the background. A failed test recreates the task on
// the CPU and tests again; a second failure marks the masks unreliable so the
// analysis falls back to landmark-only geometry.
//
// The network works at 256 x 256, so masks are coarse at full resolution:
// refineMask() upsamples them with a guided filter (box-filter implementation)
// that snaps class edges to the image edges.

import { SELFIE_MULTICLASS } from './cdn.js';
import { loadFileset, loadVision, createWithFallback } from './vision.js';
import { fetchModelBytes, setModelStatus } from './status.js';
import { isIOS } from './platform.js';
import { FACE_OVAL, FOREHEAD_TOP, CHIN_BOTTOM, MEASURE } from '../mesh/zones.js';
import { forEachPixelInPolygon, grayOf, guidedFilterPrep, guidedFilterApply } from '../analysis/pixels.js';

import { CLASSES } from './classes.js';

export { CLASSES, CLASS_COUNT } from './classes.js';

let instance = null;
let delegate = null;
let modelBytes = null;
let loadPromise = null;
let mode = 'IMAGE';
let modeQueue = Promise.resolve();
let pendingMode = null;
let imageJobs = 0;
let lastVideoTs = -1;
let verification = isIOS() ? 'ios-cpu' : 'pending';
let verifyPromise = null;

async function create(preferGpu) {
  const [vision, fileset] = await Promise.all([loadVision(), loadFileset()]);
  const factory = (d) =>
    vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modelBytes, delegate: d },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  const made = await createWithFallback(factory, preferGpu);
  mode = 'IMAGE';
  modeQueue = Promise.resolve();
  pendingMode = null;
  return made;
}

/** The shared ImageSegmenter (loads the model on first call). */
export function getSegmenter() {
  if (instance) return Promise.resolve(instance);
  if (!loadPromise) {
    setModelStatus('segmenter', 'loading');
    loadPromise = (async () => {
      modelBytes = await fetchModelBytes(SELFIE_MULTICLASS.key, SELFIE_MULTICLASS.url, SELFIE_MULTICLASS.bytes);
      const made = await create(!isIOS());
      instance = made.task;
      delegate = made.delegate;
      if (delegate === 'CPU' && verification === 'pending') verification = 'cpu';
      setModelStatus('segmenter', 'ready');
      return instance;
    })().catch((err) => {
      loadPromise = null;
      setModelStatus('segmenter', 'error');
      throw err;
    });
  }
  return loadPromise;
}

/**
 * { ready, delegate, verification } where verification is 'pending' (GPU, not
 * tested yet), 'gpu-ok', 'cpu' (GPU unavailable), 'cpu-fallback' (GPU failed the
 * class self-test), 'ios-cpu', or 'unreliable' (failed on the CPU too).
 */
export function segmenterInfo() {
  return { ready: !!instance, delegate, verification };
}

/** True when masks can be trusted for geometry and color sampling. */
export function segmenterReliable() {
  return !!instance && verification !== 'unreliable';
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
    .catch((err) => console.error('ImageSegmenter mode switch failed', err))
    .finally(() => {
      if (pendingMode === target) pendingMode = null;
    });
  return modeQueue;
}

function packResult(result) {
  const mask = result && result.categoryMask;
  if (!mask) {
    if (result && typeof result.close === 'function') result.close();
    return null;
  }
  const width = mask.width;
  const height = mask.height;
  const categories = new Uint8Array(mask.getAsUint8Array());
  if (typeof result.close === 'function') result.close();
  return { width, height, categories, delegate };
}

/**
 * Segments a still image. Async (may switch the shared instance to IMAGE mode):
 * always await it. Resolves { width, height, categories: Uint8Array, delegate } at
 * the source size (MediaPipe upsamples the 256 x 256 output), or null.
 */
export async function segmentImage(source) {
  imageJobs += 1;
  try {
    await getSegmenter();
    await switchMode('IMAGE');
    if (!instance) return null;
    return packResult(instance.segment(source));
  } finally {
    imageJobs -= 1;
  }
}

/**
 * Synchronous per-frame segmentation for live video. Returns null while loading
 * or while the instance switches back from IMAGE mode.
 */
export function segmentVideo(video, timestampMs) {
  if (!instance || imageJobs > 0) return null;
  if (mode !== 'VIDEO' || pendingMode) {
    switchMode('VIDEO');
    return null;
  }
  const ts = Math.max(Math.floor(timestampMs), lastVideoTs + 1);
  lastVideoTs = ts;
  try {
    return packResult(instance.segmentForVideo(video, ts));
  } catch (err) {
    console.error('ImageSegmenter video run failed', err);
    return null;
  }
}

/**
 * Class self-test on one face frame. seg: segmentImage() result for the frame;
 * landmarks: normalized landmarks of the same frame. Returns
 * { ok, faceSkin, aboveBackground }: faceSkin is the share of FACE_SKIN pixels in
 * the face oval (shrunk 15 % toward its centre to stay clear of the edges),
 * aboveBackground the share of BACKGROUND in a band just above the forehead.
 */
export function selfTestMask(seg, landmarks) {
  const { width: w, height: h, categories } = seg;
  const P = (i) => [landmarks[i].x * w, landmarks[i].y * h];
  const oval = FACE_OVAL.map(P);
  let cx = 0;
  let cy = 0;
  for (const p of oval) {
    cx += p[0];
    cy += p[1];
  }
  cx /= oval.length;
  cy /= oval.length;
  const inner = oval.map(([x, y]) => [cx + (x - cx) * 0.85, cy + (y - cy) * 0.85]);
  let face = 0;
  const total = forEachPixelInPolygon(inner, w, h, (p) => {
    if (categories[p] === CLASSES.FACE_SKIN) face++;
  });

  const top = P(FOREHEAD_TOP);
  const chin = P(CHIN_BOTTOM);
  const len = Math.hypot(top[0] - chin[0], top[1] - chin[1]) || 1;
  const up = [(top[0] - chin[0]) / len, (top[1] - chin[1]) / len];
  const side = [-up[1], up[0]];
  const faceW = Math.hypot(P(MEASURE.cheekL)[0] - P(MEASURE.cheekR)[0], P(MEASURE.cheekL)[1] - P(MEASURE.cheekR)[1]);
  const halfW = 0.2 * faceW;
  const base = [top[0] + up[0] * 0.04 * len, top[1] + up[1] * 0.04 * len];
  const far = [top[0] + up[0] * 0.18 * len, top[1] + up[1] * 0.18 * len];
  const band = [
    [base[0] - side[0] * halfW, base[1] - side[1] * halfW],
    [base[0] + side[0] * halfW, base[1] + side[1] * halfW],
    [far[0] + side[0] * halfW, far[1] + side[1] * halfW],
    [far[0] - side[0] * halfW, far[1] - side[1] * halfW],
  ];
  let bg = 0;
  const bandTotal = forEachPixelInPolygon(band, w, h, (p) => {
    if (categories[p] === CLASSES.BACKGROUND) bg++;
  });
  const faceSkin = total ? face / total : 0;
  const aboveBackground = bandTotal ? bg / bandTotal : 0;
  return { ok: total > 50 && faceSkin >= 0.55 && aboveBackground < 0.5, faceSkin, aboveBackground };
}

/**
 * Runs the class self-test once per page load (not on iOS, which is CPU only, and
 * not when the GPU was unavailable). source: a canvas of a real face frame;
 * landmarks: its normalized landmarks. Resolves segmenterInfo().
 */
export function verifySegmenter(source, landmarks) {
  if (verification !== 'pending') return Promise.resolve(segmenterInfo());
  if (verifyPromise) return verifyPromise;
  verifyPromise = (async () => {
    const seg = await segmentImage(source);
    if (!seg) return segmenterInfo();
    if (selfTestMask(seg, landmarks).ok) {
      verification = 'gpu-ok';
      return segmenterInfo();
    }
    console.warn('Segmenter classes failed the self-test on the GPU; recreating on the CPU');
    const old = instance;
    instance = null;
    try {
      const made = await create(false);
      instance = made.task;
      delegate = made.delegate;
    } finally {
      try {
        if (old) old.close();
      } catch (err) {
        console.warn(err);
      }
    }
    const seg2 = await segmentImage(source);
    verification = seg2 && selfTestMask(seg2, landmarks).ok ? 'cpu-fallback' : 'unreliable';
    return segmenterInfo();
  })()
    .catch((err) => {
      console.error('Segmenter self-test failed to run', err);
      return segmenterInfo();
    })
    .finally(() => {
      verifyPromise = null;
    });
  return verifyPromise;
}

/**
 * Upsamples (nearest) a category mask to the guide image size and snaps the class
 * boundaries to the image edges with a guided filter on each class indicator, then
 * takes the arg-max. guide: ImageData-like at the target size. radius in target
 * pixels (default: about 1.5 mask cells), eps: guided-filter regulariser on a 0..1
 * guide. Returns { width, height, categories }.
 */
export function refineMask(seg, guide, { radius, eps = 0.004 } = {}) {
  const w = guide.width;
  const h = guide.height;
  const n = w * h;
  const up = new Uint8Array(n);
  const sx = seg.width / w;
  const sy = seg.height / h;
  for (let y = 0; y < h; y++) {
    const my = Math.min(seg.height - 1, Math.floor((y + 0.5) * sy));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(seg.width - 1, Math.floor((x + 0.5) * sx));
      up[y * w + x] = seg.categories[my * seg.width + mx];
    }
  }
  const present = new Set();
  for (let k = 0; k < n; k++) present.add(up[k]);
  if (present.size < 2) return { width: w, height: h, categories: up };
  const cell = Math.max(w, h) / 256;
  const r = Math.max(2, Math.round(radius !== undefined ? radius : 1.5 * cell));
  const gray = grayOf(guide);
  for (let k = 0; k < n; k++) gray[k] /= 255;
  const prep = guidedFilterPrep(gray, w, h, r, eps);
  const best = new Float32Array(n).fill(-Infinity);
  const out = new Uint8Array(n);
  const ind = new Float32Array(n);
  for (const c of present) {
    for (let k = 0; k < n; k++) ind[k] = up[k] === c ? 1 : 0;
    const q = guidedFilterApply(prep, ind);
    for (let k = 0; k < n; k++) {
      if (q[k] > best[k]) {
        best[k] = q[k];
        out[k] = c;
      }
    }
  }
  return { width: w, height: h, categories: out };
}
