// CSV import / export: move the old Excel sheet in one step. Every row is validated (and previewed) before
// anything is written; Merge updates by brand + code, Append adds everything. Writes go through useData().actions.
import { useMemo, useRef, useState } from 'react'
import { Download, FileDown, FileUp, FileSpreadsheet, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Sheet, Segmented, Spinner, Badge, useToast } from '../components/ui'
import { NailSwatch } from '../components/NailSwatch'
import { parsePolishCsv, polishesToCsv, templateCsv, downloadText } from '../lib/csv'
import { money, todayKey } from '../lib/format'

const MAX_BYTES = 5 * 1024 * 1024
const PREVIEW = 8
const MAX_PROBLEMS = 30
const FIELD_LABEL = { name: 'inv_name', nameAr: 'inv_name_ar', brand: 'inv_brand', code: 'inv_code', hex: 'inv_hex', hex2: 'inv_hex2', price: 'inv_price', stock: 'stock' }
const MSG = { required: 'inv_csv_required', invalid_hex: 'inv_csv_invalid_hex', invalid_number: 'inv_csv_invalid_number', duplicate: 'inv_csv_duplicate' }

// Same key the data layer merges on (code|brand, lower-case).
const keyOf = (r) => String(r.code || '').toLowerCase() + '|' + String(r.brand || '').toLowerCase()

/** Decode the bytes the way Gulf salons actually save sheets: UTF-8 (± BOM), Excel "Unicode text" (UTF-16LE),
 *  or legacy Arabic Windows-1256 when UTF-8 decoding produces replacement characters. */
async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf)
  const text = new TextDecoder('utf-8').decode(buf)
  if (text.includes('�')) {
    try {
      return new TextDecoder('windows-1256').decode(buf)
    } catch {
      /* decoder unavailable: keep UTF-8 */
    }
  }
  return text
}

/** See PolishForm: offline Firestore writes are queued locally; don't spin forever waiting for the server. */
function settle(promise) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return promise
  promise.catch(() => {})
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('queued'), 1500))])
}

export default function ImportCsv({ open, onClose }) {
  const { t, pick, lang } = useI18n()
  const { staff, actions } = useData()
  const toast = useToast()
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null) // { rows, errors, total }
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mode, setMode] = useState('merge')
  const [busy, setBusy] = useState(false)

  const currency = staff.salon?.currency || 'OMR'
  const count = staff.polishes.length
  const existing = useMemo(() => new Set(staff.polishes.filter((p) => p.code).map(keyOf)), [staff.polishes])

  const rows = result?.rows || []
  const problems = result?.errors || []
  const isUpdate = (r) => mode === 'merge' && !!r.code && existing.has(keyOf(r))
  const plan = useMemo(() => {
    let upd = 0
    if (mode === 'merge') for (const r of rows) if (r.code && existing.has(keyOf(r))) upd++
    return { add: rows.length - upd, upd }
  }, [rows, mode, existing])

  const handleFile = async (file) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast(t('inv_file_too_big'), 'error', 4000)
      return
    }
    setReading(true)
    try {
      const res = parsePolishCsv(await readText(file))
      setFileName(file.name)
      setResult(res)
      if (!res.rows.length) toast(t('inv_import_none'), 'warn', 3500)
    } catch (x) {
      console.warn('[csv]', x)
      toast(t('inv_file_error'), 'error', 4000)
    } finally {
      setReading(false)
    }
  }

  const onPick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file after fixing it in Excel
    handleFile(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer?.files?.[0])
  }

  const downloadTemplate = () => {
    downloadText('nail-mirror-template.csv', templateCsv())
    toast(t('inv_template_done'))
  }

  const exportCurrent = () => {
    if (!count) return
    downloadText(`nail-mirror-inventory-${todayKey()}.csv`, polishesToCsv(staff.polishes))
    toast(t('inv_exported', { n: count }))
  }

  const doImport = async () => {
    if (!rows.length || busy) return
    setBusy(true)
    try {
      const res = await settle(actions.importPolishes(rows, mode))
      if (res === 'queued') toast(t('inv_saved_offline'), 'info', 3500)
      else toast(t('inv_import_done', { created: res.created, updated: res.updated }), 'ok', 3500)
      onClose()
    } catch (x) {
      console.warn('[import]', x)
      toast(t('inv_err_generic'), 'error', 4000)
      setBusy(false)
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('inv_import_title')}
      wide
      footer={
        rows.length > 0 ? (
          <button type="button" className="btn-primary w-full" onClick={doImport} disabled={busy}>
            {busy ? <Spinner size={18} /> : <FileUp size={18} />}
            {t('inv_import_cta', { n: rows.length })}
          </button>
        ) : null
      }
    >
      <p className="text-[14px] leading-relaxed text-ink-500">{t('inv_import_intro')}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost px-3 text-[14px]" onClick={downloadTemplate}>
          <Download size={18} className="shrink-0" />
          {t('inv_template')}
        </button>
        <button type="button" className="btn-ghost px-3 text-[14px]" onClick={exportCurrent} disabled={!count}>
          <FileDown size={18} className="shrink-0" />
          {t('inv_export_current', { n: count })}
        </button>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={reading || busy}
        className={`mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition active:scale-[0.99] ${
          dragging ? 'border-mocha bg-mocha-50' : 'border-ink/15 bg-white/70'
        }`}
      >
        {reading ? <Spinner size={28} className="text-mocha" /> : <FileSpreadsheet size={28} className="text-mocha" />}
        <span className="text-[16px] font-bold">{reading ? t('inv_reading') : fileName ? t('inv_change_file') : t('inv_choose_file')}</span>
        {fileName && !reading ? (
          <span className="max-w-full truncate text-[13px] text-ink-500" dir="auto">
            {fileName}
          </span>
        ) : (
          <span className="hidden text-[13px] text-ink-400 md:block">{t('inv_drop_hint')}</span>
        )}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv,.tsv,.txt,text/plain" className="hidden" onChange={onPick} tabIndex={-1} />

      {result && (
        <div className="mt-5 flex animate-rise flex-col gap-4">
          {/* summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-3xl border border-ink/5 p-4 shadow-soft ${rows.length ? 'bg-ok/10' : 'bg-white'}`}>
              <span className={`text-[13px] font-bold ${rows.length ? 'text-ok' : 'text-ink-500'}`}>{t('inv_valid_rows')}</span>
              <span className="mt-1 block font-display text-[40px] font-semibold leading-none">{rows.length}</span>
              <span className="mt-1 block text-[12px] text-ink-500">{t('inv_of_rows', { n: result.total })}</span>
            </div>
            <div className={`rounded-3xl border border-ink/5 p-4 shadow-soft ${problems.length ? 'bg-bad/10' : 'bg-white'}`}>
              <span className={`text-[13px] font-bold ${problems.length ? 'text-bad' : 'text-ink-500'}`}>{t('inv_problems', { n: problems.length })}</span>
              <span className="mt-1 block font-display text-[40px] font-semibold leading-none">{problems.length}</span>
              {rows.length > 0 && (
                <span className="mt-1 block text-[12px] text-ink-500">
                  {t('inv_will_add', { n: plan.add })}
                  {plan.upd > 0 ? ' · ' + t('inv_will_update', { n: plan.upd }) : ''}
                </span>
              )}
            </div>
          </div>

          {/* mode */}
          {rows.length > 0 && (
            <div>
              <span className="label">{t('inv_mode')}</span>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'merge', label: t('inv_mode_merge') },
                  { value: 'append', label: t('inv_mode_append') },
                ]}
              />
              <p className="mt-2 text-[12px] text-ink-500">{mode === 'merge' ? t('inv_mode_merge_hint') : t('inv_mode_append_hint')}</p>
            </div>
          )}

          {/* problems */}
          {problems.length > 0 && (
            <div className="rounded-3xl border border-bad/20 bg-bad/5 p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold text-bad">
                <AlertTriangle size={16} />
                {t('inv_problems', { n: problems.length })}
              </p>
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-[13px] text-ink-700">
                {problems.slice(0, MAX_PROBLEMS).map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 font-bold text-ink">{t('inv_line_no', { n: e.line })}</span>
                    <span>
                      {FIELD_LABEL[e.field] ? t(FIELD_LABEL[e.field]) : e.field} {MSG[e.msg] ? t(MSG[e.msg]) : e.msg}
                    </span>
                  </li>
                ))}
              </ul>
              {problems.length > MAX_PROBLEMS && <p className="mt-2 text-[12px] font-semibold text-ink-500">{t('inv_more_problems', { n: problems.length - MAX_PROBLEMS })}</p>}
            </div>
          )}

          {/* preview */}
          {rows.length > 0 && (
            <div>
              <h3 className="mb-2 font-display text-[22px] font-semibold">{t('inv_preview_rows')}</h3>
              <div className="card divide-y divide-ink/5">
                {rows.slice(0, PREVIEW).map((r, i) => {
                  const upd = isUpdate(r)
                  return (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <NailSwatch hex={r.hex} hex2={r.hex2} finish={r.finish} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold">{pick(r)}</p>
                        <p className="truncate text-[12px] text-ink-500">
                          <span dir="auto">{[r.brand, r.code].filter(Boolean).join(' · ')}</span>
                          {r.brand || r.code ? ' · ' : ''}
                          {t('finish_' + r.finish)}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-[13px] font-bold">{money(r.price, lang, currency)}</p>
                        <p className="text-[12px] text-ink-500">
                          {t('stock')}: {r.stock}
                        </p>
                      </div>
                      <Badge tone={upd ? 'glaze' : 'ok'} className="shrink-0">
                        {upd ? t('inv_badge_update') : t('inv_badge_new')}
                      </Badge>
                    </div>
                  )
                })}
              </div>
              {rows.length > PREVIEW && <p className="mt-2 text-[12px] font-semibold text-ink-500">{t('inv_more_rows', { n: rows.length - PREVIEW })}</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
