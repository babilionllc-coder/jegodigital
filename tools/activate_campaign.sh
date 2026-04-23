#!/usr/bin/env bash
# tools/activate_campaign.sh — SAFE Instantly campaign activator with mandatory
# var-coverage pre-flight. The ONLY approved way to flip a campaign 0/2 → 1.
#
# Why this exists:
#   2026-04-23 — Free Demo Website MX campaign activated with {{website}} in
#   Step 1 body but `payload.website` = 0% populated (data was in `companyWebsite`).
#   50 prospects received "Te preparo una versión demo de — diseño nuevo..." (blank URL).
#   See DISASTER_LOG.md / Notion Disaster DB for full forensics.
#
# What it does:
#   1. Fetches campaign via bash curl (Iron Rule #13: never Python urllib)
#   2. Extracts every {{var}} referenced in subject + body across all steps/variants
#   3. Paginates /v2/leads/list, computes coverage for each var (top-level + payload.*)
#   4. BLOCKS activation if ANY var falls below threshold (default 95%)
#   5. On pass, POST /v2/campaigns/{id}/activate with empty body {} and re-GETs to confirm status=1
#
# Usage:
#   bash tools/activate_campaign.sh <campaign_id> [threshold]
#   bash tools/activate_campaign.sh d486f1ab-4668-4674-ad6b-80ef12d9fd78
#   bash tools/activate_campaign.sh <id> 0.98    # 98% threshold instead of 95%
#
# Exit codes:
#   0 = campaign is now ACTIVE (status=1)
#   1 = usage/config error
#   2 = pre-flight coverage BLOCKED activation (fix data or copy)
#   3 = activate HTTP 200 but status didn't flip to 1 (investigate)
#   4 = activate HTTP error
#
# Related:
#   /COLD_EMAIL.md §ACTIVATION GATE — canonical rule
#   tools/lead_quality_gate.py — lead-level HR-5 gate (runs pre-upload)
#   This script — campaign-level var gate (runs pre-activation)

set -euo pipefail

CAMPAIGN_ID="${1:-}"
THRESHOLD="${2:-0.95}"

if [ -z "$CAMPAIGN_ID" ]; then
    cat <<'USAGE'
❌ Usage: bash tools/activate_campaign.sh <campaign_id> [threshold]

   Example: bash tools/activate_campaign.sh d486f1ab-4668-4674-ad6b-80ef12d9fd78

   Default threshold is 0.95 (95%). Any {{var}} referenced in the sequence
   must be populated on ≥95% of leads or activation is BLOCKED.
USAGE
    exit 1
fi

# Walk up from script dir to find repo root (has website/functions/.env)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

ENV_FILE="website/functions/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env not found at $REPO_ROOT/$ENV_FILE"
    exit 1
fi

KEY=$(grep '^INSTANTLY_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')
if [ -z "$KEY" ]; then
    echo "❌ INSTANTLY_API_KEY missing or empty in $ENV_FILE"
    exit 1
fi

API="https://api.instantly.ai/api/v2"
TMP_DIR="${TMPDIR:-/tmp}"
CAMP_FILE="${TMP_DIR}/campaign_${CAMPAIGN_ID}.json"
LEADS_FILE="${TMP_DIR}/leads_${CAMPAIGN_ID}.jsonl"

echo "🔍 Pre-flight gate for campaign: $CAMPAIGN_ID"
echo "   Threshold: $(python3 -c "print(round($THRESHOLD*100,1))")%"

# --- 1. Fetch campaign --------------------------------------------------------
if ! curl -s -f -H "Authorization: Bearer $KEY" "${API}/campaigns/${CAMPAIGN_ID}" > "$CAMP_FILE"; then
    echo "❌ Failed to fetch campaign $CAMPAIGN_ID (check ID + API key)"
    exit 1
fi

CAMP_NAME=$(python3 -c "import json;print(json.load(open('$CAMP_FILE')).get('name','?'))")
CAMP_STATUS=$(python3 -c "import json;print(json.load(open('$CAMP_FILE')).get('status',0))")
SENDER_COUNT=$(python3 -c "import json;print(len(json.load(open('$CAMP_FILE')).get('email_list',[])))")

status_label() {
    case "$1" in
        0) echo "DRAFT";;
        1) echo "ACTIVE";;
        2) echo "PAUSED";;
        3) echo "COMPLETED";;
        *) echo "UNKNOWN($1)";;
    esac
}

echo "   Campaign: $CAMP_NAME"
echo "   Current status: $CAMP_STATUS ($(status_label $CAMP_STATUS))"
echo "   Senders: $SENDER_COUNT mailboxes"

if [ "$CAMP_STATUS" = "1" ]; then
    echo ""
    echo "⚠️  Campaign is already ACTIVE — running gate as AUDIT only (no activation needed)"
    AUDIT_ONLY=1
elif [ "$CAMP_STATUS" = "3" ]; then
    echo ""
    echo "❌ Campaign status=3 (COMPLETED) — cannot activate"
    exit 1
else
    AUDIT_ONLY=0
fi

# --- 2. Extract {{vars}} from sequences ---------------------------------------
VARS=$(python3 <<PYEOF
import json, re
d = json.load(open("$CAMP_FILE"))
found = set()
for seq in d.get('sequences', []):
    for step in seq.get('steps', []):
        for v in step.get('variants', []):
            for field in ('subject', 'body'):
                txt = v.get(field, '') or ''
                for m in re.findall(r'{{\s*([\w.]+)\s*}}', txt):
                    found.add(m)
for v in sorted(found):
    print(v)
PYEOF
)

if [ -z "$VARS" ]; then
    echo "   {{vars}} referenced: (none — no personalization in use)"
else
    echo "   {{vars}} referenced: $(echo "$VARS" | tr '\n' ' ')"
fi

# --- 3. Paginate leads --------------------------------------------------------
echo ""
echo "📊 Sampling leads for coverage..."
> "$LEADS_FILE"
CURSOR=""
MAX_PAGES=30   # 3000 leads max sample
PAGE_NUM=0
for i in $(seq 1 $MAX_PAGES); do
    if [ -z "$CURSOR" ]; then
        REQ='{"campaign":"'"${CAMPAIGN_ID}"'","limit":100}'
    else
        REQ='{"campaign":"'"${CAMPAIGN_ID}"'","limit":100,"starting_after":"'"${CURSOR}"'"}'
    fi
    RESP=$(curl -s -f -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
        -X POST "${API}/leads/list" -d "$REQ" || echo '{"items":[]}')
    echo "$RESP" >> "$LEADS_FILE"
    PAGE_NUM=$((PAGE_NUM + 1))
    CURSOR=$(echo "$RESP" | python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get('next_starting_after') or '')
except: print('')")
    PAGE_COUNT=$(echo "$RESP" | python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    print(len(d.get('items',[])))
except: print(0)")
    [ -z "$CURSOR" ] && break
    [ "$PAGE_COUNT" -lt 100 ] && break
done
echo "   Pages fetched: $PAGE_NUM"

# --- 4. Coverage check --------------------------------------------------------
# Core-variable top-level keys that Instantly always exposes
# (core_variables in campaign config) map to snake_case on the lead object.
RESULT=$(python3 <<PYEOF
import json
vars_ref = """$VARS""".strip().split('\n')
vars_ref = [v for v in vars_ref if v]

items = []
with open("$LEADS_FILE") as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            d = json.loads(line)
            items.extend(d.get('items', []))
        except: pass

total = len(items)
threshold = float("$THRESHOLD")

if total == 0:
    print("NO_LEADS")
    raise SystemExit(0)

# Canonical Instantly camelCase var → snake_case top-level column
CORE_MAP = {
    'firstName':'first_name', 'lastName':'last_name',
    'email':'email', 'phone':'phone',
    'companyName':'company_name', 'website':'website',
    'jobTitle':'job_title', 'personalization':'personalization',
}

coverage = {}
for v in vars_ref:
    populated = 0
    top_key = CORE_MAP.get(v)
    for L in items:
        val = None
        if top_key and L.get(top_key):
            val = L.get(top_key)
        if not val:
            p = L.get('payload') or {}
            val = p.get(v)
        if val and str(val).strip():
            populated += 1
    coverage[v] = (populated, total, populated/total)

print(f"TOTAL {total}")
blocked = []
for v in sorted(coverage):
    p, t, pct = coverage[v]
    flag = 'PASS' if pct >= threshold else 'FAIL'
    if pct < threshold: blocked.append(v)
    print(f"VAR {v} {p} {t} {pct:.4f} {flag}")

if blocked:
    print(f"BLOCKED {','.join(blocked)}")
else:
    print("OK")
PYEOF
)

if echo "$RESULT" | grep -q "^NO_LEADS"; then
    echo ""
    echo "🛑 ACTIVATION BLOCKED — campaign has zero leads"
    exit 2
fi

TOTAL=$(echo "$RESULT" | grep "^TOTAL " | awk '{print $2}')
echo "   Leads sampled: $TOTAL"

echo "$RESULT" | grep "^VAR " | while IFS= read -r line; do
    set -- $line
    VAR_NAME="$2"; POP="$3"; TOT="$4"; PCT="$5"; FLAG="$6"
    ICON="✅"; [ "$FLAG" = "FAIL" ] && ICON="❌"
    PCT_DISPLAY=$(python3 -c "print(round(${PCT}*100,1))")
    printf "   {{%s}} → %d/%d = %s%%  %s\n" "$VAR_NAME" "$POP" "$TOT" "$PCT_DISPLAY" "$ICON"
done

if echo "$RESULT" | grep -q "^BLOCKED"; then
    BLOCKED_VARS=$(echo "$RESULT" | grep "^BLOCKED " | sed 's/^BLOCKED //')
    echo ""
    echo "🛑 ACTIVATION BLOCKED — these {{vars}} have <$(python3 -c "print(round($THRESHOLD*100))")% coverage:"
    echo "     $BLOCKED_VARS"
    echo ""
    echo "Fix options:"
    echo "  (a) Rewrite the sequence to use a different tag that IS populated"
    echo "      (e.g. {{companyWebsite}} instead of {{website}})"
    echo "  (b) PATCH leads to populate the missing field:"
    echo "      POST /v2/leads/list/patch with the correct payload.<var>"
    echo "  (c) Remove the {{var}} from the copy and replace with generic phrasing"
    echo ""
    echo "Do NOT use Instantly's default-value fallback — it masks the problem."
    exit 2
fi

echo "✅ Coverage check PASSED (all referenced {{vars}} ≥$(python3 -c "print(round($THRESHOLD*100))")%)"

# --- 5. Activate (unless audit-only) -----------------------------------------
if [ "$AUDIT_ONLY" = "1" ]; then
    echo ""
    echo "ℹ️  Audit-only mode — campaign was already ACTIVE. No change made."
    exit 0
fi

echo ""
echo "🚀 Activating campaign (POST /activate with empty body)..."
ACT_RESP=$(curl -s -w "\n__HTTP__%{http_code}" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -X POST "${API}/campaigns/${CAMPAIGN_ID}/activate" --data '{}')
HTTP=$(echo "$ACT_RESP" | grep __HTTP__ | sed 's/.*__HTTP__//')

if [ "$HTTP" != "200" ]; then
    echo "❌ Activate failed: HTTP $HTTP"
    echo "$ACT_RESP" | grep -v __HTTP__ | head -5
    exit 4
fi

sleep 1
NEW_STATUS=$(curl -s -H "Authorization: Bearer $KEY" "${API}/campaigns/${CAMPAIGN_ID}" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('status',-1))")

if [ "$NEW_STATUS" = "1" ]; then
    echo "✅ Campaign is ACTIVE (status=1) — first sends fire at next scheduled window"
    exit 0
else
    echo "⚠️  Activate returned 200 but status is now $NEW_STATUS ($(status_label $NEW_STATUS)) — investigate"
    exit 3
fi
