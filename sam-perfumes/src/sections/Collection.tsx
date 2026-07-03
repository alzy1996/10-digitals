import SectionTitle from '../components/SectionTitle'
import ProductCard from '../components/ProductCard'
import { products } from '../content/content'
import { useI18n } from '../lib/i18n'

// Product grid on the open bronze page — the one section that breathes
// outside a dark panel.
export default function Collection() {
  const { t } = useI18n()

  return (
    <section id="collection" className="px-5 py-20 sm:px-8 md:py-28 lg:px-14">
      <SectionTitle
        pre={t.collection.titlePre}
        accent={t.collection.titleAccent}
        post={t.collection.titlePost}
      />
      <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-12 md:mt-16 lg:grid-cols-4 lg:gap-x-8">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  )
}
