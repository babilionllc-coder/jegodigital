/**
 * opportunityClassifier — Money Machine Phase 2.
 *
 * Firestore-trigger: when a new /opportunities/{id} is written by redditScraper
 * (or any future platform scraper — twitterScraper, bpScraper, quoraScraper),
 * this function scores it 0-100 on buyer-intent using Gemini 3.1 Flash Lite
 * (the same cheap model dailyStrategist uses — ~$0.0001 per classification).
 *
 * Scoring dimensions (each 0-20, sum 0-100):
 *   - pain_intensity       — how acute is the problem they describe
 *   - budget_signal        — do they mention money, price, hiring, urgency
 *   - specificity          — vague "how do I market?" vs. "I spent $500 on
 *                            Facebook ads and got 0 leads, what do I try next?"
 *   - service_match        — does this map cleanly to one of our 9 services
 *   - reply_worthiness     — can we actually add value + lead into a CTA
 *
 * Only posts with score >= 70 proceed to opportunityDrafter.
 *
 * HARD RULE #0 compliant — scoring prompt is explicit that the model must
 * output a reason-string for every dimension, not invent data about the post.
 *
 * Degrade strategy: if GEMINI_API_KEY missing, falls back to a deterministic
 * keyword-weight score using redditScraper's hits array. Never blocks the queue.
 *
 * Env required:
 *   GEMINI_API_KEY        — already in .env for dailyStrategist
 *   ANTHROPIC_API_KEY     — OPTIONAL, if set uses Claude Haiku for higher quality
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CLASSIFIER_PROMPT = `You are a buyer-intent classifier for JegoDigital, a one-person AI-powered marketing agency.

Our 9 services:
1. AI Voice Agent / Sales Closer (ElevenLabs + Twilio) — $1,997 setup + $497/mo
2. Free Demo Website (Trojan Horse) — $0 setup / $297-997/mo retainer
3. SEO + AEO Audit — $297 one-time, $997/mo retainer
4. Cold Email Outreach Setup (Instantly.ai) — $997 + $297/mo
5. Custom Automation (n8n, Zapier, Firebase) — $497-$2,997 project
6. SEO Content Retainer — $997/mo (4 blog posts)
7. Graphics Design (IG posts, ads, logos) — $197-$497/mo
8. Video Creation (Shorts, demos, tours) — $397 per video / $997/mo
9. Website Revamp / New Build — $1,497

INPUT: a Reddit post (title + body + subreddit + matched keywords).

TASK: Score this post 0-100 on how likely it is to convert into a paying JegoDigital client within 30 days. Only score high if this is a REAL BUYER with a REAL NEED that maps to ONE of our 9 services.

Scoring dimensions (each 0-20):
1. pain_intensity — how acute is the problem
2. budget_signal — do they mention money, urgency, hiring, quotes, "willing to pay"
3. specificity — vague question vs. specific pain with context
4. service_match — how cleanly this maps to exactly one of our 9 services
5. reply_worthiness — can we add genuine value AND soft-CTA without spamming

OUTPUT: valid JSON ONLY, no markdown fences, no prose. Schema:
{
  "score": <int 0-100>,
  "primary_service": "<voice_ai|website|seo|aeo|cold_email|automation|graphics|video|content|real_estate|none>",
  "reasoning": {
    "pain_intensity": {"score": <int 0-20>, "why": "<20 words max>"},
    "budget_signal": {"score": <int 0-20>, "why": "<20 words max>"},
    "specificity": {"score": <int 0-20>, "why": "<20 words max>"},
    "service_match": {"score": <int 0-20>, "why": "<20 words max>"},
    "reply_worthiness": {"score": <int 0-20>, "why": "<20 words max>"}
  },
  "red_flags": ["<list any bot/troll/already-solved/lowball signals>"],
  "recommended_action": "<draft_reply|skip|watchlist>"
}

RULES:
- If the post is a humble-brag, story-share, or "what did you build this weekend" — score <30.
- If the post explicitly says "not looking for an agency" or "will DIY" — score <20.
- If the keyword matches but post is someone GIVING advice (not asking) — score <20.
- If the author is clearly a competitor (agency promoting themselves) — score 0.
- NEVER invent details not present in the post. If the post is too short, set specificity low and say so.`;

async function scoreWithGemini(opportunity) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const userMsg = `POST:
Subreddit: r/${opportunity.subreddit || "unknown"}
Title: ${opportunity.title || ""}
Body: ${(opportunity.body || "").slice(0, 2000)}
Matched keywords: ${(opportunity.keywordHits || []).map(h => h.term).join(", ")}
Author karma: ${opportunity.authorKarma ?? "unknown"}
Upvotes: ${opportunity.upvotes ?? 0}, Comments: ${opportunity.numComments ?? 0}`;

    try {
        const r = await axios.post(
            `${GEMINI_API}?key=${apiKey}`,
            {
                contents: [
                    { role: "user", parts: [{ text: CLASSIFIER_PROMPT + "\n\n" + userMsg }] },
                ],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 800,
                    responseMimeType: "application/json",
                },
            },
            { timeout: 30000 }
        );
        const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;
        return JSON.parse(text);
    } catch (err) {
        functions.logger.error("[classifier] Gemini failed:", err.response?.data || err.message);
        return null;
    }
}

// Deterministic keyword-only fallback — always available.
function scoreFallback(opportunity) {
    const kwScore = Math.min(40, (opportunity.keywordScore || 0) * 6);
    const titleBoost = (opportunity.title || "").length > 50 ? 10 : 5;
    const bodyBoost = (opportunity.body || "").length > 300 ? 15 : 5;
    const engagementBoost = Math.min(10, (opportunity.numComments || 0));
    const finalScore = kwScore + titleBoost + bodyBoost + engagementBoost;
    return {
        score: Math.min(100, finalScore),
        primary_service: opportunity.primaryService || "none",
        reasoning: { fallback: "keyword-weight heuristic; Gemini unavailable" },
        red_flags: [],
        recommended_action: finalScore >= 70 ? "draft_reply" : "skip",
    };
}

async function classifyOne(docSnap) {
    const opp = docSnap.data();
    if (!opp || opp.status !== "pending_classification") return;

    let scoring = await scoreWithGemini(opp);
    if (!scoring) scoring = scoreFallback(opp);

    const update = {
        score: scoring.score,
        primary_service_classified: scoring.primary_service,
        classifier_reasoning: scoring.reasoning,
        classifier_red_flags: scoring.red_flags || [],
        recommended_action: scoring.recommended_action,
        classified_at: admin.firestore.FieldValue.serverTimestamp(),
        status: scoring.score >= 70 ? "qualified" : "filtered_out",
    };
    await docSnap.ref.update(update);
    functions.logger.info(`[classifier] ${docSnap.id} → score=${scoring.score}, action=${scoring.recommended_action}`);
    return update;
}

// Firestore trigger — fires when redditScraper (or future scrapers) writes
// a new /opportunities/* doc.
exports.opportunityClassifier = functions.firestore
    .document("opportunities/{oppId}")
    .onCreate(async (snap, _ctx) => {
        try {
            return await classifyOne(snap);
        } catch (err) {
            functions.logger.error("[classifier] crash:", err);
            return null;
        }
    });

// Manual trigger — re-classify ALL pending docs (useful after a prompt tweak).
exports.opportunityClassifierNow = functions.https.onRequest(async (req, res) => {
    try {
        const db = getFirestore();
        const snap = await db.collection("opportunities")
            .where("status", "==", "pending_classification")
            .limit(Number(req.query.limit || 50))
            .get();
        const results = [];
        for (const doc of snap.docs) {
            // eslint-disable-next-line no-await-in-loop
            const r = await classifyOne(doc);
            results.push({ id: doc.id, ...r });
        }
        res.json({ ok: true, classified: results.length, results });
    } catch (err) {
        functions.logger.error("[classifierNow] crash:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});
