import { useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import Button from '../components/Button.jsx';
import Chip, { ChipRow, Tag } from '../components/Chip.jsx';
import Slider from '../components/Slider.jsx';
import QrCode from '../components/QrCode.jsx';
import { Section } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useLive } from '../hooks/useLive.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { updateSettings, updateSalon } from '../services/salons.js';
import { watchAudit } from '../services/audit.js';
import { deleteDemo } from '../services/demo.js';
import { normalizeOmanPhone } from '../reports/csv.js';
import { formatDateTime } from '../lib/time.js';
import { SALON_SETTINGS_DEFAULT, DEFAULTS } from '../config/app.js';

function themePref() {
  try {
    return localStorage.getItem('khusla.theme') || 'light';
  } catch {
    return 'light';
  }
}

export default function S22Settings() {
  const { t, lang } = useT();
  const app = useApp();
  const snack = useSnackbar();
  const s = { ...SALON_SETTINGS_DEFAULT, ...app.settings };
  const [theme, setTheme] = useState(themePref);
  const [wa, setWa] = useState(app.salon?.whatsapp || '');
  const [audit] = useLive(app.isOwner ? (cb) => watchAudit(app.salonId, cb, 30) : null, [app.salonId, app.isOwner], []);
  const set = (patch) => updateSettings(app.salon, patch);
  const link = `${location.origin}/t/${app.salonId}`;
  const workerOk = Boolean(import.meta.env.VITE_AI_WORKER_URL);

  return (
    <OwnerLayout title={t('settings.title')}>
      <div className="grid gap-6 desk:grid-cols-2">
        <Section title={t('settings.privacy')}>
          <div className="card p-5">
            <ChipRow label={t('settings.privateMode')} value={s.privateMode} onChange={(v) => set({ privateMode: v })} options={[{ value: true, label: t('common.on') }, { value: false, label: t('common.off') }]} />
            <ChipRow label={t('settings.idleWipe')} value={s.idleWipeMin} onChange={(v) => set({ idleWipeMin: v })} options={[3, 5, 10].map((m) => ({ value: m, label: t('settings.minutes', { n: m }) }))} />
            <ChipRow label={t('settings.retention')} value={s.retentionDays} onChange={(v) => set({ retentionDays: v })} options={[90, 180, 365, 730].map((d) => ({ value: d, label: t('settings.days', { n: d }) }))} />
            <p className="text-xs text-ink2">{t('settings.privacyNote')}</p>
          </div>
        </Section>

        <Section title={t('settings.ai')}>
          <div className="card p-5">
            <ChipRow label={t('settings.aiPreview')} value={s.aiPreview} onChange={(v) => set({ aiPreview: v })} options={[{ value: false, label: t('common.off') }, { value: true, label: t('common.on') }]} />
            <Slider label={t('settings.aiCap')} value={s.aiDailyCap} min={0} max={DEFAULTS.accountDailyCap} step={1} onChange={(v) => set({ aiDailyCap: v })} format={(v) => String(v)} />
            <p className="text-sm">{workerOk ? <Tag tone="ok">{t('settings.workerOk')}</Tag> : <Tag tone="warn">{t('settings.workerMissing')}</Tag>}</p>
            <p className="mt-2 text-xs text-ink2">{t('settings.aiNote')}</p>
          </div>
        </Section>

        <Section title={t('settings.hair')}>
          <div className="card p-5">
            <Slider label={t('settings.growth')} value={s.growthCmPerMonth} min={0.5} max={2} step={0.05} onChange={(v) => set({ growthCmPerMonth: Math.round(v * 100) / 100 })} format={(v) => t('settings.cmMonth', { n: v.toFixed(2) })} />
            <p className="text-xs text-ink2">{t('settings.growthNote')}</p>
          </div>
        </Section>

        <Section title={t('settings.tryAtHome')}>
          <div className="card p-5">
            <ChipRow label={t('settings.tryAtHome')} value={s.tryAtHome} onChange={(v) => set({ tryAtHome: v })} options={[{ value: true, label: t('common.on') }, { value: false, label: t('common.off') }]} />
            {s.tryAtHome ? (
              <div className="flex flex-wrap items-center gap-4">
                <QrCode value={link} size={180} label={link} />
                <div className="min-w-0 flex-1">
                  <div className="break-all text-sm" dir="ltr">{link}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button full={false} variant="secondary" icon="share" onClick={async () => { try { await navigator.clipboard.writeText(link); snack.show({ message: t('common.copied') }); } catch { /* copy manually */ } }}>{t('common.copy')}</Button>
                    <Button full={false} variant="secondary" icon="print" onClick={() => window.print()}>{t('settings.printQr')}</Button>
                  </div>
                </div>
              </div>
            ) : null}
            <label className="label mb-1 mt-4 block" htmlFor="wa">{t('create.whatsapp')}</label>
            <div className="flex gap-2">
              <input id="wa" dir="ltr" className="field" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="+968 9xxx xxxx" />
              <Button full={false} variant="secondary" disabled={normalizeOmanPhone(wa) === undefined} onClick={() => { updateSalon(app.salon, { whatsapp: normalizeOmanPhone(wa) || null }); snack.show({ message: t('common.saved') }); }}>{t('common.save')}</Button>
            </div>
          </div>
        </Section>

        <Section title={t('settings.device')}>
          <div className="card p-5">
            <ChipRow
              label={t('settings.theme')}
              value={theme}
              onChange={(v) => {
                setTheme(v);
                document.documentElement.dataset.theme = v;
                try {
                  localStorage.setItem('khusla.theme', v);
                } catch {
                  // per-device preference only
                }
              }}
              options={[{ value: 'light', label: t('settings.light') }, { value: 'dark', label: t('settings.dark') }]}
            />
          </div>
        </Section>

        <Section title={t('settings.demo')}>
          <div className="card p-5">
            <p className="mb-3 text-sm text-ink2">{t('settings.demoNote')}</p>
            <Button variant="danger" icon="trash" onClick={async () => { const n = await deleteDemo(app.salonId); snack.show({ message: t('dash.demoDeleted', { n }) }); }}>{t('dash.deleteDemo')}</Button>
          </div>
        </Section>
      </div>

      {app.isOwner ? (
        <Section title={t('settings.audit')}>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-sm">
            {(audit || []).map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 p-3">
                <span className="num text-ink2">{formatDateTime(a.at, lang)}</span>
                <span className="font-medium">{a.action}</span>
                <span className="text-ink2">{Object.keys(a.changedFields || {}).join(', ')}</span>
              </li>
            ))}
            {!(audit || []).length ? <li className="p-3 text-ink2">{t('dash.noData')}</li> : null}
          </ul>
        </Section>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip onClick={() => set({ ...SALON_SETTINGS_DEFAULT, aiPreview: s.aiPreview, tryAtHome: s.tryAtHome })}>{t('settings.reset')}</Chip>
      </div>
    </OwnerLayout>
  );
}
