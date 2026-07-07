import { ProductImage } from '../components/ProductImage'
import { products } from '../content/content'
import { useI18n } from '../lib/i18n'

// Horizontal scroll-snap strip pinned to the bottom of the hero panel —
// mirrors the reference's mini-card row. Native drag scroll, hidden bar.
export default function BestSellers() {
  const { t, lang } = useI18n()

  return (
    <div id="bestsellers" className="border-t border-line">
      <div className="flex items-stretch">
        <div className="hidden shrink-0 flex-col justify-center gap-1 border-e border-line px-6 py-5 sm:flex md:px-8">
          <span className="en-tracking text-[10px] uppercase tracking-[.3em] text-muted">
            {t.bestSellers.label}
          </span>
          <span className="font-display text-2xl italic" style={{ color: 'var(--accent)' }}>
            {t.bestSellers.index}
          </span>
        </div>
        <div className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto">
          {products.map((p) => (
            <a
              key={p.id}
              href="#collection"
              className="group flex min-w-[240px] flex-1 snap-start items-center gap-4 border-e border-line px-5 py-5 transition-colors duration-300 last:border-e-0 hover:bg-white/[.03] md:px-6"
            >
              <ProductImage
                src={p.img}
                alt={lang === 'ar' ? p.nameAr : p.nameEn}
                width={96}
                height={128}
                label={false}
                className="h-16 w-12 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="truncate text-sm font-medium text-ink transition-colors duration-300 group-hover:text-accent">
                    {lang === 'ar' ? p.nameAr : p.nameEn}
                  </h3>
                  <span className="shrink-0 text-xs text-muted">{p.price}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted">{p.desc[lang]}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
