// S07 Styles (PRD 6.4, 8.1 step 5, 8.2 step 3): the styles ranked for this face. The top 6
// are style cards drawn on his own front photo (rendered one by one, skeletons until each
// is ready), with the Grow-ability %, up to 3 reason chips, warnings and the trim
// interval. Then the haircut pairing hints and "See all styles": the full catalog as
// light rows (thumbnails only once a row scrolls into view), filtered by length and
// upkeep with one-tap chips. Tapping a style opens it in the Studio.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button, { Spinner } from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import ChipRow from '../components/ChipRow.jsx';
import Chip from '../components/Chip.jsx';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/Skeleton.jsx';
import StyleCard from '../components/StyleCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { cx } from '../components/kit.js';
import { useT } from '../lib/i18n/useT.js';
import { formatPercent } from '../lib/format.js';
import { LIMITS } from '../config/app.js';
import { LENGTH_FILTERS, MAINTENANCE_FILTERS, filterStyles, paramsFromStyle } from '../lib/look.js';
import { useSession } from '../hooks/useSession.js';
import { useLive } from '../hooks/useLive.js';
import { useShop, usePublicShop } from '../state/ShopContext.jsx';
import { watchStyles } from '../services/styles.js';
import { hiddenByWorkRule, pairingHints, recommend, workRuleNotice } from '../ai/index.js';
import { useThumbnails } from './studio/useThumbnails.js';

const isGulf = (style) => Array.isArray(style && style.tags) && style.tags.includes('gulf');
/** The trim interval is the badge on the card's photo, so its reason chip is not repeated. */
const TRIM_SHOWN = Object.freeze(['low_maint']);

export default function S07Styles() {
  const { mode } = useSession();
  return mode === 'home' ? <HomeStyles /> : <ChairStyles />;
}

/** Chair: the shop's visible styles, live (offline from the cache). */
function ChairStyles() {
  const { shopId, settings } = useShop();
  const [attempt, setAttempt] = useState(0);
  const live = useLive((cb, onError) => watchStyles(shopId, cb, {}, onError), [shopId, attempt]);
  return (
    <StylesView
      styles={live.data}
      loading={live.loading}
      error={live.error}
      onRetry={() => setAttempt((n) => n + 1)}
      settings={settings}
    />
  );
}

/** Try at home: the public, visible styles of the shop. */
function HomeStyles() {
  const { styles } = usePublicShop();
  return <StylesView styles={styles} loading={false} error={null} settings={null} />;
}

/** Small tag on the photo of a card (non-interactive, the card stays the tap target). */
function PhotoTag({ icon, children, className }) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-bg/85 px-2 py-0.5 text-xs font-medium text-text',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

function SectionTitle({ children, aside }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg">{children}</h2>
      {aside ? <span className="num text-sm text-text-2">{aside}</span> : null}
    </div>
  );
}

/** One row of "See all styles": light until it scrolls into view, then its thumbnail is drawn. */
function StyleRow({ item, thumb, canThumb, request, selected, onOpen }) {
  const { t, lang, pick } = useT();
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  const style = item.style;
  const other = lang === 'ar' ? 'en' : 'ar';
  const name = pick(style.name) || style.id;
  const otherName = style.name && typeof style.name === 'object' ? style.name[other] : '';
  const g = item.growability != null && !item.growUnknown ? Math.round(Number(item.growability)) : null;
  const warning = item.warnings && item.warnings[0] ? t(item.warnings[0].key, item.warnings[0].vars) : null;

  useEffect(() => {
    if (!canThumb || thumb) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setSeen(true);
      request(style);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setSeen(true);
          request(style);
        }
      },
      { rootMargin: '160px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canThumb, thumb, request, style]);

  let media;
  if (thumb && thumb.url) {
    media = <img src={thumb.url} alt="" draggable={false} className="h-full w-full object-cover" />;
  } else if (canThumb && seen && !(thumb && thumb.error)) {
    media = <Skeleton rounded="none" className="h-full w-full" />;
  } else {
    media = (
      <span className="flex h-full w-full items-center justify-center text-text-2">
        <Icon name="beard" size={26} />
      </span>
    );
  }

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={() => onOpen(style)}
        className={cx(
          'press flex min-h-[96px] w-full items-center gap-3 rounded-card border bg-surface p-2 text-start active:bg-surface-2',
          selected ? 'border-brass' : 'border-line',
        )}
      >
        <span className="relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-ctl bg-surface-2">{media}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-text">{name}</span>
            {isGulf(style) ? (
              <Chip size="sm" className="shrink-0">
                {t('studio.styles.gulf')}
              </Chip>
            ) : null}
          </span>
          {otherName && otherName !== name ? (
            <span lang={other} className="truncate text-xs text-text-2">
              {otherName}
            </span>
          ) : null}
          <span className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-2">
            {g !== null ? (
              <span className={cx('inline-flex items-center gap-1', g < 40 && 'text-warn')}>
                {t('ui.growability')} {formatPercent(g, lang)}
              </span>
            ) : null}
            {item.trim ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" size={14} />
                {t(item.trim.cardKey, item.trim.vars)}
              </span>
            ) : null}
          </span>
          {warning ? (
            <span className="flex items-center gap-1 text-xs text-warn">
              <Icon name="warning" size={14} />
              <span className="truncate">{warning}</span>
            </span>
          ) : null}
        </span>
        {selected ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brass">
            <Icon name="check" size={18} />
            <span className="hidden sm:inline">{t('studio.styles.inStudio')}</span>
          </span>
        ) : (
          <Icon name="chevron-right" size={20} className="shrink-0 text-text-2" />
        )}
      </button>
    </li>
  );
}

function GridSkeleton({ label }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-text-2">
        <Spinner size={18} />
        {label}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: LIMITS.topStyles }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-0">
            <Skeleton rounded="none" className="aspect-[4/5] w-full rounded-t-card" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StylesView({ styles, loading, error, onRetry, settings }) {
  const { t, pick } = useT();
  const navigate = useNavigate();
  const session = useSession();
  const { mode, effectiveProfile, overrides, answers, shots, activeParams, path, setRanked, setActiveParams, hydrated } = session;
  const chair = mode === 'chair';
  const front = shots ? shots.front : null;

  const [showAll, setShowAll] = useState(false);
  const [lengthFilter, setLengthFilter] = useState('all');
  const [maintFilter, setMaintFilter] = useState('all');

  const visible = useMemo(() => (Array.isArray(styles) ? styles.filter((s) => s && s.id && s.hidden !== true) : []), [styles]);

  // Ranked once per profile / answers / catalog change (PRD 6.1, under 50 ms, offline).
  const ranked = useMemo(() => {
    if (!effectiveProfile || !visible.length) return [];
    try {
      return recommend(effectiveProfile, visible, { answers, settings: settings || {}, overrides });
    } catch (err) {
      console.error('styles: ranking failed', err);
      return [];
    }
  }, [effectiveProfile, visible, answers, settings, overrides]);

  useEffect(() => {
    if (effectiveProfile && !loading) setRanked(ranked);
  }, [ranked, effectiveProfile, loading, setRanked]);

  const hiddenCount = useMemo(() => hiddenByWorkRule(visible, answers ? answers.workRule : null), [visible, answers]);
  const notice = workRuleNotice(hiddenCount);
  const top = useMemo(() => ranked.slice(0, LIMITS.topStyles), [ranked]);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.styleId, r])), [ranked]);

  const { thumbs, request } = useThumbnails(front, effectiveProfile);
  useEffect(() => {
    if (!front) return;
    for (const r of top) request(r.style);
  }, [front, top, request]);

  const previewFailed = Boolean(front) && top.some((r) => thumbs[r.styleId] && thumbs[r.styleId].error);
  const cards = Boolean(front) && !previewFailed;
  const drawn = top.filter((r) => thumbs[r.styleId]).length;

  const hints = useMemo(() => {
    const seen = new Map();
    for (const r of top) for (const h of pairingHints(r.style)) if (!seen.has(h.id)) seen.set(h.id, h);
    return [...seen.values()];
  }, [top]);

  // "See all styles": catalog order (Gulf styles first), only styles the work rule allows.
  const allRanked = useMemo(() => visible.map((s) => byId.get(s.id)).filter(Boolean), [visible, byId]);
  const filtered = useMemo(
    () =>
      filterStyles(allRanked, {
        length: lengthFilter === 'all' ? null : lengthFilter,
        maintenance: maintFilter === 'all' ? null : maintFilter,
      }),
    [allRanked, lengthFilter, maintFilter],
  );

  const activeId = activeParams && activeParams.styleId ? activeParams.styleId : null;

  const open = (style) => {
    if (!style) return;
    // The look already open in the Studio keeps what the barber designed.
    if (!activeParams || activeParams.styleId !== style.id) {
      setActiveParams(paramsFromStyle(style, { profile: effectiveProfile }));
    }
    navigate(path('studio'));
  };

  const title = chair ? t('studio.styles.title') : t('studio.styles.titleHome');
  const back = chair ? path('questions') : path('profile');

  /* ---- no face profile yet */
  if (!effectiveProfile) {
    return (
      <ScreenFrame title={title} back={back}>
        {!hydrated ? (
          <GridSkeleton label={t('common.loading')} />
        ) : (
          <EmptyState
            icon="face"
            title={t('studio.noProfile.title')}
            message={t('studio.noProfile.body')}
            action={
              <Button variant="primary" icon="camera" onClick={() => navigate(path('capture'))} className="mt-2">
                {t('studio.noProfile.action')}
              </Button>
            }
          />
        )}
      </ScreenFrame>
    );
  }

  if (loading) {
    return (
      <ScreenFrame title={title} back={back}>
        <GridSkeleton label={t('studio.styles.ranking')} />
      </ScreenFrame>
    );
  }

  if (error) {
    return (
      <ScreenFrame title={title} back={back}>
        <ErrorState message={t('studio.styles.error')} onRetry={onRetry} />
      </ScreenFrame>
    );
  }

  const workRuleLine = notice ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-info/50 bg-info/10 px-4 py-3 text-sm text-text">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Icon name="info" size={20} className="shrink-0 text-info" />
        <span>{t(notice.key, notice.vars)}</span>
      </span>
      {chair ? (
        <Button variant="ghost" size="sm" onClick={() => navigate(path('questions'))} className="-me-2">
          {t('studio.styles.changeAnswers')}
        </Button>
      ) : null}
    </div>
  ) : null;

  if (!ranked.length) {
    return (
      <ScreenFrame title={title} back={back}>
        <EmptyState
          icon="catalog"
          title={t('studio.styles.empty.title')}
          message={notice ? t(notice.key, notice.vars) : t('studio.styles.empty.hidden')}
          action={
            notice && chair ? (
              <Button variant="secondary" icon="edit" onClick={() => navigate(path('questions'))} className="mt-2">
                {t('studio.styles.changeAnswers')}
              </Button>
            ) : null
          }
        />
      </ScreenFrame>
    );
  }

  const activeInList = activeId && byId.has(activeId);
  const footer = (
    <BottomAction>
      {activeInList ? (
        <Button variant="primary" iconEnd="arrow-right" onClick={() => navigate(path('studio'))}>
          {t('studio.styles.backToStudio')}
        </Button>
      ) : (
        <Button variant="primary" iconEnd="arrow-right" onClick={() => open(top[0].style)}>
          {t('studio.styles.tryBest')}
        </Button>
      )}
    </BottomAction>
  );

  const lengthOptions = [{ value: 'all', label: t('catalog.length.all') }, ...LENGTH_FILTERS.map((f) => ({ value: f.id, label: t(f.labelKey) }))];
  const maintOptions = [{ value: 'all', label: t('catalog.maint.all') }, ...MAINTENANCE_FILTERS.map((f) => ({ value: f.id, label: t(f.labelKey) }))];

  return (
    <ScreenFrame title={title} back={back} footer={footer}>
      <div className="flex flex-col gap-4">
        <p className="text-text-2">{chair ? t('studio.styles.lead') : t('studio.styles.leadHome')}</p>
        {workRuleLine}

        {!front ? (
          <div className="flex flex-col gap-3 rounded-card border border-warn/50 bg-warn/10 p-4">
            <p className="flex items-start gap-2 text-sm text-text">
              <Icon name="camera" size={20} className="shrink-0 text-warn" />
              <span>
                <span className="block font-semibold">{t('studio.styles.noPhoto.title')}</span>
                <span className="text-text-2">{t('studio.styles.noPhoto.body')}</span>
              </span>
            </p>
            <Button variant="secondary" icon="camera" onClick={() => navigate(path('capture'))} full>
              {t('studio.styles.retake')}
            </Button>
          </div>
        ) : null}
        {previewFailed ? (
          <p role="status" className="flex items-start gap-2 rounded-card border border-warn/50 bg-warn/10 p-3 text-sm text-text">
            <Icon name="warning" size={20} className="shrink-0 text-warn" />
            <span>{t('studio.styles.previewFailed')}</span>
          </p>
        ) : null}

        <section className="flex flex-col gap-3" aria-labelledby="styles-top">
          <div id="styles-top">
            <SectionTitle>{t('studio.styles.top')}</SectionTitle>
          </div>
          {cards && drawn < top.length ? (
            <p role="status" aria-live="polite" className="num flex items-center gap-2 text-sm text-text-2">
              <Spinner size={16} />
              {t('studio.styles.drawing', { n: Math.min(drawn + 1, top.length), total: top.length })}
            </p>
          ) : null}
          {cards ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {top.map((r) => {
                const th = thumbs[r.styleId];
                return (
                  <li key={r.styleId} className="relative min-w-0">
                    <StyleCard
                      ranked={r}
                      thumb={th && th.url ? th.url : null}
                      omitReasonIds={r.trim ? TRIM_SHOWN : undefined}
                      selected={activeId === r.styleId}
                      onClick={() => open(r.style)}
                      className="h-full"
                    />
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-px top-px aspect-[4/5]">
                      {isGulf(r.style) ? <PhotoTag className="absolute start-2 top-2">{t('studio.styles.gulf')}</PhotoTag> : null}
                      {r.trim ? (
                        <PhotoTag icon="clock" className="absolute bottom-2 start-2 max-w-[calc(100%-1rem)]">
                          {t(r.trim.cardKey, r.trim.vars)}
                        </PhotoTag>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2">
              {top.map((r) => (
                <StyleRow
                  key={r.styleId}
                  item={r}
                  thumb={null}
                  canThumb={false}
                  request={request}
                  selected={activeId === r.styleId}
                  onOpen={open}
                />
              ))}
            </ul>
          )}
        </section>

        {hints.length ? (
          <section className="flex flex-col gap-2" aria-labelledby="styles-pair">
            <h2 id="styles-pair" className="text-lg">
              {chair ? t('studio.styles.pairTitle') : t('studio.styles.pairTitleHome')}
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
              {hints.map((h) => {
                const target = h.suggestStyleId ? byId.get(h.suggestStyleId) : null;
                const text = (
                  <span className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon name="scissors" size={20} className="mt-0.5 shrink-0 text-brass" />
                    <span className="min-w-0">{t(h.key, h.vars)}</span>
                  </span>
                );
                return (
                  <li key={h.id}>
                    {target ? (
                      <button
                        type="button"
                        onClick={() => open(target.style)}
                        className="press flex min-h-tap w-full flex-col items-stretch gap-2 px-4 py-3 text-start text-sm text-text active:bg-surface-2"
                      >
                        {text}
                        <span className="flex items-center gap-1 ps-7 font-semibold text-brass">
                          {t('studio.styles.pairTry', { name: pick(target.style.name) })}
                          <Icon name="chevron-right" size={18} />
                        </span>
                      </button>
                    ) : (
                      <p className="flex min-h-tap items-center px-4 py-3 text-sm text-text">{text}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <hr className="rule-brass" />

        <Button
          variant="secondary"
          icon={showAll ? 'chevron-up' : 'list'}
          aria-expanded={showAll}
          aria-controls="styles-all"
          onClick={() => setShowAll((v) => !v)}
          full
        >
          {showAll ? t('studio.styles.hideAll') : t('studio.styles.seeAll')}
        </Button>

        {showAll ? (
          <section id="styles-all" className="flex flex-col gap-4 pb-2" aria-labelledby="styles-all-title">
            <div id="styles-all-title">
              <SectionTitle aside={t('studio.styles.count', { n: filtered.length })}>{t('studio.styles.allTitle')}</SectionTitle>
            </div>
            <ChipRow label={t('studio.styles.filterLength')} options={lengthOptions} value={lengthFilter} onChange={(v) => setLengthFilter(v || 'all')} />
            <ChipRow label={t('studio.styles.filterMaint')} options={maintOptions} value={maintFilter} onChange={(v) => setMaintFilter(v || 'all')} />
            {filtered.length ? (
              <ul className="flex flex-col gap-2">
                {filtered.map((r) => (
                  <StyleRow
                    key={r.styleId}
                    item={r}
                    thumb={thumbs[r.styleId] || null}
                    canThumb={Boolean(front) && !previewFailed}
                    request={request}
                    selected={activeId === r.styleId}
                    onOpen={open}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="filter"
                title={t('studio.styles.noMatch')}
                actionLabel={t('studio.styles.clearFilters')}
                actionIcon="close"
                onAction={() => {
                  setLengthFilter('all');
                  setMaintFilter('all');
                }}
                className="py-6"
              />
            )}
          </section>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
