// AI facade. Screens and services import AI features from here only; they never
// reach into models, mesh or render internals. Everything runs on the device,
// except renderFinalLook (optional, consent-gated, capped, OFF by default).

import {
  JAW_CONTOUR,
  MOUTH_CORNERS,
  CHIN_BOTTOM,
  FOREHEAD_TOP,
  CHEEK_LINE_NATURAL_L,
  CHEEK_LINE_NATURAL_R,
  CHEEK_LINE_HIGH_L,
  CHEEK_LINE_HIGH_R,
  CHEEK_LINE_LOW_L,
  CHEEK_LINE_LOW_R,
  MUSTACHE_EDGE_L,
  MUSTACHE_EDGE_R,
} from './mesh/zones.js';

// Models
export { loadModels, modelStatus } from './models/landmarker.js';
export { subscribeModelStatus } from './models/status.js';
export { canLoadAgeModel, loadAgeModel } from './models/age.js';

// Guided capture
export { createCaptureSession, shotFromImage, hintArrow } from './capture/session.js';
export { whiteCardFromTap } from './capture/whiteCard.js';

// Face profile
export { analyzeShots, applyOverrides, toCoarseProfile, STEP_KEYS, ZONE_CONFIRM_DENSITY } from './analysis/profile.js';
export { itaBand } from './analysis/skinTone.js';
export { CONFIRM_BELOW } from './analysis/beardDensity.js';

// Recommendation engine
export { recommend, isFreshlyShaved, hiddenByWorkRule, workRuleAllows } from './recommend/score.js';
export { jawlineDelta, jawlineDetail, jawlineLabels } from './recommend/jawline.js';
export { pairingHints, trimReason, workRuleNotice } from './recommend/reasons.js';

// Rendering
export { createArRenderer } from './render/arRenderer.js';
export { renderStudio, renderThumbnail } from './render/photoStudio.js';
export { TIMELINE_STOPS, growthAt } from './render/timeline.js';
export { renderFinalLook, finalLookAvailable } from './render/provider.js';
export { needsOutline } from './render/inpaint.js';
export { clearRenderCaches } from './render/photoStudio.js';
export { MST_SWATCHES } from './analysis/skinTone.js';

// Face geometry for the Cut Card (src/lib/cutcard.js measures the cheek line on the
// front shot exactly as the renderer draws it). Plain landmark index lists, no model code.
export const CUT_CARD_LANDMARKS = Object.freeze({
  JAW_CONTOUR,
  MOUTH_CORNERS,
  CHIN_BOTTOM,
  FOREHEAD_TOP,
  CHEEK_LINE_NATURAL_L,
  CHEEK_LINE_NATURAL_R,
  CHEEK_LINE_HIGH_L,
  CHEEK_LINE_HIGH_R,
  CHEEK_LINE_LOW_L,
  CHEEK_LINE_LOW_R,
  MUSTACHE_EDGE_L,
  MUSTACHE_EDGE_R,
});

// Days between shop visits per visit-frequency answer (the recommendation engine's
// life fit and the Cut Card's next-visit suggestion use the same numbers).
export { VISIT_DAYS } from './recommend/score.js';

// Owner dashboard: the AI Worker's own daily count (UTC day, resets 04:00 Muscat).
export { fetchAiQuota } from './render/cloudflareFlux.js';
