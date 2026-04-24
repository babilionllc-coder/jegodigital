#!/usr/bin/env python3
"""
JegoRoom Collector 1 — Hiring Signals via SerpAPI.

Queries Indeed MX, OCC Mundial, Computrabajo for MX real estate
companies hiring marketing / digital / community-manager / ventas roles.

Hypothesis: a RE agency posting a marketing job = they're scaling and
know they need marketing infrastructure. That's a warm prospect.

Signal weight: 7-8 (domain knowledge — not nuclear, but high-intent).

Run cadence: daily 09:00 CDMX via GitHub Actions.
Cost: ~20 SerpAPI calls/day (within free tier).

Usage:
    python3 tools/jegoroom/collect_hiring.py
    python3 tools/jegoroom/collect_hiring.py --dry-run  # don't write to Firestore

Env:
    SERPAPI_KEY             required
    FIREBASE_ADMIN_SA_JSON  required (unless --dry-run)
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests

# Allow running as `python3 tools/jegoroom/collect_hiring.py`
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    write_signal, write_run_log, log, looks_like_mx_re,
)


SERPAPI_URL = "https://serpapi.com/search"

# 3 job boards × 4 role queries = 12 queries per run.
# Each returns up to 10 organic results. So ~120 candidate signals/day.
QUERIES = [
    # Indeed MX
    ('site:indeed.com.mx', '"inmobiliaria" marketing'),
    ('site:indeed.com.mx', '"inmobiliaria" community manager'),
    ('site:indeed.com.mx', '"inmobiliaria" "social media"'),
    ('site:indeed.com.mx', '"bienes raíces" "ejecutivo de ventas"'),
    # OCC Mundial
    ('site:occ.com.mx', '"inmobiliaria" marketing'),
    ('site:occ.com.mx', '"inmobiliaria" "marketing digital"'),
    ('site:occ.com.mx', '"desarrollador inmobiliario" marketing'),
    # Computrabajo MX
    ('site:computrabajo.com.mx', '"inmobiliaria" marketing'),
    ('site:computrabajo.com.mx', '"inmobiliaria" "community manager"'),
    ('site:computrabajo.com.mx', '"inmobiliaria" digital'),
    # LinkedIn Jobs MX (public-indexed)
    ('site:linkedin.com/jobs', '"inmobiliaria" "marketing manager" México'),
    ('site:linkedin.com/jobs', '"real estate" marketing Mexico'),
]


def _serpapi_search(q: str, api_key: str, num: int = 10) -> list:
    """Return the list of organic_results for a SerpAPI query."""
    params = {
        "engine": "google",
        "q": q,
        "num": num,
        "hl": "es",
        "gl": "mx",
        "api_key": api_key,
    }
    try:
        r = requests.get(SERPAPI_URL, params=params, timeout=20)
        if r.status_code != 200:
            log(f"  ⚠️  SerpAPI HTTP {r.status_code} for {q!r}")
            return []
        data = r.json()
        return data.get("organic_results", []) or []
    except Exception as e:
        log(f"  ⚠️  SerpAPI exception for {q!r}: {e}")
        return []


def _extract_company_from_title(title: str, board: str) -> Optional[str]:
    """Extract the hiring company name from a job-board listing title.

    Different boards format differently:
      Indeed:        "Marketing Manager - Grupo ABC - Cancún"
      OCC:           "Marketing Digital en Grupo Inmobiliario ABC"
      Computrabajo:  "Community Manager | Grupo Inmobiliario ABC"
      LinkedIn Jobs: "Grupo ABC hiring Marketing Manager"

    Heuristic — not perfect. The Gemini scorer cleans this up later.
    """
    if not title:
        return None
    title = title.strip()

    if "indeed" in board:
        # Pattern: "<Role> - <Company> - <City>"
        parts = [p.strip() for p in title.split(" - ")]
        if len(parts) >= 2:
            return parts[1]
    elif "occ.com" in board:
        # Pattern: "<Role> en <Company>" or "<Role> | <Company>"
        for sep in [" en ", " | ", " - "]:
            if sep in title:
                return title.split(sep, 1)[1].strip()
    elif "computrabajo" in board:
        for sep in [" | ", " - ", " en "]:
            if sep in title:
                return title.split(sep, 1)[1].strip()
    elif "linkedin" in board:
        # "Company hiring Role" pattern
        if " hiring " in title:
            return title.split(" hiring ", 1)[0].strip()

    return None


def _board_from_link(link: str) -> str:
    for board in ["indeed.com.mx", "occ.com.mx", "computrabajo.com.mx", "linkedin.com/jobs"]:
        if board in link:
            return board
    return "unknown"


def run(dry_run: bool = False) -> dict:
    """Execute the full hiring signal collection pass.

    Returns operational stats dict.
    """
    api_key = os.environ.get("SERPAPI_KEY")
    if not api_key:
        log("❌ SERPAPI_KEY not set in environment")
        return {"ok": False, "error": "SERPAPI_KEY missing"}

    started = datetime.now(timezone.utc)
    log(f"🔍 JegoRoom hiring collector starting (dry_run={dry_run})")

    total_fetched = 0
    signals_written = 0
    icp_rejected = 0
    errors = 0

    for site_op, query_tail in QUERIES:
        full_query = f"{site_op} {query_tail}"
        log(f"  Q: {full_query}")
        results = _serpapi_search(full_query, api_key, num=10)
        total_fetched += len(results)

        for r in results:
            link = (r.get("link") or "").strip()
            title = (r.get("title") or "").strip()
            snippet = (r.get("snippet") or "").strip()
            if not link or not title:
                continue

            board = _board_from_link(link)
            company = _extract_company_from_title(title, board)

            # Quick ICP gate
            haystack = f"{title} {snippet} {company or ''}"
            if not looks_like_mx_re(haystack):
                icp_rejected += 1
                continue

            raw = {
                "board": board,
                "title": title,
                "link": link,
                "snippet": snippet,
                "serp_query": full_query,
            }

            if dry_run:
                log(f"    [DRY] company={company!r} title={title[:60]!r}")
                signals_written += 1
                continue

            try:
                write_signal(
                    source="hiring_serpapi",
                    unique_key=link,  # SerpAPI job URL is stable per listing
                    raw=raw,
                    company_hint=company,
                    city_hint=None,  # scorer will extract from snippet
                    signal_type="hiring",
                    raw_strength=8,  # hiring = strong signal, scorer may tune
                )
                signals_written += 1
            except Exception as e:
                log(f"    ❌ write failed: {e}")
                errors += 1

        # Gentle pacing to stay well under SerpAPI rate limits.
        time.sleep(1)

    duration_s = (datetime.now(timezone.utc) - started).total_seconds()
    log(
        f"✅ Hiring collector done in {duration_s:.1f}s: "
        f"fetched={total_fetched} signals_written={signals_written} "
        f"icp_rejected={icp_rejected} errors={errors}"
    )

    if not dry_run:
        write_run_log(
            collector="hiring_serpapi",
            started_at=started,
            signals_written=signals_written,
            errors=errors,
            status="ok" if errors == 0 else "partial",
            notes=f"queries={len(QUERIES)} fetched={total_fetched} icp_rejected={icp_rejected}",
        )

    return {
        "ok": True,
        "signals_written": signals_written,
        "icp_rejected": icp_rejected,
        "errors": errors,
        "duration_s": duration_s,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Don't write to Firestore")
    args = ap.parse_args()
    result = run(dry_run=args.dry_run)
    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
