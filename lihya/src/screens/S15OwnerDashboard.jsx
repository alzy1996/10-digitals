import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useShop } from '../state/ShopContext.jsx';
import { useLive } from '../hooks/useLive.js';
import { useOnline } from '../hooks/useOnline.js';
import { watchConsultationsRange } from '../services/consultations.js';
import { watchDailyStats, watchStatsRange } from '../services/stats.js';
import { watchStaff } from '../services/staff.js';
import { watchProducts } from '../services/products.js';
import { watchStyles } from '../services/styles.js';
import { purgeExpiredData } from '../services/shops.js';
import { summarizeConsultations, productNameOf } from '../reports/summary.js';
import { formatOmr, formatPercent } from '../lib/format.js';
import Button from '../components/Button.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Icon from '../components/Icon.jsx';
import OwnerShell from '../components/OwnerShell.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Stat from '../components/Stat.jsx';
import { cx } from '../components/kit.js';
import BarberTable from './owner/BarberTable.jsx';
import TopStyles from './owner/TopStyles.jsx';
import TrendBars from './owner/TrendBars.jsx';
import { Meter, Note, Section } from './owner/ui.jsx';
import { useAiQuota, useDemoPresence, useToday } from './owner/hooks.js';
import { TARGETS, formatDecision, isNum, lastDays, longDay, markPurged, oneDecimal, purgeDue } from './owner/util.js';

const EMPTY = Object.freeze([]);
const purging = new Set();

/** Retention (PRD 10.2, Spark has no scheduled functions): once per Muscat day per device, silently. */
function useDailyPurge({ shopId, isOwner, online, today }) {
  useEffect(() => {
    if (!isOwner || !online || !shopId || purging.has(shopId) || !purgeDue(shopId, today)) return;
    purging.add(shopId);
    (async () => {
      try {
        for (let i = 0; i < 5; i += 1) {
          const r = await purgeExpiredData(shopId);
          if (!r || !r.more) break;
        }
        markPurged(shopId, today);
      } catch (err) {
        console.warn('retention purge did not run', err);
      } finally {
        purging.delete(shopId);
      }
    })();
  }, [shopId, isOwner, online, today]);
}

/** Empty value for a tile: a dash on screen, words for screen readers. */
function NoValue({ label }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/** "Target 80% or more" with a small keep/warn dot once there is data. */
function TargetSub({ text, met }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {met === null ? null : (
        <span aria-hidden="true" className={cx('h-2 w-2 shrink-0 rounded-full', met ? 'bg-keep' : 'bg-warn')} />
      )}
      <span className="truncate">{text}</span>
    </span>
  );
}

function AiCard({ used, cap, enabled, quota, loading, isOwner, settingsPath }) {
  const { t } = useT();
  const ratio = cap > 0 ? used / cap : 0;
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm text-text-2">
        <Icon name="cloud" size={18} />
        <span className="truncate">{t('owner.dash.kpi.ai')}</span>
        <span
          className={cx(
            'ms-auto shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
            enabled ? 'border-keep/50 text-keep' : 'border-line text-text-2',
          )}
        >
          {enabled ? t('owner.state.on') : t('owner.state.off')}
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-28" />
      ) : (
        <div className="display num text-2xl font-semibold leading-none text-text">
          <bdi>{t('owner.dash.kpi.aiValue', { used, cap })}</bdi>
        </div>
      )}
      <Meter value={ratio} label={t('owner.dash.kpi.aiMeter', { used, cap })} />
      <div className="flex flex-col gap-1 text-xs text-text-2">
        {quota && isNum(quota.accountUsed) && isNum(quota.accountCap) ? (
          <span>{t('owner.dash.kpi.aiAccount', { used: quota.accountUsed, cap: quota.accountCap })}</span>
        ) : null}
        <span>{enabled ? t('owner.dash.kpi.aiResets') : t('owner.dash.kpi.aiOff')}</span>
        {!enabled && isOwner ? (
          <Link to={settingsPath} className="press -my-2 inline-flex min-h-tap items-center gap-1 self-start font-medium text-brass underline-offset-4 hover:underline">
            {t('owner.dash.kpi.aiTurnOn')}
            <Icon name="chevron-right" size={16} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function AddOnsList({ addOns, products, loading, productsPath }) {
  const { t, lang } = useT();
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (!products.length) {
    return (
      <Note
        tone="plain"
        icon="box"
        stack
        action={
          <Button as={Link} to={productsPath} variant="secondary" size="sm" iconEnd="chevron-right">
            {t('owner.dash.addOns.addProducts')}
          </Button>
        }
      >
        {t('owner.dash.addOns.noProducts')}
      </Note>
    );
  }
  if (!addOns.items.length) {
    return <p className="text-sm text-text-2">{t('owner.dash.addOns.none')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-line">
        {addOns.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-text">
              <bdi>{it.product ? productNameOf(it.product, lang) : t('report.daily.unknownProduct')}</bdi>
            </span>
            <span className="num shrink-0 text-sm text-text-2">{t('owner.dash.addOns.times', { n: it.count })}</span>
            <span className="num w-28 shrink-0 text-end text-sm font-medium">
              {it.totalOmr === null ? <NoValue label={t('owner.dash.addOns.unpricedOne')} /> : <bdi>{formatOmr(it.totalOmr, lang)}</bdi>}
            </span>
          </li>
        ))}
      </ul>
      {addOns.unpriced ? <p className="text-xs text-text-2">{t('report.daily.unpriced')}</p> : null}
    </div>
  );
}

/** S15: owner dashboard (/s/:shopId/owner): today in Muscat time, live. */
export default function S15OwnerDashboard() {
  const { t, lang } = useT();
  const { shopId, settings, isOwner } = useShop();
  const online = useOnline();
  const today = useToday();
  const [attempt, setAttempt] = useState(0);
  const base = `/s/${encodeURIComponent(shopId)}`;

  useDailyPurge({ shopId, isOwner, online, today });

  const consultLive = useLive(
    (cb, onError) => watchConsultationsRange(shopId, today, today, cb, { includeDemo: true }, onError),
    [shopId, today, attempt],
  );
  const statsLive = useLive((cb, onError) => watchDailyStats(shopId, today, cb, onError), [shopId, today, attempt]);
  const week = useMemo(() => lastDays(7, today), [today]);
  const trendLive = useLive(
    (cb, onError) => watchStatsRange(shopId, week[0], week[week.length - 1], cb, onError),
    [shopId, week, attempt],
  );
  const staffLive = useLive((cb, onError) => watchStaff(shopId, cb, onError), [shopId]);
  const productsLive = useLive((cb, onError) => watchProducts(shopId, cb, onError), [shopId]);
  const stylesLive = useLive((cb, onError) => watchStyles(shopId, cb, { includeHidden: true }, onError), [shopId]);

  const consultations = Array.isArray(consultLive.data) ? consultLive.data : EMPTY;
  const staff = Array.isArray(staffLive.data) ? staffLive.data : EMPTY;
  const products = Array.isArray(productsLive.data) ? productsLive.data : EMPTY;
  const styles = Array.isArray(stylesLive.data) ? stylesLive.data : EMPTY;
  const stats = statsLive.data || null;

  const summary = useMemo(
    () => summarizeConsultations(consultations, { products, staff, styles, stats, settings }),
    [consultations, products, staff, styles, stats, settings],
  );
  const finished = useMemo(() => consultations.filter((c) => c.status === 'done').length, [consultations]);

  const trendDays = useMemo(() => {
    const byKey = new Map((Array.isArray(trendLive.data) ? trendLive.data : []).map((s) => [s.dayKey, s]));
    return week.map((key) => {
      const s = byKey.get(key);
      return { key, consultations: s ? s.consultations : 0, approvals: s ? s.approvals : 0 };
    });
  }, [trendLive.data, week]);

  const demo = useDemoPresence(shopId, consultations);
  const aiUsed = stats ? stats.aiRenders : 0;
  const aiCap = Number(settings.aiDailyCap) || 0;
  const quota = useAiQuota({ shopId, enabled: settings.aiPreview === true, online, refreshKey: aiUsed });

  const loading = consultLive.loading || statsLive.loading;
  const failed = consultLive.error || statsLive.error;
  const none = t('owner.none');

  const hasData = summary.consultations > 0;
  const conversionMet = isNum(summary.conversionPct) ? summary.conversionPct >= TARGETS.conversionPct : null;
  const decisionMet = isNum(summary.avgDecisionSeconds) ? summary.avgDecisionSeconds <= TARGETS.decisionSeconds : null;

  const live = online && !consultLive.fromCache && !loading;

  const footer = (
    <div className="flex lg:justify-end">
      <Button as={Link} to={`${base}/owner/reports`} icon="report" className="lg:w-auto lg:min-w-[320px]">
        {t('owner.dash.openReport')}
      </Button>
    </div>
  );

  return (
    <OwnerShell>
      <ScreenFrame title={t('ui.owner.dashboard')} wide footer={footer}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h2 id="kpi-heading" className="text-xl sm:text-2xl">
                {t('owner.dash.today')}
              </h2>
              <p className="mt-1 text-sm text-text-2">{t('owner.dash.todaySub', { date: longDay(today, lang) })}</p>
            </div>
            <p role="status" className="inline-flex min-h-tap items-center gap-2 text-sm text-text-2">
              <span
                aria-hidden="true"
                className={cx('h-2 w-2 rounded-full', live ? 'bg-keep motion-safe:animate-pulse' : 'bg-text-2')}
              />
              {live ? t('owner.dash.live') : online ? t('owner.dash.connecting') : t('owner.dash.offline')}
            </p>
          </div>

          {demo.present ? (
            <Note
              tone="info"
              title={t('owner.dash.demo.title')}
              action={
                isOwner ? (
                  <Button as={Link} to={`${base}/owner/settings#demo`} variant="secondary" size="sm" iconEnd="chevron-right">
                    {t('owner.dash.demo.manage')}
                  </Button>
                ) : null
              }
            >
              {isOwner ? t('owner.dash.demo.bodyOwner') : t('owner.dash.demo.bodyManager')}
            </Note>
          ) : null}

          {failed ? (
            <ErrorState
              title={t('owner.dash.error.title')}
              message={t('owner.dash.error.body')}
              onRetry={() => setAttempt((n) => n + 1)}
              className="rounded-card border border-line bg-surface"
            />
          ) : (
            <>
              <section aria-labelledby="kpi-heading" className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat
                    icon="users"
                    label={t('report.kpi.consultations')}
                    value={summary.consultations}
                    sub={t('owner.dash.kpi.sinceMidnight')}
                    loading={loading}
                  />
                  <Stat
                    icon="scissors"
                    label={t('report.kpi.approvals')}
                    value={summary.approvals}
                    sub={t('owner.dash.kpi.finished', { n: finished })}
                    loading={loading}
                  />
                  <Stat
                    icon="check"
                    label={t('report.kpi.conversion')}
                    value={isNum(summary.conversionPct) ? formatPercent(summary.conversionPct, lang) : <NoValue label={none} />}
                    sub={<TargetSub text={t('owner.dash.kpi.conversionTarget', { pct: formatPercent(TARGETS.conversionPct, lang) })} met={conversionMet} />}
                    loading={loading}
                  />
                  <Stat
                    icon="clock"
                    label={t('owner.dash.kpi.decision')}
                    value={isNum(summary.avgDecisionSeconds) ? formatDecision(summary.avgDecisionSeconds, t) : <NoValue label={none} />}
                    sub={<TargetSub text={t('owner.dash.kpi.decisionTarget', { s: TARGETS.decisionSeconds })} met={decisionMet} />}
                    loading={loading}
                  />
                  <Stat
                    icon="star-line"
                    label={t('report.kpi.rating')}
                    value={isNum(summary.avgRating) ? oneDecimal(summary.avgRating) : <NoValue label={none} />}
                    sub={
                      summary.ratingCount
                        ? t('owner.dash.kpi.ratingSub', { n: summary.ratingCount })
                        : t('owner.dash.kpi.ratingNone')
                    }
                    loading={loading}
                  />
                  <Stat
                    icon="box"
                    label={t('report.kpi.addOns')}
                    value={summary.addOns.count}
                    sub={
                      summary.addOns.count
                        ? t('owner.dash.kpi.addOnsSub', { total: formatOmr(summary.addOns.totalOmr, lang) })
                        : t('owner.dash.kpi.addOnsNone')
                    }
                    loading={loading || productsLive.loading}
                  />
                  <AiCard
                    used={aiUsed}
                    cap={aiCap}
                    enabled={settings.aiPreview === true}
                    quota={quota}
                    loading={statsLive.loading}
                    isOwner={isOwner}
                    settingsPath={`${base}/owner/settings#ai`}
                  />
                </div>
                {!loading && !hasData ? <p className="text-sm text-text-2">{t('owner.dash.noneToday')}</p> : null}
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title={t('owner.dash.styles.title')} description={t('owner.dash.styles.sub')} icon="beard">
                  <TopStyles
                    items={summary.topStyles}
                    loading={loading}
                    emptyTitle={t('owner.dash.styles.emptyTitle')}
                    emptyMessage={t('owner.dash.styles.empty')}
                  />
                </Section>
                <Section title={t('owner.dash.trend.title')} description={t('owner.dash.trend.sub')} icon="calendar">
                  {trendLive.error ? (
                    <ErrorState message={t('owner.dash.trend.error')} onRetry={() => setAttempt((n) => n + 1)} className="py-6" />
                  ) : (
                    <TrendBars days={trendDays} today={today} loading={trendLive.loading} />
                  )}
                </Section>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <Section
                  title={t('owner.dash.barbers.title')}
                  description={t('owner.dash.barbers.sub')}
                  icon="users"
                  className="xl:col-span-2"
                >
                  <BarberTable rows={summary.perBarber} loading={loading || staffLive.loading} caption={t('owner.dash.barbers.title')} />
                </Section>
                <Section title={t('owner.dash.addOns.title')} description={t('owner.dash.addOns.sub')} icon="box">
                  <AddOnsList
                    addOns={summary.addOns}
                    products={products}
                    loading={loading || productsLive.loading}
                    productsPath={`${base}/owner/products`}
                  />
                </Section>
              </div>
            </>
          )}
        </div>
      </ScreenFrame>
    </OwnerShell>
  );
}
