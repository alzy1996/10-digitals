// Nails AI facade (from Nail Mirror). Screens import nail features from here only.
// Everything runs on the device: hand tracking, nail geometry, skin analysis, recolour.

// Live try-on (camera or photo) and the WebGL nail renderer
export { TryOnEngine, downscaleDataUrl } from './TryOnEngine.js';
export { NailRenderer, LIGHT_PRESETS, webgl2Supported, resolveLook } from './render/NailRenderer.js';

// Hand tracking and nail geometry
export { loadHandTracker, trackerInfo, detectVideo, detectImage, HAND_MODEL_URL } from './handTracker.js';
export { estimateNails, refineNail, NailTracker, handKeys, fingerSpacing, FINGER_CHAINS, FINGER_KEYS } from './nailGeometry.js';
export { segmenterEnabled, loadNailSegmenter, segmentNails, refineWithMask } from './segmentation/nailSegmenter.js';
export { loadSam, samBackend, samPerfectFit, samEnabled } from './segmentation/samFit.js';

// Skin tone and recommendations (undertone is shared with Hair via the client profile)
export { analyzeSkin, monkToDepth, monkLab, findAutoWhite, sampleWhite } from './skinAnalysis.js';
export { recommendShades, recommendFinishes, analyzeHandShape } from './recommend.js';

// The design model (what consultations, Look Codes and requests store)
export { DEFAULT_DESIGN, polishToPaint, withBase, withFinger, withFinish, paintsOf, designSummary, serializeDesign } from './design.js';

// Colour helpers the nail screens need (swatches, sold-out substitutes, polish families)
export { hexToLab, deltaE2000, mixHex, shadeHex, isHex, normalizeHex } from './lib/color.js';
