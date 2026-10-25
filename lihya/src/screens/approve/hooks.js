// Small data hooks for the approval tail (AI Final Look, Cut Card, Done).

import { useEffect, useMemo, useState } from 'react';
import { useLive } from '../../hooks/useLive.js';
import { watchStyles } from '../../services/styles.js';
import { searchClients, watchRecentClients } from '../../services/clients.js';
import { findStyle } from '../studio/approve.js';

const RECENT_N = 20;

/** The shop's styles (hidden ones too: an approved look may use one). [] until loaded. */
export function useShopStyles(shopId) {
  const live = useLive((cb, onError) => (shopId ? watchStyles(shopId, cb, { includeHidden: true }, onError) : null), [shopId]);
  return Array.isArray(live.data) ? live.data : [];
}

/** The style object for an id (shop list first, then the seed catalog). */
export function useStyle(shopId, styleId) {
  const styles = useShopStyles(shopId);
  return useMemo(() => findStyle(styles, styleId), [styles, styleId]);
}

/**
 * The saved client's record ({ id, displayName, phone, growthMmPerDay, ... }) for the
 * session's client, or null (walk-in, not found yet, offline without cache). The
 * consultation marked him as the latest visitor, so the recent list finds him first;
 * a name search is the fallback.
 */
export function useClientRecord(shopId, client) {
  const id = client && client.id && !client.walkIn ? client.id : null;
  const name = client && client.displayName ? client.displayName : '';
  const recent = useLive((cb, onError) => (shopId && id ? watchRecentClients(shopId, RECENT_N, cb, onError) : null), [shopId, id]);
  const fromRecent = id && Array.isArray(recent.data) ? recent.data.find((c) => c && c.id === id) || null : null;
  const [found, setFound] = useState(null);
  const needSearch = Boolean(id && name && !fromRecent && !recent.loading);

  useEffect(() => {
    if (!needSearch) return undefined;
    let alive = true;
    searchClients(shopId, name).then(
      (list) => {
        if (alive) setFound((Array.isArray(list) ? list : []).find((c) => c && c.id === id) || null);
      },
      (err) => console.warn('client record lookup failed', err),
    );
    return () => {
      alive = false;
    };
  }, [needSearch, shopId, name, id]);

  if (!id) return null;
  return fromRecent || (found && found.id === id ? found : null);
}
