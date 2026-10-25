// Root-distance field (PRD 5.6): geodesic distance through the hair mask from the roots
// (hair touching face-skin along the hairline and the part), normalized 0 (root) .. 1 (ends).
const HAIR_T = 0.5;

class MinHeap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  push(key, val) {
    const { k, v } = this;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const { k, v } = this;
    const topV = v[0];
    const lastK = k.pop();
    const lastV = v.pop();
    if (k.length) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return topV;
  }
  get size() {
    return this.k.length;
  }
}

/**
 * @param {Float32Array} hair alpha 0..1 (w×h)
 * @param {Uint8Array} labels multiclass labels (w×h), 3 = face-skin
 * @param {number} w
 * @param {number} h
 * @param {{eyeY:number, midX:number, topY?:number}} face
 * @returns {{dist: Float32Array, r: Float32Array, maxDist: number, seeds: number}}
 */
export function rootDistanceField(hair, labels, w, h, face) {
  const n = w * h;
  const dist = new Float32Array(n).fill(Infinity);
  const heap = new MinHeap();
  let seeds = 0;
  const isHair = (i) => hair[i] >= HAIR_T;
  // 1) hairline: hair pixels within 2 px of face-skin, above the eye line
  for (let y = 1; y < h - 1; y += 1) {
    if (y > face.eyeY) break;
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (!isHair(i)) continue;
      let touches = false;
      for (let dy = -2; dy <= 2 && !touches; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
          if (labels[yy * w + xx] === 3) {
            touches = true;
            break;
          }
        }
      }
      if (touches) {
        dist[i] = 0;
        heap.push(0, i);
        seeds += 1;
      }
    }
  }
  // 2) part line: the topmost hair pixels near the midline
  const band = Math.max(2, Math.round(w * 0.02));
  for (let x = Math.max(0, Math.round(face.midX - band)); x <= Math.min(w - 1, Math.round(face.midX + band)); x += 1) {
    for (let y = 0; y < h; y += 1) {
      const i = y * w + x;
      if (isHair(i)) {
        if (dist[i] !== 0) {
          dist[i] = 0;
          heap.push(0, i);
          seeds += 1;
        }
        break;
      }
    }
  }
  if (!seeds) {
    // fallback: the topmost hair row
    for (let y = 0; y < h && !seeds; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (isHair(i)) {
          dist[i] = 0;
          heap.push(0, i);
          seeds += 1;
        }
      }
    }
  }
  const D = Math.SQRT2;
  const nb = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, D],
    [-1, 1, D],
    [1, -1, D],
    [-1, -1, D],
  ];
  while (heap.size) {
    const i = heap.pop();
    const d = dist[i];
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy, c] of nb) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (!isHair(j)) continue;
      const nd = d + c;
      if (nd < dist[j]) {
        dist[j] = nd;
        heap.push(nd, j);
      }
    }
  }
  const finite = [];
  for (let i = 0; i < n; i += 1) if (Number.isFinite(dist[i])) finite.push(dist[i]);
  finite.sort((a, b) => a - b);
  const maxDist = finite.length ? finite[Math.floor(finite.length * 0.98)] || finite[finite.length - 1] : 1;
  const r = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    r[i] = Number.isFinite(dist[i]) ? Math.min(1, dist[i] / Math.max(1, maxDist)) : 0;
    if (!Number.isFinite(dist[i])) dist[i] = -1;
  }
  return { dist, r, maxDist, seeds };
}
