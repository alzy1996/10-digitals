# KHUSLA — Build notes

What was decided without asking, what was verified in the build, and what Sam must check by hand.
Build date: 25 Oct 2026. Everything below is honest: where something could not be verified from the
build sandbox, it says so.

## 1. Decisions made without asking (simplest option that fits the PRD)

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| 1 | Project folder | The app lives in `khusla/` inside the `10-digitals` repo | Repo already holds the studio website |
| 2 | No keys yet | With empty `.env.local` the app runs against the Firebase Emulator Suite under project `demo-khusla` | PRD: the build never waits for Sam's accounts |
| 3 | Fringes and styles | Stored in their own collections `fringes` and `styles` (same rules as `cuts`) | PRD seeds them but 10.2 lists only cuts/shades/techniques |
| 4 | Signature looks | Collection `salons/{id}/looks` | PRD 8.3 "create signature looks" needs a home |
| 5 | Which salons a user belongs to | `users/{uid}` doc `{ salonIds, lastSalonId }` written by the user; real access is still checked on `staff/{uid}` | No collection-group query or index needed |
| 6 | Public salon name for Try at home | `publicSalons/{id}` `{ name, nameAr, tryAtHome, whatsapp }` | `salons` is staff-read only; the landing page needs the brand |
| 7 | Salon WhatsApp number | `salons.whatsapp` (+968, optional) | "Book on WhatsApp" needs the salon's number |
| 8 | Try at home switch | `settings.tryAtHome` (default ON) mirrored to `publicSalons` | Rules read it for public catalog access |
| 9 | Process type "lift-color" | Added to the PRD's process list for 1–3 level lifts on virgin hair with developer | PRD lists deposit-only / high-lift / lightener / correction / blocked only |
| 10 | Filler rule | "Lightened hair" = bleach, lighter recent color, previously-lightened flag, **or start level ≥ 9** | Natural level 9+ is very rare in Oman; makes the PRD test "level 9 → 5 = filler likely" hold |
| 11 | Grey % | PRD rule plus: interior hair only (no edge pixels), no specular shine, absolute floor L\* 45 | Without these, shine and white-background halos read as grey (24% → 2% on a test photo with no grey) |
| 12 | Add-ons sold | Price items whose product category is `treatment` or `retail` | PRD names gloss, toner, treatment |
| 13 | Clients extra field | `visits` (count) | Needed to learn the growth rate after two visits |
| 14 | Consultation extra field | `notTodayShown` (number of "Not today" plans shown) | Daily report KPI |
| 15 | Consents read | Owner may read consents and audit (still create-only, never edited) | Needed to show the audit trail |
| 16 | Reload during a consultation | Ends the session: photos are wiped at boot | The session state is memory-only by design (privacy) |
| 17 | Look Code collisions | Retry with a new code (rules deny overwriting) | 32^6 ≈ 1 billion codes; collisions are rare |
| 18 | Retention | Owner/manager dashboard sweeps once a day: consultations older than `retentionDays` and clients not seen since are deleted | Spark has no Cloud Functions |
| 19 | AI output size | Worker requests 768×768 (`OUTPUT_SIZE` in `wrangler.toml`) | Inputs are 504×504; 768 is sharper on a tablet. Lower it to 512 if neurons run short |
| 20 | Age model | **OFF** (`FEATURES.ageModel = false`): age band chips only | See 3.1: license could not be confirmed from the sandbox |
| 21 | QR code for Try at home | `qrcode-generator` (MIT, 1 file, no deps) renders the salon link QR in Settings | PRD 8.2 mentions a QR code in the salon |
| 22 | Developer volume | Shown as a generic reference line ("40 vol") in the Lift check; never brand mixing ratios | PRD 4.10 lists the volumes |
| 23 | Front pose window | yaw ±10°, pitch ±15°, roll ±8°; 45° shots accept 30–60° | Not specified; a test photo at 17.7° pitch was rejected at ±12° |
| 24 | Quick shorten | Allowed only when the new line is below the chin | Above the chin the cut reveals face and ears; the silhouette and AI Final Look cover that |
| 25 | Light Switcher strength | Partial adaptation 0.5 (50% toward the preset white) | Full adaptation turned the whole photo orange at 2700 K |
| 26 | Theme | Light default; dark is a per-device choice in Settings | PRD 9.1 defines both palettes |
| 27 | Deploy route | GitHub Actions: `khusla-ci.yml` runs lint, unit, rules, build and size checks on every PR; `khusla-deploy.yml` runs the same checks and then `firebase deploy` (Hosting + rules + indexes) on every merge to `main` | Sam asked to deploy from GitHub. Firebase Hosting stays (PRD stack, SPA rewrites and headers that GitHub Pages cannot set). The Worker stays a manual `wrangler deploy` (optional feature, off by default) |

## 2. Where everything is

- On-device AI and color science: `src/ai/` only. Screens import only `src/ai/index.js`.
- Every Firestore read/write: `src/services/*.js`. Components never call Firestore.
- Field lists for every document: `src/services/schema.js` (the rules mirror them).
- Translations: edit `scripts/i18n-source.mjs` (English + Arabic side by side), then `npm run i18n`.
- Feature flags and the app name: `src/config/app.js`.

## 3. Licenses and models

| Item | Status |
| --- | --- |
| MediaPipe Face Landmarker, selfie_multiclass_256x256, hair_segmenter | Apache 2.0 (Google). Loaded from `storage.googleapis.com/mediapipe-models/...` pinned `/1/` paths. |
| MediaPipe Tasks Vision runtime | `@mediapipe/tasks-vision@1.1.1` (npm, bundled JS 45 KB gz); wasm from jsdelivr pinned to the same version |
| Monk Skin Tone values | CC BY 4.0 (Google) |
| MI-GAN (Quick shorten) | Code MIT; the repo's `LICENSE-WEIGHTS` file is the MIT text (checked on GitHub). ONNX from the official link in the MI-GAN README (`huggingface.co/andraniksargsyan/migan`). **File size not verified** (Hugging Face is blocked in the sandbox); it loads only when Quick shorten is used. Offline or on failure the on-device classic fill runs instead. |
| FairFace age (Option A) | **Not enabled.** Hugging Face was not reachable from the sandbox, so the license (believed Apache 2.0 on the model card, FairFace dataset CC BY 4.0) could not be confirmed. Code is complete in `src/ai/models/age.js`. To enable: open the model page, confirm commercial use is allowed, set `FEATURES.ageModel = true`. |
| FLUX.2 [klein] 4B | Apache 2.0 per the PRD; the Worker uses only `@cf/black-forest-labs/flux-2-klein-4b`. The model page could not be opened from the sandbox; the multipart input format (`input_image_0..3`, each < 512 px, steps fixed at 4) was confirmed from Cloudflare's changelog via search. |
| Fonts | IBM Plex Sans Arabic, Fraunces, Amiri: SIL OFL, bundled with `@fontsource` (work offline) |

### Model sizes (first load)

| File | Size |
| --- | --- |
| face_landmarker.task (float16) | 3.76 MB |
| selfie_multiclass_256x256.tflite (float32) | 16.37 MB |
| hair_segmenter.tflite (float32) | 0.78 MB |
| vision_wasm_internal.wasm | 13.5 MB raw, about 4.0 MB compressed on the wire |
| App shell (dist, gzipped) | 1.39 MB |
| **First load total** | **about 26 MB** (PRD budget: under 30 MB) |

Lazy (only when used): MI-GAN ONNX (size unverified), onnxruntime-web 1.23.2 wasm from jsdelivr,
FairFace (off). The service worker caches all model URLs CacheFirst, so later visits are offline.
No model file is in `dist/` (checked by `npm run check:size`).

## 4. Free tier numbers (re-check)

The official pricing pages (firebase.google.com, developers.cloudflare.com) were **not reachable
from the build sandbox**. Third-party summaries dated October 2026 agree with the PRD for Firestore:

- Firestore Spark: 1 GiB stored, 50,000 reads / 20,000 writes / 20,000 deletes per day, 10 GiB egress per month.
- Hosting Spark: 10 GB storage, 10 GB transfer per **month** (≈ 333 MB a day; the PRD's "360 MB per day" is the older figure). Models are never served from Hosting.
- Cloud Storage: needs Blaze since Feb 2026, not used.
- Workers AI: 10,000 free neurons per day, reset 00:00 UTC (04:00 Muscat). Workers KV free: 1,000 writes per day (each AI render uses 2, so the 80-render cap uses 160).

Sam: open https://firebase.google.com/pricing and https://developers.cloudflare.com/workers-ai/platform/pricing/ once and confirm.

Writes per client in the chair: about 6 to 10 (draft, params, approvals, done, client profile,
daily stats, consent, audit). A 40-client day ≈ 400 writes, 2% of the daily free writes.

## 5. Security notes

- The Firebase web config ends up inside the built JavaScript. That is normal: it is a public
  identifier, protected by App Check (reCAPTCHA v3) and the Firestore rules.
- No secrets in code: `.env*` is git-ignored (`.env.example` has empty values). The Worker has no API
  keys (Workers AI binding + `wrangler login`). `npm run check:size` also scans tracked files for
  `.env` files and key patterns.
- Rules: default deny, `keys().hasOnly()` on every client and consultation map; the "reacted to dye"
  answer has no field anywhere, so it cannot be stored. A consultation with an extra field such as
  `allergy` is denied (tested).
- **Firestore expression budget:** a complete consultation write costs about 885–920 of the 1,000
  expressions Firestore allows per write. The services write step by step (draft → params →
  agreement → approvals → done). If a new validated field is added, the three worst-case rules tests
  fail first — keep it that way.
- GitHub deploy: the web config and the deploy key live only in GitHub repository secrets. The
  deploy key is a service account with Firebase Hosting Admin, Firebase Rules Admin, Cloud Datastore
  Index Admin and Service Usage Consumer (no data roles). The workflow refuses to deploy when a secret
  is missing, the project id starts with `demo-`, the key belongs to another project, or the build
  does not contain the real project id (a build without keys would point at the emulators).
- When App Check enforcement is ON for Firestore, the Worker forwards the client's App Check token on
  its Firestore REST membership check, so AI still works.

## 6. Automated checks run in this build (all green)

| Check | Result |
| --- | --- |
| `npm run build` | passes (Vite 8, PWA generateSW) |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` (unit) | 65 tests: color (sRGB→Lab within 0.5, all 34 Sharma 2005 ΔE2000 pairs, ITA bands, MST, Bradford round trip < 0.5 ΔE), levels, lift rules (all 6 PRD cases), shrinkage (30 cm curly 40% → 18 cm), scale, face shape (7 synthetic sets + landmark/mask set), recommendation determinism and blocked plans, dayKey (19:59:59 vs 20:00:00 UTC), CSV (Arabic, BOM, bad rows), i18n completeness and no emoji, classic inpainting |
| `npm run test:rules` | 118 tests, one allow and one deny per rule, incl. `allergy` denied |
| `worker/` `npm test` | 56 tests (CORS, auth, anonymous, staff check, ai_off, caps, 429, multipart fields, no logging of tokens or images) |
| `npm run check:size` | gzipped shell 1.39 MB (< 2 MB), no model files in dist, no tracked secrets |
| PWA | Chrome reports 0 installability errors; manifest valid; offline reload renders the app |
| Browser E2E (`scripts/e2e.cjs`, emulators, Playwright Chromium) | 25 checks, all pass: email-link sign-in, Create salon with seed + demo, on-device analysis, Looks (6 thumbnails), Compare, Grey Journey, AI Final Look consent → render → label → consent again → 429 in both languages (mock Worker), two approvals, Agreement PDF + PNG, "Next client" wipes IndexedDB, live dashboard, products CSV (3 valid / 1 rejected), staff invite, Swatch Scan, daily PDF, Try at home Look Code (anonymous), stylist loads the code, English LTR toggle, no horizontal overflow on any screen |
| Live camera (fake camera device) | pose gate hints, auto-shutter fires on a frontal face, background blurred on screen |
| Color accuracy (rendered hair vs swatch, mid-tones, no white card) | ΔE2000 2.96 (dark hair → caramel) and 0.83 (brown hair → caramel); target ≤ 8 without card, ≤ 5 with |

Measured in the sandbox (software GL, no GPU — real phones are much faster on the models):
analysis 6.8–7.5 s warm, of which MediaPipe inference ~3 s on SwiftShader; JS analysis 0.4–0.6 s;
render textures 0.66 s (built after the Profile screen opens); one color re-render < 1 ms GPU
submit. The "under 3 s on iPhone 12" target must be confirmed on the phone (section 7).

## 7. Manual checks for Sam (cannot run in the sandbox)

Do these on real devices after deploying (README part A). Write the result next to each line.

1. **Devices:** iPhone (Safari), mid-range Android (Chrome), iPad (Mirror Mode: canvas 70% on the right in Arabic), desktop Chrome (owner screens with side nav).
2. **Speed:** open the app once on Wi-Fi (models download), then: New client → Use a photo → time until the Profile screen. Target ≤ 3 s on iPhone 12. Then change shades in Color Lab: the change should feel instant (≤ 50 ms).
3. **Auto-shutter:** in normal salon light, front shot fires within 3 s of facing the camera; Private Mode blur is visible on screen.
4. **Left/right convention:** ask a colleague to turn to *her* left for the "Left 45°" shot. If the app keeps saying "turn more to your left" while she is clearly turned left, swap the yaw sign in `src/ai/capture/poseGate.js` (`TARGETS.left` ↔ `TARGETS.right`).
5. **iOS segmenter:** on iPhone, run one analysis and check the hair is detected (not the face). The app runs the segmenters on CPU on iOS and self-tests classes; if the hair card shows nonsense levels, send me a screenshot.
6. **Accuracy set (30 consenting women, labelled by a senior colorist):** face shape top-1 ≥ 70%, top-2 ≥ 90%; MST ±1 ≥ 85%; mid-length level ±1 ≥ 85%; grey % ±10 ≥ 80%; length ±2 cm vs tape ≥ 90%. Tune thresholds in `src/ai/analysis/faceShape.js`, `skinTone.js` (undertone hue angles), `grey.js`.
7. **Color:** with a white card, render a scanned swatch shade and compare the mid-lengths to the real swatch: ΔE2000 ≤ 5 (≤ 8 without the card).
8. **Swatch Scan repeatability:** scan the same swatch twice under the same light: the app shows "Re-scan difference ΔE" — target ≤ 2.
9. **Offline:** after one online visit, turn on airplane mode → full chair flow (photo → Agreement Card) works; the top bar shows "Saved on this device, will sync"; turn airplane mode off → data appears on the owner dashboard of another device.
10. **Privacy:** after "Next client" or 5 idle minutes, nothing is left (Safari: Settings → Safari → Advanced → Website Data → your site shows no large storage); nothing appears in the Photos app; AI Final Look asks every single time; the owner's Settings → Audit trail and consents show each consent.
11. **Arabic:** every screen in RTL; open the Agreement Card PDF on the phone: Arabic letters joined correctly.
12. **AI Final Look (only if enabled):** results always carry the "AI preview" label; at the cap, the message appears in Arabic and English.
13. **Highlights realism:** babylights / highlights on very dark hair look graphic on some photos. Try 10 real clients; if needed lower `density` defaults in `src/data/techniques.json` (`params.density`).
14. **Hair tied back:** length reads short when hair is tied back. The stylist sets the real length with one tap (Profile or Cut Studio "Her current length").
15. **Legal (before selling):** ask MTCIT or a lawyer whether processing face images on the device needs a PDPL permit (Royal Decree 6/2022, amended September 2026); keep the answer on file.

## 8. Known limits (honest)

- Changing the cut *shape* realistically needs the AI Final Look (cloud, consent). On-device = Length Tape, silhouette, fringe overlay and Quick shorten below the chin.
- Try at home needs a connection on the first visit (salon name, public catalog, Look Code). The chair flow works offline after the first load.
- The KV caps in the Worker are approximate under concurrent use (KV is eventually consistent).
- Workers Free allows 10 ms CPU per request; decoding the model's image output is the heaviest step. Watch `npx wrangler tail` after the first real deploy.
- Live mirror (real-time recolor on the camera) uses a simplified root map (vertical position), so placement-heavy techniques preview best on the still photo.
