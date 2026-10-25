// Audit trail: every write in the salon (who, what, when), newest first, grouped by Oman day.
// Read-only by design: the trail is append-only and the security rules refuse edits / deletes.
import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { CirclePlus, Pencil, Trash2, Upload, Package, History, Lock, SearchX, FileSpreadsheet } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, SearchInput } from './common'
import { Empty, useToast } from '../components/ui'
import { TZ, dateTime, dateOnly, omanDayKey, omanDayRange, todayKey } from '../lib/format'
import { downloadText } from '../lib/csv'

const ACTIONS = ['create', 'update', 'delete', 'import', 'stock']
const AREAS = ['polishes', 'services', 'looks', 'requests', 'salon', 'invites', 'members']
const AREA_LABELS = new Set([...AREAS, 'retention']) // retention = automatic 90-day photo clean-up

const ACTION_META = {
  create: { icon: CirclePlus, tone: 'bg-ok/10 text-ok' },
  update: { icon: Pencil, tone: 'bg-glaze-100 text-glaze-700' },
  delete: { icon: Trash2, tone: 'bg-bad/10 text-bad' },
  import: { icon: Upload, tone: 'bg-mocha/10 text-mocha' },
  stock: { icon: Package, tone: 'bg-warn/15 text-warn' },
}
const FALLBACK_META = { icon: History, tone: 'bg-ink/5 text-ink-500' }

const latinDigits = (s) => String(s ?? '').replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 15))

/** Search folding: lower-case, Latin digits, Arabic letter variants + diacritics unified. */
function fold(s) {
  return latinDigits(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}

const STAMP = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
function omanStamp(ms) {
  if (!ms) return ''
  const p = Object.fromEntries(STAMP.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

const shortId = (id) => (id.length > 24 ? id.slice(0, 22) + '…' : id)

export default function Audit() {
  const { t, pick, lang } = useI18n()
  const { staff } = useData()
  const toast = useToast()
  const [action, setAction] = useState('all')
  const [area, setArea] = useState('all')
  const [q, setQ] = useState('')

  const actionLabel = (a) => (ACTION_META[a] ? t('rep_act_' + a) : t('rep_act_other'))
  const areaLabel = (c) => (AREA_LABELS.has(c) ? t('rep_area_' + c) : c || t('rep_area_other'))

  // Current names of the records an entry points to (so "status=booked" reads as "Fatma — status=booked").
  const names = useMemo(() => {
    const m = new Map()
    for (const p of staff.polishes) m.set('polishes|' + p.id, [p.brand, pick(p)].filter(Boolean).join(' '))
    for (const s of staff.services) m.set('services|' + s.id, pick(s))
    for (const r of staff.requests) m.set('requests|' + r.id, r.customerName || t('guest'))
    for (const r of staff.looks) m.set('looks|' + r.id, r.customerName || t('guest'))
    for (const x of staff.members) m.set('members|' + x.id, x.name || x.email || '')
    return m
  }, [staff.polishes, staff.services, staff.requests, staff.looks, staff.members, pick, t])

  const entries = useMemo(
    () =>
      [...staff.audit]
        .map((e) => {
          const at = Number(e.at) || 0
          const docId = String(e.docId || '')
          const summary = String(e.summary || '').trim()
          const byName = e.byName || t('rep_audit_system')
          let target = docId ? names.get(e.col + '|' + docId) || '' : ''
          if (target && fold(summary).includes(fold(target))) target = '' // summary already names it
          return { ...e, at, docId, summary, byName, target, hay: fold([summary, byName, docId, target].join(' ')) }
        })
        .sort((a, b) => b.at - a.at),
    [staff.audit, names, t],
  )

  const extraAreas = useMemo(() => [...new Set(entries.map((e) => e.col).filter((c) => c && !AREAS.includes(c)))], [entries])
  const tokens = useMemo(() => fold(q).split(/\s+/).filter(Boolean), [q])
  const matchQ = (e) => tokens.every((tk) => e.hay.includes(tk))
  const matchAction = (e) => action === 'all' || e.action === action
  const matchArea = (e) => area === 'all' || e.col === area

  const shown = entries.filter((e) => matchAction(e) && matchArea(e) && matchQ(e))

  // chip counts: each group counts within the other active filters
  const actionCounts = { all: 0 }
  const areaCounts = { all: 0 }
  for (const e of entries) {
    if (!matchQ(e)) continue
    if (matchArea(e)) {
      actionCounts.all++
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1
    }
    if (matchAction(e)) {
      areaCounts.all++
      areaCounts[e.col] = (areaCounts[e.col] || 0) + 1
    }
  }

  // group by Oman day
  const today = todayKey()
  const yesterday = omanDayKey(omanDayRange(today)[0] - 12 * 3600 * 1000)
  const groups = []
  for (const e of shown) {
    const key = e.at ? omanDayKey(e.at) : ''
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, at: e.at, items: [] }
      groups.push(g)
    }
    g.items.push(e)
  }
  const dayLabel = (g) => (!g.key ? '—' : g.key === today ? t('rep_today') : g.key === yesterday ? t('rep_yesterday') : dateOnly(g.at, lang))

  const filtered = action !== 'all' || area !== 'all' || tokens.length > 0
  const clear = () => {
    setAction('all')
    setArea('all')
    setQ('')
  }

  const exportCsv = () => {
    if (!shown.length) return toast(t('rep_csv_empty'), 'warn')
    try {
      const fields = ['rep_acol_time', 'rep_acol_action', 'rep_acol_area', 'rep_acol_record', 'rep_acol_summary', 'rep_acol_by', 'rep_acol_id'].map((k) => t(k))
      const data = shown.map((e) => [omanStamp(e.at), actionLabel(e.action), areaLabel(e.col), e.target, e.summary, e.byName, e.docId])
      // escapeFormulae: summaries can contain customer-typed text; never let it run as a formula
      downloadText('audit-' + today + '.csv', Papa.unparse({ fields, data }, { escapeFormulae: true }))
      toast(t('rep_audit_csv_ready', { n: shown.length }))
    } catch (err) {
      console.warn('[audit csv]', err)
      toast(t('rep_csv_failed'), 'error', 4000)
    }
  }

  const chip = (on) => `chip ${on ? 'chip-on' : 'chip-off'}`
  const countPill = (on, n) => <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${on ? 'bg-white/20' : 'bg-ink/5 text-ink-500'}`}>{n || 0}</span>

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={t('rep_audit_eyebrow')}
        title={t('rep_audit_title')}
        subtitle={t('rep_audit_sub')}
        actions={
          entries.length > 0 && (
            <button className="btn-ghost flex-1 sm:flex-none" onClick={exportCsv}>
              <FileSpreadsheet size={18} />
              {t('rep_csv')}
            </button>
          )
        }
      />

      <div className="mb-5 flex items-start gap-3 rounded-3xl border border-glaze-300/60 bg-glaze-50 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-glaze-700">
          <Lock size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{t('rep_audit_note_title')}</p>
          <p className="mt-0.5 text-[14px] text-ink-500">{t('rep_audit_note')}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <Empty icon={History} title={t('rep_audit_empty_title')} text={t('rep_audit_empty_text')} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <SearchInput value={q} onChange={setQ} placeholder={t('rep_audit_search_ph')} />
            <div role="group" aria-label={t('rep_audit_filter_action')} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              <button className={chip(action === 'all')} aria-pressed={action === 'all'} onClick={() => setAction('all')}>
                {t('all')}
                {countPill(action === 'all', actionCounts.all)}
              </button>
              {ACTIONS.map((a) => {
                const Icon = ACTION_META[a].icon
                const on = action === a
                return (
                  <button key={a} className={chip(on)} aria-pressed={on} onClick={() => setAction(on ? 'all' : a)}>
                    <Icon size={16} />
                    {actionLabel(a)}
                    {countPill(on, actionCounts[a])}
                  </button>
                )
              })}
            </div>
            <div role="group" aria-label={t('rep_audit_filter_area')} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              <button className={chip(area === 'all')} aria-pressed={area === 'all'} onClick={() => setArea('all')}>
                {t('all')}
                {countPill(area === 'all', areaCounts.all)}
              </button>
              {[...AREAS, ...extraAreas].map((c) => {
                const on = area === c
                return (
                  <button key={c} className={chip(on)} aria-pressed={on} onClick={() => setArea(on ? 'all' : c)}>
                    {areaLabel(c)}
                    {countPill(on, areaCounts[c])}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="mb-3 px-1 text-[13px] font-semibold text-ink-500" aria-live="polite">
            {t('rep_audit_count', { shown: shown.length, total: entries.length })}
          </p>

          {shown.length === 0 ? (
            <Empty
              icon={SearchX}
              title={t('rep_audit_nomatch_title')}
              text={t('rep_audit_nomatch_text')}
              action={
                filtered && (
                  <button className="btn-ghost" onClick={clear}>
                    {t('rep_audit_clear')}
                  </button>
                )
              }
            />
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => (
                <section key={g.key || 'none'}>
                  <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-[13px] font-bold text-ink-500">
                    <span>{dayLabel(g)}</span>
                    <span className="tabular-nums text-ink-400">{g.items.length}</span>
                  </h2>
                  <ul className="card divide-y divide-ink/5">
                    {g.items.map((e) => (
                      <AuditRow key={e.id || e.at + e.docId + e.summary} e={e} t={t} lang={lang} actionLabel={actionLabel} areaLabel={areaLabel} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AuditRow({ e, t, lang, actionLabel, areaLabel }) {
  const meta = ACTION_META[e.action] || FALLBACK_META
  const Icon = meta.icon
  const isStock = e.action === 'stock'
  const delta = isStock ? Number(e.summary) : NaN
  return (
    <li className="flex gap-3 p-3 sm:p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.tone}`} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-bold">{actionLabel(e.action)}</span>
          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[12px] font-bold text-ink-500">{areaLabel(e.col)}</span>
        </div>
        {(e.target || e.summary) && (
          <p className="mt-1 break-words text-[14px] text-ink-700">
            {e.target && <bdi className="font-bold">{e.target}</bdi>}
            {e.target && e.summary && <span className="text-ink-300"> — </span>}
            {isStock && e.summary ? (
              <>
                {t('stock')}{' '}
                <bdi dir="ltr" className={`font-bold tabular-nums ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : ''}`}>
                  {e.summary}
                </bdi>
              </>
            ) : (
              e.summary && <bdi>{e.summary}</bdi>
            )}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-400">
          <bdi className="font-semibold text-ink-500">{e.byName}</bdi>
          <span aria-hidden="true">·</span>
          <span>{dateTime(e.at, lang) || '—'}</span>
          {e.docId && (
            <>
              <span aria-hidden="true">·</span>
              <bdi dir="ltr" className="font-mono text-[11px]" title={`${t('rep_audit_record_id')}: ${e.docId}`}>
                #{shortId(e.docId)}
              </bdi>
            </>
          )}
        </p>
      </div>
    </li>
  )
}
