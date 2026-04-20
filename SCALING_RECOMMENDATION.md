# Scaling Strategy — Honest Recommendation

**Date:** 2026-04-18 | **Asked:** Alex | **Answered by:** Claude (after Perplexity deep research)

---

## TL;DR — What The Research Actually Proved

I ran three Perplexity `sonar-pro` queries with 13 citations between them. Being blunt: **the research was thinner than I hoped for.** Here's what it actually tells us vs. what it speculates:

| Question | Outcome | Confidence |
|---|---|---|
| **Q1** — Apify vs SerpAPI vs DataForSEO comparison | ❌ **Failed.** Perplexity returned unrelated real estate CRM articles. Zero usable data on scraping infra pricing/volume/reliability. | Low |
| **Q2** — Instagram vs LinkedIn for MX real estate owners | ⚠️ **Directional.** Explicitly flagged "no Mexico-specific 2026 data" — conclusions inferred from US agent data. Directionally says IG > LinkedIn. | Medium |
| **Q3** — Alternative prospecting platforms | ⚠️ **Partial.** Returned specific numbers (Clay $149/mo, Datagma 95% MX hit rate) BUT citations are mostly SerpAPI docs that don't match the claims. Treat numbers as unverified. | Low-Medium |

**Verdict:** I cannot give you validated-with-hard-data recommendations from this research alone. What I CAN give you is a framework + a small-money pilot plan that turns unknowns into knowns cheaply. That's what the rest of this doc does.

---

## What I'm Reasonably Confident About (from research + first-hand Audit_Trojan_MX_v1 data)

### 1. Volume bottleneck is REAL and the fix is NOT a single source.
Your v4 pipeline running 105 raw candidates across 6 cities produced 23 passing the gate = **22% pass rate**. Then dedup killed 12 of those = **~50% dedup loss** because those domains are in other workspace campaigns.

To hit 200 enrolled leads you need:
```
200 enrolled ÷ 0.50 (dedup) ÷ 0.22 (pass rate) = ~1,820 raw candidates
```

SerpAPI Maps hard-caps around 20 results per query. To pull 1,820 raw from SerpAPI you need ~90 unique `(city, niche)` queries — which means expanding far beyond 6 cities OR rotating niche terms (`inmobiliaria`, `bienes raíces`, `corredor inmobiliario`, `desarrolladora`).

**This is source-layer math, not tool-choice magic.** Apify helps, but so does just running more SerpAPI queries.

### 2. Instagram beats LinkedIn for MX independent agency owners — probably.
Every credible signal says Latin American SMBs live on Instagram, not LinkedIn. LinkedIn in MX real estate skews to Remax/Century21/CBRE corporate employees — exactly the enterprise crowd our blocklist filters OUT. Cross-ref the research says:
- US real estate agent Instagram adoption: 57% vs LinkedIn 55% (US data)
- LATAM SMB skew is heavier to IG (research's explicit direction, thin data)
- LinkedIn post-hiQ enforcement is aggressive; scrapers die fast
- IG scrapers are more reliable but also get blocked at scale

**But the IG bio email hit rate Perplexity gave (40-60%) is an estimate, not measured.** Only way to know MX real estate IG bio extraction rate is to pull 200 accounts and count.

### 3. The "Hunter alternatives" pitch is worth a look but needs verification.
Datagma at $49/mo with "95% MX verification" is a claim, not a proven number. But Hunter's MX coverage IS weak on my own data (Monica @ propiedadescancun.mx only surfaced because I dropped the seniority filter; many small MX domains return zero). A pilot-swap test with Datagma on 50 domains would settle it for under $50.

### 4. Smartlead vs Instantly is not the right fight right now.
Your pain is **not** deliverability or volume ceiling on the sender — you're only sending 60 emails/day on 8 accounts. Instantly can do 400+/day if you warm more accounts. Switching senders solves a problem you don't have yet.

---

## What The Research Can't Tell You (and neither can I without more data)

1. **Actual Apify `compass/crawler-google-places` cost per 1k MX listings.** Apify's real pricing is in their console, not this research. Need to pull an actor run to measure.
2. **Actual IG-bio email extraction rate on Mexican real estate accounts.** The 40-60% figure is Perplexity guessing. Only a real scrape proves it.
3. **Clay.com's real coverage of MX independent agencies.** The "70-80% hit rate per user benchmarks" has no cited user benchmark attached.
4. **Whether `apify/instagram-scraper` is currently alive or throttled-to-death.** No 2026 ground truth in the research.

---

## My Recommendation: The $30 Diagnostic Pilot (NOT the full commit)

Instead of buying Apify + IG + Clay + Datagma all at once, spend ~$30 this week answering the unknowns. Then scale with confidence.

### Pilot Plan (one week, <$30)

**Day 1 — Prove or kill Apify Google Maps Scraper**
- Pay-as-you-go Apify trial gives $5 free credit
- Run `compass/crawler-google-places` against 5 MX cities we haven't hit yet (Mérida, Puebla, Querétaro, San Luis Potosí, Tijuana) with query `inmobiliaria`
- **Measure:** raw listing count, website-field fill rate, run cost
- **Decision gate:** If Apify pulls >300 unique domains for <$2, add it as a discovery source in v4. If not, kill it.

**Day 2 — Run a bigger SerpAPI batch on NEW cities**
- 8 new cities × 2 niches (`inmobiliaria`, `corredor inmobiliario`) = ~16 queries × 20 = **~320 raw candidates**
- At current 22% pass rate → ~70 passing → ~35 enrolled (after dedup)
- **Cost:** ~$5 SerpAPI + ~$5 Hunter + ~$3 PSI = **~$13**
- **This alone gets you ~35-40 more leads.** Combined with Apify possibly 80+ more.

**Day 3 — Test Datagma as Hunter swap-in**
- Sign up for Datagma free trial (50 credits)
- Run same 50 MX domains through both Hunter and Datagma
- **Measure:** which finds more real first-name contacts, which verifies more
- **Decision gate:** If Datagma beats Hunter by >20% on MX specifically, add it as a second enrichment source (not a swap — stack both).

**Day 4 — Test IG bio scraping on 100 MX agency handles**
- Use `apify/instagram-scraper` (first 100 profiles free on pay-as-you-go)
- Feed it IG handles from Sheet-enrolled agencies + fresh SerpAPI discovery
- **Measure:** % of bios with extractable email, % with phone
- **Decision gate:** If >30% yield email, bake IG into the pipeline as a tertiary enrichment. If <30%, skip IG permanently.

**Day 5 — Synthesize + commit**
- Pick the winners from days 1-4
- Update `lead_finder_v4_lean.py` with validated additions
- Run a 500-candidate batch targeting 200 enrolled

### Hard "Don't Do Yet" List
- ❌ **Don't pay for Clay.com yet** — $149/mo is real money and research didn't validate MX coverage. Wait until you hit 100+ enrolled/month and then reconsider.
- ❌ **Don't touch LinkedIn scraping.** Ban risk is real, target audience skews enterprise (wrong for us), and the research consensus (thin as it is) points away from it.
- ❌ **Don't switch from Instantly to Smartlead.** Solves a non-problem.
- ❌ **Don't build US-Hispanic campaign expansion yet** — finish MX first.

---

## Comparison: What each path costs and yields (best estimates, flag as estimates)

| Path | Weekly Cost | Extra Enrolled Leads | Risk |
|---|---|---|---|
| **A. Do nothing, run current v4 against 5 new MX cities** | ~$15 | +35–50 | Low |
| **B. Pilot (this doc) + commit to winners** | ~$30 | +80–150 | Low |
| **C. Full-commit Apify + IG + Clay + Datagma all at once** | ~$250/mo | +200–300 (speculative) | Medium — untested on MX |
| **D. LinkedIn pivot** | ~$100 + ban risk | +??? (research says unlikely to work for our ICP) | High |

**I recommend Path B.** It's the cheapest way to turn this research's speculation into measured reality, and it's additive to the existing v4 pipeline — no throwing work away.

---

## One thing I should have done sooner

Before today's Perplexity research, I should have just **run the bigger SerpAPI batch first.** 320 fresh raw candidates across 8 new MX cities would have gotten you ~35 more enrolled leads for $13, and we'd be discussing the volume ceiling from a position of 45+ enrolled instead of 11. That's on me.

I can kick off that batch right now (Path A) while you evaluate this doc, and we lose nothing by doing it in parallel with the pilot.

---

## Files

- `scaling_strategy_research.md` — full Perplexity output (this was the research)
- `scaling_strategy_research_raw.json` — raw JSON (for audit)
- `run_scaling_research.py` — the script, re-runnable with different queries
- `SCALING_RECOMMENDATION.md` — this synthesis (the deliverable)

---

## What I'm asking you to decide

1. **Go with Path B (pilot)?** Yes / No / Modify
2. **In parallel, kick off Path A (more SerpAPI cities for +35 leads by tomorrow)?** Yes / No
3. **Any path you want me to pursue that I dismissed?** (happy to defend or reverse)
