/**
 * Synthetic mall dashboard data (v0.5 demo, "Demo data · simulated"): deterministic from a seed over the demo venue,
 * shaped like PLAN.md 8 (D01-D08) and 13 (KPI dashboard). Any count under MIN_SHOWN is hidden on the heatmap (PLAN:
 * small-count suppression); a plate is weak when its scans fall under 20 % of the expected rate.
 */
export const MIN_SHOWN = 10
export const heatShown = (n) => n >= MIN_SHOWN
export const plateOk = (actual, expected) => expected <= 0 || actual >= 0.2 * expected

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_FACTOR = { sun: 0.9, mon: 0.85, tue: 0.88, wed: 0.95, thu: 1.35, fri: 1.5, sat: 1.1 }
const HOUR_SHAPE = [2, 1, 0, 0, 0, 0, 0, 1, 2, 4, 7, 9, 10, 11, 9, 8, 9, 12, 15, 18, 20, 19, 14, 6]
const NOT_FOUND = [
  [{ en: 'IMAX cinema', ar: 'سينما آيماكس' }, 212], [{ en: 'pet shop', ar: 'متجر حيوانات أليفة' }, 164],
  [{ en: 'shoe repair', ar: 'تصليح أحذية' }, 121], [{ en: 'Turkish restaurant', ar: 'مطعم تركي' }, 98],
  [{ en: 'kids salon', ar: 'صالون أطفال' }, 76], [{ en: 'bowling', ar: 'بولينغ' }, 64],
]
const GENERIC = [[{ en: 'restrooms', ar: 'دورات المياه' }, 1.6], [{ en: 'prayer room', ar: 'مصلى' }, 1.3], [{ en: 'pharmacy', ar: 'صيدلية' }, 0.9], [{ en: 'ATM', ar: 'صراف آلي' }, 0.7]]
const PLATE_DAILY = { entrance: 120, directory: 80, lift_lobby: 60, escalator: 40, corridor: 30, parking_pillar: 25 }

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dowOf = (ymd) => DOW[new Date(`${ymd}T12:00:00Z`).getUTCDay()]

export function buildStats(index, offers, { today, days = 30, seed = 20261011 } = {}) {
  const rnd = mulberry32(seed)
  const jitter = (spread) => 1 + (rnd() * 2 - 1) * spread
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const ymd = addDays(today, -i)
    const dow = dowOf(ymd)
    const trend = 1 + ((days - 1 - i) / days) * 0.18
    daily.push({ ymd, dow, journeys: Math.round(420 * DAY_FACTOR[dow] * trend * jitter(0.08)) })
  }
  const journeys = daily.reduce((a, d) => a + d.journeys, 0)
  const shapeSum = HOUR_SHAPE.reduce((a, b) => a + b, 0)
  const hourly = HOUR_SHAPE.map((w) => Math.round((journeys * w) / shapeSum * jitter(0.05)))
  const shoppers = Math.round(journeys * 0.64)
  const footfall = Math.round(shoppers / (0.072 * jitter(0.05)))
  const carSaves = Math.round(journeys * 0.21)
  const carFinds = Math.round(carSaves * 0.88)
  const occupants = index.venue.occupants
  const topSearches = [
    ...occupants.map((o) => ({ label: o.name, count: Math.round((40 + o.landmarkScore * 90) * jitter(0.5)) })),
    ...GENERIC.map(([label, w]) => ({ label, count: Math.round(180 * w * jitter(0.2)) })),
  ].sort((a, b) => b.count - a.count).slice(0, 8)
  const notFound = NOT_FOUND.map(([label, c]) => ({ label, count: Math.round(c * jitter(0.1)) }))
  const heat = []
  for (const u of index.venue.units) {
    if (!u.occupantId) continue
    const occ = occupants.find((o) => o.id === u.occupantId)
    const base = occ?.category === 'services' ? 6 : 30 + (occ?.landmarkScore ?? 0) * 40
    heat.push({ unitId: u.id, levelId: u.levelId, count: Math.round(base * jitter(0.6)) })
  }
  const plates = [...index.anchorById.values()].map((a) => {
    const expected = (PLATE_DAILY[a.kind] ?? 30) * days
    return { anchorId: a.id, code: a.code, label: a.label, levelId: a.levelId, expected, actual: Math.round(expected * (0.45 + rnd() * 0.7)) }
  })
  // two plates went quiet (a sign turned or covered): what the plate-health list is for
  const weak = [...plates].sort((a, b) => a.anchorId.localeCompare(b.anchorId)).filter((_, i) => i % 17 === 5).slice(0, 2)
  for (const p of weak) p.actual = Math.round(p.expected * (0.05 + rnd() * 0.1))
  for (const p of plates) p.ok = plateOk(p.actual, p.expected)
  const offerRows = (offers?.deals ?? []).map((d) => {
    const views = Math.round(900 * jitter(0.5))
    return { dealId: d.id, occupantId: d.occupantId, views, taps: Math.round(views * (0.06 + rnd() * 0.08)) }
  })
  const kpis = {
    journeys, shoppers, footfall, share: shoppers / footfall, carSaves, carFinds, carSuccess: carFinds / carSaves,
    toShopS: 190, toShopBaseS: 340, toCarS: 125, toCarBaseS: 450,
    offerViews: offerRows.reduce((a, o) => a + o.views, 0), offerTaps: offerRows.reduce((a, o) => a + o.taps, 0),
  }
  return { range: { from: daily[0].ymd, to: today }, daily, hourly, kpis, topSearches, notFound, heat, plates, offers: offerRows }
}

const cell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
