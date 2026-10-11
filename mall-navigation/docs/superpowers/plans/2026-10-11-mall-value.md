# Dallni v0.5 "Mall Value" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add a "Find me" first screen, Map | Offers tabs, an Offers page with deals and new brands, Ramadan-aware
hours, Mall info, Facilities, emergency mode, a kiosk mode with QR handoff, a mall dashboard and a proper wide-screen
layout to the Dallni prototype, without breaking the 110 KiB first-screen budget.

**Architecture:**
- **Behaviour in pure modules** (hours, offers, first screen, layout, ops bus, exits, facilities, idle, handoff,
  stats), each unit-tested with vitest. React screens stay thin over them.
- **Lazy loading:**
  - The secondary screens are lazy-loaded through a `lazyScreen()` helper that renders synchronously once
    preloaded, so layout and camera effects behave as today.
  - The new pages (offers, mall info / facilities, emergency, kiosk, dashboard) are lazy chunks.
  - The dashboard is a separate entry chosen in `main.jsx`.
- **No 3D engine change:** emergency exits reuse `setScanPins(['entrance'])`.

**Tech Stack:** React 18.3.1, Vite 8, Tailwind 4 + global CSS (app.css), vitest 5, Playwright (probes, `--no-save`),
`qrcode-generator` 2.0.4 (MIT; kiosk chunk only).

**Spec:** `mall-navigation/docs/superpowers/specs/2026-10-11-mall-value-design.md`

## Global Constraints

- **Load budgets** (`tools/check-budgets.mjs`), **none raised**:
  - first screen ≤ 110 KiB;
  - scene3d ≤ 60 KiB;
  - engine3d ≤ 220 KiB;
  - lazy 3D ≤ 260 KiB.
- **Every screen:**
  - Arabic (RTL) and English, with strings in `src/i18n` (en + ar for every key);
  - mobile-first;
  - buttons ≥ 56 px for primary actions, nothing tappable under 44 px;
  - text contrast ≥ 4.5:1;
  - one primary action per sheet.
- **Never:**
  - localStorage for real data (UI state lives in memory; sessionStorage only for the language, as today);
  - CDNs or Google Fonts at runtime;
  - secrets;
  - OCR.
- **Honesty labels:** PROTOTYPE · SIMULATION badge everywhere; "Demo offers · fictional shops"; "Demo data ·
  simulated" on the dashboard; no GPS locate button; "expected" on Ramadan/Eid dates.
- **Brands:** no real brand names, logos or colours on offers or shop cards.
- **Icons:** SVG icons only (`src/ui/icons.jsx`), no emoji.
- **Motion:** 150–300 ms transitions; `prefers-reduced-motion` turns them off.
- **3D engine:** `src/engine/*` is not modified (scene3d 58.4/60 KiB).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch
  `claude/mall-navigation-mapping-app-ioijj1`.
- **Plan ruling:** pure modules and tests are given in full below. UI components (JSX/CSS) are given as exact
  contracts (props, structure, class names, behaviour) and written once in their task; this plan's executor is the
  same session that wrote it.

## Review Focus

1. **Lazy screen opened before its chunk arrives** (a fast tap or a deep link): the sheet must still frame the map
   (padding sent) and never render blank. Deep links preload their screen before `ready`.
2. **Wide layout at 900–1024 px and in RTL:**
   - the docked panel must not cover the level picker or the map;
   - the sheet must not cull map labels (`kind: 'sheet'` is mobile only);
   - resizing across 900 px must re-dock with no stale inline height.
3. **Hours across midnight and specials:** 00:30 in Ramadan is open (20:00–01:00); 16:00 is closed and opens at
   20:00; a shop with its own Ramadan hours overrides the mall.
4. **Emergency while a walk plays or in the Walk view:**
   - the walk stops, the view leaves fpv, the route is cleared and the emergency sheet replaces everything;
   - turning it off returns home with no stale pins.
5. **Kiosk idle reset in the middle of a route:** the reset ends the sim and the route, returns to home with the
   kiosk's fixed you, and shows the attract overlay; no timer is left running after the reset.

These are pinned by tests in Tasks 1, 4, 2, 8 and 9 (`lazyScreen` probe, `widePadding` RTL test, hours midnight
tests, emergency probe, idle-timer test).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/ui/lazyScreen.js` | lazy component that renders synchronously once preloaded | 1 |
| `src/search/tileIds.js` | `TILE_IDS` (no search engine import) | 1 |
| `src/i18n/strings.js` (modify) | `addStrings()`; new first-screen keys | 1, 5 |
| `src/i18n/strings-more.js` | strings for lazy pages (registered by those chunks) | 6–10 |
| `src/ui/hours.js` | venue date, mall/shop intervals, specials, open state, lines, week table | 2 |
| `tools/generate-demo-venue.mjs` (modify) | `meta.hours`, Ramadan shop hours, 4 renamed brands | 2, 3 |
| `public/venues/demo-muscat/offers.json` | deals + new brands | 3 |
| `src/offers/offers.js` | load, live deals, sort, categories, new brands | 3 |
| `src/ui/layoutModel.js` | wide breakpoint, wide padding | 4 |
| `src/ui/Sheet.jsx` (modify) | docked mode | 4 |
| `src/ui/firstScreen.js` | first screen choice, entry choices | 5 |
| `src/ui/WelcomeScreen.jsx`, `src/ui/MainTabs.jsx` | Find me sheet, Map/Offers control | 5 |
| `src/ui/HomeScreen.jsx` (modify) | tabs in head, quick strip | 5 |
| `src/ui/OffersPage.jsx` | Offers page (lazy) | 6 |
| `src/ui/PlaceScreen.jsx` (modify) | offer card, New badge, Ramadan-aware hours | 6 |
| `src/ui/facilities.js` | facility groups | 7 |
| `src/ui/MallInfoScreen.jsx`, `src/ui/FacilitiesScreen.jsx` | lazy sheets | 7 |
| `src/ops/opsBus.js`, `src/ops/exits.js` | ops state + BroadcastChannel, nearest exits | 8 |
| `src/ui/EmergencyScreen.jsx` | lazy sheet | 8 |
| `src/kiosk/idle.js`, `src/kiosk/handoff.js` | idle timer, handoff URL | 9 |
| `src/kiosk/KioskQr.jsx`, `src/kiosk/Attract.jsx` | lazy kiosk UI (QR library here only) | 9 |
| `src/dashboard/stats.js` | synthetic stats | 10 |
| `src/dashboard/DashboardApp.jsx`, `charts.jsx`, `FloorHeat.jsx`, `dashboard.css` | dashboard entry | 10 |
| `src/main.jsx` (modify) | dashboard entry switch | 10 |
| `src/App.jsx`, `src/ui/app.css`, `src/ui/urlState.js` (modify) | wiring, wide CSS, URL params | 1, 4–9 |
| `prototype/DESIGN-MALL.md`, README, CONTRACT §3e, PLAN register, CLAUDE.md | docs | 11 |

Test files: `tests/hours.test.js`, `tests/offers.test.js`, `tests/layout.test.js`, `tests/first-screen.test.js`,
`tests/ops.test.js`, `tests/kiosk.test.js`, `tests/dashboard.test.js`, `tests/facilities.test.js`; extend
`tests/i18n.test.js` and `tests/venue.test.js`.

Test command for every task: `npx vitest run` (in `mall-navigation/prototype`). Tasks that change bundles also run
`npm run build` (vite build + budgets).

---

### Task 1: Code-split the secondary screens + strings registry

**Files:**
- Create: `src/ui/lazyScreen.js`, `src/search/tileIds.js`
- Modify: `src/search/search.js` (import + re-export TILE_IDS), `src/ui/HomeScreen.jsx`, `src/ui/SearchScreen.jsx`
  (own search instance), `src/App.jsx` (lazy screens, preload), `src/i18n/strings.js` (`addStrings`)
- Test: `tests/i18n.test.js` (addStrings)

**Interfaces:**
- Produces:
  - `lazyScreen(load: () => Promise<module>, exportName: string) -> ForwardRefComponent & { preload(): Promise<void> }`;
  - `addStrings(table: Record<string, {en, ar}>)`;
  - `t()` and `hasString()` see added keys;
  - `TILE_IDS` from `src/search/tileIds.js`.

- [ ] **Step 1: failing test for addStrings**

```js
// tests/i18n.test.js (append)
import { addStrings, hasString, t } from '../src/i18n/strings.js'
describe('addStrings', () => {
  it('registers extra keys that t() and hasString() see, with Arabic and params', () => {
    addStrings({ 'test.extra': { en: 'Hello {name}', ar: 'مرحبا {name}' } })
    expect(hasString('test.extra')).toBe(true)
    expect(t('test.extra', 'en', { name: 'Sam' })).toBe('Hello Sam')
    expect(t('test.extra', 'ar', { name: 'سام' })).toBe('مرحبا سام')
  })
})
```

- [ ] **Step 2:** run `npx vitest run tests/i18n.test.js`. Expected: FAIL (`addStrings` is not a function).

- [ ] **Step 3: implement `addStrings`** in `src/i18n/strings.js`:
  - add `const EXTRA = Object.create(null)` and
    `export function addStrings(table) { for (const [k, v] of Object.entries(table)) EXTRA[k] = v }`;
  - in `t()` look up `STRINGS[key] ?? EXTRA[key]`;
  - `hasString` returns `key in STRINGS || key in EXTRA`.

- [ ] **Step 4:** run the test. Expected: PASS.

- [ ] **Step 5: `lazyScreen` helper** (`src/ui/lazyScreen.js`):

```js
import { createElement, forwardRef, lazy } from 'react'

/**
 * A screen component loaded on demand (its own chunk). Once `preload()` has resolved it renders synchronously (no
 * Suspense flash: the sheet mounts in the same commit as its screen, so the App's layout and camera effects see it,
 * as before code-splitting); before that it suspends like React.lazy.
 */
export function lazyScreen(load, exportName) {
  let Comp = null
  let pending = null
  const preload = () => (pending ??= load().then((m) => { Comp = m[exportName] }))
  const Lazy = lazy(() => preload().then(() => ({ default: Comp })))
  const Screen = forwardRef(function LazyScreen(props, ref) {
    return createElement(Comp ?? Lazy, { ...props, ref })
  })
  Screen.preload = preload
  return Screen
}
```

- [ ] **Step 6: TILE_IDS**
  - `src/search/tileIds.js` exports
    `TILE_IDS = Object.freeze(['food', 'restrooms', 'prayer', 'pharmacy', 'kids', 'exit'])`, the same order as
    `Object.keys(TILES)` in search.js (check it).
  - `search.js` imports it and keeps `export { TILE_IDS }`, plus a test assertion that `Object.keys(TILES)` equals it.
    Add to `tests/search.test.js`: `expect(TILE_IDS).toEqual(Object.keys(TILES_FOR_TEST))` if TILES is exported;
    otherwise assert each TILE_ID returns tile results.
  - `HomeScreen.jsx` and `SearchScreen.jsx` import from `../search/tileIds.js`.

- [ ] **Step 7: SearchScreen owns its search**
  - module-level `const cache = new WeakMap()`;
  - `searchFor(index)` returns a cached `createSearch(index)`;
  - the `search` prop is removed;
  - App drops `searchRef` and its `createSearch` import.

- [ ] **Step 8: App lazy screens**
  - Replace the static imports of SearchScreen, PlaceScreen, NavigateScreen, ArrivedScreen, CarScreen and ScanSheet
    with `const SearchScreen = lazyScreen(() => import('./ui/SearchScreen.jsx'), 'SearchScreen')` and so on.
  - `SCREEN_CHUNKS = { search: SearchScreen, place: PlaceScreen, navigate: NavigateScreen, arrived: ArrivedScreen,
    car: CarScreen, scan: ScanSheet }`.
  - In the venue loader, before `dispatch(ready)`: `await SCREEN_CHUNKS[scr]?.preload()`. Navigate needs place too;
    arrived needs navigate: preload `[scr, ...]` as needed. Write it as `Promise.all(neededChunks(scr).map((c) => c.preload()))`.
  - After ready, with the engine's idle callback: `Object.values(SCREEN_CHUNKS).forEach((c) => c.preload().catch(() => {}))`.
  - Wrap the sheets block in `<Suspense fallback={<SkeletonSheet lang={lang} />}>`, where SkeletonSheet is the
    existing loading sheet markup (`section.sheet[aria-busy]`).

- [ ] **Step 9: build and check that the first screen shrank.**
  - Run `npx vitest run` (all pass) and `npm run build`.
  - Expected: "All budgets met"; first screen ≤ 103 KiB (it was 109.5).
  - Record the number in the ledger.

- [ ] **Step 10: smoke.**
  - `npx vite preview --port 4321 --strictPort` (background).
  - `node scratchpad/shot.cjs` on `?screen=navigate&to=occ-muttrah-kitchen&lang=en` and `?screen=search&q=cafe`.
  - Expected: the sheets render with the map framed above them, as before (compare with the r9 screenshots).
  - Stop the server.

- [ ] **Step 11: commit**
  - `git commit -m "perf(app): lazy secondary screens (preloaded), strings registry"`.

---

### Task 2: Hours model (weekly, Ramadan / Eid specials, multi-interval)

**Files:**
- Create: `src/ui/hours.js`, `tests/hours.test.js`
- Modify:
  - `tools/generate-demo-venue.mjs`: `meta.hours`; `ramadan` on occ-sidab-fresh and occ-majlis-cinemas;
  - `src/ui/model.js`: `entityInfo` carries `ramadan`; `hoursLine` delegates to hours.js;
  - `src/ui/PlaceScreen.jsx`: passes the preview;
  - `tools/validate-venue.mjs`, if it rejects unknown fields;
  - regenerate `public/venues/demo-muscat/venue.json`.

**Interfaces:**
- Produces (`src/ui/hours.js`):
  - `DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat']`;
  - `WEEK_ORDER = ['sat','sun','mon','tue','wed','thu','fri']`;
  - `venueDate(index, date) -> { ymd: 'YYYY-MM-DD', dow: DayKey, clock: 'HH:MM' }`;
  - `activeSpecial(index, date, previewId?) -> Special | null`;
  - `mallIntervals(index, date, previewId?) -> Interval[]`;
  - `shopIntervals(index, shop: { hours, ramadan? }, date, previewId?) -> Interval[]`;
  - `openNow(intervals, clock) -> { isOpen, until: string|null, opensAt: string|null }`;
  - `hoursText(intervals, clock, lang) -> { ok: boolean, text: string } | null`;
  - `weekTable(index, date) -> [{ dow, intervals, isToday }]` (WEEK_ORDER);
  - `specials(index) -> Special[]`.
- `Interval = { open: 'HH:MM', close: 'HH:MM' }`. A close at or before the open wraps past midnight; '24:00' means
  midnight.
- `Special = { id, kind: 'ramadan'|'eid', name:{en,ar}, from, to, expected, mall: Interval[], shops: 'mall'|'own' }`.

- [ ] **Step 1: failing tests** (`tests/hours.test.js`):

```js
import { describe, it, expect } from 'vitest'
import { activeSpecial, hoursText, mallIntervals, openNow, shopIntervals, venueDate, weekTable } from '../src/ui/hours.js'

const index = {
  venue: {
    meta: {
      timezone: 'Asia/Muscat',
      hours: {
        weekly: {
          sat: [{ open: '10:00', close: '22:00' }], sun: [{ open: '10:00', close: '22:00' }], mon: [{ open: '10:00', close: '22:00' }],
          tue: [{ open: '10:00', close: '22:00' }], wed: [{ open: '10:00', close: '22:00' }],
          thu: [{ open: '10:00', close: '23:00' }], fri: [{ open: '10:00', close: '23:00' }],
        },
        specials: [
          { id: 'ramadan-2027', kind: 'ramadan', name: { en: 'Ramadan', ar: 'رمضان' }, from: '2027-02-08', to: '2027-03-09', expected: true,
            mall: [{ open: '10:00', close: '15:00' }, { open: '20:00', close: '01:00' }], shops: 'mall' },
          { id: 'eid-fitr-2027', kind: 'eid', name: { en: 'Eid al-Fitr', ar: 'عيد الفطر' }, from: '2027-03-10', to: '2027-03-12', expected: true,
            mall: [{ open: '10:00', close: '24:00' }], shops: 'mall' },
        ],
      },
    },
  },
}
// 2026-10-11 is a Sunday; Muscat is UTC+4
const at = (iso) => new Date(iso)

describe('venue date', () => {
  it('reads the date, weekday and clock in the venue time zone', () => {
    expect(venueDate(index, at('2026-10-11T18:30:00Z'))).toEqual({ ymd: '2026-10-11', dow: 'sun', clock: '22:30' })
    expect(venueDate(index, at('2026-10-11T21:10:00Z'))).toEqual({ ymd: '2026-10-12', dow: 'mon', clock: '01:10' })
  })
})

describe('mall and shop intervals', () => {
  it('uses the weekly hours, longer on Thursday', () => {
    expect(mallIntervals(index, at('2026-10-11T08:00:00Z'))).toEqual([{ open: '10:00', close: '22:00' }])
    expect(mallIntervals(index, at('2026-10-15T08:00:00Z'))).toEqual([{ open: '10:00', close: '23:00' }])
  })
  it('a date inside Ramadan, or the Ramadan preview, gives the two Ramadan intervals', () => {
    const two = [{ open: '10:00', close: '15:00' }, { open: '20:00', close: '01:00' }]
    expect(mallIntervals(index, at('2027-02-20T08:00:00Z'))).toEqual(two)
    expect(mallIntervals(index, at('2026-10-11T08:00:00Z'), 'ramadan-2027')).toEqual(two)
    expect(activeSpecial(index, at('2027-03-11T08:00:00Z'))?.id).toBe('eid-fitr-2027')
    expect(activeSpecial(index, at('2026-10-11T08:00:00Z'))).toBeNull()
  })
  it('shops keep their own hours on normal days, follow the mall in Ramadan unless they have Ramadan hours', () => {
    const shop = { hours: { open: '10:00', close: '22:00' } }
    const grocery = { hours: { open: '08:00', close: '24:00' }, ramadan: [{ open: '08:00', close: '02:00' }] }
    expect(shopIntervals(index, shop, at('2026-10-11T08:00:00Z'))).toEqual([{ open: '10:00', close: '22:00' }])
    expect(shopIntervals(index, shop, at('2026-10-11T08:00:00Z'), 'ramadan-2027')).toHaveLength(2)
    expect(shopIntervals(index, grocery, at('2026-10-11T08:00:00Z'), 'ramadan-2027')).toEqual([{ open: '08:00', close: '02:00' }])
    expect(shopIntervals(index, { hours: null }, at('2026-10-11T08:00:00Z'))).toEqual([])
  })
})

describe('open now', () => {
  const ram = [{ open: '10:00', close: '15:00' }, { open: '20:00', close: '01:00' }]
  it('is closed between the Ramadan intervals and opens at 20:00', () => {
    expect(openNow(ram, '16:00')).toEqual({ isOpen: false, until: null, opensAt: '20:00' })
  })
  it('is open after midnight inside a wrapping interval', () => {
    expect(openNow(ram, '00:30')).toEqual({ isOpen: true, until: '01:00', opensAt: null })
    expect(openNow(ram, '12:00')).toEqual({ isOpen: true, until: '15:00', opensAt: null })
  })
  it('after the last interval opens at the first one (tomorrow)', () => {
    expect(openNow([{ open: '10:00', close: '22:00' }], '23:00')).toEqual({ isOpen: false, until: null, opensAt: '10:00' })
    expect(openNow([{ open: '08:00', close: '24:00' }], '23:59').isOpen).toBe(true)
    expect(openNow([], '12:00')).toBeNull()
  })
})

describe('hours text and week table', () => {
  it('writes the line in English and Arabic', () => {
    expect(hoursText([{ open: '10:00', close: '22:00' }], '12:00', 'en')).toEqual({ ok: true, text: 'Open until 22:00' })
    expect(hoursText([{ open: '08:00', close: '24:00' }], '12:00', 'en').text).toBe('Open until midnight')
    expect(hoursText([{ open: '20:00', close: '01:00' }], '16:00', 'en')).toEqual({ ok: false, text: 'Closed now · Opens at 20:00' })
    expect(hoursText([{ open: '10:00', close: '22:00' }], '12:00', 'ar').text).toContain('٢٢:٠٠')
  })
  it('lists Saturday to Friday and flags today', () => {
    const w = weekTable(index, at('2026-10-11T08:00:00Z'))
    expect(w.map((d) => d.dow)).toEqual(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'])
    expect(w.find((d) => d.isToday).dow).toBe('sun')
  })
})
```

- [ ] **Step 2:** run `npx vitest run tests/hours.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: implement `src/ui/hours.js`:**

```js
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
```

(Check `toArabicDigits` and the `common.*` keys exist in strings.js; they do: `common.openUntil`,
`common.openUntilMidnight`, `common.closedNow`, `common.opensAt`. If `toArabicDigits` turns ':' into something else,
adjust the test to `toContain('٢٢')`.)

- [ ] **Step 4:** run `npx vitest run tests/hours.test.js`. Expected: PASS.

- [ ] **Step 5: venue data.** In `tools/generate-demo-venue.mjs`:
  - Add `meta.hours` exactly as in the test fixture: weekly Sat–Wed 10–22, Thu–Fri 10–23, plus the two specials.
  - `occ-sidab-fresh` gets `ramadan: [{ open: '08:00', close: '02:00' }]`.
  - `occ-majlis-cinemas` gets `ramadan: [{ open: '20:00', close: '02:00' }]`.
  - Run `npm run gen:venue` and `npm run validate:venue`.
  - Expected: OK. If the validator rejects the new fields, teach it the schema (`meta.hours`, `occupant.ramadan`:
    interval arrays of "HH:MM").
  - Add to `tests/venue.test.js`: the demo venue has `meta.hours.weekly.thu[0].close === '23:00'` and a
    `ramadan-2027` special.

- [ ] **Step 6: wire into existing UI.**
  - `entityInfo` adds `ramadan: occ.ramadan ?? null`.
  - `model.hoursLine(index, hours, lang, date, previewId)` becomes:
    `const iv = shopIntervals(index, { hours, ramadan: arguments.ramadan }, date, previewId)` …
    Simpler: PlaceScreen calls
    `hoursText(shopIntervals(index, info, new Date(), hoursPreview), venueDate(index).clock, lang)`.
  - Remove `hoursLine` and `openState` from model.js if nothing else uses them (grep).
  - PlaceScreen gets a `hoursPreview` prop.

- [ ] **Step 7:** run `npx vitest run` (all pass) and `npm run build` (budgets met).

- [ ] **Step 8: commit**
  - `git commit -m "feat(hours): weekly + Ramadan/Eid hours model, multi-interval open state"`.

---

### Task 3: New global brands + offers data + offers model

**Files:**
- Modify: `tools/generate-demo-venue.mjs` (rename 4 occupants), regenerate venue.json
- Create: `public/venues/demo-muscat/offers.json`, `src/offers/offers.js`, `tests/offers.test.js`

**Interfaces:**
- Consumes: `activeSpecial`, `venueDate` (Task 2).
- Produces (`src/offers/offers.js`):
  - `OFFERS_URL`;
  - `loadOffers(url) -> Promise<OffersData>`;
  - `effectiveYmd(index, date, previewId) -> 'YYYY-MM-DD'`;
  - `liveDeals(index, data, { date, previewId }) -> Deal[]` (each `{ ...deal, occupant, levelId, category, isNew }`);
  - `sortDeals(deals, etaOf: (occupantId) => number|null) -> Deal[]`;
  - `dealCategories(deals) -> string[]`;
  - `newBrands(index, data) -> Brand[]` (each `{ occupantId, occupant, levelId, category, origin, openedOn }`);
  - `dealFor(deals, occupantId) -> Deal|null`;
  - `isNewBrand(data, occupantId) -> boolean`;
  - `occupantEta(index, times: Map<nodeId,{etaS}>, occupantId) -> number|null`.

- [ ] **Step 1: rename the brands in the generator.** For each, change the id, the name, the sign text and the
  keywords. Keep the unit and the category.
  - `occ-jebel-sports` → `occ-strivano`:
    - name { en: 'Strivano', ar: 'سترايفانو' }, sign { en: 'STRIDELINE', ar: 'سترايفانو' };
    - keywords en ['sports','running','shoes','trainers','gym'], ar ['رياضة','جري','أحذية','رياضية'].
  - `occ-mango-breeze` → `occ-maison-lumel`:
    - name { en: 'Maison Lumel', ar: 'ميزون لوميل' }, sign { en: 'MAISON LUMEL', ar: 'ميزون لوميل' };
    - keywords en ['cafe','coffee','pastry','croissant','bakery'], ar ['مقهى','قهوة','معجنات','كرواسون'].
  - `occ-noodle-dhow` → `occ-hoshikaze-ramen`:
    - name { en: 'Hoshikaze Ramen Lab', ar: 'مختبر هوشيهوشيكازي' }, sign { en: 'HOSHIKAZE', ar: 'هوشيكازي' };
    - keywords en ['ramen','noodles','japanese','food'], ar ['رامن','نودلز','ياباني','مطعم'].
  - `occ-pixel-souq` → `occ-nova-arcade`:
    - name { en: 'Nova Arcade', ar: 'نوفا أركيد' }, sign { en: 'NOVA ARCADE', ar: 'نوفا أركيد' };
    - keywords en ['games','gaming','arcade','consoles','vr'], ar ['ألعاب','أركيد','بلايستيشن','واقع افتراضي'].
  - Then run `npm run gen:venue`, `npm run validate:venue` (font coverage OK) and `npx vitest run`. Expected: all
    pass. If a test names an old id, update it and record a ruling.

- [ ] **Step 2: `public/venues/demo-muscat/offers.json`:**

```json
{
  "version": 1,
  "note": "Demo offers for fictional shops. Not real prices.",
  "deals": [
    { "id": "d-sahil-autumn", "occupantId": "occ-sahil-fashion", "figure": { "en": "30%", "ar": "٣٠٪" }, "title": { "en": "Off the new autumn collection", "ar": "خصم على تشكيلة الخريف الجديدة" }, "from": "2026-10-01", "to": "2026-10-31" },
    { "id": "d-strivano-open", "occupantId": "occ-strivano", "figure": { "en": "20%", "ar": "٢٠٪" }, "title": { "en": "Opening offer on running shoes", "ar": "عرض الافتتاح على أحذية الجري" }, "from": "2026-10-01", "to": "2026-11-15" },
    { "id": "d-hoshikaze-2for1", "occupantId": "occ-hoshikaze-ramen", "figure": { "en": "2 for 1", "ar": "١ + ١" }, "title": { "en": "Ramen bowls, weekdays 12–4 pm", "ar": "أطباق الرامن، أيام الأسبوع ١٢–٤ مساءً" }, "from": "2026-10-05", "to": "2026-11-30" },
    { "id": "d-lumel-coffee", "occupantId": "occ-maison-lumel", "figure": { "en": "OMR 1", "ar": "١ ر.ع." }, "title": { "en": "Any coffee with a pastry", "ar": "أي قهوة مع قطعة معجنات" }, "from": "2026-10-01", "to": "2026-12-31" },
    { "id": "d-nova-pass", "occupantId": "occ-nova-arcade", "figure": { "en": "40%", "ar": "٤٠٪" }, "title": { "en": "Off kids' game passes", "ar": "خصم على بطاقات ألعاب الأطفال" }, "from": "2026-10-10", "to": "2026-10-25" },
    { "id": "d-rose-gifts", "occupantId": "occ-rose-petal", "figure": { "en": "25%", "ar": "٢٥٪" }, "title": { "en": "Off fragrance gift sets", "ar": "خصم على أطقم العطور" }, "from": "2026-09-20", "to": "2026-10-20" },
    { "id": "d-wasl-protector", "occupantId": "occ-wasl-telecom", "figure": { "en": "FREE", "ar": "مجاناً" }, "title": { "en": "Screen protector with any new phone", "ar": "واقي شاشة مع أي هاتف جديد" }, "from": "2026-10-01", "to": "2026-10-31" },
    { "id": "d-muttrah-iftar", "occupantId": "occ-muttrah-kitchen", "figure": { "en": "OMR 6", "ar": "٦ ر.ع." }, "title": { "en": "Iftar for two", "ar": "إفطار لشخصين" }, "from": "2027-02-08", "to": "2027-03-09" },
    { "id": "d-luqaimat-ramadan", "occupantId": "occ-sweet-luqaimat", "figure": { "en": "15%", "ar": "١٥٪" }, "title": { "en": "Off luqaimat boxes for Ramadan nights", "ar": "خصم على علب اللقيمات لليالي رمضان" }, "from": "2027-02-08", "to": "2027-03-09" },
    { "id": "d-toy-summer", "occupantId": "occ-toy-souq", "figure": { "en": "50%", "ar": "٥٠٪" }, "title": { "en": "Summer toys clearance", "ar": "تصفية ألعاب الصيف" }, "from": "2026-08-01", "to": "2026-08-31" }
  ],
  "newBrands": [
    { "occupantId": "occ-strivano", "origin": { "en": "From Melbourne", "ar": "من ملبورن" }, "openedOn": "2026-09-15" },
    { "occupantId": "occ-maison-lumel", "origin": { "en": "From Paris", "ar": "من باريس" }, "openedOn": "2026-09-28" },
    { "occupantId": "occ-hoshikaze-ramen", "origin": { "en": "From Tokyo", "ar": "من طوكيو" }, "openedOn": "2026-10-02" },
    { "occupantId": "occ-nova-arcade", "origin": { "en": "From Seoul", "ar": "من سيول" }, "openedOn": "2026-10-08" }
  ]
}
```

- [ ] **Step 3: failing tests** (`tests/offers.test.js`): use the real demo venue (`indexVenue` + venue.json, as in
  props.test.js) and the real offers.json.

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { dealCategories, dealFor, effectiveYmd, isNewBrand, liveDeals, newBrands, sortDeals } from '../src/offers/offers.js'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const index = indexVenue(read('../public/venues/demo-muscat/venue.json'))
const data = read('../public/venues/demo-muscat/offers.json')
const OCT = new Date('2026-10-11T08:00:00Z')

describe('offers', () => {
  it('live deals: inside their dates, known shops, no parking levels', () => {
    const ids = liveDeals(index, data, { date: OCT }).map((d) => d.id)
    expect(ids).toContain('d-sahil-autumn')
    expect(ids).not.toContain('d-toy-summer')
    expect(ids).not.toContain('d-muttrah-iftar')
    const junk = { deals: [{ id: 'x', occupantId: 'occ-nope', figure: { en: '1', ar: '١' }, title: { en: 'x', ar: 'x' }, from: '2026-01-01', to: '2027-01-01' }], newBrands: [] }
    expect(liveDeals(index, junk, { date: OCT })).toEqual([])
  })
  it('the Ramadan preview shows the Ramadan deals and hides October ones', () => {
    expect(effectiveYmd(index, OCT, 'ramadan-2027')).toBe('2027-02-08')
    const ids = liveDeals(index, data, { date: OCT, previewId: 'ramadan-2027' }).map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining(['d-muttrah-iftar', 'd-luqaimat-ramadan']))
    expect(ids).not.toContain('d-sahil-autumn')
  })
  it('sorts nearest first, ties by the soonest end, unknown times last', () => {
    const deals = [
      { id: 'a', occupantId: 'o1', to: '2026-12-01' },
      { id: 'b', occupantId: 'o2', to: '2026-10-20' },
      { id: 'c', occupantId: 'o3', to: '2026-10-15' },
      { id: 'd', occupantId: 'o4', to: '2026-10-01' },
    ]
    const eta = { o1: 60, o2: 60, o3: 30, o4: null }
    expect(sortDeals(deals, (id) => eta[id]).map((d) => d.id)).toEqual(['c', 'b', 'a', 'd'])
  })
  it('lists categories, finds a shop deal, resolves the new brands', () => {
    const live = liveDeals(index, data, { date: OCT })
    expect(dealCategories(live)[0]).toBeTypeOf('string')
    expect(dealFor(live, 'occ-sahil-fashion').id).toBe('d-sahil-autumn')
    expect(dealFor(live, 'occ-toy-souq')).toBeNull()
    const brands = newBrands(index, data)
    expect(brands.map((b) => b.occupant.name.en)).toEqual(['Strivano', 'Maison Lumel', 'Hoshikaze Ramen Lab', 'Nova Arcade'])
    expect(brands.every((b) => b.levelId === 'G' || b.levelId === 'L1')).toBe(true)
    expect(isNewBrand(data, 'occ-hoshikaze-ramen')).toBe(true)
    expect(live.find((d) => d.occupantId === 'occ-strivano').isNew).toBe(true)
  })
})
```

- [ ] **Step 4:** run `npx vitest run tests/offers.test.js`. Expected: FAIL (module not found).

- [ ] **Step 5: implement `src/offers/offers.js`:**

```js
/**
 * Offers (v0.5, DESIGN-MALL.md): demo deals and new brands from offers.json. Pull only: shown on the Offers page and
 * a shop's place screen, ordered by walk time from the you-are-here the shopper set (never GPS). Deals on parking
 * levels or outside their dates never show. Pure, except loadOffers (fetch).
 */
import { activeSpecial, venueDate } from '../ui/hours.js'

export const OFFERS_URL = `${import.meta.env?.BASE_URL ?? '/'}venues/demo-muscat/offers.json`

export async function loadOffers(url = OFFERS_URL) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`offers ${res.status}`)
  return res.json()
}

export function effectiveYmd(index, date = new Date(), previewId = null) {
  const sp = previewId ? activeSpecial(index, date, previewId) : null
  return sp ? sp.from : venueDate(index, date).ymd
}

function occupantPlace(index, occupantId) {
  const occ = index.occupantById?.get(occupantId)
  if (!occ) return null
  const unit = index.unitById?.get(occ.unitIds?.[0])
  const level = unit ? index.levelById.get(unit.levelId) : null
  if (!level || level.kind === 'parking') return null
  return { occupant: occ, levelId: level.id, category: occ.category }
}

export const isNewBrand = (data, occupantId) => Boolean(data?.newBrands?.some((b) => b.occupantId === occupantId))

export function liveDeals(index, data, { date = new Date(), previewId = null } = {}) {
  const ymd = effectiveYmd(index, date, previewId)
  const out = []
  for (const d of data?.deals ?? []) {
    if (!(d.from <= ymd && ymd <= d.to)) continue
    const place = occupantPlace(index, d.occupantId)
    if (place) out.push({ ...d, ...place, isNew: isNewBrand(data, d.occupantId) })
  }
  return out
}

export function sortDeals(deals, etaOf) {
  const key = (d) => etaOf(d.occupantId) ?? Infinity
  return [...deals].sort((a, b) => key(a) - key(b) || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
}

export function dealCategories(deals) {
  return [...new Set(deals.map((d) => d.category))]
}

export const dealFor = (deals, occupantId) => deals?.find((d) => d.occupantId === occupantId) ?? null

export function newBrands(index, data) {
  const out = []
  for (const b of data?.newBrands ?? []) {
    const place = occupantPlace(index, b.occupantId)
    if (place) out.push({ ...b, ...place })
  }
  return out
}

/** Walk time (s) from the times map (routing travelTimesFrom) to the nearest entrance of a shop. */
export function occupantEta(index, times, occupantId) {
  const occ = index.occupantById?.get(occupantId)
  let best = null
  for (const n of occ?.entranceNodeIds ?? []) {
    const e = times?.get(n)?.etaS
    if (e != null && (best == null || e < best)) best = e
  }
  return best
}
```

(Check the index maps are named `occupantById` and `unitById` in `src/data/venue.js`; adjust to the real names.)

- [ ] **Step 6:** run `npx vitest run`. Expected: all PASS.

- [ ] **Step 7: commit**
  - `git commit -m "feat(offers): four fictional global brands, demo offers.json, offers model"`.

---

### Task 4: Wide layout (docked side panel)

**Files:**
- Create: `src/ui/layoutModel.js`, `tests/layout.test.js`
- Modify: `src/ui/Sheet.jsx` (docked), `src/App.jsx` (wide state, padding branch, SheetContext), `src/ui/app.css`
  (wide rules)

**Interfaces:**
- Produces:
  - `WIDE_QUERY = '(min-width: 900px) and (min-height: 560px)'`;
  - `isWide(w, h) -> boolean`;
  - `widePadding({ appW, panelRect: {left,right}, ctrlsBottom, levelsRect: {left,right}|null, rtl, gap = 16 })
    -> { top, right, bottom, left }`;
  - SheetContext gains `docked: boolean`.

- [ ] **Step 1: failing tests** (`tests/layout.test.js`):

```js
import { describe, it, expect } from 'vitest'
import { isWide, widePadding } from '../src/ui/layoutModel.js'

describe('wide layout', () => {
  it('is wide from 900 px wide and 560 px tall', () => {
    expect(isWide(899, 900)).toBe(false)
    expect(isWide(900, 560)).toBe(true)
    expect(isWide(1440, 500)).toBe(false)
  })
  it('LTR: the map starts after the panel and ends before the level picker', () => {
    const p = widePadding({ appW: 1440, panelRect: { left: 16, right: 416 }, ctrlsBottom: 88, levelsRect: { left: 1368, right: 1424 }, rtl: false })
    expect(p).toEqual({ top: 96, right: 80, bottom: 16, left: 432 })
  })
  it('RTL: the panel is at the right, the picker at the left', () => {
    const p = widePadding({ appW: 1440, panelRect: { left: 1024, right: 1424 }, ctrlsBottom: 88, levelsRect: { left: 16, right: 72 }, rtl: true })
    expect(p).toEqual({ top: 96, right: 432, bottom: 16, left: 80 })
  })
  it('no picker: only the panel side is padded', () => {
    expect(widePadding({ appW: 1000, panelRect: { left: 16, right: 416 }, ctrlsBottom: 80, levelsRect: null, rtl: false }).right).toBe(16)
  })
})
```

- [ ] **Step 2:** run it. Expected: FAIL (module not found).

- [ ] **Step 3: implement `src/ui/layoutModel.js`:**

```js
/**
 * Wide layout (v0.5, DESIGN-MALL.md 3.10): from 900 x 560 px the sheets dock in a side panel at the start edge and
 * the map takes the rest. Pure maths for the map's free area (engine viewport padding).
 */
export const WIDE_MIN_W = 900
export const WIDE_MIN_H = 560
export const WIDE_QUERY = `(min-width: ${WIDE_MIN_W}px) and (min-height: ${WIDE_MIN_H}px)`
export const isWide = (w, h) => w >= WIDE_MIN_W && h >= WIDE_MIN_H

export function widePadding({ appW, panelRect, ctrlsBottom, levelsRect, rtl, gap = 16 }) {
  const picker = levelsRect ? (rtl ? levelsRect.right + 8 : appW - levelsRect.left + 8) : gap
  const panel = rtl ? appW - panelRect.left + gap : panelRect.right + gap
  return {
    top: Math.round(ctrlsBottom + 8),
    bottom: gap,
    left: Math.round(rtl ? picker : panel),
    right: Math.round(rtl ? panel : picker),
  }
}
```

- [ ] **Step 4:** run it. Expected: PASS.

- [ ] **Step 5: Sheet docked mode** (`src/ui/Sheet.jsx`):
  - `const docked = Boolean(ctx?.docked)`.
  - `snap` is `'full'` when docked.
  - `stretch` is `stretch || docked` (`stretchRef.current`).
  - `onGrabDown`, the body touch handler (`start`) and `onKeyDown` return early when docked (use a `dockedRef`).
  - The grip button is not rendered when docked.
  - The section gets the class `sheet-docked`.

- [ ] **Step 6: App wiring:**
  - `const [wide, setWide] = useState(() => matchMedia(WIDE_QUERY).matches)`, with a listener on `change`; `wideRef`.
  - `.app` gets `is-wide` when wide.
  - `sheetCtx` gets `docked: wide`.
  - `sheetTopLimit` in wide: header bottom + 12.
  - `update()` in wide:
    - padding from `widePadding({ appW: host.right - host.left, panelRect: sheet rect (or header rect when there is
      no sheet), ctrlsBottom: view-ctrl bottom - host.top, levelsRect, rtl })`;
    - the levels cap uses `floor = window.innerHeight - 16`;
    - no `ctrls-covered`;
    - the sheet is pushed as an obstacle **without** `kind: 'sheet'`;
    - `--sheet-top` is the app height.
  - Add `wide` to the layout effect deps.
  - The camera effect re-runs the current screen's framing when `wide` flips: add `wide` to its deps for home and
    welcome only, through a separate effect `useEffect(() => refitAfterSnapRef.current?.(), [wide])`.

- [ ] **Step 7: CSS** (`src/ui/app.css`, a section `/* ---------- wide layout (v0.5) ---------- */`):

```css
.app.is-wide { --panel-w: 400px; }
@media (min-width: 1280px) { .app.is-wide { --panel-w: 432px; } }
.app.is-wide .top { padding: 16px; }
.app.is-wide .header { width: var(--panel-w); max-width: none; margin-inline: 0; }
.app.is-wide .map-ctrls {
  position: absolute; top: 16px; margin: 0; max-width: none;
  inset-inline-start: calc(16px + var(--panel-w) + 16px); inset-inline-end: 16px;
}
.app.is-wide .sheet {
  inset-inline-start: 16px; inset-inline-end: auto; left: auto; right: auto;
  width: var(--panel-w); max-width: none; margin-inline: 0; bottom: 16px; padding-top: var(--pad-sheet);
}
:root[dir="ltr"] .app.is-wide .sheet { left: 16px; }
:root[dir="rtl"] .app.is-wide .sheet { right: 16px; }
.app.is-wide .toast, .app.is-wide .walk-pill { inset-inline-start: calc(16px + var(--panel-w) + 16px); }
```

  (Read the `.toast` and `.walk-pill` rules first; position them in the map area. The physical left/right overrides
  are needed because `.sheet` sets `left`/`right`.)

- [ ] **Step 8: verify.**
  - Run `npx vitest run` (pass) and `npm run build` (budgets).
  - Preview the build; take shots at 1440×900 and 1024×768 on `?lang=en` and `?lang=ar` (home, `screen=place&to=occ-muttrah-kitchen`).
  - Probe at 1440×900: the sheet's rect has left ≤ 16 and width ≤ 432; the canvas's non-sky pixels have their
    centre-of-mass x > panel right edge.
  - Then 390×844: unchanged from before (sheet at the bottom).
  - Stop the server.

- [ ] **Step 9: commit**
  - `git commit -m "feat(layout): wide screens dock the sheet in a side panel; map framed beside it"`.

---

### Task 5: Find me first screen, Map | Offers tabs, quick strip

**Files:**
- Create: `src/ui/firstScreen.js`, `tests/first-screen.test.js`, `src/ui/WelcomeScreen.jsx`, `src/ui/MainTabs.jsx`
- Modify:
  - `src/ui/urlState.js`: screens `welcome|offers|info|facilities|emergency|dashboard`; params `kiosk`, `kioskIdle`,
    `emergency`;
  - `src/App.jsx`, `src/ui/HomeScreen.jsx`, `src/i18n/strings.js` (first-screen keys), `src/ui/app.css`,
    `src/ui/sheetModel.js` (`defaultSnap('welcome') = 'full'`), `src/ui/icons.jsx` (icons: `offers` tag, `info`,
    `facilities`, `qr` if missing).

**Interfaces:**
- Consumes:
  - `mallIntervals`, `hoursText`, `venueDate` (Task 2);
  - `liveDeals` (Task 3);
  - `lazyScreen` (Task 1).
- Produces:
  - `firstScreen(params, { kiosk }) -> { screen, found: boolean }`;
  - `entryChoices(index) -> [{ anchorId, levelId, kind: 'entrance'|'parking', label:{en,ar} }]`;
  - `<MainTabs tab lang onTab />`;
  - `<WelcomeScreen index lang hoursPreview onScan onPick onBrowse ref />`;
  - App state: `tab: 'map'|'offers'` (derived from screen), `toast` gains `{ kind: 'found', text }`.

- [ ] **Step 1: failing tests** (`tests/first-screen.test.js`):

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { entryChoices, firstScreen } from '../src/ui/firstScreen.js'
import { readUrlParams } from '../src/ui/urlState.js'

const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))

describe('first screen', () => {
  it('opens Find me by default', () => {
    expect(firstScreen(readUrlParams(''), { kiosk: false })).toEqual({ screen: 'welcome', found: false })
  })
  it('a plate link opens home with "Found you"', () => {
    expect(firstScreen(readUrlParams('?from=A-G-ENT-E'), { kiosk: false })).toEqual({ screen: 'home', found: true })
  })
  it('an explicit screen wins; a kiosk never shows Find me', () => {
    expect(firstScreen(readUrlParams('?screen=search&from=A-G-ENT-E'), { kiosk: false })).toEqual({ screen: 'search', found: false })
    expect(firstScreen(readUrlParams(''), { kiosk: true })).toEqual({ screen: 'home', found: false })
  })
  it('reads the new URL params', () => {
    const p = readUrlParams('?screen=offers&kiosk=A-G-ENT-S&kioskIdle=5&emergency=1')
    expect(p.screen).toBe('offers')
    expect(p.kiosk).toBe('A-G-ENT-S')
    expect(p.kioskIdle).toBe(5)
    expect(p.emergency).toBe(true)
  })
})

describe('entry choices', () => {
  it('lists the two entrances, then the first lift lobby of each parking level (top first)', () => {
    expect(entryChoices(index).map((c) => c.anchorId)).toEqual(['A-G-ENT-S', 'A-G-ENT-E', 'A-B1-LA', 'A-B2-LA'])
    expect(entryChoices(index)[2]).toMatchObject({ kind: 'parking', levelId: 'B1' })
  })
})
```

- [ ] **Step 2:** run it. Expected: FAIL.

- [ ] **Step 3: implement `src/ui/firstScreen.js`:**

```js
/**
 * Which screen the app opens on (v0.5): Find me ("welcome") unless the URL already says where you are (a plate link,
 * `from=`: home + "Found you") or names a screen; a kiosk opens home (its position is fixed). And the "where did you
 * come in" choices on Find me: the entrances, then the first lift lobby on each parking level (top level first).
 */
export function firstScreen(params, { kiosk = false } = {}) {
  if (params.screen) return { screen: params.screen, found: false }
  if (kiosk) return { screen: 'home', found: false }
  if (params.from) return { screen: 'home', found: true }
  return { screen: 'welcome', found: false }
}

export function entryChoices(index) {
  const out = []
  const anchors = [...index.anchorById.values()]
  const entrances = anchors.filter((a) => a.kind === 'entrance').sort((a, b) => (a.code < b.code ? -1 : 1))
  for (const a of entrances) out.push({ anchorId: a.id, levelId: a.levelId, kind: 'entrance', label: a.label })
  const parking = [...index.levels].filter((l) => l.kind === 'parking').sort((a, b) => b.ordinal - a.ordinal)
  for (const lvl of parking) {
    const lobby = anchors.filter((a) => a.kind === 'lift_lobby' && a.levelId === lvl.id).sort((a, b) => (a.id < b.id ? -1 : 1))[0]
    if (lobby) out.push({ anchorId: lobby.id, levelId: lvl.id, kind: 'parking', label: lobby.label })
  }
  return out
}
```

  (Check the entrance codes sort S before E. If `A-G-ENT-E` has the lower code, sort by an explicit order: South
  first, the venue's `defaultStartAnchorId` first, then by code. Make the test and the code agree on "the default
  start first".)

  `urlState.readUrlParams` adds:
  - `kiosk: str('kiosk')`;
  - `kioskIdle: num('kioskIdle')`;
  - `emergency: str('emergency') === '1'`;
  - SCREENS adds `'welcome','offers','info','facilities','emergency','dashboard'`.

- [ ] **Step 4:** run it. Expected: PASS.

- [ ] **Step 5: strings** (first screen, in `strings.js`, en + ar):

| Key | English | Arabic |
|---|---|---|
| `welcome.title` | Welcome to {mall} | أهلاً بك في {mall} |
| `welcome.where` | Where are you? | أين أنت الآن؟ |
| `welcome.scan` | Scan the Dallni sign near you | امسح لوحة دلّني القريبة منك |
| `welcome.scanSub` | Every sign has a code that knows exactly where it is | كل لوحة تحمل رمزاً يعرف مكانها بالضبط |
| `welcome.orPick` | Or pick where you came in | أو اختر من أين دخلت |
| `welcome.browse` | Just look around | تصفّح الخريطة فقط |
| `welcome.gps` | Indoors, GPS can't tell your floor. The sign's code tells Dallni exactly where you are. | داخل المول لا يعرف الـGPS طابقك. رمز اللوحة يخبر دلّني بمكانك بالضبط. |
| `found.toast` | Found you · {place} · {level} | وجدناك · {place} · {level} |
| `tabs.label` | Main sections | الأقسام الرئيسية |
| `tabs.map` | Map | الخريطة |
| `tabs.offers` | Offers | العروض |
| `strip.open` | Open · until {time} | مفتوح · حتى {time} |
| `strip.closed` | Closed · opens {time} | مغلق · يفتح {time} |
| `strip.facilities` | Facilities | المرافق |
| `strip.offers` | {n} offers | {n} عروض |
| `mall.openNowUntil` | Open now · until {time} | مفتوح الآن · حتى {time} |
| `mall.closedOpens` | Closed now · opens {time} | مغلق الآن · يفتح {time} |
| `emergency.badge` | EMERGENCY | طوارئ |

- [ ] **Step 6: components (Sam's Stitch mock, `stitch_animated_start_menu_screen.zip`, is the reference).**

  The mock is a light pastel "bento" home:
  - a header pill row;
  - a search pill with a Map button;
  - the 3D map with a level column at the end edge and a floating "where you are" pill;
  - a sheet "Where to next?" with a gradient deals banner, two square cards, two compact cards and a pinned
    "Start walking!" bar.

  Adopted with these rulings:
  - SVG icons (`icons.jsx`), not emoji;
  - the self-hosted Readex Pro / Noto Sans Arabic fonts, not Google Fonts;
  - the real status chip ("Open · until 22:00") instead of "ONLINE";
  - the PROTOTYPE · SIMULATION badge stays as the header's second line;
  - no fake points and no showtimes: the "points" become a **demo stamp quest** ("Visit the 4 new brands",
    memory only, labelled Demo);
  - the mock's dark DESIGN.md (Luminous) is not used, because it contradicts the screenshot Sam picked;
  - mock colours that fail 4.5:1 with white text are darkened.

  - **Tokens** (app.css `:root`):
    - `--coral #E5484D`, `--sun #FFD93D`, `--vibrant #2F6FEB`, `--lime #3FA34D`;
    - `--bubble-pink #FFE4E4`, `--bubble-lilac #E8EAFF`, `--bubble-mint #E4F9F5`, `--bubble-peach #FFEEDB`,
      `--bubble-sky #E1F4FF`;
    - `--r-bento 26px`;
    - `--shadow-bento 0 8px 24px -4px rgba(77,150,255,.14), 0 4px 12px -2px rgba(255,107,107,.08)`;
    - `--shadow-pill 0 6px 20px -3px rgba(0,0,0,.08)`.
  - **Header** (`Header.jsx`): one white pill (radius 9999 px, `--shadow-pill`) holding:
    - the round brand mark (a sun-to-coral gradient with the pin icon);
    - the venue name + the status chip (green "OPEN" / grey "CLOSED", from the mall hours);
    - the SIMULATION badge on line two.
    - At the end: the quest pill (amber gradient, star icon, "{n}/4"; ≥ 375 px wide, tap → Offers new brands) and
      the round 48 px language button.
    - Emergency and kiosk variants as in Tasks 8 and 9.
  - **Search row (home only):** MapControls gets a `lead` node: `.map-ctrls.has-lead` lays out
    `[lead: search pill, flex 1][View control]`, and the level column drops below the row at the end edge
    (absolute, `top: calc(100% + 12px)`).
    - The search pill is a 52 px white capsule: magnifier icon in `--vibrant`, placeholder `home.searchPlaceholder`;
      it opens the search screen.
    - The search box leaves the Home sheet's head.
  - **Level column:** a white pill column (radius 9999 px, `--shadow-bento`, 2 px white border). The active level is a
    filled circle with the gradient `#2F6FEB -> #0891B2` and white text; inactive levels are slate-700.
  - **Floating you pill (`.here-float`):**
    - home only: centred in the map area, `bottom: calc(100% - var(--sheet-top) + 12px)`;
    - content: a white pill with a pulsing blue dot (none under reduced motion) and "{place} · {level}";
    - tap → scan (change), not in kiosk mode;
    - pushed as a map obstacle in `update()`.
  - **`MainTabs.jsx`:**
    - `<div role="tablist" aria-label={t('tabs.label')} class="main-tabs">` with two `button role="tab"
      aria-selected` (map icon + "Map", offers icon + "Offers");
    - 44 px segments on a `--bubble-lilac` track; the selected one is a white raised pill;
    - a 200 ms slide of `.main-tabs-ind`, with no motion under reduced-motion;
    - arrow keys move between the tabs.
    - It sits at the top of the Home sheet's head (and of the Offers page).
  - **HomeScreen.jsx** (the mock's bottom sheet):
    - **head:** MainTabs, then a row with:
      - the eyebrow `home.eyebrow` "EXPLORER · DEMO QUEST" (coral, 12 px 700 uppercase) and the amber pill
        `home.questPill` "{n}/4 stamps";
      - the title `home.where` "Where to next?" (22/28 px 700);
      - at the end, the lilac pill `home.spots` "{n} places" (n = occupants + amenities), which opens search.
    - **body (bento):**
      1. **Deals banner** (full width, `--r-bento`, gradient `#E11D48 -> #DB2777 -> #EA580C`, white text ≥ 18.7 px
         bold for 3:1 large-text contrast):
         - a white eyebrow pill (dark rose text) `home.dealsEyebrow` "Deals today";
         - the title `home.dealsTitle` "{n} offers · up to {max} off" (max = the largest % figure; if none, the
           title `home.dealsTitleNoPct` "{n} offers in the mall");
         - the sub-line `home.dealsSub` "New brands from Tokyo, Paris, Seoul…";
         - a gift icon tile.
         - Tap → the Offers tab. Hidden while offers are not loaded or n = 0.
      2. **Two square cards** (2-column grid):
         - (a) **Food:**
           - peach-to-orange background, sun border;
           - an icon tile in `--sun` with dark ink (food icon);
           - the chip `home.hungry` "Hungry? {n} nearby" (n = food + cafe occupants);
           - the title = the nearest food/cafe place's name;
           - a footer row with its level + minutes and an arrow button.
           - Tap → select it as the target.
         - (b) **Find my car:**
           - sky-to-indigo background, vibrant border;
           - a car icon tile in `--vibrant` (white icon);
           - chip `car.saved` / `home.saveSpot`;
           - title `home.findMyCar`;
           - footer: the zone + painted bay code, or `home.saveCarHint`.
           - Tap: a saved car → select the car as the target; none → the car flow.
      3. **Two compact cards** (2-column grid, icon tile + 3 text lines):
         - (c) **New brand:**
           - rose background;
           - the nearest new brand not yet stamped: the chip `home.newFrom` "New · {origin}", its name, level ·
             minutes.
           - Tap → select it.
         - (d) **Facilities:**
           - mint background;
           - the chip `home.facilitiesChip` "Restrooms · {n} min" (the nearest restroom);
           - the title `strip.facilities`;
           - the line `home.facilitiesSub` "Prayer rooms, ATM, taxi".
           - Tap → the Facilities screen.
      4. **Quick chips row** (the six existing tiles as 44 px icon chips, wrapping), then the fictional-venue
         caption. The old car chip and here chip leave the sheet (card b and the floating you pill replace them).
    - **footer (pinned, the mock's bar)**, left side:
      - no target: the eyebrow `home.youAreHereEyebrow` "YOU ARE HERE" + "{place} · {level}";
      - a target picked: the eyebrow `home.target` "YOUR ROUTE" + "{from} -> {to} · {min} min".
    - **footer**, right side, the primary pill (52 px, gradient `#E11D48 -> #DB2777 -> #2F6FEB`, white 16 px 700,
      play icon):
      - no target: `home.findPlace` "Find a place" (opens search);
      - a target: `home.start` "Start walking" → `onStart`.
    - **Card states:** the selected card gets a 3 px `--vibrant` ring and `aria-pressed="true"`. Tap again
      deselects.
  - **Selecting a target on home:**
    - App state `homePick: targetId | null`;
    - a route memo `pickRoute` for it;
    - the engine shows `pickRoute` like the place screen (`showRoute`, `dest` marker, `fit: 'route'`).
    - Cleared when leaving home.
    - `onStart` → `patch({ targetId: homePick, homePick: null, screen: 'navigate', stepIndex: 0, userView: false })`.
  - **Stamp quest:**
    - App `stamps: string[]` (memory only);
    - on `arrived` at a new-brand occupant: add it, toast `quest.stamp` "Stamp collected · {n}/4".
  - **`WelcomeScreen.jsx`** (same bento style, a Sheet, className `welcome-sheet`):
    - head: the title `welcome.title` and the status chip;
    - body:
      - `h3` `welcome.where`;
      - the primary gradient pill button (56 px, qr icon) `welcome.scan` + sub-line `welcome.scanSub` → `onScan`;
      - `welcome.orPick`;
      - a 2-column grid of pastel `.entry-card` buttons (min-height 76 px): an icon tile (door / P), the label, the
        level chip → `onPick(anchorId)`;
      - a text button `welcome.browse`;
      - a caption with the info icon, `welcome.gps`.
  - **Kiosk:** Home hides card (b) and the you pill's change action.
  - **Extra strings** (en / ar):
    - `home.eyebrow` Explorer · demo quest / مستكشف · تحدٍّ تجريبي
    - `home.questPill` {n}/4 stamps / {n}/٤ أختام
    - `home.where` Where to next? / إلى أين الآن؟
    - `home.spots` {n} places / {n} مكان
    - `home.dealsEyebrow` Deals today / عروض اليوم
    - `home.dealsTitle` {n} offers · up to {max} off / {n} عروض · خصم حتى {max}
    - `home.dealsTitleNoPct` {n} offers in the mall / {n} عروض في المول
    - `home.dealsSub` New brands from Tokyo, Paris and Seoul / علامات جديدة من طوكيو وباريس وسيول
    - `home.hungry` Hungry? {n} nearby / جائع؟ {n} قريبة
    - `home.findMyCar` Find my car / أين سيارتي
    - `home.saveSpot` Save your spot / احفظ موقفك
    - `home.saveCarHint` Scan the pillar sign in the car park / امسح لوحة العمود في المواقف
    - `home.newFrom` New · {origin} / جديد · {origin}
    - `home.facilitiesChip` Restrooms · {n} min / دورات المياه · {n} د
    - `home.facilitiesSub` Prayer rooms, ATM, taxi / مصليات، صراف، تاكسي
    - `home.youAreHereEyebrow` You are here / أنت هنا
    - `home.target` Your route / مسارك
    - `home.findPlace` Find a place / ابحث عن مكان
    - `home.start` Start walking / ابدأ المشي
    - `quest.stamp` Stamp collected · {n}/4 / حصلت على ختم · {n}/٤

- [ ] **Step 7: App.**
  - Initial `screen` from `firstScreen(p, { kiosk: Boolean(p.kiosk) })`.
  - `found` → after ready, `foundYou()`:
    - `showFound(you)`: the toast `{ kind: 'found', text: t('found.toast', …) }` for 3.2 s;
    - `goView('floor', you.levelId, 'none')`;
    - `engine.flyTo({ levelId, x, y, distance: 70, tiltDeg: 50, clear: [{ x, y, pin: true }] }, 1200)`.
  - The camera effect gets `case 'welcome': goView('stack', s.you?.levelId ?? s.view.levelId, 'level')`.
  - The `pulse` shows on welcome too.
  - WelcomeScreen handlers:
    - `onScan` → `patch({ screen: 'scan', returnTo: 'welcome' })`. The ScanSheet's `onPick` gets: when
      `returnTo === 'welcome'`, set you, screen home, then `foundYou`. Its back goes to welcome.
    - `onPick(id)` → `patch({ you: youFromAnchor(index, id), screen: 'home' })`, then `foundYou`.
    - `onBrowse` → `patch({ screen: 'home' })`.
  - The toast render branch handles `kind: 'found' | 'stamp'`: an icon + text.
  - Tabs: `onTab('offers')` → `patch({ screen: 'offers' })`; `onTab('map')` → `patch({ screen: 'home' })`.

- [ ] **Step 8: CSS:**
  - the tokens above;
  - `.header` pill restyle;
  - `.map-ctrls.has-lead`, `.search-pill`;
  - the level column restyle;
  - `.here-float`;
  - `.main-tabs`;
  - `.home-head`, `.eyebrow`, `.quest-pill`, `.spots-pill`;
  - `.bento`, `.bento-banner`, `.bento-card` (+ `.is-food`, `.is-car`, `.is-new`, `.is-fac`), `.bento-tile`,
    `.bento-chip`, `.bento-foot`;
  - `.home-bar` (footer) and `.btn-gradient`;
  - `.welcome-sheet`, `.entry-card`, `.status-chip`;
  - the `.toast-found` / `.toast-stamp` variants.
  - Cards scale to 0.97 on `:active` (transform only); hover lifts the shadow; a focus-visible ring of 3 px
    `--vibrant`.
  - Reduced motion: no transforms or transitions.
  - Contrast: add to `tests/ui-theme.test.js` a table of the (fg, bg) pairs the bento uses (chip text on chip
    backgrounds, the footer text, white on each banner gradient stop) and assert ≥ 4.5:1, or ≥ 3:1 for the
    ≥ 18.7 px bold banner title.

- [ ] **Step 9: verify.**
  - Run `npx vitest run` and `npm run build`. Expected: pass; the first screen is still ≤ 110 KiB (record it).
  - Shots at 390×844 (EN and AR) and 1440×900: the default URL shows Find me; home matches the mock's organisation
    (header pill, search row, level column, you pill, bento sheet, pinned Start bar).
  - Tapping the "East entrance" chip gives home + "Found you" toast + floor view.
  - `?from=A-B1-LA` gives home + toast on B1.

- [ ] **Step 10: commit**
  - `git commit -m "feat(ui): Find me first screen, Map | Offers tabs, quick strip"`.

---

### Task 6: Offers page + place screen offer card

**Files:**
- Create: `src/ui/OffersPage.jsx`, `src/i18n/strings-more.js` (offers section)
- Modify: `src/App.jsx` (offers data load at idle, `screen==='offers'` render, deal/new to PlaceScreen),
  `src/ui/PlaceScreen.jsx`, `src/ui/app.css`

**Interfaces:**
- Consumes:
  - `liveDeals`, `sortDeals`, `dealCategories`, `newBrands`, `occupantEta`, `dealFor`, `isNewBrand`, `loadOffers`
    (Task 3);
  - `travelTimesFrom(index, nodeId, { stepFree })` (routing);
  - `MainTabs`, `Header`.
- Produces:
  - `<OffersPage index lang you stepFree offers hoursPreview onTab onShow(occupantId) onToggleLang />`;
  - PlaceScreen props `deal`, `isNew`.

- [ ] **Step 1: strings-more.js (offers)**
  - `offers.title` "Offers & new brands" / «العروض والعلامات الجديدة»
  - `offers.all` "All" / «الكل»
  - `offers.deals` "Deals today" / «عروض اليوم»
  - `offers.until` "Until {date}" / «حتى {date}»
  - `offers.show` "Show me" / «أرني المكان»
  - `offers.newBrands` "New in the mall · global brands" / «جديد في المول · علامات عالمية»
  - `offers.opened` "New · opened {date}" / «جديد · افتُتح {date}»
  - `offers.demo` "Demo offers · fictional shops. Prices are examples." / «عروض تجريبية · متاجر خيالية. الأسعار
    أمثلة.»
  - `offers.none` "No offers in this category right now." / «لا توجد عروض في هذه الفئة حالياً.»
  - `offers.minutes` "{n} min" / «{n} د»
  - `offers.badgeNew` "New" / «جديد»
  - `offers.offer` "Offer" / «عرض»
  - `offers.loading` "Loading offers…" / «جارٍ تحميل العروض…»
  - Dates are formatted with `Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', { day: 'numeric', month:
    'short' })`, the year shown only when it is not the current one.

- [ ] **Step 2: i18n parity test** in `tests/i18n.test.js`: import `MORE` from strings-more.js; every key has
  non-empty `en` and `ar`, and the same `{placeholders}` in both.

- [ ] **Step 3: run it.**
  - Expected: PASS at once for the parity test: it checks the data written in Step 1.
  - The RED for this task is the probe in Step 7 (no Offers page yet).

- [ ] **Step 4: OffersPage** (lazy:
  `const OffersPage = lazyScreen(() => import('./ui/OffersPage.jsx'), 'OffersPage')`). Its module calls
  `addStrings(MORE)` at import.
  - **Layout:** `<main class="page offers-page">`, fixed, inset 0, z 40, sky background, scrolling.
    - `header.page-top` with `<Header>` and `<MainTabs tab="offers">`, sticky (16 px gutter, max-width 1120 px
      centred);
    - `h1` `offers.title`;
    - the demo note pill (amber outline);
    - the chips row (`role="radiogroup"`: All + categories, using the category label keys);
    - `section` "Deals today": a CSS grid (1 column under 640 px, 2 columns at 640 px, 3 columns at 1024 px) of
      `article.deal-card`;
    - `section` "New in the mall": scroll-snap row on mobile, 4-column grid at ≥ 1024 px, of `article.brand-card`.
  - **`deal-card`:**
    - a top band 112 px tall with a `linear-gradient(135deg, <category colour>, <colour mixed 30% with #fff>)`;
    - white text: the figure 44/48 px 700 with tabular numerals, and `offers.offer` as a small pill;
    - a "New" badge if `isNew`;
    - below, on a white card body: the shop name (16 px 600, the UI language, and the other language 70% smaller,
      as on signs), the title, and a meta row with the level chip, `offers.minutes` (from occupantEta) and
      `offers.until`;
    - a footer button `.btn.btn-primary.btn-block` (48 px) `offers.show` → `onShow(occupantId)`.
  - **`brand-card`:**
    - a 64 px monogram tile (the first letter(s) of the English name, on the category colour, white);
    - the name, the origin, `offers.opened`, the level chip and the "Show me" ghost button.
  - **Colours:**
    - category colours from `src/engine/tokens.js` `CATEGORY_COLORS` (no three.js import);
    - text on the bands uses `textOn()` from model.js, which keeps 4.5:1;
    - if `textOn` returns dark ink on a light category colour, use that.
  - **Empty or loading:** offers not loaded → the `offers.loading` skeleton cards; filter empty → `offers.none`.
  - **Footer:** the caption `offers.demo`.
- **App wiring:**
  - `offers` state;
  - `loadOffers()` in the same idle callback as `loadEngine` (`.catch` → `offers: { deals: [], newBrands: [] }`);
  - `screen === 'offers'` renders OffersPage instead of `.top`, the sheets and MapControls;
  - `onShow(id)` → `openPlace(id, 'offers')` (returnTo `offers`, so Back returns to the page).
  - In App, `liveDealsNow = useMemo(() => offers ? liveDeals(index, offers, { previewId: hoursPreview }) : [],
    [offers, hoursPreview])`, passed to Home (count) and Place (`dealFor`).

- [ ] **Step 5: PlaceScreen.**
  - Under the hours: when `deal`, an `.offer-card` (the category band at the side, the figure, the title,
    `offers.until`).
  - Beside the name: the "New" pill when `isNew`.
  - Its strings come from strings-more, so the place chunk also imports `MORE` / `addStrings`.

- [ ] **Step 6: CSS** for `.page`, `.page-top`, `.offers-page`, `.chip-row`, `.deal-card`, `.brand-row`,
  `.brand-card`, `.offer-card`, `.badge-new`.
  - Card radius 24, shadow `0 10px 30px -12px rgba(16,42,67,.28)`; hover lifts the shadow only (no layout shift).
  - `cursor: pointer` on interactive cards.
  - Reduced motion: no transitions.

- [ ] **Step 7: probe (RED → GREEN).**
  - `scratchpad/v05-probes.cjs` gets probe O: open `?screen=offers&lang=en`, wait, then:
    - count `.deal-card` (expect 7 in October: the 10 deals minus 2 Ramadan and 1 expired);
    - the first card's minutes ≤ the second's;
    - click the first "Show me", which gives `.sheet` with the place title.
  - Run before Step 4: FAIL (no page). After Step 6: PASS.

- [ ] **Step 8:** run `npx vitest run` and `npm run build` (budgets; the offers chunk is lazy).

- [ ] **Step 9: commit**
  - `git commit -m "feat(offers): Offers page (deals nearest first, new global brands), offer card on place"`.

---

### Task 7: Mall info + Facilities

**Files:**
- Create: `src/ui/facilities.js`, `tests/facilities.test.js`, `src/ui/MallInfoScreen.jsx`,
  `src/ui/FacilitiesScreen.jsx`
- Modify: `src/i18n/strings-more.js` (info + facilities), `src/App.jsx`, `src/ui/app.css`

**Interfaces:**
- Produces:
  - `FACILITY_GROUPS = [{ id, categories: string[] }]`;
  - `facilityGroups(index, etaOfNode: (nodeId) => number|null) -> [{ id, items: [{ amenity, levelId, etaS }] }]`
    (groups with no items dropped; items sorted by eta, then level ordinal descending, then id);
  - `<MallInfoScreen index lang hoursPreview onPreview(id|null) onOpen(id) onEmergencyDemo onBack />`;
  - `<FacilitiesScreen index lang you stepFree onToggleStepFree onOpen(id) onBack />`.

- [ ] **Step 1: failing test** (`tests/facilities.test.js`):

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { FACILITY_GROUPS, facilityGroups } from '../src/ui/facilities.js'

const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))

describe('facility groups', () => {
  it('puts every amenity in exactly one group', () => {
    const groups = facilityGroups(index, () => null)
    const all = groups.flatMap((g) => g.items.map((i) => i.amenity.id))
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(index.venue.amenities.length)
    expect(groups.map((g) => g.id)).toEqual(FACILITY_GROUPS.map((g) => g.id).filter((id) => groups.some((x) => x.id === id)))
  })
  it('orders a group nearest first', () => {
    const eta = (nodeId) => (nodeId.endsWith('2') ? 10 : 100)
    const rest = facilityGroups(index, eta).find((g) => g.id === 'restrooms')
    expect(rest.items[0].etaS).toBeLessThanOrEqual(rest.items[rest.items.length - 1].etaS)
  })
})
```

- [ ] **Step 2:** run it. Expected: FAIL.

- [ ] **Step 3: implement `src/ui/facilities.js`:**

```js
/** Facilities directory (v0.5): every amenity in one group, nearest first (walk time from you). Pure. */
export const FACILITY_GROUPS = Object.freeze([
  { id: 'restrooms', categories: ['restroom_men', 'restroom_women'] },
  { id: 'family', categories: ['restroom_accessible', 'restroom_family', 'baby_change'] },
  { id: 'prayer', categories: ['musalla_men', 'musalla_women', 'wudu_men', 'wudu_women'] },
  { id: 'money', categories: ['atm', 'exchange'] },
  { id: 'transport', categories: ['taxi_pickup', 'valet', 'ev_charging'] },
  { id: 'help', categories: ['info_desk', 'first_aid', 'lost_found'] },
])
const OTHER = 'help'

export function facilityGroups(index, etaOfNode) {
  const ordinal = (levelId) => index.levelById.get(levelId)?.ordinal ?? 0
  const groups = FACILITY_GROUPS.map((g) => ({ id: g.id, items: [] }))
  for (const a of index.venue.amenities) {
    const gi = FACILITY_GROUPS.findIndex((g) => g.categories.includes(a.category))
    const g = groups[gi >= 0 ? gi : FACILITY_GROUPS.findIndex((x) => x.id === OTHER)]
    g.items.push({ amenity: a, levelId: a.levelId, etaS: etaOfNode(a.nodeId) })
  }
  for (const g of groups) {
    g.items.sort((x, y) => (x.etaS ?? Infinity) - (y.etaS ?? Infinity) || ordinal(y.levelId) - ordinal(x.levelId) || (x.amenity.id < y.amenity.id ? -1 : 1))
  }
  return groups.filter((g) => g.items.length)
}
```

- [ ] **Step 4:** run it. Expected: PASS.

- [ ] **Step 5: strings-more (info + facilities).** Keys (en / ar):
  - `info.title` Mall info / معلومات المول
  - `info.today` Today / اليوم
  - `info.week` Opening hours / ساعات العمل
  - `info.special` Special hours / ساعات خاصة
  - `info.expected` expected dates / تواريخ متوقعة
  - `info.preview` Preview in the app / معاينة في التطبيق
  - `info.previewOn` Showing {name} hours / تعرض الآن ساعات {name}
  - `info.services` Services / الخدمات
  - `info.emergencyTitle` In an emergency / في حالات الطوارئ
  - `info.emergencyText` Follow mall staff and the green exit signs. Do not use lifts. / اتبع موظفي المول وإشارات
    الخروج الخضراء. لا تستخدم المصاعد.
  - `info.demo` Demo controls / أدوات العرض التجريبي
  - `info.startEmergency` Start demo emergency / بدء طوارئ تجريبية
  - `day.sat` … `day.fri` (Saturday … / السبت …)
  - `fac.title` Facilities / المرافق
  - `fac.restrooms` Restrooms / دورات المياه
  - `fac.family` Family & accessible / العائلات وذوو الإعاقة
  - `fac.prayer` Prayer & wudu / الصلاة والوضوء
  - `fac.money` Money / الصرافة
  - `fac.transport` Transport / المواصلات
  - `fac.help` Help / المساعدة
  - `fac.stepFree` Step-free times / أوقات بدون درج

- [ ] **Step 6: MallInfoScreen and FacilitiesScreen.** Both are Sheets with a Back button head, like ScanSheet, in a
  lazy chunk `mallinfo`: two `lazyScreen` entries pointing at the two modules, which Vite may put in one chunk.
  - **MallInfo:**
    - a "Today" card (status + intervals);
    - a week `table` (`th scope="row"` day, intervals; today bold with `aria-current="date"`);
    - special-hours rows (name, "expected" caption, date range, intervals) with a `role="switch"` toggle
      `info.preview` → `onPreview(id or null)`;
    - Services rows (info desk, ATM, taxi, accessible restroom) → `onOpen(amenityId)`;
    - the emergency info card (red border, warning icon);
    - Demo controls: a ghost button `info.startEmergency` → `onEmergencyDemo`.
  - **Facilities:**
    - groups with `.list-head` labels;
    - rows with icon (`entityInfo` colour/icon), name, level chip and minutes (`shortDuration`);
    - a step-free switch at the top.
  - App:
    - `screen === 'info'` / `'facilities'` render them;
    - `onOpen` → `openPlace(id, screen)`;
    - `onPreview` → `patch({ hoursPreview })`;
    - `onEmergencyDemo` → `setOps({ emergency: { on: true } })` (Task 8; until then a stub patch);
    - the camera for info/facilities: `goView(s.view.mode === 'stack' ? 'stack' : 'floor', you level, 'level')`;
    - an amber "Ramadan preview" pill under the header while `hoursPreview` is set (tap to clear).

- [ ] **Step 7: CSS** for `.hours-table`, `.special-row`, `.switch` (a 44 px hit area), `.info-card`,
  `.emergency-info`.

- [ ] **Step 8: probe H.**
  - `?screen=info&lang=en`: toggle the preview switch.
  - Then `?screen=place&to=occ-sahil-fashion` in the same page through `__dallni.setState`, or simply: `?screen=info`,
    click the switch, open Back → Home → search… Simpler: expose nothing new; check that the Mall info "Today" card
    text changes to the Ramadan intervals (contains "20:00").
  - RED before Step 6, GREEN after.

- [ ] **Step 9:** run `npx vitest run` and `npm run build`. Then commit:
  - `git commit -m "feat(mall): Mall info (hours, Ramadan preview, services) and Facilities"`.

---

### Task 8: Emergency mode (ops bus)

**Files:**
- Create: `src/ops/opsBus.js`, `src/ops/exits.js`, `tests/ops.test.js`, `src/ui/EmergencyScreen.jsx`
- Modify: `src/App.jsx`, `src/ui/Header.jsx` (emergency variant), `src/i18n/strings-more.js`, `src/ui/app.css`

**Interfaces:**
- Produces:
  - `OPS_CHANNEL = 'dallni-ops'`;
  - `DEFAULT_OPS = { rev: 0, emergency: { on: false, message: null }, hoursPreview: null }`;
  - `validOps(msg) -> boolean`;
  - `mergeOps(state, msg) -> state`;
  - `createOpsBus({ onState, Channel = globalThis.BroadcastChannel }) -> { state(), publish(patch), hello(),
    close() }`;
  - `nearestExits(index, you) -> [{ anchorId, label, levelId, distanceM: number|null }]`.
- Message shapes:
  - `{ type: 'state', state }`;
  - `{ type: 'hello' }`.
- A `state` message is applied when its `rev` is greater than the current one.

- [ ] **Step 1: failing tests** (`tests/ops.test.js`):

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { DEFAULT_OPS, createOpsBus, mergeOps, validOps } from '../src/ops/opsBus.js'
import { nearestExits } from '../src/ops/exits.js'

const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))

class FakeChannel {
  static all = []
  constructor(name) { this.name = name; this.onmessage = null; FakeChannel.all.push(this) }
  postMessage(data) { for (const c of FakeChannel.all) if (c !== this && c.name === this.name && c.onmessage) c.onmessage({ data }) }
  close() { FakeChannel.all = FakeChannel.all.filter((c) => c !== this) }
}

describe('ops state', () => {
  it('validates messages', () => {
    expect(validOps({ type: 'hello' })).toBe(true)
    expect(validOps({ type: 'state', state: { rev: 2, emergency: { on: true, message: null }, hoursPreview: null } })).toBe(true)
    expect(validOps({ type: 'state', state: { rev: 'x' } })).toBe(false)
    expect(validOps(null)).toBe(false)
  })
  it('applies newer states only', () => {
    const s1 = mergeOps(DEFAULT_OPS, { type: 'state', state: { ...DEFAULT_OPS, rev: 3, emergency: { on: true, message: null } } })
    expect(s1.emergency.on).toBe(true)
    const s2 = mergeOps(s1, { type: 'state', state: { ...DEFAULT_OPS, rev: 2 } })
    expect(s2).toBe(s1)
  })
  it('a dashboard tab publishes; a shopper tab says hello and gets the current state', () => {
    FakeChannel.all = []
    const seen = []
    const dash = createOpsBus({ onState: () => {}, Channel: FakeChannel })
    dash.publish({ emergency: { on: true, message: null } })
    const shop = createOpsBus({ onState: (s) => seen.push(s), Channel: FakeChannel })
    shop.hello()
    expect(seen.at(-1).emergency.on).toBe(true)
    dash.publish({ emergency: { on: false, message: null } })
    expect(seen.at(-1).emergency.on).toBe(false)
    dash.close(); shop.close()
  })
  it('works without BroadcastChannel (single tab)', () => {
    const seen = []
    const bus = createOpsBus({ onState: (s) => seen.push(s), Channel: undefined })
    bus.publish({ hoursPreview: 'ramadan-2027' })
    expect(seen.at(-1).hoursPreview).toBe('ramadan-2027')
  })
})

describe('nearest exits', () => {
  it('on the ground floor: both entrances with straight distances, nearest first', () => {
    const you = { levelId: 'G', x: 61, y: 6 }
    const ex = nearestExits(index, you)
    expect(ex.map((e) => e.anchorId)).toEqual(['A-G-ENT-S', 'A-G-ENT-E'])
    expect(ex[0].distanceM).toBeLessThan(ex[1].distanceM)
  })
  it('on another level: no distance (ground level, stairs)', () => {
    expect(nearestExits(index, { levelId: 'L1', x: 50, y: 30 }).every((e) => e.distanceM === null)).toBe(true)
  })
})
```

- [ ] **Step 2:** run it. Expected: FAIL.

- [ ] **Step 3: implement:**

```js
// src/ops/opsBus.js
/**
 * Mall operations state shared between tabs of one browser (v0.5 demo: no backend): emergency mode and the hours
 * preview. A dashboard tab publishes; shopper tabs listen and say "hello" on start to get the current state. Each
 * publish bumps `rev`; older states are ignored. Without BroadcastChannel it works within the one tab.
 */
export const OPS_CHANNEL = 'dallni-ops'
export const DEFAULT_OPS = Object.freeze({ rev: 0, emergency: Object.freeze({ on: false, message: null }), hoursPreview: null })

const isObj = (v) => v != null && typeof v === 'object'
export function validOps(msg) {
  if (!isObj(msg)) return false
  if (msg.type === 'hello') return true
  if (msg.type !== 'state' || !isObj(msg.state)) return false
  const s = msg.state
  return Number.isFinite(s.rev) && isObj(s.emergency) && typeof s.emergency.on === 'boolean' && (s.hoursPreview === null || typeof s.hoursPreview === 'string')
}

export function mergeOps(state, msg) {
  if (!validOps(msg) || msg.type !== 'state') return state
  return msg.state.rev > state.rev ? msg.state : state
}

export function createOpsBus({ onState, Channel = globalThis.BroadcastChannel } = {}) {
  let state = DEFAULT_OPS
  const ch = typeof Channel === 'function' ? new Channel(OPS_CHANNEL) : null
  const set = (next) => {
    if (next === state) return
    state = next
    onState?.(state)
  }
  if (ch) {
    ch.onmessage = (e) => {
      const msg = e?.data
      if (!validOps(msg)) return
      if (msg.type === 'hello') {
        if (state.rev > 0) ch.postMessage({ type: 'state', state })
        return
      }
      set(mergeOps(state, msg))
    }
  }
  return {
    state: () => state,
    publish(patch) {
      const next = { ...state, ...patch, emergency: { ...state.emergency, ...(patch.emergency ?? {}) }, rev: Math.max(state.rev, Date.now()) + 1 }
      set(next)
      ch?.postMessage({ type: 'state', state: next })
    },
    hello() {
      ch?.postMessage({ type: 'hello' })
    },
    close() {
      ch?.close()
    },
  }
}
```

  Note on the hello reply: in the fake channel `postMessage` is synchronous. The real BroadcastChannel is async, and
  the App handles the state whenever it arrives.

```js
// src/ops/exits.js
/**
 * Exits in emergency mode (PLAN S20): the entrance plates. Straight-line distance only on the same level (routing
 * stops in an emergency); from another level the exits are on the ground level, reached by the stairs (never lifts).
 */
export function nearestExits(index, you) {
  const exits = [...index.anchorById.values()].filter((a) => a.kind === 'entrance')
  return exits
    .map((a) => ({ anchorId: a.id, label: a.label, levelId: a.levelId, distanceM: you && you.levelId === a.levelId ? Math.hypot(a.point[0] - you.x, a.point[1] - you.y) : null }))
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || (a.anchorId < b.anchorId ? 1 : -1))
}
```

  (The tie order puts S before E; check it against the test and adjust the comparator so the default start comes
  first.)

- [ ] **Step 4:** run it. Expected: PASS.

- [ ] **Step 5: strings-more (emergency).**
  - `emergency.title` Emergency / حالة طوارئ
  - `emergency.default` Follow mall staff and the green exit signs. Do not use lifts. / اتبع موظفي المول وإشارات
    الخروج الخضراء. لا تستخدم المصاعد.
  - `emergency.exits` Nearest exits / أقرب المخارج
  - `emergency.about` about {m} / حوالي {m}
  - `emergency.otherLevel` Ground level · use the stairs / الطابق الأرضي · استخدم الدرج
  - `emergency.noLifts` Lifts are not safe in an emergency. / المصاعد غير آمنة في حالات الطوارئ.
  - `emergency.end` Demo: end emergency / عرض تجريبي: إنهاء الطوارئ

- [ ] **Step 6: App + UI.**
  - **Ops bus:** `opsRef = createOpsBus({ onState: (s) => applyOps(s) })` once; `hello()` on start;
    `?emergency=1` → `opsRef.publish({ emergency: { on: true } })` after ready.
  - **`applyOps(s)`:**
    - `patch({ hoursPreview: s.hoursPreview })`;
    - if `s.emergency.on`, and the screen is not emergency yet:
      - stop the sim (`stopSim()`), `engine.setFollow(false)`, leave fpv (`mapModeRef`);
      - `patch({ screen: 'emergency', targetId: null, stepIndex: 0, emergencyMsg: s.emergency.message })`;
      - `engine.setScanPins(['entrance'])`;
    - if off and the screen is emergency: `engine.setScanPins(null)`, `patch({ screen: 'home' })`.
  - **Mall info's demo button** and the hours preview switch go through `opsRef.publish` too, so a dashboard sees
    them.
  - **Camera for `emergency`:** you on G → `goView('floor','G','level')`; else `goView('stack', you.levelId,
    'level')`.
  - **Header:** `emergency` prop → class `header-emergency` (red background #B42318, white text) and the badge
    `emergency.badge`.
  - **`EmergencyScreen`** (lazy):
    - a Sheet, className `emergency-sheet`;
    - head: a warning icon in a red circle + `emergency.title`;
    - body:
      - the message (the ops text or `emergency.default`), 20/28 px, 600;
      - an `.list` of `nearestExits` rows (exit icon, label, level chip, `emergency.about` with formatDistance or
        `emergency.otherLevel`);
      - `emergency.noLifts` with a lift-crossed icon;
      - footer: a ghost text button `emergency.end` → `opsRef.publish({ emergency: { on: false } })`.
  - **While emergency:**
    - MapControls stay (the user may switch level);
    - no tabs; no other screen can open (guard `patch({screen})` calls through `openScreen` that refuses while
      `stateRef.current.screen === 'emergency'`);
    - `onPick` taps are ignored.

- [ ] **Step 7: probe E (RED → GREEN).**
  - Page A: the shopper `?lang=en&from=A-G-ENT-S` with `play`… Keep it simple: a shopper on `?screen=navigate&to=occ-muttrah-kitchen&play=1`.
  - Page B: `?screen=dashboard` in the same browser context. Until Task 10, a minimal page calls
    `new BroadcastChannel('dallni-ops').postMessage({type:'state', state:{rev: Date.now(), emergency:{on:true,
    message:null}, hoursPreview:null}})` through `page.evaluate`.
  - Expect page A: `.emergency-sheet` visible; `__dallni.getState().sim.active === false`; `targetId === null`.
  - Then post `on: false`; expect `screen === 'home'`.

- [ ] **Step 8:** run `npx vitest run` and `npm run build`. Then commit:
  - `git commit -m "feat(ops): emergency mode (ops bus across tabs, exits, routing stops)"`.

---

### Task 9: Kiosk mode (fixed position, idle reset, QR handoff)

**Files:**
- Create: `src/kiosk/idle.js`, `src/kiosk/handoff.js`, `tests/kiosk.test.js`, `src/kiosk/KioskQr.jsx`,
  `src/kiosk/Attract.jsx`
- Modify: `package.json` (`qrcode-generator` 2.0.4), `src/App.jsx`, `src/ui/PlaceScreen.jsx` +
  `src/ui/NavigateScreen.jsx` (a `handoff` slot prop), `src/i18n/strings-more.js`, `src/ui/app.css`

**Interfaces:**
- Produces:
  - `createIdleTimer({ ms, onIdle, target = globalThis, events = ['pointerdown','keydown','wheel'] }) ->
    { reset(), stop() }`;
  - `handoffUrl({ href, anchorId, targetId, lang }) -> string`;
  - `isLocalHost(hostname) -> boolean`;
  - `<KioskQr url size lang />`;
  - `<Attract lang onStart />`.

- [ ] **Step 1: failing tests** (`tests/kiosk.test.js`):

```js
import { describe, it, expect, vi } from 'vitest'
import { createIdleTimer } from '../src/kiosk/idle.js'
import { handoffUrl, isLocalHost } from '../src/kiosk/handoff.js'

describe('kiosk idle timer', () => {
  it('fires once after the idle time, resets on input, and stops cleanly', () => {
    vi.useFakeTimers()
    const target = new EventTarget()
    let n = 0
    const idle = createIdleTimer({ ms: 60000, onIdle: () => n++, target })
    vi.advanceTimersByTime(59000)
    target.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(59000)
    expect(n).toBe(0)
    vi.advanceTimersByTime(1000)
    expect(n).toBe(1)
    vi.advanceTimersByTime(120000)
    expect(n).toBe(1)
    idle.reset()
    idle.stop()
    vi.advanceTimersByTime(120000)
    expect(n).toBe(1)
    vi.useRealTimers()
  })
})

describe('handoff URL', () => {
  it('keeps the origin and path, sets from, to, screen and lang', () => {
    const u = new URL(handoffUrl({ href: 'http://192.168.1.5:5173/app/?kiosk=A-G-ENT-S&lang=en#x', anchorId: 'A-G-ENT-S', targetId: 'occ-hoshikaze-ramen', lang: 'ar' }))
    expect(u.origin + u.pathname).toBe('http://192.168.1.5:5173/app/')
    expect(Object.fromEntries(u.searchParams)).toEqual({ from: 'A-G-ENT-S', to: 'occ-hoshikaze-ramen', screen: 'place', lang: 'ar' })
    expect(u.hash).toBe('')
  })
  it('knows a local host', () => {
    expect(isLocalHost('localhost')).toBe(true)
    expect(isLocalHost('127.0.0.1')).toBe(true)
    expect(isLocalHost('192.168.1.5')).toBe(false)
  })
})
```

- [ ] **Step 2:** run it. Expected: FAIL.

- [ ] **Step 3: implement:**

```js
// src/kiosk/idle.js
/** Kiosk idle reset (PLAN S21): `onIdle` once after `ms` without input; any input restarts the wait. */
export function createIdleTimer({ ms, onIdle, target = globalThis, events = ['pointerdown', 'keydown', 'wheel'] }) {
  let timer = 0
  let stopped = false
  const arm = () => {
    clearTimeout(timer)
    if (!stopped) timer = setTimeout(() => onIdle(), ms)
  }
  for (const e of events) target.addEventListener(e, arm, { passive: true })
  arm()
  return {
    reset: arm,
    stop() {
      stopped = true
      clearTimeout(timer)
      for (const e of events) target.removeEventListener(e, arm)
    },
  }
}
```

```js
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
```

- [ ] **Step 4:** run it. Expected: PASS.

- [ ] **Step 5: QR + attract.**
  - `npm i -E qrcode-generator@2.0.4`.
  - **`KioskQr.jsx`:** `import qrcode from 'qrcode-generator'` (check its ESM default export; if CommonJS-only,
    Vite interop handles it):

```jsx
import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
export function KioskQr({ url, size = 168, label }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const n = qr.getModuleCount()
    let path = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`
    return { n, path }
  }, [url])
  return (
    <svg className="kiosk-qr" width={size} height={size} viewBox={`-4 -4 ${d.n + 8} ${d.n + 8}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect x="-4" y="-4" width={d.n + 8} height={d.n + 8} fill="#FFFFFF" />
      <path d={d.path} fill="#0B0F14" />
    </svg>
  )
}
```

  - **`Attract.jsx`:** a fixed full-screen button (z 60), sky gradient, the mall name, a big pulsing pin ring (CSS
    `@keyframes attract-pulse`, transform/opacity only; none under reduced motion), "Touch to find any shop" in both
    languages (the UI language first), and the PROTOTYPE badge. Click → `onStart`.
  - **Strings:**
    - `kiosk.youAreHere` You are here: {place} / أنت هنا: {place}
    - `kiosk.badge` Kiosk / كشك
    - `kiosk.continue` Continue on your phone / تابع على هاتفك
    - `kiosk.scan` Scan with your camera. The route opens in your browser. / امسح الرمز بالكاميرا. يفتح المسار في
      متصفحك.
    - `kiosk.localhost` Open the kiosk with the Network URL so phones can follow this code. / افتح الكشك عبر عنوان
      الشبكة حتى تفتح الهواتف هذا الرمز.
    - `kiosk.touch` Touch to find any shop / المس للبحث عن أي متجر

- [ ] **Step 6: App.**
  - `kiosk = p.kiosk && index.anchorById.has(p.kiosk) ? p.kiosk : null` (state).
  - You = `youFromAnchor(index, kiosk)` fixed; ScanSheet is unreachable (the here-chip change button is hidden;
    `onScan` is a no-op).
  - `attract: true` at start.
  - The idle timer (`p.kioskIdle` seconds or 60) → `kioskReset()`:
    - stop the sim, `engine.setFollow(false)`;
    - `patch({ screen: 'home', targetId: null, stepIndex: 0, query: '', tile: null, category: null, sheet: { key:
      null, snap: null }, attract: true, you: youFromAnchor(index, kiosk) })`;
    - leave fpv;
    - `goView('stack', kioskLevel, 'level')`.
    - Stop the timer on unmount.
  - The header shows `kiosk.badge` + `kiosk.youAreHere` (Header gets a `kiosk` prop: a teal "Kiosk" pill instead of
    the venue name's second line).
  - PlaceScreen / NavigateScreen get `handoff` (a ReactNode) rendered at the end of their body: a
    `<Suspense fallback={null}><KioskHandoff …/></Suspense>`, where `KioskHandoff` is lazy (`src/kiosk/KioskQr.jsx`
    exports both) and shows the QR, `kiosk.continue`, `kiosk.scan` and, on localhost, `kiosk.localhost`.

- [ ] **Step 7: probe K (RED → GREEN).**
  - `?kiosk=A-G-ENT-S&kioskIdle=4&lang=en` at 1440×900.
  - Expect `.attract` visible; click it; open a shop through search: `__dallni.setState({ screen: 'place',
    targetId: 'occ-hoshikaze-ramen' })`.
  - Expect `svg.kiosk-qr` present and its aria-label text set.
  - Wait 5 s; expect `.attract` visible again and `getState().screen === 'home'`, `targetId === null`.

- [ ] **Step 8:** run `npx vitest run` and `npm run build`. Expected: the first screen is unchanged by the QR library
  (it is in a lazy chunk). Then commit:
  - `git commit -m "feat(kiosk): kiosk mode (fixed you-are-here, idle reset, attract, QR handoff)"`.

---

### Task 10: Mall dashboard

**Files:**
- Create: `src/dashboard/stats.js`, `tests/dashboard.test.js`, `src/dashboard/DashboardApp.jsx`,
  `src/dashboard/charts.jsx`, `src/dashboard/FloorHeat.jsx`, `src/dashboard/dashboard.css`
- Modify: `src/main.jsx`, `src/i18n/strings-more.js` (dashboard section)

**Interfaces:**
- Consumes:
  - `loadVenue` (`src/data/venue.js`);
  - `loadOffers`, `liveDeals` (Task 3);
  - `createOpsBus` (Task 8);
  - `specials` (Task 2).
- Produces:
  - `mulberry32(seed) -> () => number`;
  - `MIN_SHOWN = 10`;
  - `heatShown(n) -> boolean`;
  - `plateOk(actual, expected) -> boolean`;
  - `buildStats(index, offers, { today: 'YYYY-MM-DD', days = 30, seed = 20261011 }) -> Stats`;
  - `toCsv(rows: string[][]) -> string`.
- `Stats` holds:
  - `range { from, to }`;
  - `daily [{ ymd, dow, journeys }]`;
  - `hourly number[24]`;
  - `kpis { journeys, shoppers, footfall, share, carSaves, carFinds, carSuccess, toShopS, toShopBaseS, toCarS,
    toCarBaseS, offerViews, offerTaps }`;
  - `topSearches [{ label:{en,ar}, count }]`;
  - `notFound [{ label:{en,ar}, count }]`;
  - `heat [{ unitId, levelId, count }]`;
  - `plates [{ anchorId, code, label, levelId, expected, actual, ok }]`;
  - `offers [{ dealId, occupantId, views, taps }]`.

- [ ] **Step 1: failing tests** (`tests/dashboard.test.js`):

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { MIN_SHOWN, buildStats, heatShown, plateOk, toCsv } from '../src/dashboard/stats.js'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const index = indexVenue(read('../public/venues/demo-muscat/venue.json'))
const offers = read('../public/venues/demo-muscat/offers.json')

describe('dashboard stats', () => {
  const s = buildStats(index, offers, { today: '2026-10-11' })
  it('is deterministic for a seed', () => {
    expect(buildStats(index, offers, { today: '2026-10-11' })).toEqual(s)
    expect(buildStats(index, offers, { today: '2026-10-11', seed: 7 }).kpis.journeys).not.toBe(s.kpis.journeys)
  })
  it('covers 30 days ending today, busier on Thursday and Friday', () => {
    expect(s.daily).toHaveLength(30)
    expect(s.daily.at(-1).ymd).toBe('2026-10-11')
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    const weekend = s.daily.filter((d) => d.dow === 'thu' || d.dow === 'fri').map((d) => d.journeys)
    const week = s.daily.filter((d) => ['sun', 'mon', 'tue', 'wed'].includes(d.dow)).map((d) => d.journeys)
    expect(mean(weekend)).toBeGreaterThan(mean(week))
    expect(s.kpis.journeys).toBe(s.daily.reduce((a, d) => a + d.journeys, 0))
    expect(s.hourly).toHaveLength(24)
  })
  it('hides small counts and flags weak plates', () => {
    expect(heatShown(MIN_SHOWN - 1)).toBe(false)
    expect(heatShown(MIN_SHOWN)).toBe(true)
    expect(plateOk(19, 100)).toBe(false)
    expect(plateOk(20, 100)).toBe(true)
    expect(s.plates.filter((p) => !p.ok).length).toBeGreaterThanOrEqual(1)
    expect(s.plates.every((p) => p.ok === plateOk(p.actual, p.expected))).toBe(true)
    expect(s.heat.some((h) => !heatShown(h.count))).toBe(true)
  })
  it('shows a faster time to shop and to car than the baseline', () => {
    expect(s.kpis.toShopS).toBeLessThan(s.kpis.toShopBaseS)
    expect(s.kpis.toCarS).toBeLessThan(s.kpis.toCarBaseS)
    expect(s.kpis.share).toBeGreaterThan(0)
    expect(s.kpis.share).toBeLessThan(1)
  })
  it('writes CSV with quotes and commas escaped', () => {
    expect(toCsv([['term', 'count'], ['shoe, repair', '12'], ['say "hi"', '3']])).toBe('term,count\r\n"shoe, repair",12\r\n"say ""hi""",3\r\n')
  })
})
```

- [ ] **Step 2:** run it. Expected: FAIL.

- [ ] **Step 3: implement `src/dashboard/stats.js`:**

```js
/**
 * Synthetic mall dashboard data (v0.5 demo, "Demo data · simulated"): deterministic from a seed over the demo venue,
 * shaped like PLAN.md 8 (D01-D08) and 13 (KPI dashboard). Any count under MIN_SHOWN is hidden on the heatmap (PLAN:
 * small-count suppression); a plate is weak when its scans fall under 20 % of the expected rate.
 */
export const MIN_SHOWN = 10
export const heatShown = (n) => n >= MIN_SHOWN
export const plateOk = (actual, expected) => expected <= 0 || actual >= 0.2 * expected

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_FACTOR = { sun: 0.9, mon: 0.85, tue: 0.88, wed: 0.95, thu: 1.35, fri: 1.5, sat: 1.1 }
const HOUR_SHAPE = [2, 1, 0, 0, 0, 0, 0, 1, 2, 4, 7, 9, 10, 11, 9, 8, 9, 12, 15, 18, 20, 19, 14, 6]
const NOT_FOUND = [
  [{ en: 'IMAX cinema', ar: 'سينما آيماكس' }, 212], [{ en: 'pet shop', ar: 'متجر حيوانات أليفة' }, 164],
  [{ en: 'shoe repair', ar: 'تصليح أحذية' }, 121], [{ en: 'Turkish restaurant', ar: 'مطعم تركي' }, 98],
  [{ en: 'kids salon', ar: 'صالون أطفال' }, 76], [{ en: 'bowling', ar: 'بولينغ' }, 64],
]
const GENERIC = [[{ en: 'restrooms', ar: 'دورات المياه' }, 1.6], [{ en: 'prayer room', ar: 'مصلى' }, 1.3], [{ en: 'pharmacy', ar: 'صيدلية' }, 0.9], [{ en: 'ATM', ar: 'صراف آلي' }, 0.7]]
const PLATE_DAILY = { entrance: 120, directory: 80, lift_lobby: 60, escalator: 40, corridor: 30, parking_pillar: 25 }

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dowOf = (ymd) => DOW[new Date(`${ymd}T12:00:00Z`).getUTCDay()]

export function buildStats(index, offers, { today, days = 30, seed = 20261011 } = {}) {
  const rnd = mulberry32(seed)
  const jitter = (spread) => 1 + (rnd() * 2 - 1) * spread
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const ymd = addDays(today, -i)
    const dow = dowOf(ymd)
    const trend = 1 + ((days - 1 - i) / days) * 0.18
    daily.push({ ymd, dow, journeys: Math.round(420 * DAY_FACTOR[dow] * trend * jitter(0.08)) })
  }
  const journeys = daily.reduce((a, d) => a + d.journeys, 0)
  const shapeSum = HOUR_SHAPE.reduce((a, b) => a + b, 0)
  const hourly = HOUR_SHAPE.map((w) => Math.round((journeys * w) / shapeSum * jitter(0.05)))
  const shoppers = Math.round(journeys * 0.64)
  const footfall = Math.round(shoppers / (0.072 * jitter(0.05)))
  const carSaves = Math.round(journeys * 0.21)
  const carFinds = Math.round(carSaves * 0.88)
  const occupants = index.venue.occupants
  const topSearches = [
    ...occupants.map((o) => ({ label: o.name, count: Math.round((40 + o.landmarkScore * 90) * jitter(0.5)) })),
    ...GENERIC.map(([label, w]) => ({ label, count: Math.round(180 * w * jitter(0.2)) })),
  ].sort((a, b) => b.count - a.count).slice(0, 8)
  const notFound = NOT_FOUND.map(([label, c]) => ({ label, count: Math.round(c * jitter(0.1)) }))
  const heat = []
  for (const u of index.venue.units) {
    if (!u.occupantId) continue
    const occ = occupants.find((o) => o.id === u.occupantId)
    const base = occ?.category === 'services' ? 6 : 30 + (occ?.landmarkScore ?? 0) * 40
    heat.push({ unitId: u.id, levelId: u.levelId, count: Math.round(base * jitter(0.6)) })
  }
  const plates = [...index.anchorById.values()].map((a) => {
    const expected = (PLATE_DAILY[a.kind] ?? 30) * days
    return { anchorId: a.id, code: a.code, label: a.label, levelId: a.levelId, expected, actual: Math.round(expected * (0.45 + rnd() * 0.7)) }
  })
  // two plates went quiet (a sign turned or covered): what the plate-health list is for
  const weak = [...plates].sort((a, b) => a.anchorId.localeCompare(b.anchorId)).filter((_, i) => i % 17 === 5).slice(0, 2)
  for (const p of weak) p.actual = Math.round(p.expected * (0.05 + rnd() * 0.1))
  for (const p of plates) p.ok = plateOk(p.actual, p.expected)
  const offerRows = (offers?.deals ?? []).map((d) => {
    const views = Math.round(900 * jitter(0.5))
    return { dealId: d.id, occupantId: d.occupantId, views, taps: Math.round(views * (0.06 + rnd() * 0.08)) }
  })
  const kpis = {
    journeys, shoppers, footfall, share: shoppers / footfall, carSaves, carFinds, carSuccess: carFinds / carSaves,
    toShopS: 190, toShopBaseS: 340, toCarS: 125, toCarBaseS: 450,
    offerViews: offerRows.reduce((a, o) => a + o.views, 0), offerTaps: offerRows.reduce((a, o) => a + o.taps, 0),
  }
  return { range: { from: daily[0].ymd, to: today }, daily, hourly, kpis, topSearches, notFound, heat, plates, offers: offerRows }
}

const cell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
```

  (If the "≥ 1 hidden heat cell" assertion fails because no services unit counts under 10, lower the services base
  to 5 with spread 0.6, or record a ruling.)

- [ ] **Step 4:** run it. Expected: PASS.

- [ ] **Step 5: dashboard entry.**
  - **`main.jsx`:**
    - if `new URLSearchParams(location.search).get('screen') === 'dashboard'`, then
      `import('./dashboard/DashboardApp.jsx').then(({ DashboardApp }) => root.render(<DashboardApp />))`;
    - else render `<App />` as now.
    - App stays a static import, so the first-screen bundle still holds App; the dashboard chunk is separate.
  - **`DashboardApp.jsx`:**
    - `addStrings(MORE)`;
    - the language from `initialLang(readUrlParams().lang)` (toggle in its header; sets `dir` on `<html>`);
    - loads the venue (`loadVenue(VENUE_URL)`) and offers;
    - `buildStats(index, offers, { today: venueDate(index).ymd })`;
    - `ops = createOpsBus({ onState: setOps })`, `hello()`.
  - **Layout:** `main.dash` with max-width 1280 px, padding 24 px (16 px on mobile), background #F2F6FB.
    - **Top bar:**
      - the brand pin + "Dallni · Mall dashboard" + the mall name;
      - chips "Last 30 days" and the amber "Demo data · simulated";
      - buttons "Download report" (`window.print()`) and "ع/EN".
    - **KPI grid** (2 columns under 640 px, 4 columns at 640 px, 7 columns at 1200 px):
      - each tile: the label, the big value (32 px, 600, tabular numerals), a sub-line (e.g. "7.2% of footfall",
        "vs 5:40 before", "94% found");
      - icons from `src/ui/icons.jsx`.
    - **Row:** "Journeys per day" (`<Bars data=daily>`, 30 bars, Thu/Fri tinted teal-dark, a hover title, and an
      `<table class="sr-only">` alternative) and "Busiest hours" (24 bars).
    - **Row:** "Top searches" (`<BarList>`) and "Searched but not found · for Leasing" (a table with term and count,
      plus an "Export CSV" button: `toCsv` → Blob → `a[download]`).
    - **Row:** "Where shoppers go" (`<FloorHeat level="G">` and `<FloorHeat level="L1">`: an SVG viewBox from the level
      outline, each unit a polygon filled by count from #E6F4F1 to #0F766E; under MIN_SHOWN a hatched grey with
      `title` "Fewer than 10"; plus a legend).
    - **Row:** "Sign health" (a table: code, label, level, scans / expected, status pill green "OK" / red "Check
      sign"; red rows first) and "Offer performance" (a table: shop, deal, views, taps, tap rate).
    - **"Mall controls (demo)" card:**
      - an Emergency mode switch: confirm with `window.confirm(t('dash.confirmEmergency'))` before turning on, then
        `ops.publish({ emergency: { on: true } })`;
      - a Preview Ramadan hours switch → `ops.publish({ hoursPreview: on ? 'ramadan-2027' : null })`;
      - the caption "Reaches Dallni tabs open in this browser (demo, no server)."
  - **`charts.jsx`:** `Bars({ values, labels, highlight(i), height = 140, title })` (SVG bars with 2 px gaps and a
    max-label) and `BarList({ rows: [{ label, value }], max })` (a CSS bar list).
  - **`dashboard.css`:**
    - cards white with radius 20 and shadow `0 1px 2px rgba(16,42,67,.06), 0 8px 24px -12px rgba(16,42,67,.18)`;
    - headings 16/24 px 600; body 14–16 px; ink #0F172A, muted #475569 (≥ 4.5:1);
    - `@media print`: hide the buttons and the controls, white background, `break-inside: avoid` on cards;
    - reduced motion.
  - **Strings `dash.*`** (en/ar) for every label above, including `dash.confirmEmergency` "Start emergency mode on
    the Dallni screens open in this browser?" / «بدء وضع الطوارئ على شاشات دلّني المفتوحة في هذا المتصفح؟».

- [ ] **Step 6: probe D (RED → GREEN).**
  - `?screen=dashboard&lang=en` at 1440×900.
  - Expect `.kpi` count = 7, `svg.floor-heat` count = 2, and no console errors.
  - With a second page (shopper `?lang=en&from=A-G-ENT-S`): click the dashboard's emergency switch, accept the
    confirm (`page.on('dialog', d => d.accept())`).
  - Expect the shopper page's `.emergency-sheet` visible. Then switch off → shopper home.

- [ ] **Step 7:** run `npx vitest run` and `npm run build`. Then commit:
  - `git commit -m "feat(dashboard): mall dashboard (KPIs, charts, heatmap, sign health, offers, ops controls)"`.

---

### Task 11: Verification, screenshots, docs

**Files:**
- Create: `prototype/DESIGN-MALL.md`
- Modify:
  - `prototype/README.md` (what's new, URLs: `?kiosk=`, `?screen=dashboard`, `?emergency=1`);
  - `prototype/CONTRACT.md` (§3e: screens, URL params, ops bus, lazy screens, no engine change);
  - `../PLAN.md` (§19 register rows for v0.5);
  - `../CLAUDE.md` (status, test count, budgets);
  - `src/ui/urlState.js` doc comment.

- [ ] **Step 1:** run `npx vitest run` (record N/N) and `npm run build` (record every budget row).

- [ ] **Step 2: all probes.**
  - `node scratchpad/v05-probes.cjs` (W wide, F first screen, P plate link, O offers, H hours, E emergency, K kiosk,
    D dashboard).
  - Also rerun `real-probes.cjs` (v0.4 regressions: assets, idle 0 frames, marker colours).
  - Expected: all PASS.

- [ ] **Step 3: screenshots** at 390×844 and 1440×900, EN and AR:
  - Find me;
  - home with tabs and the quick strip;
  - offers;
  - place with an offer;
  - mall info (Ramadan preview on);
  - facilities;
  - emergency;
  - kiosk attract + place with QR;
  - dashboard.
  - Read each one and fix what is unreadable, overlapping or clipped (one fix pass, each fix ledgered).

- [ ] **Step 4: docs.**
  - **`DESIGN-MALL.md`:** screens, tokens (tabs, cards, gradients, dashboard), honesty labels, hours model, offers
    rules, kiosk, ops bus, wide layout numbers.
  - **README "v0.5" section:** how to demo:
    - phone (Find me → offers → Ramadan preview → emergency demo);
    - laptop (two windows: dashboard + shopper);
    - kiosk (`?kiosk=A-G-ENT-S` via the Network URL, scan the QR with a phone).
  - **CONTRACT §3e:** the URL params; `lazyScreen`; SheetContext `docked`; ops message shapes.
  - **PLAN §19 register rows; CLAUDE.md** status + test count + budgets.

- [ ] **Step 5: commit**
  - `git commit -m "docs: v0.5 Mall Value (design, readme, contract, plan register)"`.

---

## Self-review

- **Spec coverage:**
  - 3.1 → T5;
  - 3.2 → T5;
  - 3.3 → T3 + T6;
  - 3.4 → T2 (+ the preview in T7);
  - 3.5 → T7;
  - 3.6 → T7;
  - 3.7 → T8 (+ the dashboard switch in T10);
  - 3.8 → T9;
  - 3.9 → T10;
  - 3.10 → T4;
  - §4 data → T2 + T3;
  - §5 budgets → T1 (split) and every task's build;
  - §6 UI rules → each UI step + T11 screenshots;
  - §7 testing → unit tests per task + T11 probes.
- **Types:**
  - `hoursPreview` is a special id (string or null) everywhere;
  - `liveDeals` returns deals with `occupant`, `levelId`, `category`, `isNew` (used by T6 and T10);
  - `createOpsBus` is the same API in T8 and T10;
  - `entryChoices` ids match the venue anchors.
- **Review Focus:**
  - (1) lazy before preload → T1 Steps 8 and 10 + T11 probes;
  - (2) wide RTL → T4 test;
  - (3) midnight and specials → T2 tests;
  - (4) emergency mid-walk → T8 probe E (play=1);
  - (5) kiosk idle mid-route → T9 probe K + the idle unit test.
