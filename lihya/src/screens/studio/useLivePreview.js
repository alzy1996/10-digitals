// Live AR in the Studio (PRD 7.1): the front camera into a hidden video, the beard drawn
// by createArRenderer on a canvas made for this run (a disposed WebGL canvas cannot be
// reused), the look kept in step with the controls. The camera stops and the renderer
// is disposed when the preview is turned off, the tab is hidden or the screen closes.
// Camera refused, no camera, or no WebGL: onFallback(kind) so the screen shows the photo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createArRenderer } from '../../ai/index.js';
import { cameraErrorKind, openCamera, stopStream } from '../capture/camera.js';

const HOLD_MS = 180;

/**
 * @param {object} o
 * @param {boolean} o.enabled live preview wanted (Live chosen and the tab visible)
 * @param {{ current: HTMLElement|null }} o.hostRef element the AR canvas goes into
 * @param {{ current: HTMLVideoElement|null }} o.videoRef the hidden video
 * @param {*} [o.resetKey] start over when it changes (the layout put a new host and video in place)
 * @returns {{ status: 'idle'|'starting'|'on', face: boolean, holding: boolean,
 *   holdHandlers: object, snapshot: () => HTMLCanvasElement|null }}
 */
export function useLivePreview({ enabled, hostRef, videoRef, resetKey, params, profile, outline, days, mirror, growthMmPerDay, onFallback, onLowFps }) {
  const [status, setStatus] = useState('idle');
  const [face, setFace] = useState(true);
  const [holding, setHolding] = useState(false);
  const arRef = useRef(null);
  const holdRef = useRef({ timer: 0, on: false, id: null });
  const latest = useRef(null);
  latest.current = { params, profile, outline, days, mirror, growthMmPerDay, onFallback, onLowFps };

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return undefined;
    }
    const video = videoRef.current;
    const host = hostRef.current;
    if (!video || !host) return undefined;
    let cancelled = false;
    let stream = null;
    let ar = null;
    let canvas = null;
    const offs = [];
    const fallback = (kind) => {
      if (!cancelled && latest.current.onFallback) latest.current.onFallback(kind);
    };
    setStatus('starting');
    setFace(true);
    openCamera()
      .then(async (s) => {
        stream = s;
        if (cancelled) {
          stopStream(s);
          return;
        }
        video.srcObject = s;
        try {
          await video.play();
        } catch (err) {
          if (!cancelled) console.warn('studio: video.play()', err);
        }
        if (cancelled) return;
        canvas = document.createElement('canvas');
        canvas.className = 'block h-full w-full';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        const L = latest.current;
        try {
          ar = createArRenderer({ canvas, video, mirror: L.mirror, growthMmPerDay: L.growthMmPerDay });
        } catch (err) {
          console.warn('studio: live preview could not start', err);
          fallback('webgl');
          return;
        }
        arRef.current = ar;
        ar.setLook(L.params, L.profile);
        ar.setMode(L.outline ? 'outline' : 'beard');
        ar.setTimelineDays(L.days);
        offs.push(ar.on('low-fps', () => latest.current.onLowFps && latest.current.onLowFps()));
        offs.push(ar.on('face', (found) => !cancelled && setFace(Boolean(found))));
        offs.push(
          ar.on('error', (err) => {
            if (err && err.code === 'contextLost') fallback('webgl');
            else console.warn('studio: live preview', err);
          }),
        );
        ar.start();
        setStatus('on');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('studio: camera did not open', err);
        fallback(cameraErrorKind(err));
      });
    return () => {
      cancelled = true;
      for (const off of offs) off();
      if (ar) ar.dispose();
      if (arRef.current === ar) arRef.current = null;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (stream) stopStream(stream);
      video.srcObject = null;
    };
  }, [enabled, hostRef, videoRef, resetKey]);

  // Keep the renderer in step with the controls (not while the original is held).
  useEffect(() => {
    const ar = arRef.current;
    if (ar && !holdRef.current.on) ar.setLook(params, profile);
  }, [params, profile, status]);
  useEffect(() => {
    const ar = arRef.current;
    if (ar) ar.setMode(outline ? 'outline' : 'beard');
  }, [outline, status]);
  useEffect(() => {
    const ar = arRef.current;
    if (ar) ar.setTimelineDays(days);
  }, [days, status]);
  useEffect(() => {
    const ar = arRef.current;
    if (ar) ar.setMirror(mirror);
  }, [mirror, status]);

  // Press and hold: the live face without the new beard.
  const release = useCallback(() => {
    const h = holdRef.current;
    clearTimeout(h.timer);
    h.timer = 0;
    h.id = null;
    if (!h.on) return;
    h.on = false;
    setHolding(false);
    const ar = arRef.current;
    const L = latest.current;
    if (ar) ar.setLook(L.params, L.profile);
  }, []);

  const holdHandlers = {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest && e.target.closest('button')) return;
      const h = holdRef.current;
      clearTimeout(h.timer);
      h.id = e.pointerId;
      h.timer = setTimeout(() => {
        h.on = true;
        setHolding(true);
        const ar = arRef.current;
        if (ar) ar.setLook(null, null);
      }, HOLD_MS);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onContextMenu: (e) => e.preventDefault(),
  };

  useEffect(() => () => clearTimeout(holdRef.current.timer), []);

  const snapshot = useCallback(() => {
    const ar = arRef.current;
    try {
      return ar ? ar.snapshot() : null;
    } catch (err) {
      console.warn('studio: snapshot failed', err);
      return null;
    }
  }, []);

  return { status: enabled ? status : 'idle', face, holding, holdHandlers, snapshot };
}

export default useLivePreview;
