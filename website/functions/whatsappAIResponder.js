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
    // 250 tokens ≈ 200 words ≈ 1000 chars — fits comfortably in WhatsApp's 1600-char limit
    generationConfig: { temperature: 0.7, maxOutputTokens: 250 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) {
    functions.logger.error("Gemini error", j.error);
    return { reply: "Disculpa, problema técnico. Te llamamos en 5 min.", meta: {} };
  }
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Extract META JSON (complete tag preferred)
  let meta = {};
  const metaMatch = text.match(/<META>([\s\S]*?)<\/META>/);
  if (metaMatch) {
    try { meta = JSON.parse(metaMatch[1]); } catch (e) { /* ignore */ }
  }

  // ROBUST strip: remove ANYTHING from `<META` onwards (even without closing tag, even malformed)
  // This guards against: truncated messages, malformed META, partial tags, anything weird
  let reply = text.replace(/<META>[\s\S]*?<\/META>/gi, "").trim();
  // Belt-and-suspenders: cut anything from first `<META` we still see
  const stripIdx = reply.indexOf("<META");
  if (stripIdx >= 0) reply = reply.substring(0, stripIdx).trim();
  // Also strip any trailing partial tags like `<MET`, `<ME`, `<M` at end
  reply = reply.replace(/<[A-Z]{1,4}\s*$/, "").trim();

  // Hard cap at 1400 chars (WhatsApp limit is 1600, leave room for safety)
  if (reply.length > 1400) {
    // Cut at last sentence boundary before 1400
    const cut = reply.lastIndexOf(".", 1400);
    reply = (cut > 800 ? reply.substring(0, cut + 1) : reply.substring(0, 1400)).trim();
  }

  return { reply, meta };
}

// ---------- Twilio send (multi-tenant — routes to subaccount if applicable) ----------
async function sendWhatsApp(toNumber, fromNumber, body, accountSid) {
  // accountSid: SID of the account that OWNS fromNumber.
  // JegoDigital +1 978 → main account. Flamingo +1 252 → Flamingo subaccount.
  // Parent credentials authenticate; URL scopes to the owning account.
  const ownerSid = accountSid || TWILIO_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ownerSid}/Messages.json`;
  const payload = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${toNumber}`,
    Body: body,
  });
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });
  return await r.json();
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

// ---------- HTTP webhook ----------
exports.whatsappAIResponder = functions
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    try {
      const from = (req.body.From || "").replace("whatsapp:", "");
      const to = (req.body.To || "").replace("whatsapp:", "");
      const text = (req.body.Body || "").trim();
      const profileName = req.body.ProfileName || "";

      if (!from || !text) {
        return res.status(200).send("OK");
      }

      functions.logger.info("WA inbound", { from, to, text: text.slice(0, 100), profileName });

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

      // 4. Call Gemini with system prompt + last 10 messages (with retry on failure)
      const recentHistory = history.slice(-10);
      let { reply, meta } = await callGemini(client.systemPrompt, recentHistory);
      // Retry once if reply is empty or technical-error placeholder (Gemini occasional 5xx)
      if (!reply || reply.length < 5 || reply.includes("problema técnico")) {
        functions.logger.warn("Gemini empty/error, retrying once", { firstReply: reply });
        await new Promise((r) => setTimeout(r, 800));
        const retry = await callGemini(client.systemPrompt, recentHistory);
        if (retry.reply && retry.reply.length > 5) {
          reply = retry.reply;
          meta = retry.meta;
        }
      }
      // Last-resort safety net: never send blank to user
      if (!reply || reply.length < 5) {
        reply = "¡Gracias por escribirnos! Un asesor humano te contacta en los próximos 10 minutos. 🌴";
      }

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

      // 7. If lead has captured info → write to wa_leads
      if (meta.name || meta.intent || meta.qualified) {
        const leadRef = db.collection("wa_leads").doc(`${to.replace(/\+/g,"")}_${from.replace(/\+/g,"")}`);
        await leadRef.set(
          {
            client: to,
            phone: from,
            name: meta.name || profileName || null,
            intent: meta.intent || null,
            budget_hint: meta.budget_hint || null,
            timeline: meta.timeline || null,
            qualified: !!meta.qualified,
            escalate: !!meta.escalate,
            captured_at: admin.firestore.FieldValue.serverTimestamp(),
            last_message_text: text.slice(0, 500),
          },
          { merge: true }
        );
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

      // 9. Send AI reply via Twilio (route to owning subaccount if multi-tenant client)
      const sent = await sendWhatsApp(from, to, reply, client.twilio_subaccount_sid);
      if (sent.error_code || sent.error_message) {
        functions.logger.error("Twilio send error", sent);
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
