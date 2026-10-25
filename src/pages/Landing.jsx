// Public home page. Image-free luxury hero (fast on 4G, no stock-photo licensing): a fan of photo-real
// CSS nails + a glass "AI Match" card. One primary action everywhere: Try it on your hand.
import { Link } from 'react-router-dom'
import { Sparkles, ImagePlus, Hand, Palette, Send, ShieldCheck, Wand2, ArrowRight, Clock } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PublicNav, PublicFooter } from './PublicShell'
import { NailSwatch } from '../components/NailSwatch'
import { COLLECTIONS, LIBRARY_BY_ID } from '../data/library'
import { FINISHES, MONK_SCALE } from '../data/taxonomy'
import { money } from '../lib/format'

// x / width / height / rotation of 5 stylized fingers (thumb → pinky)
const FINGERS_GEO = [
  { x: -18, w: 50, h: 150, rot: -38 },
  { x: 38, w: 46, h: 250, rot: -8 },
  { x: 92, w: 47, h: 275, rot: -1 },
  { x: 146, w: 45, h: 250, rot: 6 },
  { x: 196, w: 40, h: 200, rot: 14 },
]

const HERO_NAILS = [
  { hex: '#E3A79A', finish: 'chrome', rot: -24, y: 26 },
  { hex: '#A47864', finish: 'creme', rot: -11, y: 6 },
  { hex: '#6A1029', finish: 'velvet', hex2: '#C2416A', rot: 0, y: 0 },
  { hex: '#F3E8E1', finish: 'pearl', rot: 11, y: 6 },
  { hex: '#A9C8E8', finish: 'shimmer', rot: 24, y: 26 },
]

function inSeason(c, now = new Date()) {
  if (!c.season) return true
  const [a, b] = c.season.split('..')
  const md = (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0')
  return md >= a && md <= b
}

export default function Landing() {
  const { t, pick, lang } = useI18n()
  const { site } = useData()
  const salon = site.salon || {}
  const collections = COLLECTIONS.filter((c) => inSeason(c))
  const services = (site.services || []).slice(0, 8)

  return (
    <div className="min-h-dvh bg-porcelain">
      <PublicNav />

      {/* ---------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_10%,rgba(169,200,232,.45),transparent_70%),radial-gradient(50%_45%_at_10%_90%,rgba(200,169,126,.35),transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:pb-24 md:pt-16">
          <div className="animate-rise">
            <p className="eyebrow">{t('hero_eyebrow')}</p>
            <h1 className="mt-3 font-display text-[48px] font-semibold leading-[0.98] text-ink sm:text-[62px] lg:text-[72px]">{pick(salon, 'tagline') || t('hero_title')}</h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-500">{t('hero_sub')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/try?mode=live" className="btn-primary h-14 px-7 text-[16px]">
                <Sparkles size={20} />
                {t('cta_try_live')}
              </Link>
              <Link to="/try" className="btn-ghost h-14 px-7 text-[16px]">
                <ImagePlus size={20} />
                {t('cta_upload')}
              </Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-400">
              <ShieldCheck size={16} />
              {t('hero_privacy')}
            </p>
          </div>

          {/* stylized hand with painted nails + AI card */}
          <div className="relative mx-auto h-[400px] w-full max-w-[440px] sm:h-[460px]" aria-hidden="true">
            <div className="absolute inset-x-6 bottom-6 top-10 rounded-[48px] bg-gradient-to-b from-glaze-100 via-porcelain-200 to-mocha-100 shadow-lift" />
            <div className="absolute inset-x-0 bottom-16 top-16 flex items-end justify-center">
              <div className="relative h-full w-[250px]" style={{ transform: 'rotate(-6deg)' }}>
                {HERO_NAILS.map((n, i) => {
                  const f = FINGERS_GEO[i]
                  return (
                    <div key={i} className="absolute bottom-0 animate-rise" style={{ left: f.x, width: f.w, height: f.h, transform: `rotate(${f.rot}deg)`, transformOrigin: 'bottom center', animationDelay: i * 80 + 'ms' }}>
                      <div className="absolute inset-0 rounded-t-full" style={{ background: 'linear-gradient(90deg,#C99A7C 0%,#E7C2A6 35%,#EFCFB5 55%,#D9AD8F 100%)', boxShadow: 'inset -4px 0 8px rgba(120,70,40,.18)' }} />
                      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: f.w * 0.12 }}>
                        <NailSwatch hex={n.hex} hex2={n.hex2} finish={n.finish} size={Math.round(f.w * 0.7)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="glass-light absolute bottom-0 start-0 w-[78%] rounded-3xl p-4 shadow-lift sm:start-2">
              <p className="flex items-center gap-2 text-[12px] font-bold text-mocha">
                <Wand2 size={14} />
                {t('ai_match')}
              </p>
              <p className="mt-1 font-display text-[24px] font-semibold leading-tight">{t('hero_card_title')}</p>
              <div className="mt-2 flex gap-1">
                {MONK_SCALE.map((m) => (
                  <span key={m.level} className={`h-3 flex-1 rounded-full ${m.level === 6 ? 'ring-2 ring-ink ring-offset-1' : ''}`} style={{ background: m.hex }} />
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-500">{t('hero_card_text')}</p>
            </div>
            <div className="glass-light absolute end-0 top-0 rounded-2xl px-3 py-2 text-[12px] font-bold shadow-soft">
              <span className="me-1 inline-block h-2 w-2 rounded-full bg-ok" />
              {t('live_on_hand')}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="eyebrow">{t('how_eyebrow')}</p>
        <h2 className="section-title mt-2">{t('how_title')}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: Hand, k: 'how_1' },
            { icon: Palette, k: 'how_2' },
            { icon: Send, k: 'how_3' },
          ].map((s, i) => (
            <div key={s.k} className="card p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mocha-50 text-mocha">
                  <s.icon size={22} />
                </span>
                <span className="font-display text-[44px] font-semibold text-ink/10">0{i + 1}</span>
              </div>
              <p className="mt-4 font-display text-[26px] font-semibold">{t(s.k + '_title')}</p>
              <p className="mt-1 text-[15px] text-ink-500">{t(s.k + '_text')}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- collections */}
      <section id="collections" className="scroll-mt-20 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{t('collections_eyebrow')}</p>
              <h2 className="section-title mt-2">{t('collections_title')}</h2>
            </div>
            <Link to="/catalog" className="hidden items-center gap-1 text-[15px] font-bold text-mocha sm:inline-flex">
              {t('see_all_colors')} <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
          </div>
        </div>
        <div className="no-scrollbar mt-6 flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:mx-auto md:grid md:max-w-6xl md:grid-cols-3 md:overflow-visible">
          {collections.map((c) => {
            const shades = c.ids.map((id) => LIBRARY_BY_ID[id]).filter(Boolean)
            return (
              <Link key={c.key} to={`/try?shade=${shades[0]?.id || ''}`} className="card group w-[280px] shrink-0 snap-start overflow-hidden md:w-auto">
                <div className="flex h-36 items-end justify-center gap-2 bg-gradient-to-b from-porcelain-200 to-porcelain-100 px-4 pb-4">
                  {shades.map((s, i) => (
                    <div key={s.id} style={{ transform: `translateY(${Math.abs(i - 2.5) * 6}px)` }}>
                      <NailSwatch hex={s.hex} hex2={s.hex2} finish={s.finish} size={36} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-display text-[24px] font-semibold leading-tight">{pick(c)}</p>
                    <p className="text-[13px] text-ink-500">{t('n_shades', { n: shades.length })}</p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white transition group-hover:scale-105">
                    <ArrowRight size={18} className="rtl:rotate-180" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- AI match */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="relative overflow-hidden rounded-4xl bg-night p-7 text-white md:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(169,200,232,.25),transparent_60%),radial-gradient(50%_70%_at_0%_100%,rgba(107,74,58,.6),transparent_60%)]" />
          <div className="relative grid items-center gap-8 md:grid-cols-2">
            <div>
              <p className="eyebrow !text-champagne-300">{t('ai_eyebrow')}</p>
              <h2 className="mt-2 font-display text-[40px] font-semibold leading-[1.02] md:text-[52px]">{t('ai_title')}</h2>
              <p className="mt-4 max-w-md text-[16px] text-white/70">{t('ai_text')}</p>
              <ul className="mt-5 space-y-2 text-[15px] text-white/85">
                {['ai_point_1', 'ai_point_2', 'ai_point_3'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Sparkles size={16} className="mt-1 shrink-0 text-champagne-300" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <Link to="/try?mode=live" className="btn mt-7 bg-white text-ink">
                <Wand2 size={18} />
                {t('cta_ai')}
              </Link>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {MONK_SCALE.map((m) => (
                <div key={m.level} className="flex flex-col items-center gap-2">
                  <span className="h-14 w-14 rounded-full border-2 border-white/20 shadow-lift" style={{ background: m.hex }} />
                  <span className="text-[11px] text-white/50">{m.level}</span>
                </div>
              ))}
              <p className="col-span-5 mt-2 text-center text-[12px] text-white/50">{t('monk_credit')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- finishes */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="eyebrow">{t('finishes_eyebrow')}</p>
        <h2 className="section-title mt-2">{t('finishes_title')}</h2>
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {FINISHES.map((f, i) => {
            const hex = ['#B5121B', '#6A1029', '#A47864', '#E8B9B3', '#1B2440', '#D4D6DA', '#C9B4DD', '#111012'][i % 8]
            return (
              <Link key={f.key} to="/try" className="card flex flex-col items-center gap-2 p-4 text-center transition hover:-translate-y-0.5">
                <NailSwatch hex={f.key === 'chrome' || f.key === 'holo' ? '#D4D6DA' : f.key === 'milky' || f.key === 'sheer' ? '#EFC3C4' : f.key === 'neon' ? '#FF2E8B' : hex} finish={f.key} size={40} />
                <span className="text-[13px] font-bold">{pick(f)}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- services */}
      {services.length > 0 && (
        <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12">
          <p className="eyebrow">{t('services_eyebrow')}</p>
          <h2 className="section-title mt-2">{t('services_title')}</h2>
          <div className="card mt-8 divide-y divide-ink/5">
            {services.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="text-[17px] font-bold">{pick(s)}</p>
                  {s.durationMin ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-500">
                      <Clock size={14} />
                      {t('minutes', { n: s.durationMin })}
                    </p>
                  ) : null}
                </div>
                {salon.showPrices !== false && typeof s.price === 'number' && <p className="shrink-0 font-display text-[24px] font-semibold text-mocha">{money(s.price, lang, salon.currency)}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- final CTA */}
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <div className="card flex flex-col items-center gap-4 bg-gradient-to-br from-glaze-50 to-porcelain-50 p-8 text-center md:p-12">
          <h2 className="font-display text-[38px] font-semibold leading-tight md:text-[48px]">{t('final_title')}</h2>
          <p className="max-w-lg text-[16px] text-ink-500">{t('final_text')}</p>
          <Link to="/try?mode=live" className="btn-primary h-14 px-8 text-[16px]">
            <Sparkles size={20} />
            {t('cta_try_live')}
          </Link>
        </div>
      </section>

      <PublicFooter />

      {/* mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-porcelain/95 p-3 pb-safe backdrop-blur sm:hidden">
        <Link to="/try?mode=live" className="btn-primary h-14 w-full text-[16px]">
          <Sparkles size={20} />
          {t('cta_try_live')}
        </Link>
      </div>
    </div>
  )
}
