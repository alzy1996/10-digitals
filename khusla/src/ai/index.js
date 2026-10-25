// KHUSLA AI facade. Screens import ONLY from here; model code stays behind this file.
import { getLandmarker } from './models/landmarker.js';
import { getSegmenter } from './models/segmenter.js';
import { getHairSegmenter } from './models/hairSegmenter.js';
import { recommendLooks } from './recommend/looks.js';
import { planLift, session1Lab, safePath, pigmentLab, developerFor } from './color/lift.js';

export { analyzePhoto as analyze, privateDisplay, decodeToCanvas, canvasToImg, imgToCanvas, withRenderAux } from './pipeline.js';
export { createCaptureLoop } from './capture/live.js';
export { SHOTS, TARGETS } from './capture/poseGate.js';
export { applyOverride, profileLabels } from './analysis/profile.js';
export { topTwo, SHAPES } from './analysis/faceShape.js';
export { hexToLab, labToHex, labToRgb, rgbToLab, deltaE2000, MST_HEX, nearestMst } from './analysis/color.js';
export { levelFromL, LEVEL_L } from './analysis/hairLevel.js';
export { cmToPx, pxToCm, roundLengthCm } from './analysis/scale.js';
export { createRenderer, webgl2Available } from './render/renderer.js';
export { buildAux, buildLiveAux } from './render/textures.js';
export { lookDrawParams, shadeLab } from './render/look.js';
export { techniqueUniforms, levelLabOf, TECH_IDS } from './render/techniques.js';
export { lightUniforms } from './render/lightSwitch.js';
export { finishUniforms } from './render/finishes.js';
export { silhouettePath, defaultLengthY, faceGeometry } from './render/silhouette.js';
export { drawFringe } from './render/fringe.js';
export { shaylaPath } from './render/hijabZone.js';
export { quickShorten } from './render/quickShorten.js';
export { dryLength, shrinkageFor, newLengthFromY, yFromNewLength, clampTapeY } from './render/lengthTape.js';
export { getProvider, cropForAi } from './render/provider.js';
export { rootBandCm, lowMaintenanceScore, lineSoftness, learnGrowthRate } from './color/regrowth.js';
export { hennaStageLab, hennaLightenedStages } from './color/henna.js';
export { gainsFromWhite, measureRegion, repeatability } from './color/swatchScan.js';
export { cardGains, sampleSquare } from './capture/whiteCard.js';
export { segmentHairVideo } from './models/hairSegmenter.js';
export { BAND_CM, cutTargetCm } from './recommend/cutScore.js';
export { techniqueZone } from './recommend/colorScore.js';
export { planLift, session1Lab, safePath, pigmentLab, developerFor };

/** Warm the three on-device models (downloads once, then the service worker serves them). */
export async function loadModels(onProgress = () => {}) {
  onProgress('face', 0);
  await getLandmarker('IMAGE');
  onProgress('face', 1);
  onProgress('hair', 0);
  await Promise.all([getSegmenter('IMAGE'), getHairSegmenter('IMAGE')]);
  onProgress('hair', 1);
  return true;
}

/** Rule-based recommendation: top 6 looks, cuts, colors and the "Not today" drawer (< 100 ms, offline). */
export function recommend(catalog, profile, goals, ctx) {
  return recommendLooks(catalog, profile, goals, ctx);
}

/** Lift Reality Check for one target. */
export function liftCheck(args) {
  return planLift(args);
}
