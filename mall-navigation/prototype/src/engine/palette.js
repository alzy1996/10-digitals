/**
 * Engine colour tokens (PLAN.md §9 + §19.2 art direction table) and a colour-key registry.
 *
 * Every merged mesh stores, per vertex, a small integer "colour key" plus a baked shade factor.
 * Switching theme re-resolves the keys, so one geometry serves both the Sunlight and Basement palettes
 * without a rebuild. Meaningful colours (route, car, category signs) are exact hex values on unlit
 * materials, so what is written here is what renders.
 */
import { Color } from 'three'

// Plain colour constants live in tokens.js (no three.js import), so the UI shell can use them without
// pulling the 3D engine into the first-screen bundle.
export { CATEGORY_COLORS, PIN_COLORS, amenityGroup } from './tokens.js'

/** Theme tokens. Keys are referenced by name from the scene builders. */
export const THEMES = Object.freeze({
  sunlight: Object.freeze({
    // canvas background gradient (CSS, top -> bottom)
    bgTop: '#FFFFFF',
    bgBottom: '#E3E9F0',
    // retail floors
    slab: '#F1F4F8',
    walkway: '#F7F8FA',
    court: '#F2EFE8',
    seating: '#F6EEDF',
    paving: '#E6DFD1',
    lobby: '#EEF1F5',
    slabSide: '#B8C2CE',
    slabEdge: '#8C97A6',
    roof: '#E3E8EF',
    roofService: '#D3DAE3',
    wall: '#CDD5DF',
    wallInner: '#E3E8EF',
    strip: '#5B6573',
    serviceFloor: '#E4E8EE',
    glass: '#A9D8EC',
    metal: '#7D8999',
    door: '#334155',
    escDeck: '#3B4452',
    escDeck2: '#4B5563',
    escSide: '#E3E8EF',
    escPit: '#C9D1DB',
    chevron: '#FFFFFF',
    stairStep: '#D9DFE7',
    stairStep2: '#BCC5D0',
    stone: '#E4DDCF',
    stoneDark: '#C9BFAC',
    water: '#5CC2E8',
    waterLight: '#A8E2F5',
    post: '#5B6573',
    // QR plates: white with a dark frame (amber is reserved for the car, PLAN.md 19.2)
    qr: '#FFFFFF',
    qrDark: '#0B0F14',
    exit: '#00753A',
    exitMat: '#BFE3CD',
    wood: '#B9835A',
    seat: '#E8DCC8',
    leaf: '#3F8F4F',
    leafDark: '#2F6E3C',
    trunk: '#8B6040',
    planter: '#C9BFAC',
    // parking
    asphalt: '#3E4653',
    aisle: '#4A5361',
    aisleLine: '#E8ECF1',
    bayLine: '#FFFFFF',
    lobbyPark: '#C7CFDA',
    // ramps: grey hatching (never car amber)
    hatch: '#5B6573',
    hatchDark: '#E3E8EF',
    pillar: '#D6DCE4',
    concrete: '#9AA5B4',
    concreteTop: '#B4BDC9',
    // accessible bays: neutral fill + white wheelchair symbol (never route blue)
    accessibleBay: '#5B6573',
    accessibleSymbol: '#FFFFFF',
    // ghost outline of the level above/below in floor view
    ghost: '#5B6573',
    // route + markers (§19.2)
    routeCore: '#0B57D0',
    routeUpcoming: '#5B8EE6',
    routeCasing: '#FFFFFF',
    routeWalked: '#7A8494',
    you: '#0B57D0',
    youRing: '#FFFFFF',
    lastSeen: '#5B6573',
    car: '#F5B700',
    carOutline: '#0B0F14',
    dest: '#067647',
    walker: '#12A594',
    walkerOutline: '#0B0F14',
    // labels
    labelText: '#0B0F14',
    labelHalo: '#FFFFFF',
    badgeText: '#FFFFFF',
    badgeHalo: '#1F2937',
    signText: '#FFFFFF',
    floorPaint: '#F5F7FA',
  }),
  basement: Object.freeze({
    bgTop: '#121821',
    bgBottom: '#0B0F14',
    slab: '#161B22',
    walkway: '#1B212B',
    court: '#1F2530',
    seating: '#232833',
    paving: '#232A35',
    lobby: '#222935',
    slabSide: '#2A3342',
    slabEdge: '#3A4556',
    roof: '#2A3342',
    roofService: '#252D3A',
    wall: '#3A4556',
    wallInner: '#2F3846',
    strip: '#7A8597',
    serviceFloor: '#1E2530',
    glass: '#6F93B8',
    metal: '#8592A6',
    door: '#0B0F14',
    escDeck: '#2A3342',
    escDeck2: '#3A4556',
    escSide: '#3A4556',
    escPit: '#11161D',
    chevron: '#F5F7FA',
    stairStep: '#3A4556',
    stairStep2: '#2A3342',
    stone: '#4A5263',
    stoneDark: '#3A4252',
    water: '#2B7FA8',
    waterLight: '#3E95BF',
    post: '#7A8597',
    qr: '#FFFFFF',
    qrDark: '#0B0F14',
    exit: '#2E9E62',
    exitMat: '#1F3A2C',
    wood: '#7A5A40',
    seat: '#4A4438',
    leaf: '#2E6B3B',
    leafDark: '#24552F',
    trunk: '#5E4430',
    planter: '#3A4252',
    asphalt: '#161B22',
    aisle: '#1E2530',
    aisleLine: '#AEB8C6',
    bayLine: '#E6EAF0',
    lobbyPark: '#2A3342',
    hatch: '#7A8597',
    hatchDark: '#161B22',
    pillar: '#4A5568',
    concrete: '#2A3342',
    concreteTop: '#323C4D',
    accessibleBay: '#3A4556',
    accessibleSymbol: '#FFFFFF',
    ghost: '#7A8597',
    routeCore: '#7AB0FF',
    routeUpcoming: '#4C7BC0',
    routeCasing: '#0B0F14',
    routeWalked: '#6B7686',
    you: '#7AB0FF',
    youRing: '#0B0F14',
    lastSeen: '#AEB8C6',
    car: '#F5B700',
    carOutline: '#0B0F14',
    dest: '#4ADE9B',
    walker: '#2DD4BF',
    walkerOutline: '#0B0F14',
    labelText: '#F5F7FA',
    labelHalo: '#0B0F14',
    badgeText: '#0B0F14',
    badgeHalo: '#E6EAF0',
    signText: '#FFFFFF',
    floorPaint: '#E6EAF0',
  }),
})

/** @typedef {'sunlight'|'basement'} ThemeName */

/**
 * Mix two hex colours in sRGB space (t = 0 -> a, 1 -> b).
 * @param {string} a
 * @param {string} b
 * @param {number} t
 * @returns {string}
 */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (p, s) => (p >> s) & 255
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t)
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1).toUpperCase()
}

/**
 * Resolve a colour key for a theme. Keys:
 * - a THEMES token name ("walkway", "strip", ...)
 * - "hex:#RRGGBB"               fixed colour in both themes
 * - "roof:#RRGGBB"              category-tinted roof
 * - "floor:#RRGGBB"             category-tinted interior floor
 * - "side:#RRGGBB"              category-tinted outer wall
 * - "dark:#RRGGBB"              darker shade of a colour (sign box sides)
 * @param {string} key
 * @param {ThemeName} theme
 * @returns {string}
 */
export function resolveKeyHex(key, theme) {
  const t = THEMES[theme] ?? THEMES.sunlight
  if (key in t) return t[key]
  const i = key.indexOf(':')
  if (i < 0) throw new Error(`palette: unknown colour key "${key}"`)
  const kind = key.slice(0, i)
  const hex = key.slice(i + 1)
  const sun = theme !== 'basement'
  switch (kind) {
    case 'hex':
      return hex
    case 'roof':
      return sun ? mixHex('#FFFFFF', hex, 0.34) : mixHex('#2A3342', hex, 0.5)
    case 'floor':
      return sun ? mixHex('#FFFFFF', hex, 0.14) : mixHex('#1B212B', hex, 0.28)
    case 'side':
      return sun ? mixHex('#D5DCE4', hex, 0.3) : mixHex('#3A4556', hex, 0.35)
    case 'dark':
      return mixHex(hex, '#000000', 0.28)
    default:
      throw new Error(`palette: unknown colour key "${key}"`)
  }
}

/**
 * Interns colour keys to small integers and resolves them per theme to linear RGB.
 */
export class ColorRegistry {
  constructor() {
    /** @type {string[]} */
    this.keys = []
    /** @type {Map<string, number>} */
    this.index = new Map()
    /** @type {Map<string, Float32Array>} */
    this.cache = new Map()
  }

  /**
   * @param {string} key
   * @returns {number}
   */
  id(key) {
    let i = this.index.get(key)
    if (i === undefined) {
      resolveKeyHex(key, 'sunlight') // validate early
      i = this.keys.length
      this.keys.push(key)
      this.index.set(key, i)
      this.cache.clear()
    }
    return i
  }

  /**
   * Linear RGB triples for every interned key, for a theme.
   * @param {ThemeName} theme
   * @returns {Float32Array}
   */
  table(theme) {
    let tab = this.cache.get(theme)
    if (tab && tab.length === this.keys.length * 3) return tab
    tab = new Float32Array(this.keys.length * 3)
    const c = new Color()
    this.keys.forEach((k, i) => {
      c.set(resolveKeyHex(k, theme))
      tab[i * 3] = c.r
      tab[i * 3 + 1] = c.g
      tab[i * 3 + 2] = c.b
    })
    this.cache.set(theme, tab)
    return tab
  }
}

/**
 * Linear-space THREE.Color for a theme token.
 * @param {ThemeName} theme
 * @param {string} token
 * @returns {Color}
 */
export function themeColor(theme, token) {
  return new Color(resolveKeyHex(token, theme))
}
