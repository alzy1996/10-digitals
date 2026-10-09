/**
 * Lazy 3D engine (PLAN.md 19.2: three.js + troika load after the first screen, in their own chunk).
 *
 * `engine` stands in for the engine singleton (src/engine/engine.js) with the same API, so screens can call it
 * before the chunk has arrived:
 * - commands (setVenue, setView, showRoute, setMarker, flyTo, ...) are queued and replayed in order;
 * - subscriptions (onPick, onRender) are queued too and return an unsubscribe function that works either way;
 * - queries (getView, getStats, projectToScreen, ...) return safe defaults until the engine is there;
 * - whenIdle() waits for the engine first.
 * Nothing is downloaded until `loadEngine()` is called: the App calls it once the venue and the first screen are
 * ready (requestIdleCallback), so the engine chunk never competes with venue.json for the first screen.
 * `enginePromise` resolves with the real engine once loaded (rejects if the chunk cannot be downloaded); MapView
 * mounts the canvas through it.
 */

let real = null
/** @type {Array<{ name: string, args: any[], holder: { off: Function|null } | null }>} */
const queue = []

const QUERY_DEFAULTS = {
  getView: () => ({ mode: 'stack', levelId: null, blend: 1, stackLevels: null }),
  getStats: () => ({ drawCalls: 0, triangles: 0, frameMs: 0, totalFramesRendered: 0, geometries: 0, textures: 0 }),
  getCameraPose: () => null,
  projectToScreen: () => null,
  pickAt: () => null,
  isFailed: () => false,
}
const SUBSCRIPTIONS = new Set(['onPick', 'onRender'])

let resolveEngine
let rejectEngine
export const enginePromise = new Promise((resolve, reject) => {
  resolveEngine = resolve
  rejectEngine = reject
})
// a failed download is reported to whoever waits (MapView); never an unhandled rejection by itself
enginePromise.catch(() => {})

let loading = null

/**
 * Download the engine chunk (once) and replay the queued commands. Safe to call repeatedly.
 * @returns {Promise<object>} the real engine
 */
export function loadEngine() {
  if (!loading) {
    loading = import('./engine/engine.js').then(
      (m) => {
        real = m.engine
        for (const item of queue.splice(0)) {
          try {
            const out = real[item.name](...item.args)
            if (item.holder) item.holder.off = out
          } catch (err) {
            console.error(err)
          }
        }
        resolveEngine(real)
        return real
      },
      (err) => {
        rejectEngine(err)
        throw err
      },
    )
  }
  return loading
}

/** True once the 3D engine chunk has loaded. */
export function engineLoaded() {
  return real != null
}

export const engine = new Proxy(
  {},
  {
    get(_, name) {
      if (name === 'then') return undefined // not a thenable
      if (real) {
        const v = real[name]
        return typeof v === 'function' ? v.bind(real) : v
      }
      if (name === 'whenIdle') return (...args) => enginePromise.then((e) => e.whenIdle(...args))
      if (name === 'debug') return null
      if (typeof name !== 'string') return undefined
      if (name in QUERY_DEFAULTS) return QUERY_DEFAULTS[name]
      if (SUBSCRIPTIONS.has(name)) {
        return (...args) => {
          const holder = { off: null }
          const item = { name, args, holder }
          queue.push(item)
          return () => {
            if (holder.off) holder.off()
            else {
              const i = queue.indexOf(item)
              if (i >= 0) queue.splice(i, 1)
            }
          }
        }
      }
      return (...args) => {
        if (real) return real[name](...args)
        queue.push({ name, args, holder: null })
        return undefined
      }
    },
  },
)

export default engine
