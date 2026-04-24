#!/usr/bin/env python3
"""
JegoRoom skill — show_hot.py

Query Firestore intent_accounts for hot (or warming) accounts.
Print a ranked list with score, signal count, last-signal summary,
and hours since hot_since.

Usage:
    python3 skills/jegoroom/scripts/show_hot.py
    python3 skills/jegoroom/scripts/show_hot.py --min-score 70 --limit 20
    python3 skills/jegoroom/scripts/show_hot.py --warming  # show 50-69
    python3 skills/jegoroom/scripts/show_hot.py --ignore rolex-mx.com --reason "duplicate"
    python3 skills/jegoroom/scripts/show_hot.py --output json

HR-6 compliance:
    Every account in the output includes the Firestore document ID
    that was actually read — proof the numbers aren't fabricated.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Optional

# Let the skill scripts import from tools/jegoroom/common.py.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "tools", "jegoroom"))
from common import get_db, log  # noqa: E402


def _fmt_hours(ts) -> str:
    """Format a Firestore timestamp as 'N hours ago'."""
    if ts is None:
        return "never"
    try:
        # Firestore returns datetime objects when using firebase-admin
        if hasattr(ts, "isoformat"):
            dt = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        delta_s = (datetime.now(timezone.utc) - dt).total_seconds()
        if delta_s < 3600:
            return f"{int(delta_s/60)}m ago"
        if delta_s < 86400:
            return f"{int(delta_s/3600)}h ago"
        return f"{int(delta_s/86400)}d ago"
    except Exception:
        return str(ts)[:20]


def query_accounts(min_score: int, limit: int, ignore_flagged: bool = True) -> list:
    """Query intent_accounts ordered by score descending."""
    db = get_db()
    q = (
        db.collection("intent_accounts")
        .where("score_30d", ">=", min_score)
        .order_by("score_30d", direction="DESCENDING")
        .limit(limit)
    )
    out = []
    for doc in q.stream():
        d = doc.to_dict() or {}
        if ignore_flagged and d.get("ignored") is True:
            continue
        d["_id"] = doc.id
        out.append(d)
    return out


def format_row(a: dict, show_signal: bool = True) -> str:
    name = a.get("company_name") or "(unknown)"
    domain = a.get("domain") or "(no domain)"
    city = a.get("city") or "—"
    score = a.get("score_30d", 0)
    sig_count = a.get("signals_30d", 0)
    hot_since = _fmt_hours(a.get("hot_since"))
    last = _fmt_hours(a.get("last_signal_at"))
    line = (
        f"  {score:>3}/100  {name[:40]:40s}  "
        f"{domain[:32]:32s}  "
        f"city={city[:18]:18s}  "
        f"signals={sig_count}  "
        f"hot_since={hot_since}  "
        f"last={last}  "
        f"[id={a['_id']}]"
    )
    if show_signal and a.get("signal_history"):
        head = a["signal_history"][0]
        summary = (head.get("summary") or "")[:120]
        line += f"\n      ↳ {summary}"
    return line


def ignore_account(account_id: str, reason: str) -> bool:
    """Flag an account as ignored (false-positive). Never delete."""
    db = get_db()
    ref = db.collection("intent_accounts").document(account_id)
    snap = ref.get()
    if not snap.exists:
        log(f"❌ account {account_id} not found")
        return False
    ref.update({
        "ignored": True,
        "ignored_reason": reason,
        "ignored_at": datetime.now(timezone.utc),
    })
    log(f"✅ flagged {account_id} as ignored: {reason}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-score", type=int, default=70, help="Minimum score_30d")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--warming", action="store_true", help="Show warming (50-69) tier")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    ap.add_argument("--ignore", type=str, help="Flag an account as ignored (false-positive)")
    ap.add_argument("--reason", type=str, default="manual review", help="Reason for --ignore")
    args = ap.parse_args()

    if args.ignore:
        ok = ignore_account(args.ignore, args.reason)
        sys.exit(0 if ok else 1)

    if args.warming:
        args.min_score = 50
        accounts = query_accounts(args.min_score, args.limit)
        # Filter to 50-69 band only
        accounts = [a for a in accounts if a.get("score_30d", 0) < 70]
    else:
        accounts = query_accounts(args.min_score, args.limit)

    if args.output == "json":
        # JSON output for programmatic consumption
        print(json.dumps([
            {
                "account_id": a["_id"],
                "company_name": a.get("company_name"),
                "domain": a.get("domain"),
                "city": a.get("city"),
                "score_30d": a.get("score_30d"),
                "signals_30d": a.get("signals_30d"),
                "is_hot": a.get("is_hot"),
                "hot_since": a["hot_since"].isoformat() if a.get("hot_since") else None,
                "last_signal_at": a["last_signal_at"].isoformat() if a.get("last_signal_at") else None,
                "last_signal_summary": (a.get("signal_history") or [{}])[0].get("summary"),
            }
            for a in accounts
        ], indent=2))
        return

    label = "WARMING" if args.warming else "HOT"
    print(f"\n🔥 JegoRoom — {label} accounts (score >= {args.min_score})")
    print(f"   {len(accounts)} account(s) returned from Firestore intent_accounts\n")
    if not accounts:
        print("   (no accounts meet the threshold — collectors may need time to warm up)")
        return
    for a in accounts:
        print(format_row(a))
    print()


if __name__ == "__main__":
    main()
