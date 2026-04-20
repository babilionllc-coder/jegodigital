#!/usr/bin/env python3
"""
Cold-Call Lead Finder — dual-purpose (phone + email) prospector.

Builds enriched leads for:
  • ElevenLabs Offer B cold calling (uses phone + website_url + enrichment)
  • Instantly.ai email fallback (uses email + enrichment)

Pipeline per city:
  1. DataForSEO Maps discovery (returns phone + rating + reviews natively)
  2. Blocklist filter + domain extract
  3. Firecrawl homepage scrape → activeListings, hasWhatsAppWidget, primaryCity
  4. Hunter.io email finder + verifier (required — Offer B emails audit report)
  5. Owner-gate (real first names, director-level titles)
  6. PSI audit → pageSpeedMobile (optional, --psi flag)
  7. CSV export + optional Instantly upload

Output:
  /mnt/jegodigital/leads/cold_call_{city_slug}_{date}.csv

Usage:
  python3 cold_call_lead_finder.py \\
    --cities "Cancun,Playa del Carmen" \\
    --limit 80 \\
    --psi \\
    [--upload-campaign <instantly_campaign_id>]
"""
from __future__ import annotations
import argparse, csv, datetime as dt, json, os, re, sys, time
from pathlib import Path

# Reuse the v4_lean helpers (fixed paths already applied)
sys.path.insert(0, "/sessions/determined-modest-wright/mnt/jegodigital")
from lead_finder_v4_lean import (
    KEYS, slog, extract_domain, is_blocked, is_real_name, title_qualifies,
    dfs_maps, hunter_domain_search, hunter_verify, pick_best_contact,
    psi_audit, find_main_issue, score_lead, instantly_add_lead,
)
import requests

LEADS_DIR = Path("/sessions/determined-modest-wright/mnt/jegodigital/leads")
LEADS_DIR.mkdir(parents=True, exist_ok=True)

CSV_FIELDS = [
    "first_name", "last_name", "email", "email_status",
    "phone", "company", "position", "website",
    "city", "primary_city",
    "google_rating", "google_review_count",
    "active_listings", "has_whatsapp_widget",
    "page_speed_mobile", "main_issue",
    "score", "passed_gate",
    "discovery_query", "notes",
]

# Firecrawl v2 scrape endpoint
FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape"

# City name → (DFS location_name, slug)
# IMPORTANT: DFS Maps requires "City,State,Mexico" format — "City,Mexico" alone returns 0 results.
CITY_MAP = {
    # Riviera Maya / Quintana Roo
    "cancun":            ("Cancun,Quintana Roo,Mexico",            "cancun"),
    "cancún":            ("Cancun,Quintana Roo,Mexico",            "cancun"),
    "playa del carmen":  ("Playa del Carmen,Quintana Roo,Mexico",  "playa"),
    "playa":             ("Playa del Carmen,Quintana Roo,Mexico",  "playa"),
    "tulum":             ("Tulum,Quintana Roo,Mexico",             "tulum"),
    "cozumel":           ("Cozumel,Quintana Roo,Mexico",           "cozumel"),
    "puerto morelos":    ("Puerto Morelos,Quintana Roo,Mexico",    "puerto_morelos"),
    # Yucatán
    "merida":            ("Merida,Yucatan,Mexico",                 "merida"),
    "mérida":            ("Merida,Yucatan,Mexico",                 "merida"),
    # Nuevo León
    "monterrey":         ("Monterrey,Nuevo Leon,Mexico",           "monterrey"),
    "san pedro":         ("San Pedro Garza Garcia,Nuevo Leon,Mexico", "san_pedro"),
    # Jalisco
    "guadalajara":       ("Guadalajara,Jalisco,Mexico",            "guadalajara"),
    "gdl":               ("Guadalajara,Jalisco,Mexico",            "guadalajara"),
    "puerto vallarta":   ("Puerto Vallarta,Jalisco,Mexico",        "puerto_vallarta"),
    "zapopan":           ("Zapopan,Jalisco,Mexico",                "zapopan"),
    # CDMX + Estado de México
    "mexico city":       ("Mexico City,Mexico City,Mexico",        "cdmx"),
    "cdmx":              ("Mexico City,Mexico City,Mexico",        "cdmx"),
    "ciudad de mexico":  ("Mexico City,Mexico City,Mexico",        "cdmx"),
    "polanco":           ("Mexico City,Mexico City,Mexico",        "polanco"),
    # Querétaro
    "queretaro":         ("Queretaro,Queretaro,Mexico",            "queretaro"),
    "querétaro":         ("Queretaro,Queretaro,Mexico",            "queretaro"),
    # Baja California Sur (Los Cabos = luxury)
    "los cabos":         ("Cabo San Lucas,Baja California Sur,Mexico", "los_cabos"),
    "cabo san lucas":    ("Cabo San Lucas,Baja California Sur,Mexico", "los_cabos"),
    "san jose del cabo": ("San Jose del Cabo,Baja California Sur,Mexico", "san_jose_cabo"),
    # Puebla / León / Morelia / Oaxaca
    "puebla":            ("Puebla,Puebla,Mexico",                  "puebla"),
    "leon":              ("Leon,Guanajuato,Mexico",                "leon"),
    "león":              ("Leon,Guanajuato,Mexico",                "leon"),
    "morelia":           ("Morelia,Michoacan,Mexico",              "morelia"),
    "oaxaca":            ("Oaxaca,Oaxaca,Mexico",                  "oaxaca"),
    "san miguel":        ("San Miguel de Allende,Guanajuato,Mexico", "san_miguel"),
    # Baja California Norte
    "tijuana":           ("Tijuana,Baja California,Mexico",        "tijuana"),
    "ensenada":          ("Ensenada,Baja California,Mexico",       "ensenada"),
}

MX_CITY_RE = re.compile(
    r"\b(Canc[uú]n|Playa del Carmen|Tulum|Cozumel|Puerto Morelos|Mexico City|CDMX|"
    r"Monterrey|Guadalajara|Puebla|M[eé]rida|Quer[eé]taro|San Miguel|Puerto Vallarta|"
    r"Los Cabos|Oaxaca|San Luis Potos[ií]|Morelia|Le[oó]n|Tijuana|Ensenada)\b",
    re.IGNORECASE,
)


# -------------------- Firecrawl enrichment --------------------

def firecrawl_scrape(url: str) -> dict:
    """Scrape homepage. Returns {'html': ..., 'markdown': ...} or {} on failure."""
    if not url.startswith("http"):
        url = "https://" + url
    try:
        r = requests.post(
            FIRECRAWL_URL,
            headers={"Authorization": f"Bearer {KEYS['firecrawl']}", "Content-Type": "application/json"},
            json={"url": url, "formats": ["html", "markdown"], "onlyMainContent": False, "timeout": 20000},
            timeout=45,
        )
        if r.status_code != 200:
            return {}
        return (r.json() or {}).get("data", {}) or {}
    except Exception as e:
        slog(f"    ⚠ Firecrawl {url}: {e}")
        return {}


def extract_enrichment(scrape: dict) -> dict:
    """Pull voice-friendly signals from Firecrawl scrape."""
    html = (scrape.get("html") or "") + " " + (scrape.get("markdown") or "")
    if not html:
        return {
            "active_listings": "",
            "has_whatsapp_widget": False,
            "primary_city": "",
        }

    # active_listings: count of property/listing/propiedad cards (rough)
    listing_hits = len(re.findall(
        r'(?i)(?:class="[^"]*(?:property|listing|propiedad|casa|depto|departamento)-(?:card|item))',
        html,
    ))
    # Fallback: count MLS-like id patterns or "Ver detalles" buttons
    if listing_hits < 3:
        detail_btns = len(re.findall(r'(?i)(?:ver detalles|view details|more info)', html))
        listing_hits = max(listing_hits, detail_btns)
    active_listings = listing_hits if listing_hits > 0 else ""

    # has_whatsapp_widget: wa.me link or api.whatsapp.com/send
    has_wa = bool(re.search(r'(?i)(?:wa\.me/|api\.whatsapp\.com/send|href="whatsapp:)', html))

    # primary_city: first MX city mention (prefer footer/contact — but body-wide is fine)
    city_m = MX_CITY_RE.search(html)
    primary_city = city_m.group(0).strip() if city_m else ""

    return {
        "active_listings": active_listings,
        "has_whatsapp_widget": has_wa,
        "primary_city": primary_city,
    }


# -------------------- Orchestrator --------------------

def process_city(city: str, niche: str, limit: int, do_psi: bool, upload_campaign: str | None) -> list[dict]:
    city_key = city.lower().strip()
    if city_key not in CITY_MAP:
        slog(f"❌ [{city}] NOT IN CITY_MAP — DFS Maps requires 'City,State,Mexico' format.")
        slog(f"   Add this city to CITY_MAP in cold_call_lead_finder.py and retry.")
        return []
    location, slug = CITY_MAP[city_key]
    query = f"{niche} en {city}"
    slog(f"🔍 [{city}] DFS Maps: {query} @ {location}")

    raw = dfs_maps(query, location, limit=limit)
    slog(f"   Found {len(raw)} raw results")

    seen_domains = set()
    out = []
    for r in raw:
        title = (r.get("title") or "").strip()
        website = r.get("website") or ""
        phone = r.get("phone") or ""
        rating = r.get("rating")
        # DFS sometimes returns full rating dict, sometimes scalar — v4_lean normalizes to scalar
        review_count = None
        if isinstance(r.get("rating"), dict):
            review_count = r["rating"].get("votes_count")

        domain = extract_domain(website)
        if not domain or is_blocked(domain):
            slog(f"  ⊘ BLOCKED: {domain or title}")
            continue
        if domain in seen_domains:
            continue
        seen_domains.add(domain)

        slog(f"  → {title} | {domain} | ☎ {phone or '—'}")

        # Hunter (required — we need email for the audit delivery)
        hd = hunter_domain_search(domain)
        contact = pick_best_contact(hd)
        if not contact:
            slog(f"    ⊘ no owner-title contact")
            continue

        status = hunter_verify(contact["email"])
        if status == "undeliverable":
            slog(f"    ⊘ undeliverable: {contact['email']}")
            continue

        # Firecrawl enrichment
        scrape = firecrawl_scrape(domain)
        enrich = extract_enrichment(scrape)

        # PSI (optional — slow, 30-60s per call)
        audit = {}
        if do_psi:
            audit = psi_audit(domain)
        issue = find_main_issue(audit) if audit else ""

        lead = {
            **contact,
            "company": title,
            "website": domain,
            "phone": phone,
            "city": city,
            "primary_city": enrich["primary_city"] or city,
            "country": "MX",
            "email_status": status,
            "google_rating": rating if not isinstance(rating, dict) else rating.get("value"),
            "google_review_count": review_count,
            "active_listings": enrich["active_listings"],
            "has_whatsapp_widget": enrich["has_whatsapp_widget"],
            "page_speed_mobile": audit.get("score", "") if audit else "",
            "main_issue": issue,
            "audit": audit,
            "notes": f"DFS Maps | {query}",
            "discovery_query": query,
        }
        lead["score"] = score_lead(lead)
        lead["passed"] = lead["score"] >= 60

        mark = "✅" if lead["passed"] else "✗"
        slog(f"    {mark} {contact['first_name']} {contact.get('last_name','')} · score={lead['score']} · ⭐{lead.get('google_rating') or '—'} · 🏘{enrich['active_listings'] or '—'} · WA={'Y' if enrich['has_whatsapp_widget'] else 'N'}")

        # Optional Instantly upload (email fallback path)
        if lead["passed"] and upload_campaign:
            try:
                up = instantly_add_lead(upload_campaign, lead)
                lead["instantly_status"] = up["status"]
                slog(f"       → Instantly {up['status']}")
            except Exception as e:
                slog(f"       ⚠ Instantly upload failed: {e}")

        out.append(lead)
        time.sleep(0.4)  # courtesy rate limit

    return out


def write_csv(leads: list[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        w.writeheader()
        for l in leads:
            w.writerow({
                "first_name": l.get("first_name", ""),
                "last_name": l.get("last_name", ""),
                "email": l.get("email", ""),
                "email_status": l.get("email_status", ""),
                "phone": l.get("phone", ""),
                "company": l.get("company", ""),
                "position": l.get("position", ""),
                "website": l.get("website", ""),
                "city": l.get("city", ""),
                "primary_city": l.get("primary_city", ""),
                "google_rating": l.get("google_rating", ""),
                "google_review_count": l.get("google_review_count", ""),
                "active_listings": l.get("active_listings", ""),
                "has_whatsapp_widget": "Y" if l.get("has_whatsapp_widget") else "N",
                "page_speed_mobile": l.get("page_speed_mobile", ""),
                "main_issue": l.get("main_issue", ""),
                "score": l.get("score", 0),
                "passed_gate": "Y" if l.get("passed") else "N",
                "discovery_query": l.get("discovery_query", ""),
                "notes": l.get("notes", ""),
            })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", required=True, help="Comma-separated cities, e.g. 'Cancun,Playa del Carmen'")
    ap.add_argument("--niche", default="inmobiliaria")
    ap.add_argument("--limit", type=int, default=40, help="Results per city")
    ap.add_argument("--psi", action="store_true", help="Run PSI audit (slow: ~30s/lead)")
    ap.add_argument("--upload-campaign", default=None, help="Instantly campaign ID to upload passed leads to")
    ap.add_argument("--out", default=None, help="Override CSV output path")
    args = ap.parse_args()

    cities = [c.strip() for c in args.cities.split(",") if c.strip()]
    slog(f"▶ Cold-Call Lead Finder · cities={cities} · niche={args.niche} · limit={args.limit}/city · psi={args.psi}")
    if not args.upload_campaign:
        slog("  ℹ No --upload-campaign: CSV only, no Instantly upload.")

    all_leads: list[dict] = []
    for c in cities:
        all_leads.extend(process_city(c, args.niche, args.limit, args.psi, args.upload_campaign))

    if args.out:
        out_path = Path(args.out)
    else:
        slug = "_".join(re.sub(r"[^a-z]", "", c.lower()) for c in cities) or "run"
        out_path = LEADS_DIR / f"cold_call_{slug}_{dt.date.today().isoformat()}.csv"
    write_csv(all_leads, out_path)

    passed = [l for l in all_leads if l.get("passed")]
    with_phone = [l for l in all_leads if l.get("phone")]
    with_phone_and_email = [l for l in passed if l.get("phone")]

    slog("─" * 60)
    slog(f"✓ Total processed: {len(all_leads)}")
    slog(f"  With phone:           {len(with_phone)}")
    slog(f"  Passed gate (≥60):    {len(passed)}")
    slog(f"  Dial-ready (phone+gate): {len(with_phone_and_email)}")
    slog(f"  CSV: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
