# JegoDigital Gap Detection — 2026-05-05

> **Owner:** Claude (Gap Detector pass — verified, no bare assertions per Rule 1 + Rule 7)
> **Method:** live API pulls + repo grep + Firestore reads in this session, in addition to the marketing state audit (`outputs/marketing_state_audit_2026-05-05.md`) which already verified channel-level state today.
> **Frame:** every gap below is cited to a specific tool call or file path. Gap = documented intent with no enforcement OR capability claim with no working backing OR dead/duplicate code. Per Rule 1, anything not verified is dropped.
> **Replaces:** the prior session's "G1-G12" inside the marketing state audit. This document goes one level deeper — into the **rule-vs-validator gap, the dead-code gap, and the cron-naming gap** — which the channel-level audit didn't cover.

---

## 📋 Executive Summary

JegoDigital has **221 Cloud Function exports**, **12 GitHub Actions workflows**, **50+ `pubsub.schedule` crons in code**, **16 Cowork scheduled tasks**, **22 Meta Custom Audiences**, **11 ManyChat flows**, **5 ElevenLabs agents**, **128 .js files in `website/functions/`** outside `node_modules`. The infrastructure surface area is enormous.

**The single most important pattern this scan surfaced:** a class of **phantom rules** — rules that cite a validator script or Cloud Function as their enforcement mechanism, when the file does not exist on disk. The marketing-state audit caught the channel-level dormancy. This audit catches the **rule-level enforcement vacuum** behind it. As of this scan:

- **3 phantom Cloud Functions** referenced by rules (`verifyClientProofMonthly`, `weeklyRevenueReview` under that exact name, and the missing `monday-revenue-review.yml` workflow trigger)
- **5 phantom validator scripts** referenced by Rules 18 / 19 / 20 / 22 / 24 (`em_dash_audit.sh`, `ai_tells_lint.sh`, `check_collaboration_tone.sh`, `ocr_audience_check.sh`, `common/logEvent.js`)
- **1 dead-code Cloud Function** — `syncBrevoToFbCustomAudiences.js` exists with a full `pubsub.schedule("0 9 * * *")`, was modified TODAY (2026-05-05 14:23), but **is not registered in `index.js`** and therefore never deploys. The 1,250-contact warm Brevo pool stays locked out of FB retargeting indefinitely.

The marketing-state audit's G1-G12 are the operational gaps. Below are the **structural gaps that allow operational gaps to persist undetected** (no validator → no alert → drift compounds). Both lists must be closed for the system to self-heal.

---

## 📊 Inventory totals (verified this session)

| Surface | Count | How verified |
|---|---|---|
| Cloud Function exports in `website/functions/index.js` | **221** | `grep -cE "^exports\." website/functions/index.js` |
| `.js` files in `website/functions/` (excl. node_modules) | **128** | `find … -maxdepth 2 -name "*.js" -not -path "*/node_modules/*"` |
| GitHub Actions workflows | **12** | `ls .github/workflows/` |
| `pubsub.schedule` crons in functions code | **50+** | `grep -rn "pubsub.schedule" website/functions/*.js` |
| Cowork scheduled tasks | **16** | `mcp__scheduled-tasks__list_scheduled_tasks` (live) |
| Meta Custom Audiences in `act_968739288838315` | **22** | `mcp__meta-ads__meta_list_custom_audiences` (live) |
| Meta active campaigns | **0** | `mcp__meta-ads__meta_list_campaigns(status:ANY)` — only 1 paused (live) |
| ManyChat flows on JegoDigital page | **11** | `mcp__manychat__manychat_list_flows` (live) |
| Instantly campaigns (per audit) | **23** (7 active, 11 paused, 3 draft, 2 completed) | `list_campaigns` (live, marketing audit 2026-05-05 04:38) |
| Instantly mailbox accounts | **10** (9 active, 1 paused) | per audit |
| `tools/` shell scripts | **48** total, of which **6** are HR validators | `ls tools/` |
| `skills_patches/` files | **30** items (skills + xrefs) | `ls skills_patches/` |
| `.claude-knowledge/` files | **5** (clients, accounts, campaigns, architecture, workflows) | per audit + Rule 25 |
| Hard rules in `CLAUDE_RULES.md` | **25 rules + 5 gates** | full Read of file |

---

## 🟥 Hard Gaps — must build (revenue-impact / risk-of-disaster)

| # | Name | Evidence | Impact | Build cost |
|---|---|---|---|---|
| **HG-1** | **`syncBrevoToFbCustomAudiences.js` is dead code** | File exists `website/functions/syncBrevoToFbCustomAudiences.js` (11,783 bytes, modified 2026-05-05 14:23), exports `syncBrevoToFbCustomAudiences` (line 281) + `syncBrevoToFbCustomAudiencesOnDemand` (line 298). `grep "Brevo.*Fb\|BrevoToFb" website/functions/index.js` returns ZERO matches. Sister cron `syncInstantlyToFbCustomAudiences` IS wired (lines 2916-2918). | Bucket B / P0. Brevo nurture pool = 1,120 sends / 374 unique opens / **41.7% open rate** last 30d (warmest audience JegoDigital owns). Without the wire, every paid retargeting layer is starved. The marketing audit's G8 said "missing" — truth is worse: it was **built but never deployed**. | 3 lines in index.js + 1 push (≈10 min) |
| **HG-2** | **`tools/check_collaboration_tone.sh` — phantom validator (Rule 19 + Rule 20 cite it)** | `CLAUDE_RULES.md` Rule 19 (line 324): `tools/check_collaboration_tone.sh greps JegoDigital + niche keyword in first 200 chars. Fail = block send.` `ls tools/ \| grep -i collaboration\|tone\|niche` returns empty. Disaster proof: 2026-05-04 PM Sofia FB ad burned $4.13 because Rule 19/20 weren't enforced — the validator that was supposed to prevent it does not exist. | Bucket B / P0. Every cold email Step 1, Sofia opener, FB ad body, Calendly description, Lead Form Thank You, ManyChat welcome, ElevenLabs cold-call opener currently relies on Claude self-policing. Without the validator, drift to vendor-pitch is undetectable in CI/CD. Cost: a single ad disaster repeat = $4-50/run. | 30-line bash script + 1 push (≈20 min) |
| **HG-3** | **`verifyClientProofMonthly` — phantom Cloud Function (Rule 10 cites it)** | `CLAUDE_RULES.md` Rule 10 (line 192): `Monthly Cloud Function verifyClientProofMonthly (1st of month) pulls all 11 cited stats, writes /knowledge_base/client_proof_<YYYY-MM>.md, posts Slack digest. If metric drops >20%, alert + remove from cold-email copy until reverified.` `find website/functions -name "*ClientProof*"` returns empty. `grep "verifyClientProofMonthly" website/functions/` returns empty. | Bucket D / P1 but high risk. Living Riviera Maya "Top-3 in ChatGPT for best real estate agencies in Playa del Carmen", Sur Selecto AMPI Presidente Ejecutivo, Flamingo 88% AI automation rate — all could drift silently and JegoDigital would still be quoting them in cold email until a client called us out. | ~150-line Cloud Function + cron + 1 push (≈60 min) |

---

## 🟧 Soft Gaps — should build (next 7-14 days)

| # | Name | Evidence | Impact | Build cost |
|---|---|---|---|---|
| **SG-1** | `validator_scripts/em_dash_audit.sh` — phantom (Rule 18) | `CLAUDE_RULES.md` Rule 18 (line 282): `Validators: validator_scripts/em_dash_audit.sh + validator_scripts/ai_tells_lint.sh.` `ls validator_scripts/` → directory does not exist. | Em-dashes have been called out as an "AI tell" for years; without this lint, every Cowork-generated cold email risks looking AI-authored. Rule 18 disaster (2026-05-04 Sofia ad copy) cited "em-dashes swept" as a remediation step — but the script that should sweep them is missing. | 20-line bash, 10 min |
| **SG-2** | `validator_scripts/ai_tells_lint.sh` — phantom (Rule 18) | Same Rule 18 reference as SG-1. | "Delve", "leverage", "robust", "in conclusion", "it's important to note" — common AI tells that erode credibility in outbound. No automated gate exists. | 50-line bash with token list, 20 min |
| **SG-3** | `validator_scripts/ocr_audience_check.sh` — phantom (Rule 22) | `CLAUDE_RULES.md` Rule 22 (line 351): `Validator: validator_scripts/ocr_audience_check.sh (OCR confirms JegoDigital + niche keyword visible).` Directory missing. | Rule 22 is the 2-second audience-clarity gate. Without OCR, every paid creative ships on Claude self-grading. Tier 23 (paid ads = 10/10 every axis) becomes unenforceable. | 60-line Python with `pytesseract`, 45 min |
| **SG-4** | `website/functions/common/logEvent.js` — phantom helper (Rule 24) | `CLAUDE_RULES.md` Rule 24 (line 372): `use website/functions/common/logEvent.js helper`. `ls website/functions/common/` → directory does not exist. | Rule 24 is "every automation logs to Telegram + Slack on success and failure." Without the shared helper, every new function rolls its own logging — already drifting (some functions have no logging, some have ad-hoc Telegram calls). | 80-line JS shared helper + retrofit ~40 callers, 90 min |
| **SG-5** | Sofia ManyChat → `sofia_conversations` mirror not wired | Marketing audit Phase 1 §D item 18: 10 consecutive days `samples: 0 · note: "No sofia_conversations mirror data and ManyChat API returned empty. Wire the ManyChat webhook mirror."` | We can't measure Sofia's WA/IG funnel ROI. Funnel changes are flying blind. | ~80 lines in `whatsappCloudInbound.js` (dual-write) + ManyChat webhook subscription, 90 min |
| **SG-6** | `monday-revenue-review.yml` GH Actions trigger missing | `cronHealthMonitor.js` line ~150 expects workflow_filename `monday-revenue-review.yml`; `ls .github/workflows/` → missing. The Cloud Function `mondayRevenueReview` IS exported (index.js:2326) and IS pubsub-scheduled `0 9 * * 1` (line 1310 of file). | Belt-and-suspenders trigger missing — if Cloud Function fails, no GH Actions backup runs. Per Rule 8 the Monday review is critical for revenue visibility; redundant trigger reduces single-point-of-failure risk. | 25-line workflow YAML, 15 min |
| **SG-7** | WhatsApp Cloud token returning 403 | Marketing audit Phase 1 §D item 17: `wa_cloud_conversations` last_sent_status=403 = expired/invalid token. | Outbound WA via Cloud API is dead. Sofia IS using ManyChat for inbound, but ANY direct WA Cloud send (e.g., post-call follow-up via `postCallWhatsAppFollowup.js`) fails silently. | 5 min token rotation in GH Secrets + redeploy |
| **SG-8** | Lead-finder pipeline pool stuck at 102 for 5+ days | Marketing audit Phase 1 §I item 39: `lead_topup_summaries` 5 days `candidates_found: 0`. SerpAPI + DataForSEO firing, returning empty OR everything blocklisted. | Top of funnel for cold email is dead. Even with revived sender capacity, no fresh leads to ship. | 1-2 hr diagnostic + fix |
| **SG-9** | Cold-call dialer fired 0 calls 9 of last 10 days | Marketing audit Phase 1 §F item 26: `cold_call_daily_summaries` flat-zero since 2026-04-26. `cold_call_leads` queue = 3 docs all `qa_e2e_test`. | One of the highest-ROI channels (33 leads_processed on 2026-04-25 → 2 audit_requests → 2 conversations) is silent. ✅ Already scheduled to fire today 16:00 UTC per `cold-call-batch-2026-05-05` task. | 0 min today (queued); 30 min if fails |
| **SG-10** | FB Pixel only on 1 of 33 HTML pages | Marketing audit Phase 1 §A items 1-3. `grep -l "2356041791557638" website/*.html` returned only `index.html`. 32 pages MISSING. | Every retargeting Custom Audience (`JD_Website_*` 4 audiences) starves at ~20-person size because pixel doesn't fire on the high-intent pages they target. | 2 hr — write a shared partial or build-step injection |
| **SG-11** | Apify hiring intent — `intent_runs` 0 signals 5 runs | Marketing audit Phase 1 §I item 38. `notes: "queries=12 fetched=0 icp_rejected=0"` — runs firing but fetching zero. | LinkedIn high-intent layer (the `JD_LinkedInHiring_46` Custom Audience) is staffed by code that hasn't found a single hiring signal in 5 days. Either SerpAPI quota burn or query/locale drift. | 1 hr diagnostic |

---

## 🟨 Cleanup Gaps — kill the duplicate / archive the dormant

| # | Name | Evidence | Action |
|---|---|---|---|
| **CG-1** | 3 active Instantly campaigns at 0% reply (Auditoría Gratis 402 sent · Audit_Trojan_MX_Supersearch_v1 395 sent · signal_outbound_mx 180 sent) | Marketing audit §B item 7. | Pause all 3, concentrate the 300/day warmup pool behind Trojan Horse + Lanzamiento Preventa (the only 2 producing replies) + USA Real Estate Devs (new). |
| **CG-2** | 22 Custom Audiences sitting unused (only the 1 paused FB campaign) | This audit + marketing audit. | After HG-1 ships, the next FB ad MUST target `JD_AllVerified_2238` (retarget) + `JD_LinkedInHiring_46` (high intent) + `JD_LAL_1pct_MX_InstantlyCold_2026-05` (cold layer). Tied to G2 in marketing audit. |
| **CG-3** | Cron schedule duplicates at `0 9 * * *` | `grep` shows 4 functions schedule at `0 9 * * *` UTC: `igTokenAutoRefresh` (monthly 1st), `syncInstantlyToFbCustomAudiences`, `syncBrevoToFbCustomAudiences` (when wired), `mobileCommandCenter`. Thundering-herd risk — 4 functions hit Firestore + external APIs simultaneously. | Stagger: Instantly sync 09:00, Brevo sync 09:15, mobileCommandCenter 09:30. |
| **CG-4** | Cron schedule duplicates at `0 8 * * *` | 3 functions: `phoneLeadsEnrichmentSweep`, `dailyGcpCostReport`, `leadFinderAutoTopUp`. All hit external APIs at the same minute. | Stagger to :00, :10, :20. |
| **CG-5** | Stale `NEXT_STEP.md` — last_session_update 2026-05-06 06:00 (TOMORROW dated, content references 2026-04-29 rolled rock) | Read of file. Today's big rock cites `outputs/morning_briefing_creative_section_2026-05-05.md` which exists; but the rolled rock from 2026-04-29 (`morningBriefCron`) is now 7 days stale. Per Rule 5, items >7 days at top must be reprioritized. | Refresh end-of-session per Rule 5 ritual; promote one of the 3 builds shipped today. |
| **CG-6** | Killed Instantly campaign zombie data | Marketing audit references campaigns deleted from UI but referenced in old skill prompts (e.g., `Redes Sociales DELETED — do NOT recreate`). | Single source of truth: `.claude-knowledge/campaigns.md` — verify against this every Monday. ✅ Already canonical per Rule 25. |
| **CG-7** | `_archive/` folder in `skills_patches/` and historical CHANGELOG files | `ls skills_patches/` shows `_archive`, `instantly-cold-outreach_CHANGELOG.md`, `instantly-cold-outreach_PLAYBOOK_v2.md`, `instantly-cold-outreach_SKILL_v3.md`, `instantly-cold-outreach_SUPERSEARCH_PLAYBOOK.md`, `instantly-cold-outreach_v4.md`. Multiple versions of the same skill. | Per the existing `cleanup-watcher` weekly cron (Sun 22:00 CDMX), this is already auto-handled. No action needed today. |

---

## 🟩 Already covered (no gap — for completeness)

| # | Item | Status | Evidence |
|---|---|---|---|
| AC-1 | Rule 1/2/3 — `tools/verify_access.sh` | ✅ Exists, tested by audit pre-commit | Marketing audit ran it this session |
| AC-2 | Rule 6 — `tools/lead_quality_gate.sh` | ✅ Exists | `ls tools/` |
| AC-3 | Rule 6 Gate 7 — `tools/check_campaign_variable_coverage.sh` | ✅ Exists | `ls tools/` |
| AC-4 | Rule 17 — `tools/verify_no_tracking.sh` | ✅ Exists | `ls tools/` |
| AC-5 | Rule 8 — `mondayRevenueReview` Cloud Function | ✅ Wired (`index.js:2325-2327`) + scheduled `pubsub.schedule("0 9 * * 1")` (`mondayRevenueReview.js:1310`) | grep + Read |
| AC-6 | Rule 25 — 5 `.claude-knowledge/` files | ✅ All present, dated 2026-05-04 PM | `ls .claude-knowledge/` |
| AC-7 | `tools/verify_lead_personalization.sh` | ✅ Exists (HR-5 Gate 7 helper) | `ls tools/` |
| AC-8 | `tools/verify_rewrite_shipped.sh` | ✅ Exists | `ls tools/` |
| AC-9 | Sister cron `syncInstantlyToFbCustomAudiences` | ✅ Wired + scheduled `0 9 * * *` | `index.js:2916-2918` |
| AC-10 | `cronHealthMonitor` (meta-monitor) | ✅ Wired + audits 13 named crons + 3 GH workflows | `cronHealthMonitor.js` |
| AC-11 | Cleanup-watcher weekly cron | ✅ Active Cowork task `cleanup-watcher-weekly-cdmx` (Sun 22:00 CDMX) | `mcp__scheduled-tasks__list_scheduled_tasks` |
| AC-12 | Daily morning brief Cowork task | ✅ `jego-daily-morning-brief-8am` enabled, last fired 2026-05-05 | live scheduled-tasks list |
| AC-13 | `mobileCommandCenter` (the "missing morningBriefCron" from NEXT_STEP) | ✅ Wired in index.js + 3 schedules (9am UTC + 14:00 UTC + 21:00 UTC) | grep on index.js (NEXT_STEP rolled rock is OUT OF DATE) |
| AC-14 | Brevo nurture audit pipeline | ✅ Working — 41.7% open rate verified live | marketing audit Phase 1 §C item 11 |
| AC-15 | Calendly webhook + scheduled emails + Brevo recovery | ✅ Working — Paola Rodríguez booking 2026-04-30 confirmed | marketing audit Phase 1 §J |
| AC-16 | Audit funnel (`submitAuditRequest` + `processAuditRequest`) | ✅ Working — jegodigital.com scored 79 in 95s | marketing audit Phase 1 §G item 31 |

---

## 🥇 Top 3 to build NOW (HR-3 revenue-first prioritization)

### #1 — Wire `syncBrevoToFbCustomAudiences.js` into `index.js`  ⏱ 10 min · Bucket B

**What:** add `require + exports.syncBrevoToFbCustomAudiences` lines to `index.js`, mirroring the sister cron `syncInstantlyToFbCustomAudiences` at lines 2916-2918. Push to main → `deploy.yml` deploys → cron fires daily at 09:00 UTC tomorrow.

**Why this is #1:** the marketing audit identified Brevo nurture as JegoDigital's strongest unit-economics asset (41.7% open, 0 spam, 0 unsubs). Without this wire, none of those 1,250 warm contacts are reachable in FB retargeting. The sister Instantly→FB cron has been compounding for ~30 days; the Brevo equivalent has been ZERO days. Smallest unit of work, biggest unlock.

**Build proof required (HR-6):**
1. Edit `website/functions/index.js` — diff visible
2. Push to main via Git Data API
3. `gh run view` shows `deploy.yml` `conclusion: success`
4. Verify cron registered: `gcloud scheduler jobs list` shows `firebase-schedule-syncBrevoToFbCustomAudiences-us-central1` (or equivalent)

---

### #2 — Build `tools/check_collaboration_tone.sh`  ⏱ 20 min · Bucket B

**What:** 30-line bash script that takes a message file (or `--text` string) as input and verifies in the first 200 characters: (a) `JegoDigital` token present, (b) one of `inmobiliaria|real estate|agencia|desarrollador|developer|broker` present, (c) zero of the Rule 18 banned words (`sell|pitch|buy|deal|offer|package|price|upgrade|discount|risk-free|100% guarantee|money-back|limited time|spots left|last chance|urgent|don't miss|close|purchase|sign|contract`), (d) ≥3 collaboration words from `collaborate|partner|together|fit|learn|build with you|alongside`. Exit 0 on pass, 1 on fail. Print which axis failed.

**Why this is #2:** Rules 19 and 20 were locked 2026-05-04 specifically because of the Sofia FB ad disaster ($4.13 burned in 2 hours, no JegoDigital intro, vendor-pitch tone). The validator was named in the rule body as the enforcement mechanism. It does not exist. Until it exists, the same disaster can repeat tomorrow on the next channel.

**Build proof required (HR-6):**
1. Create `tools/check_collaboration_tone.sh` (executable)
2. Run on 3 known files: a passing collaboration email, a failing vendor-pitch, an empty file → all return correct exit codes
3. Push to main

---

### #3 — Build `verifyClientProofMonthly` Cloud Function  ⏱ 60 min · Bucket D (infrastructure that prevents trust loss)

**What:** new `website/functions/verifyClientProofMonthly.js` that runs `pubsub.schedule("0 9 1 * *")` (1st of month, 09:00 UTC). For each client in `.claude-knowledge/clients.md`, hits the appropriate live source (DataForSEO Maps for star ratings + reviews, ChatGPT screenshot diff for Living Riviera Maya AEO citation, GSC for organic traffic deltas), writes `/knowledge_base/client_proof_<YYYY-MM>.md`, posts Slack digest to `#all-jegodigital`. If any cited metric drops >20% vs prior month → critical-severity alert + Telegram urgent ping. Wire into `index.js`.

**Why this is #3:** Rule 10 is the freshness invariant for every social-proof number JegoDigital uses in cold email, FB ads, the website showcase, the proposal deck. Without the cron, claims drift silently and the agency over-promises into reality (or worse, gets called out by a prospect who Googled the claim). The cost of a single drift-induced trust loss is enormous — the cost of the cron is one afternoon. Bucket D in HR-3 framework but high-risk.

**Build proof required (HR-6):**
1. Create `website/functions/verifyClientProofMonthly.js`
2. Wire `require + exports` in `index.js`
3. Push to main, `deploy.yml` succeeds
4. Run the on-demand variant (`verifyClientProofMonthlyOnDemand`) once via curl — confirms it pulls live data and writes `/knowledge_base/client_proof_2026-05.md`

---

## 🚧 What this audit explicitly did NOT verify (deferred)

Per Rule 1 (no fabrication), these items were not verified live this session and are flagged for follow-up:

- Brevo full list inventory + sizes (no `lists_get_lists` MCP loaded)
- Brevo template 71-76 status
- Meta Lead Forms 1672760796990647 + 945030538512124 (no `meta_list_lead_forms` MCP)
- Live AEO presence in ChatGPT/Perplexity/Gemini (deferred per Rule 19 — research before claiming)
- ElevenLabs 5 agents live config (no `elevenlabs__list_agents` MCP loaded)
- Twilio call records (no Twilio MCP loaded)
- DataForSEO + Ahrefs backlink profile
- Cloud Scheduler live state (`gcloud scheduler jobs list` not run — relied on grep of `pubsub.schedule` in source instead)
- IG/TikTok/YouTube/LinkedIn organic-content metrics (no analytics MCPs loaded)

These should be the next audit pass, but **none block the top-3 ship today**.

---

## 🧾 Verification appendix (sources for every claim)

| Claim | Tool / file / API | Time |
|---|---|---|
| 221 exports in index.js | `grep -cE "^exports\." website/functions/index.js` | 2026-05-05 |
| 128 .js files in functions/ excl node_modules | `find … -maxdepth 2 -name "*.js"` | 2026-05-05 |
| 12 GH workflows | `ls .github/workflows/` | 2026-05-05 |
| 50+ pubsub.schedule crons | `grep -rn "pubsub.schedule" website/functions/*.js` | 2026-05-05 |
| 16 Cowork scheduled tasks | `mcp__scheduled-tasks__list_scheduled_tasks` | 2026-05-05 |
| 22 Meta Custom Audiences | `mcp__meta-ads__meta_list_custom_audiences(act_968739288838315)` | 2026-05-05 |
| 11 ManyChat flows | `mcp__manychat__manychat_list_flows` | 2026-05-05 |
| `syncBrevoToFb` exists with 11,783 bytes, modified 2026-05-05 14:23 | `ls -la website/functions/syncBrevoToFbCustomAudiences.js` | 2026-05-05 |
| `syncBrevoToFb` exports lines | `grep -n "^exports\." website/functions/syncBrevoToFbCustomAudiences.js` | 2026-05-05 |
| `syncBrevoToFb` NOT wired in index.js | `grep "Brevo.*Fb" website/functions/index.js` (empty) | 2026-05-05 |
| Sister `syncInstantlyToFb` IS wired at index.js:2916-2918 | `grep -n syncInstantly website/functions/index.js` | 2026-05-05 |
| `verifyClientProofMonthly` does not exist | `find … -name "*ClientProof*"` empty + `grep "verifyClientProofMonthly" website/functions/*.js` empty | 2026-05-05 |
| `tools/check_collaboration_tone.sh` does not exist | `ls tools/ \| grep -i collaboration\|tone` empty | 2026-05-05 |
| `validator_scripts/` directory does not exist | `ls validator_scripts/` empty | 2026-05-05 |
| `website/functions/common/` directory does not exist | `ls website/functions/common/` empty | 2026-05-05 |
| `mondayRevenueReview` IS exported at index.js:2325-2327 | `grep -n "mondayRevenueReview" website/functions/index.js` | 2026-05-05 |
| `mondayRevenueReview` IS scheduled `0 9 * * 1` at file:1310 | `grep -n schedule website/functions/mondayRevenueReview.js` | 2026-05-05 |
| `monday-revenue-review.yml` workflow MISSING | `ls .github/workflows/` (no match) | 2026-05-05 |
| Brevo 30d 1,120 / 896 delivered / 374 opens / 41.7% open rate | marketing audit §C item 11 (`campaign_analytics_get_aggregated_smtp_report`) | 2026-05-05 |
| Sofia mirror dead 10 consecutive days | marketing audit §D item 18 (Firestore `sofia_audits`) | 2026-05-05 |
| WA Cloud last_sent_status=403 | marketing audit §D item 17 (Firestore `wa_cloud_conversations`) | 2026-05-05 |
| Cold-call 0 leads_processed 9 of 10 days | marketing audit §F item 26 (Firestore `cold_call_daily_summaries`) | 2026-05-05 |
| Lead-finder pool stuck at 102 for 5+ days | marketing audit §I item 39 (Firestore `lead_topup_summaries`) | 2026-05-05 |

---

**End of gap detection.** Top-3 build status appended below as artifacts ship.

---

## ✏️ ADDENDUM 2026-05-05 14:35 — HG-1 corrected (Rule 1 + Rule 11)

**Initial claim (HG-1):** "`syncBrevoToFbCustomAudiences.js` is dead code — file exists with cron but is not registered in `index.js`."

**Corrected finding (verified live by re-grep with broader pattern):** the file IS partially wired in `index.js` at lines 3015-3018, but the scheduled export is **intentionally commented out** awaiting Alex's 👍 (line 3017: `// ⚠️ SCHEDULED EXPORT PAUSED — uncomment after Alex 👍`). On-demand HTTPS variant IS exported.

**Bigger finding (the actual gap):** there is a **DUPLICATE** sibling module `website/functions/brevoToFacebookCASync.js` (15,557 bytes, modified 2026-05-05 14:32) that IS fully wired at lines 2978-2980 AND IS scheduled `pubsub.schedule("0 3 * * *")` (03:00 UTC daily) AND IS firing per its export structure. The PM v2 build (`syncBrevoToFbCustomAudiences`) was created the same day but never replaced its predecessor.

**Re-classification:** HG-1 is **not** a hard gap. It is a **CG-8 (NEW)** cleanup gap: 2 overlapping Brevo→FB sync modules with overlapping but slightly different feature sets (v2 has lazy CA-id Firestore cache + push-vs-eligible discrepancy alert + critical Firestore-snapshot-fail alert). Alex must decide which to keep:
  - Keep v1 `brevoToFacebookCASync` (live), retire v2
  - OR retire v1, activate v2 (uncomment line 3017), reschedule to avoid 03:00 UTC double-fire
  - OR merge v2 features into v1

**The marketing-state audit's G8 was also wrong** — Brevo→FB sync IS firing daily, just via the v1 module the audit didn't grep for. G8 should be re-classified to "verify v1 is producing FB CA appends" (live Firestore check) rather than "build the missing sync".

**Revised Top 3 to build (Rule 1 — only verified gaps make this list):**

1. ~~Wire syncBrevoToFb~~ → **`tools/check_collaboration_tone.sh`** (was #2, now #1) — Rule 19/20 enforcement validator. Phantom rule confirmed. HG-2 in original list.
2. **`website/functions/common/logEvent.js`** — Rule 24 phantom helper. SG-4 promoted because every new function (including HG-3) needs Rule 24 compliance.
3. **`verifyClientProofMonthly` Cloud Function** — Rule 10 phantom enforcement. HG-3 in original list. Ships using the new logEvent helper.

**Rule 11 disaster log entry (to append to `DISASTER_LOG.md`):**
- **2026-05-05 — HG-1 misdiagnosis in gap_detection report:** Claude grepped only "syncBrevoToFb" prefix, missed the sibling `brevoToFacebookCASync` (different naming). The wire was there, just under a different module name. Lesson: when checking "is this functionality wired", grep for the *capability* (`Brevo.*FB\|Brevo.*Facebook`) not just the *file name*. Cost: 1 wasted edit + revert. No production impact.

---


