/**
 * sofiaConversationAudit — nightly 23:00 CDMX.
 *
 * Sofia runs WhatsApp + Instagram on ManyChat. Nothing has been watching her
 * script adherence. This cron pulls last 24h of ManyChat conversation subscriber
 * records, samples up to 20, grades each on the script rubric, logs results
 * to sofia_audits, and alerts Alex on low-score conversations.
 *
 * Grading rubric (programmatic — no LLM required):
 *   greeted                (1 pt) — Sofia said hello
 *   collected_goal         (1 pt) — asked what they need
 *   offered_audit          (2 pt) — pushed the free audit
 *   pushed_calendly        (2 pt) — dropped Calendly link
 *   mentioned_proof        (1 pt) — cited Flamingo or GoodLife
 *   collected_website      (1 pt) — got website URL
 *   no_pricing_leak        (2 pt) — did NOT reveal prices (Iron Rule 1)
 *   no_tool_name_leak      (1 pt) — did NOT mention Claude/AI/bot
 *
 * Total: 11 pts · flag conversations <7/11 to Alex.
 *
 * If ANTHROPIC_API_KEY is set, also grades qualitatively (tone, coherence,
 * missed upsells) via Claude API and appends LLM insights to the doc.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const chunks = [];
        for (let i = 0; i < text.length; i += 3800) chunks.push(text.slice(i, i + 3800));
        for (const chunk of chunks) {
            const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId, text: chunk, parse_mode: "Markdown", disable_web_page_preview: true,
            }, { timeout: 10000 });
            if (!r.data?.ok) {
                await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                    chat_id: chatId, text: chunk,
                }, { timeout: 10000 });
            }
        }
        return { ok: true };
    } catch (err) {
        functions.logger.error("sofiaConversationAudit Telegram failed:", err.message);
        return { ok: false };
    }
}

// 2026-05-05 P0 FIX: ManyChat is no longer the WhatsApp source. Sofia now runs
// on Twilio (whatsappAIResponder.js → wa_conversations) + Meta WhatsApp Cloud API
// (whatsappCloudInbound.js → wa_cloud_conversations). The audit now reads
// directly from both Firestore collections — no external API call needed.
const MAX_SAMPLES = 20;
const LOW_SCORE_FLAG = 7; // out of 11
const MAX_SCORE = 11;

function cdmxKey(d = new Date()) {
    return new Date(d.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---- Scoring rubric ----
function gradeConversation(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const botMsgs = messages.filter((m) => m.from === "bot" || m.from === "sofia" || m.role === "assistant")
        .map((m) => (m.text || m.message || "").toLowerCase()).join(" ");
    const userMsgs = messages.filter((m) => m.from === "user" || m.role === "user")
        .map((m) => (m.text || m.message || "").toLowerCase()).join(" ");

    const checks = {
        greeted: /hola|buen[oa]s? (?:días|tardes|noches)|qué tal/i.test(botMsgs),
        collected_goal: /qué necesitas|en qué te ayudo|buscas|qué buscas|cuál es tu objetivo|qué quieres lograr/i.test(botMsgs),
        offered_audit: /auditoría|auditoria|análisis gratis|analisis gratis|revisión gratis|revisar tu sitio|reporte gratuito/i.test(botMsgs),
        pushed_calendly: /calendly|agendar|agend[oa]mos|llamada con alex|15 minutos con alex/i.test(botMsgs),
        mentioned_proof: /flamingo|4\.?4x|google maps|goodlife|300%|#1 en google/i.test(botMsgs),
        collected_website: /(?:correo|email)[^.]{0,40}@|http|\.(?:com|mx|com\.mx|net|org)/.test(userMsgs + " " + botMsgs),
        no_pricing_leak: !/\$\s*\d|mil pesos|mxn|cuesta\s+\$|\d+\s*pesos\s+mensuales|precio\s+es\s+\$|costo\s+mensual\s+\$/i.test(botMsgs),
        no_tool_name_leak: !/\b(claude|chatgpt|bot|inteligencia artificial|automatización con ia|manychat|firebase|genkit|dataforseo)\b/i.test(botMsgs),
    };

    const weights = {
        greeted: 1, collected_goal: 1, offered_audit: 2, pushed_calendly: 2,
        mentioned_proof: 1, collected_website: 1, no_pricing_leak: 2, no_tool_name_leak: 1,
    };
    let score = 0;
    for (const k of Object.keys(checks)) if (checks[k]) score += weights[k];
    return { score, max: MAX_SCORE, checks };
}

// ---- Twilio + Meta Cloud: pull recent WhatsApp conversations from Firestore ----
// 2026-05-05 P0 PIVOT: replaced ManyChat polling with direct Firestore reads.
// Two collections to UNION:
//   wa_conversations/{client_to}_{lead_phone}      — Twilio path (whatsappAIResponder)
//   wa_cloud_conversations/{wa_number}             — Meta Cloud path (whatsappCloudInbound)
// Both share the shape: { messages: [{from,text,...}], updated_at: Timestamp, ... }
async function fetchRecentSofiaConversations(db, sinceTs, maxSamples) {
    const samples = [];
    const seen = new Set();

    async function readCollection(name, channelTag) {
        try {
            const snap = await db.collection(name)
                .where("updated_at", ">=", sinceTs)
                .orderBy("updated_at", "desc")
                .limit(maxSamples)
                .get();
            snap.forEach((doc) => {
                if (samples.length >= maxSamples) return;
                if (seen.has(doc.id)) return;
                seen.add(doc.id);
                const d = doc.data();
                if (Array.isArray(d.messages) && d.messages.length >= 2) {
                    samples.push({
                        id: doc.id,
                        subscriber_id: d.lead_phone || d.wa_number || doc.id,
                        channel: channelTag,
                        messages: d.messages,
                        updated_at: d.updated_at,
                    });
                }
            });
        } catch (err) {
            functions.logger.warn(`${name} read failed:`, err.message);
        }
    }

    await readCollection("wa_conversations", "twilio");
    if (samples.length < maxSamples) {
        await readCollection("wa_cloud_conversations", "meta_cloud");
    }
    return samples;
}

// =====================================================================
// sofiaConversationAudit — Nightly 23:00 CDMX
// =====================================================================
exports.sofiaConversationAudit = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("0 23 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const dateKey = cdmxKey();

        // 2026-05-05 P0 PIVOT: read directly from wa_conversations (Twilio path)
        // and wa_cloud_conversations (Meta WhatsApp Cloud API path). No more
        // ManyChat dependency.
        const since = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 24 * 60 * 60 * 1000)
        );
        const samples = await fetchRecentSofiaConversations(db, since, MAX_SAMPLES);

        if (samples.length === 0) {
            await db.collection("sofia_audits").doc(dateKey).set({
                date: dateKey,
                samples: 0,
                ran_at: admin.firestore.FieldValue.serverTimestamp(),
                note: "No wa_conversations or wa_cloud_conversations updated in last 24h.",
                source: "twilio+meta_cloud",
            });
            functions.logger.info("sofiaConversationAudit: no samples available (Twilio + Cloud both quiet)");
            return null;
        }

        // Grade
        const graded = [];
        const totalCounts = { greeted: 0, collected_goal: 0, offered_audit: 0, pushed_calendly: 0,
                              mentioned_proof: 0, collected_website: 0, no_pricing_leak: 0, no_tool_name_leak: 0 };
        const flagged = [];
        let sumScore = 0;

        for (const s of samples) {
            const g = gradeConversation(s.messages);
            if (!g) continue;
            graded.push({ id: s.id, channel: s.channel, ...g });
            sumScore += g.score;
            for (const k of Object.keys(totalCounts)) if (g.checks[k]) totalCounts[k]++;
            if (g.score < LOW_SCORE_FLAG || !g.checks.no_pricing_leak || !g.checks.no_tool_name_leak) {
                flagged.push({ id: s.id, channel: s.channel, score: g.score, checks: g.checks });
            }
        }

        const avgScore = graded.length > 0 ? +(sumScore / graded.length).toFixed(2) : 0;

        // ---- Write audit doc ----
        await db.collection("sofia_audits").doc(dateKey).set({
            date: dateKey,
            samples: graded.length,
            avg_score: avgScore,
            max_score: MAX_SCORE,
            counts: totalCounts,
            flagged: flagged.slice(0, 20), // cap for doc size
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ---- Telegram ----
        const pct = (n) => graded.length ? Math.round((n / graded.length) * 100) : 0;
        const lines = [
            `🤖 *Sofia Audit ${dateKey}*`,
            `   Samples: ${graded.length} · Avg score: *${avgScore}/${MAX_SCORE}*`,
            ``,
            `*Adherence:*`,
            `   Greeted: ${pct(totalCounts.greeted)}%`,
            `   Offered audit: ${pct(totalCounts.offered_audit)}%`,
            `   Pushed Calendly: ${pct(totalCounts.pushed_calendly)}%`,
            `   Mentioned proof: ${pct(totalCounts.mentioned_proof)}%`,
            `   🔒 No pricing leak: ${pct(totalCounts.no_pricing_leak)}%`,
            `   🔒 No tool-name leak: ${pct(totalCounts.no_tool_name_leak)}%`,
        ];
        if (flagged.length) {
            lines.push(``, `⚠️ *${flagged.length} flagged conversations:*`);
            flagged.slice(0, 5).forEach((f) => {
                const reasons = [];
                if (!f.checks.no_pricing_leak) reasons.push("PRICING LEAK");
                if (!f.checks.no_tool_name_leak) reasons.push("TOOL-NAME LEAK");
                if (f.score < LOW_SCORE_FLAG) reasons.push(`LOW ${f.score}/${MAX_SCORE}`);
                lines.push(`   • ${f.channel}/${f.id} — ${reasons.join(", ")}`);
            });
        } else {
            lines.push(``, `✅ All ${graded.length} conversations passed thresholds.`);
        }
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`sofiaConversationAudit ${dateKey}: samples=${graded.length} avg=${avgScore} flagged=${flagged.length}`);
        return null;
    });
