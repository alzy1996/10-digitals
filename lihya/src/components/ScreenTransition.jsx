import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { prefersReducedMotion } from './kit.js';

/** How far a new screen slides in, in CSS px (PRD 9.3: a quiet 320 ms screen change). */
export const SCREEN_SHIFT_PX = 12;

/** "320ms" / "0.32s" / "" -> milliseconds (0 when unset or unreadable). */
export function parseDurationMs(value) {
  const s = String(value ?? '').trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return /ms$/i.test(s) ? n : /s$/i.test(s) ? n * 1000 : n;
}

/**
 * Keyframes and timing for a screen change, or null when nothing should move (reduced motion,
 * zero duration). Opacity 0 -> 1 with a small inline slide: a new screen (PUSH) comes in from the
 * end side, going back (POP) from the start side, and a redirect (REPLACE) only fades. The end
 * side is the right in LTR and the left in RTL. fill 'none': once it ends nothing stays applied,
 * so no transform is left on an ancestor of the camera, the Studio canvas or fixed sheets.
 */
export function screenEnterAnimation({ navType, rtl = false, durationMs = 0, easing, reducedMotion = false }) {
  if (reducedMotion || !(durationMs > 0)) return null;
  const toward = navType === 'PUSH' ? 1 : navType === 'POP' ? -1 : 0;
  const shift = toward * (rtl ? -1 : 1) * SCREEN_SHIFT_PX;
  const keyframes = shift
    ? [
        { opacity: 0, transform: `translate3d(${shift}px, 0, 0)` },
        { opacity: 1, transform: 'none' },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
  return { keyframes, options: { duration: durationMs, easing: easing || 'ease-out', fill: 'none' } };
}

function readMotion() {
  try {
    const root = document.documentElement;
    const css = getComputedStyle(root);
    return {
      rtl: root.dir === 'rtl',
      durationMs: parseDurationMs(css.getPropertyValue('--dur-screen')),
      easing: css.getPropertyValue('--ease-out').trim(),
      reducedMotion: prefersReducedMotion(),
    };
  } catch {
    return { rtl: false, durationMs: 0, easing: '', reducedMotion: true };
  }
}

/**
 * Wraps the routes and plays the 320 ms screen change (--dur-screen) whenever the path changes.
 * Nothing is remounted: the animation runs on this wrapper through the Web Animations API, after
 * the new screen has committed (router navigations are transitions, so a lazy screen has loaded by
 * then). The first screen of a visit appears without motion.
 */
export default function ScreenTransition({ children, className }) {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const ref = useRef(null);
  const shownPath = useRef(pathname);

  useLayoutEffect(() => {
    if (shownPath.current === pathname) return undefined;
    shownPath.current = pathname;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return undefined;
    const plan = screenEnterAnimation({ navType, ...readMotion() });
    if (!plan) return undefined;
    const anim = el.animate(plan.keyframes, plan.options);
    return () => anim.cancel();
  }, [pathname, navType]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
