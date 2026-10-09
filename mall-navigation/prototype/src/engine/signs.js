/**
 * World-space sign text (troika BatchedText, one batch per level per purpose):
 * - shop sign boxes above doors: two lines, the active UI language on top at 100 %, the other
 *   language below at 70 %, both white on the category colour, auto-fitted to the sign width.
 *   When the band is too tight for two readable lines, only the active language is shown, as large as the
 *   band allows (PLAN.md 19.2);
 * - painted floor text (parking zone names) and pillar band labels;
 * - bay codes (separate batch, only shown when the camera is close).
 *
 * `cull()` runs every rendered frame: a line that would render under 14 px (Latin) or 16 px (Arabic) is
 * hidden (PLAN.md 19.2 "hidden below 14 px, Arabic below 16 px"), taking viewing angle into account.
 *
 * Two-line signs are laid out from the measured ink of each line (troika visibleBounds), not fixed fractions:
 * the lines stack with a clear gap (6 % of the band), centred as a pair, so deep Arabic descenders (ج ي ر) never
 * touch the Latin capitals under them; when the pair is taller than 86 % of the band both lines shrink together.
 * Painted floor text turns to stay upright; zone names that would read sideways are hidden (their pin label
 * carries the name).
 */
import { DoubleSide, Euler, FrontSide, MeshBasicMaterial, Vector3 } from 'three'
import { BatchedText, Text } from 'troika-three-text'
import { fontFor } from './fonts.js'
import { drawableText } from './textGuard.js'

/**
 * @typedef {object} SignSpec
 * @property {number} x            data x of the sign face centre
 * @property {number} y            data y
 * @property {number} h            height of the face centre
 * @property {number} rotY         rotation about the vertical axis (radians, three.js), 0 = facing +Z (south)
 * @property {boolean} [flat]      lies on the floor (text "up" = rotY direction)
 * @property {number} width        available width (m)
 * @property {number} height       available height (m)
 * @property {{en:string, ar:string}} text
 * @property {number} size         primary font size (m)
 * @property {'both'|'en'} [langs]
 * @property {string} [color]      fixed text colour (default theme signText)
 * @property {number} [opacity]
 * @property {boolean} [hideSideways] flat text: hide when the camera would read it sideways (instead of turning)
 */

/** Smallest on-screen font size (CSS px, em) per script. */
export const MIN_TEXT_PX = Object.freeze({ en: 14, ar: 16 })

const SECONDARY_K = 0.7
/** Gap between the two sign lines, as a fraction of the band height. */
const LINE_GAP_K = 0.06
/** The two lines together use at most this fraction of the band height. */
const PAIR_MAX_K = 0.86
const _e = new Euler()
const _off = new Vector3()
const _p = new Vector3()
const _v = new Vector3()

export class SignLayer {
  /**
   * @param {{ depthTest?: boolean, side?: 'front'|'double' }} [opts]
   */
  constructor(opts = {}) {
    this.batch = new BatchedText()
    this.material = new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest !== false,
      side: opts.side === 'double' ? DoubleSide : FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    })
    this.batch.material = this.material
    this.batch.renderOrder = 3
    this.batch.frustumCulled = false
    /** @type {Array<SignSpec & { members: Record<string, Text>, fit: Record<string, number>, plan: any, mode: string }>} */
    this.items = []
    /** @type {Map<SignSpec, any>} */
    this.bySpec = new Map()
    this.lang = 'en'
    this.textColor = '#FFFFFF'
  }

  /** @param {SignSpec} spec */
  add(spec) {
    const langs = spec.langs === 'en' ? ['en'] : ['en', 'ar']
    const item = { ...spec, members: {}, fit: {}, ink: {}, plan: null, mode: 'none', sideways: false }
    for (const lang of langs) {
      // only characters the bundled fonts can draw (textGuard.js: troika would fetch the rest from a CDN)
      const str = drawableText(spec.text[lang], lang)
      if (!str) continue
      const t = new Text()
      t.text = str
      t.font = fontFor(lang)
      t.fontSize = spec.size
      t.anchorX = 'center'
      t.anchorY = 'middle'
      t.textAlign = 'center'
      t.direction = lang === 'ar' ? 'rtl' : 'ltr'
      t.whiteSpace = 'nowrap'
      t.color = spec.color ?? this.textColor
      t.fillOpacity = spec.opacity ?? 1
      t.addEventListener('synccomplete', () => {
        const bb = t.textRenderInfo?.blockBounds
        if (bb) item.fit[lang] = Math.max(1e-3, bb[2] - bb[0])
        // the ink (glyph outlines incl. descenders), in the text's own units: lines are stacked from it
        const vb = t.textRenderInfo?.visibleBounds
        if (vb && Number.isFinite(vb[1]) && Number.isFinite(vb[3]) && vb[3] > vb[1]) item.ink[lang] = [vb[1], vb[3]]
        this._plan(item)
        this._apply(item)
      })
      t.scale.setScalar(0)
      item.members[lang] = t
      this.batch.addText(t)
    }
    this.items.push(item)
    this.bySpec.set(spec, item)
    return item
  }

  setLanguage(lang) {
    this.lang = lang
    for (const it of this.items) {
      this._plan(it)
      this._apply(it)
    }
  }

  setTextColor(hex) {
    this.textColor = hex
    for (const it of this.items) {
      if (it.color) continue
      for (const m of Object.values(it.members)) m.color = hex
    }
  }

  /**
   * World font size (m) of a sign's main line as laid out (after fitting the sign width).
   * @param {SignSpec} spec
   * @returns {number|null}
   */
  lineSizeOf(spec) {
    const it = this.bySpec.get(spec)
    if (!it?.plan) return null
    return it.size * (it.plan.roomForTwo ? it.plan.pScale : it.plan.oneScale)
  }

  /**
   * Farthest camera distance (m) at which a sign's lines, as laid out by default (two lines when there is room),
   * still render at or above their minimum size, for a camera with `pxPerMeterAt1m` px per metre at 1 m and a
   * vertical foreshortening `factor` (cos of the view elevation). null before the text is measured.
   * @param {SignSpec} spec
   * @param {number} pxPerMeterAt1m
   * @param {number} factor
   */
  readableDistance(spec, pxPerMeterAt1m, factor) {
    const it = this.bySpec.get(spec)
    if (!it?.plan) return null
    const p = it.plan
    const lines = p.roomForTwo
      ? [
          [p.pScale, it.primary],
          [p.sScale, it.secondary],
        ]
      : [[p.oneScale, it.primary]]
    let d = Infinity
    for (const [scale, lang] of lines) d = Math.min(d, (it.size * scale * pxPerMeterAt1m * factor) / ((MIN_TEXT_PX[lang] ?? 14) * 1.08))
    return d
  }

  /** Fixed scales from the measured text widths (two lines, or the active language alone). */
  _plan(it) {
    const langs = Object.keys(it.members)
    const primary = langs.includes(this.lang) ? this.lang : langs[0]
    const secondary = langs.find((l) => l !== primary) ?? null
    it.primary = primary
    it.secondary = secondary
    const w1 = it.fit[primary]
    if (!w1) {
      it.plan = null
      return
    }
    const w2 = secondary ? it.fit[secondary] : 0
    const maxW = it.width * 0.92
    let pScale = Math.min(1, maxW / w1)
    let sScale = w2 ? SECONDARY_K * Math.min(1, maxW / (w2 * SECONDARY_K)) : 0
    // the two lines stacked (ink + gap) fit the band height: else both shrink together
    if (secondary && w2) {
      const pair = this._inkH(it, primary) * pScale + it.height * LINE_GAP_K + this._inkH(it, secondary) * sScale
      if (pair > it.height * PAIR_MAX_K) {
        const k = (it.height * PAIR_MAX_K) / pair
        pScale *= k
        sScale *= k
      }
    }
    // one line: as large as the band allows (ink at most 70 % of its height), within the width
    const oneScale = Math.min(Math.max(1, (it.height * 0.6) / it.size), maxW / w1, (it.height * 0.7) / Math.max(1e-3, this._inkH(it, primary)))
    // two lines only when neither has to be squeezed hard to fit
    const roomForTwo = Boolean(secondary && w2 && pScale >= 0.6 && sScale >= SECONDARY_K * 0.6)
    it.plan = { pScale, sScale, oneScale, roomForTwo }
    if (it.mode === 'none' || (it.mode === 'two' && !roomForTwo)) it.mode = roomForTwo ? 'two' : 'one'
  }

  /** Ink height of a line at scale 1 (text units = metres), with a typical estimate before it is measured. */
  _inkH(it, lang) {
    const ink = it.ink[lang]
    return ink ? ink[1] - ink[0] : it.size * (lang === 'ar' ? 1.05 : 0.75)
  }

  /** Ink [bottom, top] of a line at scale 1 (estimated before it is measured). */
  _ink(it, lang) {
    return it.ink[lang] ?? (lang === 'ar' ? [-0.55 * it.size, 0.5 * it.size] : [-0.37 * it.size, 0.38 * it.size])
  }

  /** Place the members for the item's current mode ('two' | 'one' | 'none'). */
  _apply(it) {
    for (const m of Object.values(it.members)) m.scale.setScalar(0)
    if (!it.plan || it.mode === 'none' || it.sideways) return
    let lines
    if (it.mode === 'two') {
      // from the measured ink: primary on top, a clear gap, the secondary under it, centred as a pair in the band
      const iP = this._ink(it, it.primary)
      const iS = this._ink(it, it.secondary)
      const pS = it.plan.pScale
      const sS = it.plan.sScale
      const hP = (iP[1] - iP[0]) * pS
      const hS = (iS[1] - iS[0]) * sS
      const gap = it.height * LINE_GAP_K
      const top = (hP + gap + hS) / 2
      lines = [
        { lang: it.primary, s: pS, dy: top - iP[1] * pS },
        { lang: it.secondary, s: sS, dy: top - hP - gap - iS[1] * sS },
      ]
    } else {
      const i1 = this._ink(it, it.primary)
      const s1 = it.plan.oneScale
      lines = [{ lang: it.primary, s: s1, dy: -((i1[0] + i1[1]) / 2) * s1 }]
    }
    const rotY = it.rotY + (it.flipped ? Math.PI : 0)
    if (it.flat) _e.set(-Math.PI / 2, rotY, 0, 'YXZ')
    else _e.set(0, rotY, 0, 'YXZ')
    for (const ln of lines) {
      const m = it.members[ln.lang]
      if (!m) continue
      _off.set(0, ln.dy, 0).applyEuler(_e)
      m.position.set(it.x + _off.x, it.h + _off.y, -it.y + _off.z)
      m.rotation.copy(_e)
      m.scale.setScalar(ln.s)
    }
  }

  /**
   * Hide lines that would render too small to read; switch to one line when only the main language fits.
   * @param {{ camera: import('three').Camera, levelY: number, pxPerMeter: (p: Vector3) => number }} ctx
   */
  cull(ctx) {
    const cam = ctx.camera.position
    for (const it of this.items) {
      if (!it.plan) continue
      _p.set(it.x, ctx.levelY + it.h, -it.y)
      _v.copy(_p).sub(cam).normalize()
      let factor
      if (it.flat) factor = Math.abs(_v.y)
      else {
        // facing: sign normal (three) = (sin rotY, 0, cos rotY); edge-on or from behind -> hidden
        const facing = -(_v.x * Math.sin(it.rotY) + _v.z * Math.cos(it.rotY))
        factor = facing < 0.2 ? 0 : Math.sqrt(Math.max(0, 1 - _v.y * _v.y))
      }
      const pxPerScale = it.size * ctx.pxPerMeter(_p) * factor
      const min = (lang) => MIN_TEXT_PX[lang] ?? 14
      const p = it.plan
      let mode = 'none'
      if (p.roomForTwo && p.pScale * pxPerScale >= min(it.primary) && p.sScale * pxPerScale >= min(it.secondary)) mode = 'two'
      else if (p.oneScale * pxPerScale >= min(it.primary)) mode = 'one'
      if (mode !== it.mode) {
        it.mode = mode
        this._apply(it)
      }
    }
    this.batch.updateMatrixWorld(true)
  }

  /**
   * Floor-painted text turns 180 degrees when it would read upside down for the current camera
   * heading (compass degrees the camera looks toward). Cheap: only re-lays out what flips.
   * @param {number} headingDeg
   */
  setViewHeading(headingDeg) {
    const h = (headingDeg * Math.PI) / 180
    const lx = Math.sin(h)
    const ly = Math.cos(h)
    for (const it of this.items) {
      if (!it.flat) continue
      // text "up" compass direction is -rotY (see _apply)
      const ux = Math.sin(-it.rotY)
      const uy = Math.cos(-it.rotY)
      const d = ux * lx + uy * ly
      const want = d < -0.2 ? true : d > 0.2 ? false : !!it.flipped
      // a zone name lying across the view would read vertically: hide it (its pin label names the zone)
      const sideways = Boolean(it.hideSideways) && Math.abs(d) < 0.6
      if (want !== !!it.flipped || sideways !== it.sideways) {
        it.flipped = want
        it.sideways = sideways
        this._apply(it)
      }
    }
  }

  sync(cb) {
    this.batch.sync(cb)
  }

  dispose() {
    for (const it of this.items) {
      for (const m of Object.values(it.members)) {
        this.batch.removeText(m)
        m.dispose()
      }
    }
    this.items = []
    this.bySpec.clear()
    this.batch.dispose()
    this.material.dispose()
  }
}
