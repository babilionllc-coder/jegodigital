---
name: meta-ads-jegodigital
description: Validated Meta/Facebook Ads playbook for JegoDigital (B2B Mexican real estate + Miami Hispanic luxury). Use EVERY TIME for Meta Ads — build, audit, optimize, scale, pause, troubleshoot Lead Form ads, retargeting, Custom Audiences, Lookalikes, Conversion API (CAPI), creative strategy, ad-set structure, budget allocation. Triggers on Meta Ads, Facebook Ads, Lead Form, Instant Form, Custom Audience, Lookalike, Advantage+, CAPI, Conversion API, retargeting, Pixel, FB Pixel, ad creative, carousel, UGC, jegodigital meta, ad account 968739288838315, page 766570479879044, FB campaign 120241114978100662. Every claim cited to a 2026 research dossier or Meta documentation.
---

# Meta Ads — JegoDigital Skill

> **Authoritative source-of-truth** for everything Meta/Facebook Ads at JegoDigital.
> Built on 4 research dossiers (Meta Ads 2026 best practices, CAPI 2026 setup, Advantage+ targeting 2026, Creative trends 2026) + post-mortem of the 2026-04-27 launch session.
> Every dollar of FB ad spend goes through this playbook.

---

## §1. Account state (verified live 2026-04-27/28)

**The fixed facts. Always check live before changing anything — but these are the IDs.**

| Asset | ID | Notes |
|---|---|---|
| Ad Account | `act_968739288838315` | USD currency, status=ACTIVE, business `jegodigital` (1837835950184415) |
| Business Manager | `1837835950184415` | "jegodigital" |
| Page | `766570479879044` | "JegoDigital", Marketing Agency |
| Pixel | `2356041791557638` | Installed on jegodigital.com — CAPI NOT yet wired |
| App | `1158470596156733` | "Jegodigital new" — needed for OAuth re-auth |
| Lead Form | `942858358503290` | Auditoría JegoDigital — Inmobiliarias 2026-04 |
| Brevo list | `41` | "FB Lead Form — Hiring Intent 2026-04" |
| Webhook | `https://us-central1-jegodigital-e02fb.cloudfunctions.net/metaLeadFormWebhook` | Verify token: `jegodigital_meta_lead_verify_2026_x9k` |

**Tokens** (all stored as GitHub Secrets, never expire):
- `FB_USER_TOKEN` — 53 scopes incl `pages_manage_ads`, `ads_management`, `business_management`, `leads_retrieval`
- `FB_PAGE_ACCESS_TOKEN` — never-expiring page token
- `FB_APP_SECRET` — `266b0bf0bd2a7ca23ac59998d1c8c3d7` — for token re-issuance

**To re-issue a token if anything breaks** (script `tools/fb_ads/reissue_token.py`):
```python
# Exchange any short-lived USER token for permanent:
GET /v21.0/oauth/access_token?
  grant_type=fb_exchange_token
  &client_id={FB_APP_ID}
  &client_secret={FB_APP_SECRET}
  &fb_exchange_token={short_lived_user_token}
# → 60-day USER token
# Then GET /pageId?fields=access_token using that → never-expiring PAGE token
```

---

## §2. The 5 hard rules (broken any one = burn money)

**HR-FB-1 — Creative is 80% of performance, targeting is 20%.**
Per Meta 2026 docs: with Advantage+ doing audience work automatically, creative quality determines who converts. Stop optimizing audience, start shipping 4-8 fresh creative variants per week.

**HR-FB-2 — CAPI before scale.** Never increase a Lead Form ad-set budget above $5/day until Conversion API is wired feeding back Calendly bookings. Meta optimizes for "form fill" by default. Without CAPI = optimizes for browsers. With CAPI = optimizes for buyers. 15-30% lower CPL with higher win rates per Meta data.

**HR-FB-3 — Speed-to-lead under 5 min, or you lose them.** Industry data: leads contacted >30 min after submit are 21× less likely to convert. Webhook MUST fire welcome email within 30 sec. Audit's 45-min delivery is FINE only if a fast welcome bridges the gap.

**HR-FB-4 — 3-5 form fields max. Anything more = collapse.** Per Meta best practices: 2-4 fields beyond name+email is the sweet spot. ONE qualification question. NEVER 5+ custom fields. The current `942858358503290` form has 5 questions = at upper limit, watch fill rate.

**HR-FB-5 — Never quote price in any ad copy.** Same as HR-0 elsewhere. Pricing only on live Calendly call.

---

## §3. Campaign architecture (the "siege" structure)

JegoDigital's Meta strategy is **multi-channel siege on the same 1,000-3,000 leads** who are already getting cold-emailed (Instantly) and cold-called (ElevenLabs Sofia). Meta is the third leg — paid impressions reinforce the cold outreach so the brand becomes inescapable in 14-30 days.

### The campaign tree (always 1 campaign, 3-4 ad sets)

```
📦 Campaign (Lead Form objective)
├── AS-1  Custom Match — cold-warm prospects who never engaged
├── AS-2  Pixel — site visitors who didn't convert (warm)
├── AS-3  Form Openers — opened form but abandoned (hot)  ← MISSING in current
└── AS-4  Lookalike 1% — Meta's expansion lever         ← BUILD AT 50+ CONVERSIONS
```

**Budget allocation (small budget, < MX$3K/mo):**
- 50% to AS-1 (Custom Match) — biggest pool, slowest learn
- 30% to AS-2 (Pixel warm) — fastest CPL signal
- 20% to AS-3 (Form Openers) — when audience reaches 100+
- 0% to AS-4 (Lookalike) — DO NOT BUILD until 50+ conversions in CAPI

**Cardinal rule:** start with single ad set (AS-1 + AS-2 max), prove it works, then add AS-3 + AS-4. Don't fragment a small budget across 4 ad sets on day 1 — Meta needs ≥50 conversions per ad set to exit learning phase.

---

## §4. Audience strategy (3 tiers + 1 escape valve)

**Tier 1 — Custom Match** (the JegoDigital secret weapon)
Source: 9 active Instantly campaigns + LinkedIn hiring intent + cold-call list, deduped.
- Build script: `tools/fb_ads/build_customer_match.py` + `pull_instantly_leads.py`
- Hash with SHA-256 per Meta spec (lowercase, trim, hash email/phone/fn/ln/country)
- Upload via Marketing API (`POST /act_X/customaudiences` then `POST /audience_id/users`)
- TYPICAL match rate: 30-40% of hashed list becomes "reachable" on FB
- Refresh every 14 days (Meta auto-purges stale audiences after ~28 days unused)

**Tier 2 — Pixel-based**
- "Visitors to /auditoria-gratis last 30d, did NOT fire Lead event"
- Pixel ID `2356041791557638`, current audience `120241114556670662`
- Update retention every 30d

**Tier 3 — Engagement segmentation** (NOT YET BUILT)
Build 3 separate Custom Audiences from Brevo segments:
- Cold (no opens) → "introduction" creative angle
- Warm (opened) → "social proof" creative angle
- Hot (replied + clicked) → "Pilot 14 días offer" close-the-loop angle
This eliminates ad fatigue on the same person seeing the same case study 12× across cold email + Meta.

**Escape valve — Lookalike 1%**
Build ONLY when:
- 50+ conversions logged via CAPI (Meta needs this baseline for accurate model)
- Source audience has 100+ converted leads
- Audience size ≥ 1,000

Lookalike 1% expansion → seeds Advantage+ campaign for cold acquisition once retargeting saturates the seed audience.

---

## §5. Conversion API (CAPI) — the table-stakes wiring

**Per 2026 research: CAPI is no longer optional, it's "table stakes". Without it, Meta optimizes for form fills not bookings.**

### 5 events to send via CAPI

| Event | When | Source | Value |
|---|---|---|---|
| `Lead` | Lead Form fill | Webhook (server-side) | low |
| `CompleteRegistration` | Audit page view | Pixel (browser) + CAPI (server) | low |
| `Contact` | Email opened in Brevo | Brevo webhook → CAPI | medium |
| `Schedule` | Calendly booking | Calendly webhook → CAPI | high |
| `Purchase` | Client signs proposal | Manual or Notion CRM trigger | very high |

### Setup path (autonomous — 90 min once Pixel access token is grabbed)

1. Generate Pixel access token: Events Manager → Settings → Conversions API → Generate Access Token
2. Save as GH Secret `META_PIXEL_ACCESS_TOKEN`
3. Build `website/functions/metaCAPIDispatcher.js` Cloud Function
4. Wire Calendly webhook → CAPI dispatcher → emit `Schedule` event with hashed email + leadgen_id
5. Wire `submitAuditRequest` → emit `CompleteRegistration` event
6. Wait 7 days for Meta to log ≥50 events, then switch ad-set optimization from `LEAD_GENERATION` to `OFFSITE_CONVERSIONS` targeting `Schedule`

### Event Match Quality target ≥7.0

Send these fields with EVERY event:
- email (sha256 hashed, lowercase, trimmed)
- phone (sha256 hashed, digits only with country code)
- fbp + fbc (browser cookies — pass-through from Pixel)
- client_user_agent + client_ip_address
- external_id (your internal lead ID, hashed)

Meta scores Event Match Quality 0-10. <6.0 = poor matching, weak optimization. ≥7.0 = good. ≥8.5 = excellent.

---

## §6. Lead Form best practices

### Form structure (canonical for JegoDigital)

```
Question 1: EMAIL (pre-filled, required)
Question 2: PHONE (pre-filled, required)
Question 3: URL del sitio web inmobiliario (custom text, required)
Question 4: ¿Cuántas propiedades en tu inventario actualmente?
   options: 1-20 / 21-50 / 51-100 / 100+
   (this drives audit emphasis + segments developer-grade leads at 100+)
Question 5: ¿Cuántos leads/mes manejas hoy?
   options: 0-5 / 5-20 / 20-50 / 50+
   (this gauges current marketing strength → drives nurture path)
```

**REPLACEMENT NOTE:** the original v1 form (`942858358503290`) has `main_frustration` instead of "propiedades" — that's a known sub-optimal choice from the launch. When v1 hits 50 fills, A/B test v2 with the propiedades question.

### Form questions HR

- 5 questions max — anything more, fill rate collapses 30%+
- 1-2 multiple-choice qualification questions max (NEVER all open-text)
- Email + phone always pre-filled (Meta can pull from FB profile)
- Question wording matches the ad headline ("¿Cuánto leads/mes?" → ad mentions lead capture)
- Privacy URL required: `https://jegodigital.com/privacy`
- Custom disclaimer (optional but recommended): "Al enviar, autorizo a JegoDigital a contactarme..."
- Locale: `es_LA` for MX leads, `en_US` for Miami bilingual
- `is_optimized_for_quality: true` ALWAYS (filters junk fills)

### Form publishing rule

⚠️ **Once published, Lead Forms CANNOT be edited.** New version = new form_id. Always create test forms in DRAFT first, verify via Meta Lead Ads Testing Tool, THEN publish.

---

## §7. Creative system (the 8-format rotation)

Per 2026 research: **creative is 80% of performance**. Run 4-8 variants per week, kill what doesn't work, double down on what does.

### 8 must-have creative formats for B2B real estate

| # | Format | Use case | When |
|---|---|---|---|
| 1 | **Single image — case study screenshot** | Authority proof | Cold-warm audience |
| 2 | **Carousel — 5-case story** | Multi-proof in one ad | Cold-warm, after format 1 fatigues |
| 3 | **15s vertical Reel — Alex on camera** | Founder authenticity | All audiences (29% conversion lift per UGC research) |
| 4 | **27s landscape video — montage** | Detailed proof | Pixel warm audience |
| 5 | **Stat bar image — "+320% / 88% / 5×"** | Hook for skimmers | Cold audience first impression |
| 6 | **Before/after slider (carousel)** | Service demo | Form openers / hot audience |
| 7 | **Offer card — "Pilot 14 días"** | Hot audience close | Form openers, retarget Calendly aborters |
| 8 | **Myth-buster talking head** | Polarizing hook | Wide cold + Lookalike |

### Creative quality rules

- All formats: **4:5 portrait minimum** (1080×1350) — works on FB Feed + IG Feed + Reels with letterbox
- 9:16 vertical (1080×1920) for Reels-only ads
- **Brand-locked colors:** #0f1115 (background) + #C5A059 (gold) + #FFFFFF (white)
- **Logo:** `/website/images/logo/jegodigitallogo.png` (NEVER older versions)
- **Mobile readability test:** thumbnail must be readable at 120×150 px (FB compresses heavily)
- **Text overlay rule (Meta):** ad will still run with >20% text, but Meta deprioritizes — keep text overlay <20% of image area
- **First 1-3 seconds determine 70% of completion** — front-load the hook
- **Captions burned in** for video (85% of FB video plays without sound)

### Creative refresh cadence

| Audience size | Creative refresh |
|---|---|
| <1,000 | every 5 days |
| 1,000-10,000 | every 7 days |
| 10,000+ | every 14 days |

When CTR drops 30% week-over-week → that creative is fatigued, replace.

---

## §8. Bid + budget strategy

### Optimization goals (in order of preference)

1. **`OFFSITE_CONVERSIONS`** with `Schedule` event (Calendly booking) — BEST, requires CAPI
2. **`OFFSITE_CONVERSIONS`** with `Lead` event (CAPI) — GOOD
3. **`LEAD_GENERATION`** (form fill) — DEFAULT, current state
4. **`LINK_CLICKS`** — only for testing creative, never for scale
5. **`IMPRESSIONS`** — only for brand awareness, NEVER for B2B

### Bid strategy

- **`LOWEST_COST_WITHOUT_CAP`** — default, let Meta find lowest CPL
- **`COST_CAP`** — once you have 14 days of data and know baseline CPL, cap at 1.5× of best
- **NEVER `LOWEST_COST_WITH_BID_CAP`** — bid caps choke delivery on small audiences

### Budget bands

| Daily budget | Strategy |
|---|---|
| < $5 USD | 1 ad set, 1 audience, 4 creatives — concentrate |
| $5-30 USD | 2 ad sets (CM + Pixel), 4-6 creatives each |
| $30-100 USD | 3-4 ad sets (CM + Pixel + Form Openers + Lookalike), 6-8 creatives, A/B testing |
| $100+ USD | Add Advantage+ broad campaign for acquisition |

**Hard rule:** never run an ad set at <$2 USD/day — Meta can't optimize on starvation budgets.

---

## §9. Frequency cap + saturation management

- **NO `frequency_control_specs` for `LINK_CLICKS` or `LEAD_GENERATION` goals** — Meta's API rejects this combo (subcode 1815211)
- ONLY `optimization_goal=REACH` accepts frequency caps
- Manage saturation via:
  - Audience size (keep ≥1,000 reachable)
  - Creative rotation (4+ ads per ad set)
  - Pause when reach % of audience >70% in 7 days

---

## §10. Geo + locale gotchas

- **Mexico does NOT support city targeting** when MX is the only country — use `regions` (state-level) instead
- **Miami targeting:** create a SEPARATE ad set with `countries: ["US"]` + `cities: [{key: "1408259", name: "Miami"}]`
- **Locales:** `6` = Spanish (Spain), `23` = English (US), `1003` = Spanish (Mexico) — pass all 3 for MX+Miami
- **Never mix MX-only country with US city in one ad set** — Meta rejects (error subcode 1487479)

---

## §11. Anti-goals (what we NEVER do)

- ❌ **Run ads on Audience Network** — low quality, lots of fraud
- ❌ **Run ads on Marketplace** for B2B — consumer intent
- ❌ **Use `subtype` parameter** on customaudiences POST — deprecated in v21
- ❌ **Use `degrees_of_freedom_spec.creative_features_spec.standard_enhancements`** — deprecated Jan 2026
- ❌ **Build Lookalike <50 conversion baseline** — bad model, wastes budget
- ❌ **Add `frequency_control_specs` to non-REACH ad sets** — API rejects
- ❌ **Run >5 questions on Lead Form** — fill rate collapses
- ❌ **Use Calendly link directly in ad copy** — Meta flags as "off-platform redirect", lower delivery
- ❌ **Quote MX$ or USD price in ad copy** — HR-0
- ❌ **Run Meta on a budget split across 4+ ad sets at <$30/day total** — fragmented learning

---

## §12. Webhook + lead delivery (the autonomous pipeline)

Lead Form fill → webhook → Brevo + audit + Telegram.

```
Meta FB Lead Form fill
  ↓ Meta webhook POST
website/functions/metaLeadFormWebhook.js
  ├─ Firestore meta_lead_events doc (audit log)
  ├─ Brevo list 41 add (with attributes)
  ├─ submitAuditRequest fires (45-min audit pipeline)
  └─ Telegram ping
```

### Required env vars (deploy.yml + GH Secrets)

```
META_LEAD_VERIFY_TOKEN=jegodigital_meta_lead_verify_2026_x9k
META_PAGE_ACCESS_TOKEN=<never-expiring page token>
BREVO_HIRING_INTENT_FB_LIST_ID=41
AUDIT_INTERNAL_ENDPOINT=https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest
```

### Critical: field names match between webhook → submitAuditRequest

The audit endpoint expects `{website_url, name, email}` NOT `{url, firstName, email}`.
This was a critical bug in v1 of the webhook — fixed in commit `39b48140`.

### Brevo welcome email gap (TO-FIX)

When a lead lands on list 41, NO welcome email fires. The 45-min audit delay = silent zone where competitors win. **TODO:** create transactional email "Tu auditoría está cocinándose" + trigger automation on list 41 add.

---

## §13. KPI targets (per ad set, week 1)

| Metric | Healthy | Warning | Kill |
|---|---|---|---|
| CTR | ≥1.5% | 0.7-1.5% | <0.7% |
| CPC | <MX$15 | MX$15-30 | >MX$30 |
| Lead Form fill rate (% of clicks) | ≥10% | 5-10% | <5% |
| CPL (cost per lead) | <MX$80 | MX$80-150 | >MX$150 |
| Audit-to-Calendly conversion | ≥20% | 10-20% | <10% |
| Calendly show rate | ≥75% | 60-75% | <60% |

**Kill switch:** if 7-day CPL >MX$150 AND <5 fills total → pause that ad set, refresh creative.

---

## §14. The 12-step launch checklist (paste this every time we ship a new campaign)

```
[ ] 1.  Mount jegodigital folder via mcp__cowork__request_cowork_directory
[ ] 2.  Source website/functions/.env + verify FB_USER_TOKEN scopes (≥6 critical incl pages_manage_ads)
[ ] 3.  Verify Pixel firing on landing page (Events Manager → Test Events)
[ ] 4.  Build/refresh Custom Match audience CSV (tools/fb_ads/build_customer_match.py + pull_instantly_leads.py)
[ ] 5.  Hash CSV with SHA-256 per Meta spec
[ ] 6.  Create Custom Audience via API (verify TOS already accepted at https://business.facebook.com/ads/manage/customaudiences/tos/?act=968739288838315)
[ ] 7.  Upload hashed users → wait 30-60 min for match-rate to populate
[ ] 8.  Create Lead Form via API (use the canonical structure from §6, locale=es_LA, is_optimized_for_quality=true)
[ ] 9.  Subscribe Page to leadgen webhook (POST /pageId/subscribed_apps subscribed_fields=leadgen)
[ ] 10. Test webhook with Meta Lead Ads Testing Tool — verify Telegram ping + Brevo contact + audit fire
[ ] 11. Create Campaign + Ad Sets + Ads via tools/fb_ads/ship_campaign.py — all PAUSED
[ ] 12. Final review in Ads Manager → flip to ACTIVE → Meta review 4-24h
```

---

## §15. Tools + scripts (the autonomous toolkit)

| Script | Purpose |
|---|---|
| `tools/fb_ads/build_customer_match.py` | Merge local CSVs (DIAL_READY, cold_call_*, vibe) → raw + hashed |
| `tools/fb_ads/pull_instantly_leads.py` | Pull all leads across active Instantly campaigns + dedupe + hash |
| `tools/fb_ads/ship_campaign.py` | Idempotent campaign builder — uploads images/video, creates Custom Audience, creates Pixel audience, builds Campaign + Ad Sets + Ads |
| `tools/fb_ads/ship_campaign_v2.py` | WEBSITE-destination variant (used when Lead Form blocked) |
| `tools/fb_ads/upgrade_to_leadform.py` | Pivot existing WEBSITE ads to Lead Form ads |
| `tools/fb_ads/ship_as1.py` | Add AS-1 (Custom Match) ad set to existing campaign |
| `tools/fb_ads/subscribe_webhook.py` | Subscribe Page to leadgen events |
| `tools/fb_ads/reissue_token.py` | Exchange short-lived USER token → 60-day → never-expiring PAGE (TO BUILD) |

---

## §16. The 8 known gaps (post-launch audit 2026-04-27)

Discovered during the v1 launch — each one is a TODO with concrete fix.

| # | Gap | Severity | Fix |
|---|---|---|---|
| 1 | ✅ Field-name mismatch (url vs website_url) | CRITICAL | Fixed commit 39b48140 |
| 2 | ✅ Form questions decorative (never used downstream) | CRITICAL | Fixed in same commit — now wired to Brevo + audit |
| 3 | No Brevo welcome email — 45-min silent zone | CRITICAL | Build transactional welcome + automation |
| 4 | No CAPI — Meta optimizes for fills not bookings | CRITICAL | Build metaCAPIDispatcher.js, wire Calendly webhook |
| 5 | Creative monotony — 1 video, only 4:5 | HIGH | Build 4 more variants weekly per §7 |
| 6 | Audience-cold-email overlap = ad fatigue | HIGH | Build 3-tier engagement segmentation |
| 7 | Form questions don't qualify lead value | MEDIUM | Replace `main_frustration` with `propiedades` count |
| 8 | No retargeting on form openers (40% abandon rate) | MEDIUM | Build AS-3 with Form Openers Custom Audience |

---

## §17. Disaster log (what NOT to repeat)

| Date | Mistake | What was tried | Why it failed | Lesson |
|---|---|---|---|---|
| 2026-04-27 | Created CA without TOS | POST /customaudiences | error_subcode 1870090 | Meta walls customer-list uploads behind one-time TOS click. NO API workaround. |
| 2026-04-27 | Tried to create Lead Form via API with 33-scope token | POST /pageId/leadgen_forms | Requires `pages_manage_ads` (not in default token scopes) | Always check token scopes BEFORE building. |
| 2026-04-27 | Used `cities: [{Miami}]` with `countries: ["MX"]` | Single ad set | Meta rejects city + foreign country combo | Split MX and US into separate ad sets. |
| 2026-04-27 | Used `frequency_control_specs` with `LINK_CLICKS` goal | Ad set creation | error_subcode 1815211 | Frequency caps ONLY work with REACH optimization. Drop param otherwise. |
| 2026-04-27 | Used `degrees_of_freedom_spec.creative_features_spec.standard_enhancements` | Ad creative POST | error_subcode 3858504 (deprecated) | Drop entire field. Meta deprecated it Jan 2026. |
| 2026-04-27 | Sent webhook → submitAuditRequest with `{url, firstName}` | Field mapping | Audit endpoint expects `{website_url, name}` — silent 400, no audit ever sent | Always test the full webhook → audit chain end-to-end with simulated Meta payload before going live. |
| 2026-04-27 | Activated AS-1 LF but its 4 ads were still PAUSED | Manual UI flip | Ads stayed dormant, $0 spend, no impressions | Always verify ALL 4 levels (campaign / ad set / ad) are ACTIVE. effective_status > status. |
| 2026-04-27 | Lead Form context_card with PARAGRAPH_STYLE multiple paragraphs | Form creation | error: "only one element in PARAGRAPH_STYLE" | Use LIST_STYLE for multi-bullet, ≤80 chars per bullet. |

---

## §18. Quick reference — error subcodes

| Subcode | Meaning | Fix |
|---|---|---|
| 1870090 | Custom Audience Terms Not Accepted | Alex clicks https://business.facebook.com/ads/manage/customaudiences/tos/?act=X |
| 1815211 | Invalid Optimization Goal for Frequency Control Specs | Drop `frequency_control_specs` |
| 1487479 | City Targeting Not Supported in Country | Split MX and US into separate ad sets |
| 1885014 | Promoted Object Invalid | Remove `promoted_object={pixel_id}` for non-conversion goals |
| 1443226 | Your ad needs a video thumbnail | Add `image_hash` to `video_data` |
| 3858504 | Standard enhancements deprecated | Drop `degrees_of_freedom_spec` |
| 100 (pages_manage_ads) | Token missing scope | Re-OAuth with `pages_manage_ads`, then exchange for never-expiring PAGE token |

---

## §19. References

Built from these 2026 research dossiers:

- [Meta Lead Forms Best Practices 2026 — Edge Digital](https://www.edgedigital.net/optimising-conversion-rates/)
- [Meta Ads Best Practices 2026 — LeadSync](https://leadsync.me/blog/meta-ads-best-practices/)
- [Meta Conversions API 2026 Setup Guide — DataAlly](https://www.dataally.ai/blog/how-to-set-up-meta-conversions-api)
- [Meta Conversions API Complete Setup 2026 — Ingest Labs](https://ingestlabs.com/blogs/meta-capi-setup-complete-implementation-guide-for-facebook-conversion-api-2026/)
- [Meta Advantage+ Audience 2026 — Alex Neiman](https://alexneiman.com/meta-advantage-plus-audience-targeting-2026/)
- [Meta Advantage+ vs Detailed Targeting 2026 — Conversios](https://www.conversios.io/blog/meta-advantage-audience-vs-detailed-targeting-2026-guide/)
- [Facebook Ad Creative Trends 2026 — Adligator](https://adligator.com/blog/facebook-ad-creative-trends-2026)
- [Meta Ads 2026 Playbook Creative Strategies — CreativeAdBundance](https://www.creativeadbundance.com/blog/meta-ads-2026-playbook-5-creative-strategies-to-maximize-roi)
- [Meta B2B Ad Conversion Benchmarks 2026 — Lever Digital](https://www.leverdigital.co.uk/post/meta-ad-conversion-benchmarks-for-b2b)
- [Facebook Ads for Real Estate 2026 — Stape](https://stape.io/blog/real-estate-facebook-ads)
- [Facebook Lead Ads Quality Optimization — Stackmatix](https://www.stackmatix.com/blog/facebook-lead-ads-optimization)

---

**Last updated:** 2026-04-28
**Maintained by:** Claude AI sessions + Alex Jego
**Update cadence:** quarterly minimum, sooner if a Meta API change breaks anything in §17 or §18
**Single source of truth** for everything Meta Ads at JegoDigital.
