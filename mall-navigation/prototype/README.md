# Dallni prototype: 3D mall map + navigation simulator

A phone-first web prototype of **Dallni** (دلّني), the indoor wayfinding app for malls in Oman.
It shows a game-like 3D model of a mall, finds routes between shops, parking bays and toilets, writes
turn-by-turn steps in Arabic and English, and plays the walk as a **simulation** so you can see the whole
journey on your own phone, from above or **first person, at eye height inside the 3D model** (Walk view).

**v0.5 ("Mall Value", the newest)**: what makes a mall say yes.
- **Find me first:** the app opens by asking where you are: scan the Dallni sign (simulated here), or tap the
  entrance / car-park lift you came in by. "Found you" flies the map to you. No GPS (indoors it knows neither floor
  nor shop, and the screen says so).
- **Home, organised as Sam's Stitch mock:**
  - a Map | Offers tab;
  - "Where to next?" cards: today's deals, food nearby, find my car, a new global brand, facilities;
  - a pinned "Start walking" bar for the card you picked.
- **Offers:** demo deals nearest first and four new (fictional) global brands, with a "Show me" on each.
- **Mall info:** Ramadan and Eid hours with a "Preview in the app" switch, services, and a facilities directory.
- **Emergency mode:** directions stop, exits are shown, no lifts. Turned on from the dashboard or the demo button.
- **Kiosk mode:** for a mall's touch screen, with a "Continue on your phone" QR code.
- **Mall dashboard:** KPIs, searches the mall can't answer (for Leasing), a heatmap, sign health, offers, and the mall
  controls. All of it is demo data, labelled so.
- **Wide screens:** a side panel plus the map, instead of a narrow phone column.
- **Docs:** [`DESIGN-MALL.md`](./DESIGN-MALL.md); CONTRACT.md section 3e.

**v0.4 ("real mall", the 3D look)**: the mall looks like a real Gulf mall in a game.
- **Materials:** photographed CC0 marble floors, plaster walls, wood shop floors.
- **Reflections** from a real covered shopping arcade.
- **Shops:** furnished behind glass (mannequins and racks, café tables, glowing screens, shelves), with dark fascias
  carrying backlit Arabic and English letters and a thin category-colour line.
- **Atrium:** stone columns with brass rings, and directory totems.
- **Walk view:** a ceiling with glowing lamps.
- **Glow:** a soft glow on lamps and signs.
- **Download:** about 1.5 MB of textures, our own files, cached. Weak phones (and `?quality=light`) get the v0.3 toy
  look below, with no download.
- **Docs:** [`DESIGN-REAL.md`](./DESIGN-REAL.md); CONTRACT.md section 3d.

**v0.3 ("toy world", `?style=toy`; also what Light quality shows)**: the mall looks like a friendly mobile game.
- **The 3D:**
  - pastel shop blocks with soft bevelled edges;
  - a real sun with soft shadows on capable phones;
  - a sky-blue backdrop and a friendly dusk on the parking levels;
  - exact, unlit sign faces;
  - a teal route.
- **The UI:** white chunky game panels with a raised "press me" edge, dark ink and a teal primary button.
- **Quality:** two levels. Showcase has soft shadows. Light (no shadows) switches on by itself on weak phones and is
  forced with `?quality=light`.
- Everything is drawn by code: no downloaded models, textures or new libraries.
- Look and numbers: [`DESIGN-TOY.md`](./DESIGN-TOY.md); engine API: [`CONTRACT.md`](./CONTRACT.md) section 3c.

**v0.2 ("storm glass", `?style=storm` for its 3D)**:
- a cloudy storm sky with a warm amber glow;
- a glowing teal path with white chevrons;
- a target ring at the next turn;
- the first-person **Walk view**: a turn card, trip chips, a floating turn bubble and a half-dome mini-map
  ([`DESIGN-GLASS.md`](./DESIGN-GLASS.md); CONTRACT.md section 3b).

Add `?style=classic` to any link for the v0.1 look.

## Read this first: what this is, and what it is not

| It is | It is not |
|---|---|
| A **fictional** small Muscat mall ("Dallni Demo Mall · Muscat") with fictional bilingual shop names | A real mall. No real floor plan was used; real Omani mall plans are not public |
| Real routing on a real walking network (escalators one-way, lifts, stairs, step-free routes) | Live positioning. The walker on the map is a **SIMULATION**, never your real position |
| A data format a real mall can drop into later (`public/venues/<id>/venue.json`) | Real brands, logos or opening hours |
| "You are here" set by choosing a QR plate from a list (or tapping it on the map) | A QR scanner. Scanning is simulated in this spike |

The header always shows **PROTOTYPE · SIMULATION**, and the home screen shows the venue's disclaimer.

## What is in the demo mall

- 4 levels: Parking B2 and B1, Ground (G) and Level 1. 128 × 64 m, 5.5 m floor to floor.
- 46 shops and services (hypermarket, cinema, food court with 8 counters, pharmacy, kids play, ...),
  15 amenities (restrooms on both retail floors, men's and women's prayer rooms with wudu, ATM, info desk,
  taxi pickup), 2 escalators (one up, one down), 2 lifts (B2 to Level 1), 1 stair core.
- 312 parking bays in 8 colour zones, each with an Omani icon (Falcon, Palm, Dhow, Oryx, Rose, Fort,
  Turtle, Frankincense), and 38 QR plates (entrances, lift lobbies, escalators, corridors, parking pillars).

## What you can do in the app

1. **Home**: see where you are, search, or tap one of six tiles (Food, Restrooms, Prayer, Pharmacy, Kids,
   Exit / Taxi). Tap **Change** to pick the QR plate you are standing at.
2. **Search**: Arabic or English, typo-tolerant, singular or plural (عطر and عطور both find the perfume shops),
   instant results with the level and walking minutes. "lift" / «مصعد», "escalator" and "stairs" find those too.
3. **Place**: level, minutes, opening hours, a **step-free** switch (lifts only), and one big **GO**.
4. **Navigate**: the step card ("Take the up escalator to Level 1, then turn left at the top · 50 m"),
   **Next** / Back, and **Simulate walk** with 1× / 2× / 4× speed. A teal ring and light beam mark where the
   current step ends. The **✕** ends the route at once, with a 5-second **Undo**.
5. **Walk view (first person, a SIMULATION)**: **Simulate walk** opens it (or the **Walk view** pill / the View
   menu). You walk the route at eye height (1.6 m, looking 5° down) inside the 3D model: the glowing path with bold
   chevrons that flow while it plays, the ring at the next turn with a floating bubble ("Turn left · and 10 m
   straight") hanging above its icon, a turn card ("Turn left towards · Food court · 30 m"; a ride adds the turn at
   its end, "then turn left at the top"), Arrival / Distance / Steps chips with their round coloured icons, a
   heading-up half-dome mini-map with the floor ("1") in its corner and N on its rim (tap it to look at the map), and
   one frosted bottom bar: **End** (■, ends the route with Undo), speed, the big Play / Pause, Next (on the last step
   **Arrived ✓**) and **Map** (back to the overhead view; the walk keeps playing there). The model is a cool slate
   interior with faint floor tiles, shaded walls, lit shop interiors behind the storefront glass and glass escalator
   sides. Escalators are ridden; lifts and stairs are a cut under a card ("Press “B1”, then turn left as you step out")
   instead of a slide through floors; "Now on Level 1" when you step off. The orange **SIMULATION**
   pill in the turn card (and the full "SIMULATION · Not your live position" capsule on arrival) is always on screen:
   this is not camera AR and not live positioning.
6. **Arrived**: the camera faces the shop front so its sign reads in both languages (in the Walk view it turns
   to face the sign from the corridor, along the corridor for a shop facing the atrium, with the mint target ring at
   the doorstep above the Arrived sheet). "Found it" (your position becomes the shop), Back to my car, Another shop.
7. **My car**: pick the parking plate next to your car, **Save my car here**, see the Car Card (zone colour,
   icon, and the bay code exactly as painted on the floor, "B1-43", in both languages), then **Take me
   there** (works step-free too, and in the Walk view down to B1 / B2, ending in the aisle looking into the bay).
   The map turns dark ("basement" theme) on parking levels; parking zones show as pins with their Omani icon
   and name.
8. **Map views**: the **View** button (top corner) switches between Overview (floors stacked), Floor (one floor
   in 3D) and 2D (top-down), plus Walk view during a trip; the level buttons B2 / B1 / G / 1 sit in the other
   corner (the codes as printed on the lift panel, in Arabic too: «أ» and «١» look almost the same side by side). During
   a trip over several floors, Overview stacks only the floors the route uses and makes the
   upper floor see-through, so the route, the car and the destination below stay visible. Drag to pan,
   pinch to zoom, tap a shop to open it.
9. **ع / EN** switches the whole app between English and Arabic (right-to-left, Arabic-Indic digits).
10. **Fold the panel**: every bottom sheet folds. Drag its handle (or the row under it, or its main button) down to
    fold it to one row (home: the search bar; a shop: its name and GO; a step: the instruction and Next; My car: the
    zone, bay and level in one row and Take me there; arrived: the tick and the place, and Found it), tap the handle
    to open it halfway again (and full when there is more), flick it up for full. It opens halfway by default and
    never covers more than the bottom half of the screen there, so the map stays in view; the map re-centres in the
    space above it. Escape folds it too (in the search field, Escape clears the text first), and typing into a
    folded search panel opens it full again. A small chevron under the last row says there is more above the fold.

Nothing is stored on a server or in localStorage. The saved car lives in memory for this visit only; the
language choice is kept in sessionStorage. The app makes no network calls except loading its own files.

## Run it on your computer

You need **Node.js 22** (or 20.19+). Download the LTS installer from <https://nodejs.org> if `node -v`
does not work in a terminal.

```bash
cd mall-navigation/prototype
npm install
npm run dev
```

Vite prints two addresses:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.23:5173/
```

Open the **Local** address in Chrome, Edge or Safari. To see the mobile layout on a computer, open the
browser's developer tools and turn on the phone/device toolbar.

### Open it on your phone (same Wi-Fi)

1. Keep `npm run dev` running. Your phone must be on the **same Wi-Fi** as the computer.
2. On the phone, type the **Network** address Vite printed (for example `http://192.168.1.23:5173/`).
3. If it does not load on Windows, allow Node.js through the firewall when Windows asks ("Private
   networks"), or open *Windows Security → Firewall → Allow an app* and tick Node.js.
4. The 3D map needs WebGL 2 (any phone from the last ~6 years). If a phone cannot run it, the app says so and
   everything else (search, place, step cards, the simulated walk, the car card) still works. If the 3D part
   cannot be downloaded (flaky network), it says "Couldn't load the 3D map" with a Try again button.

### Demo B in 5 minutes (v0.5)

1. **Phone:** open the Network URL. Find me opens. Tap **East entrance** and watch "Found you".
2. Tap the **deals banner**, or the **Offers** tab. Open **Show me** on a deal, then press **GO**.
3. Back on the Map tab, tap the **mall name** at the top (Mall info). Switch on **Preview in the app** under
   Ramadan, and watch the hours change and the Ramadan offers appear.
4. **Laptop, two windows:**
   - left: the app;
   - right: `?screen=dashboard`.
   Switch on **Emergency mode** on the dashboard: the app stops directions and shows the exits. Switch it off again.
   (This works between tabs of the same browser: there is no server yet.)
5. **Kiosk:** open `?kiosk=A-G-ENT-S` on the laptop through the **Network URL** (not localhost). Search a shop and scan
   its QR code with your phone: the same route opens on the phone.

### Handy demo links (URL test hooks)

Add these to the address (they are also used by the screenshot script):

| Link | Opens |
|---|---|
| `?lang=ar` | Arabic |
| `?screen=place&to=occ-muttrah-kitchen` | Place screen for a food-court counter |
| `?screen=navigate&to=occ-majlis-cinemas&play=1` | Navigation to the cinema, walk already playing |
| `?screen=navigate&to=occ-muttrah-kitchen&simT=56&lang=ar` | Mid-walk, just after the escalator |
| `?screen=car&car=bay-B1-043` | A saved car on B1 (dark parking theme) |
| `?screen=navigate&to=bay-B1-043&car=bay-B1-043&stepFree=1&from=A-L1-C3` | Step-free route back to the car |
| `?view=top` / `?view=floor` / `?view=stack` | Start in 2D / Floor / Overview |
| `?screen=navigate&to=occ-muttrah-kitchen&view=fpv&simT=68` | Walk view, mid-corridor on Level 1 (walk paused) |
| `?screen=navigate&to=occ-muttrah-kitchen&view=fpv&simT=45&lang=ar` | Walk view riding the up escalator, Arabic |
| `?screen=navigate&to=bay-B1-043&car=bay-B1-043&stepFree=1&from=A-L1-C3&view=fpv&simT=99` | Walk view inside the lift ride (lift card) |
| `?screen=arrived&to=occ-muttrah-kitchen&view=fpv` | Walk view arrival, facing the shop sign |
| `?screen=navigate&to=occ-muttrah-kitchen&view=fpv&step=6` | Walk view on the last step (the bar's Arrived) |
| `?screen=arrived&to=occ-abaya-atelier&view=fpv` | Walk view arrival at a shop facing the atrium void |
| `?style=classic` | The v0.1 look (light classic scene, blue ribbon) |
| `?style=toy` | The v0.3 toy-world 3D look (what Light quality shows) |
| `?style=storm` | The v0.2 3D look (storm sky, dark architecture); the UI stays the v0.3 one |
| `?quality=light` / `?quality=showcase` | Force the 3D quality level (Light = no shadows; default: picked per device) |
| `?sheet=peek` / `?sheet=full` | The first screen's bottom sheet folded / full (default: half) |
| (no parameters) | v0.5: Find me, the first screen |
| `?from=A-B1-LA` | A plate link: skips Find me, "Found you" at Parking B1 · Lift A |
| `?screen=offers` | The Offers tab |
| `?screen=info` / `?screen=facilities` | Mall info (hours, Ramadan preview) / Facilities |
| `?emergency=1` | Start in (demo) emergency mode |
| `?kiosk=A-G-ENT-S` (`&kioskIdle=20`) | Kiosk mode at the South entrance (idle reset after 20 s; default 60) |
| `?screen=dashboard` | The mall dashboard (open it in a second window next to the app) |

Full list: `screen=home|search|place|navigate|arrived|car|scan|welcome|offers|info|facilities|emergency|dashboard`, `kiosk=<plate id>`, `kioskIdle=<s>`, `emergency=1`, `from=<plate id>`,
`to=<shop | amenity | bay | plate id>`, `view` (`stack|floor|top|fpv`), `style` (`storm|classic`), `level`, `simT=<seconds>`, `step=<n>|connector`,
`stepFree=1`, `q=<search text>`, `tile=food|restrooms|prayer|pharmacy|kids|exit`, `car=<bay id>`, `play=1`,
`sheet=peek|half|full`.
In the browser console, `window.__dallni` gives `{ engine, getState(), setState(partial), index, route, sim,
setSheet(snap), getSheet() }` (`getSheet()`: the bottom sheet's settled rect, snap and its peek / half / full heights).

## Build

```bash
npm run build      # writes the finished site to dist/, then checks the load budgets
npm run preview    # serves dist/ at http://localhost:4173 to check the build
```

`dist/` is plain static files (HTML, JS, CSS, fonts, `venues/demo-muscat/venue.json`). It works from any
static host and from a sub-folder.

`npm run build` fails if a file is over its load budget (PLAN.md 19.2, `tools/check-budgets.mjs`, gzip level 9,
counted in **KiB**, 1 KiB = 1024 bytes): first screen JS + CSS 110 KiB; the 3D libraries (three.js + troika,
`engine3d-*.js`, loaded after the first screen) 220 KiB; our own 3D code (`scene3d-*.js`, loaded with it) 60 KiB;
both lazy 3D files together 260 KiB; the two 3D sign fonts 50 KiB together; any font 50 KiB. `npm run check:budgets`
runs the check alone. Vite's own build log prints decimal kB at its default gzip level, so the same file reads 2-3 %
larger there (scene3d "53.0 kB" in Vite's log is 51.3 KiB in the budget table): the table is the measure. The 3D-code
budget was 50 KiB until QA round 2 and 52 KiB until v0.3; it is 60 KiB since, for the toy world's light, shadows and
bevels (CONTRACT.md 3c).

## Put it online with Firebase Hosting (free Spark plan is enough)

Do this once:

1. Go to <https://console.firebase.google.com>, sign in with your Google account and click **Add project**
   (or **Create a project**).
2. Name it, for example `dallni-demo`. Click **Continue**. Turn **Google Analytics off** (not needed) and
   click **Create project**, then **Continue** when it is ready. No billing is needed for Hosting.
3. On your computer, open a terminal and install the Firebase command-line tool:
   ```bash
   npm install -g firebase-tools
   ```
   (On a work laptop without admin rights, use `npx firebase-tools` instead of `firebase` in every
   command below.)
4. Sign in:
   ```bash
   firebase login
   ```
   A browser window opens. Pick the same Google account, click **Allow**, and go back to the terminal. It
   says "Success! Logged in as ...". (If it asks whether Firebase may collect usage info, answer as you like.)
5. Go to the prototype folder and set up Hosting:
   ```bash
   cd mall-navigation/prototype
   firebase init hosting
   ```
   Answer the questions like this:
   - *Please select an option* → **Use an existing project** → pick **dallni-demo**.
   - *What do you want to use as your public directory?* → type **`dist`** and press Enter.
   - *Configure as a single-page app (rewrite all urls to /index.html)?* → **Yes**.
   - *Set up automatic builds and deploys with GitHub?* → **No**.
   - If it asks *File dist/index.html already exists. Overwrite?* → **No**.

   This creates two small files, `firebase.json` and `.firebaserc`. Keep them (commit them to git).

Every time you want to publish:

6. Build the site:
   ```bash
   npm run build
   ```
7. Upload it:
   ```bash
   firebase deploy --only hosting
   ```
   At the end it prints **Hosting URL: https://dallni-demo.web.app**. Open that link on any phone. Share it
   with the team; it works over HTTPS, so phones accept it everywhere.

To publish a change later, repeat steps 6 and 7. To take the site down: `firebase hosting:disable`.

## Replace the demo mall with a real mall

The whole mall is one file: `public/venues/demo-muscat/venue.json`, schema `dallni.venue/0.1`,
described field by field in [`CONTRACT.md`](./CONTRACT.md) section 2 (levels, units, shop doors, shops,
amenities, lifts/escalators/stairs, QR plates, landmarks, parking zones and bays, and the walking graph).

1. **Get permission first.** Real shop names on signs are fine to copy as printed; real brand colours and
   logos need the mall's or the tenant's written licence (PLAN.md 19.2 brand-rights rule).
2. **Make the data**, either way:
   - *Edit the generator*: `tools/generate-demo-venue.mjs` builds the demo mall from a few tables (floor
     outline, shop list with names in both languages, corridors, lifts, parking zones). Change those and run
     `npm run gen:venue`.
   - *Write the JSON yourself* (or export it from a tracing tool) in the same format, for example as
     `public/venues/<your-mall-id>/venue.json`. Use the lift button labels and sign names exactly as printed
     in the mall.
3. **Check it** until it reports 0 errors:
   ```bash
   node tools/validate-venue.mjs public/venues/<your-mall-id>/venue.json
   ```
   It checks, among other things: shops and corridors fill each floor without overlaps, every walking link
   stays on walkable floor, every shop has a door on the network, every point can reach every other (also
   step-free), escalators are one-way, Arabic names contain no Latin letters, and every character of every
   name, sign, label and painted code the 3D map draws exists in the two bundled 3D fonts. (The fonts have no
   «پ» «گ» «چ» or Latin letters such as ğ / ş: such text is refused, because the 3D text library would
   otherwise fetch a font from the internet. If you change the font files, run `npm run gen:fonts`.)
4. **Point the app at it**: change `VENUE_URL` near the top of `src/App.jsx` from
   `venues/demo-muscat/venue.json` to your file, then `npm run build` and deploy.
5. Walk the real mall with the printed step list in both languages and fix anything that reads wrong.

## Tests and checks

```bash
npm test                  # unit tests: venue data, routing, steps, search, Arabic/English text, simulator, 3D fonts
npm run validate:venue    # the demo venue passes the validator
npm run build             # production build must pass, inside its load budgets
```

Screenshots (needs Playwright with Chromium; it uses a local `playwright` package if you install one,
otherwise the global one on the build machine):

```bash
npm run dev -- --port 4202 --strictPort     # terminal 1
npm run shots                               # terminal 2: writes .shots/app-*.png
node scripts/screenshots.mjs http://localhost:4173/   # or against `npm run preview`
```

The script also fails (exit code 1) if the page logs an error or requests anything from a host other than
localhost. Most shots are 390 × 844 (a modern phone); the `-360` ones are 360 × 740 (a budget Android); the
`-390x664` and `-360x640` ones are what a phone browser tab really gets once the address bar is shown.
`SHOTS_ONLY=home-en,arrived-en npm run shots` takes only the named shots.
The `sheet-*` scenarios (`.shots/sheet-after-*.png`) show the foldable bottom sheet at peek / half / full at
393 × 728 (a phone in the Claude app's artifact viewer, also with the iPhone's 34 px home-indicator inset), 390 × 844,
390 × 664 and 360 × 640, in both languages; each also checks that half keeps the map's top half, the primary button is
on screen, no map label sits under the sheet, the level picker shows whole buttons with the active level whole and
its "more" chevrons inside it, and the handle's `aria-expanded` matches its label. A gesture test then drives the
sheet with touch, mouse and keyboard, and a per-screen one folds the navigate and car sheets by their head row, drags
the place sheet by its GO footer, lands a second finger during a body drag and types into a folded search sheet.
`npm run shots -- --sheet` runs only those, `--gesture` only the gesture test, and `--measure` re-measures every sheet
into `tests/fixtures/sheet-measures.js` (the unit tests check the snap rules on the real layouts).

What the shots cover (`.shots/app-<name>.png`):

| Shots | What |
|---|---|
| `fpv-start-en`, `fpv-sim-t20-en` | Walk view at the start of the trip and walking to the escalator (bubble "Escalator up") |
| `fpv-mid-en`, `fpv-mid-en-360`, `fpv-mid-ar-360x640` | Walk view mid-corridor on Level 1: path + chevrons, ring + bubble, heading-up dome |
| `fpv-escalator-ar`, `fpv-escalator-ar-360` | Riding the up escalator, Arabic (mirrored HUD, arrows not mirrored) |
| `fpv-floor-change-en`, `fpv-floor-change-en-360` | Just off the escalator: "Now on Level 1" under the turn card |
| `fpv-arrived-en`, `fpv-arrived-en-360` | Arrival facing the shop sign, glass Arrived sheet |
| `fpv-lift-en`, `fpv-car-b1-en`, `fpv-car-b1-en-360`, `fpv-arrived-car-ar`, `fpv-car-b2-en` | Back to the car: lift card, walking through Parking B1, looking into bay B1-43, Parking B2 |
| `fpv-sim-t20-en-390x664` | Walk view in a phone browser tab (compact HUD: the trip summary moves into the turn card) |
| `fpv-start-ar-360`, `fpv-escalator-en-360`, `fpv-lift-ar-360` | 360 px phone: the Arabic bubble beside (never over) its icon, the one-line escalator verb, the lift card in Arabic ("Press “B1”") |
| `fpv-laststep-en`, `fpv-arrived-abaya-en` | The last step (bar Arrived ✓, the bubble an icon on the ring), arrival at a shop facing the atrium void |
| `home-en`, `home-ar`, `search-ar-restaurant`, `place-en-food-court`, `navigate-step1-floor-en`, `car-card-ar-b1`, ... | Every v0.1 screen, now in storm glass (map views keep the step card and gain the Walk view pill) |
| `home-en-classic` | The v0.1 look (`?style=classic`) |

## Where things are

| Path | What |
|---|---|
| `src/App.jsx` | App state, screen flow, engine and simulator wiring, URL test hooks |
| `src/ui/` | Screens (home, search, place, navigate, arrived, car, scan), header, map controls, icons, styles |
| `src/ui/WalkHud.jsx` + parts | The Walk view HUD (turn card, stat chips, turn bubble, mini-map dome, bottom bar, lift card), loaded on demand |
| `src/ui/hudModel.js` | What the Walk view HUD says and where the bubble goes (pure, unit-tested) |
| `src/sim/simulator.js` | The walk simulator (pure `tick` + requestAnimationFrame driver) |
| `src/engine/` | The 3D engine (three.js + troika-three-text), one canvas, renders only when something changes |
| `src/engineHost.js` | Loads the engine after the first screen (`loadEngine()`) and queues engine calls made before it arrives |
| `src/engine/tokens.js` | Plain colour tokens and zone icons shared by the screens and the engine (no three.js) |
| `src/routing/` | Routes (A* over the walking graph) and turn-by-turn steps in both languages |
| `src/search/` | Bilingual search (Arabic normalisation, Arabizi, typos, synonyms) |
| `src/i18n/strings.js` | All UI text in English and Arabic, distance and time formatting |
| `src/data/venue.js` | Loads and indexes `venue.json` |
| `public/venues/demo-muscat/venue.json` | The fictional demo mall |
| `tools/` | Venue generator and validator, 3D font coverage generator, load budget check |
| `debug/engine.html` | Engine-only debug page (`?view=fpv&route=kitchen&simT=40`, `?walkhud=1`, ...) |
| `debug/ui-gallery.html` | HUD component gallery (dev server only) |
| `tests/` | Vitest unit tests |
| `scripts/screenshots.mjs` | Headless screenshots + console/network check |

## Known limits of this spike

- The layout, shops, hours and plate positions are **fictional**. Opening hours use the phone's clock in
  Muscat time, so late at night shops show "Closed now".
- Position comes only from choosing a plate (simulated scan) or from the simulated walk. There is no QR
  camera scanner, no Wi-Fi/BLE positioning and no "I'm lost" panel yet.
- Arabic text in the 3D signs is shaped by troika-three-text, which lacks two font features; it looks right
  in our screenshots, but a native Arabic reader still has to sign off every sign name (PLAN.md 19.2).
  The screens, the Walk view's lift card and bubble ("Press “B1”") and the 3D level badges show the level codes as
  printed on the lift panel (G / 1 / B1 / B2) in both languages, because the Arabic codes «أ» / «١» were near-identical
  strokes and «ب١» can read like «با»; the step text from the routing still says «اضغط ب١», level names such as
  «مواقف ب١» stay names, and a native reader should confirm which form the real lift panels print.
- **Load sizes** (gzip, checked on every build):
  - The first screen loads about 109.5 KiB, budget 110 KiB, so it is nearly **full**. The Walk view HUD is a separate
    chunk fetched when a route opens.
  - The 3D part downloads once the first screen is up:
    - three.js + troika: about 177 KiB, budget 220 KiB;
    - our own 3D code: about 58.4 KiB, budget 60 KiB since v0.3 (toy light, shadows and bevels).
  - v0.4 adds about 1.5 MB of CC0 textures, loaded only at Showcase quality (raw budget 3 MB). Offline caching (service worker) and the low-end-phone fallbacks from
  PLAN.md 19.2 are not in this spike.
- While a scan sheet is open, every QR plate shows as a tappable pin on the map (Floor view of your level, or
  the parking level when saving the car).
- Overview stacks the trip's floors 12 m apart (PLAN.md 19.2). With a 64 m deep floor that still overlaps,
  so the upper floor is drawn see-through rather than relying on the gap.
- No voice guidance, haptics or screen wake lock yet.
- The Walk view is a simulation inside a simple model (boxes with shaded walls, tiled glossy floors, lit shop
  interiors, signs), not a photo or camera view: it reads as a clean 3D model, not as the street photos of the
  reference AR apps. Its narrow phone field of view (about 36° across at 390 × 844) means a short jog out of a doorway
  turns the view: the demo route's first frame faces up the corridor toward the fountain (as the step says), and
  when Play is pressed the view glances about 35° toward the corner 3 m out of the south entrance and back.
- Bottom sheets open at half height, at most the bottom half of the screen: on short screens (a phone browser tab,
  the Claude app's viewer) the rest is one drag or tap away. There the navigate sheet shows the step, Next and the
  trip line (step n of N, what is left) at half, and "Simulate walk" one pull further up (the **Walk view** pill on
  the map is always there); folded, it keeps only the step and Next.
