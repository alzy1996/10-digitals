# OFM Logistics Academy (`ofm-academy`)

The real product from the PRD: a bilingual, deterministic training simulator for
the whole Oman Flour Mills logistics chain — not the arcade.

**Every job in this company is logistics.** The campaign teaches the whole chain
to everyone, with role-specific depth per chapter, rather than siloing people
into a game each.

```bash
npm install
npm run dev        # local dev server
npm test           # 61 tests: determinism, clock, rules, replay, levels, content, ranks
npm run typecheck
npm run build      # production build -> dist/
```

## What works today

**24 levels across all 10 chapters**, every one playable in English and Arabic.
Every persona in PRD §2.1 now has levels, and every learning objective L01–L18
that does not require a 3D zone is covered.

| Ch | Levels | Persona |
|---|---|---|
| 0 | 0.2 The Language of the Mill | All |
| 1 | 1.1 Read the SO · 1.2 Code Breaker · 1.3 MT to Bags · 1.4 The Deadline · 1.5 The Ghost SO | Delivery Clerk |
| 2 | 2.1 Raw Material Check · 2.5 The Dispatch Handshake | Production Clerk |
| 3 | 3.2 The Scale · 3.3 400 Free Kilos | Packing Supervisor |
| 4 | 4.2 FIFO | Forklift Operator |
| 5 | 5.5 Gross and Net · 5.6 The Paper Chain | Delivery Clerk |
| 6 | 6.1 Bagged or Bulk · 6.3 Contract Board · 6.4 Sohar Poultry · 6.5 Not My Lane · 6.6 No Contract · 6.7 The Ferry | Delivery Clerk |
| 7 | 7.2 Inbound Weighbridge | Receiving |
| 8 | 8.2 Labour Forecast · 8.5 Leave Chain · 8.6 Ghost Hour | Shift Supervisor |
| 9 | 9.1 The Full Shift | All (exam) |

The two levels the PRD rates highest are both built:

- **3.3 "400 Free Kilos"** — running the line at 25.4 kg over 1,000 bags gives
  away exactly 400 kg, which a test asserts, against the confirmed
  ~OMR 18,000/yr per line.
- **6.4 Sohar Poultry** — both carriers genuinely hold a contract and the tipper
  is the *dearer* one, so price is not the tell. Premix is bagged, so only the
  flat bed can carry it. The level then asks **why**, and only "cargo form"
  scores: the right carrier for the wrong reason still fails, because that
  reason breaks on the next order.

Progress, ranks and badges persist locally, and a chapter pass produces a
printable certificate with a deterministic verification code.

## Architecture

The three-layer separation is a hard rule (PRD §6.1), not a preference:

```
INPUT (commands) -> SIMULATION (pure, deterministic, 20 Hz) -> PRESENTATION (reads only)
```

- **`src/sim/`** imports nothing from React or the DOM. Fixed 20 Hz tick. All
  randomness comes from a seeded PRNG — no `Math.random()`, no `Date.now()`.
- **`src/content/`** holds every string and every world value. There is no
  hardcoded copy in components, and `strings.ar.ts` is typed against
  `strings.en.ts`, so a missing Arabic translation fails the build.
- **`src/levels/defs.ts`** holds pure level definitions; `views.tsx` renders them
  and submits commands. Views never mutate sim state.
- **`src/state/ui.ts`** is Zustand for UI only. Simulation state never enters it.

### Why determinism is load-bearing

Because a run is `seed + commands`, a full replay is **568 bytes** measured, not
the ~5 KB the PRD budgeted. That single property gives Mistake Replay, Ghost of
the Expert, trainer review and Incident Court for free, and thousands of replays
cost effectively nothing on the Firebase free tier.

`test/replay.test.mjs` asserts that a recorded run replays to an identical score
and ledger. If that test ever fails, something in `sim/` reached for wall-clock
time or unseeded randomness, and every replay feature is quietly wrong.

### Rules are data

Business rules live in `src/content/world/rules/*.json` (PRD §6.5), so Sam can
correct one without a developer:

```json
{
  "id": "R-TRUCKTYPE-01",
  "when": { "cargoForm": "bag" },
  "require": { "truckType": "flatbed" },
  "onViolation": { "severity": "hard", "costOMR": 90, "messageEn": "...", "messageAr": "..." }
}
```

The same file can later drive real Smart Fleet validation. One truth, two products.

## Data honesty

Per the anti-hallucination rule (PRD §0.3), the game never invents a product
name, customer, route or rate.

**Confirmed and used:** the 16 core Bühler codes, the real customers and
destinations, the transporter contract table and rates, 25 kg bags / 40 bags per
MT, the OMR 4/head labour rate.

**Deliberately absent:** product names and ERP codes are `null` in
`products.feed.json` and the UI shows codes only, because the Smart Fleet v5.1
export has not landed. A test asserts no name is ever invented while
`needsConfirm` is set. Transporter **phone numbers are not in client JSON at
all** — a test greps for phone-shaped strings.

**Placeholders, badged on screen:** the Bühler timezone is modelled as a fixed
CET offset; whether it follows European DST is unconfirmed (PRD §14 Q5).
Anything unconfirmed renders a `TODO_CONFIRM` badge rather than reading as fact.

### The ghost hour

The clock models the trap directly: at **01:30 Oman time the mill files the
record under the previous production day**, because Bühler runs on Germany time.
`test/sim.test.mjs` asserts exactly that case, and the rollover hour is derived
from the configured offset rather than hardcoded, so confirming the offset is a
one-line change.

## What is not built yet

Honest list, so nobody plans against a promise:

- **Firebase**: auth, Firestore progress/attempts, offline persistence and QR
  certificate verification. `src/data/progress.ts` defines the repository seam
  and ships a local implementation behind it, so swapping in Firestore means
  implementing one interface — but there is no Firebase project or credentials
  yet, so none of it is wired or tested against a live backend.
- **3D zones** (R3F + Rapier) and the levels that need them: forklift driving
  (4.1), feed-the-line (4.6), the yard boss level (5.8). The arcade's
  `game3.html` covers the forklift/HSE ground in the meantime.
- **Audio and Arabic voice-over.** Critical for low-literacy learners per the
  PRD, and not startable without recordings or a TTS budget.
- **The remaining 29 levels** of the 53-level target — mostly depth within
  chapters that already have levels, not new mechanics.
- **Scenario Studio, Digital Twin import, trainer dashboards** (PRD Phase 6).

The engine, content layer, rules, replay, bilingual shell and progression are
all in place, so the rest is content and integration on a working base rather
than new architecture.
