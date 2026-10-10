# Dallni Prototype: Build Contract (v0.1, with the v0.2 additions in section 3b)

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
  troika, budget 220 KB gzip) and `scene3d-*.js` (src/engine, budget 60 KB gzip since v0.3, see 3c), checked by
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
    close enough that both sign lines read (Latin >= 14 px, Arabic >= 16 px) on any screen size, the sign's text clear
    of the controls (the text's measured width, not the whole sign box: on a 360 px phone the box is wider than the gap
    between the View control and the level picker), with the arrival ring above the sheet when it fits. Called before
    the sign's text is typeset (a deep link), it frames again once the text is measured, unless the camera has moved.
  - `setViewportPadding({ top, right, bottom, left })`: screen space taken by UI, so fits frame the free area.
  - `setScreenObstacles([{ x, y, w, h, kind? }])`: screen rectangles covered by UI (header, map controls, sheet);
    labels and pins never draw under them (camera moves also keep key points clear of them, see above). The bottom
    sheet's rect carries `kind: 'sheet'`: the map ends at its top edge, so nothing whose anchor is below it is drawn
    and nothing slides below it (level labels included). Level
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
the end edge (capped to the space above the sheet in whole buttons, compact 48 px ones when the 56 px ones do not all
fit, and it scroll-snaps to whole buttons; when it scrolls, a fade and a chevron inside the picker show the hidden
levels, and the active level is kept whole in view, clear of the fades, also when the cap changes; hidden when not
one level fits, e.g. under a full sheet).
Bottom sheets fold (src/ui/Sheet.jsx, src/ui/sheetModel.js): peek (handle + the screen's one head row + its pinned
primary action: home = search bar; place = name + GO; navigate = turn icon + instruction + Next, End route the X in
the handle row; car = one zone / bay / level row + Take me there; arrived = tick + place + Found it), half (default;
its top edge never above the middle of the screen, cut at a row boundary; a hairline and chevron under the last row
when more is hidden) and full (under the header); drag the handle, head or footer (touch and mouse; a body drag
follows its first finger only), flick, tap / Enter on the handle (a 44 px button whose `aria-expanded` matches its
"Expand panel" / "Fold panel" label; a sheet with one snap hides it), Escape folds (not from a text field that has
text); the search sheet goes to full when the shopper types or focuses its field; the body scrolls only at the top
snap. The snap is UI state in the App (reset per
sheet, never stored); `?sheet=peek|half|full` and `window.__dallni.setSheet(snap)` set it. After each snap the App
sends the engine the free area above the sheet (`setViewportPadding`, `setScreenObstacles`), only when it changed:
the engine renders one frame per snap and stays at 0 frames while idle. Primary buttons of the place, arrived and
car sheets are pinned in the sheet footer (always fully visible, >= 56 px, at every snap).
No 3D (`MapView` `onError({ kind: 'webgl' | 'load' })`): the map controls are hidden, a notice sits above the
sheet ("can't run on this phone", or "Couldn't load the 3D map" + Try again) and every sheet keeps working. Theme switches to `basement` automatically when the
focused level is a parking level. Ending a route offers Undo for 5 s instead of a confirmation.
Header badge: "PROTOTYPE · SIMULATION".

Test hooks (for screenshots): URL params `?lang=ar|en&screen=home|place|navigate|arrived|car&from=<anchorId>
&to=<occupantId|amenityId|bayId>&view=stack|floor|top&simT=<seconds>&stepFree=1`, and `window.__dallni`
exposing `{ engine, getState(), setState(partial) }`.

## 3b. v0.2 additions (glass + first-person)

The look, layout and motion are specified in [`DESIGN-GLASS.md`](./DESIGN-GLASS.md); this section is the API the
engine builder implements and the UI builder calls. **Every v0.1 API above keeps working with the same signature and
behaviour** (only colours change with the default style). Data, routing, steps, search and simulator modules are not
touched. The Walk view is a SIMULATION inside the 3D model (not camera AR, not live positioning) and the UI labels it
so at all times.

### Units and spaces (same as section 1 unless stated)

- Map points: venue metres `{ levelId, x, y }` (x east, y north). Heights `h`: metres above that level's floor as it
  is drawn (in stack view: above the stacked slab), never scaled.
- Angles: degrees, compass (0 = north, clockwise). `pitchDeg`: 0 = horizontal, negative = looking down.
- Screen: **CSS pixels relative to the canvas container's top-left corner**, y down (the same space as
  `projectToScreen`, `setScreenObstacles` and `setViewportPadding`).

### Engine (`src/engine/engine.js`, and the stand-in `src/engineHost.js`)

All commands are no-ops once WebGL has failed (`isFailed()`), are queued by `engineHost` before the chunk loads (any
unknown name is already queued as a command), and request at most one render (except `setPathAnimating(true)`, which
runs frames while the walk plays, and the camera moves they start).

- `setSceneStyle(style: 'storm' | 'classic')`. Default **`'storm'`**. `storm` = palette tables `THEMES.storm` /
  `THEMES.stormBasement`, procedural sky pass, floor sheen, fresnel storefront glass, desaturated sign boxes
  (DESIGN-GLASS section 5). `classic` = the v0.1 look exactly. Re-resolves colour keys without rebuilding geometry.
  `getSceneStyle() -> 'storm' | 'classic'`.
- `setTheme('sunlight' | 'basement')`: unchanged meaning (retail vs parking colours), applied inside the current
  style; the App still switches to `basement` when the focused level is a parking level.
- `setView({ mode: 'stack' | 'floor' | 'top' | 'fpv', levelId?, fit? }, { durationMs? })`:
  - `'fpv'` = first-person **Walk view**: the camera stands at eye height on the `walker` marker and follows it every
    frame (smoothing, look-ahead, escalator ride, lift/stairs cut, comfort rules: DESIGN-GLASS 6.1 to 6.4). With no
    walker it stands on the `you` marker, else the active step's start, else the route start, else the venue's
    default start anchor, facing the route point 5 m ahead (or the anchor's `facingDeg`); the App sends its own stand
    heading with `flyTo` (DESIGN-GLASS 6.1). `levelId` is used only when there is nothing to stand on; `fit`
    is ignored. Entering from a map view = 1.1 s dive, leaving = 1.2 s rise; `opts.durationMs` overrides both (0 = cut,
    used for deep links); cuts under `prefers-reduced-motion` (as is every map flight there). The eye never slides
    through floors: a goal on another level outside a ride, or a jump of more than 3 m, is a cut.
  - In `'fpv'`: OrbitControls are off; one-finger drag = look around (yaw/pitch offsets, spring back while the walk
    plays), double-tap recentres, taps still go to `onPick`; no pan, no zoom. Only the walker's level (plus the
    adjacent retail levels, seen through voids, and the exit level during an escalator ride) is drawn; the
    Walk-view-only geometry (ceiling with void/skylight holes, bulkheads, light panels, floor streaks, fog) is built
    lazily on first entry and disposed with the venue. The walker marker is not drawn; overlay labels are limited to
    the forced ones.
  - `getView()` returns `mode: 'fpv'` (with `blend: 0`, `stackLevels: null`) while in the Walk view.
- `setFpvOptions({ eyeHeightM?: number, fovDeg?: number, pitchDeg?: number })`: partial update, merged.
  Defaults **1.6 m, 70° (vertical), -5°** (QA round 1: -10° hid the corridor ahead behind the top HUD); clamps 1.2 to 2.0 m, 50° to 85°, -25° to +5°. `fovDeg` is reduced
  automatically so the horizontal FOV stays <= 80°. Applies from the next frame. `getFpvOptions()` returns the
  current values.
- `setPathStyle(style: 'glow' | 'ribbon')`. Default **`'glow'`**: 1.4 m teal-green ribbon (true size in the Walk
  view, >= 11 px on maps) with a translucent body, bright rims, soft outer glow and white chevrons (DESIGN-GLASS 5.7).
  `'ribbon'` = the v0.1 ribbon. Independent of the scene style.
- `setPathAnimating(on: boolean, opts?: { flowMps?: number })`. Chevrons flow forward along the route and the target
  ring ripples **only while `on` is true**; `flowMps` (default 1.8, clamped 0.3 to 6) is the chevron speed in metres
  per second (the UI passes `1.2 · simSpeed + 0.6`). While on, the engine renders continuously, but only while it is
  mounted, a route is shown and `document.visibilityState === 'visible'` (it pauses itself otherwise and resumes when
  those hold again). When off: static chevrons and back to render-on-demand (idle = 0 frames). Ignored under
  `prefers-reduced-motion: reduce` (chevrons stay static).
- `setNextTurn({ levelId, x, y, label?: { en, ar }, kind?: 'turn' | 'connector' | 'arrive' } | null)`. Places the
  **target ring + beam** (DESIGN-GLASS 5.8) on the floor at that point and makes it the `nextTurn` anchor. `kind:
  'arrive'` draws it in the destination colour (in `'fpv'` the destination pin and the destination's own name are then
  not drawn: the ring and the bubble on its beam mark it). `label` is drawn by the engine only in `'floor'` / `'top'`,
  as a forced overlay label beside the ring (obstacle-aware); never in `'fpv'` (the UI's DOM bubble; the engine keeps
  other names clear of the bubble's icon and box) or `'stack'` (the ring is hidden in stack view). `null` removes the
  ring and the anchor. Kept across view changes; cleared by `showRoute(null)`. In `'fpv'` with a route shown and no
  next turn (Arrived) the whole route counts as walked (no path, no connector poles drawn), and when the `dest` marker
  is `state: 'arrived'` the engine stands the target ring in the destination colour at its doorstep instead of the
  flat arrival ring.
- `onAnchors(cb) -> unsubscribe` and `getAnchors() -> Anchors`:

  ```js
  /** @typedef {object} AnchorPoint
   *  @property {number|null} x, y          CSS px of the bubble anchor: the point lifted 2.2 m above its floor
   *                                         (the top of the ring beam). null only when the level is not loaded.
   *                                         Off-screen points keep their raw projected values (may be outside
   *                                         the canvas); behind-the-camera points: see relBearingDeg.
   *  @property {number|null} floorX, floorY CSS px of the same point on the floor (h = 0.05 m)
   *  @property {boolean} visible           in front of the camera AND inside the free viewport (canvas minus
   *                                         setViewportPadding) AND its level is displayed
   *  @property {boolean} behind            camera-space depth <= 0 (x, y are then not meaningful). The UI tells a
   *                                         point behind the camera plane but still ahead (|relBearingDeg| <= 90, or
   *                                         the eye on it: under 2 m) from one really behind (DESIGN-GLASS 6.5)
   *  @property {number} relBearingDeg      horizontal angle from the view direction to the point, -180..180,
   *                                         positive = to the right; always valid (use it to clamp off-screen)
   *  @property {number} distanceM          metres along the shown route from the walker's route position (riding an
   *                                         escalator: projected onto that escalator's edge; in 'fpv' with no walker:
   *                                         where the eye stands; else the route start) to the point's projection on the
   *                                         route; straight-line metres from the walker / you marker / camera
   *                                         target when the point is not on the route
   *  @property {string} levelId
   */
  /** @typedef {object} Anchors
   *  @property {number} frame                         engine frame counter of the frame these belong to
   *  @property {'stack'|'floor'|'top'|'fpv'} mode
   *  @property {{ headingDeg: number, pitchDeg: number, fovDeg: number }} camera
   *            headingDeg = compass heading of the view direction (drives the heading-up mini-map and compass)
   *  @property {AnchorPoint|null} nextTurn            from setNextTurn (null when none)
   *  @property {AnchorPoint|null} destination         the 'dest' marker; else the shown route's last point; else null
   *  @property {{ x: number|null, y: number|null, visible: boolean, headingDeg: number, levelId: string,
   *              mapX: number, mapY: number } | null} walker
   *            x, y = CSS px of the walker marker (h = 0.3 m), null and visible = false in 'fpv' (the camera is the
   *            walker); headingDeg = walker heading of travel; mapX, mapY = venue metres; null when no walker marker
   */
  ```

  - **When**: synchronously at the end of **every rendered frame**, after the `onRender` callbacks, in subscription
    order. Never on a timer and never when no frame renders: idle = 0 calls. At most once per frame.
  - **No extra renders**: computing anchors is projection only (a few vector multiplies, < 0.1 ms) and never requests
    a frame. A callback must not cause a render loop: engine commands called from inside an `onAnchors` (or
    `onRender`) callback are deferred to a microtask after the frame, and `requestRender` from there is coalesced
    into the next scheduled frame.
  - Each call receives a new plain object; do not mutate it. Callbacks write to the DOM directly (transforms), never
    `setState` per frame.
  - `getAnchors()` returns the anchors of the last rendered frame; before any frame (or after `setNextTurn` without a
    frame yet) it computes them from the current camera without rendering.
- Existing APIs in `'fpv'`:
  - `setFollow(on)`: ignored in `'fpv'` (it always follows); keeps its v0.1 meaning in map views.
  - `setActiveStep(i, opts)`: highlights the step as before; with no walker it glides the eye to the step's start
    facing along it (900 ms; `opts.fly === false` = no move). No map-style flight.
  - `flyTo(p)`: moves the eye to `(p.x, p.y)` on `p.levelId`, facing `p.headingDeg` if given.
  - `flyToShopFront(p) -> boolean`: first-person arrival framing (stand 8 m in front of the sign, facing it, its
    centre at 25 % of the free area, both sign lines readable and the arrival ring above the Arrived sheet:
    DESIGN-GLASS 6.3; where a wall or the atrium void is closer than 6 m, turned up to 60° along the corridor:
    `interior.arrivalStand`); returns true when a sign was framed.
  - `flyToBay(bay)`: stand in the aisle 6 m from the bay mouth, facing into the bay, pitch -14°.
  - `setViewportPadding(p)`: shifts the principal point to the centre of the free area (view offset), as in map views.
  - `setScreenObstacles(rects)`, `onPick(cb)`, `pickAt`, `projectToScreen(p)`, `onRender(cb)`, `whenIdle()`,
    `getStats()`: unchanged, valid in every mode.
  - `getCameraPose()` in `'fpv'`: `{ x, y, distance: 0, tiltDeg: pitchDeg, headingDeg, levelId, eye: true }` (x, y =
    eye position in venue metres).
- Connector rides in `'fpv'`: the engine recognises a ride from the walker marker's `connectorId` (sent by the App
  while riding, v0.1) and the venue connector's `type`. Escalator: the eye rides the ramp. Lift / stairs: the camera
  does not slide vertically (the marker's `elevation` is ignored for the eye); when the ride ends (the walker marker
  arrives without `connectorId`, on the exit level) the engine **cuts** to the exit stop facing the next segment. The
  fade card is the UI's (DESIGN-GLASS 6.2).
- Budgets: `scene3d` <= **52 KB** gzip (raised from 50 KB in QA round 2, reported: the Walk view's world fidelity, i.e.
  floor tiles, wall gradient, lit shop interiors, glass escalator balustrades and the arrival ring, plus the arrival
  stand and the pointer and context-loss fixes, did not fit in the 150 bytes left), `engine3d` <= 220 KB, both <= 260 KB.
  If engine code does not fit, report it; do not raise a budget silently.

### `src/engineHost.js`

- Add `'onAnchors'` to `SUBSCRIPTIONS`.
- Add to `QUERY_DEFAULTS`: `getAnchors: () => ({ frame: 0, mode: 'stack', camera: { headingDeg: 0, pitchDeg: -32,
  fovDeg: 30 }, nextTurn: null, destination: null, walker: null })`, `getSceneStyle: () => 'storm'`,
  `getFpvOptions: () => ({ eyeHeightM: 1.6, fovDeg: 70, pitchDeg: -5 })`.
- `getView` default stays (`mode: 'stack'`).

### UI (`src/ui/`, `src/App.jsx`, `src/i18n/`)

- `view.mode` in App state may be `'fpv'`; the View menu gets a 4th option "Walk view" (`view.fpv`) while a route is
  shown (navigate, arrived), and the navigate screen gets a floating "Walk view" pill. In `'fpv'` the navigate sheet
  is replaced by the Walk view HUD (stat chips, turn card, SIMULATION capsule, level chip, turn bubble, half-dome
  mini-map, bottom bar: DESIGN-GLASS 7); the header and the level picker are hidden; Arrived keeps the Walk view with
  the glass Arrived sheet.
- Suggested new files: `src/ui/WalkHud.jsx` (top HUD + bar), `src/ui/TurnBubble.jsx`, `src/ui/MiniMapDome.jsx`
  (Canvas2D from the VenueIndex + simulator state, works without WebGL), `src/ui/LiftCard.jsx`.
- Calls while in `'fpv'`: `setViewportPadding` / `setScreenObstacles` from the measured HUD; `setNextTurn` on every
  step change (end point of the current step; connector board point; `null` on Arrived);
  `setPathAnimating(playing, { flowMps: 1.2 * speed + 0.6 })` on play / pause / speed / done (also in map views while
  the walk plays); `onAnchors` drives the bubble and the mini-map heading.
- In `'fpv'` the App does **not** call the map follow-camera moves of v0.1 (the `flyTo(... FOLLOW)` in `handleSim` and
  `playSim`, `setFollow`): the engine follows the walker by itself. Deep links with `simT` keep the walk paused, so
  `whenIdle()` settles for screenshots (it never settles while `setPathAnimating(true)`).
- `src/i18n/strings.js`: the keys of DESIGN-GLASS Appendix A; new pure formatters `formatClock(epochMs, lang,
  timeZone)`, `formatSteps(metres, lang)`, `formatMinutesParts(seconds, lang)` (unit-tested).
- URL hooks: `view=fpv`, `style=classic|storm` (calls `engine.setSceneStyle`; default storm).
- Fonts: `@fontsource/readex-pro` weights 300, 400, 500 (Latin + Arabic CSS imports) + the bundled 600 faces; 700 is
  no longer imported. Still same-origin only.

## 3c. v0.3 additions (toy world)

Look, light, shadows and UI values: [`DESIGN-TOY.md`](./DESIGN-TOY.md). Every API above keeps its signature.

- **`setSceneStyle(style)`.**
  - Accepts `'toy' | 'storm' | 'classic'`; the default is **`'toy'`**.
  - Toy is lit:
    - palettes `THEMES.toy` / `THEMES.toyBasement`;
    - Lambert vertex-coloured opaque, roof and plate meshes with normals;
    - a hemisphere + sun rig;
    - 6 cm bevels on convex prisms.
  - Meaning colours stay unlit and exact (sign faces, QR faces, zone bands in an `exact` mesh; route, rings, markers,
    pins and text as before).
  - Toy builds different geometry. Switching to or from toy after `setVenue` rebuilds the venue, and the route and
    markers must then be sent again. So the App sets the style **before** `setVenue`. Storm ↔ classic still recolours
    in place.
  - `getSceneStyle()` returns the style.
- **`setQuality('showcase' | 'light')`, `getQuality()`.**
  - **Showcase:** soft sun shadows (toy only, never in `stack`), pixel ratio up to 2.
  - **Light:** no shadows, pixel ratio up to 1.5.
  - The App picks the level per device with `pickQuality` (`src/quality.js`, outside the 3D chunk). `?quality=` overrides it.
  - The engine drops to `light` by itself after 8 consecutive animation frames more than 45 ms apart. That covers
    flights, controls damping and the walk, and it is measured frame to frame, so a GPU-bound phone counts too.
  - The sun always stands south-east of the shown levels. Shadows are off in `stack` and while a stack blend animates.
  - The shadow map is redrawn only when what is shown changes (mode, levels, blend, venue, the Walk view's floor, a
    restored context), never on a camera move. Idle stays 0 frames.
  - `getStats()` gains `sun: { dir, shadowDraws }`.
- **Builders.** `buildRetailLevel`, `buildParkingLevel`, `buildEscalator` and `buildLiftColumn` take a last
  `flavour = { bevel, lit }` argument (default `PLAIN`, as before). The Walk view interior stays unlit in every style. A level build gains `exact` (a MeshBuilder,
  empty unless lit).
- **engineHost defaults:** `getSceneStyle: () => 'toy'`, `getQuality: () => 'showcase'`.
- **URL hooks:** `style=toy|storm|classic`, `quality=showcase|light`.
- **Budgets:** `scene3d` <= **60 KB** (raised from 52 KB in v0.3, reported to Sam), `engine3d` <= 220 KB, both <= 260 KB,
  first screen <= 110 KB.

## 4. Quality bars

- `npm run build` passes (including `tools/check-budgets.mjs`: first screen <= 110 KB, engine3d <= 220 KB,
  scene3d <= 60 KB, both <= 260 KB, sign fonts <= 50 KB, any font <= 50 KB, all gzip); `npm test` passes;
  `node tools/validate-venue.mjs public/venues/demo-muscat/venue.json` passes.
- Idle scene renders 0 frames (render-on-demand). Dispose geometries/materials on venue change.
- Every primary button ≥ 56 px tall; nothing interactive < 44 px.
- RTL: layout mirrors in Arabic; turn arrows and left/right words are NOT mirrored (they follow walking direction).
- v0.2: idle = 0 frames also in the Walk view and with the glow path (chevrons flow only while
  `setPathAnimating(true)`); `onAnchors` adds no frames. Every text on glass >= 4.5:1 against a white scene behind
  dark / pewter glass and a black scene behind frost (DESIGN-GLASS.md 2.3), also with `backdrop-filter` unsupported.
  The SIMULATION tag is visible in every Walk view state. Nothing under 14 px text, nothing interactive under 44 px.
- No network calls at runtime except same-origin static files.
