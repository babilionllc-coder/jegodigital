/**
 * Calendly Webhook Handler (v2 — with Brevo lead pipeline)
 *
 * Trigger: POST from Calendly on invitee.created / invitee.canceled
 *
 * On invitee.created:
 *   1. Firestore log → calendly_events collection
 *   2. Telegram alert to Alex (🔥 NUEVA CITA)
 *   3. Brevo internal briefing email → jegoalexdigital@gmail.com
 *   4. Brevo upsert lead contact → add to list "Calendly - Booked (Pre-call)" (ID 30)
 *      + attach attributes (WHATSAPP, PAIN_POINTS, WEBSITE, CALL_DATE, CALENDLY_LEAD=true)
 *   5. Send lead-facing "Confirmación + Preparación" email to the lead
 *
 * On invitee.canceled:
 *   1. Firestore log
 *   2. Telegram alert to Alex (❌ CANCELADA)
 *   3. Brevo upsert lead contact → move to list "Calendly - Canceled (Re-engage)" (ID 31)
 *      + remove from Booked list (30)
 *   4. Send lead-facing "Lamentamos que no pudiste — reagenda aquí" email
 *
 * On invitee.no_show (added 2026-04-15):
 *   1. Firestore log
 *   2. Telegram alert to Alex (🕳️ NO-SHOW)
 *   3. Brevo upsert lead contact → move to list "Calendly - No-Show (Recovery)" (ID 33)
 *      + remove from Booked list (30)
 *   4. Schedule 3 transactional emails (templates 37/38/39) at +3d, +7d, +14d
 *      (Calendly native workflow already sent the Day 0 "nos perdimos" immediate email)
 *
 * Env vars (via .env or functions:secrets:set):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 *   BREVO_API_KEY
 *   BREVO_SENDER_EMAIL (default: info@jegodigital.com)
 *   CALENDLY_WEBHOOK_SIGNING_KEY (optional)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

// Hardcoded fallbacks
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

// Calendly PAT (Standard plan — full scopes). Used to hydrate
// invitee_no_show payloads, which only contain {invitee: "uri"}.
const CALENDLY_PAT_FALLBACK = "eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzc2Mjg3MTQ3LCJqdGkiOiJlZDVhZjQ2Ny0zY2RjLTQ3ZWEtOWYwMi1lYTk4MmRlNWRiNTUiLCJ1c2VyX3V1aWQiOiI2ZjY5YTAxNC05ZWM5LTRmMTgtYTg2YS04MGIyMjAwNjMxMDQiLCJzY29wZSI6ImF2YWlsYWJpbGl0eTpyZWFkIGF2YWlsYWJpbGl0eTp3cml0ZSBldmVudF90eXBlczpyZWFkIGV2ZW50X3R5cGVzOndyaXRlIGxvY2F0aW9uczpyZWFkIHJvdXRpbmdfZm9ybXM6cmVhZCBzaGFyZXM6d3JpdGUgc2NoZWR1bGVkX2V2ZW50czpyZWFkIHNjaGVkdWxlZF9ldmVudHM6d3JpdGUgc2NoZWR1bGluZ19saW5rczp3cml0ZSBhY3Rpdml0eV9sb2c6cmVhZCBkYXRhX2NvbXBsaWFuY2U6d3JpdGUgb3V0Z29pbmdfY29tbXVuaWNhdGlvbnM6cmVhZCBncm91cHM6cmVhZCBvcmdhbml6YXRpb25zOnJlYWQgb3JnYW5pemF0aW9uczp3cml0ZSB1c2VyczpyZWFkIHdlYmhvb2tzOnJlYWQgd2ViaG9va3M6d3JpdGUifQ.4jV_zOYg3KkeX5WwkleTGOav7SaoH6zFzJfdaWq0Z5KHzcpkp79n279frZdrHtUxHca6Lp0Rr4Sie4rL9qVMZw";

// Brevo list IDs (created 2026-04-15)
const LIST_BOOKED = 30;   // "Calendly - Booked (Pre-call)"
const LIST_CANCELED = 31; // "Calendly - Canceled (Re-engage)"
const LIST_NO_SHOW = 33;  // "Calendly - No-Show (Recovery)"

// Brevo template IDs for no-show recovery sequence
// ES templates created 2026-04-15, EN templates added 2026-04-26 PM (language routing fix)
const TPL_NOSHOW_D3 = 37;     // Day 3 ES — value-add re-engagement
const TPL_NOSHOW_D7 = 38;     // Day 7 ES — soft breakup, 3-option reply
const TPL_NOSHOW_D14 = 39;    // Day 14 ES — final breakup + showcase asset
const TPL_NOSHOW_D3_EN = 68;  // Day 3 EN
const TPL_NOSHOW_D7_EN = 69;  // Day 7 EN
const TPL_NOSHOW_D14_EN = 70; // Day 14 EN

// Pick template by detected language (default ES — MX is primary market).
// Reads contact's LANG attribute from Brevo if available, otherwise heuristic on email.
function pickNoShowTemplate(day, lang) {
    const isEn = (lang || "").toLowerCase() === "en";
    if (day === 3)  return isEn ? TPL_NOSHOW_D3_EN  : TPL_NOSHOW_D3;
    if (day === 7)  return isEn ? TPL_NOSHOW_D7_EN  : TPL_NOSHOW_D7;
    if (day === 14) return isEn ? TPL_NOSHOW_D14_EN : TPL_NOSHOW_D14;
    return TPL_NOSHOW_D3; // safe default
}

const ALEX_WHATSAPP = "+52 998 202 3263";
const CALENDLY_LINK = "https://calendly.com/jegoalexdigital/30min";

// ---------- Helpers ----------

function toCancunDisplay(isoUtc) {
    if (!isoUtc) return "(sin fecha)";
    try {
        const d = new Date(isoUtc);
        const cancun = new Date(d.getTime() - 5 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, "0");
        const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        return `${days[cancun.getUTCDay()]} ${pad(cancun.getUTCDate())}/${pad(cancun.getUTCMonth() + 1)} · ${pad(cancun.getUTCHours())}:${pad(cancun.getUTCMinutes())} hrs (Cancún)`;
    } catch (e) {
        return isoUtc;
    }
}

/**
 * Fetch full invitee details from Calendly API.
 * Used for invitee_no_show.created events where the webhook payload only
 * contains {invitee: "uri"} — no email, no name, no scheduled_event data.
 * Returns normalized shape {name, email, whatsapp, painPoints, website,
 * event_start_time, event_name} or null on failure.
 */
async function fetchCalendlyInvitee(inviteeUri) {
    try {
        const token = process.env.CALENDLY_TOKEN || CALENDLY_PAT_FALLBACK;
        if (!inviteeUri || typeof inviteeUri !== "string") return null;
        const r = await axios.get(inviteeUri, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
        });
        const resource = r.data && r.data.resource ? r.data.resource : {};
        let eventStartTime = null, eventName = null;
        if (resource.scheduled_event) {
            try {
                const ev = await axios.get(resource.scheduled_event, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 10000,
                });
                const evRes = ev.data && ev.data.resource ? ev.data.resource : {};
                eventStartTime = evRes.start_time || null;
                eventName = evRes.name || null;
            } catch (e) {
                functions.logger.warn("fetchCalendlyInvitee: scheduled_event fetch failed:", e.message);
            }
        }
        const answers = parseAnswers(resource.questions_and_answers);
        return {
            name: resource.name || "",
            email: resource.email || "",
            whatsapp: answers["¿Cuál es tu número de WhatsApp?"] || "(no proporcionado)",
            painPoints: answers["¿Cuántos leads recibes al mes aproximadamente y cuál es tu mayor reto ahora mismo?"] || "(no proporcionado)",
            website: answers["¿Tienes sitio web? (optional)"] || answers["¿Tienes sitio web?"] || "(no proporcionado)",
            event_start_time: eventStartTime,
            event_name: eventName,
        };
    } catch (err) {
        functions.logger.error("fetchCalendlyInvitee failed:", err.message);
        return null;
    }
}

function parseAnswers(qna) {
    const out = {};
    if (!Array.isArray(qna)) return out;
    for (const { question, answer } of qna) {
        if (!question) continue;
        out[question] = answer || "";
    }
    return out;
}

function verifySignature(req, signingKey) {
    if (!signingKey) return true;
    const header = req.get("Calendly-Webhook-Signature");
    if (!header) return false;
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
    const { t, v1 } = parts;
    if (!t || !v1) return false;
    const signedPayload = `${t}.${JSON.stringify(req.body)}`;
    const expected = crypto.createHmac("sha256", signingKey).update(signedPayload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        const r = await axios.post(url, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (r.data?.ok) return { ok: true };
        const r2 = await axios.post(url, { chat_id: chatId, text }, { timeout: 10000 });
        return { ok: !!r2.data?.ok, fallback: "plaintext" };
    } catch (err) {
        functions.logger.error("Telegram send failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

/**
 * Upsert Brevo contact with attributes and list membership changes.
 */
async function upsertBrevoContact({ email, name, attributes, addToList = [], removeFromList = [] }) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY || !email) {
        return { ok: false, skipped: true, reason: !BREVO_KEY ? "no key" : "no email" };
    }
    try {
        const [first, ...rest] = (name || "").split(" ");
        const attrs = {
            FIRSTNAME: first || "",
            LASTNAME: rest.join(" ") || "",
            ...attributes,
        };
        const body = {
            email,
            attributes: attrs,
            listIds: addToList,
            unlinkListIds: removeFromList,
            updateEnabled: true,
        };
        const r = await axios.post("https://api.brevo.com/v3/contacts", body, {
            headers: {
                "api-key": BREVO_KEY,
                "Content-Type": "application/json",
                accept: "application/json",
            },
            timeout: 10000,
        });
        return { ok: true, data: r.data };
    } catch (err) {
        functions.logger.error("Brevo contact upsert failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

/**
 * Send a Brevo transactional email.
 */
async function sendBrevoEmail({ to, toName, subject, htmlBody, tags = [] }) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) {
        functions.logger.warn("BREVO_API_KEY not set — skipping email");
        return { ok: false, skipped: true };
    }
    const sender = {
        name: "Alex · JegoDigital",
        email: process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com",
    };
    try {
        const r = await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                sender,
                to: [{ email: to, name: toName || to }],
                subject,
                htmlContent: htmlBody,
                tags,
                replyTo: { email: "jegoalexdigital@gmail.com", name: "Alex Jego" },
            },
            {
                headers: {
                    "api-key": BREVO_KEY,
                    "Content-Type": "application/json",
                    accept: "application/json",
                },
                timeout: 10000,
            }
        );
        return { ok: true, messageId: r.data?.messageId };
    } catch (err) {
        functions.logger.error("Brevo email failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

/**
 * Schedule a Brevo transactional email using a saved template.
 * scheduledAtIso must be ISO8601 (UTC). Brevo accepts scheduledAt up to 72h
 * in the future via POST /v3/smtp/email — beyond 72h we fall back to storing
 * the schedule in Firestore and letting a nightly job fire it.
 */
async function scheduleBrevoTemplate({ to, toName, templateId, scheduledAtIso, tags = [], params = {} }) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) {
        return { ok: false, skipped: true, reason: "no key" };
    }
    try {
        const r = await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                to: [{ email: to, name: toName || to }],
                templateId,
                params,
                tags,
                scheduledAt: scheduledAtIso,
                replyTo: { email: "jegoalexdigital@gmail.com", name: "Alex Jego" },
            },
            {
                headers: {
                    "api-key": BREVO_KEY,
                    "Content-Type": "application/json",
                    accept: "application/json",
                },
                timeout: 10000,
            }
        );
        return { ok: true, messageId: r.data?.messageId };
    } catch (err) {
        functions.logger.error(
            `Brevo schedule template ${templateId} failed:`,
            err.response?.data || err.message
        );
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Email templates (lead-facing) ----------

function leadPrecallEmailHtml({ firstName, startDisplay, painPoints }) {
    const painBlock = painPoints && painPoints !== "(no proporcionado)" ? `
    <p style="margin: 24px 0 8px 0; color: #0f1115; font-weight: 600;">Esto es lo que me contaste:</p>
    <p style="background: #fff8ec; border-left: 3px solid #C5A059; padding: 14px 16px; margin: 0 0 24px 0; font-style: italic;">${painPoints}</p>
    <p>Voy a llegar a la llamada con ideas concretas para ese reto.</p>` : "";

    return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, sans-serif; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px; background: #f7f7f8;">
  <div style="background: #0f1115; color: #fff; padding: 24px 28px; border-radius: 8px 8px 0 0;">
    <div style="color: #C5A059; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">JegoDigital · Confirmación</div>
    <h1 style="margin: 8px 0 0 0; color: #fff; font-size: 24px; line-height: 1.3;">Nos vemos ${startDisplay}</h1>
  </div>
  <div style="background: #fff; padding: 28px; border-radius: 0 0 8px 8px;">
    <p>Hola ${firstName || ""},</p>
    <p>Gracias por agendar. Te confirmo nuestra llamada de <strong>15 minutos</strong> el <strong>${startDisplay}</strong>.</p>
    ${painBlock}
    <p style="margin: 24px 0 8px 0; color: #0f1115; font-weight: 600;">Qué vamos a hacer en esos 15 minutos:</p>
    <ul style="padding-left: 18px; margin: 0 0 24px 0;">
      <li style="margin-bottom: 6px;">Entender dónde está tu inmobiliaria hoy y qué te está frenando</li>
      <li style="margin-bottom: 6px;">Revisar 1–2 casos parecidos al tuyo (Flamingo Real Estate: 4.4x más visibilidad · GoodLife Tulum: +300% tráfico)</li>
      <li>Decirte exactamente qué haría yo en tu lugar — con o sin trabajar juntos</li>
    </ul>
    <p style="margin: 24px 0 8px 0; color: #0f1115; font-weight: 600;">Para que la llamada sea lo más útil posible:</p>
    <ul style="padding-left: 18px; margin: 0 0 24px 0;">
      <li style="margin-bottom: 6px;">Ten a la mano tu número de leads mensuales aproximado</li>
      <li style="margin-bottom: 6px;">Piensa en cuántos de esos leads cierran</li>
      <li>Identifica tu principal fuga de tiempo en seguimiento</li>
    </ul>
    <div style="background: #f0f4f8; padding: 16px 18px; border-radius: 6px; margin-top: 28px; font-size: 14px;">
      <strong>¿Necesitas reagendar o tienes una duda antes?</strong><br>
      WhatsApp directo: <a href="https://wa.me/529982023263" style="color: #0f1115;">${ALEX_WHATSAPP}</a>
    </div>
    <p style="margin-top: 28px;">Nos vemos pronto.</p>
    <p style="margin: 0;">Alex<br><span style="color: #888; font-size: 13px;">JegoDigital</span></p>
  </div>
</body>
</html>`.trim();
}

function leadCanceledEmailHtml({ firstName }) {
    return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, sans-serif; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px; background: #f7f7f8;">
  <div style="background: #0f1115; color: #fff; padding: 24px 28px; border-radius: 8px 8px 0 0;">
    <div style="color: #C5A059; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">JegoDigital</div>
    <h1 style="margin: 8px 0 0 0; color: #fff; font-size: 22px; line-height: 1.3;">¿Cuando te queda mejor, ${firstName || ""}?</h1>
  </div>
  <div style="background: #fff; padding: 28px; border-radius: 0 0 8px 8px;">
    <p>Hola ${firstName || ""},</p>
    <p>Vi que tuviste que cancelar — sin problema, la vida pasa.</p>
    <p>Si todavía quieres esos 15 minutos para revisar cómo generar más leads para tu inmobiliaria, tienes dos formas de reagendar:</p>
    <p style="margin: 24px 0;">
      <a href="${CALENDLY_LINK}" style="background: #C5A059; color: #0f1115; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Reagendar en 30 segundos</a>
    </p>
    <p>O escríbeme directo al WhatsApp y lo acomodamos: <a href="https://wa.me/529982023263" style="color: #0f1115;"><strong>${ALEX_WHATSAPP}</strong></a></p>
    <p style="margin-top: 28px; color: #666; font-size: 14px;">Por contexto rápido de por qué vale la pena: ayudamos a <strong>GoodLife Tulum a subir 300%</strong> su tráfico orgánico y a <strong>Flamingo Real Estate a alcanzar 4.4x más visibilidad</strong> en búsquedas. 15 minutos y sabes si tiene sentido para ti.</p>
    <p style="margin-top: 24px;">Cuando puedas,</p>
    <p style="margin: 0;">Alex<br><span style="color: #888; font-size: 13px;">JegoDigital</span></p>
  </div>
</body>
</html>`.trim();
}

// ---------- Main handler ----------

exports.calendlyWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method === "GET") {
        return res.status(200).send("Calendly webhook endpoint — POST only");
    }
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
        if (signingKey && !verifySignature(req, signingKey)) {
            functions.logger.warn("⚠️ Calendly webhook signature verification failed");
            return res.status(401).json({ error: "Invalid signature" });
        }

        const body = req.body || {};
        const eventType = body.event;
        const payload = body.payload || {};
        const scheduled = payload.scheduled_event || {};

        functions.logger.info(`📅 Calendly ${eventType}`, {
            email: payload.email, name: payload.name, start: scheduled.start_time,
        });

        const name = (payload.name || "").trim() || "Lead sin nombre";
        const firstName = name.split(" ")[0];
        const email = (payload.email || "").trim();
        const startUtc = scheduled.start_time;
        const endUtc = scheduled.end_time;
        const startDisplay = toCancunDisplay(startUtc);
        const rescheduleUrl = payload.reschedule_url || "";
        const cancelUrl = payload.cancel_url || "";
        const eventName = scheduled.name || "Consulta";

        const answers = parseAnswers(payload.questions_and_answers);
        const whatsapp = answers["¿Cuál es tu número de WhatsApp?"] || "(no proporcionado)";
        const painPoints = answers["¿Cuántos leads recibes al mes aproximadamente y cuál es tu mayor reto ahora mismo?"] || "(no proporcionado)";
        const website = answers["¿Tienes sitio web? (optional)"] || answers["¿Tienes sitio web?"] || "(no proporcionado)";

        // Calendly UTM tracking — populated by the ManyChat pre-filled URL
        // (see calendly.js buildPrefilledUrl). Used to identify WA-sourced
        // bookings for the T-10min WhatsApp reminder.
        const tracking = payload.tracking || {};
        const utmSource = tracking.utm_source || "";
        const manychatSubscriberId = tracking.utm_content || "";
        const bookedViaWhatsApp = utmSource === "manychat_whatsapp" && !!manychatSubscriberId;

        const db = admin.firestore();
        let calendlyEventRef = null;
        try {
            calendlyEventRef = await db.collection("calendly_events").add({
                event_type: eventType,
                invitee_name: name, invitee_email: email, event_name: eventName,
                start_time_utc: startUtc || null, end_time_utc: endUtc || null,
                whatsapp, pain_points: painPoints, website,
                reschedule_url: rescheduleUrl, cancel_url: cancelUrl,
                utm_source: utmSource,
                manychat_subscriber_id: manychatSubscriberId,
                booked_via: bookedViaWhatsApp ? "whatsapp" : "direct",
                t10min_sent: false,  // scanned by sendT10minReminders
                raw_payload: body,
                processed_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (dbErr) {
            functions.logger.warn("Firestore log failed:", dbErr.message);
        }

        // ========== invitee.created ==========
        if (eventType === "invitee.created") {
            const tgText =
                `🔥 *NUEVA CITA AGENDADA*\n\n` +
                `👤 *${name}*\n📅 ${startDisplay}\n📧 ${email}\n📱 WhatsApp: \`${whatsapp}\`\n🌐 Web: ${website}\n\n` +
                `🎯 *Reto principal:*\n${painPoints}\n\n_Evento: ${eventName}_`;
            const tgResult = await sendTelegram(tgText);

            // CALL_DATE needs YYYY-MM-DD format for Brevo date attr
            const callDateOnly = startUtc ? new Date(startUtc).toISOString().slice(0, 10) : "";
            // Clean WhatsApp for SMS attr (digits only, no + or spaces)
            const smsClean = whatsapp !== "(no proporcionado)" ? whatsapp.replace(/[^0-9]/g, "") : "";
            const brevoResult = await upsertBrevoContact({
                email, name,
                attributes: {
                    ...(smsClean && { SMS: smsClean }),
                    ...(website !== "(no proporcionado)" && { WEBSITE_URL: website }),
                    ...(painPoints !== "(no proporcionado)" && { PAIN_POINTS: painPoints }),
                    ...(callDateOnly && { CALL_DATE: callDateOnly }),
                    LEAD_SOURCE: "Calendly",
                    LEAD_TEMPERATURE: "Hot",
                    CAMPAIGN_SOURCE: "Calendly-Booked",
                },
                addToList: [LIST_BOOKED],
                removeFromList: [LIST_CANCELED],
            });

            const leadEmailResult = email ? await sendBrevoEmail({
                to: email, toName: name,
                subject: `Confirmado: nos vemos ${startDisplay.split(" · ")[0]} · JegoDigital`,
                htmlBody: leadPrecallEmailHtml({ firstName, startDisplay, painPoints }),
                tags: ["calendly-booked", "pre-call"],
            }) : { ok: false, skipped: true, reason: "no lead email" };

            const briefingHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px; background: #f7f7f8;">
  <div style="background: #0f1115; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <div style="color: #C5A059; font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">Calendly · Nueva cita confirmada</div>
    <h2 style="margin: 4px 0 0 0; color: #fff;">🔥 ${name}</h2>
    <div style="margin-top: 6px; color: #bbb; font-size: 14px;">${startDisplay}</div>
  </div>
  <div style="background: #fff; padding: 24px; border-radius: 0 0 8px 8px;">
    <h3 style="color: #0f1115; margin-top: 0;">🎯 Reto principal del lead</h3>
    <p style="background: #fff8ec; padding: 12px; border-left: 3px solid #C5A059; margin: 0;">${painPoints}</p>
    <h3 style="color: #0f1115; margin-top: 24px;">📞 Datos de contacto</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666; width: 140px;">Nombre:</td><td><strong>${name}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Email:</td><td><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">WhatsApp:</td><td><strong>${whatsapp}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Sitio web:</td><td>${website}</td></tr>
    </table>
    <h3 style="color: #0f1115; margin-top: 24px;">📅 Evento</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666; width: 140px;">Evento:</td><td>${eventName}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Fecha/hora:</td><td><strong>${startDisplay}</strong></td></tr>
      ${rescheduleUrl ? `<tr><td style="padding: 6px 0; color: #666;">Reagendar:</td><td><a href="${rescheduleUrl}">Link</a></td></tr>` : ""}
      ${cancelUrl ? `<tr><td style="padding: 6px 0; color: #666;">Cancelar:</td><td><a href="${cancelUrl}">Link</a></td></tr>` : ""}
    </table>
    <div style="background: #f0f4f8; padding: 16px; border-radius: 6px; margin-top: 24px; font-size: 14px;">
      <strong>✅ Preparación antes de la llamada:</strong><br>
      1. Revisa el sitio ${website !== "(no proporcionado)" ? `<a href="${website}">${website}</a>` : "(sin web)"}<br>
      2. Abre ChatGPT y busca su nombre + empresa<br>
      3. Ten los casos de éxito listos (Flamingo 4.4x, GoodLife 300%)<br>
      4. Anchor: ofrece la instalación gratis de Captura de Leads 24/7
    </div>
    <div style="background: #eaf6ee; padding: 14px; border-radius: 6px; margin-top: 16px; font-size: 13px; color: #256029;">
      ✉️ El lead ya recibió su email de confirmación + preparación (Brevo list ${LIST_BOOKED}).
    </div>
  </div>
</body>
</html>`.trim();

            const briefingResult = await sendBrevoEmail({
                to: "jegoalexdigital@gmail.com", toName: "Alex Jego",
                subject: `🔥 Nueva cita: ${firstName} — ${startDisplay}`,
                htmlBody: briefingHtml,
                tags: ["calendly-briefing", "internal"],
            });

            // Cancel any pending Brevo nurture touches for this email —
            // they booked, nurture goal is achieved.
            let nurtureCanceled = 0;
            try {
                if (email) {
                    const brevoNurture = require("./brevoNurture");
                    const c = await brevoNurture.cancelTrackForEmail(email, "calendly_booked");
                    nurtureCanceled = c.canceled || 0;
                    if (nurtureCanceled > 0) {
                        functions.logger.info(`Canceled ${nurtureCanceled} pending nurture touches for ${email}`);
                    }
                }
            } catch (cancelErr) {
                functions.logger.warn("nurture cancel on booking failed:", cancelErr.message);
            }

            return res.status(200).json({
                success: true, event: eventType,
                telegram: tgResult.ok,
                brevo_contact: brevoResult.ok,
                lead_email: leadEmailResult.ok,
                briefing_email: briefingResult.ok,
                nurture_canceled: nurtureCanceled,
            });
        }

        // ========== invitee.canceled ==========
        if (eventType === "invitee.canceled") {
            const cancelReason = payload.cancellation?.reason || "(sin razón)";
            const canceledBy = payload.cancellation?.canceled_by || "invitee";

            const tgText =
                `❌ *CITA CANCELADA*\n\n👤 ${name}\n📅 Era: ${startDisplay}\n📧 ${email}\n\n_Canceló: ${canceledBy}_\n_Razón: ${cancelReason}_`;
            await sendTelegram(tgText);

            const brevoResult = await upsertBrevoContact({
                email, name,
                attributes: {
                    LEAD_TEMPERATURE: "Canceled",
                    CANCEL_REASON: cancelReason,
                    CANCEL_BY: canceledBy,
                    CAMPAIGN_SOURCE: "Calendly-Canceled",
                },
                addToList: [LIST_CANCELED],
                removeFromList: [LIST_BOOKED],
            });

            let leadEmailResult = { ok: false, skipped: true };
            if (email && canceledBy !== "host") {
                leadEmailResult = await sendBrevoEmail({
                    to: email, toName: name,
                    subject: `¿Cuando te queda mejor, ${firstName}?`,
                    htmlBody: leadCanceledEmailHtml({ firstName }),
                    tags: ["calendly-canceled", "re-engage"],
                });
            }

            return res.status(200).json({
                success: true, event: eventType, reason: cancelReason,
                brevo_contact: brevoResult.ok,
                lead_email: leadEmailResult.ok,
            });
        }

        // ========== invitee_no_show.created ==========
        if (eventType === "invitee_no_show.created" || eventType === "invitee.no_show") {
            // Calendly sends only {invitee: {uri}} here — hydrate from API
            let hydrated = null;
            const inviteeUri =
                (payload.invitee && payload.invitee.uri) ||
                (typeof payload.invitee === "string" ? payload.invitee : null);
            if (!email && inviteeUri) {
                hydrated = await fetchCalendlyInvitee(inviteeUri);
                functions.logger.info(`No-show hydrated from ${inviteeUri}:`, {
                    email: hydrated?.email, name: hydrated?.name,
                });
                // Patch the calendly_events doc we wrote with empty fields
                if (calendlyEventRef && hydrated) {
                    try {
                        await calendlyEventRef.update({
                            invitee_name: hydrated.name || "Lead sin nombre",
                            invitee_email: hydrated.email || "",
                            event_name: hydrated.event_name || "Consulta",
                            start_time_utc: hydrated.event_start_time || null,
                            whatsapp: hydrated.whatsapp || "(no proporcionado)",
                            pain_points: hydrated.painPoints || "(no proporcionado)",
                            website: hydrated.website || "(no proporcionado)",
                            hydrated_from_api: true,
                        });
                    } catch (upErr) {
                        functions.logger.warn("Failed to patch calendly_events with hydrated data:", upErr.message);
                    }
                }
            }
            const nsName = (hydrated?.name || name || "").trim() || "Lead sin nombre";
            const nsFirstName = nsName.split(" ")[0];
            const nsEmail = (hydrated?.email || email || "").trim();
            const nsStartUtc = hydrated?.event_start_time || startUtc || null;
            const nsStartDisplay = toCancunDisplay(nsStartUtc);
            const nsWhatsapp = hydrated?.whatsapp || whatsapp;

            const tgText =
                `🕳️ *NO-SHOW*\n\n👤 ${nsName}\n📅 Era: ${nsStartDisplay}\n📧 ${nsEmail || "(sin email)"}\n📱 ${nsWhatsapp}\n\n` +
                `_Calendly ya envió el email inmediato "nos perdimos"._\n_Secuencia Brevo +3d/+7d/+14d agendada._`;
            await sendTelegram(tgText);

            // Detect language from email + name + already-stored Brevo LANG attribute
            // (added 2026-04-26 PM language routing fix). Heuristic identical to
            // brevoNurture.detectLang() — TLD + name + business keywords.
            const _emLower = (nsEmail || "").toLowerCase();
            const _domain = _emLower.includes("@") ? _emLower.split("@")[1] : "";
            const _fnLower = (nsFirstName || "").toLowerCase();
            const _esTld = [".mx",".com.mx",".es",".com.ar",".com.co",".cl",".pe"].some(s => _domain.endsWith(s));
            const _esKw = ["inmobiliaria","casas","bienes","cancun","merida","tulum","propiedades"].some(k => _domain.includes(k));
            const _esNames = new Set(["jose","maria","juan","luis","carlos","jorge","alejandro","francisco","manuel","priscila","leticia","monica","carolina","gabriela"]);
            const _enNames = new Set(["mitch","stephen","cambria","susan","claire","melody","olivia","jaquelin","heather","cheryl","john","michael","james","jennifer","mary"]);
            let nsLang = "es";
            if (_esTld || _esKw) nsLang = "es";
            else if (_enNames.has(_fnLower) && !_esNames.has(_fnLower)) nsLang = "en";
            else if (_esNames.has(_fnLower) && !_enNames.has(_fnLower)) nsLang = "es";
            else if (_domain.endsWith(".com") || _domain.endsWith(".net") || _domain.endsWith(".io")) nsLang = "en";

            const brevoResult = await upsertBrevoContact({
                email: nsEmail, name: nsName,
                attributes: {
                    LEAD_TEMPERATURE: "No-Show",
                    CAMPAIGN_SOURCE: "Calendly-NoShow",
                    NO_SHOW_DATE: nsStartUtc ? new Date(nsStartUtc).toISOString().slice(0, 10) : "",
                    LANG: nsLang,
                },
                addToList: [LIST_NO_SHOW],
                removeFromList: [LIST_BOOKED],
            });

            // Queue the 3-email recovery sequence (+3d, +7d, +14d from now).
            // Brevo's scheduledAt reliably supports up to ~72h, so we write all
            // three to Firestore and let a nightly scheduler (see
            // exports.processScheduledEmails) dispatch them at T-0.
            // 2026-04-26 PM: now language-aware — picks EN templates 68/69/70 if nsLang=en.
            const scheduleResults = [];
            if (nsEmail) {
                const now = Date.now();
                const queue = [
                    { templateId: pickNoShowTemplate(3,  nsLang), delayMs: 3  * 24 * 60 * 60 * 1000, tag: `no-show-d3-${nsLang}` },
                    { templateId: pickNoShowTemplate(7,  nsLang), delayMs: 7  * 24 * 60 * 60 * 1000, tag: `no-show-d7-${nsLang}` },
                    { templateId: pickNoShowTemplate(14, nsLang), delayMs: 14 * 24 * 60 * 60 * 1000, tag: `no-show-d14-${nsLang}` },
                ];
                for (const item of queue) {
                    try {
                        const sendAt = new Date(now + item.delayMs);
                        await db.collection("scheduled_emails").add({
                            to_email: nsEmail,
                            to_name: nsName,
                            template_id: item.templateId,
                            tag: item.tag,
                            campaign: "no-show-recovery",
                            send_at: admin.firestore.Timestamp.fromDate(sendAt),
                            status: "pending",
                            params: {
                                FIRSTNAME: nsFirstName,
                                ORIGINAL_CALL: nsStartDisplay,
                            },
                            created_at: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        scheduleResults.push({ tag: item.tag, ok: true, send_at: sendAt.toISOString() });
                    } catch (qErr) {
                        functions.logger.error(`Queue no-show email ${item.tag} failed:`, qErr.message);
                        scheduleResults.push({ tag: item.tag, ok: false, error: qErr.message });
                    }
                }
            }

            return res.status(200).json({
                success: true, event: eventType,
                brevo_contact: brevoResult.ok,
                scheduled_emails: scheduleResults,
            });
        }

        functions.logger.info(`ℹ️ Unhandled Calendly event: ${eventType}`);
        return res.status(200).json({ success: true, event: eventType, action: "ignored" });
    } catch (err) {
        functions.logger.error("calendlyWebhook error:", err);
        return res.status(200).json({ success: false, error: err.message });
    }
});

/**
 * Process the `scheduled_emails` Firestore queue.
 * Fires every hour via Cloud Scheduler. Picks up every doc where
 * status=pending AND send_at <= now, dispatches via Brevo templateId,
 * marks as sent/failed.
 *
 * Used by the no-show recovery sequence (templates 37/38/39 at +3/+7/+14 days)
 * and any future scheduled transactional send.
 */
exports.processScheduledEmails = functions.pubsub
    .schedule("every 1 hours")
    .timeZone("America/Cancun")
    .onRun(async () => {
        const db = admin.firestore();
        const now = admin.firestore.Timestamp.now();
        const BREVO_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_KEY) {
            functions.logger.warn("processScheduledEmails: BREVO_API_KEY not set, skipping");
            return null;
        }

        const snap = await db.collection("scheduled_emails")
            .where("status", "==", "pending")
            .where("send_at", "<=", now)
            .limit(50)
            .get();

        functions.logger.info(`processScheduledEmails: ${snap.size} due`);
        if (snap.empty) return null;

        let sent = 0, failed = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            try {
                const r = await axios.post(
                    "https://api.brevo.com/v3/smtp/email",
                    {
                        to: [{ email: data.to_email, name: data.to_name || data.to_email }],
                        templateId: data.template_id,
                        params: data.params || {},
                        tags: [data.tag, data.campaign].filter(Boolean),
                        replyTo: { email: "jegoalexdigital@gmail.com", name: "Alex Jego" },
                    },
                    {
                        headers: {
                            "api-key": BREVO_KEY,
                            "Content-Type": "application/json",
                            accept: "application/json",
                        },
                        timeout: 10000,
                    }
                );
                await doc.ref.update({
                    status: "sent",
                    sent_at: admin.firestore.FieldValue.serverTimestamp(),
                    message_id: r.data?.messageId || null,
                });
                sent++;
            } catch (err) {
                const errBody = err.response?.data || err.message;
                functions.logger.error(
                    `processScheduledEmails failed for ${doc.id} (template ${data.template_id}):`,
                    errBody
                );
                await doc.ref.update({
                    status: "failed",
                    error: typeof errBody === "string" ? errBody : JSON.stringify(errBody),
                    failed_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                failed++;
            }
        }
        functions.logger.info(`processScheduledEmails: sent=${sent} failed=${failed}`);
        return null;
    });

/**
 * T-10min WhatsApp ping for WA-sourced Calendly bookings.
 *
 * Runs every 5 minutes. Scans `calendly_events` for bookings where:
 *   - booked_via == "whatsapp"
 *   - manychat_subscriber_id is set
 *   - t10min_sent == false
 *   - start_time_utc falls inside the window [now+8min, now+13min]
 *
 * Sends a direct text via ManyChat Send API (subscriber is inside 24h
 * WhatsApp window because they just booked). Marks t10min_sent=true
 * to prevent duplicates.
 *
 * ManyChat API: POST /fb/sending/sendContent
 * Auth: Bearer {page_id}:{token} — see /mnt/.auto-memory/manychat_api.md
 */
const MANYCHAT_API_KEY_FALLBACK = "4452446:3087cff5cd2911df296207292b034b12";

exports.sendT10minReminders = functions.pubsub
    .schedule("every 5 minutes")
    .timeZone("America/Cancun")
    .onRun(async () => {
        const db = admin.firestore();
        const mcKey = process.env.MANYCHAT_API_KEY || MANYCHAT_API_KEY_FALLBACK;
        if (!mcKey) {
            functions.logger.warn("sendT10minReminders: no ManyChat key, skipping");
            return null;
        }

        const now = Date.now();
        const windowStart = new Date(now + 8 * 60 * 1000).toISOString();
        const windowEnd = new Date(now + 13 * 60 * 1000).toISOString();

        const snap = await db.collection("calendly_events")
            .where("booked_via", "==", "whatsapp")
            .where("t10min_sent", "==", false)
            .where("start_time_utc", ">=", windowStart)
            .where("start_time_utc", "<=", windowEnd)
            .limit(20)
            .get();

        functions.logger.info(`sendT10minReminders: ${snap.size} due in window [${windowStart}, ${windowEnd}]`);
        if (snap.empty) return null;

        let sent = 0, failed = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            const subscriberId = data.manychat_subscriber_id;
            const firstName = (data.invitee_name || "").split(" ")[0] || "";
            if (!subscriberId) {
                await doc.ref.update({ t10min_sent: true, t10min_skipped: "no subscriber_id" });
                continue;
            }

            const text =
                `Hola ${firstName} 👋\n\n` +
                `Solo te recuerdo que nuestra llamada con Alex empieza en 10 minutos. 🕐\n\n` +
                `Únete aquí cuando estés listo 👉 ${CALENDLY_LINK}\n\n` +
                `¡Nos vemos!`;

            try {
                const r = await axios.post(
                    "https://api.manychat.com/fb/sending/sendContent",
                    {
                        subscriber_id: subscriberId,
                        data: {
                            version: "v2",
                            content: {
                                messages: [{ type: "text", text }],
                            },
                        },
                        message_tag: "ACCOUNT_UPDATE",
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${mcKey}`,
                            "Content-Type": "application/json",
                        },
                        timeout: 10000,
                    }
                );
                await doc.ref.update({
                    t10min_sent: true,
                    t10min_sent_at: admin.firestore.FieldValue.serverTimestamp(),
                    t10min_result: r.data?.status || "sent",
                });
                sent++;
            } catch (err) {
                const errBody = err.response?.data || err.message;
                functions.logger.error(
                    `T-10min ping failed for ${doc.id} (sub ${subscriberId}):`,
                    errBody
                );
                // Mark sent anyway to avoid retry loop — meeting starts in <10min
                await doc.ref.update({
                    t10min_sent: true,
                    t10min_error: typeof errBody === "string" ? errBody : JSON.stringify(errBody),
                    t10min_failed_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                failed++;
            }
        }
        functions.logger.info(`sendT10minReminders: sent=${sent} failed=${failed}`);
        return null;
    });
