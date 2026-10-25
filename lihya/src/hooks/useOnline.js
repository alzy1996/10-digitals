import { useSyncExternalStore } from 'react';
import { pendingCount, subscribePending } from '../services/sync.js';

function subscribeOnline(cb) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function onlineNow() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/** True while the browser reports a network connection. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, onlineNow, () => true);
}

function subscribePendingWrites(cb) {
  return subscribePending(() => cb());
}

/** Number of writes saved on this phone and not yet confirmed by the server. */
export function usePendingWrites() {
  return useSyncExternalStore(subscribePendingWrites, pendingCount, () => 0);
}

export default useOnline;
