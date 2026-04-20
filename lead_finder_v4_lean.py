#!/usr/bin/env python3
"""
Lead Finder v4 (lean) — single-file pipeline for JegoDigital.

Flow per lead:
  1. SerpAPI Maps discovery by city + niche
  2. Domain extract + blocklist filter
  3. Hunter.io email finder + verifier
  4. Owner-title gate (Iron Rule 7: real first names, director-level titles)
  5. PageSpeed audit (single-call per domain, fast)
  6. Score 0-100 → pass gate if >=60
  7. Stream row to Google Sheet
  8. Upload to Instantly campaign

Env/Keys read from:
  /sessions/exciting-charming-hamilton/mnt/jegodigital/website/functions/.env
  /sessions/exciting-charming-hamilton/mnt/.claude/skills/lead-finder/references/api-credentials.md

Usage:
  python3 lead_finder_v4_lean.py --city "Cancun" --limit 20 --campaign <id> --sheet <sheet-id>
"""
from __future__ import annotations
import argparse, json, os, re, sys, time, datetime as dt
from pathlib import Path
import requests

ROOT = Path("/sessions/determined-modest-wright/mnt/jegodigital")
ENV_PATH = ROOT / "website/functions/.env"
SA_JSON = ROOT / "jegodigital-e02fb-a05ae4cb7645.json"
CRED_MD = Path("/sessions/determined-modest-wright/mnt/.claude/skills/lead-finder/references/api-credentials.md")

# ---------- Key loading ----------

def _load_env(path: Path) -> dict:
    out = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out

def _load_cred_md(path: Path) -> dict:
    text = path.read_text() if path.exists() else ""
    def pick(label):
        m = re.search(rf"{re.escape(label)}[^`]*`([^`]+)`", text)
        return m.group(1) if m else ""
    return {
        "instantly": pick("Instantly.ai") or pick("Key:"),
        "serpapi":   pick("SerpAPI"),
        "hunter":    pick("Hunter.io"),
        "firecrawl": pick("Firecrawl"),
        "perplexity": pick("Perplexity"),
    }

ENV = _load_env(ENV_PATH)
MD = _load_cred_md(CRED_MD)

KEYS = {
    "instantly":  "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg==",
    "serpapi":    ENV.get("SERPAPI_KEY", ""),
    "hunter":     ENV.get("HUNTER_API_KEY", ""),
    "psi":        ENV.get("PSI_API_KEY", ""),
    "firecrawl":  ENV.get("FIRECRAWL_API_KEY", ""),
    "perplexity": ENV.get("PERPLEXITY_API_KEY", ""),
    "dfs_login":  ENV.get("DATAFORSEO_LOGIN", ""),
    "dfs_pass":   ENV.get("DATAFORSEO_PASS", ""),
}

# ---------- Blocklists ----------

# Enterprise portals & non-agency domains we never touch
ENTERPRISE_DOMAINS = {
    "cbre.com", "colliers.com", "jll.com", "nmrk.com", "kwmexico.mx",
    "cbcmexico.mx", "cushwake.com", "remax.net", "remax.com", "century21.com",
    "century21global.com", "coldwellbanker.com", "inmuebles24.com", "vivanuncios.com.mx",
    "propiedades.com", "metroscubicos.com", "casasyterrenos.com", "lamudi.com.mx",
    "trovit.com.mx", "mercadolibre.com.mx", "airbnb.com", "booking.com",
    "expedia.com", "vrbo.com", "trivago.com", "hotels.com", "tripadvisor.com",
    "zillow.com", "realtor.com", "redfin.com", "facebook.com", "instagram.com",
    "linktr.ee", "bio.link", "wixsite.com", "squarespace.com", "godaddysites.com",
    "blogspot.com", "wordpress.com", "tumblr.com", "linkedin.com",
}

FAKE_FIRST_NAMES = {"info", "contact", "admin", "sales", "marketing", "hello",
                    "hola", "ventas", "ventas1", "support", "soporte", "noreply",
                    "no-reply", "mail", "email", "webmaster", "team", "office",
                    "gerencia", "recepcion", "rh", "reception", "test", "user",
                    "account", "billing", "contacto"}

TITLE_WHITELIST = [
    "founder", "ceo", "owner", "director", "directora", "gerente",
    "manager", "presidente", "president", "co-founder", "cofounder",
    "dueño", "propietario", "socio", "partner", "lead", "head",
    "brokerage", "broker", "agente principal", "principal",
]

# ---------- Utilities ----------

def slog(msg: str) -> None:
    ts = dt.datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def extract_domain(url: str) -> str:
    if not url:
        return ""
    url = url.strip().lower()
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^www\.", "", url)
    return url.split("/")[0].split("?")[0]

def is_blocked(domain: str) -> bool:
    if not domain:
        return True
    for bad in ENTERPRISE_DOMAINS:
        if domain == bad or domain.endswith("." + bad):
            return True
    return False

def is_real_name(first: str) -> bool:
    if not first:
        return False
    first = first.strip().lower()
    if len(first) < 2 or len(first) > 20:
        return False
    if first in FAKE_FIRST_NAMES:
        return False
    if not re.match(r"^[a-záéíóúüñ]+(-[a-záéíóúüñ]+)?$", first):
        return False
    return True

def title_qualifies(title: str) -> bool:
    if not title:
        return False
    t = title.lower()
    return any(kw in t for kw in TITLE_WHITELIST)

# ---------- Discovery ----------

def serpapi_maps(query: str, location: str, limit: int = 20) -> list[dict]:
    """SerpAPI Google Maps search."""
    r = requests.get("https://serpapi.com/search.json", params={
        "engine": "google_maps",
        "q": query,
        "ll": location,  # @lat,lng,zoom format or leave empty
        "type": "search",
        "hl": "es",
        "api_key": KEYS["serpapi"],
    }, timeout=30)
    if r.status_code != 200:
        slog(f"SerpAPI error {r.status_code}: {r.text[:150]}")
        return []
    data = r.json()
    return (data.get("local_results") or [])[:limit]

def dfs_maps(query: str, location: str, limit: int = 20) -> list[dict]:
    """DataForSEO Maps fallback."""
    import base64
    auth = base64.b64encode(
        f"{KEYS['dfs_login']}:{KEYS['dfs_pass']}".encode()
    ).decode()
    payload = [{
        "keyword": query,
        "location_name": location,
        "language_code": "es",
        "depth": limit,
    }]
    r = requests.post(
        "https://api.dataforseo.com/v3/serp/google/maps/live/advanced",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
        json=payload, timeout=60,
    )
    if r.status_code != 200:
        slog(f"DataForSEO error {r.status_code}")
        return []
    try:
        items = r.json()["tasks"][0]["result"][0].get("items", [])
    except Exception:
        return []
    out = []
    for it in items[:limit]:
        out.append({
            "title": it.get("title"),
            "website": it.get("url") or it.get("domain"),
            "phone": it.get("phone"),
            "address": it.get("address"),
            "rating": it.get("rating", {}).get("value") if isinstance(it.get("rating"), dict) else None,
        })
    return out

# ---------- Hunter enrichment ----------

def hunter_domain_search(domain: str) -> dict:
    # No seniority/type filter — small MX domains have few contacts; we gate in code.
    r = requests.get("https://api.hunter.io/v2/domain-search", params={
        "domain": domain, "api_key": KEYS["hunter"], "limit": 25,
    }, timeout=30)
    if r.status_code != 200:
        return {"emails": []}
    return r.json().get("data", {}) or {}

def hunter_verify(email: str) -> str:
    """Return one of: deliverable, risky, undeliverable, unknown."""
    r = requests.get("https://api.hunter.io/v2/email-verifier", params={
        "email": email, "api_key": KEYS["hunter"],
    }, timeout=30)
    if r.status_code != 200:
        return "unknown"
    res = (r.json().get("data") or {}).get("result") or "unknown"
    return res

def pick_best_contact(domain_data: dict) -> dict | None:
    """Rank contacts by: owner-title first, then any real-name contact."""
    emails = domain_data.get("emails", []) or []
    tier_owner = []
    tier_realname = []
    for e in emails:
        first = (e.get("first_name") or "").strip()
        last = (e.get("last_name") or "").strip()
        title = (e.get("position") or "").strip()
        if not is_real_name(first):
            continue
        entry = {
            "first_name": first.title(),
            "last_name": last.title() if last else "",
            "email": e.get("value"),
            "position": title,
            "confidence": e.get("confidence") or 0,
            "linkedin": e.get("linkedin"),
        }
        if title_qualifies(title):
            tier_owner.append(entry)
        else:
            tier_realname.append(entry)
    # Sort each tier by Hunter confidence desc
    tier_owner.sort(key=lambda x: x["confidence"], reverse=True)
    tier_realname.sort(key=lambda x: x["confidence"], reverse=True)
    if tier_owner:
        return tier_owner[0]
    if tier_realname:
        return tier_realname[0]
    return None

# ---------- PageSpeed audit ----------

def psi_audit(url: str) -> dict:
    if not url.startswith("http"):
        url = "https://" + url
    try:
        r = requests.get(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
            params={
                "url": url, "key": KEYS["psi"],
                "strategy": "mobile",
                "category": ["performance", "seo"],
            }, timeout=60,
        )
        if r.status_code != 200:
            return {"score": 0, "load_time": None, "error": f"HTTP {r.status_code}"}
        d = r.json()
        perf = d["lighthouseResult"]["categories"]["performance"]["score"]
        seo = d["lighthouseResult"]["categories"]["seo"]["score"]
        lcp = d["lighthouseResult"]["audits"].get("largest-contentful-paint", {}).get("numericValue", 0) / 1000
        fcp = d["lighthouseResult"]["audits"].get("first-contentful-paint", {}).get("numericValue", 0) / 1000
        return {
            "score": int(perf * 100) if perf is not None else 0,
            "seo_score": int(seo * 100) if seo is not None else 0,
            "lcp_sec": round(lcp, 1),
            "fcp_sec": round(fcp, 1),
            "load_time": round(lcp + fcp, 1),
        }
    except Exception as e:
        return {"score": 0, "error": str(e)[:120]}

# ---------- Main audit (issue extraction) ----------

def find_main_issue(audit: dict) -> str:
    score = audit.get("score") or 0
    lcp = audit.get("lcp_sec") or 0
    if score == 0:
        return "Sitio no accesible o bloqueado"
    if score < 30:
        return f"PageSpeed crítico ({score}/100) — pierdes ~60% de visitantes"
    if lcp > 4:
        return f"Tiempo de carga lento ({lcp}s) — 40% de visitantes abandonan"
    if score < 50:
        return f"PageSpeed bajo ({score}/100) — Google te penaliza en rankings"
    if score < 70:
        return f"PageSpeed mejorable ({score}/100) — espacio para subir"
    return "Optimización SEO y captura de leads"

# ---------- Scoring ----------

def score_lead(lead: dict) -> int:
    s = 0
    # Email deliverability
    st = lead.get("email_status", "unknown")
    if st == "deliverable": s += 30
    elif st == "risky":      s += 15
    # Owner-level title
    if title_qualifies(lead.get("position", "")): s += 25
    # Real name verified
    if is_real_name(lead.get("first_name", "")): s += 15
    # Website exists + audited
    audit = lead.get("audit", {})
    if audit.get("score", 0) > 0: s += 10
    # Below-threshold speed = better hook
    if audit.get("score", 0) < 70: s += 10
    # Has company name
    if lead.get("company"): s += 5
    # Has LinkedIn (trust signal)
    if lead.get("linkedin"): s += 5
    return s

# ---------- Google Sheet ----------

_SHEET_CACHE = {"sheet": None, "tab": None}

def get_sheet(sheet_id: str, tab_name: str):
    if _SHEET_CACHE["sheet"]: return _SHEET_CACHE["sheet"], _SHEET_CACHE["tab"]
    from google.oauth2.service_account import Credentials
    import gspread
    creds = Credentials.from_service_account_file(
        str(SA_JSON),
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(sheet_id)
    try:
        ws = sh.worksheet(tab_name)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=tab_name, rows=200, cols=20)
        ws.update('A1:T1', [[
            'timestamp','first_name','last_name','email','email_status',
            'company','position','city','country','website',
            'page_speed','audit_score','main_issue','tech_stack','chatgpt_visible',
            'score','gate_passed','campaign_id','personalization_json','notes',
        ]])
    _SHEET_CACHE["sheet"], _SHEET_CACHE["tab"] = sh, ws
    return sh, ws

def append_to_sheet(ws, lead: dict) -> None:
    audit = lead.get("audit", {})
    row = [
        dt.datetime.now().isoformat(timespec="seconds"),
        lead.get("first_name", ""), lead.get("last_name", ""),
        lead.get("email", ""), lead.get("email_status", ""),
        lead.get("company", ""), lead.get("position", ""),
        lead.get("city", ""), lead.get("country", "MX"),
        lead.get("website", ""),
        audit.get("score", 0), audit.get("score", 0),
        lead.get("main_issue", ""), lead.get("tech_stack", ""),
        str(lead.get("chatgpt_visible", False)),
        lead.get("score", 0), "YES" if lead.get("passed") else "NO",
        lead.get("campaign_id", ""),
        json.dumps(lead.get("personalization", {}), ensure_ascii=False),
        lead.get("notes", ""),
    ]
    ws.append_row(row, value_input_option="USER_ENTERED")

# ---------- Instantly upload ----------

def instantly_add_lead(campaign_id: str, lead: dict) -> dict:
    audit = lead.get("audit", {})
    personalization = {
        "firstName": lead.get("first_name", ""),
        "lastName": lead.get("last_name", ""),
        "companyName": lead.get("company", ""),
        "website": lead.get("website", ""),
        "pageSpeed": str(audit.get("score", "--")),
        "loadTime": f"{audit.get('lcp_sec', '--')}s" if audit.get("lcp_sec") else "--",
        "mainIssue": lead.get("main_issue", ""),
        "city": lead.get("city", ""),
    }
    payload = {
        "campaign": campaign_id,
        "email": lead.get("email", ""),
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "company_name": lead.get("company", ""),
        "website": lead.get("website", ""),
        "personalization": json.dumps(personalization, ensure_ascii=False),
        "custom_variables": personalization,
        "skip_if_in_workspace": True,
        "skip_if_in_campaign": True,
    }
    r = requests.post(
        "https://api.instantly.ai/api/v2/leads",
        headers={"Authorization": f"Bearer {KEYS['instantly']}", "Content-Type": "application/json"},
        json=payload, timeout=30,
    )
    return {"status": r.status_code, "body": r.text[:200]}

# ---------- Orchestrator ----------

def process_city(city: str, niche: str, limit: int, campaign_id: str, ws) -> list[dict]:
    query = f"{niche} en {city}"
    slog(f"🔍 Discovering: {query}")
    results = serpapi_maps(query, "", limit=limit) or dfs_maps(query, f"{city},Mexico", limit)
    slog(f"   Found {len(results)} raw results")

    processed = []
    for r in results:
        title = r.get("title", "")
        website = r.get("website") or r.get("link") or ""
        domain = extract_domain(website)
        if not domain or is_blocked(domain):
            slog(f"  ⊘ BLOCKED: {domain or title}")
            continue

        slog(f"  → {title} | {domain}")
        # Hunter
        hd = hunter_domain_search(domain)
        contact = pick_best_contact(hd)
        if not contact:
            slog(f"    ⊘ no owner-title contact")
            continue

        # Verify
        status = hunter_verify(contact["email"])
        if status == "undeliverable":
            slog(f"    ⊘ undeliverable: {contact['email']}")
            continue

        # PSI audit (best-effort, don't block on failure)
        audit = psi_audit(domain)
        issue = find_main_issue(audit)

        lead = {
            **contact,
            "company": title,
            "website": domain,
            "city": city,
            "country": "MX",
            "email_status": status,
            "audit": audit,
            "main_issue": issue,
            "campaign_id": campaign_id,
            "notes": f"Discovered via SerpAPI Maps | {query}",
        }
        lead["score"] = score_lead(lead)
        lead["passed"] = lead["score"] >= 60

        # Stream to Sheet
        try:
            append_to_sheet(ws, lead)
        except Exception as e:
            slog(f"    ⚠ Sheet append failed: {e}")

        # Upload to Instantly if passed
        if lead["passed"]:
            upload = instantly_add_lead(campaign_id, lead)
            lead["instantly_status"] = upload["status"]
            slog(f"    ✅ score={lead['score']} email={status} PSI={audit.get('score',0)} → Instantly {upload['status']}")
        else:
            slog(f"    ✗ score={lead['score']} below gate (60), sheet only")

        processed.append(lead)
        time.sleep(0.5)

    return processed

# ---------- CLI ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", required=True, help="e.g. 'Cancun'")
    ap.add_argument("--niche", default="inmobiliaria", help="search niche")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--campaign", required=True, help="Instantly campaign ID")
    ap.add_argument("--sheet", default="1uBRDCqz43l0ZI3k5U-msB1-x11kYiQ1FYMmiyVdC6P8")
    ap.add_argument("--tab", default=f"Audit_Trojan_MX_{dt.date.today().isoformat()}")
    args = ap.parse_args()

    slog(f"▶ Lead Finder v4 (lean) — {args.city} × {args.niche} × {args.limit}")
    slog(f"   Campaign: {args.campaign}")
    slog(f"   Sheet: {args.sheet} tab={args.tab}")

    _, ws = get_sheet(args.sheet, args.tab)
    processed = process_city(args.city, args.niche, args.limit, args.campaign, ws)

    passed = [l for l in processed if l.get("passed")]
    slog(f"─" * 60)
    slog(f"✓ Processed: {len(processed)} | Passed gate: {len(passed)} | Uploaded to Instantly: {sum(1 for l in passed if l.get('instantly_status') in (200,201))}")
    slog(f"   Avg PSI (passed): {sum(l['audit'].get('score',0) for l in passed) / max(1,len(passed)):.1f}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
