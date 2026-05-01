/**
 * dailyInboxPlacement — autonomous Instantly inbox-placement monitor.
 *
 * Replaces Instantly's $150/mo paid daily test feature with our own free cron
 * that uses Alex's existing $45/mo Inbox Placement subscription
 * (`inbox_placement_test_limit: 10` per account, 90+ available across the pool).
 *
 * Schedule: every day at 05:00 UTC = `0 5 * * *`
 *           = 23:00 Cancún (America/Cancun, UTC-5, no DST) the prior day.
 *           Runs before Alex's 7:00 Cancún `dailyDigest` so any spam-rate
 *           regressions land in the morning brief.
 *
 * Two-phase logic in a single cron run (eliminates the 10-min in-cron wait
 * that would blow Cloud Functions Gen 1's 540s timeout):
 *
 *   Phase A — ANALYZE: read every Firestore `inbox_placement_log` doc with
 *             status=`pending` AND created ≥15 minutes ago. For each, GET
 *             /api/v2/inbox-placement-analytics?test_id=… and compute
 *             inbox_pct = (records where !is_spam) / records total. If
 *             inbox_pct < 80%: post a CRITICAL Slack alert to `alerts`.
 *             Mark the doc as `analyzed` with the score + per-sender
 *             breakdown so we have trend data forever.
 *
 *   Phase B — TEST:    list every campaign with status=1 (live). For each,
 *             POST /api/v2/inbox-placement-tests cloning the existing test
 *             config (or building from scratch). Store the new test_id in
 *             Firestore `inbox_placement_log` with status=`pending`. Tomorrow's
 *             run analyzes them.
 *
 * First run: Phase A is a no-op (no pending docs). From day 2 onwards, every
 * day analyzes the prior day's results then fires fresh tests.
 *
 * HR-1 satisfied: every Instantly call goes through the v2 API with the
 * canonical INSTANTLY_API_KEY. Status code is checked on every response.
 *
 * HR-2 satisfied: zero metrics from memory — every inbox % is computed
 * from a live API response in this run.
 *
 * HR-6 satisfied: every test created is verified (response.id present)
 * before being marked `pending` in Firestore. Every analyzed test logs
 * the raw counts (records_total / records_spam) so the % is auditable.
 *
 * HR-16 satisfied: this function NEVER touches campaign tracking config.
 * It is read/POST against placement-tests only. The hard rule "no link
 * tracking, no open tracking on cold campaigns" stays untouched.
 *
 * Last updated: 2026-05-01 (initial ship — replaces Instantly $150/mo daily test)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const { slackPost } = require("./slackPost");

const INSTANTLY_API = "https://api.instantly.ai/api/v2";

// Slack channel for critical deliverability regressions (mobile push ON).
const SLACK_CHANNEL = "alerts";

// Inbox-pct floor — anything below = wake-Alex-up critical alert.
const INBOX_PCT_FLOOR = 80;

// Minimum age before we analyze a pending test. Instantly seeds typically
// deliver inside 5-8 min; 15 min is the safe lower bound.
const ANALYZE_MIN_AGE_MIN = 15;

// Hard upper bound on Phase A — never re-process a doc older than this
// (in case the analytics endpoint flakes; the doc gets force-closed).
const ANALYZE_MAX_AGE_HR = 48;

// Hard cap on tests created per cron run — protects the $45/mo subscription
// quota. Active-campaign list rarely exceeds 10 anyway (target 4-6).
const MAX_TESTS_PER_RUN = 10;

// Default test recipients — Instantly seed inboxes used by every existing
// inbox-placement-test in the org. Pulled from a verified live test
// (`019dd0aa-6cd9-7c07-b9b1-3aa7bc3b4e03`) on 2026-05-01.
const DEFAULT_SEED_RECIPIENTS = [
    "ethan@govynor.com",
    "avery@gofynor.com",
    "caleb@gotrenx.com",
    "harper@gozynor.com",
    "jacob@goravix.com",
    "logan@goplyra.com",
    "madison@gotynix.com",
    "mason@gonuvix.com",
    "olivia@gorilto.com",
    "sophia@gosoryn.com",
];

// Default labels per region (matches the existing live tests' shape).
const DEFAULT_RECIPIENT_LABELS = [
    { region: "North America", sub_region: "US", type: "Professional", esp: "Google" },
];

// =====================================================================
// Helpers
// =====================================================================

function authHeader() {
    const k = process.env.INSTANTLY_API_KEY;
    if (!k) throw new Error("INSTANTLY_API_KEY missing in env");
    return { Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}

function nowIso() { return new Date().toISOString(); }

/**
 * Flatten an analytics response into per-test inbox stats.
 *
 * Endpoint returns one record per (sender, recipient) pair — each carries
 * is_spam (true=spam folder, false=inbox). Inbox % is the raw count ratio.
 *
 * Per-sender breakdown lets us identify rogue mailboxes (e.g. the
 * 2026-05-01 ryan@zeniaaqua.org 80% spam rate disaster).
 */
function summarizeAnalytics(records) {
    if (!Array.isArray(records) || records.length === 0) {
        return { total: 0, spam: 0, inbox: 0, inbox_pct: null, by_sender: {} };
    }
    const bySender = {};
    let spam = 0;
    for (const r of records) {
        const sender = r.sender_email || "unknown";
        if (!bySender[sender]) bySender[sender] = { total: 0, spam: 0 };
        bySender[sender].total += 1;
        if (r.is_spam) {
            bySender[sender].spam += 1;
            spam += 1;
        }
    }
    const total = records.length;
    const inbox = total - spam;
    const inbox_pct = Math.round((inbox / total) * 100);
    // Add inbox_pct to each sender for easy alert output
    for (const s of Object.keys(bySender)) {
        const t = bySender[s].total;
        bySender[s].inbox = t - bySender[s].spam;
        bySender[s].inbox_pct = t > 0 ? Math.round(((t - bySender[s].spam) / t) * 100) : null;
    }
    return { total, spam, inbox, inbox_pct, by_sender: bySender };
}

// =====================================================================
// Instantly v2 wrappers
// =====================================================================

async function listActiveCampaigns() {
    const out = [];
    let cursor = null;
    // Paginate until we exhaust — `next_starting_after` is Instantly's cursor.
    for (let i = 0; i < 5; i++) {
        const url = new URL(`${INSTANTLY_API}/campaigns`);
        url.searchParams.set("limit", "100");
        if (cursor) url.searchParams.set("starting_after", cursor);
        const r = await axios.get(url.toString(), {
            headers: authHeader(), timeout: 20000, validateStatus: () => true,
        });
        if (r.status !== 200) {
            functions.logger.warn(`listActiveCampaigns page ${i}: HTTP ${r.status}`, r.data);
            break;
        }
        const items = r.data?.items || [];
        for (const c of items) {
            // status:1 = active, status:2 = paused, status:0 = draft
            if (c.status === 1) out.push({ id: c.id, name: c.name });
        }
        cursor = r.data?.next_starting_after || null;
        if (!cursor) break;
    }
    return out;
}

/**
 * Look up the most-recent existing inbox-placement-test for a campaign.
 * If found, we clone its config to keep tests apples-to-apples over time.
 * If none exists, we synthesize a generic one.
 */
async function findLatestTestForCampaign(campaignId) {
    const r = await axios.get(`${INSTANTLY_API}/inbox-placement-tests`, {
        headers: authHeader(), timeout: 20000, validateStatus: () => true,
        params: { limit: 100 },
    });
    if (r.status !== 200) return null;
    const items = r.data?.items || [];
    const matches = items.filter(t => t.campaign_id === campaignId);
    if (!matches.length) return null;
    matches.sort((a, b) => String(b.timestamp_created).localeCompare(String(a.timestamp_created)));
    return matches[0];
}

/**
 * Fire one fresh inbox-placement-test for a campaign. Returns the new test_id.
 *
 * If a prior test exists for this campaign, we copy its subject/body/recipient
 * config so the daily test is comparable across days. Otherwise we synthesize.
 */
async function createTestForCampaign(campaign) {
    const prior = await findLatestTestForCampaign(campaign.id);
    const senderList = prior?.emails || [];
    const subject = prior?.email_subject || `Quick check from ${campaign.name}`;
    const body = prior?.email_body || `This is an automated daily inbox placement test for campaign ${campaign.name}. Please ignore.`;
    const recipients = (prior?.recipients?.length ? prior.recipients : DEFAULT_SEED_RECIPIENTS);
    const recipients_labels = (prior?.recipients_labels?.length ? prior.recipients_labels : DEFAULT_RECIPIENT_LABELS);

    const payload = {
        name: `Daily auto-monitor ${nowIso().slice(0, 10)} — ${campaign.name}`.slice(0, 200),
        type: 1,
        sending_method: 1,
        delivery_mode: 1,
        text_only: prior?.text_only ?? false,
        email_subject: subject,
        email_body: body,
        emails: senderList,             // sender mailboxes — uses campaign's pool
        recipients,
        recipients_labels,
        campaign_id: campaign.id,
        description: `Auto-fired by dailyInboxPlacement Cloud Function (${nowIso()})`,
    };
    const r = await axios.post(`${INSTANTLY_API}/inbox-placement-tests`, payload, {
        headers: authHeader(), timeout: 25000, validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300 && r.data?.id) {
        return { ok: true, test_id: r.data.id, prior_test_id: prior?.id || null };
    }
    return {
        ok: false, error: `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`,
    };
}

/**
 * Pull every analytics record for a given test_id (all-time delivery rows).
 * For our purposes the latest run dominates because we re-create tests daily.
 */
async function fetchAnalytics(testId) {
    const r = await axios.get(`${INSTANTLY_API}/inbox-placement-analytics`, {
        headers: authHeader(), timeout: 30000, validateStatus: () => true,
        params: { test_id: testId, limit: 200 },
    });
    if (r.status !== 200) {
        return { ok: false, error: `HTTP ${r.status}` };
    }
    return { ok: true, items: r.data?.items || [] };
}

// =====================================================================
// Phase A — analyze pending tests created ≥15 min ago
// =====================================================================

async function phaseAnalyze(db) {
    const now = Date.now();
    const minAgeMs = ANALYZE_MIN_AGE_MIN * 60 * 1000;
    const maxAgeMs = ANALYZE_MAX_AGE_HR * 60 * 60 * 1000;

    const snap = await db.collection("inbox_placement_log")
        .where("status", "==", "pending")
        .limit(50)
        .get();

    const results = [];
    for (const doc of snap.docs) {
        const data = doc.data();
        const createdMs = data.created_at?.toMillis?.() ?? Date.parse(data.created_at_iso || "");
        if (!createdMs) continue;
        const ageMs = now - createdMs;
        if (ageMs < minAgeMs) continue; // too fresh — skip till next run
        if (ageMs > maxAgeMs) {
            await doc.ref.update({
                status: "expired", analyzed_at: admin.firestore.FieldValue.serverTimestamp(),
                error: `exceeded ${ANALYZE_MAX_AGE_HR}h analyze window`,
            });
            continue;
        }

        const a = await fetchAnalytics(data.test_id);
        if (!a.ok) {
            functions.logger.warn(`phaseAnalyze: analytics fetch failed for ${data.test_id}`, a.error);
            continue;
        }
        const summary = summarizeAnalytics(a.items);
        if (summary.total === 0) {
            // Test has no records yet — try again next run
            continue;
        }

        await doc.ref.update({
            status: "analyzed",
            analyzed_at: admin.firestore.FieldValue.serverTimestamp(),
            records_total: summary.total,
            records_spam: summary.spam,
            inbox_pct: summary.inbox_pct,
            by_sender: summary.by_sender,
        });
        results.push({
            campaign_id: data.campaign_id,
            campaign_name: data.campaign_name,
            test_id: data.test_id,
            inbox_pct: summary.inbox_pct,
            total: summary.total,
            spam: summary.spam,
            by_sender: summary.by_sender,
        });
    }

    // Build a single Slack alert if any campaign cratered
    const cratered = results.filter(r => r.inbox_pct !== null && r.inbox_pct < INBOX_PCT_FLOOR);
    if (cratered.length) {
        const blocks = [
            {
                type: "header",
                text: { type: "plain_text", text: `🛑 Inbox placement < ${INBOX_PCT_FLOOR}% — ${cratered.length} campaign${cratered.length > 1 ? "s" : ""} cratered`, emoji: true },
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: cratered.map(c => {
                    const senders = Object.entries(c.by_sender || {})
                        .filter(([, v]) => v.inbox_pct !== null && v.inbox_pct < INBOX_PCT_FLOOR)
                        .sort((a, b) => a[1].inbox_pct - b[1].inbox_pct)
                        .slice(0, 5)
                        .map(([email, v]) => `   • \`${email}\` — *${v.inbox_pct}%* (${v.inbox}/${v.total})`)
                        .join("\n") || "   _per-sender breakdown empty_";
                    return `*${c.campaign_name}* — *${c.inbox_pct}% inbox* (${c.spam}/${c.total} spam)\n${senders}`;
                }).join("\n\n") },
            },
            {
                type: "context",
                elements: [
                    { type: "mrkdwn", text: `_Analyzed ${results.length} test${results.length > 1 ? "s" : ""} this run · floor=${INBOX_PCT_FLOOR}% · use \`POST /accounts/{email}/pause\` to kill rogue senders_` },
                ],
            },
        ];
        await slackPost(SLACK_CHANNEL, {
            text: `🛑 Inbox placement alert — ${cratered.length} campaigns < ${INBOX_PCT_FLOOR}%`,
            blocks,
        });
    }

    return { analyzed: results.length, cratered: cratered.length, results };
}

// =====================================================================
// Phase B — fire new tests for every active campaign
// =====================================================================

async function phaseTest(db) {
    const campaigns = await listActiveCampaigns();
    const cap = Math.min(campaigns.length, MAX_TESTS_PER_RUN);
    const fired = [];
    const skipped = [];
    const failed = [];

    // Skip campaigns that already have a pending test from the last 12h
    // (defensive — protects against double-billing if cron runs twice).
    const recentSnap = await db.collection("inbox_placement_log")
        .where("status", "==", "pending")
        .limit(100)
        .get();
    const recentCampaignIds = new Set();
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const d of recentSnap.docs) {
        const v = d.data();
        const ts = v.created_at?.toMillis?.() ?? Date.parse(v.created_at_iso || "");
        if (ts && ts > cutoff && v.campaign_id) recentCampaignIds.add(v.campaign_id);
    }

    for (let i = 0; i < cap; i++) {
        const c = campaigns[i];
        if (recentCampaignIds.has(c.id)) {
            skipped.push({ id: c.id, name: c.name, reason: "pending_test_within_12h" });
            continue;
        }
        const res = await createTestForCampaign(c);
        if (res.ok) {
            await db.collection("inbox_placement_log").add({
                status: "pending",
                campaign_id: c.id,
                campaign_name: c.name,
                test_id: res.test_id,
                prior_test_id: res.prior_test_id,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                created_at_iso: nowIso(),
                source: "dailyInboxPlacement",
            });
            fired.push({ id: c.id, name: c.name, test_id: res.test_id });
        } else {
            failed.push({ id: c.id, name: c.name, error: res.error });
            functions.logger.warn(`createTestForCampaign failed for ${c.name}: ${res.error}`);
        }
    }

    return { campaigns_total: campaigns.length, fired, skipped, failed };
}

// =====================================================================
// Scheduled entry point
// =====================================================================

exports.dailyInboxPlacement = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("0 5 * * *")
    .timeZone("Etc/UTC")
    .onRun(async () => {
        const db = admin.firestore();
        functions.logger.info("dailyInboxPlacement: starting two-phase run");
        const startedAt = Date.now();

        let phaseA, phaseB;
        try {
            phaseA = await phaseAnalyze(db);
        } catch (err) {
            functions.logger.error("phaseAnalyze threw:", err.message);
            phaseA = { error: err.message };
        }
        try {
            phaseB = await phaseTest(db);
        } catch (err) {
            functions.logger.error("phaseTest threw:", err.message);
            phaseB = { error: err.message };
        }

        const elapsedMs = Date.now() - startedAt;
        functions.logger.info(`dailyInboxPlacement: done in ${elapsedMs}ms`, {
            analyzed: phaseA?.analyzed ?? 0,
            cratered: phaseA?.cratered ?? 0,
            fired: phaseB?.fired?.length ?? 0,
            skipped: phaseB?.skipped?.length ?? 0,
            failed: phaseB?.failed?.length ?? 0,
        });

        return null;
    });

// Manual on-demand trigger for testing (HR-6 — verify before mark complete).
// curl -X POST https://us-central1-jegoaiagency-15776.cloudfunctions.net/dailyInboxPlacementOnDemand
exports.dailyInboxPlacementOnDemand = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const db = admin.firestore();
            const phaseA = await phaseAnalyze(db);
            const phaseB = await phaseTest(db);
            res.status(200).json({ ok: true, phaseA, phaseB });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

// Exported for unit tests + introspection
module.exports.summarizeAnalytics = summarizeAnalytics;
module.exports.INBOX_PCT_FLOOR = INBOX_PCT_FLOOR;
module.exports.ANALYZE_MIN_AGE_MIN = ANALYZE_MIN_AGE_MIN;
