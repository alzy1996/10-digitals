// Daily report numbers (PRD 8.3, 11.2) from consultations, staff, products and the
// day's stats doc. Pure functions so the PDF, the CSV export and the tests agree.
// Prices only ever come from the owner's products list: an add-on whose product is
// unknown is counted but never priced.

import { LIMITS } from '../config/app.js';
import { roundOmr } from '../lib/format.js';
import { pickLang } from '../lib/i18n/useT.js';
import STYLES from '../data/styles.json';

export { formatDuration } from './text.js';

export const APPROVED_STATUSES = Object.freeze(['approved', 'done']);
export const TOP_STYLES_N = 5;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

/** Consultations of Muscat days startKey..endKey (inclusive); demo ones only with includeDemo. */
export function filterConsultations(list, { startKey = null, endKey = null, includeDemo = false } = {}) {
  return (Array.isArray(list) ? list : []).filter((c) => {
    if (!c || typeof c !== 'object') return false;
    if (!includeDemo && c.demo === true) return false;
    if (startKey && !(String(c.dayKey || '') >= startKey)) return false;
    if (endKey && !(String(c.dayKey || '') <= endKey)) return false;
    return true;
  });
}

export function isApproved(c) {
  return Boolean(c) && APPROVED_STATUSES.includes(c.status);
}

/** Style display name {en, ar} from the shop's styles, then the seed catalog, then the id. */
export function styleNameOf(styleId, styles) {
  const pools = [Array.isArray(styles) ? styles : [], STYLES];
  for (const pool of pools) {
    const s = pool.find((x) => x && (x.id === styleId || x.styleId === styleId));
    if (s && s.name) return typeof s.name === 'string' ? { en: s.name, ar: s.nameAr || s.name } : s.name;
  }
  return { en: String(styleId || ''), ar: String(styleId || '') };
}

/** Staff display name (name, else the e-mail's local part, else a short uid). */
export function staffNameOf(uid, staff) {
  const s = (Array.isArray(staff) ? staff : []).find((x) => x && (x.uid === uid || x.id === uid));
  if (s) {
    if (s.name) return String(s.name);
    if (s.email) return String(s.email).split('@')[0];
  }
  return uid ? String(uid).slice(0, 6) : '';
}

/** Product display name for a language ({ name, nameAr }). */
export function productNameOf(p, lang) {
  if (!p) return '';
  return pickLang(lang, { en: p.name || '', ar: p.nameAr || '' });
}

/** Add-ons sold: per product count and OMR totals from the owner's prices. */
export function addOnsSummary(consultations, products) {
  const byId = new Map((Array.isArray(products) ? products : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const counts = new Map();
  for (const c of consultations) {
    for (const raw of Array.isArray(c.addOns) ? c.addOns : []) {
      const id = typeof raw === 'string' ? raw : raw && raw.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const items = [...counts.entries()].map(([id, count]) => {
    const p = byId.get(id) || null;
    const unit = p && isNum(Number(p.priceOmr)) && p.priceOmr !== null && p.priceOmr !== '' ? roundOmr(Number(p.priceOmr)) : null;
    return {
      id,
      product: p,
      known: Boolean(p),
      count,
      unitOmr: unit,
      totalOmr: unit === null ? null : roundOmr(unit * count),
    };
  });
  items.sort((a, b) => b.count - a.count || (b.totalOmr || 0) - (a.totalOmr || 0) || a.id.localeCompare(b.id));
  const count = items.reduce((s, x) => s + x.count, 0);
  const totalOmr = roundOmr(items.reduce((s, x) => s + (x.totalOmr || 0), 0));
  return { items, count, totalOmr, unpriced: items.filter((x) => x.totalOmr === null).reduce((s, x) => s + x.count, 0) };
}

/**
 * Every KPI of one report period.
 * @returns {{ consultations, approvals, conversionPct, avgDecisionSeconds, aiPreviewsUsed, aiCap,
 *   addOns, avgRating, ratingCount, perBarber, topStyles }}
 */
export function summarizeConsultations(list, { products = [], staff = [], styles = [], stats = null, settings = null, topN = TOP_STYLES_N } = {}) {
  const all = Array.isArray(list) ? list : [];
  const approved = all.filter(isApproved);
  const decisions = approved.map((c) => Number(c.decisionSeconds)).filter((n) => Number.isFinite(n) && n >= 0);
  const ratings = all.map((c) => Number(c.rating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);

  const statRenders = stats && isNum(Number(stats.aiRenders)) ? Number(stats.aiRenders) : null;
  const aiPreviewsUsed = statRenders !== null ? statRenders : all.filter((c) => c.aiPreviewUsed === true).length;
  const capRaw = settings && isNum(Number(settings.aiDailyCap)) ? Number(settings.aiDailyCap) : LIMITS.aiDailyCapShopDefault;

  const barbers = new Map();
  for (const c of all) {
    const uid = c.barberUid || '';
    if (!barbers.has(uid)) barbers.set(uid, []);
    barbers.get(uid).push(c);
  }
  const perBarber = [...barbers.entries()].map(([uid, items]) => {
    const ok = items.filter(isApproved);
    const d = ok.map((c) => Number(c.decisionSeconds)).filter((n) => Number.isFinite(n) && n >= 0);
    const r = items.map((c) => Number(c.rating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
    return {
      uid,
      name: staffNameOf(uid, staff),
      consultations: items.length,
      approvals: ok.length,
      avgDecisionSeconds: d.length ? Math.round(mean(d)) : null,
      avgRating: round1(mean(r)),
    };
  });
  perBarber.sort((a, b) => b.consultations - a.consultations || b.approvals - a.approvals || a.name.localeCompare(b.name));

  const styleCounts = new Map();
  for (const c of approved) {
    const id = c.styleId || (c.params && c.params.styleId);
    if (!id) continue;
    styleCounts.set(id, (styleCounts.get(id) || 0) + 1);
  }
  const topStyles = [...styleCounts.entries()]
    .map(([styleId, count]) => ({ styleId, name: styleNameOf(styleId, styles), count }))
    .sort((a, b) => b.count - a.count || a.styleId.localeCompare(b.styleId))
    .slice(0, topN);

  return {
    consultations: all.length,
    approvals: approved.length,
    conversionPct: all.length ? Math.round((approved.length / all.length) * 100) : null,
    avgDecisionSeconds: decisions.length ? Math.round(mean(decisions)) : null,
    aiPreviewsUsed,
    aiCap: Math.max(0, Math.round(capRaw)),
    addOns: addOnsSummary(all, products),
    avgRating: round1(mean(ratings)),
    ratingCount: ratings.length,
    perBarber,
    topStyles,
  };
}

/** One Muscat day (PRD 11.2): filter by dayKey and demo, then summarize. */
export function summarizeDay({ consultations, dayKey, includeDemo = false, ...opts } = {}) {
  const list = filterConsultations(consultations, { startKey: dayKey, endKey: dayKey, includeDemo });
  return { dayKey, includeDemo: Boolean(includeDemo), ...summarizeConsultations(list, opts) };
}
