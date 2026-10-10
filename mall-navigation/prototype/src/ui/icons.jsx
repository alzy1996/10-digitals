/**
 * Inline SVG icons (PLAN.md section 9: inline SVG components, no icon font). 24 x 24 grid, rounded strokes.
 * Turn arrows are drawn in walking direction (forward = up) and are never mirrored in Arabic.
 * Zone icons (falcon, palm, dhow, oryx, rose, fort, turtle, frankincense) are filled silhouettes for the
 * parking zone badges.
 */

import { ZONE_ICON_PATHS } from '../engine/tokens.js'

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const F = { fill: 'currentColor', stroke: 'none' }

const PATHS = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" {...S} />
      <path d="M15.5 15.5 20.5 20.5" {...S} />
    </>
  ),
  back: <path d="M19.5 12H5M11 5.5 4.5 12l6.5 6.5" {...S} />,
  chevron: <path d="M9 5.5l6.5 6.5L9 18.5" {...S} />,
  close: <path d="M6 6l12 12M18 6 6 18" {...S} />,
  check: <path d="M4.5 12.5l5 5L19.5 7" {...S} strokeWidth="2.8" />,
  pin: (
    <>
      <path d="M12 21.5s-6.5-5.9-6.5-11.6a6.5 6.5 0 0 1 13 0c0 5.7-6.5 11.6-6.5 11.6z" {...S} />
      <circle cx="12" cy="9.8" r="2.4" {...F} />
    </>
  ),
  scan: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" {...S} />
      <path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3v3h-3zM8 13h3v3H8z" {...F} />
    </>
  ),
  car: (
    <>
      <path d="M5 11.5 6.8 6.6A1.5 1.5 0 0 1 8.2 5.6h7.6a1.5 1.5 0 0 1 1.4 1l1.8 4.9" {...S} />
      <path d="M4 12.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" {...S} />
      <path d="M6.5 18v2M17.5 18v2" {...S} />
      <circle cx="7.6" cy="14.7" r="1.3" {...F} />
      <circle cx="16.4" cy="14.7" r="1.3" {...F} />
    </>
  ),
  food: (
    <>
      <path d="M5.5 3v5.5a3 3 0 0 0 6 0V3M8.5 3v18" {...S} />
      <path d="M18 21V3.3c-2.2.8-3.6 3.9-3.6 7.4 0 1.8 1.2 3 3.6 3" {...S} />
    </>
  ),
  cafe: (
    <>
      <path d="M4.5 9.5h11.5v4.5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5z" {...S} />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.9 1.1.9 2 0 3.2M12 3.5c-.9 1.1.9 2 0 3.2" {...S} />
    </>
  ),
  restroom: (
    <>
      <circle cx="6.5" cy="4.6" r="2" {...F} />
      <path d="M4.3 8.3h4.4a1 1 0 0 1 1 1v5.2H8.4V21H4.6v-6.5H3.3V9.3a1 1 0 0 1 1-1z" {...F} />
      <circle cx="17.5" cy="4.6" r="2" {...F} />
      <path d="M16 8.3h3l2.6 7.2h-2.3V21h-3.6v-5.5h-2.3z" {...F} />
      <path d="M12 3v18" {...S} strokeWidth="1.4" />
    </>
  ),
  // single-gender restroom pictograms, matching the map pins (src/engine/icons.js)
  man: (
    <>
      <circle cx="12" cy="4.2" r="2.6" {...F} />
      <rect x="7.9" y="7.5" width="8.2" height="7.9" rx="1.9" {...F} />
      <rect x="8.6" y="14.2" width="2.8" height="8.3" {...F} />
      <rect x="12.6" y="14.2" width="2.8" height="8.3" {...F} />
    </>
  ),
  woman: (
    <>
      <circle cx="12" cy="4.2" r="2.6" {...F} />
      <path d="M9.4 7.5h5.2l3 9H6.4z" {...F} />
      <rect x="9.4" y="16.1" width="2.1" height="6.4" {...F} />
      <rect x="12.6" y="16.1" width="2.1" height="6.4" {...F} />
    </>
  ),
  prayer: (
    <>
      <path d="M12 3.2c.9 1.7 5 3 5 7.6H7c0-4.6 4.1-5.9 5-7.6z" {...S} />
      <path d="M5 10.8h14V21H5zM10.2 21v-3.2a1.8 1.8 0 0 1 3.6 0V21" {...S} />
      <path d="M2.5 21V9.5M2.5 7.5v-.5M21.5 21V9.5M21.5 7.5v-.5" {...S} strokeWidth="1.8" />
    </>
  ),
  pharmacy: <path d="M9.4 3.5h5.2v5.9h5.9v5.2h-5.9v5.9H9.4v-5.9H3.5V9.4h5.9z" {...S} />,
  kids: (
    <>
      <path d="M12 2.8c2.9 0 5.2 2.4 5.2 5.6 0 3.6-2.8 6.4-5.2 6.4s-5.2-2.8-5.2-6.4c0-3.2 2.3-5.6 5.2-5.6z" {...S} />
      <path d="M11 14.8h2l-1 1.6zM12 16.4c-1.2 1.6 1.2 2.8 0 4.8" {...S} />
    </>
  ),
  exit: (
    <>
      <path d="M13 4H6.2A1.2 1.2 0 0 0 5 5.2v13.6A1.2 1.2 0 0 0 6.2 20H13" {...S} />
      <path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" {...S} />
    </>
  ),
  taxi: (
    <>
      <path d="M9.5 6.5V4.8h5v1.7" {...S} />
      <path d="M5 12 6.6 8a1.5 1.5 0 0 1 1.4-1h8a1.5 1.5 0 0 1 1.4 1L19 12" {...S} />
      <path d="M4 13a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM6.5 18v2M17.5 18v2" {...S} />
    </>
  ),
  lift: (
    <>
      <rect x="4" y="2.8" width="16" height="18.4" rx="3" {...S} />
      <path d="M12 5.8l3 3.6H9zM12 18.2l3-3.6H9z" {...F} />
    </>
  ),
  escalator_up: (
    <>
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4" {...S} />
      <path d="M6.5 17h2.8l5.4-8.5h2.8" {...S} />
      <path d="M8 11V6.3M6 8.2l2-2 2 2" {...S} strokeWidth="1.9" />
    </>
  ),
  escalator_down: (
    <>
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4" {...S} />
      <path d="M6.5 17h2.8l5.4-8.5h2.8" {...S} />
      <path d="M8 6.3V11M6 9.1l2 2 2-2" {...S} strokeWidth="1.9" />
    </>
  ),
  stairs: <path d="M3.5 20h4.5v-4.2h4.2v-4.2h4.2V7.4h4.1" {...S} />,
  accessible: (
    <>
      <circle cx="11" cy="4.3" r="2" {...F} />
      <path d="M11 8v6.2h5.2l2.3 5.3M11 10.8h4.6" {...S} />
      <path d="M8.2 11a5.6 5.6 0 1 0 7.4 7.3" {...S} />
    </>
  ),
  play: <path d="M8 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2A.8.8 0 0 0 8 4.8z" {...F} />,
  pause: <path d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z" {...F} />,
  // End the route (a stop square: never the ✕ that reads as "close this view")
  stop: <rect x="6" y="6" width="12" height="12" rx="2.6" {...F} />,
  restart: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" {...S} />
      <path d="M4 3.8v4.6h4.6" {...S} />
    </>
  ),
  stack: (
    <>
      <path d="M12 3.2 3 7.8l9 4.6 9-4.6z" {...S} />
      <path d="M3 12.1l9 4.6 9-4.6M3 16.4 12 21l9-4.6" {...S} />
    </>
  ),
  floor: (
    <>
      <path d="M12 5.5 21 10l-9 4.5L3 10z" {...S} />
      <path d="M3 10v3l9 4.5 9-4.5v-3" {...S} />
    </>
  ),
  map2d: (
    <>
      <path d="M9 4 3.5 6.2v13.6L9 17.6l6 2.4 5.5-2.2V4.2L15 6.4z" {...S} />
      <path d="M9 4v13.6M15 6.4V20" {...S} />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.2" r="2" {...F} />
      <path d="M10.5 21l2.2-6.2 2.8 2.7V21M9 12.2l1.4-3.6a1.6 1.6 0 0 1 2.1-.9l2.3 1 1.6 3.4M12.7 14.8l-1.4-3.4" {...S} />
      <path d="M8.4 21l2-4.6" {...S} />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <path d="M12 7.2V12l3.2 2" {...S} />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <path d="M12 11v5.5" {...S} />
      <circle cx="12" cy="7.6" r="1.3" {...F} />
    </>
  ),
  atm: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" {...S} />
      <circle cx="12" cy="12" r="2.6" {...S} />
      <path d="M6.5 9.5v5M17.5 9.5v5" {...S} />
    </>
  ),
  shop: (
    <>
      <path d="M5.5 8h13l-1 12.5h-11z" {...S} />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" {...S} />
    </>
  ),
  // categories
  fashion: <path d="M10 5.6a2 2 0 1 1 2.6 1.9c-.4.1-.6.5-.6.9v.8l8.4 5.8a1.2 1.2 0 0 1-.7 2.2H4.3a1.2 1.2 0 0 1-.7-2.2L12 9.2" {...S} />,
  electronics: (
    <>
      <rect x="6.8" y="2.6" width="10.4" height="18.8" rx="2.4" {...S} />
      <path d="M10.5 18.2h3" {...S} />
    </>
  ),
  beauty: (
    <>
      <path d="M10 2.8h4v3.2h-4zM11 6v2h2V6" {...S} />
      <rect x="6.5" y="8" width="11" height="13.2" rx="2.6" {...S} />
      <path d="M9.5 14.6h5" {...S} />
    </>
  ),
  grocery: (
    <>
      <path d="M2.8 4h2.6l2.3 10.5h10.2l2.2-7.4H6.3" {...S} />
      <circle cx="9.2" cy="19" r="1.6" {...F} />
      <circle cx="16.8" cy="19" r="1.6" {...F} />
    </>
  ),
  entertainment: (
    <>
      <path d="M3.8 7.6a1 1 0 0 1 1-1h14.4a1 1 0 0 1 1 1v2.5a2 2 0 0 0 0 3.8v2.5a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1v-2.5a2 2 0 0 0 0-3.8z" {...S} />
      <path d="M14.5 7.2v1.6M14.5 11.2v1.6M14.5 15.2v1.6" {...S} />
    </>
  ),
  home: (
    <>
      <path d="M5.2 11V8.2a2 2 0 0 1 2-2h9.6a2 2 0 0 1 2 2V11" {...S} />
      <path d="M3 13.2a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4.4H3zM5 17.6V20M19 17.6V20" {...S} />
    </>
  ),
  health: (
    <>
      <path d="M12 20s-7.8-4.6-7.8-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.8 2.5C19.8 15.4 12 20 12 20z" {...S} />
      <path d="M8 12.2h2.3l1.2-2.2 1.6 4.2 1.1-2h2" {...S} strokeWidth="1.8" />
    </>
  ),
  services: (
    <>
      <path d="M4 17.5h16M5.8 17.5a6.2 6.2 0 0 1 12.4 0M12 8.6V6.8M10.4 6.6h3.2" {...S} />
    </>
  ),
  parking: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" {...S} />
      <path d="M9.5 17V7.5h3.4a2.9 2.9 0 0 1 0 5.8H9.5" {...S} />
    </>
  ),
  // turn arrows (walking direction = up)
  turn_straight: <path d="M12 20.5V4.5M6.5 10 12 4.5l5.5 5.5" {...S} strokeWidth="2.6" />,
  turn_left: <path d="M16.5 21v-7.2a5.8 5.8 0 0 0-5.8-5.8H4.5M9 3.5 4.5 8 9 12.5" {...S} strokeWidth="2.6" />,
  turn_right: <path d="M7.5 21v-7.2a5.8 5.8 0 0 1 5.8-5.8h6.2M15 3.5 19.5 8 15 12.5" {...S} strokeWidth="2.6" />,
  turn_slight_left: <path d="M15.5 21v-6.3c0-2-.8-3.7-2.2-5.1L7.2 4M7 10V4h6" {...S} strokeWidth="2.6" />,
  turn_slight_right: <path d="M8.5 21v-6.3c0-2 .8-3.7 2.2-5.1L16.8 4M17 10V4h-6" {...S} strokeWidth="2.6" />,
  turn_uturn: <path d="M8 21V9.5a4.8 4.8 0 0 1 9.6 0v5.5M13.8 11.6l3.8 3.9 3.8-3.9" {...S} strokeWidth="2.6" />,
  arrive: (
    <>
      <path d="M12 21.5s-6.5-5.9-6.5-11.6a6.5 6.5 0 0 1 13 0c0 5.7-6.5 11.6-6.5 11.6z" {...S} strokeWidth="2.4" />
      <path d="M9.3 10l1.9 1.9 3.6-3.8" {...S} strokeWidth="2.2" />
    </>
  ),
  start: (
    <>
      <circle cx="12" cy="12" r="4.2" {...F} />
      <circle cx="12" cy="12" r="8.4" {...S} />
    </>
  ),
  // v0.2 Walk view: arrival flag, the Walk view eye, footprints (steps estimate)
  flag: (
    <>
      <path d="M6.2 21.2V3.4" {...S} strokeWidth="2.4" />
      <path d="M6.2 4h11.3a.7.7 0 0 1 .6 1.05L15.9 8.6l2.2 3.55a.7.7 0 0 1-.6 1.05H6.2z" {...F} />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.6 12 5.6 21.5 12 21.5 12 18 18.4 12 18.4 2.5 12 2.5 12z" {...S} />
      <circle cx="12" cy="12" r="3.1" {...F} />
    </>
  ),
  footprints: (
    <>
      <path d="M8.1 3c1.8 0 2.7 1.9 2.7 4.2 0 1.9-.8 3.4-.8 4.7H6.2c0-1.3-.9-2.6-.9-4.6C5.3 4.9 6.4 3 8.1 3z" {...F} />
      <path d="M6.3 13.4H10V15a1.85 1.85 0 0 1-3.7 0z" {...F} />
      <path d="M16 7.2c1.8 0 2.7 1.9 2.7 4.2 0 1.9-.8 3.4-.8 4.7h-3.8c0-1.3-.9-2.6-.9-4.6 0-2.4 1.1-4.3 2.8-4.3z" {...F} />
      <path d="M14.2 17.6h3.7v1.6a1.85 1.85 0 0 1-3.7 0z" {...F} />
    </>
  ),
  // parking zone icons (filled): shared with the map pins, see src/engine/tokens.js
  ...Object.fromEntries(
    Object.entries(ZONE_ICON_PATHS).map(([name, parts]) => [
      name,
      <g>
        {parts.map((p, i) =>
          p.stroke ? (
            <path key={i} d={p.d} {...S} strokeWidth={p.stroke} />
          ) : (
            <path key={i} d={p.d} {...F} fillRule={p.rule ?? undefined} />
          ),
        )}
      </g>,
    ]),
  ),
}

/** Every icon name this module can draw. */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS))

/**
 * @param {{ name: string, size?: number, className?: string, title?: string, style?: object }} props
 */
export function Icon({ name, size = 24, className, title, style }) {
  const body = PATHS[name] ?? PATHS.shop
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  )
}

/** Icon name for a step (turn class, connector type, start, arrive): pure JS, shared with the HUD model. */
export { stepIconName } from './stepIcon.js'
