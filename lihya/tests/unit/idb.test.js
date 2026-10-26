import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  STORES,
  closeDb,
  idbAvailable,
  idbPut,
  idbGet,
  idbDelete,
  idbClearStore,
  idbKeys,
  saveBeforeAfter,
  listSavedForClient,
  deleteSavedForClient,
  pruneSaved,
  savedKeyClient,
  savedSummary,
  countSaved,
  countSavedForClient,
  deleteAllSaved,
  subscribeSaved,
} from '../../src/lib/idb.js';

// Minimal in-memory IndexedDB: open/upgrade, out-of-line keys, put/get/delete/clear/
// getAll/getAllKeys, transactions that complete after their requests. Values are
// structured-cloned like the real thing.
function createFakeIndexedDB() {
  const databases = new Map();
  const later = (fn) => setTimeout(fn, 0);

  function makeDb(name) {
    const data = databases.get(name);
    const db = {
      objectStoreNames: { contains: (s) => data.stores.has(s) },
      createObjectStore(s) {
        data.stores.set(s, new Map());
        return {};
      },
      close() {},
      transaction(storeName, mode) {
        if (!data.stores.has(storeName)) throw new Error(`NotFoundError: ${storeName}`);
        const map = data.stores.get(storeName);
        let pending = 0;
        const tx = { error: null, oncomplete: null, onerror: null, onabort: null, aborted: false };
        const finish = () => {
          if (pending === 0 && !tx.aborted && tx.oncomplete) later(() => tx.oncomplete());
        };
        const request = (fn) => {
          const req = { result: undefined, onsuccess: null };
          pending += 1;
          later(() => {
            if (tx.aborted) return;
            req.result = fn();
            if (req.onsuccess) req.onsuccess();
            pending -= 1;
            finish();
          });
          return req;
        };
        const write = (fn) => {
          if (mode !== 'readwrite') throw new Error('ReadOnlyError');
          return request(fn);
        };
        tx.abort = () => {
          tx.aborted = true;
          if (tx.onabort) later(() => tx.onabort());
        };
        tx.objectStore = () => ({
          put: (value, key) => write(() => (map.set(key, structuredClone(value)), key)),
          get: (key) => request(() => (map.has(key) ? structuredClone(map.get(key)) : undefined)),
          delete: (key) => write(() => (map.delete(key), undefined)),
          clear: () => write(() => (map.clear(), undefined)),
          getAll: () => request(() => [...map.values()].map((v) => structuredClone(v))),
          getAllKeys: () => request(() => [...map.keys()]),
          count: () => request(() => map.size),
        });
        later(finish);
        return tx;
      },
    };
    return db;
  }

  return {
    open(name, version) {
      const req = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      later(() => {
        let data = databases.get(name);
        const upgrade = !data || data.version < version;
        if (!data) {
          data = { version, stores: new Map() };
          databases.set(name, data);
        }
        req.result = makeDb(name);
        if (upgrade) {
          data.version = version;
          if (req.onupgradeneeded) req.onupgradeneeded();
        }
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    _databases: databases,
  };
}

const realIDB = globalThis.indexedDB;

afterAll(async () => {
  await closeDb();
  if (realIDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = realIDB;
});

describe('without IndexedDB (private mode)', () => {
  beforeEach(async () => {
    await closeDb();
    delete globalThis.indexedDB;
  });

  it('fails soft: empty reads, false writes, no throw', async () => {
    expect(await idbAvailable()).toBe(false);
    expect(await idbPut(STORES.session, 'k', { a: 1 })).toBe(false);
    expect(await idbGet(STORES.session, 'k')).toBe(undefined);
    expect(await idbDelete(STORES.session, 'k')).toBe(false);
    expect(await idbClearStore(STORES.session)).toBe(false);
    expect(await idbKeys(STORES.saved)).toEqual([]);
    expect(await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']) })).toBe(null);
    expect(await listSavedForClient('c1')).toEqual([]);
    expect(await deleteSavedForClient('c1')).toBe(0);
    expect(await pruneSaved(30)).toBe(0);
    expect(await countSaved()).toBe(0);
    expect(await countSavedForClient('c1')).toBe(0);
    expect(await savedSummary()).toEqual({ pairs: 0, clients: 0, byClient: {} });
    expect(await deleteAllSaved()).toBe(0);
  });

  it('fails soft when opening throws', async () => {
    globalThis.indexedDB = {
      open() {
        throw new Error('SecurityError');
      },
    };
    expect(await idbAvailable()).toBe(false);
    expect(await idbGet(STORES.session, 'k')).toBe(undefined);
  });

  it('rejects unknown stores loudly (a programming error)', async () => {
    await expect(idbGet('photos', 'k')).rejects.toThrow(/unknown store/);
  });
});

describe('with IndexedDB', () => {
  beforeEach(async () => {
    await closeDb();
    globalThis.indexedDB = createFakeIndexedDB();
  });

  it('creates both stores and does put / get / keys / delete / clear', async () => {
    expect(await idbAvailable()).toBe(true);
    expect(await idbPut(STORES.session, 'snapshot', { at: 1, list: [1, 2] })).toBe(true);
    expect(await idbPut(STORES.session, 'other', 'x')).toBe(true);
    expect(await idbGet(STORES.session, 'snapshot')).toEqual({ at: 1, list: [1, 2] });
    expect((await idbKeys(STORES.session)).sort()).toEqual(['other', 'snapshot']);
    expect(await idbDelete(STORES.session, 'other')).toBe(true);
    expect(await idbKeys(STORES.session)).toEqual(['snapshot']);
    expect(await idbClearStore(STORES.session)).toBe(true);
    expect(await idbKeys(STORES.session)).toEqual([]);
    expect(await idbKeys(STORES.saved)).toEqual([]);
  });

  it('keeps before/after photos per client, newest first, as Blobs', async () => {
    const t1 = new Date('2026-10-01T10:00:00Z');
    const t2 = new Date('2026-10-20T10:00:00Z');
    const id1 = await saveBeforeAfter('c1', { before: new Blob(['before-1'], { type: 'image/jpeg' }), after: new Blob(['after-1'], { type: 'image/jpeg' }), at: t1 });
    const id2 = await saveBeforeAfter('c1', { before: new Blob(['before-2'], { type: 'image/jpeg' }), after: new Blob(['after-2'], { type: 'image/png' }), at: t2 });
    await saveBeforeAfter('c2', { before: new Blob(['x']), after: new Blob(['y']), at: t2 });
    expect(id1).toMatch(/^c1:/);
    expect(id2).not.toBe(id1);
    const list = await listSavedForClient('c1');
    expect(list.map((e) => e.id)).toEqual([id2, id1]);
    expect(list[0].at).toEqual(t2);
    expect(list[0].after).toBeInstanceOf(Blob);
    expect(list[0].after.type).toBe('image/png');
    expect(await list[0].before.text()).toBe('before-2');
    expect(await saveBeforeAfter('', { before: new Blob(['a']) })).toBe(null);
    expect(await saveBeforeAfter('c3', {})).toBe(null);
  });

  it('deletes a client\'s photos and prunes by retention', async () => {
    const now = new Date('2026-10-25T10:00:00Z');
    await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']), at: new Date('2026-01-01T00:00:00Z') });
    await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']), at: new Date('2026-10-20T00:00:00Z') });
    await saveBeforeAfter('c2', { before: new Blob(['a']), after: new Blob(['b']), at: new Date('2026-10-21T00:00:00Z') });
    expect(await pruneSaved(90, now)).toBe(1);
    expect(await listSavedForClient('c1')).toHaveLength(1);
    expect(await pruneSaved(0, now)).toBe(0);
    expect(await deleteSavedForClient('c1')).toBe(1);
    expect(await listSavedForClient('c1')).toEqual([]);
    expect(await listSavedForClient('c2')).toHaveLength(1);
  });

  it('counts kept pairs per client from the keys, and deletes them all', async () => {
    const changes = [];
    const unsubscribe = subscribeSaved(() => changes.push('changed'));
    const day = (d) => new Date(`2026-10-${d}T10:00:00Z`);
    await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']), at: day(10) });
    await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']), at: day(11) });
    await saveBeforeAfter('c2', { before: new Blob(['a']), after: new Blob(['b']), at: day(12) });
    expect(changes).toHaveLength(3);
    expect(await countSaved()).toBe(3);
    expect(await countSavedForClient('c1')).toBe(2);
    expect(await countSavedForClient('nobody')).toBe(0);
    expect(await countSavedForClient('')).toBe(0);
    expect(await savedSummary()).toEqual({ pairs: 3, clients: 2, byClient: { c1: 2, c2: 1 } });
    expect(await deleteSavedForClient('c2')).toBe(1);
    expect(changes).toHaveLength(4);
    expect(await deleteSavedForClient('c2')).toBe(0);
    expect(changes).toHaveLength(4);
    expect(await deleteAllSaved()).toBe(2);
    expect(changes).toHaveLength(5);
    expect(await countSaved()).toBe(0);
    expect(await listSavedForClient('c1')).toEqual([]);
    unsubscribe();
    await saveBeforeAfter('c3', { before: new Blob(['a']), after: new Blob(['b']) });
    expect(changes).toHaveLength(5);
  });

  it('prunes with the retention days it is given, and tells listeners only when something went', async () => {
    const changes = [];
    const unsubscribe = subscribeSaved(() => changes.push('changed'));
    const now = new Date('2026-10-25T10:00:00Z');
    await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']), at: new Date('2026-09-01T10:00:00Z') });
    await saveBeforeAfter('c2', { before: new Blob(['a']), after: new Blob(['b']), at: new Date('2026-10-20T10:00:00Z') });
    changes.length = 0;
    expect(await pruneSaved(365, now)).toBe(0);
    expect(changes).toHaveLength(0);
    // A shop that keeps records 30 days: the September pair goes, last week's stays.
    expect(await pruneSaved(30, now)).toBe(1);
    expect(changes).toHaveLength(1);
    expect(await savedSummary()).toEqual({ pairs: 1, clients: 1, byClient: { c2: 1 } });
    unsubscribe();
  });

  it('reads the client id back from a saved key', () => {
    expect(savedKeyClient('c1:1761300000000:a1b2c3')).toBe('c1');
    expect(savedKeyClient('odd:id:1761300000000:a1b2c3')).toBe('odd:id');
    expect(savedKeyClient('nokey')).toBe(null);
    expect(savedKeyClient(':1:2')).toBe(null);
    expect(savedKeyClient(42)).toBe(null);
  });

  it('the session wipe clears the session store but keeps saved photos', async () => {
    await idbPut(STORES.session, 'snapshot', { state: {} });
    const id = await saveBeforeAfter('c1', { before: new Blob(['a']), after: new Blob(['b']) });
    await idbClearStore(STORES.session);
    expect(await idbKeys(STORES.session)).toEqual([]);
    expect(await idbKeys(STORES.saved)).toEqual([id]);
  });
});
