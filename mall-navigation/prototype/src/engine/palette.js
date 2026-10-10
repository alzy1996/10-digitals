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

/** Sky pass colours (DESIGN-GLASS.md 5.2) as palette keys. */
function sky(skyTop, skyMid, skyHorizon, skyLow, glow, glowCore, cloudDark, cloudLight, cloudLit, cloudAmt) {
  return { skyTop, skyMid, skyHorizon, skyLow, glow, glowCore, cloudDark, cloudLight, cloudLit, cloudAmt }
}

/** Storm retail palette (DESIGN-GLASS.md 5.3): cool desaturated greys, teal-green route, blue you / walker. */
const STORM = {
  bgTop: '#121A1F',
  bgBottom: '#0A0F12',
  slab: '#3E464F',
  walkway: '#363D45',
  court: '#3E3F42',
  seating: '#5E5A53',
  paving: '#4A4741',
  lobby: '#3B434C',
  slabSide: '#262C33',
  slabEdge: '#1A1F24',
  roof: '#8A929B',
  roofService: '#6B737C',
  wall: '#5A626B',
  wallInner: '#5D666F',
  strip: '#D5DCE3',
  serviceFloor: '#3A4149',
  glass: '#9DBFCC',
  metal: '#A9B3BD',
  door: '#1E242A',
  escDeck: '#2B3138',
  escDeck2: '#363D45',
  escSide: '#9AA4AE',
  // escalator balustrade panels: drawn with the storefront glass material in storm
  escPanel: '#9DBFCC',
  escPit: '#1A1F24',
  chevron: '#FFFFFF',
  // painted arrows on the escalator steps: muted metal (the route's own white chevrons ride the ramp in the Walk view)
  escChev: '#7D8792',
  stairStep: '#6E7780',
  stairStep2: '#5A636C',
  stone: '#6E6A62',
  stoneDark: '#57534C',
  water: '#2E8FB0',
  waterLight: '#6FC3DD',
  post: '#A9B3BD',
  qr: '#FFFFFF',
  qrDark: '#0B0F14',
  exit: '#1E9E5A',
  exitMat: '#1F3A2C',
  wood: '#8A6A50',
  seat: '#6B6358',
  leaf: '#3E7F57',
  leafDark: '#2E6243',
  trunk: '#6B4E38',
  planter: '#57534C',
  asphalt: '#2A3038',
  aisle: '#333A43',
  aisleLine: '#DDE3EA',
  bayLine: '#E8EDF2',
  lobbyPark: '#4A535D',
  hatch: '#8A939D',
  hatchDark: '#2A3038',
  pillar: '#6E7780',
  concrete: '#4A535D',
  concreteTop: '#5A636D',
  accessibleBay: '#3B4A5C',
  accessibleSymbol: '#FFFFFF',
  ghost: '#9AA6B2',
  routeCore: '#26D9C7',
  routeUpcoming: '#1FA79A',
  routeCasing: '#10B5D3',
  routeWalked: '#5F7C80',
  you: '#4DA3FF',
  youRing: '#FFFFFF',
  lastSeen: '#9AA6B2',
  car: '#F5B700',
  carOutline: '#0B0F14',
  dest: '#5BE584',
  walker: '#4DA3FF',
  walkerOutline: '#FFFFFF',
  labelText: '#FFFFFF',
  labelHalo: '#0E1418',
  badgeText: '#FFFFFF',
  badgeHalo: '#0E1418',
  // level name badges: thin white type on a slim dark halo (DESIGN-GLASS 5.9), not v0.1's thick sticker outline
  badgeW: 0.18,
  signText: '#FFFFFF',
  floorPaint: '#E6EBF0',
  routeRim: '#5EF2DC',
  routeBody: '#14B8A6',
  routeGlow: '#10B5D3',
  turnRing: '#5EF2DC',
  ceiling: '#2B3239',
  ceilingPanel: '#EAF2F8',
  bulkhead: '#454D56',
  // cool slate floor highlight and haze (QA round 2: the warm #C9A88C / #3A2F2A turned the Walk view's floors and far
  // walls taupe-brown; amber stays a light source only: the skylight glow, the panels' warm rim, the SIMULATION tag)
  sheen: '#8FA3B3',
  fog: '#2A3138',
  ...sky('#121A1F', '#1D262C', '#2B2D2F', '#0A0F12', '#FF9F55', '#FFD2A0', '#2A3238', '#6B737A', '#B47F5F', 0.55),
}

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
    escPanel: '#E3E8EF',
    escPit: '#C9D1DB',
    chevron: '#FFFFFF',
    escChev: '#FFFFFF',
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
    // v0.2 keys (classic reuses its nearest colours; it has no sky keys: the sky pass is not drawn in classic)
    routeRim: '#FFFFFF',
    routeBody: '#0B57D0',
    routeGlow: '#5B8EE6',
    turnRing: '#0B57D0',
    ceiling: '#E3E8EF',
    ceilingPanel: '#FFFFFF',
    bulkhead: '#CDD5DF',
    sheen: '#FFFFFF',
    fog: '#E3E9F0',
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
    escPanel: '#3A4556',
    escPit: '#11161D',
    chevron: '#F5F7FA',
    escChev: '#F5F7FA',
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
    routeRim: '#0B0F14',
    routeBody: '#7AB0FF',
    routeGlow: '#4C7BC0',
    turnRing: '#7AB0FF',
    ceiling: '#1E2530',
    ceilingPanel: '#CFE6FF',
    bulkhead: '#2A3342',
    sheen: '#6B7686',
    fog: '#0B0F14',
  }),
  // v0.2 "storm glass" style (DESIGN-GLASS.md 5.3, retail levels)
  storm: Object.freeze(STORM),
  // v0.2 storm, parking levels (DESIGN-GLASS.md 5.6)
  stormBasement: Object.freeze({
    ...STORM,
    bgTop: '#0C1216',
    bgBottom: '#070A0D',
    slab: '#15191E',
    asphalt: '#15191E',
    walkway: '#1F262D',
    court: '#1F262D',
    paving: '#1F262D',
    aisle: '#1C2228',
    aisleLine: '#A9B6C4',
    bayLine: '#D7E0EA',
    lobbyPark: '#2A323B',
    roof: '#2A323B',
    lobby: '#262E36',
    slabSide: '#0E1215',
    slabEdge: '#2A323B',
    wall: '#333B44',
    wallInner: '#2A323B',
    strip: '#8592A0',
    pillar: '#3A444F',
    concrete: '#252C34',
    concreteTop: '#2E3640',
    hatch: '#7D8896',
    hatchDark: '#15191E',
    glass: '#6F93B8',
    ghost: '#7D8896',
    routeWalked: '#4E6366',
    labelHalo: '#0B0F14',
    floorPaint: '#D7E0EA',
    ceiling: '#1A1F25',
    bulkhead: '#252C34',
    sheen: '#6E8296',
    fog: '#121820',
    ...sky('#0C1216', '#141B21', '#18212A', '#070A0D', '#5AA9FF', '#BFDFFF', '#161C22', '#2E3842', '#3E6E9E', 0.2),
  }),
})

/** @typedef {'sunlight'|'basement'|'storm'|'stormBasement'} ThemeName  a palette: classic (v0.1) or storm themes */

/**
 * Palette for a scene style and a theme: classic = the v0.1 tables, storm = the v0.2 "storm glass" tables.
 * @param {'storm'|'classic'} style
 * @param {'sunlight'|'basement'} theme
 * @returns {ThemeName}
 */
export function paletteName(style, theme) {
  if (style !== 'storm') return theme === 'basement' ? 'basement' : 'sunlight'
  return theme === 'basement' ? 'stormBasement' : 'storm'
}

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

// category tints per palette: [roof base, t], [floor base, t], [side base, t], dark t
const TINTS = {
  sunlight: [['#FFFFFF', 0.34], ['#FFFFFF', 0.14], ['#D5DCE4', 0.3], 0.28],
  basement: [['#2A3342', 0.5], ['#1B212B', 0.28], ['#3A4556', 0.35], 0.28],
  storm: [['#7E8791', 0.3], ['#3E464F', 0.18], ['#5D666F', 0.25], 0.35],
  stormBasement: [['#2A3342', 0.45], ['#1B212B', 0.25], ['#333B44', 0.3], 0.35],
}

/**
 * Resolve a colour key for a palette. Keys:
 * - a THEMES token name ("walkway", "strip", ...)
 * - "hex:#RRGGBB"               fixed colour in every palette (zone colours, painted codes)
 * - "sign:#RRGGBB"              a category sign colour: exact in classic, a little desaturated toward slate and
 *                               darkened in storm (DESIGN-GLASS.md 5.4: white text >= 6.1:1 on every category)
 * - "roof:#RRGGBB"              category-tinted roof
 * - "floor:#RRGGBB"             category-tinted interior floor
 * - "side:#RRGGBB"              category-tinted outer wall
 * - "lit:#RRGGBB"               a shop's lit inside walls: storm = the side colour mixed 35 % toward warm light
 *                               (#E9D9C4), so storefront glass reads as a lit shop; classic = the side colour
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
  const tint = TINTS[theme] ?? TINTS.sunlight
  switch (kind) {
    case 'hex':
      return hex
    case 'sign':
      return theme === 'storm' || theme === 'stormBasement' ? mixHex(mixHex(hex, '#4B5560', 0.18), '#000000', 0.08) : hex
    case 'roof':
      return mixHex(tint[0][0], hex, tint[0][1])
    case 'floor':
      return mixHex(tint[1][0], hex, tint[1][1])
    case 'side':
    case 'lit': {
      const sd = mixHex(tint[2][0], hex, tint[2][1])
      return kind === 'lit' && theme.startsWith('storm') ? mixHex(sd, '#E9D9C4', 0.35) : sd
    }
    case 'dark':
      return mixHex(hex, '#000000', tint[3])
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
