# DEPLOY — Single Source of Truth

**Read this file first before touching any deploy, infrastructure, or CI task.**

Last updated: 2026-04-18

---

## The Rule

**Nothing deploys manually. Ever.** No `gcloud run deploy`, no `firebase deploy`, no `scp`. If you need to ship a change:

1. Edit the file
2. `git commit`
3. `git push origin main`
4. Watch GitHub Actions

If a deploy needs to happen and pushing doesn't do it, the fix is to **add a workflow**, not to run a CLI command. Manual deploys skip secret injection, break reproducibility, and are the #1 cause of "works on Alex's laptop, broken in production."

---

## The 3 Workflows

All in `.github/workflows/`. All trigger on `push` to `main` with `paths:` filters so only relevant workflows fire.

### 1. `deploy-cloudrun.yml` — Cloud Run (mockup-renderer)
- **Fires when:** `website/mockup-renderer/**` or the workflow file itself changes
- **What it does:**
  1. Authenticates to GCP via `GCP_SA_KEY` secret
  2. `gcloud run deploy mockup-renderer --source=./website/mockup-renderer ...`
  3. Forces `allUsers → roles/run.invoker` IAM binding (fixes the silent-404 bug where `--allow-unauthenticated` gets ignored)
  4. Smoke-tests `/health` with 5 retries — fails the build if it doesn't return 200
- **Service URL:** `https://mockup-renderer-wfmydylowa-uc.a.run.app`
- **Verify a deploy worked:** `curl https://mockup-renderer-wfmydylowa-uc.a.run.app/health` → `{"ok":true,...}`
- **NOTE:** Google's Cloud Run edge layer **reserves `/healthz`** (intercepts it with a Google-branded 404 before it reaches the container). Always use `/health`. The server keeps `/healthz` as a backward-compatible alias but only `/health` is reliably reachable from outside the edge.

### 2. `deploy.yml` — Firebase (Functions + Hosting)
- **Fires when:** `website/**` changes (or manual `workflow_dispatch`)
- **What it does:**
  1. Builds `website/functions/.env` from GH Secrets (25 env vars)
  2. `firebase deploy --only functions --force`
  3. Separately: `firebase deploy --only hosting`
- **Functions:** `submitAuditRequest`, `calendlyWebhook`, `generateMockup`, `runPendingMockups`, `triggerMockupNow`, `processScheduledEmails`, `sendT10minReminders`, etc.
- **Hosting:** `jegodigital.com` + client subsites
- **Verify a deploy worked:** Check the Actions tab — both `deploy-functions` and `deploy-hosting` jobs must be green.

### 3. `auto-index.yml` — Google + IndexNow submission
- **Fires when:** `website/**` changes
- **What it does:**
  1. Regenerates `website/sitemap.xml` via `node .agents/scripts/auto_sitemap.js`
  2. Runs `node .agents/scripts/force_index.js` which:
     - Submits every URL to Google Indexing API v3 with JWT auth (`URL_UPDATED`, 200/day cap, 100ms rate-limit)
     - Submits the full list to IndexNow (one request, fans out to Bing/Yandex/Seznam/Naver)
  3. Exits non-zero only if BOTH Google and IndexNow fail
- **Critical prerequisite:** the service account in `GOOGLE_SERVICE_ACCOUNT_KEY` must be added as an **Owner** in Google Search Console for `jegodigital.com`. Without Owner permission, the API returns 200 but Google ignores every submission silently.
- **Current SA registered:** `jegodigital@jegodigital-e02fb.iam.gserviceaccount.com` (added 2026-04-18)
- **Verify indexing fired:** Actions tab → `auto-index` run → check logs for `OK Google: https://...` and `OK IndexNow: submitted N URLs (HTTP 200)`

---

## GitHub Secrets — Complete List

All set via https://github.com/babilionllc-coder/jegodigital/settings/secrets/actions. Browser only. **Never in chat, never on disk, never in code.**

| Secret | Used by | Source |
|---|---|---|
| `GCP_SA_KEY` | deploy-cloudrun | Full JSON of `github-deployer@jegodigital-e02fb.iam.gserviceaccount.com` key |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | auto-index | Full JSON of `jegodigital@jegodigital-e02fb.iam.gserviceaccount.com` key (Search Console Owner) |
| `INDEXNOW_KEY` | auto-index | 32-char UUID — file at `website/{KEY}.txt` must serve the key as plaintext |
| `FIREBASE_TOKEN` | deploy | `firebase login:ci` output |
| `MOCKUP_RENDERER_URL` | deploy | `https://mockup-renderer-wfmydylowa-uc.a.run.app` |
| `BREVO_API_KEY` | deploy | Brevo dashboard |
| `BREVO_SENDER_EMAIL` | deploy | `hello@jegodigital.com` |
| `BREVO_SENDER_NAME` | deploy | `Alex Jego` |
| `GEMINI_API_KEY` | deploy | Google AI Studio |
| `FIRECRAWL_API_KEY` | deploy | Firecrawl dashboard |
| `DATAFORSEO_LOGIN` | deploy | DataForSEO dashboard |
| `DATAFORSEO_PASS` | deploy | DataForSEO dashboard |
| `PERPLEXITY_API_KEY` | deploy | Perplexity API settings |
| `SERPAPI_KEY` | deploy | SerpAPI dashboard |
| `PSI_API_KEY` / `PAGESPEED_API_KEY` | deploy | Same GCP key, PageSpeed Insights enabled |
| `TELEGRAM_BOT_TOKEN` | deploy | BotFather |
| `TELEGRAM_CHAT_ID` | deploy | Alex's Telegram ID |
| `CALENDLY_PAT` | deploy | Calendly personal access token |
| `CALENDLY_EVENT_TYPE_URI` | deploy | 30-min event URI |
| `ALEX_EMAIL` | deploy | `jegoalexdigital@gmail.com` |
| `TWILIO_ACCOUNT_SID` | deploy | Twilio console |
| `TWILIO_AUTH_TOKEN` | deploy | Twilio console |
| `TWILIO_FROM` | deploy | `+529983871618` |
| `ELEVENLABS_API_KEY` | deploy | ElevenLabs settings |
| `HUNTER_API_KEY` | deploy | Hunter.io dashboard |

---

## Verifying a Deploy Worked

After pushing to main, wait ~4-6 minutes, then:

```bash
# 1. Cloud Run
curl -s https://mockup-renderer-wfmydylowa-uc.a.run.app/health
# Expect: {"ok":true,"service":"mockup-renderer","version":"1.0.0"}

# 2. Firebase Functions
curl -s https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","website_url":"realestateflamingo.com.mx","name":"Test"}'
# Expect: {"success":true,"id":"..."}

# 3. Firebase Hosting
curl -sI https://jegodigital.com | head -5
# Expect: HTTP/2 200

# 4. Auto-index (inspect last Actions run, not a curl)
gh run list --workflow=auto-index.yml --limit=1
# Expect: status "completed", conclusion "success"
```

If any of these fail, **do not deploy a fix manually**. Open the failing workflow in the Actions tab, read the logs, and push a code fix.

---

## Common Failure Modes (and the Fix)

### Cloud Run returns Google's 404 HTML page instead of `/health`
- Root cause #1: `--allow-unauthenticated` silently fails when GCP org policy blocks public services. Fix: The `Force public access` step in `deploy-cloudrun.yml` explicitly applies the `allUsers → run.invoker` binding. If you see this error again, check that step's logs.
- Root cause #2: Google's Cloud Run edge layer **reserves the `/healthz` path** and returns its own 404 before the container sees the request — even if the service has a `/healthz` route registered. We probe `/health` instead. If a new deploy ever regresses on `/health`, **do not** fall back to `/healthz` to "test" — that will always 404 at the edge and tell you nothing about the container.

### Container crashes with `browserType.launch: Timeout`
- Root cause: Cloud Run sandbox restricts inotify, dbus, NETLINK — Playwright hangs trying to talk to them
- Fix (already in `server.js`): Cloud Run-specific Chromium flags (`--single-process`, `--no-zygote`, `--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process`, ~15 more `--disable-*`). Plus lazy-load browser only on first `/render` — never at container startup.

### Auto-index workflow succeeds but pages don't appear in Google
- Root cause: Service account not registered as Owner in Search Console
- Fix: https://search.google.com/search-console → jegodigital.com property → Settings → Users and permissions → Add user with **Owner** role = the `client_email` from `GOOGLE_SERVICE_ACCOUNT_KEY`. Currently: `jegodigital@jegodigital-e02fb.iam.gserviceaccount.com` ✅

### `firebase deploy` fails with "not authorized"
- Root cause: `FIREBASE_TOKEN` expired or revoked
- Fix: Run `firebase login:ci` locally, paste new token into `FIREBASE_TOKEN` GH Secret. Retry the workflow.

### Functions can't read an API key
- Root cause: GH Secret not populated, or name mismatch between workflow heredoc and `functions/index.js`
- Fix: Check the `Create .env file` step in `deploy.yml` — every `process.env.X` in functions code must have a matching `X=${{ secrets.X }}` line there.

---

## Daily Smoke Test (Automated)

A scheduled GH Actions workflow (`.github/workflows/smoke-test.yml`) runs at 08:00 UTC daily and pings all three pipelines. If anything returns non-2xx, the workflow fails and shows up red in the Actions tab.

Check: https://github.com/babilionllc-coder/jegodigital/actions/workflows/smoke-test.yml

---

## What NOT to Do

- ❌ Run `gcloud run deploy` from your laptop
- ❌ Run `firebase deploy` from your laptop
- ❌ Paste any token, API key, or service account JSON into chat
- ❌ Commit `env/`, `env.txt`, `*.json.key`, `service-account*.json` (all in `.gitignore`)
- ❌ Store credentials in any file the repo tracks
- ❌ Use `firebase login` interactively in CI (always `--token "$FIREBASE_TOKEN"`)
- ❌ Create new service accounts when an existing one will do (use `github-deployer` for deploys, `jegodigital@` for indexing)

---

## First-Time Setup (Historical — Already Done)

See `DEPLOY_AUTO_SETUP.md` for the one-time bootstrapping steps (creating the `github-deployer` service account, minting the key, pasting to GH Secrets). That doc is retained for disaster recovery only — if all credentials are ever lost, it's the runbook for rebuilding from scratch.
