// ISOLATED AI MODULE — MediaPipe Hand Landmarker (Apache-2.0). Image processing runs 100% on the device.
// Note (disclosed in /privacy): the MediaPipe Tasks runtime may send anonymous performance metrics to Google.
//
// Asset delivery: Firebase Hosting's free plan has a daily bandwidth cap, and the AI files are ~19 MB,
// so they load from Google's / jsDelivr's free CDNs first and fall back to our self-hosted copies.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const MP_VERSION = '0.10.35' // must match package.json
const SOURCES = [
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
    model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  { wasm: '/mediapipe/wasm', model: '/models/hand_landmarker.task' },
]

let landmarkerPromise = null
let currentMode = null
let delegateUsed = null
let sourceUsed = null

async function create(src, delegate) {
  const fileset = await FilesetResolver.forVisionTasks(src.wasm)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: src.model, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

/** Loads once: CDN → self-hosted, GPU → CPU. */
export function loadHandTracker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      let lastErr
      for (const src of SOURCES) {
        for (const delegate of ['GPU', 'CPU']) {
          try {
            const lm = await create(src, delegate)
            delegateUsed = delegate
            sourceUsed = src.wasm.startsWith('http') ? 'cdn' : 'self'
            currentMode = 'VIDEO'
            return lm
          } catch (e) {
            lastErr = e
            console.warn(`[handTracker] ${delegate} via ${src.wasm} failed`, e)
          }
        }
      }
      throw lastErr || new Error('hand tracker unavailable')
    })()
    landmarkerPromise.catch(() => {
      landmarkerPromise = null
    })
  }
  return landmarkerPromise
}

export function trackerInfo() {
  return { delegate: delegateUsed, source: sourceUsed }
}

async function ensureMode(lm, mode) {
  if (currentMode !== mode) {
    await lm.setOptions({ runningMode: mode })
    currentMode = mode
  }
}

let lastTs = 0
/** Live video frame → result. Timestamps must strictly increase. */
export async function detectVideo(video, nowMs) {
  const lm = await loadHandTracker()
  await ensureMode(lm, 'VIDEO')
  const ts = Math.max(nowMs, lastTs + 1)
  lastTs = ts
  return normalizeResult(lm.detectForVideo(video, ts))
}

/** Still image (photo / frozen frame) → result. */
export async function detectImage(source) {
  const lm = await loadHandTracker()
  await ensureMode(lm, 'IMAGE')
  return normalizeResult(lm.detect(source))
}

function normalizeResult(res) {
  const hands = []
  const n = res?.landmarks?.length || 0
  for (let i = 0; i < n; i++) {
    const cat = (res.handedness && res.handedness[i] && res.handedness[i][0]) || null
    hands.push({
      landmarks: res.landmarks[i], // normalized x,y in [0,1], z relative depth
      world: res.worldLandmarks ? res.worldLandmarks[i] : null, // meters, origin at hand center
      handedness: cat ? cat.categoryName : 'Unknown',
      score: cat ? cat.score : 0,
    })
  }
  return { hands }
}
