# Auto-Deploy Setup — One-Time, ~15 minutes

After this, **every `git push` auto-deploys both Cloud Run and Firebase**. You never run `gcloud run deploy` or `firebase deploy` manually again.

---

## Step 0 — Revoke & rotate everything that leaked

The old tokens are burned. Before doing anything:

1. **GitHub token** — https://github.com/settings/tokens → delete the two PATs you exposed
2. **Old GCP service account key** — https://console.cloud.google.com/iam-admin/serviceaccounts?project=jegodigital-e02fb → find the service account whose key ID ends in `ff2b689f4b54` → Keys tab → delete that key
3. **Delete the env folder from your Mac:**
   ```bash
   rm -rf "/Users/mac/Desktop/Websites/jegodigital/env"
   rm -f /Users/mac/Desktop/env.txt
   ```

---

## Step 1 — Create a fresh GCP service account for deploys

You need a clean service account with only the roles required for Cloud Run + Firebase. Do this once:

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=jegodigital-e02fb

SA="github-deployer@jegodigital-e02fb.iam.gserviceaccount.com"

# Roles needed for Cloud Run deploys
gcloud projects add-iam-policy-binding jegodigital-e02fb \
  --member="serviceAccount:$SA" --role="roles/run.admin"
gcloud projects add-iam-policy-binding jegodigital-e02fb \
  --member="serviceAccount:$SA" --role="roles/cloudbuild.builds.editor"
gcloud projects add-iam-policy-binding jegodigital-e02fb \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser"
gcloud projects add-iam-policy-binding jegodigital-e02fb \
  --member="serviceAccount:$SA" --role="roles/storage.admin"
gcloud projects add-iam-policy-binding jegodigital-e02fb \
  --member="serviceAccount:$SA" --role="roles/artifactregistry.writer"

# Create the key
gcloud iam service-accounts keys create /tmp/gcp-sa-key.json \
  --iam-account=$SA \
  --project=jegodigital-e02fb
```

---

## Step 2 — Paste it into GitHub Secrets (once, in your browser)

1. Open https://github.com/babilionllc-coder/jegodigital/settings/secrets/actions
2. Click **New repository secret** for each of these:

| Secret name | Value |
|---|---|
| `GCP_SA_KEY` | Paste the ENTIRE contents of `/tmp/gcp-sa-key.json` |
| `MOCKUP_RENDERER_URL` | `https://mockup-renderer-wfmydylowa-uc.a.run.app` |
| `FIREBASE_TOKEN` | Already set — skip if exists |
| `BREVO_API_KEY` | From `website/functions/.env` |
| `GEMINI_API_KEY` | From `website/functions/.env` |
| `FIRECRAWL_API_KEY` | From `website/functions/.env` |
| `DATAFORSEO_LOGIN` | From `website/functions/.env` |
| `DATAFORSEO_PASS` | From `website/functions/.env` |
| `PERPLEXITY_API_KEY` | From `website/functions/.env` |
| `SERPAPI_KEY` | From `website/functions/.env` |
| `PSI_API_KEY` | From `website/functions/.env` |
| `PAGESPEED_API_KEY` | Same as PSI_API_KEY |
| `TELEGRAM_BOT_TOKEN` | From `website/functions/.env` |
| `TELEGRAM_CHAT_ID` | From `website/functions/.env` |
| `BREVO_SENDER_EMAIL` | hello@jegodigital.com (or whatever you use) |
| `BREVO_SENDER_NAME` | Alex Jego |
| `CALENDLY_PAT` | From `website/functions/.env` |
| `CALENDLY_EVENT_TYPE_URI` | From `website/functions/.env` |
| `ALEX_EMAIL` | jegoalexdigital@gmail.com |
| `TWILIO_ACCOUNT_SID` | From `website/functions/.env` |
| `TWILIO_AUTH_TOKEN` | From `website/functions/.env` |
| `TWILIO_FROM` | From `website/functions/.env` |
| `ELEVENLABS_API_KEY` | From `website/functions/.env` |
| `HUNTER_API_KEY` | From `website/functions/.env` |

3. After pasting `GCP_SA_KEY`, delete the local key file:
   ```bash
   rm /tmp/gcp-sa-key.json
   ```

---

## Step 3 — First deploy

Commit and push:

```bash
cd "/Users/mac/Desktop/Websites/jegodigital"
git add .github/workflows/deploy-cloudrun.yml .github/workflows/deploy.yml .gitignore DEPLOY_AUTO_SETUP.md website/mockup-renderer/ website/functions/generateMockup.js website/functions/mockup_template.html website/functions/index.js
git commit -m "ci: auto-deploy Cloud Run + Firebase on push + fix mockup-renderer 404"
git push origin main
```

Two workflows fire:

1. **Deploy Cloud Run - Mockup Renderer** — https://github.com/babilionllc-coder/jegodigital/actions/workflows/deploy-cloudrun.yml
   - Rebuilds mockup-renderer container
   - Forces `allUsers → run.invoker` binding (fixes the current 404)
   - Smoke-tests `/healthz`

2. **Deploy to Firebase** — https://github.com/babilionllc-coder/jegodigital/actions/workflows/deploy.yml
   - Rebuilds `.env` from GH Secrets (including new `MOCKUP_RENDERER_URL`)
   - Deploys all functions including `generateMockup`, `runPendingMockups`, `triggerMockupNow`

Both should go green within ~4-6 minutes.

---

## Step 4 — Smoke-test the pipeline

After both workflows succeed:

```bash
curl -s https://mockup-renderer-wfmydylowa-uc.a.run.app/healthz
# Expect: {"ok":true,"service":"mockup-renderer","version":"1.0.0"}

curl -X POST https://us-central1-jegodigital-e02fb.cloudfunctions.net/triggerMockupNow \
  -H "Content-Type: application/json" \
  -d '{"website_url":"realestateflamingo.com.mx","email":"jegoalexdigital@gmail.com","name":"Alex Test","city":"Cancún"}'
# Expect: {"success":true,"id":"...","message":"Queued..."}
```

Within ~45s you'll get a Telegram ping with the mockup URL. Open it and review the PNG.

---

## Step 5 — From now on

Every edit → commit → push → both workflows fire → production updates. No gcloud, no firebase CLI, no `.env` juggling.

If either workflow fails, click into the run at the Actions tab — full logs there.
