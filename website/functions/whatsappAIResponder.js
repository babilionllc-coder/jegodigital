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
    return { replies: ["Disculpa, hubo un detalle técnico. Te respondo en 1 minuto."], meta: {} };
  }
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Extract META JSON (complete tag preferred)
  let meta = {};
  const metaMatch = text.match(/<META>([\s\S]*?)<\/META>/);
  if (metaMatch) {
    try { meta = JSON.parse(metaMatch[1]); } catch (e) { /* ignore */ }
  }

  // ROBUST strip: remove ANYTHING from `<META` onwards
  let reply = text.replace(/<META>[\s\S]*?<\/META>/gi, "").trim();
  const stripIdx = reply.indexOf("<META");
  if (stripIdx >= 0) reply = reply.substring(0, stripIdx).trim();
  reply = reply.replace(/<[A-Z]{1,4}\s*$/, "").trim();

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

  return { replies: safe, meta };
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

      // 4. Call Gemini — returns array of replies (1-2 messages, auto-split if needed)
      const recentHistory = history.slice(-10);
      let { replies, meta } = await callGemini(client.systemPrompt, recentHistory);
      // Retry once if empty
      if (!replies || replies.length === 0 || replies[0].length < 5) {
        functions.logger.warn("Gemini empty, retrying once");
        await new Promise((r) => setTimeout(r, 800));
        const retry = await callGemini(client.systemPrompt, recentHistory);
        if (retry.replies && retry.replies.length > 0 && retry.replies[0].length > 5) {
          replies = retry.replies;
          meta = retry.meta;
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

      // 7. If lead has captured info → write to wa_leads + push to Notion CRM
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

        // Push to client's Notion CRM (non-blocking — don't fail the webhook if Notion is down)
        pushLeadToNotion(client, fullLead, leadId, history.length).catch((e) => {
          functions.logger.warn("Notion push non-blocking failure", e.message);
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

      // 9. Send AI reply(s) via Twilio — supports multi-message split
      // Send each chunk sequentially with 800ms delay so they arrive in order naturally
      for (let i = 0; i < replies.length; i++) {
        const chunk = replies[i];
        if (i > 0) await new Promise((r) => setTimeout(r, 800));
        const sent = await sendWhatsApp(from, to, chunk, client.twilio_subaccount_sid);
        if (sent.error_code || sent.error_message) {
          functions.logger.error(`Twilio send error (chunk ${i})`, sent);
        } else {
          functions.logger.info(`Reply chunk ${i + 1}/${replies.length} sent`, { len: chunk.length });
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
