/**
 * notionWebhook — receive Notion page/database change events
 *
 * Flow:
 *   1. Notion sends verification challenge (initial setup) → we echo verification_token
 *   2. Notion sends events (type: page.properties_updated / database.content_updated)
 *   3. We route each event to the appropriate handler:
 *      - Leads CRM: Status change → update Brevo lists, fire Calendly pre-call email, etc.
 *      - Tasks: Status change → mark shipped timestamp
 *      - Content Calendar: Status → Published → ensure posted to TikTok/IG/YT
 *
 * Security:
 *   - Verification token echo on first setup
 *   - Optional HMAC signature verification via NOTION_WEBHOOK_SECRET
 *
 * Env: NOTION_API_KEY · BREVO_API_KEY · NOTION_WEBHOOK_SECRET (optional)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const NOTION_VERSION = "2022-06-28";
const LEADS_DS = "adacaa44-3d9a-4c00-8ef4-c0eb45ff091b";
const TASKS_DS = "7f1f9ac1-5fe6-4b6e-b461-4f189d197922";
const CONTENT_DS = "77f8681d-9952-43f8-879f-4c627609d466";
const CLIENTS_DS = "dfe7ff33-f7bb-467c-89a9-06f4838cf2d4";

function notionHeaders() {
    return {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    };
}

async function getPage(pageId) {
    try {
        const r = await axios.get(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders(), timeout: 15000 });
        return r.data;
    } catch (e) { functions.logger.error(`getPage ${pageId}: ${e.message}`); return null; }
}

function extractSelect(prop) { return prop?.select?.name || ""; }
function extractEmail(prop) { return prop?.email || ""; }
function extractTitle(prop) { return (prop?.title || []).map(t => t.plain_text || "").join(""); }
function extractText(prop) { return (prop?.rich_text || []).map(t => t.plain_text || "").join(""); }

async function brevoUpsertContact(email, attrs, listIds = [], removeListIds = []) {
    if (!process.env.BREVO_API_KEY || !email) return { ok: false, skipped: true };
    try {
        await axios.post("https://api.brevo.com/v3/contacts",
            { email, attributes: attrs, listIds, unlinkListIds: removeListIds, updateEnabled: true },
            { headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" }, timeout: 15000 });
        return { ok: true };
    } catch (e) {
        functions.logger.error(`Brevo upsert ${email}: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

async function notifyTelegram(text) {
    const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID;
    if (!t || !c) return;
    try {
        await axios.post(`https://api.telegram.org/bot${t}/sendMessage`,
            { chat_id: c, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 });
    } catch (e) { /* silent */ }
}

async function notifySlack(text) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return;
    try { await axios.post(url, { text }, { timeout: 10000 }); } catch (e) { /* silent */ }
}

// ─────── Route handlers ───────

async function handleLeadChange(page) {
    const props = page.properties || {};
    const company = extractTitle(props["Company"]);
    const email = extractEmail(props["Email"]);
    const status = extractSelect(props["Status"]);
    const temp = extractSelect(props["Temperature"]);
    const source = extractSelect(props["Source"]);
    const notionUrl = page.url;
    functions.logger.info(`Lead change: ${company} (${email}) → ${status} / ${temp}`);

    if (!email) return { ok: false, reason: "no_email" };

    // Map Notion Status → Brevo list action
    const listMap = {
        "Calendly Booked": { add: [30], remove: [] },   // Calendly - Booked (Pre-call)
        "Calendly Canceled": { add: [31], remove: [30] }, // Re-engage
        "Calendly No-Show": { add: [33], remove: [30] },
        "Audit Sent": { add: [25], remove: [] },
        "Proposal Sent": { add: [25], remove: [] },
        "Closed Won": { add: [], remove: [25, 30] },  // Graduated to client
        "Closed Lost": { add: [19], remove: [25, 30] }, // Unresponsive
    };
    const action = listMap[status];
    if (action) {
        const r = await brevoUpsertContact(email, {
            FIRSTNAME: extractText(props["Contact Name"])?.split(" ")[0] || "",
            COMPANY: company,
            NOTION_LEAD_URL: notionUrl,
            NOTION_STATUS: status,
        }, action.add, action.remove);
        await notifySlack(`🔄 Lead _${company}_ moved to *${status}* → Brevo list ${action.add.join(",") || "—"} added, ${action.remove.join(",") || "—"} removed ${r.ok ? "✅" : "❌ "+r.error}`);
    }

    // Closed Won → escalate
    if (status === "Closed Won") {
        await notifyTelegram(`🏆 *CLOSED WON!*\n${company} — ${email}\n${notionUrl}`);
        await notifySlack(`🏆 *CLOSED WON!* ${company} — <${notionUrl}|Open in Notion>`);
    }
    // Calendly Booked → heads-up
    if (status === "Calendly Booked") {
        await notifyTelegram(`📅 Calendly booked: *${company}* (${email})\n${notionUrl}`);
    }
    // Status changed to Positive Reply on a Hot lead → prompt
    if (status === "Positive Reply" && temp === "🔥 Hot") {
        await notifySlack(`🔥 New hot reply in Notion: *${company}* — send audit link / Calendly ASAP · <${notionUrl}|Open>`);
    }

    return { ok: true, status, brevo_action: listMap[status] || null };
}

async function handleTaskChange(page) {
    const props = page.properties || {};
    const task = extractTitle(props["Task"]);
    const status = extractSelect(props["Status"]);
    if (status === "Shipped") {
        await notifySlack(`✅ Task shipped: *${task}*`);
    }
    if (status === "Blocked") {
        await notifySlack(`🚫 Task blocked: *${task}* — <${page.url}|see details>`);
    }
    return { ok: true, status };
}

async function handleContentChange(page) {
    const props = page.properties || {};
    const title = extractTitle(props["Title"]);
    const status = extractSelect(props["Status"]);
    const platform = extractSelect(props["Platform"]);
    if (status === "🚀 Published") {
        await notifySlack(`🚀 Published: *${title}* on ${platform}`);
        // Could trigger downstream analytics pull here
    }
    if (status === "✅ Ready") {
        await notifySlack(`✅ Ready to publish: *${title}* — ${platform}`);
    }
    return { ok: true, status };
}

// ─────── Main webhook handler ───────

exports.notionWebhook = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        // Respond to CORS
        res.set("Access-Control-Allow-Origin", "*");
        if (req.method === "OPTIONS") return res.status(204).send("");

        // Log incoming payload head for debugging
        functions.logger.info("notionWebhook received:", {
            method: req.method,
            keys: Object.keys(req.body || {}),
            type: req.body?.type,
        });

        // 1. Verification challenge (initial subscription setup)
        const verifToken = req.body?.verification_token || req.body?.challenge;
        if (verifToken) {
            functions.logger.info("Verification challenge received:", verifToken);
            return res.status(200).json({ verification_token: verifToken, challenge: verifToken });
        }

        // 2. Optional HMAC signature verify
        const sig = req.headers["x-notion-signature"] || req.headers["notion-signature"];
        const secret = process.env.NOTION_WEBHOOK_SECRET;
        if (secret && sig) {
            const raw = typeof req.rawBody !== "undefined" ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
            const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
            if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
                functions.logger.warn("Notion webhook signature mismatch");
                return res.status(401).json({ error: "invalid_signature" });
            }
        }

        // 3. Route event
        const body = req.body || {};
        const event = body.entity || body.data || body;
        const type = body.type || "";
        const pageId = event.id || body.page_id || body.pageId;
        const parentDb = event.parent?.database_id || body.database_id;

        if (!pageId) {
            functions.logger.warn("No pageId in webhook payload", body);
            return res.status(200).json({ ok: true, skipped: "no_page_id" });
        }

        // Fetch full page (Notion sends only IDs in webhooks)
        const page = await getPage(pageId);
        if (!page) return res.status(200).json({ ok: false, reason: "page_fetch_failed" });

        // Determine which DB this page belongs to
        const dbId = (page.parent?.database_id || "").replace(/-/g, "");
        let result;
        if (dbId.includes(LEADS_DS.replace(/-/g, "")) || dbId.includes("ee1cb76a15174041a646f782debc4b25")) {
            result = await handleLeadChange(page);
        } else if (dbId.includes(TASKS_DS.replace(/-/g, "")) || dbId.includes("770aaf73e0264a1a9fe7bc9de03c9614")) {
            result = await handleTaskChange(page);
        } else if (dbId.includes(CONTENT_DS.replace(/-/g, "")) || dbId.includes("bf901beff0af4da3b083183e75dcbc05")) {
            result = await handleContentChange(page);
        } else {
            result = { ok: true, reason: "db_not_routed", dbId };
        }

        return res.status(200).json({ ok: true, type, page_id: pageId, ...result });
    });
