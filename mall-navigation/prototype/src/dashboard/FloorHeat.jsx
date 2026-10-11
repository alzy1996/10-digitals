import { heatShown } from './stats.js'

/** Teal ramp from pale to deep (the dashboard's heat colours), t in 0..1. */
function ramp(t) {
  const a = [0xe6, 0xf4, 0xf1]
  const b = [0x0f, 0x76, 0x6e]
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/**
 * A retail level's floor plan from the venue's unit polygons, each shop shaded by its visits (DESIGN-MALL.md 3.9).
 * Counts under MIN_SHOWN are not shown (PLAN small-count rule): those units are hatched grey. Plan y runs up; SVG y
 * runs down, so y is flipped.
 */
export function FloorHeat({ index, levelId, heat, title, fewLabel, nameOf }) {
  const level = index.levelById.get(levelId)
  const outline = level.outline
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pts = (poly) => poly.map(([x, y]) => `${x - minX},${maxY - y}`).join(' ')
  const rows = heat.filter((h) => h.levelId === levelId)
  const max = Math.max(1, ...rows.filter((h) => heatShown(h.count)).map((h) => h.count))
  const byUnit = new Map(rows.map((h) => [h.unitId, h.count]))
  const id = `hatch-${levelId}`
  return (
    <svg className="floor-heat" viewBox={`-1 -1 ${maxX - minX + 2} ${maxY - minY + 2}`} role="img" aria-label={title}>
      <defs>
        <pattern id={id} width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="2" fill="#E2E8F0" />
          <line x1="0" y1="0" x2="0" y2="2" stroke="#94A3B8" strokeWidth="0.6" />
        </pattern>
      </defs>
      <polygon points={pts(outline)} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="0.4" />
      {index.venue.units
        .filter((u) => u.levelId === levelId)
        .map((u) => {
          const n = byUnit.get(u.id)
          const shown = n != null && heatShown(n)
          const fill = n == null ? '#FFFFFF' : shown ? ramp(Math.sqrt(n / max)) : `url(#${id})`
          return (
            <polygon key={u.id} points={pts(u.polygon)} fill={fill} stroke="#FFFFFF" strokeWidth="0.5">
              {n != null ? <title>{`${nameOf(u.occupantId)}: ${shown ? n : fewLabel}`}</title> : null}
            </polygon>
          )
        })}
    </svg>
  )
}
