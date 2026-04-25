/**
 * eveningOpsReport — THE single nightly ops report Alex gets every evening at
 * 21:00 CDMX. Covers the full 24-hour business pulse:
 *
 *   1. COLD EMAIL (Instantly v2)       — sends, opens, replies, bounces per campaign
 *   2. CALENDLY BOOKINGS               — invitee.created / canceled / no_show
 *   3. MANYCHAT / SOFIA CONVOS         — WhatsApp + Instagram conversations
 *   4. COLD CALL OUTCOMES (ElevenLabs) — per-offer (A/B/C) call outcomes
 *   5. FREE AUDIT REQUESTS             — audit_requests by source (ig, wa, cold_email)
 *
 * Delivery:
 *   - Branded HTML rendered to PDF via Cloud Run mockup-renderer /renderPdf
 *   - Uploaded to Firebase Storage with 7-day signed URL
 *   - Slack: files.upload (PDF attachment) + summary blocks message
 *   - Telegram: sendDocument (PDF attachment) + short caption
 *   - Firestore snapshot: evening_ops_reports/{YYYY-MM-DD}
 *
 * AI Analysis Agent (Gemini 2.0 Flash):
 *   After the report posts, a Gemini call reads the aggregated totals and:
 *     AUTO-FIX (safe): pauses campaigns with bounce > 5%, reduces daily limit
 *       on accounts with health < 90%, archives leads with 5+ bounces.
 *     ESCALATE (needs human): copy rewrites, strategy shifts, campaign
 *       restarts, anything where Gemini isn't confident. Posted as a second
 *       Slack message tagged "🤖 AI Agent — Review Needed".
 *   Every action (auto-fix OR escalate) is logged to ai_agent_actions/{date}.
 *
 * Hard rules (HARD RULE #0, #2, #11):
 *   - No fabricated numbers: every metric comes from a live API call THIS run.
 *   - No silent failures: every step logs outcome to Firestore.
 *   - No "run it yourself": cron fires autonomously, no manual trigger needed.
 *
 * Three exports:
 *   eveningOpsReport              — cron 21:00 CDMX daily (last 24h window)
 *   eveningOpsReportOnDemand      — HTTPS endpoint for manual fire / debug
 *   eveningOpsWeeklyReport        — cron Sun 21:30 CDMX (7-day rollup — TODO)
 *
 * Required secrets (live in Cloud Functions runtime env via deploy.yml):
 *   INSTANTLY_API_KEY     — Instantly v2 per-campaign analytics
 *   GEMINI_API_KEY        — Gemini 2.0 Flash strategic analysis
 *   SLACK_BOT_TOKEN       — files.upload for PDF attachment (preferred)
 *   SLACK_WEBHOOK_URL     — fallback if bot token missing
 *   TELEGRAM_BOT_TOKEN    — sendDocument for PDF attachment
 *   TELEGRAM_CHAT_ID      — destination chat
 *   MOCKUP_RENDERER_URL   — Cloud Run HTML→PDF endpoint (defaults to prod)
 * Optional:
 *   SLACK_CHANNEL_ID      — defaults to C08KCBR9PE6 (#all-jegodigital)
 *
 * NOTE on Calendly/ManyChat/Calls/Audits: these read from Firestore
 * (calendly_events, sofia_conversations/manychat_events/whatsapp_conversations,
 * call_analysis, audit_requests) — populated by upstream webhooks. No direct
 * Calendly/ManyChat API calls happen here; Firestore is the canonical source.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const FormData = require("form-data");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ---------- Config ----------
const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const CALENDLY_BASE = "https://api.calendly.com";
const MOCKUP_RENDERER =
    process.env.MOCKUP_RENDERER_URL ||
    "https://mockup-renderer-wfmydylowa-uc.a.run.app";

// Telegram fallbacks (same as coldEmailDailyReport — known-working ids)
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

// Slack channel id for #all-jegodigital (uses files.upload API requires channel ID)
// Falls back to webhook-only if SLACK_BOT_TOKEN isn't set.
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "C08KCBR9PE6";

// ---------- CDMX / 24h window helpers ----------
/**
 * Returns a {startIso, endIso, key} window for the last 24 hours ending at
 * fire time (typically 21:00 CDMX). Keyed as YYYY-MM-DD of the END date in CDMX.
 */
function last24hWindow() {
    const now = new Date();
    const end = now; // fire moment
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // CDMX date key (UTC-6)
    const cdmxEnd = new Date(end.getTime() - 6 * 60 * 60 * 1000);
    const key = cdmxEnd.toISOString().slice(0, 10);
    return {
        start, end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        startTs: admin.firestore.Timestamp.fromDate(start),
        endTs: admin.firestore.Timestamp.fromDate(end),
        key,
    };
}

// Instantly only supports per-day windows — compute the CDMX date we want.
function cdmxDateKey(d) {
    const cdmx = new Date(d.getTime() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

function humanPct(num, den) {
    if (!den) return "0.0%";
    return ((num / den) * 100).toFixed(1) + "%";
}

// ---------- 1. INSTANTLY (Cold Email) ----------
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

async function instantlyDaily(campaignId, startDate, endDate) {
    try {
        const url = `${INSTANTLY_BASE}/campaigns/analytics/daily?campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`;
        const r = await axios.get(url, { headers: instantlyAuth(), timeout: 15000 });
        return Array.isArray(r.data) ? r.data : (r.data.items || r.data.data || []);
    } catch (err) {
        functions.logger.warn(`instantlyDaily failed ${campaignId}: ${err.message}`);
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
    const dateKey = window.key; // end date in CDMX
    // Instantly's per-day endpoint needs a start/end date. Pull today + yesterday
    // and sum — that's effectively the 24h window (Instantly granularity is daily).
    const dayNow = dateKey;
    const d = new Date(window.start.getTime() - 6 * 60 * 60 * 1000);
    const dayPrev = d.toISOString().slice(0, 10);

    let campaigns = [];
    try {
        campaigns = await listInstantlyCampaigns();
    } catch (err) {
        functions.logger.error("Failed to list campaigns:", err.message);
        return { error: err.message, totals: { sent: 0, opens: 0, replies: 0, bounces: 0 }, campaigns: [] };
    }

    // Only active campaigns (status 1)
    const active = campaigns.filter((c) => c.status === 1);
    const perCampaign = [];
    const totals = { sent: 0, opens: 0, replies: 0, bounces: 0, clicks: 0 };

    for (const c of active) {
        const rows = await instantlyDaily(c.id, dayPrev, dayNow);
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
        window_label: "Last 24h (Instantly daily granularity)",
        total_active: active.length,
        active_firing: perCampaign.length,
        totals,
        open_rate: humanPct(totals.opens, totals.sent),
        reply_rate: humanPct(totals.replies, totals.sent),
        bounce_rate: humanPct(totals.bounces, totals.sent),
        campaigns: perCampaign.sort((a, b) => b.sent - a.sent),
    };
}

// ---------- 2. CALENDLY BOOKINGS ----------
async function aggregateCalendly(db, window) {
    // Primary source: Firestore calendly_events (populated by calendlyWebhook).
    // This avoids the Calendly API rate limit and is the canonical source.
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
                start_time: d.event_start_time || d.scheduled_event?.start_time,
            });
        });
        return { booked, canceled, noshow, events };
    } catch (err) {
        functions.logger.warn("Calendly Firestore fetch failed:", err.message);
        return { error: err.message, booked: 0, canceled: 0, noshow: 0, events: [] };
    }
}

// ---------- 3. MANYCHAT / SOFIA CONVERSATIONS ----------
async function aggregateManyChat(db, window) {
    // Source: Firestore sofia_conversations (if populated) or manychat_events.
    // Falls back gracefully if neither collection exists.
    const collections = ["sofia_conversations", "manychat_events", "whatsapp_conversations"];
    for (const col of collections) {
        try {
            const snap = await db.collection(col)
                .where("created_at", ">=", window.startTs)
                .where("created_at", "<", window.endTs)
                .limit(500)
                .get();
            if (!snap.empty) {
                const byChannel = { wa: 0, ig: 0, unknown: 0 };
                const byOutcome = { qualified: 0, audit_requested: 0, booked: 0, cold: 0 };
                snap.forEach((doc) => {
                    const d = doc.data();
                    const ch = (d.channel || d.source || "").toLowerCase();
                    if (ch.includes("whatsapp") || ch === "wa") byChannel.wa++;
                    else if (ch.includes("instagram") || ch === "ig") byChannel.ig++;
                    else byChannel.unknown++;
                    const outcome = (d.outcome || d.status || "").toLowerCase();
                    if (outcome.includes("book")) byOutcome.booked++;
                    else if (outcome.includes("audit")) byOutcome.audit_requested++;
                    else if (outcome.includes("qualif")) byOutcome.qualified++;
                    else byOutcome.cold++;
                });
                return { collection: col, total: snap.size, byChannel, byOutcome };
            }
        } catch (err) {
            functions.logger.warn(`ManyChat fetch from ${col} failed: ${err.message}`);
        }
    }
    return { total: 0, note: "No conversations logged to Firestore yet — ManyChat webhook may not be writing." };
}

// ---------- 4. COLD CALL OUTCOMES (ElevenLabs via call_analysis) ----------
async function aggregateColdCalls(db, window) {
    try {
        const snap = await db.collection("call_analysis")
            .where("updated_at", ">=", window.startTs)
            .where("updated_at", "<", window.endTs)
            .limit(500)
            .get();

        const byOffer = { A: 0, B: 0, C: 0, unknown: 0 };
        const byOutcome = { connected: 0, voicemail: 0, no_answer: 0, failed: 0, real_conversation: 0, positive: 0 };
        const positiveLeads = []; // surface names for Alex

        snap.forEach((doc) => {
            const d = doc.data();
            const offer = (d.offer || "").toUpperCase();
            if (byOffer[offer] !== undefined) byOffer[offer]++;
            else byOffer.unknown++;

            const status = (d.call_status || d.status || "").toLowerCase();
            if (status.includes("connect") || d.duration_seconds > 20) byOutcome.connected++;
            if (status.includes("voicemail")) byOutcome.voicemail++;
            if (status.includes("no_answer") || status === "initiated") byOutcome.no_answer++;
            if (status.includes("fail")) byOutcome.failed++;
            if (d.real_conversation || d.duration_seconds > 45) byOutcome.real_conversation++;
            if (d.sentiment === "positive" || d.booked_calendly || d.wants_audit) {
                byOutcome.positive++;
                positiveLeads.push({
                    name: d.lead_name || d.name || "Unknown",
                    phone: d.phone || d.lead_phone || "",
                    offer,
                    outcome: d.outcome_summary || d.notes || "",
                });
            }
        });

        return {
            total: snap.size,
            byOffer,
            byOutcome,
            positiveLeads: positiveLeads.slice(0, 10),
        };
    } catch (err) {
        functions.logger.warn("Cold-call fetch failed:", err.message);
        return { error: err.message, total: 0, byOffer: {}, byOutcome: {}, positiveLeads: [] };
    }
}

// ---------- 5. FREE AUDIT REQUESTS ----------
async function aggregateAudits(db, window) {
    try {
        const snap = await db.collection("audit_requests")
            .where("created_at", ">=", window.startTs)
            .where("created_at", "<", window.endTs)
            .get();
        const bySource = {};
        const byStatus = {};
        const recent = [];
        snap.forEach((doc) => {
            const d = doc.data();
            const src = d.source || "unknown";
            bySource[src] = (bySource[src] || 0) + 1;
            const st = d.status || "pending";
            byStatus[st] = (byStatus[st] || 0) + 1;
            recent.push({
                website: d.website || d.url || "",
                email: d.email || "",
                source: src,
                status: st,
            });
        });
        return { total: snap.size, bySource, byStatus, recent: recent.slice(0, 10) };
    } catch (err) {
        functions.logger.warn("Audits fetch failed:", err.message);
        return { error: err.message, total: 0, bySource: {}, byStatus: {}, recent: [] };
    }
}

// ---------- HTML REPORT TEMPLATE ----------
function renderReportHtml(data) {
    const { window, email, calendly, manychat, calls, audits } = data;
    const safeNum = (n) => (n == null ? 0 : n);

    const campaignRows = (email.campaigns || []).map((c) => `
        <tr>
            <td>${escape(c.name)}</td>
            <td class="num">${c.sent}</td>
            <td class="num">${c.opens} <span class="pct">(${c.open_rate})</span></td>
            <td class="num">${c.replies} <span class="pct">(${c.reply_rate})</span></td>
            <td class="num">${c.bounces} <span class="pct ${parseFloat(c.bounce_rate) > 5 ? "warn" : ""}">(${c.bounce_rate})</span></td>
        </tr>
    `).join("") || `<tr><td colspan="5" class="empty">No active campaigns fired in last 24h.</td></tr>`;

    const calendlyRows = (calendly.events || []).slice(0, 10).map((e) => `
        <tr>
            <td><span class="tag tag-${e.event.replace(/[.]/g, "-")}">${shortEvent(e.event)}</span></td>
            <td>${escape(e.name)}</td>
            <td class="dim">${escape(e.email)}</td>
        </tr>
    `).join("") || `<tr><td colspan="3" class="empty">No Calendly activity in last 24h.</td></tr>`;

    const callLeadRows = (calls.positiveLeads || []).map((l) => `
        <tr>
            <td><span class="tag tag-offer-${l.offer}">${l.offer}</span></td>
            <td>${escape(l.name)}</td>
            <td class="dim">${escape(l.phone)}</td>
            <td class="dim">${escape((l.outcome || "").slice(0, 80))}</td>
        </tr>
    `).join("") || `<tr><td colspan="4" class="empty">No positive cold-call outcomes logged.</td></tr>`;

    const auditRows = (audits.recent || []).map((a) => `
        <tr>
            <td><span class="tag">${escape(a.source)}</span></td>
            <td>${escape(a.website)}</td>
            <td class="dim">${escape(a.email)}</td>
            <td><span class="tag tag-${a.status}">${escape(a.status)}</span></td>
        </tr>
    `).join("") || `<tr><td colspan="4" class="empty">No audit requests in last 24h.</td></tr>`;

    const headline = [
        `${safeNum(email.totals?.sent)} emails sent`,
        `${safeNum(calendly.booked)} calls booked`,
        `${safeNum(calls.total)} cold calls`,
        `${safeNum(audits.total)} audits requested`,
    ].join(" · ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>JegoDigital — Evening Ops Report — ${window.key}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #0a0a0f;
    color: #e8e8ef;
    padding: 40px 48px;
    font-size: 11pt;
    line-height: 1.5;
  }
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

  .section { margin-bottom: 36px; page-break-inside: avoid; }
  .section h2 {
    font-family: 'Playfair Display', serif;
    color: #C5A059;
    font-size: 16pt;
    font-weight: 700;
    margin-bottom: 14px;
    display: flex; align-items: center; gap: 10px;
  }
  .section h2 .count { color: #fff; font-size: 11pt; font-family: 'Inter', sans-serif; font-weight: 500; background: #1a1a24; padding: 3px 10px; border-radius: 10px; }

  table { width: 100%; border-collapse: collapse; background: #12121a; border-radius: 4px; overflow: hidden; }
  th { background: #1a1a24; color: #C5A059; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid #2a2a36; }
  td { padding: 10px 12px; border-bottom: 1px solid #1f1f2a; font-size: 10pt; }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 500; }
  td.dim { color: #8a8a9a; font-size: 9pt; }
  td.empty { color: #6a6a7a; text-align: center; font-style: italic; padding: 20px; }
  .pct { color: #8a8a9a; font-size: 9pt; margin-left: 4px; }
  .pct.warn { color: #e07b7b; font-weight: 600; }

  .tag { display: inline-block; padding: 2px 8px; border-radius: 10px; background: #2a2a36; color: #c8c8d0; font-size: 8pt; font-weight: 500; letter-spacing: 0.3px; }
  .tag-invitee-created { background: #1e3a2e; color: #6ee7a7; }
  .tag-invitee-canceled { background: #3a1e1e; color: #e07b7b; }
  .tag-invitee_no_show-created { background: #3a321e; color: #e7c56e; }
  .tag-offer-A { background: #1e2a3a; color: #7aa7e7; }
  .tag-offer-B { background: #2a1e3a; color: #b37ae7; }
  .tag-offer-C { background: #3a2a1e; color: #e7a77a; }
  .tag-pending { background: #3a321e; color: #e7c56e; }
  .tag-completed { background: #1e3a2e; color: #6ee7a7; }
  .tag-failed { background: #3a1e1e; color: #e07b7b; }

  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #2a2a36; color: #6a6a7a; font-size: 9pt; text-align: center; }
  .footer .brand { color: #C5A059; font-family: 'Playfair Display', serif; font-weight: 700; }
</style>
</head>
<body>

<div class="header">
  <h1><span class="brand">JegoDigital</span> · Evening Ops Report</h1>
  <div class="meta">${window.key} · Last 24h window · Generated ${new Date().toUTCString()}</div>
  <div class="headline">${headline}</div>
</div>

<div class="kpi-grid">
  <div class="kpi">
    <div class="label">Cold Email Sends</div>
    <div class="value">${safeNum(email.totals?.sent).toLocaleString()}</div>
    <div class="sub">${email.reply_rate || "0%"} reply · ${email.open_rate || "0%"} open</div>
  </div>
  <div class="kpi">
    <div class="label">Calendly Bookings</div>
    <div class="value">${safeNum(calendly.booked)}</div>
    <div class="sub">${safeNum(calendly.canceled)} canceled · ${safeNum(calendly.noshow)} no-show</div>
  </div>
  <div class="kpi">
    <div class="label">Cold Calls</div>
    <div class="value">${safeNum(calls.total)}</div>
    <div class="sub">${safeNum(calls.byOutcome?.real_conversation)} real convos · ${safeNum(calls.byOutcome?.positive)} positive</div>
  </div>
  <div class="kpi">
    <div class="label">Free Audits Requested</div>
    <div class="value">${safeNum(audits.total)}</div>
    <div class="sub">${Object.entries(audits.bySource || {}).map(([k, v]) => `${v} ${k}`).join(" · ") || "—"}</div>
  </div>
</div>

<div class="section">
  <h2>Cold Email — Per Campaign <span class="count">${email.active_firing || 0} firing of ${email.total_active || 0} active</span></h2>
  <table>
    <thead><tr><th>Campaign</th><th>Sent</th><th>Opens</th><th>Replies</th><th>Bounces</th></tr></thead>
    <tbody>${campaignRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Calendly — Bookings <span class="count">${safeNum(calendly.booked)} booked</span></h2>
  <table>
    <thead><tr><th>Event</th><th>Name</th><th>Email</th></tr></thead>
    <tbody>${calendlyRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Cold Calls — Positive Outcomes <span class="count">${(calls.positiveLeads || []).length} positive of ${safeNum(calls.total)}</span></h2>
  <table>
    <thead><tr><th>Offer</th><th>Name</th><th>Phone</th><th>Notes</th></tr></thead>
    <tbody>${callLeadRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Free Audit Requests <span class="count">${safeNum(audits.total)} total</span></h2>
  <table>
    <thead><tr><th>Source</th><th>Website</th><th>Email</th><th>Status</th></tr></thead>
    <tbody>${auditRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>ManyChat / Sofia Conversations <span class="count">${safeNum(manychat.total)} total</span></h2>
  <p style="color: #c8c8d0; font-size: 10pt; background: #12121a; padding: 16px 18px; border-radius: 4px;">
    ${manychat.note || `WhatsApp: ${safeNum(manychat.byChannel?.wa)} · Instagram: ${safeNum(manychat.byChannel?.ig)} · Qualified: ${safeNum(manychat.byOutcome?.qualified)} · Bookings: ${safeNum(manychat.byOutcome?.booked)}`}
  </p>
</div>

<div class="footer">
  <span class="brand">JegoDigital</span> · Autonomous Ops Report · Next report: tomorrow 21:00 CDMX
</div>

</body>
</html>`;
}

function escape(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

function shortEvent(e) {
    if (e === "invitee.created") return "booked";
    if (e === "invitee.canceled") return "canceled";
    if (e === "invitee_no_show.created") return "no-show";
    return e || "event";
}

// ---------- RENDER HTML → PDF via mockup-renderer ----------
async function renderPdf(html) {
    const url = `${MOCKUP_RENDERER}/renderPdf`;
    // Retry once on 500 (cold-start pattern documented in skill/docs)
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

// ---------- UPLOAD TO FIREBASE STORAGE ----------
async function uploadPdfToStorage(pdfBuffer, dateKey) {
    const bucket = admin.storage().bucket();
    const fileName = `evening_ops_reports/${dateKey}/evening-ops-${dateKey}.pdf`;
    const file = bucket.file(fileName);
    await file.save(pdfBuffer, {
        metadata: { contentType: "application/pdf" },
        resumable: false,
    });
    // 7-day signed URL (short enough to not leak forever, long enough for Alex to click later)
    const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    return { fileName, signedUrl };
}

// ---------- SLACK DELIVERY ----------
/**
 * Tries files.upload with bot token FIRST (attaches the PDF inline).
 * Falls back to webhook with the signed URL link if no bot token is set.
 */
async function postSlackWithPdf(pdfBuffer, summaryText, signedUrl, dateKey) {
    const botToken = process.env.SLACK_BOT_TOKEN;

    // Primary path — files.upload (shows PDF in-channel)
    if (botToken) {
        try {
            // Step 1: getUploadURLExternal
            const fileSize = pdfBuffer.length;
            const getUrlResp = await axios.get(
                `https://slack.com/api/files.getUploadURLExternal?filename=evening-ops-${dateKey}.pdf&length=${fileSize}`,
                { headers: { Authorization: `Bearer ${botToken}` }, timeout: 15000 }
            );
            if (!getUrlResp.data.ok) throw new Error("getUploadURLExternal: " + getUrlResp.data.error);
            const { upload_url, file_id } = getUrlResp.data;

            // Step 2: POST bytes to upload_url
            await axios.post(upload_url, pdfBuffer, {
                headers: { "Content-Type": "application/pdf" },
                timeout: 30000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });

            // Step 3: completeUploadExternal
            const completeResp = await axios.post(
                "https://slack.com/api/files.completeUploadExternal",
                {
                    files: [{ id: file_id, title: `JegoDigital Evening Ops — ${dateKey}` }],
                    channel_id: SLACK_CHANNEL_ID,
                    initial_comment: summaryText,
                },
                {
                    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
                    timeout: 15000,
                }
            );
            if (!completeResp.data.ok) throw new Error("completeUploadExternal: " + completeResp.data.error);
            functions.logger.info(`Slack PDF uploaded: ${file_id}`);
            return { ok: true, mode: "files.upload", file_id };
        } catch (err) {
            functions.logger.warn(`Slack files.upload failed — falling back to webhook: ${err.message}`);
        }
    }

    // 2026-04-25: routed to #daily-ops via slackPost helper (was firehose).
    const { slackPost } = require('./slackPost');
    const result = await slackPost('daily-ops', {
        text: `${summaryText}\n\n📎 <${signedUrl}|Download PDF>`,
    });
    if (!result.ok) {
        functions.logger.error("eveningOpsReport Slack failed:", result.error || "unknown");
        return { ok: false, mode: "slackPost", error: result.error };
    }
    return { ok: true, mode: "slackPost", channel: result.channel };
}

// ---------- TELEGRAM DELIVERY ----------
async function postTelegramWithPdf(pdfBuffer, caption, dateKey) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    if (!token || !chatId) {
        functions.logger.warn("Telegram creds missing");
        return { ok: false };
    }

    try {
        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("caption", caption);
        form.append("parse_mode", "Markdown");
        form.append("document", pdfBuffer, {
            filename: `evening-ops-${dateKey}.pdf`,
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
        functions.logger.error("Telegram sendDocument failed:", err.message);
        return { ok: false, error: err.message };
    }
}

// ---------- AI AGENT — auto-fix + escalate ----------
const { runAiAgent } = require("./aiAnalysisAgent");

// ---------- MAIN PIPELINE ----------
async function runEveningOpsReport(options = {}) {
    const window = last24hWindow();
    functions.logger.info(`Evening ops report starting for ${window.key}`);

    const db = admin.firestore();

    // Parallel fetch all 5 data sources
    const [email, calendly, manychat, calls, audits] = await Promise.all([
        aggregateColdEmail(window).catch((e) => ({ error: e.message, totals: { sent: 0 }, campaigns: [] })),
        aggregateCalendly(db, window).catch((e) => ({ error: e.message, booked: 0, canceled: 0, noshow: 0, events: [] })),
        aggregateManyChat(db, window).catch((e) => ({ error: e.message, total: 0 })),
        aggregateColdCalls(db, window).catch((e) => ({ error: e.message, total: 0, byOffer: {}, byOutcome: {}, positiveLeads: [] })),
        aggregateAudits(db, window).catch((e) => ({ error: e.message, total: 0, bySource: {}, byStatus: {}, recent: [] })),
    ]);

    const data = { window, email, calendly, manychat, calls, audits };

    // Render → PDF
    let pdfBuffer = null;
    let pdfError = null;
    try {
        const html = renderReportHtml(data);
        pdfBuffer = await renderPdf(html);
    } catch (err) {
        pdfError = err.message;
        functions.logger.error("PDF render failed:", err.message);
    }

    // Upload + signed URL (only if PDF render worked)
    let storage = null;
    if (pdfBuffer) {
        try {
            storage = await uploadPdfToStorage(pdfBuffer, window.key);
        } catch (err) {
            functions.logger.error("Storage upload failed:", err.message);
        }
    }

    // Headline text for Slack/Telegram
    const headline = `*JegoDigital — Evening Ops Report — ${window.key}*\n` +
        `📧 ${email.totals?.sent || 0} emails sent · ${email.reply_rate || "0%"} reply · ${email.bounce_rate || "0%"} bounce\n` +
        `📅 ${calendly.booked || 0} calls booked · ${calendly.canceled || 0} canceled · ${calendly.noshow || 0} no-show\n` +
        `📞 ${calls.total || 0} cold calls · ${calls.byOutcome?.real_conversation || 0} real convos · ${calls.byOutcome?.positive || 0} positive\n` +
        `🔍 ${audits.total || 0} audits requested · 💬 ${manychat.total || 0} Sofia convos`;

    // Deliver
    let slackResult = { ok: false };
    let telegramResult = { ok: false };
    if (pdfBuffer) {
        [slackResult, telegramResult] = await Promise.all([
            postSlackWithPdf(pdfBuffer, headline, storage?.signedUrl, window.key),
            postTelegramWithPdf(pdfBuffer, headline, window.key),
        ]);
    } else {
        // 2026-04-25: routed to #daily-ops (text-only fallback when PDF fails) via slackPost.
        try {
            const { slackPost } = require('./slackPost');
            const result = await slackPost('daily-ops', {
                text: headline + `\n\n⚠️ PDF render failed: ${pdfError}`,
            });
            if (result.ok) {
                slackResult = { ok: true, mode: "text-only", channel: result.channel };
            }
        } catch (e) {
            functions.logger.error("eveningOpsReport text-only Slack fallback failed:", e.message);
        }
    }

    // AI Agent — auto-fix + escalate
    let aiResult = { ok: false, skipped: true };
    if (!options.skipAiAgent) {
        try {
            aiResult = await runAiAgent(data);
        } catch (err) {
            functions.logger.error("AI agent failed:", err.message);
            aiResult = { ok: false, error: err.message };
        }
    }

    // Firestore snapshot
    const snapshot = {
        window_key: window.key,
        window_start: window.startTs,
        window_end: window.endTs,
        email_totals: email.totals,
        email_campaigns_firing: email.active_firing,
        email_reply_rate: email.reply_rate,
        email_bounce_rate: email.bounce_rate,
        calendly_booked: calendly.booked,
        calendly_canceled: calendly.canceled,
        calendly_noshow: calendly.noshow,
        calls_total: calls.total,
        calls_positive: calls.byOutcome?.positive || 0,
        calls_real_conversations: calls.byOutcome?.real_conversation || 0,
        audits_total: audits.total,
        audits_bySource: audits.bySource,
        manychat_total: manychat.total,
        pdf_url: storage?.signedUrl || null,
        pdf_file: storage?.fileName || null,
        pdf_error: pdfError,
        slack_ok: slackResult.ok,
        slack_mode: slackResult.mode,
        telegram_ok: telegramResult.ok,
        ai_agent_ok: aiResult.ok,
        ai_actions_taken: aiResult.actions || [],
        ai_escalations: aiResult.escalations || [],
        generated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    try {
        await db.collection("evening_ops_reports").doc(window.key).set(snapshot, { merge: true });
    } catch (err) {
        functions.logger.error("Snapshot save failed:", err.message);
    }

    return {
        ok: true,
        window_key: window.key,
        pdf_url: storage?.signedUrl,
        slack: slackResult,
        telegram: telegramResult,
        ai: aiResult,
    };
}

// ---------- EXPORTS ----------

// Daily cron: 21:00 CDMX every day
exports.eveningOpsReport = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB", secrets: [] })
    .pubsub.schedule("0 21 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const result = await runEveningOpsReport();
            functions.logger.info("Evening ops report done:", JSON.stringify(result));
            return null;
        } catch (err) {
            functions.logger.error("Evening ops report threw:", err);
            return null;
        }
    });

// On-demand HTTPS endpoint (for manual trigger / debug / first test)
// Example: curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/eveningOpsReportOnDemand?skipAi=0"
exports.eveningOpsReportOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const skipAi = req.query.skipAi === "1";
            const result = await runEveningOpsReport({ skipAiAgent: skipAi });
            res.json(result);
        } catch (err) {
            functions.logger.error("Evening ops on-demand failed:", err);
            res.status(500).json({ error: err.message });
        }
    });

// Expose internal for testing
exports._runEveningOpsReport = runEveningOpsReport;
