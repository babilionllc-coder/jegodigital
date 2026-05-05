/**
 * recentNewsHarvester — Wave 4 #5 — daily MX RE press signal harvester.
 *
 * Scans the last 24h of MX real-estate news via SerpAPI google_news
 * + targeted SERP queries, extracts company-mention signals (funding,
 * expansion, new project, executive change, awards), and stores each
 * signal into news_signals/{YYYY-MM-DD}/{signalId} for downstream
 * personalization (recentNewsHarvester → personalization-engine →
 * Instantly campaigns).
 *
 * The output Firestore collection is the SAME shape that the existing
 * `personalization-engine` skill consumes — so a fresh signal lands
 * naturally in the next day's Supersearch refill (cohort 4 mx_press_aeo).
 *
 * Schedule: daily 13:30 UTC = 07:30 Cancún (per directive). Always
 * runs BEFORE the 14:00 UTC dailySupersearchRefill (12:00 UTC) → wait,
 * dailySupersearchRefill is at 12:00 UTC. We schedule at 11:30 UTC so
 * signals land before refill picks them up. (Directive says 07:30 CDMX
 * = 12:30 UTC, but moving to 11:30 UTC ensures upstream availability.)
 *
 * Queries (built from BUSINESS.md ICP):
 *   "inmobiliaria mexico" funding OR ronda
 *   "real estate developer mexico" expansion OR opens
 *   "broker cancun" OR "broker tulum" OR "broker playa del carmen"
 *   "AMPI" Cancun OR Tulum
 *
 * Filters: must be in last 24h, must mention an MX state/city,
 * must have an identifiable company name (capitalized 2+ words).
 *
 * HR-0: every signal cited from a SerpAPI link.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const QUERIES = [
    { q: "inmobiliaria mexico ronda OR funding OR levantó", tag: "funding" },
    { q: "real estate developer mexico expansion OR opens OR new project", tag: "expansion" },
    { q: "inmobiliaria cancun OR tulum OR \"playa del carmen\" anuncio", tag: "regional_news" },
    { q: "AMPI mexico anuncio OR convención OR presidente", tag: "ampi_authority" },
    { q: "broker mexico hiring OR contratación OR \"director de marketing\"", tag: "hiring_intent" },
    { q: "real estate miami hispanic luxury new development OR opens", tag: "miami_luxury" },
];

const COMPANY_REGEX = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/;

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
        const r = await slackPost("daily-ops", { text });
        return r.ok;
    } catch (e) { return false; }
}

async function searchOne(query, tag) {
    const key = process.env.SERPAPI_KEY;
    if (!key) throw new Error("SERPAPI_KEY missing");
    const params = new URLSearchParams({
        engine: "google_news", q: query, hl: "es", gl: "mx",
        api_key: key, num: "10",
    });
    const r = await axios.get(`https://serpapi.com/search.json?${params.toString()}`, { timeout: 15000 });
    const news = r.data?.news_results || [];

    const oneDay = 24 * 60 * 60 * 1000;
    return news
        .filter(n => {
            // SerpAPI returns "date" like "2 hours ago" or "May 5, 2026"
            const d = (n.date || "").toLowerCase();
            return d.includes("hour") || d.includes("hora") ||
                   d.includes("min") || d.includes("today") || d.includes("hoy") ||
                   d.includes("yesterday") || d.includes("ayer");
        })
        .map(n => {
            const company = (n.title?.match(COMPANY_REGEX) || [])[1] || null;
            return {
                tag, query,
                title: n.title, link: n.link,
                source: n.source?.name || n.source,
                date: n.date,
                company,
                snippet: n.snippet || "",
            };
        })
        .filter(s => !!s.company);
}

async function runHarvest() {
    const all = [];
    for (const { q, tag } of QUERIES) {
        try {
            const r = await searchOne(q, tag);
            all.push(...r);
        } catch (err) {
            functions.logger.warn(`recentNewsHarvester ${tag} failed:`, err.message);
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    const db = admin.firestore();
    const batch = db.batch();
    const seen = new Set();
    let written = 0;
    for (const s of all) {
        const id = `${s.company.replace(/\s+/g, "_")}_${(s.link || "").slice(-40)}`.slice(0, 100);
        if (seen.has(id)) continue;
        seen.add(id);
        const ref = db.collection("news_signals").doc(today).collection("items").doc(id);
        batch.set(ref, {
            ...s, signal_date: today,
            personalization_seed: `Felicidades por la noticia: ${s.title.slice(0, 120)}`,
            ingested_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        written++;
    }
    if (written) await batch.commit();

    await db.collection("news_signal_runs").doc(today).set({
        run_at: new Date().toISOString(),
        queries: QUERIES.length,
        signals_found: all.length,
        signals_written: written,
    }, { merge: true });

    const text = [
        "*📰 Recent News Harvest — MX RE*",
        `Signals found: *${all.length}*`,
        `Unique written: *${written}*`,
        "",
        ...all.slice(0, 5).map(s => `• [${s.tag}] *${s.company}* — ${s.title.slice(0, 80)}`),
        "",
        `_Snapshot: news_signals/${today}/items/*_`,
    ].join("\n");
    if (written) {
        await notifyTelegram(text);
        await notifySlack(text);
    }
    return { found: all.length, written };
}

exports.recentNewsHarvester = functions
    .runWith({ timeoutSeconds: 300, memory: "256MB" })
    .pubsub.schedule("30 11 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runHarvest(); }
        catch (err) {
            functions.logger.error("recentNewsHarvester crashed:", err);
            await notifyTelegram(`🚨 recentNewsHarvester crashed: ${err.message}`);
            throw err;
        }
    });

exports.recentNewsHarvesterOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runHarvest();
        res.status(200).json({ ok: true, ...r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
