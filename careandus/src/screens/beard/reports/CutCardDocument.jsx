// Cut Card document (PRD 11.1): one component for the Cut Card screen, the A6 PDF,
// the 1080 x 1350 share image and window.print(). Inline styles only, so the same
// node rasterizes identically with html2canvas (fixed hex colors for print/share,
// theme tokens on screen). Works outside the app providers: pass `lang`.
//
// data = { card (buildCutCard), params?, style?, shop: { name, nameAr, logoUrl? },
//          barber: { name } | string, client: { displayName, walkIn } | null,
//          approved: { at, decisionSeconds } | null, at?, colors?, guardChart? }
//
// Variants: 'print' (A6, 440 CSS px wide: diagrams + table on page 1, lines, color,
// approval and maintenance on page 2), 'share' (600 CSS px, a compact 4:5 card for
// WhatsApp), 'screen' (fluid, theme colors).

import ZoneDiagram, { ZONE_DIAGRAM_PRINT_PALETTE, ZONE_DIAGRAM_SCREEN_PALETTE } from '../ui/ZoneDiagram.jsx';
import { translate, pickLang } from '../lib/i18n.js';
import { formatMm, formatOmr, formatPercent } from '../lib/format.js';
import { formatDayKey, formatMuscat, toDate } from '../lib/time.js';
import { DEFAULT_GUARD_CHART } from '../lib/guards.js';
import COLORS from '../../../data/beard/colors.json';
import LINES from '../../../data/beard/lines.json';
import FINISHES from '../../../data/beard/finishes.json';
import MUSTACHES from '../../../data/beard/mustaches.json';
import REASONS from '../../../data/beard/reasons.json';
import STYLES from '../../../data/beard/styles.json';
import { daysPhrase, trimPhrase, formatDuration, textDir } from './text.js';
import { jawRuler, JAW_RULER_MAJOR_MM, JAW_RULER_TICK_MM } from './jawRuler.js';

export const CUT_CARD_WIDTH = Object.freeze({ print: 440, share: 640 });

const PRINT = Object.freeze({
  paper: '#FFFFFF',
  ink: '#16171A',
  ink2: '#5E5A53',
  line: '#D9D2C6',
  brass: '#5B2A4D',
  keep: '#2E7D53',
  cut: '#A8331F',
  warn: '#9A6A12',
  // Text in the status colours (the print hexes already read on white paper).
  keepInk: '#2E7D53',
  cutInk: '#A8331F',
  warnInk: '#9A6A12',
});
const SCREEN = Object.freeze({
  paper: 'var(--surface)',
  ink: 'var(--text)',
  ink2: 'var(--text-2)',
  line: 'var(--line)',
  brass: 'var(--plum)',
  keep: 'var(--ok)',
  cut: 'var(--risk)',
  warn: 'var(--warn)',
  // AA text versions of the status colours (tokens.css --*-ink); the plain ones stay for dots and fills.
  keepInk: 'var(--ok)',
  cutInk: 'var(--risk)',
  warnInk: 'var(--warn)',
});

const FONT_BODY = "'IBM Plex Sans Arabic', system-ui, sans-serif";
const FONT_DISPLAY = { ar: "Amiri, Fraunces, serif", en: "Fraunces, Amiri, Georgia, serif" };
const NUM = { fontVariantNumeric: 'tabular-nums' };
const DAY_MS = 24 * 60 * 60 * 1000;
/** Notes worth repeating in the compact share table (the others are shown elsewhere). */
const SHARE_NOTES = new Set(['report.note.fade', 'report.note.keepNatural', 'report.note.scissor']);

const LINE_MAP = new Map(LINES.types.map((tp) => [tp.id, new Map(tp.options.map((o) => [o.id, o]))]));
const byId = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => x && x.id).map((x) => [x.id, x]));
const COLOR_MAP = byId(COLORS);
const FINISH_MAP = byId(FINISHES);
const MUSTACHE_MAP = byId(MUSTACHES);
const SAFETY_MAP = byId(REASONS.safetyQuestions);
const STYLE_MAP = byId(STYLES);
/** The barber's ruler laid along the jaw of the front diagram (same for every card). */
const JAW_RULER = jawRuler();
/** Visit-frequency answers the card can name (session.answers.visitFrequency). */
const FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly']);

/** Only text or a number is printed; anything else (a broken look) prints a dash. */
const printable = (v) => (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) ? v : '—');

function lineName(L, type, id) {
  const o = LINE_MAP.get(type)?.get(id);
  return o ? pickLang(L, o.name) : typeof id === 'string' ? id : '';
}

const sep = (L) => (L === 'ar' ? '، ' : ', ');

/** A catalog name used inside an English sentence starts lower case ("At the lip line" -> "at the lip line"). */
function midSentence(L, s) {
  const text = String(s || '');
  if (L !== 'en' || text.length < 2 || text[1] !== text[1].toLowerCase()) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function answerText(t, answer) {
  if (answer === true || answer === 'yes') return t('beard.report.safety.answer.yes');
  if (answer === false || answer === 'no') return t('beard.report.safety.answer.no');
  if (answer === 'unsure') return t('beard.report.safety.answer.unsure');
  return t('beard.report.safety.answer.none');
}

function noteText(t, L, note) {
  if (!note || !note.key) return '';
  const vars = { ...(note.vars || {}) };
  if (note.key === 'report.note.mustache') {
    const m = MUSTACHE_MAP.get(vars.id);
    if (!m) return '';
    vars.name = pickLang(L, m.name);
  }
  if (note.key === 'report.note.chin') vars.shape = t(`beard.report.chin.${vars.shape}`);
  return t(note.key, vars);
}

function guardText(L, t, guard) {
  if (!guard) return '';
  if (guard.kind === 'shave') return t('beard.report.note.shave');
  if (guard.kind === 'scissor') return t('beard.ui.zd.scissor');
  return pickLang(L, guard.label);
}

/** A run of user or catalog text with its own direction (names can be in either script). */
function Bidi({ text }) {
  return (
    <span dir={textDir(text)} style={{ unicodeBidi: 'isolate' }}>
      {text}
    </span>
  );
}

function Ltr({ children }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: 'isolate', ...NUM }}>
      {children}
    </span>
  );
}

function Dot({ color, round = false }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: round ? 4 : 2,
        background: color,
        marginInlineEnd: 5,
        verticalAlign: 'middle',
        flex: 'none',
      }}
    />
  );
}

function Logo({ shop, L, pal, size }) {
  const name = pickLang(L, { en: shop?.name || '', ar: shop?.nameAr || shop?.name || '' });
  if (shop && shop.logoUrl) {
    return (
      <img
        src={shop.logoUrl}
        alt={translate(L, 'report.cut.logo', { shop: name })}
        crossOrigin="anonymous"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, flex: 'none' }}
      />
    );
  }
  const letter = (name || 'L').trim().charAt(0);
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        border: `1.5px solid ${pal.brass}`,
        borderRadius: 6,
        color: pal.brass,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_DISPLAY[L],
        fontWeight: 600,
        fontSize: Math.round(size * 0.55),
        lineHeight: 1,
      }}
    >
      {letter}
    </div>
  );
}

function Section({ title, pal, fs, children, first = false }) {
  return (
    <section data-pdf-block="" style={{ paddingTop: first ? 0 : 8, marginTop: first ? 8 : 8, borderTop: first ? 0 : `1px solid ${pal.line}` }}>
      {title ? (
        <h3 style={{ margin: '0 0 5px', fontFamily: FONT_BODY, fontSize: fs.label, fontWeight: 600, color: pal.brass, lineHeight: 1.3 }}>
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

function Pair({ label, value, sub, pal, fs }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: fs.small, color: pal.ink2, lineHeight: 1.3 }}>{printable(label)}</div>
      <div style={{ fontSize: fs.body, color: pal.ink, fontWeight: 500, lineHeight: 1.35 }}>{printable(value)}</div>
      {sub ? <div style={{ fontSize: fs.small, color: pal.ink2, lineHeight: 1.3 }}>{printable(sub)}</div> : null}
    </div>
  );
}

/** Full table: zone, target, guard, note. */
function ZoneTable({ rows, L, t, pal, fs }) {
  const th = { textAlign: 'start', fontWeight: 600, color: pal.ink2, fontSize: fs.small, padding: '2px 4px', borderBottom: `1px solid ${pal.line}` };
  const td = { padding: '2px 4px', borderBottom: `1px solid ${pal.line}`, verticalAlign: 'top', fontSize: fs.body, color: pal.ink, lineHeight: 1.35 };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>{t('beard.report.cut.col.zone')}</th>
          <th style={{ ...th, textAlign: 'end' }}>{t('beard.report.cut.col.mm')}</th>
          <th style={th}>{t('beard.report.cut.col.guard')}</th>
          <th style={th}>{t('beard.report.cut.col.note')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.zone} data-pdf-block="">
            <td style={{ ...td, whiteSpace: 'nowrap' }}>
              <Dot color={r.shaved ? pal.cut : pal.keep} />
              {t(`beard.zone.${r.zone}`)}
            </td>
            <td style={{ ...td, textAlign: 'end', whiteSpace: 'nowrap', fontWeight: 600, ...NUM }}>{formatMm(r.mm, L)}</td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>
              <Ltr>{guardText(L, t, r.guard)}</Ltr>
            </td>
            <td style={{ ...td, color: pal.ink2, fontSize: fs.small }}>{r.guard && r.guard.kind === 'shave' ? '' : noteText(t, L, r.note)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Compact table for the share image: zone, target and guard, with the important note under the zone. */
function ZoneList({ rows, L, t, pal, fs }) {
  const td = { padding: '3px 4px', borderBottom: `1px solid ${pal.line}`, verticalAlign: 'top', fontSize: fs.body, color: pal.ink, lineHeight: 1.3 };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((r) => {
          const note = r.note && SHARE_NOTES.has(r.note.key) ? noteText(t, L, r.note) : '';
          return (
            <tr key={r.zone} data-pdf-block="">
              <td style={td}>
                <div style={{ whiteSpace: 'nowrap' }}>
                  <Dot color={r.shaved ? pal.cut : pal.keep} />
                  {t(`beard.zone.${r.zone}`)}
                </div>
                {note ? <div style={{ fontSize: fs.small, color: pal.ink2, paddingInlineStart: 12 }}>{note}</div> : null}
              </td>
              <td style={{ ...td, textAlign: 'end', whiteSpace: 'nowrap', fontWeight: 600, ...NUM }}>{formatMm(r.mm, L)}</td>
              <td style={{ ...td, textAlign: 'end', whiteSpace: 'nowrap', color: pal.ink2 }}>
                <Ltr>{guardText(L, t, r.guard)}</Ltr>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function lineValues(card, L, t) {
  const cheek = card.cheekLine || {};
  const neck = card.neckline || {};
  const must = card.mustache || { id: null, mm: 0, edge: card.mustacheEdge };
  const sb = card.sideburn || {};

  let neckValue;
  if (neck.followsJaw || neck.type === 'jaw') neckValue = t('beard.report.cut.neck.jaw');
  else {
    const mm = formatMm(neck.mmAboveAdamsApple, L);
    const key = neck.fingers === 1 ? 'report.cut.neck.one' : neck.fingers === 2 ? 'report.cut.neck.two' : 'report.cut.neck.many';
    neckValue = t(key, { n: neck.fingers, mm });
    if (neck.squared) neckValue = `${neckValue}${sep(L)}${t('beard.report.cut.neck.squared')}`;
  }

  const mustName = must.id && MUSTACHE_MAP.get(must.id) ? pickLang(L, MUSTACHE_MAP.get(must.id).name) : t('beard.zone.M');
  const edgeName = midSentence(L, lineName(L, 'mustacheEdge', must.edge || card.mustacheEdge));
  // "Trimmed short" already says "very short": the edge is not repeated ("شنب محفوف، محفوف").
  const edgeSaid = !edgeName || mustName.toLowerCase().includes(edgeName.toLowerCase());
  let mustValue;
  if (!(must.mm > 0)) mustValue = t('beard.report.cut.mustacheShaved');
  else if (edgeSaid) mustValue = t('beard.report.cut.mustacheNoEdge', { name: mustName, mm: formatMm(must.mm, L) });
  else mustValue = t('beard.report.cut.mustacheValue', { name: mustName, edge: edgeName, mm: formatMm(must.mm, L) });

  let sbSub = '';
  if (Number.isFinite(sb.fadeStartMm) && Number.isFinite(sb.fadeEndMm) && sb.fadeEndMm > sb.fadeStartMm) {
    sbSub = t('beard.report.cut.fadeRange', { from: formatMm(sb.fadeStartMm, L), to: formatMm(sb.fadeEndMm, L) });
  } else if (Number.isFinite(sb.fadeStartMm)) {
    sbSub = t('beard.report.cut.fadeStart', { mm: formatMm(sb.fadeStartMm, L) });
  }
  const finish = FINISH_MAP.get(card.finish);

  return [
    {
      id: 'cheek',
      label: t('beard.report.cut.cheekLine'),
      value: t('beard.report.cut.cheekValue', { type: lineName(L, 'cheek', cheek.type), mm: formatMm(cheek.mmAboveJaw, L) }),
      sub: cheek.source === 'measured' ? t('beard.report.cut.cheekMeasured') : t('beard.report.cut.cheekDefault'),
    },
    { id: 'neck', label: t('beard.report.cut.neckline'), value: neckValue },
    { id: 'mustache', label: t('beard.report.cut.mustache'), value: mustValue },
    { id: 'sideburn', label: t('beard.report.cut.sideburn'), value: lineName(L, 'sideburn', sb.join), sub: sbSub },
    { id: 'edge', label: t('beard.report.cut.edge'), value: lineName(L, 'edge', card.edge) },
    { id: 'finish', label: t('beard.report.cut.finish'), value: finish ? pickLang(L, finish.name) : typeof card.finish === 'string' ? card.finish : '' },
  ];
}

function LinesGrid({ card, L, t, pal, fs, columns, compact = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '6px 12px' }}>
      {lineValues(card, L, t).map((p) => (
        <Pair key={p.id} pal={pal} fs={fs} label={p.label} value={p.value} sub={compact && p.id === 'cheek' ? '' : p.sub} />
      ))}
    </div>
  );
}

/**
 * The colour line: the catalog name, and how much grey is kept when the look sets it.
 * Grey blending is one phrase ("Grey blending, 50% grey kept"), never the name twice.
 */
export function colorLine(card, colors, L) {
  const t = (k, v) => translate(L, k, v);
  const color = card && card.color && typeof card.color === 'object' ? card.color : { id: 'natural', questions: [] };
  const entry = byId(colors).get(color.id) || COLOR_MAP.get(color.id);
  const natural = !entry || color.id === 'natural';
  const grey = Number.isFinite(color.greyTarget) ? Math.round(color.greyTarget) : null;
  const pct = grey === null ? '' : formatPercent(grey, L);
  if (natural) return t('beard.report.cut.colorNatural');
  if (color.id === 'grey-blend') return t('beard.report.cut.greyKeep', { pct: pct || formatPercent(entry.greyDefault ?? 50, L) });
  const name = pickLang(L, entry.name);
  return grey === null ? name : t('beard.report.cut.greyKept', { name, pct });
}

function colorInfo(card, colors, L) {
  const color = card.color || { id: 'natural', questions: [] };
  return { color, name: colorLine(card, colors, L), questions: Array.isArray(color.questions) ? color.questions : [] };
}

function ColorBlock({ card, colors, L, t, pal, fs, compact = false }) {
  const { color, name, questions } = colorInfo(card, colors, L);
  const tone = { ok: pal.keep, ask: pal.warn, stop: pal.cut };
  const toneInk = { ok: pal.keepInk, ask: pal.warnInk, stop: pal.cutInk };
  const levelText = { ok: t('beard.report.safety.ok'), ask: t('beard.report.safety.ask'), stop: t('beard.report.safety.stop') };
  const shown = compact ? questions.filter((q) => q.level !== 'ok') : questions;
  return (
    <div>
      <div style={{ fontSize: fs.body, color: pal.ink, fontWeight: 500 }}>{name}</div>
      {shown.length ? (
        <div style={{ marginTop: 4 }}>
          {compact ? null : <div style={{ fontSize: fs.small, color: pal.ink2, marginBottom: 2 }}>{t('beard.report.cut.safety')}</div>}
          {shown.map((q) => {
            const def = SAFETY_MAP.get(q.id);
            // The short flag states the risk, so it is shown only when the answer is a risk;
            // a question nobody has answered yet is shown as the question.
            const text = def ? pickLang(L, compact && q.risk ? def.flag : def.text) : q.id;
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'baseline', marginBottom: 2 }}>
                <Dot color={tone[q.level] || pal.ink2} round />
                <div style={{ minWidth: 0, fontSize: fs.small, color: pal.ink, lineHeight: 1.35 }}>
                  <span>{text}</span>
                  {compact ? null : <span style={{ color: pal.ink2 }}>{` ${t('beard.report.safety.answerIs', { answer: answerText(t, q.answer) })}`}</span>}
                  <span style={{ fontWeight: 600, color: toneInk[q.level] || pal.ink }}>{` · ${levelText[q.level] || ''}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {color.blocked ? <div style={{ marginTop: 3, fontSize: fs.body, fontWeight: 600, color: pal.cutInk }}>{t('beard.report.cut.blocked')}</div> : null}
    </div>
  );
}

/**
 * Why the next visit is not the trim interval, when it is not (chair:F18): he shapes it
 * at home between visits ('homeTrim'), or he comes more often than the style needs
 * ('visits'). Empty when the next visit is the trim interval itself.
 */
export function visitReason(card, L) {
  const t = (k, v) => translate(L, k, v);
  const basis = card ? card.nextVisitBasis : null;
  if (basis === 'homeTrim') return t('beard.report.cut.visit.homeTrim');
  if (basis === 'visits' && FREQUENCIES.has(card.visitFrequency)) {
    return t('beard.report.cut.visit.visits', { freq: t(`beard.report.cut.freq.${card.visitFrequency}`) });
  }
  return '';
}

/** Trim interval, next visit, and why they differ (both layouts). */
function Maintenance({ card, nextDate, L, t, pal, fs, growth = true }) {
  const reason = visitReason(card, L);
  const trim = Number.isFinite(card.trimDays) && card.trimDays > 0 ? card.trimDays : null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: fs.small, color: pal.ink2, lineHeight: 1.3 }}>{t('beard.report.cut.maintenance')}</div>
      {trim ? <div style={{ fontSize: fs.body, color: pal.ink, fontWeight: 500, lineHeight: 1.35 }}>{trimPhrase(L, trim)}</div> : null}
      <div style={{ fontSize: fs.body, color: pal.ink, fontWeight: 500, lineHeight: 1.35 }}>
        {t('beard.report.cut.nextVisit', { date: nextDate, days: daysPhrase(L, card.nextVisitDays) })}
      </div>
      {reason ? <div style={{ fontSize: fs.small, color: pal.ink2, lineHeight: 1.3 }}>{reason}</div> : null}
      {growth && Number.isFinite(card.growthMmPerDay) ? (
        <div style={{ fontSize: fs.small, color: pal.ink2, lineHeight: 1.3 }}>{t('beard.report.cut.growth', { rate: card.growthMmPerDay })}</div>
      ) : null}
    </div>
  );
}

function ApprovalMaintenance({ card, approval, nextDate, L, t, pal, fs }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 12px' }}>
      <Pair pal={pal} fs={fs} label={t('beard.report.cut.approved')} value={approval} />
      <Maintenance card={card} nextDate={nextDate} L={L} t={t} pal={pal} fs={fs} />
    </div>
  );
}

/** The barber's ruler laid along the jaw, drawn over the front diagram in its own viewBox. */
function JawRulerOverlay({ color }) {
  if (!JAW_RULER) return null;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${JAW_RULER.width} ${JAW_RULER.height}`}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      <path d={JAW_RULER.d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <g stroke={color} strokeLinecap="round">
        {JAW_RULER.ticks.map((tk, i) => (
          <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} strokeWidth={tk.major ? 1.25 : 0.9} />
        ))}
      </g>
    </svg>
  );
}

/**
 * @param {{ data: object, lang?: 'ar'|'en', variant?: 'print'|'share'|'screen', className?: string }} props
 */
export default function CutCardDocument({ data, lang = 'ar', variant = 'print', className }) {
  const L = lang === 'en' ? 'en' : 'ar';
  const t = (k, v) => translate(L, k, v);
  const d = data || {};
  const card = d.card;
  if (!card || !Array.isArray(card.rows)) return null;
  const screen = variant === 'screen';
  const share = variant === 'share';
  const pal = screen ? SCREEN : PRINT;
  const fs = share
    ? { body: 13, small: 11, label: 12.5, title: 24, shop: 18, meta: 11.5 }
    : screen
      ? { body: 15, small: 13, label: 14, title: 26, shop: 18, meta: 13 }
      : { body: 11, small: 9.5, label: 10.5, title: 19, shop: 15, meta: 9.5 };
  const width = screen ? undefined : CUT_CARD_WIDTH[share ? 'share' : 'print'];
  const pad = share ? 22 : screen ? 16 : 14;

  const shop = d.shop || {};
  const shopName = pickLang(L, { en: shop.name || '', ar: shop.nameAr || shop.name || '' });
  const barber = typeof d.barber === 'string' ? d.barber : d.barber?.name || '';
  const client = d.client && !d.client.walkIn && d.client.displayName ? d.client.displayName : t('beard.common.walkIn');
  const at = toDate(d.at || (d.approved && d.approved.at) || card.createdAt || new Date());
  const style = d.style || STYLE_MAP.get(card.styleId) || null;
  const styleName = style ? pickLang(L, style.name) : card.styleId || '';
  const styleOther = style ? pickLang(L === 'ar' ? 'en' : 'ar', style.name) : '';
  const chart = Array.isArray(d.guardChart) && d.guardChart.length ? d.guardChart : DEFAULT_GUARD_CHART;
  const zdPalette = screen ? ZONE_DIAGRAM_SCREEN_PALETTE : ZONE_DIAGRAM_PRINT_PALETTE;
  const diagramSize = share ? 196 : 176;
  const prices = Array.isArray(d.prices) ? d.prices : [];

  const approvedAt = d.approved && d.approved.at ? toDate(d.approved.at) : null;
  const approval = approvedAt
    ? t('beard.report.cut.approvedValue', {
        time: formatMuscat(approvedAt, L, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
        duration: formatDuration(d.approved.decisionSeconds) || '0:00',
      })
    : t('beard.report.cut.notApproved');
  const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(String(card.nextVisitDayKey || ''))
    ? formatDayKey(card.nextVisitDayKey, L)
    : formatMuscat(new Date(at.getTime() + (card.nextVisitDays || 0) * DAY_MS), L, { dateStyle: 'medium' });

  const diagram = (view) => (
    <figure style={{ margin: 0, minWidth: 0, width: screen ? '100%' : diagramSize }}>
      <div style={{ position: 'relative' }}>
        <ZoneDiagram
          cutCard={card}
          params={d.params || null}
          view={view}
          lang={L}
          size={screen ? undefined : diagramSize}
          guardChart={chart}
          palette={zdPalette}
        />
        {view === 'front' ? <JawRulerOverlay color={zdPalette.brass} /> : null}
      </div>
      <figcaption style={{ textAlign: 'center', fontSize: fs.small, color: pal.ink2, lineHeight: 1.2 }}>
        {view === 'front' ? t('beard.report.cut.front') : t('beard.report.cut.profile')}
      </figcaption>
    </figure>
  );

  // The ruler's key, under the two diagrams.
  const rulerKey = JAW_RULER ? (
    <div style={{ marginTop: 3, fontSize: fs.small, color: pal.ink2, textAlign: 'center', lineHeight: 1.3 }}>
      <Dot color={pal.brass} />
      {t('beard.report.cut.jawRuler', { tick: formatMm(JAW_RULER_TICK_MM, L), major: formatMm(JAW_RULER_MAJOR_MM, L) })}
    </div>
  ) : null;

  const header = (
    <header data-pdf-block="" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo shop={shop} L={L} pal={pal} size={share ? 46 : 34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fs.shop, fontWeight: 600, lineHeight: 1.25, overflowWrap: 'break-word' }}>
          <Bidi text={shopName} />
        </div>
        <div style={{ fontSize: fs.meta, fontWeight: 600, color: pal.brass, lineHeight: 1.3 }}>{t('beard.report.cut.title')}</div>
      </div>
      <div style={{ fontSize: fs.meta, color: pal.ink2, textAlign: 'end', lineHeight: 1.4, maxWidth: '55%', minWidth: 0, overflowWrap: 'anywhere' }}>
        <div style={{ color: pal.ink }}>{formatMuscat(at, L)}</div>
        <div>
          {t('beard.report.cut.barber')}:{' '}
          <span style={{ color: pal.ink }}>
            <Bidi text={barber || '—'} />
          </span>
        </div>
        <div>
          {t('beard.report.cut.client')}:{' '}
          <span style={{ color: pal.ink }}>
            <Bidi text={client} />
          </span>
        </div>
      </div>
    </header>
  );

  const title = (
    <div data-pdf-block="" style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${pal.brass}`, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ fontFamily: FONT_DISPLAY[L], fontSize: fs.title, fontWeight: 600, lineHeight: 1.2 }}>
        <Bidi text={styleName} />
      </div>
      {styleOther && styleOther !== styleName ? (
        <div style={{ fontSize: fs.small, color: pal.ink2 }} lang={L === 'ar' ? 'en' : 'ar'} dir={textDir(styleOther)}>
          {styleOther}
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <footer data-pdf-block="" style={{ marginTop: 8, paddingTop: 5, borderTop: `1px solid ${pal.brass}`, fontSize: fs.small, color: pal.ink2, lineHeight: 1.35 }}>
      <div style={{ color: pal.ink, fontWeight: 500 }}>{t('beard.report.cut.approx')}</div>
      {share ? null : <div>{t('beard.report.cut.madeWith')}</div>}
    </footer>
  );

  const rootStyle = {
    width,
    maxWidth: screen ? 560 : undefined,
    boxSizing: 'border-box',
    padding: pad,
    background: pal.paper,
    color: pal.ink,
    fontFamily: FONT_BODY,
    fontSize: fs.body,
    lineHeight: 1.4,
    borderRadius: screen ? 16 : 0,
    border: screen ? `1px solid ${pal.line}` : undefined,
    textAlign: 'start',
  };

  if (share) {
    const half = Math.ceil(card.rows.length / 2);
    return (
      <article dir={L === 'ar' ? 'rtl' : 'ltr'} lang={L} className={className} style={rootStyle}>
        {header}
        {title}
        <div data-pdf-block="" style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 28 }}>
            {diagram('front')}
            {diagram('profile')}
          </div>
          {rulerKey}
        </div>
        <div data-pdf-block="" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 6 }}>
          <ZoneList rows={card.rows.slice(0, half)} L={L} t={t} pal={pal} fs={fs} />
          <ZoneList rows={card.rows.slice(half)} L={L} t={t} pal={pal} fs={fs} />
        </div>
        <Section title={t('beard.report.cut.lines')} pal={pal} fs={fs}>
          <LinesGrid card={card} L={L} t={t} pal={pal} fs={fs} columns={3} compact />
        </Section>
        <Section pal={pal} fs={fs}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.2fr', gap: '6px 12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: fs.small, color: pal.ink2, lineHeight: 1.3 }}>{t('beard.report.cut.color')}</div>
              <ColorBlock card={card} colors={d.colors} L={L} t={t} pal={pal} fs={fs} compact />
            </div>
            <Pair pal={pal} fs={fs} label={t('beard.report.cut.approved')} value={approval} />
            <Maintenance card={card} nextDate={nextDate} L={L} t={t} pal={pal} fs={fs} growth={false} />
          </div>
        </Section>
        {footer}
      </article>
    );
  }

  return (
    <article dir={L === 'ar' ? 'rtl' : 'ltr'} lang={L} className={className} style={rootStyle}>
      {header}
      {title}
      <div data-pdf-block="" style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: screen ? 12 : 24 }}>
          {diagram('front')}
          {diagram('profile')}
        </div>
        {rulerKey}
      </div>
      <Section pal={pal} fs={fs} first>
        <ZoneTable rows={card.rows} L={L} t={t} pal={pal} fs={fs} />
      </Section>
      <Section title={t('beard.report.cut.lines')} pal={pal} fs={fs}>
        <LinesGrid card={card} L={L} t={t} pal={pal} fs={fs} columns={2} />
      </Section>
      <Section title={t('beard.report.cut.color')} pal={pal} fs={fs}>
        <ColorBlock card={card} colors={d.colors} L={L} t={t} pal={pal} fs={fs} />
      </Section>
      {prices.length ? (
        <Section title={t('beard.report.cut.prices')} pal={pal} fs={fs}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2px 12px' }}>
            {prices.map((p, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Bidi text={pickLang(L, { en: p.name || p.nameAr, ar: p.nameAr || p.name })} />
                </div>
                <div style={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{formatOmr(p.priceOmr, L)}</div>
              </div>
            ))}
            <div style={{ fontWeight: 600, borderTop: `1px solid ${pal.line}`, paddingTop: 2 }}>{t('beard.approve.card.total')}</div>
            <div style={{ fontWeight: 600, borderTop: `1px solid ${pal.line}`, paddingTop: 2, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>
              {formatOmr(prices.reduce((sum, p) => sum + (Number(p.priceOmr) || 0), 0), L)}
            </div>
          </div>
        </Section>
      ) : null}
      <Section pal={pal} fs={fs}>
        <ApprovalMaintenance card={card} approval={approval} nextDate={nextDate} L={L} t={t} pal={pal} fs={fs} />
      </Section>
      {footer}
    </article>
  );
}
