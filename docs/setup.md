# Setup runbook

Phase 0 of the build plan. Steps marked **you** need your Supabase dashboard and
cannot be scripted from here.

---

## 1. Create the Supabase project — in Mumbai (**you**)

The existing project is in **Tokyo**. Move before there is any real patient
data: this is ten minutes now and a data migration later.

1. Supabase dashboard → **New project**
2. Region: **South Asia (Mumbai) `ap-south-1`**
3. Save the database password somewhere safe
4. Archive or delete the Tokyo project so nothing points at it by accident

Two reasons, both real:

- **Latency.** Every query crosses to Japan and back, inside a voice turn
  budgeted at ~1.2 seconds end-to-end.
- **Data residency.** Indian patient health data in Japan is at minimum a
  question every clinic owner will ask. Whether it is a legal obligation under
  the DPDP Act needs someone who knows the Act — do not guess, and do not let
  "Supabase is compliant" stand in for your own obligations.

## 2. Push the schema (**you**)

```bash
npm i -g supabase
supabase link --project-ref <your-ref>
supabase db push
```

Then run `supabase/seed.sql` in the SQL editor (it is idempotent).

Verify:

```sql
select count(*) from pg_policies where schemaname = 'public';   -- 120
select count(*) from pg_tables where schemaname='public' and not rowsecurity; -- 0
select * from v_open_action_items;                              -- the seeded item
```

The Supabase linter should report no "RLS disabled" warnings. If it does, stop
and fix that before anything else.

## 3. Create the first owner (**you**)

Self-signup is off (`supabase/config.toml`), so staff are invited:

1. Dashboard → Authentication → **Add user** → your email
2. Copy the user's UUID
3. In the SQL editor:

```sql
insert into public.clinic_members (clinic_id, staff_id, role, status, joined_at)
values (
  (select id from public.clinics where slug = 'sri-sai-warangal'),
  '<the-auth-user-uuid>',
  'owner', 'active', now()
);
```

`staff_profiles` is created automatically by the `on_auth_user_created` trigger.

Without a `clinic_members` row, the API returns
`403 FORBIDDEN — This account is not an active member of any clinic`. That is
correct: the clinic is resolved from membership, never from the request.

## 4. Configure the API

```bash
cp .env.example .env
```

Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(Project Settings → API), `ANTHROPIC_API_KEY`, and generate a service key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The API validates all of this on boot and exits with a list of what is missing,
rather than starting and failing on the first patient call.

> `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS completely**. Server-side only.
> Never in the browser, never `NEXT_PUBLIC_`.

## 5. Run it

```bash
npm install
npm run dev:api          # http://localhost:4000/api/health
```

Check auth is actually on:

```bash
curl -s localhost:4000/api/clinic
# {"error":{"code":"UNAUTHENTICATED","message":"Missing bearer token"},...}
```

To call a staff route, get a token:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .access_token
```

```bash
curl -s localhost:4000/api/clinic -H "Authorization: Bearer $TOKEN"
```

## 6. Regenerating types

`packages/types/database.ts` is generated, never hand-edited. Either generator
works; CI uses the second because it needs no Supabase credentials.

```bash
supabase gen types typescript --linked > packages/types/database.ts   # canonical
npm run gen:types                                                     # from a local PG
```

CI regenerates and fails the build if the file is stale, so the types cannot
drift from the tables.

## 7. Running the database tests

```bash
./supabase/tests/run.sh
```

Needs a local PostgreSQL 16 (`brew install postgresql@16`). No Docker. Applies
all 16 migrations plus the seed to a throwaway cluster and runs 46 assertions.

---

## Not wired yet

| | |
|---|---|
| Telephony | No carrier. `POST /api/voice/calls` exists and is shaped for a webhook, but nothing dials it. |
| STT / TTS | No Sarvam or Deepgram. Turns are text in, text out. |
| WhatsApp | Messages render and queue; nothing sends them. No Meta account. |
| Workers | Nothing scheduled. Reminders and batch dispatch are not running. |
| Frontend | `apps/web` still calls the old demo endpoints and will not work against this API. See below. |

### The frontend is currently broken against this API

This is expected, not an accident. `apps/web` was written for the single-tenant
SQLite demo: it calls `/api/voice/turn`, sends no `Authorization` header, and
assumes integer ids. Every one of those is now wrong.

`main` still has the working demo if you need to show something today. Phase 2
rebuilds the frontend against this API.
