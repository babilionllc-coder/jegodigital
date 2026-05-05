/**
 * metaCreateAdRunner.js — HTTPS-gated Cloud Function to create a Meta Ad
 * (the leaf-level entity that links a Creative to an AdSet).
 *
 * Built 2026-05-05. Named "Runner" to avoid clashing with the existing
 * metaCreateAd.js module (the compliance-gated wrapper used by other agents).
 *
 * Auth: Bearer INTERNAL_API_TOKEN.
 *
 * POST body:
 *   {
 *     adset_id:    string  (required)
 *     creative_id: string  (required)
 *     name:        string  (required, unique inside the AdSet)
 *     status:      string  (default "PAUSED")
 *   }
 *
 * Idempotent: skips if an Ad with the same name already exists in the AdSet.
 *
 * Returns { ok, ad_id, existing? }.
 */

const functions = require("firebase-functions");
const {
    requireBearer,
    actId,
    graphPost,
    findAdByName,
    notifyBoth,
} = require("./metaApiCore");

exports.metaCreateAdRunner = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }
    if (!requireBearer(req, res)) return;

    const {
        adset_id,
        creative_id,
        name,
        status = "PAUSED",
    } = req.body || {};

    if (!adset_id || !creative_id || !name) {
        return res.status(400).json({
            ok: false,
            error: "missing_required_fields",
            required: ["adset_id", "creative_id", "name"],
        });
    }

    // Idempotency
    try {
        const existing = await findAdByName(adset_id, name);
        if (existing) {
            await notifyBoth(`♻️ Ad exists, skipping — \`${name}\` (${existing.id})`).catch(() => {});
            return res.json({ ok: true, ad_id: existing.id, existing: true, status: existing.status });
        }
    } catch (e) {
        functions.logger.warn("findAdByName failed", { err: e.message });
    }

    const payload = {
        name,
        adset_id,
        status,
        creative: JSON.stringify({ creative_id }),
    };

    const r = await graphPost(`/${actId()}/ads`, payload);
    if (!r.ok) {
        await notifyBoth(`❌ Ad FAILED — \`${name}\` · ${r.error}`).catch(() => {});
        return res.status(502).json({ ok: false, error: `meta_api_error:${r.error}`, raw: r.raw });
    }

    const adId = r.data?.id;
    await notifyBoth(`📌 Ad created — \`${name}\` · \`${adId}\` · status=${status}`).catch(() => {});
    return res.json({ ok: true, ad_id: adId, existing: false, status });
});
