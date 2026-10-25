// Add / edit one polish: live swatch preview, hard validation (name, hex, unique brand + code, numbers ≥ 0),
// near-duplicate color hint, and "pick color from bottle photo" (robust patch sampling in CIELAB with an
// optional white-card light correction). Every write goes through useData().actions.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, Sparkles, Trash2, X, RefreshCw, SunMedium, Info, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Sheet, Field, Toggle, Confirm, Spinner, useToast } from '../components/ui'
import { NailSwatch } from '../components/NailSwatch'
import { AuditLine } from './common'
import { FAMILIES, FAMILY_BY_KEY, FINISHES, FINISH_BY_KEY, PRODUCT_TYPES, TYPE_BY_KEY } from '../data/taxonomy'
import { normalizeHex, hexToLab, rgb8ToLab, rgbToHex, deltaE2000, median, percentile, lin8, linearToSrgb, labToLch } from '../lib/color'
import { guessFamily } from '../lib/csv'
import { money } from '../lib/format'

const TWO_TONE = new Set(['cateye', 'velvet', 'duochrome'])
const DEFAULT_HEX = '#D2A98C'
const SIMILAR_DE = 2.5 // ΔE2000 below this = "looks like a shade you already have"
const BRAND_KEY = 'nm_inv_last_brand' // per-device convenience only

function lastBrand() {
  try {
    return window.localStorage.getItem(BRAND_KEY) || ''
  } catch {
    return ''
  }
}
function rememberBrand(b) {
  try {
    if (b) window.localStorage.setItem(BRAND_KEY, b)
  } catch {
    /* storage blocked */
  }
}

function initialForm(p) {
  if (!p) {
    return { brand: lastBrand(), line: '', name: '', nameAr: '', code: '', hex: DEFAULT_HEX, hex2: '', family: guessFamily(DEFAULT_HEX), finish: 'creme', type: 'gel', price: '', stock: '1', barcode: '', active: true, notes: '' }
  }
  const hex = normalizeHex(p.hex)
  return {
    brand: p.brand || '',
    line: p.line || '',
    name: p.name || '',
    nameAr: p.nameAr || '',
    code: p.code || '',
    hex: hex || p.hex || '',
    hex2: normalizeHex(p.hex2) || '',
    family: FAMILY_BY_KEY[p.family] ? p.family : hex ? guessFamily(hex) : 'nudes',
    finish: FINISH_BY_KEY[p.finish] ? p.finish : 'creme',
    type: TYPE_BY_KEY[p.type] ? p.type : 'gel',
    price: p.price === undefined || p.price === null || p.price === '' ? '' : String(p.price),
    stock: String(typeof p.stock === 'number' ? p.stock : 0),
    barcode: p.barcode || '',
    active: p.active !== false,
    notes: p.notes || '',
  }
}

const numOr0 = (s) => (String(s).trim() === '' ? 0 : Number(s))

/** Firestore resolves a write only after the server acknowledges it. Offline the write is already safe in the
 *  local queue (and visible at once), so don't leave the salon staring at a spinner. */
function settle(promise) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return promise
  promise.catch(() => {})
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('queued'), 1200))])
}

export default function PolishForm({ open, polish, onClose }) {
  const { t, pick, lang } = useI18n()
  const { staff, actions } = useData()
  const toast = useToast()
  const formId = useId()
  const brandListId = useId()
  const formRef = useRef(null)
  const [initial] = useState(() => initialForm(polish))
  const [form, setForm] = useState(initial)
  const [bad, setBad] = useState({ price: false, stock: false }) // browser-level "not a number" input
  const [touched, setTouched] = useState({})
  const [tried, setTried] = useState(false)
  const [familyAuto, setFamilyAuto] = useState(!polish)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const isEdit = !!polish
  const twoTone = TWO_TONE.has(form.finish)
  const hex = normalizeHex(form.hex)
  const hex2 = twoTone ? normalizeHex(form.hex2) : null
  const currency = staff.salon?.currency || 'OMR'

  const others = useMemo(() => staff.polishes.filter((o) => o.id !== polish?.id), [staff.polishes, polish])
  const brands = useMemo(() => [...new Set(staff.polishes.map((o) => String(o.brand || '').trim()).filter(Boolean))].sort(), [staff.polishes])
  const labs = useMemo(() => others.filter((o) => normalizeHex(o.hex)).map((o) => ({ o, lab: hexToLab(o.hex) })), [others])

  const set = (k, v) =>
    setForm((f) => {
      const next = { ...f, [k]: v }
      if (k === 'hex' && familyAuto) {
        const h = normalizeHex(v)
        if (h) next.family = guessFamily(h)
      }
      return next
    })
  const touch = (k) => setTouched((s) => (s[k] ? s : { ...s, [k]: true }))

  // ---------------------------------------------------------------- validation
  const errors = useMemo(() => {
    const e = {}
    if (!form.name.trim()) e.name = t('inv_err_name')
    if (!hex) e.hex = t('inv_err_hex')
    if (twoTone && form.hex2.trim() && !normalizeHex(form.hex2)) e.hex2 = t('inv_err_hex')
    const code = form.code.trim().toLowerCase()
    const brand = form.brand.trim().toLowerCase()
    if (code && others.some((o) => String(o.code || '').trim().toLowerCase() === code && String(o.brand || '').trim().toLowerCase() === brand)) {
      e.code = t('inv_err_dup', { label: [form.brand.trim(), form.code.trim()].filter(Boolean).join(' ') })
    }
    const price = numOr0(form.price)
    if (bad.price || !Number.isFinite(price) || price < 0) e.price = t('inv_err_price')
    const stock = numOr0(form.stock)
    if (bad.stock || !Number.isInteger(stock) || stock < 0) e.stock = t('inv_err_stock')
    return e
  }, [form, hex, twoTone, others, bad, t])

  const err = (k) => {
    const visible = tried || touched[k] || (k === 'code' && touched.brand)
    return visible ? errors[k] : undefined
  }

  const similar = useMemo(() => {
    if (!hex || (isEdit && hex === normalizeHex(initial.hex))) return null
    const lab = hexToLab(hex)
    let best = null
    for (const x of labs) {
      const d = deltaE2000(lab, x.lab)
      if (!best || d < best.d) best = { d, o: x.o }
    }
    return best && best.d < SIMILAR_DE ? best : null
  }, [hex, labs, isEdit, initial.hex])

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])

  // ---------------------------------------------------------------- actions
  const requestClose = () => {
    if (busy) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = async (e) => {
    e?.preventDefault()
    if (busy) return
    setTried(true)
    if (Object.keys(errors).length) {
      toast(t('inv_fix_errors'), 'error')
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector('[aria-invalid="true"]')
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          el.focus({ preventScroll: true })
        }
      })
      return
    }
    const data = {
      brand: form.brand.trim(),
      line: form.line.trim(),
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      code: form.code.trim(),
      hex,
      hex2: hex2 || '',
      family: form.family,
      finish: form.finish,
      type: form.type,
      price: Math.round(numOr0(form.price) * 1000) / 1000,
      stock: numOr0(form.stock),
      barcode: form.barcode.trim(),
      active: form.active,
      notes: form.notes.trim(),
    }
    if (!isEdit) data.tags = []
    // Stock is a live counter (other devices tap −/+): only overwrite it when it was edited here.
    if (isEdit && form.stock === initial.stock) delete data.stock
    setBusy(true)
    try {
      const res = await settle(actions.savePolish(data, polish?.id))
      rememberBrand(data.brand)
      if (res === 'queued') toast(t('inv_saved_offline'), 'info', 3500)
      else toast(isEdit ? t('inv_saved') : t('inv_added'))
      onClose()
    } catch (x) {
      console.warn('[savePolish]', x)
      toast(t('inv_err_generic'), 'error', 4000)
      setBusy(false)
    }
  }

  const doDelete = async () => {
    try {
      const label = [polish.brand, polish.name, polish.code].filter(Boolean).join(' ')
      await settle(actions.deletePolish(polish.id, label))
      toast(t('inv_deleted'))
      onClose()
    } catch (x) {
      console.warn('[deletePolish]', x)
      toast(t('inv_err_generic'), 'error', 4000)
    }
  }

  const applyColor = (h) => {
    set('hex', h)
    touch('hex')
    toast(t('inv_pick_applied'), 'ok', 1400)
  }
  const applyColor2 = (h) => {
    set('hex2', h)
    touch('hex2')
    toast(t('inv_pick_applied'), 'ok', 1400)
  }

  const previewName = pick({ name: form.name.trim(), nameAr: form.nameAr.trim() })
  const meta = [form.brand.trim(), form.line.trim(), form.code.trim()].filter(Boolean).join(' · ')
  const priceOk = form.price.trim() !== '' && !errors.price

  return (
    <>
      <Sheet
        open={open}
        onClose={requestClose}
        title={isEdit ? t('inv_form_edit') : t('inv_form_new')}
        footer={
          <div className="flex gap-2">
            {isEdit && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className="icon-btn shrink-0 border border-bad/25 text-bad disabled:opacity-40" aria-label={t('delete')}>
                <Trash2 size={20} />
              </button>
            )}
            <button type="button" className="btn-ghost flex-1 px-4" onClick={requestClose} disabled={busy}>
              {t('cancel')}
            </button>
            <button type="submit" form={formId} className="btn-primary flex-[2] px-4" disabled={busy}>
              {busy ? <Spinner size={18} /> : <Check size={18} />}
              {t('save')}
            </button>
          </div>
        }
      >
        <form id={formId} ref={formRef} onSubmit={save} noValidate className="flex flex-col gap-4">
          {/* live preview */}
          <div className="card flex items-center gap-4 p-4">
            <NailSwatch hex={hex || '#CCCCCC'} hex2={hex2} finish={form.finish} size={56} />
            <div className="min-w-0 flex-1">
              {meta && (
                <p className="truncate text-[12px] font-semibold text-ink-500" dir="auto">
                  {meta}
                </p>
              )}
              <p className={`truncate font-display text-[26px] font-semibold leading-tight ${previewName ? '' : 'text-ink-300'}`}>{previewName || t('inv_preview_unnamed')}</p>
              <p className="truncate text-[12px] text-ink-500">
                {t('finish_' + form.finish)} · {pick(TYPE_BY_KEY[form.type])}
                {priceOk ? ' · ' + money(numOr0(form.price), lang, currency) : ''}
              </p>
            </div>
          </div>
          {isEdit && (
            <Link to={`/try?shade=${encodeURIComponent(polish.id)}`} className="btn-ghost min-h-[44px] self-start px-4 text-[14px]">
              <Sparkles size={16} />
              {t('inv_try_studio')}
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('inv_brand')}>
              <input className="field" value={form.brand} onChange={(e) => set('brand', e.target.value)} onBlur={() => touch('brand')} placeholder={t('inv_brand_ph')} list={brandListId} autoComplete="off" dir="auto" maxLength={60} />
              <datalist id={brandListId}>
                {brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label={t('inv_line')}>
              <input className="field" value={form.line} onChange={(e) => set('line', e.target.value)} placeholder={t('inv_line_ph')} autoComplete="off" dir="auto" maxLength={60} />
            </Field>
          </div>

          <Field label={t('inv_name')} error={err('name')}>
            <input className="field" value={form.name} onChange={(e) => set('name', e.target.value)} onBlur={() => touch('name')} placeholder={t('inv_name_ph')} aria-invalid={!!err('name')} autoComplete="off" dir="auto" maxLength={80} />
          </Field>
          <Field label={t('inv_name_ar')}>
            <input className="field" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} placeholder={t('inv_name_ar_ph')} autoComplete="off" dir="rtl" lang="ar" maxLength={80} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('inv_code')} error={err('code')}>
              <input className="field" value={form.code} onChange={(e) => set('code', e.target.value)} onBlur={() => touch('code')} aria-invalid={!!err('code')} autoComplete="off" autoCapitalize="characters" spellCheck={false} dir="ltr" maxLength={40} />
            </Field>
            <Field label={t('inv_barcode')}>
              <input className="field" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} autoComplete="off" spellCheck={false} dir="ltr" maxLength={40} />
            </Field>
          </div>

          {/* color */}
          <section className="flex flex-col gap-3 rounded-3xl border border-ink/10 bg-white/60 p-4">
            <HexInput label={t('inv_hex')} pickLabel={t('inv_hex_pick')} value={form.hex} onChange={(v) => set('hex', v)} onBlur={() => touch('hex')} error={err('hex')} />
            {similar && (
              <p className="flex items-start gap-2 rounded-2xl bg-glaze-50 px-3 py-2 text-[12px] font-semibold text-glaze-700">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>
                  {t('inv_similar', {
                    name: [similar.o.brand, pick(similar.o), similar.o.code].filter(Boolean).join(' '),
                    finish: t('finish_' + (similar.o.finish || 'creme')),
                    n: similar.d.toFixed(1),
                  })}
                </span>
              </p>
            )}
            <BottlePicker current={hex} finish={form.finish} allowSecond={twoTone} onUse={applyColor} onUseSecond={applyColor2} />
            {twoTone && (
              <HexInput
                label={t('inv_hex2')}
                hint={t('inv_hex2_hint')}
                pickLabel={t('inv_hex_pick')}
                value={form.hex2}
                fallback={hex || '#FFFFFF'}
                onChange={(v) => set('hex2', v)}
                onBlur={() => touch('hex2')}
                error={err('hex2')}
              />
            )}
          </section>

          <Field label={t('inv_family')} hint={familyAuto ? t('inv_family_auto') : undefined}>
            <span className="relative block">
              <span aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-black/10" style={{ background: FAMILY_BY_KEY[form.family]?.dot }} />
              <select
                className="field ps-11"
                value={form.family}
                onChange={(e) => {
                  setFamilyAuto(false)
                  set('family', e.target.value)
                }}
              >
                {FAMILIES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {pick(f)}
                  </option>
                ))}
              </select>
            </span>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('finish')}>
              <select className="field" value={form.finish} onChange={(e) => set('finish', e.target.value)}>
                {FINISHES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {t('finish_' + f.key)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('product_type')}>
              <select className="field" value={form.type} onChange={(e) => set('type', e.target.value)}>
                {PRODUCT_TYPES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {pick(p)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('inv_price')} hint={t('inv_price_hint')} error={err('price')}>
              <input
                className="field"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                dir="ltr"
                placeholder="0.000"
                value={form.price}
                onChange={(e) => {
                  const badInput = !!e.target.validity?.badInput
                  setBad((b) => (b.price === badInput ? b : { ...b, price: badInput }))
                  set('price', e.target.value)
                }}
                onBlur={() => touch('price')}
                onWheel={(e) => e.currentTarget.blur()}
                aria-invalid={!!err('price')}
              />
            </Field>
            <Field label={t('stock')} error={err('stock')}>
              <input
                className="field"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                step="1"
                min="0"
                dir="ltr"
                placeholder="0"
                value={form.stock}
                onChange={(e) => {
                  const badInput = !!e.target.validity?.badInput
                  setBad((b) => (b.stock === badInput ? b : { ...b, stock: badInput }))
                  set('stock', e.target.value)
                }}
                onBlur={() => touch('stock')}
                onWheel={(e) => e.currentTarget.blur()}
                aria-invalid={!!err('stock')}
              />
            </Field>
          </div>

          <div>
            <div className="rounded-2xl border border-ink/10 bg-white px-4">
              <Toggle checked={form.active} onChange={(v) => set('active', v)} label={t('inv_active')} />
            </div>
            <p className="mt-1 text-[12px] text-ink-400">{t('inv_active_hint')}</p>
          </div>

          <Field label={t('inv_notes')}>
            <textarea className="field min-h-[88px] resize-y" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('inv_notes_ph')} dir="auto" maxLength={500} />
          </Field>

          {isEdit && <AuditLine rec={polish} />}
        </form>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={t('inv_delete_title')}
        text={t('inv_delete_text', { name: isEdit ? [polish.brand, pick(polish)].filter(Boolean).join(' ') : '' })}
        confirmLabel={t('delete')}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
      <Confirm open={confirmDiscard} title={t('inv_discard_title')} text={t('inv_discard_text')} confirmLabel={t('inv_discard')} onConfirm={() => onClose()} onClose={() => setConfirmDiscard(false)} />
    </>
  )
}

/** Native color well + hex text, kept in sync (the text is the source of truth; normalized on blur). */
function HexInput({ label, hint, pickLabel, value, onChange, onBlur, error, fallback = '#CCCCCC' }) {
  const valid = normalizeHex(value)
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input
          type="color"
          value={(valid || fallback).toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-[50px] w-16 shrink-0 cursor-pointer rounded-2xl border border-ink/15 bg-white p-1"
          aria-label={pickLabel}
        />
        <input
          className="field font-mono uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const h = normalizeHex(e.target.value)
            if (h && h !== e.target.value) onChange(h)
            onBlur?.()
          }}
          placeholder="#B5121B"
          aria-label={label}
          aria-invalid={!!error}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          maxLength={9}
        />
      </div>
      {hint && !error && <span className="mt-1 block text-[12px] text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-[13px] font-semibold text-bad">{error}</span>}
    </div>
  )
}

// ==================================================================== color from bottle photo
const PATCH_R = 7 // 15 × 15 px around the tap
const MAX_SIDE = 1200
const WHITE_TARGET = 0.86 // linear value of good paper white (≈ sRGB 239)

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('empty_image')))
    img.onerror = reject
    img.src = url
  })
}

/**
 * Robust patch color: 15×15 px → CIELAB, drop the brightest 20 % (specular glare on the glass) and the darkest 20 %
 * (shadow / bottle edge) by L*, then per-channel median of the rest. `gains` = optional white-card correction
 * (per-channel multipliers in linear light). Returns { rgb, hex, spread } — spread = 80th-percentile ΔE2000 of the
 * kept pixels to the result (high = uneven spot).
 */
function samplePatch(ctx, W, H, cx, cy, gains) {
  const x0 = Math.max(0, Math.min(W - 1, cx - PATCH_R))
  const y0 = Math.max(0, Math.min(H - 1, cy - PATCH_R))
  const x1 = Math.max(0, Math.min(W - 1, cx + PATCH_R))
  const y1 = Math.max(0, Math.min(H - 1, cy + PATCH_R))
  const { data } = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  const px = []
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]
    if (gains) {
      r = Math.round(linearToSrgb(lin8(r) * gains[0]))
      g = Math.round(linearToSrgb(lin8(g) * gains[1]))
      b = Math.round(linearToSrgb(lin8(b) * gains[2]))
    }
    px.push({ r, g, b, lab: rgb8ToLab(r, g, b) })
  }
  px.sort((p, q) => p.lab[0] - q.lab[0])
  const cut = Math.floor(px.length * 0.2)
  const kept = px.length - 2 * cut > 0 ? px.slice(cut, px.length - cut) : px
  const rgb = [median(kept.map((p) => p.r)), median(kept.map((p) => p.g)), median(kept.map((p) => p.b))]
  const hex = rgbToHex(rgb[0], rgb[1], rgb[2])
  const ref = hexToLab(hex)
  const spread = percentile(
    kept.map((p) => deltaE2000(ref, p.lab)),
    0.8,
  )
  return { rgb, hex, spread }
}

function deLabel(d) {
  if (d < 1) return 'inv_de_same'
  if (d < 2) return 'inv_de_tiny'
  if (d < 3.5) return 'inv_de_close'
  if (d < 6) return 'inv_de_visible'
  return 'inv_de_diff'
}

function BottlePicker({ current, finish, allowSecond, onUse, onUseSecond }) {
  const { t } = useI18n()
  const toast = useToast()
  const fileRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [photo, setPhoto] = useState(null) // { w, h, id }
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('color') // 'color' | 'white'
  const [tap, setTap] = useState(null) // canvas px of the last color tap
  const [whiteTap, setWhiteTap] = useState(null)
  const [gains, setGains] = useState(null)
  const [sample, setSample] = useState(null)

  // Draw once the canvas exists: photo scaled so its longest side ≤ 1200 px, aspect kept.
  useEffect(() => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!photo || !c || !img) return
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#FFFFFF' // transparent PNG pixels would otherwise read as black
    ctx.fillRect(0, 0, photo.w, photo.h)
    ctx.drawImage(img, 0, 0, photo.w, photo.h)
    URL.revokeObjectURL(img.src)
    imgRef.current = null
  }, [photo])

  useEffect(
    () => () => {
      if (imgRef.current) URL.revokeObjectURL(imgRef.current.src)
    },
    [],
  )

  const choose = () => fileRef.current?.click()

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // same file can be picked again
    if (!file) return
    setLoading(true)
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImage(url)
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      if (imgRef.current) URL.revokeObjectURL(imgRef.current.src)
      imgRef.current = img
      setTap(null)
      setWhiteTap(null)
      setGains(null)
      setSample(null)
      setMode('color')
      setPhoto({ w: Math.max(1, Math.round(img.naturalWidth * scale)), h: Math.max(1, Math.round(img.naturalHeight * scale)), id: Date.now() })
    } catch (x) {
      console.warn('[bottle photo]', x)
      URL.revokeObjectURL(url)
      toast(t('inv_pick_failed'), 'error', 4000)
    } finally {
      setLoading(false)
    }
  }

  const ctxOf = () => canvasRef.current?.getContext('2d', { willReadFrequently: true })

  const onTap = (e) => {
    const c = canvasRef.current
    const ctx = ctxOf()
    if (!c || !ctx) return
    const r = c.getBoundingClientRect()
    if (!r.width || !r.height) return
    const x = Math.round(((e.clientX - r.left) / r.width) * c.width)
    const y = Math.round(((e.clientY - r.top) / r.height) * c.height)
    if (mode === 'white') {
      const w = samplePatch(ctx, c.width, c.height, x, y, null)
      const [L, C] = labToLch(hexToLab(w.hex))
      if (L < 30 || C > 40) {
        toast(t('inv_pick_not_white'), 'warn', 3500)
        return
      }
      // von Kries: scale each channel (linear light) so the card becomes neutral paper white.
      const g = w.rgb.map((v) => Math.min(4, Math.max(0.4, WHITE_TARGET / Math.max(lin8(Math.round(v)), 0.002))))
      setGains(g)
      setWhiteTap({ x, y })
      setMode('color')
      if (tap) setSample(samplePatch(ctx, c.width, c.height, tap.x, tap.y, g))
      toast(t('inv_pick_calibrated'), 'ok', 1600)
      return
    }
    setTap({ x, y })
    setSample(samplePatch(ctx, c.width, c.height, x, y, gains))
  }

  const uncalibrate = () => {
    setGains(null)
    setWhiteTap(null)
    const c = canvasRef.current
    const ctx = ctxOf()
    if (tap && c && ctx) setSample(samplePatch(ctx, c.width, c.height, tap.x, tap.y, null))
  }

  const closePhoto = () => {
    setPhoto(null)
    setTap(null)
    setWhiteTap(null)
    setGains(null)
    setSample(null)
    setMode('color')
  }

  const de = sample && current ? deltaE2000(hexToLab(current), hexToLab(sample.hex)) : null

  return (
    <div className="rounded-2xl bg-porcelain-100 p-3">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} tabIndex={-1} />
      {!photo ? (
        <>
          <button type="button" className="btn-ghost w-full px-4" onClick={choose} disabled={loading}>
            {loading ? <Spinner size={18} /> : <Camera size={18} />}
            {loading ? t('inv_pick_loading') : t('inv_pick_photo')}
          </button>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-500">{t('inv_pick_help')}</p>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={`text-[14px] font-bold ${mode === 'white' ? 'text-glaze-700' : 'text-ink'}`}>{mode === 'white' ? t('inv_pick_tap_white') : t('inv_pick_tap')}</p>
            <button type="button" onClick={closePhoto} className="icon-btn h-11 w-11 shrink-0 bg-ink/5" aria-label={t('inv_pick_close')}>
              <X size={18} />
            </button>
          </div>
          <div className="relative mx-auto overflow-hidden rounded-2xl bg-ink/5" style={{ maxWidth: `min(100%, calc(55vh * ${(photo.w / photo.h).toFixed(4)}))` }}>
            <canvas
              ref={canvasRef}
              width={photo.w}
              height={photo.h}
              onClick={onTap}
              className={`block h-auto w-full ${mode === 'white' ? 'cursor-cell' : 'cursor-crosshair'}`}
              style={{ touchAction: 'manipulation' }}
              role="img"
              aria-label={t('inv_pick_canvas')}
            />
            {whiteTap && <Marker x={whiteTap.x / photo.w} y={whiteTap.y / photo.h} dashed />}
            {tap && <Marker x={tap.x / photo.w} y={tap.y / photo.h} fill={sample?.hex} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {gains ? (
              <button type="button" onClick={uncalibrate} className="chip chip-on min-h-[44px]" aria-label={t('inv_pick_uncalibrate')}>
                <SunMedium size={16} />
                {t('inv_pick_calibrated')}
                <X size={14} />
              </button>
            ) : (
              <button type="button" onClick={() => setMode((m) => (m === 'white' ? 'color' : 'white'))} aria-pressed={mode === 'white'} className={`chip min-h-[44px] ${mode === 'white' ? 'chip-on' : 'chip-off'}`}>
                <SunMedium size={16} />
                {t('inv_pick_calibrate')}
              </button>
            )}
            <button type="button" onClick={choose} className="chip chip-off min-h-[44px]" disabled={loading}>
              {loading ? <Spinner size={16} /> : <RefreshCw size={16} />}
              {t('inv_pick_retake')}
            </button>
          </div>

          {sample ? (
            <div className="mt-3 animate-rise rounded-2xl bg-white p-3 shadow-soft">
              <div className="flex items-center gap-4">
                <ColorChip hex={sample.hex} finish={finish} label={t('inv_pick_new')} />
                {current && <ColorChip hex={current} finish={finish} label={t('inv_pick_current')} />}
                {de !== null && (
                  <div className="min-w-0 flex-1 text-end">
                    <p className="font-display text-[28px] font-semibold leading-none">
                      <bdi>{t('inv_pick_de', { n: de.toFixed(1) })}</bdi>
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-ink-500">{t(deLabel(de))}</p>
                  </div>
                )}
              </div>
              {sample.spread > 6 && (
                <p className="mt-3 flex items-start gap-1.5 text-[12px] font-semibold text-warn">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {t('inv_pick_uneven')}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-mocha flex-1 px-4" onClick={() => onUse(sample.hex)}>
                  <Check size={18} />
                  {t('inv_pick_use')}
                </button>
                {allowSecond && (
                  <button type="button" className="btn-ghost flex-1 px-4" onClick={() => onUseSecond(sample.hex)}>
                    {t('inv_pick_use2')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-500">{t('inv_pick_help')}</p>
          )}
        </>
      )}
    </div>
  )
}

function ColorChip({ hex, finish, label }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <NailSwatch hex={hex} finish={finish} size={36} />
      <span className="text-[11px] font-bold">{label}</span>
      <span className="font-mono text-[11px] text-ink-500" dir="ltr">
        {hex}
      </span>
    </div>
  )
}

function Marker({ x, y, fill, dashed = false }) {
  // Physical left/top on purpose: the photo is never mirrored, so the tap point must not flip in RTL.
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-8 w-8 rounded-full border-[3px] ${dashed ? 'border-dashed border-glaze-500' : 'border-white'}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)', background: fill || 'transparent', boxShadow: '0 0 0 1.5px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35)' }}
    />
  )
}
