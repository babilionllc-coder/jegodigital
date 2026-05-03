#!/bin/bash
# audit_all_campaigns.sh
# Daily HR-5 Gate 7 audit — loops every active campaign, extracts {{vars}}
# from email body, paginates all leads, checks coverage per variable.
# Posts a single Telegram message with status + any gaps found.
#
# Built 2026-05-02 PM after Supersearch disaster — auto-runs daily at 7am CDMX
# via .github/workflows/audit-campaigns.yml so any new lead with missing
# {{personalization}}, {{state}}, etc. gets caught within 24h.
#
# Required env vars:
#   INSTANTLY_API_KEY
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_CHAT_ID

set -e

if [[ -z "$INSTANTLY_API_KEY" || -z "$TELEGRAM_BOT_TOKEN" || -z "$TELEGRAM_CHAT_ID" ]]; then
  echo "::error::Missing required env: INSTANTLY_API_KEY / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID"
  exit 1
fi

API="https://api.instantly.ai/api/v2"
TODAY=$(date -u +%Y-%m-%d)
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# 1. List all active campaigns (GET /campaigns, paginated)
echo "📋 Pulling active campaigns..."
CURSOR=""
PAGE=0
while :; do
  PAGE=$((PAGE+1))
  if [[ -z "$CURSOR" ]]; then URL="$API/campaigns?limit=100"
  else URL="$API/campaigns?limit=100&starting_after=$CURSOR"; fi
  RESP=$(curl -sS -H "Authorization: Bearer $INSTANTLY_API_KEY" "$URL")
  echo "$RESP" | jq -c '.items[]? | select(.status==1) | {id, name}' >> "$TMP/active.jsonl"
  CURSOR=$(echo "$RESP" | jq -r '.next_starting_after // empty')
  [[ -z "$CURSOR" ]] && break
  [[ $PAGE -ge 5 ]] && break
done

ACTIVE_COUNT=$(wc -l < "$TMP/active.jsonl")
echo "Active campaigns: $ACTIVE_COUNT"

# 2. For each, extract required vars + paginate leads + check coverage
> "$TMP/findings.txt"
TOTAL_GAPS=0
TOTAL_LEADS=0

while IFS= read -r CAMPAIGN_LINE; do
  CID=$(echo "$CAMPAIGN_LINE" | jq -r '.id')
  CNAME=$(echo "$CAMPAIGN_LINE" | jq -r '.name' | head -c 50)

  # Extract vars from sequence body
  CAMP=$(curl -sS -H "Authorization: Bearer $INSTANTLY_API_KEY" "$API/campaigns/$CID")
  REQ_VARS=$(echo "$CAMP" | jq -r '.sequences[].steps[].variants[] | (.subject + " " + .body)' \
    | grep -oE '\{\{[a-zA-Z_]+\}\}' | sed 's/[{}]//g' | sort -u)

  if [[ -z "$REQ_VARS" ]]; then
    echo "  $CNAME: no template vars (skip)"
    continue
  fi

  # Paginate leads
  > "$TMP/leads.jsonl"
  CURSOR=""; PAGE=0
  while :; do
    PAGE=$((PAGE+1))
    if [[ -z "$CURSOR" ]]; then REQ="{\"campaign\":\"$CID\",\"limit\":100}"
    else REQ="{\"campaign\":\"$CID\",\"limit\":100,\"starting_after\":\"$CURSOR\"}"; fi
    RESP=$(curl -sS --max-time 25 -X POST "$API/leads/list" \
      -H "Authorization: Bearer $INSTANTLY_API_KEY" -H "Content-Type: application/json" -d "$REQ")
    COUNT=$(echo "$RESP" | jq '.items | length')
    [[ "$COUNT" == "0" ]] && break
    echo "$RESP" | jq -c '.items[] | select(.status==1)' >> "$TMP/leads.jsonl"
    CURSOR=$(echo "$RESP" | jq -r '.next_starting_after // empty')
    [[ -z "$CURSOR" ]] && break
    [[ $PAGE -ge 30 ]] && break
  done

  ACTIVE=$(wc -l < "$TMP/leads.jsonl")
  TOTAL_LEADS=$((TOTAL_LEADS + ACTIVE))

  # Check each var
  GAPS_FOR_CAMPAIGN=""
  for VAR in $REQ_VARS; do
    MISSING=$(jq -c "select(([.payload.\"$VAR\", .\"$VAR\", .first_name, .company_name] | map(select(. != null and . != \"\")) | length) == 0)" "$TMP/leads.jsonl" 2>/dev/null | wc -l || echo 0)
    if [[ "$MISSING" -gt 0 ]]; then
      GAPS_FOR_CAMPAIGN="${GAPS_FOR_CAMPAIGN}${VAR}:${MISSING} "
      TOTAL_GAPS=$((TOTAL_GAPS + MISSING))
    fi
  done

  if [[ -n "$GAPS_FOR_CAMPAIGN" ]]; then
    echo "⚠️ $CNAME ($ACTIVE active) — GAPS: $GAPS_FOR_CAMPAIGN" >> "$TMP/findings.txt"
  else
    echo "✅ $CNAME ($ACTIVE active) — 100% coverage" >> "$TMP/findings.txt"
  fi
done < "$TMP/active.jsonl"

cat "$TMP/findings.txt"

# 3. Build + send Telegram message
if [[ "$TOTAL_GAPS" -gt 0 ]]; then
  ICON="🚨"
  HEADER="HR-5 Gate 7 — $TOTAL_GAPS gaps detected"
else
  ICON="✅"
  HEADER="HR-5 Gate 7 — all clean"
fi

MSG="${ICON} *Daily Campaign Audit — ${TODAY}*

${HEADER}
${ACTIVE_COUNT} active campaigns · ${TOTAL_LEADS} active leads checked

\`\`\`
$(cat "$TMP/findings.txt")
\`\`\`

Run: https://github.com/${GITHUB_REPOSITORY:-jegodigital}/actions/runs/${GITHUB_RUN_ID:-local}"

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=${MSG}" \
  -d "parse_mode=Markdown" || echo "Telegram post failed (non-fatal)"

# Exit 1 if gaps found (so GitHub Actions shows red)
if [[ "$TOTAL_GAPS" -gt 0 ]]; then
  exit 1
fi
exit 0
