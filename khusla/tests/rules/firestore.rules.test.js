/**
 * Firestore security rules tests for KHUSLA (firestore.rules).
 *
 * Run with the emulator:  npm run test:rules
 *   = firebase emulators:exec --only firestore --project demo-khusla "vitest run tests/rules"
 *
 * Every rule has at least one allow and one deny case. Firestore is cleared and
 * re-seeded (with rules disabled) before each test.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT_ID = 'demo-khusla';

const S1 = 'salon-muscat'; // Try at home ON
const S2 = 'salon-sohar'; // Try at home OFF

const OWNER = 'alice';
const MANAGER = 'manny';
const STYLIST = 'sara';
const INACTIVE = 'ivy'; // stylist with active == false
const OUTSIDER = 'olivia'; // real user, not staff anywhere
const INVITEE = 'nadia'; // has an invite to S1 as stylist
const ANON = 'anon-1';
const ANON2 = 'anon-2';

const PAST = Timestamp.fromDate(new Date('2026-01-01T08:00:00Z'));
const DAY = 24 * 60 * 60 * 1000;
const CATALOGS = ['cuts', 'fringes', 'styles', 'shades', 'techniques', 'looks'];

let testEnv;

/** Real (non-anonymous) signed-in user with a verified email. */
function real(uid, email = `${uid}@example.com`, emailVerified = true) {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
}

/** Customer at home: Anonymous Auth. */
function anon(uid = ANON) {
  return testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
}

/** No auth at all (public landing page). */
function nobody() {
  return testEnv.unauthenticatedContext().firestore();
}

const created = (uid) => ({
  createdAt: serverTimestamp(),
  createdBy: uid,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
});
const touched = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });
const seeded = (uid) => ({ createdAt: PAST, createdBy: uid, updatedAt: PAST, updatedBy: uid });

const salonSettings = (over = {}) => ({
  privateMode: true,
  idleWipeMin: 5,
  aiPreview: false,
  aiDailyCap: 20,
  growthCmPerMonth: 1.25,
  retentionDays: 365,
  tryAtHome: true,
  ...over,
});

const salonData = (uid, over = {}) => ({
  name: 'Khusla Muscat',
  nameAr: 'خصلة مسقط',
  languages: ['ar', 'en'],
  timezone: 'Asia/Muscat',
  schemaVersion: 1,
  settings: salonSettings(),
  whatsapp: '+96891234567',
  ...created(uid),
  ...over,
});

const publicSalonData = (uid, over = {}) => ({
  name: 'Khusla Muscat',
  nameAr: 'خصلة مسقط',
  tryAtHome: true,
  whatsapp: '+96891234567',
  ...touched(uid),
  ...over,
});

const staffData = (uid, role, by, over = {}) => ({
  uid,
  name: `${uid} name`,
  email: `${uid}@example.com`,
  role,
  active: true,
  ...created(by),
  ...over,
});

const userData = (salonIds, over = {}) => ({
  salonIds,
  lastSalonId: salonIds[0] ?? null,
  updatedAt: serverTimestamp(),
  ...over,
});

const inviteData = (email, role, by, over = {}) => ({
  email,
  role,
  createdAt: serverTimestamp(),
  createdBy: by,
  ...over,
});

const catalogData = (uid, over = {}) => ({
  id: 'long-layers',
  name: { en: 'Long layers', ar: 'طبقات طويلة' },
  length: 'long',
  hidden: false,
  localFit: null,
  signature: false,
  ...touched(uid),
  ...over,
});

const swatchLineData = (uid, over = {}) => ({ name: 'Salon line A', ...created(uid), ...over });

const swatchData = (uid, over = {}) => ({
  code: '7.3',
  level: 7,
  tone: 'gold',
  labMeasured: [52.1, 8.4, 24.9],
  scannedAt: serverTimestamp(),
  scannedBy: uid,
  light: 'daylight',
  ...created(uid),
  ...over,
});

const productData = (uid, over = {}) => ({
  name: 'Balayage',
  nameAr: 'بالياج',
  category: 'color',
  priceOmr: 45.5,
  active: true,
  ...created(uid),
  ...over,
});

const clientData = (uid, over = {}) => ({
  displayName: 'Maryam A.',
  phone: '+96891234567',
  consent: { profile: true, at: serverTimestamp(), by: uid },
  profile: { faceShape: 'oval', mst: 5, undertone: 'warm', eyes: 'dark-brown', ageBand: '25-34' },
  hair: { rootLevel: 3, endsLevel: 5, greyPct: 10, texture: 'wavy', density: 'medium', lengthBand: 'shoulder' },
  history: { henna: 'none', recentColor: 'lighter', bleach: true, chemical: false },
  shrinkagePct: 10,
  growthCmPerMonth: 1.25,
  lastVisitAt: null,
  visits: 0,
  demo: false,
  ...created(uid),
  ...over,
});

const paramsData = (over = {}) => ({
  cutId: 'long-layers',
  fringeId: null,
  styleId: null,
  lengthCm: 40,
  shadeId: 'mocha-brown',
  shade2Id: null,
  swatchId: null,
  technique: 'balayage',
  techniqueParams: { start: 0.25, density: 0.6, softness: 0.6, level: 3 },
  finish: 'glossy',
  lightPreset: 'daylight',
  ...over,
});

const agreementData = (over = {}) => ({
  currentLengthCm: 45,
  lengthWetCm: 40,
  lengthDryCm: 36,
  shrinkagePct: 10,
  targetLevel: 7,
  targetTone: 'gold',
  process: 'lift-color',
  sessionsTotal: 2,
  sessionNumber: 1,
  todayLevel: 6,
  tests: ['strand', 'patch'],
  fillerLikely: false,
  priceItems: ['prod-1', 'prod-2'],
  addOnCount: 1,
  aftercareKeys: ['sulfate_free', 'wait_48h'],
  ...over,
});

const consultationData = (uid, over = {}) => ({
  clientId: 'client-1',
  stylistUid: uid,
  params: paramsData(),
  agreement: agreementData(),
  approvals: { customerAt: null, stylistAt: null, stylistUid: null },
  status: 'draft',
  decisionSeconds: 0,
  aiPreviewUsed: false,
  rating: null,
  nextVisitWeeks: null,
  notTodayShown: 0,
  source: 'chair',
  dayKey: '2026-10-25',
  demo: false,
  ...created(uid),
  ...over,
});

const lookCodeData = (uid, over = {}) => ({
  params: paramsData(),
  createdAt: serverTimestamp(),
  expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY),
  createdBy: uid,
  ...over,
});

const consentData = (uid, over = {}) => ({
  type: 'ai_render',
  clientId: 'client-1',
  consultationId: null,
  granted: true,
  at: serverTimestamp(),
  by: uid,
  ...over,
});

const auditData = (uid, over = {}) => ({
  action: 'client.update',
  path: `salons/${S1}/clients/client-1`,
  by: uid,
  at: serverTimestamp(),
  changedFields: { displayName: ['Maryam', 'Maryam A.'] },
  ...over,
});

/** Seed a realistic salon with rules disabled. */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const b = writeBatch(db);
    const p = (path) => doc(db, path);

    b.set(p(`salons/${S1}`), { ...salonData(OWNER), ...seeded(OWNER) });
    b.set(p(`salons/${S2}`), {
      ...salonData('bob'),
      settings: salonSettings({ tryAtHome: false }),
      ...seeded('bob'),
    });
    b.set(p(`publicSalons/${S1}`), { ...publicSalonData(OWNER), updatedAt: PAST });
    b.set(p(`publicSalons/${S2}`), { ...publicSalonData('bob', { tryAtHome: false }), updatedAt: PAST });

    b.set(p(`salons/${S1}/staff/${OWNER}`), { ...staffData(OWNER, 'owner', OWNER), ...seeded(OWNER) });
    b.set(p(`salons/${S1}/staff/${MANAGER}`), { ...staffData(MANAGER, 'manager', OWNER), ...seeded(OWNER) });
    b.set(p(`salons/${S1}/staff/${STYLIST}`), { ...staffData(STYLIST, 'stylist', OWNER), ...seeded(OWNER) });
    b.set(p(`salons/${S1}/staff/${INACTIVE}`), {
      ...staffData(INACTIVE, 'stylist', OWNER, { active: false }),
      ...seeded(OWNER),
    });
    b.set(p(`salons/${S1}/invites/${INVITEE}@example.com`), {
      ...inviteData(`${INVITEE}@example.com`, 'stylist', OWNER),
      createdAt: PAST,
    });
    b.set(p(`users/${OWNER}`), { ...userData([S1]), updatedAt: PAST });

    for (const c of CATALOGS) {
      b.set(p(`salons/${S1}/${c}/visible`), { ...catalogData(OWNER), updatedAt: PAST });
      b.set(p(`salons/${S1}/${c}/secret`), { ...catalogData(OWNER, { hidden: true }), updatedAt: PAST });
      b.set(p(`salons/${S2}/${c}/visible`), { ...catalogData('bob'), updatedAt: PAST });
    }

    b.set(p(`salons/${S1}/swatchLines/line-1`), { ...swatchLineData(OWNER), ...seeded(OWNER) });
    b.set(p(`salons/${S1}/swatchLines/line-1/swatches/sw-1`), {
      ...swatchData(OWNER),
      scannedAt: PAST,
      ...seeded(OWNER),
    });
    b.set(p(`salons/${S1}/products/prod-1`), { ...productData(OWNER), ...seeded(OWNER) });
    b.set(p(`salons/${S1}/clients/client-1`), {
      ...clientData(STYLIST),
      consent: { profile: true, at: PAST, by: STYLIST },
      ...seeded(STYLIST),
    });
    b.set(p(`salons/${S1}/consultations/consult-1`), { ...consultationData(STYLIST), ...seeded(STYLIST) });
    b.set(p(`salons/${S1}/consultations/draft-1`), {
      ...consultationData(STYLIST, { params: null, agreement: null, approvals: null }),
      ...seeded(STYLIST),
    });
    b.set(p(`salons/${S1}/lookCodes/ABC234`), { ...lookCodeData(ANON), createdAt: PAST });
    b.set(p(`salons/${S1}/consents/consent-1`), { ...consentData(STYLIST), at: PAST });
    b.set(p(`salons/${S1}/dailyStats/2026-10-25`), {
      consultations: 3,
      approvals: 2,
      topLooks: { 'long-layers': 2 },
      topShades: { 'mocha-brown': 1 },
      updatedAt: PAST,
    });
    b.set(p(`salons/${S1}/audit/audit-1`), { ...auditData(OWNER), at: PAST });
    await b.commit();
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

// ---------------------------------------------------------------------------
// 1. users/{uid}
// ---------------------------------------------------------------------------
describe('users/{uid}', () => {
  it('allows a user to read and write their own doc', async () => {
    const db = real(OUTSIDER);
    await assertSucceeds(setDoc(doc(db, `users/${OUTSIDER}`), userData([S1])));
    await assertSucceeds(getDoc(doc(db, `users/${OUTSIDER}`)));
    await assertSucceeds(
      updateDoc(doc(real(OWNER), `users/${OWNER}`), {
        salonIds: arrayUnion(S2),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies reading or writing another user doc', async () => {
    await assertFails(getDoc(doc(real(OUTSIDER), `users/${OWNER}`)));
    await assertFails(setDoc(doc(real(OUTSIDER), `users/${OWNER}`), userData([])));
  });

  it('denies unknown keys and a non-list salonIds', async () => {
    const db = real(OUTSIDER);
    await assertFails(setDoc(doc(db, `users/${OUTSIDER}`), userData([S1], { phone: '+96891234567' })));
    await assertFails(setDoc(doc(db, `users/${OUTSIDER}`), userData([S1], { salonIds: S1 })));
  });

  it('denies anonymous users a users doc', async () => {
    await assertFails(setDoc(doc(anon(), `users/${ANON}`), userData([])));
  });
});

// ---------------------------------------------------------------------------
// 2-4. Bootstrap batch: salon + owner staff + users + publicSalons
// ---------------------------------------------------------------------------
describe('bootstrap (salon + owner staff + users + publicSalons in one batch)', () => {
  function bootstrapBatch(db, uid, salonId, { salon = {}, staff = {}, pub = {} } = {}) {
    const b = writeBatch(db);
    b.set(doc(db, `salons/${salonId}`), salonData(uid, salon));
    b.set(doc(db, `salons/${salonId}/staff/${uid}`), staffData(uid, 'owner', uid, staff));
    b.set(doc(db, `users/${uid}`), userData([salonId]));
    b.set(doc(db, `publicSalons/${salonId}`), publicSalonData(uid, pub));
    return b.commit();
  }

  it('allows a real user to bootstrap a new salon in one batch', async () => {
    await assertSucceeds(bootstrapBatch(real(OUTSIDER), OUTSIDER, 'salon-new'));
    // ...and she is now staff of it.
    await assertSucceeds(getDoc(doc(real(OUTSIDER), 'salons/salon-new')));
  });

  it('denies an anonymous user creating a salon', async () => {
    await assertFails(setDoc(doc(anon(), 'salons/salon-anon'), salonData(ANON)));
    await assertFails(bootstrapBatch(anon(), ANON, 'salon-anon'));
  });

  it('denies bootstrapping with a non-owner role or an inactive owner doc', async () => {
    await assertFails(bootstrapBatch(real(OUTSIDER), OUTSIDER, 'salon-new', { staff: { role: 'manager' } }));
    await assertFails(bootstrapBatch(real(OUTSIDER), OUTSIDER, 'salon-new', { staff: { active: false } }));
  });

  it('denies claiming owner of an existing salon (no salon create in the batch)', async () => {
    const db = real(OUTSIDER);
    await assertFails(setDoc(doc(db, `salons/${S1}/staff/${OUTSIDER}`), staffData(OUTSIDER, 'owner', OUTSIDER)));
  });

  it('denies the owner staff doc as a separate later write (must be the same batch)', async () => {
    const db = real(OUTSIDER);
    await assertSucceeds(setDoc(doc(db, 'salons/salon-two-step'), salonData(OUTSIDER)));
    await assertFails(
      setDoc(doc(db, `salons/salon-two-step/staff/${OUTSIDER}`), staffData(OUTSIDER, 'owner', OUTSIDER)),
    );
  });

  it('denies a publicSalons doc for a salon the user did not create', async () => {
    await assertFails(setDoc(doc(real(OUTSIDER), 'publicSalons/salon-ghost'), publicSalonData(OUTSIDER)));
    await assertFails(setDoc(doc(real(OUTSIDER), `publicSalons/${S1}`), publicSalonData(OUTSIDER)));
  });
});

// ---------------------------------------------------------------------------
// 2. salons/{salonId}
// ---------------------------------------------------------------------------
describe('salons/{salonId}', () => {
  it('allows staff to read the salon', async () => {
    await assertSucceeds(getDoc(doc(real(STYLIST), `salons/${S1}`)));
  });

  it('denies non-staff, inactive staff and anonymous reads', async () => {
    await assertFails(getDoc(doc(real(OUTSIDER), `salons/${S1}`)));
    await assertFails(getDoc(doc(real(INACTIVE), `salons/${S1}`)));
    await assertFails(getDoc(doc(anon(), `salons/${S1}`)));
    await assertFails(getDoc(doc(nobody(), `salons/${S1}`)));
  });

  it('allows a real user to create a valid salon', async () => {
    await assertSucceeds(setDoc(doc(real(OUTSIDER), 'salons/salon-x'), salonData(OUTSIDER)));
  });

  it('denies invalid salon creates', async () => {
    const db = real(OUTSIDER);
    const ref = doc(db, 'salons/salon-x');
    await assertFails(setDoc(ref, salonData(OUTSIDER, { createdBy: OWNER })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { createdAt: PAST })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { timezone: 'Asia/Dubai' })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { schemaVersion: 2 })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { owner: OUTSIDER })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { settings: salonSettings({ allergyCheck: true }) })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { settings: salonSettings({ aiDailyCap: 81 }) })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { settings: salonSettings({ idleWipeMin: 0 }) })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { settings: salonSettings({ retentionDays: 10 }) })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { languages: ['ar', 'fr'] })));
    await assertFails(setDoc(ref, salonData(OUTSIDER, { name: '', nameAr: '' })));
  });

  it('allows the owner to update settings', async () => {
    await assertSucceeds(
      updateDoc(doc(real(OWNER), `salons/${S1}`), { 'settings.aiPreview': true, ...touched(OWNER) }),
    );
  });

  it('denies a manager update, a createdBy change and a missing updatedAt', async () => {
    await assertFails(
      updateDoc(doc(real(MANAGER), `salons/${S1}`), { 'settings.aiPreview': true, ...touched(MANAGER) }),
    );
    await assertFails(
      updateDoc(doc(real(OWNER), `salons/${S1}`), { createdBy: OWNER + 'x', ...touched(OWNER) }),
    );
    await assertFails(updateDoc(doc(real(OWNER), `salons/${S1}`), { name: 'New', updatedBy: OWNER }));
  });

  it('denies deleting a salon, even for the owner', async () => {
    await assertFails(deleteDoc(doc(real(OWNER), `salons/${S1}`)));
  });
});

// ---------------------------------------------------------------------------
// 3. publicSalons/{salonId}
// ---------------------------------------------------------------------------
describe('publicSalons/{salonId}', () => {
  it('allows anyone (no auth) to read', async () => {
    await assertSucceeds(getDoc(doc(nobody(), `publicSalons/${S1}`)));
    await assertSucceeds(getDoc(doc(anon(), `publicSalons/${S1}`)));
  });

  it('allows the owner to update', async () => {
    await assertSucceeds(
      updateDoc(doc(real(OWNER), `publicSalons/${S1}`), { tryAtHome: false, ...touched(OWNER) }),
    );
  });

  it('denies a manager, a stranger, and unknown keys', async () => {
    await assertFails(
      updateDoc(doc(real(MANAGER), `publicSalons/${S1}`), { tryAtHome: false, ...touched(MANAGER) }),
    );
    await assertFails(
      updateDoc(doc(nobody(), `publicSalons/${S1}`), { tryAtHome: false, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(real(OWNER), `publicSalons/${S1}`), { address: 'Muscat', ...touched(OWNER) }),
    );
  });

  it('allows owner delete, denies stylist delete', async () => {
    await assertFails(deleteDoc(doc(real(STYLIST), `publicSalons/${S1}`)));
    await assertSucceeds(deleteDoc(doc(real(OWNER), `publicSalons/${S1}`)));
  });
});

// ---------------------------------------------------------------------------
// 4. salons/{salonId}/staff/{uid}
// ---------------------------------------------------------------------------
describe('salons/{salonId}/staff/{uid}', () => {
  const staffRef = (db, uid) => doc(db, `salons/${S1}/staff/${uid}`);

  it('allows staff to read staff docs and a user to read their own', async () => {
    await assertSucceeds(getDoc(staffRef(real(STYLIST), OWNER)));
    await assertSucceeds(getDocs(collection(real(STYLIST), `salons/${S1}/staff`)));
    await assertSucceeds(getDoc(staffRef(real(INACTIVE), INACTIVE)));
  });

  it('denies outsiders reading staff docs', async () => {
    await assertFails(getDoc(staffRef(real(OUTSIDER), OWNER)));
    await assertFails(getDoc(staffRef(real(INACTIVE), OWNER)));
  });

  it('allows joining with an invite (verified email, invite role)', async () => {
    const db = real(INVITEE, 'Nadia@Example.com');
    const b = writeBatch(db);
    b.set(staffRef(db, INVITEE), staffData(INVITEE, 'stylist', INVITEE, { email: 'nadia@example.com' }));
    b.delete(doc(db, `salons/${S1}/invites/${INVITEE}@example.com`));
    b.set(doc(db, `users/${INVITEE}`), userData([S1]));
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(db, `salons/${S1}`)));
  });

  it('denies joining without an invite', async () => {
    await assertFails(setDoc(staffRef(real(OUTSIDER), OUTSIDER), staffData(OUTSIDER, 'stylist', OUTSIDER)));
  });

  it('denies joining with another role than the invite, or an unverified email', async () => {
    await assertFails(setDoc(staffRef(real(INVITEE), INVITEE), staffData(INVITEE, 'manager', INVITEE)));
    await assertFails(setDoc(staffRef(real(INVITEE), INVITEE), staffData(INVITEE, 'owner', INVITEE)));
    await assertFails(
      setDoc(
        staffRef(real(INVITEE, `${INVITEE}@example.com`, false), INVITEE),
        staffData(INVITEE, 'stylist', INVITEE),
      ),
    );
    // Someone else using Nadia's invite.
    await assertFails(setDoc(staffRef(real(INVITEE), OUTSIDER), staffData(OUTSIDER, 'stylist', INVITEE)));
  });

  it('allows the owner to add, update and remove other staff', async () => {
    const db = real(OWNER);
    await assertSucceeds(setDoc(staffRef(db, 'zara'), staffData('zara', 'stylist', OWNER)));
    await assertSucceeds(updateDoc(staffRef(db, STYLIST), { role: 'manager', ...touched(OWNER) }));
    await assertSucceeds(updateDoc(staffRef(db, MANAGER), { active: false, ...touched(OWNER) }));
    await assertSucceeds(deleteDoc(staffRef(db, INACTIVE)));
  });

  it('denies managers and stylists managing staff', async () => {
    await assertFails(setDoc(staffRef(real(MANAGER), 'zara'), staffData('zara', 'stylist', MANAGER)));
    await assertFails(updateDoc(staffRef(real(MANAGER), STYLIST), { role: 'manager', ...touched(MANAGER) }));
    await assertFails(updateDoc(staffRef(real(STYLIST), STYLIST), { role: 'owner', ...touched(STYLIST) }));
    await assertFails(deleteDoc(staffRef(real(MANAGER), STYLIST)));
  });

  it('allows the owner to edit their own name but denies changing their own role', async () => {
    const db = real(OWNER);
    await assertSucceeds(updateDoc(staffRef(db, OWNER), { name: 'Alice B.', ...touched(OWNER) }));
    await assertFails(updateDoc(staffRef(db, OWNER), { role: 'manager', ...touched(OWNER) }));
    await assertFails(updateDoc(staffRef(db, OWNER), { active: false, ...touched(OWNER) }));
    await assertFails(deleteDoc(staffRef(db, OWNER)));
  });

  it('denies invalid staff docs (unknown key, bad role, uid mismatch)', async () => {
    const db = real(OWNER);
    await assertFails(setDoc(staffRef(db, 'zara'), staffData('zara', 'stylist', OWNER, { salary: 300 })));
    await assertFails(setDoc(staffRef(db, 'zara'), staffData('zara', 'admin', OWNER)));
    await assertFails(setDoc(staffRef(db, 'zara'), staffData('someone-else', 'stylist', OWNER)));
    await assertFails(setDoc(staffRef(db, 'zara'), staffData('zara', 'stylist', OWNER, { createdAt: PAST })));
  });
});

// ---------------------------------------------------------------------------
// 5. salons/{salonId}/invites/{email}
// ---------------------------------------------------------------------------
describe('salons/{salonId}/invites/{email}', () => {
  const inviteRef = (db, email) => doc(db, `salons/${S1}/invites/${email}`);

  it('allows the owner to invite a manager or stylist', async () => {
    await assertSucceeds(setDoc(inviteRef(real(OWNER), 'zara@example.com'), inviteData('zara@example.com', 'manager', OWNER)));
    await assertSucceeds(setDoc(inviteRef(real(OWNER), 'lina@example.com'), inviteData('lina@example.com', 'stylist', OWNER)));
  });

  it('denies a manager inviting', async () => {
    await assertFails(setDoc(inviteRef(real(MANAGER), 'zara@example.com'), inviteData('zara@example.com', 'stylist', MANAGER)));
  });

  it('denies owner invites, email != doc id, upper-case ids and unknown keys', async () => {
    const db = real(OWNER);
    await assertFails(setDoc(inviteRef(db, 'zara@example.com'), inviteData('zara@example.com', 'owner', OWNER)));
    await assertFails(setDoc(inviteRef(db, 'zara@example.com'), inviteData('other@example.com', 'stylist', OWNER)));
    await assertFails(setDoc(inviteRef(db, 'Zara@example.com'), inviteData('Zara@example.com', 'stylist', OWNER)));
    await assertFails(setDoc(inviteRef(db, 'zara@example.com'), inviteData('zara@example.com', 'stylist', OWNER, { note: 'hi' })));
    await assertFails(setDoc(inviteRef(db, 'not-an-email'), inviteData('not-an-email', 'stylist', OWNER)));
  });

  it('allows staff and the invitee to read the invite', async () => {
    await assertSucceeds(getDoc(inviteRef(real(STYLIST), `${INVITEE}@example.com`)));
    await assertSucceeds(getDocs(collection(real(MANAGER), `salons/${S1}/invites`)));
    await assertSucceeds(getDoc(inviteRef(real(INVITEE, 'NADIA@example.com'), `${INVITEE}@example.com`)));
  });

  it('denies outsiders and unverified invitees reading the invite', async () => {
    await assertFails(getDoc(inviteRef(real(OUTSIDER), `${INVITEE}@example.com`)));
    await assertFails(getDoc(inviteRef(real(INVITEE, `${INVITEE}@example.com`, false), `${INVITEE}@example.com`)));
  });

  it('allows the invitee and the owner to delete; denies a stylist', async () => {
    await assertFails(deleteDoc(inviteRef(real(STYLIST), `${INVITEE}@example.com`)));
    await assertSucceeds(deleteDoc(inviteRef(real(INVITEE), `${INVITEE}@example.com`)));
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `salons/${S1}/invites/lina@example.com`), {
        ...inviteData('lina@example.com', 'stylist', OWNER),
        createdAt: PAST,
      }),
    );
    await assertSucceeds(deleteDoc(inviteRef(real(OWNER), 'lina@example.com')));
  });

  it('denies updating an invite', async () => {
    await assertFails(updateDoc(inviteRef(real(OWNER), `${INVITEE}@example.com`), { role: 'manager' }));
  });
});

// ---------------------------------------------------------------------------
// 6. Catalog: cuts, fringes, styles, shades, techniques, looks
// ---------------------------------------------------------------------------
describe('catalog collections', () => {
  for (const c of CATALOGS) {
    describe(c, () => {
      it('allows public read of a non-hidden item when Try at home is on', async () => {
        await assertSucceeds(getDoc(doc(nobody(), `salons/${S1}/${c}/visible`)));
        await assertSucceeds(
          getDocs(query(collection(nobody(), `salons/${S1}/${c}`), where('hidden', '==', false))),
        );
      });

      it('denies public read of hidden items, unfiltered lists and Try-at-home-off salons', async () => {
        await assertFails(getDoc(doc(nobody(), `salons/${S1}/${c}/secret`)));
        await assertFails(getDocs(collection(nobody(), `salons/${S1}/${c}`)));
        await assertFails(getDoc(doc(nobody(), `salons/${S2}/${c}/visible`)));
      });

      it('allows staff to read hidden items', async () => {
        await assertSucceeds(getDoc(doc(real(STYLIST), `salons/${S1}/${c}/secret`)));
        await assertSucceeds(getDocs(collection(real(STYLIST), `salons/${S1}/${c}`)));
      });

      it('allows owner or manager writes with hidden + updated stamps', async () => {
        await assertSucceeds(setDoc(doc(real(MANAGER), `salons/${S1}/${c}/new-item`), catalogData(MANAGER)));
        await assertSucceeds(
          updateDoc(doc(real(OWNER), `salons/${S1}/${c}/visible`), { hidden: true, ...touched(OWNER) }),
        );
        await assertSucceeds(deleteDoc(doc(real(OWNER), `salons/${S1}/${c}/secret`)));
      });

      it('denies stylist writes and writes without hidden or stamps', async () => {
        await assertFails(setDoc(doc(real(STYLIST), `salons/${S1}/${c}/new-item`), catalogData(STYLIST)));
        await assertFails(deleteDoc(doc(real(STYLIST), `salons/${S1}/${c}/visible`)));
        await assertFails(
          setDoc(doc(real(MANAGER), `salons/${S1}/${c}/new-item`), catalogData(MANAGER, { hidden: 'no' })),
        );
        await assertFails(
          setDoc(doc(real(MANAGER), `salons/${S1}/${c}/new-item`), catalogData(MANAGER, { updatedBy: OWNER })),
        );
        await assertFails(
          updateDoc(doc(real(OWNER), `salons/${S1}/${c}/visible`), { hidden: true, updatedBy: OWNER }),
        );
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 7. swatchLines, swatches, products
// ---------------------------------------------------------------------------
describe('swatchLines/{lineId}', () => {
  const lineRef = (db, id = 'line-2') => doc(db, `salons/${S1}/swatchLines/${id}`);

  it('allows staff read and owner/manager create, update, delete', async () => {
    await assertSucceeds(getDoc(lineRef(real(STYLIST), 'line-1')));
    await assertSucceeds(setDoc(lineRef(real(MANAGER)), swatchLineData(MANAGER)));
    await assertSucceeds(updateDoc(lineRef(real(OWNER), 'line-1'), { name: 'Line B', ...touched(OWNER) }));
    await assertSucceeds(deleteDoc(lineRef(real(MANAGER), 'line-1')));
  });

  it('denies outsiders, stylist writes and invalid lines', async () => {
    await assertFails(getDoc(lineRef(real(OUTSIDER), 'line-1')));
    await assertFails(setDoc(lineRef(real(STYLIST)), swatchLineData(STYLIST)));
    await assertFails(setDoc(lineRef(real(MANAGER)), swatchLineData(MANAGER, { name: '' })));
    await assertFails(setDoc(lineRef(real(MANAGER)), swatchLineData(MANAGER, { brand: 'X' })));
    await assertFails(updateDoc(lineRef(real(OWNER), 'line-1'), { createdBy: OWNER + 'x', ...touched(OWNER) }));
  });
});

describe('swatchLines/{lineId}/swatches/{swatchId}', () => {
  const swRef = (db, id = 'sw-2') => doc(db, `salons/${S1}/swatchLines/line-1/swatches/${id}`);

  it('allows a valid scanned swatch and one typed without a scan', async () => {
    await assertSucceeds(setDoc(swRef(real(MANAGER)), swatchData(MANAGER)));
    await assertSucceeds(
      setDoc(
        swRef(real(OWNER), 'sw-3'),
        swatchData(OWNER, { labMeasured: null, light: null, scannedAt: null, scannedBy: null }),
      ),
    );
    await assertSucceeds(getDoc(swRef(real(STYLIST), 'sw-1')));
    await assertSucceeds(updateDoc(swRef(real(OWNER), 'sw-1'), { level: 8, ...touched(OWNER) }));
  });

  it('denies invalid swatches and stylist writes', async () => {
    const db = real(MANAGER);
    await assertFails(setDoc(swRef(real(STYLIST)), swatchData(STYLIST)));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { level: 13 })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { level: 6.5 })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { code: 'X'.repeat(25) })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { code: '' })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { labMeasured: [52, 8] })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { labMeasured: [52, 8, 'x'] })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { light: 'evening' })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { scannedAt: PAST })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { scannedBy: OWNER })));
    await assertFails(setDoc(swRef(db), swatchData(MANAGER, { photo: 'data:image/png;base64,AAAA' })));
    await assertFails(deleteDoc(swRef(real(STYLIST), 'sw-1')));
  });
});

describe('products/{productId}', () => {
  const prodRef = (db, id = 'prod-2') => doc(db, `salons/${S1}/products/${id}`);

  it('allows staff read and owner/manager writes', async () => {
    await assertSucceeds(getDoc(prodRef(real(STYLIST), 'prod-1')));
    await assertSucceeds(setDoc(prodRef(real(MANAGER)), productData(MANAGER)));
    await assertSucceeds(setDoc(prodRef(real(OWNER), 'prod-3'), productData(OWNER, { name: '', nameAr: 'قص', priceOmr: 0 })));
    await assertSucceeds(updateDoc(prodRef(real(MANAGER), 'prod-1'), { priceOmr: 50.25, ...touched(MANAGER) }));
    await assertSucceeds(deleteDoc(prodRef(real(OWNER), 'prod-1')));
  });

  it('denies outsiders, stylists and invalid products', async () => {
    const db = real(MANAGER);
    await assertFails(getDoc(prodRef(real(OUTSIDER), 'prod-1')));
    await assertFails(setDoc(prodRef(real(STYLIST)), productData(STYLIST)));
    await assertFails(deleteDoc(prodRef(real(STYLIST), 'prod-1')));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { category: 'food' })));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { priceOmr: -1 })));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { priceOmr: 10001 })));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { priceOmr: '45' })));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { name: '', nameAr: '' })));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { active: 'yes' })));
    await assertFails(setDoc(prodRef(db), productData(MANAGER, { sku: 'A1' })));
  });
});

// ---------------------------------------------------------------------------
// 8a. clients/{clientId}
// ---------------------------------------------------------------------------
describe('clients/{clientId}', () => {
  const clientRef = (db, id = 'client-2') => doc(db, `salons/${S1}/clients/${id}`);

  // The first create is also an expression-budget canary (every field set).
  it('allows staff to create, read and update a client', async () => {
    await assertSucceeds(setDoc(clientRef(real(STYLIST)), clientData(STYLIST)));
    await assertSucceeds(
      setDoc(
        clientRef(real(STYLIST), 'client-min'),
        clientData(STYLIST, { phone: null, consent: null, profile: null, hair: null, history: null }),
      ),
    );
    await assertSucceeds(getDoc(clientRef(real(MANAGER), 'client-1')));
    await assertSucceeds(
      updateDoc(clientRef(real(MANAGER), 'client-1'), {
        'hair.rootLevel': 4,
        lastVisitAt: serverTimestamp(),
        visits: increment(1),
        ...touched(MANAGER),
      }),
    );
  });

  it('denies outsiders, inactive staff and anonymous users', async () => {
    await assertFails(getDoc(clientRef(real(OUTSIDER), 'client-1')));
    await assertFails(getDoc(clientRef(real(INACTIVE), 'client-1')));
    await assertFails(getDoc(clientRef(anon(), 'client-1')));
    await assertFails(setDoc(clientRef(real(OUTSIDER)), clientData(OUTSIDER)));
    await assertFails(setDoc(clientRef(real(INACTIVE)), clientData(INACTIVE)));
  });

  it('denies a phone that is not +968 and a long display name', async () => {
    const db = real(STYLIST);
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { phone: '+971501234567' })));
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { phone: '91234567' })));
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { phone: '+9689123456' })));
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { displayName: 'x'.repeat(81) })));
  });

  it('denies extra fields anywhere (a health answer can never be stored)', async () => {
    const db = real(STYLIST);
    const c = clientData(STYLIST);
    await assertFails(setDoc(clientRef(db), { ...c, allergy: true }));
    await assertFails(setDoc(clientRef(db), { ...c, profile: { ...c.profile, scalpSensitive: true } }));
    await assertFails(setDoc(clientRef(db), { ...c, hair: { ...c.hair, porosity: 'high' } }));
    await assertFails(setDoc(clientRef(db), { ...c, history: { ...c.history, reactedToDye: true } }));
    await assertFails(setDoc(clientRef(db), { ...c, consent: { ...c.consent, health: true } }));
  });

  it('denies out-of-range levels, grey %, mst and bad enums', async () => {
    const db = real(STYLIST);
    const c = clientData(STYLIST);
    await assertFails(setDoc(clientRef(db), { ...c, hair: { ...c.hair, rootLevel: 13 } }));
    await assertFails(setDoc(clientRef(db), { ...c, hair: { ...c.hair, endsLevel: 0 } }));
    await assertFails(setDoc(clientRef(db), { ...c, hair: { ...c.hair, rootLevel: 4.5 } }));
    await assertFails(setDoc(clientRef(db), { ...c, hair: { ...c.hair, greyPct: 101 } }));
    await assertFails(setDoc(clientRef(db), { ...c, hair: { ...c.hair, texture: 'frizzy' } }));
    await assertFails(setDoc(clientRef(db), { ...c, profile: { ...c.profile, mst: 11 } }));
    await assertFails(setDoc(clientRef(db), { ...c, profile: { ...c.profile, faceShape: 'pear' } }));
    await assertFails(setDoc(clientRef(db), { ...c, history: { ...c.history, henna: 'black' } }));
    await assertFails(setDoc(clientRef(db), { ...c, history: { ...c.history, bleach: 'yes' } }));
    await assertFails(setDoc(clientRef(db), { ...c, shrinkagePct: 81 }));
    await assertFails(setDoc(clientRef(db), { ...c, growthCmPerMonth: 0.2 }));
    await assertFails(setDoc(clientRef(db), { ...c, demo: 'false' }));
  });

  it('denies wrong created/updated stamps', async () => {
    const db = real(STYLIST);
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { createdBy: OWNER })));
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { createdAt: PAST })));
    await assertFails(setDoc(clientRef(db), clientData(STYLIST, { updatedAt: PAST })));
    await assertFails(setDoc(clientRef(db), { ...clientData(STYLIST), consent: { profile: true, at: PAST, by: STYLIST } }));
    await assertFails(setDoc(clientRef(db), { ...clientData(STYLIST), consent: { profile: true, at: serverTimestamp(), by: OWNER } }));
    await assertFails(updateDoc(clientRef(db, 'client-1'), { createdBy: STYLIST + 'x', ...touched(STYLIST) }));
    await assertFails(updateDoc(clientRef(db, 'client-1'), { createdAt: serverTimestamp(), ...touched(STYLIST) }));
    await assertFails(updateDoc(clientRef(db, 'client-1'), { displayName: 'B', updatedBy: STYLIST }));
    await assertFails(updateDoc(clientRef(db, 'client-1'), { displayName: 'B', ...touched(OWNER) }));
  });

  it('allows owner/manager delete, denies stylist delete', async () => {
    await assertFails(deleteDoc(clientRef(real(STYLIST), 'client-1')));
    await assertSucceeds(deleteDoc(clientRef(real(MANAGER), 'client-1')));
  });
});

// ---------------------------------------------------------------------------
// 8b. consultations/{id}
// ---------------------------------------------------------------------------
describe('consultations/{id}', () => {
  const cRef = (db, id = 'consult-2') => doc(db, `salons/${S1}/consultations/${id}`);

  // The next three are also expression-budget canaries (Firestore stops at
  // 1000 evaluated expressions per request): they write every field at once.
  it('allows a stylist to create a full consultation', async () => {
    await assertSucceeds(setDoc(cRef(real(STYLIST)), consultationData(STYLIST)));
  });

  it('allows a consultation created complete in one write (approved, rated)', async () => {
    await assertSucceeds(
      setDoc(
        cRef(real(STYLIST), 'complete'),
        consultationData(STYLIST, {
          status: 'done',
          decisionSeconds: 412.5,
          aiPreviewUsed: true,
          rating: 5,
          nextVisitWeeks: 6,
          notTodayShown: 2,
          params: paramsData({ fringeId: 'curtain', styleId: 'blowout', shade2Id: 'honey', swatchId: 'line-1/sw-1' }),
          approvals: { customerAt: serverTimestamp(), stylistAt: serverTimestamp(), stylistUid: STYLIST },
        }),
      ),
    );
  });

  it('allows one update that writes params, agreement and approvals together', async () => {
    await assertSucceeds(
      updateDoc(cRef(real(STYLIST), 'draft-1'), {
        params: paramsData({ fringeId: 'curtain', shade2Id: 'honey' }),
        agreement: agreementData(),
        approvals: { customerAt: serverTimestamp(), stylistAt: serverTimestamp(), stylistUid: STYLIST },
        status: 'approved',
        rating: 5,
        nextVisitWeeks: 6,
        decisionSeconds: 300,
        ...touched(STYLIST),
      }),
    );
  });

  it('allows a walk-in with nulls and absent optional fields', async () => {
    await assertSucceeds(
      setDoc(cRef(real(STYLIST), 'walk-in'), {
        clientId: null,
        stylistUid: STYLIST,
        params: paramsData({ techniqueParams: null, finish: null, lightPreset: null, lengthCm: null }),
        status: 'draft',
        dayKey: '2026-10-25',
        source: 'look-code',
        ...created(STYLIST),
      }),
    );
  });

  it('allows staff to read and to approve with server timestamps', async () => {
    await assertSucceeds(getDoc(cRef(real(OWNER), 'consult-1')));
    await assertSucceeds(
      updateDoc(cRef(real(STYLIST), 'consult-1'), {
        status: 'approved',
        'approvals.customerAt': serverTimestamp(),
        'approvals.stylistAt': serverTimestamp(),
        'approvals.stylistUid': STYLIST,
        decisionSeconds: 312,
        ...touched(STYLIST),
      }),
    );
    // A later update keeps the approval stamps unchanged.
    await assertSucceeds(
      updateDoc(cRef(real(MANAGER), 'consult-1'), { status: 'done', rating: 5, nextVisitWeeks: 6, ...touched(MANAGER) }),
    );
  });

  it('denies outsiders and inactive staff', async () => {
    await assertFails(getDoc(cRef(real(OUTSIDER), 'consult-1')));
    await assertFails(setDoc(cRef(real(INACTIVE)), consultationData(INACTIVE)));
    await assertFails(setDoc(cRef(anon()), consultationData(ANON)));
  });

  it('denies an extra top-level field such as allergy', async () => {
    await assertFails(setDoc(cRef(real(STYLIST)), consultationData(STYLIST, { allergy: 'ppd' })));
    await assertFails(
      updateDoc(cRef(real(STYLIST), 'consult-1'), { allergy: true, ...touched(STYLIST) }),
    );
  });

  it('denies an extra key in agreement, params, techniqueParams or approvals', async () => {
    const db = real(STYLIST);
    await assertFails(setDoc(cRef(db), consultationData(STYLIST, { agreement: agreementData({ reaction: true }) })));
    await assertFails(
      updateDoc(cRef(db, 'consult-1'), { 'agreement.scalpSensitive': true, ...touched(STYLIST) }),
    );
    await assertFails(setDoc(cRef(db), consultationData(STYLIST, { params: paramsData({ photo: 'x' }) })));
    await assertFails(
      setDoc(cRef(db), consultationData(STYLIST, {
        params: paramsData({ techniqueParams: { start: 0, density: 1, softness: 0, level: 0, blur: 1 } }),
      })),
    );
    await assertFails(
      setDoc(cRef(db), consultationData(STYLIST, { approvals: { customerAt: null, stylistAt: null, stylistUid: null, note: 'x' } })),
    );
  });

  it('denies nested maps or lists in catalog ids, and non-number technique params', async () => {
    const db = real(STYLIST);
    const tp = { start: 0, density: 1, softness: 0.2, level: 0 };
    const bad = [
      paramsData({ cutId: { allergy: 'ppd' } }),
      paramsData({ fringeId: ['reacted to dye'] }),
      paramsData({ swatchId: Timestamp.now() }),
      paramsData({ techniqueParams: { ...tp, start: 'root' } }),
      paramsData({ techniqueParams: { ...tp, level: null } }),
      paramsData({ techniqueParams: { ...tp, density: true } }),
      paramsData({ techniqueParams: 'balayage' }),
    ];
    for (const params of bad) {
      await assertFails(setDoc(cRef(db), consultationData(STYLIST, { params })));
    }
  });

  it('denies a stylistUid that is not the caller, and changing it later', async () => {
    await assertFails(setDoc(cRef(real(STYLIST)), consultationData(STYLIST, { stylistUid: MANAGER })));
    await assertFails(updateDoc(cRef(real(MANAGER), 'consult-1'), { stylistUid: MANAGER, ...touched(MANAGER) }));
  });

  it('denies out-of-range levels, lengths and counters', async () => {
    const db = real(STYLIST);
    const bad = [
      { agreement: agreementData({ targetLevel: 13 }) },
      { agreement: agreementData({ targetLevel: 0 }) },
      { agreement: agreementData({ todayLevel: 12.5 }) },
      { agreement: agreementData({ lengthWetCm: 151 }) },
      { agreement: agreementData({ lengthDryCm: -1 }) },
      { agreement: agreementData({ currentLengthCm: 200 }) },
      { agreement: agreementData({ shrinkagePct: 81 }) },
      { agreement: agreementData({ sessionsTotal: 7 }) },
      { agreement: agreementData({ sessionNumber: -1 }) },
      { agreement: agreementData({ process: 'perm' }) },
      { agreement: agreementData({ tests: ['strand', 'allergy'] }) },
      { agreement: agreementData({ tests: 'strand' }) },
      { agreement: agreementData({ priceItems: Array.from({ length: 31 }, (_, i) => `p${i}`) }) },
      { agreement: agreementData({ aftercareKeys: Array.from({ length: 9 }, (_, i) => `k${i}`) }) },
      { agreement: agreementData({ fillerLikely: 'maybe' }) },
      { params: paramsData({ lengthCm: 151 }) },
      { params: paramsData({ finish: 'shiny' }) },
      { params: paramsData({ lightPreset: 'neon' }) },
      { rating: 6 },
      { rating: 0 },
      { nextVisitWeeks: 53 },
      { decisionSeconds: 86401 },
      { notTodayShown: 51 },
      { notTodayShown: 2.5 },
      { status: 'pending' },
      { source: 'web' },
      { dayKey: '25-10-2026' },
      { demo: 'no' },
      { aiPreviewUsed: 1 },
    ];
    for (const over of bad) {
      await assertFails(setDoc(cRef(db), consultationData(STYLIST, over)));
    }
  });

  it('denies a missing status or dayKey', async () => {
    const { status: _s, ...noStatus } = consultationData(STYLIST);
    const { dayKey: _d, ...noDay } = consultationData(STYLIST);
    await assertFails(setDoc(cRef(real(STYLIST)), noStatus));
    await assertFails(setDoc(cRef(real(STYLIST), 'consult-3'), noDay));
  });

  it('denies approval stamps that are not server time', async () => {
    await assertFails(
      updateDoc(cRef(real(STYLIST), 'consult-1'), {
        'approvals.customerAt': PAST,
        ...touched(STYLIST),
      }),
    );
  });

  it('denies wrong stamps on create and update', async () => {
    await assertFails(setDoc(cRef(real(STYLIST)), consultationData(STYLIST, { createdAt: PAST })));
    await assertFails(setDoc(cRef(real(STYLIST)), consultationData(STYLIST, { updatedBy: OWNER })));
    await assertFails(updateDoc(cRef(real(STYLIST), 'consult-1'), { createdBy: OWNER, ...touched(STYLIST) }));
  });

  it('allows owner/manager delete, denies stylist delete', async () => {
    await assertFails(deleteDoc(cRef(real(STYLIST), 'consult-1')));
    await assertSucceeds(deleteDoc(cRef(real(OWNER), 'consult-1')));
  });
});

// ---------------------------------------------------------------------------
// 9. lookCodes/{code}
// ---------------------------------------------------------------------------
describe('lookCodes/{code}', () => {
  const lcRef = (db, code = 'XYZ789', salonId = S1) => doc(db, `salons/${salonId}/lookCodes/${code}`);

  it('allows an anonymous customer (and a real user) to create a look code', async () => {
    await assertSucceeds(setDoc(lcRef(anon()), lookCodeData(ANON)));
    await assertSucceeds(setDoc(lcRef(real(OUTSIDER), 'HJKNPQ'), lookCodeData(OUTSIDER)));
  });

  it('denies an unauthenticated create', async () => {
    await assertFails(setDoc(lcRef(nobody()), lookCodeData('nobody')));
  });

  it('denies expiresAt 40 days out, in the past, or not a timestamp', async () => {
    const db = anon();
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { expiresAt: Timestamp.fromMillis(Date.now() + 40 * DAY) })));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { expiresAt: Timestamp.fromMillis(Date.now() - DAY) })));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { expiresAt: '2026-11-25' })));
  });

  it('denies bad codes, extra keys, usedAt on create and someone else as creator', async () => {
    const db = anon();
    await assertFails(setDoc(lcRef(db, 'ABCDE0'), lookCodeData(ANON))); // 0 not allowed
    await assertFails(setDoc(lcRef(db, 'ABCDEO'), lookCodeData(ANON))); // O not allowed
    await assertFails(setDoc(lcRef(db, 'ABCDE1'), lookCodeData(ANON))); // 1 not allowed
    await assertFails(setDoc(lcRef(db, 'ABCDEI'), lookCodeData(ANON))); // I not allowed
    await assertFails(setDoc(lcRef(db, 'abc234'), lookCodeData(ANON)));
    await assertFails(setDoc(lcRef(db, 'ABC2345'), lookCodeData(ANON)));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { photo: 'data:image/jpeg;base64,AAAA' })));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { usedAt: serverTimestamp(), usedBy: ANON })));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON2)));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { createdAt: PAST })));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { params: 'long-layers' })));
    await assertFails(setDoc(lcRef(db), lookCodeData(ANON, { params: paramsData({ faceShape: 'oval' }) })));
  });

  it('denies a look code for a salon with Try at home off', async () => {
    await assertFails(setDoc(lcRef(anon(), 'XYZ789', S2), lookCodeData(ANON)));
  });

  it('allows the creator and staff to get a look code', async () => {
    await assertSucceeds(getDoc(lcRef(anon(ANON), 'ABC234')));
    await assertSucceeds(getDoc(lcRef(real(STYLIST), 'ABC234')));
  });

  it('denies other customers and outsiders reading or listing look codes', async () => {
    await assertFails(getDoc(lcRef(anon(ANON2), 'ABC234')));
    await assertFails(getDoc(lcRef(real(OUTSIDER), 'ABC234')));
    await assertFails(getDoc(lcRef(nobody(), 'ABC234')));
    await assertFails(getDocs(collection(anon(ANON), `salons/${S1}/lookCodes`)));
  });

  it('allows staff to mark a code used (usedAt, usedBy only)', async () => {
    await assertSucceeds(
      updateDoc(lcRef(real(STYLIST), 'ABC234'), { usedAt: serverTimestamp(), usedBy: STYLIST }),
    );
  });

  it('denies the anonymous creator redeeming, and staff touching other fields', async () => {
    await assertFails(updateDoc(lcRef(anon(ANON), 'ABC234'), { usedAt: serverTimestamp(), usedBy: ANON }));
    await assertFails(
      updateDoc(lcRef(real(STYLIST), 'ABC234'), { usedAt: serverTimestamp(), usedBy: MANAGER }),
    );
    await assertFails(updateDoc(lcRef(real(STYLIST), 'ABC234'), { usedAt: PAST, usedBy: STYLIST }));
    await assertFails(
      updateDoc(lcRef(real(STYLIST), 'ABC234'), {
        usedAt: serverTimestamp(),
        usedBy: STYLIST,
        expiresAt: Timestamp.fromMillis(Date.now() + 60 * DAY),
      }),
    );
  });

  it('allows owner/manager delete, denies stylist and creator delete', async () => {
    await assertFails(deleteDoc(lcRef(real(STYLIST), 'ABC234')));
    await assertFails(deleteDoc(lcRef(anon(ANON), 'ABC234')));
    await assertSucceeds(deleteDoc(lcRef(real(MANAGER), 'ABC234')));
  });
});

// ---------------------------------------------------------------------------
// 10. consents/{id}
// ---------------------------------------------------------------------------
describe('consents/{id}', () => {
  const consentRef = (db, id = 'consent-2') => doc(db, `salons/${S1}/consents/${id}`);

  it('allows staff to log a consent', async () => {
    await assertSucceeds(setDoc(consentRef(real(STYLIST)), consentData(STYLIST)));
    await assertSucceeds(
      setDoc(consentRef(real(MANAGER), 'consent-3'), consentData(MANAGER, { type: 'profile_save', clientId: null, granted: false })),
    );
  });

  it('denies non-staff and invalid consents', async () => {
    await assertFails(setDoc(consentRef(anon()), consentData(ANON)));
    await assertFails(setDoc(consentRef(real(OUTSIDER)), consentData(OUTSIDER)));
    await assertFails(setDoc(consentRef(real(STYLIST)), consentData(STYLIST, { type: 'marketing' })));
    await assertFails(setDoc(consentRef(real(STYLIST)), consentData(STYLIST, { by: OWNER })));
    await assertFails(setDoc(consentRef(real(STYLIST)), consentData(STYLIST, { at: PAST })));
    await assertFails(setDoc(consentRef(real(STYLIST)), consentData(STYLIST, { granted: 'yes' })));
    await assertFails(setDoc(consentRef(real(STYLIST)), consentData(STYLIST, { clientId: 42 })));
    await assertFails(setDoc(consentRef(real(STYLIST)), consentData(STYLIST, { signature: 'x' })));
  });

  it('allows the owner to read; denies a stylist', async () => {
    await assertSucceeds(getDoc(consentRef(real(OWNER), 'consent-1')));
    await assertFails(getDoc(consentRef(real(STYLIST), 'consent-1')));
  });

  it('denies update and delete, even for the owner', async () => {
    await assertFails(updateDoc(consentRef(real(OWNER), 'consent-1'), { granted: false }));
    await assertFails(updateDoc(consentRef(real(STYLIST), 'consent-1'), { granted: false, at: serverTimestamp(), by: STYLIST }));
    await assertFails(deleteDoc(consentRef(real(OWNER), 'consent-1')));
  });
});

// ---------------------------------------------------------------------------
// 11. dailyStats/{dayKey}
// ---------------------------------------------------------------------------
describe('dailyStats/{dayKey}', () => {
  const statsRef = (db, day = '2026-10-26') => doc(db, `salons/${S1}/dailyStats/${day}`);

  it('allows staff to create and increment counters', async () => {
    await assertSucceeds(
      setDoc(
        statsRef(real(STYLIST)),
        { consultations: increment(1), topLooks: { 'long-layers': increment(1) }, updatedAt: serverTimestamp() },
        { merge: true },
      ),
    );
    await assertSucceeds(
      updateDoc(statsRef(real(STYLIST), '2026-10-25'), {
        approvals: increment(1),
        totalDecisionSeconds: increment(312),
        ratingsSum: increment(5),
        ratingsCount: increment(1),
        'topShades.mocha-brown': increment(1),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(statsRef(real(MANAGER), '2026-10-25')));
  });

  it('denies a bad dayKey, unknown keys, non-number values and missing updatedAt', async () => {
    const db = real(STYLIST);
    await assertFails(setDoc(statsRef(db, '26-10-2026'), { consultations: 1, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(statsRef(db), { consultations: 1, revenue: 10, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(statsRef(db), { consultations: 'many', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(statsRef(db), { topLooks: ['long-layers'], updatedAt: serverTimestamp() }));
    await assertFails(setDoc(statsRef(db), { consultations: 1 }));
  });

  it('denies outsiders and deletes', async () => {
    await assertFails(getDoc(statsRef(real(OUTSIDER), '2026-10-25')));
    await assertFails(setDoc(statsRef(anon()), { consultations: 1, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(statsRef(real(OWNER), '2026-10-25')));
  });
});

// ---------------------------------------------------------------------------
// 12. audit/{id}
// ---------------------------------------------------------------------------
describe('audit/{id}', () => {
  const auditRef = (db, id = 'audit-2') => doc(db, `salons/${S1}/audit/${id}`);

  it('allows staff to append an audit entry', async () => {
    await assertSucceeds(setDoc(auditRef(real(STYLIST)), auditData(STYLIST)));
  });

  it('denies non-staff and invalid entries', async () => {
    await assertFails(setDoc(auditRef(real(OUTSIDER)), auditData(OUTSIDER)));
    await assertFails(setDoc(auditRef(real(STYLIST)), auditData(STYLIST, { by: OWNER })));
    await assertFails(setDoc(auditRef(real(STYLIST)), auditData(STYLIST, { at: PAST })));
    await assertFails(setDoc(auditRef(real(STYLIST)), auditData(STYLIST, { action: '' })));
    await assertFails(setDoc(auditRef(real(STYLIST)), auditData(STYLIST, { changedFields: 'all' })));
    await assertFails(setDoc(auditRef(real(STYLIST)), auditData(STYLIST, { ip: '1.2.3.4' })));
  });

  it('allows the owner to read; denies a stylist and a manager', async () => {
    await assertSucceeds(getDoc(auditRef(real(OWNER), 'audit-1')));
    await assertSucceeds(getDocs(collection(real(OWNER), `salons/${S1}/audit`)));
    await assertFails(getDoc(auditRef(real(STYLIST), 'audit-1')));
    await assertFails(getDocs(collection(real(MANAGER), `salons/${S1}/audit`)));
  });

  it('denies update and delete', async () => {
    await assertFails(updateDoc(auditRef(real(OWNER), 'audit-1'), { action: 'nothing' }));
    await assertFails(deleteDoc(auditRef(real(OWNER), 'audit-1')));
  });
});

// ---------------------------------------------------------------------------
// 13. Default deny
// ---------------------------------------------------------------------------
describe('default deny', () => {
  it('denies unknown top-level and salon sub-collections', async () => {
    await assertFails(getDoc(doc(real(OWNER), 'secrets/x')));
    await assertFails(setDoc(doc(real(OWNER), 'secrets/x'), { a: 1 }));
    await assertFails(getDoc(doc(real(OWNER), `salons/${S1}/health/x`)));
    await assertFails(setDoc(doc(real(OWNER), `salons/${S1}/photos/x`), { a: 1 }));
  });

  it('still allows a known path for the same user (sanity check)', async () => {
    await assertSucceeds(getDoc(doc(real(OWNER), `salons/${S1}`)));
  });
});
