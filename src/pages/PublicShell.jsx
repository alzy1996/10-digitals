// Public website frame: sticky glass nav (REF1/REF4 luxury), footer with visit info.
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, Sparkles, UserRound, MessageCircle, MapPin, Clock, Phone, Instagram } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Logo, LangToggle } from '../components/ui'
import { waLink } from '../lib/format'
import { withBase } from '../lib/base'

export function PublicNav() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const links = [
    { to: '/#collections', label: t('nav_collections') },
    { to: '/catalog', label: t('nav_colors') },
    { to: '/#services', label: t('nav_services') },
    { to: '/#visit', label: t('nav_visit') },
  ]
  return (
    <header className="sticky top-0 z-40 border-b border-ink/5 bg-porcelain/85 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/" aria-label="Home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a key={l.to} href={withBase(l.to)} className="rounded-full px-4 py-2 text-[15px] font-semibold text-ink-700 hover:bg-ink/5">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/try" className="btn-primary hidden min-h-[44px] px-5 text-[14px] sm:inline-flex">
            <Sparkles size={16} />
            {t('cta_try')}
          </Link>
          <LangToggle />
          <Link to="/admin" className="icon-btn hidden h-11 w-11 border border-ink/15 bg-white/80 md:inline-flex" aria-label={t('staff_login')}>
            <UserRound size={18} />
          </Link>
          <button onClick={() => setOpen((v) => !v)} className="icon-btn h-11 w-11 border border-ink/15 bg-white/80 md:hidden" aria-label={t('menu')} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="animate-rise border-t border-ink/5 bg-porcelain-50 px-4 pb-4 md:hidden">
          {links.map((l) => (
            <a key={l.to} href={withBase(l.to)} onClick={() => setOpen(false)} className="flex min-h-[52px] items-center border-b border-ink/5 text-[17px] font-semibold">
              {l.label}
            </a>
          ))}
          <NavLink to="/admin" onClick={() => setOpen(false)} className="flex min-h-[52px] items-center gap-2 text-[17px] font-semibold text-ink-500">
            <UserRound size={18} />
            {t('staff_login')}
          </NavLink>
          <Link to="/try" className="btn-primary mt-3 w-full">
            <Sparkles size={18} />
            {t('cta_try')}
          </Link>
        </div>
      )}
    </header>
  )
}

export function PublicFooter() {
  const { t, pick } = useI18n()
  const { site } = useData()
  const s = site.salon || {}
  return (
    <footer id="visit" className="mt-20 bg-night text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <p className="font-display text-[36px] font-semibold leading-tight">{pick(s) || t('app_name')}</p>
          <p className="mt-2 max-w-sm text-[15px] text-white/65">{pick(s, 'tagline') || t('hero_sub')}</p>
          {s.whatsapp && (
            <a href={waLink(s.whatsapp, t('wa_hello'))} target="_blank" rel="noopener noreferrer" className="btn mt-6 bg-[#25D366] text-ink">
              <MessageCircle size={18} />
              {t('chat_whatsapp')}
            </a>
          )}
        </div>
        <div className="space-y-4 text-[15px]">
          <p className="eyebrow !text-champagne-300">{t('nav_visit')}</p>
          {(s.address || s.addressAr) && (
            <p className="flex items-start gap-3 text-white/80">
              <MapPin size={18} className="mt-0.5 shrink-0 text-champagne-300" />
              {pick(s, 'address')}
            </p>
          )}
          {(s.hours || s.hoursAr) && (
            <p className="flex items-start gap-3 text-white/80">
              <Clock size={18} className="mt-0.5 shrink-0 text-champagne-300" />
              {pick(s, 'hours')}
            </p>
          )}
          {s.phone && (
            <a href={'tel:' + s.phone.replace(/\s/g, '')} className="flex items-center gap-3 text-white/80 hover:text-white" dir="ltr">
              <Phone size={18} className="shrink-0 text-champagne-300" />
              {s.phone}
            </a>
          )}
          {s.instagram && (
            <a href={'https://instagram.com/' + s.instagram.replace(/^@/, '')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-white/80 hover:text-white">
              <Instagram size={18} className="shrink-0 text-champagne-300" />@{s.instagram.replace(/^@/, '')}
            </a>
          )}
        </div>
        <div className="space-y-3 text-[15px]">
          <p className="eyebrow !text-champagne-300">{t('explore')}</p>
          <Link to="/try" className="block text-white/80 hover:text-white">
            {t('cta_try')}
          </Link>
          <Link to="/catalog" className="block text-white/80 hover:text-white">
            {t('nav_colors')}
          </Link>
          <Link to="/privacy" className="block text-white/80 hover:text-white">
            {t('privacy_title')}
          </Link>
          <Link to="/admin" className="block text-white/80 hover:text-white">
            {t('staff_login')}
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 pb-safe text-center text-[12px] text-white/45">
        © {new Date().getFullYear()} {pick(s) || t('app_name')} · {t('powered_by')}
      </div>
    </footer>
  )
}
