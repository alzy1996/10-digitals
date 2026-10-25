// Small shared helpers for the rendering engine: math, a seeded PRNG (the same look
// must always draw the same beard), stable hashing for texture caches, value noise
// and canvas creation that works in a window, a worker or not at all (unit tests).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Mulberry32: tiny, fast, good enough for procedural strands. Returns () => [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string. */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic JSON-like key: object keys sorted, numbers rounded to 3 decimals,
 * undefined dropped. Two LookParams that render the same give the same key.
 */
export function stableKey(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableKey(value[k])}`).join(',')}}`;
  }
  return 'null';
}

/** Gaussian-ish random in [-1, 1] (sum of three uniforms). */
export function randSym(rnd) {
  return (rnd() + rnd() + rnd() - 1.5) / 1.5;
}

/**
 * Smooth 2D value noise on a lattice, seeded. Returns (x, y) => [0, 1]. x and y are in
 * lattice cells (scale them before calling).
 */
export function valueNoise2D(seed) {
  const SIZE = 256;
  const rnd = mulberry32(seed);
  const perm = new Uint16Array(SIZE * 2);
  const vals = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    perm[i] = i;
    vals[i] = rnd();
  }
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < SIZE; i++) perm[SIZE + i] = perm[i];
  const lat = (ix, iy) => vals[perm[(perm[ix & 255] + iy) & 511] & 255];
  return function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = lat(ix, iy);
    const b = lat(ix + 1, iy);
    const c = lat(ix, iy + 1);
    const d = lat(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Two-octave fractal value noise, [0, 1]. */
export function fbm2(noise, x, y) {
  return (noise(x, y) * 2 + noise(x * 2.03 + 17.1, y * 2.03 - 5.3)) / 3;
}

/**
 * A 2D canvas of the given size: OffscreenCanvas when available, else a DOM canvas,
 * else null (unit tests in Node).
 */
export function makeCanvas(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

/** A visible (DOM) canvas when possible: callers that hand canvases to screens use this. */
export function makeDomCanvas(width, height) {
  return makeCanvas(width, height);
}

/** Copies an RGBA raster { width, height, data } into a new canvas (null without canvas support). */
export function rasterToCanvas(raster) {
  const c = makeCanvas(raster.width, raster.height);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(raster.width, raster.height);
  img.data.set(raster.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Monotonic clock in ms. */
export const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
