# Deploying

**GitHub does not host this.** GitHub Pages serves static files; this is two
Node servers — Next.js (SSR, route handlers) and the Express API. GitHub is
where the code lives and what the hosts watch.

| Piece | Host | Why |
|---|---|---|
| `apps/web` | **Vercel** | Native Next.js, free tier, redeploys on push |
| `apps/api` | **Render** | Long-running Node process, free tier, redeploys on push |
| Database | **Supabase** | Already live, `ap-south-1` |

Both hosts watch `saikirans-version`. Push, and the deployed state follows —
which is the whole point of splitting it this way rather than deploying by hand.

---

## 1. The API, on Render

`render.yaml` in the repo root is a blueprint — Render reads it, so there is
nothing to configure by hand except the secrets.

1. <https://dashboard.render.com> → **New** → **Blueprint**
2. Connect the GitHub repo, pick branch `saikirans-version`
3. Render finds `render.yaml` and proposes a service called `sahva-api`
4. It will ask for every var marked `sync: false`. Fill them from your `.env`:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | from Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page. **Server-side only.** |
| `VOICE_API_KEY` | any 32+ char secret |
| `CORS_ORIGINS` | the Vercel URL — fill in after step 2, then redeploy |
| `ANTHROPIC_API_KEY` | optional; only the voice route uses it |
| `REDIS_URL` | optional; see the note below |

Do **not** set `PORT`. Render injects it, and the API reads it.

Health check is `/api/health`. If the service will not go live, that endpoint
is the first thing to curl.

## 2. The web app, on Vercel

`vercel.json` pins the monorepo build, so leave Root Directory as the repo root.

1. <https://vercel.com/new> → import the repo → branch `saikirans-version`
2. Set environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key — public by design |
| `NEXT_PUBLIC_API_BASE` | the Render URL, e.g. `https://sahva-api.onrender.com` |

3. Deploy. Copy the resulting URL back into Render's `CORS_ORIGINS` and
   redeploy the API.

> **Never set `NEXT_PUBLIC_MOCK` here.** It serves the whole app from fixtures.
> Unset, the bundler drops them entirely.

> **Never put the service-role key in a `NEXT_PUBLIC_` variable.** It bypasses
> RLS completely and anything `NEXT_PUBLIC_` ships to the browser.

## 3. Supabase

Add the Vercel URL to **Authentication → URL Configuration**:

- Site URL: `https://<your-app>.vercel.app`
- Redirect URLs: `https://<your-app>.vercel.app/auth/callback`

Without this, sign-in redirects and password-reset links come back to
`localhost:3000` and fail in production.

---

## Continuous deployment

Once connected, both hosts rebuild on every push to `saikirans-version`.
Nothing else to wire — no GitHub Action, no deploy key.

CI still runs on the same push (typecheck, 66 API tests, 67 database
assertions, a production build, and a generated-types drift check). CI and the
deploys run in parallel, so **a red CI run does not block a deploy.** If that
matters, turn on "Wait for CI" in Vercel, and in Render set auto-deploy to
"After CI checks pass".

## What is not production-ready

Deploying makes it reachable. It does not make it finished.

- **No telephony, STT, TTS or WhatsApp sending.** The receptionist cannot
  actually answer a phone. What deploys is the dashboard and patient surfaces.
- **The free Render tier sleeps.** First request after idle takes ~50s. Fine
  for a demo, wrong for a clinic.
- **Rate limits are per-instance** without `REDIS_URL`. One free dyno is fine;
  two silently double every limit.
- **Seed data is fictional.** `supabase/seed.sql` creates a demo clinic. Do not
  mix it with a real clinic's records.
- **Real patient data raises obligations** this repo does not discharge —
  consent, retention, breach notification, and whatever the DPDP Act requires.
  Hosting in `ap-south-1` is necessary, not sufficient.
