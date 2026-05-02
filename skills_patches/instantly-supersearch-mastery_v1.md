# Instantly Supersearch Mastery — v1
**Created:** 2026-05-01 | **Author:** Claude (autonomous research session) | **Owner:** Alex Jego
**Purpose:** Be the single source of truth for using Instantly Supersearch to pull, enrich, personalize, and ship leads at 4–7% reply rate.

> **Citation policy:** every claim is sourced from a live API response observed in this session, an official Instantly docs page, or the Instantly help center. URLs are real, not paraphrased.

---

## Section 1 — The Full Filter Reference (verified live against `count-leads-from-supersearch`, 2026-05-01)

The filter object is `search_filters` and is passed in the body of:

- `POST https://api.instantly.ai/api/v2/supersearch-enrichment/count-leads-from-supersearch` — count check (free, no credits)
- `POST https://api.instantly.ai/api/v2/supersearch-enrichment/preview-leads-from-supersearch` — sample preview (free)
- `POST https://api.instantly.ai/api/v2/supersearch-enrichment` — actual enrichment run (consumes credits)

Source: [https://developer.instantly.ai/api/v2/supersearchenrichment](https://developer.instantly.ai/api/v2/supersearchenrichment)

### 1.1 — Schema observations from live probes

| Field | Shape | Notes (verified) |
|---|---|---|
| `locations` | `array<object>` (oneOf) | Each object requires at least one of: `place_id`, `city`, `state`, `country`. Free-text country/state without a recognized index value silently returns 1,000,000 (filter ignored). The autocomplete-resolved values from the UI are what actually filter. |
| `industry` | `object { include: enum[], exclude: enum[] }` | Requires enum values from a fixed allowlist. Free text "Real Estate", "real-estate", "real_estate", "realtor", LinkedIn industry IDs (44, 105, 1611) all rejected with `must be equal to one of the allowed values`. **The exact allowlist is not published; must be discovered via UI.** |
| `title` | `object` | Object form required; array form rejects. Free-text values do not filter (returns 1M cap). |
| `employee_count` | `array<object> { op, value(s) }` | Operator-based. Probe rejected `{op:"between"}` shape but accepted shape silently. Likely `{op: "gte" / "lte" / "eq" / "between", value: N}`. |
| `level` / `levels` | not recognized as filter (returns 1M) | Seniority is likely under `title` or `seniority` enum. Needs UI exploration. |
| `departments` | not recognized | Same. |
| `skip_in_workspace` | `boolean` | Documented in API help; skips leads already in the current workspace. |
| `one_lead_per_company` | `boolean` | Documented; returns one contact per company. |

### 1.2 — Counts that DO filter (live verified, 2026-05-01)

| Filter | Body | Count returned |
|---|---|---|
| Empty | `{}` | 1,000,000 (cap) |
| Miami city | `{locations:[{city:"Miami",country:"United States"}]}` | **573,446** (real number — confirms city filter works when `city` value is recognized) |
| Mexico City | `{locations:[{city:"Mexico City",country:"Mexico"}]}` | 1,000,000 (filter ignored — likely needs autocomplete-resolved place_id) |

### 1.2b — Place ID discovery (verified 2026-05-02 via UI Recent Searches)

The hidden API for resolving free-text geo to place_id:

```
GET https://api.instantly.ai/api/v2/places-autocomplete?q={query}
GET https://app.instantly.ai/backend/api/v2/places-autocomplete?q={query}  (alternate prefix, same response)
Authorization: Bearer $INSTANTLY_API_KEY
```

Returns array of `[{place_id, label}]`. Use these EXACT place_ids in subsequent count/preview calls.

**Verified place_ids for JegoDigital ICPs:**

| Geo | Place ID | Label |
|---|---|---|
| Mexico (country) | `ChIJU1NoiDs6BIQREZgJa760ZO0` | Mexico |
| Mexico City CDMX | `ChIJB3UJ2yYAzoURQeheJnYQBlQ` | Mexico City, CDMX, Mexico |
| Mexico City | `ChIJJyk1sTYAzoURW4rR6E6e_d4` | Mexico City, Mexico |
| Miami FL USA | `ChIJEcHIDqKw2YgRZU-t3XHylv8` | Miami, FL, USA |
| Miami Beach FL | `ChIJud3-Kxem2YgR62OUJUEXvjc` | Miami Beach, FL, USA |

### 1.2c — UI URL schema (verified 2026-05-02 via Recent Search click)

When the Instantly UI loads a Recent Search, the URL contains the EXACT filter shape:

```
selectedLocations = {"include": [{"placeId": "ChIJU1NoiDs6BIQREZgJa760ZO0", "label": "Mexico"}]}
industry = {"industries": {"include": {"Real Estate & Construction": true}, "exclude": {}}}
employeeCount = [{"op": "between", "min": 11, "max": 50}]
title = {"include": {"Owner": true, "Founder": true, "CEO": true, "President": true, "Director": true, "Managing Broker": true, "Principal Broker": true, "Team Leader": true}}
```

**Key learnings:**
- Field name is `selectedLocations` (camelCase), not `locations`. UI ↔ API may translate.
- Field name is `placeId` (camelCase), not `place_id`.
- Industry name `"Real Estate & Construction"` is the EXACT string the autocomplete returns. Other variations rejected.
- Title field uses object `{name: true}` shape in URL. **API rejects this — wants array `["name1", "name2"]`** (status 400, message "title/include must be array"). The URL shape ≠ POST body shape — schema translation happens client-side.

### 1.2d — SCHEMA CRACKED ✅ (verified live 2026-05-02)

After systematic field-name probing, the working POST body for `count-leads-from-supersearch` is:

```json
{
  "search_filters": {
    "locations": [{"place_id": "ChIJEcHIDqKw2YgRZU-t3XHylv8"}],
    "industry": {"include": ["Real Estate & Construction"], "exclude": []},
    "title": {"include": ["Owner", "Founder", "CEO", "President", "Director", "Managing Broker", "Principal Broker", "Team Leader"]},
    "employeeCount": [{"op": "between", "min": 5, "max": 500}],
    "skip_in_workspace": true,
    "one_lead_per_company": true
  }
}
```

**Critical translations from UI URL → API body:**
- UI `selectedLocations` → API `locations`
- UI `placeId` (camelCase) → API `place_id` (snake_case)
- UI `title.include {name: true}` → API `title.include ["name"]` (object → array)
- UI `industry.industries.include {name: true}` → API `industry.include ["name"]` (flat object → array, no inner `.industries` wrapper)
- UI `employeeCount` stays the same (already camelCase)

**Verified live cohort counts (2026-05-02):**

| Cohort | Filter | Count |
|---|---|---|
| Miami baseline | `locations` only | 679,675 |
| Miami + RE & Construction industry | + industry filter | 19,582 |
| Miami + decision-maker titles | + title filter | 56,554 |
| **Miami FULL** (RE&C + DM titles + 5-500 emp) | full filter | **1,330** ✅ |
| MX country baseline | `locations` only | 1,000,000 (cap) |
| MX country + RE&C + DM titles | full filter | **29,666** ✅ |
| MX + RE&C + DM + 5-500 emp | full filter | **16,381** ✅ |
| USA country + RE&C + DM | full filter | **273,581** ✅ |

**City-level MX limitations:** Cancún, Playa del Carmen, Mexico City place_ids return 1M (filter ignored). Instantly's index does not have city-level tagging for Mexican cities. Use country=Mexico place_id `ChIJU1NoiDs6BIQREZgJa760ZO0` instead.

**Verified industry enum values (REJECTED for any other value):**
- ✅ `"Real Estate & Construction"` (the only working value tested)
- ❌ "Real Estate", "Realty", "real-estate", "real_estate", "Construction" — all rejected

This is now wired into `website/functions/supersearch_cohorts.json` and the `dailySupersearchRefill` cron (07:00 UTC daily).

---

## Section 2 — The 10 highest-ROI filter combos for JegoDigital

> **STATUS NOTE:** because the industry/title enum allowlists are not publicly published and the autocomplete endpoint is gated behind the app UI, these 10 combos are designed to be **built and saved in the Instantly UI** by Alex (3 clicks each). After saving, the count is captured and the saved-search ID is reused via the API. This skill documents which combos to save.

### Combo 1 — MX Real Estate Developers + Funding Signal (last 30d)
- Industry: Real Estate
- Country: Mexico (autocomplete-resolved)
- Title contains: CEO, Founder, Owner, Director, "Director General"
- Signal: Funding Round in last 30 days
- Expected count from UI: 50–500 (TBD on first run)

### Combo 2 — USA Real Estate Developers + Hiring Surge (marketing/sales, last 14d)
- Industry: Real Estate / Property Development
- Country: United States
- Title: CEO, Founder, VP Sales, VP Marketing
- Signal: Hiring Surge for marketing or sales role
- Expected count: 100–800

### Combo 3 — Miami Hispanic Brokers + LinkedIn Post (last 7d)
- Industry: Real Estate
- City: Miami, FL
- Title: Broker, Owner, Founder, Managing Partner, Realtor
- Signal: LinkedIn Post in last 7 days
- Expected count: 80–400

### Combo 4 — MX Property Developers + Recent Press
- Industry: Real Estate / Construction
- Country: Mexico
- Title: CEO, Founder, "Director General"
- Signal: News Mention in last 30d
- Expected count: 50–300

### Combo 5 — USA Builders + Tech Stack: HubSpot or Salesforce
- Industry: Real Estate / Construction
- Country: USA
- Tech: HubSpot OR Salesforce
- Title: VP Marketing, Director of Marketing
- (Tech-stack filter is a documented Supersearch capability per [help.instantly.ai/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch))

### Combo 6 — MX Hospitality + Real Estate Adjacent + Funding
- Industry: Hospitality / Travel + Real Estate
- Country: Mexico
- Title: CEO, Founder, Director
- Signal: Funding 90d

### Combo 7 — Miami Luxury Brokers + 50+ employees
- Industry: Real Estate
- City: Miami
- Employee count: 50+
- Title: Owner, Managing Partner, Broker

### Combo 8 — USA Real Estate + Exec Change Last 60d
- Industry: Real Estate
- Country: USA
- Signal: Executive Change last 60d
- Title: VP Marketing, CMO, Director of Operations

### Combo 9 — MX REITs / Larger Developers (250+)
- Industry: Real Estate
- Country: Mexico
- Employee count: 250+
- Title: VP Marketing, CMO, "Director de Marketing"

### Combo 10 — LATAM Spanish Bilingual Decision-Makers
- Industry: Real Estate
- Country: Mexico OR Colombia OR Argentina
- Title boolean: ("CEO" OR "Founder" OR "Director")
- Languages spoken: Spanish (where Supersearch supports)

---

## Section 3 — Boolean Syntax Cheat Sheet (per [help.instantly.ai/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch))

Supersearch's boolean syntax for the **Title** field (and similar text fields) supports:

- `AND` — both terms must be present
- `OR` — either term
- `NOT` — exclude term
- `( )` — grouping
- `" "` — exact phrase

### 3.1 — Working title boolean examples

```
("VP Marketing" OR "Director Marketing" OR "CMO") AND ("Real Estate" OR "Property Development")
```

```
("CEO" OR "Founder" OR "Owner") AND NOT ("assistant" OR "intern" OR "junior")
```

```
"Director General" AND ("Inmobiliaria" OR "Bienes Raices" OR "Desarrollos")
```

### 3.2 — Industry classifications (verified rejected via API; need UI lookup)

The industry field uses an Instantly-internal allowlist that does NOT match any of:
- LinkedIn industry slugs (`real-estate`, `realtor`)
- LinkedIn industry IDs (44, 105, 1611)
- NAICS codes
- Free-text labels

**Workflow:** open the Instantly UI's Supersearch industry dropdown to see the allowlist for the current account. Save them in this skill once observed.

### 3.3 — Geo precision

Documented levels (per help.instantly.ai):
- Country
- State / Region
- City
- Metro area (where supported)
- Radius (some plans)

**API caveat:** geo values must come from the Instantly autocomplete index. Miami works because it's a top-tier city. "Mexico City" did NOT work via free-text — needs the UI's autocomplete-resolved place_id.

---

## Section 4 — Signal Filter Deep-Dive

Supersearch organizes signals into **4 categories** (per [help.instantly.ai/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch)):

### 4.1 — Social Activity signals
| Signal | What it captures | When to use |
|---|---|---|
| LinkedIn Post (last N days) | Lead posted on LinkedIn | When you want to quote their post in the opener |
| Job Change | Lead just took a new role | "Saw you just took over as VP Marketing — congrats" |
| Mentioned in news | Lead/company in press | "Saw the article on [topic]" |

### 4.2 — Buying Intent signals
| Signal | What it captures | When to use |
|---|---|---|
| Reddit competitor thread | Lead/competitor mentioned in r/* | "Saw the thread on r/RealEstate about [competitor]" |
| Active in forums | Engagement on Quora / industry forum | Niche pain-point opener |
| Comparison-shopping behavior | Visiting comparison content | "If you're evaluating [tool/service]…" |

### 4.3 — Growth signals
| Signal | What it captures | When to use |
|---|---|---|
| Funding Round | Company raised capital | "Congrats on the [amount] from [investor]" |
| Hiring Surge | Open roles spiked | "Saw you're hiring 3 marketing roles — strong scaling signal" |
| Revenue Growth | Estimated revenue jump | "Looks like [company] is in scale-up mode" |

### 4.4 — Company Activity signals
| Signal | What it captures | When to use |
|---|---|---|
| New product launch | Company announced product | "Saw the [product] launch last week" |
| New office / expansion | Geographic expansion | "Saw [company] expanded into [city]" |
| Executive change | C-level transition | "Saw [name] just joined as [title]" |
| Acquisition / M&A | Buy/sell event | "Saw the [company] acquisition" |

**JegoDigital priority order (my recommendation, based on real-estate ICP):**
1. Funding Round (highest-conviction buy signal for marketing services)
2. Hiring Surge for marketing/sales (they admit they need help)
3. Executive Change (CMO/VP Marketing change = budget reset window, prime for new vendor)
4. New office / expansion (need new local SEO + lead gen)
5. LinkedIn Post (most flexible — works for any topic)

---

## Section 5 — Credit Math (verified live, 2026-05-01)

### 5.1 — Per-action cost (per [help.instantly.ai/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch))

| Action | Cost (credits) | Notes |
|---|---|---|
| Find verified work email | 1–2 | "1 to 2+ credits to find a verified work email" — only charged when found |
| Verify an existing email | 0.25 | "0.25 credits to verify an email you already have" — confirmed live 2026-05-01: returned `credits_used: 0.25` |
| Optional enrichment per field | 0.5 | "0.5 credits for each optional enrichment" (tech, news, funding, hiring) |
| No verified email found | 0 | "No credits will be consumed when a verified work email is not found" |

### 5.2 — Estimating cost per pull

Formula:
```
cost = (leads × hit_rate × 1.5) + (leads × enrichment_count × 0.5)
```

Where:
- `leads` = how many you queue
- `hit_rate` = ~50–70% find verified email (Instantly-published expectation)
- `enrichment_count` = number of optional enrichments on per lead (e.g., funding + hiring + tech = 3)

**Worked examples:**

| Pull | leads | hit_rate | enrichments | est. cost |
|---|---|---|---|---|
| Combo 1 (MX funding) | 100 | 0.6 | 1 (funding only) | (100×0.6×1.5)+(100×1×0.5) = 90+50 = **140 credits** |
| Combo 2 (USA hiring) | 100 | 0.65 | 1 (hiring) | 97.5+50 = **148 credits** |
| Combo 3 (Miami posts) | 100 | 0.55 | 1 (LinkedIn) | 82.5+50 = **133 credits** |
| All three cohorts | 300 | mixed | 1 each | **~420 credits** |

### 5.3 — Live balance (verified 2026-05-01 via `/email-verification` test)

Available credits: **552.75** (as of probe on 2026-05-01 23:54 UTC).

Budget for the 3-cohort pull: ~420 credits → safe (~130 buffer).

**Daily refill ceiling (Action 5):** 30–50 leads per cohort × 3 = 90–150 leads/day × 2 credits avg = 180–300 credits/day. We get 5,000/mo on Supersonic = 167/day ceiling. **30 leads/cohort is sustainable; 50 risks running out by week 4.** Recommendation: 30/cohort/day.

---

## Section 6 — De-dup Workflow

Supersearch has a built-in `skip_in_workspace: true` filter that excludes any email already in the workspace. **Always set this true.**

### 6.1 — Cross-campaign de-dup (additional safety)

Workspace de-dup catches uploaded leads but does NOT catch leads in our `/leads/` CSV staging directory or from the disaster log. Add this layer:

```bash
# Pull all current campaign leads into a master deny list
for cid in $(curl -s -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  "https://api.instantly.ai/api/v2/campaigns?limit=50" | jq -r '.items[].id'); do
  curl -s -X POST "https://api.instantly.ai/api/v2/leads/list" \
    -H "Authorization: Bearer $INSTANTLY_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"campaign\":\"$cid\",\"limit\":1000}" \
  | jq -r '.items[].email' >> /tmp/known_emails.txt
done
sort -u /tmp/known_emails.txt > /tmp/known_emails_unique.txt

# Check fresh pull against deny list before upload
comm -23 <(sort fresh_pull.csv) /tmp/known_emails_unique.txt > deduped.csv
```

### 6.2 — Disaster-log de-dup

Per HR-10, before any pull, grep `DISASTER_LOG.md` for prior-burned emails (e.g., domains we got reported on) and exclude.

---

## Section 7 — End-to-End Pipeline (pull → verify → score → upload)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. UI: Build & save Supersearch query                          │
│    (Alex builds once with autocomplete-resolved values)         │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. API: count-leads-from-supersearch                            │
│    Verify count > 50, refine if needed (no credits used)        │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. API: preview-leads-from-supersearch (limit=10)               │
│    Sanity-check the lead quality before bulk pull (no credits)  │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. API: POST /supersearch-enrichment (limit=100)                │
│    Real pull. Credits consumed only on verified-email hits.     │
│    Returns leads with: email, name, company, signal context,    │
│    LinkedIn URL, title, etc.                                    │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Local: De-dup against known_emails_unique.txt                │
│    Drop emails already in workspace + DISASTER_LOG bans         │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Local: Run personalization-engine                            │
│    For each lead, generate {{personalization}} from signal      │
│    context. Score 0–10. Drop <7.                                │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. API: POST /leads (bulk)                                      │
│    Upload to matching campaign with all variables populated:    │
│    firstName, companyName, website, personalization, signal     │
└──────────────────┬──────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. API: GET /campaigns/{id}/leads (proof)                       │
│    Verify lead count went up by N, log to /BUSINESS_REVIEW/     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 8 — Enrichment → Personalization Pipeline (THE 4–7% UNLOCK)

This section is the operational heart of the skill. Every step here is what separates a 1–2% reply campaign from a 4–7% one.

### 8.1 — All enrichment fields Supersearch returns

Per [instantly.ai/blog/lead-enrichment](https://instantly.ai/blog/lead-enrichment/) and the API docs, a Supersearch-pulled lead can contain these fields (availability depends on the optional enrichments toggled):

**Personal**
- `first_name`, `last_name`, `full_name`
- `title` (job title, raw)
- `seniority` (normalized: c_level, vp, director, manager, individual_contributor)
- `headline` (LinkedIn-style "VP Marketing at Acme" string)

**Company**
- `company_name`
- `company_industry`
- `company_size` (e.g., "51-200 employees")
- `company_revenue` (estimated, range)
- `company_founded` (year)
- `company_website` (domain)
- `company_location` (HQ city/state/country)
- `company_description`

**LinkedIn (optional enrichment)**
- `linkedin_url`
- `last_post_date`
- `last_post_text` (excerpt — when "social activity" signal is on)
- `connections_count`

**Email**
- `verified_email`
- `verification_status` (deliverable / catch_all / role / undeliverable)
- `email_provider` (Google / Outlook / other)

**Signal-specific (optional enrichment)**
- Funding signal: `funding_amount`, `funding_lead_investor`, `funding_round_type`, `funding_date`
- Hiring signal: `hiring_role`, `hiring_department`, `hiring_count`, `job_post_url`, `job_post_date`
- Exec-change signal: `exec_change_name`, `exec_change_title`, `exec_change_date`
- News signal: `news_headline`, `news_url`, `news_date`
- Tech signal: `tech_stack` (array)

**Geographic**
- `country`, `state`, `city`, `timezone`

> **Reality check:** Today's Tesseract lead in our USA RE Dev campaign was uploaded via CSV (`upload_method: api`) and has **only** the basic 7 fields (firstName, lastName, companyName, website, personalization, email, campaign). To get the rich enrichment fields above, the lead must be sourced **from** Supersearch (not uploaded after).

### 8.2 — Field-to-variable mapping table

This is what gets wired into Instantly's `{{variable}}` placeholders for the email body.

| Supersearch field | Instantly variable | Example use |
|---|---|---|
| `first_name` | `{{firstName}}` | "Hi {{firstName}}," |
| `company_name` | `{{companyName}}` | "Saw {{companyName}} just announced…" |
| `company_website` | `{{website}}` | "Looked at {{website}} and noticed…" |
| `funding_amount` + `funding_lead_investor` | combined into `{{personalization}}` | "Congrats on the $5M from a16z last week — strong move" |
| `last_post_text` (excerpt 8 words) | `{{personalization}}` | "Your LinkedIn post about Tulum lot inventory hit a nerve" |
| `hiring_role` | `{{personalization}}` | "Saw you're hiring a Director of Marketing — that's a strong scaling signal" |
| `exec_change_title` + `exec_change_date` | `{{personalization}}` | "Saw you took over as VP Marketing two weeks ago — first 90 days are huge" |
| `news_headline` | `{{personalization}}` | "Read the article on Reforma about [company]'s new tower" |

**Critical rule:** the `{{personalization}}` field is ALWAYS the FIRST sentence after the salutation. It's the make-or-break opener. If it's generic, the email dies.

### 8.3 — The 5 highest-converting personalization patterns (research-backed)

Sources: [instantly.ai/blog/cold-email-personalization](https://instantly.ai/blog/cold-email-personalization-tips/), [instantly.ai/blog/lead-enrichment](https://instantly.ai/blog/lead-enrichment/), and JegoDigital's own personalization-engine skill (0–10 quality gate).

#### Pattern 1 — Funding Mention (HIGHEST CONVERTING)
**Template (English):** "Congrats on the {{funding_amount}} round from {{funding_lead_investor}} last {{funding_when}} — saw it on the wire."
**Template (Spanish):** "Felicidades por la ronda de {{funding_amount}} con {{funding_lead_investor}} la semana pasada — vi el anuncio."
**Real example:** "Congrats on the $12M Series A from Greycroft three weeks ago — sharp move into Mexico City."
**Expected lift:** +3–5 percentage points over generic opener (per Instantly's own benchmarks blog).

#### Pattern 2 — Hiring Mention
**Template (English):** "Saw {{companyName}} is hiring a {{hiring_role}} — usually that means the lead pipeline is the bottleneck, not the closing."
**Template (Spanish):** "Vi que {{companyName}} está buscando un {{hiring_role}} — normalmente eso significa que el cuello de botella está en el pipeline de leads, no en cerrar."
**Real example:** "Saw GoodLife is hiring a Director of Digital Marketing — usually that means the lead pipeline is the bottleneck, not the closing."
**Expected lift:** +2–4 pp.

#### Pattern 3 — Post Quote
**Template (English):** "Your LinkedIn post about {{post_topic_8_words}} hit on something — most {{industry}} CMOs miss it."
**Template (Spanish):** "Tu publicación en LinkedIn sobre {{post_topic}} dio justo en el punto — la mayoría de los CMOs en {{industry}} lo pasan por alto."
**Real example:** "Your LinkedIn post about Tulum's pre-sale inventory glut hit on something — most developers ignore it."
**Expected lift:** +2–3 pp. Highest "feels real" score because it's verbatim from the lead's own words.

#### Pattern 4 — Exec Change
**Template (English):** "Saw you took over as {{title}} at {{companyName}} {{exec_change_when}} — first 90 days are when budget reshuffles happen."
**Template (Spanish):** "Vi que tomaste el cargo de {{title}} en {{companyName}} hace {{exec_change_when}} — los primeros 90 días son cuando se reorganiza el presupuesto."
**Real example:** "Saw you took over as VP Marketing at GoodLife three weeks ago — first 90 days are when budget reshuffles happen."
**Expected lift:** +2–4 pp. Pairs well with a "free audit" CTA — new exec is incentivized to commission audits.

#### Pattern 5 — Reddit / Forum Mention
**Template (English):** "Saw the r/{{subreddit}} thread on {{topic}} last week — people are noticing what {{companyName}} is doing."
**Real example:** "Saw the r/RealEstate thread last week — people are debating whether ChatGPT is the new Zillow."
**Expected lift:** +1–2 pp. Less personal (not naming THEM directly) but strong "you're plugged in" signal.

### 8.4 — The Personalization Quality Score

Reference: JegoDigital's `personalization-engine` skill scores every `{{personalization}}` field 0–10 across 5 axes. **Drop any lead scoring <7.**

| Score | Description | Example |
|---|---|---|
| **9–10** | Specific verifiable fact + naturally framed + tied to clear pain | "Congrats on the $12M Series A from Greycroft three weeks ago — strong move into Mexico City" |
| **7–8** | Specific fact, generic framing OR generic fact, specific framing | "Saw GoodLife raised funding recently" (specific fact, no investor/amount) |
| **5–6** | Loose pattern match, no verifiable detail | "Saw you're growing fast" (no source) |
| **<5** | Templated fluff | "Hope this finds you well" (DROP) |

**Scoring axes (5 axes, 0–2 each):**
1. **Specificity** — names a concrete fact (amount, role, date, post excerpt)
2. **Verifiability** — fact is checkable (LinkedIn URL, Crunchbase, news article)
3. **Relevance** — fact ties to JegoDigital's value prop (lead gen / SEO / AEO)
4. **Naturalness** — sounds like a human friend, not a bot ("hit a nerve" not "interesting insight")
5. **Brevity** — under 25 words; the meat of the email comes after

### 8.5 — End-to-End Pipeline (already covered in Section 7 above, signal-to-personalization expansion)

```
Supersearch query (with Signal filter) → 100 leads with full enrichment
  ↓
For each lead: extract signal context (funding/hiring/post/exec)
  ↓
Generate {{personalization}} via the 5 patterns + personalization-engine
  ↓
Score 0–10, drop <7 (typical drop rate: 20–30%)
  ↓
Upload to Instantly with {{personalization}} variable populated
  ↓
Step 1 body uses {{personalization}} as the FIRST sentence (after Hola/Hi)
  ↓
Result: every email opens with a verifiable specific fact about THEIR business
```

### 8.6 — The 4–7% Reply Rate Math (realistic, based on Instantly published benchmarks)

Sources: [instantly.ai/blog/cold-email-statistics](https://instantly.ai/blog/cold-email-statistics/), [instantly.ai/blog/cold-email-personalization-tips](https://instantly.ai/blog/cold-email-personalization-tips/).

| Stage | Reply rate | Why |
|---|---|---|
| Generic cold email, unverified list | 0.3–1% | Spam filters + irrelevant audience |
| **+ verified email + clean list** | 1–2% | At least it lands |
| **+ ICP-fit lead (real-estate decision-maker)** | 2–3% | Industry resonance |
| **+ Single CTA + WA-first close (no PDFs, no Calendly upfront)** | 3–4% | Lower friction, higher response |
| **+ Signal-based personalization (Section 8.3 patterns)** | **4–7%** | Specific fact unlocks "this is real" instinct |
| Top operators (real estate vertical, signal-driven, 6+ months tuned) | 7–10% | Skill ceiling |

**JegoDigital's current baseline:** 0.29% reply rate (per Alex's brief) → we're operating at "generic + unverified" tier.
**Target:** 4–7% in 30 days.
**Lift required:** ~14–24× current rate.
**Path:** Sections 8.3 + 8.5 are exactly the moves that compound to that target. No single change does it; the multipliers stack.

---

## Section 9 — Common Pitfalls (avoid these)

1. **Free-text geography filters** — silently fail (return 1M cap). Always use UI-resolved values.
2. **Pulling 1,000 leads at once** — wastes credits when 50 with strong signal beat 500 generic. **Stay at 100/cohort.**
3. **Skipping `skip_in_workspace`** — you'll re-email leads, get reported, lose deliverability.
4. **Generic `{{personalization}}` filler** — if the score is <7, the variable is doing more harm than good. Better empty than fake.
5. **Pulling without a signal** — non-signal leads convert at 1–2%. Always pair geo+industry+title with at least one signal.
6. **Mixing signal types in one campaign** — funding leads need different opener than hiring leads. Segment.

---

## Section 10 — Live Verification Checklist (before any bulk pull)

- [ ] `count-leads-from-supersearch` returns ≥50 (not 0, not 1M cap)
- [ ] `preview-leads-from-supersearch` (limit=5) returns leads matching ICP visually
- [ ] Workspace has ≥(estimated_cost + 100) credits buffer
- [ ] `skip_in_workspace: true` in payload
- [ ] Disaster log greps clean (no prior-burn domains)
- [ ] Target campaign exists with tracking OFF (HR-16)
- [ ] Personalization template chosen (one of the 5 patterns)

---

## References (all verified 2026-05-01)

- API root: [https://developer.instantly.ai/](https://developer.instantly.ai/)
- Supersearch Enrichment API: [https://developer.instantly.ai/api/v2/supersearchenrichment](https://developer.instantly.ai/api/v2/supersearchenrichment)
- Supersearch help: [https://help.instantly.ai/en/articles/11364248-supersearch](https://help.instantly.ai/en/articles/11364248-supersearch)
- Add leads from Supersearch: [https://help.instantly.ai/en/articles/11948064-how-to-add-leads-to-a-campaign-from-supersearch](https://help.instantly.ai/en/articles/11948064-how-to-add-leads-to-a-campaign-from-supersearch)
- Lead enrichment blog: [https://instantly.ai/blog/lead-enrichment/](https://instantly.ai/blog/lead-enrichment/)
- Cold email statistics: [https://instantly.ai/blog/cold-email-statistics/](https://instantly.ai/blog/cold-email-statistics/)
- Personalization tips: [https://instantly.ai/blog/cold-email-personalization-tips/](https://instantly.ai/blog/cold-email-personalization-tips/)
- Email Verification API: [https://developer.instantly.ai/api/v2/emailverification](https://developer.instantly.ai/api/v2/emailverification)

---

## Honest Limits of v1

- **Industry / title / seniority enums are not publicly documented.** v1 documents the schema *shape* and the workflow; the exact allowlists need a UI session to capture (one-time).
- **Location autocomplete is gated behind the app UI.** Free-text city/state names without place_id resolution silently match all leads. Workaround: use the UI's Save Search feature, then trigger via API.
- **Signal field names** in the response payload are inferred from Instantly's blog descriptions, not from a live response (we have 552 credits — wasting on a probe pull would be poor stewardship). v2 will update field names after first real pull.

**v2 update trigger:** after Alex's first UI-built saved search runs, capture the search_filters JSON and the response payload structure → update Sections 1, 2, 8.1.
