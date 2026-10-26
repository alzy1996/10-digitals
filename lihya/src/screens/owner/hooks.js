// Hooks shared by the owner screens.

import { useEffect, useRef, useState } from 'react';
import { dayKey } from '../../lib/time.js';
import { watchDemoPresence } from '../../services/clients.js';
import { useLive } from '../../hooks/useLive.js';
import { workerUrl } from './util.js';

/** Today's Muscat dayKey, rolling over at Muscat midnight while the screen stays open. */
export function useToday() {
  const [key, setKey] = useState(() => dayKey());
  useEffect(() => {
    const id = setInterval(() => {
      const now = dayKey();
      setKey((k) => (k === now ? k : now));
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);
  return key;
}

/**
 * The AI Worker's own usage for this shop (fetchAiQuota: GET /quota with the ID token and,
 * when App Check is set up, the App Check token, so it keeps working once Firestore enforces
 * App Check). The Worker counts per UTC day, so its count resets at 04:00 Muscat, exactly
 * like the cap it enforces. Only asked when the Worker URL is configured, AI preview is on
 * and the phone is online.
 * Returns { quota, pending }: `quota` is null when the Worker could not be asked (the
 * dashboard then falls back to its own estimate); `pending` is true while the answer to the
 * current request is on its way. `refreshKey` (for example today's aiRenders) asks again
 * when it changes, keeping the last answer meanwhile.
 * The AI facade is imported on demand: the owner screens that use these hooks must not
 * download the rendering bundle (three.js) when no Worker is asked.
 */
export function useAiQuota({ shopId, enabled, online, refreshKey }) {
  const active = Boolean(workerUrl() && enabled && online && shopId);
  const key = active ? `${shopId}|${refreshKey}` : null;
  // The last answer and the request it answered (pending = no answer for this request yet).
  const [answer, setAnswer] = useState({ key: null, shopId: null, quota: null });

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const asked = `${shopId}|${refreshKey}`;
    import('../../ai/index.js')
      .then(({ fetchAiQuota }) => fetchAiQuota(shopId, { signal: ctrl ? ctrl.signal : undefined }))
      .catch((err) => {
        console.warn('AI quota not available', err);
        return null;
      })
      .then((quota) => {
        if (alive) setAnswer({ key: asked, shopId, quota: quota || null });
      });
    return () => {
      alive = false;
      if (ctrl) ctrl.abort();
    };
  }, [active, shopId, refreshKey]);

  if (!active) return { quota: null, pending: false };
  return { quota: answer.shopId === shopId ? answer.quota : null, pending: answer.key !== key };
}

/**
 * Whether any demo client or consultation is left (two one-document live queries),
 * or a demo consultation in `extra`.
 */
export function useDemoPresence(shopId, extra = []) {
  const live = useLive((cb, onError) => (shopId ? watchDemoPresence(shopId, cb, onError) : null), [shopId]);
  const demoExtra = (Array.isArray(extra) ? extra : []).some((c) => c && c.demo === true);
  return { loading: live.loading, present: live.data === true || demoExtra };
}

/**
 * Local copy of a numeric setting that is saved after the person stops tapping
 * (one audited write per adjustment instead of one per tap). Follows the server value
 * whenever nothing is waiting to be saved; flushes a pending save on unmount.
 */
export function useDebouncedSetting(serverValue, commit, delay = 800) {
  const [value, setValue] = useState(serverValue);
  const pending = useRef(null);
  const timer = useRef(0);
  const commitRef = useRef(commit);
  const serverRef = useRef(serverValue);
  commitRef.current = commit;
  serverRef.current = serverValue;

  useEffect(() => {
    if (pending.current === null) setValue(serverValue);
  }, [serverValue]);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const v = pending.current;
    pending.current = null;
    // commit returns false when the value was refused: show the saved value again.
    if (commitRef.current(v) === false) setValue(serverRef.current);
  };

  useEffect(() => () => flush(), []);

  const change = (v) => {
    setValue(v);
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  return [value, change];
}
