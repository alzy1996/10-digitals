import { useSyncExternalStore } from 'react';

// Mirror Mode (PRD 3.10, 9.7): a tablet or TV in landscape at the station. The canvas
// takes 70 % on the start side for the customer, the controls 30 % for the barber.
const QUERY = '(min-width: 768px) and (orientation: landscape)';

function subscribe(cb) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }
  mq.addListener(cb);
  return () => mq.removeListener(cb);
}

function snapshot() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** True on md+ screens in landscape (Mirror Mode). */
export function useMirrorMode() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export default useMirrorMode;
