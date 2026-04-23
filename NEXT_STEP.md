# JegoDigital — NEXT_STEP

> **This file is the living priority queue. The #1 item is TODAY'S work (HARD RULE #4 + #8).**
> **Update at the END of every session:** mark completed items, promote the next rock, add anything new Alex agreed to.
> **Last session update:** 2026-04-23 evening (Money Machine Reddit scraper fixed + real gap identified: Reddit POSTER missing, not drafter — commit `56e9f72`)
> **Maintained by:** Claude + Alex

---

## 🤖 2026-04-23 EVENING — MONEY MACHINE FIX + 4-SESSION "RUN BUSINESS ON PHONE" ROADMAP GREENLIT

**What Alex approved:** full 4-session build-out so he can run the entire agency from his phone using Slack + Notion + Linear. Morning Slack push locked at **7:30 AM America/Mexico_City** (separate from existing 9:00 AM TikTok script cron so daily TikTok script + daily approval queue don't bundle into one overwhelming message).

**What shipped this session (verified via live Apify API):**
1. ✅ Reddit scraper 400 error diagnosed + fixed — `trudax~reddit-scraper-lite` pay-per-event actor was silently auto-setting `maxTotalChargeUsd=$0.000268` per run (lower than container start cost), killing every run in 2.5s. Fix: explicit `&maxTotalChargeUsd=1.00` query param → $30/mo worst case, under $55 Apify cap. Commit `56e9f72fe398e84e0b5d9dd7744a906e5488a445`.
2. ✅ Deploy to Firebase: workflow success, auto-index + notion log green, validate-video-assets failure unrelated to this change.
3. ✅ Apify verification: 3 runs SUCCEEDED post-fix (IDs `PPObd1op`, `eSDEF73T`, `gwZfDsZI`) vs 3 FAILED-in-2.5s runs before fix (IDs `F4lj4DXq`, `3cbC0uYK`, `q0LRCpWZ`). Conclusive proof.

**Audit finding that flips the next priority:** earlier belief that drafter was producing empty `draft_text` was a **moneyMachineStatus reporting bug** — the endpoint was reading `draft_text` from the `opportunities` collection (which doesn't have that field) instead of `opportunity_drafts/{id}`. The newer deployed version correctly exposes an `opportunity_drafts` section — and the actual drafts are **stellar**:
- `reddit_1ssafi5` — 167 words, Gemini 3.1 Pro, status `approved_needs_manual_post` (ROTTING, never posted)
- `reddit_1ssc6q7` — 162 words, Gemini 3.1 Pro, status `approved_needs_manual_post` (ROTTING, never posted)
- `reddit_1stgpyp` — 175 words, score 92, status `awaiting_approval_telegram` (BURIED in Telegram, 3-nudge cap already hit)

**So the real gap = Reddit POSTER is missing.** Drafter + classifier + scraper + approval path all work. The 2 approved drafts are stranded with nowhere to go.

---

## 🎯 TODAY'S BIG ROCK (HARD RULE #8) — 2026-04-24 (SESSION 1 of 4)

> **Build the Slack Mirror + Reddit Posting path so Money Machine produces its first real public reply.**
>
> Specifically:
> 1. New Cloud Function `slackDraftMirror` — every draft that reaches `awaiting_approval_telegram` ALSO posts to Alex's Slack DM with: (a) the full draft text, (b) the Reddit thread URL as tappable link, (c) a "Copy to clipboard" visual cue. Phone-native.
> 2. New Cloud Function `markDraftPosted` — HTTPS endpoint Alex hits (or a Slack slash-command) after he pastes the reply on Reddit from his phone. Moves draft from `approved_needs_manual_post` → `posted`. Records the live Reddit URL so we can track engagement in Session 3.
> 3. Hydrate the 3 existing stuck drafts into Slack so they're not wasted — Alex posts them from his phone manually over the next 24h as proof-of-pipeline.
> 4. Replace the Telegram-only approval with Slack-primary, Telegram-backup (Telegram was getting buried per 2026-04-23 recovery-cron fix — Slack in-app is more reliable).

**Bucket:** B (generate qualified leads) + A (first approved reply = first real test of inbound Money Machine conversion)
**Success criteria (today):** 3 existing drafts mirrored to Slack DM, Alex posts 2 of them from his phone, both get Reddit URLs logged, opportunities transition to `posted` status. Fresh Reddit scraper cron at :15 past hour pulls new opps, 2+ more drafts generated, also mirrored to Slack.

---

## 📅 4-SESSION ROADMAP — PHONE-FIRST AGENCY AUTOPILOT

| Session | What ships | How Alex experiences it |
|---|---|---|
| **S1 (2026-04-24)** | Slack mirror + Reddit posting path + Telegram backup | First 2 real Reddit replies posted from phone, pipeline proven end-to-end |
| **S2 (2026-04-25)** | `dailyTaskDispatcher` @ 07:30 CDMX + Slack List **🎯 Today** + Notion + Linear sync | First 7:30 AM Slack morning ritual happens next morning |
| **S3 (2026-04-26)** | Add X/Twitter + Quora (Firecrawl) + BiggerPockets (Firecrawl) + Google Reviews scraper lanes | Same 1 Slack view, 4x volume of buyer-intent signals |
| **S4 (2026-04-27)** | FB Groups semi-auto + IG hashtag Apify scraper + TikTok viral scraper feeding daily script ideas + YouTube weekly card + Linear fully wired + `apifyBudgetCheck` cron | Full phone autopilot live — laptop not required |

**Safety guards baked into every session:**
- Reddit: MAX 3 replies/day, no link in body, aged account only
- X: MAX 5/day, real account, residential proxies via Apify
- FB Groups: manual-click only (screenshots to Slack, Alex taps on phone)
- IG: Meta Graph API + ManyChat only
- TikTok: Content Posting API + 3/day cap + 3-min gaps
- YouTube: Data API + 20 comments/day cap
- LinkedIn: Sales Nav manual only OR Apify read-only (deferred to S4 or later)
- Quora + BiggerPockets + HN: LOW ban risk, genuine value only
- Google Reviews: read-only scrape, zero account interaction
- Budget: `apifyBudgetCheck` cron pauses non-critical scrapers if MTD > $45

---

---

## 🎬 2026-04-23 PM — TROJAN VIDEO FACTORY — DELIVERY SCAFFOLD LIVE IN PRODUCTION ✅

**New Trojan Horse hook: "3 Videos Gratis" (Listing Video Factory).** Alex approved the pivot + the shorter Step-1 email copy with `{{firstName}}` + `{{companyName}}` personalization. Style presets: Cinemático, Lifestyle, Luxury. Delivery window: 24h. Photos per video: 3-10.

**Shipped + verified live in commit `b37fecf4a940`:**
1. ✅ `cold-email-sequences/TROJAN_VIDEOS_2026-04-23.md` — full 5-step Spanish sequence + AI reply agent rules + pre-launch checklist.
2. ✅ `website/trojan-setup/videos.html` — onboarding form page (dark theme, 3-10 photo dropzone, 3 style cards, lang toggle, signed-URL upload pattern). Live: `https://jegodigital.com/trojan-setup/videos` → HTTP 200.
3. ✅ `website/functions/trojanVideoOnboarding.js` — two HTTPS endpoints:
   - `trojanVideoInit` → `{"ok":false,"error":"firstName_required"}` on empty POST (function alive, validation working).
   - `trojanVideoFinalize` → `{"ok":false,"error":"leadId_required"}` on empty POST (function alive, validation working).
   - CORS preflight OPTIONS → HTTP 204 on both.
4. ✅ `DISASTER_LOG.md` — 2 new WIN entries: (a) Firebase Web SDK config gap → signed-URL pivot, (b) 36h stale `.git/index.lock` + UID mismatch → GitHub Git Data API path reproven. Also restored the "Money Machine Telegram recovery cron" entry that was accidentally overwritten (patched in commit `44dbc0ff`).
5. ✅ `SYSTEM.md` §1.3 — `trojanVideoInit` + `trojanVideoFinalize` added to HTTP endpoints inventory.
6. ✅ `BUSINESS.md` — Trojan Horse entry section updated to document the "3 Videos Gratis" default hook (videos as lead magnet → Service 1 upsell 2 weeks later).

**Deploy proof (HR-6 compliant):**
- GitHub Actions run `24819006234` — Deploy to Firebase: ✅ success, Validate video assets: ✅ success, Auto-Index URLs: ✅ success, Smoke Test: ✅ success.
- 5/5 live HTTPS probes green (hosting + init OPTIONS + init POST + finalize OPTIONS + finalize POST).

**HARD BLOCK on campaign activation — still remaining before any cold email goes out:**
- [ ] End-to-end test with 1 real test lead (upload 3 photos → verify signed-URL PUT succeeds → Telegram alert fires → Firestore doc lands with `status=submitted`)
- [ ] Wire `processTrojanVideoRequest` Firestore trigger (reads style preset + photos → fires veo-flow pipeline → writes MP4 URLs back → sends delivery email)
- [ ] First 3 renders manually QA'd by Alex
- [ ] Create Instantly campaign `trojan_videos_mx_v1` in **draft mode only** — do NOT activate until all above pass

**Next step for Alex:** Open `https://jegodigital.com/trojan-setup/videos` in a browser, submit a test lead with 3 photos, confirm the Telegram ping arrives and a `trojan_video_leads/{leadId}` Firestore doc appears with `status=submitted`. That closes the onboarding-side verification and unblocks the render-pipeline wiring.

---

## ✅ 2026-04-23 early-AM WIN — Firebase deploy health fully restored

**Problem:** After the 2026-04-22 PM batch-split fix (commit `27132638`), 3 functions kept failing GCF health check across every retry: `dailyDigest`, `coldCallMidBatchCheck`, `coldEmailDailyReport`. The batch-split unstuck the other 57 functions but these 3 were stuck in a different failure mode (consistent, not transient).

**Fix:** Added `if (!admin.apps.length) admin.initializeApp();` to the top of each of the 3 standalone module files. Pushed as commit `057fc15f` via GitHub Git Data API (sandbox-autonomous, HR-13 compliant). Run #89 BATCH 1 deployed all 3 previously-crashing modules on the FIRST TRY — conclusive HR-6 proof.

**Bonus:** BATCH 2 hit an unrelated transient flake on `sendT10minReminders`. The retry step (added in the 2026-04-22 batch-split commit) auto-healed it. Proves the retry infrastructure works exactly as designed.

**New permanent rule:** Added to `DEPLOY.md §Guard rails before pushing` as rule #5 — every standalone `.js` module that imports `firebase-admin` MUST include the cold-start init guard. Logged to `DISASTER_LOG.md` 2026-04-23.

**Tech-debt note:** 24 other module files in `website/functions/` also import `firebase-admin` without the guard (audit.js, auditPipeline.js, brevoNurture.js, calendlyWebhook.js, dailyStrategist.js, eveningOpsReport.js, instantlyReplyWatcher.js, mondayRevenueReview.js, etc.). They deploy fine today but are technically vulnerable to the same cold-start race. Not urgent — patch opportunistically as we edit each file. P3 backlog item.

---

## 🎯 TODAY'S BIG ROCK (HARD RULE #8) — 2026-04-23

> Cold-call 100 MX real estate agencies from the pre-built target list, route positive replies to Calendly/WhatsApp/Sofia.
>
> ✅ **2026-04-22 PM shipped (LinkedIn + GMaps pipeline):**
> 1. Apify LinkedIn Profile Search — 30/36 queries submitted (6 titles × 6 cities), 256 raw profiles fetched.
> 2. HR-5 6-gate filter — 37/256 decision-makers kept (14.5%), rejected: weak_title(114), not_mx(105), no_re_signal(68), rubbish(31), dup_email(8).
> 3. Hunter waterfall — 4 LinkedIn emails resolved (12/37 got domain via Google Search Scraper).
> 4. **Phone pivot** — LinkedIn yielded 0 phones (profiles rarely expose them). Pivoted to Apify `compass~crawler-google-places` scraper — 240 GMaps listings across 9 MX cities, 186 with phones, 148 with websites, 79 with emails.
> 5. Filter + score + merge → **149 cold-call-ready leads** in `leads/COLD_CALLING_TARGETS_2026-04-23.md` (83 hot / 28 warm / 21 lukewarm / 13 cold / 4 LinkedIn direct).
>
> Today specifically:
> - (1) Open `leads/COLD_CALLING_TARGETS_2026-04-23.md` — pick top 40 `hot_gmaps` by score (reviews ≥100 + 4.5+ rating + major brand).
> - (2) For each: copy the pre-built `node tools/elevenlabs_trigger_call.cjs <phone> "<Company>" --offer=C` command and fire.
> - (3) Track replies in `fb_leads_tracker.csv` columns `source=gmaps_call`, `status`, `next_step`.
> - (4) If ≥3 positive replies → push to Calendly same day.
> - (5) Evening: enrich the 79 emails to Instantly `Trojan Horse` campaign with HR-6 baseline + delta check.

**Bucket:** B (generate qualified leads) + A (close this week — live voice is highest intent)
**Success criteria (today):** 40 dials attempted, 5+ positive replies logged, 2+ Calendly bookings OR 5+ WhatsApp conversations opened. Email subset (79 leads) uploaded to Trojan Horse campaign `cd9f1abf-3ad5-460c-88e9-29c48bc058b3`.

---

## 🔁 DAILY RITUALS (run every morning — 25 min total)

**FB Groups Hybrid Prospecting** (launched 2026-04-22)
- 7:00 AM — open FB app on phone, scroll priority groups 1-4 in `facebook-groups/FB_GROUPS_PLAYBOOK.md`
- Screenshot 8-12 hot-signal posts (post + poster profile)
- Paste all into Claude chat
- Claude returns personalized DMs + FB message links
- Batch-send from phone (15 DMs/day max — HR#5 style ceiling)
- Replies → move to WhatsApp → Sofia → Calendly
- Weekly review Mondays in `BUSINESS_REVIEW/2026-W<NN>.md`
- 🚫 DISASTER_LOG 2026-04-22: Chrome MCP scanning blocked by Meta bot-detection. Workflow is phone-first, NEVER Chrome automation.
- Infra: `facebook-groups/FB_GROUPS_PLAYBOOK.md` + `fb_dm_templates.md` + `fb_leads_tracker.csv`
- **Target:** 2 Calendly calls/day within 7-14 days

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
