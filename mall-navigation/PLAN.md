# Dallni (دلّني): Mall Navigation & Find-My-Car. Master Plan (v1, 2026-10-08, by 10 Digital)

**STATUS:** Planning only. No code yet.
**PREPARED FOR:** Sam Ubi, 10 Digital, Muscat.
**MONEY:** OMR figures are 10 Digital estimates unless a source is cited. 1 USD ≈ 0.3845 OMR (the fixed peg).
**UNVERIFIED** means a claim that could not be confirmed on 2026-10-08.
**NAMING RULE:**
- **STAGE A–E** = product and business stages.
- **PHASE 1–5** = Sam's build phases.
- The two are never mixed.

---

## 0. TL;DR

- **WHAT.** An install-free web app in Arabic (RTL) and English. Shoppers open it by scanning QR plates in the mall. It lets them:
  - find any shop;
  - follow a step-by-step route on a multi-floor map;
  - save where they parked;
  - get guided back to the car.
- **HARD TRUTH.** A continuous "Google Maps blue dot" indoors is not possible for free in iPhone Safari. Safari has no Bluetooth scanning, no Wi-Fi scanning, no barometer and no WebXR AR. In v1, "real time" means:
  - an exact position at every plate scan;
  - step-by-step guidance between scans.
- **"VR" IS ACTUALLY AR.** Arrows fixed to the floor on iPhone web need a closed or paid engine, or a native app.
  - The pilot ships with no camera mode.
  - A "camera arrows" beta comes only after Eid al-Fitr 2027, and only if a compass field test passes.
- **10x FEATURE: THE PROOF REPORT.** Every month the mall gets measured results:
  - time-to-shop and time-to-car;
  - how often the directions were wrong (wrong-step rate);
  - missed demand: what shoppers searched for and didn't find.

  Competitors sell maps. Dallni sells measured results.
- **SIGNATURE UX: THE CAR CARD.** Colour, an Omani icon and the bay code, e.g. "Blue · Falcon · B2-14". It is saved as a message or a screenshot that stays readable with zero signal.
- **COMPETITION.** Oman Avenues already has parking QR codes that open a web map (3D Wayfinder, vendor claim). A map plus save-car only matches what exists. The moat is:
  - a managed service;
  - Arabic-first design;
  - measured results;
  - from mall #3, a cross-mall "Demand Radar".
- **STACK.** React 18.3.1, Vite, Tailwind and Firebase.
  - Map: MapLibre (loaded only when needed), with an SVG fallback.
  - Routing runs on the phone.
  - No server code and no paid APIs.
- **FREE TIER.** Fine for development and demos. It breaks at a real mall: Hosting runs out at about 450–1,700 users/day. The pilot needs one of:
  - Firebase Blaze, about USD 14–44/month, built into the subscription;
  - Cloudflare static hosting at $0.

  **Sam decides (Q2).**
- **MONEY.** The mall pays: setup OMR 1,200–2,500, then OMR 180 or 390 a month (estimates).
  - At least 2 Pro malls are needed just to cover product upkeep.
  - About 3 malls are needed to pay back the build, around month 15.
  - Oman's ceiling is about OMR 47–70k recurring revenue a year. This is a product line, not a whole company.
- **DATES.**
  - Now: Demo Mall plus MVP.
  - 15 Dec 2026: go/no-go on a signed letter of intent (LOI).
  - About 1 Feb 2027: soft launch.
  - Proof window: Ramadan (about 8 Feb) to Eid al-Fitr (about 9–10 Mar).
  - Fallback: Eid al-Adha (about 16–17 May).

### HONESTY BOX

| Feature | Free? | iPhone web | Android web | Needs native / hardware / paid | Verdict |
|---|---|---|---|---|---|
| 2D multi-floor map, search, route | Yes | Yes (WebGL2; SVG fallback) | Yes | No | **MVP** |
| QR plate "you are here" (exact + floor) | Yes (printing) | Yes (native Camera app) | Yes | Printed plates | **MVP core** |
| Save car (plate / typed code / zone picker) | Yes | Yes | Yes | No | **MVP core** |
| Return-to-car route | Yes | Yes | Yes | No | **MVP core** |
| Continuous live blue dot (1–3 m) | **No** | **No** | **No** | Beacons / IndoorAtlas / VPS | Stage E, only if the mall pays |
| Estimated dot (step counting + compass, locked to the route) | Yes | Yes (permission tap) | Yes | No | Beta after Eid, only if the field test passes |
| Automatic floor detection | No | **No** (no barometer) | **No** | Native barometer | MVP uses a "Now on Level 1? Yes/No" check |
| Camera arrows (camera + compass arrow, not fixed to the floor) | Yes | Yes | Yes | No | Beta after Eid, only if the compass test passes |
| AR arrows fixed to the floor | No | **No WebXR** | Certified ARCore phones only | 8th Wall binary (licence review) / native | Stage E premium |
| BLE beacons | No | **No** browser support | Behind a flag only | Native + $12–25 per beacon | Only if the mall pays |
| Wi-Fi RTT | If the mall's access points support it | No | No | Android native only | Stage E |
| Apple indoor positioning | Free program | 2D position only, **no floor** (if Oman is covered: UNVERIFIED) | No | The mall must join Apple's program | Ask Apple in Stage A |
| NFC URL tag beside the QR | Tag cost (UNVERIFIED) | Yes (iPhone XS+, tap the notification) | Yes | On-metal tags | Optional |
| Voice turn prompts | Yes | Yes (Arabic voice quality UNVERIFIED) | Yes (Arabic voice may be missing) | Pre-recorded fallback clips | **MVP** |
| Vibration | Yes | **No** | Yes | Native app for iPhone | Android only in the MVP |
| Works offline in the basement | Yes | Returning visitors only | Returning visitors only | A first-time visitor with zero signal gets nothing | Put plates only where there is signal |
| Car photos in the cloud | No (Storage needs Blaze) | — | — | Blaze | Out; the photo stays on the phone |
| SMS login | No (Blaze only) | — | — | Blaze | Out; shoppers never log in |

---

## 1. PROBLEM & OPPORTUNITY

**THE PROBLEM**
- Big multi-floor malls with underground parking. GPS is off by tens of metres indoors and gives nothing underground.
- **Lost cars.** Churchill (UK, 2025):
  - 21% of drivers lost their car over Christmas;
  - the average search took **13 minutes**;
  - shopping-centre car parks were the top location (32%).
  - There is no GCC figure, so we will measure our own.
- **App fatigue.**
  - 33% say they "don't want more apps" (Ipsos, US).
  - Google Play Instant shut down in December 2025.
  - App Clips launched from a QR code are capped at 15 MB.
  - So a QR-opened web app is the right channel.

**OMAN SPECIFICS**
- Google's indoor-maps country list has the UAE as its only GCC entry. **Oman is not listed.** We found no Apple indoor maps in Oman.
- Oman had about 4M visitors in 2025, including 137,330 who arrived by cruise ship or yacht. These people won't install an app.

| Mall | Owner | Size / parking | Wayfinding today | Fit |
|---|---|---|---|---|
| Mall of Oman | MAF | ~145k m² leasable area, 350 units, 5,200–5,500 bays | None found; MAF's SHARE loyalty app launched in Oman 24 Sep 2026 | Hard |
| City Centre Muscat / Qurum | MAF | ~60k / ~26.5k m² | Park Assist plate-search kiosks (2016) | Hard |
| Oman Avenues | Al Taher / LuLu | ~72k m², 300+ stores | 3D Wayfinder kiosks + parking QR (vendor claim, current status UNVERIFIED) | Would mean replacing a vendor |
| **Muscat Grand Mall** | Tilal Development | ~150+ brands; 1,800 bays under Park Assist | Bay guidance, Hayak system (2025); find-my-car not confirmed | **First target** |
| Al Araimi Boulevard | Al Raid Group | 250–264 shops | Visioglobe app from 2018 (status UNVERIFIED) | Replacement sale |
| Mall of Muscat | Tamani Global, LuLu as adviser | 4M+ visitors a year | None found | Backup (LuLu ties) |
| Panorama | — | Many vacant units | None | Skip (no budget) |

**COMPETITOR GAP**
- **Mappedin:**
  - the Free plan cannot publish;
  - Plus is $25 and Pro is $165–200 per map per month;
  - it **already does Arabic** for Cenomi's 21 Saudi malls.
- **Pointr:** built Reem Mall, Abu Dhabi. Quote only.
- **IndoorAtlas:** €349 per venue per month, up to 10,000 m².
- **The gap:** no Omani mall has a maintained, Arabic-first wayfinding service that reports measured results.
- **Honest:** we can't beat Mappedin on software price. We win on:
  - a managed service;
  - local presence;
  - Arabic-first UX;
  - measured results.

---

## 2. PRODUCT CONCEPT

**ONE-LINER:** "Scan a sign. Find any shop. Get back to your car. No app."

| Name | Arabic | Meaning | Conflict check |
|---|---|---|---|
| **Dallni** (recommended) | دلّني | "Guide me" | No exact GCC match; Deallony/DLENY exist in other categories (low risk) |
| Bawsala | بوصلة | Compass | No app found; the word is generic, so the trademark would be weak |
| Nuqta | نقطة | "Dot" | A 2013 calligraphy app uses it; it also suggests a live dot we can't deliver |
| Wainak? | وينك | "Where are you?" | Qatar has a "Wain" maps app (moderate risk) |
| Sikka | سكة | Lane / path | Only Sika Group found; otherwise UNVERIFIED |
| Mawqifi | موقفي | "My parking spot" | Crowded field (Mawqef, Mawgif, Mawqif). **Use only as the car feature's name** |

- **Recommended: Dallni.** It is a verb that names the job and reads well in both languages.
  - The MOCIIP trademark check and the domain check are **UNVERIFIED**. Do both before printing anything.
- **Tagline:** EN "Scan. Go. Back to your car." / AR «امسح، امشِ، وارجع لسيارتك»
- **Personality:** a calm Omani host. Plain-spoken, Arabic-first, never overpromises.
- **Vocabulary rule:** say "Scan & Go" and "camera arrows". **Never** say "AR navigation", "indoor GPS", "live location" or "VR".

**SIGNATURE 10x FEATURE: THE PROOF REPORT**
- Every journey starts with a scan or tap and ends with a scan or tap: "Found it ✓", "Found my car ✓", or a re-scan. So the app records real numbers, not estimates:
  - time-to-shop and time-to-car;
  - completed journeys;
  - wrong-step rate;
  - missed searches in Arabic, English and Arabic typed in Latin letters ("Arabizi"), merged into one list;
  - plate health and directory accuracy.
- It comes as a monthly 5-page PDF plus a live dashboard.
- **Before/after comparison:** staff time real shoppers the same way before launch and during the pilot (§13).
- **Why competitors miss it:** Mappedin reports missed searches for one venue only. No one in Oman sells measured journey times.
- **Network layer, from mall #3: "Oman Demand Radar"**, comparing malls with each other. It needs:
  - a data-rights clause in every contract;
  - a minimum count per cell;
  - a test of whether Oman's search volumes are big enough to give meaningful rankings.

**SIGNATURE UX: THE CAR CARD** (details in §7).

---

## 3. USER JOURNEYS

**DESIGN LAWS**
1. The printed sign is the product.
2. Never show a position or arrow we can't trust.
3. One screen, one task, one big button.
4. Directions follow the person walking, never the screen.
5. Everything still works if every permission is denied.

**(a) PARK & SAVE THE CAR**
1. From the car, the driver sees a zone sign mounted above car-roof height: "Blue • Falcon • B2".
2. They scan the plate on the aisle side of a pillar, or at the lift lobby, using the phone's own camera. That opens `/p/{venue}/{code}`: a tiny page with no map.
3. One button: **"Save my car here · kept 24 h"**. That tap is the consent.
   - Success shows instantly.
   - On weak signal, the save is queued and a "not synced" badge stays until it is confirmed.
4. **Car Card** appears with two buttons: "Save a copy" (the phone's share sheet) and "Take a screenshot".
5. The same scan also sets "you are here" and the entry point. Next screen: **"Where to?"**
- **No signal:** the plate itself says "No signal? Photograph this plate". The user picks the zone later in the zone picker.
- **Arrived without scanning** (taxi, drop-off, walk-in): an entry-point picker.

**(b) FIND A SHOP**
1. **Home:** "You're at Gate 3 · Ground", 6 tiles (Food, Toilets, Prayer, Pharmacy, Kids, Exit/Taxi) and a search box.
2. **Search** handles Arabic, English, Arabizi and typos. With no result: "Not in this mall. Try: …" (logged as missed demand, after scrubbing personal data).
3. **Place screen:** the name as written on the shop front, floor, walking minutes, a step-free badge, and opening hours ("Opens 10:00" if closed).
4. **GO.** This one tap:
   - unlocks audio;
   - keeps the screen awake;
   - asks once whether the user needs step-free routes.
5. **Step card:** "Turn left after Carrefour · 40 m · about 1 min · Step 2 of 6", a big **Next** button, and voice.
6. **Arrival:** full-screen ✓ → **"Found it ✓"** → "Back to my car" or "Another shop".

**(c) CHANGE FLOORS**
1. The step reads "Escalator E2 up → Level 1 (Food court)". In step-free mode: "Lift L3 · press '1'", with the label copied from the real lift panel.
2. **"Now on Level 1?"**
   - Yes → the map fades to the new floor.
   - No → floor picker, then a new route.
3. The app never moves on by itself. If there's no answer, voice repeats the question after 60 s.

**(d) RETURN TO THE CAR**
1. Tap **"My car · Blue Falcon B2-14 · Take me there"**.
2. If the last position fix is more than 5 minutes old, the app asks for a fresh one: in-app Scan, "I'm near [shop]", or Type code.
3. In a paid car park: "Pay parking first?" routes through the pay station.
4. The route goes through the right lift lobby, then a floor check: "Now on B2?"
5. The final stretch (lift lobby → bay) was worked out back when there was still signal.
6. **"Found my car ✓"** deletes the record and logs time-to-car.
- Near closing time, routes use only doors that are open now, and a banner appears 30 minutes before closing.

**(e) MEET A FRIEND**
- Pick your last scanned sign or a landmark, then share the link (WhatsApp or the share sheet).
- It is a **fixed pin stored inside the link** (no server write), never live tracking.
- The friend opens it and taps "Take me there". If they're not at the mall yet: "Scan any sign when you arrive."

**(f) STEP-FREE ROUTE**
- The first GO asks once: "Need step-free routes?" The answer is saved on the phone.
- Step-free routes:
  - use lifts only;
  - avoid stairs, escalators, inclined travelators and heavy doors;
  - turn voice on.
- If a lift is marked broken, the user sees "Lift L2 out of service, using L4".
- Accessible parking bays route through the nearest step-free lift lobby.

**EMERGENCY.** If mall Operations switches on emergency mode:
- all routing and the camera stop;
- the screen shows "Follow mall staff and green exit signs" / «اتبع موظفي المول وإشارات الخروج الخضراء» plus a static exit map;
- lifts are never suggested.

---

## 4. "WHERE AM I": POSITIONING STACK BY STAGE

σ is the error radius: how far off the position could be.

| Method | Accuracy | Cost | iPhone web | Android web | Native | Stage |
|---|---|---|---|---|---|---|
| QR plate (anchor ID in the URL) | Exact at scan (σ 1.5 m), floor encoded | Printing | Yes | Yes | — | MVP |
| Typed plate code (with check character) | Exact | $0 | Yes | Yes | — | MVP |
| "I'm near [shop]" picker | ~10 m (soft fix) | $0 | Yes | Yes | — | MVP |
| Floor check Yes/No | Floor only | $0 | Yes | Yes | — | MVP |
| "Next" tap on the step card | Which step you're on | $0 | Yes | Yes | — | MVP |
| GPS | Tens of metres; nothing underground | $0 | Arrival at the mall and outdoor lots only | Same | — | MVP (outdoors only) |
| NFC URL tag | Exact at tap | On-metal tags (price UNVERIFIED) | iPhone XS+ via a notification | Yes | — | Optional |
| Step counting + compass (PDR), snapped to the route | 1–2 m per 100 m in labs; worse in a mall (UNVERIFIED) | $0 | Yes (permission tap) | Yes | — | Stage C beta, gated |
| Sign-Lock (compass calibration at scan) | Experiment | $0 | In-app scan after permission only | Yes | — | Stage C experiment |
| Barometer | Floor *changes* only | $0 | **No** | **No** | Yes | Stage E |
| Wi-Fi RTT | 1–2 m with 3+ supporting access points | $0 if the access points support FTM | No | No | Android only | Stage E |
| Apple Indoor Maps Program | 2D only on the web; **no floor field**; accuracy UNVERIFIED | Free, but the mall must join and survey | Yes, if Oman is covered (UNVERIFIED) | No | Core Location gives the floor | Ask Apple in Stage A |
| BLE beacons | ~2–3 m (vendor claim) | $12–25 each. Mall of Oman ≈1,450 beacons ≈ **$17k–36k**, plus batteries every 1.5–5 years (estimate) | No | Behind a flag | Yes | Stage E, mall pays |
| IndoorAtlas (geomagnetic) | 1–2 m (vendor claim) | ~€0.42/m²/year (Med confidence). Mall of Oman ≈ **€61k/year**; City Centre Muscat ≈ **€25k/year**; more once corridors and parking are counted | No | No | Yes | Stage E, mall pays |
| VPS (Immersal / MultiSet / Niantic) | cm to 1 m once it locks on | Immersal Pro $99/month; Niantic $100 per private location plus calls | Partial | Partial | Mostly | Stage E, 2–3 junctions only |

**HOW THE POSITION IS WORKED OUT (plain words)**
1. Every input reports a fix: a map node or point, the floor, an error radius (σ), and a time.
2. A **firm fix** (a plate scan or typed code) resets everything.
3. Between fixes, the position **slides along the planned route only**: by Next taps in the MVP, by steps × step length in the beta. It never wanders freely.
4. The compass only picks between corridors at junctions. It never moves the dot. If the heading points against the route for about 8 steps, an off-route score rises.
5. The floor changes only on a connector event: a scan, a "Yes" on the floor check, or (in the native app) a barometer step.
6. Step length starts at 0.7 m (UNVERIFIED). It is recalibrated at every pair of scans: map distance between the two signs ÷ steps counted.
7. σ grows with distance walked since the last fix, and when compass accuracy is worse than 25° or the readings jump around.
8. An Apple position, if one ever exists, is only a **soft 2D fix**. It never sets the floor.

**WHAT THE SCREEN SHOWS WHEN UNSURE**

| Confidence | Rule | Screen |
|---|---|---|
| High | σ ≤5 m and last fix <90 s ago | Solid dot labelled "Gate 3 sign"; camera arrow allowed (beta only) |
| Medium | σ 5–15 m | Hollow dot with a halo, "About here"; the step card leads |
| Low | σ >15 m, off-route, or compass not trusted | No dot. Grey pin "Last confirmed: Escalator E2 · 2 min ago" plus **Fix my position**. Nothing is ever blocked |

- **MVP default:** an exact dot after each scan, then step cards only. After 2 minutes it switches to the "Last seen" state. There is no estimated dot until the field test passes.
- **Permissions:**
  - at most one system prompt per screen, each after a one-line explanation in Arabic and English;
  - iOS motion permission is asked only from a tap, and only when a beta needs it.
- **Sign-Lock limits.** Scanning with the phone's own camera opens a new tab that has no motion permission and doesn't know how the phone is held, so no heading can be captured. Therefore:
  - it works only from the in-app scanner, after permission;
  - it is a measured experiment at about 20 points, never a marketing claim.

---

## 5. "VR/AR MODE": WHAT IT REALLY IS

- **Sam said VR; what he means is AR:** a live camera view with arrows. VR means a headset world, which doesn't apply here.
- **The facts:**
  - iPhone Safari has no WebXR `immersive-ar`. Safari 27 added only the `<model>` element, which does not track the room.
  - Android Chrome supports it on Google-certified ARCore phones only.
- **AR is not the hard part. Knowing where the user is, is.**

| Version | What it is | Platforms | Cost | When |
|---|---|---|---|---|
| **Pilot (MVP)** | **No camera mode.** Map, step cards and voice | — | $0 | Feb–Mar 2027 |
| **Camera arrows beta ("Camera Guide")** | Full-screen camera, one 160 px on-screen arrow (compass vs route direction), step card on top. **Not fixed to the floor** | iPhone + Android web | $0 | Stage C, after Eid al-Fitr, only if at least 80% of readings at decision points are within ±20° and bad readings are flagged |
| Floor-fixed arrows (web) | 8th Wall Distributed Engine Binary (SLAM), re-anchored at each plate | Both | Free limited licence; **legal review needed** | Stage E, mall pays |
| Native AR + camera positioning (VPS) | Custom Capacitor plugin (ARKit/ARCore) + Niantic VPS | Native | Apple $99/yr + Google $25 + $100 per private location + call fees | Stage E, mall pays |

- **Ruled out:**
  - no maintained Capacitor AR plugin exists;
  - ViroReact is React Native, so it would be a second app;
  - React Three Fiber 9 needs React 19.
- **Trust rule:** if `webkitCompassAccuracy` goes above about 25°, or the heading jumps around, the arrow is replaced with "Arrow paused, compass unreliable here" plus the landmark step. Steel distorts the compass.
- **Safety rules:**
  - "Look up" banner after 10 s of walking;
  - camera off when the phone is lowered or the app goes to the background;
  - back to the map automatically after 60 s (proposal);
  - paused on escalators and lifts ("Hold the handrail");
  - "Watch for cars" in parking;
  - never the default, never required, off in emergency mode;
  - no hash-based navigation while the camera is on (WebKit bug 215884);
  - test the iOS 26 home-screen 90° rotation bug.
- **Battery:** AR draws 20–80% more power than a phone can sustain, so cap session length.

---

## 6. THE MAP

**SOURCE & RIGHTS**
- Use the mall's **DXF** files, not DWG (DWG needs a paid library), under a **written data licence**.
  - Omani law protects drawings. Whether it covers maps explicitly is UNVERIFIED, so put it in the LOI.
- **No OpenStreetMap.** Its share-alike licence conflicts with Sam owning 100% of the data, and there is no confirmed indoor data for Muscat malls.
- Directory maps are not drawn to scale, so an on-site walk is **mandatory**.

**MAP STUDIO PIPELINE**
1. **Import.** Convert DXF to GeoJSON once with GDAL `ogr2ogr` on Sam's PC, or load a PNG/PDF.
2. **Calibrate.** 2–3 control points (local metres) plus 2 GPS points at entrances, so the map can be exported in real-world coordinates.
3. **Trace.** Mall #1 in **QGIS** (free). The in-browser tracing tool (A03) gets built only when mall #2 signs.
4. **Walking network:**
   - corridor centrelines; drawing a door creates a routing point automatically;
   - one-way escalators;
   - lifts with their stops and real button labels;
   - stairs, ramps, inclined travelators and heavy doors;
   - step-free flags and opening hours.
5. **Parking:**
   - car parks, with level names copied from the lift buttons;
   - zones with colour + icon;
   - bays and pillars, using the mall's **existing painted codes** as the official codes;
   - pay stations and accessible bays.
6. **Signs:** code with check character, floor, position, map point, wall facing direction, two mounting heights, NFC, photo.
7. **Assign shops** by CSV/XLSX import.
8. **Checks.** Errors block publishing:
   - every door reachable from every entrance, with and without stairs;
   - no orphan points, no one-way dead ends;
   - no units without doors, no shops without a unit;
   - no missing Arabic or English names;
   - every sign has a map point and a facing direction; no duplicate codes;
   - every bay reachable from a lift lobby;
   - every connector present on all its levels;
   - no invalid shapes; every amenity reachable step-free;
   - file-size limits met; IMDF required fields filled.
9. **Publish.**
   - The browser compiles a versioned bundle.
   - The runner deploys it (hourly, or on demand).
   - One-click rollback.
   - The current version plus the last 3 are kept.

**EFFORT (estimates)**
- **Mall #1:** 120–240 h in QGIS, including a 16–24 h site walk. Benchmark: MapsPeople quotes 60–80 h per 10,000 m² working from CAD.
- **Later malls** with the tracing tool: 80–120 h.

**DATA STANDARD: IMDF-ALIGNED.** IMDF 1.0.0 is OGC Community Standard 20-094. It is GeoJSON-based and free to implement.

| Entity | Key fields |
|---|---|
| venue / level | name{ar,en}, timezone, publishedVersion · ordinal, shortName{ar,en} as printed on the lift buttons |
| unit / opening | IMDF category, polygon, accessibility · line, linked units, routing point |
| occupant (shop) | **unitIds[]**, **entrances[nodeId]**, name{ar,en}, transliterations[], category, keywords, hours (weekly + dated overrides), status, landmarkScore 0–3; kiosks and pop-ups carry start and end dates |
| amenity | subcategory: musalla_men, musalla_women, wudu_men, wudu_women, restroom_men, restroom_women, restroom_accessible, restroom_family, baby_change_men / _women / _family, accessible_parking, atm, pharmacy, first_aid, info_desk, valet, taxi_pickup |
| signAnchor (QR plate) | code + check char, levelId, xy, nodeId, type, facingDegTrue, zoneSignHeightCm, plateHeightCm, nfc, status, expectedScanRate. Exported as an IMDF extension (naming UNVERIFIED) |
| carPark / zone / bay | levels, entrances, hours, paid flag, payStationNodeIds · colourKey, iconKey, label · code, nodeId, externalIds (e.g. Park Assist) |
| nav node / edge | type · lengthM, type (walk/escalator/lift/stairs/ramp/travelator), oneWay, stepFree, travelator_incline, heavy_door, hours, baseCostS |
| connector | type, direction, **stops[{levelId, buttonLabel{ar,en}}]**, waitS, perFloorS |

**RENDERING**
- **MapLibre GL JS 6.13** (BSD-3 licence; needs WebGL2; draws Arabic labels natively since 6.9; about 430 KB gzipped). It loads only after the first step card is on screen.
- **SVG floor drawing for each level** as the fallback: for phones without WebGL2, budget phones, in-app browsers, screen readers and printing.
- Flat 2D by default; an "Overview" switch shows a tilted 2.5D view. No three.js.
- **Custom 56 px zoom, recentre and floor buttons.** MapLibre's defaults are 29×29 px, below the 44 px minimum.
- The map rotates so the current step points up the screen. This uses the shape of the route, not the compass.

**ROUTING**
- **Engine:** ngraph.path A* runs on the phone and works offline. The library is about 3 KB and routes a 264k-node graph in about 55 ms.
  - One-way edges are supported.
  - A blocking callback applies: step-free, outages, corridor blocks, opening hours and emergency mode.
- **Edge costs.** Defaults are UNVERIFIED; calibrate them on site.

  | Edge | Cost |
  |---|---|
  | Walk | length ÷ 1.2 m/s |
  | Escalator | length ÷ 0.5 m/s + 5 s |
  | Lift | 45 s wait + 4 s per floor |
  | Stairs | 15 s per floor |
  | Parking driving lanes | ×1.5 |
  | Service corridors | blocked |

- **Turn instructions:**
  - turn angle classes: under 30° straight, 30–60° slight, 60–135° turn, over 135° U-turn;
  - consecutive straight sections are merged;
  - the landmark is the one with the highest landmarkScore within about 15 m, **chosen after live changes are applied**, so closed or blocked landmarks are skipped and permanent ones (fountains, atriums) are preferred;
  - left/right comes from the walking direction;
  - each language has its own sentence templates, never stitched-together strings.
- **Re-route when:**
  - a scan comes from a sign not on the route;
  - the user picks "near [shop]" off the route;
  - the floor check gets "No";
  - a live change affects the route or closes the destination;
  - the step-free setting changes.

  Re-routing waits 3 s so it doesn't fire repeatedly.

**MAINTENANCE: WHEN SHOPS CHANGE**

| Change | How | Live in |
|---|---|---|
| Rename / close / re-categorise | Tenant Editor on a phone → live document | <60 s |
| Shop moves to another unit | Unit override (no new geometry) | <60 s |
| Lift or escalator out, reversed, or off at night | Connector override | <60 s |
| Hoarding or atrium event closes a corridor | Corridor block {edgeId, reason, until} | <60 s |
| Pop-up kiosk | Kiosk occupant with start and end dates | <60 s |
| Ramadan / Eid / Muscat Nights hours | Dated hours override, Asia/Muscat time zone | <60 s |
| Unit split or merge, new geometry | 10 Digital editor → publish | ~1 h |
| Emergency | Ops role, after re-entering their password | Immediate |

- **Process & SLA:**
  - Leasing sends a weekly list of tenant changes;
  - directory changes go live within 1 business day; safety items the same day;
  - a monthly audit walk checks 10% of units;
  - "directory accuracy %" appears in the Proof Report;
  - Arabic names are copied from the shop-front signs during the site walk.

---

## 7. FIND-MY-CAR

**WAYS TO SAVE THE CAR**

| # | Method | Time | Precision | Guides you back? |
|---|---|---|---|---|
| 1 | Scan the plate (pillar or lift lobby) | ~5 s | Bay or zone + level | Yes |
| 2 | Type the code painted on the pillar (works with **zero plates**; check character) | ~10 s | Bay + level | Yes |
| 3 | Zone picker (car park → level → colour + icon tiles) | ~10 s | Zone | Yes |
| 4 | Outdoor lot: GPS-assisted save (location prompt only on outdoor plates) | ~5 s | GPS accuracy | Yes |
| 5 | Your own photo of the plate (stays on the phone; never read by the app, so no OCR) | ~5 s | Memory aid | After picking a zone |
| 6 | Text note | ~20 s | Memory aid | No |

- Valet desk and taxi/ride-hail pickup are also destinations.

**TWO LAYERS OF SIGNS IN PARKING**
1. **Zone sign** at about 2 m or more, above car-roof height. Colour, icon, and bilingual zone and level. Visible from the car and the aisle.
2. **Scannable plate** at 90–120 cm on the **aisle-facing** side of pillars and at lift lobbies, where people can reach it safely.
- Confirm heights against the local code and with Operations during the site walk (UNVERIFIED as a standard). Both heights are recorded in the sign's record.

| | Underground | Outdoor |
|---|---|---|
| GPS | None | Helps with saving |
| Signal | Measure every level in Stage B; place "save" plates only where there is signal | Usually fine |
| First-time visitor, zero signal | **Nothing loads.** Physical fix: "No signal? Photograph this plate", then add the zone later | — |
| Returning visitor | Full offline use (cached) | Same |
| Mall Wi-Fi login page (captive portal) | The mall must let the app's domains through without login (behaviour UNVERIFIED; test it) | Same |

**THE CAR CARD (signature UX)**
- **What it shows:**
  - "Blue · Falcon · B2-14 / أزرق · صقر · ب٢-١٤", level and lift lobby;
  - "Deletes in 24 h";
  - a button that reads it aloud.
- **"Save a copy":** opens the phone's share sheet (Notes, Messages, WhatsApp). Falls back to a WhatsApp link.
- **The message text itself is the offline ticket.** It can be read inside WhatsApp with no page load:
  - EN: "My car: Blue · Falcon · B2-14 (Level B2). From Lift L3: exit left, 3rd pillar on right. Saved 19:42." The URL goes on the last line.
  - AR: «سيارتي: أزرق · صقر · ب٢-١٤ (المستوى ب٢). من مصعد L3: اخرج يساراً، ثالث عمود على اليمين. حُفظت ١٩:٤٢.»
  - Codes are wrapped in Unicode isolates (LRI…PDI) so "B2-14" doesn't reorder inside Arabic text.
- **"Take a screenshot of this card"**, with a "Done, I took it" tap that we count as a KPI proxy.
- **The honest claim:** *it works with no signal once the message or screenshot is on your phone.*
  - A link opened with no signal and cleared storage cannot load. iOS deletes all site storage after 7 days without use.
- **Family share:** the same message, sent to the family group.
- **Return needs no input:** the same scan also recorded the entry point.

**RETURN FLOW**
1. My Car.
2. Fix Position, if the last fix is old.
3. Pay station, if the car park is paid.
4. Navigate.
5. Floor check.
6. Final stretch.
7. **Found my car ✓**: record deleted.

**WHAT "TIME-TO-CAR" MEASURES:** from the "Take me there" tap to the first of:
- the "Found my car" tap;
- a pillar re-scan;
- (Stage C, needs the estimated dot) 2 minutes idle within 15 m of the bay.

---

## 8. SCREENS

**ON EVERY SHOPPER SCREEN**
- A placeholder layout within 100 ms.
- An offline strip: "Offline: map and car saved on this phone".
- Errors: one sentence plus one recovery button.
- If a permission is denied, the alternative is shown right there.
- A **56 px "ع / EN" toggle in the header** of S01, S03 and S07.
- Footer links to `/privacy` and `/terms`.

| ID | Screen | Purpose | Primary action |
|---|---|---|---|
| S01 | Plate landing `/p/{venue}/{code}` | Identify the plate; save the car or start here. ≤60 KB, plain CSS, no map | Save my car here · 24 h / Start here |
| S02 | Car Card | Confirmation plus a copy you can carry | Save a copy |
| S03 | Home | You-are-here, 6 tiles, search, My car | Tap a tile |
| S04 | Search | Arabic, English, Arabizi, typo-tolerant; **no mic button** (the keyboard's own dictation covers voice) | Tap a result |
| S05 | Place | Floor, minutes, hours, step-free badge | GO |
| S06 | Permission explainer | One line before the phone's own prompt | Continue |
| S07 | Navigate | Map, step card, floor switcher, I'm lost, "This step was wrong". **No camera button in the MVP** | Next |
| S08 | Step list | Text/SVG fallback, screen reader, print | Next |
| S09 | Floor check | "Now on Level 1?" | Yes |
| S10 | Fix position | Scan / I'm near a shop / Type code | Scan sign |
| S11 | Scanner | In-app QR reader with torch; after 8 s → "Type the code" | (scans automatically) |
| S12 | Camera Guide | **Stage C beta only** | Back to map |
| S13 | Arrived | Full-screen ✓ | Found it ✓ |
| S14 | My Car | Car Card, change the spot | Take me there |
| S15 | Found my car | 3-face rating, "Record deleted" | Done |
| S16/17 | Meet me / Receiver | Pin carried inside the link | Send / Take me there |
| S18 | Settings | Language, step-free, voice, text size, theme, digit style | — |
| S19 | I'm lost | Calm panel; the mall's own phone and WhatsApp numbers | Fix my position |
| S20 | Emergency | Routing stops; exit map; staff instructions | — |
| S21 | Kiosk `/kiosk/{anchorId}` | Landscape, fixed you-are-here, on-screen keyboard, resets after 60 s idle, "Continue on your phone" QR | Tap a tile (Stage C; a lite version is optional in the MVP) |
| S22 | Privacy / Terms | Bilingual; routing disclaimer | — |
| S23 | Entry picker | For people who arrived without scanning | Pick entrance |

**MAP STUDIO (admin)**

| ID | Screen | Primary action |
|---|---|---|
| A01 | Venue, floors and car parks (names copied from real signs and lift buttons) | Add floor |
| A02 | Plan import & calibrate | Lock |
| A03 | Trace units, **deferred until mall #2** | Save |
| A04 | Walking network (connectors, lift stops, flags, hours) | Run check |
| A05 | Signs (code, facing, 2 heights, photo, NFC, **Verify plate** scan mode) | Save |
| A06 | Assign shops + **XLSX/CSV import** (preview, bad rows in red) | Import |
| A07 | Check & publish (diff against the live version) | Publish v{n} |
| A08 | Print QR sheets + installer sheet | Print |
| A09 | Tenant Editor on a phone (overrides, outages, corridor blocks, hours, emergency) | Save |
| A10 | Audit log (one-tap revert) | Export CSV |
| A11 | Users & roles | Invite |
| A12 | Feedback triage | Resolve |
| A13 | IMDF export (admins only) | Export |

**MALL DASHBOARD**

| ID | Screen | Primary action |
|---|---|---|
| D01 | KPIs: adoption, car saves, completion, time-to-shop, time-to-car | — |
| D02 | Zone heatmap (any count under 10 hidden) | — |
| D03 | Top searches | — |
| D04 | Searched but not found | Export for Leasing |
| D05 | Plate health (red when scans fall below 20% of the expected rate) | Create task |
| D06 | Wrong-step heatmap by map point | Open in Studio |
| D07 | Feedback volume and time-to-fix | — |
| D08 | Monthly PDF | Download |

---

## 9. DESIGN SYSTEM

**COLOUR TOKENS.** "Sunlight" is the light theme. "Basement" is the dark theme; it switches on automatically on parking levels and the user can lock either one.
- **Target:** WCAG 2.2 AA minimum 4.5:1 for text, aiming for 7:1 (AAA) on body text. Non-text elements at least 3:1.

| Token | Sunlight | Ratio | Basement | Ratio |
|---|---|---|---|---|
| Background / surface | #FFFFFF / #F1F4F8 | — | #0B0F14 / #161B22 | — |
| Text | #0B0F14 | 19.2 | #F5F7FA | 17.9 |
| Secondary text | #3B4452 | 9.8 | #AEB8C6 | 9.6 |
| Primary = route | #0B57D0 (white on it 6.4) | 6.4 | #7AB0FF (dark text 8.7) | 8.7 |
| Car | #F5B700 + 2 px dark outline (amber alone 1.8 fails) | 19.2 | #F5B700 | 10.7 |
| Success / danger | #067647 / #B42318 | 5.7 / 6.6 | #4ADE9B / #FF8A80 | 11.2 / 8.4 |
| Warning fill | #FFB020 with dark text | 10.5 | Same | — |
| Map walkways | #F7F8FA (route on it 6.0) | — | #1B212B (route on it 7.3) | — |
| Shop outline | #5B6573 | 5.6 | #5A6575 | 3.3 |

**MAP CATEGORIES.** Light chip / dark chip.
- Fashion #AD1457 / #F48FB1
- Food #C2410C / #FFAB76
- Electronics #6D28D9 / #C4B5FD
- Services #475569 / #CBD5E1
- Toilets #0E7490 / #67E8F9
- Prayer #8A6100 / #E8C66A
- Exits #00753A / #6EE7A0
- **Parking #1E3A8A / #2F4BB8, with a WHITE icon (7.45:1) and a white ring.** A dark icon on it is only 2.58:1, which fails.
- Shop labels on any tint measure at least 14.9:1 (light) and 13.3:1 (dark).

**PARKING ZONES.** 8 colours, each with an Omani icon: Falcon, Palm, Dhow, Oryx, Rose, Fort, Turtle, Frankincense. If the mall already has its own zone scheme, that scheme wins.

**TYPOGRAPHY**
- **On screen: Readex Pro** (OFL licence; Arabic + Latin; weights 160–700).
  - Self-hosted and subset, never loaded from the Google Fonts CDN.
  - Its digits are proportional (no tabular digits), so live counters use Noto Sans Arabic.
- **In PDFs: a static Noto Sans Arabic TTF** (or Amiri). Readex Pro has **0 glyphs** in Arabic Presentation Forms (U+FE70–FEFF), which jsPDF's Arabic shaping needs.
- Fallback: Noto Sans Arabic, then the system font. Arabic gets about 15% more line height.

| Role | Latin · Arabic (size / line height) | Weight |
|---|---|---|
| Display | 32/40 · 32/46 | 700 |
| Step instruction | 26/34 · 26/40 | 600 |
| Title | 22/30 · 22/34 | 700 |
| Body (minimum) | 18/28 · 18/32 | 400 |
| Button | 18/24 · 18/28 | 600 |
| Caption (smallest allowed) | 14/20 · 14/22 | 500 |

**SHAPE & SPACING**
- **Spacing:** 4, 8, 12, 16 (screen edge), 24, 32, 48, 64.
- **Corner radius:** chips 8, buttons and cards 16, bottom sheets 28, pills fully round.
- **Touch targets:** 56 px, never under 44 px, 8 px apart.
- **Depth:** Sunlight uses a border plus a shadow (shadows alone wash out in sunlight). Basement uses lighter surfaces: #161B22, #1E2530, #273040.

**ICONS.** Material Symbols Rounded (Apache-2.0), exported as **about 30 inline SVG components** at build time. **Not** the 5.4 MB variable font. CI fails if any font or icon file on shopper pages is over 50 KB.

**MOTION**
- Timing: 100 ms tap, 200 ms state change, 300 ms panel or floor change, 400 ms map move, 600 ms drawing the route (once).
- Easing: cubic-bezier(0.2,0,0,1).
- The only loop is the "you are here" pulse, and it stops under reduced motion.

**HAPTICS**
- Android Chrome only: confirm 20 ms; turn coming up 40-60-40; arrived 60-80-60-80-60.
- iPhone web has no vibration, so it uses sound and voice instead.

**VOICE**
- Uses the phone's built-in speech (`speechSynthesis`), started by the GO tap.
- If no Arabic voice is installed (`getVoices()` has no 'ar'), play about 40 pre-recorded Arabic and English clips, 3–5 KB each.
- When speech isn't available, brand names are shown on screen rather than spoken.

**SCREEN AWAKE.** The Wake Lock API runs only during navigation.
- Safari tab: iOS 16.4+.
- Home Screen app: iOS 18.4+.
- Chrome Android: 84+.

**MAP STYLE**
- **"You are here" has three honest states:** exact, estimated (beta only), unknown.
- **Route line:** 8 px primary blue, 3 px border, white chevrons. The walked part turns grey, parts on other floors are dotted, turns are numbered.
- **Floor switcher** sits at the edge where reading ends, so it moves to the left side in Arabic.
- **Logos** appear only if the LOI grants the right to use tenant marks. v1 uses text plus category icons.
- **Scan prompt** is a panel that never blocks the map.

**RTL RULES**
- **Flip in Arabic:** layout, reading order, back arrows, progress bars, swipes, the floor switcher's side. Use start/end properties, never left/right.
- **Never flip:**
  - turn arrows and the words left/right, which come from the walking direction;
  - the map, the north arrow and route arrows;
  - lift and escalator icons, QR codes, logos, ✓;
  - bay codes, which stay left-to-right inside isolates.
- **Text direction** comes from a locale→direction map, not from `lang === 'ar'`. This keeps Urdu possible later.
- **Digits:** Arabic-Indic by default in Arabic mode, with a switch (Q9). Plates print both styles.
- **Required test case:** every turn instruction in both languages checked against the real walking direction.

**ACCESSIBILITY**
- WCAG 2.2:
  - 2.5.8: 56 px targets;
  - 2.5.7: every map drag also has a button;
  - 1.4.4 / 1.4.10: usable with text at 200%;
  - 2.4.11: the step card never covers focused items;
  - 3.3.8: no login.
- Colour always comes with an icon and a label. Screen readers announce each new step.
- **Not claimed in v1:** guidance for blind users.

**ADHD RULES**
- One primary button per screen.
- At most one permission prompt per screen, always after an explanation.
- Feedback within 100 ms, and progress always visible.
- Sensible choices pre-selected; no typing in the core journeys.
- No promotions during navigation (Pro allows one offer, at "Found it" only).
- Undo instead of "Are you sure?".
- If the page reloads, the journey resumes from what is saved on the phone.

**GOOGLE STITCH PROMPTS.** Generate each screen in English, then ask for an "Arabic RTL version". Stitch's RTL quality is UNVERIFIED.
0. "Mobile web app 'Dallni', indoor mall wayfinding. High-contrast sunlight UI: bg #FFFFFF, text #0B0F14, primary #0B57D0, car accent #F5B700 with dark outline, success #067647. Readex Pro. 56px buttons, 16px radius, rounded line icons. One primary action per screen. Header has a 56px 'ع / EN' toggle."
1. "QR landing after scanning a parking pillar: big blue zone badge with falcon icon, 'B2-14 · Level B2', full-width amber button 'Save my car here · 24 h', one privacy line, footer links Privacy/Terms. No map."
2. "Car saved: large green check, card with blue block, falcon icon, 'Blue · Falcon · B2-14', 'Deletes in 24 h', primary 'Save a copy', secondary 'Take a screenshot', then 'Where to?'."
3. "Home: chip 'You're at Gate 3 · Ground', search bar, 2×3 tiles (Food, Toilets, Prayer room, Pharmacy, Kids, Exit/Taxi), bottom chip 'My car · B2-14'."
4. "Search results for 'zara': rows with name, floor badge, minutes; empty state 'Not in this mall' with 3 suggestions."
5. "Store detail: name, 'Level 1 · about 4 min', step-free badge, hours, huge 'GO' button."
6. "Navigation: 2D indoor floor plan, pastel shop fills, thick blue route with white casing and chevrons, blue dot with white ring, vertical floor switcher, custom 56px zoom/recentre buttons, bottom step card 'Turn left after Carrefour · 40 m · about 1 min · Step 2 of 6', full-width 'Next', secondary 'I'm lost'."
7. "Floor check: 'Are you on Level 1 now?', landmark photo, buttons 'Yes' / 'No, another floor'."
8. "Bottom sheet 'Fix my position': sign illustration, buttons 'Scan sign', 'I'm near a shop', 'Type code'."
9. "Camera guide BETA: full-screen camera, one large white arrow with dark outline, compact step card, 'Look up' banner, 'Map' and close."
10. "Arrival: full-screen green 'You've arrived · Zara', primary 'Found it ✓', chips 'Back to my car', 'Another shop'."
11. "Dark basement My Car: bg #0B0F14, text #F5F7FA, amber car card, button #7AB0FF with dark text 'Take me there', strip 'Offline: saved on this phone'."
12. "Desktop mall dashboard: KPI tiles (adoption, time to shop, time to car, journeys completed, car saves), 'Searched but not found' table, zone heatmap, plate health list, 'Download monthly PDF'."

---

## 10. TECH ARCHITECTURE

```
PRINTED PLATES (QR + optional on-metal NFC) → https://<10D-short-domain>/p/{venue}/{code}
                       │   redirect layer owned by 10 Digital (survives brand/mall changes)
                       ▼
SHOPPER WEB APP (default-browser tab = the product)    MAP STUDIO (admin)        MALL DASHBOARD
Firebase Hosting on Blaze OR Cloudflare  (Sam: Q2)     Firebase Hosting          Firebase Hosting
/p ≤60 KB → Where-to ≤250 KB → MapLibre lazy / SVG     import, graph, signs,     KPIs, browser rollup,
  │ static GETs           │ live doc + rare writes     XLSX, publish, QR PDFs    Proof Report PDF
  ▼                       ▼                            │ writes + auditLog        │ events → dailyStats
STATIC BUNDLE (CDN)      FIRESTORE — region chosen once (me-central1 Doha IF offered; UNVERIFIED)
/v/{venue}/{ver}/…       live · savedCars · events · dailyStats · feedback · clientErrors · drafts
immutable, CORS-limited  venues/* · pendingAssets · mapVersions · users · auditLog
  ▲ deploy                ▲                                        FIREBASE AUTH (admins only)
OPS RUNNER (GitHub Actions, OIDC, no keys): hourly publish · nightly backup → private repo ·
  expiry cleanup · bundle pruning · plate health · quota/spike alerts · daily digest
LATER: one multi-venue Capacitor app · key-gated partner API · CMS/parking/loyalty adapters · webhooks
```

**PINNED VERSIONS**

| Package | Version / rule |
|---|---|
| React | 18.3.1 |
| Vite | — |
| Tailwind | v4 (needs iOS Safari 16.4+ and Chrome 111+); use **v3-lts 3.4.19** if the Stage A device survey says older phones matter |
| firebase | **12.19.0 or 13.0.x**; 13's breaking changes are only in AI Logic |
| MapLibre | 6.13 |
| ngraph.path | 1.6.1 |
| MiniSearch | version pinned in Phase 1 |
| barcode-detector | 3.2.2 (zxing-wasm 3.1.5, WASM self-hosted) |
| jsPDF | with Noto Sans Arabic |
| qrcode | MIT licence |
| Papa Parse + SheetJS | — |
| vite-plugin-pwa | 2.0.0 is 5 days old; pin after review |

**SUPPORTED BASELINE:** iOS 16.4+ and Chrome/WebView 111+. The `/p` save page uses plain hand-written CSS so it works on any phone.

**PLATFORMS OUTSIDE THE DECLARED STACK.** All accounts are owned by 10 Digital, protected with 2FA, and listed in an account register.

| Platform | Why | Exit path |
|---|---|---|
| Cloudflare Workers Static Assets (only if Q2 = A) | $0, unlimited static traffic. Cloudflare recommends Workers over Pages for new projects | Same Vite build → Firebase Hosting |
| GitHub Actions | The only "server": publish, backups, digests. 2,000 free min/month for private repos; an hourly job ≈720 billed minutes | Cloud Functions on Blaze |
| Domain registrar | Permanent printed URLs | Transfer the domain |

**FIRESTORE COLLECTIONS**

| Collection | Holds | Read | Write |
|---|---|---|---|
| `live/{venueId}` (≤10 KB) | bundleVersion; shop overrides (rename, close, category, new unit); connector overrides; corridor blocks; disabled plates; dated hours; emergency {mode, message{ar,en}}; banner; analyticsSampleRate; writesEnabled; minAppVersion | Public get | Ops/editor, plus auditLog in the same batch; emergency also needs a recent password re-entry |
| `savedCars/{128-bit random ID}` | venueId, carParkId, levelId, zoneKey, bayCode, anchorId, createdAt, expiresAt | Get by exact ID; no list | Create (strict rules); delete by anyone holding the ID; no update |
| `events/{tripId_type_n}` | type (journey_start, arrival, car_saved, car_found, zero_result_search, anchor_scan, step_wrong, stepfree_route), venueId, tripId (random **per trip, not per device**), 3-hour time bucket, anchor/target/node, durationS, cleaned search term, expireAt (30 days) | Analyst role | Create only; one per ID; allowed fields only; sanity bounds |
| `dailyStats/{venue_date}` | Totals; any count under 10 hidden | Venue roles | Rollup in the analyst's browser |
| `feedback` / `clientErrors` | Button-chosen reasons + node / sampled, capped errors | Ops / 10 Digital | Create only |
| `drafts/{venueId}/layers/*` | Shapes stored as JSON strings (Firestore rejects arrays inside arrays) + updatedBy/updatedAt per feature | Editors | Editors |
| `venues/{id}/occupants, amenities, signAnchors, carParks, promotions` | One document per record + updatedBy/updatedAt | Editors | Editors + audit |
| `pendingAssets/{id}` | Staff photo upload staging (base64 WebP ≤100 KB) | Editors | Editors; the runner moves it into the bundle and deletes it |
| `mapVersions/{venue_vN}` | Status, check summary, chunks, createdBy/createdAt | Editors | Editors create; runner updates (+ audit) |
| `users/{uid}` | Email, roles{venueId: role}, active | Self + superadmin | Superadmin |
| `auditLog/{id}` | venue, collection, docId, action, diff, by (uid, or `system:ops-runner` + run ID), at | Owner, superadmin | Create only |

**STATIC FILES vs FIRESTORE**
- **Why static:** geometry, routing graph, directory, signs and photos are big, read by every visitor, and rarely change. As versioned CDN files they cost **zero Firestore reads**. Storing one document per shop would cost about 373 reads per visitor; the free plan would run out at about 134 visitors a day.
- **Bundle contents:**
  - `manifest.json` (includes licence terms);
  - `levels/*.json`, `graph.json`;
  - `directory.json` (with search index and synonyms);
  - `anchors.json`, `parking.json`, `promotions.json`;
  - `svg/{level}.svg`;
  - `img/` (WebP ≤20 KB each, taken by 10 Digital staff, no identifiable people);
  - `voice/` clips.
- `current.json` has a short cache time and points to the current version.
- **Never in the public bundle:**
  - `imdf.zip` or the full source geometry. IMDF is exported only from Studio, behind admin login, and handed over under the contract.
  - Public access (CORS) is limited to the mall's domains and our own. A key-gated partner API comes later.

**SEARCH ENGINE**
- **One text normaliser**, used both for indexing and for logging:
  - strip Arabic diacritics (tashkeel) and stretching (tatweel);
  - أ إ آ ٱ → ا; ة → ه; ى → ي; ؤ → و; ئ → ي;
  - Persian ک/ی → ك/ي;
  - Arabic-Indic and Persian digits → ASCII digits;
  - optionally strip a leading ال;
  - Latin text: lowercase, remove accents, & → and, remove spaces and apostrophes.
- **Arabizi:** 2=ء, 3=ع, 5=خ, 7=ح.
- **Synonym dictionary maintained in Studio**, for example:
  - toilet / washroom / restroom / WC / حمام / دورة مياه / تواليت;
  - prayer / musalla / مصلى / مسجد;
  - ATM / صراف; pharmacy / صيدلية;
  - product words (abaya, oud, charger) → categories;
  - h&m = hm = اتش اند ام.
- **MiniSearch** with a custom term processor and fuzzy matching: 1 edit, or 2 for terms of 6+ characters.
- **Missed search** = zero results, or no result tapped within 15 s. Counted once per trip.
- **Scrub before logging:** drop the query if it has 4+ digits in a row or an "@"; cap at 30 characters; report a term only after 10 occurrences.
- **No custom mic button.** The browser's Web Speech API on Chrome uses Google's servers (a transfer outside Oman) and fails offline.

**OFFLINE**
- **The default-browser tab is the primary product:** Safari, Chrome on iOS, Samsung Internet, Chrome. No install prompts in the core flow; "Add to Home Screen" is offered only after a finished journey.
- **Download budgets, enforced in CI:**
  - `/p` ≤60 KB gzipped. No MapLibre, no Firestore SDK; it saves through the Firestore REST API.
  - Where-to ≤250 KB.
  - MapLibre about 430 KB, loaded after the first step card.
  - **Scanner WASM about 420 KB:** precached in the background when a journey starts or a car is saved. Android uses Chrome's built-in barcode reader (83+) and never downloads it. If it isn't cached and the network fails, go straight to "Type the code".
- **Service worker:**
  - app shell stored in advance;
  - bundle files served from the cache first;
  - `current.json` served from cache and refreshed in the background;
  - after a car save, prefetch the parking level, the graph and the route back.
- **Firestore SDK** loads on demand, with `persistentLocalCache` + `persistentMultipleTabManager`.
  - It listens to the live document only during navigation.
  - A listener that reconnects after more than 30 minutes offline is billed as a new query.
- **Writes:**
  - car save is shown as done immediately, queued in IndexedDB, and retried when the connection or page comes back;
  - events are sent at milestones with `fetch(keepalive:true)`, plus a best-effort flush when the page is hidden;
  - anything unsent is flushed on the next open.
- **A route in progress** is kept in IndexedDB. Any `/p` page opened mid-route resumes it.

**SECURITY**
- **Shoppers never sign in, not even anonymously.** Firebase allows only 100 new accounts per hour per IP address, and mall Wi-Fi often puts everyone behind one IP.
- **savedCars rules:**
  - allowed fields only, strings of 32 characters or less;
  - `createdAt == request.time`;
  - `expiresAt ≤ request.time + 24 h + 15 min` (tolerance for a fast phone clock);
  - venueId must be on an allow-list, which the runner regenerates when a mall is added.
- **App Check is off on the web.** The free reCAPTCHA tier stops working after 10,000 checks a month. It is enforced in the native app later.
- **Abuse protection:**
  - Blaze from go-live, so a quota burn becomes a small bill instead of an outage;
  - a `writesEnabled` switch in the live document;
  - an alert when daily writes exceed 3× the 7-day median.
- **Runner:**
  - signs in to Google Cloud through Workload Identity Federation (GitHub OIDC, a least-privilege role, no JSON keys);
  - every runner write creates an audit entry.
- **Backups:** every night the runner exports drafts, occupants, signs, car parks, the audit log and users to a **private 10 Digital repository**. Raw events are excluded. The restore script is tested in Stage B.
- **Monitoring:**
  - a free uptime check on `/p` and `current.json`;
  - a daily digest by email (SMTP) or a Telegram bot.

| Action | Superadmin (10D) | Editor (10D) | Owner (mall) | Ops (mall) | Analyst (mall) | Tenant (Stage D) |
|---|---|---|---|---|---|---|
| Rename / close / re-categorise | Y | Y | Y | Y | – | Own hours/offers only |
| Lift outage / corridor block | Y | Y | Y | Y | – | – |
| Emergency mode (with re-auth) | Y (on the mall's request) | – | – | Y | – | – |
| Publish geometry | Y | Y | – | – | – | – |
| XLSX/CSV import | Y | Y | Y | – | – | – |
| Export data / IMDF | Y | Y | Y | – | – | – |
| View reports | Y | Y | Y | Y | Y | – |
| Manage users | Y | – | Own venue | – | – | – |

- **Account rules:**
  - one account per person, no shared logins;
  - disable accounts the same day someone leaves;
  - review access every quarter;
  - publishing and emergency require re-entering the password;
  - multi-factor login may need Google's Identity Platform upgrade (UNVERIFIED).

**FOLDER STRUCTURE**

```
dallni/                       npm workspaces · private repo owned by 10 Digital
├─ apps/
│  ├─ shopper/     p (plain CSS) · home · search · place · navigate · floor-check · fix · scanner
│  │               car · meet · settings · lost · emergency · kiosk · privacy · sw/
│  ├─ studio/      venue · import · calibrate · network · parking · signs · shops-import · validate
│  │               publish · qr-sheets · tenant-editor · audit · users · feedback · imdf-export
│  └─ dashboard/   kpis · heatmap · missed-demand · plate-health · wrong-steps · feedback · proof-report · rollup
├─ packages/
│  ├─ map-core/      IMDF-aligned types · bundle loader · geometry codec · svg-renderer · maplibre-adapter
│  ├─ routing/       graph · costs · profiles · hours · overrides · instructions · eta
│  ├─ positioning/   sources (qr, typed-code, shop-pick, floor-check, next-tap, gps-outdoor) · fusion · confidence
│  ├─ search/        normaliser · arabizi · synonyms · minisearch config · scrubber
│  ├─ i18n/          locales · locale→dir map · templates · numerals · bidi isolates
│  ├─ ui/            Tailwind preset · BigButton · StepCard · Sheet · LangToggle · inline SVG icons
│  ├─ data/          lazy Firebase init · REST writer · repositories · schemas · IndexedDB write queue
│  ├─ analytics/     event builder · keepalive flush · small-count suppression (10)
│  ├─ reports/       jsPDF (Noto Sans Arabic) · HTML print views · QR sheets
│  └─ integrations/  cms · parking · loyalty · webhook schema · imdf-export
├─ experimental/     camera-guide · pdr-beta · sign-lock · vps-pilot   (feature-flag registry only)
├─ firebase/         firestore.rules · indexes · emulator rule tests
├─ tools/            dxf-convert · seed · restore · ops jobs
├─ seed/demo-mall/   fictional mall + 30 days of synthetic stats
└─ .github/workflows/ ci (tests, size budgets, RTL snapshots) · deploy · ops-runner
```

A lint rule stops the apps from importing `experimental/` except through the feature-flag registry, so beta code never adds to the core download.

**INTEGRATIONS / API (contracts fixed from day 1)**
- **Deep links:**
  - `/to/{occupantId}?from={anchorId}`
  - `/p/{venue}/{code}`
  - `/car/{id}`
  - `/kiosk/{anchorId}`
- **Mall CMS:**
  - MVP: the mall sends XLSX/CSV and Studio imports it.
  - Later: a runner adapter matched on external IDs, feeding a review queue. Never published automatically.
- **Parking / plate recognition (Park Assist/TKH, Hayak):**
  - an adapter looks up a licence plate and returns a bay;
  - bays carry the vendor's IDs from day 1;
  - needs the vendor's API (UNVERIFIED), a server (a Worker, or Functions on Blaze) and a PDPL review, because plates are personal data;
  - Stage D or later.
- **Loyalty / POS:** totals only.
- **Webhooks:** format {type, venueId, time, data, version}, HMAC-signed, sent in batches by the runner.

**NATIVE PATH (STAGE E)**
- **One multi-venue Dallni app** under 10 Digital's developer account.
  - Apple rule 4.2.6 rejects template apps not submitted by the content owner; rule 4.3(a) rejects copies of the same app.
  - A mall-branded app ships only under the **mall's own** Apple account, priced separately.
- **Custom Capacitor plugin for sensors:**
  - iOS: `trueHeading` + `headingAccuracy`, CMPedometer, CMAltimeter.
  - Android: rotation vector, step detector, barometer.
  - `@capacitor/motion` is a fallback only; its README says it uses the same web APIs.
- **Other plugins:**
  - ML Kit barcode scanning 8.2.1;
  - bluetooth-le 8.3.0, only if a mall pays for beacons;
  - a custom Wi-Fi RTT plugin.
- **Capacitor 8 requirements:** Node 22, iOS 15+, Android minSdk 24, Xcode 26 on a Mac.
- **Store fees:** Apple $99/year, Google $25 once (medium confidence). Use an **organisation** Play account; new personal accounts must first run a 12-tester, 14-day closed test.

---

## 11. FREE-TIER BUDGET

**ASSUMPTIONS** (estimates, **UNVERIFIED** until the Stage A payload measurement):
- "Users" means app users, not mall footfall.
- First visit 0.5–0.8 MB including MapLibre; repeat visit 0.03 MB.
- First-time devices are 40–100% of users. iOS keeps Safari and Home Screen storage separate and clears it after 7 days.
- Scanner WASM adds 0.42 MB once per device that opens the scanner.
- Firestore per active session:
  - reads ≈3.6 (live document 1 + car lookup 0.1 + browser rollup about 2.5);
  - writes ≈2.5–3;
  - deletes ≈ writes.
- 5,000 reads a day are reserved for admins.

| Free (Spark) limit | Runs out at (users/day, estimate) |
|---|---|
| Hosting 360 MB/day: everyone first-time at 0.8 MB | ~450 |
| Hosting: 40% first-time at 0.8 MB (average 0.34 MB) | ~1,050 |
| Hosting: 40% first-time at 0.5 MB (average 0.22 MB) | ~1,650 |
| **Hosting range** | **~450–1,700** |
| Firestore writes 20k/day | ~7k–8k |
| Firestore deletes 20k/day | ~7k–8k |
| Firestore reads 50k/day | ~12k |
| Auth: 100 new accounts per hour per IP | Not applicable (shoppers never sign in) |
| App Check: 10k checks a month | Not enforced on the web |

- **Reality check:**
  - Mall of Muscat reports 4M+ visitors a year, about 11k a day.
  - Adoption of 5–15% means 550–1,650 users a day, right at the Hosting limit.
  - On Spark, a used-up quota means the service is **OFF** until about 11:00–12:00 Muscat time the next day, so an Eid evening would be an outage.

**EXACT BLAZE TRIGGERS** (any one of these):
1. A paying pilot goes live. The Firestore project moves to Blaze whatever the hosting choice.
2. The 3-day average passes 70% of any daily quota.
3. A feature needs Functions, Storage, SMS sign-in or server-sent push.

Before switching, `analyticsSampleRate` can reduce event writes.

**COST AFTER** (us-central1 rates; Doha rates UNVERIFIED)

| Monthly | 10k users/day | 30k users/day |
|---|---|---|
| Firestore | ≈ $0.3 | ≈ $3 |
| Shopper app on Firebase Hosting, Blaze ($0.15/GB above 10 GB) | ≈ $14 (OMR 5.4) | ≈ $44 (OMR 17) |
| Shopper app on Cloudflare Workers Static Assets | $0 | $0 |
| GitHub Actions | $0 | $0 |

**GUARDS**
- **Budget alerts do NOT cap spending.**
- **Optional kill-switch:** a budget (e.g. $30/month) triggers Pub/Sub, which triggers a function that turns off billing. Hitting it causes an outage, just like Spark.
  - Use it on the **dev/demo project**.
  - Use an **alert-only** budget on the paid pilot.
  - Budget notifications can lag by hours (not re-checked).

---

## 12. BUSINESS MODEL & PRICING (OMR, estimates)

**BENCHMARK.** Mappedin Plus costs about OMR 10 and Pro about OMR 63–77 per map per month, and Mappedin already does Arabic.
- **We cannot win on software price.** We sell a **managed service with measured results**.

| Line | Price (estimate) | Covers |
|---|---|---|
| Site survey + plate plan | 400–600 one-time (priced separately) | Signal survey per level, Wi-Fi login-page test, plate schedule by tier |
| Setup & mapping | 1,200–2,500 one-time | DXF conversion, tracing, site walk, routing graph, QA |
| Plates | Cost + 15%, quoted per tier | Tier 1: entrances, lift lobbies, escalators, directories (~40–80). Tier 2: one per parking zone face (~1 per 30–50 bays). Tier 3: every pillar (mall pays) |
| **Essential** | **180/month** | Map, search, Scan & Go, save and return to car, Tenant Editor, **XLSX/CSV import, Ramadan/Eid hours, emergency mode** (all core), plate alerts, 1-business-day SLA, basic Proof Report, hosting |
| **Pro** | **390/month** | Adds: missed-demand report for Leasing, heatmap, offers, musalla/iftar content, staff-timed trials, quarterly review |
| Kiosk mode | Quote per kiosk | Hardware is the mall's cost |
| IMDF + Apple listing upkeep | 40/month | Turns a free Apple map into a paid service line |
| Embed / API | 1,000–3,000 one-time | Map inside the mall's own site or app; key-gated API |
| Mall-branded native app | Separate quote | Submitted under the mall's own Apple account |
| Sponsored pins | 25–75 per tenant per month, 30–50% shared with the mall | Only once usage is proven |
| Parking integration | Quote | Whether the vendor has an API is UNVERIFIED |

- **Pilot:** OMR 500–900 setup (estimate), credited against year 1, plus plates at cost. Still subsidised against 120–240 h of mapping. In return: a case study and an anonymised-data-rights clause.
- **Margin plan: bundle 10 Digital's other services with the same mall:**
  - a mall website with the map embedded;
  - a WhatsApp chatbot ("Where's Zara?"); the WhatsApp API is paid by the mall;
  - campaign retainers and content for mall screens.
- **If the mall leaves:** it gets an IMDF export of its map. The tooling and the cross-mall benchmarks stay with 10 Digital.

**UNIT ECONOMICS** (placeholder labour rate **OMR 8/h**. Replace it with 10 Digital's real loaded rate; see Q7.)
- **Running cost** per mall: about OMR 75/month (support at 8 h/month, plus hosting).
- **Contribution** per mall: about OMR 105/month on Essential, about OMR 315/month on Pro.
- **Product upkeep:** about 40 h/month ≈ OMR 320.
- **MVP build:** about OMR 4,000.

| OMR, first 12 months (estimates) | 1 mall | 3 malls | 6 malls (stretch) |
|---|---|---|---|
| Setup revenue | 2,000 | 5,300 | 9,800 |
| Subscriptions | 3,510 | 6,390 | 6,570 |
| Direct costs | ~2,300 | ~5,000 | ~8,100 |
| Contribution | ~3,200 | ~6,700 | ~8,300 |
| Product upkeep | −3,840 | −3,840 | −3,840 |
| MVP build | −4,000 | −4,000 | −4,000 |
| **Net at month 12** | **~−4,640** | **~−1,140** | **~+460** |
| Annual recurring revenue at month 12 | 4,680 | 11,520 | ~20,500 |

*Malls start in months 1, 4, 7, 9, 10 and 11, each after a 3-month pilot. Sales time, legal fees, domain and ads are not included.*

- **What this means:**
  - One Pro mall is worth about **−5 OMR/month** after upkeep (390 − 75 − 320).
  - **At least 2 Pro malls** (or 4 Essential) are needed just to cover upkeep.
  - **About 3 malls** gives cumulative payback around **month 15**.
  - **Mall #1 is an investment.**
- **Scale gate:** no tracing tool, and no Stage D spend, until **2 malls have signed**.
- **Honest ceiling:** Oman has 10–15 target malls, worth about OMR 47–70k a year in recurring revenue. The upside is in:
  - other 10 Digital retainers with the same malls;
  - independent malls across the GCC;
  - hospitals and convention centres (not yet validated).

---

## 13. GO-TO-MARKET

**PILOT TARGET: MUSCAT GRAND MALL (Tilal Development).** Your own contacts (Q1) can override this.
- **Why:**
  - independently owned;
  - already buys parking tech (Park Assist on 1,800 bays, Hayak in 2025).
- **Risk:** Park Assist may already find cars by licence plate. Check on site. If it does, pitch Dallni as the in-mall layer plus the measurement.
- **Backups:**
  - Al Araimi Boulevard: a replacement sale, if the 2018 app is no longer running;
  - Mall of Muscat: 4M+ visitors a year, but tied to LuLu, which uses 3D Wayfinder.
- **Skip for now:** Panorama (vacant units) and the MAF malls (their own SHARE app).

**WHO DECIDES AT THE MALL** (estimate: 2–6 months from first meeting to contract)
- **Marketing Manager:** champion and first contact.
- **General Manager:** signs.
- **Operations:** approves the plates and can block the deal.
- **Leasing:** buys Pro.
- **Owner / Legal:** reviews the data processing agreement (DPA).
- **Sequence:**
  1. Demo Mall on their own phones.
  2. Site walk with Operations.
  3. Proposal.
  4. LOI.
  5. 90-day pilot.
  6. Annual contract.

| Objection | Answer |
|---|---|
| Cost | You're buying a managed service, not software. Pilot software is free; you pay setup and plates |
| "Google Maps has it" | No Oman venue is on Google's indoor list, and we found no Apple indoor maps here. Neither guides you back to your bay or gives the mall data. If Apple arrives, we maintain your listing |
| Privacy | No accounts. The car record is deleted after 24 h. The mall is the controller, 10 Digital the processor, under a DPA |
| Maintenance | We do it. Ops edit tenants from a phone; plates are monitored automatically |
| Hardware | None: printed plates. A live dot is a later option, and only if the mall pays for hardware |
| "We have Park Assist" | It finds you a parking space. Dallni covers the walk into the mall and back to the car, and measures it |

**30/60/90**, starting only after an LOI is signed by 15 Dec 2026.

| Window | Work |
|---|---|
| Days 0–30 (15 Dec–15 Jan) | DXF files + tenant XLSX. **Signal survey on every parking level.** Test the Wi-Fi login page. Plate schedule. **Baseline:** staff time ≥50 consenting shoppers from a named lift lobby to their bay, at set hours and weekdays. Mapping starts. Pilot runs on Blaze or Cloudflare (Q2) |
| Days 31–60 (15 Jan–15 Feb) | Install Tier 1–2 plates. Staff soft launch, then **public launch about 1 Feb**. 2-week calibration, then agree numeric targets. Ramadan starts about 8 Feb |
| Days 61–90 (15 Feb–15 Mar) | Ramadan → Eid al-Fitr campaign. Proof Reports at day 60 and day 90. **Repeat the staff-timed trial (≥50) with app users.** Renewal decision. Case study in April |

**LOI CONTENTS**
- **Measured, not promised.** In days 0–30 the LOI commits only to "measured and reported". Numeric targets are agreed after the 2-week calibration, and only on things 10 Digital controls:
  - car saves per day;
  - journey completion rate, in 3 tiers: "Found it" tap, final step reached, scan at the destination;
  - ≥95% of plates active;
  - 1-business-day directory updates; same-day safety items.
- **Reported, not pass/fail:** time-to-car and time-to-shop, plus adoption = **app sessions ÷ the mall's footfall-counter totals** (the mall shares these daily).
- **What the mall provides:**
  - DXF files and a written data licence;
  - permission and staff to mount plates;
  - a bilingual tenant list and an Operations contact;
  - Wi-Fi access-point make/model and whether they support FTM/802.11az;
  - **the app's domains let through the guest Wi-Fi without login**;
  - a Wi-Fi coverage map of parking;
  - daily footfall totals and screen-loop slots;
  - rights to use tenant logos, if logos are wanted;
  - a data-rights clause;
  - a weekly tenant-change list.

**PITCH DECK (12 slides)**
1. Title and tagline.
2. **Problem:** the 13-minute lost-car search (UK). No GCC figure exists, so we will measure yours.
3. **Why now:** Oman has no Google indoor maps; 33% want no more apps; the PDPL is now enforced.
4. **Solution:** three screens, nothing to install.
5. Live demo.
6. Sample Proof Report.
7. Missed demand for Leasing.
8. We run it, you approve.
9. Privacy by design.
10. **Honest roadmap:** no live dot in v1; camera arrows only as a later beta.
11. Pilot offer and Ramadan timeline.
12. About 10 Digital.

**5-MINUTE DEMO** (on the GM's own phone, with Demo Mall plates printed on A4)
- **0:00** Scan "Blue • Falcon • B2-14" → "Save my car here · 24 h" → Save a copy.
- **0:45** Tap the Pharmacy tile. Type «زارا» and Zara appears. Search for a brand the mall lacks: "That search is now in your leasing report."
- **1:45** Tap GO. The step is read aloud in Arabic. Answer "Now on Level 1?" with Yes.
- **2:45** Switch to English.
- **3:15** Tap "Take me to my car" → scan a corridor plate → "Found my car ✓". The record is deleted.
- **4:00** Rename a shop from the admin phone and watch the GM's screen update. Open the PDF.
- **4:40** Close: "No hardware. Live for Ramadan if we sign by 15 December."
- Optional: a camera-arrows preview, clearly labelled **Beta**.

**LAUNCH CAMPAIGN**
- **Plates:**
  - parking (two layers; "No signal? Photograph this plate");
  - lift lobbies, entrance standees, escalator landings;
  - directory boards: "You are here. Scan me";
  - corridors every 30–50 m;
  - food-court table tents;
  - parking tickets, where the mall issues them (which Muscat malls do is UNVERIFIED).
- **Every plate also says:** "Dallni never asks for payment or login" / «دلّني لا يطلب منك الدفع أو تسجيل الدخول أبداً»
- **Mall screens:** a silent 15-second bilingual loop: "Lost your car? Never again."
- **Social:**
  - Instagram first: about 3.24M users in Oman;
  - TikTok second: about 2.71M adults (Low confidence);
  - WhatsApp for sharing;
  - Snapchat reach UNVERIFIED.
- **Creators:**
  - only those holding a **MOCIIP licence** (Resolution 619/2022; fines up to OMR 1,000);
  - **no food promotions** without approval from the Food Safety and Quality Center.
- **Content ideas:**
  - a car-park race, with and without Dallni;
  - a "meet at Gate 3" family video;
  - an Eid kids' hunt for the zone animals, on **standees in corridors and the atrium, not in parking**, played on the parent's phone, collecting no data.
- **Timing:** Muscat Nights teasers (2027 dates UNVERIFIED); Ramadan musalla and iftar routes; Eid as the proof peak.
- **PR:** Times of Oman, Oman Observer, Muscat Daily, Oman Daily. Angle: "Omani-built, Arabic-first, no app." Publish the numbers in April.

**GROWTH LOOPS**
- **"Meet me at Gate 3":** the pin lives in the link, and everyone who opens it becomes a user. KPI: new users per share.
- **Family car share:** the message text survives even with no signal or storage. KPI: car-find success.
- **Offers (Pro):** one tenant offer, shown at "Found it ✓". The click data supports selling sponsored pins.
- **Same yellow plates in every mall** build a habit. "Add to Home Screen" appears only after a finished journey.
- **Kiosk handoff (Stage C):** "Continue on your phone" QR. KPI: handoffs per kiosk per day.
- **Demand Radar** from mall #3.

**KPI DASHBOARD + MONTHLY PDF**
- **Shopper experience:**
  - median time-to-shop and time-to-car (in-app median with sample size, and staff-timed before vs after);
  - car-find success;
  - journey completion (3 tiers);
  - step-free use;
  - satisfaction;
  - **instruction-error rate** = (off-route scans + floor-check "No" + "Not here?" + "I'm lost" + "This step was wrong") ÷ steps shown.
- **Unbiased accuracy:** in Stage A and Stage C, a staff walker taps at about 20 surveyed points on a scripted course; report the middle (P50) and worst-10% (P90) error.
- **Mall business:**
  - adoption (sessions ÷ footfall);
  - car saves per day;
  - top searches and **searches with no result**;
  - demand by category vs the tenant mix;
  - zone heatmap;
  - promo clicks;
  - plate health;
  - directory accuracy %;
  - feedback volume and time-to-fix.
- **Any count under 10 is hidden. One threshold, everywhere.**
- **PDF (5 pages):**
  1. Scorecard.
  2. Journeys.
  3. Car-finding.
  4. Top 20 missed demand.
  5. Plate, map and feedback health, with actions.
- **How the PDF is made:**
  - jsPDF with embedded Noto Sans Arabic; bay codes and brand names wrapped in direction isolates;
  - an HTML print view (the browser's "Save as PDF") as the fallback for Arabic-heavy pages;
  - QR sheets made with the `qrcode` library.

**SUPPORT LOOP**
- **Feedback buttons:** shop moved, shop closed, sign missing or damaged, wrong direction, lift broken.
- **Three independent reports within 24 h** flag the item on the dashboard.
  - "Lift broken" creates a *pending* outage that Ops confirm with one tap. It is never applied automatically.
- **Daily digest** to mall Ops and 10 Digital.
- **SLA:** safety items fixed the same day; directory items within 1 business day.
- **Info desk** gets a one-page Arabic/English cheat sheet and a staff QR that opens the Tenant Editor.

---

## 14. PRIVACY & LEGAL (Oman PDPL)

**THE LAW**
- **Royal Decree 6/2022**, in force since 13 Feb 2023. Executive Regulations: Ministerial Decision 34/2024. **Fully enforceable since 5 Feb 2026.**
- **Consent** must be explicit and verifiable. Children's data needs a guardian's express consent.
- **Transfer outside Oman** needs explicit consent *plus* the controller's own assessment that the destination protects data adequately (Article 37; sources differ on details). Truly anonymised data is outside the rule.
- **Every controller** must appoint a data protection officer (DPO) and report breaches within 72 h.
- **Fines:** OMR 500–500,000 through the courts; administrative fines up to OMR 2,000.
- **Location** is not on the "sensitive" list, but location tied to a person is still personal data. Disability or health signals may be sensitive, so the step-free choice is counted **only in aggregate**.
- **Hosting:** Google has **no cloud region in Oman**. The plan is Doha (me-central1), but whether Firestore is offered there is UNVERIFIED. The region choice cannot be undone.

**DESIGN CHOICE: minimise and disclose honestly**
- Position is computed on the phone.
- No accounts, and no ID that follows a device from visit to visit.
- Event records carry a **random per-trip ID**, a 3-hour time bucket, and sign/target IDs. They auto-expire after 30 days.
- Rollups run in the analyst's browser. **Raw events never reach the GitHub runner** and are excluded from backups.
- Search terms are scrubbed (§10).
- Saved cars expire after 24 h and are deleted on "Found my car".
- Meet-me pins live only in the link.
- **No GA4 in the MVP.** That means no consent banner is needed, which keeps the one-task-per-screen rule.

**SUB-PROCESSORS**, named in the DPA and in the copy:
- Google/Firebase (Doha; Auth location for admin emails UNVERIFIED);
- Cloudflare, if chosen;
- GitHub (backups of admin records);
- the SMTP or Telegram provider for alert digests.

Fonts are self-hosted, so visitor IPs are not sent to Google Fonts.

**CONTRACT & PROCESS**
- The mall is the controller and 10 Digital the processor, under a DPA with:
  - a named DPO contact;
  - a 72-hour breach runbook;
  - clauses on data rights, map data use and publication, and tenant-logo rights.
- **Data subject requests:** car records are deleted by their link ID; analytics are anonymous.
- **Terms:**
  - bilingual `/terms` with a routing disclaimer: "Directions are guidance only; follow mall signs and staff." / «الإرشادات للمساعدة فقط؛ اتبع لافتات المول وتعليمات الموظفين.»
  - limitation-of-liability wording in the mall contract.
- **Omani counsel must confirm:**
  - that the save button counts as explicit consent;
  - the transfer wording;
  - map copyright;
  - the 8th Wall licence (Stage E).

**CONSENT COPY**

| Where | English | Arabic |
|---|---|---|
| Button | Save my car here · kept 24 h | احفظ سيارتي هنا · لمدة ٢٤ ساعة |
| Below the button | We save only your bay code. No name, phone or account. Stored on Google servers outside Oman (Doha); our hosting providers process your IP address to deliver the page. Deleted after 24 h or when you tap "Found my car". | نحفظ رمز الموقف فقط، بدون اسم أو رقم هاتف أو حساب. يُخزَّن على خوادم Google خارج عُمان (الدوحة)، ويعالج مزوّدو الاستضافة عنوان IP لعرض الصفحة. يُحذف بعد ٢٤ ساعة أو عند الضغط على «وجدت سيارتي». |
| Footer | We count trips anonymously (which signs were scanned and how long trips took), with no name, phone or account. | نحسب الرحلات بشكل مجهول (أي اللوحات مُسحت وكم استغرقت الرحلة) بدون اسم أو رقم هاتف أو حساب. |
| Meet-me link | Shares a meeting point, not your live location. | يشارك نقطة لقاء فقط، وليس موقعك المباشر. |
| Plate | No signal? Photograph this plate. · Dallni never asks for payment or login. | لا توجد تغطية؟ صوّر هذه اللوحة. · دلّني لا يطلب منك الدفع أو تسجيل الدخول أبداً. |

---

## 15. ROADMAP (Sam's protocol)

### 15.1 DECISIONS REGISTER

Nothing here is confirmed by Sam yet.

| Decision | Proposed value | Status |
|---|---|---|
| Product name | Dallni دلّني (pending trademark and domain checks) | PROPOSED (Q5) |
| Pilot hosting | Q2 options A/B/C; suggested B, with A as the $0 escape hatch | PROPOSED (Q2) |
| Firestore region | me-central1 Doha, if offered (cannot be changed later) | PROPOSED (Q3) |
| Only "server" | GitHub Actions runner | PROPOSED (Q4) |
| Free-tier Hosting limit | One range: ~450–1,700 users/day (UNVERIFIED) | PROPOSED |
| Small-count threshold | 10, everywhere | PROPOSED |
| CSV/XLSX import, Ramadan/Eid hours, emergency mode | Core (Essential), not Pro | PROPOSED |
| Map Studio scope | A01, A02, A04–A13 in the MVP; A03 tracing after mall #2 | PROPOSED |
| Analytics | Firestore event documents only; no GA4 in the MVP | PROPOSED |
| Meet-me pins | Inside the link only; no Firestore | PROPOSED |
| Logos | None in v1 unless the LOI grants the rights | PROPOSED |
| Timing | Demo Mall and core app before any LOI; mall mapping only after the LOI | PROPOSED |
| Beta features (estimated dot, camera arrows) | Not on the live pilot before Eid al-Fitr; then only if field tests pass | PROPOSED |

### 15.2 DATED STAGE TIMELINE

| Stage | Dates | What | Gate |
|---|---|---|---|
| **A Validate** | 8 Oct – 15 Dec 2026 | Step 0 questions. Clickable prototype (Stitch). Fictional **Demo Mall**. Sales meetings. Email Apple Business Register about Oman coverage. Field tests on 3–4 phones (compass at ~20 points, step drift, motion-sensor rate, QR in car-park light, Wi-Fi login page). Measure payload. Trademark and domain checks | **Signed LOI by 15 Dec** |
| MVP build (Phases 1–5) | Nov 2026 – mid-Jan 2027 | On Demo Mall data. **Includes Proof Report event capture and the PDF** | Each phase approved |
| **B Pilot setup** | 15 Dec – 31 Jan (only if the LOI is signed) | DXF, mapping, signal survey, baseline trials, plates, restore test | Ops sign-off on plates |
| **C Prove** | Soft launch ~1 Feb → Ramadan ~8 Feb → Eid al-Fitr ~9–10 Mar 2027 | Live pilot, Proof Reports, case study in April. Betas only **after** Eid, and only if the tests pass. Kiosk mode | Renewal |
| Fallback | Eid al-Adha ~16–17 May 2027 | If the LOI slips | — |
| **D Scale** | Q2 2027+ | A03 tracing tool, malls #2–3, IMDF/Apple maintainer service, tenant role, partner API, parking adapter, Demand Radar (≥3 malls), Urdu/Hindi if the data shows demand | **2 malls signed** |
| **E Native** | H2 2027+ | One multi-venue Capacitor app, sensor plugin, barometer, Wi-Fi RTT; floor-fixed AR, beacons or VPS **only if a mall pays** | A paying mall |

### 15.3 BUILD PROTOCOL

**STEP 0 → CONFIRM**
- Ask the §17 questions **one at a time**.
- Write a one-paragraph summary.
- Ask **"CONFIRMED?"**. Nothing gets built before "CONFIRMED".

**PHASE 1: ARCHITECTURE MAP + DATA MODEL + FILE STRUCTURE (text only)** (~1 week)
- **Deliverables:**
  - final architecture diagram;
  - entity and collection schemas;
  - security-rule outline;
  - roles matrix;
  - folder tree;
  - payload budgets;
  - search normaliser spec;
  - event definitions;
  - a 1–2 day spike rendering 20 real mixed Arabic/Latin/digit strings with jsPDF and Noto Sans Arabic.
- **Acceptance:**
  - Sam approves the documents;
  - an Arabic reader signs off the PDF spike, or Sam approves the HTML-print fallback (a deviation from the jsPDF default).
- **STOP: wait for APPROVED.**

**PHASE 2: FIREBASE SETUP + DATA LAYER** (~1.5–2 weeks)
- **Deliverables:**
  - dev project on Spark with the billing kill-switch documented;
  - Firestore region decision recorded;
  - rules, with emulator tests (savedCars, events, audit batch, roles);
  - typed repositories, IndexedDB write queue, REST writer for `/p`;
  - offline cache configured;
  - **minimal Demo Mall seed.** Flagged deviation: early seed data is needed for development and sales demos;
  - setup steps list (accounts, 2FA, OIDC for the runner).
- **Acceptance:**
  - all rule tests pass;
  - a car saved offline syncs later;
  - every admin write creates an audit entry.
- **STOP: wait for APPROVED.**

**PHASE 3: CORE SCREENS + VALIDATION** (~3–4 weeks)
- **Deliverables:**
  - **Shopper screens:** S01–S11, S13–S20, S22–S23 (no S12):
    - `/p` in plain CSS;
    - search with the normaliser and synonyms;
    - step cards, voice and fallback clips, screen-awake lock;
    - floor check; SVG fallback;
    - Car Card message, share and screenshot;
    - emergency mode; hours model.
  - **Studio screens:** A01, A02, A04–A07, A09–A11:
    - Tenant Editor, sign registry, XLSX/CSV import (BOM detection, garbled-Arabic block, template, UTF-8 BOM exports);
    - live overrides, corridor blocks, connector overrides.
- **Acceptance:**
  - `/p` ≤60 KB and Where-to ≤250 KB;
  - the full journey works with every permission denied;
  - RTL turn test passes;
  - works on iOS 16.4 Safari, Chrome iOS, Samsung Internet and a budget Android.
- **STOP: wait for APPROVED.**

**PHASE 4: DASHBOARD + ALERTS + CSV/PDF REPORTS** (~2 weeks)
- **Deliverables:**
  - D01–D08 and the browser rollup;
  - plate health (<20% of expected rate);
  - feedback triage (A12);
  - Proof Report (jsPDF + HTML print);
  - QR sheets and installer sheet (A08);
  - IMDF export (A13);
  - runner: publish, backup, digest, uptime check, spike alerts.
- **Acceptance:**
  - the PDF renders Arabic correctly;
  - counts under 10 are hidden;
  - the digest arrives;
  - the restore script works.
- **STOP: wait for APPROVED.**

**PHASE 5: POLISH** (~1.5 weeks)
- **Deliverables:**
  - motion;
  - full RTL audit;
  - accessibility audit (200% text, screen reader);
  - device matrix and Lighthouse on a low-end profile, including WhatsApp and Instagram in-app browsers;
  - **full Demo Mall:** 3 retail + 2 parking levels, ~120 units, ~80 bilingual brands, ~60 plates, and 30 days of synthetic stats;
  - printed table-top demo plates.
- **Acceptance:**
  - the 5-minute demo runs end-to-end on 3 phones;
  - all CI budgets are green.
- **STOP: wait for APPROVED.**

**LATER PRODUCT STAGES**
- **Native shell (Stage E):** custom sensor plugin, ML Kit scanner, universal links, App Check, one multi-venue app.
- **Beacons / VPS:** only on a mall-paid quote, using the per-mall costs in §4.
- **AR premium:** Camera Guide beta (Stage C, gated); then the 8th Wall binary after legal review, or native ARKit/ARCore.
- **Multi-mall (Stage D):**
  - 10 Digital short domain with a redirect layer;
  - exit clause: for 6 months after a mall leaves, plates redirect to a "service ended" page or the mall's new system, or are removed;
  - keep the current bundle plus the last 3;
  - security-rule allow-list regenerated per venue;
  - automatic contrast check on each venue theme.

---

## 16. RISKS & MITIGATIONS

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| No floor plans, or no permission for plates | High / fatal | Licence and placement clauses in the LOI. Painted pillar codes work with zero plates |
| Mall procurement slower than 15 Dec | High / high | Demo Mall sells in the meantime; no mapping before the LOI; Eid al-Adha fallback |
| "Same as competitors" (3D Wayfinder, Visioglobe, Park Assist) | High / high | Lead with the Proof Report; check on site whether their systems still work; make no untested claims about competitors |
| Overpromising a "Google Maps dot" or "VR" | Med / fatal (only reference customer) | Vocabulary rule; no betas before Eid; honest roadmap slide |
| Free tier cuts out at the Eid peak | High / high | Pilot on Blaze or Cloudflare from day 1; Firestore on Blaze; spike alerts |
| First-time visitor with no signal in the basement | High / med | Signal survey; plates only where signal exists; "photograph this plate"; zone picker |
| Wrong directions in a steel building | Med / high | Step cards by default; floor checks; "This step was wrong" button; landmarks chosen after live changes; 20-point course test |
| Shoppers don't scan | Med / high | Nothing to install; a three-word benefit on every plate; plates everywhere; WhatsApp loops; kiosk handoff |
| Fake QR stickers over plates (fraud) | Low / high | "Never asks for payment or login" printed on every plate; tamper-evident plates; Verify-plate mode; monthly security walk; check character |
| Plates removed or vandalised | Med / med | Health alert at <20% of the expected scan rate; monthly inspection |
| Sending people to locked doors, or routing during an alarm | Med / high | Hours model; closing banner; emergency mode; routing disclaimer |
| Arabic breaks in PDFs | High / med | Phase 1 spike; Noto Sans Arabic; HTML print fallback |
| PDPL breach or a challenge to the consent | Low / high | Minimisation; counsel review; DPA; 72-hour breach runbook |
| Proof Report data is biased or faked | Med / high | Staff-timed trials before and after; 3-tier completion; sanity rules; targets only after calibration |
| IMDF export lets the mall drop the subscription | Med / med | Value lives in the service; paid maintainer line; IMDF kept out of the public bundle |
| Unit economics stay negative | High / med | Scale gate at 2 malls; raise mall #1 fees; bundle other 10 Digital retainers; real labour rate |
| Apple indoor maps arrive in Oman | Low / med | Ask in Stage A; become the paid maintainer of the mall's Apple listing |
| Old phones and in-app browsers | Med / med | Plain-CSS `/p`; SVG fallback; device matrix; Tailwind v3-lts if needed |

---

## 17. STEP 0: DNA DISCOVERY QUESTIONS

These are asked **one at a time**, in order of how much each answer changes the build. Each has a suggested default.

1. **Which mall first, and who do you know there (name and role)?** *Default: Muscat Grand Mall, through its Marketing Manager.*
2. **Hosting for the live pilot:**
   - (A) shopper app on Cloudflare Workers Static Assets, $0;
   - (B) Firebase Hosting on Blaze, about $14–44/month, passed on to the mall;
   - (C) Spark only, as a demo.

   *Default: B for the pilot, A kept as the escape hatch; Spark for development.*
3. **Firestore region:** approve me-central1 (Doha), if Firestore is offered there? It can never be changed. *Default: yes.*
4. **Is a free GitHub Actions job acceptable as the only "server"** (publish, backups, digests)? *Default: yes, under the 10 Digital organisation, with no keys.*
5. **Brand:** one "Dallni" network brand, or white-label per mall? *Default: Dallni with "at [Mall]" co-branding; white-label as a paid add-on.*
6. **Who traces mall #1 (120–240 h), and how many hours a week?** *Default: two people at 20 h a week, so it fits the 15 Dec – 31 Jan window.*
7. **What is 10 Digital's real loaded hourly cost?** *Default: the OMR 8/h placeholder (it drives all the pricing).*
8. **Does 10 Digital have a Mac, and Apple and Google Play organisation accounts?** *Default: not needed until Stage E.*
9. **Digits in Arabic mode:** Arabic-Indic (١٢٣) or Western (123) by default? *Default: Arabic-Indic on screen, both styles on plates; test with users.*
10. **Which permanent short domain goes on the plates?** *Default: a new 10 Digital-owned short domain, bought before any printing.*
11. **Budget ceiling for the demo kit and the pilot plates?** *Default: demo kit on A4 under about OMR 50 (estimate); pilot plates paid by the mall at cost + 15%.*

After the last answer: a one-paragraph summary, then **"CONFIRMED?"**

---

## 18. SOURCES

**Indoor positioning**
- https://galileo-masters.eu/winner/gnss-assisted-smartphone-precise-positioning-gaspp/
- https://docs-dev.pointr.tech/docs/shared/Features/Wayfinding/Mark%20My%20Car
- https://codeberg.org/handi/offline-directions-finder
- https://caniuse.com/webnfc
- https://gototags.com/help/ios/nfc/reading/background
- https://caniuse.com/mdn-api_deviceorientationevent_requestpermission_static
- https://bugs.webkit.org/show_bug.cgi?id=201676
- https://doaj.org/article/2361c5eac88d495780c8c7836fc31c65
- https://www.w3.org/TR/generic-sensor/
- https://capawesome.io/plugins/barometer
- https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/hotmobile14b.pdf
- https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
- https://files.seeedstudio.com/Bazaar/product_pdf/100085893.pdf
- https://store.gimbal.com/products/series-21-beacon-2
- https://doc.arcgis.com/en/ips/latest/android/mobile/beacon-deployment-strategies.htm
- https://navigine.com/developers
- https://developer.android.com/develop/connectivity/wifi/wifi-rtt
- https://developer.android.com/develop/connectivity/wifi/wifi-scan
- https://developer.apple.com/nearby-interaction/
- https://www.indooratlas.com/pricing/
- https://developers.immersal.com/docs/immersal-sdk/pricing/
- https://www.nianticspatial.com/resources/pricing
- https://www.multiset.ai/pricing
- https://developers.google.com/ar/develop/c/geospatial/check-vps-availability
- https://register.apple.com/resources/indoor/program/faq
- https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates

**AR / camera**
- https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/
- https://developer.apple.com/forums/thread/743655
- https://www.roadtovr.com/google-webxr-chrome-81-ar-vr/
- https://8thwall.org/docs/open-source
- https://8thwall.com/docs/migration/engine-distribution
- https://www.8thwall.com/docs/migration/faq/
- https://zap.works/pricing.md
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10708641/
- https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static
- https://bugs.webkit.org/show_bug.cgi?id=215884
- https://developer.apple.com/forums/thread/801146
- https://researchconnect.suny.edu/en/publications/a-smartphone-thermal-temperature-analysis-for-virtual-and-augment/
- https://github.com/ionic-team/capacitor-plugins/blob/main/motion/README.md

**Map, data, routing**
- https://docs.ogc.org/cs/20-094/
- https://www.mappedin.com/imdf
- https://github.com/OSGeo/gdal/blob/master/doc/source/drivers/vector/dxf.rst
- https://wiki.openstreetmap.org/wiki/License/Legal_Structure
- https://www.wipo.int/wipolex/en/legislation/details/5832
- https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md
- https://github.com/maplibre/maplibre-gl-js/blob/main/src/css/maplibre-gl.css
- https://github.com/anvaka/ngraph.path
- https://firebase.blog/posts/2018/08/better-arrays-in-cloud-firestore
- https://blog.mapspeople.com/the-roi-of-indoor-mapping

**Competitors & Oman market**
- https://3dwayfinder.com/?p=6031
- https://webdev.3dwayfinder.com/?p=5902
- https://visioglobe.com/post/visioglobe-and-the-advergy-collaboration-an-innovative-digital-experience-for-al-araimi-boulevard-mall-oman
- https://mappedin.com/pricing
- https://help.mappedin.com/en/articles/10371210-analytics
- https://www.mappedin.com/resources/news/mappedin-launches-its-indoor-mapping-solution-at-the-dubai-mall/
- https://www.mappedin.com/resources/news/mappedin-and-cenomi-centers-partner-to-deliver-interactive-venue-experience-across-malls-in-saudi-arabia/
- https://pointr.tech/blog/pointr-launches-ips-reem-mall
- https://support.google.com/product-documentation/answer/1685827?hl=en
- https://whatson.ae/2020/08/apple-maps-has-now-launched-in-the-uae/
- https://www.parking.net/parking-news/park-assist/muscat-grand-mall-parking-guidance-system
- https://www.muscatdaily.com/2025/02/09/muscat-grand-mall-unveils-exciting-new-developments/
- https://www.tradearabia.com/news/RET_228111.html
- https://www.retail-insight-network.com/projects/mall-of-oman/
- https://gulfbusiness.com/en/2023/retail/majid-al-futtaim-inaugurates-mall-of-oman
- https://www.arabianbusiness.com/gcc/oman/mall-of-muscat-announces-new-openings-after-record-4m-footfall-last-year
- https://timesofoman.com/article/157413-strategic-alliance-formed-between-tamani-global-and-lulu-holdings-for-mall-of-muscat
- https://www.muscatdaily.com/2026/09/24/majid-al-futtaim-launches-share-in-oman-bringing-more-rewarding-everyday-experiences-to-customers/
- https://www.directlinegroup.co.uk/en/news/brand-news/2025/28112025.html
- https://www.ipsos.com/en-us/node/1070391
- https://www.thurrott.com/?p=322106
- https://developer.apple.com/documentation/updates/appclips.md
- https://viadirect.com/shopping-mall-wayfinding-gallerian-omnichannel-navigation/

**Business, marketing, brand**
- https://www.muscatdaily.com/2026/09/13/oman-tourism-sector-grows-strongly-attracting-4-mn-visitors-in-2025/
- https://www.omanobserver.om/article/1184904/oman/tourism/over-137000-cruise-tourists-visit-oman-in-2025
- https://www.thenationalnews.com/news/uae/2026/10/06/ramadan-2027-uae-dates-eid-al-fitr-holiday/
- https://calendarific.com/holidays/2027/om
- https://napoleoncat.com/stats/instagram-users-in-oman/
- https://timesofoman.com/article/124843-oman-makes-it-mandatory-to-procure-licenses-to-publish-advertisements-on-social-media
- https://timesofoman.com/article/174967-oman-warns-social-media-influencers-businesses-against-promoting-food-products-without-approval
- https://apps.apple.com/ug/app/deallony/id6747880235
- https://apps.apple.com/qa/app/wain-%D9%88%D9%8A%D9%86/id541575727
- https://www.thenational.ae/arts-culture/art/create-a-living-museum-with-the-nuqta-app-1.294169
- https://developer.apple.com/app-store/review/guidelines/

**Privacy & legal**
- https://cms.law/en/omn/legal-updates/oman-personal-data-protection-law-entering-the-enforcement-phase
- https://blog.decree.om/2025/extension-of-the-grace-period-to-comply-with-data-protection-regulation/
- https://www.addleshawgoddard.com/en/insights/insights-briefings/2024/data-protection/executive-regulations-oman-personal-data-protection-law/
- https://www.pwc.com/m1/en/blogs/pdf/Oman-PDPL-series-Part2-Executive-Regulations.pdf
- https://www.clydeco.com/en/insights/2024/02/oman-issues-executive-regulations-to-pdpl
- https://datacenterdynamics.com/en/news/google-launches-cloud-region-in-doha-qatar
- https://firebase.google.com/docs/firestore/locations

**Firebase & platform**
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/firestore/pricing
- https://cloud.google.com/firestore/pricing
- https://firebase.google.com/docs/hosting/usage-quotas-pricing
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- https://firebase.google.com/docs/functions/quotas
- https://firebase.google.com/docs/auth/limits
- https://docs.cloud.google.com/recaptcha/docs/billing-information
- https://cloud.google.com/billing/docs/how-to/disable-billing-with-notifications
- https://registry.npmjs.org/firebase
- https://github.com/firebase/firebase-js-sdk/blob/main/packages/firebase/CHANGELOG.md
- https://webkit.org/?p=14403
- https://webkit.org/?p=16993
- https://caniuse.com/mdn-api_barcodedetector
- https://bugs.webkit.org/show_bug.cgi?id=281848
- https://www.npmjs.com/package/zxing-wasm
- https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json
- https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
- https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json
- https://capgo.app/docs/upgrade/from-v7-to-v8/
- https://axonbuild.com/blog/cost-to-publish-an-app-to-the-app-stores/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/pages/platform/limits/
- https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/pages/workers-for-new-projects.mdx
- https://github.com/github/docs/blob/main/data/reusables/billing/actions-included-quotas.md
- https://tailwindcss.com/docs/compatibility

**Design, fonts, accessibility, PDF**
- https://www.w3.org/TR/WCAG22/
- https://fonts.googleapis.com/css2?family=Readex+Pro:wght@160..700
- https://github.com/google/fonts/tree/main/ofl/readexpro
- https://github.com/google/fonts/tree/main/ofl/notosansarabic
- https://github.com/google/fonts/tree/main/ofl/amiri
- https://github.com/google/material-design-icons/tree/master/variablefont
- https://github.com/parallax/jsPDF
- https://github.com/parallax/jsPDF/blob/master/src/modules/arabic.js

---

**SAM, QUESTION 1 (the only one for now):** Which mall do we go after first, and who do you personally know there (name and role)?