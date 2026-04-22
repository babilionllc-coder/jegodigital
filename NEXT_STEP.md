# JegoDigital — NEXT_STEP

> **This file is the living priority queue. The #1 item is TODAY'S work (HARD RULE #4 + #8).**
> **Update at the END of every session:** mark completed items, promote the next rock, add anything new Alex agreed to.
> **Last session update:** 2026-04-22 PM (Brevo nurture + deploy.yml batch-split shipped)
> **Maintained by:** Claude + Alex

---

## 🎯 TODAY'S BIG ROCK (HARD RULE #8)

> **2026-04-23 (tomorrow):** Fill the **Free Demo Website MX** lead bucket (200+ score-≥85 leads) and flip the campaign from PAUSED → ACTIVE.
>
> ✅ **2026-04-22 shipped:** (1) Campaign `Free Demo Website — MX RE` created in Instantly (id `d486f1ab-4668-4674-ad6b-80ef12d9fd78`, PAUSED, 5 steps, 10 Gen 2 senders, bounce-protect + tracking ON). (2) 5-step MX Spanish sequence scored 97-100/100 on Quality Scorecard. (3) Copy archived in `COLD_EMAIL.md` §ACTIVE CAMPAIGN TEMPLATES. (4) Iron Rule #13 (bash curl only) used for the POST — verified 200 + re-GET shows all fields intact.
>
> Tomorrow specifically: (1) run `lead-finder v4` with broken-site signal (Firecrawl daysSinceLastBlog>180 OR pageSpeed<50 OR no HTTPS OR no schema) on MX real estate agencies. (2) Route all leads through `tools/lead_quality_gate.sh` (HR#5 — must print `✅ 5/5 gates passed`). (3) Upload to campaign via bash curl. (4) PATCH campaign status 0→1 to activate. (5) Start building `freeDemoSitePipeline` Cloud Function (manual-assist for first 10 replies while shipping).

**Bucket:** B (generate qualified leads) + C (raise conversion via radical personalization)
**Success criteria (tomorrow):** 200+ gate-passed leads uploaded to `d486f1ab-4668-4674-ad6b-80ef12d9fd78` + campaign status=1 (ACTIVE) + first Step-0 sends visible in Instantly analytics within 24h.

---

## 📋 PRIORITY QUEUE — in order. Work top-down.

### P0 — Close paying clients THIS week (Bucket A)

1. **Work the Apr 17 Calendly booking (`Consulta Gratuita`)** — Pull invitee details from Calendly, check if a proposal has been sent, if follow-up WhatsApp has been sent. If not: draft and send both today. **Proof required:** timestamped message + Brevo activity log.
2. **Harvest all positive replies from Instantly inbox (past 7 days)** — Run Unibox query, extract positives, send each one the pre-filled `/auditoria-gratis` link per §Instantly AI Reply Agent Guidance. **Proof required:** list of N positive reply email addresses + N audit links fired.
3. **Review yesterday's 74 ElevenLabs conversations** — Any lead flagged positive in transcript gets the audit link + Calendly pushed via WhatsApp. **Proof required:** transcript IDs reviewed + actions taken per transcript.

### P1 — Generate qualified leads THIS week (Bucket B)

4. **Fix Instantly 0% open tracking** — Current state (live pull 2026-04-21): 3,238 sent / 0 opens across all 9 campaigns. This is workspace-level, not per-campaign. Check: (a) `open_tracking_enabled` on workspace, (b) `track_opens` flag on campaigns, (c) DNS SPF/DKIM on aichatsy.com, (d) pixel domain in Instantly account settings. **Proof required:** at least 1 campaign shows nonzero opens within 24h of fix.
5. **Finish ElevenLabs voicemail fix for Agents B and C** — Agent A is patched (avg 19.5s, 0 zombies). Agent B has 2 zombies (103s, 215s), Agent C has 0 done / 14 failed. Root cause was `silence_end_call_timeout = -1`; fix was 20s. Verify fix landed on B and C via `GET /v1/convai/agents/<id>`. If dropped silently (HR#2 disaster Apr 21), try PUT instead of PATCH. **Proof required:** GET response for both agents shows `silence_end_call_timeout: 20` + next 5 calls on each agent avg <60s.
6. **Run lead_finder v4** for 200 new MX real estate decision-makers in CDMX+Cancún+Tulum. Route through HARD RULE #5 5-gate quality check BEFORE upload. **Proof required:** CSV path + gate script output `✅ 5/5 gates passed`.

### P2 — Raise conversion rate (Bucket C)

7. **Fix Agent C (Free Setup) — 0 done / 14 failed pattern** — investigate whether the prompt is triggering instant hangups, whether speed-to-lead hook is too aggressive, whether Twilio SIP is failing. **Proof required:** one clean successful call on Agent C.
8. **Diagnose audit funnel delivery** — HARD RULE §Audit Funnel notes "PSI/DFS returning 0 (Apr 16)" — if audit is not pulling real data, the email landing in the lead's inbox is a dud. Check `processAuditRequest` Cloud Function logs for last 5 runs. **Proof required:** logs show real PageSpeed scores + real keyword data in last 5 audits. **Note (2026-04-22 PM):** the *notification layer* (Brevo + Telegram + Slack + Alex email) is now monitored by `auditNotificationWatchdog` — silent send failures will Slack-alert within 15 min. This task is now scoped to the **data-pull layer only** (PSI + DataForSEO returning real scores, not 0).
9. **Refresh top-of-funnel copy** — 0 opens in Instantly could also be subject lines. Test 2 subject variations per campaign via Instantly A/B feature once tracking is fixed.
10. **Calendly→Brevo auto-contact fix** — When a lead books a Calendly call, the webhook is NOT auto-creating them as a Brevo contact. So the automated follow-up emails never fire for booked leads. Found 2026-04-21: Adrián Vera booked Apr 15 and had zero Brevo record — we lost 3 days of automated follow-up. Every future booking is also skipping the pipeline. Fix: audit `website/functions/calendlyWebhook.js` — confirm `invitee.created` handler calls Brevo `/v3/contacts` upsert with full attributes (FIRSTNAME, LASTNAME, COMPANY, SOURCE=calendly, STAGE=booked). **Proof required:** make a test booking, verify the contact appears in Brevo within 60 seconds with correct attributes.

### P3 — Unblock future revenue (Bucket D)

10. **Update ACCESS.md** — 3 pending updates, reconcile with live `gh secret list` (task #29).
11. **Fix `tools/verify_access.sh`** — has hardcoded Mac path that fails in sandbox. Needs sandbox-path-aware detection.
12. **Create `tools/lead_quality_gate.sh`** — HARD RULE #5 enforcement script. Does not yet exist.
13. **Build `verifyClientProofMonthly` Cloud Function** — HARD RULE #9 automation.
14. **Build `weeklyRevenueReview` Cloud Function / skill** — HARD RULE #7 automation, runs every Monday.

### P4 — BACKLOG (do NOT start until P0-P3 empty — HARD RULE #3)

17. Everything else → moved to `BACKLOG.md`.

---

## ✅ SHIPPED THIS SESSION (2026-04-21 PM)

- HARD RULE #0 (no fabricated numbers) added to CLAUDE.md
- HARD RULE #1 (never blind on cold email) added with auto-verify script
- HARD RULE #2 (universal verify-live, 8 platforms) added
- HARD RULE #3-#10 added (revenue-first, NEXT_STEP-first, lead-quality-gate, never-complete-without-proof, weekly-revenue-review, one-big-rock, client-proof-fresh, log-failures)
- HARD RULE #11 (always find a way) + #12 (plain-language explanations) + #13 (never ask Alex to work) + #14 (clear next steps) added to CLAUDE.md
- README.md created (was 1 byte empty)
- ONBOARDING.md created as single entry point
- NEXT_STEP.md created (this file)
- OPERATING_RHYTHM.md created (daily/weekly/monthly/quarterly cadence)
- DISASTER_LOG.md created (13 entries backfilled in HR#10 format)
- BACKLOG.md created (P4 parking lot)
- **COLDCALL.md folded into SYSTEM.md §10** (11 subsections, source-code comments updated to reference SYSTEM.md §10.4, COLDCALL.md reduced to redirect stub) — **task #27 complete**
- **Evening ops report + dailyStrategist AI agent deployed via chrome-devtools MCP** (commit `72ed715`) — see block below
- Live data pull confirms: Calendly 0 today / 1 in 7d · Brevo 36% open rate · Instantly 0% open rate (broken) · ElevenLabs A✅ B⚠️ C❌

## ⏭️ ROLLED TO NEXT SESSION

- None from this session's doc-cleanup arc — all of it shipped in commit `c3c9ad71` (2026-04-21 PM, all 3 workflows green).
- Still pending from P0/P1 queue above: Apr 17 Calendly booking (#1), Instantly positive-reply harvest (#2), yesterday's 74 EL conversations review (#3), Instantly 0% open tracking diagnosis (#4), Agent B+C voicemail fix verification (#5), lead_finder v4 run (#6).

## ✅ SHIPPED 2026-04-22 PM (Brevo nurture trio + deploy.yml batch-split)

**Context:** Alex approved "yes do it make sure its in spanish" — ship an end-to-end nurture loop from every positive Instantly reply through 4 Spanish touches over 14 days on the free Brevo plan, with auto-cancel when they book Calendly. In the same session, 6 functions started failing with the misleading "health check failure" error — root cause diagnosed as GCF deploy-rate quota (60 updates per 100s) and permanently fixed in the workflow.

- **`brevoNurture.js`** shipped (NEW, 22 KB, commits `aeff926` → `5aaad78` → `c4e875c`) — core engine. `pushToBrevoList(email, attrs)` + `queueTrackA(email, replyAt, hook)` upsert contact into Brevo list 25 + write 4 per-touch rows into Firestore `brevo_nurture_queue` (day 0/3/7/14).
- **`processBrevoNurtureQueue`** scheduled cron (every 30 min CDMX) + **`processBrevoNurtureQueueOnDemand`** HTTP endpoint — scan `brevo_nurture_queue` where `sendAt <= now`, filter `sent !== true && canceled !== true` in code (single-field query, no composite index needed — see DISASTER_LOG 2026-04-22 PM), send via Brevo transactional API, mark `sent:true`. Live URL: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/processBrevoNurtureQueueOnDemand` returned HTTP 200 on smoke test.
- **`instantlyReplyWatcher.js` patched** — every positive Instantly reply → bridges into `brevoNurture.queueTrackA()`, ledger gets new `brevo_nurture_started` field.
- **`calendlyWebhook.js` patched** — `invitee.created` → `cancelTrackForEmail(email)` flips all pending rows to `canceled:true` + `brevo_nurture_index.calendlyBooked=true` so no further nurture emails land.
- **Backfill script `tools/brevo_nurture_backfill.sh` ran tonight, 8/8 delivered.** Existing Instantly repliers found = 9, excluded 1 (unsubscribe), upserted 8/8 into Brevo list 25 (contact IDs 117–124), sent 8/8 age-appropriate transactional emails (day_0 / day_3 / day_10), queued 2–3 future touches per contact.
- **4 Spanish templates shipped (Track A)** — day 0 "aquí está la auditoría que pediste", day 3 "¿pudiste revisar el análisis?", day 7 "Caso real: Flamingo Real Estate 4.4x", day 14 "último toque antes de archivar". All <2 lines, all drive to Calendly, zero pricing.
- **`.github/workflows/deploy.yml` hardened (commit `27132638`)** — auto-discovers function exports via `grep -oE '^exports\.[a-zA-Z_][a-zA-Z0-9_]*' index.js`, sorts unique, splits alphabetically into BATCH 1 + BATCH 2, deploys each with `--only "functions:a,..."` and sleeps 120s between. Kills the GCF quota trap that masked 6 "failed" functions (`coldCallRun`, `coldCallMidBatchCheck`, `coldCallRunAfternoon`, `contentPublisher`, `dailyDigest`, `sofiaConversationAudit`) as health-check failures.
- **DISASTER_LOG.md +3 entries** — (1) Firebase CLI "health check failure" masks GCF deploy-rate quota, (2) Firestore composite-index trap → single-field + in-code filter pattern, (3) GitHub Git Data API blob POST requires `curl --data-binary @file` (never `curl -d @file`, which blows up on E2BIG for 115 KB base64).
- **SYSTEM.md updated** — Brevo trio added to function inventory + 2 new Firestore collections documented (`brevo_nurture_queue`, `brevo_nurture_index`) + "Three known deploy traps (all fixed)" section now includes the GCF quota fix.
- **DEPLOY.md updated** — `deploy.yml` section rewritten to document the 2-batch pattern + 120s gap + why the GCF quota surfaces as the wrong error, plus a new Guard Rail #4 for large-blob pushes via `--data-binary @file`.

**Proof:** `outputs/brevo_nurture_morning_proof_2026-04-22.md` — 3-layer architecture, backfill stats, deploy timeline, HR-6 compliance (deploy log + live HTTP 200 + public function URL).

## ✅ SHIPPED 2026-04-22 PM (Option B — audit-notification watchdog)

**Context:** Priscila + Casa Mérida (pre-2026-04-22) lost to silent failures — Brevo/Telegram/Slack/Alex-email all failed inside `submitAuditRequest` with no surface anywhere. Alex chose Option B: a cron watchdog that detects and Slack-alerts silent notification failures within 15 minutes instead of days.

- **`submitAuditRequest` patched** (`website/functions/index.js`) — now tracks per-channel delivery status (`notifications.{brevo,telegram,slack,alex_email}` with `{ok, skipped?, error?, at}`) and flushes it to Firestore at end of handler. Commit `0d1413cf`.
- **`auditNotificationWatchdog` + `auditNotificationWatchdogOnDemand` shipped** (`website/functions/auditNotificationWatchdog.js`) — every 15 min CDMX, scans 24h of `audit_requests`, flags Case A (notifications missing) or Case B (channel ok=false && !skipped), posts Slack Block Kit alert. 5-min grace + `LEGACY_CUTOFF_MS=2026-04-22 23:30 UTC` eliminate false positives. Commits `0d1413cf` + `d9c6538b` (LEGACY_CUTOFF).
- **`SLACK_WEBHOOK_URL` already in GH Secrets + wired in `deploy.yml:52`** — watchdog has everything it needs to fire Slack alerts.
- **6 parallel-race scheduler deploys healed** via empty-commit + `workflow_dispatch` (commit `79d42086`). Deploy run 24808253094 went green — `coldCallRun/MidBatchCheck/RunAfternoon`, `contentPublisher`, `dailyDigest`, `sofiaConversationAudit` all re-synced cleanly.
- **Live smoke test passed** — submitted post-LEGACY_CUTOFF audit `XxZUgC0TJA3ccEn08zd6` at 23:30:23 UTC → waited out 5-min grace → watchdog returned `scanned:9, healthy:9, broken:0`. All 4 channels reported ok/skipped on fresh submission = flush logic works end-to-end.
- **SYSTEM.md §1.1 + §1.3 updated** with both new functions (this commit).

## ✅ SHIPPED 2026-04-22 AM

- **4/4 abandoned warm replies shipped** via `POST /api/v2/emails/reply`:
  - Alvaro (aa@trustreal.mx) — W1 Spanish + apology preamble for accidental test-send → HTTP 200 id=019db3a2
  - Jorge (jorge@tropicasa.com) — W3 English "team inbox" preamble → HTTP 200
  - Cambria (cambria@diamanterealtors.com) — W3 English Baja angle → HTTP 200
  - Susan (susan@shorelinerealtypv.com) — W2 English delay-apology → HTTP 200
  - All routed through william@zennoenigmawire.com (the 3 personal-Gmail originals were unconnected senders)
- **reply_classifier.py** committed — 9/9 self-tests pass, classifies warm / bounce / noise:ooo / noise:unsub / noise:spam / ambiguous
- **blocklist_domains.txt** committed — 50+ domains across 8 categories (corporate RE, chain brokerages, listing aggregators, free email, spam senders)
- **3 DISASTER_LOG entries** added (accidental TEST-SEND, CF 1010 User-Agent block, unconnected Gmail-alias eaccount 404)

## 📦 SHIPPED IN COMMIT c3c9ad71 (2026-04-21 PM)

- Task #28 — SYSTEM.md §2 planned crons added (`weeklyRevenueReview` HR#7, `verifyClientProofMonthly` HR#9); §10 overview + ASCII + cron table + resolved-list all annotated with DISABLED for afternoon batch; §11 change log reordered chronologically + 4 new entries
- Task #29 — ACCESS.md live-verified 37/37 against GH API; header bumped to 2026-04-21 PM; changelog entry for today's infra; FILE REFERENCE table expanded with 6 new docs + `twilioCallStatusCallback.js` + `tools/verify_access.sh`
- Task #35 — single Git Data API push of 13 files (CLAUDE, SYSTEM, ACCESS, README, ONBOARDING, NEXT_STEP, OPERATING_RHYTHM, DISASTER_LOG, BACKLOG, COLDCALL, twilioCallStatusCallback.js, index.js, verify_access.sh); pre-push `node --check` passed both JS files; post-push poll confirmed Deploy to Firebase + Auto-Index URLs + Validate video assets all green on `c3c9ad71`

## 📦 SHIPPED IN COMMIT 72ed715 (2026-04-21 PM evening)

- Task #41 — `eveningOpsReport` Cloud Function deployed. Nightly 21:00 CDMX digest covering cold email / Calendly / ManyChat / cold calls / audits → Slack + Telegram PDF. HTTPS manual trigger: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/eveningOpsReportOnDemand`
- Task #23 — `dailyStrategist` + `dailyStrategistNow` Cloud Functions deployed. 8am CDMX Gemini-2.0-Flash agent that reads last 24h across all 8 platforms and writes the day's recommended big rock to Firestore `/strategist_recommendations/{date}`. HTTPS manual trigger: `https://us-central1-jegodigital-e02fb.cloudfunctions.net/dailyStrategistNow`
- `aiAnalysisAgent` helper module live — auto-pauses bounce>5%, zero-open 200+, throttles health<90%; escalates 0-reply-500+ + no-show spikes. Actions logged to Firestore `ai_agent_actions/{date}`
- 4 stale Cloud Functions deleted cleanly: `mondayRevenueReviewOnDemand`, `coldCallCalibrationDaily`, `mondayRevenueReview`, `coldCallPostRunSweep`
- **Permanent architectural fix proven:** entire 5-call GitHub Git Data API push (5 blobs + tree + commit + PATCH ref) executed from chrome-devtools MCP using PAT Bearer auth — no sandbox egress needed for api.github.com, no Alex terminal involvement. Commit `72ed715` is the canonical proof point. All 4 GitHub Actions workflows green within ~8 min. Documented in DEPLOY.md §Autonomous Deploy + DISASTER_LOG.md (WIN entry) + new memory `chrome_devtools_github_api_permanent_fix.md`

---

## 🕰️ STALE CHECK

If a P0 or P1 item has been at the top of this queue for **>7 days without movement**, Claude MUST ask Alex to reprioritize before starting work on it (HARD RULE #4). The #1 item above was placed 2026-04-21 — fresh, OK to proceed.

---

## 📝 SESSION RITUAL

**Session start (≤5 min):**
1. `bash tools/verify_access.sh`
2. `cat NEXT_STEP.md | head -30`
3. Grep `DISASTER_LOG.md` for relevant keywords
4. Declare bucket: `[Bucket X] — why this task gets us to a paying client`
5. Go

**Session end (≤3 min):**
1. Mark completed items (move to SHIPPED section)
2. Promote next item to position #1
3. Add anything Alex agreed to during the session
4. Commit + push this file via Git Data API along with other changes
