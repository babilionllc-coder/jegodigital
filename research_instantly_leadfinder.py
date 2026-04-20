#!/usr/bin/env python3
"""Research Instantly Lead Finder coverage for MX real estate via Perplexity."""
import requests, pathlib

env = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/website/functions/.env").read_text()
KEY = [l.split("=",1)[1].strip() for l in env.splitlines() if l.startswith("PERPLEXITY_API_KEY=")][0]

prompt = """I'm evaluating Instantly.ai's "Lead Finder" feature (also called Lead Database) as of April 2026 for cold email prospecting of Mexican INDEPENDENT real estate agency owners (2-10 agent agencies in Cancún, Tulum, Playa del Carmen, CDMX, Guadalajara, Monterrey — NOT enterprise like Remax/Century21/CBRE).

Answer these specific questions with real data and citations:

1. What is Instantly Lead Finder? What data providers does it source from (Apollo-like? Native DB? Data partnership with Explorium/ZoomInfo?)? Is it a B2B contact database or a Google Maps scraper?

2. Current pricing in 2026 — is it included in the $97/mo Growth plan, or is it a paid add-on with credits? How many contacts per dollar?

3. Coverage quality for LATAM / Mexico SMB / independent real estate specifically. Does it actually return Mexican inmobiliaria owners with real first names and verified emails? Or is it US-Enterprise heavy like Apollo?

4. What filters are available (title, location, industry, company size, verified email)? Can I filter for Mexico + real estate + owner-title + verified-email in one query?

5. Can it auto-enroll found leads directly into a campaign, or do I still need to CSV-import?

6. Real user reviews as of 2025-2026 on MX coverage specifically — or LATAM B2B coverage if MX-specific data is thin.

7. How does it compare to Apollo, Clay, or Datagma for this exact use case (MX independent real estate agency owners)?

Be blunt about limitations. If it's a US/enterprise-only tool and doesn't work for MX SMBs, say so. If user reports are thin for LATAM, say so."""

r = requests.post(
    "https://api.perplexity.ai/chat/completions",
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    json={
        "model": "sonar-pro",
        "messages": [
            {"role":"system","content":"Research analyst. Cite everything. Hard numbers over vibes. Be blunt about gaps."},
            {"role":"user","content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 3000,
    },
    timeout=120,
)
data = r.json()
content = data.get("choices",[{}])[0].get("message",{}).get("content","")
cits = data.get("citations") or data.get("search_results") or []

# Build citation lines without f-string backslashes
cit_lines = []
for i, c in enumerate(cits, 1):
    if isinstance(c, str):
        cit_lines.append(f"{i}. {c}")
    elif isinstance(c, dict):
        url = c.get("url") or c.get("link") or ""
        title = c.get("title") or c.get("name") or url
        cit_lines.append(f"{i}. [{title}]({url})")

out = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/instantly_lead_finder_research.md")
out.write_text(
    "# Instantly Lead Finder — MX Real Estate Coverage Research\n\n"
    "**Date:** 2026-04-18 | **Model:** sonar-pro\n\n---\n\n"
    + content
    + "\n\n---\n\n## Citations\n\n"
    + "\n".join(cit_lines)
)
print(f"✓ {out}")
print(f"  {len(content)} chars, {len(cits)} citations")
