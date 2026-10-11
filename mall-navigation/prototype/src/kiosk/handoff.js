// src/kiosk/handoff.js
/** "Continue on your phone" (PLAN S21): the kiosk's route as a link the phone opens from the QR code. */
export function handoffUrl({ href, anchorId, targetId, lang }) {
  const u = new URL(href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('from', anchorId)
  u.searchParams.set('to', targetId)
  u.searchParams.set('screen', 'place')
  u.searchParams.set('lang', lang)
  return u.toString()
}
export const isLocalHost = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
