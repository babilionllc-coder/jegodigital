/**
 * dailyDigest — 07:00 CDMX Telegram morning brief.
 *
 * Pulls yesterday's numbers from Firestore + Instantly API, builds a
 * one-card Telegram Markdown summary, and writes a snapshot to
 * `daily_digests/{YYYY-MM-DD}`.
 *
 * Every metric is wrapped in its own try/catch — a single broken API
 * must not block the digest. Missing data renders as "—" so Alex
 * immediately sees what's dark.
 *
 * Schedule: `every day 07:00` / timezone `America/Mexico_City`
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (required)
 *   INSTANTLY_API_KEY                     (optional — graceful skip)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// ---- Telegram fallbacks (match calendlyWebhook.js) ----
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        const r = await axios.post(url, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (r.data?.ok) return { ok: true };
        const r2 = await axios.post(url, { chat_id: chatId, text }, { timeout: 10000 });
        return { ok: !!r2.data?.ok, fallback: "plaintext" };
    } catch (err) {
        functions.logger.error("dailyDigest Telegram send failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---- Date helpers (America/Mexico_City = UTC-6, no DST since 2022) ----
function cdmxYesterdayRange() {
    // Run at 07:00 CDMX → yesterday is CDMX midnight -> midnight (24h window)
    // CDMX is UTC-6 year-round (MX eliminated DST in 2022, excl. border states).
    const now = new Date();
    const cdmxOffsetMs = -6 * 60 * 60 * 1000;
    const nowCdmx = new Date(now.getTime() + cdmxOffsetMs);
    // Zero to midnight CDMX today, then step back 1 day
    const y = nowCdmx.getUTCFullYear();
    const m = nowCdmx.getUTCMonth();
    const d = nowCdmx.getUTCDate();
    const todayMidnightCdmxUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - cdmxOffsetMs);
    const yesterdayMidnightCdmxUtc = new Date(todayMidnightCdmxUtc.getTime() - 24 * 60 * 60 * 1000);
    return {
        start: admin.firestore.Timestamp.fromDate(yesterdayMidnightCdmxUtc),
        end: admin.firestore.Timestamp.fromDate(todayMidnightCdmxUtc),
        dateKey: yesterdayMidnightCdmxUtc.toISOString().slice(0, 10), // YYYY-MM-DD
    };
}

// ---- Metric collectors ----
async function countCalendly(db, start, end) {
    try {
        const snap = await db.collection("calendly_events")
            .where("received_at", ">=", start)
            .where("received_at", "<", end)
            .get();
        let booked = 0, canceled = 0, noshow = 0;
        snap.forEach((doc) => {
            const e = doc.data().event;
            if (e === "invitee.created") booked++;
            else if (e === "invitee.canceled") canceled++;
            else if (e === "invitee_no_show.created") noshow++;
        });
        return { booked, canceled, noshow };
    } catch (err) {
        functions.logger.warn("countCalendly failed:", err.message);
        return null;
    }
}

async function countAudits(db, start, end) {
    try {
        const snap = await db.collection("audit_requests")
            .where("created_at", ">=", start)
            .where("created_at", "<", end)
            .get();
        const bySource = {};
        snap.forEach((doc) => {
            const src = doc.data().source || "unknown";
            bySource[src] = (bySource[src] || 0) + 1;
        });
        return { total: snap.size, bySource };
    } catch (err) {
        functions.logger.warn("countAudits failed:", err.message);
        return null;
    }
}

async function countScheduledEmails(db, start, end) {
    try {
        // sent_at is the signal for sent, failed_at for failed
        const sentSnap = await db.collection("scheduled_emails")
            .where("sent_at", ">=", start)
            .where("sent_at", "<", end)
            .get();
        const failedSnap = await db.collection("scheduled_emails")
            .where("failed_at", ">=", start)
            .where("failed_at", "<", end)
            .get();
        return { sent: sentSnap.size, failed: failedSnap.size };
    } catch (err) {
        functions.logger.warn("countScheduledEmails failed:", err.message);
        return null;
    }
}

async function countCalls(db, start, end) {
    try {
        const snap = await db.collection("call_analysis")
            .where("created_at", ">=", start)
            .where("created_at", "<", end)
            .get();
        let positive = 0, negative = 0, neutral = 0;
        snap.forEach((doc) => {
            const o = (doc.data().outcome || "").toLowerCase();
            if (o.includes("positive") || o.includes("interested")) positive++;
            else if (o.includes("negative") || o.includes("not interested")) negative++;
            else neutral++;
        });
        return { total: snap.size, positive, negative, neutral };
    } catch (err) {
        functions.logger.warn("countCalls failed:", err.message);
        return null;
    }
}

async function fetchInstantlyStats() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) return null;
    try {
        // Instantly v2 dashboard summary — account-level rollup.
        // If the endpoint shape changes, we still return null and the digest
        // renders "—" for this row instead of blowing up.
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns/analytics/overview", {
            headers: { Authorization: `Bearer ${key}` },
            timeout: 8000,
        });
        const d = r.data || {};
        return {
            sent: d.emails_sent_count ?? d.sent ?? null,
            opens: d.unique_opens_count ?? d.opens ?? null,
            replies: d.replies_count ?? d.replies ?? null,
            bounces: d.bounces_count ?? d.bounces ?? null,
        };
    } catch (err) {
        functions.logger.warn("fetchInstantlyStats failed:", err.response?.status || err.message);
        return null;
    }
}

// ---- 7-day rolling baseline for anomaly detection (added 2026-04-20) ----
async function fetchLast7Digests(db, excludeKey) {
    // Pull last 7 days of digests (excluding today's key) to compute a rolling average.
    // Missing days are skipped — we average only the days we have.
    const keys = [];
    const now = new Date();
    const cdmxOffsetMs = -6 * 60 * 60 * 1000;
    const nowCdmx = new Date(now.getTime() + cdmxOffsetMs);
    for (let i = 1; i <= 7; i++) {
        const d = new Date(nowCdmx.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        if (key !== excludeKey) keys.push(key);
    }
    const docs = await Promise.all(
        keys.map((k) => db.collection("daily_digests").doc(k).get().catch(() => null))
    );
    return docs.filter((d) => d && d.exists).map((d) => d.data());
}

function rollingAvg(docs, path) {
    if (!docs.length) return null;
    const vals = docs.map((d) => {
        const parts = path.split(".");
        let v = d;
        for (const p of parts) v = v?.[p];
        return typeof v === "number" ? v : 0;
    });
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function anomalyCheck(today, avg, metricName, min_baseline = 3) {
    // Flag a metric as anomalous when:
    //   avg ≥ min_baseline (avoid noise on tiny numbers)
    //   AND (today < avg*0.5 → 50% DROP, or today > avg*3 → 200% SPIKE)
    // Returns {severity, msg} or null.
    if (today === null || today === undefined || avg === null) return null;
    if (avg < min_baseline) return null;
    if (today < avg * 0.5) {
        return {
            severity: "drop",
            msg: `${metricName}: *${today}* vs 7d avg *${avg.toFixed(1)}* (↓${(100 - (today / avg) * 100).toFixed(0)}%)`,
        };
    }
    if (today > avg * 3) {
        return {
            severity: "spike",
            msg: `${metricName}: *${today}* vs 7d avg *${avg.toFixed(1)}* (↑${((today / avg - 1) * 100).toFixed(0)}%)`,
        };
    }
    return null;
}

// ---- Markdown builder ----
function fmt(n) {
    if (n === null || n === undefined) return "—";
    return typeof n === "number" ? n.toLocaleString("en-US") : String(n);
}

function buildDigest({ dateKey, calendly, audits, emails, calls, instantly, anomalies }) {
    const lines = [];
    lines.push(`🌅 *JegoDigital · Daily Digest*`);
    lines.push(`_${dateKey} (CDMX, yesterday)_`);
    lines.push("");

    // Anomaly section surfaces FIRST so Alex sees trouble before totals.
    if (anomalies && anomalies.length > 0) {
        lines.push(`🚨 *Anomalies vs 7d baseline*`);
        anomalies.forEach((a) => {
            const icon = a.severity === "drop" ? "📉" : "📈";
            lines.push(`   ${icon} ${a.msg}`);
        });
        lines.push("");
    }

    lines.push(`📞 *Cold calls*`);
    if (calls) {
        lines.push(`   Calls: *${fmt(calls.total)}* · 🔥 ${fmt(calls.positive)} positive · ❌ ${fmt(calls.negative)} negative`);
    } else {
        lines.push(`   —`);
    }
    lines.push("");

    lines.push(`📧 *Cold email (Instantly)*`);
    if (instantly) {
        lines.push(`   Sent ${fmt(instantly.sent)} · Opens ${fmt(instantly.opens)} · Replies ${fmt(instantly.replies)} · Bounces ${fmt(instantly.bounces)}`);
    } else {
        lines.push(`   — (INSTANTLY_API_KEY not set or API changed)`);
    }
    lines.push("");

    lines.push(`🔍 *Audits fired*`);
    if (audits) {
        const parts = Object.entries(audits.bySource || {})
            .map(([k, v]) => `${k}:${v}`)
            .join(" · ");
        lines.push(`   Total: *${fmt(audits.total)}*${parts ? `   (${parts})` : ""}`);
    } else {
        lines.push(`   —`);
    }
    lines.push("");

    lines.push(`📅 *Calendly*`);
    if (calendly) {
        lines.push(`   📌 ${fmt(calendly.booked)} booked · ❌ ${fmt(calendly.canceled)} canceled · 🕳️ ${fmt(calendly.noshow)} no-show`);
    } else {
        lines.push(`   —`);
    }
    lines.push("");

    lines.push(`✉️ *Scheduled emails (Brevo queue)*`);
    if (emails) {
        lines.push(`   Sent ${fmt(emails.sent)} · Failed ${fmt(emails.failed)}`);
    } else {
        lines.push(`   —`);
    }

    return lines.join("\n");
}

// ---- Main scheduled function ----
exports.dailyDigest = functions.pubsub
    .schedule("every day 07:00")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const { start, end, dateKey } = cdmxYesterdayRange();

        functions.logger.info(`dailyDigest: compiling ${dateKey} CDMX (${start.toDate().toISOString()} → ${end.toDate().toISOString()})`);

        const [calendly, audits, emails, calls, instantly, baseline] = await Promise.all([
            countCalendly(db, start, end),
            countAudits(db, start, end),
            countScheduledEmails(db, start, end),
            countCalls(db, start, end),
            fetchInstantlyStats(),
            fetchLast7Digests(db, dateKey),
        ]);

        // ---- Anomaly detection vs 7-day rolling average ----
        // Metrics that matter day-to-day. Silent when baseline is thin (<3 units).
        const todayMetrics = {
            "calls.total": calls?.total ?? 0,
            "calls.positive": calls?.positive ?? 0,
            "audits.total": audits?.total ?? 0,
            "calendly.booked": calendly?.booked ?? 0,
            "calendly.noshow": calendly?.noshow ?? 0,
            "instantly.replies": instantly?.replies ?? 0,
            "instantly.bounces": instantly?.bounces ?? 0,
            "emails.failed": emails?.failed ?? 0,
        };
        const anomalies = [];
        for (const [path, todayVal] of Object.entries(todayMetrics)) {
            const avg = rollingAvg(baseline, path);
            const a = anomalyCheck(todayVal, avg, path);
            if (a) anomalies.push(a);
        }

        const digest = buildDigest({ dateKey, calendly, audits, emails, calls, instantly, anomalies });

        // Persist the snapshot first — even if Telegram fails, we have history.
        try {
            await db.collection("daily_digests").doc(dateKey).set({
                date: dateKey,
                generated_at: admin.firestore.FieldValue.serverTimestamp(),
                calendly, audits, emails, calls, instantly,
                anomalies,
                baseline_days: baseline.length,
                digest_text: digest,
            });
        } catch (err) {
            functions.logger.error("dailyDigest Firestore write failed:", err.message);
        }

        const tg = await sendTelegram(digest);
        functions.logger.info(`dailyDigest: telegram ok=${tg.ok} anomalies=${anomalies.length}`);
        return null;
    });
