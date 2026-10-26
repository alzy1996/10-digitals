import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { translate, useT } from '../lib/i18n/useT.js';
import { usePublicShop } from '../state/ShopContext.jsx';
import { useSession } from '../hooks/useSession.js';
import { useOnline, usePendingWrites } from '../hooks/useOnline.js';
import { createLookCode } from '../services/lookCodes.js';
import { lookSummary } from '../lib/look.js';
import { normalizeOmanPhone, waLink } from '../lib/format.js';
import { copyText } from '../reports/share.js';
import { APP, LIMITS } from '../config/app.js';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Icon from '../components/Icon.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Skeleton from '../components/Skeleton.jsx';
import ZoneDiagram from '../components/ZoneDiagram.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useDemo } from '../state/DemoMode.jsx';
import { createOnce, findCode, lookKey, rememberCode } from './home/codeCache.js';
import { lookCodeCardBlob, saveCardImage } from './home/codeCard.js';
import { findStyle, longDate, shopNames, spelled, styleNames } from './home/text.js';

const NETWORK_CODES = new Set(['auth/network-request-failed', 'unavailable', 'deadline-exceeded']);

function failureKind(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const code = err && err.code;
  if (NETWORK_CODES.has(code)) return 'offline';
  if (code === 'permission-denied') return 'off';
  return 'error';
}

/** The code, huge, one character per box. Always left to right, in both languages. */
function CodeDisplay({ code, label }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="sr-only">{label}</p>
      <div dir="ltr" aria-hidden="true" className="grid w-full max-w-[420px] grid-cols-6 gap-1.5 sm:gap-2.5">
        {code.split('').map((ch, i) => (
          <span
            key={i}
            className="flex h-[76px] items-center justify-center rounded-ctl border-2 border-brass/80 bg-surface-2 font-mono text-[38px] font-semibold leading-none text-text sm:h-[84px] sm:text-[44px]"
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

function CodeSkeleton({ step }) {
  const { t } = useT();
  return (
    <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-4">
      <div dir="ltr" aria-hidden="true" className="grid w-full max-w-[420px] grid-cols-6 gap-1.5 sm:gap-2.5">
        {Array.from({ length: LIMITS.lookCodeLength }, (_, i) => (
          <Skeleton key={i} className="h-[76px] sm:h-[84px]" />
        ))}
      </div>
      <p className="text-lg text-text">{step}</p>
      <p className="text-center text-sm text-text-2">{t('home.code.creatingNote')}</p>
    </div>
  );
}

/** Style name in both languages, the one-line summary and the zone drawing (no photo). */
function LookCard({ params, style }) {
  const { t, lang } = useT();
  const names = styleNames(style, lang);
  const title = names.main || params.styleId || '';
  // lookSummary starts with the style name; the heading shows it already.
  const parts = lookSummary(params, lang, style || null).split(' · ');
  if (parts.length && parts[0] === title) parts.shift();
  const summary = parts.join(' · ');
  return (
    <section aria-labelledby="home-look" className="flex items-start gap-4 rounded-card border border-line bg-surface p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs font-semibold uppercase text-brass ltr:tracking-[0.2em] rtl:text-sm">{t('home.code.yourStyle')}</p>
        <h2 id="home-look" className="font-display text-2xl leading-tight text-text">
          <bdi>{title}</bdi>
        </h2>
        {names.other ? (
          <p lang={lang === 'ar' ? 'en' : 'ar'} className="text-sm text-text-2">
            <bdi>{names.other}</bdi>
          </p>
        ) : null}
        {summary ? <p className="num mt-2 text-sm text-text">{summary}</p> : null}
      </div>
      <ZoneDiagram params={params} view="front" size={96} showLabels={false} title={title} className="shrink-0" />
    </section>
  );
}

function Line({ icon, tone = 'text-text-2', children }) {
  return (
    <p className="flex items-start gap-3 text-sm text-text-2">
      <Icon name={icon} size={20} className={`mt-0.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

/** The WhatsApp booking text: the customer's language first, then the other one. */
function bookingText({ lang, info, style, code }) {
  const part = (L) => {
    const shop = shopNames(info, L).main || translate(L, 'home.wa.theShop');
    const styleName = styleNames(style, L).main;
    const key = styleName ? 'home.wa.message' : 'home.wa.messageNoStyle';
    return translate(L, key, { shop, code, style: styleName });
  };
  const other = lang === 'ar' ? 'en' : 'ar';
  return `${part(lang)}\n\n${part(other)}`;
}

/** The session's code for this look when it is still valid (survives a reload), else null. */
function issuedFor(issuedCode, key, now = Date.now()) {
  return issuedCode && key && issuedCode.key === key && issuedCode.expiresAt > now ? issuedCode : null;
}

/** What the session keeps of a code: no photo, no params copy (the key names the look). */
function toIssued(entry, key, styleId) {
  return { code: entry.code, key, styleId, createdAt: entry.createdAt, expiresAt: entry.expiresAt };
}

/**
 * S22 Look Code result (/try/:shopId/code). The Studio's "Get my Look Code" lands here with
 * the designed look in useSession().activeParams. The code is made once per look (anonymous
 * sign-in, style parameters only, never a photo), shown huge, and can be copied, saved as an
 * image or sent to the shop on WhatsApp. Making the code needs internet; the look stays on
 * this phone until the customer starts over or the session's idle wipe runs. The code is
 * kept in the session snapshot (useSession().issuedCode), so a reload, or the phone dropping
 * the tab while the customer is in WhatsApp, shows the same code instead of making another.
 */
export default function S22LookCodeResult() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const pendingWrites = usePendingWrites();
  const { show, confirmUndo } = useSnackbar();
  const { shopId, info, styles } = usePublicShop();
  const { activeParams, hydrated, wipe, path, issuedCode, setIssuedCode } = useSession();
  const demo = useDemo();

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ status: 'idle', key: null, entry: null });
  const [image, setImage] = useState({ key: null, blob: null, failed: false });
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const keyRef = useRef(null);

  const styleId = activeParams ? activeParams.styleId || null : null;
  const key = activeParams && styleId ? lookKey(styleId, activeParams) : null;
  keyRef.current = key;
  const restored = issuedFor(issuedCode, key);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A code restored from the session (after a reload) is this visit's code again: the
  // landing page shows it too.
  useEffect(() => {
    if (restored && !findCode(shopId, key)) rememberCode(shopId, restored);
  }, [restored, shopId, key]);

  // Make the code for this look (once; a look that already has a code on this phone, in
  // memory or in the session snapshot, reuses it).
  useEffect(() => {
    if (!hydrated || !key || findCode(shopId, key) || restored) return;
    // Demo mode keeps the code in this browser: no internet needed.
    if (!demo && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setResult({ status: 'offline', key, entry: null });
      return;
    }
    setResult({ status: 'creating', key, entry: null });
    createOnce(shopId, key, styleId, () => createLookCode(shopId, { styleId, params: activeParams })).then(
      (entry) => {
        // Kept in the session even when the customer has left this screen: a reload later shows it.
        setIssuedCode(toIssued(entry, key, styleId));
        if (mountedRef.current && keyRef.current === key) setResult({ status: 'ready', key, entry });
      },
      (err) => {
        console.warn('Try at home: the Look Code could not be made', err);
        if (mountedRef.current && keyRef.current === key) setResult({ status: failureKind(err), key, entry: null });
      },
    );
  }, [demo, hydrated, key, shopId, styleId, activeParams, attempt, restored, setIssuedCode]);

  // The phone comes back online after "You need internet": make the code now. Only on the
  // offline -> online change: a failed request while the phone says it is online waits for Retry.
  const wasOnlineRef = useRef(online);
  useEffect(() => {
    const was = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (online && !was && result.status === 'offline' && result.key === key) setAttempt((n) => n + 1);
  }, [online, result.status, result.key, key]);

  const entry =
    (key && findCode(shopId, key)) || restored || (result.key === key && result.status === 'ready' ? result.entry : null);

  // A code made on this phone for this look (memory cache after Undo, for example) goes into
  // the session too, so the next reload shows it.
  useEffect(() => {
    if (entry && key && (!issuedCode || issuedCode.key !== key || issuedCode.code !== entry.code)) {
      setIssuedCode(toIssued(entry, key, styleId));
    }
  }, [entry, key, styleId, issuedCode, setIssuedCode]);
  let status;
  if (!hydrated) status = 'restoring';
  else if (!key) status = 'empty';
  else if (entry) status = 'ready';
  else if (result.key === key && ['offline', 'error', 'off'].includes(result.status)) status = result.status;
  else status = 'creating';

  const style = findStyle(styles, styleId);
  const shop = shopNames(info, lang);
  const expires = entry ? longDate(entry.expiresAt, lang) : '';
  const imageKey = entry ? `${entry.code}|${lang}|${shop.main}|${style ? style.id : ''}` : null;

  // Draw the image card ahead of the tap, so saving (share sheet on iPhone) starts inside the tap.
  useEffect(() => {
    if (!entry || !imageKey) return undefined;
    let alive = true;
    const names = styleNames(style, lang);
    lookCodeCardBlob({
      shop: shop.main,
      shopOther: shop.other,
      label: t('ui.code.label'),
      code: entry.code,
      style: names.main,
      styleOther: names.other,
      expires: t('home.image.until', { date: longDate(entry.expiresAt, lang) }),
      show: t('home.image.show'),
      brand: `${APP.name}  ·  ${APP.nameAr}`,
    }).then(
      (blob) => {
        if (alive) setImage({ key: imageKey, blob, failed: false });
      },
      (err) => {
        console.warn('Try at home: the Look Code image could not be drawn', err);
        if (alive) setImage({ key: imageKey, blob: null, failed: true });
      },
    );
    return () => {
      alive = false;
    };
    // imageKey covers the code, the language, the shop name and the style.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey]);

  const retry = () => setAttempt((n) => n + 1);

  const copy = async () => {
    if (!entry) return;
    const ok = await copyText(entry.code);
    show({ message: ok ? t('home.copied') : t('home.copyFailed', { code: entry.code }) });
  };

  const imageReady = image.key === imageKey && image.blob;
  const imageFailed = image.key === imageKey && image.failed;
  const saveImage = async () => {
    if (!entry || saving) return;
    if (!imageReady) {
      show({ message: imageFailed ? t('home.code.imageFailed') : t('home.code.imagePreparing') });
      return;
    }
    setSaving(true);
    const outcome = await saveCardImage(image.blob, `lihya-look-code-${entry.code}.png`);
    if (!mountedRef.current) return;
    setSaving(false);
    if (outcome === 'downloaded') show({ message: t('home.code.imageSaved') });
    else if (outcome === 'failed') show({ message: t('home.code.imageFailed') });
  };

  const startOver = useCallback(() => {
    navigate(path(''), { replace: true });
    confirmUndo({
      message: t('home.code.startingOver'),
      onCommit: () => {
        Promise.resolve(wipe('manual')).catch((err) => console.warn('Try at home: the session was not fully cleared', err));
      },
      onUndo: () => navigate(path('code')),
    });
  }, [navigate, path, confirmUndo, t, wipe]);

  const phone = info && info.whatsapp ? normalizeOmanPhone(info.whatsapp) || String(info.whatsapp) : '';
  const waHref = entry ? waLink(bookingText({ lang, info, style, code: entry.code }), phone || undefined) : '#';

  /* ------------------------------------------------------------ states */
  const title = t('home.code.title');

  if (status === 'restoring') {
    return (
      <ScreenFrame title={title} back={path('studio')}>
        <CodeSkeleton step={t('common.loading')} />
      </ScreenFrame>
    );
  }

  if (status === 'empty') {
    return (
      <ScreenFrame
        title={title}
        back={path('')}
        footer={
          <Button icon="home" onClick={() => navigate(path(''))}>
            {t('home.code.empty.action')}
          </Button>
        }
      >
        <EmptyState icon="beard" title={t('home.code.empty.title')} message={t('home.code.empty.body')} />
      </ScreenFrame>
    );
  }

  if (status === 'offline' || status === 'error' || status === 'off') {
    const copyKeys = {
      offline: { icon: 'wifi-off', title: 'home.code.offline.title', body: 'home.code.offline.body' },
      error: { icon: 'warning', title: 'home.code.error.title', body: 'home.code.error.body' },
      off: { icon: 'link', title: 'home.code.off.title', body: 'home.code.off.body' },
    }[status];
    const footer =
      status === 'off' ? (
        <Button variant="secondary" icon="refresh" full onClick={startOver}>
          {t('home.code.startOver')}
        </Button>
      ) : (
        <Button icon="refresh" onClick={retry}>
          {t('common.retry')}
        </Button>
      );
    return (
      <ScreenFrame title={title} back={path('studio')} footer={footer}>
        <ErrorState icon={copyKeys.icon} title={t(copyKeys.title)} message={t(copyKeys.body)} />
        <div className="mx-auto max-w-sm">
          <Line icon="lock" tone="text-brass">
            {t('home.code.neverUploaded')}
          </Line>
        </div>
      </ScreenFrame>
    );
  }

  const footer = (
    <div className="flex flex-col gap-2">
      {status === 'ready' && !phone ? <p className="text-center text-sm text-text-2">{t('home.code.noWhatsapp')}</p> : null}
      {status === 'ready' ? (
        <Button as="a" href={waHref} target="_blank" rel="noopener noreferrer" icon="whatsapp">
          {t('home.code.book')}
        </Button>
      ) : (
        <Button icon="whatsapp" loading>
          {t('home.code.book')}
        </Button>
      )}
    </div>
  );

  return (
    <ScreenFrame title={title} back={path('studio')} footer={footer}>
      <div className="flex flex-col gap-6">
        {status === 'creating' ? (
          <CodeSkeleton step={t('home.code.creating')} />
        ) : (
          <section aria-labelledby="home-code" className="flex flex-col items-center gap-4 text-center">
            <h2 id="home-code" className="sr-only">
              {title}
            </h2>
            <p className="text-sm font-semibold uppercase text-brass ltr:tracking-[0.25em]">{t('ui.code.label')}</p>
            <CodeDisplay code={entry.code} label={t('home.code.a11y', { chars: spelled(entry.code) })} />
            <p className="max-w-sm text-text">
              {shop.main ? t('home.code.show', { shop: `\u2068${shop.main}\u2069` }) : t('home.code.showNoShop')}
            </p>
            <p className="num flex items-center gap-2 text-sm text-text-2">
              <Icon name="clock" size={18} className="shrink-0" />
              <span>{t('home.code.expires', { days: LIMITS.lookCodeDays, date: expires })}</span>
            </p>
            <div className="grid w-full grid-cols-2 gap-3">
              <Button variant="secondary" icon="copy" full className="!px-3" onClick={copy}>
                {t('home.copy')}
              </Button>
              <Button variant="secondary" icon="download" full className="!px-3" loading={saving} onClick={saveImage}>
                {t('home.code.saveImage')}
              </Button>
            </div>
          </section>
        )}

        {activeParams ? <LookCard params={activeParams} style={style} /> : null}

        <div className="flex flex-col gap-3">
          {status === 'ready' && demo ? (
            <Line icon="info" tone="text-brass">
              {t('demo.code.local')}
            </Line>
          ) : null}
          {status === 'ready' && pendingWrites > 0 ? (
            <Line icon="cloud" tone="text-info">
              {t('home.code.syncing')}
            </Line>
          ) : null}
          <Line icon="lock" tone="text-brass">
            {t('home.code.neverUploaded')}
          </Line>
        </div>

        <hr className="rule-brass" />

        <div className="flex flex-col items-center gap-1 pb-2 text-center">
          <Button variant="ghost" icon="refresh" onClick={startOver}>
            {t('home.code.startOver')}
          </Button>
          <p className="text-sm text-text-2">{t('home.code.startOverHint')}</p>
        </div>
      </div>
    </ScreenFrame>
  );
}
