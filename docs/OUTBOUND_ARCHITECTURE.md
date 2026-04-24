# JegoDigital Outbound Architecture (research-backed, 2026-04-24)

> Official JegoDigital outbound stack. Validated via Perplexity deep research against Instantly.ai's own 2026 documentation. This is the canonical pattern.

## The division of labor

| Layer | Tool | Role |
|---|---|---|
| **Source** | Vibe Prospecting + Apify | MX real estate decision-maker CSV lists |
| **Enrichment (brains)** | **JegoClay** (our pipeline) | Per-lead website pain analysis + Spanish opener generation. This is what Instantly CANNOT do natively (confirmed by their own blog). |
| **Delivery (muscle)** | **Instantly.ai** | Sending, warmup, A/B, reply detection, AI Copilot follow-ups |
| **Tracking** | Notion 🎯 Leads CRM | Mirror enriched leads + status pipeline |
| **Action command center** | Slack (your phone) | Morning DM + interactive buttons → fire outreach |

## The integration

1. JegoClay GitHub Actions enriches any CSV (Firecrawl + Hunter waterfall + PageSpeed + tech stack detector + Gemini 2.5 Spanish opener)
2. Enriched leads pushed to Instantly via API V2 (real-time, no manual CSV)
3. Custom variables per lead: `{{personalized_opener}}`, `{{top_pain}}`, `{{pain_detail}}`, `{{signal_score}}`, `{{tech_stack}}`
4. Instantly "Verify leads" enabled on ingest (native SMTP deliverability check)
5. Instantly AI Copilot drafts follow-up emails 2-5 using our custom vars as context
6. AI Reply Agent classifies replies, handles 80% autonomously, human-in-the-loop for edge cases
7. Positive replies route to Slack + Calendly handoff

## v2 validated performance (run 24868359785)

- 391 leads → 235 passed (60% ICP yield)
- 166 emails via 3-tier Hunter waterfall (70% hit rate)
- 210 phones via Firecrawl scrape (89% hit rate)
- 25 unique pain types detected per lead (avg 12 pains each)
- 131 tech stacks detected
- 11% of openers mention WhatsApp (vs 58% in v1 — diversity achieved)

## Cost per 390-lead run

~$3-5 USD all-in (Firecrawl plan + Hunter within plan + Gemini ~$3 + free GitHub runner).
Clay equivalent: $149-349/mo. 50x unit-economics advantage.

## Citations

1. https://instantly.ai/blog/instantly-clay-ai-powered-lead-enrichment-personalization/ — Instantly's OWN blog validates external-enrichment pattern
2. https://instantly.ai/blog/lead-generation-software/ — 2026 AI Copilot + Reply Agent capabilities
3. Full Perplexity research saved at tools/research_instantly.py (re-runnable)
