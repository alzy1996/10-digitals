import { MessageCircle } from 'lucide-react'
import { IG_URL, waLink } from '../content/content'
import { useI18n } from '../lib/i18n'

// lucide dropped brand icons; minimal camera-in-rounded-square glyph
function InstagramIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  )
}

// Closing call-to-action on the open bronze page: giant display line,
// WhatsApp primary pill, Instagram ghost pill.
export default function Order() {
  const { t } = useI18n()

  return (
    <section id="order" className="px-5 py-24 text-center sm:px-8 md:py-32">
      <h2
        data-reveal
        className="anim-wait mx-auto max-w-4xl font-display text-5xl leading-[1.02] tracking-tight text-ink-dark sm:text-6xl md:text-7xl"
      >
        {t.order.titlePre}
        <em className="italic" style={{ color: 'var(--accent-deep)' }}>
          {t.order.titleAccent}
        </em>
        {t.order.titlePost}
      </h2>
      <div data-reveal className="anim-wait mt-11 flex flex-wrap items-center justify-center gap-4">
        <a
          href={waLink(t.order.waGeneralMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-2.5 rounded-pill px-8 py-3.5 text-sm font-medium transition-transform duration-300 hover:scale-[1.04]"
          style={{ background: 'var(--panel)', color: 'var(--ink)' }}
        >
          <MessageCircle size={17} strokeWidth={2} />
          {t.order.whatsapp}
        </a>
        <a
          href={IG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-2.5 rounded-pill border px-8 py-3.5 text-sm font-medium text-ink-dark transition-colors duration-300 hover:border-accent-deep"
          style={{ borderColor: 'var(--line-dark)' }}
        >
          <InstagramIcon size={17} />
          {t.order.instagram}
        </a>
      </div>
    </section>
  )
}
