// AI Final Look provider interface (PRD 7.10): render({ sourceJpeg, guideJpeg, prompt, seed }).
// Providers: cloudflareFlux and none. The prompt itself is fixed inside the Worker.
import { cloudflareFlux } from './cloudflareFlux.js';

export const noneProvider = {
  id: 'none',
  available: () => false,
  async render() {
    throw Object.assign(new Error('ai_unavailable'), { code: 'ai_unavailable' });
  },
  async quota() {
    return null;
  },
};

export function getProvider({ enabled, workerUrl }) {
  if (!enabled || !workerUrl) return noneProvider;
  return cloudflareFlux(workerUrl);
}

/** Head-and-shoulders crop, resized under 512 px per side (504×504), as JPEG blobs. */
export async function cropForAi(canvas, rd, size = 504) {
  const p = rd.pts;
  const faceLen = p[152][1] - (rd.hairlineY ?? p[10][1]);
  const cx = p[10][0];
  const top = Math.max(0, (rd.topY || p[10][1]) - faceLen * 0.25);
  const side = Math.min(canvas.width, canvas.height - top, faceLen * 3.2);
  const x0 = Math.max(0, Math.min(canvas.width - side, cx - side / 2));
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, x0, top, side, side, 0, 0, size, size);
  let q = 0.88;
  let blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', q));
  while (blob && blob.size > 380 * 1024 && q > 0.5) {
    q -= 0.1;
    blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', q));
  }
  return { blob, rect: { x: x0, y: top, side } };
}
