#!/usr/bin/env python3
"""
JegoRoom skill — enrich_and_push.py

Given a hot account ID, enrich it with JegoClay (decision-maker email,
phone, pains, personalized opener) and push an Airtable Leads row into
base appqBJCNb81pa07Dr for Alex's phone pipeline.

NOTE — Airtable write path:
    This skill writes a lightweight 1-row CSV + dispatches the existing
    `enrich-leads.yml` GitHub Actions workflow (JegoClay) to handle
    the actual scraping. Once the workflow finishes, we pull the
    enriched JSON artifact and print it. Pushing the row into Airtable
    is done by Claude in the Cowork session via the already-connected
    Airtable MCP (not by this script) — this keeps the script
    dependency-light and the MCP auth flows through Cowork.

So the flow when invoked from Cowork:
    1. Claude calls this script → it kicks off enrichment workflow.
    2. Script returns the workflow_run URL + pending status.
    3. Claude polls the workflow (via GitHub MCP or gh CLI).
    4. When workflow is green, Claude reads the enriched JSON.
    5. Claude calls the Airtable MCP `create_records_for_table` to
       add the row into base appqBJCNb81pa07Dr tblouwah3cU3YIJ18.

Usage:
    python3 skills/jegoroom/scripts/enrich_and_push.py --account-id rolex-mx.com
    python3 skills/jegoroom/scripts/enrich_and_push.py --account-id name_rolex-inmobiliaria

Env:
    FIREBASE_ADMIN_SA_JSON  required (to read the account)
    GH_PAT                  required (to trigger enrich-leads workflow)
"""

import argparse
import csv
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "tools", "jegoroom"))
from common import get_db, log  # noqa: E402


REPO = "babilionllc-coder/jegodigital"
WORKFLOW_FILE = "enrich-leads.yml"


def load_account(account_id: str) -> dict:
    db = get_db()
    ref = db.collection("intent_accounts").document(account_id)
    snap = ref.get()
    if not snap.exists:
        raise RuntimeError(f"account {account_id} not in Firestore intent_accounts")
    d = snap.to_dict() or {}
    d["_id"] = snap.id
    return d


def write_one_row_csv(account: dict) -> str:
    """Write a single-row CSV matching lead_enrichment_engine.py's expected schema.

    Returns the repo-relative CSV path so the GH workflow can read it.
    """
    domain = account.get("domain") or ""
    company = account.get("company_name") or domain or account["_id"]
    city = account.get("city") or ""

    # Use a stable filename per account so repeated runs deduplicate.
    slug = account["_id"].replace("/", "-")[:40]
    now = datetime.now(timezone.utc).strftime("%Y%m%d")
    rel_path = f"leads/input/jegoroom_{slug}_{now}.csv"
    abs_path = os.path.join(HERE, "..", "..", "..", rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)

    # Columns match lead_enrichment_engine.py's expected input.
    cols = [
        "prospect_first_name", "prospect_last_name",
        "prospect_job_title", "prospect_company_name",
        "prospect_company_website", "city", "country",
        "source",
    ]
    with open(abs_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerow({
            "prospect_first_name": "",    # Hunter + JegoClay will fill
            "prospect_last_name": "",
            "prospect_job_title": "Decision Maker",
            "prospect_company_name": company,
            "prospect_company_website": domain,
            "city": city,
            "country": "MX",
            "source": "jegoroom_intent",
        })
    log(f"✅ wrote single-row CSV → {rel_path}")
    return rel_path


def trigger_enrich_workflow(csv_path: str, batch_name: str) -> dict:
    """Dispatch the enrich-leads.yml workflow with inputs.

    Returns {"ok": bool, "workflow_run_url": str|None, "error": str|None}.
    Note: GitHub doesn't return the workflow_run ID on dispatch — we have
    to poll /actions/runs to find it.
    """
    token = os.environ.get("GH_PAT")
    if not token:
        return {"ok": False, "error": "GH_PAT not set", "workflow_run_url": None}

    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW_FILE}/dispatches"
    r = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        json={
            "ref": "main",
            "inputs": {
                "csv_path": csv_path,
                "offset": "0",
                "limit": "1",
                "workers": "1",
                "batch_name": batch_name,
            },
        },
        timeout=20,
    )
    if r.status_code not in (200, 201, 204):
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:300]}", "workflow_run_url": None}

    # Poll for the most recent run of this workflow (best-effort; may take
    # a few seconds for GitHub to actually create the run).
    time.sleep(5)
    runs_url = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW_FILE}/runs?per_page=3&event=workflow_dispatch"
    rr = requests.get(runs_url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
    run_url = None
    if rr.status_code == 200:
        runs = rr.json().get("workflow_runs", []) or []
        if runs:
            run_url = runs[0].get("html_url")

    return {"ok": True, "error": None, "workflow_run_url": run_url}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--account-id", required=True,
                    help="Firestore intent_accounts doc ID (usually the domain)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print the plan but don't write CSV or trigger workflow")
    args = ap.parse_args()

    try:
        account = load_account(args.account_id)
    except Exception as e:
        log(f"❌ {e}")
        sys.exit(1)

    log(f"📋 Account: {account.get('company_name') or '(unknown)'}")
    log(f"   domain: {account.get('domain') or '(none)'}")
    log(f"   city:   {account.get('city') or '(none)'}")
    log(f"   score:  {account.get('score_30d', 0)}/100  (is_hot={account.get('is_hot')})")

    if args.dry_run:
        log("(dry-run) skipping CSV write + workflow dispatch")
        return

    csv_path = write_one_row_csv(account)
    batch_name = f"jegoroom_{args.account_id[:30]}"
    result = trigger_enrich_workflow(csv_path, batch_name)
    if not result["ok"]:
        log(f"❌ workflow dispatch failed: {result['error']}")
        sys.exit(1)

    log("✅ JegoClay enrichment workflow dispatched")
    if result["workflow_run_url"]:
        log(f"   watch: {result['workflow_run_url']}")
    log("")
    log("NEXT STEP: In Cowork, poll the workflow → read enriched JSON → use Airtable MCP")
    log(f"  `create_records_for_table` on base appqBJCNb81pa07Dr table Leads.")
    log(f"  Fields to set:")
    log(f"    Company           = {account.get('company_name')}")
    log(f"    Website           = https://{account.get('domain')}")
    log(f"    City              = {account.get('city')}")
    log(f"    Source            = (singleSelect) Instantly  # or add 'Intent' option")
    log(f"    Stage             = Positive Reply")
    log(f"    Notes             = signal history from intent_accounts/{account['_id']}")
    log(f"    First/Last/Email  = (from JegoClay artifact)")

    # Emit structured JSON at the end for easy consumption by Claude.
    print(json.dumps({
        "ok": True,
        "account_id": account["_id"],
        "company_name": account.get("company_name"),
        "domain": account.get("domain"),
        "city": account.get("city"),
        "score_30d": account.get("score_30d"),
        "csv_path": csv_path,
        "workflow_run_url": result["workflow_run_url"],
        "airtable_base_id": "appqBJCNb81pa07Dr",
        "airtable_table_id": "tblouwah3cU3YIJ18",
    }, indent=2))


if __name__ == "__main__":
    main()
