#!/usr/bin/env node
/**
 * Load budgets (PLAN.md 19.2 "BUDGETS", enforced on every build): gzip size of the built files in dist/, measured
 * with zlib level 9 and counted in KiB (1 KiB = 1024 bytes). Vite's own build log prints decimal kB (1 kB = 1000
 * bytes) at its default gzip level, so the same file reads about 2-3 % larger there: "51.3 kB" in Vite's log is
 * 49.8 KiB here. The budget is the KiB figure printed below.
 *
 *   node tools/check-budgets.mjs [distDir]          (npm run build runs it after vite build)
 *
 * - initial JS + CSS (everything dist/index.html loads before the first screen)   <= 110 KB
 * - engine3d-*.js: the 3D libraries, three + troika, loaded lazily (PLAN "three + loaders + troika") <= 220 KB
 * - scene3d-*.js: Dallni's own 3D code (src/engine), loaded lazily with it         <= 60 KB (v0.3 toy world, reported
 *   to Sam: toy palettes, light rig, shadows, bevels, quality levels; 52 from QA round 2, 50 before it:
 *   the Walk view's world fidelity, CONTRACT.md 3b)
 * - the two lazy 3D chunks together                                                <= 260 KB
 * - 3D sign fonts (readex-latin-600 + readex-arabic-600 .woff) in total             <= 50 KB
 * - any single font file                                                            <= 50 KB
 * Prints a table and exits with code 1 when anything is over (or a budgeted file is missing).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'))
const KB = 1024

export const BUDGETS = Object.freeze({
  initialKB: 110,
  engineLibsKB: 220,
  sceneKB: 60,
  lazy3dTotalKB: 260,
  signFontsKB: 50,
  fontKB: 50,
})

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length

/**
 * @param {string} dist
 * @returns {{ rows: Array<{ item: string, files: string[], kb: number, budget: number, ok: boolean }>, ok: boolean }}
 */
export function checkBudgets(dist = DIST) {
  const assets = join(dist, 'assets')
  if (!existsSync(join(dist, 'index.html')) || !existsSync(assets)) throw new Error(`no build in ${dist} (run vite build first)`)
  const files = readdirSync(assets)
  const rows = []
  const row = (item, list, budget) => {
    const kb = list.reduce((s, f) => s + gz(join(assets, f)), 0) / KB
    rows.push({ item, files: list, kb, budget, ok: list.length > 0 && kb <= budget })
    return kb
  }
  // initial: the scripts, module preloads and stylesheets index.html references
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const initial = [...html.matchAll(/(?:src|href)="\.?\/?assets\/([^"]+\.(?:js|css))"/g)].map((m) => m[1])
  row('initial JS + CSS (first screen)', [...new Set(initial)], BUDGETS.initialKB)
  const libs = files.filter((f) => /^engine3d-.*\.js$/.test(f))
  const scene = files.filter((f) => /^scene3d-.*\.js$/.test(f))
  const libsKB = row('engine3d: three + troika (lazy)', libs, BUDGETS.engineLibsKB)
  const sceneKB = row('scene3d: Dallni 3D code (lazy)', scene, BUDGETS.sceneKB)
  rows.push({ item: 'lazy 3D total (engine3d + scene3d)', files: [...libs, ...scene], kb: libsKB + sceneKB, budget: BUDGETS.lazy3dTotalKB, ok: libs.length > 0 && scene.length > 0 && libsKB + sceneKB <= BUDGETS.lazy3dTotalKB })
  row('3D sign fonts (.woff subsets)', files.filter((f) => /^readex-(latin|arabic)-600-.*\.woff$/.test(f)), BUDGETS.signFontsKB)
  for (const f of files.filter((x) => /\.(woff2?|ttf|otf)$/.test(x))) row(`font ${f}`, [f], BUDGETS.fontKB)
  return { rows, ok: rows.every((r) => r.ok) }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    const { rows, ok } = checkBudgets()
    console.log(`Load budgets (gzip -9, KiB: 1 KiB = 1024 bytes; Vite's log above uses decimal kB) · ${DIST}`)
    for (const r of rows) {
      const pct = r.budget ? Math.round((r.kb / r.budget) * 100) : 0
      const left = Math.round((r.budget - r.kb) * KB)
      console.log(`${r.ok ? 'ok  ' : 'OVER'}  ${r.kb.toFixed(1).padStart(6)} / ${String(r.budget).padStart(3)} KiB  ${String(pct).padStart(3)}%  ${String(left).padStart(7)} B left  ${r.item}${r.files.length ? '' : '  (missing)'}`)
    }
    if (!ok) {
      console.error('\nBudget check FAILED: a file is over its budget or missing (PLAN.md 19.2 BUDGETS).')
      process.exit(1)
    }
    console.log('\nAll budgets met.')
  } catch (err) {
    console.error(String(err?.message ?? err))
    process.exit(1)
  }
}
