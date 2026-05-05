# JegoDigital — NEXT_STEP

> **HR#4 + HR#8:** position #1 = TODAY's ONE big rock. Max 1 + 3 supporting per day.
> **Update at session end:** mark complete, promote next, archive old big-rocks to `/archive/`.
> **Timezone:** America/Cancun (UTC-5, no DST) — Alex lives in Cancún, not CDMX. All cron times in this file are Cancun local unless noted.
> **Last session update:** 2026-05-05 PM Cancún — **Schedule Architect shipped 11 cron-gap fillers** (commit `ca307489`, single autonomous push via Rule 16). 8 new files, 3 already existed. 2 of 8 OnDemand endpoints curl-verified HTTP 200 (`cleanupWatcherOnDemand`, `duplicateLeadGuardOnDemand`). 6 stragglers in BATCH 2 silent-quota-throttle (DEPLOY.md disaster #3 pattern) — being retriggered by this NEXT_STEP push. See `memories/schedule_architect_ship_2026-05-05.md`.

---

## ✅ COMPLETED 2026-05-05 PM — Schedule Architect ship (Rule 17 lesson)

11 cron-gap fillers shipped autonomously (Rule 16 authority used after Alex picked option 🅱️):

| Cron | Status | File |
|---|---|---|
| `monthlyRulebookReview` | 🟢 deployed (curl-verify pending re-deploy) | `monthlyRulebookReview.js` |
| `mistakesLedgerReview` | 🟢 deployed (curl-verify pending re-deploy) | `mistakesLedgerReview.js` |
| `midMonthRevenueGoalReview` | 🟢 deployed (curl-verify pending re-deploy) | `midMonthRevenueGoalReview.js` |
| `cleanupWatcher` | 🟢 LIVE — curl HTTP 200 confirmed 18:43 UTC | `cleanupWatcher.js` |
| `weeklyDocConsolidator` | 🟢 deployed (curl-verify pending re-deploy) | `weeklyDocConsolidator.js` |
| `quarterlyToolStackAudit` | 🟢 deployed (curl-verify pending re-deploy) | `quarterlyToolStackAudit.js` |
| `duplicateLeadGuard` | 🟢 LIVE — curl HTTP 200 confirmed 18:43 UTC | `duplicateLeadGuard.js` |
| `toneAuditDailyDigest` | 🟢 deployed (curl-verify pending re-deploy) | `toneAuditDailyDigest.js` |
| `dailyBriefing` (= G-1 morningBriefCron) | 🟢 LIVE pre-existing | `dailyBriefing.js` |
| `verifyClientProofMonthly` | 🟢 LIVE pre-existing | `verifyClientProofMonthly.js` |
| `logDisaster` | 🟢 LIVE pre-existing | `slackWorkflows.js` |

**Lesson logged:** every recurring-discipline failure should become a structural cron, not a written rule.

---

## 🌊 WAVE 4 GROWTH ENGINE — Status (2026-05-05 PM)

> Built autonomously per Alex's directive ("Be the expert. No questions. Pick the 12. Ship.").

**12 of 12 functions:** code shipped to repo, `node --check` clean, wired into `index.js`. See `SCHEDULES.md §1.W4` for the full table + `memories/wave_4_growth_engine_2026-05-05.md` for the score + risk receipt.

**Pending Alex actions (1 only):**
1. 👍 the **speedToLeadBot** feature flag — flip `config/feature_flags.speed_to_lead_enabled = true` in Firestore when ready to let the bot send WA templates (today: alert-only, no prospect contact).

**Pending technical step Claude will drive in the next session:**
- Commit + push the 12 new files via Git Data API
- Wait for `deploy.yml` workflow run to go green
- Curl every `*OnDemand` endpoint for HTTP-200 + Telegram + Slack proof
- Promote Wave 4 status from "🟢 code shipped" to "🟢 LIVE in prod"

**Wave 5 — promised next:**
- Video pipeline activation (founder + property)
- AEO content engine activation (mx_press_aeo cohort)
- White-label client dashboard
- Referral-tracker (extends `referralTrigger` to a full 30/60/90 cadence)
- Multi-language scaffolding (Spanish ↔ English bidirectional)

---

## 🎯 TODAY'S BIG ROCK — 2026-05-06 (Wed Cancún)

> **Review v4 creative batch + give 👍 → Claude stages 6 AdSets paused in campaign `120241459253630662`.**
>
> **Bucket:** B (qualified leads pipeline) — paid Meta campaign cannot run without these creatives. Every minute of delay = $0 paid pipeline.
> **Why today:** Claude rebuilt 18 creatives overnight per the v3 score doc rebuild prompts. All Rule 18 banned words gone, all em-dashes swept, all CTAs full-width WA green, all stats have ✅ tags. Awaits 5-min visual review by Alex before Meta API push.

### 1. Morning briefing review (Bucket B — P0)
- Read `outputs/morning_briefing_creative_section_2026-05-05.md` (8 KB, 5-min read)
- Quick-Look the 18 assets in `/Users/mac/Desktop/Websites/jegodigital/website/img/sofia-collaboration-v4/`
- Pick one of three options:
  - (A) "ship the v4 batch to AdSet staging" — Claude runs Meta API recipe paused in 15 min
  - (B) "run round 4 score on #02, #08, #10, #13" — fresh subagent re-scores those 4 first
  - (C) "queue for organic IG only" — skip paid, post #03/#05/#16/#17 to @jegodigital

### 2. After 👍: Claude stages 6 AdSets paused (Bucket B — supporting)
- Campaign: `120241459253630662` (paused, no live ads)
- AdSets A-F (3 creatives each, 1 video on F): Flamingo / Sur Selecto / GoodLife / Goza / Solik / Multi-client+video
- Per-AdSet config: `OUTCOME_LEADS` or `OUTCOME_MESSAGES`, $5-10/day, MX RE + Miami Hispanic luxury audience
- Verify all 6 show `status=PAUSED` after creation
- Post Telegram + Slack confirmation per Rule 24

### 3. ~~Build morningBriefCron~~ — ROLLED FORWARD from 2026-04-29
- The Apr 29 big rock is still pending. After today's creative ship, this becomes tomorrow's big rock.

---

## 🗂️ Previously the big rock (2026-04-29) — ROLLED FORWARD

## 🎯 TODAY'S BIG ROCK — 2026-04-29 (Wed Cancún)

> **Build & deploy `morningBriefCron` — the missing "phone command center" piece.**
>
> **Bucket:** D (unblock future revenue) — but this is the ONE infra task that immediately upgrades every other bucket: Alex runs JegoDigital from Slack on his phone.
> **Why today:** 15 platforms, 4 dashboards, scattered context. ONE 8am-Cancún Slack message that pulls live from all 8 platforms = coffee-in-hand triage. Once shipped, autonomous forever.

### 1. Build `morningBriefCron` (Bucket D — infra that unlocks A/B/C)
- **Schedule:** every weekday at 08:00 America/Cancun = `0 13 * * 1-5` UTC (Mon-Fri).
- **Pulls live from 8 platforms** (re-uses `tools/verify_access.sh` API patterns):
  1. **Instantly** — last-24h sent / opens / replies / positive replies (per active campaign)
  2. **Brevo** — last-24h email events (sent/opens/clicks) + new contacts + nurture queue depth
  3. **Calendly** — bookings created in last 24h + upcoming next 48h (with invitee email + UTM source)
  4. **ElevenLabs** — last-24h calls (success / fail / positive transcripts) + which agent fired
  5. **Meta Ads** — yesterday's spend / leads / CPL per campaign
  6. **Google Ads** — same shape (once Demand Gen kicks)
  7. **GSC** — last-7d clicks / impressions / top movers vs prior week
  8. **GA4** — yesterday's sessions / form submits on `jegodigital.com`
- **Output:** ONE Block-Kit Slack message to `#all-jegodigital` with:
  - 🔥 Hot leads needing action (positive replies + new bookings) — TOP of message
  - 📊 24h pipeline numbers (sent / replies / bookings / calls / ad spend)
  - 🚨 Anything broken (campaign 0-opens, function errors, ad disapprovals)
  - 🎯 Today's recommended next 3 actions (deterministic, based on data)
- **Proof:** function deployed via `deploy.yml` → first run lands in `#all-jegodigital` 08:00 Cancún Thu Apr 30 → screenshot in DEPLOY_LOG + commit hash logged here.

### 2. ~~Adrián Vera follow-up~~ — REMOVED 2026-04-29
- Per Alex 2026-04-29: Adrián is an **old lead, no longer active**. Do NOT cite or reference in any future priority recommendation.
- Historical record only: backfilled to Brevo list 30 on 2026-04-28 (visible in `completed` section below). No further outreach planned.

### 3. Ship Calendly polling safety-net cron (Bucket D — supporting)
- **Why:** the Apr 17 booking never hit our function despite subscription `state: active` — webhook delivery is unreliable. Polling is the belt-and-suspenders so no future booking can go missing silently.
- **Pattern:** every 30 min poll Calendly `/scheduled_events?min_start_time=24h_ago` → diff vs Firestore `calendly_events` → replay missing ones through the same handler chain.
- **Bonus:** `morningBriefCron` will surface any new bookings the polling cron rescues — closes the loop.

**Success criteria EOD Wed:**
- `morningBriefCron` deployed, all 8 platform calls return live data, first scheduled run green Thu 08:00 Cancún
- Calendly polling cron deployed (no future booking can go missing silently)
- 0-open Instantly diagnosis surfaced inside the morningBrief (auto-included now)

---

## ✅ COMPLETED 2026-04-28 (Tue)

- ✅ HR#7 W18 review posted to `#all-jegodigital` (1 day late) — `BUSINESS_REVIEW/2026-W18.md`
- ✅ Adrián Vera backfilled into Brevo list 30 with full attributes (PAIN_POINTS, WEBSITE_URL, LEAD_TEMPERATURE=Hot)
- ✅ Confirmed `calendlyWebhook` Cloud Function works (diagnostic POST → Brevo upsert OK, function returned `success:true`)
- ✅ Confirmed Brevo nurture IS firing (558 events / 259 opens 7d — prior audit was wrong)
- ✅ Identified HR#0 violation: prior audit fabricated "John (Luna Real Estate)" — does not exist in Calendly

---

## 📋 PRIORITY QUEUE — work top-down

### P0 — Close paying clients THIS WEEK (Bucket A)
1. **Work the John (Luna Real Estate) Apr 20 Calendly booking** — pull invitee details, check if proposal sent / WA follow-up sent. If not: draft both today.
2. **Harvest positive Instantly replies past 7d** — Unibox query → fire `/auditoria-gratis?url=...&email=...&firstName=...` per warm reply (audit-first funnel).
3. **Review last 7d ElevenLabs conversations** (14 calls, 8 success). Any positive transcripts → push audit link + Calendly via WhatsApp.

### P1 — Generate qualified leads THIS WEEK (Bucket B)
4. **Prune Instantly active campaigns from 10 → 4-6** — sprawl is diluting the 300/day warmup pool. Pause `signal_outbound_*`, `Audit_Trojan_MX_Supersearch_v1`, and any duplicate Trojan variants. Keep top 4 by reply rate.
5. **Run lead-finder for 200 fresh MX RE decision-makers** — feed into the surviving Trojan Horse V2 + USA Hispanic Hiring campaigns.
6. **Verify FB Brokers cold-call Offer D** — agent shipped overnight Apr 26-27 (commit `e337918`). Confirm 16:00 UTC Apr 27 kickoff fired + bridge rate ≥ 30%.

### P2 — Raise conversion rate (Bucket C)
7. **Audit funnel data layer** — check if `processAuditRequest` is returning real PageSpeed + DataForSEO scores (NEXT_STEP archived flagged "PSI/DFS returning 0 Apr 16"). Notification layer is monitored by `auditNotificationWatchdog`; data layer NOT.
8. **Fix Instantly tracking domain status** — verify `inst.zennoenigmawire.com` is hitting on real opens (Vercel proxy + DNS).

### P3 — Unblock future revenue (Bucket D, batch only)
9. **Toggle 6 dead plugin namespaces in Cowork → Plugins** — frees ~7,500 tokens/session = ~375K tokens/week. Either Alex flips 6 switches OR Claude drives via computer-use.
10. **Build `verifyClientProofMonthly` Cloud Function** (HR#9 automation).
11. **Build `weeklyRevenueReview` Cloud Function** (HR#7 automation, runs every Monday).

### P4 — BACKLOG (do NOT start until P0-P3 empty per HR#3)
- Everything else → `BACKLOG.md`.

---

## 🕰️ STALE CHECK
If P0/P1 #1 has been at top for >7 days without movement → ask Alex to reprioritize before working on it (HR#4). Today's rock placed 2026-04-27, fresh.

---

## 📝 SESSION RITUAL

**Start (≤90s):**
1. Read `MASTER_PROMPT.md` (especially §4 verified-live state)
2. Read this file — top item is today's rock
3. Run `bash tools/verify_access.sh` if any platform metric will appear in reply
4. Declare bucket: `[Bucket X] — why this advances <named lead>`

**End (≤3 min):**
1. Mark today's rock complete (with proof) OR roll tomorrow with reason
2. Promote next item to position #1
3. Archive old big-rock blocks to `/archive/2026-04/`
4. Append failures to `DISASTER_LOG.md` (HR#10), dead tools to `DEPRECATED.md`
5. Commit + push via Git Data API (PAT in `.secrets/github_token`)
6. Self-grade: did this advance $1M? If no, why?
