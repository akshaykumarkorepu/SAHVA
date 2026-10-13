# Deploying

**GitHub does not host this.** GitHub Pages serves static files; this is two
Node servers — Next.js (SSR, route handlers) and the Express API. GitHub is
where the code lives and what the hosts watch.

| Piece | Host | Why |
|---|---|---|
| `apps/web` — clinic site | **Vercel** project 1 (`SITE_MODE=clinic`) | Native Next.js, free tier, redeploys on push |
| `apps/web` — admin console | **Vercel** project 2 (`SITE_MODE=admin`) | Same code, deployed separately: own domain, own env, `/admin` absent from the clinic site |
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
| `CORS_ORIGINS` | **both** Vercel URLs, comma-separated (clinic site, admin console) — fill in after step 2, then redeploy |
| `ANTHROPIC_API_KEY` | optional; only the voice route uses it |
| `REDIS_URL` | optional; see the note below |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay → Account & Settings → API Keys (`rzp_test_…` until live) |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type into Razorpay → Webhooks (step 4) |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional; resend.com, on a verified domain |
| `WEB_URL`, `ADMIN_URL` | the clinic site and admin console URLs, for links in emails |

Do **not** set `PORT`. Render injects it, and the API reads it.

Health check is `/api/health`. If the service will not go live, that endpoint
is the first thing to curl.

## 2. The web apps, on Vercel — two projects

The clinic site and the admin console are the same Next.js app deployed as
**two Vercel projects**. `SITE_MODE` tells each which it is: the clinic site
returns a plain 404 for `/admin`, and the admin console serves only `/admin`
(everything else redirects there). It is decided by the setting, not the
host name, so it holds on preview deployments too.

`vercel.json` pins the monorepo build, so leave Root Directory as the repo
root in both projects.

1. <https://vercel.com/new> → import the repo → branch `saikirans-version` →
   name it e.g. `sahva` (the clinic site).
2. <https://vercel.com/new> again → the **same repo and branch** → name it
   e.g. `sahva-admin`.
3. Environment variables — the same three in both, plus `SITE_MODE`:

| Variable | Clinic project | Admin project |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | same |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key — public by design | same |
| `NEXT_PUBLIC_API_BASE` | the Render URL, e.g. `https://sahva-api.onrender.com` | same |
| `SITE_MODE` | `clinic` | `admin` |

   `ADMIN_HOST` is no longer needed once `SITE_MODE` is set.

4. Deploy both. Put **both** URLs in Render's `CORS_ORIGINS` and redeploy the
   API. Set `WEB_URL` (clinic) and `ADMIN_URL` (admin) on Render too.
5. Later, a custom domain for each (e.g. `sahva.in` and `admin.sahva.in`) in
   each project's Domains settings.

> **Never set `NEXT_PUBLIC_MOCK` here.** It serves the whole app from fixtures.
> Unset, the bundler drops them entirely.

> **Never put the service-role key in a `NEXT_PUBLIC_` variable.** It bypasses
> RLS completely and anything `NEXT_PUBLIC_` ships to the browser.

## 3. Supabase

Add the Vercel URLs to **Authentication → URL Configuration**:

- Site URL: `https://<clinic-app>.vercel.app`
- Redirect URLs: `https://<clinic-app>.vercel.app/auth/callback` and
  `https://<admin-app>.vercel.app/**`

Without this, sign-in redirects and password-reset links come back to
`localhost:3000` and fail in production.

## 4. Razorpay

Needs the API live (step 1): Razorpay must reach it over the internet.

1. Razorpay → **Account & Settings → Webhooks → Add new webhook**
   - URL: `https://<render-url>/api/webhooks/razorpay`
   - Secret: a long random string (`openssl rand -hex 32`). Put the same
     value in Render's `RAZORPAY_WEBHOOK_SECRET`.
   - Events: `payment.captured`, `payment.failed`, `refund.processed`,
     `refund.failed`, `payment.dispute.created`, `payment.dispute.won`,
     `payment.dispute.lost`, `payment.dispute.closed`.
2. **Account & Settings → Payment capture → Automatic.** Otherwise payments
   wait as "authorised" and show up as exceptions.
3. Check: Admin → Payments → **Webhook events**. A test payment should show
   `payment.captured · activated`. A row marked "bad signature" means the two
   secrets differ.

Test mode and live mode have separate keys and separate webhooks; set up both
when going live, and swap the keys on Render.

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
