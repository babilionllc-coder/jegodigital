/**
 * coldCallSlackReport — post-batch cold-call reports to Slack (Block Kit).
 *
 * Three exports:
 *   coldCallSlackMorning    — cron 12:30 Mon-Fri CDMX (after 10:00 batch)
 *   coldCallSlackAfternoon  — cron 18:30 Mon-Fri CDMX (after 16:00 batch)
 *   coldCallSlackOnDemand   — HTTPS endpoint for manual fire / debug
 *
 * Design rule (per Alex 2026-04-20, feedback_no_approve_gates): no approval
 * gates, no staging. Cron fires, logs richly, posts digest. dailyDigest +
 * systemHealthAudit surface anomalies after the fact.
 *
 * Data sources:
 *   - call_queue/{date}/leads/{leadId}   (status: queued|dialed|failed|no_answer)
 *   - call_analysis/{conversation_id}    (outcome: positive|negative|neutral|voicemail|no_answer|pending)
 *   - call_queue_summaries/{date}        (fired/failed counts from coldCallRun)
 *
 * Slack webhook: SLACK_WEBHOOK_URL (in .env + GitHub Secrets). Falls back to
 * Telegram if webhook missing.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
const SLACK_CHANNEL_NAME = "#all-jegodigital";

const OFFER_LABELS = {
    A: "Offer A — SEO Pitch",
    B: "Offer B — Free Audit",
    C: "Offer C — Free Setup (Trojan)",
};

// ---- helpers ----
function cdmxTodayKey() {
    const now = new Date();
    const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 });
    } catch (err) {
        functions.logger.error("coldCallSlackReport Telegram fallback failed:", err.message);
    }
}

async function sendSlack(blocks, fallbackText) {
    // 2026-04-25: routed to #cold-call-log via slackPost helper (was firehose).
    const { slackPost } = require('./slackPost');
    const result = await slackPost('cold-call-log', {
        blocks,
        text: fallbackText,
        unfurl_links: false,
        unfurl_media: false,
    });
    if (!result.ok) {
        functions.logger.error("coldCallSlackReport Slack post failed:", result.error || "unknown");
        await sendTelegram(fallbackText || "cold-call Slack post FAILED — see logs");
        return { ok: false, reason: result.error || "slack_failed" };
    }
    return { ok: true, channel: result.channel, fallback_used: result.fallback_used };
}

/**
 * Aggregate call results for one CDMX date.
 * window: "morning" (before 14:00 CDT) or "afternoon" (after 14:00 CDT) or "all"
 */
async function aggregate(dateKey, window = "all") {
    const db = admin.firestore();

    // Pull queue + analysis
    const [queueSnap, summaryDoc, analysisSnap] = await Promise.all([
        db.collection("call_queue").doc(dateKey).collection("leads").get(),
        db.collection("call_queue_summaries").doc(dateKey).get(),
        db.collection("call_analysis").where("date_key", "==", dateKey).get(),
    ]);

    const agg = {
        dateKey, window,
        total_queued: 0, dialed: 0, failed: 0, no_answer: 0, voicemail: 0,
        connected: 0, positive: 0, negative: 0, neutral: 0, pending: 0,
        by_offer: { A: { dialed: 0, positive: 0 }, B: { dialed: 0, positive: 0 }, C: { dialed: 0, positive: 0 } },
        positives: [],
        failures: [],
        summary: summaryDoc.exists ? summaryDoc.data() : {},
    };

    queueSnap.forEach((doc) => {
        const d = doc.data();
        agg.total_queued++;
        if (d.status === "dialed") agg.dialed++;
        if (d.status === "failed") {
            agg.failed++;
            if (agg.failures.length < 5) {
                agg.failures.push(`${d.name || doc.id}: ${(d.error || "unknown").toString().slice(0, 80)}`);
            }
        }
        if (d.status === "no_answer") agg.no_answer++;
        if (d.offer && agg.by_offer[d.offer] && d.status === "dialed") {
            agg.by_offer[d.offer].dialed++;
        }
    });

    analysisSnap.forEach((doc) => {
        const c = doc.data();
        const outcome = (c.outcome || "").toLowerCase();
        if (outcome === "pending" || outcome === "") {
            agg.pending++;
        } else if (outcome.includes("positive") || outcome.includes("interested") || outcome === "yes") {
            agg.positive++;
            agg.connected++;
            if (c.offer && agg.by_offer[c.offer]) agg.by_offer[c.offer].positive++;
            agg.positives.push({
                name: c.name || "(unnamed)",
                company: c.company || "—",
                offer: c.offer || "?",
                phone: c.phone || "",
                conversation_id: doc.id,
            });
        } else if (outcome.includes("negative") || outcome.includes("not_interested") || outcome === "no") {
            agg.negative++;
            agg.connected++;
        } else if (outcome.includes("voicemail")) {
            agg.voicemail++;
        } else if (outcome.includes("no_answer") || outcome.includes("failed")) {
            // already counted in queue
        } else {
            agg.neutral++;
            agg.connected++;
        }
    });

    return agg;
}

function buildBlocks(agg, headerText) {
    const connRate = agg.dialed > 0 ? ((agg.connected / agg.dialed) * 100).toFixed(1) : "0.0";
    const posRate = agg.connected > 0 ? ((agg.positive / agg.connected) * 100).toFixed(1) : "0.0";

    const verdict = agg.positive >= 3
        ? ":large_green_circle: *Strong* — 3+ positive leads"
        : agg.positive >= 1
            ? ":large_yellow_circle: *OK* — some traction"
            : agg.dialed === 0
                ? ":white_circle: *No batch fired*"
                : ":red_circle: *Low* — zero positives this batch";

    const blocks = [
        { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Date:* ${agg.dateKey}` },
                { type: "mrkdwn", text: `*Window:* ${agg.window}` },
                { type: "mrkdwn", text: `*Dialed:* ${agg.dialed}` },
                { type: "mrkdwn", text: `*Connected:* ${agg.connected} (${connRate}%)` },
                { type: "mrkdwn", text: `*Positive:* ${agg.positive} (${posRate}%)` },
                { type: "mrkdwn", text: `*Negative:* ${agg.negative}` },
                { type: "mrkdwn", text: `*Voicemail:* ${agg.voicemail}` },
                { type: "mrkdwn", text: `*Failed:* ${agg.failed}` },
            ],
        },
        { type: "section", text: { type: "mrkdwn", text: verdict } },
    ];

    // Per-offer breakdown
    const offerLines = ["A", "B", "C"].map((k) => {
        const o = agg.by_offer[k] || { dialed: 0, positive: 0 };
        return `• *${OFFER_LABELS[k]}* — dialed ${o.dialed}, positive ${o.positive}`;
    });
    blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*By offer:*\n" + offerLines.join("\n") },
    });

    // Top positives
    if (agg.positives.length) {
        const posLines = agg.positives.slice(0, 5).map((p) =>
            `• *${p.name}* · ${p.company} · ${OFFER_LABELS[p.offer] || p.offer} · \`${p.conversation_id}\``
        );
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: ":fire: *Positives to follow up:*\n" + posLines.join("\n") },
        });
    }

    // Failure samples
    if (agg.failures.length) {
        const failLines = agg.failures.slice(0, 3).map((f) => `• ${f}`);
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: ":warning: *First failures:*\n" + failLines.join("\n") },
        });
    }

    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `JegoDigital cold-call autopilot · ${new Date().toISOString()}` }],
    });

    return blocks;
}

function fallbackText(agg, headerText) {
    return [
        `${headerText}`,
        `${agg.dateKey} · window=${agg.window}`,
        `Dialed ${agg.dialed} · Connected ${agg.connected} · Positive ${agg.positive} · Negative ${agg.negative} · Failed ${agg.failed}`,
    ].join("\n");
}

// =====================================================================
// 1) coldCallSlackMorning — 12:30 Mon-Fri CDMX
// =====================================================================
exports.coldCallSlackMorning = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("30 12 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const dateKey = cdmxTodayKey();
        functions.logger.info(`coldCallSlackMorning ${dateKey}: starting`);
        const agg = await aggregate(dateKey, "morning");
        const header = `☀️ Cold Call Morning Report — ${dateKey}`;
        await sendSlack(buildBlocks(agg, header), fallbackText(agg, header));
        return null;
    });

// =====================================================================
// 2) coldCallSlackAfternoon — 18:30 Mon-Fri CDMX
// =====================================================================
exports.coldCallSlackAfternoon = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("30 18 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const dateKey = cdmxTodayKey();
        functions.logger.info(`coldCallSlackAfternoon ${dateKey}: starting`);
        const agg = await aggregate(dateKey, "afternoon");
        const header = `🌙 Cold Call Afternoon Report — ${dateKey}`;
        await sendSlack(buildBlocks(agg, header), fallbackText(agg, header));
        return null;
    });

// =====================================================================
// 3) coldCallSlackOnDemand — HTTPS endpoint
//    Hit: https://us-central1-jegodigital-e02fb.cloudfunctions.net/coldCallSlackOnDemand
//    Optional query: ?date=2026-04-21&window=morning|afternoon|all
// =====================================================================
exports.coldCallSlackOnDemand = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const dateKey = (req.query.date || cdmxTodayKey()).toString().slice(0, 10);
            const window = (req.query.window || "all").toString();
            functions.logger.info(`coldCallSlackOnDemand ${dateKey} window=${window}`);

            const agg = await aggregate(dateKey, window);
            const header = `🛠️ Cold Call On-Demand Report — ${dateKey} (${window})`;
            const result = await sendSlack(buildBlocks(agg, header), fallbackText(agg, header));

            res.status(200).json({
                ok: true,
                slack: result.ok,
                date: dateKey,
                window,
                totals: {
                    dialed: agg.dialed,
                    connected: agg.connected,
                    positive: agg.positive,
                    negative: agg.negative,
                    voicemail: agg.voicemail,
                    failed: agg.failed,
                    pending: agg.pending,
                },
            });
        } catch (err) {
            functions.logger.error("coldCallSlackOnDemand error:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });
