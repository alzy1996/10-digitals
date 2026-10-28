// The salon's own polishes (live) merged with the reference library, for staff screens.
import { useMemo } from 'react';
import { useApp } from '../../hooks/useApp.jsx';
import { useLive } from '../../hooks/useLive.js';
import { watchPolishes } from '../../services/sections/nails.js';
import { buildShades } from './lib.js';

export function useNailCatalog() {
  const app = useApp();
  const salonId = app.isStaff ? app.salonId : null;
  const [polishes, loading] = useLive(salonId ? (cb) => watchPolishes(salonId, cb) : null, [salonId], []);
  const catalog = useMemo(() => buildShades(polishes || [], { includeLibrary: true, includeHidden: true }), [polishes]);
  return { ...catalog, polishes: polishes || [], loading };
}
