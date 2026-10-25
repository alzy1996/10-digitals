// Formatting helpers. Oman time (Asia/Muscat, UTC+4) is the business clock for "today" and reports.
export const TZ = 'Asia/Muscat'

export function money(amount, lang = 'en', currency = 'OMR') {
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  const r = Math.round(n * 1000) / 1000
  const v = Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/0+$/, '')
  const AR = { OMR: 'ر.ع.', AED: 'د.إ', SAR: 'ر.س', QAR: 'ر.ق', KWD: 'د.ك', BHD: 'د.ب', USD: '$' }
  if (lang === 'ar' && AR[currency]) return currency === 'USD' ? `$${v}` : `${v} ${AR[currency]}`
  return `${v} ${currency}`
}

export function dateTime(ms, lang = 'en') {
  if (!ms) return ''
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
      timeZone: TZ,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toLocaleString()
  }
}

export function dateOnly(ms, lang = 'en') {
  if (!ms) return ''
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(ms))
}

/** YYYY-MM-DD of a timestamp in Oman time */
export function omanDayKey(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** [startMs, endMs) of an Oman calendar day given 'YYYY-MM-DD' (Muscat has no DST: fixed UTC+4) */
export function omanDayRange(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d, 0, 0, 0) - 4 * 3600 * 1000
  return [start, start + 24 * 3600 * 1000]
}

export function todayKey() {
  return omanDayKey(Date.now())
}

export function relTime(ms, lang = 'en') {
  if (!ms) return ''
  const diff = (Date.now() - ms) / 1000
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' })
  if (diff < 60) return rtf.format(-Math.round(diff), 'second')
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  return rtf.format(-Math.round(diff / 86400), 'day')
}

/** WhatsApp click-to-chat link (free; no API). */
export function waLink(phoneDigits, text) {
  const p = String(phoneDigits || '').replace(/[^0-9]/g, '')
  const q = text ? '?text=' + encodeURIComponent(text) : ''
  return p ? `https://wa.me/${p}${q}` : `https://wa.me/${q}`
}

export function normalizePhone(input) {
  let p = String(input || '').replace(/[^0-9+]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if (/^[79]\d{7}$/.test(p)) p = '968' + p // Oman local mobile → international
  return p
}
