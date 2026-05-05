# access_truth_jegodigital — credentials reality, locked

**Type:** reference (Rule 16 / HR-2 prevention)
**Created:** 2026-05-05 PM (after the Meta-tokens-unset disaster)
**Owner:** Claude (autonomous)
**Audience:** every future Claude session
**Tied to:** [`/ACCESS.md`](../../ACCESS.md) (canonical doc), `mistakes_ledger.md` 2026-05-05 entry, Rule 16 (investigate-never-ask)

---

## ⛔ THE RULE THIS FILE EXISTS TO LOCK

> **Before EVER claiming a JegoDigital credential is "missing", "unset", "not configured", or "expired", I must FIRST do TWO things in this exact order:**
>
> 1. Read `/ACCESS.md` (the canonical credential registry).
> 2. Hit the GitHub Secrets API: `GET /repos/babilionllc-coder/jegodigital/actions/secrets?per_page=100`. The PAT is at `.secrets/github_token`.
>
> The credential **exists until proven otherwise** by those two checks. A surface alarm from `tokenWatchdog`, `envAudit`, a 401 from a downstream API, or a missing `process.env.X` value is a **symptom**, not the truth. The credential might be (a) present in GH Secrets but not piped into deploy.yml's heredoc, (b) present in deploy.yml but stale because no deploy has run, (c) present under a different name (`FB_APP_ID` vs `META_APP_ID`), or (d) actually missing — only the GH Secrets API can tell me which.
>
> **Asking Alex "is this token set?" is a Rule 16 violation.** Investigate first. If the credential genuinely doesn't exist after both checks, escalate with a clear receipt of what was checked and where the gap is.

---

## 🗂️ GROUND TRUTH — 88 GitHub Secrets in `babilionllc-coder/jegodigital` (verified 2026-05-05 PM)

This is what `/repos/babilionllc-coder/jegodigital/actions/secrets?per_page=100` returned. Names only — NEVER paste values, NEVER commit values. ACCESS.md was last full-edited at 42 secrets (2026-04-23) and is therefore stale by 46 entries; this list supersedes it as ground truth until ACCESS.md is rewritten.

`/repos/babilionllc-coder/jegodigital/actions/variables` returned `total_count: 0` — there are zero Repository Variables. Everything is a Secret.

### Authentication & access (3)
- `ADMIN_TRIGGER_TOKEN` · `GH_PAT` · `SEED_SECRET`

### Apify, Hunter, Explorium (3)
- `APIFY_API_KEY` · `EXPLORIUM_API_KEY` · `HUNTER_API_KEY`

### Audit (1)
- `AUDIT_INTERNAL_ENDPOINT`

### Brevo (4)
- `BREVO_API_KEY` · `BREVO_FB_WELCOME_TEMPLATE_ID` · `BREVO_HIRING_INTENT_FB_LIST_ID` · `BREVO_SENDER_EMAIL` · `BREVO_SENDER_NAME`

### Calendly (2)
- `CALENDLY_PAT` · `CALENDLY_EVENT_TYPE_URI`

### DataForSEO (2)
- `DATAFORSEO_LOGIN` · `DATAFORSEO_PASS`

### ElevenLabs (1)
- `ELEVENLABS_API_KEY`

### Facebook / Meta (8)
- `FB_AD_ACCOUNT_ID` (= `968739288838315`)
- `FB_APP_ID`, `FB_APP_SECRET` — **same Meta App as `META_APP_ID` / `META_APP_SECRET`** for Graph API `/debug_token`
- `FB_BUSINESS_ID`
- `FB_PAGE_ACCESS_TOKEN` — Page-scoped long-lived token (IG publishing path: Page → linked IG)
- `FB_USER_TOKEN` — User long-lived token (Ads + Lead Forms)
- `META_LEAD_FORM_ID`
- `META_LEAD_VERIFY_TOKEN`
- `META_PAGE_ACCESS_TOKEN`

### Firebase / GCP (5)
- `FIREBASE_TOKEN` · `FIREBASE_ADMIN_SA_JSON` · `FLAMINGO_FIREBASE_SA_B64` · `GCP_SA_KEY` · `GOOGLE_SERVICE_ACCOUNT_KEY`

### Firecrawl, Gemini, OpenAI, Perplexity, Pexels, SerpAPI (6)
- `FIRECRAWL_API_KEY` · `GEMINI_API_KEY` · `OPENAI_API_KEY` · `PERPLEXITY_API_KEY` · `PEXELS_API_KEY` · `SERPAPI_KEY`

### Google Ads (6)
- `GOOGLE_ADS_CLIENT_ID` · `GOOGLE_ADS_CLIENT_SECRET` · `GOOGLE_ADS_CUSTOMER_ID` · `GOOGLE_ADS_DEVELOPER_TOKEN` · `GOOGLE_ADS_LOGIN_CUSTOMER_ID` · `GOOGLE_ADS_REFRESH_TOKEN`

### Google Maps + Indexing (3)
- `GOOGLE_MAPS_API_KEY` · `INDEXNOW_KEY` · `PAGESPEED_API_KEY` · `PSI_API_KEY` (legacy duplicate, both kept)

### HeyGen, Sync.so (video) (2)
- `HEYGEN_API_KEY` · `SYNC_LABS_API_KEY`

### Instagram (4)
- `IG_BATCH_SEED_TOKEN` · `IG_BUSINESS_ACCOUNT_ID` · `IG_GRAPH_TOKEN` · `IG_USER_ID`

### Instantly (1)
- `INSTANTLY_API_KEY`

### ManyChat (1)
- `MANYCHAT_API_KEY`

### Notion (3)
- `NOTION_API_KEY` · `NOTION_LEADS_CRM_ID` · `NOTION_SESSION_LOG_PAGE_ID`

### Slack (10)
- `SLACK_BOT_TOKEN` · `SLACK_WEBHOOK_URL` · `SLACK_WORKFLOW_TOKEN`
- `SLACK_CHANNEL_ALERTS` · `SLACK_CHANNEL_ALL_JEGODIGITAL` · `SLACK_CHANNEL_COLD_CALL_LOG` · `SLACK_CHANNEL_CONTENT` · `SLACK_CHANNEL_DAILY_OPS` · `SLACK_CHANNEL_LEADS_HOT` · `SLACK_CHANNEL_REVENUE`

### Telegram (2)
- `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID`

### TikTok (4)
- `TIKTOK_CLIENT_KEY` · `TIKTOK_CLIENT_SECRET` · `TIKTOK_SANDBOX_CLIENT_KEY` · `TIKTOK_SANDBOX_CLIENT_SECRET`

### Twilio (3)
- `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_FROM`

### Mockup renderer + Alex personal (3)
- `MOCKUP_RENDERER_URL` · `ALEX_EMAIL` · `ALEX_PERSONAL_PHONE`

### WhatsApp Cloud API (5)
- `WA_CLOUD_ACCESS_TOKEN` — **THIS is what some code calls `META_WA_CLOUD_TOKEN`**. Bound to WABA `1520533496454283`, phone_number_id `1044375245434120`.
- `WA_CLOUD_PHONE_NUMBER_ID` · `WA_CLOUD_VERIFY_TOKEN` · `WA_CLOUD_WABA_ID`
- `WHATSAPP_CLOUD_API_TOKEN` — duplicate/alias of `WA_CLOUD_ACCESS_TOKEN`

### YouTube (3)
- `YOUTUBE_CLIENT_ID` · `YOUTUBE_CLIENT_SECRET` · `YOUTUBE_REFRESH_TOKEN`

---

## 🪪 NAME-TRANSLATION TABLE — canonical → actual

When code asks for these "canonical" Meta/WA names but the value is stored under a different name in GH Secrets, the watchdog now resolves them via `ENV_ALIASES` (see `website/functions/tokenWatchdog.js`, commit `06bdf0f9`). Use this table for human reasoning.

| Canonical (what code asks for) | Actual GH Secret | Notes |
|---|---|---|
| `META_WA_CLOUD_TOKEN` | `WA_CLOUD_ACCESS_TOKEN` | also `WHATSAPP_CLOUD_API_TOKEN` exists as duplicate |
| `META_GRAPH_TOKEN` | `META_PAGE_ACCESS_TOKEN` (preferred) → `FB_PAGE_ACCESS_TOKEN` (fallback) | both are page-scoped tokens |
| `META_APP_ID` | `FB_APP_ID` | same Meta app, different name convention |
| `META_APP_SECRET` | `FB_APP_SECRET` | same Meta app, different name convention |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `WA_CLOUD_WABA_ID` | WABA = `1520533496454283` |
| `META_AD_ACCOUNT_ID` | `FB_AD_ACCOUNT_ID` | account `968739288838315` |
| `GITHUB_TOKEN` (in Functions runtime) | `GH_PAT` | `GITHUB_TOKEN` is reserved by GH Actions; cannot be set as a repo Secret |

---

## 🚧 KNOWN GAP — `deploy.yml` heredoc whitelist

A secret existing in GH Secrets does NOT automatically reach Cloud Functions runtime. The whitelist is the heredoc inside `.github/workflows/deploy.yml`'s `Create .env file` step. Anything not in the heredoc = BACKUP-ONLY (used in workflow-level steps directly or for local dev), not visible to `process.env.*` inside Cloud Functions.

As of commit `06bdf0f9` (this fix) the heredoc covers ~80 of 88 secrets. Currently NOT piped to runtime (intentional or by oversight):

`FIREBASE_TOKEN` (workflow only) · `GCP_SA_KEY` · `GOOGLE_SERVICE_ACCOUNT_KEY` · `INDEXNOW_KEY` · `EXPLORIUM_API_KEY` · `FIREBASE_ADMIN_SA_JSON` · `FLAMINGO_FIREBASE_SA_B64` · `YOUTUBE_*` (3) · `META_LEAD_FORM_ID` · all `GOOGLE_ADS_*` (6) · `HEYGEN_API_KEY` · `SYNC_LABS_API_KEY` · `TIKTOK_*` (4 — OAuth flow only) · `NOTION_LEADS_CRM_ID` (workflow only) · `SLACK_SIGNING_SECRET`.

**Before claiming "X is unset" — also check:**

```bash
grep "^[[:space:]]*X=" /Users/mac/Desktop/Websites/jegodigital/.github/workflows/deploy.yml
```

---

## 🔁 THE 4-STEP INVESTIGATION ALGORITHM (run BEFORE asking Alex)

```
1. cat /Users/mac/Desktop/Websites/jegodigital/ACCESS.md
   → does the doc list the credential? what name does it use?

2. curl -sS -H "Authorization: Bearer $(cat .secrets/github_token)" \
     "https://api.github.com/repos/babilionllc-coder/jegodigital/actions/secrets?per_page=100" \
     | jq -r '.secrets[].name' | grep -i <name>
   → does the secret exist in GH? under what exact name?

3. grep "^[[:space:]]*<NAME>=" .github/workflows/deploy.yml
   → is it piped into Cloud Functions runtime?

4. If steps 1-3 say "exists, piped":
   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/<probeFn>?token=<NAME>"
   → does the runtime actually see it?
```

| Outcome | Diagnosis | Fix (autonomous) |
|---|---|---|
| 1-3 ✅, 4 ✗ | stale deploy | trigger empty `website/**` push to main, deploy fires |
| 1-2 ✅, 3 ✗ | not in heredoc | add line to `.github/workflows/deploy.yml` heredoc, push |
| 1 ✅, 2 ✗ | ACCESS.md stale (common) | trust step 2; update ACCESS.md after fix |
| 1-2 ✗ both | actually missing | escalate with full receipt: "ACCESS.md doesn't list X, GH API confirms absent. Want me to open https://github.com/babilionllc-coder/jegodigital/settings/secrets/actions for you to add it?" |

---

## 🪞 WHY THIS FILE EXISTS

2026-05-05 PM I told Alex `META_WA_CLOUD_TOKEN` and `META_GRAPH_TOKEN` were unset based purely on `tokenWatchdog`'s daily critical alarm. Alex corrected me — those tokens have been in GitHub Secrets for weeks (under names `WA_CLOUD_ACCESS_TOKEN` and `META_PAGE_ACCESS_TOKEN`). I had:

- Never read ACCESS.md before claiming "unset"
- Never hit the GitHub Secrets API to check
- Trusted the watchdog's surface alarm without investigating WHY it was alarming
- Pushed the cognitive load back onto Alex

This memory file exists so future Claude sessions cannot make that mistake. The truth lives in (a) ACCESS.md and (b) the GH Secrets API. Surface alarms are symptoms, never reports of fact.

**Permanent prevention** (structural, not self-discipline):
- This file (read in bootstrap via MEMORY.md index)
- `tokenWatchdog.js` ENV_ALIASES extended (commit `06bdf0f9`) so the watchdog itself is more honest about WHY a token would alarm
- `mistakes_ledger.md` entry 2026-05-05 (PM) crystallizes the failure mode
- ACCESS.md scheduled rewrite (88 secrets, not 42) so the canonical doc matches reality
