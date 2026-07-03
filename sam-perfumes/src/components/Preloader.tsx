import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'

interface PreloaderProps {
  onDone: () => void
}

// Full-screen brand curtain: letterspaced wordmark + thin gold bar that
// fills in 1.2s (assets are light, the pause is choreography), then fades
// and hands off to the hero entrance.
export default function Preloader({ onDone }: PreloaderProps) {
  const { t } = useI18n()
  const [exiting, setExiting] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const fill = window.setTimeout(() => setExiting(true), 1200)
    return () => window.clearTimeout(fill)
  }, [])

  useEffect(() => {
    if (!exiting) return
    const done = window.setTimeout(() => {
      setGone(true)
      onDone()
    }, 850)
    return () => window.clearTimeout(done)
  }, [exiting, onDone])

  if (gone) return null

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-panel ${
        exiting ? 'preloader-exit' : ''
      }`}
    >
      <span
        className="en-tracking text-sm font-light text-ink"
        style={{ letterSpacing: '10px', paddingInlineStart: '10px' }}
      >
        {t.preloader.title}
      </span>
      <span className="block h-px w-[160px] overflow-hidden" style={{ background: 'var(--line)' }}>
        <span
          className="block h-full w-full origin-left"
          style={{
            background: 'var(--accent)',
            animation: 'loaderBar 1.2s cubic-bezier(0.16,1,0.3,1) forwards',
          }}
        />
      </span>
    </div>
  )
}
