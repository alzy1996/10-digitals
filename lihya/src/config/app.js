// One place to rename the app or flip a feature. Business logic reads from here.

export const APP = {
  name: 'LIHYA',
  nameAr: 'لحية',
  studio: '10 Digital',
  version: '1.0.0',
  defaultLanguage: 'ar',
  languages: ['ar', 'en'],
  timezone: 'Asia/Muscat',
  currency: 'OMR',
  currencyDecimals: 3,
  schemaVersion: 1,
};

// Feature flags. Shop-level settings (Firestore) can turn some of these off per shop.
export const FLAGS = {
  // AI Final Look is built but OFF by default; the owner turns it on in Settings.
  aiPreviewDefault: false,
  // Customer "Try at home" link.
  tryAtHome: true,
  // Lazy age-band model (Wi-Fi only). When it cannot load, age chips ask instead.
  ageModel: true,
};

export const LIMITS = {
  aiDailyCapAccount: 80,
  aiDailyCapShopDefault: 20,
  maxLooks: 3,
  sessionIdleMs: 10 * 60 * 1000,
  undoMs: 6000,
  lookCodeDays: 30,
  lookCodeLength: 6,
  // Alphabet without 0, O, 1, I so codes read clearly aloud and on screen.
  lookCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  decisionSecondsMax: 3600,
  retentionDaysDefault: 365,
  growthMmPerDayDefault: 0.4,
  topStyles: 6,
  maxReasonChips: 3,
};

// localStorage is used for per-device UI preferences only (language, theme,
// camera mirror). Business data never goes to localStorage.
export const PREF_KEYS = {
  lang: 'lihya.pref.lang',
  theme: 'lihya.pref.theme',
  mirror: 'lihya.pref.mirror',
  lastShop: 'lihya.pref.lastShop',
  emailForSignIn: 'lihya.auth.emailForSignIn',
};
