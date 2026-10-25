// Salon settings (owner only): public profile, WhatsApp for customer looks, catalog behaviour,
// website publishing, reception QR, and system info (salon id, app mode, demo reset).
// Only changed fields are written (actions.saveSalon(patch)); edits on other devices show through live.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Lock, RefreshCw, ExternalLink, RotateCcw, Copy, MessageCircle, Undo2, AtSign, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, AuditLine } from './common'
import { QrCard } from '../components/QrCard'
import { Field, Toggle, Badge, Confirm, Spinner, useToast } from '../components/ui'
import { normalizePhone, waLink } from '../lib/format'

const CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD']
const TEXT_FIELDS = ['name', 'nameAr', 'tagline', 'taglineAr', 'whatsapp', 'phone', 'instagram', 'address', 'addressAr', 'hours', 'hoursAr']
const TOGGLES = [
  { key: 'showPrices', label: 'set_show_prices', hint: 'set_show_prices_hint' },
  { key: 'onlyInStock', label: 'set_only_in_stock', hint: 'set_only_in_stock_hint' },
  { key: 'publicTryOn', label: 'set_public_tryon', hint: 'set_public_tryon_hint' },
]
const FIELDS = [...TEXT_FIELDS, 'currency', ...TOGGLES.map((x) => x.key)]
const MAX = { name: 60, nameAr: 60, tagline: 120, taglineAr: 120, whatsapp: 24, phone: 24, instagram: 60, address: 160, addressAr: 160, hours: 120, hoursAr: 120 }
const PHONE_CHARS = /^[0-9+\s().-]+$/
const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/

/** "@name", "instagram.com/name/", "https://www.instagram.com/name?igsh=…" → "name" */
function cleanHandle(v) {
  let h = String(v || '').trim()
  h = h.replace(/^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//i, '')
  h = h.replace(/^@+/, '').split(/[/?#\s]/)[0]
  return h
}

function toForm(s) {
  const o = s || {}
  const f = {}
  for (const k of TEXT_FIELDS) f[k] = o[k] === undefined || o[k] === null ? '' : String(o[k])
  f.currency = CURRENCIES.includes(o.currency) ? o.currency : 'OMR'
  f.showPrices = o.showPrices !== false
  f.onlyInStock = !!o.onlyInStock
  f.publicTryOn = o.publicTryOn !== false
  return f
}

/** The value that would be stored — also what dirty detection compares. */
function clean(f) {
  const c = {}
  for (const k of TEXT_FIELDS) c[k] = String(f[k] || '').trim().replace(/\s+/g, ' ')
  c.whatsapp = normalizePhone(f.whatsapp)
  c.instagram = cleanHandle(f.instagram)
  c.currency = f.currency
  for (const { key } of TOGGLES) c[key] = !!f[key]
  return c
}

/** Firestore resolves a write only after the server acknowledges it. Offline the write is already safe in the
 *  local queue (and visible at once), so don't leave the salon staring at a spinner. */
function settle(promise) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return promise
  promise.catch(() => {})
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('queued'), 1200))])
}

export default function Settings() {
  const { staff, isOwner } = useData()
  if (!isOwner) return <ReadOnlySettings />
  if (!staff.salon) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center text-ink-500">
        <Spinner size={30} />
      </div>
    )
  }
  return <SettingsForm />
}

// ------------------------------------------------------------------ owner form
function SettingsForm() {
  const { t, pick } = useI18n()
  const { staff, mode, salonId, actions } = useData()
  const toast = useToast()
  const formRef = useRef(null)
  const base = useMemo(() => toForm(staff.salon), [staff.salon])
  const [edits, setEdits] = useState({}) // only what the owner typed; everything else follows the live salon doc
  const form = useMemo(() => ({ ...base, ...edits }), [base, edits])
  const [touched, setTouched] = useState({})
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const set = (k, v) => setEdits((e) => ({ ...e, [k]: v }))
  const touch = (k) => setTouched((s) => (s[k] ? s : { ...s, [k]: true }))

  const cf = useMemo(() => clean(form), [form])
  const cb = useMemo(() => clean(base), [base])
  const dirtyKeys = useMemo(() => FIELDS.filter((k) => cf[k] !== cb[k]), [cf, cb])
  const dirty = dirtyKeys.length > 0

  // ---------------------------------------------------------------- validation
  const errors = useMemo(() => {
    const e = {}
    if (!cf.name && !cf.nameAr) e.name = t('set_err_salon_name')
    if (!cf.whatsapp) e.whatsapp = t('set_err_wa_required')
    else if (!/^\d{8,15}$/.test(cf.whatsapp)) e.whatsapp = t('set_err_wa')
    if (cf.phone) {
      const digits = cf.phone.replace(/\D/g, '').length
      if (!PHONE_CHARS.test(cf.phone) || digits < 7 || digits > 15) e.phone = t('set_err_phone')
    }
    if (cf.instagram && !IG_HANDLE.test(cf.instagram)) e.instagram = t('set_err_ig')
    return e
  }, [cf, t])
  const err = (k) => (tried || touched[k] ? errors[k] : undefined)
  const waValid = !errors.whatsapp

  // Leaving the page with unsaved changes (reload / close tab) asks first.
  useEffect(() => {
    if (!dirty) return
    const onBefore = (ev) => {
      ev.preventDefault()
      ev.returnValue = ''
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [dirty])

  // ---------------------------------------------------------------- actions
  const resetForm = () => {
    setEdits({})
    setTouched({})
    setTried(false)
  }

  const save = async (ev) => {
    ev?.preventDefault()
    if (busy || !dirty) return
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
    const patch = {}
    for (const k of dirtyKeys) patch[k] = cf[k]
    setBusy(true)
    try {
      const res = await settle(actions.saveSalon(patch))
      resetForm()
      if (res === 'queued') toast(t('set_saved_offline'), 'info', 3500)
      else toast(t('set_saved'))
    } catch (x) {
      console.warn('[saveSalon]', x)
      toast(t('set_err_generic'), 'error', 4000)
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (publishing) return
    setPublishing(true)
    try {
      await actions.republish()
      toast(t('set_published'))
    } catch (x) {
      console.warn('[republish]', x)
      toast(t('set_err_publish'), 'error', 4000)
    } finally {
      setPublishing(false)
    }
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(salonId)
      toast(t('set_copied'), 'ok', 1400)
    } catch {
      toast(t('set_copy_failed'), 'error')
    }
  }

  const resetDemo = async () => {
    actions.resetDemo()
    resetForm()
    toast(t('set_demo_reset_done'))
  }

  // ---------------------------------------------------------------- field helpers
  const text = (k, extra = {}) => ({
    className: 'field',
    value: form[k],
    onChange: (e) => set(k, e.target.value),
    onBlur: () => touch(k),
    maxLength: MAX[k],
    autoComplete: 'off',
    'aria-invalid': !!err(k),
    ...extra,
  })
  const en = { dir: 'auto' }
  const ar = { dir: 'rtl', lang: 'ar' }

  return (
    <div className="animate-rise">
      <PageHeader eyebrow={t('set_eyebrow')} title={t('set_title')} subtitle={t('set_subtitle')} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form ref={formRef} onSubmit={save} noValidate className="flex flex-col gap-6">
          {/* profile */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_sec_profile')}</h2>
            <div className="card flex flex-col gap-4 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('set_name')} error={err('name')}>
                  <input {...text('name', en)} placeholder={t('set_name_ph')} />
                </Field>
                <Field label={t('set_name_ar')}>
                  <input {...text('nameAr', ar)} onBlur={() => touch('name')} placeholder={t('set_name_ar_ph')} aria-invalid={!!err('name')} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('set_tagline')} hint={t('set_tagline_hint')}>
                  <input {...text('tagline', en)} />
                </Field>
                <Field label={t('set_tagline_ar')}>
                  <input {...text('taglineAr', ar)} />
                </Field>
              </div>
            </div>
          </section>

          {/* contact */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_sec_contact')}</h2>
            <div className="card flex flex-col gap-4 p-4 sm:p-5">
              <div>
                <Field label={t('set_whatsapp')} hint={t('set_whatsapp_hint')} error={err('whatsapp')}>
                  <input {...text('whatsapp', { dir: 'ltr', type: 'tel', inputMode: 'tel' })} placeholder={t('set_whatsapp_ph')} />
                </Field>
                {waValid && cf.whatsapp && (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[12px] text-ink-500">
                    <span>
                      {t('set_wa_saved_as')}{' '}
                      <span dir="ltr" className="font-bold text-ink">
                        +{cf.whatsapp}
                      </span>
                    </span>
                    <a href={waLink(cf.whatsapp, t('set_wa_test_msg'))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-ok">
                      <MessageCircle size={16} />
                      {t('set_wa_test')}
                    </a>
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('set_phone')} hint={t('set_phone_hint')} error={err('phone')}>
                  <input {...text('phone', { dir: 'ltr', type: 'tel', inputMode: 'tel' })} placeholder={t('set_phone_ph')} />
                </Field>
                <Field label={t('set_instagram')} hint={t('set_instagram_hint')} error={err('instagram')}>
                  <span className="relative block" dir="ltr">
                    <AtSign size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input
                      {...text('instagram', { dir: 'ltr' })}
                      className="field ps-10"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={t('set_instagram_ph')}
                      onBlur={() => {
                        touch('instagram')
                        const h = cleanHandle(form.instagram)
                        if (h !== form.instagram) set('instagram', h)
                      }}
                    />
                  </span>
                </Field>
              </div>
            </div>
          </section>

          {/* location & hours */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_sec_location')}</h2>
            <div className="card flex flex-col gap-4 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('set_address')}>
                  <input {...text('address', en)} placeholder={t('set_address_ph')} />
                </Field>
                <Field label={t('set_address_ar')}>
                  <input {...text('addressAr', ar)} placeholder={t('set_address_ar_ph')} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('set_hours')}>
                  <input {...text('hours', en)} placeholder={t('set_hours_ph')} />
                </Field>
                <Field label={t('set_hours_ar')}>
                  <input {...text('hoursAr', ar)} placeholder={t('set_hours_ar_ph')} />
                </Field>
              </div>
            </div>
          </section>

          {/* catalog behaviour */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_sec_catalog')}</h2>
            <div className="card flex flex-col gap-4 p-4 sm:p-5">
              <Field label={t('set_currency')} hint={t('set_currency_hint')}>
                <select className="field" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {t('set_cur_' + c)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white px-4">
                {TOGGLES.map((x) => (
                  <div key={x.key}>
                    <Toggle checked={!!form[x.key]} onChange={(v) => set(x.key, v)} label={t(x.label)} />
                    <p className="-mt-1 pb-3 pe-14 text-[12px] text-ink-400">{t(x.hint)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* save bar — stays in reach above the mobile nav */}
          <div className="sticky bottom-24 z-20 lg:bottom-6">
            <div className={`flex items-center gap-2 rounded-3xl border p-3 shadow-lift ${dirty ? 'border-mocha/20 bg-white' : 'border-ink/5 bg-porcelain-50'}`}>
              <p className="min-w-0 flex-1 px-1 text-[13px] font-semibold text-ink-500" aria-live="polite">
                {dirty ? t('set_unsaved', { n: dirtyKeys.length }) : t('set_all_saved')}
              </p>
              {dirty && (
                <button type="button" className="btn-ghost shrink-0 px-4" onClick={() => setConfirmDiscard(true)} disabled={busy} aria-label={t('set_discard')}>
                  <Undo2 size={18} />
                  <span className="hidden sm:inline">{t('set_discard')}</span>
                </button>
              )}
              <button type="submit" className="btn-primary shrink-0 px-5" disabled={!dirty || busy}>
                {busy ? <Spinner size={18} /> : <Check size={18} />}
                {t('save')}
              </button>
            </div>
          </div>
        </form>

        <aside className="flex flex-col gap-6">
          {/* website */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_web_title')}</h2>
            <div className="card flex flex-col gap-3 p-4 sm:p-5">
              <p className="text-[14px] text-ink-500">{mode === 'demo' ? t('set_web_text_demo') : t('set_web_text')}</p>
              {dirty && (
                <p className="flex items-start gap-2 rounded-2xl bg-warn/10 px-3 py-2 text-[12px] font-semibold text-warn">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {t('set_web_unsaved')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {mode !== 'demo' && (
                  <button type="button" className="btn-ghost min-h-[44px] px-4 text-[14px]" onClick={publish} disabled={publishing}>
                    {publishing ? <Spinner size={16} /> : <RefreshCw size={16} />}
                    {t('set_publish_now')}
                  </button>
                )}
                <a href="/" target="_blank" rel="noopener noreferrer" className="btn-ghost min-h-[44px] px-4 text-[14px]">
                  <ExternalLink size={16} className="rtl:-scale-x-100" />
                  {t('set_open_site')}
                </a>
              </div>
            </div>
          </section>

          <QrCard salonName={pick(staff.salon || {})} />

          {/* system */}
          <section>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_sys_title')}</h2>
            <div className="card divide-y divide-ink/5">
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink-500">{t('set_salon_id')}</p>
                  <p className="truncate font-mono text-[15px] font-bold">
                    <span dir="ltr">{salonId}</span>
                  </p>
                </div>
                <button type="button" onClick={copyId} className="icon-btn h-11 w-11 shrink-0 bg-ink/5" aria-label={t('set_copy_id')}>
                  <Copy size={18} />
                </button>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink-500">{t('set_app_mode')}</p>
                  <p className="text-[15px] font-bold">{mode === 'demo' ? t('set_mode_demo') : t('set_mode_live')}</p>
                  <p className="text-[12px] text-ink-400">{mode === 'demo' ? t('set_mode_demo_hint') : t('set_mode_live_hint')}</p>
                </div>
                <Badge tone={mode === 'demo' ? 'warn' : 'ok'} className="shrink-0">
                  {mode === 'demo' ? t('set_badge_demo') : t('set_badge_live')}
                </Badge>
              </div>
              <div className="p-4">
                <p className="text-[13px] font-semibold text-ink-500">{t('set_last_change')}</p>
                <AuditLine rec={staff.salon} />
              </div>
            </div>
          </section>

          {mode === 'demo' && (
            <section>
              <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_demo_title')}</h2>
              <div className="card flex flex-col gap-3 p-4 sm:p-5">
                <p className="text-[14px] text-ink-500">{t('set_demo_text')}</p>
                <button type="button" className="btn-ghost border-bad/25 text-bad" onClick={() => setConfirmReset(true)}>
                  <RotateCcw size={18} />
                  {t('set_demo_reset')}
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>

      <Confirm open={confirmDiscard} title={t('set_discard_title')} text={t('set_discard_text')} confirmLabel={t('set_discard')} onConfirm={resetForm} onClose={() => setConfirmDiscard(false)} />
      <Confirm open={confirmReset} title={t('set_demo_reset_title')} text={t('set_demo_reset_text')} confirmLabel={t('set_demo_reset')} onConfirm={resetDemo} onClose={() => setConfirmReset(false)} />
    </div>
  )
}

// ------------------------------------------------------------------ technicians: read-only view
function ReadOnlySettings() {
  const { t, pick } = useI18n()
  const { staff } = useData()
  const s = staff.salon || {}
  const rows = [
    { label: t('set_name'), value: pick(s) },
    { label: t('set_whatsapp'), value: s.whatsapp ? '+' + String(s.whatsapp).replace(/^\+/, '') : '', ltr: true },
    { label: t('set_phone'), value: s.phone || '', ltr: true },
    { label: t('set_instagram'), value: s.instagram ? '@' + String(s.instagram).replace(/^@/, '') : '', ltr: true },
    { label: t('set_hours'), value: pick(s, 'hours') },
    { label: t('set_address'), value: pick(s, 'address') },
    { label: t('set_currency'), value: t('set_cur_' + (CURRENCIES.includes(s.currency) ? s.currency : 'OMR')) },
  ].filter((r) => r.value)

  return (
    <div className="animate-rise">
      <PageHeader eyebrow={t('set_eyebrow')} title={t('set_title')} />
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-3xl bg-champagne-100 p-5 text-champagne-700">
            <Lock size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[15px] font-bold">{t('set_owner_only_title')}</p>
              <p className="mt-1 text-[14px]">{t('set_owner_only_text')}</p>
            </div>
          </div>
          {rows.length > 0 && (
            <div className="card divide-y divide-ink/5">
              {rows.map((r) => (
                <div key={r.label} className="flex min-h-[56px] flex-col justify-center gap-0.5 px-4 py-3">
                  <span className="text-[12px] font-semibold text-ink-500">{r.label}</span>
                  <span className="break-words text-[15px] font-bold">{r.ltr ? <span dir="ltr">{r.value}</span> : r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <QrCard salonName={pick(s)} />
      </div>
    </div>
  )
}
