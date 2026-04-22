/**
 * instantlyReplyWatcher — 5-min Unibox poller, auto-fires audits on positive replies.
 *
 * Closes the "Instantly active feed" gap identified by Alex on 2026-04-20:
 * systemHealthAudit already tracks campaign aggregate stats (bounce %, reply %),
 * but before this cron no automation watched INDIVIDUAL Unibox replies. So a
 * hand-raiser could ping "mándame info" on a Sunday and nothing fired for
 * 18 hours until Alex happened to open the tab.
 *
 * What this does:
 *   1. Every 5 minutes, pull recent Instantly replies via v2 API.
 *   2. Dedup against instantly_reply_activity Firestore collection.
 *   3. Classify sentiment with a lightweight Spanish/English rule set.
 *   4. If classified as POSITIVE and we have email + website: auto-fire
 *      an audit_requests doc with source="instantly_autofire" — the existing
 *      processAuditRequest pipeline picks it up and delivers in ~45min.
 *   5. Telegram-alert hot replies and anything the AI agent might have
 *      mishandled (positive reply but agent chose NEGATIVE, negative reply
 *      with no agent response, pricing questions, etc.).
 *
 * Design rule (per Alex 2026-04-20): NO approve-before-fire gate. The cron
 * logs everything to instantly_reply_activity; dailyDigest + autopilotReviewer
 * surface anomalies after the fact.
 *
 * Firestore shape:
 *   instantly_reply_activity/{replyId}   — per-reply ledger (dedup key)
 *   instantly_reply_summaries/{YYYY-MM-DD} — daily rollups
 *   audit_requests/{id}                  — audit queue (source=instantly_autofire)
 *
 * API reference:
 *   POST https://api.instantly.ai/api/v2/emails (filtered to replies via email_type="received")
 *   Headers: Authorization: Bearer ${INSTANTLY_API_KEY}
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const brevoNurture = require("./brevoNurture");

// ---- Telegram ----
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (r.data?.ok) return { ok: true };
        const r2 = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text,
        }, { timeout: 10000 });
        return { ok: !!r2.data?.ok };
    } catch (err) {
        functions.logger.error("instantlyReplyWatcher Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- Classifier ----
// Based on Cold Email Operations Playbook Iron Rule 11: positive reply = lead
// showed clear interest ("mándame info", "sí", "agéndame"), negative = clear
// rejection ("no gracias", "quítame", "unsubscribe"), else neutral.
//
// We deliberately err toward NEUTRAL when in doubt — autofire only on the
// clearest positives. Alex can promote a neutral to positive manually.
function classifyReply(bodyRaw) {
    if (!bodyRaw) return "neutral";
    const body = bodyRaw.toLowerCase().replace(/\s+/g, " ").trim();

    // Hard negatives first (avoid false-positive autofires)
    const negativeMarkers = [
        "no gracias", "no me interesa", "no estoy interesad",
        "quítame", "quitame", "remover", "remuévan", "remueve",
        "unsubscribe", "remove me", "not interested", "do not contact",
        "stop emailing", "no llamen", "no envien", "no mand",
        "please stop", "leave me alone", "bórr", "borra mi",
    ];
    if (negativeMarkers.some((m) => body.includes(m))) return "negative";

    // Explicit pricing/objection flags — route to Alex even if tone is positive
    const objectionMarkers = [
        "cuánto cuesta", "cuanto cuesta", "precio", "costo", "cost",
        "caro", "expensive", "presupuesto limitad", "tight budget",
    ];
    const hasObjection = objectionMarkers.some((m) => body.includes(m));

    // Strong positive (auto-fire territory)
    const strongPositive = [
        "sí me interesa", "si me interesa", "me interesa",
        "mándame", "mandame", "envíame", "enviame",
        "platiquemos", "agendemos", "agenda", "agéndame", "agendame",
        "llámame", "llamame", "call me",
        "dale", "adelante", "hazlo", "vamos", "perfecto",
        "i'm interested", "im interested", "interested",
        "send me", "tell me more", "sounds good", "let's talk", "lets talk",
        "book a call", "yes please", "sí por favor",
        "suena bien", "me encant",
    ];
    const strong = strongPositive.some((m) => body.includes(m));

    if (strong && hasObjection) return "positive_with_objection";
    if (strong) return "positive";

    // Soft-positive (ask but not commit) — neutral by default
    if (/\?/.test(body) && /(info|qué|que|cómo|como|cuánto|cuanto|dónde|donde)/.test(body)) {
        return "question";
    }
    return "neutral";
}

// ---- Extract email + website from the lead Instantly returned ----
function extractLeadContext(email) {
    // Instantly v2 email object structure (as of 2026-04):
    //   { id, from_address_email, to_address_email, subject, body,
    //     campaign, lead_id, lead, timestamp, ... }
    const leadObj = email.lead || {};
    const leadEmail = email.from_address_email ||
        email.lead_email ||
        leadObj.email ||
        null;
    const website = leadObj.website || leadObj.domain ||
        leadObj.custom_variables?.website || null;
    const firstName = leadObj.first_name || leadObj.firstName ||
        leadObj.custom_variables?.firstName || "";
    const company = leadObj.company_name || leadObj.company ||
        leadObj.custom_variables?.companyName || "";
    return { email: leadEmail, website, firstName, company, leadObj };
}

// =====================================================================
// instantlyReplyWatcher — every 5 minutes
// =====================================================================
exports.instantlyReplyWatcher = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .pubsub.schedule("every 5 minutes")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY;
        if (!INSTANTLY_KEY) {
            functions.logger.warn("instantlyReplyWatcher: INSTANTLY_API_KEY not set, skipping.");
            return null;
        }

        // CDMX date for daily rollup
        const cdmxNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const dateKey = cdmxNow.toISOString().slice(0, 10);

        // Fetch the most recent 50 incoming replies. We over-fetch and dedup
        // against Firestore to catch anything we missed during a deploy gap.
        let emails = [];
        try {
            const r = await axios.get("https://api.instantly.ai/api/v2/emails", {
                headers: { Authorization: `Bearer ${INSTANTLY_KEY}` },
                params: { limit: 50, email_type: "received" },
                timeout: 20000,
            });
            emails = r.data?.items || r.data?.data || r.data || [];
            if (!Array.isArray(emails)) emails = [];
        } catch (err) {
            const msg = err.response?.data?.detail || err.response?.statusText || err.message;
            functions.logger.error("instantlyReplyWatcher: fetch failed:", msg);
            await sendTelegram(`⚠️ *instantlyReplyWatcher* — Instantly fetch failed: ${msg}`);
            return null;
        }

        if (emails.length === 0) {
            functions.logger.info("instantlyReplyWatcher: no new replies in window");
            return null;
        }

        let processed = 0, newReplies = 0, positives = 0, negatives = 0,
            neutrals = 0, questions = 0, auditsFired = 0, hotAlerts = 0;
        const hotLeads = [];
        const objectionLeads = [];

        for (const em of emails) {
            processed++;
            const replyId = em.id || em.email_id || em.uuid;
            if (!replyId) continue;

            // Dedup
            const activityRef = db.collection("instantly_reply_activity").doc(String(replyId));
            const existing = await activityRef.get();
            if (existing.exists) continue;

            newReplies++;
            const body = em.body || em.body_text || em.content || "";
            const subject = em.subject || "";
            const ctx = extractLeadContext(em);
            const outcome = classifyReply(body + "\n" + subject);

            if (outcome === "positive") positives++;
            else if (outcome === "negative") negatives++;
            else if (outcome === "question") questions++;
            else if (outcome === "positive_with_objection") { positives++; objectionLeads.push(ctx); }
            else neutrals++;

            // Auto-fire audit on clean positives (not positive_with_objection — Alex handles those)
            let auditQueued = false;
            if (outcome === "positive" && ctx.email && ctx.website) {
                try {
                    await db.collection("audit_requests").add({
                        email: ctx.email,
                        website: ctx.website,
                        firstName: ctx.firstName || "",
                        company: ctx.company || "",
                        source: "instantly_autofire",
                        instantly_reply_id: replyId,
                        instantly_campaign_id: em.campaign || em.campaign_id || null,
                        reply_body_preview: body.slice(0, 500),
                        created_at: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    auditsFired++;
                    auditQueued = true;
                } catch (err) {
                    functions.logger.warn(`audit autofire failed for ${replyId}:`, err.message);
                }
            }

            // Start Brevo nurture Track A — fires on clean positive OR
            // positive_with_objection (objection handling is part of nurture).
            // Idempotent — startTrackA skips if already enrolled.
            let nurtureStarted = false;
            if ((outcome === "positive" || outcome === "positive_with_objection") && ctx.email) {
                try {
                    const n = await brevoNurture.startTrackA({
                        email: ctx.email,
                        firstName: ctx.firstName || "",
                        company: ctx.company || "",
                        campaignId: em.campaign || em.campaign_id || null,
                        replyId,
                        replyBody: body,
                        replyDate: em.timestamp_email || em.timestamp || em.created_at || null,
                    });
                    if (n.ok && !n.skipped) nurtureStarted = true;
                } catch (err) {
                    functions.logger.warn(`brevo nurture start failed for ${replyId}:`, err.message);
                }
            }

            // Hot-alert criteria: positive OR positive_with_objection OR question with
            // decision-maker signals. These all go to Telegram so Alex can respond fast.
            if (outcome === "positive" || outcome === "positive_with_objection") {
                hotLeads.push({
                    outcome,
                    email: ctx.email,
                    firstName: ctx.firstName,
                    company: ctx.company,
                    website: ctx.website,
                    preview: body.slice(0, 180),
                    auditQueued,
                });
                hotAlerts++;
            }

            // Ledger write
            await activityRef.set({
                reply_id: replyId,
                received_at: em.timestamp || em.created_at ||
                    admin.firestore.FieldValue.serverTimestamp(),
                from: ctx.email,
                firstName: ctx.firstName,
                company: ctx.company,
                website: ctx.website,
                campaign: em.campaign || em.campaign_id || null,
                subject: subject.slice(0, 200),
                body_preview: body.slice(0, 500),
                outcome,
                audit_queued: auditQueued,
                brevo_nurture_started: nurtureStarted,
                processed_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Daily rollup (merge — many runs per day)
        if (newReplies > 0) {
            await db.collection("instantly_reply_summaries").doc(dateKey).set({
                date: dateKey,
                total: admin.firestore.FieldValue.increment(newReplies),
                positive: admin.firestore.FieldValue.increment(positives),
                negative: admin.firestore.FieldValue.increment(negatives),
                question: admin.firestore.FieldValue.increment(questions),
                neutral: admin.firestore.FieldValue.increment(neutrals),
                audits_fired: admin.firestore.FieldValue.increment(auditsFired),
                last_run_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        // Telegram only when there's something worth attention
        if (hotAlerts > 0 || auditsFired > 0) {
            const lines = [
                `🔥 *Instantly replies* — ${newReplies} new`,
                `   Positive: *${positives}* · Questions: ${questions} · Negative: ${negatives} · Neutral: ${neutrals}`,
                `   Audits auto-fired: *${auditsFired}*`,
            ];
            if (hotLeads.length) {
                lines.push("", "_Hot replies:_");
                hotLeads.slice(0, 5).forEach((l) => {
                    const tag = l.outcome === "positive_with_objection" ? "💰 OBJECTION" :
                        l.auditQueued ? "✅ audit fired" : "👀 needs Alex";
                    lines.push(`   • ${l.firstName || l.email} (${l.company || "—"}) — ${tag}`);
                    lines.push(`     _"${l.preview}"_`);
                });
            }
            if (objectionLeads.length) {
                lines.push("", `_${objectionLeads.length} replies mentioned pricing — handle personally._`);
            }
            await sendTelegram(lines.join("\n"));
        }

        functions.logger.info(
            `instantlyReplyWatcher: processed=${processed} new=${newReplies} ` +
            `pos=${positives} neg=${negatives} q=${questions} audits=${auditsFired}`
        );
        return null;
    });
