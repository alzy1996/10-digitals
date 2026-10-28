// Owner: the salon's own polishes (from Nail Mirror's Inventory). Name, colour, finish, stock, price,
// shown at home or not. CSV import through the shared CsvImport. Never a photo.
import { useMemo, useState } from 'react';
import OwnerLayout from '../../../components/OwnerLayout.jsx';
import Button from '../../../components/Button.jsx';
import Chip from '../../../components/Chip.jsx';
import CsvImport from '../../../components/CsvImport.jsx';
import { Empty } from '../../../components/States.jsx';
import { useSnackbar } from '../../../components/Snackbar.jsx';
import { useT } from '../../../lib/i18n/useT.js';
import { useApp } from '../../../hooks/useApp.jsx';
import { useLive } from '../../../hooks/useLive.js';
import { watchPolishes, savePolish, deletePolish, importPolishes } from '../../../services/sections/nails.js';
import { formatOmr } from '../../../lib/format.js';
import { FINISHES, PRODUCT_TYPES } from '../../../data/nails/taxonomy.js';
import { normalizeHex } from '../../../ai/nails/index.js';
import { NailSwatch } from '../NailSwatch.jsx';
import { StudioSheet, Field, Toggle, inputClass, usePick } from '../ui.jsx';
import { LIB, inStock, validatePolishesCsv, polishTemplateHref, POLISH_CSV_COLUMNS } from '../lib.js';

const BLANK = { name: '', nameAr: '', brand: '', code: '', hex: '#B5121B', hex2: '', finish: 'creme', type: 'gel', stock: '', priceOmr: '', hidden: false, active: true };

export default function NailPolishes() {
  const { t, lang } = useT();
  const pick = usePick();
  const app = useApp();
  const snack = useSnackbar();
  const [polishes] = useLive(app.salonId ? (cb) => watchPolishes(app.salonId, cb) : null, [app.salonId], []);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState('');
  const [libQ, setLibQ] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (polishes || [])
      .filter((p) => !s || `${p.name} ${p.nameAr} ${p.brand} ${p.code}`.toLowerCase().includes(s))
      .sort((a, b) => (a.name || a.nameAr || '').localeCompare(b.name || b.nameAr || ''));
  }, [polishes, q]);
  const libMatches = useMemo(() => {
    const s = libQ.trim().toLowerCase();
    return s ? LIB.filter((p) => `${p.name} ${p.nameAr} ${p.code}`.toLowerCase().includes(s)).slice(0, 12) : [];
  }, [libQ]);

  const edit = (p) => {
    setConfirmDel(false);
    setLibQ('');
    setForm(p ? { ...BLANK, ...p, hex2: p.hex2 || '', stock: p.stock ?? '', priceOmr: p.priceOmr ?? '' } : { ...BLANK });
  };
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const hex = normalizeHex(form?.hex || '');
  const hex2 = form?.hex2 ? normalizeHex(form.hex2) : null;
  const stockNum = form?.stock === '' ? null : Number(form?.stock);
  const priceNum = form?.priceOmr === '' ? null : Number(String(form?.priceOmr).replace(',', '.'));
  const valid =
    form &&
    (form.name.trim() || form.nameAr.trim()) &&
    hex &&
    (!form.hex2 || hex2) &&
    (stockNum === null || (Number.isInteger(stockNum) && stockNum >= 0 && stockNum <= 100000)) &&
    (priceNum === null || (Number.isFinite(priceNum) && priceNum >= 0 && priceNum <= 10000));

  const save = () => {
    if (!valid) return;
    const { _pending, ...rest } = form;
    void _pending;
    savePolish(app.salonId, {
      ...rest,
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      brand: form.brand.trim(),
      code: form.code.trim(),
      hex: hex.toUpperCase(),
      hex2: hex2 ? hex2.toUpperCase() : null,
      stock: stockNum,
      priceOmr: priceNum === null ? null : Math.round(priceNum * 1000) / 1000,
      hidden: Boolean(form.hidden),
      active: form.active !== false,
    });
    setForm(null);
    snack.show({ message: t('common.saved') });
  };

  return (
    <OwnerLayout title={t('nails.owner_polishes')} actions={<Button full={false} variant="secondary" icon="plus" onClick={() => edit(null)}>{t('nails.add_polish')}</Button>}>
      <p className="mb-4 max-w-[70ch] text-sm text-ink2">{t('nails.polishes_lead')}</p>
      <input className={`${inputClass} mb-4 max-w-[420px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nails.search_shades')} aria-label={t('nails.search_shades')} />
      {polishes && !polishes.length ? (
        <Empty icon="swatch" title={t('nails.no_polishes')} body={t('nails.no_polishes_body')} action={<Button icon="plus" onClick={() => edit(null)}>{t('nails.add_polish')}</Button>} />
      ) : null}
      <ul className="mb-8 grid grid-cols-1 gap-2 tablet:grid-cols-2 desk:grid-cols-3" data-testid="nails-polish-list">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => edit(p)} className="card press flex min-h-[72px] w-full items-center gap-3 p-3 text-start">
              <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{pick(p)}</span>
                <span className="block truncate text-[12px] text-ink2">{[p.brand, p.code, t(`nails.finish_${p.finish}`)].filter(Boolean).join(' · ')}</span>
                <span className="mt-0.5 flex flex-wrap gap-2 text-[12px]">
                  {typeof p.stock === 'number' ? <span className={inStock(p) ? 'text-ink2' : 'font-semibold text-risk'}>{inStock(p) ? t('nails.stock_n', { n: p.stock }) : t('nails.sold_out')}</span> : null}
                  {typeof p.priceOmr === 'number' ? <span className="num">{formatOmr(p.priceOmr, lang)}</span> : null}
                  {p.hidden ? <span className="text-warn">{t('nails.hidden_at_home')}</span> : null}
                  {p.active === false ? <span className="text-ink2">{t('nails.inactive')}</span> : null}
                </span>
              </span>
              <span className="text-clay" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" className="rtl:-scale-x-100"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <CsvImport
        title={t('nails.import_polishes')}
        template={polishTemplateHref()}
        columns={POLISH_CSV_COLUMNS}
        note={t('nails.import_note')}
        validate={validatePolishesCsv}
        onImport={(rows) => {
          importPolishes(app.salonId, rows);
          snack.show({ message: t('csv.imported', { n: rows.length }) });
        }}
      />

      <StudioSheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? t('nails.edit_polish') : t('nails.add_polish')}>
        {form ? (
          <div className="space-y-4" data-testid="nails-polish-form">
            {!form.id ? (
              <div>
                <Field label={t('nails.from_library')} hint={t('nails.from_library_hint')}>
                  <input className={inputClass} value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder={t('nails.search_shades')} />
                </Field>
                {libMatches.length ? (
                  <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
                    {libMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="press flex min-h-tap w-[72px] shrink-0 flex-col items-center gap-1 rounded-control p-1 active:bg-surface2"
                        onClick={() => {
                          setForm((f) => ({ ...f, name: p.name, nameAr: p.nameAr, code: p.code, hex: p.hex, hex2: p.hex2 || '', finish: p.finish }));
                          setLibQ('');
                        }}
                      >
                        <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={30} />
                        <span className="line-clamp-2 text-center text-[11px]">{pick(p)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
              <Field label={t('create.nameAr')}>
                <input className={inputClass} dir="rtl" value={form.nameAr} onChange={setF('nameAr')} maxLength={80} />
              </Field>
              <Field label={t('create.nameEn')}>
                <input className={inputClass} dir="ltr" value={form.name} onChange={setF('name')} maxLength={80} />
              </Field>
              <Field label={t('nails.brand')}>
                <input className={inputClass} value={form.brand} onChange={setF('brand')} maxLength={60} />
              </Field>
              <Field label={t('nails.code')}>
                <input className={inputClass} dir="ltr" value={form.code} onChange={setF('code')} maxLength={40} />
              </Field>
            </div>
            <div className="flex items-end gap-3">
              <NailSwatch hex={hex || '#cccccc'} hex2={hex2} finish={form.finish} size={44} />
              <Field label={t('nails.colour')}>
                <span className="flex gap-2">
                  <input type="color" aria-label={t('nails.colour')} className="h-12 w-14 shrink-0 cursor-pointer rounded-control border border-line bg-surface" value={hex || '#cccccc'} onChange={(e) => setForm((f) => ({ ...f, hex: e.target.value.toUpperCase() }))} />
                  <input className={`${inputClass} ${hex ? '' : 'border-risk'}`} dir="ltr" value={form.hex} onChange={setF('hex')} maxLength={7} />
                </span>
              </Field>
              <Field label={t('nails.colour2')}>
                <input className={`${inputClass} ${!form.hex2 || hex2 ? '' : 'border-risk'}`} dir="ltr" value={form.hex2} onChange={setF('hex2')} maxLength={7} placeholder="#" />
              </Field>
            </div>
            <fieldset>
              <legend className="label mb-2">{t('nails.finish')}</legend>
              <div className="flex flex-wrap gap-2">
                {FINISHES.map((f) => (
                  <Chip key={f.key} selected={form.finish === f.key} onClick={() => setForm((x) => ({ ...x, finish: f.key }))}>
                    {pick(f)}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label mb-2">{t('nails.product_type')}</legend>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_TYPES.map((p) => (
                  <Chip key={p.key} selected={form.type === p.key} onClick={() => setForm((x) => ({ ...x, type: p.key }))}>
                    {pick(p)}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('nails.stock')} hint={t('nails.stock_hint')}>
                <input className={inputClass} inputMode="numeric" dir="ltr" value={form.stock} onChange={setF('stock')} maxLength={6} />
              </Field>
              <Field label={t('nails.price_omr')}>
                <input className={inputClass} inputMode="decimal" dir="ltr" value={form.priceOmr} onChange={setF('priceOmr')} maxLength={9} />
              </Field>
            </div>
            <Toggle checked={!form.hidden} onChange={(v) => setForm((f) => ({ ...f, hidden: !v }))} label={t('nails.show_at_home')} />
            <Toggle checked={form.active !== false} onChange={(v) => setForm((f) => ({ ...f, active: v }))} label={t('nails.active_toggle')} />
            <Button icon="check" disabled={!valid} onClick={save} data-testid="nails-polish-save">{t('common.save')}</Button>
            {form.id ? (
              confirmDel ? (
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={() => {
                    deletePolish(app.salonId, form.id);
                    setForm(null);
                  }}
                >
                  {t('nails.confirm_delete')}
                </Button>
              ) : (
                <Button variant="secondary" icon="trash" onClick={() => setConfirmDel(true)}>{t('common.delete')}</Button>
              )
            ) : null}
          </div>
        ) : null}
      </StudioSheet>
    </OwnerLayout>
  );
}
