/**
 * gcpBillingKillSwitch — hard cap on JegoDigital GCP spending.
 *
 * WHAT IT DOES
 * ------------
 * Subscribes to a Pub/Sub topic that a GCP Billing Budget publishes to.
 * Every time the budget pushes a threshold alert (50% / 90% / 100%+),
 * this function decides whether to:
 *   - log only (< KILL_THRESHOLD),
 *   - send Slack/Telegram warning (>= WARN_THRESHOLD),
 *   - detach the billing account from the project (>= KILL_THRESHOLD),
 *     which stops ALL paid services immediately.
 *
 * The daily cap is enforced at the BUDGET layer (GCP Budget with
 * calendar-period=month resets monthly; we instead set a monthly
 * amount = 300 USD so the 10/day rule is an average). A true daily
 * reset is not supported by GCP — only monthly/quarterly/yearly — but
 * the kill-switch still fires at 100% of whatever amount Alex sets in
 * the Billing Console, so a 300/month budget => 10/day in practice.
 *
 * SECURITY
 * --------
 * The Cloud Function's runtime service account must have:
 *   - roles/billing.projectManager on the billing account
 *   - roles/cloudfunctions.serviceAgent on the project (default)
 * Without billing.projectManager, updateBillingInfo returns 403 and
 * the kill-switch can't detach. See docs/gcp-cost-cap.md for setup.
 *
 * ONE-TIME SETUP (what Alex needs to click in GCP Console ONCE)
 * ------------------------------------------------------------
 *   1. Billing -> Budgets & alerts -> CREATE BUDGET
 *      - Name: "JegoDigital Daily $10 Cap"
 *      - Amount: 300 USD (monthly; ~10/day average)
 *      - Thresholds: 50%, 75%, 90%, 100%, 120% (default)
 *      - Notifications: Connect to Pub/Sub topic `gcp-budget-alerts`
 *         (this function subscribes to that topic automatically)
 *   2. IAM -> Billing Account -> ADD PRINCIPAL
 *      - Principal: firebase-adminsdk-xxxxx@jegodigital-e02fb.iam.gserviceaccount.com
 *        (find exact email at console.cloud.google.com/iam-admin/serviceaccounts)
 *      - Role: Billing Account Administrator
 * That's it. After that, this function is self-sufficient.
 *
 * On trigger, the function ALWAYS writes to Firestore `billing_alerts/{id}`
 * so Alex has a full audit trail even if Slack/Telegram delivery fails.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

// ─── tunables ────────────────────────────────────────────────────────────
const WARN_THRESHOLD = 0.5;   // 50%  -> Slack/Telegram warning only
const KILL_THRESHOLD = 0.95;  // 95%  -> detach billing (safer than 100%)
const PROJECT_ID = process.env.GCLOUD_PROJECT || "jegodigital-e02fb";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
// Telegram fallback (matches brevoEventWebhook.js + coldCallLiveMonitor.js pattern).
// In-repo fallback ensures budget alerts fire even if env vars aren't injected at deploy.
// 2026-04-28: added by Alex per Apr 26 Veo MX$519.53 spike investigation. Without this
// fallback, Telegram messages silently failed with "no_creds" and we never saw alerts.
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;

// ─── helpers ─────────────────────────────────────────────────────────────

async function sendSlack(text) {
    // 2026-04-25: routed to #alerts (GCP billing kill switch) via slackPost helper.
    try {
        const { slackPost } = require('./slackPost');
        const result = await slackPost('alerts', { text, unfurl_links: false });
        return { ok: result.ok, channel: result.channel, error: result.error };
    } catch (e) { return { ok: false, reason: e.message }; }
}

async function sendTelegram(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, reason: "no_creds" };
    try {
        const r = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" },
            { timeout: 10000, validateStatus: () => true }
        );
        return { ok: r.status === 200, status: r.status };
    } catch (e) { return { ok: false, reason: e.message }; }
}

/**
 * Detach the billing account from the project. This is what actually
 * stops spending. After this call:
 *   - Cloud Run services return 500 (no billing)
 *   - Cloud Functions stop executing
 *   - Cloud Scheduler jobs still fire but their targets return 500
 *   - Firestore reads/writes fail (needs billing for > free tier)
 *
 * TO RESTORE: Alex manually re-enables billing in GCP Console ->
 *   Billing -> Projects -> jegodigital-e02fb -> Change billing.
 */
async function disableBilling() {
    const auth = await google.auth.getClient({
        scopes: ["https://www.googleapis.com/auth/cloud-billing"],
    });
    const billing = google.cloudbilling({ version: "v1", auth });
    const name = `projects/${PROJECT_ID}`;
    const resp = await billing.projects.updateBillingInfo({
        name,
        requestBody: { billingAccountName: "" },
    });
    return resp.data;
}

async function getBillingStatus() {
    try {
        const auth = await google.auth.getClient({
            scopes: ["https://www.googleapis.com/auth/cloud-billing"],
        });
        const billing = google.cloudbilling({ version: "v1", auth });
        const resp = await billing.projects.getBillingInfo({
            name: `projects/${PROJECT_ID}`,
        });
        return resp.data;
    } catch (e) {
        return { error: e.message };
    }
}

// ─── main pub/sub trigger ────────────────────────────────────────────────

exports.killBillingOnBudgetExceeded = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.topic("gcp-budget-alerts")
    .onPublish(async (message) => {
        const db = admin.firestore();
        const alertId = db.collection("billing_alerts").doc().id;

        // Pub/Sub payload from GCP Budget alerts is base64-encoded JSON
        let payload;
        try {
            const raw = message.data
                ? Buffer.from(message.data, "base64").toString("utf-8")
                : JSON.stringify(message.json || {});
            payload = JSON.parse(raw);
        } catch (e) {
            functions.logger.error("[billingKillSwitch] Failed to parse payload", e);
            await db.collection("billing_alerts").doc(alertId).set({
                at: admin.firestore.FieldValue.serverTimestamp(),
                status: "parse_error",
                error: e.message,
                raw_data: message.data ? message.data.slice(0, 500) : null,
            });
            return;
        }

        const costAmount = Number(payload.costAmount || 0);
        const budgetAmount = Number(payload.budgetAmount || 1);
        const currency = payload.currencyCode || "USD";
        const ratio = costAmount / budgetAmount;
        const budgetName = payload.budgetDisplayName || "unknown";

        const base = {
            at: admin.firestore.FieldValue.serverTimestamp(),
            budget_name: budgetName,
            cost_amount: costAmount,
            budget_amount: budgetAmount,
            currency,
            ratio: Number(ratio.toFixed(4)),
            project_id: PROJECT_ID,
        };

        // <50%: log only
        if (ratio < WARN_THRESHOLD) {
            await db.collection("billing_alerts").doc(alertId).set({
                ...base, status: "logged_only",
            });
            return;
        }

        // 50% – 95%: warning
        if (ratio < KILL_THRESHOLD) {
            const msg = `⚠️ *GCP spend warning*\n\n`
                + `Budget: *${budgetName}*\n`
                + `Spent: *${costAmount.toFixed(2)} ${currency}* / ${budgetAmount.toFixed(2)} ${currency} `
                + `(${(ratio * 100).toFixed(0)}%)\n`
                + `Project: ${PROJECT_ID}\n\n`
                + `Kill-switch fires at 95%. Investigate cost drivers now.`;
            const [slackRes, tgRes] = await Promise.allSettled([
                sendSlack(msg), sendTelegram(msg),
            ]);
            await db.collection("billing_alerts").doc(alertId).set({
                ...base,
                status: "warned",
                slack_ok: slackRes.status === "fulfilled" && slackRes.value?.ok,
                telegram_ok: tgRes.status === "fulfilled" && tgRes.value?.ok,
            });
            return;
        }

        // >= 95%: DETACH BILLING
        let killResult = null;
        let killError = null;
        try {
            killResult = await disableBilling();
        } catch (e) {
            killError = e.message || String(e);
            functions.logger.error("[billingKillSwitch] disableBilling failed", e);
        }

        const billingStatus = await getBillingStatus();
        const billingEnabled = !!billingStatus.billingEnabled;

        const msg = `🛑 *GCP KILL-SWITCH FIRED*\n\n`
            + `Budget: *${budgetName}*\n`
            + `Spent: *${costAmount.toFixed(2)} ${currency}* / ${budgetAmount.toFixed(2)} ${currency} `
            + `(${(ratio * 100).toFixed(0)}%)\n`
            + `Project: ${PROJECT_ID}\n\n`
            + (killError
                ? `❌ detach FAILED: ${killError}\n   Check roles/billing.projectManager is granted.`
                : `✅ billing detached — all paid services STOPPED.\n\n`
                + `Currently billing_enabled = ${billingEnabled}.\n\n`
                + `To restore: GCP Console -> Billing -> Account management -> `
                + `link ${PROJECT_ID} to the billing account again.`);

        const [slackRes, tgRes] = await Promise.allSettled([
            sendSlack(msg), sendTelegram(msg),
        ]);

        await db.collection("billing_alerts").doc(alertId).set({
            ...base,
            status: killError ? "kill_failed" : "killed",
            kill_result: killResult,
            kill_error: killError,
            billing_enabled_after: billingEnabled,
            slack_ok: slackRes.status === "fulfilled" && slackRes.value?.ok,
            telegram_ok: tgRes.status === "fulfilled" && tgRes.value?.ok,
        });
    });

// ─── read-only HTTP: current billing + recent alerts ────────────────────
// Lets Alex hit one URL to see: is billing on? what alerts fired today?
// without needing GCP Console access.

exports.billingStatus = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        const db = admin.firestore();
        const out = { ok: true, project_id: PROJECT_ID, now_iso: new Date().toISOString() };

        try {
            out.billing = await getBillingStatus();
            out.billing_enabled = !!out.billing.billingEnabled;
        } catch (e) { out.billing_error = e.message; }

        try {
            const snap = await db.collection("billing_alerts")
                .orderBy("at", "desc").limit(10).get();
            out.recent_alerts = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    status: data.status,
                    budget_name: data.budget_name,
                    cost_amount: data.cost_amount,
                    budget_amount: data.budget_amount,
                    ratio: data.ratio,
                    currency: data.currency,
                    at: data.at?.toDate?.().toISOString?.() || null,
                };
            });
        } catch (e) { out.alerts_error = e.message; }

        res.json(out);
    });

// ─── on-demand kill switch (manual fire via HTTP) ────────────────────────
// Alex can manually detach billing from the command line / Chrome if ever
// he sees costs spiking in real-time before GCP's hourly budget push.
// Requires ?secret=<BILLING_KILL_SECRET> to prevent drive-by abuse.

exports.billingKillNow = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        const secret = req.query.secret || req.body?.secret;
        const expected = process.env.BILLING_KILL_SECRET;
        if (!expected || secret !== expected) {
            return res.status(403).json({ ok: false, error: "forbidden" });
        }

        const db = admin.firestore();
        const alertId = db.collection("billing_alerts").doc().id;

        let killResult = null, killError = null;
        try { killResult = await disableBilling(); }
        catch (e) { killError = e.message || String(e); }

        const billingStatus = await getBillingStatus();

        await db.collection("billing_alerts").doc(alertId).set({
            at: admin.firestore.FieldValue.serverTimestamp(),
            status: killError ? "manual_kill_failed" : "manual_killed",
            kill_result: killResult,
            kill_error: killError,
            billing_enabled_after: !!billingStatus.billingEnabled,
            triggered_by: "http_manual",
        });

        res.json({
            ok: !killError,
            kill_error: killError,
            billing_enabled_after: !!billingStatus.billingEnabled,
        });
    });
