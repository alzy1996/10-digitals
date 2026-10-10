// Real load progress for the preloader: each task is an actual milestone
// (fonts decoded, the Three.js scene chunk downloaded, the first WebGL
// frames drawn) weighted by roughly how long it takes. Never a fake timer.
type Task = 'fonts' | 'scene' | 'frame'

const WEIGHTS: Record<Task, number> = { fonts: 0.25, scene: 0.5, frame: 0.25 }

const done = new Set<Task>()
const subscribers = new Set<(pct: number) => void>()

function current(): number {
  let p = 0
  done.forEach((t) => (p += WEIGHTS[t]))
  return Math.round(p * 100)
}

export function markLoaded(task: Task) {
  if (done.has(task)) return
  done.add(task)
  const pct = current()
  subscribers.forEach((fn) => fn(pct))
}

export function onProgress(fn: (pct: number) => void): () => void {
  subscribers.add(fn)
  fn(current())
  return () => {
    subscribers.delete(fn)
  }
}
