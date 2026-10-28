import { useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import Button from '../components/Button.jsx';
import Chip, { ChipRow, Tag } from '../components/Chip.jsx';
import Sheet from '../components/Sheet.jsx';
import CsvImport from '../components/CsvImport.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useLive } from '../hooks/useLive.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { saveProduct, importProducts } from '../services/products.js';
import { watchClients, importClients } from '../services/clients.js';
import { validateProducts, validateClients } from '../reports/csv.js';
import { PRODUCT_CATEGORIES } from '../services/schema.js';
import { formatOmr } from '../lib/format.js';
import { publicUrl } from '../lib/url.js';
import { sectionsOn } from '../services/salons.js';

const EMPTY = { name: '', nameAr: '', category: 'service', section: null, priceOmr: '', active: true };

export default function S20Products() {
  const { t, lang } = useT();
  const app = useApp();
  const snack = useSnackbar();
  const [form, setForm] = useState(null);
  const [cat, setCat] = useState('all');
  const [clients] = useLive((cb) => watchClients(app.salonId, cb), [app.salonId], []);
  const list = (app.products || []).filter((p) => cat === 'all' || p.category === cat);
  const priceOk = form && /^\d+(\.\d{1,3})?$/.test(String(form.priceOmr).trim());
  const valid = form && (form.name.trim() || form.nameAr.trim()) && priceOk;

  return (
    <OwnerLayout title={t('products.title')}>
      <p className="mb-4 max-w-[60ch] text-ink2">{t('products.lead')}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip selected={cat === 'all'} onClick={() => setCat('all')}>{t('common.all')}</Chip>
        {PRODUCT_CATEGORIES.map((c) => (
          <Chip key={c} selected={cat === c} onClick={() => setCat(c)}>{t(`category.${c}`)}</Chip>
        ))}
        <div className="flex-1" />
        <Button full={false} icon="plus" onClick={() => setForm({ ...EMPTY })}>{t('products.add')}</Button>
      </div>
      {list.length ? (
        <ul className="mb-8 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setForm({ ...p, priceOmr: Number(p.priceOmr).toFixed(3) })} className={`press flex min-h-[64px] w-full items-center gap-3 px-4 text-start active:bg-surface2 ${p.active ? '' : 'opacity-55'}`}>
                <span className="flex-1">
                  <span className="block font-medium">{lang === 'ar' ? p.nameAr || p.name : p.name || p.nameAr}</span>
                  <span className="block text-xs text-ink2">{p.section ? `${t(`sections.${p.section}`)} · ` : ''}{t(`category.${p.category}`)}{p.active ? '' : ` · ${t('products.inactive')}`}</span>
                </span>
                <span className="num font-semibold">{formatOmr(p.priceOmr, lang)}</span>
                {p._pending ? <Tag>{t('common.willSync')}</Tag> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="tag" title={t('products.empty')} body={t('products.emptyBody')} />
      )}

      <div className="grid grid-cols-1 gap-5 desk:grid-cols-2">
        <CsvImport
          title={t('products.importTitle')}
          template={publicUrl('templates/products-template.csv')}
          columns={['name', 'nameAr', 'category', 'priceOmr', 'active']}
          note={t('products.importNote')}
          validate={validateProducts}
          onImport={(rows) => { importProducts(app.salonId, rows); snack.show({ message: t('csv.imported', { n: rows.length }) }); }}
        />
        <CsvImport
          title={t('clients.importTitle')}
          template={publicUrl('templates/clients-template.csv')}
          columns={['displayName', 'phone']}
          note={t('clients.importNote')}
          validate={(text) => validateClients(text, clients || [])}
          onImport={(rows) => { importClients(app.salonId, rows); snack.show({ message: t('csv.imported', { n: rows.length }) }); }}
        />
      </div>

      <Sheet open={Boolean(form)} modal onClose={() => setForm(null)} title={form?.id ? t('products.edit') : t('products.add')}>
        {form ? (
          <div className="max-h-[70vh] overflow-y-auto pb-2">
            <label className="label mb-1 block" htmlFor="p-ar">{t('products.nameAr')}</label>
            <input id="p-ar" dir="rtl" className="field mb-3" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            <label className="label mb-1 block" htmlFor="p-en">{t('products.nameEn')}</label>
            <input id="p-en" dir="ltr" className="field mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {sectionsOn(app.salon?.sections || { hair: true }).length > 1 ? (
              <ChipRow label={t('sections.title')} value={form.section || null} onChange={(v) => setForm({ ...form, section: v })} options={[{ value: null, label: t('dash.allServices') }, ...sectionsOn(app.salon?.sections).map((s) => ({ value: s, label: t(`sections.${s}`) }))]} />
            ) : null}
            <ChipRow label={t('products.category')} value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))} />
            <label className="label mb-1 block" htmlFor="p-price">{t('products.price')}</label>
            <input id="p-price" dir="ltr" inputMode="decimal" className={`field num mb-1 ${form.priceOmr !== '' && !priceOk ? 'border-risk' : ''}`} value={form.priceOmr} onChange={(e) => setForm({ ...form, priceOmr: e.target.value.replace(',', '.') })} placeholder="0.000" />
            <p className="mb-3 text-xs text-ink2">{t('products.priceHint')}</p>
            <ChipRow label={t('products.status')} value={form.active} onChange={(v) => setForm({ ...form, active: v })} options={[{ value: true, label: t('products.active') }, { value: false, label: t('products.inactive') }]} />
            <Button icon="check" disabled={!valid} onClick={() => { saveProduct(app.salonId, form); setForm(null); snack.show({ message: t('common.saved') }); }}>
              {t('common.save')}
            </Button>
          </div>
        ) : null}
      </Sheet>
    </OwnerLayout>
  );
}
