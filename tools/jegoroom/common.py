#!/usr/bin/env python3
"""
JegoRoom — shared utilities for signal collectors + scoring engine.

JegoRoom is the in-house Common Room clone: 24/7 intent signal detector
for MX real estate prospecting. Reads signals from public APIs (SerpAPI,
DataForSEO, Firecrawl), scores them with Gemini, aggregates into hot
accounts, alerts Alex via Telegram when score >= 70.

Sibling system to JegoClay (enrichment): JegoRoom finds hot accounts,
JegoClay enriches them, outreach fires.

Firestore shape:
    intent_signals/{auto}
        source          str   # "hiring_serpapi" | "gmaps_review" | "launch_news"
        collected_at    ts
        raw             dict  # original API payload
        company_hint    str   # best-guess company name
        city_hint       str   # best-guess city
        signal_type     str   # "hiring" | "negative_review" | "new_launch"
        raw_strength    int   # collector's first-pass 1-10 (refined by scorer)
        scored          bool  # false until score_accounts.py processes
        account_domain  str   # set after scoring (null before)

    intent_accounts/{domain}
        domain          str
        company_name    str
        city            str
        signals_30d     int   # count of signals in last 30 days
        score_30d       int   # weighted + decayed score
        is_hot          bool  # score_30d >= 70
        hot_since       ts    # when is_hot first became true (null if never hot)
        last_signal_at  ts
        signal_history  list  # last 20 signal IDs + summaries
        updated_at      ts

    intent_runs/{auto}  (operational telemetry)
        collector       str
        started_at      ts
        ended_at        ts
        signals_written int
        errors          int
        status          str   # "ok" | "partial" | "failed"

Author: Alex Jego + Claude
First shipped: 2026-04-23 PM
"""

import json
import os
import sys
import time
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("❌ firebase-admin not installed. Run: pip install firebase-admin", file=sys.stderr)
    sys.exit(1)


# ============================================================================
# FIRESTORE CLIENT
# ============================================================================

_db = None


def get_db():
    """Return a singleton Firestore client.

    Requires FIREBASE_ADMIN_SA_JSON env var (JSON string of service account).
    Local dev: read from .secrets/firebase-admin-sa.json.
    """
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        sa_json = os.environ.get("FIREBASE_ADMIN_SA_JSON")
        if sa_json:
            sa_dict = json.loads(sa_json)
            cred = credentials.Certificate(sa_dict)
        else:
            # Local dev fallback
            local_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "..", "..", ".secrets", "firebase-admin-sa.json"
            )
            if not os.path.exists(local_path):
                raise RuntimeError(
                    "FIREBASE_ADMIN_SA_JSON env var not set and no local SA file. "
                    "Set the env var in GitHub Actions or drop a service account "
                    "JSON at .secrets/firebase-admin-sa.json"
                )
            cred = credentials.Certificate(local_path)
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    return _db


# ============================================================================
# SIGNAL WRITER
# ============================================================================

def signal_id(source: str, unique_key: str) -> str:
    """Deterministic signal ID based on source + unique key.

    Lets us idempotently re-run collectors without duplicating signals.
    """
    h = hashlib.sha256(f"{source}:{unique_key}".encode("utf-8")).hexdigest()[:20]
    return f"{source}_{h}"


def write_signal(
    source: str,
    unique_key: str,
    raw: dict,
    company_hint: Optional[str] = None,
    city_hint: Optional[str] = None,
    signal_type: str = "unknown",
    raw_strength: int = 5,
) -> str:
    """Write a signal to Firestore. Idempotent on (source, unique_key).

    Returns the signal document ID.
    """
    db = get_db()
    sid = signal_id(source, unique_key)
    ref = db.collection("intent_signals").document(sid)
    existing = ref.get()
    if existing.exists:
        # Touch last_seen but don't overwrite first collection time
        ref.update({"last_seen_at": firestore.SERVER_TIMESTAMP})
        return sid

    ref.set({
        "source": source,
        "unique_key": unique_key,
        "collected_at": firestore.SERVER_TIMESTAMP,
        "last_seen_at": firestore.SERVER_TIMESTAMP,
        "raw": raw,
        "company_hint": company_hint,
        "city_hint": city_hint,
        "signal_type": signal_type,
        "raw_strength": int(max(1, min(10, raw_strength))),
        "scored": False,
        "account_domain": None,
    })
    return sid


def write_run_log(
    collector: str,
    started_at: datetime,
    signals_written: int,
    errors: int,
    status: str = "ok",
    notes: str = "",
) -> None:
    """Log a collector run for operational visibility."""
    db = get_db()
    db.collection("intent_runs").add({
        "collector": collector,
        "started_at": started_at,
        "ended_at": firestore.SERVER_TIMESTAMP,
        "signals_written": signals_written,
        "errors": errors,
        "status": status,
        "notes": notes,
    })


# ============================================================================
# SCORING HELPERS
# ============================================================================

def decay_weight(signal_age_days: float) -> float:
    """Exponential decay: fresh signals count more.

    Half-life = 14 days. A 14-day-old signal is worth 50% of a fresh one.
    A 30-day-old signal is worth ~23%. Signals older than 60 days drop out.
    """
    if signal_age_days > 60:
        return 0.0
    return 0.5 ** (signal_age_days / 14.0)


def signal_type_weight(signal_type: str) -> float:
    """Base weight multiplier by signal type (domain knowledge)."""
    return {
        "negative_review": 1.0,    # customer pain = nuclear signal
        "explicit_buy":    1.0,    # "recommend a marketing agency?" = nuclear
        "hiring":          0.8,    # scaling = need for marketing
        "new_launch":      0.7,    # launch = urgency + budget
        "tech_debt":       0.6,    # old site / broken forms = opportunity
        "competitor_switch": 0.7,  # unhappy with current = window
        "unknown":         0.5,
    }.get(signal_type, 0.5)


# ============================================================================
# MX REAL ESTATE ICP FILTERS
# ============================================================================

MX_CITIES = [
    "cancún", "cancun", "tulum", "playa del carmen", "playa", "cozumel",
    "cdmx", "ciudad de méxico", "ciudad de mexico", "mexico city",
    "guadalajara", "gdl", "monterrey", "mty", "mérida", "merida",
    "puerto vallarta", "pvr", "los cabos", "cabo",
    "puebla", "querétaro", "queretaro", "san miguel de allende",
    "oaxaca", "veracruz",
]

MX_RE_KEYWORDS = [
    "inmobiliaria", "inmobiliarios", "bienes raíces", "bienes raices",
    "real estate", "realtor", "realty", "realtors",
    "desarrollo inmobiliario", "desarrollador", "developer",
    "pre-venta", "preventa", "pre venta",
    "venta de propiedades", "venta de casas", "venta de departamentos",
    "broker inmobiliario", "agente inmobiliario", "corredor inmobiliario",
]

NOT_MX_RE_KEYWORDS = [
    # Things that match RE-ish keywords but aren't our ICP
    "abogado", "notario", "seguro", "hipoteca",
    "mantenimiento", "limpieza", "mudanza",
]


def looks_like_mx_re(text: str) -> bool:
    """Quick heuristic ICP filter. Final ICP call is by the Gemini scorer."""
    if not text:
        return False
    t = text.lower()
    has_re = any(k in t for k in MX_RE_KEYWORDS)
    has_mx = any(c in t for c in MX_CITIES) or "méxico" in t or "mexico" in t
    has_negative = any(k in t for k in NOT_MX_RE_KEYWORDS)
    return has_re and has_mx and not has_negative


# ============================================================================
# CLI HELPERS
# ============================================================================

def log(msg: str) -> None:
    """Timestamped stdout log — picked up by GitHub Actions console."""
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)


if __name__ == "__main__":
    # Smoke test: ensure we can connect to Firestore + write a test signal.
    log("Smoke test: connecting to Firestore...")
    db = get_db()
    log("✅ Connected")
    log("Writing test signal...")
    sid = write_signal(
        source="smoke_test",
        unique_key=f"test_{int(time.time())}",
        raw={"test": True},
        company_hint="JegoDigital",
        city_hint="Cancún",
        signal_type="unknown",
        raw_strength=1,
    )
    log(f"✅ Wrote signal {sid}")
    log("Cleaning up...")
    db.collection("intent_signals").document(sid).delete()
    log("✅ Smoke test passed")
