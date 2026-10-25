// Shop-style shade browser (REF5, improved): sticky search, color-dot family filter, finish & type filters,
// stock-aware cards. Used on the Catalog page and inside the try-on studio.
import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, Check } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { FAMILIES, FINISHES, PRODUCT_TYPES, FINISH_BY_KEY } from '../data/taxonomy'
import { NailSwatch } from './NailSwatch'
import { Badge, Toggle } from './ui'
import { money } from '../lib/format'

export function CatalogGrid({ shades, library, hasInventory, salon, onPick, pickLabel, selectedId, compact = false }) {
  const { t, pick, lang } = useI18n()
  const [q, setQ] = useState('')
  const [family, setFamily] = useState('all')
  const [finish, setFinish] = useState('all')
  const [type, setType] = useState('all')
  const [explore, setExplore] = useState(!hasInventory)
  const [showFilters, setShowFilters] = useState(false)

  const source = explore ? library : shades
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return source.filter((p) => {
      if (family !== 'all' && p.family !== family) return false
      if (finish !== 'all' && p.finish !== finish) return false
      if (type !== 'all' && !explore && p.type !== type) return false
      if (needle) {
        const hay = [p.name, p.nameAr, p.brand, p.code, p.hex].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [source, q, family, finish, type, explore])

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 bg-porcelain-50/95 px-1 pb-2 pt-1 backdrop-blur">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_shades')} className="field ps-11" />
          </label>
          <button onClick={() => setShowFilters((v) => !v)} className={`icon-btn h-[50px] w-[50px] border ${showFilters ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white'}`} aria-label={t('filters')}>
            <SlidersHorizontal size={20} />
          </button>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          <button onClick={() => setFamily('all')} className={`chip ${family === 'all' ? 'chip-on' : 'chip-off'}`}>
            {t('all')}
          </button>
          {FAMILIES.map((f) => (
            <button key={f.key} onClick={() => setFamily(f.key)} className={`chip ${family === f.key ? 'chip-on' : 'chip-off'}`}>
              <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: f.dot }} />
              {pick(f)}
            </button>
          ))}
        </div>
        {showFilters && (
          <div className="card flex animate-rise flex-col gap-3 p-4">
            {hasInventory && <Toggle checked={explore} onChange={setExplore} label={t('explore_library')} />}
            <div>
              <span className="label">{t('finish')}</span>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFinish('all')} className={`chip ${finish === 'all' ? 'chip-on' : 'chip-off'}`}>
                  {t('all')}
                </button>
                {FINISHES.map((f) => (
                  <button key={f.key} onClick={() => setFinish(f.key)} className={`chip ${finish === f.key ? 'chip-on' : 'chip-off'}`}>
                    {pick(f)}
                  </button>
                ))}
              </div>
            </div>
            {!explore && (
              <div>
                <span className="label">{t('product_type')}</span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setType('all')} className={`chip ${type === 'all' ? 'chip-on' : 'chip-off'}`}>
                    {t('all')}
                  </button>
                  {PRODUCT_TYPES.map((p) => (
                    <button key={p.key} onClick={() => setType(p.key)} className={`chip ${type === p.key ? 'chip-on' : 'chip-off'}`}>
                      {pick(p)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <p className="text-[13px] font-semibold text-ink-500">
          {t('n_shades', { n: list.length })}
          {explore && hasInventory ? ' · ' + t('library_note') : ''}
        </p>
      </div>

      <div className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {list.map((p) => {
          const out = typeof p.stock === 'number' && p.stock <= 0
          const sel = selectedId === p.id
          return (
            <button
              key={p.id}
              onClick={() => onPick?.(p)}
              className={`group relative flex flex-col items-center gap-2 rounded-3xl border bg-white p-3 text-center transition active:scale-[0.98] ${
                sel ? 'border-ink shadow-glow' : 'border-ink/5 shadow-soft hover:border-ink/20'
              }`}
            >
              <div className="flex h-[86px] w-full items-center justify-center rounded-2xl bg-porcelain-200/70">
                <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={compact ? 40 : 50} />
              </div>
              <div className="w-full min-w-0">
                <p className="truncate text-[14px] font-bold">{pick(p)}</p>
                <p className="truncate text-[12px] text-ink-500">
                  {[p.brand && !p.library ? p.brand : null, p.code, pick(FINISH_BY_KEY[p.finish] || {})].filter(Boolean).join(' · ')}
                </p>
                {p.ref && (
                  <p className="truncate text-[11px] text-ink-400" title={p.ref}>
                    ≈ {p.ref}
                  </p>
                )}
              </div>
              <div className="flex w-full items-center justify-between gap-1">
                {!explore && salon?.showPrices !== false && typeof p.price === 'number' ? <span className="text-[13px] font-bold text-mocha">{money(p.price, lang, salon?.currency)}</span> : <span />}
                {out ? <Badge tone="bad">{t('out_of_stock')}</Badge> : !explore && typeof p.stock === 'number' ? <Badge tone="ok">{t('in_stock')}</Badge> : null}
              </div>
              {pickLabel && (
                <span className={`mt-1 inline-flex min-h-[40px] w-full items-center justify-center gap-1 rounded-full text-[13px] font-bold ${sel ? 'bg-ink text-white' : 'bg-ink/5 text-ink group-hover:bg-ink group-hover:text-white'}`}>
                  {sel && <Check size={15} />}
                  {pickLabel}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
