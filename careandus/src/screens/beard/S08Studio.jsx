// S08 Studio (PRD 7.1-7.4, 8.1 step 6, 8.2 step 3, 9.7): the chosen style on his face,
// Live AR or the Photo Studio (front, or the 45 degree shots), with Outline mode when the
// look goes shorter, a before / after split (press and hold shows the original) and the
// jawline readout. The controls sit in a non-modal bottom sheet, one group at a time
// (length, lines, color, growth); on a tablet in landscape (Mirror Mode) the canvas takes
// 70 % on the start side for the customer and the controls 30 % for the barber.
// Up to 3 looks are saved for Compare. Chair: "This is my look" (or Compare). Home:
// "Get my Look Code".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from './ui/ScreenFrame.jsx';
import Button, { Spinner } from './ui/Button.jsx';
import BottomAction from './ui/BottomAction.jsx';
import BeforeAfter from './ui/BeforeAfter.jsx';
import BarberRuler from './ui/BarberRuler.jsx';
import Chip from './ui/Chip.jsx';
import ChipRow from './ui/ChipRow.jsx';
import Icon from './ui/Icon.jsx';
import IconButton from './ui/IconButton.jsx';
import Sheet from './ui/Sheet.jsx';
import Skeleton from './ui/Skeleton.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { useSnackbar } from './ui/snackbar.js';
import { cx } from './ui/kit.js';
import { useT } from './lib/i18n.js';
import { LIMITS } from './lib/config.js';
import { LOOK_ZONES, paramsFromStyle } from '../../ai/beard/lib/look.js';
import { useSession } from './state/session.js';
import { useLive } from './lib/useLive.js';
import { useShop, usePublicShop } from './state/shop.jsx';
import { watchStyles } from './state/data.js';
import { createConsultation, updateConsultation } from './state/data.js';
import {
  TIMELINE_STOPS,
  growthAt,
  jawlineDelta,
  jawlineDetail,
  jawlineLabels,
  needsOutline,
  renderStudio,
  renderThumbnail,
} from '../../ai/beard/index.js';
import { readMirrorPref, writeMirrorPref } from './capture/camera.js';
import CropCanvas from './studio/CropCanvas.jsx';
import JawRuler from './studio/JawRuler.jsx';
import LineHandles from './studio/LineHandles.jsx';
import SavedLooks from './studio/SavedLooks.jsx';
import { JawlineLine, JawlineSketch } from './studio/Jawline.jsx';
import { ColorControls, GROUPS, GroupChips, LengthControls, LinesControls, TimelineControls } from './studio/StudioControls.jsx';
import { approveLook, findStyle } from './studio/approve.js';
import { useClientGrowth } from './studio/useClientGrowth.js';
import { useLivePreview } from './studio/useLivePreview.js';
import { useMirrorMode } from './studio/useMirrorMode.js';
import { CROP_ASPECT, beardBelowPx, cropDataUrl, faceCrop, fitBox, renderScale, scaleRect } from './studio/frame.js';
import { initialStudioPreview, lowFpsDeclined, markLowFpsDeclined, writeStudioPreview } from './studio/studioPrefs.js';

const VIEWS = Object.freeze(['front', 'left', 'right']);
const PHOTO_DEBOUNCE_MS = 120;
const PHOTO_MAX_SIZE = 1280;
const RULER_HIDE_MS = 1400;
/** A zone counts as patchy at a timeline stop under this coverage. */
const PATCHY_COVER = 0.6;
/** Height of the controls sheet on phones (the Sheet's h-[46dvh]); the canvas keeps the space above it. */
const SHEET_VH = 46;
/** A line's handle shows only when the beard has hair at that edge (mm). */
const EDGE_MIN_MM = 0.2;

export default function S08Studio() {
  const { mode } = useSession();
  return mode === 'home' ? <HomeStudio /> : <ChairStudio />;
}

/** Chair: the shop's styles (hidden and signature ones too, for a Look Code) and the client's growth rate. */
function ChairStudio() {
  const shop = useShop();
  const { client } = useSession();
  const live = useLive((cb, onError) => watchStyles(shop.shopId, cb, { includeHidden: true }, onError), [shop.shopId]);
  const learned = useClientGrowth(shop.shopId, client && client.id ? client.id : null);
  return <Studio shop={shop} settings={shop.settings} styles={live.data} learnedGrowth={learned} />;
}

function HomeStudio() {
  const { shopId, styles } = usePublicShop();
  return <Studio shop={{ shopId }} settings={null} styles={styles} learnedGrowth={null} />;
}

function releaseCanvas(c) {
  if (!c) return;
  try {
    c.width = 0;
    c.height = 0;
  } catch {
    // already released
  }
}

/** Pill on the canvas (status, labels). */
function StagePill({ children, tone = 'default', className, role }) {
  return (
    <span
      role={role}
      className={cx(
        'inline-flex max-w-full items-center gap-2 rounded-full border bg-bg px-3 py-1.5 text-sm font-medium',
        tone === 'brass' ? 'border-plum text-plum' : tone === 'warn' ? 'border-warn text-warn' : 'border-line text-ink',
        className,
      )}
    >
      {children}
    </span>
  );
}

function Studio({ shop, settings, styles, learnedGrowth }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const session = useSession();
  const mirrorMode = useMirrorMode();
  const {
    mode,
    shots,
    effectiveProfile: profile,
    activeParams,
    setActiveParams,
    looks,
    saveLook,
    removeLook,
    restoreLook,
    favoriteLookId,
    path,
    lookCode,
    consultationId,
    setConsultationId,
    client,
    approved,
    safety,
    setSafety,
    hydrated,
  } = session;
  const chair = mode === 'chair';
  const shopId = shop ? shop.shopId : session.shopId;
  const shopGrowth = settings ? Number(settings.growthMmPerDay) : NaN;
  const rate = learnedGrowth || (Number.isFinite(shopGrowth) && shopGrowth > 0 ? shopGrowth : LIMITS.growthMmPerDayDefault);

  /* ------------------------------------------------------------ state */
  // Live or Photo as the barber last chose in this session (a slow device stays in Photo).
  const [preview, setPreview] = useState(() => initialStudioPreview(mirrorMode));
  const [view, setView] = useState('front');
  const [group, setGroup] = useState(null);
  const [draft, setDraft] = useState(null);
  const [timelineIdx, setTimelineIdx] = useState(null);
  const [hennaDay, setHennaDay] = useState(1);
  const [outlinePref, setOutlinePref] = useState(null);
  const [showSketch, setShowSketch] = useState(false);
  const [notice, setNotice] = useState(null);
  const [ruler, setRuler] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mirror, setMirror] = useState(readMirrorPref);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [stageSize, setStageSize] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [approving, setApproving] = useState(false);

  const stageRef = useRef(null);
  const liveHostRef = useRef(null);
  const videoRef = useRef(null);
  const mountedRef = useRef(true);
  const rulerTimer = useRef(0);
  const photoCanvasRef = useRef(null);
  const renderSeq = useRef(0);
  const sheetBodyRef = useRef(null);

  const params = draft || activeParams;
  const hasParams = Boolean(params);
  const front = shots ? shots.front : null;
  const views = VIEWS.filter((id) => shots && shots[id]);
  const shot = (shots && shots[view]) || front;
  const sheetGroup = mirrorMode ? group || 'length' : group;
  const sheetOpen = !mirrorMode && Boolean(group);
  const style = useMemo(() => findStyle(styles, params && params.styleId), [styles, params]);
  const styleParams = useMemo(() => (style ? paramsFromStyle(style, { profile }) : params), [style, profile, params]);

  // Phone and Mirror Mode are different layouts: leaving Mirror Mode closes the controls sheet.
  useEffect(() => {
    if (!mirrorMode) setGroup(null);
  }, [mirrorMode]);

  // A group picked in the phone sheet opens at its top (the sheet body scrolls; Mirror Mode
  // remounts its panel per group instead).
  useEffect(() => {
    const scroller = sheetBodyRef.current && sheetBodyRef.current.parentElement;
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop = 0;
  }, [group]);

  /* ------------------------------------------------------------ derived look state */
  const need = useMemo(() => (params ? needsOutline(params, profile) : { needed: false, zones: [] }), [params, profile]);
  const outline = outlinePref === null ? need.needed : outlinePref;
  const prevNeed = useRef(need.needed);
  useEffect(() => {
    if (prevNeed.current !== need.needed) {
      prevNeed.current = need.needed;
      setOutlinePref(null);
    }
  }, [need.needed]);

  const stop = timelineIdx === null ? null : TIMELINE_STOPS[timelineIdx];
  const days = stop ? stop.days : null;
  const growth = useMemo(() => {
    if (!stop || !params) return null;
    const g = growthAt(params, profile, stop.days, rate);
    const target = params.zones || {};
    const patchy = LOOK_ZONES.filter((z) => Number(target[z]) > 0 && g.coverage && g.coverage[z] < PATCHY_COVER);
    return { labelKey: g.labelKey, patchy };
  }, [stop, params, profile, rate]);

  // The two biggest changes ("Face reads 8% longer · Jaw reads 6% softer").
  const jawLabels = useMemo(() => (params ? jawlineLabels(jawlineDelta(profile, params)).slice(0, 2) : []), [params, profile]);
  const jawDetail = useMemo(() => (params && showSketch ? jawlineDetail(profile, params) : null), [params, profile, showSketch]);

  // Cheek line, neckline and jaw on the front photo: the drag handles while the Lines group
  // is open, and the barber's ruler along the jaw while a length moves (Photo mode).
  const onFrontPhoto = preview === 'photo' && Boolean(shot) && shot === front;
  const zonesNow = (params && params.zones) || {};
  const cheekEdge = Number(zonesNow.K_L) > EDGE_MIN_MM || Number(zonesNow.K_R) > EDGE_MIN_MM;
  const neckEdge = Number(zonesNow.N) > EDGE_MIN_MM;
  const handlesWanted = onFrontPhoto && sheetGroup === 'lines' && (cheekEdge || neckEdge);
  const rulerOnJaw = onFrontPhoto && Boolean(ruler);
  const guides = useMemo(() => {
    if (!(handlesWanted || rulerOnJaw) || !params) return null;
    try {
      return renderStudio.lineGuides(shot, params);
    } catch (err) {
      console.warn('studio: line guides failed', err);
      return null;
    }
  }, [handlesWanted, rulerOnJaw, shot, params]);

  /* ------------------------------------------------------------ lifecycle */
  useEffect(() => {
    mountedRef.current = true;
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(rulerTimer.current);
      releaseCanvas(photoCanvasRef.current);
      photoCanvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setStageSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
    };
  }, [mirrorMode, front, hasParams]);

  /* ------------------------------------------------------------ consultation draft (chair) */
  const createdRef = useRef(false);
  const syncedRef = useRef(null);
  const styleId = activeParams && activeParams.styleId ? activeParams.styleId : null;
  useEffect(() => {
    if (!chair || !styleId || approved || consultationId || createdRef.current) return;
    createdRef.current = true;
    try {
      const id = createConsultation(shopId, {
        clientId: client && client.id ? client.id : null,
        params: activeParams,
        visitId: session.visitId,
      });
      syncedRef.current = `${id}:${styleId}`;
      setConsultationId(id);
    } catch (err) {
      console.warn('studio: the consultation draft could not be created', err);
    }
    // Created once per session, from the look open when the Studio first shows a style.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chair, styleId, approved, consultationId]);

  useEffect(() => {
    if (!chair || !styleId || !consultationId || approved) return;
    const key = `${consultationId}:${styleId}`;
    if (syncedRef.current === key) return;
    syncedRef.current = key;
    try {
      updateConsultation(shopId, consultationId, { styleId, params: activeParams });
    } catch (err) {
      console.warn('studio: the consultation could not be updated', err);
    }
    // Only a change of style is written; the final params go in with the approval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chair, styleId, consultationId, approved]);

  /* ------------------------------------------------------------ live AR */
  const fallback = useCallback((kind) => {
    setPreview('photo');
    setNotice(kind);
  }, []);
  const lowFps = useCallback(() => {
    // Once Photo was taken from this message, it is not offered again in this session.
    if (lowFpsDeclined()) return;
    show({
      message: t('beard.render.lowFps'),
      actionLabel: t('beard.render.lowFps.action'),
      onAction: () => {
        markLowFpsDeclined();
        writeStudioPreview('photo');
        setPreview('photo');
      },
      duration: 10000,
    });
  }, [show, t]);

  const live = useLivePreview({
    enabled: preview === 'live' && visible && Boolean(params) && Boolean(front),
    hostRef: liveHostRef,
    videoRef,
    resetKey: mirrorMode,
    params,
    profile,
    outline,
    days,
    mirror,
    growthMmPerDay: rate,
    onFallback: fallback,
    onLowFps: lowFps,
  });

  /* ------------------------------------------------------------ Photo Studio */
  useEffect(() => {
    if (preview !== 'photo' || !shot || !params) return undefined;
    let alive = true;
    const token = ++renderSeq.current;
    setPhotoBusy(true);
    const timer = setTimeout(
      async () => {
        try {
          const canvas = await renderStudio({
            shot,
            params,
            profile,
            timelineDays: days === null ? 0 : days,
            timeline: days !== null,
            growthMmPerDay: rate,
            outline,
            maxSize: PHOTO_MAX_SIZE,
            day: hennaDay,
          });
          if (!alive || token !== renderSeq.current || !mountedRef.current) {
            releaseCanvas(canvas);
            return;
          }
          const old = photoCanvasRef.current;
          photoCanvasRef.current = canvas;
          setPhoto({ canvas, shot });
          setPhotoError(false);
          if (old && old !== canvas) releaseCanvas(old);
        } catch (err) {
          console.warn('studio: Photo Studio render failed', err);
          if (alive && token === renderSeq.current) setPhotoError(true);
        } finally {
          if (alive && token === renderSeq.current) setPhotoBusy(false);
        }
      },
      photoCanvasRef.current ? PHOTO_DEBOUNCE_MS : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [preview, shot, params, profile, days, rate, outline, hennaDay]);

  /* ------------------------------------------------------------ frame (one crop for before and after) */
  const mmPerPx = profile && profile.scale ? profile.scale.mmPerPx : null;
  const belowPx = beardBelowPx(activeParams && activeParams.zones ? activeParams.zones.C : 0, mmPerPx);
  const crop = useMemo(() => (shot ? faceCrop(shot, CROP_ASPECT, { belowPx }) : null), [shot, belowPx]);
  const photoForShot = photo && photo.shot === shot ? photo : null;
  const afterRect = useMemo(
    () => (crop && photoForShot ? scaleRect(crop, renderScale(shot, photoForShot.canvas)) : null),
    [crop, photoForShot, shot],
  );

  /* ------------------------------------------------------------ edits */
  const onDraft = useCallback((next) => setDraft(next), []);
  const onCommit = useCallback(
    (next) => {
      setDraft(null);
      setActiveParams(next);
    },
    [setActiveParams],
  );
  const onRuler = useCallback((mm, label, ended = false, zone = null) => {
    clearTimeout(rulerTimer.current);
    setRuler({ mm, label, zone });
    if (ended) rulerTimer.current = setTimeout(() => setRuler(null), RULER_HIDE_MS);
  }, []);

  const toggleMirror = () => {
    const next = !mirror;
    setMirror(next);
    writeMirrorPref(next);
  };

  const choosePreview = (v) => {
    if (!v || v === preview) return;
    if (v === 'live') setNotice(null);
    writeStudioPreview(v);
    setPreview(v);
  };

  /* ------------------------------------------------------------ saved looks */
  const activeLook = looks.find((l) => l.params === activeParams) || null;

  const makeThumb = async (p) => {
    if (front) {
      try {
        return await renderThumbnail(front, p, profile, { width: 240 });
      } catch (err) {
        console.warn('studio: look thumbnail failed', err);
      }
    }
    if (preview === 'photo' && photo && photo.canvas && photo.canvas.width) {
      return cropDataUrl(photo.canvas, scaleRect(faceCrop(photo.shot), renderScale(photo.shot, photo.canvas)));
    }
    const snap = live.snapshot();
    if (snap) {
      const url = cropDataUrl(snap, faceCrop({ canvas: snap, width: snap.width, height: snap.height, landmarks: null }));
      releaseCanvas(snap);
      return url;
    }
    return null;
  };

  const save = async () => {
    if (saving || !activeParams) return;
    if (looks.length >= LIMITS.maxLooks) {
      show({ message: t('beard.session.looks.max') });
      return;
    }
    setSaving(true);
    const p = activeParams;
    const thumb = await makeThumb(p);
    if (!mountedRef.current) return;
    const res = saveLook({ styleId: p.styleId, params: p, thumb });
    setSaving(false);
    show({ message: res.ok ? t('beard.studio.looks.saved') : t('beard.session.looks.max') });
  };

  const openLook = (look) => {
    setDraft(null);
    setActiveParams(look.params);
  };

  // Undo puts the same look back: same number (place), id, thumbnail and favourite.
  const removeSaved = (look) => {
    const index = looks.findIndex((l) => l.id === look.id);
    const wasFavorite = favoriteLookId === look.id;
    removeLook(look.id);
    show({
      message: t('beard.studio.looks.removed'),
      actionLabel: t('beard.common.undo'),
      onAction: () => {
        const res = restoreLook(look, index, wasFavorite);
        if (!res.ok && res.reason === 'max') show({ message: t('beard.session.looks.max') });
      },
    });
  };

  /* ------------------------------------------------------------ primary */
  const approveNow = () => {
    if (approving) return;
    setApproving(true);
    setDraft(null);
    const res = approveLook({
      session,
      shop,
      settings,
      styles,
      lookId: activeLook ? activeLook.id : null,
      growthMmPerDay: learnedGrowth,
    });
    if (!res.ok) {
      setApproving(false);
      show({ message: t('beard.studio.approve.failed') });
      return;
    }
    navigate(path('cut-card'));
  };

  let primary;
  if (!chair) {
    primary = (
      <Button variant="primary" icon="qr" onClick={() => navigate(path('code'))}>
        {t('beard.studio.getCode')}
      </Button>
    );
  } else if (looks.length >= 2) {
    primary = (
      <Button variant="primary" icon="compare" onClick={() => navigate(path('compare'))}>
        {t('beard.studio.compare.go')}
      </Button>
    );
  } else {
    primary = (
      <Button variant="primary" icon="check" loading={approving} onClick={approveNow}>
        {t('beard.studio.approve')}
      </Button>
    );
  }

  /* ------------------------------------------------------------ guards */
  const title = t('beard.studio.title');
  if (!front) {
    return (
      <ScreenFrame title={title} back={path('styles')}>
        {!hydrated ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t('beard.common.loading')}</span>
            <Skeleton rounded="card" className="aspect-[4/5] w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <EmptyState
            icon="camera"
            title={t('beard.studio.noShot.title')}
            message={t('beard.studio.noShot.body')}
            action={
              <Button variant="primary" icon="camera" onClick={() => navigate(path('capture'))} className="mt-2">
                {t('beard.studio.styles.retake')}
              </Button>
            }
          />
        )}
      </ScreenFrame>
    );
  }
  if (!params) {
    return (
      <ScreenFrame title={title} back={path('styles')}>
        <EmptyState
          icon="beard"
          title={t('beard.studio.noLook.title')}
          message={t('beard.studio.noLook.body')}
          action={
            <Button variant="primary" icon="list" onClick={() => navigate(path('styles'))} className="mt-2">
              {t('beard.studio.noLook.action')}
            </Button>
          }
        />
      </ScreenFrame>
    );
  }

  /* ------------------------------------------------------------ stage */
  const box = stageSize ? fitBox(stageSize.w, stageSize.h, CROP_ASPECT) : null;
  const shotLabel = (id) => t(`beard.ai.shot.${id}`).replace(/(\d+°)/g, '⁦$1⁩');

  // The barber's ruler while a length moves (PRD 9.5): laid along the jaw on the front
  // photo, just outside the beard (JawRuler); in Live AR and on the 45 degree shots a thin
  // ruler at the top of the frame, over the forehead, never over the beard being edited.
  const jawRuler = rulerOnJaw && guides && crop && box ? (
    <JawRuler guides={guides} crop={crop} box={box} zones={zonesNow} zone={ruler.zone} mm={ruler.mm} label={ruler.label} />
  ) : null;
  const overlayTop = ruler && !jawRuler ? (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
      <div className="w-[min(200px,60%)] rounded-control bg-bg px-2 pt-1">
        <p className="num truncate text-center text-xs font-medium text-ink">{ruler.label}</p>
        <BarberRuler mm={ruler.mm} lang={lang} />
      </div>
    </div>
  ) : null;

  const overlayBottom = growth ? (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
      <StagePill tone="brass" role="status" className="pointer-events-auto rounded-card pe-1">
        <Icon name="timeline" size={18} />
        <span className="min-w-0 leading-snug">{t(growth.labelKey)}</span>
        <button
          type="button"
          onClick={() => setTimelineIdx(null)}
          aria-label={t('beard.studio.timeline.off')}
          className="press -my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 active:bg-surface2"
        >
          <Icon name="close" size={18} />
        </button>
      </StagePill>
    </div>
  ) : null;

  const sketch = showSketch && jawDetail ? (
    <div className="pointer-events-none absolute end-2 top-12 rounded-control border border-line bg-bg p-1">
      <JawlineSketch detail={jawDetail} size={mirrorMode ? 96 : 64} />
    </div>
  ) : null;

  let stageContent;
  if (preview === 'live') {
    stageContent = (
      <div
        className="relative h-full w-full select-none overflow-hidden rounded-card border border-line bg-surface2 [-webkit-touch-callout:none]"
        style={{ touchAction: 'pan-y' }}
        {...live.holdHandlers}
      >
        <div ref={liveHostRef} className="absolute inset-0" role="img" aria-label={t('beard.studio.mode.live')} />
        {live.status !== 'on' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <StagePill role="status">
              <Spinner size={18} />
              {t('beard.studio.starting')}
            </StagePill>
          </div>
        ) : null}
        <div className="absolute start-2 top-2 flex flex-col items-start gap-2">
          {live.holding ? <StagePill tone="brass">{t('beard.ui.ba.original')}</StagePill> : null}
          {live.status === 'on' && !live.face ? <StagePill tone="warn">{t('beard.render.noFace')}</StagePill> : null}
        </div>
        <IconButton
          icon="mirror"
          label={t('beard.render.mirror')}
          tone="bordered"
          aria-pressed={mirror}
          onClick={toggleMirror}
          className={cx('absolute bottom-2 end-2 bg-bg', mirror && 'border-plum text-plum')}
        />
        {sketch}
        {overlayTop}
        {overlayBottom}
      </div>
    );
  } else {
    const after = photoForShot ? (
      <CropCanvas source={photoForShot.canvas} rect={afterRect} label={t('beard.ui.ba.after')} />
    ) : (
      <CropCanvas source={shot.canvas} rect={crop} label={t('beard.ui.ba.before')} />
    );
    stageContent = box ? (
      <div className="relative" style={{ width: box.width, height: box.height }}>
        <BeforeAfter
          before={<CropCanvas source={shot.canvas} rect={crop} />}
          after={after}
          initial={0.01}
          aspect={`${CROP_ASPECT * 5} / 5`}
          hint={false}
        />
        {!photoForShot && !photoError ? <Skeleton rounded="card" className="pointer-events-none absolute inset-0 opacity-70" /> : null}
        <div className="pointer-events-none absolute start-2 top-12 flex flex-col items-start gap-2">
          {photoBusy ? (
            <StagePill role="status">
              <Spinner size={16} />
              {t('beard.render.working')}
            </StagePill>
          ) : null}
        </div>
        {sketch}
        {handlesWanted && guides && crop ? (
          <LineHandles
            guides={guides}
            crop={crop}
            box={box}
            params={params}
            cheek={cheekEdge}
            neck={neckEdge}
            front={front}
            mmPerPx={mmPerPx}
            onDraft={onDraft}
            onCommit={onCommit}
          />
        ) : null}
        {jawRuler}
        {overlayTop}
        {overlayBottom}
      </div>
    ) : null;
  }

  const noticeLine = notice ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-warn bg-surface2 px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-1 items-start gap-2 text-ink">
        <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-warn" />
        <span>{t(notice === 'webgl' ? 'studio.webgl' : `studio.cam.${notice === 'denied' || notice === 'none' || notice === 'busy' ? notice : 'busy'}`)}</span>
      </span>
      {notice !== 'webgl' ? (
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => choosePreview('live')} className="-me-2">
          {t('beard.studio.cam.retry')}
        </Button>
      ) : null}
    </div>
  ) : null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <ChipRow
        className="!gap-0"
        label={<span className="sr-only">{t('beard.studio.preview')}</span>}
        options={[
          { value: 'live', label: t('beard.studio.mode.live'), icon: 'camera' },
          { value: 'photo', label: t('beard.studio.mode.photo'), icon: 'face' },
        ]}
        value={preview}
        onChange={choosePreview}
      />
      <Chip
        icon="eye"
        selected={outline}
        onClick={() => setOutlinePref(!outline)}
      >
        {t('beard.studio.outline')}
      </Chip>
      {lookCode && lookCode.code ? (
        <Chip size="sm" icon="keypad" className="ms-auto">
          {t('beard.studio.lookCode', { code: `⁦${lookCode.code}⁩` })}
        </Chip>
      ) : null}
    </div>
  );

  const viewChips =
    preview === 'photo' && views.length > 1 ? (
      <ChipRow
        className="!gap-0"
        label={<span className="sr-only">{t('beard.studio.view')}</span>}
        options={views.map((id) => ({ value: id, label: shotLabel(id) }))}
        value={shot.id || view}
        onChange={(v) => v && setView(v)}
        wrap={false}
      />
    ) : null;

  const outlineNote = outline ? (
    <p className="flex items-start gap-2 text-sm text-ink2">
      <span aria-hidden="true" className="mt-1.5 flex shrink-0 gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-ok" />
        <span className="h-2.5 w-2.5 rounded-full bg-risk" />
      </span>
      <span className="min-w-0">
        {need.needed ? t('beard.studio.outline.auto') : t('beard.studio.outline.manual')}
        {need.zones.length ? (
          <span className="block text-xs">{t('beard.render.outline.shorter', { zones: need.zones.map((z) => t(`beard.zone.${z}`)).join(lang === 'ar' ? '، ' : ', ') })}</span>
        ) : null}
      </span>
    </p>
  ) : null;

  const jawRow = (
    <div className="flex items-center gap-2">
      <Icon name="face" size={18} className="shrink-0 text-plum" />
      <div className="min-w-0 flex-1">
        <JawlineLine labels={jawLabels} />
        {jawDetail ? (
          <p className="num text-xs text-ink2">
            {t('beard.catalog.jaw.ratio', { before: jawDetail.before.ratio.toFixed(2), after: jawDetail.after.ratio.toFixed(2) })}
          </p>
        ) : null}
      </div>
      <Chip size="md" icon="profile" selected={showSketch} onClick={() => setShowSketch((v) => !v)}>
        {t('beard.studio.jaw.outline')}
      </Chip>
    </div>
  );

  const holdHint = (
    <p className="flex items-center gap-1.5 text-xs text-ink2">
      <Icon name="hand" size={16} className="shrink-0" />
      <span>{preview === 'live' ? t('beard.studio.holdHint') : t('beard.ui.ba.hint')}</span>
    </p>
  );

  const renderFailed = preview === 'photo' && photoError ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-warn">
      <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
      <span>{t('beard.studio.renderFailed')}</span>
    </p>
  ) : null;

  /* ------------------------------------------------------------ controls */
  const controls = (g) => {
    if (g === 'length') {
      return (
        <LengthControls
          params={params}
          committed={activeParams}
          styleParams={styleParams}
          onDraft={onDraft}
          onCommit={onCommit}
          onRuler={onRuler}
          chair={chair}
        />
      );
    }
    if (g === 'lines') {
      return (
        <LinesControls
          params={params}
          onDraft={onDraft}
          onCommit={onCommit}
          onChange={onCommit}
          front={front}
          mmPerPx={mmPerPx}
          dragHint={handlesWanted && guides ? 'photo' : preview === 'live' && (cheekEdge || neckEdge) ? 'live' : null}
        />
      );
    }
    if (g === 'color') {
      return (
        <ColorControls
          params={params}
          profile={profile}
          onDraft={onDraft}
          onCommit={onCommit}
          onChange={onCommit}
          hennaDay={hennaDay}
          onHennaDay={setHennaDay}
          live={preview === 'live'}
          safety={safety}
          setSafety={setSafety}
        />
      );
    }
    if (g === 'timeline') return <TimelineControls index={timelineIdx} onIndex={setTimelineIdx} growth={growth} rate={rate} />;
    return null;
  };

  const savedLooks = (
    <SavedLooks
      bleed={!mirrorMode}
      looks={looks}
      activeId={activeLook ? activeLook.id : null}
      onOpen={openLook}
      onRemove={removeSaved}
      onSave={save}
      saving={saving}
    />
  );

  const groupLabel = (g) => {
    const def = GROUPS.find((x) => x.id === g);
    return def ? t(def.labelKey) : t('beard.studio.controls');
  };

  /* ------------------------------------------------------------ Mirror Mode (tablet / TV, landscape) */
  if (mirrorMode) {
    return (
      <ScreenFrame
        title={title}
        back={path('styles')}
        wide
        bodyClassName="flex flex-col overflow-hidden [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1"
      >
        <video ref={videoRef} playsInline muted aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" />
        <div className="flex min-h-0 w-full flex-1 gap-6">
          <div className="flex min-h-0 min-w-0 basis-[70%] flex-col gap-3">
            {toolbar}
            {viewChips}
            {noticeLine}
            <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center">
              {stageContent}
            </div>
            {holdHint}
            {renderFailed}
            {outlineNote}
            {jawRow}
            {savedLooks}
          </div>
          <aside className="flex min-h-0 basis-[30%] flex-col gap-3 border-s border-line ps-6" aria-label={t('beard.studio.controls')}>
            <GroupChips value={sheetGroup} onChange={(g) => g && setGroup(g)} layout="grid" />
            {/* Keyed by group: a new group opens at its top, not at the last group's scroll. */}
            <div key={sheetGroup} className="-me-2 min-h-0 flex-1 overflow-y-auto pe-2">
              {controls(sheetGroup)}
            </div>
            {primary}
          </aside>
        </div>
      </ScreenFrame>
    );
  }

  /* ------------------------------------------------------------ phone */
  return (
    <ScreenFrame
      title={title}
      back={path('styles')}
      bodyClassName="flex flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col"
      footer={<BottomAction>{primary}</BottomAction>}
    >
      <video ref={videoRef} playsInline muted aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" />
      <div
        className="flex min-h-0 flex-1 flex-col gap-3"
        style={sheetOpen ? { paddingBottom: `max(0px, calc(${SHEET_VH}dvh - var(--footer-h, 0px) - 16px))` } : undefined}
      >
        {toolbar}
        {viewChips}
        {noticeLine}
        <div ref={stageRef} className="relative flex min-h-[220px] flex-1 items-center justify-center">
          {stageContent}
        </div>
        {sheetOpen ? null : holdHint}
        {renderFailed}
        {outlineNote}
        {jawRow}
        {sheetOpen ? null : (
          <>
            <GroupChips value={group} onChange={setGroup} nullable />
            {savedLooks}
          </>
        )}
      </div>
      <Sheet
        open={sheetOpen}
        onClose={() => setGroup(null)}
        title={groupLabel(group)}
        modal={false}
        className="h-[46dvh]"
      >
        <GroupChips value={group} onChange={(g) => g && setGroup(g)} className="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-1" />
        <div ref={sheetBodyRef}>{controls(group)}</div>
      </Sheet>
    </ScreenFrame>
  );
}
