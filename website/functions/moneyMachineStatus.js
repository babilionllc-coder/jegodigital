/**
 * moneyMachineStatus — single read-only HTTPS endpoint that returns the
 * current state of the Reddit opportunity pipeline so we can diagnose cascade
 * failures without direct Firestore access.
 *
 * Response shape:
 * {
 *   ok: true,
 *   by_status: { pending_classification: N, qualified: N, filtered_out: N, ... },
 *   total_opportunities: N,
 *   latest_run: { module, new_written, keyword_matches, ... } | null,
 *   latest_drafts: [ { id, status, oppId, ... } ],
 *   now_iso: "..."
 * }
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const { getFirestore } = require("firebase-admin/firestore");

exports.moneyMachineStatus = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const db = getFirestore();
            const STATUSES = [
                "pending_classification",
                "classifying",
                "qualified",
                "filtered_out",
                "classifier_failed",
                "drafter_failed",
                "drafted",
                "drafted_unsafe",
                "awaiting_approval",
                "awaiting_approval_telegram",
                "approved",
                "rejected",
            ];

            const byStatus = {};
            for (const s of STATUSES) {
                // eslint-disable-next-line no-await-in-loop
                const snap = await db.collection("opportunities")
                    .where("status", "==", s)
                    .count()
                    .get();
                byStatus[s] = snap.data().count;
            }

            const totalSnap = await db.collection("opportunities").count().get();
            const totalOpps = totalSnap.data().count;

            // Latest money_machine_runs entry
            const runsSnap = await db.collection("money_machine_runs")
                .orderBy("at", "desc")
                .limit(3)
                .get();
            const latestRuns = runsSnap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                at: d.data().at?.toDate?.().toISOString?.() || null,
            }));

            // Latest drafts (top-scoring pending approval)
            const draftsSnap = await db.collection("opportunities")
                .where("status", "in", ["awaiting_approval", "awaiting_approval_telegram", "drafted"])
                .orderBy("draft_ready_at", "desc")
                .limit(5)
                .get();
            const latestDrafts = draftsSnap.docs.map(d => ({
                id: d.id,
                status: d.data().status,
                score: d.data().score,
                title: (d.data().title || "").slice(0, 120),
                draft_text: (d.data().draft_text || "").slice(0, 300),
            }));

            // Recent opportunities (top 3 newest)
            const recentSnap = await db.collection("opportunities")
                .orderBy("createdAt", "desc")
                .limit(3)
                .get();
            const recentOpps = recentSnap.docs.map(d => ({
                id: d.id,
                status: d.data().status,
                score: d.data().score,
                primaryService: d.data().primaryService,
                title: (d.data().title || "").slice(0, 100),
                keywordHits: (d.data().keywordHits || []).slice(0, 4),
            }));

            res.json({
                ok: true,
                by_status: byStatus,
                total_opportunities: totalOpps,
                latest_runs: latestRuns,
                latest_drafts: latestDrafts,
                recent_opportunities: recentOpps,
                now_iso: new Date().toISOString(),
            });
        } catch (err) {
            functions.logger.error("[moneyMachineStatus] crash:", err);
            res.status(500).json({ ok: false, error: err.message, stack: err.stack });
        }
    });
