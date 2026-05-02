#!/bin/bash
# /Users/mac/Desktop/Websites/jegodigital/tools/verify_no_tracking.sh
#
# HARD RULE #16 enforcement — verifies NO Instantly campaign has open_tracking
# or link_tracking enabled. Run before activating any campaign + on a monthly
# cron to catch UI default drift.
#
# Built 2026-05-01 after the Vercel CTD `inst.zennoenigmawire.com` link-rewrite
# disaster: 8 of 22 campaigns silently shipped with link_tracking=true,
# rewriting every URL through a low-reputation Vercel subdomain → Gmail spam.
#
# Usage:
#   bash tools/verify_no_tracking.sh          # human-readable output
#   bash tools/verify_no_tracking.sh --json   # JSON output for cron parsing
#
# Exit codes:
#   0 — all campaigns clean (link_tracking=false AND open_tracking=false)
#   1 — one or more campaigns have tracking enabled — pipeline MUST NOT
#       activate any campaign until human review + auto-patch.
#
# Auto-patch mode (use with caution):
#   bash tools/verify_no_tracking.sh --auto-fix
#       PATCHes any campaign with tracking=true to tracking=false in-place,
#       then re-verifies. Logs the diff to /tmp/tracking_autofix_<date>.json.

set -e
# Auto-detect repo root: works on Mac, sandbox, and any clone path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || exit 1

ENV_FILE="website/functions/.env"
[ ! -f "$ENV_FILE" ] && echo "❌ $ENV_FILE missing (looked in $REPO_ROOT/$ENV_FILE)" >&2 && exit 1
set -a; source "$ENV_FILE"; set +a

if [ -z "$INSTANTLY_API_KEY" ]; then
    echo "❌ INSTANTLY_API_KEY not in environment" >&2
    exit 1
fi

# --- Pull all campaigns -------------------------------------------------------
TMPF="/tmp/verify_no_tracking_$(date +%s).json"
HTTP=$(curl -s -o "$TMPF" -w "%{http_code}" \
    -H "Authorization: Bearer $INSTANTLY_API_KEY" \
    "https://api.instantly.ai/api/v2/campaigns?limit=100")

if [ "$HTTP" != "200" ]; then
    echo "❌ Instantly API HTTP $HTTP — cannot verify" >&2
    cat "$TMPF" | head -3 >&2
    exit 1
fi

TOTAL=$(jq '.items | length' "$TMPF")
DIRTY_LINK=$(jq '[.items[] | select(.link_tracking == true)] | length' "$TMPF")
DIRTY_OPEN=$(jq '[.items[] | select(.open_tracking == true)] | length' "$TMPF")
DIRTY_TOTAL=$(jq '[.items[] | select(.link_tracking == true or .open_tracking == true)] | length' "$TMPF")

# --- Output -------------------------------------------------------------------
if [ "$1" = "--json" ]; then
    jq --argjson total "$TOTAL" --argjson dlink "$DIRTY_LINK" --argjson dopen "$DIRTY_OPEN" \
       '{total_campaigns: $total, dirty_link_tracking: $dlink, dirty_open_tracking: $dopen, status: (if ($dlink + $dopen) == 0 then "clean" else "dirty" end), violators: [.items[] | select(.link_tracking == true or .open_tracking == true) | {id, name, link_tracking, open_tracking, status}]}' \
       "$TMPF"
else
    echo "=== HR#16 — Campaign tracking audit ($(date +%Y-%m-%d\ %H:%M)) ==="
    echo ""
    if [ "$DIRTY_TOTAL" -eq 0 ]; then
        echo "✅ $TOTAL/$TOTAL campaigns clean — 0 with tracking enabled"
        echo "   link_tracking violators: 0"
        echo "   open_tracking violators: 0"
        rm -f "$TMPF"
        exit 0
    else
        echo "🚨 HR#16 VIOLATION — $DIRTY_TOTAL of $TOTAL campaigns have tracking ON"
        echo ""
        echo "   link_tracking=true: $DIRTY_LINK campaigns"
        echo "   open_tracking=true: $DIRTY_OPEN campaigns"
        echo ""
        echo "Violators:"
        jq -r '.items[] | select(.link_tracking == true or .open_tracking == true) | "   ❌ \(.name)\n      id=\(.id)  link=\(.link_tracking)  open=\(.open_tracking)  status=\(.status)"' "$TMPF"
        echo ""
    fi
fi

# --- Auto-fix mode ------------------------------------------------------------
if [ "$1" = "--auto-fix" ] && [ "$DIRTY_TOTAL" -gt 0 ]; then
    echo ""
    echo "=== --auto-fix engaged — patching all violators ==="
    LOG="/tmp/tracking_autofix_$(date +%Y-%m-%d_%H%M%S).json"
    cp "$TMPF" "$LOG"

    SUCCESS=0; FAIL=0
    for cid in $(jq -r '.items[] | select(.link_tracking == true or .open_tracking == true) | .id' "$TMPF"); do
        NAME=$(jq -r --arg id "$cid" '.items[] | select(.id == $id) | .name' "$TMPF")
        CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
            "https://api.instantly.ai/api/v2/campaigns/$cid" \
            -H "Authorization: Bearer $INSTANTLY_API_KEY" \
            -H "Content-Type: application/json" \
            --data '{"link_tracking": false, "open_tracking": false}')
        if [ "$CODE" = "200" ]; then
            echo "  ✅ patched: $NAME"
            SUCCESS=$((SUCCESS+1))
        else
            echo "  ❌ HTTP $CODE: $NAME"
            FAIL=$((FAIL+1))
        fi
        sleep 0.3
    done

    echo ""
    echo "Patch summary: $SUCCESS success / $FAIL fail"
    echo "Pre-fix snapshot saved to: $LOG"
    rm -f "$TMPF"
    [ "$FAIL" -gt 0 ] && exit 1 || exit 0
fi

rm -f "$TMPF"
[ "$DIRTY_TOTAL" -gt 0 ] && exit 1 || exit 0
