interface SectionTitleProps {
  pre: string
  accent: string
  post: string
  onDark?: boolean
}

// House display headline: one italic accent word in gold, everything else
// inherits the section's ink color.
export default function SectionTitle({ pre, accent, post, onDark = false }: SectionTitleProps) {
  return (
    <h2
      data-reveal
      className={`anim-wait font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl md:text-7xl ${
        onDark ? 'text-ink' : 'text-ink-dark'
      }`}
    >
      {pre}
      <em className="italic" style={{ color: 'var(--accent)' }}>
        {accent}
      </em>
      {post}
    </h2>
  )
}
