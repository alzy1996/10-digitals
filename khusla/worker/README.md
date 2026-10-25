# khusla-ai (AI Final Look worker)

A Cloudflare Worker on the **Free plan**, using Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`, Apache 2.0) and one KV namespace for the daily counters. It needs no API keys: you sign in once with `wrangler login`. It stores no images and logs no request bodies.

## Deploy (run these inside `worker/`)

```bash
npm install
npx wrangler login
npx wrangler kv namespace create KHUSLA_CAPS
```

1. Copy the `id` that the last command prints into `wrangler.toml`, replacing `PASTE_KV_ID_HERE` under `[[kv_namespaces]]`.
2. In `wrangler.toml` under `[vars]`:
   - Set `FIREBASE_PROJECT_ID` to your Firebase project ID.
   - Set `ALLOWED_ORIGINS` to the app origins, comma separated, with no trailing slash.
   - Optionally change `ACCOUNT_DAILY_CAP` (renders per UTC day for the whole account), `SALON_DAILY_CAP` (the default per salon when the salon has no `settings.aiDailyCap`) and `OUTPUT_SIZE`.

```bash
npx wrangler deploy
```

Then put the printed `https://khusla-ai.<your-subdomain>.workers.dev` URL in the app's `.env.local` as `VITE_AI_WORKER_URL`, and rebuild the app.

## Other commands

```bash
npm test             # unit tests (vitest)
npx wrangler tail    # live logs (short error codes only)
```

The counters reset at 00:00 UTC, which is 04:00 in Muscat. That is also when the Workers AI free neurons reset. KV is eventually consistent, so the caps are close but not exact.
