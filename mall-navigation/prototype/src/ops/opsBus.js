// src/ops/opsBus.js
/**
 * Mall operations state shared between tabs of one browser (v0.5 demo: no backend): emergency mode and the hours
 * preview. A dashboard tab publishes; shopper tabs listen and say "hello" on start to get the current state. Each
 * publish bumps `rev`; older states are ignored. Without BroadcastChannel it works within the one tab.
 */
export const OPS_CHANNEL = 'dallni-ops'
export const DEFAULT_OPS = Object.freeze({ rev: 0, emergency: Object.freeze({ on: false, message: null }), hoursPreview: null })

const isObj = (v) => v != null && typeof v === 'object'
export function validOps(msg) {
  if (!isObj(msg)) return false
  if (msg.type === 'hello') return true
  if (msg.type !== 'state' || !isObj(msg.state)) return false
  const s = msg.state
  return Number.isFinite(s.rev) && isObj(s.emergency) && typeof s.emergency.on === 'boolean' && (s.hoursPreview === null || typeof s.hoursPreview === 'string')
}

export function mergeOps(state, msg) {
  if (!validOps(msg) || msg.type !== 'state') return state
  return msg.state.rev > state.rev ? msg.state : state
}

export function createOpsBus({ onState, Channel = globalThis.BroadcastChannel } = {}) {
  let state = DEFAULT_OPS
  const ch = typeof Channel === 'function' ? new Channel(OPS_CHANNEL) : null
  const set = (next) => {
    if (next === state) return
    state = next
    onState?.(state)
  }
  if (ch) {
    ch.onmessage = (e) => {
      const msg = e?.data
      if (!validOps(msg)) return
      if (msg.type === 'hello') {
        if (state.rev > 0) ch.postMessage({ type: 'state', state })
        return
      }
      set(mergeOps(state, msg))
    }
  }
  return {
    state: () => state,
    publish(patch) {
      const next = { ...state, ...patch, emergency: { ...state.emergency, ...(patch.emergency ?? {}) }, rev: Math.max(state.rev, Date.now()) + 1 }
      set(next)
      ch?.postMessage({ type: 'state', state: next })
    },
    hello() {
      ch?.postMessage({ type: 'hello' })
    },
    close() {
      ch?.close()
    },
  }
}
