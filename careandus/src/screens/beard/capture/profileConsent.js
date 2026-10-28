// "Save these labels to his record?" (PRD 5.8, 10: coarse labels only, with consent).
// The profile screen asks; the Cut Card does the save with saveClientProfile, which
// logs the profile_save consent itself.
//
// The answer lives in the session when SessionContext carries it
// (keepProfileConsent / setKeepProfileConsent). Until then it is kept here, in memory
// only, keyed by shop, client and the start of this consultation, so a later visit of
// the same client asks again and a reload forgets it (nothing is saved without a fresh yes).

import { useCallback, useSyncExternalStore } from 'react';

const values = new Map();
const listeners = new Set();

function emit() {
  for (const cb of [...listeners]) cb();
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function sessionHasField(session) {
  return Boolean(session) && typeof session.setKeepProfileConsent === 'function';
}

/** Key of this consultation, or null when there is no saved client (walk-in). */
export function consentKey(session) {
  if (!session || !session.client || !session.client.id || session.client.walkIn) return null;
  const started = session.startedAt instanceof Date ? session.startedAt.getTime() : Number(session.startedAt) || 0;
  return `${session.shopId || ''}|${session.client.id}|${started}`;
}

/** true (save), false (do not save) or null (not asked yet) for the session's client. */
export function profileConsentOf(session) {
  if (sessionHasField(session)) {
    const v = session.keepProfileConsent;
    return v === true || v === false ? v : null;
  }
  const key = consentKey(session);
  if (!key || !values.has(key)) return null;
  return values.get(key);
}

/** Stores the answer (true / false / null to clear) for the session's client. */
export function setProfileConsentFor(session, value) {
  const v = value === true || value === false ? value : null;
  if (sessionHasField(session)) {
    session.setKeepProfileConsent(v);
    return;
  }
  const key = consentKey(session);
  if (!key) return;
  if (v === null) values.delete(key);
  else values.set(key, v);
  emit();
}

/** [value, setValue] for the profile screen. */
export function useProfileConsent(session) {
  const key = consentKey(session);
  const fromSession = sessionHasField(session);
  const stored = useSyncExternalStore(subscribe, () => (key && values.has(key) ? values.get(key) : null));
  const value = fromSession ? profileConsentOf(session) : stored;
  const set = useCallback((v) => setProfileConsentFor(session, v), [session]);
  return [value, set];
}
