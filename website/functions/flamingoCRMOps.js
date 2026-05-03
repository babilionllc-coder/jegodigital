/**
 * flamingoCRMOps.js — Multi-tenant client CRM operations
 *
 * Three exported functions:
 *   1. flamingoDailyDigest (cron 7am CDT) — sends daily WhatsApp digest to each client
 *      with last 24h leads summary.
 *   2. flamingoHotLeadAlert (Firestore trigger on wa_leads write) — when a lead is
 *      qualified=true OR escalate=true OR lead_score>=8, sends instant WhatsApp ping
 *      to the client's owner phone.
 *   3. flamingoCRMOpsOnDemand (HTTPS) — manual trigger for testing / on-demand.
 *
 * Multi-tenant: reads `notification_targets` field from `wa_clients/{toNumber}`:
 *   {
 *     owner_whatsapp: "+529981922793",        // who gets digest + hot alerts
 *     owner_name: "Rodrigo",
 *     digest_enabled: true,
 *     hot_alerts_enabled: true,
 *     timezone: "America/Cancun"               // for digest scheduling
 *   }
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";

// ---------- Multi-tenant Twilio send ----------
async function sendWA(toNumber, fromNumber, body, accountSid) {
  const ownerSid = accountSid || TWILIO_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ownerSid}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To: `whatsapp:${toNumber}`,
      Body: body,
    }),
  });
  return r.json();
}

async function tg(msg) {
  if (!TG_BOT || !TG_CHAT) return;
  await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: "Markdown" }),
  }).catch(() => {});
}

// ---------- DAILY DIGEST (7am CDT, every day) ----------
async function buildDigest(clientPhone, clientData) {
  // Pull last 24h leads for this client
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const leadsSnap = await db
    .collection("wa_leads")
    .where("client", "==", clientPhone)
    .where("captured_at", ">", since)
    .get();

  const leads = leadsSnap.docs.map((d) => d.data());
  const total = leads.length;
  const hot = leads.filter((l) => l.escalate || l.qualified || (l.lead_score || 0) >= 8);
  const nurture = leads.filter((l) => !hot.includes(l));

  // Pull last 24h conversations (for new vs returning leads)
  const convosSnap = await db
    .collection("wa_conversations")
    .where("client_to", "==", clientPhone)
    .where("updated_at", ">", since)
    .get();
  const totalConvos = convosSnap.size;

  const ownerName = clientData?.notification_targets?.owner_name || "equipo";
  const notionUrl = clientData?.notion?.workspace_url || "";

  let body = `☀️ Buenos días ${ownerName}\n\n`;
  body += `📊 Resumen de Sofía (últimas 24h):\n`;
  body += `• ${totalConvos} conversaciones totales\n`;
  body += `• ${total} leads capturados\n`;
  body += `• ${hot.length} hot 🔥\n`;
  body += `• ${nurture.length} en nurture\n\n`;

  if (hot.length > 0) {
    body += `🔥 Hot leads (revisar primero):\n`;
    hot.slice(0, 5).forEach((l) => {
      const name = l.name || "Sin nombre";
      const country = l.country_of_interest || "";
      const budget = l.budget_hint || "";
      const phone = l.phone || "";
      body += `• ${name} · ${country} ${budget ? "· " + budget : ""} · ${phone}\n`;
    });
    body += "\n";
  }

  if (notionUrl) body += `📋 Ver detalles: ${notionUrl}\n`;
  body += `\n_¿Necesitas ayuda? Contesta a este mensaje._`;

  return { body, total, hot: hot.length, nurture: nurture.length, totalConvos };
}

exports.flamingoDailyDigest = functions
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .pubsub.schedule("0 7 * * *")
  .timeZone("America/Cancun")
  .onRun(async () => {
    const clientsSnap = await db.collection("wa_clients").get();
    let sent = 0,
      skipped = 0;

    for (const doc of clientsSnap.docs) {
      const client = doc.data();
      const targets = client.notification_targets;
      if (!targets?.digest_enabled || !targets?.owner_whatsapp) {
        skipped++;
        continue;
      }
      try {
        const { body, total, hot } = await buildDigest(doc.id, client);
        // Recipients: primary owner + (optional) pilot owner for QA
        const recipients = [targets.owner_whatsapp];
        if (targets.send_to_pilot_owner_too && targets.pilot_owner_whatsapp) {
          recipients.push(targets.pilot_owner_whatsapp);
        }
        for (const recipient of recipients) {
          await sendWA(
            recipient,
            doc.id, // FROM the client's own number (e.g. Flamingo's +1 252)
            body,
            client.twilio_subaccount_sid
          );
        }
        sent += recipients.length;
        functions.logger.info("Daily digest sent", { client: doc.id, total, hot, recipients: recipients.length });
      } catch (e) {
        functions.logger.error("Daily digest fail", { client: doc.id, err: e.message });
      }
    }

    await tg(`📅 *Daily Digest Run*\n✅ Sent: ${sent}\n⏭️ Skipped: ${skipped}`);
    return null;
  });

// ---------- HOT LEAD INSTANT ALERT (Firestore trigger) ----------
exports.flamingoHotLeadAlert = functions
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .firestore.document("wa_leads/{leadId}")
  .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if (!after) return null;

    // Trigger: lead just became hot OR was already hot but score increased
    const isHotNow =
      !!after.escalate || !!after.qualified || (after.lead_score || 0) >= 8;
    const wasHotBefore =
      !!before?.escalate || !!before?.qualified || (before?.lead_score || 0) >= 8;
    if (!isHotNow || wasHotBefore) return null; // only fire once per lead, on transition

    const clientPhone = after.client;
    if (!clientPhone) return null;

    const clientDoc = await db.collection("wa_clients").doc(clientPhone).get();
    if (!clientDoc.exists) return null;
    const client = clientDoc.data();
    const targets = client.notification_targets;
    if (!targets?.hot_alerts_enabled || !targets?.owner_whatsapp) return null;

    // Pull the recent conversation transcript so Rodrigo has full context
    const convoId = `${clientPhone.replace(/\+/g, "")}_${after.phone.replace(/\+/g, "")}`;
    let transcript = [];
    try {
      const convoDoc = await db.collection("wa_conversations").doc(convoId).get();
      if (convoDoc.exists) {
        const msgs = convoDoc.data().messages || [];
        transcript = msgs.slice(-6); // last 6 messages (3 exchanges)
      }
    } catch (e) { functions.logger.warn("Could not load transcript for alert", e.message); }

    // Build alert
    const lines = [];
    lines.push(`🔥 *HOT LEAD AHORA*`);
    lines.push("");
    lines.push(`👤 ${after.name || "Sin nombre"}`);
    if (after.country_of_interest) lines.push(`🌍 Interés: ${after.country_of_interest}`);
    if (after.zone) lines.push(`📍 Zona: ${after.zone}`);
    if (after.budget_hint) lines.push(`💰 Presupuesto: ${after.budget_hint}`);
    if (after.timeline) lines.push(`⏰ Timeline: ${after.timeline}`);
    if (after.project_interest) lines.push(`🏠 Proyecto: ${after.project_interest}`);
    if (after.intent) lines.push(`🎯 Intención: ${after.intent}`);
    if (after.country_of_origin) lines.push(`🌎 De: ${after.country_of_origin}`);
    lines.push(`📊 Score: ${after.lead_score || "?"}/10`);
    lines.push("");
    lines.push(`📱 WhatsApp: ${after.phone}`);
    lines.push(`💬 wa.me/${(after.phone || "").replace(/[^\d]/g, "")}`);

    // Add conversation transcript so Rodrigo continues seamlessly
    if (transcript.length > 0) {
      lines.push("");
      lines.push("📝 *Conversación reciente:*");
      transcript.forEach((m) => {
        const who = m.role === "user" ? "👤" : "🤖";
        const txt = (m.parts?.[0]?.text || "").slice(0, 180).replace(/\n/g, " ");
        if (txt) lines.push(`${who} ${txt}`);
      });
    } else if (after.last_message_text) {
      lines.push("");
      lines.push(`_Último mensaje:_ "${after.last_message_text.slice(0, 200)}"`);
    }

    const body = lines.join("\n");
    try {
      // Send to primary owner + (optional) pilot owner for QA
      const recipients = [targets.owner_whatsapp];
      if (targets.send_to_pilot_owner_too && targets.pilot_owner_whatsapp) {
        recipients.push(targets.pilot_owner_whatsapp);
      }
      for (const recipient of recipients) {
        await sendWA(recipient, clientPhone, body, client.twilio_subaccount_sid);
      }
      functions.logger.info("Hot lead alert sent", {
        client: clientPhone,
        lead: after.phone,
        score: after.lead_score,
        recipients: recipients.length,
      });
      // Also mirror to Telegram for JegoDigital agency oversight
      await tg(`🔥 *HOT LEAD* (${client.name || clientPhone})\n\n` + body);
    } catch (e) {
      functions.logger.error("Hot lead alert fail", e.message);
    }
    return null;
  });

// ---------- ON-DEMAND TRIGGER (HTTPS, for testing) ----------
exports.flamingoCRMOpsOnDemand = functions
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    const action = req.query.action || "digest";
    const clientPhone = req.query.client || "+12527338402";

    try {
      const clientDoc = await db.collection("wa_clients").doc(clientPhone).get();
      if (!clientDoc.exists) return res.status(404).json({ error: "Client not found" });
      const client = clientDoc.data();

      if (action === "digest") {
        const targets = client.notification_targets || {};
        if (!targets.owner_whatsapp) {
          return res.status(400).json({ error: "No owner_whatsapp configured" });
        }
        const { body, total, hot } = await buildDigest(clientPhone, client);
        const sent = await sendWA(
          targets.owner_whatsapp,
          clientPhone,
          body,
          client.twilio_subaccount_sid
        );
        return res.status(200).json({
          ok: true,
          digest: { total, hot },
          twilio_sid: sent.sid,
          twilio_error: sent.error_message,
        });
      }

      if (action === "followup") {
        // Manual trigger of follow-up sweep for one client
        const result = await runFollowUpSweep(clientPhone, client);
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: "Unknown action" });
    } catch (e) {
      functions.logger.error("OnDemand fail", e);
      return res.status(500).json({ error: e.message });
    }
  });

// ---------- FOLLOW-UP NURTURE (every 6 hours, sweeps inactive leads) ----------
// 24h silent → "¿Pude resolver tu duda?"
// 72h silent → suggests an alternate project from inventory
// 7d silent  → soft urgency about scarcity / Mundial 2026

async function callGeminiForFollowUp(systemPrompt, history, instruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt + "\n\nINSTRUCCIÓN ESPECIAL DE FOLLOW-UP: " + instruction }] },
    contents: history,
    generationConfig: { temperature: 0.7, maxOutputTokens: 250 },
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.replace(/<META>[\s\S]*?<\/META>/gi, "").replace(/<META.*$/s, "").trim();
}

async function runFollowUpSweep(clientPhone, client) {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const conversationsSnap = await db
    .collection("wa_conversations")
    .where("client_to", "==", clientPhone)
    .get();

  let attempted = 0, sent = 0, skipped = 0;
  const results = [];

  for (const doc of conversationsSnap.docs) {
    const c = doc.data();
    const lastUpdated = c.updated_at?.toDate?.() || new Date(c.updated_at);
    if (!lastUpdated || isNaN(lastUpdated)) { skipped++; continue; }
    const hoursSilent = (now - lastUpdated.getTime()) / HOUR;

    // Skip if no human takeover marker but conversation already had Sofía's last word and human took over manually
    if (c.human_takeover_until && new Date(c.human_takeover_until) > new Date()) { skipped++; continue; }
    // Skip if already nurtured at this stage
    const stagesSent = c.followups_sent || {};

    let stage = null, instruction = null;
    if (hoursSilent >= 24 && hoursSilent < 72 && !stagesSent["24h"]) {
      stage = "24h";
      instruction = "El lead lleva 24h sin responder. Genera UN solo mensaje breve, cálido y no insistente preguntando si pudimos resolver su duda. Máximo 2 oraciones. Termina con una pregunta abierta. NO uses emoji. NO repitas info anterior. Tono: como un asesor amigo haciendo check-in casual.";
    } else if (hoursSilent >= 72 && hoursSilent < 168 && !stagesSent["72h"]) {
      stage = "72h";
      instruction = "El lead lleva 3 días sin responder. Genera UN mensaje sugiriendo un proyecto alternativo del inventario que también podría interesarle (basado en su búsqueda anterior). Máximo 3 oraciones. Termina con una pregunta. Tono: 'oye, también tenemos esto que podría gustarte'.";
    } else if (hoursSilent >= 168 && hoursSilent < 24 * 30 && !stagesSent["7d"]) {
      stage = "7d";
      instruction = "El lead lleva 7 días sin responder. Genera UN mensaje con soft urgency real: menciona que esta semana se apartaron unidades del proyecto que le interesaba, o que el Mundial 2026 está disparando demanda. Máximo 3 oraciones. Termina con CTA suave. NO seas agresivo.";
    }

    if (!stage) { skipped++; continue; }
    attempted++;

    try {
      const messages = c.messages || [];
      const reply = await callGeminiForFollowUp(client.systemPrompt || "", messages.slice(-8), instruction);
      if (!reply || reply.length < 10) { skipped++; continue; }
      // Send via Twilio (multi-tenant aware)
      await sendWA(c.lead_phone, clientPhone, reply, client.twilio_subaccount_sid);
      // Mark stage sent + append to messages
      messages.push({ role: "model", parts: [{ text: reply }], at: new Date().toISOString(), tag: `followup_${stage}` });
      await doc.ref.update({
        messages: messages.slice(-50),
        followups_sent: { ...stagesSent, [stage]: new Date().toISOString() },
        last_followup_stage: stage,
      });
      sent++;
      results.push({ lead: c.lead_phone, stage, sent: true });
      functions.logger.info("Follow-up sent", { client: clientPhone, lead: c.lead_phone, stage });
    } catch (e) {
      functions.logger.error("Follow-up fail", { lead: c.lead_phone, err: e.message });
    }
  }

  return { client: clientPhone, attempted, sent, skipped, total_convos: conversationsSnap.size, results };
}

exports.flamingoFollowUpCron = functions
  .runWith({ memory: "512MB", timeoutSeconds: 300 })
  .pubsub.schedule("0 */6 * * *") // every 6 hours
  .timeZone("America/Cancun")
  .onRun(async () => {
    const clientsSnap = await db.collection("wa_clients").get();
    let totalSent = 0;
    for (const doc of clientsSnap.docs) {
      const client = doc.data();
      if (!client.notification_targets?.hot_alerts_enabled) continue;
      const result = await runFollowUpSweep(doc.id, client);
      totalSent += result.sent;
      functions.logger.info("Follow-up sweep done", result);
    }
    if (totalSent > 0) {
      await tg(`🔁 *Follow-up Cron*\n✅ Sent: ${totalSent} nurture messages across all clients`);
    }
    return null;
  });
