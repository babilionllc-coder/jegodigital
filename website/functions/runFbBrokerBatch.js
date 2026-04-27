/**
 * runFbBrokerBatch — Autonomous FB Brokers cold-call launcher.
 *
 * Triggered by Cloud Scheduler at 10:00am CDMX (16:00 UTC). Runs in two phases:
 *
 *   Phase 1 (auto):     Fires first 5 calls @ 30s spacing (~2.5 min)
 *                       Sends Telegram with ✅ Continue / ❌ Abort buttons
 *                       Pauses, waiting for Alex's tap
 *
 *   Phase 2 (on tap):   When Alex taps Continue, telegramApprovalBot.js routes
 *                       the callback to fbBrokerBatchResume which loops the remaining
 *                       86 calls @ 30s spacing (~43 min total)
 *
 * State machine (Firestore /system/fb_dial_state):
 *   { state: "idle" | "phase1_running" | "awaiting_approval" | "phase2_running" |
 *            "completed" | "aborted" | "auto_paused",
 *     session_id, started_at, last_index, total, results: [...], aborted_reason }
 *
 * Self-healing (dialSupervisor.js, separate file):
 *   - Auto-pauses on 3+ consecutive IVR or do_not_call
 *   - Drops carrier-flagged numbers from MX_PHONE_POOL mid-batch
 *   - Retries transient 5xx errors once
 *
 * Env: ELEVENLABS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SLACK_BOT_TOKEN,
 *      SLACK_CHANNEL_LEADS_HOT, SLACK_CHANNEL_COLD_CALL_LOG
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

if (admin.apps.length === 0) admin.initializeApp();

const ELEVEN_KEY = () => process.env.ELEVENLABS_API_KEY;
const AGENT_ID = "agent_7301kq5jxe0gf3vbmp92c974stzc";
const SESSION_DOC = "system/fb_dial_state";
const TG_BOT = () => process.env.TELEGRAM_BOT_TOKEN || "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT = () => process.env.TELEGRAM_CHAT_ID || "6637626501";

// Round-robin pool — same as tools/dial_fb_brokers.cjs.
// Supervisor can mark numbers `dead: true` mid-batch via Firestore /system/fb_dial_phone_pool override.
const DEFAULT_PHONE_POOL = [
    { id: "phnum_8201kq0efkq6esttrdm916g8n3r0", number: "+529983871618", label: "MX#1 Original" },
    { id: "phnum_0401kq692pspfgkafmvmpr6e7mhn", number: "+529983871354", label: "MX#2"          },
    { id: "phnum_8901kq692r32e5y89de42wp9xghs", number: "+528121887124", label: "MX#3 MTY"      },
];

const PHASE1_COUNT = 5;
const DELAY_S = 30;
const SKIP_PHONES = new Set(["+529982367673"]); // Andrea — already test-burned

function loadLeads() {
    const p = path.join(__dirname, "data/fb_brokers_call_list.json");
    const all = JSON.parse(fs.readFileSync(p, "utf8"));
    const priority = { PERSON_HIGH: 1, COMPANY: 2, PERSON_MEDIUM: 3, PERSON_LOW: 4, UNKNOWN: 5 };
    all.sort((a, b) => {
        const pa = priority[a.category] || 99;
        const pb = priority[b.category] || 99;
        if (pa !== pb) return pa - pb;
        return (b.posts_count || 0) - (a.posts_count || 0);
    });
    return all.filter((l) => !SKIP_PHONES.has(l.phone));
}

async function getActivePhonePool() {
    const snap = await admin.firestore().doc("system/fb_dial_phone_pool").get();
    const overrides = snap.exists ? (snap.data().dead_ids || []) : [];
    return DEFAULT_PHONE_POOL.filter((p) => !overrides.includes(p.id));
}

async function fireCall(lead, phone) {
    const dynamicVars = {
        first_name: lead.first_name || "",
        business_name: lead.business_name || "",
        opening_strategy: lead.opening_strategy,
        source_group: lead.source_group || "un grupo de bienes raíces",
        zone: lead.zone || "su zona",
        phone: lead.phone,
        sample_post_url: lead.sample_post_url || "",
    };
    const payload = {
        agent_id: AGENT_ID,
        agent_phone_number_id: phone.id,
        to_number: lead.phone,
        conversation_initiation_client_data: { dynamic_variables: dynamicVars },
    };
    try {
        const r = await axios.post(
            "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
            payload,
            { headers: { "xi-api-key": ELEVEN_KEY(), "Content-Type": "application/json" }, timeout: 20000 }
        );
        if (r.data && r.data.success) {
            return { ok: true, conversation_id: r.data.conversation_id, callSid: r.data.callSid, from: phone.number };
        }
        return { ok: false, error: JSON.stringify(r.data).slice(0, 400), from: phone.number };
    } catch (err) {
        const detail = err.response?.data || err.message;
        return { ok: false, error: typeof detail === "string" ? detail.slice(0, 400) : JSON.stringify(detail).slice(0, 400), from: phone.number };
    }
}

async function sendTelegramWithButtons(text, buttons) {
    const url = `https://api.telegram.org/bot${TG_BOT()}/sendMessage`;
    const reply_markup = { inline_keyboard: [buttons] };
    try {
        const r = await axios.post(url, {
            chat_id: TG_CHAT(),
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            reply_markup,
        }, { timeout: 10000 });
        return r.data?.ok === true;
    } catch (err) {
        functions.logger.error("[fbBrokerBatch] TG buttons failed:", err.message);
        return false;
    }
}

async function runDialLoop({ leads, startIdx, endIdx, sessionId, phaseLabel }) {
    const stateRef = admin.firestore().doc(SESSION_DOC);
    let pool = await getActivePhonePool();
    let rotationIdx = startIdx; // continue rotation from where we left off

    for (let i = startIdx; i < endIdx; i++) {
        // Check for abort signal between calls
        const cur = (await stateRef.get()).data() || {};
        if (cur.state === "aborted") {
            functions.logger.warn(`[fbBrokerBatch] Aborted at index ${i} by user.`);
            await notify(`🛑 *FB Brokers batch ABORTED* at call ${i}/${leads.length}\nReason: ${cur.aborted_reason || "manual"}`);
            return { aborted: true, lastIndex: i };
        }
        if (cur.state === "auto_paused") {
            functions.logger.warn(`[fbBrokerBatch] Auto-paused at index ${i}.`);
            return { autoPaused: true, lastIndex: i };
        }
        // Re-read pool in case supervisor dropped a number
        pool = await getActivePhonePool();
        if (pool.length === 0) {
            await notify("🚨 *FB Brokers batch HALTED* — no MX phones available (all flagged?).");
            await stateRef.set({ state: "auto_paused", aborted_reason: "no_phones_available", paused_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return { autoPaused: true, lastIndex: i };
        }
        const phone = pool[rotationIdx % pool.length];
        rotationIdx++;

        const lead = leads[i];
        const r = await fireCall(lead, phone);
        const result = { idx: i, lead_phone: lead.phone, lead_name: lead.first_name || lead.business_name || "", category: lead.category, ...r, fired_at: new Date().toISOString() };

        // Append to results array atomically
        await stateRef.update({
            results: admin.firestore.FieldValue.arrayUnion(result),
            last_index: i,
        });

        functions.logger.info(`[fbBrokerBatch] [${phaseLabel}] ${i + 1}/${leads.length} ${lead.phone} via ${phone.label} → ${r.ok ? "OK " + r.conversation_id : "FAIL " + r.error}`);

        // Sleep between calls (skip after the last one)
        if (i < endIdx - 1) {
            await new Promise((res) => setTimeout(res, DELAY_S * 1000));
        }
    }
    return { completed: true, lastIndex: endIdx - 1 };
}

// ============================================================
// 1. Initial trigger — Phase 1 + checkpoint
// ============================================================
exports.runFbBrokerBatch = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const stateRef = admin.firestore().doc(SESSION_DOC);
            const cur = (await stateRef.get()).data() || {};

            // Block double-runs unless ?force=true
            if (cur.state && ["phase1_running", "phase2_running", "awaiting_approval"].includes(cur.state) && req.query.force !== "true") {
                return res.status(409).json({ ok: false, error: `Batch already in state '${cur.state}'. Pass ?force=true to restart.` });
            }

            const leads = loadLeads();
            const sessionId = `fb_batch_${Date.now()}`;
            await stateRef.set({
                state: "phase1_running",
                session_id: sessionId,
                started_at: admin.firestore.FieldValue.serverTimestamp(),
                total: leads.length,
                last_index: -1,
                results: [],
                aborted_reason: null,
            });

            await notify(
                `🚀 *FB Brokers batch starting — Phase 1*\n` +
                `Session: \`${sessionId}\`\n` +
                `Total leads: ${leads.length}\n` +
                `Phase 1: first ${PHASE1_COUNT} calls @ ${DELAY_S}s spacing (~2.5 min)\n` +
                `Then I'll ping you for ✅ Continue / ❌ Abort.`
            );

            // Fire Phase 1 inline
            const r1 = await runDialLoop({ leads, startIdx: 0, endIdx: PHASE1_COUNT, sessionId, phaseLabel: "P1" });

            if (r1.aborted || r1.autoPaused) {
                return res.json({ ok: true, phase: 1, halted: true, ...r1 });
            }

            // Phase 1 complete — wait for approval
            await stateRef.update({
                state: "awaiting_approval",
                phase1_completed_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Pull recent results to summarize
            const recent = (await stateRef.get()).data().results || [];
            const ok = recent.filter((r) => r.ok).length;
            const fail = recent.length - ok;

            await sendTelegramWithButtons(
                `✅ *Phase 1 complete* — ${ok}/${recent.length} calls fired\n` +
                `Session: \`${sessionId}\`\n` +
                (fail > 0 ? `⚠️ ${fail} failed (check logs)\n` : "") +
                `\nReady to fire remaining ${leads.length - PHASE1_COUNT} calls (~${Math.ceil((leads.length - PHASE1_COUNT) * DELAY_S / 60)} min)?`,
                [
                    { text: `✅ Continue (${leads.length - PHASE1_COUNT})`, callback_data: `fb_continue:${sessionId}` },
                    { text: "❌ Abort", callback_data: `fb_abort:${sessionId}` },
                ]
            );

            return res.json({ ok: true, phase: 1, completed: true, awaiting_approval: true, session_id: sessionId, fired: recent.length });
        } catch (err) {
            functions.logger.error("[runFbBrokerBatch] crash:", err);
            await notify(`💥 *FB Brokers batch CRASHED* before/during Phase 1\nError: ${err.message}`).catch(() => {});
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 2. Resume — Phase 2 (called by Telegram callback handler)
// ============================================================
exports.runFbBrokerBatchResume = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const stateRef = admin.firestore().doc(SESSION_DOC);
            const cur = (await stateRef.get()).data() || {};

            if (cur.state !== "awaiting_approval") {
                return res.status(409).json({ ok: false, error: `Cannot resume from state '${cur.state}'. Expected 'awaiting_approval'.` });
            }

            const leads = loadLeads();
            const startIdx = (cur.last_index || -1) + 1;

            await stateRef.update({
                state: "phase2_running",
                phase2_started_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            await notify(`▶️ *Phase 2 starting* — ${leads.length - startIdx} calls @ ${DELAY_S}s = ~${Math.ceil((leads.length - startIdx) * DELAY_S / 60)} min total`);

            const r2 = await runDialLoop({ leads, startIdx, endIdx: leads.length, sessionId: cur.session_id, phaseLabel: "P2" });

            if (r2.aborted || r2.autoPaused) {
                return res.json({ ok: true, phase: 2, halted: true, ...r2 });
            }

            await stateRef.update({
                state: "completed",
                completed_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            const final = (await stateRef.get()).data().results || [];
            const ok = final.filter((r) => r.ok).length;
            const fail = final.length - ok;

            await notify(
                `🏁 *FB Brokers batch DONE*\n` +
                `Session: \`${cur.session_id}\`\n` +
                `Fired: ${final.length}/${leads.length}\n` +
                `Successful: ${ok}\n` +
                `Failed: ${fail}\n` +
                `\nMonitor Telegram for positive-reply alerts as conversations complete.`
            );
            await slackPost({ channel: process.env.SLACK_CHANNEL_COLD_CALL_LOG || "#cold-call-log", text: `FB Brokers batch done: ${ok}/${final.length} fired (session ${cur.session_id})` }).catch(() => {});

            return res.json({ ok: true, phase: 2, completed: true, fired: final.length, ok, fail });
        } catch (err) {
            functions.logger.error("[runFbBrokerBatchResume] crash:", err);
            await notify(`💥 *FB Brokers batch CRASHED in Phase 2*\nError: ${err.message}`).catch(() => {});
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 3. Abort — set state, halt loop on next iteration
// ============================================================
exports.abortFbBrokerBatch = functions.https.onRequest(async (req, res) => {
    const reason = req.query.reason || "manual_via_telegram";
    await admin.firestore().doc(SESSION_DOC).set({
        state: "aborted",
        aborted_reason: reason,
        aborted_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await notify(`🛑 *FB Brokers batch ABORT requested*\nReason: ${reason}\nCurrent loop will exit before next call.`);
    return res.json({ ok: true, aborted: true, reason });
});

// ============================================================
// 4. Status — quick check
// ============================================================
exports.fbBrokerBatchStatus = functions.https.onRequest(async (req, res) => {
    const snap = await admin.firestore().doc(SESSION_DOC).get();
    if (!snap.exists) return res.json({ ok: true, state: "idle" });
    const d = snap.data();
    const results = d.results || [];
    return res.json({
        ok: true,
        state: d.state,
        session_id: d.session_id,
        last_index: d.last_index,
        total: d.total,
        fired: results.length,
        successful: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
    });
});
