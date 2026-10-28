import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from './lib/i18n.js';
import { usePublicShop } from './state/shop.jsx';
import { useSession } from './state/session.js';
import { copyText } from './reports/share.js';
import { APP } from './lib/config.js';
import Button from './ui/Button.jsx';
import Icon from './ui/Icon.jsx';
import IconButton from './ui/IconButton.jsx';
import ScreenFrame from './ui/ScreenFrame.jsx';
import Skeleton from './ui/Skeleton.jsx';
import { useSession as useSharedSession } from '../../hooks/useSession.jsx';
import { useSnackbar } from './ui/snackbar.js';
import LangSwitch from './home/LangSwitch.jsx';
import { lastCode } from './home/codeCache.js';
import { longDate, shopNames, spelled } from './home/text.js';

const STEPS = Object.freeze([
  { icon: 'camera', title: 'home.step1.title', body: 'home.step1.body' },
  { icon: 'beard', title: 'home.step2.title', body: 'home.step2.body' },
  { icon: 'qr', title: 'home.step3.title', body: 'home.step3.body' },
]);

/**
 * The customer will tap Start next: load the face models in the background now, so the
 * camera is ready sooner. Skipped when the phone asks to save data (the capture screen
 * loads them on demand); a failure here is harmless for the same reason.
 */
function useWarmModels() {
  useEffect(() => {
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    if (conn && conn.saveData) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      import('../../ai/beard/index.js')
        .then((ai) => {
          if (cancelled) return null;
          const s = ai.modelStatus();
          if (s.landmarker === 'ready' && s.segmenter !== 'idle' && s.segmenter !== 'loading') return null;
          return ai.loadModels({ segmenter: true });
        })
        .catch((err) => console.warn('Try at home: model warm-up did not finish; the capture screen loads them', err));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
}

/** Care & Us lockup for the top row: the beard mark in a ring, both scripts. */
function LihyaMark() {
  const { lang } = useT();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-plum">
        <Icon name="logo" size={22} className="text-plum" />
      </span>
      <span className="truncate whitespace-nowrap font-display text-lg font-semibold leading-none text-plum">{lang === 'ar' ? APP.nameAr : APP.name}</span>
    </div>
  );
}

/** The code made earlier in this visit, still valid: shown again after the session was wiped. */
function LastCode({ entry }) {
  const { t, lang } = useT();
  const { show } = useSnackbar();
  const copy = async () => {
    const ok = await copyText(entry.code);
    show({ message: ok ? t('beard.home.copied') : t('beard.home.copyFailed', { code: entry.code }) });
  };
  return (
    <section aria-labelledby="home-last" className="rounded-card border border-plum bg-surface p-4">
      <h2 id="home-last" className="!font-sans text-sm font-semibold text-ink2">
        {t('beard.home.last.title')}
      </h2>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p dir="ltr" className="font-mono text-[32px] font-semibold leading-none tracking-[0.25em] text-ink">
          <span className="sr-only">{spelled(entry.code)}</span>
          <span aria-hidden="true">{entry.code}</span>
        </p>
        <IconButton icon="copy" label={t('beard.home.copy')} tone="bordered" onClick={copy} />
      </div>
      <p className="num mt-2 text-sm text-ink2">{t('beard.home.last.until', { date: longDate(entry.expiresAt, lang) })}</p>
    </section>
  );
}

/** Defensive: the route wrapper already shows this before the screen renders. */
function NotActive() {
  const { t } = useT();
  return (
    <ScreenFrame title={t('beard.shop.public.inactive.title')} topBar={false}>
      <div className="flex min-h-full flex-col gap-10">
        <div className="flex items-center justify-between gap-3">
          <LihyaMark />
          <LangSwitch />
        </div>
        <section className="rounded-card border border-line bg-surface p-6" aria-live="polite">
          <Icon name="link" size={32} className="text-plum" />
          <h1 className="mt-4 text-xl">{t('beard.shop.public.inactive.title')}</h1>
          <p className="mt-3 text-ink2">{t('beard.shop.public.inactive.body')}</p>
        </section>
      </div>
    </ScreenFrame>
  );
}

/**
 * S21 Try at home landing (/try/:shopId). The customer arrives from the shop's QR code or
 * Instagram bio, sees the shop's name, the promise that the photo stays on the phone and
 * three steps, then taps Start (capture in home mode). Nothing here needs sign-in.
 */
export default function S21TryAtHome() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { shopId, info, loading } = usePublicShop();
  const { path, hasData, wipe } = useSession();
  const shared = useSharedSession();
  const { dismiss } = useSnackbar();
  const [leaving, setLeaving] = useState(false);
  useWarmModels();

  if (loading) {
    return (
      <ScreenFrame title={t('beard.home.title')} topBar={false}>
        <div role="status" aria-busy="true" className="flex flex-col gap-4 pt-8">
          <span className="sr-only">{t('beard.common.loading')}</span>
          <Skeleton className="h-10 w-1/2" />
          <Skeleton rounded="card" className="h-40 w-full" />
          <Skeleton rounded="card" className="h-56 w-full" />
        </div>
      </ScreenFrame>
    );
  }
  if (!info || info.tryAtHome !== true) return <NotActive />;

  const names = shopNames(info, lang);
  const last = lastCode(shopId);

  const start = async () => {
    if (leaving) return;
    setLeaving(true);
    if (hasData) {
      // A look from before (back button, or "Start over" still showing Undo): a new try starts clean.
      dismiss();
      Promise.resolve(wipe('manual')).catch((err) => console.warn('Try at home: the old session was not fully cleared', err));
    }
    // The customer's own session (home mode): the shared idle wipe and privacy rules apply.
    await shared.start('home', { salonId: shopId, section: 'beard' });
    navigate(path('capture'));
  };

  const footer = (
    <Button icon="camera" loading={leaving} onClick={start}>
      {t('beard.home.start')}
    </Button>
  );

  return (
    <ScreenFrame title={names.main || t('beard.home.title')} topBar={false} footer={footer}>
      <div className="flex flex-col gap-8 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-3">
          <LihyaMark />
          <LangSwitch />
        </div>

        <section aria-labelledby="home-promise" className="flex flex-col items-center text-center">
          <div className="w-full rounded-card border border-plum p-1.5">
            <div className="flex flex-col items-center gap-2 rounded-[12px] border border-plum px-4 py-5">
              <p className="text-xs font-semibold uppercase text-plum ltr:tracking-[0.25em] rtl:text-sm">{t('beard.home.title')}</p>
              {names.main ? (
                <p className="font-display text-[34px] leading-[1.1] text-ink">
                  <bdi>{names.main}</bdi>
                </p>
              ) : null}
              {names.other ? (
                <p lang={names.otherLang} className="font-display text-lg leading-tight text-ink2">
                  <bdi>{names.other}</bdi>
                </p>
              ) : null}
            </div>
          </div>
          <h1 id="home-promise" className="mt-8 font-display text-[44px] leading-[1.08] text-ink">
            {t('beard.home.promise')}
          </h1>
          <p className="mt-4 max-w-sm text-lg text-ink2">{t('beard.home.lead')}</p>
        </section>

        {last ? <LastCode entry={last} /> : null}

        <section aria-labelledby="home-steps">
          <h2 id="home-steps" className="!font-sans text-xs font-semibold uppercase text-ink2 ltr:tracking-[0.2em] rtl:text-sm">
            {t('beard.home.steps.title')}
          </h2>
          <ol className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-4 border-line p-4 [&:not(:first-child)]:border-t">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-plum text-plum">
                  <Icon name={s.icon} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-baseline gap-2 text-lg leading-snug text-ink">
                    <span className="num font-display text-plum">{i + 1}</span>
                    <span>{t(s.title)}</span>
                  </h3>
                  <p className="mt-1 text-sm text-ink2">{t(s.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex items-start gap-3 px-1 pb-2">
          <Icon name="lock" size={20} className="mt-0.5 text-plum" />
          <p className="text-sm text-ink2">
            {t('beard.home.private')} {t('beard.home.noSignup')}
          </p>
        </div>
      </div>
    </ScreenFrame>
  );
}
