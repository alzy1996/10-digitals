// Per-frame measurements the renderers need: the metric scale from the iris, the
// light estimate from the cheeks, and the crops used by thumbnails and the AI Final
// Look. Landmarks are MediaPipe normalized landmarks of the UN-mirrored frame.

import { IRIS, MEASURE, FOREHEAD_TOP, CHIN_BOTTOM } from '../mesh/zones.js';
import { clamp, makeCanvas } from './util.js';

/** Adult horizontal iris diameter (mm), MediaPipe Iris. */
export const IRIS_MM = 11.7;
/** Typical zygion-to-zygion width at 234 / 454 (mm), used when the iris is missing. */
const FACE_WIDTH_MM = 142;

const px = (l, w, h) => [l.x * w, l.y * h];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function irisWidth(landmarks, w, h, side) {
  const ring = IRIS[side].ring;
  if (!landmarks || landmarks.length < 478) return NaN;
  const pts = ring.map((i) => px(landmarks[i], w, h));
  let best = -1;
  let d = NaN;
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const dx = Math.abs(pts[a][0] - pts[b][0]);
      if (dx > best) {
        best = dx;
        d = dist(pts[a], pts[b]);
      }
    }
  }
  return d;
}

/** Millimetres per pixel of a w x h frame from its landmarks (iris, else face width). */
export function frameMmPerPx(landmarks, w, h) {
  if (!landmarks || landmarks.length < 468) return NaN;
  const l = irisWidth(landmarks, w, h, 'L');
  const r = irisWidth(landmarks, w, h, 'R');
  const vals = [l, r].filter((v) => Number.isFinite(v) && v >= 3);
  if (vals.length === 2 && Math.abs(l - r) / Math.max(l, r) < 0.35) return IRIS_MM / ((l + r) / 2);
  if (vals.length) return IRIS_MM / Math.max(...vals);
  const fw = dist(px(landmarks[MEASURE.cheekL], w, h), px(landmarks[MEASURE.cheekR], w, h));
  return fw > 0 ? FACE_WIDTH_MM / fw : NaN;
}

/** Face box in pixels: { x, y, w, h, cx, cy } from the face oval extremes. */
export function faceBoxPx(landmarks, w, h) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < Math.min(468, landmarks.length); i++) {
    const p = landmarks[i];
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0 * w, y: y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h, cx: ((x0 + x1) / 2) * w, cy: ((y0 + y1) / 2) * h };
}

/** Moves / shrinks a rect so it fits inside w x h, keeping its aspect. */
export function fitRect(r, w, h) {
  let { x, y, w: rw, h: rh } = r;
  const k = Math.min(1, w / rw, h / rh);
  if (k < 1) {
    const cx = x + rw / 2;
    const cy = y + rh / 2;
    rw *= k;
    rh *= k;
    x = cx - rw / 2;
    y = cy - rh / 2;
  }
  x = clamp(x, 0, w - rw);
  y = clamp(y, 0, h - rh);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(rw), h: Math.round(rh) };
}

/**
 * Crop on the lower face (nose bridge to below the chin, room for a long beard),
 * aspect w:h (default 4:5), in frame pixels.
 */
export function lowerFaceCrop(landmarks, w, h, aspect = 4 / 5, beardBelowMm = 40) {
  const top = px(landmarks[FOREHEAD_TOP], w, h);
  const chin = px(landmarks[CHIN_BOTTOM], w, h);
  const faceH = dist(top, chin);
  const mmpp = frameMmPerPx(landmarks, w, h);
  const below = Number.isFinite(mmpp) && mmpp > 0 ? beardBelowMm / mmpp : 0.25 * faceH;
  const bridge = px(landmarks[6], w, h);
  const y0 = bridge[1] - 0.06 * faceH;
  const y1 = chin[1] + Math.max(0.2 * faceH, below);
  const rh = y1 - y0;
  const rw = rh * aspect;
  const cx = (px(landmarks[MEASURE.cheekL], w, h)[0] + px(landmarks[MEASURE.cheekR], w, h)[0]) / 2;
  return fitRect({ x: cx - rw / 2, y: y0, w: rw, h: rh }, w, h);
}

/**
 * Square crop of the face and beard region for the AI Final Look, in frame pixels.
 */
export function faceBeardCrop(landmarks, w, h, beardBelowMm = 40) {
  const box = faceBoxPx(landmarks, w, h);
  const mmpp = frameMmPerPx(landmarks, w, h);
  const below = Number.isFinite(mmpp) && mmpp > 0 ? beardBelowMm / mmpp : 0.25 * box.h;
  const y0 = box.y - 0.08 * box.h;
  const y1 = box.y + box.h + Math.max(0.12 * box.h, below);
  const side = Math.max(y1 - y0, box.w * 1.45);
  return fitRect({ x: box.cx - side / 2, y: y0 - (side - (y1 - y0)) / 2, w: side, h: side }, w, h);
}

/** Time without a face from the start, once the landmarker can look, before Live AR says so (ms). */
export const NO_FACE_MS = 1500;

/**
 * Decides when Live AR reports the face state. A change (found <-> lost) is reported at
 * once. When no face is ever found, the state is still reported once, after noFaceMs of
 * frames the landmarker really looked at (a model still loading does not count), so
 * the screen can ask the customer to face the camera.
 * Returns step(now, { found, changed, canDetect }) -> true | false (report this state) |
 * null (nothing to report), and reset() for a new start.
 */
export function faceAnnouncer(noFaceMs = NO_FACE_MS) {
  let announced = false;
  let since = null;
  return {
    step(now, { found, changed, canDetect }) {
      if (changed) {
        announced = true;
        return Boolean(found);
      }
      if (announced || found || !canDetect) return null;
      if (since === null) {
        since = now;
        return null;
      }
      if (now - since < noFaceMs) return null;
      announced = true;
      return false;
    },
    reset() {
      announced = false;
      since = null;
    },
  };
}

let lightCanvas = null;

/** Mean linear RGB of a disc of an RGBA buffer ([NaN x 3] when empty). */
function linearAt(data, sw, sh, cx, cy, r) {
  let R = 0;
  let G = 0;
  let B = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(sw - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(sh - 1, Math.ceil(cy + r));
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const o = (y * sw + x) * 4;
      R += lin(data[o]);
      G += lin(data[o + 1]);
      B += lin(data[o + 2]);
      n += 1;
    }
  }
  return n ? [R / n, G / n, B / n] : [NaN, NaN, NaN];
}

const lumOf = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

const yToL = (Y) => (Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y);

/**
 * Light estimate (PRD 7.1 layer 4) from a frame: the light's x direction from the
 * left / right cheek brightness, a fixed slight top light, the ambient share (lower
 * when one side is much brighter) and the exposure relative to the capture-time skin
 * L* (refSkinL, optional; 1 without it).
 * Returns { dir: [x, y, z] (scene space, un-mirrored), ambient, exposure, meanL,
 * skinRgb (mean linear RGB of the cheeks) } or a neutral light when the frame cannot
 * be read.
 */
export function estimateLight(source, landmarks, w, h, { refSkinL = null } = {}) {
  const neutral = { dir: [0, 0.3, 0.954], ambient: 0.45, exposure: 1, meanL: null, skinRgb: null };
  if (!source || !landmarks || landmarks.length < 468) return neutral;
  try {
    const sw = 96;
    const sh = Math.max(8, Math.round((96 * h) / w));
    if (!lightCanvas) lightCanvas = makeCanvas(sw, sh);
    if (!lightCanvas) return neutral;
    if (lightCanvas.width !== sw || lightCanvas.height !== sh) {
      lightCanvas.width = sw;
      lightCanvas.height = sh;
    }
    const ctx = lightCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, sw, sh);
    const { data } = ctx.getImageData(0, 0, sw, sh);
    // No copy of the face stays in the scratch canvas.
    ctx.clearRect(0, 0, sw, sh);
    const P = (i) => [landmarks[i].x * sw, landmarks[i].y * sh];
    const faceW = dist(P(MEASURE.cheekL), P(MEASURE.cheekR));
    const r = Math.max(1.5, faceW * 0.07);
    // Customer's right cheek is on the image left (un-mirrored frame).
    const cheeks = [50, 205, 280, 425].map((i) => linearAt(data, sw, sh, ...P(i), r));
    const imgLeft = (lumOf(cheeks[0]) + lumOf(cheeks[1])) / 2;
    const imgRight = (lumOf(cheeks[2]) + lumOf(cheeks[3])) / 2;
    const fore = lumOf(linearAt(data, sw, sh, ...P(151), r));
    if (![imgLeft, imgRight].every(Number.isFinite) || imgLeft + imgRight <= 1e-4) return neutral;
    const skinRgb = [0, 1, 2].map((c) => cheeks.reduce((sum, rgb) => sum + rgb[c], 0) / cheeks.length);
    const lx = clamp((2.4 * (imgRight - imgLeft)) / (imgRight + imgLeft), -0.75, 0.75);
    const ly = 0.3;
    const lz = Math.sqrt(Math.max(0.05, 1 - lx * lx - ly * ly));
    const meanY = Number.isFinite(fore) ? (imgLeft + imgRight + fore) / 3 : (imgLeft + imgRight) / 2;
    const meanL = yToL(meanY);
    let exposure = 1;
    if (Number.isFinite(refSkinL) && refSkinL > 5) {
      const refY = ((refSkinL + 16) / 116) ** 3;
      exposure = clamp((meanY / refY) ** 0.8, 0.6, 1.5);
    }
    return { dir: [lx, ly, lz], ambient: clamp(0.6 - 0.5 * Math.abs(lx), 0.3, 0.6), exposure, meanL, skinRgb };
  } catch (err) {
    console.warn('Light estimate failed', err);
    return neutral;
  }
}
