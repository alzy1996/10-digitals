// Copies MediaPipe WASM runtime into /public and downloads the free hand model once.
// Runs automatically before `npm run dev` and `npm run build`.
// Self-hosting both means the app never depends on a third-party CDN.
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDst = join(root, 'public/mediapipe/wasm')
const modelDir = join(root, 'public/models')
const modelFile = join(modelDir, 'hand_landmarker.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

mkdirSync(wasmDst, { recursive: true })
mkdirSync(modelDir, { recursive: true })

if (!existsSync(wasmSrc)) {
  console.error('[setup-assets] @mediapipe/tasks-vision not installed. Run: npm install')
  process.exit(1)
}
for (const f of readdirSync(wasmSrc)) {
  if (f.includes('_module_')) continue // ES-module build not used
  const s = join(wasmSrc, f)
  const d = join(wasmDst, f)
  if (!existsSync(d) || statSync(d).size !== statSync(s).size) copyFileSync(s, d)
}
console.log('[setup-assets] MediaPipe WASM ready in public/mediapipe/wasm')

// onnxruntime-web runtime for AI Perfect Fit (MobileSAM): WASM build
const ortSrc = join(root, 'node_modules/onnxruntime-web/dist')
const ortDst = join(root, 'public/ort')
mkdirSync(ortDst, { recursive: true })
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  const s = join(ortSrc, f)
  const d = join(ortDst, f)
  if (!existsSync(s)) continue
  if (!existsSync(d) || statSync(d).size !== statSync(s).size) copyFileSync(s, d)
}
console.log('[setup-assets] onnxruntime-web ready in public/ort')

if (existsSync(modelFile) && statSync(modelFile).size > 1_000_000) {
  console.log('[setup-assets] Hand model already present')
} else {
  console.log('[setup-assets] Downloading hand model (~7.5 MB, one time)…')
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(modelFile, buf)
    console.log('[setup-assets] Saved public/models/hand_landmarker.task (' + buf.length + ' bytes)')
  } catch (e) {
    console.error('[setup-assets] Could not download the hand model: ' + e.message)
    console.error('Download it manually from:\n  ' + MODEL_URL + '\nand save it as public/models/hand_landmarker.task')
    process.exit(1)
  }
}
