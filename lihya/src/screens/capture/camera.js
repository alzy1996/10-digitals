// Front camera for the guided capture (S04). The live preview may be mirrored with
// CSS; the stream itself and every captured frame stay un-mirrored.

import { PREF_KEYS } from '../../config/app.js';

/** getUserMedia constraints: front camera, ideal 1280 x 720, no audio. */
export const CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
});

/** True when this browser can open a camera at all (secure context + mediaDevices). */
export function cameraSupported() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/** Opens the front camera. Rejects with the browser's DOMException. */
export async function openCamera() {
  if (!cameraSupported()) {
    const err = new Error('Camera API not available');
    err.name = 'NotSupportedError';
    throw err;
  }
  try {
    return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (err) {
    // Some desktop webcams reject the size hints: try once more with the camera alone.
    if (err && (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError')) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } });
    }
    throw err;
  }
}

/** Stops every track of a stream (the camera light goes off). */
export function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // already stopped
    }
  }
}

/** Maps a getUserMedia error to a screen state: 'denied' | 'none' | 'busy' | 'error'. */
export function cameraErrorKind(err) {
  const name = (err && err.name) || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'NotSupportedError' ||
    name === 'TypeError'
  ) {
    return 'none';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'error';
}

/** Rough platform for the permission instructions: 'ios' | 'android' | 'desktop'. */
export function platformKind(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return 'desktop';
  const ua = String(nav.userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS reports a desktop Safari user agent; touch points give it away.
  if (/Macintosh/i.test(ua) && Number(nav.maxTouchPoints) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Mirror preference of this device (default on: the preview reads like a mirror). */
export function readMirrorPref() {
  try {
    const v = localStorage.getItem(PREF_KEYS.mirror);
    return v === null ? true : v !== '0';
  } catch {
    return true;
  }
}

export function writeMirrorPref(on) {
  try {
    localStorage.setItem(PREF_KEYS.mirror, on ? '1' : '0');
  } catch {
    // private mode: the preference is not kept
  }
}

/**
 * Freezes the current video frame (un-mirrored, full resolution) into a JPEG Blob,
 * for the hand shutter. Resolves null when the video has no frame yet.
 */
export function grabFrame(video) {
  return new Promise((resolve) => {
    const w = video && video.videoWidth;
    const h = video && video.videoHeight;
    if (!w || !h) {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    try {
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          resolve(blob || null);
        },
        'image/jpeg',
        0.95,
      );
    } catch {
      resolve(null);
    }
  });
}

/** Rectangle a w x h frame takes in a W x H box with object-fit 'cover' or 'contain'. */
export function fitRect(W, H, w, h, fit = 'cover') {
  if (!W || !H || !w || !h) return { x: 0, y: 0, w: W || 0, h: H || 0 };
  const s = fit === 'contain' ? Math.min(W / w, H / h) : Math.max(W / w, H / h);
  const dw = w * s;
  const dh = h * s;
  return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
}

/**
 * 'cover' fills the stage; when that would hide more than a quarter of the frame (a
 * landscape webcam on a portrait phone layout, for example) the whole frame is shown
 * ('contain') so the face is never cropped away and the guide stays truthful.
 */
export function chooseFit(W, H, w, h) {
  if (!W || !H || !w || !h) return 'cover';
  const box = W / H;
  const frame = w / h;
  const visible = frame > box ? box / frame : frame / box;
  return visible < 0.75 ? 'contain' : 'cover';
}
