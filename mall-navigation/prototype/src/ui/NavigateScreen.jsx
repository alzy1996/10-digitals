import { forwardRef } from 'react'
import { formatDistance, formatDuration, t } from '../i18n/strings.js'
import { Icon, stepIconName } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { pick } from './model.js'

const SPEEDS = [1, 2, 4]
/** Walking speed used for ETAs (CONTRACT.md section 3). */
const WALK_MPS = 1.2

/**
 * Navigate (S07): step card (large instruction, distance + time, Step n of N), Next (primary) and Back,
 * plus the SIMULATION controls (play / pause, 1x / 2x / 4x). Turn icons follow the walking direction and are never
 * mirrored. In the foldable sheet the head is the one step row (turn icon + instruction; End route is the X in the
 * handle row) and Next / Back the pinned footer right under it, so the folded sheet shows the step and Next and leaves
 * the map almost whole. The body below them: the trip line (Step n of N, distance / time left, progress) with this
 * step's distance / time (and the lift button to press), shown from the default half height up, then the simulator
 * block ("Simulate walk", which opens the Walk view, and the speed) at full (or at half when it fits). The
 * SIMULATION tag and its "not your live position" note share the first line of the simulator block. Under 380 px wide
 * the speed is one 56 px button that cycles 1x / 2x / 4x. On short screens (a phone browser tab, under 700 px tall)
 * the tag sits on the divider line and the status line folds into the play button's label.
 */
export const NavigateScreen = forwardRef(function NavigateScreen(
  { lang, route, stepIndex, sim, onNext, onPrev, onEnd, onPlay, onPause, onSpeed, handoff = null },
  ref,
) {
  const steps = route?.steps ?? []
  const i = Math.max(0, Math.min(steps.length - 1, stepIndex))
  const step = steps[i]
  if (!step) return null
  const total = steps.length
  const isLast = i === total - 1
  const icon = stepIconName(step)
  const kindClass = step.kind === 'arrive' ? 'is-arrive' : ''

  // remaining distance / time from the start of this step (or from the walker while simulating)
  let doneM = 0
  for (let k = 0; k < i; k++) doneM += steps[k].distanceM
  let remainS = 0
  for (let k = i; k < total; k++) remainS += steps[k].etaS
  if (sim.active && Number.isFinite(sim.distanceDoneM)) {
    // a connector step's time is a walk to the lift / escalator plus the wait and ride: the walk part counts
    // down with distance, the ride part with the simulated ride itself
    const walkS = step.kind === 'connector' ? Math.min(step.etaS, step.distanceM / WALK_MPS) : step.etaS
    const rideS = step.etaS - walkS
    const stepDone = Math.max(0, Math.min(step.distanceM, sim.distanceDoneM - doneM))
    const walkFrac = step.distanceM > 0 ? stepDone / step.distanceM : 1
    const rideFrac = step.kind === 'connector' && sim.onConnector ? Math.max(0, Math.min(1, sim.rideProgress ?? 0)) : 0
    remainS -= walkS * walkFrac + rideS * rideFrac
    doneM = Math.max(doneM, sim.distanceDoneM)
  }
  remainS = Math.max(0, remainS)
  const remainM = Math.max(0, route.lengthM - doneM)

  const meta =
    step.kind === 'start'
      ? t('nav.total', lang, { distance: formatDistance(route.lengthM, lang), duration: formatDuration(route.etaS, lang) })
      : step.kind === 'arrive' && step.distanceM < 1
        ? null
        : `${formatDistance(step.distanceM, lang)} · ${formatDuration(step.etaS, lang)}`

  let simLabel = t('sim.walk', lang)
  let simIcon = 'play'
  if (sim.active && sim.playing) {
    simLabel = t('sim.pause', lang)
    simIcon = 'pause'
  } else if (sim.active && sim.done) {
    simLabel = t('sim.replay', lang)
    simIcon = 'restart'
  } else if (sim.active) {
    simLabel = t('sim.resume', lang)
  }

  let status = t('sim.notLiveShort', lang)
  if (sim.active && !sim.done && sim.phase === 'wait') status = t('sim.waitLift', lang)
  else if (sim.active && !sim.done && sim.connectorType === 'lift') status = t('sim.onLift', lang)
  else if (sim.active && !sim.done && sim.connectorType === 'escalator') status = t('sim.onEscalator', lang)
  else if (sim.active && !sim.done && sim.connectorType === 'stairs') status = t('sim.onStairs', lang)

  const simBlock = (
    <div className="sim-bar">
      <div className="sim-head">
        <span className="sim-tag">{t('sim.label', lang)}</span>
        <span className="sim-status" aria-live="polite">
          {status}
        </span>
      </div>
      <div className="sim-row">
        {/* short screens: the SIMULATION tag sits on the divider above this row (the status line is hidden) */}
        <span className="sim-tag sim-tag-inline" aria-hidden="true">
          {t('sim.label', lang)}
        </span>
        <button type="button" className="btn btn-quiet sim-play" onClick={sim.active && sim.playing ? onPause : onPlay} aria-label={`${simLabel} · ${status}`}>
          <Icon name={simIcon} size={22} />
          <span>{simLabel}</span>
        </button>
        <div className="speed-seg wide-only" role="group" aria-label={t('sim.speedLabel', lang)}>
          {SPEEDS.map((m) => (
            <button key={m} type="button" aria-pressed={sim.speed === m} onClick={() => onSpeed(m)}>
              {t(`sim.speed${m}`, lang)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-quiet speed-cycle narrow-only"
          aria-label={t('sim.speedNow', lang, { speed: t(`sim.speed${sim.speed}`, lang) })}
          onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(sim.speed) + 1) % SPEEDS.length])}
        >
          {t(`sim.speed${sim.speed}`, lang)}
        </button>
      </div>
    </div>
  )

  const footer = (
    <div className="nav-actions">
      <button
        type="button"
        className="btn btn-secondary nav-back"
        onClick={onPrev}
        disabled={i === 0}
        aria-label={t('nav.prev', lang)}
        style={i === 0 ? { opacity: 0.4 } : undefined}
      >
        <Icon name="back" size={24} className="flip-rtl" />
      </button>
      <button type="button" className="btn btn-primary flex-1" onClick={onNext}>
        {isLast ? t('arrived.title', lang) : t('nav.next', lang)}
        <Icon name={isLast ? 'check' : 'chevron'} size={22} className={isLast ? undefined : 'flip-rtl'} />
      </button>
    </div>
  )

  // the one row that stays when the sheet is folded: the turn and the instruction (End route sits in the handle row)
  const head = (
    <>
      <button type="button" className="nav-end" onClick={onEnd} aria-label={t('nav.end', lang)} title={t('nav.end', lang)}>
        <Icon name="close" size={20} />
      </button>
      <div className="step-top">
        <span className={`turn-icon ${kindClass}`} aria-hidden="true">
          <Icon name={icon} size={34} />
        </span>
        <p className="step-text flex-1 min-w-0" aria-live="polite" aria-atomic="true">
          {pick(step.text, lang)}
        </p>
      </div>
    </>
  )

  // under Next (shown from half up): where the trip stands (step n of N, what is left, progress) and this step's
  // distance / time (and the lift button to press)
  const tripInfo = (
    <div className="nav-info">
      <div className="nav-top">
        {route.stepFree ? (
          <span className="nav-stepfree" title={t('place.stepFreeOn', lang)} aria-label={t('place.stepFreeOn', lang)}>
            <Icon name="accessible" size={18} />
          </span>
        ) : null}
        <span className="nav-count nowrap">{t('nav.step', lang, { n: i + 1, total })}</span>
        <span className="nav-left nowrap">{t('nav.remaining', lang, { distance: formatDistance(remainM, lang), duration: formatDuration(remainS, lang) })}</span>
      </div>
      <div className="progress" aria-hidden="true">
        {steps.map((s) => (
          <span key={s.index} className={s.index < i ? 'is-done' : s.index === i ? 'is-current' : ''} />
        ))}
      </div>
      {meta || (step.kind === 'connector' && step.connector?.type === 'lift') ? (
        <div className="step-meta" aria-live="polite" aria-atomic="true">
          {meta ? <span className="nowrap">{meta}</span> : null}
          {step.kind === 'connector' && step.connector?.type === 'lift' && step.connector.buttonLabel ? (
            <span className="inline-flex items-center gap-2 nowrap">
              {t('nav.press', lang)}
              {/* the code as printed on the lift panel, in both languages (ui/model.levelButtonLabel) */}
              <span className="press-label">
                <bdi dir="ltr">{pick(step.connector.buttonLabel, 'en')}</bdi>
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <Sheet ref={ref} label={t('nav.stepCard', lang)} className="nav-sheet" head={head} footer={footer} bodyAfterFooter>
      {tripInfo}
      {simBlock}
      {/* v0.5 kiosk: Continue on your phone */}
      {handoff}
    </Sheet>
  )
})
