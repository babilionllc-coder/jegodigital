/**
 * metaCreateAdImage.js — HTTPS-gated Cloud Function to upload an image to Meta
 * AdImages and return the image_hash.
 *
 * Built 2026-05-05.
 *
 * Auth: Bearer INTERNAL_API_TOKEN.
 *
 * POST body (one of):
 *   { png_url:  string }   → server fetches the URL, base64-uploads to Meta
 *   { png_path: string }   → server reads the local file (Cloud Function /tmp
 *                            or repo-local path), base64-uploads to Meta
 *   { png_b64:  string }   → caller supplies base64 (PNG bytes), server uploads
 *
 * Returns { ok, image_hash, existing? }.
 *
 * Idempotent: Meta hashes uploads by content — re-uploading the same bytes
 * returns the same image_hash, so this endpoint is naturally idempotent.
 */

const functions = require("firebase-functions");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const {
    requireBearer,
    actId,
    authToken,
    GRAPH_BASE,
    notifyBoth,
} = require("./metaApiCore");

exports.metaCreateAdImage = functions
    .runWith({ timeoutSeconds: 120, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (req.method !== "POST") {
            return res.status(405).json({ ok: false, error: "method_not_allowed" });
        }
        if (!requireBearer(req, res)) return;

        const { png_url, png_path, png_b64, filename } = req.body || {};
        if (!png_url && !png_path && !png_b64) {
            return res.status(400).json({
                ok: false,
                error: "one_of_png_url_png_path_png_b64_required",
            });
        }

        const token = authToken();
        if (!token) return res.status(503).json({ ok: false, error: "fb_token_missing" });

        // Resolve PNG bytes
        let bytes;
        let resolvedFilename = filename || "image.png";
        try {
            if (png_b64) {
                bytes = Buffer.from(png_b64, "base64");
            } else if (png_path) {
                const safePath = path.resolve(png_path);
                bytes = fs.readFileSync(safePath);
                resolvedFilename = filename || path.basename(safePath);
            } else if (png_url) {
                const r = await axios.get(png_url, { responseType: "arraybuffer", timeout: 30000 });
                bytes = Buffer.from(r.data);
                resolvedFilename = filename || (png_url.split("/").pop() || "image.png");
            }
        } catch (e) {
            return res.status(400).json({ ok: false, error: `read_failed:${e.message}` });
        }

        // POST as multipart/form-data
        const form = new FormData();
        form.append("filename", bytes, { filename: resolvedFilename });
        form.append("access_token", token);

        try {
            const r = await axios.post(
                `${GRAPH_BASE}/${actId()}/adimages`,
                form,
                {
                    headers: form.getHeaders(),
                    timeout: 60000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                }
            );
            const images = r.data?.images || {};
            const firstKey = Object.keys(images)[0];
            const hash = firstKey ? images[firstKey].hash : null;
            if (!hash) {
                await notifyBoth(`❌ AdImage upload returned no hash for \`${resolvedFilename}\``).catch(() => {});
                return res.status(502).json({ ok: false, error: "no_hash_returned", raw: r.data });
            }
            await notifyBoth(`📸 AdImage uploaded — \`${resolvedFilename}\` · hash=\`${hash}\``).catch(() => {});
            return res.json({ ok: true, image_hash: hash, filename: resolvedFilename });
        } catch (e) {
            const msg = e.response?.data?.error?.message || e.message;
            await notifyBoth(`❌ AdImage upload FAILED — \`${resolvedFilename}\` · ${msg}`).catch(() => {});
            return res.status(502).json({
                ok: false,
                error: `meta_api_error:${msg}`,
                raw: e.response?.data || null,
            });
        }
    });
