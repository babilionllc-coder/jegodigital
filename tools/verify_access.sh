#!/bin/bash
# /Users/mac/Desktop/Websites/jegodigital/tools/verify_access.sh
#
# BOOTSTRAP SCRIPT — run at session start, before any cold-email work.
# Auto-verifies Instantly API access and self-heals if the key is missing.
# Per CLAUDE.md HARD RULE #1.
#
# Exit 0 = green, ready. Exit 1 = blocked, Claude must not write cold-email reports.

cd "/Users/mac/Desktop/Websites/jegodigital" || exit 1

ENV_FILE="website/functions/.env"
BACKUP_FILE=".secrets/instantly_api_key"

echo "=== Instantly access verification ==="

# --- Step 1: ensure .env exists -----------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE missing — creating empty file"
  mkdir -p "$(dirname "$ENV_FILE")"
  touch "$ENV_FILE"
fi

# --- Step 2: ensure INSTANTLY_API_KEY is in .env ------------------------------
if ! grep -q '^INSTANTLY_API_KEY=' "$ENV_FILE"; then
  echo "⚠️  INSTANTLY_API_KEY missing from $ENV_FILE — attempting auto-restore..."
  if [ -f "$BACKUP_FILE" ]; then
    BACKUP_KEY=$(tr -d '[:space:]' < "$BACKUP_FILE")
    if [ -n "$BACKUP_KEY" ]; then
      echo "INSTANTLY_API_KEY=$BACKUP_KEY" >> "$ENV_FILE"
      echo "✅ Restored from $BACKUP_FILE"
    else
      echo "❌ $BACKUP_FILE is empty. STOP — ask Alex to re-paste key." >&2
      exit 1
    fi
  else
    echo "❌ No backup found at $BACKUP_FILE. STOP — ask Alex to paste key." >&2
    echo "   Recovery: echo \"INSTANTLY_API_KEY=<value>\" >> $ENV_FILE" >&2
    echo "   Also save backup: echo \"<value>\" > $BACKUP_FILE" >&2
    exit 1
  fi
fi

KEY=$(grep '^INSTANTLY_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')

# --- Step 3: if backup missing or stale, refresh from .env -------------------
if [ ! -f "$BACKUP_FILE" ] || [ "$(tr -d '[:space:]' < "$BACKUP_FILE")" != "$KEY" ]; then
  mkdir -p "$(dirname "$BACKUP_FILE")"
  echo "$KEY" > "$BACKUP_FILE"
  chmod 600 "$BACKUP_FILE"
  echo "🔄 Backup refreshed at $BACKUP_FILE"
fi

# --- Step 4: live API ping to validate the key -------------------------------
echo "==> Pinging api.instantly.ai ..."
HTTP=$(curl -sS -o /tmp/inst_ping.json -w "%{http_code}" --max-time 8 \
  -H "Authorization: Bearer $KEY" \
  "https://api.instantly.ai/api/v2/campaigns?limit=1" 2>/dev/null)

if [ "$HTTP" = "200" ]; then
  echo "✅ HTTP 200 — key valid, API reachable"
  CAMP_COUNT=$(python3 -c "
import json
try:
    d = json.load(open('/tmp/inst_ping.json'))
    items = d.get('items', []) if isinstance(d, dict) else (d if isinstance(d, list) else [])
    print(len(items))
except Exception:
    print(0)
")
  echo "✅ Reachable — campaigns fetched in sanity ping: $CAMP_COUNT"
  exit 0
elif [ "$HTTP" = "401" ] || [ "$HTTP" = "403" ]; then
  echo "❌ HTTP $HTTP — key rejected by Instantly. Key may be rotated." >&2
  echo "   Fix: ask Alex to re-paste current key from 1Password / GitHub Secrets" >&2
  exit 1
elif [ "$HTTP" = "000" ]; then
  echo "⚠️  Network unreachable from this shell (HTTP 000)" >&2
  echo "   If this is the Cowork sandbox: start a NEW Cowork session (allowlist propagates at boot)" >&2
  echo "   OR use Path A workaround: bash tools/instantly_live_pull.sh from Alex's own Terminal" >&2
  exit 1
else
  echo "⚠️  Unexpected HTTP $HTTP" >&2
  head -c 500 /tmp/inst_ping.json >&2
  exit 1
fi
