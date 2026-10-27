# Care & Us — build notes

Hair (KHUSLA) + Nails (Nail Mirror) + Beard (LIHYA) in one salon system on Firebase project
`careandus-19cf3`. Built in phases; each phase waits for Sam's APPROVED.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Architecture, data model, file structure | Approved |
| 2 | Firebase setup + shared data layer + rules + the three AI cores copied in | **Done (this PR)** |
| 3 | Screens: service switch on home, Nails and Beard screens on the shared client and team | Next |
| 4 | Combined Agreement Card / PDF, dashboard and daily report across services | |
| 5 | Polish, RTL and phone checks, demo data, GitHub Pages demo | |

Until Phase 3 the app runs the Hair flow (KHUSLA) on the new data layer. Nails and Beard AI are in
`src/ai/nails` and `src/ai/beard`, tested to load, not yet on screens.

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

## Test results (Phase 2)

- `npm run lint`: 0 errors, 0 warnings.
- `npm test`: 76 unit tests (65 KHUSLA + 11 new: services list, nail design sanitizer, beard design and
  Cut Card, params routing, taxonomy match, nails and beard AI facades load).
- `npm run test:rules`: 137 rules tests (118 KHUSLA adapted to the new paths + 19 new: services on salon /
  staff / invites, nails and beard consultations, no photo in any design, section can not change,
  visitId, Look Codes per offered service, polishes, nail looks, beard styles, booking requests, per-service
  stats, product service tag). The maximal hair writes still pass under the 1,000-expression limit.
- `npm run build` passes; `npm run check:size`: 1.38 MB gzipped shell.

## Not yet (honest)

- Nails and Beard screens: Phase 3.
- The nails and beard AI are copied as written in their apps; they run on MediaPipe 1.1.1 here
  (Nail Mirror was on 0.10.35). Retested when they get screens in Phase 3.
- Real-device checks for all three services after Phase 5.
