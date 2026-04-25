/**
 * bridgeRateWatcher — 10:30 CDMX Mon-Fri (30 min after coldCallRun).
 *
 * Pulls today's Twilio calls, computes real-bridge rate (duration ≥5s),
 * Slacks + Telegrams if <20% (early warning for silent dial failures
 * like the 2026-04-24 0% mystery).
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
if (!admin.apps.length) admin.initializeApp();

async function notify(text) {
    const tg = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_CHAT_ID;
    // 2026-04-25: routed to #alerts (bridge-rate watchdog) via slackPost helper.
    try {
        const { slackPost } = require('./slackPost');
        await slackPost('alerts', { text });
    } catch (e) {
        functions.logger.warn("slack notify failed:", e.message);
    }
    if (tg && tgChat) {
        try {
            await axios.post(`https://api.telegram.org/bot${tg}/sendMessage`, {
                chat_id: tgChat, text, parse_mode: "Markdown",
            }, { timeout: 8000 });
        } catch (e) { functions.logger.warn("telegram notify failed:", e.message); }
    }
}

async function computeBridgeRate() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=100`;
    const r = await axios.get(url, {
        auth: { username: sid, password: tok }, timeout: 15000,
    });
    const all = r.data?.calls || [];
    // Filter to today CDMX (UTC-6). Today's 10:00 CDMX = 16:00 UTC
    const nowUtc = Date.now();
    const windowStart = nowUtc - 3 * 60 * 60 * 1000; // last 3h
    const recent = all.filter((c) => {
        const d = Date.parse(c.start_time);
        return d >= windowStart;
    });
    const total = recent.length;
    const realBridge = recent.filter((c) => parseInt(c.duration || 0, 10) >= 5).length;
    const pct = total ? 100 * realBridge / total : 0;
    return { total, realBridge, pct: Math.round(pct * 10) / 10, recent };
}

exports.bridgeRateWatcher = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("30 10 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const r = await computeBridgeRate();
        const dateKey = new Date().toISOString().slice(0, 10);
        // Log snapshot
        await admin.firestore().collection("bridge_rate_snapshots").doc(dateKey).set({
            date: dateKey, total: r.total, real_bridges: r.realBridge, pct: r.pct,
            recorded_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        // Alert if <20% on non-trivial sample
        if (r.total >= 5 && r.pct < 20) {
            await notify(`🚨 *Cold-call bridge rate CRITICAL* — ${r.pct}% (${r.realBridge}/${r.total}) on last 3h. Open dashboard: https://www.notion.so/34cf21a7c6e581ffac50fe226b79388d`);
        } else if (r.total >= 5 && r.pct >= 40) {
            await notify(`✅ Cold-call bridge rate healthy: ${r.pct}% (${r.realBridge}/${r.total}) — ${dateKey}`);
        } else if (r.total < 5) {
            functions.logger.info(`bridgeRateWatcher: only ${r.total} calls in window, skipping alert`);
        }
        return null;
    });

exports.bridgeRateWatcherOnDemand = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const r = await computeBridgeRate();
            res.status(200).json({ ok: true, ...r });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
