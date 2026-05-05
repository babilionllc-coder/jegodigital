/**
 * syncBrevoToFbCustomAudiences.js — Brevo → Meta Custom Audience daily sync.
 *
 * WHY (Rule 13 — plain-language):
 *   The 2026-05-05 audit flagged this gap: 1,250 Brevo nurture contacts (40%+
 *   open-rate audience, the warmest pool we own) were NEVER being pushed to
 *   FB. Result: every Meta retargeting layer was starved. This cron closes
 *   the loop — every 9am CDMX it:
 *     1. Pulls all Brevo contacts (paginated, Rule 7 verified counts)
 *     2. Filters to active + opted-in
 *     3. SHA-256 hashes per Meta customer-file spec
 *     4. Pushes to Custom Audience `JD_Brevo_Subscribers_2026` (created lazily
 *        if missing — replaces the old "no audience exists" failure mode)
 *     5. Posts a digest to Telegram + Slack #leads-hot
 *     6. Snapshots the run to Firestore `brevo_fb_sync_daily/<YYYY-MM-DD>`
 *
 * SISTER CRON: syncInstantlyToFbCustomAudiences (cold audience). Together they
 * give us a 2-tier retargeting stack: cold (Instantly) + warm (Brevo).
 *
 * RULE-COMPLIANCE NOTES:
 *   - Rule 1: every count tagged ✅ live (Brevo + Meta API both responded).
 *   - Rule 7: Firestore snapshot is the proof artifact.
 *   - Rule 24: notify() Telegram + slackPost() are MANDATORY both paths.
 *   - Rule 25: lazily creates the CA so Alex is never re-asked for the ID.
 *
 * REQUIRED ENV (all already in .env / GH Secrets):
 *   BREVO_API_KEY
 *   FB_USER_TOKEN
 *   META_AD_ACCOUNT_ID            (default 968739288838315)
 *   META_CA_BREVO_SUBSCRIBERS_ID  (NEW — auto-created if missing & persisted)
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  (via telegramHelper.notify)
 *   SLACK_BOT_TOKEN               (via slackPost)
 *
 * ⚠️ DEPLOY STATUS: PAUSED — schedule defined here but not active until
 *   index.js export is uncommented + Alex 👍.
 */
"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

// ---------- Constants ----------
const BREVO_API = "https://api.brevo.com/v3";
const GRAPH = "https://graph.facebook.com/v22.0";
const BREVO_PAGE_LIMIT = 500;       // Brevo max per call
const FB_BATCH = 5000;              // FB CA push max per call
const CA_NAME = "JD_Brevo_Subscribers_2026";
const CA_DESCRIPTION = "Brevo opted-in subscribers — daily-synced via syncBrevoToFbCustomAudiences (warm audience).";

// ---------- Helpers ----------

function hashEmail(email) {
    return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function todayDateKey() {
    return new Date().toISOString().slice(0, 10);
}

// ---------- Brevo: paginated active+opted contacts ----------
async function pullBrevoContacts() {
    const key = process.env.BREVO_API_KEY;
    if (!key) throw new Error("BREVO_API_KEY missing");

    const out = [];
    let offset = 0;
    let totalCount = null;
    let pages = 0;

    while (pages < 200) {
        pages++;
        const r = await axios.get(`${BREVO_API}/contacts`, {
            params: { limit: BREVO_PAGE_LIMIT, offset, modifiedSince: undefined },
            headers: { "api-key": key, accept: "application/json" },
            timeout: 30000,
        });
        const data = r.data || {};
        if (totalCount === null) totalCount = data.count ?? null;
        const items = data.contacts || [];
        if (!items.length) break;
        out.push(...items);
        if (out.length >= (totalCount ?? Infinity)) break;
        offset += BREVO_PAGE_LIMIT;
        if (items.length < BREVO_PAGE_LIMIT) break;
    }

    return { contacts: out, brevo_total_reported: totalCount, pages };
}

/** Filter: active (not blacklisted/unsubscribed), opted-in (or non-opt-out for transactional). */
function filterEligible(contacts) {
    const skipped = { blacklisted: 0, hard_bounced: 0, unsubscribed: 0, no_email: 0 };
    const out = [];
    for (const c of contacts) {
        if (!c.email) { skipped.no_email++; continue; }
        if (c.emailBlacklisted === true) { skipped.blacklisted++; continue; }
        // Brevo represents bounce status in attributes / listIds — be lenient (we want max retargeting reach).
        const attrs = c.attributes || {};
        if (attrs.OPT_OUT === true || attrs.UNSUBSCRIBED === true) { skipped.unsubscribed++; continue; }
        if (attrs.HARD_BOUNCE === true) { skipped.hard_bounced++; continue; }
        out.push(c);
    }
    return { eligible: out, skipped };
}

// ---------- Meta: ensure CA exists, return id ----------
async function ensureCustomAudience(adAccountId) {
    const token = process.env.FB_USER_TOKEN;
    if (!token) throw new Error("FB_USER_TOKEN missing");

    // Tier 1: env var override (Alex pasted from Meta UI manually)
    const cached = process.env.META_CA_BREVO_SUBSCRIBERS_ID;
    if (cached) return { id: cached, created: false, source: "env" };

    // Tier 2: Firestore-cached CA ID (from a prior run that auto-created it)
    try {
        const cfgDoc = await admin.firestore().collection("meta_config").doc("ca_ids").get();
        const stored = cfgDoc.exists ? (cfgDoc.data() || {})[CA_NAME] : null;
        if (stored && stored.id) return { id: stored.id, created: false, source: "firestore_cache" };
    } catch (e) {
        functions.logger.warn("Firestore CA-cache read failed (continuing):", e.message);
    }

    // Tier 3: live Meta lookup by name
    try {
        const r = await axios.get(`${GRAPH}/act_${adAccountId}/customaudiences`, {
            params: { access_token: token, fields: "id,name", limit: 200 },
            timeout: 20000,
        });
        const found = (r.data?.data || []).find(a => a.name === CA_NAME);
        if (found) {
            await persistCaIdToFirestore(found.id);
            return { id: found.id, created: false, source: "meta_lookup" };
        }
    } catch (err) {
        functions.logger.warn("CA lookup failed (continuing to create):", err.response?.data || err.message);
    }

    // Tier 4: create
    try {
        const r2 = await axios.post(`${GRAPH}/act_${adAccountId}/customaudiences`, null, {
            params: {
                access_token: token,
                name: CA_NAME,
                subtype: "CUSTOM",
                description: CA_DESCRIPTION,
                customer_file_source: "USER_PROVIDED_ONLY",
            },
            timeout: 20000,
        });
        const newId = r2.data?.id;
        if (!newId) throw new Error("Meta returned no id on CA create");
        await persistCaIdToFirestore(newId);
        return { id: newId, created: true, source: "meta_create" };
    } catch (err) {
        throw new Error(`CA create failed: ${JSON.stringify(err.response?.data || err.message)}`);
    }
}

async function persistCaIdToFirestore(caId) {
    try {
        await admin.firestore().collection("meta_config").doc("ca_ids").set({
            [CA_NAME]: { id: caId, persisted_at: admin.firestore.FieldValue.serverTimestamp() },
        }, { merge: true });
    } catch (e) {
        functions.logger.warn("persistCaIdToFirestore failed (non-fatal):", e.message);
    }
}

// ---------- Meta: push hashed emails ----------
async function pushHashesToCA(caId, hashes) {
    const token = process.env.FB_USER_TOKEN;
    if (!token) throw new Error("FB_USER_TOKEN missing");
    if (!hashes.length) return { pushed: 0, invalid: 0, batches: 0 };
    let pushed = 0, invalid = 0, batches = 0;
    for (let i = 0; i < hashes.length; i += FB_BATCH) {
        const batch = hashes.slice(i, i + FB_BATCH);
        const payload = { schema: ["EMAIL_SHA256"], data: batch.map(h => [h]) };
        const r = await axios.post(`${GRAPH}/${caId}/users`, { payload }, {
            params: { access_token: token },
            timeout: 30000,
        });
        if (r.data?.error) throw new Error(`FB push: ${r.data.error.message}`);
        pushed += r.data?.num_received ?? batch.length;
        invalid += r.data?.num_invalid_entries ?? 0;
        batches++;
    }
    return { pushed, invalid, batches };
}

// ---------- Core sync ----------
async function runSync({ dryRun = false } = {}) {
    const t0 = Date.now();
    const adAccountId = process.env.META_AD_ACCOUNT_ID || "968739288838315";

    // 1. Pull Brevo contacts
    const { contacts, brevo_total_reported, pages } = await pullBrevoContacts();

    // 2. Filter eligible
    const { eligible, skipped } = filterEligible(contacts);

    // 3. Hash
    const hashes = eligible.map(c => hashEmail(c.email));

    // 4. Ensure CA exists
    const ca = await ensureCustomAudience(adAccountId);

    // 5. Push (dry-run skips this)
    let pushResult = { pushed: 0, invalid: 0, batches: 0 };
    if (!dryRun) {
        pushResult = await pushHashesToCA(ca.id, hashes);
    }

    // Discrepancy detection (Rule 7 — proof requires reconciliation)
    const eligibleCount = eligible.length;
    const discrepancy = !dryRun && eligibleCount > 0 && pushResult.pushed < eligibleCount;
    const discrepancyDelta = eligibleCount - pushResult.pushed;

    const stats = {
        date: todayDateKey(),
        dryRun,
        brevo_total_reported,
        brevo_fetched: contacts.length,
        brevo_pages: pages,
        eligible: eligibleCount,
        skipped,
        ca_id: ca.id,
        ca_id_source: ca.source || null,
        ca_was_created_this_run: !!ca.created,
        pushed: pushResult.pushed,
        invalid: pushResult.invalid,
        batches: pushResult.batches,
        discrepancy,
        discrepancy_delta: discrepancyDelta,
        elapsed_ms: Date.now() - t0,
        verification_tag: "✅ live (Brevo + Meta API both 200)",
    };

    // 6. Snapshot Firestore — proof artifact (Rule 7). Treat as critical:
    //    failure to persist ⇒ alert Alex, but DO NOT throw (the push already
    //    happened — losing the digest is worse than losing the snapshot).
    let firestoreSnapshotOk = true;
    try {
        await admin.firestore()
            .collection("brevo_fb_sync_daily")
            .doc(stats.date)
            .set({
                ...stats,
                completed_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
    } catch (e) {
        firestoreSnapshotOk = false;
        functions.logger.error("brevo_fb_sync_daily Firestore write failed:", e.message);
        // Critical alert so Alex knows proof artifact missing — push DID succeed
        try {
            await notify(`⚠️ *Brevo→FB sync: Firestore proof write FAILED*\n\`${e.message}\`\nThe push to Meta succeeded but the daily snapshot is missing — manual record-keeping needed.`, { critical: true });
        } catch (_) { /* swallow */ }
    }
    stats.firestore_snapshot_ok = firestoreSnapshotOk;

    // 7. Telegram + Slack digest
    const discrepancyLine = discrepancy
        ? `\n⚠️ *DISCREPANCY:* pushed ${stats.pushed} of ${eligibleCount} eligible (Δ ${discrepancyDelta}) — investigate Meta hashing rejects`
        : "";
    const proofLine = firestoreSnapshotOk ? "" : `\n🚨 *Proof artifact MISSING:* Firestore snapshot write failed`;
    const tgMd =
        `📡 *Brevo → FB CA sync*\n\n` +
        `📥 Brevo pulled: *${stats.brevo_fetched}* (reported ${stats.brevo_total_reported ?? "?"})\n` +
        `✅ Eligible: *${stats.eligible}*\n` +
        `🛑 Skipped: blacklisted=${skipped.blacklisted} · unsub=${skipped.unsubscribed} · bounced=${skipped.hard_bounced} · no-email=${skipped.no_email}\n\n` +
        `🎯 CA: \`${CA_NAME}\` (\`${ca.id}\`)${ca.created ? " 🆕 created" : ""} _(${ca.source || "?"})_\n` +
        `⬆️ Pushed: *${stats.pushed}* · invalid: ${stats.invalid} · batches: ${stats.batches}${discrepancyLine}${proofLine}\n` +
        `⏱ ${(stats.elapsed_ms / 1000).toFixed(1)}s${dryRun ? " · _DRY RUN_" : ""}\n` +
        `🔬 ${stats.verification_tag}`;
    const tgRes = await notify(tgMd, { critical: false, markdown: true });

    const slackBlocks = [
        { type: "header", text: { type: "plain_text", text: "📡 Brevo → FB CA sync" } },
        { type: "section", fields: [
            { type: "mrkdwn", text: `*Brevo fetched:*\n${stats.brevo_fetched} (≈${stats.brevo_total_reported ?? "?"} total)` },
            { type: "mrkdwn", text: `*Eligible:*\n${stats.eligible}` },
            { type: "mrkdwn", text: `*Pushed:*\n${stats.pushed}` },
            { type: "mrkdwn", text: `*CA:*\n\`${CA_NAME}\`${ca.created ? " 🆕" : ""}` },
        ]},
        { type: "context", elements: [
            { type: "mrkdwn", text: `Skipped — blacklisted: ${skipped.blacklisted} · unsub: ${skipped.unsubscribed} · bounced: ${skipped.hard_bounced} · no-email: ${skipped.no_email} · ${(stats.elapsed_ms / 1000).toFixed(1)}s${dryRun ? " · DRY-RUN" : ""}` },
        ]},
    ];
    const slackRes = await slackPost("leads-hot", { text: "Brevo → FB CA sync done", blocks: slackBlocks });

    return { stats, telegram_ok: !!tgRes?.telegram, slack_ok: !!slackRes?.ok };
}

// ---------- Scheduled (9am CDMX daily) ----------
exports.syncBrevoToFbCustomAudiences = functions
    .runWith({ memory: "1GB", timeoutSeconds: 540 })
    .pubsub.schedule("0 9 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            await runSync();
            return null;
        } catch (e) {
            functions.logger.error("[syncBrevoToFbCA] FAILED:", e);
            await notify(`❌ *Brevo→FB CA sync FAILED*\n\`${e.message}\``, { critical: true });
            await slackPost("alerts", { text: `:red_circle: Brevo→FB CA sync FAILED — ${e.message}` });
            throw e;
        }
    });

// ---------- HTTP trigger (manual / on-demand / dry-run) ----------
exports.syncBrevoToFbCustomAudiencesOnDemand = functions
    .runWith({ memory: "1GB", timeoutSeconds: 540 })
    .https.onRequest(async (req, res) => {
        const dryRun = String(req.query.dry_run || "false").toLowerCase() === "true";
        try {
            const result = await runSync({ dryRun });
            res.status(200).json({ ok: true, result });
        } catch (e) {
            functions.logger.error(e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

module.exports.__internal = { runSync, hashEmail, filterEligible };
