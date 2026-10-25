# Nail Mirror — AI nail polish try-on for salons (EN / عربي)

Customers point a phone at their hand and see any polish color, finish and shape on their **real nails**, live.
The salon gets the exact look (shade, finish, shape, length) before painting. Built for Muscat salons: Arabic RTL + English,
OMR prices, Oman time, WhatsApp hand-off, henna-aware skin reading.

**Stack:** React 18 + Vite + Tailwind CSS + Firebase (Firestore, Auth, Hosting). **Cost:** free tier only.
**AI:** Google MediaPipe hand tracking + custom WebGL2 polish renderer, running **on the phone**. No paid API, no server.

---

## What is inside

| Area | What it does |
|---|---|
| **Try-on studio** `/try` | Live camera or photo · 269 shades in 20 families (138 curated with Arabic names + 131 research shades with similar-product references) · 16 finishes (crème, gel, matte, satin, jelly, milky, shimmer, pearl, metallic, chrome, holo, glitter, cat eye, velvet, duochrome, neon) · 8 shapes × 5 lengths · French / micro French / ombré / chrome tip / half moon · a different color per finger · freeze frame · fine-tune nails by dragging · hold to see bare nails · compare (side by side + before/after slider) · light preview (salon / daylight / evening hall) · white-paper calibration · tilt to see chrome, glitter and cat eye move |
| **AI Match** | Skin depth (ITA°) + undertone (warm / cool / neutral / olive) + Monk Skin Tone level from the back of the hand, henna detection, finger proportions → ranked shades **in stock** with a reason for each, plus finish and shape suggestions. Never guesses age or ethnicity. |
| **Website** `/` | Luxury bilingual landing page, collections (incl. Oman National Day 20 Nov), finishes, services & prices, visit info, WhatsApp, `/catalog` shade library, `/privacy` |
| **Customer → salon** | "Send to salon" (name, phone, preferred time, look recipe, optional photo) → appears live in the salon inbox. WhatsApp click-to-chat (free, no API). Share / download / PDF card. |
| **Salon admin** `/admin` | Dashboard (Oman-time KPIs, new requests, low stock, top shades, reception QR) · Requests · Consultations · Inventory (stock ±, CSV import/export, color picked from a bottle photo) · Services · Daily PDF / CSV report · Staff invites · Settings · Audit trail |
| **Data** | Firestore offline mode, real-time sync across devices, audit stamp (who + when) on every record enforced by security rules, append-only audit log, seed data, demo mode without Firebase |

---

## 1. Run it on your computer (5 minutes)

You need **Node.js 20 or newer** → download from https://nodejs.org (LTS button) and install.

```bash
cd nail-mirror
npm install
npm run dev
```

Open the address it prints (for example http://localhost:5173).
Without Firebase keys the app runs in **DEMO MODE**: everything works, nothing is saved. `/admin` opens without login in demo mode.

> Testing the camera on your phone: the camera only works on **https** or **localhost**. Easiest: deploy (step 3) and open the real link on your phone.

---

## 2. Create your free Firebase project (one time, every click)

1. Go to https://console.firebase.google.com → sign in with **your own Google account** (you own the data).
2. Click **Create a project** → name it e.g. `nail-mirror-muscat` → **Continue** → Google Analytics: **turn OFF** → **Create project** → **Continue**.
3. **Add the web app:** on the project home click the **`</>` (Web)** icon → App nickname `Nail Mirror` → tick **"Also set up Firebase Hosting"** → **Register app**.
   You will see a code block with `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`. Keep this page open.
4. In the project folder, copy `.env.example` to a new file called `.env.local` and paste the values:
   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=nail-mirror-muscat.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=nail-mirror-muscat
   VITE_FIREBASE_STORAGE_BUCKET=nail-mirror-muscat.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
   VITE_SALON_ID=main
   ```
   (These web keys are not secret passwords. Security comes from the Firestore rules. Never commit `.env.local` — it is already in `.gitignore`.)
5. **Database:** left menu **Build → Firestore Database** → **Create database** → Location: **me-central1 (Doha)** (closest to Oman; cannot be changed later) → **Start in production mode** → **Create**.
6. **Sign-in methods:** left menu **Build → Authentication** → **Get started** → tab **Sign-in method**:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → choose your support email → Save
   - **Anonymous** → Enable → Save (lets customers send looks without an account; keeps the audit trail)
7. **Authorized domains:** still in Authentication → **Settings → Authorized domains**. `localhost` and `your-project.web.app` are there already. Add your own domain later if you buy one.
8. Open `.firebaserc` and replace `YOUR-FIREBASE-PROJECT-ID` with your project id (e.g. `nail-mirror-muscat`).

---

## 3. Deploy (publish the website)

```bash
npm install -g firebase-tools     # one time
firebase login                    # opens the browser, choose the same Google account
npm run build
firebase deploy                   # uploads the website + security rules
```

Your salon is now live at **https://YOUR-PROJECT-ID.web.app**.
Every later update: `npm run deploy`.

### First login = salon owner
1. Open `https://YOUR-PROJECT-ID.web.app/admin` → **Create account** (or Continue with Google).
2. Email/password accounts: open the verification email, click the link, come back.
3. Tap **Claim salon & load starter data** → 138 starter shades and 9 services are created. Edit them in **Inventory** and **Services**.
4. **Settings** → salon name (EN + AR), WhatsApp number, address, hours, prices on/off.
5. **Dashboard → Reception QR → Print** → put it at reception and on the mirrors.

> Do step 3 **right after deploying**: the first signed-in person can claim the salon.

### Add staff
**Staff** page → enter the technician's email → **Invite**. The technician opens `/login` with that email → verifies the email (password accounts) → taps **Accept invite**.

---

## 4. Replace your old Excel sheet (CSV import)

**Inventory → Import CSV → Download template**. Columns:
`brand, line, name, nameAr, code, hex, hex2, family, finish, type, price, stock, barcode, active, notes`

- In Excel: **File → Save As → CSV UTF-8**. Arabic headers like `الاسم`, `الكود`, `الكمية`, `السعر` are recognised too.
- Hard validation before anything is saved: name and a valid hex color are required, prices and stock ≥ 0, no duplicate brand+code. You see every error with its line number.
- **Merge** updates existing shades by brand+code, **Append** adds new ones.
- No hex color in your sheet? Add the shade, then in its form use **Pick color from bottle photo** (photo of the bottle on white paper in daylight).

---

## 5. How accurate is it? (honest)

- Colors are a **calibrated preview, not a guarantee**. Phone cameras and screens shift color. For the closest match, tap **☀ → Calibrate with white paper**, and always check the real bottle.
- Nail edges come from AI hand landmarks plus Smart Fit (measures each nail from the photo). On difficult photos the technician fixes edges in seconds with **Adjust nails** (drag).
- Undertone from a camera is only moderately reliable (olive is the hardest), so the customer confirms it with one tap.
- Neon is brighter in real life than any screen can show.
- Henna and very dark nail polish make skin reading less exact. The app warns but never refuses service.
- Target before marketing any accuracy claim: photograph 30+ real manicures next to the preview in the same light and measure (median ΔE2000 ≤ 2). See `docs/RESEARCH.md`.

---

## 6. Free-tier limits (Firebase Spark)

| Limit | What the app does about it |
|---|---|
| Firestore 50k reads / 20k writes per day | Customers read **one** document per visit (the public catalog); admin lists are capped |
| Hosting ~360 MB/day transfer | The 19 MB AI files load from Google's / jsDelivr's free CDNs, with your hosting as fallback; cached on the phone after the first visit |
| No Cloud Storage on the free plan | No photo storage service is used. Optional small preview photos (≤180 KB) live inside the request record and are **deleted after 90 days** by the app |
| No paid APIs | WhatsApp uses free click-to-chat links; no SMS, no OCR |

If a daily quota runs out, the site pauses until the reset (around 11:00 Muscat time). Nothing is ever billed on Spark.

---

## 7. Switch on later (built in, off for now)

| Feature | How to enable |
|---|---|
| **Trained nail segmentation model** (pixel-perfect cuticle edges) | Train a 2-class TFLite model (see `docs/RESEARCH.md` → model plan; use MobileNetV3/EfficientNet encoders, not YOLO (AGPL) or MiT (non-commercial)), put it in `public/models/`, set `VITE_NAIL_SEGMENTER_URL=/models/nail_segmenter.tflite`, rebuild |
| Custom domain (e.g. `try.yoursalon.om`) | Firebase Console → Hosting → **Add custom domain** → follow the DNS steps |
| App Check (anti-abuse) | Firebase Console → App Check → reCAPTCHA Enterprise (free up to 10k/month) |
| Payments / deposits (Thawani, OmanNet) | Paid gateway, needs the Blaze plan + Cloud Functions; not included |
| Automatic WhatsApp messages | WhatsApp Business API is paid; current app uses free click-to-chat |

---

## 8. Before commercial launch (checklist)

- [ ] Omani lawyer reviews `/privacy` against the Personal Data Protection Law (Royal Decree 6/2022)
- [ ] Measure your real bottles (Pick color from bottle photo, daylight, white card) — library hex values are approximations
- [ ] Run the accuracy test (30+ real manicures vs preview)
- [ ] Native Gulf-Arabic copy review
- [ ] Test on the phones your customers use (iPhone 11+, Galaxy A-series)

---

## Project map

```
src/
  ai/                  ISOLATED AI (never touches business logic)
    handTracker.js     MediaPipe hand landmarks (CDN → self-hosted fallback, GPU → CPU)
    nailGeometry.js    landmarks → 5 oriented nails per hand + Smart Fit pixel refinement + tracking
    skinAnalysis.js    ITA° / hue / Monk level, henna + highlight rejection, white calibration
    recommend.js       explainable recommendation rules (shades, finishes, shapes)
    segmentation/      optional trained-model slot (off by default)
  render/              WebGL2 polish shaders (linear light, real highlights, chrome, glitter, cat eye…)
  features/tryon/      studio UI, engine, compare, save, fine-tune
  store/DataProvider   Firestore / demo data layer + audit trail
  admin/               salon back office
  pages/               public website
  data/                taxonomy, 269-shade library, seed data
  i18n/strings/        EN + AR texts
firestore.rules        security rules (tested: 47 cases)
firebase.json          hosting headers, caching, SPA routing
```
