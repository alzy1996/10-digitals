// Demo content so the dashboard is not empty (PRD 10.7): 3 clients + 8 consultations over the last
// 7 Muscat days, all demo: true, removable with "Delete demo data". No brands, codes or prices.
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { committed, created, newId, uid } from './base.js';
import { lastNDayKeys } from '../lib/time.js';
import { logAudit } from './audit.js';

const CLIENTS = [
  { displayName: 'Demo — Maryam', profile: { faceShape: 'oval', mst: 5, undertone: 'warm', eyes: 'dark-brown', ageBand: '25-34' }, hair: { rootLevel: 2, endsLevel: 4, greyPct: 0, texture: 'wavy', density: 'thick', lengthBand: 'long' }, history: { henna: 'none', recentColor: 'lighter', bleach: false, chemical: false } },
  { displayName: 'Demo — Huda', profile: { faceShape: 'round', mst: 6, undertone: 'neutral', eyes: 'brown', ageBand: '35-44' }, hair: { rootLevel: 3, endsLevel: 3, greyPct: 12, texture: 'straight', density: 'medium', lengthBand: 'shoulder' }, history: { henna: 'pure', recentColor: 'none', bleach: false, chemical: false } },
  { displayName: 'Demo — Aisha', profile: { faceShape: 'heart', mst: 4, undertone: 'cool', eyes: 'hazel', ageBand: '45-54' }, hair: { rootLevel: 4, endsLevel: 6, greyPct: 35, texture: 'curly', density: 'fine', lengthBand: 'collarbone' }, history: { henna: 'none', recentColor: 'darker', bleach: true, chemical: false } },
];

const LOOKS = [
  { cutId: 'butterfly', fringeId: 'curtain', shadeId: 'caramel', technique: 'balayage', finish: 'glossy', lengthCm: 42, process: 'lightener', target: 7, status: 'done', rating: 5, secs: 104 },
  { cutId: 'lob', fringeId: 'none', shadeId: 'espresso', technique: 'global', finish: 'satin', lengthCm: 30, process: 'deposit-only', target: 2, status: 'approved', rating: null, secs: 88 },
  { cutId: 'modern-shag', fringeId: 'airy', shadeId: 'mushroom-brown', technique: 'babylights', finish: 'satin', lengthCm: 36, process: 'lightener', target: 5, status: 'done', rating: 4, secs: 131 },
  { cutId: 'french-bob', fringeId: 'blunt', shadeId: 'cherry-cola', technique: 'gloss-toner', finish: 'glossy', lengthCm: 20, process: 'deposit-only', target: 3, status: 'done', rating: 5, secs: 97 },
  { cutId: 'long-layers', fringeId: 'none', shadeId: 'honey', technique: 'money-piece', finish: 'satin', lengthCm: 48, process: 'lift-color', target: 7, status: 'draft', rating: null, secs: 0 },
  { cutId: 'curly-shag', fringeId: 'curly-fringe', shadeId: 'soft-copper', technique: 'balayage', finish: 'glossy', lengthCm: 34, process: 'lightener', target: 7, status: 'done', rating: 4, secs: 142 },
  { cutId: 'mid-layers', fringeId: 'side-swept', shadeId: 'teddy-bronde', technique: 'shadow-root', finish: 'satin', lengthCm: 38, process: 'high-lift', target: 7, status: 'approved', rating: null, secs: 119 },
  { cutId: 'blunt-long', fringeId: 'none', shadeId: 'blue-black', technique: 'color-drench', finish: 'glossy', lengthCm: 55, process: 'deposit-only', target: 1, status: 'done', rating: 5, secs: 76 },
];

export async function seedDemo(salonId) {
  const days = lastNDayKeys(7);
  const batch = writeBatch(db);
  const clientIds = CLIENTS.map((c) => {
    const id = newId('c');
    batch.set(doc(db, 'salons', salonId, 'clients', id), {
      displayName: c.displayName,
      phone: null,
      consent: { profile: true, at: serverTimestamp(), by: uid() },
      profile: c.profile,
      hair: c.hair,
      history: c.history,
      shrinkagePct: c.hair.texture === 'curly' ? 40 : c.hair.texture === 'wavy' ? 15 : 0,
      growthCmPerMonth: 1.25,
      visits: 1,
      demo: true,
      ...created(),
    });
    return id;
  });
  LOOKS.forEach((lk, i) => {
    const approved = lk.status !== 'draft';
    batch.set(doc(db, 'salons', salonId, 'consultations', newId('k')), {
      clientId: clientIds[i % clientIds.length],
      stylistUid: uid(),
      params: { cutId: lk.cutId, fringeId: lk.fringeId, styleId: null, lengthCm: lk.lengthCm, shadeId: lk.shadeId, shade2Id: null, swatchId: null, technique: lk.technique, finish: lk.finish, lightPreset: 'salon' },
      ...(approved
        ? {
            agreement: {
              currentLengthCm: lk.lengthCm + 6,
              lengthWetCm: lk.lengthCm,
              lengthDryCm: lk.lengthCm,
              shrinkagePct: 0,
              targetLevel: lk.target,
              targetTone: 'natural',
              process: lk.process,
              sessionsTotal: 1,
              sessionNumber: 1,
              todayLevel: lk.target,
              tests: lk.process === 'lightener' ? ['strand'] : [],
              fillerLikely: false,
              priceItems: [],
              addOnCount: i % 3 === 0 ? 1 : 0,
              aftercareKeys: ['sulfate_free', 'heat_protect'],
            },
            approvals: { customerAt: serverTimestamp(), stylistAt: serverTimestamp(), stylistUid: uid() },
          }
        : {}),
      status: lk.status,
      decisionSeconds: lk.secs,
      aiPreviewUsed: false,
      rating: lk.rating,
      nextVisitWeeks: approved ? 8 : null,
      notTodayShown: i % 4 === 1 ? 1 : 0,
      source: 'chair',
      dayKey: days[Math.min(days.length - 1, Math.floor((i * 7) / LOOKS.length))],
      demo: true,
      ...created(),
    });
  });
  await committed(batch.commit(), 'demoSeed');
}

export async function deleteDemo(salonId) {
  let n = 0;
  for (const kind of ['consultations', 'clients']) {
    const s = await getDocs(query(collection(db, 'salons', salonId, kind), where('demo', '==', true)));
    for (let i = 0; i < s.docs.length; i += 400) {
      const batch = writeBatch(db);
      s.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await committed(batch.commit(), 'demoDelete');
    }
    n += s.size;
  }
  logAudit(salonId, 'demo.delete', `salons/${salonId}`, { deleted: [null, String(n)] });
  return n;
}
