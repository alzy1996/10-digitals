import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createRenderer, webgl2Available } from '../ai/index.js';
import { useT } from '../lib/i18n/useT.js';
import { ErrorBox } from './States.jsx';

/**
 * The photo canvas. Draws with WebGL2 on every params change; the previous frame cross-fades out in 120 ms.
 * Children are overlays drawn in image coordinates (an absolutely positioned SVG/canvas layer).
 */
const HairStage = forwardRef(function HairStage({ data, params, children, className = '', label }, ref) {
  const { t } = useT();
  const glRef = useRef(null);
  const underRef = useRef(null);
  const rendererRef = useRef(null);
  const [failed, setFailed] = useState(() => !webgl2Available());
  const [fadeKey, setFadeKey] = useState(0);
  const raf = useRef(0);
  const loadedVersion = useRef(null);

  useEffect(() => {
    if (failed || !glRef.current) return undefined;
    try {
      rendererRef.current = createRenderer(glRef.current);
    } catch {
      setFailed(true);
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      loadedVersion.current = null;
    };
  }, [failed]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !data) return;
    if (loadedVersion.current !== data.version) {
      r.setSource(data.display.data, data.display.width, data.display.height);
      r.setAuxAll(data.aux);
      loadedVersion.current = data.version;
    }
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const under = underRef.current;
      const gl = glRef.current;
      if (under && gl && gl.width > 1) {
        if (under.width !== gl.width) {
          under.width = gl.width;
          under.height = gl.height;
        }
        under.getContext('2d').drawImage(gl, 0, 0);
      }
      r.draw(params);
      setFadeKey((k) => k + 1);
    });
    return () => cancelAnimationFrame(raf.current);
  }, [data, params]);

  useImperativeHandle(ref, () => ({
    snapshot() {
      const gl = glRef.current;
      const out = document.createElement('canvas');
      out.width = gl.width;
      out.height = gl.height;
      out.getContext('2d').drawImage(gl, 0, 0);
      return out;
    },
    get canvas() {
      return glRef.current;
    },
  }));

  if (failed) return <ErrorBox title={t('error.webgl')} body={t('error.webglBody')} />;
  const w = data?.display.width || 4;
  const h = data?.display.height || 5;
  return (
    <div className={`relative mx-auto overflow-hidden rounded-card bg-surface2 ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      <canvas ref={underRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <canvas
        ref={glRef}
        className="absolute inset-0 h-full w-full"
        style={{ animation: `${fadeKey % 2 ? 'fade-in' : 'fade-in-b'} var(--t-fade) linear` }}
        role="img"
        aria-label={label}
      />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
});

export default HairStage;
