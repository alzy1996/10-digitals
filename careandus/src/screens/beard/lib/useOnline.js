import { useSyncExternalStore } from 'react';

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

/** Writes not yet confirmed by the server: the shared top bar shows the sync state, so 0 here. */
export function usePendingWrites() {
  return 0;
}

export default useOnline;
