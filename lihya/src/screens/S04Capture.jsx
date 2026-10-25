// S04 Capture (PRD 5.2, 8.1 step 2, 8.2 step 3): full-screen front camera with a ghost
// face outline, pose arrows, the customer's-left/right hint pill and the 4 shot dots.
// The auto-shutter fires by itself; a hand shutter appears after 6 s without a shot.
// Chair mode offers the optional white-card calibration on the front photo. Home mode
// can use a photo instead of the live camera. Then the on-device analysis runs with a
// skeleton shimmer and the step name, and the screen moves on to the profile (or to
// the Studio when a Look Code is loaded). Photos never leave this phone.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import Chip from '../components/Chip.jsx';
import IconButton from '../components/IconButton.jsx';
import Icon from '../components/Icon.jsx';
import Flash from '../components/Flash.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { cx } from '../components/kit.js';
import { useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.js';
import CaptureDots from './capture/CaptureDots.jsx';
import GhostOverlay from './capture/GhostOverlay.jsx';
import ShotView from './capture/ShotView.jsx';
import { createShutterSound } from './capture/shutterSound.js';
import {
  cameraErrorKind,
  chooseFit,
  fitRect,
  grabFrame,
  openCamera,
  platformKind,
  readMirrorPref,
  stopStream,
  writeMirrorPref,
} from './capture/camera.js';

const FULL_ORDER = Object.freeze(['front', 'left', 'right', 'chinUp']);
const MANUAL_AFTER_MS = 6000;
const FALLBACK_MODEL_MB = 20;

const orderFor = (mode) => (mode === 'quick' ? ['front'] : FULL_ORDER);
const firstMissing = (mode, shots) => orderFor(mode).find((id) => !(shots && shots[id])) || null;
const isComplete = (mode, shots) => orderFor(mode).every((id) => shots && shots[id]);

function releaseCanvas(shot) {
  if (!shot || !shot.canvas) return;
  try {
    shot.canvas.width = 0;
    shot.canvas.height = 0;
  } catch {
    // already released
  }
}

function sameStatus(a, b) {
  return (
    a &&
    b &&
    a.hint === b.hint &&
    a.arrow === b.arrow &&
    a.progress === b.progress &&
    a.faceFound === b.faceFound &&
    a.shot === b.shot
  );
}

/** Thin progress bar (role progressbar). */
function ProgressBar({ value, label, className }) {
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div className="h-full rounded-full bg-brass transition-[width] duration-press ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Centered panel inside the camera stage (errors, no camera). */
function StagePanel({ icon = 'warning', tone = 'warn', title, children }) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-bg">
      <div className="gutter mx-auto flex min-h-full w-full max-w-[520px] flex-col items-center justify-center gap-4 py-8 text-center">
        <span
          className={cx(
            'flex h-14 w-14 items-center justify-center rounded-full border',
            tone === 'warn' ? 'border-warn/50 text-warn' : 'border-line text-text-2',
          )}
        >
          <Icon name={icon} size={28} />
        </span>
        {title ? <h2 className="text-xl">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export default function S04Capture() {
  const { t } = useT();
  const navigate = useNavigate();
  const session = useSession();
  const {
    mode,
    captureMode,
    shots,
    whiteCard,
    profile,
    lookCode,
    path,
    setCaptureMode,
    setShot,
    clearShots,
    setWhiteCard,
    setProfile,
  } = session;
  const chair = mode === 'chair';

  /* ------------------------------------------------------------ refs + state */
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const capRef = useRef(null);
  const soundRef = useRef(null);
  const modRef = useRef(null);
  const modPromiseRef = useRef(null);
  const modelsPromiseRef = useRef(null);
  const mountedRef = useRef(true);
  const analysisRunRef = useRef(0);
  const shotsRef = useRef(shots);
  const whiteCardRef = useRef(whiteCard);
  const modeRef = useRef(captureMode);
  const lookCodeRef = useRef(lookCode);
  const cardDoneForRef = useRef(null);
  const mirrorRef = useRef(true);
  const handlersRef = useRef({});

  const [phase, setPhaseState] = useState(() => (isComplete(captureMode, shots) ? 'review' : 'live'));
  const phaseRef = useRef(phase);
  const [mod, setMod] = useState(null);
  const [modAttempt, setModAttempt] = useState(0);
  const [models, setModels] = useState({ state: 'loading', fraction: 0, total: 0 });
  const [modelsAttempt, setModelsAttempt] = useState(0);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [camera, setCamera] = useState('idle');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [status, setStatus] = useState(null);
  const [mirror, setMirror] = useState(readMirrorPref);
  const [manualMode, setManualMode] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState(null);
  const [flashKey, setFlashKey] = useState(0);
  const [cardMsg, setCardMsg] = useState(null);
  const [upload, setUpload] = useState(null);
  const [step, setStep] = useState(null);
  const [capKey, setCapKey] = useState(0);
  const [stageSize, setStageSize] = useState(null);
  const [frame, setFrame] = useState(null);

  // Keep the refs the async callbacks read in step with the session.
  shotsRef.current = shots;
  whiteCardRef.current = whiteCard;
  modeRef.current = captureMode;
  lookCodeRef.current = lookCode;
  mirrorRef.current = mirror;

  const goPhase = useCallback((p) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /* ------------------------------------------------------------ mount / unmount */
  useEffect(() => {
    mountedRef.current = true;
    const sound = createShutterSound();
    soundRef.current = sound;
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mountedRef.current = false;
      analysisRunRef.current += 1;
      window.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('visibilitychange', onVis);
      sound.close();
      if (soundRef.current === sound) soundRef.current = null;
    };
  }, []);

  // A fresh capture: home mode defaults to the quick (front only) capture; a capture
  // left half-way starts over (the auto-shutter always runs the shots in order).
  useEffect(() => {
    if (phaseRef.current !== 'live') return;
    const s = shotsRef.current;
    const any = FULL_ORDER.some((id) => s[id]);
    if (any) clearShots();
    if (mode === 'home' && !any && !session.profile && modeRef.current !== 'quick') {
      modeRef.current = 'quick';
      setCaptureMode('quick');
    }
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ AI module + models */
  useEffect(() => {
    let alive = true;
    const p = import('../ai/index.js');
    modPromiseRef.current = p;
    p.then((m) => {
      if (!alive) return;
      modRef.current = m;
      setMod(m);
    }).catch((err) => {
      console.error('capture: the AI module did not load', err);
      if (alive) setModels((s) => ({ ...s, state: 'error' }));
    });
    return () => {
      alive = false;
    };
  }, [modAttempt]);

  useEffect(() => {
    if (!mod) return undefined;
    let alive = true;
    setModels((s) => ({ ...s, state: 'loading' }));
    const p = mod.loadModels({
      onProgress: ({ fraction, total }) => {
        if (!alive) return;
        setModels((s) => {
          const f = Math.round((Number(fraction) || 0) * 100) / 100;
          return s.fraction === f && s.total === total ? s : { ...s, fraction: f, total: Number(total) || s.total };
        });
      },
    });
    modelsPromiseRef.current = p;
    p.then(
      () => alive && setModels((s) => ({ ...s, state: 'ready', fraction: 1 })),
      (err) => {
        console.error('capture: face models did not load', err);
        if (alive) setModels((s) => ({ ...s, state: 'error' }));
      },
    );
    // The age model downloads on Wi-Fi only, early, so the age band can be pre-selected.
    try {
      if (mod.canLoadAgeModel()) mod.loadAgeModel().catch(() => {});
    } catch (err) {
      console.warn('capture: age model check failed', err);
    }
    return () => {
      alive = false;
    };
  }, [mod, modelsAttempt]);

  useEffect(() => {
    if (!mod) return undefined;
    const sync = (st) => setLandmarkerReady(Boolean(st && st.landmarker === 'ready'));
    sync(mod.modelStatus());
    return mod.subscribeModelStatus(sync);
  }, [mod]);

  /* ------------------------------------------------------------ stage size */
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
  }, []);

  /* ------------------------------------------------------------ camera */
  const cameraWanted = (phase === 'live' || phase === 'card') && visible;

  useEffect(() => {
    if (!cameraWanted) return undefined;
    let cancelled = false;
    let stream = null;
    const video = videoRef.current;
    const onEnded = () => {
      if (!cancelled) setCamera('busy');
    };
    const onResize = () => {
      if (!cancelled && video && video.videoWidth && video.videoHeight) {
        setFrame((f) => (f && f.w === video.videoWidth && f.h === video.videoHeight ? f : { w: video.videoWidth, h: video.videoHeight }));
      }
    };
    if (video) {
      video.addEventListener('loadedmetadata', onResize);
      video.addEventListener('resize', onResize);
    }
    setCamera('starting');
    openCamera()
      .then(async (s) => {
        stream = s;
        if (cancelled) {
          stopStream(s);
          return;
        }
        const track = s.getVideoTracks()[0];
        if (track) track.addEventListener('ended', onEnded);
        if (video) {
          video.srcObject = s;
          try {
            await video.play();
          } catch (err) {
            // autoplay of a muted inline video is allowed; a rejection here is a race with unmount
            if (!cancelled) console.warn('capture: video.play()', err);
          }
        }
        onResize();
        if (!cancelled) setCamera('on');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('capture: camera did not open', err);
        setCamera(cameraErrorKind(err));
      });
    return () => {
      cancelled = true;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) track.removeEventListener('ended', onEnded);
        stopStream(stream);
      }
      if (video) {
        video.removeEventListener('loadedmetadata', onResize);
        video.removeEventListener('resize', onResize);
        video.srcObject = null;
      }
      setCamera('idle');
    };
  }, [cameraWanted, cameraAttempt]);

  /* ------------------------------------------------------------ shots */
  const acceptShot = useCallback(
    (shot) => {
      shotsRef.current = { ...shotsRef.current, [shot.id]: shot };
      setShot(shot.id, shot);
      if (shot.id === 'front') {
        whiteCardRef.current = null;
        setWhiteCard(null);
        cardDoneForRef.current = null;
      }
      setManualMsg(null);
    },
    [setShot, setWhiteCard],
  );

  const dropShot = useCallback(
    (id) => {
      shotsRef.current = { ...shotsRef.current, [id]: null };
      setShot(id, null);
      if (id === 'front') {
        whiteCardRef.current = null;
        setWhiteCard(null);
        cardDoneForRef.current = null;
      }
    },
    [setShot, setWhiteCard],
  );

  const feedback = useCallback(() => {
    if (soundRef.current) soundRef.current.play();
    setFlashKey((k) => k + 1);
  }, []);

  /* ------------------------------------------------------------ analysis */
  const runAnalysis = useCallback(async () => {
    const run = ++analysisRunRef.current;
    const stale = () => run !== analysisRunRef.current || !mountedRef.current;
    if (capRef.current) capRef.current.stop();
    goPhase('analyzing');
    setStep(null);
    try {
      const m = modRef.current || (await modPromiseRef.current);
      // The segmenter makes the skin/hair map exact; wait for its first download. A
      // segmenter failure resolves too (the analysis then uses landmarks only).
      try {
        await modelsPromiseRef.current;
      } catch {
        // landmarks-only analysis
      }
      if (stale()) return;
      const order = orderFor(modeRef.current);
      const input = {};
      for (const id of FULL_ORDER) input[id] = order.includes(id) ? shotsRef.current[id] || null : null;
      const result = await m.analyzeShots(input, {
        whiteCard: whiteCardRef.current,
        onStep: (_key, info) => {
          if (!stale() && info) setStep({ index: info.index, total: info.total, i18nKey: info.i18nKey });
        },
      });
      if (stale()) return;
      setProfile(result);
      navigate(lookCodeRef.current ? path('studio') : path('profile'));
    } catch (err) {
      console.error('capture: analysis failed', err);
      if (!stale()) goPhase('analysisError');
    }
  }, [goPhase, navigate, path, setProfile]);

  /** After a shot: the white-card step (chair, new front photo), the next shot, or the analysis. */
  const afterShot = useCallback(
    (id) => {
      if (chair && id === 'front' && shotsRef.current.front && cardDoneForRef.current !== shotsRef.current.front) {
        if (capRef.current) capRef.current.stop();
        setCardMsg(null);
        goPhase('card');
        return;
      }
      if (isComplete(modeRef.current, shotsRef.current)) runAnalysis();
    },
    [chair, goPhase, runAnalysis],
  );

  // Capture-session callbacks read the latest closures through this ref.
  handlersRef.current = {
    onStatus: (st) => {
      if (!st || !mountedRef.current) return;
      if (st.error === 'model') {
        setModels((s) => ({ ...s, state: 'error' }));
        return;
      }
      const m = modRef.current;
      const next = {
        hint: st.hint || null,
        arrow: m && typeof m.hintArrow === 'function' ? m.hintArrow(st.hint, mirrorRef.current) : st.arrow || null,
        progress: Math.round((Number(st.progress) || 0) * 20) / 20,
        faceFound: Boolean(st.faceFound),
        shot: st.shot || null,
      };
      setStatus((prev) => (sameStatus(prev, next) ? prev : next));
    },
    onShot: (shot) => {
      if (!shot || !mountedRef.current) return;
      feedback();
      acceptShot(shot);
      setStatus(null);
      afterShot(shot.id);
    },
    onDone: () => {
      if (!mountedRef.current || phaseRef.current !== 'live') return;
      if (isComplete(modeRef.current, shotsRef.current)) runAnalysis();
    },
  };

  /* ------------------------------------------------------------ capture session */
  useEffect(() => {
    const video = videoRef.current;
    if (!mod || !video) return undefined;
    const s = mod.createCaptureSession({
      video,
      mode: captureMode,
      mirror: mirrorRef.current,
      onStatus: (st) => handlersRef.current.onStatus(st),
      onShot: (shot) => handlersRef.current.onShot(shot),
      onDone: (all) => handlersRef.current.onDone(all),
    });
    capRef.current = s;
    return () => {
      s.stop();
      if (capRef.current === s) capRef.current = null;
    };
  }, [mod, captureMode, capKey]);

  const shouldRun = phase === 'live' && camera === 'on' && visible && landmarkerReady && !manualMode;
  useEffect(() => {
    const s = capRef.current;
    if (!s) return;
    if (shouldRun) s.start();
    else s.stop();
  }, [shouldRun, mod, captureMode, capKey]);

  /* ------------------------------------------------------------ hand shutter */
  const currentId = firstMissing(captureMode, shots);

  useEffect(() => {
    setManualVisible(false);
    if (phase !== 'live' || camera !== 'on' || !landmarkerReady || !currentId) return undefined;
    const timer = setTimeout(() => setManualVisible(true), MANUAL_AFTER_MS);
    return () => clearTimeout(timer);
  }, [phase, camera, landmarkerReady, currentId, capKey]);

  const takeManual = async () => {
    const id = firstMissing(modeRef.current, shotsRef.current);
    if (!id || manualBusy) return;
    setManualBusy(true);
    setManualMsg(null);
    feedback();
    const blob = await grabFrame(videoRef.current);
    // The auto-shutter session cannot skip a shot, so the rest of this capture is by hand.
    if (capRef.current) capRef.current.stop();
    setManualMode(true);
    setStatus(null);
    try {
      if (!blob) throw new Error('no video frame');
      const m = modRef.current || (await modPromiseRef.current);
      const { shot } = await m.shotFromImage(blob, id);
      if (!mountedRef.current) return;
      if (!shot) {
        setManualMsg('noFace');
        return;
      }
      acceptShot(shot);
      afterShot(id);
    } catch (err) {
      console.warn('capture: hand shutter failed', err);
      if (mountedRef.current) setManualMsg('noFace');
    } finally {
      if (mountedRef.current) setManualBusy(false);
    }
  };

  /* ------------------------------------------------------------ actions */
  const retakeShot = (id) => {
    dropShot(id);
    setManualMsg(null);
    setStatus(null);
    goPhase('live');
    if (!manualMode && capRef.current) capRef.current.retake(id);
  };

  const restartAll = () => {
    analysisRunRef.current += 1;
    clearShots();
    shotsRef.current = { front: null, left: null, right: null, chinUp: null };
    whiteCardRef.current = null;
    cardDoneForRef.current = null;
    setManualMode(false);
    setManualMsg(null);
    setStatus(null);
    setStep(null);
    setCapKey((k) => k + 1);
    goPhase('live');
  };

  const toggleQuick = () => {
    const next = captureMode === 'quick' ? 'full' : 'quick';
    modeRef.current = next;
    setCaptureMode(next);
    setManualMode(false);
    setStatus(null);
    if (next === 'quick') {
      for (const id of ['left', 'right', 'chinUp']) if (shotsRef.current[id]) dropShot(id);
      if (shotsRef.current.front) afterShot('front');
    }
  };

  const toggleMirror = () => {
    const next = !mirror;
    setMirror(next);
    writeMirrorPref(next);
  };

  const onCardTap = (x, y) => {
    const m = modRef.current;
    const front = shotsRef.current.front;
    if (!m || !front) return;
    let wc = null;
    try {
      wc = m.whiteCardFromTap(front, x, y);
    } catch (err) {
      console.warn('capture: white card read failed', err);
    }
    if (wc) {
      whiteCardRef.current = wc;
      setWhiteCard(wc);
      setCardMsg('ok');
    } else {
      setCardMsg('notFound');
    }
  };

  const finishCard = () => {
    cardDoneForRef.current = shotsRef.current.front;
    setCardMsg(null);
    if (isComplete(modeRef.current, shotsRef.current)) {
      runAnalysis();
      return;
    }
    goPhase('live');
    if (!manualMode && capRef.current) capRef.current.start();
  };

  const retakeFrontFromCard = () => {
    setCardMsg(null);
    retakeShot('front');
  };

  const openFilePicker = () => {
    if (fileRef.current) fileRef.current.click();
  };

  const acceptUpload = (shot) => {
    modeRef.current = 'quick';
    setCaptureMode('quick');
    for (const id of ['left', 'right', 'chinUp']) if (shotsRef.current[id]) dropShot(id);
    acceptShot(shot);
    cardDoneForRef.current = shot;
    setUpload(null);
    runAnalysis();
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (capRef.current) capRef.current.stop();
    if (upload && upload.shot) releaseCanvas(upload.shot);
    setUpload({ state: 'checking' });
    goPhase('upload');
    try {
      const m = modRef.current || (await modPromiseRef.current);
      const res = await m.shotFromImage(file, 'front');
      if (!mountedRef.current) return;
      if (!res || !res.shot) {
        setUpload({ state: 'noFace' });
      } else if (res.issues && res.issues.length) {
        setUpload({ state: 'issues', shot: res.shot, issues: res.issues });
      } else {
        acceptUpload(res.shot);
      }
    } catch (err) {
      console.warn('capture: photo could not be read', err);
      if (mountedRef.current) setUpload({ state: 'noFace' });
    }
  };

  const backToCamera = () => {
    if (upload && upload.shot) releaseCanvas(upload.shot);
    setUpload(null);
    goPhase('live');
  };

  const continueFromReview = () => {
    if (profile) navigate(lookCode ? path('studio') : path('profile'));
    else runAnalysis();
  };

  const retryModels = () => {
    setStatus(null);
    if (!modRef.current) setModAttempt((n) => n + 1);
    else setModelsAttempt((n) => n + 1);
  };

  // A session wipe (idle or next customer) empties the shots under a review or card step.
  useEffect(() => {
    if ((phase === 'review' || phase === 'card') && !shots.front) goPhase('live');
  }, [phase, shots.front, goPhase]);

  /* ------------------------------------------------------------ render helpers */
  const order = orderFor(captureMode);
  const index = currentId ? order.indexOf(currentId) : order.length - 1;
  const modelMb = models.total ? Math.round(models.total / 1e6) : FALLBACK_MODEL_MB;
  const modelPct = Math.round((models.fraction || 0) * 100);
  const modelsError = models.state === 'error';
  const cameraError = ['denied', 'none', 'busy', 'error'].includes(camera) ? camera : null;
  const fit = stageSize && frame ? chooseFit(stageSize.w, stageSize.h, frame.w, frame.h) : 'cover';
  const frameRect = stageSize && frame ? fitRect(stageSize.w, stageSize.h, frame.w, frame.h, fit) : null;
  const aligned = Boolean(status && status.faceFound && (status.hint === 'hold' || status.progress > 0));

  let hintText;
  let hintTone = 'default';
  if (camera !== 'on') hintText = t('capture.starting');
  else if (!landmarkerReady) hintText = modelPct > 0 ? t('ai.model.progress', { pct: modelPct }) : t('ai.model.loading');
  else if (manualMsg === 'noFace') {
    hintText = t('capture.manualNoFace');
    hintTone = 'warn';
  } else if (!manualMode && status && status.hint) {
    hintText = t(`ai.hint.${status.hint}`);
    hintTone = status.hint === 'hold' ? 'brass' : 'default';
  } else if (currentId) hintText = t(`ai.shot.${currentId}.help`);
  else hintText = '';

  const shotLine = currentId
    ? `${t('ai.shot.count', { n: index + 1, total: order.length })} · ${t(`ai.shot.${currentId}`)}`
    : '';

  const titles = {
    live: t('capture.title'),
    card: t('capture.card.title'),
    upload: t('ai.issue.title'),
    analyzing: t('capture.analyzing'),
    analysisError: t('capture.analyzing'),
    review: t('capture.review.title'),
  };

  const uploadButton =
    mode === 'home' ? (
      <Button variant="secondary" icon="upload" onClick={openFilePicker} full>
        {t('capture.upload')}
      </Button>
    ) : null;

  /* ------------------------------------------------------------ stage */
  const renderCameraError = () => {
    const titleKey = { denied: 'capture.cam.denied.title', none: 'capture.cam.none.title', busy: 'capture.cam.busy.title' }[cameraError] || 'capture.cam.error.title';
    const bodyKey = { denied: 'capture.cam.denied.body', none: 'capture.cam.none.body', busy: 'capture.cam.busy.body' }[cameraError] || 'capture.cam.error.body';
    const platform = platformKind();
    return (
      <StagePanel icon={cameraError === 'denied' ? 'lock' : 'camera'} title={t(titleKey)}>
        <p className="max-w-sm text-text-2">{t(bodyKey)}</p>
        {cameraError === 'denied' ? (
          <div className="w-full rounded-card border border-line bg-surface p-4 text-start">
            <p className="text-text">{t(`capture.cam.denied.${platform}`)}</p>
            <p className="mt-2 text-sm text-text-2">{t('capture.cam.denied.then')}</p>
          </div>
        ) : null}
        <div className="flex w-full max-w-sm flex-col gap-3 pt-2">
          <Button variant="secondary" icon="refresh" onClick={() => setCameraAttempt((n) => n + 1)} full>
            {t('common.retry')}
          </Button>
          {uploadButton}
        </div>
      </StagePanel>
    );
  };

  const renderModelsError = () => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <StagePanel icon={offline ? 'wifi-off' : 'warning'} title={t('ai.model.loading')}>
        <p role="alert" className="max-w-sm text-text-2">
          {offline ? t('ai.model.offline', { mb: modelMb }) : t('ai.model.error')}
        </p>
        <div className="flex w-full max-w-sm flex-col gap-3 pt-2">
          <Button variant="secondary" icon="refresh" onClick={retryModels} full>
            {t('ai.model.retry')}
          </Button>
        </div>
      </StagePanel>
    );
  };

  const renderLive = () => {
    if (cameraError) return renderCameraError();
    if (modelsError) return renderModelsError();
    return (
      <>
        <GhostOverlay
          size={stageSize}
          rect={frameRect}
          aligned={aligned && !manualMode}
          progress={manualMode ? 0 : status ? status.progress : 0}
          arrow={!manualMode && status ? status.arrow : null}
          faceFound={Boolean(status && status.faceFound)}
        />
        {models.state === 'loading' && camera === 'on' ? (
          <div className="gutter absolute inset-x-0 top-3">
            <div className="mx-auto max-w-sm rounded-ctl border border-line bg-bg px-3 py-2">
              <ProgressBar value={models.fraction} label={t('ai.model.progress', { pct: modelPct })} />
              <p className="mt-1.5 text-center text-xs text-text-2">{t('capture.modelsNote', { mb: modelMb })}</p>
            </div>
          </div>
        ) : null}
        <div className="gutter pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
          {hintText ? (
            <p
              role="status"
              aria-live="polite"
              className={cx(
                'max-w-full rounded-full border bg-bg px-5 py-2.5 text-center text-lg font-semibold leading-snug sm:text-xl',
                hintTone === 'brass' ? 'border-brass text-brass' : hintTone === 'warn' ? 'border-warn text-warn' : 'border-line text-text',
              )}
            >
              {camera !== 'on' || !landmarkerReady ? (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brass motion-safe:animate-pulse" />
                  {hintText}
                </span>
              ) : (
                hintText
              )}
            </p>
          ) : null}
          <div className="pointer-events-auto flex flex-col items-center rounded-card border border-line bg-bg px-2 pb-1.5">
            <CaptureDots order={order} shots={shots} current={currentId} onRetake={retakeShot} disabled={manualBusy} />
            {shotLine ? <p className="-mt-1 px-2 text-xs text-text-2">{shotLine}</p> : null}
          </div>
        </div>
      </>
    );
  };

  const renderCard = () => (
    <>
      <ShotView
        shot={shots.front}
        onTap={onCardTap}
        rect={whiteCard ? whiteCard.rect : null}
        label={t('capture.card.photoLabel')}
      />
      <div className="gutter pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2">
        <p className="max-w-full rounded-full border border-brass bg-bg px-5 py-2.5 text-center text-lg font-semibold text-brass">
          {t('ai.whiteCard.tap')}
        </p>
      </div>
      <div className="gutter pointer-events-none absolute inset-x-0 bottom-3">
        <div className="mx-auto max-w-md rounded-card border border-line bg-bg p-3 text-start">
          <p className="text-sm text-text-2">
            <span className="me-2 inline-block rounded-full border border-line px-2 text-xs text-text-2">{t('capture.card.optional')}</span>
            {t('ai.whiteCard.help')}
          </p>
          {cardMsg ? (
            <p
              role="alert"
              className={cx('mt-2 flex items-start gap-2 text-sm font-medium', cardMsg === 'ok' ? 'text-keep' : 'text-warn')}
            >
              <Icon name={cardMsg === 'ok' ? 'check' : 'warning'} size={20} />
              <span>{cardMsg === 'ok' ? t('ai.whiteCard.ok') : t('ai.whiteCard.notFound')}</span>
            </p>
          ) : null}
        </div>
      </div>
    </>
  );

  const renderUpload = () => {
    if (!upload || upload.state === 'checking') {
      return (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg p-6">
          <Skeleton rounded="card" className="aspect-[3/4] w-full max-w-[280px]" />
          <p className="text-lg text-text">{t('capture.uploadChecking')}</p>
        </div>
      );
    }
    if (upload.state === 'noFace') {
      return (
        <StagePanel icon="face" title={t('ai.issue.title')}>
          <p role="alert" className="max-w-sm text-text-2">
            {t('ai.issue.noFace')}
          </p>
        </StagePanel>
      );
    }
    return (
      <>
        <ShotView shot={upload.shot} label={t('capture.upload.photoLabel')} />
        <div className="gutter absolute inset-x-0 bottom-3">
          <div role="alert" className="mx-auto max-w-md rounded-card border border-warn/60 bg-bg p-4 text-start">
            <h2 className="flex items-center gap-2 text-lg text-warn">
              <Icon name="warning" size={22} />
              {t('ai.issue.title')}
            </h2>
            <ul className="mt-2 flex flex-col gap-1 text-text">
              {upload.issues.map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  <span>{t(`ai.hint.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </>
    );
  };

  const renderAnalyzing = () => {
    const total = step ? step.total : 9;
    const n = step ? Math.min(total, step.index + 1) : 0;
    const waitingModels = !step && models.state === 'loading';
    const label = step
      ? t(step.i18nKey)
      : waitingModels
        ? t('ai.model.progress', { pct: modelPct })
        : t('ai.step.prepare');
    return (
      <>
        {shots.front ? (
          <ShotView shot={shots.front} dim label={t('capture.analyzing')}>
            <Skeleton rounded="none" className="absolute inset-0 bg-transparent" />
          </ShotView>
        ) : (
          <Skeleton rounded="none" className="absolute inset-0" />
        )}
        <div className="gutter absolute inset-x-0 bottom-3">
          <div role="status" aria-live="polite" className="mx-auto max-w-md rounded-card border border-line bg-bg p-4">
            <h2 className="text-xl">{t('capture.analyzing')}</h2>
            <p className="mt-1 min-h-[1.5em] text-lg text-brass">{label}</p>
            <ProgressBar
              className="mt-3"
              value={waitingModels ? models.fraction : total ? n / total : 0}
              label={label}
            />
            {step ? (
              <p className="num mt-2 text-xs text-text-2">{t('capture.analysisStep', { n, total })}</p>
            ) : null}
          </div>
        </div>
      </>
    );
  };

  const renderAnalysisError = () => (
    <StagePanel icon="warning" title={t('capture.analyzing')}>
      <p role="alert" className="max-w-sm text-text-2">
        {t('capture.analysisError')}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3 pt-2">
        <Button variant="secondary" icon="refresh" onClick={runAnalysis} full>
          {t('common.retry')}
        </Button>
      </div>
    </StagePanel>
  );

  const renderReview = () => (
    <>
      <ShotView shot={shots.front} label={t('ai.shot.front')} />
      <div className="gutter pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
        <div className="flex flex-col items-center rounded-card border border-line bg-bg px-4 pb-2">
          <CaptureDots order={order} shots={shots} current={null} />
          <p className="-mt-1 text-center text-sm text-text-2">{t('capture.review.body')}</p>
        </div>
      </div>
    </>
  );

  const stage = {
    live: renderLive,
    card: renderCard,
    upload: renderUpload,
    analyzing: renderAnalyzing,
    analysisError: renderAnalysisError,
    review: renderReview,
  }[phase];

  /* ------------------------------------------------------------ footer */
  let footer = null;
  if (phase === 'live' && !cameraError && !modelsError) {
    const showManual = manualMode || manualVisible;
    footer = (
      <BottomAction>
        {showManual ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-text-2">
              {manualMode ? t('capture.manualMode') : t('capture.manualHint')}
            </p>
            <Button variant="primary" icon="camera" onClick={takeManual} loading={manualBusy} disabled={!currentId}>
              {t('capture.manual')}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Chip selected={captureMode === 'quick'} onClick={toggleQuick} icon="flash">
            {t('capture.quick')}
          </Chip>
          <span className="text-sm text-text-2">{t('capture.quickHint')}</span>
        </div>
        {uploadButton}
      </BottomAction>
    );
  } else if (phase === 'card') {
    footer = (
      <BottomAction>
        <Button variant="primary" iconEnd="arrow-right" onClick={finishCard}>
          {whiteCard ? t('common.next') : t('ai.whiteCard.skip')}
        </Button>
        <Button variant="ghost" icon="refresh" onClick={retakeFrontFromCard} full>
          {t('capture.card.retakeFront')}
        </Button>
      </BottomAction>
    );
  } else if (phase === 'upload' && upload && upload.state === 'issues') {
    footer = (
      <BottomAction>
        <Button variant="primary" icon="check" onClick={() => acceptUpload(upload.shot)}>
          {t('ai.issue.useAnyway')}
        </Button>
        <Button variant="secondary" icon="upload" onClick={openFilePicker} full>
          {t('ai.issue.retake')}
        </Button>
      </BottomAction>
    );
  } else if (phase === 'upload' && upload && upload.state === 'noFace') {
    footer = (
      <BottomAction>
        <Button variant="primary" icon="upload" onClick={openFilePicker}>
          {t('ai.issue.retake')}
        </Button>
        <Button variant="secondary" icon="camera" onClick={backToCamera} full>
          {t('capture.useCamera')}
        </Button>
      </BottomAction>
    );
  } else if (phase === 'analysisError') {
    footer = (
      <BottomAction>
        <Button variant="secondary" icon="camera" onClick={restartAll} full>
          {t('capture.retakeAll')}
        </Button>
      </BottomAction>
    );
  } else if (phase === 'review') {
    footer = (
      <BottomAction>
        <Button variant="primary" iconEnd="arrow-right" onClick={continueFromReview}>
          {t('capture.review.continue')}
        </Button>
        <Button variant="secondary" icon="camera" onClick={restartAll} full>
          {t('capture.retakeAll')}
        </Button>
      </BottomAction>
    );
  }

  const actions =
    phase === 'live' && !cameraError ? (
      <IconButton
        icon="mirror"
        label={t('capture.mirror')}
        aria-pressed={mirror}
        tone={mirror ? 'brass' : 'muted'}
        onClick={toggleMirror}
      />
    ) : null;

  return (
    <ScreenFrame
      title={titles[phase]}
      back={path('')}
      actions={actions}
      footer={footer}
      padded={false}
      bodyClassName="overflow-hidden [&>div]:h-full [&>div]:max-w-none"
    >
      <div ref={stageRef} className="relative h-full w-full overflow-hidden bg-surface">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label={t('capture.preview')}
          className={cx(
            'absolute inset-0 h-full w-full',
            fit === 'contain' ? 'object-contain' : 'object-cover',
            mirror && '-scale-x-100',
            (phase !== 'live' || camera !== 'on' || cameraError) && 'invisible',
          )}
        />
        {stage ? stage() : null}
        <Flash trigger={flashKey} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
      />
    </ScreenFrame>
  );
}
