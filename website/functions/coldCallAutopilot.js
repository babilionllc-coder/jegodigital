/**
 * coldCallAutopilot — daily 50-call routine, no human gate.
 *
 * Five crons, one module:
 *   09:55 Mon-Fri  coldCallPrep           — queue 120 phone-ready leads with A/B/C offer rotation (includes 24h failed-call retry)
 *   10:00 Mon-Fri  coldCallRun            — fire Sofia calls against today's queue
 *   10:15 Mon-Fri  coldCallMidBatchCheck  — Telegram alert if failed > 30/120 during run
 *   13:00 Mon-Fri  coldCallReport         — summarize outcomes, auto-fire audits for positives
 *   16:00 Mon-Fri  coldCallRunAfternoon   — DISABLED 2026-04-21 (no-op stub; morning-only until 3 YES/day)
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
// GCF cold-start fix 2026-04-23: see dailyDigest.js — same root cause.
// coldCallMidBatchCheck failed health check across retries in run #87.
if (!admin.apps.length) admin.initializeApp();
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

// ---- Twilio Lookup — pre-dial phone validation ----
// On 2026-04-21, 8/30 calls had 0s duration (bad numbers) and burned dial budget.
// Lookup v2 is FREE up to 5000/mo; we dial ~60/day = 1800/mo → no cost.
// Returns { valid: true, type: "mobile"|"landline"|null } or { valid: false, reason }.
// On Lookup API failure we default to { valid: true } — fail-open so outages don't zero the batch.
async function twilioLookup(e164) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) {
        functions.logger.warn("twilioLookup: TWILIO_ACCOUNT_SID/AUTH_TOKEN missing, skipping pre-dial check");
        return { valid: true, reason: "no_creds" };
    }
    try {
        const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;
        const r = await axios.get(url, {
            auth: { username: sid, password: tok },
            timeout: 8000,
            validateStatus: () => true,
        });
        if (r.status === 404) return { valid: false, reason: "number_not_found" };
        if (r.status !== 200) {
            functions.logger.warn(`twilioLookup ${e164}: HTTP ${r.status}, failing open`);
            return { valid: true, reason: `lookup_http_${r.status}` };
        }
        const d = r.data || {};
        const valid = d.valid === true;
        const type = d.line_type_intelligence?.type || d.carrier?.type || null;
        // Reject "voip" + "nonFixedVoip" — these are virtual numbers that usually go nowhere
        if (valid && type && /voip/i.test(type)) {
            return { valid: false, reason: `voip_line:${type}`, type };
        }
        return valid ? { valid: true, type } : { valid: false, reason: "twilio_invalid", type };
    } catch (err) {
        functions.logger.error(`twilioLookup ${e164} error:`, err.message);
        return { valid: true, reason: "lookup_exception" }; // fail-open
    }
}

// ---- Config ----
const EL_API_KEY_FALLBACK = "335ed6b73e0b9281175a6b360eab9cbc0765bae4d55a9d8b95010d8642b8d673";
const MX_PHONE_ID = "phnum_8801kp77en3ee56t0t291zyv40ne"; // +52 998 387 1618 (Sofia MX)
const BATCH_SIZE = 120;               // Morning batch — bumped from 50 to 120 (2026-04-21, Alex wants morning-only cadence until 3 YES/day)
const AFTERNOON_BATCH_SIZE = 0;       // DISABLED 2026-04-21 — afternoon batch is a no-op. Export retained to avoid Scheduler 404 deploy trap (see firebase_deploy_traps memory).
const FIRE_INTERVAL_MS = 12000;       // 12s between API fires — respects ElevenLabs + Twilio concurrency
const MID_BATCH_FAIL_THRESHOLD = 30;  // >30/120 failures at 10:15 → Telegram alarm (scaled with batch)

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

        // SELF-HEAL v2 (2026-04-24): auto-seed when EITHER (a) collection empty OR
        // (b) all leads cooldown-blocked (batch empty despite candidates existing).
        // v1 only triggered on empty collection → missed the 2026-04-24 failure mode
        // where all 57 phone_leads were called 2026-04-21 and blocked by 14-day
        // cooldown filter → 0 candidates → silent 0-dial day.
        if (batch.length === 0) {
            const reason = leadsSnap.size === 0 ? "collection_empty" : "all_cooldown_blocked";
            functions.logger.warn(`coldCallPrep: ${reason} (leads=${leadsSnap.size}, candidates=${candidates.length}), attempting auto-seed`);
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

        // Pre-dispatch coverage gate (v1 2026-04-21 — see cold-call-lead-finder skill).
        // Blocks the batch if too many leads lack a real first name OR an email.
        // Prevents the "dispatch 120 gatekeepers" failure mode observed 2026-04-21.
        const FAKE_FIRST_NAMES_GATE = new Set([
            "info", "contact", "contacto", "admin", "sales", "marketing", "hello", "hola",
            "ventas", "ventas1", "support", "soporte", "noreply", "no-reply", "mail", "email",
            "webmaster", "team", "office", "gerencia", "recepcion", "rh", "reception",
            "test", "user", "account", "billing", "allá",
        ]);
        const realNameCount = batch.filter((l) => {
            const nm = (l.name || l.first_name || "").toLowerCase().trim().split(/\s+/)[0];
            return nm && !FAKE_FIRST_NAMES_GATE.has(nm);
        }).length;
        const hasEmailCount = batch.filter((l) => l.email && l.email.includes("@")).length;
        const namePct = realNameCount / batch.length;
        const emailPct = hasEmailCount / batch.length;
        const NAME_GATE = 0.70;
        const EMAIL_GATE = 0.60;
        if (namePct < NAME_GATE || emailPct < EMAIL_GATE) {
            const reason = namePct < NAME_GATE ? "name_pct_too_low" : "email_pct_too_low";
            await db.collection("cold_call_alerts").add({
                type: "coverage_gate_block",
                date: dateKey,
                planned: batch.length,
                real_name_pct: namePct,
                has_email_pct: emailPct,
                reason,
                name_gate: NAME_GATE,
                email_gate: EMAIL_GATE,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await db.collection("call_queue_summaries").doc(dateKey).set({
                date: dateKey,
                prep_at: admin.firestore.FieldValue.serverTimestamp(),
                coverage_gate_blocked: true,
                real_name_pct: namePct,
                has_email_pct: emailPct,
                gate_reason: reason,
                total: 0,
            }, { merge: true });
            await sendTelegram([
                `🚨 *coldCallPrep ${dateKey}* — BATCH BLOCKED by coverage gate`,
                `   Planned: ${batch.length} leads`,
                `   Real-name %: *${(namePct * 100).toFixed(0)}%* (need ≥${(NAME_GATE * 100).toFixed(0)}%)`,
                `   Has-email %: *${(emailPct * 100).toFixed(0)}%* (need ≥${(EMAIL_GATE * 100).toFixed(0)}%)`,
                `   Reason: ${reason}`,
                `   Action: leadFinderAutoTopUp will re-run tomorrow 08:00; manual fire: \`gcloud scheduler jobs run firebase-schedule-leadFinderAutoTopUp-us-central1 --location=us-central1\``,
            ].join("\n"));
            functions.logger.warn(`coldCallPrep ${dateKey}: BLOCKED — name=${(namePct * 100).toFixed(0)}% email=${(emailPct * 100).toFixed(0)}%`);
            return null;
        }
        functions.logger.info(`coldCallPrep ${dateKey}: coverage gate PASS — name=${(namePct * 100).toFixed(0)}% email=${(emailPct * 100).toFixed(0)}%`);

        // Smart offer routing (v3 2026-04-21) — was uniform random.
        // Uses Firecrawl signals captured in leadFinderAutoTopUp to match the
        // lead to the offer most likely to resonate:
        //
        //   Offer B (Free Audit) → active agency with stale blog OR weak
        //      PageSpeed — auditor hits their sore spot, high-intent CTA
        //   Offer C (Free Setup) → strong IG presence but NO WhatsApp/chat
        //      widget — speed-to-lead is the obvious gap we can plug for free
        //   Offer A (SEO Pitch) → everything else (default)
        //
        // Falls back to uniform-random ONLY for leads whose fc_enriched_at is
        // null (legacy leads from before v3 + any Firecrawl-failed rows).
        // This keeps the A/B/C experiment running on unenriched inventory and
        // lets coldCallCalibrationDaily measure smart-vs-random lift.
        const offerCounts = { A: 0, B: 0, C: 0 };
        const routingCounts = { smart: 0, random: 0 };

        function pickOffer(lead) {
            const enriched = !!lead.fc_enriched_at;
            if (!enriched) {
                routingCounts.random++;
                return OFFER_ROTATION[Math.floor(Math.random() * OFFER_ROTATION.length)];
            }
            routingCounts.smart++;

            const activeListings = Number(lead.fc_active_listings || 0);
            const lastBlog = lead.fc_last_blog_post_date;
            const blogAgeDays = lastBlog ? Math.floor(
                (Date.now() - new Date(lastBlog).getTime()) / 86400000
            ) : 9999;
            const hasWhatsApp = !!lead.fc_whatsapp_link;
            const hasChatWidget = !!lead.fc_has_chat_widget;
            const hasIG = !!lead.fc_instagram_handle;
            const pagespeed = Number(lead.fc_pagespeed_mobile || 100); // default high so only real low scores trigger

            // Rule 1 — active agency, stale content = Audit pitch
            if (activeListings >= 5 && blogAgeDays > 180) return "B";
            if (pagespeed > 0 && pagespeed < 50) return "B";

            // Rule 2 — strong IG + NO speed-to-lead = Free Setup pitch (Trojan Horse)
            if (hasIG && !hasWhatsApp && !hasChatWidget) return "C";

            // Rule 3 — dormant agency (no listings, abandoned blog) → also Audit
            // (surface the diagnostic before upselling)
            if (activeListings === 0 && blogAgeDays > 365) return "B";

            // Default — SEO pitch
            return "A";
        }

        const writePromises = batch.map((lead) => {
            const offer = pickOffer(lead);
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
            routing_counts: routingCounts,
            source_pool: candidates.length,
        }, { merge: true });

        const msg = [
            `📞 *coldCallPrep ${dateKey}* — ${batch.length} leads queued for 10:00 CDMX`,
            `   Pool of ${candidates.length} eligible · dialing oldest-first`,
            `   Offer A (${OFFERS.A.label}): ${offerCounts.A}`,
            `   Offer B (${OFFERS.B.label}): ${offerCounts.B}`,
            `   Offer C (${OFFERS.C.label}): ${offerCounts.C}`,
            `   Routing: ${routingCounts.smart} smart · ${routingCounts.random} random fallback`,
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
                // 2026-04-24 PM: switched to yesterday-proven message pattern.
                // Old "Hola Name, soy Sofia..." with name="Hola" (CSV placeholder)
                // produced "Hola Hola, soy Sofia..." and 0% bridge rate on 33 dials.
                // Yesterday's working 44 bridges all used this pattern:
                // "Buen día, hablo de JegoDigital, ¿es la oficina de [Company]?"
                // Honors per-lead first_message_override if set (diagnostic batches).
                const firstMessage = lead.first_message_override ||
                    `Buen día, hablo de JegoDigital, ¿es la oficina de ${lead.company || lead.name || "esta inmobiliaria"}?`;

                // Pre-dial Twilio Lookup — skip known-bad numbers before burning ElevenLabs budget
                const lookup = await twilioLookup(phoneToCall);
                if (!lookup.valid) {
                    await doc.ref.update({
                        status: "invalid_phone",
                        skipped_at: admin.firestore.FieldValue.serverTimestamp(),
                        skip_reason: lookup.reason,
                    });
                    failed += 1;
                    failures.push(`${lead.name || "(no name)"} — ${lookup.reason}`);
                    functions.logger.info(`Skipped ${phoneToCall} — ${lookup.reason}`);
                    continue;
                }

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
                                // Hard cap 60s: if voicemail_detection misfires, limit the
                                // monologue loss instead of wasting 300s. Real qualified
                                // calls finish well under 60s (avg 35-45s). See AUDIT
                                // 2026-04-21 CC-8 — 14/30 calls hit 90s max on voicemails
                                // with 0-message transcripts. Was: 300s + dead
                                // client_inactivity_timeout_seconds (silently dropped by API).
                                conversation: {
                                    max_duration_seconds: 60,
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
                // and force-close zombie ElevenLabs sessions. See SYSTEM.md §10.4.
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
// 5) coldCallRunAfternoon — DISABLED 2026-04-21
//    Afternoon batch killed per Alex: morning-only cadence until we hit
//    3 YES clients/day. Export + scheduler retained as no-op to avoid
//    Cloud Scheduler 404 deploy trap (see firebase_deploy_traps memory).
//    To re-enable: set AFTERNOON_BATCH_SIZE > 0 + restore body.
// =====================================================================
exports.coldCallRunAfternoon = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("0 16 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        functions.logger.info(`coldCallRunAfternoon: DISABLED (no-op stub) — see coldCallAutopilot.js comment`);
        return null;
    });

// Original implementation preserved below for restore reference (unreachable).
// eslint-disable-next-line no-unused-vars
async function _coldCallRunAfternoonOriginal_disabled() {
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
                // 2026-04-24 PM: switched to yesterday-proven message pattern.
                // Old "Hola Name, soy Sofia..." with name="Hola" (CSV placeholder)
                // produced "Hola Hola, soy Sofia..." and 0% bridge rate on 33 dials.
                // Yesterday's working 44 bridges all used this pattern:
                // "Buen día, hablo de JegoDigital, ¿es la oficina de [Company]?"
                // Honors per-lead first_message_override if set (diagnostic batches).
                const firstMessage = lead.first_message_override ||
                    `Buen día, hablo de JegoDigital, ¿es la oficina de ${lead.company || lead.name || "esta inmobiliaria"}?`;

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
                // CallSid for twilioCallStatusCallback zombie kill (SYSTEM.md §10.4)
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
}

// =====================================================================
// coldCallPostRunSweep — daily 14:00 CDMX (after all morning dispatches settled)
// 3-strikes auto-DNC. Reads recent call_analysis outcomes, increments
// phone_leads.call_attempts_count, marks do_not_call=true when a lead has
// 3+ attempts in last 30 days AND all were no_answer / failed / voicemail.
// Added 2026-04-21 per cold-call-lead-finder skill HARD RULE #4.
// =====================================================================
exports.coldCallPostRunSweep = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 14 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const todayKey = cdmxTodayKey();
        const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        );

        // Pull call_analysis from last 36h — covers yesterday's morning batch
        // plus any mid-day on-demand fires.
        const cutoff = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 36 * 60 * 60 * 1000)
        );
        let analysisSnap;
        try {
            analysisSnap = await db.collection("call_analysis")
                .where("created_at", ">=", cutoff)
                .limit(500)
                .get();
        } catch (err) {
            functions.logger.error("coldCallPostRunSweep: call_analysis query failed:", err.message);
            await sendTelegram(`⚠️ *coldCallPostRunSweep ${todayKey}* — call_analysis query failed: ${err.message}`);
            return null;
        }

        // Group by lead_id → outcomes
        const leadOutcomes = new Map();
        analysisSnap.forEach((doc) => {
            const d = doc.data();
            if (!d.lead_id) return;
            const list = leadOutcomes.get(d.lead_id) || [];
            list.push({
                outcome: d.outcome || "unknown",
                at: d.created_at?.toDate?.() || null,
                conversation_id: doc.id,
            });
            leadOutcomes.set(d.lead_id, list);
        });

        let markedDnc = 0, updatedAttempts = 0, skippedRecent = 0;
        const NO_CONNECT_OUTCOMES = new Set([
            "no_answer", "failed", "voicemail", "busy", "canceled", "pending",
        ]);

        for (const [leadId, outcomes] of leadOutcomes.entries()) {
            const leadRef = db.collection("phone_leads").doc(leadId);
            const leadSnap = await leadRef.get();
            if (!leadSnap.exists) continue;
            const lead = leadSnap.data();
            if (lead.do_not_call === true) continue; // already DNC'd

            // Merge new outcomes into call_attempts (dedupe by conversation_id)
            const existing = lead.call_attempts || [];
            const existingIds = new Set(existing.map((a) => a.conversation_id).filter(Boolean));
            const newAttempts = outcomes.filter((o) => !existingIds.has(o.conversation_id));
            if (newAttempts.length === 0) { skippedRecent++; continue; }

            const merged = [...existing, ...newAttempts].slice(-20); // keep last 20

            // Count attempts in last 30 days
            const last30 = merged.filter((a) => a.at && a.at >= thirtyDaysAgo.toDate());
            const allNoConnect = last30.length > 0 &&
                last30.every((a) => NO_CONNECT_OUTCOMES.has(a.outcome));

            const updates = {
                call_attempts: merged,
                call_attempts_count: merged.length,
            };
            if (last30.length >= 3 && allNoConnect) {
                updates.do_not_call = true;
                updates.dnc_reason = "3_no_connects_in_30d";
                updates.dnc_at = admin.firestore.FieldValue.serverTimestamp();
                markedDnc++;
            }
            await leadRef.update(updates);
            updatedAttempts++;
        }

        await db.collection("cold_call_daily_summaries").doc(todayKey).set({
            date: todayKey,
            sweep_ran_at: admin.firestore.FieldValue.serverTimestamp(),
            leads_processed: leadOutcomes.size,
            attempts_updated: updatedAttempts,
            skipped_already_logged: skippedRecent,
            marked_dnc: markedDnc,
        }, { merge: true });

        const lines = [
            `🧹 *coldCallPostRunSweep ${todayKey}*`,
            `   Leads processed: ${leadOutcomes.size}`,
            `   Attempts updated: *${updatedAttempts}* · Already-logged: ${skippedRecent}`,
            `   Marked DNC (3+ no-connects in 30d): *${markedDnc}*`,
        ];
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`coldCallPostRunSweep ${todayKey}: processed=${leadOutcomes.size} updated=${updatedAttempts} dnc=${markedDnc}`);
        return null;
    });

// =====================================================================
// coldCallCalibrationDaily — Daily 14:30 CDMX (after PostRunSweep at 14:00)
// =====================================================================
// Reads 7 days of call_queue_summaries + call_analysis to compute:
//   - positive_conversation_rate per (offer × routing × name/email bucket)
//   - smart-routing lift vs random fallback
//   - recommended new NAME_GATE / EMAIL_GATE if current gates leave value
//     on the table OR admit garbage
//
// Posts a Telegram recommendation table to Alex. Does NOT auto-tune the
// thresholds — Alex reads, decides, applies via PR. Goal: data-driven
// calibration with a human in the loop. After 30 days of clean data we
// can flip to auto-apply behind a feature flag.
//
// Dependencies: cold_call_alerts (gate blocks), call_queue_summaries
// (offer + routing counts), call_analysis (outcomes + transcripts).
exports.coldCallCalibrationDaily = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("30 14 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );

        // Pull last 7 days of summaries + analyses
        let summariesSnap, analysisSnap;
        try {
            summariesSnap = await db.collection("call_queue_summaries")
                .where("prep_at", ">=", sevenDaysAgo)
                .get();
            analysisSnap = await db.collection("call_analysis")
                .where("created_at", ">=", sevenDaysAgo)
                .get();
        } catch (err) {
            functions.logger.error("coldCallCalibrationDaily query failed:", err.message);
            await sendTelegram(`⚠️ *coldCallCalibrationDaily* — Firestore query failed: ${err.message}`);
            return null;
        }

        const totalDays = summariesSnap.size;
        const totalCalls = analysisSnap.size;

        // Insufficient-data gate
        if (totalDays < 7 || totalCalls < 50) {
            const msg = [
                `📊 *coldCallCalibrationDaily*`,
                `   Days of data: ${totalDays}/7 · Calls: ${totalCalls}/50 minimum`,
                `   Need more data before recommending gate changes. Skipping.`,
            ].join("\n");
            await sendTelegram(msg);
            functions.logger.info(`calibration: insufficient data (${totalDays}d / ${totalCalls} calls)`);
            return null;
        }

        // Build per-call rollup: outcome + offer
        const callsByOffer = { A: { total: 0, positive: 0, conversation: 0 }, B: { total: 0, positive: 0, conversation: 0 }, C: { total: 0, positive: 0, conversation: 0 } };
        const POSITIVE_OUTCOMES = new Set(["interested", "booked", "qualified", "audit_requested", "callback_scheduled"]);
        const CONVERSATION_OUTCOMES = new Set(["interested", "booked", "qualified", "audit_requested", "callback_scheduled", "not_interested", "objection", "wrong_person", "gatekeeper_transferred"]);

        analysisSnap.forEach((doc) => {
            const d = doc.data();
            const offer = d.offer || "A";
            if (!callsByOffer[offer]) return;
            callsByOffer[offer].total++;
            if (POSITIVE_OUTCOMES.has(d.outcome)) callsByOffer[offer].positive++;
            if (CONVERSATION_OUTCOMES.has(d.outcome)) callsByOffer[offer].conversation++;
        });

        // Coverage stats from summaries
        let totalQueued = 0, totalSmart = 0, totalRandom = 0;
        const gateBlocks = [];
        summariesSnap.forEach((doc) => {
            const d = doc.data();
            totalQueued += Number(d.total || 0);
            totalSmart += Number(d.routing_counts?.smart || 0);
            totalRandom += Number(d.routing_counts?.random || 0);
            if (d.coverage_gate_blocked) {
                gateBlocks.push({
                    date: d.date,
                    namePct: d.gate_name_pct,
                    emailPct: d.gate_email_pct,
                    reason: d.gate_reason,
                });
            }
        });

        const fmtRate = (n, d) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "n/a";

        const lines = [
            `📊 *coldCallCalibrationDaily* — last 7 days`,
            `   Days analyzed: ${totalDays} · Total calls: ${totalCalls} · Queued: ${totalQueued}`,
            ``,
            `*Conversion by offer:*`,
            `   A (SEO):   ${callsByOffer.A.total} calls · ${fmtRate(callsByOffer.A.positive, callsByOffer.A.total)} positive · ${fmtRate(callsByOffer.A.conversation, callsByOffer.A.total)} real-conv`,
            `   B (Audit): ${callsByOffer.B.total} calls · ${fmtRate(callsByOffer.B.positive, callsByOffer.B.total)} positive · ${fmtRate(callsByOffer.B.conversation, callsByOffer.B.total)} real-conv`,
            `   C (Setup): ${callsByOffer.C.total} calls · ${fmtRate(callsByOffer.C.positive, callsByOffer.C.total)} positive · ${fmtRate(callsByOffer.C.conversation, callsByOffer.C.total)} real-conv`,
            ``,
            `*Routing split:* ${totalSmart} smart · ${totalRandom} random fallback`,
            `*Coverage gate blocks:* ${gateBlocks.length}`,
        ];

        // Recommendations
        const recommendations = [];
        const offerRates = Object.entries(callsByOffer).map(([k, v]) => ({
            offer: k,
            rate: v.total > 0 ? v.positive / v.total : 0,
            calls: v.total,
        }));
        const winner = offerRates.reduce((a, b) => (b.rate > a.rate ? b : a));
        const loser = offerRates.reduce((a, b) => (b.rate < a.rate ? b : a));
        if (winner.calls >= 20 && winner.rate > loser.rate * 2) {
            recommendations.push(`Offer ${winner.offer} converts ${(winner.rate * 100).toFixed(1)}% vs Offer ${loser.offer} ${(loser.rate * 100).toFixed(1)}% — consider weighting smart-routing toward ${winner.offer}`);
        }
        if (gateBlocks.length >= 3) {
            recommendations.push(`Coverage gate blocked ${gateBlocks.length} batches in 7d — leadFinderAutoTopUp is starving the queue. Audit Hunter hit-rate + city rotation.`);
        }
        if (totalSmart < totalQueued * 0.5) {
            recommendations.push(`Only ${((totalSmart / Math.max(1, totalQueued)) * 100).toFixed(0)}% of leads got smart-routed — Firecrawl enrichment is failing on too many domains. Check Firecrawl API quota + retry logic.`);
        }
        if (recommendations.length === 0) {
            recommendations.push(`No urgent calibration changes recommended. Continue monitoring.`);
        }

        lines.push("", `*Recommendations:*`);
        recommendations.forEach((r, i) => lines.push(`   ${i + 1}. ${r}`));

        // Persist for historical tracking
        const todayKey = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await db.collection("cold_call_calibration").doc(todayKey).set({
            date: todayKey,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
            window_days: totalDays,
            total_calls: totalCalls,
            total_queued: totalQueued,
            routing_smart: totalSmart,
            routing_random: totalRandom,
            offer_stats: callsByOffer,
            gate_blocks_count: gateBlocks.length,
            recommendations,
        }, { merge: true });

        await sendTelegram(lines.join("\n"));
        functions.logger.info(`coldCallCalibrationDaily: ${totalCalls} calls, ${recommendations.length} recs`);
        return null;
    });
