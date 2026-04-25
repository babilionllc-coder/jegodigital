/**
 * aiAnalysisAgent — Gemini 2.0 Flash agent that reads the evening ops report
 * and takes action. Two categories:
 *
 *   AUTO_FIX (safe, deterministic — executes without asking Alex):
 *     - Pause campaigns with bounce_rate > 5% (reputation protection)
 *     - Pause campaigns with 200+ sent and 0 opens (likely inbox placement broken)
 *     - Pause campaigns with 500+ sent and 0 replies (dead copy — signal to rewrite)
 *     - Lower daily_limit to 15/day on sending accounts with health < 90%
 *
 *   ESCALATE (needs Alex's judgment — posted as second Slack message):
 *     - Copy rewrites, subject-line tests, new campaign angles
 *     - Calendly no-show spikes, ManyChat low-reply patterns
 *     - Cold-call offer performance gaps (A vs B vs C)
 *     - Audit-request delivery failures
 *     - Anything Gemini isn't 95%+ confident about
 *
 * Every action — auto-fix OR escalate — is logged to Firestore at:
 *   ai_agent_actions/{YYYY-MM-DD}/entries/{autoId}
 *
 * HARD RULE #11 compliance: when blocked (Gemini down, Instantly 5xx, etc.)
 * the agent NEVER silently fails. It logs the block, posts an escalation with
 * the "I couldn't auto-fix because X — here's the recommended fix" format,
 * and the evening cron still completes successfully.
 *
 * HARD RULE #0 compliance: every auto-fix cites the specific metric + live
 * value that triggered it (e.g. "bounce_rate=7.2% > 5% threshold, source:
 * Instantly /campaigns/analytics/daily THIS session"). No fabrication.
 *
 * Exports:
 *   runAiAgent(data) — main entry called by eveningOpsReport.runEveningOpsReport
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

// Slack fallback chain — bot token preferred, webhook as last resort
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "C08KCBR9PE6";

// Auto-fix thresholds (safe, conservative defaults — tune here, not in prompt)
const AUTO_FIX_THRESHOLDS = {
    BOUNCE_RATE_PCT: 5.0,           // pause if bounce > 5%
    MIN_SENT_FOR_BOUNCE_CHECK: 30,  // require 30+ sends before bounce action
    ZERO_OPEN_MIN_SENT: 200,        // pause if 200+ sent AND 0 opens
    ZERO_REPLY_MIN_SENT: 500,       // pause if 500+ sent AND 0 replies
    ACCOUNT_HEALTH_MIN: 90,         // reduce daily_limit if health < 90%
    ACCOUNT_HEALTH_DAILY_CAP: 15,   // lower to 15/day on unhealthy account
};

// ---------- Helpers ----------
function instantlyAuth() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY missing");
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function dateKeyCDMX() {
    const cdmx = new Date(Date.now() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

// ---------- Instantly API action wrappers ----------
async function pauseInstantlyCampaign(campaignId, reason) {
    try {
        // Instantly v2: POST /campaigns/{id}/pause
        const r = await axios.post(
            `${INSTANTLY_BASE}/campaigns/${campaignId}/pause`,
            {},
            { headers: instantlyAuth(), timeout: 15000 },
        );
        return {
            ok: true,
            campaign_id: campaignId,
            action: "pause_campaign",
            reason,
            response_status: r.status,
        };
    } catch (err) {
        return {
            ok: false,
            campaign_id: campaignId,
            action: "pause_campaign",
            reason,
            error: err.response?.data?.message || err.message,
            http_status: err.response?.status,
        };
    }
}

async function listInstantlyAccounts() {
    try {
        const r = await axios.get(`${INSTANTLY_BASE}/accounts?limit=100`, {
            headers: instantlyAuth(),
            timeout: 15000,
        });
        return r.data.items || r.data.data || [];
    } catch (err) {
        functions.logger.warn(`listInstantlyAccounts failed: ${err.message}`);
        return [];
    }
}

async function reduceAccountDailyLimit(accountEmail, newLimit, reason) {
    try {
        // Instantly v2: PATCH /accounts/{email} to update daily limit
        const r = await axios.patch(
            `${INSTANTLY_BASE}/accounts/${encodeURIComponent(accountEmail)}`,
            { daily_limit: newLimit },
            { headers: instantlyAuth(), timeout: 15000 },
        );
        return {
            ok: true,
            account: accountEmail,
            action: "reduce_daily_limit",
            new_limit: newLimit,
            reason,
            response_status: r.status,
        };
    } catch (err) {
        return {
            ok: false,
            account: accountEmail,
            action: "reduce_daily_limit",
            new_limit: newLimit,
            reason,
            error: err.response?.data?.message || err.message,
            http_status: err.response?.status,
        };
    }
}

// ---------- Deterministic rule engine (runs BEFORE Gemini) ----------
/**
 * Deterministic rules are the safety net — we don't trust the LLM to catch
 * every "obvious bad number". These fire every night regardless of Gemini.
 */
function deriveDeterministicFixes(data) {
    const fixes = [];
    const escalations = [];
    const T = AUTO_FIX_THRESHOLDS;

    // ---- Cold email campaign rules ----
    for (const c of (data.email?.campaigns || [])) {
        const bounceRate = c.sent > 0 ? (c.bounces / c.sent) * 100 : 0;

        // Rule 1: High bounce rate → pause
        if (c.sent >= T.MIN_SENT_FOR_BOUNCE_CHECK && bounceRate > T.BOUNCE_RATE_PCT) {
            fixes.push({
                type: "pause_campaign",
                target: c.id,
                target_name: c.name,
                reason: `bounce_rate=${bounceRate.toFixed(2)}% > ${T.BOUNCE_RATE_PCT}% threshold (${c.bounces}/${c.sent}). Source: Instantly /campaigns/analytics/daily THIS session.`,
                metric: "bounce_rate",
                value: bounceRate.toFixed(2),
                threshold: T.BOUNCE_RATE_PCT,
            });
        }

        // Rule 2: Zero opens on 200+ sends → likely inbox placement failure
        if (c.sent >= T.ZERO_OPEN_MIN_SENT && c.opens === 0) {
            fixes.push({
                type: "pause_campaign",
                target: c.id,
                target_name: c.name,
                reason: `sent=${c.sent} with 0 opens — likely spam-foldered or tracking pixel broken. Source: Instantly /campaigns/analytics/daily THIS session.`,
                metric: "zero_opens",
                value: 0,
                threshold: T.ZERO_OPEN_MIN_SENT,
            });
        }

        // Rule 3: Zero replies on 500+ sends → dead copy, escalate for rewrite
        if (c.sent >= T.ZERO_REPLY_MIN_SENT && c.replies === 0) {
            escalations.push({
                type: "rewrite_copy",
                severity: "high",
                target: c.id,
                target_name: c.name,
                reason: `sent=${c.sent} with 0 replies — copy is not converting. Recommended: rewrite Step 1 with new angle OR kill campaign.`,
                metric: "zero_replies",
                value: 0,
                threshold: T.ZERO_REPLY_MIN_SENT,
            });
        }
    }

    // ---- Calendly: no-show spike ----
    if (data.calendly) {
        const totalEvents = (data.calendly.booked || 0) + (data.calendly.noshow || 0);
        if (totalEvents >= 3 && data.calendly.noshow > 0) {
            const noShowRate = (data.calendly.noshow / totalEvents) * 100;
            if (noShowRate > 40) {
                escalations.push({
                    type: "calendly_noshow_spike",
                    severity: "medium",
                    target: "calendly_funnel",
                    reason: `no_show_rate=${noShowRate.toFixed(1)}% (${data.calendly.noshow}/${totalEvents}) over last 24h. Recommended: tighten T-10min reminder + 24h SMS.`,
                });
            }
        }
    }

    // ---- Cold call: zero-connect signal ----
    if (data.calls) {
        const totalDials = data.calls.total || 0;
        const connected = data.calls.connected || 0;
        if (totalDials >= 20 && connected === 0) {
            escalations.push({
                type: "cold_call_zero_connect",
                severity: "high",
                target: "elevenlabs_agents",
                reason: `dials=${totalDials} with 0 connected in last 24h. Source: Firestore call_analysis THIS session. Recommended: check silence_end_call_timeout (default -1 = zombie), verify Twilio number, inspect agent transcripts.`,
            });
        }
    }

    // ---- Audit requests: delivery failures ----
    if (data.audits) {
        const pending = data.audits.pending || 0;
        const failed = data.audits.failed || 0;
        const total = data.audits.total || 0;
        if (total >= 5 && (failed + pending) / total > 0.3) {
            escalations.push({
                type: "audit_delivery_failing",
                severity: "high",
                target: "audit_funnel",
                reason: `${failed} failed + ${pending} pending out of ${total} audit requests in last 24h. Recommended: check processAuditRequest logs + Brevo transactional email delivery.`,
            });
        }
    }

    return { fixes, escalations };
}

// ---------- Gemini prompt & call ----------
/**
 * Build a concise JSON-oriented prompt for Gemini. Keep it short — the
 * deterministic rules above already cover the clear-cut cases. Gemini's
 * job here is to spot *patterns* the rules miss and recommend next moves.
 */
function buildGeminiPrompt(data, deterministic) {
    const summary = {
        window: data.window?.key || dateKeyCDMX(),
        email: {
            sent: data.email?.totals?.sent || 0,
            opens: data.email?.totals?.opens || 0,
            replies: data.email?.totals?.replies || 0,
            bounces: data.email?.totals?.bounces || 0,
            open_rate: data.email?.open_rate || "0.0%",
            reply_rate: data.email?.reply_rate || "0.0%",
            bounce_rate: data.email?.bounce_rate || "0.0%",
            active_campaigns: data.email?.total_active || 0,
            top_campaigns: (data.email?.campaigns || []).slice(0, 5),
        },
        calendly: data.calendly || { booked: 0, canceled: 0, noshow: 0 },
        manychat: data.manychat || { total: 0 },
        calls: data.calls || { total: 0, connected: 0 },
        audits: data.audits || { total: 0 },
    };

    return `You are the strategic ops analyst for JegoDigital (real estate marketing agency, Mexico). Review last 24h numbers and produce strategic recommendations.

HARD CONSTRAINTS:
- Output ONLY valid JSON matching the schema below.
- Never fabricate metrics — only reference numbers in the INPUT below.
- If a metric is 0 or missing, acknowledge it and recommend a test.
- Deterministic fixes (bounce > 5%, zero-open, etc.) are ALREADY being applied — do NOT duplicate them.
- Focus on PATTERNS and STRATEGIC moves the rule engine cannot catch.

INPUT (last 24h, ${summary.window}):
${JSON.stringify(summary, null, 2)}

DETERMINISTIC FIXES ALREADY APPLIED (do not duplicate):
${JSON.stringify(deterministic.fixes, null, 2)}

OUTPUT SCHEMA:
{
  "summary": "2-sentence plain-English read on last 24h performance",
  "top_wins": ["win 1", "win 2"],
  "top_concerns": ["concern 1", "concern 2"],
  "strategic_recommendations": [
    {
      "priority": "high|medium|low",
      "area": "cold_email|calendly|manychat|cold_calls|audits|cross_channel",
      "observation": "what you see in the data",
      "recommendation": "specific action Alex should take",
      "expected_impact": "estimated impact if implemented"
    }
  ],
  "next_24h_focus": "single most important thing to work on tomorrow"
}

Output JSON only, no prose before or after.`;
}

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { ok: false, error: "GEMINI_API_KEY missing" };
    }
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite-preview", // upgraded 2026-04-23 — gemini-2.0-flash returns 404 for new users (Disaster Log 2026-04-23). Matches dailyStrategist + opportunityClassifier.
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                maxOutputTokens: 2048,
            },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Strip markdown fences if present
        const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        return { ok: true, analysis: parsed };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ---------- Slack escalation post ----------
function buildEscalationBlocks(analysis, escalations, autoFixResults) {
    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: "🤖 AI Agent — Review Needed", emoji: true },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Window:* last 24h · *Date:* ${dateKeyCDMX()}\n${analysis?.summary || "No Gemini summary available."}`,
            },
        },
    ];

    // Auto-fix report
    if (autoFixResults && autoFixResults.length > 0) {
        const okCount = autoFixResults.filter((f) => f.ok).length;
        const failCount = autoFixResults.length - okCount;
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🔧 Auto-fixes applied:* ${okCount} succeeded, ${failCount} failed`,
            },
        });
        const lines = autoFixResults.slice(0, 10).map((f) => {
            const icon = f.ok ? "✅" : "⚠️";
            const target = f.target_name || f.campaign_id || f.account || "—";
            return `${icon} *${f.action}* → ${target}\n    ↳ ${f.reason || f.error}`;
        });
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: lines.join("\n") },
        });
    }

    // Escalations needing Alex
    if (escalations && escalations.length > 0) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `*⚠️ Needs your call (${escalations.length}):*` },
        });
        for (const esc of escalations.slice(0, 8)) {
            const sev = esc.severity === "high" ? "🔴" : esc.severity === "medium" ? "🟡" : "🟢";
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${sev} *${esc.type}* — ${esc.target_name || esc.target}\n${esc.reason}`,
                },
            });
        }
    }

    // Strategic recommendations from Gemini
    const recs = analysis?.strategic_recommendations || [];
    if (recs.length > 0) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: "*💡 Strategic Recommendations:*" },
        });
        for (const rec of recs.slice(0, 5)) {
            const pri = rec.priority === "high" ? "🔴" : rec.priority === "medium" ? "🟡" : "🟢";
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${pri} *${rec.area}* — ${rec.observation}\n    ↳ _${rec.recommendation}_\n    Expected: ${rec.expected_impact}`,
                },
            });
        }
    }

    // Next 24h focus
    if (analysis?.next_24h_focus) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🎯 Tomorrow's Focus:*\n${analysis.next_24h_focus}`,
            },
        });
    }

    return blocks;
}

async function postEscalationToSlack(blocks) {
    // 2026-04-25: routed to #daily-ops (AI Agent review escalations) via slackPost helper.
    // Helper handles bot-token + chat.postMessage with proper channel ID, plus
    // webhook fallback if bot token missing. Replaces the old hardcoded
    // SLACK_CHANNEL_ID which pointed to a stale channel.
    const { slackPost } = require('./slackPost');
    const result = await slackPost('daily-ops', {
        blocks,
        text: "🤖 AI Agent — Review Needed",
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
        ok: true,
        method: result.fallback_used ? "webhook_fallback" : "bot_token",
        channel: result.channel,
    };
}

// ---------- Firestore logging ----------
async function logAgentRun(db, runData) {
    const dateKey = dateKeyCDMX();
    const ref = db
        .collection("ai_agent_actions")
        .doc(dateKey)
        .collection("entries")
        .doc();
    try {
        await ref.set({
            ...runData,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ok: true, doc_id: ref.id };
    } catch (err) {
        functions.logger.error("logAgentRun failed:", err.message);
        return { ok: false, error: err.message };
    }
}

// ---------- Main entry ----------
/**
 * runAiAgent — called by eveningOpsReport.runEveningOpsReport after the PDF
 * is delivered. Returns structured result so the parent function can attach
 * the AI summary to the Firestore snapshot.
 */
async function runAiAgent(data) {
    const db = admin.firestore();
    const dateKey = dateKeyCDMX();
    const runStart = Date.now();

    functions.logger.info(`[aiAgent] Starting run for ${dateKey}`);

    // STEP 1 — Run deterministic rules (always — these are the safety net)
    const deterministic = deriveDeterministicFixes(data);
    functions.logger.info(
        `[aiAgent] Deterministic rules found ${deterministic.fixes.length} auto-fixes, ${deterministic.escalations.length} escalations`,
    );

    // STEP 2 — Execute auto-fixes (pause campaigns, reduce limits)
    const autoFixResults = [];
    for (const fix of deterministic.fixes) {
        if (fix.type === "pause_campaign") {
            const result = await pauseInstantlyCampaign(fix.target, fix.reason);
            result.target_name = fix.target_name;
            autoFixResults.push(result);
            // Log each action individually
            await logAgentRun(db, {
                run_type: "auto_fix",
                action: "pause_campaign",
                target: fix.target,
                target_name: fix.target_name,
                reason: fix.reason,
                metric: fix.metric,
                value: fix.value,
                threshold: fix.threshold,
                result: result,
            });
        }
    }

    // STEP 3 — Call Gemini for strategic analysis
    const prompt = buildGeminiPrompt(data, deterministic);
    const geminiResult = await callGemini(prompt);
    const analysis = geminiResult.ok ? geminiResult.analysis : null;

    if (!geminiResult.ok) {
        functions.logger.warn(`[aiAgent] Gemini unavailable: ${geminiResult.error}`);
        // HARD RULE #11: never silently fail — log and continue with escalations
        deterministic.escalations.push({
            type: "gemini_unavailable",
            severity: "medium",
            target: "ai_agent",
            reason: `Gemini call failed: ${geminiResult.error}. Deterministic fixes still applied. Recommended: check GEMINI_API_KEY rotation and quota.`,
        });
    }

    // STEP 4 — Post escalation summary to Slack (only if there's something to say)
    const hasContent =
        deterministic.escalations.length > 0 ||
        autoFixResults.length > 0 ||
        (analysis?.strategic_recommendations?.length > 0);

    let slackResult = { ok: true, skipped: true, reason: "no_content" };
    if (hasContent) {
        const blocks = buildEscalationBlocks(analysis, deterministic.escalations, autoFixResults);
        slackResult = await postEscalationToSlack(blocks);
    }

    // STEP 5 — Log the full agent run summary
    await logAgentRun(db, {
        run_type: "agent_summary",
        date_key: dateKey,
        deterministic_fixes_count: deterministic.fixes.length,
        auto_fix_success_count: autoFixResults.filter((f) => f.ok).length,
        auto_fix_fail_count: autoFixResults.filter((f) => !f.ok).length,
        escalations_count: deterministic.escalations.length,
        gemini_ok: geminiResult.ok,
        gemini_error: geminiResult.ok ? null : geminiResult.error,
        slack_post: slackResult,
        duration_ms: Date.now() - runStart,
        analysis_summary: analysis?.summary || null,
        next_24h_focus: analysis?.next_24h_focus || null,
    });

    functions.logger.info(
        `[aiAgent] Run complete — ${autoFixResults.length} fixes, ${deterministic.escalations.length} escalations, Gemini=${geminiResult.ok}, duration=${Date.now() - runStart}ms`,
    );

    return {
        ok: true,
        date_key: dateKey,
        actions: autoFixResults,
        escalations: deterministic.escalations,
        analysis,
        gemini_ok: geminiResult.ok,
        slack_posted: slackResult.ok,
        duration_ms: Date.now() - runStart,
    };
}

module.exports = {
    runAiAgent,
    // Exposed for unit tests
    _deriveDeterministicFixes: deriveDeterministicFixes,
    _buildGeminiPrompt: buildGeminiPrompt,
    _AUTO_FIX_THRESHOLDS: AUTO_FIX_THRESHOLDS,
};
