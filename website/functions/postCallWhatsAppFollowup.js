/**
 * postCallWhatsAppFollowup — Triggered after every AI cold call to FB brokers.
 *
 * Flow:
 *   ElevenLabs webhook (call ended)
 *     ↓
 *   classify outcome (warm_transfer / polite_exit / no_answer / interested_whatsapp / etc.)
 *     ↓
 *   if polite_exit OR interested_whatsapp:
 *       1. Write to /whatsapp_followup_queue (status=pending)
 *       2. Send Telegram alert to Alex with:
 *          - Pre-written WhatsApp message (Spanish)
 *          - Deep link wa.me/{phone}?text={encoded_message}
 *          - One-tap "Mark as Sent" button (callback_data → markSent)
 *       3. Alex taps deep link → opens WhatsApp on phone with text pre-filled
 *       4. Alex hits Send → message goes via his personal/business WhatsApp
 *       5. Alex taps "Mark as Sent" in Telegram → updates queue status=sent
 *
 * Why this design (no full ManyChat auto-send):
 *   - Meta WhatsApp Business templates require pre-approval (24-48h)
 *   - These leads are scraped + outside 24h customer service window
 *   - Cold-blasting from JegoDigital's WhatsApp Business risks Meta flagging the whole
 *     pipeline (Sofia + existing customers)
 *   - Manual send via Alex's phone keeps it human + compliant
 *   - Future upgrade path: get Meta-approved "real-estate-bridge-followup" template,
 *     then this function auto-sends without Alex's manual step
 *
 * Trigger:
 *   - Webhook from ElevenLabs (configure in agent settings)
 *   - Endpoint: POST /postCallWhatsAppFollowup
 *
 * Firestore:
 *   - /whatsapp_followup_queue/{conversationId}
 *     {
 *       phone, broker_name, source_group, zone, sample_post_url,
 *       outcome ('polite_exit'|'interested_whatsapp'|'do_not_call'),
 *       message_text, wa_deeplink,
 *       status ('pending'|'sent'|'skipped'|'failed'),
 *       created_at, marked_sent_at, marked_sent_by
 *     }
 *
 * Env required:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

async function sendTelegramWithButtons(text, inlineKeyboard) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: false,
            reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
        }, { timeout: 10000 });
        return { ok: !!r.data?.ok, message_id: r.data?.result?.message_id };
    } catch (err) {
        functions.logger.error("Telegram send failed:", err.message);
        return { ok: false };
    }
}

/**
 * Classify the call outcome from ElevenLabs analysis.
 * Returns one of: warm_transfer | polite_exit | interested_whatsapp |
 *                 do_not_call | no_answer | callback_requested | unknown
 */
function classifyOutcome(analysisData) {
    const summary = (analysisData?.transcript_summary || "").toLowerCase();
    const callSuccessful = analysisData?.call_successful || analysisData?.success;
    const dataCollection = analysisData?.data_collection_results || {};

    // Explicit data collection field (configured in ElevenLabs agent)
    if (dataCollection.outcome?.value) {
        return dataCollection.outcome.value;
    }

    // Fallback: keyword classification on transcript_summary
    if (/transferred|transferido|paso con alex|warm transfer/i.test(summary)) return "warm_transfer";
    if (/whatsapp.*send|envíame.*whatsapp|mándame.*whatsapp|interested.*whatsapp/i.test(summary)) return "interested_whatsapp";
    if (/no.*interesa|ya tengo agencia|do not call|molesto|aggressive/i.test(summary)) {
        if (/molesto|aggressive|abusive/i.test(summary)) return "do_not_call";
        return "polite_exit";
    }
    if (/no.*respond|no answer|voicemail|buzón/i.test(summary)) return "no_answer";
    if (/llám.*después|callback|me llama después/i.test(summary)) return "callback_requested";
    return "unknown";
}

/**
 * Build the Spanish WhatsApp follow-up message based on context.
 */
function buildWhatsAppMessage(ctx) {
    const { broker_first_name, source_group, zone, outcome } = ctx;
    const greeting = broker_first_name ? `Hola ${broker_first_name},` : `Hola,`;

    if (outcome === "interested_whatsapp") {
        return `${greeting}\n\nSoy Alex de JegoDigital — la agencia de marketing con IA para inmobiliarias. Como acordamos en la llamada, le mando el caso de Flamingo Real Estate (Cancún) que pasó de invisible a #1 en Google Maps en 90 días:\n\nhttps://jegodigital.com\n\n¿Cuándo le viene mejor agendar 15 minutos para platicar?\n\nAlex Jego\nFundador, JegoDigital`;
    }

    // Default: polite_exit follow-up
    return `${greeting}\n\nSoy Alex de JegoDigital. Hace un rato hablamos brevemente sobre marketing para inmobiliarias en ${zone || "su zona"}.\n\nLe dejo el caso de Flamingo Real Estate por si quiere echarle un vistazo cuando tenga tiempo: pasaron de invisibles a #1 en Google Maps en 90 días, sin contratar a nadie de tiempo completo.\n\nhttps://jegodigital.com\n\nLa puerta queda abierta cuando quiera platicar.\n\nSaludos,\nAlex Jego\nJegoDigital`;
}

/**
 * Webhook endpoint. ElevenLabs POSTs here when a call ends.
 * Expected payload includes conversation metadata + analysis + dynamic variables.
 */
exports.postCallWhatsAppFollowup = functions.https.onRequest(async (req, res) => {
    try {
        const body = req.body || {};
        const conversationId = body.conversation_id || body.conversationId || `conv_${Date.now()}`;
        const dynamicVars = body.conversation_initiation_client_data?.dynamic_variables || {};
        const phone = body.phone_number || dynamicVars.phone || "";
        const brokerName = dynamicVars.first_name || dynamicVars.business_name || "";
        const brokerFirstName = dynamicVars.first_name || "";
        const sourceGroup = dynamicVars.source_group || "Bienes Raíces";
        const zone = dynamicVars.zone || "";
        const samplePostUrl = dynamicVars.sample_post_url || "";

        const analysis = body.analysis || {};
        const outcome = classifyOutcome(analysis);

        functions.logger.info(`📞 PostCall webhook: conv=${conversationId} phone=${phone} outcome=${outcome}`);

        const db = admin.firestore();

        // Always log outcome
        await db.collection("call_outcomes").doc(conversationId).set({
            conversation_id: conversationId,
            phone, broker_name: brokerName, broker_first_name: brokerFirstName,
            source_group, zone, sample_post_url: samplePostUrl,
            outcome,
            transcript_summary: analysis.transcript_summary || "",
            call_successful: analysis.call_successful || false,
            received_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Only queue WhatsApp follow-up for specific outcomes
        const followupOutcomes = ["polite_exit", "interested_whatsapp"];
        if (!followupOutcomes.includes(outcome)) {
            return res.json({ ok: true, outcome, queued: false, reason: "outcome not in followup list" });
        }

        if (!phone) {
            return res.json({ ok: false, error: "no phone" });
        }

        // Build message + WhatsApp deeplink
        const messageText = buildWhatsAppMessage({
            broker_first_name: brokerFirstName,
            source_group: sourceGroup,
            zone,
            outcome,
        });
        const phoneClean = phone.replace(/[^0-9]/g, "");
        const waDeeplink = `https://wa.me/${phoneClean}?text=${encodeURIComponent(messageText)}`;

        // Write to followup queue
        await db.collection("whatsapp_followup_queue").doc(conversationId).set({
            conversation_id: conversationId,
            phone, broker_name: brokerName, broker_first_name: brokerFirstName,
            source_group, zone, sample_post_url: samplePostUrl,
            outcome,
            message_text: messageText,
            wa_deeplink: waDeeplink,
            status: "pending",
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            marked_sent_at: null,
            marked_sent_by: null,
        });

        // Send Telegram alert with one-tap deep link + mark-sent button
        const tgText =
            `📲 *WhatsApp follow-up READY*\n\n` +
            `👤 ${brokerName || "(sin nombre)"} — ${zone || "?"}\n` +
            `📞 Lead: \`${phone}\`\n` +
            `🎯 Outcome: \`${outcome}\`\n` +
            `📍 Grupo: ${sourceGroup}\n\n` +
            `📝 *Mensaje preparado:*\n_${messageText.substring(0, 200)}..._\n\n` +
            `⚠️ *IMPORTANTE:* Abre el enlace desde tu *laptop con WhatsApp Web logueado en +52 998 787 5321 (JegoDigital Business)* — no desde el teléfono personal. ` +
            `Así Sofía maneja las respuestas en ManyChat automáticamente.`;

        const inlineKeyboard = [
            [{ text: "📱 Abrir WhatsApp con mensaje", url: waDeeplink }],
            [{ text: "✅ Marcar como enviado", callback_data: `wa_sent:${conversationId}` }],
            [{ text: "🚫 Skip (no enviar)", callback_data: `wa_skip:${conversationId}` }],
        ];

        const tgResult = await sendTelegramWithButtons(tgText, inlineKeyboard);

        return res.json({
            ok: true,
            conversation_id: conversationId,
            outcome,
            queued: true,
            telegram_sent: tgResult.ok,
            telegram_message_id: tgResult.message_id,
        });
    } catch (err) {
        functions.logger.error("postCallWhatsAppFollowup error:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * Telegram callback handler — when Alex taps "Mark as Sent" or "Skip".
 * Updates the followup queue doc.
 *
 * To wire: configure Telegram bot webhook to POST here for callback_query updates,
 * OR have telegramApprovalBot.js dispatch callbacks with prefix `wa_sent:` / `wa_skip:`.
 */
exports.markWhatsAppFollowupSent = functions.https.onRequest(async (req, res) => {
    try {
        const update = req.body || {};
        const cb = update.callback_query;
        if (!cb || !cb.data) return res.json({ ok: true, ignored: "no callback" });
        if (!/^wa_(sent|skip):/.test(cb.data)) return res.json({ ok: true, ignored: "not wa callback" });

        const [action, conversationId] = cb.data.split(":");
        const newStatus = action === "wa_sent" ? "sent" : "skipped";

        await admin.firestore().collection("whatsapp_followup_queue").doc(conversationId).update({
            status: newStatus,
            marked_sent_at: admin.firestore.FieldValue.serverTimestamp(),
            marked_sent_by: cb.from?.username || cb.from?.id || "unknown",
        });

        // Acknowledge in Telegram
        const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
        await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            callback_query_id: cb.id,
            text: action === "wa_sent" ? "✅ Marcado como enviado" : "🚫 Skip registrado",
        }).catch(() => {});

        return res.json({ ok: true, conversation_id: conversationId, status: newStatus });
    } catch (err) {
        functions.logger.error("markWhatsAppFollowupSent error:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});
