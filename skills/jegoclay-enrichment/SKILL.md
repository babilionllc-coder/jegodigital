---
name: jegoclay-enrichment
description: JegoDigital's Signal Outbound Engine — the Clay-equivalent pipeline that enriches raw leads (name + company + LinkedIn URL) into hyper-personalized cold-outreach-ready profiles. Trigger whenever Alex wants to enrich a lead list, push enriched leads to Instantly, run the daily top-up cron, diagnose enrichment failures, or refresh existing leads with richer signals. Covers the full pipeline — ICP filter → Firecrawl website scrape → Hunter email waterfall → PageSpeed + Core Web Vitals → tech stack detection (50+ signatures) → 30+ pain-signal detection → Gemini 2.5-flash Spanish opener → signal scoring → Instantly API V2 push with per-lead custom variables. Triggers — enrich leads, jegoclay, signal outbound, daily top-up, push to Instantly, new lead list, Vibe CSV, personalized openers, website pains, tech stack detection, lead enrichment, hyper-personalize, signal-based outbound, cold email prep. PAIRED WITH jegoroom — if Alex asks to "enrich a hot account" or invokes jegoroom's enrich_and_push, this skill runs automatically as the enrichment engine. DIFFERENT from jegoroom (that FINDS hot accounts via intent signals — hiring, reviews, launches). DIFFERENT from lead-finder (sourcing layer — where raw leads come FROM). DIFFERENT from cold-email-copywriting (writes email copy manually). JegoClay = the enrichment + personalization layer that sits between sourcing and Instantly delivery.
---

# JegoClay — Signal Outbound Enrichment Engine

> **Built 2026-04-23/24.** The in-house Clay equivalent, tuned for MX real estate. Validated by Instantly.ai's own documentation as the canonical "external enrichment" pattern.

## 🎯 When to invoke this skill

Any time Alex says:
- "Enrich these leads"
- "Run JegoClay on this CSV"
- "Push X leads to Instantly"
- "Top up today's leads"
- "New Vibe export is ready"
- "Why did Hunter fail?"
- "Personalize this cold email list"
- "Signal-based outbound"

**Do NOT invoke for:**
- Sourcing raw leads (that's Vibe Prospecting / Apify / lead-finder)
- Writing cold email templates by hand (that's cold-email-copywriting)
- Campaign activation / warmup (that's Instantly's native UI)

## 🏗️ The 3-layer architecture + JegoRoom handoff

```
┌─ LAYER 1: SOURCING (TWO paths into JegoClay) ──────────┐
│                                                         │
│  Path A — BATCH (cold sourcing):                        │
│    Vibe Prospecting exports → leads/input/*.csv         │
│    Apify fallback (LinkedIn/GMaps scrape)               │
│                                                         │
│  Path B — INTENT (hot sourcing, from JegoRoom):         │
│    JegoRoom 24/7 signal collectors write to             │
│    intent_accounts Firestore. When score_30d ≥ 70,      │
│    jegoroom's enrich_and_push.py triggers JegoClay      │
│    on that ONE domain via enrich-leads.yml workflow.    │
│    → see `skills/jegoroom/SKILL.md`                     │
│                                                         │
│  Both paths feed raw CSV with:                          │
│    name, title, company, website, LinkedIn             │
└─────────────────┬──────────────────────────────────────┘
                  │
┌─────────────────▼──────────────────────────────────────┐
│  LAYER 2: JEGOCLAY (this skill) — the ENRICHMENT brain │
│  6-step pipeline:                                       │
│    1. ICP filter (title + industry)                     │
│    2. Firecrawl homepage scrape (markdown + html)       │
│    3. Hunter email waterfall (3 tiers)                  │
│    4. Email verifier (Module 1 — bounce protection)     │
│    5. PageSpeed + 30 pain signals (Module 2)            │
│    6. Tech stack detector (50+ signatures, Module 2)    │
│    7. Gemini 2.5-flash Spanish opener                   │
│    8. Signal scoring (0-100)                            │
└─────────────────┬──────────────────────────────────────┘
                  │
┌─────────────────▼──────────────────────────────────────┐
│  LAYER 3: DELIVERY                                      │
│    • Instantly (batch) — push_to_instantly.sh           │
│    • Airtable Leads (intent) — jegoroom enrich_and_push │
│    • Notion 🎯 Leads CRM (mirror) — instantlyLeadSync   │
└────────────────────────────────────────────────────────┘
```

**Key insight:** JegoRoom is the HUNTER (finds who's buying NOW via intent signals). JegoClay is the SCHOLAR (deep-enriches those accounts with openers referencing exact pains). They're the ONE-TWO punch that replaces Common Room + Clay at 300x cheaper.

## 📁 Canonical file paths

| File | Purpose |
|---|---|
| `tools/lead_enrichment_engine.py` | Main orchestrator — ICP filter + Firecrawl + Hunter waterfall + PageSpeed + Gemini |
| `tools/jegoclay/email_verifier.py` | **Module 1** — Self-hosted NeverBounce replacement (DNS MX + SMTP + disposable blocklist + role flagging) |
| `tools/jegoclay/tech_stack_detector.py` | **Module 2** — BuiltWith replacement (50+ tech signatures) + 30+ pain signal detector |
| `tools/push_to_instantly.sh` | Parallel Instantly API V2 push (curl + xargs -P 8, 16 leads/sec) |
| `tools/queue_manager.py` | Queue state manager (take N, mark-consumed, enqueue, status) |
| `tools/research_instantly.py` | Rerunnable Perplexity research on Instantly's capabilities |
| `.github/workflows/enrich-leads.yml` | On-demand enrichment workflow (workflow_dispatch) |
| `.github/workflows/daily-lead-topup.yml` | Autonomous 6am CDMX daily cron |
| `leads/queue/pending.csv` | Leads waiting to be processed |
| `leads/queue/consumed.csv` | Leads already processed + pushed |
| `leads/input/` | Drop fresh Vibe Prospecting CSVs here |
| `leads/enriched/` | Enrichment output JSON + CSV |
| `docs/OUTBOUND_ARCHITECTURE.md` | Research-backed canonical architecture |
| `docs/sessions/SESSION_2026-04-23_JEGOCLAY.md` | First session audit log |

## ⚙️ The 6-step enrichment pipeline (per lead)

```
1. ICP FILTER (free, instant)
   ├─ Title match: Owner/Founder/CEO/Director General/Director Comercial/
   │               Director de Marketing/Broker/Socio Fundador/Presidente
   ├─ Title blacklist: CHRO/CFO/CTO/General Counsel/Chief of Staff/HR
   └─ Word-boundary matching (fixes "CTO" false-positive in "direCTOr")

2. FIRECRAWL HOMEPAGE SCRAPE
   ├─ Get markdown + metadata + (future: html for script tags)
   └─ Industry check: "real estate / inmobiliaria / propiedades / developer"
      (blacklist: "shelter manufacturing / cpa firm / tax advisory")

3. HUNTER EMAIL WATERFALL (3 tiers)
   ├─ Tier 1: Hunter email-finder (URL-encoded, threshold 25)
   ├─ Tier 2: Hunter domain-search → match pattern to our person
   └─ Tier 3: Pattern generation (firstname@, firstname.lastname@, flast@)

4. PAGESPEED CORE WEB VITALS (Google API)
   └─ Mobile score + LCP + CLS

5. PAIN DETECTION (Module 2 — 30+ signals across 9 categories)
   ├─ Speed: mobile_psi_critical/low, lcp_critical/slow, slow_site
   ├─ Conversion: no_whatsapp, no_live_chat, no_instant_contact,
   │              no_contact_form_visible
   ├─ SEO: weak_title_tag, weak_meta_description, no_blog, stale_content,
   │        thin_content, undated_blog
   ├─ Trust: no_testimonials, no_team_visible
   ├─ Listings: no_virtual_tour, no_search_filters, no_map
   ├─ Tech stack: no_analytics, no_meta_pixel, cms_not_scalable (Wix/Squarespace)
   ├─ Mobile: no_viewport_tag
   ├─ Social proof (planned): review count/rating
   └─ i18n: spanish_only

6. TECH STACK DETECTION (Module 2 — 50+ signatures)
   ├─ CMS: WordPress, Elementor, Divi, Wix, Squarespace, Webflow, Shopify
   ├─ Analytics: GA4, GA Universal, GTM, Plausible, Fathom, Clarity, Hotjar
   ├─ Advertising: Meta Pixel, Google Ads Conversion, TikTok/LinkedIn/Twitter Pixel
   ├─ Chat: Intercom, Drift, Zendesk, LiveChat, Tawk, Crisp, Tidio, Freshchat
   ├─ CRM: HubSpot, Pardot, Mailchimp, ActiveCampaign, Brevo, Klaviyo
   ├─ Forms: Typeform, JotForm, Google Forms, CF7
   └─ Maps: Google Maps embed, Mapbox

7. GEMINI 2.5-FLASH PERSONALIZED SPANISH OPENER
   ├─ Takes top-severity pain + lead name + company + website
   ├─ Generates 2-3 sentence peer-to-peer opener in MX Spanish
   ├─ References SPECIFIC observable pain with data point (e.g. "PSI 47/100")
   └─ Mentions Flamingo Real Estate case study casually

8. SIGNAL SCORING (0-100)
   ├─ +20 ICP pass
   ├─ +15 email found
   ├─ +10 phone found
   ├─ +5 WhatsApp link
   └─ +15 per high-severity pain, +7 per medium

Output JSON per lead:
  icp_pass, email, email_confidence, email_method, phone, whatsapp,
  pagespeed_mobile, pagespeed_lcp_sec, pains[], tech_stack{}, signal_score,
  personalized_opener, industry_signal
```

## 🚀 How to invoke — common flows

### Flow A — Enrich a new CSV (manual, on-demand)

```bash
# User drops CSV at leads/input/vibe_YYYY-MM-DD.csv
# Trigger the GitHub Actions workflow:

gh workflow run enrich-leads.yml \
  -f csv_path=leads/input/vibe_2026-04-24.csv \
  -f batch_name=vibe_april_24 \
  -f workers=8

# OR via API (from Claude session using .secrets/github_token):
curl -X POST https://api.github.com/repos/babilionllc-coder/jegodigital/actions/workflows/enrich-leads.yml/dispatches \
  -H "Authorization: Bearer $(cat .secrets/github_token)" \
  -H "Accept: application/vnd.github+json" \
  -d '{"ref":"main","inputs":{"csv_path":"leads/input/vibe.csv","batch_name":"v1","workers":"8"}}'

# Results land in 15-20 min:
#  → leads/enriched/v2/*.json (full data)
#  → leads/enriched/v2/*.csv  (Instantly-ready)
#  → Slack DM in #all-jegodigital with stats
```

### Flow B — Push enriched leads to Instantly

```bash
# After enrichment, push to Instantly via API V2:
cd /Users/mac/Desktop/Websites/jegodigital
set -a && source website/functions/.env && set +a
bash tools/push_to_instantly.sh

# Creates 2 campaigns (MX Spanish + Miami English) in DRAFT status,
# segments leads by phone prefix, uploads with full custom variables:
#   {{personalized_opener}}, {{top_pain}}, {{pain_detail}},
#   {{signal_score}}, {{whatsapp}}
# 
# Output: 2 campaign IDs printed + Instantly UI link.
# Alex must manually ACTIVATE the campaigns in Instantly UI.
```

### Flow C — Enqueue a new source CSV into daily cron

```bash
# User drops Vibe export at leads/input/vibe_fresh.csv
# Add to queue so daily cron picks it up:
python3 tools/queue_manager.py enqueue leads/input/vibe_fresh.csv

# Daily cron runs 6am CDMX automatically — no further action needed.
# Check queue depth any time:
python3 tools/queue_manager.py status
```

### Flow D — Check production state

```bash
# Lead counts per Instantly campaign:
curl -sS -X POST "https://api.instantly.ai/api/v2/leads/list" \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/8.4.0" \
  -d '{"campaign":"<CAMPAIGN_ID>","limit":100}' | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items',[])))"

# Active campaigns (live verified 2026-04-24):
#   MX Spanish:  45454ff8-6d2f-48db-8c62-e0c19a94a3c1 — 131 leads
#   US English:  e1b8ceaf-bbe9-4522-b805-869223e9fc66 —  16 leads
```

### Flow E — Trigger a manual daily top-up run

```bash
# Run the daily top-up now (doesn't wait for 6am cron):
curl -X POST https://api.github.com/repos/babilionllc-coder/jegodigital/actions/workflows/daily-lead-topup.yml/dispatches \
  -H "Authorization: Bearer $(cat .secrets/github_token)" \
  -H "Accept: application/vnd.github+json" \
  -d '{"ref":"main","inputs":{"batch_size":"50"}}'
```

## 🌙 Autonomous mode (set-and-forget)

Daily cron `.github/workflows/daily-lead-topup.yml` runs every day at **12:00 UTC (6am CDMX)**:

1. Pulls 200 leads from `leads/queue/pending.csv`
2. Runs full JegoClay enrichment
3. Pushes to Instantly campaigns
4. Marks leads consumed
5. Commits queue state
6. Posts Slack summary

**Alex's laptop can be OFF.** Everything runs on GitHub runners.

Alex's only weekly action: drop a fresh Vibe Prospecting export into `leads/input/` once per week (5 min on Monday). Queue stays stocked.

## ⚠️ Known gotchas (hard-won)

| Gotcha | Fix | Source |
|---|---|---|
| Python urllib blocked by Cloudflare on api.instantly.ai (HTTP 403) | Use `curl` via subprocess OR bash script with `User-Agent: curl/8.4.0` | DISASTER_LOG 2026-04-22 |
| Firecrawl `formats=["markdown"]` strips `<script>` tags — tech stack detection misses GTM/GA4/Meta Pixel | Add `"html"` to formats AND scan html field not markdown | This session 2026-04-24 |
| Hunter email-finder with Spanish accents in names (URL-unencoded) returns empty | URL-encode via `urllib.parse.quote_plus()` before building query | This session |
| Hunter score threshold `>= 40` too strict | Lowered to `>= 25` + waterfall to domain-search + pattern generation | This session |
| Title filter using substring match: "CTO" matches "direCTOr" | Use word-boundary matching (pad with spaces, normalize punctuation) | This session |
| Instantly API timezone `America/Mexico_City` rejected | Use `America/Chicago` (same offset, Instantly-accepted) | This session |
| Sandbox 45s bash timeout kills enrichment | Run via GitHub Actions workflow (6-hour runner budget) | This session |
| Background `nohup &` processes killed when bash exits (SIGTERM) | Use foreground batches OR GitHub Actions workflow | This session |

## 🔐 API keys required (all in website/functions/.env + GH Secrets)

- `HUNTER_API_KEY` — email finder waterfall
- `FIRECRAWL_API_KEY` — website scrape
- `SERPAPI_KEY` — SERP lookups (used by v3 signals when added)
- `DATAFORSEO_LOGIN` + `DATAFORSEO_PASS` — SERP + ranking checks
- `PSI_API_KEY` — PageSpeed Core Web Vitals
- `GEMINI_API_KEY` — Spanish opener generation (gemini-2.5-flash)
- `INSTANTLY_API_KEY` — campaign creation + lead push
- `SLACK_WEBHOOK_URL` — summary notifications
- `.secrets/github_token` — autonomous workflow trigger via Git Data API

## 📊 Validated performance (run 24868359785, 2026-04-24)

- **Input:** 391 raw Vibe Prospecting MX real estate leads
- **Duration:** 17 min on GitHub Actions runner
- **Yield:** 235 ICP passed (60%)
- **Email hit rate:** 70% (166/235) via Hunter waterfall
- **Phone hit rate:** 89% (210/235) via Firecrawl
- **Personalized opener:** 100% (235/235)
- **Unique pain types:** 25 distinct
- **Avg pains per lead:** 12
- **Tech stack detected:** 131 leads (partial — see HTML fix below)
- **Opener diversity:** 89% non-WhatsApp angles (vs 42% in v1)
- **Signal score ≥70:** 128 leads (high-priority tier)

## 🗺️ Roadmap (v3+)

| Module | Purpose | Status |
|---|---|---|
| `email_verifier.py` | SMTP verification (NeverBounce replacement) | ✅ Built, not yet wired into main pipeline |
| HTML format fix | Enable proper tech stack detection | 🟡 Planned (5-min change) |
| Google Maps reviews scrape | New signal: trust angle | 🟡 Planned |
| Meta Ad Library scrape | New signal: ad spend angle | 🟡 Planned |
| Listing count + freshness | RE-specific inventory signal | 🟡 Planned |
| LinkedIn hiring posts | Intent signal via Apify | 🟡 Planned |
| Competitive SERP analysis | DataForSEO competitor gaps | 🟡 Planned |

## 🧬 Cost per 390-lead enrichment run

| Service | Cost |
|---|---|
| Firecrawl | Covered by plan |
| Hunter.io | Covered by plan (2K searches/mo) |
| PageSpeed | Free |
| DataForSEO | ~$5-8 |
| Gemini 2.5-flash | ~$3 |
| GitHub Actions | Free (within 2K min/mo) |
| **Total** | **~$8-15 USD** |

**Clay equivalent:** $149-349/mo. **JegoClay advantage:** 20x better unit economics + purpose-tuned for MX real estate + full control of every pipeline step.

## 📚 Reference links

- Architecture doc: `docs/OUTBOUND_ARCHITECTURE.md`
- Session audit: `docs/sessions/SESSION_2026-04-23_JEGOCLAY.md`
- Instantly Copilot validation: `instantly.ai/blog/instantly-clay-ai-powered-lead-enrichment-personalization`
- Deep research: run `python3 tools/research_instantly.py` for current Instantly capabilities

---

*JegoClay — because Clay is $149/mo and this works better for MX real estate at $8-15/run.* 🎯
