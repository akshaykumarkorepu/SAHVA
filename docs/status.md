# Where the project stood before this branch

Audit of `main` at commit `fb4ac01` ("Add Supabase authentication foundation"),
dated 2026-09-25. Scope is this repository only.

## What exists on `main`

`main` is the **ClinicVoice demo**, not the product. ~3,050 lines of TypeScript
across two workspaces:

| Area | State |
|---|---|
| Conversation AI | Real. Claude with four tools: `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`. |
| Voice pipeline | Browser Web Speech API for STT and `speechSynthesis` for TTS. No Sarvam, no Deepgram, no telephony. |
| Persistence | **SQLite** (`better-sqlite3`), single file, five tables, seeded on boot. One clinic, hardcoded. |
| Dashboard | Next.js 14 + Tailwind + Recharts. KPIs, calls log, appointments calendar, analytics. |
| WhatsApp | Mock preview component only. |
| Auth | See below. |

The README on `main` is explicit that this is a demo: telephony and WhatsApp
are simulated, multi-tenant auth is out of scope, and "swap to Postgres when
going multi-tenant" is listed under *Deploying later*. This branch is that swap.

## What commit `fb4ac01` actually added

Three things, none of them wired up:

- `@supabase/supabase-js` in `apps/api/package.json`
- `apps/api/src/lib/supabase.ts` — a scoped-client factory
- `apps/api/src/middleware/auth.ts` — a JWT-validating middleware

`authenticate` is **never mounted**. `apps/api/src/index.ts` registers eight
routers and no middleware, and nothing in the codebase imports it. There were
no Supabase tables, no RLS and no migrations. Every read and write still went
to SQLite. As of `fb4ac01`, Supabase was dead code.

## Gap to the Phase 1 wedge

| Blueprint capability | On `main` | On this branch |
|---|---|---|
| Bilingual telephony + voice stack | Browser only | unchanged — app-layer work |
| Live schedule orchestration | TypeScript against SQLite | `sahva.available_slots()`, computed per call |
| Clinic-specific knowledge base | Hardcoded in the system prompt | `clinic_faqs` + `clinic_services`, RLS-scoped |
| Action Required / exception flow | Did not exist | implemented as a trigger, tested |
| Staff operations dashboard | Exists, single-tenant | schema + views ready; UI not started |
| Multi-tenant auth | Not functional | `auth.users` → `clinic_members` → 120 RLS policies |

## What `main`'s SQLite schema was missing

Beyond being single-tenant: no link to `auth.users` and no RLS, so isolation
was application-only; no `doctor_time_off`, so the Action Required flow had
nowhere to start; no knowledge base; no usage metering, so cost-per-call could
not be measured; and no protection against double-booking beyond application
code.

## Consequence for the app layer

`main`'s SQLite schema and this branch's Supabase schema disagree on almost
everything: integer vs uuid keys, `starts_at` as text vs `timestamptz`, a JSON
`transcript` column vs `call_turns` rows, and no tenant column vs `clinic_id`
on every table.

`apps/api/src/db/client.ts`, `seed.ts` and all eight routers need rewriting
against `@supabase/supabase-js` rather than migrating in place. The four Claude
tools in `apps/api/src/tools/appointments.ts` map cleanly onto the new RPCs
(`get_available_slots`, `book_appointment`, `reschedule_appointment`,
`cancel_appointment`), which is the smallest useful first step.

**Nothing under `apps/` is modified on this branch.** The demo still runs
exactly as it does on `main`.
