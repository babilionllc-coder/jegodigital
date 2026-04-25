/**
 * dailyTiktokViralScript — Daily viral TikTok script delivery to Slack #content
 *
 * Runs every weekday 09:00 AM CDMX (15:00 UTC).
 *
 * Flow:
 *   1. Pull breaking AI/RE news from last 30 days via Perplexity Sonar Pro
 *   2. Pick today's rotation format (Mon-Fri):
 *      - Lunes:    Hidden News (OpenAI cerró X, nadie lo sabe)
 *      - Martes:   Future Coming (esto pasó en EU, va a llegar a MX)
 *      - Miércoles: How-To Reveal (acabo de hacer esto con un solo X)
 *      - Jueves:   Industry Shift (X y Y se fusionaron, qué significa)
 *      - Viernes:  Search Evolution (Google/ChatGPT lanzó algo)
 *   3. Generate 15-17s script via Gemini 2.5 Flash
 *      - 3 beats: HOOK (0-2s) → PUNCH (3-13s) → END (14-17s)
 *      - NO sales CTA, no "DM me", no corporate intro
 *      - Pure value, conversational Mexican Spanish
 *   4. Post formatted message to Slack #content
 *
 * On-demand endpoint: /dailyTiktokViralScriptOnDemand (X-Admin-Token)
 *
 * Cost: ~$0.02/day (Perplexity ~$0.005 + Gemini ~$0.002 + Cloud Function compute)
 *
 * HR-0 compliant: every script anchored to real news with citations.
 *
 * See skills/tiktok-viral-script/SKILL.md for full format spec.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const CONTENT_CHANNEL_FALLBACK = "C0AV1EEDC3F"; // #content

// ============================================================
// Rotation formats (Mon-Fri)
// ============================================================
const FORMATS = {
    1: { // Monday
        name: "Hidden News",
        emoji: "🟥",
        day_es: "Lunes",
        hook_pattern: '"[Major company] [did something dramatic] hace [time]. Nadie está hablando de esto."',
        focus: "AI tool shutdowns, product cancellations, hidden product launches that most people missed",
        example_hook: '"OpenAI cerró Sora 2 hace 3 semanas. Nadie está hablando de esto."',
    },
    2: { // Tuesday
        name: "Future Coming",
        emoji: "🟧",
        day_es: "Martes",
        hook_pattern: '"Esto pasó hace [time] en [US/EU]. Va a llegar a México."',
        focus: "US/EU launches that haven't reached Latin America yet (Realtor.com ChatGPT, Zillow AI features, etc.)",
        example_hook: '"Esto pasó hace 4 semanas en EU. Va a llegar a México."',
    },
    3: { // Wednesday
        name: "How-To Reveal",
        emoji: "🟨",
        day_es: "Miércoles",
        hook_pattern: '"Acabo de [do something impossible]. Solo necesité [tool]."',
        focus: "AI tools that exist today most agents don't know they can use (Veo 3, Nano Banana, Gemini features)",
        example_hook: '"Acabo de generar un video de una casa que ni siquiera existe."',
    },
    4: { // Thursday
        name: "Industry Shift",
        emoji: "🟦",
        day_es: "Jueves",
        hook_pattern: '"[Big company] y [other big company] [se fusionaron / regulación]. ¿Por qué importa esto en México?"',
        focus: "Real estate platform consolidation, regulatory changes, market shifts that have implications for Mexican agents",
        example_hook: '"Compass y Redfin se fusionaron en febrero."',
    },
    5: { // Friday
        name: "Search Evolution",
        emoji: "🟩",
        day_es: "Viernes",
        hook_pattern: '"[Google/ChatGPT/Apple] lanzó [feature] que cambia cómo la gente busca [thing]."',
        focus: "Search/discovery platform updates (Google AI Mode, Apple Maps AI, ChatGPT search) that affect how buyers find listings",
        example_hook: '"Google lanzó algo en marzo que cambia cómo la gente busca casas."',
    },
};

// ============================================================
// Slack helpers
// ============================================================
async function postSlack(channel, text, blocks) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
        functions.logger.warn("no SLACK_BOT_TOKEN");
        return false;
    }
    try {
        const r = await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel, text, ...(blocks ? { blocks } : {}) },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json; charset=utf-8",
                },
                timeout: 10000,
            }
        );
        return r.data?.ok === true;
    } catch (e) {
        functions.logger.error("slack post failed", e.message);
        return false;
    }
}

// ============================================================
// Step 1: Perplexity research
// ============================================================
async function fetchBreakingNews(format) {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) throw new Error("no PERPLEXITY_API_KEY");

    const query = `Find ONE recent (last 30 days, 2026) news item that fits this hook pattern for a Mexican real estate agent's viral TikTok:

PATTERN: ${format.hook_pattern}
FOCUS: ${format.focus}

Return JSON only (no prose, no markdown fences):
{
  "headline": "One-sentence what happened",
  "date": "YYYY-MM-DD or month YYYY",
  "what_happened": "2-3 sentence specific explanation with concrete details (numbers, names, what changed)",
  "wow_factor": "1 sentence on why this WOWs Mexican real estate agents",
  "implication_for_mx": "1 sentence on what this means for Mexican agents specifically",
  "source_url": "real URL"
}

The news must be SPECIFIC, RECENT (within 30 days), and ACTIONABLE for the agent. Avoid generic 'AI is changing real estate' — pick a concrete event/launch/shutdown.`;

    const body = JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: query }],
        temperature: 0.2,
        max_tokens: 800,
        search_recency_filter: "month",
    });

    const r = await axios.post("https://api.perplexity.ai/chat/completions", body, {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        timeout: 60000,
    });

    const raw = r.data?.choices?.[0]?.message?.content || "";
    // Extract JSON (Perplexity sometimes wraps in markdown)
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Perplexity returned no JSON: ${raw.slice(0, 200)}`);
    try {
        return JSON.parse(m[0]);
    } catch (e) {
        throw new Error(`bad JSON from Perplexity: ${e.message}`);
    }
}

// ============================================================
// Step 2: Generate script via Gemini
// ============================================================
async function generateScript(format, news) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("no GEMINI_API_KEY");

    const prompt = `You are writing a 15-17 second viral TikTok script for Alex Jego, founder of JegoDigital, a digital marketing agency in Mexico that works with real estate agents.

TODAY'S FORMAT: ${format.name} (${format.day_es})
HOOK PATTERN: ${format.hook_pattern}
EXAMPLE HOOK FROM PRIOR DAYS: ${format.example_hook}

NEWS ANCHOR (today's juice):
- Headline: ${news.headline}
- Date: ${news.date}
- What happened: ${news.what_happened}
- WOW factor: ${news.wow_factor}
- Implication for MX: ${news.implication_for_mx}
- Source: ${news.source_url}

HARD RULES — NEVER VIOLATE:
1. 15-17 seconds total spoken (~45-55 words, Mexican Spanish)
2. 3 beats only: HOOK (0-2s) → PUNCH (3-13s) → END (14-17s)
3. NO sales CTA, NO "DM me", NO "auditoría gratis", NO "schedule a call"
4. NO "Soy Alex fundador de JegoDigital" — first-person POV but NEVER bio intro
5. End on insight, NOT a pitch. Acceptable end phrases: "Te dejo el link en mi perfil", "Síguenos para más", or just a provocative implication
6. Conversational like texting a friend, NOT a corporate pitch
7. Pattern interrupt at 0-2s (dramatic statement OR shocking visual cue)
8. Mexican Spanish phrasing throughout (no Spain Spanish, no English mixing except for tech names like "ChatGPT", "Google", "Veo 3")

OPTIONAL CASE STUDIES Alex can mention IF and ONLY IF it makes the script stronger:
- Flamingo Real Estate (Cancún) — went #1 Google Maps + 320% organic in 90 days
- GoodLife Tulum — +300% organic
- Goza, Solik (other clients)

Output ONLY this JSON (no markdown fences, no prose):
{
  "hook": "Spoken text for 0-2s, plus optional [VISUAL: ...]",
  "punch": "Spoken text for 3-13s, may include [SCREEN: ...] or [CUT: ...] notes",
  "end": "Spoken text for 14-17s, must NOT be a sales CTA",
  "estimated_seconds": 16,
  "broll_suggestions": ["3-5 specific b-roll ideas"],
  "hashtags": ["6-8 hashtags from Mexican RE niche, like #InmobiliariasMexico, #IA2026, #ChatGPT"],
  "posting_time_recommendation": "6:30 PM CST (peak) OR 4:00 AM CST (off-peak algo boost)",
  "yellow_highlight_words": ["3-5 power words to highlight yellow in burned captions"]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200, responseMimeType: "application/json" },
    };

    const r = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
    });

    const raw = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(`bad JSON from Gemini: ${raw.slice(0, 300)}`);
    }
}

// ============================================================
// Step 3: Build Slack message
// ============================================================
function buildSlackMessage(format, news, script) {
    const ts = new Date().toISOString().split("T")[0];
    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `${format.emoji} ${format.day_es} — ${format.name}` },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*📰 News anchor:* ${news.headline}\n*Date:* ${news.date}\n*What happened:* ${news.what_happened}\n*WOW:* ${news.wow_factor}\n${news.source_url ? `🔗 <${news.source_url}|Source>` : ""}`,
            },
        },
        { type: "divider" },
        {
            type: "header",
            text: { type: "plain_text", text: `🎬 SCRIPT (~${script.estimated_seconds || 16}s)` },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*HOOK (0-2s):*\n>${script.hook}\n\n*PUNCH (3-13s):*\n>${script.punch}\n\n*END (14-${script.estimated_seconds || 17}s):*\n>${script.end}`,
            },
        },
        { type: "divider" },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🎨 B-roll suggestions:*\n${(script.broll_suggestions || []).map((b) => `• ${b}`).join("\n")}\n\n*🏷️ Hashtags:* ${(script.hashtags || []).join(" ")}\n\n*🟡 Yellow-highlight words:* ${(script.yellow_highlight_words || []).join(", ")}\n\n*⏰ Posting time:* ${script.posting_time_recommendation || "6:30 PM CST"}`,
            },
        },
        { type: "divider" },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*📋 Next steps:*\n1. Review script (1 min)\n2. Set up phone + window light (5 min)\n3. Record 3 takes hand-held selfie (5 min)\n4. Drop raw clip in this thread → I'll edit\n5. Post tonight at recommended time`,
            },
        },
    ];

    return { text: `Today's viral script — ${format.day_es} ${format.name}`, blocks };
}

// ============================================================
// Main runner
// ============================================================
async function generateAndPost(forceWeekday) {
    const channel = process.env.SLACK_CHANNEL_CONTENT || CONTENT_CHANNEL_FALLBACK;

    // Determine today's format (1=Mon, 5=Fri)
    const now = new Date();
    // Use Mexico City time for weekday calculation
    const mxDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    let weekday = forceWeekday || mxDate.getDay(); // 0=Sun..6=Sat
    if (weekday === 0 || weekday === 6) {
        // Weekend — default to Monday format
        weekday = 1;
    }
    const format = FORMATS[weekday];
    if (!format) throw new Error(`unknown weekday ${weekday}`);

    functions.logger.info(`Running ${format.name} for ${format.day_es}`);

    // 1. News
    const news = await fetchBreakingNews(format);
    functions.logger.info("News:", JSON.stringify(news));

    // 2. Script
    const script = await generateScript(format, news);
    functions.logger.info("Script generated, estimated", script.estimated_seconds, "seconds");

    // 3. Slack
    const msg = buildSlackMessage(format, news, script);
    const ok = await postSlack(channel, msg.text, msg.blocks);
    if (!ok) throw new Error("slack post failed");

    // 4. Log to Firestore for history
    await admin
        .firestore()
        .collection("tiktok_viral_scripts")
        .add({
            format: format.name,
            day_es: format.day_es,
            news,
            script,
            ts: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch((e) => functions.logger.warn("firestore log failed", e.message));

    return { format: format.name, news_headline: news.headline, estimated_seconds: script.estimated_seconds };
}

// ============================================================
// Exports
// ============================================================
exports.dailyTiktokViralScript = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("0 9 * * 1-5") // 9 AM Mon-Fri
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await generateAndPost();
            functions.logger.info("daily success:", r);
            return null;
        } catch (e) {
            functions.logger.error("daily FAILED:", e);
            // Post failure to alerts channel
            try {
                await postSlack(
                    process.env.SLACK_CHANNEL_ALERTS || "C0AV2Q73PM4",
                    `🔴 dailyTiktokViralScript failed: ${e.message}`
                );
            } catch (_) {}
            return null;
        }
    });

exports.dailyTiktokViralScriptOnDemand = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        const tok = req.get("X-Admin-Token") || req.query.token;
        if (!tok || tok !== process.env.ADMIN_TRIGGER_TOKEN) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        try {
            const forceWeekday = req.query.weekday ? parseInt(req.query.weekday, 10) : undefined;
            const r = await generateAndPost(forceWeekday);
            return res.status(200).json({ ok: true, ...r });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message, stack: e.stack });
        }
    });
