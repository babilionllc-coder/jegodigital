/**
 * igTokenAutoRefresh — Instagram Graph API token auto-refresh
 *
 * Instagram long-lived tokens expire every 60 days. If we let it expire,
 * every Graph API call returns 400 and all @jegodigital_agencia
 * automations silently fail (social digest, carousel publishing, etc.).
 *
 * This function refreshes the token every 50 days (10-day safety buffer)
 * via the Instagram Login API refresh endpoint. On success:
 *   - Update GH Secret IG_GRAPH_TOKEN via GitHub API (encrypted PUT)
 *   - Update Firestore cache `ig_token_cache/current` so running Cloud
 *     Functions pick up the new token on next cold start
 *   - Post confirmation to #alerts
 *
 * On failure:
 *   - Post CRITICAL alert to #alerts with manual-refresh link
 *
 * Uses the NEW Instagram Login API flow (IGAAT prefix tokens), endpoint
 * `graph.instagram.com/refresh_access_token` — NOT the legacy Facebook
 * Graph API endpoint.
 *
 * HR-0 + HR-2 + HR-6 compliant.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const sodium = require("libsodium-wrappers");

if (!admin.apps.length) admin.initializeApp();

const ALERTS_CHANNEL_FALLBACK = "C0AV2Q73PM4";

// ============================================================
// Slack alert helper (copy of pattern from creditWatchdogs)
// ============================================================
async function postSlackAlert({ level, title, body, details }) {
    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL_ALERTS || ALERTS_CHANNEL_FALLBACK;
    if (!token) return false;
    const emoji = level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "✅";
    const blocks = [
        { type: "header", text: { type: "plain_text", text: `${emoji} ${title}` } },
        { type: "section", text: { type: "mrkdwn", text: body } },
    ];
    if (details) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: details }] });
    try {
        await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel, text: `${emoji} ${title}`, blocks },
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" }, timeout: 10000 }
        );
        return true;
    } catch (e) {
        functions.logger.error("slack alert failed", e.message);
        return false;
    }
}

// ============================================================
// GitHub Secret PUT helper (encrypted)
// ============================================================
async function updateGithubSecret(secretName, secretValue) {
    const gh = process.env.GH_PAT || process.env.GITHUB_TOKEN;
    if (!gh) throw new Error("no GH_PAT");
    const repo = "babilionllc-coder/jegodigital";

    // 1. Get public key
    const keyResp = await axios.get(
        `https://api.github.com/repos/${repo}/actions/secrets/public-key`,
        { headers: { Authorization: `Bearer ${gh}`, Accept: "application/vnd.github+json" } }
    );
    const { key_id, key: pubKey } = keyResp.data;

    // 2. Encrypt using libsodium sealed box
    await sodium.ready;
    const pubKeyBytes = sodium.from_base64(pubKey, sodium.base64_variants.ORIGINAL);
    const secretBytes = sodium.from_string(secretValue);
    const encrypted = sodium.crypto_box_seal(secretBytes, pubKeyBytes);
    const encryptedB64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

    // 3. PUT secret
    const r = await axios.put(
        `https://api.github.com/repos/${repo}/actions/secrets/${secretName}`,
        { encrypted_value: encryptedB64, key_id },
        { headers: { Authorization: `Bearer ${gh}`, Accept: "application/vnd.github+json" } }
    );
    return r.status;
}

// ============================================================
// Instagram token refresh
// ============================================================
async function refreshIgToken() {
    const currentToken = process.env.IG_GRAPH_TOKEN;
    if (!currentToken) throw new Error("no IG_GRAPH_TOKEN in env");

    // Step 1: Verify current token still works
    try {
        await axios.get(`https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${currentToken}`, { timeout: 10000 });
    } catch (e) {
        const status = e.response?.status || "?";
        const body = JSON.stringify(e.response?.data || {}).slice(0, 300);
        throw new Error(`current token invalid (HTTP ${status}): ${body}`);
    }

    // Step 2: Refresh via graph.instagram.com
    const refreshResp = await axios.get(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`,
        { timeout: 15000 }
    );
    const { access_token: newToken, expires_in: expiresIn, token_type: tokenType } = refreshResp.data;
    if (!newToken) throw new Error(`refresh returned no token: ${JSON.stringify(refreshResp.data)}`);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const daysValid = Math.floor(expiresIn / 86400);

    // Step 3: Update GH Secret (so next Cloud Function deploy picks up new token)
    let ghStatus = "skipped (no GH_PAT)";
    try {
        const s = await updateGithubSecret("IG_GRAPH_TOKEN", newToken);
        ghStatus = `HTTP ${s}`;
    } catch (e) {
        ghStatus = `ERR ${e.message}`;
    }

    // Step 4: Update Firestore cache (for running Functions to pick up without redeploy)
    await admin.firestore().collection("ig_token_cache").doc("current").set(
        {
            token: newToken,
            expiresAt,
            daysValid,
            tokenType,
            refreshedAt: admin.firestore.FieldValue.serverTimestamp(),
            ghSecretUpdate: ghStatus,
        },
        { merge: true }
    );

    return { newTokenPrefix: newToken.slice(0, 15) + "...", expiresAt, daysValid, ghStatus };
}

// ============================================================
// Exports
// ============================================================
exports.igTokenAutoRefresh = functions
    .runWith({
        timeoutSeconds: 60,
        memory: "256MB",
    })
    // 2026-04-25: was "every 50 days 00:00" — Cloud Scheduler rejected as
    // "schedule or timezone are invalid", which cascaded into deploy exit 2,
    // skipping the IAM-grant step and leaving new HTTP functions 403.
    // Standard cron: 1st of every month at 00:00 CDMX = ~30-day refresh
    // cadence. IG long-lived tokens last 60 days, so 30-day refresh keeps
    // a healthy buffer.
    .pubsub.schedule("0 0 1 * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await refreshIgToken();
            functions.logger.info("igTokenAutoRefresh success:", r);
            await postSlackAlert({
                level: "info",
                title: "Instagram token refreshed",
                body:
                    `Refreshed *IG_GRAPH_TOKEN* for *@jegodigital_agencia*.\n` +
                    `New token valid ${r.daysValid} days (until ${r.expiresAt.slice(0, 10)}).\n` +
                    `GH Secret update: ${r.ghStatus}`,
                details: `Next auto-refresh: ${new Date(Date.now() + 50 * 86400 * 1000).toISOString().slice(0, 10)}`,
            });
            return null;
        } catch (e) {
            functions.logger.error("igTokenAutoRefresh FAILED:", e);
            await postSlackAlert({
                level: "critical",
                title: "Instagram token refresh FAILED",
                body:
                    `*IG token refresh crashed:*\n\`${e.message}\`\n\n` +
                    `*Action required:* Manually regenerate via https://developers.facebook.com/tools/accesstoken/\n` +
                    `Once new token obtained, update GH Secret *IG_GRAPH_TOKEN* and redeploy.`,
            });
            return null;
        }
    });

exports.igTokenAutoRefreshOnDemand = functions
    .runWith({
        timeoutSeconds: 60,
        memory: "256MB",
    })
    .https.onRequest(async (req, res) => {
        const tok = req.get("X-Admin-Token");
        if (!tok || tok !== process.env.ADMIN_TRIGGER_TOKEN) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        try {
            const r = await refreshIgToken();
            return res.status(200).json({ ok: true, ...r });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });
