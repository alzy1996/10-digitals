# LIHYA — Architecture and module contracts

This file is the contract between modules. Names and signatures here are binding:
a module exports exactly these names, and callers use only these names. If you need
something that is not here, add it to your own module and document it in this file.

Source of truth for product rules: the PRD ("LIHYA لحية — Beard Simulator PRD",
Oct 25 2026). Section numbers below (for example 5.3) refer to the PRD.

## 0. Global rules

- Plain JavaScript (ES modules, JSX). No TypeScript. React 18.3, react-router-dom 7
  (`BrowserRouter`, `Routes`, `Route`, `useNavigate`, `useParams`, `Outlet`).
- Tailwind 3 with CSS-variable colors: `bg-bg bg-surface bg-surface-2 border-line text-text
  text-text-2 bg-brass text-on-brass text-keep text-cut text-warn text-info`. Radii:
  `rounded-ctl` (10px controls) `rounded-card` (16px cards/sheets) `rounded-full` (chips).
  Use logical utilities only for horizontal layout (`ms- me- ps- pe- start- end- text-start
  text-end border-s border-e`), never `ml- mr- pl- pr- left- right-`, so RTL mirrors.
- No emoji anywhere. Icons only through `<Icon name="..."/>` (custom 1.5px line sprite).
- No gradients on surfaces, no glass effects, no drop shadows on dark. Depth = `bg-surface-2`
  + `border border-line`.
- Every visible string goes through i18n (`useT().t(key, vars)`), Arabic first.
  Feature areas put their strings in `src/lib/i18n/ns/<area>.json` as
  `{ "en": { "<area>.key": "..." }, "ar": { "<area>.key": "..." } }`. Keys are flat and
  prefixed with the area (`capture.closer`). Shared keys live in `ar.json`/`en.json`
  (see the files for what exists: `common.*`, `zone.*`, `face.*`, `undertone.*`, `age.*`, `role.*`).
- Digits stay Latin in Arabic (measurements must read the same for every barber).
- Money: OMR, 3 decimals, `formatOmr()` from `src/lib/format.js`. Prices only from the
  owner's products. Never invent products, services or prices.
- Dates: `src/lib/time.js` (`dayKey`, `muscatDayRange`, `formatMuscat`...). Asia/Muscat for
  every day boundary. Never the UTC date.
- Components never call Firestore. Screens call `src/services/*.js` and hooks only.
- Screens never import model internals. AI goes through `src/ai/index.js` only.
- Photos never go to Firebase. Firestore never holds an image or raw ratios.
- localStorage only for per-device UI preferences (`PREF_KEYS` in `src/config/app.js`).
- `console.log` is a lint error. Lint runs with `--max-warnings=0`.
- No `...` placeholders, no TODO stubs. Complete files.

## 1. Routes (src/App.jsx)

| Path | Screen file (src/screens/) | Who |
| --- | --- | --- |
| `/` | S01ShopPicker.jsx | all |
| `/login` | S02Login.jsx (also completes email-link sign-in; `?invite=<shopId>` joins a shop) | staff |
| `/create-shop` | CreateShop.jsx | signed-in user |
| `/join/:shopId` | S02Login.jsx in join mode (accept invite after sign-in) | invited staff |
| `/s/:shopId` | S03BarberHome.jsx | staff |
| `/s/:shopId/capture` | S04Capture.jsx | staff |
| `/s/:shopId/profile` | S05Profile.jsx | staff |
| `/s/:shopId/questions` | S06Questions.jsx | staff |
| `/s/:shopId/styles` | S07Styles.jsx | staff |
| `/s/:shopId/studio` | S08Studio.jsx | staff |
| `/s/:shopId/compare` | S09Compare.jsx | staff |
| `/s/:shopId/ai-consent` | S10AiConsent.jsx | staff |
| `/s/:shopId/ai-result` | S11AiFinalLook.jsx | staff |
| `/s/:shopId/cut-card` | S12CutCard.jsx | staff |
| `/s/:shopId/done` | S13Done.jsx | staff |
| `/s/:shopId/look-code` | S14LookCodeEntry.jsx | staff |
| `/s/:shopId/owner` | S15OwnerDashboard.jsx | owner, manager |
| `/s/:shopId/owner/catalog` | S16CatalogManager.jsx | owner, manager |
| `/s/:shopId/owner/products` | S17Products.jsx | owner, manager |
| `/s/:shopId/owner/staff` | S18Staff.jsx | owner |
| `/s/:shopId/owner/settings` | S19Settings.jsx | owner |
| `/s/:shopId/owner/reports` | S20Reports.jsx | owner, manager |
| `/try/:shopId` | S21TryAtHome.jsx | customer (no sign-in until Look Code) |
| `/try/:shopId/capture` | S04Capture.jsx (home mode) | customer |
| `/try/:shopId/profile` | S05Profile.jsx (home mode) | customer |
| `/try/:shopId/styles` | S07Styles.jsx (home mode) | customer |
| `/try/:shopId/studio` | S08Studio.jsx (home mode) | customer |
| `/try/:shopId/code` | S22LookCodeResult.jsx | customer |

Screens read the mode from `useSession().mode` (`'chair'` under `/s/`, `'home'` under `/try/`)
and build links with `useSession().path(sub)` (returns `/s/<id>/<sub>` or `/try/<id>/<sub>`).
Every screen file default-exports its component.

Route wrappers (src/state/, written by the integrator from the pieces below):
`ShopRoute` = RequireAuth + `ShopProvider` + `SessionProvider mode="chair"` + `<Outlet/>`.
`HomeRoute` = `PublicShopProvider` + `SessionProvider mode="home"` + `<Outlet/>`.
`RequireRole roles={[...]}` wraps owner routes.

## 2. State (src/state/)

### AuthContext.jsx (Firebase layer)
`AuthProvider`, `useAuth() -> { user, loading, isAnonymous }`, `RequireAuth({children})`
(redirects to `/login?next=<path>` when signed out; anonymous users count as signed out for staff routes).

### ShopContext.jsx (Firebase layer)
`ShopProvider({shopId, children})`, `useShop() -> { shopId, shop, settings, me, role,
isOwner, isManager, canManage, loading, error }`. `settings` is `shop.settings` merged over
defaults (`DEFAULT_SETTINGS` exported from `src/services/shops.js`). `me` is my staff doc.
`PublicShopProvider({shopId, children})`, `usePublicShop() -> { shopId, info, styles, loading, error }`
(public info doc + non-hidden styles, readable without staff membership when Try at home is on).
`RequireRole({roles, children})` (redirects to `/s/:shopId` when my role is not allowed).

### SessionContext.jsx (session layer)
`SessionProvider({mode, shopId, children})`, `useSession()` returns:

```
mode: 'chair' | 'home'
shopId
path(sub) -> string                       // '/s/<id>/<sub>' or '/try/<id>/<sub>'; path('') = home
client: { id: string|null, displayName: string|null, walkIn: boolean } | null
setClient(client)
captureMode: 'full' | 'quick'             // quick = front shot only
setCaptureMode(m)
shots: { front: Shot|null, left: Shot|null, right: Shot|null, chinUp: Shot|null }
setShot(id, shot) ; clearShots()
whiteCard: { rect, gains } | null ; setWhiteCard(wc)
profile: FaceProfile | null ; setProfile(p)
overrides: { faceShape, undertone, ageBand, mst, zones: { [zone]: 'dense'|'medium'|'patchy'|'none' } }
setOverride(key, value)                   // key 'zones.K_L' sets a zone confirmation
effectiveProfile                          // profile with overrides applied (applyOverrides)
answers: { workRule: 'clean'|'short'|'none'|null, visitFrequency: 'weekly'|'biweekly'|'monthly'|null,
           grooming: 0|5|10|null, occasion: 'eid'|'none'|null }
setAnswer(key, value)
ranked: Ranked[] ; setRanked(list)
activeParams: LookParams | null ; setActiveParams(p)
looks: Look[] (max 3) ; saveLook({ styleId, params, thumb }) -> { ok, id?, reason?: 'max' }
removeLook(id) ; updateLook(id, patch)
favoriteLookId ; setFavorite(id)
approved: { lookId, params, at: Date, decisionSeconds } | null ; approve(lookId)
startedAt: Date | null                    // set when the first shot is taken (or the Look Code loads)
lookCode: { code, styleId, params } | null ; setLookCode(lc)
consultationId ; setConsultationId(id)
aiResult: { blob, url } | null ; setAiResult(r)
cutCard: CutCard | null ; setCutCard(c)
keepPhotos: boolean ; setKeepPhotos(b)    // customer agreed to keep before/after on this device
safety: { patchTest48h: boolean|null, metallicSaltProducts: 'yes'|'no'|'unsure'|null, pureHenna: boolean|null, irritationToday: boolean|null }
setSafety(key, value)
wipe(reason)                              // erases photos from memory and the session IndexedDB store
touch()                                   // resets the 10-minute idle timer (also done on any pointerdown)
onIdleWipe(cb) -> unsubscribe             // layouts navigate home after an idle wipe
```

Idle 10 minutes or "Next customer" calls `wipe()`. Before/after photos are written to the
`saved` IndexedDB store only when `keepPhotos` is true (src/lib/idb.js).

## 3. Firebase layer (src/lib/firebase.js, src/services/*.js, src/hooks/useLive.js)

`src/lib/firebase.js` exports `app, db, auth, usingEmulators, firebaseConfigured` (PRD 10.1 init,
emulator switch when `VITE_USE_EMULATORS=true`, App Check skipped on emulators), plus `demoMode`, `DEMO_USER`,
`resolveMode` and `demoGeneration()` for the no-login demo (section 9, Demo mode).

Writes are optimistic and must never block the UI offline: services create document refs
synchronously (`doc(collection(...))`) and return ids immediately; the write promise is
tracked by `src/services/sync.js` (`trackWrite(promise)`, `subscribePending(cb) -> unsub`,
`pendingCount()`), never awaited by screens for navigation. Every write sets
`createdAt/createdBy` or `updatedAt/updatedBy` with `serverTimestamp()` and the uid, and
writes an audit entry for owner-level changes (`src/services/audit.js`).

| Module | Exports |
| --- | --- |
| auth.js | `watchAuth(cb)`, `sendEmailLink(email, {next})`, `isEmailLink(href)`, `completeEmailLink(href, emailOrNull)`, `signInGoogle()`, `signInAnon()`, `signOutUser()`, `getIdToken(force)` |
| shops.js | `DEFAULT_SETTINGS`, `createShop({name, nameAr, whatsapp})` -> shopId, `watchShop(shopId, cb)`, `updateShop(shopId, patch)`, `updateSettings(shopId, patch)`, `watchMyShops(uid, cb)` -> `[{shopId, role, name, nameAr}]`, `watchPublicInfo(shopId, cb)`, `seedDemoData(shopId)`, `deleteDemoData(shopId)` |
| staff.js | `watchStaff(shopId, cb)`, `watchMyStaff(shopId, uid, cb)`, `setStaffRole(shopId, uid, role)`, `setStaffActive(shopId, uid, active)` |
| invites.js | `createInvite(shopId, email, role)`, `watchInvites(shopId, cb)`, `deleteInvite(shopId, email)`, `acceptInvite(shopId)` |
| styles.js | `watchStyles(shopId, cb, {includeHidden})`, `watchPublicStyles(shopId, cb)`, `updateStyle(shopId, styleId, patch)`, `createSignatureStyle(shopId, baseStyle, patch)` -> styleId, `setStyleOrder(shopId, ids)` |
| products.js | `watchProducts(shopId, cb)`, `addProduct(shopId, p)`, `updateProduct(shopId, id, patch)`, `importProducts(shopId, rows)` -> `{imported}` |
| clients.js | `watchRecentClients(shopId, n, cb)`, `searchClients(shopId, text)` -> Promise<list>, `createClient(shopId, {displayName, phone})` -> id, `updateClient(shopId, id, patch)`, `saveClientProfile(shopId, id, coarse)`, `recordVisitLengths(shopId, id, {zonesMm, at})`, `importClients(shopId, rows)` -> `{imported, skipped}` |
| consultations.js | `createConsultation(shopId, {clientId, styleId, params, startedAt})` -> id, `updateConsultation(shopId, id, patch)`, `approveConsultation(shopId, id, {params, cutCard, decisionSeconds, aiPreviewUsed})`, `completeConsultation(shopId, id, {rating, nextVisitDays, addOns})`, `cancelConsultation(shopId, id)`, `watchConsultationsRange(shopId, startKey, endKey, cb, {includeDemo})`, `listConsultationsRange(shopId, startKey, endKey, {includeDemo})` |
| lookCodes.js | `createLookCode(shopId, {styleId, params})` -> Promise<code>, `getLookCode(shopId, code)` -> Promise<doc|null>, `markLookCodeUsed(shopId, code)` |
| consents.js | `logConsent(shopId, {type: 'ai_render'|'profile_save', clientId, granted})` |
| stats.js | `bumpStats(shopId, dayKey, deltas)` (FieldValue.increment), `watchDailyStats(shopId, dayKey, cb)`, `watchStatsRange(shopId, startKey, endKey, cb)` |
| audit.js | `writeAudit(shopId, {action, path, changedFields})`, `diffFields(before, after)` |
| sync.js | `trackWrite(promise)`, `subscribePending(cb)`, `pendingCount()` |

`src/hooks/useLive.js`: `useLive(subscribe, deps) -> { data, loading, error }` where
`subscribe(cb, onError) -> unsubscribe`. `src/hooks/useOnline.js`: `useOnline() -> boolean`,
`usePendingWrites() -> number`.

Firestore collections: exactly PRD 10.2, plus `shops/{shopId}/public/info`
(`{ name, nameAr, tryAtHome, whatsapp, updatedAt }`, public read when `tryAtHome`) because the
customer landing page must show the shop name without staff access. `staff/{uid}` also stores
`uid` (for the `watchMyShops` collection-group query).

## 4. AI facade (src/ai/index.js)

`src/ai/index.js` is the only import path for screens. It re-exports:

```
loadModels({ onProgress, segmenter = true }) -> Promise<void>     // models/landmarker.js
modelStatus() -> { landmarker, segmenter, age }                   // 'idle'|'loading'|'ready'|'error'
createCaptureSession(opts) -> CaptureSession                       // capture/session.js
shotFromImage(fileOrBlob, shotId) -> Promise<{ shot, issues }>     // capture/session.js
whiteCardFromTap(shot, xNorm, yNorm) -> { rect, gains } | null     // capture/whiteCard.js
analyzeShots(shots, { whiteCard, onStep }) -> Promise<FaceProfile> // analysis/profile.js
applyOverrides(profile, overrides) -> FaceProfile                  // analysis/profile.js
toCoarseProfile(profile) -> { faceShape, mst, undertone, ageBand, growability }
canLoadAgeModel() -> boolean ; loadAgeModel() -> Promise<boolean>  // models/age.js
recommend(profile, styles, { answers, settings }) -> Ranked[]      // recommend/score.js
jawlineDelta(profile, params) -> { lengthPct, jawSoftPct, widthPct } // recommend/jawline.js
createArRenderer(opts) -> ArRenderer                               // render/arRenderer.js
renderStudio(opts) -> Promise<HTMLCanvasElement>                    // render/photoStudio.js
renderThumbnail(shot, params, profile, opts) -> Promise<string>     // render/photoStudio.js (data URL, 4:5)
TIMELINE_STOPS, growthAt(params, profile, days, rateMmPerDay) -> { params, labelKey }  // render/timeline.js
renderFinalLook({ shot, studioCanvas, seed, shopId }) -> Promise<{ blob, url }>         // render/provider.js
finalLookAvailable(settings) -> boolean                            // render/provider.js
needsOutline(params, profile) -> { needed, zones }                 // render/inpaint.js (going shorter = Outline mode)
```

`Shot` = `{ id: 'front'|'left'|'right'|'chinUp', canvas: HTMLCanvasElement (never mirrored),
width, height, landmarks: [{x,y,z}] (478, normalized 0..1), matrix: number[16] | null,
pose: { yaw, pitch, roll } (degrees), capturedAt: Date }`.

`CaptureSession` = `createCaptureSession({ video, mode: 'full'|'quick', mirror, onStatus, onShot, onDone })`
returns `{ start(), stop(), retake(shotId), current() }`. `onStatus({ shot, faceFound, pose,
hint, progress })`, hint keys: `'noFace'|'closer'|'farther'|'light'|'dark'|'bright'|'blur'|
'turnLeft'|'turnRight'|'lookStraight'|'chinUp'|'chinDown'|'hold'|null` (customer's left/right).
`onShot(shot)` fires after the 400 ms hold; the screen plays the sound and the white edge flash.

`FaceProfile` = PRD 5.8 exactly: `{ version: 1, capturedAt (Muscat ISO), scale: { mmPerPx, source, confidence },
faceShape: { top, scores: { oval, round, square, oblong, heart, diamond, triangle }, jawAngleDeg, measures },
skin: { ita, mst, undertone, confidence, lab }, ageBand: { band, source: 'model'|'none', confidence },
beard: { zones: { M,S,C,J_L,J_R,K_L,K_R,B_L,B_R,N: { density, lengthMm, confidence } }, growability,
greyRatio, colorId, colorLab }, calibration: { whiteCard, gains }, overrides: { faceShape, undertone, ageBand } }`.
`ageBand.band` is one of `'18-24'|'25-34'|'35-44'|'45-54'|'55+'` or `null`.
`skin.lab`, `beard.colorLab`, `faceShape.measures` never leave the device.

`Ranked` = `{ styleId, style, score (0..100), growability (0..100), reasons: [{ key, vars }]
(max 3), warnings: [{ key, vars }], jawline: { lengthPct, jawSoftPct, widthPct } }`, sorted by
score desc, ties by `style.order` then id. Styles hidden by the work rule are left out.

`ArRenderer` = `createArRenderer({ canvas, video, mirror = true })` returns
`{ setLook(params, profile), setMode('beard'|'outline'), setTimelineDays(days), start(), stop(),
dispose(), snapshot() -> HTMLCanvasElement (unmirrored), onFps(cb) -> unsub }`.
`renderStudio({ shot, params, profile, timelineDays = 0, outline = false, maxSize = 1600 })`.

## 5. Data (src/data/*.json)

`styles.json` (34), `mustaches.json` (13), `lines.json`, `colors.json` (14), `finishes.json` (4),
`guards.json` (default guard chart, also the source for `src/lib/guards.js`), `reasons.json`.

Style object:

```
{
  "id": "goatee",
  "name": { "en": "Goatee", "ar": "دقن (غوتي)" },
  "zones": { "M": 0, "S": 10, "C": 15, "J_L": 0, "J_R": 0, "K_L": 0, "K_R": 0, "B_L": 0, "B_R": 0, "N": 0 },
  "zoneNote": "C 15, S 10, rest 0",
  "shape": { "chin": "round|pointed|flat|wide-round|split|braided|ring|natural", "jFront": false,
             "mustacheFloating": false, "fadeB": null | [fromMm, toMm], "flare": false, "lengthAdjustable": "C"|null },
  "lines": { "cheek": "natural|low|medium|high|curved|straight", "neckline": "1f|2f|jaw|squared",
             "sideburn": "hard|skin-fade|blended|disconnected", "edge": "soft|crisp|razor",
             "mustacheEdge": "over|at|short" },
  "mustacheId": "natural-short" | null,
  "faces": ["RD", "OV", "TR"],          // OV RD SQ OB HT DM TR, or ["all"]
  "trimDays": 4,
  "localFit": 4,
  "lengthClass": "none|stubble|short|medium|long|xlong",
  "weights": { "C": 0.6, "S": 0.4 },   // grow-ability weights, sum 1, only zones the style needs
  "required": { "C": 60, "S": 50 },    // required density per needed zone (full beards: cheeks and connectors >= 70)
  "ageFit": { "18-24": 0.8, "55+": 0.5 }, // optional, default 0.8
  "theatrical": false,
  "tags": ["gulf", "razor", "eid"],
  "order": 90, "hidden": false, "signature": false
}
```

`LookParams` (what the barber designs; saved in consultations.params and Look Codes):

```
{ styleId, zones: { M..N: mm }, lines: { cheek, cheekOffset (-1..1), neckline, necklineOffset (-1..1),
  sideburn, edge, mustacheEdge }, mustacheId, fadeStartMm: number|null, colorId, greyTarget: number|null,
  finish: 'matte'|'oiled'|'balm'|'waxed', shape: { ...style.shape } }
```

`src/lib/look.js` (catalog/recommend owner): `paramsFromStyle(style, { profile })`, `clampParams(p)`,
`validateParams(p) -> string[]`, `applyPreset(params, presetId)`, `scaleLength(params, factor)`,
`setZoneLength(params, zone, mm)`, `LENGTH_FILTERS`, `MAINTENANCE_FILTERS`.

## 6. Cut Card (src/lib/cutcard.js) and reports (src/reports/)

`buildCutCard({ params, profile, style, guardChart, colors, safety, growthMmPerDay, now })` ->
```
{ rows: [{ zone, mm, guard: { kind, guardId, label, mm }, note }], cheekLine: { type, mmAboveJaw },
  neckline: { type, fingers, mmAboveAdamsApple }, mustacheEdge, sideburn: { join, fadeStartMm },
  color: { id, safetyFlags: [key] }, finish, trimDays, nextVisitDays, approx: true }
```
`src/lib/guards.js`: `mmToGuard(mm, chart)`, `DEFAULT_GUARD_CHART`, `validateGuardChart(chart)`.
`src/reports/cutCardPdf.js`: `cutCardNode(data, lang)`, `cutCardPdf(data, lang) -> Promise<Blob>` (A6 portrait),
`cutCardPng(data, lang) -> Promise<Blob>` (1080x1350).
`src/reports/dailyReportPdf.js`: `dailyReportPdf({ shop, dayKey, consultations, staff, products, stats, lang, includeDemo }) -> Promise<Blob>` (A4).
`src/reports/csv.js`: `parseCsv(text)`, `parseProductsCsv(text) -> { rows, errors }`,
`parseClientsCsv(text, existingPhones) -> { rows, skipped, errors }`, `toCsv(rows, columns)` (UTF-8 BOM),
`downloadBlob(blob, filename)`, `exportConsultationsCsv`, `exportClientsCsv`, `exportStatsCsv`.
`src/reports/share.js`: `shareFile(blob, filename, text)` (Web Share with files, fallback download),
`openWhatsApp(text, phone)`.

## 7. Components (src/components/)

`Button({ variant: 'primary'|'secondary'|'ghost'|'danger', size, icon, loading, disabled, onClick, children, ...rest })`
— primary 64px brass full width; secondary 48px bordered.
`BottomAction({ children })` — bottom-anchored action area with safe-area padding.
`Chip({ selected, onClick, icon, tone: 'default'|'warn'|'keep'|'cut'|'info', children })` — 40px pill.
`ChipRow({ label, options: [{ value, label, icon }], value, onChange, multi })` — one-tap choices (never dropdowns).
`Slider({ value, min, max, step, onChange, unit, label, format })` — 8px track, 32px thumb, value bubble in mm.
`Sheet({ open, onClose, title, children, snap })` — bottom sheet, 16px radius, drag handle.
`Ring({ value, size = 72, label })` — Grow-ability ring, brass arc, % in center.
`ShotDots({ total = 4, done })`.
`CodeBoxes({ value, onChange, length = 6, alphabet, autoFocus })` — 6 x 56px boxes + on-screen keypad.
`Snackbar` + `useSnackbar() -> { show({ message, actionLabel, onAction, duration = 6000 }) }` (provider `SnackbarProvider`).
`ZoneDiagram({ params, cutCard, view: 'front'|'profile', size, lang })` — SVG line face, keep/remove tints, brass edges, mm + guard labels.
`BarberRuler({ mm, maxMm, orientation })` — brass ruler with mm ticks.
`StyleCard({ ranked, thumb, selected, onClick })` — 4:5 photo, both names, Grow-ability %, max 3 chips.
`Icon({ name, size = 24, className, title })`.
Layout: `ScreenFrame({ title, back, actions, children, footer, wide })` (top bar with back + language
toggle + pending-sync badge), `TopBar`, `LangToggle`, `SyncBadge`, `OwnerShell({ children })`
(desktop 2-column fixed side nav, phone tabs), `ScreenFallback` (skeleton), `ErrorState`, `EmptyState`,
`ConfirmUndo` pattern via snackbar (no confirm dialogs).
`SyncStrip` (exported from SyncBadge.jsx): `TopBar` uses `<SyncBadge offlineStrip />`, so on phones the offline
states show as a full-width line under the bar and online-pending as a short "Saved, will sync" pill.
`ScreenTransition` (src/components/ScreenTransition.jsx) wraps `<Routes>` inside `<Suspense>` in App.jsx (PRD 9.4
screen motion; nothing remounts, reduced motion = none). `ErrorBoundary({ resetKey })` (src/state/ErrorBoundary.jsx):
App.jsx passes the route path, so the next route clears an error without remounting the providers.
Colours: `text-keep`, `text-cut`, `text-warn`, `text-info` map to the AA text tokens `--keep-ink`, `--cut-ink`,
`--warn-ink`, `--info-ink` (tokens.css; `text-*-ink` also exists). `bg-`, `border-` and `fill-` utilities keep the PRD
values. Inline styles that colour text use `var(--*-ink)`.

## 8. Folder ownership (build phase)

| Area | Paths |
| --- | --- |
| Scaffold, routes, glue | `src/main.jsx`, `src/App.jsx`, `src/config/`, `src/lib/time.js`, `src/lib/format.js`, `src/lib/guards.js`, `src/lib/i18n/useT.js`, `src/ai/index.js`, `src/ai/analysis/color.js`, `src/styles/`, root configs |
| Mesh | `src/ai/mesh/*`, `scripts/gen-mesh.js` |
| UI kit | `src/components/*`, `public/icons/*` |
| Firebase | `src/lib/firebase.js`, `src/services/*`, `src/hooks/useLive.js`, `src/hooks/useOnline.js`, `src/state/AuthContext.jsx`, `src/state/ShopContext.jsx`, `firestore.rules`, `firestore.indexes.json`, `tests/rules/*` |
| AI analysis | `src/ai/models/*`, `src/ai/capture/*`, `src/ai/analysis/*` (except color.js) |
| Catalog + recommend | `src/data/*.json` (except guards.json), `src/ai/recommend/*`, `src/lib/look.js` |
| Rendering | `src/ai/render/*` |
| Session + Cut Card + reports | `src/state/SessionContext.jsx`, `src/hooks/useSession.js`, `src/lib/idb.js`, `src/lib/cutcard.js`, `src/reports/*` |
| Worker | `worker/*` |
| Screens | `src/screens/*` |

## 9. Addenda from the module build (binding, read before writing screens)

### UI kit extras (src/components)
- `IconButton({ icon, label, onClick, size: 'md'|'lg', tone, mirror })` for icon-only buttons (label = aria-label).
- `Button` also takes `iconEnd`, `full`, `as` (render as a router `Link`); named export `Spinner`.
- `ChipRow` also takes `nullable`, `wrap`; options may carry `tone`, `disabled`. `Chip` takes `size: 'md'|'sm'`.
- `Slider` also takes `onChangeEnd(value)`, `disabled`, `aria-label`; `unit: 'mm'` formats with `formatMm`.
- `Sheet` also takes `modal` (default true; use `modal={false}` in the Studio so the canvas stays visible) and `footer`; `snap: 'auto'|'half'|'full'`.
- `useSnackbar()` returns `{ show, dismiss, confirmUndo({ message, onCommit, onUndo, actionLabel, duration }) }` — use
  `confirmUndo` instead of confirm dialogs (the change commits on timeout unless Undo is tapped).
- `ZoneDiagram` also takes `side 'L'|'R'`, `guardChart`, `showLabels`, `palette`; use `ZONE_DIAGRAM_PRINT_PALETTE`
  (hex) inside PDFs/html2canvas. `BarberRuler` takes `color`, `textColor` (hex for PDFs), `lang`, `showValue`.
- `StyleCard` takes `reasonLabels`, `warningLabels` (or translates `ranked.reasons/warnings` itself).
- `ScreenFrame` also takes `onBack`, `padded`, `topBar`, `className`, `bodyClassName`; `back` = true | path | fn.
  Owner screens: `<OwnerShell><ScreenFrame title wide>...</ScreenFrame></OwnerShell>`.
- Extras: `Toggle({ checked, onChange(bool), label, description })`, `Field({ label, value, onChange(value, event), error,
  hint, icon, end, type, multiline })`, `Stat({ label, value, sub, icon, tone, loading })`, `Skeleton`, `RatingDots({ value,
  onChange, max })`, `BeforeAfter({ before, after, beforeLabel, afterLabel, aspect })`, `Flash({ trigger })`,
  `ShotDots({ done: count|boolean[], current })`, `CodeBoxes({ value, onChange, label, error })` (defaults to the Look Code
  alphabet, length 6, always LTR).

### Firebase extras (src/services, src/state)
- `useAuth()` also returns `{ isStaffUser, emailLink: { status: 'none'|'completing'|'needEmail'|'done'|'error', error },
  completeEmailLink(email), authError, clearAuthError }`. S02: when `emailLink.status === 'needEmail'` ask for the email.
  Map errors with `authErrorKey(err)` (auth.js) to `ns/auth.json` keys. Read `next` through `safeNextPath()`.
- `signInGoogle()` resolves `user | null` (null = redirect started). `sendLinkTo(email, { next })` also exists.
- `useShop()` also returns `hasPendingWrites`. `usePublicShop().styles` is always an array.
- `useLive` also returns `hasPendingWrites`, `fromCache`; watch callbacks get `(data, { hasPendingWrites, fromCache })`.
- `createInvite` resolves `{ email, role, joinUrl, sent }` (when `sent` is false, offer to share `joinUrl` on WhatsApp);
  invites allow only manager/barber. `acceptInvite(shopId)` resolves `{ shopId, role, already }`, rejects
  `invite/email-not-verified` | `invite/not-found`. `setStaffRole/setStaffActive` throw `staff/own-role` / `staff/own-active`.
- `products.addProduct/updateProduct` throw `invalid-argument` with `err.fields`; `importProducts` -> `{ imported, updated, skipped }`.
- `clients.createClient` throws `invalid-argument` for an empty name or bad phone. `saveClientProfile` logs the
  profile_save consent itself. `recordVisitLengths(shopId, id, { zonesMm, at, measuredMm })`.
- Stats: consultations.js bumps consultations / approvals / decision seconds / topStyles / addOns itself. Screens only
  call `bumpAiRender(shopId)` (stats.js) once per AI render. Screens call `logConsent` for 'ai_render' only.
- `getLookCode` returns `{ code, styleId, params, createdAt, expiresAt, usedAt, usedBy, expired, used, invalid, errors } | null`.
  `params` is already clamped (`lookCodes.lookCodeParams(data)` = `look.checkLookParams(data.params, data.styleId).params`);
  `invalid` is true when the look still names unknown options (`errors` = `catalog.err.*` keys): S14 refuses such a code.
- `shops.purgeExpiredData(shopId)` (owner) applies `settings.retentionDays`; call it when the owner dashboard opens.
  `deleteDemoData(shopId)` -> Promise. `watchPublicInfo` calls `cb(null, { denied: true })` when Try at home is off.
- `sync.subscribeWriteErrors(cb(err, label))` for writes the server rejects.

### AI analysis extras (via src/ai/index.js)
- `loadModels({ onProgress({ fraction, loaded, total, stage }) })`; `subscribeModelStatus(cb)`.
- Capture `onStatus` also carries `{ arrow: 'left'|'right'|'up'|'down'|null, index, total, taken, error: 'model'? }`;
  show `t('ai.hint.' + hint)`; shots carry `issues: [hintKey]`. `shotFromImage` -> `{ shot|null, issues }`
  (`t('ai.issue.title')`, `t('ai.issue.noFace')`).
- `analyzeShots` `onStep(stepKey, { index, total, i18nKey })` -> show `t(i18nKey)`; `STEP_KEYS` exported.
- S05: confirm chips (`ai.zone.dense|medium|patchy|none`) for zones with `confidence < CONFIRM_BELOW` via
  `setOverride('zones.<Z>', value)`; `itaBand(profile.skin.ita)` with `ai.ita.<band>` keys.
- Call `canLoadAgeModel()` then `loadAgeModel()` early (capture screen on Wi-Fi) so the age band can be pre-selected.
- `faceShape.measures = { faceLengthMm, foreheadWidthMm, cheekboneWidthMm, jawWidthMm, lengthToCheek, chinAngleDeg,
  hairlineEstimated, hairlineSource }`.

### Catalog / recommend extras
- Call `recommend(effectiveProfile, styles, { answers, settings, overrides: session.overrides, chosen })`.
- Ranked items also carry `rawScore`, `growUnknown`, `trim { key, cardKey, vars }` (card trim label =
  `t(ranked.trim.cardKey, ranked.trim.vars)`), `parts`; reasons/warnings items are `{ key (full i18n key), id, vars, zones? }`
  -> `t(item.key, item.vars)`. `growability` may be null (freshly shaved / unknown).
- S05: show `t('catalog.warn.shaved_confirm')` when `isFreshlyShaved(profile, overrides)`.
- S07: show `workRuleNotice(hiddenByWorkRule(styles, answers.workRule).length)` (or the count it expects — read reasons.js),
  `pairingHints(style)` for the PRD 6.4 one-liners; "See all styles" filters with `filterStyles`, `LENGTH_FILTERS`,
  `MAINTENANCE_FILTERS` from src/lib/look.js.
- Studio: `jawlineDetail(profile, params)` / `jawlineLabels(delta)` -> `[{ key: 'catalog.jaw.*', vars: { pct } }]`.
- `src/lib/look.js` extras: `lookSummary(params, lang, style)`, `setColor`, `safetyFor(colorId)`, `safetyFlags(colorId,
  session.safety)`, `filterStyles`, `getStyle`, `getMustache`, `getColor`, `getFinish`, `getPreset`, `PRESETS`, `ZONE_GROUPS`,
  `setZoneLength` accepts groups 'J', 'K', 'B'. `LookParams.presetId`. Chin shape enum adds 'strip'.
- `reasons.json.safetyQuestions` ids equal the session safety keys (patchTest48h, metallicSaltProducts, pureHenna,
  irritationToday).
- Offsets: `lines.cheekOffset` / `lines.necklineOffset` positive = the line moves UP (cheek line higher on the face,
  neckline higher toward the jaw).

### Base path (GitHub Pages sub-path)
- The app may be served under a sub-path (`/10-digitals/` on GitHub Pages). Router links and `navigate('/s/...')` are fine
  (the router has a `basename`). Any URL that leaves the app (email links, QR codes, WhatsApp text, share text) must use
  `appUrl(routePath)` from `src/lib/paths.js`, and files in `public/` must use `assetUrl('templates/products-template.csv')`.
  Never build URLs from `window.location.origin` directly and never hard-code `'/icons/...'` or `'/templates/...'`.

### Rendering extras (via src/ai/index.js)
- `createArRenderer({ canvas, video, mirror, growthMmPerDay })` throws `err.code === 'webgl'` when WebGL cannot start.
  Extras: `setMirror(on)`, `on(event, cb) -> unsub` with events `fps`, `low-fps` (offer Photo Studio with
  `render.lowFps` / `render.lowFps.action`), `face`, `busy`, `error` (`contextLost`); `getState()`;
  `setTimelineDays(null)` = the designed look, a number = growth state at that day.
- `renderStudio` also takes `timeline` (true shows the growth state even at day 0), `day` (henna day 1 or 3) and
  `growthMmPerDay`. `renderThumbnail(shot, params, profile, { width, quality })`.
- `TIMELINE_STOPS` items are `{ days, key, labelKey, noteKey? }`; `growthAt` returns `{ params, coverage, labelKey,
  lengths, complete, days }`.
- `renderFinalLook` errors carry `err.code`: `cap` -> `render.capReached`, `offline` -> `render.error.offline`,
  `disabled` -> `render.error.disabled`, else `render.error.failed`. Label the result `render.aiPreview` +
  `render.aiPreview.note`. `clearRenderCaches()` is called by the session wipe.

### Session, Cut Card and reports extras
- `useSession()` also returns `hydrated`, `hasData`, `clearApproval()`, `trackObjectUrl(url)`,
  `keepBeforeAfter({ before, after })`. The session keeps a photo-free snapshot for reload recovery (10 minutes).
  Idle wipes navigate home automatically (src/state/IdleWipeWatcher.jsx) — screens do not need to.
- `buildCutCard({ params, profile, style, guardChart, colors, safety, answers, growthMmPerDay, now, front: shots.front })`;
  the card carries `nextVisitDayKey`, `color.questions`, `color.blocked`, notes as `{ key, vars }` (`report.note.*`),
  and `nextVisitBasis: 'trim'|'growth'|'visits'|'homeTrim'`, `styleTrimDays`, `visitFrequency`. `trimDays` is the
  style's interval scaled by the growth rate. Input params are normalised first (`cutCardParams`: zones 0..200, unknown
  line/finish/colour/mustache ids fall back), so a forged look cannot break the card.
- Reports: `<CutCardDocument data lang variant="screen"|"print"|"share" />`, `cutCardPdf(data, lang)`,
  `cutCardPng(data, lang)`, `printCutCard(data, lang)`, `cutCardFilename(dayKey, ext)`; data = `{ card, params, style,
  shop: { name, nameAr, logoUrl }, barber, client, approved: { at, decisionSeconds }, colors, guardChart }`.
  `dailyReportPdf(input)`, `printDailyReport(input)`, `dailyReportFilename(dayKey)`.
- `csv.js`: parse results carry `preview [{ row, values, ok, reasons }]`; exports take an options object and return
  `{ blob, text, filename, count }`; `productsTemplateCsv`.
- `share.js`: `shareFile(blob, filename, text)` -> `'shared'|'downloaded'|'cancelled'|'failed'`, `copyAndOpenWhatsApp(text,
  phone)` (call inside the tap handler with no await before it), `reminderText({ lang, shop, clientName, dayKey })`,
  `cutCardShareText({ lang, shop, style, card })`, `copyText`.
- `idb.js`: `pruneSaved(maxAgeDays)` for the retention setting (ShopRoute runs it with `settings.retentionDays` when the
  shop opens and once a day; `retentionDaysOf(settings)` is exported from src/state/ShopRoute.jsx). Also
  `savedSummary() -> { pairs, clients, byClient }`, `countSaved()`, `countSavedForClient(id)`, `deleteAllSaved()`,
  `deleteSavedForClient(id)`, `listSavedForClient(id)`, `subscribeSaved(cb) -> unsub`, `savedKeyClient(key)`.

### AI Worker (worker/)
- `POST /render` (multipart `source`, `guide`, `seed`, `shopId`; Bearer Firebase ID token; optional
  `X-Firebase-AppCheck`) -> image bytes + `X-Lihya-Used`, `X-Lihya-Cap`; 429 `{ error: 'cap', scope, resetsAt }`.
- `GET /quota?shopId=` -> `{ usedToday, cap, accountUsed, accountCap, enabled, allowed, day, resetsAt }` for the owner
  dashboard (UTC day = resets 04:00 Muscat). 403 codes: `email_not_verified` (token without a verified email),
  `not_allowed` (shop not on the allowlist: KV `ai:allowed:<shopId>` wins over the `AI_SHOPS` var). `renderFinalLook`
  maps both to `err.code === 'notAllowed'`.

### Integration additions
- `clients.listClients(shopId, { includeDemo })` (one-time read of every client, labels only, for exports) and
  `clients.watchDemoPresence(shopId, cb)` (true while any demo client or consultation is left).
- `invites.joinUrl(shopId)` (full join link via `appUrl`), `csv.parsePriceOmr(raw) -> { value, reason }`.
- `useSession().keepProfileConsent` (null = not asked) + `setKeepProfileConsent(b)`: the customer's answer on the
  profile screen; S12 saves the coarse labels with `saveClientProfile` only when it is true.
- `src/state/ErrorBoundary.jsx` wraps every route; `src/state/WriteErrorWatcher.jsx` shows a snackbar when the server
  refuses a queued write; `src/state/IdleWipeWatcher.jsx` returns to the mode's start screen after an idle wipe.
- `PREF_KEYS.purgeDay` (per-device marker so the retention purge runs at most once a day).
- AI facade also exports `MST_SWATCHES`, `clearRenderCaches`.

### Review fixes (October 2026)
Auth, language, sync
- `auth.signOutAndClear({ to = '/' })`: clears the IndexedDB session store, waits up to 4 s for queued writes, then
  `terminate(db)` and `clearIndexedDbPersistence(db)` (only when the writes synced, so offline work is never lost),
  `signOut(auth)` and a full load of `appUrl(to)`. Never rejects. Every sign-out button uses it.
- `safeNextPath(next, fallback)` also refuses control characters, DEL and backslashes, and resolves the path against
  the origin (which must match); `emailLinkUrl` uses it.
- `useT`: `hasLangPref()` (a saved choice exists on this device) and `setLang(lang, { persist = true })`. ShopProvider and
  PublicShopProvider apply `settings.defaultLanguage` / `info.defaultLanguage` with `persist: false` when the device has
  no saved choice. `shops/{id}/public/info` carries `defaultLanguage` ('ar'|'en'), copied by `updateSettings` and
  `createShop`.
- `sync.trackWrite(promise, label, { quietDenied })` and `db.commitOps(ops, label, opts)`: `quietDenied` refusals do not
  show the write-error snackbar (used by the count-once stats batches and the draft cancel).
- ShopProvider / PublicShopProvider show a "taking long" notice after 12 s of loading online (`shop.slow.*`), with Try
  again; the listeners keep running.

Consultations and stats
- `approveConsultation(shopId, id, { params, cutCard, decisionSeconds, aiPreviewUsed, startedAt, dayKey })` and
  `completeConsultation(shopId, id, { rating, nextVisitDays, addOns, startedAt, dayKey })`: the optional `startedAt` /
  `dayKey` books the stats on the visit's own Muscat day (approve.js and S13 pass `session.startedAt`).
  `cancelConsultation(shopId, id)` returns Promise<boolean> and never throws (the session wipe cancels an open draft).
- Count once: `approvalCountOps` / `addOnsCountOps` build a separate quiet batch that sets
  `consultation.approvalCountedAt` / `addOnsCountedAt` (serverTimestamp) with the stats increments; the rules accept
  each stamp once, so a reload, a restored snapshot or another device cannot count a consultation twice.
- `shops.floorDeltas(deltas, stats)`: `deleteDemoData` never takes a counter below 0. Rules: barbers can only raise
  counters; every counter is an int 0..1,000,000; `topStyles` has at most 100 keys.
- `purgeExpiredData` also deletes never-visited clients (`lastVisitAt == null`, `createdAt < cutoff`; composite index
  in firestore.indexes.json).

Clients and Look Codes
- Client docs carry `searchTokens` (word prefixes, Arabic article stripped, up to 15 chars / 80 tokens) and
  `phoneTokens` (4+ digit runs of the last 8 digits). `searchClients(shopId, text)` keeps its signature (array-contains
  on the longest word or the digits, plus the old `displayNameLower` prefix query for older docs; at most 10).
  model.js exports `PARAM_KEYS`, `STYLE_KEYS`, `nameTokens`, `phoneTokens`, `clientSearchFields`.
- `look.checkLookParams(raw, fallbackStyleId) -> { params, errors }` (clampParams then validateParams). `validateParams`
  requires `styleId` to match `/^[A-Za-z0-9_-]{1,80}$/`; `clampParams` keeps only known shape values (chin, lengthAdjustable,
  fadeB). `model.sanitizeParams` keeps only the 10 LookParams keys and bounds every value.
- `lookCodes.expiresAt` has a TTL policy (firestore.indexes.json). Rules check Look Code params strictly
  (`validLookParams(params, true)`); consultation params, cut cards, styles and client profiles are bounded too.
- Rules budget: Firestore evaluates at most 1,000 expressions per request. Keep per-zone range checks for Look Codes
  only; consultations use the lighter bounded checks. Measure with a padded request before adding checks.

Session (src/state/SessionContext.jsx)
- `useSession()` also returns `restoreLook(look, index, favorite = false) -> { ok, id?, reason?: 'max'|'exists'|'invalid' }`
  (Undo of a removed look: same id, thumbnail and position), `issuedCode` (`{ code, key, styleId, createdAt, expiresAt }`,
  the Try-at-home code of this visit, photo-free, kept in the snapshot) and `setIssuedCode(ic)`.
- Exports `cleanLookParams`, `cleanLookCode`, `cleanIssuedCode`, `onSessionRoutes`, `sameValue`. Every look that enters
  the session goes through `cleanLookParams`.
- Leaving the shop or /try routes wipes the session (provider unmount); a reload keeps the 10-minute snapshot. A wipe
  other than 'next' cancels the session's open draft consultation. Kept before/after photos follow `settings.retentionDays`.
- `home/codeCache.js` adds `rememberCode(shopId, entry)`. The barber's zone confirmations use the one table in
  `src/ai/analysis/zoneConfirm.js` (`ZONE_CONFIRM_DENSITY`, also re-exported by the facade).

Capture, Studio, entry
- profile.js: `SIDE_MIN_YAW`, `sideShotPose(shot)` (side shots under 20 degrees are not used as sides), `paintTurn()`
  (lets the step label paint between analysis steps).
- `src/screens/capture/capturePrefs.js` (Quick mode and the once-per-session white card, sessionStorage) and
  `manualCheck.js` (`manualShotWarnings`, pose and quality warnings for hand-shutter shots).
- `src/screens/studio/studioPrefs.js` (Live/Photo choice and the declined low-FPS offer, sessionStorage),
  `timelineSlider.js` (the growth slider's last stop = the final look).
- `renderStudio.lineGuides` / `src/ai/render/lineGuides.js`: projected cheek-line and neckline curves for the Studio's
  drag handles (Photo mode, Lines group open). `frame.faceAnnouncer` reports face found / lost for Live AR.
- PREF_KEYS adds `captureMode`, `whiteCard`, `studioPreview`, `studioLowFps` (per-session, sessionStorage).
- `ClientRow({ onEdit })` and `src/screens/entry/ClientSheet.jsx` (edit name and phone, delete the client's kept photos).

Cut Card, reports, owner
- cutcard.js exports `nextVisitPlan`, `trimIntervalDays`, `visitFrequencyDays`, `cutCardParams`, `needsVisitReplan`,
  `replanNextVisit`, `nextVisitChoices`, `NEXT_VISIT_CHIPS`. S13's chips come from `nextVisitChoices(card suggestion)`.
- `src/reports/jawRuler.js` (the Cut Card ruler along the Zone Diagram's jaw); CutCardDocument exports `colorLine` and
  `visitReason`. `formatPercent` prints the Latin % in both languages.
- The facade also exports `CUT_CARD_LANDMARKS`, `VISIT_DAYS` and `fetchAiQuota(shopId, { signal })` (ID token plus
  App Check, one retry on 401, 8 s timeout, null when unavailable). The owner dashboard reads the Worker's count through
  it (dynamic import of the facade) and falls back to `dailyStats.aiRenders` only as a labelled estimate.
- The PRD 11.3 clients import UI is `src/screens/owner/ClientImport.jsx` inside S20 Reports.

### Demo mode (GitHub Pages link without Firebase keys)
- `src/lib/appMode.js` (pure, no Firebase import): `resolveMode({ prod, hasRealConfig, usingEmulators, demoFlag })` ->
  `{ mode: 'emulators'|'demo'|'firebase'|'none', demo, configured }`, `hasCompleteConfig(config)`, `APP_MODE`, `demoMode`,
  `usingEmulators`, `firebaseEnvConfig`, `DEMO_FIREBASE_CONFIG`, `DEMO_USER`, `DEMO_SHOP`, `demoAppName(gen)`,
  `parseDemoGeneration(raw)`. Services and screen helpers that only need the flag import it from here.
- Firebase layer in demo mode: no Auth (`auth` is null), no App Check, Firestore network disabled at start (the SDK is a
  local database). `db.currentUser()` is `DEMO_USER`; `db.commitOps` resolves at once and is not tracked; `db.snapMeta(snap)`
  (used by every watcher, also `watchMyShops`) reports `{ hasPendingWrites: false, fromCache: false }`; every listener
  uses `db.LISTEN_OPTIONS` (demo: `source: 'cache'`, so an empty list or a missing doc answers at once in every tab);
  `readDoc` / `readQuery` read the cache only (a never-written doc is null); `trackQueuedWrites` does nothing;
  `markDemoClosing()` / `isDemoClosing()` keep listener errors quiet while Reset demo shuts Firestore down.
  `shops.createDemoShop()` (demo only, once per page load) = `createShop(DEMO_SHOP)`. `createInvite` resolves
  `{ ..., sent: false, demo: true }` without emailing. `createLookCode` skips anonymous sign-in. Every sign-in in auth.js
  resolves `DEMO_USER`, `getIdToken()` is null, `signOutAndClear()` is Reset demo. The AI Worker URL is '' (AI Final
  Look off, quota null).
- `src/state/DemoMode.jsx`: `DemoProvider` (App.jsx, around AuthProvider) and `useDemo()` -> `{ reset }` in demo mode, null
  otherwise. When Reset demo runs in another tab (`PREF_KEYS.demoGeneration` changes), the provider reloads this tab. The context object is `DemoContext` in `src/components/kit.js`, so the UI kit reads it without importing a
  service: `DemoPill({ className })` (src/components/DemoPill.jsx; TopBar, the S01 header, full-screen notices, S21,
  NotFound) and `SyncBadge` / `SyncStrip` (hidden in demo mode). Screens swap Sign out for `t('demo.reset')` when
  `useDemo()` is set. Strings: `src/lib/i18n/ns/demo.json` (`demo.*`).
- `PREF_KEYS.demoGeneration`: the demo database generation (the Firebase app is named `demoAppName(gen)`); Reset demo
  moves to the next one.
