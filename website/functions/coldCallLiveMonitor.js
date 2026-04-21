/**
 * coldCallLiveMonitor — real-time mid-batch quality watcher.
 *
 * Runs every 3 min during the morning + afternoon cold-call windows
 * (09:55-11:35 CDMX and 15:55-17:35 CDMX, weekdays). Pulls the most
 * recent conversations from ElevenLabs for all 3 agents (A/B/C) and
 * detects four failure modes IN-FLIGHT, before tomorrow's report:
 *
 *   1. Instant hangup wave  — ≥3 calls in last 6 min ended <8s
 *      (likely a TTS/agent loading regression — abort batch)
 *   2. Tool failures        — submit_audit_request returned non-2xx,
 *      or fired with website_url that fails URL validation regex
 *      (agent reverting to company-name confusion)
 *   3. Voicemail >70%       — pickup-rate collapse (lead-list bad,
 *      Twilio caller-id flagged, time-of-day wrong)
 *   4. Agent loop / silence — call >120s with <30 transcript chars,
 *      or agent_message repeated verbatim ≥3x (LLM stuck)
 *
 * On detection: posts a SHORT diagnostic Telegram alert (critical=true,
 * so SMS fallback fires too) with the specific conv_id + suggested fix.
 * Idempotent — uses Firestore `live_monitor_alerts` to dedupe so the
 * same issue doesn't alert every 3 min.
 *
 * Read-only on the cold-call system itself: never aborts a batch
 * automatically. Goal is to put the issue in front of Alex within
 * 6 min of it surfacing so he can pause the run before it burns
 * through 50 leads' worth of credits.
 *
 * Env:
 *   ELEVENLABS_API_KEY   (required)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   TWILIO_*             (SMS fallback via telegramHelper)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { notify } = require("./telegramHelper");

// ============================================================
// Constants
// ============================================================
const AGENTS = {
    agent_6601kp758ca4fcx8aynsvc0qyy5k: "A — SEO Pitch",
    agent_7001kpcxketqewvt87k4mg6vp569: "B — Free Audit",
    agent_2801kpcxmxyvf36bb2c970bhvfk4: "C — Free Setup",
};

const ELEVENLABS_BASE = "https://api.elevenlabs.io";
const LOOKBACK_MIN = 6;          // window for "recent" conversations
const INSTANT_HANGUP_S = 8;      // <8s = instant hangup
const INSTANT_HANGUP_THRESH = 3; // ≥3 in 6 min = wave
const VOICEMAIL_RATIO = 0.7;     // >70% voicemail = bad
const VOICEMAIL_MIN_CALLS = 6;   // need at least N to call it a trend
const STUCK_AGENT_S = 120;       // >2min
const STUCK_AGENT_CHARS = 30;    // <30 transcript chars
const REPEATED_MSG_THRESH = 3;   // same agent line ≥3x = loop

// website_url validation — same regex as submitAuditRequest backstop
function isLikelyDomain(s) {
    if (!s || typeof s !== "string") return false;
    const t = s.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
    return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+\.[a-z]{2,24}$/i.test(t)
        || /^[a-z0-9][a-z0-9-]*\.[a-z]{2,24}$/i.test(t);
}

// ============================================================
// ElevenLabs API
// ============================================================
async function listRecentConversations(agentId, sinceUnixMs) {
    try {
        const r = await axios.get(`${ELEVENLABS_BASE}/v1/convai/conversations`, {
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
            params: { agent_id: agentId, page_size: 30 },
            timeout: 15000,
        });
        const list = r.data?.conversations || [];
        // Filter to last N min
        return list.filter((c) => {
            const t = (c.start_time_unix_secs || 0) * 1000;
            return t >= sinceUnixMs;
        });
    } catch (err) {
        functions.logger.warn(`listRecentConversations(${agentId}) failed: ${err.message}`);
        return [];
    }
}

async function getConversation(convId) {
    try {
        const r = await axios.get(`${ELEVENLABS_BASE}/v1/convai/conversations/${convId}`, {
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
            timeout: 15000,
        });
        return r.data;
    } catch (err) {
        functions.logger.warn(`getConversation(${convId}) failed: ${err.message}`);
        return null;
    }
}

// ============================================================
// Detectors
// ============================================================
function detectInstantHangups(conversations) {
    // conversations is the merged-across-agents list of summary objects
    const short = conversations.filter((c) => {
        const dur = c.call_duration_secs || c.metadata?.call_duration_secs || 0;
        const status = c.status || c.metadata?.status;
        // only count completed (not still in-progress)
        return dur > 0 && dur < INSTANT_HANGUP_S && status !== "in-progress";
    });
    if (short.length < INSTANT_HANGUP_THRESH) return null;
    return {
        type: "instant_hangup_wave",
        count: short.length,
        sample: short.slice(0, 3).map((c) => c.conversation_id),
        recommendation: "Likely TTS/agent loading regression. Verify agent is reachable in dashboard. Consider pausing batch.",
    };
}

function detectVoicemailFlood(conversations) {
    if (conversations.length < VOICEMAIL_MIN_CALLS) return null;
    // ElevenLabs marks voicemails via call_successful or transcript heuristics.
    // We use duration + analysis hint: voicemail typically 25-90s with no human reply turns.
    const vm = conversations.filter((c) => {
        const dur = c.call_duration_secs || c.metadata?.call_duration_secs || 0;
        const successful = c.call_successful;
        // Heuristic: 20-100s call but marked unsuccessful = likely voicemail
        return dur >= 20 && dur <= 100 && successful === "failure";
    });
    const ratio = vm.length / conversations.length;
    if (ratio < VOICEMAIL_RATIO) return null;
    return {
        type: "voicemail_flood",
        count: vm.length,
        total: conversations.length,
        ratio: Math.round(ratio * 100),
        recommendation: "Pickup-rate collapse. Check Twilio caller-id reputation, or the lead list quality.",
    };
}

async function inspectConversationDetail(convId) {
    const det = await getConversation(convId);
    if (!det) return [];
    const issues = [];
    const transcript = det.transcript || [];
    const dur = det.metadata?.call_duration_secs || det.call_duration_secs || 0;

    // Stuck agent / silence
    if (dur > STUCK_AGENT_S) {
        const transcriptText = transcript.map((t) => t.message || "").join(" ");
        if (transcriptText.length < STUCK_AGENT_CHARS) {
            issues.push({
                type: "stuck_silence",
                conv: convId,
                duration: dur,
                recommendation: "Long call with empty transcript — agent may be stuck or audio routing broken.",
            });
        }
    }

    // Repeated agent message (loop)
    const agentMsgs = transcript.filter((t) => t.role === "agent").map((t) => (t.message || "").trim());
    const counts = {};
    for (const m of agentMsgs) {
        if (m.length < 10) continue; // skip filler
        counts[m] = (counts[m] || 0) + 1;
    }
    const looped = Object.entries(counts).find(([, n]) => n >= REPEATED_MSG_THRESH);
    if (looped) {
        issues.push({
            type: "agent_loop",
            conv: convId,
            line: looped[0].slice(0, 80),
            count: looped[1],
            recommendation: "Agent repeated same line ≥3×. Likely LLM stuck or context overflow. Check prompt for ambiguity.",
        });
    }

    // Tool call failures (submit_audit_request)
    for (const turn of transcript) {
        const calls = turn.tool_calls || [];
        for (const tc of calls) {
            if (tc.tool_name !== "submit_audit_request") continue;
            const params = (() => {
                try { return typeof tc.params_as_json === "string" ? JSON.parse(tc.params_as_json) : (tc.params_as_json || {}); }
                catch { return {}; }
            })();
            const url = params.website_url;
            if (url && !isLikelyDomain(url)) {
                issues.push({
                    type: "tool_bad_url",
                    conv: convId,
                    url,
                    recommendation: "Agent passed non-domain to website_url (likely company name). Tighten agent prompt — see patch_all_3_agents.cjs URL_RULE_BLOCK.",
                });
            }
            // Check tool result status if available
            const resultStr = tc.result_value || tc.result || "";
            if (typeof resultStr === "string" && /\b5\d\d\b|\b4\d\d\b/.test(resultStr.slice(0, 200)) && !/200/.test(resultStr.slice(0, 200))) {
                issues.push({
                    type: "tool_http_error",
                    conv: convId,
                    snippet: resultStr.slice(0, 120),
                    recommendation: "submit_audit_request Cloud Function returned non-2xx. Check logs at functions:submitAuditRequest.",
                });
            }
        }
    }

    return issues;
}

// ============================================================
// Dedup
// ============================================================
async function alreadyAlerted(db, key) {
    const ref = db.collection("live_monitor_alerts").doc(key);
    const doc = await ref.get();
    if (doc.exists) return true;
    await ref.set({
        firstAlertedAt: admin.firestore.FieldValue.serverTimestamp(),
        key,
    });
    return false;
}

// ============================================================
// Cron — every 3 min, but bail outside the call windows.
// Schedule "*/3 * * * 1-5" (every 3 min, weekdays). We gate by
// CDMX local hour to keep cost low (~36 invocations/window/day).
// ============================================================
function inCallWindow() {
    // Compute CDMX local hour. CDMX = UTC-6 year-round (no DST since 2022).
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    const cdmxMin = (utcHour * 60 + utcMin - 6 * 60 + 24 * 60) % (24 * 60);
    const cdmxHour = Math.floor(cdmxMin / 60);
    const cdmxMinOfHour = cdmxMin % 60;
    // Morning window: 09:55-11:35
    if (cdmxHour === 9 && cdmxMinOfHour >= 55) return true;
    if (cdmxHour === 10) return true;
    if (cdmxHour === 11 && cdmxMinOfHour <= 35) return true;
    // Afternoon window: 15:55-17:35
    if (cdmxHour === 15 && cdmxMinOfHour >= 55) return true;
    if (cdmxHour === 16) return true;
    if (cdmxHour === 17 && cdmxMinOfHour <= 35) return true;
    return false;
}

exports.coldCallLiveMonitor = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("*/3 * * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        if (!inCallWindow()) {
            return null; // outside batch windows — silently skip
        }

        const db = admin.firestore();
        const sinceMs = Date.now() - LOOKBACK_MIN * 60 * 1000;

        // Pull recent conversations across all 3 agents
        const allConvs = [];
        for (const agentId of Object.keys(AGENTS)) {
            const list = await listRecentConversations(agentId, sinceMs);
            list.forEach((c) => allConvs.push({ ...c, _agentId: agentId, _agentLabel: AGENTS[agentId] }));
        }

        if (allConvs.length === 0) {
            functions.logger.info("coldCallLiveMonitor: no recent conversations in window");
            return null;
        }

        functions.logger.info(`coldCallLiveMonitor: inspecting ${allConvs.length} convs from last ${LOOKBACK_MIN}min`);

        const alerts = [];

        // Aggregate detectors
        const hangup = detectInstantHangups(allConvs);
        if (hangup) alerts.push(hangup);
        const vm = detectVoicemailFlood(allConvs);
        if (vm) alerts.push(vm);

        // Per-conversation deep inspection — only conversations >60s
        // (instant hangups don't have a transcript worth inspecting).
        const inspectables = allConvs.filter((c) => (c.call_duration_secs || 0) > 60).slice(0, 10);
        for (const c of inspectables) {
            const issues = await inspectConversationDetail(c.conversation_id);
            issues.forEach((i) => alerts.push({ ...i, agentLabel: c._agentLabel }));
        }

        if (alerts.length === 0) {
            functions.logger.info("coldCallLiveMonitor: all clear");
            return null;
        }

        // Dedup + send
        const today = new Date().toISOString().slice(0, 10);
        for (const a of alerts) {
            const dedupKey = `${today}_${a.type}_${a.conv || a.sample?.[0] || "global"}`;
            if (await alreadyAlerted(db, dedupKey)) continue;

            const lines = [
                `🚨 *Cold-Call Live Monitor* — issue detected`,
                `*Type:* \`${a.type}\``,
            ];
            if (a.agentLabel) lines.push(`*Agent:* ${a.agentLabel}`);
            if (a.conv) lines.push(`*Conv:* https://elevenlabs.io/app/conversational-ai/conversation/${a.conv}`);
            if (a.count !== undefined) lines.push(`*Count:* ${a.count}${a.total ? `/${a.total}` : ""}`);
            if (a.ratio !== undefined) lines.push(`*Voicemail ratio:* ${a.ratio}%`);
            if (a.url) lines.push(`*Bad URL passed:* \`${a.url}\``);
            if (a.line) lines.push(`*Repeated line:* "${a.line}"`);
            if (a.duration) lines.push(`*Duration:* ${a.duration}s`);
            if (a.snippet) lines.push(`*Snippet:* \`${a.snippet}\``);
            if (a.sample) lines.push(`*Samples:* ${a.sample.join(", ")}`);
            lines.push("");
            lines.push(`💡 ${a.recommendation}`);

            await notify(lines.join("\n"), { critical: true });
        }

        return null;
    });
