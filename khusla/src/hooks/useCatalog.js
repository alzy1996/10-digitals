import { useApp } from './useApp.jsx';
import { useSession } from './useSession.jsx';

/** Salon catalog for staff; the public (non-hidden) catalog in Try at home. Hidden items removed. */
export function useCatalog() {
  const app = useApp();
  const session = useSession();
  const src = session.mode === 'home' && session.catalog ? session.catalog : app.catalog;
  const vis = (list) => (list || []).filter((x) => !x.hidden);
  return {
    cuts: vis(src.cuts),
    fringes: vis(src.fringes),
    styles: vis(src.styles),
    shades: vis(src.shades),
    techniques: vis(src.techniques),
    looks: vis(src.looks),
    all: src,
  };
}
