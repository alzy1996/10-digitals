// Inventory: every bottle on the shelf. Search, color-family + stock filters, one-tap stock counting,
// add/edit sheet (with color-from-bottle-photo) and CSV import/export.
// Deep links: ?filter=low|out|inactive · ?new=1 · ?edit=<id> · ?import=1 (the param is cleared when its sheet closes).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Minus, FileSpreadsheet, Palette, Sparkles, Upload, X, SearchX } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, SearchInput, AuditLine } from './common'
import { NailSwatch } from '../components/NailSwatch'
import { Badge, Empty, Spinner, useToast } from '../components/ui'
import { FAMILIES, TYPE_BY_KEY } from '../data/taxonomy'
import { money } from '../lib/format'
import PolishForm from './PolishForm'
import ImportCsv from './ImportCsv'

const QUICK = ['all', 'low', 'out', 'inactive']
const FAMILY_ORDER = Object.fromEntries(FAMILIES.map((f, i) => [f.key, i]))
const LOW_AT = 2 // same rule as the Dashboard KPI: active + stock ≤ 2
const PAGE = 60 // render in pages so a 2,000-shade shelf stays smooth on older phones

const isActive = (p) => p.active !== false
const hasStock = (p) => typeof p.stock === 'number'
const isLow = (p) => isActive(p) && hasStock(p) && p.stock <= LOW_AT
const isOut = (p) => isActive(p) && hasStock(p) && p.stock <= 0

/** Forgiving search: case, Arabic letter variants (أ/إ/آ → ا, ة → ه, ى → ي), tashkeel and Arabic-Indic digits. */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

export default function Inventory() {
  const { t, pick, lang } = useI18n()
  const { staff, actions, staffReady } = useData()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [family, setFamily] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const [seeding, setSeeding] = useState(false)

  const polishes = staff.polishes
  const currency = staff.salon?.currency || 'OMR'

  // ---------------------------------------------------------------- URL state (source of truth for sheets + quick filter)
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams
  const patchParams = useCallback(
    (fn) =>
      setParamsRef.current(
        (prev) => {
          const next = new URLSearchParams(prev)
          fn(next)
          return next
        },
        { replace: true },
      ),
    [],
  )
  const quick = QUICK.includes(params.get('filter')) ? params.get('filter') : 'all'
  const editId = params.get('edit')
  const isNew = params.get('new') === '1'
  const importOpen = params.get('import') === '1'
  const editing = editId ? polishes.find((p) => p.id === editId) || null : null

  const setQuick = (v) => patchParams((n) => (v === 'all' ? n.delete('filter') : n.set('filter', v)))
  const openNew = () =>
    patchParams((n) => {
      n.delete('edit')
      n.delete('import')
      n.set('new', '1')
    })
  const openEdit = useCallback(
    (id) =>
      patchParams((n) => {
        n.delete('new')
        n.delete('import')
        n.set('edit', id)
      }),
    [patchParams],
  )
  const closeForm = useCallback(
    () =>
      patchParams((n) => {
        n.delete('new')
        n.delete('edit')
      }),
    [patchParams],
  )
  const openImport = () =>
    patchParams((n) => {
      n.delete('new')
      n.delete('edit')
      n.set('import', '1')
    })
  const closeImport = useCallback(() => patchParams((n) => n.delete('import')), [patchParams])

  // A stale ?edit=<id> (deleted on another device, old link) is dropped once the shelf has loaded.
  useEffect(() => {
    if (editId && !editing && polishes.length > 0) patchParams((n) => n.delete('edit'))
  }, [editId, editing, polishes.length, patchParams])

  useEffect(() => setLimit(PAGE), [q, family, quick])

  // ---------------------------------------------------------------- derived lists
  const counts = useMemo(() => {
    let low = 0
    let out = 0
    let inactive = 0
    const fam = {}
    for (const p of polishes) {
      if (isLow(p)) low++
      if (isOut(p)) out++
      if (!isActive(p)) inactive++
      fam[p.family] = (fam[p.family] || 0) + 1
    }
    return { low, out, inactive, fam }
  }, [polishes])

  const sorted = useMemo(() => {
    const coll = new Intl.Collator(lang === 'ar' ? 'ar' : 'en', { numeric: true, sensitivity: 'base' })
    return polishes
      .map((p) => ({ p, name: pick(p), hay: norm([p.name, p.nameAr, p.brand, p.line, p.code, p.hex, p.barcode].join(' ')) }))
      .sort((a, b) => (FAMILY_ORDER[a.p.family] ?? 99) - (FAMILY_ORDER[b.p.family] ?? 99) || coll.compare(a.name, b.name))
  }, [polishes, pick, lang])

  const list = useMemo(() => {
    const words = norm(q).trim().split(/\s+/).filter(Boolean)
    const out = []
    for (const { p, hay } of sorted) {
      if (family !== 'all' && p.family !== family) continue
      if (quick === 'low' && !isLow(p)) continue
      if (quick === 'out' && !isOut(p)) continue
      if (quick === 'inactive' && isActive(p)) continue
      if (words.length && !words.every((w) => hay.includes(w))) continue
      out.push(p)
    }
    return out
  }, [sorted, q, family, quick])

  const familyChips = FAMILIES.filter((f) => counts.fam[f.key] || f.key === family)
  const filtered = q.trim() !== '' || family !== 'all' || quick !== 'all'
  const clearFilters = () => {
    setQ('')
    setFamily('all')
    setQuick('all')
  }

  // ---------------------------------------------------------------- actions
  const step = useCallback(
    (p, delta) => {
      const cur = hasStock(p) ? p.stock : 0
      if (delta < 0 && cur <= 0) return
      // Fire-and-forget: Firestore applies the change locally at once (and queues it offline).
      actions.adjustStock(p.id, delta).catch((e) => {
        console.warn('[stock]', e)
        toast(t('inv_err_generic'), 'error', 4000)
      })
      toast(t('inv_stock_toast', { name: pick(p), n: Math.max(0, cur + delta) }), 'ok', 1200)
    },
    [actions, toast, t, pick],
  )

  const seed = async () => {
    setSeeding(true)
    try {
      await actions.seedStarter()
      toast(t('inv_starter_loaded'))
    } catch (e) {
      console.warn('[seed]', e)
      toast(t('inv_err_generic'), 'error', 4000)
    } finally {
      setSeeding(false)
    }
  }

  const quickChips = [
    { key: 'all', label: t('all'), n: polishes.length },
    { key: 'low', label: t('inv_q_low'), n: counts.low, tone: 'text-warn' },
    { key: 'out', label: t('inv_q_out'), n: counts.out, tone: 'text-bad' },
    { key: 'inactive', label: t('inv_q_inactive'), n: counts.inactive },
  ]

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={t('inv_eyebrow')}
        title={t('inv_title')}
        subtitle={t('inv_subtitle')}
        actions={
          <>
            <button onClick={openNew} className="btn-mocha">
              <Plus size={18} />
              {t('inv_add')}
            </button>
            <button onClick={openImport} className="btn-ghost">
              <FileSpreadsheet size={18} />
              {t('inv_csv')}
            </button>
          </>
        }
      />

      {polishes.length === 0 && !staffReady ? (
        <div className="flex justify-center py-16 text-ink-400">
          <Spinner size={28} />
        </div>
      ) : polishes.length === 0 ? (
        <Empty
          icon={Palette}
          title={t('inv_empty_title')}
          text={t('inv_empty_text')}
          action={
            <div className="mt-2 flex w-full max-w-sm flex-col gap-2">
              <button className="btn-mocha" onClick={seed} disabled={seeding}>
                {seeding ? <Spinner size={18} /> : <Sparkles size={18} />}
                {t('inv_load_starter')}
              </button>
              <button className="btn-ghost" onClick={openImport}>
                <Upload size={18} />
                {t('inv_import_csv')}
              </button>
            </div>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SearchInput value={q} onChange={setQ} placeholder={t('inv_search_ph')} />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label={t('stock')}>
              {quickChips.map((c) => (
                <button key={c.key} onClick={() => setQuick(c.key)} aria-pressed={quick === c.key} className={`chip min-h-[44px] ${quick === c.key ? 'chip-on' : 'chip-off'}`}>
                  {c.label}
                  <span className={`text-[12px] font-bold ${quick === c.key ? 'text-porcelain/70' : c.n && c.tone ? c.tone : 'text-ink-400'}`}>{c.n}</span>
                </button>
              ))}
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label={t('inv_family')}>
              <button onClick={() => setFamily('all')} aria-pressed={family === 'all'} className={`chip min-h-[44px] ${family === 'all' ? 'chip-on' : 'chip-off'}`}>
                {t('inv_all_families')}
              </button>
              {familyChips.map((f) => (
                <button key={f.key} onClick={() => setFamily(f.key)} aria-pressed={family === f.key} className={`chip min-h-[44px] ${family === f.key ? 'chip-on' : 'chip-off'}`}>
                  <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: f.dot }} />
                  {pick(f)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 mt-4 flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-[13px] font-semibold text-ink-500" aria-live="polite">
              {t('inv_count', { shown: list.length, total: polishes.length })}
              {counts.low > 0 && <span className="text-warn"> · {t('inv_count_low', { n: counts.low })}</span>}
              {counts.out > 0 && <span className="text-bad"> · {t('inv_count_out', { n: counts.out })}</span>}
            </p>
            {filtered && (
              <button onClick={clearFilters} className="inline-flex min-h-[44px] items-center gap-1 text-[14px] font-bold text-mocha">
                <X size={16} />
                {t('inv_clear_filters')}
              </button>
            )}
          </div>

          {list.length === 0 ? (
            <Empty
              icon={SearchX}
              title={t('inv_no_match_title')}
              text={t('inv_no_match_text')}
              action={
                <button className="btn-ghost" onClick={clearFilters}>
                  <X size={18} />
                  {t('inv_clear_filters')}
                </button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.slice(0, limit).map((p) => (
                <PolishCard key={p.id} p={p} currency={currency} onEdit={openEdit} onStep={step} />
              ))}
            </div>
          )}
          {list.length > limit && (
            <button className="btn-ghost mt-4 w-full" onClick={() => setLimit((l) => l + PAGE)}>
              {t('inv_show_more', { n: list.length - limit })}
            </button>
          )}
        </>
      )}

      {(isNew || editing) && <PolishForm key={editing ? editing.id : 'new'} open polish={editing} onClose={closeForm} />}
      {importOpen && <ImportCsv open onClose={closeImport} />}
    </div>
  )
}

const PolishCard = memo(function PolishCard({ p, currency, onEdit, onStep }) {
  const { t, pick, lang } = useI18n()
  const stock = hasStock(p) ? p.stock : 0
  const inactive = p.active === false
  const type = TYPE_BY_KEY[p.type]
  const meta = [p.brand, p.code].filter(Boolean).join(' · ')
  const stockTone = stock <= 0 ? 'text-bad' : stock <= LOW_AT ? 'text-warn' : 'text-ink'
  return (
    <div className={`card flex flex-col p-3 ${inactive ? 'bg-porcelain-50' : ''}`}>
      <button type="button" onClick={() => onEdit(p.id)} className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl p-1 text-start transition active:scale-[0.99]">
        <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={40} className={inactive ? 'opacity-60' : ''} />
        <span className="min-w-0 flex-1">
          {meta && (
            <span className="block truncate text-[12px] font-semibold text-ink-500" dir="auto">
              {meta}
            </span>
          )}
          <span className="block truncate text-[16px] font-bold leading-snug">{pick(p)}</span>
          <span className="block truncate text-[12px] text-ink-500">
            {t('finish_' + (p.finish || 'creme'))}
            {type ? ' · ' + pick(type) : ''}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {p.price !== undefined && p.price !== '' && <span className="text-[15px] font-bold">{money(p.price, lang, currency)}</span>}
          {inactive && <Badge>{t('inv_q_inactive')}</Badge>}
        </span>
      </button>
      <div className="mt-2 flex items-center gap-3 border-t border-ink/5 px-1 pt-3">
        <div className="min-w-0 flex-1">
          <span className={`block text-[12px] font-bold ${stock <= 0 ? 'text-bad' : stock <= LOW_AT ? 'text-warn' : 'text-ok'}`}>
            {stock <= 0 ? t('out_of_stock') : stock <= LOW_AT ? t('inv_low_badge') : t('in_stock')}
          </span>
          <AuditLine rec={p} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onStep(p, -1)}
            disabled={stock <= 0}
            className="icon-btn border border-ink/15 bg-white disabled:pointer-events-none disabled:opacity-30"
            aria-label={t('inv_stock_minus')}
          >
            <Minus size={20} />
          </button>
          <span key={stock} className={`min-w-[44px] animate-pop text-center font-display text-[30px] font-semibold leading-none ${stockTone}`} aria-label={`${t('stock')}: ${stock}`}>
            {stock}
          </span>
          <button type="button" onClick={() => onStep(p, 1)} className="icon-btn bg-ink text-porcelain" aria-label={t('inv_stock_plus')}>
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>
  )
})
