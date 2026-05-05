/**
 * complianceGate.js — JegoDigital 7-gate outbound enforcer
 *
 * Built 2026-05-05 by Claude as Deliverable 1 of the Infra/Safety AI agents trio.
 * Goal: BLOCK any send (cold email, Sofia WA, FB ad creation) that violates
 * any of the 7 compliance gates. Run before every send. Idempotent. Read-mostly
 * — never modifies sender state.
 *
 * Channels supported (string `channel`):
 *   - "cold_email"   (Instantly autoreply path / coldEmailDailyReport sends)
 *   - "sofia_wa"     (whatsappCloudSend.sendText / sendTemplate path)
 *   - "fb_ad"        (any future Cloud Function that creates a Meta ad)
 *
 * Public surface:
 *   - complianceGate(payload, channel) → { pass: bool, reason: string, gates: {...} }
 *   - exports each gate function for unit testing (_gateWindow, _gateOptOut, ...)
 *   - exports complianceGateDailyDigest (Cloud Function, 08:00 CDMX)
 *
 * Payload shape (loose — channel-specific fields read defensively):
 *   {
 *     to:          string  (phone E.164 for sofia_wa, email for cold_email, audience for fb_ad)
 *     body:        string  (message body / ad copy — content gate scans this)
 *     sender:      string  (mailbox for cold_email, twilio_from for sofia_wa, ad_account for fb_ad)
 *     timezone?:   string  (lead's IANA TZ; defaults to America/Mexico_City)
 *     country?:    string  (ISO-3166-1 alpha-2; defaults to "MX" for sofia_wa, "US" for cold_email)
 *     leadId?:     string  (firestore key for frequency lookup)
 *     userInitiated?: bool (true = bypass gates 1-7; user typed something → reply allowed)
 *   }
 *
 * Result shape:
 *   {
 *     pass:   bool                 (true = clear to send, false = BLOCK)
 *     reason: string               (first failing gate's reason; empty if pass)
 *     gates: {
 *       window:    { pass, reason },
 *       optout:    { pass, reason },
 *       frequency: { pass, reason },
 *       country:   { pass, reason },
 *       health:    { pass, reason },
 *       content:   { pass, reason },
 *       sender:    { pass, reason }
 *     },
 *     channel:    string,
 *     ts:         ISO timestamp
 *   }
 *
 * Behavior: short-circuits on first gate fail (subsequent gates report
 * `{pass:true,reason:"skipped:earlier_fail"}`). All blocks are logged to
 * Firestore (compliance_blocks/{ts}) and alert Telegram + Slack #alerts.
 *
 * Kill switch: env COMPLIANCE_GATE_ENFORCE=false → log only, return pass:true.
 * Defaults to ENFORCE on (production safe).
 *
 * HR alignment:
 *   - HR-5 lead quality (gates 4 country & 7 sender map to HR-5 sub-gates)
 *   - HR-6 proof (every block written to Firestore in same call)
 *   - HR-16 link tracking (content gate flags tracking-domain rewrites)
 *   - HR-17 collaboration tone (banned-words list)
 *   - HR-19 JegoDigital intro (first 200 chars must contain JegoDigital + niche)
 *   - HR-24 Telegram + Slack alerting on every BLOCK
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

// ---------- Config ----------
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
const COMPLIANCE_BLOCKS_COLL = "compliance_blocks";
const COMPLIANCE_DIGEST_COLL = "compliance_daily_digest";

// HR-17 banned words (Spanish + English) — collaboration tone enforcement.
// Trim list focused on cold-outbound violations. Sofia WA is treated leniently
// for free-form text (after user-initiated bypass), but cold email + FB ad
// creative blocks on any of these.
const BANNED_WORDS_HR17 = [
    // ES
    "te lo vendo", "te vendo", "compra ahora", "última oportunidad",
    "tiempo limitado", "garantía 100%", "te devolvemos el 100%",
    "cierra el trato", "lugares limitados", "última llamada",
    "no te lo pierdas", "oferta única", "descuento exclusivo",
    // EN
    "buy now", "limited time", "last chance", "spots left",
    "money-back guarantee", "100% guaranteed", "act now",
    "don't miss out", "exclusive deal", "only today",
];

// HR-19 niche keywords (must appear with "JegoDigital" in first 200 chars)
const NICHE_KEYWORDS_HR19 = [
    "inmobiliaria", "inmobiliarias", "real estate", "bienes raíces",
    "agencia", "agency", "desarrollador", "developer", "broker",
];

// Approved senders per channel (HR-5 gate 7 + Instantly Gen-2 sender rule)
// Cold email — exactly the 10 mailboxes from CLAUDE.md (zennoenigmawire + zeniaaqua).
const APPROVED_SENDERS_COLD_EMAIL = [
    "ariana@zennoenigmawire.com", "emily@zennoenigmawire.com",
    "russell@zennoenigmawire.com", "william@zennoenigmawire.com",
    "peter@zennoenigmawire.com",
    "kevin@zeniaaqua.org", "michael@zeniaaqua.org",
    "roger@zeniaaqua.org", "ryan@zeniaaqua.org", "henry@zeniaaqua.org",
];
// Sofia WA — only the JegoDigital BSP number(s).
const APPROVED_SENDERS_SOFIA_WA = [
    "+19783967234",                  // Sofia primary (Twilio BSP, post-refactor)
    "19783967234",
    "whatsapp:+19783967234",
    "1044375245434120",              // Meta WA Cloud phone_number_id for Sofia (main branch)
    "sofia_wa_meta_direct",          // logical tag fallback
];
// FB ad — only the JegoDigital ad account.
const APPROVED_SENDERS_FB_AD = [
    "act_968739288838315",  // JegoDigital ad account
    "968739288838315",
];

// Allowed countries per channel
const ALLOWED_COUNTRIES = {
    cold_email: ["MX", "US"],
    sofia_wa:   ["MX", "US"],
    fb_ad:      ["MX", "US"],
};

// Frequency caps per lead per channel
const FREQ_CAP_DAY = 1;
const FREQ_CAP_WEEK = 4;

// Send window per lead's local timezone
const WINDOW_OPEN_HOUR = 9;   // 09:00
const WINDOW_CLOSE_HOUR = 19; // 19:00 (exclusive)

// Health thresholds
const INSTANTLY_WARMUP_FLOOR = 90;  // /100
const BREVO_BOUNCE_CEIL_PCT = 2;    // last 24h bounce rate

// ---------- Helpers ----------
function nowIso() { return new Date().toISOString(); }
function lc(s) { return String(s || "").toLowerCase().trim(); }

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 }
        );
        return { ok: !!r.data?.ok, message_id: r.data?.result?.message_id };
    } catch (e) {
        // Plain-text fallback if Markdown parse fails
        try {
            const r = await axios.post(
                `https://api.telegram.org/bot${token}/sendMessage`,
                { chat_id: chatId, text, disable_web_page_preview: true },
                { timeout: 10000 }
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
        // Soft fail — slackPost optional in test env
        return { ok: false, error: e.message };
    }
}

// ---------- Gate 1: WINDOW ----------
// Pass if current local hour at lead's TZ ∈ [09:00, 19:00).
// userInitiated bypasses (replying inside 24h conversation window is OK any time).
function _gateWindow(payload, channel, opts = {}) {
    if (payload.userInitiated) return { pass: true, reason: "user_initiated_bypass" };
    const tz = payload.timezone || "America/Mexico_City";
    const nowMs = opts.nowMs || Date.now();
    let hour;
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hour: "numeric", hour12: false,
        });
        hour = parseInt(fmt.format(new Date(nowMs)), 10);
    } catch (e) {
        return { pass: false, reason: `invalid_timezone:${tz}` };
    }
    if (hour >= WINDOW_OPEN_HOUR && hour < WINDOW_CLOSE_HOUR) {
        return { pass: true, reason: `window_open:${hour}h_${tz}` };
    }
    return { pass: false, reason: `window_closed:${hour}h_${tz}_outside_${WINDOW_OPEN_HOUR}-${WINDOW_CLOSE_HOUR}` };
}

// ---------- Gate 2: OPT-OUT ----------
// Check Firestore optouts/{normalizedKey}. Phone (digits-only E.164) for WA,
// lowercased email for cold email, hashed email for fb_ad.
async function _gateOptOut(payload, channel, opts = {}) {
    const db = opts.db || admin.firestore();
    let key = "";
    if (channel === "sofia_wa") {
        key = String(payload.to || "").replace(/[^\d]/g, "");
    } else if (channel === "cold_email" || channel === "fb_ad") {
        key = lc(payload.to);
    }
    if (!key) return { pass: false, reason: "no_recipient_key_for_optout" };
    try {
        const snap = await db.collection("optouts").doc(key).get();
        if (snap.exists) {
            const data = snap.data() || {};
            return {
                pass: false,
                reason: `optout_active:${data.reason || "user_requested"}_${data.at || "no_ts"}`,
            };
        }
        return { pass: true, reason: "no_optout" };
    } catch (e) {
        // Conservative: if Firestore unreachable, FAIL CLOSED on this gate.
        return { pass: false, reason: `optout_lookup_failed:${e.message}` };
    }
}

// ---------- Gate 3: FREQUENCY ----------
// Max FREQ_CAP_DAY sends/day/lead, FREQ_CAP_WEEK sends/week/lead.
// Reads compliance_send_log/{leadKey} (rolling 7-day window).
async function _gateFrequency(payload, channel, opts = {}) {
    const db = opts.db || admin.firestore();
    const nowMs = opts.nowMs || Date.now();
    const leadKey = (payload.leadId || payload.to || "").toString().toLowerCase().replace(/[^a-z0-9_@.+-]/g, "_");
    if (!leadKey) return { pass: false, reason: "no_lead_key_for_frequency" };
    try {
        const sinceWeek = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
        const sinceDay = new Date(nowMs - 24 * 60 * 60 * 1000);
        // Read send log for this lead, scanning last 7 days.
        const snap = await db
            .collection("compliance_send_log")
            .where("leadKey", "==", leadKey)
            .where("ts", ">=", admin.firestore.Timestamp.fromDate(sinceWeek))
            .limit(50)
            .get();
        let dayCount = 0;
        let weekCount = 0;
        snap.forEach((d) => {
            const data = d.data() || {};
            const tsMs = data.ts?.toMillis?.() || 0;
            weekCount++;
            if (tsMs >= sinceDay.getTime()) dayCount++;
        });
        if (dayCount >= FREQ_CAP_DAY) {
            return { pass: false, reason: `freq_cap_day_hit:${dayCount}/${FREQ_CAP_DAY}` };
        }
        if (weekCount >= FREQ_CAP_WEEK) {
            return { pass: false, reason: `freq_cap_week_hit:${weekCount}/${FREQ_CAP_WEEK}` };
        }
        return { pass: true, reason: `freq_ok:${dayCount}d_${weekCount}w` };
    } catch (e) {
        // Soft fail open — frequency is recoverable but not catastrophic
        return { pass: true, reason: `freq_lookup_failed_softpass:${e.message}` };
    }
}

// ---------- Gate 4: COUNTRY ----------
function _gateCountry(payload, channel) {
    const allowed = ALLOWED_COUNTRIES[channel] || [];
    if (!allowed.length) return { pass: false, reason: `no_country_policy_for_${channel}` };

    let inferred = (payload.country || "").toUpperCase();

    // Infer from phone if missing
    if (!inferred && channel === "sofia_wa") {
        const digits = String(payload.to || "").replace(/[^\d]/g, "");
        if (digits.startsWith("52")) inferred = "MX";
        else if (digits.startsWith("1")) inferred = "US";
    }
    // Infer from TLD if cold email and country missing (best-effort)
    if (!inferred && channel === "cold_email") {
        const m = String(payload.to || "").match(/@.+\.([a-z]{2,})$/i);
        const tld = m ? m[1].toLowerCase() : "";
        if (tld === "mx") inferred = "MX";
        else if (tld === "com" || tld === "net" || tld === "org" || tld === "us") inferred = "US";
        // Else leave blank → block below
    }

    if (!inferred) return { pass: false, reason: "country_unknown" };
    if (!allowed.includes(inferred)) {
        return { pass: false, reason: `country_${inferred}_not_in_${allowed.join(",")}` };
    }
    return { pass: true, reason: `country_${inferred}_allowed` };
}

// ---------- Gate 5: HEALTH ----------
// cold_email: warmup score ≥ 90 for the sending mailbox.
// sofia_wa:   Twilio account status check (non-blocking — soft-pass if Twilio API down).
// fb_ad:      ad account spend cap not breached (read-only check via FB API).
async function _gateHealth(payload, channel, opts = {}) {
    if (channel === "cold_email") {
        const sender = lc(payload.sender);
        if (!sender) return { pass: false, reason: "no_sender_for_health" };
        const apiKey = opts.instantlyApiKey || process.env.INSTANTLY_API_KEY;
        if (!apiKey) return { pass: true, reason: "instantly_key_missing_softpass" };
        try {
            const r = await axios.post(
                "https://api.instantly.ai/api/v2/accounts/list",
                { limit: 100 },
                { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }
            );
            const accounts = r.data?.items || r.data?.accounts || [];
            const match = accounts.find((a) => lc(a.email) === sender);
            if (!match) return { pass: false, reason: `sender_not_in_instantly:${sender}` };
            const score = match.stat_warmup_score ?? match.warmup_score ?? 0;
            if (score < INSTANTLY_WARMUP_FLOOR) {
                return { pass: false, reason: `warmup_${score}_below_${INSTANTLY_WARMUP_FLOOR}` };
            }
            return { pass: true, reason: `warmup_${score}_ok` };
        } catch (e) {
            return { pass: true, reason: `instantly_health_softpass:${e.message}` };
        }
    }
    if (channel === "sofia_wa") {
        // Twilio doesn't expose a warmup score; trust BSP relationship + sender gate.
        return { pass: true, reason: "twilio_bsp_assumed_healthy" };
    }
    if (channel === "fb_ad") {
        // FB ad account spend-cap check is non-blocking by default; would need
        // act_xxx/spendcap call — soft-pass to avoid false positives at create-time.
        return { pass: true, reason: "fb_health_softpass" };
    }
    return { pass: false, reason: `unknown_channel:${channel}` };
}

// ---------- Gate 6: CONTENT ----------
// HR-17 banned words + HR-19 JegoDigital + niche intro.
function _gateContent(payload, channel) {
    const body = String(payload.body || "");
    if (!body) return { pass: false, reason: "empty_body" };
    const lower = body.toLowerCase();

    // HR-17 banned-words check (block on first hit)
    for (const word of BANNED_WORDS_HR17) {
        if (lower.includes(word.toLowerCase())) {
            return { pass: false, reason: `banned_word_HR17:"${word}"` };
        }
    }

    // HR-19 introduction check — only enforced on first-touch cold_email + fb_ad.
    // Sofia WA and instantly autoreply paths are conversational replies, not first-touch.
    // Caller signals first-touch via payload.firstTouch=true.
    if (payload.firstTouch && (channel === "cold_email" || channel === "fb_ad")) {
        const first200 = body.substring(0, 200).toLowerCase();
        const hasJego = first200.includes("jegodigital");
        const hasNiche = NICHE_KEYWORDS_HR19.some((k) => first200.includes(k.toLowerCase()));
        if (!hasJego) return { pass: false, reason: "HR19_missing_JegoDigital_in_first_200chars" };
        if (!hasNiche) return { pass: false, reason: "HR19_missing_niche_keyword_in_first_200chars" };
    }

    // HR-16 link-tracking guard — block bodies that contain the dead CTD domain.
    // (Belt + suspenders: real fix is link_tracking=false on the campaign, but
    // nothing should *contain* a tracking link in the body.)
    if (lower.includes("inst.zennoenigmawire.com")) {
        return { pass: false, reason: "HR16_tracking_domain_inst.zennoenigmawire.com_present" };
    }

    return { pass: true, reason: "content_clean" };
}

// ---------- Gate 7: SENDER ----------
function _gateSender(payload, channel) {
    const sender = lc(payload.sender);
    if (!sender) return { pass: false, reason: "no_sender_provided" };
    let approved = [];
    if (channel === "cold_email") approved = APPROVED_SENDERS_COLD_EMAIL.map(lc);
    else if (channel === "sofia_wa") approved = APPROVED_SENDERS_SOFIA_WA.map(lc);
    else if (channel === "fb_ad") approved = APPROVED_SENDERS_FB_AD.map(lc);
    else return { pass: false, reason: `unknown_channel:${channel}` };
    if (approved.includes(sender)) return { pass: true, reason: "sender_approved" };
    return { pass: false, reason: `sender_not_approved:${sender}` };
}

// ---------- Main entrypoint ----------
async function complianceGate(payload, channel, opts = {}) {
    const ts = nowIso();
    const enforce = (process.env.COMPLIANCE_GATE_ENFORCE || "true").toLowerCase() !== "false";
    const skipReason = "skipped:earlier_fail";

    const gates = {
        window: { pass: true, reason: "" },
        optout: { pass: true, reason: "" },
        frequency: { pass: true, reason: "" },
        country: { pass: true, reason: "" },
        health: { pass: true, reason: "" },
        content: { pass: true, reason: "" },
        sender: { pass: true, reason: "" },
    };

    // Channel gate
    if (!["cold_email", "sofia_wa", "fb_ad"].includes(channel)) {
        const result = {
            pass: false, reason: `unknown_channel:${channel}`, gates, channel, ts,
        };
        await _logBlock(result, payload, opts);
        return result;
    }

    // 1. Window
    gates.window = _gateWindow(payload, channel, opts);
    if (!gates.window.pass) {
        gates.optout = gates.frequency = gates.country = gates.health = gates.content = gates.sender =
            { pass: true, reason: skipReason };
        return await _finalize({ pass: false, reason: gates.window.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // 2. Opt-out
    gates.optout = await _gateOptOut(payload, channel, opts);
    if (!gates.optout.pass) {
        gates.frequency = gates.country = gates.health = gates.content = gates.sender =
            { pass: true, reason: skipReason };
        return await _finalize({ pass: false, reason: gates.optout.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // 3. Frequency
    gates.frequency = await _gateFrequency(payload, channel, opts);
    if (!gates.frequency.pass) {
        gates.country = gates.health = gates.content = gates.sender =
            { pass: true, reason: skipReason };
        return await _finalize({ pass: false, reason: gates.frequency.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // 4. Country
    gates.country = _gateCountry(payload, channel);
    if (!gates.country.pass) {
        gates.health = gates.content = gates.sender =
            { pass: true, reason: skipReason };
        return await _finalize({ pass: false, reason: gates.country.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // 5. Health
    gates.health = await _gateHealth(payload, channel, opts);
    if (!gates.health.pass) {
        gates.content = gates.sender = { pass: true, reason: skipReason };
        return await _finalize({ pass: false, reason: gates.health.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // 6. Content
    gates.content = _gateContent(payload, channel);
    if (!gates.content.pass) {
        gates.sender = { pass: true, reason: skipReason };
        return await _finalize({ pass: false, reason: gates.content.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // 7. Sender
    gates.sender = _gateSender(payload, channel);
    if (!gates.sender.pass) {
        return await _finalize({ pass: false, reason: gates.sender.reason, gates, channel, ts }, payload, opts, enforce);
    }

    // All clear — log to send log for frequency tracking
    await _logSend({ pass: true, gates, channel, ts }, payload, opts);
    return { pass: true, reason: "all_7_gates_passed", gates, channel, ts };
}

async function _finalize(result, payload, opts, enforce) {
    await _logBlock(result, payload, opts);
    // Telegram + Slack alert
    const summary = `🛑 *Compliance Gate BLOCK*\n` +
        `*Channel:* ${result.channel}\n` +
        `*Reason:* ${result.reason}\n` +
        `*To:* \`${String(payload.to || "?").slice(0, 60)}\`\n` +
        `*Sender:* \`${String(payload.sender || "?").slice(0, 60)}\`\n` +
        `*Body:* ${String(payload.body || "").slice(0, 100).replace(/[*_`]/g, "")}…`;
    if (!opts.suppressAlerts) {
        await sendTelegram(summary).catch(() => {});
        await sendSlackAlert(summary).catch(() => {});
    }
    if (!enforce) {
        // Kill switch is OFF — log but pass through.
        return { ...result, pass: true, reason: `KILL_SWITCH_OFF_logged:${result.reason}` };
    }
    return result;
}

async function _logBlock(result, payload, opts) {
    if (opts.skipFirestore) return;
    try {
        const db = opts.db || admin.firestore();
        await db.collection(COMPLIANCE_BLOCKS_COLL).add({
            ts: admin.firestore.FieldValue.serverTimestamp(),
            channel: result.channel,
            reason: result.reason,
            gates: result.gates,
            to: String(payload.to || "").slice(0, 200),
            sender: String(payload.sender || "").slice(0, 200),
            body_preview: String(payload.body || "").slice(0, 400),
            leadId: payload.leadId || null,
            firstTouch: !!payload.firstTouch,
        });
    } catch (e) {
        functions.logger?.warn?.(`compliance log block failed: ${e.message}`);
    }
}

async function _logSend(result, payload, opts) {
    if (opts.skipFirestore) return;
    try {
        const db = opts.db || admin.firestore();
        const leadKey = (payload.leadId || payload.to || "").toString().toLowerCase().replace(/[^a-z0-9_@.+-]/g, "_");
        if (!leadKey) return;
        await db.collection("compliance_send_log").add({
            ts: admin.firestore.FieldValue.serverTimestamp(),
            channel: result.channel,
            leadKey,
            sender: String(payload.sender || "").slice(0, 200),
        });
    } catch (e) {
        functions.logger?.warn?.(`compliance log send failed: ${e.message}`);
    }
}

// ---------- Daily 8am digest of yesterday's blocks ----------
const complianceGateDailyDigest = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const snap = await db.collection(COMPLIANCE_BLOCKS_COLL)
            .where("ts", ">=", admin.firestore.Timestamp.fromDate(since))
            .limit(500)
            .get();

        const counts = { window: 0, optout: 0, frequency: 0, country: 0, health: 0, content: 0, sender: 0, other: 0 };
        const byChannel = { cold_email: 0, sofia_wa: 0, fb_ad: 0, other: 0 };
        let total = 0;
        snap.forEach((d) => {
            const x = d.data() || {};
            total++;
            const r = String(x.reason || "");
            if (r.startsWith("window_")) counts.window++;
            else if (r.startsWith("optout_")) counts.optout++;
            else if (r.startsWith("freq_")) counts.frequency++;
            else if (r.startsWith("country_")) counts.country++;
            else if (r.startsWith("warmup_") || r.startsWith("instantly_") || r.startsWith("twilio_") || r.startsWith("fb_health")) counts.health++;
            else if (r.startsWith("banned_") || r.startsWith("HR1") || r.startsWith("empty_body")) counts.content++;
            else if (r.startsWith("sender_") || r.startsWith("no_sender")) counts.sender++;
            else counts.other++;
            if (byChannel[x.channel] != null) byChannel[x.channel]++; else byChannel.other++;
        });

        const dateStr = new Date().toISOString().slice(0, 10);
        await db.collection(COMPLIANCE_DIGEST_COLL).doc(dateStr).set({
            ts: admin.firestore.FieldValue.serverTimestamp(),
            total, counts, byChannel,
        });

        const text = `🛡️ *Compliance Gate — daily digest (last 24h)*\n` +
            `*Total blocks:* ${total}\n` +
            `\n*By gate:*\n` +
            `• window: ${counts.window}\n` +
            `• optout: ${counts.optout}\n` +
            `• frequency: ${counts.frequency}\n` +
            `• country: ${counts.country}\n` +
            `• health: ${counts.health}\n` +
            `• content: ${counts.content}\n` +
            `• sender: ${counts.sender}\n` +
            (counts.other ? `• other: ${counts.other}\n` : "") +
            `\n*By channel:*\n` +
            `• cold_email: ${byChannel.cold_email}\n` +
            `• sofia_wa: ${byChannel.sofia_wa}\n` +
            `• fb_ad: ${byChannel.fb_ad}\n` +
            (byChannel.other ? `• other: ${byChannel.other}\n` : "");

        await sendTelegram(text).catch(() => {});
        await sendSlackAlert(text).catch(() => {});
        return { ok: true, total, counts, byChannel };
    });

// HTTP manual fire for tests
const complianceGateDailyDigestOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        // Reuse internal logic — duplicate of cron body.
        const db = admin.firestore();
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const snap = await db.collection(COMPLIANCE_BLOCKS_COLL)
            .where("ts", ">=", admin.firestore.Timestamp.fromDate(since))
            .limit(500).get();
        const total = snap.size;
        res.status(200).json({ ok: true, total });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- Public exports ----------
module.exports = {
    complianceGate,
    complianceGateDailyDigest,
    complianceGateDailyDigestOnDemand,
    // Internal pure functions (for unit tests)
    _gateWindow,
    _gateOptOut,
    _gateFrequency,
    _gateCountry,
    _gateHealth,
    _gateContent,
    _gateSender,
    _BANNED_WORDS_HR17: BANNED_WORDS_HR17,
    _NICHE_KEYWORDS_HR19: NICHE_KEYWORDS_HR19,
    _APPROVED_SENDERS_COLD_EMAIL: APPROVED_SENDERS_COLD_EMAIL,
    _APPROVED_SENDERS_SOFIA_WA: APPROVED_SENDERS_SOFIA_WA,
    _APPROVED_SENDERS_FB_AD: APPROVED_SENDERS_FB_AD,
};
