/**
 * metaApiCore.js — Shared helpers for the Meta Marketing API Cloud Functions.
 *
 * Used by:
 *   - metaCreateAdSet.js
 *   - metaCreateAdImage.js
 *   - metaCreateAdCreative.js
 *   - metaCreateAdRunner.js
 *
 * Goals:
 *   1. Bearer-token auth gate (validates `Authorization: Bearer <token>` against
 *      env `INTERNAL_API_TOKEN`). Fail closed — if env is missing, refuse.
 *   2. Centralised Telegram + Slack notify on success / failure (HR-24).
 *   3. Tiny axios wrapper around graph.facebook.com/v22.0 with consistent
 *      error shape `{ ok, id?, error?, raw? }`.
 *   4. Idempotency lookups: list-by-name helpers used by AdSet / Creative /
 *      Ad creators to detect duplicates before posting.
 *
 * Env contract:
 *   INTERNAL_API_TOKEN     — required for auth gate
 *   FB_USER_TOKEN          — Meta Graph API user token w/ ads_management
 *   FB_PAGE_ACCESS_TOKEN   — fallback if FB_USER_TOKEN absent
 *   FB_AD_ACCOUNT_ID       — defaults to "968739288838315"
 *   FB_PAGE_ID             — defaults to "766570479879044"
 *   FB_PIXEL_ID            — defaults to "2356041791557638"
 *   TELEGRAM_BOT_TOKEN     — uses complianceGate fallback if absent
 *   TELEGRAM_CHAT_ID       — uses complianceGate fallback if absent
 */

const axios = require("axios");

const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Telegram fallback mirrored from complianceGate.js (single source of truth on
// the bot creds — we re-use that file's constants by reading the env vars
// it sets first; only fall through to literals if env is empty).
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

function actId() {
    const raw = process.env.FB_AD_ACCOUNT_ID || "968739288838315";
    return String(raw).startsWith("act_") ? raw : `act_${raw}`;
}

function pageId() {
    return process.env.FB_PAGE_ID || "766570479879044";
}

function pixelId() {
    return process.env.FB_PIXEL_ID || "2356041791557638";
}

function authToken() {
    return process.env.FB_USER_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || "";
}

/**
 * requireBearer — Express-style auth gate. Returns true if the request carries
 * a valid Authorization Bearer token matching env INTERNAL_API_TOKEN.
 *
 * Fail-closed: if INTERNAL_API_TOKEN is not set, ALL requests are rejected
 * with 503 "auth_not_configured" — never silently grant access.
 */
function requireBearer(req, res) {
    const expected = process.env.INTERNAL_API_TOKEN || "";
    if (!expected) {
        res.status(503).json({ ok: false, error: "auth_not_configured", hint: "set INTERNAL_API_TOKEN env" });
        return false;
    }
    const header = req.headers?.authorization || req.headers?.Authorization || "";
    const m = String(header).match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== expected) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return false;
    }
    return true;
}

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 }
        );
        return { ok: !!r.data?.ok, message_id: r.data?.result?.message_id };
    } catch (e) {
        try {
            const r = await axios.post(
                `https://api.telegram.org/bot${token}/sendMessage`,
                { chat_id: chatId, text, disable_web_page_preview: true },
                { timeout: 10000 }
            );
            return { ok: !!r.data?.ok, message_id: r.data?.result?.message_id };
        } catch (e2) {
            return { ok: false, error: e2.message };
        }
    }
}

async function sendSlack(text) {
    const url = process.env.SLACK_WEBHOOK_URL || "";
    if (!url) return { ok: false, error: "slack_webhook_missing" };
    try {
        const r = await axios.post(url, { text }, { timeout: 10000 });
        return { ok: r.status === 200 };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function notifyBoth(text) {
    const [tg, sl] = await Promise.all([
        sendTelegram(text).catch(() => ({ ok: false })),
        sendSlack(text).catch(() => ({ ok: false })),
    ]);
    return { telegram: tg, slack: sl };
}

/**
 * graphPost — thin wrapper around POST to graph.facebook.com.
 * Always merges `access_token` into the body. Returns `{ ok, data?, error?, raw? }`.
 */
async function graphPost(path, body, opts = {}) {
    const token = authToken();
    if (!token) return { ok: false, error: "fb_token_missing" };
    const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    try {
        const r = await axios.post(
            url,
            { ...body, access_token: token },
            { timeout: opts.timeoutMs || 30000, ...(opts.axios || {}) }
        );
        return { ok: true, data: r.data };
    } catch (e) {
        return {
            ok: false,
            error: e.response?.data?.error?.message || e.message,
            raw: e.response?.data || null,
        };
    }
}

/**
 * graphGet — thin wrapper around GET on the Graph API.
 */
async function graphGet(path, params = {}) {
    const token = authToken();
    if (!token) return { ok: false, error: "fb_token_missing" };
    const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    try {
        const r = await axios.get(url, {
            params: { ...params, access_token: token },
            timeout: 20000,
        });
        return { ok: true, data: r.data };
    } catch (e) {
        return {
            ok: false,
            error: e.response?.data?.error?.message || e.message,
            raw: e.response?.data || null,
        };
    }
}

/**
 * findAdSetByName — list AdSets in a campaign, return the one matching `name`.
 * Used for idempotency before POSTing a duplicate.
 */
async function findAdSetByName(campaignId, name) {
    const r = await graphGet(`/${campaignId}/adsets`, {
        fields: "id,name,status",
        limit: 200,
    });
    if (!r.ok) return null;
    const hit = (r.data?.data || []).find((a) => a.name === name);
    return hit || null;
}

async function findAdCreativeByName(name) {
    const r = await graphGet(`/${actId()}/adcreatives`, {
        fields: "id,name",
        limit: 200,
    });
    if (!r.ok) return null;
    const hit = (r.data?.data || []).find((a) => a.name === name);
    return hit || null;
}

async function findAdByName(adsetId, name) {
    const r = await graphGet(`/${adsetId}/ads`, {
        fields: "id,name,status",
        limit: 200,
    });
    if (!r.ok) return null;
    const hit = (r.data?.data || []).find((a) => a.name === name);
    return hit || null;
}

module.exports = {
    GRAPH_VERSION,
    GRAPH_BASE,
    actId,
    pageId,
    pixelId,
    authToken,
    requireBearer,
    sendTelegram,
    sendSlack,
    notifyBoth,
    graphPost,
    graphGet,
    findAdSetByName,
    findAdCreativeByName,
    findAdByName,
};
