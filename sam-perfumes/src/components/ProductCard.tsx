import { ProductImage } from './HeroVisual'
import { waLink } from '../content/content'
import type { Product } from '../content/content'
import { useI18n } from '../lib/i18n'

export default function ProductCard({ product }: { product: Product }) {
  const { t, lang } = useI18n()
  const name = lang === 'ar' ? product.nameAr : product.nameEn

  return (
    <article data-reveal className="anim-wait group">
      <div
        className="rounded-lg2 border border-line bg-panel-soft px-6 pb-2 pt-8 transition-[transform,border-color,box-shadow] duration-[400ms] [transform-style:preserve-3d] group-hover:border-accent group-hover:[transform:translateY(-6px)_rotateX(4deg)_rotateY(-2deg)] group-hover:[box-shadow:0_24px_44px_rgba(23,16,9,.35)]"
      >
        <ProductImage
          src={product.img}
          alt={name}
          width={300}
          height={400}
          className="mx-auto h-44 w-32 sm:h-52 sm:w-40"
          imgClassName="drop-shadow-[0_18px_24px_rgba(23,16,9,0.4)]"
        />
        <div className="mt-4 h-px w-full" style={{ background: 'var(--line)' }} />
        <p className="py-3 text-center text-xs text-muted">{product.notes[lang]}</p>
      </div>
      <div className="mt-4 px-1">
        <h3 className="font-display text-xl text-ink-dark">{name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-dark">{product.desc[lang]}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink-dark">{product.price}</span>
          <a
            href={waLink(t.whatsappOrderMessage(product.nameEn))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-pill px-5 py-2 text-xs font-medium transition-transform duration-300 hover:scale-[1.05]"
            style={{ background: 'var(--panel)', color: 'var(--ink)' }}
          >
            {t.collection.order}
          </a>
        </div>
      </div>
    </article>
  )
}
