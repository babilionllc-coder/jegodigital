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
// 2. STORY HTML template — brand-locked, single placeholder
// ============================================================
const STORY_TEMPLATE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1920px; background: #0f1115; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; overflow: hidden; }
  .accent { position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #C5A059; }
  .logo { position: absolute; top: 80px; left: 80px; font-size: 36px; font-weight: 700; letter-spacing: 2px; }
  .logo .gold { color: #C5A059; }
  .label { position: absolute; top: 180px; left: 80px; font-size: 32px; color: #C5A059; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; }
  .hook { position: absolute; top: 440px; left: 80px; right: 80px; font-size: 92px; line-height: 1.05; font-weight: 800; }
  .hook .gold { color: #C5A059; }
  .body { position: absolute; top: 1180px; left: 80px; right: 80px; font-size: 38px; line-height: 1.4; color: #E8E8E8; font-weight: 400; }
  .footer { position: absolute; bottom: 90px; left: 80px; right: 80px; display: flex; justify-content: space-between; align-items: center; font-size: 28px; }
  .cta { color: #C5A059; font-weight: 700; }
  .handle { color: #A0A0A5; }
  .swipe { position: absolute; bottom: 220px; left: 0; right: 0; text-align: center; font-size: 28px; color: #C5A059; font-weight: 600; letter-spacing: 4px; }
</style></head><body>
  <div class="accent"></div>
  <div class="logo"><span class="gold">JEGO</span>DIGITAL</div>
  <div class="label">{{LABEL}}</div>
  <div class="hook">{{HOOK}}</div>
  <div class="body">{{BODY}}</div>
  <div class="swipe">{{SWIPE}} ▲</div>
  <div class="footer">
    <span class="cta">📅 calendly.com/jegoalexdigital/30min</span>
    <span class="handle">@jegodigital_agencia</span>
  </div>
</body></html>`;

async function callGeminiForStoryFields(idea) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("no GEMINI_API_KEY");
    const prompt = `You are filling fields for a 1080x1920 Instagram Story for @jegodigital_agencia (Mexican real estate AI agency).

Idea: ${JSON.stringify({
        hook: idea.hook,
        angle: idea.angle,
        topic: idea.topic,
    })}

Return JSON with exactly these keys (Spanish, no English, no emojis except where stated):
- "label": short uppercase tag, max 14 chars (e.g. "DATO", "CONSEJO", "MITO")
- "hook": punchy 4-12 word headline, can wrap. Mark 1-3 KEY words with <span class="gold">word</span> for gold emphasis.
- "body": 1-2 sentence supporting body, max 180 chars
- "swipe": 2-4 word call-to-action like "DESLIZA ARRIBA" or "MÁS EN BIO"

NO markdown. STRICT JSON only.`;
    const resp = await axios.post(
        `${GEMINI_URL}?key=${key}`,
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 500,
                responseMimeType: "application/json",
            },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );
    const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(text);
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
            // 1. Gemini fills the template fields
            const fields = await callGeminiForStoryFields(idea);

            // 2. Substitute into template
            const html = STORY_TEMPLATE_HTML.replace("{{LABEL}}", fields.label || "DATO")
                .replace("{{HOOK}}", fields.hook || idea.hook)
                .replace("{{BODY}}", fields.body || idea.topic || "")
                .replace("{{SWIPE}}", fields.swipe || "MÁS EN BIO");

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
