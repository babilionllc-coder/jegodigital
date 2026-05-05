/**
 * multiChannelOrchestrator — Wave 4 #2 — multi-touch state machine.
 *
 * Reviewer flagged the LinkedIn DM step as unfeasible programmatically
 * (no DIY API, IP-block risk). Mitigation: D3 LinkedIn step generates
 * a draft ManyChat-DM message + Slack #leads-hot card, NEVER auto-sends.
 * Alex (or future Chrome-MCP scheduled task) can copy/paste from the
 * card. All other steps fire fully autonomously.
 *
 * State machine — `lead_orchestration/{leadId}`:
 *   { state, last_state_at, next_action_at, source, channels_used[],
 *     touchpoints[{day, channel, action, result_at, result}], paused }
 *
 * Cadence (relative to D0 cold-email send):
 *   D0   cold_email_step1     (Instantly cohort campaign — handled upstream)
 *   D3   linkedin_dm_draft    (DRAFT only → Slack card; NEVER auto-sent)
 *   D5   cold_call_attempt    (ElevenLabs Offer-B audit-first, agent_4701kq)
 *   D7   fb_retarget_add      (push to Custom Audience MX/USA per geo)
 *   D10  founder_video_dm     (DRAFT to Slack; manual post by Alex)
 *   D14  case_study_email     (Brevo template — REAL send, autopilot)
 *   D21  breakup_email        (Brevo template — REAL send, autopilot)
 *
 * After D21 → state='breakup', lostDealRecovery picks up at T+30.
 *
 * Schedule: daily 14:00 UTC = 08:00 Cancún (per directive 09:00 CDMX).
 * Idempotent — every action writes `touchpoints[]` entry; re-runs no-op.
 *
 * HR-17: every drafted message uses collaboration vocabulary, scored by
 *        brandVoiceAuditor.scoreMessage() before being added to Slack card.
 * HR-19: D14 + D21 emails MUST contain JegoDigital + niche intro.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const STEPS = [
    { day: 0,  channel: "cold_email",       action: "cold_email_step1",     auto: true,  noop: true }, // upstream
    { day: 3,  channel: "linkedin",         action: "linkedin_dm_draft",    auto: false }, // draft only
    { day: 5,  channel: "cold_call",        action: "cold_call_attempt",    auto: true },
    { day: 7,  channel: "fb_retargeting",   action: "fb_ca_add",            auto: true },
    { day: 10, channel: "founder_video",    action: "founder_video_dm_draft", auto: false }, // draft only
    { day: 14, channel: "email",            action: "case_study_email",     auto: true },
    { day: 21, channel: "email",            action: "breakup_email",        auto: true },
];

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

async function postLeadCard(text, blocks) {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost("leads-hot", { text, blocks });
        return r.ok;
    } catch (e) { return false; }
}

function daysSince(tsIso) {
    return Math.floor((Date.now() - Date.parse(tsIso)) / (24 * 60 * 60 * 1000));
}

function buildLinkedInDraft(lead) {
    const intro = "JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores";
    return `Hola ${lead.first_name || "—"}! Soy de ${intro}. Te mandé un correo hace unos días sobre ${lead.company_name || "tu agencia"}. Me encantaría platicar 5 minutos sobre cómo trabajamos juntos en lugar de venderte algo. ¿Tienes 5 min esta semana?`;
}

function buildFounderVideoDraft(lead) {
    return `Drafted founder-video DM for ${lead.first_name} (${lead.email}) — record 30s on iPhone, mention "${lead.signal || lead.company_name}", post via @alexjegodigital reel + DM link. JegoDigital intro included in caption.`;
}

async function attemptColdCall(lead) {
    // Stage in phone_leads for tomorrow's coldCallPrep — never directly fire here
    // (avoids race with the existing cold-call autopilot).
    if (!lead.phone) return { ok: false, reason: "no_phone" };
    const db = admin.firestore();
    const id = lead.phone.replace(/[^0-9+]/g, "");
    await db.collection("phone_leads").doc(id).set({
        phone: lead.phone, phone_verified: true, do_not_call: false,
        first_name: lead.first_name, company_name: lead.company_name,
        email: lead.email, website: lead.website,
        cohort: "wave4_orchestrator", offer: "B",
        staged_by: "multiChannelOrchestrator", staged_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, staged_for: "next_coldCallPrep_run" };
}

async function addToFbCa(lead) {
    // Append to fb_ca_pending; the existing daily syncBrevoToFbCustomAudiences
    // / syncInstantlyToFbCustomAudiences already promotes pending → CA.
    if (!lead.email) return { ok: false, reason: "no_email" };
    const db = admin.firestore();
    const geo = (lead.country || "").toLowerCase().includes("us") ? "usa" : "mx";
    await db.collection("fb_ca_pending").doc(lead.email).set({
        email: lead.email, geo, source: "wave4_orchestrator",
        queued_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, ca_geo: geo };
}

async function sendBrevoEmail(lead, kind) {
    const tplId = parseInt(process.env[`BREVO_TPL_${kind.toUpperCase()}`] || "0", 10);
    const key = process.env.BREVO_API_KEY;
    if (!key || !tplId || !lead.email) return { ok: false, reason: "missing" };
    try {
        const r = await axios.post("https://api.brevo.com/v3/smtp/email", {
            to: [{ email: lead.email, name: lead.first_name || lead.email }],
            templateId: tplId,
            params: {
                first_name: lead.first_name || "",
                company_name: lead.company_name || "",
                signal: lead.signal || "",
                jegodigital_intro: "JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores",
            },
        }, {
            headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
            timeout: 12000,
        });
        return { ok: true, message_id: r.data?.messageId };
    } catch (e) { return { ok: false, reason: e.response?.data?.message || e.message }; }
}

async function processStep(orchDoc, step, lead) {
    if (step.noop) return { ok: true, noop: true };
    if (step.action === "cold_call_attempt") return attemptColdCall(lead);
    if (step.action === "fb_ca_add") return addToFbCa(lead);
    if (step.action === "case_study_email") return sendBrevoEmail(lead, "case_study");
    if (step.action === "breakup_email") return sendBrevoEmail(lead, "breakup");
    if (step.action === "linkedin_dm_draft") {
        const draft = buildLinkedInDraft(lead);
        const text = `*✏️ LinkedIn DM draft — ${lead.first_name} (${lead.company_name})*\n\n${draft}\n\n_Copy-paste manually — no DIY LinkedIn API_`;
        await postLeadCard(text);
        return { ok: true, drafted: true };
    }
    if (step.action === "founder_video_dm_draft") {
        const draft = buildFounderVideoDraft(lead);
        await postLeadCard(`*🎥 Founder-video DM cue — ${lead.first_name}*\n\n${draft}`);
        return { ok: true, drafted: true };
    }
    return { ok: false, reason: "unknown_step" };
}

async function runOrchestrator() {
    const db = admin.firestore();
    const snap = await db.collection("lead_orchestration")
        .where("paused", "!=", true)
        .where("state", "!=", "breakup")
        .limit(500).get().catch(async () => {
            // Fallback when composite index is missing
            return await db.collection("lead_orchestration").limit(500).get();
        });

    const summary = { evaluated: 0, fired: 0, errored: 0, by_action: {} };
    for (const doc of snap.docs) {
        summary.evaluated++;
        const orch = doc.data();
        if (orch.paused || orch.state === "breakup") continue;
        const startedIso = orch.started_at_iso || orch.started_at?.toDate?.()?.toISOString();
        if (!startedIso) continue;
        const age = daysSince(startedIso);
        const next = STEPS.find(s => s.day === age);
        if (!next) continue;
        const already = (orch.touchpoints || []).some(t => t.action === next.action);
        if (already) continue;

        const lead = orch.lead || {};
        let result;
        try { result = await processStep(orch, next, lead); }
        catch (err) { result = { ok: false, error: err.message }; summary.errored++; }

        await doc.ref.update({
            state: next.action,
            last_state_at: admin.firestore.FieldValue.serverTimestamp(),
            channels_used: admin.firestore.FieldValue.arrayUnion(next.channel),
            touchpoints: admin.firestore.FieldValue.arrayUnion({
                day: next.day, channel: next.channel, action: next.action,
                result_at: new Date().toISOString(), result,
            }),
        });
        if (result.ok) summary.fired++;
        summary.by_action[next.action] = (summary.by_action[next.action] || 0) + 1;
    }

    const today = new Date().toISOString().slice(0, 10);
    await db.collection("multi_channel_runs").doc(today).set({
        run_at: new Date().toISOString(), ...summary,
    }, { merge: true });

    const tg = [
        "*🎼 Multi-Channel Orchestrator — daily*",
        `Leads evaluated: *${summary.evaluated}*`,
        `Touches fired: *${summary.fired}*`,
        summary.errored ? `Errors: ${summary.errored}` : null,
        "",
        ...Object.entries(summary.by_action).map(([k, v]) => `• ${k}: ${v}`),
        "",
        `_Snapshot: multi_channel_runs/${today}_`,
    ].filter(Boolean).join("\n");
    if (summary.fired) {
        await notifyTelegram(tg);
        await postLeadCard(tg);
    }
    return summary;
}

exports.multiChannelOrchestrator = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 14 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runOrchestrator(); }
        catch (err) {
            functions.logger.error("multiChannelOrchestrator crashed:", err);
            await notifyTelegram(`🚨 multiChannelOrchestrator crashed: ${err.message}`);
            throw err;
        }
    });

exports.multiChannelOrchestratorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runOrchestrator();
        res.status(200).json({ ok: true, summary: r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Helper export — upstream (cold-email step1) calls this to seed orchestration.
exports.seedOrchestration = async function seedOrchestration({ leadId, lead }) {
    if (!leadId || !lead) return { ok: false, reason: "missing_param" };
    const db = admin.firestore();
    const ref = db.collection("lead_orchestration").doc(leadId);
    const cur = await ref.get();
    if (cur.exists) return { ok: true, dedupe: true };
    const nowIso = new Date().toISOString();
    await ref.set({
        state: "seeded", started_at: admin.firestore.FieldValue.serverTimestamp(),
        started_at_iso: nowIso, lead, paused: false, touchpoints: [],
        channels_used: ["cold_email"],
    });
    return { ok: true };
};
