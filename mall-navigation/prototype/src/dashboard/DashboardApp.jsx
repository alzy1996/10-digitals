import { useEffect, useMemo, useRef, useState } from 'react'
import { addStrings, dirFor, t, toArabicDigits } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { loadVenue } from '../data/venue.js'
import { loadOffers } from '../offers/offers.js'
import { DEFAULT_OPS, createOpsBus } from '../ops/opsBus.js'
import { venueDate } from '../ui/hours.js'
import { Icon } from '../ui/icons.jsx'
import { levelButtonLabel, pick } from '../ui/model.js'
import { initialLang, readUrlParams, rememberLang } from '../ui/urlState.js'
import { BarList, Bars } from './charts.jsx'
import { FloorHeat } from './FloorHeat.jsx'
import { buildStats, plateOk, toCsv } from './stats.js'
import './dashboard.css'

addStrings(MORE)

const VENUE_URL = `${import.meta.env.BASE_URL}venues/demo-muscat/venue.json`
const DOW_EN = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

/**
 * The mall dashboard (v0.5, `?screen=dashboard`; PLAN.md 8 D01-D08 and 13; DESIGN-MALL.md 3.9): what Dallni tells the
 * mall, on synthetic demo data (src/dashboard/stats.js, labelled "Demo data · simulated"). KPI tiles, journeys per day
 * and per hour, top searches, searched-but-not-found (CSV for Leasing), a per-shop heatmap per retail level (counts
 * under 10 hidden), sign health, offer performance, and the demo mall controls (emergency, Ramadan preview) that reach
 * the shopper tabs open in this browser. "Download report" prints (Save as PDF).
 */
export function DashboardApp() {
  const [lang, setLang] = useState(() => initialLang(readUrlParams().lang))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [ops, setOps] = useState(DEFAULT_OPS)
  const busRef = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dirFor(lang)
    rememberLang(lang)
    document.title = lang === 'ar' ? 'دلّني · لوحة المول' : 'Dallni · Mall dashboard'
  }, [lang])

  useEffect(() => {
    let off = false
    Promise.all([loadVenue(VENUE_URL), loadOffers().catch(() => ({ deals: [], newBrands: [] }))])
      .then(([index, offers]) => {
        if (off) return
        setData({ index, offers, stats: buildStats(index, offers, { today: venueDate(index).ymd }) })
      })
      .catch((e) => !off && setError(String(e?.message ?? e)))
    return () => {
      off = true
    }
  }, [])

  useEffect(() => {
    const bus = createOpsBus({ onState: setOps })
    busRef.current = bus
    bus.hello()
    return () => bus.close()
  }, [])

  const ar = lang === 'ar'
  const num = (n) => Math.round(n).toLocaleString(ar ? 'ar-OM' : 'en-GB')
  const pct = (x) => {
    const s = `${Math.round(x * 1000) / 10}`
    return ar ? `${toArabicDigits(s.replace('.', '٫'))}٪` : `${s}%`
  }
  const dur = (s) => {
    const v = `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
    return ar ? toArabicDigits(v) : v
  }

  const toggleEmergency = () => {
    const on = !ops.emergency.on
    if (on && !window.confirm(t('dash.confirmEmergency', lang))) return
    busRef.current?.publish({ emergency: { on, message: null } })
  }
  const toggleRamadan = () => busRef.current?.publish({ hoursPreview: ops.hoursPreview ? null : 'ramadan-2027' })

  const exportCsv = () => {
    const rows = [[t('dash.term', 'en'), t('dash.count', 'en')], ...data.stats.notFound.map((r) => [r.label.en, String(r.count)])]
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'dallni-searched-not-found.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const view = useMemo(() => {
    if (!data) return null
    const { index, offers, stats } = data
    const occName = new Map(index.venue.occupants.map((o) => [o.id, o.name]))
    const plates = [...stats.plates].sort((a, b) => Number(a.ok) - Number(b.ok) || (a.code < b.code ? -1 : 1))
    const dealById = new Map((offers.deals ?? []).map((d) => [d.id, d]))
    return { index, stats, occName, plates, dealById }
  }, [data])

  if (error) return <main className="dash"><p className="dash-error">{t('dash.error', lang, { error })}</p></main>
  if (!view) return <main className="dash"><p className="caption">{t('dash.loading', lang)}</p></main>
  const { index, stats, occName, plates, dealById } = view
  const k = stats.kpis
  const mall = pick(index.venue.meta.name, lang)
  const days = stats.daily.length
  const dayLabel = (d) => (ar ? toArabicDigits(d.ymd.slice(8)) : `${DOW_EN[d.dow]} ${d.ymd.slice(8)}`)
  const KPIS = [
    { icon: 'walk', label: t('dash.kpi.journeys', lang), value: num(k.journeys), sub: t('dash.kpi.journeysSub', lang, { n: num(k.journeys / days) }) },
    { icon: 'sparkle', label: t('dash.kpi.shoppers', lang), value: num(k.shoppers), sub: t('dash.kpi.shoppersSub', lang, { pct: pct(k.share) }) },
    { icon: 'car', label: t('dash.kpi.carSaves', lang), value: num(k.carSaves), sub: t('dash.kpi.carSavesSub', lang) },
    { icon: 'check', label: t('dash.kpi.carSuccess', lang), value: pct(k.carSuccess), sub: t('dash.kpi.carSuccessSub', lang, { n: num(k.carFinds), total: num(k.carSaves) }) },
    { icon: 'shop', label: t('dash.kpi.toShop', lang), value: dur(k.toShopS), sub: t('dash.kpi.before', lang, { t: dur(k.toShopBaseS) }) },
    { icon: 'parking', label: t('dash.kpi.toCar', lang), value: dur(k.toCarS), sub: t('dash.kpi.before', lang, { t: dur(k.toCarBaseS) }) },
    { icon: 'offers', label: t('dash.kpi.offerTaps', lang), value: num(k.offerTaps), sub: t('dash.kpi.offerTapsSub', lang, { pct: pct(k.offerTaps / Math.max(1, k.offerViews)) }) },
  ]
  const retail = index.levels.filter((l) => l.kind !== 'parking').sort((a, b) => b.ordinal - a.ordinal)
  return (
    <main className="dash">
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark" aria-hidden="true">
            <Icon name="pin" size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="dash-title">{t('dash.brand', lang)}</h1>
            <p className="dash-mall">{mall}</p>
          </div>
        </div>
        <div className="dash-chips">
          <span className="dash-chip">{t('dash.range', lang)}</span>
          <span className="dash-chip dash-demo">{t('dash.demo', lang)}</span>
          <span className="badge-sim">{t('app.badge', lang)}</span>
        </div>
        <div className="dash-actions">
          <a className="dash-btn" href={`?lang=${lang}`}>
            <Icon name="map" size={18} />
            {t('dash.openApp', lang)}
          </a>
          <button type="button" className="dash-btn" onClick={() => window.print()}>
            <Icon name="flag" size={18} />
            {t('dash.download', lang)}
          </button>
          <button type="button" className="dash-btn dash-lang" lang={ar ? 'en' : 'ar'} onClick={() => setLang(ar ? 'en' : 'ar')} aria-label={t('lang.toggleLabel', lang)}>
            {t('lang.toggle', lang)}
          </button>
        </div>
      </header>

      <section className="kpi-grid" aria-label={t('dash.brand', lang)}>
        {KPIS.map((x) => (
          <article key={x.label} className="kpi">
            <span className="kpi-label">
              <Icon name={x.icon} size={18} />
              {x.label}
            </span>
            <span className="kpi-value">{x.value}</span>
            <span className="kpi-sub">{x.sub}</span>
          </article>
        ))}
      </section>

      <div className="dash-row">
        <section className="dash-card dash-wide">
          <h2 className="dash-h">{t('dash.daily', lang)}</h2>
          <p className="dash-hint">{t('dash.dailyHint', lang)}</p>
          <Bars values={stats.daily.map((d) => d.journeys)} labels={stats.daily.map(dayLabel)} title={t('dash.daily', lang)} tableLabel={t('dash.chartTable', lang)} tone={(i) => (stats.daily[i].dow === 'thu' || stats.daily[i].dow === 'fri' ? 'hi' : '')} fmt={num} />
        </section>
        <section className="dash-card">
          <h2 className="dash-h">{t('dash.hourly', lang)}</h2>
          <Bars values={stats.hourly} labels={stats.hourly.map((_, h) => (ar ? toArabicDigits(`${h}:00`) : `${h}:00`))} title={t('dash.hourly', lang)} tableLabel={t('dash.chartTable', lang)} tone={(i) => (stats.hourly[i] === Math.max(...stats.hourly) ? 'hi' : '')} fmt={num} />
        </section>
      </div>

      <div className="dash-row">
        <section className="dash-card">
          <h2 className="dash-h">{t('dash.top', lang)}</h2>
          <BarList rows={stats.topSearches.map((r) => ({ label: pick(r.label, lang), value: r.count }))} fmt={num} />
        </section>
        <section className="dash-card">
          <div className="dash-h-row">
            <h2 className="dash-h">{t('dash.notFound', lang)}</h2>
            <button type="button" className="dash-btn dash-btn-sm" onClick={exportCsv}>
              {t('dash.exportCsv', lang)}
            </button>
          </div>
          <p className="dash-hint">{t('dash.notFoundHint', lang)}</p>
          <table className="dash-table notfound-table">
            <thead>
              <tr>
                <th scope="col">{t('dash.term', lang)}</th>
                <th scope="col" className="num">{t('dash.count', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {stats.notFound.map((r) => (
                <tr key={r.label.en}>
                  <td>{pick(r.label, lang)}</td>
                  <td className="num">{num(r.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="dash-card">
        <h2 className="dash-h">{t('dash.heat', lang)}</h2>
        <p className="dash-hint">{t('dash.heatHint', lang)}</p>
        <div className="heat-grid">
          {retail.map((l) => (
            <figure key={l.id} className="heat-fig">
              <figcaption>{pick(l.name, lang)}</figcaption>
              <FloorHeat index={index} levelId={l.id} heat={stats.heat} title={`${t('dash.heat', lang)} · ${pick(l.name, lang)}`} fewLabel={t('dash.heatFew', lang)} nameOf={(id) => pick(occName.get(id) ?? { en: id, ar: id }, lang)} />
            </figure>
          ))}
        </div>
        <div className="heat-legend" aria-hidden="true">
          <span>{t('dash.heatLow', lang)}</span>
          <span className="heat-ramp" />
          <span>{t('dash.heatHigh', lang)}</span>
          <span className="heat-few" />
          <span>{t('dash.heatFew', lang)}</span>
        </div>
      </section>

      <div className="dash-row">
        <section className="dash-card">
          <h2 className="dash-h">{t('dash.plates', lang)}</h2>
          <p className="dash-hint">{t('dash.platesHint', lang)}</p>
          <div className="dash-scroll">
            <table className="dash-table plates-table">
              <thead>
                <tr>
                  <th scope="col">{t('dash.sign', lang)}</th>
                  <th scope="col">{t('dash.level', lang)}</th>
                  <th scope="col" className="num">{t('dash.scans', lang)}</th>
                  <th scope="col">{t('dash.status', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {plates.map((p) => (
                  <tr key={p.anchorId} className={p.ok ? '' : 'is-bad'}>
                    <td>
                      <bdi dir="ltr" className="plate-code">{p.code}</bdi> {pick(p.label, lang)}
                    </td>
                    <td>
                      <bdi dir="ltr">{levelButtonLabel(index, p.levelId, lang)}</bdi>
                    </td>
                    <td className="num">
                      {num(p.actual)} / {num(p.expected)}
                    </td>
                    <td>
                      <span className={`dash-status ${plateOk(p.actual, p.expected) ? 'is-ok' : 'is-bad'}`}>{t(p.ok ? 'dash.ok' : 'dash.check', lang)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="dash-card">
          <h2 className="dash-h">{t('dash.offers', lang)}</h2>
          <div className="dash-scroll">
            <table className="dash-table offers-table">
              <thead>
                <tr>
                  <th scope="col">{t('dash.shop', lang)}</th>
                  <th scope="col">{t('dash.deal', lang)}</th>
                  <th scope="col" className="num">{t('dash.views', lang)}</th>
                  <th scope="col" className="num">{t('dash.taps', lang)}</th>
                  <th scope="col" className="num">{t('dash.rate', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {stats.offers.map((o) => (
                  <tr key={o.dealId}>
                    <td>{pick(occName.get(o.occupantId) ?? { en: o.occupantId, ar: o.occupantId }, lang)}</td>
                    <td>{dealById.get(o.dealId) ? pick(dealById.get(o.dealId).figure, lang) : ''}</td>
                    <td className="num">{num(o.views)}</td>
                    <td className="num">{num(o.taps)}</td>
                    <td className="num">{pct(o.taps / Math.max(1, o.views))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="dash-card dash-controls">
        <h2 className="dash-h">{t('dash.controls', lang)}</h2>
        <p className="dash-hint">{t('dash.controlsHint', lang)}</p>
        <button type="button" role="switch" aria-checked={ops.emergency.on} className="switch-row ops-emergency" onClick={toggleEmergency}>
          <Icon name="warning" size={24} />
          <span className="flex-1">
            <span className="block ops-title">{t('dash.emergency', lang)}</span>
            <span className="block dash-hint">{t('dash.emergencyHint', lang)}</span>
          </span>
          <span className="switch" aria-hidden="true" />
        </button>
        <button type="button" role="switch" aria-checked={Boolean(ops.hoursPreview)} className="switch-row ops-ramadan" onClick={toggleRamadan}>
          <Icon name="clock" size={24} />
          <span className="flex-1">
            <span className="block ops-title">{t('dash.ramadan', lang)}</span>
            <span className="block dash-hint">{t('dash.ramadanHint', lang)}</span>
          </span>
          <span className="switch" aria-hidden="true" />
        </button>
      </section>

      <p className="caption dash-foot">{pick(index.venue.meta.disclaimer, lang)}</p>
    </main>
  )
}
