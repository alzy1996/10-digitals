import { useEffect, useState } from 'react';
import { translate, useT } from '../../lib/i18n/useT.js';
import { appUrl } from '../../lib/paths.js';
import { copyText } from '../../reports/share.js';
import { printElement } from '../../reports/raster.js';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import { useSnackbar } from '../../components/Snackbar.jsx';
import { cx } from '../../components/kit.js';

// On screen: charcoal modules on bone inside a brass frame (dark-on-light scans with every
// phone camera, unlike an inverted code). In print: black on white.
const SCREEN_COLORS = { dark: '#0F1012', light: '#EDE8DF' };
const PRINT_COLORS = { dark: '#000000', light: '#FFFFFF' };
const A6_WIDTH = 397;

async function qrDataUrl(text, { width, color }) {
  const mod = await import('qrcode');
  const QRCode = mod.default || mod;
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width, color });
}

/** The shop link for Try at home: /try/<shopId> under the app's base path. */
export function shopTryUrl(shopId) {
  return appUrl(`/try/${encodeURIComponent(shopId)}`);
}

/** A6 counter card for printing: shop name, both languages, the QR and the link. */
function QrPrintCard({ src, url, nameAr, nameEn }) {
  const ar = (k) => translate('ar', k);
  const en = (k) => translate('en', k);
  const box = {
    width: A6_WIDTH,
    minHeight: 560,
    boxSizing: 'border-box',
    padding: '28px 26px',
    background: '#FFFFFF',
    color: '#111111',
    fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 10,
    border: '1px solid #7E622A',
  };
  return (
    <div style={box}>
      <div dir="rtl" lang="ar" style={{ fontFamily: '"Reem Kufi", "IBM Plex Sans Arabic", sans-serif', fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>
        {nameAr || nameEn}
      </div>
      {nameEn && nameEn !== nameAr ? (
        <div dir="ltr" lang="en" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 20, fontWeight: 600, letterSpacing: 0.5 }}>
          {nameEn}
        </div>
      ) : null}
      <div style={{ width: 120, borderTop: '1px solid #7E622A', margin: '4px 0' }} />
      <div dir="rtl" lang="ar" style={{ fontSize: 18, fontWeight: 600 }}>
        {ar('owner.qr.headline')}
      </div>
      <div dir="ltr" lang="en" style={{ fontSize: 15, fontWeight: 500 }}>
        {en('owner.qr.headline')}
      </div>
      <img src={src} alt="" width={236} height={236} style={{ width: 236, height: 236, imageRendering: 'pixelated', margin: '6px 0' }} />
      <div dir="rtl" lang="ar" style={{ fontSize: 13 }}>
        {ar('owner.qr.scan')}
      </div>
      <div dir="ltr" lang="en" style={{ fontSize: 12 }}>
        {en('owner.qr.scan')}
      </div>
      <div dir="ltr" style={{ fontSize: 10, color: '#444444', wordBreak: 'break-all', marginTop: 4 }}>
        {url}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 10, fontSize: 11, color: '#444444' }}>
        <div dir="rtl" lang="ar">{ar('owner.qr.privacy')}</div>
        <div dir="ltr" lang="en">{en('owner.qr.privacy')}</div>
      </div>
    </div>
  );
}

/**
 * Try-at-home link block (PRD 8.2): the link, Copy, Share and a QR code, plus
 * "Print QR" (an A6 card with both languages). Dimmed while Try at home is off.
 */
export default function ShopLink({ shopId, shop, enabled }) {
  const { t, lang } = useT();
  const { show } = useSnackbar();
  const url = shopTryUrl(shopId);
  const [qr, setQr] = useState({ url: null, src: null, error: false });
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let alive = true;
    qrDataUrl(url, { width: 480, color: SCREEN_COLORS }).then(
      (src) => alive && setQr({ url, src, error: false }),
      (err) => {
        console.warn('QR code could not be drawn', err);
        if (alive) setQr({ url, src: null, error: true });
      },
    );
    return () => {
      alive = false;
    };
  }, [url]);

  const copy = async () => {
    const ok = await copyText(url);
    show({ message: ok ? t('owner.set.link.copied') : t('owner.set.link.copyFailed') });
  };

  const share = async () => {
    const title = shop ? (lang === 'ar' ? shop.nameAr || shop.name : shop.name || shop.nameAr) : '';
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: title || t('app.name'), text: t('owner.set.link.shareText', { shop: title }), url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('share failed, copying instead', err);
      }
    }
    copy();
  };

  const print = async () => {
    setPrinting(true);
    try {
      const src = await qrDataUrl(url, { width: 720, color: PRINT_COLORS });
      await printElement(<QrPrintCard src={src} url={url} nameAr={shop?.nameAr || ''} nameEn={shop?.name || ''} />, {
        lang: 'ar',
        pageSize: 'a6',
        width: A6_WIDTH,
      });
    } catch (err) {
      console.error('QR print failed', err);
      show({ message: t('owner.set.link.printFailed') });
    } finally {
      setPrinting(false);
    }
  };

  const ready = qr.url === url && qr.src;

  return (
    <div className="flex flex-col gap-4">
      <div className={cx('flex flex-col gap-4 sm:flex-row sm:items-center', !enabled && 'opacity-50')}>
        <div className="mx-auto shrink-0 rounded-card border border-brass/70 bg-[#EDE8DF] p-2 sm:mx-0">
          {ready ? (
            <img src={qr.src} alt={t('owner.set.link.qrAlt')} width={160} height={160} className="block h-40 w-40 [image-rendering:pixelated]" />
          ) : qr.error && qr.url === url ? (
            <div className="flex h-40 w-40 items-center justify-center p-3 text-center text-sm text-[#5E5A53]">{t('owner.set.link.qrError')}</div>
          ) : (
            <Skeleton className="h-40 w-40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-2">{t('owner.set.link.label')}</div>
          <p dir="ltr" className="mt-1 break-all rounded-ctl border border-line bg-surface-2 px-3 py-2.5 text-start font-mono text-sm text-text">
            {url}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="copy" onClick={copy}>
          {t('common.copy')}
        </Button>
        <Button variant="secondary" icon="share" onClick={share}>
          {t('common.share')}
        </Button>
        <Button variant="secondary" icon="print" onClick={print} loading={printing} disabled={!ready}>
          {t('owner.set.link.print')}
        </Button>
      </div>
      {!enabled ? <p className="text-sm text-warn">{t('owner.set.link.offNote')}</p> : null}
    </div>
  );
}
