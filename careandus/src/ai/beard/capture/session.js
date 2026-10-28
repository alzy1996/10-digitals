// Guided capture (PRD 5.2): front, left 45, right 45, chin-up (quick mode: front
// only) with an auto-shutter. A requestAnimationFrame loop runs the landmarker at
// up to ~30 fps on the live (un-mirrored) video, gates the pose for the current
// shot, checks distance, light and sharpness, and fires when the pose has held for
// 400 ms with a sharp, well-exposed frame. The screen plays the sound and the white
// edge flash in onShot.
//
// Hints always name the CUSTOMER's own left / right; the `arrow` field converts
// them to a screen direction for the (optionally mirrored) preview. Captured shots
// keep the full-resolution, never-mirrored frame.

import { detectVideo, detectImage, getLandmarker } from '../models/landmarker.js';
import { verifySegmenter, segmenterInfo } from '../models/segmenter.js';
import { modelStatus } from '../models/status.js';
import { poseOf, checkPose, shotsForMode, HOLD_MS } from './poseGate.js';
import { QUALITY, faceBox, lightingOf, qualityVerdict, sharpnessOf } from './quality.js';
import { irisForScale } from '../analysis/scale.js';
import { makeCanvas, makeDomCanvas, context2d } from '../analysis/pixels.js';

const DETECT_INTERVAL_MS = 33;
/** The pose must be seen in at least this many consecutive frames as well as for HOLD_MS. */
const MIN_STEADY_FRAMES = 3;
/** With pose, distance, exposure and sharpness right, an uneven light only blocks the shutter this long. */
const BALANCE_GRACE_MS = 2000;
const MAX_UPLOAD_SIDE = 2048;

/** Screen direction of a hint on a preview that is (or is not) mirrored. */
export function hintArrow(hint, mirror) {
  if (hint === 'turnLeft') return mirror ? 'left' : 'right';
  if (hint === 'turnRight') return mirror ? 'right' : 'left';
  if (hint === 'chinUp') return 'up';
  if (hint === 'chinDown') return 'down';
  return null;
}

/**
 * Quality numbers of one frame. source: video, canvas or bitmap; landmarks:
 * normalized; width / height: source pixel size. Reuses `scratch` when given.
 */
export function measureFrame(source, landmarks, width, height, yaw, scratch) {
  const box = faceBox(landmarks, width, height, 0.08);
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const bw = Math.min(width - x, box.w);
  const bh = Math.min(height - y, box.h);
  const irisPx = irisForScale(landmarks, width, height, yaw).px;
  const faceFrac = Math.max(box.w / width, box.h / height);
  if (bw < 8 || bh < 8) return { irisPx, faceFrac, faceL: NaN, cheekDiff: 0, sharpness: NaN };
  const cw = QUALITY.sharpWidth;
  const ch = Math.max(8, Math.round((cw * bh) / bw));
  const canvas = scratch && scratch.width === cw && scratch.height === ch ? scratch : makeCanvas(cw, ch);
  const ctx = context2d(canvas);
  ctx.drawImage(source, x, y, bw, bh, 0, 0, cw, ch);
  const img = ctx.getImageData(0, 0, cw, ch);
  const sx = cw / bw;
  const sy = ch / bh;
  const P = landmarks.map((l) => [(l.x * width - x) * sx, (l.y * height - y) * sy]);
  const light = lightingOf(img, P);
  return { irisPx, faceFrac, faceL: light.faceL, cheekDiff: light.diff, sharpness: sharpnessOf(img), canvas };
}

function frameToCanvas(source, width, height) {
  const canvas = makeDomCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** Starts the one-time segmenter class self-test on a downscaled copy of a frontal frame. */
function startSegmenterCheck(source, width, height, landmarks) {
  if (modelStatus().segmenter !== 'ready' || segmenterInfo().verification !== 'pending') return;
  const s = Math.min(1, 512 / Math.max(width, height));
  const canvas = makeCanvas(width * s, height * s);
  context2d(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  verifySegmenter(canvas, landmarks);
}

/**
 * createCaptureSession({ video, mode: 'full'|'quick', mirror, onStatus, onShot, onDone })
 * -> { start(), stop(), retake(shotId), current() }.
 *
 * onStatus({ shot, faceFound, pose, hint, progress, arrow, index, total, taken })
 *   shot: id of the shot being taken; progress: 0..1 of the 400 ms hold;
 *   arrow: 'left'|'right'|'up'|'down'|null on screen; taken: ids already captured.
 * onShot(shot) after the auto-shutter; onDone({ front, left, right, chinUp }) when
 * every shot of the mode is in. The loop stops itself when done; retake() restarts
 * it for that one shot.
 */
export function createCaptureSession({ video, mode = 'full', mirror = true, onStatus, onShot, onDone } = {}) {
  const order = shotsForMode(mode);
  const shots = { front: null, left: null, right: null, chinUp: null };
  let queue = [...order];
  let running = false;
  let raf = 0;
  let lastDetect = 0;
  let holdStart = 0;
  let steadyFrames = 0;
  let balanceWait = 0;
  let scratch = null;

  const resetHold = () => {
    holdStart = 0;
    steadyFrames = 0;
    balanceWait = 0;
  };

  const emit = (status) => {
    if (typeof onStatus !== 'function') return;
    const id = queue[0] || null;
    onStatus({
      shot: id,
      index: id ? order.indexOf(id) : order.length,
      total: order.length,
      taken: order.filter((s) => shots[s]),
      arrow: hintArrow(status.hint, mirror),
      ...status,
    });
  };

  function capture(id, det, pose, now, issues) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = frameToCanvas(video, vw, vh);
    // Re-detect on the exact pixels kept, so landmarks match the stored frame.
    const again = detectVideo(canvas, now + 1);
    const use = again || det;
    const finalPose = again ? poseOf({ matrix: again.matrix, landmarks: again.landmarks, width: vw, height: vh }) : pose;
    const shot = {
      id,
      canvas,
      width: vw,
      height: vh,
      landmarks: use.landmarks,
      matrix: use.matrix,
      pose: finalPose,
      capturedAt: new Date(),
      issues,
    };
    shots[id] = shot;
    queue.shift();
    resetHold();
    if (typeof onShot === 'function') onShot(shot);
    // The segmenter class self-test runs once, on the first frontal shot, after the
    // shutter feedback: never while the customer is holding a pose.
    if (Math.abs(finalPose.yaw) < 15 && Math.abs(finalPose.pitch) < 15) {
      setTimeout(() => startSegmenterCheck(canvas, vw, vh, use.landmarks), 60);
    }
    if (!queue.length) {
      stop();
      emit({ faceFound: true, pose: finalPose, hint: null, progress: 1 });
      if (typeof onDone === 'function') onDone({ ...shots });
    }
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (now - lastDetect < DETECT_INTERVAL_MS) return;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    lastDetect = now;
    const id = queue[0];
    if (!id) return;
    const det = detectVideo(video, now);
    if (!det) {
      resetHold();
      emit({ faceFound: false, pose: null, hint: 'noFace', progress: 0 });
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const pose = poseOf({ matrix: det.matrix, landmarks: det.landmarks, width: vw, height: vh });
    const gate = checkPose(id, pose);
    const q = measureFrame(video, det.landmarks, vw, vh, pose.yaw, scratch);
    if (q.canvas) scratch = q.canvas;
    const verdict = qualityVerdict({ ...q, checkBalance: id === 'front' || id === 'chinUp' });

    let hint = null;
    if (!verdict.distanceOk) hint = verdict.hints[0];
    else if (!gate.ok) hint = gate.hint;
    else if (verdict.hints.length) hint = verdict.hints[0];

    // Hold time is measured between the sampling times of the frames (rAF stamps),
    // and the pose must be confirmed on several frames, so a slow detection cannot
    // count as a held pose.
    const steady = gate.ok && verdict.distanceOk;
    if (!steady) {
      resetHold();
    } else {
      if (!holdStart) holdStart = now;
      steadyFrames += 1;
    }
    const progress = holdStart ? Math.min(1, (now - holdStart) / HOLD_MS, steadyFrames / MIN_STEADY_FRAMES) : 0;
    const fireable = steady && verdict.exposureOk && verdict.sharpOk;
    if (fireable && !verdict.balanceOk) {
      if (!balanceWait) balanceWait = now;
    } else {
      balanceWait = 0;
    }
    const balanceDone = verdict.balanceOk || (balanceWait && now - balanceWait >= BALANCE_GRACE_MS);
    if (fireable && balanceDone && progress >= 1) {
      capture(id, det, pose, now, verdict.balanceOk ? [] : ['light']);
      return;
    }
    if (steady && !hint) hint = 'hold';
    emit({ faceFound: true, pose, hint, progress });
  }

  function start() {
    if (running || !queue.length) return;
    running = true;
    lastDetect = 0;
    resetHold();
    getLandmarker()
      .then(() => {
        if (running) raf = requestAnimationFrame(tick);
      })
      .catch((err) => {
        running = false;
        console.error('Face model failed to load', err);
        emit({ faceFound: false, pose: null, hint: 'noFace', progress: 0, error: 'model' });
      });
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function retake(shotId) {
    if (!order.includes(shotId)) return;
    shots[shotId] = null;
    queue = order.filter((s) => !shots[s]);
    resetHold();
    if (!running) start();
  }

  function current() {
    return { shot: queue[0] || null, shots: { ...shots }, running, mode, order: [...order] };
  }

  return { start, stop, retake, current };
}

async function decodeToCanvas(fileOrBlob) {
  let source = null;
  let width = 0;
  let height = 0;
  let cleanup = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      source = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' });
      width = source.width;
      height = source.height;
      cleanup = () => source.close && source.close();
    } catch (err) {
      source = null;
    }
  }
  if (!source) {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  }
  const s = Math.min(1, MAX_UPLOAD_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * s));
  const h = Math.max(1, Math.round(height * s));
  const canvas = frameToCanvas(source, w, h);
  cleanup();
  return canvas;
}

/**
 * Home mode upload: builds a Shot from a photo with the same pose and light checks
 * as the live capture, in IMAGE mode. Never refuses a photo that has a face: the
 * failed checks come back as `issues` (hint keys) for a warning. Resolves
 * { shot, issues }; shot is null only when no face is found (issues ['noFace']).
 */
export async function shotFromImage(fileOrBlob, shotId = 'front') {
  const canvas = await decodeToCanvas(fileOrBlob);
  const det = await detectImage(canvas);
  if (!det) return { shot: null, issues: ['noFace'] };
  const { width, height } = canvas;
  const pose = poseOf({ matrix: det.matrix, landmarks: det.landmarks, width, height });
  const gate = checkPose(shotId, pose);
  const q = measureFrame(canvas, det.landmarks, width, height, pose.yaw);
  const verdict = qualityVerdict({ ...q, checkBalance: shotId === 'front' || shotId === 'chinUp' });
  const issues = [];
  if (!gate.ok && gate.hint) issues.push(gate.hint);
  for (const h of verdict.hints) if (!issues.includes(h)) issues.push(h);
  if (Math.abs(pose.yaw) < 15 && Math.abs(pose.pitch) < 15) startSegmenterCheck(canvas, width, height, det.landmarks);
  const shot = {
    id: shotId,
    canvas,
    width,
    height,
    landmarks: det.landmarks,
    matrix: det.matrix,
    pose,
    capturedAt: new Date(),
    issues,
  };
  return { shot, issues };
}
