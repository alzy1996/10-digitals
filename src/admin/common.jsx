// Shared admin building blocks — keep every admin screen visually identical.
import { Search } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-[36px] font-semibold leading-[1.05] sm:text-[42px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'ink', onClick }) {
  const tones = {
    ink: 'bg-white',
    mocha: 'bg-mocha text-white',
    glaze: 'bg-glaze-100',
    warn: 'bg-warn/10',
    bad: 'bg-bad/10',
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`flex flex-col gap-2 rounded-3xl border border-ink/5 p-5 text-start shadow-soft ${tones[tone]} ${onClick ? 'transition active:scale-[0.98]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[13px] font-bold ${tone === 'mocha' ? 'text-white/80' : 'text-ink-500'}`}>{label}</span>
        {Icon && <Icon size={18} className={tone === 'mocha' ? 'text-white/80' : 'text-mocha'} />}
      </div>
      <span className="font-display text-[44px] font-semibold leading-none">{value}</span>
      {hint && <span className={`text-[12px] ${tone === 'mocha' ? 'text-white/70' : 'text-ink-400'}`}>{hint}</span>}
    </Tag>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  const { t } = useI18n()
  return (
    <label className="relative block w-full">
      <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t('search')} className="field ps-11" />
    </label>
  )
}

export const REQUEST_STATUSES = ['new', 'contacted', 'booked', 'closed']
export const LOOK_STATUSES = ['saved', 'booked', 'done']

export function StatusChip({ status }) {
  const { t } = useI18n()
  const tone = {
    new: 'bg-bad/10 text-bad',
    contacted: 'bg-glaze-100 text-glaze-700',
    booked: 'bg-ok/10 text-ok',
    closed: 'bg-ink/5 text-ink-500',
    saved: 'bg-mocha/10 text-mocha',
    done: 'bg-ok/10 text-ok',
  }[status] || 'bg-ink/5 text-ink-500'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold ${tone}`}>{t('status_' + status)}</span>
}

/** Small audit line: "by Name · 12 Oct 14:20" */
export function AuditLine({ rec }) {
  const { t, lang } = useI18n()
  if (!rec) return null
  const by = rec.updatedByName || rec.createdByName
  const at = rec.updatedAt || rec.createdAt
  if (!by && !at) return null
  const fmt = (ms) =>
    ms
      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Muscat', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
      : ''
  return (
    <span className="text-[11px] text-ink-400">
      {t('by')} {by || '—'} · {fmt(at)}
    </span>
  )
}
