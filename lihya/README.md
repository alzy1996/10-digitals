# LIHYA لحية

The beard simulator for barbershops in Oman, built by 10 Digital (Muscat). In under 60 seconds a man sees his new
beard on his own face, then the barber gets an exact **Cut Card**: zones, clipper guard numbers and line positions
in millimetres.

- Arabic first (RTL), English toggle on every screen. Phone PWA, tablet **Mirror Mode**, desktop owner screens.
- All face analysis runs **on the phone**. Photos never go to Firebase.
- Free tier only: Firebase Spark (Firestore, Auth, App Check), GitHub Pages hosting, optional Cloudflare Workers AI
  (free daily allocation) for the AI Final Look, which is **OFF by default**.
- Sam owns the code and the data: his GitHub repo, his Firebase project, his Cloudflare account.

Decisions taken during the build and the checks that need a real phone are listed in [BUILD_NOTES.md](BUILD_NOTES.md).
Module contracts are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 1. Run it on your computer (no accounts needed)

Everything runs against the Firebase **Emulator Suite**, so you need no real keys.

You need: **Node.js 22** (nodejs.org, LTS) and **Java 21** (adoptium.net, "Temurin 21") for the emulators.

1. Open a terminal in the `lihya` folder.
2. `npm ci`
3. Create the local settings file: copy `.env.example` to `.env.local`, then set one line:
   `VITE_USE_EMULATORS=true` (leave the other values empty).
4. Terminal 1: `npm run emulators` — wait for "All emulators ready".
5. Terminal 2: `npm run dev` — open the printed address (http://localhost:5173).
6. Tap **Sign in**, type any email (for example `sam@test.om`), tap **Send link**.
7. Open the Emulator UI at http://127.0.0.1:4000 → **Authentication**, or read terminal 1: the sign-in link is printed
   there. Open it in the same browser. You are signed in.
8. Tap **Create your shop**, type a name, **Create shop**. The style catalog and demo data are added (Settings has
   **Delete demo data**).
9. Tap **New customer** and allow the camera.

Phone on the same Wi-Fi: open `http://<your-computer-ip>:5173` (the camera needs HTTPS on phones; for real phone tests
use the deployed site, section 3).

## 2. Checks

| Command | What it checks |
| --- | --- |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm test` | Unit tests: color science and CIEDE2000 (Sharma 2005 pairs), iris scale, mm to guard edges, face shape, recommendation determinism, Cut Card, CSV, Muscat dayKey, i18n completeness, mesh, rendering |
| `npm run test:rules` | Firestore security rules on the emulator (one allow and one deny per rule) |
| `npm run build` then `npm run check:size` | Production build; app shell under 2 MB gzipped, no model files in `dist/`, no secrets tracked |
| `cd worker && npm ci && npm test` | The Cloudflare Worker (auth, caps, CORS, multipart, JPEG size) |

GitHub runs all of these on every pull request (`.github/workflows/lihya-ci.yml`).

## 3. Deploy on GitHub Pages (the chosen hosting)

The site will be at **https://alzy1996.github.io/10-digitals/**. Every push to `main` that changes `lihya/` deploys it
(`.github/workflows/lihya-pages.yml`: lint, tests, build, size gate, deploy).

### A. Firebase project (one time, about 15 minutes)

1. Open https://console.firebase.google.com → **Add project** → name it `lihya` → turn Google Analytics off →
   **Create project** → **Continue**.
2. Left menu **Build** → **Authentication** → **Get started** → **Sign-in method**:
   - **Email/Password** → turn on **Email link (passwordless sign-in)** → **Save**.
   - **Add new provider** → **Google** → **Enable** → pick your support email → **Save**.
   - **Add new provider** → **Anonymous** → **Enable** → **Save**.
3. **Authentication** → **Settings** → **Authorized domains** → **Add domain** → `alzy1996.github.io` → **Add**.
4. **Build** → **Firestore Database** → **Create database** → **Production mode** → choose the closest location
   (for Oman: `me-central1` Doha or `me-central2` Dammam if listed, otherwise `europe-west3`; it cannot change later)
   → **Create**.
5. Gear icon → **Project settings** → **General** → **Your apps** → web icon `</>` → nickname `lihya-web` → **Register app**.
   Keep this page open: it shows `apiKey`, `authDomain`, `projectId`, `appId`.
6. **App Check**: open https://www.google.com/recaptcha/admin/create → reCAPTCHA **v3** → domains
   `alzy1996.github.io` and `localhost` → **Submit** → copy the **site key**. Then Firebase → **Build** →
   **App Check** → **Apps** → your web app → **reCAPTCHA v3** → paste the **secret key** from the same reCAPTCHA page →
   **Save**. Do **not** click Enforce yet (step D3).

### B. Security rules (from your computer, one time and after every rules change)

1. In the `lihya` folder: `npx firebase login` (browser opens → **Allow**).
2. `npx firebase use --add` → pick `lihya` → alias `default`.
3. `npx firebase deploy --only firestore:rules,firestore:indexes`

### C. GitHub (one time)

1. Open https://github.com/alzy1996/10-digitals → **Settings** → **Pages** → **Build and deployment** →
   **Source**: **GitHub Actions**.
2. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, once for each:

   | Name | Value |
   | --- | --- |
   | `VITE_FB_API_KEY` | `apiKey` from A5 |
   | `VITE_FB_AUTH_DOMAIN` | `authDomain` from A5 (for example `lihya-xxxx.firebaseapp.com`) |
   | `VITE_FB_PROJECT_ID` | `projectId` from A5 |
   | `VITE_FB_APP_ID` | `appId` from A5 |
   | `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA **site key** from A6 |
   | `VITE_AI_WORKER_URL` | only if you set up the AI Final Look (section 4); otherwise skip |

3. Merge the pull request (or push to `main`). Open the **Actions** tab → wait for **LIHYA deploy to GitHub Pages**
   to turn green (about 4 minutes) → open https://alzy1996.github.io/10-digitals/.

### D. First use on the phone

1. Open the site on the phone → **Sign in** with your email → open the link from the email on the same phone.
2. **Create your shop** → name in Arabic and English, WhatsApp number → **Create shop**.
3. iPhone: Safari **Share** → **Add to Home Screen**. Android: Chrome menu → **Install app**.
4. **Owner** → **Products**: add your products and prices (nothing is pre-filled, ever), or import the CSV template.
5. **Owner** → **Staff**: invite your barbers by email.
6. **Owner** → **Settings** → **Try at home**: copy the shop link or print the QR code for the shop / Instagram bio.
7. After one day of normal use: Firebase → **App Check** → **APIs** → **Cloud Firestore** → **Enforce**.

The Firebase web config ends up inside the built JavaScript. That is normal: it is a public identifier, protected by
App Check and the security rules.

## 4. Optional: AI Final Look (Cloudflare, free daily allocation)

Off by default. Sends one cropped face photo to Cloudflare (outside Oman) only after the customer taps **Allow once**;
nothing is stored or used for training. Capped at 80 renders a day for the account, 20 per shop by default.

1. https://dash.cloudflare.com/sign-up → create a free account → verify the email → **Workers & Pages** → choose a
   `workers.dev` subdomain if asked.
2. Terminal, in `lihya/worker`: `npm ci` → `npx wrangler login` (browser → **Allow**) → `npx wrangler whoami`.
3. `npx wrangler kv namespace create LIHYA_CAPS` → if asked to add the binding, answer **No** → copy the printed `id`
   into `wrangler.toml` in place of `PASTE_KV_ID_HERE`.
4. In `wrangler.toml` set `FIREBASE_PROJECT_ID` to your `projectId`. `ALLOWED_ORIGINS` already lists
   `https://alzy1996.github.io`; remove `http://localhost:5173` when you are done testing.
5. `npm test` (all pass) → `npx wrangler deploy` → copy the URL (`https://lihya-render.<subdomain>.workers.dev`).
6. GitHub → **Settings** → **Secrets and variables** → **Actions** → add `VITE_AI_WORKER_URL` with that URL (no slash at
   the end) → **Actions** → **LIHYA deploy to GitHub Pages** → **Run workflow**.
7. In LIHYA: **Owner** → **Settings** → **AI preview** → **On**.
8. **Legal (before selling to shops):** ask MTCIT or a lawyer whether processing customers' face images needs a permit
   under the PDPL (Royal Decree 6/2022, amended September 2026), and keep the answer on file.

## 5. Alternative: Firebase Hosting

`npm run build` (base `/`) → `npx firebase deploy --only hosting` → the site is at `https://<projectId>.web.app`.
Add that domain to Authentication → Authorized domains and to the Worker's `ALLOWED_ORIGINS`.

## 6. Free-tier budget (Spark, checked October 2026)

- Firestore: 50,000 reads, 20,000 writes, 20,000 deletes per day, 1 GiB stored. A busy shop (60 customers a day,
  about 10 writes each) uses about 600 writes a day.
- Models (about 20 MB) and the MediaPipe runtime load from Google's model storage and jsDelivr, never from your hosting,
  and the service worker keeps them, so analysis works offline after the first visit.
- GitHub Pages: free for public repositories (1 GB site, 100 GB transfer per month soft limit).

## 7. Folder map

```
lihya/
  src/ai/          on-device AI, isolated behind src/ai/index.js (models, capture, analysis, recommend, mesh, render)
  src/services/    every Firestore read/write (screens never call Firestore directly)
  src/screens/     S01-S22 + CreateShop
  src/components/  UI kit (buttons, chips, sliders, sheet, zone diagram, barber ruler, icons)
  src/reports/     Cut Card PDF/PNG, daily report PDF, CSV import/export, sharing
  src/data/        catalog seed data: 34 styles, 13 mustaches, lines, 14 colors, finishes, guard chart, reasons
  worker/          Cloudflare Worker for the optional AI Final Look
  tests/           unit tests and Firestore rules tests
```
