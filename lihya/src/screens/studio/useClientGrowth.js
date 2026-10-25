import { useLive } from '../../hooks/useLive.js';
import { watchClient } from '../../services/clients.js';

/**
 * The client's learned growth rate (mm per day, PRD 4.7), or null when he has none yet
 * or the visit is a walk-in. Live from the client document; works offline from the cache.
 */
export function useClientGrowth(shopId, clientId) {
  const live = useLive((cb, onError) => (shopId && clientId ? watchClient(shopId, clientId, cb, onError) : null), [shopId, clientId]);
  const g = live.data ? Number(live.data.growthMmPerDay) : NaN;
  return Number.isFinite(g) && g > 0 ? g : null;
}

export default useClientGrowth;
