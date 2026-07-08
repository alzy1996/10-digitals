import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import LangToggle from './LangToggle'
import { scrollToEl } from '../lib/scroll'

interface NavLink {
  label: string
  href: string
}

function scrollToHash(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (scrollToEl(href)) e.preventDefault()
}

export default function Nav() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const leftLinks: NavLink[] = [
    { label: t.nav.shop, href: '#collection' },
    { label: t.nav.collection, href: '#collection' },
    { label: t.nav.new, href: '#bestsellers' },
  ]
  const rightLinks: NavLink[] = [
    { label: t.nav.about, href: '#story' },
    { label: t.nav.bestSeller, href: '#bestsellers' },
    { label: t.nav.contact, href: '#order' },
  ]

  const linkClass =
    'en-tracking text-xs uppercase tracking-[.2em] text-muted transition-colors duration-300 hover:text-accent'

  const wordmark = (
    <a href="#top" onClick={(e) => scrollToHash(e, '#hero')} className="flex flex-col items-center leading-none">
      <span className="font-display text-3xl italic text-ink">{t.brand.name}</span>
      <span className="en-tracking mt-1 text-[10px] uppercase tracking-[.35em] text-muted">
        {t.brand.sub}
      </span>
    </a>
  )

  return (
    <header className="relative z-20">
      {/* Desktop */}
      <div className="hidden grid-cols-[1fr_auto_1fr] items-center gap-6 px-8 py-7 lg:grid xl:px-12">
        <nav className="flex items-center gap-7">
          {leftLinks.map((l) => (
            <a key={l.label} href={l.href} onClick={(e) => scrollToHash(e, l.href)} className={linkClass}>
              {l.label}
            </a>
          ))}
        </nav>
        {wordmark}
        <div className="flex items-center justify-end gap-7">
          {rightLinks.map((l) => (
            <a key={l.label} href={l.href} onClick={(e) => scrollToHash(e, l.href)} className={linkClass}>
              {l.label}
            </a>
          ))}
          <LangToggle />
        </div>
      </div>

      {/* Mobile bar */}
      <div className="flex items-center justify-between px-5 py-5 lg:hidden">
        {wordmark}
        <div className="flex items-center gap-3">
          <LangToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t.nav.menu}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-line text-ink transition-colors duration-300 hover:border-accent hover:text-accent"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Mobile full-screen panel menu */}
      {open && (
        <div className="fixed inset-0 z-[95] flex flex-col bg-panel px-6 py-6 lg:hidden">
          <div className="flex items-center justify-between">
            {wordmark}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.nav.close}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-line text-ink transition-colors duration-300 hover:border-accent hover:text-accent"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="mt-14 flex flex-col gap-2">
            {[...leftLinks, ...rightLinks].map((l, i) => (
              <a
                key={`${l.label}-${i}`}
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
        </div>
      )}
    </header>
  )
}
