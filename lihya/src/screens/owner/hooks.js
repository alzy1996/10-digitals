// Hooks shared by the owner screens.

import { useEffect, useRef, useState } from 'react';
import { dayKey } from '../../lib/time.js';
import { getIdToken } from '../../services/auth.js';
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
 * Account-wide AI preview usage from the Worker (GET /quota). Only asked when the Worker
 * URL is configured, AI preview is on and the phone is online; any failure is silent
 * (null) because the dashboard already shows the shop's own count from dailyStats.
 * `refreshKey` (for example today's aiRenders) asks again when it changes.
 */
export function useAiQuota({ shopId, enabled, online, refreshKey }) {
  const [quota, setQuota] = useState(null);
  const base = workerUrl();
  const active = Boolean(base && enabled && online && shopId);

  useEffect(() => {
    if (!active) {
      setQuota(null);
      return undefined;
    }
    let alive = true;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 8000);
    (async () => {
      try {
        const token = await getIdToken(false);
        if (!token || !alive) return;
        const res = await fetch(`${base}/quota?shopId=${encodeURIComponent(shopId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (!res.ok) throw new Error(`quota ${res.status}`);
        const body = await res.json();
        const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
        if (alive) {
          setQuota({
            usedToday: n(body.usedToday),
            cap: n(body.cap),
            accountUsed: n(body.accountUsed),
            accountCap: n(body.accountCap),
            resetsAt: typeof body.resetsAt === 'string' ? body.resetsAt : null,
          });
        }
      } catch (err) {
        if (alive && err && err.name !== 'AbortError') console.warn('AI quota not available', err);
        if (alive) setQuota(null);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      if (ctrl) ctrl.abort();
    };
  }, [active, base, shopId, refreshKey]);

  return quota;
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
