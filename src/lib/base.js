// The app can live at the domain root (Firebase Hosting) or under a sub-path (GitHub Pages: /nail-mirror/).
// Vite injects BASE_URL at build time from `base` in vite.config.js (always ends with "/").
export const BASE = import.meta.env.BASE_URL || '/'

/** Path inside the app → path including the base (for <a href>, <img src>, fetch). */
export function withBase(path = '') {
  return BASE + String(path).replace(/^\//, '')
}

/** Absolute shareable URL (QR codes, WhatsApp links, staff invite links). */
export function appUrl(path = '') {
  return window.location.origin + withBase(path)
}
