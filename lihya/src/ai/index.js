// AI facade. Screens and services import AI features from here only; they never
// reach into models, mesh or render internals. Everything runs on the device,
// except renderFinalLook (optional, consent-gated, capped, OFF by default).

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
