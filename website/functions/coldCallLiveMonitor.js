/**
 * coldCallLiveMonitor — heartbeat watchdog during cold-call batches.
 *
 * Cron: every 3 min, 24/7, but only acts during call windows:
 *   Morning   10:00–13:00 CDMX
 *   Afternoon 16:00–19:00 CDMX
 * Outside the windows the function returns immediately (cheap no-op).
 *
 * What it watches:
 *   1. Failure spike — failed/(dialed+failed) > 30% with ≥10 attempts → Telegram alarm
 *   2. Stall — last `dialed_at` older than 8 minutes mid-window → Telegram alarm
 *   3. Pending backlog — call_analysis pending count > 25 → log warning (webhook lag)
 *
 * Anti-spam: writes a heartbeat doc per 30-min slot. Same alarm in same slot
 * fires once (not every 3 min).
 *
 * Design rule (per Alex 2026-04-20, feedback_no_approve_gates): no auto-pause,
 * no auto-abort. Just rich telemetry — Alex decides whether to kill the batch.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const FAILURE_RATE_THRESHOLD = 0.30;     // 30%
const FAILURE_MIN_ATTEMPTS = 10;
const STALL_MINUTES = 8;
const PENDING_BACKLOG_THRESHOLD = 25;

function cdmxNow() {
    const now = new Date();
    return new Date(now.getTime() - 6 * 60 * 60 * 1000); // CDMX = UTC-6
}
function cdmxTodayKey() {
    return cdmxNow().toISOString().slice(0, 10);
}
function cdmxHour() {
    return cdmxNow().getUTCHours();
}
function cdmxSlotKey() {
    // 30-min anti-spam slot (e.g. "2026-04-21_10:00", "2026-04-21_10:30")
    const d = cdmxNow();
    const day = d.toISOString().slice(0, 10);
    const half = d.getUTCMinutes() < 30 ? "00" : "30";
    return `${day}_${String(d.getUTCHours()).padStart(2, "0")}:${half}`;
}

function inCallWindow() {
    const h = cdmxHour();
    return (h >= 10 && h < 13) || (h >= 16 && h < 19);
}

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("coldCallLiveMonitor Telegram failed:", err.message);
        return { ok: false };
    }
}

/**
 * Has this alarm key already fired in this 30-min slot?
 * Returns true if firing should be skipped.
 */
async function alreadyAlarmed(db, slotKey, alarmKey) {
    const ref = db.collection("cold_call_monitor_alarms").doc(slotKey);
    const snap = await ref.get();
    if (snap.exists && (snap.data().fired || []).includes(alarmKey)) return true;

    const fired = snap.exists ? (snap.data().fired || []) : [];
    fired.push(alarmKey);
    await ref.set({
        slot: slotKey,
        fired,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return false;
}

exports.coldCallLiveMonitor = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("*/3 * * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        if (!inCallWindow()) {
            functions.logger.debug(`coldCallLiveMonitor: outside window (h=${cdmxHour()}), no-op`);
            return null;
        }

        const db = admin.firestore();
        const dateKey = cdmxTodayKey();
        const slotKey = cdmxSlotKey();

        const queueSnap = await db.collection("call_queue").doc(dateKey).collection("leads").get();
        if (queueSnap.empty) {
            functions.logger.info(`coldCallLiveMonitor ${dateKey}: queue empty, skip`);
            return null;
        }

        let dialed = 0, failed = 0, queued = 0;
        let lastDialedAt = null;
        const failSamples = [];

        queueSnap.forEach((doc) => {
            const d = doc.data();
            if (d.status === "dialed") dialed++;
            if (d.status === "failed") {
                failed++;
                if (failSamples.length < 3) {
                    failSamples.push(`${d.name || doc.id}: ${(d.error || "?").toString().slice(0, 60)}`);
                }
            }
            if (d.status === "queued") queued++;
            if (d.dialed_at && d.dialed_at.toDate) {
                const t = d.dialed_at.toDate();
                if (!lastDialedAt || t > lastDialedAt) lastDialedAt = t;
            }
        });

        const attempts = dialed + failed;
        const failRate = attempts > 0 ? failed / attempts : 0;

        // --- Alarm 1: failure spike ---
        if (attempts >= FAILURE_MIN_ATTEMPTS && failRate > FAILURE_RATE_THRESHOLD) {
            const alarmKey = "failure_spike";
            if (!(await alreadyAlarmed(db, slotKey, alarmKey))) {
                const lines = [
                    `🚨 *coldCallLiveMonitor ${slotKey}* — FAILURE SPIKE`,
                    `   Attempts: ${attempts} · Failed: *${failed}* (${(failRate * 100).toFixed(0)}%)`,
                    `   Threshold: ${(FAILURE_RATE_THRESHOLD * 100).toFixed(0)}%`,
                    "",
                    "_First failures:_",
                    ...failSamples.map((s) => `   • ${s}`),
                    "",
                    "Inspect ElevenLabs credits / Twilio status / agent prompt.",
                ];
                await sendTelegram(lines.join("\n"));
            }
        }

        // --- Alarm 2: stall (mid-window only) ---
        const h = cdmxHour();
        const midMorning = h === 11 || h === 12;
        const midAfternoon = h === 17 || h === 18;
        if ((midMorning || midAfternoon) && lastDialedAt) {
            const ageMin = (Date.now() - lastDialedAt.getTime()) / 60000;
            if (ageMin > STALL_MINUTES && queued > 0) {
                const alarmKey = "stall";
                if (!(await alreadyAlarmed(db, slotKey, alarmKey))) {
                    const lines = [
                        `🚨 *coldCallLiveMonitor ${slotKey}* — BATCH STALLED`,
                        `   Last dialed: ${ageMin.toFixed(0)} min ago`,
                        `   Still queued: *${queued}* · Dialed: ${dialed} · Failed: ${failed}`,
                        "",
                        "Cron may have died mid-batch or ElevenLabs is rate-limiting.",
                    ];
                    await sendTelegram(lines.join("\n"));
                }
            }
        }

        // --- Alarm 3: pending backlog (warns about webhook lag, not a hard alarm) ---
        const analysisSnap = await db.collection("call_analysis")
            .where("date_key", "==", dateKey)
            .where("outcome", "==", "pending")
            .get();
        if (analysisSnap.size > PENDING_BACKLOG_THRESHOLD) {
            const alarmKey = "pending_backlog";
            if (!(await alreadyAlarmed(db, slotKey, alarmKey))) {
                functions.logger.warn(
                    `coldCallLiveMonitor ${slotKey}: ${analysisSnap.size} pending call_analysis docs ` +
                    `— elevenLabsWebhook may be lagging.`
                );
            }
        }

        // Heartbeat
        await db.collection("cold_call_monitor_heartbeats").doc(dateKey).set({
            last_run_at: admin.firestore.FieldValue.serverTimestamp(),
            last_slot: slotKey,
            dialed, failed, queued,
            fail_rate: failRate,
            last_dialed_at: lastDialedAt ? admin.firestore.Timestamp.fromDate(lastDialedAt) : null,
            pending_analysis: analysisSnap.size,
        }, { merge: true });

        functions.logger.info(
            `coldCallLiveMonitor ${slotKey}: dialed=${dialed} failed=${failed} ` +
            `queued=${queued} failRate=${(failRate * 100).toFixed(1)}% pending=${analysisSnap.size}`
        );
        return null;
    });
