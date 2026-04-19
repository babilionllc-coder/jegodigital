#!/usr/bin/env bash
# setup_deploy.sh — One-shot GCP + GitHub Secrets setup for JegoDigital auto-deploy
#
# Run ONCE on your Mac. Requires: gcloud + gh CLIs authenticated.
#   brew install google-cloud-sdk gh
#   gcloud auth login
#   gh auth login   # pick "HTTPS", "login with web browser"
#
# After this script finishes, every `git push origin main` auto-deploys
# Cloud Run + Firebase + submits URLs to Google/IndexNow. No manual deploys ever again.

set -euo pipefail

PROJECT_ID="jegodigital-e02fb"
REPO="babilionllc-coder/jegodigital"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
INDEX_SA_EMAIL="jegodigital@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="/tmp/gcp-sa-key.json"
INDEX_KEY_FILE="/tmp/indexing-sa-key.json"
INDEXNOW_KEY="2dfff6466f8343efacd92a5554a96d65"   # matches website/2dfff6466f8343efacd92a5554a96d65.txt

echo "== JegoDigital auto-deploy setup =="
echo "Project: $PROJECT_ID"
echo "Repo:    $REPO"
echo "SA:      $SA_EMAIL"
echo

# ---------------------------------------------------------------
# 0. Pre-flight — verify CLIs + auth
# ---------------------------------------------------------------
command -v gcloud >/dev/null || { echo "ERROR: gcloud not installed"; exit 1; }
command -v gh >/dev/null || { echo "ERROR: gh not installed"; exit 1; }

gcloud config set project "$PROJECT_ID" >/dev/null
gh auth status >/dev/null 2>&1 || { echo "ERROR: run 'gh auth login' first"; exit 1; }

echo "[1/6] Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudfunctions.googleapis.com \
  artifactregistry.googleapis.com \
  indexing.googleapis.com \
  --project="$PROJECT_ID" --quiet

# ---------------------------------------------------------------
# 1. Create github-deployer SA (or reuse if exists)
# ---------------------------------------------------------------
echo "[2/6] Ensuring github-deployer service account..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deployer" \
    --project="$PROJECT_ID"
else
  echo "  already exists — skipping create"
fi

echo "[3/6] Granting roles..."
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/iam.serviceAccountUser roles/storage.admin roles/artifactregistry.writer roles/cloudfunctions.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" --quiet >/dev/null
  echo "  ✓ $ROLE"
done

echo "[4/6] Minting deployer SA key..."
rm -f "$KEY_FILE"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

echo "[5/6] Ensuring indexing SA key (for auto-index.yml)..."
if ! gcloud iam service-accounts describe "$INDEX_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "jegodigital" \
    --display-name="Google Indexing API" \
    --project="$PROJECT_ID"
  echo "  ⚠️  NEW indexing SA created — you MUST add $INDEX_SA_EMAIL as Owner in Search Console"
  echo "     https://search.google.com/search-console → jegodigital.com → Settings → Users → Add"
fi
rm -f "$INDEX_KEY_FILE"
gcloud iam service-accounts keys create "$INDEX_KEY_FILE" \
  --iam-account="$INDEX_SA_EMAIL" \
  --project="$PROJECT_ID"

# ---------------------------------------------------------------
# 2. Push secrets to GitHub (using gh CLI, no browser)
# ---------------------------------------------------------------
echo "[6/6] Setting GitHub Secrets..."

gh_set() {
  local name="$1" value="$2"
  printf '%s' "$value" | gh secret set "$name" --repo="$REPO"
  echo "  ✓ $name"
}

gh_set_file() {
  local name="$1" file="$2"
  gh secret set "$name" --repo="$REPO" < "$file"
  echo "  ✓ $name (from file)"
}

gh_set_file GCP_SA_KEY "$KEY_FILE"
gh_set_file GOOGLE_SERVICE_ACCOUNT_KEY "$INDEX_KEY_FILE"
gh_set INDEXNOW_KEY "$INDEXNOW_KEY"
gh_set MOCKUP_RENDERER_URL "https://mockup-renderer-wfmydylowa-uc.a.run.app"

echo
echo "== Core secrets set. Now add the remaining API keys =="
echo "For each one below, run:"
echo "  gh secret set SECRET_NAME --repo=$REPO"
echo "And paste the value when prompted."
echo
echo "Remaining secrets (values live in website/functions/.env on this Mac):"
cat <<'EOF'
  FIREBASE_TOKEN           (get via: firebase login:ci)
  BREVO_API_KEY            (from website/functions/.env)
  BREVO_SENDER_EMAIL       ("hello@jegodigital.com" or similar)
  BREVO_SENDER_NAME        ("Alex Jego")
  GEMINI_API_KEY           (.env)
  FIRECRAWL_API_KEY        (.env)
  DATAFORSEO_LOGIN         (.env)
  DATAFORSEO_PASS          (.env)
  PERPLEXITY_API_KEY       (.env)
  SERPAPI_KEY              (.env)
  PSI_API_KEY              (.env)
  PAGESPEED_API_KEY        (same as PSI_API_KEY)
  HUNTER_API_KEY           (.env)
  ELEVENLABS_API_KEY       (.env)
  CALENDLY_PAT             (.env)
  CALENDLY_EVENT_TYPE_URI  (.env)
  ALEX_EMAIL               "jegoalexdigital@gmail.com"
  TWILIO_ACCOUNT_SID       (.env)
  TWILIO_AUTH_TOKEN        (.env)
  TWILIO_FROM              "+529983871618"
  TELEGRAM_BOT_TOKEN       (.env)
  TELEGRAM_CHAT_ID         (.env)
EOF
echo
echo "Helper — if .env already has these, run this one-liner to bulk import:"
echo "  while IFS='=' read -r k v; do [[ -n \"\$k\" && ! \"\$k\" =~ ^# ]] && printf '%s' \"\$v\" | gh secret set \"\$k\" --repo=$REPO; done < website/functions/.env"
echo

# ---------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------
rm -f "$KEY_FILE" "$INDEX_KEY_FILE"
echo "Cleaned up /tmp key files."
echo
echo "== Done =="
echo "Next: git push origin main → watch https://github.com/$REPO/actions"
