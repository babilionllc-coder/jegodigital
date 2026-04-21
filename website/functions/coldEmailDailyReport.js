/**
 * coldEmailDailyReport — daily cold-email performance report to Slack + Telegram.
 *
 * Fires every morning at 07:05 CDMX (just after dailyDigest) with yesterday's
 * Instantly.ai numbers broken down by campaign. Mirrors the pattern of
 * coldCallSlackReport.js so Alex gets parallel morning reports for both
 * outbound channels (calls at 12:30/18:30, emails at 07:05).
 *
 * Three exports:
 *   coldEmailDailyReport           — cron 07:05 daily CDMX (yesterday's window)
 *   coldEmailWeeklyReport          — cron Mon 08:00 CDMX (last 7 days rollup)
 *   coldEmailReportOnDemand        — HTTPS endpoint for manual fire / debug
 *
 * Design rule (per Alex 2026-04-20): no approve gates. Cron fires, posts
 * digest, logs richly, learns from Firestore snapshots after the fact.
 *
 * Data source: Instantly v2 API directly
 *   GET /api/v2/campaigns                              — active campaigns
 *   GET /api/v2/campaigns/analytics/daily?...          — per-day rows
 *   GET /api/v2/campaigns/analytics?id=X               — lifetime overall
 *
 * All 5 secrets required live in the Cloud Functions runtime env via
 * .github/workflows/deploy.yml heredoc — no local .env, no manual injection.
 *   INSTANTLY_API_KEY, SLACK_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Firestore snapshot: cold_email_daily_reports/{YYYY-MM-DD}
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

// ---------- CDMX date helpers (UTC-6) ----------
function cdmxYesterdayKey() {
    const now = new Date();
    const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    cdmx.setUTCDate(cdmx.getUTCDate() - 1);
    return cdmx.toISOString().slice(0, 10);
}

function cdmxTodayKey() {
    const now = new Date();
    const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

function addDays(isoDate, delta) {
    const d = new Date(isoDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

// ---------- Instantly API ----------
function authHeaders() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY missing from runtime env");
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function listCampaigns() {
    const all = [];
    let startAfter = null;
    for (let i = 0; i < 10; i++) {
        const url = startAfter
            ? `${INSTANTLY_BASE}/campaigns?limit=100&starting_after=${startAfter}`
            : `${INSTANTLY_BASE}/campaigns?limit=100`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        const items = r.data.items || [];
        all.push(...items);
        if (items.length < 100) break;
        startAfter = items[items.length - 1].id;
    }
    return all;
}

async function dailyAnalytics(campaignId, startDate, endDate) {
    try {
        const url = `${INSTANTLY_BASE}/campaigns/analytics/daily?campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        return Array.isArray(r.data) ? r.data : (r.data.items || r.data.data || []);
    } catch (err) {
        functions.logger.warn(`dailyAnalytics failed for ${campaignId}: ${err.message}`);
        return [];
    }
}

async function campaignAnalytics(campaignId) {
    try {
        const url = `${INSTANTLY_BASE}/campaigns/analytics?id=${campaignId}`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        const d = Array.isArray(r.data) ? (r.data[0] || {}) : (r.data || {});
        return d;
    } catch (err) {
        functions.logger.warn(`campaignAnalytics failed for ${campaignId}: ${err.message}`);
        return {};
    }
}

// Sum a range of daily rows into one totals object
function sumDailyRows(rows) {
    const t = { sent: 0, opens: 0, unique_opens: 0, replies: 0, unique_replies: 0, bounces: 0, clicks: 0 };
    for (const r of (rows || [])) {
        t.sent          += r.sent || 0;
        t.opens         += r.opened || r.opens || 0;
        t.unique_opens  += r.unique_opened || r.unique_opens || 0;
        t.replies       += r.reply || r.replies || 0;
        t.unique_replies += r.unique_replies || 0;
        t.bounces       += r.bounced || r.bounces || 0;
        t.clicks        += r.clicks || r.unique_clicks || 0;
    }
    return t;
}

/**
 * Aggregate cold-email data for either:
 *   - a single day (startDate === endDate)
 *   - a range    (7-day rollup)
 */
async function aggregate(startDate, endDate, label) {
    const campaigns = await listCampaigns();
    const STATUS = { 0: "DRAFT", 1: "ACTIVE", 2: "PAUSED", 3: "COMPLETED", 4: "RUNNING_SUB", "-1": "DELETED", "-2": "ERROR" };
    const active = campaigns.filter((c) => c.status === 1);

    const totals = { sent: 0, opens: 0, unique_opens: 0, replies: 0, unique_replies: 0, bounces: 0, clicks: 0 };
    const perCampaign = [];

    // Fetch daily rows in parallel (active only — paused campaigns don't move)
    const dailyPromises = active.map((c) => dailyAnalytics(c.id, startDate, endDate));
    const overallPromises = active.map((c) => campaignAnalytics(c.id));
    const [dailyResults, overallResults] = await Promise.all([
        Promise.all(dailyPromises),
        Promise.all(overallPromises),
    ]);

    for (let i = 0; i < active.length; i++) {
        const c = active[i];
        const daily = dailyResults[i];
        const overall = overallResults[i];
        const summed = sumDailyRows(daily);

        // Skip campaigns with zero activity in the window (keeps report focused)
        if (summed.sent === 0 && summed.replies === 0 && summed.bounces === 0) continue;

        for (const k of Object.keys(totals)) totals[k] += summed[k] || 0;

        perCampaign.push({
            id: c.id,
            name: c.name || "(unnamed)",
            status: STATUS[c.status] || "UNKNOWN",
            ...summed,
            lifetime_leads: overall.leads_count || 0,
            lifetime_contacted: overall.contacted_count || 0,
            lifetime_replies: overall.reply_count_unique || overall.reply_count || 0,
        });
    }

    // Sort by sent desc so biggest firing campaigns are on top
    perCampaign.sort((a, b) => b.sent - a.sent);

    const active_firing = perCampaign.length;
    const total_active = active.length;

    const reply_rate = totals.sent > 0 ? ((totals.unique_replies / totals.sent) * 100) : 0;
    const open_rate = totals.sent > 0 ? ((totals.unique_opens / totals.sent) * 100) : 0;
    const bounce_rate = totals.sent > 0 ? ((totals.bounces / totals.sent) * 100) : 0;

    return {
        label, startDate, endDate,
        total_active, active_firing,
        totals,
        reply_rate, open_rate, bounce_rate,
        campaigns: perCampaign,
    };
}

// ---------- Slack Block Kit ----------
function verdict(agg) {
    const { totals, reply_rate, bounce_rate } = agg;
    if (totals.sent === 0) return ":white_circle: *No sends in window*";
    if (bounce_rate > 5) return `:red_circle: *Bounce emergency* — ${bounce_rate.toFixed(1)}% bounce (>5% = pause + warmup)`;
    if (bounce_rate > 3) return `:large_yellow_circle: *Bounce watch* — ${bounce_rate.toFixed(1)}% bounce (target <3%)`;
    if (reply_rate >= 1.5) return `:large_green_circle: *Healthy* — ${reply_rate.toFixed(2)}% reply rate`;
    if (reply_rate >= 0.5) return `:large_yellow_circle: *OK* — ${reply_rate.toFixed(2)}% reply rate (target ≥1.5%)`;
    return `:red_circle: *Low reply* — ${reply_rate.toFixed(2)}% reply rate (target ≥1.5%) — audit copy`;
}

function buildBlocks(agg, headerText) {
    const { totals, reply_rate, open_rate, bounce_rate } = agg;

    const blocks = [
        { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Window:* ${agg.startDate === agg.endDate ? agg.startDate : `${agg.startDate} → ${agg.endDate}`}` },
                { type: "mrkdwn", text: `*Active firing:* ${agg.active_firing} / ${agg.total_active}` },
                { type: "mrkdwn", text: `*Sent:* ${totals.sent.toLocaleString()}` },
                { type: "mrkdwn", text: `*Unique opens:* ${totals.unique_opens.toLocaleString()} (${open_rate.toFixed(1)}%)` },
                { type: "mrkdwn", text: `*Unique replies:* ${totals.unique_replies.toLocaleString()} (${reply_rate.toFixed(2)}%)` },
                { type: "mrkdwn", text: `*Bounces:* ${totals.bounces.toLocaleString()} (${bounce_rate.toFixed(2)}%)` },
            ],
        },
        { type: "section", text: { type: "mrkdwn", text: verdict(agg) } },
    ];

    // Per-campaign breakdown — top 6 by sends
    if (agg.campaigns.length) {
        const rows = agg.campaigns.slice(0, 6).map((c) => {
            const cRate = c.sent > 0 ? ((c.unique_replies / c.sent) * 100).toFixed(2) : "0.00";
            const bRate = c.sent > 0 ? ((c.bounces / c.sent) * 100).toFixed(2) : "0.00";
            const name = c.name.length > 38 ? c.name.slice(0, 35) + "…" : c.name;
            return `• *${name}* — sent ${c.sent}, replies ${c.unique_replies} (${cRate}%), bounces ${c.bounces} (${bRate}%)`;
        });
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: ":dart: *Top campaigns:*\n" + rows.join("\n") },
        });
    } else {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: "_No campaigns sent in this window._" },
        });
    }

    blocks.push({
        type: "context",
        elements: [{
            type: "mrkdwn",
            text: `JegoDigital cold-email autopilot · ${new Date().toISOString().slice(0, 19)}Z · ${agg.total_active} active campaigns`,
        }],
    });

    return blocks;
}

// ---------- Telegram markdown fallback ----------
function buildTelegramMarkdown(agg, headerText) {
    const { totals, reply_rate, open_rate, bounce_rate } = agg;
    const lines = [
        `*${headerText}*`,
        `Window: \`${agg.startDate === agg.endDate ? agg.startDate : `${agg.startDate} → ${agg.endDate}`}\``,
        `Active firing: *${agg.active_firing}* / ${agg.total_active}`,
        "",
        `📤 Sent: *${totals.sent.toLocaleString()}*`,
        `👁 Opens: *${totals.unique_opens.toLocaleString()}* (${open_rate.toFixed(1)}%)`,
        `💬 Replies: *${totals.unique_replies.toLocaleString()}* (${reply_rate.toFixed(2)}%)`,
        `⚠️ Bounces: *${totals.bounces.toLocaleString()}* (${bounce_rate.toFixed(2)}%)`,
    ];
    if (agg.campaigns.length) {
        lines.push("");
        lines.push("*Top campaigns:*");
        for (const c of agg.campaigns.slice(0, 6)) {
            const cRate = c.sent > 0 ? ((c.unique_replies / c.sent) * 100).toFixed(2) : "0.00";
            const name = c.name.length > 40 ? c.name.slice(0, 37) + "…" : c.name;
            lines.push(`• *${name}*: ${c.sent} sent, ${c.unique_replies} replies (${cRate}%), ${c.bounces} bounces`);
        }
    }
    return lines.join("\n");
}

// ---------- Senders ----------
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("coldEmailDailyReport Telegram failed:", err.message);
        return { ok: false, reason: err.message };
    }
}

async function sendSlack(blocks, fallbackText) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) {
        functions.logger.warn("SLACK_WEBHOOK_URL missing — Telegram-only");
        return { ok: false, reason: "no_webhook" };
    }
    try {
        await axios.post(url, { blocks, text: fallbackText, unfurl_links: false, unfurl_media: false },
            { timeout: 15000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("coldEmailDailyReport Slack failed:", err.message);
        return { ok: false, reason: err.message };
    }
}

// ---------- Snapshot ----------
async function snapshot(dateKey, agg) {
    try {
        await admin.firestore().collection("cold_email_daily_reports")
            .doc(dateKey).set({
                ...agg,
                ran_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
    } catch (err) {
        functions.logger.error("Firestore snapshot failed:", err.message);
    }
}

// =====================================================================
// 1) coldEmailDailyReport — 07:05 CDMX daily (yesterday's data)
// =====================================================================
exports.coldEmailDailyReport = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("5 7 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const dateKey = cdmxYesterdayKey();
        functions.logger.info(`coldEmailDailyReport ${dateKey}: starting`);

        const agg = await aggregate(dateKey, dateKey, `Daily Report · ${dateKey}`);
        const header = `📧 Cold Email Daily Report — ${dateKey}`;

        const slackResult = await sendSlack(buildBlocks(agg, header), buildTelegramMarkdown(agg, header));
        const tgResult = await sendTelegram(buildTelegramMarkdown(agg, header));

        await snapshot(dateKey, agg);

        functions.logger.info(`coldEmailDailyReport ${dateKey}: done`, {
            slack: slackResult.ok, telegram: tgResult.ok,
            sent: agg.totals.sent, replies: agg.totals.unique_replies,
        });
        return null;
    });

// =====================================================================
// 2) coldEmailWeeklyReport — Monday 08:00 CDMX (last 7 days rollup)
// =====================================================================
exports.coldEmailWeeklyReport = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("0 8 * * 1")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const endDate = cdmxYesterdayKey();
        const startDate = addDays(endDate, -6);
        functions.logger.info(`coldEmailWeeklyReport ${startDate} → ${endDate}: starting`);

        const agg = await aggregate(startDate, endDate, `Weekly Rollup · ${startDate} → ${endDate}`);
        const header = `📧 Cold Email Weekly Rollup — ${startDate} → ${endDate}`;

        const slackResult = await sendSlack(buildBlocks(agg, header), buildTelegramMarkdown(agg, header));
        const tgResult = await sendTelegram(buildTelegramMarkdown(agg, header));

        await snapshot(`weekly_${endDate}`, agg);

        functions.logger.info(`coldEmailWeeklyReport: done`, {
            slack: slackResult.ok, telegram: tgResult.ok,
            sent: agg.totals.sent, replies: agg.totals.unique_replies,
        });
        return null;
    });

// =====================================================================
// 3) coldEmailReportOnDemand — HTTPS endpoint for manual fire / debug
//    Hit: https://us-central1-jegodigital-e02fb.cloudfunctions.net/coldEmailReportOnDemand
//    Optional query:
//      ?date=2026-04-20               — single day
//      ?start=2026-04-14&end=2026-04-20 — custom range
//      ?notify=1                       — also post to Slack+Telegram (default 0)
// =====================================================================
exports.coldEmailReportOnDemand = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const notify = req.query.notify === "1" || req.query.notify === "true";

            let startDate, endDate, label, headerLabel;
            if (req.query.start && req.query.end) {
                startDate = String(req.query.start).slice(0, 10);
                endDate = String(req.query.end).slice(0, 10);
                label = `On-Demand · ${startDate} → ${endDate}`;
                headerLabel = `📧 Cold Email Report — ${startDate} → ${endDate}`;
            } else {
                const dateKey = req.query.date
                    ? String(req.query.date).slice(0, 10)
                    : cdmxYesterdayKey();
                startDate = endDate = dateKey;
                label = `On-Demand · ${dateKey}`;
                headerLabel = `📧 Cold Email Report — ${dateKey}`;
            }

            functions.logger.info(`coldEmailReportOnDemand ${startDate} → ${endDate} notify=${notify}`);

            const agg = await aggregate(startDate, endDate, label);

            let slackResult = { ok: false, reason: "notify_off" };
            let tgResult = { ok: false, reason: "notify_off" };
            if (notify) {
                slackResult = await sendSlack(buildBlocks(agg, headerLabel), buildTelegramMarkdown(agg, headerLabel));
                tgResult = await sendTelegram(buildTelegramMarkdown(agg, headerLabel));
                await snapshot(`ondemand_${endDate}`, agg);
            }

            res.status(200).json({
                ok: true,
                notified: notify,
                slack: slackResult.ok,
                telegram: tgResult.ok,
                window: { startDate, endDate },
                totals: agg.totals,
                rates: {
                    reply_rate_pct: +agg.reply_rate.toFixed(3),
                    open_rate_pct: +agg.open_rate.toFixed(2),
                    bounce_rate_pct: +agg.bounce_rate.toFixed(3),
                },
                active_firing: agg.active_firing,
                total_active: agg.total_active,
                campaigns: agg.campaigns.map((c) => ({
                    id: c.id,
                    name: c.name,
                    sent: c.sent,
                    unique_opens: c.unique_opens,
                    unique_replies: c.unique_replies,
                    bounces: c.bounces,
                })),
            });
        } catch (err) {
            functions.logger.error("coldEmailReportOnDemand error:", err);
            res.status(500).json({ ok: false, error: err.message, stack: err.stack });
        }
    });
