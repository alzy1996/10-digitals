# Dallni v0.2: Storm Glass + First-Person Walk (design spec)

Status: the spec the engine builder and the UI builder follow exactly. API changes live in
[`CONTRACT.md`](./CONTRACT.md) section 3b; this file is the look, the layout, the motion and the acceptance bar.

Sam's brief: *"See first photo and second: the glass and the colour, want same. The 3, 4, 5: the UI/UX and how it
looks, even first person view and walking."*

What changes in v0.2, and only this:

1. **The look**: a dark "storm glass" world (refs 1 + 2): cinematic stormy sky behind the 3D model, frosted glass
   panels, a warm amber glow, thin light numerals, cool desaturated architecture.
2. **The navigation UI/UX** (refs 3, 4, 5): glowing teal-green path with white chevrons, a ground target ring at the
   next turn, a floating turn bubble anchored in the scene, a top turn card, stat chips, a half-dome mini-map and a
   glass bottom bar.
3. **A new first-person Walk view (FPV)**: the simulated walk seen at eye height inside the 3D model.

What does **not** change: venue data, routing, steps text, search, the simulator, screens and their flow, URL hooks,
tests, budgets, no network calls, no localStorage. The Walk view is a **simulation inside the 3D model**: not camera
AR, not live positioning. The SIMULATION tag is on screen in every navigation state, Walk view included.

Design principles (use them to settle anything this file does not cover):

- **Glass is measured, not guessed.** Every text colour on glass passes WCAG AA (4.5:1) against the *worst* scene
  colour that can sit behind it (pure white for dark glass, pure black for light frost), without counting on blur.
- **Dark glass = HUD chrome; light frost = things that live in the world** (the turn bubble). Pewter (mid-grey)
  glass = small floating controls.
- **Teal-green means "your way"** (path, ring, primary button, current step). Mint-green means "arrived".
  Blue means "you". Amber-yellow means "your car". Orange-amber is atmosphere and the SIMULATION tag.
- **One primary action per screen**, always the glowing teal (or mint on Arrived) control.
- **Idle is still.** Nothing animates and the engine renders 0 frames unless the walk plays or the user touches.

---

## 1. Look analysis of the references

### Ref 1: stormy weather dashboard (dark glass, colour)

Take:
- The **sky**: deep slate-teal blacks (#0A1214 to #141F21) at the edges, mid cloud greys (#43474A), and **one warm
  amber light source** low in the frame (cloud undersides #B47F5F, core near #FFD2A0). It is the mood of the app.
- **Frosted dark-glass panels**: dark translucent fill, soft blur of the sky behind, a 1 px light rim, big radii.
- **Huge thin numerals** (weight 300) for the hero number ("18°"), small regular labels next to them.
- Small **glass pill chips** ("Download App", "H 29°").
- The **smooth curve with one glowing point** at "now" (we use it for the current step on the progress line and
  the walker on the mini-map route).

Do not take:
- Its low-contrast small text ("Recently Searched", "Partly Cloudy" are about 2:1). Ours is AA everywhere.
- Panels that rely on a uniformly dark photo to be readable. Ours are tinted dark enough for a white scene.
- Desktop multi-column layout, the decorative globe, photography (our sky is procedural, no image files).

### Ref 2: Vision Pro weather windows (light glass)

Take:
- **Pewter glass**: mid-grey frosted windows (renders about #41454E to #7C8389) with white text, a **subtle white
  1 px rim** and a soft top highlight.
- **Floating windows**: panels inset from the screen edges with 24 to 32 px radii, never edge-to-edge slabs.
- **Segmented control in a glass track** with a lighter thumb.
- Light-weight large titles ("Overcast cloudy") and big light numerals ("20°").

Do not take:
- White text on the light-grey active segment (about 2.5:1): our active thumb is near-white with dark ink.
- 10 to 11 px captions (our smallest text is 14 px), the vertical tab rail (a visionOS pattern), the room photo.

### Ref 3: AR car navigation (turn card, painted path)

Take:
- **Top dark-glass turn card**: big turn arrow, distance under the arrow, a small verb line ("Turn right on") and a
  big street-like name ("Smithe St"). For us the "street" is a landmark, shop, connector or level name.
- **Chevrons painted on the ground** ahead of the viewer.
- The **floating circular turn marker with a light pole down to the ground**: ours is the bubble icon + beam +
  target ring.
- The **ETA chip** idea (our Arrival stat chip) and a round mini-map (our half-dome).

Do not take:
- Lime green (we use teal-green, distinct from the arrival mint), imperial units, a mini-map squeezed into a corner.

### Ref 4: holographic HUD (target ring)

Take:
- The **target ring on the ground** with a fine grid (concentric rings + spokes) at the goal.
- Thin **leader lines** from floating labels to points in the world (our ring beam).
- Cyan-teal as the hologram accent.

Do not take:
- Large translucent cyan panels with thin text over a bright scene (unreadable), social/record badges, Japanese
  text, info overload, panels covering the view.

### Ref 5: phone AR walking (the whole Walk view layout)

Take:
- **Glowing teal path with white chevrons flowing ahead**, brighter edges, translucent body.
- **Floating speech-bubble turn card anchored in the scene** ("Turn right / And 42 m straight") with a round icon
  at its tail.
- **Three top stat chips** with circular coloured icons (Step / Arrival / Distance).
- **Half-dome mini-map** at the bottom: route, blue you-dot with a heading cone, N marker riding the rim.
- **Bottom bar** with one **glowing round central action**.

Do not take:
- Its mistake: a left-turn icon on a "Turn right" bubble. Our bubble icon is always the same arrow as the verb.
- The "+12 min" alternative-route pill (no alternatives in v0.2), Settings / Message / AI-sparkle actions.
- Light map tiles (our mini-map is dark so it sits inside the glass dome), dummy values ("2.810").

---

## 2. Tokens

All CSS tokens live in `src/index.css` / `src/ui/app.css` (`:root`). Engine colours live in
`src/engine/palette.js` (section 5). Hex values are sRGB as rendered.

### 2.1 Backdrop (the stormy sky)

The engine draws the sky (section 5.2). The CSS `.map-layer` background is the **same gradient stops and glow
position without clouds** (a grey haze stands in for them): it shows before the engine chunk arrives and when WebGL
is missing, so there is no colour flash when the 3D appears. The engine formula (5.2) is the reference; the CSS is
its approximation.

```css
/* storm, retail levels (theme "sunlight") */
.map-layer {
  background:
    radial-gradient(70% 38% at 64% 42%, rgba(255,159,85,0.50) 0%, rgba(214,112,60,0.22) 34%, rgba(20,28,33,0) 72%),
    radial-gradient(90% 50% at 18% 12%, rgba(126,140,152,0.30) 0%, rgba(126,140,152,0) 70%),
    linear-gradient(180deg, #121A1F 0%, #1D262C 22%, #2B2D2F 45%, #0A0F12 100%);
}
/* storm, parking levels (theme "basement"): no amber; one cool LED glow */
:root[data-theme="basement"] .map-layer {
  background:
    radial-gradient(70% 38% at 60% 42%, rgba(90,169,255,0.22) 0%, rgba(20,28,33,0) 70%),
    linear-gradient(180deg, #0C1216 0%, #141B21 22%, #18212A 45%, #070A0D 100%);
}
```

`body` background: `#0A0F12`. `<meta name="theme-color">`: `#0E1418` (storm) / `#070A0D` (basement).
`color-scheme: dark` on `:root` in both themes.

### 2.2 Glass recipes

```css
:root {
  /* DARK GLASS ("storm", ref 1): sheets, header, turn card, mini-map dome, popovers */
  --glass-dark-bg: linear-gradient(180deg, rgba(24,33,42,0.78) 0%, rgba(14,20,25,0.84) 100%);
  --glass-dark-filter: blur(24px) saturate(160%);
  --glass-dark-rim: rgba(255,255,255,0.14);          /* 1px border */

  /* LIGHT GLASS ("pewter", ref 2): small floating controls on the map: view switcher, level picker,
     language button, stat chips, level chip, toasts, bottom-bar side buttons */
  --glass-light-bg: linear-gradient(180deg, rgba(78,87,98,0.86) 0%, rgba(70,79,89,0.88) 100%);
  --glass-light-filter: blur(20px) saturate(150%);
  --glass-light-rim: rgba(255,255,255,0.22);

  /* RAISED ("glass on glass"): controls INSIDE a dark-glass panel: tiles, search field, rows, chips,
     secondary buttons, segmented track. Never has its own backdrop-filter. */
  --glass-raised-bg: rgba(255,255,255,0.10);
  --glass-raised-bg-pressed: rgba(255,255,255,0.16);
  --glass-raised-rim: rgba(255,255,255,0.16);

  /* FROST (ref 5 bubble): light frosted glass with DARK ink, only for callouts anchored in the 3D world */
  --frost-bg: linear-gradient(180deg, rgba(246,248,250,0.88) 0%, rgba(238,242,246,0.84) 100%);
  --frost-filter: blur(20px) saturate(140%);
  --frost-rim: rgba(255,255,255,0.70);

  /* shared light details */
  --glass-highlight: inset 0 1px 0 rgba(255,255,255,0.20);       /* inner top highlight */
  --glass-sheen: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 32px); /* max 4 % */

  /* QA round 1: the big panels must read as glass, not near-black plastic (refs 1 + 2) */
  /* warm edge light (ref 1: panels catch the amber glow): header and sheets, 28 px tall; turn card 14 px */
  --glass-warm-rim: radial-gradient(60% 28px at 70% 0, rgba(255,159,85,0.16) 0%, rgba(255,159,85,0) 100%);
  /* bright frosted rim (ref 2), strongest on top: a masked 1 px ring over a transparent border */
  --glass-spec-rim: linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.12) 36px, rgba(255,255,255,0.07) 100%);
  /* sheets: a text-free clear band at the handle (0.55 -> 0.78 in 20 px): the model and the sky show through */
  --glass-sheet-bg: linear-gradient(180deg, rgba(24,33,42,0.55) 0, rgba(24,33,42,0.78) 20px, rgba(14,20,25,0.84) 100%);
  --shadow-panel: 0 24px 48px -12px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.25);
  --shadow-control: 0 8px 24px -8px rgba(0,0,0,0.45);
  --shadow-frost: 0 10px 28px -8px rgba(0,0,0,0.50);
}
```

How a surface is built (dark glass example; pewter and frost are the same with their own tokens):

```css
.glass-dark {
  background: var(--glass-sheen), var(--glass-dark-bg);
  border: 1px solid var(--glass-dark-rim);
  box-shadow: var(--glass-highlight), var(--shadow-panel);
  -webkit-backdrop-filter: var(--glass-dark-filter);
  backdrop-filter: var(--glass-dark-filter);
}
```

Header, sheets and the turn card add `--glass-warm-rim` (turn card: a 14 px tall version) in front of the sheen, and
replace the flat 1 px rim with `--glass-spec-rim` drawn by a masked `::after` ring (`inset: -1px; padding: 1px;
mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)`) over a transparent border. Sheets use
`--glass-sheet-bg` instead of `--glass-dark-bg`. No text sits where these differ from the measured recipe: the clear
band is the handle zone, the warm light ends above the first text line of the turn card and only `--ink` sits under
it in the header (venue name over a white scene with the brightest warm light: 6.8:1).

**Tinted variant (no blur)**: same colours, alpha +0.08 on each stop (dark 0.86 / 0.92, pewter 0.94 / 0.96), no
`backdrop-filter`. Used to keep the **blur budget**: while the Walk view plays, at most **3 blurred surfaces** are
on screen (turn card, bubble, mini-map dome). Stat chips, the level chip, the SIMULATION pill, the bar capsule and the
"Now on Level 1" toast use the tinted variant there. Elsewhere at most 5 blurred surfaces at once (header, view control, level picker, sheet,
toast). Never nest a blurred element inside another blurred element.

**Fallback (opaque)**, applied by all three of:
`@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`,
`@media (prefers-reduced-transparency: reduce)` and `@media (prefers-contrast: more)`:

| Surface | Opaque fill | Rim |
|---|---|---|
| Dark glass | `#1B232B` | `rgba(255,255,255,0.20)` |
| Pewter | `#4A535D` | `rgba(255,255,255,0.28)` |
| Raised | `#2C353E` | `rgba(255,255,255,0.22)` |
| Frost | `#EEF2F6` | `#FFFFFF` |

Implementation traps (seen in the preview): scroll containers and the pinned footer inside a glass sheet must be
**transparent** (no fill, no blur); the footer's "more above" hint is a 16 px fade of `rgba(14,20,25,0.84)` to
transparent, not an opaque band. Do not put `opacity < 1`, `filter` or `transform` animations on an ancestor of a
blurred element while it is meant to blur (Safari drops the blur during the animation).

### 2.3 Text colours on glass, with measured contrast

Assumptions: blur and `saturate` are ignored (worst case). The worst scene colour behind **dark and pewter glass is
pure white #FFFFFF** (light panels in the Walk view ceiling, white chevrons, the classic style's white sky). The
worst behind **frost is pure black #000000**. Composites are computed from the lighter (worst) gradient stop.
Ratios computed with the WCAG 2.x formula.

Dark glass composite over white: **#4B5259** (top stop) / #353A3E (bottom stop). Over the storm sky it renders about
#151D25.

| Token | Hex | Use | On dark glass (worst #4B5259) |
|---|---|---|---|
| `--ink` | #FFFFFF | all primary text | **7.94:1** |
| `--ink-2` | #C9D2DB | secondary text, placeholders, units | **5.19:1** |
| `--ink-3` | #9AA6B2 | only text >= 24 px or disabled/decoration | 3.20:1 (large text only) |
| `--amber-text` | #FFC57A | "Saved at 17:30", warnings | **5.11:1** |
| `--teal-text` | #5EEAD4 | links, "Walk view" accent text, active menu check | **5.37:1** |
| `--mint-text` | #7EF0A6 | "Open until 22:00", "You've arrived" | **5.64:1** |
| `--danger-text` | #FFB4AB | errors, "Closed now" | **4.68:1** |
| `--blue-text` | #A9D3FF | "You're here" accents | **5.09:1** |

Sheen check: dark glass + 4 % white sheen over white = #525960, `--ink-2` = 4.66:1 (5 % would be 4.53:1: the
sheen must stay at **4 % or less**).

| Surface | Worst composite | Allowed text | Ratio |
|---|---|---|---|
| Pewter (top stop over white) | #676F78 | `--ink` #FFFFFF | **5.12:1** |
| | | `--ink-2-light` #EEF2F6 | **4.56:1** |
| Pewter, tinted (no blur, 0.94) | #59616B | `--ink-2-light` | 5.58:1 |
| Raised on dark glass | #5D6369 | `--ink` | **6.07:1** |
| | | `--ink-2-raised` #DCE3EA | **4.69:1** |
| Raised pressed (0.16) | #686E73 | `--ink` only | 5.19:1 |
| Frost (bottom stop over black) | #C8CBCF | `--frost-ink` #0B1218 | **11.60:1** |
| | | `--frost-ink-2` #3A4654 | **5.92:1** |
| Dark glass over the amber glow core #FFD2A0 | #4B4844 | `--ink-2` | 5.95:1 |

Rules that follow from the table (verifiers check them):
- On **raised** and **pewter** surfaces: only `--ink`, `--ink-2-raised` (raised) or `--ink-2-light` (pewter).
  **No accent-coloured text** there (teal on raised is 4.10:1, amber on pewter 3.47:1: both fail). Accent colour on
  those surfaces is allowed only for icons and for 3 px bars/dots (non-text, needs 3:1).
- Pressed raised controls show `--ink` only.
- Never put text directly on the 3D scene. Every word sits on glass (the 3D world-space signs are the exception:
  they are opaque sign boxes, section 5.4).

### 2.4 Accent and semantic colours

| Token | Hex | Role |
|---|---|---|
| `--amber-glow` | #FF9F55 | sky glow, warm rim light on panels (never text) |
| `--amber-core` | #FFD2A0 | glow core (sky only) |
| `--amber` | #FFB547 | SIMULATION tag fill (ink #1B1205 = **10.53:1**), "PROTOTYPE · SIMULATION" badge |
| `--route` | #26D9C7 | path core colour, current-step progress, mini-map route (non-text: 4.48:1 on dark glass) |
| `--route-rim` | #5EF2DC | path edges, target ring, ring beam |
| `--route-body` | #14B8A6 | translucent path body (alpha 0.62) |
| `--route-glow` | #10B5D3 | soft glow outside the path, ring halo |
| `--route-upcoming` | #1FA79A | later steps of the path |
| `--route-walked` | #5F7C80 | walked part (map views) |
| `--chevron` | #FFFFFF | chevrons (alpha 0.92); white on the composited body (#2C928B) = 3.77:1 |
| `--primary-grad` | `linear-gradient(180deg, #5FF5D6 0%, #22D3BE 55%, #14B8A6 100%)` | primary buttons, Play, turn arrow tile |
| `--on-primary` | #04211C | ink on primary: 12.52:1 (top) / **6.81:1** (bottom stop) |
| `--primary-glow` | `0 10px 28px -6px rgba(34,211,190,0.55), 0 0 28px -6px rgba(34,211,190,0.50)` | primary shadow |
| `--you` | #4DA3FF | you-dot, walker puck, heading cone (with #FFFFFF ring) |
| `--car` | #F5B700 | car marker and car badge (ink #0B0F14 = 10.67:1). Unchanged |
| `--dest` | #5BE584 | destination pin and ring, arrived check, "Found it" button |
| `--ok-grad` | `linear-gradient(180deg, #8BF5A8 0%, #5BE584 50%, #34C76F 100%)` | "Found it" (ink #03200F: 12.92 / **7.84:1**) |
| `--danger` | #FF7B6E | filled danger (ink #2A0603 = 7.38:1); text uses `--danger-text` |
| `--focus` | #FFD27A | 3 px focus ring, offset 2 px (visible on glass and on teal) |
| `--chip-arrival` | #6CB6FF | Arrival stat icon ring |
| `--chip-distance` | #26D9C7 | Distance stat icon ring |
| `--chip-steps` | #FFB547 | Steps stat icon ring |

Two ambers on purpose: the **car is yellow-amber #F5B700** (PLAN.md: the car's colour), the **atmosphere and the
SIMULATION tag are orange-amber**. Never use #F5B700 for anything but the car.

Category colours (shop signs, tiles, chips) and parking zone colours stay as in the data / `tokens.js`. Tile and
chip discs use them unchanged (white glyph or text on every category and pin colour >= 4.95:1, kids #0E7C86 lowest).

**Basement (parking) variant of the UI**: the UI glass does not change (it is already measured against white). Only
the backdrop (2.1) and the 3D palette (5.6) change. The `data-theme="basement"` attribute stays for the engine and
for the one CSS backdrop rule.

---

## 3. Typography

Self-hosted **Readex Pro** only (`@fontsource/readex-pro` files, Latin + Arabic subsets, same-origin; no Google
Fonts). Weights used: **300, 400, 500, 600**. Import `latin-300`, `arabic-300`, `latin-400`, `arabic-400`,
`latin-500`, `arabic-500` CSS from `@fontsource/readex-pro`; weight 600 stays the bundled
`src/assets/fonts/readex-*-600.woff` faces in `index.css` (the same files troika uses). Drop the 700 imports (700 is
no longer used; titles are 600). `font-display: swap`. Each file is under 15 KB (woff2).

Numerals: `font-variant-numeric: tabular-nums` on every number that changes while you look at it (distances, clock,
steps, speed). Arabic text uses Arabic-Indic digits (`toArabicDigits`), painted bay codes stay Latin in an LTR
isolate (unchanged rule).

| Role | EN size / line | AR size / line | Weight | Letter-spacing | Used for |
|---|---|---|---|---|---|
| `num-hero` | 56 / 56 | 56 / 64 | 300 | -0.01em (EN) | Place: walking minutes value |
| `num-card` | 28 / 32 | 28 / 36 | 300 | 0 | Turn card distance value ("28") |
| `num-chip` | 18 / 22 | 18 / 24 | 400 | 0 | Stat chip values, speed button |
| `bay-code` | 44 / 48 | 44 / 48 | 500 | 0.01em | Car card bay code (Latin, LTR isolate) |
| `title-l` | 26 / 32 | 26 / 40 | 500 | -0.005em (EN) | Turn card name line, Arrived place name |
| `title` | 24 / 30 | 24 / 38 | 600 | 0 | Sheet titles (place name, "My car") |
| `headline` | 20 / 26 | 20 / 32 | 500 | 0 | Map step text (was 22/29 700), lift card |
| `body-l` | 18 / 26 | 18 / 30 | 400 | 0 | Subtitles, search placeholder, row titles (500) |
| `button` | 18 / 24 | 18 / 28 | 600 | 0 (GO: 22 / 28, 0.02em EN) | Buttons |
| `body` | 16 / 22 | 16 / 26 | 400 | 0 | Step meta, toasts, list text |
| `label` | 15 / 20 | 15 / 24 | 500 | 0 | Tile labels, turn-card verb line (400), chips |
| `bubble-t` | 17 / 22 | 17 / 26 | 600 | 0 | Turn bubble title |
| `caption` | 14 / 20 | 14 / 22 | 400 | 0 | Smallest text anywhere; bubble sub-line 14 / 18 |
| `chip-label` | 14 / 16 | 14 / 18 | 500 | 0 | Stat chip labels (sentence case) |
| `caps` | 14 / 20 | 14 / 22 | 600 | **0.04em EN, 0 AR** | SIMULATION tag, PROTOTYPE badge, section labels (uppercase EN only) |

Rules:
- **Nothing under 14 px** (PLAN.md section 9). Weight **300 only at 28 px and above**, never for body text.
- Arabic: never uppercase, never letter-spacing, line-heights as in the table (taller for Arabic ascenders and dots).
- Units next to light numerals: `body` or `label` size, weight 400, `--ink-2` (e.g. "28" 300 + "m" 15 px).

---

## 4. Shape, spacing and sizes

| Token | Value | Use |
|---|---|---|
| `--r-sheet` | 28 px | sheets (all four corners), header capsule, dome rim |
| `--r-card` | 24 px | turn card, car card, hero blocks, popovers, arrived hero |
| `--r-tile` | 22 px | home tiles |
| `--r-ctl` | 999 px | pills: buttons, search field, chips, segmented track, SIM capsule |
| round controls | 50 % | language button, level buttons, bar buttons, Play |
| `--gutter` | 12 px + `env(safe-area-inset-left/right)` | screen edge to floating glass |
| `--pad-sheet` | 16 px (20 px at >= 390 wide) | inside sheets |
| `--gap` | 8 px between floating elements, 12 px between blocks inside a sheet |
| sheet position | `inset-inline: var(--gutter)`, `bottom: calc(12px + env(safe-area-inset-bottom))`, max-width 560 px, centred |

Touch targets: **primary buttons 56 px tall** (GO, Found it, Take me there: 64 px), **Play 72 px round**, every other
interactive element **>= 44 x 44 px** (level buttons: 56 px hit box, 48 px visual circle; bar side buttons 56 px;
chips 48 px; Undo 44 px). Non-interactive chips may be smaller (SIMULATION capsule 36 px, level chip 36 px).

Safe areas: top HUD starts at `env(safe-area-inset-top) + 8px`; bottom bar at `env(safe-area-inset-bottom) + 12px`;
the dome height adds `env(safe-area-inset-bottom)`; `viewport-fit=cover` stays.

---

## 5. 3D scene: the storm world

### 5.1 Styles and themes

The engine gets a **style** axis next to the existing theme axis: `setSceneStyle('storm' | 'classic')`
(CONTRACT 3b), default `storm`. `setTheme('sunlight' | 'basement')` keeps choosing retail vs parking colours inside a
style. Classic = v0.1 exactly. Implementation: `THEMES.storm` and `THEMES.stormBasement` tables with the same keys as
`THEMES.sunlight`, plus the new keys below; `resolveKeyHex(key, theme, style)`; the ColorRegistry re-resolves per
(style, theme), so switching never rebuilds geometry.

### 5.2 Sky (procedural, no images)

One full-screen pass drawn first (`depthTest: false`, `depthWrite: false`), only in style `storm` (classic keeps the
transparent canvas over the CSS gradient).

- **Cloud texture**: generated **once** per style/theme change by a shader into a 512 x 256 RGBA8 render target
  (linear filtering, `wrapS = RepeatWrapping`): 5-octave value-noise fbm with one domain warp, periodic in x (sample
  the noise on a cylinder: `p = vec3(cos(2πu)·R, sin(2πu)·R, v·k)`), R = density (0..1, contrast-shaped with
  `smoothstep(0.35, 0.85, n)`), G = soft edge term (`density · (1 - density) · 4`). Disposed with the engine.
  Then every frame costs one texture fetch.
- **Map modes** (stack / floor / top): screen space. `v` = screen uv.y (0 bottom, 1 top), `u` = uv.x.
  Gradient, piecewise linear (the same stops as the CSS of 2.1): `skyLow` at v = 0 -> `skyHorizon` at 0.55 ->
  `skyMid` at 0.78 -> `skyTop` at 1.
  Glow: centre `(0.64 + 0.08·sin(headingRad), 0.58)`, elliptical radii `(0.55, 0.22)`:
  `col += glow · exp(-1.6·d²) · 0.55 + glowCore · exp(-14·d²) · 0.35`.
  Clouds: sample at `(u · aspect · 0.55 + heading / 2π, v · 0.9 + 0.05)`, colour
  `mix(cloudDark, cloudLight, R) + cloudLit · glowTerm · G`, mixed in by `R · cloudAmt · smoothstep(0.25, 0.6, v)`.
  So rotating the map slides the clouds and the glow sideways like a dome; tilting does not move them.
- **Walk view**: view-direction dome. Elevation `el` and compass azimuth `az` of the pixel's view ray:
  `v = clamp(0.55 + el / 1.2, 0, 1)`, `u = az / 2π`. Same gradient (horizon band at eye level), glow centred at
  **azimuth 250° (west-south-west, the Muscat sunset)**, elevation +2°, angular radii 50° x 9°. Seen only through
  the atrium skylight, entrance glass and the far ends of corridors.
- Dither: add `(hash(gl_FragCoord.xy) - 0.5) / 255` before output (no banding on 8-bit phone screens).
- Uniform colours are three.js `Color`s from the hex tokens and the shader ends with
  `#include <colorspace_fragment>`, so rendered pixels equal the CSS gradient of 2.1 (no seam when the engine
  appears).

| Key | Storm | Storm basement |
|---|---|---|
| `skyTop` | #121A1F | #0C1216 |
| `skyMid` | #1D262C | #141B21 |
| `skyHorizon` | #2B2D2F | #18212A |
| `skyLow` | #0A0F12 | #070A0D |
| `glow` | #FF9F55 | #5AA9FF |
| `glowCore` | #FFD2A0 | #BFDFFF |
| `cloudDark` | #2A3238 | #161C22 |
| `cloudLight` | #6B737A | #2E3842 |
| `cloudLit` | #B47F5F | #3E6E9E |
| `cloudAmt` (number) | 0.55 | 0.20 |

### 5.3 Architecture palette (storm, retail levels)

Cool desaturated greys like the ref 2 interior, mid-dark so the teal path, the glass UI and the sign colours carry
the image. Every v0.1 key, then the new ones:

| Key | Storm | | Key | Storm |
|---|---|---|---|---|
| `bgTop` / `bgBottom` | #121A1F / #0A0F12 | | `qr` / `qrDark` | #FFFFFF / #0B0F14 |
| `slab` | #3E464F | | `exit` / `exitMat` | #1E9E5A / #1F3A2C |
| `walkway` | #363D45 | | `wood` / `seat` | #8A6A50 / #6B6358 |
| `court` | #3E3F42 | | `leaf` / `leafDark` | #3E7F57 / #2E6243 |
| `seating` | #5E5A53 | | `trunk` / `planter` | #6B4E38 / #57534C |
| `paving` | #4A4741 | | `asphalt` / `aisle` | #2A3038 / #333A43 |
| `lobby` | #3B434C | | `aisleLine` / `bayLine` | #DDE3EA / #E8EDF2 |
| `slabSide` / `slabEdge` | #262C33 / #1A1F24 | | `lobbyPark` | #4A535D |
| `roof` / `roofService` | #8A929B / #6B737C | | `hatch` / `hatchDark` | #8A939D / #2A3038 |
| `wall` / `wallInner` | #5A626B / #5D666F | | `pillar` | #6E7780 |
| `strip` (wall tops) | **#D5DCE3** (light rim, like ref 2 edges) | | `concrete` / `concreteTop` | #4A535D / #5A636D |
| `serviceFloor` | #3A4149 | | `accessibleBay` / `accessibleSymbol` | #3B4A5C / #FFFFFF |
| `glass` | #9DBFCC (material opacity 0.30) | | `ghost` | #9AA6B2 |
| `metal` / `post` | #A9B3BD / #A9B3BD | | `routeCore` | #26D9C7 |
| `door` | #1E242A | | `routeUpcoming` | #1FA79A |
| `escDeck` / `escDeck2` | #2B3138 / #363D45 | | `routeCasing` (glow) | #10B5D3 |
| `escSide` / `escPit` | #9AA4AE / #1A1F24 | | `routeWalked` | #5F7C80 |
| `chevron` | #FFFFFF | | `you` / `youRing` | #4DA3FF / #FFFFFF |
| `stairStep` / `stairStep2` | #6E7780 / #5A636C | | `lastSeen` | #9AA6B2 |
| `stone` / `stoneDark` | #6E6A62 / #57534C | | `car` / `carOutline` | #F5B700 / #0B0F14 |
| `water` / `waterLight` | #2E8FB0 / #6FC3DD | | `dest` | #5BE584 |
| `labelText` / `labelHalo` | #FFFFFF / #0E1418 | | `walker` / `walkerOutline` | **#4DA3FF / #FFFFFF** (the simulated you) |
| `badgeText` / `badgeHalo` | #FFFFFF / #0E1418 (outline 0.18 em, `badgeW`) | | `signText` / `floorPaint` | #FFFFFF / #E6EBF0 |

New keys (both styles must define them; classic may reuse its nearest colours):
`routeRim` #5EF2DC, `routeBody` #14B8A6, `routeGlow` #10B5D3, `turnRing` #5EF2DC, `ceiling` #2B3239,
`ceilingPanel` #EAF2F8, `bulkhead` #454D56, `sheen` #8FA3B3, `fog` #2A3138, plus the sky keys of 5.2. Storm only:
`badgeW` 0.18 (level-name badge outline width; classic keeps v0.1's 0.26); `escPanel` #9DBFCC (escalator balustrade
glass; classic and basement: their `escSide`).

QA round 1 (ref 1 mood in the Walk view): the walkable floors, the court, the lobby and the walls are darker slate
(walkway #363D45, court #3E3F42, lobby #3B434C, wall #5A626B; the first-person scene had come out mid-grey, brighter
than the map views, so the dark glass HUD read as grey boxes on grey and the teal path looked painted on). The overview
level names are thin white type on a slim dark halo like the shop labels, not v0.1's dark stickers with a thick white
outline.

QA round 2 (refs 1 and 2: cool slate, amber only as a light): the round 1 warm gloss (`sheen` #C9A88C at 0.32) and warm
haze (`fog` #3A2F2A) turned the Walk view's floors and far walls taupe-brown (the floor fills about half of the open
view). Now the gloss is cool (`sheen` #8FA3B3) at **0.16** and the haze slate (`fog` #2A3138): the floor reads about
#4A4E53 at 10 m. Warmth stays in the skylight glow, the panels' warm rim and the amber SIMULATION tag.

Category-tinted keys in storm: `roof:#hex` = mix(#7E8791, hex, 0.30); `floor:#hex` = mix(#3E464F, hex, 0.18);
`side:#hex` = mix(#5D666F, hex, 0.25); `dark:#hex` = mix(hex, #000000, 0.35); `lit:#hex` (a shop's walls seen from
inside, through its storefront glass) = mix(`side:#hex`, #E9D9C4, 0.35), so shops read as lit (classic: `side:#hex`).

**Glossy floor sheen** (cheap, no reflections): the opaque material (via `onBeforeCompile`) adds, for up-facing
fragments only (`normal.y > 0.9`): `col += sheen · pow(1 - max(dot(N, V), 0), 3) · 0.16` (uniform `uSheen` = 1 in
storm, 0 in classic). Map views get a soft brightening toward the far side of the floor; the Walk view gets a polished
floor that brightens toward the distance. In the Walk view, under every ceiling light panel, a **reflection streak**
(0.7 m x 2.4 m quad, 2 mm above the floor, `ceilingPanel` at alpha 0.08, normal blending) sells the gloss.

**Walk view surface cues** (QA round 2, same shader, uniform `uWalk` = 1 in the Walk view only, storm only, no extra
draw calls): faint **floor tiles**, up-facing fragments darkened 7 % along a 1.2 m grid (lines about 2.5 cm,
anti-aliased with `fwidth`, faded out from 8 to 22 m so they never shimmer); a **vertical gradient on walls** (height
above the level floor): a darker skirting under 0.12 m, -24 % at the floor easing to 0 at 1.9 m, +6 % from 2.3 to
3.4 m under the ceiling lights.

**Storefront glass**: `glass` at opacity 0.30 plus a fresnel term, alpha up to 0.55 at grazing angles
(`0.30 + 0.25 · pow(1 - |dot(N, V)|, 2)`). The mullion top line stays `metal`. Every solid shop wall is lined inside
with `lit:#hex` (a quad 3 mm inside the wall, same shading as the wall's own inner face).

**Escalators** (storm): the balustrade side panels from the deck to the handrail are drawn with the same glass (one
face per side, culled, `escPanel`), over an opaque truss skirt; the light handrail strip stays on top. The arrows
painted on the steps are their own mesh, drawn in the map views only (in the Walk view the moving steps show the
direction; up close they were giant grey wedges). Classic keeps the v0.1 opaque panels.

**QR floor plates** (free-standing you-are-here tiles) are their own mesh, hidden in the Walk view (edge-on from eye
height they read as white smears); the plates on pillars stay.

### 5.4 Sign boxes

Sign bands keep their category colour, slightly desaturated toward slate, with white text: storm sign colour =
mix(category, #4B5560, 0.18), then mix with black 0.08. Measured white-text contrast on every category: food #9F3F19
6.57, fashion #8F1D52 8.52, cafe #774E2B 7.21, electronics #5F2CB4 8.39, beauty #9C2056 7.63, kids #176C75 6.14,
grocery #1C6F3E 6.22, entertainment #6A3AC3 7.00, home #7B3E1A 8.24, health #17667D 6.53, services #424E5F 8.42
(all >= 6.1:1). The sign box side faces use `dark:#hex`. Troika text rules (14 / 16 px minimum, two-line stacking,
fonts, textGuard) are unchanged. Map labels: white text with a #0E1418 halo.

### 5.5 Walk-view-only geometry (built lazily on first Walk view entry, per level, disposed with the venue)

- **Ceiling** at level elevation + **4.6 m** (retail) / + **3.6 m** (parking), covering the level outline, **single
  sided facing down**, colour `ceiling`. Holes: the void polygons of the level above (G sees up into the L1 atrium);
  the top retail level gets its own voids as a **skylight** (the storm sky shows through).
- **Bulkhead fascia**: for every unit edge that faces a walkable area, a vertical quad from 3.5 m (`WALL_H`) to the
  ceiling, colour `bulkhead`, so no gap shows above storefronts. Sign boxes stay in front of it.
- **Ceiling light panels**: 0.6 x 2.4 m quads 1 cm under the ceiling, colour `ceilingPanel` (unlit, they are the
  brightest thing in the view), every 6 m along each walk edge of the level's graph longer than 4 m (start 1.5 m
  from the nodes), long side along the edge; plus a 1.4 x 3.2 m halo quad at alpha 0.10 around each. Parking: tube
  lights 0.15 x 1.8 m every 7 m along aisles, colour #CFE6FF.
- **Fog** (Walk view only): linear `Fog(fog colour, 30 m, 140 m)`; storm `fog` #2A3138 (slate haze), basement #121820. Route and
  markers are not fogged (the path has its own fade).
- Merge per level into at most 4 draw calls (ceiling, bulkheads, panels, streaks + halos).

### 5.6 Parking ("basement") in storm

Dark asphalt and cool light. Keys that differ from 5.3: `bgTop` #0C1216, `bgBottom` #070A0D, `slab` / `asphalt`
#15191E, `walkway` / `court` / `paving` #1F262D, `aisle` #1C2228, `aisleLine` #A9B6C4, `bayLine` #D7E0EA,
`lobbyPark` / `roof` #2A323B, `lobby` #262E36, `slabSide` #0E1215, `slabEdge` #2A323B, `wall` #333B44, `wallInner`
#2A323B, `strip` #8592A0, `pillar` #3A444F, `concrete` #252C34, `concreteTop` #2E3640, `hatch` #7D8896, `hatchDark`
#15191E, `glass` #6F93B8, `ghost` #7D8896, `routeWalked` #4E6366, `labelHalo` #0B0F14, `floorPaint` #D7E0EA,
`ceiling` #1A1F25, `bulkhead` #252C34, `sheen` #6E8296. Category tints: `roof:` mix(#2A3342, hex, 0.45), `floor:`
mix(#1B212B, hex, 0.25), `side:` mix(#333B44, hex, 0.30). **Zone colours, zone decals, pillar bands and painted bay
codes keep the data colours exactly** (they must match the paint in the car park). Route, you, car and destination
colours are the same as retail (the route rim on #1A1F25 is 12.0:1).

### 5.7 The glowing path (style `glow`, CONTRACT `setPathStyle`)

One ribbon mesh per level run (as v0.1), custom shader, normal alpha blending, `depthWrite: false`, drawn after the
floors. Cross-profile, measured from the centre line, with `W` = geometry half-width:

| Zone | From / to | Colour | Alpha |
|---|---|---|---|
| Body | 0 to 0.59 W | `routeBody` #14B8A6 | 0.62 (Walk view: 0.88, so painted aisle lines hardly show through) |
| Rim | 0.59 W to 0.67 W | `routeRim` #5EF2DC | 0.95 (anti-aliased with `fwidth`) |
| Glow | 0.67 W to W | `routeGlow` #10B5D3 | `0.45 · (1 - smoothstep(0.67W, W, t))²` |

- **Width**: Walk view: true size, visible ribbon **1.4 m** (rim to rim; `W` = 1.05 m with the glow). Map views: as
  v0.1, the ribbon widens with distance so the rim-to-rim width never drops under 11 px (14 px in Overview).
- **Chevrons**: white, alpha 0.92, a "^" pointing in walking direction, **0.9 m wide** (±0.45 m), arm angle **55°**
  back from the perpendicular (the point is 0.64 m deep, so at eye height it still reads as a bold arrow, not a flat
  dash; QA round 1: 30° foreshortened into lane markings), stroke **0.18 m** (Walk view **0.28 m**: ref 5's solid
  arrowheads), period **2.4 m** along the route (map views: `max(2.4 m, 6 W)`), drawn in the shader from `vDist` and
  the across coordinate. Only on the part not yet
  walked. Each segment of the ribbon is its own quad (its own vertices at the joints) and its route distance is
  measured along that segment (the mitre corner's along-segment offset is applied in the vertex shader), so chevrons
  stay straight up to the mitre line of a corner instead of shearing into lopsided slashes across it.
- **Flow**: chevrons slide forward by `uFlow` (metres). `uFlow += dt · flowMps` **only while
  `setPathAnimating(true)`**; the UI passes `flowMps = 1.2 · simSpeed + 0.6` (they glide ahead of the walker at
  0.6 m/s in the Walk view, 1.8 m/s on the map at 1x). When not animating: static chevrons, 0 frames.
- **Current step** full strength; **later steps** body alpha x0.7, chevron alpha x0.6, core colour `routeUpcoming`.
- **Walked part**: map views `routeWalked` at 0.5 alpha, no glow, no chevrons; Walk view: hidden.
- **Other floors**: dotted (round dots 0.5 m every 1.6 m), `routeCore` at 0.45, no glow, no chevrons (v0.1 rule,
  restyled). Stack-view x-ray copies stay.
- **Walk view distance fades**: the body x `smoothstep(1.0, 5.0, d)`, the chevrons x `smoothstep(3.0, 4.0, d)` (QA
  round 2: full white once they clear the mini-map dome, which hides the floor nearer than about 4.3 m, so the nearest
  visible chevron is the boldest, as in ref 5), everything x `1 - smoothstep(40.0, 60.0, d)`; `d` = distance from the
  eye in metres. The near fade stops the ribbon from flooding the bottom of the view; beyond about 60 m the path
  dissolves into the fog. On an **escalator ramp** the path is the body alone (`uNoChev`): the moving steps show the
  direction.
- **Arrived in the Walk view** (a route shown and no next turn): the whole route counts as walked, however the arrival
  happened (played, stepped through, or a deep link): no path and no connector beams are drawn.
- **Connector beams** (v0.1 light columns at lifts, escalators, stairs): `routeRim` core 0.12 m wide, `routeGlow`
  halo, alpha fading upward. Walk view: a thin pole (radius 0.06 m) fading in from 4 to 12 m from the eye, and none at
  the stop the next-turn ring stands on (its own beam marks it; QA round 2: riding an escalator, the exit pole was a
  50 px column washing over the view).
- Style `ribbon` = the v0.1 ribbon (blue core, white casing, static chevrons), colours from the active palette.

### 5.8 Target ring (ref 4) and beam (ref 3)

At the point given by `setNextTurn` (CONTRACT 3b), 4 cm above the floor, depth-tested (walls hide it), drawn after the
route:

- Outer ring: radius **1.1 m**, stroke 0.08 m, `turnRing` #5EF2DC, alpha 1.
- Grid: rings at r 0.35 and 0.7 m (stroke 0.03 m, alpha 0.45) and **8 spokes** from 0.35 to 1.1 m (0.02 m, alpha
  0.35).
- Halo: annulus 1.1 to 1.6 m, `routeGlow`, alpha 0.25 -> 0.
- **Beam**: a camera-facing vertical strip from the floor to **2.2 m**, 0.06 m wide, `routeRim`, alpha 0.9 at the
  floor -> 0 at the top. The DOM turn bubble's icon sits on the beam's top (the `nextTurn` anchor).
- **Ripple** (only while `setPathAnimating(true)`): one extra ring grows from r 0.35 to 1.6 m with alpha 0.6 -> 0,
  period 1.6 s.
- `kind: 'arrive'`: ring and beam in `dest` #5BE584 instead of teal. In the Walk view the destination pin is then not
  drawn (the ring and the bubble on its beam mark it: one marker per turn, 6.5), and **on Arrived** the ring stays at
  the doorstep in mint (grid, halo, beam) in place of the flat v0.1 arrival ring, which the Walk view does not draw.
- Map views: the ring keeps at least 14 px radius on screen; hidden in Overview (stack).

### 5.9 Markers in storm

- **You** and **walker**: blue puck `you` #4DA3FF, 2 px white ring, soft halo disc (alpha 0.22, 2x radius), and a
  60° **heading cone** (radial gradient #4DA3FF 0.55 -> 0). The walker is the simulated you, so it looks like you;
  the SIMULATION tag says what it is. In the Walk view the walker is not drawn (the camera is the walker).
- **Car**: unchanged (amber).
- **Destination**: mint pin #5BE584 with a white glyph and the mint ring; `state: 'arrived'` = ring alone (v0.1 rule).
- The DOM you-are-here pulse uses `--you` with a white core.

---

## 6. First-person Walk view (FPV)

`setView({ mode: 'fpv' })` (CONTRACT 3b). A simulation inside the 3D model, labelled as such at all times.

### 6.1 Camera

| Parameter | Value |
|---|---|
| Eye height | **1.6 m** above the walker's floor (`setFpvOptions.eyeHeightM`, 1.2 to 2.0) |
| Vertical FOV | **70°** (`fovDeg`, 50 to 85), reduced when needed so horizontal FOV <= 80° (wide screens) |
| Pitch | **-5°** (`pitchDeg`, -25 to +5; negative looks down) |
| Roll | always 0, horizon level |
| Near / far | 0.05 m / 300 m |
| Principal point | centred in the free area between the top HUD and the dome (`setViewportPadding`), via `setViewOffset` |

At 390 x 844 (free area y 181 to 625, see 7.1) this puts the horizon at **y ≈ 350 px**, the focal length at about
603 px, the horizontal FOV at 36°, and the floor visible from about 4.3 m ahead. (QA round 1: at -10° the horizon sat
60 px under the top HUD, so storefronts and ceiling panels within 15 m hid behind the turn card and the bubble anchor,
2.2 m up at the turn, projected above the free area; -5° shows the corridor ahead and lets the bubble hang above its
icon as in ref 5.)

**Following the walker** (the simulator drives the walker marker; the camera follows it every frame while playing):
- Position: exponential smoothing toward `walker + eyeHeight`, time constant **120 ms**
  (`k = 1 - exp(-dt / 0.12)`).
- Heading: aims at the route point **5 m ahead** of the walker's route position (not the raw heading), so corners
  are anticipated; smoothing time constant **250 ms**, yaw rate capped at **90°/s**. (Integration tuning: 2.5 m swung
  the narrow first-person view up to 71° on the demo route's 3 m jog out of the south entrance; 5 m keeps it under
  40° and spreads each 90° corner over about 3 s.)
- Pitch: fixed, except on escalators (6.2).
- No walker (walk never started): stand at the current step's start point (or the `you` marker, or the route start,
  or the venue's default start anchor). The App sends the heading (`walkStand`): along the first leg of the route that
  is at least 4 m long, so a short jog out of a doorway does not turn the narrow view to a wall (QA round 1 compared
  it with the follow camera's 5 m look-ahead at the -5° pitch: on the demo route that faced the Lift A wall instead of
  the corridor, the escalator bubble and the fountain the "Face Atrium fountain" card names). Pressing Play then turns
  the view once toward the jog's corner and back (about 35° over 2.5 s). The engine's own fallback, when nothing is
  sent: the route point 5 m ahead, or the anchor's `facingDeg` with no route.
- `setActiveStep(i)` with no walker: glide the eye to step i's start, facing along it, **900 ms**.
- **Never through floors**: a goal on another level outside a ride (Next step with no walk running, a Next or Back
  seek during a walk) or a jump of more than 3 m (a walker seek) is a **cut**, not a smoothed move or a glide.
  Escalator step-off is continuous and stays smooth; same-floor glides keep their 900 ms ease.

**Look around**: one-finger drag rotates the view (0.25°/px yaw, 0.2°/px pitch, pitch offset ±25°; yaw free when
paused, ±100° while playing). No inertia, no pan, no pinch zoom. While playing, 1.5 s after the finger lifts, the
offsets ease back to 0 over 600 ms. Double-tap recentres. Taps still pick (`onPick`). The look ends however the
gesture ends (the finger lifts, a second finger lands, the browser cancels the pointer), so the spring-back always
runs (QA round 2: a pinch left the view turned away from the walk). OrbitControls stay off in the Walk view also when
a deep link enters it before the canvas mounts.

**Entering / leaving**: from a map view the camera **dives** in 1.1 s (pose lerp from the orbit pose to the eye pose:
target 6 m ahead and 1.05 m below the eye, distance 6.1 m, tilt 10°); leaving rises back to the requested map pose
in 1.2 s. Reduced motion: cuts (every map flight is a cut too, `startFlight` duration 0).

### 6.2 Connectors

- **Escalator: ride smoothly.** Eye = escalator ramp height (`markerWorldY`) + eye height. Pitch eases (600 ms) to
  `-5° + 0.5 x slope` going up (about +10°: you look up the escalator toward the upper floor) and `-5° - 0.3 x slope`
  going down; back to -5° when stepping off. The walked distance (and so the bubble's metres) runs on up the ramp: the
  engine projects the riding walker onto the escalator's own edge. During the ride the exit level is shown as well as the boarding level.
  No slab or ceiling may ever cut through the camera: the demo escalators sit inside the atrium void (no slab
  crossed); for any escalator whose ramp is not inside a void polygon the engine uses the stairs treatment below.
- **Lift: short fade.** Phase `wait`: the camera turns to face the lift doors (yaw toward the lift stop, 600 ms) and
  stays; the target ring stays at the boarding stop on this floor (the App moves it to the exit stop only while riding
  an escalator), and the bubble, its icon pinned at the bottom centre of the free area (the eye stands on the stop),
  keeps its box with the lift name and "Press “1”". Phase `ride`: the UI fades in the **lift card** (dark overlay
  `rgba(10,15,18,0.92)` + blur 12 px, 240 ms) with a centred glass card: lift icon in a 56 px teal disc, the button to
  press as the card's line ("Press “1”"; the turn card above already says "Take Lift A to Level 1" and drops its own
  Press line, the `headline` "Lift A → Level 1" is read to screen readers only), and a 4 px teal progress line
  (`rideProgress`). The engine does **not** move the camera vertically during the ride; when the ride ends it
  **cuts** to the exit stop on the exit level, facing along the next route segment; the UI fades the overlay out
  (320 ms). The card shows for at least 600 ms even at 4x.
- **Stairs**: same as the lift (card line "Stairs → Level G", stairs icon: stairs have no button), because stair
  cores are enclosed.
- "Now on Level 1" toast appears after the exit as in v0.1.

### 6.3 Arrival framing

When the walk ends the UI calls `flyToShopFront` (as in v0.1); in the Walk view it means: stand on the sign's normal
**8 m** in front of the sign (more if the sign is wider than the view: `width / (2 tan(hFOV/2)) + 0.5`), eye at 1.6 m,
heading straight at the sign (sign horizontal on screen within ±3°), pitch chosen so the sign's centre sits at **25 %**
of the free area's height, **900 ms** ease. Where a wall or the atrium void is closer than 6 m in front of the sign
(QA round 2: three Level 1 shops face the void 3.6 m out, so the eye stood 3.1 m from a 5.5 m sign, clipped on both
sides, the ring below the screen), the stand turns 20 / 35 / 50 / 60° along the corridor, the first that gets 6 m
away (else the furthest), and faces the sign from there (`interior.arrivalStand`, unit-tested). On Arrived the free area
ends at the Arrived sheet (the App's viewport padding), and the App frames again once the sheet is up, so the
arrival ring at the doorstep shows **above the sheet**, at 360 x 740 too (QA round 1: at 4.5 m and 40 % it hid behind
it; 8 m still draws the sign's letters about 30 px tall). Both sign
lines must read (Latin >= 14 px, Arabic >= 16 px). For a parking bay (`flyToBay`): stand in the aisle 6 m from the bay mouth,
facing into the bay, pitch -14°: the painted code and the car both in view.

### 6.4 Comfort (motion-sickness guards)

- **No head bob, no roll, no FOV changes** during the walk, horizon always level.
- Yaw rate cap 90°/s, smoothing as above; pitch changes only on escalators (slow, 600 ms).
- Lifts and stairs are **cuts under a card**, never a vertical camera slide through floors.
- A static vignette over the 3D: `radial-gradient(120% 90% at 50% 42%, transparent 55%, rgba(4,7,9,0.45) 100%)`
  (never animated).
- `prefers-reduced-motion: reduce`: dive/rise/glide/arrival and every map flight become cuts, chevrons and
  ring stay static, the bubble does not slide, lift/stairs swap instantly with the card shown 600 ms. The walk itself
  still moves (it is the content the user started) but heading smoothing stays on, so turns are never snaps.

### 6.5 Floating turn bubble (ref 5)

A DOM element (frost glass, dark ink) positioned from `onAnchors` every rendered frame (CONTRACT 3b), never through
React state (write `transform: translate3d(x, y, 0)` on the element, rounded to 0.5 px, `will-change: transform`).

Anatomy (LTR; RTL mirrors):

```
                 ┌──────────────────────────┐
                 │ Turn right               │   bubble-t 17/22 600 #0B1218
                 │ and 42 m straight        │   caption 14/18 #3A4654
                 └──────────────────────────┘
               (◉)  <- 34 px icon disc, its centre ON the anchor (x, y); teal radial gradient, white 2 px ring,
                       white turn arrow (same icon as the turn card); the box hangs above-right of it
                │   <- the ring beam (3D) continues down to the target ring on the floor
```

- Box: padding 8 / 14 px, radius 18 px, min-width 150 px, `--frost-*`, `--shadow-frost`. Icon disc overlaps the box's
  bottom-start corner by 16 px both ways and sits **on top** of the box (ref 5: the round icon at the bubble's tail).
- One marker per turn: in the Walk view the engine does not draw the step's forced lift / escalator / landmark pin or
  name when it stands within 3 m of the next-turn ring (the bubble and the turn card name it), nor, on the last step
  (`kind: 'arrive'`), the destination's own name and pin (the ring and the bubble icon mark it, the card and its sign
  name it). Other names keep clear of the bubble: the engine reserves its icon and the box above it toward the inline
  end (238 x 72 px) for the label layout.
- Text per step kind (anchor = the current step's end point, see 7.6):

| Current step | Title | Sub-line |
|---|---|---|
| `turn` | `hud.turn.<turn>` ("Turn right") | `hud.andStraight` with the next step's distance ("and 42 m straight"); if the next step is the arrival under 1 m: `hud.thenArrive` |
| `walk` | `hud.turn.straight` ("Keep straight") | `hud.andStraight` (next step's distance) |
| `connector` | escalator: `hud.escalatorUp` / `hud.escalatorDown`; lift: the lift's name; stairs: `hud.stairsUp` / `hud.stairsDown` | before boarding `hud.toLevel` ("to Level 1"); on it (riding, waiting) the turn right after the ride when the step has one (`connector.exitTurn`: "then turn left at the top" / "…at the bottom" / "…as you step out", `hud.where.*` + `hud.then.*`), else "to Level 1"; lift in `wait`: "Press “1”" |
| `arrive` | destination name | `hud.side.<side>` ("on your right") |
| `start` (0 m) | show the next step's bubble | |

- **Placement**: box above and toward inline-end of the icon. If the box would cross the free area's top
  (HUD bottom + 8 px), it flips below the icon; if it would cross the inline-end edge (gutter, with 0.5 px of slack),
  it flips to the other side. The box never overlaps the top HUD, the dome or the bar. A box too wide for either side
  is clamped inside the free area; if that slides it over its own icon (more than the 16 px corner tuck), it moves
  wholly above the icon (6 px gap), or below it when there is no room above: the icon never covers the text (QA round
  2: in Arabic at 360 px a 0.4 px rounding flipped the box under its icon).
- **Off-screen** (`visible: false`): a 44 px frost **edge pill** (icon + an outward chevron) at the left or right edge
  of the free area (side from the sign of `relBearingDeg`), vertically at the free area's middle; |relBearing| > 150°,
  or `behind` and |relBearing| > 90°: bottom-centre of the free area with a "turn around" arrow and `aria-label`
  `hud.behind`. `behind` but still ahead (|relBearing| <= 90°, or under 2 m away: the eye stands on the lift stop, the
  last metres of a down escalator pitched toward the floor put the beam top behind the camera plane) is **here**:
  the icon pins to the bottom centre of the free area, never a "turn around" pill.
  Straight ahead but only above (or below) the free area (riding up an escalator toward its top), whether the engine
  counts the anchor visible or not: no edge pill; the icon is pinned to that edge of the free area right above the
  turn, the box hangs below it.
- While a toast ("Now on Level 1") sits under the turn card, the bubble keeps 64 px below the free area's top (an
  anchor above that line pins to it, so the icon never hides under the toast).
- **Near the turn** (distance < 6 m; the destination: < 30 m, its sign is in view and names it): icon disc only (the
  box fades out in 160 ms); the card above still says it. Waiting at the lift doors keeps the box ("Press “1”"). Near
  the turn there is **no edge pill** either: the view starts turning into a corner before you reach it, so the point
  slides off the far side and the pill would point the wrong way; the bubble hides and the card says it.
- Distances: from the walker; with no walk, from where the eye stands (stepping through with Next).
- Step change: 200 ms crossfade + 8 px rise of the new bubble. Hidden while the lift/stairs card is up.
- `aria-hidden="true"` (the turn card's live region already announces the step).

### 6.6 What else is visible in the Walk view

- The current level solid; adjacent retail levels too (they only show through voids and the skylight, the ceilings
  and slabs hide the rest); parking: current level only. During an escalator ride: boarding + exit levels.
- Overlay pins and labels: only forced ones (destination, the step's landmark and connector, minus the ones within
  3 m of the next-turn ring and the destination's on the last step, 6.5); the shop signs carry the names. The
  destination pin keeps its v0.1 "drawn on top" rule (seen through walls, like an AR beacon) until the last step.
- Walker: not drawn. You marker: not drawn when the eye stands on it. Car marker: drawn when on the level.

---

## 7. HUD layout (Walk view) and the navigation chrome

### 7.1 Walk view at 390 x 844 (reference size)

QA round 1 rebalanced the weight toward the scene (ref 5 gives the scene 65-70 %): the SIM row is gone (the
SIMULATION pill lives in the turn card's top-end corner) and the dome is lower. The scene gets 444 px (53 %) instead of
337 px (40 %). QA round 2: the level chip moved from the chips row to the dome's start corner, so every phone keeps
ref 5's round coloured icon on each chip; a static shade (`rgba(4,7,9,0.55)` fading out over 200 px) sits behind the
top HUD so bright ceiling lights do not flash between the chips.

```
y   0 ┌────────────────────────────────────────┐
    8 │ ((◷)Arrival 17:42)((⌖)Distance 95 m)((⁂)Steps ≈ 130)│ stat chips, pewter (tinted), 48 px, ring icons
   56 │                                        │
   64 │ ┌────────────────────────────────────┐ │  TURN CARD, dark glass (blurred), radius 24, min-height 104
      │ │ [↱]   Turn right at   ▮SIMULATION▮ │ │  arrow tile 52 px; verb 15/20 ink-2 + the amber 26 px pill
      │ │ 28 m  Oud House                    │ │  num-card under the tile; name title-l
  173 │ └────────────────────────────────────┘ │
  181 │ - - - - - - free area top - - - - - - -│
      │  ┌──────────────┐                      │  turn bubble (frost): box above its icon, anchored to the
      │ (◉)                                    │  ring beam top; horizon ≈ y 350
      │              ^ ^ ^  glowing path        │
  625 │ - - - - - - ╭─────(N)──────╮ - - - │  half-dome mini-map, dark glass (blurred), height 219
      │           ╭╯   map, you-dot     ╰╮      │  N chip centred on the rim line (half over the scene)
      │ (1)       │                      │      │  level chip 44 px in the dome's start corner
  760 │ (■End)(1× Speed) ( ▶ ) (› Next)(▦ Map)│  bar: one 64 px pewter capsule, labelled 56 px buttons, 72 px Play
  832 │                                        │
  844 └────────────────────────────────────────┘
```

Exact boxes at 390 x 844 (no safe-area insets; add `env(safe-area-inset-top)` to every top value and
`env(safe-area-inset-bottom)` to the dome height and bar offset):

| Element | x | y | w x h | Notes |
|---|---|---|---|---|
| Stat chips row | 12 | 8 | 366 x 48 | 3 equal columns (118 px each), gap 6, each with its 32 px ring icon |
| Level chip | dome, inline-start 14, 96 above the bottom | 704 | 44 x 44 | the lift-panel code ("1", "G", "B1": same in Arabic, LTR isolated), `aria-label` = level name; not interactive (a tap is the dome's) |
| Turn card | 12 | 64 | 366 x 109 (grows for a 2-line name or verb) | everything below moves with it |
| SIMULATION pill | inside the card, top-end corner (12 from its top) | 77 | auto x 26 | amber, 14 px caps; the note is in its accessible name |
| Free area | 0 | 181 | 390 x 444 | engine padding top 181, bottom 219 |
| Dome | 0 | 625 | 390 x 219 | `clamp(180px, 26dvh, 32dvh)` |
| Bottom bar | 12 | 760 | 366 x 72 | bottom 12; capsule 366 x 64 at y 764; side buttons 56 x 56 (y 768) |
| Mini-map content | dome | 625 to 760 (bar top) | | you-dot at y = 625 + 0.62 x (219 - 84) ≈ 709 |

### 7.2 Other sizes

| Size | Top HUD | Free area | Dome | Notes |
|---|---|---|---|---|
| 360 x 740 | chips 8-56, card 64-173 | 181 to 548 | 192 (26 %) | chips keep a 26 px ring (below) |
| 390 x 664 (browser tab) | **compact**: no chips row; card 16-140 with a summary line | 148 to 485 | 179 | `@media (max-height: 700px)` |
| 360 x 640 | compact, as above | 151 to 467 | 173 | |
| >= 600 wide | HUD column max 560 px centred; dome max 720 px wide centred | | `clamp(180px, 26dvh, 32dvh)` | |

Compact mode (height < 700 px): the stat chips row is removed and its content becomes one `caption` line inside the
turn card under the name: `hud.summary` "17:42 arrival · 95 m left" (Arabic «الوصول ١٧:٤٢ · متبقٍ ٩٥ م»; the steps
estimate is left out in compact mode); dome height `clamp(170px, 27dvh, 32dvh)`. The level chip stays in the dome.

Chips under 380 px wide (a 108 px chip at 360): a 26 px ring with a 16 px glyph, gap 5, padding 5 / 6, which keeps
"Distance" whole.

### 7.3 Pieces

**Stat chips** (ref 5): pewter tinted, 48 px, radius 24, padding 6 / 10. Icon: 32 px circle, raised fill, 2.5 px
ring in the chip colour + `0 0 12px -2px` glow in that colour, 20 px glyph in the chip colour. Text column: label
`chip-label` `--ink-2-light`, value `num-chip` `--ink`. `role="group"` `aria-label` `hud.summaryLabel`.
- **Arrival** (`--chip-arrival`, clock icon): wall-clock time now + remaining time at **1x walking speed** (not the
  sim speed), `HH:MM` 24 h in the venue's time zone (`Asia/Muscat`), Arabic-Indic digits in Arabic.
- **Distance** (`--chip-distance`, route-pin icon): metres left on the route, `formatDistance`.
- **Steps** (`--chip-steps`, footprints icon): `≈ ` + remaining metres / 0.75, rounded to 5 under 100 and to 10 above
  ("≈ 130", «≈ ١٣٠»). The "≈" is always shown: it is an estimate.

**Turn card** (ref 3): dark glass (blurred), radius 24, padding 12 / 16 (start 12), `display: flex; gap: 12`.
Start column 72 px: arrow tile 52 x 52, radius 18, `--primary-grad`, glyph 34 px `--on-primary`, glow
`0 0 22px -4px rgba(38,217,199,0.8)`; under it the distance: `num-card` value + unit `label` `--ink-2`. The tile shows
the step's icon (`stepIconName(step)`: turn arrows, escalator, lift, stairs; arrive: flag on the `--ok-grad` tile).
Text column: a head row with the verb line (`label` weight 400 `--ink-2`) and the **SIMULATION pill** floated at its
end (the card's top-end corner): a verb that needs a second line takes the full width there, the lines balanced
(`text-wrap: balance`); under 380 px wide a connector's verb drops its trailing "to" ("Escalator up" over "Level 1";
QA round 2: "to" sat alone on a second line). Then the name line `title-l` (max 2 lines, ellipsis), and for a ride
with a turn right after it the `then` line (`label` `--ink-2`: "then turn left at the top"; a lift shows it once you
ride, in place of the Press line). The card's top edge catches the warm amber light (a 14 px radial glow, above the
first text line) and has the bright frosted rim of 2.2.
Text per step kind:

| Step | Verb line | Name line |
|---|---|---|
| `turn` with landmark | `hud.verbAt` ("Turn right at") | landmark name |
| `turn` without landmark | level name ("Level 1") | `hud.turn.<turn>` ("Turn right") |
| `walk` | `hud.verbPast` ("Keep straight past") / no landmark: level name | landmark / `hud.turn.straight` |
| `connector` escalator | `hud.escalatorUpTo` / `hud.escalatorDownTo` | target level name |
| `connector` lift | `hud.liftTo` ("Take Lift A to") | target level name; plus a "Press “1”" `press-label` pill (not during the ride: the lift card shows it) |
| `connector` stairs | `hud.stairsTo` | target level name |
| `arrive` | `hud.arriveAt` | destination name |
| `start` | `hud.face` ("Face") | the landmark it names (else the next step's content) |

Distance = metres left to the current step's end point (`points[step.to]`), from the simulator (or the whole step
when no walk). The full `pick(step.text)` sits in a visually hidden `aria-live="polite"` span; the visible condensed
lines are `aria-hidden`. Step change: content slides up 12 px + fades (240 ms).

**SIMULATION label**: while walking, the amber **pill** in the turn card's top-end corner (`--amber` fill, `#1B1205`
ink, 14 px caps, 26 px tall, radius 13, glow `0 0 18px -6px rgba(255,159,85,0.9)`, `role="note"` with
`aria-label` "SIMULATION · Simulated walk, not your live position"). On Arrived (no turn card) the full **capsule**:
dark glass tinted, 36 px, radius 18, padding 4 / 12: the amber tag + `sim.notLiveShort` in `caption` `--ink-2`. The
note stays whenever it fits, **measured**, not by breakpoint (Arabic fits at 360 px); when it does not, the short
note `sim.notLiveTiny` ("Not live"), and only when even that does not fit, the tag alone. One of the two is always
visible in the Walk view, including over the lift card and on Arrived.

**Lift card** body: "Press “B1”" and, when the step has a turn right after the ride, `hud.pressThen` ("Press “B1”,
then turn left as you step out"; the stairs: the turn alone). Button codes are the lift-panel codes ("B1", "G", "1")
in both languages, left-to-right isolated in Arabic («اضغط «B1»»); the level names («مواقف ب١») stay names.

**Mini-map dome** (ref 5): Canvas2D from venue data (no engine needed; it works without WebGL).
- Shape: full width, `clip-path: ellipse(78% 100% at 50% 100%)` (the sides sit about 23 % of the height lower than the
  centre). Dark glass (blurred) under the canvas. Rim: 1.5 px `rgba(255,255,255,0.32)` + a 6 px `rgba(94,242,220,0.25)`
  blurred glow line; tick dots (r 1 px, `rgba(255,255,255,0.35)`) every 5.6° along the arc, 7 px inside the rim.
- **Heading-up**: the map rotates so the view direction points up (camera `headingDeg` from `onAnchors`, so the
  look-around drag turns the map too). Scale **3.2 px/m**. You-dot at the horizontal centre, at 62 % of the map
  content height (dome top to the bar's top).
- Draws (QA round 2: calm, the route the only saturated colour): walkable areas #5A6570 (they read as streets);
  units mix(#20272E, category colour, 0.12) (service / amenity units #2A323A; parking zones keep 0.35), 1 px
  unit edges `rgba(255,255,255,0.10)`; voids #0E1418 with a 1 px `rgba(255,255,255,0.18)` rail line; route on this
  level: glow 14 px #22D3C5 at 0.30 + core 5 px `--route`; walked part 4 px #9AA6B2 at 0.6; the parts on other levels
  are not drawn, the connector the route leaves by gets a 16 px teal ring; destination: 22 px `--dest` disc, 2 px
  white ring, dark flag glyph; car (same level): 22 px `--car` disc + car glyph; you: 18 px halo
  `rgba(77,163,255,0.22)`, 9 px white disc, 6.5 px `--you` dot, 60° cone radius 54 px (radial gradient
  `rgba(77,163,255,0.55)` -> 0) pointing up.
- A 70 px fade from the dome glass colour to transparent at the top of the map so it melts into the rim.
- **N chip**: 24 px white disc, "N" (Arabic «ش», `aria-label` `hud.northLabel`) at 14 px weight 600, ink #0B1218,
  centred **on the rim line** (half over the scene, outside the dome's clip, as in ref 5), at angle `-headingDeg` from
  the top, clamped to ±80° (beyond: pinned at the arc end with a 10 px outward chevron). QA round 2: inset in the map it
  covered the route ahead (heading-up: the route always runs to the top centre) and, on the last step, the
  destination disc.
- **Level chip** (44 px, the lift-panel code) in the dome's start corner, 96 px above its bottom.
- Canvas size = CSS size x min(devicePixelRatio, 2). Redraw only on: simulated walker move (coalesced to one per
  animation frame), camera heading change, resize, language, level change. Idle = no redraw.
- Under the bar the map fades into the dome glass (a 28 px gradient from 12 px above the bar's top), so nothing busy
  sits behind the buttons.
- The dome is a button: tap = **Map** (`aria-label` `hud.openMap`), but only a look: unlike the bar's Map button it
  does not make "Simulate walk" stay on the map for the rest of the trip (7.5). Pointer taps in the bar's strip (from
  16 px above the bar's top down to the screen edge) are near misses of the bar and are ignored.

**Bottom bar** (ref 5): over the dome, `inset-inline: 12px`, bottom `12px + safe-area`, 72 px tall: one 64 px pewter
tinted **capsule** (radius 32) behind two side groups (gap 4) and the centre Play standing out of it. Side buttons
are 56 x 56, transparent on the capsule (pressed: 12 % white), an icon over a 14 px label (`--ink`). The whole bar
takes taps (`pointer-events: auto`): a near miss of a button never reaches the mini-map under it.

| Slot (LTR order) | Control | Size | Look | Action |
|---|---|---|---|---|
| start 1 | **End** (stop square ■ + `hud.end` "End") | 56 | on the capsule | end the whole route (v0.1 `onEnd`, 5 s Undo); never a ✕, which reads as "close this view" |
| start 2 | Speed "1×" + `sim.speed` "Speed" | 56 | on the capsule, value 17 px 600 | cycles 1× / 2× / 4×, `aria-label` `sim.speedNow` |
| centre | **Play / Pause** | **72 round** | `radial-gradient(circle at 50% 35%, #8BFBE6 0%, #2CE5C8 45%, #12A99A 100%)`, inner 1 px white 50 % rim, `0 0 0 6px rgba(38,217,199,0.18)`, `0 0 36px rgba(38,217,199,0.65)`; glyph 30 px #04211C | the one primary action |
| end 1 | Next (›, flips in RTL) + `nav.next` | 56 | on the capsule | `onNext`. On the last step: **Arrived** (a mint check + `hud.arrived`, `aria-label` `arrived.title`), the map sheet's "You've arrived": it ends the walk there (not the primary style: Play stays the one primary action) |
| end 2 | **Map** (layers icon + `hud.openMap`) | 56 | on the capsule | back to the last map view (default Floor, following the walker) |

Replay icon on Play when the walk is done; the Play label follows `sim.walk` / `sim.pause` / `sim.resume` /
`sim.replay` as `aria-label`.

### 7.4 RTL (Arabic)

- **Mirror the layout**: chips order (Arrival at the right), the dome's level chip (at the right), turn card (arrow
  column at the right, the SIMULATION pill in its top-left corner), bubble box grows toward the left of its icon, bar slots (End at
  the right, Map at the left), the Next chevron points left.
- **Never mirror**: turn arrows (tile and bubble icon follow the walking direction), the mini-map, the compass, the
  you-cone, the 3D scene, the off-screen edge pill side (it points where the target really is), painted bay codes.

### 7.5 Map-view navigate screen (v0.1 step sheet, restyled)

The v0.1 step card stays (step text, meta, progress, Back / Next, simulator row) in a dark glass sheet (section 8),
plus one addition: a floating **"Walk view"** pill (pewter blurred, 56 px, eye icon + `view.fpv` label, `label`
type) at the map's inline-end bottom corner, 12 px above the sheet; the App adds its rect to `setScreenObstacles`.
The View menu also gets a 4th row **Walk view** (only while a route is shown: navigate and arrived). Pressing
"Simulate walk" in a map view opens the Walk view and plays there (the Walk view is the default view of the simulated
walk); the bar's **Map** button goes back to the overhead map and the walk keeps playing there, following the walker.
Once the shopper has chosen the map during a trip (the bar's or Arrived's Map button, or the View menu; a tap on the
mini-map is only a look), "Simulate walk" plays in the map view for the rest of that trip (a new route resets it).
The sheet's footer pins Next / Back and the simulator block ("Simulate walk" + speed), so the Walk view entry never
scrolls away or gets cut by the sheet edge; a long step text scrolls above them with the soft edge as the cue. Sheet
height: under 47 % of the screen (Arabic 49 %, its lines run taller), 52 % / 53 % at or under 760 px tall, 54 % / 57 %
under 700 px. Without 3D (no WebGL) it always plays in the map view. Switching views never stops or
restarts the walk.

### 7.6 What the UI sends the engine in the Walk view

- `setView({ mode: 'fpv' })` on entry; on exit the previous map mode with `fit: 'none'`.
- `setViewportPadding({ top: freeTop, bottom: domeHeight, left: 0, right: 0 })` and `setScreenObstacles` with the HUD
  rects (chips, card, dome bounding box, bar), whenever they change size. On Arrived: top = the SIMULATION row's
  bottom + 8, bottom = the Arrived sheet's top (the arrival framing fits above it, 6.3).
- `setNextTurn(...)` whenever the current step changes: the end point of the current step (`points[step.to]`; for a
  connector step `points[connector.boardIndex]`; while riding an **escalator**: the exit stop, where you step off; a
  lift or the stairs keep the boarding stop until the step changes at the exit), `label` = the bubble title, `kind` =
  turn / connector / arrive; `null` on Arrived (in the Walk view the engine then counts the whole route as walked and
  stands the mint target ring at the doorstep, 5.7, 5.8).
- `setPathAnimating(playing, { flowMps: 1.2 * speed + 0.6 })` on play, pause, speed change, done.

---

## 8. Every other screen, restyled to glass

All sheets: dark glass, radius 28 on all corners, floating 12 px from the sides and the bottom (plus safe area),
padding 16 (20 from 390 wide), handle 40 x 5 `rgba(255,255,255,0.28)`. Sheet maximum heights stay as in v0.1
(the map stays visible). Inside sheets, controls are **raised** glass.

- **Header** (map views only; hidden in the Walk view): dark glass capsule, radius 28, 64 px. Brand mark: 44 px raised
  circle with the pin glyph in `--teal-text`. Venue name `body` 500 / 16 px `--ink`. Badge "PROTOTYPE · SIMULATION":
  `caps` on `--amber`, ink #1B1205, pill. Language button: 56 px round pewter, 18 px 600 (Arabic glyph 26 px).
- **View switcher**: 56 px pewter pill (icon + name, `label` 500). Menu: dark glass popover, radius 24, 56 px rows,
  raised fill on the active row with a `--teal-text` check. Rows: Overview, Floor, 2D, Walk view (route only).
- **Level picker**: pewter capsule 56 px wide, radius 28; buttons 56 px hit / 48 px circle; active = near-white
  `rgba(255,255,255,0.94)` circle with #0B1218 ink (17.2:1); route-level dot = 8 px `--route` with a soft glow.
  Hidden in the Walk view (the level follows the walker; the level chip shows it).
- **Home**: you-are-here chip = raised row, radius 24: 14 px blue dot (`--you`, white 3 px ring, `0 0 14px` blue
  glow, the existing pulse), text `body-l` 500 + `caption` `--ink-2-raised`. "Change" = a raised pill inside the
  raised chip (never pewter inside a sheet: no blur nesting) with the scan icon and `--ink` text only (raised on
  raised over white = #6D7378: 4.81:1 for #FFFFFF but 3.72:1 for `--ink-2-raised`); icon-only under 380 px. Search:
  raised pill 56 px, search icon `--ink-2-raised`, placeholder `body-l` `--ink-2-raised`. **Six tiles**: raised, radius 22,
  min-height 84, icon disc 44 px round in the tile colour with a 2 px `rgba(255,255,255,0.18)` ring and
  `0 0 16px -4px` glow in its colour, white glyph; label `label` 500 `--ink`. **Save my car**: raised row, radius 24,
  44 px amber car disc (#F5B700, dark glyph), `body-l` 500; with a saved car the zone swatch disc and the painted code.
  Disclaimer `caption` `--ink-2` centred.
- **Search results**: search field raised pill at the top; rows on the sheet glass with 1 px
  `rgba(255,255,255,0.08)` separators; row icon 40 px round category disc; title `body-l` 500; sub `caption`
  `--ink-2`; level badge = raised pill `caption` 600; walking minutes at the row end as **light numerals**
  (`num-chip` 300 at 20 px + "min" `caption`).
- **Place**: back = 44 px raised round; title `title`; category chip = solid category colour pill, white text and
  icon (>= 4.95:1 on every category; kids #0E7C86 is the lowest); level `body-l` `--ink-2`. **Minutes**: `num-hero` 300 value + unit `body-l`
  `--ink-2` ("2" + "min walk"; Arabic «٢» + «د مشياً»), distance `num-card` 300 `--ink-2` beside it, hours line
  `--mint-text` / `--danger-text` with a clock icon. `aria-label` keeps `formatDuration` ("about 2 min"). Step-free
  switch row raised; switch track `rgba(255,255,255,0.22)`, knob white, on = `--route` track with dark knob.
  **GO**: 64 px full-width pill, `--primary-grad`, `--on-primary`, `button` 22/28, `--primary-glow`.
- **Navigate (map views)**: step progress segments 6 px tall, radius 3: upcoming `rgba(255,255,255,0.18)`, done
  `rgba(94,234,212,0.45)`, current `--route` with `0 0 10px rgba(44,229,200,0.8)` (the "glowing point" of ref 1).
  Turn icon tile = the same 52 px primary tile as the Walk view card. Step text `headline`. Back = 56 px raised;
  Next = primary pill. Simulator row: SIMULATION tag + note, "Simulate walk" raised pill, speed segmented control =
  raised track, near-white thumb with dark ink. ✕ end = 44 px raised round.
- **Arrived**: hero block radius 24, fill `rgba(91,229,132,0.12)`, rim `rgba(91,229,132,0.28)`; check disc 72 px
  `radial-gradient(circle at 40% 35%, #8BF5A8, #2FB866)` dark glyph, glow `0 0 24px -4px rgba(91,229,132,0.8)`;
  "You've arrived" `label` 600 `--mint-text`; name `title-l`; level `caption`. "Simulated arrival, not your live
  position" `caption` `--ink-2` centred. **Found it** = 64 px `--ok-grad` pill, ink #03200F. Back to my car / Another
  shop = 48 px raised pills. In the Walk view the Arrived sheet replaces the dome and the bar; the SIM capsule stays at
  the top with a 56 px pewter **Map** button at its inline-end.
- **Car card**: raised card radius 24. **Zone block** = the zone colour exactly, flat (it must match the paint, and
  any white sheen or dark shade would push some zones under AA: teal #00838F with white text is only 4.52:1); the
  glass feel comes from a 1 px inner top highlight line `rgba(255,255,255,0.35)` above the text and the card's rim.
  Text in the zone's `fg` (v0.1 `textOn`: white or dark, whichever passes; gold #B8860B and orange #E65100 take dark
  ink). Zone icon 56 px in a white-rimmed rounded square. Body: "Bay"
  `caption` `--ink-2` + code `bay-code` `--ink` (LTR isolate), level `num-card` at the end. "Saved at 17:30"
  `--amber-text`. **Take me there** = primary 64 px pill. Change spot / Forget my car = raised pills.
- **Scan sheet**: rows grouped by level with `caps` section labels `--ink-2`; plate code = raised pill, tabular, LTR;
  hint `caption`. Map pins of the plates as v0.1.
- **Toasts** ("Now on Level 1", "Route ended · Undo"): pewter blurred pill, 56 px, centred under the header (map
  views) or under the turn card (Walk view); level chip = white circle with dark ink; Undo = 44 px raised pill, `--ink`.
- **No-3D notice**: dark glass card radius 24 above the sheet, `body-l`.
- **Loading / error screens**: storm backdrop + a dark glass card; "Try again" primary pill.

---

## 9. Motion

| Token | Value |
|---|---|
| `--ease` (standard) | `cubic-bezier(0.2, 0, 0, 1)` (unchanged) |
| `--ease-emph` | `cubic-bezier(0.3, 0, 0, 1)` |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` |

| What | Duration / rule |
|---|---|
| Button press | scale 0.97, 100 ms |
| Sheet in | 320 ms: translateY 24 px -> 0 (`--ease-emph`), the sheet's content fades 0.6 -> 1 (never animate `opacity` on the blurred sheet itself); sheet swap 220 ms |
| Popover (view menu) | 180 ms scale 0.96 -> 1 + fade, from its control |
| Toast | in 240 ms (8 px drop + fade), out 200 ms (`--ease-exit`) |
| Map camera flights | 1200 ms (v0.1), step flights 900 ms while following |
| Walk view dive / rise | 1100 ms / 1200 ms |
| Walk view follow | position τ 120 ms, heading τ 250 ms, yaw cap 90°/s |
| Step glide (no walker) | 900 ms |
| Arrival framing | 900 ms |
| Escalator pitch ease | 600 ms |
| Lift / stairs card | fade in 240 ms, hold >= 600 ms, fade out 320 ms |
| Chevron flow | `flowMps = 1.2 · speed + 0.6` m/s (1.8 at 1x, 3.0 at 2x, 5.4 at 4x), only while playing |
| Ring ripple | 1.6 s period, only while playing |
| Turn card step change | 240 ms slide-up 12 px + fade |
| Bubble | position: per rendered frame, no CSS transition on transform; content change 200 ms crossfade + 8 px rise; box fade 160 ms near the turn |
| Numbers | no tweening (tabular figures, they just update) |

**When nothing animates**: home, search, place, car, scan, arrived and any paused walk: the engine renders 0 frames
and the only CSS animation is the v0.1 you-are-here pulse (off under reduced motion). No breathing glows, no
looping shimmer, no animated backdrop. The sky is static (it moves only with the camera).

**Reduced motion** (`prefers-reduced-motion: reduce`): flights, dive, rise, glide and arrival = cut or 150 ms
crossfade; chevrons and ring static; sheets and toasts fade only (120 ms); the bubble does not rise; lift card swaps
instantly; the you-are-here pulse is off (`display: none !important`, and MapView does not place it: its position
lives in the animation's keyframes, so a cut-short animation left it at the top-left corner).

---

## 10. Acceptance checklist (visual)

Verifiers use the 390 x 844, 360 x 740, 390 x 664 and 360 x 640 shots in English and Arabic, plus the probes below.
Every item must pass.

Look
1. Storm backdrop behind the model in Overview, Floor and 2D: slate gradient, visible procedural clouds, warm amber
   glow above the middle of the map; parking levels: cool blue glow, no amber. No banding steps visible.
2. The CSS backdrop before the engine loads matches the engine's sky (no colour jump): between a shot with the engine
   chunk blocked and the loaded shot, the mean colour of the map area above the sheet differs by less than 16 per
   channel, and the amber glow sits in the same place (clouds are the only difference).
3. Every panel is glass: model shapes visibly blurred behind sheets, 1 px light rim, top highlight, radius 28, sheets
   float 12 px from the sides and the bottom. No opaque bands inside a sheet (scroll area, footer).
4. Architecture reads cool grey with light wall-top rims; shop signs keep recognisable category colours with white
   text; floors show a soft sheen toward the far side.
5. Path = teal-green glow with brighter rims and white chevrons; never the v0.1 blue (style `storm`); the
   `?style=classic` link shows the v0.1 look unchanged.

Contrast (probe): inject `.map-layer canvas{visibility:hidden} .map-layer{background:#fff!important}` and take the
shots again: every text pixel sample against its local background >= 4.5:1 (body) / 3:1 (>= 24 px). Then inject
`#000` for the frost bubble probe. Run the same with `backdrop-filter: none !important` on everything (fallback
path must also pass).

Walk view
6. `?screen=navigate&to=occ-muttrah-kitchen&view=fpv` opens the Walk view: eye height 1.6 m, horizon at y 350 ± 10 px
   (390 x 844), corridor with storefronts, bulkheads up to a ceiling with light panels, glossy floor; the path runs
   ahead and fades out toward 60 m; no part of the ribbon floods the bottom (near fade).
7. HUD boxes match 7.1 / 7.2 within ±4 px; nothing overlaps (chips + level chip, card + SIMULATION pill, bubble, dome, bar); the bubble's
   icon centre is within 6 px of the projected ring-beam top; the bubble box never covers the top HUD or the dome.
8. SIMULATION pill (walking) or capsule (arrived) visible in every Walk view shot (playing, paused, lift card, arrived).
9. Idle: paused for 2 s, `engine.getStats().totalFramesRendered` does not change and `onAnchors` is not called.
   Playing: frames advance and two shots 500 ms apart show the chevrons moved; paused shots 500 ms apart are
   identical.
10. `simT` in mid-escalator: the camera is on the ramp between floors, looking up, the upper floor's rails ahead, no
    slab or ceiling cut through the view, no lift card. `simT` in a lift ride (step-free route to the car): the lift
    card shows "Press “B1”" (the turn card above it names the lift and level) and the SIMULATION pill above it.
11. Arrival in the Walk view: the shop sign faces the camera (horizontal within ±3°), both sign lines readable, ring at
    the doorstep visible above the Arrived sheet, Arrived sheet in glass.
12. Mini-map: heading-up (route ahead points up), you-dot at 62 % of the map height, N chip on the rim, destination
    flag, no labels except the N; tapping it opens the map.
13. Arabic: layout mirrored per 7.4, turn arrows identical to English, compass and map not mirrored, Arabic-Indic
    digits everywhere except painted bay codes.

Everything
14. All controls >= 44 px, primary buttons >= 56 px, Play 72 px; no text under 14 px; no text directly on the 3D. No
    sheet content cut by the sheet's edge (it fits, or it scrolls above a pinned footer with the soft edge as the cue).
15. One primary action per screen (GO, Next, Play, Found it, Take me there).
16. Reduced motion emulated: no chevron flow, cuts instead of flights (the rise out of the Walk view included).
17. `npm test` passes (112+), `npm run validate:venue` passes, `npm run build` passes inside every budget, the
    screenshot script reports no console errors and no non-localhost requests, fonts load only from the app's origin.

---

## Appendix A: strings to add to `src/i18n/strings.js`

Arabic values contain Arabic letters only (no Latin, no ASCII digits: the i18n test enforces it); numbers are
inserted through placeholders and formatted with `toArabicDigits`.

| Key | English | Arabic |
|---|---|---|
| `view.fpv` | Walk view | منظور المشي |
| `hud.openMap` | Map | الخريطة |
| `hud.end` | End | إنهاء |
| `hud.summaryLabel` | Trip summary | ملخص الرحلة |
| `hud.arrival` | Arrival | الوصول |
| `hud.distance` | Distance | المسافة |
| `hud.steps` | Steps | الخطوات |
| `hud.summary` | {time} arrival · {distance} left | الوصول {time} · متبقٍ {distance} |
| `hud.turn.straight` | Keep straight | تابع مباشرة |
| `hud.turn.slight_left` | Bear left | انحرف يساراً |
| `hud.turn.slight_right` | Bear right | انحرف يميناً |
| `hud.turn.left` | Turn left | انعطف يساراً |
| `hud.turn.right` | Turn right | انعطف يميناً |
| `hud.turn.uturn` | Turn around | استدر للخلف |
| `hud.verbAt` | {verb} at | {verb} عند |
| `hud.verbPast` | {verb} past | {verb} بجانب |
| `hud.andStraight` | and {distance} straight | ثم {distance} مباشرة |
| `hud.thenArrive` | then you arrive | ثم تصل |
| `hud.face` | Face | اتجه نحو |
| `hud.arriveAt` | Arrive at | الوصول إلى |
| `hud.escalatorUp` | Escalator up | السلم المتحرك صعوداً |
| `hud.escalatorDown` | Escalator down | السلم المتحرك نزولاً |
| `hud.escalatorUpTo` | Escalator up to | السلم المتحرك صعوداً إلى |
| `hud.escalatorDownTo` | Escalator down to | السلم المتحرك نزولاً إلى |
| `hud.stairsUp` | Stairs up | الدرج صعوداً |
| `hud.stairsDown` | Stairs down | الدرج نزولاً |
| `hud.stairsTo` | Stairs to | الدرج إلى |
| `hud.liftTo` | Take {name} to | استقل {name} إلى |
| `hud.toLevel` | to {level} | إلى {level} |
| `hud.liftRide` | {name} → {level} | {name} إلى {level} |
| `hud.stairsRide` | Stairs → {level} | الدرج إلى {level} |
| `hud.side.left` | on your left | على يسارك |
| `hud.side.right` | on your right | على يمينك |
| `hud.side.ahead` | straight ahead | أمامك مباشرة |
| `hud.side.behind` | behind you | خلفك |
| `hud.behind` | The turn is behind you | المنعطف خلفك |
| `hud.north` | N | ش |
| `hud.northLabel` | North | الشمال |
| `hud.then.left` / `.right` | then turn left / right | ثم انعطف يساراً / يميناً |
| `hud.then.slight_left` / `.slight_right` | then bear left / right | ثم انحرف يساراً / يميناً |
| `hud.then.uturn` | then turn around | ثم استدر للخلف |
| `hud.where.top` / `.bottom` / `.out` | {turn} at the top / at the bottom / as you step out | {turn} في الأعلى / في الأسفل / عند الخروج |
| `hud.pressThen` | {press}, {then} | {press}، {then} |
| `hud.arrived` | Arrived | وصلت |
| `sim.notLiveTiny` | Not live | ليس مباشراً |

New formatters next to `formatDistance` (pure, unit-tested by the UI builder):
`formatClock(epochMs, lang, timeZone)` -> "17:42" / «١٧:٤٢» (24 h); `formatSteps(metres, lang)` -> "≈ 130" /
«≈ ١٣٠»; `formatMinutesParts(seconds, lang)` -> `{ value: '2', unit: 'min' }` / `{ value: '٢', unit: 'د' }`
(under a minute: `'<1'` / `'<١'`).

## Appendix B: URL hooks and screenshot scenarios to add

Hooks: `view=fpv` (Walk view; with `screen=navigate|arrived`), `style=classic|storm` (engine style, default storm).
Existing hooks (`simT`, `play`, `step`, `lang`, ...) work in the Walk view.

Scenarios for `scripts/screenshots.mjs`: `fpv-start-en` (`screen=navigate&to=occ-muttrah-kitchen&view=fpv`),
`fpv-sim-t20-en` (`...&simT=20`), `fpv-escalator-ar` (`...&lang=ar&simT=45`), `fpv-lift-en`
(`screen=navigate&to=bay-B1-043&car=bay-B1-043&stepFree=1&from=A-L1-C3&view=fpv&simT=<inside the lift ride>`),
`fpv-arrived-en` (`screen=arrived&to=occ-muttrah-kitchen&view=fpv`), `fpv-start-ar-360` (360 x 740),
`fpv-sim-t20-en-390x664`, `fpv-sim-t20-ar-360x640`, `home-en-classic` (`style=classic`), plus every v0.1 scenario
re-shot in storm. QA round 2 adds `fpv-start-ar-360`, `fpv-escalator-en-360`, `fpv-laststep-en` (`...&step=6`: the
bar's Arrived), `fpv-arrived-abaya-en` (a shop facing the atrium void) and `fpv-lift-ar-360`.
