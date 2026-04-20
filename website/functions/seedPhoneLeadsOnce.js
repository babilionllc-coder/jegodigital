/**
 * seedPhoneLeadsOnce — one-shot Firestore seeder for phone_leads.
 *
 * Ships the DIAL_READY 2026-04-19 dial list (57 leads) into the
 * `phone_leads` collection so `coldCallPrep` (09:55 CDMX Mon-Fri)
 * has something to queue.
 *
 * Protected by a shared-secret header so it can't be triggered by
 * anyone who stumbles onto the URL.
 *
 * Trigger (once, after deploy):
 *   curl -X POST 'https://us-central1-jegodigital-e02fb.cloudfunctions.net/seedPhoneLeadsOnce' \
 *     -H "X-Seed-Secret: $SEED_SECRET" \
 *     -H "Content-Type: application/json"
 *
 * Safe to re-run — upserts by digits-only phone ID.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const LEADS = require("./_phone_leads_seed_data");

// Fallback hard-coded in case the env secret isn't configured — rotate
// this string + the GH Actions secret after Alex fires it once.
const SEED_SECRET_FALLBACK = "jego-seed-2026-04-20-dial-ready";

exports.seedPhoneLeadsOnce = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

        const expected = process.env.SEED_SECRET || SEED_SECRET_FALLBACK;
        if ((req.get("X-Seed-Secret") || "") !== expected) {
            return res.status(401).json({ error: "bad secret" });
        }

        const db = admin.firestore();

        // Pre-flight count
        let preCount = 0;
        try {
            const preSnap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .get();
            preCount = preSnap.size;
        } catch (err) {
            functions.logger.warn("seedPhoneLeadsOnce: pre-count failed:", err.message);
        }

        let upserts = 0;
        const errors = [];
        // Firestore batch cap = 500. We have ~60, so single batch is fine.
        const batch = db.batch();
        for (const r of LEADS) {
            const docId = (r.phone || "").replace(/[^\d]/g, "");
            if (!docId) continue;
            const ref = db.collection("phone_leads").doc(docId);
            batch.set(ref, {
                phone: r.phone,
                first_name: r.first_name || "",
                last_name: r.last_name || "",
                name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "allá",
                email: r.email || "",
                company: r.company || "",
                company_name: r.company || "",
                website: r.website || "",
                city: r.city || "",
                position: r.position || "",
                google_rating: r.google_rating ? Number(r.google_rating) : null,
                score: r.score || 0,
                phone_verified: true,
                do_not_call: false,
                last_called_at: null,
                last_offer: null,
                last_conversation_id: null,
                source: "dial_ready_2026-04-19",
                seeded_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            upserts++;
        }
        try {
            await batch.commit();
        } catch (err) {
            functions.logger.error("seedPhoneLeadsOnce: batch.commit failed:", err.message);
            return res.status(500).json({ error: err.message, upserts: 0 });
        }

        // Post-flight count
        let postCount = 0;
        try {
            const postSnap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .get();
            postCount = postSnap.size;
        } catch (err) {
            functions.logger.warn("seedPhoneLeadsOnce: post-count failed:", err.message);
        }

        functions.logger.info(`seedPhoneLeadsOnce: upserts=${upserts}, pre=${preCount}, post=${postCount}`);
        return res.status(200).json({
            ok: true,
            upserts,
            pre_count: preCount,
            post_count: postCount,
            delta: postCount - preCount,
            errors,
        });
    });
