# Dallni Prototype: Build Contract (v0.1)

This file is the single source of truth for module boundaries. Every module MUST follow it.
If you need to change it, change it here first and keep every module consistent.

Prototype goal: a trustworthy **3D mall map + navigation simulator** running in a phone browser.
Stack: React 18.3.1 + Vite 8 + Tailwind 4 + three.js 0.186.1 (plain, NO React Three Fiber) +
troika-three-text 0.52.5 + ngraph.graph / ngraph.path. No Firebase in this spike (static JSON bundle,
matching PLAN.md §10 "static files vs Firestore"). No localStorage for real data (prototype keeps
state in memory; device preferences may use sessionStorage/IndexedDB only).

Plain JavaScript (ESM, `.js` / `.jsx`), JSDoc types. No TypeScript.

---

## 1. Coordinates

- Data uses **venue-local metres**: `x` = east, `y` = north, origin = south-west corner of the building.
- Each level has an `elevation` in metres (floor-to-floor 5.5 m). Parking levels are negative.
- three.js mapping (engine only): `three.x = x`, `three.y = elevation * explode`, `three.z = -y`.
  `explode` is an engine view setting (1 = true scale; stack view uses a larger value).
- Angles: degrees, 0 = north (+y), clockwise positive (compass style).
- Polygons: arrays of `[x, y]`, counter-clockwise, **first point NOT repeated**.

## 2. Venue file: `public/venues/<venueId>/venue.json`

```jsonc
{
  "schema": "dallni.venue/0.1",
  "meta": {
    "id": "demo-muscat",
    "name": { "en": "Dallni Demo Mall · Muscat", "ar": "مول دلّني التجريبي · مسقط" },
    "disclaimer": { "en": "Fictional layout for prototype testing. Not a real mall.", "ar": "مخطط تجريبي خيالي لاختبار النموذج. ليس مولاً حقيقياً." },
    "version": 1,
    "units": "meters",
    "timezone": "Asia/Muscat",
    "defaultStartAnchorId": "A-G-ENT-S",
    "bounds": { "minX": 0, "minY": 0, "maxX": 0, "maxY": 0 }
  },
  "levels": [
    { "id": "L1", "ordinal": 1, "elevation": 5.5, "kind": "retail",
      "name": { "en": "Level 1", "ar": "المستوى الأول" }, "shortName": { "en": "L1", "ar": "١" },
      "outline": [[0,0], [120,0], [120,60], [0,60]] }
  ],
  "units": [
    { "id": "u-L1-07", "levelId": "L1", "kind": "shop", "polygon": [[...]], "occupantId": "occ-oud-house" }
  ],
  "openings": [
    { "id": "o-u-L1-07", "unitId": "u-L1-07", "levelId": "L1", "a": [x, y], "b": [x, y], "nodeId": "n-..." }
  ],
  "occupants": [
    { "id": "occ-oud-house", "category": "beauty",
      "name": { "en": "Oud House", "ar": "بيت العود" },
      "sign": { "en": "OUD HOUSE", "ar": "بيت العود" },
      "unitIds": ["u-L1-07"], "entranceNodeIds": ["n-..."],
      "keywords": { "en": ["perfume", "oud", "bakhoor"], "ar": ["عطور", "عود", "بخور"] },
      "hours": { "open": "10:00", "close": "22:00" },
      "landmarkScore": 2 }
  ],
  "amenities": [
    { "id": "am-G-wc-m", "levelId": "G", "category": "restroom_men", "point": [x, y], "nodeId": "n-...",
      "name": { "en": "Men's restroom", "ar": "دورة مياه الرجال" } }
  ],
  "connectors": [
    { "id": "esc-1-up", "type": "escalator", "direction": "up", "stepFree": false,
      "name": { "en": "Escalator E1 (up)", "ar": "السلم المتحرك E1 (صعود)" },
      "stops": [ { "levelId": "G", "nodeId": "n-...", "point": [x, y], "buttonLabel": { "en": "G", "ar": "أ" } },
                 { "levelId": "L1", "nodeId": "n-...", "point": [x, y], "buttonLabel": { "en": "1", "ar": "١" } } ] }
  ],
  "anchors": [
    { "id": "A-G-ENT-S", "code": "G01", "kind": "entrance", "levelId": "G", "point": [x, y], "nodeId": "n-...",
      "facingDeg": 0, "label": { "en": "South entrance", "ar": "المدخل الجنوبي" } }
  ],
  "landmarks": [
    { "id": "lm-fountain", "levelId": "G", "point": [x, y], "kind": "fountain", "landmarkScore": 3,
      "name": { "en": "Atrium fountain", "ar": "نافورة الردهة" } }
  ],
  "parking": {
    "zones": [
      { "id": "z-B1-blue", "levelId": "B1", "colorKey": "blue", "color": "#1E5BD8", "icon": "falcon",
        "label": { "en": "Blue · Falcon", "ar": "أزرق · صقر" }, "polygon": [[...]] }
    ],
    "bays": [
      { "id": "bay-B1-014", "code": "B1-14", "levelId": "B1", "zoneId": "z-B1-blue",
        "center": [x, y], "angleDeg": 0, "w": 2.5, "l": 5.0, "nodeId": "n-...", "accessible": false }
    ]
  },
  "graph": {
    "nodes": [ { "id": "n-G-001", "levelId": "G", "point": [x, y], "kind": "corridor", "refId": null } ],
    "edges": [ { "id": "e-0001", "from": "n-G-001", "to": "n-G-002", "kind": "walk",
                 "lengthM": 12.0, "oneWay": false, "stepFree": true, "connectorId": null } ]
  }
}
```

Rules:
- `node.kind` ∈ `corridor | door | connector | anchor | amenity | bay | entrance | parking_aisle`.
- `edge.kind` ∈ `walk | parking_walk | escalator | lift | stairs`. Connector edges link the
  connector's stop nodes on two levels and carry `connectorId`. Escalators are `oneWay: true`
  and `stepFree: false`. Lifts are two-way and `stepFree: true`. Stairs are `stepFree: false`.
- `lengthM` for walk edges = Euclidean distance between the two node points. For connector
  edges, `lengthM` = horizontal travel (escalator ≈ 12 m, lift 0).
- Every occupant has ≥1 unit and ≥1 entrance node. Every anchor, amenity and bay has a node.
- Every user-facing string is bilingual `{ en, ar }`. Arabic names must not contain Latin letters
  (they are drawn with an Arabic-only font in 3D). English signs are Latin only.
- Generated text (UI, step instructions) has one exception: **bay codes are shown exactly as painted**
  ("B1-43") in both languages, inside a left-to-right isolate (U+2066 … U+2069 in strings, `<bdi dir="ltr">`
  in the DOM), so they are never flipped and always match the floor paint (PLAN.md §9 RTL rules).
- **Fictional names only** (no real brands, no real mall). Category is one of:
  `fashion | food | cafe | electronics | beauty | kids | grocery | entertainment | home | health | services`.

## 3. Modules and their public functions

### `src/data/venue.js`
- `async loadVenue(url) -> VenueIndex`
- `indexVenue(venueJson) -> VenueIndex`
- `VenueIndex = { venue, levels (sorted by ordinal asc), levelById: Map, unitById: Map,
  occupantById: Map, amenityById: Map, anchorById: Map, connectorById: Map, landmarkById: Map,
  zoneById: Map, bayById: Map, nodeById: Map, edgesFrom: Map<nodeId, edge[]> }`

### `src/routing/` (pure JS, no DOM, no three.js; unit-tested in `tests/routing.test.js`)
- `route.js`: `findRoute(index, fromNodeId, toNodeId, { stepFree = false } = {}) -> Route | null`
- `Route = { nodeIds: string[], points: RoutePoint[], edges: edge[], lengthM, etaS, steps: Step[], stepFree }`
- `RoutePoint = { x, y, levelId, nodeId }` (one per node in the path, in order)
- `instructions.js`: `buildSteps(index, nodeIds, edges) -> Step[]`
- `names.js`: `bayCode(index, bay) -> { en: "B1-43", ar: "\u2066B1-43\u2069", arDigits: "ب١-٤٣" }`;
  `plateLabel(index, anchor) -> { en, ar }`: a parking plate's label with the bay it names written as painted in an
  LTR isolate («... بجانب الموقف ⁦B1-102⁩»), used for step text, you-are-here and the scan lists;
  `labelWithoutLevel(index, label, levelId)` drops a trailing level part ("Food court · Level 1" -> "Food court")
  for sentences and level-grouped lists.
- `Step = { index, kind: 'start'|'walk'|'turn'|'connector'|'arrive', levelId,
  text: { en, ar }, distanceM, etaS, from: number, to: number /* indices into points */,
  landmark: { id, name:{en,ar} } | null, connector: { id, type, toLevelId, buttonLabel:{en,ar} } | null,
  turn: 'straight'|'slight_left'|'slight_right'|'left'|'right'|'uturn'|null }`
- Speeds (for ETA): walk 1.2 m/s, escalator 0.5 m/s + 5 s, lift 45 s wait + 4 s per floor, stairs 15 s per floor.
- Turn classes by angle: <30° straight, 30–60° slight, 60–135° turn, >135° U-turn. Left/right from the
  WALKING direction. Merge consecutive straight segments. Landmark = highest `landmarkScore` occupant or
  landmark within 15 m of the turn node on the same level.
- Text templates are separate per language, never stitched across languages. Arabic uses Arabic-Indic
  digits for distances in Arabic text (e.g. «٤٠ م»).

### `src/search/` (pure JS; unit-tested in `tests/search.test.js`)
- `normalize.js`: `normalize(str) -> string` (Arabic: strip tashkeel + tatweel; أ إ آ ٱ → ا; ة → ه; ى → ي;
  ؤ → و; ئ → ي; Arabic-Indic digits → ASCII; optional leading "ال" stripped; Latin: lowercase, strip
  accents, `&` → `and`, remove spaces/apostrophes for compact match).
- `search.js`: `createSearch(index) -> (query: string, lang: 'en'|'ar') -> Result[]`,
  `Result = { type: 'occupant'|'amenity'|'category'|'anchor'|'connector', id, name:{en,ar}, levelId, score }`
  (`connector` = lifts, escalators, stairs; `levelId` null because they serve several levels).
  Matches names, sign text, keywords, categories, and synonyms (toilet/washroom/restroom/حمام/دورة مياه;
  prayer/musalla/مصلى; atm/صراف; pharmacy/صيدلية; parking/موقف/مواقف; cinema/سينما; food/مطعم/مطاعم;
  goods with singular and plural forms: perfume/عطر/عطور, shoes/حذاء/أحذية, glasses/نظارة/نظارات,
  gifts/هدية/هدايا, watches/ساعة/ساعات; lift/elevator/مصعد, escalator/سلم متحرك, stairs/درج).
  A query that is exactly a synonym ranks its targets above places whose name merely starts with it.

### `src/engine/` (three.js; DOM only through the canvas container)
Singleton, render-on-demand (no continuous loop when idle).
- The engine is **lazy**: the app imports `engine` from `src/engineHost.js`, a stand-in with the same
  API that queues commands (and `onPick` / `onRender` subscriptions) until `src/engine/engine.js` has loaded,
  returns defaults for queries, and exposes `enginePromise` (MapView mounts the canvas through it; it rejects
  when the chunk cannot be downloaded). Nothing downloads until `loadEngine()` is called: the App calls it once
  the venue is loaded and the first screen is up (requestIdleCallback). Build output: `engine3d-*.js` (three +
  troika, budget 220 KB gzip) and `scene3d-*.js` (src/engine, budget 50 KB gzip), checked by
  `tools/check-budgets.mjs` after every `npm run build`.
- No WebGL: `mount()` throws (the app shows its fallback), the engine frees what it built and every command
  becomes a no-op (`isFailed() -> true`); troika text is only typeset once a WebGL renderer exists.
- `src/engine/tokens.js` holds the plain colour constants (`CATEGORY_COLORS`, `PIN_COLORS`, `amenityGroup`) and
  the parking zone pictograms (`ZONE_ICON_PATHS`); it imports nothing, so screens use it without loading three.js.
- `engine.js` exports `createEngine() -> Engine` and a default singleton `engine`.
- `Engine`:
  - `mount(containerEl)`, `unmount()`, `dispose()`
  - `setVenue(index)`: builds the scene (slabs, walls, storefront facades + sign boxes with troika text,
    atrium void, escalators, lifts, landmarks, parking bays as InstancedMesh per level, zone colour decals,
    pillars with zone bands, anchors as small plates)
  - `setLanguage('en'|'ar')`, `setTheme('sunlight'|'basement')`
  - `setView({ mode: 'stack'|'floor'|'top', levelId, fit?: 'level'|'route'|'none' })`: `stack` = levels
    exploded (overview); `floor` = one level solid, others hidden/ghosted; `top` = 2D top-down of the focused
    level. While a route over several levels is shown, `stack` shows only the route's levels, 12 m apart, and
    every route level above the lowest is see-through; each route run also gets an x-ray copy (no depth test,
    dotted) so no part of the route is hidden. `getView() -> { mode, levelId, blend, stackLevels }`.
  - `showRoute(route | null)`: ribbon 1.2 m wide, 5 cm above floor, route blue with white casing;
    other-level parts dotted/faded; vertical light column at connectors.
  - `setActiveStep(stepIndex)`: highlight that step's segment (a zero-length "Start at" step highlights the first
    walk); fly the camera to frame it (1.2 s). The fitted pose is then panned so the step's key points (where it
    ends: the corner, the lift / escalator it boards, the destination or the car; where it starts; the landmark it
    names) are not under a control, the sheet or the screen edge (`setScreenObstacles` rects + 16 px). The step's
    landmark and connector join the always-shown labels.
  - `setMarker(kind: 'you'|'car'|'dest'|'walker', value | null)` where
    `value = { levelId, x, y, headingDeg?, state?: 'exact'|'estimated'|'lastSeen', elevation?, connectorId? }`.
    Markers are drawn in a second pass after the depth buffer is cleared: walls, gates, glass and upper floors
    never hide them. Heights are never guessed from x/y: only an explicit `elevation` (true-scale metres) or,
    for the walker, the escalator named by `connectorId` lifts a marker off its level floor. The `dest` marker
    stands in front of the destination's own sign; `state: 'arrived'` draws its green ring alone and hides the
    route under and beyond it. The `car` marker (pass `headingDeg` = the bay's `angleDeg`) stands toward the back
    of its bay so the painted code at the bay mouth stays readable. Markers keep a minimum and a maximum
    on-screen size. The App sends no `dest` marker when the destination is the saved car.
  - `flyTo({ levelId, x, y, h?, distance?, tiltDeg?, headingDeg?, clear? }, durationMs = 1200)` (`h` = target
    height above the floor; `clear: [{ x, y, levelId?, h?, pin? }]` = map points that must not end up under a
    control: the pose is panned to keep them clear)
  - `flyToBay({ levelId, x, y, angleDeg, w, l }, durationMs?)`: find-my-car arrival: looks into the bay from the
    aisle (heading = `angleDeg`), the painted code upright in front of the car, closer than 25 m so the codes
    show, the code and the car clear of the controls.
  - `flyToShopFront({ levelId, x, y }, durationMs?) -> boolean`: arrival view facing the destination's sign,
    close enough that both sign lines read (Latin >= 14 px, Arabic >= 16 px) on any screen size, with the arrival
    ring above the sheet.
  - `setViewportPadding({ top, right, bottom, left })`: screen space taken by UI, so fits frame the free area.
  - `setScreenObstacles([{ x, y, w, h }])`: screen rectangles covered by UI (header, map controls, sheet);
    labels and pins never draw under them (camera moves also keep key points clear of them, see above). Level
    labels in stack view are laid out as one column growing outward from the slab corners (reading-start side,
    which the stack fit keeps free), never dropped (short codes for the whole column when the names do not fit
    outside the slabs). The destination's name (placed by its marker) and the step's landmark / connector are
    always shown: they move to the nearest free spot instead. Other names keep off the route of the current and
    next step (the whole route on a preview) and at most one per 80 x 40 px cell. In stack view a marker below the
    top floor shown gets a level badge ("B1").
  - `setScanPins(true | string[] | null)`: QR plate pins (tappable, `onPick` -> `{ type: 'anchor', id }`) while a
    scan sheet is open: every plate, only these anchor kinds (e.g. `['parking_pillar']`), or none.
  - `onPick(cb)`: cb receives `{ type: 'occupant'|'amenity'|'anchor'|'bay'|'connector', id }` on tap
    (screen-space hit test, 44 px radius around label anchors).
  - `requestRender()`; `getStats() -> { drawCalls, triangles, frameMs }`
  - `setFollow(boolean)`: camera follows the `walker` marker smoothly.
- World-space sign text is hidden while it would render under 14 px (Latin) / 16 px (Arabic); a sign shows
  only the active language when the band is too tight for two readable lines. Two-line signs are stacked from
  the measured ink of each line (gap = 6 % of the band, the pair at most 86 % of it), so Arabic descenders never
  touch the Latin line. Floor-painted zone names that would read sideways are hidden (their pin label stays).
- Fonts for troika: import with `new URL('../assets/fonts/readex-latin-600.woff', import.meta.url).href`
  (Latin) and `readex-arabic-600.woff` (Arabic). Each sign = two text meshes (AR line + EN line), the
  active UI language on top at 100%, the other at 70%. Never let troika fetch fonts from a CDN: every string
  passes `textGuard.drawableText(str, lang)` (only code points in the generated `fontCoverage.js`; English = the
  Latin font, Arabic = the Arabic font then the Latin one), `tools/validate-venue.mjs` refuses venue text the
  fonts cannot draw, and the build replaces troika's unicode-font-resolver with a stub that never fetches
  (`vite.config.js`). Regenerate the coverage with `npm run gen:fonts` when the font files change.
- Colours: PLAN.md §9 and §19.2 tokens. Category colours: fashion #AD1457, food #C2410C, cafe #8D5524,
  electronics #6D28D9, beauty #BE185D, kids #0E7C86, grocery #15803D, entertainment #7C3AED,
  home #92400E, health #0E7490, services #475569. Zone colours come from the data.

### `src/sim/` (pure logic + a tiny rAF driver)
- `simulator.js`: `createSimulator({ route, speedMultiplier = 1 }) -> Sim`
  - `Sim.tick(dtSeconds) -> SimState` (pure, testable), `play()`, `pause()`, `setSpeed(mult)`,
    `seekStep(i)`, `onChange(cb)`, `dispose()`
  - `SimState = { levelId, x, y, headingDeg, distanceDoneM, distanceTotalM, stepIndex, onConnector: bool,
    done: bool, elapsedS }` plus extras (`elevation`, `connectorType`, `connectorId`, `phase`, `rideProgress`,
    `rideToLevelId`, ...). Consecutive connector edges of one connector are **one ride** (one lift wait); while
    riding, `levelId` stays the boarding level and becomes the exit level when the ride ends, so no intermediate
    floor is ever announced.
  - Walk 1.2 m/s × multiplier. Connectors: escalator moves at 0.5 m/s horizontally while elevation
    interpolates; lift waits (compressed to 4 s in sim) then moves.
- The simulator is clearly labelled **SIMULATION** in the UI. It is not live positioning.

### `src/i18n/`
- `strings.js`: `t(key, lang)`, `dirFor(lang)`, `formatDistance(m, lang)`, `formatDuration(s, lang)`,
  `toArabicDigits(str)`.

### `src/ui/` + `src/App.jsx` + `src/main.jsx`
React screens (one task per screen, 56 px primary buttons, bilingual toggle "ع / EN" in the header):
`home` (you-are-here chip, search, 6 tiles: Food, Restrooms, Prayer, Pharmacy, Kids, Exit/Taxi; My car chip)
→ `place` (name, level, minutes, step-free toggle, GO) → `navigate` (3D map + step card + Next/Back +
SIMULATE controls: play/pause, speed 1×/2×/4×) → `arrived` (Found it ✓, Back to my car, Another shop).
`car` flow: simulated "Scan parking plate" → Save my car → Car Card (zone colour + icon + bay code,
bilingual) → "Take me there".
`scan` sheet: choose a QR plate (anchor) from a list or tap one on the map → sets you-are-here (exact).
Views: one 56 px View control (menu: Overview (stack) / Floor / 2D top) at the start edge, the level picker at
the end edge (capped to the space above the sheet; when it scrolls, a fade and a chevron show the hidden levels
and the active level is scrolled into view). Primary buttons of the place, arrived and car sheets are pinned in
the sheet footer (always fully visible); the rest scrolls above them on short screens.
No 3D (`MapView` `onError({ kind: 'webgl' | 'load' })`): the map controls are hidden, a notice sits above the
sheet ("can't run on this phone", or "Couldn't load the 3D map" + Try again) and every sheet keeps working. Theme switches to `basement` automatically when the
focused level is a parking level. Ending a route offers Undo for 5 s instead of a confirmation.
Header badge: "PROTOTYPE · SIMULATION".

Test hooks (for screenshots): URL params `?lang=ar|en&screen=home|place|navigate|arrived|car&from=<anchorId>
&to=<occupantId|amenityId|bayId>&view=stack|floor|top&simT=<seconds>&stepFree=1`, and `window.__dallni`
exposing `{ engine, getState(), setState(partial) }`.

## 4. Quality bars

- `npm run build` passes (including `tools/check-budgets.mjs`: first screen <= 110 KB, engine3d <= 220 KB,
  scene3d <= 50 KB, both <= 260 KB, sign fonts <= 50 KB, any font <= 50 KB, all gzip); `npm test` passes;
  `node tools/validate-venue.mjs public/venues/demo-muscat/venue.json` passes.
- Idle scene renders 0 frames (render-on-demand). Dispose geometries/materials on venue change.
- Every primary button ≥ 56 px tall; nothing interactive < 44 px.
- RTL: layout mirrors in Arabic; turn arrows and left/right words are NOT mirrored (they follow walking direction).
- No network calls at runtime except same-origin static files.
