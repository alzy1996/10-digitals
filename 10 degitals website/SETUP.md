# 10 Digital — Setup & Deploy

The site lives at `public/index.html` (single file, no build step).
- **Firestore** — holds requests / quotations / portfolio / visitors / newsletter data
- **Cloudinary** — holds uploaded portfolio images & videos (free tier, unsigned preset)
- **Firebase Auth** — gates the admin dashboard

---

## 1. Firebase setup (console.firebase.google.com → project `digital-e54f2`)

1. **Authentication** → Sign-in method → enable **Email/Password**. *(That's the only Auth step needed.)*
2. **Firestore Database** → Create database → Production mode → pick a region (`europe-west3` or `asia-south1` are closest to Oman).

### Admin login — first-time setup is automatic
You do **not** need to manually create a user in the console. The first time you open the
Admin login box and enter a password, the site **creates the admin account** (`admin@10digital.om`)
with that password and logs you straight in. Every later login must use that same password.

- There's an 👁 toggle to show/hide the password while typing.
- Minimum 6 characters (Firebase requirement).
- "Wrong password" means the account already exists — use the password you first set.
- To use a different admin email, change `ADMIN_EMAIL` near the top of the `<script>` block in `public/index.html`.

> **Note:** Firebase **Storage is not used** at all — every image/video upload goes to Cloudinary.
> There is no `storageBucket` or `storage.rules` to configure.

## 2. Cloudinary setup (cloudinary.com)

Portfolio media uploads go to Cloudinary instead of Firebase Storage.

1. Sign in to your Cloudinary account.
2. **Settings → Upload → Upload presets** → confirm `ml_default` is set to **Unsigned** mode.
3. The credentials are already set in `public/index.html`:
   ```js
   const CLOUDINARY_CLOUD_NAME  = 'dlutxjphq';
   const CLOUDINARY_UPLOAD_PRESET = 'ml_default';
   ```

## 3. Deploy

```bash
npm install -g firebase-tools   # one-time
firebase login                  # opens browser to authenticate
firebase deploy --only hosting,firestore:rules
```

Your site will be live at:
- `https://digital-e54f2.web.app`
- `https://digital-e54f2.firebaseapp.com`

To redeploy after edits to `public/index.html`, just re-run `firebase deploy`.

---

## What's wired up

- **Firestore**: `requests`, `quotations`, `portfolio`, `visitors`, `newsletter`
- **Cloudinary**: portfolio images/videos uploaded via the admin Portfolio Manager
- **Auth**: admin login calls `signInWithEmailAndPassword(ADMIN_EMAIL, <password>)` — this lets `firestore.rules` tell a real admin apart from an anonymous visitor
