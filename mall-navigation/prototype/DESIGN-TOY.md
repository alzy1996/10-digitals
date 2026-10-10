# Dallni v0.3 "Toy World": look, light and UI

The default look since v0.3, chosen by Sam from three live mocks ("B · Bright Toy Game", 2026-10-10).
- **Spec:** `../docs/superpowers/specs/2026-10-11-toy-3d-design.md`.
- **Engine API:** CONTRACT.md §3c.
- **Older looks:** v0.2 ("storm glass", DESIGN-GLASS.md) is still there as `?style=storm`, and v0.1 as `?style=classic`.

## 1. Idea

- The mall should look like a friendly mobile game:
  - pastel blocks with soft edges;
  - a real sun with soft shadows;
  - a sky-blue backdrop;
  - bright, exact signs;
  - a teal route.
- The UI is white and chunky, like game buttons.
- Everything is drawn by code: no downloaded models or textures, no new libraries.
- **Honesty is unchanged:**
  - the SIMULATION labels;
  - no avatar for a live position;
  - no parked cars.

## 2. Palette (`src/engine/palette.js`, `THEMES.toy` / `THEMES.toyBasement`)

| Key | Retail (`toy`) | Parking (`toyBasement`) |
|---|---|---|
| Backdrop (canvas CSS gradient) | `#9FD4FF → #EAF7FF` | `#2B3A67 → #4A5A8C` |
| Floor / walkway | `#F7F2E8` / `#FBF8F2` | asphalt `#3A4566`, aisles `#45507A` |
| Slab side / edge | `#E4D6C2` / `#D6C6AE` | `#2A3354` / `#5A6690` |
| Wall tops (`strip`), metal, rails | `#FFFFFF` | `#FFFFFF` |
| Shop walls / roofs / floors | category colour mixed with white: 28 % / 45 % / 20 % of the category | toward `#C9D3F0` / `#6A76A0` / `#4A5578` |
| Glass | `#CFEAFF` | same |
| Planters / leaves / water | `#FF9F6B` / `#5FBF4A` / `#6CD3F5` | same |
| Route core / body / rim | `#1FC7B4` / `#1FC7B4` / `#FFFFFF` | same |
| You / destination / car | `#3B82F6` / `#22C55E` / `#F5B700` | same |
| Bay lines | `#FFFFFF` | `#FFFFFF` |

- **Unlit and exact** (never shaded by the light), via their own mesh (`build.exact`, `MeshBuilder.exactSink`):
  - category sign faces and their white frame line;
  - QR plate faces;
  - the lift sign;
  - parking zone bands.
- Route, rings, markers, pins, text and bays are custom unlit shaders, as before.
- Zone floor washes are 20 % opacity.

## 3. Light (`src/engine/engine.js`, `TOY_LIGHT`)

| | Retail | Parking |
|---|---|---|
| Hemisphere (sky `#E6F4FF`, ground `#F3DCC5`) | 1.6 | 1.25 |
| Sun (white), from the south-east, about 55° high | 2.1 | 1.2 |

- **Tone mapping:** `NoToneMapping`. A white roof in the sun renders at about 1.0, in shadow at about 0.46. A wall facing
  the sun is about 0.84, one facing away about 0.44. Lambert: (hemi + sun · cos) / π.
- **Lit meshes** (`MeshLambertMaterial`, vertex colours, normals from `MeshBuilder({ lit: true })`):
  - each level's opaque, roof and plate meshes;
  - escalator decks and their painted arrows.
- **Unlit (baked shades), so they read white:** the Walk view's ceiling, bulkheads, light panels and outer walls. A lit
  ceiling faces down and gets only the hemisphere's ground colour, which turned it taupe.
- **Baked contact darkening** (wall bases) keeps 45 % of its strength (`applyTheme`, `userData.lit`).
- **Bevels:** 6 cm chamfers on the top edges of every convex prism (`MeshBuilder({ bevel })`). They are clamped to 30 % of
  the shortest edge and of the height. Concave footprints stay square.

## 4. Shadows and quality levels

| Level | When | What |
|---|---|---|
| **Showcase** | default | soft PCF sun shadows (2048 map), pixel ratio up to 2 |
| **Light** | `?quality=light`; Save-Data on; `deviceMemory < 4` (Android Chrome); 1–2 CPU cores; or 8 animation frames in a row more than 45 ms apart (camera flights, pan / pinch / rotate damping, the walk), measured frame to frame so a GPU-bound phone counts too (one-way per session) | no shadows, pixel ratio up to 1.5; the same lit look and the same sun direction otherwise |

- `?quality=showcase` forces Showcase. The picker is `src/quality.js`, outside the 3D chunk.
- Safari caps the core count it reports, so 4 cores alone never demotes an iPhone.
- **Shadows** (`shadowsFor` in `src/engine/quality-rules.js`): only in the toy style at Showcase, never in the stacked
  Overview (upper slabs would black out the floors below), and not while a stack ↔ floor blend animates. The map is
  drawn once when the blend settles.
- **Sun:** it always stands south-east of the shown levels, with or without shadows, so Overview and Light look the same.
- **Redraw:** the sun and the shadow box are refitted, and the map redrawn, only when what is shown changes (mode,
  levels, blend, venue, the Walk view's floor, or a restored WebGL context). A pure camera move redraws nothing, and idle
  stays at 0 frames.
- `getStats().sun = { dir, shadowDraws }` reports the sun direction and how many times the map was redrawn.
- **Walk view:** only the eye's own floor casts; roofs and the ceiling never do.

## 5. UI (`src/ui/app.css`, `src/ui/hud.css`, `src/index.css`)

Same token names and layout as v0.2; new values:

| Token | Value |
|---|---|
| Panels (`--glass-dark-bg`, `--glass-sheet-bg`, `--glass-light-bg`, `--frost-bg`) | white, opaque, no blur |
| Rims | `#E4EBF5` |
| Raised controls inside panels | `#F3F7FC` (pressed `#E4EBF5`) |
| Panel / control shadow | `0 4px 0 #D9E2EF` edge + soft `rgba(30, 60, 110, 0.25–0.28)` drop |
| `--glass-highlight` | `inset 0 -3px 0 rgba(29, 36, 51, 0.06)` (the "press me" lip) |
| Ink / secondary / tertiary | `#1D2433` / `#4B5568` / `#6B7487` |
| Accent text: amber / teal / mint / danger / blue | `#8A5300` / `#0B7A6E` / `#16794A` / `#B42318` / `#1D5FC2` |
| Primary button | teal `#2DD4C0 → #1FC7B4`, ink `#04211C`, edge `0 4px 0 #149C8C` |
| Found it / Take me there | green edge `#23964F` / amber edge `#D9A300` |
| Pressed level, speed and undo | teal `#1FC7B4`, dark ink; the route dot on the active level button `#04211C` |
| Indicators on white: `--route-rim` (selected View option, search focus ring, Walk view pill and play icons), done progress | `#149C8C` (≥ 3:1 on white and on `#F3F7FC`) |
| Browser bar (`theme-color`) | `#9FD4FF`, parking `#2B3A67` |
| Focus ring | `#1D5FC2` |

- All text is at least 4.5:1 on its panel, whatever the scene behind it. The panels are opaque, so the old opaque-fallback
  media blocks are gone.
- The Walk view mini-map dome is light: cream corridors, pastel shops, light-blue voids, teal route.
- The lift card overlay is a light haze.
