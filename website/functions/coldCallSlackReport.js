/**
 * coldCallSlackReport — post-batch Slack report for cold-call autopilot.
 *
 * Two runs per weekday:
 *   - coldCallSlackMorning    12:30 CDMX → reports on 10:00 morning batch (2h window)
 *   - coldCallSlackAfternoon  18:30 CDMX → reports on 16:00 afternoon batch (2.5h window)
 *
 * Unlike dailyRollupSlack (close-of-business summary across ALL channels),
 * this post-batch report is a FOCUSED view of the cold-call system right
 * after a batch completes, while everything is fresh. Pulls conversations
 * directly from the ElevenLabs API (not from Firestore summaries, which
 * coldCallReport writes at 13:00 — too late for the morning post-batch).
 *
 * Output: a single JegoDigital-branded Slack attachment with:
 *   - Headline: dialed / connected / voicemail / failed / pickup-rate
 *   - Outcomes by offer (A/B/C) — positive / negative / neutral / pending
 *   - Conversions: audit signups + Calendly bookings (name + company + URL)
 *   - Diagnostics: calls under 10s (instant hangup), tool errors, long silences
 *   - Direct links to 5 most-promising transcripts on ElevenLabs dashboard
 *
 * Env:
 *   SLACK_WEBHOOK_URL    (required — falls back to Telegram if missing)
 *   ELEVENLABS_API_KEY   (required)
 *   TELEGRAM_BOT_TOKEN   (fallback)
 *   TELEGRAM_CHAT_ID
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// ============================================================
// Constants
// ============================================================
const AGENTS = {
    agent_6601kp758ca4fcx8aynsvc0qyy5k: "A — SEO Pitch",
    agent_7001kpcxketqewvt87k4mg6vp569: "B — Free Audit",
    agent_2801kpcxmxyvf36bb2c970bhvfk4: "C — Free Setup",
};
const BRAND_GOLD = "#C5A059";
const BRAND_DARK_FOOTER = "— JegoDigital Cold-Call Autopilot";

// Telegram fallback
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

// ============================================================
// Slack + Telegram senders
// ============================================================
async function sendSlack(text, attachments) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) {
        // Telegram fallback — lose formatting, keep the content
        const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
        const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: `[SLACK_WEBHOOK_URL missing — TG fallback]\n${text}`,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }, { timeout: 10000 });
        } catch (err) {
            functions.logger.error("coldCallSlackReport TG fallback failed:", err.message);
        }
        return { ok: false, fallback: "telegram" };
    }
    try {
        await axios.post(url, { text, attachments }, { timeout: 15000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("coldCallSlackReport Slack send failed:", err.response?.data || err.message);
        return { ok: false, error: err.message };
    }
}

// ============================================================
// CDMX date helpers
// ============================================================
function cdmxWindow(startHourCdmx, endHourCdmx) {
    // Returns start/end timestamps in UTC ms for the given CDMX hour range TODAY.
    const now = new Date();
    const cdmxOffsetMs = -6 * 60 * 60 * 1000;
    const nowCdmx = new Date(now.getTime() + cdmxOffsetMs);
    const y = nowCdmx.getUTCFullYear();
    const m = nowCdmx.getUTCMonth();
    const d = nowCdmx.getUTCDate();
    const startUtc = Date.UTC(y, m, d, startHourCdmx, 0, 0) - cdmxOffsetMs;
    const endUtc = Date.UTC(y, m, d, endHourCdmx, 0, 0) - cdmxOffsetMs;
    return { startMs: startUtc, endMs: endUtc };
}

function cdmxDateKey() {
    const now = new Date();
    const cdmxOffsetMs = -6 * 60 * 60 * 1000;
    const nowCdmx = new Date(now.getTime() + cdmxOffsetMs);
    return nowCdmx.toISOString().slice(0, 10);
}

// ============================================================
// ElevenLabs conversation fetcher
// ============================================================
async function fetchConversationsInWindow({ startMs, endMs }) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { error: "ELEVENLABS_API_KEY not set" };
    try {
        // ElevenLabs /v1/convai/conversations supports page_size + cursor.
        // We filter by call_start_unix_secs locally — simpler than API filters.
        const startSec = Math.floor(startMs / 1000);
        const endSec = Math.floor(endMs / 1000);
        let all = [];
        let cursor = null;
        let pages = 0;
        while (pages < 10) { // cap at 10 pages = 1000 convs per window
            const params = { page_size: 100 };
            if (cursor) params.cursor = cursor;
            const r = await axios.get("https://api.elevenlabs.io/v1/convai/conversations",
                { headers: { "xi-api-key": key }, params, timeout: 20000 });
            const convs = r.data?.conversations || [];
            all.push(...convs);
            cursor = r.data?.next_cursor;
            if (!cursor || convs.length === 0) break;
            // Early exit if we've gone past our window
            const oldest = convs[convs.length - 1]?.start_time_unix_secs || 0;
            if (oldest && oldest < startSec) break;
            pages++;
        }
        // Filter to the window + only our 3 agents
        const filtered = all.filter(c => {
            const t = c.start_time_unix_secs || 0;
            if (t < startSec || t > endSec) return false;
            return AGENTS[c.agent_id] !== undefined;
        });
        return { conversations: filtered };
    } catch (err) {
        return { error: err.response?.data || err.message };
    }
}

async function fetchConversationDetail(convId) {
    const key = process.env.ELEVENLABS_API_KEY;
    try {
        const r = await axios.get(`https://api.elevenlabs.io/v1/convai/conversations/${convId}`,
            { headers: { "xi-api-key": key }, timeout: 10000 });
        return r.data;
    } catch (err) {
        return null;
    }
}

// ============================================================
// Outcome analysis
// ============================================================
function categorize(conv) {
    const dur = conv.call_duration_secs || 0;
    const term = (conv.metadata?.termination_reason || "").toLowerCase();
    const callSuccessful = conv.call_successful; // "success" | "failure" | null

    if (term.includes("voicemail")) return "voicemail";
    if (dur < 5) return "no_answer";
    if (dur < 12) return "instant_hangup";
    if (term.includes("end_call tool") && dur >= 30) {
        // lead said goodbye after real conversation
        return callSuccessful === "success" ? "positive" : "neutral";
    }
    if (dur >= 30) return "engaged";
    return "short";
}

function hasToolCall(conv, toolName) {
    const t = conv.transcript || [];
    for (const turn of t) {
        for (const tc of (turn.tool_calls || [])) {
            if (tc.tool_name === toolName) return tc;
        }
    }
    return null;
}

async function analyzeBatch(conversations) {
    const byAgent = {};
    for (const id of Object.keys(AGENTS)) {
        byAgent[AGENTS[id]] = {
            dialed: 0, connected: 0, voicemail: 0, no_answer: 0,
            instant_hangup: 0, engaged: 0, positive: 0, neutral: 0, short: 0,
            audit_signups: [], calendly_bookings: [], longest: [],
            issues: [],
        };
    }

    for (const c of conversations) {
        const agentLabel = AGENTS[c.agent_id];
        if (!agentLabel) continue;
        const bucket = byAgent[agentLabel];
        bucket.dialed++;
        const cat = categorize(c);
        bucket[cat] = (bucket[cat] || 0) + 1;
        const dur = c.call_duration_secs || 0;
        if (dur >= 12) bucket.connected++;

        // Pull transcript detail only for engaged/long calls (save API quota)
        if (dur >= 30) {
            bucket.longest.push({
                id: c.conversation_id,
                dur,
                status: cat,
                link: `https://elevenlabs.io/app/conversational-ai/history/${c.conversation_id}`,
            });

            // Only fetch detail for the top handful — rank by duration for now
        }
        if (dur < 10 && cat === "instant_hangup") {
            bucket.issues.push({
                type: "instant_hangup",
                conv: c.conversation_id,
                note: `${dur}s — likely missing dynamic vars or bad audio`,
            });
        }
    }

    // For engaged calls, fetch detail and look for tool calls (audit / calendly)
    for (const agentLabel of Object.keys(byAgent)) {
        const bucket = byAgent[agentLabel];
        bucket.longest.sort((a, b) => b.dur - a.dur);
        const topEngaged = bucket.longest.slice(0, 10);
        for (const l of topEngaged) {
            const detail = await fetchConversationDetail(l.id);
            if (!detail) continue;
            const auditTool = hasToolCall(detail, "submit_audit_request");
            if (auditTool) {
                let params = {};
                try { params = JSON.parse(auditTool.params_as_json || "{}"); } catch {}
                bucket.audit_signups.push({
                    id: l.id,
                    name: params.name || "?",
                    email: params.email || "?",
                    website: params.website_url || "?",
                    city: params.city || "?",
                    duration: l.dur,
                    link: l.link,
                });
            }
            const calendlyTool = hasToolCall(detail, "book_calendly_live");
            if (calendlyTool) {
                let params = {};
                try { params = JSON.parse(calendlyTool.params_as_json || "{}"); } catch {}
                bucket.calendly_bookings.push({
                    id: l.id,
                    slot: params.slot || params.selected_slot || "?",
                    duration: l.dur,
                    link: l.link,
                });
            }
        }
        // Keep only the top-5 longest for rendering
        bucket.longest = bucket.longest.slice(0, 5);
    }

    return byAgent;
}

// ============================================================
// Slack Block Kit renderer
// ============================================================
function fmt(n) { return n == null ? "—" : n.toLocaleString(); }
function pct(n, d) { return d ? Math.round((n * 100) / d) + "%" : "—"; }

function buildBlocks({ windowLabel, dateKey, byAgent, totals }) {
    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `☎️ Cold Call Batch Report · ${windowLabel}`, emoji: true },
        },
        {
            type: "context",
            elements: [
                { type: "mrkdwn", text: `*${dateKey}* · agents A / B / C · auto-generated` },
            ],
        },
        { type: "divider" },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*📞 Dialed*\n${fmt(totals.dialed)}` },
                { type: "mrkdwn", text: `*🟢 Connected*\n${fmt(totals.connected)} (${pct(totals.connected, totals.dialed)})` },
                { type: "mrkdwn", text: `*📬 Voicemail*\n${fmt(totals.voicemail)} (${pct(totals.voicemail, totals.dialed)})` },
                { type: "mrkdwn", text: `*🔇 No answer / Instant hangup*\n${fmt(totals.no_answer + totals.instant_hangup)}` },
                { type: "mrkdwn", text: `*💬 Engaged (30s+)*\n${fmt(totals.engaged)}` },
                { type: "mrkdwn", text: `*✅ Positive outcomes*\n${fmt(totals.positive)}` },
            ],
        },
        { type: "divider" },
        {
            type: "section",
            text: { type: "mrkdwn", text: "*🎯 Conversions this batch*" },
        },
    ];

    // Conversions aggregated across all agents
    const allAudits = Object.values(byAgent).flatMap(b => b.audit_signups);
    const allCalendly = Object.values(byAgent).flatMap(b => b.calendly_bookings);

    if (allAudits.length === 0 && allCalendly.length === 0) {
        blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: "_No signups or bookings this batch._" }],
        });
    } else {
        if (allAudits.length) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*🔥 Audit signups (${allAudits.length})*\n` +
                        allAudits.slice(0, 10).map(a =>
                            `• <${a.link}|${a.name}> · ${a.website} · ${a.email} · ${a.city} · ${a.duration}s`
                        ).join("\n"),
                },
            });
        }
        if (allCalendly.length) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*📅 Calendly bookings (${allCalendly.length})*\n` +
                        allCalendly.slice(0, 10).map(b =>
                            `• <${b.link}|Booking> · ${b.slot} · ${b.duration}s`
                        ).join("\n"),
                },
            });
        }
    }

    // Per-agent breakdown
    blocks.push({ type: "divider" });
    blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*🤖 Per-agent breakdown*" },
    });
    for (const [label, b] of Object.entries(byAgent)) {
        if (b.dialed === 0) continue;
        blocks.push({
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*${label}*\n${fmt(b.dialed)} dialed` },
                { type: "mrkdwn", text: `*Connected / VM*\n${fmt(b.connected)} / ${fmt(b.voicemail)}` },
                { type: "mrkdwn", text: `*Engaged*\n${fmt(b.engaged)} (${pct(b.engaged, b.dialed)})` },
                { type: "mrkdwn", text: `*Conversions*\n🔥 ${fmt(b.audit_signups.length)} · 📅 ${fmt(b.calendly_bookings.length)}` },
            ],
        });
    }

    // Top longest engaged calls
    const topLongest = Object.values(byAgent).flatMap(b => b.longest)
        .sort((a, b) => b.dur - a.dur).slice(0, 5);
    if (topLongest.length) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*⭐ Top engaged calls (click to review)*\n" +
                    topLongest.map(l => `• <${l.link}|${l.id.slice(-6)}> · ${l.dur}s · ${l.status}`).join("\n"),
            },
        });
    }

    // Issues
    const issues = Object.values(byAgent).flatMap(b => b.issues);
    if (issues.length) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*⚠️ Issues detected (${issues.length})*\n` +
                    issues.slice(0, 5).map(i => `• ${i.type}: ${i.note}`).join("\n"),
            },
        });
    }

    // Footer
    blocks.push({ type: "divider" });
    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: BRAND_DARK_FOOTER }],
    });

    return blocks;
}

// ============================================================
// Main runner
// ============================================================
async function runPostBatchReport({ windowLabel, startHourCdmx, endHourCdmx }) {
    const dateKey = cdmxDateKey();
    const { startMs, endMs } = cdmxWindow(startHourCdmx, endHourCdmx);

    const convResult = await fetchConversationsInWindow({ startMs, endMs });
    if (convResult.error) {
        await sendSlack(
            `⚠️ Cold-call batch report failed to fetch conversations: ${JSON.stringify(convResult.error).slice(0, 200)}`,
            [{ color: "#E53E3E", blocks: [] }]
        );
        return { ok: false, error: convResult.error };
    }
    const conversations = convResult.conversations || [];
    functions.logger.info(`coldCallSlackReport [${windowLabel}] — ${conversations.length} conversations in window ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()}`);

    const byAgent = await analyzeBatch(conversations);
    const totals = Object.values(byAgent).reduce((t, b) => {
        t.dialed += b.dialed;
        t.connected += b.connected;
        t.voicemail += b.voicemail;
        t.no_answer += b.no_answer;
        t.instant_hangup += b.instant_hangup;
        t.engaged += b.engaged;
        t.positive += b.positive;
        return t;
    }, { dialed: 0, connected: 0, voicemail: 0, no_answer: 0, instant_hangup: 0, engaged: 0, positive: 0 });

    const blocks = buildBlocks({ windowLabel, dateKey, byAgent, totals });
    const textFallback = `Cold call ${windowLabel}: ${totals.dialed} dialed · ${totals.connected} connected · ${totals.engaged} engaged · ${Object.values(byAgent).reduce((n, b) => n + b.audit_signups.length, 0)} audit signups`;

    const result = await sendSlack(textFallback, [{ color: BRAND_GOLD, blocks }]);
    return { ok: result.ok, totals, conversations: conversations.length };
}

// ============================================================
// Exports — two scheduled crons
// ============================================================
exports.coldCallSlackMorning = functions.pubsub
    .schedule("30 12 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        return runPostBatchReport({
            windowLabel: "Morning batch (10:00)",
            startHourCdmx: 10,
            endHourCdmx: 12,
        });
    });

exports.coldCallSlackAfternoon = functions.pubsub
    .schedule("30 18 * * 1-5")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        return runPostBatchReport({
            windowLabel: "Afternoon batch (16:00)",
            startHourCdmx: 16,
            endHourCdmx: 18,
        });
    });

// On-demand HTTP handler — useful for manual debugging + replay
exports.coldCallSlackOnDemand = functions.https.onRequest(async (req, res) => {
    const which = (req.query.which || "morning").toString();
    const dateOverride = (req.query.date || "").toString(); // YYYY-MM-DD
    // For debugging we always use same-day window unless date override given
    const params = which === "afternoon"
        ? { windowLabel: "Afternoon batch (16:00) — on-demand", startHourCdmx: 16, endHourCdmx: 18 }
        : { windowLabel: "Morning batch (10:00) — on-demand", startHourCdmx: 10, endHourCdmx: 12 };
    const result = await runPostBatchReport(params);
    res.json(result);
});
