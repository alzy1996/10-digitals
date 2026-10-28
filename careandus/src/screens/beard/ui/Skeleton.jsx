import { cx } from './kit.js';

const RADIUS = { ctl: 'rounded-control', card: 'rounded-card', full: 'rounded-full', none: 'rounded-none' };

/**
 * Shimmer placeholder while analysis runs. Decorative; the screen announces the step name
 * itself. Size it with classes or width/height.
 */
export default function Skeleton({ className, width, height, rounded = 'ctl', style }) {
  return (
    <div
      aria-hidden="true"
      className={cx('bg-surface2', RADIUS[rounded] || RADIUS.ctl, className)}
      style={{ width, height, animation: 'pulse-soft 1.2s infinite', ...style }}
    />
  );
}
