/**
 * personaDriftDetector — Wave 4 #11 — weekly Sofia-conversation drift check.
 *
 * Independent reviewer recommended folding into brandVoiceAuditor. Kept
 * as a separate function because the SAMPLING pattern (5 random Sofia
 * convos per week, full-conversation rubric) is distinct from the
 * 24h-message-level scoring brandVoiceAuditor does daily. They are
 * complementary: brandVoiceAuditor scores SINGLE messages right after
 * send; personaDriftDetector scores WHOLE conversations once a week
 * to catch drift the per-message scorer misses (e.g. tone starts
 * collaborative then drifts to pushy by message 5).
 *
 * Pipeline:
 *   1. Sample 5 random sofia_conversations from last 7 days
 *      (≥3 messages from Sofia, has invitee email or phone)
 *   2. Concat all Sofia messages → score whole text via
 *      brandVoiceAuditor.scoreMessage() with first_touch=true
 *   3. Additionally rate (Gemini) on 4 dimensions: collaboration vibe,
 *      pushiness, JegoDigital-intro presence, signal-grounded references
 *   4. Compute drift_score = baseline_5wk_avg − this_week_avg
 *   5. If drift_score > 1.5 OR any conversation < 6/10 → 🚨 prompt-rewrite alert
 *   6. Snapshot: persona_drift/{YYYY-WW}
 *
 * Schedule: Friday 23:00 UTC = 17:00 Cancún (per directive).
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const SAMPLE_SIZE = 5;
const DRIFT_ALERT_THRESHOLD = 1.5; // drop in avg score vs 5-week baseline
const PER_CONV_MIN_SCORE = 6;

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

async function pickSample() {
    const db = admin.firestore();
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let snap;
    try {
        snap = await db.collection("sofia_conversations")
            .where("last_message_at", ">=", since).limit(200).get();
    } catch (e) {
        snap = await db.collection("sofia_conversations").limit(200).get();
    }
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => Array.isArray(c.messages) && c.messages.filter(m => m.from === "sofia").length >= 3);
    // Random sample
    const shuffled = all.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, SAMPLE_SIZE);
}

async function geminiRate(text) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    try {
        const r = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
            {
                contents: [{
                    role: "user",
                    parts: [{
                        text: `Rate this Sofia (JegoDigital AI agent) conversation on 4 axes (1-10 each):
1. collaboration_vibe (10 = pure partner / 1 = pushy salesperson)
2. pushiness (10 = zero pressure / 1 = constantly closing)
3. jegodigital_intro_present (10 = clear "JegoDigital + real estate" intro / 1 = absent)
4. signal_grounded (10 = referenced specific lead facts / 1 = generic)

Return ONLY valid JSON: {"collaboration_vibe":N,"pushiness":N,"jegodigital_intro_present":N,"signal_grounded":N,"verdict":"<10 words>"}.

Conversation:
${text.slice(0, 6000)}`,
                    }],
                }],
            },
            { timeout: 25000 }
        );
        const raw = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) return null;
        return JSON.parse(m[0]);
    } catch (e) { return null; }
}

function avg(nums) {
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function runDriftCheck() {
    const sample = await pickSample();
    const db = admin.firestore();
    let scoreAuditor = null;
    try { ({ scoreMessage: scoreAuditor } = require("./brandVoiceAuditor")); } catch (e) {}

    const scored = [];
    for (const conv of sample) {
        const sofiaText = (conv.messages || [])
            .filter(m => m.from === "sofia").map(m => m.text || "").join("\n\n");
        const auditor = scoreAuditor ? scoreAuditor(sofiaText, { first_touch: true }) : null;
        const rated = await geminiRate(sofiaText);
        scored.push({
            id: conv.id, sofia_chars: sofiaText.length,
            auditor_score: auditor?.score, auditor_passes: auditor?.passes, auditor_reasons: auditor?.reasons,
            gemini_rating: rated,
        });
    }

    const thisWeekAvg = avg(scored.map(s => s.auditor_score).filter(x => typeof x === "number"));

    // Pull last 5 weeks of persona_drift snapshots for baseline
    let baseline = null;
    try {
        const histSnap = await db.collection("persona_drift").orderBy("run_at", "desc").limit(5).get();
        const baselineScores = histSnap.docs.map(d => d.data()?.this_week_avg).filter(x => typeof x === "number");
        baseline = avg(baselineScores);
    } catch (e) {}

    const drift = (baseline != null && thisWeekAvg != null) ? baseline - thisWeekAvg : null;
    const lowConvs = scored.filter(s => typeof s.auditor_score === "number" && s.auditor_score < PER_CONV_MIN_SCORE);
    const driftAlert = (drift != null && drift > DRIFT_ALERT_THRESHOLD) || lowConvs.length > 0;

    const yyyyww = (() => {
        const d = new Date();
        const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dayNum = (target.getUTCDay() + 6) % 7;
        target.setUTCDate(target.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
        const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
        return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    })();

    await db.collection("persona_drift").doc(yyyyww).set({
        run_at: new Date().toISOString(),
        sample_size: scored.length,
        this_week_avg: thisWeekAvg,
        baseline_5wk_avg: baseline,
        drift, drift_alert: driftAlert,
        scored,
    }, { merge: true });

    const text = [
        "*🎭 Sofia Persona-Drift Check — weekly*",
        `Sample: *${scored.length} conversations*`,
        `This week avg: *${thisWeekAvg?.toFixed(2) || "—"}/10*`,
        baseline != null ? `5-week baseline: ${baseline.toFixed(2)}/10 (drift: ${drift > 0 ? "−" : "+"}${Math.abs(drift).toFixed(2)})` : null,
        lowConvs.length ? `🚨 *${lowConvs.length} conversations below ${PER_CONV_MIN_SCORE}/10* — review prompt!` : null,
        "",
        `_Snapshot: persona_drift/${yyyyww}_`,
    ].filter(Boolean).join("\n");

    if (driftAlert) {
        await notifyTelegram(text);
        await notifySlack(text);
    } else {
        // Quiet healthy weeks — only Telegram, no Slack noise
        await notifyTelegram(text);
    }
    return { thisWeekAvg, baseline, drift, lowConvs: lowConvs.length };
}

exports.personaDriftDetector = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 23 * * 5")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runDriftCheck(); }
        catch (err) {
            functions.logger.error("personaDriftDetector crashed:", err);
            await notifyTelegram(`🚨 personaDriftDetector crashed: ${err.message}`);
            throw err;
        }
    });

exports.personaDriftDetectorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runDriftCheck();
        res.status(200).json({ ok: true, ...r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
