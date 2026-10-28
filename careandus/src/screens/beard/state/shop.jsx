// The salon as LIHYA's screens read it: useShop() in the chair (staff), usePublicShop() for
// the customer at home. Built on the shared useApp() and the public salon document.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../hooks/useApp.jsx';
import { getPublicSalon } from '../../../services/salons.js';
import { DEFAULT_GUARD_CHART } from '../lib/guards.js';
import { LIMITS } from '../lib/config.js';
import { loadPublicStyles } from './data.js';

const PublicShopContext = createContext(null);

/**
 * Beard settings over the salon settings. guardChart and growthMmPerDay are not salon fields
 * yet (see BUILD notes in the report): the defaults apply until the salon carries them.
 */
export function beardSettings(settings) {
  const s = settings || {};
  const chart = Array.isArray(s.guardChart) && s.guardChart.length ? s.guardChart : DEFAULT_GUARD_CHART;
  const growth = Number(s.beardGrowthMmPerDay);
  return {
    ...s,
    aiPreview: false,
    guardChart: chart,
    growthMmPerDay: Number.isFinite(growth) && growth > 0 ? growth : LIMITS.growthMmPerDayDefault,
  };
}

/** Chair: { shopId, shop, settings, me, role }. */
export function useShop() {
  const app = useApp();
  const salon = app.salon;
  return useMemo(
    () => ({
      shopId: app.salonId,
      shop: salon ? { id: app.salonId, name: salon.name || '', nameAr: salon.nameAr || '', whatsapp: salon.whatsapp || '', logoUrl: null } : null,
      settings: beardSettings(app.settings),
      me: app.me || null,
      role: app.role,
    }),
    [app.salonId, salon, app.settings, app.me, app.role],
  );
}

/** Customer at home: the public salon card and its visible beard styles. */
export function PublicShopProvider({ shopId, children }) {
  const [state, setState] = useState({ shopId: null, info: null, styles: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    Promise.all([getPublicSalon(shopId).catch(() => null), loadPublicStyles(shopId)])
      .then(([info, styles]) => {
        if (!alive) return;
        const on = info && info.tryAtHome !== false && (!info.sections || info.sections.beard === true);
        setState({ shopId, info: info ? { ...info, tryAtHome: Boolean(on) } : null, styles, loading: false, error: null });
      })
      .catch((error) => alive && setState({ shopId, info: null, styles: [], loading: false, error }));
    return () => {
      alive = false;
    };
  }, [shopId]);
  const value = useMemo(() => ({ ...state, shopId, loading: state.loading || state.shopId !== shopId }), [state, shopId]);
  return <PublicShopContext.Provider value={value}>{children}</PublicShopContext.Provider>;
}

/** { shopId, info: { name, nameAr, tryAtHome, whatsapp }, styles, loading, error } */
export function usePublicShop() {
  const ctx = useContext(PublicShopContext);
  if (!ctx) throw new Error('usePublicShop must be used inside <PublicShopProvider>');
  return ctx;
}
