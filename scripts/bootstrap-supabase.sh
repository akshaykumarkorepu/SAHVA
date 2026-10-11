#!/usr/bin/env bash
# =============================================================================
# SAHVA · Supabase bootstrap
#
# Everything in docs/setup.md Phase 0 that can be scripted, in one run:
# create (or adopt) the project, push the migrations, seed, verify RLS, mint the
# first owner, write .env, generate types.
#
# Idempotent: safe to re-run. Each step checks the live state first.
#
# Needs SUPABASE_ACCESS_TOKEN — a Personal Access Token from
#   https://supabase.com/dashboard/account/tokens
# The CLI uses it for migrations and the Management API uses it for SQL, so it
# is the only credential required. Revoke it when you are done.
#
#   SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/bootstrap-supabase.sh
#
# Options (env):
#   SAHVA_PROJECT_REF   adopt an existing project instead of creating one
#   SAHVA_DB_PASSWORD   optional. Given, migrations go over a direct Postgres
#                       connection via `supabase db push`. Omitted, they go
#                       through the Management API on the access token alone —
#                       which is the only option for a project whose password
#                       you no longer have, since it can be reset but not read.
#   SAHVA_REGION        default ap-south-1 (Mumbai) — see setup.md on residency
#   SAHVA_PROJECT_NAME  default sahva
#   SAHVA_OWNER_EMAIL   staff owner to create; skipped if unset
#   SAHVA_ORG_ID        org to create in; auto-detected when you have only one
# =============================================================================
set -euo pipefail

REGION="${SAHVA_REGION:-ap-south-1}"
PROJECT_NAME="${SAHVA_PROJECT_NAME:-sahva}"
API="https://api.supabase.com/v1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  %s\n' "$*"; }
ok()    { printf '  \033[32m/\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '\n\033[31mx %s\033[0m\n' "$*" >&2; exit 1; }
step()  { printf '\n'; bold "-- $* "; }

# --- 0. preflight ------------------------------------------------------------
step "Preflight"
command -v supabase >/dev/null || die "supabase CLI missing. brew install supabase/tap/supabase"
command -v jq        >/dev/null || die "jq missing. brew install jq"
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || die "SUPABASE_ACCESS_TOKEN not set. Create one at https://supabase.com/dashboard/account/tokens"
[[ -d supabase/migrations ]] || die "run this from the repo root"
ok "supabase $(supabase --version)"
ok "$(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations on disk"

api() { # api <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H 'Content-Type: application/json' -d "$body"
  else
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
  fi
}

# Run SQL on the project without needing a direct DB route.
sql() { api POST "/projects/$REF/database/query" "$(jq -nc --arg q "$1" '{query:$q}')"; }

orgs_json="$(api GET "/organizations")"
echo "$orgs_json" | jq -e 'type == "array"' >/dev/null 2>&1 \
  || die "token rejected by Supabase: $(echo "$orgs_json" | jq -r '.message? // .' 2>/dev/null)"
ok "token accepted - $(echo "$orgs_json" | jq -r 'length') organization(s)"

# --- 1. resolve the project --------------------------------------------------
step "Project"
if [[ -n "${SAHVA_PROJECT_REF:-}" ]]; then
  REF="$SAHVA_PROJECT_REF"
  # The db password is optional when adopting: without it the migrations go
  # through the Management API instead of a direct Postgres connection, which
  # needs nothing but the access token. A project's password cannot be read
  # back from the dashboard, only reset, so not requiring it matters.
  DB_PASSWORD="${SAHVA_DB_PASSWORD:-}"
  proj="$(api GET "/projects/$REF")"
  echo "$proj" | jq -e '.id' >/dev/null 2>&1 || die "no project $REF on this account"
  ok "adopting $(echo "$proj" | jq -r '.name') ($REF) in $(echo "$proj" | jq -r '.region')"
  [[ "$(echo "$proj" | jq -r '.region')" == "ap-south-1" ]] \
    || warn "region is $(echo "$proj" | jq -r '.region'), not ap-south-1 - see setup.md on latency and data residency"
else
  existing="$(api GET "/projects" | jq -r --arg n "$PROJECT_NAME" '.[] | select(.name==$n) | .id' | head -1)"
  if [[ -n "$existing" ]]; then
    REF="$existing"
    DB_PASSWORD="${SAHVA_DB_PASSWORD:-}"
    ok "reusing existing '$PROJECT_NAME' ($REF)"
  else
    ORG="${SAHVA_ORG_ID:-$(echo "$orgs_json" | jq -r 'if length==1 then .[0].id else "" end')}"
    [[ -n "$ORG" ]] || die "several organizations - set SAHVA_ORG_ID to one of: $(echo "$orgs_json" | jq -r '.[] | "\(.id) (\(.name))"' | paste -sd', ' -)"
    DB_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
    info "creating '$PROJECT_NAME' in $REGION - this takes a minute or two"
    created="$(api POST "/projects" "$(jq -nc \
      --arg n "$PROJECT_NAME" --arg o "$ORG" --arg r "$REGION" --arg p "$DB_PASSWORD" \
      '{name:$n, organization_id:$o, region:$r, db_pass:$p}')")"
    REF="$(echo "$created" | jq -r '.id // empty')"
    [[ -n "$REF" ]] || die "create failed: $(echo "$created" | jq -r '.message? // .')"
    ok "created $REF"
    printf '%s\n' "$DB_PASSWORD" > .supabase-db-password
    chmod 600 .supabase-db-password
    ok "db password saved to .supabase-db-password (gitignored) - move it to your password manager"
  fi
fi

info "waiting for the database to come up"
for i in $(seq 1 60); do
  status="$(api GET "/projects/$REF" | jq -r '.status // "UNKNOWN"')"
  [[ "$status" == "ACTIVE_HEALTHY" ]] && { ok "status $status"; break; }
  [[ $i -eq 60 ]] && die "project still $status after 10 minutes"
  sleep 10
done

# --- 2. push the migrations --------------------------------------------------
step "Schema"

# Apply one file and record it, exactly as `supabase db push` would, so the CLI
# stays in sync and a later `db push` is a no-op rather than a replay.
push_one_via_api() {
  local file="$1" version="$2" name="$3" resp
  resp="$(api POST "/projects/$REF/database/query" "$(jq -nc --rawfile q "$file" '{query:$q}')")"
  if echo "$resp" | jq -e 'type=="object" and has("message")' >/dev/null 2>&1; then
    die "$(basename "$file") failed: $(echo "$resp" | jq -r '.message')"
  fi
  # version and name come from the filename, which the loop below has already
  # constrained to digits and [a-z_], so there is nothing to quote-escape.
  sql "insert into supabase_migrations.schema_migrations (version, name)
       values ('$version', '$name') on conflict (version) do nothing" >/dev/null
}

if [[ -n "$DB_PASSWORD" ]]; then
  supabase link --project-ref "$REF" --password "$DB_PASSWORD" >/dev/null 2>&1 \
    || die "link failed - wrong db password for $REF?"
  ok "linked"
  supabase db push --linked --password "$DB_PASSWORD" --include-all --yes \
    || die "db push failed - nothing below ran"
  ok "migrations applied"
else
  info "no db password given - applying migrations over the Management API"
  sql "create schema if not exists supabase_migrations;
       create table if not exists supabase_migrations.schema_migrations (
         version text primary key, statements text[], name text )" >/dev/null
  applied="$(sql "select coalesce(string_agg(version, ' '), '') as v from supabase_migrations.schema_migrations" | jq -r '.[0].v')"
  count=0
  for f in supabase/migrations/*.sql; do
    base="$(basename "$f" .sql)"
    version="${base%%_*}"
    name="${base#*_}"
    [[ "$version" =~ ^[0-9]+$ && "$name" =~ ^[a-z0-9_]+$ ]] \
      || die "unexpected migration filename: $base"
    if [[ " $applied " == *" $version "* ]]; then
      info "  $base - already applied"
      continue
    fi
    info "  $base"
    push_one_via_api "$f" "$version" "$name"
    count=$((count + 1))
  done
  ok "$count migration(s) applied, $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') on disk"
fi

# --- 3. seed -----------------------------------------------------------------
step "Seed"
seeded="$(sql "select count(*)::int from public.clinics where slug='sri-sai-warangal'" | jq -r '.[0].count // 0')"
if [[ "$seeded" == "0" ]]; then
  resp="$(api POST "/projects/$REF/database/query" "$(jq -nc --rawfile q supabase/seed.sql '{query:$q}')")"
  echo "$resp" | jq -e 'type=="object" and has("message")' >/dev/null 2>&1 \
    && die "seed failed: $(echo "$resp" | jq -r '.message')"
  ok "seed applied"
else
  ok "already seeded - skipped"
fi

# --- 4. verify ---------------------------------------------------------------
step "Verify"
policies="$(sql "select count(*)::int from pg_policies where schemaname='public'" | jq -r '.[0].count')"
unguarded="$(sql "select count(*)::int from pg_tables where schemaname='public' and not rowsecurity" | jq -r '.[0].count')"
tables="$(sql "select count(*)::int from pg_tables where schemaname='public'" | jq -r '.[0].count')"
actions="$(sql "select count(*)::int from v_open_action_items" | jq -r '.[0].count')"

info "tables:            $tables"
info "RLS policies:      $policies   (expected 133)"
info "tables w/o RLS:    $unguarded   (must be 0)"
info "open action items: $actions   (seed creates 1)"
[[ "$unguarded" == "0" ]] || die "$unguarded table(s) have RLS disabled - fix before any real data"
ok "every public table has RLS enabled"

# --- 5. first owner ----------------------------------------------------------
step "Owner"
if [[ -n "${SAHVA_OWNER_EMAIL:-}" ]]; then
  SERVICE_KEY="$(supabase projects api-keys --project-ref "$REF" --reveal -o json \
    | jq -r '.[] | select(.name=="service_role" or .name=="secret") | .api_key' | head -1)"
  URL="https://$REF.supabase.co"
  uid="$(curl -sS "$URL/auth/v1/admin/users?per_page=1000" \
          -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
        | jq -r --arg e "$SAHVA_OWNER_EMAIL" '.users[]? | select(.email==$e) | .id' | head -1)"
  if [[ -z "$uid" ]]; then
    OWNER_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")"
    uid="$(curl -sS -X POST "$URL/auth/v1/admin/users" \
            -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
            -H 'Content-Type: application/json' \
            -d "$(jq -nc --arg e "$SAHVA_OWNER_EMAIL" --arg p "$OWNER_PASSWORD" \
                  '{email:$e, password:$p, email_confirm:true}')" | jq -r '.id // empty')"
    [[ -n "$uid" ]] || die "could not create the auth user"
    printf 'email: %s\npassword: %s\n' "$SAHVA_OWNER_EMAIL" "$OWNER_PASSWORD" > .supabase-owner-login
    chmod 600 .supabase-owner-login
    ok "auth user created - credentials in .supabase-owner-login (gitignored). Change this password."
  else
    ok "auth user already exists"
  fi
  sql "insert into public.clinic_members (clinic_id, staff_id, role, status, joined_at)
       select c.id, '$uid', 'owner', 'active', now() from public.clinics c
        where c.slug = 'sri-sai-warangal'
          and not exists (select 1 from public.clinic_members m
                           where m.clinic_id = c.id and m.staff_id = '$uid')" >/dev/null
  members="$(sql "select count(*)::int from public.clinic_members where staff_id='$uid'" | jq -r '.[0].count')"
  [[ "$members" != "0" ]] || die "clinic_members row not created - the API would return 403 FORBIDDEN"
  ok "owner is an active member of $members clinic(s)"
else
  warn "SAHVA_OWNER_EMAIL not set - no staff login created. The dashboard will show 'No clinic yet'."
fi

# --- 6. .env -----------------------------------------------------------------
step "Environment"
keys="$(supabase projects api-keys --project-ref "$REF" --reveal -o json)"
ANON="$(echo "$keys" | jq -r '.[] | select(.name=="anon" or .name=="publishable") | .api_key' | head -1)"
SERVICE="$(echo "$keys" | jq -r '.[] | select(.name=="service_role" or .name=="secret") | .api_key' | head -1)"
URL="https://$REF.supabase.co"
[[ -n "$ANON" && -n "$SERVICE" ]] || die "could not read the project API keys"

if [[ -f .env ]]; then
  cp .env ".env.backup.$(date +%s)"
  warn ".env existed - backed up"
fi
VOICE_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
ANTHROPIC="${ANTHROPIC_API_KEY:-}"

cat > .env <<ENV
NODE_ENV=development
PORT=4000
LOG_LEVEL=info

SUPABASE_URL=$URL
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE

NEXT_PUBLIC_SUPABASE_URL=$URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
NEXT_PUBLIC_API_BASE=http://localhost:4000

ANTHROPIC_API_KEY=$ANTHROPIC
ANTHROPIC_MODEL=claude-sonnet-4-6

VOICE_API_KEY=$VOICE_KEY

CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
ENV
chmod 600 .env
ok ".env written (service-role key is server-side only; never NEXT_PUBLIC_)"
[[ -n "$ANTHROPIC" ]] || warn "ANTHROPIC_API_KEY is empty - the API exits on boot until you fill it in"

# --- 7. types ----------------------------------------------------------------
step "Types"
if supabase gen types typescript --linked > "/tmp/sahva-types.$$" 2>/dev/null && [[ -s "/tmp/sahva-types.$$" ]]; then
  mv "/tmp/sahva-types.$$" packages/types/database.ts
  ok "packages/types/database.ts regenerated from the live schema"
else
  rm -f "/tmp/sahva-types.$$"
  warn "type generation failed - 'npm run gen:types' against local PG still works"
fi

# --- done --------------------------------------------------------------------
printf '\n'
bold "Done."
info "project   $REF  ($REGION)"
info "url       $URL"
info "dashboard https://supabase.com/dashboard/project/$REF"
printf '\n'
info "Next:"
info "  npm install"
info "  npm run dev          # api :4000, web :3000"
info "  open http://localhost:3000/login"
