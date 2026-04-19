---
name: notebooklm
description: |
  Research partner powered by Google NotebookLM + Gemini 2.5 via MCP. Use this skill whenever the user wants to research a topic deeply, "become an expert on X", consult authoritative sources, build or update a knowledge base, ask grounded (source-cited) questions about documentation, or create a new NotebookLM project. Triggers include: "notebooklm", "notebook", "research X for me", "what do we know about Y", "add this to our knowledge base", "create a notebook on Z", "become an expert on...", "consult the docs on...", "cite sources for...". Works across every JegoDigital project (SEO, cold outreach, AI cold calling, real estate marketing, client work) and across Claude Cowork + Claude Chat. Do NOT trigger for generic web search (use firecrawl), code editing, or local file tasks.
allowed-tools:
  - mcp__notebooklm__get_health
  - mcp__notebooklm__list_notebooks
  - mcp__notebooklm__search_notebooks
  - mcp__notebooklm__get_notebook
  - mcp__notebooklm__get_library_stats
  - mcp__notebooklm__select_notebook
  - mcp__notebooklm__add_notebook
  - mcp__notebooklm__update_notebook
  - mcp__notebooklm__remove_notebook
  - mcp__notebooklm__ask_question
  - mcp__notebooklm__list_sessions
  - mcp__notebooklm__close_session
  - mcp__notebooklm__reset_session
  - mcp__notebooklm__setup_auth
  - mcp__notebooklm__re_auth
  - mcp__notebooklm__cleanup_data
---

# NotebookLM Research Partner

Grounded, source-cited research via Google NotebookLM (Gemini 2.5) through the `notebooklm` MCP server. Every answer is anchored to the notebook's sources, minimizing hallucinations. Session-based: follow-ups remember prior context so multi-turn research keeps compounding.

> **Alex's use case:** one knowledge base per domain (SEO, AEO, cold email, AI calling, Veo 3.1, real estate, each active client). Feed curated sources once, then query like an expert for months.

---

## When to use this skill

Trigger on any of:

- "What does NotebookLM say about X" / "Ask the notebook about X" / "Consult the [topic] notebook"
- "Become an expert on X" / "Research X deeply" / "Build a knowledge base on X"
- "Create a new notebook for [topic]" / "Add this notebook to my library"
- "Cite sources for X" / "I need grounded answers on X"
- Any deep domain research where we have (or should have) a curated NotebookLM

**Do NOT use for:**
- Generic web search / scraping → use `firecrawl`
- Live SERP / keyword data → use `seo-dataforseo` or `seo-engine`
- One-off factual questions already answerable from training data
- Code, deploy, or file-editing tasks

---

## Pre-flight check (run every session)

Before any real work, verify auth:

```
mcp__notebooklm__get_health
```

Expected: `"authenticated": true`. If `false`:

1. Ask Alex to close all Chrome/Chromium windows.
2. Call `mcp__notebooklm__setup_auth` (or `re_auth` to switch accounts / recover from rate limits — free tier = 50 queries/day).
3. Re-run `get_health` to confirm.

If auth is broken repeatedly: `cleanup_data(confirm=true, preserve_library=true)` then `setup_auth`. The `preserve_library=true` flag keeps the notebook index — never omit it unless Alex explicitly wants a total wipe.

---

## Core workflow

### 1 · Pick the right notebook

```
mcp__notebooklm__list_notebooks       # see what we already have
mcp__notebooklm__search_notebooks     # query by topic/tag
```

Present the top 1–2 candidates to Alex and ask which to use. If the task clearly matches one notebook and nothing else, announce it and auto-switch:

```
mcp__notebooklm__select_notebook(id=<id>)
```

If no notebook fits → propose creating one (see §3).

### 2 · Ask questions — always continue a session

```
// First question — no session_id → creates one
const r = await ask_question({ question: "Give me an overview of <topic>" });
// SAVE r.session_id

// Follow-ups — REUSE the same session_id for depth
ask_question({ question: "Drill into <subtopic>", session_id: r.session_id });
ask_question({ question: "Compare X vs Y for our use case", session_id: r.session_id });
```

**Rules:**

- **Always continue an existing session** for the same task. New session = amnesia.
- Check `list_sessions` before asking — resume the most relevant one instead of starting fresh.
- Ask clarifying questions before implementing; don't guess missing details.
- If multiple notebooks could apply, propose the top 2 and ask.
- If the task changes mid-conversation, ask to reset the session (`reset_session`) or switch notebooks.
- **After every answer: pause, compare with Alex's goal, only respond if 100% sure the answer is complete.** Otherwise plan the next question in the same session.
- Target notebook can be overridden per call via `notebook_id` or `notebook_url` without changing the active default.

### 3 · Add a new notebook (permission required)

**Never add without explicit "yes" from Alex.** Follow this script:

1. Ask: "What's the NotebookLM share URL?" *(how-to below)*
2. Ask: "What knowledge is inside?" (1–2 sentences)
3. Ask: "Which topics does it cover?" (3–5)
4. Ask: "When should I consult it?" (use cases)
5. Propose metadata summary:
   ```
   Name: <suggested>
   Description: <from Alex>
   Topics: [...]
   Use cases: [...]
   Tags: [...]   (optional)
   ```
6. "Add it now?" → only after explicit **Yes**:
   ```
   mcp__notebooklm__add_notebook({ url, name, description, topics, use_cases, tags })
   ```

#### How to get a NotebookLM share link
1. https://notebooklm.google/ → login
2. **+ New** → upload sources (PDFs, docs, URLs, YouTube, etc.)
3. **Share** (top right) → **Anyone with the link**
4. **Copy link** (bottom left) → paste into Claude

Free tier: 100 notebooks × 50 sources × 500k words × 50 queries/day. Google AI Pro/Ultra = 5×.

### 4 · Update or remove notebooks (permission required)

- Update: propose the exact change, then call `update_notebook` only after "yes".
- Remove: confirm full name ("Remove 'X' from your library? (does not delete the source NotebookLM)"), then `remove_notebook` only after explicit "yes".

---

## Session hygiene

- `list_sessions` — see active sessions + age + message count. Continue the most relevant one.
- `reset_session` — clear history but keep same ID. Use when task changes; ask first.
- `close_session` — ask before closing if Alex might still need it.
- Max 10 concurrent sessions; each times out after 15 min idle.

---

## JegoDigital notebook strategy

One notebook per long-lived domain. Build the library up so future sessions have instant expertise. Suggested notebooks to propose to Alex when relevant:

| Notebook (propose) | Sources to feed it | When to use |
|---|---|---|
| **Veo Flow Research** ✅ exists | Veo 3.1 docs, viral property video transcripts, Nano Banana 2 | Property video prompt generation |
| **SEO + AEO Mexico** | Google Search Central, Ahrefs guides, AEO research papers, DataForSEO docs | Any SEO/AEO strategy for Mexico real estate clients |
| **Real Estate Marketing MX** | INEGI data, local broker playbooks, Mundial 2026 tourism reports, zone-specific market reports (Cancún, Tulum, CDMX, GDL, MTY) | Pitching new cities, campaign geo-targeting, proposal copy |
| **Cold Email + Outreach** | Instantly.ai docs, deliverability research, 2026 cold email studies, sequence playbooks | Writing/auditing campaigns, sequence design, spam/deliverability issues |
| **AI Cold Calling** | ElevenLabs Agents docs, Twilio voice API, Gemini Flash tool-use, call-center objection handling | Building/tuning agents A/B/C, prompt improvements |
| **ManyChat + Sofia** | ManyChat API docs, Brevo transactional email, WhatsApp Business rules | Flow debugging, new automation design |
| **Client — <name>** | Client-specific brand docs, brand voice, past campaigns, market data | Any client-specific work (Flamingo, RS Viajes, TT&More, future clients) |

Tag by domain so `search_notebooks` stays precise (e.g., `seo`, `aeo`, `client:flamingo`, `outreach`, `voice`).

---

## Answer quality bar

- Prefer direct quotes / citations when Alex is making a decision.
- If the notebook's answer conflicts with `CLAUDE.md` or current repo state, **trust the repo** and flag the stale source back to Alex — NotebookLM sources can age.
- Never paraphrase away the source count (e.g., "3 sources agree" is more useful than "research shows").
- If coverage is thin, say so explicitly and suggest sources Alex should add.

---

## Quick-start recipes

**"Ask the SEO notebook whether answer-first intros boost AEO visibility"**
1. `get_health` → `search_notebooks("SEO AEO")` → pick notebook.
2. `ask_question({ question: "Do answer-first intros improve AEO/citation visibility in AI search? Cite sources." })` → save `session_id`.
3. Follow-up same session: `"Best-performing answer-first formats for real estate queries?"`

**"Add a new notebook for cold calling"**
Run the 6-step script in §3. Propose metadata. Wait for "yes". Call `add_notebook`.

**"Become an expert on Veo 3.1 for real estate"**
`select_notebook("veo-flow-research")` → multi-turn session, each question builds on the last until Alex has the answer he needs.

---

## Cross-harness portability

This skill lives at `~/.claude/skills/notebooklm/SKILL.md` so it auto-loads in:
- **Claude Code CLI** (every project — no per-project setup needed)
- **Claude Cowork** (when the plugin management skill is active)
- **Claude Chat** / claude.ai (if the notebooklm MCP is connected)

The skill only depends on the `notebooklm` MCP server being connected — no local files, no repo-specific config. If Alex moves to a new project or harness, ensure the MCP is registered and the skill works immediately.
