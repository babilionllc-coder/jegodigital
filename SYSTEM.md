# JegoDigital — Live System Inventory

**Single source of truth for every automation, cron, function, trigger, and external
dependency that keeps the business running without Alex touching a laptop.**

> **How this doc works:** `CLAUDE.md` defines *behaviour rules* (tone, pricing, stack).
> `NOTEBOOKLM_LEVERAGE_PLAN_2026-04-19.md` defines the *strategic direction* (where
> we're going). **This file defines what actually exists, right now, in production.**
> When anything ships, changes, breaks, or gets deprecated — update this file first,
> commit, then touch code.

**Last updated:** 2026-04-22 PM · **Owner:** Alex Jego + Claude · **Project:** jegodigital-e02fb

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
| `coldCallMidBatchCheck` | 10:15 Mon–Fri CDMX | `coldCallAutopilot.js` | **Read-only mid-batch failure alert** (LIVE). 15 min into the morning batch, counts `failed` / `dialed` / `queued` in `call_queue/{today}/leads`. If `failed > MID_BATCH_FAIL_THRESHOLD`, pings Telegram with first 3 failure samples so Alex can abort the run before it burns through ElevenLabs credit. Does NOT auto-pause — pure telemetry. | Telegram |
| `coldCallRunAfternoon` | 16:00 Mon–Fri CDMX | `coldCallAutopilot.js` | **DISABLED 2026-04-21 — no-op stub.** Per Alex: morning-only cadence until we hit 3 YES/day. Export + scheduler retained to avoid Cloud Scheduler 404 deploy trap (see `.auto-memory/firebase_deploy_traps.md`). Re-enable by setting `AFTERNOON_BATCH_SIZE > 0` + restoring the body from `_coldCallRunAfternoonOriginal_disabled` in `coldCallAutopilot.js:658`. | — |
| `eveningOpsReport` | 21:00 CDMX daily | `eveningOpsReport.js` | **Nightly 24h ops digest** (LIVE 2026-04-21 PM, commit `72ed715`). 5-source pull covering cold email (Instantly /analytics/daily + /overview), Calendly (last 24h scheduled_events + no-shows), ManyChat (Sofia subscribers + audit-flow starts), cold calls (`call_analysis` + offer A/B/C breakdown), audits (`audit_requests` delivered/failed + quality-gate strikes). Renders PDF via WeasyPrint, posts Slack Block Kit summary to `#all-jegodigital`, uploads PDF to Telegram chat. Uses `aiAnalysisAgent` helper for autonomous interventions: auto-pauses any campaign with bounce>5%, zero-open 200+ with `open_tracking_enabled`, throttles accounts health<90%; escalates (Telegram 🚨) zero-reply-at-500+ + no-show spikes. Every action logged to `ai_agent_actions/{YYYY-MM-DD}` (Firestore). Complements `dailyDigest` 07:00 + `dailyRollupSlack` 18:00 — this is the bedtime "what moved + what I fixed" wrap. | Slack + Telegram |
| `redditScraper` | `15 * * * *` CDMX (hourly) | `redditScraper.js` | **Money Machine Phase 1 — Reddit opportunity ingestion** (LIVE 2026-04-22). Pulls fresh posts from 10 target subreddits (smallbusiness, Entrepreneur, startups, SaaS, marketing, SEO, realtors, webdev, sweatystartup, forhire) via Apify Reddit Actor `practicaltools~apify-reddit-api` ($2/1K results). Matches against 30+ pain-point keywords weighted 1-3 and mapped to our 9 services. Author gate: ≥30d account age OR ≥10 karma (bot filter). Dedupes on post-id in `/opportunities/reddit_<postId>`. Writes with `status=pending_classification` which fires `opportunityClassifier`. Logs run summary to `money_machine_runs/{autoId}`. Cap: 200 items/run (~$0.40/run, ~$10/mo). Notifies Telegram when `new_written > 0`. | Telegram |
| `scheduledTelegramRecovery` | every 30 min CDMX | `telegramApprovalBot.js` | **Money Machine Phase 4.5 — missed-draft safety net** (LIVE 2026-04-23, commit `2c478ab`). Queries `opportunity_drafts` where `ready_for_approval=true` AND `status IN ('awaiting_approval','awaiting_approval_telegram')`. For each: (A) if `telegram_message_id` is null → full re-push via `sendApprovalMessage()` + Slack mirror + sets `recovery_reason="no_msg_id"`. (B) if pushed and untouched >2h AND last nudge >2h ago AND `telegram_nudges_sent < 3` → sends a threaded `⏰ Reminder — draft still awaiting your approval` replying to the original approval card (`reply_to_message_id`), increments `telegram_nudges_sent`, stamps `last_nudge_at`. Max 3 nudges per draft — then stops (no spam). Fixes the "Alex buried the Telegram card and the pipeline stalled silently" failure mode reported 2026-04-23. Manual trigger: HTTPS `scheduledTelegramRecoveryNow`. | Telegram |
| `dailyStrategist` | 08:00 CDMX daily | `dailyStrategist.js` | **AI chief-of-staff recommendation agent** (LIVE 2026-04-21 PM, commit `72ed715`). Reads last 24h across all 8 platforms (ElevenLabs, Instantly, Brevo, Calendly, Firestore, Meta Graph, GSC, GA4) via the HARD RULE #2 verify-live routes. Feeds aggregated signal JSON to Gemini-2.0-Flash with a strategist prompt tuned on CLAUDE.md's Bucket A/B/C/D/E priority system. Outputs the day's ONE big rock (HARD RULE #8) + 3 supporting tasks in plain Spanish/English (HARD RULE #12) + a 1-line "why this matters today" for each. Writes to `strategist_recommendations/{YYYY-MM-DD}` (Firestore). Posts Slack summary + Telegram digest. Claude reads this at session start to align the priority queue with the strategist's pick before touching `NEXT_STEP.md`. | Slack + Telegram |
| `processBrevoNurtureQueue` | every 30 min | `brevoNurture.js` | **Brevo Spanish nurture sender** (LIVE 2026-04-22 PM, commit `c4e875c`). Scans `brevo_nurture_queue` for touches whose `sendAt <= now`, fires Brevo transactional API with the Spanish Track A template matching that touch's day (0/3/7/14). Single-field Firestore query + in-code `sent!=true && canceled!=true` filter — composite-index-free by design (see DISASTER_LOG 2026-04-22 PM entry). Skips if the contact's `brevo_nurture_index.{email}.calendlyBooked === true`. Returns `{ok, processed, sent, skipped, failed}`. Closed-loop pair with `cancelTrackForEmail` on Calendly-booking. | Telegram (failures) |
| `auditNotificationWatchdog` | every 15 min CDMX | `auditNotificationWatchdog.js` | **Silent-failure watchdog for audit notifications** (LIVE 2026-04-22 PM, commits `0d1413cf` + `d9c6538b` + `79d42086`). Scans last 24h of `audit_requests`, checks the per-channel `notifications` map written by the patched `submitAuditRequest` (keys: `brevo`, `telegram`, `slack`, `alex_email`; each `{ok, skipped?, error?, at}`). Flags (A) `notifications` field missing (handler crashed before flush) or (B) any configured channel with `ok=false && !skipped`. 5-min grace period prevents false-flagging in-flight docs. `LEGACY_CUTOFF_MS = 2026-04-22 23:30 UTC` skips pre-Option-B docs so the cron doesn't spam on historical misses. Posts Slack Block Kit alert listing up to 10 broken leads (name, email, website, audit-id, age, failed channels) + scan-stats footer. Purpose: prevent recurrence of the Priscila / Casa Mérida silent-failure pattern (pre-2026-04-22: all 4 channels failed silently inside `submitAuditRequest`, leads discovered days later). On-demand probe: `auditNotificationWatchdogOnDemand` (HTTPS). | Slack |

### 1.2 Firestore-triggered (onCreate)

| Function | Collection | File | Purpose |
|---|---|---|---|
| `onLeadCreated` | `leads/{leadId}` | `index.js` | Kicks off new-lead side-effects (Brevo sync, Telegram ping, etc.) |
| `processAuditRequest` | `audit_requests/{docId}` | `auditPipeline.js` | **Live audit pipeline.** Runs PSI + DataForSEO + Firecrawl **dual-fetch** (shell + rendered) + Perplexity, builds HTML report, uploads to Storage, queues Brevo email with `scheduledAt = now + 45min`. No separate scheduled function — Brevo handles the delayed send natively. |
| `opportunityClassifier` | `opportunities/{oppId}` onCreate | `opportunityClassifier.js` | **Money Machine Phase 2 — buyer-intent scorer** (LIVE 2026-04-22). Fires on every new opportunity doc. Gemini 3.1 Flash Lite scores 0-100 across 5 dims (pain_intensity, budget_signal, specificity, service_match, reply_worthiness — 20 each). Output JSON includes `primary_service` routing, `red_flags`, `recommended_action`. Score ≥70 → `status=qualified` (fires drafter). <70 → `filtered_out`. Cost ≈ $0.0001/classification. Deterministic keyword-weight fallback when Gemini unavailable — pipeline never blocks. Manual re-classify: GET `/opportunityClassifierNow?limit=50`. |
| `opportunityDrafter` | `opportunities/{oppId}` onUpdate (→qualified) | `opportunityDrafter.js` | **Money Machine Phase 3 — value-first reply writer** (LIVE 2026-04-22). Fires when classifier transitions status to `qualified`. Claude Haiku 4.5 primary (if `ANTHROPIC_API_KEY` set), Gemini 2.5 Pro fallback. 10 hard drafting rules: no links in first comment, no pricing, no "DM me" unless asked, no AI-giveaway phrases, match OP tone, 3 concrete tips, 80-180 words, one soft CTA. Runs banned-phrases check (13-item list) + word-count gate (60-220). Writes to `/opportunity_drafts/{oppId}` with `ready_for_approval` flag. Manual re-draft: GET `/opportunityDrafterNow?limit=10`. |
| `pushDraftToTelegram` | `opportunity_drafts/{draftId}` onCreate | `telegramApprovalBot.js` | **Money Machine Phase 4 — Telegram push** (LIVE 2026-04-22). Fires on every new ready-for-approval draft. Sends to Alex's Telegram with inline keyboard: **[✅ Approve + Post] [✏️ Edit] [⏭️ Skip 24h] [❌ Kill]**. Callback_data uses a 22-char short id stored in `/tg_button_map/{shortId}` (Telegram 64-char limit). Updates `telegram_message_id` + `status=awaiting_approval_telegram`. Markdown→plain fallback on encoding errors. Tap handling → `telegramApprovalCallback` (HTTPS). |

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
| `twilioCallStatusCallback` | **Twilio StatusCallback → ElevenLabs zombie-call killer** (LIVE 2026-04-21, `twilioCallStatusCallback.js`). Wired on Twilio `+52 998 387 1618` (`IncomingPhoneNumbers.statusCallback`). Does TWO things on every Twilio call-status event: (1) PROXIES the original POST body to `https://api.elevenlabs.io/twilio/status-callback` so ElevenLabs's internal session/transcript/billing bookkeeping keeps working; (2) on terminal status (`completed`/`failed`/`no-answer`/`busy`/`canceled`), looks up the linked ElevenLabs `conversation_id` via `call_analysis.where(callSid)` and force-closes it via `DELETE /v1/convai/conversations/{id}`. Solves the zombie-SIP bug (Twilio drops in 0-1s but ElevenLabs holds the Sofia session until `max_duration_seconds=90`). See §10.4. |
| `coldEmailReportOnDemand` | **Cold-email proxy for HARD RULE #2 verify-live.** Queries Instantly `/api/v2/campaigns/analytics/daily` + `/analytics/overview` with the workspace key and returns today's sent/open/reply/bounce by campaign as JSON. Used when the sandbox egress proxy blocks `api.instantly.ai` directly — falling back here still counts as "live data pulled this session" because the function has the key injected at deploy time and calls the real Instantly API. Optional `?date=YYYY-MM-DD&notify=0\|1`. |
| `eveningOpsReportOnDemand` | **Manual HTTPS trigger for the 21:00 nightly ops digest** (LIVE 2026-04-21 PM, commit `72ed715`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/eveningOpsReportOnDemand`. Optional `?date=YYYY-MM-DD&notify=0\|1`. Runs the same 5-source pull (cold email / Calendly / ManyChat / cold calls / audits) + `aiAnalysisAgent` autonomous interventions as the scheduled `eveningOpsReport`. Returns the JSON totals payload and (if `notify=1`) posts the Slack Block Kit + Telegram PDF. Use when the 21:00 run was missed, Alex wants a mid-day state-of-the-day wrap, or for debugging the pipeline without waiting for the nightly cron. |
| `telegramApprovalCallback` | **Money Machine — Telegram button webhook** (LIVE 2026-04-22). Receives `callback_query` + reply messages from Telegram. Routes `approve_*`/`edit_*`/`skip_*`/`kill_*` to handlers. On approve: resolves short id → full draftId → calls Reddit OAuth password-grant → POSTs comment via `oauth.reddit.com/api/comment` with `thing_id=t3_<postId>` → logs to `/opportunity_outcomes/{draftId}` with live permalink. If Reddit creds missing → marks `approved_needs_manual_post` and edits the Telegram message with paste-ready copy. Edit: sets `status=awaiting_alex_edit` and listens for the next reply on that message (matched via `/tg_edit_sessions/{messageId}`). Replies with `answerCallbackQuery` so the spinner stops. Errors return HTTP 200 to prevent Telegram retry storm. |
| `setTelegramWebhook` | **Money Machine one-time setup** (LIVE 2026-04-22). Hit once post-deploy to register the webhook URL at Telegram: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/setTelegramWebhook`. POSTs to `api.telegram.org/bot<token>/setWebhook` pointing at `telegramApprovalCallback` with `allowed_updates=["callback_query","message"]`. Returns current `getWebhookInfo` for verification. **Warning:** this sets the bot's global webhook — all other incoming messages to the bot also route here (the bot is currently used only for outbound notifications, so this is safe as of 2026-04-22). |
| `pushPendingDraftsToTelegram` | **Money Machine manual re-push** (LIVE 2026-04-22). Hit to re-send any drafts stuck in `ready_for_approval=true` + `status IN ('awaiting_approval','awaiting_approval_telegram')`. Use when `pushDraftToTelegram` missed a push (e.g., deploy cold start dropped the trigger). Optional `?limit=10`. Returns `{ok, pushed, details}` JSON. |
| `scheduledTelegramRecoveryNow` | **Money Machine missed-draft recovery — on-demand** (LIVE 2026-04-23, commit `2c478ab`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/scheduledTelegramRecoveryNow`. Same body as the `scheduledTelegramRecovery` 30-min cron. For each stuck draft: if `telegram_message_id` is missing → full re-push via `sendApprovalMessage` + Slack mirror, else if `pushed_to_telegram_at > 2h ago` AND `last_nudge_at > 2h ago` AND `telegram_nudges_sent < 3` → threaded `⏰ Reminder` via `reply_to_message_id`. Returns `{ok, total_stuck, full_repushed, nudged, skipped_capped, skipped_recent}`. Fixes the failure mode where Alex buries the original draft card in his Telegram inbox and the pipeline stalls silently. |
| `redditScraperNow` | **Money Machine manual Reddit pull** (LIVE 2026-04-22). Triggers `scrapeAndIngest()` on demand — same path as the `15 * * * *` cron. Returns `{ok, summary: {total_pulled, keyword_matches, author_gate_rejects, duplicates, new_written, by_service, duration_sec}}`. Useful for smoke-test after first deploy. |
| `opportunityClassifierNow` | **Money Machine manual re-classify** (LIVE 2026-04-22). Re-runs Gemini scoring on up to 50 `status=pending_classification` opportunities. Use after prompt tweaks. Returns `{ok, classified, results}`. |
| `opportunityDrafterNow` | **Money Machine manual re-draft** (LIVE 2026-04-22). Re-runs draft generation on up to 10 `status=qualified` opportunities. Returns `{ok, drafted, results}`. |
| `dailyStrategistNow` | **Manual HTTPS trigger for the 08:00 strategist** (LIVE 2026-04-21 PM, commit `72ed715`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/dailyStrategistNow`. Reads last 24h across all 8 HARD-RULE-#2 platforms, runs the Gemini-2.0-Flash chief-of-staff prompt, and returns the recommendation JSON (today's big rock + 3 supporting tasks + plain-language "why this matters today" per HARD RULE #12). Writes to `strategist_recommendations/{YYYY-MM-DD}`. Use when the 08:00 scheduled run was missed, Alex wants a mid-day strategic reset, or Claude needs to realign `NEXT_STEP.md` mid-session. |
| `processBrevoNurtureQueueOnDemand` | **Manual HTTPS trigger for the Brevo nurture sender** (LIVE 2026-04-22 PM, commit `c4e875c`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/processBrevoNurtureQueueOnDemand`. Optional `?limit=100`. Same path as the scheduled `processBrevoNurtureQueue` — pulls all `brevo_nurture_queue` docs with `sendAt <= now`, in-code filters for `sent!=true && canceled!=true`, fires Brevo transactional. Returns `{ok, processed, sent, skipped, failed}` JSON. Live-verified 2026-04-22 23:00 UTC → HTTP 200 with empty queue (all backfill touches sent day-0, remaining queued for future `sendAt`). Use when a scheduled run is missed or to manually flush the queue after a bulk backfill. |
| `auditNotificationWatchdogOnDemand` | **On-demand audit-notification watchdog probe** (LIVE 2026-04-22 PM, commits `0d1413cf` + `d9c6538b`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/auditNotificationWatchdogOnDemand`. Same scan logic as the `auditNotificationWatchdog` 15-min cron — reads last 24h `audit_requests`, evaluates each doc's `notifications` map, and returns `{ok, scanned, healthy, broken_count, broken[], slack, window_hours:24, grace_minutes:5}` with up to 25 broken entries inline. Hit anytime to confirm the pipeline is healthy or to debug after a rough deploy. Live-verified 2026-04-22 23:35 UTC → `{scanned:9, healthy:9, broken:0}` with post-cutoff smoke doc passing. |
| `trojanVideoInit` | **Trojan Video Factory — onboarding init endpoint** (LIVE 2026-04-23 PM, `website/functions/trojanVideoOnboarding.js`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/trojanVideoInit`. Called from `/trojan-setup/videos` after form submit. Validates the lead (email + firstName + style ∈ {cinematic,lifestyle,luxury} + lang ∈ {es,en,none} + photo count 3-10), writes `trojan_video_leads/{leadId}` with `status=awaiting_upload`, mints N signed PUT URLs via `admin.storage().bucket().file(path).getSignedUrl({version:'v4', action:'write', expires: now + 30min})`, returns `{leadId, uploads:[{order, key, uploadUrl, expiresAt}], expiresAt}`. Photo path: `trojan-videos/{companySlug}-{leadId}/photo-N.{ext}`. Browser PUTs each file directly to its signed URL — bypasses the 10 MB Cloud Function body limit. Configured in `functions/.env` via `GCLOUD_STORAGE_BUCKET` (defaults to `${GCLOUD_PROJECT}.appspot.com`). Preflight OPTIONS handled for CORS. |
| `trojanVideoFinalize` | **Trojan Video Factory — upload finalize endpoint** (LIVE 2026-04-23 PM, `website/functions/trojanVideoOnboarding.js`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/trojanVideoFinalize`. Called from `/trojan-setup/videos` after all signed-URL PUTs complete. Reads `trojan_video_leads/{leadId}`, verifies each expected key exists via `bucket.getFiles({prefix})` with a 100-ms retry loop (GCS eventual consistency), flips `status=submitted`, stamps `submitted_at` + `delivery_due_at = submitted_at + 24h`. Fire-and-forget side effects: Telegram ping to Alex with lead summary + photo count, Brevo list upsert (contacts list for video leads), status log entry. Returns `{ok, status:'submitted', delivery_due_at}`. On any missing photo → `{ok:false, missing_keys:[...]}` so the browser can retry the failed PUTs. Preflight OPTIONS handled for CORS. |
| `saveColdCallLead` | **Cold-call → Brevo nurture capture** (LIVE 2026-04-22 evening, `website/functions/saveColdCallLead.js`). URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/saveColdCallLead`. Called from ElevenLabs Offer A (SEO Pitch, `agent_6601kp758ca4fcx8aynsvc0qyy5k`) and Offer C (Free Setup / Trojan Horse, `agent_2801kpcxmxyvf36bb2c970bhvfk4`) via the `save_lead_to_brevo_*` workspace tools. Request body: `{firstName, email, offer: "A"\|"C", phone?, company?, website?, source?, conversation_id?}`. Upserts the contact into Brevo list **35** (Offer A) or **36** (Offer C), then queues 5 touches into `scheduled_emails` at delayDays **0/1/3/5/7** for A (templates 53-57) or **0/1/3/5/10** for C (templates 58-62). Offer B is intentionally NOT routed here — Offer B = `submitAuditRequest` which has its own audit-delivery pipeline. All 10 Spanish templates live on Brevo with unsubscribe footer, WhatsApp `wa.me/529987875321`, Calendly `/30min` with `utm_campaign=coldcall_a\|coldcall_c` for attribution. Delivery cadence is owned by `processScheduledEmails` (hourly cron, §1.2). |

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
| `weeklyRevenueReview` | Monday 08:00 CDMX | **HARD RULE #7 automation.** Pulls last 7d of real revenue (Stripe invoices + manual client payments logged in `revenue_events`), counts active paying clients, MRR delta, churn, new closes. Flags if MRR = $0 for 4th consecutive week (escalation trigger). Posts to Telegram + snapshots to `revenue_reviews/{YYYY-WW}`. Forces weekly truth-telling about paying clients vs vanity metrics (opens/dials/audits). Planned build lives at `website/functions/weeklyRevenueReview.js`. | Telegram |
| `verifyClientProofMonthly` | 1st of month 09:00 CDMX | **HARD RULE #9 automation.** Re-verifies every claim in `website/showcase.html` + all case-study copy against live data. Per client: re-runs Ahrefs/DataForSEO rank tracker against the quoted keywords (Flamingo "#1 Google Maps"), re-measures PageSpeed against "98+ PageSpeed" claims, confirms traffic-delta claims via GSC/GA4 if access present. Any stale claim (rank dropped, PSI below threshold) fires Telegram alert + opens a todo in `client_proof_issues`. Prevents us from quoting 4.4x / #1 / +300% in cold email when the underlying reality has drifted. Planned build lives at `website/functions/verifyClientProofMonthly.js`. | Telegram |

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
| `opportunities` | `redditScraper` (future: twitterScraper, forumScraper) | `opportunityClassifier`, `opportunityDrafter`, dashboard | **Money Machine master table** (LIVE 2026-04-22). One doc per scraped public post. Doc id shape: `reddit_<sanitizedPostId>` (sanitisation: `[^a-zA-Z0-9_-]` → `_`, last 64 chars kept). Status pipeline: `pending_classification` → `qualified`/`filtered_out` → `drafted`/`drafted_unsafe`/`drafter_failed` → `posted`. Fields: platform, postId, subreddit, permalink, title, body (4KB cap), author, authorKarma, upvotes, numComments, keywordHits[], keywordScore, primaryService, score (0-100, post-classifier), classifier_reasoning, classifier_red_flags, recommended_action. |
| `opportunity_drafts` | `opportunityDrafter` | `pushDraftToTelegram`, `telegramApprovalCallback`, dashboard | **Money Machine draft store** (LIVE 2026-04-22). One doc per qualified opportunity. Keyed by the opportunity doc-id (1:1). Fields: opportunityId, permalink, subreddit, title, score, primary_service, draft_text, soft_cta_variant (none/dm_hint/audit_offer), tone_match (casual/technical/beginner), word_count, banned_phrases_found[], post_safely_model, post_safely_final, reason_if_unsafe, ready_for_approval, status (`awaiting_approval`→`awaiting_approval_telegram`→`posted`/`killed`/`snoozed`/`approved_needs_manual_post`/`awaiting_alex_edit`), telegram_message_id, posted_comment_id, posted_comment_url. |
| `opportunity_outcomes` | `telegramApprovalCallback` (on approve) | dashboard, reporting | **Money Machine revenue-attribution ledger** (LIVE 2026-04-22). One doc per successfully-posted reply. Keyed by draftId. Fields: draftId, opportunityId, subreddit, original_post (Reddit permalink), comment_url, comment_id, draft_text, score, primary_service, posted_at, status=`posted`. Future: enrich with upvotes_after_1h/24h/7d, replies_received, DMs_received (manual log), calendly_attributed (manual), client_closed (manual). This is the table we'll slice to measure real pipeline ROI. |
| `money_machine_runs` | `redditScraper` (future: other scrapers) | dashboard, future `moneyMachineReviewer` | **Run-log for every hourly Reddit pull** (LIVE 2026-04-22). Fields: module, ran_at, total_pulled, keyword_matches, author_gate_rejects, duplicates, new_written, by_service (counts per service slug), duration_sec. Lets us graph funnel conversion: pulled → keyword-match % → author-gate pass % → dedupe % → new. |
| `tg_button_map` | `telegramApprovalBot.shortId()` | `telegramApprovalBot.resolveShortId()` | **Money Machine Telegram button id map** (LIVE 2026-04-22). Short-id (last 22 chars of draftId) → full draftId lookup. Required because Telegram `callback_data` max = 64 bytes and our draft ids are `reddit_<64-char-post-id>` ≈ 70+ bytes. Auto-created on push, auto-expires conceptually (keep for history; negligible storage). |
| `tg_edit_sessions` | `telegramApprovalBot.handleEdit()` | `telegramApprovalBot.handleTextReply()` | **Money Machine edit-mode sessions** (LIVE 2026-04-22). Doc id = Telegram message_id of the approval message. Tracks `{draftId, chat_id, original_message_id}`. When Alex taps Edit and replies to the message with new text, the webhook looks up this doc, overwrites `draft_text`, re-sends the approval with updated text, deletes the session. |
| `brevo_nurture_queue` | `brevoNurture.queueTrack()` (via `instantlyReplyWatcher`) | `processBrevoNurtureQueue`, `cancelTrackForEmail` | **Brevo Spanish nurture per-touch queue** (LIVE 2026-04-22 PM). One doc per scheduled touch. Fields: `email`, `firstName`, `touch` (1-4), `templateKey` (day_0/day_3/day_7/day_14), `sendAt` (Timestamp), `sent` (bool), `sentAt`, `canceled` (bool), `canceledAt`, `campaignSource`, `hookUsed`, `replyDate`, `track` ('A'), `lang` ('es'). Write trigger = `instantlyReplyWatcher` detects positive Instantly reply → upserts Brevo list 25 + calls `brevoNurture.queueTrack()` which writes 4 docs (day 0/3/7/14). Single-field `sendAt <= now` query used for reads. |
| `brevo_nurture_index` | `brevoNurture.queueTrack()` | `cancelTrackForEmail`, `processBrevoNurtureQueue` | **Brevo nurture per-email state** (LIVE 2026-04-22 PM). Doc id = lowercased email. Fields: `email`, `firstName`, `track` ('A'), `startedAt`, `calendlyBooked` (bool). Flips to `calendlyBooked=true` when `calendlyWebhook` fires `invitee.created` AND `cancelTrackForEmail(email)` runs. The sender checks this flag every cycle — when true, all pending queue docs for that email skip. Prevents nurture emails to already-booked leads. |
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

### Three known deploy traps (all fixed)

1. **Line-based sed to strip `hosting.predeploy` from `firebase.json` leaves a
   trailing comma** (fixed 2026-04-20) → "Parse Error: Trailing comma in object
   at 623:5". Fix: use `jq 'if .hosting then .hosting |= del(.predeploy) else
   . end'`.
2. **Removing `exports.X` for a scheduled function without also deleting the
   live GCP function + its Cloud Scheduler job** (fixed 2026-04-20) → Firebase
   CLI tries to delete the ghost, hits 404 on the scheduler, whole Functions
   deploy exits 2. Fix: always `firebase functions:delete NAME --region REGION
   --force` in the same session you delete the export.
3. **GCF deploy-rate quota exceeded when updating 60+ functions in one pass**
   (fixed 2026-04-22, commit `27132638`) → Firebase CLI reports the generic
   "Function deployment failed due to a health check failure" but the real
   cause is Cloud Functions' 60-updates-per-100s quota throttling half the
   deploys. Fix: `.github/workflows/deploy.yml` auto-discovers exports via
   `grep -oE '^exports\.[a-zA-Z_][a-zA-Z0-9_]*' index.js`, sorts unique,
   splits alphabetically into 2 batches, deploys each with
   `--only "functions:a,functions:b,..."` and a 120s `sleep` between. 20%
   headroom over the 100s quota window. See DISASTER_LOG 2026-04-22 PM.

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

## 10. Cold Call Pipeline — Operational Deep Dive

> **Source of truth for everything cold-call.** Folded in from the old `COLDCALL.md` on 2026-04-21.
> When something breaks at 10am, this is the section to grep. §1 / §3 above is the inventory view; this is the *how does it actually work* view.

### 10.1 30-second overview

Autonomous dialer — 50 MX real estate agencies/day, Mon-Fri, 10:00 CDMX. Slack report at 12:30. Sofia = ElevenLabs Conversational AI (Spanish, July voice), dials via Twilio, A/B/C-tests three offers in parallel. Positive replies auto-fire free website audits via email. No human in the loop for dialing — Alex only intervenes when Slack shows a hot lead.

**Afternoon batch DISABLED 2026-04-21** per Alex — morning-only cadence until we hit 3 YES clients/day. `coldCallRunAfternoon` + `coldCallSlackAfternoon` exports retained as no-op stubs to avoid the Cloud Scheduler 404 deploy trap (see `.auto-memory/firebase_deploy_traps.md`). Re-enable by setting `AFTERNOON_BATCH_SIZE > 0` in `coldCallAutopilot.js` and restoring the body from `_coldCallRunAfternoonOriginal_disabled`.

**Current health snapshot** (2026-04-21 12:00 CDMX, last 100 calls):

| Metric | Value | Target | Gap |
|---|---|---|---|
| Real conversations | 35/100 (35%) | ≥50% | Close — needs better filter |
| Zombies (0-msg / maxdur) | 31/100 (31%) | ≤10% | **HOT** — Twilio↔ElevenLabs SIP bug |
| Voicemails caught | 20/100 (20%) | n/a | Working as designed |
| Human hangups | 12/100 (12%) | n/a | Normal rejection |
| Successes (full pitch) | 3/100 (3%) | ≥10% | Needs more dials to smooth |
| Twilio balance | $31.93 USD | ≥$15 | OK |
| ElevenLabs credit | 72.6% used | ≤90% | OK — 3 weeks before reset |

### 10.2 Architecture

```
┌────────────────┐   09:55  ┌──────────────┐  10:00   ┌───────────────┐
│leadFinderAuto- │──────────►│coldCallPrep │─────────►│ coldCallRun   │
│TopUp (08:00)   │ replenish │50 leads → qu│ queue    │ fires 50 dials│
│phone_leads     │           │ A/B/C mix   │          │ 12s throttle  │
└────────┬───────┘           └──────────────┘          └───────┬───────┘
         │                                                     │
         │                    ┌──────────────┐                 │
         ▼                    │coldCallLive- │                 ▼
    phone_leads               │Monitor       │      ┌──────────────────┐
    (57 verified)             │*/3 min       │      │ ElevenLabs Sofia │
                              │10-13 + 16-19 │      │ → Twilio → lead  │
                              │Telegram alert│      │ (Spanish, MX)    │
                              │ on failure   │      └────────┬─────────┘
                              └──────────────┘               │
                                                              ▼
┌────────────────────┐    ┌────────────┐              ┌──────────────┐
│coldCallRunAfternoon│    │coldCallSlack│  13:00       │elevenLabsWebhook│
│🚫 DISABLED 04-21   │    │Morning      │  aggregate   │post-call → Firestore│
│(no-op stub)        │    │12:30 Slack  │  outcomes    │call_analysis/{convId}│
└────────────────────┘    └─────────────┘              └──────────────┘
                                                        + twilioCallStatusCallback
                                                          force-closes zombie convs
                                                          on terminal Twilio status
```

**Cron schedule (all CDMX / America/Mexico_City):**

| Time | Function | Days | Purpose |
|---|---|---|---|
| 08:00 | `leadFinderAutoTopUp` | Daily | Replenish `phone_leads` pool (HARD_FLOOR 100) |
| 09:55 | `coldCallPrep` | Mon-Fri | Rank leads, write 50 to `call_queue/{today}` with A/B/C mix |
| 10:00 | `coldCallRun` | Mon-Fri | Fire 50 dials, 12s throttle |
| 10:15 | `coldCallMidBatchCheck` | Mon-Fri | Read-only failure alert if `failed > MID_BATCH_FAIL_THRESHOLD` |
| */3 min | `coldCallLiveMonitor` | 10-13 + 16-19 | Failure-spike + stall + pending backlog alarms |
| 12:30 | `coldCallSlackMorning` | Mon-Fri | Block Kit Slack post-batch report |
| 13:00 | `coldCallReport` | Mon-Fri | Aggregate outcomes, auto-fire audits for positives |
| ~~16:00~~ | ~~`coldCallRunAfternoon`~~ | 🚫 DISABLED 2026-04-21 | No-op stub. `AFTERNOON_BATCH_SIZE=0`. Re-enable by restoring `_coldCallRunAfternoonOriginal_disabled` body. |
| ~~18:30~~ | ~~`coldCallSlackAfternoon`~~ | 🚫 DISABLED 2026-04-21 | No-op — nothing to report since morning-only cadence. Export retained to avoid Scheduler 404 deploy trap. |
| 18:00 | `dailyRollupSlack` | Daily | End-of-day 5-source cost+performance digest (replaces afternoon cold-call coverage) |
| **21:00** | **`eveningOpsReport`** | **Daily** | **Comprehensive 24h ops PDF → Slack + Telegram. Covers cold email (Instantly v2 per-campaign), Calendly bookings / cancels / no-shows, ManyChat WA+IG conversations, cold-call outcomes per A/B/C offer, free audit requests by source. Fires `aiAnalysisAgent` which auto-pauses bounce>5% campaigns, throttles <90% health accounts, escalates uncertain items as a second "🤖 AI Agent — Review Needed" Slack post. Every action logged to `ai_agent_actions/{YYYY-MM-DD}`. HARD RULE #11 compliant.** |

**HTTPS endpoints:**
- `coldCallSlackOnDemand` — manual fire: `?date=YYYY-MM-DD&window=morning|afternoon|all`
- `voiceAgentCall` — one-off dial: `{ phone, name, offer, ... }`
- `elevenLabsWebhook` — post-call ingest from ElevenLabs workspace webhook
- `seedPhoneLeadsOnce` — one-shot seeder (protected by `X-Seed-Secret`)
- `eveningOpsReportOnDemand` — manual fire of the 21:00 report: `?date=YYYY-MM-DD&skipAi=1` (skipAi suppresses auto-fixes for dry-run)

### 10.3 ElevenLabs setup — the 3 Sofia agents

**Account:** Creator plan, 95,041/131,000 chars used (72.6%)
**Master voice:** July — Warm, Youthful | Voice ID `MD6rLAhozcrmkdMZeOBt`
**Phone number:** `+52 998 387 1618` | ElevenLabs PN ID `phnum_8801kp77en3ee56t0t291zyv40ne` | Provider: Twilio | Assigned agent: A (SEO Pitch)

#### Agent config — SHARED settings (post 2026-04-21 patch)

All 3 agents now have IDENTICAL timeout/turn config to prevent zombie calls:

```json
{
  "conversation_config": {
    "turn": {
      "initial_wait_time": 1.0,                    // agent speaks first_message after 1s (was null — caused zombies)
      "silence_end_call_timeout": 15.0,            // end call after 15s silence between turns
      "turn_timeout": 4.0,                         // how long to wait for user response
      "soft_timeout_config": {
        "timeout_seconds": 8.0,                    // nudge after 8s silence
        "use_llm_generated_message": false,
        "message": "¿Hola? ¿Me escuchas?"
      },
      "mode": "turn",
      "turn_eagerness": "normal",
      "turn_model": "turn_v2"
    },
    "conversation": {
      "max_duration_seconds": 90                   // HARD CAP backstop (was 300-600)
    },
    "tts": {
      "model_id": "eleven_v3_conversational",
      "voice_id": "MD6rLAhozcrmkdMZeOBt",
      "agent_output_audio_format": "ulaw_8000",    // ulaw required for Twilio
      "stability": 0.6,
      "speed": 1.0,
      "similarity_boost": 0.75
    },
    "asr": { "provider": "scribe_realtime", "quality": "high", "user_input_audio_format": "pcm_16000" },
    "agent": { "language": "es", "disable_first_message_interruptions": true },
    "vad": { "background_voice_detection": false }
  }
}
```

#### The 3 offers (A/B/C split test)

| Offer | Agent ID | Pitch | CTA | First message |
|---|---|---|---|---|
| **A — SEO Pitch** | `agent_6601kp758ca4fcx8aynsvc0qyy5k` | "Your agency doesn't show up on Google/ChatGPT" | Book Calendly with Alex | "Hola, ¿hablo con {{lead_name}}?" |
| **B — Free Audit** (Trojan Horse) | `agent_7001kpcxketqewvt87k4mg6vp569` | "Free 7-area business audit scored 0-100, emailed in 60 min" | Lead says "yes" + confirms email → fires `submit_audit_request` tool → `submitAuditRequest` Cloud Function → audit delivered | "Hola, ¿hablo con {{lead_name}}?" |
| **C — Free Setup** | `agent_2801kpcxmxyvf36bb2c970bhvfk4` | "Free AI lead capture install, speed-to-lead hook (21× more closes in <5 min)" | Book Calendly install call | "Hola, ¿hablo con {{lead_name}}?" |

**Offer mix is UNIFORM RANDOM** (switched from round-robin 2026-04-20). This lets `autopilotReviewer` read A/B/C performance without positional bias across days.

#### Tools wired to agents

- **Offer A only:** `save_lead_to_brevo_seo` (tool `tool_4201...`, wired on `agent_6601kp758ca4fcx8aynsvc0qyy5k`, LIVE 2026-04-22 evening). POST → `https://us-central1-jegodigital-e02fb.cloudfunctions.net/saveColdCallLead` with `{ firstName, email, offer: "A", phone?, company?, website?, conversation_id? }`. Triggered when lead agrees to receive the SEO-angle follow-up. Routes to Brevo list 35 + templates 53-57 (cadence 0/1/3/5/7 days).
- **Offer B only:** `submit_audit_request` → POST to `https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest` with `{ name, email, website, source: "cold_call_elevenlabs" }`. Triggered when lead agrees to audit.
- **Offer C only:** `save_lead_to_brevo_setup` (tool `tool_1401...`, wired on `agent_2801kpcxmxyvf36bb2c970bhvfk4`, LIVE 2026-04-22 evening). POST → `https://us-central1-jegodigital-e02fb.cloudfunctions.net/saveColdCallLead` with `{ firstName, email, offer: "C", phone?, company?, website?, conversation_id? }`. Triggered when lead agrees to the free Sofia install. Routes to Brevo list 36 + templates 58-62 (cadence 0/1/3/5/10 days). Template 60 (C-D3) is time-agnostic on purpose — no "T-24h" copy — so the same email fires whether the install is tomorrow or next week.
- **All 3:** `voicemail_detection` → built-in ElevenLabs tool, ends call with `termination_reason: "voicemail_detection tool was called"` when it detects a voicemail greeting. Avg detection time: 23-28s.

#### Dynamic variables passed per call

From `_dispatch_only.cjs` / `elevenlabs_trigger_call.cjs`:

```json
{
  "lead_name": "Rosalia Cosio",
  "company_name": "GoodLife Tulum",
  "website_url": "https://goodlifetulum.com",
  "city": "Tulum",
  "lead_email": "rosalia@goodlifetulum.com",
  "offer": "B"
}
```

**Bug:** if `lead_name` is missing, ElevenLabs returns `failed` immediately with `Missing required dynamic variables in first message`. Always pass `lead.name || "allá"` as fallback. Verified 9/100 test calls had this bug pre-fallback.

### 10.4 Twilio integration

**Account SID prefix:** `AC72ce14...` | **Balance:** $31.93 USD | **Cost per minute (MX mobile):** ~$0.024/min
**Number:** `+52 998 387 1618` | Friendly name: "529983871618" | SID: `PN62b3ad78ab3c268cccf7a9230cb7fc46` | Capabilities: voice=true, sms=**false** | Voice URL: `https://api.elevenlabs.io/twilio/inbound_call`

#### CRITICAL: SMS capability disabled on Twilio number

The voice-only number cannot send SMS. Any code using `TWILIO_FROM` for SMS reminders will silently fail. The `TWILIO_SMS_FROM` alias bug in `telegramHelper.js` was fixed 2026-04-20 but the number itself still lacks SMS. **To add SMS later:** buy an A2P 10DLC-compliant US long code or a separate MX SMS-enabled number.

#### ⚠️ THE ZOMBIE BUG — Twilio vs ElevenLabs duration divergence

**Observed discrepancy** (same call `+529982931591`):
- Twilio duration: **0-1 seconds**
- ElevenLabs duration: **300 seconds**, 0 messages, terminated by max_duration

**Root cause:** When a MX mobile carrier returns silent dead-air (disconnected number, voicemail with no greeting), Twilio ends its leg in <1s but ElevenLabs doesn't detect the SIP disconnect and keeps the Sofia session alive until `max_duration_seconds` expires. This is a real ElevenLabs↔Twilio edge case, not a config bug.

**Mitigations shipped:**
1. `max_duration_seconds: 90` on all agents (was 300-600) → zombie waste capped at 90s
2. `initial_wait_time: 1` → agent speaks immediately instead of waiting for user voice
3. `silence_end_call_timeout: 15` + `soft_timeout: 8` → faster close on silence (only helps AFTER first turn)

**Still-unsolved:** 0-message zombies still hit the 90s cap. Real fix requires one of:
- **Option A (recommended):** Wire Twilio `StatusCallback` webhook (currently unset on the number) to ping a Cloud Function when Twilio detects hangup. Function then calls ElevenLabs `DELETE /v1/convai/conversations/{id}` to force-close the orphaned session. Latency: ~1-2s vs current 90s.
- **Option B:** Maintain a `bad_phones` blocklist. After 2 consecutive zombies on the same number, flag `phone_leads.{id}.do_not_call = true`. Preserves future $ but doesn't solve new-number discovery.
- **Option C:** Pre-validate numbers via Twilio Lookup API (`$0.005/number`) before dialing. Would filter disconnected/invalid numbers but won't catch voicemail-with-no-greeting.

### 10.5 Firestore schema (cold-call-specific)

Full collection list is in §3. This subsection shows the concrete document shape.

#### `phone_leads/{digits-only-phone}` — 57 docs (all phone_verified)

```js
{
  phone: "+529988859022",              // E.164 format
  name: "Rosalia Cosio",
  first_name: "Rosalia",
  last_name: "Cosio",
  company: "GoodLife Tulum",           // alias of company_name
  company_name: "GoodLife Tulum",
  email: "rosalia@goodlifetulum.com",
  website: "https://goodlifetulum.com",
  city: "Tulum",
  position: "Broker Owner",
  source: "dataforseo_maps_2026-04-19",
  seeded_at: Timestamp,
  phone_verified: true,                // HARD FILTER for dialer
  do_not_call: false,                  // HARD FILTER for dialer
  google_rating: 4.8,
  score: 87,                           // lead_finder v4 score 0-100
  last_called_at: Timestamp,           // coldCallRun updates
  last_conversation_id: "conv_8201...",// coldCallRun updates
  last_offer: "B"                      // coldCallRun updates
}
```

**Sources:** `leadFinderAutoTopUp` (daily DataForSEO Maps + Hunter enrichment), `seedPhoneLeadsOnce` (one-shot hardcoded list).

#### `call_queue/{YYYY-MM-DD}/leads/{leadId}` — 50/day

```js
{
  lead_id, phone, name, company, email, website, city,
  offer: "A" | "B" | "C",              // uniform-random
  agent_id: "agent_6601...",
  status: "queued" | "dialed" | "failed",
  dialed_at: Timestamp,
  conversation_id: "conv_8201..."      // after dial
}
```

#### `call_queue_summaries/{YYYY-MM-DD}` — 1/day

```js
{
  date: "2026-04-21",
  source_pool: 57,                     // eligible phone_leads
  total: 50,                           // prepped
  prep_at: Timestamp,
  run_at: Timestamp,
  fired: 50, failed: 0,
  offer_counts: { A: 16, B: 19, C: 15 },
  // after 13:00 report:
  positive: 3, negative: 12, neutral: 15, pending: 20,
  audits_queued: 3
}
```

#### `call_analysis/{conversation_id}` — one per dial

```js
{
  lead_id, phone, offer, agent_id, date_key: "2026-04-21",
  outcome: "pending" | "positive" | "negative" | "neutral" | "unconnected",
  fired_at: Timestamp,
  on_demand: true,                     // if fired outside scheduled cron
  // after elevenLabsWebhook fires:
  duration_secs, message_count, termination_reason,
  transcript: [...], classifier_reasoning: "..."
}
```

**Outcome classifier (in `elevenLabsWebhook`):**
- `positive`: lead said yes to CTA (book call / agree to audit / confirm interest)
- `negative`: lead actively declined or asked to stop calling
- `neutral`: short conversation with no clear signal
- `unconnected`: 0 messages (zombie) or voicemail_detection fired
- `pending`: seeded at dial time but webhook hasn't fired yet (should resolve within 30s post-call)

### 10.6 Reporting pipeline

#### Slack reports (Block Kit, `#all-jegodigital`)

`coldCallSlackMorning` (12:30) + `coldCallSlackAfternoon` (18:30) both render identical Block Kit:

```
🟢 Cold Call Report — Morning (2026-04-21)
┌─────────────────────────────────────┐
│ Total dialed: 50    Zombies: 31    │
│ Positives:     3    Voicemails: 20 │
│ Negatives:    12    Success rate:3%│
│ Neutrals:     15                    │
├─────────────────────────────────────┤
│ Verdict: 🟡 1-2 positives           │
│ By offer: A=1pos B=2pos C=0pos     │
├─────────────────────────────────────┤
│ Top 5 positives:                    │
│   Rosalia (B) — conv_8201kpreky0...│
│   Jose (A)    — conv_8401kqf5h1x...│
│   ...                               │
├─────────────────────────────────────┤
│ First 3 failures:                   │
│   +529842705274 — Missing lead_name│
│   ...                               │
└─────────────────────────────────────┘
```

**Slack webhook env var:** `SLACK_WEBHOOK_URL` (in `website/functions/.env` + GH Secrets). Fallback: Telegram if missing.

#### Telegram alerts (`coldCallLiveMonitor`, every 3 min during call windows)

Three alarm types, anti-spammed via `cold_call_monitor_alarms/{30-min-slot}`:

1. **Failure spike:** `failed/(dialed+failed) > 30%` with ≥10 attempts → "🚨 Cold call failure rate at 47% — X/Y failed"
2. **Stall:** Last `dialed_at` older than 8 min mid-window with queue non-empty → "⏸️ Dialer stalled — no dials in 8 min, 23 queued"
3. **Pending backlog:** `call_analysis.outcome=pending` count > 25 → "⚠️ elevenLabsWebhook lagging — 27 pending analyses"

#### On-demand report

```bash
curl "https://us-central1-jegodigital-e02fb.cloudfunctions.net/coldCallSlackOnDemand?date=2026-04-21&window=morning"
```

Response: `{ ok: true, slack: {...}, date, window, totals }`

### 10.7 Known issues — open + resolved

#### 🔴 OPEN — Zombie calls (31% of today's batch)

**Symptom:** Call shows on ElevenLabs as 90s with 0 messages, termination `exceeded maximum duration`. Twilio side shows 0-1s duration. Real cost per zombie: ~$0.02 Twilio + 0 ElevenLabs chars (agent never spoke).

**Current mitigation:** Hard 90s cap (was 300-600s). Waste reduced 70%.

**Next fix to ship:**
1. **Wire Twilio `StatusCallback`** on `+529983871618` → new Cloud Function `twilioCallStatusCallback` → when Twilio reports `completed/failed/no-answer`, immediately call `DELETE /v1/convai/conversations/{conversation_id}` (need to pass convId via Twilio call params or cross-reference by phone+timestamp).
2. **Add `bad_phones` auto-blocklist** — after 2 zombies on same number, flip `phone_leads.{id}.do_not_call = true` automatically in `coldCallReport`.
3. **Pre-validate via Twilio Lookup API** ($0.005/number × 50/day = $0.25/day) in `leadFinderAutoTopUp` before adding to pool.

#### 🟡 OPEN — `call_analysis.outcome=pending` lingers after call ends

**Symptom:** 61 docs today still `pending` at 12:00. `elevenLabsWebhook` signed but may not be firing reliably.
**Root cause candidates:** Webhook HMAC validation not yet wired (task #45). Possible ElevenLabs webhook retries failing silently.
**Next fix:** Read last 10 webhook payloads from `webhook_events` collection. Check if payloads are landing but classifier is crashing.

#### 🟡 OPEN — 3% success rate is low

**Context:** Of 100 calls, only 3 ran to the CTA successfully. Most "completed" calls are human hangups (12%) or voicemails (20%).

**Next fixes to consider:**
1. **Sharper opener hook** — current "Hola, ¿hablo con {{lead_name}}?" is polite but forgettable. Try variant: "Hola {{lead_name}}, soy Sofia. Le hablo por su inmobiliaria {{company_name}}. ¿Tiene 20 segundos?" (name-drops them, disarms with time box).
2. **Call lists quality** — 43/57 leads called in last 7 days means we're cycling the same pool. Need `leadFinderAutoTopUp` to target fresher cities.
3. **Time-of-day split** — 10:00 CDMX may catch too many at morning meetings. Test 14:00 or 17:00 with one offer (B) for A/B against morning slot.
4. **Offer C (Free Setup)** hook needs shortening — try: "Le instalo gratis un sistema que contesta sus leads de WhatsApp en 30 segundos, sin compromiso." (concrete, fast, reciprocity trigger).

#### ✅ RESOLVED (keep for pattern-reference)

- `silence_end_call_timeout: -1` default → patched all 3 agents to 15 (2026-04-21). Note: only helps AFTER first turn, so doesn't solve dead-air zombies.
- `initial_wait_time: null` caused agent to never speak → set to `1` on all 3 (2026-04-21). ElevenLabs rejects `0`; valid range is `-1 | 1-300`.
- ElevenLabs PATCH silently drops invalid bodies → ALWAYS GET the agent after PATCH to verify. Never trust the PATCH response body (returns `null` for fields in diffs, which looks like success).
- ~~`coldCallRunAfternoon` query missed stranded `queued` → afternoon retry now includes `status in ["no_answer","failed","dialed","queued"]` (2026-04-20).~~ **MOOT 2026-04-21** — afternoon batch disabled entirely. Fix preserved in `_coldCallRunAfternoonOriginal_disabled` for when we re-enable.
- `BATCH_SIZE=50 × FIRE_INTERVAL=12s = 600s > timeoutSeconds=540` → Known risk, historically only fires 43-47 before Firebase v1 timeout kills the function. Acceptable loss — remaining 3-7 leads get picked up by afternoon retry.
- `TWILIO_SMS_FROM` alias bug → `telegramHelper.js` was reading an env var that was never set. Real var is `TWILIO_FROM` (2026-04-20).
- Dynamic variable `lead_name` missing crashes call → all dispatch scripts now use `lead.name || "allá"` fallback. Still seeing 9/100 historical calls with this error from earlier runs.

### 10.8 Diagnostic procedures

#### Before every new session — 30-second health check

```bash
cd /Users/mac/Desktop/Websites/jegodigital/website/functions
KEY=$(grep ELEVENLABS_API_KEY .env | cut -d= -f2 | tr -d '"')
SID=$(grep TWILIO_ACCOUNT_SID .env | cut -d= -f2 | tr -d '"')
TOK=$(grep TWILIO_AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')

# 1. ElevenLabs credit
curl -s "https://api.elevenlabs.io/v1/user/subscription" -H "xi-api-key: $KEY" | \
  jq '{tier, used:.character_count, limit:.character_limit, pct:(.character_count/.character_limit*100)}'

# 2. Twilio balance
curl -s "https://api.twilio.com/2010-04-01/Accounts/$SID/Balance.json" -u "$SID:$TOK" | jq '{balance, currency}'

# 3. All 3 agent timeouts (should be initial_wait_time=1, silence=15, max=90)
for AID in agent_6601kp758ca4fcx8aynsvc0qyy5k agent_7001kpcxketqewvt87k4mg6vp569 agent_2801kpcxmxyvf36bb2c970bhvfk4; do
  curl -s "https://api.elevenlabs.io/v1/convai/agents/$AID" -H "xi-api-key: $KEY" | \
    jq "{agent: \"${AID: -12}\", initial_wait: .conversation_config.turn.initial_wait_time, silence_end: .conversation_config.turn.silence_end_call_timeout, soft_to: .conversation_config.turn.soft_timeout_config.timeout_seconds, max_dur: .conversation_config.conversation.max_duration_seconds}"
done

# 4. Last 10 calls outcome
curl -s "https://api.elevenlabs.io/v1/convai/conversations?page_size=10" -H "xi-api-key: $KEY" | \
  jq -r '.conversations[] | "\(.conversation_id[-12:]) \(.status) \(.call_duration_secs)s \(.message_count)msg \(.termination_reason)"'
```

#### Fire a test batch of N calls

```bash
cd /Users/mac/Desktop/Websites/jegodigital/website/functions
export ELEVENLABS_API_KEY=$(grep ELEVENLABS_API_KEY .env | cut -d= -f2 | tr -d '"')
node _dispatch_only.cjs 5      # 5-call test batch
# Wait ~2 min for all to complete (max 90s each + buffer)
```

#### Monitor a live batch

```bash
KEY=$(grep ELEVENLABS_API_KEY .env | cut -d= -f2 | tr -d '"')
watch -n 15 "curl -s 'https://api.elevenlabs.io/v1/convai/conversations?page_size=10' -H 'xi-api-key: $KEY' | \
  jq -r '.conversations[] | select(.conversation_id | test(\"fqgbq|jvpb3|wwt7e\")) | \"\(.conversation_id[-12:]) \(.status) \(.call_duration_secs)s \(.message_count)msg \(.termination_reason // \"...\")\"'"
```

#### Pull a single conversation in detail (when debugging a specific zombie)

```bash
CID=conv_8201kpreky0veex8xdsx0aqjd7jf
curl -s "https://api.elevenlabs.io/v1/convai/conversations/$CID" -H "xi-api-key: $KEY" | \
  jq '{status, duration: .metadata.call_duration_secs, reason: .metadata.termination_reason, direction: .metadata.phone_call.direction, number: .metadata.phone_call.external_number, transcript_len: (.transcript | length), first_3: .transcript[0:3]}'
```

#### Correlate ElevenLabs convo to Twilio call (for the zombie SIP bug)

```bash
PHONE_URL="%2B52998..."  # URL-encoded phone
TODAY=$(date -u +%Y-%m-%d)
curl -s "https://api.twilio.com/2010-04-01/Accounts/$SID/Calls.json?To=$PHONE_URL&StartTime%3E=$TODAY" -u "$SID:$TOK" | \
  jq -r '.calls[] | "\(.sid[-10:]) \(.status) dur=\(.duration)s err=\(.error_code // "-")"'
```

#### PATCH agent config (with verification)

```bash
AID=agent_7001kpcxketqewvt87k4mg6vp569
curl -X PATCH "https://api.elevenlabs.io/v1/convai/agents/$AID" \
  -H "xi-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"conversation_config":{"turn":{"initial_wait_time":1,"silence_end_call_timeout":15},"conversation":{"max_duration_seconds":90}}}'
sleep 1
# ALWAYS GET TO VERIFY — PATCH returns 200 with all-null body even on invalid input
curl -s "https://api.elevenlabs.io/v1/convai/agents/$AID" -H "xi-api-key: $KEY" | \
  jq '.conversation_config.turn, .conversation_config.conversation'
```

#### Emergency stop — pause the dialer

```bash
gcloud scheduler jobs pause firebase-schedule-coldCallRun-us-central1 --location=us-central1 --project=jegodigital-e02fb
# Re-enable:
gcloud scheduler jobs resume firebase-schedule-coldCallRun-us-central1 --location=us-central1 --project=jegodigital-e02fb
```

### 10.9 Key files

| File | Purpose |
|---|---|
| `website/functions/coldCallAutopilot.js` | 3 cron fns: `coldCallPrep`, `coldCallRun`, `coldCallReport` + afternoon variants |
| `website/functions/coldCallLiveMonitor.js` | Every-3-min watchdog (failure spike, stall, backlog) |
| `website/functions/coldCallSlackReport.js` | `coldCallSlackMorning`, `coldCallSlackAfternoon`, `coldCallSlackOnDemand` |
| `website/functions/seedPhoneLeadsOnce.js` | One-shot phone_leads seeder |
| `website/functions/leadFinderAutoTopUp.js` | Daily 08:00 phone_leads replenishment |
| `website/functions/index.js` (L1983-2000) | Exports all cold-call fns |
| `website/functions/index.js` (L894-1000) | `elevenLabsWebhook` post-call ingest |
| `website/tools/elevenlabs_trigger_call.cjs` | Manual 1-off dial with `--offer=A|B|C` |
| `website/tools/elevenlabs_list_agents.cjs` | List all agents in account |
| `website/tools/elevenlabs_get_agent.cjs` | Pull full config for one agent |
| `website/tools/elevenlabs_check_phone.cjs` | List registered phone numbers |
| `website/tools/audit_elevenlabs_calls.cjs` | Audit call history + zombie detection |
| `website/functions/_dispatch_only.cjs` | Ad-hoc N-call test dispatcher (NOT in git — rebuild each session) |
| `_phone_leads_seed_data.js` | Hardcoded DIAL_READY list |
| `website/functions/eveningOpsReport.js` | 21:00 CDMX comprehensive 24h ops report (5 sources, branded PDF, Slack + TG) |
| `website/functions/aiAnalysisAgent.js` | Gemini 2.0 Flash auto-fix + escalate agent — called by eveningOpsReport |
| `website/mockup-renderer/server.js` (`/renderPdf`) | Playwright HTML→PDF endpoint used by eveningOpsReport |

### 10.10 Always-recommended next steps (ROI-ordered)

**HIGH ROI (ship this week)**
1. **Wire Twilio `StatusCallback`** → new `twilioCallStatusCallback` Cloud Function → force-close orphaned ElevenLabs conversations on Twilio hangup. Expected: cut zombie waste by 80% (from 90s cap to ~3s actual).
2. **Ship `bad_phones` auto-blocklist** in `coldCallReport`: any number with 2 consecutive zombies → `do_not_call=true`. Preserves pool quality over time.
3. **Fix `call_analysis.outcome=pending` backlog** — 61 pending today means webhook isn't classifying. Pull webhook logs, verify HMAC, check classifier errors.
4. **A/B test sharper opener** on Offer A — deploy variant: "Hola {{lead_name}}, le hablo por {{company_name}}. ¿Tiene 20 segundos?" vs current. Let `autopilotReviewer` pick the winner after 40 dials.

**MEDIUM ROI (ship in 2 weeks)**
5. **Twilio Lookup API pre-validation** in `leadFinderAutoTopUp` — filter disconnected numbers before adding to pool. Cost: $0.25/day. Saves: ~15 zombies/day.
6. **Add a 2nd Twilio number** — current 1 number bottlenecks concurrent calls at ~4 (Creator plan) and wastes wait time. Second number doubles throughput.
7. **SMS follow-up after voicemail** — when `termination_reason: voicemail_detection`, send auto-SMS "Hola, le llamé hace un momento. ¿Tiene 2 minutos para hablar? — Alex JegoDigital". Needs SMS-enabled number (see §10.4).

**LOW ROI (ship only when high-ROI is done)**
8. **Time-of-day split test** — dial 25 at 10:00, 25 at 17:00 with same offer. Currently all at 10:00.
9. **Per-city opener variants** — "Miami real estate" opener differs from "Cancún turístico" opener. Requires prompt-per-city wiring.
10. **Callback-scheduling tool** — if lead says "llámame mañana", agent writes to `callback_schedule` → `coldCallPrep` honors these next day.

**WATCH — don't touch unless flagged**
- **ElevenLabs Creator plan** — 131K chars/month ≈ 150 calls/day at 95K used now. **Will need Pro upgrade** by mid-May if we scale to 100+/day.
- **Twilio balance** — $31.93 currently, burns ~$0.60/day at 50 calls. **Auto-refill trigger at $15.**
- **phone_leads pool** — 57 verified, 43 called in last 7d. `leadFinderAutoTopUp` HARD_FLOOR=100 is BELOW current pool — something's wrong with the top-up. Investigate if pool drops below 50.

### 10.11 Sample conversation — what good looks like

**Offer A success, conv_8401kqf5h1x... (54s, 7 messages):**

```
[agent] Hola, ¿hablo con Jose Fernandez?
[user]  Sí, ¿quién habla?
[agent] Soy Sofia de JegoDigital. Le hablo porque noté que su inmobiliaria no aparece cuando busco "inmobiliarias en Cancún" en ChatGPT. ¿Tiene 30 segundos?
[user]  Eh, dime rápido.
[agent] Perfecto. Hacemos que su sitio aparezca en Google, ChatGPT y Perplexity sin pagar publicidad. GoodLife Tulum logró 300% más tráfico. ¿Le agendo 15 minutos con Alex el jueves?
[user]  Mándame info por correo primero.
[agent] Claro. Le envío la información al correo que tenemos. Si le interesa, agende en calendly.com/jegoalexdigital/30min. Gracias Jose, que tenga buen día.
[user]  Gracias, bye.
[termination_reason] Call ended by remote party
```

---

## 11. Change log

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
| 2026-04-21 | **COLDCALL.md folded into SYSTEM.md §10.** Full operational deep-dive for the cold-call pipeline now lives in this file (11 subsections: overview, architecture + cron table, 3 Sofia agents with shared JSON config, Twilio zombie bug deep-dive, Firestore schema, Slack+Telegram reporting, open + resolved known issues, diagnostic bash snippets, key files table, ROI-ordered next steps, sample conversation). COLDCALL.md removed — SYSTEM.md is now the single source of truth for infra. Bootstrap doc count reduced per Alex's reorg ask. |
| 2026-04-21 | **Zombie-call killer shipped** — `twilioCallStatusCallback` Cloud Function (new file `twilioCallStatusCallback.js`) wired on Twilio `+52 998 387 1618` via `IncomingPhoneNumbers.statusCallback`. Does two things per Twilio status event: (1) PROXIES the original POST body to `https://api.elevenlabs.io/twilio/status-callback` preserving ElevenLabs's internal session/transcript/billing bookkeeping; (2) on terminal status (`completed`/`failed`/`no-answer`/`busy`/`canceled`), looks up the linked ElevenLabs `conversation_id` via `call_analysis.where(callSid)` and force-closes the session via `DELETE /v1/convai/conversations/{id}`. Solves the zombie-SIP bug documented in §10.4 — Twilio drops in 0-1s but ElevenLabs previously held the Sofia session until `max_duration_seconds=90`. Expected impact: 80%+ reduction in zombie waste (90s cap → ~3s real close). Annotates `call_analysis` with `twilio_final_status`, `twilio_duration_seconds`, `force_closed`, `force_closed_at`, `force_close_status_code`. Always returns 200 to Twilio to avoid webhook auto-disable. |
| 2026-04-21 | **Afternoon cold-call batch DISABLED** per Alex — morning-only cadence until we hit 3 YES clients/day. `coldCallRunAfternoon` body stubbed to no-op, `AFTERNOON_BATCH_SIZE=0` sentinel in `coldCallAutopilot.js`, original body preserved as `_coldCallRunAfternoonOriginal_disabled` (line 658) for re-enabling. `coldCallSlackAfternoon` also no-op. Exports + scheduler retained to avoid the Cloud Scheduler 404 deploy trap. §10.2 architecture diagram + cron schedule table updated to reflect. |
| 2026-04-21 | **HARD RULES #0 + #2 added to CLAUDE.md** — #0 forbids fabricating numbers, extrapolations, "industry averages", and calling gatekeepers "warm leads" (triggered by Jose Fernandez disaster where Claude quoted "30% conversation rate" with no data). #2 extends the Instantly verify-live rule to all 8 platforms (ElevenLabs, Instantly, Brevo, Calendly, Firestore, Meta Graph, GSC, GA4) — no metric from memory/docs, live API call required. `coldEmailReportOnDemand` Cloud Function serves as the HARD RULE #2 proxy route for Instantly when sandbox egress is blocked. |
| 2026-04-21 | **Planned crons added to §2** — `weeklyRevenueReview` (Monday 08:00, HARD RULE #7 automation, MRR/churn/closes, escalates if MRR=$0 for 4+ weeks) and `verifyClientProofMonthly` (1st of month, HARD RULE #9 automation, re-verifies every claim in `showcase.html` against live rank + PSI + traffic data). Both unbuilt — planned builds at `website/functions/weeklyRevenueReview.js` and `website/functions/verifyClientProofMonthly.js` respectively. |

---

**Rule zero:** if you touch a cron, function, collection, or external service and
this file doesn't change in the same commit, you didn't actually ship. Update
first, then code.
