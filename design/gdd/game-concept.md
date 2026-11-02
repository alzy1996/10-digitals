# Game Concept: Before Sunset: Muttrah

*Created: 2026-11-02*
*Status: Draft*

**Review status (Lean mode):** CD-PILLARS, AD-CONCEPT-VISUAL, TD-FEASIBILITY and
PR-SCOPE were skipped (Lean mode). The pillars, the Visual Identity Anchor,
technical feasibility and scope were not reviewed by a director agent. Feasibility
and scope are recorded as **not assessed**, not as viable or realistic.

---

## Elevator Pitch

> It's a tense route-reading game where you cross Muttrah, Oman, to reach the Fort
> before sunset. Every route has a trap, the cats close in as the light fades, and
> the world hints at each danger before you reach it, for players sharp enough to
> notice.

---

## Core Identity

| Aspect | Detail |
| ---- | ---- |
| **Genre** | Route-reading chase / discovery puzzle with tension (stealth-adjacent, no combat) |
| **Platform** | Multiple platforms (specific platforms and the lead platform to be decided in `/setup-engine`) |
| **Target Audience** | Explorers and Achievers who like noticing patterns and earning a clean run (see Target Player Profile) |
| **Player Count** | Single-player |
| **Session Length** | 30–60 minutes (8–12 runs of 3–5 minutes) |
| **Monetization** | None decided yet |
| **Estimated Scope** | Medium (3–6 months, solo) for the full vision; MVP in about 2–3 weeks |
| **Comparable Titles** | Outer Wilds, Return of the Obra Dinn, Alien: Isolation |

---

## Core Fantasy

You are the local genius who knows the city. Everyone else walks past the faded
mark on the wall, the car parked at a strange angle, the color of the sky. You
read them, and you reach the Fort before sunset while the cats close in.

It is also a promise about place: you play in a real Omani city, Muttrah, and its
culture is the setting, not a skin. This is built as the first real game from the
creator's family and country, and that pride is part of why the game exists.

---

## Unique Hook

It's like Outer Wilds (every attempt ends and what you learned is your only
progress), AND ALSO it takes place in a real Muttrah, with a sunset clock, cats
chasing from behind, and clues hidden in the ordinary world (walls, cars, sky)
that only a sharp player will notice.

Why it passes the test: it is explainable in one sentence, it is tied to the core
fantasy (the genius who notices), and it affects gameplay (clues decide which route
you survive).

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics (What the player FEELS)

| Aesthetic | Priority | How We Deliver It |
| ---- | ---- | ---- |
| **Sensation** (sensory pleasure) | 3 | Golden-hour light that darkens toward dusk; cat sounds behind you; ambient souq and street sound |
| **Fantasy** (make-believe, role-playing) | 5 | The local who knows the city better than anyone |
| **Narrative** (drama, story arc) | 4 | Story fragments told through clues in the environment |
| **Challenge** (obstacle course, mastery) | 1 | Fixed traps, a sunset clock, and a pursuit that punishes hesitation |
| **Fellowship** (social connection) | N/A | Single-player; sharing discoveries happens outside the game |
| **Discovery** (exploration, secrets) | 2 | Reading clues, finding routes, uncovering the story of the city |
| **Expression** (self-expression, creativity) | N/A | Not a focus |
| **Submission** (relaxation, comfort zone) | N/A | Not a focus; the game is tense by design |

### Key Dynamics (Emergent player behaviors)

- Players memorize which clue means which trap, and plan routes from memory.
- Players take a risky beat to inspect a clue, then decide whether to commit.
- Players retell near-misses and share discoveries ("did you see the door that was a different color?").
- Players chase a clean, fast run once they know the city.

### Core Mechanics (Systems we build)

1. **Movement with sprint and stop-to-look:** stopping to inspect a clue costs distance to the cats.
2. **Branching routes with fixed trap and clue pairs:** each route has a trap, and each trap has a truthful clue in the world.
3. **Cat pursuit from behind:** a pack that follows the player and speeds up as the sunset timer runs down.
4. **Sunset timer and light shift:** the run ends at sunset, and the light moves from warm to dusk as pressure rises.
5. **Instant restart with player-held knowledge:** no save and no stat progression; what carries over is what the player learned.

---

## Player Motivation Profile

### Primary Psychological Needs Served

| Need | How This Game Satisfies It | Strength |
| ---- | ---- | ---- |
| **Autonomy** (freedom, meaningful choice) | Free route choice at every fork, and when to stop and read versus when to run | Core |
| **Competence** (mastery, skill growth) | Noticing clues, avoiding traps, and finally making a clean Fort arrival | Core |
| **Relatedness** (connection, belonging) | Cultural pride in a real, recognizable place; sharing discoveries with friends | Supporting |

### Player Type Appeal (Bartle Taxonomy)

- [x] **Achievers** (goal completion, collection, progression) — How: reaching the Fort cleanly and finding all the story fragments.
- [x] **Explorers** (discovery, understanding systems, finding secrets) — How: reading the world, learning the clue language and uncovering the story.
- [ ] **Socializers** (relationships, cooperation, community) — Minimal: players may share discoveries and near-misses, but the game has no social features.
- [ ] **Killers/Competitors** (domination, PvP, leaderboards) — Supporting at most: best-time runs; no PvP.

### Flow State Design

- **Onboarding curve**: The first run uses a forgiving fork with one very obvious clue, so the player learns that the world hints at danger.
- **Difficulty scaling**: Later routes use subtler clues and tighter timing; the traps never become unfair, because the clue is always truthful.
- **Feedback clarity**: Faster arrivals, fewer deaths at known traps, and more story fragments found show improvement.
- **Recovery from failure**: Restart takes under 3 seconds. Failure is educational: the player knows what they missed.

---

## Core Loop

### Moment-to-Moment (30 seconds)
The player approaches a fork, spots a clue (a mark on a wall, a parked car, the color of the sky), decides whether to pause one beat to look closer, then commits to a route while the cats close in behind. The satisfaction is "I saw it, and I dodged it."

### Short-Term (5-15 minutes)
One run is one sunset (3–5 minutes). The player passes 3–4 decision points and either reaches the Fort or is caught. "One more run" begins at failure, because the player knows exactly which clue they missed.

### Session-Level (30-120 minutes)
About 8–12 runs. Early runs map the traps and the clue language; later runs refine a clean path. A natural stopping point is the first clean Fort arrival, and unfound story fragments are the reason to return.

### Long-Term Progression
Progression is knowledge only: no stats, loot or unlocks. The player learns which clue means which trap and collects story fragments. The game is complete at a clean Fort arrival with the story found.

### Retention Hooks
- **Curiosity**: Unfound story fragments and routes not yet tried.
- **Investment**: Hard-won knowledge of the city that the player does not want to waste.
- **Social**: Sharing discoveries and near-misses with friends (outside the game).
- **Mastery**: A cleaner, faster Fort arrival and routes learned perfectly.

---

## Game Pillars

### Pillar 1: Read the City
Every danger is foreshadowed in the world.

*Design test*: If we're debating a trap with no clue versus a trap with a subtle clue, this pillar says we choose the subtle clue. It is never unfair.

### Pillar 2: Careful Under Pressure
Tension comes from choosing patiently while the cats and the sunset squeeze the player.

*Design test*: If we're debating a calm moment versus a timed squeeze, this pillar says we choose the squeeze, but always leave time for one good look.

### Pillar 3: Muttrah Is Real
Real places and Omani culture are the identity of the game, not a skin.

*Design test*: If we're debating a generic alley versus a recognizable Muttrah spot, this pillar says we choose Muttrah.

### Pillar 4: Learn, Don't Level
Progress is knowledge, not power.

*Design test*: If we're debating an unlockable ability versus a new clue, this pillar says we choose the clue.

### Anti-Pillars (What This Game Is NOT)

- **NOT weapons or combat**: it would compromise Careful Under Pressure and inflate scope.
- **NOT randomized trap placement**: it would break Read the City and Learn, Don't Level; clues must always tell the truth.
- **NOT a huge map or full stealth AI**: we must finish in weeks, and cats chasing from behind is the pressure model.
- **NOT careless with real people or religious places**: no real people's likeness, and respectful treatment of mosques and other religious sites, because Muttrah Is Real depends on respect.

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| ---- | ---- | ---- | ---- |
| Outer Wilds | Knowledge is the progression; every attempt ends and teaches | A real city, a short sunset clock and a cat pursuit instead of space exploration | Validates that knowledge-as-progression sustains a game |
| Return of the Obra Dinn | Solving by observing the environment | Observation happens in real time, under pressure | Validates that noticing is a satisfying core action |
| Alien: Isolation | Tension from being pursued, with no weapon | Pressure comes from behind, with simple chase rules instead of full stealth AI | Validates that tension without combat works |

**Non-game inspirations**: The look and feel of Muttrah's corniche, souq and Fort at golden hour (to be gathered as real reference photography); Omani street life and local storytelling (to be confirmed with the creator).

---

## Target Player Profile

| Attribute | Detail |
| ---- | ---- |
| **Age range** | 16–35 |
| **Gaming experience** | Mid-core |
| **Time availability** | 10–30 minute sessions, longer on weekends |
| **Platform preference** | Mixed (PC, mobile and browser); to be refined in `/setup-engine` |
| **Current games they play** | Outer Wilds, Alien: Isolation, Return of the Obra Dinn |
| **What they're looking for** | A tense game they can master by noticing, set in a real place with a real culture |
| **What would turn them away** | Combat-heavy gameplay, unfair or random traps, or a long campaign |

---

## Technical Considerations

| Consideration | Assessment |
| ---- | ---- |
| **Recommended Engine** | Not chosen. Engine preference: none ("help me decide"). Run `/setup-engine` with this concept and the platform choice. |
| **Key Technical Challenges** | Cat pathfinding through narrow alleys; input and performance across several platforms; sunset lighting on lower-end devices |
| **Art Style** | To be decided in `/art-bible`; stylized, not realistic |
| **Art Pipeline Complexity** | Medium to High: hand-built, clue-bearing scenes per route; modular props (walls, doors, cars, lamps) reduce the cost |
| **Audio Needs** | Moderate: ambient city sound and adaptive tension |
| **Networking** | None |
| **Content Volume** | MVP: 1 fork and 2 routes. Full vision: 5 routes, about 15 clues, about 5 trap types, 5–8 story fragments, 2–4 hours of play to learn |
| **Procedural Systems** | None, by design (traps are fixed so clues can be truthful) |

---

## Visual Identity Anchor

*Drafted from the conversation in Lean mode; no art-director review has been done.
`/art-bible` develops and validates it.*

**Direction: "Golden-Hour Muttrah"**

**Visual rule**: Everything important is lit by the dying sun, so light and shadow tell the player where to look.

**Supporting principles**
1. **Warm light leads the eye.** *Design test*: if a clue could sit in bright light or in shadow, the light leads the eye to it.
2. **Real Muttrah silhouettes always read.** *Design test*: if a prop could be generic or a recognizable Muttrah shape (the Fort, the corniche, souq arches), choose the Muttrah shape.
3. **The light darkens as pressure rises.** *Design test*: if the sky could stay flat or shift toward dusk as the timer runs down, choose the shift.

**Color philosophy**: Warm amber, ochre and terracotta in daylight, moving to violet and indigo shadows as the sun sets, so the color itself shows how much time is left.

---

## Risks and Open Questions

### Design Risks
- Clues must be subtle yet always truthful; unfair or unreadable clues would make the game feel cheap. This is the biggest design risk.
- Stopping to look while chased may feel annoying instead of tense.
- The short loop may not sustain interest once the fixed routes are learned.

### Technical Risks
- Cat pathfinding through narrow alleys and following the player convincingly.
- Input and performance across several platforms at once.
- Sunset lighting on lower-end devices.
- **Technical feasibility: not assessed** (TD-FEASIBILITY skipped in Lean mode).

### Market Risks
- The Omani local theme is a niche, though also a differentiator.
- Accurate Muttrah reference material must be gathered, with care for landmarks and religious sites.

### Scope Risks
- Solo developer, first game, multiple platforms and a weeks-level timeline together; the full vision does not fit in weeks.
- All four combined elements (route choice, cat pursuit, time loop, short runs) add up to more than any one alone.
- **Scope realism: not assessed** (PR-SCOPE skipped in Lean mode).

### Open Questions
- Are the clues subtle yet fair? A grey-box prototype tested on a few friends will show.
- Does stop-to-look feel tense instead of annoying? The prototype's chase tuning will show.
- Which platform leads for the MVP? `/setup-engine` settles it.

---

## MVP Definition

**Core hypothesis**: Players enjoy reading a clue, choosing a route and surviving the chase enough to retry after failing.

**Required for MVP** (about 2–3 weeks):
1. Move through one short Muttrah slice: walk, sprint and stop to look.
2. One fork with two routes, each with a trap.
3. One clue per trap, placed in the world.
4. Cats chase from behind and speed up as the sunset timer runs down.
5. Win at the Fort, lose if caught or at sunset, and restart instantly.

**Explicitly NOT in MVP** (defer to later):
- A third route and more trap types.
- The full sunset lighting change (a simple fade at most).
- Story fragments.
- Extra platforms beyond the lead platform.

### Scope Tiers (if budget/time shrinks)

| Tier | Content | Features | Timeline |
| ---- | ---- | ---- | ---- |
| **MVP** | 1 fork, 2 routes, 2 traps | Core loop only: clue, route choice, cat chase, sunset timer, restart | 2–3 weeks |
| **Vertical Slice** | 4 routes, 5 traps, a few story fragments | Core loop plus light shift and one polished platform | 6–10 weeks |
| **Alpha** | All 5 routes with placeholder art | All features, rough | 3–4 months |
| **Full Vision** | 5 routes, about 15 clues, 5–8 story fragments | All features, polished, multi-platform | 3–6 months |

*These estimates are for a solo first-time developer and were not reviewed (PR-SCOPE skipped in Lean mode).*

---

## Next Steps

This concept is **prototype-first**: the core mechanic (reading a clue under chase pressure) is unproven.

- [ ] Configure the engine (`/setup-engine`), choosing with this concept and the platform choice
- [ ] **Prototype the core idea** (`/prototype [clue-reading route chase]`) before writing GDDs
- [ ] If the prototype PROCEEDS: define the visual identity (`/art-bible`), then decompose the concept into systems (`/map-systems`)
- [ ] If the prototype PIVOTS: run `/brainstorm` again with the learnings
- [ ] Design each system (`/design-system [system-name]`), using prototype learnings
- [ ] Build a vertical slice in Pre-Production (`/vertical-slice`) before committing to Production
- [ ] Validate the core loop with a playtest (`/playtest-report`)
