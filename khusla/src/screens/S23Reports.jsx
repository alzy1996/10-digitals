import { useMemo, useRef, useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import BarChart from '../components/BarChart.jsx';
import { Section } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useLive } from '../hooks/useLive.js';
import { watchConsultationsRange } from '../services/consultations.js';
import { watchStaff } from '../services/staff.js';
import { watchClients } from '../services/clients.js';
import { watchStatsRange } from '../services/stats.js';
import { computeKpis } from '../reports/kpis.js';
import { dailyReportPdf } from '../reports/dailyReportPdf.js';
import { downloadBlob } from '../reports/agreementCardPdf.js';
import { downloadCsv } from '../reports/csv.js';
import { addDaysKey, dayKey, formatDate } from '../lib/time.js';
import { formatDuration, formatPct } from '../lib/format.js';
import { DEFAULTS } from '../config/app.js';

export default function S23Reports() {
  const { t, lang, name } = useT();
  const app = useApp();
  const today = dayKey();
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(addDaysKey(today, -29));
  const [includeDemo, setIncludeDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const nodeRef = useRef(null);
  const [dayList] = useLive((cb) => watchConsultationsRange(app.salonId, day, day, cb), [app.salonId, day], []);
  const [rangeList] = useLive((cb) => watchConsultationsRange(app.salonId, from, today, cb), [app.salonId, from, today], []);
  const [staff] = useLive((cb) => watchStaff(app.salonId, cb), [app.salonId], []);
  const [clients] = useLive((cb) => watchClients(app.salonId, cb), [app.salonId], []);
  const [stats] = useLive((cb) => watchStatsRange(app.salonId, from, today, cb), [app.salonId, from, today], []);
  const k = useMemo(() => computeKpis(dayList || [], { includeDemo, staff: staff || [] }), [dayList, includeDemo, staff]);
  const cap = app.settings?.aiDailyCap ?? DEFAULTS.aiDailyCap;
  const cutName = (id) => name(app.catalog.cuts.find((c) => c.id === id)?.name) || t('looks.keepCut');
  const shadeName = (id) => name(app.catalog.shades.find((s) => s.id === id)?.name) || t('color.natural');

  const pdf = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await dailyReportPdf(nodeRef.current, day);
      downloadBlob(blob, filename);
    } finally {
      setBusy(false);
    }
  };

  const exportConsultations = () => {
    const rows = (rangeList || [])
      .filter((c) => includeDemo || !c.demo)
      .map((c) => ({
        dayKey: c.dayKey,
        status: c.status,
        stylist: (staff || []).find((s) => s.uid === c.stylistUid)?.name || c.stylistUid,
        clientId: c.clientId || 'walk-in',
        cut: c.params?.cutId || '',
        fringe: c.params?.fringeId || '',
        shade: c.params?.shadeId || '',
        technique: c.params?.technique || '',
        lengthWetCm: c.agreement?.lengthWetCm ?? '',
        process: c.agreement?.process || '',
        sessions: c.agreement?.sessionsTotal ?? '',
        tests: (c.agreement?.tests || []).join(' '),
        decisionSeconds: c.decisionSeconds || '',
        rating: c.rating || '',
        aiPreviewUsed: c.aiPreviewUsed ? 'yes' : 'no',
        demo: c.demo ? 'yes' : 'no',
      }));
    downloadCsv(`khusla-consultations-${from}_${today}.csv`, Object.keys(rows[0] || { dayKey: '' }), rows);
  };
  const exportClients = () => {
    const rows = (clients || [])
      .filter((c) => includeDemo || !c.demo)
      .map((c) => ({
        displayName: c.displayName,
        phone: c.phone || '',
        faceShape: c.profile?.faceShape || '',
        mst: c.profile?.mst || '',
        undertone: c.profile?.undertone || '',
        eyes: c.profile?.eyes || '',
        ageBand: c.profile?.ageBand || '',
        rootLevel: c.hair?.rootLevel || '',
        endsLevel: c.hair?.endsLevel || '',
        greyPct: c.hair?.greyPct ?? '',
        texture: c.hair?.texture || '',
        density: c.hair?.density || '',
        lengthBand: c.hair?.lengthBand || '',
        henna: c.history?.henna || '',
        visits: c.visits || 0,
      }));
    downloadCsv('khusla-clients.csv', Object.keys(rows[0] || { displayName: '' }), rows);
  };
  const exportStats = () => {
    const rows = (stats || []).map((s) => ({
      dayKey: s.id,
      consultations: s.consultations || 0,
      approvals: s.approvals || 0,
      avgDecisionSeconds: s.approvals ? Math.round((s.totalDecisionSeconds || 0) / s.approvals) : '',
      aiRenders: s.aiRenders || 0,
      addOns: s.addOns || 0,
      notToday: s.notToday || 0,
      avgRating: s.ratingsCount ? (s.ratingsSum / s.ratingsCount).toFixed(2) : '',
    }));
    downloadCsv(`khusla-daily-stats-${from}_${today}.csv`, Object.keys(rows[0] || { dayKey: '' }), rows);
  };

  return (
    <OwnerLayout title={t('reports.title')}>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {[0, -1, -2, -3, -4, -5, -6].map((d) => {
          const key = addDaysKey(today, d);
          return (
            <Chip key={key} selected={day === key} onClick={() => setDay(key)}>
              {d === 0 ? t('reports.today') : d === -1 ? t('reports.yesterday') : formatDate(new Date(`${key}T12:00:00+04:00`), lang)}
            </Chip>
          );
        })}
        <Chip selected={includeDemo} onClick={() => setIncludeDemo((v) => !v)}>{t('dash.includeDemo')}</Chip>
      </div>
      <div className="no-print mb-6 flex flex-wrap gap-2">
        <Button full={false} icon="print" busy={busy} onClick={pdf}>{t('reports.pdf')}</Button>
        <Button full={false} variant="secondary" icon="print" onClick={() => window.print()}>{t('agreement.print')}</Button>
      </div>

      <div className="overflow-x-auto">
        <article ref={nodeRef} className="mx-auto w-[794px] bg-white p-10 text-[#1D1A1C]" style={{ fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif' }}>
          <header className="flex items-end justify-between border-b border-[#B76E62] pb-3">
            <div>
              <div className="text-[13px] uppercase tracking-[0.12em] text-[#6B6166]">{t('reports.daily')}</div>
              <div className="text-[26px]" style={{ fontFamily: 'Amiri, Fraunces, serif' }}>{name({ en: app.salon?.name, ar: app.salon?.nameAr })}</div>
            </div>
            <div className="num text-end text-[14px] text-[#6B6166]">
              <div>{day} · Asia/Muscat</div>
              <div>00:00–24:00</div>
              {includeDemo ? <div>{t('reports.withDemo')}</div> : null}
            </div>
          </header>
          <section className="mt-5 grid grid-cols-4 gap-3">
            {[
              [t('kpi.consultations'), k.consultations],
              [t('kpi.approvals'), k.approvals],
              [t('kpi.conversion'), formatPct(k.conversion)],
              [t('kpi.decision'), formatDuration(k.avgDecision, lang)],
              [t('kpi.notToday'), k.notToday],
              [t('kpi.ai'), `${k.aiRenders} / ${cap}`],
              [t('kpi.addOns'), k.addOns],
              [t('kpi.rating'), k.avgRating ? k.avgRating.toFixed(1) : '—'],
            ].map(([label, v]) => (
              <div key={label} className="rounded-[12px] border border-[#E3D9CF] p-3">
                <div className="text-[12px] text-[#6B6166]">{label}</div>
                <div className="num text-[22px] font-semibold">{v}</div>
              </div>
            ))}
          </section>
          <Section title={t('dash.stylists')}>
            <table className="mt-1 w-full text-[13px]">
              <thead>
                <tr className="text-[#6B6166]">
                  <th className="py-1 text-start font-medium">{t('dash.stylist')}</th>
                  <th className="py-1 text-end font-medium">{t('kpi.consultations')}</th>
                  <th className="py-1 text-end font-medium">{t('kpi.approvals')}</th>
                  <th className="py-1 text-end font-medium">{t('kpi.decision')}</th>
                  <th className="py-1 text-end font-medium">{t('kpi.rating')}</th>
                </tr>
              </thead>
              <tbody className="num">
                {k.stylists.map((s) => (
                  <tr key={s.uid} className="border-t border-[#E3D9CF]">
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-end">{s.consultations}</td>
                    <td className="py-1.5 text-end">{s.approvals}</td>
                    <td className="py-1.5 text-end">{formatDuration(s.avgDecision, lang)}</td>
                    <td className="py-1.5 text-end">{s.avgRating ? s.avgRating.toFixed(1) : '—'}</td>
                  </tr>
                ))}
                {!k.stylists.length ? (
                  <tr>
                    <td className="py-2 text-[#6B6166]" colSpan={5}>{t('dash.noData')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Section>
          <div className="grid grid-cols-2 gap-6">
            <Section title={t('dash.topLooks')}>
              <BarChart width={330} rows={k.topLooks.map(([key, v]) => { const [c, s] = key.split('~'); return { label: `${cutName(c)} · ${shadeName(s)}`, value: v }; })} label={t('dash.topLooks')} />
            </Section>
            <Section title={t('reports.topShades')}>
              <BarChart width={330} color="#B76E62" rows={k.topShades.map(([id, v]) => ({ label: shadeName(id), value: v }))} label={t('reports.topShades')} />
            </Section>
          </div>
          <footer className="mt-6 border-t border-[#E3D9CF] pt-2 text-[11px] text-[#6B6166]">{t('reports.footer')}</footer>
        </article>
      </div>

      <Section title={t('reports.csv')}>
        <div className="no-print card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label">{t('reports.range')}</span>
            {[6, 29, 89].map((n) => (
              <Chip key={n} selected={from === addDaysKey(today, -n)} onClick={() => setFrom(addDaysKey(today, -n))}>{t('reports.lastDays', { n: n + 1 })}</Chip>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 tablet:grid-cols-3">
            <Button variant="secondary" icon="download" onClick={exportConsultations}>{t('reports.exportConsultations')}</Button>
            <Button variant="secondary" icon="download" onClick={exportClients}>{t('reports.exportClients')}</Button>
            <Button variant="secondary" icon="download" onClick={exportStats}>{t('reports.exportStats')}</Button>
          </div>
          <p className="mt-2 text-xs text-ink2">{t('reports.csvNote')}</p>
        </div>
      </Section>
    </OwnerLayout>
  );
}
