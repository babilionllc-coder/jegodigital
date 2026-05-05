/**
 * tokenWatchdog — Tier-A autonomous credential expiry + scope binding monitor.
 *
 * Daily 06:00 America/Mexico_City cron that probes every credential the
 * JegoDigital stack depends on, flags expiring tokens 7 days early, and
 * detects scope-binding issues (the WA Cloud token disaster pattern from
 * 2026-05-05 — scope name present but no WABA assigned in target_ids).
 *
 * READ-ONLY: never rotates a token, never writes to a 3rd-party platform.
 *
 * Tokens monitored (canonical):
 *   - META_WA_CLOUD_TOKEN     (debug_token, scope + WABA target_ids)
 *   - META_GRAPH_TOKEN        (debug_token, ads_read scope)
 *   - BREVO_API_KEY           (/v3/account)
 *   - INSTANTLY_API_KEY       (/api/v2/campaigns?limit=1)
 *   - ELEVENLABS_API_KEY      (/v1/user/subscription)
 *   - TWILIO_AUTH_TOKEN       (/Accounts/<sid>.json)
 *   - GITHUB_TOKEN            (/user)
 *   - CALENDLY_PAT            (/users/me)
 *   - SLACK_BOT_TOKEN         (auth.test)
 *   - TELEGRAM_BOT_TOKEN      (getMe)
 *
 * Severity tiers (days-to-expire):
 *   > 30   info    ✅ healthy
 *    8-30  watch   🔵
 *    4-7   warn    🟡
 *    1-3   error   🟠
 *    0     critical 🔴 (also if !is_valid)
 *
 * Critical tier triggers SMS fallback via notify({ critical: true }).
 *
 * Hard rules honored:
 *   - Rule 1  (verify-live): every status from a live API call this run.
 *   - Rule 7  (proof): returns { ok, run_id, per_token, telegram_ok, slack_ok }.
 *   - Rule 12 (always find a way): per-token failures don't block the digest.
 *   - Rule 24 (Telegram + Slack): dual-channel every run.
 *   - Rule 25 (always investigate): catches scope-binding issues automatically.
 *
 * Env vars:
 *   META_APP_ID, META_APP_SECRET           — used to build the app-token for /debug_token
 *   META_WA_CLOUD_TOKEN, META_GRAPH_TOKEN  — tokens being inspected
 *   WHATSAPP_BUSINESS_ACCOUNT_ID           — expected WABA target_id
 *   META_AD_ACCOUNT_ID                     — expected ads target_id
 *   BREVO_API_KEY, INSTANTLY_API_KEY,
 *   ELEVENLABS_API_KEY, TWILIO_AUTH_TOKEN,
 *   TWILIO_ACCOUNT_SID, GITHUB_TOKEN,
 *   CALENDLY_PAT, SLACK_BOT_TOKEN,
 *   TELEGRAM_BOT_TOKEN                     — tokens being probed
 *
 * Exports:
 *   tokenWatchdog          — cron 06:00 CDMX
 *   tokenWatchdogOnDemand  — HTTPS manual fire / single-token mode
 *   _runTokenWatchdog      — internal runner
 *   _classifyTier          — pure helper for tests
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

const META_GRAPH_BASE = "https://graph.facebook.com/v22.0";
const SNAPSHOT_COLLECTION = "token_health_daily";

// ---------- Severity classification ----------

function classifyTier({ isValid, daysToExpire }) {
    if (isValid === false) return { tier: "critical", icon: "🔴" };
    if (daysToExpire === null || daysToExpire === undefined) return { tier: "healthy", icon: "✅" };
    if (daysToExpire <= 0)  return { tier: "critical", icon: "🔴" };
    if (daysToExpire <= 3)  return { tier: "error",    icon: "🟠" };
    if (daysToExpire <= 7)  return { tier: "warn",     icon: "🟡" };
    if (daysToExpire <= 30) return { tier: "watch",    icon: "🔵" };
    return { tier: "healthy", icon: "✅" };
}

function daysBetween(unixSec) {
    if (!unixSec || unixSec <= 0) return null;
    const ms = unixSec * 1000 - Date.now();
    return Math.round(ms / 86400000);
}

// ---------- Per-token probes ----------

// 2026-05-05 triage: env-name aliases. The canonical names below are the ones
// the watchdog originally probed, but the deploy.yml secret-injection block
// (and Alex's local .env) use slightly different names. Without these aliases,
// tokenWatchdog fires 3 daily false-positive criticals (META_WA_CLOUD_TOKEN,
// META_GRAPH_TOKEN, GITHUB_TOKEN) even though the underlying tokens are valid.
// The aliases are checked in order; the first non-empty wins.
const ENV_ALIASES = {
    META_GRAPH_TOKEN: ["META_GRAPH_TOKEN", "META_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN"],
    META_WA_CLOUD_TOKEN: ["META_WA_CLOUD_TOKEN", "WA_CLOUD_ACCESS_TOKEN"],
    // GITHUB_TOKEN is reserved by GitHub Actions runtime and cannot be set as
    // a repo Secret. Functions runtime needs a PAT — Alex stores his at
    // .secrets/github_token locally; in prod we read from GH_PAT secret.
    GITHUB_TOKEN: ["GITHUB_TOKEN", "GH_PAT", "GH_TOKEN"],
    // 2026-05-05 PM extension: the Meta /debug_token endpoint requires an
    // app-token built from app-id + app-secret, and target_id binding checks
    // need the WABA / ad-account ids. We use FB_* secrets as the source of
    // truth (those are what Alex maintains in GitHub Secrets), and alias
    // them into the canonical META_* names that this watchdog asks for.
    META_APP_ID:                  ["META_APP_ID", "FB_APP_ID"],
    META_APP_SECRET:              ["META_APP_SECRET", "FB_APP_SECRET"],
    WHATSAPP_BUSINESS_ACCOUNT_ID: ["WHATSAPP_BUSINESS_ACCOUNT_ID", "WA_CLOUD_WABA_ID"],
    META_AD_ACCOUNT_ID:           ["META_AD_ACCOUNT_ID", "FB_AD_ACCOUNT_ID"],
};

function readEnvWithAliases(canonicalName) {
    const candidates = ENV_ALIASES[canonicalName] || [canonicalName];
    for (const k of candidates) {
        const v = process.env[k];
        if (v) return v;
    }
    return null;
}

async function probeMetaToken(name, tokenEnv, expectedScope, expectedTargetEnv) {
    const tok = readEnvWithAliases(tokenEnv);
    if (!tok) return { name, ok: false, reason: `${tokenEnv} not set (aliases: ${(ENV_ALIASES[tokenEnv] || [tokenEnv]).join(", ")})`, isValid: false };

    const appId = readEnvWithAliases("META_APP_ID");
    const appSec = readEnvWithAliases("META_APP_SECRET");
    if (!appId || !appSec) {
        return { name, ok: false, reason: "META_APP_ID or META_APP_SECRET missing (aliases: FB_APP_ID, FB_APP_SECRET) — can't call /debug_token", isValid: false };
    }
    const appToken = `${appId}|${appSec}`;
    try {
        const r = await axios.get(`${META_GRAPH_BASE}/debug_token`, {
            params: { input_token: tok, access_token: appToken },
            timeout: 12000,
        });
        const d = r.data?.data || {};
        const expiresAt = d.expires_at || 0; // 0 = never expires
        const daysToExpire = daysBetween(expiresAt);
        const isValid = !!d.is_valid;
        const scopes = d.scopes || [];
        const granular = d.granular_scopes || [];
        const expectedTarget = expectedTargetEnv ? (readEnvWithAliases(expectedTargetEnv) || process.env[expectedTargetEnv]) : null;
        let scopeOk = true;
        const scopeNotes = [];
        if (expectedScope) {
            const granularEntry = granular.find((g) => g.scope === expectedScope);
            const scopeListed = scopes.includes(expectedScope) || !!granularEntry;
            if (!scopeListed) {
                scopeOk = false;
                scopeNotes.push(`scope ${expectedScope} missing`);
            } else if (expectedTarget) {
                const tids = (granularEntry && granularEntry.target_ids) || [];
                if (!tids.map(String).includes(String(expectedTarget))) {
                    scopeOk = false;
                    scopeNotes.push(
                        `scope ${expectedScope} present BUT target_ids=${JSON.stringify(tids)} does NOT include expected ${expectedTarget}`
                    );
                }
            }
        }
        return {
            name,
            ok: isValid && scopeOk,
            isValid,
            scope_ok: scopeOk,
            scope_notes: scopeNotes,
            expires_at: expiresAt,
            days_to_expire: daysToExpire,
            scopes,
            granular_scopes: granular,
            app_id: d.app_id,
            note:
                !isValid ? "is_valid=false from /debug_token" :
                !scopeOk ? scopeNotes.join("; ") :
                expiresAt === 0 ? "no expiry (system-user token)" :
                `expires in ${daysToExpire} days`,
        };
    } catch (err) {
        const code = err.response?.data?.error?.code;
        const msg  = err.response?.data?.error?.message || err.message;
        return { name, ok: false, isValid: false, reason: code ? `${code}: ${msg}` : msg };
    }
}

async function probeBrevo() {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { name: "BREVO_API_KEY", ok: false, reason: "not set", isValid: false };
    try {
        const r = await axios.get("https://api.brevo.com/v3/account", {
            headers: { "api-key": key, accept: "application/json" },
            timeout: 12000,
        });
        return {
            name: "BREVO_API_KEY",
            ok: !!r.data?.email,
            isValid: true,
            days_to_expire: null,
            note: `account ${r.data?.email || "(no email returned)"}`,
            account_email: r.data?.email,
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            name: "BREVO_API_KEY",
            ok: false,
            isValid: status !== 401 && status !== 403,
            reason: `${status || ""} ${err.message}`.trim(),
        };
    }
}

async function probeInstantly() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) return { name: "INSTANTLY_API_KEY", ok: false, reason: "not set", isValid: false };
    try {
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns?limit=1", {
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            timeout: 12000,
        });
        return {
            name: "INSTANTLY_API_KEY",
            ok: r.status === 200,
            isValid: true,
            days_to_expire: null,
            note: `campaigns endpoint OK · ${(r.data?.items || []).length} item(s)`,
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            name: "INSTANTLY_API_KEY",
            ok: false,
            isValid: status !== 401 && status !== 403,
            reason: `${status || ""} ${err.message}`.trim(),
        };
    }
}

async function probeElevenLabs() {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { name: "ELEVENLABS_API_KEY", ok: false, reason: "not set", isValid: false };
    try {
        const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
            headers: { "xi-api-key": key },
            timeout: 12000,
        });
        const used = r.data?.character_count || 0;
        const limit = r.data?.character_limit || 0;
        const status = r.data?.status || "unknown";
        const remaining = limit - used;
        return {
            name: "ELEVENLABS_API_KEY",
            ok: status === "active" && remaining > 0,
            isValid: true,
            days_to_expire: null,
            note: `${remaining.toLocaleString()} chars left (${status})`,
            character_count: used,
            character_limit: limit,
            subscription_status: status,
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            name: "ELEVENLABS_API_KEY",
            ok: false,
            isValid: status !== 401 && status !== 403,
            reason: `${status || ""} ${err.message}`.trim(),
        };
    }
}

async function probeTwilio() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) return { name: "TWILIO_AUTH_TOKEN", ok: false, reason: "SID or token missing", isValid: false };
    try {
        const r = await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
            auth: { username: sid, password: tok },
            timeout: 12000,
        });
        const accStatus = r.data?.status || "unknown";
        return {
            name: "TWILIO_AUTH_TOKEN",
            ok: accStatus === "active",
            isValid: true,
            days_to_expire: null,
            note: `account ${accStatus}`,
            twilio_status: accStatus,
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            name: "TWILIO_AUTH_TOKEN",
            ok: false,
            isValid: status !== 401 && status !== 403,
            reason: `${status || ""} ${err.message}`.trim(),
        };
    }
}

async function probeGithubPat() {
    const tok = readEnvWithAliases("GITHUB_TOKEN");
    if (!tok) return { name: "GITHUB_TOKEN", ok: false, reason: "not set (aliases: GITHUB_TOKEN, GH_PAT, GH_TOKEN)", isValid: false };
    try {
        const r = await axios.get("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tok}`,
                "User-Agent": "jegodigital-tokenWatchdog",
                Accept: "application/vnd.github+json",
            },
            timeout: 12000,
        });
        const scopes = (r.headers?.["x-oauth-scopes"] || "").split(",").map((s) => s.trim()).filter(Boolean);
        const hasRepo = scopes.includes("repo");
        const hasWorkflow = scopes.includes("workflow");
        // GitHub fine-grained tokens don't return scopes header, so don't fail on missing.
        const note = scopes.length
            ? `login=${r.data.login} scopes=[${scopes.join(",")}]`
            : `login=${r.data.login} (fine-grained PAT — no scopes header)`;
        return {
            name: "GITHUB_TOKEN",
            ok: !!r.data?.login && (scopes.length === 0 || (hasRepo && hasWorkflow)),
            isValid: true,
            days_to_expire: null,
            note,
            scopes,
            login: r.data.login,
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            name: "GITHUB_TOKEN",
            ok: false,
            isValid: status !== 401 && status !== 403,
            reason: `${status || ""} ${err.message}`.trim(),
        };
    }
}

async function probeCalendlyPat() {
    const tok = process.env.CALENDLY_PAT;
    if (!tok) return { name: "CALENDLY_PAT", ok: false, reason: "not set", isValid: false };
    try {
        const r = await axios.get("https://api.calendly.com/users/me", {
            headers: { Authorization: `Bearer ${tok}` },
            timeout: 12000,
        });
        return {
            name: "CALENDLY_PAT",
            ok: !!r.data?.resource?.uri,
            isValid: true,
            days_to_expire: null,
            note: `user ${r.data?.resource?.email || "(no email)"}`,
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            name: "CALENDLY_PAT",
            ok: false,
            isValid: status !== 401 && status !== 403,
            reason: `${status || ""} ${err.message}`.trim(),
        };
    }
}

async function probeSlackBot() {
    const tok = process.env.SLACK_BOT_TOKEN;
    if (!tok) return { name: "SLACK_BOT_TOKEN", ok: false, reason: "not set", isValid: false };
    try {
        const r = await axios.post("https://slack.com/api/auth.test",
            null,
            { headers: { Authorization: `Bearer ${tok}` }, timeout: 12000 });
        return {
            name: "SLACK_BOT_TOKEN",
            ok: !!r.data?.ok,
            isValid: !!r.data?.ok,
            days_to_expire: null,
            note: r.data?.ok ? `bot_id=${r.data.bot_id} team=${r.data.team}` : `error: ${r.data?.error}`,
        };
    } catch (err) {
        return { name: "SLACK_BOT_TOKEN", ok: false, isValid: false, reason: err.message };
    }
}

async function probeTelegramBot() {
    const tok = process.env.TELEGRAM_BOT_TOKEN;
    if (!tok) return { name: "TELEGRAM_BOT_TOKEN", ok: false, reason: "not set", isValid: false };
    try {
        const r = await axios.get(`https://api.telegram.org/bot${tok}/getMe`, { timeout: 12000 });
        return {
            name: "TELEGRAM_BOT_TOKEN",
            ok: !!r.data?.ok,
            isValid: !!r.data?.ok,
            days_to_expire: null,
            note: r.data?.ok ? `username=@${r.data.result.username}` : `error: ${r.data?.description}`,
        };
    } catch (err) {
        return { name: "TELEGRAM_BOT_TOKEN", ok: false, isValid: false, reason: err.message };
    }
}

// ---------- Probe registry ----------

const TOKENS = [
    {
        name: "META_WA_CLOUD_TOKEN",
        critical: true,
        probe: () => probeMetaToken(
            "META_WA_CLOUD_TOKEN",
            "META_WA_CLOUD_TOKEN",
            "whatsapp_business_management",
            "WHATSAPP_BUSINESS_ACCOUNT_ID"
        ),
    },
    {
        name: "META_GRAPH_TOKEN",
        critical: true,
        probe: () => probeMetaToken(
            "META_GRAPH_TOKEN",
            "META_GRAPH_TOKEN",
            "ads_read",
            "META_AD_ACCOUNT_ID"
        ),
    },
    { name: "BREVO_API_KEY",      critical: true,  probe: probeBrevo },
    { name: "INSTANTLY_API_KEY",  critical: true,  probe: probeInstantly },
    { name: "ELEVENLABS_API_KEY", critical: true,  probe: probeElevenLabs },
    { name: "TWILIO_AUTH_TOKEN",  critical: true,  probe: probeTwilio },
    { name: "GITHUB_TOKEN",       critical: true,  probe: probeGithubPat },
    { name: "CALENDLY_PAT",       critical: false, probe: probeCalendlyPat },
    { name: "SLACK_BOT_TOKEN",    critical: false, probe: probeSlackBot },
    { name: "TELEGRAM_BOT_TOKEN", critical: false, probe: probeTelegramBot },
];

// ---------- Format digest ----------

function formatDigest({ runId, dateStr, results }) {
    const buckets = { critical: [], error: [], warn: [], watch: [], healthy: [] };
    for (const r of results) {
        const tier = r.tier || "healthy";
        (buckets[tier] || buckets.healthy).push(r);
    }

    const lines = [];
    lines.push(`🔐 *Token Health · ${dateStr}*`);
    lines.push("");

    if (buckets.critical.length > 0) {
        lines.push(`🔴 *Critical (${buckets.critical.length})*`);
        for (const r of buckets.critical) {
            lines.push(`   • *${r.name}* — ${r.note || r.reason || "validity check failed"}`);
            if (r.scope_notes && r.scope_notes.length > 0) {
                for (const sn of r.scope_notes) lines.push(`      ↳ ${sn}`);
            }
        }
        lines.push("");
    }
    if (buckets.error.length > 0) {
        lines.push(`🟠 *Error (${buckets.error.length})*`);
        for (const r of buckets.error) lines.push(`   • *${r.name}* — ${r.note || r.reason}`);
        lines.push("");
    }
    if (buckets.warn.length > 0) {
        lines.push(`🟡 *Warn (${buckets.warn.length})*`);
        for (const r of buckets.warn) lines.push(`   • *${r.name}* — ${r.note || r.reason}`);
        lines.push("");
    }
    if (buckets.watch.length > 0) {
        lines.push(`🔵 *Watch (${buckets.watch.length})*`);
        for (const r of buckets.watch) lines.push(`   • *${r.name}* — ${r.note || r.reason}`);
        lines.push("");
    }
    if (buckets.healthy.length > 0) {
        lines.push(`✅ *Healthy (${buckets.healthy.length})*`);
        for (const r of buckets.healthy) lines.push(`   • ${r.name} — ${r.note || "valid"}`);
        lines.push("");
    }

    lines.push(`🪪 Run id: \`${runId}\``);
    return lines.join("\n");
}

function formatDigestBlocks({ runId, dateStr, results }) {
    const buckets = { critical: [], error: [], warn: [], watch: [], healthy: [] };
    for (const r of results) (buckets[r.tier || "healthy"] || buckets.healthy).push(r);
    const blocks = [
        { type: "header", text: { type: "plain_text", text: `Token Health · ${dateStr}`, emoji: true } },
    ];
    if (buckets.critical.length || buckets.error.length || buckets.warn.length) {
        const issueLines = [...buckets.critical, ...buckets.error, ...buckets.warn].map((r) => {
            const icon = r.tier === "critical" ? ":red_circle:" : r.tier === "error" ? ":large_orange_circle:" : ":large_yellow_circle:";
            return `${icon} *${r.name}* — ${r.note || r.reason || ""}`;
        });
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `:rotating_light: *${issueLines.length} issue${issueLines.length === 1 ? "" : "s"}*\n${issueLines.join("\n")}` },
        });
    } else {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: ":white_check_mark: All credentials valid and not expiring within 30 days." },
        });
    }
    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `Run id: \`${runId}\` · cron: 06:00 CDMX daily · ${results.length} tokens checked` }],
    });
    return blocks;
}

// ---------- Main runner ----------

async function runTokenWatchdog({ tokenFilter = null } = {}) {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    const now = new Date();
    const y = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
    const da = String(now.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${mo}-${da}`;
    const runId = `token_health_${dateStr}`;
    functions.logger.info(`tokenWatchdog START ${runId}`);

    const probes = tokenFilter
        ? TOKENS.filter((t) => t.name === tokenFilter)
        : TOKENS;

    if (probes.length === 0) {
        return { ok: false, error: `unknown token: ${tokenFilter}` };
    }

    const results = await Promise.all(probes.map(async (def) => {
        try {
            const raw = await def.probe();
            const tier = classifyTier({
                isValid: raw.isValid !== false && raw.ok !== false,
                daysToExpire: raw.days_to_expire,
            }).tier;
            const icon = classifyTier({ isValid: raw.isValid !== false && raw.ok !== false, daysToExpire: raw.days_to_expire }).icon;
            return {
                ...raw,
                tier: raw.ok === false ? "critical" : (raw.scope_ok === false ? "critical" : tier),
                icon,
                critical_token: !!def.critical,
            };
        } catch (err) {
            return { name: def.name, ok: false, isValid: false, tier: "critical", icon: "🔴", reason: err.message, critical_token: !!def.critical };
        }
    }));

    const text = formatDigest({ runId, dateStr, results });
    const blocks = formatDigestBlocks({ runId, dateStr, results });

    const hasCritical = results.some((r) => r.tier === "critical" && r.critical_token);

    let telegramOk = false, slackOk = false;
    try {
        const tg = await notify(text, { critical: hasCritical });
        telegramOk = !!tg.telegram;
    } catch (err) {
        functions.logger.error(`Telegram notify failed: ${err.message}`);
    }
    try {
        const channel = hasCritical ? "alerts" : "daily-ops";
        const sk = await slackPost(channel, { text: `Token Health · ${dateStr}`, blocks });
        slackOk = !!sk.ok;
    } catch (err) {
        functions.logger.error(`Slack post failed: ${err.message}`);
    }

    // Snapshot
    const snapshot = {
        date: dateStr,
        run_id: runId,
        run_at: admin.firestore.FieldValue.serverTimestamp(),
        tokens_checked: results.length,
        critical_count: results.filter((r) => r.tier === "critical").length,
        error_count: results.filter((r) => r.tier === "error").length,
        warn_count: results.filter((r) => r.tier === "warn").length,
        watch_count: results.filter((r) => r.tier === "watch").length,
        healthy_count: results.filter((r) => r.tier === "healthy").length,
        results: results.map((r) => ({
            name: r.name,
            tier: r.tier,
            icon: r.icon,
            ok: r.ok,
            note: r.note || r.reason || null,
            days_to_expire: r.days_to_expire ?? null,
            scope_ok: r.scope_ok ?? null,
            scope_notes: r.scope_notes ?? null,
            expires_at: r.expires_at ?? null,
            critical_token: r.critical_token,
        })),
        telegram_ok: telegramOk,
        slack_ok: slackOk,
    };
    let snapshotPath = null;
    try {
        await db.collection(SNAPSHOT_COLLECTION).doc(dateStr).set(snapshot, { merge: true });
        snapshotPath = `${SNAPSHOT_COLLECTION}/${dateStr}`;
    } catch (err) {
        functions.logger.error(`token_health snapshot save failed: ${err.message}`);
    }

    functions.logger.info(`tokenWatchdog DONE ${runId} · critical=${snapshot.critical_count} · warn=${snapshot.warn_count}`);

    return {
        ok: true,
        run_id: runId,
        date: dateStr,
        per_token: results,
        critical_count: snapshot.critical_count,
        error_count: snapshot.error_count,
        warn_count: snapshot.warn_count,
        telegram_ok: telegramOk,
        slack_ok: slackOk,
        snapshot_doc: snapshotPath,
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

// Daily 06:00 CDMX
exports.tokenWatchdog = functions
    .runWith({ timeoutSeconds: 300, memory: "256MB" })
    .pubsub.schedule("0 6 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const r = await runTokenWatchdog();
            functions.logger.info("tokenWatchdog result:", JSON.stringify({
                run_id: r.run_id,
                critical: r.critical_count,
                warn: r.warn_count,
                telegram_ok: r.telegram_ok,
                slack_ok: r.slack_ok,
            }));
            return null;
        } catch (err) {
            functions.logger.error("tokenWatchdog threw:", err);
            try {
                await notify(`🔴 *tokenWatchdog cron threw*\n\`${err.message}\``, { critical: true });
            } catch (_) {}
            return null;
        }
    });

// On-demand HTTPS
// curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/tokenWatchdogOnDemand"
// curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/tokenWatchdogOnDemand?token=META_WA_CLOUD_TOKEN"
exports.tokenWatchdogOnDemand = functions
    .runWith({ timeoutSeconds: 300, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        try {
            const tokenFilter = req.query.token || null;
            const r = await runTokenWatchdog({ tokenFilter });
            res.json(r);
        } catch (err) {
            functions.logger.error("tokenWatchdogOnDemand failed:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

exports._runTokenWatchdog = runTokenWatchdog;
exports._classifyTier = classifyTier;
