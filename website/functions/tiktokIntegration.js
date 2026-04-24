/**
 * tiktokIntegration.js — TikTok @jegodigital analytics + OAuth
 *
 * Endpoints exposed:
 *   GET /auth/tiktok/start     → redirects user to TikTok OAuth consent page
 *   GET /auth/tiktok/callback  → receives code, exchanges for tokens, stores in Firestore
 *   GET /tiktokStatsOnDemand   → on-demand analytics pull (admin-only)
 *
 * Scheduled:
 *   tiktokStatsWeekly — every Monday 09:00 CDMX, posts digest to #content
 *
 * Token storage: Firestore `tokens/tiktok_jegodigital` with {access_token, refresh_token, expires_at}
 * Auto-refresh when expiring within 30 min.
 *
 * Uses Sandbox client key/secret (TIKTOK_SANDBOX_CLIENT_KEY / ..._SECRET).
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list";
const REDIRECT_URI = "https://jegodigital.com/auth/tiktok/callback";
const TOKEN_DOC = "tokens/tiktok_jegodigital";
const STATE_COLLECTION = "tiktok_oauth_states";
const CONTENT_CHANNEL_FALLBACK = "C0AV1EEDC3F";

// ================================================================
// Helpers
// ================================================================
async function slackPost(channel, text, blocks) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
        functions.logger.warn("no SLACK_BOT_TOKEN — skip slack post");
        return false;
    }
    try {
        const r = await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel, text, ...(blocks ? { blocks } : {}) },
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" }, timeout: 10000 }
        );
        return r.data?.ok === true;
    } catch (e) {
        functions.logger.error("slack post failed", e.message);
        return false;
    }
}

function buildAuthUrl(state) {
    const clientKey = process.env.TIKTOK_SANDBOX_CLIENT_KEY;
    const params = new URLSearchParams({
        client_key: clientKey,
        scope: SCOPES,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
    const clientKey = process.env.TIKTOK_SANDBOX_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_SANDBOX_CLIENT_SECRET;
    const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
    });
    const r = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
        timeout: 15000,
    });
    return r.data;
}

async function refreshTokens(refreshToken) {
    const clientKey = process.env.TIKTOK_SANDBOX_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_SANDBOX_CLIENT_SECRET;
    const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });
    const r = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
    });
    return r.data;
}

async function getValidAccessToken() {
    const doc = await admin.firestore().doc(TOKEN_DOC).get();
    if (!doc.exists) throw new Error("no TikTok tokens stored — run /auth/tiktok/start first");
    const data = doc.data();
    const now = Date.now();
    const expiresAt = data.expires_at?.toMillis ? data.expires_at.toMillis() : data.expires_at;
    // refresh if expiring within 30 min
    if (expiresAt - now < 30 * 60 * 1000) {
        functions.logger.info("TikTok access token expiring soon, refreshing");
        const fresh = await refreshTokens(data.refresh_token);
        if (!fresh.access_token) throw new Error(`refresh failed: ${JSON.stringify(fresh)}`);
        const newExpiresAt = now + (fresh.expires_in || 86400) * 1000;
        const refreshExpiresAt = now + (fresh.refresh_expires_in || 365 * 86400) * 1000;
        await admin.firestore().doc(TOKEN_DOC).set(
            {
                access_token: fresh.access_token,
                refresh_token: fresh.refresh_token || data.refresh_token,
                open_id: fresh.open_id || data.open_id,
                scope: fresh.scope || data.scope,
                expires_at: admin.firestore.Timestamp.fromMillis(newExpiresAt),
                refresh_expires_at: admin.firestore.Timestamp.fromMillis(refreshExpiresAt),
                refreshed_at: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return fresh.access_token;
    }
    return data.access_token;
}

async function fetchUserInfo(accessToken) {
    const r = await axios.get(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count",
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
    );
    return r.data?.data?.user || {};
}

async function fetchRecentVideos(accessToken, maxCount = 10) {
    const r = await axios.post(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,create_time,cover_image_url,embed_link,share_url,view_count,like_count,comment_count,share_count",
        { max_count: maxCount },
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    return r.data?.data?.videos || [];
}

// ================================================================
// OAuth flow
// ================================================================
exports.tiktokOauthStart = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const state = crypto.randomBytes(16).toString("hex");
            await admin.firestore().collection(STATE_COLLECTION).doc(state).set({
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                user_agent: req.get("User-Agent") || "?",
            });
            const url = buildAuthUrl(state);
            return res.redirect(302, url);
        } catch (e) {
            functions.logger.error("tiktokOauthStart error", e);
            return res.status(500).send(`error: ${e.message}`);
        }
    });

exports.tiktokOauthCallback = functions
    .runWith({
        timeoutSeconds: 60,
        memory: "256MB",
    })
    .https.onRequest(async (req, res) => {
        try {
            const { code, state, error, error_description } = req.query;
            if (error) {
                return res.status(400).send(`<h1>TikTok denied</h1><p>${error}: ${error_description || ""}</p>`);
            }
            if (!code || !state) {
                return res.status(400).send("<h1>Missing code or state</h1>");
            }
            // Verify state
            const stateDoc = await admin.firestore().collection(STATE_COLLECTION).doc(state).get();
            if (!stateDoc.exists) {
                return res.status(400).send("<h1>Invalid state</h1>");
            }
            // Exchange
            const tokens = await exchangeCodeForTokens(code);
            if (!tokens.access_token) {
                functions.logger.error("token exchange failed", tokens);
                return res.status(500).send(`<pre>${JSON.stringify(tokens, null, 2)}</pre>`);
            }
            const now = Date.now();
            const expiresAt = now + (tokens.expires_in || 86400) * 1000;
            const refreshExpiresAt = now + (tokens.refresh_expires_in || 365 * 86400) * 1000;
            await admin.firestore().doc(TOKEN_DOC).set({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                open_id: tokens.open_id,
                scope: tokens.scope,
                token_type: tokens.token_type || "Bearer",
                expires_at: admin.firestore.Timestamp.fromMillis(expiresAt),
                refresh_expires_at: admin.firestore.Timestamp.fromMillis(refreshExpiresAt),
                obtained_at: admin.firestore.FieldValue.serverTimestamp(),
                account_label: "jegodigital",
            });
            // Clean up state
            await stateDoc.ref.delete().catch(() => {});
            // Immediately fetch stats + post to Slack
            try {
                const user = await fetchUserInfo(tokens.access_token);
                await slackPost(
                    process.env.SLACK_CHANNEL_CONTENT || CONTENT_CHANNEL_FALLBACK,
                    `✅ TikTok @${user.display_name || "jegodigital"} connected`,
                    [
                        { type: "header", text: { type: "plain_text", text: "✅ TikTok connected to Slack" } },
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text:
                                    `*Account:* @${user.display_name || "?"}${user.is_verified ? " ✓" : ""}\n` +
                                    `*Followers:* ${(user.follower_count || 0).toLocaleString()}\n` +
                                    `*Following:* ${(user.following_count || 0).toLocaleString()}\n` +
                                    `*Total likes:* ${(user.likes_count || 0).toLocaleString()}\n` +
                                    `*Videos:* ${(user.video_count || 0).toLocaleString()}\n` +
                                    `*Bio:* ${user.bio_description || "—"}\n\n` +
                                    `Auto-refresh: every Monday 09:00 CDMX via \`tiktokStatsWeekly\`.`,
                            },
                        },
                    ]
                );
            } catch (e) {
                functions.logger.warn("initial stats fetch failed (non-fatal)", e.message);
            }
            return res.status(200).send(`
<!DOCTYPE html>
<html><head><title>TikTok Connected</title>
<style>body{font-family:sans-serif;background:#0f1115;color:#fff;text-align:center;padding:60px 20px;}
h1{color:#C5A059;}a{color:#C5A059;}</style></head>
<body>
  <h1>✅ TikTok Connected</h1>
  <p>@jegodigital is now wired to JegoDigital Ops.</p>
  <p>Check <a href="https://jegodigital.slack.com/archives/${process.env.SLACK_CHANNEL_CONTENT || CONTENT_CHANNEL_FALLBACK}">#content on Slack</a> — your account stats just posted.</p>
  <p><small>Token stored. Auto-refresh enabled. Weekly digest every Monday 09:00 CDMX.</small></p>
</body></html>`);
        } catch (e) {
            functions.logger.error("tiktokOauthCallback error", e);
            return res.status(500).send(`<pre>${e.message}</pre>`);
        }
    });

// ================================================================
// Stats fetch + Slack digest
// ================================================================
async function buildDigest() {
    const accessToken = await getValidAccessToken();
    const user = await fetchUserInfo(accessToken);
    const videos = await fetchRecentVideos(accessToken, 10);
    const totalViews = videos.reduce((a, v) => a + (v.view_count || 0), 0);
    const totalLikes = videos.reduce((a, v) => a + (v.like_count || 0), 0);
    const totalComments = videos.reduce((a, v) => a + (v.comment_count || 0), 0);
    const totalShares = videos.reduce((a, v) => a + (v.share_count || 0), 0);
    const topVideo = videos.slice().sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0];
    return { user, videos, totalViews, totalLikes, totalComments, totalShares, topVideo };
}

async function postDigest(label = "") {
    const d = await buildDigest();
    const { user, videos, totalViews, totalLikes, totalComments, totalShares, topVideo } = d;
    const ts = new Date().toISOString().split("T")[0];
    const header = label ? `📊 TikTok Digest${label ? ` — ${label}` : ""}` : `📊 TikTok Weekly Digest`;
    const topLine = topVideo
        ? `*Top video:* ${(topVideo.title || topVideo.video_description || "(no title)").slice(0, 60)}\n   👀 ${(topVideo.view_count || 0).toLocaleString()} views · ❤️ ${(topVideo.like_count || 0).toLocaleString()} · 💬 ${(topVideo.comment_count || 0).toLocaleString()} · 🔁 ${(topVideo.share_count || 0).toLocaleString()}\n   <${topVideo.share_url}|Watch on TikTok>`
        : "_No videos found in last 10_";
    const body =
        `*@${user.display_name || "jegodigital"}*${user.is_verified ? " ✓" : ""}\n` +
        `*Followers:* ${(user.follower_count || 0).toLocaleString()} · *Following:* ${(user.following_count || 0).toLocaleString()}\n` +
        `*Total likes (all time):* ${(user.likes_count || 0).toLocaleString()} · *Total videos:* ${(user.video_count || 0).toLocaleString()}\n\n` +
        `*Last 10 videos combined:*\n` +
        `• 👀 ${totalViews.toLocaleString()} views\n` +
        `• ❤️ ${totalLikes.toLocaleString()} likes\n` +
        `• 💬 ${totalComments.toLocaleString()} comments\n` +
        `• 🔁 ${totalShares.toLocaleString()} shares\n\n` +
        topLine;
    await slackPost(
        process.env.SLACK_CHANNEL_CONTENT || CONTENT_CHANNEL_FALLBACK,
        header,
        [
            { type: "header", text: { type: "plain_text", text: `${header} — ${ts}` } },
            { type: "section", text: { type: "mrkdwn", text: body } },
            { type: "context", elements: [{ type: "mrkdwn", text: `HR-0 compliant · Pulled live from TikTok v2 API · Auto-refreshes Monday 09:00 CDMX` }] },
        ]
    );
    return d;
}

exports.tiktokStatsWeekly = functions
    .runWith({
        timeoutSeconds: 60,
        memory: "256MB",
    })
    .pubsub.schedule("every monday 09:00")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            await postDigest("Weekly");
        } catch (e) {
            functions.logger.error("tiktokStatsWeekly error", e);
        }
        return null;
    });

exports.tiktokStatsOnDemand = functions
    .runWith({
        timeoutSeconds: 60,
        memory: "256MB",
    })
    .https.onRequest(async (req, res) => {
        const tok = req.get("X-Admin-Token") || req.query.token;
        if (!tok || tok !== process.env.ADMIN_TRIGGER_TOKEN) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        try {
            const d = await postDigest("On-demand");
            return res.status(200).json({ ok: true, user: d.user, videos_count: d.videos.length });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });
