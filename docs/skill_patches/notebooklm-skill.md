---
name: notebooklm
description: NotebookLM MCP research skill for JegoDigital — RAG-backed expert answers grounded in Alex's curated notebooks (JegoDigital Expert Playbook 2026, Claude AI Ecosystem Guide, Veo Flow Research, and future domain notebooks). Use EVERY TIME the user asks to query, research, or pull expertise from stored knowledge — triggers include "ask the notebook", "query NotebookLM", "what do the sources say about X", "cross-notebook query", "research in the notebook", "add to notebooklm", "check the playbook", "what does the Claude ecosystem notebook say", "deep research on X", "consult the sources". Also use proactively BEFORE writing any cold email, client proposal, SEO article, or carousel copy — pull brand voice, case studies, and frameworks from the playbook first. Persistent session_id enables iterative multi-turn depth. Stateless-safe: every call can start a fresh session if needed. Requires valid cookies (2-4 week validity) — auto-refreshes via refresh_auth when it detects decay.
---

# NotebookLM MCP — JegoDigital Research Skill

The `@notebooklm-mcp` server turns Alex's curated notebooks into a persistent, source-grounded expertise layer. Use it as the MEMORY LAYER for every other JegoDigital skill. Do NOT guess from training data when a notebook can give you cited, specific answers from Alex's own research.

---

## WHEN TO USE (proactive triggers)

Use the notebooklm skill **before** any of the following — do not ship from general knowledge:

| Task | Call |
|---|---|
| Writing a new cold email campaign | Query `jegodigital-expert-playbook-2026-chat` for reply-rate benchmarks + subject line data |
| Drafting a cotización / client proposal | Query same notebook for Hormozi offer framework + MX broker psychology |
| Building a new SKILL.md or Agent Team pattern | Query `claude-ai-ecosystem-guide-chat` |
| Veo 3.1 prompt engineering | Query `veo-flow-research` (active notebook — default for video work) |
| Planning a blog post (SEO) | Query expert playbook for local SEO / AEO ranking factors |
| Scripting Sofia WhatsApp replies | Query expert playbook for real estate WhatsApp templates |
| Picking next week's priorities | "What are the 3 highest-leverage moves this week?" against expert playbook |

**Do NOT use when:** the answer is already in CLAUDE.md, the current conversation, or a file you just read. Budget is ~50 queries/day — don't burn it on trivia.

---

## AUTHENTICATION

NotebookLM cookies expire every **2-4 weeks**. When a tool call returns auth failure, stop and fix it before retrying:

1. Run `get_health` — confirms whether cookies are live
2. If dead, tell Alex to run `nlm login` locally (writes to `~/.nlm/` — git-ignored)
3. As fallback, call `re_auth` or the `notebooklm.auth-repair` prompt
4. Verify with `get_health` before resuming work

**Never** paste cookie values into chat. Never commit `~/.nlm/` to git.

---

## CORE WORKFLOW (6 steps — always run in order)

### 1. SELECT
Call `list_notebooks` (or trust the current active one) and call `select_notebook` on the right ID. If the task is ambiguous, propose 1-2 candidates and ask Alex which.

### 2. BROAD (start wide, no session_id)
First query: an overview / core-principles question. No `session_id` → MCP creates one and returns it. **Save that session_id** — every follow-up depends on it.

```javascript
ask_question({
  question: "Give me an overview of <topic> and the 3 most important principles"
})
// ← save result.session_id
```

### 3. CHAIN (go deep with same session_id)
Each follow-up narrows scope. Short, focused prompts beat long sprawling ones (NotebookLM times out at 60s on broad multi-part requests — break them up).

```javascript
ask_question({
  session_id: "<saved>",
  question: "Now give me 5 concrete bullets on <sub-aspect>, under 400 words"
})
```

**Chaining rule:** ≤400 words per answer, 1 focused topic per turn. Retry with a narrower prompt if it times out.

### 4. VERIFY CITATIONS
Every answer must be source-grounded. NotebookLM embeds citation numbers (`1 2 3`) — these are the REAL authority. If an answer has zero citations, treat it as low-trust and re-query.

### 5. REFLECT — "Is that ALL?"
Before you respond to Alex, pause and ask yourself: **"Does this actually answer his original request? What's missing?"** If anything is unclear, chain another query in the same session — do not ship incomplete.

The notebook's own prompt echoes this: *"EXTREMELY IMPORTANT: Is that ALL you need to know?"*

### 6. SAVE SYNTHESIS
Consolidate findings to a persistent file so future sessions don't re-burn queries:

- `/jegodigital/knowledge_base/<topic>/<date>_<scope>.md` — curated synthesis
- Append a one-line entry to `/jegodigital/knowledge_base/_INDEX.md` with date + notebook + session_id used
- For repeat-use frameworks, patch the relevant skill's SKILL.md (via `/docs/skill_patches/<skill>-patch.md` if the real skill is read-only)

---

## NOTEBOOK HYGIENE

### When to CREATE a new notebook
- New domain segregation (e.g. "Miami Luxury Real Estate" separate from MX)
- >10 high-signal sources you'll query repeatedly
- Sources that would pollute an existing notebook's answers

### When to QUERY an existing one
- You can answer the question with ≤3 follow-ups
- The topic fits an existing notebook's scope

### Required metadata when registering (`add_notebook`)
Never register a notebook with just name + URL — future Claude sessions need rich metadata to pick it. Provide:

- **name** — descriptive, includes scope year ("JegoDigital Expert Playbook 2026")
- **description** — 1-3 sentences on what's inside
- **topics** — 5-10 specific topic tags
- **use_cases** — 5-10 "use this when" scenarios (full sentences)
- **tags** — short slugs for filtering

### Library as of 2026-04-19
| ID | Name | Sources | Primary use |
|---|---|---|---|
| `jegodigital-expert-playbook-2026-chat` | JegoDigital Expert Playbook 2026 | 24 | Cold email, pricing, MX real estate, SEO/AEO, WhatsApp |
| `claude-ai-ecosystem-guide-chat` | Claude AI Ecosystem Guide | 48 | Agent Teams, Skills, Routines, MCP, AGENTS.md |
| `veo-flow-research` | Veo Flow Research | 76 | Veo 3.1 prompts, viral video, TikTok, Nano Banana |

---

## RATE LIMIT DISCIPLINE (~50 queries/day free tier)

Burn budget wisely. Order of priority when the day is thin:

1. **Synthesis queries** (save to MD, reused forever) — highest ROI
2. **Decision queries** right before a revenue action (write email, send proposal)
3. **Research** for a one-off task

Skip / avoid:
- Trivia that's in CLAUDE.md or training data
- Reformatting (just do it in-session)
- Polling the same notebook 5 times with slight variations — write ONE well-scoped question

**Context bloat warning:** The MCP server exposes ~35 tools. Toggle `@notebooklm-mcp` OFF when you're not actively researching — keeps the context window lean for other skills.

---

## INTEGRATION WITH OTHER JEGODIGITAL SKILLS

### Pattern 1 — Memory Layer (read before write)
Any skill that produces client-facing copy calls notebooklm FIRST:

```
cold-email-copywriting invocation
  → notebooklm.ask_question("latest reply-rate benchmarks for MX B2B cold email, <400 words")
  → use the cited numbers as anchors in the new copy
```

Same pattern for: `jegodigital-cotizaciones` (pull Hormozi frames), `seo-engine` (pull local SEO checklist), `jegodigital-carousels` (pull hooks that convert).

### Pattern 2 — Synthesis → Action Loop
`seo-engine` can't read NotebookLM directly from inside a bash cron. Workflow:

1. notebooklm skill queries the playbook, saves result to `/knowledge_base/seo/<date>_tactics.md`
2. Appends a note to `/AGENTS.md` with the filename
3. Next seo-engine run reads the MD file as ground truth for the week's priorities

### Pattern 3 — Forked Subagent Delegation
For big research pushes (e.g. "become expert on Miami luxury real estate before I send the proposal"), spawn an Explore or general-purpose subagent preloaded with the notebooklm skill:

```
Agent({
  description: "Miami luxury research pass",
  subagent_type: "Explore",
  prompt: "Use the notebooklm skill. Query the expert playbook and Claude ecosystem notebooks for Miami luxury broker psychology, bilingual positioning, price-range norms, and 3 comp agencies to beat. Save to /knowledge_base/miami/2026-04-19_briefing.md. Report under 200 words."
})
```

Keeps research-heavy queries out of the main conversation's context.

---

## KNOWN PITFALLS

1. **60-second timeout on broad queries.** Ask in ≤400-word chunks. If it times out, halve the scope and retry in the same session.
2. **Auth cookies silently decay.** First sign is a `refresh_auth required` error. Do NOT retry blindly — run `nlm login` or prompt Alex.
3. **Persistent MCP vs stateless Python bridge.** The MCP server keeps sessions alive across tool calls. Stateless scripts (outside MCP) open a fresh browser every call — use them only for one-shot batch ingests, never for chained research.
4. **Stale notebook content.** Playbook was curated 2026-04-19. Sources older than 6 months on fast-moving topics (AEO, cold email benchmarks) need a refresh cycle — re-curate quarterly.
5. **Hallucinated answers when sources are thin.** If `answer` arrives with zero citation numbers, treat it as low-trust. Re-query with a tighter prompt or accept that the notebook can't answer.
6. **Context window burn from having @notebooklm-mcp always on.** Disable when idle.

---

## QUICK REFERENCE

### Starter query on current active notebook
```javascript
ask_question({ question: "<your focused question, ≤400 words scope>" })
// save result.session_id for follow-ups
```

### Chained follow-up
```javascript
ask_question({
  session_id: "<saved>",
  question: "<tighter follow-up>"
})
```

### Switch notebook
```javascript
select_notebook({ id: "jegodigital-expert-playbook-2026-chat" })
```

### Cross-notebook (if tool available)
```javascript
cross_notebook_query({
  notebook_ids: ["jegodigital-expert-playbook-2026-chat", "claude-ai-ecosystem-guide-chat"],
  question: "<your question>"
})
```

### Register a new notebook
```javascript
add_notebook({
  id: "<slug-chat>",
  url: "https://notebooklm.google.com/notebook/<uuid>",
  name: "<Human Name>",
  description: "<1-3 sentences>",
  topics: ["topic 1", "topic 2", "..."],
  use_cases: ["Use when...", "..."],
  tags: ["slug-1", "slug-2"]
})
```

### Health check before a big push
```javascript
get_health()  // confirms cookies + session manager
list_notebooks()  // confirms library is intact
```

---

## REMEMBER

- Cite every claim you make back to Alex with the notebook + session_id — treat every answer as trackable.
- Save synthesis to the knowledge base. One query should benefit 10 future sessions.
- When in doubt, ask one more focused follow-up before responding. *"Is that ALL you need to know?"*
