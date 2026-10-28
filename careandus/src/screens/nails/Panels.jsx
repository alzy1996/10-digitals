// Bottom-panel content for the studio (from Nail Mirror): shades, finishes, shape and length, art, accents.
import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { FAMILIES, FINISHES, SHAPES, LENGTHS, ART, FINGERS, PRODUCT_TYPES } from '../../data/nails/taxonomy.js';
import { COLLECTIONS } from '../../data/nails/library.js';
import { NailSwatch } from './NailSwatch.jsx';
import { ShapeIcon } from './ShapeIcon.jsx';
import { DarkChip, usePick } from './ui.jsx';
import { inStock } from './lib.js';

const TREND_IDS = new Set(COLLECTIONS.flatMap((c) => c.ids));

export function ShadeRail({ catalog, design, activeFinger, onPick, onOpenCatalog, favorites = [] }) {
  const { t } = useT();
  const pick = usePick();
  const [family, setFamily] = useState(catalog.hasInventory ? 'salon' : 'all');
  const current = activeFinger ? design.perFinger[activeFinger] : design.base;
  const shades = catalog.shades;
  const list = useMemo(() => {
    if (family === 'salon') return catalog.inventory;
    if (family === 'trends') return shades.filter((s) => TREND_IDS.has(s.id));
    if (family === 'fav') return favorites;
    if (family === 'all') return shades;
    return shades.filter((s) => s.family === family);
  }, [family, shades, favorites, catalog.inventory]);
  const families = useMemo(() => FAMILIES.filter((f) => shades.some((s) => s.family === f.key)), [shades]);

  return (
    <div className="flex flex-col gap-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <DarkChip onClick={onOpenCatalog} aria-label={t('nails.open_catalog')}>
          <Icon name="grid" size={18} />
          {t('nails.catalog')}
        </DarkChip>
        {catalog.hasInventory ? (
          <DarkChip on={family === 'salon'} onClick={() => setFamily('salon')}>
            {t('nails.salon_shelf')}
          </DarkChip>
        ) : null}
        <DarkChip on={family === 'all'} onClick={() => setFamily('all')}>
          {t('common.all')}
        </DarkChip>
        <DarkChip on={family === 'trends'} onClick={() => setFamily('trends')}>
          <Icon name="wand" size={18} />
          {t('nails.trends')}
        </DarkChip>
        {favorites.length > 0 ? (
          <DarkChip on={family === 'fav'} onClick={() => setFamily('fav')}>
            {t('nails.favorites')}
          </DarkChip>
        ) : null}
        {families.map((f) => (
          <DarkChip key={f.key} on={family === f.key} onClick={() => setFamily(f.key)}>
            <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: f.dot }} />
            {pick(f)}
          </DarkChip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 pt-2">
        {list.slice(0, 400).map((s) => {
          const sel = current && current.polishId === s.id;
          const out = !inStock(s);
          return (
            <button key={s.id} type="button" onClick={() => onPick(s)} className="flex w-[64px] shrink-0 snap-start flex-col items-center gap-1.5" aria-label={pick(s)} aria-pressed={sel}>
              <span className={`relative transition ${sel ? 'scale-110' : ''}`}>
                <NailSwatch hex={s.hex} hex2={s.hex2} finish={s.finish} size={44} selected={sel} dark />
                {out ? <span className="absolute -top-1 h-3 w-3 rounded-full border-2 border-black bg-risk ltr:-right-1 rtl:-left-1" /> : null}
              </span>
              <span className={`line-clamp-2 text-center text-[11px] leading-tight ${sel ? 'font-bold text-white' : 'text-white/70'}`}>{pick(s)}</span>
            </button>
          );
        })}
        {!list.length ? <p className="py-6 text-[14px] text-white/60">{t('nails.no_shades_here')}</p> : null}
      </div>
    </div>
  );
}

export function FinishRail({ design, activeFinger, onPick }) {
  const pick = usePick();
  const cur = activeFinger && design.perFinger[activeFinger] ? design.perFinger[activeFinger] : design.base;
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 py-2">
      {FINISHES.map((f) => {
        const sel = cur.finish === f.key;
        return (
          <button key={f.key} type="button" onClick={() => onPick(f.key)} className="flex min-h-tap w-[72px] shrink-0 flex-col items-center gap-1.5" aria-pressed={sel}>
            <NailSwatch hex={cur.hex} hex2={cur.hex2} finish={f.key} size={42} selected={sel} dark />
            <span className={`text-center text-[11px] leading-tight ${sel ? 'font-bold text-white' : 'text-white/70'}`}>{pick(f)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ShapePanel({ design, onChange }) {
  const { t } = useT();
  const pick = usePick();
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {SHAPES.map((s) => {
          const sel = design.shape === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange({ shape: s.key, length: Math.max(design.length, s.minLen) })}
              className={`flex min-h-[76px] w-[78px] shrink-0 flex-col items-center justify-center gap-1 rounded-card border ${sel ? 'border-white bg-white text-black' : 'border-white/15 bg-white/5 text-white'}`}
              aria-pressed={sel}
            >
              <ShapeIcon shape={s.key} length={Math.max(0.35, s.minLen)} size={34} fill={sel ? '#1D1A18' : 'none'} />
              <span className="text-[11px] font-bold">{pick(s)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[12px] font-bold text-white/70">{t('nails.length')}</span>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {LENGTHS.map((l) => (
            <DarkChip key={l.key} on={Math.abs(design.length - l.value) < 0.05} onClick={() => onChange({ length: l.value })}>
              {pick(l)}
            </DarkChip>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[12px] font-bold text-white/70">{t('nails.product_type')}</span>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {PRODUCT_TYPES.map((p) => (
            <DarkChip key={p.key} on={design.type === p.key} onClick={() => onChange({ type: p.key })}>
              {pick(p)}
            </DarkChip>
          ))}
        </div>
      </div>
    </div>
  );
}

const ART_COLORS = ['#FBFBFA', '#F3E4E0', '#E8B9B3', '#D4AF37', '#D4D6DA', '#111012', '#B5121B', '#A9C8E8'];

export function ArtPanel({ design, onChange }) {
  const { t } = useT();
  const pick = usePick();
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {ART.map((a) => (
          <DarkChip key={a.key} on={design.art === a.key} onClick={() => onChange({ art: a.key })}>
            {pick(a)}
          </DarkChip>
        ))}
      </div>
      {design.art !== 'none' ? (
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[12px] font-bold text-white/70">{t('nails.art_color')}</span>
          <div className="no-scrollbar flex flex-1 gap-2.5 overflow-x-auto py-1">
            {ART_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ artHex: c })}
                className={`h-11 w-11 shrink-0 rounded-full border-2 ${design.artHex === c ? 'border-white' : 'border-white/20'}`}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={design.artHex === c}
              />
            ))}
            <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-white/40" aria-label={t('nails.custom_color')}>
              <input type="color" value={design.artHex || '#FBFBFA'} onChange={(e) => onChange({ artHex: e.target.value.toUpperCase() })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              <span className="flex h-full w-full items-center justify-center text-white/80">
                <Icon name="plus" size={18} />
              </span>
            </label>
          </div>
        </div>
      ) : null}
      <p className="text-[12px] text-white/60">{t('nails.art_hint')}</p>
    </div>
  );
}

export function FingerPanel({ design, activeFinger, setActiveFinger, onClear }) {
  const { t } = useT();
  const pick = usePick();
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-[13px] text-white/75">{t('nails.accent_hint')}</p>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <DarkChip on={!activeFinger} onClick={() => setActiveFinger(null)}>
          {t('nails.all_nails')}
        </DarkChip>
        {FINGERS.map((f) => {
          const p = design.perFinger[f.key];
          return (
            <DarkChip key={f.key} on={activeFinger === f.key} onClick={() => setActiveFinger(f.key)}>
              {p ? <span className="h-4 w-4 rounded-full border border-white/40" style={{ background: p.hex }} /> : null}
              {pick(f)}
            </DarkChip>
          );
        })}
      </div>
      {Object.keys(design.perFinger).length > 0 ? (
        <DarkChip onClick={onClear} className="self-start">
          <Icon name="close" size={16} />
          {t('nails.clear_accents')}
        </DarkChip>
      ) : null}
    </div>
  );
}

/** Full shade grid (sheet): search + families, salon bottles first. */
export function CatalogGrid({ catalog, selectedId, onPick }) {
  const { t } = useT();
  const pick = usePick();
  const [q, setQ] = useState('');
  const [family, setFamily] = useState('all');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return catalog.shades.filter((p) => (family === 'all' || (family === 'salon' ? p.salon : p.family === family)) && (!s || `${p.name} ${p.nameAr} ${p.code} ${p.brand}`.toLowerCase().includes(s)));
  }, [catalog.shades, q, family]);
  return (
    <div>
      <input className="mb-3 min-h-tap w-full rounded-control border border-line bg-surface px-3 text-[16px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nails.search_shades')} aria-label={t('nails.search_shades')} />
      <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
        {[{ key: 'all', label: t('common.all') }, ...(catalog.hasInventory ? [{ key: 'salon', label: t('nails.salon_shelf') }] : []), ...FAMILIES.map((f) => ({ key: f.key, label: pick(f), dot: f.dot }))].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFamily(f.key)}
            aria-pressed={family === f.key}
            className={`press inline-flex min-h-tap shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] ${family === f.key ? 'border-plum bg-plum text-onplum' : 'border-line bg-surface text-ink'}`}
          >
            {f.dot ? <span className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: f.dot }} /> : null}
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3 tablet:grid-cols-6">
        {list.slice(0, 240).map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} aria-pressed={selectedId === p.id} className="press flex min-h-tap flex-col items-center gap-1 rounded-control p-1 active:bg-surface2">
            <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={40} selected={selectedId === p.id} />
            <span className="line-clamp-2 text-center text-[11px] leading-tight">{pick(p)}</span>
            {!inStock(p) ? <span className="text-[10px] font-semibold text-risk">{t('nails.sold_out')}</span> : null}
          </button>
        ))}
      </div>
      {!list.length ? <p className="py-6 text-center text-sm text-ink2">{t('nails.no_shades_here')}</p> : null}
    </div>
  );
}
