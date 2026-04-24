#!/bin/bash
# Fast parallel Instantly push — xargs -P 8 for concurrent curl calls.
# Bypasses Python urllib (Cloudflare-blocked) and subprocess overhead.
set -u
set -o pipefail

INSTANTLY_API="https://api.instantly.ai/api/v2"
KEY="${INSTANTLY_API_KEY:?INSTANTLY_API_KEY required}"
UA="curl/8.4.0"

# Pick latest enriched JSON
SRC=$(ls -t leads/enriched/v2/*.json 2>/dev/null | head -1)
if [ -z "$SRC" ]; then echo "No enriched JSON found"; exit 1; fi
echo "Loading: $SRC"

DATESTAMP=$(date -u +%Y%m%d)

# ---------- 1. Create MX campaign ----------
echo ""
echo "=== Creating MX campaign ==="
MX_PAYLOAD=$(cat <<'JEOF'
{
  "name": "__MX_NAME__",
  "campaign_schedule": {
    "schedules": [{
      "name": "Default",
      "timing": {"from": "09:00", "to": "18:00"},
      "days": {"0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false},
      "timezone": "America/Chicago"
    }]
  },
  "sequences": [{
    "steps": [{
      "type": "email",
      "delay": 0,
      "variants": [{
        "subject": "{{firstName}}, algo noté de {{companyName}}",
        "body": "{{personalized_opener}}\n\nAyudamos a Flamingo Real Estate en Cancún a pasar a #1 en Google Maps en 67 días, con +320% de tráfico orgánico y 88% de leads automatizados.\n\n¿Te mando un análisis gratuito de {{companyName}} esta semana? Es rápido — puede mostrar oportunidades específicas que quizás aún no has notado.\n\nUn saludo,\nAlex Jego\nJegoDigital"
      }]
    }]
  }],
  "daily_limit": 30
}
JEOF
)
MX_PAYLOAD="${MX_PAYLOAD/__MX_NAME__/signal_outbound_mx_$DATESTAMP}"
MX_RESPONSE=$(curl -sS -X POST "$INSTANTLY_API/campaigns" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  --data-binary "$MX_PAYLOAD")
MX_ID=$(echo "$MX_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
echo "MX campaign id: $MX_ID"
if [ -z "$MX_ID" ]; then echo "FAIL: $MX_RESPONSE"; exit 1; fi

# ---------- 2. Create US campaign ----------
echo ""
echo "=== Creating US campaign ==="
US_PAYLOAD=$(cat <<'JEOF'
{
  "name": "__US_NAME__",
  "campaign_schedule": {
    "schedules": [{
      "name": "Default",
      "timing": {"from": "09:00", "to": "17:00"},
      "days": {"0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false},
      "timezone": "America/Chicago"
    }]
  },
  "sequences": [{
    "steps": [{
      "type": "email",
      "delay": 0,
      "variants": [{
        "subject": "{{firstName}}, quick note on {{companyName}}",
        "body": "{{personalized_opener}}\n\nAt JegoDigital, we helped Flamingo Real Estate in Cancún rank #1 on Google Maps in 67 days, driving +320% organic traffic and automating 88% of lead qualification.\n\nWorth a quick free audit of {{companyName}} this week? Takes 45 minutes and shows specific, actionable wins you probably haven't spotted yet.\n\nBest,\nAlex Jego\nJegoDigital"
      }]
    }]
  }],
  "daily_limit": 30
}
JEOF
)
US_PAYLOAD="${US_PAYLOAD/__US_NAME__/signal_outbound_miami_$DATESTAMP}"
US_RESPONSE=$(curl -sS -X POST "$INSTANTLY_API/campaigns" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  --data-binary "$US_PAYLOAD")
US_ID=$(echo "$US_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
echo "US campaign id: $US_ID"

# ---------- 3. Build per-lead JSON payloads ----------
echo ""
echo "=== Building lead payloads ==="
mkdir -p /tmp/instantly_payloads
rm -f /tmp/instantly_payloads/*.json

python3 - <<PYEOF
import json, os, glob
src = "$SRC"
mx_id = "$MX_ID"
us_id = "$US_ID"
data = json.load(open(src))
passed = [e for e in data if e.get("icp_pass") and e.get("email")]
count = 0
for lead in passed:
    phone = (lead.get("phone") or "").strip()
    campaign_id = us_id if phone.startswith("+1") else mx_id
    opener = lead.get("personalized_opener") or ""
    if opener.startswith("__GEMINI_ERROR__"):
        opener = f"Hola {lead.get('prospect_first_name','')}, estuve viendo el sitio de {lead.get('prospect_company_name','su empresa')} y encontré oportunidades específicas que vale la pena revisar rápido."
    pains = lead.get("pains") or []
    top_pain = pains[0].get("type") if pains else "general"
    top_pain_detail = pains[0].get("note") if pains else ""
    payload = {
        "campaign": campaign_id,
        "email": lead.get("email"),
        "first_name": lead.get("prospect_first_name") or "",
        "last_name": lead.get("prospect_last_name") or "",
        "company_name": lead.get("prospect_company_name") or "",
        "website": lead.get("prospect_company_website") or "",
        "phone": phone,
        "personalization": opener,
        "custom_variables": {
            "personalized_opener": opener,
            "top_pain": top_pain,
            "pain_detail": top_pain_detail,
            "signal_score": str(lead.get("signal_score") or 0),
            "whatsapp": lead.get("whatsapp") or "",
        },
    }
    count += 1
    with open(f"/tmp/instantly_payloads/lead_{count:04d}.json","w") as f:
        json.dump(payload, f)
print(f"Built {count} payloads")
PYEOF

TOTAL=$(ls /tmp/instantly_payloads/ | wc -l)
echo "Payloads ready: $TOTAL"

# ---------- 4. Parallel upload with xargs -P 8 ----------
echo ""
echo "=== Parallel uploading (8 concurrent) ==="
START=$(date +%s)
ls /tmp/instantly_payloads/*.json | xargs -I{} -P 8 -n 1 sh -c \
  "curl -sS -X POST '$INSTANTLY_API/leads' \
    -H 'Authorization: Bearer $KEY' \
    -H 'Content-Type: application/json' \
    -H 'User-Agent: $UA' \
    --data-binary @{} \
    -o /dev/null -w '%{http_code}\n'" 2>&1 | tee /tmp/upload_statuses.txt | \
  awk '{c[\$1]++; total++} END {for (k in c) printf \"  HTTP %s: %d\n\", k, c[k]; printf \"  Total: %d\n\", total}'
END=$(date +%s)
echo "Upload time: $((END-START))s"

# ---------- 5. Final summary ----------
OK=$(grep -c "^200\|^201" /tmp/upload_statuses.txt || echo 0)
ERR=$(grep -cv "^200\|^201" /tmp/upload_statuses.txt || echo 0)
echo ""
echo "============================================"
echo "FINAL"
echo "============================================"
echo "MX campaign: $MX_ID (DRAFT/PAUSED)"
echo "US campaign: $US_ID (DRAFT/PAUSED)"
echo "Uploaded OK: $OK / Errors: $ERR"
echo ""
echo "View: https://app.instantly.ai/app/campaigns"

cat > /tmp/instantly_push_summary.json <<JEOF
{
  "mx_campaign_id": "$MX_ID",
  "us_campaign_id": "$US_ID",
  "uploaded_ok": $OK,
  "uploaded_err": $ERR,
  "total_payloads": $TOTAL,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JEOF
echo "Summary saved."
