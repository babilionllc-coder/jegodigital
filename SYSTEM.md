# JegoDigital — Live System Inventory

**Single source of truth for every automation, cron, function, trigger, and external
dependency that keeps the business running without Alex touching a laptop.**

> **How this doc works:** `CLAUDE.md` defines *behaviour rules* (tone, pricing, stack).
> `NOTEBOOKLM_LEVERAGE_PLAN_2026-04-19.md` defines the *strategic direction* (where
> we're going). **This file defines what actually exists, right now, in production.**
> When anything ships, changes, breaks, or gets deprecated — update this file first,
> commit, then touch code.

**Last updated:** 2026-04-20 · **Owner:** Alex Jego + Claude · **Project:** jegodigital-e02fb

---

## 1. Cloud Functions (Firebase, us-central1)

All functions live in `website/functions/`. Deploy happens automatically via
`.github/workflows/deploy.yml` on push to `main`. Never run `firebase deploy` from
a laptop — see `DEPLOY.md`.

### 1.1 Scheduled (Pub/Sub cron)

| Function | Interval | File | What it does | Alert on fail |
|---|---|---|---|---|
| `scheduledCampaign` | every 1 hour | `index.js` | Runs the old SEO campaign processor. Low-value — candidate for removal. | — |
| `processScheduledEmails` | every 1 hour | `calendlyWebhook.js` | Scans `scheduled_emails` Firestore collection and dispatches queued Brevo sends whose `send_at` has passed. Handles no-show recovery emails (+3d / +7d / +14d) and any other time-delayed transactional send. | Telegram (planned) |
| `sendT10minReminders` | every 5 minutes | `calendlyWebhook.js` | Window-scans `calendly_events` for bookings starting in ≈10min from ManyChat-sourced leads. Fires the T-10 WhatsApp ping via ManyChat API. Sets `t10min_sent=true` so a booking is never pinged twice. | Telegram (planned) |
| `dailyDigest` | every day 07:00 CDMX | `dailyDigest.js` | Pulls yesterday's Calendly / audit / Brevo-queue / call / Instantly numbers. Builds one-card Telegram Markdown summary. Snapshots to `daily_digests/{YYYY-MM-DD}`. Every metric wrapped in its own try/catch — partial data renders "—". | Telegram |
| `systemHealthAudit` | every 48 hours | `systemHealthAudit.js` | 12-check watchdog: hosting · audit endpoint · Cloud Run mockup-renderer · DataForSEO · PageSpeed · Firecrawl · Perplexity · Brevo · Telegram · `daily_digest` freshness · audits flowing · `scheduled_email` failure rate. Any red → Telegram alert listing every broken check. All-green → silent except day-1-of-month alive-ping. Snapshot: `system_health/{runId}`. **Never auto-edits code** — surface-only. | Telegram |
| `coldCallPrep` | 09:55 Mon–Fri CDMX | `coldCallAutopilot.js` | Queries `phone_leads` (phone_verified=true, do_not_call=false, last_called_at > 14d ago), ranks oldest-first, writes 50 into `call_queue/{YYYY-MM-DD}/leads/{leadId}` with round-robin A/B/C offer assignment. Snapshots to `call_queue_summaries/{YYYY-MM-DD}`. | Telegram |
| `coldCallRun` | 10:00 Mon–Fri CDMX | `coldCallAutopilot.js` | Fires today's queue via ElevenLabs `/v1/convai/twilio/outbound-call` (Sofia MX, agent per offer). Throttles 12s between dials. Seeds `call_analysis/{conversationId}` to `outcome=pending` at dial time so the 13:00 report can reconcile even if `elevenLabsWebhook` is slow. Updates `phone_leads.last_called_at`. **No approve-gate** — fires directly (per Alex 2026-04-20). | Telegram |
| `coldCallReport` | 13:00 Mon–Fri CDMX | `coldCallAutopilot.js` | Aggregates today's `call_analysis` (positive / negative / neutral / pending). Auto-fires `audit_requests` with `source: cold_call` for every positive that has email + website. Snapshots to `call_queue_summaries/{YYYY-MM-DD}`. | Telegram |

### 1.2 Firestore-triggered (onCreate)

| Function | Collection | File | Purpose |
|---|---|---|---|
| `onLeadCreated` | `leads/{leadId}` | `index.js` | Kicks off new-lead side-effects (Brevo sync, Telegram ping, etc.) |
| `processAuditRequest` | `audit_requests/{docId}` | `auditPipeline.js` | **Live audit pipeline.** Runs PSI + DataForSEO + Firecrawl **dual-fetch** (shell + rendered) + Perplexity, builds HTML report, uploads to Storage, queues Brevo email with `scheduledAt = now + 45min`. No separate scheduled function — Brevo handles the delayed send natively. |

### 1.3 HTTP webhooks & public endpoints

| Function | Purpose |
|---|---|
| `submitLead` | Website lead-capture form endpoint |
| `submitAuditRequest` | `/auditoria-gratis` form + ManyChat IG audit flow entry point — writes to `audit_requests` which fires `processAuditRequest` |
| `sendContactEmail` | Contact form on jegodigital.com |
| `sendCalendlyLink` | ManyChat / Sofia helper — returns calendly slots |
| `getCalendlySlots` / `getAvailableSlots` / `bookCalendlyLive` | ManyChat WhatsApp + IG in-chat booking (no redirect to calendly.com) |
| `calendlyWebhook` | Entry point for Calendly webhooks — fans out to Brevo, Telegram, scheduled emails queue, SMS reminders |
| `twilioWebhook` | Twilio voice / SMS callback endpoint |
| `elevenLabsWebhook` | ElevenLabs Conversational AI post-call callback |
| `voiceAgentCall` | Triggers a Sofia (ElevenLabs) outbound call via Twilio |
| `syncManualCall` / `handleCallAnalysis` | Pull call recordings / transcripts / analysis into Firestore |
| `postSocial` | Outbound social-media publishing helper |
| `generateVideo` / `checkVideoStatus` | Property-video pipeline wrappers |
| `googleIndexer` | Google Indexing API submission |
| `runSiteAudit` | Legacy on-demand SEO audit (V2.2) |
| `startCampaign` | Manual campaign kickoff (rarely used) |
| `uploadCampaignLogs` | Logs sink for the old campaign engine |
| `createStripeCheckout` | Stripe checkout session generator |
| `chat` | Conversational endpoint (minimal use) |
| `helloWorld` | Health probe |

### 1.4 Callable (client-invoked)

| Function | Purpose |
|---|---|
| `sendLiveEmail` | Real-time email send from the admin dashboard |
| `getCompetitorSpy` | Competitor SEO snapshot for a client |
| `getRankRadar` | Keyword rank tracking |
| `getBacklinkHunter` | Backlink scrape |

---

## 2. Planned crons (roadmap — not yet shipped)

Built in small order so every addition lands green. Each one gets its own PR +
update to this table.

**Design rule (per Alex 2026-04-20):** no approve-before-fire gates. Crons fire
directly and learn from logs + Firestore analytics + dailyDigest when something
goes wrong. See `.auto-memory/feedback_no_approve_gates.md`.

| Cron | Interval | Purpose | Notifies |
|---|---|---|---|
| `instantlyReplyWatcher` | every 5 min | Polls Instantly Unibox for unreplied positive responses. For each: pulls `{{website}}` from the lead record, writes a fresh `audit_requests` doc (source `instantly_autofire`), which Brevo sends 45min later. Lower priority now that the Instantly AI reply agent offers the one-click audit link — close the gap for leads who reply "yes please" but don't click. | Telegram (per-lead) |
| `notebookResearcher` | 02:00 daily | NotebookLM deep-research pass across the Ops Brain notebooks. Writes a 200-word digest + 3 concrete experiments to try. Posts to Telegram. Blocked on NotebookLM MCP auth. | Telegram |

---

## 3. Firestore collections

| Collection | Written by | Read by | Notes |
|---|---|---|---|
| `leads` | `submitLead`, ManyChat webhook | `onLeadCreated`, Brevo sync | Master lead store. |
| `audit_requests` | `submitAuditRequest`, `coldCallReport`, `instantlyReplyWatcher` (planned) | `processAuditRequest` | `source` field differentiates `manychat_instagram` / `auditoria-gratis` / `instantly_autofire` / `cold_call`. |
| `phone_leads` | `lead-finder-v4` (phone-verified set), manual curation | `coldCallPrep`, `coldCallRun` | Master phone list. Required flags: `phone_verified:true`, `do_not_call:false`. `last_called_at` / `last_offer` / `last_conversation_id` updated by `coldCallRun`. |
| `audits` | `processAuditRequest` | dashboard | Completed audit record + Storage URL. |
| `calendly_events` | `calendlyWebhook` | `sendT10minReminders`, reporting | One doc per booked/canceled/no-show invitee. |
| `scheduled_emails` | `calendlyWebhook` (no-show, +3d/+7d/+14d) | `processScheduledEmails` | Time-delayed transactional queue. |
| `call_queue` | `coldCallPrep` | `coldCallRun` | Daily 50-lead dialer queue — `call_queue/{YYYY-MM-DD}/leads/{leadId}`. Status transitions: `queued` → `dialed` / `failed`. |
| `call_queue_summaries` | `coldCallPrep`, `coldCallRun`, `coldCallReport` | `dailyDigest`, dashboard | One doc per CDMX day with prep/run/report snapshots (total, offer_counts, fired, failed, positive/negative/neutral/pending, audits_queued). |
| `call_analysis` | `coldCallRun` (seeds pending), `handleCallAnalysis`, `elevenLabsWebhook` | `coldCallReport`, `dailyDigest`, dashboard | Transcript + outcome per call, keyed by ElevenLabs `conversation_id`. |
| `campaigns` / `campaign_logs` | `startCampaign`, `uploadCampaignLogs` | legacy dashboard | Old SEO campaign engine — low traffic. |
| `instantly_activity` | `instantlyReplyWatcher` (planned) | dashboard | Rolling reply cache, avoids double-firing audits. |
| `daily_digests` | `dailyDigest` | dashboard, history | One doc per CDMX day, `{YYYY-MM-DD}`. Full metric breakdown + rendered digest text. |
| `system_health` | `systemHealthAudit` | dashboard, Telegram | One doc per check-run `{ISO-timestamp}`, full 12-check verdict. |
| `research_digests` | `notebookResearcher` (planned) | Telegram digest | Daily NotebookLM output. |

---

## 4. External dependencies

| Service | Purpose | Secret / Token | Owner | Break-glass |
|---|---|---|---|---|
| **Firebase / GCP** `jegodigital-e02fb` | Hosting, Functions, Firestore, Scheduler, Storage | `FIREBASE_TOKEN` (GH Secret) | Alex | Re-issue via `firebase login:ci` |
| **GitHub Actions** | CI/CD for Functions, Hosting, Cloud Run, indexing, smoke | `FIREBASE_TOKEN`, per-API secrets | Alex | Re-run failed workflow manually |
| **Cloud Run mockup-renderer** | HTML→PNG for complex mockups | — (public endpoint) | Alex | Redeploy via push to main |
| **Brevo** | Transactional email + nurture lists (29 = audit, 32 = generic) | `BREVO_API_KEY` | Alex | Dashboard → API keys |
| **Instantly.ai** | Cold email (sending + Unibox + AI reply) | `INSTANTLY_API_KEY` | Alex | Per-workspace key |
| **ElevenLabs** | Sofia voice agent (cold calling) + TTS for video VO | `ELEVENLABS_API_KEY` | Alex | — |
| **Twilio** | MX phone number `+52 998 387 1618` for Sofia | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Alex | Console |
| **ManyChat** | Sofia WhatsApp + IG funnel | ManyChat API key | Alex | — |
| **Calendly** | Booking engine | `CALENDLY_PAT`, `CALENDLY_EVENT_TYPE_URI` | Alex | — |
| **DataForSEO** | Keyword / rank / audit data | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASS` | Alex | — |
| **Perplexity (Sonar)** | AEO visibility checks | `PERPLEXITY_API_KEY` | Alex | — |
| **SerpAPI** | Live SERP snapshots | `SERPAPI_KEY` | Alex | — |
| **Firecrawl** | Rendered page fetch for audit pipeline | `FIRECRAWL_API_KEY` | Alex | — |
| **Hunter.io** | Email finder for lead enrichment | `HUNTER_API_KEY` | Alex | — |
| **PageSpeed Insights** | Core Web Vitals in audit report | `PAGESPEED_API_KEY` / `PSI_API_KEY` | Alex | — |
| **Telegram** | Primary notification channel | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alex | BotFather |
| **NotebookLM** | Overnight strategic research | OAuth (MCP) | Alex | Re-auth via MCP |
| **Catbox.moe** | Public PNG hosting for Instagram publishing | — | Alex | — |

All secrets injected into Functions at deploy time by
`.github/workflows/deploy.yml` (`Create .env file` step) and into Cloud Run by
`deploy-cloudrun.yml`. Never paste a secret in chat; never commit `env/`,
`*.json.key`, or `service-account*.json`.

---

## 5. CI/CD pipelines

| Workflow | Trigger | What it deploys |
|---|---|---|
| `.github/workflows/deploy.yml` | push to `main` touching `website/**` or the workflow itself | Cloud Functions + Hosting. Functions get full `.env` injection from GitHub Secrets. Hosting strips `predeploy` with **jq** (not sed — see `.auto-memory/firebase_deploy_traps.md`). |
| `.github/workflows/deploy-cloudrun.yml` | push to `main` touching `mockup-renderer/**` | Cloud Run `mockup-renderer` service |
| `.github/workflows/auto-index.yml` | every push to `main` | Google Indexing API + IndexNow submission for changed URLs |
| `.github/workflows/smoke-test.yml` | daily 08:00 UTC | End-to-end health probe against live site |

### Two known deploy traps (both fixed 2026-04-20)

1. **Line-based sed to strip `hosting.predeploy` from `firebase.json` leaves a
   trailing comma** → "Parse Error: Trailing comma in object at 623:5". Fix:
   use `jq 'if .hosting then .hosting |= del(.predeploy) else . end'`.
2. **Removing `exports.X` for a scheduled function without also deleting the
   live GCP function + its Cloud Scheduler job** → Firebase CLI tries to delete
   the ghost, hits 404 on the scheduler, whole Functions deploy exits 2. Fix:
   always `firebase functions:delete NAME --region REGION --force` in the same
   session you delete the export.

Full diagnostic playbook: `.auto-memory/firebase_deploy_traps.md`.

---

## 6. Notification routing (today)

```
Calendly booked       → Telegram
Calendly canceled     → Telegram
Calendly no-show      → Brevo recovery sequence (+3d/+7d/+14d) + Telegram ping
T-10 WhatsApp ping    → ManyChat API (only for ManyChat-sourced leads)
Audit delivered       → Brevo transactional email (45min delay)
Cold-call queue prep  → Telegram (09:55 CDMX weekdays)
Cold-call batch fired → Telegram (10:00 CDMX weekdays, fired/failed counts)
Cold-call report      → Telegram (13:00 CDMX weekdays, positives + auto-audits)
Call completed        → Firestore `call_analysis` (elevenLabsWebhook)
System health fail    → Telegram
Daily digest          → Telegram (07:00 CDMX)
Notebook digest       → Telegram (planned)
```

Telegram is the **primary** channel. Everything else is secondary. When in
doubt, add Telegram first — Slack can wait.

---

## 7. How to add a new automation (the recipe)

1. **Write SKILL/PRD-style intent here first.** Add a row to §2 (planned crons)
   or §1 (live). One line, one purpose.
2. **Define the Firestore shape** if the cron needs state. Add it to §3.
3. **Write the Cloud Function** in `website/functions/` — reuse
   `calendlyWebhook.js` as a template for pub/sub + Telegram logging.
4. **Push to `main`.** Actions deploys. Nothing local.
5. **Verify in Cloud Scheduler Console** that the job was created and the next
   run fires within the interval.
6. **Move the row from §2 (planned) to §1 (live)** in the same PR. This doc
   stays truthful or it's worthless.
7. **Add a watchdog check** for it in `systemHealthAudit` once that cron ships.

Three guard-rails for every new cron:

- **Idempotency.** The job must be safe to run twice (e.g. Brevo audit emails
  keyed by `audit_request_id`, not wall-clock).
- **Telegram beats silent success.** Every cron posts at least one line to
  Telegram per run, even on `nothing_to_do`, for the first week. Mute later.
- **Fire directly, learn from logs.** No approve-before-fire gates — cron fires,
  Firestore + dailyDigest + systemHealthAudit surface anomalies after the fact.
  (per Alex 2026-04-20, `.auto-memory/feedback_no_approve_gates.md`). Only
  escalate to an explicit gate for genuinely catastrophic actions (10k+ emails
  in one shot, $1k+ API spend in one run, unreviewed content going to clients).

---

## 8. Open questions / known gaps

- **Phantom `runPendingAudits` Cloud Scheduler job.** Orphan from the pre-dual-fetch
  architecture. Each Functions deploy still exits 2 cleaning it up. Doesn't block
  real functions. Cleanup task: direct Cloud Functions API `DELETE` on the ghost.
- **Telegram sinks not yet wired into every scheduled function.** `processScheduledEmails`
  and `sendT10minReminders` currently only log to Functions logger. Need a shared
  `notifyTelegram(severity, msg)` helper.
- **Phone-ready lead list at scale.** `phone_leads` seeded via `lead-finder-v4`
  phone-verified pass; `coldCallPrep` draws from here. Need to monitor depletion
  — at 50/day × 5 days × rotate every 14d, must maintain ≥ 700 phone-verified
  leads in rotation. Top up weekly via `lead-finder-v4`.
- **ElevenLabs plan capacity.** Current plan sufficient for ≤150 calls/day. Flag
  for Alex if Sofia batch sizes rise.
- **Brevo list discipline.** Multiple lists exist (29 audit, 32 generic,
  no-show recovery). Need a routing matrix (who lands on which list, and why) —
  candidate for a dedicated `BREVO_LISTS.md`.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-04-20 | Initial SYSTEM.md created. Inventory captured post-deploy-trap cleanup. Roadmap for 6 new crons scoped (daily digest, cold-call trio, Instantly watcher, health audit, notebook researcher). |
| 2026-04-20 | **`dailyDigest` shipped** (commit `1df1d33`) — 07:00 CDMX Telegram brief + `daily_digests/{YYYY-MM-DD}` snapshot. |
| 2026-04-20 | **`systemHealthAudit` shipped** (commit `971575a`) — every-48h 12-check watchdog + `system_health/{runId}` snapshot. |
| 2026-04-20 | **Policy change:** dropped approve-before-fire gate from cron design rules (Alex feedback). Saved as `.auto-memory/feedback_no_approve_gates.md`. Updated §2 planned-cron schema + §7 guard-rails to match. |
| 2026-04-20 | **Cold-call autopilot trio shipped** (commit `66ad86b`) — `coldCallPrep` 09:55, `coldCallRun` 10:00, `coldCallReport` 13:00 Mon–Fri CDMX. 50 dials/day with A/B/C offer rotation, positives auto-fire `audit_requests`. New collections: `phone_leads`, `call_queue`, `call_queue_summaries`. |

---

**Rule zero:** if you touch a cron, function, collection, or external service and
this file doesn't change in the same commit, you didn't actually ship. Update
first, then code.
