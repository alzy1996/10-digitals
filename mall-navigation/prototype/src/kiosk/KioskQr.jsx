import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import { addStrings, t } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { Icon } from '../ui/icons.jsx'
import { pick } from '../ui/model.js'
import './kiosk.css'

addStrings(MORE)

/** A QR code as one SVG path (error correction M; a 4-module quiet zone). */
export function KioskQr({ url, size = 168, label }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const n = qr.getModuleCount()
    let path = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`
    return { n, path }
  }, [url])
  return (
    <svg className="kiosk-qr" width={size} height={size} viewBox={`-4 -4 ${d.n + 8} ${d.n + 8}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect x="-4" y="-4" width={d.n + 8} height={d.n + 8} fill="#FFFFFF" />
      <path d={d.path} fill="#0B0F14" />
    </svg>
  )
}

/**
 * "Continue on your phone" (PLAN S21; DESIGN-MALL.md 3.8): the kiosk's route as a QR code the phone camera opens (the
 * same app, from the kiosk's plate to the place). On localhost a phone cannot reach the laptop: the card says so.
 */
export function KioskHandoff({ url, lang, local = false }) {
  return (
    <div className="kiosk-handoff">
      <KioskQr url={url} label={t('kiosk.qrLabel', lang)} />
      <div className="kiosk-handoff-text">
        <div className="kiosk-handoff-title">
          <Icon name="scan" size={22} />
          {t('kiosk.continue', lang)}
        </div>
        <p className="caption">{t('kiosk.scan', lang)}</p>
        {local ? <p className="kiosk-local">{t('kiosk.localhost', lang)}</p> : null}
      </div>
    </div>
  )
}

/**
 * The kiosk's attract screen (shown at start and after the idle reset): touch anywhere to start. DOM and CSS only (the
 * 3D view stays idle: 0 frames); the pulse stops under reduced motion.
 */
export function KioskAttract({ index, lang, onStart }) {
  const mall = pick(index.venue.meta.name, lang)
  const other = lang === 'ar' ? 'en' : 'ar'
  return (
    <button type="button" className="kiosk-attract" onClick={onStart}>
      <span className="kiosk-attract-ring" aria-hidden="true">
        <Icon name="pin" size={64} />
      </span>
      <span className="kiosk-attract-title">{t('kiosk.welcome', lang, { mall })}</span>
      <span className="kiosk-attract-cta">{t('kiosk.touch', lang)}</span>
      <span className="kiosk-attract-other" lang={other}>
        {t('kiosk.touch', other)}
      </span>
      <span className="badge-sim">{t('app.badge', lang)}</span>
    </button>
  )
}
