// One-Euro filter (Casiez et al. 2012): kills jitter when the hand is still, stays responsive when it moves.
const TAU = 2 * Math.PI

function alpha(cutoff, dt) {
  const tau = 1 / (TAU * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.x = null
    this.dx = 0
    this.t = null
  }

  reset() {
    this.x = null
    this.dx = 0
    this.t = null
  }

  filter(value, tMs) {
    if (this.x === null) {
      this.x = value
      this.t = tMs
      return value
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000)
    this.t = tMs
    const dValue = (value - this.x) / dt
    const aD = alpha(this.dCutoff, dt)
    this.dx = this.dx + aD * (dValue - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    const a = alpha(cutoff, dt)
    this.x = this.x + a * (value - this.x)
    return this.x
  }
}

/** A bundle of named One-Euro filters (one per numeric field). */
export class OneEuroBundle {
  constructor(fields, minCutoff, beta) {
    this.filters = Object.fromEntries(fields.map((f) => [f, new OneEuro(minCutoff, beta)]))
    this.lastSeen = 0
  }

  filter(obj, tMs) {
    const out = { ...obj }
    for (const k in this.filters) if (typeof obj[k] === 'number') out[k] = this.filters[k].filter(obj[k], tMs)
    this.lastSeen = tMs
    return out
  }
}
