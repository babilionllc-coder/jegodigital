#!/usr/bin/env python3
"""
JegoRoom skill — daily_digest.py

Morning intent brief. Covers the last 24h:
    • New hot accounts (cold→hot transitions)
    • Accounts that cooled off (score dropped below 70)
    • Top 10 "warming" accounts (score 50-69)
    • Signals collected yesterday by source
    • Signals Gemini rejected (ICP sanity check)

Output formats:
    --output text    human-readable (default)
    --output slack   Slack markdown (post to webhook)
    --output telegram Telegram HTML

Usage:
    python3 skills/jegoroom/scripts/daily_digest.py
    python3 skills/jegoroom/scripts/daily_digest.py --output slack
    python3 skills/jegoroom/scripts/daily_digest.py --output telegram --post
"""

import argparse
import os
import sys
from datetime import datetime, timezone, timedelta

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "tools", "jegoroom"))
from common import get_db, log  # noqa: E402


def _fetch_window(hours: int = 24):
    """Pull intent activity from the last N hours."""
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    # New hot transitions
    new_hot = list(
        db.collection("intent_hot_transitions")
        .where("created_at", ">=", cutoff)
        .stream()
    )

    # All current hot accounts (to find ones that cooled off — we compute
    # a heuristic: hot_since set but is_hot now false)
    cooled = []
    for doc in db.collection("intent_accounts").where("hot_since", "!=", None).limit(100).stream():
        d = doc.to_dict() or {}
        if not d.get("is_hot") and d.get("hot_since"):
            cooled.append({**d, "_id": doc.id})

    # Warming tier (50-69)
    warming = []
    for doc in (
        db.collection("intent_accounts")
        .where("score_30d", ">=", 50)
        .order_by("score_30d", direction="DESCENDING")
        .limit(30)
        .stream()
    ):
        d = doc.to_dict() or {}
        if d.get("ignored"):
            continue
        score = d.get("score_30d", 0)
        if 50 <= score < 70:
            warming.append({**d, "_id": doc.id})
        if len(warming) >= 10:
            break

    # Signals in last 24h by source
    signals_by_source = {}
    icp_rejected = 0
    for doc in (
        db.collection("intent_signals")
        .where("collected_at", ">=", cutoff)
        .limit(500)
        .stream()
    ):
        d = doc.to_dict() or {}
        src = d.get("source", "unknown")
        signals_by_source[src] = signals_by_source.get(src, 0) + 1
        if d.get("icp_rejected"):
            icp_rejected += 1

    return {
        "new_hot": [{**(h.to_dict() or {}), "_id": h.id} for h in new_hot],
        "cooled": cooled,
        "warming": warming,
        "signals_by_source": signals_by_source,
        "icp_rejected": icp_rejected,
    }


def render_text(data: dict) -> str:
    lines = []
    lines.append("🎯 JegoRoom Daily Intent Digest — last 24h")
    lines.append("=" * 60)
    lines.append("")

    # New hot
    lines.append(f"🔥 NEW HOT ACCOUNTS ({len(data['new_hot'])})")
    if not data["new_hot"]:
        lines.append("  (none — collectors may still be warming up)")
    else:
        for h in data["new_hot"][:10]:
            lines.append(
                f"  {h.get('company_name') or '(unknown)'}  "
                f"[{h.get('domain') or 'no-domain'}]  "
                f"score={h.get('score_30d', '?')}"
            )
            if h.get("trigger_summary"):
                lines.append(f"    ↳ {h['trigger_summary'][:140]}")
    lines.append("")

    # Warming
    lines.append(f"🌡️  WARMING (score 50-69) — top 10 to watch")
    if not data["warming"]:
        lines.append("  (none)")
    else:
        for w in data["warming"]:
            lines.append(
                f"  {w.get('score_30d', 0):>3}  "
                f"{(w.get('company_name') or '(unknown)')[:40]:40s}  "
                f"[{w.get('domain') or '—'}]"
            )
    lines.append("")

    # Cooled
    lines.append(f"❄️  COOLED OFF ({len(data['cooled'])})")
    if data["cooled"]:
        for c in data["cooled"][:10]:
            lines.append(
                f"  {(c.get('company_name') or '(unknown)')[:40]:40s}  "
                f"now_score={c.get('score_30d', 0)}"
            )
    else:
        lines.append("  (none)")
    lines.append("")

    # Signal counts
    lines.append("📥 Signals collected (24h) by source:")
    if not data["signals_by_source"]:
        lines.append("  (none)")
    else:
        for src, count in sorted(data["signals_by_source"].items(), key=lambda x: -x[1]):
            lines.append(f"  {src:30s}  {count}")
    lines.append(f"  ({data['icp_rejected']} rejected by Gemini ICP filter)")
    lines.append("")

    lines.append("Next step: run `python3 skills/jegoroom/scripts/show_hot.py` to")
    lines.append("see the full hot-account roster + open signals for each.")
    return "\n".join(lines)


def render_slack(data: dict) -> str:
    """Slack-flavored markdown — bold with *asterisks*, code with `backticks`."""
    parts = []
    parts.append("*🎯 JegoRoom Daily Intent Digest*")
    parts.append(f"• 🔥 *{len(data['new_hot'])} new hot* accounts (last 24h)")
    parts.append(f"• 🌡️ *{len(data['warming'])} warming* accounts (50-69)")
    parts.append(f"• ❄️ *{len(data['cooled'])} cooled off*")
    total_signals = sum(data["signals_by_source"].values())
    parts.append(f"• 📥 *{total_signals} signals* collected ({data['icp_rejected']} ICP-rejected)")
    parts.append("")
    if data["new_hot"]:
        parts.append("*New hot accounts:*")
        for h in data["new_hot"][:5]:
            parts.append(
                f"• `{h.get('score_30d','?')}` — "
                f"*{h.get('company_name') or '?'}* "
                f"({h.get('domain') or 'no-domain'})"
            )
    return "\n".join(parts)


def render_telegram(data: dict) -> str:
    """Telegram HTML — <b>bold</b>, <code>code</code>."""
    parts = []
    parts.append("<b>🎯 JegoRoom Daily Intent Digest</b>")
    parts.append(f"🔥 <b>{len(data['new_hot'])} new hot</b> accounts (last 24h)")
    parts.append(f"🌡️ <b>{len(data['warming'])} warming</b> accounts (50-69)")
    parts.append(f"❄️ <b>{len(data['cooled'])} cooled off</b>")
    total = sum(data["signals_by_source"].values())
    parts.append(f"📥 <b>{total} signals</b> collected ({data['icp_rejected']} ICP-rejected)")
    if data["new_hot"]:
        parts.append("")
        parts.append("<b>New hot:</b>")
        for h in data["new_hot"][:5]:
            parts.append(
                f"• <code>{h.get('score_30d','?')}</code> — "
                f"<b>{h.get('company_name') or '?'}</b> "
                f"({h.get('domain') or 'no-domain'})"
            )
    return "\n".join(parts)


def post_slack(body: str) -> bool:
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        log("❌ SLACK_WEBHOOK_URL not set")
        return False
    try:
        r = requests.post(url, json={"text": body}, timeout=15)
        return r.status_code == 200
    except Exception as e:
        log(f"❌ slack post failed: {e}")
        return False


def post_telegram(body: str) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat_id):
        log("❌ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")
        return False
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        r = requests.post(url, json={
            "chat_id": chat_id,
            "text": body,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }, timeout=15)
        return r.status_code == 200
    except Exception as e:
        log(f"❌ telegram post failed: {e}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", choices=["text", "slack", "telegram"], default="text")
    ap.add_argument("--post", action="store_true",
                    help="If set with --output=slack|telegram, actually post (not just print)")
    ap.add_argument("--hours", type=int, default=24)
    args = ap.parse_args()

    data = _fetch_window(hours=args.hours)

    if args.output == "text":
        print(render_text(data))
    elif args.output == "slack":
        body = render_slack(data)
        print(body)
        if args.post:
            ok = post_slack(body)
            print(f"\nSlack post: {'✅' if ok else '❌'}")
    elif args.output == "telegram":
        body = render_telegram(data)
        print(body)
        if args.post:
            ok = post_telegram(body)
            print(f"\nTelegram post: {'✅' if ok else '❌'}")


if __name__ == "__main__":
    main()
