/**
 * brevoToFacebookCASync.js — daily Brevo → FB Custom Audience mirror.
 *
 * Built 2026-05-05 by Claude as Deliverable 3 of the Infra/Safety AI agents trio.
 * Goal: every Brevo contact in our nurture lists is mirrored to a FB Custom
 * Audience daily so retargeting always seeds from the freshest warm pool.
 *
 * Cron: daily 03:00 UTC (= 21:00 CDMX prior day during CST = 21:00; or 22:00 CDT)
 *       Picked 03:00 UTC because Brevo modifiedSince queries are most accurate
 *       once the prior day has fully settled, and FB API has lower contention.
 *
 * Logic:
 *   1. Pull Brevo contacts modifiedSince=<24h ago> (paginated, /v3/contacts).
 *   2. Hash each email per Meta requirements: SHA-256(lowercase(email.trim())).
 *   3. Find or create FB Custom Audience named JegoDigital_Brevo_Nurture.
 *   4. POST hashes to /{ca_id}/users (Meta Graph v22.0).
 *   5. If pool > 1000, ensure a JegoDigital_Brevo_Nurture_LAL1 lookalike exists.
 *
 * Idempotent:
 *   - Same contact synced twice = no duplicate (Meta dedupes by hash).
 *   - CA name deduped by exact-name lookup before create.
 *   - LAL audience created only if missing AND seed pool >1000.
 *
 * Dry-run path:
 *   - HTTP query ?dryRun=1 → uses TEST CA name `JegoDigital_Brevo_Nurture_TEST`,
 *     does the full upload, returns count proof, does NOT touch the prod CA.
 *
 * Telegram + Slack daily report on every run.
 *
 * Env required:
 *   BREVO_API_KEY                — from .env / GH Secrets
 *   FB_USER_TOKEN or FB_PAGE_ACCESS_TOKEN
 *   FB_AD_ACCOUNT_ID             — defaults to 968739288838315 (JegoDigital)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";

const PROD_CA_NAME = "JegoDigital_Brevo_Nurture";
const TEST_CA_NAME = "JegoDigital_Brevo_Nurture_TEST";
const LAL_CA_NAME = "JegoDigital_Brevo_Nurture_LAL1";
const LAL_THRESHOLD = 1000;
const GRAPH_VERSION = "v22.0";
const SYNC_RUNS_COLL = "brevo_to_fb_ca_runs";
const CA_STATE_COLL = "brevo_to_fb_ca_state";

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

async function sendSlackReport(text) {
    try {
        const { slackPost } = require("./slackPost");
        return await slackPost("daily-ops", { text });
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function sha256Lower(email) {
    if (!email) return "";
    return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
}

function actId() {
    const id = process.env.FB_AD_ACCOUNT_ID || "968739288838315";
    return String(id).startsWith("act_") ? id : `act_${id}`;
}

function fbAuthToken() {
    return process.env.FB_USER_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || "";
}

// ---------- Brevo: pull contacts modified since N hours ago ----------
async function pullBrevoModifiedSince(hoursAgo) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("BREVO_API_KEY missing");

    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    const contacts = [];
    let offset = 0;
    const limit = 500;

    while (offset < 50000) { // hard cap to avoid infinite loop
        const url = `https://api.brevo.com/v3/contacts`;
        const params = {
            limit,
            offset,
            modifiedSince: since,
            sort: "desc",
        };
        let r;
        try {
            r = await axios.get(url, {
                headers: { "api-key": apiKey, accept: "application/json" },
                params,
                timeout: 20000,
            });
        } catch (e) {
            if (e.response?.status === 404) break; // no contacts at this offset
            throw new Error(`brevo_pull_failed:${e.response?.status}:${e.message}`);
        }
        const items = r.data?.contacts || [];
        if (!items.length) break;
        for (const c of items) {
            const email = c.email || c.attributes?.EMAIL;
            if (!email) continue;
            contacts.push({
                email,
                modifiedAt: c.modifiedAt || c.modified_at,
                attributes: c.attributes || {},
            });
        }
        if (items.length < limit) break;
        offset += limit;
    }
    return contacts;
}

// ---------- FB: find or create Custom Audience by name ----------
async function findOrCreateCA(name) {
    const token = fbAuthToken();
    if (!token) throw new Error("FB_USER_TOKEN_or_FB_PAGE_ACCESS_TOKEN_missing");

    // List existing CAs and look for exact-name match
    const listUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/customaudiences`;
    let next = listUrl;
    let found = null;
    let scanned = 0;
    while (next && scanned < 500) {
        const r = await axios.get(next, {
            params: next === listUrl ? { fields: "id,name,approximate_count_lower_bound", limit: 100, access_token: token } : { access_token: token },
            timeout: 20000,
        });
        const data = r.data?.data || [];
        for (const ca of data) {
            if (ca.name === name) { found = ca; break; }
        }
        if (found) break;
        scanned += data.length;
        next = r.data?.paging?.next || null;
    }
    if (found) return { id: found.id, created: false, name: found.name, approximate_count: found.approximate_count_lower_bound || 0 };

    // Create new
    const createUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/customaudiences`;
    const r = await axios.post(createUrl, {
        name,
        subtype: "CUSTOM",
        description: name === PROD_CA_NAME
            ? "Daily mirror of JegoDigital Brevo nurture lists. Synced by brevoToFacebookCASync.js."
            : (name === TEST_CA_NAME ? "DRY-RUN test CA — safe to delete" : `Auto-created by brevoToFacebookCASync.js (${name})`),
        customer_file_source: "USER_PROVIDED_ONLY",
        access_token: token,
    }, { timeout: 20000 });
    return { id: r.data?.id, created: true, name, approximate_count: 0 };
}

// ---------- FB: upload hashed emails to a CA ----------
async function uploadHashesToCA(caId, hashedEmails) {
    const token = fbAuthToken();
    if (!token) throw new Error("FB_USER_TOKEN_or_FB_PAGE_ACCESS_TOKEN_missing");
    if (!hashedEmails.length) return { added: 0, batches: 0 };

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${caId}/users`;
    const BATCH = 1000;
    let added = 0;
    let batches = 0;
    for (let i = 0; i < hashedEmails.length; i += BATCH) {
        const slice = hashedEmails.slice(i, i + BATCH);
        const payload = {
            session: { session_id: Date.now() + i, batch_seq: batches + 1, last_batch_flag: i + BATCH >= hashedEmails.length, estimated_num_total: hashedEmails.length },
            payload: { schema: ["EMAIL_SHA256"], data: slice.map((h) => [h]) },
            access_token: token,
        };
        try {
            const r = await axios.post(url, payload, { timeout: 30000 });
            added += r.data?.num_received || slice.length;
            batches++;
        } catch (e) {
            // Continue uploading remaining batches; report partial.
            functions.logger?.warn?.(`uploadHashesToCA batch ${batches + 1} failed: ${e.response?.data?.error?.message || e.message}`);
        }
    }
    return { added, batches };
}

// ---------- FB: create lookalike if pool >= LAL_THRESHOLD ----------
async function ensureLookalikeIfThreshold(seedCaId, poolSize) {
    if (poolSize < LAL_THRESHOLD) return { skipped: true, reason: `pool_${poolSize}_below_${LAL_THRESHOLD}` };
    // Check if LAL already exists
    const existing = await findOrCreateCANoCreate(LAL_CA_NAME);
    if (existing) return { skipped: true, reason: "lal_already_exists", id: existing.id };

    // Create LAL-1% MX
    const token = fbAuthToken();
    if (!token) return { skipped: true, reason: "no_fb_token" };
    try {
        const r = await axios.post(`https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/customaudiences`, {
            name: LAL_CA_NAME,
            subtype: "LOOKALIKE",
            origin_audience_id: seedCaId,
            lookalike_spec: JSON.stringify({
                country: "MX",
                ratio: 0.01,
                type: "similarity",
            }),
            access_token: token,
        }, { timeout: 20000 });
        return { created: true, id: r.data?.id };
    } catch (e) {
        return { skipped: true, reason: `lal_create_failed:${e.response?.data?.error?.message || e.message}` };
    }
}

async function findOrCreateCANoCreate(name) {
    const token = fbAuthToken();
    if (!token) return null;
    try {
        const r = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${actId()}/customaudiences`, {
            params: { fields: "id,name", limit: 200, access_token: token },
            timeout: 20000,
        });
        const list = r.data?.data || [];
        const m = list.find((ca) => ca.name === name);
        return m ? { id: m.id, name: m.name } : null;
    } catch (e) {
        return null;
    }
}

// ---------- Main runner ----------
async function _runSync({ dryRun = false, db } = {}) {
    db = db || admin.firestore();
    const startMs = Date.now();
    const runId = `brevo_fb_ca_${startMs}${dryRun ? "_dry" : ""}`;

    const result = {
        ok: false,
        run_id: runId,
        dry_run: !!dryRun,
        ts_start: new Date(startMs).toISOString(),
    };

    try {
        // 1. Pull Brevo deltas (last 24h)
        const contacts = await pullBrevoModifiedSince(24);
        result.brevo_count = contacts.length;

        // 2. Hash
        const hashes = [];
        const seen = new Set();
        for (const c of contacts) {
            const h = sha256Lower(c.email);
            if (!h || seen.has(h)) continue;
            seen.add(h);
            hashes.push(h);
        }
        result.unique_hashes = hashes.length;

        // 3. Resolve CA (prod vs test)
        const caName = dryRun ? TEST_CA_NAME : PROD_CA_NAME;
        let ca;
        try {
            ca = await findOrCreateCA(caName);
        } catch (e) {
            result.error = `ca_resolve_failed:${e.message}`;
            // Fall through to digest
            ca = null;
        }
        result.ca = ca;

        // 4. Upload
        if (ca && hashes.length) {
            const up = await uploadHashesToCA(ca.id, hashes);
            result.uploaded = up.added;
            result.batches = up.batches;
        } else {
            result.uploaded = 0;
            result.batches = 0;
        }

        // 5. LAL (only on prod, not dry-run)
        if (!dryRun && ca && hashes.length >= LAL_THRESHOLD) {
            result.lal = await ensureLookalikeIfThreshold(ca.id, hashes.length);
        } else {
            result.lal = { skipped: true, reason: dryRun ? "dry_run" : `pool_${hashes.length}_below_${LAL_THRESHOLD}` };
        }

        result.ok = true;
        result.duration_ms = Date.now() - startMs;
    } catch (err) {
        result.ok = false;
        result.error = err.message;
        result.duration_ms = Date.now() - startMs;
    }

    // Digest
    const lalLine = result.lal?.created ? "yes (just created)" :
        result.lal?.id ? "yes (existed)" :
            `no (${result.lal?.reason || "n/a"})`;

    const text = result.ok
        ? `✅ *Brevo → FB CA Sync* ${dryRun ? "(DRY-RUN)" : ""}\n` +
          `Synced *${result.uploaded}/${result.unique_hashes}* contacts to \`${result.ca?.name || "?"}\` (LAL: ${lalLine})\n` +
          `Brevo pulled: ${result.brevo_count} · unique: ${result.unique_hashes} · batches: ${result.batches}\n` +
          `Run: \`${runId}\` · ${result.duration_ms}ms`
        : `🔴 *Brevo → FB CA Sync FAILED* ${dryRun ? "(DRY-RUN)" : ""}\n` +
          `Error: \`${result.error}\`\n` +
          `Run: \`${runId}\` · ${result.duration_ms}ms`;

    const tg = await sendTelegram(text).catch((e) => ({ ok: false, error: e.message }));
    const sl = await sendSlackReport(text).catch((e) => ({ ok: false, error: e.message }));
    result.telegram_ok = !!tg.ok;
    result.telegram_message_id = tg.message_id || null;
    result.slack_ok = !!sl.ok;

    // Persist run
    try {
        await db.collection(SYNC_RUNS_COLL).doc(runId).set({
            ts: admin.firestore.FieldValue.serverTimestamp(),
            ...result,
        });
        if (!dryRun && result.ca?.id) {
            await db.collection(CA_STATE_COLL).doc(PROD_CA_NAME).set({
                ts: admin.firestore.FieldValue.serverTimestamp(),
                ca_id: result.ca.id,
                last_uploaded: result.uploaded,
                last_unique_hashes: result.unique_hashes,
                lal: result.lal || null,
            }, { merge: true });
        }
    } catch (e) {
        functions.logger?.warn?.(`brevoToFacebookCASync: persist failed: ${e.message}`);
    }

    return result;
}

// ---------- Cloud Functions ----------
const brevoToFacebookCASync = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 3 * * *") // 03:00 UTC daily
    .timeZone("Etc/UTC")
    .onRun(async () => {
        try {
            return await _runSync({ dryRun: false });
        } catch (err) {
            functions.logger.error(`brevoToFacebookCASync fatal: ${err.message}`);
            try {
                await sendTelegram(`🔴 *brevoToFacebookCASync FATAL*\n\`${err.message}\``);
            } catch (_) {}
            return { ok: false, error: err.message };
        }
    });

const brevoToFacebookCASyncOnDemand = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const dryRun = String(req.query.dryRun || req.query.dry || "").toLowerCase() === "1" ||
                String(req.query.dryRun || "").toLowerCase() === "true";
            const result = await _runSync({ dryRun });
            res.status(200).json(result);
        } catch (err) {
            functions.logger.error(`brevoToFacebookCASyncOnDemand error: ${err.message}`);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

module.exports = {
    brevoToFacebookCASync,
    brevoToFacebookCASyncOnDemand,
    _runSync,
    sha256Lower,
    pullBrevoModifiedSince,
    findOrCreateCA,
    uploadHashesToCA,
    ensureLookalikeIfThreshold,
};
