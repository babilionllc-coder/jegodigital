/**
 * manychatWebhookMirror — receives ManyChat External Request webhooks and
 * mirrors every Sofia conversation event to Firestore.
 *
 * Why this exists: sofiaConversationAudit has been writing
 *   "ManyChat API returned empty. Wire the ManyChat webhook mirror"
 * for 10+ days because the ManyChat /v2/subscriber/getInfo API returns
 * empty for our workspace. The fix is to flip the data flow: instead of
 * polling ManyChat, we let ManyChat PUSH every conversation event to us.
 *
 * Wire-up (one-time, in ManyChat UI):
 *   1. Settings → Installed Apps → External Request
 *   2. Add Action button on EVERY message receipt + reply send block in the
 *      Sofia flow (https://app.manychat.com/fb4452446)
 *   3. Method: POST  URL: https://us-central1-jegodigital-e02fb.cloudfunctions.net/manychatWebhookMirror
 *   4. Headers: { "x-mc-secret": "<MANYCHAT_WEBHOOK_SECRET from GH Secrets>" }
 *   5. Body (JSON):
 *        {
 *          "event": "message_in" | "message_out" | "tag_added" | "field_set",
 *          "timestamp": "{{system_time}}",
 *          "subscriber_id": "{{user_id}}",
 *          "subscriber": {
 *            "first_name": "{{first_name}}",
 *            "last_name": "{{last_name}}",
 *            "phone": "{{phone}}",
 *            "email": "{{email}}",
 *            "ig_username": "{{ig_username}}",
 *            "channel": "{{last_input_channel}}"
 *          },
 *          "message": {
 *            "text": "{{last_input_text}}",
 *            "intent": "{{intent_label}}"
 *          },
 *          "audit_request": "{{audit_requested}}",
 *          "calendly_clicked": "{{calendly_clicked}}"
 *        }
 *
 * Firestore writes:
 *   sofia_conversations/{subscriber_id}            — latest snapshot per subscriber
 *   sofia_conversations/{subscriber_id}/events/{ts} — append-only event log
 *   wa_leads/{phone_e164}                          — promoted to lead if phone present
 *   sofia_audits_realtime/{YYYY-MM-DD}             — daily counter (samples bucketed)
 *
 * Replaces the broken sofia_audits "ManyChat API returned empty" loop —
 * sofiaConversationAudit now has real data to grade.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

async function sendTelegram(text) {
  const axios = require("axios");
  const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
  const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
    }, { timeout: 8000 });
    return true;
  } catch (e) {
    functions.logger.warn("manychatWebhookMirror Telegram failed:", e.message);
    return false;
  }
}

function normalizeE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("52")) return `+${digits}`;
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length >= 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function dailyKey(d = new Date()) {
  return new Date(d.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

exports.manychatWebhookMirror = functions.https.onRequest(async (req, res) => {
  // Auth — refuse unsigned requests
  const expectedSecret = process.env.MANYCHAT_WEBHOOK_SECRET;
  const providedSecret = req.headers["x-mc-secret"] || req.query.secret;
  if (expectedSecret && providedSecret !== expectedSecret) {
    functions.logger.warn("manychatWebhookMirror: bad secret", {
      ip: req.ip, ua: req.headers["user-agent"],
    });
    return res.status(403).json({ error: "forbidden" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const body = req.body || {};
  const subscriberId = String(body.subscriber_id || body.subscriber?.id || "").trim();
  if (!subscriberId) {
    return res.status(400).json({ error: "subscriber_id required" });
  }

  const event = String(body.event || "message_in");
  const ts = body.timestamp ? new Date(body.timestamp) : new Date();
  const tsIso = ts.toISOString();
  const subscriber = body.subscriber || {};
  const message = body.message || {};
  const phoneE164 = normalizeE164(subscriber.phone);

  // 1) Snapshot latest state per subscriber
  try {
    await db.collection("sofia_conversations").doc(subscriberId).set({
      subscriber_id: subscriberId,
      first_name: subscriber.first_name || "",
      last_name: subscriber.last_name || "",
      phone: phoneE164 || subscriber.phone || "",
      email: subscriber.email || "",
      ig_username: subscriber.ig_username || "",
      channel: subscriber.channel || "unknown",
      last_event: event,
      last_message_text: message.text || "",
      last_intent: message.intent || "",
      last_event_at: admin.firestore.Timestamp.fromDate(ts),
      audit_requested: body.audit_request === true || body.audit_request === "true" || body.audit_request === "1",
      calendly_clicked: body.calendly_clicked === true || body.calendly_clicked === "true" || body.calendly_clicked === "1",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    functions.logger.error("manychatWebhookMirror: snapshot failed", { err: e.message, subscriberId });
  }

  // 2) Append-only event log
  try {
    const eventDocId = `${tsIso.replace(/[:.]/g, "-")}_${event}`;
    await db.collection("sofia_conversations")
      .doc(subscriberId)
      .collection("events")
      .doc(eventDocId)
      .set({
        event,
        ts: admin.firestore.Timestamp.fromDate(ts),
        text: message.text || "",
        intent: message.intent || "",
        raw: body,
        received_at: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (e) {
    functions.logger.error("manychatWebhookMirror: event log failed", { err: e.message, subscriberId });
  }

  // 3) Promote to wa_leads if phone present + qualifies as a lead event
  if (phoneE164 && (event === "message_in" || event === "tag_added" || body.audit_request === true)) {
    try {
      await db.collection("wa_leads").doc(phoneE164.replace(/\D/g, "")).set({
        phone: phoneE164,
        first_name: subscriber.first_name || "",
        last_name: subscriber.last_name || "",
        email: subscriber.email || "",
        ig_username: subscriber.ig_username || "",
        channel: subscriber.channel || "manychat",
        manychat_subscriber_id: subscriberId,
        last_message_at: admin.firestore.Timestamp.fromDate(ts),
        source: "manychat_webhook_mirror",
        audit_requested: body.audit_request === true || body.audit_request === "true",
        calendly_clicked: body.calendly_clicked === true || body.calendly_clicked === "true",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      functions.logger.warn("manychatWebhookMirror: wa_leads upsert failed", { err: e.message });
    }
  }

  // 4) Daily counter for the sofia_audits_realtime collection
  try {
    const key = dailyKey(ts);
    await db.collection("sofia_audits_realtime").doc(key).set({
      date: key,
      events_total: admin.firestore.FieldValue.increment(1),
      [`events_${event}`]: admin.firestore.FieldValue.increment(1),
      last_event_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    functions.logger.warn("manychatWebhookMirror: daily counter failed", { err: e.message });
  }

  // 5) High-signal alerts — audit request or calendly click should ping Telegram
  if (body.audit_request === true || body.audit_request === "true" || body.audit_request === "1") {
    const name = `${subscriber.first_name || ""} ${subscriber.last_name || ""}`.trim() || "Subscriber";
    const channel = subscriber.channel || "WA/IG";
    const ig = subscriber.ig_username ? ` (IG: @${subscriber.ig_username})` : "";
    const ph = phoneE164 ? ` ${phoneE164}` : "";
    await sendTelegram(`🟢 *Sofia AUDIT REQUEST* — ${name}${ig}${ph} via ${channel}\n   "${(message.text || "").slice(0, 140)}"`);
  } else if (body.calendly_clicked === true || body.calendly_clicked === "true") {
    const name = `${subscriber.first_name || ""} ${subscriber.last_name || ""}`.trim() || "Subscriber";
    await sendTelegram(`📅 *Sofia → Calendly* — ${name} clicked the Calendly link`);
  }

  return res.status(200).json({
    ok: true,
    subscriber_id: subscriberId,
    event,
    promoted_to_wa_leads: !!(phoneE164 && (event === "message_in" || event === "tag_added")),
  });
});

/**
 * Health check — used by deploy smoke-test to verify the function is reachable
 * without writing data. GET returns { ok: true } if function is alive.
 */
exports.manychatWebhookMirrorHealth = functions.https.onRequest(async (req, res) => {
  return res.status(200).json({ ok: true, function: "manychatWebhookMirror", time: new Date().toISOString() });
});
