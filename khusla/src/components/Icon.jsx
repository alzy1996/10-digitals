const SPRITE = `${import.meta.env.BASE_URL}icons/sprite.svg`;

export default function Icon({ name, size = 24, className = '', title, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <use href={`${SPRITE}#i-${name}`} />
    </svg>
  );
}
