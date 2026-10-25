// Orchestrates camera/photo → hand AI → nail fit → WebGL render. UI-agnostic (React talks to it via callbacks).
import { loadHandTracker, detectVideo, detectImage } from '../../ai/handTracker'
import { estimateNails, refineNail, NailTracker, handKeys } from '../../ai/nailGeometry'
import { segmenterEnabled, segmentNails, refineWithMask } from '../../ai/segmentation/nailSegmenter'
import { NailRenderer } from '../../render/NailRenderer'

const PHOTO_MAX = 1600 // photo / HD capture cap
const FIT_W = 360 // width of the small frame used for Smart Fit pixel sampling

export class TryOnEngine {
  constructor(canvas, { onStatus, onFrame } = {}) {
    this.canvas = canvas
    this.onStatus = onStatus || (() => {})
    this.onFrame = onFrame || (() => {})
    this.renderer = new NailRenderer(canvas)
    this.tracker = new NailTracker()
    this.design = null
    this.opts = { exposure: 1, illum: [1, 1, 1], tilt: [0, 0], showOriginal: false, showEdges: false, forceVisible: false, smartFit: true }
    this.mode = 'idle' // 'live' | 'photo'
    this.video = null
    this.raf = 0
    this.photo = null // HTMLCanvasElement holding the still image
    this.photoNails = [] // detected (photo mode)
    this.overrides = new Map() // key -> nail (fine-tuned)
    this.removed = new Set()
    this.manual = [] // manually added nails
    this.hands = []
    this.lastStatus = ''
    this.fitCanvas = document.createElement('canvas')
    this.fitCtx = this.fitCanvas.getContext('2d', { willReadFrequently: true })
    this.frameCount = 0
    this.fps = 0
    this._fpsT = performance.now()
    this._fpsN = 0
    this.dirty = true
  }

  async init() {
    this.status('loading_ai')
    await loadHandTracker()
    this.status('ready')
  }

  status(s) {
    if (s !== this.lastStatus) {
      this.lastStatus = s
      this.onStatus(s)
    }
  }

  setDesign(design) {
    this.design = design
    this.dirty = true
    if (this.mode === 'photo') this.renderPhoto()
  }

  setOptions(patch) {
    Object.assign(this.opts, patch)
    this.dirty = true
    if (this.mode === 'photo') this.renderPhoto()
  }

  // ------------------------------------------------------------ LIVE
  startLive(video) {
    this.stop()
    this.mode = 'live'
    this.video = video
    this.tracker.reset()
    const loop = async () => {
      if (this.mode !== 'live') return
      await this.liveStep()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  async liveStep() {
    const v = this.video
    if (!v || v.readyState < 2 || !v.videoWidth) return
    const t = performance.now()
    if (v.currentTime === this._lastVideoTime && !this.dirty) return
    this._lastVideoTime = v.currentTime
    this.dirty = false
    const W = v.videoWidth
    const H = v.videoHeight
    let res
    try {
      res = await detectVideo(v, t)
    } catch (e) {
      console.warn('[engine] detect failed', e)
      return
    }
    // MediaPipe gives normalized coords; nails are computed in video px = render px
    this.hands = res.hands
    let nails = []
    if (res.hands.length) {
      const keys = handKeys(res.hands)
      let img = null
      let s = 0
      if (this.opts.smartFit) {
        s = FIT_W / W
        this.fitCanvas.width = FIT_W
        this.fitCanvas.height = Math.round(H * s)
        this.fitCtx.drawImage(v, 0, 0, this.fitCanvas.width, this.fitCanvas.height)
        img = this.fitCtx.getImageData(0, 0, this.fitCanvas.width, this.fitCanvas.height)
      }
      res.hands.forEach((h, i) => {
        let ns = estimateNails(h, W, H, { handKey: keys[i], forceVisible: this.opts.forceVisible })
        if (img) ns = ns.map((n) => (n.alpha > 0.05 ? refineNail(n, img, h.landmarks, W, H, s) : n))
        nails.push(...ns)
      })
    }
    nails = this.tracker.update(nails, t)
    const visible = nails.filter((n) => n.alpha > 0.3).length
    if (!res.hands.length) this.status('no_hand')
    else if (!visible) this.status('show_back')
    else this.status('ok')
    this.lastLiveNails = nails
    if (this.renderer.upload(v, W, H)) this.renderer.render(nails, this.design, { ...this.opts, time: t })
    this._fpsN++
    if (t - this._fpsT > 1000) {
      this.fps = Math.round((this._fpsN * 1000) / (t - this._fpsT))
      this._fpsN = 0
      this._fpsT = t
      this.onFrame({ fps: this.fps, hands: res.hands.length })
    }
  }

  /** Freeze the current live frame into photo mode (customer can relax her arm). */
  async freeze() {
    const v = this.video
    if (!v || !v.videoWidth) return false
    const c = document.createElement('canvas')
    const sc = Math.min(1, PHOTO_MAX / Math.max(v.videoWidth, v.videoHeight))
    c.width = Math.round(v.videoWidth * sc)
    c.height = Math.round(v.videoHeight * sc)
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    await this.setPhoto(c)
    return true
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.mode = 'idle'
  }

  // ------------------------------------------------------------ PHOTO
  /** source: HTMLImageElement | ImageBitmap | HTMLCanvasElement */
  async setPhoto(source) {
    this.stop()
    const sw = source.naturalWidth || source.videoWidth || source.width
    const sh = source.naturalHeight || source.videoHeight || source.height
    const sc = Math.min(1, PHOTO_MAX / Math.max(sw, sh))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(sw * sc))
    c.height = Math.max(1, Math.round(sh * sc))
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height)
    this.photo = c
    this.mode = 'photo'
    this.overrides.clear()
    this.removed.clear()
    this.manual = []
    this.status('analyzing')
    await this.detectPhoto()
    this.renderPhoto()
    this.startPhotoAnimation()
    return { width: c.width, height: c.height }
  }

  async detectPhoto() {
    const c = this.photo
    const W = c.width
    const H = c.height
    let res
    try {
      res = await detectImage(c)
    } catch (e) {
      console.warn('[engine] photo detect failed', e)
      res = { hands: [] }
    }
    this.hands = res.hands
    const keys = handKeys(res.hands)
    const fitScale = Math.min(1, 720 / W)
    const fc = document.createElement('canvas')
    fc.width = Math.round(W * fitScale)
    fc.height = Math.round(H * fitScale)
    const fctx = fc.getContext('2d', { willReadFrequently: true })
    fctx.drawImage(c, 0, 0, fc.width, fc.height)
    const img = fctx.getImageData(0, 0, fc.width, fc.height)
    let nails = []
    res.hands.forEach((h, i) => {
      let ns = estimateNails(h, W, H, { handKey: keys[i], forceVisible: this.opts.forceVisible })
      if (this.opts.smartFit) ns = ns.map((n) => (n.alpha > 0.05 ? refineNail(n, img, h.landmarks, W, H, fitScale) : n))
      nails.push(...ns)
    })
    if (segmenterEnabled()) {
      try {
        const mask = await segmentNails(c)
        nails = refineWithMask(nails, mask, W, H)
      } catch (e) {
        console.warn('[engine] segmenter failed', e)
      }
    }
    this.photoNails = nails
    const visible = nails.filter((n) => n.alpha > 0.3).length
    this.status(!res.hands.length ? 'no_hand_photo' : visible ? 'ok' : 'show_back')
  }

  /** Re-run detection with "always show nails" etc. */
  async redetect() {
    if (this.mode !== 'photo') return
    await this.detectPhoto()
    this.renderPhoto()
  }

  currentNails() {
    if (this.mode === 'live') return this.lastLiveNails || []
    const out = []
    for (const n of this.photoNails) {
      if (this.removed.has(n.key)) continue
      out.push(this.overrides.get(n.key) || n)
    }
    for (const m of this.manual) if (!this.removed.has(m.key)) out.push(this.overrides.get(m.key) || m)
    return out
  }

  setNail(key, nail) {
    this.overrides.set(key, { ...nail, alpha: 1 })
    this.renderPhoto()
  }

  removeNail(key) {
    this.removed.add(key)
    this.renderPhoto()
  }

  /** Add a nail at a point (photo px) using the median size of detected nails. */
  addNailAt(x, y) {
    const ref = this.currentNails()
    const med = (arr, d) => (arr.length ? arr.slice().sort((a, b) => a - b)[arr.length >> 1] : d)
    const base = Math.min(this.photo.width, this.photo.height)
    const len = med(ref.map((n) => n.len), base * 0.06)
    const wid = med(ref.map((n) => n.wid), base * 0.05)
    const key = 'manual:' + (this.manual.length + 1) + ':' + Math.round(x) + '_' + Math.round(y)
    const nail = { key, finger: 'middle', cx: x, cy: y, ux: 0, uy: -1, len, wid, alpha: 1, side: 1 }
    this.manual.push(nail)
    this.renderPhoto()
    return nail
  }

  resetEdits() {
    this.overrides.clear()
    this.removed.clear()
    this.manual = []
    this.renderPhoto()
  }

  renderPhoto() {
    if (this.mode !== 'photo' || !this.photo) return
    if (this.renderer.upload(this.photo, this.photo.width, this.photo.height) || this.renderer.w) {
      this.renderer.render(this.currentNails(), this.design, { ...this.opts, time: performance.now() })
    }
  }

  /** Gentle re-render loop in photo mode so glitter / cat-eye respond to tilt & drag. */
  startPhotoAnimation() {
    cancelAnimationFrame(this.raf)
    let lastTilt = ''
    const loop = () => {
      if (this.mode !== 'photo') return
      const key = this.opts.tilt.map((v) => v.toFixed(3)).join(',')
      if (key !== lastTilt || this.dirty) {
        lastTilt = key
        this.dirty = false
        this.renderer.render(this.currentNails(), this.design, { ...this.opts, time: performance.now() })
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  // ------------------------------------------------------------ outputs
  /** JPEG of the current view (photo mode: full res; live: current frame) */
  capture(design = this.design, quality = 0.9, extra = {}) {
    if (this.mode === 'photo') {
      this.renderer.upload(this.photo, this.photo.width, this.photo.height)
      const url = this.renderer.capture(this.currentNails(), design, { ...this.opts, ...extra, time: performance.now() }, 'image/jpeg', quality)
      if (design !== this.design || extra.showOriginal !== undefined) this.renderPhoto() // restore the live view
      return url
    }
    return this.renderer.capture(this.lastLiveNails || [], design, { ...this.opts, ...extra, time: performance.now() }, 'image/jpeg', quality)
  }

  /** Small JPEG thumbnail (≤ maxSide px) for Firestore (fits the 1 MiB doc limit easily). */
  thumbnail(maxSide = 480, quality = 0.72, design = this.design) {
    const url = this.capture(design, 0.92)
    return downscaleDataUrl(url, maxSide, quality)
  }

  /** ImageData of the still photo (for skin analysis / calibration). */
  photoImageData(maxSide = 900) {
    if (!this.photo) return null
    const sc = Math.min(1, maxSide / Math.max(this.photo.width, this.photo.height))
    const c = document.createElement('canvas')
    c.width = Math.round(this.photo.width * sc)
    c.height = Math.round(this.photo.height * sc)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(this.photo, 0, 0, c.width, c.height)
    return { img: ctx.getImageData(0, 0, c.width, c.height), scale: sc }
  }

  photoSize() {
    return this.photo ? { width: this.photo.width, height: this.photo.height } : null
  }

  dispose() {
    this.stop()
    this.renderer.dispose()
  }
}

export function downscaleDataUrl(url, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => {
      const sc = Math.min(1, maxSide / Math.max(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.round(im.width * sc)
      c.height = Math.round(im.height * sc)
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    im.onerror = reject
    im.src = url
  })
}
