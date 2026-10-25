// Dashboard: what needs attention NOW (new requests, low stock) + today's KPIs in Oman time.
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Inbox, Images, CalendarCheck, AlertTriangle, Sparkles, Plus, FileBarChart, ArrowRight, MessageCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, StatCard, StatusChip } from './common'
import { NailSwatch } from '../components/NailSwatch'
import { QrCard } from '../components/QrCard'
import { Empty } from '../components/ui'
import { omanDayKey, todayKey, relTime, waLink } from '../lib/format'
import { paintsOf } from '../features/tryon/design'

export default function Dashboard() {
  const { t, pick, lang } = useI18n()
  const { staff, user } = useData()
  const navigate = useNavigate()
  const today = todayKey()

  const k = useMemo(() => {
    const isToday = (r) => r.createdAt && omanDayKey(r.createdAt) === today
    const reqToday = staff.requests.filter(isToday)
    const looksToday = staff.looks.filter(isToday)
    const newReq = staff.requests.filter((r) => r.status === 'new')
    const bookedToday = [...reqToday, ...looksToday].filter((r) => r.status === 'booked').length
    const low = staff.polishes.filter((p) => p.active !== false && typeof p.stock === 'number' && p.stock <= 2)
    // top shades over the last 7 days
    const weekAgo = Date.now() - 7 * 86400000
    const count = new Map()
    for (const r of [...staff.requests, ...staff.looks]) {
      if (!r.createdAt || r.createdAt < weekAgo) continue
      for (const p of paintsOf(r.design || { base: {}, perFinger: {} })) {
        if (!p.hex) continue
        const key = (p.polishId || p.hex) + '|' + p.finish
        const e = count.get(key) || { n: 0, p }
        e.n++
        count.set(key, e)
      }
    }
    const top = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 6)
    return { reqToday, looksToday, newReq, bookedToday, low, top }
  }, [staff, today])

  const hello = (user?.displayName || '').split(' ')[0]

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Muscat', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={hello ? t('hello_name', { name: hello }) : t('nav_dashboard')}
        subtitle={t('dashboard_sub')}
        actions={
          <>
            <Link to="/try" className="btn-mocha">
              <Sparkles size={18} />
              {t('open_studio')}
            </Link>
            <Link to="/admin/inventory?new=1" className="btn-ghost">
              <Plus size={18} />
              {t('add_polish')}
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('kpi_new_requests')} value={k.newReq.length} icon={Inbox} tone={k.newReq.length ? 'mocha' : 'ink'} hint={t('kpi_new_requests_hint')} onClick={() => navigate('/admin/requests')} />
        <StatCard label={t('kpi_looks_today')} value={k.looksToday.length + k.reqToday.length} icon={Images} hint={t('kpi_looks_today_hint')} onClick={() => navigate('/admin/looks')} />
        <StatCard label={t('kpi_booked_today')} value={k.bookedToday} icon={CalendarCheck} tone="glaze" />
        <StatCard label={t('kpi_low_stock')} value={k.low.length} icon={AlertTriangle} tone={k.low.length ? 'warn' : 'ink'} hint={t('kpi_low_stock_hint')} onClick={() => navigate('/admin/inventory?filter=low')} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[28px] font-semibold">{t('latest_requests')}</h2>
            <Link to="/admin/requests" className="inline-flex items-center gap-1 text-[14px] font-bold text-mocha">
              {t('see_all')} <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
          </div>
          {k.newReq.length === 0 && staff.requests.length === 0 ? (
            <Empty icon={Inbox} title={t('no_requests_title')} text={t('no_requests_text')} />
          ) : (
            <div className="flex flex-col gap-2">
              {(k.newReq.length ? k.newReq : staff.requests).slice(0, 6).map((r) => (
                <div key={r.id} className="card relative flex items-center gap-3 p-3">
                  <Link to={`/admin/requests?open=${r.id}`} className="absolute inset-0 rounded-3xl" aria-label={r.customerName || t('guest')} />
                  {r.thumb ? <img src={r.thumb} alt="" className="h-16 w-12 shrink-0 rounded-xl object-cover" /> : <NailSwatch hex={r.design?.base?.hex} finish={r.design?.base?.finish} size={34} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{r.customerName || t('guest')}</p>
                    <p className="truncate text-[12px] text-ink-500">
                      {pick(r.design?.base || {})} · {relTime(r.createdAt, lang)}
                    </p>
                  </div>
                  <StatusChip status={r.status || 'new'} />
                  {r.customerPhone && (
                    <a href={waLink(r.customerPhone, t('wa_reply_template', { name: r.customerName || '' }))} target="_blank" rel="noopener noreferrer" className="icon-btn relative h-11 w-11 bg-ok/10 text-ok" aria-label={t('whatsapp')}>
                      <MessageCircle size={18} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 font-display text-[28px] font-semibold">{t('top_shades_week')}</h2>
            {k.top.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-ink/15 p-5 text-[14px] text-ink-500">{t('top_shades_empty')}</p>
            ) : (
              <div className="card divide-y divide-ink/5">
                {k.top.map(({ n, p }) => (
                  <div key={(p.polishId || p.hex) + p.finish} className="flex items-center gap-3 p-3">
                    <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{pick(p)}</span>
                    <span className="text-[14px] font-bold text-mocha">× {n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {k.low.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-[28px] font-semibold">{t('low_stock_list')}</h2>
              <div className="card divide-y divide-ink/5">
                {k.low.slice(0, 6).map((p) => (
                  <Link key={p.id} to={`/admin/inventory?edit=${p.id}`} className="flex items-center gap-3 p-3">
                    <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                      {p.brand} {pick(p)}
                    </span>
                    <span className={`text-[13px] font-bold ${p.stock <= 0 ? 'text-bad' : 'text-warn'}`}>{p.stock}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <QrCard salonName={pick(staff.salon || {})} />
          <Link to="/admin/reports" className="btn-ghost">
            <FileBarChart size={18} />
            {t('daily_report')}
          </Link>
        </section>
      </div>
    </div>
  )
}
