// S13 Done and next visit (PRD 8.1 step 11): his rating (1 to 5 dots, no emoji), the
// add-ons he bought from the shop's own active products, the next visit in days and a
// "Copy reminder + open WhatsApp" (the app never sends messages). "Next customer"
// completes the consultation, keeps the before/after on this phone only when he agreed,
// wipes every photo of this session and goes back to the barber home.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import ChipRow from '../components/ChipRow.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Icon from '../components/Icon.jsx';
import RatingDots from '../components/RatingDots.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useT } from '../lib/i18n/useT.js';
import { formatOmr, roundOmr } from '../lib/format.js';
import { addDaysToKey, dayKey as muscatDayKey, formatDayKey } from '../lib/time.js';
import { saveBeforeAfter } from '../lib/idb.js';
import { useSession } from '../hooks/useSession.js';
import { useLive } from '../hooks/useLive.js';
import { useShop } from '../state/ShopContext.jsx';
import { watchProducts } from '../services/products.js';
import { completeConsultation } from '../services/consultations.js';
import { copyAndOpenWhatsApp } from '../reports/share.js';
import { formatDuration } from '../reports/text.js';
import { releaseFinalLook } from './approve/finalLookJob.js';
import { reminderBilingual } from './approve/cardText.js';
import { useClientRecord, useStyle } from './approve/hooks.js';
import { needsVisitReplan, nextVisitChoices, replanNextVisit, suggestNextVisitDays } from '../lib/cutcard.js';

const DEFAULT_VISIT_DAYS = 14;

function daysLabel(t, n) {
  return t(n >= 3 && n <= 10 ? 'approve.done.days.few' : 'approve.done.days.many', { n });
}

function canvasBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.toBlob !== 'function' || !canvas.width) {
      resolve(null);
      return;
    }
    try {
      canvas.toBlob((b) => resolve(b || null), 'image/jpeg', 0.9);
    } catch {
      resolve(null);
    }
  });
}

function Section({ id, title, hint, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 py-5">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        {hint ? <p className="text-sm text-text-2">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function S13Done() {
  const { t, lang, pick } = useT();
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const session = useSession();
  const { shopId, shop } = useShop();
  const { path, wipe, cutCard: storedCard, answers, approved, consultationId, client, keepPhotos, shots, effectiveProfile, profile, hydrated } = session;
  // The Cut Card's next visit, planned with his visit-frequency answer (the same rule the
  // Cut Card screen prints), so the chip preselected here is exactly the card's.
  const cutCard = useMemo(
    () => (storedCard && needsVisitReplan(storedCard, answers) ? replanNextVisit(storedCard, answers) : storedCard),
    [storedCard, answers],
  );
  const style = useStyle(shopId, (cutCard && cutCard.styleId) || (approved && approved.params ? approved.params.styleId : null));
  const record = useClientRecord(shopId, client);
  const [productsAttempt, setProductsAttempt] = useState(0);
  const live = useLive((cb, onError) => watchProducts(shopId, cb, onError), [shopId, productsAttempt]);

  const visitFrequency = answers ? answers.visitFrequency : null;
  const suggested =
    cutCard && Number.isFinite(cutCard.nextVisitDays) && cutCard.nextVisitDays > 0
      ? cutCard.nextVisitDays
      : style && style.trimDays
        ? suggestNextVisitDays({ trimDays: style.trimDays, visitFrequency })
        : null;
  const [rating, setRating] = useState(0);
  const [addOns, setAddOns] = useState([]);
  // null until the barber picks a chip: the suggestion (once the session is back) stays selected.
  const [picked, setPicked] = useState(null);
  const visitDays = picked ?? suggested ?? DEFAULT_VISIT_DAYS;
  const [finishing, setFinishing] = useState(false);

  const active = useMemo(() => (Array.isArray(live.data) ? live.data.filter((p) => p && p.active !== false) : []), [live.data]);
  const canRecord = Boolean(consultationId && (approved || cutCard));
  const realClient = Boolean(client && client.id && !client.walkIn);
  const front = shots ? shots.front : null;
  const willKeep = Boolean(keepPhotos && realClient && front && front.canvas && front.canvas.width && approved && approved.params);

  const nextKey = addDaysToKey(muscatDayKey(new Date()), visitDays);
  const nextDate = formatDayKey(nextKey, lang);
  const addOnTotal = roundOmr(
    active.filter((p) => addOns.includes(p.id)).reduce((sum, p) => sum + (Number.isFinite(Number(p.priceOmr)) ? Number(p.priceOmr) : 0), 0),
  );

  const visitOptions = nextVisitChoices(suggested).map((d) => ({ value: d, label: daysLabel(t, d), icon: suggested && d === suggested ? 'star-line' : undefined }));

  const sendReminder = () => {
    const text = reminderBilingual({ shop, clientName: realClient ? client.displayName : null, dayKey: nextKey });
    const phone = record && record.phone ? record.phone : null;
    copyAndOpenWhatsApp(text, phone).then(({ copied }) => {
      show({ message: copied ? t('approve.done.reminderCopied') : t('approve.done.reminderOpened') });
    });
  };

  const keepBeforeAfter = async () => {
    const { renderStudio } = await import('../ai/index.js');
    const after = await renderStudio({ shot: front, params: approved.params, profile: effectiveProfile || profile, maxSize: 1280 });
    try {
      const [b, a] = await Promise.all([canvasBlob(front.canvas), canvasBlob(after)]);
      if (!b || !a) return null;
      return await saveBeforeAfter(client.id, { before: b, after: a, at: approved.at || new Date() });
    } finally {
      after.width = 0;
      after.height = 0;
    }
  };

  const nextCustomer = async () => {
    if (finishing) return;
    setFinishing(true);
    if (canRecord) {
      try {
        completeConsultation(shopId, consultationId, { rating: rating || null, nextVisitDays: visitDays, addOns, startedAt: session.startedAt });
      } catch (err) {
        console.error('The visit could not be completed', err);
      }
    }
    let kept = null;
    if (willKeep) {
      try {
        kept = await keepBeforeAfter();
      } catch (err) {
        console.warn('Before and after could not be kept', err);
      }
    }
    releaseFinalLook();
    // The wipe clears the session at once (its IndexedDB part finishes in the background);
    // navigating in the same tick means this screen never shows the empty session.
    const wiping = wipe('next');
    navigate(path(''), { replace: true });
    if (willKeep && !kept) show({ message: t('approve.done.photosFailed') });
    else show({ message: kept ? `${t('session.wiped.next')} ${t('approve.done.photosSaved')}` : t('session.wiped.next') });
    Promise.resolve(wiping).catch((err) => console.warn('Session wipe did not finish', err));
  };

  /* ---- add-ons */
  let addOnBody;
  if (live.error) {
    addOnBody = <ErrorState className="py-4" message={t('approve.done.productsError')} onRetry={() => setProductsAttempt((n) => n + 1)} />;
  } else if (live.loading) {
    addOnBody = (
      <div role="status" aria-busy="true" className="flex flex-wrap gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton rounded="full" className="h-chip w-36" />
        <Skeleton rounded="full" className="h-chip w-28" />
        <Skeleton rounded="full" className="h-chip w-40" />
      </div>
    );
  } else if (!active.length) {
    addOnBody = (
      <EmptyState
        className="rounded-card border border-dashed border-line py-6"
        icon="box"
        title={t('approve.done.noProducts')}
        message={t('approve.done.noProductsBody')}
      />
    );
  } else {
    addOnBody = (
      <>
        <ChipRow
          multi
          options={active.map((p) => ({
            value: p.id,
            label: `${pick(p, 'name', 'nameAr')} · ${formatOmr(p.priceOmr, lang)}`,
          }))}
          value={addOns}
          onChange={(v) => setAddOns(Array.isArray(v) ? v : [])}
        />
        {addOns.length ? (
          <p role="status" className="num text-sm text-text-2">
            {t('approve.done.addOnsTotal', { n: addOns.length, total: formatOmr(addOnTotal, lang) })}
          </p>
        ) : null}
      </>
    );
  }

  const decided = approved ? formatDuration(approved.decisionSeconds) : '';
  const styleName = style ? pick(style.name) : '';
  const clientName = realClient ? client.displayName : t('approve.done.walkIn');

  return (
    <ScreenFrame
      title={t('approve.done.title')}
      back={cutCard ? path('cut-card') : null}
      footer={
        <BottomAction>
          {willKeep ? (
            <p className="flex items-center gap-2 text-sm text-text-2">
              <Icon name="lock" size={16} />
              {t('approve.done.photosKept')}
            </p>
          ) : null}
          <Button variant="primary" icon="users" loading={finishing} onClick={nextCustomer}>
            {finishing ? t('approve.done.finishing') : t('session.nextCustomer')}
          </Button>
        </BottomAction>
      }
    >
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brass/60 text-brass">
          <Icon name="scissors" size={24} />
        </span>
        <div className="min-w-0 flex-1">
          {styleName ? <p className="display truncate text-xl leading-tight text-text">{styleName}</p> : null}
          <p className="truncate text-sm text-text-2">
            <bdi>{clientName}</bdi>
          </p>
          {decided ? (
            <p className="num mt-0.5 flex items-center gap-1.5 text-sm text-text-2">
              <Icon name="clock" size={16} />
              {t('session.decision', { duration: decided })}
            </p>
          ) : null}
        </div>
      </section>

      {!hydrated ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-4 py-5">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : !canRecord ? (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-text-2">
          <Icon name="info" size={20} className="mt-0.5 shrink-0" />
          {t('approve.done.notApproved')}
        </p>
      ) : (
        <>
          <Section id="rating-title" title={t('approve.done.rating')} hint={t('approve.done.ratingHint')}>
            <RatingDots value={rating} onChange={setRating} />
          </Section>

          <hr className="rule-brass" />

          <Section id="addons-title" title={t('approve.done.addOns')} hint={active.length ? t('approve.done.addOnsHint') : null}>
            {addOnBody}
          </Section>

          <hr className="rule-brass" />

          <Section
            id="visit-title"
            title={t('approve.done.nextVisit')}
            hint={suggested ? t('approve.done.suggested', { days: daysLabel(t, suggested) }) : null}
          >
            <ChipRow options={visitOptions} value={visitDays} onChange={(v) => v && setPicked(v)} />
            <p className="flex items-center gap-2 text-base text-text">
              <Icon name="calendar" size={20} className="text-brass" />
              <span className="num">{t('approve.done.nextDate', { date: nextDate })}</span>
            </p>
            <Button variant="secondary" icon="whatsapp" full onClick={sendReminder}>
              {t('approve.done.reminder')}
            </Button>
            <p className="text-sm text-text-2">
              {record && record.phone ? t('approve.done.reminderHint') : t('approve.done.reminderNoPhone')}
            </p>
          </Section>
        </>
      )}
    </ScreenFrame>
  );
}
