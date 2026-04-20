#!/usr/bin/env python3
"""
PSI-enrich the 155 Supersearch leads and PATCH personalization vars back into Instantly.

Pipeline:
  1. Paginate ALL leads in list a26e3dab... (155 expected).
  2. For each unique company_domain, run PSI mobile audit.
  3. Compute mainIssue + loadTime per v4 rules.
  4. PATCH each lead with custom_variables {firstName, companyName, pageSpeed, loadTime, mainIssue, website, city}.
  5. Report: total processed, PSI success count, drop reasons.

Concurrency: 10 PSI threads. PSI typical latency ~15-40s per URL, so 155/10 ≈ 10 min.
"""
import json, time, pathlib, re, sys, requests
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
LID = "a26e3dab-896c-4949-b83f-761b4d7e6fbe"

# Load PSI key
ENV = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/website/functions/.env").read_text()
PSI_KEY = next(l.split("=",1)[1].strip() for l in ENV.splitlines() if l.startswith("PSI_API_KEY="))

OUT = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/supersearch_out")
OUT.mkdir(parents=True, exist_ok=True)


def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def fetch_all_leads():
    """Paginate the list."""
    leads = []
    starting_after = None
    for _ in range(30):
        body = {"list_id": LID, "limit": 100}
        if starting_after:
            body["starting_after"] = starting_after
        r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30)
        if r.status_code != 200:
            log(f"leads/list → {r.status_code} {r.text[:200]}")
            break
        js = r.json()
        items = js.get("items", []) or []
        if not items:
            break
        leads.extend(items)
        starting_after = js.get("next_starting_after")
        if not starting_after:
            break
    return leads


def resolve_url(lead) -> str | None:
    """Prefer payload.companyWebsite → company_domain → derived from email."""
    p = lead.get("payload") or {}
    for cand in (p.get("companyWebsite"), p.get("companyDomain"),
                 lead.get("company_domain"), ""):
        if cand and "." in cand:
            url = cand.strip()
            if not url.startswith("http"):
                url = "https://" + url.lstrip("/")
            return url
    em = lead.get("email") or ""
    if "@" in em:
        dom = em.split("@",1)[1].strip()
        # Skip free/consumer email domains
        if dom not in {"gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","live.com"}:
            return "https://" + dom
    return None


def psi_audit(url: str) -> dict:
    try:
        r = requests.get(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
            params={"url": url, "key": PSI_KEY, "strategy": "mobile",
                    "category": ["performance", "seo"]},
            timeout=90,
        )
        if r.status_code != 200:
            return {"score": 0, "error": f"HTTP {r.status_code}"}
        d = r.json()
        perf = d["lighthouseResult"]["categories"]["performance"]["score"]
        seo  = d["lighthouseResult"]["categories"]["seo"]["score"]
        lcp  = d["lighthouseResult"]["audits"].get("largest-contentful-paint",{}).get("numericValue",0)/1000
        fcp  = d["lighthouseResult"]["audits"].get("first-contentful-paint",{}).get("numericValue",0)/1000
        return {
            "score":     int(perf*100) if perf is not None else 0,
            "seo_score": int(seo*100)  if seo  is not None else 0,
            "lcp_sec":   round(lcp,1),
            "fcp_sec":   round(fcp,1),
            "load_time": round(lcp+fcp,1),
        }
    except Exception as e:
        return {"score": 0, "error": str(e)[:120]}


def main_issue(audit, has_site):
    if not has_site:
        return "Sin sitio web — pierdes leads orgánicos"
    score = audit.get("score") or 0
    lcp   = audit.get("lcp_sec") or 0
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


def patch_lead(lead_id, cv):
    r = requests.patch(f"{API}/leads/{lead_id}", headers=H,
                       json={"custom_variables": cv}, timeout=30)
    return r.status_code, r.text[:200] if r.status_code not in (200,201) else ""


def main():
    log("Fetching all leads from list...")
    leads = fetch_all_leads()
    log(f"  got {len(leads)} leads")

    # Map: one PSI per unique domain to save credits
    domain_to_url = {}
    for ld in leads:
        url = resolve_url(ld)
        if not url:
            continue
        # Dedup by hostname
        host = re.sub(r"^https?://", "", url).split("/")[0].lower().replace("www.","")
        domain_to_url.setdefault(host, url)

    log(f"  {len(domain_to_url)} unique domains to audit")

    # PSI concurrent
    psi_results = {}
    done_count = 0
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(psi_audit, u): (host, u) for host, u in domain_to_url.items()}
        for f in as_completed(futures):
            host, u = futures[f]
            try:
                psi_results[host] = f.result()
            except Exception as e:
                psi_results[host] = {"score": 0, "error": str(e)[:80]}
            done_count += 1
            if done_count % 10 == 0 or done_count == len(domain_to_url):
                log(f"  PSI {done_count}/{len(domain_to_url)}")

    # Save PSI cache
    (OUT/"psi_results.json").write_text(json.dumps(psi_results, indent=2, ensure_ascii=False))

    # PATCH each lead
    log("Patching personalization vars into Instantly...")
    patched = 0
    no_site = 0
    patch_errors = []
    for ld in leads:
        url = resolve_url(ld)
        host = re.sub(r"^https?://", "", url).split("/")[0].lower().replace("www.","") if url else None
        audit = psi_results.get(host, {}) if host else {}
        has_site = bool(url) and audit.get("score", 0) > 0

        cv = {
            "firstName":  ld.get("first_name",""),
            "lastName":   ld.get("last_name",""),
            "companyName": ld.get("company_name",""),
            "website":    url or "",
            "pageSpeed":  str(audit.get("score","")) if audit else "",
            "loadTime":   f"{audit.get('lcp_sec','')}s" if audit.get("lcp_sec") else "",
            "mainIssue":  main_issue(audit, has_site),
            "city":       ((ld.get("payload") or {}).get("location","") or "").split(",")[0].strip(),
            "jobTitle":   ld.get("job_title","") or (ld.get("payload") or {}).get("jobTitle",""),
        }
        if not has_site:
            no_site += 1

        code, err = patch_lead(ld["id"], cv)
        if code in (200,201):
            patched += 1
        else:
            patch_errors.append({"id": ld["id"], "code": code, "err": err})

    # Final stats
    log(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    log(f"Total leads processed: {len(leads)}")
    log(f"Unique domains audited: {len(domain_to_url)}")
    log(f"PSI score > 0: {sum(1 for r in psi_results.values() if r.get('score',0) > 0)}")
    log(f"PSI score 0 (inaccessible): {sum(1 for r in psi_results.values() if r.get('score',0) == 0)}")
    log(f"Leads without usable website: {no_site}")
    log(f"Patched with vars: {patched}/{len(leads)}")
    if patch_errors:
        log(f"Patch failures: {len(patch_errors)}")
        for e in patch_errors[:5]:
            log(f"  {e}")

    # Score distribution
    scores = [r.get("score",0) for r in psi_results.values() if r.get("score") is not None]
    if scores:
        buckets = {"<30": 0, "30-49": 0, "50-69": 0, "70-89": 0, "90+": 0}
        for s in scores:
            if s < 30: buckets["<30"] += 1
            elif s < 50: buckets["30-49"] += 1
            elif s < 70: buckets["50-69"] += 1
            elif s < 90: buckets["70-89"] += 1
            else: buckets["90+"] += 1
        log(f"\nPSI score distribution (n={len(scores)}):")
        for k,v in buckets.items():
            log(f"  {k:8s}  {v}")

    # Save summary
    (OUT/"psi_summary.json").write_text(json.dumps({
        "total_leads":       len(leads),
        "unique_domains":    len(domain_to_url),
        "patched":           patched,
        "no_site":           no_site,
        "psi_success":       sum(1 for r in psi_results.values() if r.get('score',0) > 0),
        "psi_fail":          sum(1 for r in psi_results.values() if r.get('score',0) == 0),
        "patch_errors":      patch_errors,
        "score_distribution": buckets if scores else {},
    }, indent=2, ensure_ascii=False))
    log(f"\n✓ Summary: {OUT/'psi_summary.json'}")


if __name__ == "__main__":
    main()
