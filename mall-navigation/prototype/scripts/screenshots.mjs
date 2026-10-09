#!/usr/bin/env node
/**
 * Headless screenshots of the app (390 x 844 CSS px at 2x, like a modern phone; a few at 360 x 740, a budget
 * Android size, and at real browser viewports 390 x 664 / 360 x 640, where the address bar takes room).
 *
 * It does NOT start a server. Start one first (npm run dev -- --port 4202 --strictPort, or npm run preview),
 * then run:   node scripts/screenshots.mjs [baseUrl]        (default http://localhost:4202/)
 *
 * Writes .shots/app-<scenario>.png, prints console errors, page errors and any request to a host that is
 * not localhost, and exits with code 1 if there were any. The `fpv-*` shots are the v0.2 first-person Walk view
 * (deep links with `simT` keep the simulated walk paused, so the engine settles to 0 frames before the shot).
 *
 * Playwright: uses a local `playwright` package if installed, otherwise the global install at
 * /opt/node22/lib/node_modules/playwright. WebGL runs on SwiftShader (software GPU).
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '.shots')
const BASE = process.argv[2] ?? 'http://localhost:4202/'

/** Route to the food-court counter on Level 1 (up escalator) and the step-free trip back to the car on B1 (lift). */
const KITCHEN = { screen: 'navigate', to: 'occ-muttrah-kitchen' }
const TO_CAR = { screen: 'navigate', to: 'bay-B1-043', car: 'bay-B1-043', stepFree: '1', from: 'A-L1-C3' }
const PHONE_360 = { width: 360, height: 740 }

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

async function main() {
  mkdirSync(OUT, { recursive: true })
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  })
  const problems = []
  const only = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(',')) : null
  try {
    for (const sc of SCENARIOS) {
      if (only && !only.has(sc.name)) continue
      const context = await browser.newContext({
        viewport: sc.viewport ?? { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        locale: sc.query.lang === 'ar' ? 'ar-OM' : 'en-GB',
        timezoneId: 'Asia/Muscat',
      })
      const page = await context.newPage()
      // A fixed afternoon in Muscat so opening hours read "Open until 22:00" in every run (timers keep running).
      await page.clock.setFixedTime(new Date('2026-10-09T13:30:00Z'))
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (IGNORED_CONSOLE.some((re) => re.test(text))) return
        problems.push(`[${sc.name}] console error: ${text}`)
      })
      page.on('pageerror', (err) => problems.push(`[${sc.name}] page error: ${err.message}`))
      page.on('request', (req) => {
        if (!isLocal(req.url())) problems.push(`[${sc.name}] external request: ${req.url()}`)
      })
      const url = `${BASE}?${new URLSearchParams(sc.query).toString()}`
      const t0 = Date.now()
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__dallni && window.__dallni.ready === true, null, { timeout: 30000 })
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await page.evaluate(() => window.__dallni.engine.whenIdle(20000))
      await page.waitForTimeout(450)
      await page.evaluate(() => window.__dallni.engine.whenIdle(20000))
      const file = join(OUT, `app-${sc.name}.png`)
      await page.screenshot({ path: file })
      const stats = await page.evaluate(() => window.__dallni.engine.getStats())
      console.log(`${sc.name.padEnd(30)} ${String(Date.now() - t0).padStart(5)} ms  calls ${stats.drawCalls}  tris ${stats.triangles}  -> ${file}`)
      await context.close()
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
