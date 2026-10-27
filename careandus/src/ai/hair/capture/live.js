// Live guided capture loop: pose gate + quality + Private Mode blur on screen, auto-shutter.
import { detectVideo } from '../models/landmarker.js';
import { segmentVideo } from '../models/segmenter.js';
import { createHoldTimer, poseHint } from './poseGate.js';
import { exposure, qualityHint, sharpness } from './quality.js';
import { irisWidthPx, IRIS_A, IRIS_B } from '../analysis/scale.js';
import { LIN } from '../analysis/imageOps.js';

const SAMPLE_W = 320;

function cheekL(data, w, h, pts) {
  const sample = (p) => {
    let s = 0;
    let n = 0;
    const r = Math.max(2, Math.round(w * 0.015));
    for (let y = Math.round(p[1] - r); y <= Math.round(p[1] + r); y += 1) {
      for (let x = Math.round(p[0] - r); x <= Math.round(p[0] + r); x += 1) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        const Y = 0.2126 * LIN[data[i]] + 0.7152 * LIN[data[i + 1]] + 0.0722 * LIN[data[i + 2]];
        s += Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
        n += 1;
      }
    }
    return n ? s / n : 0;
  };
  return Math.abs(sample(pts[50]) - sample(pts[280]));
}

/**
 * @param {object} o
 * @param {HTMLVideoElement} o.video
 * @param {HTMLCanvasElement} o.view visible canvas (the raw video element stays hidden)
 * @param {() => string} o.getShot current shot id
 * @param {() => boolean} o.getPrivate
 * @param {(s: {hint: string|null, progress: number, face: boolean}) => void} o.onState
 * @param {(blob: Blob, meta: object) => void} o.onCapture
 */
export function createCaptureLoop({ video, view, getShot, getPrivate, onState, onCapture }) {
  let raf = 0;
  let stopped = false;
  let frame = 0;
  let lastMask = null;
  let busy = false;
  const hold = createHoldTimer();
  const sample = document.createElement('canvas');
  const sctx = sample.getContext('2d', { willReadFrequently: true });
  const vctx = view.getContext('2d');
  const maskCanvas = document.createElement('canvas');
  const mctx = maskCanvas.getContext('2d');
  // reusable canvases for the on-screen privacy blur (no per-frame allocation)
  const small = document.createElement('canvas');
  const smctx = small.getContext('2d');
  const person = document.createElement('canvas');
  const pctx = person.getContext('2d');

  function drawBlurred(vw, vh) {
    small.width = Math.max(4, Math.round(vw / 28));
    small.height = Math.max(4, Math.round(vh / 28));
    smctx.imageSmoothingQuality = 'high';
    smctx.drawImage(video, 0, 0, small.width, small.height);
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(small, 0, 0, vw, vh);
  }

  async function tick() {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (busy || video.readyState < 2) return;
    busy = true;
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (view.width !== vw) {
        view.width = vw;
        view.height = vh;
      }
      const ts = performance.now();
      frame += 1;
      const shot = getShot();
      const priv = getPrivate();
      // privacy blur: segment every 3rd frame, reuse the last mask in between
      if (priv && (frame % 3 === 1 || !lastMask)) {
        try {
          const seg = await segmentVideo(video, ts);
          lastMask = seg;
        } catch {
          lastMask = null;
        }
      }
      if (priv && lastMask) {
        drawBlurred(vw, vh);
        if (maskCanvas.width !== lastMask.width || maskCanvas.height !== lastMask.height) {
          maskCanvas.width = lastMask.width;
          maskCanvas.height = lastMask.height;
        }
        const md = mctx.createImageData(lastMask.width, lastMask.height);
        for (let i = 0; i < lastMask.labels.length; i += 1) md.data[i * 4 + 3] = lastMask.labels[i] === 0 ? 0 : 255;
        mctx.putImageData(md, 0, 0);
        if (person.width !== vw || person.height !== vh) {
          person.width = vw;
          person.height = vh;
        }
        pctx.globalCompositeOperation = 'source-over';
        pctx.clearRect(0, 0, vw, vh);
        pctx.drawImage(video, 0, 0);
        pctx.globalCompositeOperation = 'destination-in';
        pctx.imageSmoothingQuality = 'high';
        pctx.drawImage(maskCanvas, 0, 0, vw, vh);
        pctx.globalCompositeOperation = 'source-over';
        vctx.drawImage(person, 0, 0);
      } else if (priv) {
        drawBlurred(vw, vh);
      } else {
        vctx.drawImage(video, 0, 0);
      }

      if (shot === 'back') {
        onState({ hint: 'capture.backManual', progress: 0, face: false, manual: true });
        return;
      }
      const det = await detectVideo(video, ts + 1);
      if (!det) {
        hold.reset();
        onState({ hint: 'capture.noFace', progress: 0, face: false });
        return;
      }
      const pts = det.landmarks.map((p) => [p.x * vw, p.y * vh]);
      const irisPx = Math.max(irisWidthPx(pts, IRIS_A), irisWidthPx(pts, IRIS_B));
      // quality on a small sample
      const sw = SAMPLE_W;
      const sh = Math.round((vh / vw) * sw);
      sample.width = sw;
      sample.height = sh;
      sctx.drawImage(video, 0, 0, sw, sh);
      const img = sctx.getImageData(0, 0, sw, sh);
      const k = sw / vw;
      const spts = pts.map((p) => [p[0] * k, p[1] * k]);
      const xs = spts.map((p) => p[0]);
      const ys = spts.map((p) => p[1]);
      const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      const g = new Float32Array(sw * sh);
      for (let i = 0; i < sw * sh; i += 1) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
      const sharp = sharpness(g, sw, sh, rect);
      const expo = exposure(img.data, sw, rect);
      const cheekDiff = shot === 'front' ? cheekL(img.data, sw, sh, spts) : 0;
      const qHint = qualityHint({ irisPx, cheekDiff, sharp, expo });
      const pHint = poseHint(shot, det.pose);
      const hint = pHint || qHint;
      const st = hold.update(!hint, ts);
      onState({ hint, progress: st.progress, face: true, pose: det.pose, irisPx });
      if (st.fire) {
        hold.reset();
        const full = document.createElement('canvas');
        full.width = vw;
        full.height = vh;
        full.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise((r) => full.toBlob(r, 'image/jpeg', 0.92));
        onCapture(blob, { pose: det.pose, shot, irisPx, at: Date.now() });
      }
    } finally {
      busy = false;
    }
  }
  raf = requestAnimationFrame(tick);
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    /** Manual shutter (back shot, or when auto-shutter cannot settle). */
    async shoot() {
      const full = document.createElement('canvas');
      full.width = video.videoWidth;
      full.height = video.videoHeight;
      full.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((r) => full.toBlob(r, 'image/jpeg', 0.92));
      onCapture(blob, { shot: getShot(), manual: true, at: Date.now() });
    },
  };
}
