import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { APP } from '../config/app.js';
import { getSalonSummaries } from '../services/salons.js';

function Strands() {
  return (
    <svg viewBox="0 0 320 120" className="h-24 w-full text-clay" aria-hidden fill="none" stroke="currentColor" strokeLinecap="round">
      <path d="M8 96 C 70 20, 130 120, 190 50 S 290 30, 312 64" strokeWidth="1.5" />
      <path d="M8 104 C 80 34, 140 126, 200 60 S 292 44, 312 76" strokeWidth="1" opacity=".6" />
      <path d="M8 88 C 64 14, 124 112, 182 42 S 286 20, 312 52" strokeWidth="1" opacity=".35" />
    </svg>
  );
}

export default function S01Splash() {
  const { t, lang, name } = useT();
  const app = useApp();
  const navigate = useNavigate();
  const [salons, setSalons] = useState(null);

  useEffect(() => {
    if (!app.staffUser || app.userDoc === undefined) return;
    if (app.userDoc === null) {
      setSalons([]);
      return;
    }
    getSalonSummaries(app.userDoc.salonIds || []).then(setSalons);
  }, [app.staffUser, app.userDoc]);

  useEffect(() => {
    if (app.isStaff && app.salonId && salons && salons.length === 1) navigate('/home', { replace: true });
  }, [app.isStaff, app.salonId, salons, navigate]);

  const signedIn = Boolean(app.staffUser);
  return (
    <main className="screen mx-auto flex max-w-[720px] flex-col">
      <TopBar back={false} />
      <section className="flex flex-1 flex-col justify-center py-8">
        <p className="eyebrow">{t('splash.eyebrow')}</p>
        <h1 className="mt-2 pt-3 font-display text-[48px] leading-[1.25] text-plum">
          {lang === 'ar' ? APP.nameAr : APP.name}
          <span className="block text-[28px] text-ink2">{lang === 'ar' ? APP.name : APP.nameAr}</span>
        </h1>
        <Strands />
        <p className="max-w-[34ch] text-lg">{t('splash.promise')}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-ink2">
          <Icon name="lock" size={18} />
          {t('splash.private')}
        </p>
      </section>
      <section className="space-y-3 pb-4">
        {!signedIn ? (
          <>
            <Button icon="user" onClick={() => navigate('/login')}>
              {t('splash.staffSignIn')}
            </Button>
            <p className="pt-2 text-center text-sm text-ink2">{t('splash.customerHint')}</p>
          </>
        ) : salons === null ? (
          <div className="h-16 animate-pulse rounded-control bg-surface2" />
        ) : salons.length ? (
          <>
            <p className="label">{t('splash.pickSalon')}</p>
            {salons.map((s) => (
              <Button
                key={s.id}
                variant={s.id === app.salonId ? 'primary' : 'secondary'}
                iconEnd="chevron"
                onClick={() => {
                  app.setSalonId(s.id);
                  navigate('/home');
                }}
              >
                {name({ en: s.name, ar: s.nameAr })}
              </Button>
            ))}
            <Button variant="ghost" icon="plus" onClick={() => navigate('/create-salon')}>
              {t('splash.createAnother')}
            </Button>
          </>
        ) : (
          <>
            <Button icon="plus" onClick={() => navigate('/create-salon')}>
              {t('splash.createSalon')}
            </Button>
            <p className="text-center text-sm text-ink2">{t('splash.inviteHint')}</p>
          </>
        )}
      </section>
      <footer className="pb-2 text-center text-xs text-ink2">{t('splash.footer', { studio: APP.studio })}</footer>
    </main>
  );
}
