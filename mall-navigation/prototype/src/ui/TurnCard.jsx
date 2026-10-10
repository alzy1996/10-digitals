import { formatDistance, t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { turnCardContent } from './hudModel.js'
import { pick } from './model.js'
import { SimulationTag } from './SimulationTag.jsx'
import './hud.css'

/** "28 m" -> { value: '28', unit: 'm' }; "١٫٢ كم" -> { value: '١٫٢', unit: 'كم' }. */
function splitDistance(text) {
  const i = text.lastIndexOf(' ')
  return i > 0 ? { value: text.slice(0, i), unit: text.slice(i + 1) } : { value: text, unit: '' }
}

/**
 * Walk view turn card (DESIGN-GLASS.md 7.3, ref 3): dark glass (blurred), the step's 52 px tile (teal; arrival: mint
 * flag), the metres left to where the step ends in light numerals, a small verb line ("Turn right at") and a big name
 * line ("Oud House"). Lift steps add the button to press; a ride with a turn right after it adds that turn ("then turn
 * left at the top"; a lift: once you ride, in place of the button line). The amber SIMULATION pill floats in the
 * card's top-end corner, at the end of the verb line, so it is on screen in every Walk view state (the full "Not your
 * live position" note is in its accessible name; only the step text is a polite live region); a verb that needs a
 * second line takes the full width there (balanced lines), and under 380 px wide a connector's verb drops its "to".
 * On screens under 700 px tall a summary line ("17:42 arrival · 95 m left") replaces the stat chips. The condensed
 * lines are hidden from screen readers. Turn arrows are never mirrored in Arabic.
 *
 * @param {{ index: object, lang: 'en'|'ar', route: object, stepIndex: number, distanceM: number, summary?: string,
 *   riding?: boolean, className?: string }} props  distanceM = metres left to
 *   the step's end (hudModel.tripProgress().stepLeftM), or null to hide it (during a lift / stairs ride); riding: a
 *   lift / the stairs carry you (the lift card says which button: the card drops its own "Press" line)
 */
export function TurnCard({ index, lang, route, stepIndex, distanceM, summary = '', riding = false, className = '' }) {
  const step = route?.steps?.[Math.max(0, Math.min(route.steps.length - 1, stepIndex))]
  if (!step) return null
  const c = turnCardContent(index, route, stepIndex, lang)
  // no distance on the 0 m start step, nor while a lift / the stairs carry you (null)
  const dist = step.kind === 'start' || distanceM == null ? null : splitDistance(formatDistance(distanceM, lang))
  // the step's own key restarts the slide-up on every step change
  const key = `${step.index}-${lang}`
  return (
    <section className={`turn-card ${className}`} aria-label={t('nav.stepCard', lang)}>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {pick(step.text, lang)}
      </span>
      <div className="tc-start" key={`s${key}`} aria-hidden="true">
        <span className={`tc-tile${c.tone === 'arrive' ? ' is-arrive' : ''}`}>
          <Icon name={c.icon} size={34} />
        </span>
        {dist ? (
          <span className="tc-dist">
            <b>{dist.value}</b>
            <small>{dist.unit}</small>
          </span>
        ) : null}
      </div>
      <div className="tc-text">
        <div className="tc-head">
          <SimulationTag lang={lang} compact />
          <p className="tc-verb" key={`v${key}`} aria-hidden="true">
            {c.verbShort ? (
              <>
                <span className="tc-v-long">{c.verb}</span>
                <span className="tc-v-short">{c.verbShort}</span>
              </>
            ) : (
              c.verb
            )}
          </p>
        </div>
        <div className="tc-body" key={`t${key}`} aria-hidden="true">
          <p className="tc-name">{c.name}</p>
          {c.press && !riding ? (
            <p className="tc-press">
              {t('nav.press', lang)}
              <span className="press-label">
                <bdi dir="ltr">{c.press}</bdi>
              </span>
            </p>
          ) : c.then ? (
            <p className="tc-then">{c.then}</p>
          ) : null}
          {summary ? (
            <p className="tc-summary">
              <span>{summary}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
