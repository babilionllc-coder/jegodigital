/**
 * coldCallAutopilot — daily 50-call routine, no human gate.
 *
 * Five crons, one module:
 *   09:55 Mon-Fri  coldCallPrep           — queue 50 phone-ready leads with A/B/C offer rotation (includes 24h failed-call retry)
 *   10:00 Mon-Fri  coldCallRun            — fire Sofia calls against today's queue
 *   10:15 Mon-Fri  coldCallMidBatchCheck  — Telegram alert if failed > 15/50 during run
 *   13:00 Mon-Fri  coldCallReport         — summarize outcomes, auto-fire audits for positives
 *   16:00 Mon-Fri  coldCallRunAfternoon   — retry morning no-answers (max 25 leads)
 *
 * Design rule (per Alex 2026-04-20): NO approve-before-fire gate. Cron
 * fires, everything logs richly, dailyDigest + systemHealthAudit surface
 * anomalies after the fact. Failures are recoverable.
 *
 * Firestore shape:
 *   phone_leads/{leadId}            — master phone list (manually curated or lead-finder-v4 output)
 *   call_queue/{date}/leads/{leadId} — today's dial list
 *   call_queue_summaries/{date}     — prep + run snapshots
 *   call_analysis/{conversationId}  — per-call outcome (written by elevenLabsWebhook)
 *   audit_requests/{id}             — audit queue (coldCallReport writes here for positives)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// ---- Telegram (shared pattern) ----
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (r.data?.ok) return { ok: true };
        const r2 = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text,
        }, { timeout: 10000 });
        return { ok: !!r2.data?.ok };
    } catch (err) {
        functions.logger.error("coldCallAutopilot Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- Config ----
const EL_API_KEY_FALLBACK = "335ed6b73e0b9281175a6b360eab9cbc0765bae4d55a9d8b95010d8642b8d673";
const MX_PHONE_ID = "phnum_8801kp77en3ee56t0t291zyv40ne"; // +52 998 387 1618 (Sofia MX)
const BATCH_SIZE = 50;
const AFTERNOON_BATCH_SIZE = 25;      // retry batch at 16:00 — smaller, afternoon hours
const FIRE_INTERVAL_MS = 12000;       // 12s between API fires — respects ElevenLabs + Twilio concurrency
const MID_BATCH_FAIL_THRESHOLD = 15;  // >15/50 failures at 10:15 → Telegram alarm

// Offer rotation agents (created 2026-04-16, see CLAUDE.md §AI Cold Calling)
const OFFERS = {
    A: { agent_id: "agent_6601kp758ca4fcx8aynsvc0qyy5k", label: "SEO Pitch" },
    B: { agent_id: "agent_7001kpcxketqewvt87k4mg6vp569", label: "Free Audit" },
    C: { agent_id: "agent_2801kpcxmxyvf36bb2c970bhvfk4", label: "Free Setup (Trojan)" },
};
const OFFER_ROTATION = ["A", "B", "C"]; // round-robin

// ---- Date helpers ----
function cdmxTodayKey() {
    const now = new Date();
    const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}
function cdmxTodayMidnightUtc() {
    const now = new Date();
    const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    return new Date(Date.UTC(cdmx.getUTCFullYear(), cdmx.getUTCMonth(), cdmx.getUTCDate()) + 6 * 60 * 60 * 1000);
}

// =====================================================================
// 1) coldCallPrep — 09:55 Mon-Fri CDMX
// =====================================================================
exports.coldCallPrep = functions
    .runWith({ timeoutSeconds: 120, memory: "512MB" })
    .pubsub.schedule("55 9 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const dateKey = cdmxTodayKey();

        functions.logger.info(`coldCallPrep ${dateKey}: starting`);

        // Source: phone_leads where phone_verified=true AND (never_called OR last_called_at > 14d ago)
        const fourteenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        );
        let leadsSnap;
        try {
            leadsSnap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .limit(500)
                .get();
        } catch (err) {
            functions.logger.error("coldCallPrep: phone_leads query failed:", err.message);
            await sendTelegram(`⚠️ *coldCallPrep ${dateKey}* — phone_leads query failed: ${err.message}`);
            return null;
        }

        // Filter + rank in memory so we can skip the composite index
        const candidates = [];
        leadsSnap.forEach((doc) => {
            const d = doc.data();
            const lastCalled = d.last_called_at?.toDate?.() || null;
            const okFreshness = !lastCalled || lastCalled < fourteenDaysAgo.toDate();
            if (okFreshness && d.phone) {
                candidates.push({
                    id: doc.id,
                    phone: d.phone,
                    name: d.name || d.first_name || "allá",
                    company: d.company || d.company_name || "",
                    website: d.website || "",
                    city: d.city || d.ciudad || "",
                    email: d.email || "",
                    last_called_at: lastCalled,
                });
            }
        });

        // Oldest-first so cold leads get touched before recent re-dials
        candidates.sort((a, b) => {
            const aT = a.last_called_at?.getTime() || 0;
            const bT = b.last_called_at?.getTime() || 0;
            return aT - bT;
        });

        // 24h retry — surface yesterday's failed/no-answer leads to top of today's queue (max 1 retry).
        // Prevents leads that missed a single connection from waiting 14 days for the next touch.
        try {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000);
            const yesterdayKey = yesterday.toISOString().slice(0, 10);
            const failSnap = await db.collection("call_queue").doc(yesterdayKey).collection("leads")
                .where("status", "in", ["failed", "no_answer"]).limit(20).get();
            let retrySurfaced = 0;
            failSnap.forEach((doc) => {
                const d = doc.data();
                if ((d.retry_count || 0) >= 1) return; // only one retry per lead
                if (!d.phone) return;
                // Drop dup + prepend
                const existsIdx = candidates.findIndex((c) => c.id === doc.id);
                if (existsIdx >= 0) candidates.splice(existsIdx, 1);
                candidates.unshift({
                    id: doc.id, phone: d.phone, name: d.name || "allá",
                    company: d.company || "", website: d.website || "", email: d.email || "",
                    last_called_at: d.last_called_at?.toDate?.() || null,
                    is_retry: true, retry_count: (d.retry_count || 0) + 1,
                });
                retrySurfaced++;
            });
            if (retrySurfaced > 0) {
                functions.logger.info(`coldCallPrep ${dateKey}: surfaced ${retrySurfaced} 24h-retry leads`);
            }
        } catch (retryErr) {
            functions.logger.warn(`coldCallPrep: 24h retry pull failed: ${retryErr.message}`);
        }

        let batch = candidates.slice(0, BATCH_SIZE);

        // SELF-HEAL: phone_leads collection is empty → auto-fire seed once.
        // Prevents the "today's 10 AM dialed zero leads because seed never ran"
        // failure mode that happened 2026-04-20.
        if (batch.length === 0 && leadsSnap.size === 0) {
            functions.logger.warn("coldCallPrep: phone_leads empty, attempting auto-seed");
            const seedSecret = process.env.SEED_SECRET;
            if (seedSecret) {
                try {
                    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "jegodigital-e02fb";
                    const seedUrl = `https://us-central1-${projectId}.cloudfunctions.net/seedPhoneLeadsOnce`;
                    const axios = require("axios");
                    const r = await axios.post(seedUrl, {}, {
                        headers: { "X-Seed-Secret": seedSecret, "Content-Type": "application/json" },
                        timeout: 30000,
                    });
                    const { upserts = 0, post_count = 0 } = r.data || {};
                    functions.logger.info(`coldCallPrep: auto-seed succeeded — ${upserts} upserts, ${post_count} total`);
                    await sendTelegram(`🌱 *coldCallPrep ${dateKey}* — auto-seed fired (${upserts} leads). Re-running prep...`);
                    // Re-query now that seed ran
                    const reSnap = await db.collection("phone_leads")
                        .where("phone_verified", "==", true)
                        .where("do_not_call", "==", false)
                        .limit(500)
                        .get();
                    const reCandidates = [];
                    reSnap.forEach((doc) => {
                        const d = doc.data();
                        const lastCalled = d.last_called_at?.toDate?.() || null;
                        const okFreshness = !lastCalled || lastCalled < fourteenDaysAgo.toDate();
                        if (okFreshness && d.phone) {
                            reCandidates.push({
                                id: doc.id, phone: d.phone,
                                name: d.name || d.first_name || "allá",
                                company: d.company || d.company_name || "",
                                website: d.website || "", email: d.email || "",
                                last_called_at: lastCalled,
                            });
                        }
                    });
                    reCandidates.sort((a, b) => (a.last_called_at?.getTime() || 0) - (b.last_called_at?.getTime() || 0));
                    batch = reCandidates.slice(0, BATCH_SIZE);
                } catch (seedErr) {
                    functions.logger.error("coldCallPrep: auto-seed failed:", seedErr.message);
                    await sendTelegram(`⚠️ *coldCallPrep ${dateKey}* — phone_leads empty AND auto-seed failed: ${seedErr.message}`);
                    return null;
                }
            } else {
                functions.logger.warn("coldCallPrep: SEED_SECRET missing, cannot self-heal");
            }
        }

        if (batch.length === 0) {
            await sendTelegram(`📞 *coldCallPrep ${dateKey}* — no phone_leads ready to dial. Queue empty.`);
            return null;
        }

        // Uniform-random offer assignment (per Alex 2026-04-20 — was round-robin).
        // Random mix lets us read A/B/C performance without positional bias
        // in the queue order; autopilotReviewer picks the winner weekly.
        const offerCounts = { A: 0, B: 0, C: 0 };
        const writePromises = batch.map((lead) => {
            const offer = OFFER_ROTATION[Math.floor(Math.random() * OFFER_ROTATION.length)];
            offerCounts[offer]++;
            return db.collection("call_queue").doc(dateKey).collection("leads").doc(lead.id).set({
                ...lead,
                offer,
                agent_id: OFFERS[offer].agent_id,
                status: "queued",
                queued_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        await Promise.all(writePromises);

        await db.collection("call_queue_summaries").doc(dateKey).set({
            date: dateKey,
            prep_at: admin.firestore.FieldValue.serverTimestamp(),
            total: batch.length,
            offer_counts: offerCounts,
            source_pool: candidates.length,
        }, { merge: true });

        const msg = [
            `📞 *coldCallPrep ${dateKey}* — ${batch.length} leads queued for 10:00 CDMX`,
            `   Pool of ${candidates.length} eligible · dialing oldest-first`,
            `   Offer A (${OFFERS.A.label}): ${offerCounts.A}`,
            `   Offer B (${OFFERS.B.label}): ${offerCounts.B}`,
            `   Offer C (${OFFERS.C.label}): ${offerCounts.C}`,
        ].join("\n");
        await sendTelegram(msg);
        functions.logger.info(`coldCallPrep ${dateKey}: queued ${batch.length}`);
        return null;
    });

// =====================================================================
// 2) coldCallRun — 10:00 Mon-Fri CDMX
// =====================================================================
exports.coldCallRun = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" }) // max 9min — we throttle calls within
    .pubsub.schedule("0 10 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const dateKey = cdmxTodayKey();
        const EL_KEY = process.env.ELEVENLABS_API_KEY || EL_API_KEY_FALLBACK;

        functions.logger.info(`coldCallRun ${dateKey}: starting`);

        const queueSnap = await db.collection("call_queue").doc(dateKey).collection("leads")
            .where("status", "==", "queued")
            .limit(BATCH_SIZE)
            .get();

        if (queueSnap.empty) {
            await sendTelegram(`📞 *coldCallRun ${dateKey}* — queue empty, nothing to dial.`);
            return null;
        }

        let fired = 0, failed = 0;
        const failures = [];

        for (const doc of queueSnap.docs) {
            const lead = doc.data();
            try {
                const phoneToCall = lead.phone.startsWith("+") ? lead.phone : `+52${lead.phone}`;
                const firstMessage = `Hola ${lead.name || ""}, soy Sofia de JegoDigital. ¿Tienes un momento?`;

                const elRes = await axios.post(
                    "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
                    {
                        agent_id: lead.agent_id,
                        to_number: phoneToCall,
                        agent_phone_number_id: MX_PHONE_ID,
                        conversation_initiation_client_data: {
                            // CRITICAL: dynamic_variables must be nested here, NOT at top level.
                            // ElevenLabs rejects top-level dynamic_variables with
                            // "Missing required dynamic variables in first message" — see
                            // conv_2901kpq1zmk9fy18ncpmck5nd4a0 success vs conv_0101kpq1n5t9e7092h83jhqy8q1d fail.
                            // Variable names MUST match {{placeholders}} in agent prompts:
                            // {{lead_name}}, {{company_name}}, {{website_url}}, {{city}}, {{lead_email}}
                            dynamic_variables: {
                                lead_name: lead.name || "allá",
                                company_name: lead.company || "tu inmobiliaria",
                                website_url: lead.website || "tu sitio web",
                                city: lead.city || "tu ciudad",
                                lead_email: lead.email || "",
                                offer: lead.offer,
                            },
                            conversation_config_override: {
                                agent: { language: "es", first_message: firstMessage },
                                conversation: {
                                    max_duration_seconds: 300, // 5 min hard cap
                                    client_inactivity_timeout_seconds: 30,
                                },
                            },
                        },
                    },
                    {
                        headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
                        timeout: 20000,
                    }
                );

                const conversationId = elRes.data?.conversation_id;
                // CallSid is critical for twilioCallStatusCallback to look up
                // and force-close zombie ElevenLabs sessions. See COLDCALL.md §10.
                const callSid = elRes.data?.callSid || elRes.data?.call_sid || null;
                await doc.ref.update({
                    status: "dialed",
                    dialed_at: admin.firestore.FieldValue.serverTimestamp(),
                    conversation_id: conversationId || null,
                    callSid: callSid,
                });
                // Seed call_analysis so coldCallReport can reconcile even if webhook is slow
                if (conversationId) {
                    await db.collection("call_analysis").doc(conversationId).set({
                        lead_id: doc.id,
                        phone: phoneToCall,
                        offer: lead.offer,
                        agent_id: lead.agent_id,
                        date_key: dateKey,
                        callSid: callSid,
                        created_at: admin.firestore.FieldValue.serverTimestamp(),
                        outcome: "pending",
                    }, { merge: true });
                }
                // Keep phone_leads master clean
                await db.collection("phone_leads").doc(doc.id).set({
                    last_called_at: admin.firestore.FieldValue.serverTimestamp(),
                    last_offer: lead.offer,
                    last_conversation_id: conversationId || null,
                    last_call_sid: callSid,
                }, { merge: true });

                fired++;
            } catch (err) {
                const msg = err.response?.data?.detail || err.response?.data || err.message;
                functions.logger.error(`coldCallRun: fire failed for ${doc.id}:`, msg);
                await doc.ref.update({
                    status: "failed",
                    failed_at: admin.firestore.FieldValue.serverTimestamp(),
                    error: typeof msg === "string" ? msg : JSON.stringify(msg),
                });
                failed++;
                failures.push(`${lead.name || doc.id}: ${typeof msg === "string" ? msg.slice(0, 80) : "err"}`);
            }

            // Throttle to respect ElevenLabs + Twilio concurrent-session limits
            await new Promise((r) => setTimeout(r, FIRE_INTERVAL_MS));
        }

        await db.collection("call_queue_summaries").doc(dateKey).set({
            run_at: admin.firestore.FieldValue.serverTimestamp(),
            fired,
            failed,
        }, { merge: true });

        const lines = [
            `🚀 *coldCallRun ${dateKey}* — batch dispatched`,
            `   Fired: *${fired}* · Failed: *${failed}*`,
        ];
        if (failures.length) {
            lines.push("", "_First failures:_");
            failures.slice(0, 3).forEach((f) => lines.push(`   • ${f}`));
        }
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`coldCallRun ${dateKey}: fired=${fired} failed=${failed}`);
        return null;
    });

// =====================================================================
// 3) coldCallReport — 13:00 Mon-Fri CDMX
// =====================================================================
exports.coldCallReport = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .pubsub.schedule("0 13 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const dateKey = cdmxTodayKey();

        functions.logger.info(`coldCallReport ${dateKey}: starting`);

        const callsSnap = await db.collection("call_analysis")
            .where("date_key", "==", dateKey)
            .get();

        if (callsSnap.empty) {
            await sendTelegram(`📊 *coldCallReport ${dateKey}* — no calls recorded yet for today.`);
            return null;
        }

        let total = 0, connected = 0, positive = 0, negative = 0, neutral = 0, pending = 0;
        const positives = [];

        callsSnap.forEach((doc) => {
            const c = doc.data();
            total++;
            const outcome = (c.outcome || "").toLowerCase();
            if (outcome === "pending" || outcome === "") pending++;
            else if (outcome.includes("positive") || outcome.includes("interested") || outcome === "yes") {
                positive++;
                connected++;
                positives.push({ ...c, conversation_id: doc.id });
            } else if (outcome.includes("negative") || outcome.includes("not_interested") || outcome === "no") {
                negative++;
                connected++;
            } else if (outcome.includes("voicemail") || outcome.includes("no_answer") || outcome.includes("failed")) {
                // unconnected outcomes
            } else {
                neutral++;
                connected++;
            }
        });

        // Auto-fire audits for positives with email + website
        let auditsQueued = 0;
        for (const p of positives) {
            if (!p.email || !p.website) continue;
            try {
                await db.collection("audit_requests").add({
                    email: p.email,
                    website: p.website,
                    firstName: p.name || "",
                    company: p.company || "",
                    phone: p.phone || "",
                    source: "cold_call",
                    offer: p.offer,
                    conversation_id: p.conversation_id,
                    lead_id: p.lead_id || null,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                auditsQueued++;
            } catch (err) {
                functions.logger.warn(`coldCallReport: audit queue failed for ${p.conversation_id}:`, err.message);
            }
        }

        await db.collection("call_queue_summaries").doc(dateKey).set({
            report_at: admin.firestore.FieldValue.serverTimestamp(),
            total, connected, positive, negative, neutral, pending,
            audits_queued: auditsQueued,
        }, { merge: true });

        const lines = [
            `📊 *coldCallReport ${dateKey}*`,
            `   Dialed: *${total}* · Connected: *${connected}* · Pending: ${pending}`,
            `   🔥 Positive: *${positive}* · ❌ Negative: ${negative} · Neutral: ${neutral}`,
            `   Audits auto-fired: *${auditsQueued}*`,
        ];
        if (positives.length) {
            lines.push("", "_Positives:_");
            positives.slice(0, 5).forEach((p) => {
                lines.push(`   • ${p.name || p.phone} (${p.company || "—"}) · ${p.offer}`);
            });
        }
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`coldCallReport ${dateKey}: total=${total} positive=${positive} audits=${auditsQueued}`);
        return null;
    });

// =====================================================================
// 4) coldCallMidBatchCheck — 10:15 Mon-Fri CDMX
//    Run 15 min into the morning batch. If > MID_BATCH_FAIL_THRESHOLD
//    leads have status=failed, send Telegram so Alex can abort the batch
//    before it burns through credits. Read-only — does NOT pause.
// =====================================================================
exports.coldCallMidBatchCheck = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("15 10 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const dateKey = cdmxTodayKey();

        const snap = await db.collection("call_queue").doc(dateKey).collection("leads").get();
        if (snap.empty) return null;

        let failed = 0, dialed = 0, queued = 0;
        const failSamples = [];
        snap.forEach((doc) => {
            const d = doc.data();
            if (d.status === "failed") {
                failed++;
                if (failSamples.length < 3) failSamples.push(`${d.name || doc.id}: ${(d.error || "").slice(0, 60)}`);
            } else if (d.status === "dialed") dialed++;
            else if (d.status === "queued") queued++;
        });

        if (failed > MID_BATCH_FAIL_THRESHOLD) {
            const lines = [
                `🚨 *coldCallMidBatchCheck ${dateKey}* — HIGH FAILURE RATE`,
                `   Failed: *${failed}* · Dialed: ${dialed} · Still queued: ${queued}`,
                `   Threshold: ${MID_BATCH_FAIL_THRESHOLD}`,
                "",
                "_First failures:_",
                ...failSamples.map((s) => `   • ${s}`),
                "",
                "Check ElevenLabs credits, Twilio status, or pause the batch.",
            ];
            await sendTelegram(lines.join("\n"));
        } else {
            functions.logger.info(`coldCallMidBatchCheck ${dateKey}: healthy (failed=${failed}, dialed=${dialed}, queued=${queued})`);
        }
        return null;
    });

// =====================================================================
// 5) coldCallRunAfternoon — 16:00 Mon-Fri CDMX
//    Retry morning no-answers + failed calls. Max AFTERNOON_BATCH_SIZE leads,
//    same agent as morning (retry_count increments). Afternoon hours have
//    better pickup rate for independent brokers in MX.
// =====================================================================
exports.coldCallRunAfternoon = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 16 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const dateKey = cdmxTodayKey();
        const EL_KEY = process.env.ELEVENLABS_API_KEY || EL_API_KEY_FALLBACK;

        functions.logger.info(`coldCallRunAfternoon ${dateKey}: starting`);

        // Pull today's no-answer + failed leads that haven't been retried yet
        const snap = await db.collection("call_queue").doc(dateKey).collection("leads")
            .where("status", "in", ["no_answer", "failed", "dialed"])
            .get();

        // Filter: dialed-no-answer OR failed AND no retry yet
        const retryCandidates = [];
        snap.forEach((doc) => {
            const d = doc.data();
            if ((d.afternoon_retry_count || 0) >= 1) return;
            if (d.status === "failed" || d.status === "no_answer") {
                retryCandidates.push({ id: doc.id, ref: doc.ref, ...d });
            }
            // If `dialed` but call_analysis marked voicemail/no_answer, also retry
            if (d.status === "dialed" && d.conversation_id) {
                // Pull call_analysis
                retryCandidates.push({ id: doc.id, ref: doc.ref, ...d, _needs_outcome_check: true });
            }
        });

        // Check call_analysis for `dialed` candidates
        const toRetry = [];
        for (const c of retryCandidates) {
            if (c._needs_outcome_check) {
                try {
                    const caSnap = await db.collection("call_analysis").doc(c.conversation_id).get();
                    const outcome = (caSnap.data()?.outcome || "").toLowerCase();
                    if (outcome.includes("voicemail") || outcome.includes("no_answer") || outcome === "pending") {
                        toRetry.push(c);
                    }
                } catch (_) { /* skip */ }
            } else {
                toRetry.push(c);
            }
        }

        const batch = toRetry.slice(0, AFTERNOON_BATCH_SIZE);
        if (batch.length === 0) {
            functions.logger.info(`coldCallRunAfternoon ${dateKey}: no retry candidates`);
            return null;
        }

        let fired = 0, failed = 0;
        for (const lead of batch) {
            try {
                const phoneToCall = lead.phone.startsWith("+") ? lead.phone : `+52${lead.phone}`;
                const firstMessage = `Hola ${lead.name || ""}, soy Sofia de JegoDigital. ¿Tienes un momento?`;

                const elRes = await axios.post(
                    "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
                    {
                        agent_id: lead.agent_id,
                        to_number: phoneToCall,
                        agent_phone_number_id: MX_PHONE_ID,
                        conversation_initiation_client_data: {
                            // Same wrapper as coldCallRun — ElevenLabs requires it.
                            dynamic_variables: {
                                lead_name: lead.name || "allá",
                                company_name: lead.company || "tu inmobiliaria",
                                website_url: lead.website || "tu sitio web",
                                city: lead.city || "tu ciudad",
                                lead_email: lead.email || "",
                                offer: lead.offer,
                            },
                            conversation_config_override: {
                                agent: { language: "es", first_message: firstMessage },
                                conversation: {
                                    max_duration_seconds: 300,
                                    client_inactivity_timeout_seconds: 30,
                                },
                            },
                        },
                    },
                    { headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" }, timeout: 20000 }
                );

                const conversationId = elRes.data?.conversation_id;
                // CallSid for twilioCallStatusCallback zombie kill (COLDCALL.md §10)
                const callSid = elRes.data?.callSid || elRes.data?.call_sid || null;
                await lead.ref.update({
                    status: "dialed",
                    dialed_at_afternoon: admin.firestore.FieldValue.serverTimestamp(),
                    afternoon_retry_count: (lead.afternoon_retry_count || 0) + 1,
                    afternoon_conversation_id: conversationId || null,
                    afternoon_call_sid: callSid,
                });
                if (conversationId) {
                    await db.collection("call_analysis").doc(conversationId).set({
                        lead_id: lead.id,
                        phone: phoneToCall,
                        offer: lead.offer,
                        agent_id: lead.agent_id,
                        date_key: dateKey,
                        callSid: callSid,
                        is_afternoon_retry: true,
                        created_at: admin.firestore.FieldValue.serverTimestamp(),
                        outcome: "pending",
                    }, { merge: true });
                }
                fired++;
            } catch (err) {
                const msg = err.response?.data?.detail || err.message;
                functions.logger.error(`coldCallRunAfternoon fire failed for ${lead.id}:`, msg);
                failed++;
            }
            await new Promise((r) => setTimeout(r, FIRE_INTERVAL_MS));
        }

        await db.collection("call_queue_summaries").doc(dateKey).set({
            afternoon_run_at: admin.firestore.FieldValue.serverTimestamp(),
            afternoon_fired: fired,
            afternoon_failed: failed,
            afternoon_candidates: toRetry.length,
        }, { merge: true });

        await sendTelegram([
            `🔁 *coldCallRunAfternoon ${dateKey}*`,
            `   Retried: *${fired}* · Failed: ${failed} · Pool: ${toRetry.length}`,
        ].join("\n"));

        functions.logger.info(`coldCallRunAfternoon ${dateKey}: fired=${fired} failed=${failed}`);
        return null;
    });
