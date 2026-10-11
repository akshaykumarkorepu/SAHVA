# SAHVA

**Telugu-and-English AI receptionist for solo and small clinics in Tier 2/3 towns.**
It answers every call, books real appointments off live availability, and never
lets a schedule change silently cancel a patient without staff knowing.

> **Branch: `saikirans-version`** — maintained by Saikiran.
> This branch replaces the demo's data and API layers with production ones:
> a multi-tenant Supabase schema, and an Express API rewritten on top of it with
> real authentication.
>
> The frontend has been rebuilt against it: one sign-in for everyone, tenant
> context, the Action Required queue, write actions, a patient record, and a
> light-first design system that clears WCAG AA.

---

## Try it in thirty seconds

No Supabase project, no API process, no keys:

```bash
npm install
NEXT_PUBLIC_MOCK=1 npm run dev -w apps/web
```

Open <http://localhost:3000>. Sign-in is bypassed and every screen is served
from fixtures in `apps/web/lib/mock/` — the same Sri Sai Clinic the seed
creates, including the Action Required queue and its reschedule-review flow.
Writes mutate the fixtures in memory, so resolving an item or dispatching a
batch behaves correctly until you reload.

Mock mode is a review and demo aid, not a test double — the tests run against
real PostgreSQL. `NEXT_PUBLIC_MOCK` must never be set in a deployed
environment; with it unset the bundler drops the fixtures entirely.

To run it for real, see [`docs/setup.md`](docs/setup.md).

---

## What's in this branch

| | `main` | `saikirans-version` |
|---|---|---|
| Database | SQLite, one hardcoded clinic | **Supabase / PostgreSQL, multi-tenant** |
| Tenant isolation | none | **133 RLS policies + composite foreign keys** |
| **API authentication** | **middleware existed, never mounted** | **mounted; clinic resolved from `clinic_members`** |
| Availability | TypeScript, computed in the API | **`sahva.available_slots()`, computed in the DB** |
| Double-booking | application check only | **impossible — `EXCLUDE USING gist` constraint** |
| Action Required flow | did not exist | **trigger + `/api/actions`, tested** |
| Knowledge base | hardcoded in the system prompt | **`clinic_faqs` + `clinic_services`, per clinic** |
| Conversation state | round-tripped through the browser | **server-side, in `call_turns`** |
| Unit economics | not measured | **metered per turn into `usage_events`** |
| Request validation | none | **zod on every body, query and param** |
| Rate limiting / headers | none | **`express-rate-limit` + `helmet`** |
| Logging | `console.log` | **structured `pino`, redacted, request-correlated** |
| Types | hand-written | **generated from the schema; CI fails on drift** |
| **Sign-in** | **none — dashboard wide open** | **one `/signin` with a role toggle, OAuth, reset** |
| **Action Required UI** | **did not exist** | **queue, live badge, batch review, dispatch** |
| **Write actions** | **read-only dashboard** | **book / reschedule / cancel / check-in** |
| **Mobile** | **nav unreachable below 768px** | **bottom tab bar; one nav definition for both** |
| **Patient-facing** | **none** | **WhatsApp portal + a full signed-in record** |
| **Design system** | **—** | **light-first tokens, every ink level ≥ AA** |
| **Review without Supabase** | **—** | **`NEXT_PUBLIC_MOCK=1` serves the whole UI** |
| Tests / CI | none | **65 DB assertions + 66 API tests + typecheck + build** |

**38 tables · 9 views · 133 indexes · 133 RLS policies · 0 tables without RLS.**

`main`'s README lists *"swap to Postgres when going multi-tenant"* under
*Deploying later*. This branch is that swap, plus the API rewrite it forces.

---

## Repository layout

```
apps/
├── api/                  REWRITTEN — Express on Supabase, no SQLite
│   └── src/
│       ├── config/env.ts         zod-validated config; refuses to boot if wrong
│       ├── lib/                  supabase clients, errors, logger, usage, templates
│       ├── middleware/           auth, validation, request context, error handler
│       ├── claude/               lazily-built client, tools, per-clinic prompt
│       ├── tools/                the 4 tools, backed by guarded RPCs
│       └── routes/               clinic doctors patients appointments calls
│                                 analytics actions messages voice
└── web/                  REBUILT — Next.js on the API, with auth
    ├── app/page.tsx              landing page: product, pricing, economics
    ├── app/signin                one door — patient/staff toggle, OAuth, sign-up
    ├── app/forgot-password       reset request (never discloses who exists)
    ├── app/auth/callback         where OAuth and email links land
    ├── app/dashboard             overview · actions · appointments · calls
    │                             patients · analytics
    ├── app/dashboard/settings    AI permissions · doctors & schedule
    │                             hours & closures · knowledge base · staff
    ├── app/me                    signed-in patient record — visits, medicines,
    │                             vaccines, care tasks, bills
    ├── app/p/[token]             WhatsApp portal — no login, logistics only
    ├── components/shell          desktop rail + mobile tabs, one nav definition
    └── lib/
        ├── mock/                 fixtures for NEXT_PUBLIC_MOCK=1
        └── …                     api client, session, hooks, formatting

packages/
└── types/                Database types generated from the schema

supabase/                 the data layer
├── migrations/           18 ordered migrations
├── seed.sql              one pilot clinic with realistic data
└── tests/run.sh          applies everything + 65 assertions, no Docker

scripts/
├── bootstrap-supabase.sh scripts all of Phase 0 — create, push, seed, verify
├── introspect.sql        dumps the live schema as JSON
└── gen-types.py          renders packages/types/database.ts from it

docs/
├── setup.md              Phase 0 runbook — what you must do in Supabase
├── api.md                endpoints, auth model, error codes
├── status.md             what `main` had, and the gap to the Phase 1 wedge
├── data-model.md         table-by-table design rationale
└── security.md           the RLS model and its threat assumptions
```

---

## Migrations

| # | File | Contents |
|---|---|---|
| 0100 | `foundation` | extensions, private `sahva` schema, 34 enums, `touch_updated_at` |
| 0200 | `tenancy_and_staff` | `clinics`, `clinic_settings`, hours, closures, `staff_profiles`, `clinic_members` |
| 0300 | `doctors_and_schedule` | `doctors`, `doctor_sessions`, `doctor_time_off` |
| 0400 | `patients` | `patients`, with family-aware identity |
| 0500 | `appointments` | `appointments` + the no-double-booking EXCLUDE constraint, `appointment_events` |
| 0600 | `calls` | `calls`, `call_turns`, `call_tool_invocations`, `call_summaries` |
| 0700 | `knowledge_base` | `clinic_services`, `clinic_faqs` |
| 0800 | `action_required` | `action_items`, `reschedule_batches`, `reschedule_batch_items` |
| 0900 | `messaging` | `message_templates`, `messages` |
| 1000 | `billing_and_usage` | `plans`, `subscriptions`, `usage_events`, `subscription_invoices` |
| 1100 | `clinical_phase2` | consultations, prescriptions, conditions, vaccinations, care loops, patient invoices |
| 1200 | `functions_access` | `current_clinic_ids()`, `is_member()`, `has_role()`, `assert_clinic_access()` |
| 1300 | `functions_scheduling` | `available_slots()`, `book_appointment()`, `cancel_`, `reschedule_` |
| 1400 | `trust_flow` | the Action Required triggers |
| 1450 | `views` | dashboard views, all `security_invoker` |
| 1500 | `rls` | the policy set — every public table, no exceptions |
| 1700 | `patient_portal` | `patient_access_tokens` — hashed, expiring WhatsApp links |
| 1800 | `patient_accounts` | links an auth user to a patient record |

---

## Three design decisions worth knowing

### 1. The database is the authority, not the model

`book_appointment()` re-checks live availability *inside the transaction*, and
an `EXCLUDE USING gist` constraint on `appointments` makes overlapping bookings
impossible even if that check is bypassed:

```sql
exclude using gist (
  doctor_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status in ('booked','confirmed','checked_in'))
```

Two simultaneous callers can both pass the availability check; only one commits.
A hallucinated slot cannot become a real double booking.

### 2. A doctor going unavailable creates work, never a silent cancellation

Inserting a row into `doctor_time_off` fires a trigger that:

1. opens a **draft** `reschedule_batch`;
2. moves affected appointments to `needs_reschedule` — keeping the row, the
   patient link and the history, and freeing the slot;
3. writes a `flagged_for_reschedule` audit event per appointment;
4. tracks one `reschedule_batch_item` per affected patient;
5. raises one `action_items` row, severity scaled by how soon the window starts.

Nothing is cancelled. No patient is messaged. A CHECK constraint
(`reschedule_batches_human_dispatch`) blocks the batch from leaving draft
without a named human dispatcher.

It is a database trigger rather than application code so the guarantee holds
regardless of which client wrote the row — dashboard, API, or psql.

### 3. Tenant isolation is structural, not conventional

Every tenant table carries `clinic_id` and is covered by RLS keyed on clinic
membership through a single function, `sahva.current_clinic_ids()`.

Underneath that, cross-tenant mixing is blocked by **composite foreign keys**:

```sql
unique (id, clinic_id)                                  -- on doctors, patients
foreign key (doctor_id, clinic_id)
  references public.doctors(id, clinic_id)              -- on appointments
```

Pairing clinic A's doctor with clinic B's patient raises
`foreign_key_violation`. This holds for `service_role` too — which the
telephony webhook must use, since an inbound call carries no user JWT — so the
guarantee survives a bug in the voice agent.

---

## Running the tests

Needs a local PostgreSQL 16 (`brew install postgresql@16`). **No Docker
required.**

```bash
./supabase/tests/run.sh    # database
npm run test:api           # API
npm run typecheck          # both workspaces
```

`run.sh` spins up a throwaway cluster, applies all 18 migrations plus the seed,
and runs 65 assertions covering slot generation, double-booking, the AI
cancellation gate, the trust flow, the append-only audit log, cross-tenant
foreign keys, and RLS isolation across staff, a second clinic's owner, and a
signed-in patient.

```
migrations applied: 18
assertions passed:  65
assertions failed:  0
```

> `run.sh` deliberately does **not** pipe `psql` into `grep`: a pipeline returns
> the exit status of its *last* command, so that pattern throws the failure away
> and reports success while assertions are failing.

---

## Deploying the database

Everything in [`docs/setup.md`](docs/setup.md) that can be scripted, is:

```bash
brew install supabase/tap/supabase jq

SUPABASE_ACCESS_TOKEN=sbp_... \
SAHVA_OWNER_EMAIL=you@example.com \
  ./scripts/bootstrap-supabase.sh
```

It creates the project in `ap-south-1`, pushes every migration, seeds, asserts
that no public table has RLS disabled, mints the first owner and their
`clinic_members` row, writes `.env`, and regenerates the types. It is
idempotent. By hand:

```bash
supabase link --project-ref <ref>
supabase db push
```

The migrations assume hosted Supabase provides `auth.users`, `auth.uid()`,
`auth.role()` and the `anon` / `authenticated` / `service_role` roles.

> `supabase/tests/00_supabase_shim.sql` recreates those locally for testing and
> is **not** a migration. Never apply it to a hosted project.

### Environment

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | project URL |
| `SUPABASE_ANON_KEY` | yes | browser / user-JWT requests |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server only) | telephony webhook, workers. **Never ship to the browser.** |
| `VOICE_API_KEY` | yes | shared secret for machine callers; ≥ 32 chars |
| `ANTHROPIC_API_KEY` | no | only the voice route uses it; without it a voice turn returns `AI_NOT_CONFIGURED` and nothing else is affected |
| `REDIS_URL` | no | rate-limit counters; in-memory and per-instance without it |
| `NEXT_PUBLIC_MOCK` | no | `1` serves the web app from fixtures. **Never set in a deployed environment.** |

---

## Running it for real

```bash
npm install
cp .env.example .env     # fill in the Supabase values
npm run dev
```

Web on <http://localhost:3000>, API on <http://localhost:4000/api/health>.
Sign in at `/signin` with the owner account the bootstrap script created.

Without a `clinic_members` row the API returns
`403 FORBIDDEN — This account is not an active member of any clinic`. That is
correct: the clinic is resolved from membership, never from the request.

> Do not run `npm run build` while `npm run dev` is up — they share
> `apps/web/.next`, and the build will leave the dev server serving 404s for
> every chunk.

---

## Status and next steps

**Done:** the data layer (schema, RLS, scheduling logic, seed, tests), the API
layer (Supabase persistence, real auth, validation, error taxonomy, structured
logging, rate limiting, usage metering, CI), and the frontend (sign-in, tenant
context, Action Required with batch review and dispatch, write actions,
patients, analytics, settings, both patient surfaces, mobile).

**Blocked on accounts, not code:**

| | Needs |
|---|---|
| Live Supabase | A project. Everything so far is verified against local PostgreSQL and fixtures — `scripts/bootstrap-supabase.sh` has never been run against a hosted project. |
| Google OAuth | The provider enabled in the Supabase dashboard with a client ID. The button is wired; the provider is not configured. |
| Telephony | An Exotel/Twilio account and a number per clinic. `POST /api/voice/calls` is already shaped for the webhook. |
| STT / TTS | Sarvam or Deepgram. Turns are currently text in, text out. |
| WhatsApp | A Meta Cloud API account and pre-approved templates. Messages render and queue; nothing sends them. |
| Workers | Nothing is scheduled yet — reminders and batch dispatch do not run. |

**Not blocked on accounts:** the landing page still has no real proof on it —
no clinic name, no testimonial, no founder — and the demo number is the seed's
fake one. And the blueprint's Weeks 1–2, *talk to 8–10 clinic owners*, has not
happened. That is the only item that says whether any of this was worth
building.

---

## One correction to the product blueprint

Using the blueprint's own quoted vendor rates (STT ₹40/hr, TTS ₹22 per 10k
chars, telephony ₹0.50/min, GPT-4o-mini-class LLM), a seeded 108-second call
costs:

| Component | ₹ |
|---|---|
| STT | 1.200 |
| TTS | 1.408 |
| LLM | 0.080 |
| Telephony | 0.900 |
| **Total** | **3.588** |

100 calls/month ≈ **₹359**, not the "comfortably under ₹200–300" the blueprint
assumes — that range is only reachable at the low end of every vendor quote
simultaneously. **TTS, not STT, is the largest line item.**

Gross margin on a ₹999 Starter tier is still ~64%, so the pricing holds, but
the estimate should be corrected before it goes in a deck. `v_call_costs` gives
the real figure off actual pilot calls — measure before finalising.

---

## Further reading

- [`docs/setup.md`](docs/setup.md) — Phase 0, scripted and by hand
- [`docs/status.md`](docs/status.md) — what `main` has, and the gap to the Phase 1 wedge
- [`docs/data-model.md`](docs/data-model.md) — table-by-table rationale, and known limitations
- [`docs/security.md`](docs/security.md) — the RLS model, its trade-offs, and what it does not cover
