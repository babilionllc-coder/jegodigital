/**
 * performanceMonitor — Tier-A autonomous daily performance digest cron.
 *
 * Ships CLAUDE_RULES.md Rule 24 (every automation logs to Telegram + Slack)
 * for the daily-cadence pulse. Sister cron to mondayRevenueReview (Rule 8 —
 * weekly Monday review). This is the DAILY pulse with anomaly gating.
 *
 * Schedule: 07:00 America/Mexico_City every day (cron `0 7 * * *`).
 *
 * Pulls live metrics from 5 platforms in parallel (best-effort: a single
 * platform error does NOT block the others). HARD RULE #1 (verify-live):
 * every number cited is from a live API call this run.
 *
 *   (1) Instantly  → /api/v2/campaigns + /campaigns/analytics/daily for yesterday
 *   (2) Brevo      → /v3/smtp/statistics/aggregatedReport for yesterday
 *   (3) Meta Ads   → /v22.0/act_{ad_account}/insights date_preset=yesterday
 *   (4) Calendly   → /scheduled_events for yesterday window (fallback Firestore)
 *   (5) Sofia      → Firestore wa_cloud_conversations count where
 *                    last_user_msg_at within yesterday window
 *
 * Then:
 *   - Compute 7-day baseline per metric from last 7 performance_daily_snapshots
 *   - Detect anomalies (>30% degradation OR >2x spike OR dead-zero)
 *   - Post Telegram digest via notify() helper
 *   - Post Slack digest via slackPost('daily-ops', ...)
 *   - Snapshot full payload to Firestore performance_daily_snapshots/YYYY-MM-DD
 *
 * Hard rules honored:
 *   - Rule 1 (verify-live): all numbers from live APIs this run; per-platform
 *     errors flagged in digest as ❌, never silently substituted.
 *   - Rule 7 (proof): function returns { ok, run_id, telegram_ok, slack_ok,
 *     anomalies, snapshot_doc } so callers can log + verify.
 *   - Rule 12 (always find a way): per-platform failures don't block the digest.
 *   - Rule 24 (every automation logs to Telegram + Slack): dual-channel every run.
 *
 * Read-only by design: never pauses a campaign, revokes a token, or deletes
 * Firestore data.
 *
 * Env vars (read from process.env at call-time, no functions.config()):
 *   INSTANTLY_API_KEY            — bearer for Instantly v2
 *   BREVO_API_KEY                — api-key header for Brevo v3
 *   META_GRAPH_TOKEN             — Meta long-lived token (Ads scope)
 *   META_AD_ACCOUNT_ID           — e.g. 968739288838315
 *   CALENDLY_PAT                 — Calendly personal access token
 *   TELEGRAM_BOT_TOKEN           — used by ./telegramHelper notify()
 *   TELEGRAM_CHAT_ID             — used by ./telegramHelper notify()
 *   SLACK_BOT_TOKEN              — used by ./slackPost
 *   SLACK_CHANNEL_DAILY_OPS      — used by ./slackPost
 *
 * Exports:
 *   performanceMonitor          — cron 07:00 CDMX
 *   performanceMonitorOnDemand  — HTTPS manual fire / past-date audit
 *   _runPerformanceMonitor      — internal runner for tests
 *   _detectAnomalies            — internal pure helper for tests
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

// ---------- Config ----------
const INSTANTLY_BASE  = "https://api.instantly.ai/api/v2";
const BREVO_BASE      = "https://api.brevo.com/v3";
const META_GRAPH_BASE = "https://graph.facebook.com/v22.0";
const CALENDLY_BASE   = "https://api.calendly.com";

const SNAPSHOT_COLLECTION = "performance_daily_snapshots";
const BASELINE_DAYS       = 7;
const MIN_BASELINE_DAYS   = 3;       // below this, don't fire anomalies (warmup)

// Anomaly thresholds (canonical, see PROMPT.md §4)
const TH_DEGRADATION = 0.70;          // today < baseline * 0.70 → degraded
const TH_SPIKE       = 2.00;          // today > baseline * 2.0  → spike
const TH_CPL_DEGRADE = 1.43;          // CPL inverted: today > baseline * 1.43 → bad

// ---------- Date helpers ----------

/**
 * Returns the yesterday window in CDMX timezone, anchored to the start/end
 * of the local calendar day.
 *
 * Returns:
 *   {
 *     yesterdayDate: "YYYY-MM-DD",
 *     todayDate:     "YYYY-MM-DD",
 *     startUtc:      Date (yesterday 00:00:00 CDMX → UTC),
 *     endUtc:        Date (yesterday 23:59:59 CDMX → UTC),
 *     startIso:      ISO 8601,
 *     endIso:        ISO 8601,
 *   }
 */
function yesterdayWindowCdmx(refDate = null) {
    const ref = refDate ? new Date(refDate) : new Date();
    // CDMX is UTC-6 (no DST). Add explicit offset.
    const CDMX_OFFSET_MIN = -6 * 60;
    // Compute "now" in CDMX
    const cdmxNow = new Date(ref.getTime() + CDMX_OFFSET_MIN * 60 * 1000);
    // Yesterday in CDMX
    const yest = new Date(cdmxNow);
    yest.setUTCDate(yest.getUTCDate() - 1);
    const y  = yest.getUTCFullYear();
    const mo = String(yest.getUTCMonth() + 1).padStart(2, "0");
    const da = String(yest.getUTCDate()).padStart(2, "0");
    const yesterdayDate = `${y}-${mo}-${da}`;
    const tY  = cdmxNow.getUTCFullYear();
    const tMo = String(cdmxNow.getUTCMonth() + 1).padStart(2, "0");
    const tDa = String(cdmxNow.getUTCDate()).padStart(2, "0");
    const todayDate = `${tY}-${tMo}-${tDa}`;
    // Local start of yesterday (CDMX) in UTC
    const startUtc = new Date(Date.UTC(y, parseInt(mo) - 1, parseInt(da), 6, 0, 0));
    const endUtc   = new Date(Date.UTC(y, parseInt(mo) - 1, parseInt(da), 30, 0, 0)); // +24h
    return {
        yesterdayDate,
        todayDate,
        startUtc,
        endUtc,
        startIso: startUtc.toISOString(),
        endIso: endUtc.toISOString(),
    };
}

function pct(num, den) {
    if (!den || den === 0) return 0;
    return Math.round((num / den) * 1000) / 10; // one decimal
}

function fmtPct(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return `${n.toFixed(1)}%`;
}

function fmtUsd(n) {
    if (!n && n !== 0) return "—";
    return "$" + (Math.round(n * 100) / 100).toFixed(2);
}

function fmtCount(n) {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("en-US");
}

// ---------- Platform pulls ----------

// (1) INSTANTLY — yesterday cold-email totals across active campaigns
async function aggregateInstantly(window) {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) {
        return { ok: false, error: "INSTANTLY_API_KEY missing", platform: "instantly" };
    }
    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    try {
        // List campaigns
        const all = [];
        let startAfter = null;
        for (let i = 0; i < 5; i++) {
            const url = startAfter
                ? `${INSTANTLY_BASE}/campaigns?limit=100&starting_after=${startAfter}`
                : `${INSTANTLY_BASE}/campaigns?limit=100`;
            const r = await axios.get(url, { headers, timeout: 15000 });
            const items = r.data.items || [];
            all.push(...items);
            if (items.length < 100) break;
            startAfter = items[items.length - 1].id;
        }
        const active = all.filter((c) => c.status === 1);

        // Per-active-campaign yesterday analytics
        const totals = { sent: 0, opens: 0, replies: 0, bounces: 0, clicks: 0 };
        const perCampaign = [];
        for (const c of active) {
            try {
                const url = `${INSTANTLY_BASE}/campaigns/analytics/daily?campaign_id=${c.id}&start_date=${window.yesterdayDate}&end_date=${window.yesterdayDate}`;
                const r = await axios.get(url, { headers, timeout: 15000 });
                const rows = Array.isArray(r.data) ? r.data : (r.data.items || r.data.data || []);
                let row = { sent: 0, opened: 0, reply: 0, bounced: 0, clicks: 0 };
                for (const x of rows) {
                    row.sent    += x.sent || 0;
                    row.opened  += x.opened || x.opens || 0;
                    row.reply   += x.reply || x.replies || 0;
                    row.bounced += x.bounced || x.bounces || 0;
                    row.clicks  += x.clicks || 0;
                }
                totals.sent    += row.sent;
                totals.opens   += row.opened;
                totals.replies += row.reply;
                totals.bounces += row.bounced;
                totals.clicks  += row.clicks;
                if (row.sent > 0 || row.reply > 0) {
                    perCampaign.push({ id: c.id, name: c.name, ...row });
                }
            } catch (err) {
                functions.logger.warn(`instantly campaign ${c.id} analytics failed: ${err.message}`);
            }
        }

        return {
            ok: true,
            platform: "instantly",
            active_campaigns: active.length,
            firing_campaigns: perCampaign.length,
            sent: totals.sent,
            opens: totals.opens,
            replies: totals.replies,
            bounces: totals.bounces,
            open_rate:   pct(totals.opens, totals.sent),
            reply_rate:  pct(totals.replies, totals.sent),
            bounce_rate: pct(totals.bounces, totals.sent),
            top_campaigns: perCampaign.sort((a, b) => b.sent - a.sent).slice(0, 3)
                .map((c) => ({ id: c.id, name: c.name, sent: c.sent, replies: c.reply })),
        };
    } catch (err) {
        return { ok: false, platform: "instantly", error: err.message };
    }
}

// (2) BREVO — yesterday warm-email aggregate
async function aggregateBrevo(window) {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { ok: false, platform: "brevo", error: "BREVO_API_KEY missing" };
    try {
        const url = `${BREVO_BASE}/smtp/statistics/aggregatedReport?startDate=${window.yesterdayDate}&endDate=${window.yesterdayDate}`;
        const r = await axios.get(url, {
            headers: { "api-key": key, accept: "application/json" },
            timeout: 15000,
        });
        const d = r.data || {};
        const delivered = d.delivered || 0;
        const opens     = d.uniqueOpens || d.opens || 0;
        const clicks    = d.uniqueClicks || d.clicks || 0;
        return {
            ok: true,
            platform: "brevo",
            requests: d.requests || 0,
            delivered,
            opens,
            clicks,
            soft_bounces: d.softBounces || 0,
            hard_bounces: d.hardBounces || 0,
            complaints: d.spamReports || 0,
            open_rate:  pct(opens, delivered),
            click_rate: pct(clicks, delivered),
        };
    } catch (err) {
        return { ok: false, platform: "brevo", error: err.message };
    }
}

// (3) META ADS — yesterday account-level insights
async function aggregateMetaAds(_window) {
    const token = process.env.META_GRAPH_TOKEN;
    const acct  = process.env.META_AD_ACCOUNT_ID;
    if (!token) return { ok: false, platform: "meta_ads", error: "META_GRAPH_TOKEN missing" };
    if (!acct)  return { ok: false, platform: "meta_ads", error: "META_AD_ACCOUNT_ID missing" };

    const acctId = String(acct).startsWith("act_") ? acct : `act_${acct}`;
    try {
        const url = `${META_GRAPH_BASE}/${acctId}/insights`;
        const r = await axios.get(url, {
            params: {
                access_token: token,
                date_preset: "yesterday",
                fields: "spend,impressions,clicks,cpm,ctr,actions",
                level: "account",
            },
            timeout: 15000,
        });
        const rows = r.data?.data || [];
        if (rows.length === 0) {
            return {
                ok: true,
                platform: "meta_ads",
                spend: 0,
                impressions: 0,
                clicks: 0,
                leads: 0,
                cpl: 0,
                cpm: 0,
                ctr: 0,
                note: "no_spend_yesterday",
            };
        }
        const row = rows[0];
        const spend       = parseFloat(row.spend || 0);
        const impressions = parseInt(row.impressions || 0, 10);
        const clicks      = parseInt(row.clicks || 0, 10);
        const cpm         = parseFloat(row.cpm || 0);
        const ctr         = parseFloat(row.ctr || 0);
        // Extract lead count from actions array
        let leads = 0;
        for (const a of (row.actions || [])) {
            const t = a.action_type || "";
            if (t === "lead" || t === "onsite_conversion.lead_grouped" || t === "leadgen.other") {
                leads += parseInt(a.value || 0, 10);
            }
        }
        const cpl = leads > 0 ? spend / leads : 0;
        return {
            ok: true,
            platform: "meta_ads",
            spend,
            impressions,
            clicks,
            leads,
            cpl,
            cpm,
            ctr,
        };
    } catch (err) {
        const code = err.response?.data?.error?.code;
        const msg  = err.response?.data?.error?.message || err.message;
        return {
            ok: false,
            platform: "meta_ads",
            error: code ? `${code}: ${msg}` : msg,
        };
    }
}

// (4) CALENDLY — yesterday booked/canceled
async function aggregateCalendly(db, window) {
    const pat = process.env.CALENDLY_PAT;
    if (pat) {
        try {
            const me = await axios.get(`${CALENDLY_BASE}/users/me`, {
                headers: { Authorization: `Bearer ${pat}` },
                timeout: 12000,
            });
            const userUri = me.data.resource?.uri;
            if (!userUri) throw new Error("no user uri from /users/me");

            const events = [];
            let pageToken = null;
            for (let page = 0; page < 3; page++) {
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
            let booked = 0, canceled = 0;
            for (const e of events) {
                if (e.status === "active") booked++;
                else if (e.status === "canceled") canceled++;
            }
            return {
                ok: true,
                platform: "calendly",
                source: "calendly_api",
                booked,
                canceled,
                total: events.length,
            };
        } catch (err) {
            functions.logger.warn(`Calendly API failed, falling back to Firestore: ${err.message}`);
            // fall through
        }
    }
    // Firestore fallback
    try {
        const snap = await db.collection("calendly_events")
            .where("created_at", ">=", window.startUtc)
            .where("created_at", "<", window.endUtc)
            .get();
        let booked = 0, canceled = 0;
        snap.forEach((d) => {
            const data = d.data() || {};
            const status = data.status || data.event_type || "active";
            if (status === "canceled") canceled++;
            else booked++;
        });
        return {
            ok: true,
            platform: "calendly",
            source: "firestore",
            booked,
            canceled,
            total: snap.size,
        };
    } catch (err) {
        return { ok: false, platform: "calendly", error: err.message };
    }
}

// (5) SOFIA — Firestore wa_cloud_conversations count for yesterday
async function aggregateSofia(db, window) {
    try {
        // Strategy: count docs where last_user_msg_at falls within yesterday window.
        // This counts conversations that had at least one inbound user message yesterday.
        const snap = await db.collection("wa_cloud_conversations")
            .where("last_user_msg_at", ">=", window.startUtc)
            .where("last_user_msg_at", "<", window.endUtc)
            .get();
        return {
            ok: true,
            platform: "sofia",
            new_conversations: snap.size,
        };
    } catch (err) {
        // If the field name differs, try a fallback on `updated_at`
        try {
            const snap = await db.collection("wa_cloud_conversations")
                .where("updated_at", ">=", window.startUtc)
                .where("updated_at", "<", window.endUtc)
                .get();
            return {
                ok: true,
                platform: "sofia",
                new_conversations: snap.size,
                source: "fallback_updated_at",
            };
        } catch (err2) {
            return { ok: false, platform: "sofia", error: `${err.message} | fallback: ${err2.message}` };
        }
    }
}

// ---------- Baseline + anomaly detection ----------

/**
 * Pulls the last N snapshots from Firestore and averages each numeric metric.
 * Snapshots have shape: { date: "YYYY-MM-DD", metrics: { instantly: {...}, ... }, ... }
 * Returns a flat object keyed by `<platform>.<metric>` for ease of lookup.
 */
async function loadBaseline(db, window) {
    try {
        const snap = await db.collection(SNAPSHOT_COLLECTION)
            .orderBy("date", "desc")
            .where("date", "<", window.todayDate)
            .limit(BASELINE_DAYS)
            .get();
        const docs = [];
        snap.forEach((d) => docs.push(d.data() || {}));

        if (docs.length === 0) {
            return { ready: false, count: 0, baseline: {}, note: "no snapshots yet (first run)" };
        }

        // Build keyed map
        const sums = {};
        const counts = {};
        for (const doc of docs) {
            const m = doc.metrics || {};
            for (const platform of Object.keys(m)) {
                const obj = m[platform] || {};
                for (const k of Object.keys(obj)) {
                    if (typeof obj[k] === "number") {
                        const key = `${platform}.${k}`;
                        sums[key] = (sums[key] || 0) + obj[k];
                        counts[key] = (counts[key] || 0) + 1;
                    }
                }
            }
        }
        const baseline = {};
        for (const k of Object.keys(sums)) {
            baseline[k] = sums[k] / counts[k];
        }
        return {
            ready: docs.length >= MIN_BASELINE_DAYS,
            count: docs.length,
            baseline,
            note: docs.length < MIN_BASELINE_DAYS ? `warming up (${docs.length}/${MIN_BASELINE_DAYS})` : null,
        };
    } catch (err) {
        functions.logger.warn(`loadBaseline failed: ${err.message}`);
        return { ready: false, count: 0, baseline: {}, note: `load_failed: ${err.message}` };
    }
}

/**
 * Pure helper. Returns array of anomaly objects.
 *
 * Each anomaly: { metric, today, baseline, delta_pct, kind, severity, message }
 *
 * `kind` ∈ degradation | spike | dead | cpl_degrade
 * `severity` ∈ info | warn | error | critical
 */
function detectAnomalies(metrics, baselineWrap) {
    const out = [];
    if (!baselineWrap.ready) return out; // suppress until warm

    const b = baselineWrap.baseline;

    function check(metricKey, today, opts = {}) {
        const baseline = b[metricKey];
        if (baseline === undefined || baseline === null) return;
        if (today === undefined || today === null) return;

        const inverted = !!opts.inverted; // CPL etc.
        const critical = !!opts.critical; // dead-zero metric escalates to SMS

        // Dead-zero
        if (today === 0 && baseline > (opts.deadFloor || 1)) {
            out.push({
                metric: metricKey,
                today,
                baseline,
                delta_pct: -100,
                kind: "dead",
                severity: critical ? "critical" : "error",
                message: `${opts.label || metricKey} = 0 (7d avg ${baseline.toFixed(2)}) — pipeline dead`,
            });
            return;
        }

        if (baseline === 0) return;
        const ratio = today / baseline;

        // CPL-style inverted metrics: HIGH today is bad
        if (inverted) {
            if (ratio > TH_CPL_DEGRADE) {
                const deltaPct = Math.round((ratio - 1) * 100);
                out.push({
                    metric: metricKey,
                    today,
                    baseline,
                    delta_pct: deltaPct,
                    kind: "cpl_degrade",
                    severity: deltaPct >= 100 ? "error" : "warn",
                    message: `${opts.label || metricKey} ${today.toFixed(2)} vs 7d avg ${baseline.toFixed(2)} — ${deltaPct}% more expensive`,
                });
            }
            return;
        }

        // Standard metrics
        if (ratio < TH_DEGRADATION) {
            const deltaPct = Math.round((1 - ratio) * 100);
            out.push({
                metric: metricKey,
                today,
                baseline,
                delta_pct: -deltaPct,
                kind: "degradation",
                severity: deltaPct >= 70 ? "error" : "warn",
                message: `${opts.label || metricKey} ${today} vs 7d avg ${baseline.toFixed(2)} — ${deltaPct}% degradation`,
            });
        } else if (ratio > TH_SPIKE) {
            const deltaPct = Math.round((ratio - 1) * 100);
            out.push({
                metric: metricKey,
                today,
                baseline,
                delta_pct: deltaPct,
                kind: "spike",
                severity: "info",
                message: `${opts.label || metricKey} ${today} vs 7d avg ${baseline.toFixed(2)} — ${deltaPct}% spike`,
            });
        }
    }

    // Cold email
    check("instantly.sent",       metrics.instantly?.sent,       { label: "Cold email sends", critical: true });
    check("instantly.reply_rate", metrics.instantly?.reply_rate, { label: "Cold email reply rate" });
    check("instantly.bounce_rate", metrics.instantly?.bounce_rate, { label: "Cold email bounce rate", inverted: true });

    // Brevo warm
    check("brevo.delivered",  metrics.brevo?.delivered,  { label: "Brevo delivered" });
    check("brevo.open_rate",  metrics.brevo?.open_rate,  { label: "Brevo open rate" });
    check("brevo.click_rate", metrics.brevo?.click_rate, { label: "Brevo click rate" });

    // Meta Ads
    check("meta_ads.spend", metrics.meta_ads?.spend, { label: "FB Ads spend" });
    check("meta_ads.leads", metrics.meta_ads?.leads, { label: "FB Ads leads", deadFloor: 0.5 });
    check("meta_ads.cpl",   metrics.meta_ads?.cpl,   { label: "FB Ads CPL", inverted: true });

    // Calendly
    check("calendly.booked", metrics.calendly?.booked, { label: "Calendly bookings", critical: true, deadFloor: 0.5 });

    // Sofia
    check("sofia.new_conversations", metrics.sofia?.new_conversations, { label: "Sofia conversations", deadFloor: 0.5 });

    return out;
}

// ---------- Format digest ----------

function deltaTag(today, baseline, inverted = false) {
    if (baseline === undefined || baseline === null || baseline === 0) return "—";
    const pctDelta = ((today - baseline) / baseline) * 100;
    const goodArrow = "✅";
    const warnArrow = "⚠️";
    const ratio = today / baseline;
    let status;
    if (inverted) {
        // Lower = better (CPL etc.)
        status = ratio <= TH_CPL_DEGRADE ? goodArrow : warnArrow;
    } else {
        status = (ratio >= TH_DEGRADATION) ? goodArrow : warnArrow;
    }
    const sign = pctDelta >= 0 ? "+" : "";
    return `${status} ${sign}${pctDelta.toFixed(0)}%`;
}

function formatDigest({ window, metrics, baselineWrap, anomalies, errors }) {
    const date = window.yesterdayDate;
    const lines = [];
    lines.push(`📊 *Daily Performance · ${date}*`);
    if (!baselineWrap.ready) {
        lines.push(`_Baseline ${baselineWrap.note || "warming up"} — anomaly gating suppressed._`);
    }
    lines.push("");

    // Cold email
    const ie = metrics.instantly;
    if (ie?.ok) {
        const b = baselineWrap.baseline;
        lines.push(`*Cold email* (Instantly · ${ie.firing_campaigns}/${ie.active_campaigns} firing)`);
        lines.push(`   Sent: ${fmtCount(ie.sent)} (7d avg ${fmtCount(Math.round(b["instantly.sent"] || 0))} ${deltaTag(ie.sent, b["instantly.sent"])})`);
        lines.push(`   Reply rate: ${fmtPct(ie.reply_rate)} (7d avg ${fmtPct(b["instantly.reply_rate"])} ${deltaTag(ie.reply_rate, b["instantly.reply_rate"])})`);
        lines.push(`   Bounce rate: ${fmtPct(ie.bounce_rate)} (7d avg ${fmtPct(b["instantly.bounce_rate"])} ${deltaTag(ie.bounce_rate, b["instantly.bounce_rate"], true)})`);
    } else {
        lines.push(`*Cold email* (Instantly): ❌ ${ie?.error || "unknown error"}`);
    }
    lines.push("");

    // Brevo
    const br = metrics.brevo;
    if (br?.ok) {
        const b = baselineWrap.baseline;
        lines.push(`*Warm email* (Brevo)`);
        lines.push(`   Delivered: ${fmtCount(br.delivered)} (7d avg ${fmtCount(Math.round(b["brevo.delivered"] || 0))} ${deltaTag(br.delivered, b["brevo.delivered"])})`);
        lines.push(`   Open rate: ${fmtPct(br.open_rate)} (7d avg ${fmtPct(b["brevo.open_rate"])} ${deltaTag(br.open_rate, b["brevo.open_rate"])})`);
        lines.push(`   Click rate: ${fmtPct(br.click_rate)} (7d avg ${fmtPct(b["brevo.click_rate"])} ${deltaTag(br.click_rate, b["brevo.click_rate"])})`);
    } else {
        lines.push(`*Warm email* (Brevo): ❌ ${br?.error || "unknown error"}`);
    }
    lines.push("");

    // Meta Ads
    const ma = metrics.meta_ads;
    if (ma?.ok) {
        const b = baselineWrap.baseline;
        lines.push(`*Facebook Ads* (Meta)`);
        lines.push(`   Spend: ${fmtUsd(ma.spend)} (7d avg ${fmtUsd(b["meta_ads.spend"])} ${deltaTag(ma.spend, b["meta_ads.spend"])})`);
        lines.push(`   Leads: ${fmtCount(ma.leads)} (7d avg ${(b["meta_ads.leads"] || 0).toFixed(1)} ${deltaTag(ma.leads, b["meta_ads.leads"])})`);
        lines.push(`   CPL: ${ma.cpl ? fmtUsd(ma.cpl) : "—"} (7d avg ${b["meta_ads.cpl"] ? fmtUsd(b["meta_ads.cpl"]) : "—"} ${deltaTag(ma.cpl, b["meta_ads.cpl"], true)})`);
    } else {
        lines.push(`*Facebook Ads* (Meta): ❌ ${ma?.error || "unknown error"}`);
    }
    lines.push("");

    // Calendly
    const cal = metrics.calendly;
    if (cal?.ok) {
        const b = baselineWrap.baseline;
        lines.push(`*Calendly*`);
        lines.push(`   Booked: ${fmtCount(cal.booked)} (7d avg ${(b["calendly.booked"] || 0).toFixed(1)} ${deltaTag(cal.booked, b["calendly.booked"])})`);
        lines.push(`   Canceled: ${fmtCount(cal.canceled)}`);
    } else {
        lines.push(`*Calendly*: ❌ ${cal?.error || "unknown error"}`);
    }
    lines.push("");

    // Sofia
    const so = metrics.sofia;
    if (so?.ok) {
        const b = baselineWrap.baseline;
        lines.push(`*Sofia* (WhatsApp)`);
        lines.push(`   New conversations: ${fmtCount(so.new_conversations)} (7d avg ${(b["sofia.new_conversations"] || 0).toFixed(1)} ${deltaTag(so.new_conversations, b["sofia.new_conversations"])})`);
    } else {
        lines.push(`*Sofia*: ❌ ${so?.error || "unknown error"}`);
    }
    lines.push("");

    // Anomalies
    if (anomalies.length === 0) {
        lines.push(`✅ *Anomalies:* none today.`);
    } else {
        lines.push(`🚨 *Anomalies (${anomalies.length}):*`);
        for (const a of anomalies) {
            const icon = a.severity === "critical" ? "🔴" : a.severity === "error" ? "🟠" : "🟡";
            lines.push(`   ${icon} ${a.message}`);
        }
    }

    // Platform errors footer
    if (errors.length > 0) {
        lines.push("");
        lines.push(`⚠️ Platform errors: ${errors.join(", ")}`);
    }

    lines.push("");
    lines.push(`🪪 Run id: \`perf_daily_${date}\``);
    return lines.join("\n");
}

// Slack blocks version (richer formatting)
function formatDigestBlocks({ window, metrics, anomalies, runId }) {
    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `Daily Performance · ${window.yesterdayDate}`, emoji: true },
        },
    ];
    if (anomalies.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `:rotating_light: *${anomalies.length} anomaly${anomalies.length === 1 ? "" : " items"}*\n` +
                    anomalies.map((a) => {
                        const icon = a.severity === "critical" ? ":red_circle:" : a.severity === "error" ? ":large_orange_circle:" : ":large_yellow_circle:";
                        return `${icon} ${a.message}`;
                    }).join("\n"),
            },
        });
    } else {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: ":white_check_mark: No anomalies — all platforms within healthy range." },
        });
    }
    const fields = [];
    if (metrics.instantly?.ok) {
        fields.push({ type: "mrkdwn", text: `*Cold email*\nSent: ${metrics.instantly.sent} · Reply: ${metrics.instantly.reply_rate}%` });
    }
    if (metrics.brevo?.ok) {
        fields.push({ type: "mrkdwn", text: `*Warm email*\nDelivered: ${metrics.brevo.delivered} · Open: ${metrics.brevo.open_rate}%` });
    }
    if (metrics.meta_ads?.ok) {
        fields.push({ type: "mrkdwn", text: `*FB Ads*\nSpend: $${metrics.meta_ads.spend.toFixed(2)} · Leads: ${metrics.meta_ads.leads}` });
    }
    if (metrics.calendly?.ok) {
        fields.push({ type: "mrkdwn", text: `*Calendly*\nBooked: ${metrics.calendly.booked} · Canceled: ${metrics.calendly.canceled}` });
    }
    if (metrics.sofia?.ok) {
        fields.push({ type: "mrkdwn", text: `*Sofia*\nNew convos: ${metrics.sofia.new_conversations}` });
    }
    if (fields.length > 0) {
        blocks.push({ type: "section", fields });
    }
    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `Run id: \`${runId}\` · cron: 07:00 CDMX daily` }],
    });
    return blocks;
}

// ---------- Main runner ----------

async function runPerformanceMonitor({ refDate = null } = {}) {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    const window = yesterdayWindowCdmx(refDate);
    const runId = `perf_daily_${window.yesterdayDate}`;
    functions.logger.info(`performanceMonitor START ${runId}`);

    // Pull all 5 platforms in parallel (best-effort)
    const [instantly, brevo, meta_ads, calendly, sofia] = await Promise.all([
        aggregateInstantly(window).catch((e) => ({ ok: false, platform: "instantly", error: e.message })),
        aggregateBrevo(window).catch((e) => ({ ok: false, platform: "brevo", error: e.message })),
        aggregateMetaAds(window).catch((e) => ({ ok: false, platform: "meta_ads", error: e.message })),
        aggregateCalendly(db, window).catch((e) => ({ ok: false, platform: "calendly", error: e.message })),
        aggregateSofia(db, window).catch((e) => ({ ok: false, platform: "sofia", error: e.message })),
    ]);

    const metrics = { instantly, brevo, meta_ads, calendly, sofia };
    const errors = Object.values(metrics).filter((m) => !m.ok).map((m) => m.platform);

    // Baseline + anomalies
    const baselineWrap = await loadBaseline(db, window);
    const anomalies = detectAnomalies(metrics, baselineWrap);

    // Format + ship
    const text = formatDigest({ window, metrics, baselineWrap, anomalies, errors });
    const blocks = formatDigestBlocks({ window, metrics, anomalies, runId });

    const hasCritical = anomalies.some((a) => a.severity === "critical");

    let telegramOk = false, slackOk = false;
    try {
        const tg = await notify(text, { critical: hasCritical });
        telegramOk = !!tg.telegram;
    } catch (err) {
        functions.logger.error(`Telegram notify failed: ${err.message}`);
    }
    try {
        const sk = await slackPost("daily-ops", { text: `Daily Performance · ${window.yesterdayDate}`, blocks });
        slackOk = !!sk.ok;
    } catch (err) {
        functions.logger.error(`Slack post failed: ${err.message}`);
    }

    // Snapshot
    const snapshot = {
        date: window.yesterdayDate,
        run_id: runId,
        run_at: admin.firestore.FieldValue.serverTimestamp(),
        metrics,
        baseline_count: baselineWrap.count,
        baseline_ready: baselineWrap.ready,
        anomalies,
        platform_errors: errors,
        telegram_ok: telegramOk,
        slack_ok: slackOk,
    };
    let snapshotPath = null;
    try {
        await db.collection(SNAPSHOT_COLLECTION).doc(window.yesterdayDate).set(snapshot, { merge: true });
        snapshotPath = `${SNAPSHOT_COLLECTION}/${window.yesterdayDate}`;
    } catch (err) {
        functions.logger.error(`Snapshot save failed: ${err.message}`);
    }

    functions.logger.info(`performanceMonitor DONE ${runId} · anomalies=${anomalies.length} · errors=${errors.length}`);

    return {
        ok: true,
        run_id: runId,
        date: window.yesterdayDate,
        anomalies,
        platform_errors: errors,
        telegram_ok: telegramOk,
        slack_ok: slackOk,
        snapshot_doc: snapshotPath,
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

// Daily 07:00 CDMX
exports.performanceMonitor = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 7 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await runPerformanceMonitor();
            functions.logger.info("performanceMonitor result:", JSON.stringify(r));
            return null;
        } catch (err) {
            functions.logger.error("performanceMonitor threw:", err);
            // Best-effort failure ping so Alex isn't silent-failed
            try {
                await notify(`🔴 *performanceMonitor cron threw*\n\`${err.message}\``, { critical: true });
            } catch (_) {}
            return null;
        }
    });

// On-demand HTTPS endpoint
// Examples:
//   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/performanceMonitorOnDemand"
//   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/performanceMonitorOnDemand?date=2026-05-04"
exports.performanceMonitorOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const refDate = req.query.date ? `${req.query.date}T12:00:00Z` : null;
            const r = await runPerformanceMonitor({ refDate });
            res.json(r);
        } catch (err) {
            functions.logger.error("performanceMonitorOnDemand failed:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

// Internal exports for tests
exports._runPerformanceMonitor = runPerformanceMonitor;
exports._detectAnomalies = detectAnomalies;
exports._yesterdayWindowCdmx = yesterdayWindowCdmx;
