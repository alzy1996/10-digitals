// Browser analysis pipeline: photo -> models -> calibration -> HairProfile + render inputs.
import { detectImage } from './models/landmarker.js';
import { segmentImage, fallbackToCpu } from './models/segmenter.js';
import { segmentHair } from './models/hairSegmenter.js';
import { estimateAge } from './models/age.js';
import { cardGains, grayWorldGains, applyGains } from './capture/whiteCard.js';
import { personMask, feather, blurredCanvas, compositePrivate } from './capture/privacyBlur.js';
import { buildProfile, classSelfTest } from './analysis/profile.js';
import { lmPx, resampleLabels } from './analysis/imageOps.js';
import { buildAux } from './render/textures.js';

export const WORK_MAX = 1080;

/** Decode a Blob into a canvas at most WORK_MAX on the long side. */
export async function decodeToCanvas(blob, max = WORK_MAX) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return c;
}

export function canvasToImg(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

export function imgToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

const yieldUi = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param {Blob} blob front photo
 * @param {object} o { whiteCardPoint?: {x,y} in working px, privateMode, history, scannedLevels, onStep(key) }
 */
export async function analyzePhoto(blob, o = {}) {
  const step = o.onStep || (() => {});
  const t0 = performance.now();
  step('face');
  const canvas = await decodeToCanvas(blob);
  const raw = canvasToImg(canvas);
  const det = await detectImage(canvas);
  if (!det) throw Object.assign(new Error('no-face'), { code: 'no-face' });
  await yieldUi();

  step('hair');
  let seg = await segmentImage(canvas);
  const ptsRaw = lmPx(det.landmarks, canvas.width, canvas.height);
  const labelsFull = resampleLabels(seg.labels, seg.width, seg.height, canvas.width, canvas.height);
  let selfTest = classSelfTest(labelsFull, canvas.width, canvas.height, ptsRaw);
  if (!selfTest) {
    // classes scrambled (mediapipe #6142): rebuild on the CPU delegate and retry once
    await fallbackToCpu();
    seg = await segmentImage(canvas);
    selfTest = classSelfTest(resampleLabels(seg.labels, seg.width, seg.height, canvas.width, canvas.height), canvas.width, canvas.height, ptsRaw);
  }
  const hair = await segmentHair(canvas).catch(() => null);
  await yieldUi();

  step('color');
  const calibration = o.whiteCardPoint ? cardGains(raw, o.whiteCardPoint) : grayWorldGains(raw, labelsFull);
  const img = applyGains(raw, calibration.gains);
  await yieldUi();

  step('level');
  const { profile, renderData } = buildProfile({
    img,
    landmarks: det.landmarks,
    pose: det.pose,
    seg,
    hair,
    calibration,
    history: o.history,
    scannedLevels: o.scannedLevels,
  });
  await yieldUi();

  step('age');
  const faceCrop = cropFace(canvas, renderData.pts);
  profile.ageBand = await estimateAge(faceCrop);

  step('preview');
  // display image: calibrated, background blurred in Private Mode
  let display = img.data;
  if (o.privateMode !== false) {
    const mask = feather(personMask(renderData.labels, renderData.alpha), img.width, img.height, Math.max(2, Math.round(img.width / 300)));
    const blurred = canvasToImg(blurredCanvas(imgToCanvas(img), img.width, img.height, 26));
    display = compositePrivate(img.data, blurred.data, mask);
  }
  const aux = buildAux(renderData, profile.scale.mmPerPx);
  const ms = Math.round(performance.now() - t0);
  return {
    profile,
    renderData,
    aux,
    display: { width: img.width, height: img.height, data: display },
    diagnostics: { ms, selfTest, calibration: calibration.source, scaleConfidence: profile.scale.confidence },
  };
}

function cropFace(canvas, pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.min(...xs) - 20);
  const y0 = Math.max(0, Math.min(...ys) - 30);
  const w = Math.min(canvas.width - x0, Math.max(...xs) - x0 + 20);
  const h = Math.min(canvas.height - y0, Math.max(...ys) - y0 + 20);
  const c = document.createElement('canvas');
  c.width = 224;
  c.height = 224;
  c.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, 224, 224);
  return c;
}

/** Private-blurred version of an extra shot (left/right/back) for display only. */
export async function privateDisplay(blob, privateMode = true) {
  const canvas = await decodeToCanvas(blob);
  if (!privateMode) return canvas;
  try {
    const seg = await segmentImage(canvas);
    const img = canvasToImg(canvas);
    const labels = resampleLabels(seg.labels, seg.width, seg.height, img.width, img.height);
    const mask = feather(personMask(labels, null), img.width, img.height, 3);
    const blurred = canvasToImg(blurredCanvas(canvas, img.width, img.height, 26));
    return imgToCanvas({ width: img.width, height: img.height, data: compositePrivate(img.data, blurred.data, mask) });
  } catch {
    return blurredCanvas(canvas, canvas.width, canvas.height, 26);
  }
}
