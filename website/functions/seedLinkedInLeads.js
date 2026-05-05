/**
 * seedLinkedInLeads + coldCallDiagnose — 2026-04-30
 *
 * seedLinkedInLeads (HTTPS POST):
 *   Loads the 79 unique-phone LinkedIn-sourced MX real-estate decision-makers
 *   from `_phone_leads_linkedin_2026-04-29.js` into Firestore `phone_leads`.
 *   Sets last_called_at=null so they're immediately eligible for the next
 *   coldCallPrep run (09:55 CDMX Mon-Fri). Idempotent — upserts by digits-only
 *   phone ID. Re-running just refreshes the seed timestamp.
 *
 *   Trigger:
 *     curl -X POST 'https://us-central1-jegodigital-e02fb.cloudfunctions.net/seedLinkedInLeads' \
 *       -H "X-Seed-Secret: $SEED_SECRET" \
 *       -H "Content-Type: application/json"
 *
 * coldCallDiagnose (HTTPS GET):
 *   Returns a snapshot of phone_leads pool health + today's queue + recent
 *   call_queue history. Used to diagnose 0-call days. Same auth as the
 *   seeder for safety.
 *
 *   Trigger:
 *     curl 'https://us-central1-jegodigital-e02fb.cloudfunctions.net/coldCallDiagnose?days=7' \
 *       -H "X-Seed-Secret: $SEED_SECRET"
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const LINKEDIN_LEADS = require("./_phone_leads_linkedin_2026-04-29");

const SEED_SECRET_FALLBACK = "jego-seed-2026-04-20-dial-ready";

function authOk(req) {
    const expected = process.env.SEED_SECRET || SEED_SECRET_FALLBACK;
    return (req.get("X-Seed-Secret") || "") === expected;
}

function cdmxDateKey(d = new Date()) {
    // CDMX is UTC-6 (no DST since 2022). Use offset for date math only.
    const cdmx = new Date(d.getTime() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

// =====================================================================
// seedLinkedInLeads — bulk upsert 79 LinkedIn leads into phone_leads
// =====================================================================
exports.seedLinkedInLeads = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        if (!authOk(req)) return res.status(401).json({ error: "bad secret" });

        const db = admin.firestore();

        // Pre-flight count of eligible leads (matches coldCallPrep query)
        let preCount = 0;
        try {
            const preSnap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .get();
            preCount = preSnap.size;
        } catch (err) {
            functions.logger.warn("seedLinkedInLeads: pre-count failed:", err.message);
        }

        let upserts = 0;
        let skippedNoEmail = 0;
        const errors = [];
        // HR-5 GUARD (added 2026-05-05 after coverage-gate disaster): refuse to write
        // any lead with empty email — these dropped pool email_pct from 62% → 35-53%
        // and silently blocked the cron for 7+ weekdays. Use ?allowEmptyEmail=true to override.
        const allowEmptyEmail = req.query.allowEmptyEmail === "true";
        // Firestore batch cap = 500. We have 79, single batch is fine.
        const batch = db.batch();
        for (const r of LINKEDIN_LEADS) {
            const docId = (r.phone || "").replace(/[^\d]/g, "");
            if (!docId) continue;
            const email = (r.email || "").trim();
            if (!email && !allowEmptyEmail) {
                skippedNoEmail++;
                continue;
            }
            const ref = db.collection("phone_leads").doc(docId);
            batch.set(ref, {
                phone: r.phone,
                first_name: r.first_name || "",
                last_name: r.last_name || "",
                name: r.name || `${r.first_name || ""} ${r.last_name || ""}`.trim() || "allá",
                email: email,
                company: r.company || "",
                company_name: r.company || "",
                website: "",
                city: r.city || "",
                position: r.position || "",
                google_rating: null,
                score: r.score || 0,
                linkedin_url: r.linkedin_url || "",
                phone_verified: true,
                do_not_call: false,
                last_called_at: null,           // RESET cooldown — these are the new dial list
                last_offer: null,
                last_conversation_id: null,
                source: r.source || "linkedin_2026-04-29",
                seeded_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            upserts++;
        }
        try {
            await batch.commit();
        } catch (err) {
            functions.logger.error("seedLinkedInLeads: batch.commit failed:", err.message);
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
            functions.logger.warn("seedLinkedInLeads: post-count failed:", err.message);
        }

        functions.logger.info(`seedLinkedInLeads: upserts=${upserts}, skippedNoEmail=${skippedNoEmail}, pre=${preCount}, post=${postCount}`);
        return res.status(200).json({
            ok: true,
            upserts,
            skipped_no_email: skippedNoEmail,
            pre_count: preCount,
            post_count: postCount,
            delta: postCount - preCount,
            source_file: "_phone_leads_linkedin_2026-04-29.js",
            note: skippedNoEmail > 0 ? `Refused ${skippedNoEmail} leads with empty email per HR-5 guard. Run lead-enrichment-waterfall first or use ?allowEmptyEmail=true to override.` : undefined,
            errors,
        });
    });

// =====================================================================
// coldCallDiagnose — pool health + recent queue history
// =====================================================================
exports.coldCallDiagnose = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        if (!authOk(req)) return res.status(401).json({ error: "bad secret" });

        const db = admin.firestore();
        const days = Math.min(parseInt(req.query.days || "7", 10), 30);
        const todayKey = cdmxDateKey();

        const out = {
            generated_at: new Date().toISOString(),
            today_cdmx: todayKey,
            phone_leads: {},
            queue_history: [],
            todays_queue: null,
            verdict: "",
        };

        // 1) phone_leads pool — eligible vs cooldown-blocked
        try {
            const snap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .get();
            const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            let eligible = 0, cooldown = 0, neverCalled = 0;
            const sources = {};
            snap.forEach((d) => {
                const data = d.data();
                const last = data.last_called_at?.toDate?.();
                if (!last) { eligible++; neverCalled++; }
                else if (last < cutoff) eligible++;
                else cooldown++;
                const src = data.source || "unknown";
                sources[src] = (sources[src] || 0) + 1;
            });
            out.phone_leads = {
                total: snap.size,
                eligible_to_call: eligible,
                cooldown_blocked: cooldown,
                never_called: neverCalled,
                by_source: sources,
            };
        } catch (err) {
            out.phone_leads = { error: err.message };
        }

        // 2) Today's call_queue
        try {
            const todaySnap = await db.collection("call_queue").doc(todayKey).collection("leads").get();
            const statusCounts = {};
            todaySnap.forEach((d) => {
                const s = d.data().status || "unknown";
                statusCounts[s] = (statusCounts[s] || 0) + 1;
            });
            out.todays_queue = {
                date: todayKey,
                total: todaySnap.size,
                by_status: statusCounts,
            };
        } catch (err) {
            out.todays_queue = { error: err.message };
        }

        // 3) Last N days of queue history
        try {
            for (let i = 0; i < days; i++) {
                const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
                const key = cdmxDateKey(d);
                const snap = await db.collection("call_queue").doc(key).collection("leads").get();
                const status = {};
                snap.forEach((doc) => {
                    const s = doc.data().status || "unknown";
                    status[s] = (status[s] || 0) + 1;
                });
                out.queue_history.push({ date: key, total: snap.size, by_status: status });
            }
        } catch (err) {
            out.queue_history.push({ error: err.message });
        }

        // 4) Verdict
        const elig = out.phone_leads.eligible_to_call || 0;
        const todayTotal = out.todays_queue?.total || 0;
        if (elig === 0 && todayTotal === 0) {
            out.verdict = "🚨 BLOCKED — phone_leads pool fully cooldown-blocked AND today's queue empty. coldCallPrep will produce 0 dials tomorrow unless fresh leads seeded.";
        } else if (elig > 0 && todayTotal === 0) {
            out.verdict = `⚠️  ${elig} leads eligible but today's queue is empty — coldCallPrep didn't run or failed silently. Tomorrow should fire (cron 09:55 CDMX Mon-Fri).`;
        } else if (todayTotal > 0) {
            out.verdict = `✅ Today's queue has ${todayTotal} leads. Pool has ${elig} eligible for tomorrow.`;
        } else {
            out.verdict = "Indeterminate — see raw counts.";
        }

        return res.status(200).json(out);
    });
