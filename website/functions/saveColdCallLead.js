/**
 * saveColdCallLead — capture leads from ElevenLabs cold-call agents into Brevo + nurture queue.
 *
 * Endpoint: POST https://us-central1-jegodigital-e02fb.cloudfunctions.net/saveColdCallLead
 *
 * Called by:
 *   - Offer A (agent_6601kp758ca4fcx8aynsvc0qyy5k) — SEO pitch → list 35 + templates 53-57
 *   - Offer C (agent_2801kpcxmxyvf36bb2c970bhvfk4) — Free Setup → list 36 + templates 58-62
 *   (Offer B uses the separate submitAuditRequest → audit pipeline.)
 *
 * Request body:
 *   {
 *     firstName: string,     // required
 *     email:     string,     // required
 *     offer:     "A" | "C",  // required
 *     phone:     string,     // optional
 *     company:   string,     // optional (falls back to website host)
 *     website:   string,     // optional
 *     source:    string,     // optional (defaults "cold_call")
 *     conversation_id: string // optional — ElevenLabs call reference
 *   }
 *
 * Response: { ok: true, list_id, nurture_steps_queued, lead_id }
 *
 * Rule: Templates, delays, and list IDs are the ONLY nurture truth — never duplicate elsewhere.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ---------- Brevo config ----------
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com";

// ---------- Offer routing ----------
// Each offer → { listId, nurture: [{ template_id, delayDays, tag }] }
const OFFER_CONFIG = {
    A: {
        name: "SEO Pitch",
        listId: 35,
        nurture: [
            { template_id: 53, delayDays: 0,  tag: "cold-call-a-d0"  }, // Confirmation (immediate)
            { template_id: 54, delayDays: 1,  tag: "cold-call-a-d1"  }, // Pregunta honesta
            { template_id: 55, delayDays: 3,  tag: "cold-call-a-d3"  }, // Playbook 3 pasos
            { template_id: 56, delayDays: 5,  tag: "cold-call-a-d5"  }, // ChatGPT AEO
            { template_id: 57, delayDays: 7,  tag: "cold-call-a-d7"  }, // Breakup
        ],
    },
    C: {
        name: "Free Setup (Trojan Horse)",
        listId: 36,
        nurture: [
            { template_id: 58, delayDays: 0,  tag: "cold-call-c-d0"  }, // Instalación confirmada (immediate)
            { template_id: 59, delayDays: 1,  tag: "cold-call-c-d1"  }, // 3 escenarios
            { template_id: 60, delayDays: 3,  tag: "cold-call-c-d3"  }, // T-24h prep
            { template_id: 61, delayDays: 5,  tag: "cold-call-c-d5"  }, // T+2d Sofia en vivo
            { template_id: 62, delayDays: 10, tag: "cold-call-c-d10" }, // T+10d primer reporte
        ],
    },
};

// ---------- Helpers ----------

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    // simple but strict-enough pattern
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function firstNameOf(nameOrFirst) {
    if (!nameOrFirst) return "Hola";
    return String(nameOrFirst).split(" ")[0] || "Hola";
}

function websiteHostOf(website) {
    if (!website) return "";
    return String(website).replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

async function upsertBrevoContact({ email, firstName, lastName, company, phone, listId, attributes = {} }) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) return { ok: false, skipped: true, reason: "no BREVO_API_KEY" };

    const body = {
        email,
        attributes: {
            FIRSTNAME: firstName || "",
            LASTNAME:  lastName  || "",
            COMPANY:   company   || "",
            SMS:       phone     || "",
            ...attributes,
        },
        listIds: [listId],
        updateEnabled: true,
    };

    try {
        const r = await axios.post("https://api.brevo.com/v3/contacts", body, {
            headers: {
                "api-key": BREVO_KEY,
                "Content-Type": "application/json",
                accept: "application/json",
            },
            timeout: 10000,
        });
        return { ok: true, data: r.data };
    } catch (err) {
        functions.logger.error("Brevo contact upsert failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Main handler ----------

exports.saveColdCallLead = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");

    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    try {
        const body = req.body || {};
        const firstName = String(body.firstName || "").trim();
        const email     = normalizeEmail(body.email);
        const phone     = String(body.phone || "").trim();
        const company   = String(body.company || "").trim();
        const website   = String(body.website || "").trim();
        const offer     = String(body.offer || "").toUpperCase().trim();
        const source    = String(body.source || "cold_call").trim();
        const convId    = String(body.conversation_id || "").trim();

        // ---------- Validation ----------
        if (!firstName) return res.status(400).json({ ok: false, error: "firstName_required" });
        if (!email || !isValidEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
        if (!OFFER_CONFIG[offer]) {
            return res.status(400).json({ ok: false, error: "invalid_offer", valid: Object.keys(OFFER_CONFIG) });
        }

        const cfg = OFFER_CONFIG[offer];
        const host = websiteHostOf(website);
        const companyResolved = company || host || "tu inmobiliaria";

        functions.logger.info(
            `📞 saveColdCallLead: ${firstName} <${email}> offer=${offer} (${cfg.name}) company=${companyResolved}`
        );

        // ---------- 1. Upsert Brevo contact ----------
        const brevoResult = await upsertBrevoContact({
            email,
            firstName,
            lastName: "",
            company: companyResolved,
            phone,
            listId: cfg.listId,
            attributes: {
                WEBSITE:   host || website || "",
                SOURCE:    source,
                OFFER:     offer,
                CALL_DATE: new Date().toISOString().slice(0, 10),
            },
        });

        if (!brevoResult.ok && !brevoResult.skipped) {
            functions.logger.warn("Brevo upsert failed but continuing to queue nurture:", brevoResult.error);
        }

        // ---------- 2. Queue nurture sequence in Firestore ----------
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const queued = [];

        for (const step of cfg.nurture) {
            const sendAt = admin.firestore.Timestamp.fromDate(
                new Date(now + step.delayDays * DAY_MS)
            );
            const ref = await db.collection("scheduled_emails").add({
                to_email: email,
                to_name:  firstName,
                template_id: step.template_id,
                tag: step.tag,
                campaign: `cold-call-${offer.toLowerCase()}-nurture`,
                send_at: sendAt,
                status: "pending",
                params: {
                    FIRSTNAME: firstName,
                    COMPANY:   companyResolved,
                    WEBSITE:   host || website || "",
                },
                source: source,
                offer: offer,
                conversation_id: convId,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            queued.push({ id: ref.id, template_id: step.template_id, delay_days: step.delayDays });
        }

        // ---------- 3. Log lead to Firestore for analytics/audit ----------
        const leadRef = await db.collection("cold_call_leads").add({
            firstName,
            email,
            phone,
            company: companyResolved,
            website: host || website || "",
            offer,
            offer_name: cfg.name,
            list_id: cfg.listId,
            source,
            conversation_id: convId,
            brevo_upsert_ok: !!brevoResult.ok,
            nurture_steps_queued: queued.length,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        functions.logger.info(
            `✅ Cold-call lead saved: ${email} → list ${cfg.listId} + ${queued.length} nurture steps queued`
        );

        return res.status(200).json({
            ok: true,
            lead_id: leadRef.id,
            offer,
            offer_name: cfg.name,
            list_id: cfg.listId,
            brevo_upsert_ok: !!brevoResult.ok,
            nurture_steps_queued: queued.length,
            queued,
        });
    } catch (err) {
        functions.logger.error("saveColdCallLead error:", err);
        return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
});
