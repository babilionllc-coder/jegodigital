/**
 * instantlyNotionBackfill — one-shot (manually triggered) Cloud Function that
 * pulls ALL existing Instantly leads across all campaigns and upserts them into
 * the Notion 🎯 Leads CRM.
 *
 * Why a BACKFILL (vs the real-time `instantlyReplyWatcher`):
 *   - instantlyReplyWatcher fires only when a NEW reply lands in Unibox
 *   - backfill populates the CRM with everything Instantly already knows about:
 *     every lead in every campaign, plus their per-lead analytics (sent,
 *     opened, replied, bounced) as best available from the v2 API.
 *
 * Trigger:
 *   curl -X POST https://us-central1-jegodigital-e02fb.cloudfunctions.net/instantlyNotionBackfill \
 *     -H "X-Admin-Token: $ADMIN_TRIGGER_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"dry_run": false, "max_leads": 5000}'
 *
 * Parameters:
 *   - dry_run (bool)   — if true, count and classify but do not upsert. Default false.
 *   - max_leads (int)  — safety cap; default 5000 per run.
 *   - campaign_ids     — optional array of Instantly campaign IDs. If omitted,
 *                        all active + paused campaigns are pulled.
 *   - skip_status      — optional array of Status select names to skip upserting
 *                        (e.g. ["Closed Won"]) to preserve pipeline progress.
 *
 * Required env:
 *   INSTANTLY_API_KEY      — Instantly v2 API key (existing)
 *   NOTION_API_KEY         — Notion integration token (existing)
 *   NOTION_LEADS_CRM_ID    — CRM database ID (existing)
 *   ADMIN_TRIGGER_TOKEN    — shared secret to prevent unauthenticated fires
 *
 * Idempotency:
 *   - `notionLeadSync.upsertLead()` dedups by email.
 *   - Pipeline-progress guard inside upsertLead prevents regression
 *     (e.g. "Closed Won" won't go back to "Contacted" just because the lead
 *     is still in a nurture campaign).
 *
 * HR-0 compliance:
 *   - Every field written originates from a live Instantly API call in THIS run.
 *     No fabricated data. Source=Instantly Cold Email, Campaign=live campaign_id
 *     mapped via notionLeadSync.INSTANTLY_CAMPAIGN_MAP (falls through to raw id).
 */

const axios = require("axios");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const notionLeadSync = require("./notionLeadSync");

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const DEFAULT_MAX_LEADS = 5000;

// ---------- Instantly API helpers ----------
async function instantlyGet(path, params = {}) {
    const qs = Object.keys(params).length
        ? "?" + new URLSearchParams(params).toString()
        : "";
    const res = await axios({
        method: "GET",
        url: `${INSTANTLY_BASE}${path}${qs}`,
        headers: {
            Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
            "Content-Type": "application/json",
        },
        timeout: 30000,
    });
    return res.data;
}

async function instantlyPost(path, body) {
    const res = await axios({
        method: "POST",
        url: `${INSTANTLY_BASE}${path}`,
        headers: {
            Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
            "Content-Type": "application/json",
        },
        data: body,
        timeout: 30000,
    });
    return res.data;
}

async function listCampaigns() {
    const d = await instantlyGet("/campaigns", { limit: 100 });
    const items = d.items || d || [];
    // Filter out archived
    return items.filter((c) => c.status !== -1);
}

async function listLeadsForCampaign(campaignId, cap) {
    const leads = [];
    let skip = 0;
    const pageSize = 100;
    while (leads.length < cap) {
        let page;
        try {
            // v2 POST /leads/list with filters
            page = await instantlyPost("/leads/list", {
                campaign: campaignId,
                limit: pageSize,
                skip,
            });
        } catch (err) {
            functions.logger.warn(`Instantly /leads/list failed for ${campaignId}:`, err.response?.data || err.message);
            break;
        }
        const items = page.items || page.data || [];
        if (!items.length) break;
        leads.push(...items);
        if (items.length < pageSize) break;
        skip += pageSize;
    }
    return leads.slice(0, cap);
}

// ---------- Classification: Instantly lead → Notion upsert payload ----------
function mapStatus(lead) {
    // Instantly lead status signals → Notion Status + Temperature
    // status field meanings (observed):
    //   1 = Active (in rotation)  2 = Paused  3 = Completed
    // flags: replied=1, bounced=1, unsubscribed=1
    const hasReplied = !!lead.replied_count || lead.reply_status === "positive";
    const hasBounced = !!lead.bounced || lead.esp_code === "bounce";
    const hasUnsub = !!lead.unsubscribed;
    const opens = lead.opened_count || 0;
    const sent = lead.sent_count || 0;

    if (hasUnsub || hasBounced) {
        return { status: "No Response", temperature: "🪦 Dead" };
    }
    if (hasReplied) {
        // If we have reply sentiment, map it — else assume neutral "Contacted"
        const senti = lead.reply_sentiment || lead.last_reply_classification;
        if (senti === "positive") return { status: "Positive Reply", temperature: "🔥 Hot" };
        if (senti === "negative") return { status: "No Response", temperature: "🪦 Dead" };
        return { status: "Contacted", temperature: "🌤️ Warm" };
    }
    if (opens > 0) return { status: "Contacted", temperature: "🌤️ Warm" };
    if (sent > 0) return { status: "Contacted", temperature: "❄️ Cold" };
    return { status: "New", temperature: "❄️ Cold" };
}

function toNotionPayload(lead, campaign) {
    // Extract the best email+name+company from Instantly's varied shape
    const email = (lead.email || "").toLowerCase().trim();
    if (!email) return null;

    // Campaign name mapping (falls through to raw ID if unknown)
    const campaignName = notionLeadSync.INSTANTLY_CAMPAIGN_MAP[campaign.id] ||
        campaign.name || (campaign.id ? `Instantly: ${String(campaign.id).slice(0, 8)}` : null);

    const { status, temperature } = mapStatus(lead);
    const firstName = lead.first_name || lead.firstName || lead.name || "";
    const company = lead.company_name || lead.company || lead.companyName || "";
    const website = lead.website || lead.website_url || lead.domain || "";
    const phone = lead.phone || lead.phone_number || "";
    const cityRaw = lead.city || lead.location_city || "";

    // Last-touch date = most recent of sent/opened/replied timestamps
    const touchTs = lead.replied_at || lead.last_reply_at
        || lead.opened_at || lead.last_opened_at
        || lead.sent_at || lead.last_sent_at
        || lead.created_at || null;
    const lastTouch = touchTs ? new Date(touchTs).toISOString().slice(0, 10) : null;

    // Notes: compress lead activity into one human-readable line
    const activity = [];
    if (lead.sent_count) activity.push(`sent=${lead.sent_count}`);
    if (lead.opened_count) activity.push(`opens=${lead.opened_count}`);
    if (lead.replied_count || lead.reply_status) activity.push(`replies=${lead.replied_count || 1}`);
    if (lead.bounced) activity.push("BOUNCED");
    if (lead.unsubscribed) activity.push("UNSUBSCRIBED");
    const notes = `Instantly backfill · ${campaign.name || campaign.id} · ${activity.join(" ")}`.slice(0, 1800);

    return {
        email,
        firstName: firstName || undefined,
        company: company || undefined,
        website: website || undefined,
        phone: phone || undefined,
        city: normalizeCity(cityRaw),
        source: "Instantly Cold Email",
        campaign: campaignName,
        status,
        temperature,
        notes,
        lastTouch: lastTouch || undefined,
    };
}

// Normalize city to match Notion select whitelist
const CITY_WHITELIST = new Set([
    "CDMX", "Cancún", "Tulum", "Playa del Carmen", "Mérida",
    "Guadalajara", "Monterrey", "Querétaro", "Miami", "Other MX",
]);
function normalizeCity(raw) {
    if (!raw) return undefined;
    const s = String(raw).trim();
    const lc = s.toLowerCase();
    // Direct match
    for (const w of CITY_WHITELIST) {
        if (w.toLowerCase() === lc) return w;
    }
    // Fuzzy matches
    if (/mexico\s*city|ciudad\s*de\s*mexico|cdmx|df/i.test(s)) return "CDMX";
    if (/cancun|canc\u00fan/i.test(s)) return "Cancún";
    if (/tulum/i.test(s)) return "Tulum";
    if (/playa\s*del\s*carmen|pdc/i.test(s)) return "Playa del Carmen";
    if (/merida|m\u00e9rida/i.test(s)) return "Mérida";
    if (/guadalajara|gdl/i.test(s)) return "Guadalajara";
    if (/monterrey|mty/i.test(s)) return "Monterrey";
    if (/quer[e\u00e9]taro/i.test(s)) return "Querétaro";
    if (/miami/i.test(s)) return "Miami";
    return "Other MX";
}

// ---------- Main HTTP handler ----------
exports.instantlyNotionBackfill = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        // Auth gate
        const adminToken = req.get("X-Admin-Token") || req.query.admin_token;
        if (!process.env.ADMIN_TRIGGER_TOKEN) {
            return res.status(500).json({ ok: false, error: "ADMIN_TRIGGER_TOKEN not configured" });
        }
        if (adminToken !== process.env.ADMIN_TRIGGER_TOKEN) {
            return res.status(403).json({ ok: false, error: "invalid admin token" });
        }

        if (!process.env.INSTANTLY_API_KEY) {
            return res.status(500).json({ ok: false, error: "INSTANTLY_API_KEY not set" });
        }
        if (!process.env.NOTION_API_KEY) {
            return res.status(500).json({ ok: false, error: "NOTION_API_KEY not set" });
        }

        const dryRun = req.body.dry_run === true || req.query.dry_run === "true";
        const maxLeads = Math.min(Number(req.body.max_leads || req.query.max_leads) || DEFAULT_MAX_LEADS, 10000);
        const onlyCampaignIds = req.body.campaign_ids || null;
        const skipStatus = new Set(req.body.skip_status || ["Closed Won", "Calendly Booked", "Proposal Sent"]);

        const runLog = {
            started_at: new Date().toISOString(),
            dry_run: dryRun,
            max_leads: maxLeads,
            campaigns_scanned: 0,
            leads_seen: 0,
            leads_created: 0,
            leads_updated: 0,
            leads_skipped: 0,
            leads_errored: 0,
            errors: [],
            per_campaign: {},
        };

        try {
            const campaigns = (await listCampaigns())
                .filter((c) => !onlyCampaignIds || onlyCampaignIds.includes(c.id));
            runLog.campaigns_scanned = campaigns.length;
            functions.logger.info(`backfill: scanning ${campaigns.length} campaigns, dry_run=${dryRun}, cap=${maxLeads}`);

            for (const camp of campaigns) {
                if (runLog.leads_seen >= maxLeads) break;
                const leftover = maxLeads - runLog.leads_seen;
                const campLeads = await listLeadsForCampaign(camp.id, leftover);
                const counts = { seen: 0, created: 0, updated: 0, skipped: 0, errored: 0 };
                for (const lead of campLeads) {
                    counts.seen += 1;
                    runLog.leads_seen += 1;
                    const payload = toNotionPayload(lead, camp);
                    if (!payload) { counts.skipped += 1; runLog.leads_skipped += 1; continue; }
                    if (skipStatus.has(payload.status)) {
                        counts.skipped += 1; runLog.leads_skipped += 1; continue;
                    }
                    if (dryRun) { counts.skipped += 1; runLog.leads_skipped += 1; continue; }
                    try {
                        const r = await notionLeadSync.upsertLead(payload);
                        if (r.ok && r.action === "created") { counts.created += 1; runLog.leads_created += 1; }
                        else if (r.ok && r.action === "updated") { counts.updated += 1; runLog.leads_updated += 1; }
                        else { counts.errored += 1; runLog.leads_errored += 1; runLog.errors.push(`${payload.email}: ${r.error}`); }
                    } catch (err) {
                        counts.errored += 1; runLog.leads_errored += 1;
                        runLog.errors.push(`${payload.email}: ${err.message}`);
                    }
                }
                runLog.per_campaign[camp.name || camp.id] = counts;
                functions.logger.info(`backfill: campaign=${camp.name || camp.id} counts=${JSON.stringify(counts)}`);
            }
        } catch (err) {
            runLog.errors.push(`FATAL: ${err.message}`);
            functions.logger.error("backfill fatal:", err);
        }

        // Persist run log for observability
        try {
            await admin.firestore().collection("instantly_notion_backfill_runs")
                .add({ ...runLog, finished_at: new Date().toISOString() });
        } catch (e) {
            functions.logger.warn("failed to persist run log:", e.message);
        }

        return res.status(200).json({
            ok: runLog.errors.length === 0,
            ...runLog,
            finished_at: new Date().toISOString(),
        });
    });
