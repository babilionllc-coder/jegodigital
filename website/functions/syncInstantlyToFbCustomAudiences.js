/**
 * syncInstantlyToFbCustomAudiences.js
 *
 * Daily autonomous sync — pulls fresh Instantly leads since last run, hashes
 * emails, appends to FB Custom Audiences (MX + USA). Posts Telegram digest.
 *
 * Cron: 9:00 AM CDMX daily (america_mexico_city timezone)
 *
 * Reads/writes Firestore: meta/instantlySyncState
 *   - lastSyncTimestamp: ISO string of last successful run start
 *   - lastRunStats: { mxAppended, usaAppended, totalPulled, durationMs }
 *
 * Required env (from .env / GH Secrets):
 *   INSTANTLY_API_KEY
 *   FB_USER_TOKEN
 *   META_AD_ACCOUNT_ID            (default 968739288838315)
 *   META_CA_INSTANTLY_MX_ID       (default 120241357699890662)
 *   META_CA_INSTANTLY_USA_ID      (default 120241357703100662)
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY || "";
const FB_TOKEN = process.env.FB_USER_TOKEN || "";
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "968739288838315";
const CA_MX_ID = process.env.META_CA_INSTANTLY_MX_ID || "120241357699890662";
const CA_USA_ID = process.env.META_CA_INSTANTLY_USA_ID || "120241357703100662";
const TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";

const GRAPH = "https://graph.facebook.com/v22.0";

// ---------- Helpers ----------
function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

function segmentGeo(lead) {
  const email = (lead.email || "").toLowerCase();
  const website = (lead.website || "").toLowerCase();
  const phone = (lead.phone || "").replace(/[^\d+]/g, "");
  const listName = (lead.list_name || lead.campaign_name || "").toLowerCase();

  if (email.endsWith(".mx") || email.includes(".mx")) return "MX";
  if (website.endsWith(".mx") || website.includes(".com.mx")) return "MX";
  if (phone.startsWith("+52") || phone.startsWith("52")) return "MX";
  if (
    /\b(mexico|cancun|cdmx|tulum|guadalajara|monterrey|playa|merida|riviera|inmobiliaria)\b/.test(
      listName
    )
  )
    return "MX";
  if (/\b(miami|usa|florida|us\b|united states|hispanic)\b/.test(listName))
    return "USA";
  if (phone.startsWith("+1") || /^1\d{10}$/.test(phone)) return "USA";
  return "MX";
}

async function pullInstantlyLeadsSince(sinceIso) {
  const all = [];
  let next = null;
  let page = 0;
  while (page < 200) {
    page++;
    const body = { limit: 100 };
    if (next) body.starting_after = next;
    // Instantly v2 doesn't have a pure since-filter on the leads/list endpoint,
    // but we paginate newest-first and stop when we hit older records.
    const res = await fetch("https://api.instantly.ai/api/v2/leads/list", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INSTANTLY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    const items = j.items || [];
    if (!items.length) break;
    let stop = false;
    for (const item of items) {
      const ts = item.timestamp_created || item.created_at;
      if (sinceIso && ts && new Date(ts) < new Date(sinceIso)) {
        stop = true;
        break;
      }
      all.push(item);
    }
    if (stop) break;
    next = j.next_starting_after || null;
    if (!next) break;
  }
  return all;
}

async function pushUsersToCA(caId, hashedEmails) {
  if (!hashedEmails.length) return { pushed: 0, invalid: 0 };
  const BATCH = 5000;
  let pushed = 0;
  let invalid = 0;
  for (let i = 0; i < hashedEmails.length; i += BATCH) {
    const batch = hashedEmails.slice(i, i + BATCH);
    const payload = {
      schema: ["EMAIL_SHA256"],
      data: batch.map((h) => [h]),
    };
    const url = `${GRAPH}/${caId}/users?access_token=${FB_TOKEN}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`FB push: ${j.error.message}`);
    pushed += j.num_received || batch.length;
    invalid += j.num_invalid_entries || 0;
  }
  return { pushed, invalid };
}

async function tg(msg) {
  if (!TG_BOT || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: msg,
        parse_mode: "Markdown",
      }),
    });
  } catch (e) {
    console.error("[syncInstantlyToFbCA] telegram error:", e.message);
  }
}

// ---------- Core sync (runnable from scheduler OR HTTP) ----------
async function runSync({ since } = {}) {
  const startTs = Date.now();
  const stateRef = db.collection("meta").doc("instantlySyncState");
  const stateDoc = await stateRef.get();
  const state = stateDoc.exists ? stateDoc.data() : {};
  const sinceIso = since || state.lastSyncTimestamp || null;

  console.log(
    `[syncInstantlyToFbCA] starting — since=${sinceIso || "BEGINNING"}`
  );

  const leads = await pullInstantlyLeadsSince(sinceIso);
  console.log(`[syncInstantlyToFbCA] pulled ${leads.length} leads`);

  const mxHashes = [];
  const usaHashes = [];
  let skippedNoEmail = 0;
  for (const l of leads) {
    if (!l.email) {
      skippedNoEmail++;
      continue;
    }
    const geo = segmentGeo(l);
    const h = hashEmail(l.email);
    if (geo === "MX") mxHashes.push(h);
    else usaHashes.push(h);
  }

  const mxRes = await pushUsersToCA(CA_MX_ID, mxHashes);
  const usaRes = await pushUsersToCA(CA_USA_ID, usaHashes);

  const stats = {
    mxAppended: mxRes.pushed,
    usaAppended: usaRes.pushed,
    mxInvalid: mxRes.invalid,
    usaInvalid: usaRes.invalid,
    totalPulled: leads.length,
    skippedNoEmail,
    durationMs: Date.now() - startTs,
  };

  await stateRef.set(
    {
      lastSyncTimestamp: new Date().toISOString(),
      lastRunStats: stats,
      lastRunFinishedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const digest =
    `📡 *Instantly → FB CA sync*\n` +
    `🇲🇽 MX:  +${stats.mxAppended} emails\n` +
    `🇺🇸 USA: +${stats.usaAppended} emails\n` +
    `📥 Pulled: ${stats.totalPulled}  (no-email: ${stats.skippedNoEmail})\n` +
    `⏱ ${(stats.durationMs / 1000).toFixed(1)}s\n` +
    `🆔 MX_CA: \`${CA_MX_ID}\`  USA_CA: \`${CA_USA_ID}\``;
  await tg(digest);

  console.log("[syncInstantlyToFbCA] DONE", stats);
  return stats;
}

// ---------- Scheduled (9am CDMX = 15:00 UTC during DST, 16:00 UTC standard) ----------
exports.syncInstantlyToFbCustomAudiences = functions
  .runWith({ memory: "512MB", timeoutSeconds: 540 })
  .pubsub.schedule("0 9 * * *")
  .timeZone("America/Mexico_City")
  .onRun(async () => {
    try {
      await runSync();
      return null;
    } catch (e) {
      console.error("[syncInstantlyToFbCA] FAILED:", e);
      await tg(`❌ *Instantly→FB CA sync FAILED*\n\`${e.message}\``);
      throw e;
    }
  });

// ---------- HTTP trigger (manual / on-demand) ----------
exports.syncInstantlyToFbCustomAudiencesOnDemand = functions
  .runWith({ memory: "512MB", timeoutSeconds: 540 })
  .https.onRequest(async (req, res) => {
    const since = req.query.since || null;
    try {
      const stats = await runSync({ since });
      res.json({ ok: true, stats });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
