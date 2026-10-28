// Cut Card read-outs for the screens: zones grouped for the big "at a glance" numbers,
// guard and line labels, and the short bilingual texts that go to WhatsApp (the app
// never sends them itself). Pure functions over the buildCutCard() result.

import { translate, pickLang } from '../lib/i18n.js';
import { formatMm } from '../lib/format.js';
import { cutCardShareText, reminderText } from '../reports/share.js';

const SINGLE_FIRST = Object.freeze(['M', 'S', 'C']);
const PAIRS = Object.freeze(['J', 'K', 'B']);
const LANGS = Object.freeze(['ar', 'en']);

const sep = (L) => (L === 'ar' ? '، ' : ', ');

function sameCut(a, b) {
  if (!a || !b || a.mm !== b.mm) return false;
  const ga = a.guard || {};
  const gb = b.guard || {};
  return ga.kind === gb.kind && (ga.guardId || null) === (gb.guardId || null);
}

/**
 * Card rows in reading order (mustache, soul patch, chin, jawline, cheeks, sideburns,
 * neck). A left / right pair with the same cut becomes one item ("Jawline, both sides").
 * @returns {Array<{ id: string, zones: string[], pair: boolean, mm: number, guard: object, shaved: boolean, note: object|null }>}
 */
export function groupRows(rows) {
  const by = new Map((Array.isArray(rows) ? rows : []).filter((r) => r && r.zone).map((r) => [r.zone, r]));
  const out = [];
  const single = (zone) => {
    const r = by.get(zone);
    if (r) out.push({ id: zone, zones: [zone], pair: false, mm: r.mm, guard: r.guard, shaved: Boolean(r.shaved), note: r.note || null });
  };
  for (const z of SINGLE_FIRST) single(z);
  for (const g of PAIRS) {
    const l = by.get(`${g}_L`);
    const r = by.get(`${g}_R`);
    if (l && r && sameCut(l, r)) {
      out.push({ id: g, zones: [l.zone, r.zone], pair: true, mm: l.mm, guard: l.guard, shaved: Boolean(l.shaved), note: l.note || null });
    } else {
      single(`${g}_L`);
      single(`${g}_R`);
    }
  }
  single('N');
  return out;
}

/** "Jawline" for a merged pair, "Jawline, left" for one side. */
export function itemLabel(t, item) {
  return item.pair ? t(`beard.approve.group.${item.id}`) : t(`beard.zone.${item.id}`);
}

/** Guard text: "#3", "No guard", "Shave", "Scissor". */
export function guardLabel(L, t, guard) {
  if (!guard) return '';
  if (guard.kind === 'shave') return t('beard.report.note.shave');
  if (guard.kind === 'scissor') return t('beard.ui.zd.scissor');
  return pickLang(L, guard.label) || '';
}

/** Number part of a length, as formatMm writes it (Latin digits, one decimal when needed). */
export function mmNumber(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n)) return '';
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

/** Neckline as words: "2 fingers" (with the mm separately) or "Follows the jaw". */
export function neckWords(t, neck) {
  const n = neck || {};
  if (n.followsJaw || n.type === 'jaw' || !Number.isFinite(n.mmAboveAdamsApple)) return { words: t('beard.approve.card.followsJaw'), mm: null };
  const key = n.fingers === 1 ? 'approve.card.fingers.one' : n.fingers === 2 ? 'approve.card.fingers.two' : 'approve.card.fingers.many';
  return { words: t(key, { n: n.fingers }), mm: n.mmAboveAdamsApple };
}

/** One language of the short Cut Card text for WhatsApp. */
export function cardTextFor(lang, { card, shop, style }) {
  const L = lang === 'en' ? 'en' : 'ar';
  const t = (k, v) => translate(L, k, v);
  const items = groupRows(card && card.rows);
  const lines = [cutCardShareText({ lang: L, shop, style, card })];
  const kept = items.filter((i) => !i.shaved);
  if (kept.length) {
    lines.push(kept.map((i) => `${itemLabel(t, i)} ${formatMm(i.mm, L)} (${guardLabel(L, t, i.guard)})`).join(' · '));
  }
  const shaved = items.filter((i) => i.shaved);
  if (shaved.length) lines.push(t('beard.approve.share.shaved', { zones: shaved.map((i) => itemLabel(t, i)).join(sep(L)) }));
  const cheek = card && card.cheekLine;
  const neck = neckWords(t, card && card.neckline);
  const cheekText = cheek && Number.isFinite(cheek.mmAboveJaw) ? `${t('beard.report.cut.cheekLine')}: ${formatMm(cheek.mmAboveJaw, L)} ${t('beard.approve.card.aboveJaw')}` : '';
  const neckText = `${t('beard.report.cut.neckline')}: ${neck.words}${neck.mm !== null ? `${sep(L)}${formatMm(neck.mm, L)} ${t('beard.approve.card.aboveApple')}` : ''}`;
  lines.push(cheekText ? t('beard.approve.share.lines', { cheek: cheekText, neck: neckText }) : neckText);
  lines.push(t('beard.report.cut.approx'));
  return lines.join('\n');
}

/** The Cut Card text in Arabic and English, one after the other. */
export function cardTextBilingual(data) {
  return LANGS.map((L) => cardTextFor(L, data)).join('\n\n');
}

/** The next-visit reminder in Arabic and English, one after the other. */
export function reminderBilingual({ shop, clientName, dayKey }) {
  return LANGS.map((L) => reminderText({ lang: L, shop, clientName, dayKey })).join('\n\n');
}
