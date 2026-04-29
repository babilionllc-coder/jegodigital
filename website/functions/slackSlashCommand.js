/**
 * slackSlashCommand — single endpoint for Phase 1 Slack remote control.
 *
 * Routes 3 slash commands by `command` field in the form body:
 *   /daily          → reruns dailyBriefing in the calling channel
 *   /lead <name> <url-or-email> [notes]  → adds row to Notion Leads CRM, tags hot
 *   /status         → one-liner health check (queue / campaigns / calls / last booking)
 *
 * SECURITY (HR-6):
 *   Every request is verified against SLACK_SIGNING_SECRET via the official
 *   v0 signing recipe (https://api.slack.com/authentication/verifying-requests).
 *   Body must be raw — we read req.rawBody (Firebase Functions v1 provides it).
 *   Reject anything older than 5 min OR with mismatched signature → 401.
 *
 * RESPONSE PATTERN:
 *   We respond IMMEDIATELY with an "ack" so Slack doesn't 3s timeout, then
 *   do the actual work + post the result via response_url (Slack ephemeral
 *   or in_channel webhook supplied with every slash command request).
 *
 * Endpoint: POST https://us-central1-jegodigital-e02fb.cloudfunctions.net/slackSlashCommand
 *
 * Last updated: 2026-04-29 (initial ship — Phase 1 Slack command center).
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");
const querystring = require("querystring");

if (!admin.apps.length) admin.initializeApp();

// ─── Slack signature verification ────────────────────────────────────
function verifySlackSignature(req) {
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (!secret) return { ok: false, reason: "SLACK_SIGNING_SECRET missing" };
    const ts = req.headers["x-slack-request-timestamp"];
    const sig = req.headers["x-slack-signature"];
    if (!ts || !sig) return { ok: false, reason: "missing_signature_headers" };
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) {
        return { ok: false, reason: "stale_timestamp" };
    }
    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const base = `v0:${ts}:${raw}`;
    const expected = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
    try {
        const a = Buffer.from(expected);
        const b = Buffer.from(sig);
        if (a.length !== b.length) return { ok: false, reason: "sig_length_mismatch" };
        if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: "sig_mismatch" };
    } catch (e) {
        return { ok: false, reason: `sig_compare_error:${e.message}` };
    }
    return { ok: true };
}

// ─── /daily handler ──────────────────────────────────────────────────
async function handleDaily(payload) {
    try {
        const { postBriefing } = require("./dailyBriefing");
        // Post to the channel where the slash command was invoked
        const channelId = payload.channel_id;
        if (channelId && process.env.SLACK_BOT_TOKEN) {
            // Direct chat.postMessage to the invoking channel
            const { buildBriefing } = require("./dailyBriefing");
            const { blocks } = await buildBriefing();
            await axios.post(
                "https://slack.com/api/chat.postMessage",
                { channel: channelId, blocks, text: "JegoDigital Daily Brief (rerun)" },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
                        "Content-Type": "application/json; charset=utf-8",
                    },
                    timeout: 15000,
                }
            );
            return { text: "✅ Daily brief reposted above." };
        }
        // Fallback to default daily-ops channel
        const r = await postBriefing("daily-ops");
        return { text: `✅ Daily brief posted to #daily-ops (traffic: ${r.traffic_light}).` };
    } catch (e) {
        return { text: `❌ /daily failed: ${e.message}` };
    }
}

// ─── /lead handler ───────────────────────────────────────────────────
async function handleLead(payload) {
    const text = (payload.text || "").trim();
    if (!text) {
        return { text: "Usage: `/lead <name> <url-or-email> [notes]`\nExample: `/lead Maria Lopez maria@inmoplaya.mx Replied to TJ V2`" };
    }
    const tokens = text.split(/\s+/);
    if (tokens.length < 2) {
        return { text: "❌ Need at least name + (URL or email). Usage: `/lead <name> <url-or-email> [notes]`" };
    }
    // Heuristic: contact = first token that looks like email or URL
    let nameParts = [];
    let contact = null;
    let notesParts = [];
    for (const t of tokens) {
        if (!contact && /(@|https?:\/\/|\.\w{2,})/.test(t)) {
            contact = t;
        } else if (!contact) {
            nameParts.push(t);
        } else {
            notesParts.push(t);
        }
    }
    const name = nameParts.join(" ") || "(unnamed)";
    const notes = notesParts.join(" ");
    const isEmail = contact && contact.includes("@") && !contact.startsWith("http");

    // Notion CRM insert
    const notionKey = process.env.NOTION_API_KEY;
    const dbId = process.env.NOTION_LEADS_CRM_ID;
    if (!notionKey || !dbId) {
        return { text: `⚠️ Notion CRM not configured (NOTION_API_KEY or NOTION_LEADS_CRM_ID missing). Lead captured locally only:\n• Name: *${name}*\n• Contact: \`${contact}\`\n• Notes: ${notes || "—"}` };
    }

    try {
        const props = {
            Name: { title: [{ text: { content: name } }] },
            Status: { select: { name: "Hot" } },
            Source: { select: { name: "Slack /lead" } },
        };
        if (isEmail) props.Email = { email: contact };
        else if (contact) props.Website = { url: contact.startsWith("http") ? contact : `https://${contact}` };
        if (notes) props.Notes = { rich_text: [{ text: { content: notes.slice(0, 2000) } }] };
        if (payload.user_name) {
            props["Captured By"] = { rich_text: [{ text: { content: payload.user_name } }] };
        }

        const r = await axios.post(
            "https://api.notion.com/v1/pages",
            { parent: { database_id: dbId }, properties: props },
            {
                headers: {
                    Authorization: `Bearer ${notionKey}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                timeout: 12000,
                validateStatus: () => true,
            }
        );

        if (r.status >= 200 && r.status < 300) {
            // Mirror to Firestore for the daily briefing hot-lead aggregation
            try {
                await admin.firestore().collection("manual_hot_leads").add({
                    name,
                    contact,
                    notes,
                    captured_by: payload.user_name || null,
                    notion_page_id: r.data?.id || null,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (_) {}

            return {
                response_type: "in_channel",
                text: `🔥 *Hot lead captured* — ${name}\n• Contact: \`${contact}\`\n${notes ? `• Notes: ${notes}\n` : ""}• Notion: \`${(r.data?.id || "").slice(0, 8)}…\`\n• Tagged: 🔥 Hot · Source: Slack /lead`,
            };
        }
        return { text: `❌ Notion insert failed (HTTP ${r.status}): ${(JSON.stringify(r.data) || "").slice(0, 200)}` };
    } catch (e) {
        return { text: `❌ /lead error: ${e.message}` };
    }
}

// ─── /status handler ─────────────────────────────────────────────────
async function handleStatus(payload) {
    const parts = [];
    const db = admin.firestore();

    // Lead queue
    try {
        const s = await db.collection("leads").where("status", "==", "pending").count().get();
        parts.push(`Queue: *${s.data().count}*`);
    } catch (_) { parts.push("Queue: ❓"); }

    // Active campaigns
    try {
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns?limit=100", {
            headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
            timeout: 8000,
        });
        const list = r.data?.items || r.data?.data || [];
        const active = list.filter((c) => c.status === 1).length;
        parts.push(`Active campaigns: *${active}*`);
    } catch (_) { parts.push("Active campaigns: ❓"); }

    // Calls scheduled today (Cancun day from Firestore)
    try {
        const startUtc = new Date();
        startUtc.setUTCHours(5, 0, 0, 0); // 00:00 Cancun = 05:00 UTC
        const since = admin.firestore.Timestamp.fromDate(startUtc);
        const s = await db.collection("call_queue").where("scheduled_at", ">=", since).count().get();
        parts.push(`Calls today: *${s.data().count}*`);
    } catch (_) { parts.push("Calls today: ❓"); }

    // Last booking
    try {
        const s = await db.collection("calendly_events").orderBy("created_at", "desc").limit(1).get();
        if (s.empty) parts.push("Last booking: —");
        else {
            const last = s.docs[0].data();
            const ts = last.created_at?.toDate?.() || null;
            const ago = ts ? Math.round((Date.now() - ts.getTime()) / 3600000) : null;
            parts.push(`Last booking: *${last.email || "?"}*${ago != null ? ` (${ago}h ago)` : ""}`);
        }
    } catch (_) { parts.push("Last booking: ❓"); }

    return { text: `📊 *JegoDigital status* — ${parts.join(" · ")}` };
}

// ─── Async deferred response (so we always ack within 3s) ────────────
async function deferredRespond(responseUrl, body) {
    if (!responseUrl) return;
    try {
        await axios.post(responseUrl, body, { timeout: 8000 });
    } catch (e) {
        functions.logger.warn("response_url POST failed:", e.message);
    }
}

// ─── Main HTTPS entry ────────────────────────────────────────────────
exports.slackSlashCommand = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (req.method !== "POST") {
            return res.status(405).json({ ok: false, error: "method_not_allowed" });
        }
        const ver = verifySlackSignature(req);
        if (!ver.ok) {
            functions.logger.warn("slashCommand auth fail:", ver.reason);
            return res.status(401).json({ ok: false, error: ver.reason });
        }

        // Body is application/x-www-form-urlencoded
        const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
        const payload = querystring.parse(raw);
        const cmd = (payload.command || "").trim().toLowerCase();
        const responseUrl = payload.response_url;

        // Immediate ack (Slack 3s rule)
        res.status(200).json({ response_type: "ephemeral", text: `⏳ Processing \`${cmd}\`…` });

        // Do the work async + post via response_url
        let result;
        try {
            if (cmd === "/daily") result = await handleDaily(payload);
            else if (cmd === "/lead") result = await handleLead(payload);
            else if (cmd === "/status") result = await handleStatus(payload);
            else result = { text: `❓ Unknown command: \`${cmd}\`` };
        } catch (e) {
            result = { text: `❌ Internal error: ${e.message}` };
        }

        // Default to ephemeral unless handler asked otherwise
        if (!result.response_type) result.response_type = "ephemeral";
        await deferredRespond(responseUrl, result);
    });
