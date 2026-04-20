# JegoDigital Cold-Email Stack — 2026 Gap Audit

**Audit date:** April 19, 2026
**Auditor:** Claude (adversarial mode — flagging weakness, not cheerleading)
**Scope:** Entire prospecting → send → reply loop
**Methodology:** Scored across 5 axes against 2026 industry benchmarks (Smartlead, Lemlist, Clay, Instantly 2026 playbooks)

---

## Scorecard — 5 axes, 0-100 each

| Axis | Score | Grade | Top gap |
|---|---|---|---|
| 1. ICP & Targeting | 55 | C | Firmographic-only, no intent/event signals |
| 2. Lead Sourcing Quality | 60 | C+ | Supersearch `pid_free` = shallow data; 12% no-email rate; 41% overlap with own campaigns |
| 3. Enrichment Depth | 45 | D+ | Only 6 vars (name/company/site/PSI/city). Industry elite uses 15-25 signals. |
| 4. Copy & Sequence | 70 | B− | Spanish copy is tight. Sequence timing is OK. No real A/B testing. |
| 5. Sending Infrastructure | 72 | B | Warmup looks healthy. DMARC/SPF/DKIM status **unknown** (not audited in logs). No bounce monitoring loop. |
| **Overall** | **60** | **C+** | **Data layer is the choke point, not copy.** |

---

## Axis 1 — ICP & Targeting (55/100)

**What we do right:**
- Clear verticals: real estate agencies + developers in Mexico
- Clear geo (all of MX, defaulting to "inmobiliarias en México")
- Decision-maker targeting: Owner / Director / Marketing Manager
- Budget range codified: $3K-$20K MXN/mo
- Pain point crisp: "not enough qualified leads"

**What we're missing:**
- **Zero event/intent signals.** We target by industry + geo only. 2026 elite targets by EVENTS: "hired a marketing manager in last 90d", "launched new development", "posted on LinkedIn about Google Ads", "site PageSpeed dropped this quarter", "website redesigned and tanked on Maps".
- **No account tiering.** Every agency gets same sequence. Should have Tier 1 (developers, >50 agents) vs Tier 2 (5-15 agent boutiques) with different copy angles.
- **No exclusion rules.** We burn leads by sending the same angle to agencies that already rank #1 for their zone — zero hook.

**Fix:** Build a "signal dictionary" — the 5 events that precede "agency needs Jego" and trigger campaigns off those, not off raw firmographics.

---

## Axis 2 — Lead Sourcing Quality (60/100)

**What we do right:**
- Supersearch's `show_one_lead_per_company=True` kills duplicate decision-makers
- Workspace-level dedup caught the 41% overlap with existing campaigns (would have burned 56 leads on double-send)
- PSI enrichment adds real, non-scraped data

**What's broken:**
- **`pid_free` tier = shallow LinkedIn profiles.** We're missing: tenure, recent job changes, phone numbers, recent posts, tech stack detection.
- **12% no-email rate (19/155).** Supersearch couldn't verify work email on 1 in 8. That's wasted credits + CSV rows that die on the list-to-campaign move.
- **41% dupe rate with active campaigns.** `skip_owned_leads` dedups at COMPANY level not EMAIL level — that's why 56 dupes slipped through. Needs a pre-pull sweep against ALL active campaigns.
- **No freshness signal.** Supersearch doesn't tell us when the lead was last updated. A 2-year-old LinkedIn profile is garbage — that person may have left.

**Fix options (ranked by cost/reply improvement):**
- **Cheapest:** Pre-pull dedup script against all 4 active campaigns BEFORE running Supersearch ($0 — we already wrote the delete-dupe script, just flip it to filter pre-enrichment).
- **Medium:** Upgrade Supersearch to paid tier for deeper profile data (~$200/mo).
- **Best ROI:** Add Clay as enrichment layer on top of Hunter — pulls 75+ providers into one row. ~$150/mo for 2K rows.
- **Nuclear:** Apollo subscription for database-level access. ~$60-200/mo depending on tier. But Apollo's MX coverage is weaker than LinkedIn-sourced data.

---

## Axis 3 — Enrichment Depth (45/100) ← **THE BIG GAP**

**Current 6 variables in play:**
`firstName`, `companyName`, `website`, `pageSpeed`, `mainIssue`, `city`

**2026 elite playbook uses 15-25 signals.** Here's what we're leaving on the table:

| Signal | How to get it | Why it matters |
|---|---|---|
| Recent LinkedIn post | Phantombuster / Clay LinkedIn scrape | Reference it → +30-50% reply |
| Recent hire in marketing | LinkedIn Sales Nav API via Clay | "I saw you just hired X — usually signals Y" |
| Instagram follower count | IG Graph API public endpoint | Tier Tier 1 vs Tier 2 |
| Number of active listings | Firecrawl their site → count cards | Validates "real business" + angle |
| MLS / portal presence | SerpAPI for "site:inmuebles24.com {company}" | Signals where they spend $$$ |
| Google Business rating | Maps API or Firecrawl | Low rating = clear pain hook |
| Recent ad spend | SimilarWeb / Semrush → ads column | Knows they have budget |
| Tech stack on site | Wappalyzer API | "I see you use WordPress + Calendly..." → relatable |
| Days since last blog post | Firecrawl → sitemap | "No new content in 8 months" = content angle |
| Owner's LinkedIn tenure | Clay → LinkedIn | "I know you've run [Agency] for 12 years" = credibility |

**Most of these are already in our API tool belt (DataForSEO, Firecrawl, SerpAPI, Perplexity).** We're just not wiring them into the enrichment step of the pipeline.

**Fix:** Build `supersearch_deep_enrich.py` — takes the 80 leads output from Supersearch, runs 5-8 additional lookups per lead, stores in `payload.*`. Cost per lead: ~$0.02 in API calls. Upside: jump from generic `{{pageSpeed}}` hook to surgical "I noticed you just listed 3 properties in [zone] but your site still loads in 7s" hook.

---

## Axis 4 — Copy & Sequence (70/100)

**What's working:**
- 5-step sequences (42% of replies come from steps 2-5 — we're capturing that)
- Subject lines ≤3 words on most templates (aligned to 2026 data)
- Spanish tone is premium, no cheese, no emoji spam
- Trojan Horse angle (free Service 1 setup) is a killer offer
- No pricing in automated channels (correct)
- 60-80 word bodies (Step 1) — research band is 50-125, we're inside

**What's weak:**
- **Only 1 angle per campaign.** Our 4 active campaigns each run 1 hook. 2026 elite runs 3-5 parallel angles per campaign and stat-sigs the winner in 2 weeks. We'd have no way to tell which angle actually drives the bookings vs which just gets opens.
- **"Caso real" (Step 3) uses generic companyName** — doesn't reference a SPECIFIC thing about their agency. Reads like mail-merge.
- **No reply rate baseline by campaign.** We don't know if Trojan Horse > Speed-to-Lead > ChatGPT Angle — we just know they all run. Need a weekly reply-rate leaderboard to cut losers.
- **"Hola {{firstName}}," greeting SAFE on Supersearch list** (0% fake names) but we're not capitalizing on that data dividend — the body still reads like a template.
- **CTA is static.** Every Step 1 ends with "¿Te mando un video demo de 1 minuto?" — smart anti-Calendly CTA, BUT we could A/B with "¿Te mando el audit PageSpeed de 60 segundos?" for the high-personalization list.

**Fix:**
- Add campaign-level A/B at the subject line (v1 vs v2 per campaign, split 50/50 across inboxes)
- Rewrite Step 3 "Caso real" to pull a real detail from `payload.*` (recent listing count, specific city)
- Build the weekly reply-rate dashboard (already have Instantly analytics API — just not surfaced)

---

## Axis 5 — Sending Infrastructure (72/100)

**What's working:**
- 8 inboxes across 3 domains (aichatsy × 2, jegoaeo × 3, jegoleads × 3) — good sender diversity
- 7.5/account/day = well inside 30/day Google cap
- Dedicated domain (aichatsy.com) — separate from jegodigital.com for reputation isolation
- Open tracking + bounce protect default ON
- Stop-on-reply + stop-on-auto-reply both true

**Unknown/unaudited (risk):**
- **DMARC alignment status.** Has aichatsy.com's DMARC record been set to `p=quarantine` or `p=reject`? Gmail 2026 rules REQUIRE aligned DMARC for bulk senders. If we're on `p=none` → slow reputation death.
- **SPF/DKIM on all 3 domains** — same question, not logged.
- **RFC 8058 one-click unsubscribe header** — Gmail 2026 rule. Instantly claims it adds this, but has it been verified against a live send?
- **Bounce rate current.** We don't have a 30-day rolling number in this doc. Industry kill-switch is 2%; we should alarm at 1%.
- **Spam complaint rate.** Industry kill is 0.3%. Same — no current number.

**Gap — no monitoring loop:**
- We ship campaigns and walk away. No automated alarm when an inbox hits 1% bounce or 0.2% spam.
- No manual review cadence (weekly 15-min check of Instantly health panel).

**Fix:**
- Run `mxtoolbox.com/dmarc.aspx` on all 3 sending domains TODAY, paste output in `/supersearch_out/deliverability_baseline.md`.
- Set a weekly 15-min Monday review ritual on Instantly's "Email Accounts" tab.
- Configure Instantly's built-in bounce-rate alert to ping Telegram when ≥1.5%.

---

## Root Cause Summary

**The 80 shippable leads are fine. The campaign will send.** But the ceiling on reply rate is set by 2 things:

1. **Data depth** — we personalize with 6 variables when competitors personalize with 15-25. Copy quality beyond that point is rounding error.
2. **Zero intent signals** — we hit ANY agency with a slow site. Elite hits agencies with a slow site AND who just hired a marketing director AND who have >5 listings active. 10x conversion on 1/10th the volume.

**One sentence:** we have an operational cold-email machine but a thin intelligence layer feeding it. Fix the intelligence layer and the machine compounds.
