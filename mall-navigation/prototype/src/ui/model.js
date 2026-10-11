/**
 * UI helpers over the VenueIndex: display names, colours, icons, opening hours, level labels.
 * Pure JS (no React, no DOM) so screens stay small and the logic is easy to check.
 */
import { CATEGORY_COLORS, PIN_COLORS, amenityGroup } from '../engine/tokens.js'
import { bayCode, labelWithoutLevel, plateBayCode, plateLabel } from '../routing/names.js'
import { t, toArabicDigits } from '../i18n/strings.js'
import { hoursText, shopIntervals, venueDate } from './hours.js'

/** Icon per occupant category (src/ui/icons.jsx names). */
const CATEGORY_ICONS = {
  fashion: 'fashion',
  food: 'food',
  cafe: 'cafe',
  electronics: 'electronics',
  beauty: 'beauty',
  kids: 'kids',
  grocery: 'grocery',
  entertainment: 'entertainment',
  home: 'home',
  health: 'health',
  services: 'services',
}

/** Icon per amenity category. */
const AMENITY_ICONS = {
  restroom_men: 'man',
  restroom_women: 'woman',
  restroom_accessible: 'accessible',
  restroom_family: 'restroom',
  musalla_men: 'prayer',
  musalla_women: 'prayer',
  wudu_men: 'prayer',
  wudu_women: 'prayer',
  atm: 'atm',
  info_desk: 'info',
  taxi_pickup: 'taxi',
}

/** Home tiles: icon + colour (PLAN.md section 9 map categories). */
export const TILE_STYLE = Object.freeze({
  food: { icon: 'food', color: CATEGORY_COLORS.food },
  restrooms: { icon: 'restroom', color: PIN_COLORS.restroom },
  prayer: { icon: 'prayer', color: PIN_COLORS.prayer },
  pharmacy: { icon: 'pharmacy', color: CATEGORY_COLORS.health },
  kids: { icon: 'kids', color: CATEGORY_COLORS.kids },
  exit: { icon: 'exit', color: PIN_COLORS.exit },
})

/** Pick the language half of a bilingual { en, ar } value. */
export function pick(value, lang) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return (lang === 'ar' ? value.ar : value.en) ?? value.en ?? ''
}

/**
 * Short level code as printed on the lift panel ("B2", "B1", "G", "1"), in both languages: the Arabic codes «أ»
 * (Ground) and «١» (Level 1) are a near-identical pair of strokes side by side in the level picker and the result
 * badges, and «ب١» can read like «با». Render it left-to-right isolated (`<bdi dir="ltr">` / `.ltr-isolate`) inside
 * Arabic text, and give the full name (levelName) to screen readers. Falls back to the level's shortName.
 * @param {object} index
 * @param {string} levelId
 * @param {'en'|'ar'} [_lang] kept for callers; the code is the same in both languages
 */
export function levelButtonLabel(index, levelId, _lang) {
  for (const conn of index.connectorById.values()) {
    if (conn.type !== 'lift') continue
    const stop = conn.stops?.find((s) => s.levelId === levelId)
    if (stop?.buttonLabel) return pick(stop.buttonLabel, 'en')
  }
  return pick(index.levelById.get(levelId)?.shortName, 'en') || levelId
}

export function levelName(index, levelId, lang) {
  return pick(index.levelById.get(levelId)?.name, lang) || levelId
}

export function isParkingLevel(index, levelId) {
  return index.levelById.get(levelId)?.kind === 'parking'
}

/** Relative luminance of a #RRGGBB colour (WCAG). */
function luminance(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** White or near-black text, whichever reads better on a colour (zone blocks use the data's colours). */
export function textOn(hex) {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#0B0F14') ? '#FFFFFF' : '#0B0F14'
}

/**
 * Display info for anything the user can pick: occupant, amenity, anchor (entrance / plate), bay.
 * @returns {{ type: string, id: string, name: {en:string,ar:string}, levelId: string|null, color: string,
 *   icon: string, categoryLabelKey: string|null, hours: {open:string,close:string}|null, category: string|null } | null}
 */
export function entityInfo(index, id) {
  if (!index || !id) return null
  const occ = index.occupantById.get(id)
  if (occ) {
    const unit = index.unitById.get(occ.unitIds?.[0])
    const door = index.nodeById.get(occ.entranceNodeIds?.[0])
    return {
      type: 'occupant',
      id,
      name: occ.name,
      levelId: door?.levelId ?? unit?.levelId ?? null,
      color: CATEGORY_COLORS[occ.category] ?? CATEGORY_COLORS.services,
      icon: CATEGORY_ICONS[occ.category] ?? 'shop',
      categoryLabelKey: `category.${occ.category}`,
      hours: occ.hours ?? null,
      ramadan: occ.ramadan ?? null,
      category: occ.category,
    }
  }
  const am = index.amenityById.get(id)
  if (am) {
    const group = amenityGroup(am.category)
    return {
      type: 'amenity',
      id,
      name: am.name,
      levelId: am.levelId,
      color: PIN_COLORS[group] ?? PIN_COLORS.services,
      icon: AMENITY_ICONS[am.category] ?? 'info',
      categoryLabelKey: group === 'restroom' ? 'category.restrooms' : group === 'prayer' ? 'category.prayer' : group === 'exit' ? 'category.exits' : 'category.services',
      hours: null,
      category: am.category,
    }
  }
  const anchor = index.anchorById.get(id)
  if (anchor) {
    const entrance = anchor.kind === 'entrance'
    const plate = anchor.kind === 'parking_pillar'
    return {
      type: 'anchor',
      id,
      name: plateLabel(index, anchor),
      levelId: anchor.levelId,
      color: entrance ? PIN_COLORS.exit : plate ? PIN_COLORS.parking : PIN_COLORS.connector,
      icon: entrance ? 'exit' : plate ? 'parking' : 'scan',
      categoryLabelKey: entrance ? 'category.exits' : null,
      hours: null,
      category: anchor.kind,
    }
  }
  const conn = index.connectorById.get(id)
  if (conn) {
    // a lift / escalator / stairs serves several levels: no single level
    const icon = conn.type === 'lift' ? 'lift' : conn.type === 'stairs' ? 'stairs' : conn.direction === 'down' ? 'escalator_down' : 'escalator_up'
    return {
      type: 'connector',
      id,
      name: conn.name,
      levelId: null,
      color: PIN_COLORS.connector,
      icon,
      categoryLabelKey: `connector.${conn.type === 'lift' || conn.type === 'stairs' ? conn.type : 'escalator'}`,
      hours: null,
      category: conn.type,
    }
  }
  const bay = index.bayById.get(id)
  if (bay) {
    const code = bayCode(index, bay)
    const zone = index.zoneById.get(bay.zoneId)
    return {
      type: 'bay',
      id,
      name: { en: `Bay ${code.en}`, ar: `الموقف ${code.ar}` },
      code: code.en,
      levelId: bay.levelId,
      color: zone?.color ?? PIN_COLORS.parking,
      icon: 'car',
      categoryLabelKey: 'category.parking',
      hours: null,
      category: 'parking',
    }
  }
  return null
}

/**
 * Bay code exactly as painted on the floor and the pillars ("B1-43"), in both languages. Show it inside a
 * left-to-right isolate (<bdi dir="ltr">): bay codes are never flipped (PLAN.md section 9 RTL rules).
 */
export function paintedBayCode(index, bayId) {
  const bay = index.bayById.get(bayId)
  return bay ? String(bay.code ?? bay.id) : String(bayId)
}

/** Bilingual bay code ({ en: "B1-43", ar: "B1-43" in an LTR isolate, arDigits: «ب١-٤٣» }). */
export function bayCodeOf(index, bayId) {
  const bay = index.bayById.get(bayId)
  return bay ? bayCode(index, bay) : { en: bayId, ar: bayId, arDigits: bayId }
}

/**
 * A plate label without the level it is on, for lists already grouped by level:
 * "Food court · Level 1" -> "Food court"; "Blue · Falcon · B1 · by bay B1-26" -> "Blue · Falcon · by bay B1-26".
 */
export function plateLabelInLevel(index, anchor, lang) {
  if (!anchor) return ''
  if (anchor.kind !== 'parking_pillar') return pick(labelWithoutLevel(index, anchor.label, anchor.levelId), lang)
  // parking plates: "Blue · Falcon · B1 · by bay B1-26" -> drop the level part in the middle; the bay it names
  // is written as painted ("B1-26"), also in Arabic (names.plateLabel)
  const level = index.levelById.get(anchor.levelId)
  const codes = new Set([level?.shortName?.en, level?.shortName?.ar, levelButtonLabel(index, anchor.levelId, 'en'), levelButtonLabel(index, anchor.levelId, 'ar')].filter(Boolean))
  const label = plateLabel(index, anchor)
  const parts = pick(label, lang).split(' · ')
  const kept = parts.filter((p) => !codes.has(p.trim()))
  return kept.length ? kept.join(' · ') : pick(label, lang)
}

/** The bay nearest to a parking plate (the plate is on a pillar beside the car). */
export function nearestBay(index, levelId, point) {
  let best = null
  let bestD = Infinity
  for (const bay of index.bayById.values()) {
    if (bay.levelId !== levelId) continue
    const d = Math.hypot(bay.center[0] - point[0], bay.center[1] - point[1])
    if (d < bestD) {
      bestD = d
      best = bay
    }
  }
  return best
}

/** Bay named on a parking plate label ("... by bay B1-26"), else the nearest bay. */
export function bayForPlate(index, anchorId) {
  const anchor = index.anchorById.get(anchorId)
  if (!anchor) return null
  const painted = plateBayCode(anchor)
  if (painted) {
    for (const bay of index.bayById.values()) if (bay.code === painted && bay.levelId === anchor.levelId) return bay
  }
  return nearestBay(index, anchor.levelId, anchor.point)
}

/**
 * One line for a shop's opening hours now, e.g. "Open until 22:00" / "Closed now · Opens at 20:00". Ramadan / Eid aware
 * (src/ui/hours.js); `previewId` shows the hours of that special (the "Preview Ramadan hours" switch, v0.5).
 * @param {{ hours: { open: string, close: string } | null, ramadan?: { open: string, close: string }[] | null }} shop
 */
export function hoursLine(index, shop, lang, date = new Date(), previewId = null) {
  return hoursText(shopIntervals(index, shop, date, previewId), venueDate(index, date).clock, lang)
}

/** Connectors a route rides, in order: [{ id, type, direction, name }]. */
export function routeConnectors(route) {
  const out = []
  for (const step of route?.steps ?? []) if (step.kind === 'connector' && step.connector) out.push(step.connector)
  return out
}

/** "Via the up escalator" / "Via Lift A" line for the place screen (null for a same-level walk). */
export function viaLine(route, lang) {
  const cs = routeConnectors(route)
  if (!cs.length) return null
  const names = cs.map((c) => {
    if (c.type === 'escalator') return t(c.direction === 'down' ? 'conn.escalatorDown' : 'conn.escalatorUp', lang)
    return pick(c.name, lang)
  })
  return t('place.via', lang, { name: names.join(lang === 'ar' ? '، ' : ', ') })
}

/** Plates (anchors) grouped by level, top floor first (like a lift panel). */
export function platesByLevel(index, { kinds = null } = {}) {
  const levels = [...index.levels].sort((a, b) => b.ordinal - a.ordinal)
  return levels
    .map((level) => ({
      level,
      plates: index.venue.anchors.filter((a) => a.levelId === level.id && (!kinds || kinds.includes(a.kind))),
    }))
    .filter((g) => g.plates.length > 0)
}

/** Zone of a bay and its icon / colours. */
export function zoneOfBay(index, bayId) {
  const bay = index.bayById.get(bayId)
  const zone = bay ? index.zoneById.get(bay.zoneId) : null
  if (!zone) return null
  return { ...zone, fg: textOn(zone.color) }
}

/** Zone of a parking plate (anchor), by the nearest bay. */
export function zoneOfPlate(index, anchorId) {
  const bay = bayForPlate(index, anchorId)
  return bay ? zoneOfBay(index, bay.id) : null
}

/**
 * Compact walking time for list rows: "3 min" / «٣ دقائق» (Arabic number agreement), "< 1 min" under 30 s.
 * @param {number} s seconds
 * @param {'en'|'ar'} lang
 */
export function shortDuration(s, lang) {
  const m = Math.round((Number.isFinite(s) ? s : 0) / 60)
  if (lang === 'ar') {
    if (m < 1) return 'أقل من دقيقة'
    if (m === 1) return 'دقيقة'
    if (m === 2) return 'دقيقتان'
    if (m <= 10) return `${toArabicDigits(m)} دقائق`
    return `${toArabicDigits(m)} دقيقة`
  }
  return m < 1 ? '< 1 min' : `${m} min`
}
