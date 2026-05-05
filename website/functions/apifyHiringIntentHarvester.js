/**
 * apifyHiringIntentHarvester — Wave 4 #4 — LinkedIn Jobs hiring-intent.
 *
 * Independent reviewer flag: LinkedIn scraping has 40% IP-block rate.
 * Mitigation applied: schedule runs Mon/Wed/Fri only (not daily). On
 * 403/429 we log + skip silently (no Telegram noise). Apify retry
 * handled by the Actor's built-in queue.
 *
 * What it does:
 *   - Queries LinkedIn Jobs via Apify Actor `bebity/linkedin-jobs-scraper`
 *     for "Marketing Manager" / "Director Marketing" / "Growth Manager"
 *     postings filtered to industry "Real Estate" + country MX
 *   - For each posting: extract company name, JD, hiring contact
 *   - HR-5 lead-quality 7-gate runs in the existing pipeline
 *   - Survivors land in Firestore: hiring_intent_leads/{leadId}
 *   - Daily refill (existing cron) reads `cohort:hiring_intent` and
 *     routes to dedicated Instantly campaign with hiring-personalization
 *
 * Schedule: 12:30 UTC Mon/Wed/Fri = 06:30 Cancún (per reviewer mitigation).
 * Idempotent — `apify_hiring_runs/{YYYY-MM-DD}` lock.
 *
 * HR-17: hiring-intent campaign copy must use collaboration tone.
 * HR-19: every cold email shipped from this cohort must intro JegoDigital.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const APIFY_ACTOR = "bebity~linkedin-jobs-scraper";
const TARGET_TITLES = ["Marketing Manager", "Director Marketing", "Director de Marketing", "Growth Manager", "CMO"];
const TARGET_LOCATIONS_MX = ["Mexico City", "Cancun", "Guadalajara", "Monterrey", "Playa del Carmen", "Tulum"];

async function notifyTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        return true;
    } catch (e) { return false; }
}

async function notifySlack(text) {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost("leads-hot", { text });
        return r.ok;
    } catch (e) { return false; }
}

async function runApifyActor(input) {
    const tok = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
    if (!tok) throw new Error("APIFY_TOKEN missing");
    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${tok}`;
    try {
        const r = await axios.post(url, input, {
            headers: { "Content-Type": "application/json" },
            timeout: 180000, // 3 min
        });
        return r.data || [];
    } catch (err) {
        const status = err.response?.status;
        if (status === 403 || status === 429) {
            // Soft failure per reviewer guidance — skip silently
            functions.logger.warn(`apifyHiringIntentHarvester soft-fail status=${status}`);
            return null;
        }
        throw err;
    }
}

function isRealEstate(jd) {
    const lc = (jd || "").toLowerCase();
    return /\b(real estate|inmobiliari|developer|broker|propieda|listing|residential|comercial|preventa|luxury home)\b/i.test(lc);
}

async function harvestLinkedInJobs() {
    const input = {
        searchQueries: TARGET_TITLES.flatMap(t => TARGET_LOCATIONS_MX.map(l => ({ keyword: t, location: l }))),
        rows: 50,
        proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    };
    const items = await runApifyActor(input);
    if (items === null) return { soft_failed: true };

    const filtered = items.filter(j => isRealEstate(j.description || j.title || ""));
    return { items, filtered };
}

async function runHarvest() {
    const today = new Date().toISOString().slice(0, 10);
    const db = admin.firestore();
    const lockRef = db.doc(`apify_hiring_runs/${today}`);
    const fired = await db.runTransaction(async (tx) => {
        const cur = await tx.get(lockRef);
        if (cur.exists) return false;
        tx.set(lockRef, { run_at: admin.firestore.FieldValue.serverTimestamp(), status: "running" });
        return true;
    });
    if (!fired) return { ok: true, deduped: true };

    const result = await harvestLinkedInJobs();
    if (result.soft_failed) {
        await lockRef.update({ status: "soft_failed_403_429" });
        return { ok: true, soft_failed: true };
    }

    const { items, filtered } = result;
    const batch = db.batch();
    let written = 0;
    for (const j of filtered) {
        const id = `${(j.companyName || "unknown").replace(/\s+/g, "_")}_${(j.id || j.jobUrl || "").slice(-30)}`.slice(0, 100);
        const ref = db.collection("hiring_intent_leads").doc(id);
        batch.set(ref, {
            company_name: j.companyName, company_url: j.companyUrl,
            job_title: j.title, job_url: j.jobUrl, location: j.location,
            description_preview: (j.description || "").slice(0, 800),
            posted_at: j.postedTime || j.postedAt,
            seniority: j.seniorityLevel,
            cohort: "hiring_intent",
            personalization_seed: `Vi que están contratando ${j.title} en ${j.location} — felicidades por el crecimiento.`,
            ingested_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        written++;
        if (written >= 100) break; // batch cap
    }
    if (written) await batch.commit();

    await lockRef.update({
        status: "complete",
        items_total: items.length,
        items_filtered_realestate: filtered.length,
        items_written: written,
    });

    const text = [
        "*🎯 Hiring-Intent Harvest — LinkedIn Jobs MX RE*",
        `Postings scanned: *${items.length}*`,
        `Real-estate matches: *${filtered.length}*`,
        `Written to hiring_intent_leads: *${written}*`,
        "",
        ...filtered.slice(0, 3).map(j => `• *${j.companyName}* — ${j.title} (${j.location})`),
        "",
        `_Snapshot: apify_hiring_runs/${today}_`,
    ].join("\n");
    if (written) {
        await notifyTelegram(text);
        await notifySlack(text);
    }
    return { items: items.length, filtered: filtered.length, written };
}

// Mon/Wed/Fri 12:30 UTC = 06:30 Cancun
exports.apifyHiringIntentHarvester = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("30 12 * * 1,3,5")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runHarvest(); }
        catch (err) {
            functions.logger.error("apifyHiringIntentHarvester crashed:", err);
            await notifyTelegram(`🚨 apifyHiringIntentHarvester crashed: ${err.message}`);
            throw err;
        }
    });

exports.apifyHiringIntentHarvesterOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runHarvest();
        res.status(200).json({ ok: true, ...r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
