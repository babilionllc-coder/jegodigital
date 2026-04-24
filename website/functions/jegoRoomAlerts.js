/**
 * JegoRoom Alerts — Firestore trigger on intent_hot_transitions.
 *
 * When the scoring engine flips an account from cold to hot
 * (score_30d crossing 70), it writes a doc into
 * `intent_hot_transitions` with {notified: false}. This Cloud
 * Function watches that collection and posts an instant Telegram
 * alert so Alex can work the hot account the same hour.
 *
 * Flow:
 *   scoring engine (GitHub Actions)
 *     → writes intent_hot_transitions/{auto}
 *         { account_id, company_name, domain, city, score_30d,
 *           triggered_by_signal, trigger_summary, notified:false }
 *   → this trigger fires
 *     → sends Telegram message
 *     → sets notified:true + notified_at (idempotent)
 *
 * Also exports an HTTPS on-demand endpoint so the jegoroom skill can
 * replay an alert for testing without needing to actually produce
 * a hot transition.
 *
 * Shipped: 2026-04-23 PM
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();


/**
 * Format the Telegram alert body for a hot account.
 * @param {object} t - hot transition doc data
 * @returns {string} Telegram message text (HTML parse mode)
 */
function buildAlertMessage(t) {
    const domain = t.domain || "(unknown domain)";
    const company = t.company_name || "(unknown company)";
    const city = t.city || "(unknown city)";
    const score = t.score_30d ?? 0;
    const summary = (t.trigger_summary || "").slice(0, 220);

    return (
        `🔥 <b>HOT ACCOUNT</b> — JegoRoom\n\n` +
        `<b>${escapeHtml(company)}</b>\n` +
        `🌐 ${escapeHtml(domain)}\n` +
        `📍 ${escapeHtml(city)}\n` +
        `📈 score_30d: <b>${score}</b>/100\n\n` +
        `💡 trigger: ${escapeHtml(summary)}\n\n` +
        `Next step: open Cowork → "jegoroom enrich ${escapeHtml(domain)}"`
    );
}

/** Minimal HTML escape for Telegram parse_mode=HTML. */
function escapeHtml(s) {
    if (!s) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


/**
 * Send a single Telegram message. Returns {ok, message_id?} or {ok:false, error}.
 * @param {string} text - HTML-formatted message
 * @returns {Promise<object>}
 */
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        return { ok: false, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing" };
    }
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const r = await axios.post(url, {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        }, { timeout: 15000 });
        return { ok: true, message_id: r.data?.result?.message_id };
    } catch (e) {
        return {
            ok: false,
            error: e.response?.data?.description || e.message,
        };
    }
}


/**
 * Firestore trigger — fires on new intent_hot_transitions doc.
 * Only notifies if notified!=true (idempotent on re-runs).
 */
exports.jegoRoomAlertOnHotTransition = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .firestore.document("intent_hot_transitions/{transitionId}")
    .onCreate(async (snap, ctx) => {
        const data = snap.data() || {};
        if (data.notified === true) {
            functions.logger.info(
                `hot_transition ${ctx.params.transitionId} already notified; skipping`
            );
            return null;
        }

        const msg = buildAlertMessage(data);
        const result = await sendTelegram(msg);

        const patch = {
            notified: result.ok,
            notified_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (result.ok) {
            patch.telegram_message_id = result.message_id || null;
        } else {
            patch.notify_error = result.error;
        }
        await snap.ref.update(patch);

        functions.logger.info(
            `hot_transition ${ctx.params.transitionId} ` +
            `(${data.company_name || data.account_id}) → ` +
            `notified=${result.ok}`
        );
        return null;
    });


/**
 * HTTPS on-demand — replay a specific hot transition alert.
 * Useful for the jegoroom skill: "resend alert for transition X".
 * GET /jegoRoomReplayAlert?transitionId=XYZ
 */
exports.jegoRoomReplayAlert = functions.https.onRequest(async (req, res) => {
    const transitionId = (req.query.transitionId || "").toString();
    if (!transitionId) {
        return res.status(400).json({ ok: false, error: "transitionId_required" });
    }
    const ref = admin.firestore().collection("intent_hot_transitions").doc(transitionId);
    const snap = await ref.get();
    if (!snap.exists) {
        return res.status(404).json({ ok: false, error: "transition_not_found" });
    }
    const data = snap.data() || {};
    const msg = buildAlertMessage(data);
    const result = await sendTelegram(msg);
    await ref.update({
        replayed_at: admin.firestore.FieldValue.serverTimestamp(),
        replay_ok: result.ok,
    });
    return res.json({
        ok: result.ok,
        transitionId,
        message_id: result.message_id,
        error: result.error,
    });
});


/**
 * HTTPS on-demand — fire a synthetic test alert.
 * Useful for smoke-testing the Telegram path from the jegoroom skill.
 * GET /jegoRoomTestAlert
 */
exports.jegoRoomTestAlert = functions.https.onRequest(async (req, res) => {
    const msg = buildAlertMessage({
        company_name: "JegoRoom Smoke Test",
        domain: "example.mx",
        city: "Cancún",
        score_30d: 77,
        trigger_summary: "Prueba de alerta — sin acción requerida.",
    });
    const result = await sendTelegram(msg);
    return res.json({ ok: result.ok, message_id: result.message_id, error: result.error });
});
