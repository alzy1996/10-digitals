import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { markDone } from '../services/consultations.js';
import { saveClientProfile, markVisit } from '../services/clients.js';
import { logConsent } from '../services/consents.js';
import { nextVisitWeeks } from '../reports/aftercare.js';
import { whatsappLink } from '../reports/agreementCardPdf.js';
import { profileLabels, learnGrowthRate } from '../ai/hair/index.js';
import { disposeThumbs } from '../hooks/useThumbs.js';
import { mySections } from '../lib/sections.js';

export default function S15Done() {
  const { t, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const catalog = useCatalog();
  const cut = catalog.cuts.find((c) => c.id === session.look.cutId);
  const technique = session.look.shadeId ? catalog.techniques.find((x) => x.id === session.look.technique) : null;
  const suggested = useMemo(() => nextVisitWeeks({ cut, technique }), [cut, technique]);
  const [rating, setRating] = useState(0);
  const [weeks, setWeeks] = useState(suggested);
  const [saveProfile, setSaveProfile] = useState(false);
  const [saved, setSaved] = useState(false);
  const client = session.client;

  const reminder = t('done.reminder', {
    salon: name({ en: app.salon?.name, ar: app.salon?.nameAr }),
    name: client?.displayName || '',
    weeks,
  });

  const doneOnce = useRef(false);
  const finish = () => {
    if (doneOnce.current) return;
    doneOnce.current = true;
    if (session.consultationId) markDone(app.salonId, { id: session.consultationId, demo: false }, { rating: rating || null, nextVisitWeeks: weeks });
    if (client?.id) {
      if (saveProfile && session.profile) {
        logConsent(app.salonId, { type: 'profile_save', clientId: client.id, consultationId: session.consultationId, granted: true });
        const growth = learnGrowthRate({ regrowthCm: session.profile.hair.regrowthCm, lastVisitAt: client.lastVisitAt?.toDate?.(), fallback: client.growthCmPerMonth || app.settings?.growthCmPerMonth || 1.25 });
        saveClientProfile(app.salonId, client, {
          labels: profileLabels(session.profile),
          history: session.history,
          shrinkagePct: session.shrinkPct,
          growthCmPerMonth: growth,
        });
      }
      markVisit(app.salonId, client.id);
    }
    setSaved(true);
    snack.show({ message: t('done.saved') });
  };

  const next = async () => {
    finish();
    disposeThumbs();
    await session.wipe();
    navigate('/home', { replace: true });
  };

  // Same client, same visit: keeps the visit id so hair + nails end on one Agreement Card.
  const another = () => {
    finish();
    disposeThumbs();
    navigate('/home?continueVisit=1', { replace: true });
  };

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
          {[4, 6, 8, 10, 12].map((w) => (
            <Chip key={w} selected={weeks === w} onClick={() => setWeeks(w)}>
              {t('regrowth.w', { n: w })}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink2">{t('done.suggested', { n: suggested })}</p>
        <div className="mt-4">
          <Button variant="secondary" icon="whatsapp" onClick={openWa}>{t('done.copyWa')}</Button>
        </div>
        <p className="mt-2 text-xs text-ink2">{t('done.waNote')}</p>
      </section>
      {client?.id ? (
        <section className="card mb-5 p-5">
          <Chip selected={saveProfile} icon="lock" onClick={() => setSaveProfile((v) => !v)}>{t('done.saveProfile')}</Chip>
          <p className="mt-2 text-xs text-ink2">{t('done.saveProfileNote')}</p>
        </section>
      ) : null}
      <div className="space-y-3">
        {!saved ? <Button variant="secondary" icon="check" onClick={finish}>{t('done.save')}</Button> : null}
        {mySections(app.salon, app.me).length > 1 ? (
          <Button variant="secondary" icon="plus" onClick={another}>{t('home.addService', { name: session.client?.displayName || '' })}</Button>
        ) : null}
        {session.visitId && (session.done || []).length ? (
          <Button variant="secondary" icon="list" onClick={() => navigate(`/visit/${session.visitId}`)}>{t('visit.open', { n: (session.done || []).length + 1 })}</Button>
        ) : null}
        <Button icon="refresh" onClick={next}>{t('done.nextClient')}</Button>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-ink2">
        <Icon name="lock" size={14} />
        {t('done.wipeNote')}
      </p>
    </main>
  );
}
