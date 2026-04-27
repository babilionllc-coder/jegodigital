/**
 * processIgBatchQueue — autonomous Instagram + TikTok batch publisher
 *
 * Runs every 15 minutes via Pub/Sub schedule. Reads Firestore
 * `ig_batch_queue` collection for documents where:
 *   - status === "ready"
 *   - fireAt <= now
 *
 * For each due doc, calls the appropriate Instagram Graph API publishing
 * path based on `format`:
 *   - "carousel"   → multi-media carousel (2-10 children)
 *   - "single"    → single-image post
 *   - "reel"      → 9:16 video post (REELS media_type)
 *
 * For "reel" docs that also have `tiktokDraft: true`, additionally pushes
 * the same MP4 to the @jegodigital TikTok drafts inbox via the TikTok
 * Content Posting API v2 inbox.share endpoint (laptop-off compatible).
 *
 * Marks each doc with status=published (mediaId, permalink, publishedAt)
 * or status=failed (error, retryCount++). Posts a Slack notification per
 * fire to #jegodigital-ops.
 *
 * HR-0 + HR-6 compliant: every fire verifies via media_publish 200 +
 * permalink lookup before declaring success.
 *
 * Replaces the Cowork-side scheduled-tasks plumbing so Alex's laptop can
 * be off without breaking the IG publishing schedule.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const OPS_CHANNEL_FALLBACK = "C0AV2Q73PM4"; // #alerts as backup
const IG_GRAPH_BASE = "https://graph.instagram.com/v21.0";
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

// ============================================================
// Slack helper (matches igTokenAutoRefresh.js pattern)
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
        {
            type: "header",
            text: { type: "plain_text", text: `${emoji} ${title}` },
        },
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
// IG token loader — prefers Firestore cache (refreshed by
// igTokenAutoRefresh every 50d), falls back to .env
// ============================================================
async function loadIgToken() {
    try {
        const snap = await admin
            .firestore()
            .collection("ig_token_cache")
            .doc("current")
            .get();
        if (snap.exists && snap.data().token) return snap.data().token;
    } catch (e) {
        functions.logger.warn(
            "ig_token_cache read failed, falling back to env:",
            e.message
        );
    }
    return process.env.IG_GRAPH_TOKEN;
}

// ============================================================
// Instagram publishing paths
// ============================================================

/**
 * Publish a single image to Instagram.
 * doc.assetUrls.image = HTTPS URL to a 1080x1350 (or 1:1) PNG/JPG.
 */
async function publishSingle(doc, igUserId, token) {
    const imageUrl = doc.assetUrls?.image;
    if (!imageUrl) throw new Error("missing assetUrls.image");

    // 1. Create container
    const createResp = await axios.post(
        `${IG_GRAPH_BASE}/${igUserId}/media`,
        null,
        {
            params: {
                image_url: imageUrl,
                caption: doc.caption,
                access_token: token,
            },
            timeout: 30000,
        }
    );
    const creationId = createResp.data.id;

    // 2. Publish container
    const pubResp = await axios.post(
        `${IG_GRAPH_BASE}/${igUserId}/media_publish`,
        null,
        {
            params: { creation_id: creationId, access_token: token },
            timeout: 30000,
        }
    );
    const mediaId = pubResp.data.id;

    // 3. Fetch permalink for HR#6 verification
    const permResp = await axios.get(`${IG_GRAPH_BASE}/${mediaId}`, {
        params: { fields: "permalink", access_token: token },
        timeout: 15000,
    });
    return { mediaId, permalink: permResp.data.permalink };
}

/**
 * Publish a 2-10 image carousel to Instagram.
 * doc.assetUrls.images = array of HTTPS URLs (one per slide, 2-10 items).
 */
async function publishCarousel(doc, igUserId, token) {
    const images = doc.assetUrls?.images;
    if (!Array.isArray(images) || images.length < 2 || images.length > 10) {
        throw new Error(
            `carousel needs 2-10 images, got ${images ? images.length : 0}`
        );
    }

    // 1. Create one child container per image
    const childIds = [];
    for (const imageUrl of images) {
        const r = await axios.post(`${IG_GRAPH_BASE}/${igUserId}/media`, null, {
            params: {
                image_url: imageUrl,
                is_carousel_item: true,
                access_token: token,
            },
            timeout: 30000,
        });
        childIds.push(r.data.id);
    }

    // 2. Create carousel container
    const carResp = await axios.post(
        `${IG_GRAPH_BASE}/${igUserId}/media`,
        null,
        {
            params: {
                media_type: "CAROUSEL",
                children: childIds.join(","),
                caption: doc.caption,
                access_token: token,
            },
            timeout: 30000,
        }
    );
    const creationId = carResp.data.id;

    // 3. Publish
    const pubResp = await axios.post(
        `${IG_GRAPH_BASE}/${igUserId}/media_publish`,
        null,
        {
            params: { creation_id: creationId, access_token: token },
            timeout: 30000,
        }
    );
    const mediaId = pubResp.data.id;

    // 4. Verify permalink
    const permResp = await axios.get(`${IG_GRAPH_BASE}/${mediaId}`, {
        params: { fields: "permalink", access_token: token },
        timeout: 15000,
    });
    return { mediaId, permalink: permResp.data.permalink };
}

/**
 * Publish a 9:16 Reel to Instagram.
 * doc.assetUrls.video = HTTPS URL to MP4.
 * Reels can take 30-90s to encode; we poll status_code up to 6 times.
 */
async function publishReel(doc, igUserId, token) {
    const videoUrl = doc.assetUrls?.video;
    if (!videoUrl) throw new Error("missing assetUrls.video");

    // 1. Create REELS container
    const createResp = await axios.post(
        `${IG_GRAPH_BASE}/${igUserId}/media`,
        null,
        {
            params: {
                media_type: "REELS",
                video_url: videoUrl,
                caption: doc.caption,
                share_to_feed: true,
                access_token: token,
            },
            timeout: 60000,
        }
    );
    const creationId = createResp.data.id;

    // 2. Poll for FINISHED status (Reels need encoding)
    for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 15000)); // 15s between polls
        const statusResp = await axios.get(
            `${IG_GRAPH_BASE}/${creationId}`,
            {
                params: {
                    fields: "status_code",
                    access_token: token,
                },
                timeout: 15000,
            }
        );
        if (statusResp.data.status_code === "FINISHED") break;
        if (statusResp.data.status_code === "ERROR") {
            throw new Error(
                `Reel encoding failed: ${JSON.stringify(statusResp.data)}`
            );
        }
    }

    // 3. Publish
    const pubResp = await axios.post(
        `${IG_GRAPH_BASE}/${igUserId}/media_publish`,
        null,
        {
            params: { creation_id: creationId, access_token: token },
            timeout: 60000,
        }
    );
    const mediaId = pubResp.data.id;

    // 4. Verify permalink
    const permResp = await axios.get(`${IG_GRAPH_BASE}/${mediaId}`, {
        params: { fields: "permalink", access_token: token },
        timeout: 15000,
    });
    return { mediaId, permalink: permResp.data.permalink };
}

// ============================================================
// TikTok drafts — push MP4 to @jegodigital inbox via Content Posting API
// ============================================================
async function pushTikTokDraft(doc) {
    const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN;
    if (!tiktokToken) {
        functions.logger.warn(
            "TIKTOK_ACCESS_TOKEN not set — skipping TikTok draft push"
        );
        return { skipped: true, reason: "no TIKTOK_ACCESS_TOKEN" };
    }
    const videoUrl = doc.assetUrls?.video;
    if (!videoUrl) throw new Error("missing assetUrls.video for TikTok draft");

    // Use PULL_FROM_URL source to send MP4 to drafts inbox
    const resp = await axios.post(
        `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`,
        {
            source_info: {
                source: "PULL_FROM_URL",
                video_url: videoUrl,
            },
        },
        {
            headers: {
                Authorization: `Bearer ${tiktokToken}`,
                "Content-Type": "application/json; charset=UTF-8",
            },
            timeout: 30000,
        }
    );
    return {
        publishId: resp.data?.data?.publish_id,
        raw: resp.data,
    };
}

// ============================================================
// Main processor
// ============================================================
async function processOne(docSnap) {
    const docRef = docSnap.ref;
    const doc = docSnap.data();
    const id = docSnap.id;

    const igUserId =
        process.env.IG_BUSINESS_ACCOUNT_ID || process.env.IG_USER_ID;
    if (!igUserId) throw new Error("no IG_BUSINESS_ACCOUNT_ID / IG_USER_ID");
    const token = await loadIgToken();
    if (!token) throw new Error("no IG_GRAPH_TOKEN");

    // Mark in_progress to avoid double-fire if cron overlaps
    await docRef.update({
        status: "in_progress",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let result;
    try {
        if (doc.format === "carousel")
            result = await publishCarousel(doc, igUserId, token);
        else if (doc.format === "single")
            result = await publishSingle(doc, igUserId, token);
        else if (doc.format === "reel")
            result = await publishReel(doc, igUserId, token);
        else throw new Error(`unknown format: ${doc.format}`);

        // For Reels, also push to TikTok drafts
        let tiktokResult = null;
        if (doc.format === "reel" && doc.tiktokDraft) {
            try {
                tiktokResult = await pushTikTokDraft(doc);
            } catch (e) {
                functions.logger.error(
                    `[${id}] TikTok draft push failed:`,
                    e.message
                );
                tiktokResult = { error: e.message };
            }
        }

        await docRef.update({
            status: "published",
            mediaId: result.mediaId,
            permalink: result.permalink,
            tiktokResult: tiktokResult || null,
            publishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: admin.firestore.FieldValue.delete(),
        });

        await postSlack({
            level: "info",
            title: `IG batch published: ${id}`,
            body: `*Topic:* ${doc.topic || "(none)"}\n*Format:* ${doc.format}\n*Permalink:* ${result.permalink}`,
            details: tiktokResult?.publishId
                ? `TikTok draft queued: ${tiktokResult.publishId}`
                : tiktokResult?.error
                  ? `TikTok push failed: ${tiktokResult.error}`
                  : doc.format === "reel"
                    ? "(no TikTok push — tiktokDraft=false)"
                    : undefined,
        });

        return { ok: true, id, ...result, tiktokResult };
    } catch (err) {
        functions.logger.error(`[${id}] publish failed:`, err.message, err.response?.data);
        const retryCount = (doc.retryCount || 0) + 1;
        await docRef.update({
            status: retryCount >= 3 ? "failed" : "ready", // re-queue up to 3 attempts
            error: err.message,
            errorDetails: err.response?.data
                ? JSON.stringify(err.response.data).slice(0, 1000)
                : null,
            retryCount,
            lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await postSlack({
            level: retryCount >= 3 ? "critical" : "warning",
            title: `IG batch ${retryCount >= 3 ? "FAILED" : "retry"}: ${id}`,
            body: `*Topic:* ${doc.topic || "(none)"}\n*Format:* ${doc.format}\n*Error:* ${err.message}\n*Attempt:* ${retryCount}/3`,
        });

        return { ok: false, id, error: err.message, retryCount };
    }
}

// ============================================================
// Cron entry — every 15 min America/Mexico_City
// ============================================================
exports.processIgBatchQueue = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("every 15 minutes")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const now = admin.firestore.Timestamp.now();

        const snap = await db
            .collection("ig_batch_queue")
            .where("status", "==", "ready")
            .where("fireAt", "<=", now)
            .orderBy("fireAt", "asc")
            .limit(5) // cap per run to stay under 540s timeout
            .get();

        if (snap.empty) {
            functions.logger.info("ig_batch_queue: nothing due");
            return null;
        }

        functions.logger.info(`ig_batch_queue: ${snap.size} due`);

        const results = [];
        for (const doc of snap.docs) {
            try {
                const r = await processOne(doc);
                results.push(r);
            } catch (e) {
                results.push({ ok: false, id: doc.id, error: e.message });
            }
        }

        functions.logger.info("ig_batch_queue results:", results);
        return null;
    });

// ============================================================
// One-shot seed HTTP trigger — populates Firestore ig_batch_queue with the
// 20-post Apr 29-May 3 batch. Idempotent (uses set with merge:true).
// Run once post-deploy:
//   curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/seedIgBatchQueue?token=$IG_BATCH_SEED_TOKEN"
// Token gate prevents accidental re-seeding from random callers.
// ============================================================
const APR29_MAY3_BATCH = [
    { id: "ig-batch-01-s1-leads-carousel", fireAt: "2026-04-29T13:00:00Z", format: "carousel", topic: "Service S1 — Captura de Leads 24/7 con IA", angle: "Service deep-dive (Path B WhatsApp Sofia mockup)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-02-mythbuster-3errores-reel", fireAt: "2026-04-29T16:00:00Z", format: "reel", topic: "3 errores que te hacen perder leads", angle: "Myth-buster (Alex on cam OR Veo b-roll + Tony VO)", path: "B", durationSec: 30, tiktokDraft: true },
    { id: "ig-batch-03-flamingo-stat-single", fireAt: "2026-04-29T19:00:00Z", format: "single", topic: "Flamingo 4.4x visibilidad stat card", angle: "Case study quote (Path A real Ahrefs screenshot) — RE-VERIFY at fire", path: "A", client: "flamingo", verifyRequired: ["ahrefs.organic_traffic_delta_realestateflamingo.com.mx"], tiktokDraft: false },
    { id: "ig-batch-04-crm-mockup-carousel", fireAt: "2026-04-29T22:00:00Z", format: "carousel", topic: "CRM dashboard mockup — Tu próximo CRM", angle: "Capability mockup (Path B template, no client name)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-05-s2-seo-local-carousel", fireAt: "2026-04-30T13:00:00Z", format: "carousel", topic: "Service S2 — SEO Local", angle: "Service deep-dive (Path B Maps rank panel mockup)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-06-mythbuster-chatgpt-reel", fireAt: "2026-04-30T16:00:00Z", format: "reel", topic: "Por qué ChatGPT no recomienda tu agencia", angle: "AEO myth-buster (Veo UI flythrough + Tony VO)", path: "B", durationSec: 30, tiktokDraft: true },
    { id: "ig-batch-07-flamingo-casestudy-carousel", fireAt: "2026-04-30T19:00:00Z", format: "carousel", topic: "Flamingo full case study", angle: "Case study (Path A real screenshots) — RE-VERIFY all numbers at fire", path: "A", client: "flamingo", slideCount: 5, verifyRequired: ["ahrefs.organic_traffic_delta", "dataforseo.local_serp_rank_inmobiliaria_cancun", "ga4.organic_traffic_delta_realestateflamingo.com.mx"], tiktokDraft: false },
    { id: "ig-batch-08-pagespeed-stat-single", fireAt: "2026-04-30T22:00:00Z", format: "single", topic: "98+ PageSpeed garantizado", angle: "Service guarantee stat (Path B)", path: "B", tiktokDraft: false },
    { id: "ig-batch-09-s3-aeo-carousel", fireAt: "2026-05-01T13:00:00Z", format: "carousel", topic: "Service S3 — AEO ChatGPT/Perplexity/Gemini", angle: "Service deep-dive (Path B AI search results mockup)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-10-mythbuster-whatsapp-reel", fireAt: "2026-05-01T16:00:00Z", format: "reel", topic: "Por qué tu WhatsApp pierde leads de noche", angle: "Founder POV myth-buster (prefer Alex on cam from /instagram/raw/)", path: "B", durationSec: 30, tiktokDraft: true },
    { id: "ig-batch-11-sofia-flow-carousel", fireAt: "2026-05-01T19:00:00Z", format: "carousel", topic: "WhatsApp Sofia AI flow mockup", angle: "Capability mockup (Path B chat flow template)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-12-mythbuster-seo2026-reel", fireAt: "2026-05-01T22:00:00Z", format: "reel", topic: "El SEO de 2026 ya no es lo que era", angle: "Myth-buster (split-screen Veo + Tony VO)", path: "B", durationSec: 30, tiktokDraft: true },
    { id: "ig-batch-13-s5-website-carousel", fireAt: "2026-05-02T13:00:00Z", format: "carousel", topic: "Service S5 — Sitio Web Alto Rendimiento", angle: "Service deep-dive (Path B Lighthouse mockup)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-14-mythbuster-maps-reel", fireAt: "2026-05-02T16:00:00Z", format: "reel", topic: "Tu Maps no aparece — esto es por qué", angle: "Local SEO myth-buster", path: "B", durationSec: 30, tiktokDraft: true },
    { id: "ig-batch-15-rsviajes-casestudy-carousel", fireAt: "2026-05-02T19:00:00Z", format: "carousel", topic: "RS Viajes case study (bilingual + multi-país)", angle: "Case study (Path A real screenshots) — RE-VERIFY at fire", path: "A", client: "rsviajes", slideCount: 5, verifyRequired: ["dataforseo.live_metrics_rsviajesreycoliman.com"], tiktokDraft: false },
    { id: "ig-batch-16-trojan-offer-single", fireAt: "2026-05-02T22:00:00Z", format: "single", topic: "Trojan Horse offer card — Setup gratis Captura de Leads", angle: "Trojan Horse CTA (Path B)", path: "B", tiktokDraft: false },
    { id: "ig-batch-17-s6-property-videos-carousel", fireAt: "2026-05-03T13:00:00Z", format: "carousel", topic: "Service S6 — Property Videos", angle: "Service deep-dive (Path B Reel mockup)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-18-founder-3cosas-reel", fireAt: "2026-05-03T16:00:00Z", format: "reel", topic: "3 cosas que cambia tener IA en tu agencia", angle: "Founder POV (prefer Alex on cam from /instagram/raw/)", path: "B", durationSec: 30, tiktokDraft: true },
    { id: "ig-batch-19-maps-rank-mockup-carousel", fireAt: "2026-05-03T19:00:00Z", format: "carousel", topic: "Google Maps rank panel mockup — #1 en tu zona", angle: "Capability mockup (Path B template)", path: "B", slideCount: 5, tiktokDraft: false },
    { id: "ig-batch-20-closing-cta-single", fireAt: "2026-05-03T22:00:00Z", format: "single", topic: "Closing CTA — ¿Viste todo? Ahora hablemos.", angle: "Batch closer (Path B)", path: "B", tiktokDraft: false },
];

exports.seedIgBatchQueue = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const expected = process.env.IG_BATCH_SEED_TOKEN;
            const got = req.query.token || req.headers["x-seed-token"];
            if (!expected || got !== expected) {
                return res
                    .status(403)
                    .json({ ok: false, error: "invalid or missing seed token" });
            }

            const db = admin.firestore();
            const batch = db.batch();
            const now = admin.firestore.FieldValue.serverTimestamp();

            for (const p of APR29_MAY3_BATCH) {
                const ref = db.collection("ig_batch_queue").doc(p.id);
                batch.set(
                    ref,
                    {
                        ...p,
                        fireAt: admin.firestore.Timestamp.fromDate(
                            new Date(p.fireAt)
                        ),
                        status: "pending_assets",
                        source: "2026-04-29-may-03-batch",
                        calendar:
                            "/instagram/batch-2026-04-29-may-03/CALENDAR.md",
                        createdAt: now,
                        retryCount: 0,
                    },
                    { merge: true }
                );
            }
            await batch.commit();

            const verify = await db
                .collection("ig_batch_queue")
                .where("source", "==", "2026-04-29-may-03-batch")
                .get();

            res.json({
                ok: true,
                seeded: APR29_MAY3_BATCH.length,
                inFirestore: verify.size,
                next: "Asset producer fills assetUrls + caption + flips status='ready'",
            });
        } catch (e) {
            functions.logger.error("seedIgBatchQueue failed", e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

// ============================================================
// On-demand HTTP trigger — for manual testing + post-deploy verification
// curl -X POST https://us-central1-jegodigital-e02fb.cloudfunctions.net/processIgBatchQueueOnDemand
// ============================================================
exports.processIgBatchQueueOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const db = admin.firestore();
            const now = admin.firestore.Timestamp.now();
            const limit = Number(req.query.limit) || 5;

            // Optional: fire a specific doc by id (for verify run)
            const docId = req.query.docId;
            let snapDocs;
            if (docId) {
                const single = await db
                    .collection("ig_batch_queue")
                    .doc(docId)
                    .get();
                if (!single.exists)
                    return res.status(404).json({ ok: false, error: "not found" });
                snapDocs = [single];
            } else {
                const s = await db
                    .collection("ig_batch_queue")
                    .where("status", "==", "ready")
                    .where("fireAt", "<=", now)
                    .orderBy("fireAt", "asc")
                    .limit(limit)
                    .get();
                snapDocs = s.docs;
            }

            const results = [];
            for (const d of snapDocs) {
                results.push(await processOne(d));
            }
            res.json({ ok: true, count: results.length, results });
        } catch (e) {
            functions.logger.error("processIgBatchQueueOnDemand failed", e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });
