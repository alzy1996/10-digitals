// Printable A4 version of the Reports screen (summary, per barber, consultations).
// Rendered by printElement() in its own React root, so it takes `t` and `lang` as props
// and uses inline print colors (black on white, brass rules) instead of theme tokens.

import { formatMuscat } from '../../lib/time.js';
import { formatOmr, formatPercent } from '../../lib/format.js';
import { formatDecision, isNum, oneDecimal } from './util.js';

export const PRINT_WIDTH = 794;

const INK = '#111111';
const MUTED = '#555555';
const RULE = '#7E622A';
const LINE = '#D9D2C6';

const cell = { padding: '6px 8px', borderBottom: `1px solid ${LINE}`, textAlign: 'start', verticalAlign: 'top' };
const head = { ...cell, color: MUTED, fontWeight: 500, fontSize: 12, borderBottom: `1px solid ${RULE}` };
const num = { fontVariantNumeric: 'tabular-nums' };

function Kpi({ label, value }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2, ...num }}>
        <bdi>{value}</bdi>
      </div>
    </div>
  );
}

export default function RangePrint({ t, lang, shop, rangeText, includeDemo, summary, rows, generatedAt = new Date() }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const shopName = shop ? (lang === 'ar' ? shop.nameAr || shop.name : shop.name || shop.nameAr) : '';
  const dash = '–';
  const kpis = [
    [t('report.kpi.consultations'), summary.consultations],
    [t('report.kpi.approvals'), summary.approvals],
    [t('report.kpi.conversion'), isNum(summary.conversionPct) ? formatPercent(summary.conversionPct, lang) : dash],
    [t('report.kpi.decision'), isNum(summary.avgDecisionSeconds) ? formatDecision(summary.avgDecisionSeconds, t) : dash],
    [t('report.kpi.rating'), isNum(summary.avgRating) ? oneDecimal(summary.avgRating) : dash],
    [t('report.kpi.addOns'), t('report.kpi.addOnsValue', { count: summary.addOns.count, total: formatOmr(summary.addOns.totalOmr, lang) })],
    [t('report.kpi.ai'), summary.aiPreviewsUsed],
  ];

  return (
    <div
      dir={dir}
      lang={lang}
      style={{
        width: PRINT_WIDTH,
        boxSizing: 'border-box',
        padding: '36px 40px',
        background: '#FFFFFF',
        color: INK,
        fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div data-pdf-block style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: MUTED }}>{shopName}</div>
          <div style={{ fontSize: 26, fontWeight: 600, fontFamily: lang === 'ar' ? '"Reem Kufi", sans-serif' : '"Barlow Condensed", sans-serif' }}>
            {t('owner.rep.print.title')}
          </div>
          <div style={{ fontSize: 13 }}>{rangeText}</div>
        </div>
        <div style={{ fontSize: 11, color: MUTED, textAlign: 'end' }}>
          <div>{t('report.daily.generated', { time: formatMuscat(generatedAt, lang) })}</div>
          <div>{includeDemo ? t('report.daily.demoIncluded') : t('report.daily.demoExcluded')}</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${RULE}`, margin: '14px 0' }} />

      <div data-pdf-block style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {kpis.map(([label, value]) => (
          <Kpi key={label} label={label} value={value} />
        ))}
      </div>

      <div data-pdf-block style={{ marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{t('report.daily.byBarber')}</div>
        {summary.perBarber.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>{t('report.daily.col.barber')}</th>
                <th style={{ ...head, textAlign: 'end' }}>{t('report.daily.col.consultations')}</th>
                <th style={{ ...head, textAlign: 'end' }}>{t('report.daily.col.approvals')}</th>
                <th style={{ ...head, textAlign: 'end' }}>{t('report.daily.col.decision')}</th>
                <th style={{ ...head, textAlign: 'end' }}>{t('report.daily.col.rating')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.perBarber.map((b) => (
                <tr key={b.uid || 'unknown'}>
                  <td style={cell}>
                    <bdi>{b.name || t('owner.unknownBarber')}</bdi>
                  </td>
                  <td style={{ ...cell, ...num, textAlign: 'end' }}>{b.consultations}</td>
                  <td style={{ ...cell, ...num, textAlign: 'end' }}>{b.approvals}</td>
                  <td style={{ ...cell, ...num, textAlign: 'end' }}>{isNum(b.avgDecisionSeconds) ? formatDecision(b.avgDecisionSeconds, t) : dash}</td>
                  <td style={{ ...cell, ...num, textAlign: 'end' }}>{isNum(b.avgRating) ? oneDecimal(b.avgRating) : dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: MUTED }}>{t('owner.rep.table.empty')}</div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div data-pdf-block style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          {t('owner.rep.table.title')}
        </div>
        {rows.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>{t('report.csv.col.date')}</th>
                <th style={head}>{t('report.csv.col.barber')}</th>
                <th style={head}>{t('report.csv.col.style')}</th>
                <th style={head}>{t('report.csv.col.status')}</th>
                <th style={{ ...head, textAlign: 'end' }}>{t('owner.rep.table.decision')}</th>
                <th style={{ ...head, textAlign: 'end' }}>{t('report.csv.col.rating')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-pdf-block style={{ breakInside: 'avoid' }}>
                  <td style={{ ...cell, ...num, whiteSpace: 'nowrap' }}>
                    {r.day} <bdi>{r.time}</bdi>
                  </td>
                  <td style={cell}>
                    <bdi>{r.barber}</bdi>
                  </td>
                  <td style={cell}>
                    <bdi>{r.style}</bdi>
                    {r.demo ? <span style={{ color: MUTED }}> ({t('common.demo')})</span> : null}
                  </td>
                  <td style={cell}>{r.statusLabel}</td>
                  <td style={{ ...cell, ...num, textAlign: 'end', whiteSpace: 'nowrap' }}>{r.decision || dash}</td>
                  <td style={{ ...cell, ...num, textAlign: 'end' }}>{r.rating === null ? dash : r.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: MUTED }}>{t('owner.rep.table.empty')}</div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 8, fontSize: 10, color: MUTED }}>{t('report.daily.footer')}</div>
    </div>
  );
}
