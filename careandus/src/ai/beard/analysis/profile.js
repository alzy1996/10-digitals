// FaceProfile (PRD 5.8): the on-device analysis of the guided shots. No image data
// is kept in the profile; skin.lab, beard.colorLab and faceShape.measures never
// leave the device (toCoarseProfile is what may be saved, with consent).
//
// Budget: under 3 s for four shots on a phone. Pixel work runs on a face crop
// downscaled to about 720 px, the segmenter sees a 384 px copy (its network works
// at 256 x 256) and the mask is brought back to 720 px with a guided filter. The
// browser gets a frame between steps (paintTurn) so the progress screen shows each
// step name before the step runs.

import { ZONE_IDS } from '../mesh/zones.js';
import { CLASSES } from '../models/classes.js';
import { modelStatus } from '../models/status.js';
import { segmentImage, verifySegmenter, segmenterReliable, segmenterInfo, refineMask } from '../models/segmenter.js';
import { estimateAgeBand } from '../models/age.js';
import { grayWorldGains } from '../capture/whiteCard.js';
import { poseOf } from '../capture/poseGate.js';
import { faceBox } from '../capture/quality.js';
import { mmPerPx as scaleFromIris } from './scale.js';
import { analyzeFaceShape, faceAxes } from './faceShape.js';
import { sampleSkin, skinFromSamples } from './skinTone.js';
import {
  zoneDensities,
  silhouetteLengths,
  lengthFromDensity,
  growabilityOf,
  DENSITY,
} from './beardDensity.js';
import { beardColor } from './beardColor.js';
import { labAt, cropToImageData, makeCanvas, context2d, forEachPixelInPolygon, yieldToEventLoop } from './pixels.js';
import { ZONE_CONFIRM_DENSITY } from './zoneConfirm.js';
import { muscatIso } from '../../../lib/time.js';

const colorFiles = import.meta.glob('../../data/colors.json', { eager: true, import: 'default' });
const CATALOG_COLORS = Object.values(colorFiles)[0] || [];

export const PROFILE_VERSION = 1;
export const WORK_SIZE = 720;
export const SEG_SIZE = 384;

/** Analysis step keys, in order; i18n keys are 'ai.step.<key>'. */
export const STEP_KEYS = Object.freeze(['prepare', 'scale', 'segment', 'faceShape', 'skin', 'beard', 'color', 'age', 'done']);

/** Share of beard-zone pixels that must read as hair before they set the beard colour. */
export const BEARD_COLOR_MIN_SHARE = 0.12;

/** One-tap zone confirmations (PRD 5.5) as densities (shared with recommend/score.js). */
export { ZONE_CONFIRM_DENSITY };

/** A side shot turned less than this (degrees of yaw) does not show a profile silhouette. */
export const SIDE_MIN_YAW = 20;

let lastDebug = null;

/**
 * Waits until the browser has had a chance to paint (the next animation frame, then
 * a task), so the step name the screen just set is on screen before the next heavy
 * step blocks the main thread. scheduler.yield() alone runs ahead of React's render
 * task and the label never changed. The timer covers hidden tabs (no frames there).
 */
export function paintTurn(fallbackMs = 50) {
  if (typeof requestAnimationFrame !== 'function') return yieldToEventLoop();
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setTimeout(resolve, 0);
    };
    requestAnimationFrame(go);
    setTimeout(go, fallbackMs);
  });
}

/** Geometry and timings of the last analysis, for diagnostics (no pixels). */
export function analysisDebug() {
  return lastDebug;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const round = (v, d = 0) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};

/**
 * Face crop of a shot, downscaled so its longest side is at most WORK_SIZE.
 * Returns { img, canvas, landmarks (normalized to the crop), P (crop px),
 * s (crop px per shot px), crop: { x, y, w, h } in shot px }.
 */
export function prepareShot(shot, { maxSide = WORK_SIZE, extraBottom = 0.5 } = {}) {
  const W = shot.width || shot.canvas.width;
  const H = shot.height || shot.canvas.height;
  const box = faceBox(shot.landmarks, W, H, 0);
  const x0 = Math.max(0, Math.floor(box.x - 0.35 * box.w));
  const y0 = Math.max(0, Math.floor(box.y - 0.6 * box.h));
  const x1 = Math.min(W, Math.ceil(box.x + box.w * 1.35));
  const y1 = Math.min(H, Math.ceil(box.y + box.h * (1 + extraBottom)));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const s = Math.min(1, maxSide / Math.max(cw, ch));
  const dw = Math.max(1, Math.round(cw * s));
  const dh = Math.max(1, Math.round(ch * s));
  const { canvas, img } = cropToImageData(shot.canvas, x0, y0, cw, ch, dw, dh);
  const sx = dw / cw;
  const sy = dh / ch;
  const landmarks = shot.landmarks.map((l) => ({ x: ((l.x * W - x0) * sx) / dw, y: ((l.y * H - y0) * sy) / dh, z: (l.z * W * sx) / dw }));
  const P = landmarks.map((l) => [l.x * dw, l.y * dh]);
  return { img, canvas, landmarks, P, s: sx, crop: { x: x0, y: y0, w: cw, h: ch } };
}

/** Segments a prepared crop at SEG_SIZE and refines the mask back to the crop size. */
async function segmentPrepared(prep) {
  const { width: w, height: h } = prep.img;
  const s = Math.min(1, SEG_SIZE / Math.max(w, h));
  let source = prep.canvas;
  if (s < 1) {
    source = makeCanvas(w * s, h * s);
    context2d(source).drawImage(prep.canvas, 0, 0, source.width, source.height);
  }
  const seg = await segmentImage(source);
  if (!seg) return null;
  return refineMask(seg, prep.img);
}

async function maskFor(prep) {
  if (modelStatus().segmenter !== 'ready' || !segmenterReliable()) return null;
  try {
    return await segmentPrepared(prep);
  } catch (err) {
    console.warn('Segmentation failed; using landmarks only', err);
    return null;
  }
}

/** Scalp-hair Lab samples in a band above the hairline (beard colour fallback). */
function scalpSamples(prep, mask, hairline, gains) {
  if (!mask || !hairline) return [];
  const { up, side, L } = faceAxes(prep.P);
  const half = 0.3 * L;
  const a = hairline;
  const b = [a[0] + up[0] * 0.2 * L, a[1] + up[1] * 0.2 * L];
  const band = [
    [a[0] - side[0] * half, a[1] - side[1] * half],
    [a[0] + side[0] * half, a[1] + side[1] * half],
    [b[0] + side[0] * half, b[1] + side[1] * half],
    [b[0] - side[0] * half, b[1] - side[1] * half],
  ];
  const out = [];
  let k = 0;
  forEachPixelInPolygon(band, prep.img.width, prep.img.height, (p) => {
    if (mask.categories[p] !== CLASSES.HAIR) return;
    if ((k++ & 1) !== 0) return;
    const lab = labAt(prep.img.data, p, gains);
    // Non-grey hair only (PRD 5.6), as for the beard samples.
    if (lab[0] > DENSITY.greyL && Math.hypot(lab[1], lab[2]) < DENSITY.greyChromaLab) return;
    out.push(lab);
  });
  return out;
}

/** Square face crop (224 px) of a shot for the age model. */
function ageCrop(shot) {
  const W = shot.width || shot.canvas.width;
  const H = shot.height || shot.canvas.height;
  const box = faceBox(shot.landmarks, W, H, 0.25);
  const side = Math.max(box.w, box.h);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const canvas = makeCanvas(224, 224);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 224, 224);
  ctx.drawImage(shot.canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, 224, 224);
  return canvas;
}

/**
 * Pose of a side shot that can be read for the jaw silhouette, or null. A "side"
 * photo taken facing the camera (hand shutter, wrong pose) shows no silhouette, and
 * its reading would override the front estimate with a wrong length (it carries
 * more weight than the front), so it is left out.
 */
export function sideShotPose(shot) {
  if (!shot || !shot.canvas || !shot.landmarks) return null;
  const w = shot.width || shot.canvas.width;
  const h = shot.height || shot.canvas.height;
  const pose = shot.pose || poseOf({ matrix: shot.matrix, landmarks: shot.landmarks, width: w, height: h });
  if (!pose || !Number.isFinite(pose.yaw) || Math.abs(pose.yaw) < SIDE_MIN_YAW) return null;
  return pose;
}

function emptyZones() {
  return Object.fromEntries(ZONE_IDS.map((z) => [z, { density: 0, lengthMm: 0, confidence: 0 }]));
}

/**
 * Builds the FaceProfile from the captured shots.
 * shots: { front, left, right, chinUp } (front required; Shot objects).
 * opts.whiteCard: { rect, gains } | null; opts.onStep(key, { index, total, i18nKey }).
 */
export async function analyzeShots(shots, { whiteCard = null, onStep } = {}) {
  const front = shots && shots.front;
  if (!front || !front.canvas || !front.landmarks || front.landmarks.length < 468) {
    throw new Error('analyzeShots needs a front shot with landmarks');
  }
  const timings = {};
  let t = now();
  const tStart = t;
  let index = 0;
  const step = async (key) => {
    if (typeof onStep === 'function') {
      try {
        onStep(key, { index, total: STEP_KEYS.length, i18nKey: `ai.step.${key}` });
      } catch (err) {
        console.error(err);
      }
    }
    index++;
    await paintTurn();
  };
  const lap = (key) => {
    const n = now();
    timings[key] = Math.round(n - t);
    t = n;
  };

  await step('prepare');
  const F = prepareShot(front);
  const fw = front.width || front.canvas.width;
  const fh = front.height || front.canvas.height;
  const frontPose = front.pose || poseOf({ matrix: front.matrix, landmarks: front.landmarks, width: fw, height: fh });
  lap('prepare');

  await step('scale');
  const scale = scaleFromIris(front.landmarks, fw, fh, frontPose ? frontPose.yaw : 0);
  const mmWork = scale.mmPerPx / F.s;
  lap('scale');

  await step('segment');
  if (modelStatus().segmenter === 'ready' && segmenterInfo().verification === 'pending') {
    await verifySegmenter(F.canvas, F.landmarks);
  }
  const maskF = await maskFor(F);
  const gains = whiteCard && Array.isArray(whiteCard.gains) ? whiteCard.gains : grayWorldGains(F.img, maskF ? maskF.categories : null);
  lap('segment');

  await step('faceShape');
  const shape = analyzeFaceShape(F.P, mmWork, maskF);
  lap('faceShape');

  await step('skin');
  let samples = sampleSkin(F.img, F.P, maskF ? maskF.categories : null, gains);
  if (samples.all.length < 50 && maskF) samples = sampleSkin(F.img, F.P, null, gains);
  const skinFull = skinFromSamples(samples, { whiteCard: !!whiteCard });
  const skin = skinFull
    ? { ita: skinFull.ita, mst: skinFull.mst, undertone: skinFull.undertone, confidence: skinFull.confidence, lab: skinFull.lab }
    : { ita: null, mst: null, undertone: null, confidence: 0, lab: null };
  lap('skin');

  await step('beard');
  const chinShot = shots.chinUp && shots.chinUp.landmarks ? shots.chinUp : null;
  const extendDownPx = Math.round((DENSITY.maxLengthMm / mmWork) * 0.6);
  const frontZones = chinShot ? ZONE_IDS.filter((z) => z !== 'N') : ZONE_IDS;
  const dens = zoneDensities({
    img: F.img,
    landmarks: F.landmarks,
    P: F.P,
    categories: maskF ? maskF.categories : null,
    gains,
    zoneIds: frontZones,
    extendDownPx: Number.isFinite(extendDownPx) ? extendDownPx : 0,
  });
  const zoneStats = { ...dens.zones };
  let greyTotal = dens.greyTotal;
  let hairTotal = dens.hairTotal;

  const lengths = {};
  const keepBest = (found, bonus) => {
    for (const [z, v] of Object.entries(found)) {
      const conf = Math.min(1, v.confidence * bonus);
      if (!lengths[z] || conf > lengths[z].confidence) lengths[z] = { mm: v.mm, confidence: conf };
    }
  };
  if (Number.isFinite(mmWork)) {
    keepBest(silhouetteLengths({ density: dens, P: F.P, categories: maskF ? maskF.categories : null, width: F.img.width, mmPerPx: mmWork, which: ['J_L', 'J_R', 'C'] }), 0.7);
  }
  for (const sideId of ['left', 'right']) {
    const shot = shots[sideId];
    const pose = sideShotPose(shot);
    if (!pose) continue;
    const prep = prepareShot(shot);
    const sw = shot.width || shot.canvas.width;
    const sh = shot.height || shot.canvas.height;
    const sc = scaleFromIris(shot.landmarks, sw, sh, pose ? pose.yaw : 0);
    const mm = sc.mmPerPx / prep.s;
    if (!Number.isFinite(mm)) continue;
    const mask = await maskFor(prep);
    const sideDens = zoneDensities({
      img: prep.img,
      landmarks: prep.landmarks,
      P: prep.P,
      categories: mask ? mask.categories : null,
      gains,
      zoneIds: [],
      extendDownPx: Math.round((DENSITY.maxLengthMm / mm) * 0.6),
    });
    // Turned to his left (yaw > 0) shows his right jaw; turned right shows the left jaw.
    const near = pose && pose.yaw > 0 ? 'J_R' : 'J_L';
    keepBest(silhouetteLengths({ density: sideDens, P: prep.P, categories: mask ? mask.categories : null, width: prep.img.width, mmPerPx: mm, which: [near, 'C'] }), 1);
    await yieldToEventLoop();
  }
  if (chinShot) {
    // Segmented too, so a collar (often a white dishdasha) is not read as grey hair.
    const prep = prepareShot(chinShot);
    const mask = await maskFor(prep);
    const nDens = zoneDensities({ img: prep.img, landmarks: prep.landmarks, P: prep.P, categories: mask ? mask.categories : null, gains, zoneIds: ['N'] });
    zoneStats.N = nDens.zones.N;
    greyTotal += nDens.greyTotal;
    hairTotal += nDens.hairTotal;
  }

  // A silhouette only resolves length beyond a couple of pixels: readings of 3 mm or
  // less (stubble) defer to the density estimate.
  const zones = emptyZones();
  const measured = (z) => (lengths[z] && lengths[z].mm > 3 ? lengths[z].mm : null);
  const jawMm = (side) => measured(`J_${side}`) || measured(`J_${side === 'L' ? 'R' : 'L'}`);
  for (const z of ZONE_IDS) {
    const st = zoneStats[z] || { density: 0, confidence: 0 };
    let mm;
    if (st.density < 10) mm = 0;
    else if (measured(z)) mm = measured(z);
    else if ((z === 'K_L' || z === 'K_R') && jawMm(z.slice(-1))) mm = jawMm(z.slice(-1)) * 0.9;
    else if ((z === 'B_L' || z === 'B_R') && jawMm(z.slice(-1))) mm = Math.min(20, jawMm(z.slice(-1))) * 0.7;
    else if (z === 'S' && measured('C')) mm = measured('C') * 0.8;
    else if (z === 'N' && (measured('C') || jawMm('L'))) mm = (measured('C') || jawMm('L')) * 0.8;
    else mm = lengthFromDensity(st.density);
    zones[z] = { density: st.density, lengthMm: round(Math.max(0, mm), 1), confidence: st.confidence };
  }
  const growability = growabilityOf(zones);
  lap('beard');

  await step('color');
  const scalp = scalpSamples(F, maskF, shape.hairlinePx && !shape.measures.hairlineEstimated ? shape.hairlinePx : null, gains);
  // Beard pixels only speak for the beard colour when there is a beard: on a
  // clean-shaven face the few "hair" pixels are sideburn edges and shadows, and
  // the scalp hair is the better evidence.
  const zonePixels = Object.values(dens.zones).reduce((sum, z) => sum + (z.n || 0), 0);
  const beardShare = zonePixels ? dens.hairTotal / zonePixels : 0;
  const color = beardColor(beardShare >= BEARD_COLOR_MIN_SHARE ? dens.colorSamples : [], scalp, CATALOG_COLORS);
  const greyRatio = hairTotal >= 30 ? Math.round((100 * greyTotal) / hairTotal) : 0;
  lap('color');

  await step('age');
  let ageBand = { band: null, source: 'none', confidence: 0 };
  if (modelStatus().age === 'ready') ageBand = await estimateAgeBand(ageCrop(front));
  lap('age');

  await step('done');
  timings.total = Math.round(now() - tStart);

  const toShot = (p) => [F.crop.x + p[0] / F.s, F.crop.y + p[1] / F.s];
  lastDebug = {
    timings,
    segmenter: segmenterInfo(),
    mask: !!maskF,
    crop: F.crop,
    workScale: F.s,
    hairline: shape.hairlinePx ? toShot(shape.hairlinePx) : null,
    foreheadLine: shape.foreheadLinePx ? toShot(shape.foreheadLinePx) : null,
    hairlineSource: shape.measures.hairlineSource,
    secondShape: shape.second,
    itaBand: skinFull ? skinFull.itaBand : null,
    colorSource: color.source,
    lengths,
    referenceL: { left: dens.ref.left && dens.ref.left.L, right: dens.ref.right && dens.ref.right.L, fore: dens.ref.fore && dens.ref.fore.L },
  };

  return {
    version: PROFILE_VERSION,
    capturedAt: muscatIso(front.capturedAt || new Date()),
    scale: { mmPerPx: Number.isFinite(scale.mmPerPx) ? round(scale.mmPerPx, 4) : null, source: scale.source, confidence: scale.confidence },
    faceShape: { top: shape.top, scores: shape.scores, jawAngleDeg: shape.jawAngleDeg, measures: shape.measures },
    skin,
    ageBand,
    beard: { zones, growability, greyRatio, colorId: color.colorId, colorLab: color.colorLab },
    calibration: { whiteCard: !!whiteCard, gains: gains.map((g) => round(g, 3)) },
    overrides: { faceShape: null, undertone: null, ageBand: null },
  };
}

function clone(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

/**
 * Profile with the barber's / customer's corrections applied (pure; the input is
 * not changed). overrides: { faceShape, undertone, ageBand, mst, zones: { [zone]:
 * 'dense'|'medium'|'patchy'|'none' } }. A confirmed zone gets the matching density
 * and confidence 1 ('none' also sets its length to 0); grow-ability is recomputed.
 */
export function applyOverrides(profile, overrides) {
  if (!profile) return profile;
  const out = clone(profile);
  const o = overrides || {};
  out.overrides = { faceShape: null, undertone: null, ageBand: null, ...(out.overrides || {}) };
  if (o.faceShape) {
    out.faceShape.top = o.faceShape;
    out.overrides.faceShape = o.faceShape;
  }
  if (o.undertone) {
    out.skin.undertone = o.undertone;
    out.overrides.undertone = o.undertone;
  }
  if (o.ageBand) {
    out.ageBand = { band: o.ageBand, source: out.ageBand ? out.ageBand.source : 'none', confidence: 1 };
    out.overrides.ageBand = o.ageBand;
  }
  if (o.mst !== undefined && o.mst !== null && Number.isFinite(Number(o.mst))) {
    out.skin.mst = Math.min(10, Math.max(1, Math.round(Number(o.mst))));
  }
  if (o.zones && out.beard && out.beard.zones) {
    let changed = false;
    for (const [zone, label] of Object.entries(o.zones)) {
      const density = ZONE_CONFIRM_DENSITY[label];
      const z = out.beard.zones[zone];
      if (density === undefined || !z) continue;
      z.density = density;
      z.confidence = 1;
      if (label === 'none') z.lengthMm = 0;
      changed = true;
    }
    if (changed) out.beard.growability = growabilityOf(out.beard.zones);
  }
  return out;
}

/**
 * The only part of a profile that may be saved to Firestore (with consent):
 * labels, no raw ratios, Lab values or calibration.
 */
export function toCoarseProfile(profile) {
  if (!profile) return { faceShape: null, mst: null, undertone: null, ageBand: null, growability: null };
  return {
    faceShape: profile.faceShape ? profile.faceShape.top || null : null,
    mst: profile.skin && Number.isFinite(profile.skin.mst) ? profile.skin.mst : null,
    undertone: profile.skin ? profile.skin.undertone || null : null,
    ageBand: profile.ageBand ? profile.ageBand.band || null : null,
    growability: profile.beard && Number.isFinite(profile.beard.growability) ? profile.beard.growability : null,
  };
}
