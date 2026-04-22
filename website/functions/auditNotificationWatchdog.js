/**
 * auditNotificationWatchdog — Option B silent-failure watchdog.
 *
 * Runs every 15 minutes. Scans audit_requests from the last 24h and
 * surfaces any document that has either:
 *   (a) notifications map entirely missing (=== submitAuditRequest bailed
 *       before the flush line), or
 *   (b) at least one of brevo / telegram / slack / alex_email with ok=false
 *       and NOT skipped (i.e. the channel is configured but failed),
 *   AND the audit doc is older than 5 minutes (grace period for the
 *   submitAuditRequest handler to finish its own awaits).
 *
 * If any hits found, posts a Slack alert to SLACK_WEBHOOK_URL so Alex sees
 * silent failures within 15 minutes instead of discovering them days later
 * (the Priscila / Casa Mérida pattern we just fixed).
 *
 * Also exposes an HTTPS on-demand endpoint so Alex (or Claude) can probe
 * instantly — no waiting for the cron.
 *
 * Honors:
 *   HARD RULE #0  — every number comes from a live Firestore read this run
 *   HARD RULE #6  — returns a verification object (scanned, healthy, broken)
 *   HARD RULE #11 — surfaces blockers with recommended fix
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const GRACE_MINUTES = 5;          // wait this long before flagging a doc
const LOOKBACK_HOURS = 24;        // window to scan
const CHANNELS = ["brevo", "telegram", "slack", "alex_email"];

function isoAgo(minutes) {
    return new Date(Date.now() - minutes * 60 * 1000);
}

/**
 * Inspect a single audit_requests doc. Return null if healthy, otherwise
 * return a diagnostic object.
 */
function diagnose(doc) {
    const d = doc.data();
    const n = d.notifications;
    const createdAtMs = d.createdAt?.toMillis?.() || 0;
    const ageMinutes = (Date.now() - createdAtMs) / 60000;

    // Grace period: don't flag docs still in flight
    if (ageMinutes < GRACE_MINUTES) return null;

    // Case A — notifications field entirely missing = handler crashed or
    // the doc was created before Option B shipped. Docs older than 24h are
    // outside the scan window, so anything hitting this branch is a real
    // handler failure after today's deploy.
    if (!n || typeof n !== "object") {
        return {
            id: doc.id,
            website: d.website_url,
            email: d.email,
            name: d.name,
            source: d.source,
            ageMinutes: Math.round(ageMinutes),
            reason: "notifications_missing",
            failed_channels: ["all"],
        };
    }

    // Case B — at least one configured channel failed
    const failed = [];
    for (const ch of CHANNELS) {
        const entry = n[ch];
        if (!entry) {
            failed.push(`${ch}:missing`);
        } else if (!entry.ok && !entry.skipped) {
            const errSnippet = (entry.error || "unknown_error").toString().slice(0, 80);
            failed.push(`${ch}:${errSnippet}`);
        }
    }

    if (failed.length === 0) return null;

    return {
        id: doc.id,
        website: d.website_url,
        email: d.email,
        name: d.name,
        source: d.source,
        ageMinutes: Math.round(ageMinutes),
        reason: "channel_failure",
        failed_channels: failed,
    };
}

async function postSlackAlert(broken, scanned) {
    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackUrl) {
        functions.logger.warn("SLACK_WEBHOOK_URL not set — watchdog cannot post alert");
        return { ok: false, skipped: true, reason: "no_webhook_url" };
    }

    const headerText = `🚨 Audit Notification Watchdog — ${broken.length} silent failure${broken.length === 1 ? "" : "s"}`;
    const rows = broken.slice(0, 10).map(b => {
        const channelList = b.failed_channels.join(", ");
        return `• *${b.name || "(no name)"}* <mailto:${b.email}|${b.email}> — \`${b.website}\`\n   audit \`${b.id}\` · age ${b.ageMinutes}m · reason: \`${b.reason}\` · failed: ${channelList}`;
    }).join("\n");

    const tail = broken.length > 10
        ? `\n_…and ${broken.length - 10} more. Run \`auditNotificationWatchdogOnDemand\` for the full list._`
        : "";

    try {
        await axios.post(slackUrl, {
            text: headerText,
            blocks: [
                { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
                { type: "section", text: { type: "mrkdwn", text: rows + tail } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: `_Scanned ${scanned} audit_requests in last ${LOOKBACK_HOURS}h, grace ${GRACE_MINUTES}m. Fix recommendation: check Cloud Functions logs for submitAuditRequest at the timestamps above._`
                    }]
                }
            ],
            unfurl_links: false,
            unfurl_media: false
        }, { timeout: 8000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("watchdog Slack post failed:", err.response?.data || err.message);
        return { ok: false, error: err.message };
    }
}

async function runWatchdog() {
    const db = admin.firestore();
    const since = admin.firestore.Timestamp.fromDate(isoAgo(LOOKBACK_HOURS * 60));

    const snap = await db
        .collection("audit_requests")
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();

    const broken = [];
    snap.forEach(doc => {
        const diag = diagnose(doc);
        if (diag) broken.push(diag);
    });

    functions.logger.info(`Audit watchdog: scanned=${snap.size}, broken=${broken.length}`);

    let slack = { ok: false, skipped: true, reason: "no_broken" };
    if (broken.length > 0) {
        slack = await postSlackAlert(broken, snap.size);
    }

    return {
        ok: true,
        scanned: snap.size,
        healthy: snap.size - broken.length,
        broken_count: broken.length,
        broken: broken.slice(0, 25), // cap HTTP response size
        slack,
        window_hours: LOOKBACK_HOURS,
        grace_minutes: GRACE_MINUTES,
        ranAt: new Date().toISOString(),
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

// Every 15 minutes — aligns with processScheduledEmails cadence, cheap enough.
exports.auditNotificationWatchdog = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("every 15 minutes")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const result = await runWatchdog();
            functions.logger.info("auditNotificationWatchdog done:", JSON.stringify(result));
            return null;
        } catch (err) {
            functions.logger.error("auditNotificationWatchdog threw:", err);
            return null;
        }
    });

// HTTPS on-demand — hit this anytime to probe immediately.
// curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/auditNotificationWatchdogOnDemand"
exports.auditNotificationWatchdogOnDemand = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const result = await runWatchdog();
            res.json(result);
        } catch (err) {
            functions.logger.error("watchdog on-demand failed:", err);
            res.status(500).json({ error: err.message });
        }
    });

exports._runWatchdog = runWatchdog;
exports._diagnose = diagnose;
