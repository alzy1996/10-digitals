// Reports: one Oman business day at a glance (KPIs, top shades, finish + shape mix, 7-day trend),
// plus the same day as a bilingual PDF, a CSV for Excel, or a clean printout.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { Inbox, Images, CalendarCheck, Percent, AlertTriangle, FileDown, FileSpreadsheet, Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, StatCard, REQUEST_STATUSES, LOOK_STATUSES } from './common'
import { NailSwatch } from '../components/NailSwatch'
import { Field, Spinner, useToast } from '../components/ui'
import { TZ, omanDayKey, omanDayRange, todayKey, dateTime, normalizePhone } from '../lib/format'
import { downloadText } from '../lib/csv'
import { paintsOf } from '../features/tryon/design'
import { FINISH_BY_KEY, SHAPE_BY_KEY } from '../data/taxonomy'

const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const BAR_MAX = 112 // px, tallest bar in the 7-day chart
const TOP_N = 8

// Print: hide the admin chrome (sidebar, top bar, bottom nav) and keep the colors of bars + swatches.
const PRINT_CSS = `@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; }
  aside, nav, header { display: none !important; }
  main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .rep-print, .rep-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rep-print .card, .rep-print section { break-inside: avoid; }
  .rep-print .shadow-soft { box-shadow: none !important; }
}`

// ------------------------------------------------------------------ helpers

const localeOf = (lang) => (lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB')

function isDayKey(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return y >= 2000 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** dayKey shifted by n Oman days (Muscat has no DST, so whole days are exact). */
function shiftDay(key, n) {
  return omanDayKey(omanDayRange(key)[0] + n * DAY + 12 * HOUR)
}

const msOf = (r) => {
  const n = Number(r?.createdAt)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Defensive copy of a stored design (old / partial records never crash the report). */
function safeDesign(d) {
  const x = d && typeof d === 'object' ? d : {}
  return { ...x, base: { finish: 'creme', ...(x.base || {}) }, perFinger: x.perFinger || {}, shape: x.shape || 'natural' }
}

const latinDigits = (s) => String(s ?? '').replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 15))

const STAMP = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** 'YYYY-MM-DD HH:mm' in Oman time: sortable, Excel-friendly. */
function omanStamp(ms) {
  if (!ms) return ''
  const p = Object.fromEntries(STAMP.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1)
const sortedRows = (m) => [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || (a.key === 'other') - (b.key === 'other'))

// ------------------------------------------------------------------ page

export default function Reports() {
  const { t, pick, lang, isAr } = useI18n()
  const { staff } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const today = todayKey()
  const yesterday = shiftDay(today, -1)

  const [input, setInput] = useState(today)
  const [dayKey, setDayKey] = useState(today)
  const [dayErr, setDayErr] = useState('') // i18n key, so the message follows a language switch
  const [busy, setBusy] = useState(false)

  const pickDay = (v) => {
    setInput(v)
    if (!isDayKey(v)) return setDayErr('rep_err_day_invalid')
    if (v > today) return setDayErr('rep_err_day_future')
    setDayErr('')
    setDayKey(v)
  }

  const fmt = useMemo(() => {
    const loc = localeOf(lang)
    return {
      long: new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      dayLong: new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }),
      wdShort: new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'short' }),
      wdNarrow: new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'narrow' }),
      dayNum: new Intl.DateTimeFormat(loc, { timeZone: TZ, day: 'numeric' }),
      pct: new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 }),
    }
  }, [lang])

  const R = useMemo(() => {
    const [start, end] = omanDayRange(dayKey)
    const inDay = (r) => {
      const ms = msOf(r)
      return ms >= start && ms < end
    }
    const byTime = (a, b) => msOf(a) - msOf(b)
    const requests = staff.requests.filter(inDay).sort(byTime)
    const looks = staff.looks.filter(inDay).sort(byTime)
    const all = [...requests, ...looks]
    const booked = all.filter((r) => r.status === 'booked').length
    const conversion = all.length ? booked / all.length : null
    const low = staff.polishes.filter((p) => p.active !== false && typeof p.stock === 'number' && p.stock <= 2).length

    // shades + finishes are counted per color used (base + accent nails); shapes per look
    const shades = new Map()
    const finishes = new Map()
    const shapes = new Map()
    let paints = 0
    for (const r of all) {
      const d = safeDesign(r.design)
      inc(shapes, SHAPE_BY_KEY[d.shape] ? d.shape : 'other')
      for (const p of paintsOf(d)) {
        if (!p.hex) continue
        paints++
        inc(finishes, FINISH_BY_KEY[p.finish] ? p.finish : 'other')
        const key = (p.polishId || p.hex) + '|' + p.finish
        const e = shades.get(key) || { n: 0, p }
        e.n++
        shades.set(key, e)
      }
    }
    const top = [...shades.values()].sort((a, b) => b.n - a.n).slice(0, TOP_N)

    // last 7 Oman days, ending on the report day
    const weekStart = start - 6 * DAY
    const week = Array.from({ length: 7 }, (_, i) => {
      const s = weekStart + i * DAY
      return { key: omanDayKey(s + 12 * HOUR), mid: s + 12 * HOUR, requests: 0, looks: 0 }
    })
    const bucket = (list, field) => {
      for (const r of list) {
        const ms = msOf(r)
        if (ms < weekStart || ms >= end) continue
        week[Math.floor((ms - weekStart) / DAY)][field]++
      }
    }
    bucket(staff.requests, 'requests')
    bucket(staff.looks, 'looks')
    const weekMax = Math.max(1, ...week.map((d) => d.requests + d.looks))

    return { start, requests, looks, all, booked, conversion, low, top, paints, finishes: sortedRows(finishes), shapes: sortedRows(shapes), week, weekMax }
  }, [staff.requests, staff.looks, staff.polishes, dayKey])

  const longDay = fmt.long.format(new Date(R.start + 12 * HOUR))
  const atLimit = staff.requests.length >= 300 || staff.looks.length >= 300

  // ---------------------------------------------------------------- exports
  const downloadPdf = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { dailyReportPdf } = await import('../lib/pdf')
      const doc = await dailyReportPdf({ salon: staff.salon, dayKey, requests: R.requests, looks: R.looks, polishes: staff.polishes, auditCount: staff.audit.length, lang, t, pick })
      doc.save('report-' + dayKey + '.pdf')
      toast(t('rep_pdf_ready'))
    } catch (e) {
      console.warn('[report pdf]', e)
      toast(t('rep_pdf_failed'), 'error', 4000)
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const rows = [...R.requests.map((r) => ['request', r]), ...R.looks.map((r) => ['look', r])].sort((a, b) => msOf(a[1]) - msOf(b[1]))
    if (!rows.length) return toast(t('rep_csv_empty'), 'warn')
    try {
      const fields = ['rep_col_type', 'rep_col_created', 'rep_col_customer', 'rep_col_phone', 'rep_col_status', 'rep_col_shades', 'rep_col_finish', 'rep_col_shape', 'rep_col_technician'].map((k) => t(k))
      const data = rows.map(([kind, r]) => {
        const d = safeDesign(r.design)
        const paints = paintsOf(d).filter((p) => p.hex || p.name)
        const statuses = kind === 'request' ? REQUEST_STATUSES : LOOK_STATUSES
        const status = statuses.includes(r.status) ? r.status : statuses[0]
        const shades = paints
          .map((p) => {
            const where = p.where === 'all' ? t('all_nails') : t('finger_' + p.where)
            const name = [p.brand, pick(p)].filter(Boolean).join(' ')
            return `${where}: ${name || p.hex}${p.code ? ' (' + p.code + ')' : ''}`
          })
          .join(' | ')
        const finishes = [...new Set(paints.map((p) => p.finish))].map((f) => (FINISH_BY_KEY[f] ? t('finish_' + f) : t('rep_other'))).join(', ')
        return [
          t(kind === 'request' ? 'rep_type_request' : 'rep_type_look'),
          omanStamp(msOf(r)),
          r.customerName || t('guest'),
          normalizePhone(latinDigits(r.customerPhone)),
          t('status_' + status),
          shades,
          finishes,
          SHAPE_BY_KEY[d.shape] ? t('shape_' + d.shape) : t('rep_other'),
          kind === 'look' ? r.createdByName || '' : r.updatedByName || '',
        ]
      })
      // escapeFormulae: customer-typed names must never run as spreadsheet formulas
      const csv = Papa.unparse({ fields, data }, { escapeFormulae: true })
      downloadText('report-' + dayKey + '.csv', csv)
      toast(t('rep_csv_ready', { n: rows.length }))
    } catch (e) {
      console.warn('[report csv]', e)
      toast(t('rep_csv_failed'), 'error', 4000)
    }
  }

  const doPrint = () => {
    try {
      window.print()
    } catch {
      toast(t('rep_print_failed'), 'error')
    }
  }

  // ---------------------------------------------------------------- render
  return (
    <div className="rep-print animate-rise">
      <style>{PRINT_CSS}</style>

      <div className="mb-3 hidden print:block">
        <p className="font-display text-[26px] font-semibold leading-tight">{pick(staff.salon || {})}</p>
        <p className="text-[12px] text-ink-500">{t('rep_printed', { when: dateTime(Date.now(), lang) })}</p>
      </div>

      <PageHeader
        eyebrow={longDay}
        title={t('rep_title')}
        subtitle={t('rep_subtitle')}
        actions={
          <>
            <button className="btn-primary flex-1 px-4 sm:flex-none sm:px-6 print:hidden" onClick={downloadPdf} disabled={busy} aria-busy={busy}>
              {busy ? <Spinner size={18} /> : <FileDown size={18} />}
              {busy ? t('rep_pdf_busy') : t('rep_pdf')}
            </button>
            <button className="btn-ghost flex-1 px-4 sm:flex-none sm:px-6 print:hidden" onClick={exportCsv}>
              <FileSpreadsheet size={18} />
              {t('rep_csv')}
            </button>
            <button className="btn-ghost flex-1 px-4 sm:flex-none sm:px-6 print:hidden" onClick={doPrint}>
              <Printer size={18} />
              {t('print')}
            </button>
          </>
        }
      />

      {/* day picker */}
      <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-start print:hidden">
        <Field label={t('rep_day')} hint={t('rep_day_hint')} error={dayErr ? t(dayErr) : null} className="flex-1 sm:max-w-xs">
          <input type="date" dir="ltr" className="field text-start" value={input} max={today} onChange={(e) => pickDay(e.target.value)} aria-invalid={!!dayErr} />
        </Field>
        <div className="flex items-center gap-2 sm:mt-[25px]">
          <button type="button" className="icon-btn border border-ink/15 bg-white" onClick={() => pickDay(shiftDay(dayKey, -1))} aria-label={t('rep_prev_day')}>
            <ChevronLeft size={20} className="rtl:rotate-180" />
          </button>
          <button type="button" className={`chip flex-1 justify-center sm:flex-none ${dayKey === today && !dayErr ? 'chip-on' : 'chip-off'}`} onClick={() => pickDay(today)} aria-pressed={dayKey === today}>
            {t('rep_today')}
          </button>
          <button
            type="button"
            className={`chip flex-1 justify-center sm:flex-none ${dayKey === yesterday && !dayErr ? 'chip-on' : 'chip-off'}`}
            onClick={() => pickDay(yesterday)}
            aria-pressed={dayKey === yesterday}
          >
            {t('rep_yesterday')}
          </button>
          <button type="button" className="icon-btn border border-ink/15 bg-white disabled:opacity-40" onClick={() => pickDay(shiftDay(dayKey, 1))} disabled={dayKey >= today} aria-label={t('rep_next_day')}>
            <ChevronRight size={20} className="rtl:rotate-180" />
          </button>
        </div>
      </div>
      {atLimit && <p className="-mt-4 mb-6 px-1 text-[12px] text-ink-400 print:hidden">{t('rep_scope_note')}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5">
        <StatCard label={t('kpi_requests')} value={R.requests.length} icon={Inbox} hint={t('rep_kpi_requests_hint')} />
        <StatCard label={t('kpi_looks')} value={R.looks.length} icon={Images} hint={t('rep_kpi_looks_hint')} />
        <StatCard label={t('kpi_booked')} value={R.booked} icon={CalendarCheck} tone="glaze" hint={t('rep_kpi_booked_hint')} />
        <StatCard label={t('rep_kpi_conversion')} value={R.conversion === null ? '—' : fmt.pct.format(R.conversion)} icon={Percent} tone={R.conversion ? 'mocha' : 'ink'} hint={t('rep_kpi_conversion_hint')} />
        <div className="col-span-2 grid sm:col-span-1 print:col-span-1">
          <StatCard label={t('kpi_low_stock')} value={R.low} icon={AlertTriangle} tone={R.low ? 'warn' : 'ink'} hint={t('rep_kpi_low_hint')} onClick={() => navigate('/admin/inventory?filter=low')} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] print:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {/* last 7 days */}
          <section>
            <h2 className="font-display text-[28px] font-semibold">{t('rep_week')}</h2>
            <p className="mb-3 text-[13px] text-ink-500">{t('rep_week_hint')}</p>
            <div className="card p-2 sm:p-4">
              <div className="flex items-end gap-0.5 sm:gap-2">
                {R.week.map((d) => {
                  const total = d.requests + d.looks
                  const h = total ? Math.max(6, Math.round((total / R.weekMax) * BAR_MAX)) : 4
                  const sel = d.key === dayKey
                  const when = new Date(d.mid)
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => pickDay(d.key)}
                      aria-pressed={sel}
                      aria-label={t('rep_bar_label', { day: fmt.dayLong.format(when), requests: d.requests, looks: d.looks })}
                      className={`flex min-h-[44px] min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-0.5 pb-1.5 pt-2 transition active:scale-95 ${sel ? 'bg-mocha-50' : 'hover:bg-ink/5'}`}
                    >
                      <span className={`text-[12px] font-bold tabular-nums ${sel ? 'text-ink' : 'text-ink-500'}`}>{total}</span>
                      <span className="flex w-full items-end justify-center" style={{ height: BAR_MAX }}>
                        <span className={`flex w-full max-w-[36px] flex-col overflow-hidden rounded-t-lg rounded-b-sm ${total ? '' : 'bg-ink/10'}`} style={{ height: h }}>
                          {d.looks > 0 && <span className="block bg-champagne-300" style={{ flex: `${d.looks} 1 0px` }} />}
                          {d.requests > 0 && <span className="block bg-mocha" style={{ flex: `${d.requests} 1 0px` }} />}
                        </span>
                      </span>
                      <span className={`max-w-full truncate text-[12px] font-bold ${sel ? 'text-ink' : 'text-ink-500'}`}>
                        <span className="sm:hidden">{(isAr ? fmt.wdNarrow : fmt.wdShort).format(when)}</span>
                        <span className="hidden sm:inline">{fmt.wdShort.format(when)}</span>
                      </span>
                      <span className="text-[11px] tabular-nums text-ink-400">{fmt.dayNum.format(when)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink/5 px-2 pt-3 text-[12px] font-semibold text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-mocha" />
                  {t('rep_legend_requests')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-champagne-300" />
                  {t('rep_legend_looks')}
                </span>
              </div>
            </div>
          </section>

          {/* top shades of the day */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('rep_top_shades_day')}</h2>
            {R.top.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-ink/15 p-5 text-[14px] text-ink-500">{t('no_data_day')}</p>
            ) : (
              <div className="card divide-y divide-ink/5">
                {R.top.map(({ n, p }) => (
                  <div key={(p.polishId || p.hex) + '|' + p.finish} className="flex items-center gap-3 p-3">
                    <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold">{pick(p) || p.hex}</p>
                      <p className="truncate text-[12px] text-ink-500">
                        {[p.brand, p.code].filter(Boolean).join(' · ')}
                        {(p.brand || p.code) && ' · '}
                        {FINISH_BY_KEY[p.finish] ? t('finish_' + p.finish) : t('rep_other')}
                      </p>
                    </div>
                    <span className="text-[14px] font-bold text-mocha">× {n}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Breakdown
            title={t('rep_finishes')}
            hint={t('rep_finishes_hint')}
            rows={R.finishes}
            total={R.paints}
            labelOf={(k) => (k === 'other' ? t('rep_other') : t('finish_' + k))}
            barClass="bg-mocha"
            pct={fmt.pct}
            emptyText={t('no_data_day')}
          />
          <Breakdown
            title={t('rep_shapes')}
            hint={t('rep_shapes_hint')}
            rows={R.shapes}
            total={R.all.length}
            labelOf={(k) => (k === 'other' ? t('rep_other') : t('shape_' + k))}
            barClass="bg-glaze-500"
            pct={fmt.pct}
            emptyText={t('no_data_day')}
          />
        </div>
      </div>
    </div>
  )
}

/** Pure-CSS horizontal bars: label, count, percentage. Bars grow from the reading-start edge (RTL-safe). */
function Breakdown({ title, hint, rows, total, labelOf, barClass, pct, emptyText }) {
  return (
    <section>
      <h2 className="font-display text-[28px] font-semibold">{title}</h2>
      <p className="mb-3 text-[13px] text-ink-500">{hint}</p>
      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 p-5 text-[14px] text-ink-500">{emptyText}</p>
      ) : (
        <div className="card flex flex-col gap-3 p-4">
          {rows.map((r) => {
            const share = total ? r.n / total : 0
            return (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px] font-semibold">{labelOf(r.key)}</span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums">
                    <bdi>{r.n}</bdi>
                    <span className="mx-1.5 text-ink-300">·</span>
                    <bdi className="text-ink-500">{pct.format(share)}</bdi>
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink/5">
                  <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(2, Math.round(share * 1000) / 10)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
