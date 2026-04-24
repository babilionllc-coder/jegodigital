#!/usr/bin/env python3
"""Deep research on Instantly.ai's 2025-2026 capabilities via Perplexity + Firecrawl."""
import os, json, urllib.request, urllib.error, sys

PERPLEXITY_KEY = os.environ.get("PERPLEXITY_API_KEY","")
FIRECRAWL_KEY  = os.environ.get("FIRECRAWL_API_KEY","")

def http_json(url, method="GET", headers=None, body=None, timeout=60):
    headers = headers or {}
    data = json.dumps(body).encode() if body is not None else None
    if body is not None: headers.setdefault("Content-Type","application/json")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:    return e.code, json.loads(e.read())
        except: return e.code, {"error": e.read().decode()[:300]}
    except Exception as e:
        return 0, {"error": str(e)[:200]}

# ---------- Perplexity research ----------
QUERY = """Research Instantly.ai's current 2025-2026 capabilities in detail. Cite sources.

1. LEAD ENRICHMENT: What data sources do they use now? Apollo-like? Clay-like waterfall? How much do enrichment credits cost per lead? What fields do they enrich (email, phone, LinkedIn, tech stack, firmographics)? Do they offer website scraping or pain detection?

2. AI EMAIL PERSONALIZATION: Does Instantly support TRUE per-lead unique openers (each recipient gets a COMPLETELY different first paragraph, not just first_name swap)? Can Instantly AI read custom variables and generate 1:1 copy? What is Instantly AI Copilot actually capable of in 2026?

3. CUSTOM VARIABLES in templates: Any limits on how many custom fields can be referenced? Can variables hold long text like a full paragraph? Do they support conditional logic (if X then Y)?

4. AI REPLY AGENT / UNIBOX AI: What does it actually do in 2026? Can it auto-reply with personalized offers? Does it classify replies? Does it route to Calendly automatically?

5. NEW 2026 FEATURES: Lead Magic? AI-written sequences from a single prompt? Intent data integration? Anything added in late 2025 or 2026?

6. EXTERNAL ENRICHMENT INTEGRATION: Webhooks? Custom fields from external APIs? Can Instantly ingest enriched leads from Clay, Firecrawl, or custom pipelines?

Give the HONEST picture — what Instantly CAN do natively vs what still requires external tools. Pricing where available."""

print("=" * 70)
print("DEEP RESEARCH — Instantly.ai 2025-2026 capabilities")
print("=" * 70)

if not PERPLEXITY_KEY:
    print("ERROR: PERPLEXITY_API_KEY not set")
    sys.exit(1)

status, data = http_json(
    "https://api.perplexity.ai/chat/completions",
    method="POST",
    headers={"Authorization": f"Bearer {PERPLEXITY_KEY}"},
    body={
        "model": "sonar-pro",
        "messages": [{"role": "user", "content": QUERY}],
        "max_tokens": 2800,
    },
    timeout=60,
)

if status != 200:
    print(f"Perplexity error {status}: {data}")
    sys.exit(1)

content = data.get("choices", [{}])[0].get("message", {}).get("content", "(no content)")
print(content)

print("\n" + "=" * 70)
print("CITATIONS")
print("=" * 70)
for i, c in enumerate(data.get("citations", [])[:12], 1):
    print(f"{i:2d}. {c}")

# Save full response for reference
out = "/tmp/instantly_research.json"
with open(out, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print(f"\n(full response saved to {out})")
