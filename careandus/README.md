# Care & Us

One salon system with three services: **Hair** (from KHUSLA), **Nails** (from Nail Mirror) and
**Beard** (from LIHYA). One login, one salon, one team, one client list, one dashboard.
Arabic first (RTL) + English. All AI runs on the device; photos never go to Firebase.

Stack: React 18 + Vite + Tailwind CSS + Firebase (Firestore, Auth, Hosting, App Check) +
MediaPipe Tasks Vision + WebGL2 + Three.js (beard 3D, loaded only in Beard) + jsPDF + html2canvas.
Free tiers only. Firebase project: **careandus-19cf3**.

Read `BUILD_NOTES.md` for every decision and the build status. The original KHUSLA notes are in
`docs/hair-BUILD_NOTES.md`; Nail Mirror and LIHYA keep theirs on their own branches / folders.

**Live demo (no account, nothing saved):** https://alzy1996.github.io/10-digitals/careandus/

## How the one system works

- **One salon, three services.** The owner turns Hair, Nails and Beard on in Create salon or
  Settings → Services. Each staff member works in the services she is given (Owner → Team).
- **Chair:** Home → New client → pick the service (one tap; skipped when she does only one) →
  that service's flow → Agreement / Cut Card with two approvals → Done.
  "Add another service for her" keeps the same client and visit: hair + nails end on **one visit card**
  (`/visit/<id>`, PDF + WhatsApp). The visit is counted once.
- **Owner screens:** one dashboard and one report for every service, with a filter
  (All / Hair / Nails / Beard). Each service adds its own screens: hair catalog and Swatch Scan,
  nail polishes / nail looks / booking requests, beard styles / guard chart.
- **Try at home:** the salon link offers each service; customers send a booking request or bring a
  Look Code. Never a photo.
- **Prices** come only from Owner → Products & services; a product can be tagged Hair, Nails or Beard
  (CSV column `section`, optional).

---

## Run it on your computer (no Firebase account needed)

You need Node.js 20+ and Java 21 (for the Firebase emulators).

1. Open a terminal in the `careandus` folder.
2. `npm install`
3. Terminal 1: `npm run emulators` (Auth + Firestore emulators, project `demo-careandus`; UI at http://localhost:4000)
4. Terminal 2: `npm run dev` → open http://localhost:5173
5. Tap **Staff sign in** → type any email → **Send sign-in link**. The emulator prints the link in
   Terminal 1. Open it in the same browser.
6. **Create your salon** → you land on the stylist home.

With an empty `.env.local` the app always uses the emulators.

## Tests

| Command | What it checks |
| --- | --- |
| `npm run lint` | ESLint, 0 warnings allowed |
| `npm test` | Unit tests: color science, lift rules, recommendation, Muscat day, CSV, i18n, and the three services' data rules (nails design, beard design, sections) |
| `npm run test:rules` | Firestore rules on the emulator: one allow and one deny per rule, all three services |
| `npm run build && npm run check:size` | Production build, gzipped shell < 2 MB, no model files, no tracked secrets |

---

## Deploy — every click

### 0 · GitHub Pages demo (no Firebase)

`npm run build:pages` builds the demo (base `/10-digitals/careandus/`, Firestore in memory, one-tap demo
sign-in, banner on every screen). Every merge to `main` that touches `careandus/` republishes it
(`.github/workflows/careandus-pages.yml`, only the `careandus/` folder of `gh-pages`).

### A1 · Firebase project careandus-19cf3 (browser clicks, once)

1. https://console.firebase.google.com → open **careandus-19cf3**.
2. Left menu **Build → Authentication** → **Get started** → tab **Sign-in method**:
   - **Email/Password** → turn on **Email/Password** AND **Email link (passwordless sign-in)** → **Save**.
   - **Add new provider → Google** → turn on → choose your support email → **Save**.
   - **Add new provider → Anonymous** → turn on → **Save**.
3. Left menu **Build → Firestore Database** → **Create database** → location **me-central1 (Doha)**
   (it cannot change later) → **Start in production mode** → **Create**.
4. Left menu **Build → Hosting** → **Get started** → **Next** → **Next** → **Continue to console**.
5. App Check: left menu **Build → App Check** → **Apps** → your web app → **reCAPTCHA v3** → the link
   opens https://www.google.com/recaptcha/admin/create → label `careandus`, type **Score based (v3)**,
   domains `careandus-19cf3.web.app` and `careandus-19cf3.firebaseapp.com` → **Submit** → keep the
   **site key**, paste the **secret key** into the Firebase dialog → **Save**. Do **not** press Enforce yet.
6. Not used (leave off): Storage, Analytics. Photos never go to Firebase, so there is no Storage.

### A2 · Deploy from GitHub (no terminal)

1. Deploy key:
   - Firebase console → **⚙ → Project settings** → tab **Service accounts** → **Manage service account permissions**.
   - **+ Create service account** → name `github-deploy` → **Create and continue**.
   - **Select a role** → `Firebase Hosting Admin` → **+ Add another role** → `Firebase Rules Admin` →
     **+ Add another role** → `Cloud Datastore Index Admin` → **+ Add another role** → `Service Usage Consumer`
     → **Continue** → **Done**.
   - Click `github-deploy@careandus-19cf3...` → tab **Keys** → **Add key → Create new key** → **JSON** → **Create**.
2. https://github.com/alzy1996/10-digitals → **Settings** → **Secrets and variables → Actions** →
   **New repository secret**, one per row (name exactly as written → paste → **Add secret**):

   | Name | Value |
   | --- | --- |
   | `FIREBASE_SERVICE_ACCOUNT_CAREANDUS` | the whole downloaded `.json` file |
   | `VITE_FB_API_KEY` | `apiKey` from your Firebase config |
   | `VITE_FB_AUTH_DOMAIN` | `careandus-19cf3.firebaseapp.com` |
   | `VITE_FB_PROJECT_ID` | `careandus-19cf3` |
   | `VITE_FB_APP_ID` | `appId` from your Firebase config |
   | `VITE_RECAPTCHA_SITE_KEY` | the reCAPTCHA **site** key from A1 step 5 |

   Then delete the `.json` file from Downloads and empty the bin. `storageBucket`, `messagingSenderId`
   and `measurementId` are not needed.
3. Merge the Care & Us pull request → tab **Actions** → **Care & Us deploy** → green tick →
   open https://careandus-19cf3.web.app
   - Red cross: click it, the red step names the exact problem → fix the secret → **Re-run all jobs**.
   - "403 / permission denied": Google Cloud → **IAM** → pencil on `github-deploy@...` →
     **+ Add another role** → `Firebase Admin` → **Save** → re-run.
4. After one week of normal use: **App Check → APIs → Cloud Firestore → Enforce**.

### A3 · Or from your computer

1. In `careandus/` copy `.env.example` to `.env.local` and fill the four `VITE_FB_*` values and
   `VITE_RECAPTCHA_SITE_KEY` (never commit `.env.local`; it is git-ignored).
2. `npm i -g firebase-tools` → `firebase login` → `npm run build` →
   `firebase deploy --project careandus-19cf3 --only hosting,firestore:rules,firestore:indexes`

---

## File tree

```
careandus/
├─ firestore.rules (one ruleset, 3 services) · firestore.indexes.json · firebase.json · .env.example
├─ README.md · BUILD_NOTES.md · docs/ (original KHUSLA notes)
├─ scripts/  check-size.js · e2e.cjs · i18n-source.mjs · build-i18n.mjs
├─ tests/    unit/ · rules/firestore.rules.test.js
├─ worker/   Cloudflare Worker (optional AI preview)
└─ src/
   ├─ config/app.js          name "Care & Us", the three services, feature flags
   ├─ lib/                   firebase.js (live / emulator / demo), time.js (Muscat), i18n, url
   ├─ services/              shared: salons, staff, invites, clients, consents, audit, stats,
   │  │                      products, lookCodes, requests, consultations (section-aware)
   │  └─ sections/           nails.js · beard.js
   ├─ ai/
   │  ├─ shared/cdn.js       pinned model and runtime CDNs for all three services
   │  ├─ hair/index.js       KHUSLA
   │  ├─ nails/index.js      Nail Mirror
   │  └─ beard/index.js      LIHYA
   ├─ data/                  hair JSON · nails/ · beard/
   ├─ components/ · hooks/ · screens/ · reports/
```
