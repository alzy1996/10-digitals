import { useLive } from '../../hooks/useLive.js';
import { watchRecentClients } from '../../services/clients.js';

const RECENT = 50;

/**
 * The client's learned growth rate (mm per day, PRD 4.7), or null when he has none yet
 * or the visit is a walk-in. The client document is read from the recent clients list
 * (starting a consultation moves him to the top of it); works offline from the cache.
 */
export function useClientGrowth(shopId, clientId) {
  const live = useLive(
    (cb, onError) => (shopId && clientId ? watchRecentClients(shopId, RECENT, cb, onError) : null),
    [shopId, clientId],
  );
  const list = Array.isArray(live.data) ? live.data : [];
  const doc = clientId ? list.find((c) => c && c.id === clientId) : null;
  const g = doc ? Number(doc.growthMmPerDay) : NaN;
  return Number.isFinite(g) && g > 0 ? g : null;
}

export default useClientGrowth;
