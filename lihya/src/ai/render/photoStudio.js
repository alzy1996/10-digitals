// Photo Studio (PRD 7.2): the same beard layers as live AR, at full resolution on a
// still Shot (front, or the left / right 45 degree shots for side views, each with
// its own landmarks), composited over the photo. Thumbnails for the style cards use
// the same path on a 4:5 crop of the lower face with a smaller texture.
//
// One shared offscreen WebGL renderer serves every still render and thumbnail, so the
// app never holds more than two WebGL contexts (this one and the live AR canvas);
// iOS limits them.

import * as THREE from 'three';
import { createBeardScene } from './glScene.js';
import { FACE_TEX_SIZE, FAST_TEX_SIZE, clearTextureCache } from './beardTextures.js';
import { needsOutline, clearOutlineCache } from './inpaint.js';
import { textureJob, clearTextureJobs } from './textureJobs.js';
import { growthAt, DEFAULT_GROWTH_MM_PER_DAY } from './timeline.js';
import { frameMmPerPx, estimateLight, lowerFaceCrop } from './frame.js';
import { makeCanvas, isNum } from './util.js';
import { lineGuides } from './lineGuides.js';
import { segmentImage } from '../models/segmenter.js';
import { modelStatus } from '../models/status.js';

let shared = null;

function getShared() {
  if (shared) return shared;
  const canvas = makeCanvas(2, 2);
  if (!canvas) throw new Error('Photo Studio needs a canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    antialias: false,
    powerPreference: 'default',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  const beard = createBeardScene({ background: false });
  const onLost = (e) => {
    e.preventDefault();
    disposeShared();
  };
  if (canvas.addEventListener) canvas.addEventListener('webglcontextlost', onLost, false);
  shared = { canvas, renderer, beard, onLost, photo: null, photoSource: null, releaseTimer: 0 };
  return shared;
}

/** How long the shot photo stays on the GPU after the last render (ms). */
const PHOTO_KEEP_MS = 30000;

const weak = (v) => (typeof WeakRef === 'function' ? new WeakRef(v) : { deref: () => v });

/** Drops the photo texture: the customer's photo is never kept longer than needed. */
function releasePhoto(s) {
  if (s.releaseTimer) clearTimeout(s.releaseTimer);
  s.releaseTimer = 0;
  if (s.photo) {
    s.beard.setPhoto(null);
    s.photo.dispose();
  }
  s.photo = null;
  s.photoSource = null;
}

/**
 * Mipmapped texture of the shot photo for the shading transfer. One is kept at a
 * time (only a weak reference to the shot canvas), released 30 s after the last
 * render.
 */
function photoTexture(s, source) {
  if (s.releaseTimer) clearTimeout(s.releaseTimer);
  s.releaseTimer = setTimeout(() => releasePhoto(s), PHOTO_KEEP_MS);
  if (s.photo && s.photoSource && s.photoSource.deref() === source) return s.photo;
  if (s.photo) s.photo.dispose();
  const tex = new THREE.CanvasTexture(source);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  s.photo = tex;
  s.photoSource = weak(source);
  return tex;
}

/** Frees the shared offscreen renderer (it is created again on the next render). */
export function disposeShared() {
  if (!shared) return;
  const s = shared;
  shared = null;
  try {
    if (s.canvas.removeEventListener) s.canvas.removeEventListener('webglcontextlost', s.onLost, false);
    releasePhoto(s);
    s.beard.dispose();
    s.renderer.dispose();
  } catch (err) {
    console.warn('Photo Studio renderer dispose failed', err);
  }
}

/**
 * Forgets everything the render engine keeps between calls: cached beard and Outline
 * textures, the texture worker, and the shared offscreen renderer with the last
 * photo. Call it when the session is wiped ("Next customer", idle timeout).
 */
export function clearRenderCaches() {
  clearTextureJobs();
  clearTextureCache();
  clearOutlineCache();
  disposeShared();
}

const shotSize = (shot) => [shot.width || shot.canvas.width, shot.height || shot.canvas.height];

const lightCache = new WeakMap();
function lightFor(shot) {
  const hit = lightCache.get(shot);
  if (hit) return hit;
  const [W, H] = shotSize(shot);
  // Photo Studio keeps the photo's own exposure (the shot is the reference).
  const light = estimateLight(shot.canvas, shot.landmarks, W, H);
  light.exposure = 1;
  lightCache.set(shot, light);
  return light;
}

const segCache = new WeakMap();
/** Segmentation of a side shot for shell occlusion; only when the model is already loaded. */
async function segmentationFor(shot) {
  if (segCache.has(shot)) return segCache.get(shot);
  let seg = null;
  try {
    if (modelStatus().segmenter === 'ready') seg = await segmentImage(shot.canvas);
  } catch (err) {
    console.warn('Segmentation for Photo Studio failed', err);
    seg = null;
  }
  segCache.set(shot, seg);
  return seg;
}

function lookFor(params, profile, { timelineDays, timeline, growthMmPerDay }) {
  const useTimeline = timeline === true || (isNum(timelineDays) && timelineDays > 0);
  if (!useTimeline) return { params, coverage: null };
  const g = growthAt(params, profile, isNum(timelineDays) ? timelineDays : 0, growthMmPerDay || DEFAULT_GROWTH_MM_PER_DAY);
  return { params: g.params, coverage: g.coverage };
}

function drawPass(s, { landmarks, frameW, frameH, view, outW, outH, tex, overlay, light, mode, seg, photo }) {
  const { renderer, beard } = s;
  renderer.setSize(outW, outH, false);
  beard.setPhoto(photo ? photoTexture(s, photo) : null);
  beard.setBeard(tex);
  beard.setOverlay(overlay);
  beard.setSegmentation(seg);
  beard.update({
    landmarks,
    width: frameW,
    height: frameH,
    mirror: false,
    mmPerPx: frameMmPerPx(landmarks, frameW, frameH),
    light,
    view,
    mode,
  });
  renderer.render(beard.scene, beard.camera);
  return s.canvas;
}

/**
 * Renders the look on a still shot.
 * @param {object} opts
 * @param {object} opts.shot Shot (front, left or right)
 * @param {object} opts.params LookParams
 * @param {object|null} opts.profile FaceProfile
 * @param {number} [opts.timelineDays=0] growth days; 0 shows the designed look
 * @param {boolean} [opts.timeline] true: show the growth state even at day 0 ("today")
 * @param {number} [opts.growthMmPerDay=0.4]
 * @param {boolean} [opts.outline=false] Outline mode instead of the beard
 * @param {number} [opts.maxSize=1600] longest side of the result
 * @param {number} [opts.day=1] henna day (1 or 3)
 * @returns {Promise<HTMLCanvasElement>} the composite (photo + beard), never mirrored
 */
export async function renderStudio({
  shot,
  params,
  profile = null,
  timelineDays = 0,
  timeline,
  growthMmPerDay,
  outline = false,
  maxSize = 1600,
  day = 1,
} = {}) {
  if (!shot || !shot.canvas || !shot.landmarks) throw new Error('renderStudio needs a shot with landmarks');
  const [W0, H0] = shotSize(shot);
  const k = Math.min(1, maxSize / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * k));
  const H = Math.max(1, Math.round(H0 * k));
  const look = lookFor(params, profile, { timelineDays, timeline, growthMmPerDay });
  let overlayJob = null;
  if (outline) overlayJob = textureJob('outline', params, profile, { size: FACE_TEX_SIZE });
  else {
    // Going shorter on some zones: the new beard plus red where hair comes off.
    const no = needsOutline(look.params, profile);
    if (no.needed) overlayJob = textureJob('outline', look.params, profile, { size: FACE_TEX_SIZE, zones: no.zones });
  }
  const [tex, overlay] = await Promise.all([
    outline ? null : textureJob('beard', look.params, profile, { size: FACE_TEX_SIZE, coverage: look.coverage, day }),
    overlayJob,
  ]);
  // The segmenter keeps neck hair off the collar and hides the far side of a long
  // beard behind the neck (only when its model is already loaded).
  const seg = (tex && tex.shell) || (overlay && overlay.shell) ? await segmentationFor(shot) : null;
  const s = getShared();
  const gl = drawPass(s, {
    landmarks: shot.landmarks,
    frameW: W,
    frameH: H,
    view: null,
    outW: W,
    outH: H,
    tex,
    overlay,
    light: lightFor(shot),
    mode: outline ? 'outline' : 'beard',
    seg,
    photo: shot.canvas,
  });
  const out = makeCanvas(W, H);
  const ctx = out.getContext('2d');
  ctx.drawImage(shot.canvas, 0, 0, W, H);
  ctx.drawImage(gl, 0, 0, W, H);
  return out;
}

/**
 * Where the look's cheek lines, neckline and jaw sit on a shot, in that shot's pixels
 * (lineGuides.js): the Studio draws them over the photo, puts its cheek-line and
 * neckline drag handles on them and lays the barber's ruler along the jaw. Reached
 * through the AI facade as renderStudio.lineGuides(shot, params).
 */
renderStudio.lineGuides = lineGuides;

/**
 * Style-card thumbnail: the look on a 4:5 crop of the lower face, as a JPEG data URL.
 * Fast path: a 384 px texture with coarser density fields (the card is about 300 px
 * across the face), rendered only on the crop, generated in the texture worker.
 * @param {object} shot front Shot
 * @param {object} params LookParams
 * @param {object|null} profile
 * @param {{ width?: number, quality?: number }} [opts]
 * @returns {Promise<string>} data URL (image/jpeg)
 */
export async function renderThumbnail(shot, params, profile, { width = 320, quality = 0.85 } = {}) {
  if (!shot || !shot.canvas || !shot.landmarks) throw new Error('renderThumbnail needs a shot with landmarks');
  const [W0, H0] = shotSize(shot);
  const crop = lowerFaceCrop(shot.landmarks, W0, H0, 4 / 5);
  const outW = Math.max(16, Math.round(width));
  const outH = Math.round((outW * 5) / 4);
  const k = outW / crop.w;
  const tex = await textureJob('beard', params, profile, { size: FAST_TEX_SIZE, quality: 'fast' });
  // Same occlusion as the Studio (cached per shot, so only the first card pays for it).
  const seg = tex.shell ? await segmentationFor(shot) : null;
  const s = getShared();
  const gl = drawPass(s, {
    landmarks: shot.landmarks,
    frameW: W0 * k,
    frameH: H0 * k,
    view: { x: crop.x * k, y: crop.y * k, w: outW, h: outH },
    outW,
    outH,
    tex,
    overlay: null,
    light: lightFor(shot),
    mode: 'beard',
    seg,
    photo: shot.canvas,
  });
  const out = makeCanvas(outW, outH);
  const ctx = out.getContext('2d');
  ctx.drawImage(shot.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
  ctx.drawImage(gl, 0, 0, outW, outH);
  if (typeof out.toDataURL === 'function') return out.toDataURL('image/jpeg', quality);
  const blob = await out.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
