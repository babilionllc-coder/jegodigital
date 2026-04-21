/**
 * telegramHelper — shared Telegram + Twilio SMS fallback.
 *
 * Every cron module previously inlined its own sendTelegram() copy. That's fine
 * for clarity but leaves a gap: if Telegram is down (API outage, token revoked,
 * Alex accidentally blocked the bot), all our alarms go silent. This module:
 *
 *   1. Primary: Telegram Markdown → plain-text fallback → same handling as before.
 *   2. Secondary: if Telegram fails AND the alert is marked critical=true,
 *      fire a Twilio SMS to Alex's personal number (+52 998 787 5321).
 *
 * Existing modules keep their own sendTelegram() for now (non-breaking). New
 * critical-path crons should import this.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID       — primary channel
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *   TWILIO_FROM, ALEX_PERSONAL_PHONE           — SMS fallback
 */
const functions = require("firebase-functions");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
const ALEX_PERSONAL_FALLBACK = "+529987875321"; // Alex WA, fallback; prefer ALEX_PERSONAL_PHONE env var

async function sendTelegramRaw(token, chatId, text, markdown = true) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = { chat_id: chatId, text, disable_web_page_preview: true };
    if (markdown) payload.parse_mode = "Markdown";
    const r = await axios.post(url, payload, { timeout: 10000 });
    return r.data?.ok === true;
}

async function sendSMSFallback(body) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    const to = process.env.ALEX_PERSONAL_PHONE || ALEX_PERSONAL_FALLBACK;

    if (!sid || !tok || !from) {
        functions.logger.warn("SMS fallback: Twilio env vars not set, cannot escalate.");
        return false;
    }
    try {
        const r = await axios.post(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            new URLSearchParams({ From: from, To: to, Body: body.slice(0, 320) }).toString(),
            {
                auth: { username: sid, password: tok },
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 15000,
            }
        );
        return !!r.data?.sid;
    } catch (err) {
        functions.logger.error("SMS fallback failed:", err.response?.data || err.message);
        return false;
    }
}

/**
 * notify(text, { critical = false, markdown = true })
 * Returns { telegram: bool, sms: bool|null }.
 */
async function notify(text, opts = {}) {
    const { critical = false, markdown = true } = opts;
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;

    // Telegram 4096 char per message — chunk at 3800
    const chunks = [];
    for (let i = 0; i < text.length; i += 3800) chunks.push(text.slice(i, i + 3800));

    let tgAllOk = true;
    for (const chunk of chunks) {
        let ok = false;
        try {
            ok = await sendTelegramRaw(token, chatId, chunk, markdown);
        } catch (err) {
            ok = false;
        }
        if (!ok) {
            // Try again without Markdown (in case of encoding glitch)
            try { ok = await sendTelegramRaw(token, chatId, chunk, false); }
            catch (err) { ok = false; }
        }
        if (!ok) tgAllOk = false;
    }

    let smsOk = null;
    if (!tgAllOk && critical) {
        // Strip markdown for SMS readability
        const smsBody = text.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
        smsOk = await sendSMSFallback(`[JegoDigital ALERT] ${smsBody}`);
    }

    return { telegram: tgAllOk, sms: smsOk };
}

module.exports = { notify };
