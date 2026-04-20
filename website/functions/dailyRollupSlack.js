/**
 * dailyRollupSlack — 18:00 CDMX daily close-of-business Slack brief.
 *
 * Pulls today's numbers from every channel (cold calls, cold email,
 * audit pipeline, FB Ads, $$ cost proxy) and posts a single Slack
 * message block to SLACK_WEBHOOK_URL so Alex can read the day in 30
 * seconds at close-of-business.
 *
 * Designed to be a PARALLEL view to dailyDigest (07:00 CDMX morning
 * Telegram) — dailyDigest looks at YESTERDAY, dailyRollupSlack looks
 * at TODAY up to 18:00.
 *
 * Every metric is wrapped in its own try/catch — a single broken
 * source must not drop the brief. Missing data renders as "—".
 *
 * Schedule: `0 18 * * *` / `America/Mexico_City`
 *
 * Env:
 *   SLACK_WEBHOOK_URL          (required)
 *   INSTANTLY_API_KEY          (cold-email stats)
 *   FB_ADS_ACCESS_TOKEN        (FB Ads spend — optional, skips gracefully)
 *   FB_ADS_ACCOUNT_ID          (e.g. act_123456789)
 *   ELEVENLABS_API_KEY         (ElevenLabs credit check)
 *   TELEGRAM_BOT_TOKEN         (fallback if Slack webhook missing)
 *   TELEGRAM_CHAT_ID
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// ---- Telegram fallback ----
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

async function sendSlack(text, blocks) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) {
        // Fallback: send to Telegram so we still know what happened
        const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
        const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: `[SLACK_WEBHOOK_URL missing — fallback to TG]\n${text}`,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }, { timeout: 10000 });
        } catch (err) {
            functions.logger.error("dailyRollupSlack TG fallback failed:", err.message);
        }
        return { ok: false, fallback: "telegram" };
    }
    try {
        const payload = blocks ? { text, blocks } : { text };
        await axios.post(url, payload, { timeout: 10000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("dailyRollupSlack Slack send failed:", err.response?.data || err.message);
        return { ok: false, error: err.message };
    }
}

// ---- Date helpers — CDMX is UTC-6 year-round ----
function cdmxTodayRange() {
    const now = new Date();
    const cdmxOffsetMs = -6 * 60 * 60 * 1000;
    const nowCdmx = new Date(now.getTime() + cdmxOffsetMs);
    const y = nowCdmx.getUTCFullYear();
    const m = nowCdmx.getUTCMonth();
    const d = nowCdmx.getUTCDate();
    const midnightCdmxUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - cdmxOffsetMs);
    return {
        startMs: midnightCdmxUtc.getTime(),
        start: admin.firestore.Timestamp.fromDate(midnightCdmxUtc),
        dateKey: midnightCdmxUtc.toISOString().slice(0, 10),
    };
}

// ============================================================
// 1. Cold-call outcomes (today)
// ============================================================
async function getColdCallToday(db, dateKey) {
    try {
        const summary = await db.collection("call_queue_summaries").doc(dateKey).get();
        if (!summary.exists) return { fired: 0, queued: 0, positive: 0, negative: 0, neutral: 0, pending: 0, note: "no summary" };
        const d = summary.data();
        return {
            queued: d.total || 0,
            fired: d.fired || 0,
            failed: d.failed || 0,
            positive: d.positive || 0,
            negative: d.negative || 0,
            neutral: d.neutral || 0,
            pending: d.pending || 0,
            audits_queued: d.audits_queued || 0,
            offer_counts: d.offer_counts || { A: 0, B: 0, C: 0 },
        };
    } catch (err) {
        return { error: err.message };
    }
}

// ============================================================
// 2. Instantly cold-email stats (rolling 24h)
// ============================================================
async function getInstantlyStats() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) return { error: "INSTANTLY_API_KEY not set" };
    try {
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns/analytics/overview", {
            headers: { Authorization: `Bearer ${key}` },
            params: {
                start_date: start.toISOString().slice(0, 10),
                end_date: end.toISOString().slice(0, 10),
            },
            timeout: 15000,
        });
        const d = r.data || {};
        return {
            sent: d.emails_sent_count || 0,
            opens: d.open_count || 0,
            replies: d.reply_count || 0,
            bounces: d.bounced_count || 0,
            openRate: d.emails_sent_count ? Math.round((100 * (d.open_count || 0)) / d.emails_sent_count) : 0,
            replyRate: d.emails_sent_count ? Math.round((1000 * (d.reply_count || 0)) / d.emails_sent_count) / 10 : 0,
            bounceRate: d.emails_sent_count ? Math.round((1000 * (d.bounced_count || 0)) / d.emails_sent_count) / 10 : 0,
        };
    } catch (err) {
        return { error: err.response?.data?.message || err.message };
    }
}

// ============================================================
// 3. Audit pipeline (today)
// ============================================================
async function getAuditsToday(db, startTs) {
    try {
        const snap = await db.collection("audit_requests")
            .where("createdAt", ">=", startTs)
            .get();
        const byStatus = {};
        const bySource = {};
        snap.forEach((doc) => {
            const d = doc.data();
            byStatus[d.status || "unknown"] = (byStatus[d.status || "unknown"] || 0) + 1;
            bySource[d.source || "unknown"] = (bySource[d.source || "unknown"] || 0) + 1;
        });
        return { total: snap.size, byStatus, bySource };
    } catch (err) {
        return { error: err.message };
    }
}

// ============================================================
// 4. FB Ads spend (today) — graceful skip
// ============================================================
async function getFbAdsToday() {
    const token = process.env.FB_ADS_ACCESS_TOKEN;
    const accountId = process.env.FB_ADS_ACCOUNT_ID;
    if (!token || !accountId) return { error: "FB_ADS credentials not set" };
    try {
        const r = await axios.get(
            `https://graph.facebook.com/v22.0/${accountId}/insights`,
            {
                params: {
                    access_token: token,
                    date_preset: "today",
                    fields: "spend,impressions,clicks,cpc,ctr,actions",
                    level: "account",
                },
                timeout: 15000,
            }
        );
        const d = (r.data?.data || [])[0] || {};
        return {
            spend: parseFloat(d.spend || 0),
            impressions: parseInt(d.impressions || 0, 10),
            clicks: parseInt(d.clicks || 0, 10),
            cpc: parseFloat(d.cpc || 0),
            ctr: parseFloat(d.ctr || 0),
            leads: ((d.actions || []).find((a) => a.action_type === "lead")?.value) || 0,
        };
    } catch (err) {
        return { error: err.response?.data?.error?.message || err.message };
    }
}

// ============================================================
// 5. ElevenLabs credit balance
// ============================================================
async function getElevenLabsBalance() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { error: "ELEVENLABS_API_KEY not set" };
    try {
        const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
            headers: { "xi-api-key": key },
            timeout: 10000,
        });
        const d = r.data || {};
        const used = d.character_count || 0;
        const limit = d.character_limit || 0;
        const remaining = Math.max(0, limit - used);
        const pct = limit ? Math.round((100 * remaining) / limit) : 0;
        return { used, limit, remaining, pct, tier: d.tier || "?" };
    } catch (err) {
        return { error: err.response?.data?.detail?.message || err.message };
    }
}

// ============================================================
// 6. Cost-of-day proxy (approximate — plug real invoices monthly)
// ============================================================
function estimateDailyCost({ instantly, fbAds, coldCall, audits, eleven }) {
    // Fixed-ish subscription amortized daily (MXN). Update values when billing changes.
    const fixed = {
        instantly: 97 / 30,        // $97/mo ÷ 30 ≈ $3.23/day
        brevo: 25 / 30,            // Brevo Lite
        firebase: 15 / 30,         // Firebase blaze tier base
        firecrawl: 19 / 30,
        dataforseo: 50 / 30,
        serpapi: 50 / 30,
        hunter: 34 / 30,
        perplexity: 20 / 30,
        openai: 10 / 30,
        anthropic: 15 / 30,
    };
    const fixedTotal = Object.values(fixed).reduce((a, b) => a + b, 0);

    // Variable-ish
    const fbSpend = fbAds?.spend || 0;
    const callCount = coldCall?.fired || 0;
    const elevenCallCost = callCount * 0.15; // rough — $0.15/call on conv-AI
    const twilioCost = callCount * 0.05;
    const brevoEmails = (audits?.total || 0) * 0.0008; // transactional

    const variableTotal = fbSpend + elevenCallCost + twilioCost + brevoEmails;
    return {
        fixed_daily_usd: Math.round(fixedTotal * 100) / 100,
        variable_daily_usd: Math.round(variableTotal * 100) / 100,
        total_daily_usd: Math.round((fixedTotal + variableTotal) * 100) / 100,
        breakdown: {
            fb_ads: fbSpend,
            elevenlabs_calls: elevenCallCost,
            twilio_calls: twilioCost,
            brevo_transactional: brevoEmails,
        },
    };
}

// ============================================================
// MAIN
// ============================================================
exports.dailyRollupSlack = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .pubsub.schedule("0 18 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const { dateKey, start } = cdmxTodayRange();

        const [coldCall, instantly, audits, fbAds, eleven] = await Promise.all([
            getColdCallToday(db, dateKey),
            getInstantlyStats(),
            getAuditsToday(db, start),
            getFbAdsToday(),
            getElevenLabsBalance(),
        ]);

        const cost = estimateDailyCost({ instantly, fbAds, coldCall, audits, eleven });

        const fmt = (v, suffix = "") => (v === undefined || v === null ? "—" : `${v}${suffix}`);
        const err = (o) => (o && o.error ? ` _(${o.error})_` : "");

        const lines = [
            `*📊 JegoDigital · Close-of-Business · ${dateKey}*`,
            ``,
            `*📞 Cold calls*${err(coldCall)}`,
            `• Queued: ${fmt(coldCall.queued)} · Fired: ${fmt(coldCall.fired)} · Failed: ${fmt(coldCall.failed)}`,
            `• Outcomes — positive: ${fmt(coldCall.positive)} · negative: ${fmt(coldCall.negative)} · neutral: ${fmt(coldCall.neutral)} · pending: ${fmt(coldCall.pending)}`,
            `• Offer mix — A: ${fmt(coldCall.offer_counts?.A)} · B: ${fmt(coldCall.offer_counts?.B)} · C: ${fmt(coldCall.offer_counts?.C)}`,
            `• Audits auto-queued from positives: ${fmt(coldCall.audits_queued)}`,
            ``,
            `*📧 Cold email (last 24h)*${err(instantly)}`,
            `• Sent: ${fmt(instantly.sent)} · Opens: ${fmt(instantly.opens)} (${fmt(instantly.openRate, "%")}) · Replies: ${fmt(instantly.replies)} (${fmt(instantly.replyRate, "%")})`,
            `• Bounces: ${fmt(instantly.bounces)} (${fmt(instantly.bounceRate, "%")})`,
            ``,
            `*🔍 Audit pipeline (today)*${err(audits)}`,
            `• Requests: ${fmt(audits.total)} — by source: ${JSON.stringify(audits.bySource || {})}`,
            `• By status: ${JSON.stringify(audits.byStatus || {})}`,
            ``,
            `*💰 Meta Ads (today)*${err(fbAds)}`,
            `• Spend: $${fmt(fbAds.spend)} · Impr: ${fmt(fbAds.impressions)} · Clicks: ${fmt(fbAds.clicks)} · Leads: ${fmt(fbAds.leads)}`,
            `• CPC: $${fmt(fbAds.cpc)} · CTR: ${fmt(fbAds.ctr, "%")}`,
            ``,
            `*🔊 ElevenLabs credit*${err(eleven)}`,
            `• Remaining: ${fmt(eleven.remaining)} / ${fmt(eleven.limit)} chars (${fmt(eleven.pct, "%")}) · Tier: ${fmt(eleven.tier)}`,
            ``,
            `*💵 Cost of day (approx USD)*`,
            `• Fixed (amortized): $${cost.fixed_daily_usd} · Variable: $${cost.variable_daily_usd}`,
            `• *Total today: $${cost.total_daily_usd}*`,
            `• Variable breakdown: FB $${cost.breakdown.fb_ads} · EL calls $${Math.round(cost.breakdown.elevenlabs_calls * 100) / 100} · Twilio $${Math.round(cost.breakdown.twilio_calls * 100) / 100}`,
        ];
        const text = lines.join("\n");

        await sendSlack(text);

        // Always snapshot so autopilotReviewer has a 7d view
        try {
            await db.collection("daily_rollups").doc(dateKey).set({
                dateKey,
                generated_at: admin.firestore.FieldValue.serverTimestamp(),
                cold_call: coldCall,
                instantly,
                audits,
                fb_ads: fbAds,
                elevenlabs: eleven,
                cost,
            }, { merge: true });
        } catch (err) {
            functions.logger.warn("dailyRollupSlack: snapshot failed:", err.message);
        }

        return null;
    });
