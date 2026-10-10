import { useI18n } from '../lib/i18n'
import { scrollToEl } from '../lib/scroll'

export default function Footer() {
  const { t } = useI18n()

  const links = [
    { label: t.nav.collection, href: '#collection' },
    { label: t.nav.about, href: '#story' },
    { label: t.nav.contact, href: '#order' },
  ]

  return (
    <footer className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="flex flex-col items-center gap-6 rounded-lg2 border border-line bg-panel px-6 py-8 sm:flex-row sm:justify-between sm:gap-4 sm:px-10">
        <div className="flex flex-col items-center leading-none sm:items-start">
          <span className="font-display text-2xl italic text-ink">{t.brand.name}</span>
          <span className="en-tracking mt-1 text-[9px] uppercase tracking-[.35em] text-muted">
            {t.brand.sub}
          </span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => {
                if (scrollToEl(l.href)) e.preventDefault()
              }}
              className="en-tracking flex min-h-11 items-center text-xs uppercase tracking-[.2em] text-muted transition-colors duration-300 hover:text-accent"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="text-center text-xs text-muted sm:text-end">
          <p>{t.footer.location}</p>
          <p className="mt-1">{t.footer.rights}</p>
        </div>
      </div>
    </footer>
  )
}
