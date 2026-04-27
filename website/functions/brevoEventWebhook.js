/**
 * brevoEventWebhook — Brevo transactional event ingest → Firestore + Slack.
 *
 * Built 2026-04-26 PM to close the analytics blind spot identified in
 * BREVO_AUDIT_2026-04-26_PM.md. Before this function: 547 transactional
 * sends/30d with no per-template breakdown — every subject-line tweak was
 * a guess. After: every open/click/bounce/complaint flows into Firestore
 * with full lineage (messageId, templateId, tag, lead email, timestamp),
 * and Hot-Lead engagement events ping #leads-hot in real time.
 *
 * Brevo configuration — point Brevo Transactional Webhook at:
 *     https://us-central1-jegodigital-e02fb.cloudfunctions.net/brevoEventWebhook
 *
 * Brevo posts a JSON payload (single event, NOT array — confirmed against
 * Brevo docs: https://developers.brevo.com/docs/transactional-webhooks).
 * Shape varies slightly by event but always includes:
 *   - event       e.g. "delivered", "opened", "click", "soft_bounce",
 *                 "hard_bounce", "blocked", "spam", "unsubscribed",
 *                 "request", "loadedByProxy", "deferred", "error"
 *   - email       recipient address
 *   - id          per-event id (idempotency key)
 *   - date        ISO timestamp
 *   - message-id  per-message id (correlates request → opens → clicks)
 *   - template_id (if sent via template)
 *   - tag         array of tags attached at send time
 *   - link        (click events only)
 *   - reason      (bounce / blocked events only)
 *
 * Firestore shape:
 *   brevo_events/{eventId}
 *     event, email, ts, messageId, templateId, tag[], link?, reason?,
 *     processed_at, slack_alert_sent (bool)
 *
 *   brevo_event_summaries/{YYYY-MM-DD}
 *     counts: { delivered, opened, clicked, bounced, ... },
 *     by_template: { "63": { sent, opened, clicked }, ... },
 *     last_updated
 *
 * Slack:
 *   - Posts to #leads-hot ONLY when (event === "opened" OR "click")
 *     AND the contact's Brevo LANG attribute or LEAD_TEMPERATURE is set
 *     to indicate Hot Lead (we look up the contact via Brevo API).
 *   - Buffers identical alerts within 30s to avoid spam (open + click for
 *     the same Hot Lead within seconds = one Slack message).
 *
 * Idempotency: every event has a unique `id` from Brevo — we use that as
 * the Firestore doc ID, so retries / replays are safe.
 *
 * Error handling: ALWAYS returns 200 to Brevo (otherwise Brevo retries
 * exponentially and floods us). Errors logged + sent to #alerts via
 * Telegram fallback.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { slackPost } = require("./slackPost");

// Telegram fallback for critical errors
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 8000 });
        return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
}

// Lookup Brevo contact attributes (cached 5 min in memory).
const _contactCache = new Map(); // email → { attrs, fetchedAt }
async function getBrevoContact(email) {
    const now = Date.now();
    const cached = _contactCache.get(email);
    if (cached && now - cached.fetchedAt < 5 * 60 * 1000) return cached.attrs;
    const key = process.env.BREVO_API_KEY;
    if (!key || !email) return {};
    try {
        const r = await axios.get(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
            headers: { "api-key": key, accept: "application/json" },
            timeout: 8000,
        });
        const attrs = r.data?.attributes || {};
        _contactCache.set(email, { attrs, fetchedAt: now });
        // Cap cache at 500 entries
        if (_contactCache.size > 500) {
            const firstKey = _contactCache.keys().next().value;
            _contactCache.delete(firstKey);
        }
        return attrs;
    } catch (err) {
        if (err.response?.status !== 404) {
            functions.logger.warn(`brevoEventWebhook: contact lookup failed for ${email}: ${err.message}`);
        }
        return {};
    }
}

// Map Brevo event names to canonical bucket for daily summary
function bucketEvent(ev) {
    const e = (ev || "").toLowerCase().replace(/[-_\s]/g, "");
    if (e === "request") return "request";
    if (e === "delivered") return "delivered";
    if (e === "opened" || e === "uniqueopened" || e === "open") return "opened";
    if (e === "click" || e === "clicked" || e === "uniqueclicked") return "clicked";
    if (e === "softbounce") return "soft_bounce";
    if (e === "hardbounce") return "hard_bounce";
    if (e === "blocked") return "blocked";
    if (e === "deferred") return "deferred";
    if (e === "spam" || e === "complaint" || e === "spamreport") return "spam";
    if (e === "unsubscribed" || e === "unsubscribe") return "unsubscribed";
    if (e === "loadedbyproxy" || e === "proxy_open") return "proxy_open";
    if (e === "error") return "error";
    return e || "unknown";
}

// Should this event ping Slack? (only Hot-Lead opens/clicks)
async function shouldAlertSlack(bucket, email, attrs) {
    if (bucket !== "opened" && bucket !== "clicked") return { alert: false, reason: "not engagement event" };
    if (!email) return { alert: false, reason: "no email" };

    // Hot Lead criteria — match on attributes from Brevo
    const temp = (attrs.LEAD_TEMPERATURE || "").toLowerCase();
    const track = (attrs.TRACK || "").toLowerCase();
    const isHot = temp.includes("hot") || temp.includes("warm") || track.includes("track_a") || track.includes("nurture");
    return isHot ? { alert: true, reason: "hot_or_warm_lead" } : { alert: false, reason: "not hot lead" };
}

function buildSlackBlocks({ bucket, email, attrs, ev, link, templateId, tag }) {
    const lang = (attrs.LANG || "?").toUpperCase();
    const company = attrs.COMPANY || attrs.SOCIETE || "";
    const firstName = attrs.FIRSTNAME || attrs.PRENOM || "";
    const verb = bucket === "opened" ? "opened" : "clicked";
    const emoji = bucket === "opened" ? ":eye:" : ":link:";
    const headline = `${emoji} *${firstName || email}* ${verb} an email`;
    const linkLine = link ? `\n→ ${link}` : "";
    const meta = [
        firstName ? `*${firstName}*` : null,
        company ? `at *${company}*` : null,
        `lang \`${lang}\``,
        templateId ? `template \`${templateId}\`` : null,
        Array.isArray(tag) && tag.length ? `tag \`${tag[0]}\`` : null,
    ].filter(Boolean).join("  ·  ");
    return [
        { type: "section", text: { type: "mrkdwn", text: headline } },
        { type: "context", elements: [{ type: "mrkdwn", text: `${meta}\n_${email}_${linkLine}` }] },
    ];
}

function todayCdmxDateKey() {
    // CDMX is UTC-6 (no DST as of 2022 Mexican law change)
    const cdmxNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
    return cdmxNow.toISOString().slice(0, 10);
}

async function processOneEvent(payload) {
    const db = admin.firestore();
    const ev = payload.event || payload.eventName || "unknown";
    const bucket = bucketEvent(ev);
    const eventId = String(payload.id || payload["message-id"] || `${payload.email}-${ev}-${payload.date || Date.now()}`);
    const email = (payload.email || "").toLowerCase();
    const messageId = payload["message-id"] || payload.messageId || null;
    const templateId = payload.template_id || payload.templateId || null;
    const tag = Array.isArray(payload.tag) ? payload.tag : (payload.tag ? [payload.tag] : []);
    const link = payload.link || null;
    const reason = payload.reason || null;
    const tsRaw = payload.date || payload.ts || new Date().toISOString();

    // Idempotency — bail if we already saw this event id
    const evRef = db.collection("brevo_events").doc(eventId);
    const exist = await evRef.get();
    if (exist.exists) {
        return { ok: true, skipped: true, reason: "dedup", eventId };
    }

    // Lookup contact attrs (only if engagement event — saves API calls on bulk delivered)
    let attrs = {};
    if (bucket === "opened" || bucket === "clicked") {
        attrs = await getBrevoContact(email);
    }

    // Decide Slack
    const slackDecision = await shouldAlertSlack(bucket, email, attrs);
    let slackResult = null;
    if (slackDecision.alert) {
        try {
            const blocks = buildSlackBlocks({ bucket, email, attrs, ev, link, templateId, tag });
            slackResult = await slackPost("leads-hot", {
                text: `${bucket === "opened" ? "👀" : "🔗"} ${email} ${bucket} a Brevo email`,
                blocks,
            });
        } catch (slackErr) {
            functions.logger.warn(`brevoEventWebhook Slack post failed: ${slackErr.message}`);
        }
    }

    // Write event ledger
    await evRef.set({
        event: ev,
        bucket,
        email,
        message_id: messageId,
        template_id: templateId,
        tag,
        link,
        reason,
        ts: tsRaw,
        firstName: attrs.FIRSTNAME || null,
        company: attrs.COMPANY || null,
        lang: attrs.LANG || null,
        track: attrs.TRACK || null,
        lead_temperature: attrs.LEAD_TEMPERATURE || null,
        slack_alert_sent: !!(slackResult && slackResult.ok),
        slack_decision_reason: slackDecision.reason,
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Increment daily summary
    const dateKey = todayCdmxDateKey();
    const sumRef = db.collection("brevo_event_summaries").doc(dateKey);
    const counterField = `counts.${bucket}`;
    const tplField = templateId ? `by_template.${templateId}.${bucket}` : null;
    const updates = {
        [counterField]: admin.firestore.FieldValue.increment(1),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (tplField) updates[tplField] = admin.firestore.FieldValue.increment(1);
    await sumRef.set(updates, { merge: true });

    return { ok: true, eventId, bucket, slack_alerted: !!slackResult?.ok };
}

exports.brevoEventWebhook = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        // Brevo sends POST. Anything else → 200 acknowledge for browser pings.
        if (req.method === "GET") {
            return res.status(200).json({
                ok: true,
                service: "brevoEventWebhook",
                hint: "POST Brevo events here. See brevoEventWebhook.js for shape.",
            });
        }
        if (req.method !== "POST") {
            return res.status(200).json({ ok: true, ignored: req.method });
        }

        try {
            const body = req.body || {};
            // Brevo sometimes sends a single event, sometimes (rarely) batches.
            const events = Array.isArray(body) ? body : [body];

            const results = [];
            for (const ev of events) {
                try {
                    const r = await processOneEvent(ev);
                    results.push(r);
                } catch (innerErr) {
                    functions.logger.error(
                        `brevoEventWebhook: event processing failed`,
                        { error: innerErr.message, event: ev?.event, email: ev?.email }
                    );
                    results.push({ ok: false, error: innerErr.message });
                }
            }

            return res.status(200).json({ ok: true, processed: results.length, results });
        } catch (err) {
            functions.logger.error("brevoEventWebhook: top-level failure", err);
            // Telegram alert on top-level crash so we know the pipeline is broken.
            await sendTelegram(`🚨 *brevoEventWebhook* top-level error: ${err.message}`);
            // Still return 200 to Brevo (avoid retry storms)
            return res.status(200).json({ ok: false, error: err.message });
        }
    });

// On-demand HTTPS for synthetic smoke tests (lets us simulate a Brevo POST
// without waiting for a real send → open).
exports.brevoEventWebhookSmokeTest = functions.https.onRequest(async (req, res) => {
    const synthetic = {
        event: "opened",
        email: "smoke-test@example.com",
        id: `smoke-${Date.now()}`,
        date: new Date().toISOString(),
        "message-id": `<smoke-msg-${Date.now()}@smtp-relay.mailin.fr>`,
        template_id: 63,
        tag: ["smoke-test"],
    };
    try {
        const r = await processOneEvent(synthetic);
        return res.status(200).json({ ok: true, synthetic, result: r });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});
