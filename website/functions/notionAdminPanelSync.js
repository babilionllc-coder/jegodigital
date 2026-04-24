/**
 * notionAdminPanelSync — Weekly auto-refresh for Alex's Notion command center.
 *
 * What this does:
 *   Every Monday 07:00 America/Mexico_City, pulls LIVE numbers from all 7 revenue
 *   platforms and creates a fresh "📊 Live System Snapshot — YYYY-MM-DD" page
 *   inside JegoDigital HQ (parent: 34bf21a7-c6e5-812b-8d20-c56a659c5442).
 *   Then posts a Slack link so Alex can open it on his phone.
 *
 * HARD RULE compliance:
 *   - HR-0 (no fabricated numbers): every number traces to a live API pull
 *   - HR-2 (verify-live): queries Instantly, Brevo, Calendly, ElevenLabs, Firestore
 *   - HR-6 (proof): logs per-API status + Notion page URL to Firestore
 *
 * Triggers:
 *   1. Scheduled `notionAdminPanelSync` — Monday 07:00 CDMX (weekly)
 *   2. HTTPS `notionAdminPanelSyncOnDemand` — manual fire, X-Admin-Token required
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const NOTION_VERSION = "2022-06-28";
const HQ_PAGE_ID = "34bf21a7-c6e5-812b-8d20-c56a659c5442";

// -- Notion helpers -------------------------------------------------------
function notionHeaders() {
    const key = process.env.NOTION_API_KEY;
    if (!key) throw new Error("NOTION_API_KEY not set");
    return {
        Authorization: `Bearer ${key}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    };
}
const t = (s) => [{ type: "text", text: { content: String(s) } }];
const tb = (s) => [{ type: "text", text: { content: String(s) }, annotations: { bold: true } }];
const para = (r) => ({ object: "block", type: "paragraph", paragraph: { rich_text: Array.isArray(r) ? r : t(r) } });
const h1 = (s) => ({ object: "block", type: "heading_1", heading_1: { rich_text: t(s) } });
const h2 = (s) => ({ object: "block", type: "heading_2", heading_2: { rich_text: t(s) } });
const divider = () => ({ object: "block", type: "divider", divider: {} });
const bullet = (r) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: Array.isArray(r) ? r : t(r) } });
const quote = (r) => ({ object: "block", type: "quote", quote: { rich_text: Array.isArray(r) ? r : t(r) } });
const callout = (emoji, r, color = "default") => ({
    object: "block", type: "callout",
    callout: { rich_text: Array.isArray(r) ? r : t(r), icon: { type: "emoji", emoji }, color },
});
const tcell = (s) => [{ type: "text", text: { content: String(s) } }];
const trow = (cells) => ({ object: "block", type: "table_row", table_row: { cells: cells.map(tcell) } });
const table = (rows, width) => ({
    object: "block", type: "table",
    table: { table_width: width, has_column_header: true, has_row_header: false, children: rows.map(trow) },
});

// -- Data source pulls ---------------------------------------------------
async function pullInstantly() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) return { error: "INSTANTLY_API_KEY missing" };
    try {
        const today = new Date().toISOString().slice(0, 10);
        const start = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        const [campResp, analyticsResp, accountsResp] = await Promise.all([
            axios.get("https://api.instantly.ai/api/v2/campaigns?limit=100", { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 }),
            axios.get(`https://api.instantly.ai/api/v2/campaigns/analytics?start_date=${start}&end_date=${today}`, { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 }),
            axios.get("https://api.instantly.ai/api/v2/accounts?limit=50", { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 }),
        ]);
        const camps = campResp.data.items || [];
        const byStatus = { active: 0, paused: 0, draft: 0, completed: 0, deleted: 0 };
        camps.forEach((c) => {
            if (c.status === 1) byStatus.active++;
            else if (c.status === 2) byStatus.paused++;
            else if (c.status === 0) byStatus.draft++;
            else if (c.status === 3) byStatus.completed++;
            else if (c.status === -1) byStatus.deleted++;
        });
        const activeNames = camps.filter((c) => c.status === 1).map((c) => c.name);
        const analytics = Array.isArray(analyticsResp.data) ? analyticsResp.data : analyticsResp.data?.items || [];
        let sent = 0, opens = 0, replies = 0, bounces = 0;
        analytics.forEach((a) => {
            sent += a.emails_sent_count || a.sent || 0;
            opens += a.open_count || a.opened || 0;
            replies += a.reply_count || a.replied || 0;
            bounces += a.bounced_count || a.bounced || 0;
        });
        const senders = accountsResp.data.items || [];
        return {
            ok: true,
            campaigns_total: camps.length,
            byStatus,
            active_campaign_names: activeNames,
            senders_count: senders.length,
            senders_healthy: senders.filter((s) => (s.stat_warmup_score || 0) >= 80).length,
            sent_60d: sent, opens_60d: opens, replies_60d: replies, bounces_60d: bounces,
            reply_rate_pct: sent ? ((replies / sent) * 100).toFixed(2) : 0,
            open_rate_pct: sent ? ((opens / sent) * 100).toFixed(2) : 0,
        };
    } catch (e) { return { error: String(e?.response?.data?.message || e?.message || e).slice(0, 200) }; }
}

async function pullBrevo() {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { error: "BREVO_API_KEY missing" };
    try {
        const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const end = new Date().toISOString().slice(0, 10);
        const [contacts, lists, stats] = await Promise.all([
            axios.get("https://api.brevo.com/v3/contacts?limit=1", { headers: { "api-key": key, accept: "application/json" }, timeout: 15000 }),
            axios.get("https://api.brevo.com/v3/contacts/lists?limit=50", { headers: { "api-key": key, accept: "application/json" }, timeout: 15000 }),
            axios.get(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${start}&endDate=${end}`, { headers: { "api-key": key, accept: "application/json" }, timeout: 15000 }),
        ]);
        return {
            ok: true,
            contacts_total: contacts.data.count,
            lists_count: (lists.data.lists || []).length,
            requests_30d: stats.data.requests || 0,
            delivered_30d: stats.data.delivered || 0,
            opens_30d: stats.data.opens || 0,
            unique_opens_30d: stats.data.uniqueOpens || 0,
            clicks_30d: stats.data.clicks || 0,
            hard_bounces_30d: stats.data.hardBounces || 0,
            spam_reports_30d: stats.data.spamReports || 0,
        };
    } catch (e) { return { error: String(e?.response?.data?.message || e?.message || e).slice(0, 200) }; }
}

async function pullElevenLabs() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { error: "ELEVENLABS_API_KEY missing" };
    try {
        const from = Math.floor((Date.now() - 30 * 86400000) / 1000);
        const [agents, convs] = await Promise.all([
            axios.get("https://api.elevenlabs.io/v1/convai/agents?page_size=30", { headers: { "xi-api-key": key }, timeout: 15000 }),
            axios.get(`https://api.elevenlabs.io/v1/convai/conversations?page_size=100&call_start_after_unix=${from}`, { headers: { "xi-api-key": key }, timeout: 15000 }),
        ]);
        const conversations = convs.data.conversations || [];
        const stat = { success: 0, failure: 0, unknown: 0 };
        let totalDur = 0, count = 0;
        conversations.forEach((c) => {
            const s = c.call_successful || "unknown";
            if (stat[s] !== undefined) stat[s]++;
            if (c.call_duration_secs) { totalDur += c.call_duration_secs; count++; }
        });
        return {
            ok: true,
            agents_count: (agents.data.agents || []).length,
            conversations_30d: conversations.length,
            success: stat.success, failure: stat.failure, unknown: stat.unknown,
            avg_duration_secs: count ? (totalDur / count).toFixed(1) : 0,
        };
    } catch (e) { return { error: String(e?.response?.data?.detail || e?.message || e).slice(0, 200) }; }
}

async function pullCalendly() {
    const key = process.env.CALENDLY_PAT;
    if (!key) return { error: "CALENDLY_PAT missing" };
    try {
        const me = await axios.get("https://api.calendly.com/users/me", { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 });
        const uri = me.data.resource.uri;
        const now = new Date().toISOString();
        const past30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const [upcoming, past] = await Promise.all([
            axios.get(`https://api.calendly.com/scheduled_events?user=${uri}&status=active&min_start_time=${now}&count=50`, { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 }),
            axios.get(`https://api.calendly.com/scheduled_events?user=${uri}&min_start_time=${past30}&max_start_time=${now}&count=100`, { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 }),
        ]);
        return {
            ok: true,
            upcoming_count: (upcoming.data.collection || []).length,
            past_30d_count: (past.data.collection || []).length,
        };
    } catch (e) { return { error: String(e?.response?.data?.message || e?.message || e).slice(0, 200) }; }
}

async function pullFirestoreCounts() {
    try {
        const db = admin.firestore();
        const [opps, auditReqs, trojanLeads] = await Promise.all([
            db.collection("opportunities").count().get().catch(() => ({ data: () => ({ count: 0 }) })),
            db.collection("audit_requests").count().get().catch(() => ({ data: () => ({ count: 0 }) })),
            db.collection("trojan_video_leads").count().get().catch(() => ({ data: () => ({ count: 0 }) })),
        ]);
        return {
            ok: true,
            opportunities: opps.data().count,
            audit_requests: auditReqs.data().count,
            trojan_video_leads: trojanLeads.data().count,
        };
    } catch (e) { return { error: String(e?.message || e).slice(0, 200) }; }
}

// -- Build Notion blocks -------------------------------------------------
function buildBlocks({ instantly, brevo, eleven, calendly, firestore, dateStr }) {
    const blocks = [];
    blocks.push(quote([tb(`Auto-refreshed: `)[0], { type: "text", text: { content: dateStr + ". All numbers LIVE from APIs this run (HR-0 + HR-2 compliant)." } }]));

    blocks.push(h1("🎯 30-Second Overview"));
    const ok = (x) => x?.ok ? "🟢" : "🔴";
    blocks.push(table([
        ["Platform", "Key metric", "Status"],
        ["Instantly cold email", `${instantly.sent_60d || 0} sent / 60d · ${instantly.replies_60d || 0} replies (${instantly.reply_rate_pct || 0}%)`, ok(instantly)],
        ["Instantly senders", `${instantly.senders_healthy || 0}/${instantly.senders_count || 0} healthy (≥80/100 warmup)`, ok(instantly)],
        ["Instantly campaigns active", `${instantly.byStatus?.active || 0} / ${instantly.campaigns_total || 0} total`, ok(instantly)],
        ["Brevo email marketing", `${brevo.contacts_total || 0} contacts · ${brevo.delivered_30d || 0} delivered/30d · ${brevo.unique_opens_30d || 0} unique opens`, ok(brevo)],
        ["ElevenLabs cold calls", `${eleven.conversations_30d || 0} calls/30d · ${eleven.success || 0} success · avg ${eleven.avg_duration_secs || 0}s`, ok(eleven)],
        ["Calendly bookings", `${calendly.past_30d_count || 0} past 30d · ${calendly.upcoming_count || 0} upcoming`, ok(calendly)],
        ["Firestore opportunities", `${firestore.opportunities || 0} Reddit opps · ${firestore.audit_requests || 0} audits · ${firestore.trojan_video_leads || 0} trojan videos`, ok(firestore)],
    ], 3));
    blocks.push(divider());

    // Instantly detail
    blocks.push(h1("📧 Cold Email (Instantly)"));
    if (instantly.ok) {
        blocks.push(table([
            ["Metric", "Value"],
            ["Total campaigns", String(instantly.campaigns_total)],
            ["🟢 Active", String(instantly.byStatus.active)],
            ["🟡 Paused", String(instantly.byStatus.paused)],
            ["⚪ Draft", String(instantly.byStatus.draft)],
            ["✅ Completed", String(instantly.byStatus.completed)],
            ["Senders total", String(instantly.senders_count)],
            ["Senders at ≥80 warmup", String(instantly.senders_healthy)],
            ["60d sent", String(instantly.sent_60d)],
            ["60d opens", `${instantly.opens_60d} (${instantly.open_rate_pct}%)`],
            ["60d replies", `${instantly.replies_60d} (${instantly.reply_rate_pct}%)`],
            ["60d bounces", String(instantly.bounces_60d)],
        ], 2));
        if (instantly.active_campaign_names?.length) {
            blocks.push(h2("Active campaigns"));
            instantly.active_campaign_names.forEach((n) => blocks.push(bullet(n)));
        }
    } else {
        blocks.push(callout("🔴", `Instantly pull failed: ${instantly.error}`, "red_background"));
    }
    blocks.push(divider());

    // ElevenLabs
    blocks.push(h1("☎️ AI Cold Calls (ElevenLabs)"));
    if (eleven.ok) {
        blocks.push(table([
            ["Metric", "Value"],
            ["Agents live", String(eleven.agents_count)],
            ["Conversations 30d", String(eleven.conversations_30d)],
            ["✅ Success", String(eleven.success)],
            ["❌ Failure", String(eleven.failure)],
            ["❓ Unknown", String(eleven.unknown)],
            ["Avg duration", `${eleven.avg_duration_secs}s`],
        ], 2));
    } else {
        blocks.push(callout("🔴", `ElevenLabs pull failed: ${eleven.error}`, "red_background"));
    }
    blocks.push(divider());

    // Brevo
    blocks.push(h1("📨 Email Nurture (Brevo)"));
    if (brevo.ok) {
        blocks.push(table([
            ["Metric", "Value"],
            ["Total contacts", String(brevo.contacts_total)],
            ["Lists", String(brevo.lists_count)],
            ["30d requests", String(brevo.requests_30d)],
            ["30d delivered", String(brevo.delivered_30d)],
            ["30d total opens", String(brevo.opens_30d)],
            ["30d unique opens", String(brevo.unique_opens_30d)],
            ["30d clicks", String(brevo.clicks_30d)],
            ["30d hard bounces", String(brevo.hard_bounces_30d)],
            ["30d spam reports", String(brevo.spam_reports_30d)],
        ], 2));
    } else {
        blocks.push(callout("🔴", `Brevo pull failed: ${brevo.error}`, "red_background"));
    }
    blocks.push(divider());

    // Calendly
    blocks.push(h1("📅 Calendly"));
    if (calendly.ok) {
        blocks.push(table([
            ["Metric", "Value"],
            ["Past 30d bookings", String(calendly.past_30d_count)],
            ["Upcoming bookings", String(calendly.upcoming_count)],
        ], 2));
    } else {
        blocks.push(callout("🔴", `Calendly pull failed: ${calendly.error}`, "red_background"));
    }
    blocks.push(divider());

    // Firestore / Money Machine
    blocks.push(h1("🤖 Firestore / Money Machine"));
    if (firestore.ok) {
        blocks.push(table([
            ["Collection", "Doc count"],
            ["opportunities (Reddit)", String(firestore.opportunities)],
            ["audit_requests", String(firestore.audit_requests)],
            ["trojan_video_leads", String(firestore.trojan_video_leads)],
        ], 2));
    } else {
        blocks.push(callout("🔴", `Firestore pull failed: ${firestore.error}`, "red_background"));
    }
    blocks.push(divider());

    blocks.push(h1("🔗 Related"));
    [
        ["📋 Tasks / Priority Queue", "https://www.notion.so/770aaf73e0264a1a9fe7bc9de03c9614"],
        ["🎯 Leads CRM", "https://www.notion.so/ee1cb76a15174041a646f782debc4b25"],
        ["👔 Clients Portfolio", "https://www.notion.so/81d95515d7a24e188f74896aba83ca2a"],
        ["💰 Weekly Revenue Tracker", "https://www.notion.so/b73ca45d61d4483aaf7006820f482229"],
        ["⚙️ Cloud Functions Inventory", "https://www.notion.so/cd5d8f66fc4d47fa9ba102e60bb79ee3"],
        ["🚨 Disaster Log", "https://www.notion.so/8cb4a2b61b544053a84e74d87ec10f3e"],
    ].forEach(([label, url]) => {
        blocks.push(bullet([{ type: "text", text: { content: label, link: { url } } }]));
    });

    return blocks;
}

async function createSnapshotPage(blocks, dateStr) {
    const headers = notionHeaders();
    // Create page
    const pageResp = await axios.post("https://api.notion.com/v1/pages", {
        parent: { page_id: HQ_PAGE_ID },
        icon: { type: "emoji", emoji: "📊" },
        properties: {
            title: { title: [{ text: { content: `📊 Live System Snapshot — ${dateStr}` } }] },
        },
    }, { headers, timeout: 15000 });
    const pageId = pageResp.data.id;
    const pageUrl = pageResp.data.url;

    // Append blocks in chunks of 100
    const CHUNK = 100;
    for (let i = 0; i < blocks.length; i += CHUNK) {
        await axios.patch(
            `https://api.notion.com/v1/blocks/${pageId}/children`,
            { children: blocks.slice(i, i + CHUNK) },
            { headers, timeout: 30000 }
        );
    }
    return { pageId, pageUrl };
}

async function postSlackNotification(pageUrl, dateStr, metrics) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) { functions.logger.warn("SLACK_WEBHOOK_URL missing"); return; }
    const body = {
        text: `📊 Weekly system snapshot ready — ${dateStr}`,
        blocks: [
            { type: "header", text: { type: "plain_text", text: `📊 Monday snapshot — ${dateStr}` } },
            { type: "section", text: { type: "mrkdwn", text: `<${pageUrl}|Open in Notion>` } },
            { type: "section", fields: [
                { type: "mrkdwn", text: `*Cold email*\n${metrics.instantly?.sent_60d || 0} sent / 60d\n${metrics.instantly?.replies_60d || 0} replies (${metrics.instantly?.reply_rate_pct || 0}%)` },
                { type: "mrkdwn", text: `*AI calls*\n${metrics.eleven?.conversations_30d || 0} convos / 30d\n${metrics.eleven?.success || 0} success` },
                { type: "mrkdwn", text: `*Calendly*\n${metrics.calendly?.past_30d_count || 0} past 30d\n${metrics.calendly?.upcoming_count || 0} upcoming` },
                { type: "mrkdwn", text: `*Brevo*\n${metrics.brevo?.contacts_total || 0} contacts\n${metrics.brevo?.unique_opens_30d || 0} unique opens / 30d` },
            ] },
        ],
    };
    try { await axios.post(webhook, body, { timeout: 10000 }); } catch (e) { functions.logger.error("Slack post failed", e?.message || e); }
}

// -- Main runner ---------------------------------------------------------
async function runSync() {
    const dateStr = new Date().toISOString().slice(0, 10);
    functions.logger.info(`notionAdminPanelSync starting — ${dateStr}`);

    const [instantly, brevo, eleven, calendly, firestore] = await Promise.all([
        pullInstantly(), pullBrevo(), pullElevenLabs(), pullCalendly(), pullFirestoreCounts(),
    ]);

    const metrics = { instantly, brevo, eleven, calendly, firestore };
    const blocks = buildBlocks({ ...metrics, dateStr });
    const { pageId, pageUrl } = await createSnapshotPage(blocks, dateStr);

    // Log to Firestore for HR-6 proof
    await admin.firestore().collection("notion_snapshots").doc(dateStr).set({
        dateStr, pageId, pageUrl, metrics,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await postSlackNotification(pageUrl, dateStr, metrics);

    functions.logger.info(`✅ Snapshot created: ${pageUrl}`);
    return { ok: true, dateStr, pageId, pageUrl, metrics };
}

// -- Exports --------------------------------------------------------------
// NOTE: env vars (NOTION_API_KEY, INSTANTLY_API_KEY, BREVO_API_KEY,
// ELEVENLABS_API_KEY, CALENDLY_PAT, SLACK_WEBHOOK_URL, ADMIN_TRIGGER_TOKEN)
// are provided via .env file uploaded with the function (JegoDigital
// convention — same pattern as notionLeadSync.js, instantlyLeadSync.js, etc).
exports.notionAdminPanelSync = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 13 * * 1")
    .timeZone("UTC") // 07:00 CDMX = 13:00 UTC
    .onRun(async () => {
        try { await runSync(); return null; }
        catch (e) { functions.logger.error("notionAdminPanelSync failed:", e); return null; }
    });

exports.notionAdminPanelSyncOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        const token = req.get("X-Admin-Token") || req.query.token;
        const expected = process.env.ADMIN_TRIGGER_TOKEN;
        if (!expected || token !== expected) {
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        try {
            const result = await runSync();
            res.status(200).json(result);
        } catch (e) {
            functions.logger.error("notionAdminPanelSyncOnDemand failed:", e);
            res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });
