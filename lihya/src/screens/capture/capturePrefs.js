// Capture choices kept for the rest of this working session on this device (PRD 8.1:
// tap-free, under 90 s per customer), in sessionStorage: they last while the app stays
// open and reset when it is closed. UI preferences only, never customer data.
//
//   capture mode   Quick (front photo only) stays selected for the next customers once
//                  chosen. Without a choice, the chair starts with the 4 photos and
//                  Try at home with Quick.
//   white card     the optional white-paper step shows once per session, after the
//                  front photo of the first customer; after it was shown (used or
//                  skipped) the next customers go straight on. The White card chip on
//                  the capture screen brings it back for one customer.
//
// Every access is wrapped: a private window or blocked storage just means no memory.

import { PREF_KEYS } from '../../config/app.js';

const MODES = Object.freeze(['full', 'quick']);
const MODE_KEY = (PREF_KEYS && PREF_KEYS.captureMode) || 'lihya.pref.captureMode';
const CARD_KEY = (PREF_KEYS && PREF_KEYS.whiteCard) || 'lihya.pref.whiteCardShown';

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

/** Capture mode chosen earlier in this session for 'chair' or 'home', else null. */
export function readCaptureModePref(mode) {
  const v = read(`${MODE_KEY}.${mode === 'home' ? 'home' : 'chair'}`);
  return MODES.includes(v) ? v : null;
}

export function writeCaptureModePref(mode, captureMode) {
  if (!MODES.includes(captureMode)) return;
  write(`${MODE_KEY}.${mode === 'home' ? 'home' : 'chair'}`, captureMode);
}

/** The capture mode a fresh capture starts in: the session's choice, else the mode's default. */
export function initialCaptureMode(mode) {
  return readCaptureModePref(mode) || (mode === 'home' ? 'quick' : 'full');
}

/** True once the white-card step was shown in this session. */
export function whiteCardShown() {
  return read(CARD_KEY) === '1';
}

export function markWhiteCardShown() {
  write(CARD_KEY, '1');
}
