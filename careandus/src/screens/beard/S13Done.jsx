// S13 Done and next visit (PRD 8.1 step 11): his rating (1 to 5 dots, no emoji), the next
// visit in days and a "Copy reminder + open WhatsApp" (the app never sends messages).
// "Next client" completes the consultation, wipes every photo of the visit and goes back to
// the stylist home. "Add another service" completes it and keeps the visit open (same
// client, same visit id) for hair or nails.

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from './ui/ScreenFrame.jsx';
import Button from './ui/Button.jsx';
import BottomAction from './ui/BottomAction.jsx';
import ChipRow from './ui/ChipRow.jsx';
import Icon from './ui/Icon.jsx';
import RatingDots from './ui/RatingDots.jsx';
import Skeleton from './ui/Skeleton.jsx';
import { useSnackbar } from './ui/snackbar.js';
import { useT } from './lib/i18n.js';
import { addDaysToKey, dayKey as muscatDayKey, formatDayKey } from './lib/time.js';
import { useSession } from './state/session.js';
import { useShop } from './state/shop.jsx';
import { completeConsultation } from './state/data.js';
import { useSession as useSharedSession } from '../../hooks/useSession.jsx';
import { copyAndOpenWhatsApp } from './reports/share.js';
import { formatDuration } from './reports/text.js';
import { reminderBilingual } from './approve/cardText.js';
import { useClientRecord, useStyle } from './approve/hooks.js';
import { needsVisitReplan, nextVisitChoices, replanNextVisit, suggestNextVisitDays } from './lib/cutcard.js';
import { firstServiceOfVisit } from '../../lib/sections.js';

const DEFAULT_VISIT_DAYS = 14;

function daysLabel(t, n) {
  return t(n >= 3 && n <= 10 ? 'approve.done.days.few' : 'approve.done.days.many', { n });
}

function Section({ id, title, hint, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 py-5">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        {hint ? <p className="text-sm text-ink2">{hint}</p> : null}
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
  const shared = useSharedSession();
  const { cutCard: storedCard, answers, approved, approvals, consultationId, client, path, hydrated } = session;
  // The Cut Card's next visit, planned with his visit-frequency answer (the same rule the
  // Cut Card screen prints), so the chip preselected here is exactly the card's.
  const cutCard = useMemo(
    () => (storedCard && needsVisitReplan(storedCard, answers) ? replanNextVisit(storedCard, answers) : storedCard),
    [storedCard, answers],
  );
  const style = useStyle(shopId, (cutCard && cutCard.styleId) || (approved && approved.params ? approved.params.styleId : null));
  const record = useClientRecord(shopId, client);

  const visitFrequency = answers ? answers.visitFrequency : null;
  const suggested =
    cutCard && Number.isFinite(cutCard.nextVisitDays) && cutCard.nextVisitDays > 0
      ? cutCard.nextVisitDays
      : style && style.trimDays
        ? suggestNextVisitDays({ trimDays: style.trimDays, visitFrequency })
        : null;
  const [rating, setRating] = useState(0);
  // null until the barber picks a chip: the suggestion (once the session is back) stays selected.
  const [picked, setPicked] = useState(null);
  const visitDays = picked ?? suggested ?? DEFAULT_VISIT_DAYS;
  const [finishing, setFinishing] = useState(false);

  const canRecord = Boolean(consultationId && approvals && approvals.stylistAt);
  const realClient = Boolean(client && client.id && !client.walkIn);

  const nextKey = addDaysToKey(muscatDayKey(new Date()), visitDays);
  const nextDate = formatDayKey(nextKey, lang);

  const visitOptions = nextVisitChoices(suggested).map((d) => ({ value: d, label: daysLabel(t, d), icon: suggested && d === suggested ? 'star-line' : undefined }));

  const sendReminder = () => {
    const text = reminderBilingual({ shop, clientName: realClient ? client.displayName : null, dayKey: nextKey });
    const phone = record && record.phone ? record.phone : null;
    copyAndOpenWhatsApp(text, phone).then(({ copied }) => {
      show({ message: copied ? t('beard.approve.done.reminderCopied') : t('beard.approve.done.reminderOpened') });
    });
  };

  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current || !canRecord) return;
    doneRef.current = true;
    try {
      completeConsultation(shopId, consultationId, { rating: rating || null, nextVisitDays: visitDays, clientId: realClient && firstServiceOfVisit(shared) ? client.id : null });
    } catch (err) {
      console.error('The visit could not be completed', err);
    }
  };

  // Next client: the whole visit ends, every photo of it is wiped.
  const nextCustomer = async () => {
    if (finishing) return;
    setFinishing(true);
    finish();
    await shared.wipe();
    navigate('/home', { replace: true });
    show({ message: t('beard.session.wiped.next') });
  };

  // Same client, same visit: hair or nails next (the beard photos go with this screen).
  const anotherService = () => {
    if (finishing) return;
    setFinishing(true);
    finish();
    navigate('/home?continueVisit=1', { replace: true });
  };

  const decided = approved ? formatDuration(approved.decisionSeconds) : '';
  const styleName = style ? pick(style.name) : '';
  const clientName = realClient ? client.displayName : t('beard.approve.done.walkIn');

  return (
    <ScreenFrame
      title={t('beard.approve.done.title')}
      back={cutCard ? path('cut-card') : null}
      footer={
        <BottomAction>
          <Button variant="primary" icon="users" loading={finishing} onClick={nextCustomer}>
            {finishing ? t('beard.approve.done.finishing') : t('beard.session.nextCustomer')}
          </Button>
          <Button variant="secondary" icon="plus" full disabled={finishing} onClick={anotherService}>
            {t('beard.approve.done.another')}
          </Button>
        </BottomAction>
      }
    >
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-plum text-plum">
          <Icon name="scissors" size={24} />
        </span>
        <div className="min-w-0 flex-1">
          {styleName ? <p className="font-display truncate text-xl leading-tight text-ink">{styleName}</p> : null}
          <p className="truncate text-sm text-ink2">
            <bdi>{clientName}</bdi>
          </p>
          {decided ? (
            <p className="num mt-0.5 flex items-center gap-1.5 text-sm text-ink2">
              <Icon name="clock" size={16} />
              {t('beard.session.decision', { duration: decided })}
            </p>
          ) : null}
        </div>
      </section>

      {!hydrated ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-4 py-5">
          <span className="sr-only">{t('beard.common.loading')}</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : !canRecord ? (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-ink2">
          <Icon name="info" size={20} className="mt-0.5 shrink-0" />
          {t('beard.approve.done.notApproved')}
        </p>
      ) : (
        <>
          <Section id="rating-title" title={t('beard.approve.done.rating')} hint={t('beard.approve.done.ratingHint')}>
            <RatingDots value={rating} onChange={setRating} />
          </Section>

          <hr className="rule-clay" />

          <Section
            id="visit-title"
            title={t('beard.approve.done.nextVisit')}
            hint={suggested ? t('beard.approve.done.suggested', { days: daysLabel(t, suggested) }) : null}
          >
            <ChipRow options={visitOptions} value={visitDays} onChange={(v) => v && setPicked(v)} />
            <p className="flex items-center gap-2 text-base text-ink">
              <Icon name="calendar" size={20} className="text-plum" />
              <span className="num">{t('beard.approve.done.nextDate', { date: nextDate })}</span>
            </p>
            <Button variant="secondary" icon="whatsapp" full onClick={sendReminder}>
              {t('beard.approve.done.reminder')}
            </Button>
            <p className="text-sm text-ink2">
              {record && record.phone ? t('beard.approve.done.reminderHint') : t('beard.approve.done.reminderNoPhone')}
            </p>
          </Section>
        </>
      )}
    </ScreenFrame>
  );
}
