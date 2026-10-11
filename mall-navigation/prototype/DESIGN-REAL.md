# Dallni v0.4 "Real Mall": materials, light and fascias

The default look since v0.4. Sam picked "B · photo-real materials" from two live mocks on 2026-10-11.
- **Spec:** `../docs/superpowers/specs/2026-10-11-real-mall-design.md`.
- **Engine API:** CONTRACT.md §3d.
- **Light quality** draws the v0.3 toy look (DESIGN-TOY.md). `?style=toy|storm|classic` still work.

## 1. Idea

- **A real Gulf mall, still a game:**
  - photographed CC0 materials;
  - reflections from a real covered shopping arcade;
  - furnished shops behind glass;
  - dark fascias with backlit letters;
  - a lamp-lit Walk view ceiling;
  - a soft glow.
- **It works on any venue file:** textures are chosen per vertex from its colour key and mapped by world position, so a
  mall needs no extra data.
- **Honesty is unchanged:** SIMULATION labels, no people or avatars, no parked cars.

## 2. Palette (`palette.js`, `THEMES.real` / `THEMES.realBasement`)

- **Bases are near white,** so the photos show their own colour: `walkway` / `slab` / `lobby` `#FFFFFF`, walls `#F3EFE9`,
  `wood` `#FFFFFF`.
- **Category tints:** shop walls 16 %, floors 12 % and roofs 30 % of the category colour (`TINTS.real`).
- **New keys** in every table: `brass #C9A15A`, `fascia #2B2826`, `garment #8C7B6B`, `screen #1E4E6A`.
- **Parking levels** keep the toy dusk.
- **Meaning colours** (route, you, destination, car, labels) are the toy ones.

## 3. Surfaces and assets

| Surface | Colour keys | Texture (world-mapped) | Roughness / metal |
|---|---|---|---|
| 0 plain | everything else | – | 0.6 / 0 |
| 1 marble | slab, walkway, court, lobby, paving, seating | marble (+ normal, roughness), 4 m, warmed 35 % toward cream | 0.15–0.6 / 0 |
| 2 plaster | wall, wallInner, bulkhead, ceiling, roof*, `side:` / `lit:` / `roof:` | plaster (+ normal), 2.5 m | 0.85 / 0 |
| 3 wood | wood, seat, `floor:` (shop floors) | wood planks, 3 m | 0.6 / 0 |
| 4 stone | stone, stoneDark, planter, pillar, concrete*, slabSide | plaster at 0.6 m, desaturated | 0.5 / 0 |
| 5 metal | metal, escSide, post, brass | – | 0.3 / 1 |
| 6 water | water, waterLight | – | 0.04 / 0.1 |

- **Assets** live in `public/assets/real/`, built once by `tools/build_real_assets.py`, about 1.5 MB, all CC0
  (ASSETS-LICENSES.md):
  - `marble`, `marble-n`, `marble-r`, `plaster`, `plaster-n`, `wood` as WebP (1024²);
  - `arcade.hdr`, Leadenhall Market downsampled to 512 × 256 RGBE.
- **Loading:**
  - They load after the venue, same-origin only, and are cached by the browser.
  - Until they arrive, `real` draws plain vertex colours.
  - A missing file logs one warning; if every file is missing, the plain look stays.
- **Light quality** fetches none of them.

## 4. Real-mall details (procedural, from the venue data)

- **Storefronts:** glass around each door opening, with slim dark mullions every 1.5 m.
- **Fascias:**
  - a dark neutral box above the storefront, with backlit white letters (troika, HDR 2.2, glowing);
  - a 6 cm exact category-colour accent line at its foot;
  - plain text only, no brand colours or logos without a licence.
- **Furnished shops** (`props.js`), on a 1.6 m grid inside each unit, ≥ 0.9 m from walls and ≥ 1.5 m from doors:
  - fashion, beauty, kids: mannequins and clothes racks;
  - food, cafe: tables with stools;
  - electronics, entertainment: display tables with glowing screens;
  - grocery, health: shelf units with products;
  - home: sofas;
  - others: a counter.
- **Atrium columns:** stone, with brass rings at 0 and 3.2 m, at the void corners, kept clear of walking edges.
- **Directory totems:** a dark pylon with a glowing screen behind each free-standing QR plate.
- **Palms** (toy and real): a leaning trunk and two rings of fronds.

## 5. Light, post-processing, cameras

| | Value |
|---|---|
| HDRI environment | `environmentIntensity` 1.2 |
| Hemisphere fill | 0.6 (1.5 until the HDRI has loaded); parking 1.25 |
| Sun (south-east, ~55° high) | 2.2; parking 1.2; soft shadows as v0.3 (Showcase, never in stack or during a blend) |
| Post (`post.js`) | MSAA scene pass → UnrealBloom (strength 0.3, radius 0.35, **threshold 2.0**, half resolution) → Neutral tone mapping (exposure 1.0) to the screen → **markers drawn after it**, straight to the screen (depth cleared) |
| Backdrop | a gradient from `bgTop` to `bgBottom`, drawn as the scene background (the post chain outputs an opaque image) |
| Walk view lamps | the light panels as their own mesh, HDR (3, 2.8, 2.5), glowing |

- **Bloom threshold:** 2.0 rather than the spec's 1.25. At 1.25, glossy marble and water reflecting the HDRI bloomed into
  white blobs in map views.
- **Neutral tone mapping** leaves colours under ~0.76 linear untouched, so the route teal, the destination green and the
  category accents keep their hues.
- **Markers** are drawn after tone mapping, so the you-blue and car-amber stay exact. They reach above 0.76, and a probe
  measured the you-marker 12–17 off when it went through Neutral. Exposure stays 1.0 for the same reason.
- **Map views** remove roofs as before; the Walk view has its ceiling and lamps.
- **Idle:** 0 frames; the post chain renders only when the engine renders.

## 6. Quality

- **Showcase:** real materials, HDRI, bloom, shadows.
- **Light:** the toy materials and palette, no post, no asset download.
- **Auto-downgrade:** v0.3 rule. The swap happens in place, with no rebuild.
- **Status:** `getStats().post` and `getStats().realAssets` (`none` / `loading` / `ready` / `failed`) report the state.
