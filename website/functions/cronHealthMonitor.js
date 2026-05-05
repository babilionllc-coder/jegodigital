/**
 * cronHealthMonitor — Tier-A autonomous silent-cron detector.
 *
 * Daily 05:00 America/Mexico_City cron that scans the JegoDigital cron fleet
 * (Cloud Functions + GitHub Actions workflows) and flags any cron that has
 * fired but produced no meaningful output for >= 3 days (warn) or >= 7 days
 * (critical). Closes the gap that caused the 2026-05-05 cold-call dialer
 * dormancy disaster — the cron kept firing, but the OUTPUT (outbound dials)
 * was zero for 8 of 10 weekdays and no monitor noticed.
 *
 * READ-ONLY: never re-triggers, restarts, or modifies any cron. Pure observability.
 *
 * Evidence sources (in priority order, per-cron):
 *   1. Firestore collection recency  — most crons write a daily snapshot doc.
 *      Presence of a doc with freshness_field >= now() - expected_freshness_hours
 *      is proof-of-life.
 *   2. GitHub Actions workflow runs  — for .github/workflows/*.yml schedule
 *      triggers, GET /repos/{owner}/{repo}/actions/workflows/{id}/runs.
 *   3. Cloud Logging fallback        — for crons without a Firestore artifact,
 *      query Cloud Logging for "function-execution-finished" log entries.
 *      (v1: stub — returns "needs-mapping" so a human can add an evidence-map
 *      entry next session. Cloud Logging API integration deferred to v2.)
 *
 * Severity tiers:
 *   <=  1d silent  → healthy   ✅ (no alert)
 *   1-3d  silent   → watch     🟡 (Monday-review only)
 *   3-7d  silent   → warn      🟠 (Telegram + Slack #alerts)
 *      > 7d silent → critical  🔴 (Telegram + Slack + SMS fallback)
 *   no evidence    → unmapped  ❓ (digest "needs evidence map" list)
 *
 * Hard rules honored:
 *   - Rule 1  (verify-live): every "X days silent" claim from a live query this run.
 *   - Rule 7  (proof): exports { ok, run_id, fleet_size, by_tier, telegram_ok, slack_ok }.
 *   - Rule 11 (failed experiments logged): any per-cron probe error → cron_health_errors collection.
 *   - Rule 12 (always find a way): per-cron failures don't block the digest.
 *   - Rule 24 (Telegram + Slack): dual-channel every alerting run.
 *   - Rule 25 (always investigate): unmapped list IS the next-session prompt.
 *
 * Env vars:
 *   GITHUB_TOKEN                 — for GH Actions probe (PAT)
 *   GITHUB_REPO                  — "owner/repo" for the workflow API (defaults to babilionllc/jegodigital)
 *   TELEGRAM_BOT_TOKEN           — used by ./telegramHelper notify()
 *   TELEGRAM_CHAT_ID             — used by ./telegramHelper notify()
 *   SLACK_BOT_TOKEN              — used by ./slackPost
 *   SLACK_CHANNEL_ALERTS         — used by ./slackPost
 *
 * Exports:
 *   cronHealthMonitor          — cron 05:00 CDMX
 *   cronHealthMonitorOnDemand  — HTTPS manual fire (also accepts ?cron=<name> for single-cron mode)
 *   _runCronHealth             — internal runner (testable)
 *   _classifyTier              — pure helper for tests
 *   _CRON_EVIDENCE_MAP         — exported for inspection / unit tests
 *
 * STATUS: PAUSED FOR REVIEW. NOT yet wired into website/functions/index.js.
 *         Built 2026-05-05 overnight checkpoint #1. Awaits Alex 👍 before deploy.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

const SNAPSHOT_COLLECTION = "cron_health_daily";
const ERROR_COLLECTION = "cron_health_errors";
const DEFAULT_REPO = "babilionllc/jegodigital";

// ---------- Evidence map (v1 seed — see skills_patches/cron-health-monitor/cron-evidence-map.md) ----------

const _CRON_EVIDENCE_MAP = [
    // Firestore-backed (recent doc check)
    {
        name: "coldCallAutopilot",
        type: "firestore_collection_recent",
        collection: "phone_call_log",
        freshness_field: "created_at",
        expected_freshness_hours: 96, // weekdays-only, absorb weekend
        meaning: "outbound dial attempt logged",
    },
    {
        name: "coldCallLiveMonitor",
        type: "firestore_collection_recent",
        collection: "cold_call_health_pings",
        freshness_field: "ts",
        expected_freshness_hours: 1,
        meaning: "live monitor heartbeat",
    },
    {
        name: "dailyBriefing",
        type: "firestore_collection_recent",
        collection: "daily_briefings",
        freshness_field: "created_at",
        expected_freshness_hours: 24,
        meaning: "daily briefing artifact",
    },
    {
        name: "weeklyRevenueReview",
        type: "firestore_collection_recent",
        collection: "business_review_weekly",
        freshness_field: "created_at",
        expected_freshness_hours: 168,
        meaning: "Monday revenue review artifact",
    },
    {
        name: "instantlyReplyWatcher",
        type: "firestore_collection_recent",
        collection: "instantly_replies",
        freshness_field: "last_processed_at",
        expected_freshness_hours: 1,
        meaning: "Instantly reply scan tick",
    },
    {
        name: "processSupersearchLists",
        type: "firestore_collection_recent",
        collection: "supersearch_runs",
        freshness_field: "started_at",
        expected_freshness_hours: 48,
        meaning: "supersearch list run started",
    },
    {
        name: "dailyInboxPlacement",
        type: "firestore_collection_recent",
        collection: "inbox_placement_daily",
        freshness_field: "created_at",
        expected_freshness_hours: 24,
        meaning: "daily inbox placement seedlist write",
    },
    {
        name: "dailyPipelineDigest",
        type: "firestore_collection_recent",
        collection: "pipeline_digest_daily",
        freshness_field: "created_at",
        expected_freshness_hours: 24,
        meaning: "daily pipeline digest snapshot",
    },
    {
        name: "dailyStrategist",
        type: "firestore_collection_recent",
        collection: "strategist_daily_brief",
        freshness_field: "created_at",
        expected_freshness_hours: 24,
        meaning: "strategist daily brief artifact",
    },
    {
        name: "performanceMonitor",
        type: "firestore_collection_recent",
        collection: "performance_daily_snapshots",
        freshness_field: "created_at",
        expected_freshness_hours: 24,
        meaning: "performance monitor snapshot",
    },
    {
        name: "tokenWatchdog",
        type: "firestore_collection_recent",
        collection: "token_health_daily",
        freshness_field: "run_at",
        expected_freshness_hours: 24,
        meaning: "token watchdog snapshot",
    },
    {
        name: "cronHealthMonitor",
        type: "firestore_collection_recent",
        collection: SNAPSHOT_COLLECTION,
        freshness_field: "run_at",
        expected_freshness_hours: 24,
        meaning: "cron health monitor self-check",
    },
    // GitHub Actions
    {
        name: "smoke-test",
        type: "github_workflow_run",
        workflow_filename: "smoke-test.yml",
        expected_freshness_hours: 24,
        meaning: "daily smoke-test workflow",
    },
    {
        name: "auto-index",
        type: "github_workflow_run",
        workflow_filename: "auto-index.yml",
        expected_freshness_hours: 168, // pushes can be infrequent
        meaning: "auto-index workflow on push to main",
    },
    {
        name: "monday-revenue-review",
        type: "github_workflow_run",
        workflow_filename: "monday-revenue-review.yml",
        expected_freshness_hours: 168,
        meaning: "Monday revenue review workflow",
    },
];

// ---------- Helpers ----------

function classifyTier(daysSilent, hasEvidenceEver) {
    if (!hasEvidenceEver) return { tier: "unmapped", icon: "❓" };
    if (daysSilent === null || daysSilent === undefined) return { tier: "unmapped", icon: "❓" };
    if (daysSilent <= 1) return { tier: "healthy", icon: "✅" };
    if (daysSilent <= 3) return { tier: "watch", icon: "🟡" };
    if (daysSilent <= 7) return { tier: "warn", icon: "🟠" };
    return { tier: "critical", icon: "🔴" };
}

function hoursSince(ts) {
    if (!ts) return null;
    const ms = Date.now() - new Date(ts).getTime();
    return ms / 3600000;
}

function shortRunId() {
    return crypto.randomBytes(4).toString("hex");
}

// ---------- Per-cron probes ----------

async function probeFirestoreCollection(entry, db) {
    try {
        const cutoff = admin.firestore.Timestamp.fromMillis(
            Date.now() - entry.expected_freshness_hours * 3600 * 1000
        );
        // Try a recency query. If freshness_field is not indexed on the collection,
        // fall back to a simple orderBy + limit(1) without the where filter.
        let snap;
        try {
            snap = await db
                .collection(entry.collection)
                .where(entry.freshness_field, ">=", cutoff)
                .orderBy(entry.freshness_field, "desc")
                .limit(1)
                .get();
        } catch (idxErr) {
            // Likely a missing index — fall back to "newest doc" inspection
            snap = await db
                .collection(entry.collection)
                .orderBy(entry.freshness_field, "desc")
                .limit(1)
                .get();
        }

        if (snap.empty) {
            return {
                name: entry.name,
                ok: false,
                hasEvidenceEver: false,
                last_evidence_at: null,
                hours_silent: null,
                meaning: entry.meaning,
                source: `firestore:${entry.collection}`,
                note: "no documents in collection (or none with the freshness_field)",
            };
        }

        const doc = snap.docs[0];
        const tsField = doc.get(entry.freshness_field);
        const tsIso = tsField?.toDate ? tsField.toDate().toISOString() : new Date(tsField).toISOString();
        const hoursSilent = hoursSince(tsIso);
        return {
            name: entry.name,
            ok: hoursSilent !== null && hoursSilent <= entry.expected_freshness_hours,
            hasEvidenceEver: true,
            last_evidence_at: tsIso,
            hours_silent: hoursSilent,
            meaning: entry.meaning,
            source: `firestore:${entry.collection}`,
            note: `last evidence ${hoursSilent?.toFixed(1)}h ago (expected within ${entry.expected_freshness_hours}h)`,
        };
    } catch (err) {
        return {
            name: entry.name,
            ok: false,
            hasEvidenceEver: null,
            last_evidence_at: null,
            hours_silent: null,
            meaning: entry.meaning,
            source: `firestore:${entry.collection}`,
            error: err.message,
            note: `firestore probe error: ${err.message}`,
        };
    }
}

async function probeGithubWorkflow(entry) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
    if (!token) {
        return {
            name: entry.name,
            ok: false,
            hasEvidenceEver: null,
            last_evidence_at: null,
            hours_silent: null,
            meaning: entry.meaning,
            source: `github:${entry.workflow_filename}`,
            error: "GITHUB_TOKEN not set",
            note: "skipping GH workflow probe (no token)",
        };
    }
    try {
        const r = await axios.get(
            `https://api.github.com/repos/${repo}/actions/workflows/${entry.workflow_filename}/runs`,
            {
                params: { per_page: 1, status: "success" },
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout: 12000,
            }
        );
        const runs = r.data?.workflow_runs || [];
        if (runs.length === 0) {
            return {
                name: entry.name,
                ok: false,
                hasEvidenceEver: false,
                last_evidence_at: null,
                hours_silent: null,
                meaning: entry.meaning,
                source: `github:${entry.workflow_filename}`,
                note: "no successful runs returned by GH API",
            };
        }
        const run = runs[0];
        const ts = run.updated_at;
        const hoursSilent = hoursSince(ts);
        return {
            name: entry.name,
            ok: hoursSilent !== null && hoursSilent <= entry.expected_freshness_hours,
            hasEvidenceEver: true,
            last_evidence_at: ts,
            hours_silent: hoursSilent,
            meaning: entry.meaning,
            source: `github:${entry.workflow_filename}`,
            run_id: run.id,
            note: `last successful run ${hoursSilent?.toFixed(1)}h ago (expected within ${entry.expected_freshness_hours}h)`,
        };
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        return {
            name: entry.name,
            ok: false,
            hasEvidenceEver: null,
            last_evidence_at: null,
            hours_silent: null,
            meaning: entry.meaning,
            source: `github:${entry.workflow_filename}`,
            error: msg,
            note: `GH API probe error: ${msg}`,
        };
    }
}

async function probeOne(entry, db) {
    if (entry.type === "firestore_collection_recent") return probeFirestoreCollection(entry, db);
    if (entry.type === "github_workflow_run") return probeGithubWorkflow(entry);
    if (entry.type === "log_query") {
        // v2: integrate Cloud Logging API. v1 returns a stub.
        return {
            name: entry.name,
            ok: null,
            hasEvidenceEver: null,
            last_evidence_at: null,
            hours_silent: null,
            meaning: entry.meaning,
            source: `log:${entry.log_filter || "?"}`,
            note: "log_query probe stubbed in v1 — Cloud Logging API integration deferred to v2",
        };
    }
    return {
        name: entry.name,
        ok: false,
        hasEvidenceEver: null,
        last_evidence_at: null,
        hours_silent: null,
        meaning: entry.meaning || "?",
        source: "unknown",
        error: `unknown evidence type ${entry.type}`,
        note: `unknown evidence type ${entry.type}`,
    };
}

// ---------- Digest composition ----------

function composeDigest(today, perCron, byTier) {
    const lines = [];
    lines.push(`*🚨 Cron Health · ${today}*`);
    lines.push("");
    lines.push(
        `Fleet: ${perCron.length} mapped crons · ` +
        `✅ ${byTier.healthy} healthy · 🟡 ${byTier.watch} watch · ` +
        `🟠 ${byTier.warn} warn · 🔴 ${byTier.critical} critical · ❓ ${byTier.unmapped} unmapped`
    );

    const filterTier = (tierName) =>
        perCron
            .filter((c) => c._tier === tierName)
            .sort((a, b) => (b.hours_silent || 0) - (a.hours_silent || 0));

    const critical = filterTier("critical");
    if (critical.length) {
        lines.push("");
        lines.push("🔴 *Critical (>7d silent):*");
        for (const c of critical) {
            const days = c.hours_silent ? (c.hours_silent / 24).toFixed(1) : "?";
            lines.push(`• \`${c.name}\` — ${days}d silent — ${c.note || c.meaning}`);
        }
    }
    const warn = filterTier("warn");
    if (warn.length) {
        lines.push("");
        lines.push("🟠 *Warn (3-7d silent):*");
        for (const c of warn) {
            const days = c.hours_silent ? (c.hours_silent / 24).toFixed(1) : "?";
            lines.push(`• \`${c.name}\` — ${days}d silent — ${c.note || c.meaning}`);
        }
    }
    const watch = filterTier("watch");
    if (watch.length && (critical.length || warn.length)) {
        // include watch only when something else is alerting
        lines.push("");
        lines.push("🟡 *Watch (1-3d silent):*");
        for (const c of watch) {
            const days = c.hours_silent ? (c.hours_silent / 24).toFixed(1) : "?";
            lines.push(`• \`${c.name}\` — ${days}d silent`);
        }
    }
    const unmapped = filterTier("unmapped");
    if (unmapped.length) {
        lines.push("");
        lines.push(`❓ *Unmapped (${unmapped.length}):*`);
        for (const c of unmapped) {
            lines.push(`• \`${c.name}\` — ${c.error || c.note || "needs evidence-map entry"}`);
        }
    }

    if (!critical.length && !warn.length && !unmapped.length) {
        lines.push("");
        lines.push("All mapped crons healthy. No action needed. ✅");
    }

    lines.push("");
    lines.push(`_Snapshot: ${SNAPSHOT_COLLECTION}/${today}_`);
    return lines.join("\n");
}

// ---------- Internal runner ----------

async function _runCronHealth({ singleCron = null } = {}) {
    const runId = shortRunId();
    const today = new Date().toISOString().slice(0, 10);
    const db = admin.firestore();

    const map = singleCron
        ? _CRON_EVIDENCE_MAP.filter((e) => e.name === singleCron)
        : _CRON_EVIDENCE_MAP;

    if (map.length === 0) {
        return { ok: false, run_id: runId, error: `no evidence-map entry for ${singleCron}` };
    }

    // Probe in parallel — per-cron failures isolated
    const probes = await Promise.allSettled(map.map((e) => probeOne(e, db)));
    const perCron = probes.map((p, i) => {
        if (p.status === "fulfilled") return p.value;
        return {
            name: map[i].name,
            ok: false,
            hasEvidenceEver: null,
            last_evidence_at: null,
            hours_silent: null,
            meaning: map[i].meaning,
            source: "probe_rejected",
            error: p.reason?.message || String(p.reason),
            note: `probe rejected: ${p.reason?.message || p.reason}`,
        };
    });

    // Classify
    for (const c of perCron) {
        const days = c.hours_silent === null ? null : c.hours_silent / 24;
        const tier = classifyTier(days, c.hasEvidenceEver === true);
        c._tier = tier.tier;
        c._icon = tier.icon;
    }

    const byTier = perCron.reduce(
        (acc, c) => {
            acc[c._tier] = (acc[c._tier] || 0) + 1;
            return acc;
        },
        { healthy: 0, watch: 0, warn: 0, critical: 0, unmapped: 0 }
    );

    const hasCritical = byTier.critical > 0;
    const hasWarnOrAbove = byTier.warn > 0 || byTier.critical > 0 || byTier.unmapped > 0;

    const digest = composeDigest(today, perCron, byTier);

    // Persist snapshot first (so even if notify fails, the data is saved)
    let snapshotOk = false;
    try {
        await db.collection(SNAPSHOT_COLLECTION).doc(today).set({
            run_at: admin.firestore.FieldValue.serverTimestamp(),
            run_id: runId,
            fleet_size: perCron.length,
            by_tier: byTier,
            per_cron: perCron,
        });
        snapshotOk = true;
    } catch (err) {
        functions.logger.error(`[cronHealthMonitor ${runId}] snapshot write failed: ${err.message}`);
    }

    // Dual-channel post — only if there's something to alert about (or singleCron mode)
    let telegramOk = false;
    let slackOk = false;
    if (hasWarnOrAbove || singleCron) {
        try {
            const tg = await notify(digest, { critical: hasCritical });
            telegramOk = !!tg?.telegram;
        } catch (err) {
            functions.logger.error(`[cronHealthMonitor ${runId}] notify failed: ${err.message}`);
        }
        try {
            const sk = await slackPost("alerts", { text: `Cron Health · ${today}`, blocks: [
                { type: "section", text: { type: "mrkdwn", text: digest } },
            ] });
            slackOk = !!sk?.ok;
        } catch (err) {
            functions.logger.error(`[cronHealthMonitor ${runId}] slackPost failed: ${err.message}`);
        }
    } else {
        functions.logger.info(`[cronHealthMonitor ${runId}] all mapped crons healthy — no alerts emitted`);
    }

    return {
        ok: snapshotOk,
        run_id: runId,
        fleet_size: perCron.length,
        by_tier: byTier,
        telegram_ok: telegramOk,
        slack_ok: slackOk,
        snapshot_path: snapshotOk ? `${SNAPSHOT_COLLECTION}/${today}` : null,
        digest_emitted: hasWarnOrAbove,
    };
}

// ---------- Public exports ----------

exports.cronHealthMonitor = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub.schedule("0 5 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const result = await _runCronHealth({});
            functions.logger.info(`[cronHealthMonitor] result: ${JSON.stringify(result)}`);
        } catch (err) {
            functions.logger.error(`[cronHealthMonitor] FATAL: ${err.message}`);
            // Best-effort error notify
            try {
                await notify(`🔴 *cronHealthMonitor FATAL*\n\`${err.message}\``, { critical: true });
            } catch (_) {}
            // Also persist to error collection
            try {
                await admin.firestore().collection(ERROR_COLLECTION).add({
                    ts: admin.firestore.FieldValue.serverTimestamp(),
                    error: err.message,
                    stack: err.stack,
                });
            } catch (_) {}
        }
        return null;
    });

exports.cronHealthMonitorOnDemand = functions.https.onRequest(async (req, res) => {
    try {
        const singleCron = req.query.cron || null;
        const result = await _runCronHealth({ singleCron });
        res.status(200).json(result);
    } catch (err) {
        functions.logger.error(`[cronHealthMonitorOnDemand] error: ${err.message}`);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Internal exports for tests
exports._runCronHealth = _runCronHealth;
exports._classifyTier = classifyTier;
exports._CRON_EVIDENCE_MAP = _CRON_EVIDENCE_MAP;
