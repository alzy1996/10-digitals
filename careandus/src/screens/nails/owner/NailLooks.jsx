// Owner: saved nail looks (designs the salon shows customers). New looks are saved from the nail
// Agreement ("Save as a salon look"); here they are renamed, shown / hidden, marked signature, deleted.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OwnerLayout from '../../../components/OwnerLayout.jsx';
import Button from '../../../components/Button.jsx';
import Chip from '../../../components/Chip.jsx';
import { Empty } from '../../../components/States.jsx';
import { useSnackbar } from '../../../components/Snackbar.jsx';
import { useT } from '../../../lib/i18n/useT.js';
import { useApp } from '../../../hooks/useApp.jsx';
import { useLive } from '../../../hooks/useLive.js';
import { watchNailLooks, saveNailLook, deleteNailLook } from '../../../services/sections/nails.js';
import DesignCard from '../DesignCard.jsx';
import { useNailCatalog } from '../useNailCatalog.js';
import { hydrateDesign } from '../lib.js';
import { StudioSheet, Field, inputClass, usePick } from '../ui.jsx';

export default function NailLooks() {
  const { t } = useT();
  const pick = usePick();
  const app = useApp();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const catalog = useNailCatalog();
  const [looks] = useLive(app.salonId ? (cb) => watchNailLooks(app.salonId, cb) : null, [app.salonId], []);
  const [form, setForm] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const sorted = useMemo(() => [...(looks || [])].sort((a, b) => Number(Boolean(b.signature)) - Number(Boolean(a.signature)) || (a.name || a.nameAr || '').localeCompare(b.name || b.nameAr || '')), [looks]);

  const save = () => {
    const { _pending, ...look } = form;
    void _pending;
    saveNailLook(app.salonId, { ...look, name: look.name.trim() || null, nameAr: look.nameAr.trim() || null });
    setForm(null);
    snack.show({ message: t('common.saved') });
  };

  return (
    <OwnerLayout title={t('nails.owner_looks')}>
      <p className="mb-4 max-w-[70ch] text-sm text-ink2">{t('nails.looks_lead')}</p>
      {looks && !looks.length ? <Empty icon="grid" title={t('nails.no_looks')} body={t('nails.no_looks_body')} action={<Button variant="secondary" icon="home" onClick={() => navigate('/home')}>{t('nav.chair')}</Button>} /> : null}
      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        {sorted.map((l) => (
          <li key={l.id} className="card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{pick(l)}</p>
                <p className="text-[12px] text-ink2">
                  {l.signature ? t('nails.signature') : null}
                  {l.signature && l.hidden ? ' · ' : null}
                  {l.hidden ? t('nails.hidden_at_home') : null}
                </p>
              </div>
              <Button
                variant="ghost"
                full={false}
                onClick={() => {
                  setConfirmDel(false);
                  setForm({ ...l, name: l.name || '', nameAr: l.nameAr || '' });
                }}
              >
                {t('nails.edit')}
              </Button>
            </div>
            <DesignCard design={hydrateDesign(l.design, catalog.byId)} compact />
          </li>
        ))}
      </ul>

      <StudioSheet open={Boolean(form)} onClose={() => setForm(null)} title={t('nails.edit')}>
        {form ? (
          <div className="space-y-4">
            <Field label={t('create.nameAr')}>
              <input className={inputClass} dir="rtl" value={form.nameAr} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} />
            </Field>
            <Field label={t('create.nameEn')}>
              <input className={inputClass} dir="ltr" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Chip selected={!form.hidden} onClick={() => setForm((f) => ({ ...f, hidden: !f.hidden }))}>{t('nails.show_at_home')}</Chip>
              <Chip selected={Boolean(form.signature)} onClick={() => setForm((f) => ({ ...f, signature: !f.signature }))}>{t('nails.signature')}</Chip>
            </div>
            <Button icon="check" disabled={!form.name.trim() && !form.nameAr.trim()} onClick={save}>{t('common.save')}</Button>
            {confirmDel ? (
              <Button
                variant="danger"
                icon="trash"
                onClick={() => {
                  deleteNailLook(app.salonId, form.id);
                  setForm(null);
                }}
              >
                {t('nails.confirm_delete')}
              </Button>
            ) : (
              <Button variant="secondary" icon="trash" onClick={() => setConfirmDel(true)}>{t('common.delete')}</Button>
            )}
          </div>
        ) : null}
      </StudioSheet>
    </OwnerLayout>
  );
}
