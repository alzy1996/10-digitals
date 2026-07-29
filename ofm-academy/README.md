# OFM Logistics Academy (`ofm-academy`)

The real product from the PRD: a bilingual, deterministic training simulator for
the whole Oman Flour Mills logistics chain — not the arcade.

**Every job in this company is logistics.** The campaign teaches the whole chain
to everyone, with role-specific depth per chapter, rather than siloing people
into a game each.

```bash
npm install
npm run dev        # local dev server
npm test           # 26 tests: determinism, clock, rules, replay, content
npm run typecheck
npm run build      # production build -> dist/
```

## What works today

Chapter 0 and Chapter 1 are playable end to end, in English and Arabic:

| Level | Title | Teaches |
|---|---|---|
| 0.2 | The Language of the Mill | 30 core terms, EN ↔ AR |
| 1.1 | Read the SO | Customer, code, MT, bags, deadline |
| 1.2 | Code Breaker | The 16 core Bühler codes — 716 is not 715 |
| 1.3 | MT to Bags | ×40 until it is reflex |
| 1.4 | The Deadline | Sequence by slack, not arrival — includes the ferry leg |
| 1.5 | The Ghost SO | Cross-check the system against reality, and report the bug |

The other eight chapters appear on the map marked "not built yet". That is
deliberate: the map shows the whole chain so every role can see where their work
sits, and unbuilt levels say so instead of implying the product is finished.

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

- Chapters 2–9 (Mill Floor, The Bag, Warehouse, Yard, The Road, Receiving, The
  Shift, Final Exam) — including the two the PRD rates highest: the overfill
  reveal (~OMR 18,000/yr per line) and the Sohar Poultry routing trap.
- Firebase: auth, Firestore progress/attempts, offline persistence,
  certification and QR verification. Progress is currently session-local.
- 3D zones (R3F + Rapier), audio, Arabic voice-over.
- Scenario Studio, Digital Twin import, trainer dashboards.

The sim, content, rules, replay and bilingual shell are all in place, so the
remaining chapters are content and views on top of a working engine rather than
new architecture.
