import { ProductImage } from '../components/ProductImage'
import { products } from '../content/content'
import { useI18n } from '../lib/i18n'
import { scrollToEl } from '../lib/scroll'

// Dark ticker band under the hero: the bestseller cards on an endless
// marquee (list ×3, track slides one third). Copies 2 and 3 are hidden
// from assistive tech and the tab order so only one real set is exposed.
export default function BestSellers() {
  const { t, lang } = useI18n()
  const loop = [0, 1, 2].flatMap((copy) => products.map((p) => ({ p, copy })))

  return (
    <section id="bestsellers" className="border-y border-line bg-panel">
      <div className="flex items-stretch">
        <div className="relative z-10 hidden shrink-0 flex-col justify-center gap-1 border-e border-line bg-panel px-6 py-5 sm:flex md:px-8">
          <span className="en-tracking text-[10px] uppercase tracking-[.3em] text-muted">{t.bestSellers.label}</span>
          <span className="font-display text-2xl italic" style={{ color: 'var(--accent)' }}>
            {t.bestSellers.index}
          </span>
        </div>
        <div
          className="marquee relative flex-1 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)',
          }}
        >
          <div className="marquee-track flex w-max">
            {loop.map(({ p, copy }) => {
              const name = lang === 'ar' ? p.nameAr : p.nameEn
              const hidden = copy > 0
              return (
                <a
                  key={`${p.id}-${copy}`}
                  href="#collection"
                  onClick={(e) => {
                    if (scrollToEl('#collection')) e.preventDefault()
                  }}
                  aria-hidden={hidden || undefined}
                  tabIndex={hidden ? -1 : undefined}
                  className="group flex w-[280px] shrink-0 items-center gap-4 border-e border-line px-6 py-5 transition-colors duration-300 hover:bg-white/[.03]"
                >
                  <ProductImage
                    src={p.img}
                    alt={hidden ? '' : name}
                    width={96}
                    height={128}
                    label={false}
                    className="h-16 w-12 shrink-0"
                  />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-ink transition-colors duration-300 group-hover:text-accent">
                      {name}
                      <span className="text-ink/40"> — </span>
                      <span dir="ltr" className="font-display" style={{ color: 'var(--accent)' }}>
                        {p.price}
                      </span>
                    </h3>
                    <p className="mt-1 truncate text-xs text-muted">{p.notes[lang]}</p>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
