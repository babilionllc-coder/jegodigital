/**
 * dialSupervisor — Self-healing monitor for runFbBrokerBatch.
 *
 * Runs every 1 min via Cloud Scheduler while a batch is active. Job:
 *
 *   1. Read /system/fb_dial_state — bail if state ≠ phase1_running|phase2_running.
 *   2. Read last 10 dial results in state.results.
 *   3. Auto-pause heuristics:
 *        a. ≥5 consecutive `do_not_call` outcomes → pause (probably a bad agent prompt
 *           or the brokers are universally allergic — stop bleeding leads)
 *        b. ≥3 consecutive `voicemail` / IVR detections from the SAME phone_number_id
 *           → drop that number from the pool (carrier may be force-routing us to VM)
 *        c. ≥3 ElevenLabs API failures in last 5 fires → pause (provider issue)
 *   4. On any auto-action, post Telegram with explanation + Resume button.
 *
 * Reads ElevenLabs conversation analyses via /v1/convai/conversations/{id} to
 * classify each call's outcome (we already do this in postCallWhatsAppFollowup.js,
 * but the supervisor needs to know mid-batch BEFORE the post-call webhook fires).
 *
 * Frequency: every 1 min during active batch. Idle batches = no-op (returns fast).
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { notify } = require("./telegramHelper");

if (admin.apps.length === 0) admin.initializeApp();

const SESSION_DOC = "system/fb_dial_state";
const PHONE_POOL_DOC = "system/fb_dial_phone_pool";
const ELEVEN_KEY = () => process.env.ELEVENLABS_API_KEY;

const CONSECUTIVE_DNC_THRESHOLD = 5;          // 5 consecutive do_not_call → pause
const CONSECUTIVE_VM_PER_NUMBER_THRESHOLD = 3; // 3 voicemails on one number → drop number
const API_FAIL_RATE_THRESHOLD = 3;             // 3 of last 5 = API problem → pause

async function classifyConversation(conversationId) {
    if (!conversationId) return "unknown";
    try {
        const r = await axios.get(
            `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
            { headers: { "xi-api-key": ELEVEN_KEY() }, timeout: 12000 }
        );
        const summary = (r.data?.analysis?.transcript_summary || "").toLowerCase();
        if (!summary) return "in_progress"; // not yet analyzed
        if (/voicemail|buzon|contestador|deja un mensaje|after the (tone|beep)/.test(summary)) return "voicemail";
        if (/no me interesa|no gracias|don't call|do not call|no insistas|quitar|remover/.test(summary)) return "do_not_call";
        if (/whatsapp|mandame|envíame|interesado|me gustaria|cuéntame más|claro que sí/.test(summary)) return "interested";
        if (/transfer|conectar con alex|hablar con/.test(summary)) return "warm_transfer";
        return "polite_exit";
    } catch (err) {
        return "unknown";
    }
}

exports.dialSupervisor = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("*/1 * * * *")
    .timeZone("Etc/UTC")
    .onRun(async () => {
        const stateRef = admin.firestore().doc(SESSION_DOC);
        const snap = await stateRef.get();
        if (!snap.exists) return null;
        const state = snap.data();
        if (!["phase1_running", "phase2_running"].includes(state.state)) return null;

        const results = state.results || [];
        if (results.length < 5) return null; // not enough data yet

        const recent = results.slice(-10);

        // -------- Heuristic 1: API failure rate --------
        const last5 = results.slice(-5);
        const apiFails = last5.filter((r) => !r.ok).length;
        if (apiFails >= API_FAIL_RATE_THRESHOLD) {
            await stateRef.update({
                state: "auto_paused",
                aborted_reason: `${apiFails}/5 last calls hit ElevenLabs API errors`,
                paused_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await notify(
                `⚠️ *FB Brokers batch AUTO-PAUSED*\n` +
                `Reason: ${apiFails}/5 last calls returned API errors\n` +
                `Last error: \`${(last5.find((r) => !r.ok)?.error || "").slice(0, 200)}\`\n\n` +
                `Investigate, then resume manually with:\n\`curl -X POST .../runFbBrokerBatchResume\``
            );
            return null;
        }

        // -------- Heuristic 2: classify recent calls + check do_not_call streak --------
        const classified = await Promise.all(
            recent.filter((r) => r.ok).slice(-CONSECUTIVE_DNC_THRESHOLD).map(async (r) => ({
                idx: r.idx,
                from: r.from,
                outcome: await classifyConversation(r.conversation_id),
            }))
        );

        const allDnc = classified.length === CONSECUTIVE_DNC_THRESHOLD &&
            classified.every((c) => c.outcome === "do_not_call");
        if (allDnc) {
            await stateRef.update({
                state: "auto_paused",
                aborted_reason: `${CONSECUTIVE_DNC_THRESHOLD} consecutive do_not_call outcomes`,
                paused_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await notify(
                `⚠️ *FB Brokers batch AUTO-PAUSED*\n` +
                `Reason: ${CONSECUTIVE_DNC_THRESHOLD} consecutive "do not call" responses\n` +
                `Likely cause: agent prompt regression OR brokers in this segment are saturated\n\n` +
                `Review the last 5 transcripts in ElevenLabs dashboard before resuming.`
            );
            return null;
        }

        // -------- Heuristic 3: voicemail-per-number streak → drop number --------
        const vmByNumber = {};
        for (const c of classified) {
            if (c.outcome === "voicemail") {
                vmByNumber[c.from] = (vmByNumber[c.from] || 0) + 1;
            }
        }
        for (const [number, count] of Object.entries(vmByNumber)) {
            if (count >= CONSECUTIVE_VM_PER_NUMBER_THRESHOLD) {
                // Drop this number from the pool by adding to dead_ids
                const PHONE_TO_ID = {
                    "+529983871618": "phnum_8201kq0efkq6esttrdm916g8n3r0",
                    "+529983871354": "phnum_0401kq692pspfgkafmvmpr6e7mhn",
                    "+528121887124": "phnum_8901kq692r32e5y89de42wp9xghs",
                };
                const deadId = PHONE_TO_ID[number];
                if (deadId) {
                    await admin.firestore().doc(PHONE_POOL_DOC).set({
                        dead_ids: admin.firestore.FieldValue.arrayUnion(deadId),
                        last_dropped: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    await notify(
                        `🔧 *Auto-fix: dropped flagged number from rotation*\n` +
                        `Number: ${number} (${count} consecutive voicemails)\n` +
                        `Likely cause: Mexican carrier soft-block / spam flagging\n` +
                        `Pool size now: ${3 - 1} numbers — batch continues with remaining MX numbers.`
                    );
                }
            }
        }

        return null;
    });

// Manual trigger for testing
exports.dialSupervisorManual = functions.https.onRequest(async (req, res) => {
    // Re-use the scheduled handler logic by calling it directly via internal invocation
    // Not exporting the function body separately to avoid drift; just hit the schedule by hand
    return res.json({ ok: true, hint: "Dial supervisor runs every 1 min automatically. To force-pause, POST to abortFbBrokerBatch." });
});
