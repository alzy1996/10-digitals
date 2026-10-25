# KHUSLA خُصلة

Women's hair cut, color and style simulator for salons in Oman. Her new cut and color on her own photo
in under 2 minutes, an honest plan for today (Lift Reality Check), and a signed **Agreement Card**.
Arabic first (RTL) + English. All AI runs on the device; photos never go to Firebase.

Stack: React 18 + Vite + Tailwind CSS + Firebase (Firestore, Auth, Hosting, App Check) +
MediaPipe Tasks Vision + WebGL2 + jsPDF + html2canvas + one Cloudflare Worker (optional AI preview).
Free tiers only (Firebase Spark, Workers Free).

Read `BUILD_NOTES.md` for every decision, license note, test result and the manual checklist.

---

## Run it on your computer (no Firebase account needed)

You need Node.js 20+ and Java 21 (for the Firebase emulators).

1. Open a terminal in the `khusla` folder.
2. `npm install`
3. Terminal 1: `npm run emulators` (Auth + Firestore emulators; UI at http://localhost:4000)
4. Terminal 2: `npm run dev` → open http://localhost:5173
5. Tap **Staff sign in** → type any email → **Send sign-in link**. The emulator prints the sign-in
   link in Terminal 1 ("To sign in as ... follow this link"). Open that link in the same browser.
6. **Create your salon** → keep "Add demo data" → you land on the stylist home.

With an empty `.env.local` the app always uses the emulators (project `demo-khusla`).

## Tests

| Command | What it checks |
| --- | --- |
| `npm run lint` | ESLint, 0 warnings allowed |
| `npm test` | Unit tests: color science, ΔE2000 (Sharma 2005), lift rules, scale, face shape, levels, recommendation, Muscat dayKey, CSV, i18n, inpainting |
| `npm run test:rules` | Firestore security rules on the emulator (starts its own emulator; stop `npm run emulators` first) |
| `cd worker && npm test` | Cloudflare Worker contract tests |
| `npm run build && npm run check:size` | Production build, gzipped shell < 2 MB, no model files in `dist/`, no tracked secrets |
| `npm run test:e2e` | Browser end-to-end flow (needs emulators + dev server + `E2E_PHOTO=/path/to/front-photo.jpg`; see top of `scripts/e2e.cjs`) |

---

## Deploy — every click

### A · Firebase (required)

1. Go to https://console.firebase.google.com → **Add project** → name it `khusla` → turn Google
   Analytics **off** (not needed) → **Create project** → **Continue**. If the console gives the
   project id a suffix (e.g. `khusla-1a2b3`), your links become `khusla-1a2b3.web.app`: use that
   everywhere below instead of `khusla.web.app`.
2. Left menu **Build → Authentication** → **Get started** → tab **Sign-in method**:
   - **Email/Password** → turn on **Email/Password** AND **Email link (passwordless sign-in)** → **Save**.
   - **Add new provider → Google** → turn on → choose your support email → **Save**.
   - **Add new provider → Anonymous** → turn on → **Save**.
   - Tab **Settings → Authorized domains**: `khusla.web.app` and `khusla.firebaseapp.com` are there by default. Add your own domain later if you connect one.
3. Left menu **Build → Firestore Database** → **Create database** → location: pick the closest
   available (e.g. `me-central1` Doha or `me-central2` Dammam if offered; it **cannot change later**) →
   **Start in production mode** → **Create**.
4. Click the gear **⚙ → Project settings → General** → **Your apps** → web icon **`</>`** → nickname
   `khusla-web` → do **not** tick Hosting here → **Register app**. Copy these 4 values.
5. In the `khusla` folder copy `.env.example` to `.env.local` and fill:
   ```
   VITE_FB_API_KEY=...        (apiKey)
   VITE_FB_AUTH_DOMAIN=...    (authDomain, e.g. khusla.firebaseapp.com)
   VITE_FB_PROJECT_ID=...     (projectId)
   VITE_FB_APP_ID=...         (appId)
   VITE_RECAPTCHA_SITE_KEY=   (step 6)
   VITE_AI_WORKER_URL=        (part B, leave empty for now)
   VITE_USE_EMULATORS=
   ```
6. App Check: left menu **Build → App Check** → **Apps** tab → your web app → **reCAPTCHA v3** →
   it links to https://www.google.com/recaptcha/admin/create → label `khusla`, type
   **Score based (v3)**, domains `khusla.web.app` and `khusla.firebaseapp.com` → **Submit** → copy the
   **site key** into `VITE_RECAPTCHA_SITE_KEY` and the **secret key** into the Firebase App Check
   dialog → **Save**. Do **not** press "Enforce" yet.
7. Terminal in the `khusla` folder:
   ```
   npm i -g firebase-tools
   firebase login
   firebase use --add          (pick khusla, alias: default)
   npm run build
   firebase deploy --only hosting,firestore:rules,firestore:indexes
   ```
8. Open the `https://khusla.web.app` link on the salon tablet → **Staff sign in** → open the email
   on the same device → **Create your salon** → Settings → set your WhatsApp number →
   **Swatch Scan** your dye swatches → Products & services (add or import CSV) →
   in Safari/Chrome: **Share → Add to Home Screen**.
9. After one week of normal use: **App Check → APIs → Cloud Firestore → Enforce**.
10. Staff: Owner screens → **Staff** → type her email → **Create invite** → send her the link
    (Copy or WhatsApp). She opens it, signs in with that email and joins.
11. Try at home: Settings → **Try at home** → print the QR code for the salon or put the link in
    the Instagram bio.

### B · Cloudflare (only if you want the AI Final Look)

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. Terminal in `khusla/worker`:
   ```
   npm install
   npx wrangler login
   npx wrangler kv namespace create KHUSLA_CAPS
   ```
   Copy the printed `id` into `worker/wrangler.toml` (`[[kv_namespaces]] id = "..."`).
   In the same file set `FIREBASE_PROJECT_ID` to your project id and keep `ALLOWED_ORIGINS`
   (`https://khusla.web.app,https://khusla.firebaseapp.com`).
3. `npx wrangler deploy` → copy the `https://khusla-ai.<you>.workers.dev` URL.
4. Put it in `.env.local` as `VITE_AI_WORKER_URL=...` → `npm run build` →
   `firebase deploy --only hosting`.
5. In KHUSLA → Owner → **Settings → AI preview → On** (daily cap 20 per salon by default,
   80 per day for the whole account).

### C · Legal (before selling to salons)

Ask MTCIT, or a lawyer, whether a permit is needed under the PDPL (Royal Decree 6/2022, amended
September 2026) for processing customers' face images on the device, and keep the answer on file.

---

## File tree

```
khusla/
├─ .env.example · .gitignore · .firebaserc · firebase.json · firestore.rules · firestore.indexes.json
├─ BUILD_NOTES.md · README.md · index.html · package.json
├─ vite.config.js (PWA + CacheFirst for pinned model CDNs) · tailwind.config.js · postcss.config.js
├─ eslint.config.js · vitest.config.js
├─ public/icons (PWA icons, sprite.svg, favicon.svg) · public/templates (CSV header templates)
├─ scripts/  check-size.js · e2e.cjs · i18n-source.mjs · build-i18n.mjs · make-icons.cjs
├─ tests/    unit/ (10 files) · rules/firestore.rules.test.js
├─ worker/   wrangler.toml · package.json · src/index.js · test/index.test.js · README.md
└─ src/
   ├─ main.jsx · App.jsx (router + guards)
   ├─ config/app.js          app name, feature flags, defaults
   ├─ lib/                   firebase.js (emulator switch), time.js (Muscat), format.js, photoStore.js, i18n/
   ├─ services/              schema, base, auth, salons, staff, invites, catalog, swatches, products,
   │                         clients, consultations, lookCodes, consents, stats, demo, audit, retention
   ├─ data/                  cuts, fringes, styles, levels, tones, shades, techniques, finishes,
   │                         lights, liftRules, shrinkage, reasons, aftercare (JSON)
   ├─ ai/                    ISOLATED — index.js facade
   │  ├─ models/             cdn, vision, landmarker, segmenter, hairSegmenter, age, inpaint
   │  ├─ capture/            poseGate, quality, whiteCard, privacyBlur, live
   │  ├─ analysis/           color, imageOps, scale, faceShape, skinTone, eyes, rootField,
   │  │                      hairLevel, grey, texture, length, profile
   │  ├─ recommend/          cutScore, colorScore, looks, reasons
   │  ├─ color/              lift, regrowth, henna, bradford, swatchScan
   │  ├─ render/             recolor.frag, renderer, textures, techniques, look, lightSwitch,
   │  │                      finishes, lengthTape, silhouette, fringe, quickShorten, hijabZone,
   │  │                      provider, cloudflareFlux
   │  └─ pipeline.js
   ├─ components/            Button, Chip, Slider, Sheet, LevelLadder, SwatchChip, LengthTape,
   │                         LightPill, ShotDots, CodeBoxes, Snackbar, LookCard, Icon, TopBar,
   │                         HairStage, LiveMirror, GreyJourney, OwnerLayout, CsvImport, BarChart, QrCode, States
   ├─ screens/               S01–S25 + CreateSalon + Join
   ├─ reports/               agreementCardPdf, dailyReportPdf, csv, kpis, aftercare
   ├─ hooks/                 useApp, useSession (wipe), useLive, useOnline, useStage, useThumbs,
   │                         useCatalog, useConsultation
   └─ styles/                tokens.css, index.css
```

## Changing things later (MODIFY)

- Rename the app: `src/config/app.js` (`APP`).
- Texts: `scripts/i18n-source.mjs` → `npm run i18n`.
- Catalog seed (cuts, shades, ...): `src/data/*.json` (existing salons keep their own copy; edit in Owner → Catalog).
- Face-shape / undertone / grey thresholds: `src/ai/analysis/faceShape.js`, `skinTone.js`, `grey.js`.
- Lift rules: `src/data/liftRules.json` + `src/ai/color/lift.js`.
