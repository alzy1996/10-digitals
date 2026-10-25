// Quick shorten inpainting. Primary: MI-GAN (Picsart AI Research, MIT) ONNX pipeline via onnxruntime-web,
// lazy-loaded from the pinned CDN and cached by the service worker. Inputs: image uint8 [1,3,H,W],
// mask uint8 [1,1,H,W] with 255 = known, 0 = hole; output "result" uint8 [1,3,H,W].
// Fallback (offline / model unavailable): on-device push-pull fill, no download.
import { MIGAN_URL, ORT_CDN, ORT_MODULE } from './cdn.js';
import { FEATURES } from '../../config/app.js';

let sessionPromise = null;
let ortRef = null;

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import(/* @vite-ignore */ ORT_MODULE);
      ort.env.wasm.wasmPaths = ORT_CDN;
      ort.env.wasm.numThreads = 1;
      ortRef = ort;
      return ort.InferenceSession.create(MIGAN_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

/**
 * @param {ImageData} img RGBA crop
 * @param {Uint8Array} hole 1 = fill, 0 = keep (same size)
 * @returns {Promise<{data: Uint8ClampedArray, method: 'migan'|'classic'}>}
 */
export async function inpaint(img, hole) {
  if (FEATURES.quickShortenModel && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    try {
      const out = await inpaintMigan(img, hole);
      return { data: out, method: 'migan' };
    } catch {
      // fall through to the classic fill
    }
  }
  return { data: pushPullFill(img, hole), method: 'classic' };
}

async function inpaintMigan(img, hole) {
  const session = await getSession();
  const ort = ortRef;
  const { width: W, height: H, data } = img;
  const n = W * H;
  const chw = new Uint8Array(3 * n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    chw[i] = data[i * 4];
    chw[n + i] = data[i * 4 + 1];
    chw[2 * n + i] = data[i * 4 + 2];
    mask[i] = hole[i] ? 0 : 255;
  }
  const feeds = {
    image: new ort.Tensor('uint8', chw, [1, 3, H, W]),
    mask: new ort.Tensor('uint8', mask, [1, 1, H, W]),
  };
  const res = await session.run(feeds);
  const outT = res.result || res[session.outputNames[0]];
  const o = outT.data;
  const out = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = o[i];
    out[i * 4 + 1] = o[n + i];
    out[i * 4 + 2] = o[2 * n + i];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Push-pull (pyramid) fill: smooth, fast, offline. */
export function pushPullFill(img, hole) {
  const { width: W, height: H, data } = img;
  const levels = [];
  let w = W;
  let h = H;
  let c = new Float32Array(W * H * 3);
  let wt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const k = hole[i] ? 0 : 1;
    wt[i] = k;
    c[i * 3] = data[i * 4] * k;
    c[i * 3 + 1] = data[i * 4 + 1] * k;
    c[i * 3 + 2] = data[i * 4 + 2] * k;
  }
  levels.push({ c, wt, w, h });
  while (w > 2 && h > 2) {
    const nw = Math.ceil(w / 2);
    const nh = Math.ceil(h / 2);
    const nc = new Float32Array(nw * nh * 3);
    const nwt = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y += 1) {
      for (let x = 0; x < nw; x += 1) {
        let sw = 0;
        const s = [0, 0, 0];
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const xx = Math.min(w - 1, 2 * x + dx);
            const yy = Math.min(h - 1, 2 * y + dy);
            const j = yy * w + xx;
            sw += wt[j];
            s[0] += c[j * 3];
            s[1] += c[j * 3 + 1];
            s[2] += c[j * 3 + 2];
          }
        }
        const k = y * nw + x;
        if (sw > 0) {
          // keep premultiplied colors normalized to weight 1
          nc[k * 3] = s[0] / sw;
          nc[k * 3 + 1] = s[1] / sw;
          nc[k * 3 + 2] = s[2] / sw;
          nwt[k] = Math.min(1, sw);
        }
      }
    }
    // level 0 colors are premultiplied; normalize them once for consistent pulling
    if (levels.length === 1) {
      for (let i = 0; i < w * h; i += 1) {
        if (wt[i] > 0) {
          c[i * 3] /= wt[i];
          c[i * 3 + 1] /= wt[i];
          c[i * 3 + 2] /= wt[i];
        }
      }
    }
    c = nc;
    wt = nwt;
    w = nw;
    h = nh;
    levels.push({ c, wt, w, h });
  }
  for (let l = levels.length - 2; l >= 0; l -= 1) {
    const fine = levels[l];
    const coarse = levels[l + 1];
    for (let y = 0; y < fine.h; y += 1) {
      for (let x = 0; x < fine.w; x += 1) {
        const i = y * fine.w + x;
        const a = fine.wt[i];
        if (a >= 1) continue;
        const cx = Math.min(coarse.w - 1, x >> 1);
        const cy = Math.min(coarse.h - 1, y >> 1);
        const j = cy * coarse.w + cx;
        for (let ch = 0; ch < 3; ch += 1) fine.c[i * 3 + ch] = fine.c[i * 3 + ch] * a + coarse.c[j * 3 + ch] * (1 - a);
        fine.wt[i] = 1;
      }
    }
  }
  const base = levels[0];
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    if (hole[i]) {
      out[i * 4] = base.c[i * 3];
      out[i * 4 + 1] = base.c[i * 3 + 1];
      out[i * 4 + 2] = base.c[i * 3 + 2];
    } else {
      out[i * 4] = data[i * 4];
      out[i * 4 + 1] = data[i * 4 + 1];
      out[i * 4 + 2] = data[i * 4 + 2];
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}
