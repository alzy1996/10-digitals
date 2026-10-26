// App-wide state: auth user, active salon, my staff record, live catalog, swatches, products.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuth } from '../services/auth.js';
import { watchSalon, watchUser, setLastSalon } from '../services/salons.js';
import { watchMe } from '../services/staff.js';
import { watchCatalog, mergeCatalog } from '../services/catalog.js';
import { watchLines, watchAllSwatches } from '../services/swatches.js';
import { watchProducts } from '../services/products.js';
import { onWriteError } from '../services/base.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useT } from '../lib/i18n/useT.js';

const Ctx = createContext(null);
const SALON_KEY = 'khusla.salonId';

function readSalonPref() {
  try {
    return localStorage.getItem(SALON_KEY) || null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  const { t } = useT();
  const snack = useSnackbar();
  const [user, setUser] = useState(undefined);
  const [userDoc, setUserDoc] = useState(undefined); // undefined = loading, null = none
  const [salonId, setSalonIdState] = useState(readSalonPref);
  const [salon, setSalon] = useState(null);
  const [me, setMe] = useState(undefined);
  const [catalog, setCatalog] = useState(() => mergeCatalog({}));
  const [lines, setLines] = useState([]);
  const [swatchesById, setSwatches] = useState({});
  const [products, setProducts] = useState([]);

  useEffect(() => onAuth((u) => setUser(u || null)), []);

  useEffect(
    () =>
      onWriteError((e) => {
        snack.show({ message: e.code === 'permission-denied' ? t('error.permission') : t('error.save'), tone: 'risk' });
      }),
    [snack, t],
  );

  const staffUser = user && !user.isAnonymous ? user : null;

  useEffect(() => {
    if (!staffUser) {
      setUserDoc(null);
      return undefined;
    }
    return watchUser(setUserDoc);
  }, [staffUser]);

  useEffect(() => {
    if (!salonId && userDoc?.lastSalonId) setSalonIdState(userDoc.lastSalonId);
  }, [userDoc, salonId]);

  useEffect(() => {
    if (!staffUser || !salonId) {
      setSalon(null);
      setMe(staffUser ? null : undefined);
      return undefined;
    }
    setMe(undefined);
    const a = watchSalon(salonId, setSalon);
    const b = watchMe(salonId, setMe);
    return () => {
      a();
      b();
    };
  }, [staffUser, salonId]);

  const isStaff = Boolean(me && me.active);

  useEffect(() => {
    if (!isStaff) return undefined;
    const a = watchCatalog(salonId, setCatalog);
    const b = watchLines(salonId, setLines);
    const c = watchProducts(salonId, setProducts);
    return () => {
      a();
      b();
      c();
    };
  }, [isStaff, salonId]);

  useEffect(() => {
    if (!isStaff || !lines.length) {
      setSwatches({});
      return undefined;
    }
    return watchAllSwatches(salonId, lines, setSwatches);
  }, [isStaff, salonId, lines]);

  /** Level -> Lab from the salon's scanned natural-tone swatches (median per level). */
  const scannedLevels = useMemo(() => {
    const byLevel = {};
    for (const sw of Object.values(swatchesById)) {
      if (!sw.labMeasured || !['natural', 'beige', 'mocha'].includes(sw.tone)) continue;
      (byLevel[sw.level] ||= []).push(sw.labMeasured);
    }
    const out = {};
    for (const [lv, labs] of Object.entries(byLevel)) {
      const s = [...labs].sort((a, b) => a[0] - b[0]);
      out[lv] = s[Math.floor(s.length / 2)];
    }
    return Object.keys(out).length >= 6 ? out : null; // need enough levels to replace the starting swatches
  }, [swatchesById]);

  const value = useMemo(
    () => ({
      user,
      loading: user === undefined || (staffUser && salonId && me === undefined),
      staffUser,
      userDoc,
      salonId,
      salon,
      me,
      role: me?.role || null,
      isStaff,
      isOwner: me?.role === 'owner',
      isManager: me?.role === 'owner' || me?.role === 'manager',
      settings: salon?.settings || {},
      catalog,
      lines,
      swatchesById,
      scannedLevels,
      products,
      setSalonId: (id) => {
        setSalonIdState(id);
        try {
          if (id) localStorage.setItem(SALON_KEY, id);
          else localStorage.removeItem(SALON_KEY);
        } catch {
          // per-device convenience only
        }
        if (id && staffUser) setLastSalon(id);
      },
    }),
    [user, staffUser, userDoc, salonId, salon, me, isStaff, catalog, lines, swatchesById, scannedLevels, products],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
