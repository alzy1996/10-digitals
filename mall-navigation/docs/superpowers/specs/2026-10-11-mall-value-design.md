# Dallni v0.5 "Mall Value": Find me, Offers, Mall info, Emergency, Kiosk, Dashboard, wide layout

Date: 2026-10-11. Owner: Sam (10 Digital). Status: approved by instruction ("GO B ... COMPLETE IT"). The decisions
below were made by Claude and are listed as rulings in the final report.

## 1. What Sam asked for

- **Project B**, the Mall Value demo: a dashboard, offers, emergency mode, Ramadan hours, a kiosk and facilities.
- **First screen "locate my location":** the app opens by finding where the shopper is.
- **Two screens after that:**
  - the original map, as it is now;
  - an Offers screen with shop deals and new global brands.
- **A better first page and layout.** The screenshot showed a wide desktop window: the 3D model was pushed to the
  left, the UI sat in a 560 px centre column, and most of the screen was empty.
- Use the **ui-ux-pro-max** skill for the UI.

**Success:** a mall manager watching the demo, on a phone or a laptop, sees:
- a polished first screen;
- deals and new brands;
- hours that know Ramadan;
- facilities;
- a working emergency mode;
- a kiosk that hands the route to a phone by QR;
- a dashboard that shows what Dallni tells the mall.

Everything still runs on the free tier, with no backend.

## 2. Honesty rules (unchanged, PLAN §4, §5, §19.3)

- **Locate:**
  - Indoors, the only exact source is a QR plate (the phone camera opens `?from=<plate>`) or the shopper picking where
    they are.
  - **No GPS button.** On a fictional mall, GPS has nothing to compare against. In a real mall it gives neither the
    floor nor the shop.
  - The first screen says so in one caption line.
- **Offers:**
  - pull only (the Offers tab, the place screen);
  - never pushed, never "near you" from GPS;
  - "nearest" is walk time from the you-are-here the shopper set.
- **Demo labels:**
  - the offers and the four new brands are fictional: "Demo offers · fictional shops";
  - dashboard numbers are synthetic: "Demo data · simulated";
  - the PROTOTYPE · SIMULATION badge stays.
- **Brand rights:**
  - no real brand names, logos or colours on offers or shop cards;
  - new brands use fictional names and monogram tiles.

## 3. Screens

### 3.1 Find me (new first screen, `screen=welcome`)
- **When it shows:** the app opens on it unless the URL already says where you are (`from=`) or names another screen
  (`screen=`). Kiosk mode skips it too.
- **Map:** the 3D overview (stack) behind it, idle.
- **Head:**
  - "Welcome to {mall}";
  - a status chip: "Open now · until 22:00" or "Closed · opens 10:00", Ramadan-aware (3.4).
- **Body, in this order:**
  1. Primary 56 px button: **"Scan the Dallni sign near you"**. It opens the scan sheet: the simulated plate picker
     plus a "Tap a plate on the map" hint, with a SIMULATION note. The real flow is the phone camera opening the
     plate's URL.
  2. **"Or pick where you came in":** large chips for the two entrances (anchors of kind `entrance`) and the first lift
     lobby on each parking level ("Parking B1 · Lift A"). One tap sets you-are-here.
  3. A text button: **"Just look around"** (keeps the default start, the South entrance, labelled
     "Start: South entrance").
  4. A caption: "Indoors, GPS can't tell your floor. The sign's code tells Dallni exactly where you are."
- **"Found you" moment:** after a pick, the App:
  - switches to the Map tab (home);
  - shows the toast "Found you · {place} · {level}" (3.2 s);
  - flies the camera to a Floor view of that level, centred on the you marker (the pulse is already there).
- **A plate link** (`?from=X` with no `screen`) opens straight to home with the same "Found you" toast and fly.

### 3.2 Two tabs: Map | Offers
- **What it is:** a segmented control (two 48 px segments with an icon and a label) at the top of the Home sheet's head,
  and at the top of the Offers page.
- **Where it shows:** only on `home` and `offers`. Every task flow keeps one task per screen: search, place, navigate,
  arrived, car, scan, info, facilities and emergency.
- **Map tab:** the current Home, plus a **quick strip** of three chips under the search box:
  - "Open · until 22:00" (opens Mall info);
  - "Facilities" (opens Facilities);
  - "{n} offers" (opens the Offers tab).

### 3.3 Offers page (`screen=offers`, lazy chunk, data `offers.json`)
- **Layout:** a full page over the map: the header, the tabs, then a scrolling column (max-width 1120 px, responsive
  grid).
- **Category chips:** "All", then each category that has a live offer.
- **"Deals today":** one card per live deal. The card has:
  - a category-coloured gradient band with the big figure ("30%", "2 for 1", "OMR 5");
  - the shop name as signed;
  - the deal title in the UI language;
  - "Until {date}";
  - a level chip and a walk-time chip ("4 min");
  - a "Show me" button that opens that shop's place screen (and from there, GO).
  - Order: nearest first by walk time from you; ties by ending soonest.
- **"New in the mall · global brands":** a horizontal scroll-snap row (a grid on wide screens) of brand cards, each
  with:
  - a monogram tile;
  - the name;
  - the origin ("From Tokyo");
  - "New · opened {date}";
  - the level;
  - "Show me".
- **Footer note:** "Demo offers · fictional shops. Prices are examples."
- **No offers for:** parking-level shops, or offers whose date window is past.
- **Place screen addition:**
  - an **Offer** card under the hours when that shop has a live deal;
  - a **New** badge beside the name for new brands.

### 3.4 Hours and Ramadan
- **Venue data (`meta.hours`):**
  - mall weekly hours: Sat–Wed 10:00–22:00, Thu–Fri 10:00–23:00;
  - `specials`:
    - Ramadan 2027, expected 2027-02-08 to 2027-03-09: mall 10:00–15:00 and 20:00–01:00;
    - Eid al-Fitr 2027, expected 2027-03-10 to 2027-03-12: 10:00–24:00.
  - Each special has `shops: 'mall' | 'own'`. Ramadan: every shop follows the mall's two intervals, except shops with
    their own `ramadan` hours (the grocery 08:00–02:00, the cinema 13:00–02:00).
- **Open-state** handles several intervals and intervals past midnight.
- **`hoursPreview`** (app state: `null` or a special's id) evaluates every hours line "as if today were in that
  special". It is set from the Mall info sheet ("Preview Ramadan hours") and the dashboard. Memory only.
- **Labels:** dates are "expected" (UNVERIFIED moon sighting).

### 3.5 Mall info (`screen=info`, lazy)
- **Today:** open or closed now, and today's intervals.
- **Week table:** today highlighted.
- **Special hours:** Ramadan and Eid, with dates, intervals and a **Preview in the app** switch.
- **Services:** the info desk (lost & found), the ATM, taxi pickup and the accessible restrooms. Each row opens its
  place screen.
- **"In an emergency":** "Follow mall staff and the green exit signs. Do not use lifts."
- **Demo controls:** "Start demo emergency".

### 3.6 Facilities (`screen=facilities`, lazy)
- **Content:** every amenity, grouped: Restrooms, Prayer & wudu, Family & accessible, Money, Transport, Help.
- **Within a group:** nearest first by walk time from you, then by level.
- **Rows:** icon, name, level chip, minutes. A tap opens the place screen (the existing GO flow).
- **Filter:** a step-free toggle (the existing `stepFree`) changes the times.

### 3.7 Emergency mode (`screen=emergency`, lazy; PLAN S20)
- **Turned on by:** `?emergency=1`, the Mall info demo button, or the dashboard's Mall controls. The dashboard reaches
  other tabs through a `BroadcastChannel('dallni-ops')`: the same browser, any tab. A new tab says "hello" and gets
  the current state.
- **While on:**
  - the simulation stops and any route is cleared;
  - the screen is `emergency`, which no other screen replaces;
  - the header turns red: "EMERGENCY · طوارئ".
- **The sheet:**
  - a bilingual message (the ops text, or the default "Follow mall staff and the green exit signs. Do not use lifts.");
  - the nearest exits by straight distance from you, labelled "about 40 m", with no route (PLAN: routing stops);
  - "Lifts are not safe in an emergency."
- **The map:**
  - the exits are the entrance plates, shown as pins (`setScanPins(['entrance'])`);
  - you on the entrance level: a Floor view of that level;
  - you on another level: the stack view, so the exits and the you marker both show;
  - distances: straight-line "about N m" on the same level; otherwise "Ground level · use the stairs".
  - Lifts are never suggested.
- **Ending it:**
  - turning ops off returns to home;
  - a "Demo: end emergency" text button (prototype only) does the same.

### 3.8 Kiosk mode (`?kiosk=<anchorId>`; PLAN S21)
- **Fixed position:** you-are-here is fixed to that plate. Find me, the car chip and changing the you-are-here are
  hidden.
- **Look:** the wide layout when the screen is at least 900 px wide; big type everywhere (`.is-kiosk`, +2 px body
  text).
- **Header:** "Kiosk · You are here: South entrance".
- **Idle reset:** after 60 s with no input it resets to home and shows the attract overlay "Touch to find any shop ·
  المس للبحث عن أي متجر". The overlay is DOM with a CSS pulse, so the 3D view stays at 0 frames when idle.
- **"Continue on your phone":**
  - a QR card on the place and navigate screens;
  - it encodes `origin + base + ?from=<kiosk anchor>&to=<target>&screen=place&lang=<lang>`;
  - on `localhost` it adds "Open the kiosk with the Network URL so phones can follow this code."
  - QR library: `qrcode-generator` 2.0.4 (MIT), only in the lazy kiosk chunk.

### 3.9 Mall dashboard (`?screen=dashboard`, its own lazy entry; no 3D)
- **Header:** "Dallni · Mall dashboard · {mall}", "Last 30 days", and the badge "Demo data · simulated".
- **KPI tiles:**
  - journeys;
  - shoppers using Dallni (% of footfall);
  - car saves;
  - find-my-car success;
  - average time to shop (versus the measured baseline);
  - average time to car;
  - offer taps.
- **Charts** (inline SVG, no chart library; each has a table alternative for screen readers):
  - journeys per day (30 bars, Thursday and Friday peaks);
  - busiest hours (24 bars);
  - top searches (bar list).
- **"Searched but not found" (for Leasing):** generic terms (cinema IMAX, pet shop, shoe repair, Turkish restaurant,
  kids salon, bowling…) with counts and an "Export CSV" button (a client-side download).
- **Zone heatmap:** an SVG floor plan per retail level from the unit polygons, units shaded by visits. Any count under
  10 is hidden (PLAN rule).
- **Plate health:** plates with expected and actual scans; red when actual is under 20% of expected.
- **Offer performance:** views and taps per deal.
- **Mall controls (demo):**
  - Emergency mode, with a confirm step;
  - Preview Ramadan hours.
  - Both broadcast to open shopper tabs.
- **"Download monthly report":** `window.print()` with a print stylesheet (Save as PDF). No jsPDF.
- **Data:** synthetic, from a seeded PRNG over the venue (deterministic, unit-tested).

### 3.10 Wide layout (at least 900 px wide)
- **Side panel at the start edge:** 400 px (432 px from 1280 px), 16 px from the edges, full height. It holds:
  - the header;
  - the current sheet, **docked**: no handle, no drag, snap fixed at full with `stretch`, the body scrolls and the
    footer stays pinned.
- **Map controls:** the View control and the level picker sit at the end edge of the map area.
- **Map padding:** start = panel end + 16 px; top = the controls row; bottom = 16 px. The docked sheet is a normal
  obstacle, not `kind: 'sheet'`: that kind would cull everything below its top edge.
- **Offers and the dashboard:** full pages with a centred max-width.
- **Below 900 px:** nothing changes (the mobile layout as now).

## 4. Data

- **`venue.json` (generator):**
  - `meta.hours` (3.4);
  - `ramadan` hours on the grocery and the cinema;
  - four occupants renamed to fictional global brands. Their ids, categories and units stay; the old ids are not
    referenced by tests or docs:
    - `occ-jebel-sports` → `occ-strivano` "Strivano" / «سترايفانو» (fashion, G, from Melbourne);
    - `occ-mango-breeze` → `occ-maison-lumel` "Maison Lumel" / «ميزون لوميل» (cafe, G, from Paris);
    - `occ-noodle-dhow` → `occ-hoshikaze-ramen` "Hoshikaze Ramen Lab" / «مختبر هوشيهوشيكازي» (food, L1, from Tokyo);
    - `occ-pixel-souq` → `occ-nova-arcade` "Nova Arcade" / «نوفا أركيد» (electronics, L1, from Seoul).
- **`public/venues/demo-muscat/offers.json`:**
  - `deals`: 9, each `{ id, occupantId, figure{en,ar}, title{en,ar}, from, to }`, dates around today and into Ramadan;
  - `newBrands`: 4, each `{ occupantId, origin{en,ar}, openedOn }`.
  - It loads after the first screen, at the same idle point as the engine.

## 5. Architecture and budgets

- **First screen (budget 110 KiB, unchanged):**
  - The search, place, navigate, arrived, car and scan screens become lazy chunks. They are prefetched on idle after
    the first screen, with a skeleton sheet as the Suspense fallback.
  - `TILE_IDS` moves out of `search.js`.
  - Strings for the lazy screens live in `src/i18n/strings-more.js`, registered by those chunks through
    `addStrings()`.
  - The first screen gains Find me, the tabs, the quick strip, the wide layout and the hours model.
- **Lazy chunks:**
  - `offers` (page + offers model);
  - `mallinfo` (Mall info, Facilities);
  - `emergency`;
  - `kiosk` (+ QR library);
  - `dashboard` (separate entry, chosen in `main.jsx` before App loads).
- **3D engine: no change** (scene3d is at 58.4 of 60 KiB). It reuses `setScanPins`, `flyTo` and `setView`.
- **New pure modules (unit-tested):**
  - `src/ui/hours.js` (effective hours, multi-interval open state, week table);
  - `src/offers/offers.js` (live deals, sort, filter, new brands);
  - `src/ui/firstScreen.js` (which screen opens, the entry choices);
  - `src/ui/layoutModel.js` (wide padding and obstacles);
  - `src/ops/opsBus.js` (state merge, message validation);
  - `src/kiosk/idle.js` (idle reset);
  - `src/dashboard/stats.js` (synthetic stats).

## 6. UI rules (ui-ux-pro-max)

- **Rules applied:**
  - touch targets at least 44 px (56 px for primary actions);
  - text contrast at least 4.5:1;
  - visible focus rings;
  - SVG icons only, no emoji;
  - transitions of 150–300 ms on transform and opacity;
  - `prefers-reduced-motion` respected;
  - no horizontal page scroll (only the brand row scrolls, with scroll-snap);
  - tabular numerals on KPIs;
  - a z-index scale (map 0, sheet 30, top 35, page 40, emergency 50, attract 60).
- **Checked at:** 375, 768, 1024 and 1440 px, in EN and AR.
- **Visual language:** the v0.3 bright game UI (white raised cards, teal accents, amber SIMULATION badge,
  Readex Pro). Offer cards add category gradients and big numerals; the dashboard is white cards on #F2F6FB.
- **Not available:** the skill's search database is not installed (only its SKILL.md), so its rule set and
  pre-delivery checklist were applied by hand.

## 7. Testing

- **Unit:** every pure module above, plus i18n parity for the new strings.
- **Build:** the budgets.
- **Browser probes (vite preview, headless):**
  1. the first screen is Find me, and an entrance chip leads to home with "Found you";
  2. `?from=` skips Find me;
  3. the Offers tab lists deals nearest first, and "Show me" opens place;
  4. Ramadan preview changes a shop's hours line;
  5. emergency through the BroadcastChannel from a dashboard page reaches a shopper page;
  6. kiosk: the QR shows on place, and the idle reset brings back the attract overlay (with a short test timeout via
     `?kioskIdle=`);
  7. wide 1440×900: the panel is docked at the start, and the model is framed right of it (canvas centre-of-mass check);
  8. the dashboard renders with no console errors;
  9. budgets.
- **Screenshots** for review: 390×844 and 1440×900, EN and AR.

## 8. Out of scope

- "%" tags on the 3D map.
- Offer chips on navigate steps.
- Push or beacons.
- Real camera QR scanning in the app (the phone camera does it).
- An on-screen kiosk keyboard (the OS keyboard is used).
- Firebase or a real ops backend.
- jsPDF reports.
- Vacant units or "opening soon" hoarding.
- Banner messages.
