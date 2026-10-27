import { useEffect, useMemo, useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import { Stat, Section, Empty } from '../components/States.jsx';
import Chip, { Tag } from '../components/Chip.jsx';
import Button from '../components/Button.jsx';
import BarChart from '../components/BarChart.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useLive } from '../hooks/useLive.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { watchConsultationsRange } from '../services/consultations.js';
import { watchStaff } from '../services/staff.js';
import { deleteDemo } from '../services/demo.js';
import { sweepRetention } from '../services/retention.js';
import { computeKpis } from '../reports/kpis.js';
import { dayKey, lastNDayKeys } from '../lib/time.js';
import { formatDuration, formatPct } from '../lib/format.js';
import { DEFAULTS } from '../config/app.js';

export default function S17Dashboard() {
  const { t, lang, name } = useT();
  const app = useApp();
  const snack = useSnackbar();
  const [includeDemo, setIncludeDemo] = useState(true);
  const days = useMemo(() => lastNDayKeys(7), []);
  const today = dayKey();
  const [all, , pending] = useLive((cb) => watchConsultationsRange(app.salonId, days[0], days[6], cb), [app.salonId, days[0]], []);
  const [staff] = useLive((cb) => watchStaff(app.salonId, cb), [app.salonId], []);
  const list = all || [];
  const retentionDays = app.settings?.retentionDays;
  useEffect(() => {
    if (retentionDays && navigator.onLine) sweepRetention(app.salonId, retentionDays).catch(() => {});
  }, [app.salonId, retentionDays]);
  const todays = list.filter((c) => c.dayKey === today);
  const k = computeKpis(todays, { includeDemo, staff: staff || [] });
  const hasDemo = list.some((c) => c.demo);
  const cap = app.settings?.aiDailyCap ?? DEFAULTS.aiDailyCap;
  const lookLabel = (key) => {
    const [cutId, shadeId] = key.split('~');
    const cut = app.catalog.cuts.find((c) => c.id === cutId);
    const shade = app.catalog.shades.find((s) => s.id === shadeId);
    return [cut ? name(cut.name) : t('looks.keepCut'), shade ? name(shade.name) : t('color.natural')].join(' · ');
  };
  const perDay = days.map((d) => ({ label: d.slice(5), value: list.filter((c) => c.dayKey === d && (includeDemo || !c.demo)).length }));

  return (
    <OwnerLayout title={t('dash.title')} actions={pending ? <Tag>{t('common.willSync')}</Tag> : null}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tag tone="plum">{t('dash.today', { date: today })}</Tag>
        {hasDemo ? (
          <>
            <Chip selected={includeDemo} onClick={() => setIncludeDemo((v) => !v)}>{t('dash.includeDemo')}</Chip>
            <Button
              variant="danger"
              full={false}
              icon="trash"
              onClick={async () => {
                const n = await deleteDemo(app.salonId);
                snack.show({ message: t('dash.demoDeleted', { n }) });
              }}
            >
              {t('dash.deleteDemo')}
            </Button>
          </>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
        <Stat label={t('kpi.consultations')} value={k.consultations} />
        <Stat label={t('kpi.approvals')} value={k.approvals} tone="ok" />
        <Stat label={t('kpi.conversion')} value={formatPct(k.conversion)} sub={t('kpi.target85')} tone={k.conversion >= 85 ? 'ok' : k.consultations ? 'warn' : undefined} />
        <Stat label={t('kpi.decision')} value={formatDuration(k.avgDecision, lang)} sub={t('kpi.target2min')} tone={k.avgDecision && k.avgDecision <= 120 ? 'ok' : undefined} />
        <Stat label={t('kpi.addOns')} value={k.addOns} />
        <Stat label={t('kpi.notToday')} value={k.notToday} />
        <Stat label={t('kpi.ai')} value={`${k.aiRenders} / ${cap}`} sub={app.settings?.aiPreview ? t('kpi.aiOn') : t('kpi.aiOff')} />
        <Stat label={t('kpi.rating')} value={k.avgRating ? k.avgRating.toFixed(1) : '—'} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 desk:grid-cols-2">
        <Section title={t('dash.topLooks')}>
          {k.topLooks.length ? (
            <div className="card overflow-x-auto p-4">
              <BarChart rows={k.topLooks.map(([key, v]) => ({ label: lookLabel(key), value: v }))} label={t('dash.topLooks')} />
            </div>
          ) : (
            <Empty icon="chart" title={t('dash.noData')} />
          )}
        </Section>
        <Section title={t('dash.week')}>
          <div className="card overflow-x-auto p-4">
            <BarChart rows={perDay} color="#B76E62" label={t('dash.week')} />
          </div>
        </Section>
        <Section title={t('dash.stylists')}>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink2">
                  <th className="p-3 text-start font-medium">{t('dash.stylist')}</th>
                  <th className="p-3 text-end font-medium">{t('kpi.consultations')}</th>
                  <th className="p-3 text-end font-medium">{t('kpi.approvals')}</th>
                  <th className="p-3 text-end font-medium">{t('kpi.decision')}</th>
                </tr>
              </thead>
              <tbody className="num">
                {k.stylists.map((s) => (
                  <tr key={s.uid} className="border-t border-line">
                    <td className="p-3">{s.name}</td>
                    <td className="p-3 text-end">{s.consultations}</td>
                    <td className="p-3 text-end">{s.approvals}</td>
                    <td className="p-3 text-end">{formatDuration(s.avgDecision, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
      <p className="mt-6 text-xs text-ink2">{t('dash.liveNote')}</p>
    </OwnerLayout>
  );
}
