import { Outlet, useParams } from 'react-router-dom';
import { RequireAuth } from './AuthContext.jsx';
import { ShopProvider } from './ShopContext.jsx';
import { SessionProvider } from './SessionContext.jsx';
import IdleWipeWatcher from './IdleWipeWatcher.jsx';

// Staff area: signed-in (non-anonymous) staff of this shop, chair session.
export default function ShopRoute() {
  const { shopId } = useParams();
  return (
    <RequireAuth>
      <ShopProvider shopId={shopId}>
        <SessionProvider key={shopId} mode="chair" shopId={shopId}>
          <IdleWipeWatcher />
          <Outlet />
        </SessionProvider>
      </ShopProvider>
    </RequireAuth>
  );
}
