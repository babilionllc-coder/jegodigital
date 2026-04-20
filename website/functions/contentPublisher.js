/**
 * contentPublisher — daily 10:00 CDMX Instagram publisher.
 *
 * Reads content_queue/{YYYY-MM-DD} Firestore doc for today's scheduled posts
 * (Instagram single / carousel / reel / story), fires Graph API v22.0
 * media creation + publish, logs outcomes to content_publishes.
 *
 * Content flow:
 *   1. Content team (Alex + claude-dev) builds slide PNGs / Reel MP4s via the
 *      canva-jegodigital / jegodigital-carousels skills.
 *   2. Finished assets uploaded to catbox.moe → public HTTPS URLs.
 *   3. Queued into Firestore at content_queue/{date} with shape:
 *        { posts: [
 *            { type: "carousel", image_urls: [...], caption: "...",
 *              scheduled_hour: 10, hashtags: "..." },
 *            { type: "single", image_url: "...", caption: "..." },
 *            { type: "reel", video_url: "...", caption: "..." },
 *            { type: "story", image_url: "..." },
 *        ]}
 *   4. This cron picks up today's doc and publishes everything.
 *
 * Design rule per Alex 2026-04-20: no approve-gate. Telegram alerts per-publish.
 *
 * Hard constraints (CLAUDE.md §Instagram Publishing):
 *   • Captions always Spanish (unless caller overrides)
 *   • No pricing, no AI tool names
 *   • 5-8 hashtags from approved set
 *   • One CTA: WhatsApp +52 998 787 5321 OR calendly.com/jegoalexdigital/30min
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (!r.data?.ok) {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId, text,
            }, { timeout: 10000 });
        }
        return { ok: true };
    } catch (err) {
        functions.logger.error("contentPublisher Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- IG Graph API config ----
const IG_USER_ID = "17841424426942739"; // @jegodigital
const IG_API_VERSION = "v22.0";
const IG_TOKEN_FALLBACK = "EAAQdn3Rd3T0BRNX1ZBVkyzACZChW3Bffm09VIEZBDjWOtosJ5S6Ou3vBkdXGv5Lak9Jn0TM225GCwUPsGfXeqMtzLrOS6hRvGAC0w5VgeygfkrewgNYddVZBb0kh6wdR3dtsP7URUcWyhNLVBU9ESoD8Ty6sjKLM2ced3YSZARiZAmf5DDnmNDxSBGNPcDIOZBL";

function igToken() {
    return process.env.IG_GRAPH_TOKEN || IG_TOKEN_FALLBACK;
}

// ---- IG helpers ----
async function createContainer(params) {
    const url = `https://graph.facebook.com/${IG_API_VERSION}/${IG_USER_ID}/media`;
    const body = new URLSearchParams({ ...params, access_token: igToken() });
    const r = await axios.post(url, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 30000,
    });
    return r.data.id;
}

async function publishContainer(creationId) {
    const url = `https://graph.facebook.com/${IG_API_VERSION}/${IG_USER_ID}/media_publish`;
    const body = new URLSearchParams({ creation_id: creationId, access_token: igToken() });
    const r = await axios.post(url, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 30000,
    });
    return r.data.id;
}

async function getPermalink(mediaId) {
    try {
        const r = await axios.get(
            `https://graph.facebook.com/${IG_API_VERSION}/${mediaId}?fields=permalink&access_token=${igToken()}`,
            { timeout: 10000 }
        );
        return r.data.permalink || null;
    } catch (err) {
        return null;
    }
}

async function pollReelStatus(containerId, maxAttempts = 15) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const r = await axios.get(
                `https://graph.facebook.com/${IG_API_VERSION}/${containerId}?fields=status_code&access_token=${igToken()}`,
                { timeout: 10000 }
            );
            const status = r.data?.status_code;
            if (status === "FINISHED") return true;
            if (status === "ERROR" || status === "EXPIRED") return false;
        } catch (err) { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 5000));
    }
    return false;
}

// ---- Publishers per type ----
async function publishSingle(post) {
    const containerId = await createContainer({
        image_url: post.image_url,
        caption: post.caption || "",
    });
    return publishContainer(containerId);
}

async function publishCarousel(post) {
    const childIds = [];
    for (const url of post.image_urls) {
        const cid = await createContainer({ image_url: url, is_carousel_item: "true" });
        childIds.push(cid);
    }
    const parentId = await createContainer({
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: post.caption || "",
    });
    await new Promise((r) => setTimeout(r, 8000)); // let IG finalize children
    return publishContainer(parentId);
}

async function publishReel(post) {
    const containerId = await createContainer({
        media_type: "REELS",
        video_url: post.video_url,
        caption: post.caption || "",
        share_to_feed: "true",
    });
    const ready = await pollReelStatus(containerId);
    if (!ready) throw new Error("Reel failed to finalize within poll window");
    return publishContainer(containerId);
}

async function publishStory(post) {
    const containerId = await createContainer({
        media_type: "STORIES",
        image_url: post.image_url,
    });
    return publishContainer(containerId);
}

// =====================================================================
// contentPublisher — Daily 10:00 CDMX
// =====================================================================
exports.contentPublisher = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 10 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const dateKey = now.toISOString().slice(0, 10);

        functions.logger.info(`contentPublisher ${dateKey}: starting`);

        const queueDoc = await db.collection("content_queue").doc(dateKey).get();
        if (!queueDoc.exists) {
            functions.logger.info(`contentPublisher ${dateKey}: no queue doc, nothing to post.`);
            return null;
        }

        const posts = queueDoc.data()?.posts || [];
        if (!posts.length) {
            functions.logger.info(`contentPublisher ${dateKey}: queue empty.`);
            return null;
        }

        const results = [];
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const type = (post.type || "single").toLowerCase();
            const startedAt = admin.firestore.FieldValue.serverTimestamp();
            try {
                let mediaId;
                if (type === "carousel") mediaId = await publishCarousel(post);
                else if (type === "reel" || type === "video") mediaId = await publishReel(post);
                else if (type === "story") mediaId = await publishStory(post);
                else mediaId = await publishSingle(post);

                const permalink = await getPermalink(mediaId);
                results.push({ idx: i, type, ok: true, mediaId, permalink });

                await db.collection("content_publishes").add({
                    date_key: dateKey,
                    idx: i,
                    type,
                    media_id: mediaId,
                    permalink,
                    caption_preview: (post.caption || "").slice(0, 200),
                    published_at: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (err) {
                const msg = err.response?.data?.error?.message || err.message;
                functions.logger.error(`contentPublisher ${dateKey} post ${i} (${type}) failed:`, msg);
                results.push({ idx: i, type, ok: false, error: msg });
                await db.collection("content_publishes").add({
                    date_key: dateKey,
                    idx: i,
                    type,
                    error: msg,
                    started_at: startedAt,
                    failed_at: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            // Space publishes 30s apart — IG hates rapid media_publish calls
            if (i < posts.length - 1) await new Promise((r) => setTimeout(r, 30000));
        }

        // Summary + Telegram
        const ok = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok).length;
        await db.collection("content_publishes").doc(`_summary_${dateKey}`).set({
            date: dateKey,
            posts: posts.length,
            ok,
            failed,
            results,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        const lines = [`📸 *contentPublisher ${dateKey}* — ${ok}/${posts.length} shipped`];
        results.forEach((r) => {
            if (r.ok) lines.push(`   ✅ ${r.type} · ${r.permalink || r.mediaId}`);
            else lines.push(`   ❌ ${r.type} · ${String(r.error).slice(0, 120)}`);
        });
        if (failed > 0) lines.push("", `⚠️ ${failed} failed — check Graph API token + catbox URLs.`);
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`contentPublisher ${dateKey}: ok=${ok} failed=${failed}`);
        return null;
    });
