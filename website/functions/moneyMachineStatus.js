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
        const db = getFirestore();
        const out = { ok: true, now_iso: new Date().toISOString(), errors: {} };
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

        // Each section in its own try so one failure doesn't blank everything.
        try {
            const byStatus = {};
            for (const s of STATUSES) {
                // eslint-disable-next-line no-await-in-loop
                const snap = await db.collection("opportunities")
                    .where("status", "==", s)
                    .count()
                    .get();
                byStatus[s] = snap.data().count;
            }
            out.by_status = byStatus;
        } catch (e) { out.errors.by_status = e.message; }

        try {
            const totalSnap = await db.collection("opportunities").count().get();
            out.total_opportunities = totalSnap.data().count;
        } catch (e) { out.errors.total_opportunities = e.message; }

        try {
            const runsSnap = await db.collection("money_machine_runs")
                .orderBy("at", "desc").limit(3).get();
            out.latest_runs = runsSnap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                at: d.data().at?.toDate?.().toISOString?.() || null,
            }));
        } catch (e) { out.errors.latest_runs = e.message; }

        try {
            const latestDrafts = [];
            for (const st of ["awaiting_approval", "awaiting_approval_telegram", "drafted", "drafted_unsafe"]) {
                // eslint-disable-next-line no-await-in-loop
                const snap = await db.collection("opportunities")
                    .where("status", "==", st).limit(3).get();
                snap.docs.forEach(d => latestDrafts.push({
                    id: d.id,
                    status: d.data().status,
                    score: d.data().score,
                    title: (d.data().title || "").slice(0, 120),
                    draft_text: (d.data().draft_text || "").slice(0, 300),
                }));
            }
            out.latest_drafts = latestDrafts;
        } catch (e) { out.errors.latest_drafts = e.message; }

        try {
            // Latest 6 qualified (highest-scoring) regardless of downstream state
            const topSnap = await db.collection("opportunities")
                .where("status", "in", ["qualified", "drafted", "awaiting_approval", "awaiting_approval_telegram", "drafter_failed"])
                .limit(10).get();
            out.top_scored = topSnap.docs.map(d => ({
                id: d.id,
                status: d.data().status,
                score: d.data().score,
                primaryService: d.data().primaryService,
                title: (d.data().title || "").slice(0, 120),
            }));
        } catch (e) { out.errors.top_scored = e.message; }

        try {
            const recentSnap = await db.collection("opportunities")
                .orderBy("scrapedAt", "desc").limit(8).get();
            out.recent_opportunities = recentSnap.docs.map(d => ({
                id: d.id,
                status: d.data().status,
                score: d.data().score,
                primaryService: d.data().primaryService,
                title: (d.data().title || "").slice(0, 100),
                keywordHits: (d.data().keywordHits || []).slice(0, 4),
                createdAt: d.data().createdAt?.toDate?.().toISOString?.() || null,
            }));
        } catch (e) { out.errors.recent_opportunities = e.message; }

        // The CRITICAL missing piece — inspect the opportunity_drafts collection
        // directly so we can see exactly why drafted opportunities didn't reach
        // Slack/Telegram. Drafter writes to `opportunity_drafts/{oppId}`, not
        // to the `opportunities` collection, so the draft_text + safety flags
        // are only visible here.
        // ?full=1 returns untruncated draft_text + permalink (for human
        // copy-paste flow) — added 2026-04-23 evening when Alex needed the
        // stranded `approved_needs_manual_post` drafts surfaced for phone
        // posting. Default response still truncates to 600 chars to keep
        // the status endpoint lightweight.
        const fullMode = String(req.query.full || "").trim() === "1";
        try {
            const draftsSnap = await db.collection("opportunity_drafts")
                .limit(15).get();
            // Fetch matching opportunities in batch to get permalinks.
            const oppIds = draftsSnap.docs.map(d => d.id);
            const permalinkMap = {};
            const subredditMap = {};
            if (fullMode && oppIds.length) {
                const oppDocs = await Promise.all(oppIds.map(id => db.collection("opportunities").doc(id).get()));
                oppDocs.forEach((od, i) => {
                    if (od.exists) {
                        const odata = od.data();
                        permalinkMap[oppIds[i]] = odata.permalink || null;
                        subredditMap[oppIds[i]] = odata.subreddit || null;
                    }
                });
            }
            out.opportunity_drafts = draftsSnap.docs.map(d => {
                const data = d.data();
                const rawText = data.draft_text || "";
                const entry = {
                    id: d.id,
                    status: data.status,
                    ready_for_approval: data.ready_for_approval,
                    post_safely_final: data.post_safely_final,
                    post_safely_model: data.post_safely_model,
                    word_count: data.word_count,
                    banned_phrases_found: data.banned_phrases_found || [],
                    reason_if_unsafe: data.reason_if_unsafe || null,
                    drafted_by_model: data.drafted_by_model,
                    drafter_error: data.drafter_error || null,
                    score: data.score,
                    primaryService: data.primaryService,
                    title: (data.title || "").slice(0, 120),
                    draft_text: fullMode ? rawText : rawText.slice(0, 600),
                    draft_ready_at: data.draft_ready_at?.toDate?.().toISOString?.() || null,
                };
                if (fullMode) {
                    entry.permalink = permalinkMap[d.id] || null;
                    entry.subreddit = subredditMap[d.id] || null;
                }
                return entry;
            });
            out.drafts_count = draftsSnap.size;
        } catch (e) { out.errors.opportunity_drafts = e.message; }

        if (Object.keys(out.errors).length === 0) delete out.errors;
        res.json(out);
    });
