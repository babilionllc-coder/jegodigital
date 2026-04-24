#!/usr/bin/env python3
"""
One-shot GitHub Git Data API push of the JegoRoom Phase 1 MVP.
Follows DEPLOY.md §Autonomous Deploy exactly.

Usage: python3 tools/jegoroom/push_jegoroom.py
Env:   reads .secrets/github_token
"""
import base64
import json
import os
import sys

import requests

REPO = "babilionllc-coder/jegodigital"
API = "https://api.github.com"

FILES = [
    "tools/jegoroom/common.py",
    "tools/jegoroom/collect_hiring.py",
    "tools/jegoroom/score_accounts.py",
    "tools/jegoroom/push_jegoroom.py",  # include self for auditability
    ".github/workflows/jegoroom.yml",
    "website/functions/jegoRoomAlerts.js",
    "website/functions/index.js",
    "skills/jegoroom/SKILL.md",
    "skills/jegoroom/README.md",
    "skills/jegoroom/scripts/show_hot.py",
    "skills/jegoroom/scripts/daily_digest.py",
    "skills/jegoroom/scripts/enrich_and_push.py",
]

MESSAGE = (
    "ship: JegoRoom Phase 1 MVP — in-house Common Room clone\n\n"
    "* 3 Cloud Function triggers (jegoRoomAlertOnHotTransition + 2 on-demand)\n"
    "* Python signal collector (SerpAPI hiring signals)\n"
    "* Python scoring engine (Gemini 2.5-flash + 30d decay)\n"
    "* GitHub Actions cron (09:00 CDMX hiring + 11/15 CDMX scoring)\n"
    "* jegoroom skill (show_hot + daily_digest + enrich_and_push)\n"
    "\n"
    "Saves $7-30k/yr vs Common Room. Phase 1 covers hiring signals; Phases\n"
    "2+ add GMaps reviews + launch news + IG engagement per README."
)


def _repo_root():
    # .../jegodigital/tools/jegoroom/push_jegoroom.py -> jegodigital
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", ".."))


def main():
    token_path = os.path.join(_repo_root(), ".secrets", "github_token")
    if not os.path.exists(token_path):
        sys.exit(f"❌ token missing at {token_path}")
    with open(token_path) as f:
        token = f.read().strip()

    h = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # 1. Re-pull main SHA right before commit (Strategist race guard).
    r = requests.get(f"{API}/repos/{REPO}/git/ref/heads/main", headers=h, timeout=20)
    r.raise_for_status()
    main_sha = r.json()["object"]["sha"]
    print(f"[1/5] main @ {main_sha[:10]}")

    # 2. Get base tree SHA
    r = requests.get(f"{API}/repos/{REPO}/git/commits/{main_sha}", headers=h, timeout=20)
    r.raise_for_status()
    base_tree = r.json()["tree"]["sha"]
    print(f"[2/5] base tree @ {base_tree[:10]}")

    # 3. Create blobs (one per file). Use base64 + requests json=; Python
    #    handles large bodies fine (unlike shell curl -d which E2BIG'd per
    #    DISASTER_LOG 2026-04-22 PM).
    tree_entries = []
    root = _repo_root()
    for rel_path in FILES:
        abs_path = os.path.join(root, rel_path)
        if not os.path.exists(abs_path):
            sys.exit(f"❌ missing file: {abs_path}")
        with open(abs_path, "rb") as f:
            content = f.read()
        encoded = base64.b64encode(content).decode("ascii")
        r = requests.post(
            f"{API}/repos/{REPO}/git/blobs",
            headers={**h, "Content-Type": "application/json"},
            data=json.dumps({"content": encoded, "encoding": "base64"}),
            timeout=30,
        )
        if r.status_code not in (200, 201):
            sys.exit(f"❌ blob failed for {rel_path}: {r.status_code} {r.text[:300]}")
        blob_sha = r.json()["sha"]
        tree_entries.append({
            "path": rel_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha,
        })
        print(f"  blob {rel_path:<55} {blob_sha[:10]}  ({len(content)} bytes)")

    # 4. Create tree
    r = requests.post(
        f"{API}/repos/{REPO}/git/trees",
        headers={**h, "Content-Type": "application/json"},
        data=json.dumps({"base_tree": base_tree, "tree": tree_entries}),
        timeout=30,
    )
    if r.status_code not in (200, 201):
        sys.exit(f"❌ tree failed: {r.status_code} {r.text[:500]}")
    new_tree = r.json()["sha"]
    print(f"[3/5] new tree @ {new_tree[:10]}")

    # 5. Create commit
    r = requests.post(
        f"{API}/repos/{REPO}/git/commits",
        headers={**h, "Content-Type": "application/json"},
        data=json.dumps({"message": MESSAGE, "tree": new_tree, "parents": [main_sha]}),
        timeout=30,
    )
    if r.status_code not in (200, 201):
        sys.exit(f"❌ commit failed: {r.status_code} {r.text[:500]}")
    new_commit = r.json()["sha"]
    print(f"[4/5] new commit @ {new_commit[:10]}")

    # 6. PATCH ref
    r = requests.patch(
        f"{API}/repos/{REPO}/git/refs/heads/main",
        headers={**h, "Content-Type": "application/json"},
        data=json.dumps({"sha": new_commit, "force": False}),
        timeout=30,
    )
    if r.status_code not in (200, 201):
        sys.exit(f"❌ ref patch failed: {r.status_code} {r.text[:500]}")
    print(f"[5/5] ✅ main ← {new_commit[:10]}")
    print(f"\nhttps://github.com/{REPO}/commit/{new_commit}")


if __name__ == "__main__":
    main()
