/**
 * aeoVisibilityMonitor — Monday 08:00 CDMX weekly AEO visibility tracker.
 *
 * Every Monday morning, queries ChatGPT (OpenAI gpt-4o-mini) + Perplexity
 * (sonar) + Gemini (gemini-2.5-flash) with the priority prompts canonicalized
 * in /docs/aeo-prompts.md, then parses each response for:
 *
 *   • our_clients_mentioned[]   — Living Riviera Maya, Sur Selecto, Flamingo,
 *                                  TT&More, RS Viajes, GoodLife, Goza, Solik
 *   • competitors_mentioned[]   — RE/MAX, Coldwell, Century 21, Sotheby's, etc.
 *   • position_for_each_client  — ordinal position the client appears at
 *
 * Output:
 *   • Firestore /aeo_visibility_runs/{YYYY-WNN}
 *   • Telegram digest
 *   • Slack #daily-ops digest
 *
 * Schedule: `0 14 * * 1`  UTC = 14:00 UTC = 08:00 CDMX (UTC-6, no DST)
 * Manual:   GET /aeoVisibilityMonitorNow?prompt=<idx>  (optional single-prompt mode)
 *
 * Hard rules honored:
 *   HR-2  — every engine response is a fresh API call this run, never cached.
 *   HR-9  — Living Riviera Maya ChatGPT top-3 claim is reverified weekly here.
 *   HR-12 — digest is plain Spanish/English with WoW deltas.
 *   HR-24 — Telegram + Slack on success and failure.
 *
 * Env required:
 *   OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY,
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SLACK_BOT_TOKEN,
 *   SLACK_CHANNEL_DAILY_OPS, GH_PAT
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

if (!admin.apps.length) admin.initializeApp();

const REPO = "babilionllc-coder/jegodigital";
const PROMPTS_PATH = "docs/aeo-prompts.md";

const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o-mini";
const PERPLEXITY_BASE = "https://api.perplexity.ai";
const PERPLEXITY_MODEL = "sonar";
const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Time helpers ──────────────────────────────────────────────────
function nowCDMX() { return new Date(Date.now() - 6 * 3600 * 1000); }
function isoDay(d = nowCDMX()) { return d.toISOString().slice(0, 10); }
function isoWeek(d = nowCDMX()) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ─── Tracked entities (kept in sync with /docs/aeo-prompts.md) ──────
const CLIENTS = [
    { id: "living_riviera_maya", aliases: ["Living Riviera Maya", "Playa del Carmen Real Estate Mexico", "playadelcarmenrealestatemexico", "Judi Shaw"] },
    { id: "sur_selecto", aliases: ["Sur Selecto", "SurSelecto", "surselecto.com"] },
    { id: "flamingo", aliases: ["Flamingo Real Estate", "Real Estate Flamingo", "realestateflamingo"] },
    { id: "ttandmore", aliases: ["TT&More", "TT and More", "TTandMore", "ttandmore.com"] },
    { id: "rs_viajes", aliases: ["RS Viajes", "Rey Coliman", "Reycoliman", "rsviajesreycoliman"] },
    { id: "goodlife_tulum", aliases: ["GoodLife Tulum", "Good Life Tulum"] },
    { id: "goza", aliases: ["Goza"] },
    { id: "solik", aliases: ["Solik"] },
    { id: "jegodigital", aliases: ["JegoDigital", "Jego Digital", "jegodigital.com"] },
];

const COMPETITORS = [
    "Coldwell Banker", "Century 21", "RE/MAX", "Sotheby's International Realty",
    "Engel & Völkers", "Vivanuncios", "Lamudi", "EasyBroker", "Inmuebles24",
    "Punto MLS", "Mansion Global", "BHHS Mexico", "Compass", "TopHaus",
    "Investment Properties Mexico",
];

// Default prompts — used if /docs/aeo-prompts.md fetch fails. Kept in sync
// with the canonical file (Rule 25: investigate, never ask Alex).
const DEFAULT_PROMPTS = [
    { text: "best real estate agencies in Playa del Carmen", lang: "en", region: "mx" },
    { text: "luxury real estate Tulum 2026", lang: "en", region: "mx" },
    { text: "agencias inmobiliarias Cancún", lang: "es", region: "mx" },
    { text: "AMPI Playa del Carmen presidente", lang: "es", region: "mx" },
    { text: "Riviera Maya real estate AI marketing", lang: "en", region: "mx" },
    { text: "best Spanish-speaking real estate agencies in Miami", lang: "en", region: "us" },
    { text: "AI marketing agency for real estate Mexico", lang: "en", region: "mx" },
    { text: "mejor agencia de marketing digital para inmobiliarias en México", lang: "es", region: "mx" },
    { text: "real estate AI lead generation Mexico", lang: "en", region: "mx" },
    { text: "agencias inmobiliarias con IA en México 2026", lang: "es", region: "mx" },
];

// ─── Pull prompts from canonical file via GitHub Contents API ──────
async function pullPromptsFromRepo() {
    const token = process.env.GH_PAT;
    if (!token) return DEFAULT_PROMPTS;
    try {
        const r = await axios.get(
            `https://api.github.com/repos/${REPO}/contents/${PROMPTS_PATH}?ref=main`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, timeout: 15000 }
        );
        const md = Buffer.from(r.data.content || "", "base64").toString("utf8");
        const prompts = [];
        const re = /^\s*\d+\.\s*"([^"]+)"\s*(\[LANG=([a-z]+)\])?\s*(\[REGION=([a-z]+)\])?/gim;
        let m;
        while ((m = re.exec(md)) !== null) {
            prompts.push({ text: m[1], lang: m[3] || "en", region: m[5] || "mx" });
        }
        if (prompts.length >= 3) return prompts;
        return DEFAULT_PROMPTS;
    } catch (err) {
        functions.logger.warn(`[aeoVisibilityMonitor] prompts fetch failed: ${err.message}; using defaults`);
        return DEFAULT_PROMPTS;
    }
}

// ─── Engine wrappers (all return { ok, text, error }) ──────────────
async function queryChatGPT(prompt) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: "no_openai_key", text: "" };
    try {
        const r = await axios.post(
            `${OPENAI_BASE}/chat/completions`,
            {
                model: OPENAI_MODEL,
                messages: [
                    { role: "system", content: "You are a real-estate market analyst. When the user asks for the best agencies/businesses/services in a market, list the most relevant by name with one short reason each. Use specific brand names. Be concise." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 700,
            },
            {
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                timeout: 60000,
            }
        );
        return { ok: true, text: r.data?.choices?.[0]?.message?.content || "" };
    } catch (err) {
        return { ok: false, error: err.response?.data?.error?.message || err.message, text: "" };
    }
}

async function queryPerplexity(prompt) {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) return { ok: false, error: "no_perplexity_key", text: "" };
    try {
        const r = await axios.post(
            `${PERPLEXITY_BASE}/chat/completions`,
            {
                model: PERPLEXITY_MODEL,
                messages: [
                    { role: "system", content: "You are a real-estate market analyst. Cite specific brand names of the best agencies/businesses for the user's query. Be concise." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 700,
            },
            {
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                timeout: 60000,
            }
        );
        return { ok: true, text: r.data?.choices?.[0]?.message?.content || "" };
    } catch (err) {
        return { ok: false, error: err.response?.data?.error?.message || err.message, text: "" };
    }
}

async function queryGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { ok: false, error: "no_gemini_key", text: "" };
    try {
        const r = await axios.post(
            `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
            {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: "You are a real-estate market analyst. Cite specific brand names of the best agencies/businesses for the user's query. Be concise." }] },
                generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
            },
            { headers: { "Content-Type": "application/json" }, timeout: 60000 }
        );
        const text = r.data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
        return { ok: true, text };
    } catch (err) {
        return { ok: false, error: err.response?.data?.error?.message || err.message, text: "" };
    }
}

// ─── Mention parser ─────────────────────────────────────────────────
function findMentions(text) {
    const lower = (text || "").toLowerCase();
    const lines = (text || "").split(/\n/).map(l => l.trim()).filter(Boolean);

    const ourClients = [];
    for (const c of CLIENTS) {
        for (const alias of c.aliases) {
            const idx = lower.indexOf(alias.toLowerCase());
            if (idx >= 0) {
                // Find ordinal position by scanning the response line-by-line
                let position = null;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(alias.toLowerCase())) {
                        position = i + 1;
                        break;
                    }
                }
                ourClients.push({ id: c.id, alias_matched: alias, position });
                break; // One alias per client is enough.
            }
        }
    }

    const competitors = [];
    for (const comp of COMPETITORS) {
        if (lower.includes(comp.toLowerCase())) competitors.push(comp);
    }

    return { our_clients: ourClients, competitors };
}

// ─── Single prompt × all-engine fan-out ─────────────────────────────
async function runOnePrompt(promptObj) {
    const [chatgpt, perplexity, gemini] = await Promise.all([
        queryChatGPT(promptObj.text),
        queryPerplexity(promptObj.text),
        queryGemini(promptObj.text),
    ]);

    const enginesOut = {};
    for (const [engineKey, resp] of [["chatgpt", chatgpt], ["perplexity", perplexity], ["gemini", gemini]]) {
        const mentions = resp.ok ? findMentions(resp.text) : { our_clients: [], competitors: [] };
        enginesOut[engineKey] = {
            ok: resp.ok,
            error: resp.error || null,
            response_text: (resp.text || "").slice(0, 4000),
            our_clients_mentioned: mentions.our_clients,
            competitors_mentioned: mentions.competitors,
        };
    }

    return {
        prompt: promptObj.text,
        lang: promptObj.lang,
        region: promptObj.region,
        engines: enginesOut,
    };
}

// ─── Diff vs last week's run ────────────────────────────────────────
async function lastWeekRun(currentWeek) {
    const db = admin.firestore();
    const snap = await db.collection("aeo_visibility_runs")
        .where(admin.firestore.FieldPath.documentId(), "<", currentWeek)
        .orderBy(admin.firestore.FieldPath.documentId(), "desc")
        .limit(1)
        .get();
    if (snap.empty) return null;
    return snap.docs[0].data();
}

function summarize(promptResults) {
    let totalClientMentions = 0;
    const byClient = {};
    const byEngine = { chatgpt: 0, perplexity: 0, gemini: 0 };
    for (const pr of promptResults) {
        for (const [engineKey, eng] of Object.entries(pr.engines)) {
            for (const m of eng.our_clients_mentioned) {
                totalClientMentions += 1;
                byClient[m.id] = (byClient[m.id] || 0) + 1;
                byEngine[engineKey] = (byEngine[engineKey] || 0) + 1;
            }
        }
    }
    return { totalClientMentions, byClient, byEngine };
}

// ─── Main runner ────────────────────────────────────────────────────
async function runAEOVisibilityMonitor(options = {}) {
    const startedAt = Date.now();
    const week = isoWeek();
    const date = isoDay();
    const out = {
        ok: false,
        date, week,
        prompts_queried: 0,
        total_client_mentions: 0,
        by_client: {},
        by_engine: {},
        wow_delta: null,
        telegram: false,
        slack: false,
        firestore: false,
        errors: [],
    };

    let prompts = await pullPromptsFromRepo();
    if (typeof options.singlePromptIdx === "number" && prompts[options.singlePromptIdx]) {
        prompts = [prompts[options.singlePromptIdx]];
    }
    out.prompts_queried = prompts.length;

    const results = [];
    for (const p of prompts) {
        try {
            const r = await runOnePrompt(p);
            results.push(r);
        } catch (err) {
            out.errors.push(`prompt[${p.text}]: ${err.message}`);
        }
    }

    const summary = summarize(results);
    out.total_client_mentions = summary.totalClientMentions;
    out.by_client = summary.byClient;
    out.by_engine = summary.byEngine;

    // WoW diff
    try {
        const prev = await lastWeekRun(week);
        if (prev) {
            out.wow_delta = {
                total_client_mentions: out.total_client_mentions - (prev.total_client_mentions || 0),
                prev_week: prev.week,
            };
        }
    } catch (err) {
        functions.logger.warn(`[aeoVisibilityMonitor] WoW diff failed: ${err.message}`);
    }

    // ─── Build digest ──────────────────────────────────────────────
    const lines = [
        `🔍 *AEO Visibility · ${week}*`,
        ``,
        `*Prompts queried:* ${out.prompts_queried} × 3 engines = ${out.prompts_queried * 3} pairs`,
        `*Total client mentions:* ${out.total_client_mentions}${out.wow_delta ? ` (Δ ${out.wow_delta.total_client_mentions >= 0 ? "+" : ""}${out.wow_delta.total_client_mentions} vs ${out.wow_delta.prev_week})` : ""}`,
        ``,
        `*By client:*`,
        ...Object.entries(out.by_client).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  • ${k}: ${v}`),
        ``,
        `*By engine:*`,
        ...Object.entries(out.by_engine).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  • ${k}: ${v}`),
        ``,
        `*Per-prompt highlights:*`,
        ...results.slice(0, 6).map(r => {
            const engineHits = Object.entries(r.engines)
                .filter(([_, e]) => e.our_clients_mentioned.length > 0)
                .map(([k, e]) => `${k}=${e.our_clients_mentioned.map(c => c.id).join(",")}`)
                .join(" · ");
            return `  • "${r.prompt.slice(0, 60)}" → ${engineHits || "_no client mentions_"}`;
        }),
    ];
    const digestMarkdown = lines.join("\n");

    // Telegram
    try {
        const tgOut = await notify(digestMarkdown, { critical: false, markdown: true });
        out.telegram = !!tgOut.telegram;
    } catch (err) {
        out.errors.push(`telegram: ${err.message}`);
    }

    // Slack #daily-ops
    try {
        const slackOut = await slackPost("daily-ops", {
            text: `🔍 AEO Visibility · ${week}`,
            blocks: [
                { type: "header", text: { type: "plain_text", text: `🔍 AEO Visibility · ${week}` } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: `*${out.total_client_mentions}* client mentions across *${out.prompts_queried}* prompts × 3 engines${out.wow_delta ? ` · Δ ${out.wow_delta.total_client_mentions >= 0 ? "+" : ""}${out.wow_delta.total_client_mentions} vs ${out.wow_delta.prev_week}` : ""}`,
                    }],
                },
                { type: "divider" },
                { type: "section", text: { type: "mrkdwn", text: digestMarkdown.slice(0, 2900) } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: "_aeoVisibilityMonitor · Mon 08:00 CDMX · Firestore: aeo_visibility_runs/" + week + "_",
                    }],
                },
            ],
        });
        out.slack = !!slackOut.ok;
    } catch (err) {
        out.errors.push(`slack: ${err.message}`);
    }

    // Firestore
    try {
        const db = admin.firestore();
        await db.collection("aeo_visibility_runs").doc(week).set({
            week, date,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
            prompts_queried: out.prompts_queried,
            total_client_mentions: out.total_client_mentions,
            by_client: out.by_client,
            by_engine: out.by_engine,
            wow_delta: out.wow_delta,
            results,
            duration_sec: ((Date.now() - startedAt) / 1000).toFixed(1),
            errors: out.errors,
        }, { merge: true });
        out.firestore = true;
    } catch (err) {
        out.errors.push(`firestore: ${err.message}`);
    }

    out.ok = out.firestore && (out.telegram || out.slack);
    out.duration_sec = ((Date.now() - startedAt) / 1000).toFixed(1);
    return out;
}

// ─── Cron + manual trigger ─────────────────────────────────────────
exports.aeoVisibilityMonitor = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub
    .schedule("0 14 * * 1")  // 14:00 UTC Mon = 08:00 CDMX Mon
    .timeZone("Etc/UTC")
    .onRun(async () => {
        const r = await runAEOVisibilityMonitor();
        functions.logger.info("[aeoVisibilityMonitor] done", r);
        return r;
    });

exports.aeoVisibilityMonitorNow = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const idx = req.query?.prompt !== undefined ? Number(req.query.prompt) : undefined;
            const r = await runAEOVisibilityMonitor({ singlePromptIdx: Number.isFinite(idx) ? idx : undefined });
            res.json(r);
        } catch (err) {
            functions.logger.error("[aeoVisibilityMonitorNow] crash:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

exports._runAEOVisibilityMonitor = runAEOVisibilityMonitor;
