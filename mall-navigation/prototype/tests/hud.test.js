import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { findRouteToTarget } from '../src/routing/route.js'
import { formatClock, formatMinutesParts, formatSteps, t } from '../src/i18n/strings.js'
import {
  alongRouteM,
  arrivalEpochMs,
  bubbleContent,
  cumulativeM,
  levelRouteParts,
  liftCardContent,
  exitTurnText,
  nextTurnFor,
  placeBubble,
  pressCode,
  standPoint,
  tripProgress,
  turnCardContent,
} from '../src/ui/hudModel.js'
import { stepIconName } from '../src/ui/stepIcon.js'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const index = indexVenue(JSON.parse(readFileSync(VENUE_PATH, 'utf8')))
const START = index.anchorById.get(index.venue.meta.defaultStartAnchorId).nodeId
/** South entrance -> food-court counter on Level 1, by the up escalator (start, connector, turns, arrive). */
const kitchen = findRouteToTarget(index, START, 'occ-muttrah-kitchen')
/** Level 1 food court -> bay B1-43, step-free (by a lift, down two floors). */
const toCar = findRouteToTarget(index, index.anchorById.get('A-L1-C3').nodeId, 'bay-B1-043', { stepFree: true })

const ARABIC_LETTER = /[؀-ۿ]/
// Arabic text may hold Latin only inside an LTR isolate (painted bay codes) or as a lift's letter
const latinOutsideIsolates = (s) => s.replace(/\u2066[^\u2069]*\u2069/g, '').replace(/(^|[\s«])[AB](?=$|[\s»])/g, '$1')

describe('v0.2 formatters', () => {
  it('formatClock: 24 h in the venue time zone, Arabic-Indic digits in Arabic', () => {
    // 2026-10-09 13:42 UTC = 17:42 in Muscat (UTC+4, no daylight saving)
    const ms = Date.UTC(2026, 9, 9, 13, 42, 10)
    expect(formatClock(ms, 'en', 'Asia/Muscat')).toBe('17:42')
    expect(formatClock(ms, 'ar', 'Asia/Muscat')).toBe('١٧:٤٢')
    expect(formatClock(Date.UTC(2026, 9, 9, 20, 5), 'en', 'Asia/Muscat')).toBe('00:05')
    expect(formatClock(ms, 'en', 'UTC')).toBe('13:42')
    // an unknown zone falls back to the phone clock instead of throwing
    expect(formatClock(ms, 'en', 'Not/AZone')).toMatch(/^\d\d:\d\d$/)
  })

  it('formatSteps: an estimate with ≈, rounded to 5 under 100 steps and to 10 from 100', () => {
    expect(formatSteps(95, 'en')).toBe('≈\u00A0130') // 126.7 steps
    expect(formatSteps(95, 'ar')).toBe('≈\u00A0١٣٠')
    expect(formatSteps(30, 'en')).toBe('≈\u00A040')
    expect(formatSteps(31, 'en')).toBe('≈\u00A040') // 41.3 -> 40
    expect(formatSteps(33, 'en')).toBe('≈\u00A045') // 44 -> 45
    expect(formatSteps(0, 'en')).toBe('≈\u00A00')
    expect(formatSteps(-3, 'en')).toBe('≈\u00A00')
    expect(formatSteps(Number.NaN, 'ar')).toBe('≈\u00A0٠')
  })

  it('formatMinutesParts: value and unit apart, "<1" under half a minute', () => {
    expect(formatMinutesParts(124.7, 'en')).toEqual({ value: '2', unit: 'min' })
    expect(formatMinutesParts(124.7, 'ar')).toEqual({ value: '٢', unit: 'د' })
    expect(formatMinutesParts(20, 'en')).toEqual({ value: '<1', unit: 'min' })
    expect(formatMinutesParts(20, 'ar')).toEqual({ value: '<١', unit: 'د' })
    expect(formatMinutesParts(660, 'ar')).toEqual({ value: '١١', unit: 'د' })
  })

  it('HUD strings read naturally in both languages', () => {
    expect(t('hud.verbAt', 'en', { verb: t('hud.turn.right', 'en') })).toBe('Turn right at')
    expect(t('hud.verbAt', 'ar', { verb: t('hud.turn.right', 'ar') })).toBe('انعطف يميناً عند')
    expect(t('hud.andStraight', 'en', { distance: '42 m' })).toBe('and 42 m straight')
    expect(t('hud.summary', 'ar', { time: '١٧:٤٢', distance: '٩٥ م' })).toBe('الوصول ١٧:٤٢ · متبقٍ ٩٥ م')
    expect(t('hud.north', 'ar')).toBe('ش')
  })
})

describe('trip progress', () => {
  it('measures along the route like the simulator (sum of edge lengths)', () => {
    const cum = cumulativeM(kitchen)
    expect(cum[0]).toBe(0)
    expect(cum[cum.length - 1]).toBeCloseTo(kitchen.lengthM, 6)
    expect(cumulativeM(kitchen)).toBe(cum) // cached per route
  })

  it('without a walk: the whole route and the whole step', () => {
    const p = tripProgress(kitchen, 2, { active: false })
    const before = kitchen.steps.slice(0, 2).reduce((a, s) => a + s.distanceM, 0)
    expect(p.remainM).toBeCloseTo(kitchen.lengthM - before, 6)
    expect(p.stepLeftM).toBeCloseTo(kitchen.steps[2].distanceM, 6)
    expect(p.remainS).toBeCloseTo(kitchen.steps.slice(2).reduce((a, s) => a + s.etaS, 0), 6)
    expect(tripProgress(kitchen, 0, null).stepLeftM).toBe(0) // the 0 m start step
  })

  it('a connector step counts down to where you board, then the ride', () => {
    const i = kitchen.steps.findIndex((s) => s.kind === 'connector')
    const step = kitchen.steps[i]
    const cum = cumulativeM(kitchen)
    const board = cum[step.connector.boardIndex]
    const walking = tripProgress(kitchen, i, { active: true, distanceDoneM: cum[step.from] + 10 })
    expect(walking.stepLeftM).toBeCloseTo(board - cum[step.from] - 10, 6)
    const riding = tripProgress(kitchen, i, { active: true, distanceDoneM: board + 2, onConnector: true, rideProgress: 0.3 })
    expect(riding.stepLeftM).toBeCloseTo(cum[step.connector.exitIndex] - board - 2, 6)
  })

  it('while walking: metres left shrink and the arrival time is at 1x', () => {
    const a = tripProgress(kitchen, 2, { active: true, distanceDoneM: 52 })
    const b = tripProgress(kitchen, 2, { active: true, distanceDoneM: 56 })
    expect(b.remainM).toBeLessThan(a.remainM)
    expect(b.stepLeftM).toBeCloseTo(a.stepLeftM - 4, 6)
    expect(b.remainS).toBeLessThan(a.remainS)
    expect(arrivalEpochMs(1000, 60)).toBe(61000)
    expect(arrivalEpochMs(1000, -5)).toBe(1000)
  })
})

describe('turn card and bubble text', () => {
  it('names the landmark with the same preposition as the step text', () => {
    const i = kitchen.steps.findIndex((s) => s.kind === 'turn' && /towards/.test(s.text.en))
    expect(i).toBeGreaterThan(0)
    const card = turnCardContent(index, kitchen, i, 'en')
    expect(card.verb).toMatch(/^Turn (left|right) towards$/)
    expect(card.name).toBe(kitchen.steps[i].landmark.name.en)
    expect(card.icon).toBe(stepIconName(kitchen.steps[i]))
    const at = kitchen.steps.findIndex((s) => s.kind === 'turn' && / at /.test(s.text.en))
    expect(turnCardContent(index, kitchen, at, 'en').verb).toMatch(/ at$/)
  })

  it('start faces the landmark; connector names the level; arrive uses the flag on the ok tile', () => {
    expect(turnCardContent(index, kitchen, 0, 'en')).toMatchObject({ verb: 'Face', name: 'Atrium fountain', icon: 'start' })
    const c = kitchen.steps.findIndex((s) => s.kind === 'connector')
    expect(turnCardContent(index, kitchen, c, 'en')).toMatchObject({ verb: 'Escalator up to', name: 'Level 1', icon: 'escalator_up' })
    expect(turnCardContent(index, kitchen, c, 'ar')).toMatchObject({ verb: 'السلم المتحرك صعوداً إلى', name: 'المستوى الأول' })
    const last = kitchen.steps.length - 1
    expect(turnCardContent(index, kitchen, last, 'en')).toMatchObject({ verb: 'Arrive at', name: 'Muttrah Kitchen', icon: 'flag', tone: 'arrive' })
  })

  it('a lift step says which lift and which button to press', () => {
    const i = toCar.steps.findIndex((s) => s.kind === 'connector')
    const card = turnCardContent(index, toCar, i, 'en')
    expect(card.verb).toBe(`Take ${toCar.steps[i].connector.name.en} to`)
    expect(card.press).toBe(toCar.steps[i].connector.buttonLabel.en)
    const wait = bubbleContent(index, toCar, i, 'en', { active: true, onConnector: true, phase: 'wait' })
    expect(wait.sub).toBe(`Press “${toCar.steps[i].connector.buttonLabel.en}”`)
    expect(bubbleContent(index, toCar, i, 'en').sub).toMatch(/^to /)
    const lift = liftCardContent(index, toCar.steps[i], 'ar')
    expect(lift.icon).toBe('lift')
    expect(lift.headline).toBe(`${toCar.steps[i].connector.name.ar} إلى ${index.levelById.get(toCar.steps[i].connector.toLevelId).name.ar}`)
    expect(liftCardContent(index, kitchen.steps[1], 'en')).toBeNull() // escalators ride, no card
  })

  it('the bubble icon is always the same arrow as its verb; a start step shows the next bubble', () => {
    for (const route of [kitchen, toCar]) {
      for (let i = 0; i < route.steps.length; i++) {
        const b = bubbleContent(index, route, i, 'en')
        const s = route.steps[i].kind === 'start' ? route.steps[i + 1] : route.steps[i]
        expect(b.icon).toBe(stepIconName(s))
        if (s.kind === 'turn') expect(b.title).toBe(t(`hud.turn.${s.turn}`, 'en'))
      }
    }
    const turn = kitchen.steps.findIndex((s) => s.kind === 'turn')
    expect(bubbleContent(index, kitchen, turn, 'en').sub).toMatch(/^and \d+ m straight$/)
  })

  it('Arabic HUD text stays in Arabic script (bay codes and lift letters as painted)', () => {
    for (const route of [kitchen, toCar]) {
      for (let i = 0; i < route.steps.length; i++) {
        const card = turnCardContent(index, route, i, 'ar')
        const b = bubbleContent(index, route, i, 'ar')
        for (const s of [card.verb, card.name, b.title, b.sub ?? 'ـ']) {
          expect(latinOutsideIsolates(s), s).not.toMatch(/[A-Za-z0-9]/)
          expect(s, s).toMatch(ARABIC_LETTER)
        }
      }
    }
  })

  it('nextTurnFor: the step end (connector: where you board) in both languages', () => {
    const c = kitchen.steps.findIndex((s) => s.kind === 'connector')
    const nt = nextTurnFor(index, kitchen, c)
    const board = kitchen.points[kitchen.steps[c].connector.boardIndex]
    expect(nt).toMatchObject({ levelId: board.levelId, x: board.x, y: board.y, kind: 'connector' })
    expect(nt.label.en).toBe('Escalator up')
    expect(nt.label.ar).toBe('السلم المتحرك صعوداً')
    // start step: the next step's point
    expect(nextTurnFor(index, kitchen, 0)).toEqual(nt)
    expect(nextTurnFor(index, kitchen, kitchen.steps.length - 1).kind).toBe('arrive')
    expect(nextTurnFor(index, null, 0)).toBeNull()
  })
})

describe('mini-map geometry', () => {
  it('stands at the step start facing along the route', () => {
    const s = standPoint(kitchen, 2)
    const a = kitchen.points[kitchen.steps[2].from]
    expect(s).toMatchObject({ levelId: a.levelId, x: a.x, y: a.y })
    expect(s.headingDeg).toBeGreaterThanOrEqual(0)
    expect(s.headingDeg).toBeLessThan(360)
  })

  it('splits the route on a level at the walker', () => {
    const cum = cumulativeM(kitchen)
    const k = 14
    const a = kitchen.points[k]
    const b = kitchen.points[k + 1]
    const mid = { levelId: a.levelId, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const m = alongRouteM(kitchen, mid)
    expect(m).toBeCloseTo((cum[k] + cum[k + 1]) / 2, 4)
    const parts = levelRouteParts(kitchen, 'L1', m)
    const lastWalked = parts.walked.at(-1).at(-1)
    expect(lastWalked[0]).toBeCloseTo(mid.x, 6)
    expect(lastWalked[1]).toBeCloseTo(mid.y, 6)
    expect(parts.ahead[0][0]).toEqual(lastWalked)
    // nothing of Level G is drawn on Level 1
    const all = [...parts.walked, ...parts.ahead].flat()
    expect(all.length).toBeGreaterThan(2)
    const gOnly = levelRouteParts(kitchen, 'G', 0)
    expect(gOnly.walked).toEqual([])
    expect(gOnly.ahead.length).toBeGreaterThan(0)
  })
})

describe('turn bubble placement', () => {
  const free = { top: 220, bottom: 557, left: 0, right: 390 }
  const box = { w: 170, h: 52 }
  const anchor = (o) => ({ x: 195, y: 330, visible: true, behind: false, relBearingDeg: 0, distanceM: 20, ...o })

  it('hangs the box above and toward the inline end, its corner tucked under the icon', () => {
    const p = placeBubble(anchor(), box, free)
    expect(p).toMatchObject({ mode: 'anchored', x: 195, y: 330, boxDx: 1, boxDy: -53, below: false, side: 'right' })
    const ar = placeBubble(anchor(), box, free, { rtl: true })
    expect(ar).toMatchObject({ boxDx: -171, boxDy: -53, side: 'left' })
  })

  it('flips below near the top HUD and to the other side near the edge, then stays inside', () => {
    const top = placeBubble(anchor({ y: 240 }), box, free)
    expect(top.below).toBe(true)
    expect(240 + top.boxDy).toBeGreaterThanOrEqual(free.top)
    // just enough room above: stays above (the free area's top is already 8 px under the HUD)
    expect(placeBubble(anchor({ y: 220 + 53 }), box, free).below).toBe(false)
    const edge = placeBubble(anchor({ x: 330 }), box, free)
    expect(edge.flipped).toBe(true)
    expect(330 + edge.boxDx + box.w).toBeLessThanOrEqual(free.right - 12)
    const arEdge = placeBubble(anchor({ x: 40 }), box, free, { rtl: true })
    expect(arEdge.flipped).toBe(true)
    expect(40 + arEdge.boxDx).toBeGreaterThanOrEqual(12)
    // near the dome: never over it
    const low = placeBubble(anchor({ y: 552 }), box, free)
    expect(552 + low.boxDy + box.h).toBeLessThanOrEqual(free.bottom - 8)
  })

  it('off screen: an edge pill on the side the turn really is (not mirrored), behind: bottom centre', () => {
    expect(placeBubble(anchor({ visible: false, relBearingDeg: 70 }), box, free)).toMatchObject({ mode: 'edge', side: 'right', y: 388.5 })
    expect(placeBubble(anchor({ visible: false, relBearingDeg: -70 }), box, free, { rtl: true })).toMatchObject({ mode: 'edge', side: 'left' })
    expect(placeBubble(anchor({ visible: false, relBearingDeg: 160 }), box, free)).toMatchObject({ mode: 'behind', x: 195 })
    expect(placeBubble(anchor({ behind: true, relBearingDeg: 120 }), box, free).mode).toBe('behind')
    expect(placeBubble(null, box, free).mode).toBe('hidden')
  })

  it('behind the camera plane but still ahead (end of a down escalator, standing on a lift stop): here, bottom centre', () => {
    // the beam top 0.6 m over the eye, straight ahead, falls behind a camera pitched down 19 deg: not "turn around"
    const p = placeBubble(anchor({ behind: true, visible: false, x: -40, y: 900, relBearingDeg: 0, distanceM: 0.3 }), box, free)
    expect(p).toMatchObject({ mode: 'anchored', x: 195, y: 557 - 8 - 17 })
    // the eye standing exactly on the point: its bearing is arbitrary, it is still here
    expect(placeBubble(anchor({ behind: true, relBearingDeg: -135, distanceM: 0 }), box, free)).toMatchObject({ mode: 'anchored', x: 195 })
  })

  it('a toast narrows the free area: an anchor the engine sees but above the narrowed area pins to its top', () => {
    const narrowed = { ...free, top: 289 }
    const p = placeBubble(anchor({ visible: true, x: 195, y: 241 }), box, narrowed)
    expect(p).toMatchObject({ mode: 'anchored', x: 195, y: 306 })
    expect(306 + p.boxDy).toBeGreaterThanOrEqual(narrowed.top)
  })

  it('ahead but above the free area (riding up an escalator): pinned to the top edge, not an edge pill', () => {
    const p = placeBubble(anchor({ visible: false, x: 200, y: 120, relBearingDeg: 2 }), box, free)
    expect(p).toMatchObject({ mode: 'anchored', x: 200, y: 237, below: true })
    expect(237 + p.boxDy).toBeGreaterThanOrEqual(free.top)
    // far off to the side it is still an edge pill
    expect(placeBubble(anchor({ visible: false, x: 520, y: 120, relBearingDeg: 30 }), box, free).mode).toBe('edge')
  })
})

describe('QA round 2: the turn right after a ride, lift codes as printed', () => {
  const esc = kitchen.steps.findIndex((s) => s.kind === 'connector')
  const lift = toCar.steps.findIndex((s) => s.kind === 'connector')

  it('the demo escalator: "then turn left at the top" once you are on it (bubble), on the card while walking to it', () => {
    const c = kitchen.steps[esc].connector
    expect(c.exitTurn).toBe('left')
    expect(kitchen.steps[esc].text.en).toMatch(/then turn left at the top$/)
    // before boarding the bubble says where it goes; riding it, the turn at the top
    expect(bubbleContent(index, kitchen, esc, 'en', { active: true, onConnector: false }).sub).toBe('to Level 1')
    const riding = bubbleContent(index, kitchen, esc, 'en', { active: true, onConnector: true, phase: 'ride' })
    expect(riding).toMatchObject({ title: 'Escalator up', sub: 'then turn left at the top' })
    expect(bubbleContent(index, kitchen, esc, 'ar', { active: true, onConnector: true, phase: 'ride' }).sub).toBe('ثم انعطف يساراً في الأعلى')
    expect(turnCardContent(index, kitchen, esc, 'en')).toMatchObject({ verb: 'Escalator up to', verbShort: 'Escalator up', name: 'Level 1', then: 'then turn left at the top' })
    expect(turnCardContent(index, kitchen, esc, 'ar').then).toBe('ثم انعطف يساراً في الأعلى')
    expect(exitTurnText({ type: 'escalator', direction: 'down', exitTurn: 'slight_right' }, 'en')).toBe('then bear right at the bottom')
    expect(exitTurnText({ type: 'escalator', exitTurn: 'straight' }, 'en')).toBeNull()
  })

  it('Lift B to B1: "Press “B1”, then turn left as you step out" on the lift card; waiting, the bubble keeps the button', () => {
    const step = toCar.steps[lift]
    expect(step.connector.exitTurn).toBe('left')
    expect(liftCardContent(index, step, 'en').body).toBe('Press “B1”, then turn left as you step out')
    expect(liftCardContent(index, step, 'ar').body).toBe('اضغط «\u2066B1\u2069»، ثم انعطف يساراً عند الخروج')
    expect(bubbleContent(index, toCar, lift, 'en', { active: true, onConnector: true, phase: 'wait' }).sub).toBe('Press “B1”')
    expect(turnCardContent(index, toCar, lift, 'en')).toMatchObject({ press: 'B1', then: 'then turn left as you step out' })
    // the stairs have no button: the turn alone
    expect(liftCardContent(index, { connector: { type: 'stairs', toLevelId: 'G', exitTurn: 'right' } }, 'en').body).toBe('then turn right as you step out')
  })

  it('the button to press is the code printed on the lift panel in both languages, isolated left-to-right in Arabic', () => {
    const c = toCar.steps[lift].connector
    expect(c.buttonLabel.ar).toBe('ب١')
    expect(pressCode(c, 'en')).toBe('B1')
    expect(pressCode(c, 'ar')).toBe('\u2066B1\u2069')
    expect(turnCardContent(index, toCar, lift, 'ar').press).toBe('B1')
    expect(bubbleContent(index, toCar, lift, 'ar', { active: true, onConnector: true, phase: 'wait' }).sub).toBe('اضغط «\u2066B1\u2069»')
  })
})

describe('QA round 2: turn bubble placement', () => {
  const box = { w: 200, h: 52 }
  const anchor = (o) => ({ x: 214, y: 330, visible: true, behind: false, relBearingDeg: 0, distanceM: 20, ...o })
  const iconClear = (p, w, h) => {
    // the icon (34 px disc at x, y) may only tuck 16 px into the box's corner, never sit over its text
    const L = p.x + p.boxDx
    const T = p.y + p.boxDy
    const overX = Math.min(p.x + 17, L + w) - Math.max(p.x - 17, L)
    const overY = Math.min(p.y + 17, T + h) - Math.max(p.y - 17, T)
    return overX <= 16.5 || overY <= 16.5
  }

  it('Arabic, a 200 px box at x 214 on a 360 px screen: no flip, the icon only tucks under the corner', () => {
    const free = { top: 180, bottom: 560, left: 0, right: 360 }
    for (const w of [200, 201.4]) {
      const p = placeBubble(anchor(), { ...box, w }, free, { rtl: true })
      expect(p.mode).toBe('anchored')
      expect(p.flipped).toBe(false)
      expect(iconClear(p, w, box.h)).toBe(true)
    }
  })

  it('a box too wide for either side moves wholly above its icon (below when there is no room above)', () => {
    const free = { top: 180, bottom: 560, left: 0, right: 360 }
    const wide = { w: 240, h: 52 }
    const p = placeBubble(anchor({ x: 180 }), wide, free, { rtl: true })
    expect(iconClear(p, wide.w, wide.h)).toBe(true)
    expect(p.boxDy + wide.h).toBeLessThanOrEqual(-17)
    const low = placeBubble(anchor({ x: 180, y: 200 }), wide, free)
    expect(iconClear(low, wide.w, wide.h)).toBe(true)
    expect(low.boxDy).toBeGreaterThanOrEqual(17)
  })

  it('near the turn the view turns early: no edge pill pointing the wrong way, the bubble hides', () => {
    const free = { top: 180, bottom: 560, left: 0, right: 390 }
    expect(placeBubble(anchor({ visible: false, relBearingDeg: -60, distanceM: 3 }), box, free, { near: true }).mode).toBe('hidden')
    expect(placeBubble(anchor({ visible: false, relBearingDeg: -60, distanceM: 12 }), box, free).mode).toBe('edge')
    // in view it stays anchored (icon alone, TurnBubble)
    expect(placeBubble(anchor({ distanceM: 3 }), box, free, { near: true }).mode).toBe('anchored')
  })
})

describe('v0.2 URL hooks', async () => {
  const { readUrlParams } = await import('../src/ui/urlState.js')
  it('accepts the Walk view and the scene style', () => {
    expect(readUrlParams('?screen=navigate&to=occ-muttrah-kitchen&view=fpv').view).toBe('fpv')
    expect(readUrlParams('?style=classic').style).toBe('classic')
    expect(readUrlParams('?style=neon').style).toBeNull()
    expect(readUrlParams('?view=floor').style).toBeNull()
    expect(readUrlParams('?view=sideways').view).toBeNull()
  })
})
