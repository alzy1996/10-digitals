import { useEffect, useRef } from 'react';
import { cx, prefersReducedMotion } from './kit.js';

/**
 * White edge flash for the auto-shutter (the capture screen plays it with the shutter sound).
 * It fires each time `trigger` changes (pass a counter or a timestamp); the first value does not
 * fire. Fixed over the viewport by default; `contained` limits it to the nearest positioned parent.
 * Reduced motion: a short, still flash instead of the fade.
 */
export default function Flash({ trigger, contained = false, className }) {
  const ref = useRef(null);
  const last = useRef(trigger);

  useEffect(() => {
    if (Object.is(last.current, trigger)) return;
    last.current = trigger;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const still = prefersReducedMotion();
    el.animate(
      still
        ? [{ opacity: 0.85 }, { opacity: 0.85, offset: 0.9 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }],
      { duration: still ? 160 : 320, easing: 'ease-out' },
    );
  }, [trigger]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cx(contained ? 'absolute' : 'fixed', 'pointer-events-none inset-0 z-50 opacity-0', className)}
      style={{
        boxShadow: 'inset 0 0 0 10px rgb(255 255 255 / 0.95), inset 0 0 56px 28px rgb(255 255 255 / 0.7)',
      }}
    />
  );
}
