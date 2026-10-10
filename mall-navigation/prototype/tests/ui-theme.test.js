/**
 * v0.3 bright game UI (DESIGN-TOY.md 5): indicators on the white panels stay visible (WCAG non-text contrast >= 3:1)
 * and the browser bar matches the light app.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const css = read('../src/ui/app.css')
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255)
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const token = (name) => css.match(new RegExp(`\n  --${name}: (#[0-9A-Fa-f]{6});`))?.[1]
const rule = (selector) => {
  const i = css.indexOf('\n' + selector + ' {')
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

describe('indicators on white panels (review #5)', () => {
  it('--route-rim (selected view check, focus ring, walk pill and play icons) is >= 3:1 on white and raised fills', () => {
    const rim = token('route-rim')
    expect(contrast(rim, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    expect(contrast(rim, '#F3F7FC')).toBeGreaterThanOrEqual(3)
  })

  it('a done progress segment stands out from the white sheet', () => {
    const hex = rule('.progress span.is-done').match(/background: (#[0-9A-Fa-f]{6})/)?.[1]
    expect(hex, 'is-done uses an opaque hex').toBeTruthy()
    expect(contrast(hex, '#FFFFFF')).toBeGreaterThanOrEqual(3)
  })

  it('the route dot on the active (teal) level button stays visible', () => {
    const hex = rule('.level-btn[aria-pressed="true"] .level-dot').match(/background: (#[0-9A-Fa-f]{6})/)?.[1]
    expect(hex, 'active level dot has its own colour').toBeTruthy()
    expect(contrast(hex, '#1FC7B4')).toBeGreaterThanOrEqual(3)
  })
})

describe('browser bar colour (review #10)', () => {
  it('the retail theme-color is the light sky, in index.html and the App', () => {
    const meta = read('../index.html').match(/name="theme-color" content="(#[0-9A-Fa-f]{6})"/)[1]
    const app = read('../src/App.jsx').match(/THEME_COLOR = \{ sunlight: '(#[0-9A-Fa-f]{6})'/)[1]
    expect(lum(meta)).toBeGreaterThan(0.5)
    expect(app).toBe(meta)
  })
})
