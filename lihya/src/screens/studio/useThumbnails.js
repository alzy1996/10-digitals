import { useCallback, useEffect, useRef, useState } from 'react';
import { renderThumbnail } from '../../ai/index.js';
import { paramsFromStyle } from '../../lib/look.js';

/**
 * Style thumbnails drawn on the customer's own front photo, one at a time (the render
 * engine shares one offscreen WebGL renderer), in the order they are requested.
 * Cached per style id for this photo and profile; a new photo or profile starts over.
 * Unmounting drops the queue and any result still in flight.
 *
 *   const { thumbs, request } = useThumbnails(shots.front, effectiveProfile);
 *   request(style, { priority })   // thumbs[style.id] -> { url } | { error: true }
 */
export function useThumbnails(shot, profile, { width = 320 } = {}) {
  const [thumbs, setThumbs] = useState({});
  const queueRef = useRef([]);
  const requestedRef = useRef(new Set());
  const runningRef = useRef(false);
  const genRef = useRef(0);
  const aliveRef = useRef(false);
  const inputRef = useRef({ shot, profile, width });

  useEffect(() => {
    aliveRef.current = true;
    genRef.current += 1;
    inputRef.current = { shot, profile, width };
    queueRef.current = [];
    requestedRef.current = new Set();
    setThumbs((prev) => (Object.keys(prev).length ? {} : prev));
    return () => {
      aliveRef.current = false;
      genRef.current += 1;
      queueRef.current = [];
      requestedRef.current = new Set();
    };
  }, [shot, profile, width]);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length && aliveRef.current) {
        const gen = genRef.current;
        const job = queueRef.current.shift();
        const { shot: s, profile: p, width: w } = inputRef.current;
        if (!s) break;
        let entry;
        try {
          const url = await renderThumbnail(s, paramsFromStyle(job.style, { profile: p }), p, { width: w });
          entry = { url };
        } catch (err) {
          console.warn('styles: thumbnail could not be drawn', job.id, err);
          entry = { error: true };
        }
        if (!aliveRef.current || gen !== genRef.current) continue;
        setThumbs((m) => ({ ...m, [job.id]: entry }));
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  const request = useCallback(
    (style, { priority = false } = {}) => {
      if (!style || !style.id || !inputRef.current.shot || !aliveRef.current) return;
      if (requestedRef.current.has(style.id)) return;
      requestedRef.current.add(style.id);
      const job = { id: style.id, style };
      if (priority) queueRef.current.unshift(job);
      else queueRef.current.push(job);
      pump();
    },
    [pump],
  );

  return { thumbs, request };
}

export default useThumbnails;
