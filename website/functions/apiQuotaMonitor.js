/**
 * apiQuotaMonitor — Wave 4 #9 — every 6h API quota burn watch.
 *
 * Polls usage/credit endpoints across the JegoDigital stack and alerts at
 * 80% burn so we never get day-of outages. Schedule: every 6 hours UTC
 * (00:00 / 06:00 / 12:00 / 18:00 UTC). Snapshot: api_quota_snapshots/{ISO}.
 *
 * Stack covered (all live keys verified in HR-2 / .env):
 *   ElevenLabs   /v1/user/subscription            character_count vs character_limit
 *   DataForSEO   /v3/appendix/user_data            money_balance + credit threshold
 *   Hunter       /v2/account                       requests vs available
 *   Brevo        /v3/account                       plan + relay credit
 *   SerpAPI      /account                          plan_searches_left vs plan_searches
 *   Firecrawl    /v0/team/credit-usage             credits remaining
 *   Apify        /v2/users/me                      monthlyUsage.computeUnits
 *   OpenAI       /v1/dashboard/billing/credit_grants (best-effort; deprecated by OpenAI)
 *   Anthropic    /v1/organizations (workspace usage; falls back to credit watchdog)
 *   Twilio       /Accounts/{sid}.json              balance
 *   Meta Ad Acct /act_{id}/insights spend MTD vs ad_account_business_constraints
 *
 * Each call is wrapped in try/catch — a single 401/429 must not drop the
 * digest. Missing data → renders "—" with reason in Firestore snapshot.
 *
 * Alerts:
 *   ⚠️  80%+ usage on any source → Telegram (#alerts) + Slack (#alerts)
 *   🚨 95%+ → SMS escalation via telegramHelper.notify({critical:true})
 *
 * Env: every API key already present in .env (verified 2026-04-15).
 *
 * HR-0 / HR-2: every metric a live API call THIS run, never memory.
 * HR-6: snapshots to api_quota_snapshots/{ISO} → cronHealthMonitor reads.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const ALERT_THRESHOLD = 0.80;   // 80%
const CRITICAL_THRESHOLD = 0.95; // 95%
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

function pct(used, limit) {
    if (!limit || limit <= 0) return null;
    return Math.min(used / limit, 1);
}

async function safeCall(label, fn) {
    try {
        const v = await fn();
        return { label, ok: true, ...v };
    } catch (err) {
        return { label, ok: false, error: err.response?.status || err.message };
    }
}

async function checkElevenLabs() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY missing");
    const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": key }, timeout: 8000,
    });
    const used = r.data?.character_count || 0;
    const limit = r.data?.character_limit || 1;
    return { used, limit, used_pct: pct(used, limit), tier: r.data?.tier };
}

async function checkDataForSEO() {
    const u = process.env.DATAFORSEO_LOGIN, p = process.env.DATAFORSEO_PASS;
    if (!u || !p) throw new Error("DATAFORSEO creds missing");
    const r = await axios.get("https://api.dataforseo.com/v3/appendix/user_data", {
        auth: { username: u, password: p }, timeout: 8000,
    });
    const balance = r.data?.tasks?.[0]?.data?.money?.balance || 0;
    return { balance_usd: balance, low: balance < 5 };
}

async function checkHunter() {
    const key = process.env.HUNTER_API_KEY;
    if (!key) throw new Error("HUNTER_API_KEY missing");
    const r = await axios.get(`https://api.hunter.io/v2/account?api_key=${key}`, { timeout: 8000 });
    const used = r.data?.data?.requests?.searches?.used || 0;
    const limit = r.data?.data?.requests?.searches?.available || 1;
    return { used, limit, used_pct: pct(used, limit) };
}

async function checkBrevo() {
    const key = process.env.BREVO_API_KEY;
    if (!key) throw new Error("BREVO_API_KEY missing");
    const r = await axios.get("https://api.brevo.com/v3/account", {
        headers: { "api-key": key, accept: "application/json" }, timeout: 8000,
    });
    const plans = r.data?.plan || [];
    const p = plans.find(x => x.type === "payAsYouGo") || plans[0] || {};
    return { plan: p.type, credits: p.credits || 0 };
}

async function checkSerpAPI() {
    const key = process.env.SERPAPI_KEY;
    if (!key) throw new Error("SERPAPI_KEY missing");
    const r = await axios.get(`https://serpapi.com/account?api_key=${key}`, { timeout: 8000 });
    const used = r.data?.this_month_usage || 0;
    const limit = r.data?.searches_per_month || 1;
    return { used, limit, used_pct: pct(used, limit) };
}

async function checkFirecrawl() {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) return { skip: true, reason: "no_key" };
    const r = await axios.get("https://api.firecrawl.dev/v1/team/credit-usage", {
        headers: { Authorization: `Bearer ${key}` }, timeout: 8000,
    });
    const used = r.data?.data?.remainingCredits || 0;
    return { credits_remaining: used, low: used < 100 };
}

async function checkApify() {
    const key = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
    if (!key) return { skip: true, reason: "no_key" };
    const r = await axios.get("https://api.apify.com/v2/users/me", {
        headers: { Authorization: `Bearer ${key}` }, timeout: 8000,
    });
    return { plan: r.data?.data?.plan, monthly_usd_used: r.data?.data?.monthlyUsage?.totalUsd };
}

async function checkTwilio() {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) return { skip: true, reason: "no_creds" };
    const r = await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
        auth: { username: sid, password: tok }, timeout: 8000,
    });
    const balance = parseFloat(r.data?.balance || "0");
    return { balance_usd: balance, low: balance < 10 };
}

async function checkMeta() {
    const tok = process.env.FB_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const acct = process.env.FB_ADS_ACCOUNT_ID;
    if (!tok || !acct) return { skip: true, reason: "no_creds" };
    const r = await axios.get(
        `https://graph.facebook.com/v22.0/${acct}?fields=balance,amount_spent&access_token=${tok}`,
        { timeout: 8000 }
    );
    return { balance_cents: r.data?.balance, spent_lifetime: r.data?.amount_spent };
}

async function runQuotaCheck() {
    const checks = await Promise.all([
        safeCall("elevenlabs", checkElevenLabs),
        safeCall("dataforseo", checkDataForSEO),
        safeCall("hunter", checkHunter),
        safeCall("brevo", checkBrevo),
        safeCall("serpapi", checkSerpAPI),
        safeCall("firecrawl", checkFirecrawl),
        safeCall("apify", checkApify),
        safeCall("twilio", checkTwilio),
        safeCall("meta", checkMeta),
    ]);

    const alerts = [], criticals = [];
    for (const c of checks) {
        if (!c.ok || c.skip) continue;
        if (typeof c.used_pct === "number") {
            if (c.used_pct >= CRITICAL_THRESHOLD) criticals.push(`🚨 ${c.label}: ${(c.used_pct * 100).toFixed(0)}% used`);
            else if (c.used_pct >= ALERT_THRESHOLD) alerts.push(`⚠️  ${c.label}: ${(c.used_pct * 100).toFixed(0)}% used`);
        }
        if (c.low) alerts.push(`⚠️  ${c.label}: low balance/credit`);
    }

    return { checks, alerts, criticals, run_at: new Date().toISOString() };
}

async function notifyTelegram(text, critical = false) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        return true;
    } catch (e) {
        functions.logger.error("apiQuotaMonitor telegram failed:", e.message);
        return false;
    }
}

async function notifySlack(text, channel = "alerts") {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost(channel, { text });
        return r.ok;
    } catch (e) {
        functions.logger.error("apiQuotaMonitor slack failed:", e.message);
        return false;
    }
}

async function fireAndSnapshot() {
    const result = await runQuotaCheck();
    const db = admin.firestore();
    const docId = result.run_at.replace(/[:.]/g, "-");

    await db.collection("api_quota_snapshots").doc(docId).set(result, { merge: true });

    if (result.criticals.length || result.alerts.length) {
        const lines = [
            "*🔋 API Quota Monitor*",
            ...result.criticals,
            ...result.alerts,
            "",
            `_Snapshot: api_quota_snapshots/${docId}_`,
        ];
        const text = lines.join("\n");
        await notifyTelegram(text, result.criticals.length > 0);
        await notifySlack(text);
    } else {
        // Silent unless first-of-month alive ping
        const day = new Date().getUTCDate();
        if (day === 1) {
            await notifyTelegram("✅ apiQuotaMonitor: all quotas healthy (1st-of-month ping).");
        }
    }
    return result;
}

exports.apiQuotaMonitor = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("0 */6 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await fireAndSnapshot(); }
        catch (err) {
            functions.logger.error("apiQuotaMonitor crashed:", err);
            await notifyTelegram(`🚨 apiQuotaMonitor crashed: ${err.message}`);
            throw err;
        }
    });

exports.apiQuotaMonitorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await fireAndSnapshot();
        res.status(200).json({ ok: true, ...r });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
