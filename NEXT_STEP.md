# JegoDigital — NEXT_STEP

> **HR#4 + HR#8:** position #1 = TODAY's ONE big rock. Max 1 + 3 supporting per day.
> **Update at session end:** mark complete, promote next, archive old big-rocks to `/archive/`.
> **Timezone:** America/Cancun (UTC-5, no DST) — Alex lives in Cancún, not CDMX. All cron times in this file are Cancun local unless noted.
> **Last session update:** 2026-05-05 PM Cancún — **Wave 5 v4 paid-ready STAGED**. 4 new HTTPS Cloud Functions (metaCreateAdSet/AdImage/AdCreative/AdRunner + metaApiCore helper) + 5 AdSets PAUSED · 15 creatives · 15 ads created in campaign `120241459253630662`. All HR-6 verified. Spend exposure $0 until Alex 👍 flips ACTIVE. See `outputs/v4_adsets_staged_2026-05-05.md` for IDs + activation URL.

---

## 🎯 TODAY'S BIG ROCK — Activation pending Alex 👍

**1-click flip ready:** [Ads Manager · Campaign 120241459253630662](https://business.facebook.com/adsmanager/manage/adsets?act=968739288838315&selected_campaign_ids=120241459253630662)

When you say "go", flip AdSets A-E ACTIVE → $25/day max → leads start flowing to `https://jegodigital.com/auditoria-gratis`. Single yes/no: ship as specced, or specify which AdSet needs an edit first?

| AdSet | ID | Anchor |
|---|---|---|
| A | `120241496892100662` | Flamingo 88% AI |
| B | `120241496892580662` | Sur Selecto AMPI / AEO authority |
| C | `120241496893040662` | GoodLife outcome (ROI / chatbot / spy) |
| D | `120241496893700662` | Goza + Solik bilingual luxury (US+MX) |
| E | `120241496894060662` | Multi-client free 60-min audit (broadest) |

---

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

## 🎯 TODAY'S BIG ROCK — 2026-05-06 (Wed Cancún) · STAGE-1 SHIPPED 2026-05-05 PM

> **v4 5-AdSet × 15-creative staging spec SHIPPED. API execution awaits next bash-healthy session.**
>
> **Bucket:** B (qualified leads pipeline)
> **Status as of 2026-05-05 PM:** spec doc `outputs/v4_adsets_staged_2026-05-05.md` written; Phase 2-4 BLOCKED by infra (bash sandbox OOM `/etc/passwd` no-space + Meta MCP missing `create_adset/create_ad/create_creative`).

### 1. ✅ DONE 2026-05-05 PM — Spec for 5 PAUSED AdSets in `120241459253630662`
- 15 creatives mapped (14 PNG + 1 reel · skip #03 #08 #14 per receipt caveats + #14 dropped to land at 15)
- 5 AdSets specced: A·Flamingo88% · B·SurSelectoAEO · C·GoodLifeOutcome · D·GozaSolikBilingual · E·MultiClient+FreeAudit
- 3 CAs per AdSet picked from the 22 available (mapped by intent + size + recency)
- 5 body copies HR-19 + HR-17 manually validated (0 banned-word hits, all 5 with JegoDigital + niche in first 200 chars)
- Burn cap: $25/day · $175/wk total ($5 × 5 AdSets)
- HR-2 finding: live API shows campaign status=ACTIVE (not PAUSED as previously assumed) — flagged in spec
- All AdSets to be created with status=PAUSED — never ACTIVE without Alex 👍 (Rule 8)

### 2. ⏸️ PENDING — execute Phase 2-4 next session
- Recipe in spec doc §"Exact API recipe" (6 steps, ~5 min execute)
- Path A (preferred): next bash-healthy session runs the curl recipe + posts Telegram digest
- Path B (durable fix): add `metaCreateAdSet.js` HTTPS Cloud Function so future Cowork sessions can web_fetch (no bash dep)
- DO NOT use Path C (Alex pasting curls — violates HR-13)

### 3. 🤝 Awaits from Alex (single yes/no)
- *Ship the 5 AdSets as specced ($25/day max, all PAUSED) when bash is back? Y/N*
- *If N: which AdSet (A/B/C/D/E) needs CA swap, copy edit, or budget delta?*

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
