// Daily caps for the AI Final Look in Workers KV (binding LIHYA_CAPS).
//
// Counters are keyed by the UTC date because the Workers AI free allocation
// resets at 00:00 UTC (04:00 Muscat):
//   ai:account:<YYYY-MM-DD>           renders for the whole Cloudflare account (cap 80)
//   ai:shop:<shopId>:<YYYY-MM-DD>     renders for one shop (cap min(settings.aiDailyCap ?? 20, 80))
// Each counter expires by itself three days later.
//
// A render reserves one slot on both counters BEFORE the model runs and gives
// it back when the model fails, so a failed render never uses the quota.
//
// Consistency: KV is eventually consistent and has no atomic increment. Two
// renders that read the same counter at the same moment both write N+1, so the
// count can come out lower than the real number of renders (a few extra renders
// on a busy day), and a write made in one Cloudflare location can take up to
// about 60 s to show in another. A failed release leaves the counter one too
// high (blocks earlier, never overspends). The real ceiling stays the Workers AI
// Free allocation of 10,000 neurons per day: when it is used up the model call
// fails and the Worker answers 429 'account' as well. KV allows one write per
// second per key, so a write that fails is retried once after a short pause.

export const COUNTER_TTL_SECONDS = 3 * 24 * 60 * 60;
export const WRITE_RETRY_DELAY_MS = 1100;

export class CapStoreError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CapStoreError';
  }
}

/** UTC calendar date 'YYYY-MM-DD' (the Workers AI quota day, not the Muscat day). */
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Next 00:00 UTC (04:00 Muscat) as an ISO string. */
export function nextUtcMidnightIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

export function accountCounterKey(day) {
  return `ai:account:${day}`;
}

export function shopCounterKey(shopId, day) {
  return `ai:shop:${shopId}:${day}`;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Current value of a counter (0 when missing or unreadable). */
export async function readCount(kv, key) {
  const raw = await kv.get(key);
  const n = Number.parseInt(raw === null || raw === undefined ? '0' : String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function writeCount(kv, key, value, { sleep = defaultSleep, retryDelayMs = WRITE_RETRY_DELAY_MS } = {}) {
  const text = String(Math.max(0, Math.floor(value)));
  const options = { expirationTtl: COUNTER_TTL_SECONDS };
  try {
    await kv.put(key, text, options);
  } catch (first) {
    await sleep(retryDelayMs);
    try {
      await kv.put(key, text, options);
    } catch (second) {
      throw new CapStoreError('kv write failed', { cause: second });
    }
  }
}

/** Today's usage for the owner screen. */
export async function readUsage(kv, shopId, now = new Date()) {
  const day = utcDayKey(now);
  const [accountUsed, shopUsed] = await Promise.all([
    readCount(kv, accountCounterKey(day)),
    readCount(kv, shopCounterKey(shopId, day)),
  ]);
  return { day, accountUsed, shopUsed, resetsAt: nextUtcMidnightIso(now) };
}

/**
 * Reserve one render for `shopId` today.
 * @returns {Promise<{ ok: true, day, shopId, accountUsed, shopUsed } |
 *                   { ok: false, scope: 'account'|'shop', resetsAt, day, accountUsed, shopUsed }>}
 *   accountUsed / shopUsed include this render when ok.
 * @throws {CapStoreError} when KV refuses the writes (nothing stays reserved)
 */
export async function reserve(kv, { shopId, accountCap, shopCap, now = new Date(), sleep, retryDelayMs } = {}) {
  const { day, accountUsed, shopUsed, resetsAt } = await readUsage(kv, shopId, now);
  if (accountUsed >= accountCap) return { ok: false, scope: 'account', resetsAt, day, accountUsed, shopUsed };
  if (shopUsed >= shopCap) return { ok: false, scope: 'shop', resetsAt, day, accountUsed, shopUsed };

  const writeOptions = { sleep, retryDelayMs };
  const accountKey = accountCounterKey(day);
  const shopKey = shopCounterKey(shopId, day);
  const results = await Promise.allSettled([
    writeCount(kv, accountKey, accountUsed + 1, writeOptions),
    writeCount(kv, shopKey, shopUsed + 1, writeOptions),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) {
    // Undo the half that was written so nothing stays reserved.
    const undo = [];
    if (results[0].status === 'fulfilled') undo.push(writeCount(kv, accountKey, accountUsed, writeOptions));
    if (results[1].status === 'fulfilled') undo.push(writeCount(kv, shopKey, shopUsed, writeOptions));
    await Promise.allSettled(undo);
    throw failed.reason instanceof CapStoreError ? failed.reason : new CapStoreError('kv write failed', { cause: failed.reason });
  }
  return { ok: true, day, shopId, accountUsed: accountUsed + 1, shopUsed: shopUsed + 1 };
}

/**
 * Give back a reservation after a failed render. Uses the reservation's own
 * day, so a render that crosses 00:00 UTC is released on the day it was counted.
 * @returns {Promise<boolean>} false when KV refused (the counter stays one too high)
 */
export async function release(kv, reservation, { sleep, retryDelayMs } = {}) {
  if (!reservation || reservation.ok !== true) return true;
  const writeOptions = { sleep, retryDelayMs };
  const accountKey = accountCounterKey(reservation.day);
  const shopKey = shopCounterKey(reservation.shopId, reservation.day);
  try {
    const [accountNow, shopNow] = await Promise.all([readCount(kv, accountKey), readCount(kv, shopKey)]);
    await Promise.all([
      writeCount(kv, accountKey, accountNow - 1, writeOptions),
      writeCount(kv, shopKey, shopNow - 1, writeOptions),
    ]);
    return true;
  } catch (err) {
    return false;
  }
}
