// Customer requests and staff consultations ("looks") share one record shape, so they share this UI:
// the list board (status tabs with counts, search, quick WhatsApp / call / status actions) and the detail
// sheet (photo, colors, look facts, AI skin match, editable contact + note + status, PDF card, delete).
// WhatsApp replies are written in the language the record was created in (record.lang), not the staff UI language.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MessageCircle, Phone, CalendarClock, Maximize2, SearchX, Pencil, Check, Trash2, FileText, Sparkles, ScanFace, Languages, UserRound } from 'lucide-react'
import { useI18n, I18N_DICTS } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Sheet, Field, Badge, Empty, Confirm, Spinner, useToast } from '../components/ui'
import { NailSwatch } from '../components/NailSwatch'
import { PageHeader, SearchInput, StatusChip, AuditLine, REQUEST_STATUSES, LOOK_STATUSES } from './common'
import { relTime, dateTime, waLink, normalizePhone, omanDayKey, todayKey } from '../lib/format'
import { isHex } from '../lib/color'
import { consultationPdf } from '../lib/pdf'
import { paintsOf, designSummary } from '../features/tryon/design'
import { FINISH_BY_KEY, SHAPE_BY_KEY, TYPE_BY_KEY, DEPTH_BY_KEY, UNDERTONE_BY_KEY, ART, MONK_SCALE } from '../data/taxonomy'

const PAGE_SIZE = 24
const NOTE_MAX = 300
const NAME_MAX = 60

export const RECORD_KINDS = {
  request: {
    col: 'requests',
    statuses: REQUEST_STATUSES,
    first: 'new',
    update: 'updateRequest',
    remove: 'deleteRequest',
    inboxFirst: true, // open on "new" while anything is waiting
    autoContact: true, // opening WhatsApp on a "new" request marks it "contacted"
    showTech: false,
    titleKey: 'rec_req_title',
    subKey: 'rec_req_sub',
    whenKey: 'rec_received',
    delKey: 'rec_delete_request',
    delTitleKey: 'rec_delete_title_request',
  },
  look: {
    col: 'looks',
    statuses: LOOK_STATUSES,
    first: 'saved',
    update: 'updateLook',
    remove: 'deleteLook',
    inboxFirst: false,
    autoContact: false,
    showTech: true,
    titleKey: 'rec_look_title',
    subKey: 'rec_look_sub',
    whenKey: 'rec_saved_at',
    delKey: 'rec_delete_look',
    delTitleKey: 'rec_delete_title_look',
  },
}

// ------------------------------------------------------------------ helpers

export function statusOf(rec, K) {
  return K.statuses.includes(rec?.status) ? rec.status : K.first
}

/** Defensive copy of a stored design (old / partial records never crash the UI). */
export function safeDesign(d) {
  const x = d && typeof d === 'object' ? d : {}
  return {
    ...x,
    base: { finish: 'creme', ...(x.base || {}) },
    perFinger: x.perFinger || {},
    shape: x.shape || 'natural',
    length: Number(x.length) || 0,
    art: x.art || 'none',
  }
}

export function lengthKey(v) {
  const n = Number(v) || 0
  if (n < 0.09) return 'natural'
  if (n < 0.3) return 'short'
  if (n < 0.6) return 'medium'
  if (n < 0.9) return 'long'
  return 'xl'
}

const latinDigits = (s) => String(s ?? '').replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 15))

/** International digits for wa.me / tel: (Omani 8-digit numbers get 968). */
export function phoneDigits(p) {
  return normalizePhone(latinDigits(p))
}

export function prettyPhone(p) {
  const d = phoneDigits(p)
  if (!d) return ''
  if (d.startsWith('968') && d.length === 11) return `+968 ${d.slice(3, 7)} ${d.slice(7)}`
  return d.length > 8 ? '+' + d : d
}

export function telHref(p) {
  const d = phoneDigits(p)
  return d ? 'tel:' + (d.length > 8 ? '+' : '') + d : null
}

/** No spaces: keeps the number in one piece inside RTL text (PDF canvas). */
const printablePhone = (p) => {
  const d = phoneDigits(p)
  return d.length > 8 ? '+' + d : d
}

/** Search folding: lower-case, Latin digits, Arabic letter variants + diacritics unified. */
function fold(s) {
  return latinDigits(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}

function searchTokens(q) {
  return fold(q)
    .split(/\s+/)
    .map((x) => x.replace(/^\+/, ''))
    .filter(Boolean)
}

function haystack(r) {
  const parts = [r.customerName, r.customerPhone, phoneDigits(r.customerPhone), r.note, r.preferredDate, r.createdByName]
  for (const p of paintsOf(safeDesign(r.design))) parts.push(p.name, p.nameAr, p.brand, p.code)
  return fold(parts.filter(Boolean).join(' '))
}

function countBy(list, K) {
  const c = { all: list.length }
  for (const s of K.statuses) c[s] = 0
  for (const r of list) c[statusOf(r, K)]++
  return c
}

/** t() / pick() bound to a fixed language (for WhatsApp text in the customer's language). */
function translatorFor(lang) {
  const dict = I18N_DICTS[lang] || I18N_DICTS.en
  return (key, params) => {
    let s = dict[key] ?? I18N_DICTS.en[key] ?? key
    if (params) for (const k in params) s = s.replaceAll('{' + k + '}', params[k])
    return s
  }
}
function pickerFor(lang) {
  return (obj, field = 'name') => {
    if (!obj) return ''
    if (obj.en !== undefined || obj.ar !== undefined) return (lang === 'ar' ? obj.ar : obj.en) || obj.en || obj.ar || ''
    const arKey = field + 'Ar'
    return (lang === 'ar' ? obj[arKey] : obj[field]) || obj[field] || obj[arKey] || ''
  }
}

/** WhatsApp message in the record's language: greeting + shade summary + preferred time. */
export function waMessage(rec, kind, salon, fallbackLang = 'en') {
  const L = rec.lang === 'ar' || rec.lang === 'en' ? rec.lang : fallbackLang
  const t = translatorFor(L)
  const pick = pickerFor(L)
  const name = String(rec.customerName || '').trim()
  const lines = [
    name ? t('rec_wa_hello_name', { name }) : t('rec_wa_hello'),
    t(kind === 'look' ? 'rec_wa_look_intro' : 'rec_wa_req_intro', { salon: pick(salon || {}) || t('rec_wa_salon_fallback') }),
    designSummary(safeDesign(rec.design), t, pick),
  ]
  if (rec.preferredDate) lines.push(t('rec_wa_preferred', { date: rec.preferredDate }))
  lines.push('', t(kind === 'look' ? 'rec_wa_look_outro' : 'rec_wa_req_outro'))
  return lines.join('\n')
}

export function waHref(rec, kind, salon, fallbackLang) {
  const d = phoneDigits(rec.customerPhone)
  return d ? waLink(d, waMessage(rec, kind, salon, fallbackLang)) : null
}

function pdfFileName(rec) {
  const who =
    String(rec.customerName || 'guest')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'guest'
  return `consultation-${who}-${omanDayKey(rec.createdAt || Date.now())}.pdf`
}

/** Label for a key the studio agent owns, with our own fallback if it is not defined. */
function useLabelOr() {
  const { t } = useI18n()
  return (key, fallbackKey) => (I18N_DICTS.en[key] ? t(key) : t(fallbackKey))
}

/**
 * Await a write with instant feedback. Firestore resolves only after the server confirms; offline the change is
 * already applied locally (and synced later), so after a short wait we tell the user it is safe on this device.
 */
function useCommit() {
  const toast = useToast()
  const { t } = useI18n()
  return useCallback(
    async (promise, okMsg, errKey = 'rec_err_save') => {
      const p = Promise.resolve(promise)
      try {
        const res = await Promise.race([p.then(() => 'ok'), new Promise((r) => setTimeout(() => r('pending'), 1800))])
        if (res === 'pending') {
          toast(t('rec_pending_sync'), 'info', 3500)
          p.catch((e) => {
            console.warn(e)
            toast(t(errKey), 'error', 4500)
          })
        } else if (okMsg) toast(okMsg)
        return true
      } catch (e) {
        console.warn(e)
        toast(t(errKey), 'error', 4500)
        return false
      }
    },
    [toast, t],
  )
}

// ------------------------------------------------------------------ small pieces

function Thumb({ rec, className = '', swatch = 34, rounded = 'rounded-2xl', alt = '' }) {
  const base = safeDesign(rec.design).base
  return (
    <div className={`relative aspect-[3/4] overflow-hidden bg-porcelain-200 ${rounded} ${className}`}>
      {rec.thumb ? (
        <img src={rec.thumb} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <NailSwatch hex={base.hex} hex2={base.hex2} finish={base.finish} size={swatch} />
        </div>
      )}
    </div>
  )
}

/** Status changer: one tap = new status. */
function StatusPicker({ statuses, value, onChange, disabled = false }) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('rec_status')} className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {statuses.map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(s)}
            className={`chip min-h-[44px] flex-1 justify-center px-3 text-[13px] disabled:opacity-60 ${on ? 'chip-on' : 'chip-off'}`}
          >
            {on && <Check size={14} />}
            {t('status_' + s)}
          </button>
        )
      })}
    </div>
  )
}

/** <a> when there is a target, otherwise a disabled button with the same look. */
function ActionLink({ href, external = false, onClick, className, children, label }) {
  if (!href)
    return (
      <button type="button" disabled className={className} aria-label={label}>
        {children}
      </button>
    )
  return (
    <a href={href} onClick={onClick} className={className} aria-label={label} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  )
}

function MonkScale({ level }) {
  const { t } = useI18n()
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] font-semibold text-ink-500">{t('rec_monk_scale')}</p>
      <div className="flex items-center gap-1.5">
        {MONK_SCALE.map((m) => (
          <span
            key={m.level}
            title={String(m.level)}
            className={`block aspect-square min-w-0 max-w-[30px] flex-1 rounded-full border ${m.level === level ? 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-glaze-50' : 'border-ink/10'}`}
            style={{ background: m.hex }}
          />
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ list card

function RecordCard({ rec, kind, salon, busy, onOpen, onStatus, onWhatsApp }) {
  const K = RECORD_KINDS[kind]
  const { t, pick, lang } = useI18n()
  const paints = paintsOf(safeDesign(rec.design))
  const base = paints[0]
  const status = statusOf(rec, K)
  const name = String(rec.customerName || '').trim() || t('guest')
  const phone = prettyPhone(rec.customerPhone)
  const finish = pick(FINISH_BY_KEY[base.finish] || {}) || base.finish

  return (
    <article className="card flex flex-col gap-3 p-3">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-2xl text-start">
        <Thumb rec={rec} className="w-[84px] shrink-0" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[16px] font-bold leading-snug">
              <bdi>{name}</bdi>
            </p>
            <StatusChip status={status} />
          </div>
          {phone ? (
            <p className="mt-0.5 text-[13px] font-semibold text-ink-500">
              <span dir="ltr">{phone}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-ink-400">{t('rec_no_phone')}</p>
          )}
          {rec.preferredDate && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink-700">
              <CalendarClock size={14} className="shrink-0 text-mocha" />
              <span className="truncate">
                <bdi>{rec.preferredDate}</bdi>
              </span>
            </p>
          )}
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <NailSwatch hex={base.hex} hex2={base.hex2} finish={base.finish} size={16} />
            <p className="min-w-0 truncate text-[13px] font-semibold">
              {pick(base) || base.code || '—'} <span className="font-normal text-ink-500">· {finish}</span>
            </p>
            {paints.length > 1 && <Badge className="shrink-0">+{paints.length - 1}</Badge>}
          </div>
          <p className="mt-1.5 flex min-w-0 items-center gap-1 text-[12px] text-ink-400">
            <span className="shrink-0">{relTime(rec.createdAt, lang)}</span>
            {K.showTech && rec.createdByName && (
              <>
                <span aria-hidden>·</span>
                <UserRound size={12} className="shrink-0" />
                <span className="truncate">
                  <bdi>{rec.createdByName}</bdi>
                </span>
              </>
            )}
          </p>
        </div>
      </button>

      <StatusPicker statuses={K.statuses} value={status} onChange={(s) => onStatus(rec, s)} disabled={busy} />

      <div className="flex gap-2">
        <ActionLink
          href={waHref(rec, kind, salon, lang)}
          external
          onClick={() => onWhatsApp(rec)}
          className="btn min-h-[44px] flex-1 bg-ok/10 px-3 text-[14px] text-ok hover:bg-ok/15"
        >
          <MessageCircle size={18} />
          {t('whatsapp')}
        </ActionLink>
        <ActionLink href={telHref(rec.customerPhone)} className="btn-ghost min-h-[44px] flex-1 px-3 text-[14px]">
          <Phone size={17} />
          {t('rec_call')}
        </ActionLink>
        <button type="button" onClick={onOpen} className="icon-btn h-11 w-11 shrink-0 bg-ink/5" aria-label={t('rec_open')} title={t('rec_open')}>
          <Maximize2 size={18} />
        </button>
      </div>
    </article>
  )
}

// ------------------------------------------------------------------ list board (Requests + Looks pages)

export function RecordsBoard({ kind, actions: headerActions, empty }) {
  const K = RECORD_KINDS[kind]
  const { t } = useI18n()
  const { staff, actions } = useData()
  const commit = useCommit()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = staff[K.col] || []
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(() => {
    const s = params.get('status')
    return s === 'all' || K.statuses.includes(s) ? s : null // null = automatic
  })
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [busyId, setBusyId] = useState(null)
  const pushed = useRef(false)
  const openId = params.get('open')

  useEffect(() => {
    if (!openId) pushed.current = false
  }, [openId])
  useEffect(() => setLimit(PAGE_SIZE), [q, tab])

  const hay = useMemo(() => new Map(list.map((r) => [r.id, haystack(r)])), [list])
  const searched = useMemo(() => {
    const toks = searchTokens(q)
    if (!toks.length) return list
    return list.filter((r) => {
      const h = hay.get(r.id) || ''
      return toks.every((x) => h.includes(x))
    })
  }, [list, hay, q])
  const countsAll = useMemo(() => countBy(list, K), [list, K])
  const counts = useMemo(() => countBy(searched, K), [searched, K])

  const active = tab ?? (q.trim() ? 'all' : K.inboxFirst && countsAll[K.first] ? K.first : 'all')
  const shown = active === 'all' ? searched : searched.filter((r) => statusOf(r, K) === active)
  const record = openId ? list.find((r) => r.id === openId) || null : null

  const today = todayKey()
  const eyebrow =
    kind === 'request'
      ? countsAll.new
        ? t('rec_req_eyebrow_new', { n: countsAll.new })
        : t('rec_req_eyebrow_clear')
      : t('rec_look_eyebrow', { n: list.filter((r) => r.createdAt && omanDayKey(r.createdAt) === today).length })

  // The open record lives in the URL (?open=id): the phone's back button closes the sheet, links can deep-open it.
  const openRecord = (id) => {
    pushed.current = true
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.set('open', id)
      return n
    })
  }
  const closeRecord = () => {
    if (pushed.current) {
      pushed.current = false
      navigate(-1)
    } else {
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          n.delete('open')
          return n
        },
        { replace: true },
      )
    }
  }

  const changeStatus = async (rec, status) => {
    setBusyId(rec.id)
    await commit(actions[K.update](rec.id, { status }), t('rec_status_updated', { status: t('status_' + status) }))
    setBusyId(null)
  }
  const onWhatsApp = (rec) => {
    if (K.autoContact && statusOf(rec, K) === 'new') changeStatus(rec, 'contacted')
  }

  const tabs = [...K.statuses, 'all']

  return (
    <div className="animate-rise">
      <PageHeader eyebrow={eyebrow} title={t(K.titleKey)} subtitle={t(K.subKey)} actions={headerActions} />

      {list.length === 0 ? (
        empty
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:order-last md:w-80 md:shrink-0">
              <SearchInput value={q} onChange={setQ} placeholder={t('rec_search_ph')} />
            </div>
            <div role="tablist" aria-label={t('rec_status_tabs')} className="no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-1 md:px-0">
              {tabs.map((s) => {
                const on = active === s
                const n = counts[s] || 0
                return (
                  <button key={s} type="button" role="tab" aria-selected={on} onClick={() => setTab(s)} className={`chip min-h-[44px] ${on ? 'chip-on' : 'chip-off'}`}>
                    {s === 'all' ? t('all') : t('status_' + s)}
                    <span
                      className={`min-w-[24px] rounded-full px-1.5 py-0.5 text-center text-[12px] font-bold ${
                        on ? 'bg-white/20 text-white' : s === 'new' && n ? 'bg-bad text-white' : 'bg-ink/5 text-ink-500'
                      }`}
                    >
                      {n}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {shown.length === 0 ? (
            <Empty
              icon={SearchX}
              title={t('rec_filter_empty_title')}
              text={t('rec_filter_empty_text')}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {q && (
                    <button type="button" className="btn-ghost" onClick={() => setQ('')}>
                      {t('rec_clear_search')}
                    </button>
                  )}
                  {active !== 'all' && (
                    <button type="button" className="btn-ghost" onClick={() => setTab('all')}>
                      {t('rec_show_all')}
                    </button>
                  )}
                </div>
              }
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {shown.slice(0, limit).map((r) => (
                  <RecordCard
                    key={r.id}
                    rec={r}
                    kind={kind}
                    salon={staff.salon}
                    busy={busyId === r.id}
                    onOpen={() => openRecord(r.id)}
                    onStatus={changeStatus}
                    onWhatsApp={onWhatsApp}
                  />
                ))}
              </div>
              {shown.length > limit && (
                <div className="mt-5 flex justify-center">
                  <button type="button" className="btn-ghost" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                    {t('rec_show_more', { n: shown.length - limit })}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* keyed by id: every record opens with a fresh, unedited form */}
      <RecordDetail key={record?.id || 'none'} kind={kind} record={record} onClose={closeRecord} onDeleted={closeRecord} />
    </div>
  )
}

// ------------------------------------------------------------------ detail sheet

function cleanValue(k, v) {
  const s = String(v ?? '')
  if (k === 'customerPhone') return s.trim() ? phoneDigits(s) : ''
  if (k === 'customerName' || k === 'note') return s.trim()
  return s
}

export default function RecordDetail({ kind = 'request', record, onClose, onDeleted }) {
  const K = RECORD_KINDS[kind] || RECORD_KINDS.request
  const { t, pick, lang } = useI18n()
  const { staff, actions } = useData()
  const toast = useToast()
  const commit = useCommit()
  const [edits, setEdits] = useState({})
  const [errors, setErrors] = useState({})
  const [editContact, setEditContact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  if (!record) return null

  // Untouched fields always show the live value (another device may change them while this is open).
  const orig = {
    customerName: record.customerName || '',
    customerPhone: record.customerPhone || '',
    note: record.note || '',
    status: statusOf(record, K),
  }
  const val = (k) => (k in edits ? edits[k] : orig[k])
  const setVal = (k, v) => {
    setEdits((e) => ({ ...e, [k]: v }))
    setErrors((er) => (er[k] ? { ...er, [k]: undefined } : er))
  }
  const patch = {}
  for (const k of Object.keys(edits)) {
    const v = cleanValue(k, edits[k])
    if (v !== cleanValue(k, orig[k])) patch[k] = v
  }
  const dirty = Object.keys(patch).length > 0

  const design = safeDesign(record.design)
  const paints = paintsOf(design)
  const base = paints[0]
  const view = { ...record, customerName: cleanValue('customerName', val('customerName')), customerPhone: val('customerPhone'), note: val('note') }
  const name = view.customerName || t('guest')
  const phone = prettyPhone(view.customerPhone)
  const a = record.analysis
  const hasAI = !!a && (!!a.depth || !!a.monk || isHex(a.hex))
  const type = TYPE_BY_KEY[design.type]
  const art = ART.find((x) => x.key === design.art)
  const fromStaff = record.source ? record.source === 'staff' : kind === 'look'
  const studioHref = base.polishId ? `/try?shade=${encodeURIComponent(base.polishId)}` : '/try'

  const validate = () => {
    const e = {}
    if ('customerName' in edits && cleanValue('customerName', edits.customerName).length > NAME_MAX) e.customerName = t('rec_err_name_long', { max: NAME_MAX })
    if ('customerPhone' in edits) {
      const raw = String(edits.customerPhone || '').trim()
      const d = phoneDigits(raw)
      if (raw && (/[^0-9+\s\-().٠-٩۰-۹]/.test(raw) || d.length < 8 || d.length > 15)) e.customerPhone = t('rec_err_phone')
    }
    if ('note' in edits && String(edits.note || '').length > NOTE_MAX) e.note = t('rec_err_note_long', { max: NOTE_MAX })
    if (!K.statuses.includes(val('status'))) e.status = t('rec_err_status')
    return e
  }

  const save = async () => {
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      if (errs.customerName || errs.customerPhone) setEditContact(true)
      toast(t('rec_fix_errors'), 'error')
      return
    }
    if (!dirty) return
    setSaving(true)
    const ok = await commit(actions[K.update](record.id, patch), t('rec_saved'))
    setSaving(false)
    if (ok) {
      setEdits({})
      setEditContact(false)
    }
  }

  const onWhatsApp = () => {
    if (K.autoContact && orig.status === 'new' && !('status' in edits)) {
      commit(actions[K.update](record.id, { status: 'contacted' }), t('rec_status_updated', { status: t('status_contacted') }))
    }
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const doc = await consultationPdf({
        salon: staff.salon,
        record: { ...view, customerPhone: printablePhone(view.customerPhone), design },
        imageUrl: record.thumb || null,
        lang,
        t,
        pick,
      })
      doc.save(pdfFileName(view))
      toast(t('rec_pdf_ready'))
    } catch (e) {
      console.warn(e)
      toast(t('rec_err_pdf'), 'error', 4500)
    } finally {
      setPdfBusy(false)
    }
  }

  const doDelete = async () => {
    const ok = await commit(actions[K.remove](record.id), t('rec_deleted'), 'rec_err_delete')
    if (ok) onDeleted?.()
  }

  const facts = [
    { label: t('shape'), value: pick(SHAPE_BY_KEY[design.shape] || {}) || '—' },
    { label: t('length'), value: t('length_' + lengthKey(design.length)) },
    {
      label: t('art'),
      value: pick(art || {}) || '—',
      dot: design.art !== 'none' && isHex(design.artHex) ? design.artHex : null,
    },
    { label: t('product_type'), value: pick(type || {}) || '—', sub: type?.wear ? t('rec_wear', { time: pick(type.wear) }) : '' },
  ]

  const footer = (
    <div className="flex items-center gap-3">
      {dirty && <span className="hidden text-[13px] font-semibold text-warn sm:inline">{t('rec_unsaved')}</span>}
      <button type="button" className="btn-ghost flex-1 sm:ms-auto sm:flex-none" onClick={onClose}>
        {t('close')}
      </button>
      <button type="button" className="btn-primary flex-[1.4] sm:flex-none" disabled={!dirty || saving} onClick={save}>
        {saving ? <Spinner size={18} /> : <Check size={18} />}
        {t('rec_save_changes')}
      </button>
    </div>
  )

  return (
    <>
      <Sheet open onClose={onClose} wide title={name} footer={footer}>
        <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* photo column */}
          <div className="flex flex-col gap-3">
            <div className="mx-auto w-full max-w-[320px] md:max-w-none">
              <Thumb rec={record} swatch={64} rounded="rounded-3xl" className="shadow-soft" alt={t('rec_photo_alt', { name })} />
              {!record.thumb && <p className="mt-2 text-center text-[13px] font-semibold text-ink-400">{t('rec_no_photo')}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={orig.status} />
              <Badge tone={fromStaff ? 'mocha' : 'glaze'}>{t(fromStaff ? 'rec_source_staff' : 'rec_source_customer')}</Badge>
              {(record.lang === 'ar' || record.lang === 'en') && (
                <Badge>
                  <Languages size={13} />
                  {t(record.lang === 'ar' ? 'rec_lang_ar' : 'rec_lang_en')}
                </Badge>
              )}
            </div>
            {(record.updatedByName || record.createdByName) && <AuditLine rec={record} />}
          </div>

          {/* details column */}
          <div className="flex min-w-0 flex-col gap-5">
            {/* customer */}
            <section className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">{t('rec_customer')}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-tight">
                    <bdi>{name}</bdi>
                  </p>
                  {phone ? (
                    <p className="mt-0.5 text-[15px] font-semibold text-ink-500">
                      <span dir="ltr">{phone}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[14px] text-ink-400">{t('rec_no_phone')}</p>
                  )}
                  {record.preferredDate && (
                    <p className="mt-2 flex items-start gap-1.5 text-[14px] font-semibold text-ink-700">
                      <CalendarClock size={16} className="mt-0.5 shrink-0 text-mocha" />
                      <span>
                        {t('rec_preferred')}: <bdi>{record.preferredDate}</bdi>
                      </span>
                    </p>
                  )}
                  <p className="mt-1.5 text-[13px] text-ink-400">
                    {t(K.whenKey, { time: dateTime(record.createdAt, lang) })} · {relTime(record.createdAt, lang)}
                  </p>
                  {K.showTech && record.createdByName && (
                    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-500">
                      <UserRound size={14} className="shrink-0" />
                      {t('rec_technician', { name: record.createdByName })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditContact((v) => !v)}
                  className={`icon-btn h-11 w-11 shrink-0 ${editContact ? 'bg-ink text-white' : 'bg-ink/5'}`}
                  aria-label={t('rec_edit_contact')}
                  aria-pressed={editContact}
                  title={t('rec_edit_contact')}
                >
                  <Pencil size={18} />
                </button>
              </div>

              {editContact && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label={t('customer_name')} error={errors.customerName}>
                    <input className="field" dir="auto" value={val('customerName')} onChange={(e) => setVal('customerName', e.target.value)} maxLength={NAME_MAX} autoComplete="off" />
                  </Field>
                  <Field label={t('customer_phone')} hint={t('rec_phone_hint')} error={errors.customerPhone}>
                    <input
                      className="field"
                      dir="ltr"
                      inputMode="tel"
                      autoComplete="off"
                      value={val('customerPhone')}
                      onChange={(e) => setVal('customerPhone', e.target.value)}
                      maxLength={20}
                    />
                  </Field>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <ActionLink href={waHref(view, kind, staff.salon, lang)} external onClick={onWhatsApp} className="btn min-h-[48px] bg-ok/10 px-3 text-ok hover:bg-ok/15">
                  <MessageCircle size={18} />
                  {t('whatsapp')}
                </ActionLink>
                <ActionLink href={telHref(view.customerPhone)} className="btn-ghost px-3">
                  <Phone size={18} />
                  {t('rec_call')}
                </ActionLink>
              </div>
            </section>

            {/* colors */}
            <section>
              <h3 className="mb-2 font-display text-[24px] font-semibold">{t('rec_colors')}</h3>
              <div className="card divide-y divide-ink/5">
                {paints.map((p) => (
                  <div key={p.where} className="flex items-center gap-3 p-3">
                    <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{pick(p) || p.code || '—'}</p>
                      <p className="truncate text-[12px] text-ink-500">
                        {[p.brand, p.code].filter(Boolean).join(' · ') || <span dir="ltr">{p.hex}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-[13px] font-bold">{p.where === 'all' ? t('all_nails') : t('finger_' + p.where)}</p>
                      <p className="text-[12px] text-ink-500">{pick(FINISH_BY_KEY[p.finish] || {}) || p.finish}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* look facts */}
            <section>
              <h3 className="mb-2 font-display text-[24px] font-semibold">{t('rec_look_details')}</h3>
              <dl className="grid grid-cols-2 gap-2">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-2xl bg-porcelain-200/60 px-4 py-3">
                    <dt className="text-[12px] font-semibold text-ink-500">{f.label}</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-[15px] font-bold">
                      {f.dot && <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink/15" style={{ background: f.dot }} />}
                      <span className="min-w-0 truncate">{f.value}</span>
                    </dd>
                    {f.sub && <dd className="mt-0.5 text-[12px] text-ink-500">{f.sub}</dd>}
                  </div>
                ))}
              </dl>
            </section>

            {/* AI skin match */}
            {hasAI && (
              <section className="rounded-3xl bg-glaze-50 p-4">
                <div className="flex items-center gap-2">
                  <ScanFace size={18} className="text-glaze-700" />
                  <h3 className="font-display text-[24px] font-semibold">{t('ai_match')}</h3>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <span className="h-16 w-16 shrink-0 rounded-full border-4 border-white shadow-soft" style={{ background: isHex(a.hex) ? a.hex : '#C69A73' }} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold">
                      {[pick(DEPTH_BY_KEY[a.depth] || {}), pick(UNDERTONE_BY_KEY[a.undertone] || {})].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {a.monk ? <p className="text-[14px] font-semibold text-ink-700">{t('monk_level', { n: a.monk })}</p> : null}
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {[
                        Number.isFinite(Number(a.ita)) && a.ita !== null ? t('rec_ita', { n: Math.round(Number(a.ita)) }) : '',
                        Number.isFinite(Number(a.confidence)) && a.confidence !== null ? t('rec_confidence', { n: Math.round(Number(a.confidence) * 100) }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                {UNDERTONE_BY_KEY[a.undertone]?.hint && <p className="mt-3 text-[13px] text-ink-500">{pick(UNDERTONE_BY_KEY[a.undertone].hint)}</p>}
                {a.monk ? <MonkScale level={Number(a.monk)} /> : null}
              </section>
            )}

            {/* edit: status + note */}
            <section className="flex flex-col gap-4">
              <div>
                <p className="label">{t('rec_status')}</p>
                <StatusPicker statuses={K.statuses} value={val('status')} onChange={(s) => setVal('status', s)} />
                {errors.status && <p className="mt-1 text-[13px] font-semibold text-bad">{errors.status}</p>}
              </div>
              <Field label={t('note')} hint={`${val('note').length}/${NOTE_MAX}`} error={errors.note}>
                <textarea
                  className="field min-h-[96px]"
                  dir="auto"
                  value={val('note')}
                  onChange={(e) => setVal('note', e.target.value)}
                  maxLength={NOTE_MAX}
                  placeholder={t('rec_note_ph')}
                />
              </Field>
            </section>

            {/* secondary actions */}
            <section className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn-ghost" onClick={downloadPdf} disabled={pdfBusy}>
                {pdfBusy ? <Spinner size={18} /> : <FileText size={18} />}
                {t('rec_download_pdf')}
              </button>
              <Link to={studioHref} className="btn-ghost">
                <Sparkles size={18} />
                {t('rec_open_studio')}
              </Link>
              <button type="button" className="btn min-h-[48px] text-bad hover:bg-bad/5 sm:col-span-2" onClick={() => setConfirmDel(true)}>
                <Trash2 size={18} />
                {t(K.delKey)}
              </button>
            </section>
          </div>
        </div>
      </Sheet>

      <Confirm
        open={confirmDel}
        title={t(K.delTitleKey)}
        text={t('rec_delete_text', { name })}
        confirmLabel={t('delete')}
        onConfirm={doDelete}
        onClose={() => setConfirmDel(false)}
      />
    </>
  )
}

/** Label of the studio's save/send button (owned by the studio strings), used inside empty-state guidance. */
export function useStudioButtonLabel() {
  const labelOr = useLabelOr()
  return {
    sendToSalon: labelOr('send_to_salon', 'rec_send_to_salon'),
    saveToSalon: labelOr('save_to_salon', 'rec_save_to_salon'),
  }
}
