// Customer at home (HOME_ENTRY /t/:salonId/nails, no staff login): the try-on with the salon's
// visible polishes, then "Send to the salon" (a booking request) and / or a Look Code.
// Only the design is ever sent: never the photo, never a thumbnail.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '../../components/TopBar.jsx';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';
import { ErrorBox, Steps } from '../../components/States.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { getPublicSalon } from '../../services/salons.js';
import { publicPolishes } from '../../services/sections/nails.js';
import { sendRequest } from '../../services/requests.js';
import { createLookCode } from '../../services/lookCodes.js';
import { normalizeOmanPhone } from '../../reports/csv.js';
import { whatsappLink } from '../../reports/agreementCardPdf.js';
import { designSummary, DEFAULT_DESIGN, withBase } from '../../ai/nails/index.js';
import { APP } from '../../config/app.js';
import Studio from './Studio.jsx';
import DesignCard from './DesignCard.jsx';
import { buildShades } from './lib.js';
import { StudioSheet, Field, inputClass, usePick } from './ui.jsx';

const EMPTY_FORM = { customerName: '', customerPhone: '', preferredDate: '', note: '' };

export default function NailHome() {
  const { salonId } = useParams();
  const { t, lang, name } = useT();
  const pick = usePick();
  const navigate = useNavigate();
  const [salon, setSalon] = useState(undefined);
  const [polishes, setPolishes] = useState(null);
  const [step, setStep] = useState('welcome'); // welcome | studio
  const [design, setDesign] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState(null);

  useEffect(() => {
    let live = true;
    getPublicSalon(salonId)
      .then((s) => live && setSalon(s || null))
      .catch(() => live && setSalon(null));
    return () => {
      live = false;
    };
  }, [salonId]);

  const catalog = useMemo(() => buildShades(polishes || [], { includeLibrary: !(polishes && polishes.length), includeHidden: false }), [polishes]);
  const offersNails = salon && salon.tryAtHome !== false && (!salon.sections || salon.sections.nails === true);
  const salonName = salon ? name({ en: salon.name, ar: salon.nameAr }) : '';

  const start = async () => {
    setBusy('start');
    const list = await publicPolishes(salonId);
    setPolishes(list);
    setBusy(null);
    setStep('studio');
  };

  const openSend = useCallback((d) => {
    setDesign(d);
    setSent(false);
    setCode(null);
    setError(null);
    setSendOpen(true);
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const phoneOk = !form.customerPhone.trim() || Boolean(normalizeOmanPhone(form.customerPhone));
  const canSend = (form.customerName.trim() || form.customerPhone.trim()) && phoneOk;

  const submit = async () => {
    setBusy('send');
    setError(null);
    try {
      await sendRequest(salonId, { section: 'nails', params: design, customerName: form.customerName, customerPhone: form.customerPhone, note: form.note, preferredDate: form.preferredDate, lang });
      setSent(true);
    } catch (e) {
      setError(e?.message === 'bad-phone' ? 'nails.err_phone' : 'nails.send_failed');
    } finally {
      setBusy(null);
    }
  };

  const makeCode = async () => {
    setBusy('code');
    setError(null);
    try {
      setCode(await createLookCode(salonId, design, 'nails'));
    } catch {
      setError('nails.code_failed');
    } finally {
      setBusy(null);
    }
  };

  const waText = () =>
    [t('nails.wa_customer_intro', { salon: salonName }), designSummary(design, t, pick), code ? `${t('nails.look_code')}: ${code.code}` : null, form.preferredDate ? `${t('nails.preferred_time')}: ${form.preferredDate}` : null]
      .filter(Boolean)
      .join('\n');

  if (step === 'studio' && offersNails) {
    return (
      <>
        <Studio
          catalog={catalog}
          title={salonName}
          onBack={() => setStep('welcome')}
          primary={{ label: t('nails.send_to_salon'), icon: 'share', onClick: (d) => openSend(d) }}
          initialDesign={design || (catalog.hasInventory ? withBase(DEFAULT_DESIGN, catalog.inventory[0]) : undefined)}
        />
        <StudioSheet open={sendOpen} onClose={() => setSendOpen(false)} title={t('nails.love_it')}>
          {design ? (
            <div className="space-y-4" data-testid="nails-send-sheet">
              <DesignCard design={design} />
              {sent ? (
                <div className="flex flex-col items-center gap-2 rounded-card border border-ok p-5 text-center" role="status">
                  <Icon name="check" size={32} className="text-ok" />
                  <p className="font-display text-[22px]">{t('nails.request_sent')}</p>
                  <p className="text-[14px] text-ink2">{t('nails.request_sent_text')}</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  <Field label={t('nails.your_name')}>
                    <input className={inputClass} value={form.customerName} onChange={set('customerName')} autoComplete="name" maxLength={60} />
                  </Field>
                  <Field label={t('nails.your_phone')} hint={phoneOk ? t('nails.phone_hint') : t('nails.err_phone')}>
                    <input className={`${inputClass} ${phoneOk ? '' : 'border-risk'}`} value={form.customerPhone} onChange={set('customerPhone')} inputMode="tel" autoComplete="tel" maxLength={20} dir="ltr" />
                  </Field>
                  <Field label={t('nails.preferred_time')}>
                    <input className={inputClass} value={form.preferredDate} onChange={set('preferredDate')} placeholder={t('nails.preferred_time_ph')} maxLength={40} />
                  </Field>
                  <Field label={t('nails.note')}>
                    <textarea className={`${inputClass} min-h-[80px] py-2`} value={form.note} onChange={set('note')} maxLength={300} />
                  </Field>
                  <Button icon="share" busy={busy === 'send'} disabled={!canSend || Boolean(busy)} onClick={submit} data-testid="nails-send">
                    {t('nails.send_to_salon')}
                  </Button>
                  <p className="flex items-start gap-2 text-[12px] text-ink2">
                    <Icon name="lock" size={16} className="mt-0.5" />
                    {t('nails.no_photo_sent')}
                  </p>
                </div>
              )}
              {error ? <ErrorBox title={t(error)} /> : null}
              <div className="card p-4">
                <p className="font-semibold">{t('nails.look_code')}</p>
                <p className="mt-1 text-[13px] text-ink2">{t('nails.look_code_text')}</p>
                {code ? (
                  <p className="num mt-3 text-center font-display text-[36px] tracking-[0.2em]" dir="ltr" data-testid="nails-code">
                    {code.code}
                  </p>
                ) : (
                  <div className="mt-3">
                    <Button variant="secondary" icon="qr" busy={busy === 'code'} disabled={Boolean(busy)} onClick={makeCode} data-testid="nails-make-code">
                      {t('nails.make_code')}
                    </Button>
                  </div>
                )}
              </div>
              {salon.whatsapp ? (
                <Button variant="secondary" icon="whatsapp" onClick={() => window.open(whatsappLink(salon.whatsapp, waText()), '_blank', 'noopener')}>
                  {t('nails.whatsapp_salon')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </StudioSheet>
      </>
    );
  }

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[640px] flex-col">
      <TopBar back={Boolean(salon)} onBack={() => navigate(`/t/${salonId}`)} />
      {salon === undefined ? <Steps items={[{ key: 'l', label: t('common.loading'), state: 'doing' }]} /> : null}
      {salon === null ? <ErrorBox title={t('home.salonMissing')} body={t('home.salonMissingBody')} /> : null}
      {salon && !offersNails ? <ErrorBox title={t('nails.home_off')} /> : null}
      {offersNails ? (
        <>
          <section className="flex flex-1 flex-col justify-center py-8">
            <p className="eyebrow">{t('home.welcomeTo')}</p>
            <h1 className="mt-2 font-display text-[40px] leading-[1.05] text-plum">{salonName}</h1>
            <p className="mt-6 max-w-[34ch] text-lg">{t('nails.home_lead')}</p>
            <div className="card mt-6 flex items-start gap-3 p-4">
              <Icon name="lock" className="mt-0.5 text-clay" />
              <div>
                <div className="font-semibold">{t('home.promise')}</div>
                <p className="mt-1 text-sm text-ink2">{t('nails.home_promise')}</p>
              </div>
            </div>
          </section>
          <Button icon="camera" busy={busy === 'start'} onClick={start} data-testid="nails-home-start">{t('nails.home_start')}</Button>
          <p className="mt-4 text-center text-xs text-ink2">{t('splash.footer', { studio: APP.studio })}</p>
        </>
      ) : null}
    </main>
  );
}
