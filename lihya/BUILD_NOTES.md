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
- Hosting: Sam chose GitHub Pages (Oct 25 2026). The repo is public, so Pages is free. The app is built with
  `LIHYA_BASE=/10-digitals/` and served at `https://alzy1996.github.io/10-digitals/`; `.github/workflows/lihya-pages.yml`
  lints, tests, builds, runs the size gate and deploys on every push to main that touches `lihya/`.
  Firebase Hosting still works unchanged (`npm run build` with the default base `/`, `firebase deploy`).
  Sub-path support: Vite `base`, router `basename`, PWA scope/start_url, `src/lib/paths.js` (`appUrl`, `assetUrl`)
  for every absolute link (email sign-in links, invite links, Try-at-home QR). Pages has no SPA rewrite, so the
  build copies `index.html` to `404.html`; deep links like `/10-digitals/try/<shopId>` load the app (with a 404
  status on the first hit, which browsers ignore for rendering) and the service worker serves them offline after.
- Firestore rules and indexes are not hosting: they still deploy with `firebase deploy --only firestore:rules,firestore:indexes`
  from Sam's machine (manual step), whatever the hosting.
- Age band model (PRD 5.1): **Option A** — `onnx-community/fairface_age_image_detection-ONNX` (q4, about 50 MB) through
  transformers.js 4.3.1, lazy, Wi-Fi only, cached by the browser. Licence: the upstream model
  `dima806/fairface_age_image_detection` is Apache-2.0 (Hugging Face model card; the ONNX conversion inherits it — the
  conversion's own card could not be opened from the build sandbox, so Sam should glance at it once). The onnxruntime
  WASM loads from the pinned jsDelivr copy, never from our hosting. When the model is missing or the confidence is under
  0.5, the age chips ask instead (never a number on screen).
  Revision: `AGE_MODEL.revision` in `src/ai/models/cdn.js` is `'main'` because the full commit hash could not be read from
  the build sandbox (latest commit seen in search results: `fd04cdd…`, `onnx/model_q4.onnx` 56.8 MB). Sam: open
  https://huggingface.co/onnx-community/fairface_age_image_detection-ONNX → **Files and versions** → **History**, copy the
  full 40-character hash of the latest commit, paste it as `revision`, commit. This pins the model like the MediaPipe files.
- Going shorter (PRD 7.2): **Outline mode**, no on-device inpainting in v1. MI-GAN is MIT-licensed but its browser ONNX
  pipeline is about 80 MB (third-party figure) and LaMa ONNX is about 200 MB; neither size nor the input format could be
  verified from the build sandbox (Hugging Face blocked), so the PRD fallback applies: green zones keep, red zones come
  off, brass target lines.
- Beard density (PRD 5.1 says "WebGL shader"): implemented in plain JavaScript on a face crop downscaled to 720 px
  (bilateral smoothing, texture energy, chroma drop inside each zone polygon). Measured 2.05 s for 4 shots on the CPU path
  in the build sandbox (software GPU); the 3 s iPhone 12 budget must be confirmed on the phone (check 14.2-3 below).
  A WebGL port is the next step only if the phone misses the budget.
- Weak-zone penalty (PRD 6.1 "any required zone under 40%"): applied when a zone is under min(40, the style's own
  requirement), so light and short stubble (requirements 30/35) are not punished for a 35% cheek — barbers recommend
  those styles for patchy beards. One −25 per style.
- PRD 7.1/7.2 drag handles: cheek-line and neckline handles on the front photo in Photo mode (phone and Mirror Mode),
  offset sliders kept as the accessible alternative, Live AR slider-only. Mustache shape stays one of the 13 presets:
  no mustache Bezier or edge drag in v1.
- PRD 9.5 Studio ruler: laid along the projected jaw on the front photo; in Live AR and on the 45-degree shots it is a
  straight ruler at the top of the frame. On the Cut Card the ruler follows the Zone Diagram's jaw
  (`src/reports/jawRuler.js`, ticks every 5 mm from the middle of the chin).
- **Demo mode (Oct 26 2026)**, so the GitHub Pages link works before Sam's Firebase project exists. Decided in
  `src/lib/appMode.js` (`resolveMode({ prod, hasRealConfig, usingEmulators, demoFlag })`, pure and unit-tested):
  emulators (`VITE_USE_EMULATORS=true`) always win and are never the demo; `VITE_DEMO_MODE=true` forces the demo;
  a complete web config (apiKey, projectId, appId) is the real app; a production build without one is the demo
  (`VITE_DEMO_MODE=false` turns that fallback off: setup notice); a development build without config keeps the setup
  notice. Adding the secrets therefore switches the same link to the real app with no code change.
  How it runs: the Firebase SDK starts with a dummy config (project `lihya-demo`), no Auth and no App Check, and
  Firestore's network is disabled right after `initializeFirestore` (persistent multi-tab cache). Firestore is then a
  local database in the browser: writes apply at once, listeners and queries (collection groups, where/orderBy/limit)
  answer from IndexedDB, and the demo survives a reload. Because the network never comes back, a commit promise never
  settles: in demo mode `commitOps` starts the batch and resolves at once without tracking it (no "will sync" badge),
  snapshots report `{ hasPendingWrites: false, fromCache: false }` (a missing document is missing, not "still
  loading", so unknown shop links answer at once), one-time reads go straight to the cache, and the start-up
  `waitForPendingWrites` tracking is skipped. Every demo branch is guarded by `demoMode`; real mode is unchanged.
  The user is the fixed `DEMO_USER` (`demo-owner`, verified, not anonymous); every sign-in resolves it without the
  network and `getIdToken()` is null, so the AI Worker URL and the AI quota are treated as not configured (AI Final
  Look off). The start screen makes **LIHYA Demo Barbers** on first open (`shops.createDemoShop()`, once per page load:
  catalog, demo clients and visits) and opens the last demo shop directly afterwards; `/login` and `/join/*` go to the
  start screen. Look Codes are made without anonymous sign-in or a server wait (a taken code is checked in the local
  copy); invites are saved but not emailed (`createInvite` returns `demo: true`, Staff shows the join link with
  "Demo: invites are not sent"). A shop or Try-at-home link this browser does not know shows "This demo shop is not
  in this browser" with **Open the demo**. UI: a brass **Demo** pill in every top bar (DemoContext from
  `src/state/DemoMode.jsx`, so the UI kit imports no service) opens a bilingual sheet with **Reset demo**; Reset demo
  replaces Sign out, and the sync badge is hidden.
  Reset demo (`auth.signOutAndClear` in demo mode): clears the IndexedDB `session` and `saved` stores, moves to the next
  demo database generation (`PREF_KEYS.demoGeneration`; the Firebase app is named `lihya-demo-<n>`, so the reset holds
  even when another tab keeps the old database open), terminates Firestore, clears its persistence when no other tab
  holds it, and loads the start screen, which makes a fresh demo shop. Language and theme stay.
  Limits: one browser only (another device gets its own demo; the shop link and Look Codes open only where they were
  made); the Firestore SDK may log "Failed to obtain primary lease" when two tabs of the demo (or of the real app) swap
  the primary tab, which is harmless; clearing site data deletes the demo.
- **Demo QA fixes (Oct 27 2026).** (1) Every listener in demo mode listens to the local cache only
  (`db.LISTEN_OPTIONS`, `source: 'cache'`, also `watchMyShops`). A listener that waits for the server answers an
  empty list or a missing document only when its tab's SDK knows it is offline; with multi-tab persistence a tab that
  starts as secondary takes that state from the primary tab's last broadcast, which is ignored once the tab that wrote
  it has closed. Seen in Playwright: demo open in tab A, Try at home in tab B, tab A closed and opened again: Staff
  "Pending invites", an empty Products list and the dashboard's Add-ons tile loaded for ever. Real mode is unchanged.
  (2) Reset demo in one tab deletes the database the other demo tabs use, which then said "Could not open the shop";
  `DemoProvider` now reloads those tabs when `PREF_KEYS.demoGeneration` changes (an old shop link then shows "This
  demo shop is not in this browser" with Open the demo). (3) Settings > Apply now (retention) works offline in demo
  mode (it only touches this browser's copy).

## PRD 14.2 — manual checks for Sam (real devices)

Do these on the deployed site after section 3 of the README. Mark each pass or fail.

1. **Devices.** Open the site on an iPhone (Safari), a mid-range Android (Chrome), an iPad (landscape, Mirror Mode) and
   desktop Chrome. Sign in, open your shop, and run one full customer on each. Pass: every screen works and looks right.
2. **Auto-shutter.** In normal shop light: New customer → Walk-in → let the camera run (full 4 shots). Pass: each shot
   fires by itself within 3 s once the pose is right; the arrows point the right way in Arabic and in English
   (turn your head to YOUR left when it says left).
3. **Speed.** Time from the last shot to the profile screen: under 3 s on iPhone 12. Time from the first photo to the
   chosen style: 90 s or less, median over 10 real customers (the dashboard shows the average decision time).
4. **Accuracy set (30 consenting faces, labeled by a senior barber).** For each: capture, note the face shape top-1/top-2,
   the MST number and the measured beard length; compare with the barber's labels and a ruler. Pass: face shape top-1
   ≥ 70%, top-2 ≥ 90%; MST within ±1 ≥ 85%; beard length within one guard size ≥ 90%. If not, the thresholds to tune are
   `src/ai/analysis/faceShape.js` (SHAPE_RULES, OVAL_PROTOTYPE) and `src/ai/analysis/beardDensity.js` (DENSITY).
5. **Color.** With plain white printer paper beside the cheek (tap it on the front shot), render each dye on a customer
   and compare the beard mid-tone in the photo with the swatch. Pass: ΔE2000 ≤ 5 with the card, ≤ 8 without.
6. **Live AR speed.** Studio → Live on iPhone 12 and the Android. Pass: smooth (24 fps or more); turning the head ±30°,
   nodding and talking keeps the beard on the jaw and never on the lips or nose.
7. **Offline.** Load the app once online and open the camera (models download, about 20 MB). Airplane mode → reload →
   run a full customer to the Cut Card and Done. Pass: everything works, the "Saved on this phone, will sync" badge shows;
   turn the network back on and the consultation appears on the owner's dashboard on another phone.
8. **Privacy.** After "Next customer", Safari Web Inspector (or Chrome DevTools) → Application → IndexedDB → `lihya` →
   `session`: empty. AI Final Look (if enabled) asks for consent every time, and Firebase console → Firestore →
   `shops/<id>/consents` has one entry per answer, with no photo.
9. **Arabic.** Walk every screen in Arabic: right-to-left, arrows mirrored, numbers readable; open a Cut Card PDF and
   the daily report PDF: Arabic letters joined and right-to-left.
10. **Idle wipe.** Take a front shot, leave the phone untouched for 11 minutes (screen on). Pass: the app returns to the
    barber home and says the session was cleared; IndexedDB `lihya` → `session` is empty.
11. **AI Final Look (only if enabled).** Set Settings → AI daily cap to 1, render once, try again. Pass: the message
    "Today's AI previews are used up. Live preview still works. Resets at 4:00 AM." appears in English and Arabic, and
    every result carries the "AI preview" label. Set the cap back afterwards.
12. **Legal.** Before selling to shops, ask MTCIT or a lawyer whether processing face images needs a permit (PDPL,
    Royal Decree 6/2022, amended September 2026). Keep the answer on file.

## Decisions by area (reported by each module engineer)

### UI kit
- Only arrows, chevron-left/right, undo, logout and backspace mirror in RTL; search, phone, refresh and profile do not — follows the usual RTL mirroring guidance
- Look Code boxes and keypad are always left-to-right (dir=ltr) — the Latin code must read the same in both languages
- CodeBoxes puts an invisible input with inputMode="none" over the boxes — a hardware keyboard and long-press or Ctrl+V paste still work, while the phone keyboard stays closed; the Paste key appears only when navigator.clipboard.readText exists
- Chip is a 40 px pill whose ::before extends the tap area to 44 px — meets both the PRD chip size and the 44 px minimum
- The slider's value bubble is always visible and slides from edge to edge so it never leaves the track; in RTL the minimum is on the right (start) side and the arrow keys move the thumb visually
- Sheet is modal by default; modal={false} drops the backdrop and focus trap so the customer still sees the AR canvas in the Studio
- Snackbar sits above the ScreenFrame footer using --footer-h; confirmUndo applies the change on timeout, dismiss, replacement or page hide, unless Undo is tapped
- ZoneDiagram label: line 1 is the formatted mm, line 2 a short guard text ('#2', 'No guard', or 'Shave' / 'Scissor' since the mm is already on line 1); zones without a mm value get no tint and no label
- N zone = jaw to neckline (PRD section 4); a 26-unit band under the neckline is always tinted remove (clean neck)
- cheekOffset and necklineOffset: positive raises the line (+1 = 14 units for the cheek, 8 for the neckline) — the contract does not define the sign
- Cut Card cheekLine.mmAboveJaw is placed proportionally between the drawing's low line (25 mm) and high line (70 mm); neckline mmAboveAdamsApple maps at about 0.85 units per mm — the face is schematic and the exact numbers are in the labels
- Profile view defaults to the customer's left side (nose to the viewer's left); side='R' mirrors the drawing and re-lays out the labels
- Ring arc runs counter-clockwise in RTL; the number uses Barlow Condensed so '100%' fits inside 72 px
- Stat values are wrapped in <bdi> — keeps '4 / 20' from flipping in Arabic while the tile stays start-aligned
- Transitions use duration-[var(--dur-*)] instead of the fixed Tailwind duration-press — so prefers-reduced-motion zeroes them (checked in the browser)
- LangToggle hides its globe icon below 480 px; SyncBadge shows 'Saved on this phone, will sync' whenever writes are queued, online or offline (with 'Offline ·' in front while offline), and 'Offline' alone only when nothing is queued. On phones the top bar shows the offline states as a full-width line under the bar (SyncStrip) and online-pending as a short 'Saved, will sync' pill — leaves room for the screen title
- RatingDots show the number under each dot — the rating is clear without emoji
- BeforeAfter: holding 180 ms without moving shows the original; moving more than 8 px drags the divider; a quick tap moves the divider
- Brand mark is a brass beard-shield outline with a mustache stroke plus 'LIHYA' in Barlow Condensed 700; the maskable icon content is scaled to 74% — keeps it inside the 80% safe circle
- Field calls onChange(value, event) — value first, like Slider, ChipRow and Toggle
- OwnerShell: on phones the tabs render under the ScreenFrame top bar (through ShellContext); without a ScreenFrame the shell shows the tabs itself

### Firebase layer
- Single batch for Create your shop, with write rules using getAfter() — the shop, owner, catalog and demo land atomically; the emulator confirmed repeated reads of one doc are counted once against the 20-read limit.
- Pure op builders (seed.js, ops.js) shared by the services and the rules tests — the rules suite runs the exact seed and demo-delete batches the app sends.
- Listeners retry permission-denied at most twice, after this phone's queued writes land (or 1.2 s) — fixes the race where a listener reaches the server before the shop/staff batch; public listeners opt out so genuine refusals show at once.
- Stats are bumped inside consultations.js: consultations +1 on create; approvals, decision seconds and topStyles on the first approve; addOns on complete. Screens only call bumpAiRender per AI render — so counters can't be double-counted by screens.
- Look Code create also requires the shop's Try at home to be on (or the creator to be staff) — stops codes being written for shops that turned the feature off.
- Invites allow only the manager or barber role; promotion to owner is done afterwards with setStaffRole — a stray invite can never create an owner.
- Rules also stop an owner deactivating themselves, not only changing their own role — prevents a shop locking out its only owner.
- Demo records can only be created by an owner or manager; managers may delete demo docs, only owners delete real clients/consultations — matches the Settings 'Delete demo data' button and the retention purge.
- No composite indexes are needed: range and ordering are single-field, demo filtering and style sorting happen on the device; indexes.json has the staff.uid collection-group override plus indexing exemptions for large map fields (params, cutCard, settings, audit changedFields, style geometry) — keeps index writes and storage low on the free tier.
- Client search key: lower case with Arabic letter variants unified (alef forms, ta marbuta, alef maqsura, diacritics, tatweel), stored as displayNameLower; a phone-looking query searches by normalized phone — Gulf name spellings vary.
- Client docs gain lastLengths {zonesMm, at} (mm per zone, not ratios) — the minimum history needed to learn growthMmPerDay; consultations store a compact cutCard {zonesMm, guards, cheekLineMm, necklineMm, notes, safetyFlags} converted from buildCutCard output.
- createConsultation updates the client's lastVisitAt in a separate batch — a client deleted meanwhile must not make the consultation write fail.
- Audit values: before/after arrays are stored as {list: [...]} — Firestore rejects nested arrays; Timestamps become dates and placeholder server values become null.
- Before-values for audit diffs come from a memory of the last snapshot seen (shop, staff, styles, products, invites) — no extra reads.
- Added owner-run purgeExpiredData(shopId) for settings.retentionDays — Spark has no scheduled functions; it deletes old consultations and long-unseen clients, and keeps consents, audit and daily totals.
- Demo client names are marked '(تجريبي)' / '(Demo)' and have no phone numbers — an invented number could belong to a real person.
- App Check is skipped with a console warning when VITE_RECAPTCHA_SITE_KEY is empty — a missing key should not break the app before Sam sets it up.
- Sign-in emails follow the app language (auth.languageCode from the language preference) — Arabic is the default.

### On-device analysis
- detectImage and segmentImage are async; detectVideo and segmentVideo are sync — one shared instance must await setOptions to switch runningMode, while the live AR loop needs a synchronous per-frame call.
- Pose is measured against the camera axis, not the line of sight — this matches what the landmarks show for an off-centre face in a cropped photo; for a centred live face the two agree.
- Side shots also require |pitch| <= 15 and the chin-up shot |yaw| <= 10 — the PRD does not specify these; they keep the profile level and the neck seen square on.
- Hold rule: 400 ms between frame sampling times AND at least 3 consecutive steady frames — a slow first detection had counted as a held pose after a single frame.
- Uneven cheek light ('light' hint) blocks the shutter for at most 2 s once pose, distance, exposure and sharpness are right; after that the shot fires with issues ['light'] — the PRD KPI is the shutter firing within 3 s in normal shop light.
- Sharpness threshold is a Laplacian variance of 25 on a 160 px-wide face crop — calibrated on the test portrait: sharp 1601, 1 px blur 110, 2 px blur 17.
- The segmenter self-test runs on a downscaled copy of the first frontal captured shot (or the uploaded photo), never mid-hold — its mask readback blocks the main thread.
- Self-test passes when face-skin covers at least 55% of the face oval shrunk by 15%, and background is under 50% of a band just above landmark 10 — a hair-above test would wrongly fail bald men and men wearing a kumma.
- Face-shape ratios are calibrated so the MediaPipe canonical (average) mesh maps to an oval prototype (length/cheek 1.45, forehead/cheek 0.93, jaw/cheek 0.88, jaw angle 130 deg) — the PRD's barber thresholds applied to raw landmarks 234/454 classify most faces as round or diamond. Reported mm measures are raw.
- Shape conditions combine as product^(1/sqrt n), then normalise to sum 1 (rounded with the largest-remainder rule) — a plain geometric mean let one clearly failed condition barely dent shapes with many conditions.
- The jaw angle is measured in the front image plane at 172/397, toward the mid-point of 93/132 (and 323/361), against chin 152 — MediaPipe z is noisy; the value is offset to the oval prototype.
- Hairline: when the walk is blocked by a cap (others or clothes class) the hairline is max(cap edge, default 10% of the 10-152 distance above landmark 10) and marked estimated; bald heads, bangs and mask failures fall back to the default, also marked estimated.
- Skin colour is the trimmed mean of each region weighted left cheek 0.35, right cheek 0.35, forehead 0.3 — the forehead patch has three times the pixels and most of the highlights.
- Beard hairness uses linear-RGB chromatic saturation (shading keeps chromaticity), darkness gated by texture or saturation drop, and texture damped by structure-tensor coherence — shadows, the jaw edge and smile folds had read as hair on the clean-shaven portrait.
- Inside face-mesh zones only background pixels are excluded; the neck zone N also drops clothes and accessories — a painted (or long) beard came back from the segmenter as clothes/others, while collars sit in N.
- The chin-up shot is segmented too — so a white dishdasha collar is not read as grey hair in the neck zone.
- Lengths: a silhouette reading only wins when it is over 3 mm; otherwise the length comes from density (0 mm under density 10, else 0.5 to 3 mm). K = 0.9 x J, B = 0.7 x min(J, 20), S = 0.8 x C and N = 0.8 x C (or J) when those were measured — the front view cannot resolve stubble length.
- Beard colour uses beard pixels only when at least 12% of zone pixels read as hair, otherwise non-grey scalp hair, otherwise natural-black; it matches only catalog entries with type 'permanent' and a hex — sideburn edges and shadows on a clean face had produced medium-brown.
- Grow-ability uses generic weights M .14, S .04, C .16, J .12/.12, K .15/.15, B .06/.06, N 0 — the recommend engine recomputes per style.
- Age bands: overlap-weighted mapping; mass under 18 goes to 18-24; band selected only at probability >= 0.5 — the customers are adults; the PRD sets the 0.5 rule.
- canLoadAgeModel: true when the model is already loaded; otherwise online, no saveData, link not cellular/none/bluetooth; Wi-Fi/ethernet allowed; unknown link type allowed on desktop only (brief).
- White card is refused when the tap or more than 20% of the grown region is inside the face oval, or when a gain falls outside 0.55..1.8 — the teeth were accepted as a card in the end-to-end test.
- analyzeShots uses the segmenter only if it is already 'ready' and reliable (it never starts a 16 MB download) and the age model only if already loaded — screens control downloads through loadModels/loadAgeModel.
- applyOverrides keeps profile.overrides to the PRD keys { faceShape, undertone, ageBand }; an mst override is written straight into skin.mst (clamped 1..10) and zone confirmations set density and confidence 1 — the PRD 5.8 shape has no mst slot in overrides.
- Pixel work runs on a face crop downscaled to 720 px max side, and the segmenter sees a 384 px copy — the network works at 256x256 and CPU segmentation of a full 820x1024 frame took about 500 ms.

### Catalog and recommendation
- Arabic source: pdfplumber glyphs (visual order) converted to logical Unicode, every string checked against 220-DPI page renders; harakat placed as rendered (سُنّة, مضفّرة, مشكّل, يُنعّم, عرضاً) — the PDF text layer misorders marks and lam-alef.
- 'all X' sets all 10 zones including N; 'rest 0' zeroes every other zone (chin strap and chin curtain therefore have B 0, N 0) — PRD wording taken literally.
- Unspecified zones filled with barber-typical values and logged in zoneNote: extended-goatee S 10, circle-beard S 8, anchor S 6, hollywoodian S/N 10, mutton chops J 15, short-boxed S 10, beard-fade M 10 S 12 N 10, sunnah K40 J60 S60 B30 N40, ducktail M15 S30 B12 N25, verdi S40 B15 N40, old-dutch K30 S30 B20 N40, french-fork and viking (the rest of the full beard) — the PRD gives only the defining zones.
- Lines column mapping: natural/none -> soft edge; crisp -> crisp; sharp -> razor; razor -> razor plus straight cheek line (khatt); 'natural or crisp' (full-medium) defaults to soft — the first option listed.
- Neckline defaults: N 0 with jaw or chin hair -> 'jaw' (follows the jaw curve); long beards -> '1f' per PRD 4.3; others '2f'. Sideburns: shaved B with a lower beard -> 'disconnected', faded beard -> 'skin-fade', else 'blended' — keeps lines consistent with the zones.
- Royale gets a new chin value 'strip' — the contract enum had nothing for a narrow chin strip; reported to rendering.
- Clean shave has no weights or requirements, Grow 1 and grow-ability 100 — it needs no growth; an empty sum read literally would always bury it.
- N (neck) is never weighted or required — neck density is often unmeasured or shaved and rarely limits a look.
- Weak zone = density under min(40, the style's own requirement); one −25 penalty per style however many zones are weak — light and short stubble (requirements 30/35) are not punished for a 35% cheek, which barbers recommend for patchy beards.
- Faded beard sideburn requirement lowered to 25 — its sideburns fade to skin anyway, so weak sideburns should push customers toward it (PRD 6.4 pairing).
- Freshly shaved face (unconfirmed face zones average under 12% density, max under 25%): measured densities count as unknown (neutral 50, no penalty, no grow_ok chip, growability null) until the barber confirms zones — a bare face shows no growth to read (found on the real portrait).
- Work rule 'clean' leaves only clean-shave (light stubble is hidden too); 'short' leaves lengthClass none/stubble/short and hides theatrical styles — literal reading of 'clean-shave only' and 'short and neat only'.
- Eid boost applies to edge crisp or razor, or tag 'eid' — PRD: 'razor-lined and crisp styles'.
- Contrast: level = clamp((|skin L* − beard L*| − 15) / 35), beard L* lifted toward grey by the grey ratio; fit = level × line definition + (1 − level) × length visibility; the high_contrast chip needs a beard darker than the skin — matches the chip wording.
- Age: theatrical styles 55+ 0.45, long styles 55+ 0.65, Sunnah 45-54 and 55+ 0.9, else 0.8; opts.chosen restores 0.8 — PRD 'unless the customer picks them'.
- Life: visit fit = 1 if trimDays >= visit days, else 0.4 + 0.6 × ratio (styles trimmed every 4 days or less count as kept at home when he grooms 5+ min); grooming fit vs a per-length need (10+ min covers all); mean of the answered parts, neutral 0.75 when unanswered.
- Face uses normalised face-shape scores; a barber override (or a top shape that is not the analysed winner, as applyOverrides leaves it) counts as 100%; no face data gives a constant 0.6.
- Reason contribution = points earned above a neutral 0.5 (face 30, grow 25, contrast 15, life 10) or the Eid +10; face chips need the jawline delta (3% longer/softer/wider, 4% jaw width for a narrow chin) and the matching shape (top, or at least 30% share).
- Score = clamp 0..100, one decimal; sorted by score, then unclamped rawScore, then order, then id — Eid can push many styles past 100.
- Catalog order puts Gulf favourites and local fit 5 first (sunnah, khatt, circle-beard, short-boxed, corporate, beard-fade, designer-stubble...).
- Swatch hexes derived from target Lab values (natural black L*18, jet black L*9, ...) so the analysis matcher maps typical beards correctly (verified); grey-blend hex null (tints greys toward the detected colour), henna and henna-katam get hexDay3 — PRD 7.4 Day 1 / Day 3.
- Safety questions are asked for chemical dyes (all 4), henna (metallic salts, irritation) and temporary colour (irritation); an unanswered question counts as a risk flag — safest default for the Cut Card.
- Presets: light 'awarid caps cheeks and sideburns at 3 mm with a low crisp cheek line; Eid line-up = razor + straight cheek + 2-finger neckline + oiled; wedding line-up = razor + curved cheek + 2-finger neckline + balm; changing a line type resets its drag offset.
- Arabic trim intervals need dual and plural forms (يومين / أيام / يوماً, أسبوعين / أسابيع / أسبوعاً); low_maint has key variants, and the PRD key catalog.reason.low_maint is the 2-week text.
- paramsFromStyle with a profile keeps the customer's longer Sunnah chin when it was measured at confidence 0.5 or more — a Sunnah beard is not cut shorter by default. scaleLength leaves a Sunnah-trimmed mustache unchanged.
- Mustache render parameters (widthFactor, thicknessMm, ends, overLip, waxed) and stylistic mustache choices per style (beardstache chevron, anchor pencil, verdi handlebar, others natural-short; stubbles null) are my estimates.
- Catalog JSON and i18n are generated from one throwaway script in the scratchpad (not in the repo), and a test asserts reasons.json texts equal catalog.json strings.

### Session, Cut Card and reports
- Cheek-line height follows the renderer (src/ai/render/layout.js cheekLine), ported to front-shot pixels, not zonePolygonsPx as the brief said — the card must show the line the customer approved; zonePolygonsPx saturates near cheekOffset ±0.27 while the renderer reaches the limit lines at ±1 (old code printed about 50 mm for a line drawn at about 39 mm).
- Mid-cheek = halfway across between the sideburn end of the natural cheek line (401/177) and the mouth corner (291/61), measured along the face-up axis (10 to 152) and averaged over both sides — a point the barber can find and that does not change with head roll.
- Cheek defaults come from the test portrait through the app's own MediaPipe + iris pipeline (natural 34, limits 17/50 mm), not from the canonical mesh (50, limits 29/67) — the canonical frontal projection puts the jaw points under the jaw and reads about 30% high; a unit test keeps the defaults' relative positions in step with the canonical construction.
- Default height with an offset moves linearly toward CHEEK_LIMIT_MM.high/low — the renderer blends the line linearly toward the HIGH/LOW lines.
- Neckline mm = 15 mm per finger (2f = 30 mm, 'about 3 cm') + 10 mm × necklineOffset (positive raises it) — same sign and scale as the renderer's neck depth (base − 10 × offset).
- effectiveGrowth clamps to the shop Settings range 0.05..2 mm/day; learned rates stay 0.1..1.5 like the client service — an owner-edited default must not be silently changed.
- effectiveProfile: dynamic import of the facade src/ai/index.js once a profile exists, with a local applyOverrides-compatible merge until then or if the import fails — keeps the AI/three.js chunks out of the main bundle; the merge does not recompute growability.
- A photo-free snapshot (no shots, thumbnails, AI result or blobs) is kept in the IndexedDB 'session' store, expiring after 10 idle minutes and cleared by every wipe — iOS can reload the PWA after WhatsApp and the Cut Card must not be lost; photos are never stored there.
- The Cut Card PDF is A6 portrait on 2 pages (diagrams + zone table, then lines/color/approval/maintenance), with breaks only between sections — the PRD content does not fit legibly on one A6 page.
- On the share image, safety lines show the short flag only when the answer is a risk; otherwise the question with 'Ask the customer now' — the flag text states a risk as fact.
- Safety questions shown per color come from colors.json `safety`; an unanswered patch test or metallic-salt question counts as a flag (reasons.json riskWhen includes null) — PRD 4.4: ask before any chemical service.
- CSV: delimiter auto-detected (comma / semicolon / tab) and Arabic or English header aliases accepted; price rejects commas and more than 3 decimals; text cells starting with = + - @ get a leading ' — Excel in some locales saves with semicolons, and exports must not carry formulas.
- Clients CSV export writes the phone as 968XXXXXXXX digits (no +) — Excel keeps it readable and does not treat it as a formula.

### AI Worker (Cloudflare)
- Model input format: confirmed from Cloudflare's own documentation source on GitHub, because developers.cloudflare.com is blocked here. Sources: the changelog post src/content/changelog/workers-ai/2026-01-15-flux-2-klein-4b-workers-ai.mdx and the model schema src/content/workers-ai-models/flux-2-klein-4b.json. The binding takes { multipart: { body, contentType } }, built from a FormData passed through new Response(form). Fields: prompt (required), input_image_0..3 (binary, 'All input images must be smaller than 512x512'), width/height (256..1920), seed, guidance. Steps are fixed at 4. Output: { image: base64 }. Everything is isolated in buildModelInput in model.js.
- Output size: the source's aspect ratio with the long side at 1024 and both sides multiples of 16. That is at most 4 output tiles, so one render costs at most 2 x 5.37 + 4 x 26.05 = 114.94 neurons (Cloudflare pricing page: 5.37 per input tile, 26.05 per output tile). 80 renders a day then use at most 9,196 of the 10,000 free neurons. This matches the PRD estimate of 85-110 renders a day.
- Input size: each side must be at most 511 px (strictly under 512) and at least 64 px. Each image may be up to 1 MiB and the whole body up to 2 MiB. The body is read through a byte-limited stream, so a request without Content-Length cannot get around the limit.
- The image comes back as raw bytes with a detected Content-Type, so the client can call res.blob() (the existing cloudflareFlux.js already does). Decoding uses the native Uint8Array.fromBase64, which I confirmed exists in Cloudflare's local runtime, with an atob fallback. This keeps CPU use low on the Free plan's 10 ms limit.
- Seed: the client sends an unsigned 32-bit seed (`>>> 0` in src/ai/render/cloudflareFlux.js), so the Worker accepts 0..4294967295 and echoes it back. The model gets seed % 2^31 so it fits a signed 32-bit integer. A missing seed gets a random one; anything else that is not a valid integer gets a 400.
- Account cap: ACCOUNT_DAILY_CAP is clamped to 0..80, so editing the setting can never take the account past the free neuron budget.
- Shop cap is min(settings.aiDailyCap ?? 20, account cap). A broken value counts as 20; 0 blocks the shop.
- If Workers AI reports the daily neurons are used up (error 4006, 'neurons' or 'daily free allocation'), the Worker gives the slot back and answers 429 scope 'account', so the app shows the same 'used up' message.
- KV writes are retried once after 1.1 s, because KV allows one write per second per key. If the retry also fails, the half that was written is undone and the Worker answers 503 busy. Counters delete themselves after 3 days.
- Order of checks: route (404/405), then Origin (403), then token (401/403), then body (400/413/415), then Firestore staff + shop docs read in parallel with field masks (403/502), then aiPreview (403), then caps (429/503), then the model (502/429). An invalid request never reaches the model or the counters.
- An Origin header is required for every non-preflight request. A missing Origin gets 403, so curl smoke tests need -H 'Origin: https://lihya.web.app'. The '*' wildcard is not supported in ALLOWED_ORIGINS.
- The app's App Check token, if sent in X-Firebase-AppCheck, is passed on to the Firestore REST calls, so Firestore App Check enforcement can be turned on later.
- Logging: Workers Logs is on but the built-in invocation logs are off, because they record request details. Instead the Worker writes one JSON line per request (route, method, status, ms, error, scope, modelMs, release, exception class). It uses console.warn because the project rule allows only console.warn and console.error.
- There is no Firebase emulator mode. Emulator tokens are unsigned, and accepting them in a deployed Worker would be a security hole. Local runs use the injected test hooks instead.
- compatibility_date is pinned to 2026-10-01, which the bundled local runtime (1.20261019.1) supports. No compatibility flags and no Node.js compatibility layer are used.
- PRD 7.5 Cloudflare Worker section: no API keys anywhere; the AI binding needs none and Wrangler uses wrangler login.

### Rendering
- Texture generation runs in a module Worker (textureWorker.js), with a main-thread fallback — a 1024 px look takes 0.5–2 s and would freeze live AR on every slider change.
- AR draws progressively: a quick 384 px fast pass first, then the full 1024 px beard. Only the latest look is kept in the queue — fast feedback while the barber drags a slider.
- Thumbnails use a 384 px 'fast' texture (density fields at a third of the size): about 180 ms against about 400 ms at 512 px — the closest I got to the ~150 ms target without losing the strand look.
- Occlusion is normalized so its median over covered texels is 1 — keeps lighter and darker locks while putting the rendered mid-tone on the swatch (PRD 7.6).
- Shading transfer (lightly blurred / heavily blurred photo luminance) applies to hair lying on the face and neck, not to hair hanging over clothes — creases and highlights carry through, and an existing dark beard does not bias it; on hanging hair it painted the suit lapels into the beard.
- Without segmentation, neck hair is kept only where the photo color matches the cheek skin color — stops stubble from being drawn over a white collar on thumbnails or when the segmenter is not loaded.
- With no profile, the natural beard color defaults to a soft black (Lab 17, 1.6, 3) — fits the Oman market and is less orange than the previous default.
- renderStudio timelineDays = 0 shows the designed look, as in the contract; timeline:true shows 'today'; AR uses setTimelineDays(null) for the designed look — keeps the contract default while still allowing the 'today' stop.
- Outline colors: keep green at 17 % alpha, remove red at 50 %, a brass target line about 1.4 mm wide, never drawn around the lips or nose, no hatching. In beard mode, zones that get shorter get red only — hatching and strong green averaged to a muddy olive at phone resolution.
- AI Final Look error mapping: network error while online gives 'failed' (reason 'network'); offline gives 'offline'; HTTP 401 triggers one token refresh and retry; 60 s timeout gives 'failed'; no Worker URL gives 'disabled'; a JSON body { code: 'disabled' } gives 'disabled' — honest messages for the barber, and a CORS or deploy problem never shows as 'no internet'.
- The shot photo texture is held through a WeakRef and released 30 s after the last render; the light-estimate scratch canvas is cleared after each read — no copy of the customer's photo outlives the session in the render module.
- Far-side shell occlusion only applies where the jaw normal points away from the camera (nz < -0.12) — in a frontal view the sides of a hanging beard are in front of the shoulders, not behind the neck.
- The shell hangs halfway toward screen-down for roughly upright faces and along the face only when the face is far from upright — gravity looks right in live AR, and rotated photos stay correct.
- Going shorter uses Outline mode only, with no on-device inpainting — decision given in the brief (MI-GAN/LaMa size and license cannot be verified here).

### Entry, login, barber home, Look Code entry
- New customer starts a walk-in session at once (zero typing on the fast path). Tapping a client row or search result, or saving a new client, starts that client's visit straight away, as the task asks. The Walk-in chip also starts a walk-in session, so it repeats New customer; it sits next to Add new client under 'Not in the list?' to match the PRD 8.1 wording.
- Auto-opening the last shop replaces the / history entry, so Back from the shop does not land on / and bounce into the shop again. 'Arrived fresh' means the router's initial location (key 'default'). The picker waits for the server answer before giving up when the offline cache does not know the shop yet.
- S14 keeps the session's client only when it has an id and no consultation or approval yet. A client left over from a previous customer's restored session is not kept, and the look starts as a walk-in. The screen shows 'For <name>' so the barber can see who the visit will be saved to.
- S14 removes the first part of lookSummary() because the heading already shows the style name. For a missing style that first part would be the raw style id. The style name comes from the shop's own style doc first (so signature styles work), then the catalog.
- S02 keeps the join wording when next is /join/<id>, for example after a link error. A next pointing back to /login goes to / instead, so there is no redirect loop. An old link's error stops showing once a new link was asked for. The 'Signing in needs internet' notice is never shown twice.
- S01 uses its own header (language toggle and sync badge) instead of ScreenFrame. TopBar always renders an h1, and the splash's h1 is the brand lockup.
- Names, emails and search text are wrapped as isolated text (bdi or Unicode isolate marks), so mixed Arabic and English rows keep the UI alignment. Age ranges are isolated too, so 35–44 does not show as 44–35 in Arabic.
- The model status line counts 0% as 'preparing', with no number. If the AI module takes more than 600 ms to import, it switches to 'Preparing camera models', so there is no blank wait on first open.
- CreateShop checks WhatsApp with normalizeOmanPhone and sends the normalized +968 number. The client phone is checked by createClient itself, and its invalid-argument error is mapped to the matching field.

### Capture, profile, questions
- The AI facade is loaded with import('../ai/index.js') in S04, so the camera starts while the AI code and models load. The capture session starts only once the landmarker is ready, and the analysis waits for loadModels so the skin/hair map is ready. If that map model fails to load, the analysis falls back to landmarks only.
- The white-card step is offered right after each new front photo in chair mode, while the customer is still holding the paper. A retaken front photo clears the earlier calibration and offers the step again.
- The hand shutter grabs the current video frame (unmirrored JPEG) and runs shotFromImage on it. The capture session has no way to force or skip a shot, so after one hand shot the rest of that capture is by hand too, with the per-shot help text instead of live hints.
- Per-shot retake works while the capture runs. After leaving the screen, the review step offers 'Retake photos' for all of them, because a capture session cannot start with existing shots.
- A capture left half-way is cleared when the screen opens, because the auto-shutter always runs the shots in order. Home mode switches to quick on a fresh capture. An upload sets quick mode and counts as the front photo.
- Arrows are screen directions taken from hintArrow(hint, mirror), recomputed with the current mirror setting so toggling mid-capture stays correct. The overlay is laid out left-to-right in both languages.
- The video uses object-fit cover unless that would hide more than 25% of the frame, in which case it uses contain. The oval is sized to the frame actually shown.
- Undertone quiz: gold + green = warm, silver + blue = cool, anything mixed = neutral. It opens by itself when skin.confidence < 0.7 or the undertone is null.
- Zones to confirm are worked out from the measured profile (confidence < CONFIRM_BELOW, or every face zone when freshly shaved), so a row does not disappear after its tap. Left and right share one row when both need a check.
- The SessionContext has no field for the profile-save consent, so the answer is kept in memory in src/screens/capture/profileConsent.js, keyed by shop, client and consultation start, until the session gets the field. It switches to session.keepProfileConsent / setKeepProfileConsent automatically once those exist.
- MST swatches are a local copy of the PRD hex list (src/screens/capture/mst.js) with the CC BY 4.0 credit shown on screen, because the facade does not export MST_SWATCHES.
- Numeric runs that read wrongly in Arabic (age ranges, '10+', '45°') are wrapped in left-to-right isolates (U+2066 / U+2069).

### Owner dashboard, settings, reports
- The dashboard counts demo data. This matches PRD 10.7 (demo exists so the dashboard is not empty) and the seeded dailyStats, which already include demo. A clear 'Includes demo data' note is shown. Reports leave demo out by default (PRD 11.2).
- Today's KPIs are computed from today's consultations with summarizeConsultations from src/reports/summary.js, so they match the daily PDF exactly. AI previews come from dailyStats.aiRenders.
- There is no cheap service to ask 'does demo data exist?'. Instead, a demo client among the 20 most recent clients, or a demo consultation today, counts as present (one small live query).
- Settings mixes two save modes: single-tap controls (toggles, chips) save at once with an Undo snackbar; multi-field edits (shop names, WhatsApp, guard chart) are drafts saved with one bottom-anchored primary button.
- Steppers save 800 ms after the last tap so press-and-hold does not write dozens of audit entries; a pending save is flushed on unmount.
- New guard rows get readable ids taken from their label ('#9' becomes '9'), made unique. Existing rows keep their ids. Changing a row's length drops its stale minMm/maxMm.
- If only one shop name is typed, it fills both languages, the same as Create your shop. updateShop refuses an empty English name.
- The on-screen QR is charcoal on bone in a brass frame, not brass on charcoal: inverted codes do not scan with every phone camera. The printed QR is black on white.
- The retention purge marker is a per-device localStorage key, 'lihya.pref.purgeDay.<shopId>', because PREF_KEYS has no entry for it.
- The clients CSV covers the 50 most recent clients (watchRecentClients maximum). The screen says so; there is no list-all service yet.
- In the consultations CSV, a registered client whose name was not loaded is labelled 'Client', never 'Walk-in'. This works around how csv.js labels unknown client ids.
- Owner-screen grids use 2 or 3 columns only from xl (1280px). At 1024px the content column is too narrow for the guard rows and the export column.
- Count wording avoids Arabic plural agreement problems by using a 'label: n' pattern, for example 'عدد التقييمات 3'.
- Dates in Reports use the long month form (25 أكتوبر 2026) instead of formatDayKey's numeric Arabic medium date.

### Try at home
- Did not store the created code in useSession().lookCode. Capture and Profile read session.lookCode as 'a code was loaded', and Capture then skips straight to the Studio. Instead, src/screens/home/codeCache.js keeps the codes in memory only: no photo, no web storage, gone on reload. It sends one request per look even when React runs effects twice in development, gives the same code back after Undo or Back-and-return to the same look, and lets the landing show the last code after a wipe.
- Expiry is worked out on the phone as now + LIMITS.lookCodeDays, because createLookCode returns only the code; the service stores the same +30 days on the server.
- Start over navigates to the landing straight away and shows the Undo snackbar; the wipe runs when the snackbar closes, and Undo goes back to the code screen. The landing's Start calls useSnackbar().dismiss() first so a pending wipe cannot erase the photos of a new try.
- Automatic retry happens only when the phone goes from offline to online. A request that failed while the phone reports online waits for the Retry button; this avoids a retry loop found in testing.
- Failure types: auth/network-request-failed, unavailable, deadline-exceeded or navigator.onLine false show the offline state; permission-denied shows 'Try at home is turned off'; anything else shows the generic failure.
- The WhatsApp message is in both languages, the customer's first: the greeting with the shop name, then 'Look Code: X' and 'Style: Y'. The phone is cleaned with normalizeOmanPhone and waLink from lib/format.js; with no number the link opens the chat chooser.
- The image is drawn as soon as the code appears, so the iPhone share sheet opens inside the tap. Elsewhere it uses downloadBlob from reports/csv.js. Card colors come from the CSS token variables, falling back to the dark palette.
- The landing uses a two-name language switch instead of the top-bar toggle, because customers may not read the default language. Letter-spacing only applies in English, because spacing breaks Arabic letter joining. Small headings use !font-sans, because the base rule for Arabic h2/h3 overrides the plain font-sans class.
- Model warm-up: dynamic import('../ai/index.js') then loadModels({ segmenter: true }) after a 400 ms delay, skipped when navigator.connection.saveData is on; a failure only logs a warning.
- Reused existing strings where they exist: ui.code.label, common.retry, common.loading, shop.public.inactive.*. The 52 new strings are in ns/home.json, with the same keys in en and ar.

### Catalog manager, products, staff
- Signature editor lives in the same screen, opened with ?clone=<id> or ?edit=<id>. Browser back works and a direct link opens the editor. S16 keeps the draft so Undo after leaving restores it. A ref guards the gap while the router update lands, so a fresh draft does not overwrite the restored one.
- Zone sliders move over uneven length steps: 0.5 mm up to 10, 1 mm to 30, 2 mm to 60, 5 mm to 100, 10 mm to 200. Each also has -/+ buttons. This keeps a phone-width slider precise for stubble and still reaches 200 mm.
- Saving a signature style also writes lengthClass (worked out from the zones), a regenerated zoneNote, and weights. If the same zones are grown, the base style's weights are kept. If zones were only removed, the weights for the remaining zones are kept. If a zone was newly grown, weights is set to null so the recommender uses its generic weights. A fully shaved style gets {}.
- Only signature styles can be edited; seed catalog styles can only be shown/hidden, fitted, reordered or cloned. Signature styles cannot be deleted because the rules forbid deletes.
- Hide/unhide, local fit, role changes, access changes and product on/off apply at once, with an Undo snackbar that reverts them. Withdrawing an invite uses confirmUndo, so the delete only happens if Undo is not tapped.
- Products are sorted by name inside each category, and staff by me first then join date. Switching an item off or changing a role no longer makes its row jump away, which the active-first order of watchProducts/watchStaff would do.
- Manual price entry uses parsePriceOmr from src/reports/csv.js, so manual entry and CSV import validate prices the same way. A lone comma counts as the decimal point because some keypads produce it; the 'Shows as' preview lets the owner confirm.
- A product needs only one name, as in the CSV import: name is the English name, or the Arabic one if that is all that was typed. Editing an Arabic-only product leaves the English field empty.
- The bottom-anchored primary action changes with what is open. Products: Add / Save product / Save changes / Import N valid rows. Staff: Send invite. Editor: Save signature style. The catalog list has no primary action because every control applies at once.
- Arabic count label for signature styles is 'خاصة', so it fits on a phone tile.
- The root content container of each screen has position: relative, so screen-reader-only text and the hidden file input stay inside the frame's scroll area. Without it they made the whole page scrollable and pushed the top bar off-screen during scrollIntoView.

### Styles, Studio, Compare
- Default preview is Photo on phones (sharper, before/after works, lighter on mid-range phones) and Live in Mirror Mode (tablet/TV); the Live chip is always one tap away.
- "This is my look" in the Studio approves what is on screen: the saved look if the screen shows it unchanged, otherwise the current design. With exactly one saved look and no edits since saving, that look is approved, as the spec asks.
- Edits while dragging stay local in the Studio and are written to the session when the drag ends, so the whole app does not re-render on every move. Chip changes are written at once.
- The overall length slider uses the longest zone in mm and scales every zone relative to the look before the first drag (scaleLength, chained past its 4x cap), so repeated drags do not compound rounding. Shaved zones stay shaved and a Sunnah-trimmed mustache keeps its length.
- Picking a mustache style on a shaved upper lip sets the mustache zone to 8 mm (an editable default) so the mustache is visible; changing a cheek or neckline type resets its height offset and clears presetId, the same way applyPreset does.
- Chair-mode chin length for the frame: the face crop is deepened in 20 mm steps from the saved chin length (not the live drag value), so the frame never zooms during a drag.
- The client's learned growth rate is read from watchRecentClients(shopId, 50) and matched by id, because no single-client watcher exists (see crossModuleRequests).
- Live AR and Photo Studio share the camera-open, stop and error helpers from src/screens/capture/camera.js (read-only import); each AR run gets a new canvas because a disposed WebGL canvas cannot be reused.
- Removing a saved look happens at once and Undo saves it again with the same params and thumbnail (it gets a new id and goes to the end of the row).
- In Mirror Mode the saved-looks row sits under the canvas (wide column) and the 30% side panel holds the group chips, the controls and the primary button.

### AI consent, AI Final Look, Cut Card, Done
- Used src/screens/studio/approve.js approveLook (it appeared mid-task) and deleted my local copy; S11 passes shop: { shopId }, the client's learned growth and aiPreviewUsed (true for a successful render now or earlier in this consultation, tracked in memory by finalLookJob.aiPreviewUsedFor).
- The AI render starts in the 'Allow once' tap handler (one consent = one request, StrictMode-proof) and lives in a module-level in-memory job (finalLookJob.js); S11 only accepts that job id from the route state, so a reload or direct visit asks again. A hold counter releases the job (revoking both object URLs) after real unmount but not after StrictMode's test unmount.
- The design panel in S11 is a square face-and-beard crop of the fresh Photo Studio render (designCrop, same framing idea as faceBeardCrop) so it compares fairly with the 504 px AI crop.
- The 'AI preview' badge shows the current language with the other language under it; the consent statement is shown in both languages at once.
- Cut Card numbers 32-48 px: CutCardDocument's screen variant uses 15 px, so S12 adds an 'At a glance' block (40 px tabular numbers, merged L/R pairs, shaved zones, cheek line and neckline heights) above the full document.
- Share PNG is pre-generated at idle time so the share sheet opens right after the tap (iOS user-gesture limit); the WhatsApp text fallback appears only after the download fallback (PRD 11.4).
- Save to client is one action (profile labels + visit lengths) behind confirmUndo; if the customer did not agree on S05 the button reads 'He agrees: save to client' and sets the consent (capture/profileConsent.js) on tap, restored on Undo.
- Keep before/after is offered only for real clients (saveBeforeAfter needs a client id) and disabled when the front shot is no longer in memory.
- The client's phone and growth rate are found through watchRecentClients (fallback searchClients) in approve/hooks.js useClientRecord, because the session client carries neither.
- Next customer: completeConsultation first, then the before/after save (awaited), then wipe('next') and navigate in the same tick so the emptied session never renders.
- Arabic 'This is my look' aligned with the Studio's wording (هذا هو شكلي).

## Known limitations by area (honest list from the build)

### UI kit
- npm run build was not run (per the brief, other modules are still in progress).
- The zone-diagram face is schematic: Cut Card cheek and neckline heights are placed proportionally, not to scale. The real numbers appear in the labels and should also be in the Cut Card table.
- In html2canvas rasterizing, the inline SVG becomes an image, so CSS variables and web fonts are lost. ZoneDiagram and BarberRuler need hex colors (ZONE_DIAGRAM_PRINT_PALETTE / color props), and their text falls back to system fonts.
- --footer-h is one global CSS variable: if two ScreenFrames with footers are mounted at once (overlapping route transition), the snackbar offset follows whichever updated last.
- useOptionalT has one eslint-disable line for react-hooks/rules-of-hooks: useT() is called inside try/catch. It is safe because useT reads the context before it can throw, so the hook order never changes.
- The Arabic percent sign ٪ in Ring is not in Barlow Condensed and falls back to IBM Plex Sans Arabic (mixed fonts in one number, still readable).
- In the profile view, leader lines from the right column to the sideburn and cheek labels cross the ear and cheek (technical-drawing style). The tiny S zone is only reachable by a leader line.
- inputMode="none" should keep the system keyboard closed on iOS Safari and Chrome; some older Android keyboards may still open one. The on-screen keypad works either way.
- The skeleton shimmer is a linear-gradient defined in the scaffold's index.css (not my file); the PRD's no-gradient rule is about surfaces, so I left it.

### Firebase layer
- src/data/styles.json and src/lib/look.js (catalog engineer) still did not exist when I finished after waiting about 20 minutes. shops.js imports both, so the build fails until they land. The seed and createSignatureStyle were checked only against fixtures shaped like the contract, and the rules seed test uses 34 synthetic styles until the real file exists (it switches to it automatically).
- Stats deduplication for approve/complete is held in this phone's memory. Approving the same consultation from two phones, or again after a page reload, counts the approval twice.
- createLookCode waits at most 12 s for the server. On a slow or offline connection it returns the code anyway, and if that queued write is later refused (for example the owner turned Try at home off), the code will not exist.
- After sign-out, the Firestore offline cache (IndexedDB) of the previous user stays on a shared phone. The UI never shows it to another account (every screen goes through membership listeners), but the data remains on the device until site data is cleared.
- The consultation range queries return at most 2000 docs per call. Very long report ranges for a busy shop would be cut short without warning.
- Only checked against the emulators, not a production Firestore project. The emulator applies the same rules engine and read limits.
- When VITE_USE_EMULATORS=true and VITE_FB_PROJECT_ID is also set, the app uses that project id while `npm run emulators` / test:rules start `demo-lihya`. Leave VITE_FB_PROJECT_ID empty when using the emulators, or start them with the same project id.
- @firebase/rules-unit-testing 6.0.0 declares Node >=24.12. It runs fine on the sandbox's Node 22.22 apart from an engine warning.
- The retention purge only runs when a screen calls purgeExpiredData (owner role required by the rules). Nothing calls it yet.
- My test that no false 'not found' screen flashes while a valid shop loads also passed with the old useLive in this harness (React timing hides the stray frame). The fix is correct by reasoning, but that test does not guard against a regression.

### On-device analysis
- GPU-path timings could not be measured realistically: Chromium's WebGL here is software-emulated (SwiftShader), so each mask readback takes about 2-2.5 s. The 3 s budget is only confirmed on the CPU path (2.05 s for 4 shots) and needs a real phone.
- Disabling WebGL in Chromium did not make the GPU delegate fail, so the automatic GPU->CPU fallback in vision.js is untested at runtime (only the iOS CPU path was exercised).
- The age model could not be downloaded here (huggingface.co is blocked). The band mapping and Wi-Fi gating are unit-tested and the loader fails cleanly (status 'error', band null), but real inference, the q4 file name (onnx/model_q4.onnx) and the label strings are unverified on a device.
- Face-shape thresholds and the oval-prototype calibration are starting values. They are checked on synthetic faces plus one photo (oblong/oval, plausible) and need the PRD's 30-photo QA tuning.
- Beard density was tuned on synthetic textures and one clean-shaven photo. Real stubble, grey beards on light skin and dark skin with dark beards are unvalidated; the confidence score and barber confirmation are the safety net.
- Side shots and the chin-up shot were exercised only by reusing the frontal portrait (code paths and timing), not real 45-degree photos. Silhouette length is unverified against a ruler.
- The neck zone in a front-only (quick) capture reads about 15-18 on a clean neck because of the collar shadow (low, but not 0).
- Skin reads Monk Skin Tone 5 on the test portrait because studio exposure renders the cheeks at L* 72. Neither gray-world nor the white card (which neutralises colour only, per the PRD) corrects exposure, so bright photos can read lighter than the person.
- Beard colour can come out about one shade lighter than the dye swatch (hair pixels include highlights and skin-mixed pixels); the PRD median rule is kept.
- The segmenter self-test thresholds are heuristic and were only seen passing ('gpu-ok') in SwiftShader; the iOS scramble case itself (MediaPipe issue 6142) could not be reproduced here.
- Live capture was tested only with a static frontal canvas stream: the front shot fires and the next hint is right. The left/right/chin-up gates are covered by unit tests with synthetic matrices, not a live turning head.
- iOS detection relies on the user agent (plus maxTouchPoints for iPadOS).

### Catalog and recommendation
- The jawline model's hair-offset factors are heuristics, not calibrated on photos. Directions are right (verified), but very long beards give large numbers (Bandholz width +60 to +90%); tune on the PRD's 30 labelled QA photos.
- Any required zone under 40% gives −25 (PRD-literal), so weak sideburns or soul patch read by the analysis penalise most full beards. This depends on how reliably the B zone near the ear is measured; never checked on a real bearded face, only on a synthetic painted beard.
- The freshly-shaved rule cannot tell a freshly shaved face from a face that truly cannot grow; both get neutral growth until the barber confirms zones. A customer who can only grow a mustache (other zones empty) is not 'shaved' and full beards are penalised.
- If screens pass only the effective profile (without opts.overrides), partial zone confirmations are not known as confirmations and can change the shaved decision; pass session.overrides.
- Clean shave scores Grow 1 with neutral contrast and life, so it often appears in the top 6 for every face. This is a product choice; drop it to Grow 0 if Sam prefers.
- Scores cluster high (about 75-95) for good matches and saturate at 100 with the Eid boost. Ranking stays deterministic through rawScore, but the displayed scores look similar.
- recommend keeps the first entry when the same style id appears twice in the input; if the two entries differ, the result depends on input order. Shop catalogs from Firestore have unique ids, so this should not happen in practice.
- lookSummary only knows seed styles; for a shop signature style the caller must pass the style object as the third argument, otherwise the summary starts with the raw style id.
- Mustache render parameters, swatch hexes, cheek line levels and the presets' exact patches are my estimates; the renderer engineer may want different numbers.
- Local fit, age-fit values and style order are starting guesses (PRD says so for local fit); owners edit local fit per style.

### Session, Cut Card and reports
- The default cheek heights (no front shot) come from one adult portrait; measured heights use a 2D frontal projection, so cheek foreshortening reads them a little low. The card says ±5% and marks defaults 'typical face, check by eye', but accuracy against a ruler is unverified on real customers.
- src/ai/render/arRenderer.js does not exist yet, so the lazy import of src/ai/index.js fails in isolation; SessionContext logs a warning and uses the local override merge, which does not recompute beard.growability until the facade loads.
- The FaceProfile (no image, but on-device values such as skin.lab and faceShape.measures) can sit in the IndexedDB 'session' store for up to 10 minutes for reload recovery; it is cleared by every wipe.
- SessionProvider prunes saved before/after photos with the 365-day default at mount, not the shop's settings.retentionDays (the provider does not read shop settings).
- ZoneDiagram (UI kit) draws cheekLine.mmAboveJaw on a 25..70 mm scale while the card's real range is 17..50 mm, so the diagram line sits lower than the printed number suggests until the UI kit aligns it.
- A shop logo URL (shop.logoUrl) must allow CORS or html2canvas leaves it out of the PDF/PNG; without a logo the card shows the shop name's first letter.
- PDF page numbers ('1 / 2') are drawn with jsPDF's built-in font (digits only); all other text is rasterized.
- buildCutCard leaves trimDays null when the caller passes no style object (it does not look the style up by id).

### AI Worker (Cloudflare)
- No real FLUX.2 [klein] 4B render or real Firebase ID-token and Firestore REST call was run here: there is no Cloudflare account, developers.cloudflare.com is blocked, and running the real config locally needs a Cloudflare login. The model format comes from Cloudflare's official documentation source and sits only in buildModelInput and decodeModelOutput (model.js). Confirm it on the first real render (see manualChecks).
- KV is eventually consistent and has no atomic increment. Two renders at the same moment can both write N+1, so the count can come out a few renders too low on a busy day. A write can take up to about 60 s to show in other Cloudflare locations. A failed release leaves the count one too high (it blocks earlier and never overspends). The hard ceiling stays the 10,000 free neurons: on the Workers Free plan, going past them only makes the model call fail (no charge), and the Worker answers 429 'account'. If the account ever moves to Workers Paid, extra neurons would be billed at $0.011 per 1,000 neurons. Keep the account on Free, or move the counters to a Durable Object.
- If the browser disconnects while the model is running, Cloudflare may stop the request before the slot is given back, leaving the count one too high for the day (safe direction).
- Each /render or /quota call costs 2 Firestore document reads, plus the reads the security rules' isStaff() check performs. That is a handful of reads per call, small against the Spark plan's 50,000 reads a day.
- The default ALLOWED_ORIGINS includes http://localhost:5173. A development build on Sam's computer can then call the production Worker, though it still needs a real staff token. Remove it after testing if that is not wanted.
- The Free plan allows 10 ms of CPU time per request. The heavy steps (form parsing, signature check, base64 decoding) use the runtime's built-in functions, but CPU time was not measured on the real Cloudflare network.
- The existing client src/ai/render/cloudflareFlux.js does not send X-Firebase-AppCheck. Without it, the Worker's Firestore reads fail with 401 auth {reason:'firestore'} if Sam ever turns on App Check enforcement for Firestore (see crossModuleRequests).

### Rendering
- Realism is limited on very low-resolution faces: on the test portrait (face about 250 px wide) 4 mm stubble reads as hair-textured darkening but is fairly uniform and can still look painted. Goatees look somewhat blocky and opaque. Long beards show a mild change at the jaw line (face texture against shell; the shell is slightly lighter).
- Thumbnails on the 384 px fast path look slightly painterly (clumped strands). Generation averages about 180 ms in Node; in-browser SwiftShader totals were 124–560 ms per card. The ~150 ms target is not reliably met and real-phone timings are unmeasured.
- AR performance is unverified on real devices. In SwiftShader, MediaPipe detection alone takes 2–4 s per frame; my drawing costs 25–78 ms per frame there (expected 2–5 ms on a phone GPU). The PRD target of at least 24 fps on iPhone 12 must be checked by hand.
- The first Studio render in SwiftShader takes 11–18 s (WebGL init and shader compile in the software GPU); later renders take 0.7–2.5 s including texture generation.
- Side views (left/right 45° shots) and the far-side occlusion of long beards are untested: there is no 45° test photo; only frontal and a 90° in-plane rotation were checked.
- Outline mode without a profile assumes the current beard is max(target, 6 mm) with natural lines, so the red areas are only a guess until the analysis profile exists.
- Live AR segmentation shares the analysis segmenter instance, which switches between IMAGE and VIDEO modes; just after a Studio render the AR shell occlusion can be missing for a frame or two.
- The color accuracy test measures the texture layer under neutral frontal light. It does not include camera noise or display gamut; the real ΔE check with a white card is a manual check (PRD 14.2).
- Photos are released from the GPU 30 s after the last Studio render. Immediate release on 'Next customer' needs clearRenderCaches() wired into the facade and the session wipe (see crossModuleRequests).

### Entry, login, barber home, Look Code entry
- Google sign-in could not be finished here: the emulator popup fails with auth/internal-error because the Google helper script cannot load in this sandbox. The screen shows the generic error, as designed. The email-link flows were all verified.
- Until S07 to S22 exist, src/App.jsx fails to compile, so the real app shows Vite's error overlay. My screens were verified through the browser-side harness and need a re-check once the remaining screens land.
- In dev, cutting the network for real makes Vite reload the page, and the sprite icons and lazy chunks are not cached. So the offline states were verified by faking the browser's online flag. In production the service worker covers this.
- The emulator now holds test data from my runs: the shop k1OAOVYd6V9rALJEWzlt owned by entry-1@test.lihya, with Look Codes ABCDEF, USED22, EXPRD3 and GHAST4, a test client, and the joined invitee entry-inv-r2@test.lihya. I removed the temporary paused-staff doc.

### Capture, profile, questions
- In the shared dev server, src/App.jsx returns HTTP 500 until S07-S13 and S16-S22 exist (Vite resolves lazy imports when it compiles). My screens were checked through the harness stand-in only and should be re-checked once every screen lands.
- After a hand shot, the rest of that capture has no live pose hints (static help text only), because CaptureSession cannot force or skip a shot.
- After leaving the capture screen, a single shot cannot be retaken; the review step retakes all of them.
- The profile-save consent lives in memory until SessionContext has a field for it, so a page reload forgets it and the question is asked again. No save happens without a fresh yes.
- The analysis step names were never seen in a screenshot: analysis finishes in under 250 ms here once the models are cached. The 'waiting for the models' state of the same shimmer card was captured.
- The age model download is blocked here (huggingface.co), so pre-selecting the age band was never seen working. The 'ask' state of the age chips was checked.
- The shutter click could not be heard in headless runs; only the code path ran.
- The left, right and chin-up auto-shots could not fire with the static frontal video; they were exercised through the hand shutter and the retake path.
- For the AI owner: shotFromImage accepted a photo turned 90 degrees (portrait_rotated.jpg) as a front photo, with only the turnLeft and closer problems listed. Head tilt (roll) is not checked.

### Owner dashboard, settings, reports
- The clients CSV is limited to the 50 most recent clients until a list-all service exists (see the crossModuleRequests). The UI states the limit.
- Demo presence is a heuristic based on recent clients. Once more than 20 real clients have visited, the dashboard note can disappear while older demo records still exist. Settings always offers 'Delete demo data' regardless.
- Dev only: when a PDF is made while Vite's error overlay exists (App.jsx not compiling yet), html2canvas throws 'Cannot read properties of undefined (reading frame)' while cloning the overlay. The PDF is still made. This will not happen once the app compiles or in a production build.
- The Worker /quota account-wide line was not exercised because VITE_AI_WORKER_URL is not set in this environment.
- I could not run `npm run build` for the whole app because src/App.jsx imports screens not written yet. All my modules transform without errors on the Vite dev server.

### Try at home
- Reloading the code screen within the 10-minute window restores the look and makes a second code for it, because the code cache is memory only by design. Both codes stay valid for 30 days.
- When Try at home is turned off mid-session, the shop wrapper (ShopContext.jsx) replaces the screens with its notice and the session's photos are dropped. Turning it back on restores the look without photos. That is safe for privacy, but the customer has to retake the photo if they go back to the Studio.
- The iPhone share-sheet path for 'Save as image' and the real WhatsApp hand-off could not be run in headless Chromium; only the download path was tested.

### Catalog manager, products, staff
- In the Vite dev server, icons disappear while offline because nothing caches the sprite outside the service worker. Seen in the offline invite screenshots; the production service worker should cache the sprite.
- Each move up/down calls setStyleOrder, which rewrites the order of every style in the catalog (about 35 writes plus an audit entry per tap). That is fine on the Spark plan for normal use, but rapid repeated taps add up.
- If a CSV file's first row matches no known column name, parseProductsCsv reads it as data in template order. Every row then fails, and the screen adds a note that no header row was found.
- Test shop LMeM7L3xA2OOdHrq9Gi7 in the shared emulator now holds several test signature styles, test products and pending invites from these runs.

### Styles, Studio, Compare
- Henna Day 3 shows only in Photo mode: createArRenderer has no day option, so Live shows Day 1 and the Color group says so.
- The automatic Outline switch could not be seen working: the test portrait's beard is about 2 mm, under needsOutline's 2 mm tolerance, so the Clean shave probe found Outline off (aria-pressed false). The auto-switch was only checked by reading the code (outline = manual choice, else needsOutline(params, profile).needed), not in a run; it needs a bearded test photo to confirm.
- With swiftshader (no GPU), the low frame-rate snackbar appears in Live mode; that is expected and offers Photo Studio.
- The render engine (src/ai/render) drew the test portrait's short beards as a dark, patchy texture. Its realism was not judged here.
- Signature or hidden styles in the Studio and Compare are found through watchStyles(..., { includeHidden: true }); until that list loads, a signature style name falls back to the seed catalog name or 'Look n'.

### AI consent, AI Final Look, Cut Card, Done
- A real Cloudflare Worker could not be tested (VITE_AI_WORKER_URL is empty); the AI success, cap and failure paths were tested with a harness-only fake Worker URL (cloudflareFlux.js source rewritten by Playwright route) and stubbed /render responses.
- Web Share with files cannot run in headless Chromium; only the download + 'Copy text + open WhatsApp' fallback was exercised. A real A6 print dialog was not opened (window.print stubbed to confirm the print root).
- S09 Compare did not exist during testing, so the consent screen was reached by in-app navigation; the entry point from Compare still has to be added by its owner.
- In the shared CutCardDocument (not mine): the shop name breaks mid-word in the header when the barber name is long, the note column wraps word by word on phones, and in the html2canvas outputs the safety dots sit above their text line and wrapped notes overlap the row border (see crossModuleRequests).
- Playwright's page.screenshot sometimes returns an all-black frame for a few seconds after the WebGL Studio; a direct capture shows the page is fine. The harness retries; not an app issue.
- Look thumbnails are not in the session snapshot, so after a reload the consent screen shows a beard icon instead of the look photo (by design of the snapshot).

## More manual checks by area (exact steps)

### UI kit
- iPhone Safari (iOS 17+): open /s/<shopId>/look-code. Tap the 6 boxes and confirm the system keyboard does not open. Long-press the boxes, choose Paste with a copied code like 'k7m2x9', and expect 'K7M2X9'. Tap the on-screen Paste key, accept the clipboard prompt, and expect the code to fill.
- Android Chrome: on the Look Code screen, tap the Paste key, allow clipboard access, and confirm the code fills and the keyboard stays closed.
- Install the PWA on iPhone (Share > Add to Home Screen) and on Android (Install app). Check that the icon shows the brass beard mark on #0F1012, uncropped inside Android's circle and squircle masks.
- On a notched iPhone: check that the ScreenFrame footer, the bottom sheet and the snackbar clear the home indicator (safe-area padding) and that the top bar clears the notch.
- Studio sheet on a real phone: drag a length slider sideways inside the open sheet (the thumb must move), swipe up and down in the sheet body (it must scroll), and swipe down on the handle to close it.
- BeforeAfter on iOS: press and hold on the photo. The original should show while held, with no image callout or save menu, and the photo comes back on release.
- VoiceOver (iOS) and TalkBack (Android): turn on airplane mode and confirm 'Offline' is announced; delete something that shows the Undo snackbar and confirm the message and the Undo button are announced.
- Cut Card PDF: generate one for a full-beard style in Arabic and in English. Confirm the zone diagram colors (with the print palette), the mm and guard labels and the L/R markers come out correctly in the A6 PDF and the 1080x1350 PNG.

### Firebase layer
- Firebase console > Authentication > Sign-in method: enable Email/Password with 'Email link (passwordless sign-in)', then Google (pick a support email), then Anonymous.
- Authentication > Settings > Authorized domains: make sure <project>.web.app and <project>.firebaseapp.com are listed (localhost is there by default) and add any custom domain. Otherwise email links fail with auth/unauthorized-continue-uri and the app shows auth.error.domain.
- Google redirect on iPhone home-screen app: set VITE_FB_AUTH_DOMAIN=<project>.web.app (Hosting serves /__/auth/handler). In Google Cloud console > APIs and Services > Credentials > the 'Web client (auto created by Google Service)' OAuth client, add https://<project>.web.app/__/auth/handler to Authorized redirect URIs. Then on an iPhone: Add to Home Screen > open > Google sign-in should come back signed in.
- Email link on a real phone: Login > type email > open the email on the same phone; it should sign in without asking again. Open the same kind of link on a different phone; it should ask for the email, then sign in. Check that the email text is in Arabic when the app is in Arabic.
- Invite: Owner > Staff > invite a barber's email. On the barber's phone open the email link; it continues to /join/<shopId>. Sign in, the barber lands in the shop with role Barber. Then deactivate the barber from the owner phone; the barber's screen should switch to 'Your access is paused' at once.
- App Check: App Check > Apps > register the web app with reCAPTCHA v3 (create the site key at google.com/recaptcha/admin with the hosting domains), put it in VITE_RECAPTCHA_SITE_KEY, rebuild, deploy. Watch App Check > Firestore metrics show verified requests for a day, then click Enforce for Cloud Firestore.
- Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`. Then in Firestore > Indexes > Single field, check the staff.uid collection-group index exists (the shop picker needs it) and the exemptions are listed.
- Two phones live: barber approves a look on phone A; the owner dashboard on phone B updates without refresh.
- Offline: airplane mode > create a client and a consultation > the 'Saved on this phone, will sync' badge shows > turn the network back on > the badge disappears and the data is on the other phone.
- Try at home: open /try/<shopId> in a private window; shop name and visible styles show. Owner > Settings > Try at home OFF; the link shows 'This shop link is not active'.
- Settings > Delete demo data: the dashboard numbers for the last 7 days drop to real activity only.
- Optional: Firestore > TTL > add a policy on collection group lookCodes, field expiresAt, so expired Look Codes delete themselves (deletes count toward the free 20k per day).
- Check Authentication > Usage for the daily limit on email-link sends on the Spark plan. If staff hit it, they can use Google sign-in.

### On-device analysis
- iPhone 12 (Safari): open /s/<shop>/capture on Wi-Fi with the network tab of Web Inspector open; check segmenterInfo().verification is 'ios-cpu' (or its effect: no scrambled classes); do a full 4-shot capture of a cooperating person in normal shop light and confirm each auto-shutter fires within 3 s, the hint arrows point the right way in Arabic and English, and the analysis progress finishes in under 3 s (time from the last shot to the profile screen).
- Mid-range Android (Chrome): same flow; open chrome://inspect, run analysisDebug() from the console after a profile (or watch the step timings) and confirm segmenterInfo().verification is 'gpu-ok' (or 'cpu-fallback') and analyzeShots total is under 3 s for 4 shots.
- iPad (iPadOS desktop user agent): confirm the segmenter runs on CPU (no scrambled skin/hair masks; the profile hairline is not 'estimated' for a man with visible hair).
- Offline: load the app once online, open capture so the models download (about 20.1 MB), switch to airplane mode, reload, capture and analyze; it must work (service-worker CacheFirst on storage.googleapis.com and cdn.jsdelivr.net).
- Age model: on Wi-Fi, desktop Chrome, call loadAgeModel() from the age chip flow and check in DevTools that huggingface.co serves onnx-community/fairface_age_image_detection-ONNX onnx/model_q4.onnx (about 50 MB) and that the ORT WASM comes from cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0; the age band chip is pre-selected only when confidence >= 0.5; on cellular (or Android with saveData) the model must not download.
- White card: front shot with plain white printer paper beside the cheek under warm shop light; tap the paper and check whiteCardFromTap returns gains (snackbar 'Colors calibrated'); tapping the teeth or the eye whites must show 'Could not read the paper'.
- Accuracy set (PRD 14.2): 30 labeled faces, compare faceShape.top/second (top-1 >= 70%, top-2 >= 90%) and skin.mst (within 1 of the visual label >= 85%); tune SHAPE_RULES / OVAL_PROTOTYPE in faceShape.js and DENSITY in beardDensity.js from the results.
- Beard density: a real full beard, a patchy beard, light stubble, a grey beard on light skin, and a dark-skinned customer; check zone densities against the barber's view and that low-confidence zones (< 0.6) show the Dense/Medium/Patchy/None confirmation chips.
- Measured beard length vs a ruler on side shots of a man with a 10-20 mm beard (within one guard size >= 90%).

### Catalog and recommendation
- Arabic review by an Omani barber: open src/data/styles.json, mustaches.json, lines.json, colors.json, finishes.json and src/lib/i18n/ns/catalog.json and read every 'ar' string aloud. Confirm the PRD names (copied exactly) and my own Arabic (mustache shapes, line type names, preset names تحديد العيد / تحديد العرس / عوارض خفيفة, warnings, safety questions) sound natural in a Muscat shop.
- Real bearded customer on a phone: New customer -> 4-shot capture -> Looks right -> Styles. Check that a man with a full beard sees full beards (corporate, short-boxed, khatt) in the top 6 without sideburn or soul-patch warnings. If they appear for a visibly full beard, report the B and S densities from the profile screen.
- Clean-shaven customer on a phone: capture a freshly shaved face. Styles should show no 'gaps may show' warnings and grow-ability should not read 0%. Once the screens wire it in, the profile screen should show 'Freshly shaved: confirm each zone'. Tap Patchy on both cheeks: full beards should drop and show 'العوارض خفيفة: قد تظهر فراغات'.
- Patchy cheeks on a phone: a customer with visibly sparse cheeks should get Balbo, Van Dyke and goatee near the top and a cheek warning on full beards (PRD section 3 example).
- Work rule chips: choose 'Clean-shave only' -> only Clean shave is shown; choose 'Short and neat only' -> no style longer than 15 mm, no mutton chops.
- Eid chip: choose 'Eid or wedding' -> razor and crisp styles (khatt, corporate, short-boxed, designer stubble) move up and show 'خطوط حادة للعيد والأعراس'.
- Jawline overlay with a real face in the Studio: a round-faced customer with a goatee or ducktail should read 'Face reads X% longer'; a square-jawed customer with a corporate or full beard should read 'Jaw reads X% softer'. Judge whether the numbers feel plausible and report any that look exaggerated.

### Session, Cut Card and reports
- iPhone Safari (installed PWA): on the Cut Card tap Share. Expect the system share sheet with the PNG (Web Share Level 2). On a browser without file sharing it should download lihya-cut-card-<date>.png. Check the PNG is 1080x1350 with shaped Arabic.
- iPhone + Android: Cut Card > Print/PDF. Check the PDF (2 A6 pages) and window.print (A6 paper, only the card, colors kept). Confirm Arabic letters are joined and right-to-left on the phone, where html2canvas runs on the device's own font engine.
- Done screen > 'Copy reminder + open WhatsApp' from the installed PWA on iPhone and Android: WhatsApp opens via wa.me with the text prefilled (and the client's +968 number), the text is also on the clipboard, and nothing is sent until the barber presses Send.
- Idle wipe: take a front shot, lock the phone for 11 minutes, unlock. The session should be cleared and the layout back on the barber home. In Safari Web Inspector > Storage > IndexedDB > lihya > session there should be no entry. Repeat with 'Next customer'.
- Keep photos: turn on 'Keep before and after photos' for a saved client, approve, tap Next customer. IndexedDB lihya > saved keeps that client's pair; repeat with the toggle off and check nothing remains.
- Safari Private Browsing: run a whole consultation. Nothing should break (IndexedDB fails soft, memory only).
- Excel (Windows and Mac): open the consultations, clients and stats CSV exports. Arabic shows correctly (UTF-8 BOM), phones stay as digits, no formulas run. Re-import the clients export in Reports (S20), Import clients card: phones already in the shop are skipped and listed.
- Products CSV import with a file saved from Excel in an Arabic locale (semicolon delimiter, Arabic header): rows are detected; bad rows (price 1.2345, category 'perfume', empty name) are marked with reasons in the --cut preview.
- Accuracy: on 5 real customers compare the printed cheek-line height (mm above the jaw at mid-cheek) and neckline against a ruler; record the error against the ±5% claim.

### AI Worker (Cloudflare)
- Cloudflare setup, every step: (1) Go to https://dash.cloudflare.com/sign-up, create a free account and verify the email. (2) In the dashboard: Workers & Pages, then pick a workers.dev subdomain if asked (for example 'lihya'). (3) In a terminal: cd lihya/worker, then npm ci, then npx wrangler login (the browser opens; click Allow), then npx wrangler whoami (shows the account). (4) npx wrangler kv namespace create LIHYA_CAPS. If Wrangler asks whether to add the binding to the config, answer No, because wrangler.toml already has it. Copy the id it prints into wrangler.toml in place of PASTE_KV_ID_HERE. (5) In wrangler.toml set FIREBASE_PROJECT_ID to the real Firebase project id (Firebase console, Project settings, General, Project ID). Set ALLOWED_ORIGINS to https://<projectId>.web.app,https://<projectId>.firebaseapp.com plus any custom domain, keeping http://localhost:5173 only while testing. (6) npm test (96 tests should pass), then npx wrangler deploy. Copy the printed URL https://lihya-render.<subdomain>.workers.dev. (7) In the project root .env.local set VITE_AI_WORKER_URL=<that URL> with no trailing slash, then npm run build, then firebase deploy --only hosting. (8) Allow each real shop (no shop can render until it is listed): npx wrangler kv key put "ai:allowed:<shopId>" "20" --binding=LIHYA_CAPS --remote, where shopId is the id in the app URL /s/<shopId>. A number up to 80 lets that owner set a higher cap; put "off" or run npx wrangler kv key delete "ai:allowed:<shopId>" --binding=LIHYA_CAPS --remote to block. Or list the ids in AI_SHOPS in wrangler.toml and deploy again. AI renders need a staff account with a verified email (email link or Google). (9) In LIHYA, as the owner: Settings, AI preview, ON.
- Smoke test after deploying: curl -i -X OPTIONS -H 'Origin: https://<projectId>.web.app' -H 'Access-Control-Request-Method: POST' https://lihya-render.<subdomain>.workers.dev/render should return 204 with Access-Control-Allow-Origin and Cache-Control: no-store. curl -i -H 'Origin: https://<projectId>.web.app' 'https://lihya-render.<subdomain>.workers.dev/quota?shopId=x' should return 401 {"error":"auth","reason":"missing"}. The same request with -H 'Origin: https://evil.example' should return 403 without CORS headers. curl -i https://lihya-render.<subdomain>.workers.dev/ should return 404.
- First real render on a phone (this confirms the model format): in a second terminal run cd worker, then npx wrangler tail. On the phone, sign in as owner, start a new customer, take the shots, pick a style, open Photo Studio, tap AI Final Look, then 'Allow once'. Expect the 'AI preview' image within about 10 s. The tail should show one line like {"route":"/render","method":"POST","status":200,"modelMs":...}. If it shows status 502 error 'model', note the exception and the Workers AI error in the Cloudflare dashboard (AI, Workers AI) and adjust buildModelInput in worker/src/model.js.
- Usage and caps: in the Cloudflare dashboard, open Storage & Databases, KV, LIHYA_CAPS. Keys ai:account:<UTC date> and ai:shop:<shopId>:<UTC date> should each be 1 after one render. AI, Workers AI should show about 115 neurons for that render. Owner screen: AI previews used today should read 1 of 20. Set Settings, AI daily cap to 1, then try a second render: the app should show 'Today's AI previews are used up. Live preview still works. Resets at 4:00 AM.' in both languages, and the tail should show status 429 with error 'cap' and scope 'shop'. Set the cap back to 20 afterwards.
- Access checks: AI preview OFF in Settings should give 403 'disabled', and the app should show it as off. A barber removed from staff (Staff, set inactive) should get 403 'not_staff'. The customer Try-at-home flow (anonymous) must never reach /render; a request with an anonymous ID token gets 403 'anonymous'.
- Privacy check: in the Cloudflare dashboard, Workers & Pages, lihya-render, Logs. Confirm the lines contain only route, method, status, ms and error/scope/modelMs, and no headers, tokens, shop ids or images.
- Legal (PRD 13 C): before turning AI preview on for paying shops, Sam confirms with MTCIT or a lawyer whether processing face images outside Oman on Cloudflare needs a permit.

### Rendering
- Live AR speed (iPhone 12 Safari and a mid-range Android Chrome): open the Studio live view in normal shop light. Read the fps from the 'fps' event or getState().fps; it should be 24 or more. Turn the head ±30°, nod and talk: the beard must stay on the jaw and lips and never cover the lips or nose. On a deliberately slow device the low-fps prompt should appear after about 2 s.
- Mirror and snapshot: in AR with mirror on, raise your right hand and confirm the preview behaves like a mirror. Take a snapshot and confirm it is unmirrored (text on clothing reads correctly).
- iPad Mirror Mode: canvas at 70 % width; rotate the device and confirm the cover crop and beard stay aligned.
- Side views: do a full 4-shot capture, then render Photo Studio on the left and right 45° shots with full-medium and full-long. The beard must be on the correct side, and the far side of a long beard must hide behind the neck without gaps.
- Long beards on a customer in a dark suit and a white shirt: no grey haze or lines over the collar, and the tips look ragged.
- Color (PRD 14.2): with the white card, render each dye on a customer; measure the beard mid-tone in the calibrated photo against the swatch. ΔE2000 must be 5 or less (8 or less without the card).
- AI Final Look: deploy the worker, set VITE_AI_WORKER_URL, rebuild, and turn on Settings > AI preview. In chair mode, allow consent once; the result must be labelled 'AI preview'. Exhaust the cap (or set it to 1) and confirm the 429 message in Arabic and English. Switch on airplane mode and confirm the offline message.
- WebGL contexts on iOS: open and close the Studio with AR 10 times; there must be no 'too many WebGL contexts' warning and no black canvas.
- Outline mode on a bearded customer choosing a shorter style: switch to Outline and confirm the brass lines and green/red tints are clearly readable on the real beard.

### Entry, login, barber home, Look Code entry
- On a real phone: send a sign-in link, open it in the same browser or home-screen app (signs in directly) and in another browser (asks for the email again). Then open an invite link sent from S18 Staff and confirm it lands in the shop.
- Google sign-in against the real Firebase project: the popup on Android and desktop, and the redirect in an iOS home-screen app.
- Barber home on a slow 4G connection, first visit: the 'Preparing camera models N%' line moves and the New customer button works the whole time. On Wi-Fi the age model downloads quietly afterwards.
- Tablet (iPad landscape 1024x768): search and recent clients sit side by side, and the buttons are centred at 640 px.
- Look Code end to end on real data: make a code from /try/<shop> on a customer phone, enter it in S14, and check that capture and then the Studio open with that look.

### Capture, profile, questions
- iPhone 12, Safari and the home-screen app: open /s/<shop>/capture after tapping New customer. Check the camera prompt, the mirror toggle, and that the shutter click is audible (sound is enabled by the first tap). The four auto-shots should fire with a real person turning; the arrows should point the way the customer turns in both languages.
- Android Chrome: same flow. Switch to another app during the capture: the camera light should go off and the camera should resume when you come back.
- Block the camera permission on iPhone, Android and desktop, and follow the instructions on screen to re-enable it. At /try/<shop>/capture, 'Use a photo instead' should open the front camera.
- White card: hold plain printer paper beside the cheek under warm shop light and tap it on the front photo. A brass rectangle and 'Colors calibrated' should appear; tapping the teeth should show 'could not read the paper'.
- On Wi-Fi with the age model reachable: the age band chip should be pre-selected only for a confident reading, and no age number should appear anywhere.
- With a real patchy or grey beard: the uncertain zones should show the dashed outline and the confirm rows, and tapping them should update the grow-ability ring.

### Owner dashboard, settings, reports
- Print the QR card (Settings > Try at home > Print QR) on a real printer and scan it with an iPhone camera and an Android camera. Also scan the on-screen QR from a second phone.
- Print the A4 range report (Reports > Print) and download the daily PDF on desktop Chrome; check that the Arabic shaping and the page breaks look right.
- On iOS Safari and Android Chrome, check that the daily PDF and the shop link (Share) open the share sheet, and that cancelling shows no error.
- After setting VITE_AI_WORKER_URL and turning AI preview on, check that the dashboard AI card shows 'Whole account today: x of 80'.
- Leave the dashboard open across 00:00 Muscat and confirm it switches to the new day with zeroed KPIs.
- On a shop with records older than the retention period, check that 'Apply now' deletes them (in batches of up to 400) and the snackbar count matches.

### Try at home
- On a real iPhone in Safari, tap 'Save as image' on the code screen. The share sheet should open with the card image; 'Save Image' should put it in Photos.
- On a real phone with WhatsApp, tap 'Book on WhatsApp' for a shop with a number and one without. With a number, the shop's chat should open with the message in both languages and the code. Without one, the contact chooser should open.
- Open the /try/<shopId> link from the shop's QR code and from an Instagram bio link (in-app browser). The landing should render, the language switch should work and Start should open the camera.

### Catalog manager, products, staff
- On a real phone (iOS Safari and Android Chrome), check that the price field opens a decimal keypad and that the Arabic decimal mark or comma reads correctly.
- Share on WhatsApp opens wa.me with the invite text and join link in the installed PWA. Confirm it opens WhatsApp and does not replace the app page.
- Drag the zone sliders by touch inside the sticky-preview editor on a small phone (390x844) and confirm the page still scrolls vertically.
- Download the template on the GitHub Pages build (/10-digitals/) and confirm assetUrl resolves to the header-only CSV.

### Styles, Studio, Compare
- Real iPhone and mid-range Android: Live AR frame rate and the low-fps snackbar, the hidden 1 px video keeping frames flowing (requestVideoFrameCallback), and the camera light turning off when leaving the Studio or switching tabs.
- Real tablet in landscape: Mirror Mode with the canvas on the start side (right in Arabic) and rotating between portrait and landscape mid-session (the sheet closes and the live preview restarts).
- A bearded customer: Outline turns on by itself when the chosen look goes shorter, and the green / red overlay reads clearly in Photo and Live.
- Owner turns AI preview on and the device is online: the AI Final Look button shows on Compare and leads to the consent screen.

### AI consent, AI Final Look, Cut Card, Done
- On a real phone with VITE_AI_WORKER_URL set and AI preview on: tap Allow once, check one image comes back labelled AI preview, then leave the screen and check the image is gone; also check the 429 cap message after the daily cap.
- On an iPhone: Cut Card > Share opens the share sheet with the PNG (iOS needs the share right after the tap; the PNG is prepared at idle time on screen open).
- Print the Cut Card on a real A6 printer via Print, and open the downloaded PDF on an Android phone to check Arabic shaping.
- Tablet Mirror Mode in landscape: AI preview and design side by side above the footer; Cut Card with the document on one side and the at-a-glance block on the other.
