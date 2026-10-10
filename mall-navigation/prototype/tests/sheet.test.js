import { describe, it, expect } from 'vitest'
import {
  MIN_STEP_PX,
  RUBBER_PX,
  SNAP_MS,
  canonicalSnap,
  computeSnapHeights,
  defaultSnap,
  distinctSnaps,
  dragHeight,
  handleAction,
  isTopSnap,
  parseSnap,
  pickSnap,
  snapDuration,
  tapNext,
  velocityOf,
} from '../src/ui/sheetModel.js'
import { SHEET_FIXTURES } from './fixtures/sheet-measures.js'

/** A typical home sheet at 393 x 728 (Sam's phone in the Claude app's artifact viewer), no safe area. */
const HOME_393 = {
  viewportH: 728,
  topLimit: 80,
  bottomGap: 12,
  chrome: 120,
  bodyH: 330,
  rows: [74, 148, 214, 280, 330],
}

describe('sheet snap heights', () => {
  it('peek = the folded chrome; half keeps the top half of the viewport for the map; full stops under the header', () => {
    const h = computeSnapHeights(HOME_393)
    expect(h.peek).toBe(120)
    // half: the sheet's top edge at or below the middle of the screen
    expect(728 - 12 - h.half).toBeGreaterThanOrEqual(728 / 2)
    expect(h.half).toBeLessThanOrEqual(h.halfLimit)
    expect(h.halfLimit).toBe(352)
    // full: the content's natural height (it fits under the header)
    expect(h.natural).toBe(450)
    expect(h.full).toBe(450)
    expect(h.maxFull).toBe(728 - 12 - 80)
  })

  it('half is cut at a row boundary (never half a row)', () => {
    const h = computeSnapHeights(HOME_393)
    // rows end at 74, 148, 214, 280 (+120 chrome): 120 + 214 = 334 is the deepest that fits 352
    expect(h.half).toBe(334)
    expect(HOME_393.rows.map((r) => r + 120)).toContain(h.half)
  })

  it('without rows, half is the half-screen limit', () => {
    const h = computeSnapHeights({ ...HOME_393, rows: null })
    expect(h.half).toBe(352)
  })

  it('a bottom safe area (iPhone home indicator) lowers the half limit by the same amount', () => {
    const h = computeSnapHeights({ ...HOME_393, bottomGap: 46 })
    expect(h.halfLimit).toBe(318)
    expect(728 - 46 - h.half).toBeGreaterThanOrEqual(364)
    expect(h.half).toBe(120 + 148)
  })

  it('full is clamped to the viewport minus the header, and the body then scrolls', () => {
    const h = computeSnapHeights({ ...HOME_393, bodyH: 2000, rows: null })
    expect(h.full).toBe(728 - 12 - 80)
    expect(h.natural).toBe(2120)
  })

  it('stretch: full takes the whole room even for short content (search results come and go)', () => {
    const h = computeSnapHeights({ ...HOME_393, bodyH: 64, rows: [64], stretch: true })
    expect(h.full).toBe(728 - 12 - 80)
    expect(h.half).toBe(120 + 64)
  })

  it('short content: all three snaps merge into one, the whole sheet (nothing hidden)', () => {
    const h = computeSnapHeights({ ...HOME_393, chrome: 260, bodyH: 20, rows: [20] })
    expect(h.peek).toBe(280)
    expect(h.half).toBe(280)
    expect(h.full).toBe(280)
    expect(distinctSnaps(h)).toEqual([{ snap: 'peek', h: 280 }])
  })

  it('full keeps the last rows even when they add less than 24 px over half', () => {
    // rows end at 150 and 165: half cuts at 150 (165 does not fit 352), full shows the rest
    const h = computeSnapHeights({ ...HOME_393, chrome: 200, bodyH: 165, rows: [150, 165] })
    expect(h.half).toBe(350)
    expect(h.full).toBe(365)
  })

  it('snaps closer than 24 px merge; a merged snap reads as the smallest', () => {
    const h = computeSnapHeights({ ...HOME_393, chrome: 300, bodyH: 300, rows: [40, 300] })
    // 300 + 40 = 340 fits 352 but is only 40 px above peek: kept; 300 + 300 = 600 = full
    expect(h.half).toBe(340)
    const h2 = computeSnapHeights({ ...HOME_393, chrome: 300, bodyH: 300, rows: [20, 300] })
    expect(h2.half).toBe(300)
    expect(canonicalSnap(h2, 'half')).toBe('peek')
    expect(distinctSnaps(h2).map((s) => s.snap)).toEqual(['peek', 'full'])
  })

  it('a very short viewport clamps peek to the room under the header', () => {
    const h = computeSnapHeights({ viewportH: 300, topLimit: 80, bottomGap: 12, chrome: 260, bodyH: 400 })
    expect(h.peek).toBe(208)
    expect(h.full).toBe(208)
    expect(h.half).toBe(208)
  })
})

describe('sheet snap selection', () => {
  const H = { peek: 120, half: 334, full: 450 }

  it('a slow release goes to the nearest snap', () => {
    expect(pickSnap({ heights: H, h: 140, velocity: 0 })).toBe('peek')
    expect(pickSnap({ heights: H, h: 300, velocity: 0 })).toBe('half')
    expect(pickSnap({ heights: H, h: 420, velocity: 0 })).toBe('full')
    // either side of the midpoint between peek and half (227)
    expect(pickSnap({ heights: H, h: 230, velocity: 0 })).toBe('half')
    expect(pickSnap({ heights: H, h: 224, velocity: 0 })).toBe('peek')
  })

  it('a flick goes to the next snap in its direction (positive velocity = folding)', () => {
    expect(pickSnap({ heights: H, h: 320, velocity: 0.8 })).toBe('peek')
    expect(pickSnap({ heights: H, h: 330, velocity: -0.8 })).toBe('full')
    expect(pickSnap({ heights: H, h: 140, velocity: -0.8 })).toBe('half')
    expect(pickSnap({ heights: H, h: 440, velocity: 0.8 })).toBe('half')
    // past the ends: stays at the end
    expect(pickSnap({ heights: H, h: 120, velocity: 1.5 })).toBe('peek')
    expect(pickSnap({ heights: H, h: 450, velocity: -1.5 })).toBe('full')
  })

  it('a slow drift is projected a little along its motion', () => {
    // at 230 (nearest: half), moving down at 0.3 px/ms projects to 194 (nearest: peek)
    expect(pickSnap({ heights: H, h: 230, velocity: 0.3 })).toBe('peek')
  })

  it('only distinct snaps are candidates', () => {
    const merged = { peek: 200, half: 200, full: 500 }
    expect(pickSnap({ heights: merged, h: 260, velocity: 0 })).toBe('peek')
    expect(pickSnap({ heights: merged, h: 260, velocity: -1 })).toBe('full')
  })

  it('velocity from pointer samples over the last 100 ms', () => {
    const s = [
      { t: 0, y: 0 },
      { t: 50, y: 10 },
      { t: 200, y: 40 },
      { t: 250, y: 80 },
      { t: 300, y: 120 },
    ]
    // window: from t = 200 (y 40) to t = 300 (y 120): 0.8 px/ms down
    expect(velocityOf(s)).toBeCloseTo(0.8)
    expect(velocityOf([{ t: 0, y: 5 }])).toBe(0)
    expect(velocityOf([{ t: 10, y: 50 }, { t: 30, y: 10 }])).toBeCloseTo(-2)
  })
})

describe('sheet drag clamping', () => {
  const H = { peek: 120, half: 334, full: 450 }

  it('follows the finger between the lowest and the top snap', () => {
    expect(dragHeight(H, 200)).toBe(200)
    expect(dragHeight(H, 450)).toBe(450)
  })

  it('never goes above the top snap', () => {
    expect(dragHeight(H, 600)).toBe(450)
  })

  it('below the lowest snap it resists, at most RUBBER_PX', () => {
    const a = dragHeight(H, 100)
    const b = dragHeight(H, 0)
    const c = dragHeight(H, -5000)
    expect(a).toBeLessThan(120)
    expect(a).toBeGreaterThan(100)
    expect(b).toBeLessThan(a)
    expect(c).toBeGreaterThanOrEqual(120 - RUBBER_PX)
  })
})

describe('sheet handle', () => {
  it('a tap cycles peek -> half -> full -> peek', () => {
    const H = { peek: 120, half: 334, full: 450 }
    expect(tapNext(H, 'peek')).toBe('half')
    expect(tapNext(H, 'half')).toBe('full')
    expect(tapNext(H, 'full')).toBe('peek')
    expect(handleAction(H, 'peek')).toBe('expand')
    expect(handleAction(H, 'half')).toBe('expand')
    expect(handleAction(H, 'full')).toBe('fold')
  })

  it('content that fits at half: the tap toggles peek <-> half', () => {
    const H = { peek: 120, half: 300, full: 300 }
    expect(tapNext(H, 'peek')).toBe('half')
    expect(tapNext(H, 'half')).toBe('peek')
    expect(tapNext(H, 'full')).toBe('peek')
    expect(handleAction(H, 'half')).toBe('fold')
    expect(isTopSnap(H, 'half')).toBe(true)
    expect(isTopSnap(H, 'peek')).toBe(false)
  })

  it('half merged into peek: the tap toggles peek <-> full', () => {
    const H = { peek: 240, half: 240, full: 400 }
    expect(canonicalSnap(H, 'half')).toBe('peek')
    expect(tapNext(H, 'half')).toBe('full')
    expect(tapNext(H, 'full')).toBe('peek')
  })

  it('one snap only: the tap stays (nothing to fold)', () => {
    const H = { peek: 240, half: 240, full: 240 }
    expect(tapNext(H, 'half')).toBe('peek')
    expect(handleAction(H, 'half')).toBe('fold')
    // (Sheet.jsx hides such a handle from assistive tech and Tab: it does nothing)
    expect(distinctSnaps(H)).toHaveLength(1)
  })

  it('the handle label says what a tap does: "Expand" below the top snap, "Fold" at it', () => {
    // Sheet.jsx: aria-expanded = (action === 'fold'), so the state never contradicts the label
    const H = { peek: 120, half: 334, full: 450 }
    expect(['peek', 'half', 'full'].map((s) => handleAction(H, s))).toEqual(['expand', 'expand', 'fold'])
    const merged = { peek: 200, half: 200, full: 400 }
    expect(['peek', 'half', 'full'].map((s) => handleAction(merged, s))).toEqual(['expand', 'expand', 'fold'])
  })
})

describe('sheet defaults, motion, parsing', () => {
  it('every screen opens at half; search opens full while typing', () => {
    for (const s of ['home', 'place', 'navigate', 'arrived', 'car', 'scan']) expect(defaultSnap(s)).toBe('half')
    expect(defaultSnap('search')).toBe('full')
    expect(defaultSnap('search', { filtered: true })).toBe('half')
  })

  it('snap animation: 240-300 ms, instant under reduced motion', () => {
    expect(SNAP_MS).toBeGreaterThanOrEqual(240)
    expect(SNAP_MS).toBeLessThanOrEqual(300)
    expect(snapDuration(false)).toBe(SNAP_MS)
    expect(snapDuration(true)).toBe(0)
  })

  it('parses ?sheet= values', () => {
    expect(parseSnap('peek')).toBe('peek')
    expect(parseSnap('full')).toBe('full')
    expect(parseSnap('huge')).toBe(null)
    expect(parseSnap(null)).toBe(null)
  })
})

describe('sheet heights measured in the app, per screen and viewport', () => {
  // tests/fixtures/sheet-measures.js: chrome / body / row measurements taken from the running app
  // (scripts/screenshots.mjs --measure), so these hold for the real layouts in both languages
  it('has measurements for every sheet screen at the four test viewports', () => {
    const screens = new Set(SHEET_FIXTURES.map((f) => f.screen))
    for (const s of ['home', 'search', 'place', 'navigate', 'arrived', 'car', 'scan']) expect(screens.has(s), s).toBe(true)
    const sizes = new Set(SHEET_FIXTURES.map((f) => `${f.width}x${f.height}`))
    for (const v of ['393x728', '390x844', '390x664', '360x640']) expect(sizes.has(v), v).toBe(true)
  })
  for (const f of SHEET_FIXTURES) {
    it(`${f.variant ?? f.screen} ${f.lang} ${f.width}x${f.height}${f.bottomGap > 12 ? ' (safe area)' : ''}`, () => {
      const h = computeSnapHeights(f)
      // folded: the head row and the pinned primary action, nothing else (a sheet too short to fold: all of it)
      if (h.full - Math.ceil(f.chrome) >= 24) expect(h.peek).toBe(Math.ceil(f.chrome))
      else expect(h.peek).toBe(h.full)
      expect(h.peek).toBeLessThanOrEqual(h.half)
      expect(h.half).toBeLessThanOrEqual(h.full)
      expect(h.full).toBeLessThanOrEqual(h.maxFull)
      // half: the map keeps at least the top half of the viewport
      expect(f.height - f.bottomGap - h.half).toBeGreaterThanOrEqual(f.height / 2 - 1)
      // half: a clean row cut (or the whole content, or nothing of the body)
      const cut = h.half - Math.ceil(f.chrome)
      if (h.half !== h.natural && h.half !== h.full && cut > 0) expect(f.rows.some((r) => Math.abs(Math.ceil(f.chrome) + r - h.half) <= 1)).toBe(true)
      // the body shows whole at full, or scrolls there when it is taller than the room
      if (h.natural <= h.maxFull && !f.stretch) expect(h.full).toBe(h.natural)
      // home folds to the search bar, with the map clearly visible
      if (f.screen === 'home') {
        expect(h.peek).toBeLessThan(f.height * 0.25)
        expect(h.full - h.peek).toBeGreaterThan(100)
      }
      // full stays under the header
      expect(f.height - f.bottomGap - h.full).toBeGreaterThanOrEqual(f.topLimit - 1)
      // navigate, the car card and arrived fold to their one row (the step + Next, the car + Take me there, the tick +
      // Found it): the folded sheet leaves the map almost whole, and folding really lowers it (Sam: "can't fold it")
      if (['navigate', 'car', 'arrived'].includes(f.variant)) {
        expect(h.peek).toBeLessThanOrEqual(f.height * 0.32)
        expect(h.half - h.peek).toBeGreaterThanOrEqual(MIN_STEP_PX)
        expect(distinctSnaps(h).length).toBeGreaterThanOrEqual(2)
      }
      // every sheet that has more than its head row can fold: its lowest snap is under its default (half)
      if (h.natural - Math.ceil(f.chrome) >= 24 && f.variant !== 'car-confirm') expect(h.half).toBeGreaterThan(h.peek)
      // scanning a plate: at least the first plate row shows at half
      if (f.variant === 'car-scan' || f.variant === 'scan') expect(h.half - Math.ceil(f.chrome)).toBeGreaterThanOrEqual(64)
    })
  }
})
