import SectionTitle from '../components/SectionTitle'
import { useI18n } from '../lib/i18n'

// Featured perfume breakdown — TOP / HEART / BASE in three numbered
// columns inside a dark panel.
export default function Signature() {
  const { t } = useI18n()

  return (
    <section id="signature" className="mt-6 px-3 sm:px-5">
      <div className="rounded-lg2 border border-line bg-panel px-6 py-14 sm:px-10 md:py-20 xl:px-14">
        <SectionTitle
          pre={t.signature.titlePre}
          accent={t.signature.titleAccent}
          post={t.signature.titlePost}
          onDark
        />
        <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-6">
          {t.signature.notes.map((note) => (
            <div key={note.num} data-reveal className="anim-wait border-t border-line pt-6">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-5xl text-ink opacity-30 md:text-6xl">
                  {note.num}
                </span>
                <span className="en-tracking text-[10px] uppercase tracking-[.3em] text-muted">
                  {note.tier}
                </span>
              </div>
              <h3 className="mt-5 font-display text-3xl italic" style={{ color: 'var(--accent)' }}>
                {note.name}
              </h3>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{note.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
