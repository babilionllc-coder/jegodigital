# GCP Cost Cap — $10/day Hard Limit

**Last updated:** 2026-04-22 · **Owner:** Alex + Claude

---

## What this does (plain language)

You noticed GCP costs hit **$35 in 2 days** — roughly $17.50/day. This system puts a hard cap of **~$10/day** (= $300/month) on your Google Cloud spending.

When the cap is hit, a Cloud Function **automatically detaches the billing account from the project**. All paid services stop. Your bill cannot go higher until you manually re-enable billing.

Before killing, you get Slack + Telegram warnings at 50% (≈$150/mo = $5/day) so you see it coming.

**You cannot overshoot by more than a few dollars.** Worst case: GCP budget alerts are hourly, so between the 95% ping and the kill there's a ~60-min window where costs keep accruing at the current burn rate. If burn is $1/hr, that's +$1 over cap. Acceptable.

---

## Architecture

```
GCP Billing Budget ($300/month, resets monthly = ~$10/day)
        │
        │  (on 50%, 75%, 90%, 100%, 120% thresholds → Pub/Sub)
        ▼
Pub/Sub topic: gcp-budget-alerts
        │
        ▼
Cloud Function: killBillingOnBudgetExceeded
  ├─ <50%: log only (Firestore billing_alerts/)
  ├─ 50-95%: Slack + Telegram warn
  └─ ≥95%: DETACH BILLING → all paid services stop
        │
        ▼
Slack + Telegram alert to Alex
Firestore billing_alerts/{id} audit trail
```

---

## One-time setup — YOU (Alex) MUST click 3 things in GCP Console

Only a human with Billing Account Administrator permission can do this. There is no API shortcut — Google requires human auth for billing admin.

### Click #1 — Create the Pub/Sub topic (30 seconds)

1. Go to https://console.cloud.google.com/cloudpubsub/topic/list?project=jegodigital-e02fb
2. Click **+ CREATE TOPIC**
3. Topic ID: `gcp-budget-alerts`
4. Leave everything else default → **CREATE**

### Click #2 — Create the Budget (~2 min)

1. Go to https://console.cloud.google.com/billing → pick your billing account
2. Left sidebar → **Budgets & alerts** → **+ CREATE BUDGET**
3. **Scope:**
   - Projects: `jegodigital-e02fb` (only)
   - Services: All
4. **Amount:**
   - Budget type: Specified amount
   - Target amount: **300** USD
   - (Monthly = ~$10/day on average. GCP doesn't support daily budgets — only monthly/quarterly/yearly — so monthly $300 is the closest equivalent.)
5. **Actions:**
   - Thresholds: Default (50%, 90%, 100%) OR add 75% and 120% for more granularity
   - ✅ **Connect this budget to a Pub/Sub topic** → pick `gcp-budget-alerts`
   - ✅ Email alerts to billing admins (optional but nice)
6. **FINISH**

### Click #3 — Grant Billing Admin to the function (~1 min)

The Cloud Function runs as the Firebase default service account. It needs permission to disable billing.

1. First find the service account email: go to https://console.cloud.google.com/iam-admin/serviceaccounts?project=jegodigital-e02fb
2. Copy the email that looks like `firebase-adminsdk-XXXXX@jegodigital-e02fb.iam.gserviceaccount.com`
3. Go to https://console.cloud.google.com/billing → your billing account → **Account management** (left sidebar)
4. Click **+ ADD PRINCIPAL** at the top
5. New principals: paste the email from step 2
6. Role: **Billing Account Administrator**
7. **SAVE**

**That's it.** The budget + kill-switch is now live.

---

## How to verify it's working

After the deploy finishes + you complete the 3 clicks above:

```bash
# Check billing status + recent alerts (read-only)
curl https://us-central1-jegodigital-e02fb.cloudfunctions.net/billingStatus
```

Expected response:

```json
{
  "ok": true,
  "project_id": "jegodigital-e02fb",
  "billing_enabled": true,
  "billing": {
    "name": "projects/jegodigital-e02fb/billingInfo",
    "projectId": "jegodigital-e02fb",
    "billingAccountName": "billingAccounts/XXXXXX-XXXXXX-XXXXXX",
    "billingEnabled": true
  },
  "recent_alerts": []
}
```

Alerts will populate in `recent_alerts` as GCP publishes them (~hourly while accruing spend).

---

## If the kill-switch fires

You'll get Slack + Telegram messages like:

```
🛑 GCP KILL-SWITCH FIRED

Budget: JegoDigital Daily $10 Cap
Spent: 285.47 USD / 300.00 USD (95%)
Project: jegodigital-e02fb

✅ billing detached — all paid services STOPPED.

Currently billing_enabled = false.

To restore: GCP Console -> Billing -> Account management ->
link jegodigital-e02fb to the billing account again.
```

**To restore billing** (after investigating what caused the spike):

1. Go to https://console.cloud.google.com/billing/projects
2. Find `jegodigital-e02fb` → click the 3-dot menu → **Change billing account**
3. Pick your billing account → **SET ACCOUNT**

Cloud Run + Functions + Firestore will resume within ~30 seconds.

---

## Top cost drivers to watch

Based on our stack, here's where $17.50/day most likely came from. Monitor at https://console.cloud.google.com/billing/XXXXX/reports:

| Service | Likely cost | Why |
|---|---|---|
| **Cloud Run** (mockup-renderer) | $5-10/day | 2GB RAM + 2 CPU; scales to 5 instances on renders |
| **Firestore reads** | $1-3/day | moneyMachineStatus hits 8+ collections on every call |
| **Cloud Functions invocations** | $2-5/day | 82 functions, some on every-3-min or every-5-min cron |
| **Vertex AI (Gemini 3.1 Pro)** | $3-8/day | Drafter uses Gemini 3.1 Pro preview — $1.25 per 1M input tokens |
| **Cloud Scheduler** | <$0.50/day | Tiny, ignore |
| **Egress (outbound traffic)** | $0.50-2/day | Apify + Slack + Telegram + Brevo API calls |

---

## Emergency manual kill (optional)

If you see costs spiking in real-time before GCP's hourly budget push, you can fire the kill-switch manually:

1. Set GitHub Secret `BILLING_KILL_SECRET` to any random string (e.g. `openssl rand -hex 16`)
2. Push to main to deploy
3. When needed, hit:

```bash
curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/billingKillNow?secret=YOUR_SECRET"
```

This detaches billing immediately without waiting for the budget alert.

---

## What this does NOT stop

These keep billing you even after detach (they're not on GCP billing):

- Apify (separate billing)
- Anthropic API (separate key)
- OpenAI (separate key)
- ElevenLabs (separate key)
- Twilio (separate billing)
- Brevo (separate)
- Instantly.ai (subscription)

The kill-switch only caps **Google Cloud** spend. External vendor caps need to be set on each vendor's dashboard.

---

## Files

- `website/functions/gcpBillingKillSwitch.js` — the Cloud Function
- `website/functions/index.js` — registers `killBillingOnBudgetExceeded`, `billingStatus`, `billingKillNow`
- Firestore collection `billing_alerts/{id}` — full audit trail
