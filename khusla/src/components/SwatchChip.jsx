/** A physical hair swatch: a tied band on top, the color body, one soft highlight stripe. */
export default function SwatchChip({ color, size = 44, label, selected = false, measured }) {
  const w = size * 0.62;
  return (
    <span className="inline-flex flex-col items-center" title={label}>
      <svg width={w} height={size} viewBox="0 0 28 44" role="img" aria-label={label}>
        <path d="M6 2h16v6H6z" fill="var(--line)" stroke={selected ? 'var(--plum)' : 'var(--line)'} />
        <path d="M6.5 8c-.8 9 .4 22 7.5 34 7.1-12 8.3-25 7.5-34z" fill={color} stroke={selected ? 'var(--plum)' : 'rgba(29,26,28,.15)'} strokeWidth={selected ? 2 : 1} />
        <path d="M10.5 10c-.2 7.5.6 16 3.2 25" stroke="rgba(255,255,255,.38)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
      {measured ? <span className="mt-0.5 block h-1.5 w-4 rounded-full" style={{ background: measured }} aria-hidden /> : null}
    </span>
  );
}
