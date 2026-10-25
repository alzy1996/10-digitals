import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MAX_DRAW_SIDE = 1600;

function shotSize(shot) {
  if (!shot || !shot.canvas) return { w: 0, h: 0 };
  return { w: shot.width || shot.canvas.width || 0, h: shot.height || shot.canvas.height || 0 };
}

/**
 * A captured shot drawn un-mirrored (captured photos are never mirrored), fitted inside
 * the nearest positioned parent like object-fit: contain. `onTap(xNorm, yNorm)` reports a
 * tap as a share of the shot's width and height; `rect` ({ x, y, w, h } shares) draws a
 * brass outline; `children` are laid over the photo box.
 */
export default function ShotView({ shot, onTap, rect, label, dim = false, children }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [box, setBox] = useState(null);
  const { w: sw, h: sh } = shotSize(shot);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || !sw || !sh) return undefined;
    const fit = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const s = Math.min(cw / sw, ch / sh);
      setBox((prev) => {
        const next = { w: Math.round(sw * s), h: Math.round(sh * s) };
        return prev && prev.w === next.w && prev.h === next.h ? prev : next;
      });
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
    };
  }, [sw, sh]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !box || !shot || !shot.canvas || !sw || !sh) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const s = Math.min(1, (box.w * dpr) / sw, MAX_DRAW_SIDE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * s));
    const h = Math.max(1, Math.round(sh * s));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(shot.canvas, 0, 0, w, h);
    } catch {
      // the shot was released by a session wipe
    }
  }, [box, shot, sw, sh]);

  const handleTap = (e) => {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onTap(x, y);
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {box ? (
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={label}
            className={`block h-full w-full transition-opacity duration-screen ${dim ? 'opacity-40' : 'opacity-100'}`}
          />
          {rect ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-[4px] border-2 border-brass"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            />
          ) : null}
          {onTap ? <div aria-hidden="true" className="absolute inset-0 cursor-crosshair" onClick={handleTap} /> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
