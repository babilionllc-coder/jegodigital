/**
 * dailyGcpCostReport — 08:00 CDMX daily digest of GCP spending.
 *
 * WHAT IT DOES (plain language, HR-12)
 * ------------------------------------
 * Every morning at 08:00 CDMX, this function posts a short Telegram + Slack
 * message telling Alex:
 *   - Yesterday's GCP cost (from Firestore billing_alerts populated by the
 *     kill-switch Pub/Sub push).
 *   - Month-to-date spend vs the $300 USD / $5,000 MXN monthly cap.
 *   - Forecasted month-end + whether we're on-track.
 *   - Firebase Hosting release count (the #1 cost driver per the 2026-04-23
 *     audit showing 1,398 GiB-month of Hosting Storage).
 *   - Plain-language recommendation: "all good", "watch it", "act now".
 *
 * WHY THIS EXISTS
 * ---------------
 * 2026-04-23: Alex discovered Firebase Hosting was eating 91% of the GCP
 * bill (MX$768 MTD, 1.4 TB of retained releases). He asked for a daily
 * report so he always sees this number BEFORE it surprises him again.
 *
 * DATA SOURCES (HR-0, no fabrication)
 * -----------------------------------
 * 1. Firestore `billing_alerts/{id}` — populated by killBillingOnBudgetExceeded
 *    on every GCP Budget push (hourly while accruing spend). Each doc has:
 *      { costAmount, budgetAmount, costPercent, alertAt, currencyCode }
 * 2. Firebase Hosting API — GET /v1beta1/sites/{site}/releases to count
 *    retained releases (each retained release = full public-dir snapshot).
 * 3. Nothing is invented. If a source is empty, the report says so.
 *
 * OUTPUTS
 * -------
 * - Telegram: short message to Alex's chat (TELEGRAM_CHAT_ID).
 * - Slack: same payload as Block Kit to SLACK_WEBHOOK_URL.
 * - Firestore: `gcp_cost_daily_reports/{YYYY-MM-DD}` audit trail.
 *
 * ENDPOINTS
 * ---------
 * - `dailyGcpCostReport` — Pub/Sub cron, 08:00 America/Mexico_City, every day.
 * - `dailyGcpCostReportNow` — HTTPS trigger, same body, for smoke testing.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const PROJECT_ID = process.env.GCLOUD_PROJECT || "jegodigital-e02fb";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// Budget sanity — matches the kill-switch config (docs/gcp-cost-cap.md)
const MONTHLY_BUDGET_MXN = 5000; // = ~$300 USD = ~$10 USD/day
const MXN_PER_USD = 16.5;

// Firebase Hosting site — inferred from PROJECT_ID.
// For jegodigital-e02fb the default site is "jegodigital-e02fb".
const HOSTING_SITE_ID = process.env.HOSTING_SITE_ID || PROJECT_ID;

// ─── helpers ────────────────────────────────────────────────────────────
function fmtMxn(n) {
    if (n == null || isNaN(n)) return "—";
    return `MX$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function fmtUsd(n) {
    if (n == null || isNaN(n)) return "—";
    return `$${(n / MXN_PER_USD).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function todayCDMX() {
    const now = new Date();
    // naive but deterministic CDMX = UTC-5 (no DST in MX since 2022)
    const cdmx = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

// ─── billing data sources ───────────────────────────────────────────────
/**
 * Reads the most recent billing_alerts docs (populated by the kill-switch).
 * Returns { latest, previous, mtdMxn, dailyDelta, totalSamples }.
 */
async function readBillingFirestore() {
    const db = admin.firestore();
    const snap = await db.collection("billing_alerts")
        .orderBy("alertAt", "desc")
        .limit(100)
        .get();

    if (snap.empty) {
        return {
            hasData: false,
            reason: "billing_alerts collection empty — no Pub/Sub pushes from GCP Budget yet. Confirm budget + Pub/Sub topic wiring per docs/gcp-cost-cap.md.",
        };
    }

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const latest = docs[0];
    // Previous day's doc = first doc where alertAt is ≥24h older than latest
    const latestAtMs = latest.alertAt?.toMillis?.() || Date.now();
    const prev = docs.find(d => {
        const at = d.alertAt?.toMillis?.() || 0;
        return latestAtMs - at >= 23 * 60 * 60 * 1000;
    });

    const mtdMxn = Number(latest.costAmount) || 0;
    const dailyDelta = prev ? mtdMxn - (Number(prev.costAmount) || 0) : null;

    return {
        hasData: true,
        latest,
        previous: prev || null,
        mtdMxn,
        dailyDelta,
        currencyCode: latest.currencyCode || "MXN",
        totalSamples: docs.length,
    };
}

/**
 * Firebase Hosting — count retained releases + latest release size if
 * available via the Versions API. This is the #1 cost driver per audit.
 */
async function readHostingReleases() {
    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/firebase.hosting.readonly", "https://www.googleapis.com/auth/cloud-platform"],
        });
        const authClient = await auth.getClient();
        const firebasehosting = google.firebasehosting({ version: "v1beta1", auth: authClient });

        // List releases — pageSize max 100 on this API
        let allReleases = [];
        let nextPageToken = null;
        for (let i = 0; i < 5; i++) { // cap at 5 pages = 500 releases, enough
            const resp = await firebasehosting.sites.releases.list({
                parent: `sites/${HOSTING_SITE_ID}`,
                pageSize: 100,
                pageToken: nextPageToken || undefined,
            });
            const releases = resp.data.releases || [];
            allReleases.push(...releases);
            if (!resp.data.nextPageToken) break;
            nextPageToken = resp.data.nextPageToken;
        }

        // Summary: count + latest + oldest still-retained
        const sorted = allReleases.slice().sort((a, b) => {
            const A = new Date(a.releaseTime || 0).getTime();
            const B = new Date(b.releaseTime || 0).getTime();
            return B - A;
        });
        const latest = sorted[0] || null;
        const oldest = sorted[sorted.length - 1] || null;
        return {
            ok: true,
            retainedCount: allReleases.length,
            latestReleaseTime: latest?.releaseTime || null,
            oldestReleaseTime: oldest?.releaseTime || null,
        };
    } catch (err) {
        return {
            ok: false,
            error: String(err.message || err).slice(0, 300),
        };
    }
}

// ─── message builders ───────────────────────────────────────────────────
function buildReport({ billing, hosting, generatedAtIso }) {
    const lines = [];
    lines.push(`📊 *GCP Daily Cost Report* — ${todayCDMX()} CDMX`);
    lines.push(``);

    if (!billing.hasData) {
        lines.push(`⚠️ *No live billing data.*`);
        lines.push(`_${billing.reason}_`);
        return lines.join("\n");
    }

    const mtd = billing.mtdMxn;
    const mtdUsd = mtd / MXN_PER_USD;
    const pctOfCap = (mtd / MONTHLY_BUDGET_MXN) * 100;
    const daysIntoMonth = new Date().getDate();
    const forecastMxn = daysIntoMonth > 0 ? (mtd / daysIntoMonth) * 30 : mtd;
    const forecastUsd = forecastMxn / MXN_PER_USD;

    // Daily delta
    lines.push(`*Last 24h:* ${billing.dailyDelta != null
        ? `${fmtMxn(billing.dailyDelta)} ≈ ${fmtUsd(billing.dailyDelta)}`
        : "—  (only 1 sample in window)"}`);
    lines.push(`*Month-to-date:* ${fmtMxn(mtd)} ≈ ${fmtUsd(mtd)} _(${pctOfCap.toFixed(1)}% of ${fmtMxn(MONTHLY_BUDGET_MXN)} cap)_`);
    lines.push(`*Forecast (month-end):* ${fmtMxn(forecastMxn)} ≈ ${fmtUsd(forecastMxn)}`);
    lines.push(``);

    // Firebase Hosting release retention (the audit finding)
    if (hosting.ok) {
        lines.push(`*Firebase Hosting releases retained:* ${hosting.retainedCount}`);
        if (hosting.retainedCount > 20) {
            lines.push(`⚠️ _${hosting.retainedCount} releases — each stores a full /website snapshot. High count = Hosting Storage bill climbs. Target ≤10._`);
        }
    } else {
        lines.push(`_Firebase Hosting release count unavailable: ${hosting.error}_`);
    }
    lines.push(``);

    // Plain-language verdict
    let verdict;
    if (pctOfCap >= 90) {
        verdict = "🚨 *Act now* — close to cap. Kill-switch will detach billing at 95%.";
    } else if (pctOfCap >= 70 || (hosting.ok && hosting.retainedCount > 50)) {
        verdict = "⚠️ *Watch it* — trending up. Prune old Hosting releases or tighten firebase.json ignore list.";
    } else if (forecastUsd > 80) {
        verdict = "⚠️ *Watch forecast* — trending toward $80+ USD/month.";
    } else {
        verdict = "✅ *All good* — within cap.";
    }
    lines.push(verdict);
    lines.push(``);
    lines.push(`🔗 [Live report](https://console.cloud.google.com/billing/01CF56-3C0E37-BA9295/reports?project=${PROJECT_ID})`);

    return lines.join("\n");
}

async function sendTelegram(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        functions.logger.warn("[dailyGcpCostReport] Telegram env vars missing — skipping.");
        return { ok: false, reason: "no_token" };
    }
    try {
        const r = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
        }, { timeout: 15000 });
        return { ok: true, messageId: r.data?.result?.message_id || null };
    } catch (err) {
        functions.logger.warn("[dailyGcpCostReport] Telegram send failed:", err.response?.data || err.message);
        return { ok: false, error: String(err.message || err) };
    }
}

async function sendSlack(text) {
    if (!SLACK_WEBHOOK_URL) {
        functions.logger.warn("[dailyGcpCostReport] SLACK_WEBHOOK_URL missing — skipping.");
        return { ok: false, reason: "no_webhook" };
    }
    try {
        const payload = {
            text: "GCP Daily Cost Report",
            blocks: [{
                type: "section",
                text: { type: "mrkdwn", text: text.replace(/\*([^*]+)\*/g, "*$1*") },
            }],
        };
        await axios.post(SLACK_WEBHOOK_URL, payload, { timeout: 15000 });
        return { ok: true };
    } catch (err) {
        functions.logger.warn("[dailyGcpCostReport] Slack send failed:", err.response?.data || err.message);
        return { ok: false, error: String(err.message || err) };
    }
}

// ─── core run ───────────────────────────────────────────────────────────
async function runReport() {
    const generatedAtIso = new Date().toISOString();
    const [billing, hosting] = await Promise.all([
        readBillingFirestore().catch(e => ({ hasData: false, reason: String(e.message || e) })),
        readHostingReleases().catch(e => ({ ok: false, error: String(e.message || e) })),
    ]);

    const reportText = buildReport({ billing, hosting, generatedAtIso });
    const [tg, sl] = await Promise.all([sendTelegram(reportText), sendSlack(reportText)]);

    // audit trail
    try {
        const dateKey = todayCDMX();
        await admin.firestore().collection("gcp_cost_daily_reports").doc(dateKey).set({
            generated_at: admin.firestore.FieldValue.serverTimestamp(),
            billing: billing.hasData ? {
                mtd_mxn: billing.mtdMxn,
                daily_delta_mxn: billing.dailyDelta,
                currency_code: billing.currencyCode,
                samples: billing.totalSamples,
            } : { has_data: false, reason: billing.reason },
            hosting,
            delivery: { telegram: tg, slack: sl },
            report_text: reportText,
        }, { merge: true });
    } catch (err) {
        functions.logger.warn("[dailyGcpCostReport] Firestore audit write failed:", err.message);
    }

    return { ok: true, billing, hosting, delivery: { telegram: tg, slack: sl }, report_text: reportText };
}

// ─── exports ────────────────────────────────────────────────────────────
exports.dailyGcpCostReport = functions
    .runWith({ timeoutSeconds: 180, memory: "256MB" })
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const result = await runReport();
        functions.logger.info("[dailyGcpCostReport] done", {
            mtd_mxn: result.billing?.mtdMxn,
            hosting_releases: result.hosting?.retainedCount,
        });
        return null;
    });

exports.dailyGcpCostReportNow = functions
    .runWith({ timeoutSeconds: 180, memory: "256MB" })
    .https.onRequest(async (_req, res) => {
        try {
            const result = await runReport();
            res.json(result);
        } catch (err) {
            res.status(500).json({ ok: false, error: String(err.message || err) });
        }
    });
