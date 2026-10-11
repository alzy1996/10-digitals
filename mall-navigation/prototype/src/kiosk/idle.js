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
