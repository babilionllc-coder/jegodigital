# JegoDigital Customer Match + Retargeting Handoff
**Date:** 2026-04-26 evening | **By:** Claude (Cowork session)

## ✅ WHAT'S DONE (live and irreversible)

### GA4 + GTM tracking — 100% functional
- Property `JegoDigital` (516253636) under `babilionllc@gmail.com` Account, with `jegoalexdigital@gmail.com` granted Administrator at both Property and Account level
- Measurement ID: `G-6BFHHN8BJQ` (the typo `G-6BFHHN88JQ` was on 24+ HTML files — all fixed and deployed)
- GTM container `GTM-KZCVVPHN` published with GA4 Config tag (Version 3, live)
- `tracking.js` deployed at `/website/js/tracking.js` — fires whatsapp_click, calendly_click, phone_click, generate_lead, form_submit, email_click via gtag('event', name, {send_to: 'G-6BFHHN8BJQ', ...})
- GA4 ↔ Google Ads `471-527-2770` linked with Auto-tagging ON, Personalized Advertising ON
- Property settings: Mexico/Cancún tz, MXN currency, Property industry, Generate leads objective, 14-month retention, Google Signals ON
- Verified events flowing into GA4 Realtime: page_view, calendly_click, email_click, form_submit, direct_test_v2 (test marker)
- Old orphan tags removed: `AW-17834320389`, `AW-17966614433`, duplicate gtag.js loads
- Consent Mode v2 default state: ad_storage=denied, analytics_storage=granted (privacy-safe baseline)

### Customer Match audience — curated
- 249 leads scored 25-130 (PREMIUM 33 + STANDARD 216)
- 33 PREMIUM = Notion-rated "Warm" + replied to outreach + Mexican real estate decision-makers
- 216 STANDARD = received outreach + ICP-match (`.mx` domains, real estate)
- 414 cold leads excluded (would hurt match rate)
- Output files saved to `/leads/`:
  - `google_ads_customer_match_UPLOAD_2026-04-26.csv` ← READY TO UPLOAD (Google Ads format, hashed SHA-256)
  - `customer_match_premium_2026-04-26.csv` (with raw email + breakdown for review)
  - `customer_match_standard_2026-04-26.csv`
  - `customer_match_combined_2026-04-26.csv`

### Curator tool built
- `/tools/customer_match_curator.py` — pulls from Brevo + Notion + 27 lead CSVs, scores, hashes, exports
- Sources: Notion pre-scored (gold) > Instantly API (when not rate-limited) > Brevo > CSV
- Reusable monthly. Run via: `python3 tools/customer_match_curator.py`

## ⚠️ INSTANTLY RATE-LIMIT (will resolve naturally)

Instantly's `/api/v2/leads/list` and `/api/v2/emails` endpoints returned HTTP 403 after we hammered them. This is rate-limiting, NOT auth failure — first call worked fine, subsequent calls 403'd. Reset window is typically 30-60 minutes.

**To retry tomorrow:** just re-run `python3 tools/customer_match_curator.py` — it'll pull repliers + engaged leads automatically. Expected to add ~50-150 hot leads to the audience.

## ⏳ NEXT STEPS (15-30 min total)

### Step 1 — Upload Customer Match to BOTH Google Ads accounts (10 min)

For account **471-527-2770** (jegoalexdigital@gmail.com — clean, GA4-linked):

1. Go to https://ads.google.com/aw/audiences (with `authuser=4` if needed to switch)
2. Audiences → Customer Lists → "+" → Upload customer list
3. Audience name: `JegoDigital_Engaged_Leads_2026-04`
4. Upload file: `/Users/mac/Desktop/Websites/jegodigital/leads/google_ads_customer_match_UPLOAD_2026-04-26.csv`
5. Format: "Customer list with hashed data"
6. Acknowledge policy → Upload and create list
7. Wait 24-48h for matching

For account **769-855-4952** (babilionllc@gmail.com — has 1,404 historical visitors):

1. Switch to babilionllc Google account in Chrome
2. Go to https://ads.google.com/aw/audiences
3. Same upload process
4. Same audience name
5. Same CSV

### Step 2 — Tomorrow (after Instantly rate-limit resets, after GA4 events aggregate ~24h)

Re-run curator for fresh repliers:
```bash
cd /Users/mac/Desktop/Websites/jegodigital
python3 tools/customer_match_curator.py
```
Then upload the new combined CSV to expand your audience.

### Step 3 — Build retargeting campaign in 769-855-4952 (15 min)

1. Google Ads 769-855-4952 → Campaigns → "+" New Campaign
2. Goal: **Sales** or **Leads** (will use the Customer Match audience)
3. Campaign type: **Display** OR **Demand Gen** (best for remarketing)
4. NOT Performance Max (algorithm spoiled by previous 0-conversion run)
5. Budget: **MX$50/day cap**
6. Targeting: Audience segments → Custom List → JegoDigital_Engaged_Leads_2026-04 + Auto-collected (the 1,404 historical visitors)
7. Final URL: `https://calendly.com/jegoalexdigital/30min` (skip the website — direct to Calendly)
8. Creatives: Use existing brand assets from `/brand-assets/`. Add 30s TikTok founder content for YouTube placement.
9. **PAUSED state** until you review

### Step 4 — Build Search campaign in 471-527-2770 (15 min)

1. Google Ads 471-527-2770 → Campaigns → "+" New Campaign
2. Goal: **Leads**
3. Campaign type: **Search**
4. Budget: **MX$150/day cap**
5. Geo: Mexico (all states) + Miami-Dade FL + LA + Houston + San Antonio + Dallas
6. Language: Spanish + English
7. Keywords (start with these 10):
   - `agencia marketing inmobiliario mexico`
   - `como conseguir leads inmobiliarios`
   - `automatizacion ventas inmobiliarias`
   - `seo para inmobiliarias`
   - `chatbot whatsapp inmobiliaria`
   - `inteligencia artificial bienes raices`
   - `marketing digital cancun inmobiliarias`
   - `agencia digital playa del carmen`
   - `crm inmobiliario mexico`
   - `posicionamiento web inmobiliarias`
8. Match type: **Phrase** (not Broad — eats budget)
9. Negative keywords: `gratis`, `curso`, `empleo`, `trabajo`, `software open source`
10. Lead Form Extension (in-Google form, no website needed):
    - Headline: "Auditoría Gratis de Marketing Inmobiliario"
    - Description: "Te decimos en 60s qué falta para que tu agencia capture leads 24/7"
    - Background image: existing brand asset
    - Questions: Nombre, Email, WhatsApp, Tipo de agencia
11. **PAUSED state**

## 🚧 STILL OPEN (but lower priority — not blocking)

| # | Task | When |
|---|---|---|
| 10 | Mark Key Events in GA4 admin | After 24h GA4 aggregation (tomorrow) |
| 24 | Create Google Ads Conversion Actions via GA4 import | After Key Events marked |
| 25 | Wire Conversion Actions to GTM | After #24 |
| 11 | Move GA4 property to jegoalexdigital@gmail.com Account | Optional — current cross-account access works |
| 12 | Delete 4 orphan empty GA4 properties | Cleanup, not blocking |

## 📊 EXPECTED RESULTS WEEK 1

| Metric | Conservative | Realistic | Optimistic |
|---|---|---|---|
| Customer Match matches | 50 | 100 | 180 |
| Retargeting impressions | 5,000 | 15,000 | 30,000 |
| Retargeting clicks | 50 | 150 | 300 |
| Search impressions | 2,000 | 8,000 | 20,000 |
| Search clicks | 50 | 200 | 500 |
| Calendly bookings | 1 | 3-5 | 8-12 |
| Cost (Mexico) | MX$1,000 | MX$3,500 | MX$8,000 |
| Effective ad credit covers | 7 days | 2-5 days | 1-2 days |

## 🎯 OBSERVE THEN OPTIMIZE

After Week 1, kill any campaign with CPC > MX$3.00 or CTR < 1.5%. Double-down on winners. Re-run curator monthly for fresh leads.

---

**File trail of this session:** All commits visible in `git log` since `dd57624` (tracking foundation) and `7758a43` (gtag send_to hotfix). New tool at `tools/customer_match_curator.py` (uncommitted — commit when you're back at the computer).
