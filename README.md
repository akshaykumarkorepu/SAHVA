# SAHVA

**Telugu-and-English AI receptionist for solo and small clinics in Tier 2/3 towns.**
It answers every call, books real appointments off live availability, and never
lets a schedule change silently cancel a patient without staff knowing.

> **Branch: `saikirans-version`** — maintained by Saikiran.
> This branch replaces the demo's data and API layers with production ones:
> a multi-tenant Supabase schema, and an Express API rewritten on top of it with
> real authentication.
>
> The frontend has been rebuilt against it: login, tenant context, the Action
> Required queue, write actions and a mobile layout that works.

---

## What's in this branch

| | `main` | `saikirans-version` |
|---|---|---|
| Database | SQLite, one hardcoded clinic | **Supabase / PostgreSQL, multi-tenant** |
| Tenant isolation | none | **120 RLS policies + composite foreign keys** |
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
| **Staff login** | **none — dashboard wide open** | **Supabase Auth + role-aware nav** |
| **Action Required UI** | **did not exist** | **queue, live badge, batch review, dispatch** |
| **Write actions** | **read-only dashboard** | **book / reschedule / cancel / check-in** |
| **Mobile** | **nav unreachable below 768px** | **drawer; one nav definition for both** |
| Tests / CI | none | **46 DB assertions + typecheck + build, in CI** |

**37 tables · 6 views · 128 indexes · 120 RLS policies · 0 tables without RLS.**

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
│       ├── claude/               client, tool definitions, per-clinic system prompt
│       ├── tools/                the 4 tools, backed by guarded RPCs
│       └── routes/               clinic doctors patients appointments calls
│                                 analytics actions messages voice
└── web/                  REBUILT — Next.js on the API, with auth
    ├── app/login                 Supabase Auth sign-in
    ├── app/dashboard             overview · actions · appointments
    │                             calls · patients · analytics · settings
    ├── components/shell          sidebar + mobile drawer, one nav definition
    └── lib/                      api client, session, hooks, formatting

packages/
└── types/                NEW — Database types generated from the schema

supabase/                 the data layer
├── migrations/           16 ordered migrations
├── seed.sql              one pilot clinic with realistic data
└── tests/run.sh          applies everything + 46 assertions, no Docker

scripts/
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
| 0100 | `foundation` | extensions, private `sahva` schema, 30 enums, `touch_updated_at` |
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
| 1450 | `views` | six dashboard views, all `security_invoker` |
| 1500 | `rls` | 120 policies across 37 tables |

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
./supabase/tests/run.sh
```

Spins up a throwaway cluster, applies all 16 migrations plus the seed, and runs
46 assertions covering slot generation, double-booking, the AI cancellation
gate, the trust flow, the append-only audit log, cross-tenant foreign keys and
RLS isolation across three users and two clinics.

```
migrations applied: 18
assertions passed:  46
assertions failed:  0
```

---

## Deploying the database

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
| `ANTHROPIC_API_KEY` | yes | conversation AI |

---

## Running the demo (unchanged from `main`)

```bash
npm install
cp .env.example .env     # set ANTHROPIC_API_KEY
npm run dev
```

Web on <http://localhost:3000>, API on <http://localhost:4000/api/health>.
The demo still uses its own SQLite file; it has not yet been rewired to
Supabase.

---

## Status and next steps

**Done:** the data layer (schema, RLS, scheduling logic, seed, tests) and the
API layer (Supabase persistence, real auth, validation, error taxonomy,
structured logging, rate limiting, usage metering, CI).

**Blocked on accounts, not code:**

| | Needs |
|---|---|
| Telephony | An Exotel/Twilio account and a number per clinic. `POST /api/voice/calls` is already shaped for the webhook. |
| STT / TTS | Sarvam or Deepgram. Turns are currently text in, text out. |
| WhatsApp | A Meta Cloud API account and pre-approved templates. Messages render and queue; nothing sends them. |
| Workers | Nothing is scheduled yet — reminders and batch dispatch do not run. |

**Frontend (Phase 2) is done:** login, tenant context, the Action Required
queue with batch review and dispatch, write actions, patients, analytics with
measured cost, settings, and a working mobile layout.

**Next:** connect a live Supabase project (`docs/setup.md`) and test end to
end. After that, the vendor integrations above — telephony first, since
nothing else can be proven with a real clinic until a real phone rings.

Still using the Supabase table editor: editing doctors, weekly sessions, clinic
hours and the FAQ knowledge base. Those screens are not built yet.

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

- [`docs/status.md`](docs/status.md) — what `main` has, and the gap to the Phase 1 wedge
- [`docs/data-model.md`](docs/data-model.md) — table-by-table rationale, and known limitations
- [`docs/security.md`](docs/security.md) — the RLS model, its trade-offs, and what it does not cover
