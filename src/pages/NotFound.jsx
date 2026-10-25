import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider'
import { NailSwatch } from '../components/NailSwatch'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-porcelain px-6 text-center">
      <NailSwatch hex="#A47864" finish="chrome" size={60} />
      <h1 className="font-display text-[44px] font-semibold">{t('not_found_title')}</h1>
      <p className="max-w-sm text-[15px] text-ink-500">{t('not_found_text')}</p>
      <Link to="/" className="btn-primary">
        {t('go_home')}
      </Link>
    </div>
  )
}
