# OFM Logistics Arcade

Four browser games built from Oman Flour Mills' real Feed Mills operation, served
as part of the site at `/games/`. Each game is a single self-contained HTML file —
no build step, no framework, no login.

| File | Game | Teaches |
|---|---|---|
| `index.html` | Arcade hub | — |
| `game1.html` | Loading Line Rush | Dispatching, queue order, loading lines |
| `game2.html` | Weighbridge Master | Gross/tare/net, quality gate, truck classes, no-overtaking traffic, documents |
| `game3.html` | Forklift Warehouse | **FIFO stock discipline, product codes, HSE, the document chain** |
| `game4.html` | Fleet Management | Whole-site sequencing against one weighbridge |

## Running it

Open `index.html`. It works three ways:

- **Deployed** — `firebase deploy --only hosting` from the project root, then
  `https://digital-e54f2.web.app/games/`.
- **Local web server** — full quality: PBR textures and the HDR environment load.
- **`file://`, straight off a USB stick** — the games detect `file:` and skip asset
  loading (browsers block local images for WebGL), falling back to the procedural
  look. Everything still plays; it just isn't textured.

There is **no internet dependency**. `three.js` r128 and `RGBELoader` are vendored
in `vendor/`, so the games run on a mill phone with no signal.

## Layout

```
games/
├─ index.html          arcade hub
├─ game1..4.html       one self-contained game each
├─ vendor/
│  ├─ three.min.js     three.js r128 (npm three@0.128.0, build/three.min.js)
│  └─ RGBELoader.js    three@0.128.0 examples/js/loaders/RGBELoader.js
└─ assets/
   ├─ hdri/sky.hdr     1024x512 RLE RGBE environment
   └─ tex/             concrete · asphalt · steel · pallet · bag (1024px PBR)
```

Total asset weight is **~3.3 MB**, inside the PRD's ≤6 MB level budget and its
"cold load ≤ 4 s on 4G" target. The source textures were 2048px and the HDR was
2048x1024 (28 MB together); they were downscaled once and committed at the smaller
size. Re-run the downscale from the original PolyHaven sources if you ever need to
change resolution — do not upscale these.

## Game 3 — Forklift Warehouse

The warehouse chapter of the PRD (Ch4) plus the yard's document chain (Ch5.6),
built around one idea: **the convenient pallet is the wrong pallet.**

- **FIFO.** Every pallet shows a product code and a batch age. New stock is racked
  near the aisle mouth, old stock deep in — so the closest pallet is usually the
  newest one. Taking it when an older batch of the same code is still racked is a
  FIFO breach: teaching card, −25 OMR, and the old batch ages one day closer to
  a write-off.
- **Write-offs.** Stock past its shelf life is written off at full value. Only
  codes that have appeared on your SO board count against your ledger — you cannot
  dispatch what nobody ordered.
- **Product codes.** The 16 core Bühler codes. 716 is not 715; a wrong code at the
  dock is a rejected load (−45 OMR) and the truck comes back at your cost.
- **Safety (absolute).** Driving above walking pace with the forks raised is an
  unsafe act after 3.5 s. Striking a pedestrian on the marked walkway ends the
  shift instantly — no partial credit. Sound the horn and they wait.
- **Hazards.** Spills appear in the aisles. Drive through one at speed and you skid
  and drop the load; stop and clear it for a bonus.
- **Documents.** The truck leaves on **DN → GATE PASS**, in that order. A gate pass
  without a delivery note is blocked and explained. Demurrage runs while a loaded
  truck waits on paperwork.
- **Shift report.** Orders dispatched, pallets moved (and bags), FIFO accuracy,
  breaches, write-offs, demurrage, strikes, safety.

Controls: `WASD`/arrows drive · `SPACE` pick and drop · `Q`/`E` forks · `H` horn ·
`R` reset. On a phone: left stick, right action button, fork buttons, horn.

## Data fidelity

Per the PRD's anti-hallucination rule, the game does not invent world data:

- **Product codes** are the 16 locked core Bühler codes.
- **Customers** are the confirmed dispatch destinations (Mazoon Dairy, Sohar
  Poultry, Punjnad, Atyab SBB, Al Kawther, Al Sallan, SFM Liwa, Royal Court,
  Ministry Agri Barka, Osool Haima).
- **Units** are the real ones: 25 kg bags, 40 bags per MT, 1 pallet = 1 MT.
- Product **names** are still `TODO_CONFIRM` in the PRD, so the game shows codes
  only and never invents a name.

Three tuning values are placeholders and are labelled `TODO_CONFIRM` on screen in
the shift report, at the top of `game3.html`:

| Constant | Value | Needs |
|---|---|---|
| `SHELF_DAYS` | 45 | real shelf life per product |
| `WRITEOFF_OMR` | 35 | feed cost per kg (PRD §14 Q7) |
| `DEMURRAGE_OMR_PER_MIN` | 6 | real demurrage rate (PRD §14 Q8) |

Change the constants and the whole economy re-tunes; nothing else needs touching.

## Tests

The games were verified in headless Chromium (SwiftShader):

- all five pages load clean over `http://` and `file://` — zero JS errors, zero
  failed requests, canvas present, HDR environment and textures resolved;
- game 3 auto-played a full shift — 7 orders dispatched, 26 pallets moved, stock
  ageing, spills and a second pedestrian spawning on schedule, zero errors;
- seven rule checks assert the teaching mechanics individually: clean FIFO pick,
  correct load, FIFO breach card + charge, wrong-code rejection, gate-pass-before-DN
  block, DN→pass dispatch, and pedestrian strike ending the shift.
