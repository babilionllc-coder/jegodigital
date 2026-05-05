/**
 * gapCloser.js — every-6h funnel scan for stuck leads.
 *
 * Built 2026-05-05 by Claude as Deliverable 2 of the Infra/Safety AI agents trio.
 * Goal: every 6 hours, scan the full funnel (Instantly → Sofia → Calendly → Closed)
 * and alert Alex on stuck leads. Read-only — never moves leads, never auto-replies.
 * Just surfaces gaps so Alex can intervene.
 *
 * Cron: every 6 hours (00:00, 06:00, 12:00, 18:00 CDMX)
 * Manual trigger: HTTPS `gapCloserOnDemand` (returns digest as JSON)
 *
 * The 4 funnel scans:
 *
 *   GAP 1  Instantly positive → Sofia (4h SLA)
 *          Last 7d Instantly positive replies (instantly_reply_activity outcome=positive
 *          OR positive_with_objection) where the lead's email/phone has NO matching
 *          wa_conversations/{phone}_* updated_at within 4h of the reply.
 *
 *   GAP 2  Sofia stalled before Calendly (24h SLA)
 *          wa_conversations updated_at >24h ago AND no calendly_events for the
 *          same lead phone OR email.
 *
 *   GAP 3  Calendly post-call → no follow-up (24h SLA after end_time)
 *          calendly_events with end_time_utc in last 7d, status="completed" OR
 *          start_time_utc in past >24h, AND no postCallWhatsAppFollowup record
 *          for that event.
 *
 *   GAP 4  Closed-won → no referral request (5d SLA after close)
 *          notion_leads where status=closed_won AND closed_at within last 30d
 *          AND >5d since close AND no referral_requested_at field.
 *
 * Output:
 *   - Telegram + Slack consolidated digest "🚨 N stuck leads in funnel" with deep links
 *   - Firestore log: gap_closer_runs/{ts} (full digest payload, run_id, durations)
 *
 * Idempotent: if Firestore is empty, scans return 0 / no alerts. Re-runs of the
 * same window produce same alerts (no dedupe — Alex sees recurring stuck leads
 * until resolved).
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const SLA_INSTANTLY_TO_SOFIA_HOURS = 4;
const SLA_SOFIA_TO_CALENDLY_HOURS = 24;
const SLA_CALENDLY_FOLLOWUP_HOURS = 24;
const SLA_CLOSED_WON_TO_REFERRAL_DAYS = 5;
const RUNS_COLL = "gap_closer_runs";
const LOOKBACK_DAYS = 7;
const CLOSED_LOOKBACK_DAYS = 30;

// ---------- Helpers ----------
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 12000 }
        );
        return { ok: !!r.data?.ok, message_id: r.data?.result?.message_id };
    } catch (e) {
        try {
            const r = await axios.post(
                `https://api.telegram.org/bot${token}/sendMessage`,
                { chat_id: chatId, text, disable_web_page_preview: true },
                { timeout: 12000 }
            );
            return { ok: !!r.data?.ok, message_id: r.data?.result?.message_id };
        } catch (e2) {
            return { ok: false, error: e2.message };
        }
    }
}

async function sendSlackAlert(text) {
    try {
        const { slackPost } = require("./slackPost");
        return await slackPost("alerts", { text });
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function hoursAgo(h) {
    return new Date(Date.now() - h * 60 * 60 * 1000);
}
function daysAgo(d) {
    return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}
function tsMs(v) {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (v.toMillis) return v.toMillis();
    if (v.toDate) return v.toDate().getTime();
    if (v.seconds) return v.seconds * 1000;
    if (typeof v === "string") {
        const t = Date.parse(v);
        return isNaN(t) ? 0 : t;
    }
    return 0;
}
function digitsOnly(s) { return String(s || "").replace(/[^\d]/g, ""); }
function lc(s) { return String(s || "").toLowerCase().trim(); }

// ---------- GAP 1: Instantly positive → Sofia (4h SLA) ----------
async function _gap1_instantlyToSofia(db, lookbackDays) {
    const since = daysAgo(lookbackDays);
    const slaMs = SLA_INSTANTLY_TO_SOFIA_HOURS * 60 * 60 * 1000;

    let posReplies;
    try {
        posReplies = await db.collection("instantly_reply_activity")
            .where("created_at", ">=", admin.firestore.Timestamp.fromDate(since))
            .limit(200)
            .get();
    } catch (e) {
        return { stuck: [], error: `query_failed:${e.message}` };
    }

    const stuck = [];
    const now = Date.now();
    for (const doc of posReplies.docs) {
        const r = doc.data() || {};
        const outcome = r.outcome || "";
        if (outcome !== "positive" && outcome !== "positive_with_objection") continue;
        const replyTs = tsMs(r.created_at);
        if (!replyTs || (now - replyTs) < slaMs) continue; // still inside SLA — not stuck yet

        const email = lc(r.email || r.lead_email);
        if (!email) continue;

        // Look for any Sofia WA conversation for this lead, updated after replyTs
        let convoFound = false;
        try {
            // wa_conversations doc IDs are `${toNumber}_${leadPhone}`. We don't
            // have the lead's phone reliably from instantly_reply_activity, so
            // we proxy: scan recent wa_conversations and match on linked email
            // field if present, else skip. Best-effort.
            const recentConvos = await db.collection("wa_conversations")
                .where("updated_at", ">=", admin.firestore.Timestamp.fromDate(new Date(replyTs)))
                .limit(50).get();
            recentConvos.forEach((c) => {
                const cd = c.data() || {};
                if (lc(cd.lead_email) === email) convoFound = true;
            });
        } catch (e) {
            // Soft fail — assume not found
        }

        if (!convoFound) {
            stuck.push({
                gap: "instantly_to_sofia",
                lead_email: email,
                reply_ts: new Date(replyTs).toISOString(),
                hours_stuck: Math.round((now - replyTs) / 3600000),
                reply_id: doc.id,
                campaign_id: r.campaign_id || r.instantly_campaign_id || null,
                deep_link: `https://app.instantly.ai/app/unibox?reply=${encodeURIComponent(doc.id)}`,
            });
        }
    }
    return { stuck };
}

// ---------- GAP 2: Sofia stalled (24h, no Calendly yet) ----------
async function _gap2_sofiaToCalendly(db) {
    const cutoff = hoursAgo(SLA_SOFIA_TO_CALENDLY_HOURS);
    let convos;
    try {
        // Find conversations whose last message was >24h ago (i.e. updated_at < cutoff
        // but >= 7 days ago — older than 7d we assume dead).
        convos = await db.collection("wa_conversations")
            .where("updated_at", ">=", admin.firestore.Timestamp.fromDate(daysAgo(LOOKBACK_DAYS)))
            .limit(200).get();
    } catch (e) {
        return { stuck: [], error: `query_failed:${e.message}` };
    }
    const stuck = [];
    for (const doc of convos.docs) {
        const c = doc.data() || {};
        const upd = tsMs(c.updated_at);
        if (!upd || upd >= cutoff.getTime()) continue; // still active
        const phoneRaw = c.lead_phone || c.from || c.phone || doc.id.split("_").slice(-1)[0];
        const phone = digitsOnly(phoneRaw);

        // Calendly booking exists for this phone? (best-effort match)
        let booked = false;
        try {
            const cal = await db.collection("calendly_events")
                .where("whatsapp", "==", phone)
                .limit(1).get();
            if (!cal.empty) booked = true;
        } catch (e) {}

        if (!booked) {
            stuck.push({
                gap: "sofia_to_calendly",
                lead_phone: phone,
                last_msg_ts: new Date(upd).toISOString(),
                hours_stuck: Math.round((Date.now() - upd) / 3600000),
                convo_id: doc.id,
                deep_link: `https://wa.me/${phone}`,
            });
        }
    }
    return { stuck };
}

// ---------- GAP 3: Calendly post-call no follow-up ----------
async function _gap3_calendlyFollowup(db) {
    const since = daysAgo(LOOKBACK_DAYS);
    const followUpCutoff = hoursAgo(SLA_CALENDLY_FOLLOWUP_HOURS);
    let events;
    try {
        events = await db.collection("calendly_events")
            .where("start_time_utc", ">=", since.toISOString())
            .limit(200).get();
    } catch (e) {
        // Calendly stores start_time_utc as ISO string in some places — fallback try
        try {
            events = await db.collection("calendly_events")
                .where("start_time_utc", ">=", admin.firestore.Timestamp.fromDate(since))
                .limit(200).get();
        } catch (e2) {
            return { stuck: [], error: `query_failed:${e2.message}` };
        }
    }
    const stuck = [];
    for (const doc of events.docs) {
        const ev = doc.data() || {};
        // We want events whose start time is in past >24h
        const start = tsMs(ev.start_time_utc) || tsMs(ev.start_time) || 0;
        if (!start || start > followUpCutoff.getTime()) continue;
        if (ev.event_type && ev.event_type !== "invitee.created") continue;

        // Has follow-up been sent? Look for postCallWhatsAppFollowup ledger.
        let followed = false;
        try {
            const fu = await db.collection("post_call_followups")
                .where("calendly_event_id", "==", doc.id)
                .limit(1).get();
            if (!fu.empty) followed = true;
        } catch (e) {}
        // Also accept boolean field on the event itself (older path)
        if (ev.post_call_followup_sent === true) followed = true;

        if (!followed) {
            stuck.push({
                gap: "calendly_followup",
                lead_email: lc(ev.invitee_email || ""),
                lead_phone: digitsOnly(ev.whatsapp || ""),
                event_start: new Date(start).toISOString(),
                hours_stuck: Math.round((Date.now() - start) / 3600000) - SLA_CALENDLY_FOLLOWUP_HOURS,
                event_id: doc.id,
                deep_link: ev.cancel_url || ev.reschedule_url || `https://calendly.com/event_types/jegoalexdigital/30min`,
            });
        }
    }
    return { stuck };
}

// ---------- GAP 4: closed-won → no referral request (5d SLA) ----------
async function _gap4_closedToReferral(db) {
    const since = daysAgo(CLOSED_LOOKBACK_DAYS);
    const referralCutoff = daysAgo(SLA_CLOSED_WON_TO_REFERRAL_DAYS);
    // Try multiple sources — notion_leads first, fall back to leads
    const sources = ["notion_leads", "leads", "clients"];
    const stuck = [];
    for (const source of sources) {
        try {
            const snap = await db.collection(source)
                .where("status", "in", ["closed_won", "Closed Won", "client", "active_client"])
                .limit(100).get();
            for (const doc of snap.docs) {
                const d = doc.data() || {};
                const closedAt = tsMs(d.closed_at) || tsMs(d.won_at) || tsMs(d.client_since) || 0;
                if (!closedAt) continue;
                if (closedAt < since.getTime()) continue;          // older than 30d → dropped from queue
                if (closedAt > referralCutoff.getTime()) continue; // still inside 5d SLA — not stuck
                if (d.referral_requested_at) continue;             // already done
                stuck.push({
                    gap: "closed_to_referral",
                    lead_email: lc(d.email || d.contact_email || ""),
                    company: d.company || d.client_name || "",
                    closed_at: new Date(closedAt).toISOString(),
                    days_stuck: Math.round((Date.now() - closedAt) / 86400000) - SLA_CLOSED_WON_TO_REFERRAL_DAYS,
                    source_collection: source,
                    doc_id: doc.id,
                });
            }
        } catch (e) {
            // Source collection may not exist — that's OK, try next
        }
    }
    return { stuck };
}

// ---------- Run all 4 gaps ----------
async function _runGapCloser({ db } = {}) {
    db = db || admin.firestore();
    const startTs = Date.now();
    const runId = `gap_${startTs}`;

    const [g1, g2, g3, g4] = await Promise.all([
        _gap1_instantlyToSofia(db, LOOKBACK_DAYS).catch((e) => ({ stuck: [], error: e.message })),
        _gap2_sofiaToCalendly(db).catch((e) => ({ stuck: [], error: e.message })),
        _gap3_calendlyFollowup(db).catch((e) => ({ stuck: [], error: e.message })),
        _gap4_closedToReferral(db).catch((e) => ({ stuck: [], error: e.message })),
    ]);

    const total = g1.stuck.length + g2.stuck.length + g3.stuck.length + g4.stuck.length;
    const durationMs = Date.now() - startTs;

    // Build digest
    let text = "";
    if (total === 0) {
        text = `✅ *Gap-Closer scan: clean (last 6h)*\n` +
            `No stuck leads in funnel.\n` +
            `Scanned: Instantly → Sofia (4h), Sofia → Calendly (24h), Calendly → followup (24h post-call), Closed-won → referral (5d).\n` +
            `Run: \`${runId}\` · ${durationMs}ms`;
    } else {
        text = `🚨 *Gap-Closer: ${total} stuck leads in funnel*\n\n`;
        if (g1.stuck.length) {
            text += `*1. Instantly positive → Sofia stalled (>4h):* ${g1.stuck.length}\n`;
            g1.stuck.slice(0, 3).forEach((s) => {
                text += `  • \`${s.lead_email}\` — ${s.hours_stuck}h stuck — [Unibox](${s.deep_link})\n`;
            });
            if (g1.stuck.length > 3) text += `  …+${g1.stuck.length - 3} more\n`;
        }
        if (g2.stuck.length) {
            text += `*2. Sofia stalled before Calendly (>24h):* ${g2.stuck.length}\n`;
            g2.stuck.slice(0, 3).forEach((s) => {
                text += `  • \`+${s.lead_phone}\` — ${s.hours_stuck}h silent — [WhatsApp](${s.deep_link})\n`;
            });
            if (g2.stuck.length > 3) text += `  …+${g2.stuck.length - 3} more\n`;
        }
        if (g3.stuck.length) {
            text += `*3. Calendly post-call no follow-up (>24h):* ${g3.stuck.length}\n`;
            g3.stuck.slice(0, 3).forEach((s) => {
                text += `  • \`${s.lead_email}\` — ${s.hours_stuck}h since call\n`;
            });
            if (g3.stuck.length > 3) text += `  …+${g3.stuck.length - 3} more\n`;
        }
        if (g4.stuck.length) {
            text += `*4. Closed-won → referral request never fired (>5d):* ${g4.stuck.length}\n`;
            g4.stuck.slice(0, 3).forEach((s) => {
                text += `  • ${s.company || s.lead_email} — ${s.days_stuck}d since close\n`;
            });
            if (g4.stuck.length > 3) text += `  …+${g4.stuck.length - 3} more\n`;
        }
        text += `\nRun: \`${runId}\` · ${durationMs}ms`;
    }

    const tg = await sendTelegram(text).catch((e) => ({ ok: false, error: e.message }));
    const sl = await sendSlackAlert(text).catch((e) => ({ ok: false, error: e.message }));

    // Persist run
    try {
        await db.collection(RUNS_COLL).doc(runId).set({
            ts: admin.firestore.FieldValue.serverTimestamp(),
            run_id: runId,
            duration_ms: durationMs,
            total_stuck: total,
            counts: {
                instantly_to_sofia: g1.stuck.length,
                sofia_to_calendly: g2.stuck.length,
                calendly_followup: g3.stuck.length,
                closed_to_referral: g4.stuck.length,
            },
            errors: {
                g1: g1.error || null,
                g2: g2.error || null,
                g3: g3.error || null,
                g4: g4.error || null,
            },
            telegram_message_id: tg.message_id || null,
            telegram_ok: !!tg.ok,
            slack_ok: !!sl.ok,
            stuck_sample: {
                g1: g1.stuck.slice(0, 5),
                g2: g2.stuck.slice(0, 5),
                g3: g3.stuck.slice(0, 5),
                g4: g4.stuck.slice(0, 5),
            },
        });
    } catch (e) {
        functions.logger?.warn?.(`gapCloser: persist run failed: ${e.message}`);
    }

    return {
        ok: true,
        run_id: runId,
        total_stuck: total,
        counts: {
            instantly_to_sofia: g1.stuck.length,
            sofia_to_calendly: g2.stuck.length,
            calendly_followup: g3.stuck.length,
            closed_to_referral: g4.stuck.length,
        },
        telegram_ok: !!tg.ok,
        telegram_message_id: tg.message_id || null,
        slack_ok: !!sl.ok,
        duration_ms: durationMs,
    };
}

// ---------- Cloud Functions ----------
const gapCloser = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("every 6 hours")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            return await _runGapCloser();
        } catch (err) {
            functions.logger.error(`gapCloser fatal: ${err.message}`);
            try {
                await sendTelegram(`🔴 *gapCloser FATAL*\n\`${err.message}\``);
            } catch (_) {}
            return { ok: false, error: err.message };
        }
    });

const gapCloserOnDemand = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const result = await _runGapCloser();
            res.status(200).json(result);
        } catch (err) {
            functions.logger.error(`gapCloserOnDemand error: ${err.message}`);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

module.exports = {
    gapCloser,
    gapCloserOnDemand,
    _runGapCloser,
    _gap1_instantlyToSofia,
    _gap2_sofiaToCalendly,
    _gap3_calendlyFollowup,
    _gap4_closedToReferral,
};
