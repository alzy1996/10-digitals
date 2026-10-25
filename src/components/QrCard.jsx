// Reception QR: customers scan → try colors on their own phone → send the look to the salon.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Printer, Download, QrCode } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { appUrl } from '../lib/base'

export function QrCard({ salonName }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const target = appUrl('try')

  useEffect(() => {
    QRCode.toDataURL(target, { width: 640, margin: 1, color: { dark: '#1D1A18', light: '#FFFFFF' }, errorCorrectionLevel: 'M' })
      .then(setUrl)
      .catch(() => setUrl(''))
  }, [target])

  const print = () => {
    const w = window.open('', '_blank', 'noopener,width=600,height=800')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR</title>
      <style>body{font-family:Manrope,'IBM Plex Sans Arabic',sans-serif;text-align:center;padding:40px;color:#1D1A18}
      h1{font-family:'Cormorant Garamond',serif;font-size:44px;margin:0 0 6px}p{font-size:20px;margin:6px 0}img{width:380px;height:380px;margin:24px auto;display:block}</style></head>
      <body><h1>${escapeHtml(salonName || 'Nail Mirror')}</h1><p>Scan to try nail colors on your hand</p><p dir="rtl">امسحي الرمز وجرّبي الألوان على يدك</p>
      <img src="${url}" alt="QR"/><p style="font-size:14px;color:#6B625C">${escapeHtml(target)}</p>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-white">
        {url ? <img src={url} alt={t('qr_alt')} className="h-full w-full" /> : <QrCode className="text-ink-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[22px] font-semibold leading-tight">{t('qr_title')}</p>
        <p className="mt-1 text-[13px] text-ink-500">{t('qr_text')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={print} className="btn-primary min-h-[44px] px-4 text-[14px]" disabled={!url}>
            <Printer size={16} />
            {t('print')}
          </button>
          <a href={url} download="try-on-qr.png" className="btn-ghost min-h-[44px] px-4 text-[14px]">
            <Download size={16} />
            PNG
          </a>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
