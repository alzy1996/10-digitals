import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { ErrorBox, Steps } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.jsx';
import { getPublicSalon } from '../services/salons.js';
import { publicCatalog } from '../services/catalog.js';
import { APP } from '../config/app.js';

export default function S24TryAtHome() {
  const { salonId } = useParams();
  const { t, lang, name } = useT();
  const session = useSession();
  const navigate = useNavigate();
  const [salon, setSalon] = useState(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPublicSalon(salonId)
      .then((s) => setSalon(s || null))
      .catch(() => setSalon(null));
  }, [salonId]);

  const start = async () => {
    setBusy(true);
    const catalog = await publicCatalog(salonId);
    await session.start('home', { salonId, catalog, salonPublic: salon });
    navigate('/capture');
  };

  return (
    <main className="screen mx-auto flex max-w-[640px] flex-col">
      <TopBar back={false} />
      {salon === undefined ? <Steps items={[{ key: 'l', label: t('common.loading'), state: 'doing' }]} /> : null}
      {salon === null ? <ErrorBox title={t('home.salonMissing')} body={t('home.salonMissingBody')} /> : null}
      {salon && salon.tryAtHome === false ? <ErrorBox title={t('home.tryOff')} /> : null}
      {salon && salon.tryAtHome !== false ? (
        <>
          <section className="flex flex-1 flex-col justify-center py-8">
            <p className="eyebrow">{t('home.welcomeTo')}</p>
            <h1 className="mt-2 font-display text-[40px] leading-[1.05] text-plum">{name({ en: salon.name, ar: salon.nameAr })}</h1>
            <p className="mt-1 text-ink2" lang={lang === 'ar' ? 'en' : 'ar'}>{lang === 'ar' ? salon.name : salon.nameAr}</p>
            <p className="mt-6 max-w-[34ch] text-lg">{t('home.lead')}</p>
            <div className="card mt-6 flex items-start gap-3 p-4">
              <Icon name="lock" className="mt-0.5 text-clay" />
              <div>
                <div className="font-semibold">{t('home.promise')}</div>
                <p className="mt-1 text-sm text-ink2">{t('home.promiseBody')}</p>
              </div>
            </div>
          </section>
          <Button icon="camera" busy={busy} onClick={start}>{t('home.start')}</Button>
          <p className="mt-4 text-center text-xs text-ink2">{t('splash.footer', { studio: APP.studio })}</p>
        </>
      ) : null}
    </main>
  );
}
