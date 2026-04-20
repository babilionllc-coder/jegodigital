#!/usr/bin/env python3
"""
Supersearch enrichment TEST — limit=50 against MX real estate owners.

Plan:
  1. Create a fresh lead list so we don't collide with existing campaign dedup.
  2. Call /enrich-leads-from-supersearch with limit=50.
  3. Report counts + sample + credit usage.

If free-tier credits are insufficient, we'll see the error and stop.
"""
import json, sys, time, pathlib, requests

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

OUT_DIR = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/supersearch_out")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Saved filter from prior session — verified working via count + preview
SEARCH_FILTERS = {
    "title": {"include": [
        "Owner", "Director", "Founder", "CEO",
        "Broker", "Real Estate Broker",
        "President", "Managing Director",
    ]},
    "locations": [{"country": "Mexico"}],
    "subIndustry": {"include": ["Real Estate"]},
}

TEST_LIMIT = 50


def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def create_list(name: str) -> str | None:
    """Create a fresh lead list; return its ID."""
    r = requests.post(f"{API}/lead-lists", headers=H, json={"name": name}, timeout=30)
    log(f"POST /lead-lists → {r.status_code}")
    if r.status_code in (200, 201):
        data = r.json()
        lid = data.get("id")
        log(f"  list id: {lid}")
        return lid
    log(f"  body: {r.text[:400]}")
    return None


def enrich(list_id: str) -> dict:
    """Run supersearch enrichment into the list."""
    payload = {
        "search_filters": SEARCH_FILTERS,
        "skip_owned_leads": False,
        "show_one_lead_per_company": True,
        "work_email_enrichment": True,
        "fully_enriched_profile": True,
        "email_verification": True,
        "limit": TEST_LIMIT,
        "autofill": False,
        "resource_id": list_id,
        "resource_type": 1,  # 1 = lead list per Instantly convention; 2 = campaign
    }
    log(f"POST /supersearch-enrichment/enrich-leads-from-supersearch  limit={TEST_LIMIT}")
    r = requests.post(
        f"{API}/supersearch-enrichment/enrich-leads-from-supersearch",
        headers=H, json=payload, timeout=120,
    )
    log(f"  → {r.status_code}")
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:1000]}
    if r.status_code not in (200, 201):
        log(f"  ERROR body: {json.dumps(body)[:600]}")
    return {"status": r.status_code, "body": body}


def main():
    list_name = f"Supersearch_MX_RE_Test_{time.strftime('%Y%m%d_%H%M')}"
    lid = create_list(list_name)
    if not lid:
        log("❌ Could not create list. Aborting.")
        sys.exit(1)

    result = enrich(lid)
    (OUT_DIR / "enrich_response.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    log(f"✓ saved → {OUT_DIR / 'enrich_response.json'}")

    # Poll the list for a bit to see leads land
    log("Polling list for enriched leads...")
    for i in range(6):
        time.sleep(5)
        lr = requests.post(
            f"{API}/leads/list",
            headers=H,
            json={"list_id": lid, "limit": 5},
            timeout=30,
        )
        if lr.status_code == 200:
            items = lr.json().get("items", [])
            log(f"  tick {i+1}: list has {len(items)} leads visible (showing up to 5)")
            if items:
                for lead in items[:3]:
                    log(f"    - {lead.get('first_name','?')} {lead.get('last_name','')} | {lead.get('email','(no email)')} | {lead.get('company_name','')}")
                break
        else:
            log(f"  tick {i+1}: leads/list → {lr.status_code} {lr.text[:150]}")

    log(f"\nList ID: {lid}  |  List Name: {list_name}")
    log("Done. Check Instantly UI → Leads → this list to see final enriched rows.")


if __name__ == "__main__":
    main()
