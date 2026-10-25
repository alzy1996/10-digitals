# LIHYA — Build notes

Every choice made without asking, and every check Sam must run by hand.
Format: decision — reason. Newest sections at the bottom.

## Stack and versions (pinned, checked on npm Oct 25 2026)

- React 18.3.1, react-router-dom 7.18.4 (6.30 has a moderate open-redirect advisory; v7 keeps the same
  `BrowserRouter`/`Routes` API and supports React 18), Vite 7.3.7, @vitejs/plugin-react 5.2.0,
  vite-plugin-pwa 2.0.0, Tailwind 3.4.19 (PRD names `tailwind.config.js`, which is the v3 config model).
- Firebase JS SDK 13.1.0 (required by @firebase/rules-unit-testing 6.0.0), firebase-tools 15.34.1 as a dev dependency
  so `npm run test:rules` and `npm run emulators` work without a global install.
- @mediapipe/tasks-vision 1.1.1 (latest stable, Oct 14 2026; API identical to 0.10.x for FaceLandmarker and ImageSegmenter).
- three 0.186.1, jspdf 4.2.1, html2canvas 1.4.1, @huggingface/transformers 4.3.1 (lazy, age model only), qrcode 1.5.4 (shop QR for Try at home).
- Vitest 3.2.7, ESLint 9.39 flat config with eslint-plugin-react (for `jsx-uses-vars`), react-hooks 5.
- `npm audit --omit=dev` lists @grpc/grpc-js under @firebase/firestore. grpc is only used by the Node build of
  Firestore; the browser bundle uses WebChannel, so the advisory does not reach the PWA. Re-check on each SDK upgrade.

## Model files (exact sizes, measured from the official CDNs on Oct 25 2026)

| File | Source (pinned) | Size |
| --- | --- | --- |
| face_landmarker.task (float16, v1) | storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/ | 3,758,596 B (3.6 MB) |
| selfie_multiclass_256x256.tflite (float32, v1) | storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/ | 16,371,837 B (15.6 MB) |
| **Models, first load total** | | **20.1 MB (under the 30 MB budget)** |
| vision_wasm_internal.wasm (SIMD runtime, not a model) | cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm/ | 13,519,922 B uncompressed (jsDelivr serves it compressed) |

- There is no float16 build of selfie_multiclass_256x256 on Google's model storage (checked: 404), so float32 is the only option.
- The WASM runtime is reported separately: it is code, not a model, but Sam should know the phone downloads it once.

## Decisions

- App lives in `lihya/` at the repo root, next to the existing `10 degitals website/` (untouched).
- `.firebaserc` defaults to `demo-lihya` (an emulator-only project id) so everything runs before Sam creates the real
  project; Sam runs `firebase use --add` (manual step A6).
- Digits stay Latin (0-9) in the Arabic UI and PDFs so mm, guard numbers and prices read the same for every barber.
- Theme: dark is the default (PRD 9). A light theme exists with the PRD's light tokens; it is a per-device preference
  (localStorage `lihya.pref.theme`), never business data.
- i18n: shared strings in `src/lib/i18n/ar.json` and `en.json`; each feature area adds `src/lib/i18n/ns/<area>.json`
  (`{ en, ar }`), merged at startup by `useT.js`. Keeps the PRD files and lets areas be built in parallel.
- Look Code alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0, O, 1, I), 6 characters, 32^6 ≈ 1.07 billion codes.
- Guard mapping: nearest guard by distance; a tie picks the longer guard (the barber can always take more off);
  0 mm (under 0.25 mm) means shave; longer than the longest guard means "scissor, keep X mm" (X rounded to whole mm).
- Firebase web config ends up inside the built JavaScript. That is normal: it is a public identifier, protected by
  App Check and the security rules. It is not a leaked secret.
