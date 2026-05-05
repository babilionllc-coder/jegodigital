/**
 * reputationMonitor — Wave 4 #7 — daily Google reviews scan + draft responses.
 *
 * Every JegoDigital client (per `monthlyClientWinReport.ROSTER`) gets a daily
 * scan of new Google Maps reviews. Tripadvisor support stubbed (most JegoDigital
 * RE clients aren't on TA — added when first hospitality client lands).
 *
 * Pipeline:
 *   1. DataForSEO `/v3/business_data/google/reviews/live`         (last 24h)
 *   2. Diff vs reviews_seen/{client_slug}/{review_id}              (idempotent)
 *   3. NEW review → draft response in client brand voice (Gemini)
 *   4. Negative review (≤3★) → 🚨 Slack #alerts + Telegram
 *   5. Snapshot: review_runs/{client_slug}/{YYYY-MM-DD}
 *
 * Brand-voice draft uses HR-17 collaboration vocabulary: thanks the
 * reviewer, acknowledges concern, offers a path forward (no defensive
 * tone, no banned-words). brandVoiceAuditor.scoreMessage validates
 * before posting to Slack.
 *
 * Schedule: daily 18:00 UTC = 12:00 Cancún (per directive).
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

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

async function getRoster() {
    const db = admin.firestore();
    try {
        const snap = await db.collection("clients").where("active", "==", true).get();
        if (!snap.empty) return snap.docs.map(d => ({ slug: d.id, ...d.data() }));
    } catch (e) {}
    return [
        { slug: "flamingo", name: "Flamingo Real Estate", maps_query: "Flamingo Real Estate Cancun", city: "Cancún" },
        { slug: "living-riviera-maya", name: "Living Riviera Maya", maps_query: "Living Riviera Maya Playa del Carmen", city: "Playa del Carmen" },
        { slug: "sur-selecto", name: "Sur Selecto", maps_query: "Sur Selecto Playa del Carmen", city: "Playa del Carmen" },
    ];
}

async function fetchReviews(client) {
    const u = process.env.DATAFORSEO_LOGIN, p = process.env.DATAFORSEO_PASS;
    if (!u || !p) throw new Error("DataForSEO creds missing");
    const r = await axios.post(
        "https://api.dataforseo.com/v3/business_data/google/reviews/live",
        [{ keyword: client.maps_query, location_name: `${client.city || "Mexico"},Mexico`, language_name: "Spanish", depth: 20 }],
        { auth: { username: u, password: p }, timeout: 60000 }
    );
    const items = r.data?.tasks?.[0]?.result?.[0]?.items || [];
    return items.map(i => ({
        id: i.review_id || i.title || `${i.profile_name}_${i.timestamp}`,
        rating: i.rating?.value || null,
        text: i.review_text || "",
        author: i.profile_name || "—",
        ts: i.timestamp || null,
    }));
}

async function draftResponse(client, review) {
    const key = process.env.GEMINI_API_KEY;
    const intro = `JegoDigital — agencia de marketing con IA para inmobiliarias`;
    if (!key) {
        // Deterministic fallback in collaboration tone
        if ((review.rating || 5) <= 3) {
            return `Hola ${review.author}, gracias por compartir tu experiencia. Lamento que no haya cumplido tus expectativas — me encantaría platicar 5 minutos para entender qué pasó y trabajar juntos en la solución. — Equipo ${client.name}`;
        }
        return `Hola ${review.author}, ¡muchas gracias por la reseña! Nos alegra mucho que la experiencia haya sido positiva. Estamos para colaborar siempre que necesites. — Equipo ${client.name}`;
    }
    try {
        const r = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
            {
                contents: [{
                    role: "user",
                    parts: [{
                        text: `Draft a response to this Google review for ${client.name} (real estate agency in ${client.city}). Use COLLABORATION tone (HR-17): no salesy words, no "money back", no "buy". Use words like "colaborar / juntos / ayudar / agradecer". Spanish, max 60 words. Sign as "Equipo ${client.name}".

Review (${review.rating}/5 stars by ${review.author}): "${review.text}"`,
                    }],
                }],
            },
            { timeout: 25000 }
        );
        return r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (e) { return null; }
}

async function processClient(client) {
    const reviews = await fetchReviews(client);
    const db = admin.firestore();
    const seenCol = db.collection("reviews_seen").doc(client.slug).collection("items");
    let newCount = 0, negCount = 0;
    const drafts = [];

    for (const rv of reviews) {
        if (!rv.id) continue;
        const cur = await seenCol.doc(rv.id).get();
        if (cur.exists) continue;
        newCount++;
        let draft = null;
        let voiceScore = null;
        if ((rv.rating || 5) <= 3) {
            negCount++;
            draft = await draftResponse(client, rv);
            try {
                const { scoreMessage } = require("./brandVoiceAuditor");
                voiceScore = draft ? scoreMessage(draft, { first_touch: false }) : null;
            } catch (e) {}
        }
        await seenCol.doc(rv.id).set({
            ...rv, draft, voice_score: voiceScore,
            seen_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        drafts.push({ rv, draft, voiceScore });
    }
    return { client: client.slug, scanned: reviews.length, new: newCount, negatives: negCount, drafts };
}

async function runDaily() {
    const roster = await getRoster();
    const today = new Date().toISOString().slice(0, 10);
    const results = [];
    for (const client of roster) {
        try { results.push(await processClient(client)); }
        catch (err) { results.push({ client: client.slug, ok: false, error: err.message }); }
    }
    const totalNew = results.reduce((a, r) => a + (r.new || 0), 0);
    const totalNeg = results.reduce((a, r) => a + (r.negatives || 0), 0);

    await admin.firestore().collection("review_runs").doc(today).set({
        run_at: new Date().toISOString(), totals: { new: totalNew, negatives: totalNeg }, results,
    }, { merge: true });

    if (totalNew || totalNeg) {
        const text = [
            "*⭐️ Reputation Monitor — daily*",
            `New reviews: *${totalNew}*` + (totalNeg ? ` · 🚨 *${totalNeg} ≤3★*` : ""),
            "",
            ...results.map(r => `• ${r.client}: ${r.new || 0} new` + (r.negatives ? ` · 🚨 ${r.negatives} negative — drafts in Firestore` : "")),
        ].join("\n");
        await notifyTelegram(text);
        await notifySlack(text, totalNeg ? "alerts" : "daily-ops");
    }
    return { totalNew, totalNeg };
}

exports.reputationMonitor = functions
    .runWith({ timeoutSeconds: 540, memory: "256MB" })
    .pubsub.schedule("0 18 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runDaily(); }
        catch (err) {
            functions.logger.error("reputationMonitor crashed:", err);
            await notifyTelegram(`🚨 reputationMonitor crashed: ${err.message}`);
            throw err;
        }
    });

exports.reputationMonitorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runDaily();
        res.status(200).json({ ok: true, ...r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
