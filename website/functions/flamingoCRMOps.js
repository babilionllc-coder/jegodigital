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
    lines.push(`📊 Score: ${after.lead_score || "?"}/10`);
    lines.push("");
    lines.push(`📱 WhatsApp del lead: ${after.phone}`);
    lines.push(`💬 wa.me/${(after.phone || "").replace(/[^\d]/g, "")}`);
    lines.push("");
    if (after.last_message_text) {
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

      return res.status(400).json({ error: "Unknown action" });
    } catch (e) {
      functions.logger.error("OnDemand fail", e);
      return res.status(500).json({ error: e.message });
    }
  });
