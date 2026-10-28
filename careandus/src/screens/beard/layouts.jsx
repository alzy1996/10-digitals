// Route layouts: one beard session per mount (chair or home). Leaving the beard screens
// unmounts the layout and with it every photo of this session.
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useApp } from '../../hooks/useApp.jsx';
import { useSession as useSharedSession } from '../../hooks/useSession.jsx';
import { SessionProvider } from './state/SessionContext.jsx';
import { PublicShopProvider } from './state/shop.jsx';

/** Staff chair flow under /beard (the shared InSession guard runs first). */
export function ChairLayout() {
  const app = useApp();
  const shared = useSharedSession();
  // The visit id keys the session: a new client (new visit) never sees the last one's photos.
  return (
    <SessionProvider key={shared.visitId || shared.startedAt || 'chair'} mode="chair" shopId={app.salonId}>
      <Outlet />
    </SessionProvider>
  );
}

/** Customer Try at home under /t/:salonId/beard (public, no sign-in). */
export function HomeLayout() {
  const { salonId } = useParams();
  return (
    <PublicShopProvider shopId={salonId}>
      <SessionProvider key={salonId} mode="home" shopId={salonId}>
        <Outlet />
      </SessionProvider>
    </PublicShopProvider>
  );
}

/** Home screens after the landing need the customer's session (started by Start on the landing). */
export function HomeGuard() {
  const { salonId } = useParams();
  const shared = useSharedSession();
  if (!shared.active || shared.mode !== 'home' || shared.salonId !== salonId) {
    return <Navigate to={`/t/${encodeURIComponent(salonId)}/beard`} replace />;
  }
  return <Outlet />;
}
