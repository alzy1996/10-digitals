import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import { ErrorBox, Steps } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { createSalon } from '../services/salons.js';
import { normalizeOmanPhone } from '../reports/csv.js';

export default function CreateSalon() {
  const { t } = useT();
  const app = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', nameAr: '', whatsapp: '', ownerName: app.staffUser?.displayName || '' });
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!app.staffUser) {
    return (
      <main className="screen mx-auto max-w-[560px]">
        <TopBar title={t('create.title')} />
        <Button onClick={() => navigate('/login', { state: { from: '/create-salon' } })}>{t('splash.staffSignIn')}</Button>
      </main>
    );
  }

  const phone = form.whatsapp ? normalizeOmanPhone(form.whatsapp) : null;
  const valid = (form.name.trim() || form.nameAr.trim()) && phone !== undefined;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const id = await createSalon({ name: form.name.trim(), nameAr: form.nameAr.trim(), whatsapp: phone || null, ownerName: form.ownerName.trim(), withDemo: demo });
      app.setSalonId(id);
      navigate('/home', { replace: true });
    } catch (e) {
      setErr(e.code || e.message);
      setBusy(false);
    }
  };

  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('create.title')} />
      <p className="mb-6 text-ink2">{t('create.lead')}</p>
      <label className="label mb-1 block" htmlFor="nameAr">{t('create.nameAr')}</label>
      <input id="nameAr" dir="rtl" className="field mb-4" value={form.nameAr} onChange={set('nameAr')} />
      <label className="label mb-1 block" htmlFor="name">{t('create.nameEn')}</label>
      <input id="name" dir="ltr" className="field mb-4" value={form.name} onChange={set('name')} />
      <label className="label mb-1 block" htmlFor="owner">{t('create.ownerName')}</label>
      <input id="owner" className="field mb-4" value={form.ownerName} onChange={set('ownerName')} />
      <label className="label mb-1 block" htmlFor="wa">{t('create.whatsapp')}</label>
      <input id="wa" dir="ltr" inputMode="tel" className={`field mb-1 ${phone === undefined ? 'border-risk' : ''}`} value={form.whatsapp} onChange={set('whatsapp')} placeholder="+968 9xxx xxxx" />
      <p className="mb-5 text-xs text-ink2">{phone === undefined ? t('create.phoneBad') : t('create.whatsappHint')}</p>
      <div className="mb-6 flex flex-wrap gap-2">
        <Chip selected={demo} onClick={() => setDemo(true)}>{t('create.withDemo')}</Chip>
        <Chip selected={!demo} onClick={() => setDemo(false)}>{t('create.noDemo')}</Chip>
      </div>
      {busy ? (
        <Steps
          items={[
            { key: 'a', label: t('create.step.salon'), state: 'doing' },
            { key: 'b', label: t('create.step.catalog'), state: 'todo' },
            { key: 'c', label: t('create.step.demo'), state: demo ? 'todo' : 'done' },
          ]}
        />
      ) : null}
      <Button icon="check" disabled={!valid || busy} busy={busy} onClick={submit}>
        {t('create.submit')}
      </Button>
      {err ? <ErrorBox title={t('create.error')} body={String(err)} /> : null}
      <p className="mt-6 text-xs text-ink2">{t('create.noBrands')}</p>
    </main>
  );
}
