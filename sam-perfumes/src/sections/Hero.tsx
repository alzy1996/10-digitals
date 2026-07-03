import { ArrowRight } from 'lucide-react'
import Nav from '../components/Nav'
import HeroVisual from '../components/HeroVisual'
import BestSellers from './BestSellers'
import { products } from '../content/content'
import { useI18n } from '../lib/i18n'
import { scrollToEl } from '../lib/scroll'

interface HeroProps {
  ready: boolean
}

function scrollToCollection(e: React.MouseEvent<HTMLAnchorElement>) {
  if (scrollToEl('#collection')) e.preventDefault()
}

// One big dark rounded panel: nav on top, headline left, floating
// bottles center, featured price column right (lg+).
export default function Hero({ ready }: HeroProps) {
  const { t, lang } = useI18n()
  const featured = products[0]
  const animClass = ready ? 'anim' : 'anim-wait'
  const delay = (s: number) => ({ animationDelay: `${s}s` })

  return (
    <section id="hero" className="px-3 pt-3 sm:px-5 sm:pt-5">
      <div
        className="relative flex min-h-[92dvh] flex-col overflow-hidden rounded-lg2 border border-line"
        style={{
          background:
            'radial-gradient(90% 70% at 72% 12%, var(--panel-soft) 0%, var(--panel) 58%)',
        }}
      >
        <Nav />

        <div className="grid flex-1 items-center gap-10 px-6 pb-10 pt-4 sm:px-10 lg:grid-cols-[1.1fr_1.2fr_.7fr] lg:gap-6 xl:px-14">
          {/* Headline */}
          <div className="max-w-xl">
            <h1
              className={`${animClass} font-display text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl md:text-7xl`}
              style={delay(0.1)}
            >
              {t.hero.titlePre}
              <em className="italic" style={{ color: 'var(--accent)' }}>
                {t.hero.titleAccent}
              </em>
              {t.hero.titlePost}
            </h1>
            <p className={`${animClass} mt-6 max-w-sm text-sm leading-relaxed text-muted`} style={delay(0.25)}>
              {t.hero.sub}
            </p>
            <div className={`${animClass} mt-9`} style={delay(0.4)}>
              <a
                href="#collection"
                onClick={scrollToCollection}
                className="inline-flex min-h-11 items-center gap-2 rounded-pill px-7 py-3 text-sm font-medium transition-transform duration-300 hover:scale-[1.04]"
                style={{ background: 'var(--ink)', color: 'var(--ink-dark)' }}
              >
                {t.hero.cta}
                <ArrowRight size={16} strokeWidth={2} className="rtl:-scale-x-100" />
              </a>
            </div>
          </div>

          {/* Bottles */}
          <div className={animClass} style={delay(0.35)}>
            <HeroVisual />
          </div>

          {/* Featured column */}
          <div className={`${animClass} hidden lg:block`} style={delay(0.55)}>
            <p className="en-tracking text-[10px] uppercase tracking-[.3em] text-muted">
              {t.hero.featuredLabel}
            </p>
            <p className="mt-3 font-display text-4xl text-ink">{featured.price}</p>
            <p className="mt-2 text-sm font-medium text-ink">
              {lang === 'ar' ? featured.nameAr : featured.nameEn}
            </p>
            <p className="mt-2 max-w-[200px] text-xs leading-relaxed text-muted">{featured.desc[lang]}</p>
            <a
              href="#collection"
              onClick={scrollToCollection}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-pill border border-line px-5 py-2.5 text-xs text-ink transition-colors duration-300 hover:border-accent hover:text-accent"
            >
              {t.hero.cta}
              <ArrowRight size={14} strokeWidth={2} className="rtl:-scale-x-100" />
            </a>
          </div>
        </div>

        <BestSellers />
      </div>
    </section>
  )
}
