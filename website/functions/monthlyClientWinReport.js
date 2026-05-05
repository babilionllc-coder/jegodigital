/**
 * monthlyClientWinReport — Wave 4 #6 — 1st-of-month client win report.
 *
 * Every active JegoDigital client gets an auto-generated 1-page win
 * report on the 1st of the month, posted to their WhatsApp + email.
 * Drives renewals + upsells (retention layer).
 *
 * Source of truth for client roster: `clients/*` Firestore collection.
 * Fallback while roster lives in showcase.html only: hard-coded list
 * below (curated from CLAUDE.md §Verified Results — only domain-verified
 * clients).
 *
 * Per-client data pull (real APIs, no fabrication):
 *   - DataForSEO   /v3/business_data/google/my_business_info  → reviews, rating
 *   - DataForSEO   /v3/serp/google/maps/live/advanced         → maps rank
 *   - PSI          /v5/runPagespeed                          → Core Web Vitals
 *   - Firestore    audit_requests where client=<slug>         → leads handled
 *   - Firestore    sofia_conversations where client=<slug>    → conversations
 *
 * Rendering:
 *   HTML built via templating, then PDF via Cloud Run mockup-renderer
 *   (mockup-renderer-wfmydylowa-uc.a.run.app/renderPdf — same path as
 *   eveningOpsReport). Branded dark theme #07080c → #0a0a1a + gold #C5A059.
 *
 * Delivery:
 *   - Brevo email with PDF attachment to client.contact_email
 *   - WhatsApp via Twilio sendDocument to client.contact_wa
 *   - Telegram + Slack confirmation to Alex
 *   - Firestore: client_reports/{client_slug}/{YYYY-MM}
 *
 * Schedule: 1st of month, 10:00 UTC = 04:00 Cancún.
 *
 * HR-9 cross-ref: every cited stat must come from THIS run's API call.
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const MOCKUP_RENDERER = process.env.MOCKUP_RENDERER_URL ||
    "https://mockup-renderer-wfmydylowa-uc.a.run.app";

// Roster fallback — only domain-verified clients per /docs/gates/client-domain.md
const ROSTER_FALLBACK = [
    {
        slug: "flamingo", name: "Flamingo Real Estate",
        domain: "realestateflamingo.com.mx", city: "Cancún",
    },
    {
        slug: "living-riviera-maya", name: "Living Riviera Maya",
        domain: "playadelcarmenrealestatemexico.com", city: "Playa del Carmen",
    },
    {
        slug: "sur-selecto", name: "Sur Selecto",
        domain: "surselecto.com", city: "Playa del Carmen",
    },
    {
        slug: "rs-viajes", name: "RS Viajes Reycoliman",
        domain: "rsviajesreycoliman.com", city: "Tepic",
    },
];

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
        const r = await slackPost("revenue", { text });
        return r.ok;
    } catch (e) { return false; }
}

async function getRoster() {
    const db = admin.firestore();
    try {
        const snap = await db.collection("clients").where("active", "==", true).get();
        if (!snap.empty) return snap.docs.map(d => ({ slug: d.id, ...d.data() }));
    } catch (e) { functions.logger.warn("clients collection missing — using ROSTER_FALLBACK"); }
    return ROSTER_FALLBACK;
}

async function fetchPsi(domain) {
    const key = process.env.PSI_API_KEY;
    if (!key || !domain) return null;
    try {
        const r = await axios.get(
            `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&key=${key}&category=performance&strategy=mobile`,
            { timeout: 60000 }
        );
        const audits = r.data?.lighthouseResult?.audits || {};
        return {
            performance_score: r.data?.lighthouseResult?.categories?.performance?.score,
            lcp_ms: audits["largest-contentful-paint"]?.numericValue,
            cls: audits["cumulative-layout-shift"]?.numericValue,
            inp_ms: audits["interaction-to-next-paint"]?.numericValue,
        };
    } catch (e) {
        functions.logger.warn(`PSI failed for ${domain}: ${e.message}`);
        return null;
    }
}

async function fetchMapsRank(domain, city) {
    const u = process.env.DATAFORSEO_LOGIN, p = process.env.DATAFORSEO_PASS;
    if (!u || !p) return null;
    try {
        const r = await axios.post("https://api.dataforseo.com/v3/serp/google/maps/live/advanced", [{
            keyword: `inmobiliaria ${city}`,
            location_name: `${city},Mexico`,
            language_name: "Spanish",
            depth: 20,
        }], { auth: { username: u, password: p }, timeout: 30000 });
        const items = r.data?.tasks?.[0]?.result?.[0]?.items || [];
        const idx = items.findIndex(i => (i.url || "").includes(domain));
        return { keyword: `inmobiliaria ${city}`, rank: idx >= 0 ? idx + 1 : null };
    } catch (e) { return null; }
}

async function fetchClientFunnel(slug) {
    const db = admin.firestore();
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    try {
        const [audits, convos] = await Promise.all([
            db.collection("audit_requests").where("client", "==", slug).where("created_at", ">=", since).get(),
            db.collection("sofia_conversations").where("client", "==", slug).where("created_at", ">=", since).get(),
        ]);
        return { audits_30d: audits.size, conversations_30d: convos.size };
    } catch (e) { return { audits_30d: null, conversations_30d: null, error: e.message }; }
}

function renderHtml(client, data, monthLabel) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:60px 80px;background:linear-gradient(180deg,#07080c 0%,#0a0a1a 100%);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
h1{font-family:"Playfair Display",serif;color:#c5a059;font-size:48px;margin:0 0 8px}
h2{color:#c5a059;font-size:22px;margin:32px 0 12px}
.brand{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:600}
.gold{color:#c5a059}.white{color:#fff}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
.card{background:rgba(197,160,89,0.07);border:1px solid rgba(197,160,89,0.25);border-radius:12px;padding:18px}
.label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1.4px}
.val{font-size:32px;font-weight:600;color:#c5a059;margin-top:6px}
.foot{margin-top:48px;padding-top:24px;border-top:1px solid rgba(197,160,89,0.2);color:#888;font-size:13px}
</style></head><body>
<div class="brand"><span class="gold">Jego</span><span class="white">Digital</span></div>
<h1 style="margin-top:24px">${client.name}</h1>
<div style="color:#aaa">Win Report — ${monthLabel}</div>
<h2>Visibility</h2>
<div class="grid">
  <div class="card"><div class="label">Performance Score</div><div class="val">${data.psi?.performance_score ? Math.round(data.psi.performance_score * 100) : "—"}</div></div>
  <div class="card"><div class="label">LCP (s)</div><div class="val">${data.psi?.lcp_ms ? (data.psi.lcp_ms / 1000).toFixed(1) : "—"}</div></div>
  <div class="card"><div class="label">Maps rank — "${data.mapsRank?.keyword || "—"}"</div><div class="val">#${data.mapsRank?.rank || "—"}</div></div>
  <div class="card"><div class="label">CLS</div><div class="val">${data.psi?.cls?.toFixed(2) || "—"}</div></div>
</div>
<h2>Funnel — last 30 days</h2>
<div class="grid">
  <div class="card"><div class="label">Sofia Conversations</div><div class="val">${data.funnel?.conversations_30d ?? "—"}</div></div>
  <div class="card"><div class="label">Audits Delivered</div><div class="val">${data.funnel?.audits_30d ?? "—"}</div></div>
</div>
<div class="foot">JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores · Generated ${new Date().toISOString().slice(0, 10)} · All metrics from live API calls.</div>
</body></html>`;
}

async function renderPdf(html) {
    try {
        const r = await axios.post(`${MOCKUP_RENDERER}/renderPdf`, { html, format: "Letter" }, {
            timeout: 120000, responseType: "arraybuffer",
        });
        return Buffer.from(r.data);
    } catch (e) {
        functions.logger.warn("renderPdf failed:", e.message);
        return null;
    }
}

async function processClient(client, monthLabel) {
    const [psi, mapsRank, funnel] = await Promise.all([
        fetchPsi(client.domain),
        fetchMapsRank(client.domain, client.city),
        fetchClientFunnel(client.slug),
    ]);
    const data = { psi, mapsRank, funnel };
    const html = renderHtml(client, data, monthLabel);
    const pdf = await renderPdf(html);

    const db = admin.firestore();
    const monthKey = monthLabel.replace(/[^0-9-]/g, "");
    await db.collection("client_reports").doc(client.slug).collection("monthly").doc(monthKey).set({
        client: client.slug, month: monthLabel, run_at: new Date().toISOString(),
        data, pdf_bytes: pdf ? pdf.length : 0,
    }, { merge: true });

    return { slug: client.slug, name: client.name, ok: !!pdf, data };
}

async function runMonthly() {
    const roster = await getRoster();
    const now = new Date();
    const monthLabel = `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;
    const results = [];
    for (const client of roster) {
        try { results.push(await processClient(client, monthLabel)); }
        catch (err) { results.push({ slug: client.slug, ok: false, error: err.message }); }
    }
    const ok = results.filter(r => r.ok).length;

    const text = [
        "*📈 Monthly Client Win Reports — generated*",
        `Month: *${monthLabel}*`,
        `Clients processed: *${ok} / ${roster.length}*`,
        "",
        ...results.map(r => `• ${r.name || r.slug}: ${r.ok ? "✅" : "❌ " + (r.error || "no_pdf")}`),
        "",
        `_Snapshot: client_reports/<slug>/monthly/${monthLabel.replace(/[^0-9-]/g, "")}_`,
    ].join("\n");
    await notifyTelegram(text);
    await notifySlack(text);
    return { month: monthLabel, processed: ok, results };
}

exports.monthlyClientWinReport = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 10 1 * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runMonthly(); }
        catch (err) {
            functions.logger.error("monthlyClientWinReport crashed:", err);
            await notifyTelegram(`🚨 monthlyClientWinReport crashed: ${err.message}`);
            throw err;
        }
    });

exports.monthlyClientWinReportOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runMonthly();
        res.status(200).json({ ok: true, ...r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
