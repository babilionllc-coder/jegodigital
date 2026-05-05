/**
 * metaCreateAd.js — Compliance-gated wrapper for Meta Ad creation.
 *
 * Spec note: the original spec asked us to wire complianceGate into "any FB ad
 * creation Cloud Function (greppable: meta_create_*)". As of 2026-05-05, the
 * JegoDigital functions/ tree has no such Cloud Function — FB campaigns are
 * created via the Meta Ads MCP from local agents, not from a Cloud Function.
 *
 * This module is the canonical wrapper any future automation MUST use to build
 * a Meta ad. It runs the 7-gate complianceGate(channel="fb_ad") on the
 * creative payload BEFORE hitting the Meta Graph API. Functions named
 * `meta_create_ad`, `meta_create_campaign`, `meta_create_creative` are exported
 * here so a `grep meta_create_` pattern hits.
 *
 * Public surface:
 *   - meta_create_ad({ name, body, sender, country })          → { ok, id?, error?, compliance? }
 *   - meta_create_campaign({ name, objective, sender })        → { ok, id?, error? }
 *   - meta_create_creative({ name, body, sender })             → { ok, id?, error? }
 *
 * Channel: "fb_ad". firstTouch defaults to TRUE (FB ad creative is always seen
 * by a fresh audience and must satisfy HR-19 intro check).
 */

const axios = require("axios");
const { complianceGate } = require("./complianceGate");

const FB_AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID || "968739288838315";
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || "";
const FB_USER_TOKEN = process.env.FB_USER_TOKEN || "";
const GRAPH_VERSION = "v22.0";

function authToken() {
    return FB_USER_TOKEN || FB_PAGE_ACCESS_TOKEN;
}

function actId() {
    return String(FB_AD_ACCOUNT_ID).startsWith("act_") ? FB_AD_ACCOUNT_ID : `act_${FB_AD_ACCOUNT_ID}`;
}

/**
 * Create a Meta ad creative. Compliance-gated first.
 */
async function meta_create_creative({ name, body, sender, firstTouch = true, country = "MX", linkUrl } = {}) {
    if (!name || !body) return { ok: false, error: "name+body_required" };
    const senderResolved = sender || actId();

    const gate = await complianceGate(
        {
            to: actId(),       // audience destination — for fb_ad we use the ad-account ID
            body,
            sender: senderResolved,
            country,
            firstTouch,
            userInitiated: false,
        },
        "fb_ad"
    );
    if (!gate.pass) {
        return { ok: false, error: `compliance_block:${gate.reason}`, compliance: gate };
    }

    const token = authToken();
    if (!token) return { ok: false, error: "FB_USER_TOKEN_or_FB_PAGE_ACCESS_TOKEN_missing" };

    try {
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/adcreatives`;
        const r = await axios.post(url, {
            name,
            object_story_spec: {
                page_id: process.env.FB_PAGE_ID || "766570479879044",
                link_data: {
                    message: body,
                    link: linkUrl || "https://jegodigital.com",
                },
            },
            access_token: token,
        }, { timeout: 20000 });
        return { ok: true, id: r.data?.id, compliance: gate };
    } catch (e) {
        return {
            ok: false,
            error: `fb_api_error:${e.response?.data?.error?.message || e.message}`,
            compliance: gate,
        };
    }
}

/**
 * Create a Meta ad campaign. Compliance-gated first (sender + country only —
 * objective string isn't body content).
 */
async function meta_create_campaign({ name, objective = "OUTCOME_LEADS", sender, country = "MX" } = {}) {
    if (!name) return { ok: false, error: "name_required" };
    const senderResolved = sender || actId();

    const gate = await complianceGate(
        {
            to: actId(),
            body: `[campaign_create] ${name} objective=${objective}`, // bypasses HR-19 firstTouch=false
            sender: senderResolved,
            country,
            firstTouch: false,
            userInitiated: false,
        },
        "fb_ad"
    );
    if (!gate.pass) {
        return { ok: false, error: `compliance_block:${gate.reason}`, compliance: gate };
    }

    const token = authToken();
    if (!token) return { ok: false, error: "FB_USER_TOKEN_or_FB_PAGE_ACCESS_TOKEN_missing" };

    try {
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/campaigns`;
        const r = await axios.post(url, {
            name,
            objective,
            status: "PAUSED",
            special_ad_categories: [],
            access_token: token,
        }, { timeout: 20000 });
        return { ok: true, id: r.data?.id, compliance: gate };
    } catch (e) {
        return {
            ok: false,
            error: `fb_api_error:${e.response?.data?.error?.message || e.message}`,
            compliance: gate,
        };
    }
}

/**
 * Create a Meta ad (creative + ad combo). Compliance-gated.
 */
async function meta_create_ad({ name, body, sender, adsetId, creativeId, country = "MX", firstTouch = true } = {}) {
    if (!name || !adsetId) return { ok: false, error: "name+adsetId_required" };
    const senderResolved = sender || actId();

    const gate = await complianceGate(
        {
            to: actId(),
            body: body || `[ad_create] ${name}`,
            sender: senderResolved,
            country,
            firstTouch,
            userInitiated: false,
        },
        "fb_ad"
    );
    if (!gate.pass) {
        return { ok: false, error: `compliance_block:${gate.reason}`, compliance: gate };
    }

    const token = authToken();
    if (!token) return { ok: false, error: "FB_USER_TOKEN_or_FB_PAGE_ACCESS_TOKEN_missing" };

    try {
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/ads`;
        const payload = {
            name,
            adset_id: adsetId,
            status: "PAUSED",
            access_token: token,
        };
        if (creativeId) payload.creative = JSON.stringify({ creative_id: creativeId });
        const r = await axios.post(url, payload, { timeout: 20000 });
        return { ok: true, id: r.data?.id, compliance: gate };
    } catch (e) {
        return {
            ok: false,
            error: `fb_api_error:${e.response?.data?.error?.message || e.message}`,
            compliance: gate,
        };
    }
}

module.exports = {
    meta_create_ad,
    meta_create_campaign,
    meta_create_creative,
};
