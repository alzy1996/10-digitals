// Services: the salon menu (what you offer, how long, what it costs), grouped by category.
// Active services appear on the public website menu; every write goes through useData().actions.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Check, Trash2, Clock, Scissors, Hand, Footprints, Gem, Paintbrush, Sparkles, EyeOff, ArrowRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, AuditLine } from './common'
import { Sheet, Field, Toggle, Badge, Empty, Confirm, Spinner, useToast } from '../components/ui'
import { money } from '../lib/format'

const SERVICE_CATEGORIES = ['hands', 'feet', 'extensions', 'art', 'other']
const CAT_ICON = { hands: Hand, feet: Footprints, extensions: Gem, art: Paintbrush, other: Sparkles }
const QUICK_DURATIONS = [15, 30, 45, 60, 90]
const MIN_DUR = 5
const MAX_DUR = 600
const MAX_PRICE = 100000

const catOf = (s) => (SERVICE_CATEGORIES.includes(s?.category) ? s.category : 'other')
const isBlank = (v) => String(v ?? '').trim() === ''
const durationOf = (s) => {
  if (isBlank(s?.durationMin)) return null
  const n = Number(s.durationMin)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Firestore resolves a write only after the server acknowledges it. Offline the write is already safe in the
 *  local queue (and visible at once), so don't leave the salon staring at a spinner. */
function settle(promise) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return promise
  promise.catch(() => {})
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('queued'), 1200))])
}

export default function Services() {
  const { t, pick, lang, isAr } = useI18n()
  const { staff, isOwner } = useData()
  const [editing, setEditing] = useState(null) // null = closed · 'new' · service id
  const currency = staff.salon?.currency || 'OMR'
  const services = staff.services

  const groups = useMemo(() => {
    const coll = new Intl.Collator(lang === 'ar' ? 'ar' : 'en', { numeric: true, sensitivity: 'base' })
    const by = Object.fromEntries(SERVICE_CATEGORIES.map((c) => [c, []]))
    for (const s of services) by[catOf(s)].push(s)
    return SERVICE_CATEGORIES.map((c) => ({
      cat: c,
      items: by[c].sort((a, b) => (a.active === false) - (b.active === false) || coll.compare(pick(a), pick(b))),
    })).filter((g) => g.items.length > 0)
  }, [services, pick, lang])

  const hidden = services.filter((s) => s.active === false).length
  const current = editing && editing !== 'new' ? services.find((s) => s.id === editing) || null : null

  // A service deleted on another device while its sheet is open: close the sheet.
  useEffect(() => {
    if (editing && editing !== 'new' && !current) setEditing(null)
  }, [editing, current])

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={t('set_svc_eyebrow')}
        title={t('set_svc_title')}
        subtitle={t('set_svc_subtitle')}
        actions={
          <button onClick={() => setEditing('new')} className="btn-mocha">
            <Plus size={18} />
            {t('set_svc_add')}
          </button>
        }
      />

      {staff.salon?.showPrices === false && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-glaze-50 px-4 py-3 text-[13px] font-semibold text-glaze-700">
          <span className="flex items-center gap-2">
            <EyeOff size={16} className="shrink-0" />
            {t('set_svc_prices_hidden')}
          </span>
          {isOwner && (
            <Link to="/admin/settings" className="inline-flex min-h-[44px] items-center gap-1 font-bold underline-offset-2 hover:underline">
              {t('set_open_settings')}
              <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
          )}
        </div>
      )}

      {services.length === 0 ? (
        <Empty
          icon={Scissors}
          title={t('set_svc_empty_title')}
          text={t('set_svc_empty_text')}
          action={
            <button className="btn-mocha mt-2" onClick={() => setEditing('new')}>
              <Plus size={18} />
              {t('set_svc_add')}
            </button>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-[13px] font-semibold text-ink-500" aria-live="polite">
            {t('set_svc_count', { n: services.length })}
            {hidden > 0 && <span> · {t('set_svc_count_hidden', { n: hidden })}</span>}
          </p>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {groups.map(({ cat, items }) => {
              const Icon = CAT_ICON[cat]
              return (
                <section key={cat} aria-labelledby={`svc-cat-${cat}`}>
                  <h2 id={`svc-cat-${cat}`} className="mb-3 flex items-center gap-2 font-display text-[28px] font-semibold">
                    <Icon size={20} className="shrink-0 text-mocha" />
                    {t('set_cat_' + cat)}
                    <span className="font-sans text-[14px] font-bold text-ink-400">{items.length}</span>
                  </h2>
                  <div className="card divide-y divide-ink/5">
                    {items.map((s) => {
                      const inactive = s.active === false
                      const missingEn = isBlank(s.name)
                      const missingAr = isBlank(s.nameAr)
                      const alt = missingEn || missingAr ? '' : isAr ? s.name : s.nameAr
                      const hasPrice = !isBlank(s.price) && Number.isFinite(Number(s.price))
                      const dur = durationOf(s)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEditing(s.id)}
                          className={`flex min-h-[72px] w-full items-center gap-3 p-4 text-start transition first:rounded-t-3xl last:rounded-b-3xl hover:bg-porcelain-50 active:scale-[0.99] ${inactive ? 'bg-porcelain-50' : ''}`}
                        >
                          <span className={`min-w-0 flex-1 ${inactive ? 'opacity-60' : ''}`}>
                            <span className="block truncate text-[16px] font-bold leading-snug">{pick(s) || '—'}</span>
                            {alt ? (
                              <span className="block truncate text-[13px] text-ink-500" dir="auto">
                                {alt}
                              </span>
                            ) : (
                              <span className="block truncate text-[12px] font-semibold text-warn">{missingAr ? t('set_svc_missing_ar') : t('set_svc_missing_en')}</span>
                            )}
                            <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-500">
                              <Clock size={12} className="shrink-0" />
                              {dur ? t('set_minutes', { n: dur }) : '—'}
                            </span>
                            <AuditLine rec={s} />
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {hasPrice && <span className="text-[15px] font-bold">{money(s.price, lang, currency)}</span>}
                            {inactive && <Badge>{t('set_svc_hidden')}</Badge>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}

      {(editing === 'new' || current) && <ServiceForm key={current ? current.id : 'new'} service={current} currency={currency} onClose={() => setEditing(null)} />}
    </div>
  )
}

function initialForm(s) {
  if (!s) return { name: '', nameAr: '', price: '', durationMin: '30', category: 'hands', active: true }
  return {
    name: s.name || '',
    nameAr: s.nameAr || '',
    price: s.price === undefined || s.price === null || s.price === '' ? '' : String(s.price),
    durationMin: s.durationMin === undefined || s.durationMin === null || s.durationMin === '' ? '' : String(s.durationMin),
    category: catOf(s),
    active: s.active !== false,
  }
}

function ServiceForm({ service, currency, onClose }) {
  const { t, pick, lang } = useI18n()
  const { staff, actions } = useData()
  const toast = useToast()
  const formId = useId()
  const formRef = useRef(null)
  const [initial] = useState(() => initialForm(service))
  const [form, setForm] = useState(initial)
  const [bad, setBad] = useState({ price: false, durationMin: false }) // browser-level "not a number" input
  const [touched, setTouched] = useState({})
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const isEdit = !!service

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const touch = (k) => setTouched((s) => (s[k] ? s : { ...s, [k]: true }))

  const others = useMemo(() => staff.services.filter((o) => o.id !== service?.id), [staff.services, service])

  // ---------------------------------------------------------------- validation
  const errors = useMemo(() => {
    const e = {}
    const name = form.name.trim()
    const nameAr = form.nameAr.trim()
    if (!name && !nameAr) e.name = t('set_err_svc_name')
    else {
      const low = (v) => v.trim().toLowerCase()
      const dup = others.find((o) => catOf(o) === form.category && ((name && low(o.name || '') === low(name)) || (nameAr && low(o.nameAr || '') === low(nameAr))))
      if (dup) e.name = t('set_err_svc_dup', { name: pick(dup), cat: t('set_cat_' + form.category) })
    }
    const price = Number(form.price)
    if (bad.price || isBlank(form.price)) e.price = t('set_err_price')
    else if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) e.price = t('set_err_price')
    else if (Math.abs(price * 1000 - Math.round(price * 1000)) > 1e-6) e.price = t('set_err_price_decimals')
    const dur = Number(form.durationMin)
    if (bad.durationMin || isBlank(form.durationMin) || !Number.isInteger(dur) || dur < MIN_DUR || dur > MAX_DUR) e.durationMin = t('set_err_duration', { min: MIN_DUR, max: MAX_DUR })
    return e
  }, [form, others, bad, t, pick])

  const err = (k) => (tried || touched[k] ? errors[k] : undefined)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])

  // ---------------------------------------------------------------- actions
  const requestClose = () => {
    if (busy) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = async (e) => {
    e?.preventDefault()
    if (busy) return
    setTried(true)
    if (Object.keys(errors).length) {
      toast(t('set_fix_errors'), 'error')
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector('[aria-invalid="true"]')
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          el.focus({ preventScroll: true })
        }
      })
      return
    }
    if (isEdit && !dirty) {
      onClose()
      return
    }
    const data = {
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      price: Math.round(Number(form.price) * 1000) / 1000,
      durationMin: Number(form.durationMin),
      category: form.category,
      active: form.active,
    }
    setBusy(true)
    try {
      const res = await settle(actions.saveService(data, service?.id))
      if (res === 'queued') toast(t('set_saved_offline'), 'info', 3500)
      else toast(isEdit ? t('set_svc_saved') : t('set_svc_added'))
      onClose()
    } catch (x) {
      console.warn('[saveService]', x)
      toast(t('set_err_generic'), 'error', 4000)
      setBusy(false)
    }
  }

  const doDelete = async () => {
    try {
      const label = [service.name, service.nameAr].filter(Boolean).join(' / ')
      await settle(actions.deleteService(service.id, label))
      toast(t('set_svc_deleted'))
      onClose()
    } catch (x) {
      console.warn('[deleteService]', x)
      toast(t('set_err_generic'), 'error', 4000)
    }
  }

  const numberInput = (k, extra) => ({
    className: 'field',
    type: 'number',
    dir: 'ltr',
    value: form[k],
    onChange: (e) => {
      const badInput = !!e.target.validity?.badInput
      setBad((b) => (b[k] === badInput ? b : { ...b, [k]: badInput }))
      set(k, e.target.value)
    },
    onBlur: () => touch(k),
    onWheel: (e) => e.currentTarget.blur(),
    'aria-invalid': !!err(k),
    ...extra,
  })

  const previewName = pick({ name: form.name.trim(), nameAr: form.nameAr.trim() })
  const priceOk = !errors.price
  const durOk = !errors.durationMin
  const PreviewIcon = CAT_ICON[form.category] || Sparkles

  return (
    <>
      <Sheet
        open
        onClose={requestClose}
        title={isEdit ? t('set_svc_edit') : t('set_svc_new')}
        footer={
          <div className="flex gap-2">
            {isEdit && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className="icon-btn shrink-0 border border-bad/25 text-bad disabled:opacity-40" aria-label={t('delete')}>
                <Trash2 size={20} />
              </button>
            )}
            <button type="button" className="btn-ghost flex-1 px-4" onClick={requestClose} disabled={busy}>
              {t('cancel')}
            </button>
            <button type="submit" form={formId} className="btn-primary flex-[2] px-4" disabled={busy}>
              {busy ? <Spinner size={18} /> : <Check size={18} />}
              {t('save')}
            </button>
          </div>
        }
      >
        <form id={formId} ref={formRef} onSubmit={save} noValidate className="flex flex-col gap-4">
          {/* live preview — how the menu line will read */}
          <div className="card flex items-center gap-4 p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mocha-50 text-mocha">
              <PreviewIcon size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate font-display text-[24px] font-semibold leading-tight ${previewName ? '' : 'text-ink-300'}`}>{previewName || t('set_svc_preview_unnamed')}</p>
              <p className="truncate text-[12px] text-ink-500">
                {t('set_cat_' + form.category)}
                {durOk ? ' · ' + t('set_minutes', { n: Number(form.durationMin) }) : ''}
              </p>
            </div>
            {priceOk && <span className="shrink-0 text-[16px] font-bold">{money(Number(form.price), lang, currency)}</span>}
          </div>

          <Field label={t('set_svc_name')} error={err('name')}>
            <input
              className="field"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onBlur={() => touch('name')}
              placeholder={t('set_svc_name_ph')}
              aria-invalid={!!err('name')}
              autoComplete="off"
              dir="auto"
              maxLength={80}
            />
          </Field>
          <Field label={t('set_svc_name_ar')} hint={t('set_svc_name_ar_hint')}>
            <input
              className="field"
              value={form.nameAr}
              onChange={(e) => set('nameAr', e.target.value)}
              onBlur={() => touch('name')}
              placeholder={t('set_svc_name_ar_ph')}
              autoComplete="off"
              dir="rtl"
              lang="ar"
              maxLength={80}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('set_svc_price', { currency })} hint={t('set_svc_price_hint')} error={err('price')}>
              <input {...numberInput('price', { inputMode: 'decimal', step: '0.001', min: '0', placeholder: '0.000' })} />
            </Field>
            <Field label={t('set_svc_duration')} hint={t('set_svc_duration_hint', { min: MIN_DUR, max: MAX_DUR })} error={err('durationMin')}>
              <input {...numberInput('durationMin', { inputMode: 'numeric', pattern: '[0-9]*', step: '1', min: String(MIN_DUR), max: String(MAX_DUR), placeholder: '30' })} />
            </Field>
          </div>
          <div className="no-scrollbar -mt-1 flex gap-2 overflow-x-auto" role="group" aria-label={t('set_svc_duration')}>
            {QUICK_DURATIONS.map((n) => {
              const on = Number(form.durationMin) === n
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    set('durationMin', String(n))
                    setBad((b) => ({ ...b, durationMin: false }))
                    touch('durationMin')
                  }}
                  className={`chip ${on ? 'chip-on' : 'chip-off'}`}
                >
                  {t('set_minutes', { n })}
                </button>
              )
            })}
          </div>

          <Field label={t('set_svc_category')}>
            <select className="field" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t('set_cat_' + c)}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <div className="rounded-2xl border border-ink/10 bg-white px-4">
              <Toggle checked={form.active} onChange={(v) => set('active', v)} label={t('set_svc_active')} />
            </div>
            <p className="mt-1 text-[12px] text-ink-400">{t('set_svc_active_hint')}</p>
          </div>

          {isEdit && <AuditLine rec={service} />}
        </form>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={t('set_svc_delete_title')}
        text={t('set_svc_delete_text', { name: isEdit ? pick(service) : '' })}
        confirmLabel={t('delete')}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
      <Confirm
        open={confirmDiscard}
        title={t('set_discard_title')}
        text={t('set_discard_text')}
        confirmLabel={t('set_discard')}
        onConfirm={onClose}
        onClose={() => setConfirmDiscard(false)}
      />
    </>
  )
}
