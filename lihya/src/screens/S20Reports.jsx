import { useEffect, useMemo, useState } from 'react';
import { translate, useT } from '../lib/i18n/useT.js';
import { useShop } from '../state/ShopContext.jsx';
import { useLive } from '../hooks/useLive.js';
import { watchConsultationsRange } from '../services/consultations.js';
import { watchStatsRange } from '../services/stats.js';
import { watchStaff } from '../services/staff.js';
import { watchProducts } from '../services/products.js';
import { watchStyles } from '../services/styles.js';
import { listClients } from '../services/clients.js';
import { summarizeConsultations } from '../reports/summary.js';
import { downloadBlob, exportClientsCsv, exportConsultationsCsv, exportStatsCsv } from '../reports/csv.js';
import { dailyReportFilename, dailyReportPdf } from '../reports/dailyReportPdf.js';
import { shareFile } from '../reports/share.js';
import { printElement } from '../reports/raster.js';
import { addDaysToKey, dayKeysBetween } from '../lib/time.js';
import { formatOmr, formatPercent } from '../lib/format.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import ChipRow from '../components/ChipRow.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Field from '../components/Field.jsx';
import OwnerShell from '../components/OwnerShell.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Stat from '../components/Stat.jsx';
import Toggle from '../components/Toggle.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import ClientImport from './owner/ClientImport.jsx';
import ConsultationTable, { rowView } from './owner/ConsultationTable.jsx';
import RangePrint, { PRINT_WIDTH } from './owner/RangePrint.jsx';
import { Section } from './owner/ui.jsx';
import { useToday } from './owner/hooks.js';
import { formatDecision, isNum, mediumDay, oneDecimal, rangeError, rangeFor, shortDay } from './owner/util.js';

const EMPTY = Object.freeze([]);
const PRESETS = ['today', 'yesterday', 'week', 'month', 'custom'];

function NoValue({ label }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/** One export line: what it holds, then its button. */
function ExportRow({ title, description, children }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-text-2">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** S20: reports (/s/:shopId/owner/reports): daily PDF, CSV exports, preview and print. */
export default function S20Reports() {
  const { t, lang } = useT();
  const { shopId, shop, settings } = useShop();
  const { show } = useSnackbar();
  const today = useToday();

  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState(() => ({ start: addDaysToKey(today, -6), end: today }));
  const [includeDemo, setIncludeDemo] = useState(false);
  const [pdfPick, setPdfPick] = useState(null);
  const [busy, setBusy] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const customError = preset === 'custom' ? rangeError(custom.start, custom.end, today) : null;
  const range = useMemo(() => rangeFor(preset, today, custom), [preset, today, custom]);
  const valid = !customError;
  const { start, end } = range;

  const consultLive = useLive(
    (cb, onError) => (valid ? watchConsultationsRange(shopId, start, end, cb, { includeDemo: true }, onError) : null),
    [shopId, start, end, valid, attempt],
  );
  const statsLive = useLive(
    (cb, onError) => (valid ? watchStatsRange(shopId, start, end, cb, onError) : null),
    [shopId, start, end, valid, attempt],
  );
  const staffLive = useLive((cb, onError) => watchStaff(shopId, cb, onError), [shopId]);
  const productsLive = useLive((cb, onError) => watchProducts(shopId, cb, onError), [shopId]);
  const stylesLive = useLive((cb, onError) => watchStyles(shopId, cb, { includeHidden: true }, onError), [shopId]);

  const all = Array.isArray(consultLive.data) ? consultLive.data : EMPTY;
  const stats = Array.isArray(statsLive.data) ? statsLive.data : EMPTY;
  const staff = Array.isArray(staffLive.data) ? staffLive.data : EMPTY;
  const products = Array.isArray(productsLive.data) ? productsLive.data : EMPTY;
  const styles = Array.isArray(stylesLive.data) ? stylesLive.data : EMPTY;

  const list = useMemo(() => (includeDemo ? all : all.filter((c) => c.demo !== true)), [all, includeDemo]);
  const demoCount = useMemo(() => all.filter((c) => c.demo === true).length, [all]);
  const statsByKey = useMemo(() => new Map(stats.map((s) => [s.dayKey, s])), [stats]);
  const aiUsed = useMemo(() => stats.reduce((s, x) => s + (Number(x.aiRenders) || 0), 0), [stats]);
  const summary = useMemo(
    () => summarizeConsultations(list, { products, staff, styles, stats: { aiRenders: aiUsed }, settings }),
    [list, products, staff, styles, aiUsed, settings],
  );

  const days = useMemo(() => (valid ? dayKeysBetween(start, end).reverse() : []), [valid, start, end]);
  const singleDay = days.length === 1;
  const pdfDay = singleDay ? days[0] : pdfPick && days.includes(pdfPick) ? pdfPick : days[0] || today;

  useEffect(() => {
    setPdfPick(null);
  }, [start, end]);

  const loading = valid && (consultLive.loading || statsLive.loading);
  const failed = consultLive.error || statsLive.error;
  const none = t('owner.none');

  const rangeText = !valid
    ? ''
    : singleDay
      ? mediumDay(start, lang)
      : t('owner.rep.range.text', { from: mediumDay(start, lang), to: mediumDay(end, lang), n: days.length });

  const presetOptions = PRESETS.map((p) => ({ value: p, label: t(`owner.rep.preset.${p}`), icon: p === 'custom' ? 'calendar' : undefined }));

  // ---------------------------------------------------------------- actions

  const makePdf = async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      const blob = await dailyReportPdf({
        shop,
        dayKey: pdfDay,
        consultations: all,
        staff,
        products,
        styles,
        stats: statsByKey.get(pdfDay) || null,
        settings,
        lang,
        includeDemo,
      });
      const name = dailyReportFilename(pdfDay);
      const res = await shareFile(blob, name, t('owner.rep.pdf.shareText', { date: mediumDay(pdfDay, lang) }));
      if (res === 'downloaded') show({ message: t('owner.rep.saved', { file: name }) });
      else if (res === 'failed') show({ message: t('owner.rep.pdf.failed') });
    } catch (err) {
      console.error('daily report PDF failed', err);
      show({ message: t('owner.rep.pdf.failed') });
    } finally {
      setBusy(null);
    }
  };

  const saveCsv = (out) => {
    if (out && downloadBlob(out.blob, out.filename)) show({ message: t('owner.rep.csv.saved', { file: out.filename, n: out.count }) });
    else show({ message: t('owner.rep.csv.failed') });
  };

  // Every client (labels only); demo clients are filtered by the export itself.
  const recentClients = () => listClients(shopId, { includeDemo: true });

  const exportConsultations = async () => {
    if (busy) return;
    setBusy('consultations');
    try {
      const clients = await recentClients().catch((err) => {
        console.warn('client names not available for the export', err);
        return [];
      });
      // A registered client outside the loaded names is labelled "Client", never "Walk-in".
      const known = new Set(clients.map((c) => c.id));
      const other = translate(lang, 'owner.rep.csv.otherClient');
      const extra = [...new Set(all.map((c) => c.clientId).filter((id) => id && !known.has(id)))].map((id) => ({ id, displayName: other }));
      saveCsv(
        exportConsultationsCsv({ consultations: all, startKey: start, endKey: end, lang, staff, clients: [...clients, ...extra], products, styles, includeDemo }),
      );
    } catch (err) {
      console.error('consultations CSV failed', err);
      show({ message: t('owner.rep.csv.failed') });
    } finally {
      setBusy(null);
    }
  };

  const exportClients = async () => {
    if (busy) return;
    setBusy('clients');
    try {
      const clients = await recentClients();
      saveCsv(exportClientsCsv({ clients, lang, includeDemo }));
    } catch (err) {
      console.error('clients CSV failed', err);
      show({ message: t('owner.rep.csv.failed') });
    } finally {
      setBusy(null);
    }
  };

  const exportStats = () => {
    try {
      saveCsv(exportStatsCsv({ stats, consultations: all, startKey: start, endKey: end, lang, styles, includeDemo }));
    } catch (err) {
      console.error('stats CSV failed', err);
      show({ message: t('owner.rep.csv.failed') });
    }
  };

  const print = async () => {
    if (busy) return;
    setBusy('print');
    try {
      const rows = [...list].reverse().map((c) => rowView(c, { staff, styles, lang, t }));
      await printElement(
        <RangePrint t={t} lang={lang} shop={shop} rangeText={rangeText} includeDemo={includeDemo} summary={summary} rows={rows} />,
        { lang, pageSize: 'a4', width: PRINT_WIDTH },
      );
    } catch (err) {
      console.error('print failed', err);
      show({ message: t('owner.rep.printFailed') });
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- view

  const footer = (
    <BottomAction className="lg:items-end">
      <Button
        icon="download"
        onClick={makePdf}
        loading={busy === 'pdf'}
        disabled={!valid || loading || Boolean(failed)}
        className="lg:w-auto lg:min-w-[360px]"
      >
        {busy === 'pdf' ? t('owner.rep.pdf.making') : t('owner.rep.pdf.button', { date: shortDay(pdfDay, lang) })}
      </Button>
    </BottomAction>
  );

  const kpiLoading = loading;
  const showData = valid && !failed;

  return (
    <OwnerShell>
      <ScreenFrame title={t('ui.owner.reports')} wide footer={footer}>
        <div className="flex flex-col gap-4">
          <Section title={t('owner.rep.period.title')} icon="calendar" bodyClassName="gap-5">
            <ChipRow label={t('owner.rep.period.label')} options={presetOptions} value={preset} onChange={setPreset} />
            {preset === 'custom' ? (
              <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
                <Field
                  type="date"
                  label={t('owner.rep.range.from')}
                  value={custom.start}
                  max={today}
                  onChange={(v) => setCustom((c) => ({ ...c, start: v }))}
                  aria-invalid={customError ? true : undefined}
                  aria-describedby={customError ? 'rep-range-error' : undefined}
                />
                <Field
                  type="date"
                  label={t('owner.rep.range.to')}
                  value={custom.end}
                  max={today}
                  onChange={(v) => setCustom((c) => ({ ...c, end: v }))}
                  aria-invalid={customError ? true : undefined}
                  aria-describedby={customError ? 'rep-range-error' : undefined}
                />
                {customError ? (
                  <p id="rep-range-error" role="alert" className="text-sm text-cut sm:col-span-2">
                    {t(customError, { max: 92 })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Toggle
              checked={includeDemo}
              onChange={setIncludeDemo}
              label={t('owner.rep.demo.label')}
              description={demoCount ? t('owner.rep.demo.count', { n: demoCount }) : t('owner.rep.demo.none')}
            />
          </Section>

          {failed ? (
            <ErrorState
              title={t('owner.rep.error.title')}
              message={t('owner.rep.error.body')}
              onRetry={() => setAttempt((n) => n + 1)}
              className="rounded-card border border-line bg-surface"
            />
          ) : valid ? (
            <section aria-labelledby="rep-summary" className="flex flex-col gap-3">
              <div>
                <h2 id="rep-summary" className="text-xl">
                  {t('owner.rep.summary.title')}
                </h2>
                <p className="mt-0.5 text-sm text-text-2">
                  {rangeText} · {includeDemo ? t('report.daily.demoIncluded') : t('report.daily.demoExcluded')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat icon="users" label={t('report.kpi.consultations')} value={summary.consultations} loading={kpiLoading} />
                <Stat icon="scissors" label={t('report.kpi.approvals')} value={summary.approvals} loading={kpiLoading} />
                <Stat
                  icon="check"
                  label={t('report.kpi.conversion')}
                  value={isNum(summary.conversionPct) ? formatPercent(summary.conversionPct, lang) : <NoValue label={none} />}
                  loading={kpiLoading}
                />
                <Stat
                  icon="clock"
                  label={t('owner.dash.kpi.decision')}
                  value={isNum(summary.avgDecisionSeconds) ? formatDecision(summary.avgDecisionSeconds, t) : <NoValue label={none} />}
                  loading={kpiLoading}
                />
                <Stat
                  icon="star-line"
                  label={t('report.kpi.rating')}
                  value={isNum(summary.avgRating) ? oneDecimal(summary.avgRating) : <NoValue label={none} />}
                  sub={summary.ratingCount ? t('owner.dash.kpi.ratingSub', { n: summary.ratingCount }) : null}
                  loading={kpiLoading}
                />
                <Stat
                  icon="box"
                  label={t('report.kpi.addOns')}
                  value={summary.addOns.count}
                  sub={summary.addOns.count ? formatOmr(summary.addOns.totalOmr, lang) : null}
                  loading={kpiLoading}
                />
                <Stat
                  icon="cloud"
                  label={t('report.kpi.ai')}
                  value={aiUsed}
                  sub={singleDay ? t('report.kpi.aiCapDay', { cap: settings.aiDailyCap }) : null}
                  loading={kpiLoading}
                  className="col-span-2"
                />
              </div>
            </section>
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-3">
            {/* Data out (exports) and data in (clients import) share the side column. */}
            <div className="flex min-w-0 flex-col gap-4 xl:col-start-3 xl:row-start-1">
              {showData ? (
                <Section title={t('owner.rep.export.title')} description={t('owner.rep.export.sub')} icon="download">
                  <ExportRow title={t('owner.rep.pdf.title')} description={t('owner.rep.pdf.sub')}>
                    {singleDay ? (
                      <p className="text-sm text-text">{t('owner.rep.pdf.forDay', { date: mediumDay(pdfDay, lang) })}</p>
                    ) : (
                      // The scrolling chip row bleeds by the page gutter; inside this card it must match the card padding.
                      <div className="w-full min-w-0" style={{ '--gutter': '16px' }}>
                        <ChipRow
                          label={t('owner.rep.pdf.pickDay')}
                          options={days.map((k) => ({ value: k, label: shortDay(k, lang) }))}
                          value={pdfDay}
                          onChange={setPdfPick}
                          wrap={false}
                        />
                      </div>
                    )}
                  </ExportRow>
                  <ExportRow title={t('owner.rep.csv.consultations')} description={t('owner.rep.csv.consultationsSub')}>
                    <Button variant="secondary" icon="download" onClick={exportConsultations} loading={busy === 'consultations'} disabled={loading}>
                      {t('owner.rep.csv.button')}
                    </Button>
                  </ExportRow>
                  <ExportRow title={t('owner.rep.csv.clients')} description={t('owner.rep.csv.clientsSub')}>
                    <Button variant="secondary" icon="download" onClick={exportClients} loading={busy === 'clients'}>
                      {t('owner.rep.csv.button')}
                    </Button>
                  </ExportRow>
                  <ExportRow title={t('owner.rep.csv.stats')} description={t('owner.rep.csv.statsSub')}>
                    <Button variant="secondary" icon="download" onClick={exportStats} disabled={loading}>
                      {t('owner.rep.csv.button')}
                    </Button>
                  </ExportRow>
                  <ExportRow title={t('owner.rep.print.heading')} description={t('owner.rep.print.sub')}>
                    <Button variant="secondary" icon="print" onClick={print} loading={busy === 'print'} disabled={loading}>
                      {t('common.print')}
                    </Button>
                  </ExportRow>
                </Section>
              ) : null}
              <ClientImport shopId={shopId} t={t} />
            </div>

            {showData ? (
              <Section
                title={t('owner.rep.table.title')}
                description={t('owner.rep.table.sub', { n: list.length })}
                icon="list"
                className="xl:col-span-2 xl:col-start-1 xl:row-start-1"
              >
                <ConsultationTable consultations={list} staff={staff} styles={styles} loading={loading} />
              </Section>
            ) : null}
          </div>
        </div>
      </ScreenFrame>
    </OwnerShell>
  );
}
