# JegoDigital — Claude Onboarding

> **Purpose:** one document that a fresh Claude session reads and immediately knows (a) what JegoDigital is, (b) what to work on today, (c) which rules are non-negotiable, (d) how to deploy safely, (e) what to NEVER do.
> **If you're new here, this is your first file. Read top-to-bottom.**
> **Last updated:** 2026-04-21

---

## 1. WHAT JEGODIGITAL IS (60 seconds)

One-person AI-powered marketing agency for **real estate agencies and developers in Mexico**. Alex Jego runs it solo, using a stack of AI tools to deliver like a 10-person shop. Clients never know it's AI-powered — we position as a premium full-service agency.

**Revenue goal:** $1M USD/yr ($1.67M MXN/mo). **Status 2026-04-21:** 0 paying clients, $0 MRR, 24-month runway to goal.

### The 9 services we sell (and ONLY these 9)

1. Captura de Leads 24/7 con IA *(entry "Trojan Horse" — FREE setup)*
2. Posicionamiento SEO Local
3. Presencia en Buscadores Inteligentes (AEO)
4. Gestión de Redes Sociales
5. Sitio Web de Alto Rendimiento
6. Videos de Propiedades
7. CRM + Panel Admin
8. Asistente de Ventas 24/7 (AI voice)
9. Email Marketing y Seguimiento

Full service details + bundles in `CLAUDE.md §THE 9 SERVICES`.

### The sales funnel

Cold email (Instantly) / Cold call (ElevenLabs) / Instagram DM (ManyChat-Sofia) → positive reply → **free audit** (45 min delivery) → Calendly call with Alex → proposal → paying client.

Trojan Horse = lead with Service 1 free setup. No pricing ever in writing. Pricing is Calendly-only.

---

## 2. YOUR FIRST 5 MINUTES EVERY NEW SESSION

**In this exact order, do these 5 things before ANY other work:**

### Step 1 — Verify live API access (HARD RULE #1, #2)

```bash
bash /Users/mac/Desktop/Websites/jegodigital/tools/verify_access.sh
```

This auto-heals the Instantly key from `.secrets/instantly_api_key` and pings the v2 API. If it fails, follow the script's error message. Do NOT write any report, number, or recommendation until this passes.

### Step 2 — Read `NEXT_STEP.md` (HARD RULE #4)

```bash
cat /Users/mac/Desktop/Websites/jegodigital/NEXT_STEP.md | head -50
```

The item at #1 is **TODAY'S BIG ROCK** (HARD RULE #8). That's what you work on first. If Alex's current prompt doesn't match the big rock, ask which takes priority.

### Step 3 — Scan `DISASTER_LOG.md` for relevant past failures (HARD RULE #10)

```bash
grep -i "<keyword from current task>" /Users/mac/Desktop/Websites/jegodigital/DISASTER_LOG.md
```

If there's a hit, read it. Either avoid the failed approach or explain what's different this time.

### Step 4 — Check `OPERATING_RHYTHM.md` for today's scheduled ops

Is today Monday? → Run the Weekly Revenue Review (HARD RULE #7).
Is today the 1st? → Run the Client Proof Refresh (HARD RULE #9).
Otherwise → Daily Ops check (outreach, inbox triage, cold-call batch).

### Step 5 — Type your first response with the bucket label (HARD RULE #3)

Before writing code/docs, declare the revenue bucket:
> `[Bucket A/B/C/D/E] — <one sentence linking this task to a paying client this month>`

If you can't type that sentence honestly, you're working on the wrong thing.

---

## 3. HARD RULES — non-negotiable (HR#0 through HR#10)

Full text in `CLAUDE.md`. Quick-scan here:

| # | Rule | One-line enforcement |
|---|---|---|
| **HR#0** | NEVER fabricate numbers | Every number cites a live API/Firestore call in THIS session |
| **HR#1** | NEVER run blind on cold email | `verify_access.sh` passes before any cold-email report |
| **HR#2** | Universal verify-live across all 8 platforms | ElevenLabs/Instantly/Brevo/Calendly/Firestore/Meta/GSC/GA4 all require live pulls |
| **HR#3** | Revenue-first prioritization | Every task traces to a paying client this month; Bucket A/B beats C/D/E |
| **HR#4** | Read `NEXT_STEP.md` first every session | #1 item = today's work |
| **HR#5** | Lead quality gate before upload | 5 gates (role, name, title, domain, ICP), all pass, or don't ship |
| **HR#6** | Never mark "done" without proof | Live verification in same tool-call sequence as the claim |
| **HR#7** | Monday Revenue Review | Autonomous every Monday, live pulls, Slack post |
| **HR#8** | One big rock per day | Max 1 big rock + 3 supporting tasks |
| **HR#9** | Client proof stays fresh | Monthly verification of Flamingo/Goza/GoodLife/Solik metrics |
| **HR#10** | Log failed experiments | Grep `DISASTER_LOG.md` before risky moves |

Plus these permanent project rules (not numbered but equally binding):

- **CLIENT DOMAIN RULE** — company name ≠ domain. Canonical source: `website/showcase.html`.
- **BLOG POST QUALITY GATE** — 5-step pipeline (research → brief → write with real images → score ≥80 → publish). Autonomous mode for "run seo content engine".
- **NO-AI-IMAGES RULE** — banned in all blog posts. Real screenshots only.
- **INTERNAL-LINKS RULE** — ≥4 contextual in-body internal links per blog post.
- **PRICING RULE** — never in writing, Calendly-only.

---

## 4. THE AI STACK (never mention to clients)

| Tool | Purpose |
|---|---|
| **Claude AI** | Strategy, content, code, automation |
| **Instantly.ai** | THE ONLY cold email tool. Sending domain: aichatsy.com |
| **ElevenLabs + Twilio** | AI cold calling (3 agents, July voice MD6rLAhozcrmkdMZeOBt) |
| **ManyChat (Sofia)** | WhatsApp + Instagram inbound qualification |
| **Brevo** | Email marketing for EXISTING leads/clients only (NOT cold) |
| **Firebase / GCP** | Hosting, Cloud Functions, Firestore (project: `jegodigital-e02fb`) |
| **Cloud Run mockup-renderer** | HTML→PNG microservice for complex mockups |
| **DataForSEO + SerpAPI + Firecrawl + Perplexity** | SEO/AEO research |
| **Hunter.io** | B2B email finder |
| **SEO Antigravity** | Custom SEO/AEO tool |

### Dead tools — never reference

Postiz (expired), n8n public API (blocked), Meta Business Suite Chrome automation, instagram.com web login. See `DISASTER_LOG.md`.

---

## 5. DEPLOY ONE-LINER

You deploy autonomously via the GitHub Git Data API. **Never** manual `gcloud`, `firebase deploy`, or paste tokens in chat.

**4 API calls:** get-ref → blobs → tree → commit → PATCH ref. Full recipe in `DEPLOY.md §Autonomous Deploy`. Token at `.secrets/github_token` (gitignored).

**Pre-push checklist:**
1. `node --check` every `.js` you touched
2. Re-pull `refs/heads/main` SHA right before commit (avoid Strategist race)
3. After push, poll `/actions/runs?branch=main&per_page=3` every 30s until all 3 workflows green

---

## 6. KEY CONTACT + LINKS

| | |
|---|---|
| **Owner** | Alex Jego · babilionllc@gmail.com |
| **WhatsApp (public)** | +52 998 787 5321 |
| **WhatsApp (Alex personal)** | +52 998 202 3263 |
| **Calendly** | https://calendly.com/jegoalexdigital/30min |
| **Website** | https://jegodigital.com |
| **Firebase project** | jegodigital-e02fb |
| **Repo** | github.com/babilionllc-coder/jegodigital |
| **ElevenLabs phone** | +52 998 387 1618 (Twilio MX) |
| **ManyChat flow** | https://app.manychat.com/fb4452446 |

---

## 7. WHERE TO GO NEXT

| If you want to... | Read |
|---|---|
| Know what to work on today | `NEXT_STEP.md` |
| Deploy code or fix infra | `DEPLOY.md` + `SYSTEM.md` |
| Find an API key | `ACCESS.md` |
| Check cold-call pipeline state | `SYSTEM.md §Cold Call Pipeline` |
| Understand a past failure | `DISASTER_LOG.md` |
| Write a blog post | invoke `seo-content-engine` skill |
| Publish to Instagram | invoke `instagram-publisher` skill |
| See all business rules + HARD RULES | `CLAUDE.md` |
| See weekly/monthly ops | `OPERATING_RHYTHM.md` |

---

## 8. IF YOU'RE STUCK — ASK ALEX

User preferences are clear: *"if there is issue on error you solve it, and if you do not know anything you ask me so we never confused."*

When to ask vs when to act:
- **ACT autonomously:** deploys, SEO content engine, cold-call batches, IG carousels, follow-up emails, bug fixes with clear reproducible failures, doc updates
- **ASK Alex:** pricing decisions, new service launches, changes to HARD RULES themselves, when the task doesn't clearly fit a revenue bucket, when two tasks conflict, when a client-facing message ships in your name

**Rule of thumb:** can this be undone with a revert commit or a 1-minute re-run? Act. Can it burn a lead relationship, damage domain reputation, or commit real money? Ask.

---

*End of onboarding. Go read `NEXT_STEP.md` and get to work.*
