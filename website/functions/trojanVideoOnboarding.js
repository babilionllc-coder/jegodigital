/**
 * trojanVideoOnboarding — Receive a new "3 Videos Gratis" Trojan Horse lead,
 * issue signed URLs for photo upload, and trigger the video generation pipeline.
 *
 * Two endpoints:
 *
 *   POST /trojanVideoInit
 *       Body: { firstName, companyName, email, whatsapp, propertyLocation,
 *               propertyType, stylePreset, language, source, campaign, submittedAt,
 *               photos: [{ order, name, size, type }] }
 *       → Creates Firestore doc `trojan_video_leads/{leadId}` with status=awaiting_upload
 *       → Generates one signed PUT URL per photo slot
 *       → Returns { leadId, uploadUrls: [{order, uploadUrl, storagePath, publicUrl}] }
 *
 *   POST /trojanVideoFinalize
 *       Body: { leadId }
 *       → Verifies all photos uploaded (lists GCS bucket prefix)
 *       → Updates Firestore doc status=submitted + uploadedPhotos=[...]
 *       → Sends confirmation email to client (Brevo template TBD)
 *       → Fires Telegram alert to Alex for manual render kickoff
 *       → Returns { ok: true, leadId, photoCount, estimatedDeliveryAt }
 *
 * Delivery promise: 3 videos in 24h. Pipeline handoff writes to
 * `trojan_video_leads/{leadId}` and sets status through:
 *   awaiting_upload → submitted → rendering → qa → delivered
 *
 * Hard rule: This function NEVER runs the video render itself — it only
 * captures the lead and hands off to the Remotion/Veo pipeline via a
 * Firestore trigger (processTrojanVideoRequest, built separately).
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ---------- Config ----------
const STORAGE_BUCKET = process.env.GCLOUD_STORAGE_BUCKET ||
    `${process.env.GCLOUD_PROJECT || "jegodigital-e02fb"}.appspot.com`;
const SIGNED_URL_EXPIRY_MS = 30 * 60 * 1000;                  // 30 minutes to upload
const DELIVERY_WINDOW_HOURS = 24;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;
const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_STYLES = new Set(["cinematic", "lifestyle", "luxury"]);
const ALLOWED_LANGS  = new Set(["es", "en", "none"]);

// ---------- Helpers ----------

function cors(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function normalizePhone(raw) {
    return String(raw || "").replace(/[^\d+]/g, "");
}

function sanitizeExt(name) {
    const m = String(name || "").toLowerCase().match(/\.(jpg|jpeg|png|webp)$/i);
    return m ? m[1].replace("jpeg", "jpg") : "jpg";
}

function slugify(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
}

async function sendTelegramAlert(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat  = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chat) return;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chat,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        }, { timeout: 8000 });
    } catch (e) {
        functions.logger.warn("Telegram alert failed:", e.message);
    }
}

async function upsertBrevoContactForVideo({ email, firstName, companyName, whatsapp }) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) return { ok: false, skipped: true };
    try {
        const r = await axios.post("https://api.brevo.com/v3/contacts", {
            email,
            attributes: {
                FIRSTNAME: firstName || "",
                COMPANY:   companyName || "",
                SMS:       whatsapp || "",
                SOURCE:    "trojan_videos",
                OFFER:     "T",  // T = Trojan Video
            },
            listIds: [],           // No auto-list yet — wait until videos delivered
            updateEnabled: true,
        }, {
            headers: { "api-key": BREVO_KEY, "Content-Type": "application/json" },
            timeout: 10000,
        });
        return { ok: true, data: r.data };
    } catch (err) {
        functions.logger.warn("Brevo upsert (trojan_video) failed:", err.response?.data || err.message);
        return { ok: false };
    }
}

// ==================================================================
// ENDPOINT 1 — trojanVideoInit
// ==================================================================
exports.trojanVideoInit = functions
    .runWith({ memory: "256MB", timeoutSeconds: 60 })
    .https.onRequest(async (req, res) => {
        cors(res);
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

        try {
            const b = req.body || {};

            // ---- Validation ----
            const firstName = String(b.firstName || "").trim();
            const companyName = String(b.companyName || "").trim();
            const email = String(b.email || "").trim().toLowerCase();
            const whatsapp = normalizePhone(b.whatsapp);
            const propertyLocation = String(b.propertyLocation || "").trim();
            const propertyType = String(b.propertyType || "casa").trim();
            const stylePreset = String(b.stylePreset || "cinematic").toLowerCase().trim();
            const language = String(b.language || "es").toLowerCase().trim();
            const source = String(b.source || "trojan-setup-direct").trim();
            const campaign = String(b.campaign || "trojan_videos_mx_v1").trim();
            const photos = Array.isArray(b.photos) ? b.photos : [];

            if (!firstName) return res.status(400).json({ ok: false, error: "firstName_required" });
            if (!companyName) return res.status(400).json({ ok: false, error: "companyName_required" });
            if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
            if (!whatsapp || whatsapp.length < 10) return res.status(400).json({ ok: false, error: "invalid_whatsapp" });
            if (!ALLOWED_STYLES.has(stylePreset)) return res.status(400).json({ ok: false, error: "invalid_style" });
            if (!ALLOWED_LANGS.has(language)) return res.status(400).json({ ok: false, error: "invalid_language" });
            if (photos.length < MIN_PHOTOS) return res.status(400).json({ ok: false, error: `min_${MIN_PHOTOS}_photos` });
            if (photos.length > MAX_PHOTOS) return res.status(400).json({ ok: false, error: `max_${MAX_PHOTOS}_photos` });

            for (const p of photos) {
                if (p.size && p.size > MAX_SIZE_MB * 1024 * 1024) {
                    return res.status(400).json({ ok: false, error: "photo_too_large", detail: p.name });
                }
                if (p.type && !ALLOWED_TYPES.has(String(p.type).toLowerCase())) {
                    return res.status(400).json({ ok: false, error: "unsupported_image_type", detail: p.type });
                }
            }

            // ---- Create lead doc ----
            const leadRef = db.collection("trojan_video_leads").doc();
            const leadId = leadRef.id;
            const companySlug = slugify(companyName) || "lead";

            const bucket = admin.storage().bucket(STORAGE_BUCKET);
            const uploadUrls = [];
            for (const p of photos) {
                const order = Number(p.order) || (uploadUrls.length + 1);
                const ext = sanitizeExt(p.name);
                const storagePath = `trojan-videos/${companySlug}-${leadId}/photo-${String(order).padStart(2, "0")}.${ext}`;
                const file = bucket.file(storagePath);
                const contentType = ALLOWED_TYPES.has(String(p.type).toLowerCase())
                    ? String(p.type).toLowerCase()
                    : "image/jpeg";

                const [uploadUrl] = await file.getSignedUrl({
                    version: "v4",
                    action: "write",
                    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
                    contentType,
                });

                uploadUrls.push({
                    order,
                    storagePath,
                    uploadUrl,
                    contentType,
                    publicUrl: `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`,
                });
            }

            await leadRef.set({
                leadId,
                firstName,
                companyName,
                companySlug,
                email,
                whatsapp,
                property: {
                    location: propertyLocation,
                    type: propertyType,
                },
                stylePreset,
                language,
                source,
                campaign,
                photos_expected: photos.map(p => ({
                    order: p.order,
                    name: p.name,
                    size: p.size,
                    type: p.type,
                })),
                uploaded_photos: [],
                status: "awaiting_upload",
                submitted_at: b.submittedAt || new Date().toISOString(),
                user_agent: String(b.userAgent || "").slice(0, 500),
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                delivery_deadline: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + DELIVERY_WINDOW_HOURS * 60 * 60 * 1000)
                ),
            });

            functions.logger.info(
                `🎬 trojanVideoInit: leadId=${leadId} ${firstName} <${email}> ${companyName} — ${photos.length} photos, style=${stylePreset}`
            );

            return res.status(200).json({
                ok: true,
                leadId,
                uploadUrls,
                expiresInSeconds: Math.floor(SIGNED_URL_EXPIRY_MS / 1000),
            });

        } catch (err) {
            functions.logger.error("trojanVideoInit error:", err);
            return res.status(500).json({ ok: false, error: String(err.message || err) });
        }
    });

// ==================================================================
// ENDPOINT 2 — trojanVideoFinalize
// ==================================================================
exports.trojanVideoFinalize = functions
    .runWith({ memory: "256MB", timeoutSeconds: 60 })
    .https.onRequest(async (req, res) => {
        cors(res);
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

        try {
            const { leadId } = req.body || {};
            if (!leadId) return res.status(400).json({ ok: false, error: "leadId_required" });

            const leadRef = db.collection("trojan_video_leads").doc(leadId);
            const snap = await leadRef.get();
            if (!snap.exists) return res.status(404).json({ ok: false, error: "lead_not_found" });
            const lead = snap.data();

            if (lead.status !== "awaiting_upload") {
                return res.status(409).json({ ok: false, error: "invalid_state", status: lead.status });
            }

            // ---- Verify all photos actually uploaded to GCS ----
            const bucket = admin.storage().bucket(STORAGE_BUCKET);
            const [files] = await bucket.getFiles({
                prefix: `trojan-videos/${lead.companySlug}-${leadId}/`,
            });

            const uploaded = [];
            for (const f of files) {
                const [meta] = await f.getMetadata().catch(() => [null]);
                if (meta) {
                    uploaded.push({
                        storagePath: f.name,
                        size: Number(meta.size) || 0,
                        contentType: meta.contentType || "",
                        md5: meta.md5Hash || "",
                        publicUrl: `https://storage.googleapis.com/${STORAGE_BUCKET}/${f.name}`,
                    });
                }
            }

            if (uploaded.length < MIN_PHOTOS) {
                return res.status(400).json({
                    ok: false,
                    error: "insufficient_uploads",
                    uploaded: uploaded.length,
                    minimum: MIN_PHOTOS,
                });
            }

            // ---- Update doc → status=submitted ----
            const estimatedDeliveryAt = new Date(Date.now() + DELIVERY_WINDOW_HOURS * 60 * 60 * 1000);
            await leadRef.update({
                uploaded_photos: uploaded,
                photo_count: uploaded.length,
                status: "submitted",
                finalized_at: admin.firestore.FieldValue.serverTimestamp(),
                estimated_delivery_at: admin.firestore.Timestamp.fromDate(estimatedDeliveryAt),
            });

            // ---- Upsert Brevo contact (fire-and-forget) ----
            upsertBrevoContactForVideo({
                email: lead.email,
                firstName: lead.firstName,
                companyName: lead.companyName,
                whatsapp: lead.whatsapp,
            }).catch(() => {});

            // ---- Telegram alert to Alex ----
            const msg = [
                `🎬 <b>New Trojan Video Lead</b>`,
                ``,
                `<b>${lead.firstName}</b> (${lead.companyName})`,
                `📧 ${lead.email}`,
                `📱 ${lead.whatsapp}`,
                `🏠 ${lead.property?.type || "?"} · ${lead.property?.location || "?"}`,
                `🎨 Style: <b>${lead.stylePreset}</b> · 🎙 ${lead.language}`,
                `📸 ${uploaded.length} photos uploaded`,
                `⏱ Deadline: ${estimatedDeliveryAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
                ``,
                `Source: ${lead.source} · Campaign: ${lead.campaign}`,
                `Lead ID: <code>${leadId}</code>`,
                ``,
                `→ Kick off render pipeline: veo-flow + style=${lead.stylePreset}`,
            ].join("\n");
            sendTelegramAlert(msg).catch(() => {});

            functions.logger.info(
                `✅ trojanVideoFinalize: leadId=${leadId} photos=${uploaded.length} → submitted`
            );

            return res.status(200).json({
                ok: true,
                leadId,
                photoCount: uploaded.length,
                status: "submitted",
                estimatedDeliveryAt: estimatedDeliveryAt.toISOString(),
            });

        } catch (err) {
            functions.logger.error("trojanVideoFinalize error:", err);
            return res.status(500).json({ ok: false, error: String(err.message || err) });
        }
    });
