# JegoDigital Agent Memory — Master Index

> **Locked 2026-05-05** as part of the `jegodigital-strategist` skill build.
> **Owner:** Claude reads this every session as part of bootstrap (Rule 16).
> **Purpose:** the master TOC + read order for everything an agent needs to know about JegoDigital.

---

## 🌟 Identity

JegoDigital is an **AI marketing collaboration partner** for real estate businesses, agencies, and developers in Mexico + Miami Hispanic luxury. Run by 1 founder (Alex Jego). Core philosophy:

> *"We never sell anything. We offer help to collaboration to achieve success. If our clients are successful by getting leads and sales, we are successful."*

---

## 📋 Read order — every session bootstrap (Rule 16)

```
0. /CLAUDE.md                                      ← project instructions (slim index)
1. /CLAUDE_RULES.md                                ← canonical 25 rules + 5 gates
2. /NEXT_STEP.md                                   ← today's #1 work (Rule 5)
3. /.claude-knowledge/clients.md                   ← client roster (Rule 25)
4. /.claude-knowledge/accounts.md                  ← account IDs + env var names (Rule 25)
5. /.claude-knowledge/campaigns.md                 ← live campaign state (Rule 25)
6. /.claude-knowledge/architecture.md              ← Cloud Functions + crons + Firestore (Rule 25)
7. /.claude-knowledge/workflows.md                 ← 15 active autonomous workflows (Rule 25)
8. /skills_patches/jegodigital-strategist/SKILL.md ← THE strategist (this is the brain)
9. /skills_patches/jegodigital-strategist/priority_queue.md ← what's next
10. /agent/memory/mistakes_ledger.md               ← 12 anti-patterns to never repeat (Rule 11) — root copy archived 2026-05-05
11. /agent/memory/access_truth_jegodigital.md      ← credentials reality + 4-step investigation algorithm (Rule 16) — added 2026-05-05 PM
12. /DISASTER_LOG.md                               ← grep before risky moves (Rule 11)
```

Skip any of these → Claude is flying blind.

---

## 🎯 Pointer — the strategist skill

The new permanent skill at `skills_patches/jegodigital-strategist/` is the master strategist. Use it for:

| Question | Use |
|---|---|
| "What's next?" / "What's the priority?" | invoke strategist (data-driven answer in <60 sec) |
| "Audit our marketing" / "What's broken?" | invoke strategist → `workflows/audit_current_state.md` |
| "Audit cold email / Sofia / Brevo / FB ads / cold call" | invoke strategist → `workflows/audit_workflow_X.md` |
| "Score this creative / ad" | invoke strategist → `workflows/score_creative.md` (delegates to ad-creative-scorer) |
| "Score this email / copy / reply" | invoke strategist → `workflows/score_copy.md` |
| "Research X" / "best practices for Y" | invoke strategist → `workflows/research_best_practices.md` |
| "Are we on track?" / "Goals delta" | invoke strategist → `workflows/gap_analysis.md` |

**Where it lives:** `/skills_patches/jegodigital-strategist/` — full bundle (29 files).
**How it stays current:** 3 autonomous hooks (H1 daily 08:00 CDMX, H2 post-task, H3 weekly Monday 09:00 CDMX) — see `crons/README.md`.

---

## 🛡️ Pointer — the 2 prevention skills (added 2026-05-05)

Two sister meta-skills that gate the orchestrator's own behavior. Born from Mistake #8 (claimed v3 took 80 min, real ~15 min, no receipt). External systems, not self-discipline.

| Skill | Path | What it does | When |
|---|---|---|---|
| `claude-output-validator` | `/skills_patches/claude-output-validator/` | Pre-send 6-check validator. Blocks SendUserMessage if effort/time/iteration claims lack a 📊 work receipt OR if "ship-ready" claims lack independent score reference (Rule 14.1). | Inline at send time |
| `claude-optimizer` | `/skills_patches/claude-optimizer/` | Weekly + daily self-audit. Reads SendUserMessage history via session_info MCP, scores against 25 rules + 6 priority patterns, posts Telegram + Slack report Sundays 23:00 CDMX, auto-drafts new prevention rules when patterns repeat 2+ weeks. | Daily 22:30 + Sunday 23:00 CDMX cron (deploy follow-up) |

**The 6 priority patterns** the optimizer scans for: time-inflation · phantom approval gates · self-scoring inflation · long retro messages · vague proof claims · missed Rule 11 close.

**Cross-reference:** Mistake #8 in `agent/memory/mistakes_ledger.md` is permanently prevented by these two skills working together — validator gates the moment, optimizer audits the trend.

---

## 🗂️ 2026-05-05 — Root markdown consolidation pass

**What was done:** moved 6 root-level files out of `/Users/mac/Desktop/Websites/jegodigital/` into `archive/2026-05/`, merged the duplicate `mistakes_ledger.md` into this canonical copy, fixed every reference that pointed at the old root copy, and seeded a new `INDEX.md` at root as the one-line-per-doc map.

| Source (root) | Destination | Reason |
|---|---|---|
| `website-copy-revenue-layer.md` | `archive/2026-05/` | Strategic doc, no active references outside `outputs/` |
| `dedup_2026-05-02_FINAL_REPORT.md` | `archive/2026-05/` | Historical report — preserved but inactive |
| `instantly_mcp_setup.md` | `archive/2026-05/` | One-time setup doc — kept for audit only |
| `mistakes_ledger.md` | `archive/2026-05/mistakes_ledger_root_2026-05-05.md` | All 9 entries merged into this canonical copy first |
| `SCALING_RECOMMENDATION.md` | `archive/2026-05/_root_dups_2026-05/` | Byte-identical to `archive/2026-04/` copy (`cmp -s` confirmed) |
| `scaling_strategy_research.md` | `archive/2026-05/_root_dups_2026-05/` | Byte-identical to `archive/2026-04/` copy (`cmp -s` confirmed) |

**Reference updates shipped:**
- `skills_patches/jegodigital-strategist/anti_patterns.md` lines 113 + 123 — pointer flipped from "repo root" to `agent/memory/mistakes_ledger.md`.

**Net efficiency:** root .md count 36 → 31 active (5 archived + 1 new INDEX.md). Total active root .md size 812,096 bytes → 766,499 bytes (incl. new INDEX) — that's −45,597 bytes, ≈5.6% size reduction, 13.9% file-count reduction (5/36). Reduction is conservative because all the large rulebooks (CLAUDE_RULES, BLUEPRINT, SYSTEM, BUSINESS, AI_AGENT_PERSONA, DISASTER_LOG) are active and cannot be merged without breaking workflows.

**Items still pending Alex approval:** AI_AGENT_PERSONA.md is 76 KB and the previous task referenced an `outputs/AI_AGENT_PERSONA_v3_optimized.md` (60% shorter rewrite) that was never written to disk. Skipped that step; flagged for explicit Alex decision.

**Lesson learned:** the previous archive operations (April + early May) did not always remove the root copy after archiving — leaving 3 byte-identical pairs in the repo. Future archive operations must verify root cleanup with `ls $ROOT/<file>` returning "No such file" before claiming complete.

---

## 📚 The 25 hard rules — quick jump table

| # | Rule | One-line |
|---|---|---|
| 1 | Verify-live every number | No claim without a live source this session |
| 2 | Never run blind on cold email | `verify_access.sh` HTTP 200 first |
| 3 | Universal verify-live across 8 platforms | live API for ElevenLabs/Instantly/Brevo/Calendly/Firestore/Meta/GSC/GA4 |
| 4 | Revenue-first prioritization (5 buckets) | A=close · B=leads · C=convert · D=infra · E=cleanup |
| 5 | Read NEXT_STEP.md first + confirm | First file read every session |
| 6 | Lead quality gate (7 sub-gates) | No upload without 7/7 pass |
| 7 | Never mark complete without proof | "Done" requires same-session verification |
| 8 | Weekly revenue review every Monday | Autonomous 8-platform pull |
| 9 | One big rock per day | Max 1 + 3 supporting |
| 10 | Client proof must stay fresh | Monthly cron, kill stale claims |
| 11 | Failed experiments logged | DISASTER_LOG.md before risky moves |
| 12 | Always find a way | 8-rung autonomy ladder |
| 13 | Plain-language explanations | What/Why/How |
| 14 | Never ask Alex to do work | Alex leads, Claude executes |
| 15 | Crystal-clear next steps | Rule 11 close (3-line block) |
| 16 | Session bootstrap | request_cowork_directory + .env source first |
| 17 | No email tracking on cold campaigns | link + open tracking always false |
| 18 | Collaboration tone over sales pitch | Banned phrases gated by validator |
| 19 | Research before send (3-rule gate) | Best-practices brief + lead context + never-blind-send |
| 20 | Always introduce JegoDigital + RE niche | First 200 chars contain both tokens |
| 21 | Score 1-10 on 6 axes, ship 9-10 | Self-QC every customer-facing asset |
| 22 | Audience clarity 2-second test | RE visual + niche text in <2 sec |
| 23 | Paid ads 10/10 on every axis | No 9s allowed for paid spend |
| 24 | Every automation logs to Telegram + Slack | Silent automation = blind automation |
| 25 | Always investigate — never ask Alex | Maintain comprehensive KB |

Plus 5 hard gates: **Client Domain · SEO Skills Routing · Blog Quality · Lean Skill Stack · MCP Keep List**.

Full rule bodies → `/CLAUDE_RULES.md`.

---

## 🎯 The 6 success goals (strategist's North Star)

| # | Goal | Measure |
|---|---|---|
| G1 | Reliable lead pipeline | 50+ qualified MX RE leads/wk, HR-5 7/7 |
| G2 | Booking velocity | 3+ Calendly bookings/wk from real leads |
| G3 | Conversion to paying client | ≥1 closed/mo, $50K MXN MRR |
| G4 | Visible authority | Cited in ChatGPT/Perplexity/Gemini for "AI marketing real estate Mexico" |
| G5 | Client retention + proof freshness | 100% retention 90+ days, monthly HR-9 cron |
| G6 | Operating discipline | All rules + skills current, 0 stale > 30 days |

Full bodies → `/skills_patches/jegodigital-strategist/reference/goals.md`.

---

## 🚫 The 6 anti-patterns (NEVER repeat — full bodies in `mistakes_ledger.md`)

1. **Audience clarity miss** — paid ad without RE visual + niche text visible in 2 sec ✅ permanent prevention
2. **Built only 2 of 5 RE clients** — proof concentration risk 🟡 behavioral
3. **Shipped Sofia v2.4 with broken token** — never claim live without same-session 200 ✅ permanent
4. **Rule layer drift** — citing legacy HR-N or Memory Rule N namespace ✅ permanent
5. **Self-scored 70/70 inflation** — builder cannot self-score ✅ permanent (Rule 14.1)
6. **Phantom approval gates** — claim approved without pasteable artifact ✅ **PREVENTED BY `jegodigital-strategist` SKILL**

---

## 🔁 Live workflows (15 autonomous)

Full table in `.claude-knowledge/workflows.md`. Top 5 most critical:

- **W1** Daily lead pipeline (8am CDMX cron, lead-pipeline-2026)
- **W3** Cold-email reply handling (instantlyReplyWatcher every 5 min)
- **W5** Calendly lifecycle (calendlyWebhook → Brevo + Telegram)
- **W8** Monday revenue review (Rule 8 / HR-7)
- **NEW (pending deploy)** strategist daily brief H1 + post-task hook H2 + weekly review H3

---

## 🛰️ Tier-A autonomous monitoring stack (added 2026-05-05 overnight)

Three sister crons that observe the JegoDigital fleet, alert on anomalies, and snapshot to Firestore. **READ-ONLY by design** — never rotate a token, pause a campaign, or mutate state in any 3rd-party platform. All 3 use `notify(text, { critical })` from `telegramHelper` + `slackPost(channel, payload)` from `slackPost.js` per Rule 24 (every automation logs to Telegram + Slack).

| Skill | Cron (CDMX) | Cloud Function | Snapshot collection | Sister to |
|---|---|---|---|---|
| `cron-health-monitor` | 05:00 daily | `cronHealthMonitor.js` | `cron_health_daily/YYYY-MM-DD` | silent-cron detector — closes the 2026-05-05 cold-call dialer dormancy gap |
| `token-watchdog` | 06:00 daily | `tokenWatchdog.js` | `token_health_daily/YYYY-MM-DD` | catches Meta WA scope-binding bug (scope name present but no WABA in target_ids) + 7d-ahead expiry warnings |
| `performance-monitor` | 07:00 daily | `performanceMonitor.js` | `performance_daily_snapshots/YYYY-MM-DD` | KPI anomaly digest: Instantly + Brevo + Meta Ads + Calendly + Sofia |

**Skill paths (TOC):**
- `/skills_patches/cron-health-monitor/{SKILL.md,PROMPT.md,cron-evidence-map.md}`
- `/skills_patches/token-watchdog/{SKILL.md,PROMPT.md}`
- `/skills_patches/performance-monitor/{SKILL.md,PROMPT.md}`

**Severity tiers (canonical, all 3 agents):** ✅ healthy · 🔵 watch · 🟡 warn · 🟠 error · 🔴 critical (critical → SMS fallback via `notify({ critical: true })`).

**On-demand HTTPS endpoints (manual fire / past-date audit):**
```bash
# Cron health (silent-cron audit)
curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/cronHealthMonitorOnDemand"
curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/cronHealthMonitorOnDemand?cron=cronHealthMonitor"

# Token watchdog (full or single-token mode)
curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/tokenWatchdogOnDemand"
curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/tokenWatchdogOnDemand?token=META_WA_CLOUD_TOKEN"

# Performance digest (today or any past date)
curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/performanceMonitorOnDemand"
curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/performanceMonitorOnDemand?date=2026-05-04"
```

**Built report:** `/outputs/tier_a_agents_built_2026-05-05.md` (file inventory + deploy steps + sample outputs).

---

## 📡 Communication channels

- **Alex personal WhatsApp:** +52 998 202 3263
- **Alex email:** jegoalexdigital@gmail.com
- **Alex Telegram:** `@alex_telegram` chat (env `TELEGRAM_ALEX_CHAT_ID`)
- **Slack channel:** `#jegodigital-deploy` (env `SLACK_WEBHOOK_URL`)
- **Calendly:** https://calendly.com/jegoalexdigital/30min

---

## 🚦 Output discipline (every Claude response)

1. ✅/🟡/❌/❓ tag every numeric claim
2. Cite the source command/path
3. Bucket-tag the work (A/B/C/D/E per Rule 4)
4. Close with Rule 15 3-line block:

```
🎯 Next step: <one sentence>
⏳ ETA: <realistic timeframe>
🤝 Need from Alex: <👍 / one yes/no / nothing>
```

---

## 🔗 Cross-references

- Strategist skill: `/skills_patches/jegodigital-strategist/SKILL.md`
- Strategist priority queue (live): `/skills_patches/jegodigital-strategist/priority_queue.md`
- Hard rules: `/CLAUDE_RULES.md`
- Knowledge base: `/.claude-knowledge/{clients,accounts,campaigns,architecture,workflows}.md`
- Mistakes ledger: `/mistakes_ledger.md`
- Disaster log: `/DISASTER_LOG.md`
- Project root index: `/CLAUDE.md`
- Operating rhythm: `/OPERATING_RHYTHM.md`

---

**End of MEMORY.md.** Read this first. Then run the bootstrap sequence. Then start work.
