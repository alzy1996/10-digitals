/**
 * Bilingual names for things a route starts at, passes or ends at. Pure JS, no DOM.
 * Arabic strings use Arabic script and Arabic-Indic digits, with one exception: bay codes. A bay code is shown
 * exactly as it is painted on the floor and the pillars ("B2-14"), inside a left-to-right isolate (U+2066 ...
 * U+2069), so it is never flipped and always matches the paint (PLAN.md section 9 RTL rules).
 */
import { toArabicDigits } from '../i18n/strings.js'
import { centroid } from './geometry.js'

/**
 * A label without a trailing level part, for sentences and level-grouped lists:
 * "Food court · Level 1" -> "Food court", "Lift A lobby · Ground" -> "Lift A lobby".
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {{ en: string, ar: string }} label
 * @param {string} levelId
 * @returns {{ en: string, ar: string }}
 */
export function labelWithoutLevel(index, label, levelId) {
  const level = index.levelById.get(levelId)
  if (!label || !level) return label
  const codes = new Set([level.name?.en, level.name?.ar, level.shortName?.en, level.shortName?.ar].filter(Boolean).map((x) => String(x).trim()))
  for (const conn of index.connectorById?.values() ?? []) {
    const stop = (conn.stops ?? []).find((st) => st.levelId === levelId)
    if (stop?.buttonLabel) for (const v of [stop.buttonLabel.en, stop.buttonLabel.ar]) if (v) codes.add(String(v).trim())
  }
  // a word of the level name also names the level ("Ground" for "Ground level", «الأرضي»)
  const words = new Set([level.name?.en, level.name?.ar].filter(Boolean).flatMap((n) => String(n).split(/\s+/)))
  const strip = (str) => {
    const parts = String(str ?? '').split(' · ')
    if (parts.length < 2) return str
    const last = parts[parts.length - 1].trim()
    return codes.has(last) || words.has(last) ? parts.slice(0, -1).join(' · ') : str
  }
  return { en: strip(label.en), ar: strip(label.ar) }
}

/** Left-to-right isolate around a printed code inside Arabic text. */
export const LTR_ISOLATE = (s) => `\u2066${s}\u2069`

/**
 * Bilingual bay code. "B2-14" -> { en: "B2-14", ar: "\u2066B2-14\u2069", arDigits: "ب٢-١٤" }.
 * `ar` is the painted code in an LTR isolate (what the shopper will see next to the car); `arDigits` is the
 * Arabic-digit spelling, kept for search and for places that want both.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {object} bay
 */
export function bayCode(index, bay) {
  const en = String(bay.code ?? bay.id)
  const level = index.levelById.get(bay.levelId)
  const number = (en.match(/(\d+)\s*$/) ?? [null, ''])[1]
  const prefix = level?.shortName?.ar ?? toArabicDigits(String(bay.levelId ?? '').replace(/[A-Za-z]/g, ''))
  const arDigits = number ? `${prefix}-${toArabicDigits(number)}` : prefix
  return { en, ar: LTR_ISOLATE(en), arDigits }
}

/** Painted bay code a parking plate names ("Blue · Falcon · B1 · by bay B1-26" -> "B1-26"), or null. */
export function plateBayCode(anchor) {
  return String(anchor?.label?.en ?? '').match(/bay\s+([A-Z0-9]+-\d+)\s*$/i)?.[1] ?? null
}

/**
 * Label of a QR plate (anchor) as the shopper should read it. Parking plate labels name the bay beside them;
 * the data spells that code with Arabic digits in Arabic («... بجانب الموقف ب١-١٠٢»), but generated text shows
 * bay codes exactly as painted, inside a left-to-right isolate (CONTRACT.md section 2), so the Arabic part
 * becomes «بجانب الموقف ⁦B1-102⁩». Other plates are returned unchanged.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {object} anchor
 * @returns {{ en: string, ar: string } | null}
 */
export function plateLabel(index, anchor) {
  if (!anchor?.label) return anchor?.label ?? null
  if (anchor.kind !== 'parking_pillar') return anchor.label
  const painted = plateBayCode(anchor)
  if (!painted) return anchor.label
  const ar = String(anchor.label.ar ?? '')
    .split(' · ')
    .map((part) => (part.trim().startsWith('بجانب الموقف') ? `بجانب الموقف ${LTR_ISOLATE(painted)}` : part))
    .join(' · ')
  return { en: anchor.label.en, ar }
}

/**
 * @typedef {object} Entity
 * @property {'occupant'|'amenity'|'bay'|'anchor'|'connector'|'landmark'} type
 * @property {string} id
 * @property {{ en: string, ar: string }} name      display name (as in the data)
 * @property {boolean} generic                       English name is a common noun ("the information desk")
 * @property {[number, number] | null} targetPoint   a point inside / behind the place (for "on your left")
 * @property {number | null} bayAngleDeg             bays: heading of a car driving in
 * @property {string} levelId
 */

/**
 * The place a graph node belongs to (door -> occupant, amenity node -> amenity, bay, anchor, connector).
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {object} node
 * @returns {Entity | null}
 */
export function entityForNode(index, node) {
  if (!node) return null
  const ref = node.refId
  if (typeof ref === 'string' && ref) {
    const occ = index.occupantById.get(ref)
    if (occ) return occupantEntity(index, occ, node.levelId)
    const am = index.amenityById.get(ref)
    if (am) {
      return { type: 'amenity', id: am.id, name: am.name, generic: true, targetPoint: am.point ?? null, bayAngleDeg: null, levelId: am.levelId }
    }
    const bay = index.bayById.get(ref)
    if (bay) return bayEntity(index, bay)
    const anchor = index.anchorById.get(ref)
    if (anchor) {
      // Simple labels read as common nouns ("the south entrance", "the food court": a plate label's level
      // suffix is dropped, the step card already says the level). Structured parking plate labels such as
      // "Teal · Fort · B2 · by bay B2-84" are quoted as they are printed, with the bay code as painted.
      const name = anchor.kind === 'parking_pillar' ? plateLabel(index, anchor) : labelWithoutLevel(index, anchor.label, anchor.levelId)
      const generic = !String(name?.en ?? '').includes('·')
      return { type: 'anchor', id: anchor.id, name, generic, targetPoint: anchor.point ?? null, bayAngleDeg: null, levelId: anchor.levelId }
    }
    const conn = index.connectorById.get(ref)
    if (conn) {
      const stop = (conn.stops ?? []).find((s) => s.nodeId === node.id)
      return {
        type: 'connector',
        id: conn.id,
        name: connectorName(conn),
        generic: conn.type === 'escalator',
        targetPoint: conn.shaft ? centroid(conn.shaft) : (stop?.point ?? null),
        bayAngleDeg: null,
        levelId: node.levelId,
      }
    }
  }
  return null
}

export function occupantEntity(index, occ, levelId) {
  const unit = index.unitById.get(occ.unitIds?.[0])
  return {
    type: 'occupant',
    id: occ.id,
    name: occ.name,
    generic: false,
    targetPoint: unit?.polygon ? centroid(unit.polygon) : null,
    bayAngleDeg: null,
    levelId: levelId ?? unit?.levelId ?? null,
  }
}

export function bayEntity(index, bay) {
  const code = bayCode(index, bay)
  return {
    type: 'bay',
    id: bay.id,
    name: { en: `bay ${code.en}`, ar: `الموقف ${code.ar}` },
    generic: false,
    targetPoint: bay.center ?? null,
    bayAngleDeg: Number.isFinite(bay.angleDeg) ? bay.angleDeg : null,
    levelId: bay.levelId,
  }
}

/**
 * Connector name as people say it. Escalators are announced as a pair ("the escalators"), lifts and stairs by
 * their own name ("Lift A" / «المصعد أ»).
 */
export function connectorName(conn) {
  if (conn.type === 'escalator') return { en: 'escalators', ar: 'السلالم المتحركة' }
  return conn.name
}

/**
 * English noun phrase for an entity inside a sentence: proper names as they are, common nouns with "the" and a
 * lower-case first word ("the information desk", "the atrium fountain"). Acronyms (ATM) are kept.
 * @param {{ name: { en: string }, generic: boolean }} entity
 * @param {boolean} [sentenceStart]
 */
export function enPhrase(entity, sentenceStart = false) {
  const raw = entity.name.en
  let phrase = raw
  if (entity.generic) {
    const lowered = /^[A-Z][a-z]/.test(raw) ? raw[0].toLowerCase() + raw.slice(1) : raw
    phrase = `the ${lowered}`
  }
  return sentenceStart ? phrase[0].toUpperCase() + phrase.slice(1) : phrase
}
