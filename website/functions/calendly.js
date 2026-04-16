/**
 * Calendly in-chat booking endpoint for ManyChat
 *
 * Returns a ManyChat Dynamic Block (v2) with the next 3 available slots
 * as URL buttons. Each URL is a pre-filled Calendly scheduling link so
 * the prospect confirms in 1 tap — name, email, WhatsApp, custom answers
 * all auto-populated.
 *
 * GET /getCalendlySlots?name=...&email=...&whatsapp=...&leads_info=...&website=...
 *
 * Response: ManyChat v2 dynamic content JSON.
 *
 * Configure Calendly token via:
 *   firebase functions:config:set calendly.token="eyJra..."
 *   firebase functions:config:set calendly.event_type_uri="https://api.calendly.com/event_types/02474c29-9b41-4be3-b6cc-becc16f191b1"
 */

const functions = require("firebase-functions");
const axios = require("axios");

// Fallbacks so the function is deployable even if config is missing.
// Overridden by `firebase functions:config:set calendly.token=...`
const FALLBACK_TOKEN = "eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzc2Mjg3MTQ3LCJqdGkiOiJlZDVhZjQ2Ny0zY2RjLTQ3ZWEtOWYwMi1lYTk4MmRlNWRiNTUiLCJ1c2VyX3V1aWQiOiI2ZjY5YTAxNC05ZWM5LTRmMTgtYTg2YS04MGIyMjAwNjMxMDQiLCJzY29wZSI6ImF2YWlsYWJpbGl0eTpyZWFkIGF2YWlsYWJpbGl0eTp3cml0ZSBldmVudF90eXBlczpyZWFkIGV2ZW50X3R5cGVzOndyaXRlIGxvY2F0aW9uczpyZWFkIHJvdXRpbmdfZm9ybXM6cmVhZCBzaGFyZXM6d3JpdGUgc2NoZWR1bGVkX2V2ZW50czpyZWFkIHNjaGVkdWxlZF9ldmVudHM6d3JpdGUgc2NoZWR1bGluZ19saW5rczp3cml0ZSBhY3Rpdml0eV9sb2c6cmVhZCBkYXRhX2NvbXBsaWFuY2U6d3JpdGUgb3V0Z29pbmdfY29tbXVuaWNhdGlvbnM6cmVhZCBncm91cHM6cmVhZCBvcmdhbml6YXRpb25zOnJlYWQgb3JnYW5pemF0aW9uczp3cml0ZSB1c2VyczpyZWFkIHdlYmhvb2tzOnJlYWQgd2ViaG9va3M6d3JpdGUifQ.4jV_zOYg3KkeX5WwkleTGOav7SaoH6zFzJfdaWq0Z5KHzcpkp79n279frZdrHtUxHca6Lp0Rr4Sie4rL9qVMZw";
const FALLBACK_EVENT_URI = "https://api.calendly.com/event_types/02474c29-9b41-4be3-b6cc-becc16f191b1";
const DISPLAY_TZ = "America/Cancun";

const getConfig = () => {
  let cfg = {};
  try {
    cfg = functions.config().calendly || {};
  } catch (e) {
    cfg = {};
  }
  return {
    token: cfg.token || FALLBACK_TOKEN,
    eventUri: cfg.event_type_uri || FALLBACK_EVENT_URI,
  };
};

// Short Spanish weekday abbreviations — matches Calendly/WhatsApp button limits
const DAY_ABBR = {
  0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié",
  4: "Jue", 5: "Vie", 6: "Sáb",
};

/**
 * Format a UTC ISO string as "Mié 9:00 AM" in America/Cancun.
 * 11–13 chars — safely under the 20-char IG/WA button limit.
 */
const formatSlotLabel = (isoUtc) => {
  const d = new Date(isoUtc);
  // Get Cancun-local date parts via Intl
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const weekdayEn = parts.find((p) => p.type === "weekday").value; // "Wed"
  const hour = parts.find((p) => p.type === "hour").value;
  const minute = parts.find((p) => p.type === "minute").value;
  const ampm = parts.find((p) => p.type === "dayPeriod").value.toUpperCase();

  // Map EN short weekday to Spanish short
  const enToEs = { Sun: "Dom", Mon: "Lun", Tue: "Mar", Wed: "Mié", Thu: "Jue", Fri: "Vie", Sat: "Sáb" };
  const weekdayEs = enToEs[weekdayEn] || weekdayEn;

  return `${weekdayEs} ${hour}:${minute} ${ampm}`;
};

/**
 * Build the pre-filled Calendly URL so the prospect only needs to confirm.
 */
const buildPrefilledUrl = (schedulingUrl, q) => {
  const params = new URLSearchParams();
  const name = [q.name, q.first_name, q.full_name].find((v) => v && v.trim());
  if (name) params.set("name", name.trim());
  if (q.email) params.set("email", q.email.trim());
  // Event custom questions (order from /event_types response):
  //   a1 = "¿Cuántos leads recibes al mes y cuál es tu mayor reto?"
  //   a2 = "Número de WhatsApp?"
  //   a3 = "¿Tienes sitio web?"
  if (q.leads_info) params.set("a1", q.leads_info);
  if (q.whatsapp) params.set("a2", q.whatsapp);
  if (q.website) params.set("a3", q.website);

  // UTM tracking — Calendly returns these on the webhook as `payload.tracking.utm_*`
  // We use them to identify WhatsApp-sourced bookings for the T-10min reminder.
  // q.manychat_subscriber_id is passed by ManyChat as {{user_id}} in the External Request.
  params.set("utm_source", q.utm_source || "manychat_whatsapp");
  if (q.manychat_subscriber_id) {
    params.set("utm_content", String(q.manychat_subscriber_id));
  }
  if (q.utm_campaign) params.set("utm_campaign", q.utm_campaign);

  const qs = params.toString();
  return qs ? `${schedulingUrl}?${qs}` : schedulingUrl;
};

/**
 * ManyChat error response — keeps flow alive with a graceful fallback.
 */
const manychatFallback = (message) => ({
  version: "v2",
  content: {
    messages: [
      {
        type: "text",
        text: message,
        buttons: [
          {
            type: "url",
            caption: "Ver calendario",
            url: "https://calendly.com/jegoalexdigital/30min",
          },
        ],
      },
    ],
  },
});

exports.getCalendlySlots = functions
  .runWith({ timeoutSeconds: 20, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const q = req.query || {};
    const { token, eventUri } = getConfig();

    try {
      // Window: now+5min → now+7d (Calendly rejects start_time in the past)
      const now = new Date();
      const startTime = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();

      const apiUrl = `https://api.calendly.com/event_type_available_times?` +
        `event_type=${encodeURIComponent(eventUri)}` +
        `&start_time=${encodeURIComponent(startTime)}` +
        `&end_time=${encodeURIComponent(endTime)}`;

      const r = await axios.get(apiUrl, {
        headers: { "Authorization": `Bearer ${token}` },
        timeout: 12000,
      });

      const slots = (r.data && r.data.collection) || [];
      const available = slots.filter((s) => s.status === "available");

      if (available.length === 0) {
        res.json(manychatFallback(
          "Parece que no hay horarios disponibles esta semana. 😔\n\nRevisa el calendario completo aquí:"
        ));
        return;
      }

      // Pick up to 3 spread-out slots: earliest, middle, latest
      const picks = [];
      if (available.length <= 3) {
        picks.push(...available);
      } else {
        const mid = Math.floor(available.length / 2);
        picks.push(available[0], available[mid], available[available.length - 1]);
      }

      const buttons = picks.map((s) => ({
        type: "url",
        caption: formatSlotLabel(s.start_time),
        url: buildPrefilledUrl(s.scheduling_url, q),
      }));

      // Also expose fields so ManyChat can save them to custom fields if needed
      const firstName = (q.name || q.first_name || "").split(" ")[0] || "";
      const header = firstName
        ? `¡Listo, ${firstName}! 🔥 Estos son los horarios disponibles con Alex (hora de Cancún):`
        : "¡Perfecto! Estos son los horarios disponibles con Alex (hora de Cancún):";

      res.json({
        version: "v2",
        content: {
          messages: [
            { type: "text", text: header },
            {
              type: "text",
              text: "Toca tu horario preferido — ya llenamos tus datos, solo confirma. 👇",
              buttons,
            },
          ],
        },
      });
    } catch (err) {
      functions.logger.error("getCalendlySlots error", {
        message: err.message,
        status: err.response && err.response.status,
        data: err.response && err.response.data,
      });
      res.status(200).json(manychatFallback(
        "Uy, tuvimos un problema revisando el calendario. Toca aquí para ver los horarios disponibles:"
      ));
    }
  });
