<!-- PROTOTYPE - NOT FOR PRODUCTION -->
<!-- Question: Can a first-time player notice a subtle in-world clue while chased, and does a miss feel fair (not random)? -->
<!-- Date: 2026-11-03 -->
# Before Sunset: Muttrah - concept prototype

**Status:** in-progress (built, not yet playtested)

## Hypothesis being tested

> If the player faces a fork with two routes, with a hidden clue in the scene while the cats
> chase and the sunset timer runs, they will feel "I should have seen that" instead of
> "that was random."

We will know this is true if, within about 10 minutes (about 5 runs), a first-time tester:

1. retries at least 3 times without being asked,
2. uses the clue to pick the safe route at least once, and
3. can name the clue afterward.

It fails if testers call the traps random or unfair, never notice the clue, or stop after 1-2 tries.

Riskiest assumption under test: clues are subtle but fair.

## How to run

Double-click `prototype.html` (no server, no install, no libraries). Works in any modern browser.

- Move: arrow keys / WASD, or hold the mouse / finger and the player moves toward it.
- Your first move starts the run. `R` restarts at any time; `Space` or a tap retries from the end screen.

## What it is

A top-down slice of a street with two forks in a row. At each fork one street is safe and one is
trapped (instant fail). Cats follow the player's own trail from behind and speed up over time. The
screen darkens toward sunset, with a small light radius around the player.

- Fork 1: obvious clue (large mark on the wall beside the trapped street).
- Fork 2: subtle clue (small mark among decoys).
- The failure screen names the trap you hit and which street you took at each fork, but never the clue.

A full run with no mistakes takes about 10 seconds of walking; the cats allow roughly 6 seconds
of standing still in total.

## Known limits of this prototype

- It is top-down and the whole map is on screen (dimmed outside the player's light), so a tester can
  study the map before their first move. Real play would not give that overview. Note whether the
  tester studied the map first; if the subtle clue is only found that way, that is a weak result.
- Browser timing and a 2D view cannot judge 3D atmosphere or final touch feel. This tests clue
  fairness and the retry loop only.
- Traps are fixed on purpose (no randomness), so repeat testers can memorize them. Use fresh testers.

## How to playtest

Watch a first-time tester without explaining anything. Do not help. Note where they slow down.
Afterwards ask only: "What was confusing?" and "What did you notice?" Count: retries, whether they
used the clue, whether they can name it.

## Explicitly cut

Menus, music, art, sprint, story, the real Muttrah map, 3D, cat pathfinding, save data, polish.

## Findings

None yet. Update this section after the playtest debrief.
