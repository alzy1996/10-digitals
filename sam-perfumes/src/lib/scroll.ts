import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

// Lenis smooth scroll wired into GSAP's ticker, plus a ScrollTrigger.batch
// that staggers .anim reveals onto every [data-reveal] element. Call once
// from App; returns a cleanup for unmount.
export function initScroll(): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf: ((time: number) => void) | null = null

  if (!reduced && !lenis) {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true })
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

  return () => {
    triggers.forEach((st) => st.kill())
    if (raf) gsap.ticker.remove(raf)
    lenis?.destroy()
    lenis = null
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
