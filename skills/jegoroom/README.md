# JegoRoom — Operator Skill

**Ops reference for the `jegoroom` Claude skill.** For automatic invocation rules, see `SKILL.md`.

## What just got shipped (Phase 1 MVP — 2026-04-23 PM)

| Piece | Path | What it does |
|---|---|---|
| Shared Firestore + helpers | `tools/jegoroom/common.py` | Signal writer, score decay, ICP heuristics |
| Collector 1: Hiring | `tools/jegoroom/collect_hiring.py` | SerpAPI → Indeed/OCC/Computrabajo/LinkedIn Jobs |
| Scoring engine | `tools/jegoroom/score_accounts.py` | Gemini 2.5-flash → `intent_accounts` rolling 30d decayed score |
| Cron workflow | `.github/workflows/jegoroom.yml` | 09:00 CDMX hiring, 11:00 + 15:00 CDMX scoring |
| Hot-transition alert | `website/functions/jegoRoomAlerts.js` | Firestore trigger → Telegram HTML |
| Skill entry point | `skills/jegoroom/SKILL.md` | Describes trigger phrases + operations |
| Op 1: show_hot | `skills/jegoroom/scripts/show_hot.py` | Ranked list of hot/warming accounts |
| Op 2: daily_digest | `skills/jegoroom/scripts/daily_digest.py` | 24h intent brief (text / slack / telegram) |
| Op 3: enrich_and_push | `skills/jegoroom/scripts/enrich_and_push.py` | Dispatch JegoClay for 1 account → Airtable via MCP |

## What's NOT shipped yet (Phase 2 backlog)

- Collector 2: Google Maps reviews via DataForSEO Local SERP
- Collector 3: Project launches via SerpAPI News
- Collector 4: Instagram competitor engagement via Meta Graph API
- Collector 5: Facebook Groups (phone-first screenshot ingest)
- Collector 6: Competitor-client mining via Firecrawl
- Automatic Airtable write from the Cloud Function (requires `AIRTABLE_PAT` secret)
- Admin UI / dashboard (probably not needed — Airtable + Telegram cover it)

## Firestore collections used

| Collection | Purpose | Written by | Read by |
|---|---|---|---|
| `intent_signals/{auto}` | Raw signals (one per observed event) | collect_*.py | score_accounts.py, skill scripts |
| `intent_accounts/{domain}` | Rolling rollup per company | score_accounts.py | all skill scripts, eveningOpsReport (future) |
| `intent_hot_transitions/{auto}` | Triggers Telegram alerts | score_accounts.py | jegoRoomAlertOnHotTransition Cloud Function |
| `intent_runs/{auto}` | Operational telemetry (one per cron run) | collect_*.py + score_accounts.py | troubleshooting only |

## Scoring formula (summary)

```
new_contribution = raw_strength × signal_type_weight × decay_weight(0) × 10
new_contribution = min(new_contribution, 55)    # cap single-signal impact
new_score = min(100, prev_score + new_contribution)
is_hot    = new_score >= 70
```

- `raw_strength`: 1-10 (Gemini refines the collector's initial guess)
- `signal_type_weight`: negative_review=1.0, hiring=0.8, new_launch=0.7, etc.
- `decay_weight`: half-life 14d (on re-score or rollover; fresh signals = 1.0)

To tune: edit `tools/jegoroom/common.py::signal_type_weight` + deploy.

## Running locally

```bash
# Load env (Firebase admin, API keys)
cd /Users/mac/Desktop/Websites/jegodigital
set -a && source website/functions/.env && set +a

# Install deps
pip install requests firebase-admin

# Smoke test Firestore connectivity
python3 tools/jegoroom/common.py

# Dry-run the hiring collector (no Firestore writes)
python3 tools/jegoroom/collect_hiring.py --dry-run

# Dry-run scoring (no Firestore writes)
python3 tools/jegoroom/score_accounts.py --dry-run --limit 5

# Show current hot accounts
python3 skills/jegoroom/scripts/show_hot.py --limit 20

# Get warming tier (50-69)
python3 skills/jegoroom/scripts/show_hot.py --warming

# Daily digest (text to console)
python3 skills/jegoroom/scripts/daily_digest.py

# Daily digest to Slack
python3 skills/jegoroom/scripts/daily_digest.py --output slack --post
```

## Cost per day (Phase 1)

| API | Calls | Cost |
|---|---|---|
| SerpAPI | 12 queries × daily = 12/day | free tier (2.5k/mo) |
| Gemini 2.5-flash | ~50 signals/day × 1 call each | ~$0.05/day |
| Firebase Firestore | ~200 writes/day | free tier |
| GitHub Actions | 3 cron jobs × <10 min = 30 min/day | free tier (2000 min/mo) |
| **Total** | | **~$2/mo** |

Common Room equivalent: **$625-2500/mo**. We're beating them by 300-1000x.

## HR-6 verification (per CLAUDE.md)

Before marking JegoRoom "shipped", these must all be true:

- [ ] First cron run of `jegoroom.yml → hiring` completes green
- [ ] First cron run of `jegoroom.yml → scoring` completes green
- [ ] At least one `intent_signal` doc exists in Firestore
- [ ] Manual GET to `/jegoRoomTestAlert` returns `{ok: true}` and Telegram receives the test message
- [ ] `python3 skills/jegoroom/scripts/show_hot.py` prints either accounts or the "no accounts yet" message (never crashes)

Log proof of each in `DISASTER_LOG.md` (WIN entry) + `NEXT_STEP.md §SHIPPED`.
