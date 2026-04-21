/**
 * instantlyAudit — on-demand Instantly.ai campaign audit.
 *
 * HTTPS endpoint: /instantlyAuditNow
 *
 * Pulls:
 *   - All campaigns (id, name, status, timestamps)
 *   - Per-campaign daily analytics (sent / opens / replies / bounces / clicks)
 *     for today + last 7 days
 *   - Sending accounts (email, status, warmup score, daily limit)
 *   - Per-active-campaign sequence (Step 1 subject + body)
 *   - Copy-lint flags for each Step 1 (banned patterns from the playbook)
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

async function getCampaign(campaignId) {
    try {
        const r = await axios.get(`${BASE}/campaigns/${campaignId}`, { headers: authHeaders(), timeout: 15000 });
        return r.data;
    } catch (e) {
        return { error: e.response?.status + " " + (e.response?.data?.message || e.message) };
    }
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

async function campaignAnalytics(campaignId) {
    try {
        const url = `${BASE}/campaigns/analytics?id=${campaignId}`;
        const r = await axios.get(url, { headers: authHeaders(), timeout: 15000 });
        return r.data;
    } catch (e) {
        return { error: e.response?.status + " " + (e.response?.data?.message || e.message) };
    }
}

// Lint a Step 1 body + subject against the playbook's 15 Iron Rules.
function lintStep1(subject, body) {
    const flags = [];
    if (!subject) flags.push("missing_subject");
    else {
        const wc = subject.trim().split(/\s+/).length;
        if (wc > 3) flags.push(`subject_too_long_${wc}_words`);
    }
    if (!body) { flags.push("missing_body"); return flags; }

    // Hard-banned patterns
    if (/\{\{firstName\s*\|/i.test(body)) flags.push("firstName_with_fallback");
    if (/\[(?:your|tu|nombre|ciudad|city|company|empresa|area|zona)[^\]]*\]/i.test(body)) flags.push("bracket_placeholder");
    if (/calendly\.com/i.test(body)) flags.push("calendly_in_step1");
    if (/\$|MXN|USD|desde|precio|cuesta|tarifa|\bfee\b|\bprice\b/i.test(body)) flags.push("pricing_leak");
    if (/claude|manychat|instantly|firecrawl|dataforseo/i.test(body)) flags.push("ai_tool_name_leak");

    // Soft checks
    const wc = body.trim().split(/\s+/).length;
    if (wc < 50) flags.push(`body_too_short_${wc}w`);
    else if (wc > 90) flags.push(`body_too_long_${wc}w`);

    // Greeting — require plain "Hola," or "Hola {{firstName}}," (with no fallback)
    const firstLine = body.split("\n").find((l) => l.trim()) || "";
    if (!/^Hi[, ]|^Hello[, ]|^Hola[, ]/i.test(firstLine.trim())) flags.push("greeting_unusual");

    // Signed "Alex" + "JegoDigital"
    if (!/\bAlex\b/.test(body)) flags.push("missing_alex_sig");
    if (!/JegoDigital/i.test(body)) flags.push("missing_jegodigital_sig");

    return flags;
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

    const STATUS = { 0: "DRAFT", 1: "ACTIVE", 2: "PAUSED", 3: "COMPLETED", 4: "RUNNING_SUB", "-1": "DELETED", "-2": "ERROR" };

    report.campaigns_total = campaigns.length;
    report.campaigns_by_status = {};
    report.all_campaigns = [];
    for (const c of campaigns) {
        const s = STATUS[c.status] || `UNKNOWN_${c.status}`;
        report.campaigns_by_status[s] = (report.campaigns_by_status[s] || 0) + 1;
        report.all_campaigns.push({ id: c.id, name: c.name, status: s, created: c.timestamp_created?.slice(0, 10) });
    }

    // 2) For each ACTIVE campaign pull daily analytics + sequence
    const active = campaigns.filter((c) => c.status === 1);
    report.active_campaigns = [];

    for (const c of active) {
        const daily = await dailyAnalytics(c.id, 7);
        const overall = await campaignAnalytics(c.id);
        const detail = await getCampaign(c.id);

        // Try to extract Step 1 from sequence (Instantly stores sequences.steps[].variants[].subject / body)
        let step1 = null;
        let sequenceSteps = 0;
        if (detail && !detail.error) {
            const steps = detail.sequences?.[0]?.steps || detail.sequences?.steps || [];
            sequenceSteps = Array.isArray(steps) ? steps.length : 0;
            if (Array.isArray(steps) && steps.length) {
                const v = steps[0].variants?.[0] || steps[0];
                step1 = {
                    subject: v.subject || null,
                    body: v.body || null,
                    variant_count: steps[0].variants?.length || 1,
                };
            }
        }

        const entry = {
            id: c.id,
            name: c.name,
            status: STATUS[c.status],
            created: c.timestamp_created?.slice(0, 10),
            sequence_steps: sequenceSteps,
            step1_subject: step1?.subject || null,
            step1_body: step1?.body || null,
            step1_variant_count: step1?.variant_count || null,
            lint_flags: step1 ? lintStep1(step1.subject, step1.body) : ["sequence_not_found"],
            daily_error: daily.error || null,
            daily: Array.isArray(daily) ? daily : [],
            overall_error: overall.error || null,
            overall: overall.error ? null : overall,
        };

        const today = report.today_utc;
        const todayRow = (Array.isArray(daily) ? daily : []).find((d) => d.date === today) || null;
        entry.today = todayRow;

        if (Array.isArray(daily)) {
            const t = { sent: 0, opened: 0, replies: 0, clicks: 0, bounced: 0 };
            for (const d of daily) {
                t.sent += d.sent || 0;
                t.opened += d.opened || d.unique_opened || 0;
                t.replies += d.replies || d.unique_replies || d.reply || 0;
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

    // 3) Accounts — expose emails now
    const accounts = await listAccounts();
    if (Array.isArray(accounts)) {
        report.accounts_total = accounts.length;
        report.accounts_by_status = {};
        report.accounts_unhealthy = [];
        report.accounts = [];
        const domains = {};
        for (const a of accounts) {
            const k = `status_${a.status}`;
            report.accounts_by_status[k] = (report.accounts_by_status[k] || 0) + 1;
            report.accounts.push({
                email: a.email,
                status: a.status,
                warmup_score: a.warmup_score,
                daily_limit: a.daily_limit,
                provider_code: a.provider_code,
                timestamp_warmup_start: a.timestamp_warmup_start,
            });
            const dom = (a.email || "").split("@")[1] || "unknown";
            domains[dom] = (domains[dom] || 0) + 1;
            if (a.status !== 1 || (a.warmup_score != null && a.warmup_score < 90)) {
                report.accounts_unhealthy.push({
                    email: a.email,
                    status: a.status,
                    warmup_score: a.warmup_score,
                    daily_limit: a.daily_limit,
                });
            }
        }
        report.sending_domains = domains;
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

    // 5) Global lint summary
    report.lint_summary = {};
    for (const c of report.active_campaigns) {
        for (const f of (c.lint_flags || [])) {
            report.lint_summary[f] = (report.lint_summary[f] || 0) + 1;
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
