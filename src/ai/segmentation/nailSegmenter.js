// ISOLATED AI MODULE — OPTIONAL upgrade slot for a trained nail segmentation model (TFLite).
// OFF by default. To enable later:
//   1. Train a 2-class (background / nail) segmentation model and export TFLite with metadata
//      (see README → "Upgrade: trained nail model").
//   2. Put it in public/models/ (e.g. public/models/nail_segmenter.tflite)
//   3. Set VITE_NAIL_SEGMENTER_URL=/models/nail_segmenter.tflite in .env.local and rebuild.
// When enabled, each landmark nail is snapped to the model's mask (center, angle, width, length).
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { withBase } from '../../lib/base'

const RAW_URL = import.meta.env.VITE_NAIL_SEGMENTER_URL || ''
const URL_ = !RAW_URL ? '' : /^https?:\/\//.test(RAW_URL) ? RAW_URL : withBase(RAW_URL)
let segPromise = null

export function segmenterEnabled() {
  return !!URL_
}

export function loadNailSegmenter() {
  if (!URL_) return Promise.resolve(null)
  if (!segPromise) {
    segPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm').catch(() =>
        FilesetResolver.forVisionTasks(withBase('mediapipe/wasm')),
      )
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: URL_, delegate: 'GPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      })
    })().catch((e) => {
      console.warn('[nailSegmenter] disabled:', e)
      return null
    })
  }
  return segPromise
}

/** Returns {data: Float32Array, width, height} nail-confidence mask, or null. */
export async function segmentNails(source) {
  const seg = await loadNailSegmenter()
  if (!seg) return null
  const res = seg.segment(source)
  try {
    const masks = res.confidenceMasks || []
    const m = masks[masks.length > 1 ? 1 : 0] // class 1 = nail (class 0 = background)
    if (!m) return null
    return { data: new Float32Array(m.getAsFloat32Array()), width: m.width, height: m.height }
  } finally {
    res.close?.()
  }
}

/**
 * Snap landmark nails to the mask using weighted image moments inside each nail's search box.
 * Coordinates: nails in full-frame px (W×H); mask is resampled by ratio.
 */
export function refineWithMask(nails, mask, W, H) {
  if (!mask) return nails
  const sx = mask.width / W
  const sy = mask.height / H
  return nails.map((n) => {
    const vx = -n.uy
    const vy = n.ux
    let m0 = 0
    let mx = 0
    let my = 0
    const pts = []
    const halfL = n.len * 0.85
    const halfW = n.wid * 0.85
    const steps = 24
    for (let i = -steps; i <= steps; i++) {
      for (let j = -steps; j <= steps; j++) {
        const a = (i / steps) * halfL
        const b = (j / steps) * halfW
        const x = n.cx + n.ux * a + vx * b
        const y = n.cy + n.uy * a + vy * b
        const xi = (x * sx) | 0
        const yi = (y * sy) | 0
        if (xi < 0 || yi < 0 || xi >= mask.width || yi >= mask.height) continue
        const w = mask.data[yi * mask.width + xi]
        if (w < 0.5) continue
        m0 += w
        mx += w * x
        my += w * y
        pts.push([x, y, w])
      }
    }
    if (m0 < 8) return n
    const cx = mx / m0
    const cy = my / m0
    let cxx = 0
    let cyy = 0
    let cxy = 0
    for (const [x, y, w] of pts) {
      cxx += w * (x - cx) * (x - cx)
      cyy += w * (y - cy) * (y - cy)
      cxy += w * (x - cx) * (y - cy)
    }
    cxx /= m0
    cyy /= m0
    cxy /= m0
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
    let ux = Math.cos(theta)
    let uy = Math.sin(theta)
    if (ux * n.ux + uy * n.uy < 0) {
      ux = -ux
      uy = -uy
    }
    const tr = cxx + cyy
    const det = cxx * cyy - cxy * cxy
    const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    const l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    // uniform ellipse: variance along axis = (len/2)^2 / 4  → len = 4·sqrt(var)
    const len = 4 * Math.sqrt(Math.max(l1, 1))
    const wid = 4 * Math.sqrt(Math.max(l2, 1))
    return { ...n, cx, cy, ux, uy, len, wid, fit: 1 }
  })
}
