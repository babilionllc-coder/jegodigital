/**
 * notionLeadSync — upsert leads into the Notion 🎯 Leads CRM database.
 *
 * Single entry point: upsertLead(leadData) — finds existing page by Email,
 * either updates or creates. Idempotent. Callers can fire it on every reply
 * / cold-call outcome / audit submission / Calendly booking without worrying
 * about duplicates.
 *
 * Notion CRM schema (database ID adacaa44-3d9a-4c00-8ef4-c0eb45ff091b):
 *   Company (title), Contact Name, Email, Phone, Website, City,
 *   Decision Maker Role, Source, Campaign, Status, Temperature, Bucket,
 *   Potential MRR USD, Next Action, Notes, Last Touch (date), HR-5 Gates Passed
 *
 * Source whitelist (select options that exist in the DB):
 *   "Instantly Cold Email", "ElevenLabs Cold Call", "IG DM (Sofia)",
 *   "WhatsApp (Sofia)", "Google Maps Scrape", "LinkedIn (Apify)",
 *   "Facebook Groups", "Calendly Direct", "Referral", "Website Form"
 *
 * Status whitelist:
 *   "New", "Contacted", "Positive Reply", "Audit Sent", "Calendly Booked",
 *   "Proposal Sent", "Closed Won", "Closed Lost", "No Response"
 *
 * Temperature whitelist:
 *   "🔥 Hot", "🌤️ Warm", "❄️ Cold", "🪦 Dead"
 *
 * Required env: NOTION_API_KEY, NOTION_LEADS_CRM_ID (fallback baked in for safety)
 */

const axios = require("axios");
const functions = require("firebase-functions");

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const LEADS_CRM_FALLBACK = "adacaa44-3d9a-4c00-8ef4-c0eb45ff091b";

// Campaign ID → friendly Notion select name. Update this map when you create
// new Instantly campaigns. Unknown campaigns fall through to the raw ID so you
// can spot them in the CRM and map them later.
const INSTANTLY_CAMPAIGN_MAP = {
    // Add known campaign IDs here as you discover them in Firestore/Instantly
    // e.g. "67fa7834-dc54-423c-be39-8b4ad6e57ce3": "SEO + Visibilidad",
    //      "d486f1ab-4668-4674-ad6b-80ef12d9fd78": "Free Demo Website MX",
};

// Outcome → (Status, Temperature) mapping used by Instantly + cold-call paths.
function outcomeToStatus(outcome) {
    switch (outcome) {
    case "positive":
    case "positive_with_objection":
        return { status: "Positive Reply", temperature: "🔥 Hot" };
    case "question":
        return { status: "Contacted", temperature: "🌤️ Warm" };
    case "neutral":
        return { status: "Contacted", temperature: "🌤️ Warm" };
    case "negative":
        return { status: "No Response", temperature: "🪦 Dead" };
    case "audit_sent":
        return { status: "Audit Sent", temperature: "🌤️ Warm" };
    case "calendly_booked":
        return { status: "Calendly Booked", temperature: "🔥 Hot" };
    case "closed_won":
        return { status: "Closed Won", temperature: "🔥 Hot" };
    case "closed_lost":
        return { status: "Closed Lost", temperature: "🪦 Dead" };
    default:
        return { status: "Contacted", temperature: "🌤️ Warm" };
    }
}

// ---- Notion API helpers ----
function notionHeaders() {
    const token = process.env.NOTION_API_KEY;
    if (!token) throw new Error("NOTION_API_KEY not set");
    return {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    };
}

async function notion(method, path, body) {
    const res = await axios({
        method,
        url: `${NOTION_API}${path}`,
        headers: notionHeaders(),
        data: body,
        timeout: 15000,
    });
    return res.data;
}

// ---- Property builders ----
function prop(value, type) {
    if (value === null || value === undefined || value === "") return undefined;
    switch (type) {
    case "title":
        return { title: [{ type: "text", text: { content: String(value).slice(0, 2000) } }] };
    case "rich_text":
        return { rich_text: [{ type: "text", text: { content: String(value).slice(0, 2000) } }] };
    case "email":
        return { email: String(value) };
    case "phone":
        return { phone_number: String(value) };
    case "url":
        return { url: String(value) };
    case "select":
        return { select: { name: String(value) } };
    case "checkbox":
        return { checkbox: !!value };
    case "date":
        return { date: { start: String(value) } };
    case "number":
        return { number: Number(value) };
    default:
        return undefined;
    }
}

function buildProperties(lead) {
    const p = {};
    // Title is Company — fallback to email if company missing
    const title = lead.company || lead.email || "Unknown";
    p.Company = prop(title, "title");
    if (lead.contactName || lead.firstName) p["Contact Name"] = prop(lead.contactName || lead.firstName, "rich_text");
    if (lead.email) p.Email = prop(lead.email, "email");
    if (lead.phone) p.Phone = prop(lead.phone, "phone");
    if (lead.website) p.Website = prop(normalizeUrl(lead.website), "url");
    if (lead.city) p.City = prop(lead.city, "select");
    if (lead.role) p["Decision Maker Role"] = prop(lead.role, "select");
    if (lead.source) p.Source = prop(lead.source, "select");
    if (lead.campaign) p.Campaign = prop(lead.campaign, "select");
    if (lead.status) p.Status = prop(lead.status, "select");
    if (lead.temperature) p.Temperature = prop(lead.temperature, "select");
    if (lead.bucket) p.Bucket = prop(lead.bucket, "select");
    if (lead.nextAction) p["Next Action"] = prop(lead.nextAction, "rich_text");
    if (lead.notes) p.Notes = prop(lead.notes, "rich_text");
    if (lead.lastTouch) p["Last Touch"] = prop(lead.lastTouch, "date");
    if (lead.potentialMrrUsd) p["Potential MRR USD"] = prop(lead.potentialMrrUsd, "number");
    if (typeof lead.hr5GatesPassed === "boolean") p["HR-5 Gates Passed"] = prop(lead.hr5GatesPassed, "checkbox");
    // Strip undefined entries — Notion rejects them
    Object.keys(p).forEach((k) => { if (p[k] === undefined) delete p[k]; });
    return p;
}

function normalizeUrl(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
}

// ---- Find existing lead by email ----
async function findLeadByEmail(email, databaseId) {
    if (!email) return null;
    try {
        const res = await notion("POST", `/databases/${databaseId}/query`, {
            filter: { property: "Email", email: { equals: String(email).toLowerCase() } },
            page_size: 1,
        });
        return res.results?.[0] || null;
    } catch (err) {
        functions.logger.warn("notionLeadSync.findLeadByEmail failed:", err.response?.data || err.message);
        return null;
    }
}

// ---- Main entry point ----
/**
 * @param {object} lead
 * @param {string} [lead.email]
 * @param {string} [lead.firstName]
 * @param {string} [lead.contactName]
 * @param {string} [lead.company]
 * @param {string} [lead.phone]
 * @param {string} [lead.website]
 * @param {string} [lead.city] — one of the CRM City select options
 * @param {string} [lead.role] — one of the CRM Decision Maker Role options
 * @param {string} [lead.source] — one of the Source select options
 * @param {string} [lead.campaign] — friendly campaign name (e.g. "Trojan Horse")
 * @param {string} [lead.status] — one of the Status select options
 * @param {string} [lead.temperature] — one of the Temperature options
 * @param {string} [lead.bucket] — one of the Bucket options
 * @param {string} [lead.nextAction]
 * @param {string} [lead.notes]
 * @param {string} [lead.lastTouch] — ISO date string
 * @param {number} [lead.potentialMrrUsd]
 * @param {boolean} [lead.hr5GatesPassed]
 * @returns {Promise<{ok:boolean, action:"created"|"updated"|"skipped", pageId?:string, error?:string}>}
 */
async function upsertLead(lead) {
    const databaseId = process.env.NOTION_LEADS_CRM_ID || LEADS_CRM_FALLBACK;
    if (!lead || !lead.email) {
        return { ok: false, action: "skipped", error: "email is required" };
    }
    if (!process.env.NOTION_API_KEY) {
        return { ok: false, action: "skipped", error: "NOTION_API_KEY not set" };
    }

    const normalizedEmail = String(lead.email).toLowerCase().trim();
    const payload = { ...lead, email: normalizedEmail };

    try {
        const existing = await findLeadByEmail(normalizedEmail, databaseId);
        const properties = buildProperties(payload);

        if (existing) {
            // UPDATE: preserve existing Status unless this call is upgrading it.
            // Pipeline order: New < Contacted < Positive Reply < Audit Sent <
            // Calendly Booked < Proposal Sent < Closed Won. If the incoming
            // status is earlier than current, drop it — don't regress a
            // hot lead back to "Contacted" just because they replied again.
            const STAGE_ORDER = [
                "New", "Contacted", "Positive Reply", "Audit Sent",
                "Calendly Booked", "Proposal Sent", "Closed Won",
            ];
            const existingStatus = existing.properties?.Status?.select?.name;
            const newStatus = payload.status;
            if (existingStatus && newStatus) {
                const existingRank = STAGE_ORDER.indexOf(existingStatus);
                const newRank = STAGE_ORDER.indexOf(newStatus);
                if (existingRank > newRank) {
                    // Don't downgrade — strip Status + Temperature from update
                    delete properties.Status;
                    delete properties.Temperature;
                }
            }
            await notion("PATCH", `/pages/${existing.id}`, { properties });
            return { ok: true, action: "updated", pageId: existing.id };
        }

        // CREATE: fill required defaults
        if (!properties.Status) properties.Status = prop("New", "select");
        if (!properties.Temperature) properties.Temperature = prop("❄️ Cold", "select");
        const created = await notion("POST", "/pages", {
            parent: { database_id: databaseId },
            properties,
        });
        return { ok: true, action: "created", pageId: created.id };
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        functions.logger.error("notionLeadSync.upsertLead failed:", msg, "for", normalizedEmail);
        return { ok: false, action: "skipped", error: msg };
    }
}

module.exports = {
    upsertLead,
    outcomeToStatus,
    // Exported for tests / manual map updates
    INSTANTLY_CAMPAIGN_MAP,
};
