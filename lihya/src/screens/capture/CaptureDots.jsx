import { useT } from '../../lib/i18n/useT.js';
import { cx } from '../../components/kit.js';

/**
 * Shot progress under the camera (PRD 9.6) that also retakes: one dot per shot of the
 * mode, filled when taken, ringed for the shot being taken now. A taken dot is a 44 px
 * button that retakes that one shot.
 */
export default function CaptureDots({ order, shots, current, onRetake, disabled = false, className }) {
  const { t } = useT();
  return (
    <div role="group" aria-label={t('capture.shots')} className={cx('flex items-center justify-center', className)}>
      {order.map((id) => {
        const done = Boolean(shots && shots[id]);
        const now = !done && id === current;
        const name = t(`ai.shot.${id}`);
        const dot = (
          <span
            aria-hidden="true"
            className={cx(
              'block rounded-full border-2 transition-[transform,background-color] duration-press ease-out',
              done ? 'h-3.5 w-3.5 border-brass bg-brass' : now ? 'h-4 w-4 border-brass bg-transparent' : 'h-3.5 w-3.5 border-text-2 bg-transparent',
            )}
          />
        );
        if (done && onRetake && !disabled) {
          return (
            <button
              key={id}
              type="button"
              onClick={() => onRetake(id)}
              aria-label={t('capture.shotTaken', { shot: name })}
              title={t('capture.shotTaken', { shot: name })}
              className="press inline-flex h-11 w-11 items-center justify-center rounded-full active:bg-surface-2"
            >
              {dot}
            </button>
          );
        }
        return (
          <span
            key={id}
            role="img"
            aria-label={done ? name : t(now ? 'capture.shotNow' : 'capture.shotLater', { shot: name })}
            className="inline-flex h-11 w-11 items-center justify-center"
          >
            {dot}
          </span>
        );
      })}
    </div>
  );
}
