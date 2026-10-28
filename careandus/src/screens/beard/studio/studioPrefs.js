// Studio choices kept for the rest of this working session on this device, in
// sessionStorage (they last while the app stays open, like the capture choices):
//
//   preview   Live or Photo, as the barber last picked it. A device too slow for Live
//             AR stays in Photo for the next styles and customers instead of starting
//             Live again each time the Studio opens.
//   low fps   once the barber took Photo Studio from the slow-preview message, the
//             message is not offered again in this session.
//
// UI preferences only, never customer data. Every access is wrapped: a private window or
// blocked storage just means no memory.

import { PREF_KEYS } from '../lib/config.js';

const PREVIEWS = Object.freeze(['live', 'photo']);
const PREVIEW_KEY = (PREF_KEYS && PREF_KEYS.studioPreview) || 'lihya.pref.studioPreview';
const LOW_FPS_KEY = (PREF_KEYS && PREF_KEYS.studioLowFps) || 'lihya.pref.studioLowFps';

function store() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function read(key) {
  try {
    const s = store();
    return s ? s.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    const s = store();
    if (s) s.setItem(key, value);
  } catch {
    // storage blocked: the choice is not kept
  }
}

/** 'live' | 'photo' picked earlier in this session, else null. */
export function readStudioPreview() {
  const v = read(PREVIEW_KEY);
  return PREVIEWS.includes(v) ? v : null;
}

export function writeStudioPreview(preview) {
  if (PREVIEWS.includes(preview)) write(PREVIEW_KEY, preview);
}

/** The preview the Studio opens in: the session's choice, else Live in Mirror Mode and Photo on a phone. */
export function initialStudioPreview(mirrorMode) {
  return readStudioPreview() || (mirrorMode ? 'live' : 'photo');
}

/** True once Photo Studio was taken from the slow-preview message in this session. */
export function lowFpsDeclined() {
  return read(LOW_FPS_KEY) === '1';
}

export function markLowFpsDeclined() {
  write(LOW_FPS_KEY, '1');
}
