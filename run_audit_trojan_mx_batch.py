#!/usr/bin/env python3
"""Run the Audit_Trojan_MX_v1 pipeline across 6 MX cities."""
import sys, json, time
sys.path.insert(0, "/sessions/exciting-charming-hamilton/mnt/jegodigital")
import lead_finder_v4_lean as L

CAMPAIGN_ID = "e526d5db-ee92-4b0d-9944-49ba47b587af"
SHEET_ID = "1uBRDCqz43l0ZI3k5U-msB1-x11kYiQ1FYMmiyVdC6P8"
TAB = "Audit_Trojan_MX_2026-04-18"

CITIES = [
    ("Cancun", 20),
    ("Playa del Carmen", 20),
    ("Tulum", 15),
    ("Ciudad de Mexico", 20),
    ("Guadalajara", 15),
    ("Monterrey", 15),
]

def main():
    _, ws = L.get_sheet(SHEET_ID, TAB)
    all_leads = []
    totals = {"raw": 0, "passed": 0, "uploaded": 0}

    for city, limit in CITIES:
        L.slog(f"══════════ {city.upper()} (target {limit}) ══════════")
        try:
            processed = L.process_city(city, "inmobiliaria", limit, CAMPAIGN_ID, ws)
        except Exception as e:
            L.slog(f"  ⚠ city failed: {e}")
            continue
        all_leads.extend(processed)
        totals["raw"] += limit
        passed = [l for l in processed if l.get("passed")]
        uploaded = [l for l in passed if l.get("instantly_status") in (200, 201)]
        totals["passed"] += len(passed)
        totals["uploaded"] += len(uploaded)
        L.slog(f"  → {city} done: {len(processed)} processed, {len(passed)} passed gate, {len(uploaded)} uploaded")
        time.sleep(2)

    L.slog("═" * 60)
    L.slog(f"BATCH COMPLETE")
    L.slog(f"  Raw candidates:   {totals['raw']}")
    L.slog(f"  Passed gate:      {totals['passed']}")
    L.slog(f"  Uploaded:         {totals['uploaded']}")
    L.slog(f"  Pass rate:        {100*totals['passed']/max(1,totals['raw']):.1f}%")
    if all_leads:
        psi_scores = [l["audit"].get("score", 0) for l in all_leads if l.get("passed")]
        if psi_scores:
            L.slog(f"  Avg PSI:          {sum(psi_scores)/len(psi_scores):.1f}")
            L.slog(f"  PSI distribution: min={min(psi_scores)} max={max(psi_scores)}")

    # Write run report
    report = {
        "campaign_id": CAMPAIGN_ID,
        "sheet_tab": TAB,
        "cities": [c for c, _ in CITIES],
        "totals": totals,
        "sample_leads": [
            {
                "first_name": l.get("first_name"),
                "company": l.get("company"),
                "email": l.get("email"),
                "city": l.get("city"),
                "page_speed": l.get("audit", {}).get("score"),
                "main_issue": l.get("main_issue"),
                "score": l.get("score"),
            } for l in all_leads if l.get("passed")
        ][:20],
    }
    with open("/sessions/exciting-charming-hamilton/mnt/jegodigital/audit_trojan_mx_run_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    L.slog(f"  → report saved to audit_trojan_mx_run_report.json")

if __name__ == "__main__":
    main()
