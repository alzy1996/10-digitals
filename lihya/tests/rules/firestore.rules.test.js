// Firestore security rules (PRD 10.3), against the emulator:
//   npm run test:rules
// At least one allow and one deny case per rule. The "Create your shop" batch is
// the real one from src/services/seed.js, so the seed is proven to pass the rules.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { demoOps, reverseStats, shopOps } from '../../src/services/seed.js';
import { applyOps, auditOp, statsOp } from '../../src/services/ops.js';
import {
  DEFAULT_SETTINGS,
  clientSearchFields,
  compactCutCard,
  sanitizeParams,
  sanitizeStylePatch,
  styleData,
} from '../../src/services/model.js';
import { addOnsCountOps, approvalCountOps } from '../../src/services/consultations.js';
import { clampParams, paramsFromStyle } from '../../src/lib/look.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const RULES = readFileSync(resolve(root, 'firestore.rules'), 'utf8');

// The real catalog when the catalog engineer's file exists, else 34 synthetic styles
// with the same shape (the batch size is what matters for the rules limits).
function loadStyles() {
  const file = resolve(root, 'src/data/styles.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  return Array.from({ length: 34 }, (_, i) => ({
    id: `style-${i + 1}`,
    name: { en: `Style ${i + 1}`, ar: `ستايل ${i + 1}` },
    zones: { M: 6, S: 4, C: 10 + i, J_L: 8, J_R: 8, K_L: 6, K_R: 6, B_L: 4, B_R: 4, N: 0 },
    zoneNote: 'synthetic',
    shape: { chin: 'round', jFront: false, mustacheFloating: false, fadeB: [2, 6], flare: false, lengthAdjustable: 'C' },
    lines: { cheek: 'natural', neckline: '2f', sideburn: 'blended', edge: 'soft', mustacheEdge: 'at' },
    mustacheId: null,
    faces: ['all'],
    trimDays: 7,
    localFit: 3,
    lengthClass: 'short',
    weights: { C: 0.6, M: 0.4 },
    required: { C: 60, M: 50 },
    theatrical: false,
    tags: ['gulf'],
    order: (i + 1) * 10,
    hidden: i === 33,
    signature: false,
  }));
}
const STYLES = loadStyles();

const SHOP = 's1';
const OWNER = 'owner1';
const MANAGER = 'manager1';
const BARBER = 'barber1';
const OFF = 'off1';
const OUTSIDER = 'outsider1';
const JOINER = 'joiner1';
const ANON = 'anon1';
const ANON2 = 'anon2';

let env;

function token(email, { verified = true, provider = 'google.com' } = {}) {
  const t = { firebase: { sign_in_provider: provider } };
  if (email) {
    t.email = email;
    t.email_verified = verified;
  }
  return t;
}

const as = {
  owner: () => env.authenticatedContext(OWNER, token('owner@lihya.test')).firestore(),
  manager: () => env.authenticatedContext(MANAGER, token('manager@lihya.test')).firestore(),
  barber: () => env.authenticatedContext(BARBER, token('barber@lihya.test')).firestore(),
  off: () => env.authenticatedContext(OFF, token('off@lihya.test')).firestore(),
  outsider: () => env.authenticatedContext(OUTSIDER, token('outsider@lihya.test')).firestore(),
  joiner: (opts) => env.authenticatedContext(JOINER, token('New.Barber@lihya.test', opts)).firestore(),
  anon: () => env.authenticatedContext(ANON, token(null, { provider: 'anonymous' })).firestore(),
  anon2: () => env.authenticatedContext(ANON2, token(null, { provider: 'anonymous' })).firestore(),
  nobody: () => env.unauthenticatedContext().firestore(),
};

const past = () => Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
const inDays = (d) => Timestamp.fromMillis(Date.now() + d * 24 * 60 * 60 * 1000);

function shopData(extra = {}) {
  return {
    name: 'Brass Chair',
    nameAr: 'الكرسي النحاسي',
    languages: ['ar', 'en'],
    timezone: 'Asia/Muscat',
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS, guardChart: [{ id: '1', label: { en: '#1', ar: '#1' }, mm: 3 }] },
    createdAt: past(),
    createdBy: OWNER,
    ...extra,
  };
}

function staffData(uid, role, active = true) {
  return { uid, name: uid, email: `${uid}@lihya.test`, role, active, createdAt: past(), createdBy: uid };
}

function styleDoc(id, hidden) {
  return { id, name: { en: id, ar: id }, zones: { C: 10 }, hidden, signature: false, order: 10, createdAt: past(), createdBy: OWNER, updatedAt: past(), updatedBy: OWNER };
}

function clientData(uid = BARBER, extra = {}) {
  return {
    displayName: 'Hamed',
    displayNameLower: 'hamed',
    phone: '+96891234567',
    demo: false,
    lastVisitAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    createdBy: uid,
    ...extra,
  };
}

function consultationData(uid = BARBER, extra = {}) {
  return {
    clientId: 'c1',
    barberUid: uid,
    styleId: 'goatee',
    params: { styleId: 'goatee', zones: { C: 15 } },
    cutCard: null,
    status: 'draft',
    startedAt: Timestamp.now(),
    approvedAt: null,
    decisionSeconds: null,
    aiPreviewUsed: false,
    addOns: [],
    rating: null,
    nextVisitDays: null,
    dayKey: '2026-10-25',
    demo: false,
    createdAt: serverTimestamp(),
    createdBy: uid,
    ...extra,
  };
}

function lookCodeData(uid, extra = {}) {
  return {
    styleId: 'goatee',
    params: { styleId: 'goatee', zones: { C: 15 } },
    createdAt: serverTimestamp(),
    createdBy: uid,
    expiresAt: inDays(30),
    ...extra,
  };
}

async function seed({ tryAtHome = true } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, `shops/${SHOP}`), shopData());
    await setDoc(doc(d, `shops/${SHOP}/staff/${OWNER}`), staffData(OWNER, 'owner'));
    await setDoc(doc(d, `shops/${SHOP}/staff/${MANAGER}`), staffData(MANAGER, 'manager'));
    await setDoc(doc(d, `shops/${SHOP}/staff/${BARBER}`), staffData(BARBER, 'barber'));
    await setDoc(doc(d, `shops/${SHOP}/staff/${OFF}`), staffData(OFF, 'barber', false));
    await setDoc(doc(d, `shops/${SHOP}/public/info`), {
      name: 'Brass Chair', nameAr: 'الكرسي النحاسي', tryAtHome, whatsapp: '+96891234567', updatedAt: past(), updatedBy: OWNER,
    });
    await setDoc(doc(d, `shops/${SHOP}/styles/goatee`), styleDoc('goatee', false));
    await setDoc(doc(d, `shops/${SHOP}/styles/secret`), styleDoc('secret', true));
    await setDoc(doc(d, `shops/${SHOP}/products/p1`), {
      name: 'Beard oil', nameAr: 'زيت لحية', category: 'oil', priceOmr: 3.5, active: true,
      createdAt: past(), createdBy: OWNER, updatedAt: past(), updatedBy: OWNER,
    });
    await setDoc(doc(d, `shops/${SHOP}/clients/c1`), { ...clientData(BARBER), lastVisitAt: past(), createdAt: past() });
    await setDoc(doc(d, `shops/${SHOP}/clients/demo1`), { ...clientData(OWNER), demo: true, lastVisitAt: past(), createdAt: past() });
    await setDoc(doc(d, `shops/${SHOP}/consultations/k1`), { ...consultationData(BARBER), createdAt: past() });
    await setDoc(doc(d, `shops/${SHOP}/consultations/kdemo`), { ...consultationData(OWNER), demo: true, createdAt: past() });
    await setDoc(doc(d, `shops/${SHOP}/lookCodes/ABC234`), { ...lookCodeData(ANON), createdAt: past() });
    await setDoc(doc(d, `shops/${SHOP}/invites/new.barber@lihya.test`), {
      email: 'new.barber@lihya.test', role: 'barber', createdAt: past(), createdBy: OWNER,
    });
    await setDoc(doc(d, `shops/${SHOP}/consents/x1`), { type: 'ai_render', clientId: 'c1', granted: true, at: past(), by: BARBER });
    await setDoc(doc(d, `shops/${SHOP}/audit/a1`), { action: 'x', path: 'p', by: OWNER, at: past(), changedFields: {} });
    await setDoc(doc(d, `shops/${SHOP}/dailyStats/2026-10-25`), { consultations: 1, updatedAt: past(), updatedBy: BARBER });
  });
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-lihya',
    firestore: { rules: RULES, host, port: Number(port) },
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// ------------------------------------------------------------------ bootstrap

describe('bootstrap: Create your shop', () => {
  it('allows the real one-batch seed (shop, owner, info, styles, demo, stats, audit)', async () => {
    const d = env.authenticatedContext('creator', token('creator@lihya.test')).firestore();
    const ops = [
      ...shopOps({ shopId: 'new1', uid: 'creator', ownerName: 'Creator', ownerEmail: 'creator@lihya.test', name: 'New Shop', nameAr: 'محل جديد', whatsapp: '91234567', styles: STYLES }),
      ...demoOps({ shopId: 'new1', uid: 'creator', styles: STYLES }).ops,
      auditOp('new1', 'creator', { action: 'shop.create', path: 'shops/new1', changedFields: { name: [null, 'New Shop'] } }),
    ];
    expect(ops.length).toBeLessThan(500);
    await assertSucceeds(applyOps(writeBatch(d), d, ops).commit());
    const staff = await getDoc(doc(d, 'shops/new1/staff/creator'));
    expect(staff.data().role).toBe('owner');
    const products = await getDocs(collection(d, 'shops/new1/products'));
    expect(products.size).toBe(0);
  });

  it('denies a shop whose createdBy is someone else', async () => {
    const d = as.outsider();
    await assertFails(setDoc(doc(d, 'shops/x'), { ...shopData(), createdBy: OWNER, createdAt: serverTimestamp() }));
  });

  it('denies an anonymous visitor creating a shop', async () => {
    const d = as.anon();
    await assertFails(setDoc(doc(d, 'shops/x'), { ...shopData(), createdBy: ANON, createdAt: serverTimestamp() }));
  });

  it('denies an owner staff doc in a shop I did not create', async () => {
    await seed();
    const d = as.outsider();
    await assertFails(setDoc(doc(d, `shops/${SHOP}/staff/${OUTSIDER}`), { ...staffData(OUTSIDER, 'owner'), createdAt: serverTimestamp() }));
  });

  it('allows the creator to add their own owner doc after creating the shop', async () => {
    const d = env.authenticatedContext('creator', token('creator@lihya.test')).firestore();
    await assertSucceeds(setDoc(doc(d, 'shops/two'), { ...shopData(), createdBy: 'creator', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(d, 'shops/two/staff/creator'), { ...staffData('creator', 'owner'), createdAt: serverTimestamp() }));
  });

  it('denies settings outside the allowed ranges', async () => {
    const d = as.outsider();
    const bad = shopData({ createdBy: OUTSIDER, createdAt: serverTimestamp() });
    bad.settings = { ...bad.settings, aiDailyCap: 500 };
    await assertFails(setDoc(doc(d, 'shops/x'), bad));
  });
});

// ------------------------------------------------------------------ joining

describe('joining with an invite', () => {
  it("allows a verified invitee to join with the invite's role (and remove the invite)", async () => {
    await seed();
    const d = as.joiner();
    const b = writeBatch(d);
    b.set(doc(d, `shops/${SHOP}/staff/${JOINER}`), {
      uid: JOINER, name: 'New', email: 'new.barber@lihya.test', role: 'barber', active: true, createdAt: serverTimestamp(), createdBy: JOINER,
    });
    b.delete(doc(d, `shops/${SHOP}/invites/new.barber@lihya.test`));
    await assertSucceeds(b.commit());
  });

  it('denies joining with a different role than the invite', async () => {
    await seed();
    const d = as.joiner();
    await assertFails(setDoc(doc(d, `shops/${SHOP}/staff/${JOINER}`), {
      uid: JOINER, name: 'New', email: 'new.barber@lihya.test', role: 'manager', active: true, createdAt: serverTimestamp(), createdBy: JOINER,
    }));
  });

  it('denies joining with an unverified email', async () => {
    await seed();
    const d = as.joiner({ verified: false });
    await assertFails(setDoc(doc(d, `shops/${SHOP}/staff/${JOINER}`), {
      uid: JOINER, name: 'New', email: 'new.barber@lihya.test', role: 'barber', active: true, createdAt: serverTimestamp(), createdBy: JOINER,
    }));
  });

  it('denies joining without an invite', async () => {
    await seed();
    const d = as.outsider();
    await assertFails(setDoc(doc(d, `shops/${SHOP}/staff/${OUTSIDER}`), { ...staffData(OUTSIDER, 'barber'), createdAt: serverTimestamp() }));
  });

  it('lets the invitee read their invite but not someone else', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as.joiner(), `shops/${SHOP}/invites/new.barber@lihya.test`)));
    await assertFails(getDoc(doc(as.outsider(), `shops/${SHOP}/invites/new.barber@lihya.test`)));
  });
});

// ------------------------------------------------------------------ invites

describe('invites', () => {
  const invite = (uid, role = 'barber') => ({ email: 'pal@lihya.test', role, createdAt: serverTimestamp(), createdBy: uid });

  it('allows the owner to invite a barber', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.owner(), `shops/${SHOP}/invites/pal@lihya.test`), invite(OWNER)));
  });

  it('denies a manager inviting', async () => {
    await seed();
    await assertFails(setDoc(doc(as.manager(), `shops/${SHOP}/invites/pal@lihya.test`), invite(MANAGER)));
  });

  it('denies an invite with the owner role', async () => {
    await seed();
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/invites/pal@lihya.test`), invite(OWNER, 'owner')));
  });

  it('denies an invite id that is not the lower-case email', async () => {
    await seed();
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/invites/Pal@lihya.test`), { ...invite(OWNER), email: 'Pal@lihya.test' }));
  });

  it('allows the owner to list invites, denies a barber', async () => {
    await seed();
    await assertSucceeds(getDocs(collection(as.owner(), `shops/${SHOP}/invites`)));
    await assertFails(getDocs(collection(as.barber(), `shops/${SHOP}/invites`)));
  });
});

// ------------------------------------------------------------------ shops

describe('shops', () => {
  it('allows staff to read the shop', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as.barber(), `shops/${SHOP}`)));
  });

  it('denies a non-member and a deactivated barber', async () => {
    await seed();
    await assertFails(getDoc(doc(as.outsider(), `shops/${SHOP}`)));
    await assertFails(getDoc(doc(as.off(), `shops/${SHOP}`)));
  });

  it('allows the owner to change settings', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as.owner(), `shops/${SHOP}`), { 'settings.aiPreview': true, updatedAt: serverTimestamp(), updatedBy: OWNER }));
  });

  it('denies a manager changing settings', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.manager(), `shops/${SHOP}`), { 'settings.aiPreview': true, updatedAt: serverTimestamp(), updatedBy: MANAGER }));
  });

  it('denies the owner changing createdBy', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.owner(), `shops/${SHOP}`), { createdBy: MANAGER, updatedAt: serverTimestamp(), updatedBy: OWNER }));
  });
});

// ------------------------------------------------------------------ staff

describe('staff', () => {
  const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });

  it('allows the owner to change a barber role', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as.owner(), `shops/${SHOP}/staff/${BARBER}`), { role: 'manager', ...stamp(OWNER) }));
  });

  it('denies the owner changing their own role', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.owner(), `shops/${SHOP}/staff/${OWNER}`), { role: 'barber', ...stamp(OWNER) }));
  });

  it('denies the owner deactivating themselves', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.owner(), `shops/${SHOP}/staff/${OWNER}`), { active: false, ...stamp(OWNER) }));
  });

  it('denies a barber promoting themselves', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.barber(), `shops/${SHOP}/staff/${BARBER}`), { role: 'owner', ...stamp(BARBER) }));
  });

  it('allows the owner to deactivate a barber', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as.owner(), `shops/${SHOP}/staff/${BARBER}`), { active: false, ...stamp(OWNER) }));
  });

  it('allows staff to list staff; a deactivated barber reads only their own doc', async () => {
    await seed();
    await assertSucceeds(getDocs(collection(as.barber(), `shops/${SHOP}/staff`)));
    await assertSucceeds(getDoc(doc(as.off(), `shops/${SHOP}/staff/${OFF}`)));
    await assertFails(getDocs(collection(as.off(), `shops/${SHOP}/staff`)));
  });

  it('allows the shop picker collection-group query on my uid, denies on another uid', async () => {
    await seed();
    await assertSucceeds(getDocs(query(collectionGroup(as.barber(), 'staff'), where('uid', '==', BARBER))));
    await assertFails(getDocs(query(collectionGroup(as.barber(), 'staff'), where('uid', '==', OWNER))));
  });
});

// ------------------------------------------------------------------ public info + styles

describe('public info and styles', () => {
  it('allows anyone to read public info while Try at home is on', async () => {
    await seed({ tryAtHome: true });
    await assertSucceeds(getDoc(doc(as.nobody(), `shops/${SHOP}/public/info`)));
  });

  it('denies public info to the public when Try at home is off (staff still read it)', async () => {
    await seed({ tryAtHome: false });
    await assertFails(getDoc(doc(as.nobody(), `shops/${SHOP}/public/info`)));
    await assertSucceeds(getDoc(doc(as.barber(), `shops/${SHOP}/public/info`)));
  });

  it('denies any other doc under public/', async () => {
    await seed();
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/public/extra`), {
      name: 'x', tryAtHome: true, updatedAt: serverTimestamp(), updatedBy: OWNER,
    }));
  });

  it('allows the owner to write public info, denies a manager', async () => {
    await seed();
    const data = { name: 'Brass Chair', nameAr: 'الكرسي', tryAtHome: false, whatsapp: '', updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as.owner(), `shops/${SHOP}/public/info`), { ...data, updatedBy: OWNER }));
    await assertFails(setDoc(doc(as.manager(), `shops/${SHOP}/public/info`), { ...data, updatedBy: MANAGER }));
  });

  it('allows a public query of non-hidden styles when Try at home is on', async () => {
    await seed({ tryAtHome: true });
    const snap = await assertSucceeds(getDocs(query(collection(as.nobody(), `shops/${SHOP}/styles`), where('hidden', '==', false))));
    expect(snap.docs.map((d) => d.id)).toEqual(['goatee']);
  });

  it('denies the public style query when Try at home is off', async () => {
    await seed({ tryAtHome: false });
    await assertFails(getDocs(query(collection(as.nobody(), `shops/${SHOP}/styles`), where('hidden', '==', false))));
  });

  it('denies the public reading hidden styles or the whole catalog', async () => {
    await seed({ tryAtHome: true });
    await assertFails(getDoc(doc(as.nobody(), `shops/${SHOP}/styles/secret`)));
    await assertFails(getDocs(collection(as.nobody(), `shops/${SHOP}/styles`)));
  });

  it('allows staff to read hidden styles', async () => {
    await seed();
    await assertSucceeds(getDocs(collection(as.barber(), `shops/${SHOP}/styles`)));
  });

  it('allows a manager to hide a style, denies a barber', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as.manager(), `shops/${SHOP}/styles/goatee`), { hidden: true, updatedAt: serverTimestamp(), updatedBy: MANAGER }));
    await assertFails(updateDoc(doc(as.barber(), `shops/${SHOP}/styles/goatee`), { hidden: false, updatedAt: serverTimestamp(), updatedBy: BARBER }));
  });

  it('denies a style whose hidden flag is not a boolean', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.owner(), `shops/${SHOP}/styles/goatee`), { hidden: 'no', updatedAt: serverTimestamp(), updatedBy: OWNER }));
  });
});

// ------------------------------------------------------------------ products

describe('products', () => {
  const product = (uid, extra = {}) => ({
    name: 'Balm', nameAr: 'بلسم', category: 'balm', priceOmr: 2.75, active: true,
    createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp(), updatedBy: uid, ...extra,
  });

  it('allows staff to read products, denies outsiders', async () => {
    await seed();
    await assertSucceeds(getDocs(collection(as.barber(), `shops/${SHOP}/products`)));
    await assertFails(getDocs(collection(as.outsider(), `shops/${SHOP}/products`)));
  });

  it('allows a manager to add a product, denies a barber', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.manager(), `shops/${SHOP}/products/p2`), product(MANAGER)));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/products/p3`), product(BARBER)));
  });

  it('denies an unknown category or a negative price', async () => {
    await seed();
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/products/p4`), product(OWNER, { category: 'snacks' })));
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/products/p5`), product(OWNER, { priceOmr: -1 })));
  });
});

// ------------------------------------------------------------------ clients

describe('clients', () => {
  it('allows staff to create a client with honest stamps', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.barber(), `shops/${SHOP}/clients/c2`), clientData(BARBER)));
  });

  it('denies a spoofed createdBy', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/clients/c2`), clientData(BARBER, { createdBy: OWNER })));
  });

  it('denies a createdAt that is not the server time', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/clients/c2`), clientData(BARBER, { createdAt: past() })));
  });

  it('denies extra keys (no images, no raw measures)', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/clients/c2`), clientData(BARBER, { photo: 'data:image/png;base64,AAAA' })));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/clients/c3`), clientData(BARBER, {
      profile: { faceShape: 'oval', mst: 5, undertone: 'warm', ageBand: '25-34', growability: 70, jawRatio: 0.82 },
    })));
  });

  it('denies a barber creating demo records', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/clients/c2`), clientData(BARBER, { demo: true })));
  });

  it('denies outsiders and anonymous visitors', async () => {
    await seed();
    await assertFails(getDoc(doc(as.outsider(), `shops/${SHOP}/clients/c1`)));
    await assertFails(setDoc(doc(as.anon(), `shops/${SHOP}/clients/c9`), clientData(ANON)));
  });

  it('allows an update with updatedBy/updatedAt, denies changing createdBy', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), {
      profile: { faceShape: 'square', mst: 6, undertone: 'olive', ageBand: '35-44', growability: 60 },
      consent: { profile: true, at: serverTimestamp(), by: BARBER },
      updatedAt: serverTimestamp(), updatedBy: BARBER,
    }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), { createdBy: BARBER + 'x', updatedAt: serverTimestamp(), updatedBy: BARBER }));
  });

  it('denies an update without updatedBy == me', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.barber(), `shops/${SHOP}/clients/c1`), { displayName: 'X', displayNameLower: 'x', updatedAt: serverTimestamp(), updatedBy: OWNER }));
  });

  it('allows a manager to delete demo clients but not real ones; denies a barber', async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(as.manager(), `shops/${SHOP}/clients/demo1`)));
    await assertFails(deleteDoc(doc(as.manager(), `shops/${SHOP}/clients/c1`)));
    await assertFails(deleteDoc(doc(as.barber(), `shops/${SHOP}/clients/c1`)));
  });

  it('allows the recent-clients query with a limit', async () => {
    await seed();
    await assertSucceeds(getDocs(query(collection(as.barber(), `shops/${SHOP}/clients`), limit(20))));
  });
});

// ------------------------------------------------------------------ consultations

describe('consultations', () => {
  it('allows staff to create a draft', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k2`), consultationData(BARBER)));
  });

  it('denies decisionSeconds out of range', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k2`), consultationData(BARBER, { decisionSeconds: 3601 })));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k3`), consultationData(BARBER, { decisionSeconds: -1 })));
  });

  it('denies an unknown status, a bad dayKey and extra keys', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k2`), consultationData(BARBER, { status: 'paid' })));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k3`), consultationData(BARBER, { dayKey: '25/10/2026' })));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k4`), consultationData(BARBER, { price: 5 })));
  });

  it('denies a consultation in someone else\'s name', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consultations/k2`), consultationData(BARBER, { barberUid: OWNER })));
  });

  it('allows approval with decision seconds, denies changing createdAt', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), {
      status: 'approved', approvedAt: serverTimestamp(), decisionSeconds: 3600,
      cutCard: { zonesMm: { C: 15 }, guards: { C: '3' } }, updatedAt: serverTimestamp(), updatedBy: BARBER,
    }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), { createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: BARBER }));
  });

  it('denies anonymous visitors and deactivated staff', async () => {
    await seed();
    await assertFails(getDocs(collection(as.anon(), `shops/${SHOP}/consultations`)));
    await assertFails(setDoc(doc(as.off(), `shops/${SHOP}/consultations/k9`), consultationData(OFF)));
  });

  it('allows the owner to delete a real consultation (retention), denies a manager', async () => {
    await seed();
    await assertFails(deleteDoc(doc(as.manager(), `shops/${SHOP}/consultations/k1`)));
    await assertSucceeds(deleteDoc(doc(as.owner(), `shops/${SHOP}/consultations/k1`)));
  });

  it('allows the owner to delete demo consultations, denies a barber', async () => {
    await seed();
    await assertFails(deleteDoc(doc(as.barber(), `shops/${SHOP}/consultations/kdemo`)));
    await assertSucceeds(deleteDoc(doc(as.owner(), `shops/${SHOP}/consultations/kdemo`)));
  });

  it('allows the dashboard day-range query for staff', async () => {
    await seed();
    const q = query(collection(as.manager(), `shops/${SHOP}/consultations`), where('dayKey', '>=', '2026-10-19'), where('dayKey', '<=', '2026-10-25'));
    await assertSucceeds(getDocs(q));
  });
});

// ------------------------------------------------------------------ look codes

describe('look codes', () => {
  it('allows an anonymous visitor to create a code while Try at home is on', async () => {
    await seed({ tryAtHome: true });
    await assertSucceeds(setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/XYZ789`), lookCodeData(ANON)));
  });

  it('denies a code expiring after 31 days', async () => {
    await seed();
    await assertFails(setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/XYZ789`), lookCodeData(ANON, { expiresAt: inDays(40) })));
  });

  it('denies extra keys (no photo) and a code outside the alphabet', async () => {
    await seed();
    await assertFails(setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/XYZ789`), lookCodeData(ANON, { photo: 'x' })));
    await assertFails(setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/OIO101`), lookCodeData(ANON)));
  });

  it('denies a signed-out visitor and a shop with Try at home off', async () => {
    await seed({ tryAtHome: false });
    await assertFails(setDoc(doc(as.nobody(), `shops/${SHOP}/lookCodes/XYZ789`), lookCodeData('nobody')));
    await assertFails(setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/XYZ789`), lookCodeData(ANON)));
  });

  it('denies overwriting an existing code (collision)', async () => {
    await seed();
    await assertFails(setDoc(doc(as.anon2(), `shops/${SHOP}/lookCodes/ABC234`), lookCodeData(ANON2)));
  });

  it('lets the creator and staff read a code, not another visitor', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/ABC234`)));
    await assertSucceeds(getDoc(doc(as.barber(), `shops/${SHOP}/lookCodes/ABC234`)));
    await assertFails(getDoc(doc(as.anon2(), `shops/${SHOP}/lookCodes/ABC234`)));
  });

  it('allows staff to mark a code used, denies the anonymous creator', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as.barber(), `shops/${SHOP}/lookCodes/ABC234`), { usedAt: serverTimestamp(), usedBy: BARBER }));
    await assertFails(updateDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/ABC234`), { usedAt: serverTimestamp(), usedBy: ANON }));
  });

  it('denies staff changing the style of a code', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.barber(), `shops/${SHOP}/lookCodes/ABC234`), { styleId: 'other', usedAt: serverTimestamp(), usedBy: BARBER }));
  });
});

// ------------------------------------------------------------------ consents + audit

describe('consents and audit (create only)', () => {
  it('allows staff to log a consent', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.barber(), `shops/${SHOP}/consents/x2`), {
      type: 'ai_render', clientId: null, granted: false, at: serverTimestamp(), by: BARBER,
    }));
  });

  it('denies a consent of an unknown type or in another name', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consents/x2`), { type: 'photo', clientId: null, granted: true, at: serverTimestamp(), by: BARBER }));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/consents/x3`), { type: 'ai_render', clientId: null, granted: true, at: serverTimestamp(), by: OWNER }));
  });

  it('denies changing or deleting a consent, even for the owner', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.owner(), `shops/${SHOP}/consents/x1`), { granted: false }));
    await assertFails(deleteDoc(doc(as.owner(), `shops/${SHOP}/consents/x1`)));
  });

  it('allows an owner audit entry, denies a spoofed author', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.owner(), `shops/${SHOP}/audit/a2`), {
      action: 'settings.update', path: `shops/${SHOP}`, by: OWNER, at: serverTimestamp(), changedFields: { 'settings.aiPreview': [false, true] },
    }));
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/audit/a3`), {
      action: 'settings.update', path: `shops/${SHOP}`, by: MANAGER, at: serverTimestamp(), changedFields: {},
    }));
  });

  it('denies changing or deleting an audit entry', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.owner(), `shops/${SHOP}/audit/a1`), { action: 'y' }));
    await assertFails(deleteDoc(doc(as.owner(), `shops/${SHOP}/audit/a1`)));
  });

  it('lets the owner read the audit log, not a barber', async () => {
    await seed();
    await assertSucceeds(getDocs(collection(as.owner(), `shops/${SHOP}/audit`)));
    await assertFails(getDocs(collection(as.barber(), `shops/${SHOP}/audit`)));
  });
});

// ------------------------------------------------------------------ daily stats

describe('dailyStats', () => {
  it('allows staff increments with allowed keys', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.barber(), `shops/${SHOP}/dailyStats/2026-10-25`), {
      consultations: increment(1), approvals: increment(1), topStyles: { goatee: increment(1) }, updatedAt: serverTimestamp(), updatedBy: BARBER,
    }, { merge: true }));
  });

  it('denies extra keys, a bad day key and outsiders', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/dailyStats/2026-10-25`), {
      revenue: increment(5), updatedAt: serverTimestamp(), updatedBy: BARBER,
    }, { merge: true }));
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/dailyStats/today`), {
      consultations: increment(1), updatedAt: serverTimestamp(), updatedBy: BARBER,
    }, { merge: true }));
    await assertFails(setDoc(doc(as.outsider(), `shops/${SHOP}/dailyStats/2026-10-25`), {
      consultations: increment(1), updatedAt: serverTimestamp(), updatedBy: OUTSIDER,
    }, { merge: true }));
  });
});

// ------------------------------------------------------------------ demo data round trip

describe('demo data', () => {
  it('lets the owner delete every demo doc and reverse its stats in one batch', async () => {
    const uid = 'creator';
    const d = env.authenticatedContext(uid, token('creator@lihya.test')).firestore();
    const demo = demoOps({ shopId: 'new1', uid, styles: STYLES });
    await assertSucceeds(applyOps(writeBatch(d), d, [
      ...shopOps({ shopId: 'new1', uid, ownerName: 'C', ownerEmail: 'creator@lihya.test', name: 'N', nameAr: 'ن', styles: STYLES }),
      ...demo.ops,
    ]).commit());
    const cons = (await getDocs(query(collection(d, 'shops/new1/consultations'), where('demo', '==', true)))).docs.map((x) => x.data());
    const clients = (await getDocs(query(collection(d, 'shops/new1/clients'), where('demo', '==', true)))).docs;
    expect(cons).toHaveLength(8);
    expect(clients).toHaveLength(3);
    const ops = [
      ...clients.map((c) => ({ path: c.ref.path, delete: true })),
      ...demo.consultationIds.map((id) => ({ path: `shops/new1/consultations/${id}`, delete: true })),
      ...Object.entries(reverseStats(cons)).map(([key, deltas]) => statsOp('new1', key, deltas, uid)),
      auditOp('new1', uid, { action: 'demo.delete', path: 'shops/new1', changedFields: { demoClients: [3, 0] } }),
    ];
    await assertSucceeds(applyOps(writeBatch(d), d, ops).commit());
    const stats = await getDocs(collection(d, 'shops/new1/dailyStats'));
    for (const s of stats.docs) {
      expect(s.data().consultations).toBe(0);
      expect(s.data().approvals ?? 0).toBe(0);
      expect(s.data().totalDecisionSeconds ?? 0).toBe(0);
    }
  });
});

// ------------------------------------------------------------------ review fixes

const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(200 * 1024);

// A full look as the Studio makes it (clampParams of a catalog style), stored the
// way the services store it (sanitizeParams).
function fullParams(styleId = 'goatee') {
  const style = STYLES.find((x) => x.id === styleId) || STYLES[0];
  return sanitizeParams(clampParams({ ...paramsFromStyle(style), presetId: 'eid-lineup' }));
}

describe('shop creation needs a verified email (SEC-08)', () => {
  it('denies an unverified password account creating a shop', async () => {
    const d = env.authenticatedContext('pw1', token('pw@lihya.test', { verified: false, provider: 'password' })).firestore();
    await assertFails(setDoc(doc(d, 'shops/pw-shop'), { ...shopData(), createdBy: 'pw1', createdAt: serverTimestamp() }));
  });

  it('allows a verified account', async () => {
    const d = env.authenticatedContext('pw2', token('pw2@lihya.test', { verified: true, provider: 'password' })).firestore();
    await assertSucceeds(setDoc(doc(d, 'shops/pw-shop2'), { ...shopData(), createdBy: 'pw2', createdAt: serverTimestamp() }));
  });
});

describe('look codes hold bounded style parameters only (SEC-01)', () => {
  const create = (params, code = 'XYZ789') =>
    setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/${code}`), lookCodeData(ANON, { params }));

  it('allows a full look as the app stores it', async () => {
    await seed();
    await assertSucceeds(create(fullParams()));
  });

  it('denies a data: image, a thumbnail or any unknown key', async () => {
    await seed();
    await assertFails(create({ ...fullParams(), thumb: BIG }, 'XYZ781'));
    await assertFails(create({ ...fullParams(), colorId: BIG }, 'XYZ782'));
    await assertFails(create({ ...fullParams(), extra: 1 }, 'XYZ783'));
  });

  it('denies lengths out of range and unknown zones', async () => {
    await seed();
    await assertFails(create({ ...fullParams(), zones: { ...fullParams().zones, C: 1e9 } }, 'XYZ784'));
    await assertFails(create({ ...fullParams(), zones: { C: -1 } }, 'XYZ785'));
    await assertFails(create({ ...fullParams(), zones: { X: 3 } }, 'XYZ786'));
    await assertFails(create({ ...fullParams(), zones: { C: '15' } }, 'XYZ787'));
  });

  it('denies malformed lines, finish, shape and numbers', async () => {
    await seed();
    await assertFails(create({ ...fullParams(), lines: 7 }, 'XYZ788'));
    await assertFails(create({ ...fullParams(), lines: { cheek: 'low', evil: 'x' } }, 'XYZ789'));
    await assertFails(create({ ...fullParams(), lines: { cheekOffset: 5 } }, 'XYZ78A'));
    await assertFails(create({ ...fullParams(), finish: {} }, 'XYZ78B'));
    await assertFails(create({ ...fullParams(), shape: { chin: 'round', blob: BIG } }, 'XYZ78C'));
    await assertFails(create({ ...fullParams(), shape: { fadeB: [BIG, 2] } }, 'XYZ78D'));
    await assertFails(create({ ...fullParams(), greyTarget: 500 }, 'XYZ78E'));
    await assertFails(create({ ...fullParams(), styleId: 'x y' }, 'XYZ78F'));
  });

  it('denies a code whose style id is not an id', async () => {
    await seed();
    await assertFails(setDoc(doc(as.anon(), `shops/${SHOP}/lookCodes/XYZ79A`), lookCodeData(ANON, { styleId: '<b>x</b>' })));
  });
});

describe('dailyStats only go up for barbers (SEC-04)', () => {
  const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });
  const statsDoc = `shops/${SHOP}/dailyStats/2026-10-25`;

  it('denies a barber overwriting counters with lower or negative values', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), statsDoc), { consultations: 0, approvals: 999, ...stamp(BARBER) }));
    await assertFails(setDoc(doc(as.barber(), statsDoc), { aiRenders: increment(-50), ...stamp(BARBER) }, { merge: true }));
    await assertFails(setDoc(doc(as.barber(), statsDoc), { consultations: increment(-1), ...stamp(BARBER) }, { merge: true }));
  });

  it('denies huge, fractional or oversized values', async () => {
    await seed();
    await assertFails(setDoc(doc(as.barber(), `shops/${SHOP}/dailyStats/2099-01-01`), { aiRenders: 1e9, ...stamp(BARBER) }));
    await assertFails(setDoc(doc(as.barber(), statsDoc), { approvals: increment(0.5), ...stamp(BARBER) }, { merge: true }));
    const topStyles = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`s${i}`, 1]));
    await assertFails(setDoc(doc(as.barber(), statsDoc), { topStyles, ...stamp(BARBER) }, { merge: true }));
  });

  it('allows a manager to take numbers out, never below zero', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.manager(), statsDoc), { consultations: increment(-1), ...stamp(MANAGER) }, { merge: true }));
    await assertFails(setDoc(doc(as.manager(), statsDoc), { consultations: increment(-1), ...stamp(MANAGER) }, { merge: true }));
  });
});

describe('consultations: bounded look, honest Cut Card, counted once (SEC-05, F1, F11)', () => {
  const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });
  const card = () =>
    compactCutCard({
      zonesMm: { C: 15, K_L: 0 },
      guards: { C: '4', K_L: 'shave' },
      cheekLineMm: 22,
      necklineMm: 30,
      notes: { K_L: 'cutcard.scissorKeep' },
      safetyFlags: ['patchTest48h'],
    });
  const approveData = (extra = {}) => ({
    status: 'approved', approvedAt: serverTimestamp(), decisionSeconds: 90, params: fullParams(), styleId: 'goatee',
    cutCard: card(), ...stamp(BARBER), ...extra,
  });
  const commit = (d, ops) => applyOps(writeBatch(d), d, ops).commit();
  const countOps = () => approvalCountOps(SHOP, 'k1', { dayKey: '2026-10-25', seconds: 90, styleId: 'goatee', uid: BARBER });

  it('allows the real approval data, denies an image in params or the Cut Card', async () => {
    await seed();
    const d = as.barber();
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData({ params: { ...fullParams(), thumb: BIG } })));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData({ cutCard: { ...card(), photo: BIG } })));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData({ cutCard: { ...card(), notes: { C: BIG } } })));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData({ cutCard: { ...card(), safetyFlags: [BIG] } })));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData({ addOns: [BIG] })));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData()));
  });

  it('counts an approval once: the second count batch is refused as a whole', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(commit(d, countOps()));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData()));
    // Reload + approve again: a new count batch, then the data.
    await assertFails(commit(d, countOps()));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData({ decisionSeconds: 169 })));
    const stats = (await getDoc(doc(d, `shops/${SHOP}/dailyStats/2026-10-25`))).data();
    expect(stats.approvals).toBe(1);
    expect(stats.totalDecisionSeconds).toBe(90);
    expect(stats.topStyles.goatee).toBe(1);
  });

  it('does not count a consultation approved before the flag existed', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData()));
    await assertFails(commit(d, countOps()));
  });

  it('counts add-ons once, at the first done', async () => {
    await seed();
    const d = as.barber();
    const addOns = () => addOnsCountOps(SHOP, 'k1', { dayKey: '2026-10-25', count: 2, uid: BARBER });
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData()));
    await assertSucceeds(commit(d, addOns()));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), { status: 'done', addOns: ['p1', 'p2'], rating: 5, ...stamp(BARBER) }));
    await assertFails(commit(d, addOns()));
  });

  it('cancels a draft, never an approved consultation', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), approveData()));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/consultations/k1`), { status: 'cancelled', ...stamp(BARBER) }));
    await assertSucceeds(setDoc(doc(d, `shops/${SHOP}/consultations/k5`), consultationData(BARBER)));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/consultations/k5`), { status: 'cancelled', ...stamp(BARBER) }));
  });
});

describe('clients: consent is honest, labels only with consent (SEC-05)', () => {
  const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });
  const labels = { faceShape: 'oval', mst: 5, undertone: 'warm', ageBand: '25-34', growability: 70 };

  it("denies consent in the owner's name or with a past date", async () => {
    await seed();
    const d = as.barber();
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), { consent: { profile: true, by: OWNER, at: past() }, ...stamp(BARBER) }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), { consent: { profile: true, by: BARBER, at: past() }, ...stamp(BARBER) }));
    await assertFails(setDoc(doc(d, `shops/${SHOP}/clients/c7`), clientData(BARBER, { consent: { profile: true, by: OWNER, at: past() } })));
  });

  it('denies profile labels without consent', async () => {
    await seed();
    await assertFails(updateDoc(doc(as.barber(), `shops/${SHOP}/clients/c1`), { profile: labels, ...stamp(BARBER) }));
    await assertFails(updateDoc(doc(as.barber(), `shops/${SHOP}/clients/c1`), {
      profile: labels, consent: { profile: false, by: BARBER, at: serverTimestamp() }, ...stamp(BARBER),
    }));
  });

  it('allows the real visit record, denies blobs in it', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), {
      lastLengths: { zonesMm: { C: 15, M: 6 }, at: Timestamp.now() }, lastVisitAt: Timestamp.now(), ...stamp(BARBER),
    }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), {
      lastLengths: { zonesMm: BIG, at: Timestamp.now() }, ...stamp(BARBER),
    }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/clients/c1`), {
      lastLengths: { zonesMm: { C: 15, photo: 1 }, at: Timestamp.now() }, ...stamp(BARBER),
    }));
  });

  it('allows the visit record on a client with every field set (profile, consent, tokens)', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `shops/${SHOP}/clients/full`), {
        ...clientData(BARBER, { createdAt: past() }),
        displayName: 'Abdulrahman Mohammed Al Mahrouqi',
        ...clientSearchFields('Abdulrahman Mohammed Al Mahrouqi', '+96891234567'),
        consent: { profile: true, at: past(), by: BARBER },
        profile: labels,
        growthMmPerDay: 0.4,
        lastLengths: { zonesMm: { M: 6, S: 10, C: 15, J_L: 8, J_R: 8, K_L: 6, K_R: 6, B_L: 4, B_R: 4, N: 0 }, at: past() },
      });
    });
    await assertSucceeds(updateDoc(doc(as.barber(), `shops/${SHOP}/clients/full`), {
      lastLengths: { zonesMm: { M: 5, S: 9, C: 14, J_L: 7, J_R: 7, K_L: 5, K_R: 5, B_L: 3, B_R: 3, N: 0 }, at: Timestamp.now() },
      lastVisitAt: Timestamp.now(), growthMmPerDay: 0.45, ...stamp(BARBER),
    }));
    await assertSucceeds(updateDoc(doc(as.barber(), `shops/${SHOP}/clients/full`), {
      profile: { ...labels, mst: 6 }, consent: { profile: true, at: serverTimestamp(), by: BARBER }, ...stamp(BARBER),
    }));
  });

  it('allows search tokens, denies oversized ones', async () => {
    await seed();
    const d = as.barber();
    await assertSucceeds(setDoc(doc(d, `shops/${SHOP}/clients/c8`), clientData(BARBER, {
      displayName: 'Hamad Al Balushi', ...clientSearchFields('Hamad Al Balushi', '+96891234567'),
    })));
    await assertFails(setDoc(doc(d, `shops/${SHOP}/clients/c9`), clientData(BARBER, { searchTokens: [BIG] })));
    await assertFails(setDoc(doc(d, `shops/${SHOP}/clients/c10`), clientData(BARBER, { phoneTokens: [{ digits: '1234' }] })));
  });

  it('finds a client by any word and by part of the phone', async () => {
    await seed();
    const d = as.barber();
    await setDoc(doc(d, `shops/${SHOP}/clients/c8`), clientData(BARBER, {
      displayName: 'Hamad Al Balushi', ...clientSearchFields('Hamad Al Balushi', '+96891234567'),
    }));
    const col = collection(d, `shops/${SHOP}/clients`);
    const byWord = await getDocs(query(col, where('searchTokens', 'array-contains', 'balushi'), limit(10)));
    expect(byWord.docs.map((x) => x.id)).toEqual(['c8']);
    const byDigits = await getDocs(query(col, where('phoneTokens', 'array-contains', '9123'), limit(10)));
    expect(byDigits.docs.map((x) => x.id)).toEqual(['c8']);
  });

  it('lets the owner find clients who never visited for the retention purge (SEC-11)', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `shops/${SHOP}/clients/imp1`), {
        ...clientData(OWNER), lastVisitAt: null, createdAt: Timestamp.fromMillis(Date.now() - 5 * 365 * 86400000),
      });
    });
    const q = query(collection(as.owner(), `shops/${SHOP}/clients`), where('lastVisitAt', '==', null), where('createdAt', '<', past()), limit(400));
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((x) => x.id)).toEqual(['imp1']);
    await assertSucceeds(deleteDoc(doc(as.owner(), `shops/${SHOP}/clients/imp1`)));
  });
});

describe('styles have the catalog shape (SEC-06)', () => {
  const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });

  it('denies a blob, a style without name or zones, and a non-text name', async () => {
    await seed();
    const d = as.manager();
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/styles/goatee`), { blob: BIG, ...stamp(MANAGER) }));
    await assertFails(setDoc(doc(d, `shops/${SHOP}/styles/junk`), {
      id: 'junk', hidden: false, order: -1e9, createdAt: serverTimestamp(), createdBy: MANAGER, ...stamp(MANAGER),
    }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/styles/goatee`), { name: 42, ...stamp(MANAGER) }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/styles/goatee`), { name: { en: BIG, ar: 'x' }, ...stamp(MANAGER) }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/styles/goatee`), { zones: { C: 1e6 }, ...stamp(MANAGER) }));
    await assertFails(updateDoc(doc(d, `shops/${SHOP}/styles/goatee`), { tags: [BIG], ...stamp(MANAGER) }));
  });

  it('allows a signature style as S16 creates it, and its edits', async () => {
    await seed();
    const d = as.manager();
    const base = STYLES.find((x) => x.id === 'goatee') || STYLES[0];
    const patch = sanitizeStylePatch({
      name: { en: 'House goatee', ar: 'غوتي المحل' },
      zones: { ...base.zones, C: 20 },
      lines: { cheek: 'low', neckline: '2f', sideburn: 'blended', edge: 'crisp', mustacheEdge: 'at' },
      faces: ['all'],
      trimDays: 5,
      localFit: 4,
      lengthClass: 'short',
      weights: null,
      zoneNote: 'C 20, S 10, rest 0',
    });
    const { id: _id, ...rest } = base;
    const data = styleData({ ...rest, ...patch, id: 'sig-goatee-abc123', hidden: false, signature: true, order: 91 });
    data.baseId = base.id;
    await assertSucceeds(setDoc(doc(d, `shops/${SHOP}/styles/sig-goatee-abc123`), {
      ...data, createdAt: serverTimestamp(), createdBy: MANAGER, ...stamp(MANAGER),
    }));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/styles/sig-goatee-abc123`), { ...patch, localFit: 2, ...stamp(MANAGER) }));
    await assertSucceeds(updateDoc(doc(d, `shops/${SHOP}/styles/goatee`), { order: 340, ...stamp(MANAGER) }));
  });
});

describe('public info carries the default language (PRD-01)', () => {
  const info = (uid, extra = {}) => ({
    name: 'Brass Chair', nameAr: 'الكرسي', tryAtHome: true, whatsapp: '', updatedAt: serverTimestamp(), updatedBy: uid, ...extra,
  });

  it('allows ar or en, denies anything else', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as.owner(), `shops/${SHOP}/public/info`), info(OWNER, { defaultLanguage: 'en' })));
    await assertFails(setDoc(doc(as.owner(), `shops/${SHOP}/public/info`), info(OWNER, { defaultLanguage: 'fr' })));
  });

  it('lets a customer read it without signing in', async () => {
    await seed();
    await setDoc(doc(as.owner(), `shops/${SHOP}/public/info`), info(OWNER, { defaultLanguage: 'en' }));
    const snap = await getDoc(doc(as.nobody(), `shops/${SHOP}/public/info`));
    expect(snap.data().defaultLanguage).toBe('en');
  });
});
