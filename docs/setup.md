# Setup runbook

Phase 0 of the build plan. Steps marked **you** need your Supabase dashboard and
cannot be scripted from here.

---

## Just want to look at it? Mock mode

No Supabase, no API process, no keys — the whole dashboard and patient portal
served from fixtures:

```bash
npm install
NEXT_PUBLIC_MOCK=1 npm run dev -w apps/web
```

Open <http://localhost:3000>. Sign-in is bypassed; every screen shows the same
Sri Sai Clinic the seed creates, including the Action Required queue and its
reschedule-review flow. Writes mutate the fixtures in memory, so resolving an
item or dispatching a batch behaves correctly until you reload.

The fixtures live in `apps/web/lib/mock/`. They are a review and demo aid, not
a test double — the tests run against real Postgres. `NEXT_PUBLIC_MOCK` must
never be set in a deployed environment; with it unset the bundler drops the
fixtures entirely.

Use this to show someone the product. Use the rest of this document to run it
for real.

---

## The short path

Steps 1–6 below are automated. Create a Personal Access Token at
<https://supabase.com/dashboard/account/tokens> and run:

```bash
brew install supabase/tap/supabase jq

SUPABASE_ACCESS_TOKEN=sbp_... \
SAHVA_OWNER_EMAIL=you@example.com \
  ./scripts/bootstrap-supabase.sh
```

`SUPABASE_ACCESS_TOKEN` is the only credential the database needs. No Anthropic
key is involved in any of it — the schema, seed, RLS checks and owner row are
pure Postgres.

Pass `ANTHROPIC_API_KEY=sk-ant-...` too if you have one. It is used in exactly
one place — the voice route in `apps/api/src/routes/voice.ts` — and nothing
else reads it. **But the API refuses to boot without it** (`config/env.ts`
requires it), so until you have a key, `npm run dev` will not start even though
the database is fully set up. See "The Anthropic key blocks boot" below.

That creates the project in `ap-south-1`, pushes every migration, seeds, asserts
RLS is on for every table, mints your owner login, writes `.env`, and
regenerates `packages/types/database.ts`. It is idempotent — re-run it freely.

The token is account-wide: revoke it when you are done. The generated database
password lands in `.supabase-db-password` and the owner login in
`.supabase-owner-login` — both gitignored. Move them to a password manager and
delete the files.

Read the rest if you would rather do it by hand, or if the script stops on
something.

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
brew install supabase/tap/supabase     # `npm i -g supabase` needs sudo
supabase login
supabase link --project-ref <your-ref>
supabase db push
```

Then run `supabase/seed.sql` in the SQL editor (it is idempotent).

Verify:

```sql
select count(*) from pg_policies where schemaname = 'public';   -- 133
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

> **The user needs `account_type: "staff"` in its metadata**, or none of this
> works. `sahva.handle_new_auth_user()` returns early for anything that is not
> explicitly staff — patients are not staff — so without it no `staff_profiles`
> row is created and the `clinic_members` insert above fails its foreign key.
>
> In the dashboard that is the **User Metadata** box on *Add user*:
>
> ```json
> { "account_type": "staff" }
> ```
>
> For a user that already exists without it, set the metadata and insert the
> profile by hand:
>
> ```sql
> insert into public.staff_profiles (id, full_name)
> values ('<the-auth-user-uuid>', 'Your Name')
> on conflict (id) do nothing;
> ```

With that metadata set, `staff_profiles` is created automatically by the
`on_auth_user_created` trigger.

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
npm run dev              # api on :4000, web on :3000
```

The web app needs the browser-side variables too — only the **anon** key:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

Sign in at <http://localhost:3000/login> with the user you created in step 3.
Without a `clinic_members` row you will see "No clinic yet" — that is the
system working, not a bug.

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
all 18 migrations plus the seed to a throwaway cluster and runs 65 assertions.

---

## The Anthropic key blocks boot

`ANTHROPIC_API_KEY` is read in one file, `apps/api/src/claude/client.ts`, and
used by one route, `routes/voice.ts` — the AI receptionist's conversation turns
and the end-of-call summary. The dashboard, the patient surfaces and the whole
database never touch it.

It is nonetheless **required at boot**: `config/env.ts` validates it and calls
`process.exit(1)`, and `index.ts` imports the voice route unconditionally, which
constructs the Anthropic client eagerly at module load. So a missing key takes
down the entire API — including every screen that has nothing to do with AI.

That is backwards for a feature that cannot run anyway: there is no carrier, no
STT and no TTS (see below), so the voice route has no live path today.

To run the dashboard without a key, make the key optional and the client lazy:

- `config/env.ts` — `ANTHROPIC_API_KEY: z.string().min(10).optional()`
- `claude/client.ts` — build the client inside a function, and throw a clear
  `AI_NOT_CONFIGURED` error when the key is absent rather than at import time

The voice route then fails loudly when called without a key, and every other
route works. Not yet done.

## Not wired yet

| | |
|---|---|
| Telephony | No carrier. `POST /api/voice/calls` exists and is shaped for a webhook, but nothing dials it. |
| STT / TTS | No Sarvam or Deepgram. Turns are text in, text out. |
| WhatsApp | Messages render and queue; nothing sends them. No Meta account. |
| Workers | Nothing scheduled. Reminders and batch dispatch are not running. |
| Onboarding wizard | No guided setup yet — configure a clinic through Settings. |

### The browser voice demo is gone

`main`'s `/call` page drove the AI from a laptop microphone. That endpoint now
sits behind a service key which must never reach a browser, so the page was
removed rather than left broken or made insecure. Demoing the voice pipeline
needs real telephony.

`main` still has the old browser demo if you need to show something today.
