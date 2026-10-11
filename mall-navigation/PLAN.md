# Dallni (دلّني): Mall Navigation & Find-My-Car. Master Plan (v1.1, 2026-10-08, by 10 Digital)

> **v1.1:** Step 0 Q1 answered (Mall of Oman) + 3D game-like map + offers near shops. See **§19**; where §19 conflicts with earlier sections, §19 wins.

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
  - Map (v1.1, §19.2): SVG 2D + step cards in the pilot; an opt-in game-like 3D view (plain three.js + troika, no R3F) after device tests. MapLibre dropped.
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
- **Mall #1 (sized for Muscat Grand Mall):** 120–240 h in QGIS, including a 16–24 h site walk. **Mall of Oman as a paid pilot: 600–1,200+ h (estimate), and only with a MAF DXF/IMDF licence (§19.1).** Benchmark: MapsPeople quotes 60–80 h per 10,000 m² working from CAD.
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
- **v1.1 OVERRIDES this block (§19.2):** MapLibre leaves the shopper app. The pilot map is SVG 2D (production quality, not just a fallback) + step cards. The game-like 3D view uses plain three.js r186 + troika-three-text, opt-in after device tests, never blocking the step card. (Was: flat 2D + a 2.5D Overview, no three.js.)
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
- Promotions during navigation (v1.1, §19.3): pull-only and opt-in. At most one muted, collapsed offer chip on an eligible step (≤2 per trip; ≤6 offers per trip in total), never blocking Next. None on parking, car flows or floor changes.
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

**PAID PILOT TARGET: MUSCAT GRAND MALL (Tilal Development).** Sam answered Q1 on 2026-10-08 with **Mall of Oman**, recommended as the showcase and long-term target (Option A). Making MoO the paid pilot (Option B) moves the LOI to Q2 2027 at the earliest. See §19.1.
- **Why:**
  - independently owned;
  - already buys parking tech (Park Assist on 1,800 bays, Hayak in 2025).
- **Risk:** Park Assist may already find cars by licence plate. Check on site. If it does, pitch Dallni as the in-mall layer plus the measurement.
- **Backups:**
  - Al Araimi Boulevard: a replacement sale, if the 2018 app is no longer running;
  - Mall of Muscat: 4M+ visitors a year, but tied to LuLu, which uses 3D Wayfinder.
- **Skip for now:** Panorama (vacant units) and City Centre Muscat/Qurum. **Mall of Oman (MAF) is no longer skipped:** it is the showcase target, approached in Q1 2027 through a warm intro. No offers there without a MAF deal, because SHARE owns offers (§19.1).

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
- **Royal Decree 6/2022**, in force since 13 Feb 2023. Executive Regulations: Ministerial Decision 34/2024. **Fully enforceable since 5 Feb 2026.** **Amended by Royal Decree 68/2026 (3 Sep 2026; Gazette No. 1664, as reported):** wider territorial scope, explicit consent before any marketing, and rules on automated decisions. Re-check this section against the Gazette text before any DPA is signed (§19.3).
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

1. **Which mall first, and who do you know there (name and role)?** **ANSWERED (mall only) on 2026-10-08: Mall of Oman** (§19.1). **Q1b ANSWERED: nobody yet** (cold start, §19.1). Next: Q1c, Option A or B (§19.1).
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

## 19. STEP 0 ANSWERS & SCOPE CHANGES (v1.1, 2026-10-08)

**WHY THIS SECTION.** Sam answered the mall half of Q1 and added two features: a game-like 3D map, and offers near shops. This section records the answer, gives the honest verdict and changes the plan.
- **Where §19 conflicts with §0–§18, §19 wins.** Eight in-place edits in earlier sections point here.
- **Method note:** most Mall of Oman and legal facts come from search-result extracts, because full page fetches were blocked. Confidence is labelled. UNVERIFIED = not confirmed on 2026-10-08. Hours, sizes and money are estimates unless a source is cited.

### 19.1 Q1 ANSWER: MALL OF OMAN

**RECORDED (Sam, 2026-10-08, meaning in plain words)**
1. **First mall: Mall of Oman (MoO)**, "the biggest parking mall".
2. **The future key feature:** every detail of the mall on the map. Not a flat Google-Maps-style map and not just arrows: a **game-like 3D view with the correct colours and the real shop sign names** (§19.2).
3. **Walk near a shop → see its offers and prices, and compare** (§19.3).
- **Q1b ANSWERED (2026-10-08): nobody yet** at Mall of Oman or MAF. → Cold start: warm intro through 10 Digital's own network to the MoO General Manager or Oman marketing manager; first approach Q1 2027, armed with the 3D Demo Mall (and the MGM Proof Report under Option A).

**MALL OF OMAN: WHAT WE KNOW**

| Fact | Value | Confidence |
|---|---|---|
| Owner / opening | Majid Al Futtaim (MAF). Soft opening Sep 2021; inaugurated 7 Feb 2023 | High |
| Size | ~145k m² leasable (sources range 137k–145.85k) | Med |
| Units | 260 retail + 45 dining (MAF, 2023) vs 350 incl. 55 dining (later third-party pages) | Med |
| Parking | 5,200–5,500 bays, multi-level, 3 entrances/exits, disabled bays | Med |
| Level names, zone colours, bay numbering, full gate list | Not online | **UNVERIFIED** (needs a visit) |
| Anchors | Snow Oman (14,830 m²), VOX (15 screens), Magic Planet, **HyperMax** (Carrefour left Oman on 7 Jan 2025) | High |
| Footfall | No official figure; ~8M a year ≈ 22k a day (Occupi estimate) | Low |
| Existing digital | mallofoman.net "Mall Map" (vendor and parking coverage UNVERIFIED). The City Centres app has find-my-car at *some* MAF malls (MoO coverage UNVERIFIED) | High / Med |
| SHARE app | Launched in Oman 24 Sep 2026: SHARE ID, points, "personalised offers", 900+ stores, includes MoO. No maps or find-my-car reported. No public API or partner programme found | High / Med |
| How MAF buys | Big or government-linked vendors (Parkin, DESIGNA, Park Assist, Dubai Future Foundation). Digital is run centrally from Dubai | Med |
| Muscat 3D precedent | Oman Avenues already runs 3D Wayfinder with QR codes in parking (vendor claim). **3D on its own is not a differentiator** | Med |

**HONEST VERDICT**
- **MoO is Oman's best showcase and its hardest first customer.**
  - **Showcase:** the biggest car park, famous anchors, and everyone in Muscat knows it.
  - **Customer:** decisions are made in Dubai, MAF buys from big vendors, we have no reference customer yet, and **SHARE launched 14 days ago to own offers in this exact mall**. MAF also sells shopper attention itself (Precision Media).
- **Chance of a paid MoO pilot in 2026–27: under 10%.** This is our judgement, not a sourced figure.
- **Offers at MoO collide with SHARE.** No third-party offers there without a MAF deal.
- **Find-my-car at MoO may already exist** through MAF hardware or the City Centres app (UNVERIFIED). Check before pitching it.

**THE TRADE-OFF (Sam picks A or B)**

| | **A. MoO = showcase + long-term target (RECOMMENDED)** | **B. MoO = paid pilot** |
|---|---|---|
| Paid pilot mall | Muscat Grand Mall (Park Assist, 1,800 bays); Mall of Muscat as backup | Mall of Oman |
| LOI | 15 Dec 2026 (the v1 gate holds) | No earlier than Q2 2027, through MAF procurement plus an InfoSec/PDPL review |
| Proof window | Ramadan → Eid al-Fitr 2027 (v1) | Eid al-Adha 2027 at best; realistically Ramadan 2028 (~late Jan 2028, UNVERIFIED) |
| Mapping | 120–240 h at MGM (v1 §6), plus one MoO zone **after written permission**, ~80–160 h incl. site walk | **600–1,200+ h.** MapsPeople's benchmark alone gives ~870–1,160 h for the retail area from CAD, before ~140k m² of car-park decks and 3D sign data for 260–350 units. The low end only works if MAF hands over DXF or an existing IMDF |
| Fits Stage B (2 people × 20 h/week ≈ 260 h)? | Yes | **No** |
| Floor plans | MGM DXF under the LOI | A MAF DXF/IMDF licence first. No tracing from covert photos |
| Car park | MGM: the Park Assist story (v1) | Waits until MoO's parking kit (kiosks, bay lights, app) is known |
| What Sam has by mid-2027 | Revenue, a Proof Report and a case study, then a MoO pitch backed by real numbers | Maybe an LOI, but no proof data yet |

- **Ask MAF early, under either option:** does an IMDF already exist, from the mallofoman.net map vendor or an Apple Indoor submission? Importing it would cut the hours sharply.

**MoO APPROACH (OPTION A), IN THIS ORDER**
1. **Now → Feb 2027:** the public **Demo Mall in 3D**, with generic brands (Phase 6, §19.2).
2. **Warm intro** through 10 Digital's own network to the MoO General Manager or the Oman marketing manager. **Ask for written permission to map one zone free** as a proof of concept. Show the Demo Mall and, once it exists, the MGM Proof Report.
3. **Build the MoO zone only after that permission.** Until then, no MoO model, screenshots or plates exist.
4. **First approach: Q1 2027**, once SHARE's launch has settled.
- **Pitch line:** "Dallni does wayfinding and find-my-car, which SHARE doesn't. Offers can deep-link into SHARE."
- **The realistic MAF path is embed mode:** `/embed?venue=&to=` plus a postMessage API, so MAF can host Dallni inside SHARE as a WebView. It is fixed as an API contract from day 1 (screen S29).
- **Entry routes, in order:**
  1. the warm intro;
  2. the next MAF Launchpad call with AstroLabs (no 2024–26 edition was found);
  3. MAF supplier registration. Confirm the IT route first. **Al-Futtaim's Ariba portal belongs to a different company.**
- **Rules for any MoO material:**
  - **nothing taken from mallofoman.net** (MAF's copyright). This settles a contradiction between the two research reports;
  - no tenant logos and no SHARE logo. The mock button is plain text: "Open offer in SHARE (concept)";
  - offers only on fictional "Your tenant here" units, because fake prices on real tenants are a misleading-advertising risk;
  - private and shown in the room only; deleted on request;
  - a one-hour Omani IP counsel check before showing anything with MoO or tenant names.
- **Allowed now:** Sam visits as a shopper and notes the parking signage (level names, zone colours, bay codes, any kiosks or bay lights). No systematic photography or measuring without permission. Check the mall's photo rules first.

**MAF MEETING DEMO (5 min, Arabic first, Demo Mall in 3D, on OUR tested phone)**

| Time | What they see |
|---|---|
| 0:00–0:40 | Scan an A4 plate "P1 · Falcon" → S01 opens in under 1 s → Save my car → Car Card sent to WhatsApp |
| 0:40–1:40 | Search «سينما» → Place → GO. The camera flies from the lift lobby up through the stacked floors |
| 1:40–2:40 | Step view with a camera fly on each Next, the escalator stacked view, and one offer chip on a "Your tenant here" unit that opens «١٢٫٦٠٠ ر.ع.» |
| 2:40–3:10 | The sign lights up → Found it ✓ |
| 3:10–3:50 | Back to the car: Basement theme, ~5,500 bays (MoO scale), the amber car |
| 3:50–4:20 | Switch to English live, then 3D → Simple 2D, then airplane mode: it still works |
| 4:20–5:00 | Ops renames a shop on a phone and the 3D sign updates in under 60 s. Close on the Proof Report and the plain-text "Open offer in SHARE (concept)". **The ask: written permission to map one zone, free** |

**WHAT CHANGES IN GTM (§13)**

| Item | v1 | v1.1 |
|---|---|---|
| Pilot target | Muscat Grand Mall | The **paid pilot** stays MGM (Option A). MoO = showcase + long-term target |
| Skip list | Panorama + the MAF malls | Panorama + City Centre Muscat/Qurum. MoO approached in Q1 2027 |
| Fallback malls | Al Araimi Boulevard, Mall of Muscat | Unchanged |
| 5-minute GM demo | 2D Demo Mall on the GM's own phone | Core unchanged. Adds a 40 s "Try 3D" segment, on our tested phone, once Phase 6 passes |
| Pitch deck | 12 slides | Adds "See your mall in 3D" after slide 5. The MAF version swaps slide 7 for "Complements SHARE + embed mode" |
| Offers in the pitch | One offer at "Found it" | Pull-only offers near the sign and on the route (§19.3). At MoO, offers stay with SHARE |

**STAGE A CHECKS ADDED**
1. MoO car park: level names, zones and colours, bay numbering, any Park Assist-style lights or plate kiosks.
2. Who makes the mallofoman.net map, and does it cover parking? (Read the page source.)
3. Install the City Centres app and the SHARE Oman app: do they have a MoO map or find-my-car?
4. Does 10 Digital already have any work or relationship with MAF Oman?
5. MAF's IT supplier route in Oman, and its PDPL/InfoSec questionnaires.
6. Is a 2026/27 Launchpad call open?
7. MoO's current store count and size (260 vs 350 units; 140k vs 145k m²).

### 19.2 3D "GAME-LIKE" MAP

**DECISION**
- **YES to 3D**, as a stylised "architect's model" game view: flat-shaded and low-poly, with colour only where it means something. Not photo-real.
- **This overturns v1's "No three.js".** The engine is plain **three.js r186 + troika-three-text 0.52.5**, with no R3F. **MapLibre leaves the shopper app.**
- **3D is decoupled from the pilot:**
  - the pilot's production map is **SVG 2D + step cards**, with no dependency on the 3D engine;
  - 3D ships first as the **Demo Mall showcase**, then as an opt-in **"Try 3D"** on the pilot once device tests pass;
  - 3D never blocks the step card or Next, and it is **off the 15 Dec LOI critical path**.
- **Why step text stays out of the 3D scene:**
  - a 2025 mall-terminal study found 3D beat 2D only when the landmark text sat on or below the map;
  - in a field study, 3D's "looks like reality" advantage worked poorly;
  - 2D was better for aligning across floors.
  - So the text stays in the card, and floor changes use a stacked view.

**WHAT SAM GETS / DOES NOT GET**

| Sam asked for | v1.1 gives | Not possible or not planned |
|---|---|---|
| Every detail of the mall | Floors, walls, shop fronts, sign boxes, atrium, escalators, lifts, landmark models (e.g. a cinema or snow-park entrance), parking pillars and bays | Photo-real interiors, crowds, parked cars (they would imply live data) |
| Game-like, not just arrows | A 3/4 view, a camera fly on Next, a glowing route ribbon, stacked floors, and the sign lighting up on arrival | Free first-person roaming, a walking avatar (we have no live position), points or badges |
| Correct colours | Category colours by default; **real brand sign colours with a written licence** | Brand colours or trade dress without a licence |
| Real shop board names | The name as printed on the shop front, in Arabic + English, on 3D sign boxes | The brand's own logo lettering (only as a licensed logo image) |

**BRAND-RIGHTS RULE (for Sam, in one sentence):** real brand colours and logos appear only with the mall's or the tenant's written licence; until then, every shop shows its name in plain text on its category colour.
- **Stored per shop:** `logoLicence{source, grantedBy, date}`, written to auditLog. The source is either a mall lease clause confirmed in writing or the tenant's consent recorded in A14.
- **Law:** Industrial Property Rights Law RD 67/2008 + GCC Trademark Law RD 33/2017. Reported penalties are up to 2 years in prison and/or OMR 2,000–10,000 (Low–Med; confirm with counsel).

**ART DIRECTION: PALETTE**

This extends §9. Colours that carry meaning use **unlit** materials, with shading baked into vertex colours, so the hex values below are what renders.

| Element | Sunlight | Basement (automatic on parking) |
|---|---|---|
| Background | #FFFFFF → #F1F4F8 | #0B0F14 |
| Slab / walkway | #F1F4F8 / #F7F8FA | #161B22 / #1B212B |
| Roofs / walls | #E3E8EF / #CDD5DF | #2A3342 / #3A4556 |
| **Wall-top strips** (the "edges") | #5B6573, 0.2 m wide, as real geometry (5.6:1 on walkway, 4.8:1 on roof) | #7A8597 (4.3:1 on walkway) |
| Route core / casing | #0B57D0 / #FFFFFF (6.0:1) | #7AB0FF / #0B0F14 (7.3:1) |
| Walked route | **#7A8494, dashed** (3.6:1) | **#6B7686, dashed** (3.5:1) |
| You-are-here | #0B57D0 + white ring | #7AB0FF + dark ring |
| Last-seen pin | #5B6573 | #AEB8C6 |
| Car | #F5B700 + #0B0F14 outline | Same |
| Destination ring | #067647 | #4ADE9B |

- Nothing else on the floor uses route blue or car amber.
- **Why strips and not lines:** WebGL lines are always 1 device pixel wide, which is 0.33–0.5 CSS px on modern phones and vanishes in sunlight. Walkway against roof or wall is only 1.16–1.39:1. The alternative is fat lines (LineSegments2, about +6 KB, one draw call).
- No real-time shadows and no bloom. Signs are unlit, so they read as illuminated in both themes.
- **CI checks contrast on rendered screenshots** (Playwright + SwiftShader), not on hex values.

**STOREFRONTS & LABELS**
- **Geometry:** a 4 m facade strip at each shop opening, with a 0.8 m sign box above the door.
- **Unlicensed shops:** the sign band uses the category colour, with a white name and icon (5.2–7.6:1):
  - Fashion #AD1457
  - Food #C2410C
  - Electronics #6D28D9
  - Services #475569
  - Toilets #0E7490
  - Prayer #8A6100
  - Exits #00753A
- **Licensed shops:** `sign.bg/fg` plus the logo. Studio blocks publishing below 4.5:1, or adds a dark plate behind the text.
- **Text:** a static Readex Pro SemiBold subset, never the brand's own lettering. The UI language is shown at 100%, with the other language at 70% below it.
- **Labels:**
  - roof labels in Overview and 2D; facade signs in Step view;
  - culled on a screen grid by landmarkScore;
  - hidden below 14 px (Arabic below 16 px);
  - the destination and the next landmark always show.

**ELEMENTS**
- **Atrium:** an open void with a glass rail and a skylight.
- **Landmarks** (score 3): GLB models, ≤300 KB in total.
- **Escalators:** striped ramps with **static** direction chevrons. They turn grey with "Closed" when the live document says so.
- **Lifts:** glass shafts labelled like "L3", with stop names copied from the real lift buttons.
- **Parking:**
  - every bay on a level is one instanced mesh, so ~5,500 bays cost 1 draw call;
  - pillars carry a zone band at 2.0–2.8 m with the zone colour and its Omani icon;
  - zone floor decals at 30% opacity;
  - bay codes appear only closer than 25 m;
  - **no parked cars**;
  - the mall's own painted scheme wins.

**YOU-ARE-HERE (the honest states from §4)**
- **Exact** (scan under 90 s ago): a solid puck with the pin "Gate 3 sign · now".
- **After 2 min:** a grey pin "Last confirmed: Escalator E2 · 2 min ago" plus **Fix my position**.
- **Estimated:** a hollow halo "About here", in the beta only.
- **No avatar, and the marker never slides when Next is tapped.** Next moves only the highlighted segment and the camera.
- **The pulse is a DOM/CSS overlay** placed at the projected puck position and recomputed only when the camera moves, so the 3D scene stays idle.

**ROUTE**
- A 1.2 m ribbon 5 cm above the floor, with a white casing and **static chevrons**.
- One 600 ms chevron sweep, only when the step changes.
- Numbered turn discs; sections on other floors are dotted; a light column marks each connector.

**CAMERAS** (always route-up, never compass-up; fixed tilt presets)

| Mode | Where | Camera |
|---|---|---|
| Overview | S07 step 0, S25 | 30° field of view, 50° tilt, fits the whole route |
| **Step view** (was "Follow") | S07 | 55° tilt, about 35 m in frame; Next = 1.2 s camera fly |
| 2D | "Map view" in More | 90° top-down view of the same scene |

- **Gestures:** three.js MapControls (one-finger pan; two-finger pinch-zoom and rotate) plus 56 px buttons. **No twist and no free tilt** in v1.1.
- Any touch cancels a camera fly. **No auto-recentre:** the 56 px Recentre button pulses once after 8 s idle.
- **Floor change:** a stacked view with the two floors 12 m apart and the connector glowing. S09 reuses it.
- **Motion:** a new 1,200 ms camera-fly timing. Under reduced motion it becomes a 200 ms crossfade.

**GAME FEEL WITHIN THE ADHD RULES**

| Use (each one answers "where next?" or "you made it") | Avoid |
|---|---|
| 1.2 s camera fly on Next; any touch interrupts it | Points, XP, badges, streaks, leaderboards |
| Route ribbon with static chevrons; one sweep per step change | Chevrons flowing all the time (battery and attention) |
| Segmented progress "Step 2 of 6" | Timers, countdowns, "hurry" copy |
| Floor-change light column | First-person free roaming |
| Arrival: the sign brightens, a 600 ms green ring, one chime | Walking avatar, idle auto-rotate, music |
| Car found: the marker hops and the headlights blink once | Confetti, particles, bloom, "spin to win" |

- **Rule:** one animation at a time, and nothing moves without a tap. An idle scene renders **0 frames**; CI checks 10 s of idle.

**TECH CHOICE (works with React 18.3.1)**

| Item | Choice | Why |
|---|---|---|
| Engine | three.js 0.186.1 (r186), WebGLRenderer on WebGL2 | WebGL2 has been required since r163; InstancedMesh and BatchedMesh are in core; MIT licence, so Sam owns the code |
| Text | troika-three-text 0.52.5 (BatchedText) | Arabic joining, lam-alef, kerning and mark positioning in WebGL |
| React | **Stays 18.3.1.** The engine is plain JS outside React | R3F 9.8.1 needs react ≥19 <19.4; R3F v8 has been frozen since 19 Feb 2025; drei 10 needs React 19 |
| Integration | **One renderer and one canvas, as a singleton** in an `engine` module. Screens attach or detach it and send commands (setFloor, showRoute, flyTo) | Otherwise StrictMode double-mounts and screen changes leak WebGL contexts and GPU memory |
| Removed | MapLibre, from the shopper app | three + troika ≈215–220 KB gzip vs MapLibre ≈428 KB (285 main + 143 worker), measured with esbuild. Re-measure in the Vite build in Stage A |
| Not now | WebGPU, R3F, Babylon.js, PlayCanvas | WebGPU is missing on many Android phones (23% of Android Chrome users lack Vulkan 1.1) |
| Buy option | Mappedin Pro, ~$165 per map per month (its React SDK works with React 18) | Faster, but Sam would not own the code |

- React 18.3.1 itself has had no release since 26 Apr 2024. A React 19 check is scheduled for Stage D. The engine module needs no change for it.

**BUILD PIPELINE**
1. **Data:** IMDF (v1) plus new occupant fields, edited in A14 and audited:
   - `sign{textAr, textEn, bg, fg, style}`;
   - `facadeColour`;
   - `logoAssetId` (or null);
   - `logoLicence{source, grantedBy, date}`.
2. **Runtime builder, in a web worker:** turns the GeoJSON into floor slabs, 3–4 m walls, wall-top strips, facade strips at each opening, and sign boxes. One merged mesh per floor, with vertex colours and baked ambient occlusion.
3. **Signs:** troika BatchedText. A rename rebuilds only that sign, so v1's "live in under 60 s" holds. A Blender bake would break it.
4. **Blender (bpy), only for hero props:** escalator, lift, atrium or fountain, gates, car marker. Export to GLB and compress with gltf-transform using **meshopt** (7.7 KB decoder), not Draco.
5. **Parking:** one InstancedMesh of bays per level. Bay codes appear only when zoomed in.
6. **Chunks:** one `/v/{venue}/{ver}/level-{id}.json` per floor. The current floor loads first, then the adjacent ones.
7. **Logos (licensed only):** one **WebP atlas at 1024² per floor** (about 4 MB of GPU memory each), built by the runner. Use KTX2 (a 245 KB transcoder) only if more than about 4 atlases are ever resident at once.
8. **Storefront thumbnails:** one WebP of 20 KB or less per shop, rendered at publish time for S05.
9. **Offline:** once a shopper picks 3D, the service worker precaches the engine and fonts. Floor chunks are versioned and served cache-first.

**ARABIC IN 3D (troika-three-text 0.52.5, source checked)**
- **Works:** Arabic joining forms, lam-alef, ligatures, GPOS kerning and mark positioning.
- **Gaps, and the rule for each:**
  1. **No `calt` feature.** Names containing تي, يت, ري or زي (e.g. «سيتي») may render tighter than in the DOM.
     - **Stage A corpus test:** render every real shop name in troika beside the DOM version.
     - If the difference shows, render Arabic sign labels into a Canvas2D texture atlas, which uses the browser's own shaping, and keep troika for Latin and digits.
  2. **No WOFF2.** Use .woff subsets: Arabic ≈13 KB + Latin ≈19 KB (measured on Fontsource Readex Pro 600).
     - Fontsource's Arabic subset has only 82 code points (no پ چ گ ک).
     - So build our own static SemiBold subset on Sam's PC (size UNVERIFIED; expect it to be a little larger).
  3. **No CDN fallback fonts.** Point `unicodeFontsURL` at a self-hosted copy or a dead URL. Otherwise troika fetches fonts from jsDelivr, which is a PDPL transfer and fails offline.
  4. A14 and A07 **refuse sign text** containing any code point outside the shipped subsets.
  5. Content Security Policy: allow `worker-src blob:`, or run troika without its worker.
  6. Arabic signs never render below 16 px.

**BUDGETS** (enforced in CI; Stage A re-measures them in the real Vite build)

| Item | Budget |
|---|---|
| Engine (three + loaders + troika), loaded lazily after the step card | ≤220 KB gzip |
| Sign fonts (.woff subsets) | ≤50 KB total |
| Floor chunk | ≤300 KB gzip target, 400 KB hard fail (estimate) |
| Parking level chunk | ≤150 KB gzip (estimate) |
| Hero GLBs | ≤300 KB total |
| First 3D visit, everything included | ~0.7–1.6 MB text-only; ~1.1–2.2 MB with logos (estimate) |
| Draw calls | ≤150 per frame (A07 blocks publishing above it) |
| GPU memory | Tier A ≤150 MB, Tier B ≤80 MB (targets, to be measured on a 3 GB iPhone) |
| Resident floors / textures | Current + adjacent floors only; textures ≤1024² |
| Idle rendering | 0 frames over 10 s |

**TIERS & FALLBACK**

| Tier | Trigger | Behaviour |
|---|---|---|
| A | WebGL2, GPU frame time ≤20 ms, and ≥4 GB memory where Chrome reports it | Pixel ratio up to 2, landmark models, render only on change |
| B | Frame time 20–50 ms, or under 4 GB (Chrome only), or iOS Low Power Mode (30 fps cap) | Pixel ratio 1, 30 fps cap, roof labels only, landmarks as plain boxes |
| 2D | Frame time over 50 ms | Top-down view of the 3D scene |
| SVG | No WebGL2; context lost twice; **crash-loop flag found**; Save-Data on (Android hint only) | The pilot's SVG map + S08 |

- **Removed triggers:** "screen reader" and "in-app browser".
  - A web page cannot detect VoiceOver or TalkBack.
  - In-app WKWebViews do run WebGL2.
  - Save-Data and device memory exist only in Chrome. On iPhone, frame timing is the test.
- **Tier test:**
  1. Compile the shaders and upload the floor first.
  2. Run a scripted 1.2 s camera fly and drop the first 5 frames.
  3. Time the GPU work (EXT_disjoint_timer_query_webgl2 where present, otherwise CPU time per frame), not the requestAnimationFrame interval.
  4. Log the tier in `clientErrors`.
- **Toast on any switch:** "Simple map for speed · Try 3D".
- **CRASH-LOOP GUARD (iOS).** iOS often kills the whole tab for WebGL memory **without** firing a context-lost event, then reloads it, sometimes in a loop ending in "A problem repeatedly occurred" (WebKit bugs 300782 and 290623, both open).
  1. Before the renderer starts, write a "3D starting" flag in sessionStorage, or in IndexedDB beside the trip state. It is a device preference, not real data, so the no-localStorage rule holds. Clear it after 10 s of stable rendering.
  2. If the flag is still set on the next load, boot in SVG with the toast "Simple map after a reload".
  3. Dispose every geometry and texture when a floor unloads. Use one renderer for the whole app, and force context loss only on full teardown.
  4. Emulator test: S07 → S14 → S25 → S07, ten times; the GPU memory counts must return to baseline.
  5. **Required Stage A test phone: an old 3 GB iPhone** (SE 2nd gen or XR).
- **Accessibility does not depend on detection:**
  - the canvas is hidden from screen readers;
  - the step card and the S08 step list are the accessible content in every mode;
  - each new step is announced through a live region;
  - "Map view: Simple 2D" is always one tap away in More.
- **Touch targets inside 3D:**
  - hit-test in screen space, with a 44 px radius around each visible label anchor, not by raycasting raw geometry;
  - when 2 or more candidates fall within 44 px, open a bottom sheet with 56 px rows instead of guessing;
  - offer tags and shop pins are **DOM overlays of at least 44×44 px**, culled together with their labels.

**STAGE PLACEMENT**

| When | 3D work | Gate |
|---|---|---|
| Phase 1 (Nov 2026) | **3D spike, 3–5 days:** one Demo Mall floor in three.js + troika; the Arabic corpus test; a memory and frame test on the 3 GB iPhone | Sam sees it on his own phone; go/no-go for Phase 6 |
| Phases 1–5 (Nov – mid-Jan) | No 3D. The SVG renderer becomes the production map: pan/zoom, route-up rotation, 56 px controls, bays drawn as one path per zone (~+1 dev-week, estimate) | v1 acceptance |
| **Phase 6: 3D VIEW** (after Phase 5) | Demo Mall showcase (1 retail floor + 1 parking level), ~3–4 dev-weeks; then production hardening (tiers, crash guard, offline, A14, CI budgets), ~3–6 dev-weeks. **Total 6–10 dev-weeks (estimate)** | Acceptance below. STOP: wait for APPROVED |
| Stage C (after Eid al-Fitr 2027) | "Try 3D" opt-in on the MGM pilot | Device tests pass; crash-loop rate logged |
| After MoO written permission | MoO zone (one wing + one parking level) on the production pipeline, ~80–160 h incl. site walk (estimate) | Permission letter |
| Stage D | All levels, licensed logo atlases, 3D for mall #2 onwards | 2 malls signed |

- **Phase 6 acceptance:**
  - the showcase runs on 3 test phones, including the 3 GB iPhone, with no reload;
  - idle = 0 frames;
  - memory returns to baseline after 10 screen loops;
  - an Arabic reader signs off the sign corpus;
  - all budgets are green;
  - Simple 2D is reachable in every state.
- **Capacity warning:** if the same two people run MGM Stage B and Phase 6, Phase 6 slips to after Eid al-Fitr (estimate).

### 19.3 OFFERS NEAR SHOPS + PRICES + COMPARE

**THE HONEST TRANSLATION**

| Sam's idea | Free web app (iPhone + Android) | What it really takes |
|---|---|---|
| Walk past a shop → its offers appear | **Not possible.** A browser tab gets no background location and no Bluetooth scanning, and a Safari tab gets no push. Android's app-free beacon alerts (Nearby Notifications) ended on 6 Dec 2018 | A native app + beacons at participating shop doors: ~350 × ($12–25 + ~$100 install) ≈ **$39k–44k (≈ OMR 15–17k) at MoO**, plus store fees. About 50% of iOS users opt in to push, and background wake-ups are reported unreliable on iOS 26. Stage E, paid by the mall (estimates, UNVERIFIED) |
| "Near the shop" from GPS | No. Indoors, GPS is off by tens of metres and has no floor | Cannot be fixed with GPS |
| See offers and prices near you | **Yes**, where Dallni *knows* you are: the last scanned plate, your route, your destination, a shop you tap | Free |
| Compare | **Deals** by category: yes (Stage C+). Same-item **prices**: only for the same barcode, with both shops opted in (Stage D) | Tenant data; POS feeds are paid |

- **RULE:** offers and "near" labels come only from a **plate scan, a tap, the route or the destination**. Never from Geolocation, step counting or the estimated dot. Those drift, so the "nearby" offer would be for the wrong shop.

**MVP-SAFE VERSION: PULL, NOT PUSH**
- Offers are collapsed rows, and their content opens only when tapped. "Hide offers" sits on every offers sheet and in S18.
- **One-time opt-in.** The first offers sheet starts with one inline line, **"Show offers from shops? Yes / No"**, which is also in S18.
  - Before "Yes", only the neutral entry rows on S01 and S05 show. No step chips and no S13 offer card.
  - "No" hides every offer surface.
  - The choice is kept on the phone (IndexedDB). Nothing about the person is sent anywhere.

**ONE CAP TABLE** (replaces v1 §9 "Found it only" and the design draft's caps)

| Surface | What shows | Cap |
|---|---|---|
| S01 plate page (mall-floor plates only) | Row "Offers near this sign ›" → S26 | ≤3 |
| S05 route preview | Row "On your way: 2 offers ›" → S26 | ≤3 |
| S07 step card, eligible steps only | One muted, collapsed chip "2 offers near this step" | ≤1 per step, ≤2 per trip |
| S13 Arrived | One offer card below "Found it ✓" | 1 |
| S25 Explore (browsing, not a trip) | "%" DOM tags on visible shops | ≤8 visible |
| **Whole trip** | — | **≤6 offers, each at most once** ("seen this trip" is kept with the trip state in IndexedDB) |

- **No "%" tags on S07 at all**, step 0 included.
- **BLACKOUTS (no offers at all):**
  - parking levels and every car flow;
  - floor-change, lift and escalator steps;
  - the first and last step;
  - S09, S10, S19 and S20;
  - Camera Guide;
  - emergency mode.
- The chip never blocks Next and never replaces the primary button.
- After 90 s, "Near you" becomes "Near Gate 3 sign".
- **Labels:** "Offer · عرض". **No "Sponsored" items** until counsel answers (see the rules below).
- **Integrity:** landmarks in step text are never for sale. Paid content never changes routes, search order or label priority.
- **Tag style:** a #FFFFFF pill with a 2 px #0B0F14 border and dark text (Basement: #161B22 with #F5F7FA). "%" in English, "٪" in Arabic.

**WHERE OFFER DATA COMES FROM**

| Source | When | Notes |
|---|---|---|
| **Mall marketing enters offers in A15**, from tenant submissions by email or WhatsApp | **MVP** | 1–3 accounts, audited, fits Spark |
| Tenant self-service on a phone | Stage D | Admin-created email+password accounts that expire every 90 days unless the mall re-confirms the tenant |
| Retailer API or POS feed (electronics, perfume) | Stage E | Paid, deal by deal |
| MAF SHARE offers | Only through a negotiated MAF deal | No public API. **MoO shows no offers without that deal** |
| Scraping shop websites | **Never** | Legally grey (Cyber Crime Law RD 12/2011, scope UNVERIFIED); stale; published under Dallni's name |
| GS1 registry | Product identity only | Has no prices |

- **No OCR (Sam's rule):** prices are typed in, never read from photos of tags or receipts.
- **Sign-in honesty:** Firebase email-link sign-in is capped at **5 emails a day on Spark** (25,000 on Blaze). Use admin-created email+password accounts (Spark allows 150 password-reset emails a day) or Google sign-in. **No email links on Spark.**

**PRICE DISPLAY RULES**
- **Storage and display:** prices are stored as whole **baisa** and shown as OMR with exactly 3 decimals:
  - English: "OMR 12.500";
  - Arabic: «١٢٫٥٠٠ ر.ع.» or «12.500 ر.ع.», following the S18 digit setting.
- **Our own formatting function, unit-tested:** a fixed digit map, U+066B or ".", exactly 3 decimals, bidi isolates, then «ر.ع.». **Not** `Intl.NumberFormat`: CI's ICU differs from the iPhone's, so snapshot tests would not cover Safari.
- **A15 price fields** read **"Final shelf price incl. VAT (OMR)"**, before and after, plus a "prices include VAT" tick (VAT is 5% since Apr 2021).
- **% off = floor((before − after) ÷ before × 100).** It is computed, never typed and never rounded up, so 29.6% shows as 29%.
- **Discounts show:**
  - the before price, struck through **and** labelled "was / كان" so screen readers say it;
  - the after price;
  - the % off;
  - "Until Sat 12 Oct" (Asia/Muscat time).
- **Quantity:** "Limited quantity" or "N available at start". A live count shows only if the tenant updates it daily; the number auto-hides after 24 h.
- Arabic text is mandatory (CPA rule); English is optional.
- **Footer on every offer:** "Price set by [shop] on 6 Oct · The price on the shop's tag applies · Wrong price?"
- No currency conversion, and no "from" prices without a named item.

**OMAN RULES → WHAT A15 DOES**

| Rule (source; confidence) | A15 behaviour |
|---|---|
| Arabic price display; before and after price, % off and quantity (Consumer Protection Law RD 66/2014; Executive Regulations MD 77/2017, amended, 2025 consolidated edition; High/Med) | Required fields |
| Discounts: notify the CPA. Reported Jul 2024 limits: at most 30% off, at most 3 consecutive days a week, at most 3 times a month. The 2026 "Live the Vibe" campaign used different rules. **Which applies today is UNVERIFIED** | Requires the CPA notification date **or** a tenant attestation. Warns above 30%, above 3 consecutive days, and above 3 offers a month per tenant |
| Misleading ads: Article 20 makes the advertiser liable as well as the shop (reported 3 months–3 years and/or OMR 2,000–50,000; Med) | Only mall- or tenant-entered prices; dated; the shelf price applies; auto-expiry at endAt; audit log; a tenant indemnity in the tenant terms |
| Food ads need prior Food Safety and Quality Centre approval (enforced Aug 2026; Med) | Food offers are blocked without an approval reference |
| Marketing other people's goods online needs a MOCIIP licence (Resolution 619/2022; fine OMR 1,000; apps not named, UNVERIFIED) | 10 Digital gets the licence through Invest Easy before go-live |
| Media Law RD 58/2024 + its Executive Regulations (Sep 2025). Article 87 covers advertising in "electronic media websites and applications" (Med) | **No Sponsored slots** until counsel says whether a Ministry of Information licence is needed |
| Unfair competition: no misleading statements meant to draw away a competitor's customers (RD 38/2000 summary; current status UNVERIFIED) | No "cheapest" or "best" badges |

- **Before any offer goes live:** get written CPA guidance (CSDG@pacp.gov.om) on which rule set applies, and on whether a third-party publisher must check each shop's notification.

**PDPL: THE LAW CHANGED ON 3 SEP 2026**
- v1 §14 cites only RD 6/2022 + MD 34/2024. **Royal Decree 68/2026** (Gazette No. 1664, as reported by Baker McKenzie and CMS) amended it:
  - the territorial scope now covers processing of data about people in Oman, wherever it happens;
  - **explicit consent is needed before any commercial advertising or marketing**, in a form that a regulation still to come will set;
  - a new framework for automated processing and decision-making;
  - new exceptions to consent, and deletion once the purpose is fulfilled.
- **Until counsel has read the Gazette text:**
  1. offers stay pull-only, with nothing stored about the person;
  2. the one-time "Show offers from shops? Yes / No" opt-in applies, and it never blocks navigation;
  3. **no web push of any kind** until the implementing regulation sets the form of consent;
  4. "Nearest" and "Ends soonest" ordering is not personal automated decision-making, and it stays that way: no profiles and no history-based ranking, ever.
- §14 is rewritten against the Gazette text before any pilot DPA is signed. The counsel brief adds: the amended PDPL, the Media Law, the CPA rules and the scope of the MOCIIP licence.

**WRONG-PRICE REPORTS, TAKEDOWN, AUDIT**
- **Reports** go into a **create-only** `offerReports/{tripId_offerId}` collection: one per trip per offer, fixed fields, and a reason chosen by button. **There is no public update rule on `promotions`.**
- **Pause, not delete:**
  - the hourly runner aggregates the reports;
  - **3 reports from 3 different trips within 24 h → "Paused pending review"**: the offer is hidden and goes to the top of A16;
  - the pause is logged in auditLog as `system:ops-runner`;
  - mall marketing restores or fixes it with one tap. Offers are never deleted automatically.
- **Takedown:** `hiddenOfferIds[]` in `live/{venue}`.
  - S01 has no Firestore SDK, so it fetches `live/{venue}` through REST (one read, ≤10 KB), **only when the plate has offers**.
  - It then filters by hiddenOfferIds and endAt (Asia/Muscat time).
- **Reads:** approved offers ship in `promotions.json` per floor, at zero Firestore reads.
- **Offer record** at `venues/{id}/promotions/{offerId}`:
  - occupantId, title{ar,en};
  - beforeBaisa, afterBaisa (VAT-inclusive), pctOff (computed), qtyMode;
  - startAt, endAt;
  - cpaNotifiedAt or tenantAttest, vatAttest, foodApprovalRef;
  - status (draft / live / paused / expired), approvedBy;
  - updatedBy/At, also written to auditLog.

**COMPARISON SCOPE**
- **Honest: the same item in two mall shops is rare.**
  - Fashion brands sell their own labels. The same barcode turns up mainly in electronics, perfume and groceries.
  - Oman's CPA already monitors ~750k grocery prices from 21 Muscat outlets.
  - We found no mall that compares its own tenants' prices. Tenants shown as dearer would complain to the landlord (our inference).
- **S28 Compare deals (Stage C+):**
  - header "Perfume deals · Level 1 · 4 shops";
  - sort by Nearest (default) or Ends soonest;
  - opted-in tenants only;
  - footer "Shops choose to appear here."
- **Never** a "cheapest" or "best" badge, and never a ranking by price.
- **Same-barcode price comparison:** Stage D, only when both shops opt in, and only with the mall's written OK.

**HONEST VALUE:** the best studies show a modest lift. Sending coupons as push notifications raised redemption by 6.0%, and a coupon at the shop's own door can cannibalise sales that would have happened anyway. Sell measured numbers (offer views → GO taps, with counts under 10 hidden), never vendor percentages.

**STAGE PLACEMENT**

| When | Offers scope |
|---|---|
| MVP (Phases 1–5) | v1 scope only: one offer at "Found it" (Pro) |
| **Phase 7: OFFERS** (after Phase 5; ~2–3 dev-weeks, estimate) | S26, S27, the S01/S05/S07 entries, the opt-in, A15 (mall marketing), A16, D09, offerReports |
| Go-live on the pilot (Stage C) | Only after: written CPA guidance; counsel's answer on PDPL RD 68/2026 and the Media Law; the MOCIIP licence; mall marketing trained |
| Stage C+ | S28 Compare deals. Web push "Remind me when this offer starts" for Home Screen users, **only after** the PDPL consent regulation |
| Stage D | Tenant self-service; same-barcode comparison |
| Stage E | Native app + beacons for walk-past offers, paid by the mall. Marketing push only after an in-app opt-in (Apple 4.5.4 + PDPL) |
| Mall of Oman | No offers without a MAF deal. Pitch "Open offer in SHARE" deep links |

- **Phase 7 acceptance:**
  - A15 blocks missing Arabic, a missing CPA date or attestation, and food offers without an approval reference;
  - % off is floored;
  - the OMR formatter passes its unit tests in both digit styles;
  - the offerReports rule tests pass (create-only, one per trip per offer);
  - a 3-report pause writes an audit entry;
  - caps and blackouts are tested;
  - no offer content shows before "Yes".
  - **STOP: wait for APPROVED.**

### 19.4 HONESTY BOX ADDITIONS

Same columns as §0.

| Feature | Free? | iPhone web | Android web | Needs native / hardware / paid | Verdict |
|---|---|---|---|---|---|
| Game-like 3D view (stylised; real shop names as text) | Yes (open-source, MIT) | Yes (WebGL2). iOS may kill the tab on 2–3 GB iPhones; the crash-loop guard falls back to SVG | Yes (budget phones drop to Tier B or SVG) | No. But a first 3D visit is ~0.7–2.2 MB, so real traffic needs Blaze or Cloudflare | Demo Mall showcase (Phase 6); opt-in "Try 3D" on the pilot after Eid, only if device tests pass |
| 3D as the only map | — | Risky (memory kills, sunlight glare) | Risky on budget phones | — | **Never.** SVG 2D + step cards are always available |
| Real brand colours + logos on shop fronts | Software yes | Yes | Yes | **A written licence** from the mall or the tenant | Only with a licence; otherwise the name in text on the category colour |
| Photo-real 3D, first-person walking, walking avatar | No (too heavy) | No (memory; an avatar would fake tracking) | No | Native or game engine + live positioning | Not planned |
| Offers appearing as you walk past a shop | **No** | **No** (no background location, Bluetooth or push in a tab) | **No** (Nearby Notifications ended in 2018) | Native app + beacons at ~350 doors ≈ $39k–44k at MoO, incl. ~$100 install per beacon, + store fees. ~50% iOS push opt-in; background wake-ups unreliable on iOS 26 (estimates) | Stage E, mall pays |
| Offers near the last scanned sign, on the route, at arrival | Yes | Yes | Yes | No | Phase 7. Live only after the CPA and counsel answers; pull-only and opt-in |
| "Remind me when this offer starts" push | Yes | Home Screen web app only (iOS 16.4+) | Yes | — | Not before the PDPL consent regulation (RD 68/2026) |
| Prices on offers | Yes | Yes | Yes | Entered by the mall or tenant; **no scraping, no OCR** | Phase 7: VAT-inclusive, dated, shelf price applies |
| Compare deals by category | Yes | Yes | Yes | Tenant opt-in | Stage C+ |
| Same-item price comparison across shops | Yes (software) | Yes | Yes | Same barcode + both shops opt in; POS feeds are paid | Stage D. Never "cheapest" |
| Offers at Mall of Oman | — | — | — | A MAF deal (SHARE owns offers; no public API) | Not without MAF |
| Sponsored offers / pins | Yes (technically) | — | — | Legal question: Media Law licence (RD 58/2024), CPA rules | On hold until counsel answers |
| Tenant sign-in by email link | **No** on Spark (5 emails a day) | — | — | Blaze (25,000 a day) | Use admin-created email+password or Google sign-in |
| Full-mall live dot via beacons at MoO (**corrects §4**) | No | No | Behind a flag | ~1,450 × ($12–25 + ~$100 install) ≈ $162k–181k, plus batteries (estimate) | Stage E, mall pays |

- **Correction to §4:** the beacon row counted hardware only. Kontakt.io (an old vendor figure) says installation, about $100 per beacon, is the largest cost.

### 19.5 NEW / CHANGED SCREENS + STITCH PROMPTS

**S07 TRIMMED** (one task per screen; the same in SVG and 3D)
- **On screen:** the step card, **Next** (primary), floor pills for the current and next floor, Recentre, and one 56 px **More** button. That is all.
- **More sheet:** zoom + / −, Map view (Simple 2D / 3D), I'm lost, This step was wrong, and ع / EN.
  - This replaces S07's header language toggle from §8.
  - Every gesture keeps a single-tap alternative here (WCAG 2.5.1 and 2.5.7).
- The offer chip appears only on eligible steps, collapsed.

| ID | Screen | Change / purpose | Primary action | Phase |
|---|---|---|---|---|
| S01 | Plate landing | Adds a collapsed "Offers near this sign ›" row (mall-floor plates only). REST read only when the plate has offers. Still ≤60 KB | Unchanged | 7 |
| S05 | Place | Adds a static storefront thumbnail (WebP ≤20 KB) and an "On your way: N offers ›" row. **No 3D before GO**; the engine loads in the background after GO | GO | 6 / 7 |
| S07 | Navigate | Step view (3D, opt-in) or SVG; trimmed controls; offer chip | Next | 6 |
| S08 | Step list | The accessible content in every mode; live-region announcements | Next | — |
| S09 | Floor check | Stacked two-floor view (3D) or a two-floor SVG diagram | Yes | 6 |
| S13 | Arrived | The sign lights up; one offer card | Found it ✓ | 6 / 7 |
| S14 | My Car | 3D parking: amber car, zone bands, no offers | Take me there | 6 |
| S18 | Settings | Adds Map view (Simple 2D / 3D) and Show offers (Yes / No) | — | 6 / 7 |
| **S25** | Explore 3D | Browse the floors; tap a shop (44 px hit radius; if ambiguous, a list sheet with 56 px rows); "%" tags | Tap a shop | 6 |
| **S26** | Offers near [Gate 3 sign / this step] | Up to 3 offers; the first-time opt-in line; Hide offers | Tap an offer | 7 |
| **S27** | Offer detail | Prices incl. VAT, dates, quantity wording, Wrong price? | GO to shop | 7 |
| **S28** | Compare deals | Stage C+ | Tap a row | Later |
| **S29** | Embed `/embed?venue=&to=` | Map + route inside a partner app (e.g. a SHARE WebView); postMessage API | Host-driven | Stage D |
| A07 | Check & publish | Also blocks on: floor chunk over budget, over 150 draw calls, sign under 4.5:1, sign text outside the font subset | Publish v{n} | 6 |
| **A14** | Sign & facade editor | Sign text in Arabic and English, colours with a live contrast check, logo + licence {source, grantedBy, date} | Save | 6 |
| **A15** | Offer editor (mall marketing; tenants from Stage D) | The compliance fields and warnings in §19.3 | Publish | 7 |
| **A16** | Offer review queue | Offers paused by reports, expiring offers, and (from Stage D) tenant submissions. Preview exactly as shoppers see it | Approve / Restore | 7 |
| **D09** | Offers report | Views, GO taps, wrong-price reports (counts under 10 hidden) | Export CSV | 7 |

- **Copy fix:** Carrefour left Oman on 7 Jan 2025 and is now HyperMax. Replace "Turn left after Carrefour" with "Turn left after the fountain" in §3(b) step 5 and in §9 Stitch prompt 6.
- **Naming fix:** "Follow" mode is now "Step view". S26 is titled "Offers near [Gate 3 sign / this step]", never "Offers nearby".

**STITCH PROMPTS (add after prompt 12).** Stitch draws flat mockups, so treat the 3D area only as a guide to layout. Generate each in English, then ask for the Arabic RTL version.

13. "Navigation, Step view 3D: top 60% stylised isometric low-poly mall, white/grey blocks with thin dark wall-top strips #5B6573, coloured sign boxes with white bilingual shop names, thick #0B57D0 route ribbon with white casing and static white chevrons, blue puck labelled 'Gate 3 sign · now'. At the edge where reading ends: two 56px floor pills 'G' and 'L1'. Opposite edge: 56px 'Recentre' and 56px 'More'. Bottom card: 'Turn right after the fountain · 40 m · Step 2 of 6', full-width 'Next', one small muted chip '2 offers near this step'. No other buttons."
14. "Floor change: two stacked translucent floor slabs 'Ground' and 'Level 1', glowing blue light column at 'Escalator E2', card 'Take E2 up to Level 1', full-width button 'I'm on Level 1', secondary 'Another floor'. No offers."
15. "Route overview: 3/4 view of the whole route from the parking lift lobby to a shop sign glowing green, card 'Cinema · Level 1 · about 6 min · step-free', collapsed row 'On your way: 2 offers ›', full-width 'Start'."
16. "Dark parking 3D: background #0B0F14, thin bay lines, pillars with a blue band and falcon icon, bay codes 'B2-14', amber car marker with dark outline, route #7AB0FF, card 'Blue · Falcon · B2-14 · 2 min', full-width 'Take me there'. No offers."
17. "Bottom sheet 'Offers near Gate 3 sign': first line 'Show offers from shops?' with 'Yes' / 'No'; then 3 rows, each with category chip, shop name, 'Was OMR 18.000 → OMR 12.600 incl. VAT · 30% off · until Sat 12 Oct' and a white '% Offer' tag with a dark border; footer 'Prices set by each shop · shelf price applies · Hide offers'."
18. "Offer detail: category-colour sign strip, headline, large 'OMR 12.600', struck-through 'was OMR 18.000', '30% off', 'Limited quantity', 'Price set by shop on 6 Oct · the price on the shop tag applies', link 'Wrong price?', full-width 'GO to shop'."
19. "Compare deals: title 'Perfume deals · Level 1 · 4 shops', segmented control 'Nearest / Ends soonest', 4 equal rows (category chip, shop, deal, price, '2 min walk', end date), footer 'Shops choose to appear here'. No 'cheapest' or 'best' badge, no sponsored row."
20. "Arrived 3D: storefront close-up with a lit sign, green ring on the floor, card 'You've arrived · Level 1', full-width 'Found it ✓', one small 'Offer' card below."
21. "Bottom sheet 'More' over a 3D mall map: 56px rows 'Zoom in', 'Zoom out', 'Map view: Simple 2D / 3D', 'I'm lost', 'This step was wrong', 'ع / EN'."
22. "Explore 3D: low-poly mall floor, a tap opens a bottom sheet 'Which shop?' listing 3 nearby shops as 56px rows with category chip and floor; two shop signs carry white 44px '%' tags."

### 19.6 DECISIONS REGISTER UPDATES

Add these rows to §15.1. Only Q1 (the mall) is answered; everything else is still PROPOSED.

| Decision | Proposed value | Status |
|---|---|---|
| Mall #1 (Sam's choice) | Mall of Oman | **ANSWERED (Q1, 2026-10-08)** |
| Role of Mall of Oman | Option A: showcase + long-term target; paid pilot at Muscat Grand Mall; v1 dates hold | PROPOSED (Q1c) |
| MoO material | Nothing from mallofoman.net; the MoO zone only after the GM's written permission; plain-text SHARE mock | PROPOSED |
| Shopper map engines | SVG 2D = the pilot's production map; plain three.js r186 + troika 0.52.5 = opt-in 3D; MapLibre removed. Replaces v1's "MapLibre, no three.js" | PROPOSED |
| R3F / React | No R3F. React stays 18.3.1; React 19 check in Stage D | PROPOSED (new question) |
| Renderer | One WebGL renderer singleton outside React; crash-loop guard; a 3 GB iPhone in the device set | PROPOSED |
| 3D on the pilot | Opt-in "Try 3D" after Eid al-Fitr, only if device tests pass; never blocks the step card | PROPOSED |
| 3D build | Phase 1 spike (3–5 days); Phase 6, 6–10 dev-weeks (estimate); off the LOI critical path | PROPOSED |
| Logos **and brand sign colours** (extends the v1 "Logos" row) | Only with a written licence from the mall or tenant, logged in `logoLicence`; otherwise the name on the category colour | PROPOSED |
| Offer trigger | Plate scan, tap, route or destination only; never Geolocation, PDR or the estimated dot | PROPOSED |
| Offer consent | Pull-only, plus a one-time "Show offers from shops? Yes / No"; no web push until the PDPL consent regulation | PROPOSED |
| Who enters offers | Mall marketing only in the MVP (1–3 accounts); tenant self-service in Stage D | PROPOSED |
| Admin and tenant sign-in | Admin-created email+password, or Google sign-in; no email links on Spark | PROPOSED |
| Sponsored offers and pins | On hold until counsel answers on the Media Law and CPA rules | PROPOSED |
| Comparison | Deals by category (Stage C+); same-barcode prices only with both shops opted in (Stage D); never "cheapest" | PROPOSED |
| Wrong-price reports | Create-only offerReports; 3 trips → paused pending review; mall marketing decides | PROPOSED |
| Partner path | `/embed?venue=&to=` + postMessage contract from day 1 (SHARE WebView, mall websites) | PROPOSED |
| Pilot hosting | Q2 asked again with the 3D numbers; default B unchanged; A if 3D becomes the default view | PROPOSED (Q2) |
| Map Studio scope (changes the v1 row) | A01, A02, A04–A13 in the MVP; A14 in Phase 6; A15 and A16 in Phase 7; A03 after mall #2 | PROPOSED |
| Build phases (naming rule) | PHASE 1–7 (6 = 3D view, 7 = Offers). Stage letters unchanged | PROPOSED |
| Legal | Omani counsel brief: trademarks, amended PDPL (RD 68/2026), Media Law, CPA, MOCIIP. §14 rewritten before any DPA | PROPOSED |
| Contacts at malls (Q1d) | Sam knows nobody at Muscat Grand Mall, Mall of Muscat or any mall: the pilot needs a cold introduction | **ANSWERED (Q1d, 2026-10-10)** |
| 3D art direction (overrides §19.2 "unlit architect's model, no realtime shadows" for the default look) | v0.3 "toy world": lit pastel blocks, bevels, a sun with soft shadows (Showcase quality only, never in the stacked Overview), white chunky game UI. Meaning colours (route, markers, sign faces, zone bands) stay unlit and exact. Storm (v0.2) and classic (v0.1) stay available | **ANSWERED (Sam picked "Bright Toy Game" from live mocks, 2026-10-10; built 2026-10-11)** |
| 3D quality levels | Showcase (shadows, pixel ratio 2) vs Light (no shadows, 1.5), picked per device, `?quality=` override, auto-drop after 8 slow frames. Prototype `scene3d` budget 52 → 60 KiB (reported) | BUILT in the prototype (v0.3) |
| 3D realism (v0.4, overrides the toy default; toy stays as the Light look) | "Real mall": CC0 photo textures (Poly Haven) mapped per surface, real indoor HDRI reflections, furnished shops, soft bloom (Showcase only), about 1.5 MB of same-origin assets | **ANSWERED (Sam picked "photo-real materials" from live mocks, 2026-10-11); BUILT** |
| Sign fascias (changes "name on its category colour" for the real look) | Neutral dark fascia, plain-text backlit letters (AR + EN), a thin exact category-colour accent line; still no brand colours or logos without a written licence | PROPOSED (v0.4 default) |
| Tone mapping | Khronos PBR Neutral in the post chain: colours under ~0.76 pass unchanged, so meaning colours (route, markers, accents) keep their hues | BUILT (v0.4) |
| First screen (v0.5) | "Find me": scan the sign or pick the entrance / car-park lift; a plate link skips it; no GPS button | BUILT (prototype v0.5, Sam: "first will show locate my location") |
| Home layout (v0.5) | Sam's Stitch "bento" mock: Map / Offers tabs, Where to next? cards, pinned Start walking bar; SVG icons, self-hosted fonts, real open/closed chip, demo stamp quest instead of points | BUILT (Sam sent the mock, 2026-10-11) |
| Offers in the demo | Offers page + offer card on the place screen; pull only, nearest first from the scanned / picked position; fictional shops and four fictional "global" brands | BUILT (prototype); real offers stay PROPOSED (see rows above) |
| Ramadan / Eid hours | Mall weekly hours + dated specials (expected dates), shop overrides, a preview switch | BUILT (prototype v0.5) |
| Emergency mode | Ops switch → directions stop, exits shown, no lifts; prototype: same-browser BroadcastChannel; product: `live/{venueId}` emergency field | BUILT (prototype); backend PROPOSED |
| Kiosk mode (S21) | `?kiosk=<plate>`: fixed position, attract screen, 60 s idle reset, Continue-on-your-phone QR | BUILT (prototype v0.5) |
| Mall dashboard (D01–D08 subset) | KPIs, journeys, top / not-found searches (CSV), heatmap (<10 hidden), sign health, offers, ops controls, print report; synthetic demo data | BUILT (prototype v0.5); real analytics PROPOSED |

**TIMELINE DELTA (§15.2, Option A)**

| Stage | v1.1 change |
|---|---|
| **A Validate** (8 Oct – 15 Dec 2026) | Adds: the 3D spike in Phase 1; Sam's shopper visit to MoO (parking signage notes); install the City Centres and SHARE apps; the counsel brief; the CPA email; a 3 GB iPhone in the device set; the search for a warm MoO intro |
| MVP build, Phases 1–5 (Nov – mid-Jan) | The SVG renderer becomes the production map (~+1 dev-week, estimate). MapLibre is removed. Phase 1 adds the 3D spike |
| **Phase 6: 3D VIEW** (from mid-Jan 2027) | 6–10 dev-weeks (estimate). Showcase-ready about mid-to-late Feb if it starts mid-Jan with free hands |
| **Phase 7: OFFERS** | 2–3 dev-weeks (estimate). Go-live gated on the legal answers |
| **B Pilot setup** (15 Dec – 31 Jan) | Unchanged: MGM |
| **C Prove** (Feb – Mar 2027) | Unchanged. "Try 3D" and offers only after Eid al-Fitr, and only once their gates pass |
| **MoO track** | Q1 2027 first approach (warm intro) → written permission → MoO zone (~80–160 h) → MAF pitch with the MGM Proof Report (~Q2 2027, estimate) |
| **D Scale** (Q2 2027+) | Adds: tenant self-service, same-barcode comparison, embed mode for partners, the React 19 check, full 3D for mall #2 onwards |
| **Option B instead** | LOI no earlier than Q2 2027; mapping 600–1,200+ h; proof window Eid al-Adha 2027 at best, realistically Ramadan 2028 |

### 19.7 BUDGET / PRICING IMPACT

**HOSTING (Q2, asked again with the 3D numbers)**

| Option | Cost | Notes |
|---|---|---|
| A. Cloudflare Workers Static Assets | $0 | Static requests are free and unlimited (20k files per version, 25 MiB per file). Keep `/p` routing as a static single-page-app fallback with **no Worker script**, because the 100k/day limit counts only requests that run code. It is a platform outside Sam's stack |
| B. Firebase Hosting on Blaze | $0.15/GB after 10 GB. E.g. 2,000 new 3D users a day × 1.6 MB ≈ 96 GB a month ≈ **$13/month (≈ OMR 5)** (estimate) | Sam's stack. **Default unchanged** |
| C. Spark only | $0 | 360 MB/day covers only ~160–510 first-time 3D users a day. Demo only |

- The same Vite build deploys to A and B. Switch to A if 3D becomes the default view, or once traffic passes about 2,000 new users a day.
- **The 2D pilot gets lighter:** with MapLibre gone (~428 KB), the first 2D visit should drop below v1's 0.5–0.8 MB, so the §11 Hosting range improves. Re-measure in Stage A (UNVERIFIED).

**FIRESTORE / AUTH**
- **Reads:** up to +1 REST read per S01 view that has offers. Reads per session go from ≈3.6 to ≈4.6 in the worst case, so Spark's free reads cover ~9,800 sessions a day instead of ~12k (estimate).
- **Writes:** offerReports writes are tiny. Offers in `promotions.json` cost 0 reads.
- **Auth:** no email links on Spark (5 a day).

**BUILD COST** (OMR 8/h placeholder × 40 h per dev-week; replace after Q7)

| Item | Dev-weeks (estimate) | OMR (estimate) |
|---|---|---|
| SVG renderer as the production map | ~1 | ~320 |
| Phase 6: 3D view | 6–10 | 1,920–3,200 |
| Phase 7: Offers | 2–3 | 640–960 |
| **Added in v1.1** | **9–14** | **~2,900–4,500** |
| MVP build (v1 §12: ~4,000) | — | **~6,900–8,500** |

- **Effect on v1 §12 "net at month 12"** (estimates; payback moves past month 15):

  | Malls | v1 | v1.1 |
  |---|---|---|
  | 1 | ~−4,640 | ~−7,500 to −9,100 |
  | 3 | ~−1,140 | ~−4,000 to −5,600 |
  | 6 | ~+460 | ~−2,400 to −4,000 |

- **Honest:** 3D and offers do not pay for themselves unless they raise the price, win a deal or open the MAF door.

**PRICING PROPOSALS (OMR, estimates)**

| Line | v1 | v1.1 |
|---|---|---|
| 3D storefront pack (one-time, new) | — | **800–2,000 per mall**, by unit count: sign text in Arabic and English, facade openings, colours, hero props. Logo atlases only with licences |
| Essential (180/month) | 2D | SVG 2D; 3D as an add-on (~60/month, estimate) once the pack is bought |
| Pro (390/month) | Offers = one at "Found it" | Adds pull-only offers (§19.3), the D09 Offers report and the 3D view |
| Sponsored pins (25–75 per tenant per month) | Once usage is proven | **On hold** until counsel answers |
| Embed / API (1,000–3,000 one-time) | Map in the mall's own site or app | Adds the `/embed` mode for partner apps (e.g. a SHARE WebView) |
| Setup & mapping (1,200–2,500) | Sized for MGM | **Cannot cover MoO:** 600–1,200+ h × OMR 8 ≈ OMR 4,800–9,600+ at cost alone. Quote MoO separately |
| Walk-past offers (native app + beacons) | — | ≈ $39k–44k (≈ OMR 15–17k) for ~350 doors at MoO, plus the app and store fees. Stage E, mall pays |
| Full-mall live dot via beacons (MoO) | §4: $17k–36k | ≈ $162k–181k incl. installation (estimate) |

- **Other costs:**
  - the Omani counsel brief (amount UNVERIFIED; get a quote);
  - the MOCIIP licence (no fee in 2023; current fee UNVERIFIED);
  - one used 3 GB test iPhone (price UNVERIFIED).
- **Buy instead of build:** Mappedin Pro at ~$165 per map per month (≈ OMR 63). Faster, but the code is not Sam's.

### 19.8 SOURCES

**Mall of Oman & MAF**
- https://www.majidalfuttaim.com/en/media-centre/press-releases/detail/2023/02/majid-al-futtaim-officially-inaugruates-mall-of-oman
- https://www.majidalfuttaim.com/en/media-centre/press-releases/detail/2023/02/majid-al-futtaim-entertainment-inaugurates-snow-oman
- https://getoccupi.com/malls/mall-of-oman
- https://www.retail-insight-network.com/projects/mall-of-oman/
- https://meconstructionnews.com/36189/mall-of-oman-on-track-for-2021-opening-as-major-infrastructure-works-complete/amp
- https://experienceoman.om/destinations/muscat/mall-of-oman
- https://www.tripadvisor.com/Attraction_Review-g1940497-d23634022-Reviews-Mall_of_Oman-Muscat_Muscat_Governorate.html
- https://www.mallofoman.net/ar/stores/valet-lounge-and-parking
- https://www.mallofoman.net/en/stores
- https://www.muscatdaily.com/2025/01/08/majid-al-futtaim-transitions-from-carrefour-to-hypermax-in-oman/
- https://www.khaleejtimes.com/business/majid-al-futtaim-reports-record-fy2025-results-with-41-net-profit-growth?amp=1
- https://play.google.com/store/apps/details?id=com.belongi.citycenter
- https://gulfnews.com/uae/cant-remember-where-you-parked-your-car-1.1540288
- https://designa.com/mall-of-the-emirates-ticketless-parking-solution
- https://www.khaleejtimes.com/uae/transport/dubai-barrierless-parking-at-mall-of-the-emirates-begins-today-all-you-need-to-know?amp=1
- https://www.dubaifuture.ae/latest-news/majid-al-futtaim-dff-launch-people-first-retail-robotics-pilot/
- https://store.hbr.org/product/majid-al-futtaim-adapting-the-shopping-mall-to-the-digital-era/623051
- https://www.muscatdaily.com/2026/09/24/majid-al-futtaim-launches-share-in-oman-bringing-more-rewarding-everyday-experiences-to-customers/
- https://omanmagazine.com/2026/09/majid-al-futtaim-launches-share-in-oman-bringing-more-rewarding-everyday-experiences-to-customers-across-the-sultanate/
- https://gulfbusiness.com/en/2025/interviews/khalifabinbraik-on-legacy-of-city-centre-deira/
- https://www.fintechfutures.com/press-releases/i2c-expands-partnership-with-majid-al-futtaim-to-launch-sharepay-card-and-mobile-wallet
- https://martechvibe.com/article/majid-al-futtaim-launches-precision-media
- https://insight.astrolabs.com/majid-al-futtaim-announces-winners-of-the-second-edition-of-its-launchpad-accelerator-programme
- https://www.alfuttaim.com/en/suppliers/
- https://blog.mapspeople.com/the-roi-of-indoor-mapping
- https://www.parking.net/parking-news/park-assist/muscat-grand-mall-parking-guidance-system

**3D engine, performance, Arabic text**
- https://r3f.docs.pmnd.rs/getting-started/installation
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://registry.npmjs.org/@react-three/fiber
- https://registry.npmjs.org/@react-three/drei
- https://registry.npmjs.org/three
- https://registry.npmjs.org/maplibre-gl
- https://registry.npmjs.org/react
- https://registry.npmjs.org/troika-three-text
- https://registry.npmjs.org/@fontsource/readex-pro
- https://github.com/protectwise/troika/tree/main/packages/troika-three-text
- https://maplibre.org/maplibre-gl-js/docs/examples/extrude-polygons-for-3d-indoor-mapping/
- https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/
- https://threejs.org/docs/#examples/en/controls/MapControls
- https://threejs.org/docs/#api/en/materials/LineBasicMaterial
- https://threejs.org/docs/#api/en/renderers/WebGLRenderer.compile
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/lineWidth
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- https://developer.chrome.com/blog/new-in-webgpu-121
- https://developer.chrome.com/blog/new-in-webgpu-122
- https://forum.babylonjs.com/t/babylon-bundle-size/48068
- https://blog.playcanvas.com/playcanvas-versus-unity-webgl
- https://bugs.webkit.org/show_bug.cgi?id=215745
- https://bugs.webkit.org/show_bug.cgi?id=300782
- https://bugs.webkit.org/show_bug.cgi?id=290623
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory
- https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData
- https://capacitorjs.com/docs/apis/screen-reader
- https://www.khronos.org/ktx/
- https://web.dev/articles/optimize-lcp
- https://www.frontiersin.org/journals/virtual-reality/articles/10.3389/frvir.2025.1622522/full
- https://link.springer.com/doi/10.1007/s00779-008-0209-0
- https://dl.acm.org/doi/10.1145/2534931.2534941

**Competitors & buy options**
- https://www.mappedin.com/pricing/?tab=platform
- https://docs.mappedin.com/web/v6/latest/classes/Models.html
- https://www.mappedin.com/resources/news/mappedin-and-cenomi-centers-partner-to-deliver-interactive-venue-experience-across-malls-in-saudi-arabia/
- https://www.g2.com/products/pointr-maps/pricing
- https://www.22miles.com/pricing/
- https://3dwayfinder.com/?p=6031
- https://visioglobe.com/post/visioglobe-and-the-advergy-collaboration-an-innovative-digital-experience-for-al-araimi-boulevard-mall-oman
- https://blackandwhiteoman.com/oman-avenues-mall-launches-mobile-app-and-digital-loyalty-program/

**Accessibility**
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html
- https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/

**Proximity, push, beacons**
- https://webkit.org/?p=16535
- https://heise.de/-10749652
- https://9to5google.com/2018/10/25/google-killing-location-notifications/
- https://developer.apple.com/forums/thread/731294
- https://developer.apple.com/forums/thread/806783
- https://developer.apple.com/forums/thread/838021
- https://developer.android.com/training/location/geofencing
- https://support.google.com/googleplay/android-developer/answer/9857753
- https://www.macobserver.com/news/20200304-app-store-guidelines/
- https://www.pushwoosh.com/blog/push-notification-benchmarks/
- https://kontakt.io/?p=8205
- https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy

**Offers, prices, comparison, evidence**
- https://arabianreseller.com/2024/09/02/majid-al-futtaim-and-tabby-launch-sharepay-integration-for-seamless-shopping-experience/
- https://developers.alfuttaim.com
- https://www.gs1au.org/resources/faq/verified-by-gs1
- https://apps.apple.com/app/id804021137
- https://ae.pricena.com/ar/vendors
- https://wamda.com/2015/10/yaoota-raises-2-7m-from-uae-
- https://www.lexis.ae/2023/03/30/oman-consumer-protection-launches-prices-monitoring-platform
- https://www.khaleejtimes.com/uae/save-uae-grocery-bill-new-tool-rice-eggs-cost-less
- https://ideas.repec.org/a/inm/ormnsc/v65y2019i11p5027-5049.html
- https://pubsonline.informs.org/doi/abs/10.1287/isre.2021.0206
- https://www.ama.org/2015/12/12/an-unprecedented-era-of-mobile-marketing/
- https://www.retailcustomerexperience.com/news/swirl-releases-results-of-retail-beacon-marketing-campaigns/
- https://mn.gov/tourism-industry/assets/FY26-coop-mallofamerica_tcm1135-700185.pdf

**Oman law: trademarks, consumer protection, media, cyber**
- https://www.wipo.int/wipolex/en/legislation/details/11876
- https://www.jetro.go.jp/ext_images/_Ipnews/middle_east/ME_IP_Newsletter_202506-97_en.pdf
- https://turtl.tamimi.com/story/doing-business-in-oman/page/7
- https://www.thehabitatgroup.com/articles/5450
- https://alp.unescwa.org/legislations/executive-regulation-no77-2017-consumer-protection
- https://timesofoman.com/article/173264-how-omans-consumer-protection-law-regulates-price-display
- https://www.lexis.ae/2019/11/29/oman-discounting-rules-stressed/
- https://timesofoman.com/article/147364-no-permission-required-to-run-offers-and-promotions-in-oman
- https://www.muscatdaily.com/2026/07/19/retailers-invited-to-join-live-the-vibe-campaign-with-30-discounts/
- https://timesofoman.com/article/165608-omans-consumer-protection-law-strict-penalties-for-misleading-advertising
- https://www.omanobserver.om/article/24207/Main/company-penalized-in-oman-for-fake-discounts
- https://imagesretailme.com/oman-vat-what-retailers-need-to-know-before-its-implementation
- https://aviaanaccounting.com/what-is-the-vat-impact-on-retail-sector-in-oman/
- https://omanlawblog.curtis.com/2008/06/oman-law-digest-2008-monopolies.html
- https://timesofoman.com/article/128318-regulation-of-marketing-promotion-on-websites-to-be-implemented-in-oman
- https://www.thearabianstories.com/2026/08/04/oman-food-safety-authority-summons-companies-influencers-over-unauthorised-food-advertisements/
- https://tamimi.com/news/omans-new-media-law-2024
- https://timesofoman.com/article/162727-information-ministry-issues-executive-regulation-of-media-law
- https://omanlawblog.curtis.com/2011/04/oman-cybercrime-law.html

**PDPL (amended)**
- https://www.bakermckenzie.com/en/insight/publications/2026/09/oman-strengthening-its-data-protection-regime
- https://cms.law/en/omn/legal-updates/oman-updates-its-personal-data-protection-law
- https://www.pwc.com/m1/en/blogs/pdf/Oman-PDPL-series-Part2-Executive-Regulations.pdf

**Platform & free tier**
- https://firebase.google.com/pricing
- https://firebase.google.com/docs/auth/limits
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

---

**SAM, NEXT QUESTION (Q1c):** Mall of Oman's role: **Option A** (showcase + long-term target; Muscat Grand Mall = paid pilot; 15 Dec LOI and Ramadan 2027 proof hold) or **Option B** (Mall of Oman = paid pilot; LOI Q2 2027 at best, 600–1,200+ h mapping, proof realistically Ramadan 2028)? *Default: A.*
