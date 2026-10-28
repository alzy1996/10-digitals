import { useEffect, useState } from 'react';

const INITIAL = Object.freeze({ data: null, loading: true, error: null, hasPendingWrites: false, fromCache: false });

function sameDeps(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * Live data from a service watcher (Firestore onSnapshot underneath).
 *
 *   const { data, loading, error } = useLive((cb, onError) => watchShop(shopId, cb, onError), [shopId]);
 *
 * `subscribe(cb, onError)` returns an unsubscribe function, or null when there is
 * nothing to watch yet (then data is null and loading is false). Also returns
 * `hasPendingWrites` (local changes not yet on the server: "Saved on this phone,
 * will sync") and `fromCache` (shown from the offline cache).
 * When deps change, the hook reports loading until the new subscription answers,
 * so a screen never shows the previous subject's data or a false "empty".
 */
export function useLive(subscribe, deps = []) {
  const [state, setState] = useState({ ...INITIAL, deps: null });

  useEffect(() => {
    let active = true;
    let unsubscribe = null;
    const put = (next) => {
      if (active) setState({ ...next, deps });
    };
    put(INITIAL);
    try {
      unsubscribe =
        typeof subscribe === 'function'
          ? subscribe(
              (data, meta) =>
                put({
                  data: data === undefined ? null : data,
                  loading: false,
                  error: null,
                  hasPendingWrites: Boolean(meta && meta.hasPendingWrites),
                  fromCache: Boolean(meta && meta.fromCache),
                }),
              (error) => {
                if (active) setState((s) => ({ ...s, loading: false, error, deps }));
              },
            )
          : null;
    } catch (error) {
      put({ ...INITIAL, loading: false, error });
      return undefined;
    }
    if (typeof unsubscribe !== 'function') {
      put({ ...INITIAL, loading: false });
      return undefined;
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sameDeps(state.deps, deps)) return INITIAL;
  const { deps: _deps, ...rest } = state;
  return rest;
}

export default useLive;
