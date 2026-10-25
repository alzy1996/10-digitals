import { cx } from './kit.js';

const RADIUS = { ctl: 'rounded-ctl', card: 'rounded-card', full: 'rounded-full', none: 'rounded-none' };

/**
 * Shimmer placeholder (PRD 8.5: skeleton shimmer while analysis runs). Decorative; the
 * screen announces the step name itself. Size it with classes or width/height.
 */
export default function Skeleton({ className, width, height, rounded = 'ctl', style }) {
  return (
    <div
      aria-hidden="true"
      className={cx('skeleton', RADIUS[rounded] || RADIUS.ctl, className)}
      style={{ width, height, ...style }}
    />
  );
}
