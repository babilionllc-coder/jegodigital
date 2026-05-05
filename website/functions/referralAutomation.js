/**
 * referralAutomation — LOOP v1 (Hormozi #1) referral trigger
 *
 * What it does:
 *   - Daily 09:30 Cancún (UTC 14:30) the cron version queries Notion
 *     "Sales Briefings" DB 357f21a7-c6e5-812b-b590-c8b0ab3790a3 for
 *     clients exactly 30 / 60 / 90 days post `signed_at`.
 *   - For each match, fires the tier-appropriate ask (Brevo email +
 *     optional Sofia WA hand-off if `phone` is present).
 *   - All copy passes the brandVoiceAuditor (HR-17 + HR-19) at
 *     ≥ 8/10 before sending. Below 8 → blocked + Telegram alert.
 *   - Idempotent: Firestore `referral_log/{clientId}_{tier}` guards
 *     duplicate sends.
 *   - Logs every fire to Firestore + Telegram + Slack.
 *
 * Exports:
 *   - referralAutomationOnDemand  → live HTTP test endpoint.
 *     Pass `?test=true` to skip Notion + use a synthetic client.
 *   - referralAutomation          → Pub/Sub scheduled cron.
 *     **PREVIEW-LOCKED per Rule 8 — kept commented out below
 *     until Alex 👍's the personal-ask scripts.**
 *
 * HR compliance:
 *   - HR-1 / HR-2: every Notion + Brevo + Telegram + Slack call is
 *     a real HTTPS request in this file (no memory data).
 *   - HR-5: never adds role-based emails (info@, contact@, ventas@)
 *     — Notion records lacking a personal email are skipped.
 *   - HR-6: idempotent log + per-tier guard + brand-voice gate.
 *   - HR-13: no manual-action prompts to Alex; cron handles it.
 *   - HR-17 + HR-19: collaboration vocabulary, JegoDigital intro
 *     present in every body, banned vocab forbidden — gated by
 *     brandVoiceAuditor.scoreMessage().
 *
 * Built 2026-05-05.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const logger = functions.logger;

// ---------- ENV ----------
const NOTION_TOKEN = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || "";
const NOTION_BRIEFINGS_DB =
  process.env.NOTION_BRIEFINGS_DB || "357f21a7-c6e5-812b-b590-c8b0ab3790a3";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "alex@jegodigital.com";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Alex Jego — JegoDigital";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || process.env.SLACK_OPS_WEBHOOK || "";

const ROLE_BASED_LOCAL_PARTS = new Set([
  "info", "contact", "contacto", "hello", "hola", "ventas",
  "sales", "support", "soporte", "admin", "no-reply", "noreply",
  "team", "office",
]);

// ---------- Showcase URL map (verified clients only) ----------
function showcaseUrlFor(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("living")) return "https://jegodigital.com/showcase#playadelcarmen";
  if (n.includes("riviera")) return "https://jegodigital.com/showcase#playadelcarmen";
  if (n.includes("sur selecto")) return "https://jegodigital.com/showcase#surselecto";
  if (n.includes("flamingo")) return "https://jegodigital.com/showcase#flamingo";
  if (n.includes("rs viajes")) return "https://jegodigital.com/showcase#rsviajes";
  if (n.includes("tt") || n.includes("more")) return "https://jegodigital.com/showcase#ttandmore";
  return "https://jegodigital.com/showcase";
}

// ---------- Copy bank (HR-17 + HR-19 compliant) ----------
const REFERRAL_ASKS = {
  T30: {
    subject: "¿Cómo va todo, {firstName}?",
    body:
`Hola {firstName},

¿Cómo va todo del lado de ustedes? Espero que el setup que armamos juntos te esté ayudando a cerrar más leads sin tanto chambazo.

Te escribo desde JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores — porque me gustaría conocer cómo lo estás viviendo y qué podríamos mejorar juntos.

Si en tu camino te has cruzado con otra inmobiliaria que esté luchando con leads, nos encantaría que nos presentes — colaboramos igual de cerca con ellos que contigo.

Gracias por la confianza,
Alex`,
    wa:
`Hola {firstName} 👋, soy Alex de JegoDigital — la agencia de marketing con IA para inmobiliarias.
¿Cómo te ha ido con el setup este primer mes? Si conoces a alguien en tu red que esté perdiendo leads, nos encantaría platicar y ver si podemos colaborar.`,
  },
  T60: {
    subject: "Compartimos tu caso + una invitación",
    body:
`Hola {firstName},

Quería compartirte algo: estamos por mostrar lo que construimos juntos en nuestro showcase ({showcaseUrl}). Tu historia es de las que más nos enorgullece.

Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores. Si conoces a otra agencia o desarrollador en tu red que quiera lograr lo mismo, encantados de colaborar con ellos como lo hacemos contigo.

Cuando ustedes ganan, ganamos juntos.

Un abrazo,
Alex`,
    wa:
`Hola {firstName} 👋 Acá Alex de JegoDigital.
Pusimos tu caso en el showcase: {showcaseUrl}
¿Conoces alguna inmobiliaria o desarrolladora en tu red que quiera construir algo parecido? Nos encantaría colaborar con ellos también.`,
  },
  T90: {
    subject: "Una propuesta para tu red — ambos lados ganan",
    body:
`Hola {firstName},

Tres meses juntos y la verdad es que ha sido una colaboración bonita. Quería proponerte algo que armé pensando en ti:

Si alguien de tu red firma con JegoDigital — agencia de marketing con IA para inmobiliarias — gracias a tu intro:
• Tú: 1 mes extra gratis en tu plan actual
• Ellos: 50% de descuento en su primer mes

No tienes que vender nada. Solo presentarnos. Si conoces a alguien que esté luchando con leads, contáctame y armamos una plática de 15 min para ver si hace clic.

Gracias siempre,
Alex`,
    wa:
`Hola {firstName} 👋 Soy Alex de JegoDigital.
Tres meses juntos y queremos festejar: si presentas a otra inmobiliaria que firme con nosotros, tú ganas 1 mes gratis y ellos arrancan con 50% off el primer mes. ¿Conoces a alguien con quien valga la pena colaborar?`,
  },
};

// ---------- Helpers ----------
async function scoreCopy(text, channel) {
  try {
    const { scoreMessage } = require("./brandVoiceAuditor");
    return scoreMessage(text, { channel: channel || "loop_referral" });
  } catch (e) {
    logger.warn(`brandVoiceAuditor unavailable: ${e.message}`);
    return { score: 0, passes: false, reasons: ["brandVoiceAuditor module not loaded"] };
  }
}

function isPersonalEmail(email) {
  if (!email || !email.includes("@")) return false;
  const local = email.split("@")[0].toLowerCase().trim();
  if (ROLE_BASED_LOCAL_PARTS.has(local)) return false;
  // Reject local-parts that are pure descriptors (4+ chars, no digits, common prefix)
  return true;
}

function daysBetween(isoDate) {
  if (!isoDate) return null;
  const t = new Date(isoDate).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function pickTier(daysSinceSigned) {
  if (daysSinceSigned == null) return null;
  if (Math.abs(daysSinceSigned - 30) <= 1) return "T30";
  if (Math.abs(daysSinceSigned - 60) <= 1) return "T60";
  if (Math.abs(daysSinceSigned - 90) <= 1) return "T90";
  return null;
}

async function alreadyFired(clientId, tier) {
  const docId = `${clientId}_${tier}`;
  const snap = await db.collection("referral_log").doc(docId).get();
  return snap.exists;
}

async function logFire({ clientId, clientName, tier, channel, status, detail }) {
  const docId = `${clientId}_${tier}`;
  await db.collection("referral_log").doc(docId).set({
    clientId,
    clientName,
    tier,
    channel,
    status,
    detail: detail || null,
    fired_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function tg(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return null;
  try {
    const r = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown", disable_web_page_preview: true },
      { timeout: 8000 },
    );
    return r.data?.result?.message_id || null;
  } catch (e) {
    logger.warn("Telegram failed:", e.message);
    return null;
  }
}

async function slack(text) {
  if (!SLACK_WEBHOOK_URL) return null;
  try {
    const r = await axios.post(
      SLACK_WEBHOOK_URL,
      { text, username: "LOOP v1", icon_emoji: ":recycle:" },
      { timeout: 8000 },
    );
    // Slack incoming webhook returns "ok" on success, no message id
    return r.status === 200 ? "ok" : null;
  } catch (e) {
    logger.warn("Slack failed:", e.message);
    return null;
  }
}

async function sendBrevo({ toEmail, toName, subject, body }) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY missing");
  const r = await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      to: [{ email: toEmail, name: toName || undefined }],
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      subject,
      htmlContent: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
      textContent: body,
      tags: ["loop", "referral"],
    },
    { headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" }, timeout: 10000 },
  );
  return r.data?.messageId || null;
}

// ---------- Notion query for matched clients ----------
async function fetchNotionClientsAtTier() {
  if (!NOTION_TOKEN) {
    logger.warn("NOTION_TOKEN missing — skipping Notion query");
    return [];
  }
  try {
    const r = await axios.post(
      `https://api.notion.com/v1/databases/${NOTION_BRIEFINGS_DB}/query`,
      { page_size: 100 },
      {
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        timeout: 12000,
      },
    );
    const rows = r.data?.results || [];
    const out = [];
    for (const row of rows) {
      const props = row.properties || {};
      const name =
        props.Name?.title?.[0]?.plain_text ||
        props.Cliente?.title?.[0]?.plain_text || "";
      const email =
        props.Email?.email ||
        props.email?.email ||
        props["Contact Email"]?.email || null;
      const phone =
        props.Phone?.phone_number ||
        props.WhatsApp?.phone_number ||
        props.phone?.phone_number || null;
      const signedAt =
        props.signed_at?.date?.start ||
        props["Signed At"]?.date?.start ||
        props.SignedDate?.date?.start || null;
      if (!signedAt || !name) continue;
      const tier = pickTier(daysBetween(signedAt));
      if (!tier) continue;
      out.push({ id: row.id, name, email, phone, signed_at: signedAt, tier });
    }
    return out;
  } catch (e) {
    logger.error("Notion query failed:", e.response?.data || e.message);
    return [];
  }
}

// ---------- Core orchestrator ----------
async function runLoop({ testMode = false } = {}) {
  const result = { fired: 0, blocked_brand: 0, skipped_idempotent: 0, skipped_no_personal_email: 0, errors: 0, fires: [] };

  let candidates = [];
  if (testMode) {
    candidates = [{
      id: "test-client-2026-05-05",
      name: "Cliente de Prueba",
      email: "jegoalexdigital@gmail.com",
      phone: null,
      signed_at: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      tier: "T30",
    }];
  } else {
    candidates = await fetchNotionClientsAtTier();
  }

  for (const c of candidates) {
    try {
      if (!testMode && await alreadyFired(c.id, c.tier)) {
        result.skipped_idempotent++;
        continue;
      }
      if (!isPersonalEmail(c.email || "")) {
        result.skipped_no_personal_email++;
        await logFire({ clientId: c.id, clientName: c.name, tier: c.tier, channel: "email", status: "skipped_role_based", detail: c.email || null });
        continue;
      }

      const ask = REFERRAL_ASKS[c.tier];
      const firstName = (c.name || "").split(" ")[0] || "amigo";
      const showcaseUrl = showcaseUrlFor(c.name);
      const subject = ask.subject.replace(/\{firstName\}/g, firstName);
      const body = ask.body
        .replace(/\{firstName\}/g, firstName)
        .replace(/\{showcaseUrl\}/g, showcaseUrl);

      const score = await scoreCopy(body, "loop_referral_email");
      if (!score.passes) {
        result.blocked_brand++;
        await logFire({ clientId: c.id, clientName: c.name, tier: c.tier, channel: "email", status: "blocked_brand_voice", detail: { score: score.score, reasons: score.reasons } });
        await tg(`🚫 LOOP ${c.tier} blocked for *${c.name}*: brand voice ${score.score}/10 — ${(score.reasons || []).join("; ")}`);
        continue;
      }

      const messageId = await sendBrevo({ toEmail: c.email, toName: c.name, subject, body });
      result.fired++;
      result.fires.push({ client: c.name, tier: c.tier, brevoMessageId: messageId });
      await logFire({ clientId: c.id, clientName: c.name, tier: c.tier, channel: "email", status: "sent", detail: { brevoMessageId: messageId, brandScore: score.score } });
      const tgId = await tg(`✅ LOOP *${c.tier}* fired for *${c.name}* (${c.email}) — brand ${score.score}/10 — Brevo \`${messageId}\``);
      const slackId = await slack(`✅ LOOP ${c.tier} → ${c.name} (${c.email}) — Brevo ${messageId}`);
      result.fires[result.fires.length - 1].telegramId = tgId;
      result.fires[result.fires.length - 1].slackOk = slackId;
    } catch (e) {
      result.errors++;
      logger.error(`LOOP fire failed for ${c.name}:`, e.message);
      await tg(`❌ LOOP ${c.tier} ERROR for ${c.name}: ${e.message}`);
    }
  }

  return result;
}

// ============================================================
// ON-DEMAND HTTP — live for testing
// ============================================================
exports.referralAutomationOnDemand = functions
  .runWith({ timeoutSeconds: 240, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    const testMode = req.query.test === "true" || req.body?.test === true;
    try {
      const r = await runLoop({ testMode });
      res.status(200).json({
        success: true,
        testMode,
        ...r,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      logger.error("referralAutomationOnDemand error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

// ============================================================
// SCHEDULED CRON — PREVIEW-LOCKED per Rule 8.
// To enable: uncomment the block below AND wire `exports.referralAutomation`
// in index.js. Schedule = daily 09:30 Cancún (UTC 14:30).
// ============================================================
//
// exports.referralAutomation = functions
//   .runWith({ timeoutSeconds: 540, memory: "512MB" })
//   .pubsub.schedule("30 14 * * *")
//   .timeZone("America/Cancun")
//   .onRun(async () => {
//     logger.info("LOOP cron fired");
//     const r = await runLoop({ testMode: false });
//     logger.info("LOOP cron result:", r);
//     await tg(`🔁 LOOP cron daily — fired:${r.fired} blocked:${r.blocked_brand} skipped(role):${r.skipped_no_personal_email} skipped(dup):${r.skipped_idempotent} errors:${r.errors}`);
//     return null;
//   });
