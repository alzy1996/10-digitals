import { useId, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useAuth } from '../state/AuthContext.jsx';
import { createShop } from '../services/shops.js';
import { normalizeOmanPhone } from '../lib/format.js';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import ScreenFallback from '../components/ScreenFallback.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import { rememberLastShop } from './entry/prefs.js';

/**
 * "Create your shop" (/create-shop): the shop name in Arabic and/or English and an
 * optional WhatsApp number. createShop() is optimistic (works offline): it returns the
 * new id at once and seeds the catalog and demo data in the background. No products or
 * prices are asked for; the owner adds them later.
 */
export default function CreateShop() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { loading, isStaffUser } = useAuth();
  const formId = useId();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nameError, setNameError] = useState(null);
  const [phoneError, setPhoneError] = useState(null);
  const [formError, setFormError] = useState(null);
  // One shop per tap: the form stays on screen while the shop route loads, and a
  // second tap (or Enter) there must not create a second shop.
  const submittingRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const nameMsgId = `${formId}-name-msg`;

  if (loading) return <ScreenFallback />;
  if (!isStaffUser) return <Navigate to={`/login?next=${encodeURIComponent('/create-shop')}`} replace />;

  const submit = (e) => {
    e.preventDefault();
    const ar = nameAr.trim();
    const en = nameEn.trim();
    let ok = true;
    if (!ar && !en) {
      setNameError(t('entry.create.nameRequired'));
      ok = false;
    }
    let phone = '';
    if (whatsapp.trim()) {
      phone = normalizeOmanPhone(whatsapp);
      if (!phone) {
        setPhoneError(t('entry.create.whatsappError'));
        ok = false;
      }
    }
    if (!ok) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const shopId = createShop({ name: en, nameAr: ar, whatsapp: phone || '' });
      rememberLastShop(shopId);
      navigate(`/s/${shopId}`, { replace: true });
    } catch (err) {
      submittingRef.current = false;
      setBusy(false);
      console.error('createShop failed', err);
      if (err?.code === 'invalid-argument') setNameError(t('entry.create.nameRequired'));
      else setFormError(t(err?.code === 'app/not-configured' ? 'setup.title' : 'entry.create.failed'));
    }
  };

  const nameInvalid = nameError ? true : undefined;
  const arField = (
    <Field
      key="ar"
      label={t('entry.create.nameAr')}
      lang="ar"
      dir="rtl"
      autoComplete="organization"
      maxLength={80}
      value={nameAr}
      onChange={(v) => {
        setNameAr(v);
        setNameError(null);
      }}
      aria-invalid={nameInvalid}
      aria-describedby={nameMsgId}
    />
  );
  const enField = (
    <Field
      key="en"
      label={t('entry.create.nameEn')}
      lang="en"
      dir="ltr"
      autoComplete="organization"
      autoCapitalize="words"
      maxLength={80}
      value={nameEn}
      onChange={(v) => {
        setNameEn(v);
        setNameError(null);
      }}
      aria-invalid={nameInvalid}
      aria-describedby={nameMsgId}
    />
  );
  // The name in the screen's language comes first; either one is enough.
  const nameFields = lang === 'ar' ? [arField, enField] : [enField, arField];

  return (
    <ScreenFrame
      title={t('entry.create.title')}
      back="/"
      footer={
        <Button type="submit" form={formId} icon="check" loading={busy}>
          {t('entry.create.submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-brass/60 text-brass">
            <Icon name="scissors" size={28} />
          </span>
          <p className="text-text-2">{t('entry.create.lead')}</p>
        </div>

        <hr className="rule-brass" />

        <fieldset className="flex flex-col gap-4">
          <legend className="sr-only">{t('entry.create.title')}</legend>
          {nameFields}
          <p id={nameMsgId} className={nameError ? 'flex items-start gap-1.5 text-sm text-cut' : 'text-sm text-text-2'}>
            {nameError ? <Icon name="warning" size={16} className="mt-0.5 shrink-0" /> : null}
            <span>{nameError || t('entry.create.nameHint')}</span>
          </p>
          <Field
            label={t('entry.create.whatsapp')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="+968 9123 4567"
            icon="whatsapp"
            value={whatsapp}
            onChange={(v) => {
              setWhatsapp(v);
              setPhoneError(null);
            }}
            error={phoneError}
            hint={t('entry.create.whatsappHint')}
          />
        </fieldset>

        {formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-ctl border border-cut/50 bg-cut/10 p-3 text-sm text-text">
            <Icon name="warning" size={20} className="mt-0.5 shrink-0 text-cut" />
            <span>{formError}</span>
          </p>
        ) : null}

        <p className="flex items-start gap-3 rounded-card border border-line bg-surface p-4 text-sm text-text-2">
          <Icon name="catalog" size={20} className="mt-0.5 shrink-0 text-brass" />
          <span>{t('entry.create.seedNote')}</span>
        </p>
      </form>
    </ScreenFrame>
  );
}
