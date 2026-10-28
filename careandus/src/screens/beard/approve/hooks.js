// Small data hooks for the approval tail (AI Final Look, Cut Card, Done).

import { useMemo } from 'react';
import { useLive } from '../lib/useLive.js';
import { watchStyles } from '../state/data.js';
import { watchClient } from '../state/data.js';
import { findStyle } from '../studio/approve.js';


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
 * session's client, or null (walk-in, not loaded yet, offline without cache). Read live
 * from his client document.
 */
export function useClientRecord(shopId, client) {
  const id = client && client.id && !client.walkIn ? client.id : null;
  const live = useLive((cb, onError) => (shopId && id ? watchClient(shopId, id, cb, onError) : null), [shopId, id]);
  if (!id) return null;
  return live.data && typeof live.data === 'object' ? { id, ...live.data } : null;
}
