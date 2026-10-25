// Builds the HairProfile (PRD 5.9) from one calibrated front photo and the model outputs.
// Pure function of its inputs, so it is unit-testable without MediaPipe.
import { imageToLab, gray, guidedFilter, resample, resampleLabels, downscale, lmPx } from './imageOps.js';
import { computeScale } from './scale.js';
import { faceShape } from './faceShape.js';
import { sampleSkin, skinFromSamples, cheekBalance, contrastBand } from './skinTone.js';
import { eyeColor } from './eyes.js';
import { rootDistanceField } from './rootField.js';
import { hairZones, regrowthCm } from './hairLevel.js';
import { greyPercent } from './grey.js';
import { structureTensor, silhouetteWaviness, classifyTexture, meanOver, density } from './texture.js';
import { measureLength } from './length.js';

export const PROFILE_VERSION = 1;

/** Combine the multiclass hair confidence and the hair segmenter, then refine with a guided filter. */
export function refineHairAlpha({ img, seg, hair }) {
  const { width: w, height: h } = img;
  let coarse = new Float32Array(w * h);
  if (seg?.hairConf) coarse = resample(seg.hairConf, seg.width, seg.height, w, h);
  if (hair?.conf) {
    const h2 = resample(hair.conf, hair.width, hair.height, w, h);
    for (let i = 0; i < coarse.length; i += 1) coarse[i] = Math.max(coarse[i] * 0.6 + h2[i] * 0.4, Math.min(coarse[i], h2[i]) * 1.2);
  }
  const g = gray(img);
  const r = Math.max(4, Math.round(Math.min(w, h) * 0.008));
  return guidedFilter(g, coarse, w, h, r, 2e-3);
}

/** Class self-test (mediapipe #6142): the nose tip must be face-skin, the chin area not background. */
export function classSelfTest(labels, w, h, pts) {
  const at = (p) => labels[Math.max(0, Math.min(h - 1, Math.round(p[1]))) * w + Math.max(0, Math.min(w - 1, Math.round(p[0])))];
  const nose = at(pts[1]);
  const cheekL = at(pts[50]);
  const cheekR = at(pts[280]);
  const skinVotes = [nose, cheekL, cheekR].filter((c) => c === 3).length;
  return skinVotes >= 2;
}

/**
 * @param {object} p
 * @param {{width:number,height:number,data:Uint8ClampedArray}} p.img calibrated RGBA
 * @param {Array<{x:number,y:number,z:number}>} p.landmarks normalized
 * @param {{yaw:number,pitch:number,roll:number}} p.pose
 * @param {{width:number,height:number,labels:Uint8Array,hairConf:Float32Array}} p.seg
 * @param {{width:number,height:number,conf:Float32Array}|null} p.hair
 * @param {{gains:number[], source:string}} p.calibration
 * @param {object} [p.age]
 * @param {object} [p.history]
 * @param {Record<number, number[]>} [p.scannedLevels]
 */
export function buildProfile({ img, landmarks, pose = { yaw: 0 }, seg, hair, calibration, age, history, scannedLevels, capturedAt = new Date() }) {
  const { width: w, height: h } = img;
  const n = w * h;
  const pts = lmPx(landmarks, w, h);
  const labels = resampleLabels(seg.labels, seg.width, seg.height, w, h);
  const alpha = refineHairAlpha({ img, seg, hair });
  const lab = imageToLab(img);

  const scale = computeScale(pts, pose.yaw);
  const shape = faceShape(pts, labels, w, h);
  const skinSamples = sampleSkin(lab, labels, w, h, pts);
  const skin = skinFromSamples(skinSamples.all, { whiteCard: calibration?.source === 'card' }) || {
    lab: [60, 12, 18], ita: 20, mst: 5, undertone: 'neutral', confidence: 0.2,
  };
  const eyes = eyeColor(lab, w, h, pts);

  // root field on a half-resolution grid for speed
  const k = w * h > 900000 ? 2 : 1;
  const aSmall = k > 1 ? downscale(alpha, w, h, k) : { data: alpha, width: w, height: h };
  const lSmall = k > 1 ? resampleLabels(labels, w, h, aSmall.width, aSmall.height) : labels;
  const eyeY = Math.min(pts[33][1], pts[263][1]) / k;
  const field = rootDistanceField(aSmall.data, lSmall, aSmall.width, aSmall.height, { eyeY, midX: pts[10][0] / k });
  const r = k > 1 ? resample(field.r, aSmall.width, aSmall.height, w, h) : field.r;
  const distSmall = field.dist;
  const distPx = k > 1 ? resample(distSmall.map((d) => (d < 0 ? -1 : d * k)), aSmall.width, aSmall.height, w, h) : distSmall;
  const maxDistPx = field.maxDist * k;

  const zones = hairZones(lab, alpha, r, n, scannedLevels);
  const regrowth = regrowthCm(zones.profileL, maxDistPx, scale.mmPerPx);
  const grey = greyPercent(lab, alpha, distPx, n, { naturalL: Number.isFinite(zones.rootLowL) ? zones.rootLowL : zones.rootL, mmPerPx: scale.mmPerPx, width: w, height: h });

  // texture on a quarter-res L map
  const lq = downscale(lab.L, w, h, 2);
  const aq = downscale(alpha, w, h, 2);
  const st0 = structureTensor(lq.data, lq.width, lq.height, 4);
  const coh = meanOver(st0.coherence, aq.data, lq.data.length);
  // strand flow for the renderer: a wider tensor (smoother orientation) than the texture estimate
  const st = structureTensor(lq.data, lq.width, lq.height, Math.max(6, Math.round(lq.width / 60)));
  // strand-flow prior: strands radiate from the crown and hang down below the jaw. Dark hair has weak
  // gradients, so low-coherence pixels lean on the prior (orientation blend on doubled angles).
  const faceLenPx = Math.max(1, pts[152][1] - pts[10][1]);
  const crown = [pts[10][0] / 2, (pts[10][1] - faceLenPx * 0.35) / 2];
  const jawQ = ((pts[172][1] + pts[397][1]) / 2) / 2;
  for (let y = 0; y < lq.height; y += 1) {
    for (let x = 0; x < lq.width; x += 1) {
      const i = y * lq.width + x;
      if (aq.data[i] < 0.3) continue;
      let prior = Math.atan2(y - crown[1], x - crown[0]);
      const down = Math.max(0, Math.min(1, (y - jawQ) / (faceLenPx * 0.25)));
      prior = Math.atan2(Math.sin(prior) * (1 - down) + down, Math.cos(prior) * (1 - down));
      const c = st.coherence[i];
      const wData = 0.85 * Math.max(0, Math.min(1, (c - 0.2) / 0.45));
      const cx = wData * Math.cos(2 * st.angle[i]) + (1 - wData) * Math.cos(2 * prior);
      const sy = wData * Math.sin(2 * st.angle[i]) + (1 - wData) * Math.sin(2 * prior);
      st.angle[i] = 0.5 * Math.atan2(sy, cx);
    }
  }
  const faceW = Math.hypot(pts[234][0] - pts[454][0], pts[234][1] - pts[454][1]);
  const wav = silhouetteWaviness(alpha, w, h, { fromY: pts[152][1], toY: h, faceW });
  const tex = classifyTexture(coh, wav);
  let topY = 0;
  for (let y = 0; y < h; y += 1) {
    if (alpha[y * w + Math.round(pts[10][0])] > 0.5) {
      topY = y;
      break;
    }
  }
  const dens = density(lab, alpha, labels, w, h, { midX: pts[10][0], topY, faceW, skinLab: skin.lab, mmPerPx: scale.mmPerPx });
  const faceLen = Math.max(1, shape.measures.faceLength);
  const len = measureLength({ alpha, dist: distPx, labels, w, h, pts, mmPerPx: scale.mmPerPx, faceLen });

  const profile = {
    version: PROFILE_VERSION,
    capturedAt: new Date(capturedAt).toISOString(),
    scale: { mmPerPx: scale.mmPerPx ? Math.round(scale.mmPerPx * 1000) / 1000 : null, source: scale.source, confidence: scale.confidence },
    faceShape: { top: shape.top, scores: shape.scores },
    skin: { ita: skin.ita, mst: skin.mst, undertone: skin.undertone, confidence: skin.confidence, lab: skin.lab },
    eyes: { color: eyes.color, confidence: eyes.confidence },
    contrast: contrastBand(zones.rootL, skin.lab[0]),
    ageBand: age || { band: null, source: 'chips', confidence: 0 },
    hair: {
      rootLevel: zones.rootLevel,
      midLevel: zones.midLevel,
      endsLevel: zones.endsLevel,
      flags: zones.flags,
      regrowthCm: regrowth,
      greyPct: grey.pct,
      texture: tex.texture,
      textureConfidence: tex.confidence,
      density: dens.density,
      lengthBand: len.lengthBand,
      lengthCm: len.lengthCm,
      warmth: zones.warmth,
    },
    history: history || { henna: 'none', recentColor: 'none', bleach: false, chemical: false },
    calibration: { whiteCard: calibration?.source === 'card', gains: (calibration?.gains || [1, 1, 1]).map((g) => Math.round(g * 100) / 100) },
    overrides: {},
  };

  // Everything the renderer needs stays on the device, never in the profile.
  const renderData = {
    width: w,
    height: h,
    alpha,
    r,
    distPx,
    maxDistPx,
    labels,
    lab,
    pts,
    pose,
    flow: st.angle,
    flowW: lq.width,
    flowH: lq.height,
    zones,
    topY,
    tipY: len.tipY,
    shoulderY: len.shoulderY,
    hairlineY: shape.measures.hairlineY,
    cheekDiff: cheekBalance(skinSamples),
    skinLab: skin.lab,
  };
  return { profile, renderData };
}

/** Apply the stylist's one-tap overrides to a profile (overrides are recorded). */
export function applyOverride(profile, path, value) {
  const next = structuredClone(profile);
  const keys = path.split('.');
  let o = next;
  for (let i = 0; i < keys.length - 1; i += 1) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
  next.overrides = { ...next.overrides, [path]: value };
  return next;
}

/** The labels-only subset saved to Firestore (with consent). Raw ratios and calibration stay on the device. */
export function profileLabels(profile) {
  return {
    profile: {
      faceShape: profile.faceShape.top,
      mst: profile.skin.mst,
      undertone: profile.skin.undertone,
      eyes: profile.eyes.color,
      ageBand: profile.ageBand?.band || null,
    },
    hair: {
      rootLevel: profile.hair.rootLevel,
      endsLevel: profile.hair.endsLevel,
      greyPct: profile.hair.greyPct,
      texture: profile.hair.texture,
      density: profile.hair.density,
      lengthBand: profile.hair.lengthBand,
    },
  };
}
