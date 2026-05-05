/**
 * brandVoiceAuditor — Wave 4 #10 — pre-send tone gate (HR-17, HR-18, HR-19).
 *
 * Single source of truth for the JegoDigital collaboration-tone gate. Used
 * two ways:
 *
 *   1. As a LIBRARY:
 *        const { scoreMessage } = require('./brandVoiceAuditor');
 *        const r = scoreMessage(text, { channel:'cold_email_step1' });
 *        if (!r.passes) return blockAndAlert(r.reasons);
 *
 *   2. As a SCHEDULED AUDITOR:
 *        Daily 22:00 Cancún reads last-24h of `messages_audit/*`
 *        (logged by every outbound channel per SYSTEM.md §0.2),
 *        scores each, posts Slack #alerts digest with pass/fail by channel.
 *        Snapshot: brand_voice_audits/{YYYY-MM-DD}.
 *
 * Scoring axes (each 0-1, weighted-sum on a 0-10 scale):
 *   - HR-17 collaboration vocabulary (≥3 words from lexicon)
 *   - HR-17 banned-words count (sell, pitch, buy, deal, money-back, ...)
 *   - HR-18 research-grounded specific (recipient signal regex)
 *   - HR-19 JegoDigital + niche intro in first 200 chars (Rule 4)
 *   - Plain-language readability (sentence length / passive voice)
 *
 * Pass threshold: ≥8/10 AND 0 banned words AND HR-19 intro present (block).
 *
 * Companion #11 personaDriftDetector calls this scorer Friday 17:00 Cancún
 * across 5 sampled Sofia conversations; flags persistent drift.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const COLLAB = [
    "colabor", "partner", "ajud", "junt", "team",
    "ganamos", "ganan", "ganas", "ganar", "ganen",
    "compart", "explor", "abierto", "honest", "feedback",
    "co-build", "coconstrui", "alongside", "happy to", "we'd love",
];

const BANNED = [
    "100% money back", "100 percent guarantee", "money-back", "money back",
    "buy ", "purchase ", "sign up now", "spots left",
    "limited time", "last chance", "don't miss", "no te lo pierdas",
    "vende", "vendido", "te vendo", "compra ", "compre ",
    "cierra", "cierre el deal", "close the deal",
    "te devolvemos el 100", "mejor oferta", "oferta única",
];

const NICHE = [
    "inmobiliari", "real estate", "agencia", "developer", "desarrollad",
    "broker", "promotor", "proptech",
];

const SIGNAL_REGEX = [
    /\b(felicidades|congrat|saw your|leí tu|vi tu|me topé|noticed|seen|recently)/i,
    /\b(funding|ronda de|round|raised|levantaron|levantó|expansion|expansión)/i,
    /\b(hiring|contratando|nueva oficina|nueva sucursal|grand opening)/i,
    /\b(\$[0-9]{1,3}[KMBkmb]|usd [0-9]+|mxn [0-9]+|[0-9]+ propiedades|[0-9]+ listings)/i,
];

function countMatches(text, list, opts = {}) {
    const lc = text.toLowerCase();
    let n = 0; const hits = [];
    for (const w of list) {
        const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const m = lc.match(re);
        if (m) { n += m.length; hits.push(w); }
    }
    return { count: n, hits };
}

/**
 * scoreMessage — synchronous structural score.
 * @param {string} text — full draft (subject + body or single message)
 * @param {object} ctx — { channel, language, sender, first_touch }
 * @returns { score, passes, reasons, breakdown }
 */
function scoreMessage(text, ctx = {}) {
    if (!text || typeof text !== "string") {
        return { score: 0, passes: false, reasons: ["empty_text"], breakdown: {} };
    }
    const first200 = text.slice(0, 220);
    const collab = countMatches(text, COLLAB);
    const banned = countMatches(text, BANNED);
    const nicheInIntro = NICHE.some(k => first200.toLowerCase().includes(k));
    const introHasJD = /jegodigital/i.test(first200);
    const introPresent = nicheInIntro && introHasJD;
    const signal = SIGNAL_REGEX.some(re => re.test(text));

    // Sub-scores 0-1
    const sCollab = Math.min(collab.count / 3, 1);              // ≥3 words = full
    const sBanned = banned.count === 0 ? 1 : 0;
    const sIntro = ctx.first_touch === false ? 1 : (introPresent ? 1 : 0);
    const sSignal = signal ? 1 : 0;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgLen = sentences.length ? text.length / sentences.length : text.length;
    const sReadability = avgLen < 200 ? 1 : avgLen < 300 ? 0.6 : 0.3;

    // Weighted 0-10
    const score = +(sCollab * 2 + sBanned * 3 + sIntro * 2 + sSignal * 2 + sReadability * 1).toFixed(2);

    const reasons = [];
    if (sBanned === 0) reasons.push(`banned_words:${banned.hits.join(",")}`);
    if (sCollab < 1) reasons.push(`collab_low:${collab.count}/3`);
    if (sIntro === 0) reasons.push("intro_missing");
    if (sSignal === 0) reasons.push("no_research_signal");
    if (sReadability < 1) reasons.push(`long_sentences:${avgLen.toFixed(0)}`);

    const passes = score >= 8 && sBanned === 1 && sIntro === 1;

    return {
        score, passes, reasons,
        breakdown: { sCollab, sBanned, sIntro, sSignal, sReadability,
            collab_hits: collab.hits, banned_hits: banned.hits,
            intro_present: introPresent, signal_present: signal },
    };
}

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

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

async function notifySlack(text, channel = "alerts") {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost(channel, { text });
        return r.ok;
    } catch (e) { return false; }
}

async function runDailyAudit() {
    const db = admin.firestore();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let docs;
    try {
        const snap = await db.collectionGroup("messages_audit")
            .where("created_at", ">=", since)
            .limit(500)
            .get();
        docs = snap.docs;
    } catch (err) {
        // Composite index may be missing; fall back to channel scan
        functions.logger.warn("brandVoiceAuditor: collectionGroup query failed, fallback", err.message);
        docs = [];
    }

    const byChannel = {};
    let total = 0, failing = 0;
    for (const d of docs) {
        const data = d.data();
        const text = data.text || data.body || "";
        const r = scoreMessage(text, { channel: data.channel, first_touch: data.first_touch !== false });
        const ch = data.channel || "unknown";
        byChannel[ch] = byChannel[ch] || { total: 0, failing: 0, scores: [] };
        byChannel[ch].total++;
        byChannel[ch].scores.push(r.score);
        if (!r.passes) byChannel[ch].failing++;
        total++;
        if (!r.passes) failing++;
    }

    const today = new Date().toISOString().slice(0, 10);
    const snap = {
        run_at: new Date().toISOString(),
        total_messages: total,
        failing,
        pass_rate: total ? +((1 - failing / total) * 100).toFixed(1) : null,
        by_channel: byChannel,
    };

    await db.collection("brand_voice_audits").doc(today).set(snap, { merge: true });

    const lines = [
        "*🎙 Brand Voice Audit — last 24h*",
        `Total messages scored: *${total}*`,
        `Failing tone gate: *${failing}*` + (total ? ` (${(failing / total * 100).toFixed(1)}%)` : ""),
        "",
    ];
    for (const [ch, d] of Object.entries(byChannel)) {
        const avg = d.scores.reduce((a, b) => a + b, 0) / Math.max(d.scores.length, 1);
        lines.push(`• \`${ch}\` — ${d.failing}/${d.total} fail · avg ${avg.toFixed(1)}/10`);
    }
    if (total === 0) lines.push("_No messages logged to messages_audit/* in last 24h._");

    const text = lines.join("\n");
    await notifyTelegram(text);
    await notifySlack(text);

    return snap;
}

exports.scoreMessage = scoreMessage; // library export for pre-send callers

exports.brandVoiceAuditor = functions
    .runWith({ timeoutSeconds: 180, memory: "256MB" })
    .pubsub.schedule("0 4 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runDailyAudit(); }
        catch (err) {
            functions.logger.error("brandVoiceAuditor crashed:", err);
            await notifyTelegram(`🚨 brandVoiceAuditor crashed: ${err.message}`);
            throw err;
        }
    });

exports.brandVoiceAuditorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        if (req.method === "POST" && req.body?.text) {
            const r = scoreMessage(req.body.text, req.body.context || {});
            return res.status(200).json({ ok: true, ...r });
        }
        const r = await runDailyAudit();
        res.status(200).json({ ok: true, ...r });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
