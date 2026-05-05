/**
 * metaCreateAdSet.js — HTTPS-gated Cloud Function to create a Meta AdSet.
 *
 * Built 2026-05-05 to unblock autonomous v4 paid-ready staging from future
 * Cowork sessions (no local bash required).
 *
 * Auth: Bearer INTERNAL_API_TOKEN (fail closed).
 *
 * POST body:
 *   {
 *     campaign_id:        string  (required)
 *     name:               string  (required)
 *     daily_budget_cents: number  (required, e.g. 500 = $5/day USD)
 *     optimization_goal:  string  (default "LEAD_GENERATION")
 *     billing_event:      string  (default "IMPRESSIONS")
 *     bid_strategy:       string  (default "LOWEST_COST_WITHOUT_CAP")
 *     targeting:          object  (full Meta targeting spec)
 *     promoted_object:    object? (default {pixel_id, custom_event_type:"LEAD"})
 *     status:             string  (default "PAUSED")
 *   }
 *
 * Idempotent: if an AdSet with the same `name` already exists in the campaign,
 * returns the existing ID with `existing: true` instead of creating a duplicate.
 *
 * On success: Telegram + Slack notify, returns `{ ok, adset_id, existing? }`.
 * On failure: Telegram + Slack notify with error, returns `{ ok:false, error }`.
 *
 * HR-6 alignment: Meta API confirmation in same call → returned to caller.
 */

const functions = require("firebase-functions");
const {
    requireBearer,
    actId,
    pixelId,
    graphPost,
    findAdSetByName,
    notifyBoth,
} = require("./metaApiCore");

exports.metaCreateAdSet = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }
    if (!requireBearer(req, res)) return;

    const {
        campaign_id,
        name,
        daily_budget_cents,
        optimization_goal = "LEAD_GENERATION",
        billing_event = "IMPRESSIONS",
        bid_strategy = "LOWEST_COST_WITHOUT_CAP",
        targeting,
        promoted_object,
        status = "PAUSED",
    } = req.body || {};

    if (!campaign_id || !name || !daily_budget_cents || !targeting) {
        return res.status(400).json({
            ok: false,
            error: "missing_required_fields",
            required: ["campaign_id", "name", "daily_budget_cents", "targeting"],
        });
    }

    // Idempotency check
    try {
        const existing = await findAdSetByName(campaign_id, name);
        if (existing) {
            await notifyBoth(`♻️ AdSet exists, skipping create — \`${name}\` (${existing.id})`).catch(() => {});
            return res.json({
                ok: true,
                adset_id: existing.id,
                existing: true,
                status: existing.status,
            });
        }
    } catch (e) {
        // Soft-fail: continue to create (worst case = duplicate; Meta will accept).
        functions.logger.warn("findAdSetByName failed", { err: e.message });
    }

    const finalPromoted = promoted_object || {
        pixel_id: pixelId(),
        custom_event_type: "LEAD",
    };

    const payload = {
        name,
        campaign_id,
        status,
        daily_budget: Number(daily_budget_cents),
        billing_event,
        optimization_goal,
        bid_strategy,
        targeting: typeof targeting === "string" ? targeting : JSON.stringify(targeting),
        promoted_object: typeof finalPromoted === "string" ? finalPromoted : JSON.stringify(finalPromoted),
    };

    const r = await graphPost(`/${actId()}/adsets`, payload);

    if (!r.ok) {
        await notifyBoth(`❌ AdSet create FAILED — \`${name}\` · ${r.error}`).catch(() => {});
        return res.status(502).json({
            ok: false,
            error: `meta_api_error:${r.error}`,
            raw: r.raw,
        });
    }

    const adsetId = r.data?.id;
    await notifyBoth(`✅ AdSet created — \`${name}\` · \`${adsetId}\` · status=${status} · $${(daily_budget_cents / 100).toFixed(2)}/day`).catch(() => {});

    return res.json({
        ok: true,
        adset_id: adsetId,
        status,
        existing: false,
    });
});
