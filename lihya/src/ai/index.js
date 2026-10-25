// AI facade. Screens and services import AI features from here only; they never
// reach into models, mesh or render internals. Everything runs on the device,
// except renderFinalLook (optional, consent-gated, capped, OFF by default).

export { loadModels, modelStatus } from './models/landmarker.js';
export { canLoadAgeModel, loadAgeModel } from './models/age.js';
export { createCaptureSession, shotFromImage } from './capture/session.js';
export { whiteCardFromTap } from './capture/whiteCard.js';
export { analyzeShots, applyOverrides, toCoarseProfile } from './analysis/profile.js';
export { recommend } from './recommend/score.js';
export { jawlineDelta } from './recommend/jawline.js';
export { createArRenderer } from './render/arRenderer.js';
export { renderStudio, renderThumbnail } from './render/photoStudio.js';
export { TIMELINE_STOPS, growthAt } from './render/timeline.js';
export { renderFinalLook, finalLookAvailable } from './render/provider.js';
export { needsOutline } from './render/inpaint.js';
