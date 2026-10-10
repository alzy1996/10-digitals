/**
 * Pin icon atlas drawn at runtime on a CanvasTexture (no external images, no icon fonts).
 * Each cell is a map pin: a coloured disc with a white ring, a dark hairline and a pointer, with a
 * white pictogram. Text inside icons is Latin only ("ATM", "P"), so it never depends on a system
 * Arabic font.
 */
import { CanvasTexture, LinearMipmapLinearFilter, LinearFilter, SRGBColorSpace } from 'three'
import { PIN_COLORS } from './palette.js'
import { ZONE_ICON_PATHS } from './tokens.js'

const CELL = 128
const COLS = 8

/** Icon ids in atlas order. */
export const ICON_IDS = [
  'restroom_men',
  'restroom_women',
  'restroom_accessible',
  'restroom_family',
  'musalla_men',
  'musalla_women',
  'wudu_men',
  'wudu_women',
  'atm',
  'info_desk',
  'taxi_pickup',
  'entrance',
  'lift',
  'escalator',
  'stairs',
  'parking',
  'qr',
]

/** Pin colour per icon. */
export const ICON_COLORS = {
  restroom_men: PIN_COLORS.restroom,
  restroom_women: PIN_COLORS.restroom,
  restroom_accessible: PIN_COLORS.restroom,
  restroom_family: PIN_COLORS.restroom,
  musalla_men: PIN_COLORS.prayer,
  musalla_women: PIN_COLORS.prayer,
  wudu_men: PIN_COLORS.prayer,
  wudu_women: PIN_COLORS.prayer,
  atm: PIN_COLORS.services,
  info_desk: PIN_COLORS.services,
  taxi_pickup: PIN_COLORS.exit,
  entrance: PIN_COLORS.exit,
  lift: PIN_COLORS.connector,
  escalator: PIN_COLORS.connector,
  stairs: PIN_COLORS.connector,
  parking: PIN_COLORS.parking,
  qr: '#0B0F14',
}

/** Pin icon id for a parking zone (its pictogram on the zone colour). */
export function zonePinId(zoneId) {
  return 'zone:' + zoneId
}

/**
 * UV rectangle [u0, v0, u1, v1] of an icon in an atlas (texture flipY = true).
 * @param {string} id
 * @param {{ userData: { ids: string[], rows: number } }} [atlas] the atlas texture (default: the fixed icon set)
 */
export function iconUv(id, atlas) {
  const ids = atlas?.userData?.ids ?? ICON_IDS
  const rows = atlas?.userData?.rows ?? Math.ceil(ICON_IDS.length / COLS)
  const i = Math.max(0, ids.indexOf(id))
  const col = i % COLS
  const row = Math.floor(i / COLS)
  return [col / COLS, 1 - (row + 1) / rows, (col + 1) / COLS, 1 - row / rows]
}

/** Relative luminance of #RRGGBB (for a dark pictogram on light zone colours). */
function luminance(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** A zone pictogram (24 x 24 SVG paths) in the 64-unit pictogram box. */
function zonePictogram(ctx, icon) {
  const parts = ZONE_ICON_PATHS[icon] ?? ZONE_ICON_PATHS.falcon
  ctx.save()
  const k = 54 / 24
  ctx.scale(k, k)
  ctx.translate(-12, -12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const p of parts) {
    const path = new Path2D(p.d)
    if (p.stroke) {
      ctx.lineWidth = p.stroke
      ctx.stroke(path)
    } else ctx.fill(path, p.rule ?? 'nonzero')
  }
  ctx.restore()
}

// --- pictograms, drawn in a 64x64 box centred on (0, 0), white on the pin colour ----------------

function man(ctx) {
  ctx.beginPath()
  ctx.arc(0, -21, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(-11, -12, 22, 21, 5)
  ctx.fill()
  ctx.fillRect(-9, 6, 7.5, 22)
  ctx.fillRect(1.5, 6, 7.5, 22)
}

function woman(ctx) {
  ctx.beginPath()
  ctx.arc(0, -21, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-7, -12)
  ctx.lineTo(7, -12)
  ctx.lineTo(15, 12)
  ctx.lineTo(-15, 12)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(-7, 11, 5.5, 17)
  ctx.fillRect(1.5, 11, 5.5, 17)
}

export function drawAccessible(ctx) {
  ctx.beginPath()
  ctx.arc(-1, -23, 6.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(-2, -13)
  ctx.lineTo(-3, 3)
  ctx.lineTo(11, 3)
  ctx.lineTo(16, 18)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-3, -6)
  ctx.lineTo(9, -6)
  ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(-3, 11, 15, -0.35 * Math.PI, 1.25 * Math.PI, false)
  ctx.stroke()
}

function family(ctx) {
  ctx.save()
  ctx.translate(-10, -1)
  ctx.scale(0.82, 0.82)
  woman(ctx)
  ctx.restore()
  ctx.save()
  ctx.translate(15, 9)
  ctx.scale(0.5, 0.5)
  man(ctx)
  ctx.restore()
}

function dome(ctx, bg) {
  ctx.beginPath()
  ctx.moveTo(-20, 22)
  ctx.lineTo(-20, 6)
  ctx.arc(0, 6, 20, Math.PI, 0)
  ctx.lineTo(20, 22)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(-2, -26, 4, 13)
  // crescent
  ctx.beginPath()
  ctx.arc(0, -25, 6.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.arc(2.6, -26.6, 5.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  // door
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(-5, 9, 10, 13, [5, 5, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
}

function drop(ctx) {
  ctx.beginPath()
  ctx.moveTo(0, -27)
  ctx.bezierCurveTo(6, -15, 17, -5, 17, 7)
  ctx.arc(0, 7, 17, 0, Math.PI)
  ctx.bezierCurveTo(-17, -5, -6, -15, 0, -27)
  ctx.closePath()
  ctx.fill()
}

/** Small figure badge in the lower right corner to tell men's and women's rooms apart. */
function figureBadge(ctx, bg, female) {
  ctx.save()
  ctx.translate(19, 15)
  ctx.beginPath()
  ctx.arc(0, 0, 12, 0, Math.PI * 2)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#FFFFFF'
  ctx.stroke()
  ctx.fillStyle = '#FFFFFF'
  ctx.scale(0.36, 0.36)
  if (female) woman(ctx)
  else man(ctx)
  ctx.restore()
}

function atm(ctx, bg) {
  ctx.beginPath()
  ctx.roundRect(-26, -17, 52, 34, 6)
  ctx.fill()
  ctx.fillStyle = bg
  ctx.font = 'bold 19px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('ATM', 0, 1)
  ctx.fillStyle = '#FFFFFF'
}

function info(ctx) {
  ctx.beginPath()
  ctx.arc(0, -18, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(-5.5, -8, 11, 28, 2)
  ctx.fill()
  ctx.fillRect(-10, 17, 20, 5)
  ctx.fillRect(-10, -8, 8, 5)
}

function taxi(ctx, bg) {
  ctx.fillRect(-6, -24, 12, 6)
  ctx.beginPath()
  ctx.moveTo(-15, -4)
  ctx.lineTo(-10, -17)
  ctx.lineTo(10, -17)
  ctx.lineTo(15, -4)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(-26, -5, 52, 17, 5)
  ctx.fill()
  ctx.fillStyle = bg
  ctx.fillRect(-8, -14, 7, 8)
  ctx.fillRect(1, -14, 7, 8)
  for (const x of [-14, 14]) {
    ctx.beginPath()
    ctx.arc(x, 13, 6.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#FFFFFF'
  for (const x of [-14, 14]) {
    ctx.beginPath()
    ctx.arc(x, 13, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function entrance(ctx) {
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-2, -24)
  ctx.lineTo(20, -24)
  ctx.lineTo(20, 24)
  ctx.lineTo(-2, 24)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-26, 0)
  ctx.lineTo(8, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(10, 0)
  ctx.lineTo(-2, -11)
  ctx.lineTo(-2, 11)
  ctx.closePath()
  ctx.fill()
}

function lift(ctx) {
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.roundRect(-19, -26, 38, 52, 6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -18)
  ctx.lineTo(10, -5)
  ctx.lineTo(-10, -5)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, 18)
  ctx.lineTo(10, 5)
  ctx.lineTo(-10, 5)
  ctx.closePath()
  ctx.fill()
}

function escalator(ctx) {
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-27, 20)
  ctx.lineTo(-13, 20)
  ctx.lineTo(13, -8)
  ctx.lineTo(27, -8)
  ctx.stroke()
  // rider
  ctx.beginPath()
  ctx.arc(-1, -18, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 5.5
  ctx.beginPath()
  ctx.moveTo(-2, -10)
  ctx.lineTo(-4, 6)
  ctx.stroke()
}

function stairs(ctx) {
  ctx.beginPath()
  ctx.moveTo(-27, 23)
  ctx.lineTo(-27, 12)
  ctx.lineTo(-14, 12)
  ctx.lineTo(-14, 0)
  ctx.lineTo(-1, 0)
  ctx.lineTo(-1, -12)
  ctx.lineTo(12, -12)
  ctx.lineTo(12, -24)
  ctx.lineTo(27, -24)
  ctx.lineTo(27, 23)
  ctx.closePath()
  ctx.fill()
}

function parking(ctx) {
  ctx.font = 'bold 46px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('P', 1, 3)
}

/** QR plate: three finder squares and a few modules (white on the pin colour). */
function qr(ctx, bg) {
  const finder = (x, y) => {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x, y, 20, 20)
    ctx.fillStyle = bg
    ctx.fillRect(x + 4, y + 4, 12, 12)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x + 7, y + 7, 6, 6)
  }
  finder(-25, -25)
  finder(5, -25)
  finder(-25, 5)
  ctx.fillStyle = '#FFFFFF'
  for (const [x, y] of [
    [7, 7],
    [17, 7],
    [12, 12],
    [7, 18],
    [19, 19],
    [-3, -3],
    [-3, 9],
  ])
    ctx.fillRect(x, y, 6, 6)
}

const DRAW = {
  restroom_men: (c) => man(c),
  restroom_women: (c) => woman(c),
  restroom_accessible: (c) => drawAccessible(c),
  restroom_family: (c) => family(c),
  musalla_men: (c, bg) => {
    dome(c, bg)
    figureBadge(c, bg, false)
  },
  musalla_women: (c, bg) => {
    dome(c, bg)
    figureBadge(c, bg, true)
  },
  wudu_men: (c, bg) => {
    drop(c)
    figureBadge(c, bg, false)
  },
  wudu_women: (c, bg) => {
    drop(c)
    figureBadge(c, bg, true)
  },
  atm: (c, bg) => atm(c, bg),
  info_desk: (c) => info(c),
  taxi_pickup: (c, bg) => taxi(c, bg),
  entrance: (c) => entrance(c),
  lift: (c) => lift(c),
  escalator: (c) => escalator(c),
  stairs: (c) => stairs(c),
  parking: (c) => parking(c),
  qr: (c, bg) => qr(c, bg),
}

/**
 * Draw the atlas: the fixed wayfinding icons plus one pin per parking zone (its Omani pictogram on the zone
 * colour). Returns a CanvasTexture (sRGB, mipmapped); `texture.userData.ids` lists the cells in order.
 * @param {Array<{ id: string, color: string, icon: string }>} [zones]
 * @returns {CanvasTexture}
 */
export function createIconAtlas(zones = []) {
  const cells = [
    ...ICON_IDS.map((id) => ({ id, bg: ICON_COLORS[id], draw: (ctx, bg) => DRAW[id](ctx, bg), fg: '#FFFFFF' })),
    ...zones.map((z) => ({
      id: zonePinId(z.id),
      bg: z.color,
      fg: luminance(z.color) > 0.4 ? '#0B0F14' : '#FFFFFF',
      draw: (ctx) => zonePictogram(ctx, z.icon),
    })),
  ]
  const rows = Math.max(1, Math.ceil(cells.length / COLS))
  const canvas = document.createElement('canvas')
  canvas.width = CELL * COLS
  canvas.height = CELL * rows
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  cells.forEach((cell, i) => {
    const bg = cell.bg
    const ox = (i % COLS) * CELL
    const oy = Math.floor(i / COLS) * CELL
    ctx.save()
    ctx.translate(ox + CELL / 2, oy)
    // pin body: disc + pointer, dark hairline, white ring
    const cy = 54
    const r = 46
    ctx.beginPath()
    ctx.arc(0, cy, r + 5, Math.PI * 0.62, Math.PI * 2.38)
    ctx.lineTo(0, 125)
    ctx.closePath()
    ctx.fillStyle = 'rgba(11,15,20,0.85)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, cy, r + 3, Math.PI * 0.62, Math.PI * 2.38)
    ctx.lineTo(0, 121)
    ctx.closePath()
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, cy, r - 3, 0, Math.PI * 2)
    ctx.fillStyle = bg
    ctx.fill()
    // pictogram
    ctx.translate(0, cy)
    ctx.scale(1.12, 1.12)
    ctx.fillStyle = cell.fg
    ctx.strokeStyle = cell.fg
    cell.draw(ctx, bg)
    ctx.restore()
  })
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.generateMipmaps = true
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.anisotropy = 1
  tex.userData = { ids: cells.map((c) => c.id), rows }
  tex.needsUpdate = true
  return tex
}

/**
 * Icon id for an amenity category (falls back to info).
 * @param {string} category
 */
export function iconForAmenity(category) {
  return ICON_IDS.includes(category) ? category : 'info_desk'
}
