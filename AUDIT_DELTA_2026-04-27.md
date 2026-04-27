# JegoDigital — Doc-vs-Reality Delta Report
**Generated:** 2026-04-27 04:09 UTC | **Method:** live API pulls across Instantly · Brevo · ElevenLabs · GitHub · Firebase · Slack · Notion
**Purpose:** identify every place where the project's docs claim something that isn't actually true right now.

> **How to use:** scan column "Action" → fix the docs (or fix the system) so the claim becomes true again. Re-run this audit Mondays.

---

## 1. WHAT THE DOCS GET RIGHT ✅ (don't touch these)

| System | Doc claim | Live truth | Status |
|---|---|---|---|
| Instantly mailboxes | 10 mailboxes, 5 zenno + 5 zenia, 100/100 warmup, 30/day | exact match | ✅ KEEP |
| Instantly tracking domain | `inst.zennoenigmawire.com` (Vercel proxy) | accounts API confirms domain in use | ✅ KEEP |
| GH workflows | 4 workflows green per push (deploy / auto-index / smoke / notion) | Last 4 commits show all 4 green | ✅ KEEP |
| `.secrets/github_token` for autonomous deploy | Token-based fallback works | Confirmed file present, used in `gh` PAT path | ✅ KEEP |
| Slack webhook live | `SLACK_WEBHOOK_URL` in GH Secrets | Token in `.secrets/`, channel `#all-jegodigital` exists | ✅ KEEP |
| Brevo client-newsletter pipeline | TT&More weekly send works | Apr 21 sent + 3 queued through May 12 | ✅ KEEP |
| ElevenLabs cold-call infra | Twilio MX + 3-number rotation | 14 calls last 7d, 8 success / 73s avg, healthy | ✅ KEEP |
| Calendly bookings real | Calendly funnel produces real prospects | John (Luna Real Estate) booked Apr 20 ×2 | ✅ KEEP |

---

## 2. WHERE DOCS LIE OR ARE STALE 🛑 (fix or replace)

| # | Doc / claim | What doc says | What's actually live | Action |
|---|---|---|---|---|
| 1 | **CLAUDE.md §OUTREACH** | "5 active Step-1 templates" | **20 campaigns, 10 ACTIVE (status=1)** in Instantly right now | Update CLAUDE.md to reflect 10 active OR (better) prune to 5 active. Sprawl dilutes warmup pool. |
| 2 | **CLAUDE.md §AI Cold Calling** | "3 split-test agents A/B/C" | **5 agents live**: A SEO, B Audit, C Setup, D FB Brokers, Inbound Receptionist | Update CLAUDE.md to list all 5 agents + offer codes |
| 3a | **My initial audit (corrected)** | "Brevo nurture silently dead, all lists = 0 subs" | **API quirk** — `/contacts/lists` summary returns 0 for all. Direct `/contacts/lists/25` shows **10 real subscribers** (Apr 22 backfill landed correctly). Always use direct fetch. | KEEP — Brevo nurture pipeline IS alive, list 25 confirmed |
| 3b | **Calendly→Brevo bridge** (NEXT_STEP P2 #10) | "Calendly bookings auto-upsert to Brevo as STAGE=booked" | **List 30 = 2 contacts, both self-tests.** Adrián Vera (Apr 15) + John Luna (Apr 20) bookings NEVER landed in Brevo. | 🚨 P1: audit `calendlyWebhook.js` `invitee.created` handler — make a test booking, verify contact + attributes appear in Brevo within 60s |
| 3c | **Brevo email events last 7d** | "nurture day 0/3/7/14 firing for warm replies" | **10 events, all to `jegoalexdigital@gmail.com` self-tests.** Zero real prospects emailed this week. | 🚨 P1: check if `processBrevoNurtureQueue` cron is firing (every 30 min) + Firestore `brevo_nurture_queue` has scheduled rows, OR if no audits/replies happened this week (also possible) |
| 4 | **NEXT_STEP.md §TODAY'S BIG ROCK** | 3 different "TODAY'S BIG ROCK" blocks (Apr 23, Apr 24 ×2) | HR#8 says max ONE per day | Strip the historical "TODAY'S BIG ROCK" blocks. Keep only Apr 27's rock. Move history to `archive/NEXT_STEP_history.md` |
| 5 | **SYSTEM.md §Functions** | hand-curated function inventory (875 lines) | **174 functions live** + 30 distinct cron schedules | Auto-generate inventory section from `grep -oE '^exports\.\w+' website/functions/index.js` on every push. Make it a CI step, never hand-curate |
| 6 | **CLAUDE.md "MCP Keep List" gate** | "6 plugin namespaces killed (~7,500 tokens saved)" | **Plugin namespaces still loading every session.** Cowork manifest unreachable from sandbox | Either (a) drive Cowork → Plugins panel via `computer-use` (~2 min) OR (b) Alex manual toggle (30s). Then verify on next session start |
| 7 | **DEPRECATED.md "lean stack 26 skills"** | List of 26 keep skills | **System prompt loads ~130 skills** every session | Same fix as #6 — toggle dead plugin namespaces in Cowork settings |
| 8 | **Skills referencing "Tony clone" / "Sofia clone"** | "custom-cloned ElevenLabs voice" | **0 cloned voices in account.** All 26 voices are presets | Update skills (`elevenlabs-voiceover`, `remotion-shorts`, `youtube-long-form`, `cold-calling-ai`) to say "preset voice" not "clone" |
| 9 | **NEXT_STEP.md last update** | "2026-04-25" header | File mtime is **2026-04-27 01:57 UTC** + 8 GH commits shipped overnight Apr 26-27 | Strip the stale header line. Either auto-stamp or remove |
| 10 | **CLAUDE.md `currentDate`** | "2026-04-26" | Sandbox UTC clock = **2026-04-27 04:09** = Mon Apr 27 = HR#7 review day | Auto-stamp `currentDate` from `date -u` on every CLAUDE.md regen |

---

## 3. ROOT-LEVEL DOC BLOAT 📦 (16 archive candidates)

These root-level `.md` files are historical (audits, session handoffs, one-off reports) and should move to `/archive/` to declutter the root from 46 → 30 files:

```
AUDIT_2026-04-21.md                       (319 lines, 2026-04-21)
AUDIT_TROJAN_MX_V1_REPORT.md              (5KB, 2026-04-19)
BREVO_AUDIT_2026-04-26_PM.md              (374 lines)
CLAUDE_SESSION_BOOTSTRAP.md               (5KB, 2026-04-22)  ← keep referenced from CLAUDE.md though
CUSTOMER_MATCH_HANDOFF_2026-04-26.md      (7KB)
ELEVENLABS_CLONE_REPORT.md                (4KB, 2026-04-24)  ← related to delta #8
Instantlyoldemail.md                      (51KB)             ← BYTE-IDENTICAL DUPLICATE of next file, delete entirely
"Instantly.ai Cold Emailing for Real Estate.md"  (51KB)
LEAD_FINDER_V4_2026-04-19.md              (8KB)
PIPELINE_AUDIT_2026-04-26_PM.md           (351 lines)
SESSION_HANDOFF_2026-04-19.md             (16KB)
SESSION_HANDOFF_2026-04-24.md             (18KB)
SESSION_SUMMARY_2026-04-19_part2.md       (5KB)
SPAM_AUDIT_2026-04-22.md                  (188 lines)
UPWORK_HANDOFF_PROMPT.md                  (15KB)
WORK_LOG_2026-04-20.md                    (7KB)
audit_trojan_mx_v1_sequence.md            (201 lines)
cold-email-audit-2026-04-22.md            (10KB)
cold-email-audit-v2-2026-04-22.md         (16KB)
DEPLOY_AUTO_SETUP.md                      (6KB, 2026-04-19)
SCALING_RECOMMENDATION.md                 (9KB)
scaling_strategy_research.md              (12KB)
instantly_lead_finder_research.md         (4KB)
jorge-reply-and-ai-agent-update-2026-04-22.md  (7KB)
```

**Action:** `mkdir -p archive/2026-04 && mv <each_file> archive/2026-04/` then update any in-repo references.

---

## 4. ROOT-LEVEL FOLDER BLOAT 📁

53 folders at root. Outputs / scratch / older work that may belong under `/archive/` or `/outputs/`:
- `Flamingovideos/`, `ProofScreenshots/`, `_MEDIA_BACKUP/`, `__pycache__/`
- `autoresearch/`, `supersearch_out/`, `regiopytsa/`, `animations/`
- `_imported_skills/` (already had `archive/` so use that)
- `tmp/`, `cf_assets/`, `hyperframes_lab/` (active or scratch?)

**Action:** spend 15 min triaging. `__pycache__/` is pure noise — `.gitignore` it. `_MEDIA_BACKUP/` belongs on cold storage, not the project root.

---

## 5. THE 5 CRITICAL FIXES — RUN THESE IN ORDER (each ≤30 min)

| # | Fix | Bucket | Time | Impact |
|---|---|---|---|---|
| 1 | **Investigate Brevo list 25 zero-subs** — run `processBrevoNurtureQueueOnDemand`, check Firestore `brevo_nurture_queue`, confirm whether nurture is silently dead | C | 20 min | Could be losing every warm-lead nurture touch |
| 2 | **Strip NEXT_STEP.md historical big rocks** — keep only Apr 27 rock at top, archive the rest | infra | 10 min | Removes HR#8 violation + the 3-conflicting-rocks confusion |
| 3 | **Toggle 6 dead plugin namespaces in Cowork → Plugins** — Alex flips 6 switches OR Claude drives via computer-use | infra | 30s-2min | Frees ~7,500 tokens / session = ~375K tokens / week |
| 4 | **Auto-regen SYSTEM.md function inventory** — replace hand-curated list with `grep` output committed in CI | infra | 30 min | Inventory stays accurate forever |
| 5 | **Move 16 historical .md files to /archive/2026-04/** | infra | 10 min | Root goes 46 → 30 files, faster greps + less cognitive load |

**Combined ROI:** the docs stop lying. Future sessions trust `MASTER_PROMPT.md §4` and don't re-discover the same deltas.

---

## 6. WHAT THIS AUDIT DID NOT CHECK (do next time)

- **Calendly API** — only proxied via Notion calendar. Direct `Calendly /v2/scheduled_events` next time.
- **Meta Graph API for IG/FB** — not pulled this session. `IG_GRAPH_TOKEN` expires periodically; verify next time.
- **GA4 + GSC** — for Flamingo / TT&More client proof verification (HR#9 monthly).
- **Twilio API** — bridge-rate trend per cold-call NEXT_STEP claim.
- **Firestore deep read** — `phone_leads` count, `brevo_nurture_queue` state, `audit_requests` last 7d.
- **DataForSEO + SerpAPI usage** — for monthly cost cap awareness.

Next audit (recommended Monday morning before HR#7 review) should add these 6 platforms.

---

*end of AUDIT_DELTA_2026-04-27.md — re-run weekly Monday morning before HR#7 review*
