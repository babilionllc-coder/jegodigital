# Session Handoff — NotebookLM Expertise Build
**Date:** 2026-04-19
**Duration:** ~2 days of compacted work (single-session context)
**Goal:** Turn Claude into a source-grounded expert on (a) JegoDigital's cold-outreach + sales playbook and (b) using Claude itself effectively, via NotebookLM-backed RAG.

---

## 1. WHAT WAS ACCOMPLISHED ✅

### NotebookLM Library (now live — 3 notebooks registered in MCP)
| Notebook ID | Name | Sources | Use case |
|---|---|---|---|
| `jegodigital-expert-playbook-20` | JegoDigital Expert Playbook 2026 | 24 | Cold email, pricing, MX real estate, SEO/AEO, WhatsApp |
| `claude-ai-ecosystem-guide-chat` | Claude AI Ecosystem Guide | 48 | Agent Teams, Skills, Routines, MCP, AGENTS.md |
| `veo-flow-research` | Veo Flow Research | 76 | Veo 3.1 prompts, viral video, TikTok |

Both new notebooks were built end-to-end via Chrome MCP automation (URL paste, source import, rename, share, register).

### Research queries run
- **Claude Ecosystem notebook** (session `73a720cf`, 3 queries): SKILL.md best practices, critical pitfalls, 3 sibling-skill integration patterns
- **JegoDigital Playbook** (session `28652b20`, 2 queries): 5 reply-rate moves + 5 close-rate/revenue moves, both source-cited

### Deliverables saved
| File | What it is |
|---|---|
| `/knowledge_base/expert_playbook_2026/00_source_list.md` | The 24 curated source URLs |
| `/knowledge_base/expert_playbook_2026/01_master_playbook.md` | 10-move master playbook (5 reply + 5 close/revenue) |
| `/docs/skill_patches/notebooklm-skill.md` | 233-line SKILL.md ready to place at `~/.claude/skills/notebooklm/SKILL.md` |
| `/docs/skill_patches/jegodigital-carousels-patch.md` | Earlier patch (Cloud Run mockup pipeline instructions) — still pending apply |

---

## 2. WHAT WAS NOT DONE ❌ (the honest gaps)

- **The notebooklm skill is NOT installed yet.** The file is ready at `/docs/skill_patches/notebooklm-skill.md` — sandbox `.claude/skills/` is read-only, so Alex must copy it manually to `~/.claude/skills/notebooklm/SKILL.md` on the Mac.
- **No audit of current JegoDigital skills vs. playbook findings.** I didn't check whether `cold-email-copywriting`, `jegodigital-cotizaciones`, or `instantly-cold-outreach` incorporate any of the 10 moves.
- **No audit of live Instantly campaigns.** The playbook says "standardize 3-step follow-ups" but I didn't verify which of your active campaigns actually have Steps 2–5 built.
- **No concrete artifacts produced from the playbook.** The "Why Conversation" question list, the 3-tier pricing template, and the AMPI Cancún micro-campaign were listed as next actions but never drafted.
- **No Memory Layer wiring.** The integration pattern says sibling skills should call notebooklm before writing client copy — not wired into any existing skill yet.
- **carousels skill patch (from 2 days ago) still unapplied.**

---

## 3. WHERE WE STAND — HONEST BOTTLENECK DIAGNOSIS

Based on the notebook sources and my scan of CLAUDE.md:

### Bottleneck #1 — Pricing commodity trap (structural)
$3K–$20K MXN/mo × ~30 clients max = $226K USD/yr ceiling. Cannot hit $1M without: (a) developer contracts $80K–$200K MXN per project, (b) performance-based deals ($500–$2K/qualified lead), (c) white-label partners $40K–$60K MXN/mo. **None of these revenue streams have concrete outreach playbooks today.** Current machine only sells retainers.

### Bottleneck #2 — Cold email reply rate leakage
CLAUDE.md mandates 5-step sequences but there's no systematic verification that every active campaign actually has Steps 2–5 built. Woodpecker data: **42% of replies come from follow-ups.** Missing Steps 2–5 = losing nearly half your replies.

### Bottleneck #3 — Discovery call close rate
No "Why Conversation" framework in use. Alex still walks into Calendly calls and pitches the 9-service menu. Chris Do / Hormozi research in the notebook says this is the #1 reason agencies commoditize themselves. **Expected lift from Why Conversation + 3-tier proposals: 2x close rate at 2x average ticket.**

### Bottleneck #4 — Skills are not data-grounded
None of the existing skills (`cold-email-copywriting`, `jegodigital-cotizaciones`, `instantly-cold-outreach`) query the NotebookLM playbook before writing copy. Every session regenerates opinions from training data instead of using your curated research. **This is what we were trying to fix and only 50% fixed.**

### Bottleneck #5 — SKILL.md for notebooklm not installed
Without it, future sessions won't know the skill exists. They'll re-burn queries or skip the RAG layer entirely.

### Bottleneck #6 — Fogginess in 9-service menu (from notebook blunt audit)
Prospects don't want a menu — they want to buy the "Why." Current Instantly copy and website both lead with the 9-service list. Notebook recommends collapsing public-facing marketing to 3 outcomes (more leads 24/7, #1 on search, sell without being there) and keeping the 9-service architecture internal.

---

## 4. WHAT'S NEXT — PRIORITIZED BACKLOG

### P0 (do this week — unblocks everything else)
1. **Apply notebooklm SKILL.md** — copy `/docs/skill_patches/notebooklm-skill.md` to `~/.claude/skills/notebooklm/SKILL.md`. Takes 30 seconds.
2. **Apply carousels patch** — same pattern for `/docs/skill_patches/jegodigital-carousels-patch.md`.
3. **Audit Instantly campaigns** — run a check on every active campaign: does it have Steps 2–5 live? Does Step 1 subject use `{{companyName}}`? Task for a subagent, report back.

### P1 (do before next Calendly call)
4. **Build the "Why Conversation" playbook** — draft 5 opening questions Alex asks at minute 0 of every discovery call. Based on Chris Do framework from notebook.
5. **Build 3-tier pricing template** — Lead Capture / Full Automation / Strategic Growth. Ready-to-use cotización scaffold.
6. **Rewrite Instantly Step 1 subjects** to all 5 active campaigns using `{{companyName}}` or `{{website}}` personalization.

### P2 (scale moves)
7. **Patch `cold-email-copywriting` skill** to query notebooklm before any new campaign — Memory Layer pattern.
8. **Patch `jegodigital-cotizaciones` skill** to pull Hormozi offer frame + 3-tier anchoring from notebooklm.
9. **Draft AMPI Cancún micro-campaign** — 172 partners, "digitalization" frame, launch before summer.
10. **Build developer-contract outbound playbook** — the #1 revenue unlock toward $1M. Zero infra for this today.

### P3 (system upgrades)
11. **Write AGENTS.md** for the repo — compound learning across sessions.
12. **Set up nightly Routine** (2am) that queries the playbook for "3 highest-leverage moves this week" and posts to Telegram.
13. **Refresh NotebookLM auth cycle** — cookies expire every 2–4 weeks, set a reminder.

---

## 5. CHALLENGES / KNOWN ISSUES

- **Sandbox `.claude/skills/` is read-only.** All skill changes ship as patch files in `/docs/skill_patches/` that Alex applies manually.
- **NotebookLM queries time out at 60s on broad prompts.** Must chunk queries to ≤400-word scope and chain via `session_id`. My first "10 moves" query hit this wall — had to split into reply/close halves.
- **Free tier caps at ~50 queries/day.** Budget carefully. Synthesis queries (save to MD) are always worth it; trivia queries are not.
- **Some source URLs blocked by Cloudflare during import** (acquisition.com, brightlocal). Expected — 22 of 24 made it in.
- **I drifted from "audit and fix" to "generic playbook dump."** This session produced the artifact but didn't fix the underlying skills. The next session should be surgical: pick 1 bottleneck, apply research, patch the specific skill, ship.

---

## 6. HOW TO MOVE FORWARD — RECOMMENDED NEXT SESSION BRIEF

Open the next Claude session with this exact prompt:

> Read `/docs/session_handoffs/2026-04-19_notebooklm_session.md`. Then pick ONE of the following and go deep:
>
> **A) P0 kickoff** — apply the notebooklm SKILL.md, apply the carousels patch, audit every Instantly campaign for Steps 2–5 completeness + subject personalization, and report concrete fixes with exact edits to make.
>
> **B) Revenue unlock** — build the developer-contract outbound playbook from scratch: target list, outreach sequence, proposal template, kickoff call script. This is the #1 path to $1M/yr per CLAUDE.md revenue model.
>
> **C) Close-rate kit** — build the 5-question "Why Conversation" script + 3-tier pricing template + handoff doc for Alex to use on his next Calendly call. Based on Chris Do / Hormozi research in the JegoDigital Expert Playbook notebook.
>
> **D) Memory Layer wiring** — patch `cold-email-copywriting` and `jegodigital-cotizaciones` skills so they query notebooklm as the first step in every run. Eliminates "regenerating from training data" pattern across the agency.
>
> **Pick one. Complete it end-to-end. Do NOT do all four.**

Also remind the next session:
- `jegodigital-expert-playbook-20` is the notebook ID for the playbook
- Use short, chained queries (≤400 words per scope)
- Check auth (`get_health`) before burning queries

---

## 7. TL;DR

**Done:** NotebookLM library is built (3 notebooks, 148 sources total), research is cited and captured in 2 persistent MD files, notebooklm SKILL.md is drafted and ready to install.

**Not done:** The skill isn't applied, no existing skills have been patched to use it, no concrete revenue-moving artifact was produced from the 10-move playbook.

**Biggest bottleneck:** The pricing commodity trap + zero infrastructure for developer contracts, performance deals, and white-label partners. That's where the $774K gap to $1M lives.

**Next session should:** Pick ONE of the 4 options above and ship it completely instead of spreading across all of them.
