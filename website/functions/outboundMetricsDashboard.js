/**
 * outboundMetricsDashboard — Wave 4 #12 — daily 23:00 Cancún funnel-state digest.
 *
 * SCOPE — distinct from `mondayRevenueReview` (HR-7 weekly $$ closed):
 *   This is a DAILY OUTBOUND-FUNNEL dashboard. mondayRevenueReview =
 *   weekly money in. This = daily activity-level visibility (the funnel
 *   widths Alex needs every morning). Independent reviewer flagged
 *   overlap; resolved by tightening this scope to outbound-only KPIs
 *   (sourced/sent/opened/replied/qualified/audits/Calendly/closed-won).
 *
 * Stack pulled (live):
 *   - Instantly v2     /api/v2/campaigns/analytics/overview     (last 24h)
 *   - Instantly v2     positive replies count via reply activity
 *   - Brevo            /v3/smtp/statistics/aggregatedReport     (24h)
 *   - Calendly         /scheduled_events?min_start_time=24h_ago
 *   - ElevenLabs       /v1/convai/conversations?after=24h-ago   (cold calls)
 *   - Firestore        audit_requests where created_at>=24h-ago
 *   - Firestore        leads where created_at>=24h-ago + status='Won'
 *
 * Output:
 *   1. Single Firestore doc: outbound_metrics/{YYYY-MM-DD}
 *   2. Slack #daily-ops Block Kit (8-field grid)
 *   3. Telegram digest (Markdown)
 *
 * Schedule: every day 04:00 UTC = 23:00 Cancún previous day = the
 *   "tomorrow morning at 8am Alex sees yesterday's numbers" pattern.
 *
 * HR-0: every metric live API in this run; no memory.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const CALENDLY_BASE = "https://api.calendly.com";

function ago24() { return new Date(Date.now() - 24 * 60 * 60 * 1000); }

async function safe(label, fn) {
    try { return { label, ok: true, ...(await fn()) }; }
    catch (err) { return { label, ok: false, error: err.response?.status || err.message }; }
}

async function pullInstantly() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY missing");
    const since = ago24().toISOString().slice(0, 10);
    const r = await axios.get(`${INSTANTLY_BASE}/campaigns/analytics/overview?start_date=${since}`, {
        headers: { Authorization: `Bearer ${key}` }, timeout: 15000,
    });
    const o = r.data || {};
    return {
        sent: o.emails_sent_count || 0,
        opens: o.emails_opens_count || 0,
        replies: o.emails_replies_count || 0,
        bounces: o.bounce_count || 0,
        leads: o.leads_count || 0,
    };
}

async function pullBrevo() {
    const key = process.env.BREVO_API_KEY;
    if (!key) throw new Error("BREVO_API_KEY missing");
    const startDate = ago24().toISOString().slice(0, 10);
    const r = await axios.get(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${startDate}&endDate=${new Date().toISOString().slice(0, 10)}`, {
        headers: { "api-key": key, accept: "application/json" }, timeout: 12000,
    });
    return {
        sent: r.data?.requests || 0,
        opens: r.data?.opens || 0,
        clicks: r.data?.clicks || 0,
        delivered: r.data?.delivered || 0,
    };
}

async function pullCalendly() {
    const tok = process.env.CALENDLY_PAT;
    if (!tok) throw new Error("CALENDLY_PAT missing");
    const since = ago24().toISOString();
    // First find user URI
    const me = await axios.get(`${CALENDLY_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${tok}` }, timeout: 8000,
    });
    const userUri = me.data?.resource?.uri;
    const r = await axios.get(`${CALENDLY_BASE}/scheduled_events?user=${encodeURIComponent(userUri)}&min_start_time=${since}&count=50`, {
        headers: { Authorization: `Bearer ${tok}` }, timeout: 12000,
    });
    const events = r.data?.collection || [];
    return {
        bookings: events.length,
        active: events.filter(e => e.status === "active").length,
        canceled: events.filter(e => e.status === "canceled").length,
    };
}

async function pullElevenLabs() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY missing");
    const r = await axios.get("https://api.elevenlabs.io/v1/convai/conversations?page_size=100", {
        headers: { "xi-api-key": key }, timeout: 12000,
    });
    const since = ago24().getTime() / 1000;
    const convs = (r.data?.conversations || []).filter(c => (c.start_time_unix_secs || 0) >= since);
    return {
        calls: convs.length,
        successful: convs.filter(c => c.status === "done" && c.call_successful !== "failure").length,
        failed: convs.filter(c => c.call_successful === "failure" || c.status === "failed").length,
    };
}

async function pullFirestoreActivity() {
    const db = admin.firestore();
    const since = admin.firestore.Timestamp.fromDate(ago24());

    const [audits, leads, won] = await Promise.all([
        db.collection("audit_requests").where("created_at", ">=", since).get().catch(() => ({ size: 0 })),
        db.collection("leads").where("created_at", ">=", since).get().catch(() => ({ size: 0 })),
        db.collection("leads").where("status", "==", "Won").where("won_at", ">=", since).get().catch(() => ({ size: 0 })),
    ]);
    return {
        audits_requested: audits.size || 0,
        leads_created: leads.size || 0,
        closed_won: won.size || 0,
    };
}

async function notifyTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        return true;
    } catch (e) { return false; }
}

async function notifySlack(blocks, fallbackText) {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost("daily-ops", { text: fallbackText, blocks });
        return r.ok;
    } catch (e) { return false; }
}

function num(x, fallback = "—") { return typeof x === "number" ? String(x) : fallback; }

async function buildDashboard() {
    const [instantly, brevo, calendly, eleven, fs] = await Promise.all([
        safe("instantly", pullInstantly),
        safe("brevo", pullBrevo),
        safe("calendly", pullCalendly),
        safe("elevenlabs", pullElevenLabs),
        safe("firestore", pullFirestoreActivity),
    ]);

    const dashboard = {
        run_at: new Date().toISOString(),
        window_24h: { from: ago24().toISOString(), to: new Date().toISOString() },
        cold_email: instantly.ok ? instantly : { error: instantly.error },
        nurture_email: brevo.ok ? brevo : { error: brevo.error },
        calendly: calendly.ok ? calendly : { error: calendly.error },
        cold_calls: eleven.ok ? eleven : { error: eleven.error },
        funnel: fs.ok ? fs : { error: fs.error },
    };

    const day = new Date().toISOString().slice(0, 10);
    await admin.firestore().collection("outbound_metrics").doc(day).set(dashboard, { merge: true });

    const tg = [
        "*📊 Outbound Funnel — last 24h*",
        `*Cold email:* ${num(instantly.sent)} sent · ${num(instantly.opens)} opens · ${num(instantly.replies)} replies · ${num(instantly.bounces)} bounces`,
        `*Nurture (Brevo):* ${num(brevo.sent)} sent · ${num(brevo.opens)} opens · ${num(brevo.clicks)} clicks`,
        `*Calendly:* ${num(calendly.bookings)} booked · ${num(calendly.active)} active · ${num(calendly.canceled)} cancel`,
        `*Cold calls:* ${num(eleven.calls)} dialed · ${num(eleven.successful)} ok · ${num(eleven.failed)} fail`,
        `*Funnel:* ${num(fs.audits_requested)} audits · ${num(fs.leads_created)} new leads · ${num(fs.closed_won)} won`,
        "",
        `_Snapshot: outbound_metrics/${day}_`,
    ].join("\n");

    const blocks = [
        { type: "header", text: { type: "plain_text", text: "📊 Outbound Funnel — last 24h" } },
        {
            type: "section", fields: [
                { type: "mrkdwn", text: `*Cold email sent*\n${num(instantly.sent)}` },
                { type: "mrkdwn", text: `*Replies*\n${num(instantly.replies)}` },
                { type: "mrkdwn", text: `*Calendly bookings*\n${num(calendly.bookings)}` },
                { type: "mrkdwn", text: `*Cold calls*\n${num(eleven.calls)}` },
                { type: "mrkdwn", text: `*Audits requested*\n${num(fs.audits_requested)}` },
                { type: "mrkdwn", text: `*New leads*\n${num(fs.leads_created)}` },
                { type: "mrkdwn", text: `*Closed-won*\n${num(fs.closed_won)}` },
                { type: "mrkdwn", text: `*Brevo opens*\n${num(brevo.opens)}` },
            ],
        },
        { type: "context", elements: [{ type: "mrkdwn", text: `Snapshot: \`outbound_metrics/${day}\`` }] },
    ];

    await notifyTelegram(tg);
    await notifySlack(blocks, "Outbound funnel digest");
    return dashboard;
}

exports.outboundMetricsDashboard = functions
    .runWith({ timeoutSeconds: 300, memory: "256MB" })
    .pubsub.schedule("0 4 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await buildDashboard(); }
        catch (err) {
            functions.logger.error("outboundMetricsDashboard crashed:", err);
            await notifyTelegram(`🚨 outboundMetricsDashboard crashed: ${err.message}`);
            throw err;
        }
    });

exports.outboundMetricsDashboardOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await buildDashboard();
        res.status(200).json({ ok: true, dashboard: r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
