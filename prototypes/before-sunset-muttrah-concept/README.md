<!-- PROTOTYPE - NOT FOR PRODUCTION -->
<!-- Question: fair, learnable deduction + deliberate cats + story, in a 2.5D run -->
<!-- Date: 2026-11-03 -->
# Before Sunset: Muttrah - concept prototype (v2)

**Status:** in-progress (built, not yet playtested)

v1 was a flat top-down map where an orange chalk X meant "trap." It was rejected: weak puzzle,
static/random cats, no story, wrong (flat) view. v2 rebuilds around **one throughline: light = safety.**

## The one rule under test

> **"A lit lane is a kind lane."** Lanterns mark the safe route (the clue), lantern-light slows
> the cats (the mechanic), and the sinking sun killing the light is the timer (the pressure).

A sharp player should deduce the safe lane by reading several corroborating signals, not one colour:
lit vs dark/flickering lantern, a resting cat vs a fleeing cat, an open shop or hung laundry vs a
shut shutter or an abandoned cart. The rule is also taught diegetically — the grandfather's line,
"a lit lane is a kind lane." A miss shows the exact tell you missed, so failure teaches.

**Hypothesis:** with a learnable rule, deliberate cats, and story woven in, a run feels like a fair
"I should have seen that" puzzle, not random. True if a first-time tester within ~10 min: retries
3+ times unasked, reads the lanterns/cats to pick the safe lane at least once, and can state the
rule afterward. False if they call it random/unfair, never find the rule, or quit after 1-2 tries.

## What changed from v1

- **View:** flat top-down → **2.5D perspective street** (Canvas 2D, no libraries). The street
  recedes to the Fort at the vanishing point; clues live in the walls, lanterns, shops and cats of
  each lane mouth.
- **Puzzle:** single colour tell → a **learnable multi-signal rule** that escalates (obvious →
  flicker+flee → combine laundry/cart), with a fair after-the-fact reveal on a miss.
- **Cats:** static/random → **closeness-driven pack** that gains while you brake or stand in the
  dark, eases while you move or stand in lantern-light ("one good look" is safe in the light),
  flashes red when alert, and speeds up as dusk deepens.
- **Story:** none → short diegetic fragments across forks (frankincense souq, the fishermen, the
  grandfather's lanterns) and a warm beat at the Fort; knowledge is the only progression.
- **Light/time:** the sky and the player's light radius shift warm → dusk over ~78s.

## How to run

Double-click `prototype.html` (single file, no install, no libraries). Steer ◄ ► / A D; hold ▼ /
Space to stop and study a fork (cats gain while you look). On a phone: tap a side to steer, the
lower edge to look; turn sideways for a bigger view.

## How to playtest

Watch a fresh tester, no explaining. Note: do they find the rule? Do they retry? Do the cats feel
deliberate or random? Does a miss feel fair? Afterward ask only "What was confusing?" and "What did
you notice?" Fixed (non-random) tells, so use fresh testers each round.

## Known limits

- The chasing pack follows the player, so once you enter a lane it overlaps that lane's clue-cat;
  reading the fork while still centred (from a distance) is clear. Watch whether this confuses.
- 2D Canvas and browser timing cannot judge the final 3D feel; this tests the rule, the cats and
  the view concept only.
- At full walk the forks arrive ~3s apart; braking to read is the intended way to slow down.

## Findings

None yet. Update after the playtest debrief, then the verdict (PROCEED / PIVOT / KILL).
