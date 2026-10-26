import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Demo mode in the service layer: Firestore's network is off, so a commit promise never
// settles. Nothing may wait for it, nothing may count as "will sync", a missing document
// is simply missing, and nothing signs in or sends an email.

const state = {
  commits: 0,
  cache: new Map(),
  queries: [],
  waitCalls: 0,
  listens: [],
};

const neverSettles = () => new Promise(() => {});

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    doc: (_db, path) => ({ path, id: String(path).split('/').pop() }),
    collection: (_db, path) => ({ path }),
    writeBatch: () => {
      const batch = {
        set: () => batch,
        update: () => batch,
        delete: () => batch,
        commit: () => {
          state.commits += 1;
          return neverSettles();
        },
      };
      return batch;
    },
    getDocFromCache: async (ref) => {
      if (!state.cache.has(ref.path)) throw Object.assign(new Error('not in cache'), { code: 'unavailable' });
      const data = state.cache.get(ref.path);
      return { id: ref.id, exists: () => data !== null, data: () => data };
    },
    getDoc: () => neverSettles(),
    getDocs: () => neverSettles(),
    getDocsFromCache: async (q) => {
      state.queries.push(q);
      return { docs: [] };
    },
    waitForPendingWrites: () => {
      state.waitCalls += 1;
      return neverSettles();
    },
    collectionGroup: (_db, id) => ({ group: id }),
    query: (base, ...constraints) => ({ base, constraints }),
    where: (field, op, value) => ({ field, op, value }),
    onSnapshot: (target, options) => {
      state.listens.push({ target, options });
      return () => {};
    },
  };
});

vi.mock('../../src/lib/firebase.js', async () => {
  const mode = await vi.importActual('../../src/lib/appMode.js');
  return {
    app: {},
    db: { fake: true },
    auth: null,
    demoMode: true,
    usingEmulators: false,
    firebaseConfigured: true,
    DEMO_USER: mode.DEMO_USER,
    resolveMode: mode.resolveMode,
    demoGeneration: () => 1,
    getAppCheckToken: async () => null,
  };
});

vi.mock('../../src/lib/appMode.js', async () => {
  const actual = await vi.importActual('../../src/lib/appMode.js');
  return { ...actual, demoMode: true };
});

const authCalls = { anon: 0, link: 0 };
vi.mock('../../src/services/auth.js', async () => {
  const mode = await vi.importActual('../../src/lib/appMode.js');
  return {
    signInAnon: async () => {
      authCalls.anon += 1;
      return mode.DEMO_USER;
    },
    sendLinkTo: async (address) => {
      authCalls.link += 1;
      return address;
    },
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://demo.test', href: 'https://demo.test/' } });
  state.commits = 0;
  state.cache.clear();
  state.queries.length = 0;
  state.waitCalls = 0;
  state.listens.length = 0;
  authCalls.anon = 0;
  authCalls.link = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('demo mode: db plumbing', () => {
  it('the user is the demo owner, without any sign-in', async () => {
    const db = await import('../../src/services/db.js');
    expect(db.currentUser().uid).toBe('demo-owner');
    expect(db.requireUser().isAnonymous).toBe(false);
  });

  it('a commit resolves at once and never counts as a pending write', async () => {
    const db = await import('../../src/services/db.js');
    const sync = await import('../../src/services/sync.js');
    const p = db.commitOps([{ path: 'shops/s1/clients/c1', data: { a: 1 } }], 'client.create');
    expect(sync.pendingCount()).toBe(0);
    await expect(Promise.race([p.then(() => 'done'), tick().then(() => 'hung')])).resolves.toBe('done');
    expect(state.commits).toBe(1);
    expect(sync.pendingCount()).toBe(0);
  });

  it('snapshots say "server copy": no pending writes, not from cache', async () => {
    const db = await import('../../src/services/db.js');
    expect(db.snapMeta({ metadata: { hasPendingWrites: true, fromCache: true } })).toEqual({
      hasPendingWrites: false,
      fromCache: false,
    });
  });

  it('a one-time read answers from this browser: found, missing, never written', async () => {
    const db = await import('../../src/services/db.js');
    state.cache.set('shops/s1/clients/c1', { displayName: 'Salim' });
    state.cache.set('shops/s1/clients/gone', null);
    await expect(db.readDoc('shops/s1/clients/c1')).resolves.toEqual({ id: 'c1', displayName: 'Salim' });
    await expect(db.readDoc('shops/s1/clients/gone')).resolves.toBeNull();
    await expect(db.readDoc('shops/s1/clients/never')).resolves.toBeNull();
    await expect(db.readQuery({ path: 'q' })).resolves.toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it('every listener answers from this browser only (cache source), so empty lists never wait', async () => {
    const db = await import('../../src/services/db.js');
    const { watchMyShops } = await import('../../src/services/shops.js');
    expect(db.LISTEN_OPTIONS).toEqual({ includeMetadataChanges: true, source: 'cache' });
    const offs = [
      db.listenDoc('shops/s1', () => {}),
      db.listenQuery({ path: 'shops/s1/invites' }, () => {}),
      watchMyShops('demo-owner', () => {}),
    ];
    expect(state.listens).toHaveLength(3);
    for (const l of state.listens) expect(l.options).toMatchObject({ source: 'cache' });
    offs.forEach((off) => off());
  });

  it('queued writes from an earlier visit are not tracked (they never sync)', async () => {
    const db = await import('../../src/services/db.js');
    const sync = await import('../../src/services/sync.js');
    db.trackQueuedWrites();
    expect(state.waitCalls).toBe(0);
    expect(sync.pendingCount()).toBe(0);
  });
});

describe('demo mode: services that used to wait for a server', () => {
  it('a Look Code is made without anonymous sign-in and without waiting', async () => {
    const { createLookCode } = await import('../../src/services/lookCodes.js');
    const params = { styleId: 'goatee', zones: { M: 0, S: 10, C: 15 } };
    const code = await Promise.race([
      createLookCode('s1', { styleId: 'goatee', params }),
      new Promise((r) => setTimeout(() => r('hung'), 200)),
    ]);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(authCalls.anon).toBe(0);
    expect(state.commits).toBe(1);
  });

  it('a Look Code made in this browser is found again; an unknown one is not found', async () => {
    const { getLookCode } = await import('../../src/services/lookCodes.js');
    state.cache.set('shops/s1/lookCodes/ABCDEF', {
      styleId: 'goatee',
      params: { styleId: 'goatee', zones: { C: 15 } },
      expiresAt: { toMillis: () => Date.now() + 86400000 },
    });
    const found = await getLookCode('s1', 'ABCDEF');
    expect(found).toMatchObject({ code: 'ABCDEF', styleId: 'goatee', expired: false });
    await expect(getLookCode('s1', 'XYZXYZ')).resolves.toBeNull();
  });

  it('an invite is saved but no email is sent; the result says demo', async () => {
    const { createInvite } = await import('../../src/services/invites.js');
    const res = await createInvite('s1', 'Barber@Example.com', 'barber');
    expect(res).toMatchObject({ email: 'barber@example.com', role: 'barber', sent: false, demo: true });
    expect(res.joinUrl).toContain('/join/s1');
    expect(authCalls.link).toBe(0);
    expect(state.commits).toBe(1);
  });

  it('the demo shop is made once per page load', async () => {
    const { createDemoShop } = await import('../../src/services/shops.js');
    const a = createDemoShop();
    const b = createDemoShop();
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
    expect(state.commits).toBe(1);
  });
});
