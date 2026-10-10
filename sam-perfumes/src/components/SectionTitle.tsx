interface SectionTitleProps {
  kicker?: string
  pre: string
  accent: string
  post: string
  onDark?: boolean
}

// Chapter headline (P3 luxury-story): parenthetical kicker, then the
// display line with one italic gold accent word. lib/scroll scrubs every
// [data-scrub-title] from blurred to sharp as it travels up the viewport.
export default function SectionTitle({ kicker, pre, accent, post, onDark = false }: SectionTitleProps) {
  return (
    <div>
      {kicker && (
        <p
          className={`en-tracking mb-5 text-[11px] uppercase tracking-[.35em] ${
            onDark ? 'text-muted' : 'text-muted-dark'
          }`}
        >
          {kicker}
        </p>
      )}
      <h2
        data-scrub-title
        className={`font-display text-5xl leading-[0.98] tracking-[-0.02em] sm:text-6xl md:text-7xl ${
          onDark ? 'text-ink' : 'text-ink-dark'
        }`}
      >
        {pre}
        <em className="italic" style={{ color: onDark ? 'var(--accent)' : 'var(--accent-deep)' }}>
          {accent}
        </em>
        {post}
      </h2>
    </div>
  )
}
