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
