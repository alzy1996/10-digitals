/**
 * Plain colour tokens shared by the UI shell and the 3D engine (PLAN.md section 9 map categories).
 * This module imports nothing, so screens can use it without loading three.js (the engine is a lazy chunk).
 */

/** Category colours (CONTRACT.md section 3, engine). Shop sign bands use these with white text. */
export const CATEGORY_COLORS = Object.freeze({
  fashion: '#AD1457',
  food: '#C2410C',
  cafe: '#8D5524',
  electronics: '#6D28D9',
  beauty: '#BE185D',
  kids: '#0E7C86',
  grocery: '#15803D',
  entertainment: '#7C3AED',
  home: '#92400E',
  health: '#0E7490',
  services: '#475569',
})

/** Map-category colours for amenities and wayfinding pins (PLAN.md section 9 "MAP CATEGORIES"). */
export const PIN_COLORS = Object.freeze({
  restroom: '#0E7490',
  prayer: '#8A6100',
  exit: '#00753A',
  services: '#475569',
  connector: '#334155',
  parking: '#1E3A8A',
})

/**
 * Amenity category -> pin colour group.
 * @param {string} category
 * @returns {keyof typeof PIN_COLORS}
 */
export function amenityGroup(category) {
  if (category.startsWith('restroom')) return 'restroom'
  if (category.startsWith('musalla') || category.startsWith('wudu')) return 'prayer'
  if (category === 'taxi_pickup') return 'exit'
  return 'services'
}

/**
 * Parking zone pictograms (filled silhouettes on a 24 x 24 grid), shared by the UI (inline SVG) and the map pins
 * (drawn into the pin atlas with Path2D). `rule: 'evenodd'` cuts holes; `stroke` draws an outline of that width.
 * @type {Record<string, Array<{ d: string, rule?: 'evenodd', stroke?: number }>>}
 */
export const ZONE_ICON_PATHS = Object.freeze({
  falcon: [
    { d: 'M12 3.6c.7 0 1.3.5 1.5 1.2l.3 1.2 1.2.3c-.4.3-.8.4-1.2.4l.4 1.7c1.6-1.5 4.6-2.6 8.3-2.4-2 1.2-3.3 2.7-4.1 4.3-.9 1.7-2.4 2.8-3.7 3.4l1 5.8-3.7-1.6-3.7 1.6 1-5.8c-1.3-.6-2.8-1.7-3.7-3.4-.8-1.6-2.1-3.1-4.1-4.3 3.7-.2 6.7.9 8.3 2.4l.5-3.4c.2-.8.9-1.4 1.7-1.4z' },
  ],
  palm: [
    { d: 'M11.1 21.6c.4-3.9.6-7.8.4-11.8h1.5c-.1 4 .2 7.9.8 11.8z' },
    { d: 'M12 9.4c2.8-3.2 6.8-3.6 9.8-.8-3.1-.9-6.2-.7-9.8.8z' },
    { d: 'M12 9.4c-2.8-3.2-6.8-3.6-9.8-.8 3.1-.9 6.2-.7 9.8.8z' },
    { d: 'M12 9.2c.8-3.8 3.8-6.2 7.6-5.9-3.1 1-5.6 3-7.6 5.9z' },
    { d: 'M12 9.2c-.8-3.8-3.8-6.2-7.6-5.9 3.1 1 5.6 3 7.6 5.9z' },
    { d: 'M12 9.8c3.3.3 5.8 2.4 6.8 6-1.9-2.6-4.2-4.3-6.8-6z' },
    { d: 'M12 9.8c-3.3.3-5.8 2.4-6.8 6 1.9-2.6 4.2-4.3 6.8-6z' },
  ],
  dhow: [
    { d: 'M2.5 15.2h19l-2.8 4.8H6z' },
    { d: 'M12.6 3.2 20 13.8h-7.4z' },
    { d: 'M11.2 6.2 5.6 13.8h5.6z' },
    { d: 'M11.5 2.6h1.2v12.8h-1.2z' },
  ],
  oryx: [
    { d: 'M7.1 2.2 10.8 10h-1.3L6.2 2.6zM16.9 2.2 13.2 10h1.3l3.3-7.4z' },
    { d: 'M9.2 9.6h5.6l.8 4.4-1.9 6.6h-3.4L8.4 14z' },
    { d: 'M9.4 10.4 5.4 9.6l3.8 2.6zM14.6 10.4l4-.8-3.8 2.6z' },
  ],
  rose: [
    { d: 'M7.4 4.6 9.8 6l2.2-3.2L14.2 6l2.4-1.4v4.2a4.6 4.6 0 0 1-9.2 0z' },
    { d: 'M11.3 13.2h1.4V21.5h-1.4z' },
    { d: 'M12.6 17.4c1-2.4 3.1-3.5 5.4-3.2-1 2.4-3 3.4-5.4 3.2zM11.4 15.8c-1-2.1-2.9-2.9-4.8-2.6.9 2 2.7 2.8 4.8 2.6z' },
  ],
  fort: [
    {
      d: 'M3.2 21.2V8h1.6V6.2h1.8V8h1.3V6.2h1.8V8h1.6v3.4h1.4V9.8h1.7v1.6h1.4V9.8h1.7v1.6h1.4V9.8h1.7v1.6h.9v9.8zm11.3 0v-3.2a1.7 1.7 0 0 1 3.4 0v3.2zM5.6 12.4h2.2v2.6H5.6z',
      rule: 'evenodd',
    },
  ],
  turtle: [
    { d: 'M12 6.6c3.7 0 6.1 2.6 6.1 6s-2.4 6.1-6.1 6.1-6.1-2.6-6.1-6.1 2.4-6 6.1-6z' },
    { d: 'M12 2.4c1.2 0 2.1 1 2.1 2.2S13.2 6.9 12 6.9s-2.1-1.1-2.1-2.3.9-2.2 2.1-2.2z' },
    { d: 'M6.6 9.4C5 7.9 3.4 7.7 2.2 8.4c1 1.6 2.5 2.4 4 2.3zM17.4 9.4c1.6-1.5 3.2-1.7 4.4-1 -1 1.6-2.5 2.4-4 2.3zM6.8 16c-1.4.6-2.4 1.8-2.6 3.3 1.6 0 3-.8 3.8-2.1zM17.2 16c1.4.6 2.4 1.8 2.6 3.3-1.6 0-3-.8-3.8-2.1z' },
    { d: 'M11.2 18.4h1.6L12 21z' },
  ],
  frankincense: [
    { d: 'M6.2 12h11.6v1.6H6.2zM6.8 14.2h10.4l-1.6 4.4H8.4zM8.8 19.2h6.4l.8 2.2H8z' },
    { d: 'M9.8 9.8c-1.3-1.6 1.3-2.6 0-4.6M14.2 9.8c-1.3-1.6 1.3-2.6 0-4.6M12 8.6c-1.1-1.4 1.1-2.3 0-4.6', stroke: 1.8 },
  ],
})
