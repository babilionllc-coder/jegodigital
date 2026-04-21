# JegoDigital — NEXT_STEP

> **This file is the living priority queue. The #1 item is TODAY'S work (HARD RULE #4 + #8).**
> **Update at the END of every session:** mark completed items, promote the next rock, add anything new Alex agreed to.
> **Last session update:** 2026-04-21 PM
> **Maintained by:** Claude + Alex

---

## 🎯 TODAY'S BIG ROCK (HARD RULE #8)

> **2026-04-21 → 2026-04-22:** Fix the cold-email + cold-call conversion leak that's keeping MRR at $0.
>
> Specifically: (1) diagnose Instantly 0% open tracking — it's a workspace-level tracking pixel bug, not a per-campaign issue. (2) Finish the ElevenLabs voicemail fix for Agents B and C (Agent A is the only one working). (3) Manually work the 1 Calendly booking from Apr 17 if it hasn't been touched yet.

**Bucket:** A (close paying clients this week) + B (unblock lead gen)
**Success criteria:** either opens > 0% on at least one campaign by EOD, OR Agents B+C doing >40% done rate, OR the Apr 17 Calendly lead has a scheduled follow-up.

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
8. **Diagnose audit funnel delivery** — HARD RULE §Audit Funnel notes "PSI/DFS returning 0 (Apr 16)" — if audit is not pulling real data, the email landing in the lead's inbox is a dud. Check `processAuditRequest` Cloud Function logs for last 5 runs. **Proof required:** logs show real PageSpeed scores + real keyword data in last 5 audits.
9. **Refresh top-of-funnel copy** — 0 opens in Instantly could also be subject lines. Test 2 subject variations per campaign via Instantly A/B feature once tracking is fixed.

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
- README.md created (was 1 byte empty)
- ONBOARDING.md created as single entry point
- NEXT_STEP.md created (this file)
- OPERATING_RHYTHM.md created (daily/weekly/monthly/quarterly cadence)
- DISASTER_LOG.md created (13 entries backfilled in HR#10 format)
- BACKLOG.md created (P4 parking lot)
- **COLDCALL.md folded into SYSTEM.md §10** (11 subsections, source-code comments updated to reference SYSTEM.md §10.4, COLDCALL.md reduced to redirect stub) — **task #27 complete**
- Live data pull confirms: Calendly 0 today / 1 in 7d · Brevo 36% open rate · Instantly 0% open rate (broken) · ElevenLabs A✅ B⚠️ C❌

## ⏭️ ROLLED TO NEXT SESSION

- None from this session's doc-cleanup arc — all of it shipped in commit `c3c9ad71` (2026-04-21 PM, all 3 workflows green).
- Still pending from P0/P1 queue above: Apr 17 Calendly booking (#1), Instantly positive-reply harvest (#2), yesterday's 74 EL conversations review (#3), Instantly 0% open tracking diagnosis (#4), Agent B+C voicemail fix verification (#5), lead_finder v4 run (#6).

## 📦 SHIPPED IN COMMIT c3c9ad71 (2026-04-21 PM)

- Task #28 — SYSTEM.md §2 planned crons added (`weeklyRevenueReview` HR#7, `verifyClientProofMonthly` HR#9); §10 overview + ASCII + cron table + resolved-list all annotated with DISABLED for afternoon batch; §11 change log reordered chronologically + 4 new entries
- Task #29 — ACCESS.md live-verified 37/37 against GH API; header bumped to 2026-04-21 PM; changelog entry for today's infra; FILE REFERENCE table expanded with 6 new docs + `twilioCallStatusCallback.js` + `tools/verify_access.sh`
- Task #35 — single Git Data API push of 13 files (CLAUDE, SYSTEM, ACCESS, README, ONBOARDING, NEXT_STEP, OPERATING_RHYTHM, DISASTER_LOG, BACKLOG, COLDCALL, twilioCallStatusCallback.js, index.js, verify_access.sh); pre-push `node --check` passed both JS files; post-push poll confirmed Deploy to Firebase + Auto-Index URLs + Validate video assets all green on `c3c9ad71`

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
