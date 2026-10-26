import { cx, useOptionalT } from './kit.js';

/**
 * Shot progress under the camera (PRD 9.6): one dot per shot, filled when taken.
 * `done` is a count or an array of booleans (one per shot); `current` (index) rings the
 * shot being taken now.
 */
export default function ShotDots({ total = 4, done = 0, current, className }) {
  const { t } = useOptionalT();
  const list = Array.isArray(done)
    ? Array.from({ length: Math.max(total, done.length) }, (_, i) => Boolean(done[i]))
    : Array.from({ length: total }, (_, i) => i < Number(done || 0));
  const count = list.filter(Boolean).length;
  return (
    <div
      role="img"
      aria-label={t('ui.shotDots', { done: count, total: list.length })}
      className={cx('flex items-center justify-center gap-3', className)}
    >
      {list.map((d, i) => (
        <span
          key={i}
          className={cx(
            'h-3 w-3 rounded-full border-2 transition-colors duration-[var(--dur-press)] ease-out',
            d ? 'border-brass bg-brass' : i === current ? 'border-brass bg-transparent' : 'border-text-2/70 bg-transparent',
            i === current && !d && 'scale-125',
          )}
        />
      ))}
    </div>
  );
}
