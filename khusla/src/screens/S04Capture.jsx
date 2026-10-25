import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import Icon from '../components/Icon.jsx';
import ShotDots from '../components/ShotDots.jsx';
import { ErrorBox, Steps } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { analyze, createCaptureLoop, loadModels, privateDisplay, decodeToCanvas, withRenderAux } from '../ai/index.js';
import { putPhoto } from '../lib/photoStore.js';

const ANALYSIS_STEPS = ['face', 'hair', 'color', 'level', 'age', 'preview'];

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.07);
    setTimeout(() => ctx.close(), 300);
  } catch {
    // no audio: the edge flash is the feedback
  }
}

const canvasToBlob = (c, q = 0.9) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));

export default function S04Capture() {
  const { t } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const loc = useLocation();
  const privateMode = session.mode === 'home' ? true : app.settings?.privateMode !== false;

  const [phase, setPhase] = useState('note'); // note | camera | card | analyzing | error
  const [quick, setQuick] = useState(false);
  const [facing, setFacing] = useState('user');
  const [mirror, setMirror] = useState(true);
  const [shotIdx, setShotIdx] = useState(0);
  const [done, setDone] = useState([]);
  const [live, setLive] = useState({ hint: 'capture.loading', progress: 0 });
  const [flash, setFlash] = useState(0);
  const [err, setErr] = useState(null);
  const [frontUrl, setFrontUrl] = useState(null);
  const [card, setCard] = useState(null);
  const [step, setStep] = useState(null);
  const [modelsReady, setModelsReady] = useState(false);

  const videoRef = useRef(null);
  const viewRef = useRef(null);
  const loopRef = useRef(null);
  const streamRef = useRef(null);
  const frontBlob = useRef(null);
  const frontCanvasRef = useRef(null);
  const extraBlobs = useRef({});

  const shots = quick ? ['front'] : ['front', 'left', 'right', 'back'];
  const shot = shots[shotIdx];

  useEffect(() => {
    loadModels()
      .then(() => setModelsReady(true))
      .catch(() => setErr('models'));
  }, []);

  const stopCamera = useCallback(() => {
    loopRef.current?.stop();
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // the front photo is shown private-blurred too (Private Mode applies on screen)
  const showFront = useCallback(
    async (blob) => {
      setPhase('card');
      try {
        const c = await privateDisplay(blob, privateMode);
        const b = await canvasToBlob(c, 0.85);
        setFrontUrl(URL.createObjectURL(b));
      } catch {
        setFrontUrl(URL.createObjectURL(blob));
      }
    },
    [privateMode],
  );

  const onCapture = useCallback(
    (blob, meta) => {
      beep();
      setFlash((f) => f + 1);
      if (meta.shot === 'front') {
        frontBlob.current = blob;
        stopCamera();
        showFront(blob);
        return;
      }
      extraBlobs.current[meta.shot] = blob;
      setDone((d) => [...d, meta.shot]);
      setShotIdx((i) => i + 1);
    },
    [stopCamera, showFront],
  );

  const shotRef = useRef(shot);
  shotRef.current = shot;

  const openCamera = useCallback(async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      loopRef.current?.stop();
      loopRef.current = createCaptureLoop({
        video: v,
        view: viewRef.current,
        getShot: () => shotRef.current,
        getPrivate: () => privateMode,
        onState: setLive,
        onCapture,
      });
      setPhase('camera');
    } catch (e) {
      setErr(e.name === 'NotAllowedError' ? 'camera-denied' : 'camera');
    }
  }, [facing, privateMode, onCapture]);

  // advance past the last shot -> analyze
  useEffect(() => {
    if (phase === 'camera' && shotIdx >= shots.length) {
      stopCamera();
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotIdx, phase]);

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    frontBlob.current = f;
    setQuick(true);
    showFront(f);
  };

  const tapCard = async (ev) => {
    const img = ev.currentTarget;
    const r = img.getBoundingClientRect();
    if (!frontCanvasRef.current) frontCanvasRef.current = await decodeToCanvas(frontBlob.current);
    const c = frontCanvasRef.current;
    const x = ((ev.clientX - r.left) / r.width) * c.width;
    const y = ((ev.clientY - r.top) / r.height) * c.height;
    setCard({ x, y, px: ((ev.clientX - r.left) / r.width) * 100, py: ((ev.clientY - r.top) / r.height) * 100 });
  };

  const continueAfterFront = async () => {
    setDone(['front']);
    if (quick || shots.length === 1) {
      runAnalysis();
      return;
    }
    setShotIdx(1);
    await openCamera();
  };

  const runAnalysis = async () => {
    setPhase('analyzing');
    try {
      const result = await analyze(frontBlob.current, {
        whiteCardPoint: card ? { x: card.x, y: card.y } : null,
        privateMode,
        history: session.history,
        scannedLevels: app.scannedLevels,
        onStep: setStep,
        deferAux: true,
      });
      // store only the display (private-blurred) versions on this device
      const dispCanvas = document.createElement('canvas');
      dispCanvas.width = result.display.width;
      dispCanvas.height = result.display.height;
      dispCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.display.data), result.display.width, result.display.height), 0, 0);
      await putPhoto('front', await canvasToBlob(dispCanvas));
      const extraShots = Object.keys(extraBlobs.current);
      for (const [k, b] of Object.entries(extraBlobs.current)) {
        const c = await privateDisplay(b, privateMode);
        await putPhoto(k, await canvasToBlob(c));
      }
      frontBlob.current = null;
      extraBlobs.current = {};
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      session.setAnalysis(result);
      session.patch({ profile: result.profile, shots: ['front', ...extraShots], analyzedAt: Date.now() });
      navigate('/profile', { replace: true, state: loc.state });
      // render textures are built while she checks her profile
      setTimeout(() => session.setAnalysis(withRenderAux(result)), 60);
    } catch (e) {
      setErr(e.code === 'no-face' ? 'no-face' : 'analysis');
      setPhase('error');
    }
  };

  const stepItems = ANALYSIS_STEPS.map((k) => {
    const i = ANALYSIS_STEPS.indexOf(step);
    const j = ANALYSIS_STEPS.indexOf(k);
    return { key: k, label: t(`analysis.${k}`), state: j < i ? 'done' : j === i ? 'doing' : 'todo' };
  });

  return (
    <main className="screen mx-auto max-w-[900px]">
      <TopBar title={t('capture.title')} step={t('flow.step', { n: 1, total: 7 })} onBack={() => { stopCamera(); navigate(session.mode === 'home' ? `/t/${session.salonId}` : '/home'); }} />

      {phase === 'note' ? (
        <section className="mx-auto max-w-[560px]">
          <div className="card mb-6 p-6">
            <Icon name="lock" size={32} className="text-clay" />
            <h2 className="mt-3 text-xl">{t('capture.noteTitle')}</h2>
            <p className="mt-2 text-ink2">{t('capture.note')}</p>
            {privateMode ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-ok">
                <Icon name="eye-off" size={18} />
                {t('capture.privateOn')}
              </p>
            ) : null}
          </div>
          {loc.state?.fromCode ? <p className="mb-4 rounded-control border border-ok p-3 text-sm text-ok">{t('capture.codeLoaded')}</p> : null}
          <div className="mb-6 flex flex-wrap gap-2">
            <Chip selected={!quick} onClick={() => setQuick(false)}>{t('capture.fullMode')}</Chip>
            <Chip selected={quick} onClick={() => setQuick(true)}>{t('capture.quickMode')}</Chip>
          </div>
          <Button icon="camera" onClick={openCamera} disabled={!modelsReady && !err}>
            {modelsReady ? t('capture.open') : t('capture.loadingModels')}
          </Button>
          <label className="press mt-3 flex min-h-btn2 cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-surface font-medium">
            <Icon name="upload" />
            {t('capture.upload')}
            <input type="file" accept="image/*" className="sr-only" onChange={onUpload} />
          </label>
          {err === 'camera-denied' ? <ErrorBox title={t('capture.deniedTitle')} body={t('capture.deniedBody')} /> : null}
          {err === 'camera' ? <ErrorBox title={t('capture.cameraError')} body={t('capture.cameraErrorBody')} /> : null}
          {err === 'models' ? <ErrorBox title={t('capture.modelsError')} body={t('capture.modelsErrorBody')} /> : null}
        </section>
      ) : null}

      <section className={phase === 'camera' ? '' : 'hidden'}>
        <div className="relative mx-auto max-w-[640px] overflow-hidden rounded-card bg-black" style={{ animation: flash ? `${flash % 2 ? 'flash-edge' : 'flash-edge-b'} 420ms ease-out` : undefined }}>
          <video ref={videoRef} playsInline muted className="hidden" />
          <canvas ref={viewRef} className="block h-auto w-full" style={{ transform: mirror && facing === 'user' ? 'scaleX(-1)' : 'none' }} aria-label={t('capture.preview')} />
          <svg viewBox="0 0 100 133" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {shot === 'front' ? <ellipse cx="50" cy="52" rx="19" ry="26" fill="none" stroke="#FBF8F4" strokeWidth="0.5" strokeDasharray="2 1.5" opacity="0.85" /> : null}
            {shot === 'left' || shot === 'right' ? <ellipse cx="50" cy="52" rx="15" ry="26" fill="none" stroke="#FBF8F4" strokeWidth="0.5" strokeDasharray="2 1.5" opacity="0.85" /> : null}
            <path d="M12 128 C 22 100, 38 96, 50 96 C 62 96, 78 100, 88 128" fill="none" stroke="#FBF8F4" strokeWidth="0.5" strokeDasharray="2 1.5" opacity="0.7" />
          </svg>
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            <ShotDots shots={shots} current={shot} done={done} />
            <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white">{t(`shot.${shot || 'front'}`)}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="rounded-control bg-black/60 px-4 py-3 text-center text-[17px] font-semibold text-white" aria-live="polite">
              {live.hint ? t(live.hint) : t('capture.hold')}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full bg-white transition-[width] duration-100" style={{ width: `${Math.round((live.progress || 0) * 100)}%` }} />
            </div>
          </div>
        </div>
        <div className="mx-auto mt-4 grid max-w-[640px] grid-cols-3 gap-2">
          <Button variant="secondary" icon="flip" onClick={() => setMirror((m) => !m)}>{t('capture.mirror')}</Button>
          <Button variant="secondary" icon="refresh" onClick={() => { setFacing((f) => (f === 'user' ? 'environment' : 'user')); stopCamera(); setTimeout(openCamera, 50); }}>
            {t('capture.switch')}
          </Button>
          {shot === 'back' ? (
            <Button variant="secondary" icon="close" onClick={() => setShotIdx((i) => i + 1)}>{t('capture.skip')}</Button>
          ) : (
            <Button variant="secondary" icon="camera" onClick={() => loopRef.current?.shoot()}>{t('capture.manual')}</Button>
          )}
        </div>
        {shot === 'back' ? (
          <div className="mx-auto mt-3 max-w-[640px]">
            <Button icon="camera" onClick={() => loopRef.current?.shoot()}>{t('capture.backShoot')}</Button>
          </div>
        ) : null}
      </section>

      {phase === 'card' && !frontUrl ? <Steps items={[{ key: 'p', label: t('capture.preparing'), state: 'doing' }]} /> : null}
      {phase === 'card' && frontUrl ? (
        <section className="mx-auto max-w-[560px]">
          <h2 className="mb-2 text-xl">{t('capture.cardTitle')}</h2>
          <p className="mb-4 text-sm text-ink2">{t('capture.cardBody')}</p>
          <div className="relative overflow-hidden rounded-card">
            <img src={frontUrl} alt="" className="block w-full select-none" onClick={tapCard} draggable={false} />
            {card ? (
              <span className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-plum bg-white/40" style={{ left: `${card.px}%`, top: `${card.py}%` }} />
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink2">{card ? t('capture.cardSet') : t('capture.cardNone')}</p>
          <div className="mt-4 space-y-3">
            <Button icon="check" onClick={continueAfterFront}>{t('capture.usePhoto')}</Button>
            <Button variant="secondary" icon="camera" onClick={() => { setCard(null); setFrontUrl(null); frontBlob.current = null; frontCanvasRef.current = null; setPhase('note'); }}>
              {t('capture.retake')}
            </Button>
          </div>
        </section>
      ) : null}

      {phase === 'analyzing' ? (
        <section className="mx-auto max-w-[560px] py-6">
          <h2 className="text-xl">{t('analysis.title')}</h2>
          <p className="mt-1 text-sm text-ink2">{t('analysis.onDevice')}</p>
          <Steps items={stepItems} />
        </section>
      ) : null}

      {phase === 'error' ? (
        <section className="mx-auto max-w-[560px]">
          <ErrorBox
            title={err === 'no-face' ? t('analysis.noFace') : t('analysis.failed')}
            body={err === 'no-face' ? t('analysis.noFaceBody') : t('analysis.failedBody')}
            action={<Button variant="secondary" icon="camera" onClick={() => { setPhase('note'); setErr(null); setDone([]); setShotIdx(0); }}>{t('capture.retake')}</Button>}
          />
        </section>
      ) : null}
    </main>
  );
}
