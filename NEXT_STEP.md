# JegoDigital — NEXT_STEP

> **HR#4 + HR#8:** position #1 = TODAY's ONE big rock. Max 1 + 3 supporting per day.
> **Update at session end:** mark complete, promote next, archive old big-rocks to `/archive/`.
> **Last session update:** 2026-04-27 (live-API audit + MASTER_PROMPT + AUDIT_DELTA shipped)
> **Archive of pre-2026-04-27 content:** [`archive/2026-04/NEXT_STEP_2026-04-26_archive.md`](archive/2026-04/NEXT_STEP_2026-04-26_archive.md)

---

## 🎯 TODAY'S BIG ROCK — 2026-04-27 (Mon CDMX)

> **HR#7 Monday Weekly Revenue Review + ship 3 critical doc/data fixes surfaced by 2026-04-27 live audit.**
>
> **Bucket:** D (unblock future revenue) — required infrastructure for the week ahead.
> **Why today:** Monday is HR#7 mandate AND the 2026-04-27 live-API audit surfaced 2 silent bugs costing real prospects right now.

### 1. HR#7 Weekly Revenue Review (mandatory Monday)
- Pull live numbers from 8 platforms via `tools/verify_access.sh` + per-platform curls
- Score: new MRR · qualified leads · Calendly booked · cold-reply→Calendly conv % · CPC closed · pipeline broken/fixed top-3
- Post Block-Kit summary to `#all-jegodigital` Slack + Telegram
- Write `/BUSINESS_REVIEW/2026-W18.md` entry

### 2. 🚨 Fix Calendly→Brevo bridge (silent revenue leak)
- **Bug:** list 30 ("Calendly Booked") shows only 2 contacts, both self-tests. Real bookings (Adrián Apr 15, John Luna Apr 20) never landed in Brevo.
- **Action:** audit `website/functions/calendlyWebhook.js` `invitee.created` handler. Confirm Brevo `/v3/contacts` upsert with FIRSTNAME/LASTNAME/COMPANY/SOURCE=calendly/STAGE=booked.
- **Proof:** make a test booking on the real Calendly URL, verify contact appears in list 30 within 60s with correct attributes.

### 3. 🚨 Verify Brevo nurture cron is firing (or document why not)
- **Symptom:** last 7d Brevo transactional events = 10, ALL to Alex's own gmail (self-tests). No real prospects emailed.
- **Action:** check `processBrevoNurtureQueue` cron logs (every 30 min). Read Firestore `brevo_nurture_queue` for rows where `sendAt <= now AND sent != true`. If queue empty → confirm zero positive Instantly replies + zero audits this week (also valid). If queue has unsent rows → fix the cron.
- **Proof:** either (a) cron log shows real send + Brevo events show non-self-test deliveries, OR (b) documented "no leads triggered nurture this week" with reply/audit counts to back it up.

### 4. Doc cleanup wave 1 (already in progress this session)
- ✅ MASTER_PROMPT.md shipped
- ✅ AUDIT_DELTA_2026-04-27.md shipped
- ✅ NEXT_STEP.md cleaned (this file)
- ⏳ CLAUDE.md update (5 EL agents, 10 active campaigns)
- ⏳ SYSTEM.md auto-regen (174 functions live)
- ⏳ Move 16 historical .md to archive/

**Success criteria EOD Monday:**
- HR#7 review posted to `#all-jegodigital`
- Calendly→Brevo bridge proven working with one real test booking
- Brevo nurture cron status documented
- All 4 doc fixes shipped to main, all GH workflows green

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
