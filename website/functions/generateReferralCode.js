/**
 * generateReferralCode — LOOP v1 client code generator.
 *
 * Trigger 1: Firestore onCreate on `clients/{clientId}` →
 *   auto-generates `referralCode` if missing.
 * Trigger 2: HTTP backfill `generateReferralCodeBackfill` → loops
 *   over all `clients/*` and fills missing codes (idempotent).
 *
 * Code format: `JD-{first3letters_uppercase}{4digits}` e.g. `JD-FLA1842`.
 *
 * HR compliance:
 *   - HR-1: real Firestore reads + writes.
 *   - HR-6: idempotent — never overwrites an existing referralCode.
 *
 * Built 2026-05-05.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const logger = functions.logger;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

function makeCode(name) {
  const cleaned = (name || "client").replace(/[^A-Za-z]/g, "").toUpperCase();
  const prefix = (cleaned + "XXX").slice(0, 3);
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `JD-${prefix}${digits}`;
}

async function tg(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" },
      { timeout: 8000 },
    );
  } catch (e) {
    logger.warn("Telegram failed:", e.message);
  }
}

async function generateForDoc(clientId, data) {
  if (data?.referralCode) return { skipped: true, code: data.referralCode };
  const code = makeCode(data?.name || data?.company_name || data?.client || clientId);
  await db.collection("clients").doc(clientId).set({
    referralCode: code,
    referralCodeGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { skipped: false, code };
}

// ---------- Trigger 1: onCreate ----------
exports.generateReferralCodeOnSignup = functions.firestore
  .document("clients/{clientId}")
  .onCreate(async (snap, context) => {
    const clientId = context.params.clientId;
    const data = snap.data() || {};
    try {
      const r = await generateForDoc(clientId, data);
      if (r.skipped) {
        logger.info(`Client ${clientId} already has referralCode ${r.code}`);
      } else {
        logger.info(`Generated referralCode ${r.code} for ${clientId}`);
        await tg(`🆕 Cliente nuevo: *${data.name || clientId}* — código de referido \`${r.code}\``);
      }
    } catch (e) {
      logger.error(`generateReferralCodeOnSignup failed for ${clientId}:`, e.message);
    }
    return null;
  });

// ---------- Trigger 2: HTTP backfill ----------
exports.generateReferralCodeBackfill = functions
  .runWith({ timeoutSeconds: 300, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    try {
      const snap = await db.collection("clients").get();
      let generated = 0, skipped = 0;
      const out = [];
      for (const doc of snap.docs) {
        const r = await generateForDoc(doc.id, doc.data());
        if (r.skipped) skipped++;
        else { generated++; out.push({ clientId: doc.id, code: r.code }); }
      }
      if (generated > 0) {
        await tg(`🔁 Referral backfill: generó ${generated} nuevos códigos · saltó ${skipped}`);
      }
      res.status(200).json({ success: true, generated, skipped, total: snap.size, out });
    } catch (e) {
      logger.error("generateReferralCodeBackfill error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });
