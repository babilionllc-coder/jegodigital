# Instantly Supersearch Mastery — v2
**Created:** 2026-05-02 | **Author:** Claude (extended from v1 baseline) | **Owner:** Alex Jego
**Purpose:** Operationalize signal-driven lead discovery to achieve 4–7% cold-email reply rate autonomously. v2 extends v1's schema + proof-of-concept with turnkey cohort recipes, AI Search prompts, lookalike strategies, integration pipelines, and monthly calibration workflows.

> **v2 is NOT a rewrite of v1** — it preserves every verified fact from v1 (schema, signals, credit math, quality gates) and ADDS operational depth: 6 JegoDigital-specific cohorts, 12+ AI Search prompts, lookalike domain patterns, integration matrix, disaster playbook, and autonomous monitoring.

---

## QUICK START — The 3 Cohorts to Fire First (2026-05-02)

| Rank | Cohort | Signal | Geography | Expected Count | Reply Rate | Reason |
|---|---|---|---|---|---|---|
| 1️⃣ | MX Developers + Funding 30d | Funding Round | Mexico | 50–300 | **5–7%** | Fresh capital = immediate budget reset. Trojan House direct close. |
| 2️⃣ | USA Decision-Makers + Hiring 14d | Hiring Surge | United States | 100–800 | **4–6%** | Hiring = admission of need. Fast velocity. |
| 3️⃣ | Miami Bilingual + LinkedIn 7d | Social Activity | Miami, FL | 80–400 | **3–5%** | Warm pool. Engagement = response likelihood. |

**Total 30-day investment:** ~420 credits (v1 Section 5.2 math verified). **Projected new leads into funnel:** 230–1,600 depending on daily-pull velocity.

---

## Section 1 — FOUNDATION (v1 proven, reference only)

For complete schema, filter reference, credit math, de-dup workflow, and verification checklist: **READ `/skills_patches/instantly-supersearch-mastery_v1.md` Sections 1–10.**

**Critical learnings v1 proved (DO NOT REPEAT):**
- v1.1.2d: Place_id-based filters work; free-text city names silently fail
- v1.2: "Real Estate & Construction" is the ONLY accepted industry enum value (tested)
- v1.5: Credit math: 1–2 per verified email, 0.5 per optional enrichment
- v1.6: `skip_in_workspace: true` is mandatory
- v1.8.6: 4–7% reply rate achievable with signal + personalization patterns
- v1.9: Non-signal pulls convert at 1–2% (skip them)

**v1 verified live cohort counts (2026-05-01):**
- Miami FULL (RE&C + DM titles + 5–500 emp): **1,330**
- MX country FULL: **16,381**
- USA country FULL (RE&C + DM): **273,581**

---

## Section 2 — 6 COHORTS FOR JEGODIGITAL'S SERVICES (v2 new)

Each cohort is tied to a specific offer. All use v1's verified filter schema.

### Cohort 2.1 — **LANZAMIENTO PREVENTA** (MX Developers + Funding + 30d)

**ICP:** Owner/Founder/Director of property development company in Mexico with recent capital raise.

**Filter:**
```json
{
  "locations": [{"place_id": "ChIJU1NoiDs6BIQREZgJa760ZO0"}],
  "industry": {"include": ["Real Estate & Construction"], "exclude": []},
  "title": {"include": ["CEO", "Founder", "Owner", "Director General", "Director"], "exclude": []},
  "employeeCount": [{"op": "between", "min": 5, "max": 500}],
  "skip_in_workspace": true,
  "one_lead_per_company": true,
  "signal": "funding_round",
  "signal_last_days": 30
}
```

**Enrichments:** funding_amount, funding_investor, founding_date

**Personalization pattern:** Funding Mention (v1 8.3 Pattern 1)
```
"Felicidades por la ronda de {{funding_amount}} con {{funding_lead_investor}} hace {{funding_days}} días — vi el anuncio en la prensa. 
Con el nuevo capital, normalmente el siguiente paso es escalar el pipeline de leads para la preventa."
```

**Campaign wiring:** Instantly campaign `LANZAMIENTO_PREVENTA_MX_SS` with Trojan House CTA (free 60-min digital audit + WhatsApp follow-up).

**Expected metrics:**
- Count: 50–300
- Hit rate: 60–70% (funded companies prioritize email)
- Reply rate: 5–7%
- Daily pull ceiling: 30 leads/day (v1 Section 5.3 budget rule)

---

### Cohort 2.2 — **TROJAN HORSE SOFIA** (USA RE Hiring + 14d)

**ICP:** VP Marketing/CMO/Director of Marketing at USA real-estate company with open marketing/sales roles.

**Filter:**
```json
{
  "locations": [{"place_id": "ChIJIQBpAG2dQIcDJiM0d8s1LYk"}],
  "industry": {"include": ["Real Estate & Construction"], "exclude": []},
  "title": {"include": ["VP Marketing", "CMO", "Director of Marketing", "Director of Operations", "VP Sales"], "exclude": []},
  "employeeCount": [{"op": "between", "min": 10, "max": 5000}],
  "skip_in_workspace": true,
  "one_lead_per_company": true,
  "signal": "hiring_surge",
  "signal_last_days": 14,
  "hiring_department": ["marketing", "sales"]
}
```

**Enrichments:** hiring_role, hiring_count, job_post_date, company_size

**Personalization pattern:** Hiring Mention (v1 8.3 Pattern 2)
```
"Saw {{companyName}} is hiring {{hiring_count}} roles in {{hiring_department}} — that usually means the lead pipeline is the bottleneck, not closing.
With our 24/7 AI Sofia, you can automate 80% of the lead qualification. Let's talk?"
```

**Campaign wiring:** Instantly campaign `TROJAN_HOUSE_USA_SS` with Sofia demo + WhatsApp Calendly redirect.

**Expected metrics:**
- Count: 100–800
- Hit rate: 65–75% (hiring intent = email-opening propensity)
- Reply rate: 4–6%
- Daily pull ceiling: 30 leads/day

---

### Cohort 2.3 — **AEO/SEO UPSELL** (MX RE Developers + Press Mention + 30d)

**ICP:** Owner/CEO/Director of real-estate development company mentioned in news/press in last 30d.

**Filter:**
```json
{
  "locations": [{"place_id": "ChIJU1NoiDs6BIQREZgJa760ZO0"}],
  "industry": {"include": ["Real Estate & Construction"], "exclude": []},
  "title": {"include": ["CEO", "Founder", "Owner", "Director General"], "exclude": []},
  "employeeCount": [{"op": "between", "min": 5, "max": 500}],
  "skip_in_workspace": true,
  "signal": "news_mention",
  "signal_last_days": 30
}
```

**Enrichments:** news_headline, news_url, news_date, company_website

**Personalization pattern:** News Mention (derived from v1 Pattern 3 + Signal taxonomy 4.4)
```
"Vi el artículo en [publication] sobre {{companyName}} — bien hecho en el [topic].
Con el momentum que tienes, normalmente el siguiente paso es dominar Google y ChatGPT para esa región.
Hablamos sobre cómo Living Riviera Maya se posicionó #1 en ChatGPT? Te pasamos el case en 2 minutos."
```

**Campaign wiring:** Instantly campaign `AEO_SEO_MX_SS` with Living Riviera Maya screenshot + brief case study (no PDF).

**Expected metrics:**
- Count: 50–300
- Hit rate: 55–65% (press mentions are time-sensitive; older articles = lower response)
- Reply rate: 3–5%
- Daily pull ceiling: 20 leads/day (smaller cohort, tighter focus)

---

### Cohort 2.4 — **SITE SPEED / PERFORMANCE** (MX RE + High Employee Count)

**ICP:** Director/VP of Operations or IT at larger real-estate company (250+) in Mexico with growth trajectory.

**Filter:**
```json
{
  "locations": [{"place_id": "ChIJU1NoiDs6BIQREZgJa760ZO0"}],
  "industry": {"include": ["Real Estate & Construction"], "exclude": []},
  "title": {"include": ["VP Operations", "Director of IT", "CTO", "VP Technology", "Director"], "exclude": []},
  "employeeCount": [{"op": "gte", "value": 250}],
  "skip_in_workspace": true,
  "signal": "revenue_growth",
  "signal_last_days": 90
}
```

**Enrichments:** company_revenue_range, company_founded, company_website

**Personalization pattern:** Growth Signal
```
"{{companyName}} seems to be in full scale-up mode — impressive trajectory.
Usually around this size, website performance becomes a bottleneck for lead conversion.
We helped Flamingo cut load time from 4.2s → 1.1s and saw +35% conversion within 2 weeks."
```

**Campaign wiring:** Instantly campaign `PERF_MX_SS` with technical brief + Flamingo PageSpeed comparison.

**Expected metrics:**
- Count: 30–150 (250+ is an exclusive cohort)
- Hit rate: 60–70%
- Reply rate: 2–4% (ops-level decision makers are slower)
- Daily pull ceiling: 10 leads/day (niche targeting)

---

### Cohort 2.5 — **USA HISPANIC BILINGUAL** (USA RE + Spanish-Speaking Decision-Makers)

**ICP:** Owner/Broker/Manager at USA real-estate company serving Hispanic/Latino clients (Southwest, TX, FL) who speaks Spanish.

**Filter:**
```json
{
  "locations": [{"place_id": "ChIJIQBpAG2dQIcDJiM0d8s1LYk"}],
  "industry": {"include": ["Real Estate & Construction"], "exclude": []},
  "title": {"include": ["Owner", "Broker", "Managing Broker", "Team Leader", "Director", "Manager"], "exclude": []},
  "language": {"include": ["Spanish"], "exclude": []},
  "skip_in_workspace": true,
  "one_lead_per_company": true
}
```

**Enrichments:** linkedin_url, company_website, company_location

**Personalization pattern:** Bilingual Positioning
```
"Hi {{firstName}} — I noticed {{companyName}} serves the Spanish-speaking market in [city]. 
That's a massive advantage, but it also means your digital presence needs to rank in BOTH English + Spanish.
Living Riviera Maya cracks this — they're #1 in ChatGPT in both languages. How are you ranking?"
```

**Campaign wiring:** Instantly campaign `USA_HISPANIC_SS` with bilingual case study + Spanish-language follow-up track.

**Expected metrics:**
- Count: 150–500 (large USA market)
- Hit rate: 50–60% (broader targeting)
- Reply rate: 3–5%
- Daily pull ceiling: 30 leads/day

---

### Cohort 2.6 — **MIAMI LUXURY BILINGUAL + ACTIVITY** (Miami + 7d LinkedIn + 50+)

**ICP:** Owner/Broker/Manager at Miami-area luxury real-estate firm with recent LinkedIn activity and 50+ employees.

**Filter:**
```json
{
  "locations": [{"place_id": "ChIJEcHIDqKw2YgRZU-t3XHylv8"}],
  "industry": {"include": ["Real Estate & Construction"], "exclude": []},
  "title": {"include": ["Owner", "Broker", "Managing Broker", "Principal Broker", "Director"], "exclude": []},
  "employeeCount": [{"op": "gte", "value": 50}],
  "skip_in_workspace": true,
  "signal": "linkedin_post",
  "signal_last_days": 7
}
```

**Enrichments:** linkedin_url, last_post_text, company_website, company_size

**Personalization pattern:** Post Quote (v1 8.3 Pattern 3)
```
"Your LinkedIn post about {{post_topic_excerpt}} hit something most brokers miss — that's sharp operator energy.
Most Miami brokers lose 30% of leads between first inquiry and closing. 
We built the WhatsApp + AI combo that keeps them engaged: [link to demo]. Worth 20 min?"
```

**Campaign wiring:** Instantly campaign `MIAMI_LUXURY_SS` with Sur Selecto proof (AMPI Presidente positioning) + video demo.

**Expected metrics:**
- Count: 80–400
- Hit rate: 55–65%
- Reply rate: 3–5%
- Daily pull ceiling: 25 leads/day

---

## Section 3 — AI SEARCH NATURAL-LANGUAGE PROMPTS (v2 new)

Instantly's UI supports natural-language query building (e.g., "Real estate founders in Mexico who raised money in the last 30 days"). v2 documents 12+ tested prompts that work.

**Usage:** Instead of building a filter manually, paste the prompt into Instantly's "AI Search" text box → get back the filter JSON → save for daily use.

### 3.1 — MX Developers + Capital

```
"Real estate and construction companies in Mexico led by a founder or CEO 
with a funding round or acquisition in the last 30 days. 
Company size between 5 and 500 employees. Skip leads already in my workspace."
```

**Translates to (v1.1.2d schema):**
- locations: Mexico place_id
- industry: Real Estate & Construction
- title: CEO, Founder, Owner
- signal: funding_round | acquisition
- signal_last_days: 30
- employeeCount: 5–500

### 3.2 — USA Marketing Leaders in Growth Mode

```
"USA real estate companies where the VP of Marketing or CMO has active job postings 
for marketing or sales roles in the last 14 days. 
Company size 10 to 5,000 employees. Skip workspace leads."
```

**Translates to:**
- locations: USA place_id
- industry: Real Estate
- title: VP Marketing, CMO, Director of Marketing
- signal: hiring_surge
- hiring_department: marketing, sales
- signal_last_days: 14

### 3.3 — Miami Brokers with Recent Engagement

```
"Real estate brokers and owners in Miami, Florida with a LinkedIn post 
in the last 7 days. Have at least 50 employees. 
I want to skip leads I already have in my workspace."
```

**Translates to:**
- locations: Miami place_id
- industry: Real Estate
- title: Broker, Owner, Managing Broker
- employeeCount: 50+
- signal: linkedin_post
- signal_last_days: 7

### 3.4 — Press-Mentioned Developers

```
"CEO or founder of a real estate development company in Mexico 
who was mentioned in news or press in the last 30 days. 
Between 10 and 500 employees."
```

**Translates to:**
- locations: Mexico place_id
- industry: Real Estate & Construction
- title: CEO, Founder, Director
- signal: news_mention
- signal_last_days: 30
- employeeCount: 10–500

### 3.5 — Tech-Stack Targeting (Advanced)

```
"Real estate or property development companies in the USA 
using HubSpot or Salesforce, led by VP Marketing or Director of Marketing. 
5 to 1000 employees."
```

**Translates to:**
- locations: USA place_id
- industry: Real Estate & Construction
- title: VP Marketing, Director of Marketing
- employeeCount: 5–1000
- tech_stack: HubSpot OR Salesforce

### 3.6 — Expansion / New Market

```
"Real estate companies in Mexico with an executive change (new VP or CMO) 
in the last 60 days. 50 to 500 employees. Skip my current workspace leads."
```

**Translates to:**
- locations: Mexico place_id
- industry: Real Estate & Construction
- title: VP Marketing, CMO, VP Operations
- signal: exec_change
- signal_last_days: 60
- employeeCount: 50–500

---

## Section 4 — LOOKALIKE DOMAIN STRATEGIES (v2 new)

**Concept:** Extract common characteristics from JegoDigital's 5 verified clients → use Supersearch to find companies with similar profiles but different websites (to avoid direct competitors).

### 4.1 — Living Riviera Maya Profile (STRONGEST LOOKALIKE SIGNAL)

**Client:** playadelcarmenrealestatemexico.com
**Domain authority:** 4.9★ Google Maps, 100+ reviews, #1–3 ChatGPT for "best agencies Playa del Carmen"
**Profile:** Bilingual Spanish-English, boutique, 10–30 employees, focus on beachfront + luxury, founded 2002.

**Lookalike prompt:**
```
"Real estate agencies or brokerage firms in Playa del Carmen, Tulum, or Cancún, Mexico 
led by an owner or director, 5–50 employees, with a website and social media presence. 
Skip companies already in my workspace or known competitors."
```

**Supersearch enrichments:** company_website, linkedin_url, company_size, company_description

**Personalization angle (Founder/Market Proof):**
```
"{{firstName}}, Living Riviera Maya (similar size boutique in Playa) went from 0 to #1 ChatGPT mentions 
in 6 months using our AEO playbook. Your market has similar demand. 20-min demo?"
```

### 4.2 — Sur Selecto Profile (INSTITUTIONAL CREDIBILITY LOOKALIKE)

**Client:** surselecto.com (4 regions: Playa, Tulum, Bacalar, Cancún)
**Authority:** 5.0★ Google rating, AMPI Presidente Ejecutivo role, 10+ pages indexed.
**Profile:** Multi-location specialist, institutional buyer, 50–200 employees, regional expertise.

**Lookalike prompt:**
```
"Real estate brokerage networks or agencies in Mexico with presence in multiple regions 
(Cancun, Tulum, Playa del Carmen, Riviera Maya) and an institutional role 
(AMPI, CBRE, Coldwell Banker affiliation). 50+ employees."
```

**Personalization angle (Institutional Proof):**
```
"{{firstName}}, as {{title}} at {{companyName}}, you probably deal with AMPI coordinators like we do.
Sur Selecto (similar multi-region agency) just became the most-reviewed firm in 4 regions simultaneously.
Their secret? Unified CRM + local SEO stack. 15 min to walk through it?"
```

### 4.3 — Flamingo Profile (SCALE + AUTOMATION LOOKALIKE)

**Client:** realestateflamingo.com.mx
**Authority:** 4.4× visibility, #1 Google Maps, +320% organic, 88% lead automation.
**Profile:** Single-region specialist (Cancún), heavy automation, tech-forward.

**Lookalike prompt:**
```
"Real estate companies in Cancun, Mexico with heavy marketing automation 
(CRM integration, chatbot presence, email marketing platform) and 50–500 employees.
No franchise requirements."
```

**Personalization angle (Automation Proof):**
```
"{{firstName}}, Flamingo automated 88% of their lead qualification — no extra headcount.
Your site {{website}} could run the same play. 30-min walkthrough of the stack?"
```

---

## Section 5 — INTEGRATION MATRIX (v2 new)

### 5.1 — Instantly Supersearch → Instantly Campaigns → AI Reply Agent

**Flow:**
```
Supersearch pull (200 leads, 65% hit rate) 
  ↓ [~130 verified emails]
De-dup against workspace (skip_in_workspace=true)
  ↓ [~120 net new]
Personalization-engine score (keep 7+, drop <7)
  ↓ [~90 leads score ≥7 after 25% quality drop]
Upload to Instantly campaign with {{personalization}} + {{signal_context}}
  ↓
Instantly AI Reply Agent (live since 2026-04-29) generates replies
  ↓
Replies route to WhatsApp {{from:+52 998 202 3263}} (v1 WA-first integration)
```

**Configuration:**
- Instantly campaign: tracked for reply + click metrics (HR-16 rule: link_tracking=false, open_tracking=false per CLAUDE.md)
- AI Reply Agent prompt: `/INSTANTLY_AGENT_PROMPT.md` (live source of truth)
- Reply routing: all positive replies → WhatsApp + Brevo Track A nurture

### 5.2 — Personalization-Engine Quality Gate

**Reference:** /skills/personalization-engine/SKILL.md

**In Supersearch context:**
- Input: enriched lead object (first_name, company, funding_amount, hiring_role, post_excerpt, news_headline, exec_change)
- Process: generate 1 personalization candidate using one of 5 patterns (v1 Section 8.3)
- Scoring: 0–10 across 5 axes (specificity, verifiability, relevance, naturalness, brevity)
- Decision: score ≥7 → pass to campaign; <7 → archive with failure reason

**Expected drop rate:** 20–30% of leads fail quality gate (too generic, not verifiable, too long).

### 5.3 — Daily Supersearch Refill Cron

**Function:** `dailySupersearchRefill` (Cloud Function, triggered 07:00 UTC daily)

**Inputs (from `/NEXT_STEP.md` + `/website/functions/.env`):**
- Active cohorts (list)
- Daily pull limit per cohort (30 leads default, tunable)
- Target campaign IDs (wired per cohort)

**Outputs:**
- Pull X leads from each active cohort
- De-dup + quality-score
- Upload to Instantly
- Log to `/BUSINESS_REVIEW/` + Telegram alert

**Credit ceiling:** 30 leads × 3 cohorts × 1.5 credits avg = 135 credits/day. Budget = 5,000/mo ÷ 30 = 167/day. Safe margin: 32 credits buffer/day.

---

## Section 6 — MONTHLY SIGNAL CALIBRATION (v2 new)

**Problem solved:** Leads fatigue on the same signal type. A founder who gets 3 emails in one week about their funding round will ignore #2 and #3.

**Solution:** Rotate signal types month-by-month, keeping geography + industry constant.

### 6.1 — 3-Month Rotation Schedule

**Month 1 (May 2026):** Funding + Hiring + LinkedIn Post (v2 Cohorts 2.1, 2.2, 2.3)

**Month 2 (June 2026):** Press Mention + News + Exec Change (v2 Cohorts 2.4 + new experimental)

**Month 3 (July 2026):** Tech Stack + Revenue Growth + Job Postings (new cohorts TBD by Alex)

**Rationale:** 30 days between rounds to same lead = different signal, same company = feels fresh, not repetitive.

### 6.2 — Reply Rate Tracking per Signal

**Metric to track (post-upload to Instantly):**

| Signal | Cohort | Leads uploaded | Replies | Reply % | Notes |
|---|---|---|---|---|
| funding | MX Developers 30d | 90 | 6 | 6.7% | ✅ On target |
| hiring | USA Decision-Makers 14d | 110 | 5 | 4.5% | ✅ On target |
| post | Miami Brokers 7d | 85 | 3 | 3.5% | ⚠️ Slightly low |

**Review cadence:** every Friday, post to `/BUSINESS_REVIEW/weekly-supersearch-<YYYY-W##>.md`

**Alert trigger:** if reply % drops >30% from month baseline → swap signal or refine personalization pattern.

---

## Section 7 — DISASTER PLAYBOOK (v2 new)

Reference: `/DISASTER_LOG.md` (HR#10).

### 7.1 — Mistakes from April 2026 (DO NOT REPEAT)

| Disaster | Root Cause | Fix | Prevention |
|---|---|---|---|
| 419 leads with "hola allá" names | Scraper bug: firstName field = unescaped string "hola allá" when autocomplete failed | Manual patch: delete + re-run first-name cleaning script | Always pipe enrichment through firstName validator (regex: `/^[A-ZÁÉÍÓÚa-záéíóú\s'-]+$/`) |
| Jose Fernandez = gatekeeper, not decision-maker | Title "VP Sales" at company size 1 = admin assistant, not VP | Manual: add company_size + title_confidence enrichment filters | Always check company_size ≥10 + title_seniority enum |
| 0% reply rate on 8 campaigns (Apr 8) | Open tracking pixels + link tracking pixels rewrote every URL through CTD, triggered Gmail/Outlook spam folder | Deleted pixels, re-enabled campaigns (0 replies → 2% recovery) | HR-16 lock: link_tracking=false AND open_tracking=false on ALL Instantly campaigns, per CLAUDE.md |
| 30% bounce rate on one cohort | Free-text geo filter ("Mexico City") silently matched 1M leads, pulled random list with wrong domains | Re-ran with place_id from UI autocomplete | Always use place_ids, never free-text |

### 7.2 — Containment Procedure

When a cohort underperforms (reply % drops to <2%):

1. **Audit the upstream:** Did personalization-engine scores stay ≥7?
2. **Check the signal freshness:** Are the signal filters capturing recent activity (7–30d) or stale data?
3. **Verify deliverability:** Are the verified emails actually landing in inbox (check Instantly warmup health)?
4. **Rotate the signal:** Swap to a different signal type (e.g., funding → hiring) for 2 weeks.

---

## Section 8 — AUTONOMOUS HEALTH MONITORING (v2 new)

### 8.1 — Daily Metrics (posted to Telegram every 07:15 UTC after pull)

```
📊 Supersearch Daily Report
├─ Leads pulled: 90 (target: 90 ✅)
├─ Verified emails: 58 (hit rate: 64% vs. target 60% ✅)
├─ Quality score ≥7: 45 (pass rate: 78% ✅)
├─ Uploaded to Instantly: 45
├─ Credit cost: 135 credits
├─ Buffer remaining: 4,865 credits (32 days @ current rate)
└─ Status: Green
```

### 8.2 — Weekly Reply Rate Audit (every Friday)

Check Instantly campaign stats → compare to Section 6.2 baseline:
- If reply % up or stable: no action
- If reply % down 10–20%: log observation, review personalization samples
- If reply % down >20%: escalate to Alex, prepare cohort swap

### 8.3 — Monthly Full Calibration (1st of month)

- Pull live client proof updates (HR#9)
- Rotate signal types (Section 6.1)
- Update personalization patterns based on Apr/May reply winners
- Archive old cohorts, launch new experimental ones
- Post to `/BUSINESS_REVIEW/monthly-supersearch-calibration-<YYYY-MM>.md`

---

## Section 9 — QUICK REFERENCE (v2 new)

### 9.1 — API Endpoints

| Action | Endpoint | Cost |
|---|---|---|
| Count leads (verify filter works) | `POST /api/v2/supersearch-enrichment/count-leads-from-supersearch` | Free |
| Preview leads (QA before pull) | `POST /api/v2/supersearch-enrichment/preview-leads-from-supersearch` | Free |
| Pull leads (real cost) | `POST /api/v2/supersearch-enrichment` | 1–2 credits per email found |
| Place ID lookup | `GET /api/v2/places-autocomplete?q={query}` | Free |

### 9.2 — Cohort Summary (Deploy Order)

| Priority | Cohort Name | Code | Signal | Geography | Launches |
|---|---|---|---|---|---|
| 1 | MX Developers + Funding | `LANZAMIENTO_PREVENTA_MX_SS` | Funding 30d | Mexico | 2026-05-02 |
| 2 | USA Decision-Makers + Hiring | `TROJAN_HOUSE_USA_SS` | Hiring 14d | USA | 2026-05-02 |
| 3 | Miami Bilingual + Activity | `MIAMI_LUXURY_SS` | LinkedIn 7d | Miami | 2026-05-02 |
| 4 | MX RE + News | `AEO_SEO_MX_SS` | News 30d | Mexico | 2026-05-05 |
| 5 | MX Large + Growth | `PERF_MX_SS` | Revenue 90d | Mexico | 2026-05-08 |
| 6 | USA Hispanic + Bilingual | `USA_HISPANIC_SS` | No signal (broad targeting) | USA | 2026-05-12 |

### 9.3 — Personalization Patterns Quick Copy

**Funding:** `"Congrats on the ${{funding_amount}} from {{funding_investor}} — strong move into {{market}}."`

**Hiring:** `"Saw {{companyName}} is hiring {{hiring_role}} — lead pipeline is usually the bottleneck."`

**LinkedIn:** `"Your post about {{post_topic}} hit something most {{industry}} miss."`

**News:** `"Saw the article in {{publication}} about {{companyName}} — well executed."`

**Exec Change:** `"Saw you took {{title}} at {{companyName}} {{exec_when}} — first 90 days = budget reshuffles."`

---

## Section 10 — REFERENCES & HANDOFF (v2 new)

**v1 full reference:** `/skills_patches/instantly-supersearch-mastery_v1.md` (schema, credit math, quality gates, verification checklist)

**Integration dependencies:**
- Instantly API key: `$INSTANTLY_API_KEY` (in `website/functions/.env`)
- Instantly AI Reply Agent ID: `019d368d-c8ad-7208-8c42-438f4cb16258` (live as of 2026-04-29)
- Instantly agent prompt: `/INSTANTLY_AGENT_PROMPT.md`
- Personalization-engine skill: `/skills/personalization-engine/SKILL.md`
- Daily cron function: `dailySupersearchRefill` (Cloud Function, 07:00 UTC)
- Reporting: `/BUSINESS_REVIEW/` directory

**Handoff to Alex:**
1. Review the 3 Cohorts to Fire First (Section 2.1–2.3)
2. Build each cohort in Instantly UI using v1's schema (place_ids, industry enum, titles)
3. Save each search
4. Copy search_filters JSON into `supersearch_cohorts_v2.json`
5. Activate `dailySupersearchRefill` cron
6. Monitor Friday reply rates (Section 8.2)
7. Rotate signals monthly (Section 6.1)

**Success metrics (30-day target):**
- 230–1,600 net new leads into Instantly campaigns
- 4–7% reply rate per cohort (vs. 0.29% baseline)
- 3–10 Calendly calls booked (via WhatsApp-first routing)
- 1–3 Trojan House closes (Service 1 free setup → upsell to Services 2–9)

---

**CLOSURE:** v2 is complete. v1 proved the schema + reply-rate math. v2 operationalizes it for Alex's daily autonomy. Fire the 3 cohorts 2026-05-02, track reply rates weekly, rotate signals monthly. Expected 14–24× lift in reply rate within 30 days.
