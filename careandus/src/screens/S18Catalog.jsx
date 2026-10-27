import { useMemo, useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import Chip, { Tag } from '../components/Chip.jsx';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import SwatchChip from '../components/SwatchChip.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { setHidden, setLocalFit, setItem, saveSignatureLook, deleteSignatureLook } from '../services/catalog.js';
import { deltaE2000, hexToLab, labToHex } from '../ai/hair/index.js';

const KINDS = ['cuts', 'fringes', 'styles', 'shades', 'techniques', 'looks'];
const FIT = [
  { v: 0.2, k: 'fit.low' },
  { v: 0.5, k: 'fit.mid' },
  { v: 0.9, k: 'fit.high' },
];

export default function S18Catalog() {
  const { t, name } = useT();
  const app = useApp();
  const snack = useSnackbar();
  const [kind, setKind] = useState('cuts');
  const [q, setQ] = useState('');
  const [linkFor, setLinkFor] = useState(null);
  const [lookForm, setLookForm] = useState(null);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (app.catalog[kind] || []).filter((x) => !s || name(x.name).toLowerCase().includes(s) || x.id.includes(s));
  }, [app.catalog, kind, q, name]);
  const swatches = Object.entries(app.swatchesById);

  const toggle = (item) => {
    const before = Boolean(item.hidden);
    setHidden(app.salonId, kind, item, !before);
    snack.show({ message: before ? t('catalog.shown') : t('catalog.hidden'), actionLabel: t('common.undo'), onAction: () => setHidden(app.salonId, kind, { ...item, hidden: !before }, before) });
  };

  return (
    <OwnerLayout title={t('catalog.title')}>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {KINDS.map((k) => (
          <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
            {t(`catalog.kind.${k}`)} <span className="num opacity-70">{(app.catalog[k] || []).length}</span>
          </Chip>
        ))}
      </div>
      <div className="relative mb-4 max-w-[420px]">
        <input className="field ps-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('catalog.search')} aria-label={t('catalog.search')} />
        <Icon name="search" className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink2 ltr:left-3 rtl:right-3" />
      </div>
      {kind === 'looks' ? (
        <div className="mb-4 max-w-[420px]">
          <Button icon="plus" onClick={() => setLookForm({ name: { en: '', ar: '' }, params: { cutId: 'lob', fringeId: 'none', shadeId: 'caramel', technique: 'balayage', finish: 'glossy' } })}>
            {t('catalog.newLook')}
          </Button>
        </div>
      ) : null}
      {items.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {items.map((item) => {
            const scanned = item.swatchRef ? app.swatchesById[item.swatchRef] : null;
            return (
              <li key={item.id} className={`flex flex-wrap items-center gap-3 p-4 ${item.hidden ? 'opacity-55' : ''}`}>
                {kind === 'shades' ? <SwatchChip color={scanned?.labMeasured ? labToHex(scanned.labMeasured) : item.swatch} size={40} label={name(item.name)} /> : null}
                <div className="min-w-[160px] flex-1">
                  <div className="font-medium">{name(item.name)}</div>
                  <div className="text-xs text-ink2">
                    {kind === 'shades' ? `${t('color.levelShort', { n: item.level })} · ${item.tone}` : kind === 'cuts' ? t(`band.${item.length}`) : kind === 'looks' ? [item.params?.cutId, item.params?.shadeId].filter(Boolean).join(' · ') : item.id}
                    {item.trend2026 ? ' · 2026' : ''}
                    {scanned ? ` · ${t('catalog.linked', { code: scanned.code })}` : ''}
                  </div>
                </div>
                {kind !== 'looks' ? (
                  <div className="flex gap-1" role="radiogroup" aria-label={t('catalog.localFit')}>
                    {FIT.map((f) => (
                      <Chip key={f.v} selected={Math.abs((item.localFit ?? 0.5) - f.v) < 0.15} onClick={() => setLocalFit(app.salonId, kind, item, f.v)}>
                        {t(f.k)}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                {kind === 'shades' ? (
                  <Button variant="secondary" full={false} icon="swatch" onClick={() => setLinkFor(item)}>
                    {t('catalog.link')}
                  </Button>
                ) : null}
                {kind === 'looks' ? (
                  <Button variant="danger" full={false} icon="trash" onClick={() => deleteSignatureLook(app.salonId, item.id)}>
                    {t('common.delete')}
                  </Button>
                ) : (
                  <Button variant="secondary" full={false} icon={item.hidden ? 'eye' : 'eye-off'} onClick={() => toggle(item)}>
                    {item.hidden ? t('catalog.show') : t('catalog.hide')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon="grid" title={t('catalog.empty')} />
      )}

      <Sheet open={Boolean(linkFor)} modal onClose={() => setLinkFor(null)} title={t('catalog.linkTitle', { shade: linkFor ? name(linkFor.name) : '' })}>
        {swatches.length ? (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto pb-2">
            {swatches
              .map(([ref, sw]) => ({ ref, sw, d: sw.labMeasured && linkFor ? deltaE2000(sw.labMeasured, hexToLab(linkFor.swatch)) : 99 }))
              .sort((a, b) => a.d - b.d)
              .map(({ ref, sw, d }) => (
                <li key={ref}>
                  <button
                    type="button"
                    className={`press flex min-h-[56px] w-full items-center gap-3 rounded-control border px-3 text-start ${linkFor?.swatchRef === ref ? 'border-plum' : 'border-line'}`}
                    onClick={() => {
                      setItem(app.salonId, 'shades', linkFor, { swatchRef: ref });
                      setLinkFor(null);
                    }}
                  >
                    <SwatchChip color={sw.labMeasured ? labToHex(sw.labMeasured) : '#cccccc'} size={36} label={sw.code} />
                    <span className="flex-1">
                      <span className="block font-medium">{sw.code}</span>
                      <span className="block text-xs text-ink2">{sw.lineName} · {t('color.levelShort', { n: sw.level })} · {sw.tone}</span>
                    </span>
                    {d < 99 ? <Tag tone={d < 5 ? 'ok' : d < 10 ? 'warn' : 'neutral'}>ΔE {d.toFixed(1)}</Tag> : <Tag>{t('catalog.notScanned')}</Tag>}
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <Empty icon="swatch" title={t('catalog.noSwatches')} body={t('catalog.noSwatchesBody')} />
        )}
        {linkFor?.swatchRef ? (
          <Button variant="secondary" onClick={() => { setItem(app.salonId, 'shades', linkFor, { swatchRef: null }); setLinkFor(null); }}>
            {t('catalog.unlink')}
          </Button>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(lookForm)} modal onClose={() => setLookForm(null)} title={t('catalog.newLook')}>
        {lookForm ? (
          <div className="max-h-[65vh] overflow-y-auto pb-2">
            <label className="label mb-1 block" htmlFor="lk-ar">{t('create.nameAr')}</label>
            <input id="lk-ar" dir="rtl" className="field mb-3" value={lookForm.name.ar} onChange={(e) => setLookForm({ ...lookForm, name: { ...lookForm.name, ar: e.target.value } })} />
            <label className="label mb-1 block" htmlFor="lk-en">{t('create.nameEn')}</label>
            <input id="lk-en" dir="ltr" className="field mb-4" value={lookForm.name.en} onChange={(e) => setLookForm({ ...lookForm, name: { ...lookForm.name, en: e.target.value } })} />
            {[
              ['cutId', 'cuts'],
              ['fringeId', 'fringes'],
              ['shadeId', 'shades'],
              ['technique', 'techniques'],
            ].map(([field, k]) => (
              <div key={field} className="mb-4">
                <div className="label mb-2">{t(`catalog.kind.${k}`)}</div>
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                  {app.catalog[k].filter((x) => !x.hidden).map((x) => (
                    <Chip key={x.id} selected={lookForm.params[field] === x.id} onClick={() => setLookForm({ ...lookForm, params: { ...lookForm.params, [field]: x.id } })}>
                      {name(x.name)}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
            <Button
              icon="check"
              disabled={!lookForm.name.en.trim() && !lookForm.name.ar.trim()}
              onClick={() => {
                saveSignatureLook(app.salonId, lookForm);
                setLookForm(null);
                snack.show({ message: t('common.saved') });
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : null}
      </Sheet>
    </OwnerLayout>
  );
}
