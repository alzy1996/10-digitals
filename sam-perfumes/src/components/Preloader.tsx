import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { markLoaded, onProgress } from '../lib/loadProgress'

interface PreloaderProps {
  onDone: () => void
}

// Covers the page while real work lands — fonts, the 3D scene chunk, the
// first rendered WebGL frames — then lifts like a curtain, and only then
// starts the hero choreography. The percentage eases toward the real
// value so milestones read as one smooth count.
const MAX_WAIT_MS = 9000 // never trap a visitor behind the curtain

export default function Preloader({ onDone }: PreloaderProps) {
  const { t } = useI18n()
  const [shown, setShown] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'exit' | 'gone'>('loading')
  const target = useRef(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    document.fonts.ready.then(() => markLoaded('fonts'))
    const stop = onProgress((p) => (target.current = p))
    const bail = window.setTimeout(() => (target.current = 100), MAX_WAIT_MS)
    return () => {
      stop()
      window.clearTimeout(bail)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'loading') return
    let raf = 0
    let value = 0
    let last = performance.now()
    // time-based easing: converges in ~0.5s of wall time even on a device
    // drawing 3 frames a second
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.5)
      last = now
      value += (target.current - value) * (1 - Math.exp(-dt * 7))
      if (target.current - value < 0.5) value = target.current
      setShown(Math.round(value))
      if (value >= 100) {
        window.setTimeout(() => setPhase('exit'), 350)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  useEffect(() => {
    if (phase !== 'exit') return
    const t2 = window.setTimeout(() => {
      setPhase('gone')
      onDoneRef.current()
    }, 950)
    return () => window.clearTimeout(t2)
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel transition-transform duration-[950ms]"
      style={{
        transform: phase === 'exit' ? 'translateY(-100%)' : 'translateY(0)',
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div
        className="flex flex-col items-center transition-opacity duration-300"
        style={{ opacity: phase === 'exit' ? 0 : 1 }}
      >
        <span
          className="en-tracking text-sm font-light text-ink"
          style={{ letterSpacing: '10px', paddingInlineStart: '10px' }}
        >
          {t.preloader.title}
        </span>
        <span className="mt-7 block h-px w-40" style={{ background: 'var(--line)' }}>
          <span className="block h-px" style={{ width: `${shown}%`, background: 'var(--accent)' }} />
        </span>
        <span className="mt-3 text-[10px] tabular-nums text-muted">{shown}%</span>
      </div>
    </div>
  )
}
