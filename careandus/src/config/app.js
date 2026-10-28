// One place to rename the product or flip a feature.
export const APP = {
  name: 'Care & Us',
  nameAr: 'كير آند أس',
  studio: '10 Digital',
  version: '1.0.0',
};

// The three services. `hair` = KHUSLA, `nails` = Nail Mirror, `beard` = LIHYA.
export const SECTION_LIST = [
  { id: 'hair', name: { en: 'Hair', ar: 'الشعر' }, icon: 'scissors' },
  { id: 'nails', name: { en: 'Nails', ar: 'الأظافر' }, icon: 'brush' },
  { id: 'beard', name: { en: 'Beard', ar: 'اللحية' }, icon: 'face' },
];

/** A new salon starts with hair + nails on; the owner changes it in Settings or at Create salon. */
export const SECTIONS_DEFAULT = { hair: true, nails: true, beard: false };

export const FEATURES = {
  aiPreview: false, // AI Final Look: built, OFF by default. Salons switch it on in Settings.
  privateMode: true, // background blur, no thumbnails, idle wipe
  tryAtHome: true,
  // Age model (FairFace ONNX). OFF until Sam confirms the model license (see BUILD_NOTES.md).
  ageModel: false,
  // Quick shorten with MI-GAN (MIT). Falls back to the on-device classic fill when offline.
  quickShortenModel: true,
};

export const DEFAULTS = {
  timezone: 'Asia/Muscat',
  currency: 'OMR',
  currencyDecimals: 3,
  idleWipeMin: 5,
  aiDailyCap: 20,
  accountDailyCap: 80,
  growthCmPerMonth: 1.25,
  retentionDays: 365,
  lookCodeDays: 30,
  undoMs: 6000,
  bigChangeCm: 15,
  bigChangeLevels: 3,
};

export const SALON_SETTINGS_DEFAULT = {
  privateMode: FEATURES.privateMode,
  idleWipeMin: DEFAULTS.idleWipeMin,
  aiPreview: FEATURES.aiPreview,
  aiDailyCap: DEFAULTS.aiDailyCap,
  growthCmPerMonth: DEFAULTS.growthCmPerMonth,
  retentionDays: DEFAULTS.retentionDays,
  tryAtHome: FEATURES.tryAtHome,
};
