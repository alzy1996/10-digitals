// Face crops for the Studio and Compare. The photo and its render are always shown on
// the same crop around the face, with room below the chin for the beard and the neck,
// so before / after line up exactly. Pure geometry on the shot's own landmarks
// (normalized 0..1, un-mirrored); no AI internals.

/** Display aspect (width / height) of the Studio and Compare frames, like the style cards. */
export const CROP_ASPECT = 4 / 5;

const MAX_MESH = 468;

function shotSize(shot) {
  const c = shot && shot.canvas;
  return [Number(shot && shot.width) || (c && c.width) || 0, Number(shot && shot.height) || (c && c.height) || 0];
}

/** Face box in shot pixels from the landmarks, or null without landmarks. */
export function faceBox(shot) {
  const lm = shot && Array.isArray(shot.landmarks) ? shot.landmarks : null;
  const [W, H] = shotSize(shot);
  if (!lm || lm.length < 10 || !W || !H) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < Math.min(MAX_MESH, lm.length); i++) {
    const p = lm[i];
    if (!p) continue;
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  if (!(x1 > x0) || !(y1 > y0)) return null;
  return { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H };
}

/**
 * Crop rectangle (shot pixels) around the face at the given aspect: the whole face
 * with about a third of a face height below the chin for the beard and the neck, more
 * when a long beard hangs lower (belowPx: beard below the chin, in shot pixels).
 * Without landmarks: the largest centered crop of that aspect.
 */
export function faceCrop(shot, aspect = CROP_ASPECT, { belowPx = 0 } = {}) {
  const [W, H] = shotSize(shot);
  if (!W || !H) return { x: 0, y: 0, w: 1, h: 1 };
  const fit = (w, h) => {
    const k = Math.min(1, W / w, H / h);
    return [w * k, h * k];
  };
  const box = faceBox(shot);
  if (!box) {
    const [w, h] = fit(H * aspect, H);
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  const top = box.y - box.h * 0.13;
  const below = Number.isFinite(belowPx) && belowPx > 0 ? belowPx : 0;
  const bottom = Math.max(box.y + box.h * 1.37, box.y + box.h * 1.06 + below * 1.08);
  let h = bottom - top;
  let w = h * aspect;
  if (w < box.w * 1.45) {
    w = box.w * 1.45;
    h = w / aspect;
  }
  [w, h] = fit(w, h);
  const cx = box.x + box.w / 2;
  const cy = (top + bottom) / 2;
  const x = Math.min(Math.max(0, cx - w / 2), W - w);
  const y = Math.min(Math.max(0, cy - h / 2), H - h);
  return { x, y, w, h };
}

/**
 * Beard below the chin in shot pixels for faceCrop, from the chin length (mm) and the
 * profile's scale, in 20 mm steps so the frame does not zoom while a length is dragged.
 */
export function beardBelowPx(chinMm, mmPerPx) {
  const mm = Number(chinMm);
  const k = Number(mmPerPx);
  if (!(mm > 0) || !(k > 0)) return 0;
  return (Math.ceil((0.85 * mm) / 20) * 20) / k;
}

/** The same rectangle on a canvas k times the shot size (renderStudio's maxSize). */
export function scaleRect(rect, k) {
  return { x: rect.x * k, y: rect.y * k, w: rect.w * k, h: rect.h * k };
}

/** Scale factor from a shot to a render of it (render width / shot width). */
export function renderScale(shot, canvas) {
  const [W] = shotSize(shot);
  return W && canvas && canvas.width ? canvas.width / W : 1;
}

/**
 * Draws `rect` of `source` into `target`, sizing the target's pixel buffer to the
 * crop (longest side at most maxSide). Returns false when there is nothing to draw.
 */
export function drawCrop(target, source, rect, maxSide = 1100) {
  if (!target || !source || !rect || !source.width || !source.height) return false;
  const k = Math.min(1, maxSide / Math.max(rect.w, rect.h));
  const w = Math.max(1, Math.round(rect.w * k));
  const h = Math.max(1, Math.round(rect.h * k));
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return true;
}

/** Small JPEG data URL of a canvas crop (saved look thumbnails when the photo render is not possible). */
export function cropDataUrl(source, rect, width = 240, quality = 0.85) {
  if (typeof document === 'undefined' || !source || !source.width) return null;
  const c = document.createElement('canvas');
  const k = width / rect.w;
  c.width = Math.max(16, Math.round(rect.w * k));
  c.height = Math.max(16, Math.round(rect.h * k));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  try {
    return c.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  } finally {
    c.width = 0;
    c.height = 0;
  }
}

/** Fit a box of the given aspect inside W x H: { width, height } in CSS pixels. */
export function fitBox(W, H, aspect = CROP_ASPECT) {
  if (!(W > 0) || !(H > 0)) return null;
  let width = W;
  let height = width / aspect;
  if (height > H) {
    height = H;
    width = height * aspect;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}
