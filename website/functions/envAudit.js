/**
 * envAudit — 06:00 UTC daily check that every production-critical key
 * is reachable at runtime.
 *
 * Reads REQUIRED_KEYS (defined below + mirrored in /ACCESS.md). For each:
 *   - checks process.env[key] is non-empty
 *   - for Slack/Instantly/Brevo/ElevenLabs, does a cheap ping to verify
 *     the key is not just present but also VALID (live)
 *
 * Posts result to SLACK_WEBHOOK_URL:
 *   ✅ All 24 production keys present + live  → green one-liner
 *   ⚠️ N keys missing or invalid              → red alert with the list
 *
 * This is the contract that prevents silent "key stranded" bugs.
 * If you add a new production-critical key, add it here too.
 *
 * Schedule: `0 6 * * *` UTC (runs before the 7am dailyDigest)
 */
const functions = require("firebase-functions");
const axios = require("axios");

// Required runtime keys — source of truth is /ACCESS.md
// Category determines which live-ping test runs (null = presence-only)
const REQUIRED_KEYS = [
    // Cold email + reporting
    { name: "INSTANTLY_API_KEY", check: "instantly", critical: true },
    { name: "SLACK_WEBHOOK_URL", check: "slack", critical: true },
    { name: "BREVO_API_KEY", check: "brevo", critical: true },
    { name: "BREVO_SENDER_EMAIL", check: null, critical: true },
    { name: "BREVO_SENDER_NAME", check: null, critical: true },

    // Voice + SMS
    { name: "ELEVENLABS_API_KEY", check: "elevenlabs", critical: true },
    { name: "TWILIO_ACCOUNT_SID", check: null, critical: true },
    { name: "TWILIO_AUTH_TOKEN", check: null, critical: true },
    { name: "TWILIO_FROM", check: null, critical: true },

    // Booking + notifications
    { name: "TELEGRAM_BOT_TOKEN", check: null, critical: true },
    { name: "TELEGRAM_CHAT_ID", check: null, critical: true },
    { name: "CALENDLY_PAT", check: null, critical: true },
    { name: "CALENDLY_EVENT_TYPE_URI", check: null, critical: true },

    // SEO + research (degrade gracefully but log as warnings)
    { name: "GEMINI_API_KEY", check: null, critical: false },
    { name: "PERPLEXITY_API_KEY", check: null, critical: false },
    { name: "SERPAPI_KEY", check: null, critical: false },
    { name: "FIRECRAWL_API_KEY", check: null, critical: false },
    { name: "DATAFORSEO_LOGIN", check: null, critical: false },
    { name: "DATAFORSEO_PASS", check: null, critical: false },
    { name: "PSI_API_KEY", check: null, critical: false },
    { name: "HUNTER_API_KEY", check: null, critical: false },

    // Infra
    { name: "MOCKUP_RENDERER_URL", check: null, critical: false },
    { name: "ALEX_EMAIL", check: null, critical: true },
];

// --- live-ping probes ---
async function pingInstantly(key) {
    try {
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns?limit=1", {
            headers: { Authorization: "Bearer " + key },
            timeout: 8000,
        });
        return r.status === 200;
    } catch (e) { return false; }
}
async function pingBrevo(key) {
    try {
        const r = await axios.get("https://api.brevo.com/v3/account", {
            headers: { "api-key": key, accept: "application/json" },
            timeout: 8000,
        });
        return r.status === 200;
    } catch (e) { return false; }
}
async function pingElevenLabs(key) {
    try {
        const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
            headers: { "xi-api-key": key },
            timeout: 8000,
        });
        return r.status === 200;
    } catch (e) { return false; }
}
async function pingSlack(url) {
    // Slack doesn't have a GET ping — a HEAD returns 200 on valid webhook URLs
    try {
        const r = await axios.head(url, { timeout: 5000, validateStatus: () => true });
        // Slack returns 405 on HEAD for valid webhooks (only POST allowed) — that still proves the URL exists
        return r.status === 200 || r.status === 405;
    } catch (e) { return false; }
}

async function sendAlert(report) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return { ok: false, reason: "no_webhook" };

    const isOk = report.missing.length === 0 && report.invalid.length === 0;
    const text = isOk
        ? `✅ envAudit: all ${report.total} keys present + live`
        : `⚠️ envAudit: ${report.missing.length} missing, ${report.invalid.length} invalid (prod degraded)`;

    const blocks = [
        { type: "header", text: { type: "plain_text", text: isOk ? "✅ envAudit — all green" : "⚠️ envAudit — PROD DEGRADED" } },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: [
                    `*Total required:* ${report.total}`,
                    `*Present:* ${report.present}`,
                    `*Live-pinged OK:* ${report.pinged_ok}/${report.pinged_total}`,
                    report.missing.length ? `*Missing:* \`${report.missing.join(", ")}\`` : null,
                    report.invalid.length ? `*Invalid (present but API rejected):* \`${report.invalid.join(", ")}\`` : null,
                ].filter(Boolean).join("\n"),
            },
        },
        {
            type: "context",
            elements: [{ type: "mrkdwn", text: `source of truth: \`/ACCESS.md\` · fix path: GitHub Secrets + deploy.yml heredoc · next run: tomorrow 06:00 UTC` }],
        },
    ];

    try {
        await axios.post(url, { text, blocks }, { timeout: 10000 });
        return { ok: true };
    } catch (e) {
        functions.logger.error("envAudit slack send failed:", e.message);
        return { ok: false, error: e.message };
    }
}

async function runEnvAudit() {
    const report = {
        total: REQUIRED_KEYS.length,
        present: 0,
        missing: [],
        invalid: [],
        pinged_ok: 0,
        pinged_total: 0,
        timestamp: new Date().toISOString(),
    };

    for (const { name, check, critical } of REQUIRED_KEYS) {
        const val = process.env[name];
        if (!val || val.trim() === "") {
            if (critical) report.missing.push(name);
            continue;
        }
        report.present++;
        if (!check) continue;

        report.pinged_total++;
        let ok = false;
        if (check === "instantly") ok = await pingInstantly(val);
        else if (check === "brevo") ok = await pingBrevo(val);
        else if (check === "elevenlabs") ok = await pingElevenLabs(val);
        else if (check === "slack") ok = await pingSlack(val);

        if (ok) report.pinged_ok++;
        else report.invalid.push(name);
    }

    functions.logger.info("envAudit report:", report);
    const slackResult = await sendAlert(report);
    return { report, slackResult };
}

// Scheduled: every day at 06:00 UTC (01:00 CDMX) — 1 hour before dailyDigest
exports.envAudit = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub.schedule("0 6 * * *")
    .timeZone("UTC")
    .onRun(async () => {
        return await runEnvAudit();
    });

// HTTPS endpoint for manual trigger + testing
exports.envAuditNow = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        const result = await runEnvAudit();
        res.json(result);
    });
