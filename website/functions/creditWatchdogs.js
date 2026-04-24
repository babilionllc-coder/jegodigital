/**
 * creditWatchdogs — JegoDigital credit/quota watchdogs
 *
 * Polls each platform's billing/quota API on a cadence.
 * Alerts to Slack #alerts when threshold crossed.
 *
 * Why this exists: 2026-04-24 ElevenLabs hit 91.8% and NO ONE knew.
 * Cold-calls were about to silently fail mid-call. This prevents that.
 *
 * Crons (all timezone America/Mexico_City):
 *   elevenLabsCreditWatchdog: every 6h — alert when >80%
 *   brevoCreditWatchdog: every 6h — alert when <200 credits
 *   twilioBalanceWatchdog: every 6h — alert when <$15
 *   hunterQuotaWatchdog: every 12h — alert when >90%
 *   dataforseoBalanceWatchdog: every 12h — alert when <$15
 *
 * HTTPS on-demand: /creditWatchdogsOnDemand (header X-Admin-Token)
 *
 * HR-0 compliant: every number from live API call.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const ALERTS_CHANNEL_FALLBACK = "C0AV2Q73PM4"; // #alerts

// ============================================================
// Slack helpers
// ============================================================
async function postSlackAlert({ level, title, body, details }) {
    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL_ALERTS || ALERTS_CHANNEL_FALLBACK;
    if (!token) {
        functions.logger.warn("SLACK_BOT_TOKEN missing — fallback to webhook");
        return postSlackWebhook({ level, title, body, details });
    }
    const emoji = level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";
    const blocks = [
        { type: "header", text: { type: "plain_text", text: `${emoji} ${title}` } },
        { type: "section", text: { type: "mrkdwn", text: body } },
    ];
    if (details) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: details }] });
    try {
        const r = await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel, text: `${emoji} ${title}`, blocks },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json; charset=utf-8",
                },
                timeout: 10000,
            }
        );
        return r.data?.ok === true;
    } catch (e) {
        functions.logger.error("slack alert failed", e.message);
        return false;
    }
}

async function postSlackWebhook({ level, title, body }) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return false;
    const emoji = level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";
    try {
        await axios.post(url, { text: `${emoji} *${title}*\n${body}` }, { timeout: 10000 });
        return true;
    } catch (_) {
        return false;
    }
}

async function logRun(name, data) {
    try {
        await admin.firestore().collection("watchdog_runs").add({
            name,
            ...data,
            ts: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
        functions.logger.error("logRun failed", e.message);
    }
}

// ============================================================
// ElevenLabs — every 6h
// ============================================================
async function checkElevenLabs() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { ok: false, skipped: "no_key" };
    const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": key },
        timeout: 15000,
    });
    const d = r.data || {};
    const used = d.character_count || 0;
    const limit = d.character_limit || 1;
    const pct = (used / limit) * 100;
    const resetTs = d.next_character_count_reset_unix || 0;
    const resetDate = resetTs ? new Date(resetTs * 1000).toISOString().split("T")[0] : "?";
    const tier = d.tier || "?";

    await logRun("elevenlabs", { used, limit, pct: Number(pct.toFixed(2)), tier });

    if (pct >= 95) {
        await postSlackAlert({
            level: "critical",
            title: `ElevenLabs at ${pct.toFixed(1)}% — imminent cutoff`,
            body:
                `*${used.toLocaleString()} / ${limit.toLocaleString()} chars used*\n` +
                `Resets: ${resetDate}\n\n` +
                `*What breaks at 100%:*\n• Cold-call agents stop speaking mid-call\n` +
                `• YouTube voiceover fails\n• Property video narration fails\n\n` +
                `*Actions:*\n1. Upgrade to Pro ($99/mo, 500K chars)\n` +
                `2. Pause cold-calls\n3. Switch to cheaper TTS model`,
            details: `Tier: ${tier} · run: ${new Date().toISOString()}`,
        });
    } else if (pct >= 80) {
        await postSlackAlert({
            level: "warning",
            title: `ElevenLabs at ${pct.toFixed(1)}% — watch this`,
            body:
                `*${used.toLocaleString()} / ${limit.toLocaleString()} chars used* (resets ${resetDate})\n\n` +
                `Projected to hit 100% before reset. Consider upgrading to Pro tier ($99/mo = 500K chars).`,
            details: `Tier: ${tier}`,
        });
    }
    return { ok: true, used, limit, pct: Number(pct.toFixed(2)), tier, resetDate };
}

// ============================================================
// Brevo — every 6h
// ============================================================
async function checkBrevo() {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { ok: false, skipped: "no_key" };
    const r = await axios.get("https://api.brevo.com/v3/account", {
        headers: { "api-key": key },
        timeout: 15000,
    });
    const plans = r.data?.plan || [];
    const emailPlan = plans.find((p) => p.type === "free" || p.type === "unlimited" || p.creditsType === "sendLimit");
    const credits = emailPlan?.credits ?? -1;
    await logRun("brevo", { credits, plans: plans.map((p) => p.type) });
    if (credits >= 0 && credits < 200) {
        await postSlackAlert({
            level: "warning",
            title: `Brevo credits low: ${credits} left`,
            body:
                `*Plan:* ${emailPlan?.type || "?"}\n*Credits remaining:* ${credits}\n\n` +
                `Brevo powers nurture emails for existing leads. Running out = no follow-up drip.`,
        });
    }
    return { ok: true, credits };
}

// ============================================================
// Twilio — every 6h
// ============================================================
async function checkTwilio() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) return { ok: false, skipped: "no_creds" };
    const auth = Buffer.from(`${sid}:${tok}`).toString("base64");
    const r = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
        { headers: { Authorization: `Basic ${auth}` }, timeout: 15000 }
    );
    const bal = parseFloat(r.data?.balance || "0");
    const currency = r.data?.currency || "USD";
    await logRun("twilio", { balance: bal, currency });
    if (bal < 15) {
        await postSlackAlert({
            level: "critical",
            title: `Twilio balance low: $${bal.toFixed(2)} ${currency}`,
            body:
                `Cold-calls fail when balance hits $0. Top up now:\n` +
                `https://console.twilio.com/us1/billing/manage-billing`,
        });
    } else if (bal < 25) {
        await postSlackAlert({
            level: "warning",
            title: `Twilio balance: $${bal.toFixed(2)} ${currency}`,
            body: `Below $25. ~3 days at current cold-call burn (~$2-4/day).`,
        });
    }
    return { ok: true, balance: bal, currency };
}

// ============================================================
// Hunter.io — every 12h
// ============================================================
async function checkHunter() {
    const key = process.env.HUNTER_API_KEY;
    if (!key) return { ok: false, skipped: "no_key" };
    const r = await axios.get(`https://api.hunter.io/v2/account?api_key=${key}`, {
        timeout: 15000,
    });
    const searches = r.data?.data?.requests?.searches || {};
    const used = searches.used || 0;
    const avail = searches.available || 1;
    const pct = (used / avail) * 100;
    const reset = r.data?.data?.reset_date || "?";
    await logRun("hunter", { used, available: avail, pct: Number(pct.toFixed(2)) });
    if (pct >= 90) {
        await postSlackAlert({
            level: "warning",
            title: `Hunter.io at ${pct.toFixed(0)}% search quota`,
            body:
                `*${used} / ${avail}* searches used (resets ${reset}).\n` +
                `Lead-finder will stop enriching. Cap daily runs or upgrade.`,
        });
    }
    return { ok: true, used, available: avail, pct: Number(pct.toFixed(2)), resetDate: reset };
}

// ============================================================
// DataForSEO — every 12h
// ============================================================
async function checkDataForSeo() {
    const login = process.env.DATAFORSEO_LOGIN;
    const pw = process.env.DATAFORSEO_PASS;
    if (!login || !pw) return { ok: false, skipped: "no_creds" };
    const auth = Buffer.from(`${login}:${pw}`).toString("base64");
    const r = await axios.get("https://api.dataforseo.com/v3/appendix/user_data", {
        headers: { Authorization: `Basic ${auth}` },
        timeout: 15000,
    });
    const bal = r.data?.tasks?.[0]?.result?.[0]?.money?.balance || 0;
    const currency = r.data?.tasks?.[0]?.result?.[0]?.money?.currency || "USD";
    await logRun("dataforseo", { balance: bal, currency });
    if (bal < 5) {
        await postSlackAlert({
            level: "critical",
            title: `DataForSEO balance: $${bal.toFixed(2)}`,
            body:
                `SEO Engine + keyword research will fail. Top up:\n` +
                `https://app.dataforseo.com/api-dashboard/billing`,
        });
    } else if (bal < 15) {
        await postSlackAlert({
            level: "warning",
            title: `DataForSEO balance: $${bal.toFixed(2)}`,
            body: `Below $15 threshold. Typical burn $1-2/week. Top up soon.`,
        });
    }
    return { ok: true, balance: bal, currency };
}

// ============================================================
// Runner + on-demand HTTPS
// ============================================================
async function runAll() {
    const results = {};
    try { results.elevenlabs = await checkElevenLabs(); } catch (e) { results.elevenlabs = { ok: false, err: e.message }; }
    try { results.brevo = await checkBrevo(); } catch (e) { results.brevo = { ok: false, err: e.message }; }
    try { results.twilio = await checkTwilio(); } catch (e) { results.twilio = { ok: false, err: e.message }; }
    try { results.hunter = await checkHunter(); } catch (e) { results.hunter = { ok: false, err: e.message }; }
    try { results.dataforseo = await checkDataForSeo(); } catch (e) { results.dataforseo = { ok: false, err: e.message }; }
    return results;
}

// ============================================================
// Exports — 1 combined cron + 1 on-demand for simplicity
// ============================================================
exports.creditWatchdogs = functions
    .runWith({
        timeoutSeconds: 120,
        memory: "256MB",
        secrets: [
            "SLACK_BOT_TOKEN",
            "ELEVENLABS_API_KEY",
            "BREVO_API_KEY",
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "HUNTER_API_KEY",
            "DATAFORSEO_LOGIN",
            "DATAFORSEO_PASS",
            "SLACK_WEBHOOK_URL",
            "SLACK_CHANNEL_ALERTS",
        ],
    })
    .pubsub.schedule("every 6 hours")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await runAll();
            functions.logger.info("creditWatchdogs:", JSON.stringify(r));
            return null;
        } catch (e) {
            functions.logger.error("creditWatchdogs threw", e);
            return null;
        }
    });

exports.creditWatchdogsOnDemand = functions
    .runWith({
        timeoutSeconds: 120,
        memory: "256MB",
        secrets: [
            "SLACK_BOT_TOKEN",
            "ELEVENLABS_API_KEY",
            "BREVO_API_KEY",
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "HUNTER_API_KEY",
            "DATAFORSEO_LOGIN",
            "DATAFORSEO_PASS",
            "SLACK_WEBHOOK_URL",
            "SLACK_CHANNEL_ALERTS",
            "ADMIN_TRIGGER_TOKEN",
        ],
    })
    .https.onRequest(async (req, res) => {
        const tok = req.get("X-Admin-Token");
        if (!tok || tok !== process.env.ADMIN_TRIGGER_TOKEN) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const r = await runAll();
        return res.status(200).json({ ok: true, results: r, ts: new Date().toISOString() });
    });
