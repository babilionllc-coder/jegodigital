---
name: jegoroom
description: JegoDigital's in-house Common Room clone — 24/7 intent detection for MX real estate prospecting. Use EVERY TIME Alex wants to surface hot accounts, run a daily intent digest, enrich a specific account into the outbound pipeline, or manually kick a signal collector. Triggers — jegoroom, run jegoroom, intent check, who's hot, hot accounts, daily intent digest, intent digest, enrich account, enrich and push, hot account [company/domain], intent signals, signal digest, intent scoring, who should I call today, intent-based leads, signal-based outreach, watch intent, new hot leads. DIFFERENT from jegoclay (enrichment of EXISTING lists) — JegoRoom FINDS the accounts, JegoClay ENRICHES them. DIFFERENT from lead-finder (SerpAPI+Google Maps batch prospecting) — JegoRoom is continuous signal detection, not one-off batches. NEVER publishes or contacts on its own — always returns a ranked list + enrichment for Alex's approval before outbound fires.
---

# JegoRoom — Intent Detection Operator Skill

## What this skill does

JegoRoom is JegoDigital's **in-house Common Room replacement**. It replaces a $625-2500/mo SaaS subscription with a $0 DIY stack built on top of APIs you already pay for (SerpAPI, DataForSEO, Firecrawl, Gemini, Hunter, Firebase).

There are **two halves**:

1. **Autonomous backend (lives in `tools/jegoroom/` + `.github/workflows/jegoroom.yml`)**
   - **Signal collectors** run on GitHub Actions cron, 24/7, writing raw signals to Firestore `intent_signals`.
   - **Scoring engine** runs every 2 hours, uses Gemini 2.5-flash to classify signals, aggregates into `intent_accounts/{domain}` with rolling 30-day decayed scores.
   - When an account crosses `score_30d >= 70`, a dedicated `intent_hot_transitions/{auto}` doc is written.
   - A Cloud Function (`jegoRoomAlertOnHotTransition`) fires an instant Telegram alert.

2. **This skill — the operator layer (lives in `skills/jegoroom/scripts/`)**
   - Runs on-demand when Alex (or Claude) invokes it.
   - Queries Firestore intent_accounts for hot/warm accounts.
   - Optionally enriches hot accounts via JegoClay (the enrichment engine).
   - Optionally pushes enriched accounts to Airtable `Leads` table (via the Airtable MCP already connected).

## When to trigger this skill

Use EVERY TIME Alex asks:
- "who's hot right now" / "show hot accounts"
- "run jegoroom" / "intent check" / "who should I call today"
- "daily intent digest" / "morning intent report"
- "enrich this account and push to Airtable"
- "is there anything new in the pipeline?"

Do NOT use for:
- Writing blog posts → `seo-content-engine`
- Enriching a CSV of leads → JegoClay (see `tools/lead_enrichment_engine.py` + `enrich-leads.yml`)
- Batch Google Maps / LinkedIn scraping → `lead-finder` + `apify-linkedin`
- Sending cold email → `cold-email-copywriting` + `instantly-cold-outreach`

## 3 canonical operations

### 1. Show hot accounts (default when Alex asks "who's hot")

```bash
python3 skills/jegoroom/scripts/show_hot.py --limit 20 --min-score 70
```

Returns a ranked list of accounts with `score_30d >= 70`, freshest first. Each row includes:
- Company name + domain + city
- `score_30d` (0-100)
- `signals_30d` (count)
- Most recent signal summary (≤18 words)
- Hours since `hot_since`

### 2. Daily intent digest (morning routine)

```bash
python3 skills/jegoroom/scripts/daily_digest.py
```

Produces a daily brief covering:
- New hot accounts in the last 24h
- Accounts that cooled off (score dropped below 70)
- Top 10 "warming" accounts (score 50-69 — watch these)
- Total signals collected in last 24h by source
- Signals rejected by Gemini ICP filter (sanity check)

Output format: Slack-friendly markdown + Telegram HTML (pick one via `--output=slack|telegram|plain`).

### 3. Enrich + push a hot account to Airtable

```bash
python3 skills/jegoroom/scripts/enrich_and_push.py --account-id rolex-inmobiliaria.mx
```

Flow:
1. Pulls the account from `intent_accounts/{account-id}`.
2. Triggers the JegoClay enrichment workflow on its domain (calls the existing `enrich-leads.yml` pipeline via a one-off CSV).
3. Waits for results, extracts: DM name, DM email (Hunter), phone, PageSpeed score, detected pains.
4. Pushes an Airtable `Leads` row into base `appqBJCNb81pa07Dr` with Source=Intent, Stage=Hot, and the signal history as Notes.
5. Returns the Airtable record URL so Alex can tap through on his phone.

## Critical rules

1. **Never contact leads automatically.** This skill only QUERIES and ENRICHES. Outbound (cold email, ElevenLabs call, WhatsApp) must be fired by Alex or by a different skill after explicit approval.
2. **Never fabricate signals or scores (HR-0).** Every number returned cites a real Firestore document pulled in this session. If Firestore is unreachable, fail loudly — never invent data.
3. **Honor the ICP rejection logic.** If the scoring engine marked `icp_rejected=true` on a signal, the skill must NOT resurrect it.
4. **Write, don't delete.** The skill never deletes Firestore docs. To kill a false-positive hot account, mark it `ignored=true` with a reason (supported via `show_hot.py --ignore <account-id> --reason "..."`).

## File layout

```
skills/jegoroom/
├── SKILL.md                      ← this file
├── README.md                     ← human-readable ops reference
└── scripts/
    ├── show_hot.py               ← op 1: list hot accounts
    ├── daily_digest.py           ← op 2: morning brief
    └── enrich_and_push.py        ← op 3: JegoClay + Airtable

tools/jegoroom/   (backend — not part of this skill, but referenced)
├── common.py                     ← shared Firestore + helpers
├── collect_hiring.py             ← Collector 1: SerpAPI hiring
├── score_accounts.py             ← Scoring engine (Gemini 2.5-flash)
└── collect_*.py                  ← future collectors (GMaps, launches, IG)
```

## Required environment

All scripts read these env vars. In dev, load via `set -a && source website/functions/.env && set +a`:

- `FIREBASE_ADMIN_SA_JSON` — service account JSON for Firestore access
- `GEMINI_API_KEY` — only needed by `enrich_and_push.py` if re-ranking
- `GH_PAT` — only needed by `enrich_and_push.py` to trigger enrich-leads.yml

Airtable sync uses the already-connected **Airtable MCP** (no extra key needed inside the skill — Claude talks to it via the MCP tools when invoking from a Cowork session).

## HR-6 verification pattern

Every time the skill reports "N hot accounts surfaced" or "pushed to Airtable," the output MUST include:
- Firestore document IDs read (proof of live query)
- Airtable record IDs created (proof of push succeeded)

Never write "done" without those two IDs in the same output.

## Related docs

- Architecture diagram → `NEXT_STEP.md` (JegoRoom section, shipped 2026-04-23 PM)
- Disaster log on false-positive intent signals → `DISASTER_LOG.md`
- How to tune Gemini scoring weights → edit `tools/jegoroom/common.py::signal_type_weight()` and re-deploy
