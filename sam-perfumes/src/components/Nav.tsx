import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import LangToggle from './LangToggle'
import { scrollToEl } from '../lib/scroll'
import { waLink } from '../content/content'

interface NavLink {
  label: string
  href: string
}

function scrollToHash(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (scrollToEl(href)) e.preventDefault()
}

// Fixed glass nav: wordmark start, glass link pill centre, cream Order
// pill end. Over the hero it floats bare; past it, it gains a dark glass
// bar so it stays legible on the bronze sections.
export default function Nav() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.82)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links: NavLink[] = [
    { label: t.nav.collection, href: '#collection' },
    { label: t.nav.bestSeller, href: '#bestsellers' },
    { label: t.nav.about, href: '#story' },
    { label: t.nav.contact, href: '#order' },
  ]

  const wordmark = (
    <a
      href="#hero"
      onClick={(e) => scrollToHash(e, '#hero')}
      className="pointer-events-auto flex flex-col items-start leading-none"
    >
      <span className="font-display text-3xl italic text-ink">{t.brand.name}</span>
      <span className="en-tracking mt-1 text-[10px] uppercase tracking-[.35em] text-ink/60">{t.brand.sub}</span>
    </a>
  )

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[100] transition-[background-color,border-color,backdrop-filter] duration-500 ${
          scrolled ? 'border-b border-white/10 bg-[rgba(23,16,9,0.78)] backdrop-blur-md' : 'border-b border-transparent'
        }`}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-10 lg:px-14">
          {wordmark}

          <nav className="hidden items-center gap-1 rounded-full border border-white/30 bg-white/[0.14] p-1.5 backdrop-blur-md lg:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => scrollToHash(e, l.href)}
                className="en-tracking rounded-full px-4 py-2 text-xs uppercase tracking-[.18em] text-ink/85 transition-colors duration-300 hover:bg-white/10 hover:text-ink"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LangToggle />
            <a
              href={waLink(t.order.waGeneralMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden min-h-11 items-center rounded-full bg-ink px-6 text-xs font-medium text-ink-dark transition-all duration-300 hover:scale-[1.03] active:scale-95 lg:inline-flex"
            >
              {t.collection.order}
            </a>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t.nav.menu}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/[0.08] text-ink backdrop-blur-md transition-colors duration-300 hover:border-accent hover:text-accent lg:hidden"
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[150] flex flex-col bg-panel px-6 py-5 lg:hidden">
          <div className="flex items-center justify-between">
            {wordmark}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.nav.close}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-ink transition-colors duration-300 hover:border-accent hover:text-accent"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="mt-14 flex flex-col gap-2">
            {links.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => {
                  scrollToHash(e, l.href)
                  setOpen(false)
                }}
                className="anim flex min-h-11 items-center border-b border-line py-3 font-display text-3xl text-ink transition-colors duration-300 hover:text-accent"
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <a
            href={waLink(t.order.waGeneralMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="anim mt-auto inline-flex min-h-12 items-center justify-center rounded-full px-7 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--panel)', animationDelay: '0.32s' }}
          >
            {t.order.whatsapp}
          </a>
        </div>
      )}
    </>
  )
}
