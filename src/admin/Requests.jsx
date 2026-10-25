// Customer requests: looks customers sent from the public try-on ("Send to salon").
// Live inbox (real-time), status tabs with counts, search, one-tap WhatsApp reply in the customer's language.
import { Link } from 'react-router-dom'
import { Inbox, Link2, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Empty, useToast } from '../components/ui'
import { QrCard } from '../components/QrCard'
import { RecordsBoard, useStudioButtonLabel } from './RecordDetail'

export default function Requests() {
  const { t, pick } = useI18n()
  const { staff } = useData()
  const toast = useToast()
  const { sendToSalon } = useStudioButtonLabel()
  const link = `${window.location.origin}/try`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast(t('rec_link_copied'))
    } catch {
      toast(t('rec_copy_failed', { url: link }), 'warn', 6000)
    }
  }

  return (
    <RecordsBoard
      kind="request"
      actions={
        <button type="button" className="btn-ghost" onClick={copyLink}>
          <Link2 size={18} />
          {t('rec_copy_link')}
        </button>
      }
      empty={
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Empty
            icon={Inbox}
            title={t('rec_req_empty_title')}
            text={t('rec_req_empty_text', { button: sendToSalon })}
            action={
              <Link to="/try" className="btn-ghost">
                <Sparkles size={18} />
                {t('rec_preview_tryon')}
              </Link>
            }
          />
          <div className="self-start">
            <QrCard salonName={pick(staff.salon || {})} />
          </div>
        </div>
      }
    />
  )
}
