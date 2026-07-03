import type Lenis from 'lenis'

let lenis: Lenis | null = null

// Lenis smooth scroll wired into GSAP's ticker, plus a ScrollTrigger.batch
// that staggers .anim reveals onto every [data-reveal] element. Call once
// from App; returns a cleanup for unmount.
//
// gsap + lenis load via dynamic import so they stay off the critical
// path — the hero paints from the entry chunk, motion arrives a beat later.
export function initScroll(): () => void {
  let cancelled = false
  let cleanup: (() => void) | null = null

  ;(async () => {
    const [{ gsap }, { ScrollTrigger }, { default: LenisCtor }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
      import('lenis'),
    ])
    if (cancelled) return

    gsap.registerPlugin(ScrollTrigger)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf: ((time: number) => void) | null = null

    if (!reduced && !lenis) {
      lenis = new LenisCtor({ duration: 1.1, smoothWheel: true })
      lenis.on('scroll', ScrollTrigger.update)
      raf = (time: number) => lenis?.raf(time * 1000)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)
    }

    const triggers = ScrollTrigger.batch('[data-reveal]', {
      start: 'top 88%',
      once: true,
      onEnter: (els) =>
        els.forEach((el, i) => {
          ;(el as HTMLElement).style.animationDelay = `${i * 0.12}s`
          el.classList.add('anim')
        }),
    })

    cleanup = () => {
      triggers.forEach((st) => st.kill())
      if (raf) gsap.ticker.remove(raf)
      lenis?.destroy()
      lenis = null
    }
  })()

  return () => {
    cancelled = true
    cleanup?.()
  }
}

// Anchor navigation that respects Lenis (native smooth scroll fights it).
export function scrollToEl(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return false
  if (lenis) lenis.scrollTo(el, { offset: -10 })
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}
