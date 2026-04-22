# 🚨 CLAUDE — SESSION BOOTSTRAP (HARD RULE #0)

> **This file is the single source of truth for what Claude does in the first 30 seconds of every JegoDigital session.**
> **If you (Claude) are reading this, you have already partially bootstrapped — now complete the rest.**
> **Last updated:** 2026-04-22

---

## Why this file exists

On **2026-04-22**, Claude told Alex *"I don't have the Instantly / ElevenLabs / Meta Ads key in my session."* This was **FALSE**. Every production key lives in:

- `website/functions/.env` (loaded by deploy.yml heredoc from 37 GitHub Secrets)
- `.secrets/` raw token files (`instantly_api_key`, `github_token`, `apify_api_key`, `SEED_SECRET`, `vibe_explorium_api_key_acct2`)

The keys were ALWAYS available. What wasn't available was the **folder mount** — Cowork boots with `User selected a folder: no` by default. Claude skipped mounting the folder and then claimed the keys didn't exist. This wasted Alex's time and broke trust.

**This file exists so that never happens again.**

---

## Bootstrap trigger

Run this bootstrap **the moment any of these words appear in the first user message**:

`jegodigital`, `lead`, `audit`, `cold call`, `cold email`, `brevo`, `instantly`, `elevenlabs`, `manychat`, `sofia`, `calendly`, `meta ads`, `flamingo`, `ttandmore`, `rsviajes`, `goza`, `goodlife`, `solik`, `sms`, `whatsapp`, `carousel`, `instagram`, `tiktok`, `youtube`, `veo`, `remotion`, `client`, `campaign`, `funnel`, `deploy`, `firestore`, `cloud function`, `telegram notification`, `api key`, `access`

Also trigger on a user prompt with NO context but ambiguously related to marketing/outreach/clients.

---

## The 6-Step Bootstrap

### Step 0 — Mount the folder (THE missing step that caused the disaster)

```
mcp__cowork__request_cowork_directory(path="/Users/mac/Desktop/Websites/jegodigital")
```

If the trigger words include a specific client (TTandMore, RSViajes, Flamingo, Goza, GoodLife, Solik), ALSO mount that client's repo separately.

### Step 1 — Verify live API access

```bash
bash /Users/mac/Desktop/Websites/jegodigital/tools/verify_access.sh
```

Auto-heals Instantly key from `.secrets/instantly_api_key`, pings v2 API, checks Brevo + ElevenLabs + Calendly + GSC + Telegram. Must pass before any claim about numbers.

### Step 2 — Load production keys into shell

```bash
set -a
source /Users/mac/Desktop/Websites/jegodigital/website/functions/.env
set +a
```

Available after sourcing: `BREVO_API_KEY`, `INSTANTLY_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`, `SERPAPI_KEY`, `DATAFORSEO_*`, `HUNTER_API_KEY`, `CALENDLY_PAT`, `MANYCHAT_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `META_ACCESS_TOKEN`, `GITHUB_TOKEN`, `APIFY_API_KEY`, `SEED_SECRET`.

Sanity check:
```bash
echo "BREVO: ${BREVO_API_KEY:0:10}... INSTANTLY: ${INSTANTLY_API_KEY:0:10}... EL: ${ELEVENLABS_API_KEY:0:10}..."
```

### Step 3 — Read the 4 canon docs (in this order)

1. `ONBOARDING.md` — the 5-step ritual
2. `CLAUDE.md` — all active HARD RULES
3. `ACCESS.md` — 37-secret registry + `.secrets/` map
4. `NEXT_STEP.md` — today's big rock (HR#8)

### Step 4 — Grep DISASTER_LOG.md for current month (HR#10)

```bash
grep -A 3 "$(date -u +%Y-%m)" /Users/mac/Desktop/Websites/jegodigital/DISASTER_LOG.md
```

### Step 5 — Declare revenue bucket (HR#3)

State one of: **DIRECT-REVENUE** (leads, audits, cold email, cold call, client deliverables) or **REVENUE-SUPPORTING** (docs, infra, bootstrap itself). If neither, ask Alex before proceeding.

---

## Self-check (must pass before any answer)

- [ ] Folder mounted? (`ls /Users/mac/Desktop/Websites/jegodigital` returns files)
- [ ] verify_access.sh green?
- [ ] Keys loaded? (`echo ${BREVO_API_KEY:0:10}` shows real key, not empty)
- [ ] ONBOARDING + CLAUDE + ACCESS + NEXT_STEP read this session?
- [ ] DISASTER_LOG grepped for current month?

---

## 🚫 NEVER SAY THESE PHRASES

- "I don't have access to X API key this session"
- "The key isn't in my environment"
- "I can't see Instantly / Brevo / ElevenLabs data"
- "I need you to give me the key"
- "I need to check if X is connected" *(it IS — you just haven't bootstrapped)*

If any of these feel true, **you skipped Step 0**. Go back and mount the folder.

---

## 🚫 NEVER ASK ALEX THESE QUESTIONS

- "What's your Instantly API key?"
- "Can you give me the Brevo key?"
- "Where is your .env file?"
- "Is the ElevenLabs API connected?"

Alex has already given FULL access via GH Secrets + `.secrets/` + `.env`. Keys are ours.

---

## Full-overview bar

After bootstrap, Claude MUST be able to answer these 4 questions live — without asking Alex — from actual API/file calls:

1. **Instantly:** which campaigns are active, how many leads in each, sends/opens/replies today?
2. **Brevo:** which lists have the newest contacts, which automations are firing, sends today?
3. **ElevenLabs:** how many calls today, which agents are active, last 5 transcripts?
4. **Calendly + ManyChat + Firestore:** new bookings today, hot leads in ManyChat, new audit_requests?

If any answer requires asking Alex, bootstrap failed. Fix it, don't stumble forward.

---

## Canonical references (the ONLY places rules live)

| Topic | File |
|---|---|
| Session bootstrap (this file) | `CLAUDE_SESSION_BOOTSTRAP.md` |
| First-5-min ritual | `ONBOARDING.md` |
| All HARD RULES | `CLAUDE.md` |
| 37 GitHub Secrets + `.secrets/` map | `ACCESS.md` |
| Today's big rock | `NEXT_STEP.md` |
| Past failures (HR#10) | `DISASTER_LOG.md` |
| Weekly / daily cadence | `OPERATING_RHYTHM.md` |
| Known future work | `BACKLOG.md` |
| Cold-email specifics | `COLD_EMAIL.md` |
| Cold-call specifics | `COLDCALL.md` |
| Deploy path | `DEPLOY.md` |

If rule guidance appears in any other file, it is stale — update it or delete it.
