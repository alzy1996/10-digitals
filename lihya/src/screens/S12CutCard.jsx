// S12 Cut Card (PRD 3.1, 8.1 step 10, 11.1): the approved look as a measured cut plan.
// The big "at a glance" numbers for the chair, then the full card (CutCardDocument, the
// same node the A6 PDF, the share image and window.print() use). Print/PDF, Share
// (Web Share with the PNG, or download + "Copy text + open WhatsApp"), Save to client
// (coarse labels and today's lengths, only with his yes) and keeping the before/after
// photos on this phone (only with his yes). Primary: Done.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Toggle from '../components/Toggle.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useT } from '../lib/i18n/useT.js';
import { dayKey as muscatDayKey, formatMuscat } from '../lib/time.js';
import { cutCardZonesMm, needsVisitReplan, replanNextVisit } from '../lib/cutcard.js';
import { useSession } from '../hooks/useSession.js';
import { useShop } from '../state/ShopContext.jsx';
import { recordVisitLengths, saveClientProfile } from '../services/clients.js';
import { toCoarseProfile } from '../ai/index.js';
import CutCardDocument from '../reports/CutCardDocument.jsx';
import { cutCardFilename, cutCardPdf, cutCardPng, printCutCard } from '../reports/cutCardPdf.js';
import { copyAndOpenWhatsApp, cutCardShareText, shareFile } from '../reports/share.js';
import { downloadBlob } from '../reports/csv.js';
import { formatDuration } from '../reports/text.js';
import { useProfileConsent } from './capture/profileConsent.js';
import CutGlance from './approve/CutGlance.jsx';
import { cardTextBilingual } from './approve/cardText.js';
import { useClientRecord, useStyle } from './approve/hooks.js';

const ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);

/** Icon above the label: three tools fit one row on a 360 px phone in both languages. */
const TOOL = 'min-h-[72px] flex-col gap-1 px-2 py-2 text-sm';

/** Visits already saved to the client's record on this phone (memory only, per consultation). */
const savedVisits = new Set();

/** Lengths measured at the start of this visit (the profile, before any cut). */
function measuredLengths(profile) {
  const zones = profile && profile.beard && profile.beard.zones;
  if (!zones) return null;
  const out = {};
  for (const z of ZONES) {
    const v = zones[z] ? Number(zones[z].lengthMm) : NaN;
    if (Number.isFinite(v) && v >= 0) out[z] = Math.round(v * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}

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
  const { mode, path, cutCard: storedCard, answers, setCutCard, approved, client, hydrated, effectiveProfile, profile, shots, keepPhotos, setKeepPhotos, consultationId } =
    session;
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
      approved: approved ? { at: approved.at, decisionSeconds: approved.decisionSeconds } : null,
      at: approved ? approved.at : cutCard.createdAt,
      guardChart: settings ? settings.guardChart : null,
    };
  }, [cutCard, approved, style, shop, me, client, settings]);

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
      <ScreenFrame title={t('report.cut.title')} back={path('studio')}>
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t('common.loading')}</span>
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
  const hasPhoto = Boolean(shots && shots.front && shots.front.canvas && shots.front.canvas.width);
  const phone = record && record.phone ? record.phone : null;
  const color = cutCard.color || {};
  const questions = Array.isArray(color.questions) ? color.questions : [];
  const asks = questions.filter((q) => q.level === 'ask').length;

  const onPdf = async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      const blob = await cutCardPdf(data, lang);
      show({ message: downloadBlob(blob, cutCardFilename(day, 'pdf')) ? t('approve.card.pdfSaved') : t('approve.card.pdfFailed') });
    } catch (err) {
      console.error('Cut Card PDF failed', err);
      show({ message: t('approve.card.pdfFailed') });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const onPrint = () => {
    printCutCard(data, lang)
      .then((ok) => {
        if (ok === false) show({ message: t('approve.card.printFailed') });
      })
      .catch((err) => {
        console.error('Cut Card print failed', err);
        show({ message: t('approve.card.printFailed') });
      });
  };

  const onShare = async () => {
    if (busy) return;
    setBusy('share');
    try {
      const blob = await pngFor(lang);
      const res = await shareFile(blob, cutCardFilename(day, 'png'), cutCardShareText({ lang, shop, style, card: cutCard }));
      if (res === 'shared') show({ message: t('approve.card.shared') });
      else if (res === 'downloaded') {
        if (mounted.current) setFallback(true);
        show({ message: t('report.share.downloaded') });
      } else if (res === 'failed') {
        if (mounted.current) setFallback(true);
        show({ message: t('approve.card.shareFailed') });
      }
    } catch (err) {
      console.error('Cut Card share failed', err);
      if (mounted.current) setFallback(true);
      show({ message: t('approve.card.shareFailed') });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const onWhatsApp = () => {
    copyAndOpenWhatsApp(cardTextBilingual({ card: cutCard, shop, style }), phone).then(({ copied }) => {
      show({ message: copied ? t('approve.card.copied') : t('approve.card.notCopied') });
    });
  };

  const onSave = () => {
    if (!realClient || saveState !== 'idle') return;
    const before = consent;
    if (consent !== true) setConsent(true);
    const name = client.displayName || t('common.walkIn');
    const clientId = client.id;
    const coarse = toCoarseProfile(effectiveProfile || profile);
    const zonesMm = cutCardZonesMm(cutCard);
    const measuredMm = measuredLengths(profile);
    const visitAt = approved && approved.at ? approved.at : new Date();
    const key = saveKey;
    setSaveState('pending');
    confirmUndo({
      message: t('approve.card.saving', { name }),
      onUndo: () => {
        if (before !== true) setConsent(before);
        if (mounted.current) setSaveState('idle');
      },
      onCommit: () => {
        try {
          saveClientProfile(shopId, clientId, coarse);
          recordVisitLengths(shopId, clientId, { zonesMm, at: visitAt, measuredMm });
          savedVisits.add(key);
          if (mounted.current) setSaveState('saved');
          show({ message: t('approve.card.saved', { name }) });
        } catch (err) {
          console.error('Save to client failed', err);
          if (mounted.current) setSaveState('idle');
          show({ message: t('approve.card.saveFailed') });
        }
      },
    });
  };

  const decided = approved ? formatDuration(approved.decisionSeconds) : '';
  const approvedTime = approved && approved.at ? formatMuscat(approved.at, lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';

  const outputs = (
    <section aria-labelledby="outputs-title" className="flex flex-col gap-3">
      <SectionTitle id="outputs-title">{t('approve.card.outputs')}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" icon="download" full loading={busy === 'pdf'} disabled={Boolean(busy) && busy !== 'pdf'} onClick={onPdf} className={TOOL}>
          {t('approve.card.pdf')}
        </Button>
        <Button variant="secondary" icon="print" full onClick={onPrint} className={TOOL}>
          {t('approve.card.print')}
        </Button>
        <Button variant="secondary" icon="share" full loading={busy === 'share'} disabled={Boolean(busy) && busy !== 'share'} onClick={onShare} className={TOOL}>
          {t('approve.card.share')}
        </Button>
      </div>
      {busy ? (
        <p role="status" className="text-sm text-text-2">
          {t('approve.card.making')}
        </p>
      ) : null}
      {fallback ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-text-2">{t('approve.card.fallback')}</p>
          <Button variant="secondary" icon="whatsapp" full onClick={onWhatsApp}>
            {t('approve.card.whatsapp')}
          </Button>
        </div>
      ) : null}
    </section>
  );

  const clientBlock = realClient ? (
    <section aria-labelledby="client-title" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <SectionTitle id="client-title">{t('approve.card.client')}</SectionTitle>
      <p className="flex items-center gap-2 text-text">
        <Icon name="user" size={20} className="text-text-2" />
        <bdi className="min-w-0 truncate">{client.displayName}</bdi>
      </p>
      {saveState === 'saved' ? (
        <p role="status" className="flex min-h-btn-secondary items-center gap-2 font-medium text-keep">
          <Icon name="check" size={20} />
          {t('approve.card.savedShort')}
        </p>
      ) : (
        <>
          {consent !== true ? <p className="text-sm text-warn">{t('approve.card.saveAsk')}</p> : null}
          <Button variant="secondary" icon="user" full loading={saveState === 'pending'} onClick={onSave}>
            {consent === true ? t('approve.card.save') : t('approve.card.saveAgree')}
          </Button>
        </>
      )}
      <p className="text-sm text-text-2">{t('approve.card.saveHint')}</p>
      <hr className="my-1 border-line" />
      <Toggle
        checked={Boolean(keepPhotos) && hasPhoto}
        onChange={(v) => setKeepPhotos(v)}
        disabled={!hasPhoto}
        label={t('session.keepPhotos')}
        description={hasPhoto ? `${t('approve.card.keepAsk')} ${t('session.keepPhotosHint')}` : t('approve.card.keepNoPhoto')}
      />
    </section>
  ) : null;

  return (
    <ScreenFrame
      title={t('report.cut.title')}
      back={path('studio')}
      wide
      footer={
        <BottomAction className="mx-auto w-full max-w-[640px]">
          <Button variant="primary" icon="check" onClick={() => navigate(path('done'))}>
            {t('approve.card.done')}
          </Button>
        </BottomAction>
      }
    >
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-6">
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            {styleName ? <p className="display text-2xl leading-tight text-text">{styleName}</p> : null}
            {approved ? (
              <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-2">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="check" size={16} className="text-keep" />
                  {t('approve.card.approvedAt', { time: approvedTime })}
                </span>
                {decided ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="clock" size={16} />
                    {t('session.decision', { duration: decided })}
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
                  ? 'flex items-start gap-2 rounded-card border border-cut/60 bg-cut/10 p-3 font-medium text-cut'
                  : 'flex items-start gap-2 rounded-card border border-warn/50 bg-warn/10 p-3 font-medium text-warn'
              }
            >
              <Icon name="warning" size={20} className="mt-0.5" />
              <span>{color.blocked ? t('report.cut.blocked') : `${t('report.cut.safety')}: ${t('report.safety.ask')}`}</span>
            </p>
          ) : null}

          <CutGlance card={cutCard} />
          {outputs}
          {clientBlock}
        </div>

        <section aria-label={t('report.cut.title')} className="mt-6 md:mt-0">
          <CutCardDocument data={data} lang={lang} variant="screen" />
        </section>
      </div>
    </ScreenFrame>
  );
}
