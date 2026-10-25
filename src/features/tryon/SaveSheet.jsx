// Save / share. Staff → consultation saved to the salon (audit trail). Customer → "Send to salon" request.
// WhatsApp uses the free click-to-chat link (no paid API): copy text + open WhatsApp.
import { useEffect, useState } from 'react'
import { Download, Send, MessageCircle, FileText, CheckCircle2, Share2, Copy } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useData } from '../../store/DataProvider'
import { Sheet, Field, Spinner, Toggle, useToast } from '../../components/ui'
import { NailSwatch } from '../../components/NailSwatch'
import { downscaleDataUrl } from './TryOnEngine'
import { designSummary, serializeDesign, paintsOf } from './design'
import { waLink, normalizePhone } from '../../lib/format'
import { consultationPdf } from '../../lib/pdf'

export function SaveSheet({ open, onClose, engine, design, analysis }) {
  const { t, pick, lang } = useI18n()
  const { isStaff, actions, site } = useData()
  const toast = useToast()
  const [shot, setShot] = useState(null)
  const [thumb, setThumb] = useState(null)
  const [form, setForm] = useState({ customerName: '', customerPhone: '', preferredDate: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [withPhoto, setWithPhoto] = useState(false)
  const salon = site.salon || {}

  useEffect(() => {
    if (!open || !engine) return
    setDone(null)
    ;(async () => {
      if (engine.mode === 'live') await engine.freeze()
      const full = engine.capture(design, 0.9)
      setShot(full)
      setThumb(await downscaleDataUrl(full, 480, 0.72))
    })()
  }, [open, engine, design])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const summary = designSummary(design, t, pick)
  const analysisLite = analysis?.skin
    ? { depth: analysis.skin.depth, undertone: analysis.undertone || analysis.skin.undertone, monk: analysis.skin.monk, ita: analysis.skin.ita, hex: analysis.skin.hex, confidence: analysis.skin.confidence }
    : null

  const record = () => ({
    customerName: form.customerName.trim(),
    customerPhone: normalizePhone(form.customerPhone),
    preferredDate: form.preferredDate,
    note: form.note.trim(),
    design: serializeDesign(design),
    analysis: analysisLite,
    thumb: withPhoto ? thumb : '',
    lang,
  })

  const submit = async () => {
    setBusy(true)
    try {
      if (isStaff) {
        const id = await actions.saveLook(record())
        setDone({ kind: 'staff', id })
        toast(t('look_saved'))
      } else {
        const id = await actions.submitRequest(record())
        setDone({ kind: 'customer', id })
        toast(t('request_sent'))
      }
    } catch (e) {
      console.warn(e)
      toast(t('save_failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const waText = () => {
    const head = isStaff ? t('wa_staff_intro', { name: form.customerName || '' }) : t('wa_customer_intro', { salon: pick(salon) || '' })
    return `${head}\n${summary}${form.preferredDate ? '\n' + t('preferred_time') + ': ' + form.preferredDate : ''}${form.note ? '\n' + t('note') + ': ' + form.note : ''}`
  }
  const openWhatsApp = () => {
    const to = isStaff ? normalizePhone(form.customerPhone) : salon.whatsapp
    try {
      navigator.clipboard?.writeText(waText())
    } catch {
      /* optional */
    }
    window.open(waLink(to, waText()), '_blank', 'noopener')
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = shot
    a.download = `nail-look-${Date.now()}.jpg`
    a.click()
  }
  const share = async () => {
    try {
      const blob = await (await fetch(shot)).blob()
      const file = new File([blob], 'nail-look.jpg', { type: 'image/jpeg' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: waText() })
      else download()
    } catch {
      /* user cancelled */
    }
  }
  const pdf = async () => {
    setBusy(true)
    try {
      const doc = await consultationPdf({ salon, record: { ...record(), createdAt: Date.now() }, imageUrl: shot, lang, t, pick })
      doc.save(`consultation-${(form.customerName || 'guest').replace(/\s+/g, '-')}.pdf`)
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(waText())
      toast(t('copied'))
    } catch {
      toast(t('copy_failed'), 'warn')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={isStaff ? t('save_consultation') : t('love_it')}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="h-[150px] w-[112px] shrink-0 overflow-hidden rounded-2xl bg-night">{shot ? <img src={shot} alt="" className="h-full w-full object-cover" /> : <Spinner className="m-auto mt-14 text-white" />}</div>
          <div className="min-w-0 flex-1 space-y-2">
            {paintsOf(design).map((p) => (
              <div key={p.where} className="flex items-center gap-2">
                <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={26} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{pick(p)}</p>
                  <p className="truncate text-[12px] text-ink-500">{p.where === 'all' ? t('all_nails') : t('finger_' + p.where)} · {t('finish_' + p.finish)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-ok/10 p-5 text-center">
            <CheckCircle2 className="text-ok" size={34} />
            <p className="font-display text-[24px] font-semibold">{done.kind === 'staff' ? t('look_saved') : t('request_sent')}</p>
            <p className="text-[14px] text-ink-500">{done.kind === 'staff' ? t('look_saved_text') : t('request_sent_text')}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <Field label={isStaff ? t('customer_name') : t('your_name')}>
              <input className="field" value={form.customerName} onChange={set('customerName')} autoComplete="name" maxLength={60} />
            </Field>
            <Field label={isStaff ? t('customer_phone') : t('your_phone')} hint={t('phone_hint')}>
              <input className="field" value={form.customerPhone} onChange={set('customerPhone')} inputMode="tel" autoComplete="tel" maxLength={20} dir="ltr" />
            </Field>
            {!isStaff && (
              <Field label={t('preferred_time')}>
                <input className="field" value={form.preferredDate} onChange={set('preferredDate')} placeholder={t('preferred_time_ph')} maxLength={40} />
              </Field>
            )}
            <Field label={t('note')}>
              <textarea className="field min-h-[80px]" value={form.note} onChange={set('note')} maxLength={300} />
            </Field>
            <div className="rounded-2xl border border-ink/10 bg-white px-4 py-1">
              <Toggle checked={withPhoto} onChange={setWithPhoto} label={isStaff ? t('attach_photo_staff') : t('attach_photo')} />
              <p className="pb-2 text-[12px] text-ink-400">{t('attach_photo_hint')}</p>
            </div>
            <button className="btn-primary w-full" disabled={busy || !thumb || (!isStaff && !form.customerName.trim() && !form.customerPhone.trim())} onClick={submit}>
              {busy ? <Spinner size={18} /> : <Send size={18} />}
              {isStaff ? t('save_to_salon') : t('send_to_salon')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost text-[14px]" onClick={openWhatsApp} disabled={isStaff && !form.customerPhone}>
            <MessageCircle size={18} />
            {t('whatsapp')}
          </button>
          <button className="btn-ghost text-[14px]" onClick={share} disabled={!shot}>
            <Share2 size={18} />
            {t('share')}
          </button>
          <button className="btn-ghost text-[14px]" onClick={download} disabled={!shot}>
            <Download size={18} />
            {t('download')}
          </button>
          <button className="btn-ghost text-[14px]" onClick={pdf} disabled={!shot || busy}>
            <FileText size={18} />
            PDF
          </button>
          <button className="btn-ghost col-span-2 text-[14px]" onClick={copy}>
            <Copy size={18} />
            {t('copy_details')}
          </button>
        </div>
        {!isStaff && !salon.whatsapp && <p className="text-[12px] text-ink-400">{t('no_salon_whatsapp')}</p>}
      </div>
    </Sheet>
  )
}
