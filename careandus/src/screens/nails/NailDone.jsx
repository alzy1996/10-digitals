// Chair flow step 3 (/nails/done): rating + next visit, then the next client or another service
// for the same client (same visit, one Agreement Card; the home screen continues the visit).
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../../components/TopBar.jsx';
import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import Icon from '../../components/Icon.jsx';
import { useSnackbar } from '../../components/Snackbar.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { useApp } from '../../hooks/useApp.jsx';
import { useSession } from '../../hooks/useSession.jsx';
import { markDone } from '../../services/consultations.js';
import { markVisit } from '../../services/clients.js';
import { whatsappLink } from '../../reports/agreementCardPdf.js';
import { nextVisitWeeksFor } from './lib.js';
import { firstServiceOfVisit } from '../../lib/sections.js';

export default function NailDone() {
  const { t, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const suggested = nextVisitWeeksFor(session.nailDesign?.type);
  const [rating, setRating] = useState(0);
  const [weeks, setWeeks] = useState(suggested);
  const [saved, setSaved] = useState(false);
  const client = session.client;
  const doneOnce = useRef(false);

  const finish = () => {
    if (doneOnce.current) return;
    doneOnce.current = true;
    if (session.consultationId) markDone(app.salonId, { id: session.consultationId, section: 'nails', demo: false }, { rating: rating || null, nextVisitWeeks: weeks });
    if (client?.id && firstServiceOfVisit(session)) markVisit(app.salonId, client.id);
    setSaved(true);
    snack.show({ message: t('done.saved') });
  };

  const nextClient = async () => {
    finish();
    await session.wipe();
    navigate('/home', { replace: true });
  };

  const anotherService = () => {
    finish();
    navigate('/home?continueVisit=1');
  };

  const reminder = t('nails.reminder', { salon: name({ en: app.salon?.name, ar: app.salon?.nameAr }), name: client?.displayName || '', weeks });
  const openWa = async () => {
    try {
      await navigator.clipboard.writeText(reminder);
      snack.show({ message: t('common.copied') });
    } catch {
      // the link carries the text anyway
    }
    window.open(whatsappLink(client?.phone || '', reminder), '_blank', 'noopener');
  };

  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('done.title')} back={false} />
      <section className="card mb-5 p-5">
        <div className="label mb-3">{t('done.rating')}</div>
        <div className="flex justify-between gap-2" role="radiogroup" aria-label={t('done.rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}/5`}
              onClick={() => setRating(n)}
              className="press grid min-h-[56px] min-w-[56px] place-items-center rounded-full border border-line"
            >
              <span className={`block h-5 w-5 rounded-full ${n <= rating ? 'bg-plum' : 'border-2 border-line'}`} />
            </button>
          ))}
        </div>
      </section>
      <section className="card mb-5 p-5">
        <div className="label mb-2">{t('done.nextVisit')}</div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 6].map((w) => (
            <Chip key={w} selected={weeks === w} onClick={() => setWeeks(w)}>
              {t('regrowth.w', { n: w })}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink2">{t('done.suggested', { n: suggested })}</p>
        <div className="mt-4">
          <Button variant="secondary" icon="whatsapp" onClick={openWa}>{t('done.copyWa')}</Button>
        </div>
      </section>
      <div className="space-y-3">
        {!saved ? <Button variant="secondary" icon="check" onClick={finish}>{t('done.save')}</Button> : null}
        <Button icon="refresh" onClick={nextClient} data-testid="nails-next-client">{t('done.nextClient')}</Button>
        <Button variant="secondary" icon="plus" onClick={anotherService} data-testid="nails-another-service">
          {t('home.addService', { name: client?.displayName || t('nails.this_client') })}
        </Button>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-ink2">
        <Icon name="lock" size={14} />
        {t('done.wipeNote')}
      </p>
    </main>
  );
}
