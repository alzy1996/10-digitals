// ISOLATED AI MODULE — "Perfect Fit": pixel-precise nail outlines with MobileSAM (Apache-2.0), on the device.
// Runs on a still photo / frozen frame: one image encoding, then one tiny decoder pass per nail, prompted with
// points from the hand landmarks (nail centre = "this", finger skin + beyond the tip = "not this").
// Models: public/models/mobilesam/{encoder,decoder}.onnx (exported by scripts/export_mobilesam.py).
// Runtime: onnxruntime-web (WASM). 8-bit MobileSAM ≈ 18 MB, downloaded once and cached.
import { withBase } from '../lib/base.js'
import { rgb8ToLab } from '../lib/color.js'
import { ORT_MODULE } from '../../shared/cdn.js'

const SAM = 1024
const MEAN = [123.675, 116.28, 103.53]
const STD = [58.395, 57.12, 57.375]
const MODEL_BASE = import.meta.env.VITE_SAM_BASE || withBase('models/mobilesam/')
const ORT_BASE = import.meta.env.VITE_ORT_BASE || withBase('ort/')

let loading = null
let backend = null

function absolute(u) {
  return new URL(u, window.location.href).href
}

async function createSessions(onProgress) {
  // WASM backend everywhere: the 8-bit model runs its MatMuls on the CPU anyway, and one 12 MB runtime is the
  // most reliable choice across iPhone / Android browsers. Multi-threaded when the page is cross-origin isolated.
  const ort = await import(/* @vite-ignore */ ORT_MODULE)
  ort.env.wasm.wasmPaths = absolute(ORT_BASE)
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
  ort.env.logLevel = 'error'
  const fetchModel = async (name, share) => {
    const res = await fetch(absolute(MODEL_BASE + name))
    if (!res.ok) throw new Error('model ' + name + ' HTTP ' + res.status)
    const total = Number(res.headers.get('content-length')) || 0
    if (!res.body || !total) return new Uint8Array(await res.arrayBuffer())
    const reader = res.body.getReader()
    const out = new Uint8Array(total)
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out.set(value, got)
      got += value.length
      onProgress?.({ stage: 'download', p: share[0] + (share[1] - share[0]) * (got / total) })
    }
    return out
  }
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }
  const encBytes = await fetchModel('encoder.onnx', [0, 0.75])
  const decBytes = await fetchModel('decoder.onnx', [0.75, 0.95])
  const encoder = await ort.InferenceSession.create(encBytes, opts)
  const decoder = await ort.InferenceSession.create(decBytes, opts)
  backend = 'wasm' + (ort.env.wasm.numThreads > 1 ? '-mt' : '')
  return { ort, encoder, decoder }
}

/** Load once (≈ 15–25 MB the first time, then cached by the service worker). */
export function loadSam(onProgress) {
  if (!loading) {
    loading = createSessions(onProgress)
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}

export function samBackend() {
  return backend
}


/**
 * @param source   HTMLCanvasElement with the full photo (W×H)
 * @param nails    landmark/Smart-Fit nails in photo px [{key, finger, cx, cy, ux, uy, len, wid, alpha}]
 * @returns { nails: updated nails (with maskId), mask: {data: Uint8Array RG, width, height}, fitted, backend, ms }
 */
export async function samPerfectFit(source, nails, { onProgress, maskMax = 1280 } = {}) {
  const t0 = performance.now()
  const { ort, encoder, decoder } = await loadSam(onProgress)
  const W = source.width
  const H = source.height
  const todo = nails.filter((n) => n.alpha > 0.3 && n.len > 3)
  if (!todo.length) return { nails, mask: null, fitted: 0, backend, ms: 0 }

  // ---- crop around the nails (bigger nails in the 1024 input = sharper outlines)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const n of todo) {
    const r = Math.max(n.len, n.wid) * 1.8
    x0 = Math.min(x0, n.cx - r)
    y0 = Math.min(y0, n.cy - r)
    x1 = Math.max(x1, n.cx + r)
    y1 = Math.max(y1, n.cy + r)
  }
  x0 = Math.max(0, Math.floor(x0))
  y0 = Math.max(0, Math.floor(y0))
  x1 = Math.min(W, Math.ceil(x1))
  y1 = Math.min(H, Math.ceil(y1))
  const cw = x1 - x0
  const ch = y1 - y0
  const scale = SAM / Math.max(cw, ch)
  const rw = Math.round(cw * scale)
  const rh = Math.round(ch * scale)
  const c = document.createElement('canvas')
  c.width = rw
  c.height = rh
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, x0, y0, cw, ch, 0, 0, rw, rh)
  const px = ctx.getImageData(0, 0, rw, rh).data
  const input = new Float32Array(3 * SAM * SAM) // zero padding = SAM's convention (after normalisation)
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const o = (y * rw + x) * 4
      const i = y * SAM + x
      input[i] = (px[o] - MEAN[0]) / STD[0]
      input[SAM * SAM + i] = (px[o + 1] - MEAN[1]) / STD[1]
      input[2 * SAM * SAM + i] = (px[o + 2] - MEAN[2]) / STD[2]
    }
  onProgress?.({ stage: 'encode', p: 0.96 })
  const enc = await encoder.run({ image: new ort.Tensor('float32', input, [1, 3, SAM, SAM]) })
  const embeddings = enc[encoder.outputNames[0]]

  // ---- output mask at ≤ maskMax resolution of the full photo
  const ms = Math.min(1, maskMax / Math.max(W, H))
  const MW = Math.max(1, Math.round(W * ms))
  const MH = Math.max(1, Math.round(H * ms))
  const mask = new Uint8Array(MW * MH * 2)

  const toS = (x, y) => [(x - x0) * scale, (y - y0) * scale]
  const emptyMask = new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256])
  const noMask = new ort.Tensor('float32', new Float32Array([0]), [1])
  const origSize = new ort.Tensor('float32', new Float32Array([rh, rw]), [2]) // masks come back at rw×rh
  const out = nails.map((n) => ({ ...n }))
  let fitted = 0
  let id = 0

  // photo pixels in CIELAB (for the cuticle search)
  const pctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  pctx.canvas.width = W
  pctx.canvas.height = H
  pctx.drawImage(source, 0, 0)
  const photo = pctx.getImageData(0, 0, W, H).data
  const labAt = (x, y) => {
    const xi = Math.max(0, Math.min(W - 1, Math.round(x)))
    const yi = Math.max(0, Math.min(H - 1, Math.round(y)))
    const o = (yi * W + xi) * 4
    return rgb8ToLab(photo[o], photo[o + 1], photo[o + 2])
  }

  for (const n of todo) {
    id++
    const vx = -n.uy
    const vy = n.ux
    const L = n.len
    const wd = n.wid
    const cut = [n.cx - n.ux * L * 0.5, n.cy - n.uy * L * 0.5]
    // Prompt = "this fingertip": centre point, finger skin below the cuticle = not this, and a box around the tip.
    // (On bare nails no general model separates nail from skin reliably — SAM gives a pixel-exact fingertip outline;
    //  the cuticle line is then found in the photo itself.)
    const corners = []
    for (const al of [-0.85, 1.3]) for (const ac of [-0.8, 0.8]) corners.push(toS(n.cx + n.ux * L * al + vx * wd * ac, n.cy + n.uy * L * al + vy * wd * ac))
    const pts = [
      [...toS(n.cx, n.cy), 1],
      [...toS(cut[0] - n.ux * L * 0.3, cut[1] - n.uy * L * 0.3), 0],
      [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), 2],
      [Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1])), 3],
    ]
    const coords = new Float32Array(pts.length * 2)
    const labels = new Float32Array(pts.length)
    pts.forEach((p, i) => {
      coords[i * 2] = p[0]
      coords[i * 2 + 1] = p[1]
      labels[i] = p[2]
    })
    const dec = await decoder.run({
      image_embeddings: embeddings,
      point_coords: new ort.Tensor('float32', coords, [1, pts.length, 2]),
      point_labels: new ort.Tensor('float32', labels, [1, pts.length]),
      mask_input: emptyMask,
      has_mask_input: noMask,
      orig_im_size: origSize,
    })
    onProgress?.({ stage: 'nails', p: 0.96 + 0.04 * (id / todo.length) })
    const masks = dec.masks // [1, K, rh, rw] logits, same space as the encoder input (before padding)
    const ious = dec.iou_predictions.data
    const K = masks.dims[1]
    const [pcx, pcy] = toS(n.cx, n.cy).map(Math.round)
    const area0S = (Math.PI / 4) * L * wd * scale * scale
    let best = -1
    let bestIou = -Infinity
    for (let k = 0; k < K; k++) {
      const off = k * rw * rh
      if (pcx < 0 || pcy < 0 || pcx >= rw || pcy >= rh || masks.data[off + pcy * rw + pcx] <= 0) continue
      let area = 0
      for (let i = 0; i < rw * rh; i++) if (masks.data[off + i] > 0) area++
      const ratio = area / area0S
      if (ratio < 0.6 || ratio > 5) continue
      if (ious[k] > bestIou) {
        bestIou = ious[k]
        best = k
      }
    }
    if (best < 0) continue
    const off = best * rw * rh
    const logitAt = (px, py) => {
      const [sx, sy] = toS(px, py)
      if (sx < 0 || sy < 0 || sx > rw - 1.001 || sy > rh - 1.001) return -10 // outside the crop = background
      const xi = Math.floor(sx)
      const yi = Math.floor(sy)
      const fx = sx - xi
      const fy = sy - yi
      const i = off + yi * rw + xi
      return (masks.data[i] * (1 - fx) + masks.data[i + 1] * fx) * (1 - fy) + (masks.data[i + rw] * (1 - fx) + masks.data[i + rw + 1] * fx) * fy
    }
    const P = (a, b) => [n.cx + n.ux * a + vx * b, n.cy + n.uy * a + vy * b]

    // ---- rows along the finger: silhouette extents (contiguous around the centre line) + Lab profile
    const sa = Math.max(0.5, L / 160)
    const sb = Math.max(0.5, wd / 120)
    const aStart = -0.9 * L
    const rows = Math.ceil((2.2 * L) / sa)
    const left = new Float32Array(rows).fill(NaN)
    const right = new Float32Array(rows).fill(NaN)
    const prof = []
    for (let r = 0; r < rows; r++) {
      const a = aStart + r * sa
      if (logitAt(...P(a, 0)) > 0) {
        let lo = 0
        while (lo > -1.2 * wd && logitAt(...P(a, lo - sb)) > 0) lo -= sb
        let hi = 0
        while (hi < 1.2 * wd && logitAt(...P(a, hi + sb)) > 0) hi += sb
        const inset = 0.1 * (hi - lo) // nail side folds sit ~10% inside the finger outline
        left[r] = lo + inset
        right[r] = hi - inset
      }
      const acc = [0, 0, 0]
      let cnt = 0
      for (let b = -0.2 * wd; b <= 0.2 * wd; b += sb * 2) {
        const l = labAt(...P(a, b))
        acc[0] += l[0]
        acc[1] += l[1]
        acc[2] += l[2]
        cnt++
      }
      prof.push(acc.map((v) => v / cnt))
    }
    // ---- smooth the side lines along the finger (median of 9 rows): no notches from glare / dents in the outline
    const smoothRows = (arr) => {
      // median over ±10% of the nail length, then a short moving average: kills notches, keeps the tip curve
      const med = new Float32Array(rows).fill(NaN)
      const h = Math.max(4, Math.round((0.1 * L) / sa))
      for (let r = 0; r < rows; r++) {
        if (Number.isNaN(arr[r])) continue
        const win2 = []
        for (let j = Math.max(0, r - h); j <= Math.min(rows - 1, r + h); j++) if (!Number.isNaN(arr[j])) win2.push(arr[j])
        win2.sort((x, y) => x - y)
        med[r] = win2[win2.length >> 1]
      }
      const outA = new Float32Array(rows).fill(NaN)
      const h2 = Math.max(2, Math.round((0.03 * L) / sa))
      for (let r = 0; r < rows; r++) {
        if (Number.isNaN(med[r])) continue
        let sum = 0
        let c = 0
        for (let j = Math.max(0, r - h2); j <= Math.min(rows - 1, r + h2); j++)
          if (!Number.isNaN(med[j])) {
            sum += med[j]
            c++
          }
        outA[r] = sum / c
      }
      return outA
    }
    // fingertips are convex: the side lines follow their convex envelope (fills dents left by glare spots)
    const envelope = (arr, sign) => {
      const pts = []
      for (let r = 0; r < rows; r++) if (!Number.isNaN(arr[r])) pts.push([r, sign * arr[r]])
      if (pts.length < 3) return arr
      const hull = []
      for (const p of pts) {
        while (hull.length >= 2) {
          const [o, q] = [hull[hull.length - 2], hull[hull.length - 1]]
          if ((q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0]) <= 0) hull.pop()
          else break
        }
        hull.push(p)
      }
      const outA = new Float32Array(rows).fill(NaN)
      let k = 0
      for (let r = pts[0][0]; r <= pts[pts.length - 1][0]; r++) {
        while (k < hull.length - 2 && hull[k + 1][0] < r) k++
        const [r0, v0] = hull[k]
        const [r1, v1] = hull[Math.min(k + 1, hull.length - 1)]
        const t = r1 === r0 ? 0 : (r - r0) / (r1 - r0)
        outA[r] = sign * (v0 + (v1 - v0) * Math.min(1, Math.max(0, t)))
      }
      return outA
    }
    // rows behind the prompt box fade out (SAM stops there) — they are not the finger narrowing
    for (let r = 0; r < rows; r++)
      if (aStart + r * sa < -0.78 * L) {
        left[r] = NaN
        right[r] = NaN
      }
    left.set(envelope(smoothRows(left), 1))
    right.set(envelope(smoothRows(right), -1))
    // behind its widest point the nail does not narrow again (the U-shaped cuticle does the rounding)
    let rW = -1
    let wW = 0
    for (let r = 0; r < rows; r++) {
      const a = aStart + r * sa
      if (Number.isNaN(left[r]) || a < -0.6 * L || a > 0.3 * L) continue
      if (right[r] - left[r] > wW) {
        wW = right[r] - left[r]
        rW = r
      }
    }
    for (let r = 0; r < rW; r++) {
      if (Number.isNaN(left[r])) continue
      left[r] = Math.min(left[r], left[rW])
      right[r] = Math.max(right[r], right[rW])
    }
    let lastRow = -1
    for (let r = 0; r < rows; r++) if (!Number.isNaN(left[r])) lastRow = r

    // ---- free edge: where the fingertip outline narrows, the nail ends in a smooth arc INSIDE it
    // (following the outline to its end gives a V point that overshoots the real nail)
    let rWide = -1
    let wTop = 0
    for (let r = 0; r <= lastRow; r++) {
      if (Number.isNaN(left[r]) || aStart + r * sa < -0.4 * L) continue
      const w = right[r] - left[r]
      if (w > wTop) {
        wTop = w
        rWide = r
      }
    }
    if (rWide >= 0) {
      let rCap = -1
      let rEnd = lastRow
      for (let r = rWide; r <= lastRow; r++) {
        if (Number.isNaN(left[r])) {
          rEnd = r - 1
          break
        }
        const w = right[r] - left[r]
        if (rCap < 0 && w < 0.85 * wTop) rCap = r
        if (w < 0.45 * wTop) {
          rEnd = r
          break
        }
      }
      if (rCap >= 0 && rEnd > rCap + 2) {
        const half0 = (right[rCap] - left[rCap]) / 2
        const mid0 = (right[rCap] + left[rCap]) / 2
        for (let r = rCap + 1; r < rows; r++) {
          if (r > rEnd || Number.isNaN(left[r])) {
            left[r] = NaN
            right[r] = NaN
            continue
          }
          const t = (r - rCap) / (rEnd - rCap)
          const capHalf = half0 * Math.sqrt(Math.max(0, 1 - t * t))
          const mid = mid0 + ((right[r] + left[r]) / 2 - mid0) * t
          left[r] = Math.max(left[r], mid - capHalf)
          right[r] = Math.min(right[r], mid + capHalf)
          if (right[r] - left[r] < 0.5) {
            left[r] = NaN
            right[r] = NaN
          }
        }
        lastRow = -1
        for (let r = 0; r < rows; r++) if (!Number.isNaN(left[r])) lastRow = r
      }
    }

    // ---- cuticle = strongest colour step near the landmark estimate (−0.5 L), with a soft prior
    const win = Math.max(2, Math.round((0.08 * L) / sa))
    let cutA = -0.5 * L
    let bestStep = -1
    for (let r = win; r < rows - win; r++) {
      const a = aStart + r * sa
      if (a < -0.8 * L || a > -0.25 * L) continue
      const m1 = [0, 0, 0]
      const m2 = [0, 0, 0]
      for (let j = 0; j < win; j++) for (let c = 0; c < 3; c++) {
        m1[c] += prof[r - 1 - j][c] / win
        m2[c] += prof[r + j][c] / win
      }
      const d = Math.hypot(m2[0] - m1[0], m2[1] - m1[1], m2[2] - m1[2])
      const prior = Math.exp(-(((a + 0.5 * L) / (0.18 * L)) ** 2))
      const sc = d * (0.35 + 0.65 * prior)
      if (sc > bestStep) {
        bestStep = sc
        cutA = a
      }
    }
    // SAM sometimes outlines only the shiny plate and stops short of the cuticle: carry the sides back to it
    let rFirst = -1
    for (let r = 0; r < rows; r++)
      if (!Number.isNaN(left[r])) {
        rFirst = r
        break
      }
    for (let r = rFirst - 1; r >= 0 && aStart + r * sa >= cutA - 0.06 * L; r--) {
      left[r] = left[rFirst]
      right[r] = right[rFirst]
    }
    const rowOf = (a) => Math.round((a - aStart) / sa)
    const nailAlpha = (a, b) => {
      const r = rowOf(a)
      if (r < 0 || r >= rows || Number.isNaN(left[r])) return 0
      const half = Math.max((right[r] - left[r]) / 2, 1)
      const mid = (right[r] + left[r]) / 2
      const curve = cutA + 0.16 * L * ((b - mid) / half) ** 2 // U-shaped cuticle: the sides sit further toward the tip
      const cutRamp = Math.min(1, Math.max(0, (a - curve) / 1.2 + 0.5))
      const sideRamp = Math.min(1, Math.max(0, Math.min(b - left[r], right[r] - b) / 1.0 + 0.5))
      const tipRamp = Math.min(1, Math.max(0, (aStart + lastRow * sa - a) / 1.0 + 0.5))
      // inside the smoothed outline the shape is trusted (fills holes from highlights / white free edges)
      return cutRamp * sideRamp * tipRamp
    }

    // ---- nail frame for the renderer from the real outline (axis from the landmarks)
    let aMin = Infinity
    let aMax = -Infinity
    let wMax = 0
    let bMid = 0
    let nRows = 0
    for (let r = 0; r < rows; r++) {
      const a = aStart + r * sa
      if (Number.isNaN(left[r]) || a < cutA) continue
      if (nailAlpha(a, (left[r] + right[r]) / 2) < 0.5) continue
      aMin = Math.min(aMin, a)
      aMax = Math.max(aMax, a)
      wMax = Math.max(wMax, right[r] - left[r])
      bMid += (left[r] + right[r]) / 2
      nRows++
    }
    if (!nRows || aMax - aMin < 3) continue
    bMid /= nRows
    const nn = out.find((o) => o.key === n.key)
    const centre = P((aMin + aMax) / 2, bMid)
    nn.cx = centre[0]
    nn.cy = centre[1]
    nn.len = aMax - aMin
    nn.wid = wMax
    nn.maskId = id
    nn.fit = 2
    fitted++

    // ---- paint into the full-photo mask (max-blend; id marks which nail owns each pixel)
    const ext = [P(aStart, -1.3 * wd), P(aStart, 1.3 * wd), P(aStart + rows * sa, -1.3 * wd), P(aStart + rows * sa, 1.3 * wd)]
    const mx0 = Math.max(0, Math.floor(Math.min(...ext.map((e) => e[0])) * ms) - 2)
    const mx1 = Math.min(MW - 1, Math.ceil(Math.max(...ext.map((e) => e[0])) * ms) + 2)
    const my0 = Math.max(0, Math.floor(Math.min(...ext.map((e) => e[1])) * ms) - 2)
    const my1 = Math.min(MH - 1, Math.ceil(Math.max(...ext.map((e) => e[1])) * ms) + 2)
    for (let my2 = my0; my2 <= my1; my2++)
      for (let mx2 = mx0; mx2 <= mx1; mx2++) {
        const px = (mx2 + 0.5) / ms - n.cx
        const py = (my2 + 0.5) / ms - n.cy
        const a = px * n.ux + py * n.uy
        const b = px * vx + py * vy
        const al = nailAlpha(a, b)
        if (al <= 0.01) continue
        const o = (my2 * MW + mx2) * 2
        const v = Math.round(al * 255)
        if (v >= mask[o]) {
          mask[o] = v
          mask[o + 1] = id
        }
      }
  }
  // dilate ids by 2 px so soft edge pixels (alpha 0 there) still know their nail for the shader's texelFetch
  for (let pass = 0; pass < 2; pass++) {
    const ids = new Uint8Array(MW * MH)
    for (let i = 0; i < MW * MH; i++) ids[i] = mask[i * 2 + 1]
    for (let y = 1; y < MH - 1; y++)
      for (let x = 1; x < MW - 1; x++) {
        const i = y * MW + x
        if (ids[i]) continue
        const nb = ids[i - 1] || ids[i + 1] || ids[i - MW] || ids[i + MW]
        if (nb) mask[i * 2 + 1] = nb
      }
  }
  return { nails: out, mask: { data: mask, width: MW, height: MH }, fitted, backend, ms: Math.round(performance.now() - t0) }
}
