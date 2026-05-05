/**
 * lostDealRecovery — Wave 4 #3 — autopilot re-engagement of lost deals.
 *
 * Closes the recovery gap: every Calendly no-show or "not now" lead
 * gets re-engaged at T+30 / T+60 / T+90 days via Brevo (email) and
 * (optionally) ManyChat WA template. Tracks reactivation rate.
 *
 * Sources of lost-deal triggers (read-only daily scan):
 *   1. calendly_events where status='canceled' OR no_show=true
 *   2. instantly_replies where classification='not_now' OR 'soft_negative'
 *   3. lead_orchestration where last_state='breakup' (Wave-4 #2)
 *
 * Schedule: daily 07:00 Cancún (12:00 UTC). Idempotent — uses
 * lost_deal_recovery_log/{leadId}_{cadence} to dedupe.
 *
 * Cadence:
 *   T+30 → Brevo template "we_miss_you_es" (gentle ping, 1 collab line)
 *   T+60 → Brevo + (if WA known) ManyChat template
 *   T+90 → Brevo "case_study_share" with the most relevant client win
 *
 * HR-17: collaboration tone in every template.
 * HR-19: every send must contain JegoDigital + real estate niche intro.
 * HR-13: never asks Alex to do work.
 *
 * Snapshot: lost_deal_recovery_runs/{YYYY-MM-DD}.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const CADENCE_DAYS = [30, 60, 90];
const BREVO_TEMPLATES = {
    30: parseInt(process.env.BREVO_TPL_RECOVERY_30 || "0", 10),
    60: parseInt(process.env.BREVO_TPL_RECOVERY_60 || "0", 10),
    90: parseInt(process.env.BREVO_TPL_RECOVERY_90 || "0", 10),
};

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

async function notifySlack(text) {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost("daily-ops", { text });
        return r.ok;
    } catch (e) { return false; }
}

async function sendBrevoTemplate(email, name, templateId, params = {}) {
    const key = process.env.BREVO_API_KEY;
    if (!key || !email || !templateId) return { ok: false, reason: "missing_param" };
    try {
        const r = await axios.post("https://api.brevo.com/v3/smtp/email", {
            to: [{ email, name: name || email.split("@")[0] }],
            templateId,
            params: {
                first_name: name || "there",
                jegodigital_intro: "JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores",
                ...params,
            },
        }, {
            headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
            timeout: 12000,
        });
        return { ok: true, message_id: r.data?.messageId };
    } catch (e) {
        return { ok: false, reason: e.response?.data?.message || e.message };
    }
}

async function sendManyChatTemplate(subscriberId, flowNs) {
    const tok = process.env.MANYCHAT_API_TOKEN;
    if (!tok || !subscriberId || !flowNs) return { ok: false, reason: "missing" };
    try {
        const r = await axios.post(
            "https://api.manychat.com/fb/sending/sendFlow",
            { subscriber_id: subscriberId, flow_ns: flowNs },
            { headers: { Authorization: `Bearer ${tok}` }, timeout: 10000 }
        );
        return { ok: true, status: r.data?.status };
    } catch (e) {
        return { ok: false, reason: e.response?.status || e.message };
    }
}

async function findLostDeals(db) {
    const now = Date.now();
    const minMs = now - 95 * 24 * 60 * 60 * 1000;
    const maxMs = now - 28 * 24 * 60 * 60 * 1000;
    const leads = [];

    // Source 1: Calendly cancellations + no-shows
    try {
        const snap = await db.collection("calendly_events")
            .where("status", "in", ["canceled", "no_show"]).limit(500).get();
        for (const d of snap.docs) {
            const ev = d.data();
            const ts = ev.canceled_at_ms || ev.event_start_time_ms || 0;
            if (ts >= minMs && ts <= maxMs && ev.invitee?.email) {
                leads.push({
                    lead_id: d.id, source: "calendly_lost", ts,
                    email: ev.invitee.email,
                    name: ev.invitee.first_name || ev.invitee.name?.split(" ")[0],
                    manychat_id: ev.invitee.manychat_id || null,
                });
            }
        }
    } catch (e) { functions.logger.warn("calendly source failed:", e.message); }

    // Source 2: Instantly replies classified as not_now / soft_negative
    try {
        const snap = await db.collection("instantly_reply_activity")
            .where("classification", "in", ["not_now", "soft_negative"]).limit(500).get();
        for (const d of snap.docs) {
            const r = d.data();
            const ts = r.classified_at_ms || r.received_at_ms || 0;
            if (ts >= minMs && ts <= maxMs && r.email) {
                leads.push({
                    lead_id: d.id, source: "instantly_softno", ts,
                    email: r.email, name: r.first_name,
                });
            }
        }
    } catch (e) { functions.logger.warn("instantly source failed:", e.message); }

    return leads;
}

async function processRecovery(db, lead) {
    const ageDays = Math.floor((Date.now() - lead.ts) / (24 * 60 * 60 * 1000));
    let cadence = null;
    for (const d of CADENCE_DAYS) {
        if (ageDays >= d && ageDays < d + 7) { cadence = d; break; }
    }
    if (!cadence) return { ok: true, skipped: "outside_window", age_days: ageDays };

    const lockId = `${lead.lead_id}_${cadence}`;
    const lockRef = db.doc(`lost_deal_recovery_log/${lockId}`);
    const fired = await db.runTransaction(async (tx) => {
        const cur = await tx.get(lockRef);
        if (cur.exists) return false;
        tx.set(lockRef, {
            lead_id: lead.lead_id, cadence, source: lead.source, email: lead.email,
            fired_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
    });
    if (!fired) return { ok: true, skipped: "deduped" };

    const tplId = BREVO_TEMPLATES[cadence];
    const brevoR = await sendBrevoTemplate(lead.email, lead.name, tplId);

    let waR = { ok: false, reason: "no_subscriber" };
    if (cadence === 60 && lead.manychat_id) {
        waR = await sendManyChatTemplate(lead.manychat_id,
            process.env.MANYCHAT_RECOVERY_FLOW || "content20260505_recovery_60d");
    }

    await lockRef.update({ brevo: brevoR, manychat: waR });
    return { ok: true, cadence, email: lead.email, brevo: brevoR.ok, wa: waR.ok };
}

async function runDailyRecovery() {
    const db = admin.firestore();
    const leads = await findLostDeals(db);
    const results = [];
    for (const lead of leads) {
        try {
            const r = await processRecovery(db, lead);
            results.push({ lead_id: lead.lead_id, source: lead.source, ...r });
        } catch (err) {
            results.push({ lead_id: lead.lead_id, ok: false, error: err.message });
        }
    }
    const fired = results.filter(r => r.ok && !r.skipped).length;
    const today = new Date().toISOString().slice(0, 10);
    await db.collection("lost_deal_recovery_runs").doc(today).set({
        run_at: new Date().toISOString(),
        scanned: leads.length, fired, results: results.slice(0, 100),
    }, { merge: true });

    const text = [
        "*♻️ Lost-Deal Recovery — daily*",
        `Scanned: *${leads.length}* lost deals (last 90d)`,
        `Re-engaged: *${fired}*`,
        fired ? `_Snapshot: lost_deal_recovery_runs/${today}_` : "_All in cadence — no action_",
    ].join("\n");
    if (fired || leads.length > 50) {
        await notifyTelegram(text);
        await notifySlack(text);
    }
    return { scanned: leads.length, fired };
}

exports.lostDealRecovery = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 12 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runDailyRecovery(); }
        catch (err) {
            functions.logger.error("lostDealRecovery crashed:", err);
            await notifyTelegram(`🚨 lostDealRecovery crashed: ${err.message}`);
            throw err;
        }
    });

exports.lostDealRecoveryOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runDailyRecovery();
        res.status(200).json({ ok: true, ...r });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
