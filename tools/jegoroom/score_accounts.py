#!/usr/bin/env python3
"""
JegoRoom Scoring Engine.

Reads new unscored intent_signals, normalizes + scores with Gemini 2.5-flash,
aggregates into intent_accounts with rolling-30d decayed scores.

Input  → Firestore `intent_signals` docs where scored==false
Output → Firestore `intent_accounts/{domain}` upserts + signal.scored=true

On cold→hot transition (score crossing 70), writes a dedicated
`intent_hot_transitions` doc that the Cloud Function trigger
(jegoRoomAlerts.js) watches and converts into a Telegram alert.

Run cadence: every 2 hours via GitHub Actions.
Cost: ~1 Gemini 2.5-flash call per new signal, ~$0.001 each.

Usage:
    python3 tools/jegoroom/score_accounts.py
    python3 tools/jegoroom/score_accounts.py --limit 20 --dry-run

Env:
    GEMINI_API_KEY          required
    FIREBASE_ADMIN_SA_JSON  required (unless --dry-run)
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    get_db, write_run_log, log, decay_weight, signal_type_weight,
)

try:
    from firebase_admin import firestore
except ImportError:
    print("firebase-admin required", file=sys.stderr)
    sys.exit(1)


GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

HOT_THRESHOLD = 70


SCORER_PROMPT = """You are the scoring engine for JegoDigital's intent detection system.
Target ICP: real estate agencies, brokers, and developers in Mexico. Our job is to
decide whether a raw intent signal (from a job board, review site, news feed, etc.)
points to a real MX real estate company with buying intent for marketing services,
and how strongly.

INPUT SIGNAL (raw data):
{raw_json}

Hint company name (may be wrong/missing): {company_hint}
Source: {source}
Signal type: {signal_type}

Return ONLY valid JSON with this exact shape:
{{
  "is_mx_real_estate": true|false,     // Is this actually an MX RE company?
  "company_name": "...",                // Cleaned canonical company name, or null
  "company_domain_guess": "...",        // Best-guess website domain (no protocol), or null
  "city": "...",                        // MX city if deducible, else null
  "decision_maker_hint": "...",         // Name or role of DM mentioned, else null
  "signal_strength_1_to_10": 7,         // How strong THIS signal is for buying intent
  "signal_summary": "...",              // ≤18 words, Spanish, what's happening
  "rejection_reason": null              // Set if is_mx_real_estate=false, null otherwise
}}

Scoring rubric (signal_strength_1_to_10):
 10 = Nuclear. Customer explicitly complaining "no me contestaron / muy lento", OR
      public post "¿recomiendan agencia de marketing inmobiliario?"
  9 = Hiring a Marketing Manager / Digital / Community Manager right now
  8 = Hiring other marketing-adjacent role (sales, growth, content)
  7 = New project launch, pre-venta announcement, ribbon cutting
  6 = Competitor switch signal, bad Google review mentioning marketing/tech
  5 = Generic "we're expanding" news
  4 = Peripheral mention only
  1-3 = Not useful

Reject (is_mx_real_estate=false) if:
 - Company is outside Mexico
 - Company is NOT real estate (insurance, mortgage, legal, etc. even if RE-adjacent)
 - Signal is about a competitor (other marketing agency)
 - Signal is about JegoDigital itself
 - Unreadable / malformed / clearly SEO spam
"""


def _gemini_call(prompt: str, api_key: str) -> Optional[dict]:
    """Call Gemini, extract the JSON object from response text."""
    url = f"{GEMINI_URL}?key={api_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }
    try:
        r = requests.post(url, json=body, timeout=30)
        if r.status_code != 200:
            log(f"  ⚠️  Gemini HTTP {r.status_code}: {r.text[:200]}")
            return None
        data = r.json()
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        # responseMimeType=application/json should already be clean JSON
        return json.loads(text)
    except json.JSONDecodeError as e:
        log(f"  ⚠️  Gemini returned non-JSON: {e}")
        return None
    except Exception as e:
        log(f"  ⚠️  Gemini exception: {e}")
        return None


def _normalize_domain(domain_guess: Optional[str]) -> Optional[str]:
    """Clean a domain guess into canonical form (lowercase, no protocol, no trailing slash)."""
    if not domain_guess:
        return None
    d = domain_guess.strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = re.sub(r"^www\.", "", d)
    d = d.split("/")[0].strip()
    # Basic sanity check
    if "." not in d or len(d) < 4 or len(d) > 80:
        return None
    return d


def _account_key(company_name: Optional[str], domain: Optional[str]) -> Optional[str]:
    """Pick a stable Firestore doc ID for an account.

    Prefer domain. Fall back to slugified company name. Return None if neither.
    """
    if domain:
        # Firestore doc IDs can't contain slashes — domain is safe.
        return domain
    if company_name:
        slug = re.sub(r"[^a-z0-9]+", "-", company_name.lower()).strip("-")
        if slug:
            return f"name_{slug[:60]}"
    return None


def _score_one_signal(sig_doc, api_key: str) -> Optional[dict]:
    """Score one signal. Returns the parsed Gemini response, or None."""
    sig = sig_doc.to_dict()
    prompt = SCORER_PROMPT.format(
        raw_json=json.dumps(sig.get("raw", {}), ensure_ascii=False)[:3000],
        company_hint=sig.get("company_hint") or "(none)",
        source=sig.get("source", "unknown"),
        signal_type=sig.get("signal_type", "unknown"),
    )
    return _gemini_call(prompt, api_key)


def _upsert_account(
    db,
    account_id: str,
    gemini: dict,
    signal_id: str,
    signal_raw_strength: int,
    signal_type: str,
) -> tuple:
    """Upsert an intent_accounts row. Returns (prev_score, new_score, was_hot, is_hot_now)."""
    ref = db.collection("intent_accounts").document(account_id)
    existing = ref.get()
    prev = existing.to_dict() if existing.exists else {}
    prev_score = int(prev.get("score_30d", 0))
    was_hot = bool(prev.get("is_hot", False))

    # New signal's contribution to rolling score.
    # This is a fresh signal (age 0d) so decay_weight(0) = 1.0.
    new_contribution = int(
        signal_raw_strength
        * signal_type_weight(signal_type)
        * decay_weight(0)
        * 10  # scale to 0-100 space (max single signal = 10 raw × 1.0 × 1.0 × 10 = 100)
    )
    # But cap a single signal's contribution so no one signal can pin a cold
    # account to hot — needs multiple signals OR extreme urgency.
    new_contribution = min(new_contribution, 55)

    new_score = min(100, prev_score + new_contribution)

    signal_history = prev.get("signal_history", [])
    signal_history.insert(0, {
        "signal_id": signal_id,
        "type": signal_type,
        "strength": signal_raw_strength,
        "summary": gemini.get("signal_summary", "")[:200],
        "at": datetime.now(timezone.utc).isoformat(),
    })
    signal_history = signal_history[:20]

    is_hot_now = new_score >= HOT_THRESHOLD

    update_data = {
        "domain": gemini.get("company_domain_guess") if account_id.startswith("name_") is False else None,
        "company_name": gemini.get("company_name") or prev.get("company_name"),
        "city": gemini.get("city") or prev.get("city"),
        "signals_30d": int(prev.get("signals_30d", 0)) + 1,
        "score_30d": new_score,
        "is_hot": is_hot_now,
        "last_signal_at": firestore.SERVER_TIMESTAMP,
        "signal_history": signal_history,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if is_hot_now and not was_hot:
        update_data["hot_since"] = firestore.SERVER_TIMESTAMP
    if not existing.exists:
        update_data["created_at"] = firestore.SERVER_TIMESTAMP

    ref.set(update_data, merge=True)

    # Hot transition → separate collection Cloud Function watches.
    if is_hot_now and not was_hot:
        db.collection("intent_hot_transitions").add({
            "account_id": account_id,
            "company_name": gemini.get("company_name"),
            "domain": gemini.get("company_domain_guess"),
            "city": gemini.get("city"),
            "score_30d": new_score,
            "triggered_by_signal": signal_id,
            "trigger_summary": gemini.get("signal_summary"),
            "created_at": firestore.SERVER_TIMESTAMP,
            "notified": False,
        })

    return prev_score, new_score, was_hot, is_hot_now


def run(limit: int = 200, dry_run: bool = False) -> dict:
    """Process up to `limit` unscored signals."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log("❌ GEMINI_API_KEY not set")
        return {"ok": False, "error": "GEMINI_API_KEY missing"}

    started = datetime.now(timezone.utc)
    log(f"🧮 JegoRoom scoring engine starting (limit={limit} dry_run={dry_run})")

    db = get_db()
    q = (
        db.collection("intent_signals")
        .where("scored", "==", False)
        .limit(limit)
    )
    docs = list(q.stream())
    log(f"  Found {len(docs)} unscored signals")

    scored = 0
    icp_rejected = 0
    errors = 0
    hot_transitions = 0

    for sig_doc in docs:
        gemini = _score_one_signal(sig_doc, api_key)
        if gemini is None:
            errors += 1
            continue

        if not gemini.get("is_mx_real_estate"):
            # Mark scored + rejected, don't upsert account.
            if not dry_run:
                sig_doc.reference.update({
                    "scored": True,
                    "scored_at": firestore.SERVER_TIMESTAMP,
                    "icp_rejected": True,
                    "icp_rejection_reason": gemini.get("rejection_reason"),
                    "gemini_raw": gemini,
                })
            icp_rejected += 1
            continue

        domain = _normalize_domain(gemini.get("company_domain_guess"))
        gemini["company_domain_guess"] = domain  # write the cleaned version
        account_id = _account_key(gemini.get("company_name"), domain)
        if not account_id:
            # Couldn't build a stable account key — keep signal but skip upsert.
            if not dry_run:
                sig_doc.reference.update({
                    "scored": True,
                    "scored_at": firestore.SERVER_TIMESTAMP,
                    "icp_rejected": False,
                    "skip_reason": "no_account_key",
                    "gemini_raw": gemini,
                })
            errors += 1
            continue

        strength = int(gemini.get("signal_strength_1_to_10", sig_doc.to_dict().get("raw_strength", 5)))

        if dry_run:
            log(
                f"  [DRY] {account_id} +{strength} ({gemini.get('signal_summary','')[:60]})"
            )
            scored += 1
            continue

        try:
            prev_score, new_score, was_hot, is_hot_now = _upsert_account(
                db,
                account_id,
                gemini,
                sig_doc.id,
                strength,
                sig_doc.to_dict().get("signal_type", "unknown"),
            )
            sig_doc.reference.update({
                "scored": True,
                "scored_at": firestore.SERVER_TIMESTAMP,
                "icp_rejected": False,
                "account_domain": account_id,
                "gemini_raw": gemini,
                "refined_strength": strength,
            })
            scored += 1
            if is_hot_now and not was_hot:
                hot_transitions += 1
                log(f"  🔥 HOT: {account_id} crossed {prev_score}→{new_score}")
        except Exception as e:
            log(f"  ❌ upsert failed for {account_id}: {e}")
            errors += 1

        # Gentle pacing for Gemini free-tier limits.
        time.sleep(0.4)

    duration_s = (datetime.now(timezone.utc) - started).total_seconds()
    log(
        f"✅ Scoring done in {duration_s:.1f}s: "
        f"scored={scored} icp_rejected={icp_rejected} "
        f"hot_transitions={hot_transitions} errors={errors}"
    )

    if not dry_run:
        write_run_log(
            collector="scoring_engine",
            started_at=started,
            signals_written=scored,
            errors=errors,
            status="ok" if errors == 0 else "partial",
            notes=(
                f"icp_rejected={icp_rejected} hot_transitions={hot_transitions}"
            ),
        )

    return {
        "ok": True,
        "scored": scored,
        "icp_rejected": icp_rejected,
        "hot_transitions": hot_transitions,
        "errors": errors,
        "duration_s": duration_s,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200, help="Max signals to process")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    result = run(limit=args.limit, dry_run=args.dry_run)
    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
