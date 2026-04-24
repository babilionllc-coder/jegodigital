#!/usr/bin/env python3
"""
Pull live cold-call performance from the ElevenLabs Conversations API for each
of the 3 split-test agents (A/SEO, B/Free Audit, C/Free Setup) and write a
normalized JSON to /tmp/report_input.json.

ELEVENLABS_API_KEY is read from .secrets/.env at the jegodigital repo root
(chicken-and-egg safe — never commit, always read).

Usage:
    python3 fetch_cold_call_data.py [--since-hours 24]
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

AGENTS = [
    {"name": "Offer A — SEO Pitch", "offer_label": "SEO visibility hook",
     "agent_id": "agent_0701kq0drf5ceq6t5md9p6dt6xbb"},
    {"name": "Offer B — Free Audit", "offer_label": "Free 7-area audit",
     "agent_id": "agent_4701kq0drd9pf9ebbqcv6b3bb2zw"},
    {"name": "Offer C — Free Setup", "offer_label": "Free AI lead capture install",
     "agent_id": "agent_2701kq0drbt9f738pxjem3zc3fnb"},
]

OUT = Path("/tmp/report_input.json")
REPO_ROOT = Path("/Users/mac/Desktop/Websites/jegodigital")
SANDBOX_ROOT = Path("/sessions/inspiring-optimistic-bohr/mnt/jegodigital")


def load_api_key():
    for root in (REPO_ROOT, SANDBOX_ROOT):
        env_path = root / ".secrets" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("ELEVENLABS_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    if os.getenv("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"]
    print("ERROR: ELEVENLABS_API_KEY not in .secrets/.env or env", file=sys.stderr)
    sys.exit(2)


def fetch_agent_conversations(agent_id, since_ts, api_key, page_size=100):
    """Iterate through pages until we cross the since_ts watermark."""
    out = []
    cursor = None
    while True:
        params = {"agent_id": agent_id, "page_size": str(page_size)}
        if cursor:
            params["cursor"] = cursor
        url = "https://api.elevenlabs.io/v1/convai/conversations?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"xi-api-key": api_key})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                page = json.loads(r.read())
        except urllib.error.HTTPError as e:
            print(f"ERROR: agent {agent_id} page fetch failed HTTP {e.code}", file=sys.stderr)
            break

        items = page.get("conversations", [])
        for c in items:
            ts = c.get("start_time_unix_secs", 0)
            if ts < since_ts:
                return out
            out.append(c)
        if not page.get("has_more") or not page.get("next_cursor"):
            return out
        cursor = page["next_cursor"]


def categorize(c):
    """Bucket a conversation by outcome."""
    status = c.get("status", "")
    duration = c.get("call_duration_secs", 0)
    summary = (c.get("transcript_summary") or c.get("call_summary_title") or "").lower()

    if status == "in-progress":
        return "in_progress"
    if duration < 8:
        return "instant_hangup"
    if "voicemail" in summary or "contestadora" in summary or "buzón" in summary:
        return "voicemail"
    if "did not connect" in summary or "no answer" in summary:
        return "no_answer"
    if status == "done" and duration >= 30:
        return "connected"
    return "other"


def audit_agreed(c):
    """Best-effort detection of 'lead said yes to audit' from summary text."""
    s = (c.get("transcript_summary") or "").lower()
    return any(k in s for k in ["agreed to audit", "accepted audit", "confirmó auditoría",
                                  "accept audit", "yes to audit"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since-hours", type=int, default=24)
    args = ap.parse_args()

    api_key = load_api_key()
    since_ts = int(time.time()) - args.since_hours * 3600

    totals = {"total_calls": 0, "connected": 0, "voicemail": 0,
              "instant_hangup": 0, "no_answer": 0, "audit_agreed": 0,
              "tool_errors": 0, "in_progress": 0}
    agents_out = []
    all_convs = []

    for agent in AGENTS:
        convs = fetch_agent_conversations(agent["agent_id"], since_ts, api_key)
        buckets = {"connected": 0, "voicemail": 0, "instant_hangup": 0,
                   "no_answer": 0, "in_progress": 0, "other": 0, "audit_agreed": 0,
                   "total_duration": 0}
        for c in convs:
            b = categorize(c)
            buckets[b] = buckets.get(b, 0) + 1
            buckets["total_duration"] += c.get("call_duration_secs", 0) or 0
            if audit_agreed(c):
                buckets["audit_agreed"] += 1
            all_convs.append({
                "agent_id": agent["agent_id"],
                "agent_name": agent["name"],
                "conv_id": c.get("conversation_id", ""),
                "bucket": b,
                "duration": c.get("call_duration_secs", 0),
                "summary_title": c.get("call_summary_title", ""),
            })
        call_count = len(convs)
        avg_dur = int(buckets["total_duration"] / call_count) if call_count else 0

        agents_out.append({
            **agent,
            "calls": call_count,
            "connected": buckets["connected"],
            "voicemail": buckets["voicemail"],
            "instant_hangup": buckets["instant_hangup"],
            "no_answer": buckets["no_answer"],
            "audit_agreed": buckets["audit_agreed"],
            "avg_duration_s": avg_dur,
        })
        totals["total_calls"] += call_count
        for k in ("connected", "voicemail", "instant_hangup", "no_answer",
                  "audit_agreed", "in_progress"):
            totals[k] += buckets.get(k, 0)

    out = {
        "totals": totals,
        "agents": agents_out,
        "conversations": all_convs,
        "window_hours": args.since_hours,
    }
    OUT.write_text(json.dumps(out, indent=2))
    t = totals
    print(f"OK · {t['total_calls']} calls · {t['connected']} connected · "
          f"{t['audit_agreed']} audits · {t['voicemail']} voicemail · "
          f"{t['instant_hangup']} instant hangups", file=sys.stderr)
    print(f"Written: {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
