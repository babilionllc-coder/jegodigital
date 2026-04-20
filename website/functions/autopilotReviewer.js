/**
 * autopilotReviewer — weekly self-improvement pass.
 *
 * Runs Sunday 20:00 CDMX. Pulls last 7 days of every relevant
 * Firestore collection, computes trends + best/worst performers,
 * writes the review to `autopilot_reviews/{YYYY-WW}`, and posts
 * a concrete Telegram summary with recommended actions.
 *
 * The report is DETERMINISTIC — no LLM call. All signals come
 * from Firestore history. An LLM-enriched pass can layer on top
 * later once ANTHROPIC_API_KEY is wired in env; until then the
 * programmatic view is already actionable.
 *
 * Schedule: `0 20 * * 0` / timezone `America/Mexico_City`
 *
 * Reads:
 *   daily_digests/{YYYY-MM-DD}           — 7 most recent
 *   system_health/{runId}                — 7 days of watchdog snapshots
 *   call_queue_summaries/{YYYY-MM-DD}    — cold-call trio output
 *   call_analysis/{convId}               — per-offer conversion
 *   audit_requests                       — audits by source
 *
 * Writes:
 *   autopilot_reviews/{YYYY-WW}          — full review snapshot
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
        // Telegram message limit is 4096 chars — split if needed
        const chunks = [];
        for (let i = 0; i < text.length; i += 3800) chunks.push(text.slice(i, i + 3800));
        for (const chunk of chunks) {
            const r = await axios.post(url, {
                chat_id: chatId, text: chunk, parse_mode: "Markdown", disable_web_page_preview: true,
            }, { timeout: 10000 });
            if (!r.data?.ok) {
                await axios.post(url, { chat_id: chatId, text: chunk }, { timeout: 10000 });
            }
        }
        return { ok: true };
    } catch (err) {
        functions.logger.error("autopilotReviewer Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- Date helpers ----
function cdmxNow() {
    const now = new Date();
    return new Date(now.getTime() - 6 * 60 * 60 * 1000);
}
function cdmxDateKey(d) {
    return d.toISOString().slice(0, 10);
}
function isoWeekKey(d) {
    // ISO week: year + 2-digit week number (e.g. 2026-16)
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${target.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function last7DateKeys() {
    const today = cdmxNow();
    const keys = [];
    for (let i = 1; i <= 7; i++) {
        const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        keys.push(cdmxDateKey(d));
    }
    return keys;
}

// ---- Data collectors ----
async function fetchDigests(db, keys) {
    const docs = await Promise.all(
        keys.map((k) => db.collection("daily_digests").doc(k).get().catch(() => null))
    );
    return docs.filter((d) => d && d.exists).map((d) => ({ key: d.id, ...d.data() }));
}

async function fetchHealthSnapshots(db) {
    try {
        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        const snap = await db.collection("system_health")
            .where("run_at", ">=", sevenDaysAgo)
            .orderBy("run_at", "asc")
            .limit(100)
            .get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
        functions.logger.warn("fetchHealthSnapshots failed:", err.message);
        return [];
    }
}

async function fetchCallSummaries(db, keys) {
    const docs = await Promise.all(
        keys.map((k) => db.collection("call_queue_summaries").doc(k).get().catch(() => null))
    );
    return docs.filter((d) => d && d.exists).map((d) => ({ key: d.id, ...d.data() }));
}

async function fetchOfferConversion(db) {
    try {
        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        const snap = await db.collection("call_analysis")
            .where("created_at", ">=", sevenDaysAgo)
            .limit(2000)
            .get();
        const byOffer = { A: { total: 0, positive: 0 }, B: { total: 0, positive: 0 }, C: { total: 0, positive: 0 } };
        snap.forEach((doc) => {
            const d = doc.data();
            const off = d.offer;
            if (!byOffer[off]) return;
            byOffer[off].total++;
            const o = (d.outcome || "").toLowerCase();
            if (o.includes("positive") || o.includes("interested") || o === "yes") byOffer[off].positive++;
        });
        return byOffer;
    } catch (err) {
        functions.logger.warn("fetchOfferConversion failed:", err.message);
        return null;
    }
}

async function fetchAuditsBySource(db) {
    try {
        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        const snap = await db.collection("audit_requests")
            .where("created_at", ">=", sevenDaysAgo)
            .limit(2000)
            .get();
        const bySource = {};
        snap.forEach((doc) => {
            const src = doc.data().source || "unknown";
            bySource[src] = (bySource[src] || 0) + 1;
        });
        return { total: snap.size, bySource };
    } catch (err) {
        functions.logger.warn("fetchAuditsBySource failed:", err.message);
        return null;
    }
}

// ---- Analysis ----
function sumMetric(digests, path) {
    // path like "calls.total" — safe-navigate nested digests
    return digests.reduce((acc, d) => {
        const parts = path.split(".");
        let v = d;
        for (const p of parts) v = v?.[p];
        return acc + (typeof v === "number" ? v : 0);
    }, 0);
}

function computeHealthPatterns(snapshots) {
    // For each check name, how many runs were red this week?
    const redCount = {};
    let totalRuns = 0;
    snapshots.forEach((snap) => {
        totalRuns++;
        (snap.results || []).forEach((r) => {
            if (!r.ok) redCount[r.name] = (redCount[r.name] || 0) + 1;
        });
    });
    return { totalRuns, redCount };
}

function computeOfferWinner(byOffer) {
    if (!byOffer) return null;
    const rows = Object.entries(byOffer)
        .filter(([, v]) => v.total > 0)
        .map(([offer, v]) => ({
            offer,
            total: v.total,
            positive: v.positive,
            rate: v.total > 0 ? v.positive / v.total : 0,
        }))
        .sort((a, b) => b.rate - a.rate);
    return rows;
}

function rec(lines, observations) {
    // Derive 3 concrete recommendations from the observations object.
    const recs = [];

    // 1. Offer rotation
    if (observations.offerRows && observations.offerRows.length >= 2) {
        const [best, ...rest] = observations.offerRows;
        const worst = rest[rest.length - 1];
        if (best.total >= 20 && worst.total >= 20 && best.rate > worst.rate * 1.5) {
            const bestPct = (best.rate * 100).toFixed(1);
            const worstPct = (worst.rate * 100).toFixed(1);
            recs.push(
                `Shift cold-call rotation toward Offer ${best.offer} — ${bestPct}% positive vs Offer ${worst.offer} at ${worstPct}% over ${best.total + worst.total} calls. Consider 50/30/20 weight in coldCallPrep.`
            );
        }
    }

    // 2. Funnel source winner
    if (observations.auditsBySource) {
        const entries = Object.entries(observations.auditsBySource).sort((a, b) => b[1] - a[1]);
        if (entries.length > 0 && entries[0][1] > 0) {
            const [topSrc, topCount] = entries[0];
            const total = entries.reduce((s, [, c]) => s + c, 0);
            const pct = ((topCount / total) * 100).toFixed(0);
            recs.push(
                `Audit funnel: *${topSrc}* drove ${topCount}/${total} (${pct}%) audits this week. Lean budget + time into the winner, audit the underperformers.`
            );
        }
    }

    // 3. Watchdog repeat offenders → should become actionable fixes
    if (observations.healthPatterns && Object.keys(observations.healthPatterns.redCount).length > 0) {
        const topRed = Object.entries(observations.healthPatterns.redCount).sort((a, b) => b[1] - a[1])[0];
        recs.push(
            `Watchdog repeat offender: *${topRed[0]}* went red ${topRed[1]}× this week. Not a glitch — open a PR to fix the root cause before it becomes a broken habit.`
        );
    }

    // 4. Cron silence
    if (observations.coldCallDaysRun < observations.coldCallDaysExpected) {
        recs.push(
            `Cold-call trio ran ${observations.coldCallDaysRun}/${observations.coldCallDaysExpected} weekday sessions. Missing runs should be investigated — check Cloud Scheduler + GitHub Actions deploy history.`
        );
    }

    // 5. Inventory
    if (observations.phoneLeadsLow) {
        recs.push(
            `Phone-verified lead inventory is thinning — under 150 usable. Schedule a lead-finder-v4 run in the next 48h to keep coldCallPrep fed.`
        );
    }

    if (recs.length === 0) {
        recs.push("Nothing surfaced this week — system is steady. Consider raising ambition: expand offer variants, push batch size, add a new outbound channel.");
    }

    return recs.slice(0, 3);
}

// ---- Optional LLM enrichment ----
//
// When ANTHROPIC_API_KEY is set, this asks Claude to spot non-obvious patterns
// the deterministic rules miss (e.g. "Offer C books more Calendly but Offer A
// gets 2x more audits — implies a speed-to-lead gap", "spam bounces on Thursdays
// only → your Thursday batch template is cooking"). Returns a short array of
// bullet strings, or null on any failure. Never blocks the Telegram send.
//
// Budget: 1 call per week, ~1000 input tokens → cost <$0.01. Cheap insurance.
async function enrichWithLLM(observations, recommendations) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    // Only send condensed numeric observations — never raw contact data. Privacy
    // by construction: LLM never sees emails, phone numbers, or lead PII.
    const safePayload = {
        totals: observations.totals,
        offer_rows: observations.offerRows,
        audits_by_source: observations.auditsBySource,
        health_red_count: observations.healthPatterns?.redCount,
        health_total_runs: observations.healthPatterns?.totalRuns,
        cold_call_days_run: observations.coldCallDaysRun,
        cold_call_days_expected: observations.coldCallDaysExpected,
        phone_leads_count: observations.phoneLeadsCount,
        digest_days_seen: observations.digestDaysSeen,
        existing_recommendations: recommendations,
    };

    const prompt = `You are the Critical Auditor for JegoDigital, a 1-person AI-powered real estate marketing agency. Below is a JSON snapshot of the last 7 days of operational metrics (cold calls, cold email, Calendly bookings, audit funnel, Brevo, watchdog).

The system already surfaced these programmatic recommendations:
${(recommendations || []).map((r, i) => `${i + 1}. ${r}`).join("\n") || "(none)"}

Your job: find 2-3 NON-OBVIOUS patterns or risks the programmatic rules missed. Look for:
- Counter-intuitive correlations (e.g. more replies but fewer bookings = funnel leak)
- Week-over-week trajectory implied by the totals
- Cross-metric signals (e.g. low audits + high calls = audit pipeline broken)
- Anything suggesting a structural issue vs a random bad week

DO NOT restate obvious totals. DO NOT repeat the existing recommendations. Output 2-3 bullet lines, each under 160 chars, each starting with a concrete pattern then its implication. Zero preamble, zero markdown headers.

Data:
${JSON.stringify(safePayload, null, 2)}`;

    try {
        const r = await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
                model: "claude-haiku-4-5-20251001",
                max_tokens: 500,
                messages: [{ role: "user", content: prompt }],
            },
            {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout: 25000,
            }
        );
        const text = r.data?.content?.[0]?.text || "";
        const bullets = text
            .split("\n")
            .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
            .filter((l) => l.length > 0 && l.length < 400);
        return bullets.slice(0, 3);
    } catch (err) {
        functions.logger.warn("enrichWithLLM failed:", err.response?.data || err.message);
        return null;
    }
}

// ---- Main ----
exports.autopilotReviewer = functions
    .runWith({ timeoutSeconds: 240, memory: "512MB" })
    .pubsub.schedule("0 20 * * 0")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const now = cdmxNow();
        const weekKey = isoWeekKey(now);
        const dateKeys = last7DateKeys();

        functions.logger.info(`autopilotReviewer ${weekKey}: compiling 7-day review`);

        const [digests, healthSnaps, callSummaries, offerByOffer, auditsBySource] = await Promise.all([
            fetchDigests(db, dateKeys),
            fetchHealthSnapshots(db),
            fetchCallSummaries(db, dateKeys),
            fetchOfferConversion(db),
            fetchAuditsBySource(db),
        ]);

        // ---- Roll-ups ----
        const totals = {
            calls_total: sumMetric(digests, "calls.total"),
            calls_positive: sumMetric(digests, "calls.positive"),
            audits_total: sumMetric(digests, "audits.total"),
            instantly_sent: sumMetric(digests, "instantly.sent"),
            instantly_replies: sumMetric(digests, "instantly.replies"),
            instantly_bounces: sumMetric(digests, "instantly.bounces"),
            calendly_booked: sumMetric(digests, "calendly.booked"),
            calendly_noshow: sumMetric(digests, "calendly.noshow"),
            emails_sent: sumMetric(digests, "emails.sent"),
            emails_failed: sumMetric(digests, "emails.failed"),
        };

        const healthPatterns = computeHealthPatterns(healthSnaps);
        const offerRows = computeOfferWinner(offerByOffer);

        // Count weekday cold-call runs (expected: # of weekdays in last 7 days = 5 normally)
        let coldCallDaysRun = 0;
        let coldCallDaysExpected = 0;
        const today = cdmxNow();
        for (let i = 1; i <= 7; i++) {
            const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
            const dow = d.getUTCDay();
            if (dow >= 1 && dow <= 5) coldCallDaysExpected++;
        }
        callSummaries.forEach((s) => { if (s.run_at) coldCallDaysRun++; });

        // Phone leads inventory (real-time, not week-averaged)
        let phoneLeadsLow = false;
        let phoneLeadsCount = null;
        try {
            const snap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .limit(500)
                .get();
            phoneLeadsCount = snap.size;
            phoneLeadsLow = snap.size < 150;
        } catch (err) {
            functions.logger.warn("phone_leads count failed:", err.message);
        }

        const observations = {
            totals,
            healthPatterns,
            offerRows,
            auditsBySource: auditsBySource?.bySource,
            coldCallDaysRun,
            coldCallDaysExpected,
            phoneLeadsLow,
            phoneLeadsCount,
            digestDaysSeen: digests.length,
        };

        const recommendations = rec([], observations);

        // ---- Render Telegram report ----
        const fmt = (n) => (n === null || n === undefined) ? "—" : n.toLocaleString("en-US");
        const lines = [];
        lines.push(`🧠 *Autopilot Weekly Review — week ${weekKey}*`);
        lines.push(`_7 days ending ${cdmxDateKey(now)} CDMX · ${digests.length}/7 digests found_`);
        lines.push("");

        lines.push(`*Totals (last 7 days)*`);
        lines.push(`   Calls: ${fmt(totals.calls_total)} · 🔥 ${fmt(totals.calls_positive)} positive`);
        lines.push(`   Cold email: sent ${fmt(totals.instantly_sent)} · replies ${fmt(totals.instantly_replies)} · bounces ${fmt(totals.instantly_bounces)}`);
        lines.push(`   Audits fired: ${fmt(totals.audits_total)}`);
        lines.push(`   Calendly: 📌 ${fmt(totals.calendly_booked)} booked · 🕳️ ${fmt(totals.calendly_noshow)} no-show`);
        lines.push(`   Brevo queue: sent ${fmt(totals.emails_sent)} · failed ${fmt(totals.emails_failed)}`);
        lines.push("");

        if (offerRows && offerRows.length > 0) {
            lines.push(`*Cold-call offer conversion (7d)*`);
            offerRows.forEach((r) => {
                const pct = (r.rate * 100).toFixed(1);
                lines.push(`   Offer ${r.offer}: ${r.positive}/${r.total} positive · *${pct}%*`);
            });
            lines.push("");
        }

        if (auditsBySource?.bySource) {
            lines.push(`*Audit sources (7d)*`);
            const entries = Object.entries(auditsBySource.bySource).sort((a, b) => b[1] - a[1]);
            entries.forEach(([src, count]) => lines.push(`   ${src}: ${count}`));
            lines.push("");
        }

        lines.push(`*Watchdog rollup*`);
        lines.push(`   Runs this week: ${healthPatterns.totalRuns}`);
        if (Object.keys(healthPatterns.redCount).length === 0) {
            lines.push(`   All checks green ✅`);
        } else {
            Object.entries(healthPatterns.redCount).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
                lines.push(`   ❌ ${name}: red ${count}×`);
            });
        }
        lines.push("");

        lines.push(`*Cron execution*`);
        lines.push(`   Cold-call sessions: ${coldCallDaysRun}/${coldCallDaysExpected} weekdays`);
        lines.push(`   Digests written: ${digests.length}/7 days`);
        lines.push(`   Phone leads inventory: ${phoneLeadsCount ?? "—"} ${phoneLeadsLow ? "🚨 LOW" : ""}`);
        lines.push("");

        lines.push(`*Recommended actions*`);
        recommendations.forEach((r, i) => lines.push(`   ${i + 1}. ${r}`));

        // Optional LLM pass — additive, never replaces programmatic recs.
        // Runs last so a flaky API call can't break the deterministic report.
        const llmBullets = await enrichWithLLM(observations, recommendations);
        if (llmBullets && llmBullets.length > 0) {
            lines.push("");
            lines.push(`*🧩 Pattern watch (LLM pass)*`);
            llmBullets.forEach((b, i) => lines.push(`   ${i + 1}. ${b}`));
        }

        const reportText = lines.join("\n");

        // ---- Persist snapshot ----
        try {
            await db.collection("autopilot_reviews").doc(weekKey).set({
                week: weekKey,
                generated_at: admin.firestore.FieldValue.serverTimestamp(),
                observations,
                recommendations,
                llm_bullets: llmBullets || null,
                llm_enabled: !!process.env.ANTHROPIC_API_KEY,
                report_text: reportText,
            });
        } catch (err) {
            functions.logger.error("autopilot_reviews write failed:", err.message);
        }

        await sendTelegram(reportText);

        functions.logger.info(`autopilotReviewer ${weekKey}: shipped`);
        return null;
    });
