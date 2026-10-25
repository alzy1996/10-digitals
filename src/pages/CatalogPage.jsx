import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider'
import { PublicNav, PublicFooter } from './PublicShell'
import { CatalogGrid } from '../components/CatalogGrid'
import { useCatalog } from '../features/tryon/useCatalog'

export default function CatalogPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const cat = useCatalog()
  return (
    <div className="min-h-dvh bg-porcelain">
      <PublicNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="eyebrow">{cat.hasInventory ? t('catalog_eyebrow_salon') : t('catalog_eyebrow_library')}</p>
        <h1 className="section-title mt-2">{t('catalog_title')}</h1>
        <p className="mt-2 max-w-xl text-[15px] text-ink-500">{t('catalog_sub')}</p>
        <div className="mt-6">
          <CatalogGrid shades={cat.shades} library={cat.library} hasInventory={cat.hasInventory} salon={cat.salon} pickLabel={t('try_on_hand')} onPick={(p) => navigate(`/try?shade=${encodeURIComponent(p.id)}`)} />
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
