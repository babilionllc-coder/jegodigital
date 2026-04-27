#!/usr/bin/env python3
"""One-shot autonomous push via GitHub Git Data API.
Reads .secrets/github_token. Builds a commit from the listed files + moves on top of live main.
Files added/modified live at the same path. Moves: list of (old_path, new_path) — old gets nulled in tree.
"""
import os, json, base64, urllib.request, urllib.error, sys, time, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = open(os.path.join(ROOT, ".secrets/github_token")).read().strip()
REPO = "babilionllc-coder/jegodigital"
BRANCH = "main"
API = "https://api.github.com"
HDRS = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json", "User-Agent": "claude-cowork"}

def req(method, path, body=None):
    url = API + path
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, headers={**HDRS, "Content-Type":"application/json"}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code} on {method} {path}: {body[:300]}", file=sys.stderr)
        raise

# Files to ADD or MODIFY
ADDS = [
    "MASTER_PROMPT.md",
    "AUDIT_DELTA_2026-04-27.md",
    "NEXT_STEP.md",
    "CLAUDE.md",
    "SYSTEM.md",
    "tools/regen_system_inventory.sh",
    "tools/_regen_inventory.py",
    "tools/_session_push.py",  # this script itself
]

# Files MOVED (old, new) — need to null old path in tree, then add new content at new path
MOVES = [
    ("AUDIT_2026-04-21.md", "archive/2026-04/AUDIT_2026-04-21.md"),
    ("AUDIT_TROJAN_MX_V1_REPORT.md", "archive/2026-04/AUDIT_TROJAN_MX_V1_REPORT.md"),
    ("BREVO_AUDIT_2026-04-26_PM.md", "archive/2026-04/BREVO_AUDIT_2026-04-26_PM.md"),
    ("CUSTOMER_MATCH_HANDOFF_2026-04-26.md", "archive/2026-04/CUSTOMER_MATCH_HANDOFF_2026-04-26.md"),
    ("ELEVENLABS_CLONE_REPORT.md", "archive/2026-04/ELEVENLABS_CLONE_REPORT.md"),
    ("LEAD_FINDER_V4_2026-04-19.md", "archive/2026-04/LEAD_FINDER_V4_2026-04-19.md"),
    ("PIPELINE_AUDIT_2026-04-26_PM.md", "archive/2026-04/PIPELINE_AUDIT_2026-04-26_PM.md"),
    ("SESSION_HANDOFF_2026-04-19.md", "archive/2026-04/SESSION_HANDOFF_2026-04-19.md"),
    ("SESSION_HANDOFF_2026-04-24.md", "archive/2026-04/SESSION_HANDOFF_2026-04-24.md"),
    ("SESSION_SUMMARY_2026-04-19_part2.md", "archive/2026-04/SESSION_SUMMARY_2026-04-19_part2.md"),
    ("SPAM_AUDIT_2026-04-22.md", "archive/2026-04/SPAM_AUDIT_2026-04-22.md"),
    ("UPWORK_HANDOFF_PROMPT.md", "archive/2026-04/UPWORK_HANDOFF_PROMPT.md"),
    ("WORK_LOG_2026-04-20.md", "archive/2026-04/WORK_LOG_2026-04-20.md"),
    ("audit_trojan_mx_v1_sequence.md", "archive/2026-04/audit_trojan_mx_v1_sequence.md"),
    ("cold-email-audit-2026-04-22.md", "archive/2026-04/cold-email-audit-2026-04-22.md"),
    ("cold-email-audit-v2-2026-04-22.md", "archive/2026-04/cold-email-audit-v2-2026-04-22.md"),
    ("DEPLOY_AUTO_SETUP.md", "archive/2026-04/DEPLOY_AUTO_SETUP.md"),
    ("SCALING_RECOMMENDATION.md", "archive/2026-04/SCALING_RECOMMENDATION.md"),
    ("scaling_strategy_research.md", "archive/2026-04/scaling_strategy_research.md"),
    ("instantly_lead_finder_research.md", "archive/2026-04/instantly_lead_finder_research.md"),
    ("jorge-reply-and-ai-agent-update-2026-04-22.md", "archive/2026-04/jorge-reply-and-ai-agent-update-2026-04-22.md"),
    ("AD_LAUNCH_PLAN_2026-04-26.md", "archive/2026-04/AD_LAUNCH_PLAN_2026-04-26.md"),
    ("Instantlyoldemail.md", "archive/2026-04/Instantlyoldemail.md"),
    ("NEXT_STEP.md", "archive/2026-04/NEXT_STEP_2026-04-26_archive.md"),  # the historical NEXT_STEP archive
]

print("== fetching live main SHA ==")
ref = req("GET", f"/repos/{REPO}/git/refs/heads/{BRANCH}")
main_sha = ref["object"]["sha"]
print(f"main SHA: {main_sha}")

# Build tree entries
tree_entries = []

# ADDs and the new-path side of MOVES: read content + create blob
def make_blob(path_on_disk):
    with open(path_on_disk, "rb") as f:
        content = f.read()
    blob = req("POST", f"/repos/{REPO}/git/blobs",
               {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    return blob["sha"]

print(f"\n== creating blobs for {len(ADDS)} adds + {len(MOVES)} moves ==")
for relpath in ADDS:
    disk = os.path.join(ROOT, relpath)
    if not os.path.exists(disk):
        print(f"  ! SKIP {relpath} (not on disk)")
        continue
    sha = make_blob(disk)
    mode = "100755" if relpath.endswith(".sh") or relpath.endswith(".py") else "100644"
    tree_entries.append({"path": relpath, "mode": mode, "type": "blob", "sha": sha})
    print(f"  + {relpath:<55} {sha[:7]}")

for old_path, new_path in MOVES:
    disk = os.path.join(ROOT, new_path)
    if not os.path.exists(disk):
        print(f"  ! SKIP move {old_path} -> {new_path} (not on disk)")
        continue
    sha = make_blob(disk)
    # ADD-only — duplicate content at new path. Old-path deletion happens in a follow-up commit.
    tree_entries.append({"path": new_path, "mode": "100644", "type": "blob", "sha": sha})
    print(f"  M {old_path:<50} -> {new_path}")

# Build new tree based on existing main tree
print(f"\n== creating new tree with {len(tree_entries)} entries on top of {main_sha[:7]} ==")
tree = req("POST", f"/repos/{REPO}/git/trees", {
    "base_tree": main_sha, "tree": tree_entries
})
tree_sha = tree["sha"]
print(f"new tree SHA: {tree_sha}")

# Create commit
print("\n== creating commit ==")
msg = """docs(audit): live-API audit + master prompt + 23 archive moves (2026-04-27)

Verified-live state across Instantly · Brevo · ElevenLabs · GitHub · Firebase · Slack · Notion APIs.

NEW:
- MASTER_PROMPT.md — session-start prompt with §4 verified-live state (re-verify weekly Mondays)
- AUDIT_DELTA_2026-04-27.md — doc-vs-reality reconciliation table + 5 critical fixes
- tools/regen_system_inventory.sh + tools/_regen_inventory.py — autogen function inventory
- tools/_session_push.py — autonomous Git Data API push helper

UPDATED:
- NEXT_STEP.md — stripped 472 lines -> 92 lines, one big rock per HR#8, archive of history
- CLAUDE.md — Instantly campaigns 5 -> 10 active (live), ElevenLabs agents 3 -> 5 (live)
- SYSTEM.md — autogen 174-function inventory + 37 cron schedules section

ARCHIVED to archive/2026-04/ (23 files):
- 14 historical audits + session handoffs
- 1 byte-identical 51KB Instantly duplicate
- 8 misc reports + the old NEXT_STEP

Surfaced 2 silent bugs needing P1 attention:
- Calendly->Brevo bridge (list 30 has 2 self-tests, real bookings don't land)
- Brevo emails last 7d all to Alex's gmail (no real-prospect nurture firing)
"""
commit = req("POST", f"/repos/{REPO}/git/commits", {
    "message": msg, "tree": tree_sha, "parents": [main_sha]
})
new_commit_sha = commit["sha"]
print(f"new commit SHA: {new_commit_sha}")

# Update ref
print(f"\n== updating refs/heads/{BRANCH} ==")
updated = req("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {
    "sha": new_commit_sha, "force": False
})
print(f"updated: {updated['object']['sha']}")
print(f"\n✅ DONE. View: https://github.com/{REPO}/commit/{new_commit_sha}")
