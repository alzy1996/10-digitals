// S12 Cut Card (PRD 3.1, 8.1 step 10, 11.1): the chosen look as a measured cut plan.
// The big "at a glance" numbers for the chair, the salon's own prices, then the two
// approvals Care & Us asks for (the customer, then the barber). After both: the full card
// (CutCardDocument, the same node the A6 PDF, the share image and window.print() use),
// Print/PDF, Share (Web Share with the PNG, or "Copy text + open WhatsApp") and Save to
// client (coarse labels only, only with his yes). Photos stay on this phone. Primary: Done.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import ScreenFrame from './ui/ScreenFrame.jsx';
import Button from './ui/Button.jsx';
import BottomAction from './ui/BottomAction.jsx';
import Icon from './ui/Icon.jsx';
import Skeleton from './ui/Skeleton.jsx';
import ChipRow from './ui/ChipRow.jsx';
import { useSnackbar } from './ui/snackbar.js';
import { useT } from './lib/i18n.js';
import { dayKey as muscatDayKey, formatMuscat } from './lib/time.js';
import { needsVisitReplan, replanNextVisit } from './lib/cutcard.js';
import { useSession } from './state/session.js';
import { useShop } from './state/shop.jsx';
import { addOnCount, approveByBarber, approveByCustomer, beardProducts, saveClientProfile } from './state/data.js';
import { useApp } from '../../hooks/useApp.jsx';
import { formatOmr, roundOmr } from './lib/format.js';
import { toCoarseProfile } from '../../ai/beard/index.js';
import CutCardDocument from './reports/CutCardDocument.jsx';
import { cutCardFilename, cutCardPdf, cutCardPng, printCutCard } from './reports/cutCardPdf.js';
import { copyAndOpenWhatsApp, cutCardShareText, shareFile } from './reports/share.js';
import { downloadBlob } from './lib/download.js';
import { formatDuration } from './reports/text.js';
import { useProfileConsent } from './capture/profileConsent.js';
import CutGlance from './approve/CutGlance.jsx';
import { cardTextBilingual } from './approve/cardText.js';
import { useClientRecord, useStyle } from './approve/hooks.js';

/** Icon above the label: three tools fit one row on a 360 px phone in both languages. */
const TOOL = 'min-h-[72px] flex-col gap-1 px-2 py-2 text-sm';

/** Visits already saved to the client's record on this phone (memory only, per consultation). */
const savedVisits = new Set();

function whenIdle(fn, ms) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: ms });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="text-lg">
      {children}
    </h2>
  );
}

export default function S12CutCard() {
  const { t, lang, pick } = useT();
  const navigate = useNavigate();
  const { show, confirmUndo } = useSnackbar();
  const session = useSession();
  const { shopId, shop, settings, me } = useShop();
  const app = useApp();
  const { mode, path, cutCard: storedCard, answers, setCutCard, approved, client, hydrated, effectiveProfile, profile, consultationId, approvals, setApprovals, priceItems, setPriceItems } =
    session;
  const priceList = useMemo(() => beardProducts(app.products), [app.products]);
  const pickedPrices = useMemo(() => priceList.filter((p) => (priceItems || []).includes(p.id)), [priceList, priceItems]);
  const both = Boolean(approvals && approvals.customerAt && approvals.stylistAt);
  // One rule for the next visit (chair:F18): a card built without his visit-frequency
  // answer (or restored from an older session) is planned again with it, here and in the
  // session, so the Done screen preselects exactly what this card says.
  const cutCard = useMemo(
    () => (storedCard && needsVisitReplan(storedCard, answers) ? replanNextVisit(storedCard, answers) : storedCard),
    [storedCard, answers],
  );
  useEffect(() => {
    if (cutCard && cutCard !== storedCard && typeof setCutCard === 'function') setCutCard(cutCard);
  }, [cutCard, storedCard, setCutCard]);
  const style = useStyle(shopId, cutCard ? cutCard.styleId : null);
  const record = useClientRecord(shopId, client);
  const [consent, setConsent] = useProfileConsent(session);
  const [busy, setBusy] = useState(null);
  const [fallback, setFallback] = useState(false);
  const realClient = Boolean(mode === 'chair' && client && client.id && !client.walkIn);
  const saveKey = realClient && cutCard ? `${shopId}|${client.id}|${consultationId || cutCard.createdAt}` : null;
  const [saveState, setSaveState] = useState(() => (saveKey && savedVisits.has(saveKey) ? 'saved' : 'idle'));
  const mounted = useRef(true);
  const pngs = useRef({ data: null, byLang: new Map() });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const data = useMemo(() => {
    if (!cutCard) return null;
    return {
      card: cutCard,
      params: approved ? approved.params : null,
      style,
      shop: { name: shop ? shop.name : '', nameAr: shop ? shop.nameAr : '', logoUrl: shop && shop.logoUrl ? shop.logoUrl : null },
      barber: { name: me && me.name ? me.name : '' },
      client: client ? { displayName: client.displayName, walkIn: client.walkIn } : null,
      approved: approved && both ? { at: approvals.stylistAt || approved.at, decisionSeconds: approved.decisionSeconds } : null,
      at: approved ? approved.at : cutCard.createdAt,
      guardChart: settings ? settings.guardChart : null,
      prices: pickedPrices.map((p) => ({ name: p.name || '', nameAr: p.nameAr || '', priceOmr: Number(p.priceOmr) || 0 })),
    };
  }, [cutCard, approved, both, approvals, style, shop, me, client, settings, pickedPrices]);

  /** The share PNG for a language, made once per card and language. */
  const pngFor = useCallback(
    (L) => {
      const cache = pngs.current;
      if (cache.data !== data) {
        cache.data = data;
        cache.byLang = new Map();
      }
      if (!cache.byLang.has(L)) {
        const job = cutCardPng(data, L);
        cache.byLang.set(L, job);
        job.catch(() => {
          if (cache.byLang.get(L) === job) cache.byLang.delete(L);
        });
      }
      return cache.byLang.get(L);
    },
    [data],
  );

  // Prepare the share image while the barber reads the card, so Share opens at once
  // (iOS only allows the share sheet right after the tap).
  useEffect(() => {
    if (!data) return undefined;
    return whenIdle(() => {
      pngFor(lang).catch((err) => console.warn('Cut Card image could not be prepared', err));
    }, 1500);
  }, [data, lang, pngFor]);

  if (!hydrated) {
    return (
      <ScreenFrame title={t('beard.report.cut.title')} back={path('studio')}>
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t('beard.common.loading')}</span>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton rounded="card" className="h-56 w-full" />
          <Skeleton rounded="card" className="h-96 w-full" />
        </div>
      </ScreenFrame>
    );
  }
  if (!cutCard || !data) return <Navigate to={path('studio')} replace />;

  const at = approved && approved.at ? approved.at : cutCard.createdAt;
  const day = muscatDayKey(at);
  const styleName = style ? pick(style.name) : '';
  const phone = record && record.phone ? record.phone : null;
  const color = cutCard.color || {};
  const questions = Array.isArray(color.questions) ? color.questions : [];
  const asks = questions.filter((q) => q.level === 'ask').length;

  const onPdf = async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      const blob = await cutCardPdf(data, lang);
      show({ message: downloadBlob(blob, cutCardFilename(day, 'pdf')) ? t('beard.approve.card.pdfSaved') : t('beard.approve.card.pdfFailed') });
    } catch (err) {
      console.error('Cut Card PDF failed', err);
      show({ message: t('beard.approve.card.pdfFailed') });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const onPrint = () => {
    printCutCard(data, lang)
      .then((ok) => {
        if (ok === false) show({ message: t('beard.approve.card.printFailed') });
      })
      .catch((err) => {
        console.error('Cut Card print failed', err);
        show({ message: t('beard.approve.card.printFailed') });
      });
  };

  const onShare = async () => {
    if (busy) return;
    setBusy('share');
    try {
      const blob = await pngFor(lang);
      const res = await shareFile(blob, cutCardFilename(day, 'png'), cutCardShareText({ lang, shop, style, card: cutCard }));
      if (res === 'shared') show({ message: t('beard.approve.card.shared') });
      else if (res === 'downloaded') {
        if (mounted.current) setFallback(true);
        show({ message: t('beard.report.share.downloaded') });
      } else if (res === 'failed') {
        if (mounted.current) setFallback(true);
        show({ message: t('beard.approve.card.shareFailed') });
      }
    } catch (err) {
      console.error('Cut Card share failed', err);
      if (mounted.current) setFallback(true);
      show({ message: t('beard.approve.card.shareFailed') });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const onWhatsApp = () => {
    copyAndOpenWhatsApp(cardTextBilingual({ card: cutCard, shop, style }), phone).then(({ copied }) => {
      show({ message: copied ? t('beard.approve.card.copied') : t('beard.approve.card.notCopied') });
    });
  };

  const onSave = () => {
    if (!realClient || saveState !== 'idle') return;
    const before = consent;
    if (consent !== true) setConsent(true);
    const name = client.displayName || t('beard.common.walkIn');
    const clientId = client.id;
    const coarse = toCoarseProfile(effectiveProfile || profile);
    const key = saveKey;
    setSaveState('pending');
    confirmUndo({
      message: t('beard.approve.card.saving', { name }),
      onUndo: () => {
        if (before !== true) setConsent(before);
        if (mounted.current) setSaveState('idle');
      },
      onCommit: () => {
        try {
          saveClientProfile(shopId, clientId, coarse, consultationId);
          savedVisits.add(key);
          if (mounted.current) setSaveState('saved');
          show({ message: t('beard.approve.card.saved', { name }) });
        } catch (err) {
          console.error('Save to client failed', err);
          if (mounted.current) setSaveState('idle');
          show({ message: t('beard.approve.card.saveFailed') });
        }
      },
    });
  };

  const decided = approved ? formatDuration(approved.decisionSeconds) : '';
  const approvedTime = approved && approved.at ? formatMuscat(approved.at, lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';

  const outputs = (
    <section aria-labelledby="outputs-title" className="flex flex-col gap-3">
      <SectionTitle id="outputs-title">{t('beard.approve.card.outputs')}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" icon="download" full loading={busy === 'pdf'} disabled={Boolean(busy) && busy !== 'pdf'} onClick={onPdf} className={TOOL}>
          {t('beard.approve.card.pdf')}
        </Button>
        <Button variant="secondary" icon="print" full onClick={onPrint} className={TOOL}>
          {t('beard.approve.card.print')}
        </Button>
        <Button variant="secondary" icon="share" full loading={busy === 'share'} disabled={Boolean(busy) && busy !== 'share'} onClick={onShare} className={TOOL}>
          {t('beard.approve.card.share')}
        </Button>
      </div>
      {busy ? (
        <p role="status" className="text-sm text-ink2">
          {t('beard.approve.card.making')}
        </p>
      ) : null}
      {fallback ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-ink2">{t('beard.approve.card.fallback')}</p>
          <Button variant="secondary" icon="whatsapp" full onClick={onWhatsApp}>
            {t('beard.approve.card.whatsapp')}
          </Button>
        </div>
      ) : null}
    </section>
  );

  /* ---- prices and the two approvals (the customer, then the barber) */
  const total = roundOmr(pickedPrices.reduce((sum, p) => sum + (Number(p.priceOmr) || 0), 0));
  const togglePrice = (ids) => setPriceItems(Array.isArray(ids) ? ids : []);

  const customerAgrees = () => {
    if (!consultationId || (approvals && approvals.customerAt)) return;
    try {
      approveByCustomer(shopId, consultationId);
    } catch (err) {
      console.error('Customer approval could not be written', err);
    }
    setApprovals({ customerAt: new Date() });
  };

  const barberAgrees = () => {
    if (!consultationId || !(approvals && approvals.customerAt) || approvals.stylistAt) return;
    try {
      approveByBarber(shopId, consultationId, {
        params: approved ? approved.params : null,
        cutCard,
        decisionSeconds: approved ? approved.decisionSeconds : 0,
        addOns: addOnCount(priceItems, priceList),
      });
    } catch (err) {
      console.error('Barber approval could not be written', err);
    }
    setApprovals({ stylistAt: new Date() });
  };

  const pricesBlock = (
    <section aria-labelledby="prices-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <SectionTitle id="prices-title">{t('beard.approve.card.prices')}</SectionTitle>
      {priceList.length ? (
        <>
          {both ? (
            <ul className="flex flex-col divide-y divide-line">
              {pickedPrices.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{pick(p, 'name', 'nameAr')}</span>
                  <span className="num shrink-0">{formatOmr(p.priceOmr, lang)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ChipRow
              multi
              label={t('beard.approve.card.pricesPick')}
              options={priceList.map((p) => ({ value: p.id, label: `${pick(p, 'name', 'nameAr')} · ${formatOmr(p.priceOmr, lang)}` }))}
              value={priceItems || []}
              onChange={togglePrice}
            />
          )}
          <p className="num flex items-center justify-between border-t border-line pt-2 font-semibold">
            <span>{t('beard.approve.card.total')}</span>
            <span>{formatOmr(total, lang)}</span>
          </p>
        </>
      ) : (
        <p className="text-sm text-ink2">{t('beard.approve.card.noPrices')}</p>
      )}
    </section>
  );

  const approvalsBlock = (
    <section aria-labelledby="agree-title" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <SectionTitle id="agree-title">{t('beard.approve.card.agreeTitle')}</SectionTitle>
      {[
        { key: 'customerAt', label: t('beard.approve.card.customerAgreed') },
        { key: 'stylistAt', label: t('beard.approve.card.barberAgreed') },
      ].map((row) => {
        const at = approvals && approvals[row.key];
        return (
          <p key={row.key} className={`flex items-center gap-2 text-sm ${at ? 'text-ok' : 'text-ink2'}`}>
            <Icon name={at ? 'check' : 'clock'} size={18} />
            <span className="min-w-0 flex-1">{row.label}</span>
            {at ? <span className="num">{formatMuscat(at, lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span> : null}
          </p>
        );
      })}
      {!consultationId ? <p className="text-sm text-warn">{t('beard.approve.card.noConsultation')}</p> : null}
    </section>
  );

  let primary;
  if (!approvals || !approvals.customerAt) {
    primary = (
      <Button variant="primary" icon="check" disabled={!consultationId} onClick={customerAgrees}>
        {t('beard.approve.card.customerAgrees')}
      </Button>
    );
  } else if (!approvals.stylistAt) {
    primary = (
      <Button variant="primary" icon="scissors" onClick={barberAgrees}>
        {t('beard.approve.card.barberAgrees')}
      </Button>
    );
  } else {
    primary = (
      <Button variant="primary" iconEnd="arrow-right" onClick={() => navigate(path('done'))}>
        {t('beard.approve.card.done')}
      </Button>
    );
  }

  const clientBlock = realClient ? (
    <section aria-labelledby="client-title" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <SectionTitle id="client-title">{t('beard.approve.card.client')}</SectionTitle>
      <p className="flex items-center gap-2 text-ink">
        <Icon name="user" size={20} className="text-ink2" />
        <bdi className="min-w-0 truncate">{client.displayName}</bdi>
      </p>
      {saveState === 'saved' ? (
        <p role="status" className="flex min-h-btn2 items-center gap-2 font-medium text-ok">
          <Icon name="check" size={20} />
          {t('beard.approve.card.savedShort')}
        </p>
      ) : (
        <>
          {consent !== true ? <p className="text-sm text-warn">{t('beard.approve.card.saveAsk')}</p> : null}
          <Button variant="secondary" icon="user" full loading={saveState === 'pending'} onClick={onSave}>
            {consent === true ? t('beard.approve.card.save') : t('beard.approve.card.saveAgree')}
          </Button>
        </>
      )}
      <p className="text-sm text-ink2">{t('beard.approve.card.saveHint')}</p>
    </section>
  ) : null;

  return (
    <ScreenFrame
      title={t('beard.report.cut.title')}
      back={both ? null : path('studio')}
      wide
      footer={
        <BottomAction className="mx-auto w-full max-w-[640px]">{primary}</BottomAction>
      }
    >
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-6">
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            {styleName ? <p className="font-display text-2xl leading-tight text-ink">{styleName}</p> : null}
            {approved && both ? (
              <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink2">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="check" size={16} className="text-ok" />
                  {t('beard.approve.card.approvedAt', { time: approvedTime })}
                </span>
                {decided ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="clock" size={16} />
                    {t('beard.session.decision', { duration: decided })}
                  </span>
                ) : null}
              </p>
            ) : null}
          </header>

          {color.blocked || asks ? (
            <p
              role="alert"
              className={
                color.blocked
                  ? 'flex items-start gap-2 rounded-card border border-risk bg-surface2 p-3 font-medium text-risk'
                  : 'flex items-start gap-2 rounded-card border border-warn bg-surface2 p-3 font-medium text-warn'
              }
            >
              <Icon name="warning" size={20} className="mt-0.5" />
              <span>{color.blocked ? t('beard.report.cut.blocked') : `${t('beard.report.cut.safety')}: ${t('beard.report.safety.ask')}`}</span>
            </p>
          ) : null}

          <CutGlance card={cutCard} />
          {pricesBlock}
          {approvalsBlock}
          {both ? outputs : null}
          {both ? clientBlock : null}
        </div>

        <section aria-label={t('beard.report.cut.title')} className="mt-6 md:mt-0">
          <CutCardDocument data={data} lang={lang} variant="screen" />
        </section>
      </div>
    </ScreenFrame>
  );
}
