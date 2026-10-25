// CSV import / export for the polish inventory (replace an old Excel sheet in one step).
import Papa from 'papaparse'
import { normalizeHex } from './color'
import { FAMILIES, FINISHES, PRODUCT_TYPES } from '../data/taxonomy'

export const POLISH_COLUMNS = ['brand', 'line', 'name', 'nameAr', 'code', 'hex', 'hex2', 'family', 'finish', 'type', 'price', 'stock', 'barcode', 'active', 'notes']

const FAMILY_KEYS = new Set(FAMILIES.map((f) => f.key))
const FINISH_KEYS = new Set(FINISHES.map((f) => f.key))
const TYPE_KEYS = new Set(PRODUCT_TYPES.map((p) => p.key))

// Accept common header spellings from old sheets (EN / AR)
const HEADER_ALIASES = {
  brand: ['brand', 'العلامة', 'الماركة', 'company'],
  line: ['line', 'collection', 'series', 'الخط', 'المجموعة'],
  name: ['name', 'shade', 'color name', 'colour name', 'اسم', 'الاسم', 'اسم اللون'],
  nameAr: ['namear', 'name_ar', 'arabic name', 'الاسم بالعربي', 'الاسم العربي'],
  code: ['code', 'sku', 'number', 'no', 'shade code', 'الكود', 'الرقم', 'رقم'],
  hex: ['hex', 'color', 'colour', 'hex code', 'اللون'],
  hex2: ['hex2', 'second color', 'effect color', 'اللون الثاني'],
  family: ['family', 'category', 'group', 'العائلة', 'الفئة'],
  finish: ['finish', 'effect', 'texture', 'التشطيب', 'اللمسة'],
  type: ['type', 'product', 'product type', 'النوع'],
  price: ['price', 'omr', 'السعر'],
  stock: ['stock', 'qty', 'quantity', 'الكمية', 'المخزون'],
  barcode: ['barcode', 'ean', 'upc', 'الباركود'],
  active: ['active', 'enabled', 'show', 'نشط'],
  notes: ['notes', 'note', 'ملاحظات'],
}

function mapHeader(h) {
  const k = String(h || '').trim().toLowerCase()
  for (const [field, list] of Object.entries(HEADER_ALIASES)) if (list.includes(k)) return field
  return null
}

/**
 * Parse + validate. Returns { rows, errors: [{line, field, msg}], skipped }
 * Hard validation: name + valid hex required; numbers must be ≥ 0; unknown family/finish/type fall back safely.
 */
export function parsePolishCsv(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => mapHeader(h) || '__' + h })
  const rows = []
  const errors = []
  const seen = new Set()
  res.data.forEach((r, i) => {
    const line = i + 2
    const name = String(r.name || '').trim()
    const hex = normalizeHex(String(r.hex || ''))
    if (!name && !hex) return
    if (!name) errors.push({ line, field: 'name', msg: 'required' })
    if (!hex) errors.push({ line, field: 'hex', msg: 'invalid_hex' })
    if (!name || !hex) return
    const price = r.price === undefined || r.price === '' ? 0 : Number(String(r.price).replace(/[^0-9.]/g, ''))
    const stock = r.stock === undefined || r.stock === '' ? 0 : parseInt(String(r.stock).replace(/[^0-9-]/g, ''), 10)
    if (!Number.isFinite(price) || price < 0) errors.push({ line, field: 'price', msg: 'invalid_number' })
    if (!Number.isFinite(stock) || stock < 0) errors.push({ line, field: 'stock', msg: 'invalid_number' })
    const code = String(r.code || '').trim()
    const brand = String(r.brand || '').trim()
    const dupKey = (brand + '|' + code).toLowerCase()
    if (code && seen.has(dupKey)) {
      errors.push({ line, field: 'code', msg: 'duplicate' })
      return
    }
    if (code) seen.add(dupKey)
    const family = String(r.family || '').trim().toLowerCase()
    const finish = String(r.finish || '').trim().toLowerCase()
    const type = String(r.type || '').trim().toLowerCase()
    const active = r.active === undefined || r.active === '' ? true : !/^(0|false|no|لا)$/i.test(String(r.active).trim())
    rows.push({
      brand,
      line: String(r.line || '').trim(),
      name,
      nameAr: String(r.nameAr || '').trim(),
      code,
      hex,
      hex2: normalizeHex(String(r.hex2 || '')) || '',
      family: FAMILY_KEYS.has(family) ? family : guessFamily(hex),
      finish: FINISH_KEYS.has(finish) ? finish : 'creme',
      type: TYPE_KEYS.has(type) ? type : 'gel',
      price: Number.isFinite(price) && price >= 0 ? Math.round(price * 1000) / 1000 : 0,
      stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
      barcode: String(r.barcode || '').trim(),
      active,
      notes: String(r.notes || '').trim(),
      tags: [],
    })
  })
  return { rows, errors, total: res.data.length }
}

export function polishesToCsv(polishes) {
  const data = polishes.map((p) => {
    const o = {}
    for (const c of POLISH_COLUMNS) o[c] = p[c] ?? ''
    return o
  })
  return Papa.unparse({ fields: POLISH_COLUMNS, data })
}

export function templateCsv() {
  return Papa.unparse({
    fields: POLISH_COLUMNS,
    data: [
      { brand: 'OPI', line: 'GelColor', name: 'Big Apple Red', nameAr: 'أحمر التفاحة', code: 'GCN25', hex: '#B5121B', hex2: '', family: 'reds', finish: 'creme', type: 'gel', price: 8, stock: 3, barcode: '', active: 'true', notes: '' },
    ],
  })
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  // BOM so Excel opens Arabic correctly
  const blob = new Blob(['﻿' + text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Best-effort family guess from hex (used when an imported row has no family). */
export function guessFamily(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
  let h = 0
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min) + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / (max - min) + 2) * 60
    else h = ((r - g) / (max - min) + 4) * 60
  }
  if (l < 0.12) return 'blacks'
  if (l > 0.92 && s < 0.3) return 'whites'
  if (s < 0.12) return 'greys'
  if (l > 0.8) return 'pastels'
  if ((h < 40 || h > 340) && s < 0.45 && l > 0.45) return 'nudes'
  if (h >= 20 && h < 45 && l < 0.45) return 'browns'
  if (h < 12 || h >= 345) return l < 0.32 ? 'berries' : 'reds'
  if (h < 25) return 'corals'
  if (h < 45) return 'oranges'
  if (h < 70) return 'yellows'
  if (h < 170) return 'greens'
  if (h < 255) return 'blues'
  if (h < 300) return 'purples'
  return 'pinks'
}
