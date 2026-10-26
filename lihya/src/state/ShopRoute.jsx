import { useEffect, useRef } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { RequireAuth } from './AuthContext.jsx';
import { ShopProvider, useShop } from './ShopContext.jsx';
import { SessionProvider } from './SessionContext.jsx';
import IdleWipeWatcher from './IdleWipeWatcher.jsx';
import { pruneSaved } from '../lib/idb.js';
import { LIMITS } from '../config/app.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECHECK_MS = 60 * 60 * 1000;

/** The shop's retention in days (S19), or the default when the setting is unreadable. */
export function retentionDaysOf(settings) {
  const days = Number(settings && settings.retentionDays);
  return Number.isFinite(days) && days > 0 ? Math.round(days) : LIMITS.retentionDaysDefault;
}

/**
 * Before/after photos kept on this device follow the shop's data retention (PRD 8.5):
 * pairs older than settings.retentionDays are deleted when the shop opens, once a day on
 * a chair that stays open, and after the owner changes the setting. A changed setting
 * waits out its Undo snackbar first, so an accidental tap never deletes photos.
 */
function SavedPhotoRetention() {
  const { settings } = useShop();
  const days = retentionDaysOf(settings);
  const lastRef = useRef({ at: 0, days: null });
  useEffect(() => {
    const prune = () => {
      lastRef.current = { at: Date.now(), days };
      pruneSaved(days).catch((err) => console.warn('retention: old before/after photos could not be deleted', err));
    };
    const changed = lastRef.current.days !== null && lastRef.current.days !== days;
    const first = setTimeout(prune, changed ? LIMITS.undoMs + 1000 : 0);
    const daily = setInterval(() => {
      if (Date.now() - lastRef.current.at >= DAY_MS) prune();
    }, RECHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(daily);
    };
  }, [days]);
  return null;
}

// Staff area: signed-in (non-anonymous) staff of this shop, chair session.
export default function ShopRoute() {
  const { shopId } = useParams();
  return (
    <RequireAuth>
      <ShopProvider shopId={shopId}>
        <SavedPhotoRetention />
        <SessionProvider key={shopId} mode="chair" shopId={shopId}>
          <IdleWipeWatcher />
          <Outlet />
        </SessionProvider>
      </ShopProvider>
    </RequireAuth>
  );
}
