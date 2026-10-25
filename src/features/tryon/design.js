// The "design" = everything that describes a manicure look. Serializable (saved in looks / requests / PDFs).
import { FINGERS } from '../../data/taxonomy'

export const DEFAULT_DESIGN = {
  base: { polishId: 'lib-R01', hex: '#B5121B', hex2: null, finish: 'creme', name: 'Classic Red', nameAr: 'أحمر كلاسيكي', brand: '', code: 'R01' },
  perFinger: {}, // { ring: { polishId, hex, hex2, finish, name, nameAr } }
  shape: 'natural',
  length: 0,
  art: 'none',
  artHex: '#FBFBFA',
  type: 'gel',
}

export function polishToPaint(p) {
  return {
    polishId: p.id,
    hex: p.hex,
    hex2: p.hex2 || null,
    finish: p.finish || 'creme',
    name: p.name || '',
    nameAr: p.nameAr || '',
    brand: p.brand || '',
    code: p.code || '',
    price: typeof p.price === 'number' ? p.price : null,
  }
}

export function withBase(design, polish) {
  return { ...design, base: polishToPaint(polish), type: polish.type && polish.type !== design.type ? polish.type : design.type }
}

export function withFinger(design, finger, polish) {
  const perFinger = { ...design.perFinger }
  if (!polish) delete perFinger[finger]
  else perFinger[finger] = polishToPaint(polish)
  return { ...design, perFinger }
}

export function withFinish(design, finish, finger = null) {
  if (finger && design.perFinger[finger]) {
    return { ...design, perFinger: { ...design.perFinger, [finger]: { ...design.perFinger[finger], finish } } }
  }
  return { ...design, base: { ...design.base, finish } }
}

/** All distinct paints used by a design (base + accents) — for summaries, PDFs, WhatsApp text. */
export function paintsOf(design) {
  const list = [{ where: 'all', ...design.base }]
  for (const f of FINGERS) {
    const p = design.perFinger?.[f.key]
    if (p) list.push({ where: f.key, ...p })
  }
  return list
}

export function designSummary(design, t, pick) {
  const paints = paintsOf(design)
  const lines = paints.map((p) => {
    const name = pick ? pick(p) : p.name
    const where = p.where === 'all' ? t('all_nails') : t('finger_' + p.where)
    return `• ${where}: ${p.brand ? p.brand + ' ' : ''}${name}${p.code ? ' (' + p.code + ')' : ''} — ${t('finish_' + p.finish)}`
  })
  lines.push(`• ${t('shape')}: ${t('shape_' + design.shape)}`)
  if (design.art && design.art !== 'none') lines.push(`• ${t('art')}: ${t('art_' + design.art)}`)
  return lines.join('\n')
}

/** Strip to a compact, safe object for Firestore */
export function serializeDesign(design) {
  const clean = (p) =>
    p && {
      polishId: p.polishId || null,
      hex: p.hex,
      hex2: p.hex2 || null,
      finish: p.finish,
      name: p.name || '',
      nameAr: p.nameAr || '',
      brand: p.brand || '',
      code: p.code || '',
    }
  const perFinger = {}
  for (const k of Object.keys(design.perFinger || {})) perFinger[k] = clean(design.perFinger[k])
  return {
    base: clean(design.base),
    perFinger,
    shape: design.shape,
    length: design.length,
    art: design.art,
    artHex: design.artHex,
    type: design.type,
  }
}
