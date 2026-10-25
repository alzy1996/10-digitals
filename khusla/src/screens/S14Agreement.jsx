import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import Sheet from '../components/Sheet.jsx';
import LevelLadder from '../components/LevelLadder.jsx';
import { useT, translate } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useStageData } from '../hooks/useStage.js';
import { useConsultation } from '../hooks/useConsultation.js';
import { renderThumb } from '../hooks/useThumbs.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { approveCustomer, approveStylist } from '../services/consultations.js';
import { countAddOns } from '../services/products.js';
import { lookDrawParams, dryLength, shrinkageFor, cutTargetCm, labToHex } from '../ai/index.js';
import { aftercareKeys } from '../reports/aftercare.js';
import { agreementPdf, agreementPng, downloadBlob, shareFile, whatsappLink } from '../reports/agreementCardPdf.js';
import aftercareText from '../data/aftercare.json';
import { formatCm, formatOmr, roundHalf } from '../lib/format.js';
import { formatDateTime, formatTime } from '../lib/time.js';
import { DEFAULTS } from '../config/app.js';

function Both({ obj, className = '' }) {
  if (!obj) return null;
  return (
    <span className={className}>
      <span lang="ar" dir="rtl" className="block">{obj.ar}</span>
      <span lang="en" dir="ltr" className="block text-[13px] text-ink2">{obj.en}</span>
    </span>
  );
}

function Tick({ on, label }) {
  return (
    <span className="inline-flex items-center gap-2 text-[14px]">
      <span className="grid h-5 w-5 place-items-center rounded-[4px] border border-ink" aria-hidden>
        {on ? <span className="block h-2.5 w-2.5 rounded-[2px] bg-plum" /> : null}
      </span>
      {label}
    </span>
  );
}

function OutlineTape({ cutNewY, withShoulder = true }) {
  // a simple head-and-shoulders outline with the clay tape at the new length (no photo)
  return (
    <svg viewBox="0 0 200 240" className="h-[180px] w-auto" aria-hidden>
      <g fill="none" stroke="#1D1A1C" strokeWidth="1.2" opacity="0.75">
        <ellipse cx="100" cy="78" rx="34" ry="44" />
        <path d="M66 70 C 60 120, 58 170, 62 200 M134 70 C 140 120, 142 170, 138 200" strokeDasharray="3 3" />
        {withShoulder ? <path d="M30 236 C 40 176, 70 160, 100 160 C 130 160, 160 176, 170 236" /> : null}
      </g>
      <rect x="40" y={cutNewY - 5} width="120" height="10" rx="2" fill="#FBF8F4" stroke="#B76E62" />
      {Array.from({ length: 13 }).map((_, i) => (
        <line key={i} x1={40 + i * 10} x2={40 + i * 10} y1={cutNewY - 5} y2={cutNewY - (i % 5 === 0 ? 0 : 2)} stroke="#B76E62" />
      ))}
    </svg>
  );
}

export default function S14Agreement() {
  const { t, lang, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const catalog = useCatalog();
  const data = useStageData();
  const consultation = useConsultation();
  const cardRef = useRef(null);
  const look = session.look;
  const profile = session.profile;
  const [items, setItems] = useState([]);
  const [withPhoto, setWithPhoto] = useState(false);
  const [sessionNumber, setSessionNumber] = useState(1);
  const [bigOk, setBigOk] = useState(Boolean(session.bigChangeOk));
  const [approvals, setApprovals] = useState({ customerAt: null, stylistAt: null });
  const [busy, setBusy] = useState(null);

  const cut = catalog.cuts.find((c) => c.id === look.cutId) || null;
  const fringe = catalog.fringes.find((f) => f.id === look.fringeId && f.id !== 'none') || null;
  const style = catalog.styles.find((s) => s.id === look.styleId) || null;
  const shade = catalog.shades.find((s) => s.id === look.shadeId) || null;
  const technique = catalog.techniques.find((x) => x.id === look.technique) || null;
  const scanned = shade?.swatchRef ? app.swatchesById[shade.swatchRef] : null;
  const currentCm = profile?.hair.lengthCm ?? null;
  const wetCm = look.lengthCm ?? (cut && currentCm ? Math.min(currentCm, cutTargetCm(cut, currentCm)) : currentCm);
  const shrinkPct = session.shrinkPct ?? shrinkageFor(profile?.hair.texture, session.client?.shrinkagePct);
  const dryCm = wetCm ? dryLength(wetCm, shrinkPct) : null;

  const params = useMemo(() => {
    if (!data || !shade) return null;
    return lookDrawParams({ look, catalog, profile, renderData: data.renderData, aux: data.aux, swatchesById: app.swatchesById, scannedLevels: app.scannedLevels, ctx: { metallicTest: session.metallicTest, patchRequired: session.patchRequired } });
  }, [data, shade, look, catalog, profile, app.swatchesById, app.scannedLevels, session.metallicTest, session.patchRequired]);
  const plan = params?.plan || null;
  const photo = useMemo(() => (withPhoto && data ? renderThumb(data, params || { tech: 0 }, 360) : null), [withPhoto, data, params]);

  const priceList = (app.products || []).filter((p) => p.active);
  const selected = priceList.filter((p) => items.includes(p.id));
  const total = selected.reduce((s, p) => s + Number(p.priceOmr || 0), 0);
  const careKeys = aftercareKeys({ technique, shade, process: plan?.process, texture: profile?.hair.texture, hasCut: Boolean(cut) });
  const tests = new Set(plan?.tests || (session.patchRequired ? ['patch'] : []));
  if (session.patchRequired) tests.add('patch');
  const big = (currentCm && wetCm && currentCm - wetCm > DEFAULTS.bigChangeCm) || (plan && plan.liftNeeded > DEFAULTS.bigChangeLevels);
  const now = new Date();
  const stylistName = app.me?.name || '';
  const clientName = session.client?.displayName || t('agreement.walkIn');
  const ladderSwatches = app.scannedLevels ? Object.fromEntries(Object.entries(app.scannedLevels).map(([k, v]) => [k, labToHex(v)])) : null;

  if (!profile) return null;
  if (plan?.blocked) {
    return (
      <main className="screen mx-auto max-w-[640px]">
        <TopBar title={t('agreement.title')} />
        <div className="card border-risk p-5">
          <div className="font-semibold text-risk">{t('agreement.blocked')}</div>
          <p className="mt-1 text-sm text-ink2">{t(`block.${plan.blockReason}`)}</p>
        </div>
        <div className="mt-5">
          <Button onClick={() => navigate('/color')}>{t('color.title')}</Button>
        </div>
      </main>
    );
  }

  const agreementData = () => ({
    currentLengthCm: currentCm ?? null,
    lengthWetCm: wetCm ?? null,
    lengthDryCm: dryCm ?? null,
    shrinkagePct: shrinkPct,
    targetLevel: shade ? plan.targetLevel : null,
    targetTone: shade ? shade.tone : null,
    process: shade ? plan.process : 'deposit-only',
    sessionsTotal: shade ? plan.sessionsTotal : 0,
    sessionNumber: shade ? sessionNumber : 0,
    todayLevel: shade ? (sessionNumber === 1 ? plan.session1Level : plan.targetLevel) : null,
    tests: [...tests],
    fillerLikely: Boolean(plan?.fillerLikely),
    priceItems: items,
    addOnCount: countAddOns(items, priceList),
    aftercareKeys: careKeys,
  });

  const customerAgrees = () => {
    const id = consultation.ensure();
    if (id) approveCustomer(app.salonId, id);
    setApprovals((a) => ({ ...a, customerAt: new Date() }));
  };

  const stylistAgrees = () => {
    const id = consultation.ensure();
    const decisionSeconds = (Date.now() - (session.startedAt || Date.now())) / 1000;
    if (id) {
      approveStylist(app.salonId, { id, demo: false }, {
        decisionSeconds,
        agreement: agreementData(),
        params: { ...look, swatchId: shade?.swatchRef || null },
        lookKey: `${look.cutId || 'keep'}~${look.shadeId || 'natural'}`,
        shadeKey: look.shadeId || 'natural',
        addOns: countAddOns(items, priceList),
      });
    }
    setApprovals((a) => ({ ...a, stylistAt: new Date() }));
    session.patch({ agreementDone: true, agreement: agreementData(), nextItems: items });
  };

  const summaryText = () =>
    [
      `${t('agreement.title')} — ${name({ en: app.salon?.name, ar: app.salon?.nameAr })}`,
      cut ? `${t('agreement.cut')}: ${name(cut.name)}${fringe ? ` + ${name(fringe.name)}` : ''}` : null,
      wetCm ? `${t('agreement.length')}: ${formatCm(wetCm, lang)} (${t('cut.dry')} ≈ ${formatCm(dryCm, lang)})` : null,
      shade ? `${t('agreement.color')}: ${name(shade.name)}${scanned ? ` (${scanned.code})` : ''} · ${name(technique?.name)}` : null,
      plan ? `${t('lift.sessions')}: ${plan.sessionsTotal}` : null,
      selected.length ? `${t('agreement.price')}: ${formatOmr(total, lang)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const { blob, filename } = await agreementPdf(cardRef.current, `agreement-${new Date().toISOString().slice(0, 10)}.pdf`);
      if (!(await shareFile(blob, filename, summaryText()))) downloadBlob(blob, filename);
    } finally {
      setBusy(null);
    }
  };
  const exportPng = async () => {
    setBusy('png');
    try {
      const blob = await agreementPng(cardRef.current);
      if (!(await shareFile(blob, 'agreement-card.png', summaryText()))) downloadBlob(blob, 'agreement-card.png');
    } finally {
      setBusy(null);
    }
  };
  const copyWhatsapp = async () => {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      snack.show({ message: t('common.copied') });
    } catch {
      // clipboard blocked: the WhatsApp link still carries the text
    }
    window.open(whatsappLink(session.client?.phone || '', text), '_blank', 'noopener');
  };

  const tapeY = (() => {
    if (!wetCm || !currentCm) return 190;
    const k = Math.max(0.15, Math.min(1, wetCm / Math.max(currentCm, 1)));
    return 100 + k * 120;
  })();

  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('agreement.title')} step={t('flow.step', { n: 7, total: 7 })} />

      <article ref={cardRef} className="mx-auto max-w-[560px] rounded-card border border-line bg-[#FBF8F4] p-6 text-[#1D1A1C]" style={{ fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif' }}>
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[13px] uppercase tracking-[0.12em] text-[#6B6166]">{app.salon?.name}</div>
            <div className="text-[15px] text-[#6B6166]" dir="rtl">{app.salon?.nameAr}</div>
          </div>
          <div className="text-end text-[13px] text-[#6B6166]">
            <div className="num">{formatDateTime(now, lang)}</div>
            <div>{t('agreement.stylist')}: {stylistName}</div>
            <div>{t('agreement.client')}: {clientName}</div>
          </div>
        </header>
        <h2 className="mt-4 text-[32px] leading-none" style={{ fontFamily: 'Amiri, Fraunces, serif' }}>
          <span dir="rtl" lang="ar">بطاقة الاتفاق</span>
          <span className="block text-[22px]" style={{ fontFamily: 'Fraunces, serif' }} lang="en">Agreement Card</span>
        </h2>
        <hr className="rule-clay" />

        <section className="grid grid-cols-[1fr_auto] items-center gap-4">
          <div>
            <div className="eyebrow">{translate('ar', 'agreement.length')} · {translate('en', 'agreement.length')}</div>
            <div className="num mt-1 text-[22px] font-semibold">
              {currentCm ? `≈ ${formatCm(currentCm, lang)} → ` : ''}
              {wetCm ? formatCm(wetCm, lang) : '—'}
            </div>
            <div className="num text-[14px] text-[#6B6166]">
              {t('agreement.wetDry', { wet: formatCm(wetCm, lang), dry: formatCm(dryCm, lang), pct: shrinkPct })}
            </div>
            {currentCm && wetCm ? <div className="num mt-1 text-[14px]">{t('agreement.delta', { cm: formatCm(roundHalf(currentCm - wetCm), lang) })}</div> : null}
          </div>
          {photo ? <img src={photo} alt="" className="h-[180px] w-auto rounded-[12px]" /> : <OutlineTape cutNewY={tapeY} />}
        </section>
        <hr className="rule-clay" />

        <section className="grid grid-cols-2 gap-4">
          <div>
            <div className="eyebrow">{t('agreement.cut')}</div>
            {cut ? <Both obj={cut.name} className="mt-1 font-semibold" /> : <div className="mt-1 text-[14px] text-[#6B6166]">{t('agreement.noCut')}</div>}
            {fringe ? <Both obj={fringe.name} className="mt-2 text-[14px]" /> : null}
            {style ? <Both obj={style.name} className="mt-2 text-[14px]" /> : null}
          </div>
          <div>
            <div className="eyebrow">{t('agreement.color')}</div>
            {shade ? (
              <>
                <Both obj={shade.name} className="mt-1 font-semibold" />
                {scanned ? <div className="num text-[13px]">{t('agreement.salonCode', { code: scanned.code })}</div> : null}
                <div className="mt-1 text-[14px]">{name(technique?.name)} · {t(`finish.${look.finish || 'satin'}`)}</div>
              </>
            ) : (
              <div className="mt-1 text-[14px] text-[#6B6166]">{t('agreement.noColor')}</div>
            )}
          </div>
        </section>

        {shade && plan ? (
          <>
            <hr className="rule-clay" />
            <section className="grid grid-cols-[auto_1fr] gap-5">
              <LevelLadder now={{ root: profile.hair.rootLevel, ends: profile.hair.endsLevel }} session1={plan.sessionsTotal > 1 ? plan.session1Level : null} final={plan.targetLevel} swatches={ladderSwatches} height={210} width={34} />
              <div className="space-y-2 text-[14px]">
                <div>
                  <span className="label">{t('lift.process')}: </span>
                  <strong>{t(`process.${plan.process}`)}</strong>
                </div>
                <div className="num">
                  <span className="label">{t('agreement.sessions')}: </span>
                  <strong>{t('agreement.sessionOf', { n: sessionNumber, total: plan.sessionsTotal })}</strong>
                </div>
                <div className="num">
                  <span className="label">{t('agreement.today')}: </span>
                  {t('color.levelShort', { n: sessionNumber === 1 ? plan.session1Level : plan.targetLevel })} · {t('agreement.final')}: {t('color.levelShort', { n: plan.targetLevel })}
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <Tick on={tests.has('strand')} label={t('test.strand')} />
                  <Tick on={tests.has('metallic')} label={t('test.metallic')} />
                  <Tick on={tests.has('patch')} label={t('test.patch48')} />
                  {plan.fillerLikely ? <Tick on label={t('lift.filler')} /> : null}
                  {plan.needsNaturalTone ? <Tick on label={t('lift.naturalTone')} /> : null}
                </div>
              </div>
            </section>
          </>
        ) : null}

        <hr className="rule-clay" />
        <section>
          <div className="eyebrow">{t('agreement.price')}</div>
          {selected.length ? (
            <ul className="mt-1 text-[14px]">
              {selected.map((p) => (
                <li key={p.id} className="num flex justify-between gap-3">
                  <span>{lang === 'ar' ? p.nameAr || p.name : p.name || p.nameAr}</span>
                  <span>{formatOmr(p.priceOmr, lang)}</span>
                </li>
              ))}
              <li className="num mt-1 flex justify-between border-t border-[#E3D9CF] pt-1 font-semibold">
                <span>{t('agreement.total')}</span>
                <span>{formatOmr(total, lang)}</span>
              </li>
            </ul>
          ) : (
            <div className="mt-1 text-[14px] text-[#6B6166]">{t('agreement.noPrice')}</div>
          )}
        </section>
        <hr className="rule-clay" />
        <section>
          <div className="eyebrow">{t('agreement.aftercare')}</div>
          <ul className="mt-1 list-disc ps-5 text-[14px]">
            {careKeys.map((k) => (
              <li key={k}>{name(aftercareText[k])}</li>
            ))}
          </ul>
        </section>
        <hr className="rule-clay" />
        <section className="grid grid-cols-2 gap-4 text-[14px]">
          <div>
            <div className="eyebrow">{t('agreement.customerAgreed')}</div>
            <div className="num mt-1">{approvals.customerAt ? formatTime(approvals.customerAt, lang) : '—'}</div>
          </div>
          <div>
            <div className="eyebrow">{t('agreement.stylistAgreed')}</div>
            <div className="num mt-1">{approvals.stylistAt ? `${stylistName} · ${formatTime(approvals.stylistAt, lang)}` : '—'}</div>
          </div>
        </section>
        <footer className="mt-5 text-[11px] leading-snug text-[#6B6166]">
          <div dir="rtl" lang="ar">{translate('ar', 'agreement.footer')}</div>
          <div dir="ltr" lang="en">{translate('en', 'agreement.footer')}</div>
        </footer>
      </article>

      <section className="no-print mx-auto mt-6 max-w-[560px] space-y-5">
        {!approvals.stylistAt ? (
          <>
            {shade && plan?.sessionsTotal > 1 ? (
              <div>
                <div className="label mb-2">{t('agreement.whichSession')}</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: plan.sessionsTotal }, (_, i) => i + 1).map((n) => (
                    <Chip key={n} selected={sessionNumber === n} onClick={() => setSessionNumber(n)}>
                      {t('agreement.sessionOf', { n, total: plan.sessionsTotal })}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <div className="label mb-2">{t('agreement.pickPrice')}</div>
              {priceList.length ? (
                <div className="flex flex-wrap gap-2">
                  {priceList.map((p) => (
                    <Chip key={p.id} selected={items.includes(p.id)} onClick={() => setItems((xs) => (xs.includes(p.id) ? xs.filter((x) => x !== p.id) : [...xs, p.id]))}>
                      {lang === 'ar' ? p.nameAr || p.name : p.name || p.nameAr} · <span className="num">{formatOmr(p.priceOmr, lang)}</span>
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink2">{t('agreement.noProducts')}</p>
              )}
            </div>
            <Chip selected={withPhoto} icon="camera" onClick={() => setWithPhoto((v) => !v)}>{t('agreement.addPhoto')}</Chip>
            {!approvals.customerAt ? (
              <Button icon="check" onClick={customerAgrees}>{t('agreement.iAgree')}</Button>
            ) : (
              <Button icon="check" onClick={stylistAgrees}>{t('agreement.stylistAgrees')}</Button>
            )}
          </>
        ) : (
          <>
            <p className="rounded-control border border-ok p-3 text-center font-semibold text-ok">{t('agreement.approved')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon="print" busy={busy === 'pdf'} onClick={exportPdf}>{t('agreement.pdf')}</Button>
              <Button variant="secondary" icon="share" busy={busy === 'png'} onClick={exportPng}>{t('agreement.png')}</Button>
              <Button variant="secondary" icon="whatsapp" onClick={copyWhatsapp}>{t('agreement.whatsapp')}</Button>
              <Button variant="secondary" icon="print" onClick={() => window.print()}>{t('agreement.print')}</Button>
            </div>
            <Button icon="check" onClick={() => navigate('/done')}>{t('common.next')}</Button>
          </>
        )}
      </section>

      <Sheet open={Boolean(big) && !bigOk} modal title={t('agreement.bigTitle')} onClose={() => navigate(-1)}>
        <p className="mb-4 text-ink2">
          {currentCm && wetCm && currentCm - wetCm > DEFAULTS.bigChangeCm ? t('agreement.bigCm', { cm: formatCm(roundHalf(currentCm - wetCm), lang) }) : t('agreement.bigLevels', { n: plan?.liftNeeded })}
        </p>
        <div className="space-y-3">
          <Button icon="check" onClick={() => { setBigOk(true); session.patch({ bigChangeOk: true }); }}>{t('agreement.bigYes')}</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>{t('agreement.bigNo')}</Button>
        </div>
      </Sheet>
    </main>
  );
}
