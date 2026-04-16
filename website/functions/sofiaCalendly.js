/**
 * sofiaCalendly.js — Sofia LIVE booking flow (Calendly integration)
 *
 * Two HTTP endpoints called by Sofia (ElevenLabs Conversational AI) mid-call:
 *
 *   1. getAvailableSlots   → fetches real open Calendly slots (next 4–8)
 *      Sofia uses the result to propose 2 concrete times to the lead.
 *
 *   2. bookCalendlyLive    → when lead picks a time, builds a pre-filled
 *      single-tap Calendly URL, SMS'es it to the lead via Twilio, and emails
 *      Alex a pre-call briefing via Brevo so he walks into the call ready.
 *
 * Why not auto-create the event?
 *   Calendly does NOT expose programmatic /scheduled_events creation even on
 *   paid plans. The closest thing is a pre-filled scheduling URL — the lead
 *   taps once and the event is confirmed. Verified 2026-04-15.
 *
 * Required env (already mostly present in functions/.env):
 *   CALENDLY_PAT             = Calendly Personal Access Token
 *   CALENDLY_EVENT_TYPE_URI  = https://api.calendly.com/event_types/02474c29-9b41-4be3-b6cc-becc16f191b1
 *   TWILIO_ACCOUNT_SID       = $TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN        = $TWILIO_AUTH_TOKEN
 *   TWILIO_FROM              = $TWILIO_FROM
 *   BREVO_API_KEY            = (already in .env)
 *   BREVO_SENDER_EMAIL       = info@jegodigital.com (or any verified Brevo sender)
 *   ALEX_EMAIL               = jegoalexdigital@gmail.com
 */

const functions = require("firebase-functions");
const axios = require("axios");

// ---- CONFIG ---------------------------------------------------------------
const cfg = functions.config();
const CALENDLY_PAT        = process.env.CALENDLY_PAT             || cfg.calendly?.pat;
const CALENDLY_EVENT_TYPE = process.env.CALENDLY_EVENT_TYPE_URI  || cfg.calendly?.event_type_uri
                          || "https://api.calendly.com/event_types/02474c29-9b41-4be3-b6cc-becc16f191b1";

const TW_SID   = process.env.TWILIO_ACCOUNT_SID || cfg.twilio?.sid;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN  || cfg.twilio?.token;
const TW_FROM  = process.env.TWILIO_FROM        || cfg.twilio?.from || "$TWILIO_FROM";

const BREVO_KEY          = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com";
const ALEX_EMAIL         = process.env.ALEX_EMAIL         || "jegoalexdigital@gmail.com";

// ---- HELPERS --------------------------------------------------------------
/** Format ISO UTC as "jueves 17 de abril a las 10:00 AM (hora Cancún)" */
function formatSlotSpanish(isoUtc) {
    const d = new Date(isoUtc);
    const s = d.toLocaleString("es-MX", {
        timeZone: "America/Cancun",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
    return `${s} (hora Cancún)`;
}

/** Build Calendly pre-filled URL — lead taps once → event confirmed */
function buildPrefilledBookingUrl(slotSchedulingUrl, { name, email, phone, company }) {
    const url = new URL(slotSchedulingUrl);
    if (name)    url.searchParams.set("name", name);
    if (email)   url.searchParams.set("email", email);
    if (company) url.searchParams.set("a1", company);  // Calendly custom Q1
    if (phone)   url.searchParams.set("a2", phone);    // Calendly custom Q2
    return url.toString();
}

/** Email the lead their Calendly confirmation link via Brevo */
async function emailLeadBookingLink({ toEmail, toName, slotHuman, bookingUrl, companyName }) {
    if (!BREVO_KEY) throw new Error("BREVO_API_KEY missing");
    const firstName = (toName || "").split(" ")[0] || "";
    const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;background:#f7f7f8;">
  <div style="background:#0f1115;color:#fff;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <div style="color:#C5A059;font-size:13px;letter-spacing:1px;text-transform:uppercase;">JegoDigital</div>
    <h1 style="margin:8px 0 0 0;color:#fff;font-size:22px;">Confirme su llamada con Alex</h1>
  </div>
  <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;">
    <p style="margin-top:0;">Hola ${firstName},</p>
    <p>Soy Sofía del equipo de Alex Jego en JegoDigital. Como quedamos en la llamada, le reservé 15 minutos con Alex para <strong>${slotHuman}</strong>.</p>
    <p>Para confirmar, solo tiene que dar <strong>un clic</strong> en el botón de abajo. Sus datos ya están precargados:</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${bookingUrl}" style="background:#C5A059;color:#0f1115;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">✓ Confirmar mi llamada</a>
    </div>
    <p style="font-size:13px;color:#666;">Si el horario no le funciona, con el mismo enlace puede mover la cita a otro día.</p>
    <p style="font-size:13px;color:#666;">En la llamada, Alex le va a dar una mini-auditoría gratuita de cómo aparece ${companyName || "su inmobiliaria"} en Google y en ChatGPT, con números reales.</p>
    <p style="margin-top:28px;">Un saludo,<br><strong>Sofía</strong> — Equipo JegoDigital</p>
    <p style="margin-top:24px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:16px;">Si no puede hacer clic en el botón, copie y pegue este enlace en su navegador:<br><span style="word-break:break-all;">${bookingUrl}</span></p>
  </div>
</body></html>`.trim();

    const resp = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
            sender: { name: "Sofía — JegoDigital", email: BREVO_SENDER_EMAIL },
            to: [{ email: toEmail, name: toName }],
            subject: `Confirme su llamada con Alex — ${slotHuman}`,
            htmlContent: html,
            tags: ["sofia-booking", "lead-confirmation"],
        },
        {
            headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
            timeout: 10000,
        }
    );
    return resp.data;
}

/** Send pre-call briefing to Alex via Brevo */
async function emailBriefing(payload, bookingUrl, slotHuman) {
    if (!BREVO_KEY) {
        functions.logger.warn("BREVO_API_KEY missing — briefing email skipped");
        return null;
    }
    const urgency = (payload.urgency || "media").toLowerCase();
    const urgencyEmoji = urgency === "alta" ? "🔥" : urgency === "baja" ? "📋" : "⚡";

    const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px;background:#f7f7f8;">
  <div style="background:#0f1115;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <div style="color:#C5A059;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Sofia — Llamada Agendada</div>
    <h2 style="margin:4px 0 0 0;color:#fff;">${urgencyEmoji} ${payload.lead_name} — ${payload.company_name}</h2>
    <div style="margin-top:4px;color:#bbb;font-size:13px;">📅 <strong style="color:#C5A059;">${slotHuman}</strong></div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;">
    <h3 style="color:#0f1115;margin-top:0;">🎯 Pain Points</h3>
    <p style="background:#fff8ec;padding:12px;border-left:3px solid #C5A059;margin:0;">${payload.pain_points || "(no capturado)"}</p>

    <h3 style="color:#0f1115;margin-top:24px;">🛠 Servicios relevantes</h3>
    <p style="margin:0;">${payload.services_mentioned || "(no identificados)"}</p>

    <h3 style="color:#0f1115;margin-top:24px;">⚡ Urgencia</h3>
    <p style="margin:0;"><strong>${urgency.toUpperCase()}</strong></p>

    <h3 style="color:#0f1115;margin-top:24px;">📞 Datos del lead</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#666;width:100px;">Nombre:</td><td><strong>${payload.lead_name}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Empresa:</td><td><strong>${payload.company_name}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Teléfono:</td><td><a href="tel:${payload.lead_phone}" style="color:#0f1115;"><strong>${payload.lead_phone}</strong></a></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Correo:</td><td>${payload.lead_email || "<em>no proporcionado</em>"}</td></tr>
    </table>

    <div style="background:#f0f4f8;padding:16px;border-radius:6px;margin-top:24px;font-size:14px;">
      <strong>✅ Email enviado al lead con link de Calendly:</strong><br>
      <a href="${bookingUrl}" style="color:#0f1115;word-break:break-all;">${bookingUrl}</a><br><br>
      <strong>Próximo paso:</strong> Espera la notificación de Calendly cuando el lead confirme. Entra a esa llamada con los pain points arriba en mente.
    </div>

    <p style="margin-top:24px;font-size:12px;color:#999;">JegoDigital — Sofia Live Booking Pipeline</p>
  </div>
</body></html>`.trim();

    const resp = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
            sender: { name: "Sofia Booking Bot", email: BREVO_SENDER_EMAIL },
            to: [{ email: ALEX_EMAIL, name: "Alex Jego" }],
            subject: `${urgencyEmoji} Sofia agendó: ${payload.company_name} — ${slotHuman}`,
            htmlContent: html,
            tags: ["sofia-booking", "live-calendly"],
        },
        {
            headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
            timeout: 10000,
        }
    );
    return resp.data;
}

// ---- ENDPOINT 1: getAvailableSlots ---------------------------------------
// Sofia calls this MID-conversation to find real open times she can propose.
// Returns next ≤8 available slots (weekdays, Calendly's availability rules apply).
exports.getAvailableSlots = functions
    .runWith({ timeoutSeconds: 15, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            if (!CALENDLY_PAT) {
                return res.status(500).json({ ok: false, error: "CALENDLY_PAT not configured" });
            }

            const daysAhead = parseInt(req.body?.days_ahead || req.query?.days_ahead || "5", 10);
            const start = new Date();
            start.setUTCHours(start.getUTCHours() + 1); // earliest = now + 1h
            const end = new Date(start.getTime() + daysAhead * 86400000);

            // Calendly requires microsecond-precision ISO without millisecond padding
            const fmt = (d) => d.toISOString().replace(/\.\d{3}Z$/, ".000000Z");

            const { data } = await axios.get(
                "https://api.calendly.com/event_type_available_times",
                {
                    headers: {
                        Authorization: `Bearer ${CALENDLY_PAT}`,
                        "Content-Type": "application/json",
                    },
                    params: {
                        event_type: CALENDLY_EVENT_TYPE,
                        start_time: fmt(start),
                        end_time:   fmt(end),
                    },
                    timeout: 12000,
                }
            );

            const slots = (data.collection || [])
                .filter(s => s.status === "available")
                .slice(0, 8)
                .map(s => ({
                    iso:             s.start_time,
                    human:           formatSlotSpanish(s.start_time),
                    scheduling_url:  s.scheduling_url,
                }));

            functions.logger.info(`getAvailableSlots: returning ${slots.length} slots`);
            return res.status(200).json({ ok: true, count: slots.length, slots });
        } catch (err) {
            const e = err.response?.data || err.message;
            functions.logger.error("getAvailableSlots error", e);
            return res.status(500).json({ ok: false, error: err.message, details: e });
        }
    });

// ---- ENDPOINT 2: bookCalendlyLive ----------------------------------------
// Sofia calls this when the lead picks a slot. Emails lead + Alex briefing.
// NOTE: We use email (Brevo) instead of SMS — MX local numbers can't send SMS
// by carrier rule, and email gets better engagement from B2B decision-makers.
exports.bookCalendlyLive = functions
    .runWith({ timeoutSeconds: 20, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const body = req.body || {};
            // lead_email is REQUIRED now (Sofia confirms it on call)
            const required = ["lead_name", "lead_email", "company_name", "slot_scheduling_url", "slot_time"];
            for (const f of required) {
                if (!body[f]) return res.status(400).json({ ok: false, error: `Missing field: ${f}` });
            }

            const prefilled = buildPrefilledBookingUrl(body.slot_scheduling_url, {
                name:    body.lead_name,
                email:   body.lead_email,
                phone:   body.lead_phone,
                company: body.company_name,
            });
            const slotHuman = formatSlotSpanish(body.slot_time);

            // 1) Email the lead their one-tap booking link via Brevo
            let leadEmailResult = null, leadEmailError = null;
            try {
                leadEmailResult = await emailLeadBookingLink({
                    toEmail:     body.lead_email,
                    toName:      body.lead_name,
                    slotHuman,
                    bookingUrl:  prefilled,
                    companyName: body.company_name,
                });
                functions.logger.info(`✅ Lead confirmation email sent to ${body.lead_email}`);
            } catch (e) {
                leadEmailError = e?.response?.data || e.message;
                functions.logger.error("Lead email failed", leadEmailError);
            }

            // 2) Email Alex the briefing (non-blocking)
            let briefingResult = null, briefingError = null;
            try {
                briefingResult = await emailBriefing(body, prefilled, slotHuman);
            } catch (e) {
                briefingError = e?.response?.data || e.message;
                functions.logger.error("Briefing email failed", briefingError);
            }

            return res.status(200).json({
                ok: !!leadEmailResult,
                message: leadEmailResult
                    ? `Email de confirmación enviado a ${body.lead_email}. Alex notificado.`
                    : `Email al lead falló. Revisa logs.`,
                lead_email_sent:   !!leadEmailResult,
                lead_email_error:  leadEmailError,
                booking_url:       prefilled,
                slot_human:        slotHuman,
                briefing_sent:     !!briefingResult,
                briefing_error:    briefingError,
            });
        } catch (err) {
            functions.logger.error("bookCalendlyLive error", err?.response?.data || err.message);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });
