/** "31 Oct" / «٣١ أكتوبر» for a "YYYY-MM-DD" day, with the year only when it is not `thisYear` (v0.5 offers, hours). */
export function formatDay(ymd, lang, thisYear) {
  const d = new Date(`${ymd}T12:00:00Z`)
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC', ...(ymd.slice(0, 4) !== thisYear ? { year: 'numeric' } : {}) }
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', opts).format(d)
}
