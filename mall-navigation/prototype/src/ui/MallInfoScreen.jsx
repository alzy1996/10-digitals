import { forwardRef } from 'react'
import { addStrings, t } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { formatDay } from './dates.js'
import { intervalText, mallIntervals, mallStatus, specials, venueDate, weekTable } from './hours.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { entityInfo, pick } from './model.js'
import './mallinfo.css'

addStrings(MORE)

/** The services listed on Mall info: the info desk (lost & found), money, taxi, the accessible restroom. */
const SERVICE_CATEGORIES = ['info_desk', 'atm', 'taxi_pickup', 'restroom_accessible']

/**
 * Mall info (v0.5, DESIGN-MALL.md 3.5): open now, today's and the week's hours, Ramadan / Eid hours (expected dates)
 * with a "Preview in the app" switch, the services, what to do in an emergency, and the demo controls.
 */
export const MallInfoScreen = forwardRef(function MallInfoScreen({ index, lang, hoursPreview, onPreview, onOpen, onEmergencyDemo, onBack }, ref) {
  const now = new Date()
  const status = mallStatus(index, lang, now, hoursPreview)
  const today = mallIntervals(index, now, hoursPreview)
  const thisYear = venueDate(index, now).ymd.slice(0, 4)
  const services = SERVICE_CATEGORIES.map((c) => index.venue.amenities.find((a) => a.category === c)).filter(Boolean)
  const list = (ivs) => (ivs.length ? ivs.map((iv) => intervalText(iv, lang)).join(lang === 'ar' ? '، ' : ', ') : t('info.closedAllDay', lang))
  return (
    <Sheet
      ref={ref}
      label={t('info.title', lang)}
      className="info-sheet"
      head={
        <div className="flex items-center gap-3">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          <h2 className="title flex-1 min-w-0">{t('info.title', lang)}</h2>
        </div>
      }
    >
      <div className="info-body" data-sheet-rows="">
        <div className="info-card info-today">
          <div className="info-card-h">
            <Icon name="clock" size={20} />
            {t('info.today', lang)}
          </div>
          {status ? <span className={`status-chip ${status.ok ? 'is-open' : 'is-closed'}`}>{status.text}</span> : null}
          <p className="info-hours">
            <bdi>{list(today)}</bdi>
          </p>
        </div>

        <div className="info-card">
          <div className="info-card-h">{t('info.week', lang)}</div>
          <table className="hours-table">
            <tbody>
              {weekTable(index, now).map((d) => (
                <tr key={d.dow} aria-current={d.isToday ? 'date' : undefined}>
                  <th scope="row">{t(`day.${d.dow}`, lang)}</th>
                  <td>
                    <bdi>{list(d.intervals)}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="info-card">
          <div className="info-card-h">{t('info.special', lang)}</div>
          {specials(index).map((sp) => {
            const on = hoursPreview === sp.id
            return (
              <div key={sp.id} className="special-row">
                <div className="min-w-0">
                  <div className="special-name">{pick(sp.name, lang)}</div>
                  <div className="caption">
                    {t('info.range', lang, { from: formatDay(sp.from, lang, thisYear), to: formatDay(sp.to, lang, thisYear) })}
                    {sp.expected ? ` · ${t('info.expected', lang)}` : ''}
                  </div>
                  <div className="special-hours">
                    <bdi>{list(sp.mall)}</bdi>
                  </div>
                </div>
                <button type="button" role="switch" aria-checked={on} className="switch-row special-switch" onClick={() => onPreview(on ? null : sp.id)} aria-label={`${t('info.preview', lang)}: ${pick(sp.name, lang)}`}>
                  <Icon name="clock" size={22} />
                  <span className="flex-1">{t('info.preview', lang)}</span>
                  <span className="switch" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>

        <div className="list" data-sheet-rows="">
          <div className="list-head section-label">{t('info.services', lang)}</div>
          {services.map((a) => {
            const info = entityInfo(index, a.id)
            return (
              <button key={a.id} type="button" className="row" onClick={() => onOpen(a.id)}>
                <span className="row-icon" style={{ background: info?.color ?? '#334155', color: '#FFFFFF' }}>
                  <Icon name={info?.icon ?? 'info'} size={24} />
                </span>
                <span className="row-main">
                  <span className="row-title block">{pick(a.name, lang)}</span>
                </span>
                <span className="row-end">
                  <Icon name="chevron" size={20} className="flip-rtl" />
                </span>
              </button>
            )
          })}
        </div>

        <div className="info-card emergency-info" role="note">
          <div className="info-card-h">
            <Icon name="warning" size={20} />
            {t('info.emergencyTitle', lang)}
          </div>
          <p>{t('info.emergencyText', lang)}</p>
        </div>

        {onEmergencyDemo ? (
          <div className="info-demo">
            <div className="section-label">{t('info.demo', lang)}</div>
            <button type="button" className="btn-ghost info-demo-btn" onClick={onEmergencyDemo}>
              <Icon name="warning" size={20} />
              {t('info.startEmergency', lang)}
            </button>
          </div>
        ) : null}
      </div>
    </Sheet>
  )
})
