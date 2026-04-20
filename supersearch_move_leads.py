#!/usr/bin/env python3
"""
Move all 155 Supersearch-enriched leads from list a26e3dab... into campaign 51074dc9...

Strategy:
  1. Paginate list → collect all lead IDs (limit=100 + next_starting_after).
  2. POST /leads/move with {ids: [...], to_campaign_id: ...}
     - If that shape fails, fall back to {search: {list_id: ...}, to_campaign_id: ...}
     - If both fail, try per-lead PATCH with campaign_id (slowest but bulletproof).
  3. Verify post-move count by listing campaign leads.
"""
import json, time, pathlib, requests, sys

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

LIST_ID     = "a26e3dab-896c-4949-b83f-761b4d7e6fbe"
CAMPAIGN_ID = "51074dc9-fce9-4a20-b8a0-4f283ac52177"

OUT = pathlib.Path("/sessions/exciting-charming-hamilton/mnt/jegodigital/supersearch_out")
OUT.mkdir(parents=True, exist_ok=True)


def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def fetch_all_lead_ids():
    leads = []
    starting_after = None
    for i in range(30):
        body = {"list_id": LIST_ID, "limit": 100}
        if starting_after:
            body["starting_after"] = starting_after
        r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30)
        if r.status_code != 200:
            log(f"leads/list {r.status_code} {r.text[:200]}")
            break
        js = r.json()
        items = js.get("items", []) or []
        if not items: break
        leads.extend(items)
        starting_after = js.get("next_starting_after")
        if not starting_after: break
    return leads


def try_move_bulk_ids(ids):
    log(f"Attempt 1: POST /leads/move with ids array (n={len(ids)})")
    r = requests.post(f"{API}/leads/move", headers=H, json={
        "ids": ids,
        "to_campaign_id": CAMPAIGN_ID,
    }, timeout=120)
    log(f"  → {r.status_code}  body: {r.text[:400]}")
    return r.status_code, r.text


def try_move_search(list_id):
    log(f"Attempt 2: POST /leads/move with search filter (list_id)")
    r = requests.post(f"{API}/leads/move", headers=H, json={
        "search_filters": {"list_id": list_id},
        "to_campaign_id": CAMPAIGN_ID,
    }, timeout=120)
    log(f"  → {r.status_code}  body: {r.text[:400]}")
    return r.status_code, r.text


def try_patch_each(ids):
    log(f"Attempt 3: per-lead PATCH with campaign_id (n={len(ids)})")
    ok = 0
    errs = []
    for i, lid in enumerate(ids):
        r = requests.patch(f"{API}/leads/{lid}", headers=H,
                           json={"campaign": CAMPAIGN_ID}, timeout=30)
        if r.status_code in (200, 201):
            ok += 1
        else:
            errs.append({"id": lid, "code": r.status_code, "err": r.text[:120]})
        if (i+1) % 25 == 0 or i+1 == len(ids):
            log(f"  patched {i+1}/{len(ids)}  ok={ok}  errs={len(errs)}")
    return ok, errs


def count_leads_in_campaign():
    """Call POST /leads/list with campaign filter, paginate to full count."""
    total = 0
    starting_after = None
    for _ in range(30):
        body = {"campaign": CAMPAIGN_ID, "limit": 100}
        if starting_after: body["starting_after"] = starting_after
        r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30)
        if r.status_code != 200:
            log(f"  campaign leads/list {r.status_code} {r.text[:200]}")
            break
        js = r.json()
        items = js.get("items", []) or []
        total += len(items)
        starting_after = js.get("next_starting_after")
        if not items or not starting_after: break
    return total


def count_leads_in_list():
    total = 0
    starting_after = None
    for _ in range(30):
        body = {"list_id": LIST_ID, "limit": 100}
        if starting_after: body["starting_after"] = starting_after
        r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30)
        if r.status_code != 200: break
        js = r.json()
        items = js.get("items", []) or []
        total += len(items)
        starting_after = js.get("next_starting_after")
        if not items or not starting_after: break
    return total


def main():
    log(f"Pre-move list count...")
    before_list = count_leads_in_list()
    before_camp = count_leads_in_campaign()
    log(f"  list:     {before_list}")
    log(f"  campaign: {before_camp}")

    log("Fetching all lead IDs from source list...")
    leads = fetch_all_lead_ids()
    ids = [l["id"] for l in leads]
    log(f"  got {len(ids)} ids")
    (OUT/"move_lead_ids.json").write_text(json.dumps(ids, indent=2))

    if not ids:
        log("ABORT: no leads found.")
        sys.exit(1)

    # Try bulk ids first
    code, body = try_move_bulk_ids(ids)
    moved = 0
    method = "unknown"
    if code in (200, 201):
        method = "bulk_ids"
        time.sleep(4)
        moved = count_leads_in_campaign()
        log(f"  post-move campaign count: {moved}")
        if moved >= len(ids) * 0.95:  # 95% threshold
            method_ok = True
        else:
            method_ok = False
            log(f"  suspicious — bulk move said 200 but only {moved} landed")
    else:
        method_ok = False

    if not method_ok:
        # Try search-based move
        code2, body2 = try_move_search(LIST_ID)
        if code2 in (200, 201):
            method = "search"
            time.sleep(4)
            moved = count_leads_in_campaign()
            log(f"  post-move campaign count: {moved}")
            if moved >= len(ids) * 0.95:
                method_ok = True

    if not method_ok:
        # Fall back to per-lead patch
        ok, errs = try_patch_each(ids)
        method = "per_lead_patch"
        time.sleep(4)
        moved = count_leads_in_campaign()
        log(f"  per-lead patch: ok={ok}  errs={len(errs)}")
        log(f"  post-patch campaign count: {moved}")

    after_list = count_leads_in_list()
    log(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    log(f"method:           {method}")
    log(f"ids to move:      {len(ids)}")
    log(f"list BEFORE:      {before_list}")
    log(f"list AFTER:       {after_list}")
    log(f"campaign BEFORE:  {before_camp}")
    log(f"campaign AFTER:   {moved}")
    log(f"moved delta:      {moved - before_camp}")

    (OUT/"move_result.json").write_text(json.dumps({
        "method":        method,
        "ids_requested": len(ids),
        "list_before":   before_list,
        "list_after":    after_list,
        "camp_before":   before_camp,
        "camp_after":    moved,
        "delta":         moved - before_camp,
    }, indent=2))
    log(f"\n✓ result → {OUT/'move_result.json'}")


if __name__ == "__main__":
    main()
