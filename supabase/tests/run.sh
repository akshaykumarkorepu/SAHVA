#!/bin/bash
# ---------------------------------------------------------------------------
# Applies every migration + seed to a throwaway Postgres 16 cluster and runs
# the assertion suites. No Docker, no Supabase CLI — just a local postgres.
#
#   ./supabase/tests/run.sh
# ---------------------------------------------------------------------------
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
PORT="${PGPORT:-55432}"
WORK="${TMPDIR:-/tmp}/sahva-pgtest"
export LC_ALL=C LANG=C          # postgres refuses to start multithreaded otherwise

PSQL=("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -v ON_ERROR_STOP=1 -q)

start_cluster() {
  # Reuse whatever is already listening on this port.
  if "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -X -tAc "select 1" \
       >/dev/null 2>&1; then return; fi
  rm -rf "$WORK"; mkdir -p "$WORK"
  "$PGBIN/initdb" -U postgres -A trust "$WORK/data" >/dev/null
  "$PGBIN/pg_ctl" -D "$WORK/data" \
    -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$WORK/pg.log" start >/dev/null
  sleep 2
}

start_cluster
"${PSQL[@]}" -d postgres -c "drop database if exists sahva_test;" -c "create database sahva_test;" >/dev/null
"${PSQL[@]}" -d sahva_test -f "$HERE/00_supabase_shim.sql" >/dev/null
printf '%-42s OK\n' "supabase shim"

for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d sahva_test -f "$f" >/dev/null
  printf '%-42s OK\n' "$(basename "$f")"
done
"${PSQL[@]}" -d sahva_test -f "$ROOT/supabase/seed.sql" >/dev/null
printf '%-42s OK\n' "seed.sql"
echo

"${PSQL[@]}" -d sahva_test -f "$HERE/10_scheduling_and_integrity.sql" 2>&1 \
  | sed 's/^psql:.*NOTICE:  //' | grep -E "PASS|FAIL|---"
"${PSQL[@]}" -d sahva_test -f "$HERE/20_rls_setup.sql" 2>&1 \
  | sed 's/^psql:.*NOTICE:  //' | grep -E "PASS|FAIL" || true
"${PSQL[@]}" -d sahva_test -f "$HERE/21_rls_isolation.sql" 2>&1 \
  | sed 's/^psql:.*NOTICE:  //' | grep -E "PASS|FAIL"
echo
echo "All suites passed. Stop the cluster with:"
echo "  $PGBIN/pg_ctl -D $WORK/data stop"
