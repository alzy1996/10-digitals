/**
 * Foldable bottom sheet: the snap / drag maths, pure (no DOM), so it is unit-tested (tests/sheet.test.js).
 *
 * Three snap points, measured as the sheet's visible height in CSS px (its top edge is `viewportH - bottomGap - h`):
 * - `peek`: folded. The handle, the screen's one most important row (the sheet's head: home = the search bar, place =
 *   name, navigate = the step) and its pinned primary action (the footer: GO, Next, Take me there).
 * - `half`: the default. At most half the viewport (the sheet's top edge never above the middle of the screen, so the
 *   map stays clearly visible), cut at a row boundary of the sheet's body (nothing shows half a row).
 * - `full`: up to the viewport minus the header (the content's natural height when that is less). Only here (or when
 *   the content overflows the highest snap) does the body scroll.
 * A sheet that cannot fold by at least `minStep` has one snap (its whole height); a `half` within `minStep` of `peek`
 * folds to `peek` (so a sheet may have one, two or three snaps); `canonicalSnap` names the smallest of a merged group,
 * so a merged 'half' reads as folded ('peek').
 */

export const SNAPS = Object.freeze(['peek', 'half', 'full'])
/** Snap animation length (ms): DESIGN-GLASS motion, 240-300 ms; 0 under prefers-reduced-motion. */
export const SNAP_MS = 260
/** A release faster than this (px/ms) is a flick: it goes to the next snap in its direction. */
export const FLICK_PX_PER_MS = 0.35
/** Snap points closer than this (px) merge into one. */
export const MIN_STEP_PX = 24
/** Finger travel (px) before a press on the handle / head becomes a drag (a shorter one is a tap). */
export const DRAG_SLOP_PX = 6
/** How far (px) the sheet follows the finger below its lowest snap, with resistance. */
export const RUBBER_PX = 32

const isSnap = (s) => SNAPS.includes(s)

/**
 * Snap heights for one sheet in one viewport.
 * @param {object} m
 * @param {number} m.viewportH   app height (CSS px)
 * @param {number} m.topLimit    highest allowed top edge of the sheet (header bottom + gap)
 * @param {number} m.bottomGap   space under the sheet (12 px + the safe-area inset)
 * @param {number} m.chrome      everything but the body: padding, handle, head, footer (= the folded height)
 * @param {number} m.bodyH       the body's full content height (its scrollHeight)
 * @param {number[]} [m.rows]    bottoms (px from the body's top) of the body's rows, for a clean cut at `half`
 * @param {number} [m.halfRatio] the `half` sheet's top edge stays at or below this share of the viewport
 * @param {number} [m.minStep]
 * @param {boolean} [m.stretch]  `full` takes the whole room even when the content is shorter (search: the sheet does not
 *   jump with every key press as the results come and go)
 * @returns {{ peek: number, half: number, full: number, natural: number, maxFull: number, halfLimit: number }}
 */
export function computeSnapHeights({ viewportH, topLimit, bottomGap, chrome, bodyH, rows = null, halfRatio = 0.5, minStep = MIN_STEP_PX, stretch = false }) {
  const vh = Math.max(0, viewportH)
  const maxFull = Math.max(0, Math.floor(vh - bottomGap - Math.max(0, topLimit)))
  const natural = Math.ceil(Math.max(0, chrome) + Math.max(0, bodyH))
  const halfLimit = Math.max(0, Math.floor(vh * halfRatio - bottomGap))
  const peek = Math.min(Math.ceil(Math.max(0, chrome)), maxFull)
  const full = Math.max(peek, stretch ? maxFull : Math.min(natural, maxFull))
  let half
  if (natural <= halfLimit) half = natural
  else if (rows && rows.length) {
    // the deepest row that ends inside the room (none: nothing of the body at `half`)
    let best = 0
    for (const r of rows) if (r > best && chrome + r <= halfLimit) best = r
    half = chrome + best
  } else half = halfLimit
  half = Math.min(Math.max(Math.ceil(half), peek), full)
  // nothing worth folding (a short sheet): one snap, the whole sheet
  if (full - peek < minStep) return { peek: full, half: full, full, natural, maxFull, halfLimit }
  // a half that adds only a sliver over peek folds to peek (full still shows the rest)
  if (half - peek < minStep) half = peek
  return { peek, half, full, natural, maxFull, halfLimit }
}

/** The distinct snap points, lowest first: [{ snap, h }] (a merged group is named by its smallest snap). */
export function distinctSnaps(heights) {
  const out = []
  for (const s of SNAPS) {
    const h = heights[s]
    if (!out.length || Math.abs(h - out[out.length - 1].h) >= 1) out.push({ snap: s, h })
  }
  return out
}

/** The name a snap shows as: the smallest snap with the same height ('half' merged into 'peek' reads 'peek'). */
export function canonicalSnap(heights, snap) {
  const s = isSnap(snap) ? snap : 'half'
  const h = heights[s]
  for (const c of SNAPS) if (Math.abs(heights[c] - h) < 1) return c
  return s
}

/** Is `snap` the highest distinct snap (the body may scroll there)? */
export function isTopSnap(heights, snap) {
  const list = distinctSnaps(heights)
  return Math.abs(heights[isSnap(snap) ? snap : 'half'] - list[list.length - 1].h) < 1
}

/**
 * Where a released drag goes. `h` = the sheet's visible height at release, `velocity` in px/ms with positive =
 * folding (finger moving down). A flick goes to the next snap in its direction; a slow release to the nearest snap
 * (projected a little along its motion).
 * @returns {'peek'|'half'|'full'}
 */
export function pickSnap({ heights, h, velocity = 0, flick = FLICK_PX_PER_MS }) {
  const list = distinctSnaps(heights)
  if (Math.abs(velocity) >= flick) {
    if (velocity > 0) {
      const lower = list.filter((s) => s.h < h - 4)
      return (lower.length ? lower[lower.length - 1] : list[0]).snap
    }
    const higher = list.filter((s) => s.h > h + 4)
    return (higher.length ? higher[0] : list[list.length - 1]).snap
  }
  const projected = h - velocity * 120
  let best = list[0]
  for (const s of list) if (Math.abs(s.h - projected) < Math.abs(best.h - projected)) best = s
  return best.snap
}

/**
 * The height a drag shows for a raw finger height: clamped to the top snap, and below the lowest snap the sheet
 * follows with resistance for at most RUBBER_PX.
 */
export function dragHeight(heights, raw) {
  const list = distinctSnaps(heights)
  const lo = list[0].h
  const hi = list[list.length - 1].h
  if (raw > hi) return hi
  if (raw >= lo) return raw
  const over = lo - raw
  return Math.max(0, lo - RUBBER_PX * (1 - 1 / (over / RUBBER_PX + 1)))
}

/**
 * A tap on the handle (or Enter / Space on it): peek -> half -> full (when the content overflows half) -> peek.
 * @returns {'peek'|'half'|'full'}
 */
export function tapNext(heights, snap) {
  const list = distinctSnaps(heights)
  const cur = canonicalSnap(heights, snap)
  const i = list.findIndex((s) => s.snap === cur)
  if (i < 0 || i === list.length - 1) return list[0].snap
  return list[i + 1].snap
}

/** What a tap on the handle does from `snap`: 'expand' or 'fold' (its label and aria say so). */
export function handleAction(heights, snap) {
  const next = tapNext(heights, snap)
  return heights[next] > heights[canonicalSnap(heights, snap)] + 0.5 ? 'expand' : 'fold'
}

/**
 * Finger velocity (px/ms, positive = moving down) over the last `windowMs` of pointer samples [{ t, y }].
 */
export function velocityOf(samples, windowMs = 100) {
  if (!samples || samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break
    first = samples[i]
  }
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return (last.y - first.y) / dt
}

/** Snap animation length: instant under prefers-reduced-motion. */
export function snapDuration(reducedMotion) {
  return reducedMotion ? 0 : SNAP_MS
}

/**
 * The snap a screen opens at. Search opens full while typing (the keyboard and the results need the room); every
 * other sheet opens at `half`, which keeps the map's top half clear on any phone.
 * @param {string} screen
 * @param {{ filtered?: boolean }} [opts] search: a tile / category list (not typing)
 */
export function defaultSnap(screen, { filtered = false } = {}) {
  if (screen === 'search' && !filtered) return 'full'
  if (screen === 'welcome' || screen === 'emergency') return 'full'
  return 'half'
}

/** Parse a snap name (URL `?sheet=`, test hooks); null when it is not one. */
export function parseSnap(v) {
  return isSnap(v) ? v : null
}
