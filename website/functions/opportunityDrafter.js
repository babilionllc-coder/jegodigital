/**
 * opportunityDrafter — Money Machine Phase 3.
 *
 * Firestore-trigger: when /opportunities/{id}.status transitions to "qualified"
 * (score >= 70 from opportunityClassifier), this function writes a genuinely-
 * helpful, value-first public reply that Alex can approve via Telegram.
 *
 * PHILOSOPHY: we are NOT writing sales pitches. We are writing the REPLY a very
 * smart peer would write — 3 concrete, actionable tips specific to the post's
 * context — with ONE soft mention at the end: "I do this for a living; happy
 * to run you a free audit if you DM, no obligation."
 *
 * Reddit ban-risk mitigation (per MONEY_MACHINE.md §8):
 *   - NO link in the first comment (Reddit spam filter nukes link-first replies)
 *   - NO pricing in the reply
 *   - NO "DM me" unless the post explicitly asks for DMs — otherwise: soft cue
 *   - Keep 80-180 words (longer replies get flagged by spam classifiers)
 *   - Match the poster's tone (casual = casual, technical = technical)
 *
 * LLM strategy:
 *   - If ANTHROPIC_API_KEY set → Claude Haiku 4.5 (best voice match)
 *   - Else → Gemini 2.5 Pro via GEMINI_API_KEY (already in stack)
 *
 * Output saved to /opportunity_drafts/{oppId} with:
 *   { draft_text, soft_cta_variant, chars, banned_phrase_check, ready_for_approval }
 *
 * telegramApprovalBot then picks up the ready drafts every 5 min.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

// PRIMARY drafter = Gemini 3.1 Pro (per Alex 2026-04-22 PM). Thinking-mode
// reasoning model — use generous maxOutputTokens (4000) so both internal
// thinking AND the final 80-180 word reply fit in one call. Gemini 2.5 Pro
// is the fallback if the preview endpoint is down. Claude Haiku kept as
// last-resort if GEMINI_API_KEY is missing entirely.
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-pro";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

const BANNED_PHRASES = [
    "as an ai",
    "i'd love to help",
    "dm me for pricing",
    "check out my website",
    "click the link",
    "visit my bio",
    "guaranteed results",
    "100% ", // "100% guaranteed" etc.
    "game-changer",
    "unlock your potential",
    "synergy",
    "leverage our",
    "low-hanging fruit",
];

const DRAFTER_SYSTEM = `You are a helpful expert replying to a Reddit post. You are NOT a marketer.

Your goal: leave a reply so genuinely useful that the OP upvotes it AND other readers learn something. You work at a small marketing agency but you are posting as a human peer, not a salesperson.

OUTPUT FORMAT: JSON only, no markdown fences, schema:
{
  "draft_text": "<the full Reddit comment, 80-180 words>",
  "soft_cta_variant": "<none|dm_hint|audit_offer>",
  "tone_match": "<casual|technical|beginner>",
  "banned_phrases_check": true,
  "post_safely": true,
  "reason_if_unsafe": "<string or empty>"
}

HARD RULES (breaking any means post_safely=false):
1. No links in the comment (Reddit spam filter nukes link-first replies)
2. No pricing
3. No "DM me" unless the post explicitly asks for private help — instead use "happy to go deeper if useful" type soft cues
4. No AI-giveaway phrases ("as an AI", "I'd love to help you unpack this")
5. No hyperbolic claims ("game-changer", "guaranteed results", "100%")
6. Match OP's tone — if casual, be casual; if technical, be technical
7. 80-180 words total
8. Open with direct engagement with THEIR specific problem — no "great question!" filler
9. Three concrete, actionable tips — each one specific to what they wrote
10. Close with ONE sentence of soft CTA: "I actually build this kind of thing for a living — happy to take a deeper look at your setup if useful, no strings" OR similar. Use "audit_offer" variant if their problem matches SEO/website/AI voice/automation cleanly.

Service menu JegoDigital offers (DO NOT LIST in the comment, use as internal routing only):
- AI Voice Agent (ElevenLabs, inbound receptionist + outbound closer)
- Free Demo Website + hosting
- SEO + AEO audit ($297 or $997/mo retainer)
- Cold Email Outreach Setup (Instantly.ai)
- Custom Automation (n8n/Zapier/Firebase)
- SEO Content Retainer (4 blog posts/mo)
- Graphics Design (IG, logos, ads)
- Video Creation (Shorts, demos, tours)
- Website Revamp / Build

If the best service match is voice_ai, give 3 tips about phone/voicemail/call-handling and mention "I build AI voice agents" at close.
If website/seo, give 3 on-page/technical tips specific to their stack.
If automation, give 3 tactical flow tips (triggers, dedupe, error handling).

PROOF POINTS you may reference (sparingly):
- Flamingo Cancún real estate: 4.4× visibility, #1 Google Maps, 88% leads automated
- GoodLife Tulum: +300% organic
- Goza: +3× leads, 98 PageSpeed

NEVER say "our agency" or "we built". Say "I built" (you are the human replying).`;

function containsBanned(text) {
    const lc = (text || "").toLowerCase();
    return BANNED_PHRASES.filter(p => lc.includes(p));
}

async function draftWithClaude(opp) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const userMsg = `POST to reply to:
Subreddit: r/${opp.subreddit || "unknown"}
Title: ${opp.title}
Body: ${(opp.body || "").slice(0, 2500)}
Primary service match (routing hint): ${opp.primary_service_classified || opp.primaryService || "none"}
Classifier score: ${opp.score}

Write the reply.`;
    try {
        const r = await axios.post(
            CLAUDE_API,
            {
                model: CLAUDE_MODEL,
                max_tokens: 1000,
                system: DRAFTER_SYSTEM,
                messages: [{ role: "user", content: userMsg }],
            },
            {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout: 40000,
            }
        );
        const txt = r.data?.content?.[0]?.text;
        if (!txt) return null;
        // Strip any accidental fences.
        const clean = txt.replace(/^```json\s*|\s*```$/g, "");
        return JSON.parse(clean);
    } catch (err) {
        functions.logger.warn("[drafter] Claude failed:", err.response?.data || err.message);
        return null;
    }
}

async function draftWithGemini(opp, modelOverride) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const model = modelOverride || GEMINI_MODEL;
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
    const userMsg = `POST to reply to:
Subreddit: r/${opp.subreddit || "unknown"}
Title: ${opp.title}
Body: ${(opp.body || "").slice(0, 2500)}
Primary service match: ${opp.primary_service_classified || opp.primaryService || "none"}
Classifier score: ${opp.score}

Write the reply as JSON per the schema.`;
    try {
        const r = await axios.post(
            url,
            {
                systemInstruction: { parts: [{ text: DRAFTER_SYSTEM }] },
                contents: [{ role: "user", parts: [{ text: userMsg }] }],
                generationConfig: {
                    temperature: 0.6,
                    // Gemini 3.1 Pro is thinking-mode — must leave room for
                    // internal thoughts + the JSON output. 4000 gives ~3000
                    // thinking tokens + ~1000 response headroom.
                    maxOutputTokens: 4000,
                    responseMimeType: "application/json",
                },
            },
            { timeout: 60000 }
        );
        const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            functions.logger.warn(`[drafter] Gemini ${model} returned no text`, r.data?.candidates?.[0]?.finishReason);
            return null;
        }
        return JSON.parse(text);
    } catch (err) {
        functions.logger.warn(`[drafter] Gemini ${model} failed:`, err.response?.data || err.message);
        return null;
    }
}

async function draftOne(oppSnap) {
    const opp = oppSnap.data();
    if (opp.status !== "qualified") return;
    if (opp.recommended_action === "skip") return;

    // Primary: Gemini 3.1 Pro (thinking-mode, best reply quality)
    // Fallback 1: Gemini 2.5 Pro (stable release if preview endpoint is flaky)
    // Fallback 2: Claude Haiku 4.5 (last resort if GEMINI_API_KEY is gone)
    let draft = await draftWithGemini(opp, GEMINI_MODEL);
    let whichModel = "gemini-3.1-pro-preview";
    if (!draft) {
        draft = await draftWithGemini(opp, GEMINI_FALLBACK_MODEL);
        whichModel = "gemini-2.5-pro";
    }
    if (!draft) {
        draft = await draftWithClaude(opp);
        whichModel = "claude-haiku-4-5";
    }
    if (!draft) {
        await oppSnap.ref.update({ status: "drafter_failed", drafter_error: "all drafter models (Gemini 3.1 Pro / 2.5 Pro / Claude Haiku) unavailable" });
        return;
    }

    const banned = containsBanned(draft.draft_text);
    const wordCount = (draft.draft_text || "").trim().split(/\s+/).length;
    const safe = draft.post_safely && banned.length === 0 && wordCount >= 60 && wordCount <= 220;

    const draftDoc = {
        opportunityId: oppSnap.id,
        permalink: opp.permalink,
        subreddit: opp.subreddit,
        title: opp.title,
        score: opp.score,
        primary_service: opp.primary_service_classified || opp.primaryService,
        draft_text: draft.draft_text,
        soft_cta_variant: draft.soft_cta_variant,
        tone_match: draft.tone_match,
        word_count: wordCount,
        banned_phrases_found: banned,
        post_safely_model: !!draft.post_safely,
        post_safely_final: safe,
        drafted_by_model: whichModel,
        reason_if_unsafe: draft.reason_if_unsafe || (banned.length ? `banned phrases: ${banned.join(", ")}` : (wordCount < 60 ? "too short" : (wordCount > 220 ? "too long" : ""))),
        ready_for_approval: safe,
        status: safe ? "awaiting_approval" : "failed_safety_check",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    const db = getFirestore();
    await db.collection("opportunity_drafts").doc(oppSnap.id).set(draftDoc);
    await oppSnap.ref.update({ status: safe ? "drafted" : "drafted_unsafe", draft_ready_at: admin.firestore.FieldValue.serverTimestamp() });
    functions.logger.info(`[drafter] ${oppSnap.id} → safe=${safe}, words=${wordCount}`);
    return draftDoc;
}

// Fires when opportunityClassifier updates status to "qualified".
exports.opportunityDrafter = functions.firestore
    .document("opportunities/{oppId}")
    .onUpdate(async (change, _ctx) => {
        try {
            const before = change.before.data();
            const after = change.after.data();
            if (before.status !== "qualified" && after.status === "qualified") {
                return await draftOne(change.after);
            }
            return null;
        } catch (err) {
            functions.logger.error("[drafter] crash:", err);
            return null;
        }
    });

// Manual re-draft for testing.
exports.opportunityDrafterNow = functions.https.onRequest(async (req, res) => {
    try {
        const db = getFirestore();
        const snap = await db.collection("opportunities")
            .where("status", "==", "qualified")
            .limit(Number(req.query.limit || 10))
            .get();
        const results = [];
        for (const doc of snap.docs) {
            // eslint-disable-next-line no-await-in-loop
            const r = await draftOne(doc);
            results.push({ id: doc.id, ok: !!r, ready: r?.ready_for_approval });
        }
        res.json({ ok: true, drafted: results.length, results });
    } catch (err) {
        functions.logger.error("[drafterNow] crash:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});
