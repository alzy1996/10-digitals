# 10 Digital — Website Work Log

Single-page site: **`public/index.html`** (one big file — HTML + CSS + JS inline). Vanilla JS, Firebase Hosting + Firestore. No build step.

- **Firebase project:** `digital-e54f2`
- **Deploy:** `firebase deploy --only hosting --project digital-e54f2` (run from project root)
- **Live:** https://digital-e54f2.web.app
- **Standing rule:** deploy automatically after changes (don't ask). Hard-refresh (Ctrl+Shift+R) to bypass browser cache after each deploy.
- **Contact:** WhatsApp 968 7701 9962 (primary) · 7118 9735 · 9818 0442 · email tendigital910@gmail.com. `admin@10digital.om` = admin login only.

## Single source of truth (IMPORTANT)
Add a service/add-on **once** and it appears everywhere. Master arrays live near the top of the JS (search `SINGLE SOURCE OF TRUTH`):

- **`servicesData`** — core services (`id, icon, price, title_en/ar, desc_en/ar, color, border, iconColor`).
- **`addonsData`** — optional one-time add-ons (`id, icon, price, title_en/ar, desc_en/ar`).
- **`recurringData`** — weekly/monthly care plans (`id, cycle, price, title_en/ar, desc_en/ar`).

These drive ALL of:
1. Public **services grid** — `renderServices()`
2. **Chatbot** (Services Assistant) — its `list()` = `servicesData.concat(addonsData)`
3. Public **request/estimator** page — `renderQuoteServices()` (services + add-ons as cards)
4. Admin **Quote Builder** — `renderQbServices()`, `renderQbAddons()`, `renderQbRecurring()` (via `renderQbAll()`)
5. Admin **Pricing Manager** — `renderPricingEditor()` (services + add-ons editable)

**To add a new service:** add one object to `servicesData`. To add an add-on: one object to `addonsData`. Prices auto-flow into `DEFAULT_PRICING` (`Object.fromEntries(...)`).

### Current catalog
- **Services** (`servicesData`): web (850), system/Custom Systems (1500), chatbot/Chatbot Assistant (400), ios (1200), android (1100), marketing (450), branding (600), maintenance (300).
- **Add-ons** (`addonsData`): hosting (120), seo (200), content (150), support (100), revisions (90).
- **Recurring** (`recurringData`): weekly (80), monthly (250).
- *(Prices above are defaults; live prices come from Firestore `config/pricing` and can be edited in the admin Pricing tab.)*

## Pricing (Firestore `config/pricing`, live-synced)
`PRICING = { services:{id:price}, addons:{id:price}, packages:{starter,professional}, maintenance:{weekly,monthly,annual} }`.
- Edit in admin **Pricing** tab → `savePricing()` writes to Firestore → `onSnapshot` → `applyPricing()` updates every surface live (builder prices update **in place** so selections survive).
- Builder recurring weekly/monthly prices come from `PRICING.maintenance.weekly/monthly`.

## Quote Builder behavior
- Services + add-ons selected → counted in **Total**. Add-ons get an `ADD-ON` badge in the PDF.
- **Recurring plan** (weekly/monthly): single-select; editing a plan's price auto-selects it (`recurringPriceInput`). It **is counted in the builder Total** and shown in a live note (`updateRecurringNote`, bilingual). In the PDF it appears as a separate recurring strip; the saved quote keeps one-time `total` + a separate `recurring` field.
- `.qb-total` box uses **black** text on cream (theme's `--primary-dark` is light, so white text was invisible — fixed).

## PDF (Quote Builder → Download PDF)
- `generateQuotePdf()` builds a light, branded A4 **invoice** (matches the green-template style, brand gold/sage) and prints via a **hidden iframe + `srcdoc` + native print** (choose "Save as PDF"). NOT html2canvas (that produced blank PDFs). Logo embedded as data URL (`logoDataUrl()`). Bilingual + RTL. VAT = `QUOTE_VAT` (0.05).

## Services Assistant (chatbot)
- Self-contained `<script>` at end of `<body>` (search `SERVICES ASSISTANT`). Floating gold **"Ask"** button (bottom-right; bottom-left in RTL). Lists services + add-ons → tap → description → **Get a quote** (WhatsApp `SA_WA = 96877019962`) / **Back** / **Talk to a person**. Bilingual via site `currentLang`; re-syncs on language toggle (monkey-patches `toggleLang`). `.sa-*` CSS.

## Language
- `toggleLang()` updates `[data-i18n]`, re-renders public services/estimator, recurring note, chatbot. Admin Quote Builder renders in the load-time language (not re-rendered on toggle, to avoid wiping selections).

## OFM Logistics Arcade (`public/games/`)
Four self-contained 3D training games (three.js r128, vendored in `public/games/vendor/` —
**no CDN, no internet needed**). Served at `/games/`, linked from the Portfolio page
(`portfolio-arcade.jpg` card → opens `games/` in a new tab). Full detail in
`public/games/README.md`.

- `game1` Loading Line Rush · `game2` Weighbridge Master · `game3` Forklift Warehouse ·
  `game4` Fleet Management.
- `game3` is the FIFO/safety/documents game: batch ageing, the 16 core Bühler codes,
  pedestrian + raised-fork safety fails, spill hazards, DN → gate pass chain, shift report.
- Shared assets in `public/games/assets/` (~3.3 MB total): 1024px PBR textures + a
  1024x512 HDR sky. **Already downscaled** from 28 MB of 2048px sources — don't upscale.
- Tuning values that still need Sam's confirmation (`SHELF_DAYS`, `WRITEOFF_OMR`,
  `DEMURRAGE_OMR_PER_MIN`) sit at the top of `game3.html` and render a `TODO_CONFIRM`
  badge in the shift report.

## Changelog
- Added the OFM Logistics Arcade at `/games/`: completed game 3 (Forklift Warehouse — FIFO,
  safety, document chain), vendored three.js so the games run offline, cut the shared asset
  set from 28 MB to 3.3 MB, and linked the arcade from the Portfolio page.
- Quotation PDF redesigned (branded invoice) + native-print fix (no more blank PDFs).
- Added Add-ons + Recurring (weekly/monthly) to Quote Builder; recurring counts in Total.
- Built the Services Assistant chatbot (bilingual, WhatsApp quote links).
- Unified everything to a single-source catalog (services/add-ons/recurring) → syncs across site, chatbot, builder, request page, pricing manager.
- Pricing Manager now edits services **and** add-ons; total box fonts fixed to black.
- Added services: **Custom Systems** and **Chatbot Assistant**.

## Gotchas
- `currentLang` controls language; `data-theme` not used — site is a single dark gold theme (second `:root` wins).
- After ANY change: deploy, then **hard-refresh** — Firebase/browser caches the HTML, which is the usual reason "I can't see the change."
