# Care & Us — build notes

Hair (KHUSLA) + Nails (Nail Mirror) + Beard (LIHYA) in one salon system on Firebase project
`careandus-19cf3`. Built in phases; each phase waits for Sam's APPROVED.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Architecture, data model, file structure | Approved |
| 2 | Firebase setup + shared data layer + rules + the three AI cores copied in | Done |
| 3 | Service picker, Nails screens (Nail Mirror), Beard screens (LIHYA) on the shared client and team | Done |
| 4 | Visit card (all services of one visit, PDF, WhatsApp), dashboard and reports per service | Done |
| 5 | Branding, RTL / phone checks, GitHub Pages demo | Done (real devices: Sam, see below) |

Sam approved all phases at once ("Approved all phases"), so 3–5 were built without stopping.

## Decisions (Phase 2)

| # | Decision | Why |
| --- | --- | --- |
| 1 | KHUSLA is the base of the shared core (auth, salon, team, clients, consents, audit, stats, owner screens) | Most complete core, already tested (118 rules tests, emulator E2E) |
| 2 | One `salons/{id}` tree. `salon.sections = {hair, nails, beard}` (at least one on); staff and invites carry `sections: [...]` | A barbershop turns on Beard only; a women's salon Hair + Nails |
| 3 | Consultations carry `section` (never changes) and optional `visitId` (hair + nails of one visit, one Agreement Card) | One client list, one card per visit |
| 4 | `params` is validated per section: hair look / nail design / beard design. Only the matching validator runs | Firestore stops at 1,000 rule expressions per write; KHUSLA hair already uses ~900 |
| 5 | Hair catalog renamed `hair_cuts`, `hair_shades`, ... ; new `beard_styles`, `nails_polishes`, `nails_looks` | One project holds every service's catalog without name clashes (Nail Mirror and KHUSLA both used `salons/…/looks`) |
| 6 | Booking requests (`requests/`) work for every service and store the look only. Nail Mirror stored a hand-photo thumbnail (`thumb`, up to 200 KB) there: removed, and the rules deny it | PRD rule: photos never go to Firebase |
| 7 | Nail designs store polish id + colour + finish + shape + art. Brand names and polish names are dropped from the stored design | Prices and brands come only from the salon's own list |
| 8 | Nail finish / shape / type keys are exactly Nail Mirror's taxonomy (16 finishes, 8 shapes, 7 types); a unit test pins it | Single source of truth |
| 9 | Beard design and Cut Card rules copied from LIHYA (zones 0–300 mm, short scalars only) | Same limits as the tested LIHYA rules |
| 10 | Runtimes load from pinned CDNs (`src/ai/shared/cdn.js`): ONNX Runtime for nails, transformers.js 4.3.1 for the beard age model (OFF). Three.js is an npm dependency, loaded only in Beard | Keeps the app shell under 2 MB and off Firebase Hosting transfer |
| 11 | Nail Mirror's MobileSAM model (18 MB) was in `public/models` (served by Hosting). Not copied: Phase 3 moves it to a pinned CDN or keeps the fine-fit optional | 18 MB per first use would eat the 10 GB/month Hosting free transfer (~550 loads) |
| 12 | Arabic app name "كير آند أس" (transliteration). One line in `src/config/app.js` | Sam picked "Care & Us"; change the Arabic there if wanted |
| 13 | Firebase web config only in GitHub Secrets / `.env.local`, never in a file | Sam's rule. It is a public identifier protected by App Check + rules, but still kept out of the repo |
| 14 | Emulator project id `demo-careandus` | Local runs never touch the real project |
| 15 | Roles stay owner / manager / stylist for every service (a barber or nail tech is a "stylist" with `sections: ['beard']` / `['nails']`) | One team model; the UI labels the role per service in Phase 3 |

## Decisions (Phases 3–5)

| # | Decision | Why |
| --- | --- | --- |
| 16 | Each service lives in `src/screens/<service>/` and plugs in through `routes.jsx` (`routes`, `ENTRY`, `HOME_ENTRY`, `OWNER_TABS`) and `scripts/i18n/<service>.mjs`; a duplicate translation key stops the build | The three apps were ported in parallel without touching each other |
| 17 | Home asks "Which service?" only when the person works in more than one | One tap less for a nail technician or a barber |
| 18 | Visit card at `/visit/<visitId>` lists every service of the visit with its own approvals; prices only from the salon list (hair price items; nails / beard use the salon products tagged with their service) | One card for hair + nails, no invented prices |
| 19 | A client visit is counted once: by the first service finished in the visit | Hair + nails must not count two visits |
| 20 | Look Codes carry their service; the stylist's code entry opens that service's flow | One code screen for all services |
| 21 | Products carry an optional `section` (form + CSV column) | Nails and Beard Agreements show their own services' prices |
| 22 | Beard guard chart and beard growth (mm/day) live in salon settings (`guardChart` ≤ 40 guards, `beardGrowthMmPerDay` 0.1–1) | From LIHYA; owner-only write, rules-tested |
| 23 | The Nails studio keeps Nail Mirror's dark full-screen camera look; Hair and Beard use the light Care & Us look | Nail colours read truer on dark; the studio is a camera screen |
| 24 | Beard texts address the customer in the masculine, Hair and Nails in the feminine (as in the original apps); Try at home for several services uses a neutral line | Who the customer is in each service |
| 25 | MobileSAM nail fine-fit is off unless `VITE_SAM_BASE` points at a CDN copy of the model | The 18 MB model must not be served from free Hosting |
| 26 | The app name in the browser, manifest and texts is "Care & Us" / "كير آند أس" | Sam's name for the system |

## Test results (Phase 2)

- `npm run lint`: 0 errors, 0 warnings.
- `npm test`: 76 unit tests (65 KHUSLA + 11 new: services list, nail design sanitizer, beard design and
  Cut Card, params routing, taxonomy match, nails and beard AI facades load).
- `npm run test:rules`: 137 rules tests (118 KHUSLA adapted to the new paths + 19 new: services on salon /
  staff / invites, nails and beard consultations, no photo in any design, section can not change,
  visitId, Look Codes per offered service, polishes, nail looks, beard styles, booking requests, per-service
  stats, product service tag). The maximal hair writes still pass under the 1,000-expression limit.
- `npm run build` passes; `npm run check:size`: 1.38 MB gzipped shell.

## Test results (Phases 3–5)

- `npm run lint` 0 warnings; `npm test` 207 unit tests (KHUSLA, Nails, LIHYA beard data / session / Cut
  Card / guards / look, visit card, CSV service column, sections); `npm run test:rules` 138 rules tests.
- `npm run build` and `npm run build:pages` pass; `npm run check:size` 1.90 MB of 2.00 MB (gzipped,
  every file in `dist/`; three.js only in the beard chunk).
- Browser, emulators: Nails chair (polish, photo, AI match, Agreement, approvals, Done), owner polishes /
  looks / requests, Try at home request + Look Code; Beard chair (capture with white card, analysis,
  styles, Studio, Cut Card, approvals, PDF, Done), beard catalog, Try at home Look Code + request.
  No photo written to Firestore in either.
- GitHub Pages demo copy (local, same 404 handoff): 17/17 — salon with three services, service picker,
  Nails studio, Beard capture, every owner screen, dashboard filter, Try at home with three services,
  deep link, no page errors.

## Not yet (honest)

- Real phones for all three services (camera, speed, PDF on iPhone): `docs/hair-BUILD_NOTES.md` §7
  applies to every service.
- The 4-photo beard capture was tested with a front pose only (fake camera); Live AR untested.
- Size margin is 0.10 MB: the next big feature should load lazily or drop a font weight.
- The home "New client" button says عميلة (feminine) even in a beard-only salon.
