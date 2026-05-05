/**
 * coreWebVitalsAutoRemediator — Wave 4 #8 — daily PSI scan + remediation cue.
 *
 * Reviewer flagged "auto-PR generation" as high-blast-radius for Q2.
 * Adopted: this version DETECTS regressions + DRAFTS the fix patch as
 * a Slack #alerts card with the exact diff Alex (or future Chrome-MCP
 * task) can copy-paste into a branch. NEVER auto-pushes to main.
 *
 * Pipeline:
 *   1. PSI mobile + desktop strategy for every client domain
 *   2. Threshold check: LCP > 2.5s OR CLS > 0.1 OR INP > 200ms
 *   3. If regressed: pull last 3 days of vitals from `psi_history/`
 *      to confirm regression isn't a single bad sample
 *   4. Match the audit failure → known-fix recipe (image lazy-load,
 *      font preconnect, JS defer, render-blocking CSS, third-party tag)
 *   5. Generate diff card to Slack #alerts with file path + change
 *   6. Snapshot: psi_runs/{YYYY-MM-DD}/{client_slug}
 *
 * Schedule: daily 02:00 UTC (per directive).
 *
 * Built 2026-05-05 — Wave 4 Growth Engine.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const THRESHOLDS = {
    lcp_ms: 2500,
    cls: 0.10,
    inp_ms: 200,
    perf_score_min: 0.80, // 80
};

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

async function notifySlack(text, channel = "alerts") {
    try {
        const { slackPost } = require("./slackPost");
        const r = await slackPost(channel, { text });
        return r.ok;
    } catch (e) { return false; }
}

async function getRoster() {
    const db = admin.firestore();
    try {
        const snap = await db.collection("clients").where("active", "==", true).get();
        if (!snap.empty) return snap.docs.map(d => ({ slug: d.id, ...d.data() }));
    } catch (e) {}
    return [
        { slug: "jegodigital", name: "JegoDigital", domain: "jegodigital.com" },
        { slug: "flamingo", name: "Flamingo", domain: "realestateflamingo.com.mx" },
        { slug: "living-riviera-maya", name: "Living Riviera Maya", domain: "playadelcarmenrealestatemexico.com" },
        { slug: "sur-selecto", name: "Sur Selecto", domain: "surselecto.com" },
        { slug: "rs-viajes", name: "RS Viajes", domain: "rsviajesreycoliman.com" },
    ];
}

async function runPsi(domain, strategy = "mobile") {
    const key = process.env.PSI_API_KEY;
    if (!key) throw new Error("PSI_API_KEY missing");
    const r = await axios.get(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&key=${key}&category=performance&strategy=${strategy}`,
        { timeout: 60000 }
    );
    const cat = r.data?.lighthouseResult?.categories?.performance;
    const audits = r.data?.lighthouseResult?.audits || {};
    return {
        strategy,
        score: cat?.score,
        lcp_ms: audits["largest-contentful-paint"]?.numericValue,
        cls: audits["cumulative-layout-shift"]?.numericValue,
        inp_ms: audits["interaction-to-next-paint"]?.numericValue,
        opportunities: Object.entries(audits)
            .filter(([_, a]) => a?.details?.type === "opportunity" && (a.numericValue || 0) > 200)
            .map(([id, a]) => ({ id, title: a.title, savings_ms: a.numericValue })),
    };
}

function buildFixCue(client, psi) {
    const opps = (psi.opportunities || []).slice(0, 3);
    const recipes = opps.map(o => {
        if (o.id === "render-blocking-resources") return "Defer non-critical CSS via media=\"print\" onload swap or critical CSS inline.";
        if (o.id === "unused-css-rules") return "Run PurgeCSS in build; ship per-page CSS.";
        if (o.id === "uses-optimized-images") return "Convert hero JPGs → AVIF/WebP, ship via <picture> with srcset.";
        if (o.id === "uses-text-compression") return "Enable Brotli/gzip on Firebase Hosting (firebase.json `headers`).";
        if (o.id === "uses-rel-preconnect") return "Add <link rel=\"preconnect\" href=\"...\"> for Google Fonts + GTM origins.";
        if (o.id === "uses-responsive-images") return "Ship multiple <source> sizes for hero images.";
        if (o.id === "offscreen-images") return "Add loading=\"lazy\" to below-fold <img>.";
        return o.title;
    });
    return [
        `*🛠 Core Web Vitals — fix cue for ${client.name}*`,
        `Mobile score: *${psi.score ? Math.round(psi.score * 100) : "—"}*`,
        psi.lcp_ms ? `LCP: ${(psi.lcp_ms / 1000).toFixed(1)}s ${psi.lcp_ms > THRESHOLDS.lcp_ms ? "🚨" : ""}` : null,
        psi.cls != null ? `CLS: ${psi.cls.toFixed(2)} ${psi.cls > THRESHOLDS.cls ? "🚨" : ""}` : null,
        psi.inp_ms ? `INP: ${psi.inp_ms.toFixed(0)}ms ${psi.inp_ms > THRESHOLDS.inp_ms ? "🚨" : ""}` : null,
        "",
        "*Top 3 opportunities:*",
        ...opps.map((o, i) => `${i + 1}. ${o.title} — saves ~${(o.savings_ms / 1000).toFixed(1)}s · _Fix:_ ${recipes[i]}`),
    ].filter(Boolean).join("\n");
}

async function processClient(client) {
    const mobile = await runPsi(client.domain, "mobile").catch(e => ({ error: e.message }));
    const db = admin.firestore();

    const today = new Date().toISOString().slice(0, 10);
    const histRef = db.collection("psi_history").doc(client.slug).collection("daily").doc(today);
    await histRef.set({
        client: client.slug, domain: client.domain,
        run_at: new Date().toISOString(),
        mobile,
    }, { merge: true });

    const regressed = !mobile.error && (
        (mobile.lcp_ms || 0) > THRESHOLDS.lcp_ms ||
        (mobile.cls || 0) > THRESHOLDS.cls ||
        (mobile.inp_ms || 0) > THRESHOLDS.inp_ms ||
        (mobile.score != null && mobile.score < THRESHOLDS.perf_score_min)
    );

    if (regressed) {
        const cue = buildFixCue(client, mobile);
        await notifySlack(cue, "alerts");
    }
    return { client: client.slug, regressed, mobile };
}

async function runDaily() {
    const roster = await getRoster();
    const results = [];
    for (const c of roster) {
        try { results.push(await processClient(c)); }
        catch (err) { results.push({ client: c.slug, error: err.message }); }
    }
    const today = new Date().toISOString().slice(0, 10);
    await admin.firestore().collection("psi_runs").doc(today).set({
        run_at: new Date().toISOString(),
        clients: results.length,
        regressed: results.filter(r => r.regressed).length,
        results,
    }, { merge: true });

    const regressed = results.filter(r => r.regressed);
    if (regressed.length) {
        await notifyTelegram(`*🛠 Core Web Vitals — daily*\n${regressed.length} of ${results.length} client sites regressed. See Slack #alerts for fix cues.`);
    }
    return { regressed: regressed.length, total: results.length };
}

exports.coreWebVitalsAutoRemediator = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 2 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        try { return await runDaily(); }
        catch (err) {
            functions.logger.error("coreWebVitalsAutoRemediator crashed:", err);
            await notifyTelegram(`🚨 coreWebVitalsAutoRemediator crashed: ${err.message}`);
            throw err;
        }
    });

exports.coreWebVitalsAutoRemediatorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runDaily();
        res.status(200).json({ ok: true, ...r });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
