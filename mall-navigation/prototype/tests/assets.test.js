/**
 * v0.4 real-mall assets (DESIGN-REAL.md 3): seven same-origin files, small, WebP textures <= 1024 px and a 512 x 256
 * Radiance HDRI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const DIR = fileURLToPath(new URL('../public/assets/real/', import.meta.url))
const FILES = ['marble.webp', 'marble-n.webp', 'marble-r.webp', 'plaster.webp', 'plaster-n.webp', 'wood.webp', 'arcade.hdr']

/** WebP width / height from the RIFF header (VP8, VP8L or VP8X). */
function webpSize(buf) {
  const kind = buf.toString('ascii', 12, 16)
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21)
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]
  }
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]
  return [0, 0]
}

describe('real assets (v0.4)', () => {
  it('ships exactly the seven files, within the 3 MB hard limit', () => {
    expect(readdirSync(DIR).sort()).toEqual([...FILES].sort())
    const total = FILES.reduce((s, f) => s + statSync(DIR + f).size, 0)
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024)
  })

  it('textures are WebP at most 1024 px', () => {
    for (const f of FILES.filter((n) => n.endsWith('.webp'))) {
      const buf = readFileSync(DIR + f)
      expect(buf.toString('ascii', 0, 4) + buf.toString('ascii', 8, 12), f).toBe('RIFFWEBP')
      const [w, h] = webpSize(buf)
      expect(w, f).toBeGreaterThan(0)
      expect(Math.max(w, h), f).toBeLessThanOrEqual(1024)
    }
  })

  it('the HDRI is Radiance RGBE, 512 x 256', () => {
    const head = readFileSync(DIR + 'arcade.hdr').toString('latin1', 0, 200)
    expect(head.startsWith('#?RADIANCE') || head.startsWith('#?RGBE')).toBe(true)
    expect(head).toMatch(/-Y 256 \+X 512/)
  })
})
