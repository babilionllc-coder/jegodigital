#!/usr/bin/env python3
"""
Re-PATCH custom_variables onto the 136 leads now sitting in the Supersearch campaign.
The list→campaign move stripped them, so we regenerate from psi_results.json.
"""
import json, time, pathlib, re, requests

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

CID = "51074dc9-fce9-4a20-b8a0-4f283ac52177"
OUT = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/supersearch_out")

PSI = json.loads((OUT/"psi_results.json").read_text())


def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main_issue(audit, has_site):
    if not has_site: return "Sin sitio web — pierdes leads orgánicos"
    score = audit.get("score") or 0; lcp = audit.get("lcp_sec") or 0
    if score == 0: return "Sitio no accesible o bloqueado"
    if score < 30: return f"PageSpeed crítico ({score}/100) — pierdes ~60% de visitantes"
    if lcp > 4: return f"Tiempo de carga lento ({lcp}s) — 40% de visitantes abandonan"
    if score < 50: return f"PageSpeed bajo ({score}/100) — Google te penaliza en rankings"
    if score < 70: return f"PageSpeed mejorable ({score}/100) — espacio para subir"
    return "Optimización SEO y captura de leads"


def host_from_url(url):
    if not url: return None
    return re.sub(r"^https?://", "", url).split("/")[0].lower().replace("www.", "")


def resolve_url(ld):
    p = ld.get("payload") or {}
    for cand in (p.get("companyWebsite"), p.get("companyDomain"), ld.get("website"),
                 ld.get("company_domain"), ""):
        if cand and "." in cand:
            url = cand.strip()
            if not url.startswith("http"): url = "https://" + url.lstrip("/")
            return url
    em = ld.get("email") or ""
    if "@" in em:
        dom = em.split("@", 1)[1].strip()
        if dom not in {"gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","live.com"}:
            return "https://" + dom
    return None


# Paginate all campaign leads
leads = []
sa = None
for _ in range(5):
    body = {"campaign": CID, "limit": 100}
    if sa: body["starting_after"] = sa
    r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30)
    js = r.json()
    items = js.get("items", []) or []
    leads.extend(items)
    sa = js.get("next_starting_after")
    if not items or not sa: break

log(f"{len(leads)} leads in campaign")

ok = 0
errs = []
for i, ld in enumerate(leads):
    url = resolve_url(ld)
    host = host_from_url(url) if url else None
    audit = PSI.get(host, {}) if host else {}
    has_site = bool(url) and audit.get("score", 0) > 0

    cv = {
        "firstName":  ld.get("first_name","") or (ld.get("payload") or {}).get("firstName",""),
        "lastName":   ld.get("last_name","")  or (ld.get("payload") or {}).get("lastName",""),
        "companyName": ld.get("company_name","") or (ld.get("payload") or {}).get("companyName",""),
        "website":    url or "",
        "pageSpeed":  str(audit.get("score","")) if audit else "",
        "loadTime":   f"{audit.get('lcp_sec','')}s" if audit.get("lcp_sec") else "",
        "mainIssue":  main_issue(audit, has_site),
        "city":       ((ld.get("payload") or {}).get("location","") or "").split(",")[0].strip(),
        "jobTitle":   ld.get("job_title","") or (ld.get("payload") or {}).get("jobTitle",""),
    }
    r = requests.patch(f"{API}/leads/{ld['id']}", headers=H,
                       json={"custom_variables": cv}, timeout=30)
    if r.status_code in (200, 201):
        ok += 1
    else:
        errs.append({"id": ld["id"], "code": r.status_code, "err": r.text[:120]})
    if (i+1) % 25 == 0 or i+1 == len(leads):
        log(f"  patched {i+1}/{len(leads)}  ok={ok}  errs={len(errs)}")

log(f"\nDONE  ok={ok}  errs={len(errs)}")
if errs:
    for e in errs[:5]: log(f"  {e}")

# Verify
r = requests.post(f"{API}/leads/list", headers=H, json={"campaign": CID, "limit": 3}, timeout=30)
for ld in r.json().get("items", [])[:3]:
    log(f"\n  SAMPLE  {ld.get('email')}")
    log(f"  cv: {json.dumps(ld.get('custom_variables') or {}, ensure_ascii=False)[:300]}")
