/**
 * contentAutopilot — Autonomous daily content engine for @jegodigital_agencia
 *
 * Three exports:
 *   1. generateContentIdeas (cron 6am CDMX) — Perplexity Sonar research
 *   2. generateDailyStories (cron 7am CDMX) — 5 IG stories/day from ideas
 *   3. *OnDemand HTTP triggers for both, gated by IG_BATCH_SEED_TOKEN
 *
 * Story generation flow:
 *   content_ideas (used=false) → top 5 → Gemini fills HTML template →
 *   mockup-renderer → PNG → Firebase Storage public URL →
 *   ig_batch_queue doc (format='story', status='ready', fireAt staggered today)
 *
 * Story publishing handled by processIgBatchQueue (igBatchQueue.js) which
 * has been extended with a format='story' dispatch branch.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const OPS_CHANNEL_FALLBACK = "C0AV2Q73PM4";
const MOCKUP_RENDERER =
    process.env.MOCKUP_RENDERER_URL ||
    "https://mockup-renderer-wfmydylowa-uc.a.run.app/render";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ============================================================
// Slack helper
// ============================================================
async function postSlack({ level, title, body, details }) {
    const token = process.env.SLACK_BOT_TOKEN;
    const channel =
        process.env.SLACK_CHANNEL_OPS ||
        process.env.SLACK_CHANNEL_ALERTS ||
        OPS_CHANNEL_FALLBACK;
    if (!token) return false;
    const emoji =
        level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "✅";
    const blocks = [
        { type: "header", text: { type: "plain_text", text: `${emoji} ${title}` } },
        { type: "section", text: { type: "mrkdwn", text: body } },
    ];
    if (details)
        blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: details }],
        });
    try {
        await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel, text: `${emoji} ${title}`, blocks },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json; charset=utf-8",
                },
                timeout: 10000,
            }
        );
        return true;
    } catch (e) {
        functions.logger.error("slack post failed", e.message);
        return false;
    }
}

// ============================================================
// 1. IDEAS — Perplexity Sonar daily research
// ============================================================
async function callPerplexity(prompt) {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) throw new Error("no PERPLEXITY_API_KEY");
    const resp = await axios.post(
        PERPLEXITY_URL,
        {
            model: "sonar",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a real estate marketing researcher. Always return valid JSON only — no prose, no markdown fences.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 2000,
        },
        {
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            timeout: 60000,
        }
    );
    let text = resp.data?.choices?.[0]?.message?.content || "";
    // strip markdown fences if Perplexity wraps the JSON
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    return JSON.parse(text);
}

async function generateIdeasNow() {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today is ${today}. List 10 viral content ideas for Mexican real estate agencies (inmobiliarias) targeting Riviera Maya, CDMX, Cancún, Tulum, and Playa del Carmen. Mix in some Miami Hispanic luxury angles too.

For each idea return JSON with these exact keys:
- "hook" (Spanish, max 80 chars, attention-grabbing first line)
- "angle" (myth-buster | case-study | tip | stat | quote | behind-the-scenes | poll | question)
- "formatHint" (story | carousel | single | reel)
- "topic" (Spanish, 1 sentence summary of the content)
- "hashtags" (array of 5-8 Spanish hashtags, no # prefix)
- "engagementReason" (1 sentence why this will engage)

Return STRICTLY a JSON object: {"ideas": [...]}. No prose. No markdown.`;

    const data = await callPerplexity(prompt);
    const ideas = Array.isArray(data?.ideas) ? data.ideas : [];
    if (!ideas.length) throw new Error("no ideas in Perplexity response");

    const db = admin.firestore();
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const created = [];

    for (const idea of ideas.slice(0, 12)) {
        if (!idea.hook || !idea.formatHint) continue;
        // Score: higher for story-friendly + clear hook
        const formatScore =
            idea.formatHint === "story" || idea.formatHint === "single"
                ? 1.0
                : idea.formatHint === "carousel"
                  ? 0.85
                  : 0.7;
        const hookScore = Math.min(idea.hook.length / 60, 1.0);
        const score = (formatScore * 0.6 + hookScore * 0.4).toFixed(3);

        const ref = db.collection("content_ideas").doc();
        batch.set(ref, {
            hook: idea.hook,
            angle: idea.angle || "tip",
            formatHint: idea.formatHint,
            topic: idea.topic || "",
            hashtags: idea.hashtags || [],
            engagementReason: idea.engagementReason || "",
            score: Number(score),
            source: "perplexity-sonar",
            generationDate: today,
            used: false,
            createdAt: now,
        });
        created.push({
            id: ref.id,
            hook: idea.hook.slice(0, 80),
            formatHint: idea.formatHint,
        });
    }

    await batch.commit();
    return { count: created.length, samples: created.slice(0, 3) };
}

exports.generateContentIdeas = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("0 6 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await generateIdeasNow();
            await postSlack({
                level: "info",
                title: `Content ideas refreshed: ${r.count} new`,
                body: `*Top 3 hooks:*\n${r.samples
                    .map((s, i) => `${i + 1}. _${s.hook}_ (${s.formatHint})`)
                    .join("\n")}`,
            });
            return null;
        } catch (e) {
            functions.logger.error("generateContentIdeas failed", e);
            await postSlack({
                level: "warning",
                title: "Content ideas generator failed",
                body: e.message,
            });
            return null;
        }
    });

exports.generateContentIdeasOnDemand = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const expected = process.env.IG_BATCH_SEED_TOKEN;
            const got = req.query.token || req.headers["x-seed-token"];
            if (!expected || got !== expected) {
                return res.status(403).json({ ok: false, error: "invalid token" });
            }
            const r = await generateIdeasNow();
            res.json({ ok: true, ...r });
        } catch (e) {
            functions.logger.error("generateContentIdeasOnDemand failed", e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

// ============================================================
// 2. STORY HTML templates — 5 engagement-optimized variants
// Per 2026 research: interactive sticker mockups + emoji-heavy + hard CTAs
// drive 40-50% more engagement vs corporate static cards.
// IG Graph API doesn't support real stickers, so we use visual mockups
// with DM/comment CTAs to drive responses.
// ============================================================
const FONT_STACK =
    "'Liberation Sans', 'DejaVu Sans', 'Noto Color Emoji', Arial, sans-serif";

const COMMON_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1920px; font-family: ${FONT_STACK}; overflow: hidden; }
  .logo { position: absolute; top: 80px; left: 80px; font-size: 36px; font-weight: 800; letter-spacing: 2px; z-index: 10; }
  .gold { color: #C5A059; }
  .footer-handle { position: absolute; bottom: 70px; left: 80px; right: 80px; display: flex; justify-content: space-between; align-items: center; font-size: 26px; opacity: 0.85; z-index: 10; }
  .eyebrow { font-size: 30px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; }
`;

// Variant 1: DARK_STAT — bold stat-driven, dark bg
const TPL_DARK_STAT = `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}
  body { background: #0f1115; color: #fff; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .label { position: absolute; top: 180px; left: 80px; color: #C5A059; }
  .hook { position: absolute; top: 380px; left: 80px; right: 80px; font-size: 96px; line-height: 1.0; font-weight: 900; }
  .body { position: absolute; top: 1100px; left: 80px; right: 80px; font-size: 42px; line-height: 1.35; color: #E8E8E8; font-weight: 500; }
  .cta { position: absolute; bottom: 240px; left: 80px; right: 80px; background: #C5A059; color: #0f1115; padding: 38px 40px; border-radius: 32px; font-size: 38px; font-weight: 800; text-align: center; }
  .footer-handle { color: #A0A0A5; }
</style></head><body>
  <div class="accent"></div>
  <div class="logo"><span class="gold">JEGO</span>DIGITAL</div>
  <div class="eyebrow label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="body">{{BODY}}</div>
  <div class="cta">{{CTA}}</div>
  <div class="footer-handle"><span class="gold">📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

// Variant 2: GOLD_CTA — full gold bg, dark text, conversion-focused
const TPL_GOLD_CTA = `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}
  body { background: #C5A059; color: #0f1115; }
  .logo { color: #0f1115; }
  .label { position: absolute; top: 180px; left: 80px; color: #0f1115; }
  .hook { position: absolute; top: 360px; left: 80px; right: 80px; font-size: 110px; line-height: 0.98; font-weight: 900; }
  .body { position: absolute; top: 1080px; left: 80px; right: 80px; font-size: 44px; line-height: 1.3; font-weight: 600; }
  .cta { position: absolute; bottom: 220px; left: 80px; right: 80px; background: #0f1115; color: #C5A059; padding: 42px 40px; border-radius: 32px; font-size: 42px; font-weight: 800; text-align: center; }
  .emoji-row { position: absolute; top: 940px; left: 80px; right: 80px; font-size: 80px; text-align: center; }
  .footer-handle { color: #0f1115; opacity: 0.7; }
</style></head><body>
  <div class="logo">JEGODIGITAL</div>
  <div class="eyebrow label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="emoji-row">{{EMOJIS}}</div>
  <div class="body">{{BODY}}</div>
  <div class="cta">{{CTA}}</div>
  <div class="footer-handle"><span>📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

// Variant 3: WHITE_PATTERN — pattern interrupt, white bg, big number
const TPL_WHITE_PATTERN = `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}
  body { background: #FFFFFF; color: #0f1115; }
  .logo { color: #0f1115; }
  .label { position: absolute; top: 180px; left: 80px; background: #0f1115; color: #C5A059; padding: 14px 28px; border-radius: 16px; font-weight: 800; }
  .number { position: absolute; top: 360px; left: 80px; right: 80px; font-size: 280px; line-height: 0.9; font-weight: 900; color: #C5A059; }
  .hook { position: absolute; top: 760px; left: 80px; right: 80px; font-size: 64px; line-height: 1.0; font-weight: 900; }
  .body { position: absolute; top: 1100px; left: 80px; right: 80px; font-size: 40px; line-height: 1.35; color: #444; font-weight: 500; }
  .cta { position: absolute; bottom: 240px; left: 80px; right: 80px; background: #0f1115; color: #C5A059; padding: 38px 40px; border-radius: 32px; font-size: 38px; font-weight: 800; text-align: center; }
  .footer-handle { color: #888; }
</style></head><body>
  <div class="logo">JEGODIGITAL</div>
  <div class="eyebrow label">{{LABEL}}</div>
  <div class="number">{{NUMBER}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="body">{{BODY}}</div>
  <div class="cta">{{CTA}}</div>
  <div class="footer-handle"><span>📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

// Variant 4: FAKE_POLL — visual mockup of a poll, drives DMs (highest engagement variant)
const TPL_FAKE_POLL = `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}
  body { background: #0f1115; color: #fff; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .label { position: absolute; top: 180px; left: 80px; color: #C5A059; }
  .hook { position: absolute; top: 360px; left: 80px; right: 80px; font-size: 80px; line-height: 1.0; font-weight: 900; }
  .poll { position: absolute; top: 880px; left: 80px; right: 80px; background: rgba(255,255,255,0.97); border-radius: 36px; padding: 50px 50px 60px; }
  .poll-q { font-size: 38px; color: #0f1115; font-weight: 800; text-align: center; margin-bottom: 36px; }
  .poll-row { display: flex; gap: 24px; }
  .poll-opt { flex: 1; background: #0f1115; color: #fff; border-radius: 28px; padding: 32px 20px; text-align: center; font-size: 36px; font-weight: 800; }
  .poll-opt.b { background: #C5A059; color: #0f1115; }
  .cta { position: absolute; bottom: 240px; left: 80px; right: 80px; font-size: 42px; font-weight: 800; text-align: center; color: #C5A059; }
  .footer-handle { color: #A0A0A5; }
</style></head><body>
  <div class="accent"></div>
  <div class="logo"><span class="gold">JEGO</span>DIGITAL</div>
  <div class="eyebrow label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="poll">
    <div class="poll-q">{{POLL_Q}}</div>
    <div class="poll-row">
      <div class="poll-opt">{{POLL_A}}</div>
      <div class="poll-opt b">{{POLL_B}}</div>
    </div>
  </div>
  <div class="cta">👉 {{CTA}}</div>
  <div class="footer-handle"><span class="gold">📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

// Variant 5: EMOJI_HEAVY — approachable, 5+ emojis distributed, high profile-tap rate
const TPL_EMOJI_HEAVY = `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}
  body { background: linear-gradient(135deg, #0f1115 0%, #1a1d24 100%); color: #fff; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .label { position: absolute; top: 180px; left: 80px; color: #C5A059; }
  .emoji-top { position: absolute; top: 320px; left: 80px; font-size: 140px; }
  .hook { position: absolute; top: 540px; left: 80px; right: 80px; font-size: 86px; line-height: 1.0; font-weight: 900; }
  .body { position: absolute; top: 1020px; left: 80px; right: 80px; font-size: 40px; line-height: 1.4; color: #E8E8E8; font-weight: 500; }
  .body .accent-em { color: #C5A059; font-weight: 800; }
  .emoji-bottom { position: absolute; top: 1380px; left: 80px; right: 80px; font-size: 70px; text-align: center; letter-spacing: 16px; }
  .cta { position: absolute; bottom: 240px; left: 80px; right: 80px; background: #C5A059; color: #0f1115; padding: 38px 40px; border-radius: 32px; font-size: 38px; font-weight: 800; text-align: center; }
  .footer-handle { color: #A0A0A5; }
</style></head><body>
  <div class="accent"></div>
  <div class="logo"><span class="gold">JEGO</span>DIGITAL</div>
  <div class="eyebrow label">{{LABEL}}</div>
  <div class="emoji-top">{{EMOJI_BIG}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="body">{{BODY}}</div>
  <div class="emoji-bottom">{{EMOJIS}}</div>
  <div class="cta">{{CTA}}</div>
  <div class="footer-handle"><span class="gold">📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

const STORY_VARIANTS = [
    { name: "DARK_STAT", template: TPL_DARK_STAT, fields: ["LABEL", "HOOK", "BODY", "CTA"] },
    { name: "GOLD_CTA", template: TPL_GOLD_CTA, fields: ["LABEL", "HOOK", "EMOJIS", "BODY", "CTA"] },
    { name: "WHITE_PATTERN", template: TPL_WHITE_PATTERN, fields: ["LABEL", "NUMBER", "HOOK", "BODY", "CTA"] },
    { name: "FAKE_POLL", template: TPL_FAKE_POLL, fields: ["LABEL", "HOOK", "POLL_Q", "POLL_A", "POLL_B", "CTA"] },
    { name: "EMOJI_HEAVY", template: TPL_EMOJI_HEAVY, fields: ["LABEL", "EMOJI_BIG", "HOOK", "BODY", "EMOJIS", "CTA"] },
];

function pickVariantForIdea(idea, idx) {
    // Round-robin distributes the 5 variants across the 5 daily stories so they don't all look identical
    const pollAngles = ["question", "poll", "quiz"];
    if (pollAngles.includes(idea.angle)) return STORY_VARIANTS[3]; // FAKE_POLL
    if (idea.angle === "stat") return STORY_VARIANTS[2]; // WHITE_PATTERN
    if (idea.angle === "quote" || idea.angle === "myth-buster") return STORY_VARIANTS[0]; // DARK_STAT
    if (idea.angle === "tip" || idea.angle === "behind-the-scenes") return STORY_VARIANTS[4]; // EMOJI_HEAVY
    if (idea.angle === "case-study") return STORY_VARIANTS[1]; // GOLD_CTA
    // fallback: round-robin by idx
    return STORY_VARIANTS[idx % STORY_VARIANTS.length];
}

async function callGeminiForStoryFields(idea, variantName) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("no GEMINI_API_KEY");

    // Variant-specific field schema (per 2026 IG research-backed templates)
    const fieldSpecs = {
        DARK_STAT: `Required keys (Spanish, hook MUST include 1-3 emojis, CTA MUST be a hard action like "DM 'AUDIT'" or "Comenta tu zona"):
- "label": uppercase tag 4-14 chars (e.g. "🔥 MITO", "💡 DATO", "⚡ AVISO")
- "hook": punchy 5-10 word headline. Wrap key word with <span class="gold">word</span>. Include 1-2 emojis.
- "body": 1-2 sentence body, max 160 chars, with 1 emoji
- "cta": "DM 'X'" / "Comenta 'Y'" / "Capturalo 📸" — hard CTA, max 50 chars, with emoji`,

        GOLD_CTA: `Required keys (Spanish, this is a CONVERSION-focused CTA story on a gold background):
- "label": uppercase tag 4-14 chars with emoji ("📅 ÚLTIMA SEMANA")
- "hook": 5-10 word direct CTA in dark text, can include 1 emoji ("Tu próxima venta empieza HOY 🚀")
- "emojis": 5-7 emojis in a row (e.g. "✅ 🎯 💼 📈 🏠")
- "body": 1 sentence promise/value (max 140 chars), no emoji
- "cta": "Hablemos: link en bio 🔗" or "DM 'CITA' ahora" — direct booking CTA`,

        WHITE_PATTERN: `Required keys (Spanish, this is a BIG STAT pattern interrupt on white):
- "label": uppercase tag 4-14 chars with emoji ("📊 DATO REAL")
- "number": just a number/percentage (e.g. "320%", "4.4x", "98", "11:47PM"). NO words.
- "hook": 4-8 words explaining the number ("tráfico orgánico en 6 meses")
- "body": 1 sentence framing why it matters (max 140 chars), with 1 emoji
- "cta": "Quieres este número? DM 'YO' 👋" — connect stat to outcome`,

        FAKE_POLL: `Required keys (Spanish, this is a poll-mockup that drives DMs):
- "label": uppercase tag 4-14 chars with emoji ("🤔 TÚ DECIDES")
- "hook": 4-8 word question ("¿Cuál pesa más?")
- "poll_q": the actual poll question, max 40 chars, with emoji ("¿Tu mayor pain con leads? 🤔")
- "poll_a": option A, max 18 chars, lead with emoji ("🔇 Leads fríos")
- "poll_b": option B, max 18 chars, lead with emoji ("📵 No respuesta")
- "cta": "DM 'A' o 'B' por tu plan 🎯" — drives DMs since real polls aren't API-accessible`,

        EMOJI_HEAVY: `Required keys (Spanish, approachable founder-tone, max emojis):
- "label": uppercase tag 4-14 chars with emoji ("🌟 BTS", "👀 SECRETO")
- "emoji_big": 1 BIG emoji (e.g. "🤯", "💸", "🚀") — this is the visual focal point
- "hook": 5-10 word punchy line, mark 1 word with <span class="accent-em">word</span>
- "body": 1-2 sentences, max 160 chars, can include 1-2 emojis
- "emojis": 4-6 emojis spaced ("🏠 ⚡ 🎯 💼 📈")
- "cta": "Cuéntanos en DM 💬" / "Comenta '+1' si aplica" — light social CTA`,
    };

    const prompt = `You are filling fields for an Instagram Story (1080x1920) for @jegodigital_agencia, a Mexican real estate AI agency.

Variant: ${variantName}
Idea: ${JSON.stringify({ hook: idea.hook, angle: idea.angle, topic: idea.topic })}

${fieldSpecs[variantName]}

Rules:
- Spanish ONLY (Mexican usage). No English.
- Use emojis where specified — they DRIVE engagement per 2026 IG research.
- Hook should make the viewer STOP scrolling (curiosity, controversy, or a number).
- CTA must be a HARD action (DM, Comenta, Captura) not generic ("link en bio").
- Avoid corporate jargon. Talk like a friend who knows real estate.

Return STRICT JSON. No markdown, no prose.`;

    const resp = await axios.post(
        `${GEMINI_URL}?key=${key}`,
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 600,
                responseMimeType: "application/json",
            },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );
    const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(text);
}

function fillTemplate(template, fields) {
    let html = template;
    for (const [k, v] of Object.entries(fields)) {
        const placeholder = `{{${k.toUpperCase()}}}`;
        html = html.split(placeholder).join(v ?? "");
    }
    // Strip any leftover placeholders
    return html.replace(/\{\{[A-Z_]+\}\}/g, "");
}

async function renderHtmlToPng(html) {
    const resp = await axios.post(
        MOCKUP_RENDERER,
        {
            html,
            width: 1080,
            height: 1920,
            deviceScaleFactor: 1,
            format: "png",
        },
        {
            responseType: "arraybuffer",
            timeout: 30000,
            headers: { "Content-Type": "application/json" },
        }
    );
    return Buffer.from(resp.data);
}

async function uploadStoryPng(buffer, storyId) {
    const bucket = admin.storage().bucket();
    const path = `ig_stories/${new Date().toISOString().slice(0, 10)}/${storyId}.png`;
    const file = bucket.file(path);
    await file.save(buffer, {
        metadata: {
            contentType: "image/png",
            cacheControl: "public, max-age=86400",
        },
        public: true,
        validation: false,
    });
    // Public URL pattern for default Firebase Storage bucket
    return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

async function generateStoriesNow(count = 5) {
    const db = admin.firestore();
    const today = new Date().toISOString().slice(0, 10);

    // Pick top N unused ideas
    const ideasSnap = await db
        .collection("content_ideas")
        .where("used", "==", false)
        .where("formatHint", "in", ["story", "single", "tip", "quote", "stat"])
        .orderBy("score", "desc")
        .limit(count)
        .get();

    if (ideasSnap.empty) {
        // Fallback: just take any unused ideas regardless of formatHint
        const fallback = await db
            .collection("content_ideas")
            .where("used", "==", false)
            .orderBy("score", "desc")
            .limit(count)
            .get();
        if (fallback.empty)
            throw new Error(
                "no unused content_ideas in Firestore — run generateContentIdeas first"
            );
        ideasSnap.docs = fallback.docs; // hack but works
    }

    // Stagger fireAt across today: 9am, 12pm, 3pm, 6pm, 9pm ET (UTC-4 EDT in late April)
    const ETHours = [9, 12, 15, 18, 21];
    const today0 = new Date();
    today0.setUTCHours(0, 0, 0, 0);

    const created = [];
    for (let i = 0; i < ideasSnap.docs.length && i < count; i++) {
        const ideaDoc = ideasSnap.docs[i];
        const idea = ideaDoc.data();
        const storyId = `story-${today}-${ideaDoc.id}`;

        try {
            // 1. Pick a story variant for this idea (per 2026 engagement research)
            const variant = pickVariantForIdea(idea, i);

            // 2. Gemini fills variant-specific fields
            const fields = await callGeminiForStoryFields(idea, variant.name);

            // 3. Substitute into template
            const html = fillTemplate(variant.template, fields);

            // 3. Render to PNG via mockup-renderer
            const png = await renderHtmlToPng(html);

            // 4. Upload to Firebase Storage
            const url = await uploadStoryPng(png, storyId);

            // 5. Compute fireAt (today at staggered hour ET = UTC + 4)
            const fireAt = new Date(today0);
            fireAt.setUTCHours(ETHours[i] + 4, 0, 0, 0); // EDT offset
            // If past, schedule for tomorrow same slot
            if (fireAt < new Date())
                fireAt.setUTCDate(fireAt.getUTCDate() + 1);

            // 6. Write ig_batch_queue doc
            const queueRef = db.collection("ig_batch_queue").doc(storyId);
            await queueRef.set({
                format: "story",
                status: "ready",
                fireAt: admin.firestore.Timestamp.fromDate(fireAt),
                topic: idea.topic || idea.hook,
                angle: idea.angle || "tip",
                path: "B",
                source: "content-engine-auto",
                ideaId: ideaDoc.id,
                assetUrls: { image: url },
                caption: "", // IG Stories API doesn't accept caption
                tiktokDraft: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                retryCount: 0,
            });

            // 7. Mark idea used
            await ideaDoc.ref.update({
                used: true,
                usedAt: admin.firestore.FieldValue.serverTimestamp(),
                usedAs: storyId,
            });

            created.push({
                storyId,
                topic: idea.topic || idea.hook,
                fireAt: fireAt.toISOString(),
                url,
            });
        } catch (e) {
            functions.logger.error(`story ${i} failed: ${e.message}`);
        }
    }

    return { count: created.length, stories: created };
}

exports.generateDailyStories = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 7 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await generateStoriesNow(5);
            await postSlack({
                level: "info",
                title: `${r.count} stories queued for today`,
                body: r.stories
                    .map(
                        (s, i) =>
                            `${i + 1}. _${s.topic}_ — fires ${s.fireAt.slice(11, 16)} UTC`
                    )
                    .join("\n"),
            });
            return null;
        } catch (e) {
            functions.logger.error("generateDailyStories failed", e);
            await postSlack({
                level: "warning",
                title: "Daily stories generator failed",
                body: e.message,
            });
            return null;
        }
    });

exports.generateDailyStoriesOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const expected = process.env.IG_BATCH_SEED_TOKEN;
            const got = req.query.token || req.headers["x-seed-token"];
            if (!expected || got !== expected) {
                return res.status(403).json({ ok: false, error: "invalid token" });
            }
            const count = Number(req.query.count) || 5;
            const r = await generateStoriesNow(count);
            res.json({ ok: true, ...r });
        } catch (e) {
            functions.logger.error("generateDailyStoriesOnDemand failed", e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

// ============================================================
// 3. SINGLE POSTS — 1080x1350 feed posts, 2/day at 1pm + 7pm ET
// Replaces the old Cowork-side instagram-ai-post (Mac-dependent)
// ============================================================
const TPL_SINGLE_DARK = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; background: #0f1115; color: #fff; font-family: ${FONT_STACK}; overflow: hidden; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .logo { position: absolute; top: 60px; left: 60px; font-size: 32px; font-weight: 800; letter-spacing: 2px; }
  .gold { color: #C5A059; }
  .label { position: absolute; top: 140px; left: 60px; font-size: 26px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; color: #C5A059; }
  .hook { position: absolute; top: 240px; left: 60px; right: 60px; font-size: 88px; line-height: 1.0; font-weight: 900; }
  .body { position: absolute; top: 720px; left: 60px; right: 60px; font-size: 36px; line-height: 1.4; color: #E8E8E8; font-weight: 500; }
  .cta { position: absolute; bottom: 180px; left: 60px; right: 60px; background: #C5A059; color: #0f1115; padding: 32px 36px; border-radius: 28px; font-size: 36px; font-weight: 800; text-align: center; }
  .footer { position: absolute; bottom: 50px; left: 60px; right: 60px; display: flex; justify-content: space-between; font-size: 22px; color: #A0A0A5; }
</style></head><body>
  <div class="accent"></div>
  <div class="logo"><span class="gold">JEGO</span>DIGITAL</div>
  <div class="label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="body">{{BODY}}</div>
  <div class="cta">{{CTA}}</div>
  <div class="footer"><span class="gold">📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

const TPL_SINGLE_GOLD = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; background: #C5A059; color: #0f1115; font-family: ${FONT_STACK}; overflow: hidden; }
  .logo { position: absolute; top: 60px; left: 60px; font-size: 32px; font-weight: 800; letter-spacing: 2px; }
  .label { position: absolute; top: 140px; left: 60px; font-size: 26px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; }
  .hook { position: absolute; top: 240px; left: 60px; right: 60px; font-size: 100px; line-height: 0.98; font-weight: 900; }
  .emojis { position: absolute; top: 700px; left: 60px; right: 60px; font-size: 80px; text-align: center; }
  .body { position: absolute; top: 850px; left: 60px; right: 60px; font-size: 38px; line-height: 1.35; font-weight: 600; }
  .cta { position: absolute; bottom: 180px; left: 60px; right: 60px; background: #0f1115; color: #C5A059; padding: 36px 36px; border-radius: 28px; font-size: 38px; font-weight: 800; text-align: center; }
  .footer { position: absolute; bottom: 50px; left: 60px; right: 60px; display: flex; justify-content: space-between; font-size: 22px; opacity: 0.7; }
</style></head><body>
  <div class="logo">JEGODIGITAL</div>
  <div class="label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="emojis">{{EMOJIS}}</div>
  <div class="body">{{BODY}}</div>
  <div class="cta">{{CTA}}</div>
  <div class="footer"><span>📅 link en bio</span><span>@jegodigital_agencia</span></div>
</body></html>`;

const SINGLE_VARIANTS = [
    { name: "DARK", template: TPL_SINGLE_DARK },
    { name: "GOLD", template: TPL_SINGLE_GOLD },
];

async function renderHtmlToPngSized(html, w, h) {
    const resp = await axios.post(
        MOCKUP_RENDERER,
        { html, width: w, height: h, deviceScaleFactor: 1, format: "png" },
        {
            responseType: "arraybuffer",
            timeout: 30000,
            headers: { "Content-Type": "application/json" },
        }
    );
    return Buffer.from(resp.data);
}

async function uploadAssetPng(buffer, kind, id) {
    const bucket = admin.storage().bucket();
    const path = `ig_${kind}/${new Date().toISOString().slice(0, 10)}/${id}.png`;
    const file = bucket.file(path);
    await file.save(buffer, {
        metadata: {
            contentType: "image/png",
            cacheControl: "public, max-age=86400",
        },
        public: true,
        validation: false,
    });
    return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

async function generateSinglesNow(count = 2) {
    const db = admin.firestore();
    const today = new Date().toISOString().slice(0, 10);

    let snap = await db
        .collection("content_ideas")
        .where("used", "==", false)
        .where("formatHint", "in", ["single", "tip", "quote", "stat"])
        .orderBy("score", "desc")
        .limit(count)
        .get();
    if (snap.empty) {
        snap = await db
            .collection("content_ideas")
            .where("used", "==", false)
            .orderBy("score", "desc")
            .limit(count)
            .get();
        if (snap.empty)
            throw new Error("no unused content_ideas — run generateContentIdeas");
    }

    const ETHours = [13, 19]; // 1pm + 7pm ET = 17 + 23 UTC (EDT)
    const today0 = new Date();
    today0.setUTCHours(0, 0, 0, 0);

    const created = [];
    for (let i = 0; i < snap.docs.length && i < count; i++) {
        const ideaDoc = snap.docs[i];
        const idea = ideaDoc.data();
        const id = `single-${today}-${ideaDoc.id}`;
        try {
            const variant =
                SINGLE_VARIANTS[i % SINGLE_VARIANTS.length];

            const fields = await callGeminiForSingleFields(idea, variant.name);
            const html = fillTemplate(variant.template, fields);
            const png = await renderHtmlToPngSized(html, 1080, 1350);
            const url = await uploadAssetPng(png, "singles", id);

            const fireAt = new Date(today0);
            fireAt.setUTCHours(ETHours[i] + 4, 0, 0, 0);
            if (fireAt < new Date())
                fireAt.setUTCDate(fireAt.getUTCDate() + 1);

            await db.collection("ig_batch_queue").doc(id).set({
                format: "single",
                status: "ready",
                fireAt: admin.firestore.Timestamp.fromDate(fireAt),
                topic: idea.topic || idea.hook,
                angle: idea.angle || "tip",
                path: "B",
                source: "content-engine-auto",
                ideaId: ideaDoc.id,
                assetUrls: { image: url },
                caption: buildCaptionFromIdea(idea, fields),
                tiktokDraft: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                retryCount: 0,
            });
            await ideaDoc.ref.update({
                used: true,
                usedAt: admin.firestore.FieldValue.serverTimestamp(),
                usedAs: id,
            });
            created.push({
                id,
                topic: idea.topic || idea.hook,
                fireAt: fireAt.toISOString(),
                url,
            });
        } catch (e) {
            functions.logger.error(`single ${i} failed: ${e.message}`);
        }
    }
    return { count: created.length, singles: created };
}

async function callGeminiForSingleFields(idea, variantName) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("no GEMINI_API_KEY");
    const fieldSpec =
        variantName === "DARK"
            ? `Required keys: label (uppercase 4-14 chars + emoji), hook (5-10 words, 1-2 emojis), body (2 sentences max 200 chars + 1 emoji), cta (hard action like "DM 'AUDIT'" + emoji)`
            : `Required keys: label (uppercase 4-14 chars + emoji), hook (5-10 words on gold bg), emojis (5 emojis spaced), body (1 sentence value prop max 160 chars), cta (booking CTA + emoji)`;
    const prompt = `Fill an Instagram feed post (1080x1350) for @jegodigital_agencia, Mexican real estate AI agency. Variant: ${variantName}.
Idea: ${JSON.stringify({ hook: idea.hook, angle: idea.angle, topic: idea.topic })}
${fieldSpec}
Spanish only. Return STRICT JSON. No markdown.`;
    const resp = await axios.post(
        `${GEMINI_URL}?key=${key}`,
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 600,
                responseMimeType: "application/json",
            },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );
    return JSON.parse(resp.data.candidates[0].content.parts[0].text);
}

function buildCaptionFromIdea(idea, fields) {
    const hookText = (fields.hook || idea.hook || "").replace(/<[^>]+>/g, "");
    const body = fields.body || idea.topic || "";
    const cta = fields.cta || "📅 link en bio";
    const tags = (idea.hashtags || [])
        .slice(0, 8)
        .map((t) => "#" + t.replace(/^#/, ""))
        .join(" ");
    return `${hookText}\n\n${body}\n\n${cta}\n📅 calendly.com/jegoalexdigital/30min\n\n${tags}`;
}

exports.generateDailySingles = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .pubsub.schedule("0 10 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await generateSinglesNow(2);
            await postSlack({
                level: "info",
                title: `${r.count} singles queued for today`,
                body: r.singles
                    .map((s, i) => `${i + 1}. _${s.topic}_ — ${s.fireAt.slice(11, 16)} UTC`)
                    .join("\n"),
            });
            return null;
        } catch (e) {
            functions.logger.error("generateDailySingles failed", e);
            await postSlack({ level: "warning", title: "Daily singles failed", body: e.message });
            return null;
        }
    });

exports.generateDailySinglesOnDemand = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const expected = process.env.IG_BATCH_SEED_TOKEN;
            const got = req.query.token || req.headers["x-seed-token"];
            if (!expected || got !== expected)
                return res.status(403).json({ ok: false, error: "invalid token" });
            const count = Number(req.query.count) || 2;
            const r = await generateSinglesNow(count);
            res.json({ ok: true, ...r });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

// ============================================================
// 4. CAROUSELS — 1080x1350 5-slide feed posts, 1/day at 1pm ET
// Replaces the old Cowork-side daily-instagram-carousel
// ============================================================
const SLIDE_TEMPLATES = {
    intro: `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; background: #0f1115; color: #fff; font-family: ${FONT_STACK}; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .logo { position: absolute; top: 60px; left: 60px; font-size: 30px; font-weight: 800; letter-spacing: 2px; }
  .gold { color: #C5A059; }
  .label { position: absolute; top: 140px; left: 60px; font-size: 26px; font-weight: 800; letter-spacing: 4px; color: #C5A059; }
  .hook { position: absolute; top: 280px; left: 60px; right: 60px; font-size: 110px; line-height: 0.98; font-weight: 900; }
  .sub { position: absolute; top: 1000px; left: 60px; right: 60px; font-size: 38px; color: #C5A059; font-weight: 700; }
  .swipe { position: absolute; bottom: 80px; right: 60px; font-size: 28px; color: #C5A059; font-weight: 700; }
</style></head><body>
  <div class="accent"></div><div class="logo"><span class="gold">JEGO</span>DIGITAL</div>
  <div class="label">{{LABEL}}</div><div class="hook">{{HOOK}}</div>
  <div class="sub">{{SUB}}</div><div class="swipe">DESLIZA →</div>
</body></html>`,

    body: `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; background: #0f1115; color: #fff; font-family: ${FONT_STACK}; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .num { position: absolute; top: 100px; left: 60px; font-size: 220px; font-weight: 900; color: #C5A059; line-height: 1; opacity: 0.4; }
  .title { position: absolute; top: 380px; left: 60px; right: 60px; font-size: 76px; line-height: 1.0; font-weight: 900; }
  .body { position: absolute; top: 750px; left: 60px; right: 60px; font-size: 36px; line-height: 1.4; color: #E8E8E8; font-weight: 500; }
  .swipe { position: absolute; bottom: 80px; right: 60px; font-size: 26px; color: #C5A059; font-weight: 700; }
</style></head><body>
  <div class="accent"></div><div class="num">{{NUM}}</div>
  <div class="title">{{TITLE}}</div><div class="body">{{BODY}}</div>
  <div class="swipe">DESLIZA →</div>
</body></html>`,

    cta: `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; background: #C5A059; color: #0f1115; font-family: ${FONT_STACK}; }
  .logo { position: absolute; top: 60px; left: 60px; font-size: 32px; font-weight: 800; letter-spacing: 2px; }
  .label { position: absolute; top: 140px; left: 60px; font-size: 28px; font-weight: 800; letter-spacing: 4px; }
  .hook { position: absolute; top: 280px; left: 60px; right: 60px; font-size: 100px; line-height: 0.98; font-weight: 900; }
  .body { position: absolute; top: 800px; left: 60px; right: 60px; font-size: 38px; line-height: 1.35; font-weight: 600; }
  .cta { position: absolute; bottom: 200px; left: 60px; right: 60px; background: #0f1115; color: #C5A059; padding: 38px 36px; border-radius: 28px; font-size: 40px; font-weight: 800; text-align: center; }
  .handle { position: absolute; bottom: 60px; left: 60px; font-size: 24px; opacity: 0.7; }
</style></head><body>
  <div class="logo">JEGODIGITAL</div><div class="label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div><div class="body">{{BODY}}</div>
  <div class="cta">{{CTA}}</div><div class="handle">@jegodigital_agencia · 📅 link en bio</div>
</body></html>`,
};

async function callGeminiForCarouselSlides(idea) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("no GEMINI_API_KEY");
    const prompt = `Generate a 5-slide Instagram carousel for @jegodigital_agencia (Mexican real estate AI agency).
Idea: ${JSON.stringify({ hook: idea.hook, angle: idea.angle, topic: idea.topic })}

Return JSON with this exact structure (Spanish only, all text MUST include emojis where indicated):

{
  "slide1": { "label": "uppercase 4-14 chars + emoji", "hook": "5-9 word hook with 1-2 emojis", "sub": "1 line teaser of payoff" },
  "slide2": { "num": "1", "title": "5-8 words", "body": "1-2 sentences max 200 chars" },
  "slide3": { "num": "2", "title": "5-8 words", "body": "1-2 sentences max 200 chars" },
  "slide4": { "num": "3", "title": "5-8 words", "body": "1-2 sentences max 200 chars" },
  "slide5": { "label": "uppercase 4-14 chars + emoji", "hook": "5-9 word direct CTA", "body": "1 sentence value prop max 140 chars", "cta": "Hard action like 'DM AUDIT'" }
}

Slides 2-4 are the body — 3 distinct points/steps/tips. Slide 1 hooks. Slide 5 closes with CTA.

STRICT JSON. No markdown.`;
    const resp = await axios.post(
        `${GEMINI_URL}?key=${key}`,
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1500,
                responseMimeType: "application/json",
            },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 45000 }
    );
    return JSON.parse(resp.data.candidates[0].content.parts[0].text);
}

async function generateCarouselNow() {
    const db = admin.firestore();
    const today = new Date().toISOString().slice(0, 10);

    let snap = await db
        .collection("content_ideas")
        .where("used", "==", false)
        .where("formatHint", "in", ["carousel", "tip", "myth-buster"])
        .orderBy("score", "desc")
        .limit(1)
        .get();
    if (snap.empty) {
        snap = await db
            .collection("content_ideas")
            .where("used", "==", false)
            .orderBy("score", "desc")
            .limit(1)
            .get();
        if (snap.empty)
            throw new Error("no unused content_ideas — run generateContentIdeas");
    }

    const ideaDoc = snap.docs[0];
    const idea = ideaDoc.data();
    const id = `carousel-${today}-${ideaDoc.id}`;

    const slides = await callGeminiForCarouselSlides(idea);
    const urls = [];

    // Render 5 slides: intro / body / body / body / cta
    const slideMap = [
        { tpl: SLIDE_TEMPLATES.intro, data: slides.slide1 },
        { tpl: SLIDE_TEMPLATES.body, data: slides.slide2 },
        { tpl: SLIDE_TEMPLATES.body, data: slides.slide3 },
        { tpl: SLIDE_TEMPLATES.body, data: slides.slide4 },
        { tpl: SLIDE_TEMPLATES.cta, data: slides.slide5 },
    ];

    for (let i = 0; i < slideMap.length; i++) {
        const html = fillTemplate(slideMap[i].tpl, slideMap[i].data);
        const png = await renderHtmlToPngSized(html, 1080, 1350);
        const url = await uploadAssetPng(png, "carousels", `${id}-slide-${i + 1}`);
        urls.push(url);
    }

    const today0 = new Date();
    today0.setUTCHours(0, 0, 0, 0);
    const fireAt = new Date(today0);
    fireAt.setUTCHours(13 + 4, 0, 0, 0); // 1pm ET = 17 UTC
    if (fireAt < new Date()) fireAt.setUTCDate(fireAt.getUTCDate() + 1);

    await db.collection("ig_batch_queue").doc(id).set({
        format: "carousel",
        status: "ready",
        fireAt: admin.firestore.Timestamp.fromDate(fireAt),
        topic: idea.topic || idea.hook,
        angle: idea.angle || "tip",
        path: "B",
        source: "content-engine-auto",
        ideaId: ideaDoc.id,
        assetUrls: { images: urls },
        caption: buildCaptionFromIdea(idea, slides.slide1),
        tiktokDraft: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: 0,
    });
    await ideaDoc.ref.update({
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedAs: id,
    });

    return { id, topic: idea.topic || idea.hook, fireAt: fireAt.toISOString(), urls };
}

exports.generateDailyCarousel = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 12 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await generateCarouselNow();
            await postSlack({
                level: "info",
                title: `Carousel queued for today: ${r.topic}`,
                body: `Fires ${r.fireAt.slice(11, 16)} UTC · 5 slides at <https://storage.googleapis.com|GCS>`,
            });
            return null;
        } catch (e) {
            functions.logger.error("generateDailyCarousel failed", e);
            await postSlack({ level: "warning", title: "Daily carousel failed", body: e.message });
            return null;
        }
    });

exports.generateDailyCarouselOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const expected = process.env.IG_BATCH_SEED_TOKEN;
            const got = req.query.token || req.headers["x-seed-token"];
            if (!expected || got !== expected)
                return res.status(403).json({ ok: false, error: "invalid token" });
            const r = await generateCarouselNow();
            res.json({ ok: true, ...r });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
