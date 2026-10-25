// Consultations ("looks"): designs the team saved in the studio, with photo, colors and the AI skin match.
// Same board as requests (status tabs, search, quick actions) plus the technician who saved each look.
import { Link } from 'react-router-dom'
import { Images, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { Empty } from '../components/ui'
import { RecordsBoard, useStudioButtonLabel } from './RecordDetail'

export default function Looks() {
  const { t } = useI18n()
  const { saveToSalon } = useStudioButtonLabel()

  return (
    <RecordsBoard
      kind="look"
      actions={
        <Link to="/try" className="btn-mocha">
          <Sparkles size={18} />
          {t('rec_new_consultation')}
        </Link>
      }
      empty={<Empty icon={Images} title={t('rec_look_empty_title')} text={t('rec_look_empty_text', { button: saveToSalon })} />}
    />
  )
}
