#!/usr/bin/env python3
"""
v4 Pre-Launch Var Coverage Check — 2026-04-19
Runs against the 4 live campaigns that were NOT just fixed today.
Flags any {{customVar}} in the sequence with <95% lead coverage.
Safe / read-only — no writes.
"""
import re, time, json, requests

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
BUILTIN = {"firstName", "lastName", "email", "companyName", "website", "personalization"}
THRESHOLD = 0.95

CAMPAIGNS = {
    "Trojan Horse":              "cd9f1abf-3ad5-460c-88e9-29c48bc058b3",
    "Auditoría Gratis":          "8b5f556f-9259-4258-b74b-2df55712f520",
    "Campaign F (WhatsApp AI)":  "733dfdd4-5813-48d6-8419-ebca3b40d783",
    "US-Hispanic-Bilingual":     "dbb9dfd7-4ae2-4a44-ba28-d895206d78d6",
}

VAR_RE = re.compile(r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}")
BRACKET_RE = re.compile(r"\[([a-z ]{3,30})\]")  # Iron Rule 11: literal [brackets] in body


def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def extract_vars(campaign: dict):
    """Return (used_vars:set, bracket_offenders:list[tuple(step_idx, variant_idx, bracket)])."""
    used, brackets = set(), []
    for seq_idx, seq in enumerate(campaign.get("sequences", [])):
        for step_idx, step in enumerate(seq.get("steps", [])):
            for var_idx, v in enumerate(step.get("variants", [])):
                blob = (v.get("subject") or "") + " " + (v.get("body") or "")
                for m in VAR_RE.finditer(blob):
                    used.add(m.group(1))
                for m in BRACKET_RE.finditer(blob):
                    brackets.append((step_idx + 1, var_idx, m.group(0)))
    return used, brackets


def fetch_all_leads(campaign_id: str):
    leads = []
    cursor = None
    for _ in range(500):
        body = {"campaign": campaign_id, "limit": 100}
        if cursor: body["starting_after"] = cursor
        r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30)
        r.raise_for_status()
        j = r.json()
        leads.extend(j.get("items", []))
        cursor = j.get("next_starting_after")
        if not cursor: break
    return leads


def coverage_for(campaign_name: str, campaign_id: str):
    log(f"--- {campaign_name} ({campaign_id[:8]}...) ---")
    r = requests.get(f"{API}/campaigns/{campaign_id}", headers=H, timeout=30)
    r.raise_for_status()
    camp = r.json()
    used_vars, brackets = extract_vars(camp)
    custom_vars = used_vars - BUILTIN
    log(f"  vars used: {sorted(used_vars)}")
    log(f"  custom vars to verify: {sorted(custom_vars) if custom_vars else '(none)'}")
    if brackets:
        log(f"  🚨 BRACKET OFFENDERS (Iron Rule 11 violations):")
        for step, var_idx, br in brackets:
            log(f"     step {step} variant {var_idx}: '{br}'")

    leads = fetch_all_leads(campaign_id)
    log(f"  lead count: {len(leads)}")

    # Always check firstName population — even though it's built-in, blank firstName breaks "Hola {{firstName}}"
    interesting = custom_vars | {"firstName"}
    report = {}
    for var in interesting:
        if var == "firstName":
            filled = sum(1 for l in leads if (l.get("first_name") or "").strip())
        else:
            filled = sum(1 for l in leads if (l.get("custom_variables") or {}).get(var))
        pct = filled / len(leads) if leads else 0
        report[var] = (filled, len(leads), pct)
        flag = "✅" if pct >= THRESHOLD else "🚨 BLOCKED"
        log(f"  {flag}  {var}: {filled}/{len(leads)} = {pct*100:.1f}%")

    return {
        "campaign": campaign_name,
        "campaign_id": campaign_id,
        "lead_count": len(leads),
        "used_vars": sorted(used_vars),
        "custom_vars_checked": sorted(custom_vars),
        "bracket_offenders": brackets,
        "coverage": {k: {"filled": v[0], "total": v[1], "pct": v[2]} for k, v in report.items()},
        "blocked_vars": [k for k, v in report.items() if v[2] < THRESHOLD],
    }


def main():
    out = {"run_at": time.strftime("%Y-%m-%d %H:%M:%S"), "campaigns": []}
    for name, cid in CAMPAIGNS.items():
        try:
            out["campaigns"].append(coverage_for(name, cid))
        except Exception as e:
            log(f"  ❌ ERROR for {name}: {e}")
            out["campaigns"].append({"campaign": name, "error": str(e)})

    # Summary
    log("")
    log("=" * 60)
    log("SUMMARY")
    log("=" * 60)
    for c in out["campaigns"]:
        if "error" in c:
            log(f"  {c['campaign']}: ERROR ({c['error']})")
            continue
        tag = "✅ OK" if not c["blocked_vars"] and not c["bracket_offenders"] else "🚨 ACTION REQUIRED"
        log(f"  {tag}  {c['campaign']} — leads={c['lead_count']}, blocked={c['blocked_vars']}, brackets={len(c['bracket_offenders'])}")

    outpath = "/sessions/determined-modest-wright/mnt/jegodigital/var_coverage_report_2026-04-19.json"
    with open(outpath, "w") as f:
        json.dump(out, f, indent=2, default=str)
    log(f"\nReport written: {outpath}")


if __name__ == "__main__":
    main()
