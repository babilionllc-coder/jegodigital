/**
 * instantlyLeadSync — bidirectional sync between Instantly + Notion 🎯 Leads CRM.
 *
 * Two scheduled jobs:
 *   1. instantlyLeadSync        (every 15 min) — pull NEW Instantly leads → upsert Notion
 *   2. instantlyReplySync        (every 5 min) — pull POSITIVE replies → mark Notion "warm" + Slack alert
 *
 * Plus HTTP triggers for manual/test:
 *   3. instantlyLeadSyncOnDemand
 *   4. instantlyReplySyncOnDemand
 *
 * Notion DB: ee1cb76a-1517-4041-a646-f782debc4b25 (🎯 Leads CRM)
 * Instantly campaigns: MX 45454ff8-6d2f-48db-8c62-e0c19a94a3c1, US e1b8ceaf-bbe9-4522-b805-869223e9fc66
 *
 * Dedupe: Notion pages keyed by Email property (upsert by filtering existing).
 */
const functions = require("firebase-functions");
const axios     = require("axios");
const admin     = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const INSTANTLY_API       = "https://api.instantly.ai/api/v2";
const NOTION_API          = "https://api.notion.com/v1";
const NOTION_VERSION      = "2022-06-28";
const NOTION_LEADS_CRM_ID = "ee1cb76a-1517-4041-a646-f782debc4b25";
const SLACK_UA            = "JegoDigital-LeadSync/1.0";

// Instantly campaigns we sync from (extend as more campaigns go live)
const TRACKED_CAMPAIGNS = [
    { id: "45454ff8-6d2f-48db-8c62-e0c19a94a3c1", name: "signal_outbound_mx",   source: "Instantly MX"     },
    { id: "e1b8ceaf-bbe9-4522-b805-869223e9fc66", name: "signal_outbound_miami",source: "Instantly Miami"  },
];

// ========== HTTP helpers ==========
async function instantly(method, path, body = null) {
    const headers = {
        Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
        "User-Agent":   "curl/8.4.0",  // Cloudflare bypass
    };
    try {
        const r = await axios({ method, url: INSTANTLY_API + path, headers, data: body, timeout: 20000 });
        return r.data;
    } catch (e) {
        functions.logger.warn(`Instantly ${method} ${path}:`, e.response?.status, String(e.response?.data || e.message).slice(0,300));
        return null;
    }
}

async function notion(method, path, body = null) {
    const headers = {
        Authorization:  `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    };
    try {
        const r = await axios({ method, url: NOTION_API + path, headers, data: body, timeout: 15000 });
        return r.data;
    } catch (e) {
        functions.logger.warn(`Notion ${method} ${path}:`, e.response?.status, String(e.response?.data || e.message).slice(0,300));
        return null;
    }
}

async function slackPost(text) {
    // 2026-04-25: routed to #daily-ops (quiet sync logs) via slackPost helper.
    try {
        const { slackPost: routedPost } = require('./slackPost');
        await routedPost('daily-ops', { text });
    } catch (e) { functions.logger.warn("Slack post failed:", e.message); }
}

// ========== Notion helpers ==========
async function findNotionLeadByEmail(email) {
    if (!email) return null;
    const r = await notion("POST", `/databases/${NOTION_LEADS_CRM_ID}/query`, {
        filter: { property: "Email", email: { equals: email } },
        page_size: 1,
    });
    return (r?.results || [])[0] || null;
}

async function createNotionLead(lead, campaignMeta) {
    const props = {
        "Company":  { title: [{ text: { content: lead.company_name || lead.website || "(no company)" } }] },
        "Contact Name": { rich_text: [{ text: { content: `${lead.first_name||""} ${lead.last_name||""}`.trim() } }] },
        "Email":    { email: lead.email || null },
        "Phone":    { phone_number: lead.phone || null },
        "Website":  { url: lead.website ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`) : null },
        "Source":   { select: { name: campaignMeta.source } },
        "Campaign": { select: { name: campaignMeta.name } },
        "Status":   { select: { name: "New" } },
        "Temperature": { select: { name: "Cold" } },
        "HR-5 Gates Passed": { checkbox: true },
        "Last Touch": { date: { start: new Date().toISOString() } },
    };
    // Attach opener + pain in Notes
    const payload = (lead.payload || {});
    const opener = payload.personalized_opener || lead.personalization || "";
    const topPain = payload.top_pain || "";
    const painDetail = payload.pain_detail || "";
    const score = payload.signal_score || "";
    if (opener || topPain) {
        props["Notes"] = { rich_text: [{ text: { content:
            `Opener: ${opener.slice(0,500)}\n\nTop pain: ${topPain} — ${painDetail}\nSignal score: ${score}`
        }}]};
    }
    return await notion("POST", "/pages", {
        parent: { database_id: NOTION_LEADS_CRM_ID },
        properties: props,
    });
}

async function updateNotionLeadToWarm(pageId, replyText, replyAt) {
    return await notion("PATCH", `/pages/${pageId}`, {
        properties: {
            "Status":      { select: { name: "Replied" } },
            "Temperature": { select: { name: "Warm" } },
            "Last Touch":  { date: { start: replyAt || new Date().toISOString() } },
            "Next Action": { rich_text: [{ text: { content: `Reply: ${String(replyText||"").slice(0,400)}` } }] },
        },
    });
}

// ========== Core sync logic ==========
async function syncCampaignLeads(campaign, syncState) {
    const data = await instantly("POST", "/leads/list", {
        campaign: campaign.id,
        limit: 100,
    });
    const items = data?.items || [];
    let created = 0, skipped = 0, errors = 0;
    const lastSeenId = syncState.last_seen_id_by_campaign?.[campaign.id];
    const newIds = [];
    for (const lead of items) {
        const email = lead.email;
        if (!email) { skipped++; continue; }
        try {
            const existing = await findNotionLeadByEmail(email);
            if (existing) { skipped++; continue; }
            const result = await createNotionLead(lead, campaign);
            if (result) { created++; newIds.push(lead.id); }
            else errors++;
        } catch (e) { errors++; functions.logger.warn(`sync fail ${email}:`, e.message); }
    }
    return { campaign: campaign.name, scanned: items.length, created, skipped, errors };
}

// ========== 1. instantlyLeadSync (every 15 min) ==========
async function doLeadSync() {
    const stateRef = db.collection("_sync_state").doc("instantly_to_notion");
    const state = (await stateRef.get()).data() || {};
    const results = [];
    for (const c of TRACKED_CAMPAIGNS) {
        results.push(await syncCampaignLeads(c, state));
    }
    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    await stateRef.set({ last_run_at: admin.firestore.FieldValue.serverTimestamp(), results }, { merge: true });
    if (totalCreated > 0) {
        const breakdown = results.map(r => `${r.campaign}: +${r.created} new`).join(" · ");
        await slackPost(`🔄 *Notion CRM synced* — ${totalCreated} new leads imported\n${breakdown}`);
    }
    return { totalCreated, totalSkipped, results };
}

exports.instantlyLeadSync = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("every 15 minutes")
    .onRun(async () => { await doLeadSync(); return null; });

exports.instantlyLeadSyncOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        const out = await doLeadSync();
        return res.json({ ok: true, ...out });
    });

// ========== 2. instantlyReplySync (every 5 min) — warm reply alerts ==========
async function doReplySync() {
    // Query leads with recent replies via Instantly reply_count > 0 filter
    // (Instantly doesn't expose a direct reply feed — we scan campaigns for leads
    //  with email_reply_count > 0 that we haven't yet flagged as warm)
    const stateRef = db.collection("_sync_state").doc("instantly_replies_to_notion");
    const state = (await stateRef.get()).data() || { processed_lead_ids: [] };
    const processed = new Set(state.processed_lead_ids || []);
    const newWarm = [];
    for (const c of TRACKED_CAMPAIGNS) {
        const data = await instantly("POST", "/leads/list", { campaign: c.id, limit: 100 });
        const items = data?.items || [];
        for (const lead of items) {
            if ((lead.email_reply_count || 0) < 1) continue;
            if (processed.has(lead.id)) continue;
            // This lead replied. Find in Notion + mark warm.
            const page = await findNotionLeadByEmail(lead.email);
            if (page) {
                await updateNotionLeadToWarm(page.id, lead.last_reply_text || "(see Instantly Unibox)", lead.timestamp_last_reply);
                processed.add(lead.id);
                newWarm.push({ email: lead.email, company: lead.company_name, campaign: c.name });
            }
        }
    }
    // Alert Slack for every new warm lead
    for (const w of newWarm) {
        await slackPost(
            `🔥 *WARM LEAD* — ${w.company || w.email} just replied in ${w.campaign}\n` +
            `Email: ${w.email}\n` +
            `Open Instantly Unibox: https://app.instantly.ai/app/unibox\n` +
            `_Marked 'Warm' in Notion 🎯 Leads CRM._`
        );
    }
    await stateRef.set({
        last_run_at: admin.firestore.FieldValue.serverTimestamp(),
        processed_lead_ids: Array.from(processed).slice(-1000),  // cap state size
        new_warm_this_run: newWarm.length,
    }, { merge: true });
    return { newWarm: newWarm.length, leads: newWarm };
}

exports.instantlyReplySync = functions
    .runWith({ timeoutSeconds: 180, memory: "256MB" })
    .pubsub.schedule("every 5 minutes")
    .onRun(async () => { await doReplySync(); return null; });

exports.instantlyReplySyncOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        const out = await doReplySync();
        return res.json({ ok: true, ...out });
    });
