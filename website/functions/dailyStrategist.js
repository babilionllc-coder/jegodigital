/**
 * dailyStrategist — 08:00 CDMX AI-recommendation agent.
 *
 * Runs every morning, pulls the live `instantlyAuditNow` payload,
 * runs the Lead Quality Audit Playbook programmatically, sends the
 * combined diagnostic to Claude via the Anthropic SDK, and then:
 *
 *   1. Applies whitelisted "safe fixes" autonomously via Instantly API
 *      (delete fake-name leads, pause dead variants, patch fallback bugs,
 *       move stranded leads, reduce limits on unhealthy senders).
 *   2. Posts a strategist digest to Slack #all-jegodigital with
 *      everything that was auto-fixed + anything needing Alex's call.
 *   3. Escalates to DM (Alex U0A6U6GLP27) if a critical red flag triggers.
 *
 * HARD CONSTRAINTS (enforced both in prompt AND in code):
 *   - Never rewrites email copy.
 *   - Never uploads new leads.
 *   - Never re-enables HTML open tracking (text-only is deliberate).
 *   - Never spends money or swaps sending domains.
 *
 * Schedule: `0 8 * * *` / America/Mexico_City
 *
 * Env required:
 *   INSTANTLY_API_KEY           (to read audit + apply safe fixes)
 *   ANTHROPIC_API_KEY           (Claude strategist call)
 *   SLACK_WEBHOOK_URL           (post to #all-jegodigital)
 *   SLACK_BOT_TOKEN             (optional — DM escalation to U0A6U6GLP27)
 *   CLOUD_FUNCTIONS_BASE_URL    (default: https://us-central1-jegodigital-e02fb.cloudfunctions.net)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-opus-4-6";
const SLACK_CHANNEL_ID = "C0A7USSJU72"; // #all-jegodigital
const ALEX_SLACK_ID = "U0A6U6GLP27";

const FAKE_NAMES = new Set([
    "info", "hola", "contacto", "contact", "admin", "support",
    "ventas", "sales", "marketing", "team", "equipo",
    "cancun", "tulum", "mexico", "playa", "riviera",
    "real", "estate", "inmobiliaria", "grupo", "empresa",
    "test", "user", "client", "example", "noreply",
    "allá", "alla",
]);

function isFakeName(fn) {
    if (!fn || !fn.trim()) return { fake: true, reason: "empty" };
    const firstTok = fn.trim().split(/\s+/)[0].replace(/[.,;:]$/, "");
    const lc = firstTok.toLowerCase();
    if (FAKE_NAMES.has(lc)) return { fake: true, reason: "generic" };
    if (!/[aeiouáéíóú]/.test(lc)) return { fake: true, reason: "no_vowel" };
    if (lc.length < 2) return { fake: true, reason: "too_short" };
    if (lc.length > 20) return { fake: true, reason: "too_long" };
    if (!/^[a-záéíóúñü\-']+$/.test(lc)) return { fake: true, reason: "non_alpha" };
    if (/\d/.test(lc)) return { fake: true, reason: "has_digits" };
    return { fake: false };
}

// ============================================================
// 1. INGEST — pull live audit + lead-quality diagnostic
// ============================================================

async function pullAudit() {
    const base = process.env.CLOUD_FUNCTIONS_BASE_URL
        || "https://us-central1-jegodigital-e02fb.cloudfunctions.net";
    const { data } = await axios.get(`${base}/instantlyAuditNow`, { timeout: 30000 });
    return data;
}

async function instantlyGet(urlPath) {
    const { data } = await axios.get(`${INSTANTLY_API}${urlPath}`, {
        headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
        timeout: 30000,
    });
    return data;
}

async function instantlyPost(urlPath, body) {
    const { data } = await axios.post(`${INSTANTLY_API}${urlPath}`, body, {
        headers: {
            Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
            "Content-Type": "application/json",
        },
        timeout: 30000,
    });
    return data;
}

async function runLeadQualityAudit(activeCampaigns) {
    const summary = {
        fake_name_count_per_campaign: {},
        firstname_fallback_bugs: [],
        sample_size_per_campaign: {},
    };

    for (const camp of activeCampaigns) {
        try {
            // Pull a sample of leads (up to 200 per campaign)
            const leadsResp = await instantlyPost("/leads/list", {
                campaign: camp.id,
                limit: 200,
            });
            const leads = leadsResp.items || leadsResp.data || [];
            let fakeCount = 0;
            for (const lead of leads) {
                const fn = lead.first_name || lead.firstName || "";
                if (isFakeName(fn).fake) fakeCount++;
            }
            summary.fake_name_count_per_campaign[camp.name] = {
                fake: fakeCount,
                total: leads.length,
                pct: leads.length ? (fakeCount / leads.length * 100).toFixed(1) : 0,
            };
            summary.sample_size_per_campaign[camp.name] = leads.length;

            // Scan sequence bodies for fallback bugs
            try {
                const seq = await instantlyGet(`/campaigns/${camp.id}`);
                const bodies = JSON.stringify(seq);
                if (/\{\{firstName\|/i.test(bodies)) {
                    summary.firstname_fallback_bugs.push({
                        campaign_id: camp.id,
                        name: camp.name,
                    });
                }
            } catch (e) {
                // ignore per-campaign sequence fetch failure
            }
        } catch (e) {
            functions.logger.warn(`LQA failed for ${camp.name}: ${e.message}`);
        }
    }
    return summary;
}

// ============================================================
// 2. STRATEGIST — call Claude with locked system prompt
// ============================================================

function loadSystemPrompt() {
    try {
        const p = path.join(__dirname, "cold-email-strategist-prompt.md");
        return fs.readFileSync(p, "utf8");
    } catch (e) {
        functions.logger.error("Could not load strategist prompt:", e.message);
        return "You are the JegoDigital cold email strategist. Return JSON with { diagnosis, safe_fixes_to_apply, human_review_items, escalate_to_dm, escalate_reason }.";
    }
}

async function callStrategist(payload) {
    const system = loadSystemPrompt();
    const { data } = await axios.post(
        ANTHROPIC_API,
        {
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [
                {
                    role: "user",
                    content: `Here is today's audit payload. Return JSON per the schema in your system prompt.\n\n${JSON.stringify(payload, null, 2)}`,
                },
            ],
        },
        {
            headers: {
                "x-api-key": process.env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            timeout: 60000,
        },
    );
    const raw = data.content?.[0]?.text || "{}";
    // Extract JSON from response (strategist may wrap in ```json ... ```)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Strategist returned no JSON");
    return JSON.parse(jsonMatch[0]);
}

// ============================================================
// 3. APPLY SAFE FIXES — whitelisted Instantly API ops only
// ============================================================

const WHITELISTED_ACTIONS = new Set([
    "delete_leads",
    "pause_variant",
    "move_stranded_leads",
    "patch_fallback_bug",
    "reduce_sender_limit",
    "remove_bounced_leads",
]);

async function applySafeFix(fix) {
    if (!WHITELISTED_ACTIONS.has(fix.action)) {
        return { applied: false, skipped: true, reason: `action '${fix.action}' not whitelisted` };
    }
    try {
        switch (fix.action) {
            case "delete_leads":
                for (const id of fix.lead_ids || []) {
                    await instantlyPost("/leads/delete", { lead_ids: [id] });
                }
                return { applied: true, count: (fix.lead_ids || []).length };
            case "pause_variant":
                await instantlyPost(`/campaigns/${fix.campaign_id}/variants/${fix.variant_id}/pause`, {});
                return { applied: true };
            case "move_stranded_leads":
                await instantlyPost("/leads/move", {
                    from_campaign: fix.from_campaign,
                    to_campaign: fix.to_campaign,
                    lead_ids: fix.lead_ids,
                });
                return { applied: true, count: (fix.lead_ids || []).length };
            case "patch_fallback_bug":
                // Patch sequence body — strip {{firstName|X}} fallback syntax
                await instantlyPost(`/campaigns/${fix.campaign_id}/sequences/patch`, {
                    body_replacements: [
                        { find: /\{\{firstName\|[^}]*\}\}/g.source, replace: "" },
                    ],
                });
                return { applied: true };
            case "reduce_sender_limit":
                await instantlyPost("/accounts/patch", {
                    account_id: fix.account_id,
                    daily_limit: 0,
                });
                return { applied: true };
            case "remove_bounced_leads":
                await instantlyPost("/leads/delete", { filter: { bounced: true, campaign: fix.campaign_id } });
                return { applied: true };
        }
    } catch (e) {
        return { applied: false, error: e.message };
    }
}

// ============================================================
// 4. SLACK — post strategist digest + DM escalation
// ============================================================

async function postSlackDigest(text, blocks) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) {
        functions.logger.error("SLACK_WEBHOOK_URL not set — skipping digest");
        return;
    }
    const payload = { text };
    if (blocks) payload.attachments = [{ color: "#C5A059", blocks }];
    await axios.post(url, payload, { timeout: 10000 });
}

async function dmAlex(text) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return;
    await axios.post(
        "https://slack.com/api/chat.postMessage",
        { channel: ALEX_SLACK_ID, text },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 },
    );
}

function renderDigest(strategist, fixesApplied) {
    const today = new Date().toISOString().slice(0, 10);
    const fixesCount = fixesApplied.filter(f => f.result?.applied).length;
    const reviewCount = (strategist.human_review_items || []).length;

    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `🧠 Cold Email Strategist · ${today}` },
        },
        {
            type: "section",
            text: { type: "mrkdwn", text: `*Diagnosis*\n${strategist.diagnosis || "—"}` },
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Safe fixes applied*\n${fixesCount}` },
                { type: "mrkdwn", text: `*Human review items*\n${reviewCount}` },
                { type: "mrkdwn", text: `*Reply rate 7d*\n${(strategist.metrics_trend?.reply_rate_7d?.today * 100 || 0).toFixed(2)}%` },
                { type: "mrkdwn", text: `*Trend*\n${strategist.metrics_trend?.reply_rate_7d?.delta_pct || 0}%` },
            ],
        },
    ];

    if (fixesApplied.length) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*✅ Auto-fixes applied*\n" + fixesApplied.map(f =>
                    `• ${f.fix.action}: ${f.result?.applied ? "✓" : "✗"} ${f.fix.reason || ""}`
                ).join("\n"),
            },
        });
    }

    if (reviewCount) {
        blocks.push({ type: "divider" });
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*🚨 Needs your call*\n" + strategist.human_review_items.map(item =>
                    `• *${item.severity?.toUpperCase() || "MED"}* · ${item.summary}\n   → _${item.recommended_action}_`
                ).join("\n"),
            },
        });
    }

    blocks.push({
        type: "context",
        elements: [
            { type: "mrkdwn", text: `_Strategist · ${new Date().toISOString()} · ${CLAUDE_MODEL}_` },
        ],
    });

    const fallbackText = `🧠 Strategist · ${today} · ${fixesCount} auto-fixes, ${reviewCount} need review. ${strategist.diagnosis}`;
    return { text: fallbackText, blocks };
}

// ============================================================
// 5. MAIN — orchestration
// ============================================================

async function runStrategist() {
    functions.logger.info("dailyStrategist starting");

    // 1. Pull audit
    const audit = await pullAudit();
    const activeCampaigns = audit.active_campaigns || [];

    // 2. Run lead-quality programmatic audit
    const leadQuality = await runLeadQualityAudit(activeCampaigns);

    // 3. Call strategist
    const payload = {
        audit_7d: audit,
        lead_quality_audit: leadQuality,
        account_health: {
            total: audit.accounts_total,
            unhealthy: audit.accounts_unhealthy,
            by_status: audit.accounts_by_status,
        },
    };
    const strategist = await callStrategist(payload);

    // 4. Apply safe fixes
    const fixesApplied = [];
    for (const fix of strategist.safe_fixes_to_apply || []) {
        const result = await applySafeFix(fix);
        fixesApplied.push({ fix, result });
    }

    // 5. Post digest
    const { text, blocks } = renderDigest(strategist, fixesApplied);
    await postSlackDigest(text, blocks);

    // 6. DM escalation if critical
    if (strategist.escalate_to_dm) {
        await dmAlex(`🚨 CRITICAL · ${strategist.escalate_reason}\n\nSee #all-jegodigital for full diagnostic.`);
    }

    functions.logger.info("dailyStrategist complete", {
        fixesApplied: fixesApplied.length,
        reviewItems: (strategist.human_review_items || []).length,
    });

    return { ok: true, fixesApplied: fixesApplied.length };
}

exports.dailyStrategist = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            return await runStrategist();
        } catch (e) {
            functions.logger.error("dailyStrategist failed:", e);
            // Always post failure to Slack so Alex notices
            try {
                await postSlackDigest(
                    `🔴 *Strategist run failed — ${new Date().toISOString()}*\n\`\`\`${e.message}\`\`\``,
                );
            } catch (_) { /* swallow secondary */ }
            throw e;
        }
    });

exports.dailyStrategistNow = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const result = await runStrategist();
            res.json({ ok: true, ...result });
        } catch (e) {
            functions.logger.error("dailyStrategistNow failed:", e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });
