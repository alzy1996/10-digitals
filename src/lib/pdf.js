// PDF builder. Pages are painted on a canvas first, so Arabic shaping + RTL render perfectly
// with the same web fonts as the app (jsPDF alone cannot shape Arabic), then exported via jsPDF.
import { jsPDF } from 'jspdf'
import { money, dateTime, dateOnly, TZ } from './format'
import { FINISH_BY_KEY, SHAPE_BY_KEY, DEPTH_BY_KEY, UNDERTONE_BY_KEY, FINGERS, TYPE_BY_KEY, ART } from '../data/taxonomy'
import { paintsOf } from '../features/tryon/design'

const PW = 1240 // A4 @150dpi
const PH = 1754
const M = 80

const FONT_SANS = (lang) => (lang === 'ar' ? '"IBM Plex Sans Arabic", Manrope, sans-serif' : 'Manrope, "IBM Plex Sans Arabic", sans-serif')
const FONT_DISPLAY = (lang) => (lang === 'ar' ? '"Noto Naskh Arabic", "Cormorant Garamond", serif' : '"Cormorant Garamond", "Noto Naskh Arabic", serif')

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

class Painter {
  constructor(lang) {
    this.lang = lang
    this.rtl = lang === 'ar'
    this.pages = []
    this.newPage()
  }

  newPage() {
    const c = document.createElement('canvas')
    c.width = PW
    c.height = PH
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, PW, PH)
    ctx.direction = this.rtl ? 'rtl' : 'ltr'
    this.pages.push(c)
    this.ctx = ctx
    this.y = M
  }

  /** x measured from the reading-start edge */
  X(x) {
    return this.rtl ? PW - x : x
  }

  ensure(h) {
    if (this.y + h > PH - M) this.newPage()
  }

  text(str, x, y, { size = 24, weight = 500, color = '#1D1A18', align = 'start', display = false, maxWidth = PW - 2 * M, lineHeight = 1.35 } = {}) {
    const ctx = this.ctx
    ctx.font = `${weight} ${size}px ${display ? FONT_DISPLAY(this.lang) : FONT_SANS(this.lang)}`
    ctx.fillStyle = color
    ctx.textBaseline = 'top'
    ctx.textAlign = align === 'center' ? 'center' : align === 'end' ? 'end' : 'start'
    const words = String(str ?? '').split(/\s+/)
    const lines = []
    let line = ''
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line)
        line = w
      } else line = test
    }
    if (line) lines.push(line)
    const px = align === 'center' ? PW / 2 : this.X(x)
    lines.forEach((l, i) => ctx.fillText(l, px, y + i * size * lineHeight))
    return lines.length * size * lineHeight
  }

  rect(x, y, w, h, fill, r = 0) {
    const ctx = this.ctx
    const rx = this.rtl ? PW - x - w : x
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(rx, y, w, h, r)
    ctx.fill()
  }

  line(y, color = '#E4D9CC') {
    this.ctx.fillStyle = color
    this.ctx.fillRect(M, y, PW - 2 * M, 2)
  }

  swatch(hex, x, y, r = 18) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(this.X(x + r), y + r, r, 0, Math.PI * 2)
    ctx.fillStyle = hex
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,.12)'
    ctx.stroke()
  }

  image(img, x, y, w, h, radius = 24) {
    const ctx = this.ctx
    const rx = this.rtl ? PW - x - w : x
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(rx, y, w, h, radius)
    ctx.clip()
    // cover-fit
    const s = Math.max(w / img.width, h / img.height)
    const dw = img.width * s
    const dh = img.height * s
    ctx.drawImage(img, rx + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    ctx.restore()
  }

  header(salon, title, pick) {
    this.rect(0, 0, PW, 150, '#F7F3EE')
    this.text(pick(salon) || 'Nail Mirror', M, 44, { size: 44, weight: 700, display: true })
    this.text(title, M, 100, { size: 22, weight: 600, color: '#6B4A3A' })
    this.y = 190
  }

  footer(t, salon) {
    this.pages.forEach((p, i) => {
      const ctx = p.getContext('2d')
      ctx.direction = this.rtl ? 'rtl' : 'ltr'
      ctx.font = `500 18px ${FONT_SANS(this.lang)}`
      ctx.fillStyle = '#8C827B'
      ctx.textAlign = 'center'
      ctx.fillText(`${salon?.phone || ''}  ·  ${t('page')} ${i + 1}/${this.pages.length}  ·  Nail Mirror`, PW / 2, PH - 50)
    })
  }

  toPdf() {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    this.pages.forEach((c, i) => {
      if (i) pdf.addPage()
      pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297)
    })
    return pdf
  }
}

async function fontsReady() {
  try {
    await document.fonts.ready
  } catch {
    /* ignore */
  }
}

/** One-page consultation card for the customer / technician. */
export async function consultationPdf({ salon, record, imageUrl, lang, t, pick }) {
  await fontsReady()
  const P = new Painter(lang)
  P.header(salon || {}, t('consultation_card'), (o) => pick(o))
  const design = record.design
  let y = P.y
  if (imageUrl) {
    const img = await loadImg(imageUrl)
    P.image(img, M, y, 520, 690)
  }
  const col = M + 560
  let cy = y
  cy += P.text(record.customerName || t('guest'), col, cy, { size: 40, weight: 700, display: true, maxWidth: PW - col - M })
  if (record.customerPhone) cy += P.text(record.customerPhone, col, cy + 4, { size: 22, color: '#6B625C' })
  cy += P.text(dateTime(record.createdAt || Date.now(), lang), col, cy + 6, { size: 20, color: '#8C827B' }) + 24

  for (const p of paintsOf(design)) {
    P.swatch(p.hex, col, cy, 22)
    const where = p.where === 'all' ? t('all_nails') : t('finger_' + p.where)
    P.text(`${pick(p)}`, col + 60, cy - 2, { size: 24, weight: 700, maxWidth: PW - col - M - 60 })
    P.text(`${where} · ${pick(FINISH_BY_KEY[p.finish] || {})}${p.brand ? ' · ' + p.brand : ''}${p.code ? ' · ' + p.code : ''}`, col + 60, cy + 30, {
      size: 18,
      color: '#6B625C',
      maxWidth: PW - col - M - 60,
    })
    cy += 78
  }
  cy += 10
  const facts = [
    [t('shape'), pick(SHAPE_BY_KEY[design.shape] || {})],
    [t('length'), t('length_' + lengthKey(design.length))],
    [t('product_type'), pick(TYPE_BY_KEY[design.type] || {})],
  ]
  if (design.art && design.art !== 'none') facts.push([t('art'), pick(ART.find((a) => a.key === design.art) || {})])
  for (const [k, v] of facts) {
    P.text(k, col, cy, { size: 18, color: '#8C827B' })
    P.text(v, col + 200, cy, { size: 20, weight: 700, maxWidth: PW - col - M - 200 })
    cy += 36
  }
  P.y = Math.max(y + 720, cy + 20)

  if (record.analysis && record.analysis.depth) {
    const a = record.analysis
    P.line(P.y)
    P.y += 30
    P.text(t('ai_match'), M, P.y, { size: 30, weight: 700, display: true })
    P.y += 52
    P.swatch(a.hex || '#C69A73', M, P.y, 26)
    P.text(`${pick(DEPTH_BY_KEY[a.depth] || {})} · ${pick(UNDERTONE_BY_KEY[a.undertone] || {})} · ${t('monk_level', { n: a.monk })}`, M + 70, P.y + 10, { size: 22, weight: 600 })
    P.y += 80
  }
  if (record.note) {
    P.text(t('note') + ': ' + record.note, M, P.y, { size: 20, color: '#3A3431' })
    P.y += 60
  }
  P.footer(t, salon)
  return P.toPdf()
}

function lengthKey(v) {
  if (v < 0.09) return 'natural'
  if (v < 0.3) return 'short'
  if (v < 0.6) return 'medium'
  if (v < 0.9) return 'long'
  return 'xl'
}

/** Daily management report (Oman time). */
export async function dailyReportPdf({ salon, dayKey, requests, looks, polishes, auditCount, lang, t, pick }) {
  await fontsReady()
  const P = new Painter(lang)
  P.header(salon || {}, `${t('daily_report')} · ${dayKey} (${TZ})`, (o) => pick(o))

  const booked = requests.filter((r) => r.status === 'booked').length + looks.filter((l) => l.status === 'booked').length
  const kpis = [
    [t('kpi_requests'), requests.length],
    [t('kpi_looks'), looks.length],
    [t('kpi_booked'), booked],
    [t('kpi_low_stock'), polishes.filter((p) => typeof p.stock === 'number' && p.stock <= 2 && p.active !== false).length],
  ]
  const bw = (PW - 2 * M - 3 * 24) / 4
  kpis.forEach(([k, v], i) => {
    const x = M + i * (bw + 24)
    P.rect(x, P.y, bw, 150, '#F7F3EE', 24)
    P.text(String(v), x + 28, P.y + 26, { size: 56, weight: 700, display: true, maxWidth: bw - 40 })
    P.text(k, x + 28, P.y + 100, { size: 18, color: '#6B625C', maxWidth: bw - 40 })
  })
  P.y += 190

  // top shades of the day
  const count = new Map()
  for (const r of [...requests, ...looks]) {
    for (const p of paintsOf(r.design || { base: {}, perFinger: {} })) {
      if (!p.hex) continue
      const k = (p.polishId || p.hex) + '|' + p.finish
      const e = count.get(k) || { n: 0, p }
      e.n++
      count.set(k, e)
    }
  }
  const top = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8)
  P.text(t('top_shades'), M, P.y, { size: 30, weight: 700, display: true })
  P.y += 56
  if (!top.length) {
    P.text(t('no_data_day'), M, P.y, { size: 20, color: '#8C827B' })
    P.y += 40
  }
  for (const { n, p } of top) {
    P.ensure(60)
    P.swatch(p.hex, M, P.y, 18)
    P.text(`${pick(p)} · ${pick(FINISH_BY_KEY[p.finish] || {})}`, M + 56, P.y + 4, { size: 20, weight: 600, maxWidth: 800 })
    P.text('× ' + n, PW - M - 120, P.y + 4, { size: 20, weight: 700, maxWidth: 120 })
    P.y += 52
  }
  P.y += 20

  // requests table
  P.ensure(120)
  P.text(t('customer_requests'), M, P.y, { size: 30, weight: 700, display: true })
  P.y += 56
  if (!requests.length) {
    P.text(t('no_data_day'), M, P.y, { size: 20, color: '#8C827B' })
    P.y += 40
  }
  for (const r of requests) {
    P.ensure(70)
    P.swatch(r.design?.base?.hex || '#ccc', M, P.y, 16)
    P.text(`${r.customerName || t('guest')} · ${r.customerPhone || ''}`, M + 50, P.y, { size: 20, weight: 700, maxWidth: 640 })
    P.text(`${pick(r.design?.base || {})} · ${t('status_' + (r.status || 'new'))} · ${dateTime(r.createdAt, lang)}`, M + 50, P.y + 30, { size: 17, color: '#6B625C', maxWidth: 900 })
    P.y += 70
  }
  P.y += 20

  // low stock
  const low = polishes.filter((p) => typeof p.stock === 'number' && p.stock <= 2 && p.active !== false).slice(0, 40)
  P.ensure(120)
  P.text(t('low_stock_list'), M, P.y, { size: 30, weight: 700, display: true })
  P.y += 56
  if (!low.length) {
    P.text(t('all_good'), M, P.y, { size: 20, color: '#8C827B' })
    P.y += 40
  }
  for (const p of low) {
    P.ensure(48)
    P.swatch(p.hex, M, P.y, 14)
    P.text(`${p.brand || ''} ${pick(p)} ${p.code ? '(' + p.code + ')' : ''}`, M + 44, P.y, { size: 19, maxWidth: 800 })
    P.text(`${t('stock')}: ${p.stock}`, PW - M - 160, P.y, { size: 19, weight: 700, color: p.stock <= 0 ? '#B42318' : '#B7791F', maxWidth: 160 })
    P.y += 44
  }
  P.y += 30
  P.ensure(60)
  P.text(`${t('generated')}: ${dateTime(Date.now(), lang)} · ${t('audit_entries')}: ${auditCount}`, M, P.y, { size: 16, color: '#8C827B' })
  P.footer(t, salon)
  return P.toPdf()
}

export { money, dateOnly }
