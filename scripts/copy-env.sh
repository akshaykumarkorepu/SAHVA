#!/bin/bash
# Copy one value from .env to the clipboard without printing it.
#   ./scripts/copy-env.sh SUPABASE_SERVICE_ROLE_KEY
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
[ -n "$v" ] || { echo "$1 is not set in .env"; exit 1; }
printf '%s' "$v" | pbcopy
echo "Copied $1 (${#v} characters). Paste it, then copy something else to clear it."
