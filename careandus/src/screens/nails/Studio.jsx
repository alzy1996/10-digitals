// The nail try-on studio (from Nail Mirror): live camera or photo -> on-device hand AI -> photo-real polish.
// Used by the chair flow (staff) and by Try at home (customer). Photos and frames stay in memory only:
// nothing here writes to Firestore; the parent decides what to do with the finished design.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Button from '../../components/Button.jsx';
import Slider from '../../components/Slider.jsx';
import Chip from '../../components/Chip.jsx';
import { useSnackbar } from '../../components/Snackbar.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { TryOnEngine, webgl2Supported, LIGHT_PRESETS, DEFAULT_DESIGN, withBase, withFinger, withFinish, sampleWhite, samEnabled } from '../../ai/nails/index.js';
import { FINISH_BY_KEY } from '../../data/nails/taxonomy.js';
import { useCamera, useTilt, detectInAppBrowser, cameraSupported, loadImageFile } from './hooks.js';
import { ShadeRail, FinishRail, ShapePanel, ArtPanel, FingerPanel, CatalogGrid } from './Panels.jsx';
import { FineTune } from './FineTune.jsx';
import { AnalysisSheet } from './AnalysisSheet.jsx';
import { CompareSheet } from './CompareSheet.jsx';
import { StudioSheet, Spinner, Toggle, usePick } from './ui.jsx';
import { findSubstitute } from './lib.js';

const TABS = [
  { key: 'colors', icon: 'swatch' },
  { key: 'finish', icon: 'drop' },
  { key: 'shape', icon: 'ruler' },
  { key: 'art', icon: 'brush' },
  { key: 'fingers', icon: 'grid' },
];

const sameDesign = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param catalog        buildShades() result (salon polishes + library)
 * @param title          shown in the top bar (salon or client name)
 * @param onBack         top-left back
 * @param primary        { label, icon, onClick(design, { analysis, shot }) } the main action in the dock
 * @param initialDesign  design to start from (e.g. coming back from the Agreement)
 * @param initialUndertone undertone already known from the client profile (shared with Hair)
 * @param onDesignChange called with every design change (the parent keeps it in the session)
 * @param staff          staff in the chair (shows "new customer")
 */
export default function Studio({ catalog, title, onBack, primary, initialDesign, initialUndertone, onDesignChange, staff = false }) {
  const { t, toggle, lang } = useT();
  const pick = usePick();
  const snack = useSnackbar();
  const cam = useCamera();
  const tiltCtl = useTilt();

  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const fileRef = useRef(null);
  const [engineState, setEngineState] = useState('init'); // init | loading | ready | error | nogl
  const [status, setStatus] = useState('');
  const [view, setView] = useState('start'); // start | live | photo
  const [photoSize, setPhotoSize] = useState(null);
  const [tab, setTab] = useState('colors');
  const [activeFinger, setActiveFinger] = useState(null);
  const [design, setDesign] = useState(() => initialDesign || DEFAULT_DESIGN);
  const [sheet, setSheet] = useState(null); // catalog | ai | compare | light
  const [fineTune, setFineTune] = useState(false);
  const [ftVersion, setFtVersion] = useState(0);
  const [favorites, setFavorites] = useState([]);
  const [compareSet, setCompareSet] = useState(null);
  const [opts, setOpts] = useState({ exposure: 1, illum: [1, 1, 1], forceVisible: false, smartFit: true, perfectFit: samEnabled(), tint: LIGHT_PRESETS.salon });
  const [light, setLight] = useState('salon');
  const [substitute, setSubstitute] = useState(null);
  const [white, setWhite] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const [holdOriginal, setHoldOriginal] = useState(false);
  const [analysis, setAnalysis] = useState(initialUndertone ? { undertone: initialUndertone } : null);
  const [fit, setFit] = useState(null);
  const inApp = useMemo(() => detectInAppBrowser(), []);
  const dragTilt = useRef(null);
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(0);
  const toast = useCallback((message, tone) => snack.show({ message, tone: tone === 'error' ? 'risk' : 'neutral', duration: 3000 }), [snack]);

  // ---------------------------------------------------------------- engine lifecycle
  useEffect(() => {
    if (!webgl2Supported()) {
      setEngineState('nogl');
      return undefined;
    }
    // Created on the next tick: a dev StrictMode remount would otherwise reuse the canvas whose
    // WebGL context the first engine just lost on dispose.
    let eng = null;
    let alive = true;
    const timer = setTimeout(() => {
      try {
        eng = new TryOnEngine(canvasRef.current, { onStatus: (s) => alive && setStatus(s), onFit: (f) => alive && setFit(f) });
      } catch (e) {
        console.warn(e);
        setEngineState('nogl');
        return;
      }
      engineRef.current = eng;
      setEngineState('loading');
      eng
        .init()
        .then(() => alive && setEngineState('ready'))
        .catch((e) => {
          console.warn(e);
          if (alive) setEngineState('error');
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
      eng?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setDesign(design);
    onDesignChange?.(design);
  }, [design, engineState, onDesignChange]);

  useEffect(() => {
    engineRef.current?.setOptions({ ...opts, tilt: tiltCtl.tilt, showOriginal: holdOriginal, showEdges: fineTune });
  }, [opts, tiltCtl.tilt, holdOriginal, fineTune]);

  useEffect(() => {
    if (fit && (fit.stage === 'done' || fit.stage === 'none' || fit.stage === 'error')) {
      const id = setTimeout(() => setFit(null), fit.stage === 'done' ? 2600 : 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [fit]);

  // Photo mode: fit the picture into the space above the bottom panel
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, fineTune]);

  // ---------------------------------------------------------------- camera / photo
  const toPhotoView = useCallback(() => {
    const eng = engineRef.current;
    if (eng?.mode !== 'photo') return;
    setPhotoSize(eng.photoSize());
    setView('photo');
    cam.stop();
  }, [cam]);

  const goLive = useCallback(async () => {
    if (inApp) toast(t('nails.inapp_warning'));
    const ok = await cam.start(cam.facing);
    if (!ok) return;
    setFineTune(false);
    setView('live');
    engineRef.current?.startLive(cam.videoRef.current);
  }, [cam, inApp, t, toast]);

  useEffect(() => {
    if (view === 'live' && cam.state === 'live' && engineState === 'ready') engineRef.current?.startLive(cam.videoRef.current);
  }, [view, cam.state, cam.facing, engineState, cam.videoRef]);

  const freeze = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (await eng.freeze()) toPhotoView();
  }, [toPhotoView]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const img = await loadImageFile(f);
      cam.stop();
      const size = await engineRef.current.setPhoto(img);
      URL.revokeObjectURL(img.src);
      setPhotoSize(size);
      setView('photo');
      setFineTune(false);
    } catch {
      toast(t('nails.bad_image'), 'error');
    }
  };

  // Any sheet that froze the live camera (AI, compare) leaves us in photo mode when it closes.
  useEffect(() => {
    if (!sheet && engineRef.current?.mode === 'photo' && view === 'live') toPhotoView();
  }, [sheet, view, toPhotoView]);

  // ---------------------------------------------------------------- design actions
  const pickShade = useCallback(
    (p) => {
      setDesign((d) => (activeFinger ? withFinger(d, activeFinger, p) : withBase(d, p)));
      setSubstitute(findSubstitute(p, catalog.inventory));
    },
    [activeFinger, catalog.inventory],
  );

  const newCustomer = useCallback(() => {
    setDesign(DEFAULT_DESIGN);
    setFavorites([]);
    setAnalysis(null);
    setActiveFinger(null);
    setSubstitute(null);
    setFineTune(false);
    setSheet(null);
    engineRef.current?.stop();
    engineRef.current?.resetCalibration();
    cam.stop();
    setView('start');
    toast(t('nails.new_customer_ready'));
  }, [cam, t, toast]);
  const pickFinish = (f) => setDesign((d) => withFinish(d, f, activeFinger));
  const patchDesign = (patch) => setDesign((d) => ({ ...d, ...patch }));

  const isFav = favorites.some((f) => sameDesign(f.design, design));
  const toggleFav = () => {
    if (isFav) setFavorites((l) => l.filter((f) => !sameDesign(f.design, design)));
    else {
      setFavorites((l) => [{ id: `fav${Date.now()}`, design }, ...l].slice(0, 6));
      toast(t('nails.added_to_compare'));
    }
  };
  const favShades = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const f of favorites) {
      const id = f.design.base.polishId;
      if (seen.has(id)) continue;
      seen.add(id);
      const p = catalog.byId.get(id);
      if (p) out.push(p);
    }
    return out;
  }, [favorites, catalog.byId]);

  const openCompare = (polishes) => {
    const list = polishes ? polishes.map((p) => ({ id: p.id, design: withBase(design, p) })) : favorites.length ? favorites : [{ id: 'cur', design }];
    setCompareSet(list);
    setSheet('compare');
  };

  // ---------------------------------------------------------------- calibration (tap a white tissue)
  const onCanvasClick = (e) => {
    if (!calibrating || view !== 'photo') return;
    const eng = engineRef.current;
    const r = canvasRef.current.getBoundingClientRect();
    const ps = eng.photoSize();
    const sc = Math.min(r.width / ps.width, r.height / ps.height);
    const ox = r.left + (r.width - ps.width * sc) / 2;
    const oy = r.top + (r.height - ps.height * sc) / 2;
    const data = eng.photoImageData(900);
    const w = sampleWhite(data.img, ((e.clientX - ox) / sc) * data.scale, ((e.clientY - oy) / sc) * data.scale, 7);
    setCalibrating(false);
    if (!w || !w.ok) {
      toast(t('nails.calib_failed'));
      return;
    }
    const lum = 0.2126 * w.rgb[0] + 0.7152 * w.rgb[1] + 0.0722 * w.rgb[2];
    const illum = w.rgb.map((c) => Math.min(1.6, Math.max(0.5, c / lum)));
    setWhite(w.rgb);
    setOpts((o) => ({ ...o, illum, calibrated: true, exposure: Math.min(1.5, Math.max(0.35, lum / 0.85)) }));
    toast(t('nails.calib_ok'));
  };
  const resetCalibration = () => {
    setWhite(null);
    setOpts((o) => ({ ...o, illum: [1, 1, 1], calibrated: false, exposure: 1 }));
  };

  // drag on the photo = tilt (cat eye / glitter / chrome move)
  const onPointerDown = (e) => {
    if (view !== 'photo' || fineTune || calibrating) return;
    dragTilt.current = { x: e.clientX, y: e.clientY, t0: [...tiltCtl.tilt] };
  };
  const onPointerMove = (e) => {
    const d = dragTilt.current;
    if (!d) return;
    tiltCtl.setTilt([Math.max(-1, Math.min(1, d.t0[0] + (e.clientX - d.x) / 160)), Math.max(-1, Math.min(1, d.t0[1] + (e.clientY - d.y) / 160))]);
  };
  const onPointerUp = () => {
    dragTilt.current = null;
  };

  const runPrimary = async () => {
    const eng = engineRef.current;
    let shot = null;
    try {
      if (eng && eng.mode !== 'idle') shot = eng.capture(design, 0.85); // memory only, never uploaded
    } catch {
      shot = null;
    }
    primary.onClick(design, { analysis, shot });
  };

  const curFinish = FINISH_BY_KEY[(activeFinger && design.perFinger[activeFinger]?.finish) || design.base.finish];
  const dynamicFinish = curFinish && (curFinish.sparkle > 0 || curFinish.mode > 0);
  const current = (activeFinger && design.perFinger[activeFinger]) || design.base;

  const statusText = {
    loading_ai: t('nails.st_loading_ai'),
    no_hand: t('nails.st_no_hand'),
    no_hand_photo: t('nails.st_no_hand_photo'),
    show_back: t('nails.st_show_back'),
    analyzing: t('nails.st_analyzing'),
  }[status];

  const glass = 'bg-black/55 backdrop-blur text-white';
  const iconBtn = `press grid h-12 w-12 shrink-0 place-items-center rounded-full ${glass}`;

  return (
    <div className="fixed inset-0 z-10 overflow-hidden bg-black text-white" data-testid="nails-studio">
      <video ref={cam.videoRef} className="hidden" playsInline muted />
      <div
        dir="ltr"
        className="absolute inset-x-0 top-0"
        style={{ bottom: view === 'photo' && !fineTune ? panelH : 0 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className={`absolute inset-0 h-full w-full ${view === 'photo' ? 'object-contain' : 'object-cover'} ${view === 'start' ? 'opacity-0' : ''} ${calibrating ? 'cursor-crosshair' : ''}`}
          style={view === 'live' && cam.mirrored ? { transform: 'scaleX(-1)' } : undefined}
        />
        {fineTune && view === 'photo' ? (
          <FineTune engine={engineRef.current} canvas={canvasRef.current} photoSize={photoSize} version={ftVersion} bump={() => setFtVersion((v) => v + 1)} onDone={() => setFineTune(false)} />
        ) : null}
      </div>

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pt-[calc(8px+env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} className={iconBtn} aria-label={t('common.back')}>
          <Icon name="back" className="rtl:-scale-x-100" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-display text-[18px] drop-shadow">{title}</p>
        </div>
        {view === 'live' && cam.torch.supported ? (
          <button type="button" onClick={cam.toggleTorch} className={`${iconBtn} ${cam.torch.on ? 'text-amber-300' : ''}`} aria-label={t('nails.torch')} aria-pressed={cam.torch.on}>
            <Icon name="flash" size={22} />
          </button>
        ) : null}
        {view === 'live' ? (
          <button type="button" onClick={cam.flip} className={iconBtn} aria-label={t('nails.flip_camera')}>
            <Icon name="flip" size={22} />
          </button>
        ) : null}
        {staff && view !== 'start' ? (
          <button type="button" onClick={newCustomer} className={iconBtn} aria-label={t('nails.new_customer')}>
            <Icon name="refresh" size={22} />
          </button>
        ) : null}
        {view !== 'start' ? (
          <button type="button" onClick={() => setSheet('light')} className={iconBtn} aria-label={t('nails.light_accuracy')}>
            <Icon name="sun" size={22} />
          </button>
        ) : null}
        <button type="button" onClick={toggle} className={`press flex h-12 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold ${glass}`} aria-label={t('common.language')}>
          <Icon name="globe" size={20} />
          <span lang={lang === 'ar' ? 'en' : 'ar'}>{lang === 'ar' ? 'EN' : 'عربي'}</span>
        </button>
      </header>

      {/* status pills */}
      {view !== 'start' && statusText && !fineTune ? (
        <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center px-6" aria-live="polite">
          <span className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold ${glass}`}>
            {status === 'loading_ai' || status === 'analyzing' ? <Spinner size={16} /> : <Icon name="info" size={18} />}
            {statusText}
          </span>
        </div>
      ) : null}
      {view === 'photo' && fit && !fineTune && fit.stage !== 'none' && fit.stage !== 'error' ? (
        <div className="pointer-events-none absolute inset-x-0 top-[124px] z-20 flex justify-center px-6">
          <span className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold ${fit.stage === 'done' ? 'bg-ok text-white' : glass}`}>
            {fit.stage === 'done' ? <Icon name="check" size={16} /> : <Spinner size={15} />}
            {fit.stage === 'done' ? t('nails.fit_done', { n: fit.fitted }) : fit.stage === 'download' ? t('nails.fit_downloading', { p: Math.round(fit.p * 100) }) : t('nails.fit_working')}
          </span>
        </div>
      ) : null}
      {calibrating ? (
        <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center px-6">
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-bold text-black">
            <Icon name="drop" size={18} />
            {t('nails.calib_tap')}
          </span>
        </div>
      ) : null}
      {view !== 'start' && light !== 'salon' && !fineTune ? (
        <div className="pointer-events-none absolute top-[132px] z-20 ltr:left-3 rtl:right-3">
          <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${glass}`}>{t(`nails.light_${light}`)}</span>
        </div>
      ) : null}

      {/* side tools */}
      {view !== 'start' && !fineTune ? (
        <div className="absolute top-[132px] z-20 flex flex-col gap-2 ltr:right-3 rtl:left-3">
          <button type="button" onClick={toggleFav} className={`${iconBtn} ${isFav ? 'text-[#FF8FA8]' : ''}`} aria-label={t('nails.add_to_compare')} aria-pressed={isFav}>
            <Icon name={isFav ? 'check' : 'plus'} size={22} />
          </button>
          <button
            type="button"
            onPointerDown={() => setHoldOriginal(true)}
            onPointerUp={() => setHoldOriginal(false)}
            onPointerLeave={() => setHoldOriginal(false)}
            className={`${iconBtn} ${holdOriginal ? '!bg-white !text-black' : ''}`}
            aria-label={t('nails.hold_original')}
          >
            <Icon name="eye" size={22} />
          </button>
          {view === 'photo' ? (
            <button type="button" onClick={() => setFineTune(true)} className={iconBtn} aria-label={t('nails.adjust_nails')}>
              <Icon name="wand" size={22} />
            </button>
          ) : null}
        </div>
      ) : null}
      {view === 'photo' && dynamicFinish && !fineTune ? (
        <p className="pointer-events-none absolute inset-x-0 z-10 text-center text-[12px] font-semibold text-white/80 drop-shadow" style={{ bottom: panelH + 8 }}>
          {t('nails.drag_to_tilt')}
        </p>
      ) : null}

      {/* start screen */}
      {view === 'start' ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-y-auto px-5 pb-10 pt-24">
          <div className="relative w-full max-w-md text-center">
            <p className="eyebrow !text-white/70">{t('nails.virtual_try_on')}</p>
            <h1 className="mt-2 font-display text-[40px] leading-[1.05]">{t('nails.studio_title')}</h1>
            <p className="mx-auto mt-3 max-w-sm text-[15px] text-white/70">{t('nails.studio_sub')}</p>

            {engineState === 'nogl' ? <DarkError text={t('nails.err_webgl')} /> : null}
            {engineState === 'error' ? <DarkError text={t('nails.err_ai_load')} /> : null}
            {cam.state === 'denied' ? <DarkError text={t('nails.err_camera_denied')} /> : null}
            {cam.state === 'unsupported' || cam.state === 'error' ? <DarkError text={t('nails.err_camera')} /> : null}
            {inApp ? (
              <div className="mt-5 rounded-card border border-white/25 bg-white/10 p-4 text-start text-[14px]">
                <p className="font-bold">{t('nails.inapp_title')}</p>
                <p className="mt-1 text-white/75">{t('nails.inapp_text')}</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    toast(t('nails.link_copied'));
                  }}
                  className="press mt-3 inline-flex min-h-tap items-center gap-2 rounded-full bg-white/15 px-4 text-[14px]"
                >
                  <Icon name="share" size={18} />
                  {t('nails.copy_link')}
                </button>
              </div>
            ) : null}

            <div className="mt-7 flex flex-col gap-3">
              <button
                type="button"
                className="press flex h-16 w-full items-center justify-center gap-2 rounded-control bg-white text-[17px] font-semibold text-black disabled:opacity-50"
                onClick={goLive}
                disabled={engineState !== 'ready' || !cameraSupported()}
              >
                {engineState === 'loading' || engineState === 'init' ? <Spinner size={20} /> : <Icon name="camera" />}
                {engineState === 'loading' || engineState === 'init' ? t('nails.loading_ai_first') : t('nails.start_live')}
              </button>
              <button
                type="button"
                className="press flex h-16 w-full items-center justify-center gap-2 rounded-control bg-white/15 text-[17px] font-semibold text-white disabled:opacity-50"
                onClick={() => fileRef.current?.click()}
                disabled={engineState !== 'ready'}
                data-testid="nails-upload"
              >
                <Icon name="upload" />
                {t('nails.upload_photo')}
              </button>
            </div>
            <ul className="mt-7 grid grid-cols-2 gap-2 text-start text-[13px] text-white/75">
              {['tip_back', 'tip_light', 'tip_flat', 'tip_close'].map((k) => (
                <li key={k} className="rounded-card border border-white/10 bg-white/5 p-3">
                  {t(`nails.${k}`)}
                </li>
              ))}
            </ul>
            <p className="mt-5 flex items-center justify-center gap-1 text-[12px] text-white/55">
              <Icon name="lock" size={14} />
              {t('nails.privacy_on_device')}
            </p>
            <button type="button" onClick={() => setSheet('catalog')} className="press mt-3 min-h-tap text-[14px] font-semibold text-white/75 underline underline-offset-4">
              {t('nails.browse_catalog')}
            </button>
          </div>
        </div>
      ) : null}

      {/* bottom panel */}
      {view !== 'start' && !fineTune ? (
        <div ref={panelRef} className="absolute inset-x-0 bottom-0 z-20">
          <div className="mx-auto max-w-3xl rounded-t-card bg-black/70 px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3 backdrop-blur tablet:mb-3 tablet:rounded-card">
            {substitute ? (
              <div className="mb-2 flex items-center gap-2 rounded-card bg-white/10 p-2 text-[13px] ltr:pl-3 rtl:pr-3">
                <span className="min-w-0 flex-1">
                  <span className="font-bold text-[#FFB4A8]">{t('nails.sold_out')}</span> · {t('nails.closest_in_stock')}: <span className="font-bold">{pick(substitute.to)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    pickShade(substitute.to);
                    setSubstitute(null);
                  }}
                  className="press min-h-tap rounded-full bg-white px-4 text-[13px] font-bold text-black"
                >
                  {t('nails.try')}
                </button>
              </div>
            ) : null}
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold" data-testid="nails-current">
                  {activeFinger ? `${t(`nails.finger_${activeFinger}`)} · ` : ''}
                  {pick(current || {})}
                </p>
                <p className="truncate text-[12px] text-white/60">{[current?.brand, current?.code, pick(FINISH_BY_KEY[current?.finish] || {})].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto" role="tablist">
                {TABS.map((tb) => (
                  <button
                    key={tb.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === tb.key}
                    onClick={() => setTab(tb.key)}
                    className={`flex h-12 min-w-[48px] items-center justify-center gap-1 rounded-full px-2.5 text-[12px] font-bold ${tab === tb.key ? 'bg-white text-black' : 'bg-white/10 text-white/80'}`}
                    aria-label={t(`nails.tab_${tb.key}`)}
                  >
                    <Icon name={tb.icon} size={18} />
                    <span className="hidden tablet:inline">{t(`nails.tab_${tb.key}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[118px]">
              {tab === 'colors' ? <ShadeRail catalog={catalog} design={design} activeFinger={activeFinger} onPick={pickShade} onOpenCatalog={() => setSheet('catalog')} favorites={favShades} /> : null}
              {tab === 'finish' ? <FinishRail design={design} activeFinger={activeFinger} onPick={pickFinish} /> : null}
              {tab === 'shape' ? <ShapePanel design={design} onChange={patchDesign} /> : null}
              {tab === 'art' ? <ArtPanel design={design} onChange={patchDesign} /> : null}
              {tab === 'fingers' ? (
                <FingerPanel
                  design={design}
                  activeFinger={activeFinger}
                  setActiveFinger={(f) => {
                    setActiveFinger(f);
                    if (f) setTab('colors');
                  }}
                  onClear={() => {
                    setDesign((d) => ({ ...d, perFinger: {} }));
                    setActiveFinger(null);
                  }}
                />
              ) : null}
            </div>

            <div className="mt-2 flex items-center justify-between gap-1 border-t border-white/10 pt-3">
              <DockButton icon="upload" label={t('nails.photo')} onClick={() => fileRef.current?.click()} />
              <DockButton icon="wand" label={t('nails.ai_match')} onClick={() => setSheet('ai')} accent />
              <button
                type="button"
                onClick={view === 'live' ? freeze : goLive}
                className="press relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-white text-black"
                aria-label={view === 'live' ? t('nails.freeze') : t('nails.back_to_live')}
              >
                <Icon name="camera" size={28} />
              </button>
              <DockButton icon="compare" label={t('nails.compare')} onClick={() => openCompare()} badge={favorites.length || null} />
              <DockButton icon={primary.icon || 'check'} label={primary.label} onClick={runPrimary} primary testId="nails-primary" />
            </div>
          </div>
        </div>
      ) : null}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="nails-file" />

      {/* sheets (light surface, so the text colour is reset) */}
      <div className="text-ink">
        <StudioSheet open={sheet === 'catalog'} onClose={() => setSheet(null)} title={t('nails.catalog')}>
          <CatalogGrid
            catalog={catalog}
            selectedId={current?.polishId}
            onPick={(p) => {
              pickShade(p);
              setSheet(null);
            }}
          />
        </StudioSheet>

        <AnalysisSheet
          open={sheet === 'ai'}
          onClose={() => setSheet(null)}
          engine={engineRef.current}
          white={white}
          catalog={catalog.shades}
          initial={analysis}
          onResult={setAnalysis}
          onApplyShade={(p) => {
            setDesign((d) => withBase(d, p));
            setSheet(null);
            toPhotoView();
          }}
          onApplyShape={(shape, len) => {
            const l = { short: 0.18, medium: 0.45, long: 0.75 }[len] ?? 0.45;
            setDesign((d) => ({ ...d, shape, length: l }));
            setSheet(null);
            toPhotoView();
          }}
          onCompare={(polishes) => {
            toPhotoView();
            openCompare(polishes);
          }}
          onCalibrate={() => {
            setSheet(null);
            toPhotoView();
            setCalibrating(true);
          }}
        />

        <CompareSheet
          open={sheet === 'compare'}
          onClose={() => {
            setSheet(null);
            toPhotoView();
          }}
          engine={engineRef.current}
          variants={compareSet || []}
          onApply={(d) => {
            setDesign(d);
            setSheet(null);
          }}
          onRemove={favorites.length ? (id) => setFavorites((l) => l.filter((f) => f.id !== id)) : null}
        />

        <StudioSheet open={sheet === 'light'} onClose={() => setSheet(null)} title={t('nails.light_accuracy')}>
          <div className="flex flex-col gap-4">
            <div>
              <p className="label mb-2">{t('nails.see_it_under')}</p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(LIGHT_PRESETS).map((k) => (
                  <Chip
                    key={k}
                    selected={light === k}
                    onClick={() => {
                      setLight(k);
                      setOpts((o) => ({ ...o, tint: LIGHT_PRESETS[k] }));
                    }}
                  >
                    {t(`nails.light_${k}`)}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-ink2">{t('nails.light_hint')}</p>
            </div>
            <Slider label={t('nails.brightness_match')} value={opts.exposure} min={0.35} max={1.5} step={0.01} onChange={(v) => setOpts((o) => ({ ...o, exposure: v }))} format={(v) => `${Math.round(v * 100)}%`} />
            <div className="card p-4">
              <p className="font-semibold">{t('nails.true_color')}</p>
              <p className="mt-1 text-[13px] text-ink2">{t('nails.true_color_text')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  full={false}
                  icon="drop"
                  onClick={async () => {
                    if (view === 'live') await freeze();
                    setSheet(null);
                    setCalibrating(true);
                  }}
                >
                  {white ? t('nails.recalibrate') : t('nails.calibrate')}
                </Button>
                {white ? (
                  <Button variant="secondary" full={false} onClick={resetCalibration}>
                    {t('nails.reset')}
                  </Button>
                ) : null}
              </div>
            </div>
            <Toggle
              checked={opts.forceVisible}
              onChange={async (v) => {
                setOpts((o) => ({ ...o, forceVisible: v }));
                if (view === 'photo') {
                  engineRef.current.setOptions({ forceVisible: v });
                  await engineRef.current.redetect();
                }
              }}
              label={t('nails.always_show_nails')}
            />
            {samEnabled() ? (
              <Toggle
                checked={opts.perfectFit}
                onChange={(v) => {
                  setOpts((o) => ({ ...o, perfectFit: v }));
                  engineRef.current?.setOptions({ perfectFit: v });
                  if (v && view === 'photo') engineRef.current?.perfectFit();
                }}
                label={t('nails.perfect_fit_toggle')}
              />
            ) : null}
            <Toggle
              checked={opts.smartFit}
              onChange={async (v) => {
                setOpts((o) => ({ ...o, smartFit: v }));
                if (view === 'photo') {
                  engineRef.current.setOptions({ smartFit: v });
                  await engineRef.current.redetect();
                }
              }}
              label={t('nails.smart_fit')}
            />
            {!tiltCtl.enabled ? (
              <Button variant="secondary" onClick={tiltCtl.enable}>
                {t('nails.enable_tilt')}
              </Button>
            ) : null}
            <p className="text-[12px] text-ink2">{t('nails.accuracy_note')}</p>
          </div>
        </StudioSheet>
      </div>
    </div>
  );
}

function DockButton({ icon, label, onClick, accent = false, primary = false, badge = null, testId }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="press relative flex min-w-[56px] max-w-[84px] flex-col items-center gap-1 rounded-card px-1 py-1 text-[11px] font-bold text-white/85">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${primary ? 'bg-plum text-onplum' : accent ? 'bg-white text-black' : 'bg-white/10'}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="line-clamp-2 text-center leading-tight">{label}</span>
      {badge ? <span className="num absolute top-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF6B8B] px-1 text-[11px] text-white ltr:right-1 rtl:left-1">{badge}</span> : null}
    </button>
  );
}

function DarkError({ text }) {
  return (
    <div role="alert" className="mt-5 flex items-start gap-3 rounded-card border border-[#FF8A80] bg-[#FF8A80]/15 p-4 text-start text-[14px]">
      <Icon name="alert" className="mt-0.5 text-[#FF8A80]" size={20} />
      <span>{text}</span>
    </div>
  );
}
