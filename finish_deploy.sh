#!/usr/bin/env bash
# finish_deploy.sh — one-shot completion of the auto-deploy pipeline
# Run ONCE. Handles everything. No more back-and-forth.

set -uo pipefail
cd "$(dirname "$0")"

REPO="babilionllc-coder/jegodigital"
RENDERER="https://mockup-renderer-wfmydylowa-uc.a.run.app"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
ok()  { printf "  \033[32m✓ %s\033[0m\n" "$1"; }
bad() { printf "  \033[31m✗ %s\033[0m\n" "$1"; }

echo "════════════════════════════════════════════════════════════"
echo "  finish_deploy.sh — get mockups working, one shot"
echo "════════════════════════════════════════════════════════════"

# ───────── Step 1: workflow status ─────────
say "Current workflow status"
gh run list --repo "$REPO" --limit 6

# ───────── Step 2: is Cloud Run deploy in progress / failed / done? ─────────
say "Cloud Run deploy status"
CR_RUN=$(gh run list --repo "$REPO" --workflow=deploy-cloudrun.yml --limit 1 --json databaseId,status,conclusion,createdAt -q '.[0]')
CR_ID=$(echo "$CR_RUN" | python3 -c "import sys,json;print(json.load(sys.stdin)['databaseId'])")
CR_STATUS=$(echo "$CR_RUN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status']+'/'+(d.get('conclusion') or 'pending'))")
echo "  Latest run: $CR_ID → $CR_STATUS"

if [[ "$CR_STATUS" == *"in_progress"* ]] || [[ "$CR_STATUS" == *"queued"* ]]; then
  say "Waiting for Cloud Run deploy to finish (polls every 20s, 8 min max)"
  for i in $(seq 1 24); do
    sleep 20
    S=$(gh run view "$CR_ID" --repo "$REPO" --json status,conclusion -q '.status+"/"+(.conclusion // "pending")')
    echo "  [$((i*20))s] $S"
    if [[ "$S" == *"completed"* ]]; then
      CR_STATUS="$S"
      break
    fi
  done
fi

if [[ "$CR_STATUS" == *"failure"* ]]; then
  say "Cloud Run deploy FAILED — last 60 lines of failure log"
  gh run view "$CR_ID" --repo "$REPO" --log-failed | tail -60
  say "Re-triggering workflow"
  gh workflow run deploy-cloudrun.yml --repo "$REPO" --ref main
  sleep 10
  NEW_ID=$(gh run list --repo "$REPO" --workflow=deploy-cloudrun.yml --limit 1 --json databaseId -q '.[0].databaseId')
  echo "  New run: $NEW_ID"
  say "Polling until new run finishes (8 min max)"
  for i in $(seq 1 24); do
    sleep 20
    S=$(gh run view "$NEW_ID" --repo "$REPO" --json status,conclusion -q '.status+"/"+(.conclusion // "pending")')
    echo "  [$((i*20))s] $S"
    if [[ "$S" == *"completed"* ]]; then break; fi
  done
fi

# ───────── Step 3: poll /healthz until 200 or give up ─────────
say "Polling /healthz (5 min max)"
HEALTH_OK=0
for i in $(seq 1 30); do
  sleep 10
  CODE=$(curl -s -o /tmp/healthz.out -w "%{http_code}" "$RENDERER/healthz")
  echo "  [$((i*10))s] /healthz → $CODE"
  if [[ "$CODE" == "200" ]]; then
    HEALTH_OK=1
    cat /tmp/healthz.out
    echo
    break
  fi
done

# ───────── Step 4: fill missing secrets ─────────
say "Ensuring all secrets are present"
ENV=website/functions/.env
add_from_env() {
  local k="$1"
  local v=$(grep "^${k}=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2-)
  if [[ -n "$v" ]]; then
    printf '%s' "$v" | gh secret set "$k" --repo="$REPO" >/dev/null 2>&1 && ok "$k" || bad "$k"
  fi
}
add_static() {
  local k="$1" v="$2"
  printf '%s' "$v" | gh secret set "$k" --repo="$REPO" >/dev/null 2>&1 && ok "$k" || bad "$k"
}

add_from_env TELEGRAM_BOT_TOKEN
add_from_env TELEGRAM_CHAT_ID
add_from_env PSI_API_KEY
add_from_env PAGESPEED_API_KEY
add_static BREVO_SENDER_NAME "Alex Jego"

# PAGESPEED falls back to PSI value if PAGESPEED line absent
if ! grep -q '^PAGESPEED_API_KEY=' "$ENV" 2>/dev/null; then
  PSI=$(grep '^PSI_API_KEY=' "$ENV" | head -1 | cut -d= -f2-)
  [[ -n "$PSI" ]] && printf '%s' "$PSI" | gh secret set PAGESPEED_API_KEY --repo="$REPO" >/dev/null && ok "PAGESPEED_API_KEY (copied from PSI)"
fi

# Check FIREBASE_TOKEN existence
if ! gh secret list --repo="$REPO" | grep -q '^FIREBASE_TOKEN'; then
  echo
  say "FIREBASE_TOKEN is MISSING — this is the only remaining manual step"
  echo "  Run this in another terminal, then paste the long token back here:"
  echo "    firebase login:ci"
  echo
  read -p "  Paste the token (or press Enter to skip): " TOK
  if [[ -n "$TOK" ]]; then
    printf '%s' "$TOK" | gh secret set FIREBASE_TOKEN --repo="$REPO" && ok "FIREBASE_TOKEN"
  fi
fi

# ───────── Step 5: re-run Firebase deploy ─────────
say "Re-triggering deploy.yml (Firebase Functions + Hosting)"
gh workflow run deploy.yml --repo "$REPO" --ref main
sleep 10
FB_ID=$(gh run list --repo "$REPO" --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
echo "  New run: $FB_ID"

say "Polling Firebase deploy (8 min max)"
for i in $(seq 1 24); do
  sleep 20
  S=$(gh run view "$FB_ID" --repo "$REPO" --json status,conclusion -q '.status+"/"+(.conclusion // "pending")')
  echo "  [$((i*20))s] $S"
  if [[ "$S" == *"completed"* ]]; then break; fi
done

# ───────── Step 6: final report ─────────
echo
echo "════════════════════════════════════════════════════════════"
echo "  FINAL STATUS"
echo "════════════════════════════════════════════════════════════"

printf "Cloud Run /healthz:          "
curl -sI "$RENDERER/healthz" | head -1
printf "IndexNow verification file:  "
curl -sI https://jegodigital.com/2dfff6466f8343efacd92a5554a96d65.txt | head -1
printf "Firebase Functions (submitAuditRequest): "
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST \
  https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest \
  -H "Content-Type: application/json" -d '{}'
printf "Workflow runs:\n"
gh run list --repo "$REPO" --limit 4

echo
echo "If /healthz is 200 and IndexNow file is 200 → DONE. We can generate mockups."
echo "If anything is still red, paste output and we fix it."
