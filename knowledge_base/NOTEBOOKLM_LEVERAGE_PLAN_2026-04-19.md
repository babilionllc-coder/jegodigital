# NotebookLM Leverage Plan for JegoDigital

**Date:** 2026-04-19
**Source notebook:** [Claude AI Ecosystem Guide (Chat + Code + Cowork)](https://notebooklm.google.com/notebook/0072d772-ac6e-4366-9e49-f62aba58fd0e) — 48 curated sources on Claude Code Agent Teams, Sub-Agents, Skills, Routines, Scheduled Tasks, NotebookLM MCP, AGENTS.md, Deep Research, Cowork.
**Session ID:** `5221d64a` (reusable for follow-up queries)
**Author:** Claude (NotebookLM-grounded synthesis)
**Scope:** How JegoDigital — a 1-person agency at ~15 clients targeting $1M USD/year — uses NotebookLM + Claude Code to scale to 50+ clients without adding headcount.

---

## TL;DR

**The transition required is not "using AI better." It's becoming the project manager of an AI workforce.** The research is blunt: a solo operator running 15+ clients across 9 services with single-session Claude Chat will hit five predictable bottlenecks between here and 50 clients. Each has a matching pattern in the Claude/NotebookLM stack. The failure mode is doing none of this and blaming "AI-flavored output" on the wrong thing.

**The single highest-leverage move:** build a notebook *swarm* (not one giant notebook) and wire it into Claude Code via MCP with a nightly 2 AM routine. At day 90, Alex manages ~60 specialized notebooks (9 services + 50 clients + 1 core playbook + a few trend notebooks), with Deep Research running unattended overnight and AGENTS.md compounding every session's learnings.

---

## The 5 Structural Bottlenecks (15 → 50 clients)

Ranked by revenue impact against the $1M target.

### 1. Institutional Memory Decay — *highest revenue impact*
**Symptom:** Client-specific nuance (brand voice, past wins, deal-breakers) gets lost in chat history. Deliverables start drifting toward "generic AI-flavored" output, which kills the premium positioning JegoDigital charges for.
**Pattern:** **Notebook RAG via MCP** — one NotebookLM notebook per client = a "zero-hallucination memory vault." Claude queries it programmatically and every answer comes back source-grounded and citation-backed.
**Why #1 on revenue:** Premium pricing ($4,900–$16,900 MXN/mo retainers + $80K–$200K developer contracts) only survives if delivery quality stays consistent. Memory decay = churn = missed $1M.

### 2. Strategic Blindness (Stale Intelligence)
**Symptom:** Cold email playbooks, AEO tactics, and Mexico real estate trends go stale in 30 days. Campaign performance plateaus.
**Pattern:** **Deep Research** — normal RAG retrieves what you already know; Deep Research *proactively discovers new facts* from the web and writes them back into your notebooks as fresh sources.
**Why high-leverage:** Directly blocks cold email reply rate, AEO rankings, and lead-finder quality — three of the five live pain points.

### 3. Fractured Reasoning (Cognitive Overload)
**Symptom:** One session asked to do research + strategy + copy + review = "mediocre work by the third deliverable." Quality falls as volume rises.
**Pattern:** **Agent Teams** (Opus 4.6, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Spawn a specialized workforce — Researcher, Strategist, Copywriter, Reviewer — working in parallel. Eliminates the "single generalist spread thin" trade-off.

### 4. Expertise Dilution
**Symptom:** Every new session forgets JegoDigital's ICP, tone, pricing rules, and iron-rule lists. Alex re-teaches Claude from scratch.
**Pattern:** **Skills (SKILL.md files)** — institutional knowledge encoded as repeatable procedures. Turns Claude from "smart intern" into "trained teammate" that applies the JegoDigital standard without being prompted twice. (Alex already has ~50 skills — the loop is working.)

### 5. Initiation Fatigue (Manual Friction)
**Symptom:** Every research, triage, or reporting task requires Alex to be at the keyboard. The agency stops growing when Alex sleeps.
**Pattern:** **Claude Code Routines** — cloud-native scheduled automation (nightly 2 AM) or API/webhook-triggered (fires on CRM events). Unattended automation runs on Anthropic's cloud without the laptop open.

### The Glue: AGENTS.md
Every pattern above needs a **cross-session learning layer** or it collapses back into "messy archive." AGENTS.md stores the patterns that actually worked. **Critical rule from the research:** *never let agents write AGENTS.md autonomously* — every line gets human approval, or it bloats into generic context that degrades reasoning.

---

## The Single Session Failure Mode

The research is explicit: every Claude Chat session that starts from zero **loses expertise built in previous sessions**. At JegoDigital today, this leak is biggest in:

1. **Discovery-call objection handling** — every objection Alex heard last week is gone next session unless it's written down.
2. **Lead enrichment rules** — the Iron Rule 7 "no fake first names" lesson is in a skill, but subtler patterns (portal domains, hotel giveaways, SaaS tool noise) aren't centralized.
3. **Brand voice + tone across clients** — Flamingo's voice ≠ RS Viajes' voice ≠ TT&More's voice. Today: one CLAUDE.md for all. Should be: one NotebookLM per client.
4. **What cold email copy actually worked last week** — Instantly analytics get read, mentally absorbed, forgotten. Never written back as a source.

**Fix:** every session ends with the AGENTS.md proposal step, and every notebook gets the "layered Deep Research" treatment (run a DR session → import the output back as a source → run a second DR to compare).

---

## NotebookLM Architecture — Swarm, Not Monolith

**Verdict from the research:** build a swarm of specialized notebooks. One giant notebook fails two ways:

- **Garbage output** — uploading unstructured files loses domain-specific precision.
- **Context token bloat** — too much irrelevant context loads into Claude's window, burning the daily limit and leaving no room for reasoning.

### Technical Boundaries (from sources)
- **Max sources per notebook:** 300
- **Max per source:** 200 MB or 500,000 words
- **Cross-notebook queries:** supported via MCP `cross_notebook_query` — you keep the "big picture" even with a swarm, with per-notebook citations.

### Recommended JegoDigital Swarm

| Layer | Notebook count | Contents | Update cadence |
|---|---|---|---|
| **Agency core** | 1 | SOPs, brand voice, 9-service specs, pricing rules, Iron Rules, CLAUDE.md | Monthly |
| **Service playbooks** | 9 | One per service (cold email, SEO, AEO, social, websites, videos, CRM, AI voice, email marketing) with vetted sources, case studies, tactical manuals | Monthly Deep Research layered update |
| **Client memory vaults** | 1 per client (→50) | Brand guide, Tactiq transcripts, past reports, contract, deal-breakers | After every major milestone |
| **Trend/discovery** | 2–3 | Mexico real estate intelligence, AEO citation triggers, AI agency pricing trends | Nightly cloud routine |

**Target at day 90:** ~60 notebooks total.

---

## Deep Research Workflows — Tied to Live Pain Points

For each of the three highest-impact pain points, the exact NotebookLM workflow:

### Pain Point 1 — Cold Email Reply Rate < 3% on Instantly
**Sources to add to "Cold Outreach Strategy" notebook:**
- Last 90 days of Instantly analytics (open / reply / bounce per campaign)
- Tactiq transcripts of past client calls where the original "pain" was surfaced
- JegoDigital ICP doc

**Deep Research query:**
> "Find the 10 most successful high-ticket B2B cold email personalization patterns for 2026. Focus on ROI data, success metrics, and common failure points in 'generic' outreach."

**Synthesis step:** Use `notebook_query` to compare discovered patterns against the current 5-step sequences in `cold-email-sequences-2026.md`. Identify authority gaps.

**Action:** Generate a Personalization Playbook implementing a 3-step ICEBREAKER logic and save the reusable pattern to AGENTS.md.

### Pain Point 2 — AEO: Getting Cited in ChatGPT/Perplexity for Mexico Real Estate
**Sources to add to "SEO & AEO Intelligence" notebook:**
- Screenshots/text of current ChatGPT, Perplexity, Gemini responses for `inmobiliarias en Cancún`, `mejor agencia inmobiliaria Playa del Carmen`, etc.
- Mexican real estate authority reports (AMPI, Lamudi market reports, legal safety guidelines)
- Competitor sites currently being cited

**Deep Research query:**
> "Research the specific semantic connections (e.g., 'legal safety' + 'luxury rentals') that AI engines use to verify authority in the Cancun real estate market."

**Synthesis:** `notebook_describe` to extract what vetted (cited) sources have in common vs. current JegoDigital / client content.

**Action:** Generate an Authority Map infographic via NotebookLM Studio — the content gaps Alex needs to fill to win citations.

### Pain Point 3 — Discovery Calls Lost to Price Objections
**Sources to add to "Sales Objection & Value Frameworks" notebook:**
- Tactiq transcripts of the last 10 failed discovery calls
- Current pricing packages (Pack Crecimiento, Dominación, bundles)
- Verified results one-pager (Flamingo 4.4x, GoodLife 300%)

**Deep Research query 1 (gap analysis):**
> "Extract the exact phrasing of price objections from uploaded transcripts and identify the specific minute mark where momentum was lost."

**Deep Research query 2 (framework discovery):**
> "Search for value-based ROI justification frameworks for 1-person AI agencies in 2026. Focus on frameworks that anchor price to 'time-saved' or 'revenue-multiplied' rather than hourly rates."

**Action:** `studio_create` a Rebuttal Playbook + Value-Mapping slide deck for live calls.

### Compound Learning Rule (applies to ALL three)
After each workflow runs: **import the Deep Research output back into the parent notebook as a new source, update AGENTS.md with the pattern, create or update a SKILL.md if the workflow will repeat.** This is how expertise actually compounds instead of evaporating.

---

## 30 / 60 / 90-Day Rollout

Weekly time investment starts heavy and falls off fast as the system self-runs.

### Phase 1 — Days 1–30: The Grounded Memory Layer
**Goal:** specialized knowledge base + eliminate hallucination. **Time:** 6–8 hrs/week.

**Week 1 — Agency Core**
- Create notebook: **JegoDigital Expert Playbook** (already done April 19).
- Load: internal SOPs, brand voice, 9-service specs, CLAUDE.md, pricing rules.
- Run `nlm login` to extract persistent auth cookies for automated MCP access.

**Week 2 — Lead-Finder Optimization**
- Create notebook: **Mexico Real Estate Intelligence**.
- Deep Research: *"Find unlisted high-intent investor forums and real estate associations in Mexico for 2026. Identify local regulatory changes affecting foreign buyers."*
- AGENTS.md: add `Lead Enrichment Pattern: anchor search to local Mexican legal requirements`.

**Week 3 — Cold Email & GTM**
- Create notebook: **Cold Outreach Strategy**.
- Run the cold email Deep Research query above.
- Create Skill: `personalize-outreach` — calls `notebook_query` for brand voice before drafting.

**Week 4 — Initial Client Vaults**
- Create individual memory vaults for the first 15 clients (Flamingo, TT&More, RS Viajes, GoodLife, Goza, Solik, + current retainers).
- Load: Tactiq transcripts, past reports, deal-breakers, brand guides.

### Phase 2 — Days 31–60: Operational Intelligence
**Goal:** unattended automation + proactive discovery. **Time:** 4–5 hrs/week.

**Week 5 — AEO Ranking Engine**
- Create notebook: **SEO & AEO Intelligence**.
- Run the AEO Deep Research query above.

**Week 6 — Nightly Triage Routine**
- Schedule Claude Code Routine for 2:00 AM daily: *"Check Google Drive folders for new client docs, sync to correct notebooks, draft morning briefing on any project drift."*
- AGENTS.md: add `Routine Protocol: never auto-update AGENTS.md; propose changes for human approval to avoid context bloat.`

**Week 7 — Sales & Pricing Mastery**
- Create notebook: **Sales Objection & Value Frameworks**.
- Run the discovery-call Deep Research queries above.

**Week 8 — Performance Hardening**
- Run `cross_notebook_query` across all 15 client vaults to surface patterns repeatable to other clients.
- Claude Code OWASP-style security audit of lead-finder scripts + Instantly sender auth.

### Phase 3 — Days 61–90: Scaling the AI Workforce
**Goal:** deploy Agent Teams to absorb the 15→50 client jump. **Time:** 2–3 hrs/week.

**Week 9 — Agent Team Orchestration**
- Enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- Spawn: Lead (Strategy) + Researcher (NotebookLM) + Copywriter (Instantly sequences) + Reviewer.
- Researcher pulls from the Client Vault in parallel with Copywriter drafting.

**Week 10 — Event-Driven Personalization**
- Schedule Webhook Routine: *"When a new lead hits the CRM, trigger Claude to pull relevant case studies from NotebookLM and draft a custom proposal."*

**Week 11 — Cross-Domain Scaling**
- Create notebook: **Global AI Trends 2026**.
- Deep Research: *"Compare marketing vs. operational AI automation trends in high-ticket real estate."*
- `studio_create`: 2026 Strategy Infographic for proposal collateral.

**Week 12 — Retrospective + Hardening**
- Review AGENTS.md — delete stale entries.
- Audit: all 50 prospective client slots have vault templates ready. Nightly Triage confirmed running.

---

## Day 90 — End State Snapshot

**Alex is no longer a solo operator — he is the project manager of an AI workforce.**

| Metric | Day 0 | Day 90 |
|---|---|---|
| Active NotebookLM notebooks | 3 | ~60 (9 services + 50 client vaults + 1 core + 2–3 trend) |
| Unattended nightly work | 0 hrs | ~6 hrs (2 AM routine) |
| Manual summarization overhead | High | ~90% reduced |
| Client call admin overhead | High | ~66% cut |
| Deliverable citation rate | Ad hoc | 100% source-grounded |
| Context-switching between clients | Painful | One `select_notebook` call |

**What it feels like for Alex:** open Cowork at 8 AM, read the morning briefing from the 2 AM routine (new regulatory changes, campaign performance deltas, hot leads to respond to). Spawn an Agent Team to handle Tuesday's three deliverables in parallel. Check AGENTS.md at end of day, approve 2–3 proposed learnings. Close laptop.

---

## Priority Action — Do This Week

Pick exactly one. The research's top recommendation is notebook memory per client (bottleneck #1), but sequencing matters. Suggested ordering:

1. **This week:** create one client memory vault (start with Flamingo — most data, most at risk of drift). Load their Tactiq transcripts, last 3 reports, and brand guide. Wire it into the next Flamingo deliverable via `ask_question`.
2. **Next week:** write up the result as an AGENTS.md entry, then replicate for RS Viajes and TT&More.
3. **Week 3:** if the delivery quality improvement is visible, roll out to remaining clients + start the nightly routine.

Do *not* attempt all 12 weeks in parallel — that reproduces the "fractured reasoning" failure mode the system is trying to fix.

---

## The 7 Routines to Build (Ranked by ROI)

From the same research session. Build in this order: #4 first (so other routines feed on fresh data), then #1 + #2 (revenue-proximate), then #3 / #5 / #7, then #6 once Tactiq webhook is wired.

| # | Routine | Schedule | Trigger | Notebook | Output | ROI justification |
|---|---|---|---|---|---|---|
| 1 | Mexico Real Estate Market Watcher | `0 2 * * *` | scheduled | Mexico Real Estate Intelligence | Intelligence briefing + Slack summary | Domain authority without daily manual searching |
| 2 | Inbound Lead Context Enricher | immediate | webhook (CRM/form) | JegoDigital Expert Playbook | Personalized proposal draft | Eliminates ~45 min/lead of prep |
| 3 | AEO Authority Gap Monitor | `0 9 * * 1` | scheduled | SEO & AEO Intelligence | Authority-map infographic | Directly unblocks "not cited in ChatGPT" |
| 4 | Nightly Source Freshness Sync | `0 3 * * *` | scheduled | all client vaults (batch) | Log + change summary | Protects against memory decay — foundation routine |
| 5 | Cold Outreach Optimization Triage | `0 8 * * *` | scheduled | Cold Outreach Strategy | Sequence tweaks for approval | Attacks <3% reply rate |
| 6 | Sales Call Post-Game Processor | per call | webhook (Tactiq) | Sales Objection & Value Frameworks | Rebuttal improvement MD | Every lost call becomes training |
| 7 | Weekly Client Results Summarizer | `0 16 * * 5` | scheduled | all client vaults | Per-client status MDs | Consistent delivery across 15+ clients |

## Open Questions for Alex

1. Do we want client vaults to auto-sync from Google Drive (convenient, but requires sharing GDrive folders with the Google account that owns NotebookLM) or stay manual (tighter control, more friction)?
2. Which 2 clients besides Flamingo should get the first vault treatment? Best candidates by data density: RS Viajes, TT&More, Goza.
3. Budget check: are we on NotebookLM free tier (50 queries/day, 50 notebooks) or Google AI Pro/Ultra (5x limits)? At 60 notebooks we exceed the free tier's notebook cap — upgrade is required for the day 90 end state.
4. Are we comfortable running `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in production workflows, or do we pilot it on non-client work first?

---

## Sources

- [Claude AI Ecosystem Guide (Chat + Code + Cowork) — NotebookLM](https://notebooklm.google.com/notebook/0072d772-ac6e-4366-9e49-f62aba58fd0e) (48 sources, session `5221d64a`)
- [JegoDigital Expert Playbook 2026 — NotebookLM](https://notebooklm.google.com/notebook/f342fe63-0abf-4283-a50f-55f4d40081cb) (20+ sources, cross-reference for client-facing tactics)
