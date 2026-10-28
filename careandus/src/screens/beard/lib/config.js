// Beard (LIHYA) constants inside Care & Us. App name and currency follow the shared app.
import { APP as SHARED, DEFAULTS } from '../../../config/app.js';

export const APP = {
  name: SHARED.name,
  nameAr: SHARED.nameAr,
  // File names (careandus-cut-card-2026-10-26.pdf).
  slug: 'careandus',
  studio: SHARED.studio,
  defaultLanguage: 'ar',
  currency: DEFAULTS.currency,
  currencyDecimals: DEFAULTS.currencyDecimals,
};

export const FLAGS = {
  // AI Final Look (Cloudflare) is not part of the beard flow in Care & Us yet.
  aiPreviewDefault: false,
  tryAtHome: true,
};

export const LIMITS = {
  aiDailyCapShopDefault: DEFAULTS.aiDailyCap,
  maxLooks: 3,
  sessionIdleMs: DEFAULTS.idleWipeMin * 60 * 1000,
  undoMs: DEFAULTS.undoMs,
  lookCodeDays: DEFAULTS.lookCodeDays,
  lookCodeLength: 6,
  lookCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  decisionSecondsMax: 3600,
  growthMmPerDayDefault: 0.4,
  topStyles: 6,
  maxReasonChips: 3,
};

// Per-device UI preferences only (sessionStorage / localStorage), never business data.
export const PREF_KEYS = {
  mirror: 'careandus.beard.mirror',
  captureMode: 'careandus.beard.captureMode',
  whiteCard: 'careandus.beard.whiteCardShown',
  studioPreview: 'careandus.beard.studioPreview',
  studioLowFps: 'careandus.beard.studioLowFps',
};
