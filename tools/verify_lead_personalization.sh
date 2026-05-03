#!/bin/bash
# /Users/mac/Desktop/Websites/jegodigital/tools/verify_lead_personalization.sh
#
# Iron Rule #13 enforcement (skill MASTER §11) — samples 5 leads from a campaign
# and confirms every lead has a non-empty, non-placeholder, non-banned-phrase
# {{personalization}} variable. Catches the silent failure mode where the
# pipeline ships campaigns with empty personalization and the entire send
# defaults to a generic opener (= 0.5–1% reply rate ceiling).
#
# Built 2026-05-02 after audit found dailySupersearchRefill.js buildPersonalization
# switch keys did not match cohort personalization_pattern keys → every lead
# silently received "" personalization → score 0 → drop. Wasted credits AND
# nobody noticed for weeks because Slack digest only reported "ENRICHMENT_TRIGGERED".
#
# Usage:
#   bash tools/verify_lead_personalization.sh <campaign_id>           # human output
#   bash tools/verify_lead_personalization.sh <campaign_id> --json    # JSON output
#   bash tools/verify_lead_personalization.sh --all                   # check all active campaigns
#
# Exit codes:
#   0 — sampled leads have valid personalization (≥80% non-empty + no banned)
#   1 — campaign has empty/broken personalization — pipeline must investigate
#       before continuing to ship the campaign

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || exit 1

ENV_FILE="website/functions/.env"
[ ! -f "$ENV_FILE" ] && echo "❌ $ENV_FILE missing" >&2 && exit 1
set -a; source "$ENV_FILE"; set +a

if [ -z "$INSTANTLY_API_KEY" ]; then
    echo "❌ INSTANTLY_API_KEY not in environment" >&2
    exit 1
fi

API="https://api.instantly.ai/api/v2"

verify_one_campaign() {
    local CID="$1"
    local TMPF="/tmp/personalization_${CID}_$(date +%s).json"

    # Pull 20 leads from the campaign
    HTTP=$(curl -s -o "$TMPF" -w "%{http_code}" -X POST \
        "$API/leads/list" \
        -H "Authorization: Bearer $INSTANTLY_API_KEY" \
        -H "Content-Type: application/json" \
        --data "{\"campaign\": \"$CID\", \"limit\": 20}")

    if [ "$HTTP" != "200" ]; then
        echo "❌ Campaign $CID — HTTP $HTTP fetching leads"
        cat "$TMPF" | head -3 >&2
        rm -f "$TMPF"
        return 1
    fi

    local NAME=$(curl -s -H "Authorization: Bearer $INSTANTLY_API_KEY" \
        "$API/campaigns/$CID" | jq -r '.name // "<unknown>"')

    local TOTAL=$(jq '.items | length' "$TMPF")
    if [ "$TOTAL" -eq 0 ]; then
        echo "⏳ $NAME ($CID) — 0 leads in campaign yet"
        rm -f "$TMPF"
        return 0
    fi

    # Sample first 5 with personalization field
    local SAMPLE=$(jq '.items[:5] | map({id, email, first_name, personalization, has_p: (.personalization != null and .personalization != "" and (.personalization | length) > 20)})' "$TMPF")

    local NON_EMPTY=$(echo "$SAMPLE" | jq '[.[] | select(.has_p)] | length')
    local SAMPLED=$(echo "$SAMPLE" | jq 'length')
    local PCT_OK=$((NON_EMPTY * 100 / SAMPLED))

    # Check for banned phrases / unfilled vars
    local BANNED=$(echo "$SAMPLE" | jq '[.[] | select(.personalization | tostring | test("hope this finds you|wanted to reach out|just touching base|espero que est|sin compromiso|\\{\\{|undefined"; "i"))] | length')

    if [ "$1" = "--json" ] || [ "$2" = "--json" ]; then
        echo "$SAMPLE" | jq --arg name "$NAME" --arg cid "$CID" --argjson ok "$NON_EMPTY" --argjson sampled "$SAMPLED" --argjson banned "$BANNED" \
            '{campaign_id: $cid, campaign_name: $name, sampled: $sampled, non_empty: $ok, banned_phrases: $banned, samples: .}'
        rm -f "$TMPF"
        if [ "$NON_EMPTY" -lt 4 ] || [ "$BANNED" -gt 0 ]; then return 1; fi
        return 0
    fi

    echo ""
    echo "=== $NAME ($CID) ==="
    echo "Sampled: $SAMPLED leads · Non-empty personalization: $NON_EMPTY/$SAMPLED ($PCT_OK%) · Banned-phrase hits: $BANNED"
    echo ""
    echo "Sample personalizations:"
    echo "$SAMPLE" | jq -r '.[] | "  \(if .has_p then "✅" else "❌" end) \(.email)\n     → \(.personalization // "<EMPTY>" | tostring | .[0:120])"'
    echo ""

    if [ "$NON_EMPTY" -lt 4 ]; then
        echo "🚨 FAIL — fewer than 4/5 leads have non-empty personalization"
        echo "   Likely cause: pipeline shipping leads without running buildPersonalization"
        echo "   Fix: check processSupersearchLists scheduled run + cohort.personalization_template"
        rm -f "$TMPF"
        return 1
    fi
    if [ "$BANNED" -gt 0 ]; then
        echo "🚨 FAIL — $BANNED leads have banned phrases or unfilled {{vars}}"
        echo "   Iron Rule violation — these leads must NOT send"
        rm -f "$TMPF"
        return 1
    fi
    echo "✅ PASS — campaign personalization clean"
    rm -f "$TMPF"
    return 0
}

# --- Main --------------------------------------------------------------------

if [ "$1" = "--all" ]; then
    echo "=== Verifying personalization across ALL active campaigns ==="
    CAMPAIGNS=$(curl -s -H "Authorization: Bearer $INSTANTLY_API_KEY" \
        "$API/campaigns?limit=100" | jq -r '.items[] | select(.status == 1) | .id')
    FAILED=0; PASSED=0
    for cid in $CAMPAIGNS; do
        if verify_one_campaign "$cid"; then
            PASSED=$((PASSED+1))
        else
            FAILED=$((FAILED+1))
        fi
    done
    echo ""
    echo "=== Summary: $PASSED passed · $FAILED failed ==="
    [ "$FAILED" -gt 0 ] && exit 1 || exit 0
fi

if [ -z "$1" ]; then
    echo "❌ Usage: bash tools/verify_lead_personalization.sh <campaign_id>" >&2
    echo "          bash tools/verify_lead_personalization.sh --all" >&2
    exit 1
fi

verify_one_campaign "$1" "$2"
