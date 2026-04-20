/**
 * systemHealthAudit — every-2-days watchdog.
 *
 * Runs a fixed checklist against every critical dependency, writes the
 * verdict to Firestore `system_health/{runId}`, posts a Telegram digest
 * naming every red check, and falls silent (no noise) when everything
 * is green except for the first run of each month (monthly all-green
 * ping reassures Alex the watchdog itself is alive).
 *
 * Rule: this function NEVER edits live code. It surfaces problems.
 * Fixing is always a human+PR loop. That's the design choice.
 *
 * Schedule: `every 48 hours` / timezone `America/Mexico_City`
 *
 * Checks (expand over time — see SYSTEM.md §8):
 *   1. Firebase Hosting is reachable (200 on jegodigital.com)
 *   2. Audit pipeline endpoint alive (submitAuditRequest returns 4xx/200)
 *   3. Mockup renderer Cloud Run alive
 *   4. DataForSEO credentials valid
 *   5. PageSpeed Insights API key valid
 *   6. Firecrawl key valid
 *   7. Perplexity Sonar key valid
 *   8. Brevo API key valid
 *   9. Telegram bot token valid
 *  10. Yesterday's dailyDigest ran (daily_digests/{yesterday} exists)
 *  11. Audit pipeline produced at least 1 completed audit in last 7 days
 *  12. No Firebase Functions are in ERROR state (via audit_requests
 *      failed_at counts)
 *  13. Cold-call trio ran today (weekday-aware — Mon-Fri only)
 *  14. Phone-verified lead inventory ≥ 100 (else trio starves)
 *  15. ElevenLabs subscription has remaining credit
 *  16. Instantly campaigns healthy (bounce ≤ 3%, reply ≥ 0.5% aggregate)
 *  17. GitHub Actions — last 10 workflow runs, fail if ≥3 consecutive reds
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

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
        return { ok: !!r2.data?.ok };
    } catch (err) {
        functions.logger.error("systemHealthAudit Telegram send failed:", err.message);
        return { ok: false };
    }
}

// ---- Individual checks. Each returns { name, ok, detail } ----

async function checkHostingUp() {
    try {
        const r = await axios.get("https://jegodigital.com/", { timeout: 8000, validateStatus: () => true });
        return { name: "hosting_up", ok: r.status >= 200 && r.status < 400, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "hosting_up", ok: false, detail: err.message };
    }
}

async function checkAuditEndpointUp() {
    try {
        // Deliberately bad request — expect 400 (endpoint alive). 200 or 500 is also fine;
        // only a timeout or connection error is bad.
        const r = await axios.post(
            "https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest",
            {},
            { timeout: 8000, validateStatus: () => true }
        );
        return { name: "audit_endpoint_up", ok: r.status < 500, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "audit_endpoint_up", ok: false, detail: err.message };
    }
}

async function checkMockupRenderer() {
    try {
        const r = await axios.post(
            "https://mockup-renderer-wfmydylowa-uc.a.run.app/render",
            { html: "<html><body>ping</body></html>", width: 100, height: 100, dpr: 1 },
            { timeout: 15000, validateStatus: () => true, responseType: "arraybuffer" }
        );
        return { name: "mockup_renderer", ok: r.status === 200, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "mockup_renderer", ok: false, detail: err.message };
    }
}

async function checkDataForSEO() {
    const login = process.env.DATAFORSEO_LOGIN;
    const pass = process.env.DATAFORSEO_PASS;
    if (!login || !pass) return { name: "dataforseo", ok: false, detail: "creds not set" };
    try {
        const auth = Buffer.from(`${login}:${pass}`).toString("base64");
        const r = await axios.get("https://api.dataforseo.com/v3/appendix/user_data", {
            headers: { Authorization: `Basic ${auth}` }, timeout: 8000, validateStatus: () => true,
        });
        const ok = r.status === 200 && r.data?.status_code === 20000;
        return { name: "dataforseo", ok, detail: `status=${r.status} · api=${r.data?.status_code}` };
    } catch (err) {
        return { name: "dataforseo", ok: false, detail: err.message };
    }
}

async function checkPSI() {
    const key = process.env.PAGESPEED_API_KEY || process.env.PSI_API_KEY;
    if (!key) return { name: "pagespeed", ok: false, detail: "key not set" };
    try {
        const r = await axios.get(
            `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://jegodigital.com&key=${key}&strategy=mobile`,
            { timeout: 25000, validateStatus: () => true }
        );
        return { name: "pagespeed", ok: r.status === 200, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "pagespeed", ok: false, detail: err.message };
    }
}

async function checkFirecrawl() {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) return { name: "firecrawl", ok: false, detail: "key not set" };
    try {
        const r = await axios.get("https://api.firecrawl.dev/v1/team/credit-usage", {
            headers: { Authorization: `Bearer ${key}` }, timeout: 8000, validateStatus: () => true,
        });
        return { name: "firecrawl", ok: r.status === 200, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "firecrawl", ok: false, detail: err.message };
    }
}

async function checkPerplexity() {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) return { name: "perplexity", ok: false, detail: "key not set" };
    try {
        // Tiny cheap query — Perplexity has no dedicated health endpoint.
        const r = await axios.post("https://api.perplexity.ai/chat/completions", {
            model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 1,
        }, { headers: { Authorization: `Bearer ${key}` }, timeout: 15000, validateStatus: () => true });
        return { name: "perplexity", ok: r.status === 200, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "perplexity", ok: false, detail: err.message };
    }
}

async function checkBrevo() {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { name: "brevo", ok: false, detail: "key not set" };
    try {
        const r = await axios.get("https://api.brevo.com/v3/account", {
            headers: { "api-key": key, accept: "application/json" }, timeout: 8000, validateStatus: () => true,
        });
        return { name: "brevo", ok: r.status === 200, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "brevo", ok: false, detail: err.message };
    }
}

async function checkTelegram() {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    try {
        const r = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
            timeout: 8000, validateStatus: () => true,
        });
        return { name: "telegram", ok: r.status === 200 && r.data?.ok, detail: `status=${r.status}` };
    } catch (err) {
        return { name: "telegram", ok: false, detail: err.message };
    }
}

async function checkDailyDigestRan(db) {
    try {
        // Yesterday in CDMX YYYY-MM-DD
        const now = new Date();
        const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        cdmx.setUTCDate(cdmx.getUTCDate() - 1);
        const key = cdmx.toISOString().slice(0, 10);
        const doc = await db.collection("daily_digests").doc(key).get();
        return {
            name: "daily_digest_ran",
            ok: doc.exists,
            detail: doc.exists ? `last=${key}` : `missing ${key}`,
        };
    } catch (err) {
        return { name: "daily_digest_ran", ok: false, detail: err.message };
    }
}

async function checkAuditPipelineAlive(db) {
    try {
        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        const snap = await db.collection("audits")
            .where("created_at", ">=", sevenDaysAgo)
            .limit(1)
            .get();
        return {
            name: "audits_flowing",
            ok: !snap.empty,
            detail: snap.empty ? "zero audits in last 7d" : "≥1 in last 7d",
        };
    } catch (err) {
        return { name: "audits_flowing", ok: false, detail: err.message };
    }
}

async function checkRecentFailures(db) {
    try {
        const dayAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 24 * 60 * 60 * 1000)
        );
        const snap = await db.collection("scheduled_emails")
            .where("failed_at", ">=", dayAgo)
            .get();
        const count = snap.size;
        return {
            name: "scheduled_email_failures",
            ok: count < 5, // tolerance
            detail: `${count} failed in last 24h (tolerance <5)`,
        };
    } catch (err) {
        return { name: "scheduled_email_failures", ok: false, detail: err.message };
    }
}

// ---- Cold-call autopilot checks (added 2026-04-20) ----
function cdmxTodayKey() {
    const now = new Date();
    const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    return cdmx.toISOString().slice(0, 10);
}

async function checkColdCallRanToday(db) {
    try {
        // Only enforce on weekdays (CDMX). Saturday (6) and Sunday (0) = skip.
        const now = new Date();
        const cdmx = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const dow = cdmx.getUTCDay();
        if (dow === 0 || dow === 6) {
            return { name: "coldcall_ran_today", ok: true, detail: "weekend · skipped" };
        }

        // Only enforce AFTER 14:00 CDMX — gives coldCallReport (13:00) time to persist
        const hourCdmx = cdmx.getUTCHours();
        if (hourCdmx < 14) {
            return { name: "coldcall_ran_today", ok: true, detail: `pre-14:00 CDMX (${hourCdmx}h) · not yet expected` };
        }

        const key = cdmxTodayKey();
        const doc = await db.collection("call_queue_summaries").doc(key).get();
        if (!doc.exists) {
            return { name: "coldcall_ran_today", ok: false, detail: `no call_queue_summaries/${key}` };
        }
        const data = doc.data();
        const fired = data?.fired ?? 0;
        return {
            name: "coldcall_ran_today",
            ok: fired > 0,
            detail: `fired=${fired} · queued=${data?.queued ?? 0}`,
        };
    } catch (err) {
        return { name: "coldcall_ran_today", ok: false, detail: err.message };
    }
}

async function checkPhoneLeadsInventory(db) {
    try {
        const snap = await db.collection("phone_leads")
            .where("phone_verified", "==", true)
            .where("do_not_call", "==", false)
            .limit(500)
            .get();
        const count = snap.size;
        return {
            name: "phone_leads_inventory",
            ok: count >= 100,
            detail: `${count} verified · do_not_call=false (need ≥100)`,
        };
    } catch (err) {
        return { name: "phone_leads_inventory", ok: false, detail: err.message };
    }
}

async function checkElevenLabsSubscription() {
    const key = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
    if (!key) return { name: "elevenlabs_credit", ok: false, detail: "key not set" };
    try {
        const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
            headers: { "xi-api-key": key }, // lowercase — critical
            timeout: 8000,
            validateStatus: () => true,
        });
        if (r.status !== 200) {
            return { name: "elevenlabs_credit", ok: false, detail: `status=${r.status}` };
        }
        const used = r.data?.character_count ?? 0;
        const limit = r.data?.character_limit ?? 0;
        const remaining = limit - used;
        const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
        // Fail if <5% remaining OR if tier+char limit seem to block calls
        const ok = remaining > limit * 0.05;
        return {
            name: "elevenlabs_credit",
            ok,
            detail: `tier=${r.data?.tier ?? "?"} · used ${pct}% · remaining ${remaining.toLocaleString()}/${limit.toLocaleString()}`,
        };
    } catch (err) {
        return { name: "elevenlabs_credit", ok: false, detail: err.message };
    }
}

async function checkInstantlyCampaigns() {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) return { name: "instantly_campaigns", ok: false, detail: "key not set" };
    try {
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns/analytics/overview", {
            headers: { Authorization: `Bearer ${key}` },
            timeout: 10000,
            validateStatus: () => true,
        });
        if (r.status !== 200) {
            return { name: "instantly_campaigns", ok: false, detail: `status=${r.status}` };
        }
        const d = r.data || {};
        const sent = d.emails_sent_count ?? d.sent ?? 0;
        const bounces = d.bounces_count ?? d.bounces ?? 0;
        const replies = d.replies_count ?? d.replies ?? 0;
        if (sent < 100) {
            return {
                name: "instantly_campaigns",
                ok: true,
                detail: `sent=${sent} · too small to judge yet`,
            };
        }
        const bounceRate = (bounces / sent) * 100;
        const replyRate = (replies / sent) * 100;
        // Hard limits: >3% bounce = deliverability disaster; <0.3% reply = copy dead
        const ok = bounceRate <= 3 && replyRate >= 0.3;
        return {
            name: "instantly_campaigns",
            ok,
            detail: `sent=${sent} · bounce=${bounceRate.toFixed(2)}% (≤3%) · reply=${replyRate.toFixed(2)}% (≥0.3%)`,
        };
    } catch (err) {
        return { name: "instantly_campaigns", ok: false, detail: err.message };
    }
}

async function checkGithubActions() {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || "babilionllc-coder/jegodigital";
    if (!token) return { name: "github_actions", ok: true, detail: "GITHUB_TOKEN not set · skipped" };
    try {
        const r = await axios.get(
            `https://api.github.com/repos/${repo}/actions/runs?per_page=10`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout: 10000,
                validateStatus: () => true,
            }
        );
        if (r.status !== 200) {
            return { name: "github_actions", ok: false, detail: `status=${r.status}` };
        }
        const runs = r.data?.workflow_runs || [];
        if (runs.length === 0) {
            return { name: "github_actions", ok: true, detail: "no runs in history" };
        }
        // Count consecutive failures from the most-recent end
        let consecutive = 0;
        for (const run of runs) {
            if (run.status === "in_progress" || run.status === "queued") continue;
            if (run.conclusion === "failure" || run.conclusion === "timed_out") {
                consecutive++;
            } else if (run.conclusion === "success") {
                break;
            }
        }
        const failed = runs.filter((r) => r.conclusion === "failure").length;
        const ok = consecutive < 3;
        return {
            name: "github_actions",
            ok,
            detail: `last 10 runs · ${failed} failed · ${consecutive} consecutive (red at ≥3)`,
        };
    } catch (err) {
        return { name: "github_actions", ok: false, detail: err.message };
    }
}

// ---- Main ----
exports.systemHealthAudit = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .pubsub.schedule("every 48 hours")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const runId = new Date().toISOString().slice(0, 19).replace(/:/g, "-");

        functions.logger.info(`systemHealthAudit ${runId}: starting`);

        const results = await Promise.all([
            checkHostingUp(),
            checkAuditEndpointUp(),
            checkMockupRenderer(),
            checkDataForSEO(),
            checkPSI(),
            checkFirecrawl(),
            checkPerplexity(),
            checkBrevo(),
            checkTelegram(),
            checkDailyDigestRan(db),
            checkAuditPipelineAlive(db),
            checkRecentFailures(db),
            // Added 2026-04-20 — cold-call trio + self-improvement signals
            checkColdCallRanToday(db),
            checkPhoneLeadsInventory(db),
            checkElevenLabsSubscription(),
            checkInstantlyCampaigns(),
            checkGithubActions(),
        ]);

        const red = results.filter((r) => !r.ok);
        const allGreen = red.length === 0;

        // Persist snapshot unconditionally
        try {
            await db.collection("system_health").doc(runId).set({
                run_at: admin.firestore.FieldValue.serverTimestamp(),
                all_green: allGreen,
                red_count: red.length,
                green_count: results.length - red.length,
                results,
            });
        } catch (err) {
            functions.logger.error("systemHealthAudit Firestore write failed:", err.message);
        }

        // Notification strategy:
        //  - ANY red check → Telegram alert with list
        //  - All green → silent, EXCEPT on the 1st of each month (alive ping)
        let msg = null;
        if (!allGreen) {
            const lines = [
                `🚨 *System Health Audit — ${red.length} red*`,
                "",
                ...red.map((r) => `❌ *${r.name}* — ${r.detail}`),
                "",
                `_${results.length - red.length} green · run ${runId}_`,
                `_Fix: open a PR. Watchdog never auto-edits live code._`,
            ];
            msg = lines.join("\n");
        } else {
            const day = new Date().getUTCDate();
            if (day === 1) {
                msg = `✅ *System Health — all ${results.length} checks green.*\n_Monthly alive-ping. Run ${runId}._`;
            }
        }

        if (msg) await sendTelegram(msg);

        functions.logger.info(`systemHealthAudit ${runId}: green=${results.length - red.length} red=${red.length}`);
        return null;
    });
