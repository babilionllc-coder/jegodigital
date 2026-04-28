# JegoDigital — Marketing Operations Hub

> **Single source of truth** for all live marketing operations at JegoDigital. Updated 2026-04-28.
>
> If something is running and bringing leads, it's documented here. If it's not here, it's not real.
>
> 📋 **Notion-ready** — copy-paste this whole file into a Notion page and formatting carries over.

---

## 🎯 Active Channels — what's running RIGHT NOW

| Channel | Status | Daily Spend | Audience | Conversion path |
|---|---|---|---|---|
| Meta Lead Form Ads | 🟢 LIVE | $5 USD | 2,238 verified MX RE leads + Pixel | FB Form → 60-min audit → Calendly |
| Instantly cold email | 🟢 LIVE | $0 (warmup) | ~3,940 leads / 10 active campaigns | Email → reply → audit → Calendly |
| ElevenLabs cold call | 🟢 LIVE | ~$1.75/call | DIAL_READY list | Sofia AI call → audit → Calendly |
| ManyChat WhatsApp/IG | 🟢 LIVE | $0 | Inbound only | Sofia AI → audit → Calendly |
| Brevo email (post-form nurture) | 🟢 LIVE | $0 | List 41 (FB Lead Form leads) | 5-email D+1/D+3/D+7/D+14/D+21 sequence |
| Google Ads | ⏸️ PAUSED | — | — | Billing flagged, fix pending |

---

## 📞 Meta FB Lead Form Campaign — Full Spec

- **Campaign:** Meta — Hiring Intent Retarget 2026-04-27 v1
- **Campaign ID:** `120241114978100662`
- **Objective:** OUTCOME_LEADS
- **Status:** 🟢 ACTIVE
- **Daily Budget:** $5 USD ($3 + $2)

### Ad sets

| Ad Set | Audience | Daily | Status | Purpose |
|---|---|---|---|---|
| AS-1 LF | JD_AllVerified_2238 (Custom Match) | $3/day | 🟢 ACTIVE | Cold-warm hiring intent retarget |
| AS-2 LF | JD_AuditPageVisitors_NoLead_30d (Pixel) | $2/day | 🟢 ACTIVE | Site visitors who didn't convert |
| AS-1 (Website fallback) | Same Custom Match | $3/day | ⚪ PAUSED | A/B fallback if Lead Form fails |
| AS-2 (Website fallback) | Same Pixel | $2/day | ⚪ PAUSED | A/B fallback if Lead Form fails |

### Lead Form

- **Form ID:** `942858358503290`
- **Name:** Auditoría JegoDigital — Inmobiliarias 2026-04
- **Locale:** es_LA
- **Quality optimization:** ON (filters junk fills)
- **Questions (5 total):**
  1. Email (pre-filled)
  2. URL del sitio web inmobiliario (text)
  3. Phone (pre-filled)
  4. ¿Cuántos leads/mes? (0-5 / 5-20 / 20-50 / 50+)
  5. ¿Qué te frustra más de tu marketing actual? (5 options)

---

## 👥 Custom Audiences — full inventory

| Audience | ID | Size | Source |
|---|---|---|---|
| `JD_AllVerified_2238` | 120241121768720662 | **2,238 verified** | 9 active Instantly campaigns + LinkedIn hiring + DIAL_READY |
| `JD_LinkedInHiring_46` | 120241121768800662 | 46 | Apify LinkedIn hiring-intent scraper |
| `JD_Engagement_Warm_58` | 120241121768810662 | 58 | Opened cold email but didn't reply |
| `JD_Engagement_Hot_7` | 120241121768920662 | 7 | Replied or clicked cold email |
| `JD_AuditPageVisitors_NoLead_30d` | 120241114556670662 | Pixel-based | Visited /auditoria-gratis 30d, didn't convert |
| `JD_Website_AllVisitors_180d` | 120241121735070662 | Pixel-based | Any jegodigital.com visit 180d |
| `JD_Website_HighIntentPages_90d` | 120241121735310662 | Pixel-based | /showcase, /casos, /servicios 90d |
| `JD_Website_PricingContact_90d` | 120241121735970662 | Pixel-based | /precio, /contacto, /calendly 90d |

**Total verified emails uploaded to Meta: 2,349 unique** (2,238 + 46 + 58 + 7 minus overlap)

---

## 📧 Brevo Email Pipeline — what fires when

### List 41 — FB Lead Form leads
- **Brevo list ID:** `41`
- **Name:** FB Lead Form — Hiring Intent 2026-04

### Templates (already built)

| ID | Name | Trigger | Subject |
|---|---|---|---|
| 71 | FB Welcome — Auditoría cocinándose | T+0 (instant on form fill) | ✅ {firstName}, tu auditoría llega en 60 min |
| — | Audit report HTML | T+45 min (auditPipeline) | (branded audit report) |
| 72 | FB Nurture D1 — Pregunta sobre auditoría | T+24h | una pregunta sobre tu auditoría |
| 73 | FB Nurture D3 — Flamingo case | T+72h | lo que flamingo hizo diferente |
| 74 | FB Nurture D7 — Idea Schema | T+168h | idea para {{COMPANY}} |
| 75 | FB Nurture D14 — ¿Hablamos 15 min? | T+336h | ¿hablamos 15 min? |
| 76 | FB Nurture D21 — Última, prometido | T+504h | última, prometido |

**Auto-cancel:** if lead books Calendly at any point, remaining sequence emails cancel automatically (`cancelTrackForEmail` in calendlyWebhook).

---

## 🔄 Lead Flow — what happens on every form fill

```
1. Meta FB Lead Form fill
   ↓ (instant Meta webhook)
2. metaLeadFormWebhook Cloud Function fires:
   ├─ Firestore meta_lead_events doc (audit log)
   ├─ Brevo contact created/updated in list 41 with 9 attributes
   ├─ Welcome email (template 71) → arrives in <30 sec
   ├─ 5-email nurture queued (D+1 / D+3 / D+7 / D+14 / D+21)
   ├─ Meta CAPI Lead event (server-side dedup)
   ├─ submitAuditRequest fires:
   │   ├─ Audit pipeline runs (Firecrawl + DataForSEO + Perplexity)
   │   ├─ Meta CAPI CompleteRegistration event
   │   └─ Audit email arrives ~45 min later
   ├─ Telegram ping → @AlexJegoBot
   └─ Slack ping → #leads-hot (mobile push ON)

3. If lead clicks Calendly link from any email → calendlyWebhook fires:
   ├─ Brevo lead temp = Hot, list = Booked
   ├─ Cancel remaining nurture sequence (no spam)
   ├─ Meta CAPI Schedule event ⭐ (the high-value signal)
   ├─ SMS reminders queued (24h + 1h before call)
   ├─ Telegram + Slack ping with briefing
   └─ Alex closes on the call
```

---

## 🔔 Notifications Alex receives

| Channel | Event | Detail |
|---|---|---|
| Telegram | Every Lead Form fill | Email, URL, WhatsApp, qualification answers, pipeline status |
| Slack #leads-hot | Every Lead Form fill | Same payload, mobile push ON |
| Telegram | Every Calendly booking | Name, date, pain points, briefing email |
| Telegram | Every cold call success | Sofia transcript + outcome |
| Telegram | Every Instantly positive reply | Email + reply text |

---

## 🧪 Meta Conversion API (CAPI) — events sent server-side

| Event | Trigger | Where wired | Value |
|---|---|---|---|
| `Lead` | Lead Form fill | metaLeadFormWebhook | $0 |
| `CompleteRegistration` | Audit pipeline starts | submitAuditRequest (FB-source only) | $0 |
| `Schedule` | Calendly booking | calendlyWebhook (invitee.created) | $50 USD |
| `Purchase` | Client signs proposal | TBD — manual or Notion CRM webhook | varies |

**After 7 days + 50+ Schedule events:** switch ad-set optimization from `LEAD_GENERATION` → `OFFSITE_CONVERSIONS` targeting Schedule. Expected: 15-30% CPL drop per Meta benchmarks.

---

## 🎯 KPI Targets — week 1-4

| Metric | Target | Warning | Kill |
|---|---|---|---|
| CTR (per ad) | ≥1.5% | 0.7-1.5% | <0.7% |
| CPC | <MX$15 | $15-30 | >$30 |
| Lead Form fill rate (% of clicks) | ≥10% | 5-10% | <5% |
| CPL | <MX$80 | $80-150 | >$150 |
| Welcome email open rate | ≥60% | <40% | <30% |
| Audit email open rate | ≥55% | <35% | <25% |
| Nurture email avg open rate | ≥30% | <18% | <12% |
| Nurture avg CTR | ≥5.58% | <2% | <1% |
| Nurture → Calendly book rate | ≥5% | <1.5% | <0.5% |
| Calendly show rate | ≥75% | 60-75% | <60% |
| Unsub rate | ≤0.5% | >2% | >5% |

---

## 🚨 Known Gaps & Next Moves

| # | Gap | Severity | Status |
|---|---|---|---|
| 1 | No FB CAPI for booking events | CRITICAL | ✅ FIXED 2026-04-28 |
| 2 | No welcome email (45-min silence) | CRITICAL | ✅ FIXED 2026-04-28 |
| 3 | Form questions never used | CRITICAL | ✅ FIXED 2026-04-28 |
| 4 | No nurture for non-bookers | HIGH | ✅ FIXED 2026-04-28 |
| 5 | Slack notifications missing | MEDIUM | ✅ FIXED 2026-04-28 |
| 6 | Audience overlap with cold email = ad fatigue | HIGH | ⏳ DATA-GATED — re-segment weekly |
| 7 | Creative monotony (1 video, only 4:5) | HIGH | ⏳ Build founder-led 15s Reel |
| 8 | No retargeting on form openers who abandoned | MEDIUM | ⏳ Build AS-3 after 14d data |
| 9 | Lookalike audience not built | MEDIUM | ⏳ DATA-GATED — needs 50+ conversions |
| 10 | LinkedIn hiring-intent CSV is small (46) | LOW | ⏳ Run Apify scraper monthly |

---

## 🛠️ Skills (the playbooks for re-running this)

| Skill | Path | Purpose |
|---|---|---|
| `meta-ads-jegodigital` | `docs/skills/meta-ads-jegodigital/SKILL.md` | The full FB Ads playbook — 19 sections, 444 lines, 11 cited research sources |
| `brevo-email-marketing` | `_imported_skills/brevo-email-marketing/SKILL.md` | Email nurture system, includes new section 8 on FB Lead Form sequence |
| `instantly-cold-outreach` | `_imported_skills/instantly-cold-outreach/SKILL.md` | Cold email operations |
| `cold-calling-ai` | `_imported_skills/cold-calling-ai/SKILL.md` | ElevenLabs voice agent |
| `manychat-jegodigital` | (plugin) | WhatsApp + Instagram inbound automation |

---

## 🔐 Tokens & Secrets (locations only — values in GitHub Secrets)

| Secret | Status | Location |
|---|---|---|
| FB_USER_TOKEN | NEVER expires (53 scopes) | GH Secrets + .env |
| FB_PAGE_ACCESS_TOKEN | NEVER expires | GH Secrets + .env |
| FB_APP_SECRET | Saved | GH Secrets + .secrets/ |
| META_LEAD_VERIFY_TOKEN | Generated | GH Secrets |
| META_LEAD_FORM_ID | 942858358503290 | GH Secrets |
| BREVO_API_KEY | Active | GH Secrets + .env |
| BREVO_HIRING_INTENT_FB_LIST_ID | 41 | GH Secrets |
| BREVO_FB_WELCOME_TEMPLATE_ID | 71 | GH Secrets |
| TELEGRAM_BOT_TOKEN | Active | GH Secrets |
| SLACK_BOT_TOKEN | Active | GH Secrets |

---

## 📅 Operating Cadence

**Daily (Alex):**
- Check Telegram + Slack #leads-hot for new leads
- Reply to any Calendly bookings within 1h
- Review yesterday's CPL in Meta Ads Manager

**Weekly (Monday — autonomous Claude):**
- HR-7 weekly revenue review (pulls from all 8 platforms)
- Re-run engagement segmenter — `python3 tools/fb_ads/build_clean_audiences.py`
- Pull Meta ad performance report — CPL, CTR, fills, Schedule events logged
- Update this doc with week's deltas

**Monthly (1st — autonomous Claude):**
- Refresh Custom Audience (Apify → Instantly → FB)
- Verify client proof numbers (HR-9)
- Brevo monthly newsletter to subscribed contacts
- Quarterly: re-run validated offer dossier

---

## 📝 Change Log

- **2026-04-28** — Phase 1.4 shipped: 5-email nurture sequence + Slack pings + this doc. Templates 72-76 created. enqueueFBNurture wired into webhook. Calendly cancel hook added. (commits 39b48140, 58c1e1ea, 1c4c8610, edb5f5b5)
- **2026-04-28** — Phase 1.3: Meta CAPI dispatcher built, 4 events wired (Lead/Reg/Schedule/Purchase)
- **2026-04-28** — Phase 1.2: cleaned audience to 2,238 verified (was 2,872 unverified). 4 superseded audiences deleted.
- **2026-04-28** — Phase 1.1: Brevo welcome template 71 + auto-fire on form fill
- **2026-04-28** — Long-lived USER + never-expiring PAGE token locked
- **2026-04-27** — Original campaign + 16 ads built. Meta TOS + scope walls cleared.
- **2026-04-27** — `meta-ads-jegodigital` skill built (19 sections from 4 research dossiers)

---

*Maintained by Claude AI sessions. If a number here disagrees with what's running live, the live data is right and this page is stale — re-fetch and update.*
