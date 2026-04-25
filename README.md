# JegoDigital

> One-person AI marketing agency for real estate in Mexico. Deliver like a 10-person shop.
> **Goal:** $1M USD/year · **Status as of 2026-04-22:** 0 paying clients · **Owner:** Alex Jego

---

## 🧭 If you're Claude (or any AI starting a new session) — read this first

**Open `/ONBOARDING.md`.** It is the single entry point. It tells you in order:
1. What JegoDigital is and what success looks like
2. Which bootstrap docs to read (CLAUDE.md, NEXT_STEP.md, OPERATING_RHYTHM.md, SYSTEM.md, ACCESS.md, DEPLOY.md, DISASTER_LOG.md)
3. Which HARD RULES are non-negotiable (HR#0–#10 in CLAUDE.md)
4. What's on the priority queue RIGHT NOW (NEXT_STEP.md)
5. How to deploy safely (DEPLOY.md — autonomous Git Data API path)

After `/ONBOARDING.md`, follow the link map below as needed.

---

## 📚 Documentation link map

| File | Purpose | Read when |
|---|---|---|
| **[ONBOARDING.md](./ONBOARDING.md)** | Single entry point for a new Claude session | Very first thing, every new session |
| **[CLAUDE.md](./CLAUDE.md)** | Behavior rules, business context, HARD RULES #0-#10, 9 services, sales strategy | Always, every session |
| **[NEXT_STEP.md](./NEXT_STEP.md)** | Living priority queue. #1 = today's big rock | Every session start (HARD RULE #4) |
| **[OPERATING_RHYTHM.md](./OPERATING_RHYTHM.md)** | Daily / weekly / monthly cadence. What runs when, who owns it | Beginning of day + Monday mornings |
| **[SYSTEM.md](./SYSTEM.md)** | Cloud Functions, crons, Firestore collections, cold-call pipeline, architecture | When touching deploys, crons, webhooks |
| **[ACCESS.md](./ACCESS.md)** | GitHub Secrets registry, API keys, where they live, rotation procedure | When you need a credential |
| **[DEPLOY.md](./DEPLOY.md)** | Autonomous deploy recipe (Git Data API) + 4 GitHub Actions workflows | Every deploy, every time |
| **[DISASTER_LOG.md](./DISASTER_LOG.md)** | Every failed experiment, root cause, what to do instead | Before attempting anything risky (HARD RULE #10) |
| **[BACKLOG.md](./BACKLOG.md)** | P4 parking lot — "nice to have" ideas | Only when P0-P3 queue is empty |

---

## 🏗️ Repository structure

```
jegodigital/
├── CLAUDE.md                # Rules + business context (root source of truth)
├── ONBOARDING.md            # New-session entry point
├── NEXT_STEP.md             # Today's big rock + priority queue
├── OPERATING_RHYTHM.md      # Daily/weekly/monthly cadence
├── SYSTEM.md                # Infra + cold-call pipeline + Cloud Functions
├── ACCESS.md                # Secrets registry
├── DEPLOY.md                # Autonomous deploy recipe
├── DISASTER_LOG.md          # Post-mortems — read before risky moves
├── README.md                # This file
│
├── website/                 # Firebase Hosting (jegodigital-e02fb) — static site + Cloud Functions
│   ├── *.html               # Landing pages (servicios, auditoria-gratis, showcase, etc.)
│   ├── blog/                # Blog posts (SEO content)
│   ├── functions/           # Firebase Cloud Functions (Node.js)
│   ├── tools/               # Node scripts: ElevenLabs triggers, Instantly sync, auditors
│   └── data/                # Service tokens (gitignored)
│
├── .github/workflows/       # 4 CI/CD workflows
│   ├── deploy.yml                 # Firebase Functions + Hosting
│   ├── deploy-cloudrun.yml        # Cloud Run mockup-renderer
│   ├── auto-index.yml             # Google Indexing API + IndexNow
│   └── smoke-test.yml             # Daily health check 08:00 UTC
│
├── carousels/               # Instagram carousels (HTML+Playwright/WeasyPrint pipelines)
├── knowledge_base/          # Client proofs, cold-email playbooks, SEO research
├── leads/                   # Instantly lead list CSVs (gitignored PII)
├── .secrets/                # Local backup of API keys (gitignored)
│
└── [skills live in plugins, not in repo]
```

---

## 🚀 Quick actions (the things Alex asks for most)

| Request | Skill | Notes |
|---|---|---|
| "Run SEO content engine" | `seo-content-engine` | Autonomous — picks topic, researches, writes, scores, ships |
| "Publish this to Instagram" | `instagram-publisher` | Graph API direct — NEVER n8n, Postiz, Business Suite |
| "Run cold call batch" | `cold-calling-ai` | ElevenLabs + Twilio, 3 split-test offers (A/B/C) |
| "Make a cotización for <client>" | `jegodigital-cotizaciones` | Dark-theme premium PDF, real API research required |
| "Build carousel for <topic>" | `jegodigital-carousels` | 1080×1350, real screenshots only, brand colors locked |
| "Upload leads to Instantly" | `lead-finder` + HARD RULE #5 gate | 5-gate quality check BEFORE upload |
| "Deploy" | (don't) | Push to `main`, GitHub Actions handles everything |

---

## ⚠️ Things you must NEVER do

(All enforced by HARD RULES in CLAUDE.md)

- **Never fabricate numbers** (HR#0) — every metric must come from a live API call THIS session
- **Never run blind on cold email** (HR#1) — run `tools/verify_access.sh` first
- **Never report from memory** (HR#2) — 8 platforms, 8 live verify routes
- **Never bypass revenue-first prioritization** (HR#3) — every task must trace to a paying client
- **Never skip NEXT_STEP.md** (HR#4) — the #1 item IS today's work
- **Never upload an ungated lead list** (HR#5) — 5 gates, all pass, or don't ship
- **Never mark "done" without proof** (HR#6) — live verification in the same tool-call sequence
- **Never reveal AI stack to clients** — JegoDigital is positioned as a premium full-service agency
- **Never quote pricing in any automated channel** — Calendly call with Alex only
- **Never manual-deploy** — push to `main`, GitHub Actions does the rest (DEPLOY.md)
- **Never use AI-generated images in blog posts** — real screenshots only (CLAUDE.md §NO-AI-IMAGES)
- **Never use Postiz, n8n public API, or Meta Business Suite for publishing** — dead ends

---

## 📊 Current state snapshot (2026-04-22 PM)

| Metric | Value | Source |
|---|---|---|
| Paying clients | 0 | Firestore / manual |
| MRR | $0 | Brevo deals tag |
| Emails sent (last 7d, Instantly) | 3,238+ | Live Instantly v2 API |
| Open rate | **0% — workspace tracking broken** | Live Instantly v2 API |
| Calendly bookings (this week) | 1 (Apr 17) | Live Calendly API |
| Cold calls today | 74 conversations / 12 real / 38 failed | Live ElevenLabs API |
| Active campaigns (Instantly) | 9 | Live Instantly v2 API |
| Brevo nurture contacts (live) | 8 backfilled, list 25 | Brevo contact IDs 117–124 |
| Blog posts published | 8+ (most amateur, need refresh per 2026-04-11) | `/website/blog/` |

**Top 3 broken things right now:**
1. Instantly tracking pixel (0% opens = $0 pipeline signal)
2. ElevenLabs Agent B & Agent C (2 zombies on B, 0 done / 14 failed on C)
3. 0 paying clients — outreach → booking conversion not yet working

**Top 3 things working:**
1. Cloud Function deploy pipeline (autonomous Git Data API + deploy.yml 2-batch split, all 3 workflows green on commit `27132638`)
2. Brevo email nurture trio LIVE (every positive Instantly reply → 4 Spanish touches over 14 days, auto-cancel on Calendly booking — 8/8 backfill delivered 2026-04-22 PM)
3. Brevo email tracking (36% open rate on 138 sent in 7d) + Calendly → ElevenLabs webhook → Firestore call_analysis flow

See `/NEXT_STEP.md` for what to do about it.

---

## 👤 Owner

**Alex Jego** · babilionllc@gmail.com · WhatsApp +52 998 202 3263 · Calendly: [calendly.com/jegoalexdigital/30min](https://calendly.com/jegoalexdigital/30min)

Production: [jegodigital.com](https://jegodigital.com) · Hosting: Firebase (jegodigital-e02fb) · **Outreach sending domains (live 2026-04-24):** `zennoenigmawire.com` + `zeniaaqua.org` — 10 Google Workspace mailboxes total, separate from jegodigital.com to protect main-domain reputation. ~~aichatsy.com~~ DEPRECATED pre-April 2026.
