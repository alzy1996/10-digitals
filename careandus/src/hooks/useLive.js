import { useEffect, useState } from 'react';

/**
 * Subscribe to a live Firestore listener. `subscribe(cb)` must return an unsubscribe function.
 * Pass null to skip. Returns [value, loading].
 */
export function useLive(subscribe, deps, initial = null) {
  const [state, setState] = useState({ value: initial, loading: Boolean(subscribe) });
  useEffect(() => {
    if (!subscribe) {
      setState({ value: initial, loading: false });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    const unsub = subscribe((v, extra) => setState({ value: v, loading: false, extra }));
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [state.value, state.loading, state.extra];
}
