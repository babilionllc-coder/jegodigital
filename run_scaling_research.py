#!/usr/bin/env python3
"""
Deep research on scaling lead-discovery for Audit_Trojan_MX_v1.
Hits Perplexity sonar-pro with 3 focused queries, saves raw + synthesis.

Questions Alex needs answered before committing capital/time:
  Q1 — Best lead-mining infrastructure for MX real estate (Apify Google Maps vs SerpAPI vs DataForSEO): volume ceiling, cost per 1k leads, reliability in 2026.
  Q2 — Instagram vs LinkedIn for MX INDEPENDENT real estate agency owner coverage: which platform actually has these people, enrichment hit rates, ToS risk.
  Q3 — Alternative providers Alex may not be considering (Clay, Apollo, Explorium, Phantombuster, Smartlead, Lemlist native enrichment).
"""
import os, json, sys, time, requests, pathlib

ROOT = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital")
OUT = ROOT / "scaling_strategy_research.md"
RAW = ROOT / "scaling_strategy_research_raw.json"

# Load key from functions/.env
env_path = ROOT / "website/functions/.env"
KEY = None
for line in env_path.read_text().splitlines():
    if line.startswith("PERPLEXITY_API_KEY="):
        KEY = line.split("=", 1)[1].strip()
        break
if not KEY:
    sys.exit("❌ PERPLEXITY_API_KEY not found")

API = "https://api.perplexity.ai/chat/completions"
HDR = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

QUERIES = [
    {
        "id": "Q1_lead_mining_infra",
        "title": "Apify Google Maps Scraper vs SerpAPI vs DataForSEO for 2026 real estate lead mining",
        "prompt": (
            "I run a cold-email agency targeting independent real estate brokerages in Mexico "
            "(Cancún, Playa del Carmen, Tulum, CDMX, GDL, Monterrey). I need to mine ~2,000 "
            "unique agency websites per month from Google Maps listings, then enrich with "
            "Hunter.io and PageSpeed audits. "
            "\n\n"
            "Compare these THREE lead-mining infrastructures as of April 2026, with HARD NUMBERS "
            "and citations where possible:\n"
            "1. Apify Google Maps Scraper (compass/crawler-google-places)\n"
            "2. SerpAPI Google Maps endpoint\n"
            "3. DataForSEO Business Data - Google My Business listings\n\n"
            "For each, tell me:\n"
            "- Volume ceiling per query (SerpAPI caps Maps at ~20/query — is that still true?)\n"
            "- Cost per 1,000 business listings scraped (be specific on pricing tier)\n"
            "- Data quality: do they return website URL, phone, address, category reliably?\n"
            "- Reliability/uptime in 2025-2026 (ban rate, Google blocking)\n"
            "- ToS risk and legal grey zones\n"
            "- Best use case fit for Mexico-specific local business mining\n\n"
            "Finally: which is best for my specific use case (2,000 MX real estate leads/month, "
            "$500/mo budget max)? Be opinionated."
        ),
    },
    {
        "id": "Q2_instagram_vs_linkedin",
        "title": "Instagram vs LinkedIn coverage of Mexican independent real estate agency owners",
        "prompt": (
            "Independent real estate brokers/small agency owners in Mexico (not enterprise, not "
            "Remax/Century21 — think 2–10-agent local agencies in Cancún, Tulum, Playa del Carmen, "
            "CDMX, GDL, Monterrey). "
            "\n\n"
            "Which social platform do THEY actually use as their primary professional presence: "
            "Instagram or LinkedIn? Give me real data, not assumptions:\n"
            "- Mexico social media penetration by platform (LATAM vs US contrast)\n"
            "- Specifically in real estate / small business owner demographic\n"
            "- Where they post property listings, where they post personal professional content\n"
            "- Email-in-bio rates: what % of Mexican real estate Instagram accounts have email in bio vs LinkedIn profiles having email visible/findable\n"
            "- LinkedIn adoption among Spanish-speaking LATAM SMB owners in 2026\n\n"
            "Then cover the SCRAPING LAYER:\n"
            "- Current ToS and enforcement: LinkedIn has sued scrapers (hiQ v. LinkedIn Supreme Court) — what is LinkedIn's enforcement stance in 2026? Do Apify/Phantombuster/Bright Data LinkedIn actors currently work or get killed fast?\n"
            "- Apify apify/instagram-scraper — reliability, IG blocks, hit rate on bio emails in 2026\n"
            "- Realistic enriched-email hit rate from IG bios on MX real estate accounts (% of accounts with extractable business email)\n\n"
            "Bottom line: for cold email prospecting of MX real estate agency OWNERS, should I "
            "enrich from Instagram bios or LinkedIn profiles? Pick one and defend it."
        ),
    },
    {
        "id": "Q3_alternatives",
        "title": "Alternative prospecting/enrichment platforms for B2B cold email in 2026",
        "prompt": (
            "I'm using this stack for cold email prospecting of Mexican real estate agencies: "
            "SerpAPI (Google Maps discovery) + Hunter.io (email finder/verifier) + Instantly.ai "
            "(sending). Total cost ~$300/mo. "
            "\n\n"
            "What am I missing? Tell me about these platforms as of April 2026 — specifically "
            "how they compare for LATAM / Mexico SMB prospecting (not US Enterprise):\n\n"
            "1. Clay.com — real pricing 2026, LATAM data quality, is the hype warranted, what's the gotcha?\n"
            "2. Apollo.io — does their database cover MX independent real estate at all?\n"
            "3. Explorium.ai — enrichment-only, LATAM coverage, bilingual?\n"
            "4. Phantombuster — Instagram + LinkedIn scraping combined, still viable 2026?\n"
            "5. Smartlead.ai — is it a better Instantly alternative for volume?\n"
            "6. Lemlist native enrichment — worth switching sender platform?\n"
            "7. Findymail / Datagma / Prospeo — Hunter alternatives with better MX coverage?\n"
            "8. Any 2025-2026 emerging tools specifically strong for LATAM B2B local business prospecting?\n\n"
            "Rank the top 3 that would MEANINGFULLY improve a MX real estate cold email stack. "
            "Include approximate cost delta and expected lift."
        ),
    },
]

def query(prompt: str) -> dict:
    """Call Perplexity sonar-pro with a single prompt. Returns parsed JSON."""
    payload = {
        "model": "sonar-pro",
        "messages": [
            {"role": "system", "content": "You are a research analyst. Always cite sources, give hard numbers over vibes, and be opinionated in recommendations. Avoid hedging. If data is thin or contested, say so explicitly."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 4000,
    }
    r = requests.post(API, headers=HDR, json=payload, timeout=180)
    if r.status_code != 200:
        print(f"  ❌ HTTP {r.status_code}: {r.text[:400]}", file=sys.stderr)
        return {"error": r.text[:400], "status": r.status_code}
    return r.json()

def main():
    results = []
    for q in QUERIES:
        print(f"→ Running {q['id']}: {q['title'][:70]}...")
        t0 = time.time()
        resp = query(q["prompt"])
        dt = time.time() - t0
        if "error" in resp:
            print(f"  failed in {dt:.1f}s")
            results.append({"query": q, "response": resp, "duration_s": dt})
            continue
        content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        citations = resp.get("citations") or resp.get("search_results") or []
        print(f"  ✓ {len(content)} chars, {len(citations)} citations, {dt:.1f}s")
        results.append({
            "query": q,
            "content": content,
            "citations": citations,
            "usage": resp.get("usage"),
            "duration_s": dt,
        })
        time.sleep(2)

    # Save raw
    RAW.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\n✓ Raw → {RAW}")

    # Build markdown report
    md = ["# Scaling Strategy Research — Perplexity Deep Dive",
          f"\n**Date:** 2026-04-18  |  **Model:** sonar-pro  |  **Queries:** {len(QUERIES)}\n",
          "\nAlex asked for validated recommendations before committing to Apify. This is the "
          "Perplexity deep research with real citations. Raw JSON at `scaling_strategy_research_raw.json`.\n",
          "\n---\n"]

    for i, r in enumerate(results, 1):
        q = r["query"]
        md.append(f"\n## {i}. {q['title']}\n")
        md.append(f"**Query ID:** `{q['id']}`\n")
        if "error" in r.get("response", {}):
            md.append(f"\n⚠️ **Query failed:** {r['response']['error']}\n")
            continue
        md.append("\n### Findings\n")
        md.append(r["content"])
        md.append("\n\n### Citations\n")
        cits = r.get("citations", [])
        if not cits:
            md.append("_No external citations returned._\n")
        else:
            for j, c in enumerate(cits, 1):
                if isinstance(c, str):
                    md.append(f"{j}. {c}")
                elif isinstance(c, dict):
                    url = c.get("url") or c.get("link") or ""
                    title = c.get("title") or c.get("name") or url
                    md.append(f"{j}. [{title}]({url})")
        md.append("\n\n---\n")

    OUT.write_text("\n".join(md))
    print(f"✓ Report → {OUT}")
    print(f"\nTotal tokens: {sum((r.get('usage') or {}).get('total_tokens', 0) for r in results)}")

if __name__ == "__main__":
    main()
