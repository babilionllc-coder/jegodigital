#!/usr/bin/env python3
"""
Cleanup + Activate — April 19, 2026 session

Actions:
  1. Move 11 leads from Audit_Trojan_MX_v1 → Audit_Trojan_MX_Supersearch_v1
  2. Delete orphan drafts (5 total): Audit_Trojan_MX_v1 + 4 TZ_*/test drafts
  3. Activate Audit_Trojan_MX_Supersearch_v1

Safe to re-run — each step is idempotent.
"""
import json, time, sys, requests

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
H_JSON = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
H_BARE = {"Authorization": f"Bearer {KEY}"}  # Iron Rule 11: no Content-Type on DELETE

SRC_CAMP = "e526d5db-ee92-4b0d-9944-49ba47b587af"  # Audit_Trojan_MX_v1 (will be deleted)
DST_CAMP = "51074dc9-fce9-4a20-b8a0-4f283ac52177"  # Audit_Trojan_MX_Supersearch_v1

ORPHAN_DRAFTS = {
    "d9ced891-6808-4f1f-a956-6e4a5f3ee2b7": "TZ_Etc_GMT+11",
    "a6b21a68-c1a8-43f1-9ccc-6b4783019fc7": "TZ_America_Chicago",
    "7ae475a2-cae2-48a5-a5e4-d58a3e9b2965": "TZ_Etc_GMT+10",
    "7aca661a-f16e-4f8e-bab5-2b5fed833bfc": "Audit_test_tz",
}


def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


# ---------- Step 1: collect + move leads from v1 → Supersearch_v1 ----------

def fetch_lead_ids(campaign_id):
    ids = []
    starting_after = None
    for _ in range(50):
        body = {"campaign": campaign_id, "limit": 100}
        if starting_after:
            body["starting_after"] = starting_after
        r = requests.post(f"{API}/leads/list", headers=H_JSON, json=body, timeout=30)
        if r.status_code != 200:
            log(f"leads/list error {r.status_code}: {r.text[:200]}")
            break
        js = r.json()
        items = js.get("items", []) or []
        ids.extend([x["id"] for x in items if "id" in x])
        starting_after = js.get("next_starting_after")
        if not starting_after or len(items) < 100:
            break
    return ids


def move_leads_bulk(ids, to_camp):
    if not ids:
        return True, "no leads to move"
    r = requests.post(f"{API}/leads/move", headers=H_JSON, json={
        "ids": ids,
        "to_campaign_id": to_camp,
    }, timeout=120)
    return (r.status_code in (200, 201, 202)), f"{r.status_code} {r.text[:300]}"


def move_leads_fallback_patch(ids, to_camp):
    ok = 0
    for lid in ids:
        r = requests.patch(f"{API}/leads/{lid}", headers=H_JSON,
                           json={"campaign": to_camp}, timeout=30)
        if r.status_code in (200, 201):
            ok += 1
    return ok


# ---------- Step 2: delete campaigns ----------

def delete_campaign(cid, name):
    r = requests.delete(f"{API}/campaigns/{cid}", headers=H_BARE, timeout=30)
    return r.status_code, r.text[:200]


# ---------- Step 3: activate campaign ----------

def activate_campaign(cid):
    # Instantly v2 activate endpoint
    r = requests.post(f"{API}/campaigns/{cid}/activate", headers=H_JSON, timeout=30)
    return r.status_code, r.text[:300]


# ==================== EXECUTE ====================

def main():
    log("=" * 70)
    log("STEP 1 — Move leads from Audit_Trojan_MX_v1 → Supersearch_v1")
    log("=" * 70)
    ids = fetch_lead_ids(SRC_CAMP)
    log(f"Found {len(ids)} leads in source campaign")
    if ids:
        ok, msg = move_leads_bulk(ids, DST_CAMP)
        log(f"Bulk move: ok={ok} | {msg}")
        if not ok:
            log("Falling back to per-lead PATCH...")
            moved = move_leads_fallback_patch(ids, DST_CAMP)
            log(f"Per-lead PATCH: moved {moved}/{len(ids)}")

    # Verify move
    after_src = len(fetch_lead_ids(SRC_CAMP))
    after_dst = len(fetch_lead_ids(DST_CAMP))
    log(f"After move: SRC has {after_src} leads, DST has {after_dst} leads")

    log("")
    log("=" * 70)
    log("STEP 2 — Delete 5 drafts (4 orphans + emptied Trojan_MX_v1)")
    log("=" * 70)
    to_delete = dict(ORPHAN_DRAFTS)
    if after_src == 0:
        to_delete[SRC_CAMP] = "Audit_Trojan_MX_v1 (emptied)"
    else:
        log(f"⚠️  NOT deleting Audit_Trojan_MX_v1 — still has {after_src} leads")

    for cid, name in to_delete.items():
        code, body = delete_campaign(cid, name)
        log(f"  DELETE {name:<35} → {code}  {body[:80]}")
        time.sleep(0.5)

    log("")
    log("=" * 70)
    log("STEP 3 — Activate Audit_Trojan_MX_Supersearch_v1")
    log("=" * 70)
    code, body = activate_campaign(DST_CAMP)
    log(f"Activate → {code}  {body[:200]}")

    log("")
    log("Done.")


if __name__ == "__main__":
    main()
