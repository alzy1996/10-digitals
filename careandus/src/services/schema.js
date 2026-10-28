// Single source of truth for every Firestore document shape.
// firestore.rules mirrors these lists with keys().hasOnly([...]); keep both in sync.

export const SCHEMA_VERSION = 1;

// The three services of one salon. A salon turns on any of them; staff work in a subset.
export const SECTIONS = ['hair', 'nails', 'beard'];
export const ROLES = ['owner', 'manager', 'stylist'];
// Nail keys mirror src/data/nails/taxonomy.js (Nail Mirror's catalog).
export const NAIL_FINISHES = ['creme', 'gloss', 'matte', 'satin', 'sheer', 'milky', 'shimmer', 'pearl', 'metallic', 'chrome', 'holo', 'glitter', 'cateye', 'velvet', 'duochrome', 'neon'];
export const NAIL_SHAPES = ['natural', 'round', 'squoval', 'square', 'oval', 'almond', 'coffin', 'stiletto'];
export const NAIL_TYPES = ['gel', 'lacquer', 'breathable', 'biab', 'acrylic', 'dip', 'presson'];
export const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const BEARD_ZONES = ['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N'];
export const REQUEST_STATUS = ['new', 'contacted', 'booked', 'closed'];
export const FACE_SHAPES = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle'];
export const UNDERTONES = ['warm', 'cool', 'neutral', 'olive'];
export const EYE_COLORS = ['dark-brown', 'brown', 'hazel', 'green', 'blue', 'grey'];
export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];
export const TEXTURES = ['straight', 'wavy', 'curly', 'coily'];
export const DENSITIES = ['fine', 'medium', 'thick'];
export const LENGTH_BANDS = ['very-short', 'short', 'jaw', 'chin', 'collarbone', 'shoulder', 'long', 'very-long'];
export const HENNA = ['none', 'pure', 'compound', 'unsure'];
export const RECENT_COLOR = ['none', 'darker', 'lighter', 'unsure'];
export const PROCESSES = ['deposit-only', 'lift-color', 'high-lift', 'lightener', 'correction', 'blocked'];
export const TESTS = ['strand', 'metallic', 'patch'];
export const CONSULTATION_STATUS = ['draft', 'approved', 'done', 'cancelled'];
export const PRODUCT_CATEGORIES = ['service', 'color', 'treatment', 'retail', 'other'];
export const LIGHT_PRESETS = ['daylight', 'salon', 'evening', 'flash'];
export const FINISHES = ['glossy', 'satin', 'matte', 'pearl'];
export const CONSENT_TYPES = ['ai_render', 'profile_save'];
export const SWATCH_LIGHTS = ['daylight', 'salon'];
export const SOURCES = ['chair', 'look-code'];

// Allowed keys per document / nested map.
export const FIELDS = {
  salon: ['name', 'nameAr', 'languages', 'timezone', 'schemaVersion', 'sections', 'settings', 'whatsapp', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  salonSettings: ['privateMode', 'idleWipeMin', 'aiPreview', 'aiDailyCap', 'growthCmPerMonth', 'retentionDays', 'tryAtHome', 'guardChart', 'beardGrowthMmPerDay'],
  publicSalon: ['name', 'nameAr', 'tryAtHome', 'whatsapp', 'sections', 'updatedAt', 'updatedBy'],
  user: ['salonIds', 'lastSalonId', 'updatedAt'],
  staff: ['uid', 'name', 'email', 'role', 'active', 'sections', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  invite: ['email', 'role', 'sections', 'createdAt', 'createdBy'],
  swatchLine: ['name', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  swatch: ['code', 'level', 'tone', 'labMeasured', 'scannedAt', 'scannedBy', 'light', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  product: ['name', 'nameAr', 'category', 'section', 'priceOmr', 'active', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  client: ['displayName', 'phone', 'consent', 'profile', 'hair', 'history', 'shrinkagePct', 'growthCmPerMonth', 'lastVisitAt', 'visits', 'demo', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  clientConsent: ['profile', 'at', 'by'],
  clientProfile: ['faceShape', 'mst', 'undertone', 'eyes', 'ageBand'],
  clientHair: ['rootLevel', 'endsLevel', 'greyPct', 'texture', 'density', 'lengthBand'],
  clientHistory: ['henna', 'recentColor', 'bleach', 'chemical'],
  consultation: ['section', 'visitId', 'cutCard', 'clientId', 'stylistUid', 'params', 'agreement', 'approvals', 'status', 'decisionSeconds', 'aiPreviewUsed', 'rating', 'nextVisitWeeks', 'notTodayShown', 'source', 'dayKey', 'demo', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  consultationParams: ['cutId', 'fringeId', 'styleId', 'lengthCm', 'shadeId', 'shade2Id', 'swatchId', 'technique', 'techniqueParams', 'finish', 'lightPreset'],
  techniqueParams: ['start', 'density', 'softness', 'level'],
  agreement: ['currentLengthCm', 'lengthWetCm', 'lengthDryCm', 'shrinkagePct', 'targetLevel', 'targetTone', 'process', 'sessionsTotal', 'sessionNumber', 'todayLevel', 'tests', 'fillerLikely', 'priceItems', 'addOnCount', 'aftercareKeys'],
  approvals: ['customerAt', 'stylistAt', 'stylistUid'],
  lookCode: ['section', 'params', 'createdAt', 'expiresAt', 'createdBy', 'usedAt', 'usedBy'],
  consent: ['type', 'clientId', 'consultationId', 'granted', 'at', 'by'],
  dailyStats: ['consultations', 'approvals', 'totalDecisionSeconds', 'aiRenders', 'addOns', 'notToday', 'ratingsSum', 'ratingsCount', 'topLooks', 'topShades', 'bySection', 'updatedAt'],
  audit: ['action', 'path', 'by', 'at', 'changedFields'],
  // Nails (from Nail Mirror): the salon's own polishes, saved looks, the designed manicure. Never a photo.
  nailPolish: ['name', 'nameAr', 'brand', 'code', 'hex', 'hex2', 'finish', 'type', 'stock', 'priceOmr', 'active', 'hidden', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  nailLook: ['name', 'nameAr', 'design', 'hidden', 'signature', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  nailDesign: ['base', 'perFinger', 'shape', 'length', 'art', 'artHex', 'type'],
  nailPaint: ['polishId', 'hex', 'hex2', 'finish'],
  // Beard (from LIHYA): the designed beard and the Cut Card summary.
  beardParams: ['styleId', 'zones', 'lines', 'mustacheId', 'fadeStartMm', 'colorId', 'greyTarget', 'finish', 'shape', 'presetId'],
  beardLines: ['cheek', 'cheekOffset', 'neckline', 'necklineOffset', 'sideburn', 'edge', 'mustacheEdge'],
  beardShape: ['chin', 'jFront', 'mustacheFloating', 'fadeB', 'flare', 'lengthAdjustable'],
  cutCard: ['zonesMm', 'guards', 'cheekLineMm', 'necklineMm', 'notes', 'safetyFlags'],
  // A look a customer sends from home (any service). Never a photo.
  request: ['section', 'params', 'customerName', 'customerPhone', 'note', 'preferredDate', 'status', 'lang', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  // Catalog docs (hair_cuts, hair_fringes, hair_styles, hair_shades, hair_techniques, hair_looks, beard_styles) carry the seed JSON plus these owner fields.
  catalogOwner: ['hidden', 'localFit', 'signature', 'swatchRef', 'updatedAt', 'updatedBy'],
};

export const RANGES = {
  level: [1, 12],
  greyPct: [0, 100],
  lengthCm: [0, 150],
  mst: [1, 10],
  rating: [1, 5],
  nextVisitWeeks: [1, 52],
  sessions: [0, 6],
  shrinkagePct: [0, 80],
  growthCmPerMonth: [0.3, 3],
  idleWipeMin: [1, 60],
  aiDailyCap: [0, 80],
  retentionDays: [30, 3650],
};

export const LOOK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I
export const LOOK_CODE_DAYS = 30;

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
