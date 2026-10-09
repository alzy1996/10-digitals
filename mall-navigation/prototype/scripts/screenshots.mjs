#!/usr/bin/env node
/**
 * Headless screenshots of the app (390 x 844 CSS px at 2x, like a modern phone; a few at 360 x 740, a budget
 * Android size, and at real browser viewports 390 x 664 / 360 x 640, where the address bar takes room).
 *
 * It does NOT start a server. Start one first (npm run dev -- --port 4202 --strictPort, or npm run preview),
 * then run:   node scripts/screenshots.mjs [baseUrl] [--sheet | --gesture | --measure]   (default http://localhost:4202/)
 *
 * Writes .shots/app-<scenario>.png, prints console errors, page errors and any request to a host that is
 * not localhost, and exits with code 1 if there were any. The `fpv-*` shots are the v0.2 first-person Walk view
 * (deep links with `simT` keep the simulated walk paused, so the engine settles to 0 frames before the shot).
 *
 * Playwright: uses a local `playwright` package if installed, otherwise the global install at
 * /opt/node22/lib/node_modules/playwright. WebGL runs on SwiftShader (software GPU).
 *
 * Foldable bottom sheet (src/ui/Sheet.jsx): the `sheet-*` scenarios write .shots/sheet-after-<scenario>.png (peek /
 * half / full via ?sheet=, at 393 x 728 = a phone in the Claude app's artifact viewer, 390 x 844, 390 x 664 and
 * 360 x 640; `safeBottom` emulates the iPhone home-indicator inset). After the shots a gesture test drives the sheet
 * with real touch, mouse and keyboard input and checks its snap heights, the engine's idle frames and that no map label
 * draws under the sheet.
 *   --sheet          only the sheet scenarios and the gesture test
 *   --gesture        only the gesture test
 *   --measure        measure every sheet (screen x viewport x language) into tests/fixtures/sheet-measures.js
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '.shots')
const BASE = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4202/'

/** Route to the food-court counter on Level 1 (up escalator) and the step-free trip back to the car on B1 (lift). */
const KITCHEN = { screen: 'navigate', to: 'occ-muttrah-kitchen' }
const TO_CAR = { screen: 'navigate', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3' }
const PHONE_360 = { width: 360, height: 740 }
/** Sam's phone: the app inside the Claude iOS app's artifact viewer (its top bar takes ~124 pt of the 852 pt screen). */
const CLAUDE_VIEWER = { width: 393, height: 728 }
const VIEWPORTS = {
  '393x728': CLAUDE_VIEWER,
  '390x844': { width: 390, height: 844 },
  '390x664': { width: 390, height: 664 },
  '360x640': { width: 360, height: 640 },
}

/** Foldable bottom sheet scenarios: .shots/sheet-after-<name>.png. */
const SHEET_SCENARIOS = [
  // home at every viewport: default (half), folded (peek), full
  ...Object.entries(VIEWPORTS).flatMap(([vp, viewport]) =>
    ['half', 'peek', 'full'].map((snap) => ({
      name: `home-${snap}-en-${vp}`,
      viewport,
      dpr: vp === '393x728' ? 3 : 2,
      query: { lang: 'en', screen: 'home', ...(snap === 'half' ? {} : { sheet: snap }) },
    })),
  ),
  // Arabic at Sam's size
  ...['half', 'peek', 'full'].map((snap) => ({
    name: `home-${snap}-ar-393x728`,
    viewport: CLAUDE_VIEWER,
    dpr: 3,
    query: { lang: 'ar', screen: 'home', ...(snap === 'half' ? {} : { sheet: snap }) },
  })),
  // Sam's real case: iPhone home-indicator inset (34 px) under the sheet
  { name: 'home-half-en-393x728-safe34', viewport: CLAUDE_VIEWER, dpr: 3, safeBottom: 34, query: { lang: 'en', screen: 'home' } },
  { name: 'home-half-ar-393x728-safe34', viewport: CLAUDE_VIEWER, dpr: 3, safeBottom: 34, query: { lang: 'ar', screen: 'home' } },
  { name: 'home-peek-en-393x728-safe34', viewport: CLAUDE_VIEWER, dpr: 3, safeBottom: 34, query: { lang: 'en', screen: 'home', sheet: 'peek' } },
  // the other sheets at 393 x 728
  { name: 'place-half-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'place', to: 'occ-muttrah-kitchen' } },
  { name: 'place-peek-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'place', to: 'occ-muttrah-kitchen', sheet: 'peek' } },
  { name: 'place-half-ar-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'ar', screen: 'place', to: 'occ-muttrah-kitchen' } },
  { name: 'navigate-half-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', ...KITCHEN, step: '1', view: 'floor' } },
  { name: 'navigate-peek-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', ...KITCHEN, step: '1', view: 'floor', sheet: 'peek' } },
  { name: 'navigate-full-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', ...KITCHEN, step: '1', view: 'floor', sheet: 'full' } },
  { name: 'navigate-half-en-390x844', viewport: VIEWPORTS['390x844'], query: { lang: 'en', ...KITCHEN, step: '1', view: 'floor' } },
  { name: 'navigate-half-ar-393x728-safe34', viewport: CLAUDE_VIEWER, safeBottom: 34, query: { lang: 'ar', ...KITCHEN, step: '1', view: 'floor' } },
  { name: 'car-half-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'car', car: 'bay-B1-043' } },
  { name: 'car-half-ar-393x728-safe34', viewport: CLAUDE_VIEWER, safeBottom: 34, query: { lang: 'ar', screen: 'car', car: 'bay-B1-043' } },
  { name: 'car-full-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'car', car: 'bay-B1-043', sheet: 'full' } },
  { name: 'search-full-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'search', q: 'coffee' } },
  { name: 'search-tile-half-ar-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'ar', screen: 'search', tile: 'food' } },
  { name: 'arrived-half-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'arrived', to: 'occ-muttrah-kitchen' } },
  { name: 'scan-half-en-393x728', viewport: CLAUDE_VIEWER, query: { lang: 'en', screen: 'scan' } },
  { name: 'car-scan-half-ar-360x640', viewport: VIEWPORTS['360x640'], query: { lang: 'ar', screen: 'car' } },
  // QA round 1: navigate / car / arrived fold to one row (the map almost whole), the level picker at full
  { name: 'navigate-half-ar-360x640', viewport: VIEWPORTS['360x640'], query: { lang: 'ar', ...KITCHEN, step: '1', view: 'floor' } },
  { name: 'navigate-peek-ar-360x640', viewport: VIEWPORTS['360x640'], query: { lang: 'ar', ...KITCHEN, step: '1', view: 'floor', sheet: 'peek' } },
  { name: 'navigate-full-en-360x640', viewport: VIEWPORTS['360x640'], query: { lang: 'en', ...KITCHEN, step: '1', view: 'floor', sheet: 'full' } },
  { name: 'navigate-lift-half-en-393x728', viewport: CLAUDE_VIEWER, dpr: 3, query: { lang: 'en', ...TO_CAR, step: 'connector' } },
  { name: 'car-peek-en-393x728', viewport: CLAUDE_VIEWER, dpr: 3, query: { lang: 'en', screen: 'car', car: 'bay-B1-043', sheet: 'peek' } },
  { name: 'car-half-ar-360x640', viewport: VIEWPORTS['360x640'], query: { lang: 'ar', screen: 'car', car: 'bay-B1-043' } },
  { name: 'car-full-ar-390x664', viewport: VIEWPORTS['390x664'], query: { lang: 'ar', screen: 'car', car: 'bay-B1-043', sheet: 'full' } },
  { name: 'arrived-peek-en-360x640', viewport: VIEWPORTS['360x640'], query: { lang: 'en', screen: 'arrived', to: 'occ-muttrah-kitchen', sheet: 'peek' } },
  { name: 'arrived-half-ar-393x728', viewport: CLAUDE_VIEWER, dpr: 3, query: { lang: 'ar', screen: 'arrived', to: 'occ-muttrah-kitchen' } },
  { name: 'home-full-ar-393x728-safe34', viewport: CLAUDE_VIEWER, dpr: 3, safeBottom: 34, query: { lang: 'ar', screen: 'home', sheet: 'full' } },
  { name: 'home-full-en-360x640-car', viewport: VIEWPORTS['360x640'], query: { lang: 'en', screen: 'home', sheet: 'full', car: 'bay-B1-043' } },
  { name: 'search-tile-half-en-393x728', viewport: CLAUDE_VIEWER, dpr: 3, query: { lang: 'en', screen: 'search', tile: 'food' } },
].map((sc) => ({ ...sc, file: `sheet-after-${sc.name}.png` }))

/** The demo scenarios (URL test hooks: see src/ui/urlState.js). */
const SCENARIOS = [
  // ---- v0.2 first-person Walk view (a SIMULATION inside the 3D model; DESIGN-GLASS.md 6-7, Appendix B)
  // start of the trip, walk not started yet
  { name: 'fpv-start-en', query: { lang: 'en', ...KITCHEN, view: 'fpv' } },
  // mid-corridor on Level 1: glowing path + chevrons, ring + turn bubble at the next corner, heading-up dome
  { name: 'fpv-mid-en', query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '68' } },
  { name: 'fpv-mid-en-360', viewport: PHONE_360, query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '68' } },
  // walking to the escalator on the ground floor (bubble "Escalator up · to Level 1")
  { name: 'fpv-sim-t20-en', query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '20' } },
  // riding the up escalator (Arabic): eye on the ramp, looking up toward Level 1
  { name: 'fpv-escalator-ar', query: { lang: 'ar', ...KITCHEN, view: 'fpv', simT: '45' } },
  { name: 'fpv-escalator-ar-360', viewport: PHONE_360, query: { lang: 'ar', ...KITCHEN, view: 'fpv', simT: '45' } },
  // 1.5 s after stepping off the escalator: "Now on Level 1" under the turn card
  { name: 'fpv-floor-change-en', query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '58' } },
  { name: 'fpv-floor-change-en-360', viewport: PHONE_360, query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '58' } },
  // arrival: facing the shop sign, glass Arrived sheet, SIMULATION capsule kept
  { name: 'fpv-arrived-en', query: { lang: 'en', screen: 'arrived', to: 'occ-muttrah-kitchen', view: 'fpv' } },
  { name: 'fpv-arrived-en-360', viewport: PHONE_360, query: { lang: 'en', screen: 'arrived', to: 'occ-muttrah-kitchen', view: 'fpv' } },
  // back to the car: inside the lift ride (lift card), then walking through Parking B1 to the bay
  { name: 'fpv-lift-en', query: { lang: 'en', ...TO_CAR, view: 'fpv', simT: '99' } },
  { name: 'fpv-car-b1-en', query: { lang: 'en', ...TO_CAR, view: 'fpv', simT: '115' } },
  { name: 'fpv-car-b1-en-360', viewport: PHONE_360, query: { lang: 'en', ...TO_CAR, view: 'fpv', simT: '115' } },
  { name: 'fpv-arrived-car-ar', query: { lang: 'ar', screen: 'arrived', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3', view: 'fpv' } },
  // Parking B2 by the lift from the south entrance
  { name: 'fpv-car-b2-en', query: { lang: 'en', screen: 'navigate', to: 'bay-B2-041', car: 'bay-B2-041', view: 'fpv', simT: '62' } },
  // phone browser tabs (address bar shown): compact HUD, no chips row
  { name: 'fpv-sim-t20-en-390x664', viewport: { width: 390, height: 664 }, query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '20' } },
  { name: 'fpv-mid-ar-360x640', viewport: { width: 360, height: 640 }, query: { lang: 'ar', ...KITCHEN, view: 'fpv', simT: '68' } },
  // QA round 2: the turn bubble in Arabic on a 360 px phone (never over its own text), the escalator verb on one line
  // at 360 px, the last step (the bar's Arrived), the arrival at a shop facing the atrium void (turned along the
  // corridor), and the lift ride in Arabic (the button as printed on the panel)
  { name: 'fpv-start-ar-360', viewport: PHONE_360, query: { lang: 'ar', ...KITCHEN, view: 'fpv' } },
  { name: 'fpv-escalator-en-360', viewport: PHONE_360, query: { lang: 'en', ...KITCHEN, view: 'fpv', simT: '45' } },
  { name: 'fpv-laststep-en', query: { lang: 'en', ...KITCHEN, view: 'fpv', step: '6' } },
  { name: 'fpv-arrived-abaya-en', query: { lang: 'en', screen: 'arrived', to: 'occ-abaya-atelier', view: 'fpv' } },
  { name: 'fpv-lift-ar-360', viewport: PHONE_360, query: { lang: 'ar', ...TO_CAR, view: 'fpv', simT: '99' } },
  // the v0.1 look on demand
  { name: 'home-en-classic', query: { lang: 'en', screen: 'home', style: 'classic' } },
  // ---- every screen in storm glass (v0.1 scenarios)
  { name: 'home-en', query: { lang: 'en', screen: 'home' } },
  { name: 'home-ar', query: { lang: 'ar', screen: 'home' } },
  { name: 'search-ar-restaurant', query: { lang: 'ar', screen: 'search', q: 'مطعم' } },
  { name: 'place-en-food-court', query: { lang: 'en', screen: 'place', to: 'occ-muttrah-kitchen' } },
  { name: 'navigate-step1-stack-en', query: { lang: 'en', screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'stack' } },
  { name: 'navigate-step1-floor-en', query: { lang: 'en', screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'floor' } },
  { name: 'navigate-sim-t25-en', query: { lang: 'en', screen: 'navigate', to: 'occ-muttrah-kitchen', simT: '25' } },
  { name: 'navigate-connector-step-ar', query: { lang: 'ar', screen: 'navigate', to: 'occ-majlis-cinemas', step: 'connector' } },
  // 1.5 s after stepping off the up escalator (simulated): the "Now on Level 1" prompt shows
  { name: 'navigate-floor-change-ar', query: { lang: 'ar', screen: 'navigate', to: 'occ-muttrah-kitchen', simT: '56' } },
  { name: 'arrived-en', query: { lang: 'en', screen: 'arrived', to: 'occ-muttrah-kitchen' } },
  { name: 'car-card-ar-b1', query: { lang: 'ar', screen: 'car', car: 'bay-B1-043' } },
  { name: 'navigate-to-car-stepfree-en', query: { lang: 'en', screen: 'navigate', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3' } },
  { name: 'top-2d-en', query: { lang: 'en', screen: 'navigate', to: 'occ-sidab-fresh', view: 'top', step: '1' } },
  // extra screens (not in the brief's list, kept for review)
  { name: 'scan-sheet-en', query: { lang: 'en', screen: 'scan' } },
  { name: 'car-scan-plate-en', query: { lang: 'en', screen: 'car' } },
  { name: 'search-tile-restrooms-en', query: { lang: 'en', screen: 'search', tile: 'restrooms' } },
  // Overview with a multi-floor route and a saved car (route and markers must show through the floors above)
  { name: 'navigate-to-car-stack-en', query: { lang: 'en', screen: 'navigate', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3', view: 'stack' } },
  { name: 'home-car-ar', query: { lang: 'ar', screen: 'home', car: 'bay-B1-043' } },
  { name: 'search-lift-en', query: { lang: 'en', screen: 'search', q: 'lift' } },
  // Arabic map framing: step targets, landmarks and the destination never under the View control / level picker
  { name: 'navigate-step1-floor-ar', query: { lang: 'ar', screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'floor' } },
  { name: 'place-ar-food-court', query: { lang: 'ar', screen: 'place', to: 'occ-muttrah-kitchen' } },
  { name: 'top-2d-ar', query: { lang: 'ar', screen: 'navigate', to: 'occ-sidab-fresh', view: 'top', step: '1' } },
  { name: 'scan-sheet-ar', query: { lang: 'ar', screen: 'scan' } },
  // find my car: arrival at the bay (painted code readable, car in its bay) and the last step
  { name: 'arrived-car-ar', query: { lang: 'ar', screen: 'arrived', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3' } },
  { name: 'navigate-car-laststep-en', query: { lang: 'en', screen: 'navigate', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3', step: '8' } },
  // two-line 3D signs with Arabic on top (descenders clear of the Latin line)
  { name: 'arrived-ar-biryani', query: { lang: 'ar', screen: 'arrived', to: 'occ-biryani-bay' } },
  // budget Android size (360 x 740)
  { name: 'navigate-step1-floor-en-360', viewport: { width: 360, height: 740 }, query: { lang: 'en', screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'floor' } },
  { name: 'navigate-floor-change-ar-360', viewport: { width: 360, height: 740 }, query: { lang: 'ar', screen: 'navigate', to: 'occ-muttrah-kitchen', simT: '56' } },
  { name: 'navigate-connector-step-ar-360', viewport: { width: 360, height: 740 }, query: { lang: 'ar', screen: 'navigate', to: 'occ-majlis-cinemas', step: 'connector' } },
  { name: 'car-card-ar-b1-360', viewport: { width: 360, height: 740 }, query: { lang: 'ar', screen: 'car', car: 'bay-B1-043' } },
  { name: 'home-ar-360', viewport: { width: 360, height: 740 }, query: { lang: 'ar', screen: 'home' } },
  { name: 'home-en-360', viewport: { width: 360, height: 740 }, query: { lang: 'en', screen: 'home' } },
  // arrival sign at 360 px: both sign lines must read (Latin >= 14 px, Arabic >= 16 px)
  { name: 'arrived-en-360', viewport: { width: 360, height: 740 }, query: { lang: 'en', screen: 'arrived', to: 'occ-muttrah-kitchen' } },
  // real browser viewports (the address bar and tab bar take room): primary buttons stay fully visible
  { name: 'home-ar-390x664', viewport: { width: 390, height: 664 }, query: { lang: 'ar', screen: 'home' } },
  { name: 'navigate-en-390x664', viewport: { width: 390, height: 664 }, query: { lang: 'en', screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'floor' } },
  { name: 'car-card-ar-390x664', viewport: { width: 390, height: 664 }, query: { lang: 'ar', screen: 'car', car: 'bay-B1-043' } },
  { name: 'home-en-360x640', viewport: { width: 360, height: 640 }, query: { lang: 'en', screen: 'home' } },
  { name: 'navigate-en-360x640', viewport: { width: 360, height: 640 }, query: { lang: 'en', screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'floor' } },
  { name: 'car-card-en-360x640', viewport: { width: 360, height: 640 }, query: { lang: 'en', screen: 'car', car: 'bay-B1-043' } },
]

/** Messages from the software GPU driver that are not app errors. */
const IGNORED_CONSOLE = [/GPU stall due to ReadPixels/i, /GroupMarkerNotSet/i, /Automatic fallback to software WebGL/i]

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    return await import('/opt/node22/lib/node_modules/playwright/index.mjs')
  }
}

function isLocal(url) {
  try {
    const u = new URL(url)
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return true
    return ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(u.hostname)
  } catch {
    return true
  }
}

/** A phone-like page for a scenario: touch, its pixel ratio, Muscat time, and (optionally) a bottom safe-area inset. */
async function openPage(browser, sc) {
  const context = await browser.newContext({
    viewport: sc.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: sc.dpr ?? 2,
    isMobile: true,
    hasTouch: true,
    locale: sc.query?.lang === 'ar' ? 'ar-OM' : 'en-GB',
    timezoneId: 'Asia/Muscat',
    reducedMotion: sc.reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  if (sc.safeBottom) {
    // env(safe-area-inset-bottom): the iPhone home indicator under the page
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: sc.safeBottom, bottomMax: sc.safeBottom } })
  }
  return { context, page }
}

/** Report console errors, page errors and requests to other hosts. */
function watch(page, name, problems) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return
    problems.push(`[${name}] console error: ${text}`)
  })
  page.on('pageerror', (err) => problems.push(`[${name}] page error: ${err.message}`))
  page.on('request', (req) => {
    if (!isLocal(req.url())) problems.push(`[${name}] external request: ${req.url()}`)
  })
}

async function load(page, query, { fixedClock = true } = {}) {
  // A fixed afternoon in Muscat so opening hours read "Open until 22:00" in every run (timers keep running). Not for
  // the gesture test: the emulated clock also stamps the input events, and the sheet's velocity reads their timestamps.
  if (fixedClock) await page.clock.setFixedTime(new Date('2026-10-09T13:30:00Z'))
  await page.goto(`${BASE}?${new URLSearchParams(query).toString()}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__dallni && window.__dallni.ready === true, null, { timeout: 30000 })
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.evaluate(() => window.__dallni.engine.whenIdle(20000))
  await page.waitForTimeout(450)
  await page.evaluate(() => window.__dallni.engine.whenIdle(20000))
}

/**
 * Sheet checks on a settled page: half keeps the map's top half; the sheet's DOM rect is its reported rect; the
 * footer's primary button (if any) is fully on screen and >= 56 px; no map label or pin is drawn under the sheet's top
 * edge; the level picker (if shown) ends above the sheet.
 */
async function sheetProblems(page) {
  return page.evaluate(() => {
    const out = []
    const sh = window.__dallni.getSheet()
    const sec = document.querySelector('.sheet-snap')
    if (!sh || !sec) return ['no foldable sheet']
    const vh = window.innerHeight
    const r = sec.getBoundingClientRect()
    if (Math.abs(r.top - sh.top) > 1.5 || Math.abs(r.height - sh.height) > 1.5) out.push(`sheet rect ${r.top}/${r.height} != reported ${sh.top}/${sh.height}`)
    if (sh.snap === 'half' && sh.top < vh / 2 - 1) out.push(`half sheet top ${sh.top} above the middle (${vh / 2})`)
    const btn = sec.querySelector('.sheet-footer .btn')
    if (btn) {
      const b = btn.getBoundingClientRect()
      if (b.height < 55.5) out.push(`primary button ${b.height}px < 56`)
      if (b.top < r.top || b.bottom > r.bottom + 0.5 || b.bottom > vh) out.push(`primary button outside the sheet (${b.top}-${b.bottom})`)
    }
    const S = window.__dallni.engine.debug
    if (S?.overlay) {
      for (const it of S.overlay.labels) if (it.shown && it.sy > sh.top) out.push(`label "${it.text?.en ?? it.id}" at y ${Math.round(it.sy)} under the sheet (top ${Math.round(sh.top)})`)
      for (const v of S.overlay.visibleTargets) if (v.sy > sh.top) out.push(`pin ${v.id} at y ${Math.round(v.sy)} under the sheet`)
    }
    const lv = document.querySelector('.levels')
    const wrap = lv?.parentElement
    if (lv && wrap && getComputedStyle(wrap).visibility !== 'hidden' && getComputedStyle(lv).visibility !== 'hidden') {
      const l = lv.getBoundingClientRect()
      if (l.height > 0 && l.bottom > sh.top) out.push(`level picker bottom ${l.bottom} under the sheet (${sh.top})`)
      // whole buttons only (compact ones when the full size does not fit), the active level whole inside the picker,
      // the "more" chevrons inside the picker (never on the header)
      const btns = [...lv.querySelectorAll('.level-btn')]
      const bh = btns[0]?.offsetHeight ?? 0
      if (bh > 0) {
        const shown = lv.clientHeight / bh
        if (Math.abs(shown - Math.round(shown)) > 0.03) out.push(`level picker shows a cut button (${lv.clientHeight}px of ${bh}px buttons)`)
        const off = lv.scrollTop % bh
        if (off > 1 && bh - off > 1) out.push(`level picker scrolled to part of a button (scrollTop ${lv.scrollTop})`)
        if (bh > 50 && btns.length * bh > lv.clientHeight + 1) out.push('level picker scrolls but its buttons are not compact')
        const act = btns.find((b) => b.getAttribute('aria-pressed') === 'true')
        if (act) {
          const a = act.getBoundingClientRect()
          if (a.top < l.top - 0.5 || a.bottom > l.bottom + 0.5) out.push(`active level ${act.textContent} not whole in the picker (${Math.round(a.top)}-${Math.round(a.bottom)} in ${Math.round(l.top)}-${Math.round(l.bottom)})`)
        }
      }
      const hb = document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0
      for (const c of wrap.querySelectorAll('.levels-more')) {
        const r = c.getBoundingClientRect()
        if (r.top < hb - 0.5 || r.top < l.top - 0.5 || r.bottom > l.bottom + 0.5) out.push(`"more levels" chevron outside the picker (${Math.round(r.top)}-${Math.round(r.bottom)}; header bottom ${Math.round(hb)})`)
      }
    }
    // the handle says what a tap does, and its state matches ("Expand panel" = collapsed)
    const grip = sec.querySelector('.sheet-grip')
    if (grip && grip.getAttribute('aria-hidden') !== 'true') {
      const exp = grip.getAttribute('aria-expanded')
      const lab = grip.getAttribute('aria-label') ?? ''
      const fold = /Fold|اطو/.test(lab)
      if ((exp === 'true') !== fold) out.push(`handle aria-expanded=${exp} with label "${lab}"`)
    }
    return out
  })
}

/**
 * Touch drag with real touch events (CDP): from (x, y0) to (x, y1) in `steps` moves over `ms`. The events carry their
 * own timestamps (a software-rendered headless page can take a second per frame while the blurred sheet moves, which
 * would make every drag look slow), so the sheet's velocity sees the gesture as a finger would make it.
 */
async function touchDrag(page, cdp, x, y0, y1, { steps = 12, ms = 240 } = {}) {
  const t0 = Date.now() / 1000
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }], timestamp: t0 })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }], timestamp: t0 + (ms * i) / steps / 1000 })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + (ms + 8) / 1000 })
}

const sheetNow = (page) => page.evaluate(() => ({ ...window.__dallni.getSheet(), dom: document.querySelector('.sheet-snap').getBoundingClientRect().toJSON() }))
const framesNow = (page) => page.evaluate(() => window.__dallni.engine.getStats().totalFramesRendered)

/**
 * The gesture test (393 x 728, touch): drag the home sheet's handle down -> peek, tap it -> half, flick the head up ->
 * full, drag the body down from its top -> folds, Escape -> peek, Enter on the handle -> half; mouse drag; reduced
 * motion = instant; the engine idles at 0 frames between snaps and renders on a snap change.
 */
async function gestureTest(browser, problems) {
  const log = []
  const fail = (m) => problems.push(`[gesture] ${m}`)
  const expectSnap = async (page, snap, what) => {
    await page.waitForTimeout(420)
    const sh = await sheetNow(page)
    const want = sh.heights[snap]
    const ok = sh.snap === snap && Math.abs(sh.height - want) < 1 && Math.abs(sh.dom.height - want) < 1.5 && Math.abs(sh.dom.top - (sh.viewportH - sh.bottomGap - want)) < 1.5
    log.push(`${ok ? 'ok  ' : 'FAIL'} ${what}: snap ${sh.snap} ${sh.height}px (want ${snap} ${want}px), sheet top ${Math.round(sh.dom.top)}`)
    if (!ok) fail(`${what}: got ${sh.snap} ${sh.height}px / dom ${sh.dom.height}px, want ${snap} ${want}px`)
    return sh
  }
  const sc = { name: 'gesture', viewport: CLAUDE_VIEWER, dpr: 2, query: { lang: 'en', screen: 'home' } }
  const { context, page } = await openPage(browser, sc)
  watch(page, 'gesture', problems)
  const cdp = await context.newCDPSession(page)
  try {
    await load(page, sc.query, { fixedClock: false })
    let sh = await expectSnap(page, 'half', 'home opens at half')
    if (sh.top < 728 / 2) fail(`home half top ${sh.top} above the middle`)
    const h = sh.heights
    log.push(`     snap heights at 393x728: peek ${h.peek}, half ${h.half}, full ${h.full} (half limit ${h.halfLimit})`)
    // idle: 0 frames
    let f0 = await framesNow(page)
    await page.waitForTimeout(700)
    let f1 = await framesNow(page)
    log.push(`${f1 === f0 ? 'ok  ' : 'FAIL'} idle at half: ${f1 - f0} frames in 700 ms`)
    if (f1 !== f0) fail(`engine rendered ${f1 - f0} frames while idle`)
    const grip = await page.evaluate(() => document.querySelector('.sheet-grip').getBoundingClientRect().toJSON())
    const gx = grip.x + grip.width / 2
    const gy = grip.y + grip.height / 2
    if (grip.height < 44) fail(`handle hit area ${grip.height}px < 44`)
    let aria = await page.evaluate(() => {
      const g = document.querySelector('.sheet-grip')
      return { tag: g.tagName, expanded: g.getAttribute('aria-expanded'), label: g.getAttribute('aria-label') }
    })
    log.push(`     handle: <${aria.tag.toLowerCase()}> ${Math.round(grip.height)}px tall, aria-expanded=${aria.expanded}, aria-label="${aria.label}"`)
    // 1. touch-drag the handle down -> peek
    f0 = await framesNow(page)
    await touchDrag(page, cdp, gx, gy, gy + 200)
    sh = await expectSnap(page, 'peek', 'touch drag handle down 200 px')
    await page.evaluate(() => window.__dallni.engine.whenIdle(20000))
    f1 = await framesNow(page)
    await page.waitForTimeout(600)
    const f2 = await framesNow(page)
    log.push(`${f1 > f0 && f2 === f1 ? 'ok  ' : 'FAIL'} engine: ${f1 - f0} frame(s) for the snap change, then ${f2 - f1} while idle`)
    if (!(f1 > f0)) fail('engine did not re-render after the snap change (map padding not updated)')
    if (f2 !== f1) fail(`engine rendered ${f2 - f1} frames while idle after the snap`)
    const pad = await page.evaluate(() => window.__dallni.engine.debug.padding)
    const wantBottom = Math.round(728 - sh.top + 8)
    log.push(`${Math.abs(pad.bottom - wantBottom) <= 1 ? 'ok  ' : 'FAIL'} map padding bottom ${pad.bottom} = viewport - sheet top + 8 (${wantBottom})`)
    if (Math.abs(pad.bottom - wantBottom) > 1) fail(`map padding bottom ${pad.bottom}, want ${wantBottom}`)
    aria = await page.evaluate(() => document.querySelector('.sheet-grip').getAttribute('aria-expanded'))
    if (aria !== 'false') fail(`aria-expanded at peek: ${aria}`)
    // 2. tap the handle -> half
    const g2 = await page.evaluate(() => document.querySelector('.sheet-grip').getBoundingClientRect().toJSON())
    await page.touchscreen.tap(g2.x + g2.width / 2, g2.y + g2.height / 2)
    await expectSnap(page, 'half', 'tap handle at peek')
    // 3. flick the head (search bar) up -> full; the search screen must NOT open (a drag is not a tap)
    const head = await page.evaluate(() => document.querySelector('.sheet-head').getBoundingClientRect().toJSON())
    await touchDrag(page, cdp, head.x + head.width / 2, head.y + head.height / 2, head.y + head.height / 2 - 90, { steps: 4, ms: 64 })
    await expectSnap(page, 'full', 'flick search bar up 90 px in 64 ms')
    const scr = await page.evaluate(() => window.__dallni.getState().screen)
    if (scr !== 'home') fail(`the drag on the search bar opened ${scr}`)
    // 4. drag the body down from its top (scrollTop 0) -> folds
    const body = await page.evaluate(() => {
      const b = document.querySelector('.sheet-body')
      return { ...b.getBoundingClientRect().toJSON(), scrollTop: b.scrollTop }
    })
    await touchDrag(page, cdp, body.x + body.width / 2, body.y + 40, body.y + 40 + 130)
    sh = await sheetNow(page)
    await page.waitForTimeout(420)
    sh = await sheetNow(page)
    const folded = sh.height < h.full
    log.push(`${folded ? 'ok  ' : 'FAIL'} drag body down 130 px at scrollTop ${body.scrollTop}: snap ${sh.snap} ${sh.height}px`)
    if (!folded) fail('a drag down on the body at its top did not fold the sheet')
    // 5. Escape -> peek (focus inside the sheet)
    await page.evaluate(() => window.__dallni.setSheet('half'))
    await expectSnap(page, 'half', '__dallni.setSheet("half")')
    await page.evaluate(() => document.querySelector('.sheet-head button')?.focus())
    await page.keyboard.press('Escape')
    await expectSnap(page, 'peek', 'Escape')
    const focus = await page.evaluate(() => document.activeElement?.className)
    if (!String(focus).includes('sheet-grip')) fail(`focus after Escape on ${focus}`)
    // 6. Enter on the handle -> half, again -> full, again -> peek
    await page.keyboard.press('Enter')
    await expectSnap(page, 'half', 'Enter on handle')
    await page.keyboard.press('Space')
    await expectSnap(page, 'full', 'Space on handle (content overflows half)')
    await page.keyboard.press('Enter')
    await expectSnap(page, 'peek', 'Enter on handle at full')
    // 7. mouse drag on the handle up (slow) -> nearest snap
    const g3 = await page.evaluate(() => document.querySelector('.sheet-grip').getBoundingClientRect().toJSON())
    await page.mouse.move(g3.x + g3.width / 2, g3.y + g3.height / 2)
    await page.mouse.down()
    const target = h.half - h.peek
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(g3.x + g3.width / 2, g3.y + g3.height / 2 - (target * i) / 10)
      await page.waitForTimeout(30)
    }
    await page.waitForTimeout(200)
    await page.mouse.up()
    await expectSnap(page, 'half', `mouse drag handle up ${target} px, slow`)
    // 8. the test hook and state survive re-renders (a language switch)
    await page.evaluate(() => window.__dallni.setSheet('peek'))
    await expectSnap(page, 'peek', '__dallni.setSheet("peek")')
    await page.evaluate(() => document.querySelector('.lang-btn').click())
    await page.waitForTimeout(300)
    await expectSnap(page, 'peek', 'after switching to Arabic (state kept)')
    const label = await page.evaluate(() => document.querySelector('.sheet-grip').getAttribute('aria-label'))
    log.push(`     Arabic handle label: "${label}"`)
    // 9. labels never under the sheet, at every snap
    for (const snap of ['peek', 'half', 'full']) {
      await page.evaluate((s) => window.__dallni.setSheet(s), snap)
      await page.waitForTimeout(420)
      await page.evaluate(() => window.__dallni.engine.whenIdle(20000))
      const bad = await sheetProblems(page)
      log.push(`${bad.length ? 'FAIL' : 'ok  '} ${snap} (ar): ${bad.length ? bad.join('; ') : 'no label, pin or level picker under the sheet; primary action in view'}`)
      for (const b of bad) fail(`${snap}: ${b}`)
    }
  } finally {
    await context.close()
  }
  // 10. reduced motion: snaps are instant (no transform left after the change)
  const rm = await openPage(browser, { ...sc, reducedMotion: true })
  watch(rm.page, 'gesture-reduced-motion', problems)
  try {
    await load(rm.page, sc.query, { fixedClock: false })
    await rm.page.evaluate(() => document.querySelector('.sheet-grip').click())
    await rm.page.waitForTimeout(60)
    // no snap animation: no transform at any time, the box set straight to the new height
    const st = await rm.page.evaluate(() => {
      const sec = document.querySelector('.sheet-snap')
      return { moving: sec.classList.contains('is-moving'), transform: sec.style.transform, height: sec.style.height }
    })
    await rm.page.waitForTimeout(250)
    const sh = await sheetNow(rm.page)
    const ok = sh.snap === 'full' && !st.moving && !st.transform && st.height === `${sh.heights.full}px` && Math.abs(sh.dom.height - sh.heights.full) < 1.5
    log.push(`${ok ? 'ok  ' : 'FAIL'} reduced motion: tap at half -> ${sh.snap} ${sh.height}px, no animation (no transform; height set at once)`)
    if (!ok) fail(`reduced motion: ${sh.snap}, ${JSON.stringify(st)}, dom ${sh.dom.height} / full ${sh.heights.full}`)
  } finally {
    await rm.context.close()
  }
  console.log(`\nGesture test (393 x 728, touch / mouse / keyboard):\n${log.map((l) => `  ${l}`).join('\n')}`)
}

/**
 * Gesture test, per screen (393 x 728, Arabic and English, real touch): the navigate and car heads fold their sheets
 * (a drag down of 150 px lowers them), a drag on the pinned footer moves the sheet (and does not press GO), a second
 * finger landing during a body drag never leaves the sheet stuck mid-drag, and the search sheet comes up to full when
 * the shopper types into it folded (Escape in the field clears it and keeps the sheet).
 */
async function gestureScreens(browser, problems) {
  const log = []
  const fail = (m) => problems.push(`[gesture-screens] ${m}`)
  const settle = (page) => page.waitForTimeout(450)
  const check = (ok, what) => {
    log.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
    if (!ok) fail(what)
  }
  const open = async (query) => {
    const sc = { viewport: CLAUDE_VIEWER, dpr: 2, query }
    const p = await openPage(browser, sc)
    watch(p.page, `gesture ${query.screen}`, problems)
    await load(p.page, query, { fixedClock: false })
    return { ...p, cdp: await p.context.newCDPSession(p.page) }
  }
  const rect = (page, sel) => page.evaluate((q) => document.querySelector(q)?.getBoundingClientRect().toJSON() ?? null, sel)
  // 1-2. navigate and car: a drag down on the head lowers the sheet (it folds to its one row)
  for (const [name, query, sel] of [
    ['navigate (ar)', { lang: 'ar', ...KITCHEN, step: '1', view: 'floor' }, '.sheet-head .step-text'],
    ['car card (ar)', { lang: 'ar', screen: 'car', car: 'bay-B1-043' }, '.sheet-head .car-sum'],
    ['navigate (en)', { lang: 'en', ...KITCHEN, step: '1', view: 'floor' }, '.sheet-head .step-text'],
    ['car card (en)', { lang: 'en', screen: 'car', car: 'bay-B1-043' }, '.sheet-head .car-sum'],
  ]) {
    const { context, page, cdp } = await open(query)
    try {
      const a = await sheetNow(page)
      const r = await rect(page, sel)
      await touchDrag(page, cdp, r.x + r.width / 2, r.y + r.height / 2, r.y + r.height / 2 + 150)
      await settle(page)
      const b = await sheetNow(page)
      const lowered = b.height < a.height - 20 && b.snap === 'peek' && Math.abs(b.dom.height - b.height) < 1.5
      check(lowered, `${name}: opens ${a.snap} ${a.height}px (peek ${a.heights.peek} = ${Math.round((a.heights.peek / 728) * 100)}% of the screen), drag head down 150 px -> ${b.snap} ${b.height}px`)
      const scr = await page.evaluate(() => window.__dallni.getState().screen)
      check(scr === query.screen, `${name}: the drag pressed nothing (screen ${scr})`)
    } finally {
      await context.close()
    }
  }
  // 3. place: a drag down that starts on the GO footer folds the sheet (and does not start the route)
  {
    const { context, page, cdp } = await open({ lang: 'ar', screen: 'place', to: 'occ-muttrah-kitchen' })
    try {
      const a = await sheetNow(page)
      const r = await rect(page, '.sheet-footer .btn')
      await touchDrag(page, cdp, r.x + r.width / 2, r.y + r.height / 2, r.y + r.height / 2 + 120)
      await settle(page)
      const b = await sheetNow(page)
      const scr = await page.evaluate(() => window.__dallni.getState().screen)
      check(b.snap === 'peek' && b.height < a.height && scr === 'place', `place (ar): drag on the GO footer down 120 px: ${a.snap} ${a.height}px -> ${b.snap} ${b.height}px, screen ${scr}`)
      // a plain tap on GO still starts the route
      const g = await rect(page, '.sheet-footer .btn')
      await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height / 2)
      await settle(page)
      const scr2 = await page.evaluate(() => window.__dallni.getState().screen)
      check(scr2 === 'navigate', `place (ar): a tap on GO still opens ${scr2}`)
    } finally {
      await context.close()
    }
  }
  // 4. home at full: a second finger lands during a body drag; the sheet settles and the handle still works
  {
    const { context, page, cdp } = await open({ lang: 'en', screen: 'home', sheet: 'full' })
    try {
      const b = await rect(page, '.sheet-body')
      const x = b.x + b.width / 2
      const y0 = b.y + 40
      const t0 = Date.now() / 1000
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }], timestamp: t0 })
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + 12 * i, id: 1 }], timestamp: t0 + (i * 40) / 1000 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 + 72, id: 1 }, { x: x + 60, y: y0 + 20, id: 2 }], timestamp: t0 + 0.3 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + 90, id: 1 }, { x: x + 60, y: y0 + 30, id: 2 }], timestamp: t0 + 0.34 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y: y0 + 90, id: 1 }], timestamp: t0 + 0.4 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 0.45 })
      await page.waitForTimeout(800)
      const st = await page.evaluate(() => {
        const sec = document.querySelector('.sheet-snap')
        return { moving: sec.classList.contains('is-moving'), attr: document.documentElement.hasAttribute('data-sheet-moving'), transform: sec.style.transform }
      })
      const sh = await sheetNow(page)
      const settled = !st.moving && !st.attr && !st.transform && Math.abs(sh.dom.height - sh.heights[sh.snap]) < 1.5
      check(settled, `second finger during a body drag: settles at ${sh.snap} ${sh.height}px (moving ${st.moving}, data-sheet-moving ${st.attr}, transform "${st.transform}")`)
      const before = sh.snap
      const g = await rect(page, '.sheet-grip')
      await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height / 2)
      await settle(page)
      const after = await sheetNow(page)
      check(after.snap !== before && Math.abs(after.dom.height - after.heights[after.snap]) < 1.5, `then a tap on the handle: ${before} -> ${after.snap} ${after.dom.height}px`)
    } finally {
      await context.close()
    }
  }
  // 5. search: folded, then typing brings it to full (the results show); Escape in the field clears it only
  {
    const { context, page, cdp } = await open({ lang: 'en', screen: 'home' })
    try {
      const head = await rect(page, '.sheet-head .search-box, .sheet-head button')
      await page.touchscreen.tap(head.x + head.width / 2, head.y + head.height / 2)
      await settle(page)
      let sh = await sheetNow(page)
      const focus0 = await page.evaluate(() => document.activeElement?.tagName)
      check(sh.snap === 'full' && focus0 === 'INPUT', `search opens ${sh.snap} with the field focused (${focus0})`)
      const g = await rect(page, '.sheet-grip')
      await touchDrag(page, cdp, g.x + g.width / 2, g.y + g.height / 2, g.y + g.height / 2 + 450)
      await settle(page)
      sh = await sheetNow(page)
      check(sh.snap === 'peek', `search: drag the handle down 450 px -> ${sh.snap} ${sh.height}px`)
      const inp = await rect(page, '.sheet-head input')
      await page.touchscreen.tap(inp.x + inp.width / 2, inp.y + inp.height / 2)
      await page.keyboard.type('burger', { delay: 30 })
      await page.waitForTimeout(600)
      sh = await sheetNow(page)
      const res = await page.evaluate(() => {
        const b = document.querySelector('.sheet-body')
        return { rows: b.querySelectorAll('.row').length, clientH: b.clientHeight, inert: b.inert, q: window.__dallni.getState().query }
      })
      check(sh.snap === 'full' && res.rows > 0 && res.clientH > 100 && !res.inert, `search folded, then typing "${res.q}": ${sh.snap} ${sh.height}px, ${res.rows} result rows in a ${res.clientH}px body`)
      await page.keyboard.press('Escape')
      await settle(page)
      sh = await sheetNow(page)
      const esc = await page.evaluate(() => ({ q: window.__dallni.getState().query, v: document.querySelector('.sheet-head input')?.value, focus: document.activeElement?.tagName }))
      check(sh.snap === 'full' && esc.focus === 'INPUT', `Escape in the field with text: query "${esc.q}" (field "${esc.v}"), sheet ${sh.snap}, focus ${esc.focus}`)
    } finally {
      await context.close()
    }
  }
  console.log(`\nGesture test per screen (393 x 728, touch):\n${log.map((l) => `  ${l}`).join('\n')}`)
}

/** Measure every sheet (screen x viewport x language) for the unit tests' fixtures. */
async function measureSheets(browser, problems) {
  const screens = {
    home: { screen: 'home' },
    search: { screen: 'search', q: 'cafe' },
    'search-list': { screen: 'search', tile: 'food' },
    place: { screen: 'place', to: 'occ-muttrah-kitchen' },
    navigate: { screen: 'navigate', to: 'occ-muttrah-kitchen', step: '1', view: 'floor' },
    arrived: { screen: 'arrived', to: 'occ-muttrah-kitchen' },
    car: { screen: 'car', car: 'bay-B1-043' },
    'car-scan': { screen: 'car' },
    // the confirm stage has no URL hook: the first parking plate on B1, picked through the state hook
    'car-confirm': { screen: 'car', $confirm: true },
    scan: { screen: 'scan' },
  }
  const sizes = [...Object.entries(VIEWPORTS).map(([vp, v]) => ({ vp, v, safe: 0 })), { vp: '393x728', v: CLAUDE_VIEWER, safe: 34 }]
  const out = []
  for (const { v, safe } of sizes) {
    for (const lang of ['en', 'ar']) {
      const { context, page } = await openPage(browser, { viewport: v, dpr: 1, safeBottom: safe, query: { lang } })
      watch(page, `measure ${v.width}x${v.height}`, problems)
      for (const [key, { $confirm, ...q }] of Object.entries(screens)) {
        await page.goto(`${BASE}?${new URLSearchParams({ lang, ...q }).toString()}`, { waitUntil: 'load' })
        await page.waitForFunction(() => window.__dallni && window.__dallni.ready === true && window.__dallni.getSheet?.(), null, { timeout: 30000 })
        if ($confirm) {
          await page.evaluate(() => {
            const plate = [...window.__dallni.index.anchorById.values()].find((a) => a.kind === 'parking_pillar' && a.levelId === 'B1')
            window.__dallni.setState({ carStage: 'confirm', plateId: plate.id })
          })
          await page.waitForFunction(() => document.querySelector('.sheet-snap')?.getAttribute('aria-label')?.length > 0 && window.__dallni.getState().carStage === 'confirm')
          await page.waitForTimeout(200)
        }
        await page.evaluate(() => document.fonts.ready.then(() => true))
        await page.waitForTimeout(150)
        const sh = await page.evaluate(() => window.__dallni.getSheet())
        const m = sh.metrics
        out.push({
          screen: key.split('-')[0],
          variant: key,
          lang,
          width: v.width,
          height: v.height,
          viewportH: sh.viewportH,
          topLimit: m.topLimit,
          bottomGap: sh.bottomGap,
          chrome: Math.round(m.chrome * 100) / 100,
          bodyH: m.bodyH,
          rows: m.rows,
          stretch: m.stretch,
        })
      }
      await context.close()
    }
  }
  const file = join(ROOT, 'tests', 'fixtures', 'sheet-measures.js')
  const body = out.map((f) => `  ${JSON.stringify(f)},`).join('\n')
  writeFileSync(
    file,
    `/**\n * Bottom sheet measurements taken from the running app (node scripts/screenshots.mjs --measure): per sheet, viewport\n * and language, what src/ui/sheetModel.computeSnapHeights works from. tests/sheet.test.js checks the snap rules on them.\n */\nexport const SHEET_FIXTURES = [\n${body}\n]\n`,
  )
  console.log(`measured ${out.length} sheets -> ${file}`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  })
  const problems = []
  const only = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(',')) : null
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')))
  const scenarios = flags.has('--gesture') || flags.has('--measure') ? [] : flags.has('--sheet') ? SHEET_SCENARIOS : [...SCENARIOS, ...SHEET_SCENARIOS]
  try {
    if (flags.has('--measure')) await measureSheets(browser, problems)
    for (const sc of scenarios) {
      if (only && !only.has(sc.name)) continue
      const { context, page } = await openPage(browser, sc)
      watch(page, sc.name, problems)
      const t0 = Date.now()
      await load(page, sc.query)
      const file = join(OUT, sc.file ?? `app-${sc.name}.png`)
      await page.screenshot({ path: file })
      const stats = await page.evaluate(() => window.__dallni.engine.getStats())
      const sheet = await page.evaluate(() => window.__dallni.getSheet?.())
      const sh = sheet ? `  sheet ${sheet.snap} ${sheet.height}px (top ${Math.round(sheet.top)})` : ''
      console.log(`${sc.name.padEnd(30)} ${String(Date.now() - t0).padStart(5)} ms  calls ${stats.drawCalls}  tris ${stats.triangles}${sh}  -> ${file}`)
      if (sc.file) {
        // the sheet scenarios also check: half keeps the map's top half, no map label under the sheet
        const bad = await sheetProblems(page)
        for (const b of bad) problems.push(`[${sc.name}] ${b}`)
      }
      await context.close()
    }
    if (!flags.has('--measure') && !only) {
      await gestureTest(browser, problems)
      await gestureScreens(browser, problems)
    }
  } finally {
    await browser.close()
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('\nNo console errors, no page errors, no requests to non-localhost hosts.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
