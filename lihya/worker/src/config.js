// Worker settings read from wrangler.toml [vars] plus the fixed limits of the
// AI Final Look (PRD 7.5). Nothing here is secret: the Workers AI binding needs
// no API key and the Firebase project id is public.

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://lihya.web.app',
  'https://lihya.firebaseapp.com',
  'http://localhost:5173',
]);

// Workers AI Free plan: 10,000 neurons per day. One render costs at most
// 2 input tiles x 5.37 + 4 output tiles x 26.05 = 114.94 neurons, so 80 renders
// use at most 9,196 neurons. The account cap can be lowered, never raised past 80.
export const ACCOUNT_CAP_MAX = 80;
export const ACCOUNT_CAP_DEFAULT = 80;
export const SHOP_CAP_DEFAULT = 20;

// Allowlist (SEC-08): anyone can create a shop in the app, so only shops Sam lists may
// render, and only an allowlisted cap may go above SHOP_CAP_DEFAULT. Two sources:
//   KV key  ai:allowed:<shopId>  (binding LIHYA_CAPS, set with wrangler, no redeploy)
//   var     AI_SHOPS = "shopA, shopB:40"  (wrangler.toml)
// The KV key wins when it exists. Its value (and the ":<n>" of an AI_SHOPS entry) is
// the most renders a day the shop may set (1..80); "0", "no", "off" or "false" in KV
// blocks the shop; any other value allows it with the default 20.
export const ALLOWLIST_KEY_PREFIX = 'ai:allowed:';
const SHOP_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const BLOCK_VALUES = new Set(['0', 'no', 'off', 'false']);

// Request limits. Two JPEGs under 512 x 512 are far below these.
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MIN_INPUT_SIDE = 64;
// Workers AI: "All input images must be smaller than 512x512". The app sends 504 x 504.
export const MAX_INPUT_SIDE = 511;

// Output size: the longer side is 1024 px (at most 4 output tiles of 512 x 512).
export const OUTPUT_LONG_SIDE = 1024;
export const OUTPUT_MIN_SIDE = 256;
export const OUTPUT_STEP = 16;

// The app sends an unsigned 32-bit seed; the model gets it folded into 0..2^31-1.
export const SEED_MAX = 4294967295;
export const MODEL_SEED_MODULO = 2147483648;
export const UPSTREAM_TIMEOUT_MS = 10000;

/** Lower-case scheme://host[:port] without a trailing slash, or null. */
export function normalizeOrigin(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().replace(/\/+$/, '');
  if (!/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/.test(trimmed)) return null;
  return trimmed;
}

/** Comma list from ALLOWED_ORIGINS. Invalid entries (and "*") are dropped. */
export function parseAllowedOrigins(value) {
  if (typeof value !== 'string' || value.trim() === '') return [...DEFAULT_ALLOWED_ORIGINS];
  const list = value
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter((entry) => entry !== null);
  return [...new Set(list)];
}

/** ACCOUNT_DAILY_CAP as an integer in [0, 80]; 80 when missing or invalid. */
export function parseAccountCap(value) {
  if (value === undefined || value === null || String(value).trim() === '') return ACCOUNT_CAP_DEFAULT;
  const n = Number(value);
  if (!Number.isFinite(n)) return ACCOUNT_CAP_DEFAULT;
  return Math.min(ACCOUNT_CAP_MAX, Math.max(0, Math.floor(n)));
}

/** The most renders a day an allowlist entry grants: an integer 1..80, else the default 20. */
export function parseAllowCap(value) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!/^\d{1,3}$/.test(text)) return SHOP_CAP_DEFAULT;
  const n = Number(text);
  return n >= 1 ? Math.min(ACCOUNT_CAP_MAX, n) : SHOP_CAP_DEFAULT;
}

/** AI_SHOPS ("shopA, shopB:40") -> Map(shopId -> max cap). Invalid entries are dropped. */
export function parseAiShops(value) {
  const out = new Map();
  if (typeof value !== 'string') return out;
  for (const entry of value.split(',')) {
    const [rawId, rawCap] = entry.trim().split(':');
    const id = (rawId || '').trim();
    if (!SHOP_ID_RE.test(id) || (rawCap !== undefined && BLOCK_VALUES.has(rawCap.trim().toLowerCase()))) continue;
    out.set(id, parseAllowCap(rawCap));
  }
  return out;
}

/** Allowlist KV value -> { allowed, maxCap }; null when the key does not exist. */
export function allowanceFromKv(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().toLowerCase();
  if (BLOCK_VALUES.has(text)) return { allowed: false, maxCap: 0 };
  return { allowed: true, maxCap: parseAllowCap(text) };
}

export function allowlistKey(shopId) {
  return `${ALLOWLIST_KEY_PREFIX}${shopId}`;
}

/**
 * Per-shop cap: min(settings.aiDailyCap ?? 20, the allowlist's max for the shop, account
 * cap). The owner sets aiDailyCap in Settings (0..80); a missing or broken value means
 * 20, and a shop that is not allowlisted with a higher number cannot go above 20.
 */
export function shopCapFrom(aiDailyCap, accountCap, maxCap = SHOP_CAP_DEFAULT) {
  let cap = SHOP_CAP_DEFAULT;
  if (typeof aiDailyCap === 'number' && Number.isFinite(aiDailyCap)) cap = Math.max(0, Math.floor(aiDailyCap));
  const max = typeof maxCap === 'number' && Number.isFinite(maxCap) ? Math.max(0, Math.floor(maxCap)) : SHOP_CAP_DEFAULT;
  return Math.min(cap, max, accountCap);
}

export function readConfig(env) {
  const source = env || {};
  const projectId = typeof source.FIREBASE_PROJECT_ID === 'string' ? source.FIREBASE_PROJECT_ID.trim() : '';
  return {
    projectId,
    allowedOrigins: parseAllowedOrigins(source.ALLOWED_ORIGINS),
    accountCap: parseAccountCap(source.ACCOUNT_DAILY_CAP),
    aiShops: parseAiShops(source.AI_SHOPS),
  };
}
