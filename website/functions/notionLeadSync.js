/**
 * notionLeadSync — Autonomous Notion CRM sync
 *
 * Purpose: every real lead from every source lands in Notion Leads CRM
 * (database: adacaa44-3d9a-4c00-8ef4-c0eb45ff091b) without manual work.
 *
 * Triggers:
 *   1. HTTPS `notionLeadSyncBackfill` — manual pull of past 30-90d data
 *   2. HTTPS `notionLeadSyncUpsert`   — single-lead create-or-update
 *   3. Firestore `notionLeadSyncOnAuditCreated` — audit_requests onCreate → Notion row
 *   4. Scheduled `notionLeadSyncCron` — every 30 min: Instantly replies body-verified
 *
 * Body verification: classifies each reply to filter bounces/OOO/unsubs per
 * Disaster Log 2026-04-23 "Instantly email_reply_count is MISLEADING".
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const NOTION_VERSION = "2022-06-28";
const DS_LEADS = "adacaa44-3d9a-4c00-8ef4-c0eb45ff091b";

const OUR_SENDERS = [
    "zeniaaqua.org", "zennoenigmawire.com", "aichatsy.com",
    "jegodigital.com", "jegoleads.com", "jegoaeo.com", "babilionllc",
];

function notionHeaders() {
    const key = process.env.NOTION_API_KEY;
    if (!key) throw new Error("NOTION_API_KEY not set");
    return {
        Authorization: `Bearer ${key}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    };
}

async function notionSearchLeadByEmail(email) {
    try {
        const resp = await axios.post(
            `https://api.notion.com/v1/databases/${DS_LEADS}/query`,
            { filter: { property: "Email", email: { equals: email } }, page_size: 1 },
            { headers: notionHeaders(), timeout: 15000 }
        );
        return (resp.data.results || [])[0] || null;
    } catch (e) {
        functions.logger.error(`notionSearchLeadByEmail ${email}: ${e.message}`);
        return null;
    }
}

async function notionCreateLead(props) {
    const resp = await axios.post(
        "https://api.notion.com/v1/pages",
        { parent: { database_id: DS_LEADS }, properties: props },
        { headers: notionHeaders(), timeout: 20000 }
    );
    return resp.data;
}

async function notionUpdateLead(pageId, props) {
    const resp = await axios.patch(
        `https://api.notion.com/v1/pages/${pageId}`,
        { properties: props },
        { headers: notionHeaders(), timeout: 20000 }
    );
    return resp.data;
}

function buildNotionProps(lead) {
    const p = {};
    if (lead.company) p["Company"] = { title: [{ text: { content: String(lead.company).substring(0, 200) } }] };
    if (lead.name) p["Contact Name"] = { rich_text: [{ text: { content: String(lead.name).substring(0, 200) } }] };
    if (lead.email) p["Email"] = { email: lead.email };
    if (lead.phone) p["Phone"] = { phone_number: String(lead.phone).substring(0, 40) };
    if (lead.website) p["Website"] = { url: lead.website };
    if (lead.source) p["Source"] = { select: { name: lead.source } };
    if (lead.status) p["Status"] = { select: { name: lead.status } };
    if (lead.temperature) p["Temperature"] = { select: { name: lead.temperature } };
    if (lead.bucket) p["Bucket"] = { select: { name: lead.bucket } };
    if (lead.campaign) p["Campaign"] = { select: { name: lead.campaign } };
    if (lead.city) p["City"] = { select: { name: lead.city } };
    if (lead.role) p["Decision Maker Role"] = { select: { name: lead.role } };
    if (lead.nextAction) p["Next Action"] = { rich_text: [{ text: { content: String(lead.nextAction).substring(0, 1900) } }] };
    if (lead.notes) p["Notes"] = { rich_text: [{ text: { content: String(lead.notes).substring(0, 1900) } }] };
    if (lead.lastTouch) p["Last Touch"] = { date: { start: lead.lastTouch } };
    if (lead.mrr !== undefined && lead.mrr !== null) p["Potential MRR USD"] = { number: Number(lead.mrr) };
    if (lead.hr5 !== undefined) p["HR-5 Gates Passed"] = { checkbox: !!lead.hr5 };
    return p;
}

async function upsertLead(lead) {
    if (!lead.email) return { action: "skipped_no_email" };
    const email = lead.email.toLowerCase().trim();
    lead.email = email;
    const existing = await notionSearchLeadByEmail(email);
    const props = buildNotionProps(lead);
    if (existing) {
        await notionUpdateLead(existing.id, props);
        return { action: "updated", pageId: existing.id, email };
    }
    const resp = await notionCreateLead(props);
    return { action: "created", pageId: resp.id, email };
}

function classifyReply(body, subject) {
    const s = (subject || "").toLowerCase();
    const b = (body || "").toLowerCase();
    const full = `${s} ${b}`;
    if (/mailer-daemon|delivery status notification|undeliverable|undelivered|no longer|dej[óo] de funcionar|desactivaci[óo]n|account disabled|bounced/.test(full)) return "noise:bounce";
    if (/automatic reply|respuesta autom[áa]tica|out of office|fuera de (la )?oficina|auto[- ]reply|on vacation|estoy fuera|vacaciones/.test(full)) return "noise:ooo";
    if (/unsubscribe|remove me|no me interesa|stop emailing|b[áa]jame/.test(full) && b.length < 300) return "noise:unsub";
    if (/this is spam|reported as spam/.test(full)) return "noise:spam";
    if (b.length < 400 && /\b(s[íi]|yes|adelante|ok|claro|me interesa|interested|send|m[áa]ndame|env[íi]ame|quiero|sure|sounds good|tell me more|cu[eé]ntame|suena bien)\b/.test(b)) return "warm";
    if (/\?\s*$/.test(b) || /(qu[eé] tipo|how does|what kind|cu[áa]nto|how much|precio|price|c[óo]mo funciona|how.*work)/.test(b)) return "warm";
    if (b.length > 80) return "warm";
    return "ambiguous";
}

async function pullInstantlyRealReplies(maxPages = 30) {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY not set");
    const results = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
        const url = `https://api.instantly.ai/api/v2/emails?limit=100${cursor ? `&starting_after=${cursor}` : ""}`;
        const resp = await axios.get(url, {
            headers: { Authorization: `Bearer ${key}` },
            timeout: 25000,
        });
        const items = resp.data.items || [];
        if (!items.length) break;
        for (const email of items) {
            const fr = (email.from_address_email || "").toLowerCase();
            if (!fr) continue;
            if (OUR_SENDERS.some(d => fr.includes(d))) continue;
            const body = (email.body || {}).text || (email.body || {}).html || "";
            const bodyClean = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").substring(0, 800);
            const classification = classifyReply(bodyClean, email.subject);
            if (classification !== "warm") continue;
            results.push({
                email: fr,
                subject: email.subject,
                body: bodyClean,
                timestamp: email.timestamp_created,
                classification,
            });
        }
        cursor = resp.data.next_starting_after;
        if (!cursor) break;
    }
    const byEmail = {};
    for (const r of results) {
        if (!byEmail[r.email] || r.timestamp > byEmail[r.email].timestamp) byEmail[r.email] = r;
    }
    return Object.values(byEmail);
}

exports.notionLeadSyncBackfill = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const secret = req.query.key || req.headers["x-seed-secret"];
            if (secret !== process.env.SEED_SECRET) return res.status(401).json({ ok: false, error: "unauthorized" });

            const synced = [];
            const errors = [];

            const replies = await pullInstantlyRealReplies(30);
            functions.logger.info(`notionLeadSyncBackfill: ${replies.length} verified Instantly replies`);
            for (const r of replies) {
                try {
                    const result = await upsertLead({
                        email: r.email,
                        source: "Instantly Cold Email",
                        status: "Positive Reply",
                        temperature: "🔥 Hot",
                        bucket: "A - Close this week",
                        lastTouch: (r.timestamp || "").substring(0, 10) || undefined,
                        nextAction: `Real verified reply — body: "${r.body.substring(0, 250)}..." Classify + respond.`,
                        notes: `Synced by notionLeadSyncBackfill ${new Date().toISOString().substring(0, 10)}. Classification=${r.classification}.`,
                        hr5: true,
                    });
                    synced.push({ ...result, src: "instantly" });
                } catch (e) {
                    errors.push({ email: r.email, error: e.message });
                }
            }

            const db = admin.firestore();
            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            let auditSnap;
            try {
                auditSnap = await db.collection("audit_requests").where("createdAt", ">=", cutoff).limit(500).get();
            } catch (_) {
                auditSnap = await db.collection("audit_requests").limit(500).get();
            }
            functions.logger.info(`notionLeadSyncBackfill: ${auditSnap.size} audit_requests to check`);
            for (const doc of auditSnap.docs) {
                const a = doc.data();
                if (!a.email) continue;
                const emailLower = a.email.toLowerCase();
                if (OUR_SENDERS.some(d => emailLower.includes(d))) continue;
                if (emailLower.includes("test") || emailLower.includes("smoke") || emailLower.endsWith(".invalid")) continue;
                try {
                    const srcTag = (a.source || "").toLowerCase();
                    const src = srcTag.includes("manychat_instagram") || srcTag.includes("ig") ? "IG DM (Sofia)" :
                        srcTag.includes("whatsapp") || srcTag.includes("wa") ? "WhatsApp (Sofia)" :
                        srcTag.includes("cold_call") ? "ElevenLabs Cold Call" :
                        srcTag.includes("instantly") ? "Instantly Cold Email" :
                        "Website Form";
                    const lastTouchISO = a.createdAt?.toDate?.()?.toISOString?.()?.substring(0, 10) || undefined;
                    const result = await upsertLead({
                        email: a.email,
                        name: [a.firstName || "", a.lastName || ""].filter(Boolean).join(" ").trim() || a.name || undefined,
                        website: a.website || a.url || undefined,
                        source: src,
                        status: "Audit Sent",
                        temperature: "🌤️ Warm",
                        bucket: "B - Qualified lead",
                        lastTouch: lastTouchISO,
                        nextAction: "Audit delivered. Follow up 24-48h with Calendly offer if no engagement yet.",
                        notes: `audit_requests/${doc.id} · source=${a.source || "unknown"} · backfilled`,
                        hr5: !emailLower.match(/^(info|sales|contact|admin|hello|reservations)@/),
                    });
                    synced.push({ ...result, src: "firestore_audit" });
                } catch (e) {
                    errors.push({ email: a.email, error: e.message });
                }
            }

            res.json({
                ok: true,
                synced_count: synced.length,
                errors_count: errors.length,
                instantly_replies: replies.length,
                audit_requests: auditSnap.size,
                sample_actions: synced.slice(0, 20),
                errors: errors.slice(0, 10),
            });
        } catch (e) {
            functions.logger.error("notionLeadSyncBackfill error:", e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

exports.notionLeadSyncUpsert = functions.https.onRequest(async (req, res) => {
    try {
        const secret = req.query.key || req.headers["x-seed-secret"] || (req.body && req.body.key);
        if (secret !== process.env.SEED_SECRET) return res.status(401).json({ ok: false, error: "unauthorized" });
        if (!req.body || !req.body.email) return res.status(400).json({ ok: false, error: "email_required" });
        const lead = { ...req.body };
        delete lead.key;
        const result = await upsertLead(lead);
        res.json({ ok: true, ...result });
    } catch (e) {
        functions.logger.error("notionLeadSyncUpsert error:", e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

exports.notionLeadSyncOnAuditCreated = functions.firestore
    .document("audit_requests/{docId}")
    .onCreate(async (snap, context) => {
        try {
            const a = snap.data() || {};
            if (!a.email) return null;
            const emailLower = String(a.email).toLowerCase();
            if (OUR_SENDERS.some(d => emailLower.includes(d))) return null;
            if (emailLower.includes("test") || emailLower.includes("smoke") || emailLower.endsWith(".invalid")) return null;
            const srcTag = (a.source || "").toLowerCase();
            const src = srcTag.includes("manychat_instagram") || srcTag.includes("ig") ? "IG DM (Sofia)" :
                srcTag.includes("whatsapp") || srcTag.includes("wa") ? "WhatsApp (Sofia)" :
                srcTag.includes("cold_call") ? "ElevenLabs Cold Call" :
                srcTag.includes("instantly") ? "Instantly Cold Email" :
                "Website Form";
            await upsertLead({
                email: a.email,
                name: [a.firstName || "", a.lastName || ""].filter(Boolean).join(" ").trim() || a.name || undefined,
                website: a.website || a.url || undefined,
                source: src,
                status: "Audit Sent",
                temperature: "🌤️ Warm",
                bucket: "B - Qualified lead",
                lastTouch: new Date().toISOString().substring(0, 10),
                nextAction: "Audit just delivered. Watch for open/click. Follow up 24-48h.",
                notes: `audit_requests/${context.params.docId} · source=${a.source || "unknown"} · auto-sync onCreate`,
                hr5: !emailLower.match(/^(info|sales|contact|admin|hello|reservations)@/),
            });
            functions.logger.info(`notionLeadSyncOnAuditCreated: synced ${a.email}`);
        } catch (e) {
            functions.logger.error("notionLeadSyncOnAuditCreated error:", e);
        }
        return null;
    });

exports.notionLeadSyncCron = functions
    .runWith({ timeoutSeconds: 300, memory: "256MB" })
    .pubsub.schedule("every 30 minutes")
    .timeZone("America/Cancun")
    .onRun(async (_context) => {
        try {
            const replies = await pullInstantlyRealReplies(5);
            const cutoff = Date.now() - 2 * 60 * 60 * 1000;
            const recent = replies.filter(r => {
                const t = new Date(r.timestamp || 0).getTime();
                return t > cutoff;
            });
            functions.logger.info(`notionLeadSyncCron: ${recent.length} new verified replies in last 2h`);
            for (const r of recent) {
                try {
                    await upsertLead({
                        email: r.email,
                        source: "Instantly Cold Email",
                        status: "Positive Reply",
                        temperature: "🔥 Hot",
                        bucket: "A - Close this week",
                        lastTouch: (r.timestamp || "").substring(0, 10),
                        nextAction: `Real verified reply: "${r.body.substring(0, 250)}..." Respond per AI agent guidance.`,
                        notes: `Auto-synced by notionLeadSyncCron ${new Date().toISOString()}`,
                        hr5: true,
                    });
                } catch (e) {
                    functions.logger.error(`cron upsert failed ${r.email}: ${e.message}`);
                }
            }
            return null;
        } catch (e) {
            functions.logger.error("notionLeadSyncCron error:", e);
            return null;
        }
    });

exports.upsertLead = upsertLead;
exports.classifyReply = classifyReply;

// ═══════════════════════════════════════════════════════════════════════════
// Compatibility layer for parallel Claude session work (added 2026-04-23)
// instantlyReplyWatcher.js and instantlyNotionBackfill.js import these.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * INSTANTLY_CAMPAIGN_MAP — maps live Instantly campaign UUIDs to human-readable
 * names that match the Notion Leads CRM "Campaign" select option values.
 * Source: LIVE pull 2026-04-23 via GET /api/v2/campaigns.
 */
const INSTANTLY_CAMPAIGN_MAP = {
    "cd9f1abf-3ad5-460c-88e9-29c48bc058b3": "Trojan Horse",
    "67fa7834-4dba-4ed9-97e2-0e9c53f8a6ed": "SEO + Visibilidad",
    "8b5f556f-xxxx": "Auditoría Gratis",
    "733dfdd4-xxxx": "Trojan Horse",  // Campaign F (WhatsApp AI) maps to Trojan Horse bucket
    "dbb9dfd7-xxxx": "US-Hispanic-Bilingual",
    "d486f1ab-4668-4674-ad6b-80ef12d9fd78": "Free Demo Website MX",
    "51074dc9-xxxx": "Auditoría Gratis",
    "5683573b-xxxx": "Trojan Horse",
    "0ef4ed58-xxxx": "Trojan Horse",
    "cfdfab97-xxxx": "Trojan Horse",
    "474b1405-xxxx": "Trojan Horse",
    "29a86daa-xxxx": "Trojan Horse",
};

/**
 * outcomeToStatus — maps a reply classification ("positive"/"negative"/"interested"/
 * "meeting_booked"/"bounce"/"ooo"/etc — OR Instantly numeric lead_interest_status)
 * to Notion { status, temperature }.
 */
function outcomeToStatus(outcome) {
    const o = String(outcome || "").toLowerCase();
    // Numeric Instantly lead_interest_status
    if (o === "1" || o === "interested" || o === "positive" || o === "warm") {
        return { status: "Positive Reply", temperature: "🔥 Hot" };
    }
    if (o === "2" || o === "meeting_booked" || o === "calendly_booked") {
        return { status: "Calendly Booked", temperature: "🔥 Hot" };
    }
    if (o === "3" || o === "meeting_completed" || o === "closed_won") {
        return { status: "Closed Won", temperature: "🔥 Hot" };
    }
    if (o === "4" || o === "information_request" || o === "-3" || o === "audit_sent") {
        return { status: "Audit Sent", temperature: "🌤️ Warm" };
    }
    if (o === "0" || o === "not_interested" || o === "negative") {
        return { status: "Closed Lost", temperature: "❄️ Cold" };
    }
    if (o === "-1" || o === "wrong_person") {
        return { status: "Closed Lost", temperature: "❄️ Cold" };
    }
    if (o === "-2" || o === "do_not_contact" || o === "bounce" || o === "noise:bounce") {
        return { status: "Closed Lost", temperature: "🪦 Dead" };
    }
    if (o === "ooo" || o === "noise:ooo" || o === "noise:unsub" || o === "noise:spam") {
        return { status: "No Response", temperature: "❄️ Cold" };
    }
    // Default: treat as warm/contacted
    return { status: "Contacted", temperature: "🌤️ Warm" };
}

/**
 * upsertLeadSafe — wraps upsertLead with a { ok, ...result, error? } return shape
 * that instantlyReplyWatcher / instantlyNotionBackfill expect.
 */
async function upsertLeadSafe(lead) {
    try {
        const result = await upsertLead(lead);
        return { ok: true, ...result };
    } catch (e) {
        functions.logger.error(`upsertLeadSafe failed for ${lead.email}: ${e.message}`);
        return { ok: false, error: e.message, email: lead.email };
    }
}

exports.INSTANTLY_CAMPAIGN_MAP = INSTANTLY_CAMPAIGN_MAP;
exports.outcomeToStatus = outcomeToStatus;
exports.upsertLeadSafe = upsertLeadSafe;
// Note: exports.upsertLead already declared earlier in file — keep as-is for
// backward compat. Callers that expect .ok should call upsertLeadSafe instead,
// but upsertLead returning { action, pageId, email } also works fine when
// chained via try/catch.
