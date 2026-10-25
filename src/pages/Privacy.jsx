// Plain-language privacy notice (EN/AR). Honest about what runs on the device and what is sent anywhere.
// Have it reviewed by an Omani lawyer before commercial launch (PDPL, Royal Decree 6/2022).
import { useI18n } from '../i18n/I18nProvider'
import { useData, PHOTO_RETENTION_DAYS } from '../store/DataProvider'
import { PublicNav, PublicFooter } from './PublicShell'

const SECTIONS = ['pv_camera', 'pv_ai', 'pv_metrics', 'pv_stored', 'pv_photo', 'pv_no', 'pv_rights', 'pv_staff', 'pv_credits']

export default function Privacy() {
  const { t, pick } = useI18n()
  const { site } = useData()
  const salon = site.salon || {}
  return (
    <div className="min-h-dvh bg-porcelain">
      <PublicNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="eyebrow">{pick(salon) || t('app_name')}</p>
        <h1 className="section-title mt-2">{t('privacy_title')}</h1>
        <p className="mt-3 text-[16px] text-ink-500">{t('pv_intro')}</p>
        <div className="mt-8 space-y-4">
          {SECTIONS.map((k) => (
            <section key={k} className="card p-5">
              <h2 className="font-display text-[24px] font-semibold">{t(k + '_title')}</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{t(k + '_text', { days: PHOTO_RETENTION_DAYS, phone: salon.phone || '', whatsapp: salon.whatsapp || '' })}</p>
            </section>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
