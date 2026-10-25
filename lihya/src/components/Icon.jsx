import { cx, isMirroredIcon } from './kit.js';

const SPRITE = `${import.meta.env?.BASE_URL || '/'}icons/sprite.svg`;

/**
 * Line icon from the sprite (public/icons/sprite.svg): 24 px grid, 1.5 px stroke.
 * Decorative (aria-hidden) unless `title` is given. Directional icons (arrows,
 * chevrons left/right, undo, logout, backspace) mirror in RTL; pass `mirror`
 * to force it on or off.
 */
export default function Icon({ name, size = 24, className, title, mirror, ...rest }) {
  const flip = mirror ?? isMirroredIcon(name);
  const labelled = Boolean(title);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      className={cx('inline-block shrink-0', flip && 'rtl:-scale-x-100', className)}
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      <use href={`${SPRITE}#${name}`} />
    </svg>
  );
}
