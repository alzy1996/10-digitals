/**
 * The bento home's numbers (v0.5, DESIGN-MALL.md; Sam's Stitch mock): every figure comes from the venue, the offers
 * file and walk times from the you-are-here the shopper set; nothing is invented (no points, no showtimes).
 * Pure.
 */
import { occupantEta } from '../offers/offers.js'

const FOOD = new Set(['food', 'cafe'])
const RESTROOMS = new Set(['restroom_men', 'restroom_women', 'restroom_accessible', 'restroom_family'])

/** The largest "N%" among the deals' English figures, or null when none is a percentage. */
export function maxPercent(deals) {
  let best = null
  for (const d of deals ?? []) {
    const m = /(\d+)\s*%/.exec(d.figure?.en ?? '')
    if (m && (best == null || +m[1] > best)) best = +m[1]
  }
  return best
}

/**
 * @param {object} index VenueIndex
 * @param {{ times: { get(nodeId: string): { etaS: number } | undefined } | null, deals: object[], brands: object[], stamps: string[] }} p
 */
export function homeCards(index, { times, deals, brands, stamps }) {
  const eta = (nodeId) => times?.get(nodeId)?.etaS ?? null
  const nearestOf = (items) => {
    let best = null
    for (const it of items) if (best == null || (it.etaS ?? Infinity) < (best.etaS ?? Infinity)) best = it
    return best
  }
  const occupants = index.venue.occupants
  const food = occupants.filter((o) => FOOD.has(o.category))
  const foodNearest = nearestOf(food.map((o) => ({ id: o.id, name: o.name, levelId: index.unitById.get(o.unitIds[0])?.levelId ?? null, etaS: occupantEta(index, times, o.id) })))
  const rest = index.venue.amenities.filter((a) => RESTROOMS.has(a.category))
  const restNearest = nearestOf(rest.map((a) => ({ id: a.id, name: a.name, levelId: a.levelId, etaS: eta(a.nodeId) })))
  const stamped = new Set(stamps ?? [])
  // (never the place the food card already suggests: two cards, two places)
  const brandNearest = nearestOf((brands ?? []).filter((b) => !stamped.has(b.occupantId) && b.occupantId !== foodNearest?.id).map((b) => ({ ...b, etaS: occupantEta(index, times, b.occupantId) })))
  return {
    places: occupants.length + index.venue.amenities.length,
    food: { count: food.length, nearest: foodNearest },
    restroom: { nearest: restNearest },
    deals: { count: deals?.length ?? 0, maxPct: maxPercent(deals) },
    newBrand: brandNearest,
  }
}
