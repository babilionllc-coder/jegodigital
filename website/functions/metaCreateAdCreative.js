/**
 * metaCreateAdCreative.js — HTTPS-gated Cloud Function to create a Meta
 * AdCreative (the asset+copy bundle that Ads reference).
 *
 * Built 2026-05-05.
 *
 * Auth: Bearer INTERNAL_API_TOKEN.
 *
 * POST body:
 *   {
 *     name:         string  (required, must be unique inside the ad account)
 *     image_hash?:  string  (provide for image creatives)
 *     video_id?:    string  (provide for video creatives — mutually exclusive)
 *     thumbnail_url?: string (recommended for video creatives)
 *     page_id?:     string  (defaults to FB_PAGE_ID env)
 *     headline:     string  (the bold "name" line in object_story_spec)
 *     body:         string  (the message)
 *     link_url:     string  (CTA destination)
 *     cta_type?:    string  (defaults to "LEARN_MORE")
 *   }
 *
 * Idempotent: looks up an existing creative with the same `name` in the ad
 * account first. If found, returns its ID with `existing: true`.
 *
 * Returns { ok, creative_id, existing? }.
 */

const functions = require("firebase-functions");
const {
    requireBearer,
    actId,
    pageId,
    graphPost,
    findAdCreativeByName,
    notifyBoth,
} = require("./metaApiCore");

exports.metaCreateAdCreative = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }
    if (!requireBearer(req, res)) return;

    const {
        name,
        image_hash,
        video_id,
        thumbnail_url,
        page_id: pageOverride,
        headline,
        body,
        link_url,
        cta_type = "LEARN_MORE",
    } = req.body || {};

    if (!name || !body || !link_url) {
        return res.status(400).json({
            ok: false,
            error: "missing_required_fields",
            required: ["name", "body", "link_url", "image_hash OR video_id"],
        });
    }
    if (!image_hash && !video_id) {
        return res.status(400).json({ ok: false, error: "image_hash_or_video_id_required" });
    }

    // Idempotency
    try {
        const existing = await findAdCreativeByName(name);
        if (existing) {
            await notifyBoth(`♻️ AdCreative exists, skipping — \`${name}\` (${existing.id})`).catch(() => {});
            return res.json({ ok: true, creative_id: existing.id, existing: true });
        }
    } catch (e) {
        functions.logger.warn("findAdCreativeByName failed", { err: e.message });
    }

    const fbPage = pageOverride || pageId();
    const callToAction = {
        type: cta_type,
        value: { link: link_url },
    };

    let object_story_spec;
    if (video_id) {
        object_story_spec = {
            page_id: fbPage,
            video_data: {
                video_id,
                title: headline || name,
                message: body,
                call_to_action: callToAction,
                ...(thumbnail_url ? { image_url: thumbnail_url } : {}),
                link_description: link_url,
            },
        };
    } else {
        object_story_spec = {
            page_id: fbPage,
            link_data: {
                image_hash,
                link: link_url,
                message: body,
                name: headline || undefined,
                call_to_action: callToAction,
            },
        };
    }

    const payload = {
        name,
        object_story_spec: JSON.stringify(object_story_spec),
    };

    const r = await graphPost(`/${actId()}/adcreatives`, payload);
    if (!r.ok) {
        await notifyBoth(`❌ AdCreative FAILED — \`${name}\` · ${r.error}`).catch(() => {});
        return res.status(502).json({ ok: false, error: `meta_api_error:${r.error}`, raw: r.raw });
    }

    const creativeId = r.data?.id;
    await notifyBoth(`🎨 AdCreative created — \`${name}\` · \`${creativeId}\``).catch(() => {});
    return res.json({ ok: true, creative_id: creativeId, existing: false });
});
