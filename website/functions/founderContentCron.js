/**
 * founderContentCron — Daily 09:00 CDMX founder-video script delivery.
 *
 * Every morning at 9am CDMX, Alex opens Slack and finds today's 90-second
 * founder-video script ready to record on his phone. Topic auto-rotates
 * based on three live signals:
 *
 *   1. Latest Reddit pain point  → Firestore /reddit_research_runs/latest
 *   2. JegoDigital client wins   → Notion CRM (last 7 days, status=Closed Won)
 *   3. Trending RE news          → SerpAPI Google News (real-estate Mexico/Miami)
 *
 * Output format follows the alex-founder-video skill myth-buster spec:
 *   HOOK · BEAT 1 (authority) · BEAT 2 (myth) · BEAT 3 (counter-fact) ·
 *   BEAT 4 (mechanics) · CTA · LOOP
 *
 * Plus: thumbnail text, suggested b-roll list, one trigger keyword for
 * Sofia DM routing (e.g. "LISTA", "AUDIT", "CRECER").
 *
 * Schedule: `0 15 * * *`  UTC = 15:00 UTC = 09:00 CDMX (UTC-6, no DST)
 * Manual:   GET /founderContentCronNow  (X-Admin-Token optional)
 *
 * Hard rules honored:
 *   HR-2  — every signal pulled live this run; missing signals flagged in
 *           the script header, never silently faked.
 *   HR-12 — script is plain Spanish, no jargon; every claim traceable.
 *   HR-17 — collaboration tone (not vendor-pitch).
 *   HR-19 — first-touch intro: JegoDigital + real-estate niche stated up front.
 *   HR-24 — both Telegram + Slack on success and failure.
 *
 * Env required:
 *   ANTHROPIC_API_KEY, NOTION_API_KEY, NOTION_LEADS_CRM_ID, SERPAPI_KEY,
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SLACK_BOT_TOKEN,
 *   SLACK_CHANNEL_CONTENT
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");
const { searchSerp } = require("./common/serpFallback");

if (!admin.apps.length) admin.initializeApp();

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_MODEL = "claude-opus-4-5";
const ANTHROPIC_MODEL_FALLBACK = "claude-sonnet-4-5";
const NOTION_VERSION = "2022-06-28";

// ─── Time helpers ──────────────────────────────────────────────────
function nowCDMX() { return new Date(Date.now() - 6 * 3600 * 1000); }
function isoDay(d = nowCDMX()) { return d.toISOString().slice(0, 10); }
const FORMATS_BY_WEEKDAY = {
    1: "Myth-Buster",            // Monday
    2: "Authority Teaser",       // Tuesday
    3: "Live Demo Reaction",     // Wednesday
    4: "Step-by-Step Tutorial",  // Thursday
    5: "POV Case-Study Proof",   // Friday
    6: "Q&A Reaction",           // Saturday
    0: "Weekend Reframe",        // Sunday
};

// ─── Signal 1: latest Reddit synth pain point ──────────────────────
async function pullLatestRedditPain() {
    try {
        const db = admin.firestore();
        const doc = await db.collection("reddit_research_runs").doc("latest").get();
        if (!doc.exists) return { ok: false, reason: "no_latest_doc" };
        const data = doc.data() || {};
        return {
            ok: true,
            week: data.week || null,
            date: data.date || null,
            memo: data.memo || null,
        };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

// ─── Signal 2: 7d closed-won client wins from Notion CRM ───────────
async function pullClientWins() {
    const key = process.env.NOTION_API_KEY;
    const dbId = process.env.NOTION_LEADS_CRM_ID || "adacaa44-3d9a-4c00-8ef4-c0eb45ff091b";
    if (!key) return { ok: false, reason: "no_notion_key", wins: [] };

    const sinceISO = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    try {
        const resp = await axios.post(
            `https://api.notion.com/v1/databases/${dbId}/query`,
            {
                filter: {
                    and: [
                        { property: "Status", select: { equals: "Closed Won" } },
                        { property: "Last Touch", date: { on_or_after: sinceISO } },
                    ],
                },
                page_size: 10,
            },
            {
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Notion-Version": NOTION_VERSION,
                    "Content-Type": "application/json",
                },
                timeout: 15000,
            }
        );
        const wins = (resp.data?.results || []).map(p => {
            const props = p.properties || {};
            const company = props["Company"]?.title?.[0]?.plain_text || null;
            const city = props["City"]?.select?.name || null;
            const mrr = props["Potential MRR USD"]?.number || null;
            const notes = props["Notes"]?.rich_text?.[0]?.plain_text || null;
            return { company, city, mrr, notes };
        }).filter(w => w.company);
        return { ok: true, wins };
    } catch (err) {
        // Notion property names may vary; soft-fail and continue.
        return { ok: false, reason: err.response?.data?.message || err.message, wins: [] };
    }
}

// ─── Signal 3: SerpAPI trending RE news (MX + Miami) ───────────────
async function pullTrendingRENews() {
    const queries = [
        { q: "real estate Mexico", hl: "es" },
        { q: "luxury real estate Miami", hl: "en" },
    ];
    const items = [];
    for (const { q, hl } of queries) {
        try {
            const { results, source } = await searchSerp(q, {
                engine: "google_news", hl, num: 5
            });
            for (const n of results.slice(0, 5)) {
                items.push({
                    query: q,
                    title: n.title,
                    source: source,
                    date: new Date().toISOString().slice(0, 10),
                    link: n.url,
                });
            }
        } catch (err) {
            functions.logger.warn(`[founderContentCron] searchSerp ${q} failed: ${err.message}`);
        }
    }
    return { ok: items.length > 0, items };
}

// ─── Anthropic prompt → 90s script in skill format ─────────────────
async function generateScript({ pain, wins, news, weekday, dateStr }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY missing");

    const format = FORMATS_BY_WEEKDAY[weekday] || "Myth-Buster";

    const winsBlock = wins.wins.length
        ? wins.wins.map(w => `- ${w.company}${w.city ? ` (${w.city})` : ""}${w.mrr ? ` · $${w.mrr}/mo MRR` : ""}${w.notes ? ` — ${w.notes.slice(0, 200)}` : ""}`).join("\n")
        : "(none in last 7 days — use proof from CLAUDE.md verified results: Living Riviera Maya / Sur Selecto / Flamingo)";

    const newsBlock = news.items.length
        ? news.items.slice(0, 8).map(n => `- ${n.title} (${n.source} · ${n.date})`).join("\n")
        : "(no SerpAPI results this morning)";

    const painBlock = pain.ok && pain.memo
        ? pain.memo.slice(0, 4000)
        : "(no fresh Reddit synth — use evergreen pain: 'inmobiliarias mexicanas pierden leads en WhatsApp por respuesta lenta')";

    const systemPrompt = [
        "You are JegoDigital's daily script writer for Alex Jego's founder-led short-form videos.",
        "JegoDigital is an AI marketing collaboration partner for real-estate businesses, agencies, and developers in Mexico + Miami Hispanic.",
        "Voice: warm, humble, helpful, NEVER vendor-pitch.",
        "Banned words in cold outbound: sell, pitch, buy, deal, offer, package, price, upgrade, discount, risk-free, 100% guarantee, money-back, limited time, spots left, last chance, urgent, don't miss, close, purchase, sign, contract.",
        "Use freely: collaborate, partner, fit, together, learn, build with you, share, happy to.",
        "Every script's first beat MUST contain the JegoDigital intro: 'Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores' (or natural variant).",
        "Output Spanish (Mexican neutral) unless the rotation format explicitly calls for English.",
        "Format scripts as BEATS not paragraphs — Alex doesn't read word-for-word, he uses the beats as anchors.",
    ].join("\n");

    const userPrompt = `# Today's signals (${dateStr})

## 🔥 Latest Reddit pain (live from /reddit_research_runs/latest)
${painBlock}

## 🏆 JegoDigital client wins (last 7 days, Notion CRM)
${winsBlock}

## 📰 Trending real-estate news (SerpAPI, today)
${newsBlock}

# Today's rotation format: ${format} (weekday=${weekday})

# Task

Write the 90-second founder-video script Alex records this morning. Output as Markdown with EXACTLY these sections:

## 🎯 Title
One short title (≤8 words) describing what the video is about.

## 🪝 Hook (0-2s)
ONE punchy line. Spanish. Stop-scroll energy. Often a counter-intuitive claim or "STOP." opener.

## 🎬 Beats (90 seconds total)

**BEAT 1 — Authority + intro (8s)**
- Intro line: "Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores."
- One sentence locating the topic.

**BEAT 2 — The myth or pain (15s)**
- Name what most agency owners / agents / developers BELIEVE.
- Anchor in 1 specific signal from today's Reddit / news / wins.

**BEAT 3 — Counter-fact / proof (20s)**
- The truth that flips the myth.
- Cite a specific JegoDigital client win OR a verified proof from CLAUDE.md (Living Riviera Maya · Sur Selecto · Flamingo).
- NO fabricated numbers. If you don't have a real number, use a directional claim.

**BEAT 4 — The mechanics (25s)**
- HOW it works. Plain Spanish, ≤2 sentences per concept.
- Reference one of JegoDigital's 9 services where natural.

**BEAT 5 — Practical takeaway (12s)**
- One thing the viewer can DO this week.

## 🎯 CTA (8s)
Call-to-action with ONE Sofia DM trigger keyword. Keywords: LISTA · AUDIT · CRECER · DEMO · STACK. Pick the one that best matches today's topic.

## 🔁 Loop / signoff (2s)
Optional micro-tag that loops back to the hook (helps watch-time on TikTok).

## 🎞️ Suggested B-roll (5-8 items)
Bullet list of overlay clips Alex can drop in CapCut: client screenshots, Google Maps shots, ChatGPT response screenshots, dashboard mockups, etc.

## 🖼️ Thumbnail text (3 words max)
For YouTube Shorts only. Bold, punchy, ≤3 words.

## 📌 Pinned comment
Per the alex-founder-video skill — ends with 👇 emoji.

## ✅ HR-19 self-check
Confirm the JegoDigital intro is present in BEAT 1, and that the script names the real-estate niche in the first 200 chars.`;

    const tryOnce = async (model) => axios.post(
        `${ANTHROPIC_BASE}/messages`,
        {
            model,
            max_tokens: 3500,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        },
        {
            headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            timeout: 90000,
        }
    );

    let resp;
    try {
        resp = await tryOnce(ANTHROPIC_MODEL);
    } catch (err) {
        functions.logger.warn(`[founderContentCron] ${ANTHROPIC_MODEL} failed: ${err.message}; retrying ${ANTHROPIC_MODEL_FALLBACK}`);
        resp = await tryOnce(ANTHROPIC_MODEL_FALLBACK);
    }
    const text = resp.data?.content?.[0]?.text;
    if (!text) throw new Error("Anthropic returned empty content");
    return { script: text, format };
}

// ─── Main runner ────────────────────────────────────────────────────
async function runFounderContentCron() {
    const startedAt = Date.now();
    const dateStr = isoDay();
    const weekday = nowCDMX().getUTCDay();
    const out = {
        ok: false,
        date: dateStr,
        weekday,
        signals: { reddit: false, notion_wins: 0, news: 0 },
        format: null,
        telegram: false,
        slack: false,
        firestore: false,
        errors: [],
    };

    const [pain, wins, news] = await Promise.all([
        pullLatestRedditPain(),
        pullClientWins(),
        pullTrendingRENews(),
    ]);

    out.signals.reddit = !!pain.ok;
    out.signals.notion_wins = wins.wins?.length || 0;
    out.signals.news = news.items?.length || 0;

    let scriptObj;
    try {
        scriptObj = await generateScript({ pain, wins, news, weekday, dateStr });
        out.format = scriptObj.format;
    } catch (err) {
        out.errors.push(`anthropic: ${err.message}`);
        await notify(`🔴 *founderContentCron Anthropic FAILED:* ${err.message}`, { critical: true });
        return out;
    }

    const { script, format } = scriptObj;

    const header = [
        `🎬 *Founder Script · ${dateStr}*`,
        `*Format:* ${format} (weekday=${weekday})`,
        `*Signals:* Reddit ${pain.ok ? "✅" : "❌"} · Wins ${out.signals.notion_wins} · News ${out.signals.news}`,
        ``,
    ].join("\n");

    // Telegram (chunked by helper)
    try {
        const tgOut = await notify(`${header}\n${script}`, { critical: false, markdown: true });
        out.telegram = !!tgOut.telegram;
    } catch (err) {
        out.errors.push(`telegram: ${err.message}`);
    }

    // Slack #content with Block Kit
    try {
        const slackOut = await slackPost("content", {
            text: `🎬 Founder Script · ${dateStr} · ${format}`,
            blocks: [
                { type: "header", text: { type: "plain_text", text: `🎬 Founder Script · ${dateStr}` } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: `*Format:* ${format} · *Reddit:* ${pain.ok ? "✅" : "❌"} · *Wins:* ${out.signals.notion_wins} · *News:* ${out.signals.news}`,
                    }],
                },
                { type: "divider" },
                { type: "section", text: { type: "mrkdwn", text: script.slice(0, 2900) } },
                ...(script.length > 2900 ? [{ type: "section", text: { type: "mrkdwn", text: script.slice(2900, 5800) } }] : []),
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: "_alex-founder-video skill · 9am script · record on iPhone, drop raw to /raw_takes/_",
                    }],
                },
            ],
        });
        out.slack = !!slackOut.ok;
    } catch (err) {
        out.errors.push(`slack: ${err.message}`);
    }

    // Firestore — idempotent on date
    try {
        const db = admin.firestore();
        await db.collection("founder_content_runs").doc(dateStr).set({
            date: dateStr,
            weekday,
            format,
            signals: out.signals,
            script,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
            duration_sec: ((Date.now() - startedAt) / 1000).toFixed(1),
            channels: { telegram: out.telegram, slack: out.slack },
            errors: out.errors,
        }, { merge: true });
        out.firestore = true;
    } catch (err) {
        out.errors.push(`firestore: ${err.message}`);
    }

    out.ok = out.telegram && out.slack && out.firestore;
    out.duration_sec = ((Date.now() - startedAt) / 1000).toFixed(1);
    return out;
}

// ─── Cron + manual trigger ─────────────────────────────────────────
exports.founderContentCron = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .pubsub
    .schedule("0 15 * * *")  // 15:00 UTC = 09:00 CDMX
    .timeZone("Etc/UTC")
    .onRun(async () => {
        const r = await runFounderContentCron();
        functions.logger.info("[founderContentCron] done", r);
        return r;
    });

exports.founderContentCronNow = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const r = await runFounderContentCron();
            res.json(r);
        } catch (err) {
            functions.logger.error("[founderContentCronNow] crash:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

exports._runFounderContentCron = runFounderContentCron;
