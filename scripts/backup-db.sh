#!/bin/bash
# ---------------------------------------------------------------------------
# Encrypted backup of the hosted SAHVA database, for while the Supabase plan
# has no managed backups (the free plan has none). The dump holds every
# patient's data, so it is NEVER written unencrypted: it is piped straight
# into `age` for the recipient in SAHVA_BACKUP_RECIPIENT.
#
#   brew install postgresql@17 age           # pg_dump must match the server (17)
#   age-keygen -o ~/sahva-backup.key         # once; keep this key OFF this laptop
#   export SAHVA_BACKUP_RECIPIENT=age1...    # the public key it printed
#   ./scripts/backup-db.sh                   # → ~/sahva-backups/sahva-<time>.dump.age
#
# Restore (into an empty database):
#   age -d -i ~/sahva-backup.key sahva-<time>.dump.age | pg_restore --no-owner -d "<url>"
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/postgresql@17/bin/pg_dump}"
[ -x "$PG_DUMP" ] || { echo "pg_dump 17 not found ($PG_DUMP). brew install postgresql@17"; exit 1; }
command -v age >/dev/null || { echo "age not found. brew install age"; exit 1; }
[ -n "${SAHVA_BACKUP_RECIPIENT:-}" ] || { echo "Set SAHVA_BACKUP_RECIPIENT to your age public key (age-keygen). Refusing to write an unencrypted dump."; exit 1; }
[ -f supabase/.temp/pooler-url ] && [ -f .supabase-db-password ] || { echo "Run from a linked checkout (supabase link) with .supabase-db-password present."; exit 1; }

OUT_DIR="${SAHVA_BACKUP_DIR:-$HOME/sahva-backups}"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
OUT="$OUT_DIR/sahva-$(date +%Y%m%d-%H%M).dump.age"

PGPASSWORD="$(cat .supabase-db-password)" "$PG_DUMP" "$(cat supabase/.temp/pooler-url)" \
  --format=custom --no-owner --no-privileges \
  --schema=public --schema=sahva --schema=auth \
  | age -r "$SAHVA_BACKUP_RECIPIENT" -o "$OUT"

chmod 600 "$OUT"
echo "Encrypted backup: $OUT ($(du -h "$OUT" | cut -f1))"
# Keep the last 14.
ls -1t "$OUT_DIR"/sahva-*.dump.age 2>/dev/null | tail -n +15 | xargs -r rm -f
