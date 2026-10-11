# DESIGN-MALL: v0.5 "Mall Value" (Find me, Offers, hours, emergency, kiosk, dashboard, wide layout)

Spec: `../docs/superpowers/specs/2026-10-11-mall-value-design.md`. Plan: `../docs/superpowers/plans/2026-10-11-mall-value.md`.
The home screen follows Sam's Stitch mock ("Playful Bento & Gamified Explorer", 2026-10-11), with the changes listed in
section 2.

## 1. Screens

| Screen | How you get there | What it does |
|---|---|---|
| **Find me** (`welcome`) | The first screen (no `from=`, no `screen=`, not a kiosk) | Where are you? Scan the Dallni sign (simulated plate picker), or pick the entrance / car-park lift you came in by, or just look around. No GPS (a caption says why). After a pick: "Found you · place · level" toast, Floor view flown to you |
| **Home** (Map tab) | After Find me; a plate link `?from=` opens it with "Found you" | Sam's bento: header pill, search row, level column, floating you pill, Map / Offers tabs, "Where to next?", deals banner, food nearby, find my car, a new brand, facilities, quick chips, and a pinned bar (where you are, or the picked place's route, with **Find a place** / **Start walking**) |
| **Offers** (Offers tab, `offers`) | The tab, the deals banner, the header stamp pill | Today's demo deals nearest first (category filter), the four new global brands; Show me opens the shop's place screen (with its offer card) |
| **Mall info** (`info`) | Tap the mall pill in the header (home, Find me, search, facilities, offers) | Open now, today and the week, Ramadan / Eid hours (expected dates) with **Preview in the app**, services, what to do in an emergency, a demo emergency button |
| **Facilities** (`facilities`) | The home's facilities card | Every amenity in 6 groups, nearest first, step-free switch |
| **Emergency** (`emergency`) | Mall operations (dashboard tab), Mall info's demo button, `?emergency=1` | Directions stop (walk, route, pick cleared; Walk view leaves); message, exits (entrance plates as pins), "no lifts"; red header; no other screen until it ends |
| **Kiosk** (`?kiosk=<plate>`) | A kiosk's URL | Fixed you-are-here at the plate, attract screen, idle reset (`kioskIdle`, default 60 s), Continue-on-your-phone QR on place and navigate |
| **Dashboard** (`?screen=dashboard`) | Its own URL (separate entry, no 3D) | KPIs, journeys per day / hour, top searches, searched but not found (CSV), heatmap per level, sign health, offer performance, Mall controls (emergency, Ramadan preview), Download report (print) |

## 2. Sam's mock: what was kept, what changed

- **Kept:**
  - the organisation: header pill, search row with the View control, level column at the end edge, floating
    "where you are" pill, a "Where to next?" sheet;
  - the bento: a wide gradient banner, two square cards, two compact cards, and a pinned bar with one gradient call
    to action;
  - the pastel card tints and the blue active-level disc.
- **Changed:**
  - **SVG icons**, not emoji (ui-ux-pro-max rule; emoji render differently on every phone);
  - **Readex Pro / Noto Sans Arabic** (self-hosted), not Plus Jakarta / Quicksand from Google Fonts (no font CDN at
    runtime);
  - **"Open · until 22:00"** (real hours) instead of "ONLINE"; the **PROTOTYPE · SIMULATION** badge stays on the
    header's second line;
  - **no points and no showtimes:** the mock's points become a labelled **demo stamp quest** (visit the 4 new
    brands; kept in memory only); nothing is invented;
  - colours where white text failed 4.5:1 were darkened (see section 3);
  - the zip's `DESIGN.md` (a dark "Luminous" system) was not used: it contradicts the screenshot Sam picked.

## 3. Tokens (app.css, "v0.5 home")

| Token | Value | Use |
|---|---|---|
| `--coral` / `--sun` / `--vibrant` / `--lime` | #E5484D / #FFD93D / #2F6FEB / #3FA34D | Mock accents (icon tiles, level disc) |
| `--bubble-*` | pink #FFE4E4, lilac #E8EAFF, mint #E4F9F5, peach #FFEEDB, sky #E1F4FF | Tab track, pills, page backgrounds |
| `--grad-hot` | 120°, #BE123C → #BE185D → #C2410C | Deals banner (white text ≥ 4.5:1 on every stop) |
| `--grad-go` | 120°, #BE123C → #BE185D → #1D4ED8 | Primary pills (Start walking, Find a place, Scan) |
| `--r-bento` | 26 px | Bento cards, deal cards |
| `--shadow-pill`, `--shadow-bento` | soft blue/coral shadows | Pills, the level column |

- **Card tints (text pairs tested in `tests/ui-theme.test.js`):**
  - food: amber #FFFBEB → #FFEDD5, border #FCD34D;
  - car: blue #EFF6FF → #E0E7FF, border #93C5FD;
  - new brand: rose #FFF1F2 → #FCE7F3, border #FDA4AF;
  - facilities: mint #ECFDF5 → #D1FAE5, border #86EFAC.
- **Type:** titles 22/28 700; card titles 16/21 700; chips 11/18 700 uppercase (no letter-spacing in Arabic); body
  14–16 px.
- **Touch:** every control is at least 44 px; primary pills are 52–56 px.
- **Motion:** 180–260 ms transform/opacity only; `prefers-reduced-motion` turns it off (the you-pill ping, the attract
  pulse, card press).

## 4. Data and rules

- **Hours** (`src/ui/hours.js`, `meta.hours`):
  - Sat–Wed 10–22, Thu–Fri 10–23;
  - Ramadan 2027 (expected 8 Feb – 9 Mar): 10–15 and 20–01; the hypermarket 08–02 and the cinema 20–02 keep their own;
  - Eid al-Fitr 2027 (expected 10–12 Mar): 10–24.
  - Intervals past midnight are handled.
  - **Preview** (`hoursPreview`) evaluates every hours line and the offers as if in that special. It goes through the
    ops bus, so all tabs agree.
- **Offers** (`offers.json`, `src/offers/offers.js`):
  - 10 demo deals (2 Ramadan, 1 expired) and 4 new brands, all on fictional shops; labelled "Demo offers · fictional
    shops".
  - Pull only, ordered by walk time from the you-are-here the shopper set; never on parking levels or outside their
    dates.
- **New global brands** (fictional): Strideline (from Melbourne), Maison Lumel (Paris), Kaze Ramen Lab (Tokyo),
  Nova Arcade (Seoul). Monogram tiles, no logos.
- **Ops bus** (`src/ops/opsBus.js`):
  - state: `{ rev, emergency: { on, message }, hoursPreview }` on `BroadcastChannel('dallni-ops')`;
  - a tab says `hello` on start and gets the current state;
  - newer `rev` wins;
  - without BroadcastChannel it works within the tab.
  - **Same browser only:** the prototype has no server.
- **Exits** (`src/ops/exits.js`): the entrance plates; straight-line distance only on the same level; otherwise
  "Ground level · use the stairs". Never lifts.
- **Kiosk handoff** (`src/kiosk/handoff.js`): `?from=<kiosk plate>&to=<place>&screen=place&lang=` on the same
  origin; on localhost the card says to open the kiosk with the Network URL.
- **Dashboard data** (`src/dashboard/stats.js`):
  - seeded, deterministic, labelled "Demo data · simulated";
  - counts under 10 hidden on the heatmap;
  - a sign is "Check sign" under 20 % of its expected scans.

## 5. Wide layout (900 × 560 px and up)

- **Panel:** the sheet docks under the header in a side panel at the start edge, 400 px wide (432 px from 1280 px),
  16 px from the edges, full height, no handle, no drag.
- **Map controls:** the search pill (home), the View control and the level column sit at the top of the map area.
- **Framing:** the engine frames the map beside the panel (`layoutModel.widePadding`). The docked sheet is a plain
  obstacle, so labels keep out of it without the map being cut.
- **Offers and the dashboard** are full pages with a centred max-width (1120 px / 1280 px).

## 6. Load budget

- **First screen:** 105.8 of 110 KiB, down from 109.5 before v0.5. To get there:
  - search, place, navigate, arrived, car and scan became lazy chunks, preloaded on idle;
  - the trip modules (simulator, next turn) moved to their own chunk;
  - the old home CSS was pruned.
- **Own chunks (lazy):** Offers, Mall info / Facilities, emergency, kiosk (+ `qrcode-generator` 2.0.4, MIT) and the
  dashboard.
- **3D:** the engine is unchanged (scene3d 58.4 of 60 KiB).
