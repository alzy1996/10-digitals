// "Create your shop" seed (PRD 10.7) and the demo content, as plain write ops.
// Seeds: the shop doc with default settings and guard chart, the owner staff doc,
// the public info doc, every catalog style, an empty products list (no product
// names or prices are ever seeded), then demo clients and consultations marked
// demo: true with matching dailyStats increments.

import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { APP } from '../config/app.js';
import { DEFAULT_GUARD_CHART, mmToGuard } from '../lib/guards.js';
import { lastNDayKeys, muscatDayRange } from '../lib/time.js';
import {
  APPROVED_STATUS,
  DEFAULT_SETTINGS,
  ZONE_KEYS,
  cleanText,
  coarseLabels,
  defaultGuardChart,
  normalizePhone,
  autoId,
  clientSearchFields,
  sanitizeParams,
  sortStyles,
  styleData,
} from './model.js';
import { addStats, createdStamp, statsOp, updatedStamp } from './ops.js';

/** Settings written on a new shop: DEFAULT_SETTINGS with a writable guard chart copy. */
export function initialSettings({ whatsapp } = {}) {
  const phone = normalizePhone(whatsapp);
  return {
    ...DEFAULT_SETTINGS,
    guardChart: defaultGuardChart(),
    whatsapp: phone.valid && phone.value ? phone.value : '',
  };
}

/**
 * Ops for a new shop: shop doc, owner staff doc, public info, catalog styles.
 * Products start empty: nothing is written to shops/{shopId}/products.
 */
export function shopOps({ shopId, uid, ownerName, ownerEmail, name, nameAr, whatsapp, styles }) {
  const settings = initialSettings({ whatsapp });
  const shopName = cleanText(name, 80) || cleanText(nameAr, 80);
  const shopNameAr = cleanText(nameAr, 80) || shopName;
  const ops = [
    {
      path: `shops/${shopId}`,
      data: {
        name: shopName,
        nameAr: shopNameAr,
        languages: [...APP.languages],
        timezone: APP.timezone,
        schemaVersion: APP.schemaVersion,
        settings,
        ...createdStamp(uid),
      },
    },
    {
      path: `shops/${shopId}/staff/${uid}`,
      data: {
        uid,
        name: cleanText(ownerName, 80),
        email: ownerEmail ? String(ownerEmail).toLowerCase() : null,
        role: 'owner',
        active: true,
        ...createdStamp(uid),
      },
    },
    {
      path: `shops/${shopId}/public/info`,
      data: {
        name: shopName,
        nameAr: shopNameAr,
        tryAtHome: settings.tryAtHome,
        whatsapp: settings.whatsapp,
        defaultLanguage: settings.defaultLanguage,
        ...updatedStamp(uid),
      },
    },
  ];
  for (const style of Array.isArray(styles) ? styles : []) {
    if (!style || !style.id) continue;
    ops.push({
      path: `shops/${shopId}/styles/${style.id}`,
      data: { ...styleData(style), ...createdStamp(uid), ...updatedStamp(uid) },
    });
  }
  return ops;
}

// ---------------------------------------------------------------- demo content

// Demo names are clearly marked so nobody mistakes them for real customers.
// No phone numbers: a made-up number could belong to a real person.
const DEMO_CLIENTS = [
  {
    displayName: 'أحمد سالم (تجريبي)',
    profile: { faceShape: 'oval', mst: 6, undertone: 'warm', ageBand: '25-34', growability: 78 },
  },
  {
    displayName: 'Salim Nasser (Demo)',
    profile: { faceShape: 'square', mst: 5, undertone: 'olive', ageBand: '35-44', growability: 64 },
  },
  {
    displayName: 'خالد حمد (تجريبي)',
    profile: { faceShape: 'round', mst: 7, undertone: 'neutral', ageBand: '18-24', growability: 52 },
  },
];

// 8 consultations over the last 7 Muscat days (day 0 = today). Times are Muscat
// wall-clock hours. Decision seconds stay well inside 0..3600.
const DEMO_PLAN = [
  { day: 6, hour: 10, minute: 15, client: 0, style: 0, status: 'done', decision: 74, rating: 5, next: 14 },
  { day: 5, hour: 17, minute: 40, client: 1, style: 1, status: 'done', decision: 52, rating: 4, next: 10 },
  { day: 4, hour: 12, minute: 5, client: null, style: 2, status: 'cancelled' },
  { day: 3, hour: 19, minute: 20, client: 2, style: 3, status: 'done', decision: 118, rating: 5, next: 21 },
  { day: 2, hour: 11, minute: 0, client: null, style: 0, status: 'done', decision: 66, rating: 4, next: 14 },
  { day: 1, hour: 16, minute: 30, client: 0, style: 4, status: 'done', decision: 95, rating: 5, next: 7 },
  { day: 1, hour: 20, minute: 10, client: null, style: 5, status: 'draft' },
  { day: 0, hour: 9, minute: 45, client: 1, style: 1, status: 'approved', decision: 81 },
];

export const DEMO_COUNTS = { clients: DEMO_CLIENTS.length, consultations: DEMO_PLAN.length };

/** Look params for a catalog style without a face profile (zones, lines, shape from the style). */
export function fallbackParams(style) {
  const lines = style.lines || {};
  const fade = Array.isArray(style.shape?.fadeB) ? style.shape.fadeB[0] : null;
  return {
    styleId: style.id,
    zones: { ...(style.zones || {}) },
    lines: {
      cheek: lines.cheek ?? null,
      cheekOffset: 0,
      neckline: lines.neckline ?? null,
      necklineOffset: 0,
      sideburn: lines.sideburn ?? null,
      edge: lines.edge ?? null,
      mustacheEdge: lines.mustacheEdge ?? null,
    },
    mustacheId: style.mustacheId ?? null,
    fadeStartMm: Number.isFinite(Number(fade)) ? Number(fade) : null,
    colorId: null,
    greyTarget: null,
    finish: 'matte',
    shape: { ...(style.shape || {}) },
  };
}

function demoParams(style, paramsFromStyle) {
  if (typeof paramsFromStyle === 'function') {
    try {
      const p = paramsFromStyle(style, { profile: null });
      if (p && typeof p === 'object' && p.zones) return sanitizeParams({ ...p, styleId: style.id });
    } catch (err) {
      console.warn('seed: paramsFromStyle failed, using the style defaults', err);
    }
  }
  return sanitizeParams(fallbackParams(style));
}

function demoCutCard(params, guardChart) {
  const zonesMm = { ...(params.zones || {}) };
  const guards = {};
  for (const z of ZONE_KEYS) {
    if (!(z in zonesMm)) continue;
    const g = mmToGuard(zonesMm[z], guardChart);
    guards[z] = g.kind === 'guard' ? String(g.guardId) : g.kind;
  }
  return { zonesMm, guards, cheekLineMm: null, necklineMm: null, notes: {}, safetyFlags: [] };
}

/** Real instant for a Muscat wall-clock time on a dayKey. */
function muscatTime(dayKey, hour, minute) {
  const { start } = muscatDayRange(dayKey);
  return new Date(start.getTime() + (hour * 60 + minute) * 60 * 1000);
}

/** Styles fit for demo looks: visible, not theatrical, in catalog order. */
function demoStyles(styles) {
  const list = sortStyles((Array.isArray(styles) ? styles : []).filter((s) => s && s.id && !s.hidden));
  const everyday = list.filter((s) => !s.theatrical);
  return everyday.length ? everyday : list;
}

/**
 * Demo clients + consultations (all demo: true) and the dailyStats increments
 * they imply. Returns { ops, stats: { dayKey: deltas }, clientIds, consultationIds }.
 */
export function demoOps({ shopId, uid, styles, now = new Date(), paramsFromStyle, guardChart = DEFAULT_GUARD_CHART }) {
  const days = lastNDayKeys(7, now); // oldest first
  const keyFor = (offset) => days[days.length - 1 - offset];
  const pool = demoStyles(styles);
  const ops = [];
  const stats = {};
  const clientIds = DEMO_CLIENTS.map(() => autoId());
  const lastVisit = DEMO_CLIENTS.map(() => null);
  const firstVisit = DEMO_CLIENTS.map(() => null);
  const consultationIds = [];

  if (pool.length) {
    DEMO_PLAN.forEach((plan) => {
      const dayKey = keyFor(plan.day);
      let startedAt = muscatTime(dayKey, plan.hour, plan.minute);
      if (plan.day === 0) {
        // Today's demo visit sits shortly before "now" so it is never in the future.
        const { start } = muscatDayRange(dayKey);
        const recent = new Date(now.getTime() - 25 * 60 * 1000);
        startedAt = recent < start ? new Date(start.getTime() + 60 * 1000) : recent;
      }
      const style = pool[plan.style % pool.length];
      const params = demoParams(style, paramsFromStyle);
      const approved = APPROVED_STATUS.includes(plan.status);
      const decision = approved ? plan.decision : null;
      let approvedAt = approved ? new Date(startedAt.getTime() + decision * 1000) : null;
      if (approvedAt && approvedAt > now) approvedAt = new Date(now.getTime());
      const id = autoId();
      consultationIds.push(id);
      const clientId = plan.client === null ? null : clientIds[plan.client];
      if (plan.client !== null) {
        if (!lastVisit[plan.client] || startedAt > lastVisit[plan.client]) lastVisit[plan.client] = startedAt;
        if (!firstVisit[plan.client] || startedAt < firstVisit[plan.client]) firstVisit[plan.client] = startedAt;
      }
      ops.push({
        path: `shops/${shopId}/consultations/${id}`,
        data: {
          clientId,
          barberUid: uid,
          styleId: style.id,
          params,
          cutCard: approved ? demoCutCard(params, guardChart) : null,
          status: plan.status,
          startedAt: Timestamp.fromDate(startedAt),
          approvedAt: approvedAt ? Timestamp.fromDate(approvedAt) : null,
          decisionSeconds: decision,
          aiPreviewUsed: false,
          addOns: [],
          rating: plan.status === 'done' ? plan.rating : null,
          nextVisitDays: plan.status === 'done' ? plan.next : null,
          dayKey,
          demo: true,
          // Counted in dailyStats by this same batch (see consultations.js).
          approvalCountedAt: approved ? serverTimestamp() : null,
          addOnsCountedAt: plan.status === 'done' ? serverTimestamp() : null,
          ...createdStamp(uid),
        },
      });
      addStats(stats, dayKey, {
        consultations: 1,
        approvals: approved ? 1 : 0,
        totalDecisionSeconds: approved ? decision : 0,
        topStyles: approved ? { [style.id]: 1 } : {},
      });
    });
  }

  DEMO_CLIENTS.forEach((c, i) => {
    const visit = lastVisit[i] || new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
    const consentAt = firstVisit[i] || visit;
    ops.push({
      path: `shops/${shopId}/clients/${clientIds[i]}`,
      data: {
        displayName: c.displayName,
        ...clientSearchFields(c.displayName, null),
        phone: null,
        consent: { profile: true, at: Timestamp.fromDate(consentAt), by: uid },
        profile: coarseLabels(c.profile),
        growthMmPerDay: null,
        lastVisitAt: Timestamp.fromDate(visit),
        demo: true,
        ...createdStamp(uid),
      },
    });
  });

  for (const [dayKey, deltas] of Object.entries(stats)) {
    ops.push(statsOp(shopId, dayKey, deltas, uid));
  }
  return { ops: ops.filter(Boolean), stats, clientIds, consultationIds };
}

/**
 * dailyStats deltas that undo a set of consultations (used by "Delete demo data").
 * Mirrors what consultations.js and demoOps() add: consultations on create;
 * approvals, decision seconds and top styles once approved; add-ons once done.
 */
export function reverseStats(consultations) {
  const acc = {};
  for (const c of consultations) {
    if (!c || !c.dayKey) continue;
    const approved = APPROVED_STATUS.includes(c.status);
    const ds = Number(c.decisionSeconds);
    addStats(acc, c.dayKey, {
      consultations: -1,
      approvals: approved ? -1 : 0,
      totalDecisionSeconds: approved && Number.isFinite(ds) ? -ds : 0,
      addOns: Array.isArray(c.addOns) ? -c.addOns.length : 0,
      aiRenders: 0,
      topStyles: approved && c.styleId ? { [c.styleId]: -1 } : {},
    });
  }
  return acc;
}

