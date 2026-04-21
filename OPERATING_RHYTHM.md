# JegoDigital — OPERATING RHYTHM

> **Purpose:** the calendar of when things happen, who owns them, and what success looks like. Prevents drift, prevents the "what should I work on today?" question.
> **Scope:** daily / weekly / monthly / quarterly ops. Every item has an owner (Claude-auto, Cron-auto, or Alex-manual) and a proof artifact.
> **Last updated:** 2026-04-21

---

## 🌅 DAILY RHYTHM (every day)

### Morning — 9:00-10:30 CDMX · Owner: Cron + Claude

| Time (CDMX) | Task | Owner | Proof |
|---|---|---|---|
| 09:55 | `coldCallPrep` Cloud Function runs — builds call queue from `phone_leads` collection | Cron | Firestore `call_queue_summaries` document dated today |
| 10:00 | `coldCallRun` Cloud Function runs — fires first call batch (Mon-Fri only) | Cron | ElevenLabs conversation logs, Twilio call logs |
| 12:30 | `coldCallSlackMorning` posts morning stats to Slack | Cron | Slack message in `#cold-call-daily` |

**Claude action at session start:** read `NEXT_STEP.md` #1, verify_access.sh, then execute day's big rock.

### Mid-day — 12:00-14:00 CDMX · Owner: Alex (manual) + Claude (support)

- **Alex:** answers WhatsApp warm replies via ManyChat/Sofia handoff
- **Alex:** takes any Calendly calls
- **Claude:** monitors ElevenLabs live call queue (`coldCallLiveMonitor` every 3 min) — escalates anomalies to Telegram

### Afternoon — 13:00-18:30 CDMX · Owner: Cron + Claude

| Time (CDMX) | Task | Owner | Proof |
|---|---|---|---|
| 13:00 | `coldCallReport` Cloud Function runs — daily summary | Cron | Firestore `call_queue_summaries.status=closed` |
| 18:30 | `coldCallSlackAfternoon` posts end-of-day summary | Cron | Slack message |

### Every session with Alex · Owner: Claude

1. Pull live data from whichever platform Alex is asking about (HR#2)
2. Declare revenue bucket (HR#3)
3. Big rock check — does this advance it? (HR#8)
4. Ship with proof (HR#6)
5. Update `NEXT_STEP.md` at end

---

## 📅 WEEKLY RHYTHM

### Monday — Weekly Revenue Review (HARD RULE #7) · Owner: Claude-auto

**Runs:** every Monday at 09:00 CDMX via `weeklyRevenueReview` Cloud Function (TODO — not yet built, in NEXT_STEP.md P3 queue)

**Pulls:**
- Instantly: past 7d sent / delivered / opens / clicks / replies / positive replies
- Brevo: past 7d sent / delivered / opens / clicks (existing leads)
- ElevenLabs: past 7d conversations / done / failed / zombies / average duration
- Calendly: past 7d bookings / show-ups / cancellations
- Firestore: `audit_requests` count past 7d, `call_analysis` count past 7d
- GSC: past 7d impressions / clicks / avg position for jegodigital.com
- GA4: past 7d sessions / conversions for jegodigital.com

**Scores:**
1. New MRR closed (dollars)
2. Qualified leads generated (count)
3. Calendly calls booked (count)
4. Funnel conversion rate (outreach → positive → call → closed)
5. Cost per closed client (if ad spend tracked)
6. Top 3 broken things + top 3 fixed things

**Output:** `/BUSINESS_REVIEW/2026-W<NN>.md` + Slack post + IG DM to Alex

**Manual fallback until automation ships:** Claude runs this by hand every Monday by reading this doc and executing each pull.

### Tuesday-Friday — Execution days · Owner: Alex + Claude

- **Outbound:** 500 cold emails/week via Instantly + 30-50 cold calls/day via ElevenLabs
- **Inbound:** monitor ManyChat (IG+WA), respond to replies, send audit links
- **Calendly calls:** target 10 booked/week
- **Content:** 3 videos/week (TikTok/IG Reels) + 5 LinkedIn posts/week + 2 blog posts/week (via `seo-content-engine` autonomous mode)

### Friday — Week close · Owner: Claude

- Verify this week's Instantly lead send count hit target (500/week)
- Verify this week's cold-call volume hit target (150+/week)
- Flag any campaign with <0.5% reply rate for pause+rework
- Flag any agent (A/B/C) with >40% failure rate for investigation
- Roll `NEXT_STEP.md` forward — any P0 items that didn't ship become Monday's big rock

### Sunday — Alex prep · Owner: Alex (manual)

- Review week's pipeline
- Choose next week's big rocks
- Seed `NEXT_STEP.md` with any new strategic priorities

---

## 📆 MONTHLY RHYTHM (every 1st of the month)

### 1. Client Proof Refresh (HARD RULE #9) · Owner: Claude-auto

**Runs:** 1st of month at 08:00 CDMX via `verifyClientProofMonthly` Cloud Function (TODO — not yet built)

**Verifies:**
- Flamingo: 4.4x visibility (Ahrefs/GSC), #1 Google Maps (DataForSEO local), +320% organic (GA4)
- Goza, GoodLife, Solik: **all have NO verified domain per CLIENT DOMAIN RULE — flag, ask Alex for URLs or remove from copy**

**Output:** `/knowledge_base/client_proof_<YYYY-MM>.md` + Slack alert if any metric dropped >20%.

### 2. SEO Content Audit · Owner: Claude-manual (invoke `seo-engine`)

- Run site audit on jegodigital.com — catch regressions
- Run rank tracking on primary keyword set
- Run AEO visibility monitor — are ChatGPT/Perplexity/Gemini still recommending JegoDigital?
- Output: `/client-reports/jegodigital_<YYYY-MM>.html` + PDF

### 3. Cold Email Health Audit · Owner: Claude-manual

- Pull sender reputation (Postmaster Tools, Instantly health tab)
- Check SPF/DKIM/DMARC still passing for aichatsy.com
- Delete bounced/unsub leads from all campaigns
- Rotate any sender account with open rate <20% or reply rate <0.5%
- Output: `/knowledge_base/instantly_health_<YYYY-MM>.md`

### 4. Secrets Rotation Check · Owner: Claude-manual

- For each row in `ACCESS.md`, verify the key is still valid (live API ping)
- Flag any key within 30 days of expiry (IG_GRAPH_TOKEN is 60-day, needs monthly refresh alert)
- Output: `/ACCESS_HEALTH_<YYYY-MM>.md`

### 5. Disaster Log Review · Owner: Claude + Alex

- Review `DISASTER_LOG.md` — any entries resolvable with new tooling?
- Any entries that should be promoted to a HARD RULE?
- Archive older-than-90-day entries to `DISASTER_LOG_ARCHIVE.md` if still relevant, delete if superseded

---

## 🗓️ QUARTERLY RHYTHM (every 3 months, at start of quarter)

### Q1: Jan 1 · Q2: Apr 1 · Q3: Jul 1 · Q4: Oct 1 · Owner: Alex + Claude

- **Revenue target check:** are we tracking to $1M/yr? Quarter's MRR vs. 24-month roadmap target
- **Service mix review:** which of the 9 services are actually closing? Cut or double down
- **Client case study refresh:** new case studies for showcase.html from any new clients
- **Pricing review:** is Trojan Horse still converting free→paid at target rate?
- **ICP review:** is "MX real estate decision-maker" still the right target? Any new markets to add?
- **Tool stack review:** any dead tools to remove from CLAUDE.md? Any new tools to adopt?

**Output:** `/BUSINESS_REVIEW/2026-Q<N>.md` — 1-page Quarter Board Report

---

## 🚨 EVENT-DRIVEN (not scheduled, but must happen when triggered)

| Trigger | Task | Owner |
|---|---|---|
| A cold call transcript is flagged "positive" | Send audit link + WhatsApp follow-up within 30 min | Claude |
| A Calendly booking is made | `calendlyWebhook` fires → Brevo confirmation → Telegram alert | Cron |
| A Calendly no-show occurs | `invitee_no_show.created` → 3-email Brevo recovery sequence at +3d/+7d/+14d | Cron |
| An Instantly reply is flagged positive by AI agent | AI agent sends personalized audit link automatically | Instantly AI |
| A blog post is published | `auto-index.yml` submits to Google Indexing API + IndexNow | Cron |
| A new client closes | Onboarding kit (Service 1 install) within 48h | Alex + Claude |
| An API key is rotated | Update ACCESS.md + both local `.env` AND `.secrets/` backup AND GitHub Secrets | Alex + Claude |
| Firebase deploy fails | Read Actions logs, push code fix — DO NOT manual-deploy (DEPLOY.md) | Claude |

---

## 📊 KPI TARGETS (the numbers we steer by)

### Weekly

- Cold emails sent: **500**
- Cold calls placed: **150**
- Positive replies: **15** (3% of sends)
- Calendly bookings: **10**
- Closed clients: **1+**
- Churn: **<5%/month**

### Monthly

- New recurring revenue: **$50,000 MXN/week → $200K/mo**
- Free Trojan Horse installs: **12** (3/week)
- Blog posts published: **8**
- Instagram carousels: **12** (3/week)
- YouTube Shorts: **20** (5/week)

### Quarterly revenue milestones

| Quarter | Target monthly (MXN) | Target monthly (USD) | Clients |
|---|---|---|---|
| Q1 (Mo 1-3) | $150,000 | $7,500 | 10 |
| Q2 (Mo 4-6) | $300,000 | $15,000 | 18 |
| Q3 (Mo 7-9) | $500,000 | $25,000 | 25 |
| Q4 (Mo 10-12) | $700,000 | $35,000 | 30 |
| Y2-end | $1,670,000 | $83,333 | 50+ |

**CURRENT STATE:** 2026-04-21 we are at Month 0 of this roadmap. Zero paying clients. 24-month runway.

---

## 🧭 NAVIGATION

- Today's big rock → `NEXT_STEP.md`
- All HARD RULES → `CLAUDE.md` §HARD RULE #0-#10
- Infra + cold call pipeline → `SYSTEM.md`
- Deploy procedure → `DEPLOY.md`
- Credentials → `ACCESS.md`
- Past failures → `DISASTER_LOG.md`
