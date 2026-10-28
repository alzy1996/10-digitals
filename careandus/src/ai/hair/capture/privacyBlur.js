// Private Mode: the background is blurred on screen and in anything saved (PRD 5.2).
// The blur is a strong down/up-sample blur that works on every browser (no ctx.filter needed).

/** Person mask from multiclass labels: hair, body-skin, face-skin, clothes (and "others" accessories). */
export function personMask(labels, hairAlpha) {
  const n = labels.length;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = labels[i];
    m[i] = c === 0 ? 0 : 1;
    if (hairAlpha && hairAlpha[i] > m[i]) m[i] = hairAlpha[i];
  }
  return m;
}

/** Feather a 0..1 mask with a few box passes. */
export function feather(mask, w, h, radius = 3) {
  let src = mask;
  for (let pass = 0; pass < 2; pass += 1) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      let acc = 0;
      for (let x = -radius; x < w; x += 1) {
        const add = x + radius < w ? src[y * w + x + radius] : 0;
        const sub = x - radius - 1 >= 0 ? src[y * w + x - radius - 1] : 0;
        acc += add - sub;
        if (x >= 0) out[y * w + x] = acc / (2 * radius + 1);
      }
    }
    const out2 = new Float32Array(w * h);
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let y = -radius; y < h; y += 1) {
        const add = y + radius < h ? out[(y + radius) * w + x] : 0;
        const sub = y - radius - 1 >= 0 ? out[(y - radius - 1) * w + x] : 0;
        acc += add - sub;
        if (y >= 0) out2[y * w + x] = acc / (2 * radius + 1);
      }
    }
    src = out2;
  }
  return src;
}

/** Heavily blurred copy of a canvas source (browser). */
export function blurredCanvas(source, w, h, strength = 24) {
  const small = document.createElement('canvas');
  small.width = Math.max(4, Math.round(w / strength));
  small.height = Math.max(4, Math.round(h / strength));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(source, 0, 0, small.width, small.height);
  const mid = document.createElement('canvas');
  mid.width = Math.max(8, Math.round(w / 6));
  mid.height = Math.max(8, Math.round(h / 6));
  const mctx = mid.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, mid.width, mid.height);
  const big = document.createElement('canvas');
  big.width = w;
  big.height = h;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(mid, 0, 0, w, h);
  return big;
}

/** Composite sharp person over a blurred background. Returns new RGBA data. */
export function compositePrivate(sharp, blurred, mask) {
  const out = new Uint8ClampedArray(sharp.length);
  for (let i = 0, p = 0; p < sharp.length; i += 1, p += 4) {
    const a = mask[i];
    out[p] = sharp[p] * a + blurred[p] * (1 - a);
    out[p + 1] = sharp[p + 1] * a + blurred[p + 1] * (1 - a);
    out[p + 2] = sharp[p + 2] * a + blurred[p + 2] * (1 - a);
    out[p + 3] = 255;
  }
  return out;
}
