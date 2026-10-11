# Dallni (دلّني): project memory for Claude Code

Indoor mall navigation and find-my-car product by **10 Digital** (Sam Ubi, Muscat). Work happens on branch
`claude/mall-navigation-mapping-app-ioijj1` (draft PR #4).

## Files
- `PLAN.md`: the master plan, v1.1. **§19 overrides earlier sections.** It covers the honesty box, positioning, the map, find-my-car, design, architecture, free tier, pricing, go-to-market, PDPL, the roadmap and the Step 0 questions.
- `prototype/`: a working prototype, version 0.4 "real mall" (built 2026-10-11; v0.3 "toy world" is its Light look; v0.2.1 was approved by Sam).
  - **What it is:** a 3D mall map and navigation simulator on a FICTIONAL small Muscat mall.
  - **Stack:** React 18.3.1, Vite 8, Tailwind 4, plain three.js 0.186.1 and troika-three-text. No React Three Fiber.
  - `prototype/README.md`: how to run, build and deploy to Firebase Hosting.
  - `prototype/CONTRACT.md`: module boundaries and the engine API, including §3b (Walk view).
  - `prototype/DESIGN-GLASS.md`: the v0.2 frosted-glass design tokens and the Walk view layout.
  - `prototype/DESIGN-REAL.md`: the v0.4 real-mall surfaces, CC0 assets, light, bloom and fascias (the default).
  - `prototype/DESIGN-TOY.md`: the v0.3 toy-world palette, light rig, shadows, quality levels and UI tokens (the Light look).
  - `docs/superpowers/specs/` and `docs/superpowers/plans/`: the v0.3 design spec and its implementation plan.
- Live demo (Claude artifact): https://claude.ai/artifact/11qH3qSbt8ac3qdzLfUm64.

## Commands (run in `prototype/`)
```
npm install
npm run dev               # LAN URL works on a phone on the same Wi-Fi
npm test                  # vitest, 317 tests
npm run validate:venue    # venue data checks
npm run build             # vite build + load-budget check (fails if over budget)
npm run gen:venue         # regenerate public/venues/demo-muscat/venue.json
npm run shots -- <url>    # headless screenshots; locally: npm i --no-save playwright && npx playwright install chromium
```
- **Budgets are tight:**
  - first screen: 109.5 of 110 KiB;
  - `scene3d`: about 57.8 of 60 KiB (raised from 52 in v0.3, reported to Sam);
  - real assets: about 1511 of 3072 KiB (v0.4).
- Trim code before adding features. Never raise a budget without telling Sam.

## Sam's rules (follow strictly)
- **Style:** call him Sam, no fluff, short bullets, complete code. Always give setup steps covering every click.
- **New builds:**
  - Step 0: ask the discovery questions ONE AT A TIME and wait after each.
  - Summarise the answers, then ask "CONFIRMED?".
  - Phases 1–5 follow, with a stop for "APPROVED" after each.
- **MODIFY rule:** when Sam says modify, change only the named item.
- **Stack:** React 18, Vite, Tailwind, Firebase, free tier only. Be honest about anything paid.
- **Never:**
  - OCR;
  - localStorage for real data;
  - CDNs or Google Fonts at runtime;
  - secrets in code.
- **Every screen:**
  - Arabic (RTL) and English;
  - mobile-first;
  - buttons at least 56 px, nothing tappable under 44 px;
  - readable contrast;
  - one primary action.
- **Honesty:** the walker / Walk view is a SIMULATION and must stay labelled that way. A free web app has no live blue dot on iPhone; real AR needs native code or a paid service (PLAN §4, §5, §19).

## Status (2026-10-10)
**Step 0 answers so far:**
- Q1: Mall of Oman, as the showcase and long-term target.
- Q1b: no contact at Mall of Oman or MAF yet.
- Option A assumed: Muscat Grand Mall is the paid pilot, Mall of Oman the showcase. Sam has not objected.
- "Simulate walk" opens Walk view automatically: YES (built).

- Q1d: Sam knows **nobody** at any mall (answered 2026-10-10; do not ask again).
- After v0.3, Sam asked for a "realistic game" look plus features that make malls accept the product. That became
  three projects: A realistic look (done: v0.4 "real mall"), then B Mall Value demo (dashboard, offers, emergency,
  Ramadan hours, kiosk, facilities), then C pitch kit.
- 3D direction: Sam picked **"Bright Toy Game"** from three live mocks. v0.3 was built on 2026-10-11 under "complete
  it": toy 3D, soft shadows, quality levels and a bright game UI (D3, the UI choice, was made by Claude; Sam can switch).

**Next question to ask (one at a time):**
1. The remaining questions in PLAN §19 / §17:
   - hosting for the pilot;
   - Firestore region;
   - GitHub Actions as the only server;
   - brand;
   - who traces the map;
   - the hourly cost;
   - React version;
   - whether there is a Mac / developer accounts;
   - which digits to use;
   - the short domain;
   - budget.
2. After the last answer: a one-paragraph summary → "CONFIRMED?" → Phase 1 (architecture, data model and file structure, text only).

**Open polish:**
- On navigate with the sheet at full, the start dot can sit at the sheet's edge after the re-fit (`refitAfterSnapRef` in `prototype/src/App.jsx`).
- Low items: scroll chaining when the body can't scroll at full; an overview label collapsing to codes at peek; the level-picker chevron overlapping the active level when only 2 levels fit.
