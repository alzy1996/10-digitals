/**
 * Offers (v0.5, DESIGN-MALL.md): demo deals and new brands from offers.json. Pull only: shown on the Offers page and
 * a shop's place screen, ordered by walk time from the you-are-here the shopper set (never GPS). Deals on parking
 * levels or outside their dates never show. Pure, except loadOffers (fetch).
 */
import { activeSpecial, specials, venueDate } from '../ui/hours.js'

export const OFFERS_URL = `${import.meta.env?.BASE_URL ?? '/'}venues/demo-muscat/offers.json`

export async function loadOffers(url = OFFERS_URL) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`offers ${res.status}`)
  return res.json()
}

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The demo file's dates are relative (v0.5 review: fixed dates emptied the demo after October): a deal's
 * `fromDays` / `toDays` count from today, `special` takes a special's dates (Ramadan deals), a brand's `openedDaysAgo`
 * becomes `openedOn`. Absolute `from` / `to` / `openedOn` pass through (a real offers feed).
 * @param {object} index VenueIndex (for the specials)
 * @param {{ deals?: object[], newBrands?: object[] }} raw offers.json
 * @param {string} todayYmd the venue's today, "YYYY-MM-DD"
 */
export function resolveOfferDates(index, raw, todayYmd) {
  const deals = []
  for (const d of raw?.deals ?? []) {
    if (d.special) {
      const sp = specials(index).find((s) => s.id === d.special)
      if (sp) deals.push({ ...d, from: sp.from, to: sp.to })
    } else if (d.fromDays != null && d.toDays != null) deals.push({ ...d, from: addDays(todayYmd, d.fromDays), to: addDays(todayYmd, d.toDays) })
    else deals.push(d)
  }
  const newBrands = (raw?.newBrands ?? []).map((b) => (b.openedDaysAgo != null ? { ...b, openedOn: addDays(todayYmd, -b.openedDaysAgo) } : b))
  return { ...raw, deals, newBrands }
}

export function effectiveYmd(index, date = new Date(), previewId = null) {
  const sp = previewId ? activeSpecial(index, date, previewId) : null
  return sp ? sp.from : venueDate(index, date).ymd
}

function occupantPlace(index, occupantId) {
  const occ = index.occupantById?.get(occupantId)
  if (!occ) return null
  const unit = index.unitById?.get(occ.unitIds?.[0])
  const level = unit ? index.levelById.get(unit.levelId) : null
  if (!level || level.kind === 'parking') return null
  return { occupant: occ, levelId: level.id, category: occ.category }
}

export const isNewBrand = (data, occupantId) => Boolean(data?.newBrands?.some((b) => b.occupantId === occupantId))

export function liveDeals(index, data, { date = new Date(), previewId = null } = {}) {
  const ymd = effectiveYmd(index, date, previewId)
  const out = []
  for (const d of data?.deals ?? []) {
    if (!(d.from <= ymd && ymd <= d.to)) continue
    const place = occupantPlace(index, d.occupantId)
    if (place) out.push({ ...d, ...place, isNew: isNewBrand(data, d.occupantId) })
  }
  return out
}

export function sortDeals(deals, etaOf) {
  const key = (d) => etaOf(d.occupantId) ?? Infinity
  return [...deals].sort((a, b) => key(a) - key(b) || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
}

export function dealCategories(deals) {
  return [...new Set(deals.map((d) => d.category))]
}

export const dealFor = (deals, occupantId) => deals?.find((d) => d.occupantId === occupantId) ?? null

export function newBrands(index, data) {
  const out = []
  for (const b of data?.newBrands ?? []) {
    const place = occupantPlace(index, b.occupantId)
    if (place) out.push({ ...b, ...place })
  }
  return out
}

/** Walk time (s) from the times map (routing travelTimesFrom) to the nearest entrance of a shop. */
export function occupantEta(index, times, occupantId) {
  const occ = index.occupantById?.get(occupantId)
  let best = null
  for (const n of occ?.entranceNodeIds ?? []) {
    const e = times?.get(n)?.etaS
    if (e != null && (best == null || e < best)) best = e
  }
  return best
}
