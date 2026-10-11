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
