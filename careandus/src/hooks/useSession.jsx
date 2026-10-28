// The consultation in progress. Photos and analysis live only in memory and IndexedDB on this
// device; "Next client" or the idle timer (5 min default) wipes everything (PRD 8.6).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { wipeAll } from '../lib/photoStore.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from './useApp.jsx';
import { DEFAULTS } from '../config/app.js';

const Ctx = createContext(null);

const EMPTY = {
  active: false,
  mode: 'chair',
  section: 'hair', // hair | nails | beard
  visitId: null, // shared by the services of one visit (one Agreement Card)
  done: [], // services already finished in this visit: [{ section, consultationId }]
  salonId: null,
  client: null,
  startedAt: null,
  shots: [],
  profile: null,
  history: { henna: 'none', recentColor: 'none', bleach: false, chemical: false },
  patchRequired: false,
  metallicTest: 'not-done',
  goals: { change: 'both', upkeep: 'medium', tieBack: false, visibleZone: 'all' },
  look: {
    cutId: null,
    fringeId: 'none',
    styleId: null,
    lengthCm: null,
    shadeId: null,
    shade2Id: null,
    technique: 'global',
    techniqueParams: null,
    finish: 'satin',
    lightPreset: 'daylight',
  },
  compare: [],
  consultationId: null,
  notTodayShown: 0,
  aiUses: 0,
  lookCode: null,
  analyzedAt: null,
};

export function SessionProvider({ children }) {
  const [s, setS] = useState(EMPTY);
  const heavy = useRef({ analysis: null, shortened: null, thumbs: {}, aiResult: null });
  const [heavyVersion, setHeavyVersion] = useState(0);
  const navigate = useNavigate();
  const snack = useSnackbar();
  const { t } = useT();
  const app = useApp();
  const idleMin = s.mode === 'home' ? DEFAULTS.idleWipeMin : app?.settings?.idleWipeMin || DEFAULTS.idleWipeMin;

  const wipe = useCallback(async () => {
    const h = heavy.current;
    if (h.aiResult?.url) URL.revokeObjectURL(h.aiResult.url);
    heavy.current = { analysis: null, shortened: null, thumbs: {}, aiResult: null };
    setHeavyVersion((v) => v + 1);
    setS(EMPTY);
    await wipeAll();
  }, []);

  const start = useCallback(
    async (mode = 'chair', extra = {}) => {
      await wipe();
      setS({ ...EMPTY, active: true, mode, startedAt: Date.now(), ...extra, look: { ...EMPTY.look, ...(extra.look || {}) } });
    },
    [wipe],
  );

  const patch = useCallback((p) => setS((cur) => ({ ...cur, ...(typeof p === 'function' ? p(cur) : p) })), []);
  const setLook = useCallback((p) => setS((cur) => ({ ...cur, look: { ...cur.look, ...p } })), []);

  const setAnalysis = useCallback((analysis) => {
    heavy.current.analysis = analysis;
    heavy.current.shortened = null;
    heavy.current.thumbs = {};
    setHeavyVersion((v) => v + 1);
  }, []);

  const setHeavy = useCallback((key, value) => {
    heavy.current[key] = value;
    setHeavyVersion((v) => v + 1);
  }, []);

  // idle wipe
  const timer = useRef(null);
  useEffect(() => {
    if (!s.active) return undefined;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const home = s.mode === 'home' && s.salonId ? `/t/${s.salonId}` : '/home';
        await wipe();
        snack.show({ message: t('session.wiped') });
        navigate(home);
      }, idleMin * 60 * 1000);
    };
    reset();
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer.current);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [s.active, s.mode, s.salonId, idleMin, wipe, navigate, snack, t]);

  // wipe when the app was in the background longer than the idle time (timers pause there)
  const hiddenAt = useRef(0);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else {
        const at = hiddenAt.current;
        hiddenAt.current = 0;
        if (at && Date.now() - at > idleMin * 60 * 1000 && s.active) {
          wipe();
          navigate(s.mode === 'home' && s.salonId ? `/t/${s.salonId}` : '/home');
        }
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [idleMin, s.active, s.mode, s.salonId, wipe, navigate]);

  const value = useMemo(
    () => ({
      ...s,
      heavy: heavy.current,
      heavyVersion,
      start,
      wipe,
      patch,
      setLook,
      setAnalysis,
      setHeavy,
      salonIdFor: s.mode === 'home' ? s.salonId : app?.salonId,
    }),
    [s, heavyVersion, start, wipe, patch, setLook, setAnalysis, setHeavy, app?.salonId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
