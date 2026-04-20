# Firebase / GCP Billing Alarm Setup

Last updated: 2026-04-20
Owner: Alex — one-time manual setup in the GCP console. ~10 minutes.

## Why this doc exists

Every cron in `functions/` burns a little money every time it fires. Most are
cheap (Firestore reads, a few API calls). A handful are expensive by design:

- `leadFinderAutoTopUp` — up to 60 Hunter.io API calls/day + DataForSEO Maps
- `autopilotReviewer` — optional Anthropic API call (Haiku, ~$0.01/week)
- `contentPublisher` — 30s between posts, but Meta Graph API is free
- `instantlyReplyWatcher` — every 5 min = 288 runs/day; cheap per-run but adds up
- `processAuditRequest` — Firecrawl + PSI + DataForSEO + Perplexity per audit

A single bug can turn any of these into a bill bomb. Example scenarios to fear:

1. Infinite recursion in a Cloud Function → runaway invocations → $500+ in 1 day
2. Audit pipeline triggered in a loop by stale Firestore doc → hundreds of
   Firecrawl calls / hour (Firecrawl is the priciest dependency)
3. `leadFinderAutoTopUp` floor check fails to respect the 60 cap →
   thousands of Hunter.io calls exhausting the monthly quota in one run
4. `autopilotReviewer` stuck in a retry loop on a malformed LLM response →
   10k Anthropic calls in an hour

The point of this doc is to ensure **we hear about a runaway before the
credit card does**.

## The 4 alarms to set

All alarms live in **GCP Console → Billing → Budgets & Alerts** for the
`jegodigital-e02fb` project. Each takes ~90 seconds to create.

### Alarm 1 — Hard cap (catch-all)

- **Name:** `jegodigital-hard-cap`
- **Scope:** All projects (just `jegodigital-e02fb`, but set at billing-account level)
- **Budget amount:** $200 USD / month
- **Alert thresholds:**
  - 50% (actual) — email
  - 90% (actual) — email + Pub/Sub notification (if wired)
  - 100% (actual) — email
  - 120% (forecast) — email
- **Notification emails:** `jegoalexdigital@gmail.com`
- **Purpose:** Floor-level safety net. We should never hit this. If we do,
  something is badly wrong.

### Alarm 2 — Cloud Functions invocations

- **Name:** `jegodigital-functions-runaway`
- **Filter:** Service = "Cloud Functions" (only)
- **Budget amount:** $40 USD / month
- **Alert thresholds:** 50% / 90% / 100% actual, 150% forecast
- **Purpose:** Normal usage is ~$2-5/month. Anything over $10/month means a
  cron got stuck in a retry loop.

### Alarm 3 — Firestore reads/writes

- **Name:** `jegodigital-firestore-runaway`
- **Filter:** Service = "Cloud Firestore"
- **Budget amount:** $20 USD / month
- **Alert thresholds:** 50% / 90% / 100% actual
- **Purpose:** Normal usage is <$1/month. A scan bug easily blows past $20.

### Alarm 4 — Cloud Run (mockup-renderer)

- **Name:** `jegodigital-cloudrun-runaway`
- **Filter:** Service = "Cloud Run"
- **Budget amount:** $15 USD / month
- **Alert thresholds:** 50% / 90% / 100% actual
- **Purpose:** Current usage is near-zero (a few renders per carousel batch).
  A request loop would show up here within hours.

## Setting up Pub/Sub → Telegram escalation (optional, recommended)

The email alerts are fine for slow drift but won't wake Alex at 3am. Wire
the 90%+ threshold to a Telegram alert via Pub/Sub + a simple Cloud Function.

### Step 1: Create the Pub/Sub topic

```bash
gcloud pubsub topics create billing-alerts --project=jegodigital-e02fb
```

### Step 2: Attach it to each budget alarm

In the Budget creation UI:
- "Manage notifications" → "Connect a Pub/Sub topic"
- Select `billing-alerts`

### Step 3: Deploy a subscriber function (add to functions/index.js)

```js
exports.billingAlertEscalation = functions.pubsub
    .topic("billing-alerts")
    .onPublish(async (message) => {
        const data = JSON.parse(Buffer.from(message.data, "base64").toString());
        const pct = (data.costAmount / data.budgetAmount) * 100;
        const { notify } = require("./telegramHelper");
        const critical = pct >= 90;
        await notify(
            `💸 *JegoDigital billing alert*\n` +
            `${data.budgetDisplayName}: $${data.costAmount.toFixed(2)} / $${data.budgetAmount} (${pct.toFixed(0)}%)\n` +
            `Currency: ${data.currencyCode}`,
            { critical }
        );
    });
```

With `critical=true` at 90%+, the alert falls back to SMS via Twilio if
Telegram is down — see `telegramHelper.js`.

## Monitoring cron cost per function (nice-to-have)

GCP Console → Cloud Functions → [function name] → Metrics tab gives you:
- Invocations / day
- Execution time p50 / p99
- Active instances
- Errors

If you spot a function with p99 > 30s, check whether it's hitting a timeout
loop. If active instances creeps above 2 for a background scheduler, a
previous invocation probably hung.

## Monthly expected spend (baseline)

Rough baseline as of 2026-04-20, with all 13 crons running normally:

| Service | Expected / month |
|---|---|
| Cloud Functions invocations | $3–5 |
| Firestore reads/writes | <$1 |
| Cloud Run (mockup-renderer) | $1–3 |
| Hunter.io (not in GCP bill) | $0 until quota exhausted |
| Anthropic (autopilotReviewer only) | <$0.10 |
| Firecrawl (per audit) | ~$0.02/audit |
| ElevenLabs (voice calls) | $0.03/min × call minutes |
| DataForSEO (audit + top-up) | $0.01/request |
| Twilio (SMS fallback only) | ~$0.02/SMS, rare |
| **Total GCP bill** | **~$5/month** |

If the actual bill lands above $20/month without a clear cause (new client,
feature launch), start at Alarm 2 (Functions) to find which function is hot.

## Quarterly review

Every quarter, revisit:
1. Are any alarms consistently firing at low % (e.g. Functions hitting 50%
   every month)? Then the budget is too tight — raise it.
2. Are any alarms never firing and we've added new crons? Then the budget is
   too loose — tighten it.
3. Did any cron get deprecated? Remove its cost from the baseline table above.

## If an alarm fires: triage order

1. GCP Console → Billing → Reports → filter by service to find which line
   item is the problem.
2. Cloud Functions logs for the suspected function, last 24h.
3. Firestore → query the collections the function writes to, look for
   a document count spike.
4. Kill the offending scheduler job via `gcloud scheduler jobs pause` while
   you investigate. Never manually re-deploy to "fix" a runaway — use the
   pause button, diagnose, then push a code fix through GitHub Actions.
5. If the bleed is bad (>$50/day): pull the function's export from
   `functions/index.js`, push to main, GitHub Actions will remove it from
   the live deployment within ~5 minutes.
