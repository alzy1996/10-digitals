// Chair flow step 2 (/nails/agreement): the nail Agreement. The consultation (section 'nails',
// same visitId as the other services of this visit) stores the design only; two approvals.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import TopBar from '../../components/TopBar.jsx';
import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import { useSnackbar } from '../../components/Snackbar.jsx';
import { useT, translate } from '../../lib/i18n/useT.js';
import { useApp } from '../../hooks/useApp.jsx';
import { useSession } from '../../hooks/useSession.jsx';
import { createConsultation, updateConsultation, approveCustomer, approveStylist } from '../../services/consultations.js';
import { saveNailLook } from '../../services/sections/nails.js';
import { agreementPdf, downloadBlob, shareFile, whatsappLink } from '../../reports/agreementCardPdf.js';
import { formatOmr } from '../../lib/format.js';
import { formatDateTime, formatTime } from '../../lib/time.js';
import { designSummary } from '../../ai/nails/index.js';
import DesignCard from './DesignCard.jsx';
import { useNailCatalog } from './useNailCatalog.js';
import { designPolishes, hydrateDesign } from './lib.js';
import { usePick, StudioSheet, Field, inputClass } from './ui.jsx';

export default function NailAgreement() {
  const { t, lang, name } = useT();
  const pick = usePick();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const catalog = useNailCatalog();
  const cardRef = useRef(null);
  const raw = session.nailDesign;
  const design = useMemo(() => (raw ? hydrateDesign(raw, catalog.byId) : null), [raw, catalog.byId]);
  const [items, setItems] = useState([]);
  const [withPhoto, setWithPhoto] = useState(false);
  const [approvals, setApprovals] = useState({ customerAt: null, stylistAt: null });
  const [busy, setBusy] = useState(null);
  const [lookForm, setLookForm] = useState(null);
  const shot = session.heavy?.nailsShot || null;
  const chair = session.mode === 'chair' && app.isStaff;

  // one consultation per service per visit: create it once, then keep the design up to date
  const ensured = useRef(false);
  const { consultationId, patch, visitId, client } = session;
  useEffect(() => {
    if (!raw || !chair || ensured.current) return;
    ensured.current = true;
    if (consultationId) updateConsultation(app.salonId, consultationId, { params: raw }, 'nails');
    else {
      const id = createConsultation(app.salonId, { section: 'nails', visitId: visitId || null, clientId: client?.id || null, params: raw, source: 'chair' });
      patch({ consultationId: id });
    }
  }, [raw, chair, consultationId, app.salonId, visitId, client, patch]);

  const sectionProducts = (app.products || []).filter((p) => p.active !== false && p.section === 'nails');
  const products = sectionProducts.length ? sectionProducts : (app.products || []).filter((p) => p.active !== false && !p.section);
  const polishItems = design ? designPolishes(design, catalog.byId).filter((p) => typeof p.priceOmr === 'number') : [];
  const priceList = [
    ...products.map((p) => ({ id: `p:${p.id}`, label: lang === 'ar' ? p.nameAr || p.name : p.name || p.nameAr, price: Number(p.priceOmr || 0) })),
    ...polishItems.map((p) => ({ id: `n:${p.id}`, label: pick(p), price: p.priceOmr })),
  ];
  const selected = priceList.filter((p) => items.includes(p.id));
  const total = selected.reduce((s, p) => s + p.price, 0);

  if (!raw) return <Navigate to="/nails" replace />;

  const stylistName = app.me?.name || '';
  const clientName = session.client?.displayName || t('agreement.walkIn');
  const now = new Date();

  const customerAgrees = () => {
    if (chair && session.consultationId) approveCustomer(app.salonId, session.consultationId, 'nails');
    setApprovals((a) => ({ ...a, customerAt: new Date() }));
  };
  const stylistAgrees = () => {
    const decisionSeconds = (Date.now() - (session.startedAt || Date.now())) / 1000;
    if (chair && session.consultationId) approveStylist(app.salonId, { id: session.consultationId, section: 'nails', demo: false }, { decisionSeconds, params: raw });
    setApprovals((a) => ({ ...a, stylistAt: new Date() }));
    patch({ nailsApproved: true });
  };

  const summaryText = () =>
    [
      `${t('nails.agreement_title')} - ${name({ en: app.salon?.name, ar: app.salon?.nameAr })}`,
      designSummary(design, t, pick),
      selected.length ? `${t('agreement.price')}: ${formatOmr(total, lang)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const { blob, filename } = await agreementPdf(cardRef.current, `nails-agreement-${new Date().toISOString().slice(0, 10)}.pdf`);
      if (!(await shareFile(blob, filename, summaryText()))) downloadBlob(blob, filename);
    } finally {
      setBusy(null);
    }
  };
  const sendWhatsapp = async () => {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      snack.show({ message: t('common.copied') });
    } catch {
      // clipboard blocked: the link still carries the text
    }
    window.open(whatsappLink(session.client?.phone || '', text), '_blank', 'noopener');
  };
  const saveLook = () => {
    const nm = (lookForm?.name || '').trim();
    if (!nm) return;
    saveNailLook(app.salonId, { [lang === 'ar' ? 'nameAr' : 'name']: nm, design: raw, hidden: false, signature: false });
    setLookForm(null);
    snack.show({ message: t('nails.look_saved_salon') });
  };

  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('nails.agreement_title')} onBack={() => navigate('/nails')} />

      <article ref={cardRef} className="mx-auto max-w-[560px] rounded-card border border-line bg-[#FBF8F4] p-6 text-[#1D1A1C]" style={{ fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif' }} data-testid="nails-agreement-card">
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
        <h2 className="mt-4 text-[30px] leading-none" style={{ fontFamily: 'Amiri, Fraunces, serif' }}>
          <span dir="rtl" lang="ar">{translate('ar', 'nails.agreement_title')}</span>
          <span className="block text-[20px]" style={{ fontFamily: 'Fraunces, serif' }} lang="en">{translate('en', 'nails.agreement_title')}</span>
        </h2>
        <hr className="rule-clay" />
        <div className="grid gap-4" style={{ gridTemplateColumns: withPhoto && shot ? '1fr auto' : '1fr' }}>
          <DesignCard design={design} compact />
          {withPhoto && shot ? <img src={shot} alt="" className="h-[160px] w-auto rounded-[12px] object-cover" /> : null}
        </div>
        <hr className="rule-clay" />
        <section>
          <div className="eyebrow">{t('agreement.price')}</div>
          {selected.length ? (
            <ul className="mt-1 text-[14px]">
              {selected.map((p) => (
                <li key={p.id} className="num flex justify-between gap-3">
                  <span>{p.label}</span>
                  <span>{formatOmr(p.price, lang)}</span>
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
          <ul className="mt-1 list-disc text-[14px] ltr:pl-5 rtl:pr-5">
            <li>{t(`nails.care_${raw.type === 'lacquer' || raw.type === 'breathable' ? 'lacquer' : 'gel'}`)}</li>
            <li>{t('nails.care_oil')}</li>
            <li>{t('nails.care_gloves')}</li>
          </ul>
        </section>
        <hr className="rule-clay" />
        <section className="grid grid-cols-2 gap-4 text-[14px]">
          <div>
            <div className="eyebrow">{t('agreement.customerAgreed')}</div>
            <div className="num mt-1">{approvals.customerAt ? formatTime(approvals.customerAt, lang) : '-'}</div>
          </div>
          <div>
            <div className="eyebrow">{t('agreement.stylistAgreed')}</div>
            <div className="num mt-1">{approvals.stylistAt ? `${stylistName} · ${formatTime(approvals.stylistAt, lang)}` : '-'}</div>
          </div>
        </section>
        <footer className="mt-5 text-[11px] leading-snug text-[#6B6166]">
          <div dir="rtl" lang="ar">{translate('ar', 'nails.agreement_footer')}</div>
          <div dir="ltr" lang="en">{translate('en', 'nails.agreement_footer')}</div>
        </footer>
      </article>

      <section className="no-print mx-auto mt-6 max-w-[560px] space-y-5">
        {!approvals.stylistAt ? (
          <>
            <div>
              <div className="label mb-2">{t('agreement.pickPrice')}</div>
              {priceList.length ? (
                <div className="flex flex-wrap gap-2">
                  {priceList.map((p) => (
                    <Chip key={p.id} selected={items.includes(p.id)} onClick={() => setItems((xs) => (xs.includes(p.id) ? xs.filter((x) => x !== p.id) : [...xs, p.id]))}>
                      {p.label} · <span className="num">{formatOmr(p.price, lang)}</span>
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink2">{t('nails.no_prices')}</p>
              )}
            </div>
            {shot ? (
              <Chip selected={withPhoto} icon="camera" onClick={() => setWithPhoto((v) => !v)}>
                {t('nails.show_photo_on_card')}
              </Chip>
            ) : null}
            {!approvals.customerAt ? (
              <Button icon="check" onClick={customerAgrees} data-testid="nails-customer-agrees">{t('agreement.iAgree')}</Button>
            ) : (
              <Button icon="check" onClick={stylistAgrees} data-testid="nails-stylist-agrees">{t('agreement.stylistAgrees')}</Button>
            )}
            <Button variant="secondary" icon="back" onClick={() => navigate('/nails')}>{t('nails.back_to_studio')}</Button>
          </>
        ) : (
          <>
            <p className="rounded-control border border-ok p-3 text-center font-semibold text-ok">{t('agreement.approved')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon="print" busy={busy === 'pdf'} onClick={exportPdf}>{t('agreement.pdf')}</Button>
              <Button variant="secondary" icon="whatsapp" onClick={sendWhatsapp}>{t('agreement.whatsapp')}</Button>
              <Button variant="secondary" icon="print" onClick={() => window.print()}>{t('agreement.print')}</Button>
              {app.isManager ? <Button variant="secondary" icon="plus" onClick={() => setLookForm({ name: '' })}>{t('nails.save_as_look')}</Button> : null}
            </div>
            <Button icon="check" onClick={() => navigate('/nails/done')} data-testid="nails-to-done">{t('common.next')}</Button>
          </>
        )}
      </section>

      <StudioSheet open={Boolean(lookForm)} onClose={() => setLookForm(null)} title={t('nails.save_as_look')}>
        <div className="space-y-4">
          <Field label={t('nails.look_name')}>
            <input className={inputClass} value={lookForm?.name || ''} maxLength={60} onChange={(e) => setLookForm({ name: e.target.value })} />
          </Field>
          <Button icon="check" disabled={!(lookForm?.name || '').trim()} onClick={saveLook}>{t('common.save')}</Button>
        </div>
      </StudioSheet>
    </main>
  );
}
