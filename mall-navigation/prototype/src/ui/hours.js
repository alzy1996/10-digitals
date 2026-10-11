/**
 * Opening hours (v0.5, DESIGN-MALL.md): the mall's weekly hours, dated specials (Ramadan, Eid: expected dates) and
 * each shop's own hours, as lists of intervals. An interval whose close is at or before its open runs past midnight
 * ("20:00"-"01:00"); "24:00" is midnight. `previewId` evaluates any date as if it were inside that special (the
 * "Preview Ramadan hours" switch). Pure; the venue's time zone comes from `meta.timezone`.
 */
import { t, toArabicDigits } from '../i18n/strings.js'

export const DAY_KEYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
export const WEEK_ORDER = Object.freeze(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'])
const SHORT = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' }

export function venueDate(index, date = new Date()) {
  const timeZone = index?.venue?.meta?.timezone || 'Asia/Muscat'
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, dow: SHORT[parts.weekday], clock: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` }
}

export const specials = (index) => index?.venue?.meta?.hours?.specials ?? []

export function activeSpecial(index, date = new Date(), previewId = null) {
  const list = specials(index)
  if (previewId) return list.find((s) => s.id === previewId) ?? null
  const { ymd } = venueDate(index, date)
  return list.find((s) => s.from <= ymd && ymd <= s.to) ?? null
}

export function mallIntervals(index, date = new Date(), previewId = null) {
  const sp = activeSpecial(index, date, previewId)
  if (sp) return sp.mall
  return index?.venue?.meta?.hours?.weekly?.[venueDate(index, date).dow] ?? []
}

export function shopIntervals(index, shop, date = new Date(), previewId = null) {
  const own = shop?.hours?.open && shop?.hours?.close ? [shop.hours] : []
  const sp = activeSpecial(index, date, previewId)
  if (!sp || sp.shops !== 'mall') return own
  if (sp.kind === 'ramadan' && shop?.ramadan?.length) return shop.ramadan
  return own.length ? sp.mall : []
}

const inside = (iv, clock) => {
  const close = iv.close === '24:00' ? '24:00' : iv.close
  return close > iv.open ? clock >= iv.open && clock < close : clock >= iv.open || clock < close
}

export function openNow(intervals, clock) {
  if (!intervals?.length) return null
  const cur = intervals.find((iv) => inside(iv, clock))
  if (cur) return { isOpen: true, until: cur.close, opensAt: null }
  const later = intervals.filter((iv) => iv.open > clock).sort((a, b) => (a.open < b.open ? -1 : 1))[0]
  const first = [...intervals].sort((a, b) => (a.open < b.open ? -1 : 1))[0]
  return { isOpen: false, until: null, opensAt: (later ?? first).open }
}

const fmt = (hhmm, lang) => {
  const s = hhmm === '24:00' ? '00:00' : hhmm
  return lang === 'ar' ? toArabicDigits(s) : s
}

export function hoursText(intervals, clock, lang) {
  const st = openNow(intervals, clock)
  if (!st) return null
  if (st.isOpen) {
    const midnight = st.until === '24:00' || st.until === '00:00'
    return { ok: true, text: midnight ? t('common.openUntilMidnight', lang) : t('common.openUntil', lang, { time: fmt(st.until, lang) }) }
  }
  return { ok: false, text: `${t('common.closedNow', lang)} · ${t('common.opensAt', lang, { time: fmt(st.opensAt, lang) })}` }
}

export const intervalText = (iv, lang) => `${fmt(iv.open, lang)}–${fmt(iv.close, lang)}`

export function weekTable(index, date = new Date()) {
  const today = venueDate(index, date).dow
  const weekly = index?.venue?.meta?.hours?.weekly ?? {}
  return WEEK_ORDER.map((dow) => ({ dow, intervals: weekly[dow] ?? [], isToday: dow === today }))
}
