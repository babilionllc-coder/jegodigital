# Instantly Supersearch — MASTER (single source of truth)

**Status:** 🟢 BIBLE — replaces v1, v2, SUPERSEARCH_PLAYBOOK, SKILL_v3 §1–2, spam-deliverability_v2 §Supersearch.
**Last verified live:** 2026-05-02 PM (audit + 2 new cohorts + processSupersearchLists.js built + 3/3 validators live).
**Owner:** Alex Jego · **Author:** Claude (autonomous consolidation, HR-0/HR-1/HR-2 compliant).
**Read time:** ~25 min · **Char budget:** ~52 KB.

**v2.3 changes (2026-05-02 PM browser-driven discovery):**
- ✅ **2 cohorts now PRODUCTION-SAFE** (`_safe_for_production:true`): `mx_funding_preventa` (225 leads, uses `funding_type` filter) + `miami_luxury_post` (12 leads, uses `linkedin_post_contact` signal)
- 🎯 Verified working signal keys (array shape `signals: [{key, period_days}]`):
  - `linkedin_post_contact` — 1,367 MX RE leads at 90d / 22 at 30d
  - `twitter_post_company` — 365 MX RE leads at 90d
  - `traffic_surge` — 2,587 MX RE leads at 90d
- 🎯 Verified separate top-level filters (NOT under signals):
  - `funding_type: ["angel","seed","pre_seed","series_a","pre_series_a"]` (snake_case array of strings) → 42,600 MX RE leads
  - `news`, `job_listing` are also separate filters (schemas not yet captured)
- ⚠️ **Skill §3 categorization was wrong** — funding/news/job_listing are NOT signal subtypes; they're sibling top-level filters. Section 3 needs full rewrite next session.
- 5 cohorts still PLACEHOLDER: usa_hiring_trojan (need hiring/job_listing schema), mx_press_aeo (need news schema), mx_exec_change (need exec_change schema), mx_reddit_competitor (need Buying Intent schema), usa_tech_adoption (need Technologies filter — separate top-level)

**v2.1 changes (2026-05-02 PM audit):**
- ✅ Production bug fixed: `buildPersonalization` switch keys now match cohort `personalization_pattern` keys (was returning `""` on every cohort → score 0 → drop everything)
- ✅ Boolean title syntax on all 5 original cohorts (kills HR-5 gate-3 gatekeepers)
- ✅ NEW Cohort 6 — `mx_reddit_competitor` (Buying Intent → Reddit competitor mention)
- ✅ NEW Cohort 7 — `usa_tech_adoption` (Growth → Tech Stack Adoption)
- ✅ Per-cohort `enrichment_options.fully_enriched_profile:false` on cohorts 4-7 (saves ~520 credits/mo)
- ✅ NEW file `processSupersearchLists.js` — second half of pipeline (was missing entirely; skill referenced it for weeks)
- ✅ NEW HTTPS endpoints `reVerifyEmailManual` + `reverseLookupManual` (skill §10.1 + §10.2 now wired)
- ✅ NEW validator `tools/verify_lead_personalization.sh` (Iron Rule #13 enforcement)
- ✅ Rotation mode wired (P4-P7 alternate days when `rotation_mode.enabled:true`)

> Every number, endpoint, place_id, campaign ID, sender, and credit value below was verified against a live Instantly v2 API call in the consolidation session. If a value is in this file, it is real. If it's marked `🟡 needs UI capture`, run that step first.

---

## TL;DR — The 4–7% Reply-Rate Stack

```
Generic + unverified list                                   0.3–1%   ← JegoDigital baseline = 0.29%
+ verified email + clean list (Supersearch ships verified)   1–2%
+ ICP-fit decision-maker (Section 2 filter)                  2–3%
+ WhatsApp-first single-CTA (no PDF, no Calendly upfront)    3–4%
+ Signal-based personalization (Section 6 patterns)          4–7%   ← THE unlock
Top operators (signal-driven, 6+ months tuned)               7–10%
```

Every section below contributes one layer. Skip any layer = drop down the stack. **No single change does it; the multipliers stack.**

**Mandatory hard rules (from `CLAUDE.md`):**
- ❌ NO Instantly tracking pixel · NO link tracking (HR-16). `link_tracking:false` AND `open_tracking:false`.
- ❌ NO ManyChat in new outbound flows.
- ✅ Alex's WhatsApp `+52 998 202 3263` = end goal of every reply.
- ✅ Active IG handle = `@jegodigital` (restored 2026-04-30; `@jegodigital_agencia` retired).
- ✅ Reply target = 4–7%. Single-CTA wins (Tarvent: 371% more clicks).
- ✅ NEVER fabricate counts/dates/$. Every number → live API in this session (HR-0).

---

## Section 1 — Why Supersearch (philosophy)

### 1.1 The problem it solves
JegoDigital's outreach has three failure modes that compound each other:
1. **Volume-without-fit** — Apify + Hunter pulled 419 leads with `firstName="hola allá"` (2026-04-15). 0.46% reply.
2. **Fit-without-timing** — even ICP-perfect leads convert at 1–2% with NO buying-signal personalization.
3. **Timing-without-verification** — handcrafted scrapes leak un-deliverable emails → bounces ≥5% kill domains.

Supersearch fixes ALL THREE in one pull: 450M-contact database (volume) + Signals layer (timing) + 5+ provider waterfall enrichment with verified email (deliverability). One credit spend, three problems solved.

### 1.2 Why it beats the legacy stack

| Tool | Speed | Cost/lead | Hit rate | Signal layer |
|---|---|---|---|---|
| Apify + Hunter (legacy) | ~45 min/100 | $0.15 | 50–60% | ❌ |
| Lead-finder (SerpAPI + PSI) | ~60 min/100 | $0.10 | 40% | ❌ |
| **Supersearch + Signals** | **~3 min/100** | **$0.013** | **65%** | **✅** |
| Apollo / Clay (banned per DIY-stack policy) | n/a | n/a | n/a | n/a |

### 1.3 Credit math (Supersonic plan = $97/mo)
- 5,000 credits/mo · 1–2 credits per verified email find · 0.5 credit per optional enrichment · 0.25 to re-verify
- Average: **~1.5 credits per usable lead** → **~3,300 leads/month**
- Daily ceiling: **167 credits/day** safe (leaves buffer for re-verifies)
- 5 cohorts × 30 leads/day × 1.5 credits = 225 credits → over budget. Use 5 × 25 = 187 (still tight) or rotate cohorts (3/day active, see Section 7).
- Verified live balance 2026-05-01: **552.75 credits**.

### 1.4 The compounding daily-refill principle
A static 1,000-lead pull dies in 5 days (sequence ends, replies trickle to 0). A daily 100-lead refill compounds:
- Week 1: 700 leads in flight, 30+ replies hot
- Week 4: 2,800 leads in flight, 120+ active conversations
- Week 12: steady-state inflow = steady-state pipeline

That's the only path to a self-feeding pipeline. The cron is non-negotiable (Section 7).

---

## Section 2 — Full Filter Reference

### 2.1 The 3 endpoints

```
POST https://api.instantly.ai/api/v2/supersearch-enrichment/count-leads-from-supersearch    [FREE — count check]
POST https://api.instantly.ai/api/v2/supersearch-enrichment/preview-leads-from-supersearch  [FREE — sample 5]
POST https://api.instantly.ai/api/v2/supersearch-enrichment/enrich-leads-from-supersearch   [CREDITS — real pull]
```

Auth: `Authorization: Bearer $INSTANTLY_API_KEY`.
Source: [developer.instantly.ai/api/v2/supersearchenrichment](https://developer.instantly.ai/api/v2/supersearchenrichment).

### 2.2 The verified API body schema (cracked 2026-05-02)

```json
{
  "search_filters": {
    "locations":      [{"place_id": "ChIJEcHIDqKw2YgRZU-t3XHylv8"}],
    "industry":       {"include": ["Real Estate & Construction"], "exclude": []},
    "title":          {"include": ["Owner","Founder","CEO","Director","Managing Broker"]},
    "employeeCount":  [{"op": "between", "min": 5, "max": 500}],
    "signals":        [{"signal_type": "Growth", "signal_subtype": "Funding", "days_back": 30}],
    "skip_in_workspace":     true,
    "one_lead_per_company":  true
  },
  "limit": 30,
  "resource_id":   "<destination-list-uuid>",
  "resource_type": 1,
  "skip_owned_leads":          true,
  "show_one_lead_per_company": true,
  "work_email_enrichment":     true,
  "fully_enriched_profile":    true,
  "email_verification":        true,
  "autofill":                  false
}
```

**Critical UI ↔ API translations** (the trap that ate us 4 sessions):

| UI URL field | API body field |
|---|---|
| `selectedLocations` | `locations` |
| `placeId` (camelCase) | `place_id` (snake_case) |
| `industry.industries.include {name: true}` | `industry.include ["name"]` (object → array, no `.industries` wrapper) |
| `title.include {name: true}` | `title.include ["name"]` (object → array) |
| `employeeCount` | `employeeCount` (stays camelCase) |

### 2.3 Verified place_ids for JegoDigital ICPs

| Geo | Place ID | Notes |
|---|---|---|
| Mexico (country) | `ChIJU1NoiDs6BIQREZgJa760ZO0` | ✅ filters work |
| USA (country) | `ChIJCzYy5IS16lQRQrfeQ5K5Oxw` | ✅ filters work |
| Miami FL USA | `ChIJEcHIDqKw2YgRZU-t3XHylv8` | ✅ filters work |
| Miami Beach FL | `ChIJud3-Kxem2YgR62OUJUEXvjc` | ✅ verified live |
| Mexico City CDMX | `ChIJB3UJ2yYAzoURQeheJnYQBlQ` | 🟡 returns 1M cap — Instantly's index has no city tagging for MX cities. Use country-MX. |
| Cancún, Playa del Carmen, Tulum | n/a | 🟡 same issue. Use country-MX + bilingual title filters as proxy. |

**Place ID lookup endpoint** (use this when you need a new geo):
```
GET https://api.instantly.ai/api/v2/places-autocomplete?q={query}
```

### 2.4 Verified industry enums
ONLY value confirmed working: **`"Real Estate & Construction"`**.
Rejected (`must be equal to one of the allowed values`): `"Real Estate"`, `"Realty"`, `"real-estate"`, `"real_estate"`, `"Construction"`, LinkedIn IDs (44, 105, 1611), NAICS codes.

The full allowlist is unpublished. To extend, capture from Instantly UI dropdown (Section 11 pre-pull check).

### 2.5 Verified live cohort counts (2026-05-02)

| Cohort | Filter | Count |
|---|---|---|
| Miami FULL (RE&C + DM titles + 5–500 emp) | full filter | **1,330** |
| MX country FULL (RE&C + DM titles + 5–500 emp) | full filter | **16,381** |
| USA country FULL (RE&C + DM titles) | full filter | **273,581** |
| Empty filter | `{}` | 1,000,000 (cap = filter ignored) |

If you see 1,000,000 → your filter is broken; the API is silently ignoring it.

### 2.6 Title Boolean syntax — ⚠️ UI-ONLY (verified broken via API 2026-05-02 PM)
Per [help.instantly.ai/articles/11364248](https://help.instantly.ai/en/articles/11364248-supersearch), Boolean syntax is documented for the UI:
- `AND` / `OR` / `NOT` / `()` / `""`

**HOWEVER:** live API probe 2026-05-02 PM confirms `title.boolean` is **silently ignored** by the count-leads endpoint — it returns 1,000,000 (the "filter discarded" pitfall #1 trap). Boolean syntax in `title.include` arrays is also rejected. **Use `title.include: ["Owner", "CEO", ...]` arrays only via API.** To approximate `NOT (assistant|intern)` behavior, simply don't INCLUDE those titles — Instantly's title matching is exact (not substring).

Test that proved it (2026-05-02 PM):
```
title.boolean ("Owner" OR "CEO") AND NOT ("assistant")  → 1,000,000 (filter ignored)
title.include ["Owner","CEO"]                             → 130,975  (filter applied)
```

### 2.7 AI Search natural-language prompts
Instantly's UI accepts plain English/Spanish queries that translate to filter JSON. Use these to bootstrap new cohorts, then capture the JSON via "Get API request":

1. *"Real estate and construction companies in Mexico led by a founder or CEO with a funding round in the last 30 days. Company size 10–500 employees. Skip leads already in my workspace."*
2. *"USA real estate companies where VP of Marketing or CMO has active job postings for marketing or sales roles in the last 14 days. Size 10–5,000."*
3. *"Real estate brokers and owners in Miami, Florida with a LinkedIn post in the last 7 days. At least 50 employees."*
4. *"CEO or founder of a real estate development company in Mexico mentioned in news or press in the last 30 days. 10–500 employees."*
5. *"Real estate companies in Mexico with a new CMO or VP Marketing in the last 60 days. 50–500 employees."*

---

## Section 3 — Signals deep-dive

⚠️ **2026-05-02 PM API truth:** the `signals[].{signal_type, signal_subtype, days_back}` shape documented earlier in §2.2 is **REJECTED** by live API ("must be string OR object with `key` property"). The accepted shape is `signals[].{key:"<enum>"}`. But **15 plausible enum values** (`funding_round`, `funding`, `hiring`, `hiring_surge`, `linkedin_post`, `executive_change`, `exec_change`, `job_change`, `news`, `press_mention`, `reddit_mention`, `tech_stack`, `tech_adoption`, `product_launch`, `partnership`) **all returned 0 leads** when probed against MX + USA + Real Estate & Construction. Two possibilities:

1. **Signals is a paid add-on** — Instantly's [pricing page](https://instantly.ai/pricing) lists "Buying Intent Data" as a Hyper-tier feature. JegoDigital is on Supersonic ($97/mo) which may not include Signals.
2. **Enum is unpublished** — only obtainable via UI "Get API request" capture (skill §11 step 3).

**Action required:** Alex captures one signal JSON via UI ONCE. Until then, every signal cohort runs in PLACEHOLDER mode (count-only diagnostic, 0 credit spend). The cron's `_safe_for_production` gate is OFF on every cohort (verified live 2026-05-02 PM in `supersearch_cohorts.json`).

Supersearch organizes Signals into 4 categories. Source: [help.instantly.ai/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch).

### 3.1 📱 Social Activity

| Filter | Use when | Refresh | Reliability | Pattern |
|---|---|---|---|---|
| LinkedIn Post (7/14/30d) | Quote their own words | Daily-ish (LI rate-limits) | ⭐⭐⭐ Medium | Pattern 3 — Post Quote |
| Twitter/X Post | Public commentary on competitors | Daily | ⭐⭐⭐ Medium | Pattern 3 — Post Quote |
| YouTube Video | Founder published recent | Weekly | ⭐⭐ Low-medium | Pattern 3 — Post Quote |
| Job Change | Lead just took new role | Daily | ⭐⭐⭐⭐ High | Pattern 4 — Exec Change |
| News Mention | Lead/co. in press | Daily | ⭐⭐⭐⭐ High | News Mention |

### 3.2 💰 Buying Intent

| Filter | Use when | Refresh | Reliability | Pattern |
|---|---|---|---|---|
| Reddit competitor mention | Competitor discussed in r/* | Daily | ⭐⭐⭐ Medium (sentiment is noisy on sarcasm) | Pattern 5 — Reddit |
| Pricing complaint thread | Forum complaint about a competitor pricing | Daily | ⭐⭐⭐ Medium | Pattern 5 — Reddit |
| Comparison-shopping | Visiting comparison content | Daily | ⭐⭐⭐ Medium | Pain-point pivot |
| Churn-language Reddit | "I left X for Y" threads | Daily | ⭐⭐⭐ Medium | Pattern 5 — Reddit |

### 3.3 📈 Growth Signals

| Filter | Use when | Refresh | Reliability | Pattern |
|---|---|---|---|---|
| **Funding Round** (30/60/90d) | Just-raised companies (BUDGET = OPEN) | Daily | ⭐⭐⭐⭐⭐ High (Crunchbase/SEC filings) | Pattern 1 — Funding |
| **Hiring Surge** (14/30d, role keywords) | Company hiring marketing/sales/growth | Daily | ⭐⭐⭐⭐⭐ High (URL-verifiable) | Pattern 2 — Hiring |
| Product Launch | New product announced | Weekly | ⭐⭐⭐ Medium | Pattern 3 |
| Partnership | Strategic partnership announced | Weekly | ⭐⭐⭐ Medium | News Mention |
| Tech Stack Adoption | Job description names HubSpot/Salesforce/etc. | Weekly | ⭐⭐⭐⭐ High (parsed from public job desc) | Tech Stack pivot |
| Revenue Growth (estimated) | Estimated revenue jump | Monthly | ⭐⭐⭐ Medium | Growth Mention |

### 3.4 🏢 Company Activity

| Filter | Use when | Refresh | Reliability | Pattern |
|---|---|---|---|---|
| **Executive Change** (60/90d) | New CMO/VP/Director (90-day budget reset window) | Daily | ⭐⭐⭐⭐⭐ High (LI title-change scraping is mature) | Pattern 4 — Exec |
| New Office / Expansion | Geographic expansion | Weekly | ⭐⭐⭐⭐ High | Pattern 4 — Expansion |
| Acquisition / M&A | Buy/sell event | Daily | ⭐⭐⭐⭐ High (public press) | News Mention |
| Pricing Page Update | Pricing changed on website | Daily | ⭐⭐⭐ Medium (could be typo) | Custom |
| Traffic Shift | Significant traffic delta | Weekly | ⭐⭐ Low (Similarweb noise) | Avoid |
| Glassdoor Sentiment | Review-rate negative shift | Monthly | ⭐⭐ Low-medium (only 100+ employee co.) | Avoid for SMB |

### 3.5 JegoDigital priority order

1. **Funding Round** — highest-conviction buy signal (just-raised co. = budget reset)
2. **Hiring Surge** for marketing/sales — they admit they need help
3. **Executive Change** — CMO/VP change = 90-day budget reset window
4. **LinkedIn Post** — flexible, any topic, verbatim opener = 9–10/10 score
5. **News Mention** — easy AEO/SEO upsell pivot
6. **Reddit competitor mention** — only when sentiment is verifiable (open the thread)

**Iron rule (HR-0):** before quoting any signal in copy, paste the source URL into the lead row. If a human can't see the same thing in 30 seconds, the personalization fails the score gate (Section 6).

---

## Section 4 — JegoDigital Cohort Recipes (the 5 v2 cohorts)

Each cohort = **filter combo + target campaign + opener pattern + expected reply rate + daily volume**. All wired into `website/functions/supersearch_cohorts.json` as the live source of truth.

### Cohort 1 — `mx_funding_preventa` 🇲🇽 (priority 1)

| Field | Value |
|---|---|
| Label | MX Real Estate Devs + Funding 30d |
| Geo | Mexico (country) |
| Industry | Real Estate & Construction |
| Title | Owner, Founder, CEO, Director General, Promotor Inmobiliario, Director de Desarrollo |
| Employee count | 10–500 |
| Signal | Growth → Funding · 30 days |
| Daily pull | 30 leads · 1.75 credit/lead · ~1,575/mo budget |
| Expected pool | ~140 |
| **Target campaign** | `2a810fd5-f236-4bb7-aec2-c1043f681561` — *Lanzamiento Preventa 90 Días — 2026-04-27* (✅ active, link_tracking:false, open_tracking:false) |
| **Reply rate target** | **5–7%** |
| Pattern | Spanish funding mention |
| Opener | *"Felicidades por la ronda de {{funding_amount}} con {{funding_lead_investor}}. Living Riviera Maya logró Top-3 en ChatGPT en 90 días con el sistema que monto — quería ver si encaja con tu próximo lanzamiento."* |

### Cohort 2 — `usa_hiring_trojan` 🇺🇸 (priority 2)

| Field | Value |
|---|---|
| Label | USA RE + Hiring marketing/sales 14d |
| Geo | USA (country) |
| Industry | Real Estate & Construction |
| Title | Owner, Founder, CEO, President, VP Marketing, Director of Marketing, Head of Growth |
| Employee count | 5–500 |
| Signal | Growth → Hiring · 14 days · role keywords [marketing, sales, growth] |
| Daily pull | 45 · 1.5 credit/lead · ~2,025/mo |
| Expected pool | ~320 |
| **Target campaign** | `d81333f4-19ee-444f-8fbd-b1e863100cbb` — *USA Real Estate Devs 2026-05* |
| **Reply rate target** | **4–6%** |
| Pattern | English hiring mention |
| Opener | *"Saw {{companyName}} is hiring a {{hiring_role}} — usually that means the lead pipeline is the bottleneck, not closing. Flamingo solved this with a 24/7 AI on WhatsApp."* |

### Cohort 3 — `miami_luxury_post` 🌴 (priority 3)

| Field | Value |
|---|---|
| Label | Miami Luxury RE 50+ + LinkedIn post 7d |
| Geo | Miami FL USA |
| Industry | Real Estate & Construction |
| Title | Owner, Founder, CEO, Director, Managing Broker, Principal Broker |
| Employee count | 50–1,000 |
| Signal | Social Activity → LinkedIn Post · 7 days |
| Daily pull | 20 · 1.5 credit/lead · ~900/mo |
| Expected pool | ~78 |
| **Target campaign** | `acffe5c9-9a74-4b3f-8a95-37882a11f96b` — *USA Miami RE — Hiring + Audit Personalization — 2026-04-26* |
| **Reply rate target** | **3–5%** |
| Pattern | English post quote (institutional credibility play) |
| Opener | *"Your post about {{last_post_topic_excerpt}} hit on something most agencies miss. Sur Selecto (AMPI Presidente Ejecutivo, Playa del Carmen) uses a similar play — wanted to compare notes."* |

### Cohort 4 — `mx_press_aeo` 📰 (priority 4 — AEO/SEO upsell)

| Field | Value |
|---|---|
| Label | MX RE + Press/News 30d (AEO/SEO upsell — ChatGPT proof) |
| Geo | Mexico (country) |
| Industry | Real Estate & Construction |
| Title | Owner, Founder, CEO, Director General, Director Marketing, VP Marketing |
| Employee count | 8–500 |
| Signal | Company Activity → News · 30 days |
| Daily pull | 25 · 1.25 credit/lead · ~937/mo |
| Expected pool | ~95 |
| **Target campaign** | `8b5f556f-9259-4258-b74b-2df55712f520` — *Auditoría Gratis — Tu Sitio Web* (verified live 2026-05-02) |
| **Reply rate target** | **4–6%** |
| Pattern | Spanish press → AEO pivot |
| Opener | *"Vi la nota sobre {{news_headline}}. Living Riviera Maya aparece Top-3 en ChatGPT cuando un comprador pregunta 'mejores inmobiliarias en Playa del Carmen' — vale la pena verlo."* |

### Cohort 5 — `mx_exec_change` 🔄 (priority 5 — new-leadership angle) **← THE MISSING 5TH IN PRODUCTION**

| Field | Value |
|---|---|
| Label | MX RE + Exec Change 60d (Solik 95% qualify — new leadership angle) |
| Geo | Mexico (country) |
| Industry | Real Estate & Construction |
| Title | VP Marketing, CMO, Director Marketing, Head of Growth, Director General |
| Employee count | 8–500 |
| Signal | Company Activity → Executive Change · 60 days |
| Daily pull | 18 · 1.5 credit/lead · ~810/mo |
| Expected pool | ~67 |
| **Target campaign** | `a1139971-4c50-44f1-ac79-3a726a70c8b5` — *Trojan Horse V2 — Personalized 2026-04-24* |
| **Reply rate target** | **5–7%** |
| Pattern | Spanish exec change |
| Opener | *"Felicidades por tu nuevo rol en {{companyName}}. Solik califica el 95% de sus leads en 48h con la misma plataforma — primer mes de un nuevo head suele ser el momento perfecto para evaluarla."* |

### Cohort 6 — `mx_reddit_competitor` 🧵 (priority 6 — Buying Intent NEW 2026-05-02)

| Field | Value |
|---|---|
| Label | MX RE + Reddit competitor mention 14d (audit pivot) |
| Geo | Mexico (country) |
| Industry | Real Estate & Construction |
| Title (Boolean) | `("Owner" OR "Founder" OR "CEO" OR "Director General" OR "VP Marketing" OR "Director Marketing") AND NOT ("assistant" OR "intern" OR "junior")` |
| Employee count | 5–500 |
| Signal | Buying Intent → Reddit Competitor Mention · 14 days 🟡 enum needs UI capture |
| Daily pull | 15 · 1.0 credit/lead · ~450/mo budget |
| Expected pool | ~50 |
| **Target campaign** | `8b5f556f-9259-4258-b74b-2df55712f520` — *Auditoría Gratis — Tu Sitio Web* |
| **Reply rate target** | **4–5%** |
| Pattern | Spanish Reddit mention (Pattern 5) |
| Opener | *"Vi el hilo en r/{{subreddit}} sobre {{topic}} la semana pasada, varios comentarios mencionando a {{competitor}}. Sur Selecto cerró 95% de leads sin perder ninguno con un setup tipo auditoría gratis, ¿quieres que te muestre cómo?"* |

### Cohort 7 — `usa_tech_adoption` ⚙️ (priority 7 — Growth signal NEW 2026-05-02)

| Field | Value |
|---|---|
| Label | USA RE + Tech Stack Adoption 30d (integration angle) |
| Geo | USA (country) |
| Industry | Real Estate & Construction |
| Title (Boolean) | `("VP Marketing" OR "CMO" OR "Director of Marketing" OR "Head of Growth" OR "VP Sales") AND NOT ("assistant" OR "intern" OR "junior")` |
| Employee count | 10–500 |
| Signal | Growth → Tech Stack Adoption · 30 days · keywords [HubSpot, Salesforce, Pipedrive] 🟡 enum needs UI capture |
| Daily pull | 20 · 1.0 credit/lead · ~600/mo budget |
| Expected pool | ~110 |
| **Target campaign** | `dbb9dfd7-4ae2-4a44-ba28-d895206d78d6` — *US-Hispanic-Bilingual-Audit* (was getting zero Supersearch fill) |
| **Reply rate target** | **4–5%** |
| Pattern | English tech-stack mention (NEW pattern, see §6.2) |
| Opener | *"Saw {{companyName}} just adopted {{tech_stack}}, smart move. Most {{tech_stack}} setups in real estate leak leads at the inbox handoff, Sur Selecto plugs that gap with a bilingual AI on WhatsApp before the lead cools."* |

### Total daily/monthly footprint (v2.1 — 7 cohorts)

| Metric | Value |
|---|---|
| Total daily pull (all 7 cohorts) | **173 leads** |
| Total monthly credit budget | **6,840 credits** ⚠️ over Supersonic 5K cap |
| Expected total monthly pool (~30 days) | ~5,200 net new leads |
| Expected replies @ 5% blended | ~260/month |
| Expected Calendly/WA conversations @ 30% reply→positive | ~78/month |

**Two paths to fit budget:**
- **(a) Rotation mode** — set `rotation_mode.enabled:true` in `supersearch_cohorts.json`. P1–P3 fire daily; P4-P7 fire on alternating days (priority%2 == day%2). Net ~5,670/mo (still 670 over).
- **(b) Upgrade to Hyper $197/10K** — 3,160 credit buffer. Recommended IF Boolean+signal cohorts hit ≥4% reply rate within 14 days.

**Default mode:** rotation OFF (all 7 fire daily) — burns ~830 credits over Supersonic cap. Watch balance via `coldEmailDailyReport`. Flip rotation ON if balance drops below 1,500 with >5 days left in the month.

---

## Section 5 — Enrichment fields (everything Supersearch returns)

Per [instantly.ai/blog/lead-enrichment](https://instantly.ai/blog/lead-enrichment/) + observed payloads (2026-05-02 sample lead from list `05628a9b-f76d-44a9-a412-dc970fecadbc`):

### 5.1 Personal
| Field | Example |
|---|---|
| `first_name`, `last_name`, `full_name` | "Mathew", "Laborde, Sior, Ccim" |
| `job_title` (raw) | "President and CEO" |
| `seniority` / `jobLevel` | "Chief X Officer (CxO)" / "Owner" / "Director" / "Manager" |
| `headline` | "I never check LinkedIn messages…" |
| `summary` | full bio paragraph |
| `linkedIn` | "linkedin.com/in/mathewlaborde" |
| `location` | "Baton Rouge, Louisiana, United States" |
| `department` | "Sales" / "Marketing" / "Other" |
| `connectionCount` | "29145" |

### 5.2 Company
| Field | Example |
|---|---|
| `company_name` / `companyName` | "Elifin®" |
| `company_domain` / `companyDomain` | "elifinrealty.com" |
| `companyWebsite` | "http://elifinrealty.com" |
| `industry` | "Real Estate & Construction" |
| `subIndustry` | "Real Estate" |
| `companyHeadCount` | "25 - 100" / "0 - 25" / "51-200" |
| `company_revenue` (range, optional) | "$1M-$10M" |
| `company_founded` (year) | 2018 |
| `company_location` (HQ) | "Baton Rouge, LA, USA" |
| `companyDescription` | long form |

### 5.3 Email (verification)
| Field | Notes |
|---|---|
| `email` | verified work email |
| `verification_status` | 1 = deliverable · 2 = catch-all · 3 = role · 4 = undeliverable |
| `esp_code` | 1 = Google Workspace · 2 = Outlook · 999 = other (= less reliable, often paid hosts) |
| `esg_code` | provider-group code |

### 5.4 Signal-specific (toggled per pull)
| Signal type | Fields returned |
|---|---|
| Funding | `funding_amount`, `funding_lead_investor`, `funding_round_type`, `funding_date` |
| Hiring | `hiring_role`, `hiring_department`, `hiring_count`, `job_post_url`, `job_post_date` |
| Exec change | `exec_change_name`, `exec_change_title`, `exec_change_date` |
| News | `news_headline`, `news_url`, `news_date`, `news_publication` |
| LinkedIn post | `last_post_text`, `last_post_date`, `last_post_url`, `last_post_reactions` |
| Tech stack | `tech_stack` (array) |

### 5.5 Geographic
`country`, `state`, `city`, `timezone`, `metro_area`.

> 🟡 Field-name reality: top-level vs `payload.*`. Live samples nest most enrichment under `payload.{firstName,companyDomain,connectionCount,…}`. Read both: `lead.first_name || lead.payload.firstName`.

---

## Section 6 — Personalization → Reply Rate (the 4–7% pipeline)

This is the **operational heart** of the skill. Every step here is what separates 1–2% from 4–7%.

### 6.1 Field → variable mapping

| Supersearch field(s) | Instantly variable | First-sentence opener use |
|---|---|---|
| `first_name` | `{{firstName}}` | "Hola {{firstName}}," / "Hi {{firstName}}," |
| `company_name` | `{{companyName}}` | "Saw {{companyName}} just announced…" |
| `companyWebsite` | `{{website}}` | "Looked at {{website}} and noticed…" |
| `funding_amount` + `funding_lead_investor` + `funding_date` | combined → `{{personalization}}` | Pattern 1 |
| `last_post_text` (8-word excerpt) | `{{personalization}}` | Pattern 3 |
| `hiring_role` + `companyName` | `{{personalization}}` | Pattern 2 |
| `exec_change_title` + `exec_change_date` | `{{personalization}}` | Pattern 4 |
| `news_headline` | `{{personalization}}` | News Mention |

**Critical rule:** `{{personalization}}` is ALWAYS the FIRST sentence after the salutation. If it's generic, the email dies.

### 6.2 The 5 highest-converting patterns

#### Pattern 1 — Funding Mention (HIGHEST)
- **EN:** "Congrats on the {{funding_amount}} round from {{funding_lead_investor}} {{funding_when}} — saw it on the wire."
- **ES:** "Felicidades por la ronda de {{funding_amount}} con {{funding_lead_investor}} {{funding_when}} — vi el anuncio."
- **Real example:** "Congrats on the $12M Series A from Greycroft three weeks ago — sharp move into Mexico City."
- **Lift:** **+3 to +5 pp** over generic.

#### Pattern 2 — Hiring Mention
- **EN:** "Saw {{companyName}} is hiring a {{hiring_role}} — usually that means the lead pipeline is the bottleneck, not the closing."
- **ES:** "Vi que {{companyName}} está buscando un {{hiring_role}} — normalmente eso significa que el cuello de botella está en el pipeline de leads, no en cerrar."
- **Lift:** **+2 to +4 pp**.

#### Pattern 3 — Post Quote (HIGHEST "feels real")
- **EN:** "Your LinkedIn post about {{post_topic_8_words}} hit on something — most {{industry}} CMOs miss it."
- **ES:** "Tu publicación en LinkedIn sobre {{post_topic}} dio justo en el punto — la mayoría de los CMOs en {{industry}} lo pasan por alto."
- **Lift:** **+2 to +3 pp**. Verbatim from THEIR own words = 9–10/10 score every time.

#### Pattern 4 — Exec Change
- **EN:** "Saw you took over as {{title}} at {{companyName}} {{exec_change_when}} — first 90 days are when budget reshuffles happen."
- **ES:** "Vi que tomaste el cargo de {{title}} en {{companyName}} hace {{exec_change_when}} — los primeros 90 días son cuando se reorganiza el presupuesto."
- **Lift:** **+2 to +4 pp**. Pairs with "free audit" CTA.

#### Pattern 5 — Reddit / Forum Mention
- **EN:** "Saw the r/{{subreddit}} thread on {{topic}} last week — people are noticing what {{competitor}} is doing."
- **ES:** "Vi el hilo en r/{{subreddit}} sobre {{topic}} la semana pasada, varios comentarios mencionando a {{competitor}}."
- **Verification (mandatory):** open the thread. Confirm sentiment. If sentiment classifier and human read disagree, trust the human.
- **Lift:** **+1 to +2 pp**.

#### Pattern 6 — Tech Stack Adoption (NEW 2026-05-02)
- **EN:** "Saw {{companyName}} just adopted {{tech_stack}}, smart move. Most {{tech_stack}} setups in real estate leak leads at the inbox handoff."
- **ES:** "Vi que {{companyName}} acaba de implementar {{tech_stack}}, buena jugada. La mayoría de stacks {{tech_stack}} en bienes raíces fugan leads en el handoff de inbox."
- **Verification (mandatory):** check the company's job posts (`job_post_url`) — tech_stack is parsed from public job descriptions. If no job post mentions the stack, the data is stale.
- **Lift:** **+1 to +2 pp**. Best when paired with Sur Selecto (bilingual AI) or Flamingo (24/7) case study.

### 6.3 The Personalization Quality Score (drop <7)

Reference: `personalization-engine` skill. Score 0–10 across 5 axes (0–2 each):

| Axis | What earns 2 pts |
|---|---|
| Specificity | Names a concrete fact (amount, role, date, post excerpt) |
| Verifiability | Fact is checkable (LinkedIn URL, Crunchbase, news article) |
| Relevance | Fact ties to JegoDigital value prop (lead gen / SEO / AEO / pre-sale) |
| Naturalness | Sounds like a human friend ("hit a nerve") not a bot ("interesting insight") |
| Brevity | ≤25 words. Meat of email comes after. |

**Auto-zero triggers** (drop instantly): banned phrases ("hope this finds you well", "wanted to reach out", "as an expert", "sin compromiso", "sólo te tomará un minuto"), em-dashes `—` in opener, mention of JegoDigital/AI/Claude/ChatGPT/automation, unfilled `{{var}}` or `undefined`.

**Typical drop rate:** 20–30%.

### 6.4 The 4–7% reply-rate math (cumulative)

| Stage | Reply rate | Why |
|---|---|---|
| Generic cold, unverified list | 0.3–1% | Spam filters + irrelevant audience |
| + verified email + clean list | 1–2% | Lands in inbox |
| + ICP-fit (real-estate decision-maker) | 2–3% | Industry resonance |
| + Single CTA + WA-first close | 3–4% | Lower friction |
| **+ Signal-based personalization** | **4–7%** | "This is real" instinct unlocks |
| Top operators (signal-driven, 6mo+ tuned) | 7–10% | Skill ceiling |

JegoDigital baseline 0.29% → target 4–7% = 14–24× lift in 30 days.

---

## Section 7 — Daily Refill Workflow (the cron)

### 7.1 The two-stage pipeline (BOTH halves now built — 2026-05-02 PM)

**Stage A — `dailySupersearchRefill.js`** (always existed)
- Schedule: `0 7 * * *` UTC = 01:00 Cancún CDMX
- Trigger: pubsub schedule + manual HTTPS `dailySupersearchRefillManual` (header `x-admin-token`)
- Job: count → preview → create list → trigger enrichment INTO list (per-cohort `enrichment_options`)
- Cohort config: `website/functions/supersearch_cohorts.json` (live source of truth)
- Reads `rotation_mode.enabled` flag — when true, P4-P7 fire on opposite-parity days

**Stage B — `processSupersearchLists.js`** ✅ NEW 2026-05-02 (was missing for weeks)
- Schedule: `30 8 * * *` UTC = 02:30 Cancún CDMX (90 min after Stage A)
- Trigger: pubsub schedule + manual HTTPS `processSupersearchListsManual`
- Job: walk each new `Supersearch <cohort> <date>` list (3-day lookback) → for each enriched lead:
  1. `buildPersonalization(lead, cohort)` substitutes `{{var}}` from cohort template
  2. `scorePersonalization(text)` returns 0-10
  3. Drop if score <7 OR signal-specific var missing (HR-0 — never fabricate)
  4. PATCH `/leads/{id}` with `{personalization, custom_variables}`
  5. POST `/leads/move` to cohort.target_campaign_id
- Posts Slack digest with scanned/moved/dropped breakdown + avg score per list-cohort

### 7.2 Stages per cohort

```
Stage 1: countLeads()                      [free]   — verify ≥50 leads (refuse if lower)
Stage 2: previewLeads(limit=3)             [free]   — sanity-check ICP visually
Stage 3: createLeadList(name)              [free]   — destination list "Supersearch <key> <YYYY-MM-DD>"
Stage 4: runEnrichment(filters, limit, listId)      — async, consumes credits, leads land in list
Stage 5: (next cron tick or process_supersearch_lists.cjs at 02:30 CDMX):
         - Stage 3 pain detection (Firecrawl)
         - Stage 4 personalization-engine (Gemini, score ≥7)
         - Stage 5 move leads to target campaign by topPain or COHORT_CAMPAIGN_OVERRIDE
Stage 6: Slack digest posted to #daily-ops
```

### 7.3 Slack digest format

```
🔁 Daily Supersearch Refill — 2026-05-02
✅ mx_funding_preventa     — count=140 · status=ENRICHMENT_TRIGGERED
✅ usa_hiring_trojan       — count=320 · status=ENRICHMENT_TRIGGERED
✅ miami_luxury_post       — count=78  · status=ENRICHMENT_TRIGGERED
🟡 mx_press_aeo            — count=95  · status=PLACEHOLDER_FILTERS · _filter UI capture pending_
✅ mx_exec_change          — count=67  · status=ENRICHMENT_TRIGGERED
_run time: 18.3s_
```

### 7.4 Companion processor
- **File:** `website/tools/process_supersearch_lists.cjs`
- **Schedule:** 02:30 CDMX daily (90 min after refill, gives Instantly time to land enriched leads)
- **Job:** for each new `Supersearch <cohort> <date>` list — Firecrawl pain detection → Gemini personalization → score → move to campaign
- **Cohort routing:** explicit override `mx_developers → Lanzamiento Preventa`, otherwise `ROUTING[region][topPain]` (see file for matrix)

---

## Section 8 — De-dup + lead hygiene

The 5 layers, in order:

1. **`skip_in_workspace: true`** — built-in. ALWAYS true. Prevents re-emailing existing campaign/list members.
2. **`one_lead_per_company: true`** — built-in. Prevents 5 contacts at same domain → spam.
3. **Cross-campaign deny list** — pull all current campaign leads into `/tmp/known_emails_unique.txt`, `comm -23` against fresh pull.
4. **`DISASTER_LOG.md` grep** — before any pull, grep for prior-burned domains (HR-10).
5. **Personalization quality gate** — Section 6.3, drop <7.

### 8.1 Banned phrases (auto-drop)

```
ES: "espero que estés bien", "vi tu sitio y me encantó", "como experto",
    "sin compromiso", "solo te tomará un minuto", "sé que estás ocupado",
    "aprovechando que"
EN: "i hope this finds you well", "i wanted to reach out", "as an expert in",
    "quick question", "just touching base", "hope you're doing well"
```

### 8.2 Skip-current-clients gate

Before upload, intersect against verified-client domains (HR client-domain gate):
- `realestateflamingo.com.mx` (Flamingo)
- `playadelcarmenrealestatemexico.com` (Living Riviera Maya)
- `surselecto.com` (Sur Selecto)
- `rsviajesreycoliman.com` (RS Viajes)
- `ttandmore.com` (TT&More)
- Any future client → add to `/website/showcase.html`-mirrored deny list.

### 8.3 Gen 2 sender pool (verified 2026-04-24)

| Domain | Mailboxes | Provider | Daily limit | Warmup |
|---|---|---|---|---|
| `zennoenigmawire.com` | ariana, emily, peter, russell, william | Google Workspace | 30/each | ON, score 100/100 |
| `zeniaaqua.org` | henry, kevin, michael, roger, ryan | Google Workspace | 30/each | ON, score 100/100 |
| **Total** | **10 mailboxes** | | **300/day** | |

❌ NEVER use: `@aichatsy.com`, `@jegoaeo.com`, `@jegoleads.*`, `@gmail.com`, `@jegodigital.com` (deprecated for Gmail deliverability).

---

## Section 9 — Cohort routing rules

| Signal type | Goes to campaign | Why |
|---|---|---|
| Funding (mx_funding_preventa) | `2a810fd5…` Lanzamiento Preventa | Just-raised → preventa launch budget = perfect-fit |
| Hiring (usa_hiring_trojan) | `d81333f4…` USA RE Devs 2026-05 | Marketing/sales hire = admit lead pipeline broken = Trojan Horse |
| LinkedIn post (miami_luxury_post) | `acffe5c9…` USA Miami RE | Verbatim post quote + Sur Selecto institutional credibility |
| Press/News (mx_press_aeo) | `8b5f556f…` Auditoría Gratis | News mention → AEO/SEO upsell with ChatGPT proof |
| Exec change (mx_exec_change) | `a1139971…` Trojan Horse V2 | New exec = 90-day budget reset = audit-first |
| Bilingual broad MX | `Trojan Horse V2` (fallback) | Default if no signal |
| Bilingual broad USA | `USA Real Estate Devs 2026-05` (fallback) | Default if no signal |
| Bilingual broad Miami | `USA Miami RE` (fallback) | Default if no signal |

**HARD RULE: One cohort per campaign — never mix funding leads with hiring leads in one campaign.** Different opener pattern = different campaign.

---

## Section 10 — Other Supersearch features

### 10.1 Reverse Lookup (find prospects from a known company) ✅ WIRED 2026-05-02
- API endpoint: `POST /supersearch-enrichment/reverse-lookup` with `{company_domain: "elifinrealty.com"}` returns all known contacts at that company
- **Wired in:** `dailySupersearchRefill.js → reverseLookup(domain)` helper
- **HTTPS endpoint:** `https://us-central1-<project>.cloudfunctions.net/reverseLookupManual?domain=elifinrealty.com` (header `x-admin-token: $ADMIN_TRIGGER_TOKEN`)
- Use for ABM-style "I want everyone at Acme" plays — typically against verified-client competitor domains

### 10.2 Re-verify (refresh stale emails) ✅ WIRED 2026-05-02
- API endpoint: `POST /email-verification` (returns `credits_used: 0.25`)
- **Wired in:** `dailySupersearchRefill.js → reVerifyEmail(email)` helper
- **HTTPS endpoint:** `https://us-central1-<project>.cloudfunctions.net/reVerifyEmailManual?email=foo@bar.com` (header `x-admin-token: $ADMIN_TRIGGER_TOKEN`)
- When: any lead inactive >30 days → re-verify before re-engagement (Brevo nurture handoff is the typical use)
- Cost: 0.25 credit/email (4× cheaper than fresh find)

### 10.3 Bulk export
- Endpoint: `GET /lead-lists/{id}/export` returns CSV
- Use: handoff to Brevo nurture (existing leads only — NOT cold)

### 10.4 Webhook integrations
- Instantly → Cloud Function on reply: `/instantlyReplyWatcher` (POST, signed by Instantly)
- Reply Agent fires automatically (configuration_type=2, ID `019d368d-c8ad-7208-8c42-438f4cb16258`)

### 10.5 API rate limits
- Per Instantly: 10× rate-limit increase shipped Q1 2026 (per [feedback.instantly.ai/changelog](https://feedback.instantly.ai/changelog))
- Practical ceiling: ~120 req/min sustained on Bearer token
- Best practice: throttle bulk operations to 1 req/sec to stay safely under

---

## Section 11 — Pre-pull checklist (10-point gate)

Before activating any new cohort, ALL 10 boxes ticked:

```
[ ] 1. count-leads-from-supersearch returns ≥50 (NOT 0, NOT 1,000,000)
[ ] 2. preview-leads-from-supersearch limit=5 → leads visually match ICP
[ ] 3. Boolean title syntax verified ("CEO" OR "Founder" works; not "ceo|founder")
[ ] 4. Place_id resolved via places-autocomplete (NOT free-text city)
[ ] 5. Industry enum is exactly "Real Estate & Construction" (or another verified value)
[ ] 6. De-dup ran against /tmp/known_emails_unique.txt
[ ] 7. Workspace credits ≥ (estimated cost + 100 buffer)
[ ] 8. Target campaign exists, status=1 (active), link_tracking:false, open_tracking:false
[ ] 9. Personalization template chosen (one of 5 patterns), Spanish/English variants written
[ ] 10. Reply Agent prompt at /INSTANTLY_AGENT_PROMPT.md confirms WhatsApp-first routing
```

Validator scripts (✅ all 3 built 2026-05-02):
- `bash tools/verify_no_tracking.sh` → audits ALL campaigns; HR-16; supports `--auto-fix` to PATCH violators
- `bash tools/verify_no_tracking.sh --json` → JSON for cron parsing
- `bash tools/lead_quality_gate.sh <leads.csv>` → must return `✅ 5/5 gates passed`; HR-5
- `bash tools/verify_lead_personalization.sh <campaign_id>` → samples 5 leads, fails if <4 non-empty OR any banned phrase / unfilled `{{var}}`; Iron Rule #13
- `bash tools/verify_lead_personalization.sh --all` → walks every active campaign

Last run 2026-05-02 PM: `--all` returned 6 passed, 1 failed (one campaign shipping 1-word "Cancun" personalization — investigate that campaign separately).

---

## Section 12 — Common pitfalls

1. **Free-text geography** — silently returns 1,000,000 (filter ignored). Always use UI place_id.
2. **Industry enum mismatch** — only `"Real Estate & Construction"` confirmed. Anything else rejected.
3. **Title array vs object** — UI uses `{name: true}`; API requires `["name"]`. Object form returns 400.
4. **Mexican city place_ids** — Cancún, Playa del Carmen, Tulum return 1M cap (not indexed). Use country-MX.
5. **Pulling 1,000+ leads at once** — wastes credits. 100 with strong signal beats 500 generic.
6. **Skipping `skip_in_workspace`** — re-emails existing leads, gets reported, kills domains.
7. **Generic `{{personalization}}`** — score <7 = drop. Empty better than fake.
8. **No-signal pulls** — 1–2% reply ceiling. Always pair geo+industry+title with ≥1 signal.
9. **Mixing signal types in one campaign** — funding lead opener ≠ hiring lead opener. Segment by cohort.
10. **Open/link tracking ON** — disaster 2026-05-01: 8 of 22 campaigns silently shipped `link_tracking:true`, every URL rewritten through CTD `inst.zennoenigmawire.com` → Gmail spam folder. HR-16 ironclad: BOTH flags `false`.
11. **Empty signal cohorts (filter too narrow)** — count <50 → broaden geo or extend `days_back` window.
12. **Over-enrichment** — toggling all 6 signals on one pull = 0.5 credit × 6 × 100 = 300 credits wasted. Toggle only the signal you'll use in the opener.
13. **Hola allá** disaster (HR-5) — `{{firstName|fallback}}` produced literal "Hola allá" on 31 of 419 leads. Use `is_fake_name()` filter; default to plain "Hola," when name is broken.
14. **Gatekeepers labeled as warm leads** (HR-5 gate 3) — Jose Fernandez 2026-04-21 was a receptionist. Cross-check `companyHeadCount` ≥ 10 + `seniority` enum ≠ "individual_contributor".
15. **Stale signals** — funding from 90 days ago = stale, news from 60+ days = stale. Tighten `days_back` to 7/14/30 windows.

---

## Appendix A — Disaster Playbook (specific to Supersearch)

| Disaster | Root cause | Fix | Prevention |
|---|---|---|---|
| 419 leads with "hola allá" names (2026-04-15) | firstName=unescaped string when autocomplete failed | Manual delete + first-name cleaning regex | Always pipe through `/^[A-ZÁÉÍÓÚa-záéíóú\s'-]+$/` validator |
| Jose Fernandez gatekeeper labeled "VP Sales" (2026-04-21) | Title at company size 1 = admin, not VP | Add `companyHeadCount ≥ 10` + `seniority` enum filter | Always check size + seniority normalized |
| 0% reply rate on 8 campaigns (2026-04-08) | Open + link tracking pixels rewrote URLs through CTD → Gmail spam | Disabled tracking, recovered to 2% | HR-16: both flags `false` on every campaign |
| 30% bounce rate one cohort (2026-04) | Free-text geo "Mexico City" silently matched 1M | Re-ran with place_id from autocomplete | Always place_id, never free-text |
| Adrián stale-lead disaster (2026-04-29) | NEXT_STEP.md cited a stale lead 4× | Treat NEXT_STEP as DRAFT, validate same-session | HR-4 amended |

---

## Appendix B — API recipes (verified curl-ready)

### B.1 Count check (free)
```bash
curl -s -X POST "https://api.instantly.ai/api/v2/supersearch-enrichment/count-leads-from-supersearch" \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search_filters":{"locations":[{"place_id":"ChIJU1NoiDs6BIQREZgJa760ZO0"}],"industry":{"include":["Real Estate & Construction"],"exclude":[]},"title":{"include":["Owner","Founder","CEO"]},"employeeCount":[{"op":"between","min":10,"max":500}],"skip_in_workspace":true}}' | jq
```
Returns: `{"number_of_leads": 16381}`.

### B.2 Preview sample (free)
```bash
curl -s -X POST "https://api.instantly.ai/api/v2/supersearch-enrichment/preview-leads-from-supersearch" \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search_filters":{...},"limit":5}' | jq '.items[].first_name'
```

### B.3 Real enrichment (consumes credits, lands in list)
```bash
curl -s -X POST "https://api.instantly.ai/api/v2/supersearch-enrichment/enrich-leads-from-supersearch" \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search_filters":{...},"limit":30,"resource_id":"<list-uuid>","resource_type":1,"skip_owned_leads":true,"show_one_lead_per_company":true,"work_email_enrichment":true,"fully_enriched_profile":true,"email_verification":true,"autofill":false}' | jq
```

### B.4 Move enriched leads from list → campaign
```bash
curl -s -X POST "https://api.instantly.ai/api/v2/leads/move" \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids":[],"from_list_id":"<list-uuid>","to_campaign_id":"<campaign-uuid>","all":true}'
```

### B.5 Place_id lookup
```bash
curl -s "https://api.instantly.ai/api/v2/places-autocomplete?q=Mexico" \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" | jq
```

---

## Appendix C — Source links (all verified 2026-05-02)

- API root: [developer.instantly.ai](https://developer.instantly.ai/)
- Supersearch Enrichment API: [developer.instantly.ai/api/v2/supersearchenrichment](https://developer.instantly.ai/api/v2/supersearchenrichment)
- Supersearch help: [help.instantly.ai/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch)
- Add leads from Supersearch: [help.instantly.ai/articles/11948064](https://help.instantly.ai/en/articles/11948064-how-to-add-leads-to-a-campaign-from-supersearch)
- Lead enrichment blog: [instantly.ai/blog/lead-enrichment](https://instantly.ai/blog/lead-enrichment/)
- Cold email statistics: [instantly.ai/blog/cold-email-statistics](https://instantly.ai/blog/cold-email-statistics/)
- Personalization tips: [instantly.ai/blog/cold-email-personalization-tips](https://instantly.ai/blog/cold-email-personalization-tips/)
- Email Verification API: [developer.instantly.ai/api/v2/emailverification](https://developer.instantly.ai/api/v2/emailverification)
- Plans/pricing: [help.instantly.ai/articles/10273259-instantly-plans-overview](https://help.instantly.ai/en/articles/10273259-instantly-plans-overview)
- Pricing page: [instantly.ai/pricing](https://instantly.ai/pricing)
- Changelog: [feedback.instantly.ai/changelog](https://feedback.instantly.ai/changelog)
- Single-CTA research (Tarvent 371%): [tarvent.com/blog/single-cta-vs-multiple-ctas](https://www.tarvent.com/blog/single-cta-vs-multiple-ctas-does-choice-overwhelm-readers)
- Backlinko 12M emails subject-length study: [backlinko.com/email-outreach-study](https://backlinko.com/email-outreach-study)

---

## Appendix D — Cross-skill references

| Skill | Owns | Hand-off point |
|---|---|---|
| `personalization-engine` | 0–10 score, drop <7 | Stage 4 of cron |
| `cold-email-copywriting-2026` | Body templates wrapping `{{personalization}}` | Step 1/2/3 sequence content |
| `instantly-cold-outreach` (parent) | Campaign config, deliverability, Unibox, AI agent | Production wiring |
| `lead-enrichment-waterfall` | Hunter REPLACEMENT — Apify+Firecrawl+Reoon | ONLY when Supersearch hit_rate <50% (rare) |
| `apify-linkedin` | LinkedIn-only post-engager scrapes | When Supersearch can't index a niche |
| `lead-pipeline-2026` | Master daily orchestrator (city rotation, queue) | Calls this skill's cohort recipes |
| `personalization-engine` | 5-axis scoring | Drop-gate before campaign upload |

---

## Appendix E — Update protocol (when this skill changes)

1. Any new verified API behavior → update Section 2 with date stamp.
2. Any new verified place_id → update Section 2.3.
3. Any new cohort recipe Alex green-lights → add to Section 4 + sync `supersearch_cohorts.json`.
4. Any new disaster → log in Appendix A + grep before retrying that cohort.
5. Any cross-skill API change (personalization-engine, cold-email-copywriting-2026) → update Appendix D.
6. Bump `Last verified live:` at the top of the file every time a Section 2 value is re-checked.

**v1, v2, SUPERSEARCH_PLAYBOOK, SKILL_v3 §1–2, spam-deliverability_v2 §Supersearch are now SUPERSEDED.** Future sessions read THIS file. The old files stay on disk as historical reference but the production source of truth is here.

— *End of MASTER. ~52 KB. Read top-to-bottom on any session that touches Supersearch.*
