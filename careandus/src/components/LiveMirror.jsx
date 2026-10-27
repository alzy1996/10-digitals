// Live mode: real-time recolor on the camera feed (hair segmenter per frame + the same shader).
import { useEffect, useRef, useState } from 'react';
import { buildLiveAux, createRenderer, segmentHairVideo } from '../ai/hair/index.js';
import { useT } from '../lib/i18n/useT.js';
import Button from './Button.jsx';

export default function LiveMirror({ params, onClose }) {
  const { t } = useT();
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const paramsRef = useRef(params);
  const [fps, setFps] = useState(0);
  const [err, setErr] = useState(null);
  paramsRef.current = params;

  useEffect(() => {
    let stream;
    let raf = 0;
    let stopped = false;
    let renderer;
    let frames = 0;
    let t0 = performance.now();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        renderer = createRenderer(canvasRef.current);
        const lbar = new Uint8Array([128, 20, 0, 255]);
        renderer.setAux('uAux2', lbar, 1, 1);
        renderer.setAux('uAux3', new Uint8Array([128, 128, 128, 128]), 1, 1);
        const loop = async () => {
          if (stopped) return;
          const ts = performance.now();
          const mask = await segmentHairVideo(v, ts).catch(() => null);
          renderer.setSource(v, v.videoWidth, v.videoHeight);
          if (mask) {
            const live = buildLiveAux(mask.conf, mask.width, mask.height);
            renderer.setAux('uAux1', live.aux1, live.width, live.height);
          }
          renderer.draw({ ...paramsRef.current, hairMeanL: 28, maxCm: 40, regrowthCm: 0, hijab: false, showMask: 0 });
          frames += 1;
          if (ts - t0 > 1000) {
            setFps(Math.round((frames * 1000) / (ts - t0)));
            frames = 0;
            t0 = ts;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setErr(true);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      renderer?.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="mx-auto h-full max-h-[calc(100dvh-96px)] w-auto max-w-full" style={{ transform: 'scaleX(-1)' }} aria-label={t('color.live')} />
      <div className="flex items-center gap-3 p-4">
        <span className="num rounded-full bg-white/15 px-3 py-1 text-sm text-white">{err ? t('capture.cameraError') : `${fps} fps`}</span>
        <div className="flex-1" />
        <Button full={false} variant="secondary" icon="close" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
