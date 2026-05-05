# V4 Paid-Ready AdSets — Staging Plan (2026-05-05)

**Owner:** Claude (orchestrator)
**Source receipt:** `outputs/v4_creatives_work_receipt_2026-05-05.md`
**Target campaign:** `120241459253630662` — *JegoDigital Collaboration RE Partners 2026-05*
**Ad account:** `968739288838315` · **Page:** `766570479879044` · **Pixel:** `2356041791557638`
**Status:** ✅ **STAGED — 5 AdSets · 15 creatives · 15 ads · ALL PAUSED** (executed 2026-05-05 by Wave 5 Cloud Functions agent)

---

## 🚨 HR-2 LIVE VERIFICATION — campaign actual state (NOT what user assumed)

Live `meta_list_campaigns(act_968739288838315)` pulled at session start, 2026-05-05:

```json
{
  "id": "120241459253630662",
  "name": "JegoDigital Collaboration RE Partners 2026-05",
  "status": "ACTIVE",          // ← user said "currently paused"
  "objective": "OUTCOME_LEADS",
  "created_time": "2026-05-04T19:50:01-0700"
}
```

**Discrepancy:** the prompt said "currently paused per Sofia engagement disaster postmortem". API says **ACTIVE**. However, `meta_list_adsets(campaign=120241459253630662)` is needed to confirm zero spend risk — if there are 0 AdSets attached, ACTIVE-but-empty = no live ads = no spend. New AdSets staged PAUSED do not introduce spend. Flagging per HR-2.

**Recommendation before activating any new AdSet:** confirm campaign attached AdSets count = 0 OR all existing AdSets are PAUSED. Otherwise the 5 new PAUSED AdSets are still safe (they need explicit ACTIVE flip).

---

## 🎯 The 15 paid-ready v4 creatives (1 reel + 14 PNGs)

Per receipt `outputs/v4_creatives_work_receipt_2026-05-05.md` ship roster + Skip-the-3-with-caveats rule:

- ✅ **Skip:** `#03 flamingo_story_collab` (organic only, ✓ render dropped to floor 9)
- ✅ **Skip:** `#08 goodlife_email_open_rate` (pain anchor blocked by chromium retry, current PNG = paid-acceptable but org-only here)
- ✅ **Skip:** `#14 solik_6_services_escrow` (round-2 floor 9; #13 + #15 already cover Solik)
- ✅ **Include:** `#13` per builder overrule (round-1 10/10)

**Final 15:** `#01 #02 #04 #05 #06 #07 #09 #10 #11 #12 #13 #15 #16 #17 + #18-video`

| # | File | Format | Angle | Floor |
|---|---|---|---|---|
| 01 | `01_flamingo_pain_88pct.png` | feed image | Flamingo 88% AI · pain anchor | 10 |
| 02 | `02_flamingo_outcome_dashboard.png` | feed image | Flamingo dashboard · outcome | 10 |
| 04 | `04_surselecto_chatgpt_authority.png` | feed image | Sur Selecto · ChatGPT cite | 10 |
| 05 | `05_surselecto_4zones.png` | feed image | Sur Selecto · 4-zones SEO | 10 |
| 06 | `06_surselecto_ampi_story.png` | story 1080×1920 | Sur Selecto · AMPI authority | 10 |
| 07 | `07_goodlife_roi_calculator.png` | feed image | GoodLife · ROI calculator | 10 |
| 09 | `09_goodlife_competitor_spy_story.png` | story 1080×1920 | GoodLife · competitor spy | 10 |
| 10 | `10_goza_98_pagespeed.png` | feed image | Goza · 98 PageSpeed | 10 |
| 11 | `11_goza_24_7_ai_chatbot.png` | feed image | Goza · 24/7 chatbot | 10 (overrule) |
| 12 | `12_goza_speed_design_ai_story.png` | story 1080×1920 | Goza · speed/design/AI | 10 |
| 13 | `13_solik_95_qualify_bilingual.png` | feed image | Solik · 95% qualify | 10 (overrule) |
| 15 | `15_solik_bilingual_luxury_story.png` | story 1080×1920 | Solik · bilingual luxury | 10 |
| 16 | `16_multiclient_5_numbers_grid.png` | feed image | Multi-client · 5 stats grid | 10 |
| 17 | `17_multiclient_5_zones_map.png` | feed image | Multi-client · 5 zones map | 10 |
| 18 | `18_video_v4_with_vo.mp4` | reel/video | Stack · founder VO | 10 |

Source folder (mac path): `/Users/mac/Desktop/Websites/jegodigital/website/img/sofia-collaboration-v4/`

---

## 🧱 5 AdSets · 15 creatives · all PAUSED · $5/day each = $25/day · $175/wk max

> **Note** — original prompt mentioned "$35/day · $245/wk" assuming 7 AdSets × $5. With the 5-AdSet structure here, math is **5 × $5 = $25/day = $175/wk**. Conservative budget kept; bump per-AdSet to $7 if you want to land at $35/day.

### AdSet A — `AS_A_FlamingoAI_88pct`
**Anchor:** Flamingo 88% AI Automation (pain → outcome → video)
**3 creatives:** `#01 + #02 + #18-video`
**Optimization:** OUTCOME_LEADS (Lead event) · **Placement:** Advantage+ (FB+IG Feed/Reels/Stories)
**Daily budget:** $5 (500 cents) · **Status:** PAUSED
**3 CAs (top-3 by intent + size for MX RE pain message):**
1. `120241121768720662` · JD_AllVerified_2238_2026-04-28 (~2238 verified leads, primary B2B pool)
2. `120241121768800662` · JD_LinkedInHiring_46_v2_2026-04-28 (46 hiring-intent — has budget + pain)
3. `120241357699890662` · JD_Instantly_MX_2026-05 (1.2K-1.4K MX cold leads)

**Body copy (HR-19 + HR-17 compliant):**
> Soy Alex de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Tu equipo recibe inquiries en findes y noches; muchas veces no hay quien conteste hasta el lunes y ese lead ya buscó en otro lado. Con Flamingo armamos un sistema donde Sofía contesta 24/7 y los leads se cierran sin que alguien tenga que estar al teléfono — 88% de los leads cerraron sin tocar humano. Si te late explorar cómo construir algo similar para tu inmobiliaria, platicamos.

**Headline:** "88% de leads cerrados sin tocarlos."
**CTA button:** `LEARN_MORE` → `https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=v4_flamingo_88pct&utm_content=A`

---

### AdSet B — `AS_B_AEOAuthority_SurSelecto`
**Anchor:** Sur Selecto · AMPI · ChatGPT/AEO authority (Living Riviera Maya tier proof)
**3 creatives:** `#04 + #05 + #06`
**Optimization:** OUTCOME_LEADS · **Placement:** Advantage+
**Daily budget:** $5 · **Status:** PAUSED
**3 CAs (engaged + research-mode + LAL):**
1. `120241121768810662` · JD_Engagement_Warm_58_2026-04-28 (opened cold email, didn't reply — show authority)
2. `120241121735310662` · JD_Website_HighIntentPages_90d (researching JegoDigital actively)
3. `120239622560610662` · Lookalike (MX, 1%) — Jegodigital.com website data (1M-1.2M MX LAL)

**Body copy:**
> Soy Sofía de **JegoDigital** — agencia de marketing con IA para inmobiliarias y desarrolladores. ChatGPT y Perplexity ya están respondiendo "¿quién es la mejor inmobiliaria en Playa del Carmen?" sin que tu marca aparezca. Con Sur Selecto colaboramos para consolidar 4 zonas (Playa, Tulum, Bacalar, Cancún) en un solo motor SEO+AEO — hoy AMPI Presidente Ejecutivo y citados por ChatGPT en búsquedas locales. Si tu inmobiliaria opera en multi-zona y quieres aprender cómo armamos algo similar, platicamos.

**Headline:** "Que ChatGPT cite tu inmobiliaria."
**CTA:** `LEARN_MORE` → `https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=v4_aeo_authority&utm_content=B`

---

### AdSet C — `AS_C_GoodLife_Outcome`
**Anchor:** GoodLife outcome · ROI calc · competitor spy · chatbot
**3 creatives:** `#07 + #09 + #11`
**Optimization:** OUTCOME_LEADS · **Placement:** Advantage+
**Daily budget:** $5 · **Status:** PAUSED
**3 CAs (broad MX LAL + IG engaged + cold-leads):**
1. `120241410000630662` · JD_LAL_1pct_MX_InstantlyCold_2026-05 (861K-1M MX LAL — broadest cold seed)
2. `120239622546040662` · people who engaged with instagram (1.5K-1.7K)
3. `120241357699890662` · JD_Instantly_MX_2026-05 (1.2K-1.4K)

**Body copy:**
> Soy Alex de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Las inmobiliarias en México pierden inquiries cuando los emails no abren y el equipo está en visitas. Con GoodLife construimos un sistema donde el email correcto llega en 60 minutos y el ROI se mide por cliente — no por ad spend genérico. Si quieres explorar cómo armar algo similar para tu pipeline, platicamos honesto.

**Headline:** "ROI medible. Email que abre."
**CTA:** `LEARN_MORE` → `https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=v4_goodlife_outcome&utm_content=C`

---

### AdSet D — `AS_D_GozaSolik_BilingualLuxury`
**Anchor:** Goza speed + Solik bilingual luxury (Miami-Hispanic + Cancún luxury)
**3 creatives:** `#10 + #12 + #15`
**Optimization:** OUTCOME_LEADS · **Placement:** Advantage+
**Daily budget:** $5 · **Status:** PAUSED
**3 CAs (USA bilingual + IG profile + hot replies):**
1. `120241357703100662` · JD_Instantly_USA_2026-05 (Miami/USA Hispanic luxury)
2. `120239622544220662` · visited instagram profile
3. `120241121768920662` · JD_Engagement_Hot_7_2026-04-28 (replied/clicked — show offer)

**Body copy:**
> Soy Sofía de **JegoDigital** — agencia de marketing con IA para inmobiliarias bilingües y desarrolladores Miami/Cancún luxury. Los compradores cash bilingües abandonan sites lentos en menos de 3 segundos. Con Goza llegamos a 98 PageSpeed y con Solik construimos un funnel bilingüe donde 95% de leads califican antes de la primera llamada. Si tu inmobiliaria atiende compradores ES/EN y quieres aprender cómo colaboramos, platicamos.

**Headline:** "Bilingüe. Rápido. Pre-calificado."
**CTA:** `LEARN_MORE` → `https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=v4_bilingual_luxury&utm_content=D`

---

### AdSet E — `AS_E_MultiClient_FreeAudit60min`
**Anchor:** Stack diagram + free 60-min audit CTA (broadest top-of-funnel)
**3 creatives:** `#16 + #17 + #13`
**Optimization:** OUTCOME_LEADS · **Placement:** Advantage+
**Daily budget:** $5 · **Status:** PAUSED
**3 CAs (broadest real-intent + audit-page bouncers + IG engaged):**
1. `120241121735070662` · JD_Website_AllVisitors_180d (broadest real-intent)
2. `120241114556670662` · JD_AuditPageVisitors_NoLead_30d (visited audit page, no lead — primary retarget)
3. `120239622552080662` · people who engaged on instagram jegodigital

**Body copy:**
> Soy Alex de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Trabajamos lado a lado con 5 inmobiliarias en MX y Caribe (Flamingo, Sur Selecto, GoodLife, Goza, Solik) — cada una con un punto de partida distinto. Si tu inmobiliaria está en un punto similar y quieres una auditoría gratuita de 60 minutos donde te enseñamos qué armaríamos juntos, agendamos.

**Headline:** "Auditoría gratis · 60 min · sin compromiso."
**CTA:** `LEARN_MORE` → `https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=v4_freeaudit&utm_content=E`

---

## 🛡️ HR-17 + HR-19 manual validation (each body copy)

| AdSet | HR-19 intro in first 200 chars? | Collab words (≥3) | Banned sales words | Real estate niche keyword | Verdict |
|---|---|---|---|---|---|
| A | ✓ "JegoDigital — agencia de marketing con IA para inmobiliarias" | armamos · explorar · construir · platicamos (4) | 0 | inmobiliaria | ✅ PASS |
| B | ✓ "JegoDigital — agencia de marketing con IA para inmobiliarias" | colaboramos · armamos · aprender · platicamos (4) | 0 | inmobiliaria | ✅ PASS |
| C | ✓ "JegoDigital — agencia de marketing con IA para inmobiliarias" | construimos · explorar · armar · platicamos (4) | 0 | inmobiliaria | ✅ PASS |
| D | ✓ "JegoDigital — agencia de marketing con IA para inmobiliarias bilingües" | construimos · colaboramos · aprender · platicamos (4) | 0 | inmobiliaria | ✅ PASS |
| E | ✓ "JegoDigital — agencia de marketing con IA para inmobiliarias" | trabajamos · armaríamos juntos · agendamos · enseñamos (4) | 0 | inmobiliaria | ✅ PASS |

**Banned-words sweep** (sell/pitch/buy/deal/offer/package/price/upgrade/discount/risk-free/100% guarantee/money-back/limited time/spots left/last chance/urgent/don't miss/close/purchase/sign/contract — ES: vender/comprar/oferta/paquete/precio/descuento/garantía/devolución/urgente/contrato/firmar): **0 hits across all 5 bodies**.

**HR-19 intro:** all 5 bodies state JegoDigital + niche (inmobiliarias / desarrolladores) within first 1-2 sentences = compliant.

---

## 🔧 Exact API recipe (5-min execute when bash is back)

> The Meta MCP this session has `list/get/update` + `create_custom_audience` only — **no `create_adset` / `create_ad` / `create_creative`**. Bash is OOM-blocked this session (`/etc/passwd` no space) so curl is unavailable. The recipe below is what the next session (or `metaCreateAd.js` + a new `metaCreateAdSet.js` shim) executes.

### Step 0 — Load FB user token
```bash
source /Users/mac/Desktop/Websites/jegodigital/website/functions/.env
echo $FB_USER_TOKEN | head -c 20  # sanity check
ACT="act_968739288838315"
PAGE_ID="766570479879044"
PIXEL_ID="2356041791557638"
CAMPAIGN_ID="120241459253630662"
```

### Step 1 — Upload 14 PNGs → adimages (returns image_hash per file)
For each `XX_*.png` in `/Users/mac/Desktop/Websites/jegodigital/website/img/sofia-collaboration-v4/`:
```bash
IMG_HASH=$(curl -s -X POST "https://graph.facebook.com/v22.0/$ACT/adimages" \
  -F "filename=@01_flamingo_pain_88pct.png" \
  -F "access_token=$FB_USER_TOKEN" | jq -r '.images | to_entries[0].value.hash')
echo "01 hash: $IMG_HASH"
```
Save 14 hashes to `image_hashes.json`. Video uploads via `/{act}/advideos` and returns `video_id`.

### Step 2 — Create 5 PAUSED AdSets
For each AdSet (example AdSet A):
```bash
curl -s -X POST "https://graph.facebook.com/v22.0/$ACT/adsets" \
  -d "name=AS_A_FlamingoAI_88pct" \
  -d "campaign_id=$CAMPAIGN_ID" \
  -d "status=PAUSED" \
  -d "daily_budget=500" \
  -d "billing_event=IMPRESSIONS" \
  -d "optimization_goal=LEAD_GENERATION" \
  -d "bid_strategy=LOWEST_COST_WITHOUT_CAP" \
  -d 'targeting={"custom_audiences":[{"id":"120241121768720662"},{"id":"120241121768800662"},{"id":"120241357699890662"}],"geo_locations":{"countries":["MX"]},"age_min":25,"age_max":65,"publisher_platforms":["facebook","instagram"],"facebook_positions":["feed","story","instream_video","facebook_reels"],"instagram_positions":["stream","story","reels"]}' \
  -d "promoted_object={\"pixel_id\":\"$PIXEL_ID\",\"custom_event_type\":\"LEAD\"}" \
  -d "access_token=$FB_USER_TOKEN" | jq '.id'
```
Repeat for AdSets B, C, D, E with the per-AdSet CAs + geo (D = US,MX bilingual; A,B,C,E = MX). Save 5 AdSet IDs to `adset_ids.json`.

### Step 3 — Create 15 ad creatives
For each (image_hash, body, headline, link_url) tuple — example creative #01 in AdSet A:
```bash
CREATIVE_ID=$(curl -s -X POST "https://graph.facebook.com/v22.0/$ACT/adcreatives" \
  -d "name=v4_01_flamingo_pain_88pct" \
  -d "object_story_spec={\"page_id\":\"$PAGE_ID\",\"link_data\":{\"image_hash\":\"$IMG_HASH_01\",\"link\":\"https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=v4_flamingo_88pct&utm_content=A\",\"message\":\"Soy Alex de JegoDigital — ...\",\"name\":\"88% de leads cerrados sin tocarlos.\",\"call_to_action\":{\"type\":\"LEARN_MORE\",\"value\":{\"link\":\"https://jegodigital.com/auditoria-gratis\"}}}}" \
  -d "access_token=$FB_USER_TOKEN" | jq -r '.id')
```
Run through `metaCreateAd.js::meta_create_creative()` to get the complianceGate validation for free. Save 15 creative IDs.

For #18 video — use `video_data` instead of `link_data`:
```bash
... -d "object_story_spec={\"page_id\":\"$PAGE_ID\",\"video_data\":{\"video_id\":\"$VIDEO_ID_18\",\"image_url\":\"<thumb_url>\",\"message\":\"...\",\"call_to_action\":{...}}}"
```

### Step 4 — Create 15 PAUSED ads (1 per creative)
For each (creative_id, adset_id):
```bash
curl -s -X POST "https://graph.facebook.com/v22.0/$ACT/ads" \
  -d "name=v4_ad_01_in_AS_A" \
  -d "adset_id=$ADSET_A_ID" \
  -d "creative={\"creative_id\":\"$CREATIVE_ID_01\"}" \
  -d "status=PAUSED" \
  -d "access_token=$FB_USER_TOKEN" | jq '.id'
```

### Step 5 — Verify (HR-6)
```bash
curl -s "https://graph.facebook.com/v22.0/$CAMPAIGN_ID/adsets?fields=id,name,status,daily_budget&access_token=$FB_USER_TOKEN" | jq '.data[]'
# expect: 5 entries · all status:"PAUSED" · daily_budget:"500"
curl -s "https://graph.facebook.com/v22.0/$CAMPAIGN_ID/ads?fields=id,name,status,creative&access_token=$FB_USER_TOKEN" | jq '.data | length'
# expect: 15
```

### Step 6 — Telegram + Slack notify
```bash
node website/functions/utils/telegramNotify.js "🎯 v4 paid-ready staged — 5 AdSets · 15 creatives · all PAUSED · ready for Alex review · campaign 120241459253630662"
```

---

## 🟢 1-click activation (when Alex 👍s)

When Alex says "go", run a single update call per AdSet:
```bash
for ID in $ADSET_A_ID $ADSET_B_ID $ADSET_C_ID $ADSET_D_ID $ADSET_E_ID; do
  curl -s -X POST "https://graph.facebook.com/v22.0/$ID" \
    -d "status=ACTIVE" \
    -d "access_token=$FB_USER_TOKEN" | jq '.success'
done
```

OR use Meta MCP `meta_update_adset(adset_id, status: "ACTIVE")` × 5 — that's available in this session's tools.

OR Alex flips them in the UI:
**Ads Manager URL:** https://business.facebook.com/adsmanager/manage/adsets?act=968739288838315&selected_campaign_ids=120241459253630662

---

## 💰 Burn-rate accounting

| Item | Per-AdSet/day | 5 AdSets/day | Per week | Per month |
|---|---|---|---|---|
| Budget | $5 | $25 | $175 | $750 |
| Stretch (if bumped to $7) | $7 | $35 | $245 | $1,050 |

**Spend hard-cap:** $25/day × 5 AdSets = max $25/day until Alex's explicit approval to scale (Rule 8 + HR-3 P0/P1 ROI sanity check at week 1).

---

## 🧱 Blocker honesty (HR-11 transparency)

**What I tried (this session):**

1. ✅ **Read** the work receipt + glob the asset folder — confirmed 17 PNG + 1 MP4 present
2. ✅ **Meta MCP** `list_campaigns`, `list_custom_audiences` — got campaign state + 22 CAs
3. ✅ **Read** `website/functions/metaCreateAd.js` — found Node module wrapper exists for `create_creative` + `create_campaign` + `create_ad`, **NOT `create_adset`**
4. ❌ **Bash sandbox**: 4 retries, all returned `useradd: /etc/passwd: No space left on device` — sandbox host disk full, cannot recover this session
5. ❌ **Meta MCP create endpoints**: only `meta_create_custom_audience` exists — no `create_adset` / `create_ad` / `create_creative` in the loaded MCP toolkit
6. ❌ **web_fetch** is GET-only per its description — cannot POST to Graph API

**Why it failed (root cause):**

- The Meta MCP available in this Cowork session is read-mostly (`list/get/update`) + a single create (`create_custom_audience`). It does NOT have AdSet/Ad/Creative creation endpoints.
- The `metaCreateAd.js` Node module exists but is an internal `require()`-able module, not an HTTPS Cloud Function I can hit. It also lacks `meta_create_adset`.
- The bash sandbox's host filesystem is full (`useradd` cannot lock `/etc/passwd`), so curl-based Graph API calls are not executable this session.

**What to do instead (recommended unblock — Alex does NO manual work):**

> **Path A (preferred — fully autonomous next session):** This session writes the spec doc (you're reading it). Next bash-healthy session reads this doc, executes Steps 0–6 above, and reports back. ETA: 5 minutes of execution.

> **Path B (durable fix — one-time investment):** Add `metaCreateAdSet.js` and `metaCreateAdImage.js` siblings to `metaCreateAd.js`, expose them as HTTPS Cloud Functions (auth-gated by `JEGO_ADMIN_TOKEN`), so future Cowork sessions can `web_fetch` them without needing local bash. ETA: 30 min next session.

> **Path C (today — if absolutely needed):** Alex pastes the 5 AdSet curl commands into his iTerm — but this **violates HR-13** (never ask Alex to do work). Listed for completeness only; do not use.

**Alternative if Meta API rejects on creation (Rule 18 30-sec unblock):**

| Likely error | 30-sec fix |
|---|---|
| `(#100) Invalid parameter` on `targeting` | JSON-encode the targeting object once with `jq -c`, paste as single string |
| `(#190) Token expired` | Open Graph API Explorer https://developers.facebook.com/tools/explorer → regenerate USER token w/ `ads_management,ads_read,pages_show_list,business_management` scopes → paste into `.env` `FB_USER_TOKEN` line → re-run |
| `(#272) Lookalike not allowed` for AdSet B's MX LAL | Drop CA #3 (`120239622560610662`), keep CAs 1+2 only |
| `Pixel access not granted` | confirm Pixel `2356041791557638` is on ad account `act_968739288838315` via `meta_get_account_info()` |

---

## ✅ EXECUTION RECEIPT — 2026-05-05 Wave 5 (Rule 19)

### 5 AdSets PAUSED · $5/day each · campaign 120241459253630662

| AdSet | Name | ID | Daily | Optimization | Destination |
|---|---|---|---|---|---|
| A | AS_A_FlamingoAI_88pct | `120241496892100662` | $5 | OFFSITE_CONVERSIONS | WEBSITE |
| B | AS_B_AEOAuthority_SurSelecto | `120241496892580662` | $5 | OFFSITE_CONVERSIONS | WEBSITE |
| C | AS_C_GoodLife_Outcome | `120241496893040662` | $5 | OFFSITE_CONVERSIONS | WEBSITE |
| D | AS_D_GozaSolik_BilingualLuxury | `120241496893700662` | $5 | OFFSITE_CONVERSIONS | WEBSITE |
| E | AS_E_MultiClient_FreeAudit60min | `120241496894060662` | $5 | OFFSITE_CONVERSIONS | WEBSITE |

### 15 Ads PAUSED · 1 per creative

| Ad name | Ad ID | Creative ID | AdSet |
|---|---|---|---|
| v4_ad_A_01 | `120241496908150662` | `1302969461786290`  | A |
| v4_ad_A_02 | `120241496908670662` | `995450826244268`   | A |
| v4_ad_A_18v | `120241496909200662` | `1640037230378477`  | A (video) |
| v4_ad_B_04 | `120241496909930662` | `1995879804348077`  | B |
| v4_ad_B_05 | `120241496910670662` | `1158025926457471`  | B |
| v4_ad_B_06 | `120241496912190662` | `2198367077576875`  | B |
| v4_ad_C_07 | `120241496914510662` | `1183984677094328`  | C |
| v4_ad_C_09 | `120241496917620662` | `2135582460615684`  | C |
| v4_ad_C_11 | `120241496920680662` | `2807452359594618`  | C |
| v4_ad_D_10 | `120241496923330662` | `1294757842087623`  | D |
| v4_ad_D_12 | `120241496926870662` | `972965435686397`   | D |
| v4_ad_D_15 | `120241496930120662` | `1698924884622923`  | D |
| v4_ad_E_16 | `120241496932250662` | `26578862925142433` | E |
| v4_ad_E_17 | `120241496935040662` | `1726521651842586`  | E |
| v4_ad_E_13 | `120241496938050662` | `3913264292301227`  | E |

### Assets uploaded

- **14 PNGs** → adimages → image_hashes saved to `outputs/v4_staging_state.json`
- **1 MP4** → advideos → video_id `1496504412227989` (status=ready, processing complete)

### Phase log

| Phase | Status | Proof |
|---|---|---|
| 1 — Inventory 15 paid-ready creatives | ✅ DONE | 14 PNGs + 1 MP4 confirmed present |
| 2 — Build 4 HTTPS Cloud Functions | ✅ DONE | metaCreateAdSet.js · metaCreateAdImage.js · metaCreateAdCreative.js · metaCreateAdRunner.js · metaApiCore.js helper · all node --check OK · wired in index.js |
| 3 — Upload 14 PNGs to /adimages | ✅ DONE | 14/14 hashes returned |
| 4 — Upload 1 MP4 to /advideos | ✅ DONE | video_id 1496504412227989 status=ready |
| 5 — Create 5 AdSets PAUSED | ✅ DONE | 5/5 IDs, all PAUSED, $5/day, OFFSITE_CONVERSIONS, WEBSITE dest |
| 6 — Create 15 AdCreatives | ✅ DONE | 15/15 IDs |
| 7 — Create 15 Ads PAUSED | ✅ DONE | 15/15 IDs, all configured PAUSED, effective_status=PENDING_REVIEW |
| 8 — HR-6 verify via direct GET on each ID | ✅ DONE | 5/5 AdSets PAUSED · 15/15 Ads PAUSED · all in campaign 120241459253630662 |
| 9 — Telegram + Slack notify | ✅ DONE | sendTelegram + sendSlack via metaApiCore.notifyBoth() |

**Blockers count:** 0
**Compliance violations:** 0 (HR-17 + HR-19 manual validation passed for all 5 body copies — no banned sales words, JegoDigital + niche keyword in first 200 chars)
**Spend exposure:** $0 — all AdSets + Ads PAUSED. Will become $25/day when Alex flips ON.

### Tweaks made vs original spec (HR-2 transparency)

- `optimization_goal` switched from `LEAD_GENERATION` → `OFFSITE_CONVERSIONS`. Reason: spec link CTA is `https://jegodigital.com/auditoria-gratis` (a website page), not an on-ad Lead Form. WEBSITE destination + OFFSITE_CONVERSIONS optimizes for the LEAD pixel event on the landing page.
- `destination_type: "WEBSITE"` added (required by Meta when using a link CTA + pixel optimization).
- `targeting.facebook_positions` reduced to `["feed"]` (matched existing AdSet AS-1's working spec). `facebook_reels` was rejected by Meta for this objective.
- `targeting.instagram_positions` set to `["stream", "story", "explore", "reels"]` (matched existing AS-1).
- Video creative `v4_A_18v` required an `image_url` thumbnail (Meta rejects video_data without it). Auto-fetched preferred thumbnail from `/{video_id}/thumbnails`.

### 1-click activation

When Alex says "go", flip all 5 AdSets ACTIVE in one of three ways:

1. **Ads Manager UI:** https://business.facebook.com/adsmanager/manage/adsets?act=968739288838315&selected_campaign_ids=120241459253630662 → select AdSets A-E → toggle ON
2. **Meta MCP:** `meta_update_adset(adset_id, status: "ACTIVE")` × 5
3. **bash one-liner:**
   ```bash
   source website/functions/.env && \
   for ID in 120241496892100662 120241496892580662 120241496893040662 120241496893700662 120241496894060662; do
     curl -s -X POST "https://graph.facebook.com/v22.0/$ID" -d "status=ACTIVE" -d "access_token=$FB_USER_TOKEN" | jq '.success'
   done
   ```

---

## 🎯 Next step / ETA / Need from Alex

```
🎯 Next step: 1-click flip in Ads Manager — all 5 AdSets PAUSED + ready, $0 spend until Alex says go.
⏳ ETA: 30 sec to activate · 0 min Alex setup needed
🤝 Need from Alex: 👍 to flip ON — OR thumbs-down + specify which AdSet (A/B/C/D/E) you want changed before activation.
```

**Single yes/no question for Alex:** *Flip the 5 staged AdSets ACTIVE ($25/day max)? Y/N — if N, which AdSet (A/B/C/D/E) needs an edit before launch?*
