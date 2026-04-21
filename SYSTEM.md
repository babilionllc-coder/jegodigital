# JegoDigital — Live System Inventory

**Single source of truth for every automation, cron, function, trigger, and external
dependency that keeps the business running without Alex touching a laptop.**

> **How this doc works:** `CLAUDE.md` defines *behaviour rules* (tone, pricing, stack).
> `NOTEBOOKLM_LEVERAGE_PLAN_2026-04-19.md` defines the *strategic direction* (where
> we're going). **This file defines what actually exists, right now, in production.**
> When anything ships, changes, breaks, or gets deprecated — update this file first,
> commit, then touch code.

**Last updated:** 2026-04-21 · **Owner:** Alex Jego + Claude · **Project:** jegodigital-e02fb

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
| `dailyDigest` | every day 07:00 CDMX | `dailyDigest.js` | Pulls yesterday's Calendly / audit / Brevo-queue / call / Instantly numbers. Builds one-card Telegram Markdown summary. **Anomaly detection vs 7-day rolling average** (added 2026-04-20): flags any metric that drops >50% or spikes >200% vs baseline with 🚨 section at top of digest. Snapshots to `daily_digests/{YYYY-MM-DD}` with `anomalies` array + `baseline_days`. Every metric wrapped in its own try/catch — partial data renders "—". | Telegram |
| `systemHealthAudit` | every 48 hours | `systemHealthAudit.js` | **17-check** watchdog (expanded 2026-04-20): (1-12) hosting · audit endpoint · Cloud Run mockup-renderer · DataForSEO · PageSpeed · Firecrawl · Perplexity · Brevo · Telegram · `daily_digest` freshness · audits flowing · `scheduled_email` failure rate; (13) `coldcall_ran_today` weekday-aware — fails after 14:00 CDMX if no `call_queue_summaries/{today}` with `fired>0`; (14) `phone_leads_inventory` — fails if <100 verified leads available; (15) `elevenlabs_credit` — GET `/v1/user/subscription`, fails at <5% remaining; (16) `instantly_campaigns` — analytics overview, fails if bounce >3% or reply <0.3% (once sent ≥100); (17) `github_actions` — last 10 workflow runs, fails if ≥3 consecutive red. Any red → Telegram alert listing every broken check. All-green → silent except day-1-of-month alive-ping. Snapshot: `system_health/{runId}`. **Never auto-edits code** — surface-only. | Telegram |
| `coldCallPrep` | 09:55 Mon–Fri CDMX | `coldCallAutopilot.js` | Queries `phone_leads` (phone_verified=true, do_not_call=false, last_called_at > 14d ago), ranks oldest-first, writes 50 into `call_queue/{YYYY-MM-DD}/leads/{leadId}` with **uniform-random A/B/C offer assignment** (switched from round-robin 2026-04-20 per Alex — lets `autopilotReviewer` read A/B/C performance without positional bias). Snapshots to `call_queue_summaries/{YYYY-MM-DD}` including `offer_counts`. | Telegram |
| `coldCallRun` | 10:00 Mon–Fri CDMX | `coldCallAutopilot.js` | Fires today's queue via ElevenLabs `/v1/convai/twilio/outbound-call` (Sofia MX, agent per offer). Throttles 12s between dials. Seeds `call_analysis/{conversationId}` to `outcome=pending` at dial time so the 13:00 report can reconcile even if `elevenLabsWebhook` is slow. Updates `phone_leads.last_called_at`. **No approve-gate** — fires directly (per Alex 2026-04-20). | Telegram |
| `coldCallReport` | 13:00 Mon–Fri CDMX | `coldCallAutopilot.js` | Aggregates today's `call_analysis` (positive / negative / neutral / pending). Auto-fires `audit_requests` with `source: cold_call` for every positive that has email + website. Snapshots to `call_queue_summaries/{YYYY-MM-DD}`. | Telegram |
| `autopilotReviewer` | Sunday 20:00 CDMX | `autopilotReviewer.js` | **Weekly self-improvement pass** (added 2026-04-20, LLM-enriched 2026-04-20b). Pulls last 7 days of `daily_digests`, `system_health` snapshots, `call_queue_summaries`, `call_analysis` (per offer A/B/C), `audit_requests` (by source), and real-time `phone_leads` inventory. Computes offer winner, funnel-source winner, watchdog repeat offenders, cron-silence gaps, and lead-inventory risk. Derives up to 3 concrete recommendations + posts them to Telegram. **Optional LLM enrichment layer** when `ANTHROPIC_API_KEY` is set — Claude Haiku analyses the condensed observation JSON and surfaces 2-3 non-obvious patterns the programmatic rules miss. Safe by construction: LLM never sees PII, only aggregate metrics. Snapshot: `autopilot_reviews/{YYYY-WW}` with `llm_bullets` + `llm_enabled` fields. **This is the self-improvement layer** Alex asked for on 2026-04-20. | Telegram |
| `instantlyReplyWatcher` | every 5 minutes | `instantlyReplyWatcher.js` | **Unibox poller + auto-fire audit pipeline** (added 2026-04-20). GETs `/api/v2/emails?email_type=received`, classifies each reply (positive / negative / neutral / question / positive_with_objection) via regex patterns on subject+body, dedups via `instantly_reply_activity/{replyId}`. Clean positives with email + website auto-fire `audit_requests` with `source: instantly_autofire`. Hot leads and objections ping Telegram in real time with reply preview. Daily rollup written to `instantly_reply_summaries/{YYYY-MM-DD}`. Closes the active-feed gap where Unibox positives sat with no downstream action. | Telegram (per hot lead) |
| `callTranscriptReviewer` | Sunday 19:00 CDMX | `callTranscriptReviewer.js` | **Weekly transcript analyser** (added 2026-04-20). Pulls last 7d `call_analysis` docs, scores script adherence across 8 booleans (greeted / offered_audit / offered_setup / mentioned_flamingo / pushed_calendly / leaked_price / collected_email / collected_website), buckets objections from user lines, picks offer winner with min-sample gate (≥10 calls). Writes `call_reviews/{YYYY-WW}` 1 hour BEFORE `autopilotReviewer` so its signal feeds the weekly recommendations. Price-leak rate >5% escalates 🚨 in Telegram — that's a Sofia-goes-off-script alarm. | Telegram |
| `leadFinderAutoTopUp` | 08:00 CDMX daily | `leadFinderAutoTopUp.js` | **Phone-lead inventory auto-replenisher** (added 2026-04-20). Counts current `phone_leads` pool (phone_verified=true, do_not_call=false), triggers replenishment when below `HARD_FLOOR` (100). Targets `TARGET_POOL_SIZE` (150). Uses 7-day `CITY_ROTATION` (Cancún/PdC → Tulum/Cozumel → Mérida/PVR → CDMX/GDL → MTY/QRO → LosCabos/SMA → Puebla/Oaxaca) to avoid re-hitting the same city weekly. Pipeline: DataForSEO Maps → portal-domain blocklist filter (Inmuebles24/Vivanuncios/Lamudi/etc.) → Hunter.io enrichment with decision-maker rank (owner/founder/ceo=3, manager/gerente=2, sales=1). Hard caps: 60 enrichments/day, 350ms throttle. Runs BEFORE `coldCallPrep` (09:55) so the trio never starves. Always writes `lead_topup_summaries/{YYYY-MM-DD}` even when pool is healthy (observable no-op). | Telegram |
| `contentPublisher` | 10:00 CDMX daily | `contentPublisher.js` | **Autonomous Instagram publisher** (added 2026-04-20). Reads `content_queue/{YYYY-MM-DD}` Firestore doc for today's scheduled posts, fires Graph API v22.0 media creation + publish. Supports 4 media types: `single` (image), `carousel` (2-10 same-aspect-ratio images with 8s child-to-parent wait), `reel` (MP4 with `status_code` polling for FINISHED, 15 attempts × 5s), `story` (1080x1920 vertical). 30s spacing between posts to avoid IG rate-limit strikes. Logs every outcome to `content_publishes` with permalink. Writes per-day summary doc at `content_publishes/_summary_{YYYY-MM-DD}`. **No approve gate** per Alex 2026-04-20 — Telegram alerts per-publish, failures tell you which URL/caption to fix. | Telegram (per publish) |
| `sofiaConversationAudit` | 23:00 CDMX daily | `sofiaConversationAudit.js` | **Sofia script-adherence QA** (added 2026-04-20). Nightly sample of up to 20 ManyChat conversations from the last 24h, scores each on 11-pt rubric: greeted (1) + collected_goal (1) + offered_audit (2) + pushed_calendly (2) + mentioned_proof (1) + collected_website (1) + no_pricing_leak (2, hard fail regex `$\s*\d\|mil pesos\|mxn\|...`) + no_tool_name_leak (1, regex `claude\|chatgpt\|manychat\|firebase\|...`). Primary source: `sofia_conversations` Firestore mirror; fallback to ManyChat API (`/subscriber/getByTag` + `/subscriber/getInfo`). Low-score flag at 7/11. Writes `sofia_audits/{YYYY-MM-DD}` with per-conversation breakdown + aggregate score. Telegram alert on any pricing or tool-name leak. | Telegram |
| `dailyRollupSlack` | 18:00 CDMX daily | `dailyRollupSlack.js` | **End-of-day full-business rollup** (added 2026-04-20). 5-source digest: today's cold-call outcomes (by offer A/B/C), last-24h Instantly stats (sent/open/reply/bounce from `/api/v2/campaigns/analytics/overview`), audit pipeline (requests, delivered, quality-gate failures), FB Ads spend + results, ElevenLabs credit + cost-per-call. **Cost-of-day estimator**: fixed amortisation (Instantly $97, Brevo $25, Firebase $25, Firecrawl $83, DataForSEO $20, SerpAPI $50, Hunter $49, Perplexity $20, OpenAI $20, Anthropic variable) + variable (FB today, ElevenLabs $0.15/call × today, Twilio $0.05/call, Brevo transactional). Posts to Slack when `SLACK_WEBHOOK_URL` is set; falls back to Telegram otherwise (so it's never silent). Snapshots to `daily_rollups/{YYYY-MM-DD}`. Complements `dailyDigest` 07:00 — that's yesterday-at-a-glance, this is end-of-day cost+performance. | Slack (fallback Telegram) |
| `coldCallSlackMorning` | 12:30 Mon-Fri CDMX | `coldCallSlackReport.js` | **Post-batch cold-call report to Slack** (LIVE 2026-04-21, commit `7f277049`). Aggregates `call_queue/{today}` + `call_analysis` (by outcome, by offer A/B/C), renders Block Kit with header, 8-field metrics grid, verdict (🟢 3+ positives / 🟡 1-2 / 🔴 zero), per-offer breakdown, top-5 positives with conversation IDs, first 3 failure samples. Posts to `#all-jegodigital` via `SLACK_WEBHOOK_URL`. Fallback: Telegram. | Slack (fallback Telegram) |
| `coldCallSlackAfternoon` | 18:30 Mon-Fri CDMX | `coldCallSlackReport.js` | Same Block Kit report as `coldCallSlackMorning`, fires after the 16:00 afternoon retry batch. | Slack (fallback Telegram) |
| `coldCallLiveMonitor` | every 3 min | `coldCallLiveMonitor.js` | **Window-gated heartbeat watchdog** (LIVE 2026-04-21, commit `7f277049`). Only acts during 10:00-13:00 and 16:00-19:00 CDMX; outside those windows returns immediately. Three alarms (Telegram): (1) *Failure spike* — `failed/(dialed+failed) > 30%` with ≥10 attempts; (2) *Stall* — last `dialed_at` older than 8 min mid-window with queue still non-empty; (3) *Pending backlog* — `call_analysis` pending count > 25 (webhook lag warning, log-only). Anti-spam via `cold_call_monitor_alarms/{30-min-slot}` — same alarm in same slot fires once. Heartbeat snapshot: `cold_call_monitor_heartbeats/{YYYY-MM-DD}`. Per Alex 2026-04-20: no auto-pause — pure telemetry, Alex decides. | Telegram |

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
| `elevenLabsWebhook` | ElevenLabs Conversational AI post-call callback. **WIRED 2026-04-20** — workspace webhook `c76a00db45ff4b948e7dc63db2f777fb` PATCHed onto all 3 agents (Offer A/B/C). Every completed Sofia call now POSTs transcript + analysis → `call_analysis/{conversationId}` with outcome classifier (positive/negative/unconnected/neutral). HMAC validation pending (task #45). |
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
| `seedPhoneLeadsOnce` | **One-shot seeder** (added 2026-04-20) — upserts the hard-coded DIAL_READY 2026-04-19 list (57 phone-verified leads from `_phone_leads_seed_data.js`) into `phone_leads`. Protected by `X-Seed-Secret` header. Safe to re-run (merge upsert by digits-only phone doc ID). Exists as a one-shot bootstrap because `leadFinderAutoTopUp` (08:00) didn't populate `phone_leads` before `coldCallPrep` (09:55) on first-run day — empty pool → 0 dials. Rotate the secret after use. |
| `coldCallSlackOnDemand` | **Manual fire / debug HTTPS endpoint for cold-call Slack reports** (LIVE 2026-04-21, commit `7f277049`). Hit `https://us-central1-jegodigital-e02fb.cloudfunctions.net/coldCallSlackOnDemand` with optional `?date=YYYY-MM-DD&window=morning\|afternoon\|all`. Runs the same aggregate + Block Kit as the scheduled crons and returns `{ok, slack, date, window, totals}` JSON. Use it whenever a scheduled report was missed or Alex wants the current state of today's batch on-demand. |

### 1.4 Callable (client-invoked)

| Function | Purpose |
|---|---|
| `sendLiveEmail` | Real-time email send from the admin dashboard |
| `getCompetitorSpy` | Competitor SEO snapshot for a client |
| `getRankRadar` | Keyword rank tracking |
| `getBacklinkHunter` | Backlink scrape |
| `getSeoMetrics` | On-demand SEO metric pull (DataForSEO-backed). Used by the admin dashboard. |

---

## 2. Planned crons (roadmap — not yet shipped)

Built in small order so every addition lands green. Each one gets its own PR +
update to this table.

**Design rule (per Alex 2026-04-20):** no approve-before-fire gates. Crons fire
directly and learn from logs + Firestore analytics + dailyDigest when something
goes wrong. See `.auto-memory/feedback_no_approve_gates.md`.

| Cron | Interval | Purpose | Notifies |
|---|---|---|---|
| `notebookResearcher` | 02:00 daily | NotebookLM deep-research pass across the Ops Brain notebooks. Writes a 200-word digest + 3 concrete experiments to try. Posts to Telegram. Blocked on NotebookLM MCP auth. | Telegram |
| `billingAlertEscalation` | Pub/Sub `billing-alerts` topic | Subscriber for GCP budget alarms. Uses `telegramHelper.notify` with `critical=true` at ≥90% threshold so a runaway bill escalates to SMS via Twilio. Requires manual billing-alarm setup — see `FIREBASE_BILLING_ALARM_SETUP.md`. | Telegram + SMS fallback |

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
| `instantly_reply_activity` | `instantlyReplyWatcher` | `instantlyReplyWatcher` dedup, dashboard | One doc per Instantly reply `{replyId}`. Classification verdict + body preview + action taken (audit fired / ignored / escalated). Dedup key — prevents firing 3 audits from one reply. |
| `instantly_reply_summaries` | `instantlyReplyWatcher` | dashboard, future `autopilotReviewer` extension | Daily rollup `{YYYY-MM-DD}` — counts per bucket, auto-fired audit count, Telegram-escalated count. |
| `call_reviews` | `callTranscriptReviewer` | `autopilotReviewer`, dashboard | One doc per ISO week `{YYYY-WW}`. Script-adherence averages (greeted %, offered_audit %, pushed_calendly %, leaked_price %), objection bucket counts, offer winner with sample size, connection-rate floor. Feeds Sunday weekly review. |
| `lead_topup_summaries` | `leadFinderAutoTopUp` | dashboard, `autopilotReviewer` | Daily `{YYYY-MM-DD}` — current pool size, replenishment target, city/ies pulled, DataForSEO leads found, Hunter.io enriched, uploaded to `phone_leads`. Always written, even on no-op. |
| `content_queue` | Alex / content team (manual or script-fed) | `contentPublisher` | Schedule shape: `content_queue/{YYYY-MM-DD}` → `{posts: [{type, image_url/s or video_url, caption, hashtags, scheduled_hour}]}`. Reference in CLAUDE.md §Instagram Publishing. |
| `content_publishes` | `contentPublisher` | dashboard, history | Per-post outcome + permalink OR failure reason. `_summary_{YYYY-MM-DD}` doc rolls up the day (ok/failed count + results array). |
| `sofia_conversations` | ManyChat webhook mirror (planned upstream) | `sofiaConversationAudit` (primary source) | Optional Firestore mirror of Sofia turns. When present, `sofiaConversationAudit` uses it directly; when absent, the cron falls back to the ManyChat API (`getByTag` + `getInfo`). |
| `sofia_audits` | `sofiaConversationAudit` | dashboard, Telegram, future `autopilotReviewer` extension | Daily `{YYYY-MM-DD}`. Per-conversation rubric breakdown + aggregate 11-pt score + flagged violations (pricing leak / tool-name leak). |
| `daily_digests` | `dailyDigest` | dashboard, history, `autopilotReviewer` | One doc per CDMX day, `{YYYY-MM-DD}`. Full metric breakdown + rendered digest text + `anomalies` array + `baseline_days` for context. `emails.reasons` now carries hard/soft/spam/unknown Brevo bounce buckets. |
| `system_health` | `systemHealthAudit` | dashboard, Telegram, `autopilotReviewer` | One doc per check-run `{ISO-timestamp}`, full 17-check verdict. GitHub Actions check now includes failed step + job name when ≥3 consecutive red. |
| `autopilot_reviews` | `autopilotReviewer` | dashboard, Telegram | One doc per ISO week `{YYYY-WW}` (e.g. `2026-16`). Observations + recommendations + rendered report text. `llm_bullets` + `llm_enabled` fields when Anthropic enrichment ran. |
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
Daily digest          → Telegram (07:00 CDMX — yesterday-at-a-glance)
Daily rollup          → Slack (18:00 CDMX — end-of-day cost+performance; falls back to Telegram if no webhook)
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

## 8. Self-improvement & observability map (added 2026-04-20)

This is the "**what's actually watched vs. what's not**" overview. Keep it honest —
if we invent a new system, add a row. If something gets checked, tick it. If it
doesn't, mark it and file the gap.

### 8.1 Signals we observe automatically today

| Signal | How it's observed | Where the data lands | How we act on it |
|---|---|---|---|
| **Audit pipeline output** | `audit_requests` doc → `processAuditRequest` → `audits` + Storage URL + Brevo email. Counted in `dailyDigest.audits.bySource`. | Firestore `audits`, `audit_requests`, `daily_digests` | `dailyDigest` morning brief + `autopilotReviewer` weekly source-winner ranking |
| **Audit endpoint liveness** | `systemHealthAudit` POSTs empty body, expects <500 | `system_health` | Telegram alert on red |
| **Cold call outcomes** | ElevenLabs post-call webhook (`c76a00db...`, wired 2026-04-20 to all 3 agents) → `call_analysis.outcome`; `coldCallReport` aggregates positive/negative/neutral/pending | Firestore `call_analysis`, `call_queue_summaries` | `coldCallReport` Telegram + `autopilotReviewer` offer winner |
| **Cold call cron execution** | `systemHealthAudit.checkColdCallRanToday` (weekday-aware, enforced after 14:00 CDMX) | `system_health` | Telegram alert if fired=0 on a weekday |
| **Phone-lead inventory** | `systemHealthAudit.checkPhoneLeadsInventory` (threshold <100) + `autopilotReviewer` (threshold <150) | `system_health`, `autopilot_reviews` | Telegram alert + weekly "top up leads" recommendation |
| **ElevenLabs credit** | `systemHealthAudit.checkElevenLabsSubscription` — GET `/v1/user/subscription`, alert at <5% remaining | `system_health` | Telegram alert + human must upgrade plan |
| **Instantly campaign-level health** | `systemHealthAudit.checkInstantlyCampaigns` — GET `/campaigns/analytics/overview`. Hard limits: bounce ≤3%, reply ≥0.3% once sent ≥100. Plus `dailyDigest` pulls the same numbers and anomaly-checks vs 7d baseline. | `system_health`, `daily_digests` | Telegram alert + morning-brief anomaly flag |
| **Instantly daily deltas** | `dailyDigest` pulls `sent / opens / replies / bounces` from overview endpoint | `daily_digests` | Morning brief + 7-day anomaly detection (>50% drop / >200% spike) |
| **GitHub Actions runs** | `systemHealthAudit.checkGithubActions` — last 10 `/actions/runs`, fails at ≥3 consecutive red | `system_health` | Telegram alert if deploys are failing repeatedly (requires `GITHUB_TOKEN` env) |
| **Firebase/Cloud Run hosting** | `systemHealthAudit` — GET hosting + POST mockup-renderer | `system_health` | Telegram alert on non-200 |
| **External API keys alive** | `systemHealthAudit` — DataForSEO / PSI / Firecrawl / Perplexity / Brevo / Telegram health probes | `system_health` | Telegram alert on key revoked |
| **Calendly bookings / no-shows** | `calendlyWebhook` → `calendly_events`; counted by `dailyDigest` | `daily_digests` | Morning brief + anomaly detection |
| **Brevo email queue** | `processScheduledEmails` writes `sent_at` / `failed_at`; `dailyDigest` counts each | `daily_digests` | Morning brief + `scheduled_email_failures` watchdog check |
| **Daily metrics vs 7d baseline** | `dailyDigest` — rolling average across 7 most recent `daily_digests`, flags >50% drops / >200% spikes | `daily_digests.anomalies` | 🚨 section at top of morning brief |
| **Weekly trend + recommendations** | `autopilotReviewer` — Sunday 20:00, 7-day programmatic analysis, 3 concrete action items + optional LLM pattern-watch pass | `autopilot_reviews/{YYYY-WW}` | Sunday Telegram report |
| **Instantly Unibox per-reply analysis** | `instantlyReplyWatcher` — every 5 min, polls Unibox replies, auto-fires `audit_requests` for positives, classifies sentiment + on-script adherence | `instantly_reply_activity`, `instantly_reply_summaries` | Telegram ping on hot reply + daily summary into `dailyDigest` |
| **ElevenLabs per-call transcript analysis** | `callTranscriptReviewer` — weekly pass over `call_analysis` transcripts, detects missed objections + Sofia script deviations, surfaces patterns | `call_reviews/{YYYY-WW}` | Feeds into `autopilotReviewer` Sunday recommendations |
| **Brevo bounce-reason classification** | `dailyDigest` extended — every failed `scheduled_email` classified into hard / soft / spam / unknown via regex on error text, one sample per bucket | `daily_digests.emails.reasons` | Morning brief `💀 X · 🔁 Y · 🛑 Z · ❓ W` line + sample of spam/hard error |
| **ManyChat Sofia conversation quality** | `sofiaConversationAudit` — nightly 22:00 CDMX sample of recent WA+IG threads, LLM-grades each, flags pricing leaks / off-script / over-promise | `sofia_conversations`, `sofia_audits` | Telegram alert on violations; weekly roll-up in `autopilotReviewer` |
| **Phone-lead auto-top-up** | `leadFinderAutoTopUp` — when `phone_leads` count <150, auto-runs lead-finder-v4 phone pass up to 60 Hunter.io calls/day, respects monthly cap | `lead_topup_summaries` | Keeps phone inventory ≥ safety threshold without human intervention |
| **IG content publisher** | `contentPublisher` — daily pass over `content_queue`, publishes scheduled IG posts via Graph API, 30s spacing | `content_publishes` | Posted permalinks back into `content_queue`, daily count into `dailyDigest` |

### 8.2 What we do NOT yet observe (honest gap list)

These are known blind spots. Do not pretend they're covered. Build or flag.

| Gap | Why it matters | Status / owner |
|---|---|---|
| **GitHub Actions deploy-trap analysis** | We count consecutive failures. We do NOT parse the failing log to say *why* it failed. Partially mitigated 2026-04-20 by `systemHealthAudit` now fetching failed-step detail, but no auto-PR fix yet. | Future enhancement — fetch `/actions/runs/{id}/logs`, grep for known deploy traps (Scheduler 404, sed trailing comma, etc.), auto-PR the fix. |
| **Cron execution confirmation beyond cold-call** | Only cold-call has an "did it actually run today" check. `dailyDigest` / `systemHealthAudit` / `processScheduledEmails` / `sendT10minReminders` silent failures would only be caught by their own downstream effects. | Future — extend watchdog with generic `checkCronRan(name, collection, freshnessHours)` per cron. |
| **Billing runaway detection** | No programmatic ceiling on cron cost — a retry-loop could burn $500 before morning digest surfaces it. Doc written, human setup still pending. | `FIREBASE_BILLING_ALARM_SETUP.md` — Alex owns the ~10-min GCP console setup. Stub `billingAlertEscalation` function scoped in §2 for Pub/Sub → Telegram+SMS fallback once budget is wired. |
| **NotebookLM Ops Brain** | No single unified knowledge surface for the watchdog to "read the house" — all knowledge is split across SYSTEM.md, memories, and collections. | Task #16 (`notebookResearcher`) — blocked on NotebookLM API access. |

### 8.3 Self-improvement loop

1. **Every day 07:00** — `dailyDigest` reports yesterday with anomaly flags vs 7d baseline. Human sees trouble fast.
2. **Every 48h** — `systemHealthAudit` runs 17 checks across hosting, APIs, crons, inventory, credit, deploys. Telegram fires on any red.
3. **Every Sunday 20:00** — `autopilotReviewer` does a full 7-day programmatic analysis and posts 3 concrete recommendations (offer rotation shifts, funnel winners, watchdog repeat offenders, inventory risks).
4. **Human acts on recommendations via PR.** The watchdog never auto-edits code. That's a design choice — see §7 rule #1 ("Never auto-edit live code from a watchdog").

---

## 9. Open questions / known gaps

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

## 10. Change log

| Date | Change |
|---|---|
| 2026-04-20 | Initial SYSTEM.md created. Inventory captured post-deploy-trap cleanup. Roadmap for 6 new crons scoped (daily digest, cold-call trio, Instantly watcher, health audit, notebook researcher). |
| 2026-04-20 | **`dailyDigest` shipped** (commit `1df1d33`) — 07:00 CDMX Telegram brief + `daily_digests/{YYYY-MM-DD}` snapshot. |
| 2026-04-20 | **`systemHealthAudit` shipped** (commit `971575a`) — every-48h 12-check watchdog + `system_health/{runId}` snapshot. |
| 2026-04-20 | **Policy change:** dropped approve-before-fire gate from cron design rules (Alex feedback). Saved as `.auto-memory/feedback_no_approve_gates.md`. Updated §2 planned-cron schema + §7 guard-rails to match. |
| 2026-04-20 | **Cold-call autopilot trio shipped** (commit `66ad86b`) — `coldCallPrep` 09:55, `coldCallRun` 10:00, `coldCallReport` 13:00 Mon–Fri CDMX. 50 dials/day with A/B/C offer rotation, positives auto-fire `audit_requests`. New collections: `phone_leads`, `call_queue`, `call_queue_summaries`. |
| 2026-04-20 | **Self-improvement layer shipped.** (1) `autopilotReviewer` Sunday 20:00 CDMX weekly pass writing `autopilot_reviews/{YYYY-WW}` + 3 Telegram recommendations. (2) `systemHealthAudit` expanded 12→17 checks: `coldcall_ran_today` (weekday-aware), `phone_leads_inventory` (<100 fail), `elevenlabs_credit` (<5% remaining fail), `instantly_campaigns` (bounce >3% OR reply <0.3% fail), `github_actions` (≥3 consecutive red fail). (3) `dailyDigest` gains 7-day rolling-average anomaly detection — flags >50% drops / >200% spikes with 🚨 section at top of morning brief. (4) New §8 "Self-improvement & observability map" documents every signal observed + every known gap. Triggered by Alex's question: "why do I have to verify in the morning, if this is supposed to be autopilot?". |
| 2026-04-20 | **ElevenLabs post-call webhook WIRED.** Pre-mortem discovery: all 3 Sofia agents (Offer A/B/C) had `post_call_webhook_id: None`, workspace webhook list was empty — meaning ElevenLabs was NEVER POSTing call transcripts to `elevenLabsWebhook`. Every outbound call completed successfully but `call_analysis` stayed empty, defeating the purpose of `coldCallReport`, `callTranscriptReviewer`, and the outcome classifier shipped earlier today. **Fix:** POSTed `/v1/workspace/webhooks` creating HMAC-backed webhook `c76a00db45ff4b948e7dc63db2f777fb` pointing to `https://us-central1-jegodigital-e02fb.cloudfunctions.net/elevenLabsWebhook`, then PATCHed each agent's `platform_settings.workspace_overrides.webhooks.post_call_webhook_id`. Verified via re-fetch of each agent config. HMAC secret saved to `.auto-memory/elevenlabs_webhook.md` — task #45 adds validation to the Cloud Function. Stale note in `.auto-memory/elevenlabs_api.md` corrected: old agent IDs survived the account migration, they were not DEAD. |
| 2026-04-20 | **Tomorrow-10am-unblock batch.** (1) `seedPhoneLeadsOnce` HTTPS one-shot — shipped the hard-coded 57-lead DIAL_READY list as `_phone_leads_seed_data.js` + `seedPhoneLeadsOnce.js` Cloud Function protected by `X-Seed-Secret` header. Necessary because `leadFinderAutoTopUp` was added this morning and first-run didn't populate the pool before `coldCallPrep` (09:55), causing `coldCallRun` (10:00) to dial 0 leads. (2) `coldCallPrep` A/B/C rotation **round-robin → uniform-random** per Alex — clean A/B/C comparison for `autopilotReviewer` without positional bias. (3) `dailyRollupSlack` 18:00 CDMX cron — end-of-day 5-source digest (cold calls, Instantly, audits, FB Ads, ElevenLabs) + cost-of-day estimator. Posts to Slack when `SLACK_WEBHOOK_URL` secret is set, falls back to Telegram. Complements `dailyDigest` 07:00 (different angle: yesterday vs end-of-today + cost lens). New collection: `daily_rollups/{YYYY-MM-DD}`. |
| 2026-04-20 | **Observability gap-close batch: 5 new crons + 2 extensions + 1 safety doc.** (1) `instantlyReplyWatcher` every 5 min — Unibox poller, auto-fires `audit_requests` on positives, classifies sentiment + on-script adherence, writes `instantly_reply_activity` + daily `instantly_reply_summaries`. (2) `callTranscriptReviewer` weekly — parses `call_analysis` transcripts for missed objections + Sofia script deviations, outputs `call_reviews/{YYYY-WW}` consumed by `autopilotReviewer`. (3) `leadFinderAutoTopUp` — auto-replenishes `phone_leads` below 150, Hunter.io 60-calls/day cap respected, logs `lead_topup_summaries`. (4) `contentPublisher` daily — drains `content_queue` through IG Graph API with 30s spacing, permalinks written back + counted in `daily_digests`. (5) `sofiaConversationAudit` nightly 22:00 — samples recent WA+IG threads, LLM-grades each, alerts on pricing leaks / off-script / over-promise, writes `sofia_audits`. (6) `dailyDigest` extended — Brevo bounce-reason classifier (hard/soft/spam/unknown regex buckets + one sample per bucket in morning brief + anomaly detection on `emails.reasons.hard` and `.spam`). (7) `autopilotReviewer` extended — optional `enrichWithLLM()` Haiku pass (~$0.01/week) appends 2-3 non-obvious pattern bullets to Sunday report; privacy-by-construction (aggregate numbers only, never PII); gracefully no-ops without `ANTHROPIC_API_KEY`. (8) `telegramHelper.js` shared module — central Telegram send + Twilio SMS fallback on `critical:true` for any watchdog that needs escalation. (9) New `FIREBASE_BILLING_ALARM_SETUP.md` — 4-alarm GCP budget plan ($200 hard cap / $40 Functions / $20 Firestore / $15 Cloud Run) + Pub/Sub → `billingAlertEscalation` → Telegram+SMS stub so a runaway cron surfaces before the credit card does. Closes 5 of the 7 §8.2 gaps from this morning. |

---

**Rule zero:** if you touch a cron, function, collection, or external service and
this file doesn't change in the same commit, you didn't actually ship. Update
first, then code.
