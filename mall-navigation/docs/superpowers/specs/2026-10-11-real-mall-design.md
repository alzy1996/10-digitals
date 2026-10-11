# Dallni v0.4 "Real Mall": photo-real materials (design spec)

Date: 2026-10-11 · Branch: `claude/mall-navigation-mapping-app-ioijj1` · Status: design approved by Sam (chat), spec for review

## 1. Why

- Sam saw v0.3 "toy world" and asked: "make it better and look like a realistic game".
- This is project **A** of three. Then B, a Mall Value demo (dashboard, offers, emergency, Ramadan hours, kiosk,
  facilities), and C, a pitch kit.
- From two live mocks (Map + Walk views), Sam picked **Option B: photo-real materials**, over an all-code premium look.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| R1 | New default scene style **`real`**: CC0 photo textures (marble, plaster, wood, stone), reflections from a real indoor HDRI (a covered shopping arcade), soft shadows, a subtle glow on lamps and signs | Sam (mock B) |
| R2 | **Light quality = the v0.3 toy look**, with no texture download and no post-processing. Showcase = real. One-way auto-downgrade as today | Claude (spec D1 of v0.3 carried over) |
| R3 | Textures are mapped **by world position in the shader**, chosen per vertex by a `surface` id derived from its colour key. No UVs in MeshBuilder, no new venue data, so any mall's `venue.json` works | Claude |
| R4 | **Assets ship same-origin** (`public/assets/real/`): WebP ≤ 1024², HDRI downsampled to ≤ 512×256 RGBE. Fetched after the 3D engine, then cached by the browser. **No CDN.** CC0 sources listed in `ASSETS-LICENSES.md` | Claude (PLAN: no CDNs at runtime) |
| R5 | **Sign fascias:** a dark neutral fascia, backlit plain-text letters (Arabic + English, glowing), and a 6 cm category-colour accent line. This replaces "name on a category-colour band" in `real`. Still no brand colours or logos without a licence | Claude, recorded in PLAN §19.6 |
| R6 | **Tone mapping:** Khronos **PBR Neutral** in the output pass. Colours below ~0.76 linear pass unchanged, so route, markers, rings, pins and sign letters keep their exact hues (meaning-colour rule, v0.3 D8). Bloom only on HDR values ≥ 2.0 (lamps, sign letters; built value, see DESIGN-REAL.md 5) | Claude |
| R7 | **Map view keeps full-height walls with roofs removed** (as today), not half-height walls: cut walls would slice the shop signs above the doors | Claude (correction of the chat design) |
| R8 | Honesty unchanged: SIMULATION labels in every Walk view state, no people, no avatar standing for a live position, no parked cars | PLAN §4, §5, §19 |

## 3. Scope

### 3.1 Style plumbing (`src/engine/engine.js`, `palette.js`)

- **Styles:** `setSceneStyle('real' | 'toy' | 'storm' | 'classic')`, default `'real'`. `?style=` accepts the four.
- **Effective style:** `real` when style is `real` and quality is `showcase`; `toy` when style is `real` and quality is
  `light`. The auto-downgrade therefore swaps materials and palette, with no rebuild: the `real` geometry is the toy
  geometry plus extra props and the `surface` attribute.
- **Palettes:** new `THEMES.real` and `THEMES.realBasement`:
  - neutral bases (floors and walls near white), so the photo textures show their own colour;
  - category tints stay on shop walls, shop floors and the fascia accent line;
  - meaning keys (route, you, dest, car, labels) are identical to toy.
- **Geometry flavour:** `{ bevel: 0.06, lit: true, real: true }` (real implies lit and bevelled). Switching between
  `real`/`toy` and `storm`/`classic` rebuilds the venue, as today.

### 3.2 Materials (`src/engine/realMaterials.js`, new)

- **Material:** one `MeshStandardMaterial` (vertex colours) for the opaque, roof and plate meshes in `real`, extended
  via `onBeforeCompile`.
- **Surface ids:** a per-vertex `surface` attribute (Float32, 0–5) written by `MeshBuilder.build()` from `surfaceOf(key)`
  in `palette.js`:

  | id | surface | from colour keys | texture | roughness / metalness |
  |---|---|---|---|---|
  | 0 | plain | everything else (strips, signs, doors) | none | 0.6 / 0 |
  | 1 | marble floor | `slab`, `walkway`, `court`, `lobby`, `paving`, `seating` | marble diffuse + normal + roughness, 4 m repeat | map / 0 |
  | 2 | plaster | `wall`, `wallInner`, `side:*`, `lit:*`, `bulkhead`, `ceiling` | plaster diffuse + normal, 2.5 m repeat | 0.85 / 0 |
  | 3 | wood | `floor:*` (shop floors), `wood`, `seat` | wood diffuse, 3 m repeat | 0.6 / 0 |
  | 4 | stone | `stone`, `stoneDark`, `planter`, `pillar`, `concrete*`, `slabSide` | plaster diffuse at 0.6 m repeat, desaturated | 0.5 / 0 |
  | 5 | metal | `metal`, `escSide`, `post`, `brass` | none | 0.3 / 1 |
  | 6 | water | `water`, `waterLight` | none | 0.04 / 0.1 (mirror-like) |

- **Mapping:** planar by the dominant world normal: floors use `xz`, walls use `xy` or `zy`. Texture colour × vertex
  colour × 1.1, so the category tints still show.
- **Light:**
  - environment: the HDRI through PMREM, `environmentIntensity` 0.6;
  - the toy sun, re-tuned for Standard (about 1.6);
  - hemisphere 0.3.
- **Glass:** storefront glass and the rails become a `MeshPhysicalMaterial` with low roughness, opacity 0.16 and
  environment reflections.
- **Water:** the fountain water is surface 6, smooth and mirror-like.

### 3.3 Real-mall details (procedural, from venue data)

- **Storefronts (`levels.js` `buildUnitWalls`, real flavour):**
  - two glass panes either side of a 2.4 m door opening, with a transom;
  - dark metal mullions every ~1.5 m.
- **Fascia:**
  - a dark fascia box (`fascia` key, surface 0) above the storefront;
  - a category accent line (`sign:` key, exact, unlit) at its bottom edge;
  - troika sign text in white or gold at HDR intensity (glows), contrast ≥ 7:1 on the fascia.
- **Interiors (`src/engine/props.js`, new):** a merged `props` mesh per level, built inside each unit polygon away from
  its doors, by occupant category:
  - fashion, beauty and kids: clothes racks with hanging garments, mannequins on plinths, wall shelving;
  - food and cafe: a counter with a stone top, a lit menu board, tables with chairs;
  - electronics and entertainment: display tables with glowing device screens, wall screens;
  - grocery and health: shelf rows with product boxes;
  - home: a sofa and tables;
  - services: a counter.
  - Props are placed on a grid clipped to the unit polygon, and skip anything within 1.5 m of a door.
- **Atrium:**
  - stone-clad columns (r 0.45 m) at each void corner, 0.7 m outside the rail, with brass rings at the floor and at 3.2 m;
  - glass rails with a brass handrail;
  - escalators with glass sides and dark handrails.
- **Walk view ceiling (`interior.js`, real):**
  - white ceiling with recessed downlights every 3 m along corridors (glowing discs);
  - additive light pools under them on the floor;
  - the skylight over the top floor's voids as a bright sky panel with mullion beams.
- **Directory totems:** a dark pylon with a glowing map screen beside each free-standing QR plate (anchor kinds
  `corridor` / `entrance`).
- **Palms:** curved trunk and two rings of drooping fronds (shared with toy).

### 3.4 Light, post-processing, cameras

- **Post-processing (`src/engine/post.js`, new; Showcase + real only):**
  - an EffectComposer with a 4× MSAA half-float target;
  - a RenderPass for the scene, then a second RenderPass for the marker scene (depth cleared, as today's second pass);
  - UnrealBloom (strength 0.35, radius 0.4, threshold 1.25);
  - an OutputPass with Neutral tone mapping.
  - Light, toy, storm and classic render directly to the canvas, as today.
- **Idle frames:** idle = 0 frames, unchanged. The composer renders only when the engine renders.
- **Shadows:** as v0.3. Showcase only, never in the stacked Overview, never during a blend; the shadow map is redrawn
  only when what is shown changes.
- **Cameras:** unchanged. Map views remove roofs as today (R7); the Walk view has ceilings and lights.

### 3.5 Assets (`public/assets/real/`, built once by `tools/build_real_assets.py`: Pillow for WebP, a small RGBE reader/writer for the HDRI; the outputs are committed, so builds need no Python)

| File | Source (CC0, Poly Haven) | Target |
|---|---|---|
| `marble.webp`, `marble-n.webp`, `marble-r.webp` | `marble_tiles` 1k | ≤ 1024², q80 |
| `plaster.webp`, `plaster-n.webp` | `painted_plaster_wall` 1k | ≤ 1024², q80 |
| `wood.webp` | `brown_planks_03` 1k | ≤ 1024², q80 |
| `arcade.hdr` | `leadenhall_market` 1k, downsampled | 512×256 RGBE |

- **Loader:** a lazy `loadRealAssets()` in the engine. Textures load in parallel after the venue builds. Until they
  arrive, `real` renders with plain vertex colours, no blank frames, then switches once.
- **Errors:** a load error keeps the plain look and logs one console warning. No network call leaves the origin.

### 3.6 Docs

- `DESIGN-REAL.md` (new): surfaces, assets, light, post, fascia rule.
- CONTRACT §3d (API).
- README (v0.4).
- PLAN §19.6 rows R1, R5, R6.
- `ASSETS-LICENSES.md`.
- `mall-navigation/CLAUDE.md` status.

## 4. Out of scope (now)

- Blender or GLB models;
- people or crowds;
- screen-space reflections or planar mirrors;
- day/night;
- sound;
- a new UI (the v0.3 bright game UI stays);
- Mall Value features (project B);
- the pitch kit (project C).

## 5. Budgets (to be reported to Sam with real numbers before raising)

| Item | Now | Target |
|---|---|---|
| `scene3d` (our 3D code) | 60 KiB (53.6 used) | ≤ 72 KiB |
| `engine3d` (three + troika + addons) | 220 KiB (176.7 used) | stays ≤ 220 KiB (composer, bloom, output pass, HDR loader ≈ +12 KiB) |
| Real assets (new row: `public/assets/real/*`) | 0 | ≤ 1.5 MB target, **3 MB hard limit** |
| First screen | 110 KiB (109.5 used) | unchanged (nothing of v0.4 loads before the 3D) |

## 6. Testing / acceptance

**Unit tests:**
- `surfaceOf` maps every palette key to an id in 0–5;
- every `THEMES.real` / `realBasement` key is a hex string;
- `effectiveStyle(style, quality)` (`real` + `light` → `toy`);
- props placement keeps 1.5 m clear of every door and stays inside its unit polygon, on the demo venue;
- the budget checker gains an assets row.

**Browser probes** (headless, as in v0.3):
- `real` loads every asset from the same origin;
- `?quality=light` requests no asset and renders toy;
- idle = 0 frames;
- route teal at a route pixel is within ±6 of the toy render (exact-colour rule);
- the Walk view ceiling has downlights;
- no console errors.

**Screenshots:** Map + Walk views of home, navigate, arrived and car (B1) in EN/AR; `?style=toy` and `?style=storm`
regressions.

**Gates:** `npm test`, `validate:venue` and `build` (budgets) all green.

## 7. Risks

| Risk | Mitigation |
|---|---|
| GPU cost on mid phones (Standard material + 4 textures + bloom) | Showcase only; auto-downgrade to toy (rAF-interval rule); bloom at half resolution |
| Texture memory (~6 textures at 1024², about 24 MB with mipmaps) | Within the PLAN §19.2 Tier A 150 MB |
| Sign readability on dark fascias at map distances | Overlay labels keep names in map views; the fascia text is ≥ 7:1 |
| This laptop (8 GB, HD 520) | One headless browser at a time; Sam's phone is the judge |
