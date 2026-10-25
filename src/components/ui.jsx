import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { withBase } from '../lib/base'

// ------------------------------------------------------------------ Toasts (instant feedback)
const ToastCtx = createContext(() => {})

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((msg, kind = 'ok', ms = 2600) => {
    const id = Math.random().toString(36).slice(2)
    setItems((l) => [...l.slice(-2), { id, msg, kind }])
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), ms)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-safe" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto mt-2 flex max-w-md animate-rise items-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-lift ${
              t.kind === 'error' ? 'bg-bad text-white' : t.kind === 'warn' ? 'bg-warn text-white' : t.kind === 'info' ? 'bg-ink text-white' : 'bg-ok text-white'
            }`}
          >
            {t.kind === 'error' || t.kind === 'warn' ? <AlertTriangle size={18} /> : t.kind === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ------------------------------------------------------------------ Bottom sheet / modal
export function Sheet({ open, onClose, title, children, dark = false, wide = false, footer }) {
  const { t } = useI18n()
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-night/50 backdrop-blur-[2px]" onClick={onClose} aria-label={t('close')} />
      <div
        ref={ref}
        className={`relative flex max-h-[92dvh] w-full animate-rise flex-col overflow-hidden rounded-t-4xl sm:rounded-4xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} ${
          dark ? 'bg-night-800 text-white' : 'bg-porcelain-50 text-ink'
        } shadow-lift`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="font-display text-[26px] font-semibold leading-tight">{title}</h2>
          <button onClick={onClose} className={`icon-btn ${dark ? 'bg-white/10' : 'bg-ink/5'}`} aria-label={t('close')}>
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className={`border-t px-5 py-3 pb-safe ${dark ? 'border-white/10' : 'border-ink/10'}`}>{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner({ size = 22, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-[13px] font-semibold text-bad">{error}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label, dark = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 text-start"
    >
      <span className={`text-[15px] font-semibold ${dark ? 'text-white' : 'text-ink'}`}>{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-ok' : dark ? 'bg-white/20' : 'bg-ink/15'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'start-[22px]' : 'start-0.5'}`} />
      </span>
    </button>
  )
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-ink/5 text-ink-700',
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/10 text-bad',
    mocha: 'bg-mocha/10 text-mocha',
    glaze: 'bg-glaze-100 text-glaze-700',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${tones[tone]} ${className}`}>{children}</span>
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-ink/15 bg-white/60 px-6 py-12 text-center">
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mocha-50 text-mocha">
          <Icon size={26} />
        </span>
      )}
      <p className="font-display text-[24px] font-semibold">{title}</p>
      {text && <p className="max-w-sm text-[15px] text-ink-500">{text}</p>}
      {action}
    </div>
  )
}

export function Confirm({ open, title, text, confirmLabel, onConfirm, onClose, danger = true }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner size={18} /> : confirmLabel || t('confirm')}
          </button>
        </div>
      }
    >
      <p className="text-[15px] text-ink-500">{text}</p>
    </Sheet>
  )
}

export function LangToggle({ dark = false, className = '' }) {
  const { lang, toggle, t } = useI18n()
  return (
    <button
      onClick={toggle}
      className={`inline-flex h-11 min-w-[52px] items-center justify-center rounded-full px-3 text-[14px] font-bold transition active:scale-95 ${
        dark ? 'border border-white/20 bg-white/10 text-white backdrop-blur-md' : 'border border-ink/15 bg-white/80 text-ink'
      } ${className}`}
      aria-label={t('switch_language')}
    >
      {lang === 'ar' ? 'EN' : 'ع'}
    </button>
  )
}

export function Logo({ className = '', compact = false }) {
  const { t } = useI18n()
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src={withBase('icon.svg')} alt="" className="h-9 w-9 rounded-xl" />
      {!compact && <span className="font-display text-[22px] font-bold leading-none tracking-tight">{t('app_name')}</span>}
    </span>
  )
}

export function Segmented({ options, value, onChange, dark = false, className = '' }) {
  return (
    <div className={`flex gap-1 rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-ink/5'} ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-bold transition ${
            value === o.value ? (dark ? 'bg-white text-ink' : 'bg-white text-ink shadow-soft') : dark ? 'text-white/80' : 'text-ink-500'
          }`}
        >
          {o.icon && <o.icon size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}
