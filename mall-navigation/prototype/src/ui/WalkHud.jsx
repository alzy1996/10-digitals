import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatClock, formatDistance, t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { arrivalEpochMs, bubbleContent, standPoint, tripProgress } from './hudModel.js'
import { levelButtonLabel, levelName } from './model.js'
import { StatChips } from './StatChips.jsx'
import { TurnCard } from './TurnCard.jsx'
import { SimulationTag } from './SimulationTag.jsx'
import { TurnBubble } from './TurnBubble.jsx'
import { MiniMapDome } from './MiniMapDome.jsx'
import { BottomBar } from './BottomBar.jsx'
import { LiftCard } from './LiftCard.jsx'
import './hud.css'

/** Wall clock that ticks at each minute boundary (the arrival time moves while a walk is paused); fixed when given. */
function useMinuteClock(fixedMs) {
  const [now, setNow] = useState(() => fixedMs ?? Date.now())
  useEffect(() => {
    if (fixedMs != null) return undefined
    let id = 0
    const arm = () => {
      id = setTimeout(() => {
        setNow(Date.now())
        arm()
      }, 60000 - (Date.now() % 60000) + 50)
    }
    arm()
    return () => clearTimeout(id)
  }, [fixedMs])
  return fixedMs ?? now
}

function rectIn(el, host) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return { x: Math.round(r.left - host.left), y: Math.round(r.top - host.top), w: Math.round(r.width), h: Math.round(r.height) }
}

/**
 * The first-person Walk view HUD (DESIGN-GLASS.md section 7): stat chips and the turn card with its SIMULATION pill at
 * the top; the turn bubble anchored in the scene; the half-dome mini-map (with the level chip in its start corner) and
 * the bottom bar at the bottom; the lift / stairs card over floor changes. On Arrived only the SIMULATION capsule and a Map button stay (the
 * App shows the glass Arrived sheet). The Walk view is a SIMULATION inside the 3D model, labelled as such in every
 * state.
 *
 * It measures itself and reports the free area to the App (`onLayout`), which forwards it to the engine
 * (`setViewportPadding`, `setScreenObstacles`). While mounted it sets `data-view="fpv"` on <html> and `--walk-toast-top`
 * (toasts then sit under the turn card).
 *
 * @param {object} props
 * @param {object} props.index VenueIndex
 * @param {'en'|'ar'} props.lang
 * @param {object} props.route the shown Route
 * @param {number} props.stepIndex
 * @param {object} props.sim the App's simulator state { active, playing, done, speed, distanceDoneM, phase,
 *   connectorType, onConnector, rideProgress }
 * @param {string} props.levelId the level the walker / eye is on (level chip, mini-map before the first anchors)
 * @param {{ levelId: string, x: number, y: number } | null} [props.car] the saved car's bay centre (mini-map)
 * @param {boolean} [props.arrived] Arrived state: SIMULATION capsule + Map button only
 * @param {number} [props.nowMs] fixed wall clock (tests / gallery); default: the real clock
 * @param {(cb: Function) => Function} [props.onAnchors] engine.onAnchors
 * @param {() => object} [props.getAnchors] engine.getAnchors
 * @param {Function} props.onEnd end the route (the App's 5 s Undo)
 * @param {Function} props.onPlay
 * @param {Function} props.onPause
 * @param {(m: number) => void} props.onSpeed
 * @param {Function} props.onNext
 * @param {(opts?: { via: 'dome' }) => void} props.onOpenMap back to the last map view (`via: 'dome'`: a tap on the
 *   mini-map, which does not change where "Simulate walk" plays)
 * @param {(layout: { padding: { top: number, bottom: number, left: number, right: number },
 *   obstacles: Array<{ x: number, y: number, w: number, h: number }>,
 *   free: { top: number, bottom: number, left: number, right: number } }) => void} [props.onLayout]
 * @param {number} [props.bubbleTopInset] px the turn bubble keeps below the free area's top (a toast under the
 *   turn card is showing); the camera's free area does not change
 */
export function WalkHud({
  index,
  lang,
  route,
  stepIndex,
  sim,
  levelId,
  car = null,
  arrived = false,
  nowMs,
  onAnchors,
  getAnchors,
  onEnd,
  onPlay,
  onPause,
  onSpeed,
  onNext,
  onOpenMap,
  onLayout,
  bubbleTopInset = 0,
}) {
  const hostRef = useRef(null)
  const topRef = useRef(null)
  const chipsRef = useRef(null)
  const cardRef = useRef(null)
  const simRowRef = useRef(null)
  const barRef = useRef(null)
  const domeWrapRef = useRef(null)
  const [free, setFree] = useState(null)
  const onLayoutRef = useRef(onLayout)
  onLayoutRef.current = onLayout
  const now = useMinuteClock(nowMs)

  const steps = route?.steps ?? []
  const i = Math.max(0, Math.min(steps.length - 1, stepIndex ?? 0))
  const step = steps[i] ?? null
  const progress = useMemo(() => tripProgress(route, i, sim), [route, i, sim])
  const tz = index?.venue?.meta?.timezone || 'Asia/Muscat'
  const arrivalMs = arrivalEpochMs(now, progress.remainS)
  const summary = t('hud.summary', lang, { time: formatClock(arrivalMs, lang, tz), distance: formatDistance(progress.remainM, lang) })
  const bubble = useMemo(() => (route ? bubbleContent(index, route, i, lang, sim) : null), [index, route, i, lang, sim])
  const stand = useMemo(() => (route ? standPoint(route, i) : null), [route, i])
  const riding = Boolean(sim?.active && sim?.onConnector && sim?.phase === 'ride' && (sim?.connectorType === 'lift' || sim?.connectorType === 'stairs'))
  // waiting at the lift doors: the bubble keeps its box ("Lift B · Press “B1”") although the eye stands on the stop
  const waiting = Boolean(sim?.active && sim?.onConnector && sim?.phase === 'wait')
  // the bubble keeps clear of a toast under the turn card ("Now on Level 1")
  const bubbleFree = useMemo(() => (free && bubbleTopInset > 0 ? { ...free, top: free.top + bubbleTopInset } : free), [free, bubbleTopInset])

  // <html data-view="fpv"> + toast position while the Walk view is up
  useEffect(() => {
    const root = document.documentElement
    root.dataset.view = 'fpv'
    return () => {
      delete root.dataset.view
      root.style.removeProperty('--walk-toast-top')
    }
  }, [])

  // measure the HUD: free area between the top HUD and the dome; obstacles for the engine's labels
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let last = ''
    const update = () => {
      const hr = host.getBoundingClientRect()
      // the top HUD ends at the turn card (walking) or the SIMULATION row (arrived)
      const sr = (arrived ? simRowRef.current : cardRef.current)?.getBoundingClientRect()
      const dome = domeWrapRef.current?.querySelector('.dome')
      const dr = dome?.getBoundingClientRect()
      const freeTop = sr ? Math.round(sr.bottom - hr.top + 8) : 0
      const domeH = dr && !arrived ? Math.round(hr.bottom - dr.top) : 0
      const next = { top: freeTop, bottom: Math.round(hr.height - domeH), left: 0, right: Math.round(hr.width) }
      const bar = barRef.current?.querySelector('.walk-bar')
      const obstacles = [chipsRef.current, cardRef.current, simRowRef.current, dome, bar].map((el) => rectIn(el, hr)).filter(Boolean)
      const key = JSON.stringify([next, obstacles])
      if (key === last) return
      last = key
      host.style.setProperty('--walk-free-top', `${freeTop}px`)
      host.style.setProperty('--walk-dome-h', `${domeH}px`)
      document.documentElement.style.setProperty('--walk-toast-top', `${freeTop}px`)
      setFree(next)
      onLayoutRef.current?.({ padding: { top: freeTop, bottom: domeH, left: 0, right: 0 }, obstacles, free: next })
    }
    update()
    window.addEventListener('resize', update)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro) {
      ro.observe(host)
      if (topRef.current) ro.observe(topRef.current)
      const dome = domeWrapRef.current?.querySelector('.dome')
      if (dome) ro.observe(dome)
    }
    return () => {
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [arrived, lang, i])

  // the floor as printed on the lift panel ("G", "1", "B1"), named in full for screen readers
  const levelChip = (cls) =>
    levelId ? (
      <span className={cls} role="img" aria-label={levelName(index, levelId, lang)}>
        <bdi dir="ltr">{levelButtonLabel(index, levelId, lang)}</bdi>
      </span>
    ) : null

  if (arrived) {
    return (
      <div ref={hostRef} className="walk-hud is-arrived">
        <div className="walk-vignette" aria-hidden="true" />
        <div ref={topRef} className="walk-top">
          <div ref={simRowRef} className="walk-simrow">
            <SimulationTag lang={lang} />
            <button type="button" className="hud-map-btn" onClick={() => onOpenMap?.()} aria-label={t('hud.openMap', lang)} title={t('hud.openMap', lang)}>
              <Icon name="stack" size={24} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={hostRef} className="walk-hud">
      <div className="walk-vignette" aria-hidden="true" />
      <LiftCard index={index} lang={lang} step={step} active={riding} progress={sim?.rideProgress ?? 0} />
      <div ref={topRef} className="walk-top">
        <div ref={chipsRef}>
          <StatChips lang={lang} arrivalMs={arrivalMs} distanceLeftM={progress.remainM} timeZone={tz} />
        </div>
        <div ref={cardRef}>
          <TurnCard
            index={index}
            lang={lang}
            route={route}
            stepIndex={i}
            distanceM={riding ? null : progress.stepLeftM}
            summary={summary}
            riding={riding}
          />
        </div>
      </div>
      <TurnBubble lang={lang} content={bubble} onAnchors={onAnchors} getAnchors={getAnchors} free={bubbleFree} hidden={riding || !route} keepBox={waiting} />
      <div ref={domeWrapRef}>
        <MiniMapDome
          index={index}
          lang={lang}
          route={route}
          levelId={levelId}
          position={stand}
          headingDeg={stand?.headingDeg ?? 0}
          distanceDoneM={sim?.active ? sim.distanceDoneM : null}
          car={car}
          onAnchors={onAnchors}
          onOpen={() => onOpenMap?.({ via: 'dome' })}
          levelChip={levelChip('level-chip-hud')}
        />
      </div>
      <div ref={barRef}>
        <BottomBar
          lang={lang}
          sim={sim}
          canNext={i < steps.length - 1}
          isLast={i === steps.length - 1}
          onEnd={onEnd}
          onSpeed={onSpeed}
          onPlay={onPlay}
          onPause={onPause}
          onNext={onNext}
          onOpenMap={() => onOpenMap?.()}
        />
      </div>
    </div>
  )
}

export default WalkHud
