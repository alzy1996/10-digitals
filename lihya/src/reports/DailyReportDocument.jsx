// Daily report document (PRD 11.2), A4: one Muscat day, KPIs, per-barber table,
// add-ons from the owner's products, and the top styles as a bar chart drawn on a
// canvas. Inline styles with fixed print colors so html2canvas and window.print()
// produce the same page. Works outside the app providers: pass `lang`.

import { useLayoutEffect, useRef } from 'react';
import { translate, pickLang } from '../lib/i18n/useT.js';
import { formatOmr, formatPercent } from '../lib/format.js';
import { formatDayKey, formatMuscat } from '../lib/time.js';
import { formatDuration, textDir } from './text.js';
import { productNameOf } from './summary.js';

export const DAILY_REPORT_WIDTH = 794;

const PAL = Object.freeze({
  paper: '#FFFFFF',
  ink: '#16171A',
  ink2: '#5E5A53',
  line: '#D9D2C6',
  soft: '#F6F3EE',
  brass: '#7E622A',
  warn: '#9A6A12',
});
const FONT_BODY = "'IBM Plex Sans Arabic', system-ui, sans-serif";
const FONT_DISPLAY = { ar: "'Reem Kufi', 'IBM Plex Sans Arabic', sans-serif", en: "'Barlow Condensed', 'IBM Plex Sans Arabic', sans-serif" };
const NUM = { fontVariantNumeric: 'tabular-nums' };
const DASH = '—';

const CHART = Object.freeze({ rowH: 30, bar: 18, pad: 6, labelW: 210, valueW: 44, font: 13 });

function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Draw a single-series horizontal bar chart; mirrored for Arabic (labels on the right). */
export function drawBarChart(canvas, { items, width, lang, pal = PAL }) {
  if (!canvas) return;
  const rtl = lang === 'ar';
  const n = Math.max(1, items.length);
  const height = n * CHART.rowH + CHART.pad * 2;
  const ratio = Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const max = Math.max(1, ...items.map((i) => i.value));
  const plotW = width - CHART.labelW - CHART.valueW - 8;
  const X = (x) => (rtl ? width - x : x);
  const base = X(CHART.labelW);

  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(base) + 0.5, CHART.pad - 2);
  ctx.lineTo(Math.round(base) + 0.5, height - CHART.pad + 2);
  ctx.stroke();

  ctx.font = `500 ${CHART.font}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  items.forEach((item, i) => {
    const cy = CHART.pad + i * CHART.rowH + CHART.rowH / 2;
    ctx.fillStyle = pal.ink;
    ctx.direction = textDir(item.label) || (rtl ? 'rtl' : 'ltr');
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(fitText(ctx, item.label, CHART.labelW - 12), X(0), cy);

    const len = Math.max(4, (item.value / max) * plotW);
    const y = cy - CHART.bar / 2;
    const r = Math.min(4, len / 2);
    const x0 = base;
    const x1 = rtl ? base - len : base + len;
    ctx.fillStyle = pal.brass;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1 + (rtl ? r : -r), y);
    ctx.arcTo(x1, y, x1, y + r, r);
    ctx.lineTo(x1, y + CHART.bar - r);
    ctx.arcTo(x1, y + CHART.bar, x1 + (rtl ? r : -r), y + CHART.bar, r);
    ctx.lineTo(x0, y + CHART.bar);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.ink;
    ctx.font = `600 ${CHART.font}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
    ctx.direction = 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(String(item.value), rtl ? x1 - 6 : x1 + 6, cy);
    ctx.font = `500 ${CHART.font}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  });
}

function BarChart({ items, width, lang, label }) {
  const ref = useRef(null);
  const height = Math.max(1, items.length) * CHART.rowH + CHART.pad * 2;
  useLayoutEffect(() => {
    let alive = true;
    const draw = () => {
      if (alive) drawBarChart(ref.current, { items, width, lang });
    };
    draw();
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (fonts && fonts.ready) fonts.ready.then(draw).catch(() => {});
    return () => {
      alive = false;
    };
  }, [items, width, lang]);
  const desc = items.map((i) => `${i.label}: ${i.value}`).join('; ');
  return <canvas ref={ref} role="img" aria-label={`${label}. ${desc}`} style={{ width, height, display: 'block' }} />;
}

function Bidi({ text }) {
  return (
    <span dir={textDir(text)} style={{ unicodeBidi: 'isolate' }}>
      {text}
    </span>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div style={{ border: `1px solid ${PAL.line}`, borderRadius: 10, padding: '10px 12px', minWidth: 0, background: PAL.paper }}>
      <div style={{ fontSize: 11, color: PAL.ink2, lineHeight: 1.35 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.25, color: PAL.ink, marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: PAL.ink2, lineHeight: 1.35 }}>{sub}</div> : null}
    </div>
  );
}

function Block({ title, children }) {
  return (
    <section data-pdf-block="" style={{ marginTop: 18 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: PAL.brass, fontFamily: FONT_BODY, lineHeight: 1.3 }}>{title}</h2>
      {children}
    </section>
  );
}

const th = { textAlign: 'start', fontWeight: 600, fontSize: 11, color: PAL.ink2, padding: '5px 6px', borderBottom: `1px solid ${PAL.line}` };
const td = { fontSize: 12.5, color: PAL.ink, padding: '5px 6px', borderBottom: `1px solid ${PAL.line}`, verticalAlign: 'top' };
const tdNum = { ...td, textAlign: 'end', whiteSpace: 'nowrap', ...NUM };
const thNum = { ...th, textAlign: 'end' };

/**
 * @param {{ report: object, shop?: object, lang?: 'ar'|'en', generatedAt?: Date, styles?: Array }} props
 *   report = summarizeDay(...) from ./summary.js
 */
export default function DailyReportDocument({ report, shop = null, lang = 'ar', generatedAt = new Date() }) {
  const L = lang === 'en' ? 'en' : 'ar';
  const t = (k, v) => translate(L, k, v);
  if (!report) return null;
  const shopName = pickLang(L, { en: shop?.name || '', ar: shop?.nameAr || shop?.name || '' });
  const r = report;
  const pct = (v) => (v === null || v === undefined ? DASH : formatPercent(v, L));
  const dur = (v) => (v === null || v === undefined ? DASH : formatDuration(v));
  const rating = (v) => (v === null || v === undefined ? DASH : String(v));
  const chartItems = r.topStyles.map((s) => ({ label: pickLang(L, s.name), value: s.count }));
  const pad = 40;

  return (
    <article
      dir={L === 'ar' ? 'rtl' : 'ltr'}
      lang={L}
      style={{
        width: DAILY_REPORT_WIDTH,
        boxSizing: 'border-box',
        padding: pad,
        background: PAL.paper,
        color: PAL.ink,
        fontFamily: FONT_BODY,
        fontSize: 12.5,
        lineHeight: 1.45,
        textAlign: 'start',
      }}
    >
      <header data-pdf-block="" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, paddingBottom: 10, borderBottom: `1px solid ${PAL.brass}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: PAL.brass, fontWeight: 600 }}>
            <Bidi text={shopName} />
          </div>
          <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY[L], fontSize: 30, fontWeight: 600, lineHeight: 1.15 }}>{t('report.daily.title')}</h1>
          <div style={{ fontSize: 13, color: PAL.ink }}>{t('report.daily.day', { date: formatDayKey(r.dayKey, L) })}</div>
        </div>
        <div style={{ fontSize: 11, color: PAL.ink2, textAlign: 'end' }}>
          <div>{t('report.daily.generated', { time: formatMuscat(generatedAt, L) })}</div>
          <div style={{ color: r.includeDemo ? PAL.warn : PAL.ink2 }}>{r.includeDemo ? t('report.daily.demoIncluded') : t('report.daily.demoExcluded')}</div>
        </div>
      </header>

      <section data-pdf-block="" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <Kpi label={t('report.kpi.consultations')} value={r.consultations} />
        <Kpi label={t('report.kpi.approvals')} value={r.approvals} />
        <Kpi label={t('report.kpi.conversion')} value={pct(r.conversionPct)} />
        <Kpi label={t('report.kpi.decision')} value={dur(r.avgDecisionSeconds)} />
        <Kpi label={t('report.kpi.ai')} value={t('report.kpi.aiOf', { used: r.aiPreviewsUsed, cap: r.aiCap })} />
        <Kpi
          label={t('report.kpi.addOns')}
          value={r.addOns.count}
          sub={r.addOns.count ? formatOmr(r.addOns.totalOmr, L) : t('report.kpi.none')}
        />
        <Kpi
          label={t('report.kpi.rating')}
          value={rating(r.avgRating)}
          sub={r.ratingCount ? t('report.kpi.ratingOf', { avg: rating(r.avgRating), n: r.ratingCount }) : t('report.kpi.none')}
        />
      </section>

      <Block title={t('report.daily.topStyles')}>
        {chartItems.length ? (
          <BarChart items={chartItems} width={DAILY_REPORT_WIDTH - pad * 2} lang={L} label={t('report.daily.chartLabel')} />
        ) : (
          <div style={{ fontSize: 12.5, color: PAL.ink2 }}>{t('report.daily.noStyles')}</div>
        )}
      </Block>

      <Block title={t('report.daily.byBarber')}>
        {r.perBarber.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('report.daily.col.barber')}</th>
                <th style={thNum}>{t('report.daily.col.consultations')}</th>
                <th style={thNum}>{t('report.daily.col.approvals')}</th>
                <th style={thNum}>{t('report.daily.col.decision')}</th>
                <th style={thNum}>{t('report.daily.col.rating')}</th>
              </tr>
            </thead>
            <tbody>
              {r.perBarber.map((b) => (
                <tr key={b.uid || 'none'}>
                  <td style={td}>
                    <Bidi text={b.name || DASH} />
                  </td>
                  <td style={tdNum}>{b.consultations}</td>
                  <td style={tdNum}>{b.approvals}</td>
                  <td style={tdNum}>{dur(b.avgDecisionSeconds)}</td>
                  <td style={tdNum}>{rating(b.avgRating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12.5, color: PAL.ink2 }}>{t('report.daily.noConsultations')}</div>
        )}
      </Block>

      <Block title={t('report.daily.addOns')}>
        {r.addOns.items.length ? (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('report.daily.col.product')}</th>
                  <th style={thNum}>{t('report.daily.col.count')}</th>
                  <th style={thNum}>{t('report.daily.col.unit')}</th>
                  <th style={thNum}>{t('report.daily.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {r.addOns.items.map((a) => (
                  <tr key={a.id}>
                    <td style={td}>
                      <Bidi text={a.known ? productNameOf(a.product, L) : t('report.daily.unknownProduct')} />
                    </td>
                    <td style={tdNum}>{a.count}</td>
                    <td style={tdNum}>{a.unitOmr === null ? DASH : formatOmr(a.unitOmr, L)}</td>
                    <td style={tdNum}>{a.totalOmr === null ? DASH : formatOmr(a.totalOmr, L)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 600, borderBottom: 0 }}>{t('report.daily.total')}</td>
                  <td style={{ ...tdNum, fontWeight: 600, borderBottom: 0 }}>{r.addOns.count}</td>
                  <td style={{ ...tdNum, borderBottom: 0 }} />
                  <td style={{ ...tdNum, fontWeight: 600, borderBottom: 0 }}>{formatOmr(r.addOns.totalOmr, L)}</td>
                </tr>
              </tbody>
            </table>
            {r.addOns.unpriced ? <div style={{ fontSize: 11, color: PAL.ink2, marginTop: 6 }}>{t('report.daily.unpriced')}</div> : null}
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: PAL.ink2 }}>{t('report.daily.noAddOns')}</div>
        )}
      </Block>

      <footer data-pdf-block="" style={{ marginTop: 24, paddingTop: 8, borderTop: `1px solid ${PAL.brass}`, fontSize: 11, color: PAL.ink2 }}>
        {t('report.daily.footer')}
      </footer>
    </article>
  );
}
