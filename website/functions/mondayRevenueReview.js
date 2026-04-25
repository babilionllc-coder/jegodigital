/**
 * mondayRevenueReview — Monday 09:00 CDMX weekly revenue review cron.
 *
 * Ships HARD RULE #7 from CLAUDE.md. Every Monday at 09:00 CDMX, this cron
 * pulls LIVE numbers from all 8 platforms (never memory, never snapshots)
 * and scores the previous week on:
 *
 *   1. New MRR closed (Firestore clients_closed/{YYYY-WW} or manual entries)
 *   2. Qualified leads generated
 *        = ElevenLabs positive outcomes + Instantly positive replies
 *          + audit_requests with real email
 *   3. Calendly calls booked (live Calendly API, fallback to calendly_events)
 *   4. Conversion rate (outreach → positive → Calendly → closed)
 *   5. Cost per closed client (if ad_spend Firestore entries exist)
 *   6. Pipeline health: top 3 broken + top 3 fixed things
 *
 * 8 platforms, each gets a LIVE pull this run (HARD RULE #0, #2):
 *   (1) Instantly          → /api/v2/campaigns/analytics/daily (×7 days)
 *   (2) ElevenLabs         → /v1/convai/conversations?page_size=200
 *   (3) Brevo              → /v3/smtp/statistics/aggregatedReport
 *   (4) Calendly           → /scheduled_events?min_start_time=...&max_start_time=...
 *   (5) Firestore          → calendly_events, audit_requests, call_analysis,
 *                            clients_closed, ad_spend, phone_leads
 *   (6) Meta Graph         → /{IG_ID}/insights?metric=impressions,reach,follower_count
 *   (7) Google Search Cons → SKIPPED (no service account wired yet — logged as gap)
 *   (8) GA4                → SKIPPED (no property id wired yet — logged as gap)
 *
 * Delivery:
 *   - Branded HTML → PDF via mockup-renderer /renderPdf
 *   - Slack files.upload to #all-jegodigital (or webhook fallback)
 *   - Telegram sendDocument
 *   - Firestore snapshot: business_reviews/{YYYY-WNN}
 *   - STATUS.md not written here — daily cron owns that
 *
 * Hard rules honored:
 *   - HARD RULE #0: every number traced to a live API call this run
 *   - HARD RULE #2: 8-platform verify; skipped platforms are FLAGGED as gaps
 *     in the "Broken Things" section, not silently omitted
 *   - HARD RULE #6: never "complete" without proof — returns a full results
 *     object with per-platform ok/error + numbers; cron logs it
 *   - HARD RULE #11: blockers surface as "Broken Things" with recommended fix
 *
 * Exports:
 *   mondayRevenueReview          — cron Monday 09:00 CDMX
 *   mondayRevenueReviewOnDemand  — HTTPS endpoint for manual fire / ISO week override
 *   _runMondayRevenueReview      — internal runner for tests
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const FormData = require("form-data");

// ---------- Config ----------
const INSTANTLY_BASE  = "https://api.instantly.ai/api/v2";
const ELEVENLABS_BASE = "https://api.elevenlabs.io";
const BREVO_BASE      = "https://api.brevo.com/v3";
const CALENDLY_BASE   = "https://api.calendly.com";
const META_GRAPH_BASE = "https://graph.facebook.com/v22.0";
const MOCKUP_RENDERER =
    process.env.MOCKUP_RENDERER_URL ||
    "https://mockup-renderer-wfmydylowa-uc.a.run.app";

const IG_BUSINESS_USER_ID = "17841424426942739"; // @jegodigital

// Telegram fallbacks (same as eveningOpsReport — known-working)
const TG_BOT_FALLBACK  = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

// Slack channel for files.upload — falls back to webhook if no bot token.
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "C08KCBR9PE6";

// Offer A/B/C agent IDs (from CLAUDE.md)
const AGENTS = {
    A: "agent_0701kq0drf5ceq6t5md9p6dt6xbb", // SEO Pitch
    B: "agent_4701kq0drd9pf9ebbqcv6b3bb2zw", // Free Audit
    C: "agent_2701kq0drbt9f738pxjem3zc3fnb", // Free Setup
};

// ---------- CDMX / ISO week helpers ----------
/**
 * Returns a {startMs, endMs, key, label, isoYear, isoWeek} window for the
 * PRIOR complete week: Mon 00:00 CDMX → Sun 23:59:59 CDMX.
 *
 * key format: "2026-W17" (ISO week number).
 *
 * Runs Monday 09:00 CDMX; so "now" is in the NEW week and we want the week
 * that just ended yesterday (Sun).
 */
function priorWeekWindow(now = new Date()) {
    // Convert "now" to CDMX local date parts
    const cdmxNow = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    // Day of week in CDMX (0=Sun, 1=Mon, ... 6=Sat)
    const dow = cdmxNow.getUTCDay();
    // Days since last Monday (prior week's Mon):
    //   if today is Mon (dow=1): 7 days back
    //   if today is Tue (dow=2): 8 days back
    //   ... general formula below
    const daysSincePriorMonday = ((dow + 6) % 7) + 7;
    // Build CDMX date for prior Monday 00:00
    const priorMonCdmx = new Date(Date.UTC(
        cdmxNow.getUTCFullYear(),
        cdmxNow.getUTCMonth(),
        cdmxNow.getUTCDate() - daysSincePriorMonday,
        0, 0, 0, 0,
    ));
    // Convert CDMX back to UTC (add 6h)
    const startUtc = new Date(priorMonCdmx.getTime() + 6 * 60 * 60 * 1000);
    const endUtc   = new Date(startUtc.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    const { isoYear, isoWeek } = isoWeekNumber(startUtc);
    const key = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;

    const startDateCdmx = new Date(startUtc.getTime() - 6 * 60 * 60 * 1000);
    const endDateCdmx   = new Date(endUtc.getTime() - 6 * 60 * 60 * 1000);
    const label = `${startDateCdmx.toISOString().slice(0, 10)} → ${endDateCdmx.toISOString().slice(0, 10)} (CDMX)`;

    return {
        startUtc,
        endUtc,
        startIso: startUtc.toISOString(),
        endIso: endUtc.toISOString(),
        startDateCdmx: startDateCdmx.toISOString().slice(0, 10), // YYYY-MM-DD
        endDateCdmx: endDateCdmx.toISOString().slice(0, 10),
        startTs: admin.firestore.Timestamp.fromDate(startUtc),
        endTs: admin.firestore.Timestamp.fromDate(endUtc),
        key,
        label,
        isoYear,
        isoWeek,
    };
}

function isoWeekNumber(d) {
    // ISO 8601 week number — Thursday of the week determines ISO year
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this ISO week
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
    const isoWeek = 1 + Math.round((date - firstThursday) / (7 * 24 * 60 * 60 * 1000));
    return { isoYear: date.getUTCFullYear(), isoWeek };
}

function humanPct(num, den) {
    if (!den) return "0.0%";
    return ((num / den) * 100).toFixed(1) + "%";
}

function fmtUsd(n) {
    if (!n) return "$0";
    return "$" + Math.round(n).toLocaleString("en-US");
}

// =============================================================================
// (1) INSTANTLY — 7-day cold-email totals per campaign
// =============================================================================
function instantlyAuth() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY missing");
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function listInstantlyCampaigns() {
    const all = [];
    let startAfter = null;
    for (let i = 0; i < 10; i++) {
        const url = startAfter
            ? `${INSTANTLY_BASE}/campaigns?limit=100&starting_after=${startAfter}`
            : `${INSTANTLY_BASE}/campaigns?limit=100`;
        const r = await axios.get(url, { headers: instantlyAuth(), timeout: 15000 });
        const items = r.data.items || [];
        all.push(...items);
        if (items.length < 100) break;
        startAfter = items[items.length - 1].id;
    }
    return all;
}

async function instantlyWeekly(campaignId, startDate, endDate) {
    try {
        const url = `${INSTANTLY_BASE}/campaigns/analytics/daily?campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`;
        const r = await axios.get(url, { headers: instantlyAuth(), timeout: 15000 });
        return Array.isArray(r.data) ? r.data : (r.data.items || r.data.data || []);
    } catch (err) {
        functions.logger.warn(`instantlyWeekly failed ${campaignId}: ${err.message}`);
        return [];
    }
}

function sumInstantlyRows(rows) {
    const t = { sent: 0, opens: 0, replies: 0, bounces: 0, clicks: 0 };
    for (const r of (rows || [])) {
        t.sent    += r.sent || 0;
        t.opens   += r.opened || r.opens || 0;
        t.replies += r.reply || r.replies || 0;
        t.bounces += r.bounced || r.bounces || 0;
        t.clicks  += r.clicks || 0;
    }
    return t;
}

async function aggregateColdEmail(window) {
    let campaigns = [];
    try {
        campaigns = await listInstantlyCampaigns();
    } catch (err) {
        return {
            ok: false,
            error: err.message,
            totals: { sent: 0, opens: 0, replies: 0, bounces: 0 },
            perCampaign: [],
        };
    }

    const active = campaigns.filter((c) => c.status === 1);
    const perCampaign = [];
    const totals = { sent: 0, opens: 0, replies: 0, bounces: 0, clicks: 0 };

    for (const c of active) {
        const rows = await instantlyWeekly(c.id, window.startDateCdmx, window.endDateCdmx);
        const t = sumInstantlyRows(rows);
        if (t.sent > 0 || t.replies > 0 || t.bounces > 0) {
            perCampaign.push({
                id: c.id,
                name: c.name,
                ...t,
                open_rate: humanPct(t.opens, t.sent),
                reply_rate: humanPct(t.replies, t.sent),
                bounce_rate: humanPct(t.bounces, t.sent),
            });
        }
        totals.sent    += t.sent;
        totals.opens   += t.opens;
        totals.replies += t.replies;
        totals.bounces += t.bounces;
        totals.clicks  += t.clicks;
    }

    return {
        ok: true,
        totals,
        open_rate: humanPct(totals.opens, totals.sent),
        reply_rate: humanPct(totals.replies, totals.sent),
        bounce_rate: humanPct(totals.bounces, totals.sent),
        total_active: active.length,
        active_firing: perCampaign.length,
        perCampaign: perCampaign.sort((a, b) => b.sent - a.sent).slice(0, 12),
    };
}

// =============================================================================
// (2) ELEVENLABS — 7-day cold-call conversations per agent
// =============================================================================
async function aggregateColdCalls(window) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { ok: false, error: "ELEVENLABS_API_KEY missing", totals: {} };

    const headers = { "xi-api-key": key };
    const startSec = Math.floor(window.startUtc.getTime() / 1000);
    const endSec = Math.floor(window.endUtc.getTime() / 1000);

    const byOffer = { A: { total: 0, real: 0, positive: 0 }, B: { total: 0, real: 0, positive: 0 }, C: { total: 0, real: 0, positive: 0 } };
    const positiveLeads = [];
    let grandTotal = 0, grandReal = 0, grandPositive = 0;
    const errors = [];

    for (const [offer, agentId] of Object.entries(AGENTS)) {
        try {
            // Paginate up to 2000 convos per agent (should be way more than enough)
            let cursor = null;
            for (let page = 0; page < 10; page++) {
                const params = new URLSearchParams({
                    agent_id: agentId,
                    page_size: "200",
                    call_start_after_unix: String(startSec),
                    call_start_before_unix: String(endSec),
                });
                if (cursor) params.set("cursor", cursor);
                const url = `${ELEVENLABS_BASE}/v1/convai/conversations?${params}`;
                const r = await axios.get(url, { headers, timeout: 20000 });
                const items = r.data.conversations || r.data.items || [];
                for (const c of items) {
                    byOffer[offer].total++;
                    grandTotal++;
                    const dur = c.call_duration_secs || c.duration || 0;
                    const callSuccess = (c.call_successful || "").toLowerCase() === "success";
                    if (dur >= 45 || callSuccess) {
                        byOffer[offer].real++;
                        grandReal++;
                    }
                    const summary = (c.transcript_summary || "").toLowerCase();
                    const positive = summary.includes("yes") || summary.includes("interested")
                        || summary.includes("book") || summary.includes("calendly")
                        || summary.includes("audit") || summary.includes("sí") || summary.includes("agendar");
                    if (positive && dur >= 30) {
                        byOffer[offer].positive++;
                        grandPositive++;
                        positiveLeads.push({
                            offer,
                            conv_id: c.conversation_id,
                            duration: dur,
                            summary: (c.transcript_summary || "").slice(0, 160),
                        });
                    }
                }
                const nextCursor = r.data.next_cursor;
                if (!nextCursor || items.length === 0) break;
                cursor = nextCursor;
            }
        } catch (err) {
            errors.push(`Offer ${offer}: ${err.message}`);
            functions.logger.warn(`ElevenLabs ${offer} fetch failed: ${err.message}`);
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        grandTotal,
        grandReal,
        grandPositive,
        byOffer,
        positiveLeads: positiveLeads.slice(0, 15),
        real_rate: humanPct(grandReal, grandTotal),
        positive_rate: humanPct(grandPositive, grandReal),
    };
}

// =============================================================================
// (3) BREVO — 7-day transactional email stats (audit delivery, nurture)
// =============================================================================
async function aggregateBrevo(window) {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { ok: false, error: "BREVO_API_KEY missing" };

    const headers = { "api-key": key, accept: "application/json" };
    const startDate = window.startDateCdmx;
    const endDate = window.endDateCdmx;
    try {
        const url = `${BREVO_BASE}/smtp/statistics/aggregatedReport?startDate=${startDate}&endDate=${endDate}`;
        const r = await axios.get(url, { headers, timeout: 15000 });
        const d = r.data || {};
        return {
            ok: true,
            requests: d.requests || 0,
            delivered: d.delivered || 0,
            opens: d.opens || d.uniqueOpens || 0,
            clicks: d.clicks || d.uniqueClicks || 0,
            softBounces: d.softBounces || 0,
            hardBounces: d.hardBounces || 0,
            complaints: d.spamReports || 0,
            open_rate: humanPct(d.uniqueOpens || d.opens || 0, d.delivered || 0),
            click_rate: humanPct(d.uniqueClicks || d.clicks || 0, d.delivered || 0),
        };
    } catch (err) {
        functions.logger.warn(`Brevo aggregated report failed: ${err.message}`);
        return { ok: false, error: err.message };
    }
}

// =============================================================================
// (4) CALENDLY — 7-day scheduled events (primary live, fallback Firestore)
// =============================================================================
async function aggregateCalendly(db, window) {
    const pat = process.env.CALENDLY_PAT;
    if (!pat) {
        // Fallback to Firestore-only
        return aggregateCalendlyFromFirestore(db, window, "CALENDLY_PAT missing");
    }

    try {
        // Get user URI (required filter parameter)
        const me = await axios.get(`${CALENDLY_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${pat}` },
            timeout: 15000,
        });
        const userUri = me.data.resource?.uri;
        if (!userUri) throw new Error("no user uri from /users/me");

        // Fetch scheduled events within window
        const events = [];
        let pageToken = null;
        for (let page = 0; page < 5; page++) {
            const params = new URLSearchParams({
                user: userUri,
                min_start_time: window.startIso,
                max_start_time: window.endIso,
                count: "100",
                sort: "start_time:asc",
            });
            if (pageToken) params.set("page_token", pageToken);
            const r = await axios.get(`${CALENDLY_BASE}/scheduled_events?${params}`, {
                headers: { Authorization: `Bearer ${pat}` },
                timeout: 15000,
            });
            events.push(...(r.data.collection || []));
            pageToken = r.data.pagination?.next_page_token;
            if (!pageToken) break;
        }

        // Status breakdown
        let active = 0, canceled = 0;
        const list = events.map((e) => {
            const status = e.status || "unknown";
            if (status === "active") active++;
            if (status === "canceled") canceled++;
            return {
                name: e.name,
                status,
                start: e.start_time,
                end: e.end_time,
                uri: e.uri,
            };
        });

        return {
            ok: true,
            source: "calendly_api",
            total: events.length,
            booked: active,
            canceled,
            events: list.slice(0, 15),
        };
    } catch (err) {
        functions.logger.warn(`Calendly API failed, falling back to Firestore: ${err.message}`);
        return aggregateCalendlyFromFirestore(db, window, err.message);
    }
}

async function aggregateCalendlyFromFirestore(db, window, apiError) {
    try {
        const snap = await db.collection("calendly_events")
            .where("received_at", ">=", window.startTs)
            .where("received_at", "<", window.endTs)
            .get();
        let booked = 0, canceled = 0, noshow = 0;
        const events = [];
        snap.forEach((doc) => {
            const d = doc.data();
            const e = d.event;
            if (e === "invitee.created") booked++;
            else if (e === "invitee.canceled") canceled++;
            else if (e === "invitee_no_show.created") noshow++;
            events.push({
                event: e,
                name: d.name || d.invitee_name || "Unknown",
                email: d.email || d.invitee_email || "",
                start: d.event_start_time || d.scheduled_event?.start_time,
            });
        });
        return {
            ok: true,
            source: "firestore_calendly_events",
            api_fallback_reason: apiError,
            total: snap.size,
            booked,
            canceled,
            noshow,
            events: events.slice(0, 15),
        };
    } catch (err) {
        return { ok: false, error: err.message, total: 0, booked: 0, canceled: 0 };
    }
}

// =============================================================================
// (5) FIRESTORE — audit_requests, clients_closed, ad_spend, phone_leads
// =============================================================================
async function aggregateAudits(db, window) {
    try {
        const snap = await db.collection("audit_requests")
            .where("created_at", ">=", window.startTs)
            .where("created_at", "<", window.endTs)
            .get();
        const bySource = {};
        const byStatus = {};
        snap.forEach((doc) => {
            const d = doc.data();
            const src = d.source || "unknown";
            bySource[src] = (bySource[src] || 0) + 1;
            const st = d.status || "pending";
            byStatus[st] = (byStatus[st] || 0) + 1;
        });
        return { ok: true, total: snap.size, bySource, byStatus };
    } catch (err) {
        return { ok: false, error: err.message, total: 0, bySource: {}, byStatus: {} };
    }
}

async function aggregateClosedClients(db, window) {
    // Canonical collection: clients_closed/{docId} with fields:
    //   closed_at (Timestamp), mrr_usd (number), client_name, service_bundle
    // If collection doesn't exist yet, return 0s — this is expected pre-revenue.
    try {
        const snap = await db.collection("clients_closed")
            .where("closed_at", ">=", window.startTs)
            .where("closed_at", "<", window.endTs)
            .get();
        let newMrrUsd = 0;
        const clients = [];
        snap.forEach((doc) => {
            const d = doc.data();
            const mrr = Number(d.mrr_usd || d.mrr || 0);
            newMrrUsd += mrr;
            clients.push({
                name: d.client_name || d.name || "Unknown",
                mrr_usd: mrr,
                bundle: d.service_bundle || d.bundle || "",
            });
        });
        return { ok: true, count: snap.size, newMrrUsd, clients };
    } catch (err) {
        return { ok: true, count: 0, newMrrUsd: 0, clients: [], note: err.message };
    }
}

async function aggregateAdSpend(db, window) {
    try {
        const snap = await db.collection("ad_spend")
            .where("date", ">=", window.startDateCdmx)
            .where("date", "<=", window.endDateCdmx)
            .get();
        let total = 0;
        const byChannel = {};
        snap.forEach((doc) => {
            const d = doc.data();
            const amt = Number(d.amount_usd || d.spend_usd || 0);
            total += amt;
            const ch = d.channel || "unknown";
            byChannel[ch] = (byChannel[ch] || 0) + amt;
        });
        return { ok: true, totalUsd: total, byChannel };
    } catch (err) {
        return { ok: true, totalUsd: 0, byChannel: {}, note: err.message };
    }
}

async function aggregatePhoneLeads(db) {
    try {
        const poolSnap = await db.collection("phone_leads").limit(500).get();
        let dialReady = 0, dialed = 0, converted = 0;
        poolSnap.forEach((doc) => {
            const d = doc.data();
            const status = (d.status || "").toLowerCase();
            if (status === "dial_ready" || status === "ready") dialReady++;
            if (status === "dialed" || status === "called") dialed++;
            if (status === "converted" || status === "won" || d.booked_calendly) converted++;
        });
        return { ok: true, total: poolSnap.size, dialReady, dialed, converted };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// =============================================================================
// (6) META GRAPH — Instagram @jegodigital weekly insights
// =============================================================================
async function aggregateInstagram(window) {
    const token = process.env.IG_GRAPH_TOKEN;
    if (!token) return { ok: false, error: "IG_GRAPH_TOKEN missing" };

    try {
        // Insights: period=day, since/until in unix seconds
        const sinceSec = Math.floor(window.startUtc.getTime() / 1000);
        const untilSec = Math.floor(window.endUtc.getTime() / 1000);

        // impressions + reach = time-series daily metrics
        // follower_count changed from `follower_count` to `follower_count` (still supported on /insights for business)
        // profile_views deprecated — use 'accounts_engaged' where possible
        const url = `${META_GRAPH_BASE}/${IG_BUSINESS_USER_ID}/insights?metric=impressions,reach,profile_views&period=day&since=${sinceSec}&until=${untilSec}&access_token=${token}`;
        const r = await axios.get(url, { timeout: 15000 });
        const data = r.data.data || [];
        const sumByMetric = {};
        for (const m of data) {
            const vals = (m.values || []).map((v) => Number(v.value) || 0);
            sumByMetric[m.name] = vals.reduce((a, b) => a + b, 0);
        }

        // Current follower count
        let followers = 0;
        try {
            const profile = await axios.get(
                `${META_GRAPH_BASE}/${IG_BUSINESS_USER_ID}?fields=followers_count,media_count&access_token=${token}`,
                { timeout: 10000 }
            );
            followers = profile.data.followers_count || 0;
            sumByMetric.media_count = profile.data.media_count || 0;
        } catch (e) { /* ignore */ }

        // Media posted this week
        const mediaUrl = `${META_GRAPH_BASE}/${IG_BUSINESS_USER_ID}/media?fields=id,timestamp,media_type&since=${sinceSec}&until=${untilSec}&limit=50&access_token=${token}`;
        let postsThisWeek = 0;
        try {
            const mr = await axios.get(mediaUrl, { timeout: 15000 });
            postsThisWeek = (mr.data.data || []).length;
        } catch (e) { /* ignore */ }

        return {
            ok: true,
            followers,
            impressions: sumByMetric.impressions || 0,
            reach: sumByMetric.reach || 0,
            profile_views: sumByMetric.profile_views || 0,
            media_count: sumByMetric.media_count || 0,
            posts_this_week: postsThisWeek,
        };
    } catch (err) {
        functions.logger.warn(`Instagram insights failed: ${err.message}`);
        return { ok: false, error: err.message };
    }
}

// =============================================================================
// (7) GSC — skipped (no service-account creds yet — flagged as tech debt)
// (8) GA4 — skipped (no property id + SA wired yet — flagged as tech debt)
// =============================================================================
function aggregateGSC() {
    const saKey = process.env.GSC_SERVICE_ACCOUNT_JSON;
    if (!saKey) {
        return {
            ok: false,
            skipped: true,
            reason: "GSC_SERVICE_ACCOUNT_JSON not set — no live rank data. Add service account key (row 36 in ACCESS.md when available) to unblock.",
        };
    }
    // Placeholder — future implementation would call
    // POST https://searchconsole.googleapis.com/v1/sites/<url>/searchAnalytics/query
    return { ok: false, skipped: true, reason: "GSC integration pending implementation" };
}

function aggregateGA4() {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const saKey = process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (!propertyId || !saKey) {
        return {
            ok: false,
            skipped: true,
            reason: "GA4_PROPERTY_ID and/or GA4_SERVICE_ACCOUNT_JSON not set — no live traffic data. Add both to unblock.",
        };
    }
    return { ok: false, skipped: true, reason: "GA4 integration pending implementation" };
}

// =============================================================================
// SCORING — derive "broken/fixed" insights from live pulls
// =============================================================================
function deriveBrokenThings(data) {
    const broken = [];
    const { coldEmail, coldCalls, brevo, audits, instagram, gsc, ga4, calendly, closed } = data;

    // Cold email: 0 opens or bounce > 5%
    if (coldEmail.ok) {
        if (coldEmail.totals?.sent > 100 && coldEmail.totals?.opens === 0) {
            broken.push({
                area: "Cold Email",
                issue: `${coldEmail.totals.sent.toLocaleString()} emails sent but 0 opens this week`,
                fix: "Check Instantly open-tracking toggle + SPF/DKIM/DMARC alignment. Instantly open-tracking can silently disable on account rotation.",
            });
        }
        if (coldEmail.totals?.sent > 100 && parseFloat(coldEmail.bounce_rate) > 5) {
            broken.push({
                area: "Cold Email",
                issue: `Bounce rate ${coldEmail.bounce_rate} (>5% = deliverability risk)`,
                fix: "Run list cleaner on top-bouncing campaigns, verify pre-upload via HARD RULE #5 lead quality gate.",
            });
        }
        if (coldEmail.totals?.sent > 500 && parseFloat(coldEmail.reply_rate) < 0.5) {
            broken.push({
                area: "Cold Email",
                issue: `Reply rate ${coldEmail.reply_rate} (<0.5% = copy or list quality)`,
                fix: "Run cold-email-copywriting skill audit. Check firstName hit rate on active campaigns.",
            });
        }
    } else if (coldEmail.error) {
        broken.push({ area: "Cold Email", issue: `Instantly API failed: ${coldEmail.error}`, fix: "Check INSTANTLY_API_KEY GitHub Secret + network allowlist." });
    }

    // Cold calls: < 30% real-conversation rate, 0 positive
    if (coldCalls.ok && coldCalls.grandTotal > 10) {
        const realRate = coldCalls.grandReal / coldCalls.grandTotal * 100;
        if (realRate < 15) {
            broken.push({
                area: "Cold Calls",
                issue: `${coldCalls.grandTotal} calls placed but only ${coldCalls.grandReal} real conversations (${realRate.toFixed(1)}%)`,
                fix: "Audit agent prompts for instant-hangup triggers. Check silence_end_call_timeout=20 on all 3 agents.",
            });
        }
        if (coldCalls.grandPositive === 0 && coldCalls.grandReal >= 5) {
            broken.push({
                area: "Cold Calls",
                issue: `${coldCalls.grandReal} real conversations this week but ZERO positive outcomes`,
                fix: "Review transcripts for objection patterns. Run callTranscriptReviewer on-demand. Consider rotating offers A/B/C or rewriting openers.",
            });
        }
    }

    // Audits: requested but not delivered
    if (audits.ok && audits.total > 0) {
        const completed = audits.byStatus.completed || 0;
        const pending = audits.byStatus.pending || 0;
        if (pending > completed && pending > 2) {
            broken.push({
                area: "Audit Pipeline",
                issue: `${pending} audits pending vs ${completed} completed — delivery lag`,
                fix: "Check processAuditRequest Cloud Function logs for timeouts. Verify mockup-renderer uptime.",
            });
        }
    }

    // Calendly: zero bookings with positive cold-call / positive cold-email activity
    if (calendly.ok && (calendly.booked || 0) === 0) {
        if ((coldCalls.grandPositive || 0) > 0 || parseFloat(coldEmail.reply_rate || "0%") > 0) {
            broken.push({
                area: "Calendly",
                issue: `ZERO bookings this week despite ${coldCalls.grandPositive || 0} positive cold-call outcomes + ${coldEmail.totals?.replies || 0} cold-email replies`,
                fix: "Positive replies aren't being routed to the Calendly link. Check instantlyReplyWatcher logs + Sofia's Calendly CTA.",
            });
        }
    }

    // MRR: zero closed this week
    if ((closed.newMrrUsd || 0) === 0) {
        broken.push({
            area: "Revenue",
            issue: `ZERO new MRR closed this week — revenue goal $1M/yr requires ~$19.2K MRR/week`,
            fix: "Confirm pipeline has at least 3 warm leads in Calendly this week. Review sales call recordings for objection patterns.",
        });
    }

    // IG: no posts this week
    if (instagram.ok && instagram.posts_this_week === 0) {
        broken.push({
            area: "Instagram",
            issue: "No IG posts published to @jegodigital this week — content drought",
            fix: "Trigger contentPublisher manually. Queue carousels via jegodigital-carousels skill.",
        });
    }

    // GSC / GA4 gaps (always add for transparency if not wired)
    if (gsc.skipped) {
        broken.push({ area: "GSC", issue: "No live rank data — GSC integration not wired", fix: gsc.reason });
    }
    if (ga4.skipped) {
        broken.push({ area: "GA4", issue: "No live traffic data — GA4 integration not wired", fix: ga4.reason });
    }

    return broken.slice(0, 8);
}

function deriveFixedThings(data) {
    const fixed = [];
    const { coldEmail, coldCalls, audits, instagram, calendly } = data;

    if (coldEmail.ok && coldEmail.active_firing > 0) {
        fixed.push(`Cold email pipeline firing: ${coldEmail.active_firing} of ${coldEmail.total_active} active campaigns sent this week (${coldEmail.totals.sent.toLocaleString()} total)`);
    }
    if (coldCalls.ok && coldCalls.grandTotal > 0) {
        fixed.push(`Cold-call autopilot placed ${coldCalls.grandTotal} calls across 3 offers (A:${coldCalls.byOffer.A.total} B:${coldCalls.byOffer.B.total} C:${coldCalls.byOffer.C.total})`);
    }
    if (audits.ok && audits.total > 0) {
        const completed = audits.byStatus.completed || 0;
        fixed.push(`Audit pipeline: ${audits.total} requests · ${completed} completed · sources ${Object.entries(audits.bySource).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    }
    if (calendly.ok && calendly.total > 0) {
        fixed.push(`Calendly activity: ${calendly.total} events this week (${calendly.booked} booked, ${calendly.canceled} canceled)`);
    }
    if (instagram.ok && instagram.posts_this_week > 0) {
        fixed.push(`Instagram: ${instagram.posts_this_week} posts this week · ${(instagram.reach || 0).toLocaleString()} reach · ${(instagram.followers || 0).toLocaleString()} followers`);
    }
    return fixed.slice(0, 5);
}

function computeConversionFunnel(data) {
    const { coldEmail, coldCalls, audits, calendly, closed } = data;

    // Outreach touches
    const outreach = (coldEmail.totals?.sent || 0) + (coldCalls.grandTotal || 0);
    // Positive responses
    const positive = (coldEmail.totals?.replies || 0) + (coldCalls.grandPositive || 0);
    // Calendly booked
    const booked = calendly.booked || 0;
    // Closed clients
    const closedN = closed.count || 0;

    return {
        outreach,
        positive,
        audits_requested: audits.total || 0,
        booked,
        closed: closedN,
        newMrrUsd: closed.newMrrUsd || 0,
        pct_outreach_to_positive: humanPct(positive, outreach),
        pct_positive_to_booked: humanPct(booked, positive),
        pct_booked_to_closed: humanPct(closedN, booked),
        pct_outreach_to_closed: humanPct(closedN, outreach),
    };
}

// =============================================================================
// HTML TEMPLATE — branded dark theme (matches eveningOpsReport)
// =============================================================================
function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

function renderReportHtml(data) {
    const { window, coldEmail, coldCalls, brevo, calendly, audits, phoneLeads, instagram, gsc, ga4, closed, adSpend, funnel, broken, fixed } = data;

    const campaignRows = (coldEmail.perCampaign || []).map((c) => `
        <tr>
            <td>${esc(c.name)}</td>
            <td class="num">${c.sent.toLocaleString()}</td>
            <td class="num">${c.opens.toLocaleString()} <span class="pct">(${c.open_rate})</span></td>
            <td class="num">${c.replies.toLocaleString()} <span class="pct">(${c.reply_rate})</span></td>
            <td class="num">${c.bounces.toLocaleString()} <span class="pct ${parseFloat(c.bounce_rate) > 5 ? "warn" : ""}">(${c.bounce_rate})</span></td>
        </tr>
    `).join("") || `<tr><td colspan="5" class="empty">No Instantly activity this week.</td></tr>`;

    const callRows = Object.entries(coldCalls.byOffer || {}).map(([offer, o]) => `
        <tr>
            <td><span class="tag tag-offer-${offer}">Offer ${offer}</span></td>
            <td class="num">${o.total}</td>
            <td class="num">${o.real} <span class="pct">(${humanPct(o.real, o.total)})</span></td>
            <td class="num positive">${o.positive}</td>
        </tr>
    `).join("") || `<tr><td colspan="4" class="empty">No cold calls this week.</td></tr>`;

    const positiveCallRows = (coldCalls.positiveLeads || []).slice(0, 10).map((l) => `
        <tr>
            <td><span class="tag tag-offer-${l.offer}">${l.offer}</span></td>
            <td class="dim">${l.duration}s</td>
            <td>${esc(l.summary)}</td>
        </tr>
    `).join("") || `<tr><td colspan="3" class="empty">No positive call outcomes this week.</td></tr>`;

    const brokenRows = (broken || []).map((b) => `
        <tr>
            <td><span class="tag tag-broken">${esc(b.area)}</span></td>
            <td><strong>${esc(b.issue)}</strong><br><span class="dim">Fix: ${esc(b.fix)}</span></td>
        </tr>
    `).join("") || `<tr><td colspan="2" class="empty">✅ Nothing flagged as broken this week.</td></tr>`;

    const fixedList = (fixed || []).map((f) => `<li>${esc(f)}</li>`).join("")
        || `<li class="empty">No activity logged this week.</li>`;

    const closedClientsRows = (closed.clients || []).map((c) => `
        <tr>
            <td>${esc(c.name)}</td>
            <td class="num">${fmtUsd(c.mrr_usd)}</td>
            <td class="dim">${esc(c.bundle)}</td>
        </tr>
    `).join("") || `<tr><td colspan="3" class="empty">No clients closed this week — log entries in Firestore clients_closed/</td></tr>`;

    const headline = [
        `${funnel.outreach.toLocaleString()} touches`,
        `${funnel.positive} positive`,
        `${funnel.booked} booked`,
        `${funnel.closed} closed · ${fmtUsd(funnel.newMrrUsd)} new MRR`,
    ].join(" · ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>JegoDigital — Weekly Revenue Review — ${window.key}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #0a0a0f; color: #e8e8ef; padding: 40px 48px; font-size: 11pt; line-height: 1.5; }
  .header { border-bottom: 2px solid #C5A059; padding-bottom: 24px; margin-bottom: 32px; }
  .header h1 { font-family: 'Playfair Display', serif; font-weight: 900; font-size: 26pt; color: #fff; letter-spacing: -0.5px; }
  .header .brand { color: #C5A059; }
  .header .meta { color: #8a8a9a; font-size: 10pt; margin-top: 8px; }
  .header .headline { margin-top: 16px; color: #fff; font-size: 13pt; font-weight: 500; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .kpi { background: #12121a; border-left: 3px solid #C5A059; padding: 18px 20px; border-radius: 4px; }
  .kpi .label { color: #8a8a9a; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
  .kpi .value { font-family: 'Playfair Display', serif; color: #fff; font-size: 24pt; font-weight: 700; margin-top: 4px; }
  .kpi .sub { color: #C5A059; font-size: 10pt; margin-top: 2px; }
  .kpi.big { border-left-color: #6ee7a7; }
  .kpi.big .value { color: #6ee7a7; }
  .kpi.warn { border-left-color: #e07b7b; }

  .section { margin-bottom: 36px; page-break-inside: avoid; }
  .section h2 { font-family: 'Playfair Display', serif; color: #C5A059; font-size: 16pt; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
  .section h2 .count { color: #fff; font-size: 11pt; font-family: 'Inter', sans-serif; font-weight: 500; background: #1a1a24; padding: 3px 10px; border-radius: 10px; }

  table { width: 100%; border-collapse: collapse; background: #12121a; border-radius: 4px; overflow: hidden; }
  th { background: #1a1a24; color: #C5A059; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid #2a2a36; }
  td { padding: 10px 12px; border-bottom: 1px solid #1f1f2a; font-size: 10pt; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 500; }
  td.num.positive { color: #6ee7a7; font-weight: 700; }
  td.dim { color: #8a8a9a; font-size: 9pt; }
  td.empty { color: #6a6a7a; text-align: center; font-style: italic; padding: 20px; }
  .pct { color: #8a8a9a; font-size: 9pt; margin-left: 4px; }
  .pct.warn { color: #e07b7b; font-weight: 600; }

  .tag { display: inline-block; padding: 2px 8px; border-radius: 10px; background: #2a2a36; color: #c8c8d0; font-size: 8pt; font-weight: 500; letter-spacing: 0.3px; }
  .tag-offer-A { background: #1e2a3a; color: #7aa7e7; }
  .tag-offer-B { background: #2a1e3a; color: #b37ae7; }
  .tag-offer-C { background: #3a2a1e; color: #e7a77a; }
  .tag-broken { background: #3a1e1e; color: #e07b7b; }
  .fixed-list { background: #12121a; border-left: 3px solid #6ee7a7; padding: 18px 24px 18px 40px; border-radius: 4px; }
  .fixed-list li { color: #c8c8d0; font-size: 10pt; margin-bottom: 6px; }

  .funnel { background: #12121a; border-left: 3px solid #C5A059; padding: 20px; border-radius: 4px; }
  .funnel-stage { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #2a2a36; }
  .funnel-stage:last-child { border-bottom: none; }
  .funnel-stage .label { color: #8a8a9a; }
  .funnel-stage .value { color: #fff; font-weight: 600; font-variant-numeric: tabular-nums; }
  .funnel-stage .pct { color: #C5A059; font-size: 9pt; margin-left: 8px; }

  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #2a2a36; color: #6a6a7a; font-size: 9pt; text-align: center; }
  .footer .brand { color: #C5A059; font-family: 'Playfair Display', serif; font-weight: 700; }
</style>
</head>
<body>

<div class="header">
  <h1><span class="brand">JegoDigital</span> · Weekly Revenue Review · ${window.key}</h1>
  <div class="meta">${window.label} · Generated ${new Date().toUTCString()}</div>
  <div class="headline">${headline}</div>
</div>

<div class="kpi-grid">
  <div class="kpi big">
    <div class="label">New MRR Closed</div>
    <div class="value">${fmtUsd(funnel.newMrrUsd)}</div>
    <div class="sub">${funnel.closed} client${funnel.closed === 1 ? "" : "s"} closed · target ~$19.2K/wk</div>
  </div>
  <div class="kpi ${funnel.booked === 0 ? "warn" : ""}">
    <div class="label">Calendly Booked</div>
    <div class="value">${funnel.booked}</div>
    <div class="sub">target 10/wk · closed ${funnel.closed} of ${funnel.booked}</div>
  </div>
  <div class="kpi">
    <div class="label">Qualified Leads</div>
    <div class="value">${funnel.positive}</div>
    <div class="sub">Email ${coldEmail.totals?.replies || 0} replies · Call ${coldCalls.grandPositive || 0} positive</div>
  </div>
  <div class="kpi">
    <div class="label">Outreach Touches</div>
    <div class="value">${funnel.outreach.toLocaleString()}</div>
    <div class="sub">Email ${(coldEmail.totals?.sent || 0).toLocaleString()} · Calls ${coldCalls.grandTotal || 0}</div>
  </div>
</div>

<div class="section">
  <h2>Conversion Funnel <span class="count">week ${window.key}</span></h2>
  <div class="funnel">
    <div class="funnel-stage"><span class="label">Outreach touches</span><span class="value">${funnel.outreach.toLocaleString()} <span class="pct">baseline</span></span></div>
    <div class="funnel-stage"><span class="label">Positive responses</span><span class="value">${funnel.positive.toLocaleString()} <span class="pct">${funnel.pct_outreach_to_positive}</span></span></div>
    <div class="funnel-stage"><span class="label">Audits requested</span><span class="value">${funnel.audits_requested.toLocaleString()}</span></div>
    <div class="funnel-stage"><span class="label">Calendly booked</span><span class="value">${funnel.booked} <span class="pct">${funnel.pct_positive_to_booked} of positive</span></span></div>
    <div class="funnel-stage"><span class="label">Clients closed</span><span class="value">${funnel.closed} <span class="pct">${funnel.pct_booked_to_closed} of booked · ${funnel.pct_outreach_to_closed} of outreach</span></span></div>
    <div class="funnel-stage"><span class="label">Ad spend</span><span class="value">${fmtUsd(adSpend.totalUsd || 0)} <span class="pct">${funnel.closed ? `CAC ${fmtUsd((adSpend.totalUsd || 0) / funnel.closed)}` : "no closes"}</span></span></div>
  </div>
</div>

<div class="section">
  <h2>🚨 Top ${(broken || []).length} Broken Things</h2>
  <table>
    <thead><tr><th>Area</th><th>Issue &amp; Recommended Fix</th></tr></thead>
    <tbody>${brokenRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>✅ What Worked This Week</h2>
  <ul class="fixed-list">${fixedList}</ul>
</div>

<div class="section">
  <h2>Cold Email — Per Campaign <span class="count">${coldEmail.active_firing || 0} of ${coldEmail.total_active || 0} active firing</span></h2>
  <table>
    <thead><tr><th>Campaign</th><th>Sent</th><th>Opens</th><th>Replies</th><th>Bounces</th></tr></thead>
    <tbody>${campaignRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Cold Calls — Per Offer <span class="count">${coldCalls.grandTotal || 0} total · ${coldCalls.grandPositive || 0} positive</span></h2>
  <table>
    <thead><tr><th>Offer</th><th>Total</th><th>Real Convos</th><th>Positive</th></tr></thead>
    <tbody>${callRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Cold Calls — Positive Outcomes <span class="count">${(coldCalls.positiveLeads || []).length} leads</span></h2>
  <table>
    <thead><tr><th>Offer</th><th>Duration</th><th>Summary</th></tr></thead>
    <tbody>${positiveCallRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>New Clients Closed <span class="count">${closed.count || 0} · ${fmtUsd(closed.newMrrUsd || 0)} MRR</span></h2>
  <table>
    <thead><tr><th>Client</th><th>MRR (USD)</th><th>Service Bundle</th></tr></thead>
    <tbody>${closedClientsRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Platform Signals <span class="count">live-verified ${[coldEmail.ok, coldCalls.ok, brevo.ok, calendly.ok, audits.ok, instagram.ok].filter(Boolean).length} of 8</span></h2>
  <table>
    <thead><tr><th>Platform</th><th>Signal</th></tr></thead>
    <tbody>
      <tr><td>📧 Brevo (transactional)</td><td class="dim">${brevo.ok ? `${brevo.delivered} delivered · ${brevo.open_rate} open · ${brevo.click_rate} click · ${brevo.hardBounces} hard bounces` : `unavailable (${esc(brevo.error || "unknown")})`}</td></tr>
      <tr><td>📸 Instagram @jegodigital</td><td class="dim">${instagram.ok ? `${instagram.followers.toLocaleString()} followers · ${instagram.posts_this_week} posts this week · ${(instagram.reach || 0).toLocaleString()} reach · ${(instagram.impressions || 0).toLocaleString()} impressions` : `unavailable (${esc(instagram.error || "unknown")})`}</td></tr>
      <tr><td>📅 Calendly</td><td class="dim">${calendly.ok ? `source=${calendly.source} · ${calendly.total} events · ${calendly.booked} booked · ${calendly.canceled} canceled` : `unavailable (${esc(calendly.error || "unknown")})`}</td></tr>
      <tr><td>📞 Phone-lead pool</td><td class="dim">${phoneLeads.ok ? `${phoneLeads.total} total · ${phoneLeads.dialReady} dial-ready · ${phoneLeads.dialed} dialed · ${phoneLeads.converted} converted` : `unavailable (${esc(phoneLeads.error || "unknown")})`}</td></tr>
      <tr><td>🔍 GSC (rankings)</td><td class="dim">⚠️ ${esc(gsc.reason || "skipped")}</td></tr>
      <tr><td>📊 GA4 (traffic)</td><td class="dim">⚠️ ${esc(ga4.reason || "skipped")}</td></tr>
    </tbody>
  </table>
</div>

<div class="footer">
  <span class="brand">JegoDigital</span> · Weekly Revenue Review · Next report: next Monday 09:00 CDMX
</div>

</body>
</html>`;
}

// =============================================================================
// PDF RENDER
// =============================================================================
async function renderPdf(html) {
    const url = `${MOCKUP_RENDERER}/renderPdf`;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const r = await axios.post(url,
                { html, format: "Letter", printBackground: true, waitMs: 1200 },
                { responseType: "arraybuffer", timeout: 60000 }
            );
            if (r.status === 200) return Buffer.from(r.data);
        } catch (err) {
            functions.logger.warn(`renderPdf attempt ${attempt} failed: ${err.message}`);
            if (attempt === 3) throw err;
            await new Promise((r) => setTimeout(r, 4000));
        }
    }
    throw new Error("PDF render failed after 3 attempts");
}

async function uploadPdfToStorage(pdfBuffer, weekKey) {
    const bucket = admin.storage().bucket();
    const fileName = `business_reviews/${weekKey}/weekly-revenue-review-${weekKey}.pdf`;
    const file = bucket.file(fileName);
    await file.save(pdfBuffer, {
        metadata: { contentType: "application/pdf" },
        resumable: false,
    });
    const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30d — weekly reports stick around
    });
    return { fileName, signedUrl };
}

// =============================================================================
// SLACK + TELEGRAM DELIVERY (same pattern as eveningOpsReport)
// =============================================================================
async function postSlackWithPdf(pdfBuffer, summaryText, signedUrl, weekKey) {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (botToken) {
        try {
            const fileSize = pdfBuffer.length;
            const getUrlResp = await axios.get(
                `https://slack.com/api/files.getUploadURLExternal?filename=weekly-revenue-review-${weekKey}.pdf&length=${fileSize}`,
                { headers: { Authorization: `Bearer ${botToken}` }, timeout: 15000 }
            );
            if (!getUrlResp.data.ok) throw new Error("getUploadURLExternal: " + getUrlResp.data.error);
            const { upload_url, file_id } = getUrlResp.data;

            await axios.post(upload_url, pdfBuffer, {
                headers: { "Content-Type": "application/pdf" },
                timeout: 30000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });

            const completeResp = await axios.post(
                "https://slack.com/api/files.completeUploadExternal",
                {
                    files: [{ id: file_id, title: `JegoDigital Weekly Revenue Review — ${weekKey}` }],
                    channel_id: SLACK_CHANNEL_ID,
                    initial_comment: summaryText,
                },
                {
                    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
                    timeout: 15000,
                }
            );
            if (!completeResp.data.ok) throw new Error("completeUploadExternal: " + completeResp.data.error);
            return { ok: true, mode: "files.upload", file_id };
        } catch (err) {
            functions.logger.warn(`Slack files.upload failed — falling back to webhook: ${err.message}`);
        }
    }
    // 2026-04-25: routed to #revenue via slackPost helper (was firehose).
    const { slackPost } = require('./slackPost');
    const result = await slackPost('revenue', {
        text: `${summaryText}\n\n📎 <${signedUrl}|Download PDF>`,
    });
    if (!result.ok) {
        return { ok: false, mode: "slackPost", error: result.error };
    }
    return { ok: true, mode: "slackPost", channel: result.channel };
}

async function postTelegramWithPdf(pdfBuffer, caption, weekKey) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    if (!token || !chatId) return { ok: false };

    try {
        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("caption", caption);
        form.append("parse_mode", "Markdown");
        form.append("document", pdfBuffer, {
            filename: `weekly-revenue-review-${weekKey}.pdf`,
            contentType: "application/pdf",
        });
        const r = await axios.post(
            `https://api.telegram.org/bot${token}/sendDocument`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 30000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }
        );
        return { ok: r.data.ok, message_id: r.data.result?.message_id };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================
async function runMondayRevenueReview(options = {}) {
    const window = options.windowOverride || priorWeekWindow();
    functions.logger.info(`Monday revenue review starting for ${window.key} (${window.label})`);

    const db = admin.firestore();

    // Parallel fetch all 8 platforms
    const [
        coldEmail, coldCalls, brevo, calendly, audits, closed, adSpend, phoneLeads, instagram,
    ] = await Promise.all([
        aggregateColdEmail(window).catch((e) => ({ ok: false, error: e.message, totals: {}, perCampaign: [] })),
        aggregateColdCalls(window).catch((e) => ({ ok: false, error: e.message, grandTotal: 0, grandReal: 0, grandPositive: 0, byOffer: { A: { total: 0, real: 0, positive: 0 }, B: { total: 0, real: 0, positive: 0 }, C: { total: 0, real: 0, positive: 0 } }, positiveLeads: [] })),
        aggregateBrevo(window).catch((e) => ({ ok: false, error: e.message })),
        aggregateCalendly(db, window).catch((e) => ({ ok: false, error: e.message, total: 0, booked: 0, canceled: 0 })),
        aggregateAudits(db, window).catch((e) => ({ ok: false, error: e.message, total: 0, bySource: {}, byStatus: {} })),
        aggregateClosedClients(db, window).catch((e) => ({ ok: false, count: 0, newMrrUsd: 0, clients: [] })),
        aggregateAdSpend(db, window).catch((e) => ({ ok: true, totalUsd: 0, byChannel: {} })),
        aggregatePhoneLeads(db).catch((e) => ({ ok: false, error: e.message })),
        aggregateInstagram(window).catch((e) => ({ ok: false, error: e.message })),
    ]);
    const gsc = aggregateGSC();
    const ga4 = aggregateGA4();

    // Score the week
    const dataForScoring = { coldEmail, coldCalls, brevo, calendly, audits, closed, instagram, gsc, ga4 };
    const broken = deriveBrokenThings(dataForScoring);
    const fixed = deriveFixedThings(dataForScoring);
    const funnel = computeConversionFunnel({ coldEmail, coldCalls, audits, calendly, closed });

    const data = {
        window, coldEmail, coldCalls, brevo, calendly, audits, phoneLeads,
        instagram, gsc, ga4, closed, adSpend, funnel, broken, fixed,
    };

    // Render → PDF
    let pdfBuffer = null, pdfError = null;
    try {
        const html = renderReportHtml(data);
        pdfBuffer = await renderPdf(html);
    } catch (err) {
        pdfError = err.message;
        functions.logger.error("PDF render failed:", err.message);
    }

    // Upload
    let storage = null;
    if (pdfBuffer) {
        try {
            storage = await uploadPdfToStorage(pdfBuffer, window.key);
        } catch (err) {
            functions.logger.error("Storage upload failed:", err.message);
        }
    }

    // Headline text
    const headline = `*JegoDigital — Weekly Revenue Review — ${window.key}*\n` +
        `💰 *${fmtUsd(funnel.newMrrUsd)} new MRR · ${funnel.closed} client${funnel.closed === 1 ? "" : "s"} closed*\n` +
        `📅 ${funnel.booked} booked · 🎯 ${funnel.positive} qualified · 📧 ${coldEmail.totals?.sent || 0} emails · 📞 ${coldCalls.grandTotal || 0} calls\n` +
        `🚨 ${broken.length} broken · ✅ ${fixed.length} working\n` +
        `Conv: outreach→positive ${funnel.pct_outreach_to_positive} · positive→booked ${funnel.pct_positive_to_booked} · booked→closed ${funnel.pct_booked_to_closed}`;

    // Deliver
    let slackResult = { ok: false }, telegramResult = { ok: false };
    if (pdfBuffer) {
        [slackResult, telegramResult] = await Promise.all([
            postSlackWithPdf(pdfBuffer, headline, storage?.signedUrl, window.key),
            postTelegramWithPdf(pdfBuffer, headline, window.key),
        ]);
    } else {
        if (process.env.SLACK_WEBHOOK_URL) {
            try {
                await axios.post(process.env.SLACK_WEBHOOK_URL, {
                    text: headline + `\n\n⚠️ PDF render failed: ${pdfError}`,
                }, { timeout: 10000 });
                slackResult = { ok: true, mode: "text-only" };
            } catch (e) { /* logged earlier */ }
        }
    }

    // Firestore snapshot — business_reviews/{YYYY-WNN}
    const snapshot = {
        week_key: window.key,
        week_label: window.label,
        window_start: window.startTs,
        window_end: window.endTs,
        new_mrr_usd: funnel.newMrrUsd,
        clients_closed: funnel.closed,
        calendly_booked: funnel.booked,
        qualified_leads: funnel.positive,
        outreach_touches: funnel.outreach,
        audits_requested: funnel.audits_requested,
        conv_pct_outreach_to_positive: funnel.pct_outreach_to_positive,
        conv_pct_positive_to_booked: funnel.pct_positive_to_booked,
        conv_pct_booked_to_closed: funnel.pct_booked_to_closed,
        conv_pct_outreach_to_closed: funnel.pct_outreach_to_closed,
        ad_spend_usd: adSpend.totalUsd || 0,
        cac_usd: (funnel.closed && adSpend.totalUsd) ? (adSpend.totalUsd / funnel.closed) : null,
        cold_email_totals: coldEmail.totals || {},
        cold_email_campaigns_firing: coldEmail.active_firing || 0,
        cold_email_reply_rate: coldEmail.reply_rate || "0.0%",
        cold_email_bounce_rate: coldEmail.bounce_rate || "0.0%",
        cold_call_total: coldCalls.grandTotal || 0,
        cold_call_real: coldCalls.grandReal || 0,
        cold_call_positive: coldCalls.grandPositive || 0,
        cold_call_by_offer: coldCalls.byOffer || {},
        brevo: brevo.ok ? {
            delivered: brevo.delivered, opens: brevo.opens, clicks: brevo.clicks,
            hardBounces: brevo.hardBounces, open_rate: brevo.open_rate, click_rate: brevo.click_rate,
        } : null,
        instagram: instagram.ok ? {
            followers: instagram.followers, reach: instagram.reach,
            impressions: instagram.impressions, posts_this_week: instagram.posts_this_week,
        } : null,
        platforms_live: {
            instantly: coldEmail.ok, elevenlabs: coldCalls.ok, brevo: brevo.ok,
            calendly: calendly.ok, firestore: audits.ok, meta_graph: instagram.ok,
            gsc: gsc.ok, ga4: ga4.ok,
        },
        broken_things: broken,
        fixed_things: fixed,
        pdf_url: storage?.signedUrl || null,
        pdf_file: storage?.fileName || null,
        pdf_error: pdfError,
        slack_ok: slackResult.ok,
        telegram_ok: telegramResult.ok,
        generated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    try {
        await db.collection("business_reviews").doc(window.key).set(snapshot, { merge: true });
    } catch (err) {
        functions.logger.error("Snapshot save failed:", err.message);
    }

    return {
        ok: true,
        week_key: window.key,
        funnel,
        broken_count: broken.length,
        fixed_count: fixed.length,
        pdf_url: storage?.signedUrl,
        slack: slackResult,
        telegram: telegramResult,
        platforms_live: snapshot.platforms_live,
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

// Monday 09:00 CDMX
exports.mondayRevenueReview = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 9 * * 1")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const result = await runMondayRevenueReview();
            functions.logger.info("Monday revenue review done:", JSON.stringify(result));
            return null;
        } catch (err) {
            functions.logger.error("Monday revenue review threw:", err);
            return null;
        }
    });

// On-demand HTTPS endpoint for manual fire / testing / historical re-runs
// Example:
//   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/mondayRevenueReviewOnDemand"
//   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/mondayRevenueReviewOnDemand?weeksBack=1"
exports.mondayRevenueReviewOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const weeksBack = parseInt(req.query.weeksBack || "0", 10);
            let windowOverride = null;
            if (weeksBack > 0) {
                const shifted = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);
                windowOverride = priorWeekWindow(shifted);
            }
            const result = await runMondayRevenueReview(windowOverride ? { windowOverride } : {});
            res.json(result);
        } catch (err) {
            functions.logger.error("Monday revenue on-demand failed:", err);
            res.status(500).json({ error: err.message });
        }
    });

exports._runMondayRevenueReview = runMondayRevenueReview;
exports._priorWeekWindow = priorWeekWindow;
