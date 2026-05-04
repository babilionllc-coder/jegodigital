/**
 * whatsappAIResponder.js
 *
 * Cloud Function that handles WhatsApp messages for JegoDigital + clients.
 *
 * Flow:
 *   1. Twilio receives WhatsApp message → POSTs to this webhook
 *   2. Loads client-specific Sofia prompt from Firestore (by `to` number)
 *   3. Calls Gemini 2.5 Flash with system prompt + conversation history
 *   4. Sends response via Twilio WhatsApp API
 *   5. Stores conversation + extracts lead data → Firestore + Telegram alert
 *
 * Webhook URL (set in Twilio Console):
 *   https://us-central1-jegodigital-e02fb.cloudfunctions.net/whatsappAIResponder
 *
 * Env required:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, GEMINI_API_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (for hot-lead alerts)
 *
 * Firestore schema:
 *   wa_clients/{toNumber} — { name, systemPrompt, destinationEmail, brandVoice, faqs }
 *   wa_conversations/{toNumber}_{leadPhone} — { messages: [...], updated_at }
 *   wa_leads/{leadId} — { phone, name, intent, budget_hint, timeline, status, captured_at }
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";

const GEMINI_MODEL = "gemini-2.5-flash";

// ---------- Sofia DEFAULT prompt (used when client config doesn't override) ----------
const SOFIA_DEFAULT_PROMPT = `Eres Sofia, asistente IA de bienes raíces. Hablas español neutro mexicano, registro "tú", peer-to-peer, NUNCA "usted". Tono: directo, breve, cálido, profesional.

REGLAS DURAS:
1. NUNCA cotices precios — si preguntan precio, di: "Te conecto con Alex que maneja la inversión personalizada — me das tu nombre + teléfono + zona que te interesa?"
2. NUNCA menciones que eres IA o que eres parte de JegoDigital. Eres Sofia del equipo del cliente.
3. Captura SIEMPRE: nombre, número de WhatsApp (ya lo tienes del mensaje), zona/proyecto que les interesa, presupuesto aproximado, timeline (cuándo planean comprar).
4. Si dicen que es URGENTE o quieren ver una propiedad HOY → escala inmediatamente: "Alex te contacta en los próximos 5 minutos."
5. Respuestas máximo 2-3 oraciones. Conversacional, no corporativo.
6. Si preguntan algo que no sabes (financiamiento específico, fechas exactas, descuentos), di: "Déjame validar con el equipo y te confirmo en máximo 1 hora."
7. Cierre cada respuesta con UNA pregunta para avanzar la conversación.

OUTPUT EXTRA — al final de tu respuesta agrega INVISIBLE para el usuario un bloque JSON entre etiquetas <META> y </META> con los datos extraídos hasta el momento:
<META>{"name":"...","intent":"...","budget_hint":"...","timeline":"...","escalate":true|false,"qualified":true|false}</META>

Esto NO se muestra al usuario — es para nuestro CRM.`;

// ---------- Gemini call ----------
async function callGemini(systemPrompt, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: history,
    // 400 tokens ≈ 300 words ≈ 1500 chars. We split into 2 messages if needed.
    generationConfig: { temperature: 0.65, maxOutputTokens: 400 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) {
    functions.logger.error("Gemini error", j.error);
    return { replies: ["Disculpa, hubo un detalle técnico. Te respondo en 1 minuto."], meta: {}, booking: null };
  }
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Extract META JSON (complete tag preferred)
  let meta = {};
  const metaMatch = text.match(/<META>([\s\S]*?)<\/META>/);
  if (metaMatch) {
    try { meta = JSON.parse(metaMatch[1]); } catch (e) { /* ignore */ }
  }

  // Extract BOOKING JSON (TT&More + future clients with booking_endpoint configured)
  let booking = null;
  const bookingMatch = text.match(/<BOOKING>([\s\S]*?)<\/BOOKING>/);
  if (bookingMatch) {
    try {
      booking = JSON.parse(bookingMatch[1]);
    } catch (e) {
      functions.logger.warn("Failed to parse <BOOKING> JSON", { err: e.message, raw: bookingMatch[1].slice(0, 300) });
    }
  }

  // ROBUST strip: remove ANYTHING from `<META` or `<BOOKING` onwards
  let reply = text.replace(/<META>[\s\S]*?<\/META>/gi, "").trim();
  reply = reply.replace(/<BOOKING>[\s\S]*?<\/BOOKING>/gi, "").trim();
  const stripIdxMeta = reply.indexOf("<META");
  if (stripIdxMeta >= 0) reply = reply.substring(0, stripIdxMeta).trim();
  const stripIdxBooking = reply.indexOf("<BOOKING");
  if (stripIdxBooking >= 0) reply = reply.substring(0, stripIdxBooking).trim();
  reply = reply.replace(/<[A-Z]{1,7}\s*$/, "").trim();

  // Strip stray markdown that WhatsApp doesn't render
  reply = reply.replace(/\*\*([^*]+)\*\*/g, "$1"); // **bold** → bold
  reply = reply.replace(/^\s*[-•]\s+/gm, "");      // bullets at line start
  reply = reply.replace(/^#{1,6}\s+/gm, "");       // headers

  // SPLIT into 1-2 messages if too long.
  // Rule: split at paragraph boundary (\n\n) if total > 700 chars; max 2 messages, each ≤ 700 chars.
  const replies = [];
  if (reply.length <= 700) {
    replies.push(reply);
  } else {
    // Try paragraph split
    const paragraphs = reply.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    if (paragraphs.length >= 2) {
      // First message = first paragraph(s) up to ~600 chars, second = rest
      let acc = "";
      let used = 0;
      for (const p of paragraphs) {
        if (acc.length + p.length < 650) {
          acc += (acc ? "\n\n" : "") + p;
          used++;
        } else break;
      }
      replies.push(acc.trim());
      const rest = paragraphs.slice(used).join("\n\n").trim();
      if (rest && rest.length <= 700) replies.push(rest);
      else if (rest) replies.push(rest.substring(0, rest.lastIndexOf(".", 700) + 1 || 700).trim());
    } else {
      // No paragraph break — split at sentence boundary near 600
      const cut = reply.lastIndexOf(".", 650);
      if (cut > 200) {
        replies.push(reply.substring(0, cut + 1).trim());
        const tail = reply.substring(cut + 1).trim();
        if (tail.length > 0 && tail.length <= 700) replies.push(tail);
        else if (tail.length > 700) replies.push(tail.substring(0, 700).trim());
      } else {
        replies.push(reply.substring(0, 700).trim());
      }
    }
  }

  // Final safety: each reply max 1400 chars (Twilio WA hard limit ~1600)
  const safe = replies.map((r) => (r.length > 1400 ? r.substring(0, 1400).trim() : r));

  return { replies: safe, meta, booking };
}



// ---------- WhatsApp activity sync to client's external dashboard (TT&More + future) ----------
// When client.wa_sync_endpoint is configured, push every conversation state update
// (every message, every meta change) to that endpoint. The client's server then
// upserts into their own data store (Airtable for TT&More, future others elsewhere).
// Auth: shared secret in client.wa_sync_secret matched against server-side env var.
async function syncConversationToClient(client, params) {
  if (!client.wa_sync_endpoint || !client.wa_sync_secret) return null;
  try {
    const r = await fetch(client.wa_sync_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WA-Sync-Secret": client.wa_sync_secret,
      },
      body: JSON.stringify(params),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      functions.logger.warn("wa-sync non-2xx", { status: r.status, body: j });
      return { ok: false, status: r.status, body: j };
    }
    functions.logger.info("wa-sync success", { action: j.action, id: j.id });
    return j;
  } catch (e) {
    functions.logger.warn("wa-sync fetch failed", { err: e.message });
    return { ok: false, error: e.message };
  }
}

// ---------- Booking creation via client.booking_endpoint (TT&More + future) ----------
// When Gemini emits a <BOOKING>{...}</BOOKING> tag and the client has booking_endpoint
// configured in Firestore, we POST the booking to that endpoint and forward the
// returned payment link to the user as an additional WhatsApp message.
async function createBookingViaClientEndpoint(client, booking, leadPhone, profileName) {
  if (!client.booking_endpoint || !booking) return null;

  const fullName = String(booking.name || profileName || "client").trim();
  const [firstName, ...lastParts] = fullName.split(/\s+/);
  const lastName = lastParts.join(" ");

  const pax = parseInt(booking.pax, 10) || 1;
  const paxRange = pax <= 3 ? "1-3" : (pax <= 7 ? "4-7" : "8-10");

  const isRoundTrip = !!booking.isRoundTrip || booking.is_round_trip === true;
  const serviceMapped = isRoundTrip ? "Round Trip" : "One Way";

  const arrivalDateTime = booking.date || "";
  const returnDateTime = booking.returnDate || booking.return_date || "";

  const fields = {
    "Titular Name": firstName || "",
    "Titular Last Name": lastName || "",
    "Telefono Titular": leadPhone || "",
    "Destino - Tarifa": booking.destination || "",
    "Tipo de Traslado": serviceMapped,
    "Hotel": booking.hotel || "",
    "Passengers - Selector": paxRange,
    "Flight #": booking.flight || booking.flight_number || "",
    "Arrival Date Time": arrivalDateTime,
    "Return Date Time": returnDateTime,
    "Notas Adicionales": "[Origen: WhatsApp Sofía] Reservado por chat WA con asistente IA.",
    "Estado del Servicio": "Pendiente",
  };

  const payload = {
    fields,
    email: booking.email || "",
    clientName: fullName,
    destination: booking.destination || "",
    date: booking.date || "",
    phone: leadPhone || "",
    returnDate: returnDateTime,
    returnFlight: booking.returnFlight || booking.return_flight || "",
    isRoundTrip,
    payMethod: booking.payMethod || booking.pay_method || "stripe",
    adults: pax,
    children: 0,
  };

  try {
    const r = await fetch(client.booking_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) {
      functions.logger.error("Booking endpoint error", { status: r.status, body: j });
      return { error: j.error || `HTTP ${r.status}`, paymentUrl: null };
    }
    const links = j.paymentLinks || {};
    const method = payload.payMethod;
    const paymentUrl = links[method] || links.stripe || links.mercadopago || links.paypal || null;
    functions.logger.info("Booking created via client endpoint", {
      bookingId: j.bookingId || j.id || "?",
      method,
      hasUrl: !!paymentUrl,
    });
    return { paymentUrl, method, bookingId: j.bookingId || j.id, totalUsd: j.totalUsd };
  } catch (e) {
    functions.logger.error("Booking endpoint fetch failed", { err: e.message });
    return { error: e.message, paymentUrl: null };
  }
}

// ---------- Twilio send (multi-tenant — supports MMS with media attachments) ----------
async function sendWhatsApp(toNumber, fromNumber, body, accountSid, mediaUrls) {
  // mediaUrls: optional array of public URLs (PDF, JPG, PNG, MP4) to attach via MMS
  // Twilio WhatsApp supports up to 1 media per message + caption (body).
  // For multiple media: send separate messages.
  const ownerSid = accountSid || TWILIO_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ownerSid}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64");

  // If multiple media, send sequentially (1 per message)
  const mediaList = mediaUrls && mediaUrls.length ? mediaUrls : [null];
  let lastResp = null;
  for (let i = 0; i < mediaList.length; i++) {
    const payload = new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To: `whatsapp:${toNumber}`,
    });
    // Body only on first message (or if no media at all)
    if (i === 0 && body) payload.append("Body", body);
    if (mediaList[i]) payload.append("MediaUrl", mediaList[i]);
    if (i > 0) await new Promise((r) => setTimeout(r, 700));
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });
    lastResp = await r.json();
    if (lastResp.error_code) functions.logger.warn("Twilio media send error", lastResp);
  }
  return lastResp;
}

// ---------- Media intent detection ----------
// Returns { type: 'photos'|'brochure'|'video'|null, projectSlug: string }
function detectMediaIntent(text, lastReplyMeta) {
  const t = (text || "").toLowerCase();
  let type = null;
  // Match "mándame fotos / mostrame fotos / send me photos / pictures / imágenes"
  if (/\b(foto|fotos|photo|photos|pic|pics|picture|im[aá]gen|im[aá]genes|render|renders|gallery|galer[ií]a)\b/i.test(t)) type = "photos";
  // Brochure / ficha técnica
  else if (/\b(brochure|brochur|ficha|ficha t[eé]cnica|catalog|cat[aá]logo|pdf)\b/i.test(t)) type = "brochure";
  // Video / tour
  else if (/\b(video|videos|tour|recorrido|youtube)\b/i.test(t)) type = "video";
  if (!type) return null;

  // Try to identify the project from current text or last meta
  const projectSlug = (lastReplyMeta && lastReplyMeta.project_interest) || null;
  return { type, projectSlug };
}

// Extract project slug from AI reply text by scanning for known project names
// (fallback when META.project_interest is empty/undefined — which Gemini does often)
function extractProjectFromText(text, mediaLibrary) {
  if (!text || !mediaLibrary) return null;
  const lower = text.toLowerCase();
  // Build searchable keys: slug + name variants
  const candidates = [];
  for (const slug of Object.keys(mediaLibrary)) {
    candidates.push({ slug, search: slug.toLowerCase().replace(/-/g, " ") });
    // Also add common aliases — strip "miami", "tulum", "cancun" suffixes
    const stripped = slug.replace(/-(miami|tulum|cancun|mexico|by-.*|residences?)$/i, "").replace(/-/g, " ");
    if (stripped !== slug) candidates.push({ slug, search: stripped });
  }
  // Sort by longest search string first (more specific matches win)
  candidates.sort((a, b) => b.search.length - a.search.length);
  for (const c of candidates) {
    if (c.search.length >= 4 && lower.includes(c.search)) return c.slug;
  }
  return null;
}

function getProjectMedia(client, projectSlug, type) {
  if (!projectSlug || !client.media_library) return null;
  let proj = client.media_library[projectSlug];
  if (!proj) {
    const slugNorm = String(projectSlug).toLowerCase().replace(/[^a-z0-9]/g, "");
    const keys = Object.keys(client.media_library);
    const match = keys.find((k) => {
      const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      return kNorm === slugNorm || kNorm.includes(slugNorm) || slugNorm.includes(kNorm);
    });
    if (match) proj = client.media_library[match];
  }
  if (!proj) return null;
  if (type === "photos") return (proj.photos || []).slice(0, 3);
  if (type === "brochure") return proj.brochure_url ? [proj.brochure_url] : null;
  if (type === "video") return proj.video_url ? [proj.video_url] : null;
  return null;
}

// ---------- Voice message transcription (Gemini multimodal) ----------
async function transcribeAudio(audioUrl, mimeType) {
  try {
    // Download from Twilio (auth required)
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64");
    const audioRes = await fetch(audioUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!audioRes.ok) {
      functions.logger.warn("Audio download failed", audioRes.status);
      return null;
    }
    const audioBuf = await audioRes.arrayBuffer();
    const b64 = Buffer.from(audioBuf).toString("base64");
    // Gemini transcribe
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Transcribe this audio message exactly word-for-word in the original language. Return ONLY the transcription text, no commentary or quotes." },
            { inline_data: { mime_type: mimeType || "audio/ogg", data: b64 } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    });
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    functions.logger.error("transcribeAudio error", e.message);
    return null;
  }
}

// ---------- Image description (Gemini Vision) ----------
async function describeImage(imageUrl, mimeType) {
  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64");
    const imgRes = await fetch(imageUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Describe what's in this image in 1-2 sentences. If it's a real estate property, note key features (style, location, amenities visible). Return ONLY the description, no preamble." },
            { inline_data: { mime_type: mimeType || "image/jpeg", data: b64 } },
          ],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
      }),
    });
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    functions.logger.error("describeImage error", e.message);
    return null;
  }
}

// ---------- Telegram alert (only on hot lead = escalate or qualified) ----------
async function tgAlert(msg) {
  if (!TG_BOT || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: "Markdown" }),
    });
  } catch (e) {
    functions.logger.error("Telegram alert failed", e.message);
  }
}

// ---------- Notion CRM push (per-client database) ----------
const NOTION_KEY = process.env.NOTION_API_KEY;
const COUNTRY_MAP = {
  mexico: "México", usa: "USA", dubai: "Dubái", dominicana: "Dominicana",
  panama: "Panamá", spain: "España", bali: "Bali", colombia: "Colombia",
};
const STAGE_MAP = {
  diagnostico: "Diagnóstico", match: "Match", demo: "Demo", cierre: "Cierre",
};
const INTENT_MAP = {
  airbnb: "Airbnb", residencia: "Segunda residencia", mudanza: "Mudarse", otro: "Otro",
};
const PROPERTY_MAP = {
  depto: "Departamento", casa: "Casa", villa: "Villa", lote: "Lote",
};
const TIMELINE_MAP = {
  semanas: "Esta semana", meses: "3 meses", año: "Año",
};

async function pushLeadToNotion(client, leadData, convoId, msgCount) {
  if (!NOTION_KEY) return;
  const dbId = client?.notion?.leads_database_id;
  if (!dbId) return; // client not configured for Notion

  // Check if a page already exists for this Lead ID
  const queryUrl = `https://api.notion.com/v1/databases/${dbId}/query`;
  let existingPageId = null;
  try {
    const queryRes = await fetch(queryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: { property: "Lead ID", rich_text: { equals: convoId } },
        page_size: 1,
      }),
    });
    const qj = await queryRes.json();
    existingPageId = qj.results?.[0]?.id || null;
  } catch (e) {
    functions.logger.warn("Notion query failed", e.message);
  }

  // Build properties payload
  const props = {
    "Nombre": { title: [{ text: { content: (leadData.name || "Sin nombre").slice(0, 100) } }] },
    "WhatsApp": { phone_number: leadData.phone || null },
    "Lead ID": { rich_text: [{ text: { content: convoId } }] },
    "Score": { number: leadData.lead_score ?? null },
    "Hot 🔥": { checkbox: !!leadData.escalate || (leadData.lead_score >= 8) },
    "Calificado": { checkbox: !!leadData.qualified },
    "Mensajes": { number: msgCount || 0 },
    "Última Conversación": { date: { start: new Date().toISOString() } },
  };
  if (leadData.zone) props["Zona"] = { rich_text: [{ text: { content: String(leadData.zone).slice(0, 200) } }] };
  if (leadData.project_interest) props["Proyecto"] = { rich_text: [{ text: { content: String(leadData.project_interest).slice(0, 200) } }] };
  if (leadData.budget_hint) props["Presupuesto"] = { rich_text: [{ text: { content: String(leadData.budget_hint).slice(0, 200) } }] };
  if (leadData.country_of_origin) props["País Origen"] = { rich_text: [{ text: { content: String(leadData.country_of_origin).slice(0, 100) } }] };
  if (leadData.country_of_interest && COUNTRY_MAP[leadData.country_of_interest]) {
    props["País Interés"] = { select: { name: COUNTRY_MAP[leadData.country_of_interest] } };
  }
  if (leadData.stage && STAGE_MAP[leadData.stage]) {
    props["Etapa"] = { select: { name: STAGE_MAP[leadData.stage] } };
  }
  if (leadData.intent && INTENT_MAP[leadData.intent]) {
    props["Intención"] = { select: { name: INTENT_MAP[leadData.intent] } };
  }
  if (leadData.property_type && PROPERTY_MAP[leadData.property_type]) {
    props["Tipo Propiedad"] = { select: { name: PROPERTY_MAP[leadData.property_type] } };
  }
  if (leadData.timeline && TIMELINE_MAP[leadData.timeline]) {
    props["Timeline"] = { select: { name: TIMELINE_MAP[leadData.timeline] } };
  }

  try {
    if (existingPageId) {
      // UPDATE existing page
      await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${NOTION_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ properties: props }),
      });
      functions.logger.info("Notion lead UPDATED", { convoId, pageId: existingPageId });
    } else {
      // CREATE new page
      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: dbId },
          properties: props,
        }),
      });
      const cj = await createRes.json();
      if (cj.id) {
        functions.logger.info("Notion lead CREATED", { convoId, pageId: cj.id });
      } else {
        functions.logger.warn("Notion create failed", cj);
      }
    }
  } catch (e) {
    functions.logger.error("Notion push error", e.message);
  }
}

// ---------- Email project info via Brevo (real delivery, not a fake promise) ----------
const BREVO_API_KEY = process.env.BREVO_API_KEY;
// TEMP: Using JegoDigital verified sender until realestateflamingo.com.mx domain is fully authenticated in Brevo
// (DKIM record needs to be added — Brevo dashboard → Senders → Add domain → grab DKIM TXT)
const FLAMINGO_SENDER_EMAIL = "info@jegodigital.com";
const FLAMINGO_SENDER_NAME = "Flamingo Real Estate (vía JegoDigital)";
const FLAMINGO_REPLY_TO_EMAIL = "info@realestateflamingo.com.mx"; // Replies route to Flamingo even though sender is JD

function detectEmailIntent(text, history) {
  const t = (text || "").toLowerCase();
  // 1. Did the user share an email in this message?
  const emailMatch = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (!emailMatch) return null;
  // 2. Look at last 4 messages — was there a brochure/info request?
  const recentMessages = (history || []).slice(-4).map(m => (m.parts?.[0]?.text || "").toLowerCase()).join(" ");
  const askedForInfo = /\b(brochure|ficha|info|información|email|correo|mándame|enviame|envíame|detalles)\b/i.test(recentMessages);
  if (!askedForInfo) return null;
  return { email: emailMatch[0], askedForInfo: true };
}

async function sendProjectInfoEmail({ to, leadName, project, photos, brochure_url, video_url, owner_whatsapp }) {
  if (!BREVO_API_KEY || !to || !project) return { ok: false, reason: "missing_inputs" };

  const safeName = (leadName && leadName !== "Sofía") ? leadName : "estimado/a";
  const projectTitle = project.name || project.slug || "el proyecto";

  // Build HTML body
  const photoBlock = (photos || []).slice(0, 3).map(p =>
    `<img src="${p}" alt="${projectTitle}" style="width:100%;max-width:520px;border-radius:8px;margin:8px 0;" />`
  ).join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#0a4d3c;color:#d4af37;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;">Flamingo Real Estate</h1>
    <p style="margin:5px 0 0;font-style:italic;">Inmobiliaria especializada en Cancún + Riviera Maya</p>
  </div>

  <div style="padding:20px;background:#fff;">
    <p>Hola ${safeName},</p>
    <p>Como solicitaste, aquí tienes la información de <strong>${projectTitle}</strong>:</p>

    ${photoBlock || ""}

    <h3 style="color:#0a4d3c;margin-top:20px;">📍 ${projectTitle}</h3>
    ${project.location ? `<p><strong>Ubicación:</strong> ${project.location}</p>` : ""}
    ${project.desde ? `<p><strong>Desde:</strong> ${project.desde}</p>` : ""}
    ${project.roi ? `<p><strong>ROI estimado:</strong> ${project.roi}</p>` : ""}
    ${project.entrega ? `<p><strong>Entrega:</strong> ${project.entrega}</p>` : ""}

    <div style="margin:25px 0;text-align:center;">
      ${brochure_url ? `<a href="${brochure_url}" style="display:inline-block;background:#d4af37;color:#0a4d3c;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;margin:5px;">📄 Ver Brochure Completo</a>` : ""}
      ${video_url ? `<a href="${video_url}" style="display:inline-block;background:#0a4d3c;color:#d4af37;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;margin:5px;">🎬 Ver Video</a>` : ""}
    </div>

    ${!brochure_url ? `<p style="color:#666;font-size:14px;"><em>El brochure detallado de este proyecto te lo envía nuestro equipo en las próximas horas.</em></p>` : ""}

    <hr style="border:none;border-top:1px solid #eee;margin:25px 0;" />

    <p><strong>¿Listo para ver el proyecto en persona?</strong></p>
    <p>Agenda tu tour gratuito: <a href="https://calendly.com/jegoalexdigital/flamingo-real-estate-property-tour-scheduling" style="color:#0a4d3c;font-weight:bold;">Reservar Tour</a></p>
    <p>O escríbele directamente a Rodrigo (CEO): <a href="https://wa.me/${(owner_whatsapp || "+529981922793").replace(/[^\d]/g, "")}">WhatsApp ${owner_whatsapp || "+52 998 192 2793"}</a></p>

    <p style="margin-top:30px;">Un saludo,<br/><strong>Sofía</strong> · Asistente Virtual<br/>Flamingo Real Estate</p>
  </div>

  <div style="background:#f4f4f4;padding:15px;text-align:center;font-size:12px;color:#999;border-radius:0 0 8px 8px;">
    <a href="https://realestateflamingo.com.mx" style="color:#0a4d3c;">realestateflamingo.com.mx</a>
  </div>
</body>
</html>`;

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: FLAMINGO_SENDER_NAME, email: FLAMINGO_SENDER_EMAIL },
        to: [{ email: to, name: safeName }],
        subject: `Información de ${projectTitle} — Flamingo Real Estate`,
        htmlContent: html,
        // Replies route to Flamingo's real inbox so Rodrigo handles them
        replyTo: { email: FLAMINGO_REPLY_TO_EMAIL, name: "Flamingo Real Estate" },
      }),
    });
    const j = await r.json();
    if (j.messageId) {
      functions.logger.info("Project info email sent", { to, project: projectTitle, messageId: j.messageId });
      return { ok: true, messageId: j.messageId };
    }
    functions.logger.warn("Brevo email failed", j);
    return { ok: false, error: j };
  } catch (e) {
    functions.logger.error("Email send error", e.message);
    return { ok: false, error: e.message };
  }
}

// ---------- Client admin panel push (cross-project Firestore write) ----------
// Writes lead directly to client's Firestore `leads` collection so they appear
// in their existing /admin CRM dashboard. Lazy-initializes a per-client
// admin app the first time we need to write to that project.
const SOFIA_TO_FLAMINGO_STAGE = {
  diagnostico: "new", match: "contacted", info: "contacted",
  demo: "viewing", cierre: "negotiation",
  ganado: "closed", perdido: "lost",
};
const _clientAdminApps = {}; // cache per project

function getClientAdminApp(client) {
  const cfg = client?.flamingo_admin;
  if (!cfg?.firebase_sa_b64 && !process.env.FLAMINGO_FIREBASE_SA_B64) return null;
  const projectId = cfg?.project_id || "realestateflamingo-e9d4b";
  if (_clientAdminApps[projectId]) return _clientAdminApps[projectId];
  try {
    const saB64 = cfg?.firebase_sa_b64 || process.env.FLAMINGO_FIREBASE_SA_B64;
    const saJson = JSON.parse(Buffer.from(saB64, "base64").toString("utf-8"));
    const app = admin.initializeApp({ credential: admin.credential.cert(saJson) }, `client_${projectId}`);
    _clientAdminApps[projectId] = app;
    functions.logger.info("Client admin app initialized", { projectId });
    return app;
  } catch (e) {
    functions.logger.error("Client admin app init failed", e.message);
    return null;
  }
}

async function pushLeadToClientAdmin(client, leadData, leadId, recentMessages) {
  const cfg = client?.flamingo_admin;
  if (!cfg?.sync_enabled) return;
  const app = getClientAdminApp(client);
  if (!app) return;

  const clientDb = app.firestore();
  const phone = leadData.phone;
  if (!phone) return;

  // Find existing lead by phone
  const existingSnap = await clientDb.collection("leads").where("phone", "==", phone).limit(1).get();

  // Map Sofía stage → Flamingo pipelineStage
  const stageMapped = SOFIA_TO_FLAMINGO_STAGE[leadData.stage] || "new";
  const isHot = !!leadData.escalate || !!leadData.qualified || (leadData.lead_score || 0) >= 8;

  // Conversation summary for "notes"
  const summary = [];
  if (leadData.country_of_interest) summary.push(`País: ${leadData.country_of_interest}`);
  if (leadData.zone) summary.push(`Zona: ${leadData.zone}`);
  if (leadData.project_interest) summary.push(`Proyecto: ${leadData.project_interest}`);
  if (leadData.budget_hint) summary.push(`Presupuesto: ${leadData.budget_hint}`);
  if (leadData.timeline) summary.push(`Timeline: ${leadData.timeline}`);
  if (leadData.country_of_origin) summary.push(`De: ${leadData.country_of_origin}`);
  if (leadData.intent) summary.push(`Intención: ${leadData.intent}`);
  const notes = `[Sofía AI · WhatsApp]\n${summary.join(" · ")}` +
    (leadData.last_message_text ? `\n\nÚltimo: "${leadData.last_message_text.slice(0, 250)}"` : "");

  const transcript = (recentMessages || []).slice(-8).map((m) => ({
    role: m.role || "user",
    text: (m.parts?.[0]?.text || "").slice(0, 400),
  }));

  const doc = {
    name: leadData.name || "Sin nombre",
    phone: phone,
    email: leadData.email || null,
    source: "Sofía AI WhatsApp",
    pipelineStage: stageMapped,
    dealValue: leadData.budget_hint || null,
    lastActivity: admin.firestore.FieldValue.serverTimestamp(),
    notes: notes,
    isHot: isHot,
    sofia: {
      score: leadData.lead_score || null,
      stage: leadData.stage || null,
      escalate: !!leadData.escalate,
      qualified: !!leadData.qualified,
      country_of_interest: leadData.country_of_interest || null,
      country_of_origin: leadData.country_of_origin || null,
      zone: leadData.zone || null,
      project_interest: leadData.project_interest || null,
      intent: leadData.intent || null,
      timeline: leadData.timeline || null,
      conversation_id: leadId,
      transcript: transcript,
      last_synced_at: admin.firestore.FieldValue.serverTimestamp(),
    },
  };

  try {
    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0];
      const existingData = existing.data();
      // Don't overwrite a manually-edited name with "Sin nombre"
      if (existingData.name && existingData.name !== "Sin nombre" && doc.name === "Sin nombre") delete doc.name;
      // Don't move backwards in pipeline (respect human moves)
      const order = ["new", "contacted", "viewing", "negotiation", "closed", "lost"];
      if (existingData.pipelineStage && order.indexOf(existingData.pipelineStage) > order.indexOf(stageMapped) && existingData.pipelineStage !== "lost") {
        delete doc.pipelineStage;
      }
      await existing.ref.update(doc);
      functions.logger.info("Client admin lead UPDATED", { leadId: existing.id, stage: stageMapped });
    } else {
      doc.createdAt = admin.firestore.FieldValue.serverTimestamp();
      const ref = await clientDb.collection("leads").add(doc);
      functions.logger.info("Client admin lead CREATED", { leadId: ref.id, stage: stageMapped });
    }
  } catch (e) {
    functions.logger.error("Client admin write error", e.message);
  }
}

// ---------- HTTP webhook ----------
exports.whatsappAIResponder = functions
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    try {
      const from = (req.body.From || "").replace("whatsapp:", "");
      const to = (req.body.To || "").replace("whatsapp:", "");
      let text = (req.body.Body || "").trim();
      const profileName = req.body.ProfileName || "";
      const numMedia = parseInt(req.body.NumMedia || "0", 10);

      // INBOUND MEDIA HANDLING — voice notes + images
      if (numMedia > 0) {
        const mediaUrl = req.body.MediaUrl0;
        const mediaType = (req.body.MediaContentType0 || "").toLowerCase();
        if (mediaType.startsWith("audio/")) {
          functions.logger.info("Inbound audio detected", { from, mediaType });
          const transcribed = await transcribeAudio(mediaUrl, mediaType);
          if (transcribed) {
            text = (text ? text + " " : "") + `[Audio del lead]: ${transcribed}`;
            functions.logger.info("Audio transcribed", { len: transcribed.length });
          } else {
            text = text || "[el lead envió un mensaje de audio que no se pudo transcribir]";
          }
        } else if (mediaType.startsWith("image/")) {
          functions.logger.info("Inbound image detected", { from, mediaType });
          const described = await describeImage(mediaUrl, mediaType);
          if (described) {
            text = (text ? text + " " : "") + `[Imagen del lead]: ${described}`;
          } else {
            text = text || "[el lead envió una imagen]";
          }
        }
      }

      if (!from || !text) {
        return res.status(200).send("OK");
      }

      functions.logger.info("WA inbound", { from, to, text: text.slice(0, 100), profileName, numMedia });

      // 1. Load client config (by `to` number)
      const clientRef = db.collection("wa_clients").doc(to);
      const clientDoc = await clientRef.get();
      const client = clientDoc.exists
        ? clientDoc.data()
        : {
            name: "JegoDigital",
            systemPrompt: SOFIA_DEFAULT_PROMPT,
            destinationEmail: "jegoalexdigital@gmail.com",
          };

      // 2. Load conversation history
      const convoId = `${to.replace(/\+/g, "")}_${from.replace(/\+/g, "")}`;
      const convoRef = db.collection("wa_conversations").doc(convoId);
      const convoDoc = await convoRef.get();
      const convoData = convoDoc.exists ? convoDoc.data() : {};
      const history = convoData.messages || [];

      // 2a. HUMAN TAKEOVER CHECK — if a human asesor is actively replying, AI shuts up.
      // The asesor sets `human_takeover_until` (ISO timestamp) via a separate webhook
      // when they jump into the conversation. AI stays silent until the timestamp passes.
      const takeoverUntil = convoData.human_takeover_until;
      if (takeoverUntil && new Date(takeoverUntil) > new Date()) {
        functions.logger.info("WA: human takeover active, AI silenced", { convoId, takeoverUntil });
        // Still log the inbound so human can see it in Firestore
        history.push({ role: "user", parts: [{ text }], at: new Date().toISOString() });
        await convoRef.set({
          client_to: to,
          lead_phone: from,
          lead_name: profileName || convoData.lead_name || null,
          messages: history.slice(-50),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          message_count: (history.length || 0),
          last_inbound_during_takeover: text.slice(0, 500),
        }, { merge: true });
        return res.status(200).set("Content-Type", "text/xml").send("<Response></Response>");
      }

      // 2b. RATE LIMIT — max 30 inbound messages per phone per 60 min (DDoS / runaway-cost protection)
      const recentInbound = (convoData.recent_inbound_timestamps || [])
        .filter((ts) => Date.now() - new Date(ts).getTime() < 60 * 60 * 1000);
      if (recentInbound.length >= 30) {
        functions.logger.warn("WA rate limit hit, skipping AI reply", { from, count: recentInbound.length });
        return res.status(200).set("Content-Type", "text/xml").send("<Response></Response>");
      }
      recentInbound.push(new Date().toISOString());

      // 3. Append user message
      history.push({ role: "user", parts: [{ text }] });

      // 3a. RETURNING LEAD MEMORY — if last conversation was >24h ago, prepend context summary
      // This makes Sofía recognize returning leads instead of starting fresh.
      let systemPromptWithContext = client.systemPrompt;
      const lastUpdated = convoData.updated_at?.toDate?.();
      if (lastUpdated && history.length > 2) {
        const hoursSinceLast = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast >= 24) {
          const lastMeta = convoData.last_meta || {};
          const summary = [];
          if (lastMeta.name) summary.push(`Nombre: ${lastMeta.name}`);
          if (lastMeta.country_of_interest) summary.push(`País interés: ${lastMeta.country_of_interest}`);
          if (lastMeta.zone) summary.push(`Zona: ${lastMeta.zone}`);
          if (lastMeta.budget_hint) summary.push(`Presupuesto: ${lastMeta.budget_hint}`);
          if (lastMeta.intent) summary.push(`Intención: ${lastMeta.intent}`);
          if (lastMeta.project_interest) summary.push(`Proyecto interés: ${lastMeta.project_interest}`);
          const summaryStr = summary.join(" · ");
          if (summaryStr) {
            const daysAgo = Math.round(hoursSinceLast / 24);
            systemPromptWithContext = client.systemPrompt + `\n\n═══════════════════════════════\nLEAD QUE REGRESA — CONTEXTO PREVIO (hace ${daysAgo} día${daysAgo > 1 ? 's' : ''})\n═══════════════════════════════\nEste lead ya tuvo una conversación contigo. Datos capturados antes:\n${summaryStr}\n\nReconócelo cordialmente: "Hola${lastMeta.name ? ' ' + lastMeta.name : ''}, gusto verte de nuevo. Hace unos días me dijiste que buscabas [referenciar contexto]". NO empieces con la apertura genérica. Continúa donde quedaron.`;
            functions.logger.info("Returning lead detected", { convoId, daysAgo, summaryFields: summary.length });
          }
        }
      }

      // 4. Call Gemini — returns array of replies (1-2 messages, auto-split if needed)
      // Defensive: declare booking explicitly so it's always in scope even if the
      // destructure path takes an unexpected branch in the deployed function.
      let booking = null;
      const recentHistory = history.slice(-10);
      const _geminiResult = await callGemini(systemPromptWithContext, recentHistory);
      let replies = _geminiResult.replies;
      let meta = _geminiResult.meta;
      booking = _geminiResult.booking || null;
      // Retry once if empty
      if (!replies || replies.length === 0 || replies[0].length < 5) {
        functions.logger.warn("Gemini empty, retrying once");
        await new Promise((r) => setTimeout(r, 800));
        const retry = await callGemini(systemPromptWithContext, recentHistory);
        if (retry.replies && retry.replies.length > 0 && retry.replies[0].length > 5) {
          replies = retry.replies;
          meta = retry.meta;
          booking = retry.booking || null;
        }
      }
      // Last-resort safety net
      if (!replies || replies.length === 0 || replies[0].length < 5) {
        replies = ["Gracias por escribirnos. Un asesor humano te contacta en los próximos 10 minutos."];
      }
      const reply = replies.join("\n\n"); // for Firestore log + meta extraction

      // 5. Append AI response
      history.push({ role: "model", parts: [{ text: reply }] });

      // 6. Save conversation (keep last 50 messages + rate-limit timestamps)
      await convoRef.set(
        {
          client_to: to,
          lead_phone: from,
          lead_name: profileName || meta.name || null,
          messages: history.slice(-50),
          last_meta: meta,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          message_count: (history.length || 0),
          recent_inbound_timestamps: recentInbound.slice(-50),
        },
        { merge: true }
      );

      // 7. If lead has captured info → write to wa_leads + push to Notion CRM + push to client admin panel
      if (meta.name || meta.intent || meta.qualified || meta.country_of_interest) {
        const leadId = `${to.replace(/\+/g,"")}_${from.replace(/\+/g,"")}`;
        const fullLead = {
          client: to,
          phone: from,
          name: meta.name || profileName || null,
          intent: meta.intent || null,
          country_of_interest: meta.country_of_interest || null,
          country_of_origin: meta.country_of_origin || null,
          zone: meta.zone || null,
          property_type: meta.property_type || null,
          budget_hint: meta.budget_hint || null,
          timeline: meta.timeline || null,
          project_interest: meta.project_interest || null,
          stage: meta.stage || null,
          lead_score: meta.lead_score || null,
          qualified: !!meta.qualified,
          escalate: !!meta.escalate,
          captured_at: admin.firestore.FieldValue.serverTimestamp(),
          last_message_text: text.slice(0, 500),
        };
        const leadRef = db.collection("wa_leads").doc(leadId);
        await leadRef.set(fullLead, { merge: true });

        // Push to client's Notion CRM (non-blocking)
        pushLeadToNotion(client, fullLead, leadId, history.length).catch((e) => {
          functions.logger.warn("Notion push non-blocking failure", e.message);
        });

        // Push to client's admin panel (Flamingo /admin etc) — non-blocking
        pushLeadToClientAdmin(client, fullLead, leadId, history.slice(-10)).catch((e) => {
          functions.logger.warn("Client admin push non-blocking failure", e.message);
        });
      }

      // 8. Telegram alert if hot (escalate or qualified or first message)
      if (meta.escalate || meta.qualified || history.length <= 2) {
        const alertMsg =
          `🔥 *WhatsApp Lead* (${client.name})\n` +
          `📱 ${from}${profileName ? " — " + profileName : ""}\n` +
          (meta.intent ? `🎯 ${meta.intent}\n` : "") +
          (meta.budget_hint ? `💰 ${meta.budget_hint}\n` : "") +
          (meta.timeline ? `⏰ ${meta.timeline}\n` : "") +
          (meta.escalate ? `\n⚠️ *URGENT — escalate now*` : "") +
          `\n\n_Last msg:_ "${text.slice(0, 200)}"`;
        await tgAlert(alertMsg);
      }

      // 8b. Detect EMAIL INTENT — if user gave email + asked for info recently → SEND IT
      const emailIntent = detectEmailIntent(text, history);
      if (emailIntent && emailIntent.email) {
        const projectSlug = meta.project_interest;
        if (projectSlug && client.media_library) {
          // Fuzzy lookup
          let proj = client.media_library[projectSlug];
          if (!proj) {
            const slugNorm = String(projectSlug).toLowerCase().replace(/[^a-z0-9]/g, "");
            const matchKey = Object.keys(client.media_library).find(k => {
              const kn = k.toLowerCase().replace(/[^a-z0-9]/g, "");
              return kn === slugNorm || kn.includes(slugNorm) || slugNorm.includes(kn);
            });
            if (matchKey) proj = { ...client.media_library[matchKey], slug: matchKey };
          }
          if (proj) {
            sendProjectInfoEmail({
              to: emailIntent.email,
              leadName: meta.name && meta.name !== "Sofía" ? meta.name : profileName,
              project: { name: proj.name || projectSlug, slug: proj.slug || projectSlug, ...proj },
              photos: proj.photos,
              brochure_url: proj.brochure_url,
              video_url: proj.video_url,
              owner_whatsapp: client.notification_targets?.owner_whatsapp,
            }).then((res) => {
              if (res.ok) {
                functions.logger.info("Brochure email sent", { to: emailIntent.email, slug: projectSlug });
              } else {
                // Email failed → alert Rodrigo via Telegram so he sends manually
                tgAlert(`📧 *Email manual needed*\n\nLead pidió info de *${projectSlug}* a ${emailIntent.email}\nBrochure no disponible o email falló.\n\nMándale manualmente desde info@realestateflamingo.com.mx`);
              }
            }).catch((e) => functions.logger.warn("Email non-blocking fail", e.message));
          }
        }
      }

      // 9. Detect MEDIA INTENT — multi-fallback for project slug detection.
      // Order: META.project_interest → previous META → AI's own reply text → user's message
      const intent = detectMediaIntent(text, meta);
      let mediaToSend = null;
      if (intent) {
        let slug = intent.projectSlug;
        // Fallback 1: previous META in conversation (carries project context)
        if (!slug && convoData.last_meta?.project_interest) {
          slug = convoData.last_meta.project_interest;
          functions.logger.info("Slug fallback: previous META", { slug });
        }
        // Fallback 2: scan AI's reply text for known project names
        if (!slug && client.media_library) {
          const replyText = (replies || []).join(" ");
          slug = extractProjectFromText(replyText, client.media_library);
          if (slug) functions.logger.info("Slug fallback: from AI reply text", { slug });
        }
        // Fallback 3: scan user's own message
        if (!slug && client.media_library) {
          slug = extractProjectFromText(text, client.media_library);
          if (slug) functions.logger.info("Slug fallback: from user msg", { slug });
        }
        if (slug) {
          mediaToSend = getProjectMedia(client, slug, intent.type);
          if (mediaToSend) {
            functions.logger.info("Media intent matched", {
              type: intent.type, slug, count: mediaToSend.length,
            });
          } else {
            functions.logger.warn("Project found but no media of type", { slug, type: intent.type });
          }
        } else {
          functions.logger.warn("Media intent detected but no project slug resolved");
        }
      }

      // 9a. (NEW) Sync conversation state to client's external dashboard (Airtable etc)
      //     Fires for every message — both user and Sofia replies — so admin sees real-time activity.
      try {
        const lastUserMsg = (history.filter(m => m.role === "user").slice(-1)[0]?.parts?.[0]?.text || "").slice(0, 5000);
        const lastModelMsg = (replies && replies[0]) || "";
        const status = (meta && meta.escalate) ? "Escalated"
                       : (meta && meta.booking_block_emitted) ? "Booked"
                       : "Active";
        await syncConversationToClient(client, {
          conversation_id: `${to.replace("+", "")}_${from.replace("+", "")}`,
          lead_phone: from,
          lead_name: profileName || meta?.name || null,
          status,
          language: meta?.language || null,
          intent: meta?.intent || null,
          destination: meta?.destination || null,
          pax: typeof meta?.pax === "number" ? meta.pax : (parseInt(meta?.pax, 10) || null),
          hotel: meta?.hotel || null,
          date: meta?.date || null,
          quoted_price_usd: typeof meta?.quoted_price_usd === "number" ? meta.quoted_price_usd : null,
          lead_score: typeof meta?.lead_score === "number" ? meta.lead_score : null,
          escalated: !!meta?.escalate,
          last_message: lastModelMsg.slice(0, 1000) || lastUserMsg.slice(0, 1000),
          last_message_role: "model",
          message_count: history.length,
          notes: JSON.stringify(meta || {}).slice(0, 3000),
        });
      } catch (e) {
        functions.logger.warn("syncConversationToClient block threw", { err: e.message });
      }

      // 9b. If Gemini emitted <BOOKING> AND client has booking_endpoint, create the
      //     booking + fetch payment link, then push it as an additional reply chunk.
      if (client.booking_endpoint && booking && booking.destination && (booking.date || booking.pax)) {
        try {
          const bookResult = await createBookingViaClientEndpoint(client, booking, from, profileName);
          if (bookResult && bookResult.paymentUrl) {
            const lang = (meta && meta.language) || (booking.language) || "en";
            const msg = lang === "es"
              ? `💳 Tu link de pago seguro (${bookResult.method}): ${bookResult.paymentUrl}\n\nReserva queda confirmada al pagar. Te llega email de confirmación + recordatorios automáticos.`
              : `💳 Your secure payment link (${bookResult.method}): ${bookResult.paymentUrl}\n\nBooking confirms instantly upon payment. You'll receive email confirmation + automatic reminders.`;
            replies.push(msg);
            functions.logger.info("Payment link appended to replies", { method: bookResult.method, lang });
          } else if (bookResult && bookResult.error) {
            const lang = (meta && meta.language) || "en";
            const errMsg = lang === "es"
              ? "Hubo un detalle técnico generando tu link de pago. Te conecto con coordinador: +52 998 300 0307"
              : "We hit a technical issue generating your payment link. Let me connect you: +52 998 300 0307";
            replies.push(errMsg);
            functions.logger.error("Booking failed, told user to call", { error: bookResult.error });
          }
        } catch (e) {
          functions.logger.error("createBookingViaClientEndpoint threw", { err: e.message });
        }
      }

      // 10. Send AI reply(s) via Twilio — supports multi-message split + MMS attachments
      for (let i = 0; i < replies.length; i++) {
        const chunk = replies[i];
        if (i > 0) await new Promise((r) => setTimeout(r, 800));
        // Attach media to LAST chunk only (so user reads the message THEN gets the asset)
        const isLastChunk = i === replies.length - 1;
        const mediaForThisChunk = isLastChunk && mediaToSend ? mediaToSend : null;
        const sent = await sendWhatsApp(from, to, chunk, client.twilio_subaccount_sid, mediaForThisChunk);
        if (sent.error_code || sent.error_message) {
          functions.logger.error(`Twilio send error (chunk ${i})`, sent);
        } else {
          functions.logger.info(`Reply chunk ${i + 1}/${replies.length} sent`, {
            len: chunk.length,
            media: mediaForThisChunk ? mediaForThisChunk.length : 0,
          });
        }
      }

      // Twilio expects 200 OK with empty body OR TwiML
      res.status(200).set("Content-Type", "text/xml").send("<Response></Response>");
    } catch (e) {
      functions.logger.error("whatsappAIResponder fatal", e);
      res.status(500).send(e.message);
    }
  });

// ---------- Health check ----------
exports.whatsappAIHealth = functions.https.onRequest(async (req, res) => {
  const checks = {
    gemini: !!GEMINI_KEY,
    twilio: !!(TWILIO_SID && TWILIO_AUTH),
    telegram: !!(TG_BOT && TG_CHAT),
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(checks);
});

// Deploy trigger: 2026-05-03T06:13 — multi-tenant subaccount routing for Flamingo +1 252
