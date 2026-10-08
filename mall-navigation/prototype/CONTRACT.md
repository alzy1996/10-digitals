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
  `Result = { type: 'occupant'|'amenity'|'category', id, name:{en,ar}, levelId, score }`.
  Matches names, sign text, keywords, categories, and synonyms (toilet/washroom/restroom/حمام/دورة مياه;
  prayer/musalla/مصلى; atm/صراف; pharmacy/صيدلية; parking/موقف/مواقف; cinema/سينما; food/مطعم/مطاعم).

### `src/engine/` (three.js; DOM only through the canvas container)
Singleton, render-on-demand (no continuous loop when idle).
- `engine.js` exports `createEngine() -> Engine` and a default singleton `engine`.
- `Engine`:
  - `mount(containerEl)`, `unmount()`, `dispose()`
  - `setVenue(index)`: builds the scene (slabs, walls, storefront facades + sign boxes with troika text,
    atrium void, escalators, lifts, landmarks, parking bays as InstancedMesh per level, zone colour decals,
    pillars with zone bands, anchors as small plates)
  - `setLanguage('en'|'ar')`, `setTheme('sunlight'|'basement')`
  - `setView({ mode: 'stack'|'floor'|'top', levelId })`: `stack` = all levels exploded (overview);
    `floor` = one level solid, others hidden/ghosted; `top` = 2D top-down of the focused level.
  - `showRoute(route | null)`: ribbon 1.2 m wide, 5 cm above floor, route blue with white casing;
    other-level parts dotted/faded; vertical light column at connectors.
  - `setActiveStep(stepIndex)`: highlight that step's segment; fly the camera to frame it (1.2 s).
  - `setMarker(kind: 'you'|'car'|'dest'|'walker', value | null)` where
    `value = { levelId, x, y, headingDeg?, state?: 'exact'|'estimated'|'lastSeen' }`.
  - `flyTo({ levelId, x, y, distance?, tiltDeg?, headingDeg? }, durationMs = 1200)`
  - `onPick(cb)`: cb receives `{ type: 'occupant'|'amenity'|'anchor'|'bay'|'connector', id }` on tap
    (screen-space hit test, 44 px radius around label anchors).
  - `requestRender()`; `getStats() -> { drawCalls, triangles, frameMs }`
  - `setFollow(boolean)`: camera follows the `walker` marker smoothly.
- Fonts for troika: import with `new URL('../assets/fonts/readex-latin-600.woff', import.meta.url).href`
  (Latin) and `readex-arabic-600.woff` (Arabic). Each sign = two text meshes (AR line + EN line), the
  active UI language on top at 100%, the other at 70%. Never let troika fetch fonts from a CDN.
- Colours: PLAN.md §9 and §19.2 tokens. Category colours: fashion #AD1457, food #C2410C, cafe #8D5524,
  electronics #6D28D9, beauty #BE185D, kids #0E7C86, grocery #15803D, entertainment #7C3AED,
  home #92400E, health #0E7490, services #475569. Zone colours come from the data.

### `src/sim/` (pure logic + a tiny rAF driver)
- `simulator.js`: `createSimulator({ route, speedMultiplier = 1 }) -> Sim`
  - `Sim.tick(dtSeconds) -> SimState` (pure, testable), `play()`, `pause()`, `setSpeed(mult)`,
    `seekStep(i)`, `onChange(cb)`, `dispose()`
  - `SimState = { levelId, x, y, headingDeg, distanceDoneM, distanceTotalM, stepIndex, onConnector: bool,
    done: bool, elapsedS }`
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
Views: buttons for Overview (stack) / Floor / 2D top. Theme switches to `basement` automatically when the
focused level is a parking level.
Header badge: "PROTOTYPE · SIMULATION".

Test hooks (for screenshots): URL params `?lang=ar|en&screen=home|place|navigate|arrived|car&from=<anchorId>
&to=<occupantId|amenityId|bayId>&view=stack|floor|top&simT=<seconds>&stepFree=1`, and `window.__dallni`
exposing `{ engine, getState(), setState(partial) }`.

## 4. Quality bars

- `npm run build` passes; `npm test` passes; `node tools/validate-venue.mjs public/venues/demo-muscat/venue.json` passes.
- Idle scene renders 0 frames (render-on-demand). Dispose geometries/materials on venue change.
- Every primary button ≥ 56 px tall; nothing interactive < 44 px.
- RTL: layout mirrors in Arabic; turn arrows and left/right words are NOT mirrored (they follow walking direction).
- No network calls at runtime except same-origin static files.
