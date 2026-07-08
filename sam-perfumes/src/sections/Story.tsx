import { useEffect, useRef, useState } from 'react'
import SectionTitle from '../components/SectionTitle'
import { asset } from '../content/content'
import { useI18n } from '../lib/i18n'

const STORY_IMG = asset('img/story-1.jpg')

// Dark panel split: parallax atelier image left, story copy + stat chips
// right. Image scrubs ±10% with scroll; a token gradient stands in if the
// photo is missing.
export default function Story() {
  const { t } = useI18n()
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!imgRef.current || !frameRef.current) return
    let cancelled = false
    let tween: { scrollTrigger?: { kill: () => void }; kill: () => void } | undefined
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled || !imgRef.current || !frameRef.current) return
        gsap.registerPlugin(ScrollTrigger)
        tween = gsap.fromTo(
          imgRef.current,
          { yPercent: -8 },
          {
            yPercent: 8,
            ease: 'none',
            scrollTrigger: {
              trigger: frameRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        )
      },
    )
    return () => {
      cancelled = true
      tween?.scrollTrigger?.kill()
      tween?.kill()
    }
  }, [failed])

  const fallbackStyle = {
    background:
      'radial-gradient(80% 60% at 30% 20%, var(--accent-deep) 0%, var(--panel-soft) 55%, var(--panel) 100%)',
  }

  return (
    <section id="story" className="px-3 sm:px-5">
      <div className="grid gap-10 overflow-hidden rounded-lg2 border border-line bg-panel px-6 py-14 sm:px-10 md:py-20 lg:grid-cols-2 lg:gap-14 xl:px-14">
        <div
          ref={frameRef}
          className="relative order-2 h-64 overflow-hidden rounded-lg2 sm:h-80 lg:order-1 lg:h-auto lg:min-h-[420px]"
        >
          {failed ? (
            <div
              ref={(el) => void (imgRef.current = el)}
              className="absolute -top-[10%] h-[120%] w-full"
              style={fallbackStyle}
            />
          ) : (
            <img
              ref={(el) => void (imgRef.current = el)}
              src={STORY_IMG}
              alt={`${t.story.titlePre}${t.story.titleAccent}${t.story.titlePost}`}
              width={720}
              height={900}
              loading="lazy"
              onError={() => setFailed(true)}
              className="absolute -top-[10%] h-[120%] w-full object-cover"
            />
          )}
        </div>
        <div className="order-1 lg:order-2 lg:py-6">
          <div className="text-ink">
            <SectionTitle
              pre={t.story.titlePre}
              accent={t.story.titleAccent}
              post={t.story.titlePost}
              onDark
            />
          </div>
          <p data-reveal className="anim-wait mt-7 max-w-md text-sm leading-relaxed text-muted">
            {t.story.body}
          </p>
          <div data-reveal className="anim-wait mt-9 flex flex-wrap gap-3">
            {t.story.chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex min-h-11 items-center rounded-pill border border-line px-5 text-xs text-ink"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
