// Pure-JS rasteriser for the procedural beard: scalar fields (Float32Array) with
// anti-aliased polygon fill, separable blur and bilinear sampling, plus the strand
// painter that composites hair strands into premultiplied accumulators. No canvas
// API, so the same code runs on the main thread, in a worker and in unit tests,
// and always produces the same pixels for the same input.

import { clamp } from './util.js';

/** A scalar field of w x h cells. */
export function createField(w, h, fill = 0) {
  const data = new Float32Array(w * h);
  if (fill) data.fill(fill);
  return { w, h, data };
}

export function cloneField(f) {
  return { w: f.w, h: f.h, data: new Float32Array(f.data) };
}

const SUB = [0.125, 0.375, 0.625, 0.875];

/**
 * Fills a closed polygon (points in field cells, any winding, even-odd rule) with
 * `value`, anti-aliased (4 sub-scanlines per row, fractional span ends).
 * mode: 'max' (default) keeps the larger value, 'set' blends value over the old one
 * by coverage, 'min' keeps the smaller value (used to cut masks), 'mul' multiplies by
 * (1 - coverage * (1 - value)).
 */
export function fillPolygon(field, pts, value = 1, mode = 'max') {
  if (!pts || pts.length < 3) return;
  const { w, h, data } = field;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(h - 1, Math.ceil(maxY));
  if (y1 < y0) return;
  const cov = new Float32Array(w);
  let touchedMin = w;
  let touchedMax = -1;
  const xs = [];
  const n = pts.length;
  for (let y = y0; y <= y1; y++) {
    cov.fill(0, Math.max(0, touchedMin), touchedMax + 1);
    touchedMin = w;
    touchedMax = -1;
    for (const sub of SUB) {
      const sy = y + sub;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = pts[i][1];
        const yj = pts[j][1];
        if (yi > sy !== yj > sy) xs.push(pts[i][0] + ((sy - yi) * (pts[j][0] - pts[i][0])) / (yj - yi));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = clamp(xs[k], 0, w);
        const xb = clamp(xs[k + 1], 0, w);
        if (xb <= xa) continue;
        const ia = Math.floor(xa);
        const ib = Math.min(w - 1, Math.floor(xb));
        if (ia === ib) {
          cov[ia] += (xb - xa) * 0.25;
        } else {
          cov[ia] += (ia + 1 - xa) * 0.25;
          for (let x = ia + 1; x < ib; x++) cov[x] += 0.25;
          if (ib < w) cov[ib] += (xb - ib) * 0.25;
        }
        if (ia < touchedMin) touchedMin = ia;
        if (ib > touchedMax) touchedMax = ib;
      }
    }
    const row = y * w;
    for (let x = Math.max(0, touchedMin); x <= touchedMax; x++) {
      const c = cov[x] > 1 ? 1 : cov[x];
      if (c <= 0) continue;
      const k = row + x;
      if (mode === 'max') {
        const v = value * c;
        if (v > data[k]) data[k] = v;
      } else if (mode === 'set') {
        data[k] = data[k] + (value - data[k]) * c;
      } else if (mode === 'min') {
        const v = data[k] + (value - data[k]) * c;
        if (v < data[k]) data[k] = v;
      } else if (mode === 'mul') {
        data[k] *= 1 - c * (1 - value);
      }
    }
  }
}

/** Filled disc (anti-aliased by 4 x 4 supersampling at the rim). */
export function fillCircle(field, cx, cy, r, value = 1, mode = 'max') {
  const { w, h, data } = field;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const c = clamp(r + 0.5 - d, 0, 1);
      if (c <= 0) continue;
      const k = y * w + x;
      if (mode === 'max') {
        const v = value * c;
        if (v > data[k]) data[k] = v;
      } else if (mode === 'set') {
        data[k] = data[k] + (value - data[k]) * c;
      } else if (mode === 'min') {
        const v = data[k] + (value - data[k]) * c;
        if (v < data[k]) data[k] = v;
      } else if (mode === 'mul') {
        data[k] *= 1 - c * (1 - value);
      }
    }
  }
}

/**
 * Polygon outline of a variable-width stroke along a polyline (no caps beyond the
 * end points). widths: one number or one width per point.
 */
export function strokeOutline(pts, widths) {
  const n = pts.length;
  if (n < 2) return [];
  const wAt = (i) => (Array.isArray(widths) ? widths[i] : widths) / 2;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const hw = wAt(i);
    left.push([pts[i][0] - ty * hw, pts[i][1] + tx * hw]);
    right.push([pts[i][0] + ty * hw, pts[i][1] - tx * hw]);
  }
  return [...left, ...right.reverse()];
}

/** Fills a variable-width stroke with round ends. */
export function fillStroke(field, pts, widths, value = 1, mode = 'max') {
  if (!pts || pts.length < 2) return;
  fillPolygon(field, strokeOutline(pts, widths), value, mode);
  const w0 = Array.isArray(widths) ? widths[0] : widths;
  const w1 = Array.isArray(widths) ? widths[widths.length - 1] : widths;
  fillCircle(field, pts[0][0], pts[0][1], w0 / 2, value, mode);
  fillCircle(field, pts[pts.length - 1][0], pts[pts.length - 1][1], w1 / 2, value, mode);
}

/** One box-blur pass along x and y with integer radius r (in place, via a temp row). */
function boxPass(data, w, h, r, tmp) {
  if (r < 1) return;
  const norm = 1 / (2 * r + 1);
  // Horizontal.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += data[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[x] = acc * norm;
      const add = data[row + Math.min(w - 1, x + r + 1)];
      const sub = data[row + Math.max(0, x - r)];
      acc += add - sub;
    }
    for (let x = 0; x < w; x++) data[row + x] = tmp[x];
  }
  // Vertical.
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += data[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = acc * norm;
      const add = data[Math.min(h - 1, y + r + 1) * w + x];
      const sub = data[Math.max(0, y - r) * w + x];
      acc += add - sub;
    }
    for (let y = 0; y < h; y++) data[y * w + x] = tmp[y];
  }
}

/** One [1 2 1] / 4 pass along x and y (in place). */
function binomialPass(data, w, h, tmp) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      tmp[x] = 0.25 * data[row + Math.max(0, x - 1)] + 0.5 * data[row + x] + 0.25 * data[row + Math.min(w - 1, x + 1)];
    }
    for (let x = 0; x < w; x++) data[row + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      tmp[y] = 0.25 * data[Math.max(0, y - 1) * w + x] + 0.5 * data[y * w + x] + 0.25 * data[Math.min(h - 1, y + 1) * w + x];
    }
    for (let y = 0; y < h; y++) data[y * w + x] = tmp[y];
  }
}

/**
 * Approximate Gaussian blur with standard deviation `sigma` in cells: binomial
 * passes for small kernels, three box passes otherwise. In place; returns the field.
 */
export function blurField(field, sigma) {
  if (!(sigma > 0.45)) return field;
  const { w, h, data } = field;
  const tmp = new Float32Array(Math.max(w, h));
  if (sigma < 1.3) {
    // Small kernels: [1 2 1] / 4 passes, each adds a variance of 0.5 cell^2.
    const passes = Math.max(1, Math.round((sigma * sigma) / 0.5));
    for (let p = 0; p < passes; p++) binomialPass(data, w, h, tmp);
    return field;
  }
  // Box radius for 3 passes: sigma^2 = 3 * ((2r+1)^2 - 1) / 12.
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  boxPass(data, w, h, r, tmp);
  boxPass(data, w, h, r, tmp);
  boxPass(data, w, h, r, tmp);
  return field;
}

/** Bilinear sample at (x, y) in cell units (cell centres at +0.5), clamped. */
export function sampleField(field, x, y) {
  const { w, h, data } = field;
  const fx = clamp(x - 0.5, 0, w - 1);
  const fy = clamp(y - 0.5, 0, h - 1);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const ix1 = Math.min(w - 1, ix + 1);
  const iy1 = Math.min(h - 1, iy + 1);
  const a = data[iy * w + ix];
  const b = data[iy * w + ix1];
  const c = data[iy1 * w + ix];
  const d = data[iy1 * w + ix1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Multiplies a by b cell-wise (same size). */
export function multiplyFields(a, b) {
  const n = a.data.length;
  for (let i = 0; i < n; i++) a.data[i] *= b.data[i];
  return a;
}

/** Clamps every cell to [lo, hi]. */
export function clampField(f, lo = 0, hi = 1) {
  const d = f.data;
  for (let i = 0; i < d.length; i++) d[i] = d[i] < lo ? lo : d[i] > hi ? hi : d[i];
  return f;
}

/**
 * Strand canvas: premultiplied linear-RGB colour, coverage, and the light layer
 * (occlusion, sheen weight, tangent, and "kind": 1 for hair that hangs free of the
 * skin, 0 for hair lying on the skin), all at w x h.
 */
export function createStrandCanvas(w, h) {
  return {
    w,
    h,
    rgb: new Float32Array(w * h * 3),
    a: new Float32Array(w * h),
    occ: new Float32Array(w * h),
    sheen: new Float32Array(w * h),
    tan: new Float32Array(w * h * 2),
    kind: new Float32Array(w * h),
  };
}

/**
 * Composites a flat layer texel (premultiplied "over"): colour rgb (linear), alpha a,
 * occlusion occ, sheen, kind.
 */
export function compositeTexel(cv, i, rgb, a, occ, sheen = 0, kind = 1) {
  const inv = 1 - a;
  cv.rgb[3 * i] = rgb[0] * a + cv.rgb[3 * i] * inv;
  cv.rgb[3 * i + 1] = rgb[1] * a + cv.rgb[3 * i + 1] * inv;
  cv.rgb[3 * i + 2] = rgb[2] * a + cv.rgb[3 * i + 2] * inv;
  cv.occ[i] = occ * a + cv.occ[i] * inv;
  cv.sheen[i] = sheen * a + cv.sheen[i] * inv;
  cv.tan[2 * i] *= inv;
  cv.tan[2 * i + 1] = a + cv.tan[2 * i + 1] * inv;
  cv.kind[i] = kind * a + cv.kind[i] * inv;
  cv.a[i] = a + cv.a[i] * inv;
}

/**
 * Composites one strand (a polyline in canvas cells) with the "over" operator.
 * s: { pts: [[x, y], ...], width, alpha (root), tipAlpha, rgb: [r, g, b] linear,
 * occ (0..1 brightness from depth), sheen (0..1) }. Lines are rasterised along their
 * major axis with an exact box-filtered cross-section, so a 1-cell strand stays one
 * cell wide at any angle and each cell is touched once per segment.
 */
export function drawStrand(cv, s, clip) {
  const { w, h, rgb, a, occ, sheen, tan, kind } = cv;
  const sKind = s.kind === undefined ? 1 : s.kind;
  const pts = s.pts;
  const n = pts.length;
  if (n < 2) return;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (total <= 1e-6) return;
  const [cr, cg, cb] = s.rgb;
  const half = s.width / 2;
  let run = 0;
  for (let i = 1; i < n; i++) {
    const x0 = pts[i - 1][0];
    const y0 = pts[i - 1][1];
    const x1 = pts[i][0];
    const y1 = pts[i][1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    // Tangent stored with a consistent sign (pointing down the texture) so the
    // blending of overlapping strands never cancels it out.
    const flip = dy < 0 || (dy === 0 && dx < 0) ? -1 : 1;
    const tx = (flip * dx) / segLen;
    const ty = (flip * dy) / segLen;
    const steep = Math.abs(dy) > Math.abs(dx);
    // Iterate the major axis at cell centres; the minor-axis half thickness is
    // half / |cos(theta)| of the major axis.
    const major0 = steep ? y0 : x0;
    const major1 = steep ? y1 : x1;
    const minor0 = steep ? x0 : y0;
    const slope = steep ? dx / dy : dy / dx;
    const cosT = steep ? Math.abs(ty) : Math.abs(tx);
    const hw = half / Math.max(0.3, cosT);
    const lo = Math.min(major0, major1);
    const hi = Math.max(major0, major1);
    const mStart = Math.ceil(lo - 0.5);
    const mEnd = Math.ceil(hi - 0.5) - 1;
    for (let m = mStart; m <= mEnd; m++) {
      const mc = m + 0.5;
      const along = (mc - major0) / (major1 - major0);
      if (along < 0 || along > 1) continue;
      const t = (run + along * segLen) / total;
      const alpha = (s.alpha + (s.tipAlpha - s.alpha) * t) * (t > 0.92 ? (1 - t) / 0.08 : 1);
      if (alpha <= 0.002) continue;
      const center = minor0 + slope * (mc - major0);
      const c0 = center - hw;
      const c1 = center + hw;
      const k0 = Math.floor(c0);
      const k1 = Math.floor(c1);
      for (let k = k0; k <= k1; k++) {
        const ov = Math.min(c1, k + 1) - Math.max(c0, k);
        if (ov <= 0) continue;
        const px = steep ? k : m;
        const py = steep ? m : k;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const idx = py * w + px;
        let av = alpha * (ov > 1 ? 1 : ov);
        if (clip) av *= clip(px, py);
        if (av <= 0.002) continue;
        const inv = 1 - av;
        const i3 = idx * 3;
        rgb[i3] = cr * av + rgb[i3] * inv;
        rgb[i3 + 1] = cg * av + rgb[i3 + 1] * inv;
        rgb[i3 + 2] = cb * av + rgb[i3 + 2] * inv;
        occ[idx] = s.occ * av + occ[idx] * inv;
        sheen[idx] = s.sheen * av + sheen[idx] * inv;
        tan[2 * idx] = tx * av + tan[2 * idx] * inv;
        tan[2 * idx + 1] = ty * av + tan[2 * idx + 1] * inv;
        kind[idx] = sKind * av + kind[idx] * inv;
        a[idx] = av + a[idx] * inv;
      }
    }
    run += segLen;
  }
}
