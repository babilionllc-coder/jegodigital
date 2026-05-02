# Supersearch + Signals Playbook — JegoDigital cold-email skill patch

**Apply to:** `instantly-cold-outreach` SKILL.md (paste under §Lead Sources)
**Source of truth (deeper):** [`skills_patches/instantly-supersearch-mastery_v1.md`](./instantly-supersearch-mastery_v1.md)
**Goal:** 4–7% reply rate (vs current 0.29% baseline) — the single largest reply-rate lever JegoDigital has access to.
**Last updated:** 2026-05-02

---

## When to invoke Supersearch (mandatory triggers)

Use Supersearch as the FIRST lead source whenever any of the following is true. Bypass Apify, lead-finder, and Hunter for these — Supersearch is faster, cheaper ($0.01–$0.02/lead vs $0.15), and ships pre-enriched + pre-verified.

- Need to fill a USA RE Developer / Miami / Hispanic / MX RE campaign with high-intent leads
- Want hiring/funding/exec-change/post intent signals (Apify Jobs is slower + needs Hunter)
- Daily refresh ≤30 leads/cohort (Supersonic plan ceiling: ~167/day across all cohorts)
- Workspace credits ≥150 (current live: **552.75** — verified 2026-05-01)

Stay on Apify only when: closed-network LinkedIn-only research, post-engager scrape, or geo Supersearch can't resolve (e.g. specific Mexican city not in their place_id index).

## The 5 highest-leverage combos for JegoDigital (build + save in UI once)

Each combo = `Industry + Geo + Title + Signal` saved in Instantly Supersearch UI. After save, trigger via `POST /api/v2/supersearch-enrichment` with the saved filters. Always set `skip_in_workspace: true`.

| # | Cohort | Filter Stack | Personalization Pattern | Why it's high-leverage |
|:-:|---|---|---|---|
| **1** | 🇲🇽 MX RE Developer + Funding | Industry=Real Estate · Country=MX · Title=("CEO" OR "Founder" OR "Director General") · Signal=Funding 30d | Pattern 1 — Funding Mention | Funding = budget reset = open to vendors. Highest converting opener (+3–5 pp) |
| **2** | 🇺🇸 USA RE Developer + Hiring Surge | Industry=Real Estate · Country=US · Title=(VP Marketing OR Director Marketing OR Founder) · Signal=Hiring Surge marketing/sales 14d | Pattern 2 — Hiring Mention | Hiring marketing = lead pipeline broken = our exact pitch. +2–4 pp |
| **3** | 🌴 Miami Hispanic Brokers + LinkedIn Post | Industry=Real Estate · City=Miami · Title=(Broker OR Owner OR Realtor) · Signal=LinkedIn Post 7d | Pattern 3 — Post Quote | Verbatim quote = highest "feels real" score. +2–3 pp |
| **4** | 🇲🇽 MX RE + Exec Change | Industry=Real Estate · Country=MX · Title=(VP Marketing OR CMO) · Signal=Exec Change 60d | Pattern 4 — Exec Change | New exec = 90-day budget shuffle. Pairs with "free audit" CTA. +2–4 pp |
| **5** | 🇺🇸 USA RE + Tech Stack (HubSpot/Salesforce) | Industry=Real Estate · Country=US · Tech=HubSpot OR Salesforce · Title=Director of Marketing+ | Pattern 1 or 3 (post if active) | Tech-sophisticated buyer = appreciates AI angle. Higher AOV |

**Operational rule:** ONE cohort per campaign — never mix funding leads with hiring leads in one campaign (different openers, different pain, dilutes). Spin a new campaign per cohort.

## How Supersearch + Signals work TOGETHER (the workflow)

```
Signals = WHO is showing buying intent right now (timing layer)
Supersearch = HOW to find them filtered by ICP (precision layer)
Together = right person + right moment + right opener
```

**End-to-end flow (from `instantly-supersearch-mastery_v1.md` §7):**

1. **UI:** Build cohort filter once, save in Supersearch UI (autocomplete-resolves industry + city + signal)
2. **API:** `count-leads-from-supersearch` (free) — verify ≥50 leads, refine if not
3. **API:** `preview-leads-from-supersearch` limit=10 (free) — sanity-check ICP
4. **API:** `POST /supersearch-enrichment` limit=100 — pull with `skip_in_workspace:true` + signal enrichment toggled (consumes ~140 credits/100 leads)
5. **Local:** Cross-dedup against `/tmp/known_emails_unique.txt` + grep `DISASTER_LOG.md`
6. **Local:** Run `personalization-engine` skill — generate `{{personalization}}` from signal context using one of the 5 patterns. **Drop any lead scoring <7.** Typical drop rate: 20–30%
7. **API:** Bulk upload to matching campaign (HR-16 verified: tracking OFF)
8. **API:** `GET /campaigns/{id}/leads` to confirm count delta. Log to `/BUSINESS_REVIEW/`

## The 4–7% reply rate stack (cumulative — each layer compounds)

| Layer | Reply rate | What it adds |
|---|:--:|---|
| Generic + unverified list | 0.3–1% | (current JegoDigital baseline = 0.29%) |
| + verified email + clean list | 1–2% | Supersearch ships verified emails |
| + ICP-fit decision-maker | 2–3% | Tight title + industry filter |
| + WhatsApp-first CTA, no PDF, no Calendly upfront | 3–4% | (already implemented in Step 1 templates) |
| **+ Signal-based personalization (5 patterns above)** | **4–7%** | THE unlock — specific fact = "this is real" instinct |

## Hard rules (always)

- ✅ `skip_in_workspace: true` (every pull, no exceptions)
- ✅ `link_tracking: false` AND `open_tracking: false` on destination campaign (HR-16)
- ✅ Max 30 leads/cohort/day (5K credit ceiling = 167/day budget across 5 cohorts)
- ✅ Personalization-engine score ≥7 to ship
- ✅ Pre-pull: `bash tools/verify_no_tracking.sh` returns 0 violators
- ❌ Never pull without a signal (kills the whole strategy — generic = 1–2%)
- ❌ Never mix signal types in one campaign (different openers = different campaigns)
- ❌ Never use free-text geo filters (silently match all 1M leads — credits wasted)

## Live verification checklist (paste this into every Supersearch session)

```
[ ] count-leads-from-supersearch ≥50 (not 0, not 1M cap)
[ ] preview-leads limit=5 → leads visually match ICP
[ ] Workspace credits > (est_cost + 100 buffer)
[ ] skip_in_workspace: true in payload
[ ] DISASTER_LOG.md greps clean for cohort
[ ] Destination campaign tracking OFF (HR-16)
[ ] Personalization pattern chosen (1 of 5)
[ ] One cohort per campaign (no mixing)
```

## Skill cross-references

- `personalization-engine` — generates + scores `{{personalization}}` (0–10, drop <7)
- `cold-email-copywriting-2026` — body templates that wrap `{{personalization}}` in 50–80 word emails
- `lead-enrichment-waterfall` — ONLY when Supersearch hit_rate <50% on email verification (rare)
- `apify-linkedin` — ONLY for post-engager scrapes Supersearch can't do natively
- `instantly-spam-deliverability_v2.md` — sender warmup + bounce protection (paired infra)

## v2 update trigger

After first real Supersearch pull lands in production, capture the response payload structure (signal field names) and update §8.1 of `instantly-supersearch-mastery_v1.md` with verbatim field names. Mark this file v2.
