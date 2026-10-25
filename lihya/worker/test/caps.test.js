import { describe, expect, it } from 'vitest';
import {
  accountCounterKey,
  CapStoreError,
  COUNTER_TTL_SECONDS,
  nextUtcMidnightIso,
  readUsage,
  release,
  reserve,
  shopCounterKey,
  utcDayKey,
} from '../src/caps.js';
import { parseAccountCap, shopCapFrom } from '../src/config.js';
import { MemoryKV, SHOP_ID } from './helpers.js';

const noSleep = async () => {};
const DAY1 = new Date('2026-10-25T12:00:00.000Z');

function args(extra = {}) {
  return { shopId: SHOP_ID, accountCap: 80, shopCap: 20, now: DAY1, sleep: noSleep, ...extra };
}

describe('UTC day keys', () => {
  it('uses the UTC date, which flips at 04:00 Muscat', () => {
    // 03:59 in Muscat is still the previous UTC day; 04:00 Muscat is 00:00 UTC.
    expect(utcDayKey(new Date('2026-10-25T23:59:59.999Z'))).toBe('2026-10-25');
    expect(utcDayKey(new Date('2026-10-26T00:00:00.000Z'))).toBe('2026-10-26');
  });

  it('resets at the next 00:00 UTC', () => {
    expect(nextUtcMidnightIso(new Date('2026-10-25T23:59:59.999Z'))).toBe('2026-10-26T00:00:00.000Z');
    expect(nextUtcMidnightIso(new Date('2026-10-26T00:00:00.000Z'))).toBe('2026-10-27T00:00:00.000Z');
    expect(nextUtcMidnightIso(new Date('2026-12-31T20:00:00.000Z'))).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('cap values', () => {
  it('account cap comes from ACCOUNT_DAILY_CAP and never passes 80', () => {
    expect(parseAccountCap('80')).toBe(80);
    expect(parseAccountCap(undefined)).toBe(80);
    expect(parseAccountCap('abc')).toBe(80);
    expect(parseAccountCap('200')).toBe(80);
    expect(parseAccountCap('10')).toBe(10);
    expect(parseAccountCap('-3')).toBe(0);
  });

  it('shop cap is min(settings.aiDailyCap ?? 20, account cap)', () => {
    expect(shopCapFrom(null, 80)).toBe(20);
    expect(shopCapFrom(undefined, 80)).toBe(20);
    expect(shopCapFrom(50, 80)).toBe(50);
    expect(shopCapFrom(80, 80)).toBe(80);
    expect(shopCapFrom(500, 80)).toBe(80);
    expect(shopCapFrom(0, 80)).toBe(0);
    expect(shopCapFrom(30, 10)).toBe(10);
    expect(shopCapFrom(12.7, 80)).toBe(12);
  });
});

describe('reserve and release', () => {
  it('counts one render on both counters with an expiry', async () => {
    const kv = new MemoryKV();
    const r = await reserve(kv, args());
    expect(r).toEqual({ ok: true, day: '2026-10-25', shopId: SHOP_ID, accountUsed: 1, shopUsed: 1 });
    expect(kv.store.get('ai:account:2026-10-25')).toBe('1');
    expect(kv.store.get(`ai:shop:${SHOP_ID}:2026-10-25`)).toBe('1');
    for (const put of kv.puts) expect(put.options.expirationTtl).toBe(COUNTER_TTL_SECONDS);
  });

  it('stops at the shop cap', async () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 3; i += 1) expect((await reserve(kv, args({ shopCap: 3 }))).ok).toBe(true);
    const r = await reserve(kv, args({ shopCap: 3 }));
    expect(r.ok).toBe(false);
    expect(r.scope).toBe('shop');
    expect(r.resetsAt).toBe('2026-10-26T00:00:00.000Z');
    expect(kv.store.get(shopCounterKey(SHOP_ID, '2026-10-25'))).toBe('3');
    expect(kv.store.get(accountCounterKey('2026-10-25'))).toBe('3');
  });

  it('stops at the account cap even when the shop has room', async () => {
    const kv = new MemoryKV({ [accountCounterKey('2026-10-25')]: 80 });
    const before = kv.puts.length;
    const r = await reserve(kv, args({ shopCap: 80 }));
    expect(r).toMatchObject({ ok: false, scope: 'account', resetsAt: '2026-10-26T00:00:00.000Z', accountUsed: 80, shopUsed: 0 });
    expect(kv.puts.length).toBe(before);
  });

  it('other shops share the account counter only', async () => {
    const kv = new MemoryKV();
    await reserve(kv, args({ shopId: 'shopA' }));
    await reserve(kv, args({ shopId: 'shopB' }));
    const usageA = await readUsage(kv, 'shopA', DAY1);
    expect(usageA).toEqual({ day: '2026-10-25', accountUsed: 2, shopUsed: 1, resetsAt: '2026-10-26T00:00:00.000Z' });
  });

  it('release gives the slot back after a failed render', async () => {
    const kv = new MemoryKV();
    await reserve(kv, args());
    const r = await reserve(kv, args());
    expect(await release(kv, r, { sleep: noSleep })).toBe(true);
    const usage = await readUsage(kv, SHOP_ID, DAY1);
    expect(usage.accountUsed).toBe(1);
    expect(usage.shopUsed).toBe(1);
  });

  it('release never goes below zero and ignores refused reservations', async () => {
    const kv = new MemoryKV();
    const r = await reserve(kv, args());
    kv.store.clear();
    expect(await release(kv, r, { sleep: noSleep })).toBe(true);
    expect(kv.store.get(accountCounterKey('2026-10-25'))).toBe('0');
    expect(await release(kv, { ok: false, scope: 'shop' })).toBe(true);
  });

  it('a new UTC day starts from zero and releases go to the reservation day', async () => {
    const kv = new MemoryKV();
    const late = new Date('2026-10-25T23:59:58.000Z');
    for (let i = 0; i < 2; i += 1) await reserve(kv, args({ shopCap: 2, now: late }));
    expect((await reserve(kv, args({ shopCap: 2, now: late }))).ok).toBe(false);

    const nextDay = new Date('2026-10-26T00:00:01.000Z');
    const r = await reserve(kv, args({ shopCap: 2, now: nextDay }));
    expect(r).toMatchObject({ ok: true, day: '2026-10-26', shopUsed: 1, accountUsed: 1 });

    // A render reserved before midnight that fails after midnight is released on its own day.
    const lateReservation = { ok: true, day: '2026-10-25', shopId: SHOP_ID };
    await release(kv, lateReservation, { sleep: noSleep });
    expect(kv.store.get(shopCounterKey(SHOP_ID, '2026-10-25'))).toBe('1');
    expect(kv.store.get(shopCounterKey(SHOP_ID, '2026-10-26'))).toBe('1');
  });

  it('retries a refused KV write once', async () => {
    const kv = new MemoryKV();
    kv.failPuts = 1;
    let slept = 0;
    const r = await reserve(kv, args({ sleep: async () => { slept += 1; } }));
    expect(r.ok).toBe(true);
    expect(slept).toBe(1);
    expect((await readUsage(kv, SHOP_ID, DAY1)).accountUsed).toBe(1);
  });

  it('throws CapStoreError and keeps nothing reserved when KV keeps refusing', async () => {
    const kv = new MemoryKV();
    await reserve(kv, args());
    kv.failPuts = 3; // account write fails twice, shop write's first try fails, its retry succeeds
    await expect(reserve(kv, args())).rejects.toBeInstanceOf(CapStoreError);
    const usage = await readUsage(kv, SHOP_ID, DAY1);
    expect(usage.accountUsed).toBe(1);
    expect(usage.shopUsed).toBe(1);
  });
});
