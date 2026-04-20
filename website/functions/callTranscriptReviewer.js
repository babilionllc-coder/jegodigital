/**
 * callTranscriptReviewer — Sunday 19:00 CDMX weekly analyzer.
 *
 * Loops past 7 days of call_analysis docs, extracts structured patterns:
 *   • Per-offer conversion: positives/total for A/B/C
 *   • Common objections (regex over transcripts)
 *   • Sofia script-adherence gaps (greeted? offered audit? pushed Calendly? leaked price?)
 *   • Connection rate, avg duration, voicemail %
 *
 * Writes to call_reviews/{YYYY-WW} and posts actionable recommendations to Telegram.
 * Runs 1h before autopilotReviewer (Sun 20:00) so the weekly review can cite it.
 *
 * Design: pure programmatic analysis, no LLM call. Deterministic, cheap, reproducible.
 * autopilotReviewer can LLM-enrich the rollup if ANTHROPIC_API_KEY is set there.
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
        functions.logger.error("callTranscriptReviewer Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- Date helpers ----
function cdmxNow() { return new Date(Date.now() - 6 * 60 * 60 * 1000); }
function cdmxKey(d) { return d.toISOString().slice(0, 10); }
function last7DateKeys() {
    const keys = [];
    const base = cdmxNow();
    for (let i = 1; i <= 7; i++) {
        const d = new Date(base.getTime() - i * 24 * 60 * 60 * 1000);
        keys.push(cdmxKey(d));
    }
    return keys;
}
function isoWeekKey(d) {
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ---- Pattern matchers for Sofia script adherence ----
// Based on Sofia's 3 agent scripts (Offer A/B/C). Checks whether Sofia
// actually delivered the value props she's supposed to hit.
function auditScriptAdherence(transcript) {
    if (!Array.isArray(transcript)) return null;
    const agentLines = transcript.filter((t) => t.role === "agent")
        .map((t) => (t.message || "").toLowerCase())
        .join(" ");

    return {
        greeted: /sofia|jegodigital|buen[oa]s? (?:días|tardes|noches)|hola/i.test(agentLines),
        offered_audit: /auditoría|auditoria|análisis|analisis|revisar tu sitio|gratuit/i.test(agentLines),
        offered_setup: /instalación|instalacion|setup|sin costo|gratis/i.test(agentLines),
        mentioned_flamingo: /flamingo|4\.?4x|google maps|#1 en google/i.test(agentLines),
        pushed_calendly: /calendly|agendar|agend[oa]|llamada con alex|15 minutos/i.test(agentLines),
        leaked_price: /\$\s*\d|mil pesos|pesos mensuales|\d+\s*mxn|cuesta\s+\$|precio\s+(?:es|mensual)/i.test(agentLines),
        collected_email: /(?:correo|email)[^.]{0,30}@/i.test(agentLines) ||
            transcript.some((t) => t.role === "user" && /@/.test(t.message || "")),
        collected_website: transcript.some((t) =>
            t.role === "user" && /\.(com|mx|com\.mx|net|org)/i.test(t.message || "")),
    };
}

// Common-objection extractor — counts rough buckets
function extractObjections(transcript) {
    if (!Array.isArray(transcript)) return [];
    const userLines = transcript.filter((t) => t.role === "user")
        .map((t) => (t.message || "").toLowerCase())
        .join(" ");

    const buckets = [];
    if (/no tengo (tiempo|ahora)|estoy ocupad|en reunión|manejando/i.test(userLines)) buckets.push("busy");
    if (/no (me )?interesa|no gracias|no necesito|ya tenemos/i.test(userLines)) buckets.push("not_interested");
    if (/cuánto cuesta|cuanto cuesta|precio|costo|caro|presupuesto/i.test(userLines)) buckets.push("pricing");
    if (/marketing|agencia|proveedor|ya trabajo con|tenemos otra/i.test(userLines)) buckets.push("existing_provider");
    if (/quién llama|quien llama|número|numero|cómo conseguiste|no lo conozco|spam/i.test(userLines)) buckets.push("who_are_you");
    if (/mándame|mandame|por correo|por whatsapp|info|más información|mas informacion/i.test(userLines)) buckets.push("send_info");
    if (/decisión|decide el dueño|mi jefe|mi socio|hablarlo/i.test(userLines)) buckets.push("not_decision_maker");
    return buckets;
}

// =====================================================================
// callTranscriptReviewer — Sunday 19:00 CDMX
// =====================================================================
exports.callTranscriptReviewer = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .pubsub.schedule("0 19 * * 0")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const keys = last7DateKeys();
        const weekKey = isoWeekKey(cdmxNow());

        functions.logger.info(`callTranscriptReviewer ${weekKey}: scanning days ${keys[0]} → ${keys[6]}`);

        // Pull all call_analysis for the 7-day window
        // (10 equality IN per query is fine: 7 keys in one query)
        let callsSnap;
        try {
            callsSnap = await db.collection("call_analysis")
                .where("date_key", "in", keys)
                .limit(500)
                .get();
        } catch (err) {
            functions.logger.error("callTranscriptReviewer query failed:", err.message);
            await sendTelegram(`⚠️ *callTranscriptReviewer ${weekKey}* — query failed: ${err.message}`);
            return null;
        }

        if (callsSnap.empty) {
            await sendTelegram(`📞 *callTranscriptReviewer ${weekKey}* — no calls in past 7 days. Nothing to review.`);
            return null;
        }

        // Aggregators
        const byOffer = { A: { total: 0, positive: 0, negative: 0, neutral: 0, unconnected: 0, pending: 0 },
                          B: { total: 0, positive: 0, negative: 0, neutral: 0, unconnected: 0, pending: 0 },
                          C: { total: 0, positive: 0, negative: 0, neutral: 0, unconnected: 0, pending: 0 } };
        const adherence = { greeted: 0, offered_audit: 0, offered_setup: 0, mentioned_flamingo: 0,
                            pushed_calendly: 0, leaked_price: 0, collected_email: 0, collected_website: 0 };
        const objectionTally = {};
        let totalCalls = 0, totalConnected = 0, totalPositive = 0, totalDuration = 0, scriptSamples = 0;

        callsSnap.forEach((doc) => {
            const c = doc.data();
            totalCalls++;
            const offer = c.offer && byOffer[c.offer] ? c.offer : null;
            const outcome = (c.outcome || "pending").toLowerCase();

            if (offer) {
                byOffer[offer].total++;
                if (outcome === "positive") byOffer[offer].positive++;
                else if (outcome === "negative") byOffer[offer].negative++;
                else if (outcome === "neutral") byOffer[offer].neutral++;
                else if (outcome === "unconnected") byOffer[offer].unconnected++;
                else byOffer[offer].pending++;
            }
            if (outcome === "positive") totalPositive++;
            if (outcome === "positive" || outcome === "negative" || outcome === "neutral") totalConnected++;
            if (typeof c.duration_seconds === "number") totalDuration += c.duration_seconds;

            if (Array.isArray(c.transcript) && c.transcript.length > 1) {
                scriptSamples++;
                const a = auditScriptAdherence(c.transcript);
                if (a) {
                    for (const k of Object.keys(a)) if (a[k]) adherence[k]++;
                }
                const objs = extractObjections(c.transcript);
                objs.forEach((o) => { objectionTally[o] = (objectionTally[o] || 0) + 1; });
            }
        });

        // ---- Build recommendations ----
        const recs = [];
        const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0;

        // Offer winner
        const offerPos = [["A", byOffer.A.positive, byOffer.A.total],
                          ["B", byOffer.B.positive, byOffer.B.total],
                          ["C", byOffer.C.positive, byOffer.C.total]]
            .filter((r) => r[2] >= 10) // min-sample guard
            .sort((a, b) => (b[1] / b[2]) - (a[1] / a[2]));
        if (offerPos.length >= 2) {
            const [winLabel, winPos, winTot] = offerPos[0];
            const [loseLabel, losePos, loseTot] = offerPos[offerPos.length - 1];
            const winRate = pct(winPos, winTot);
            const loseRate = pct(losePos, loseTot);
            if (winRate >= loseRate + 5) {
                recs.push(`Offer ${winLabel} converts ${winRate}% vs ${loseLabel} at ${loseRate}%. Shift rotation weight toward ${winLabel}.`);
            }
        }

        // Script adherence
        if (scriptSamples >= 10) {
            const auditRate = pct(adherence.offered_audit, scriptSamples);
            const calendlyRate = pct(adherence.pushed_calendly, scriptSamples);
            const leakRate = pct(adherence.leaked_price, scriptSamples);
            if (auditRate < 60) recs.push(`Sofia only offers the audit in ${auditRate}% of calls — audit offer should be mandatory in Offer B script.`);
            if (calendlyRate < 40) recs.push(`Sofia pushes Calendly in just ${calendlyRate}% of calls — weak closing, tighten the script.`);
            if (leakRate > 5) recs.push(`🚨 Sofia leaked pricing in ${leakRate}% of calls (${adherence.leaked_price}/${scriptSamples}). VIOLATES Iron Rule 1. Review + retrain agent prompt.`);
        }

        // Common-objection routing
        const topObj = Object.entries(objectionTally).sort((a, b) => b[1] - a[1]).slice(0, 3);
        if (topObj.length && topObj[0][1] >= 3) {
            const top = topObj.map(([o, n]) => `${o} (${n})`).join(", ");
            recs.push(`Top objections this week: ${top}. Draft rebuttal scripts and add to Sofia's system prompt.`);
        }

        // Connection rate
        const connectionRate = pct(totalConnected, totalCalls);
        if (totalCalls >= 50 && connectionRate < 20) {
            recs.push(`Connection rate only ${connectionRate}% (${totalConnected}/${totalCalls}). Audit the phone_leads list — likely carrying dead numbers.`);
        }

        // ---- Write rollup ----
        await db.collection("call_reviews").doc(weekKey).set({
            week_key: weekKey,
            days_scanned: keys,
            total_calls: totalCalls,
            total_connected: totalConnected,
            total_positive: totalPositive,
            connection_rate_pct: connectionRate,
            avg_duration_seconds: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
            by_offer: byOffer,
            script_adherence: adherence,
            script_samples: scriptSamples,
            top_objections: objectionTally,
            recommendations: recs,
            generated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ---- Telegram ----
        const lines = [
            `📞 *Weekly Call Review — ${weekKey}*`,
            `Scanned ${keys[0]} → ${keys[6]}`,
            ``,
            `*Totals:* ${totalCalls} calls · ${totalConnected} connected (${connectionRate}%) · *${totalPositive}* positive`,
            ``,
            `*By offer (positive / total):*`,
            `   A (SEO): ${byOffer.A.positive}/${byOffer.A.total} (${pct(byOffer.A.positive, byOffer.A.total)}%)`,
            `   B (Audit): ${byOffer.B.positive}/${byOffer.B.total} (${pct(byOffer.B.positive, byOffer.B.total)}%)`,
            `   C (Trojan): ${byOffer.C.positive}/${byOffer.C.total} (${pct(byOffer.C.positive, byOffer.C.total)}%)`,
        ];
        if (scriptSamples >= 5) {
            lines.push(``, `*Script adherence (${scriptSamples} samples):*`,
                `   Greeted: ${pct(adherence.greeted, scriptSamples)}%`,
                `   Offered audit: ${pct(adherence.offered_audit, scriptSamples)}%`,
                `   Pushed Calendly: ${pct(adherence.pushed_calendly, scriptSamples)}%`,
                `   🚨 Leaked pricing: ${pct(adherence.leaked_price, scriptSamples)}%`);
        }
        if (topObj.length) {
            lines.push(``, `*Top objections:* ${topObj.map(([o, n]) => `${o}(${n})`).join(", ")}`);
        }
        if (recs.length) {
            lines.push(``, `*🎯 Recommendations:*`);
            recs.forEach((r, i) => lines.push(`   ${i + 1}. ${r}`));
        } else {
            lines.push(``, `No critical patterns this week. Keep running.`);
        }
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`callTranscriptReviewer ${weekKey}: calls=${totalCalls} positive=${totalPositive} recs=${recs.length}`);
        return null;
    });
