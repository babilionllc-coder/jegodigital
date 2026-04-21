/**
 * instantlyAudit — on-demand Instantly.ai campaign audit.
 *
 * HTTPS endpoint: /instantlyAuditNow
 *
 * Pulls:
 *   - All campaigns (id, name, status, timestamps)
 *   - Per-campaign daily analytics (sent / opens / replies / bounces / clicks)
 *     for today + last 7 days
 *   - Sending accounts (status, warmup score, daily limit)
 *
 * Reports:
 *   - Total active campaigns
 *   - Today's sent/open/reply/bounce totals + rates
 *   - Last-7d trend
 *   - Accounts with status != 1 (degraded/disconnected)
 *   - Any campaign past its kill date (World Cup)
 *
 * This is a diagnostic tool — safe to call on demand.
 * Not scheduled. Not wired to cron. Only the HTTPS endpoint.
 */
const functions = require("firebase-functions");
const axios = require("axios");

const BASE = "https://api.instantly.ai/api/v2";

function authHeaders() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY missing from runtime env");
    return {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
    };
}

async function listCampaigns() {
    const all = [];
    let startAfter = null;
    for (let i = 0; i < 10; i++) {
        const url = startAfter
            ? `${BASE}/campaigns?limit=100&starting_after=${startAfter}`
            : `${BASE}/campaigns?limit=100`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        const items = r.data.items || [];
        all.push(...items);
        if (items.length < 100) break;
        startAfter = items[items.length - 1].id;
    }
    return all;
}

async function listAccounts() {
    try {
        const r = await axios.get(`${BASE}/accounts?limit=100`, {
            headers: authHeaders(),
            timeout: 15000,
        });
        return r.data.items || [];
    } catch (e) {
        return { error: e.response?.status + " " + (e.response?.data?.message || e.message) };
    }
}

// Instantly v2 daily analytics — returns array of {date, sent, opened, replies, bounced, clicks}
async function dailyAnalytics(campaignId, days = 7) {
    try {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        const fmt = (d) => d.toISOString().slice(0, 10);
        const url = `${BASE}/campaigns/analytics/daily?campaign_id=${campaignId}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        return Array.isArray(r.data) ? r.data : (r.data.items || r.data.data || []);
    } catch (e) {
        return { error: e.response?.status + " " + (e.response?.data?.message || e.message) };
    }
}

// Fallback — overall campaign analytics (not daily)
async function campaignAnalytics(campaignId) {
    try {
        const url = `${BASE}/campaigns/analytics?id=${campaignId}`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        return r.data;
    } catch (e) {
        return { error: e.response?.status + " " + (e.response?.data?.message || e.message) };
    }
}

async function runAudit() {
    const report = {
        timestamp: new Date().toISOString(),
        today_utc: new Date().toISOString().slice(0, 10),
    };

    // 1) Campaigns
    let campaigns = [];
    try {
        campaigns = await listCampaigns();
    } catch (e) {
        report.error = "listCampaigns failed: " + (e.response?.status || "") + " " + e.message;
        return report;
    }

    // Status 1=active, 2=paused, 3=completed, 4=running-subsequences, -1=deleted, -2=error, 0=draft
    const STATUS = { 0: "DRAFT", 1: "ACTIVE", 2: "PAUSED", 3: "COMPLETED", 4: "RUNNING_SUB", "-1": "DELETED", "-2": "ERROR" };

    report.campaigns_total = campaigns.length;
    report.campaigns_by_status = {};
    for (const c of campaigns) {
        const s = STATUS[c.status] || `UNKNOWN_${c.status}`;
        report.campaigns_by_status[s] = (report.campaigns_by_status[s] || 0) + 1;
    }

    // 2) For each ACTIVE campaign, pull 7-day daily analytics
    const active = campaigns.filter((c) => c.status === 1);
    report.active_campaigns = [];

    for (const c of active) {
        const daily = await dailyAnalytics(c.id, 7);
        const overall = await campaignAnalytics(c.id);

        const entry = {
            id: c.id,
            name: c.name,
            status: STATUS[c.status],
            created: c.timestamp_created?.slice(0, 10),
            daily_error: daily.error || null,
            daily: Array.isArray(daily) ? daily : [],
            overall_error: overall.error || null,
            overall: overall.error ? null : overall,
        };

        // Today (UTC)
        const today = report.today_utc;
        const todayRow = (Array.isArray(daily) ? daily : []).find((d) => d.date === today) || null;
        entry.today = todayRow;

        // 7d totals
        if (Array.isArray(daily)) {
            const t = { sent: 0, opened: 0, replies: 0, clicks: 0, bounced: 0 };
            for (const d of daily) {
                t.sent += d.sent || 0;
                t.opened += d.opened || 0;
                t.replies += d.replies || d.reply || 0;
                t.clicks += d.clicks || d.unique_clicks || 0;
                t.bounced += d.bounced || 0;
            }
            entry.last_7d = t;
            entry.last_7d.open_rate = t.sent ? +((t.opened / t.sent) * 100).toFixed(2) : 0;
            entry.last_7d.reply_rate = t.sent ? +((t.replies / t.sent) * 100).toFixed(2) : 0;
            entry.last_7d.bounce_rate = t.sent ? +((t.bounced / t.sent) * 100).toFixed(2) : 0;
        }

        report.active_campaigns.push(entry);
    }

    // 3) Accounts
    const accounts = await listAccounts();
    if (Array.isArray(accounts)) {
        report.accounts_total = accounts.length;
        report.accounts_by_status = {};
        report.accounts_unhealthy = [];
        for (const a of accounts) {
            const k = `status_${a.status}`;
            report.accounts_by_status[k] = (report.accounts_by_status[k] || 0) + 1;
            if (a.status !== 1 || (a.warmup_score != null && a.warmup_score < 90)) {
                report.accounts_unhealthy.push({
                    email: a.email,
                    status: a.status,
                    warmup_score: a.warmup_score,
                    daily_limit: a.daily_limit,
                });
            }
        }
    } else {
        report.accounts_error = accounts.error;
    }

    // 4) Kill-date alerts
    const today = new Date();
    const worldCupKill = new Date("2026-07-01");
    report.alerts = [];
    for (const c of active) {
        if (/mundial|world cup/i.test(c.name) && today >= worldCupKill) {
            report.alerts.push(`Campaign "${c.name}" past World Cup kill date (2026-07-01)`);
        }
    }

    return report;
}

exports.instantlyAuditNow = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const report = await runAudit();
            res.json(report);
        } catch (e) {
            res.status(500).json({ error: e.message, stack: e.stack });
        }
    });
