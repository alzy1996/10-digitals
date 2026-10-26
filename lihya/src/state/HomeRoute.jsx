import { Outlet, useParams } from 'react-router-dom';
import { PublicShopProvider } from './ShopContext.jsx';
import { SessionProvider } from './SessionContext.jsx';
import IdleWipeWatcher from './IdleWipeWatcher.jsx';

// Customer "Try at home": no staff access, photos stay on the phone.
export default function HomeRoute() {
  const { shopId } = useParams();
  return (
    <PublicShopProvider shopId={shopId}>
      <SessionProvider key={shopId} mode="home" shopId={shopId}>
        <IdleWipeWatcher />
        <Outlet />
      </SessionProvider>
    </PublicShopProvider>
  );
}
