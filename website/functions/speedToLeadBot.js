/**
 * speedToLeadBot — Wave 4 #1 — sub-60-second alert on every new lead.
 *
 * Trigger:
 *   1. Firestore onCreate: leads/{leadId}                 (universal lead doc)
 *   2. Firestore onCreate: calendly_events/{eventId}      (booking)
 *   3. Firestore onCreate: meta_lead_form_leads/{leadId}  (FB Lead Form)
 *   4. Firestore onCreate: instantly_positive_replies/{}  (warm reply)
 *   5. Firestore onCreate: ig_dm_leads/{leadId}           (IG DM)
 *
 * Each trigger fires the SAME handleLead() pipeline:
 *   a) Pace gate — 1 alert per leadId per UTC day (Firestore lock)
 *   b) Feature flag check — config/feature_flags/speed_to_lead.enabled
 *      DEFAULT OFF (Alex 👍 required). When OFF, only Telegram alert
 *      to Alex; no WA template send to the prospect.
 *   c) Telegram alert with full context (name, source, signal, audit URL)
 *   d) IF enabled AND prospect WA known: send ManyChat template
 *   e) Slack #leads-hot blast for visibility
 *   f) Snapshot: speed_to_lead_log/{leadId}
 *
 * Why this matters: Harvard 2007 + InsideSales 2024 — 5-min response
 * on a fresh lead = 21x conversion vs 30-min response. JegoDigital's
 * funnel currently has gaps where Sofia/cold-email replies wait hours
 * before Alex sees them.
 *
 * Pace gate: 1 alert per (leadId, UTC date). Idempotent.
 *
 * HR-13: never asks Alex to do work — just signals + (when ON) acts.
 * HR-19: WA template (when activated) MUST include the JegoDigital +
 *        real estate niche intro per Rule 4.
 *
 * Activation: flip config/feature_flags doc { speed_to_lead_enabled: true }
 * after Alex 👍 — see /SCHEDULES.md row 76.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
const ALEX_WA = "529982023263";

async function isEnabled() {
    try {
        const db = admin.firestore();
        const d = await db.doc("config/feature_flags").get();
        return !!(d.exists && d.data()?.speed_to_lead_enabled === true);
    } catch (e) { return false; }
}

async function paceGate(leadId) {
    const db = admin.firestore();
    const today = new Date().toISOString().slice(0, 10);
    const ref = db.doc(`speed_to_lead_pace/${leadId}_${today}`);
    return await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (cur.exists) return false;
        tx.set(ref, { lead_id: leadId, day: today, created_at: admin.firestore.FieldValue.serverTimestamp() });
        return true;
    });
}

async function notifyTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        return r.data?.result?.message_id || null;
    } catch (e) {
        functions.logger.error("speedToLeadBot telegram failed:", e.message);
        return null;
    }
}

async function notifySlackHot(text) {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost("leads-hot", { text });
        return r.ok ? r.ts : null;
    } catch (e) {
        functions.logger.error("speedToLeadBot slack failed:", e.message);
        return null;
    }
}

async function sendWaTemplate(payload) {
    // ManyChat template trigger via custom-field set
    const tok = process.env.MANYCHAT_API_TOKEN;
    if (!tok || !payload.subscriber_id) return { ok: false, reason: "no_subscriber_or_token" };
    try {
        const r = await axios.post(
            "https://api.manychat.com/fb/sending/sendFlow",
            { subscriber_id: payload.subscriber_id, flow_ns: process.env.MANYCHAT_SPEED_TO_LEAD_FLOW || "content20260505_speed_to_lead" },
            { headers: { Authorization: `Bearer ${tok}` }, timeout: 10000 }
        );
        return { ok: true, status: r.data?.status };
    } catch (e) {
        return { ok: false, reason: e.response?.status || e.message };
    }
}

async function handleLead({ leadId, source, lead }) {
    if (!leadId) return { ok: false, reason: "no_lead_id" };

    const passed = await paceGate(leadId);
    if (!passed) return { ok: true, deduped: true };

    const enabled = await isEnabled();
    const name = lead?.first_name || lead?.firstName || lead?.name || "Lead";
    const company = lead?.company_name || lead?.company || "";
    const signal = lead?.personalization || lead?.signal || lead?.message_preview || "";
    const auditUrl = lead?.audit_url || (lead?.website ?
        `https://jegodigital.com/auditoria-gratis?url=${encodeURIComponent(lead.website)}&firstName=${encodeURIComponent(name)}&email=${encodeURIComponent(lead.email || "")}` :
        null);

    const lines = [
        `🔥 *Speed-to-Lead — ${source}*`,
        `*${name}*${company ? ` · ${company}` : ""}`,
        signal ? `> ${signal.slice(0, 200)}` : null,
        lead?.email ? `📧 ${lead.email}` : null,
        lead?.phone ? `📞 ${lead.phone}` : null,
        auditUrl ? `🎯 Audit: ${auditUrl}` : null,
        `_${enabled ? "AUTOPILOT ON" : "alert-only — feature flag OFF"}_`,
    ].filter(Boolean);
    const text = lines.join("\n");

    const tgId = await notifyTelegram(text);
    const slackTs = await notifySlackHot(text);

    let waResult = { ok: false, reason: "feature_flag_off" };
    if (enabled) waResult = await sendWaTemplate({ subscriber_id: lead?.manychat_id });

    const db = admin.firestore();
    await db.collection("speed_to_lead_log").doc(leadId).set({
        lead_id: leadId, source, name, company, signal: (signal || "").slice(0, 500),
        enabled, telegram_message_id: tgId, slack_ts: slackTs,
        wa_result: waResult, created_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, telegram: !!tgId, slack: !!slackTs, wa: waResult };
}

exports.speedToLeadBotOnLead = functions.firestore
    .document("leads/{leadId}")
    .onCreate(async (snap, ctx) => {
        const lead = snap.data();
        return handleLead({ leadId: ctx.params.leadId, source: "leads", lead });
    });

exports.speedToLeadBotOnCalendly = functions.firestore
    .document("calendly_events/{eventId}")
    .onCreate(async (snap, ctx) => {
        const ev = snap.data();
        const invitee = ev?.invitee || {};
        return handleLead({
            leadId: ctx.params.eventId,
            source: "calendly",
            lead: {
                first_name: invitee.first_name || invitee.name?.split(" ")[0],
                email: invitee.email,
                phone: invitee.phone,
                company: invitee.questions_and_answers?.[0]?.answer,
                signal: `Calendly booking — ${ev?.event_type_name || "30min"}`,
            },
        });
    });

exports.speedToLeadBotOnFbLead = functions.firestore
    .document("meta_lead_form_leads/{leadId}")
    .onCreate(async (snap, ctx) => {
        const lead = snap.data() || {};
        return handleLead({
            leadId: ctx.params.leadId,
            source: "fb_lead_form",
            lead: {
                first_name: lead.full_name?.split(" ")[0] || lead.first_name,
                email: lead.email,
                phone: lead.phone_number,
                company: lead.company_name,
                signal: `FB Lead Form: ${lead.form_id || "unknown form"}`,
            },
        });
    });

exports.speedToLeadBotOnPositiveReply = functions.firestore
    .document("instantly_positive_replies/{replyId}")
    .onCreate(async (snap, ctx) => {
        const r = snap.data() || {};
        return handleLead({
            leadId: ctx.params.replyId,
            source: "instantly_positive",
            lead: {
                first_name: r.first_name,
                email: r.email,
                website: r.website,
                signal: r.preview || r.body?.slice(0, 200),
            },
        });
    });

exports.speedToLeadBotOnIgDm = functions.firestore
    .document("ig_dm_leads/{leadId}")
    .onCreate(async (snap, ctx) => {
        const lead = snap.data() || {};
        return handleLead({ leadId: ctx.params.leadId, source: "ig_dm", lead });
    });

exports.speedToLeadBotStatus = functions.https.onRequest(async (req, res) => {
    try {
        const enabled = await isEnabled();
        const db = admin.firestore();
        const recent = await db.collection("speed_to_lead_log")
            .orderBy("created_at", "desc").limit(10).get();
        res.status(200).json({
            ok: true, enabled, alex_wa: ALEX_WA,
            recent: recent.docs.map(d => ({ id: d.id, ...d.data() })),
        });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
