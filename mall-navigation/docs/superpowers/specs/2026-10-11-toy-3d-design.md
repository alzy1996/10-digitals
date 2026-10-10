# Dallni v0.3 "Toy World": game-quality 3D + bright game UI (design spec)

Date: 2026-10-11 · Branch: `claude/mall-navigation-mapping-app-ioijj1` · Status: approved to build ("complete it", Sam)

## 1. Why

Sam: make the 3D "better and better, like it was built in a game engine or a studio". Today's map is unlit, flat-coloured
boxes (PLAN §19.2 "architect's model": no light, no shadows), which reads as a plain model, not a game.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | Audience: **both**. A "Showcase" quality level for demos on good phones and iPads, plus a lighter level that switches on by itself on weak phones. One app. | Sam (question 1) |
| D2 | Art direction: **B · Bright Toy Game**. Rounded-feeling pastel blocks, real soft light and shadows, sky-blue backdrop, bright category signs, like Two Point / Mini Motorways. Chosen over Gulf Luxury and Night Cinematic (live mocks). | Sam (question 2) |
| D3 | UI chrome: **bright game buttons** (white chunky cards with a raised "press me" edge, teal primary, soft colour tiles). It matches the toy map; dark glass over a bright world fights it. | Claude, under "complete it" (Sam can switch) |
| D4 | Everything is **procedural**: no Blender, no GLB downloads, no new libraries. Light, shadows, bevels and colours come from code. Zero extra download beyond our own JS. | Claude (Blender not installed; free tier; budgets) |
| D5 | No bloom, no post-processing passes, no reflections. Toy style doesn't need them and they cost phones the most. | Claude |
| D6 | Honesty rules unchanged: SIMULATION labels everywhere in the Walk view, no avatar standing for a live position, no parked cars. | PLAN §4, §5, §19 |
| D7 | `toy` becomes the **default** scene style. `?style=storm` (v0.2) and `?style=classic` (v0.1) keep working for the 3D. | Claude |
| D8 | This overrides PLAN §19.2's art direction rows "unlit / no realtime shadows" for the toy style. Meaning colours (route, car, destination, category signs, you-are-here) stay **unlit and exact**, so their contrast rules still hold. | Claude, recorded in PLAN §19.6 |

## 3. Scope

### 3.1 Engine: the `toy` scene style (src/engine)

- **Style switch**: `setSceneStyle('toy' | 'storm' | 'classic')`, default `'toy'`. Palettes `THEMES.toy` (retail) and
  `THEMES.toyBasement` (parking) in `palette.js`, resolved through the existing colour-key registry (`paletteName`).
  Toy geometry differs (bevels), so switching to or from `toy` rebuilds the venue meshes (a one-off, ~100 ms); storm and
  classic switch between each other without a rebuild, as today.
- **Palette (retail)**: sky `#9FD4FF → #EAF7FF`; floors warm cream `#F7F2E8` (walkway `#FBF8F2`); slab sides `#E4D6C2`;
  shop walls and roofs = the category colour mixed toward white (walls 72 %, roofs 55 %); wall tops white; glass light
  blue; metal white; planters coral `#FF9F6B`; leaves `#5FBF4A`; water `#6CD3F5`. Category sign faces stay the exact
  CONTRACT category colours with white text (unchanged contrast).
- **Palette (parking, `toyBasement`)**: a friendly dusk version, not black: asphalt `#3A4566`, aisles `#45507A`, lines
  white, pillars `#C9D3F0`, sky `#2B3A67 → #4A5A8C`. Zone colours stay the paint's.
- **Light**: lit `MeshLambertMaterial` (vertex colours) for the opaque, roof and plate meshes in toy. A light rig per
  scene: hemisphere light (sky `#E6F4FF` / ground `#F3DCC5`) + one directional "sun" from the south-east, about 55°
  high. Light intensities are tuned so a white roof facing the sun renders at about 1.0 with `NoToneMapping`. Unlit
  materials (signs, route, rings, markers, pins, text, bays) therefore keep their exact hex colours.
- **Soft shadows** (Showcase level only): the sun casts PCF soft shadows. The shadow box fits the shown level(s).
  - Shadows are re-rendered only when the scene changes (view, level, blend, venue), never on a pure camera move.
  - Off in stack (Overview) view, where upper slabs would black out the floors below.
  - In the Walk view the ceiling never casts.
- **Baked AO kept**: wall bases darken (existing `ao` shades), softened for lit materials. The old fake-sun `wallShade`
  is reduced, since the real sun now does that job.
- **Bevels**: wall segments, sign boxes, kiosks and planters get a 6 cm chamfer on their top edges (an inset top face
  plus a sloped band) in toy only. Under real light this gives the soft "toy" edge highlight.
- **Sky / backdrop**: CSS gradient behind the transparent canvas, from the palette (the storm sky pass is off in toy).
  The Walk view fog uses the palette's `fog` (light haze).
- **Walk view**: same lit materials. The ceiling is white with soft light panels, shadows come from walls and shops,
  and the floor gets faint 1.2 m tiles (the existing Walk view tile code, enabled for toy).

### 3.2 Engine: quality levels (`src/engine/quality.js`, new, pure)

- `pickQuality({ urlParam, deviceMemory, cores, saveData, dpr }) -> 'showcase' | 'light'` (unit-tested).
  - `?quality=showcase|light` wins.
  - Otherwise `light` when `saveData` is on, `deviceMemory < 4`, or `cores <= 2` (Safari caps the core count it reports, so 4 cores alone never demotes an iPhone); else `showcase`.
- `showcase`: shadows (2048 map), pixel ratio up to 2.
- `light`: no shadows, pixel ratio up to 1.5. Lambert light stays (cheap).
- Auto-downgrade: if 8 consecutive rendered frames during a camera move each take over 45 ms of CPU, switch to `light`
  once. One-way per session, logged to the console.
- API: `setQuality(q)`, `getQuality()`; engineHost default `getQuality: () => 'showcase'`.

### 3.3 UI: bright game look (src/ui, src/index.css)

- The UI follows D3 on every screen: home, search, place, navigate, arrived, car and scan sheets; header; map controls;
  the Walk view HUD (turn card, chips, bubble, bottom bar, lift card, mini-map dome rim); notices; toasts.
- Recipe:
  - **Panels**: white `#FFFFFF` (sheets at 96 % opacity) with a 3 px `#EEF3FA` rim and soft blue-grey shadows. No blur
    is needed, so contrast never depends on the scene.
  - **Ink**: `#1D2433`, secondary `#4B5568` (both ≥ 7:1 on white).
  - **Raised buttons**: an inner fill plus a 4 px bottom edge in a darker shade ("press me"), which shrinks to 1 px when
    pressed.
  - **Primary**: teal `#1FC7B4` with a `#149C8C` edge and dark ink `#04211C` (≥ 7:1).
  - **Tiles**: white cards with soft category-tinted icon discs.
  - **Car**: amber `#FFE9A8` / `#F5C84A`.
  - The SIMULATION chip stays amber.
- Done by **re-valuing the existing CSS tokens** in `app.css` / `hud.css` / `index.css` and converting the hard-coded
  dark colours in place. No second theme block, so the first-screen CSS does not grow. `color-scheme: light`.
- Unchanged: layout, sizes (56 px primaries, ≥ 44 px targets), RTL mirroring, sheet behaviour, all text and i18n keys.

### 3.4 Docs

- `DESIGN-TOY.md` (new): palette, light rig, shadows, bevels, UI recipe, quality levels.
- CONTRACT §3c: toy style, quality API, budgets.
- README: v0.3 summary, `?quality=` and `?style=` hooks.
- PLAN §19.6: decision change (D8).
- `mall-navigation/CLAUDE.md`: status update (Q1d answered: nobody; v0.3 built).

## 4. Out of scope (now)

Blender / GLB hero models (later, once Blender is installed), bloom and post-processing, reflections, a light "day/night"
toggle, sounds, avatars, new screens, data/routing/search/simulator changes.

## 5. Budgets (raised, reported to Sam)

| Item | Was | New | Why |
|---|---|---|---|
| `scene3d` (our 3D code) | 52 KiB | **60 KiB** | toy palette tables, light rig, shadow management, bevels, quality levels |
| `engine3d` (three + troika) | 220 KiB | 220 KiB (unchanged) | Lambert + lights are a few KiB of three.js; still under |
| lazy 3D total | 260 KiB | 260 KiB (unchanged) | |
| first screen | 110 KiB | 110 KiB, **target unchanged** | CSS re-valued in place. If it lands over, report the exact number before raising |

## 6. Testing / acceptance

- `npm test` green (existing 273 + new: toy palette resolves every key, `pickQuality` rules); `npm run validate:venue`
  green; `npm run build` green with the budgets above.
- Screenshots (390 × 844, EN + AR) of home, place, navigate (floor + overview), Walk view mid-walk, arrived, car on
  B1, in toy; `?style=storm` still renders; no console errors, no non-localhost requests (the shots script checks).
- Idle = 0 frames after settling (unchanged rule; shadows add no frames).
- Light level (`?quality=light`) renders without shadows.
- Contrast: every UI text on its panel ≥ 4.5:1 (panels are opaque-ish white, measured on the token values).

## 7. Risks

- **Shadow cost on old iPhones** → off in stack view, updated only on change, auto-downgrade to `light`.
- **Lit colours drifting from the exact category colours** → sign faces, route and markers stay unlit.
- **CSS conversion misses a dark-on-dark spot** → screenshot every screen in EN and AR and fix.
- **This laptop has 8 GB RAM and an Intel HD 520** → one headless browser at a time; Sam's phone is the real judge.
