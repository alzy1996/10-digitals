import { describe, expect, it, vi } from 'vitest';
import { pendingCount, subscribePending, subscribeWriteErrors, trackWrite } from '../../src/services/sync.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('offline write tracking', () => {
  it('counts writes until the server confirms them', async () => {
    const seen = [];
    const unsub = subscribePending((n) => seen.push(n));
    const a = deferred();
    const b = deferred();
    trackWrite(a.promise, 'a');
    trackWrite(b.promise, 'b');
    expect(pendingCount()).toBe(2);
    a.resolve();
    await tick();
    expect(pendingCount()).toBe(1);
    b.resolve();
    await tick();
    expect(pendingCount()).toBe(0);
    unsub();
    expect(seen).toEqual([0, 1, 2, 1, 0]);
  });

  it('reports a rejected write without an unhandled rejection', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors = [];
    const unsub = subscribeWriteErrors((err, label) => errors.push([err.code, label]));
    const d = deferred();
    const returned = trackWrite(d.promise, 'client.create');
    expect(returned).toBe(d.promise);
    const err = new Error('denied');
    err.code = 'permission-denied';
    d.reject(err);
    await tick();
    expect(pendingCount()).toBe(0);
    expect(errors).toEqual([['permission-denied', 'client.create']]);
    unsub();
    errSpy.mockRestore();
  });

  it('ignores values that are not promises', () => {
    expect(trackWrite(null)).toBeNull();
    expect(pendingCount()).toBe(0);
  });
});
