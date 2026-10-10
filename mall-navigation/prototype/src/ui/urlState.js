/**
 * Test hooks (CONTRACT.md section 3, src/ui): URL parameters that put the app straight into a state,
 * used by scripts/screenshots.mjs and handy for demos.
 *
 *   ?lang=ar|en
 *   &screen=home|search|place|navigate|arrived|car|scan
 *   &from=<anchorId>                       you-are-here (default: the venue's defaultStartAnchorId)
 *   &to=<occupantId|amenityId|bayId|anchorId>
 *   &view=stack|floor|top|fpv  &level=<levelId>   (fpv = the first-person Walk view, v0.2; navigate / arrived)
 *   &style=storm|classic                   v0.2 scene style (engine.setSceneStyle; default storm)
 *   &simT=<seconds>                        navigate: simulated walk paused at that time
 *   &step=<n>|connector                    navigate: open on step n (or the first floor change)
 *   &stepFree=1
 *   &q=<query>  &tile=food|restrooms|prayer|pharmacy|kids|exit   search screen
 *   &car=<bayId>                           a saved car
 *   &play=1                                navigate: start the simulated walk
 *   &sheet=peek|half|full                  the first screen's bottom sheet snap (default: half; search: full)
 */

const SCREENS = ['home', 'search', 'place', 'navigate', 'arrived', 'car', 'scan']
const VIEWS = ['stack', 'floor', 'top', 'fpv']
const STYLES = ['toy', 'storm', 'classic']
const SHEET_SNAPS = ['peek', 'half', 'full']

/**
 * @param {string} [search] location.search
 */
export function readUrlParams(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search)
  const str = (k) => {
    const v = p.get(k)
    return v == null || v === '' ? null : v
  }
  const num = (k) => {
    const v = str(k)
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const step = str('step')
  return {
    lang: str('lang') === 'ar' ? 'ar' : str('lang') === 'en' ? 'en' : null,
    screen: SCREENS.includes(str('screen')) ? str('screen') : null,
    from: str('from'),
    to: str('to'),
    view: VIEWS.includes(str('view')) ? str('view') : null,
    level: str('level'),
    simT: num('simT'),
    step: step === 'connector' ? 'connector' : step != null && Number.isFinite(Number(step)) ? Math.max(0, Math.floor(Number(step))) : null,
    stepFree: str('stepFree') === '1' || str('stepFree') === 'true',
    q: str('q'),
    tile: str('tile'),
    car: str('car'),
    play: str('play') === '1',
    style: STYLES.includes(str('style')) ? str('style') : null,
    sheet: SHEET_SNAPS.includes(str('sheet')) ? str('sheet') : null,
  }
}

/** Device language preference (sessionStorage only: a preference, not real data). */
export function initialLang(fromUrl) {
  if (fromUrl) return fromUrl
  try {
    const saved = sessionStorage.getItem('dallni.lang')
    if (saved === 'ar' || saved === 'en') return saved
  } catch {
    // storage blocked: fall through
  }
  const nav = typeof navigator !== 'undefined' ? String(navigator.language || '') : ''
  return nav.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

export function rememberLang(lang) {
  try {
    sessionStorage.setItem('dallni.lang', lang)
  } catch {
    // storage blocked: the choice still applies for this page view
  }
}
