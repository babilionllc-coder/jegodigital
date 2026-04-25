/**
 * dailyPipelineDigest — 6am CDMX Slack DM with full pipeline state.
 * Also has sendingPreviewTonight (9pm CDMX) — "tomorrow's sends preview".
 *
 * Pulls live from:
 *   - Instantly API (campaigns, leads, replies, sending_status)
 *   - Brevo (nurture sends)
 *   - Calendly (today's bookings)
 *   - JegoClay queue depth
 *
 * Posts to Slack via SLACK_WEBHOOK_URL.
 *
 * Cron: 0 12 * * *  (6am CDMX — morning digest)
 *       0 3  * * *  (9pm CDMX — tomorrow preview)
 */
const functions = require("firebase-functions");
const axios     = require("axios");
const admin     = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const INSTANTLY_UA  = "curl/8.4.0";

async function instantly(method, path, body = null) {
    const url = INSTANTLY_API + path;
    const headers = {
        "Authorization": `Bearer ${process.env.INSTANTLY_API_KEY}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "User-Agent":    INSTANTLY_UA,
    };
    try {
        const r = await axios({ method, url, headers, data: body, timeout: 15000 });
        return r.data;
    } catch (e) {
        functions.logger.warn(`Instantly ${method} ${path} error:`, e.response?.status, e.response?.data);
        return null;
    }
}

async function brevoLast24h() {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { sent: 0, delivered: 0 };
    try {
        const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
        const today     = new Date().toISOString().slice(0, 10);
        const r = await axios.get(
            `https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${yesterday}&endDate=${today}`,
            { headers: { "api-key": key, accept: "application/json" }, timeout: 10000 }
        );
        return {
            sent:      r.data.requests || 0,
            delivered: r.data.delivered || 0,
            opens:     r.data.uniqueOpens || 0,
            replies:   0,
        };
    } catch (e) { return { sent: 0, delivered: 0 }; }
}

async function calendlyTodayCount() {
    const pat = process.env.CALENDLY_PAT;
    if (!pat) return 0;
    try {
        const today = new Date().toISOString().slice(0, 10);
        const startOfDay = `${today}T00:00:00Z`;
        const endOfDay   = `${today}T23:59:59Z`;
        const r = await axios.get(
            `https://api.calendly.com/scheduled_events?min_start_time=${startOfDay}&max_start_time=${endOfDay}&count=100&status=active`,
            { headers: { Authorization: `Bearer ${pat}` }, timeout: 10000 }
        );
        return (r.data.collection || []).length;
    } catch (e) { return 0; }
}

async function queueDepth() {
    // Read from repo via raw.githubusercontent.com (no GH token needed for public file)
    try {
        const r = await axios.get(
            "https://raw.githubusercontent.com/babilionllc-coder/jegodigital/main/leads/queue/pending.csv",
            { timeout: 8000, responseType: "text" }
        );
        const lines = (r.data || "").split("\n").filter(l => l.trim());
        return Math.max(0, lines.length - 1);  // minus header
    } catch (e) { return null; }
}

async function instantlyStats() {
    // FIXED 2026-04-25 — was POST with body (returned 0/0/0). Correct call is
    // GET with query string. Field names from /campaigns/analytics/daily are
    // `sent`, `opened`/`unique_opened`, `replies`/`unique_replies`, `clicks`.
    // Without campaign_id the endpoint aggregates across all campaigns.
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const today     = new Date().toISOString().slice(0, 10);
    const data = await instantly(
        "GET",
        `/campaigns/analytics/daily?start_date=${yesterday}&end_date=${today}`,
    );
    if (!data) return { sent: 0, opens: 0, replies: 0, positive_replies: 0 };
    // Sum across day rows (one row per date in the window)
    let sent = 0, opens = 0, replies = 0;
    const rows = Array.isArray(data) ? data : (data.items || data.data || []);
    for (const r of rows) {
        sent    += r.sent           || r.emails_sent     || 0;
        opens   += r.unique_opened  || r.opened          || 0;
        replies += r.unique_replies || r.replies         || 0;
    }
    return { sent, opens, replies, positive_replies: 0 };  // positive_replies requires reply classifier
}

async function postSlack(text, blocks = null) {
    // 2026-04-25: routed to #daily-ops via slackPost helper.
    const { slackPost } = require('./slackPost');
    const result = await slackPost('daily-ops', blocks ? { text, blocks } : { text });
    if (!result.ok) {
        functions.logger.warn("dailyPipelineDigest postSlack failed:", result.error || "unknown");
    }
}

// ============================================================
// MORNING DIGEST (6am CDMX)
// ============================================================
exports.dailyPipelineDigest = functions
    .runWith({ timeoutSeconds: 120, memory: "512MB" })
    .pubsub.schedule("0 12 * * *")  // 12:00 UTC = 06:00 CDMX (standard)
    .timeZone("America/Mexico_City")
    .onRun(async (ctx) => {
        functions.logger.info("dailyPipelineDigest starting");
        const [inst, brevo, cal, queue] = await Promise.all([
            instantlyStats(),
            brevoLast24h(),
            calendlyTodayCount(),
            queueDepth(),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const msg =
            `🌅 *JegoDigital Morning Pipeline — ${today}*\n\n` +
            `📬 *Instantly (last 24h):*\n` +
            `   • ${inst.sent} emails sent · ${inst.opens} opens · ${inst.replies} replies\n\n` +
            `📨 *Brevo nurture (last 24h):*\n` +
            `   • ${brevo.sent} sent · ${brevo.delivered} delivered · ${brevo.opens || 0} opens\n\n` +
            `📅 *Calendly today:* ${cal} booking(s)\n\n` +
            `📦 *Queue depth:* ${queue !== null ? queue : "?"} leads pending\n` +
            `   ${queue !== null && queue < 50 ? "⚠️ Low — drop a fresh Vibe CSV in leads/input/" : "✅ Healthy"}\n\n` +
            `_Daily top-up cron runs at 6am CDMX — next batch of 200 processing shortly._`;
        await postSlack(msg);
        await admin.firestore().collection("pipeline_digests").doc(today).set({
            at: admin.firestore.FieldValue.serverTimestamp(),
            instantly: inst, brevo, calendly_today: cal, queue_depth: queue,
        });
        return null;
    });

exports.dailyPipelineDigestOnDemand = functions
    .https.onRequest(async (req, res) => {
        const [inst, brevo, cal, queue] = await Promise.all([
            instantlyStats(), brevoLast24h(), calendlyTodayCount(), queueDepth(),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const msg =
            `🌅 *JegoDigital Morning Pipeline — ${today}* (manual trigger)\n\n` +
            `📬 Instantly 24h: ${inst.sent} sent · ${inst.opens} opens · ${inst.replies} replies\n` +
            `📨 Brevo 24h: ${brevo.sent} sent · ${brevo.delivered || 0} delivered\n` +
            `📅 Calendly today: ${cal}\n` +
            `📦 Queue: ${queue !== null ? queue : "?"} leads\n`;
        await postSlack(msg);
        return res.json({ ok: true, instantly: inst, brevo, calendly_today: cal, queue_depth: queue });
    });

// ============================================================
// NIGHTLY PREVIEW (9pm CDMX — tomorrow's sends)
// ============================================================
exports.sendingPreviewTonight = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("0 3 * * *")  // 03:00 UTC = 21:00 CDMX prev day
    .timeZone("America/Mexico_City")
    .onRun(async (ctx) => {
        // Get campaigns with status=1 (active)
        const data = await instantly("GET", "/campaigns?limit=20");
        const campaigns = data?.items || data || [];
        const active = campaigns.filter(c => c.status === 1);
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
        let msg = `🌙 *Tomorrow's Sends Preview — ${tomorrow}*\n\n`;
        if (active.length === 0) {
            msg += "_No active campaigns. Activate in Instantly UI if you want sends tomorrow._";
        } else {
            msg += `📬 *${active.length} active campaign(s)* — Instantly will send during their window:\n`;
            for (const c of active) {
                const dl = c.daily_limit || 30;
                msg += `   • *${c.name}* — up to ${dl}/day\n`;
            }
            msg += `\n_Actual send count depends on warmup + available leads per campaign._`;
        }
        await postSlack(msg);
        return null;
    });
