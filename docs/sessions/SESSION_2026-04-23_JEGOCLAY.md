# Session 2026-04-23 — JegoClay Signal Outbound Engine

> **Summary:** Built the foundation of a Clay-equivalent lead enrichment pipeline using JegoDigital's existing stack (Firecrawl + Hunter + PageSpeed + Gemini + Apify). Shipped engine v1 + v2 pain detector + email verifier module. First 390-lead run completed. Second run with v2 upgrades in progress.

---

## 📦 Deliverables shipped this session

### Code files (committed to `main`)

| File | Commit | Purpose |
|---|---|---|
| `tools/lead_enrichment_engine.py` | `b0fe79a6` → `e237f11a` → `3ad5f16e` | Main enrichment engine — ICP filter + Firecrawl + Hunter waterfall + PageSpeed + Gemini 2.5-flash Spanish opener |
| `tools/jegoclay/email_verifier.py` | `e237f11a` | **Module 1** — self-hosted NeverBounce replacement (DNS MX + SMTP handshake + disposable blocklist + role flagging) |
| `tools/jegoclay/tech_stack_detector.py` | `3ad5f16e` | **Module 2** — BuiltWith replacement (50+ tech signatures) + v2 pain detector (30+ signals across 9 categories) |
| `.github/workflows/enrich-leads.yml` | `e237f11a` | Reusable workflow — runs enrichment on ANY CSV via workflow_dispatch. Bypasses sandbox 45s limit. |
| `leads/input/vibe_390_2026-04-23.csv` + `vibe_45_2026-04-23.csv` | `e237f11a` | Source Vibe Prospecting lead lists (MX real estate decision-makers) |
| `website/functions/index.js` (patch) | `b0fe79a6` | HR-5 guard added to `submitAuditRequest` — blocks `info@` + "el dueño" fallback junk |
| `website/functions/genkit_agents/vision_auditor.js` + `website/api/chat.js` | `b0fe79a6` | Gemini 2.0 → 2.5 upgrade (404 fix) |

### Side-fixes shipped

- **Gemini 2.0 deprecation fix** — 3 files patched to gemini-2.5-flash
- **HR-5 guard** in `submitAuditRequest` — blocks generic inboxes + fallback names from wasting audit compute
- **3 test audit docs purged** from Firestore (clean up after verification testing)

---

## 🧪 First run results (v1, commit `e237f11a`, run `24867299229`)

**Input:** 391 MX real estate leads from Vibe Prospecting (mostly LinkedIn-sourced, no emails/phones/pain data)
**Duration:** 18 minutes on GitHub Actions runner

### Yield

```
Total processed:     391
ICP passed:          238 (61%)
ICP rejected:        153
  title_not_dm:      104
  industry_not_re:    34
  firecrawl_failed:   15
```

### Signal score distribution (passed leads)

```
80-89:  90 ⭐ (gold tier)
70-79:  38
60-69:  43
50-59:  28
40-49:  23
<40:    16
```

**128 leads scored ≥70 = high-priority for immediate outreach.**

### Enrichment coverage

| Field | v1 hit rate |
|---|---|
| Personalized Spanish opener | 100% (238/238) |
| PageSpeed mobile score | 81% (193/238) |
| Phone number (from Firecrawl) | 89% (212/238) — **MX: 159, USA: 29** |
| WhatsApp link | 18% (43/238) |
| Email (Hunter) | **0% (0/238)** — BUG found |
| Unique companies | 136 distinct |

### Diversity audit (honest)

- 58% of openers mention WhatsApp (because 100% of sites lack a WA button — v1 detector over-indexed on this one pain)
- 42% of openers hit other angles (PageSpeed, LCP, contact form, etc.)
- Opener length: min 105 / avg 211 / max 519 chars — no truncation
- Tone: natural Mexican Spanish, references real observable data per lead

---

## 🔧 Known gaps + v2/v3 roadmap

### v2 (commit `3ad5f16e`, run `24868359785` — in progress)

| Fix | Expected improvement |
|---|---|
| v2 pain detector (30+ signals across 9 categories) | Opener diversity 42% → ~80% unique angles |
| Hunter waterfall (URL-encoded + threshold 25 + pattern fallback) | Email hit rate 0% → ~65% |
| Tech stack detection (50+ signatures) | Unlocks `{{tech_stack}}` variable for Gemini |

### v3 (next sessions — ranked by ROI)

**Must-have before full Instantly campaign launch:**
1. Tighten industry filter — block accounting/legal/consulting firms even if site mentions RE clients (4 CPA leads snuck through v1)
2. Apify scraper fallback when Firecrawl fails (15 sites timed out — recoverable with different engine)
3. Deep `/contacto` page scrape for passed leads without phone (50 leads missing)

**Should-have:**
4. Expand Spanish DM title list — catch "subdirector", "gerente comercial", "socio director", "encargado de marketing"
5. Google Maps review aggregation — rating + count per company (trust signal)
6. Listing count scrape — RE-specific, detects inventory health

**Nice-to-have:**
7. LinkedIn recent posts via Apify — reference their own content
8. Competitive SERP analysis via DataForSEO
9. Meta Ad Library scrape — detect active ad spend

---

## 🏗️ Architecture (as of end of session)

```
                     ┌──────────────────────────┐
                     │  Your phone (Slack app)  │
                     └────────────┬─────────────┘
                                  │ triggers
                                  ▼
              ┌────────────────────────────────┐
              │  GitHub Actions workflow       │
              │  enrich-leads.yml              │
              │  (workflow_dispatch, 60min cap)│
              └───────────────┬────────────────┘
                              │ runs
                              ▼
         ┌─────────────────────────────────────────┐
         │  tools/lead_enrichment_engine.py        │
         │  ├─ ICP filter (title + industry)       │
         │  ├─ Firecrawl scrape                    │
         │  ├─ Hunter email waterfall (3-tier)     │
         │  ├─ PageSpeed mobile CWV                │
         │  ├─ JegoClay Module 1 (email verifier)  │  [shipped, not yet wired into pipeline]
         │  ├─ JegoClay Module 2 (pain detector)   │  [shipped, wired in v2]
         │  └─ Gemini 2.5-flash Spanish opener     │
         └────────────────┬────────────────────────┘
                          │ outputs
                          ▼
                  ┌──────────────────┐
                  │  Enriched CSV +   │
                  │  JSON artifact    │
                  └────────┬─────────┘
                           │ downloaded + imported (next session)
                           ▼
    ┌──────────┬──────────────┬──────────────┐
    │ Instantly│  Notion      │  Slack DM    │
    │ campaign │  Leads CRM   │  summary     │
    │ MX + USA │  (mirror)    │  (top 20)    │
    └──────────┴──────────────┴──────────────┘
```

---

## 💰 Cost of a full 390-lead enrichment run

| API | Calls | Est. cost |
|---|---|---|
| Firecrawl | 252 scrapes (passed title filter) | Covered by plan |
| Hunter.io | 238 finder + up to 3 domain-search fallbacks | ~2K/mo plan — free within limit |
| PageSpeed (Google) | 238 mobile checks | Free |
| Gemini 2.5-flash | 238 × ~2K tokens | ~$3 |
| GitHub Actions runner | 18 min | Free (within 2000 min/mo) |
| **Total** | | **~$3-5** |

Clay equivalent cost: $149-349/mo fixed. **This beats Clay on unit economics by 50x.**

---

## 🧭 Next session plan

1. Wait for v2 run to complete (ETA ~18 min from 2026-04-24 02:00 UTC)
2. Download v2 artifact, diff against v1 — validate diversity + email fixes
3. Tighten industry filter based on v1 gaps (block CPA firms)
4. Segment enriched leads: MX (+52) → Spanish campaign, USA (+1) → English campaign
5. Create 2 Instantly campaigns with custom variables per lead
6. Write campaign templates using `{{personalized_opener}}` + `{{top_pain_detail}}`
7. Set both to DRAFT for Alex's approval
8. Build `dailyRevenueTasks` Cloud Function (8am Slack DM)
9. Build `slackWebhookRouter` Cloud Function (button actions → execute)

---

## ✅ Definition of "done" for Signal Outbound Engine

- [x] Engine handles ANY CSV input (tested on 391 leads)
- [x] Runs autonomously on GitHub Actions (no sandbox limits)
- [x] Rejects non-DM titles + non-RE industries
- [x] Generates unique Spanish opener per lead
- [ ] Achieves ≥60% email hit rate (v2 run pending)
- [ ] Achieves ≥80% opener diversity (v2 run pending)
- [ ] Uploads to Instantly with custom variables — NEXT SESSION
- [ ] Packaged as reusable skill `signal-outbound-engine` — NEXT SESSION
- [ ] Packaged as client-facing skill `leadforge-client-pipeline` — FUTURE SESSION

---

*End of session log. All code committed to `main` via GitHub Git Data API. Next session opens on v2 results + Instantly campaign setup.*
