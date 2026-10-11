/** Facilities directory (v0.5): every amenity in one group, nearest first (walk time from you). Pure. */
export const FACILITY_GROUPS = Object.freeze([
  { id: 'restrooms', categories: ['restroom_men', 'restroom_women'] },
  { id: 'family', categories: ['restroom_accessible', 'restroom_family', 'baby_change'] },
  { id: 'prayer', categories: ['musalla_men', 'musalla_women', 'wudu_men', 'wudu_women'] },
  { id: 'money', categories: ['atm', 'exchange'] },
  { id: 'transport', categories: ['taxi_pickup', 'valet', 'ev_charging'] },
  { id: 'help', categories: ['info_desk', 'first_aid', 'lost_found'] },
])
const OTHER = 'help'

export function facilityGroups(index, etaOfNode) {
  const ordinal = (levelId) => index.levelById.get(levelId)?.ordinal ?? 0
  const groups = FACILITY_GROUPS.map((g) => ({ id: g.id, items: [] }))
  for (const a of index.venue.amenities) {
    const gi = FACILITY_GROUPS.findIndex((g) => g.categories.includes(a.category))
    const g = groups[gi >= 0 ? gi : FACILITY_GROUPS.findIndex((x) => x.id === OTHER)]
    g.items.push({ amenity: a, levelId: a.levelId, etaS: etaOfNode(a.nodeId) })
  }
  for (const g of groups) {
    g.items.sort((x, y) => (x.etaS ?? Infinity) - (y.etaS ?? Infinity) || ordinal(y.levelId) - ordinal(x.levelId) || (x.amenity.id < y.amenity.id ? -1 : 1))
  }
  return groups.filter((g) => g.items.length)
}
