// Bottom-panel content for the studio: shades, finishes, shape & length, art, per-finger accents.
import { useMemo, useState } from 'react'
import { LayoutGrid, Sparkles, Star, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { FAMILIES, FINISHES, SHAPES, LENGTHS, ART, FINGERS, PRODUCT_TYPES } from '../../data/taxonomy'
import { COLLECTIONS, LIBRARY_BY_ID } from '../../data/library'
import { NailSwatch } from '../../components/NailSwatch'
import { ShapeIcon } from '../../components/ShapeIcon'

export function ShadeRail({ shades, design, activeFinger, onPick, onOpenCatalog, favorites = [] }) {
  const { t, pick } = useI18n()
  const [family, setFamily] = useState('all')
  const current = activeFinger ? design.perFinger[activeFinger] : design.base
  const list = useMemo(() => {
    if (family === 'trends') {
      const ids = new Set(COLLECTIONS.flatMap((c) => c.ids))
      const fromSalon = shades.filter((s) => ids.has(s.id) || ids.has('lib-' + s.code))
      return fromSalon.length ? fromSalon : [...ids].map((id) => LIBRARY_BY_ID[id]).filter(Boolean)
    }
    if (family === 'fav') return favorites
    if (family === 'all') return shades
    return shades.filter((s) => s.family === family)
  }, [family, shades, favorites])
  const families = useMemo(() => FAMILIES.filter((f) => shades.some((s) => s.family === f.key)), [shades])

  return (
    <div className="flex flex-col gap-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button onClick={onOpenCatalog} className="chip chip-dark-off" aria-label={t('open_catalog')}>
          <LayoutGrid size={16} />
          {t('catalog')}
        </button>
        <button onClick={() => setFamily('all')} className={`chip ${family === 'all' ? 'chip-dark-on' : 'chip-dark-off'}`}>
          {t('all')}
        </button>
        <button onClick={() => setFamily('trends')} className={`chip ${family === 'trends' ? 'chip-dark-on' : 'chip-dark-off'}`}>
          <Sparkles size={15} />
          {t('trends')}
        </button>
        {favorites.length > 0 && (
          <button onClick={() => setFamily('fav')} className={`chip ${family === 'fav' ? 'chip-dark-on' : 'chip-dark-off'}`}>
            <Star size={15} />
            {t('favorites')}
          </button>
        )}
        {families.map((f) => (
          <button key={f.key} onClick={() => setFamily(f.key)} className={`chip ${family === f.key ? 'chip-dark-on' : 'chip-dark-off'}`}>
            <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: f.dot }} />
            {pick(f)}
          </button>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 pt-2">
        {list.map((s) => {
          const sel = current && current.polishId === s.id
          const out = typeof s.stock === 'number' && s.stock <= 0
          return (
            <button key={s.id} onClick={() => onPick(s)} className="flex w-[64px] shrink-0 snap-start flex-col items-center gap-1.5" aria-label={pick(s)} aria-pressed={sel}>
              <span className={`relative transition ${sel ? 'scale-110' : ''}`}>
                <NailSwatch hex={s.hex} hex2={s.hex2} finish={s.finish} size={44} selected={sel} dark />
                {out && <span className="absolute -end-1 -top-1 h-3 w-3 rounded-full border-2 border-night bg-bad" />}
              </span>
              <span className={`line-clamp-2 text-center text-[11px] leading-tight ${sel ? 'font-bold text-white' : 'text-white/70'}`}>{pick(s)}</span>
            </button>
          )
        })}
        {!list.length && <p className="py-6 text-[14px] text-white/60">{t('no_shades_here')}</p>}
      </div>
    </div>
  )
}

export function FinishRail({ design, activeFinger, onPick }) {
  const { pick } = useI18n()
  const cur = activeFinger && design.perFinger[activeFinger] ? design.perFinger[activeFinger] : design.base
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 py-2">
      {FINISHES.map((f) => {
        const sel = cur.finish === f.key
        return (
          <button key={f.key} onClick={() => onPick(f.key)} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5" aria-pressed={sel}>
            <NailSwatch hex={cur.hex} hex2={cur.hex2} finish={f.key} size={42} selected={sel} dark />
            <span className={`text-center text-[11px] leading-tight ${sel ? 'font-bold text-white' : 'text-white/70'}`}>{pick(f)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ShapePanel({ design, onChange }) {
  const { t, pick } = useI18n()
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {SHAPES.map((s) => {
          const sel = design.shape === s.key
          return (
            <button
              key={s.key}
              onClick={() => onChange({ shape: s.key, length: Math.max(design.length, s.minLen) })}
              className={`flex min-h-[76px] w-[78px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border ${sel ? 'border-white bg-white text-ink' : 'border-white/15 bg-white/5 text-white'}`}
              aria-pressed={sel}
            >
              <ShapeIcon shape={s.key} length={Math.max(0.35, s.minLen)} size={34} fill={sel ? '#1D1A18' : 'none'} />
              <span className="text-[11px] font-bold">{pick(s)}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[12px] font-bold text-white/70">{t('length')}</span>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {LENGTHS.map((l) => (
            <button key={l.key} onClick={() => onChange({ length: l.value })} className={`chip min-h-[38px] px-3 ${Math.abs(design.length - l.value) < 0.05 ? 'chip-dark-on' : 'chip-dark-off'}`}>
              {pick(l)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[12px] font-bold text-white/70">{t('product_type')}</span>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {PRODUCT_TYPES.map((p) => (
            <button key={p.key} onClick={() => onChange({ type: p.key })} className={`chip min-h-[38px] px-3 ${design.type === p.key ? 'chip-dark-on' : 'chip-dark-off'}`}>
              {pick(p)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const ART_COLORS = ['#FBFBFA', '#F3E4E0', '#E8B9B3', '#D4AF37', '#D4D6DA', '#111012', '#B5121B', '#A9C8E8']

export function ArtPanel({ design, onChange }) {
  const { t, pick } = useI18n()
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {ART.map((a) => (
          <button key={a.key} onClick={() => onChange({ art: a.key })} className={`chip ${design.art === a.key ? 'chip-dark-on' : 'chip-dark-off'}`}>
            {pick(a)}
          </button>
        ))}
      </div>
      {design.art !== 'none' && (
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[12px] font-bold text-white/70">{t('art_color')}</span>
          <div className="no-scrollbar flex flex-1 gap-2.5 overflow-x-auto py-1">
            {ART_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ artHex: c })}
                className={`h-10 w-10 shrink-0 rounded-full border-2 ${design.artHex === c ? 'border-white shadow-iceglow' : 'border-white/20'}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-white/40" aria-label={t('custom_color')}>
              <input type="color" value={design.artHex} onChange={(e) => onChange({ artHex: e.target.value.toUpperCase() })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              <span className="flex h-full w-full items-center justify-center text-[18px] text-white/80">+</span>
            </label>
          </div>
        </div>
      )}
      <p className="text-[12px] text-white/60">{t('art_hint')}</p>
    </div>
  )
}

export function FingerPanel({ design, activeFinger, setActiveFinger, onClear }) {
  const { t, pick } = useI18n()
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-[13px] text-white/75">{t('accent_hint')}</p>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button onClick={() => setActiveFinger(null)} className={`chip ${!activeFinger ? 'chip-dark-on' : 'chip-dark-off'}`}>
          {t('all_nails')}
        </button>
        {FINGERS.map((f) => {
          const p = design.perFinger[f.key]
          return (
            <button key={f.key} onClick={() => setActiveFinger(f.key)} className={`chip ${activeFinger === f.key ? 'chip-dark-on' : 'chip-dark-off'}`}>
              {p && <span className="h-4 w-4 rounded-full border border-white/40" style={{ background: p.hex }} />}
              {pick(f)}
            </button>
          )
        })}
      </div>
      {Object.keys(design.perFinger).length > 0 && (
        <button onClick={onClear} className="chip chip-dark-off self-start">
          <X size={15} />
          {t('clear_accents')}
        </button>
      )}
    </div>
  )
}
