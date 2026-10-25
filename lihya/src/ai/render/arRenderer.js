// Live AR (PRD 7.1): the designed beard on the customer's face in the camera feed.
//
// One three.js WebGL2 renderer on the given canvas (iOS limits WebGL contexts, so
// the app keeps one for AR and one shared offscreen renderer for Photo Studio and
// the thumbnails). Per video frame:
//   - face landmarks (every frame), lightly smoothed against jitter;
//   - the video as the background quad, mirrored by default like a mirror;
//   - the face mesh with the procedural beard texture (alpha blended, no depth test
//     against the video), and the "beard shell" extruded below the jaw for beards
//     longer than the face mesh (length = mm x px per mm from the iris), hidden
//     where the segmenter sees the neck or clothes in front of it;
//   - segmentation every 3rd frame (only while a shell is shown), the light estimate
//     every 12th frame;
//   - an FPS meter; under 15 fps for 2 s it emits 'low-fps' so the screen can offer
//     Photo Studio.
// Textures are generated off the main thread (textureJobs.js) and only when the look
// changes: a quick 384 px pass first, then the full 1024 px beard.
//
// setMode('outline'): AR cannot erase real hair, so when the look goes shorter the
// screen switches to Outline mode: the target edge lines on the real beard with green
// (keep) and red (remove) zone tints instead of the beard. In beard mode, zones that
// must get shorter are tinted red under the new beard automatically.

import * as THREE from 'three';
import { createBeardScene } from './glScene.js';
import { FACE_TEX_SIZE, FAST_TEX_SIZE, hasBeard } from './beardTextures.js';
import { needsOutline } from './inpaint.js';
import { textureJob, cachedTextures } from './textureJobs.js';
import { growthAt, DEFAULT_GROWTH_MM_PER_DAY } from './timeline.js';
import { frameMmPerPx, estimateLight } from './frame.js';
import { clamp, isNum, makeCanvas, nowMs } from './util.js';
import { detectVideo, getLandmarker } from '../models/landmarker.js';
import { segmentVideo, segmenterReliable } from '../models/segmenter.js';
import { modelStatus } from '../models/status.js';

/** Below this frame rate for LOW_FPS_MS the renderer emits 'low-fps'. */
export const LOW_FPS = 15;
export const LOW_FPS_MS = 2000;
/** Frame rate that re-arms the low-fps warning. */
const RECOVER_FPS = 20;
/** Segmentation runs on every SEG_EVERY-th processed frame. */
export const SEG_EVERY = 3;
const LIGHT_EVERY = 12;
/** Longest side of the drawing buffer (px). */
const MAX_BUFFER_SIDE = 1280;
/** Frames without a face before the beard is hidden. */
const LOST_FRAMES = 6;

/** The look to draw for a timeline day (null: the designed look). */
function lookFor(params, profile, days, rate) {
  if (!isNum(days)) return { params, coverage: null };
  const g = growthAt(params, profile, days, rate);
  return { params: g.params, coverage: g.coverage };
}

/** Cover-fit crop of a vw x vh frame for a bw x bh buffer, in frame pixels. */
export function coverView(vw, vh, bw, bh) {
  const a = bw / bh;
  if (vw / vh > a) {
    const w = vh * a;
    return { x: (vw - w) / 2, y: 0, w, h: vh };
  }
  const h = vw / a;
  return { x: 0, y: (vh - h) / 2, w: vw, h };
}

/**
 * Creates the live AR renderer.
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas the visible canvas (its CSS size sets the view)
 * @param {HTMLVideoElement} opts.video the playing camera video (never mirrored itself)
 * @param {boolean} [opts.mirror=true] show like a mirror
 * @param {number} [opts.growthMmPerDay=0.4] growth rate for the timeline
 * @returns {{ setLook(params, profile): void, setMode(mode: 'beard'|'outline'): void,
 *   setTimelineDays(days: number|null): void, setMirror(on: boolean): void, start(): void,
 *   stop(): void, dispose(): void, snapshot(): HTMLCanvasElement|null,
 *   onFps(cb: (fps: number, info: { low: boolean, frameMs: number }) => void): () => void,
 *   on(event: 'fps'|'low-fps'|'face'|'busy'|'error', cb: Function): () => void,
 *   getState(): object }}
 */
export function createArRenderer({ canvas, video, mirror = true, growthMmPerDay = DEFAULT_GROWTH_MM_PER_DAY } = {}) {
  if (!canvas) throw new Error('createArRenderer needs a canvas');
  if (!video) throw new Error('createArRenderer needs a video element');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
  } catch (err) {
    err.code = 'webgl';
    throw err;
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  const beard = createBeardScene({ background: true });

  const videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.NoColorSpace;
  videoTex.generateMipmaps = true;
  videoTex.minFilter = THREE.LinearMipmapLinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  videoTex.wrapS = THREE.ClampToEdgeWrapping;
  videoTex.wrapT = THREE.ClampToEdgeWrapping;

  let mirrorOn = mirror !== false;
  beard.setBackground(videoTex, mirrorOn);
  beard.setPhoto(videoTex);

  const listeners = { fps: new Set(), 'low-fps': new Set(), face: new Set(), busy: new Set(), error: new Set() };
  const emit = (event, ...args) => {
    for (const cb of listeners[event]) {
      try {
        cb(...args);
      } catch (err) {
        console.error(err);
      }
    }
  };

  let running = false;
  let disposed = false;
  let frameHandle = 0;
  let frameKind = null;
  let lastVideoTime = -1;
  let lastProcessed = 0;
  let frameNo = 0;

  let smoothed = null;
  let mmPerPx = NaN;
  let light = null;
  let missing = LOST_FRAMES;
  let faceFound = false;
  let seg = null;

  let params = null;
  let profile = null;
  let mode = 'beard';
  let timelineDays = null;
  let beardTex = null;
  let overlayTex = null;

  let bufW = 0;
  let bufH = 0;

  /* ---------------------------- look textures ---------------------------- */

  let plan = null;
  let planToken = 0;
  let pumping = false;

  async function pump() {
    if (pumping) return;
    pumping = true;
    emit('busy', true);
    try {
      while (plan && plan.steps.length && !disposed) {
        const step = plan.steps.shift();
        try {
          await step(plan.token);
        } catch (err) {
          console.warn('AR look update failed', err);
          emit('error', err);
        }
      }
    } finally {
      pumping = false;
      emit('busy', false);
    }
  }

  function applyBeard(tex) {
    beardTex = tex;
    beard.setBeard(tex);
  }
  function applyOverlay(tex) {
    overlayTex = tex;
    beard.setOverlay(tex);
  }

  function refreshLook() {
    if (disposed) return;
    const token = ++planToken;
    const steps = [];
    if (!params) {
      applyBeard(null);
      applyOverlay(null);
      plan = null;
      return;
    }
    const look = lookFor(params, profile, timelineDays, growthMmPerDay);

    // Beard (hidden in Outline mode, so not drawn there).
    if (mode !== 'outline' && hasBeard(look.params)) {
      const full = { size: FACE_TEX_SIZE, coverage: look.coverage };
      const hit = cachedTextures('beard', look.params, profile, full);
      if (hit) applyBeard(hit);
      else {
        const quick = { size: FAST_TEX_SIZE, quality: 'fast', coverage: look.coverage };
        const quickHit = cachedTextures('beard', look.params, profile, quick);
        if (quickHit) applyBeard(quickHit);
        else {
          steps.push(async (tok) => {
            const tex = await textureJob('beard', look.params, profile, quick);
            if (tok === planToken && !disposed) applyBeard(tex);
          });
        }
        steps.push(async (tok) => {
          const tex = await textureJob('beard', look.params, profile, full);
          if (tok === planToken && !disposed) applyBeard(tex);
        });
      }
    } else if (mode !== 'outline') {
      applyBeard(null);
    }

    // Outline overlay: the whole Outline in Outline mode, else only the zones that
    // must get shorter.
    let ovParams = null;
    let ovOpts = null;
    if (mode === 'outline') {
      ovParams = params;
      ovOpts = { size: FACE_TEX_SIZE };
    } else {
      const no = needsOutline(look.params, profile);
      if (no.needed) {
        ovParams = look.params;
        ovOpts = { size: FACE_TEX_SIZE, zones: no.zones };
      }
    }
    if (!ovParams) applyOverlay(null);
    else {
      const hit = cachedTextures('outline', ovParams, profile, ovOpts);
      if (hit) applyOverlay(hit);
      else {
        steps.push(async (tok) => {
          const tex = await textureJob('outline', ovParams, profile, ovOpts);
          if (tok === planToken && !disposed) applyOverlay(tex);
        });
      }
    }
    plan = { token, steps };
    if (steps.length) pump();
  }

  /* ------------------------------- frames -------------------------------- */

  function smoothLandmarks(raw) {
    if (!smoothed || smoothed.length !== raw.length) {
      smoothed = raw.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
      return smoothed;
    }
    // Follow fast head moves at once; damp the sub-pixel jitter when still.
    const fw = Math.hypot(raw[454].x - raw[234].x, raw[454].y - raw[234].y) || 0.1;
    let d = 0;
    for (const i of [1, 10, 152, 234, 454]) d += Math.hypot(raw[i].x - smoothed[i].x, raw[i].y - smoothed[i].y);
    const motion = d / 5 / fw;
    const a = clamp(0.4 + motion * 30, 0.4, 1);
    for (let i = 0; i < raw.length; i++) {
      const s = smoothed[i];
      const r = raw[i];
      s.x += (r.x - s.x) * a;
      s.y += (r.y - s.y) * a;
      s.z += ((r.z || 0) - s.z) * a;
    }
    return smoothed;
  }

  function resize(vw, vh) {
    const cw = canvas.clientWidth || vw;
    const ch = canvas.clientHeight || vh;
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? Math.min(2, window.devicePixelRatio) : 1;
    let bw = Math.max(1, Math.round(cw * dpr));
    let bh = Math.max(1, Math.round(ch * dpr));
    const cap = Math.min(MAX_BUFFER_SIDE, Math.max(960, vw, vh));
    const k = Math.min(1, cap / Math.max(bw, bh));
    bw = Math.max(1, Math.round(bw * k));
    bh = Math.max(1, Math.round(bh * k));
    if (bw !== bufW || bh !== bufH) {
      bufW = bw;
      bufH = bh;
      renderer.setSize(bw, bh, false);
    }
  }

  function shellShown() {
    return !!((beardTex && beardTex.shell && mode !== 'outline') || (overlayTex && overlayTex.shell));
  }

  function draw({ width, height, view, mirrorFrame }) {
    beard.setBackground(videoTex, mirrorFrame);
    beard.update({
      landmarks: faceFound ? smoothed : null,
      width,
      height,
      mirror: mirrorFrame,
      mmPerPx,
      light,
      view,
      mode,
    });
    renderer.render(beard.scene, beard.camera);
  }

  // FPS meter.
  const frameTimes = [];
  let lastReport = 0;
  let lowSince = 0;
  let lowEmitted = false;
  let fps = 0;
  let frameMs = 0;
  // Per-phase cost (ms, smoothed) for diagnostics: detect, segment, light, draw.
  const phase = { detect: 0, segment: 0, light: 0, draw: 0 };
  const lap = (name, t0) => {
    const ms = nowMs() - t0;
    phase[name] = phase[name] ? phase[name] * 0.85 + ms * 0.15 : ms;
    return nowMs();
  };

  function meter(now, workMs) {
    // A long gap (tab hidden, camera paused) restarts the meter instead of reading as
    // a slow frame.
    if (frameTimes.length && now - frameTimes[frameTimes.length - 1] > 5000) {
      frameTimes.length = 0;
      lowSince = 0;
    }
    frameTimes.push(now);
    if (frameTimes.length > 90) frameTimes.shift();
    frameMs = frameMs ? frameMs * 0.9 + workMs * 0.1 : workMs;
    // Frames of the last 1.5 s, and always at least the last interval, so even a
    // very slow device gets a rate.
    let i0 = frameTimes.length - 1;
    while (i0 > 0 && now - frameTimes[i0 - 1] <= 1500) i0 -= 1;
    if (i0 === frameTimes.length - 1 && i0 > 0) i0 -= 1;
    const n = frameTimes.length - 1 - i0;
    const span = now - frameTimes[i0];
    if (!(n > 0 && span > 0)) return;
    fps = (n * 1000) / span;
    const low = fps < LOW_FPS;
    if (low) {
      if (!lowSince) lowSince = frameTimes[i0];
      if (!lowEmitted && now - lowSince >= LOW_FPS_MS) {
        lowEmitted = true;
        emit('low-fps', { fps, frameMs });
      }
    } else {
      lowSince = 0;
      if (fps >= RECOVER_FPS) lowEmitted = false;
    }
    if (now - lastReport < 500) return;
    lastReport = now;
    emit('fps', Math.round(fps * 10) / 10, { low, frameMs: Math.round(frameMs * 10) / 10 });
  }

  function processFrame() {
    if (!running || disposed) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return;
    const now = nowMs();
    const t = video.currentTime;
    if (frameKind !== 'video' && t === lastVideoTime && now - lastProcessed < 34) return;
    lastVideoTime = t;
    lastProcessed = now;
    frameNo += 1;

    let t0 = now;
    const det = detectVideo(video, now);
    t0 = lap('detect', t0);
    const wasFound = faceFound;
    if (det && det.landmarks && det.landmarks.length >= 468) {
      smoothLandmarks(det.landmarks);
      missing = 0;
      faceFound = true;
      const m = frameMmPerPx(smoothed, vw, vh);
      if (Number.isFinite(m) && m > 0) mmPerPx = Number.isFinite(mmPerPx) ? mmPerPx + (m - mmPerPx) * 0.15 : m;
      if (!light || frameNo % LIGHT_EVERY === 0) {
        const refSkinL = profile && profile.skin && Array.isArray(profile.skin.lab) ? profile.skin.lab[0] : null;
        light = estimateLight(video, smoothed, vw, vh, { refSkinL });
        t0 = lap('light', t0);
      }
      if (shellShown() && frameNo % SEG_EVERY === 0 && modelStatus().segmenter === 'ready' && segmenterReliable()) {
        const s = segmentVideo(video, now);
        if (s) {
          seg = s;
          beard.setSegmentation(seg);
        }
        t0 = lap('segment', t0);
      }
    } else {
      missing += 1;
      if (missing >= LOST_FRAMES) faceFound = false;
    }
    if (wasFound !== faceFound) emit('face', faceFound);

    resize(vw, vh);
    const view = coverView(vw, vh, bufW, bufH);
    draw({ width: vw, height: vh, view, mirrorFrame: mirrorOn });
    lap('draw', t0);
    meter(now, nowMs() - now);
  }

  function schedule() {
    if (!running || disposed) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      frameKind = 'video';
      frameHandle = video.requestVideoFrameCallback(() => {
        processFrame();
        schedule();
      });
    } else {
      frameKind = 'raf';
      frameHandle = requestAnimationFrame(() => {
        processFrame();
        schedule();
      });
    }
  }

  function cancel() {
    if (!frameHandle) return;
    if (frameKind === 'video' && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameHandle);
    else if (frameKind === 'raf') cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  }

  const onLost = (event) => {
    event.preventDefault();
    running = false;
    cancel();
    const err = new Error('WebGL context lost');
    err.code = 'contextLost';
    emit('error', err);
  };
  canvas.addEventListener('webglcontextlost', onLost, false);

  return {
    /** Sets the look (LookParams) and the customer's profile (patch map, colour, grey). */
    setLook(nextParams, nextProfile = null) {
      params = nextParams || null;
      profile = nextProfile || null;
      refreshLook();
    },
    /** 'beard' draws the designed beard; 'outline' draws the cut lines on the real beard. */
    setMode(next) {
      const m = next === 'outline' ? 'outline' : 'beard';
      if (m === mode) return;
      mode = m;
      refreshLook();
    },
    /** Growth timeline: days of growth to show (0 = today), or null for the designed look. */
    setTimelineDays(days) {
      const d = isNum(days) && days >= 0 ? days : null;
      if (d === timelineDays) return;
      timelineDays = d;
      refreshLook();
    },
    /** Mirror the view (default on). */
    setMirror(on) {
      mirrorOn = on !== false;
    },
    start() {
      if (running || disposed) return;
      running = true;
      lowSince = 0;
      frameTimes.length = 0;
      getLandmarker().catch((err) => {
        console.error('Face landmarker failed to load', err);
        emit('error', err);
      });
      schedule();
    },
    stop() {
      running = false;
      cancel();
    },
    dispose() {
      if (disposed) return;
      running = false;
      cancel();
      disposed = true;
      plan = null;
      canvas.removeEventListener('webglcontextlost', onLost, false);
      for (const set of Object.values(listeners)) set.clear();
      try {
        beard.dispose();
        videoTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      } catch (err) {
        console.warn('AR renderer dispose failed', err);
      }
    },
    /**
     * The current frame with the beard, UN-mirrored, at the video's full size (for
     * before/after and saving). Null before the first video frame.
     */
    snapshot() {
      if (disposed) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      const prevW = bufW;
      const prevH = bufH;
      renderer.setSize(vw, vh, false);
      draw({ width: vw, height: vh, view: null, mirrorFrame: false });
      const out = makeCanvas(vw, vh);
      if (out) out.getContext('2d').drawImage(canvas, 0, 0, vw, vh);
      if (prevW && prevH) {
        renderer.setSize(prevW, prevH, false);
        draw({ width: vw, height: vh, view: coverView(vw, vh, prevW, prevH), mirrorFrame: mirrorOn });
      }
      return out;
    },
    /** cb(fps, { low, frameMs }) about twice a second. Returns an unsubscribe function. */
    onFps(cb) {
      listeners.fps.add(cb);
      return () => listeners.fps.delete(cb);
    },
    /**
     * Events: 'fps' (fps, info), 'low-fps' ({ fps, frameMs }, once until it recovers),
     * 'face' (found), 'busy' (drawing a new look), 'error' (err with err.code).
     */
    on(event, cb) {
      const set = listeners[event];
      if (!set) throw new Error(`Unknown AR event ${event}`);
      set.add(cb);
      return () => set.delete(cb);
    },
    getState() {
      const timings = Object.fromEntries(Object.entries(phase).map(([k, v]) => [k, Math.round(v * 10) / 10]));
      return { running, faceFound, fps, frameMs, timings, mode, timelineDays, mirror: mirrorOn, busy: pumping, mmPerPx };
    },
  };
}
