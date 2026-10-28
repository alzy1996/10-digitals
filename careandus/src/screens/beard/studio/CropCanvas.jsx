import { useEffect, useRef } from 'react';
import { cx } from '../ui/kit.js';
import { drawCrop } from './frame.js';

/**
 * A canvas showing one crop of a source canvas (the shot photo or a Photo Studio
 * render). Fills its box; the box should have the crop's aspect ratio.
 */
export default function CropCanvas({ source, rect, label, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || !source || !rect) return;
    drawCrop(c, source, rect);
  }, [source, rect]);

  // Free the pixel buffer when the canvas leaves the page (photos stay in memory no longer than needed).
  useEffect(() => {
    const c = ref.current;
    return () => {
      if (!c) return;
      try {
        c.width = 0;
        c.height = 0;
      } catch {
        // already detached
      }
    };
  }, []);

  return (
    <canvas
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={cx('block h-full w-full', className)}
    />
  );
}
