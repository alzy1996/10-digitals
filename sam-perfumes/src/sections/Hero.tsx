import { Component, lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { BottleSilhouette } from '../components/ProductImage'
import { products } from '../content/content'
import { useI18n } from '../lib/i18n'
import { markLoaded } from '../lib/loadProgress'
import { probeGpu } from '../lib/gpu'
import { scrollToEl } from '../lib/scroll'

// Lazy Canvas: the hero text paints from the entry chunk; the Three.js
// scene streams in behind the preloader.
const HeroScene = lazy(() => import('../components/HeroScene'))

// No WebGL (old phone, blocked GPU) → release the preloader and show the
// CSS bottle instead of a blank stage.
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    markLoaded('scene')
    markLoaded('frame')
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function scrollToCollection(e: React.MouseEvent<HTMLAnchorElement>) {
  if (scrollToEl('#collection')) e.preventDefault()
}

// Full-screen 3D hero: glass bottle on a full-bleed canvas, headline and
// corner copy over it. Nav is fixed above (rendered in App).
export default function Hero({ ready }: { ready: boolean }) {
  const { t, lang, dir } = useI18n()
  const featured = products[0]
  const [webgl] = useState(() => probeGpu() !== 'none')

  useEffect(() => {
    if (webgl) return
    markLoaded('scene')
    markLoaded('frame')
  }, [webgl])
  const anim = (kind: 'reveal' | 'fade', delay: number) => ({
    className: ready ? `hero-anim hero-${kind}` : 'opacity-0',
    style: { animationDelay: `${delay}s` },
  })
  const l1 = anim('reveal', 0.25)
  const l2 = anim('reveal', 0.42)
  const left = anim('fade', 0.7)
  const right = anim('fade', 0.85)

  const fallback = (
    <div className="absolute inset-0 flex items-start justify-center pt-[16vh] lg:items-center lg:justify-end lg:pe-[14vw] lg:pt-0">
      <div className="h-[44vh] w-[30vh] max-w-[70vw]">
        <BottleSilhouette />
      </div>
    </div>
  )

  return (
    <section
      id="hero"
      className="relative h-screen overflow-hidden bg-panel"
      style={{ height: '100dvh' }}
    >
      {/* warm studio glow — settles with the house Ken Burns curve */}
      <div
        aria-hidden
        className={`absolute inset-0 ${ready ? 'hero-zoom' : ''}`}
        style={{
          transform: ready ? undefined : 'scale(1.12)',
          background:
            'radial-gradient(60% 55% at 68% 42%, rgba(211,160,90,.16) 0%, transparent 60%), radial-gradient(120% 90% at 70% 10%, var(--panel-soft) 0%, var(--panel) 62%)',
        }}
      />

      {webgl ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={null}>
            <HeroScene side={dir === 'rtl' ? -1 : 1} ready={ready} />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}

      <div aria-hidden className="hero-scrim-bottom pointer-events-none absolute inset-0" />
      <div aria-hidden className="hero-scrim-side pointer-events-none absolute inset-0 hidden lg:block" />

      <div className="pointer-events-none relative z-50 flex h-full flex-col justify-end px-6 pb-8 pt-28 sm:px-10 sm:pb-10 lg:px-14">
        <h1 className="max-w-[16ch] font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-7xl md:text-8xl">
          <span className={`block ${l1.className}`} style={l1.style}>
            {t.hero.titlePre.trim()}
          </span>
          <span className={`block ${l2.className}`} style={l2.style}>
            <em className="italic" style={{ color: 'var(--accent)' }}>
              {t.hero.titleAccent}
            </em>
            {t.hero.titlePost}
          </span>
        </h1>

        <div className="mt-8 flex items-end justify-between gap-8 sm:mt-10">
          <div className={left.className} style={left.style}>
            <p className="hidden max-w-[260px] text-sm leading-relaxed text-ink/80 sm:block">{t.hero.sub}</p>
            <a
              href="#collection"
              onClick={scrollToCollection}
              className="pointer-events-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-7 py-3 text-sm font-medium transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-[#d3a05a]/30 active:scale-95 sm:mt-6"
              style={{ background: 'var(--accent)', color: 'var(--panel)' }}
            >
              {t.hero.cta}
              <ArrowRight size={16} strokeWidth={2} className="rtl:-scale-x-100" />
            </a>
          </div>

          <div className={`max-w-[260px] text-end ${right.className}`} style={right.style}>
            <p className="en-tracking text-[10px] uppercase tracking-[.3em] text-ink/60">
              {t.hero.featuredLabel}
            </p>
            <p className="mt-2 text-sm font-medium text-ink">
              {lang === 'ar' ? featured.nameAr : featured.nameEn}
              <span className="text-ink/50"> — </span>
              <span dir="ltr" className="whitespace-nowrap font-display text-lg" style={{ color: 'var(--accent)' }}>
                {featured.price}
              </span>
            </p>
            <p className="mt-1 hidden text-sm leading-relaxed text-ink/80 sm:block">{featured.notes[lang]}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
