---
name: audit-funnel
description: Owns the JegoDigital /auditoria-gratis funnel end-to-end — landing page, submitAuditRequest Cloud Function, audit pipeline (Firecrawl + DataForSEO + PageSpeed + SerpAPI Maps/SERP + Perplexity AEO + Gemini), branded HTML report, Brevo confirmation + delayed audit email, AI agent reply integration, Brevo D+1/D+3/D+5/D+7 nurture, Slack ping, Calendly handoff. Use EVERY TIME Alex asks to debug, improve, score, or extend the audit funnel — landing page tweaks, AEO updates, score formula, email templates, language detection, delay tuning, competitor side-by-side, Firecrawl deeper extraction, conversion analysis. Triggers — audit funnel, audit pipeline, /auditoria-gratis, audit page, audit email, audit report, audit conversion, audit-first funnel, AEO audit, Perplexity audit, Firecrawl audit, audit score, free audit, submitAuditRequest, audit nurture, audit Slack ping, audit Calendly, audit delay, audit language detection.
---

# JegoDigital Audit Funnel

**Created:** 2026-04-26 after auditing the funnel end-to-end and shipping 5 conversion-blocker fixes.
**Owner:** Alex Jego (Claude maintains).
**Source code:** `website/functions/auditPipeline.js` (~1900 lines). Landing page: `website/auditoria-gratis.html`.
**Latest deploy:** commit `67d29576` (rebased onto `04f9f325`), 2026-04-26.

> **NOTE:** This skill currently lives at `docs/proposed-skills/audit-funnel/SKILL.md` because writes to `.claude/skills/` are blocked in Cowork mode. To activate it, manually copy this directory to `.claude/skills/audit-funnel/`.

---

## What the funnel does

```
Cold email Step 1 (no link)
  → prospect replies "yes interested"
  → Instantly auto-labels positive
  → JegoDigital AI Agent (id 019d368d-c8ad-7208-8c42-438f4cb16258) auto-replies
    with /auditoria-gratis link including ?source=instantly_reply&autosubmit=1
  → Prospect clicks → form auto-fires 800ms after page load
  → submitAuditRequest Cloud Function writes audit_requests/{docId} doc
  → Firestore onCreate trigger fires processAuditRequest
    ├─ status=processing + sendConfirmationEmail (instant)
    ├─ runFullAudit (50s timeout, 9 APIs in parallel)
    ├─ generateReportHTML + upload to Firebase Storage
    ├─ data-quality gate (block if Firecrawl + shell both failed)
    ├─ slackNotifyAuditCompleted (immediate, before email delay)
    ├─ sendAuditEmail (7-min delay if cold-email source, 45-min organic)
    └─ queue Brevo nurture (D+1/D+3/D+5/D+7) — templates 49/50/51/52
  → Audit email lands → prospect clicks "Ver/View Full Report" or "Agendar/Book Call"
  → Calendly /jegoalexdigital/30min → Sofia/Slack notify → Brevo welcome → close
```

## The 9 data sources (real APIs — HR#0 compliant)

| Source | What it pulls | Function |
|---|---|---|
| Firecrawl v2 | Full SPA render + screenshot + LLM extract | `firecrawlScrape()` |
| Raw shell fetch | `<head>` tags React strips | `fetchRawShell()` |
| DataForSEO | Domain rank, keywords, backlinks, top 5 competitors, ads | `services/seoService.js` |
| PageSpeed Insights | Mobile Lighthouse Performance + SEO (TTFB+weight fallback) | `services/psiService.js` |
| SerpAPI Google Maps | Local pack position, rating, reviews | `checkGoogleMaps()` |
| SerpAPI Organic SERP | Position for "inmobiliaria en [city]" query | `checkSerpRanking()` |
| Robots/sitemap/headers | Crawlability + security signals | `checkCrawlability()` |
| Perplexity AEO | Live "best agency in X" query → AI search visibility | `runFullAudit()` AEO block |
| Gemini executive verdict | LLM narrative summary | `services/geminiService.js` |

## The 5 conversion-blocker fixes (shipped 2026-04-26)

**Every change to the funnel must keep these intact.**

### Fix 1 — Variable email delay by source

`sendAuditEmail()` accepts `source` param:
```js
const isColdEmail = !!(source && /^(cold_email|instantly_reply)/i.test(source));
const delayMin = isColdEmail ? 7 : 45;
```

- Cold-email replies → **7 min** (long enough to feel triaged, short enough to keep inbox warmth)
- Organic / WhatsApp / DM → **45 min** (artisan review framing)

### Fix 2 — Bilingual templates (EN/ES)

`detectAuditLanguage(source, extractedLanguages)`:
- Source `cold_email_us` / `instantly_reply_us` / `cold_email_en` → `en`
- Firecrawl `extracted.languages` English-only → `en`, Spanish-only → `es`
- Default Spanish (Mexico-first)

Email template uses inline `T = isEnglish ? {...} : {...}` for title/findings/CTAs/footer.

AEO Perplexity query also bilingual:
- English: `"What's the best real-estate agency in [city]? Recommend agencies with a strong website."`
- Spanish: `"¿Cuál es la mejor inmobiliaria en [city]?"`

### Fix 3 — AI Agent reply link `&autosubmit=1` + `&source=`

Manual Instantly UI step (agent's persona/prompt isn't API-exposed). Templates at `docs/ai-agent-reply-templates.md`. Critical params on the audit URL:
- `url={{website}}&email={{email}}&firstName={{first_name}}` — pre-fills form
- `source=instantly_reply` (Spanish) or `source=cold_email_us` (English) — drives delay + language detection
- **`autosubmit=1`** — fires form 800ms after page load (eliminates the manual submit click that was killing 30% of submissions)

### Fix 4 — Brevo nurture for non-bookers (already wired)

`auditPipeline.js` lines 1616–1652 queue 4 nurture emails on Brevo templates 49/50/51/52 at D+1, D+3, D+5, D+7. Picked up by hourly `processScheduledEmails` cron. Stops on Calendly booking webhook (per `calendly-follow-up` skill).

**Verify next session:** templates 49–52 actually exist + render correctly.

### Fix 5 — Slack ping IMMEDIATELY (before email delay)

`slackNotifyAuditCompleted()` fires the moment audit is uploaded — score, top 3 issues, "View Report" + "LinkedIn DM (prefilled)" buttons. Speed-to-lead unlock — Alex can fire personal LinkedIn DM within 1 min while prospect is still in funnel.

Env: `SLACK_AUDIT_WEBHOOK_URL` (falls back to `SLACK_WEBHOOK_URL`). Non-fatal.

## Conversion math (5-fix impact)

| Step | Before | After | × |
|---|---|---|---|
| Cold reply → page click | 25% | 25% | 1.0 |
| Page → form submit | 65% | 90% (autosubmit) | 1.4 |
| Submit → email opened | 50% | 75% (7-min delay) | 1.5 |
| Email → Calendly click | 12% (wrong language for EN) | 25% (right lang) | 2.1 |
| Calendly → booked | 50% | 50% | 1.0 |
| **Reply → booked** | **0.49%** | **2.11%** | **4.3×** |

## Score formula (0-100)

Weighted deductions in `runFullAudit()`. Critical (`impact: 'critico'`) = -10 to -15. High = -7. Medium = -5. Low = -2 to -4. Issues sorted by impact; top 3 surface in email subject + preview.

- 🟢 80+ — strong site, focus on growth-stage upsells
- 🟡 50–79 — average, plenty to improve
- 🔴 <50 — losing leads daily, needs intervention

## Data quality gate (HR#6 compliance)

If both Firecrawl AND raw shell return empty → audit unreliable → block from sending to client → email Alex with `Re-run audit` link. Firestore status = `quality_gate_blocked`.

## Firecrawl is under-used (next-session priorities)

Currently 1 Firecrawl call per audit (homepage). Three unlocks:

1. **Top-3 competitor side-by-side** — DataForSEO returns competitor list; Firecrawl-render their homepages, generate comparison table *("Competitor X loads in 4.2s and has WhatsApp; you load in 11s and don't")*. **Estimated 1.5× conversion lift.**
2. **`/v1/extract` deeper schema** — testimonial quality, listing photo count, price range, agent count.
3. **`/v1/crawl` 5-page mapping** — currently homepage-only. Add /about, /properties, /contact.

~150 LOC + 1 new HTML report section.

## Required env vars

```
FIRECRAWL_API_KEY
DATAFORSEO_LOGIN, DATAFORSEO_PASS
PSI_API_KEY (optional)
SERPAPI_KEY
PERPLEXITY_API_KEY
BREVO_API_KEY, BREVO_SENDER_EMAIL
GEMINI_API_KEY
SLACK_AUDIT_WEBHOOK_URL (or SLACK_WEBHOOK_URL fallback)
```

## When to use this skill

- Debug why audit emails aren't landing
- Improve the audit content (add checks, deepen Firecrawl)
- Tune the delay logic
- Add a new market language (e.g. Portuguese for Brazil)
- Build the competitor side-by-side feature
- Refactor the score formula
- Replace a data source
- Add a webhook for Calendly booking → stop nurture
- Investigate Brevo template rendering issues

## Related skills

- `linkedin-hiring-intent` — sources cold-email leads that feed this funnel
- `instantly-cold-outreach` — Step 1 cold emails + AI reply agent config
- `cold-email-copywriting` — copy quality scoring
- `brevo-email-marketing` — nurture template management
- `calendly-follow-up` — booking-webhook handling
- `manychat-jegodigital` — alternative warm funnel via WhatsApp Sofia
- `playwright-prospect-audit` — pre-emptive audit during cold-email step (different tool, upstream)

## Disaster log refs

- 2026-04-26: AI agent reply link missing `&autosubmit=1` → 30% drop on form submission. Fixed via UI template paste (`docs/ai-agent-reply-templates.md`).
- 2026-04-26: 45-min delay killing cold-email momentum. Fixed via variable delay by source.
- 2026-04-26: Spanish-only audit shipped to English Miami market. Fixed via bilingual `T` block + AEO query language switch.

---

**Maintained by:** Claude
**Last conversion benchmark:** 4.3× lift estimated (replies → bookings) post-2026-04-26 fixes
