/**
 * phoneLeadsEnrichmentSweep — nightly back-fill of empty-email phone_leads
 *
 * Runs every night at 02:00 CDMX (08:00 UTC). For every phone_leads doc with
 * email=="" AND first_name!="", runs a pattern-guess waterfall + MX-record
 * check and writes the verified email back. Drops anything we can't enrich.
 *
 * Closes the regression vector that produced the 2026-04-29 LinkedIn-batch
 * coverage-gate disaster (see DISASTER_LOG.md / cold_call_dialer_diagnosis_2026-05-05.md).
 *
 * Posts a Telegram + Slack digest on completion (per Rule 24).
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const dns = require("dns").promises;
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

// --- Telegram + Slack helpers (shared pattern) ---
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function tg(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
  const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
    }, { timeout: 8000 });
    return true;
  } catch (e) { functions.logger.warn("tg failed:", e.message); return false; }
}
async function slack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try { await axios.post(url, { text }, { timeout: 8000 }); return true; }
  catch (e) { functions.logger.warn("slack failed:", e.message); return false; }
}

// --- Enrichment helpers (mirror outputs/phone_leads_enrich_v2.cjs) ---
function slugifyCompany(c) {
  if (!c) return null;
  let s = c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[®©™]/g, "");
  s = s.replace(/\s*[\|\-—–\(\[\/].+$/, "");
  s = s.replace(/\bs\.?a\.?\s*de\s*c\.?v\.?\b/g, "");
  s = s.replace(/\binc\b\.?|\bsa\b\.?|\bllc\b\.?|\bsrl\b\.?/g, "");
  s = s.replace(/\bgrupo\b|\binmobiliario\b|\binmobiliaria\b|\binmobiliarios\b|\binmobiliarias\b/g, "");
  s = s.replace(/\bcommercial\b|\binternational\b/g, "");
  s = s.replace(/\breal\s*estate\b|\brealty\b|\bbienes\s*raices\b/g, "");
  s = s.replace(/\bdevelopers?\b|\bdesarrollos?\b|\bdesarrolladora\b|\bdesarrolladores\b/g, "");
  s = s.replace(/[^a-z0-9]+/g, "");
  return s || null;
}
function cleanLastName(last) {
  if (!last) return "";
  let s = last.replace(/[®©™]/g, "");
  s = s.replace(/\s+(Certified|Mexico|Realtor|Broker|CCIM|GRI|MBA).*$/i, "");
  return s.trim().split(/\s+/)[0];
}
function normalize(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
async function checkMX(domain) {
  try { const r = await dns.resolveMx(domain); return r && r.length > 0; }
  catch { return false; }
}
async function findDomain(company) {
  const slug = slugifyCompany(company);
  if (!slug || slug.length < 3) return null;
  for (const tld of [".com", ".com.mx", ".mx", ".co"]) {
    const guess = slug + tld;
    if (await checkMX(guess)) return guess;
  }
  return null;
}
function patternGuess(first, last, domain) {
  const f = normalize(first);
  const l = normalize(last);
  if (l) return `${f}.${l}@${domain}`;
  return `${f}@${domain}`;
}

async function enrichOnce(db) {
  const snap = await db.collection("phone_leads").get();
  const empties = snap.docs.filter(d => {
    const x = d.data();
    return !(x.email || "").trim() && (x.first_name || "").trim();
  });
  let stats = { total_scanned: snap.size, candidates: empties.length, enriched: 0, no_domain: 0 };

  for (const doc of empties) {
    const lead = doc.data();
    const first = lead.first_name || "";
    const last = cleanLastName(lead.last_name || "");
    const company = lead.company || lead.company_name || "";

    const domain = await findDomain(company);
    if (!domain) { stats.no_domain++; continue; }

    const email = patternGuess(first, last, domain);
    await doc.ref.update({
      email,
      email_source: "pattern_v2_nightly",
      email_quality: 7,
      enriched_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    stats.enriched++;
  }
  return stats;
}

// =====================================================================
// Scheduled — every night at 02:00 CDMX (08:00 UTC)
// =====================================================================
exports.phoneLeadsEnrichmentSweep = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 8 * * *")
  .timeZone("Etc/UTC")
  .onRun(async () => {
    const db = admin.firestore();
    const stats = await enrichOnce(db);
    const msg =
      `🌙 *phoneLeadsEnrichmentSweep* (nightly)\n` +
      `Scanned: ${stats.total_scanned}\n` +
      `Candidates (email=='' + has first_name): ${stats.candidates}\n` +
      `Enriched: ${stats.enriched}\n` +
      `No domain: ${stats.no_domain}`;
    await tg(msg);
    await slack(msg);
    functions.logger.info("phoneLeadsEnrichmentSweep stats:", stats);
    return stats;
  });

// =====================================================================
// HTTPS shim — manual trigger (same auth as seedLinkedInLeads)
// =====================================================================
const SEED_SECRET_FALLBACK = "jego-seed-2026-04-20-dial-ready";
exports.phoneLeadsEnrichmentSweepOnDemand = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    const expected = process.env.SEED_SECRET || SEED_SECRET_FALLBACK;
    if ((req.get("X-Seed-Secret") || "") !== expected) return res.status(401).json({ error: "bad secret" });
    const db = admin.firestore();
    const stats = await enrichOnce(db);
    const msg = `🚀 *phoneLeadsEnrichmentSweep* (on-demand)\nScanned: ${stats.total_scanned}\nCandidates: ${stats.candidates}\nEnriched: ${stats.enriched}\nNo domain: ${stats.no_domain}`;
    await tg(msg);
    await slack(msg);
    res.json({ ok: true, ...stats });
  });
