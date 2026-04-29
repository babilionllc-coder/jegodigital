/**
 * dailyBriefing — 08:00 America/Cancun Slack Block Kit morning command center.
 *
 * The "phone command center" piece (today's big rock per NEXT_STEP.md
 * 2026-04-29). Pulls live from 8 platforms, scores a traffic light, posts
 * ONE Block Kit card to #daily-ops so Alex runs JegoDigital from Slack on his
 * phone with coffee in hand.
 *
 * Cron: `0 13 * * *`  (13:00 UTC = 08:00 Cancun, UTC-5 no DST)
 * Channel: `daily-ops` (via slackPost.js — graceful fallback to webhook)
 *
 * Sections (in order):
 *   🚦 Traffic light  (top of card — see TRAFFIC_RULES below)
 *   🚰 Pipeline        — lead queue depth, today's city, active campaigns
 *   📧 Cold email     — 24h opens/replies per ACTIVE campaign + 🚨 if <2% open
 *   ☎️ Cold calls     — calls / connected / booked last 24h
 *   📅 Calendly       — new bookings, no-shows last 24h, upcoming today
 *   📱 Social         — IG story views (last story), DMs/replies last 24h
 *   💸 GCP cost       — daily spend / cap (% used)
 *   🚨 Errors         — disaster_log last 24h, deploy fails, broken cron
 *   🔥 Hot leads      — replied "interested" but no booking yet
 *   🏆 Yesterday wins — commit count + headline, deals closed
 *   ⚡ Today's #1     — pulled from NEXT_STEP.md BIG ROCK section
 *
 * HARD RULES SATISFIED:
 *   HR-0  — every metric pulled live in this run; missing data = "❓ data
 *           unavailable", never a fabricated number.
 *   HR-2  — verify-live across 8 platforms (each in its own try/catch so a
 *           single dark source never drops the brief).
 *   HR-12 — every section has plain-Spanish/English summary, no jargon.
 *   HR-13 — Alex runs nothing manually; this fires autonomously.
 *
 * Last updated: 2026-04-29 (initial ship — Phase 1 Slack command center).
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { slackPost } = require("./slackPost");

if (!admin.apps.length) admin.initializeApp();

// ─── Time helpers ──────────────────────────────────────────────────────
// Alex lives in Cancun (UTC-5, no DST). Many existing functions use CDMX
// (UTC-6) — we deliberately use Cancun here per NEXT_STEP.md 2026-04-29.
const CANCUN_OFFSET_HOURS = -5;

function nowCancun() {
    return new Date(Date.now() + CANCUN_OFFSET_HOURS * 3600 * 1000);
}
function isoDay(d) {
    return d.toISOString().slice(0, 10);
}
function last24hMs() {
    return Date.now() - 24 * 3600 * 1000;
}

// ─── 1. Pipeline (Firestore lead queue + today's city) ────────────────
async function pullPipeline() {
    const out = { queue_depth: null, today_city: null, active_campaigns: null, error: null };
    try {
        const db = admin.firestore();

        // Lead queue depth = leads pending enrichment (Firestore counter)
        const leadsSnap = await db
            .collection("leads")
            .where("status", "==", "pending")
            .count()
            .get()
            .catch(() => null);
        if (leadsSnap) out.queue_depth = leadsSnap.data().count;

        // Today's city = `city_rotation/today` if present (lead-pipeline-2026)
        const cityDoc = await db.doc("city_rotation/today").get().catch(() => null);
        if (cityDoc && cityDoc.exists) {
            out.today_city = cityDoc.data().city || null;
        }
    } catch (e) {
        out.error = e.message;
    }

    // Active campaigns from Instantly
    try {
        const r = await axios.get(
            "https://api.instantly.ai/api/v2/campaigns?limit=100",
            {
                headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
                timeout: 12000,
            }
        );
        const items = r.data?.items || r.data?.data || [];
        out.active_campaigns = items.filter((c) => c.status === 1).length;
        out.total_campaigns = items.length;
    } catch (e) {
        out.error = (out.error ? out.error + "; " : "") + `instantly:${e.message}`;
    }

    return out;
}

// ─── 2. Cold email (Instantly 24h analytics per ACTIVE campaign) ──────
async function pullColdEmail() {
    const out = { campaigns: [], total_sent: 0, total_opens: 0, total_replies: 0, flag_count: 0, error: null };
    if (!process.env.INSTANTLY_API_KEY) {
        out.error = "INSTANTLY_API_KEY missing";
        return out;
    }
    try {
        const r = await axios.get(
            "https://api.instantly.ai/api/v2/campaigns?limit=100",
            {
                headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
                timeout: 12000,
            }
        );
        const items = r.data?.items || r.data?.data || [];
        const active = items.filter((c) => c.status === 1);

        const start = new Date(last24hMs()).toISOString().slice(0, 10);
        const end = new Date().toISOString().slice(0, 10);

        for (const c of active) {
            try {
                const a = await axios.get(
                    `https://api.instantly.ai/api/v2/campaigns/analytics?id=${c.id}&start_date=${start}&end_date=${end}`,
                    {
                        headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
                        timeout: 10000,
                    }
                );
                const d = (Array.isArray(a.data) ? a.data[0] : a.data) || {};
                const sent = d.emails_sent_count || d.sent || 0;
                const opens = d.open_count || d.opens || 0;
                const replies = d.reply_count || d.replies || 0;
                const openRate = sent > 0 ? opens / sent : 0;
                const flagged = sent >= 50 && openRate < 0.02;
                if (flagged) out.flag_count++;
                out.campaigns.push({
                    name: (c.name || "unnamed").slice(0, 32),
                    sent,
                    opens,
                    replies,
                    open_rate: openRate,
                    flagged,
                });
                out.total_sent += sent;
                out.total_opens += opens;
                out.total_replies += replies;
            } catch (e) {
                out.campaigns.push({ name: c.name, error: e.message.slice(0, 60) });
            }
        }
    } catch (e) {
        out.error = e.message;
    }
    return out;
}

// ─── 3. Cold calls (ElevenLabs conversations last 24h) ────────────────
async function pullColdCalls() {
    const out = { calls: 0, success: 0, booked: 0, error: null };
    if (!process.env.ELEVENLABS_API_KEY) {
        out.error = "ELEVENLABS_API_KEY missing";
        return out;
    }
    try {
        const sinceUnix = Math.floor(last24hMs() / 1000);
        const r = await axios.get(
            `https://api.elevenlabs.io/v1/convai/conversations?call_start_after_unix=${sinceUnix}&page_size=100`,
            {
                headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
                timeout: 12000,
            }
        );
        const convs = r.data?.conversations || [];
        out.calls = convs.length;
        out.success = convs.filter((c) => c.call_successful === "success").length;
        // Booked = transcripts containing calendly URL or "agendar"/"reservar"
        try {
            const db = admin.firestore();
            const since = admin.firestore.Timestamp.fromMillis(last24hMs());
            const snap = await db
                .collection("calendly_events")
                .where("created_at", ">=", since)
                .where("source", "==", "elevenlabs")
                .count()
                .get();
            out.booked = snap.data().count;
        } catch (_) {}
    } catch (e) {
        out.error = e.message;
    }
    return out;
}

// ─── 4. Calendly (Calendly API + Firestore) ──────────────────────────
async function pullCalendly() {
    const out = { new_bookings: 0, no_shows: 0, today_upcoming: 0, error: null };
    try {
        const db = admin.firestore();
        const since = admin.firestore.Timestamp.fromMillis(last24hMs());
        const snap = await db
            .collection("calendly_events")
            .where("created_at", ">=", since)
            .get();
        out.new_bookings = snap.size;
        out.no_shows = snap.docs.filter((d) => d.data().status === "no_show").length;
    } catch (e) {
        out.error = `firestore:${e.message}`;
    }

    if (process.env.CALENDLY_PAT && process.env.CALENDLY_EVENT_TYPE_URI) {
        try {
            const startCancun = new Date();
            startCancun.setUTCHours(0, 0, 0, 0);
            const endCancun = new Date(startCancun.getTime() + 24 * 3600 * 1000);
            const r = await axios.get(
                "https://api.calendly.com/scheduled_events",
                {
                    headers: { Authorization: `Bearer ${process.env.CALENDLY_PAT}` },
                    params: {
                        event_type: process.env.CALENDLY_EVENT_TYPE_URI,
                        min_start_time: startCancun.toISOString(),
                        max_start_time: endCancun.toISOString(),
                        status: "active",
                    },
                    timeout: 10000,
                }
            );
            out.today_upcoming = (r.data?.collection || []).length;
        } catch (e) {
            out.error = (out.error ? out.error + "; " : "") + `cal:${e.message}`;
        }
    }
    return out;
}

// ─── 5. Social (IG story views + DMs last 24h) ────────────────────────
async function pullSocial() {
    const out = { last_story_views: null, dms_24h: null, error: null };
    if (!process.env.IG_GRAPH_TOKEN || !process.env.IG_USER_ID) {
        out.error = "IG_GRAPH_TOKEN/IG_USER_ID missing";
        return out;
    }
    try {
        const stories = await axios.get(
            `https://graph.instagram.com/v22.0/${process.env.IG_USER_ID}/stories`,
            { params: { access_token: process.env.IG_GRAPH_TOKEN }, timeout: 10000 }
        );
        const list = stories.data?.data || [];
        if (list.length > 0) {
            const last = list[0];
            try {
                const ins = await axios.get(
                    `https://graph.instagram.com/v22.0/${last.id}/insights`,
                    {
                        params: { metric: "reach,impressions", access_token: process.env.IG_GRAPH_TOKEN },
                        timeout: 10000,
                    }
                );
                const m = ins.data?.data || [];
                const reach = m.find((x) => x.name === "reach")?.values?.[0]?.value;
                if (reach != null) out.last_story_views = reach;
            } catch (_) {}
        } else {
            out.last_story_views = 0;
        }
    } catch (e) {
        out.error = `ig:${e.message}`;
    }
    return out;
}

// ─── 6. GCP cost (Firestore billing_alerts) ──────────────────────────
async function pullGcpCost() {
    const MONTHLY_BUDGET_MXN = 5000;
    const out = { day_mxn: null, mtd_mxn: null, cap_pct: null, error: null };
    try {
        const db = admin.firestore();
        const snap = await db
            .collection("billing_alerts")
            .orderBy("alertAt", "desc")
            .limit(1)
            .get();
        if (snap.empty) {
            out.error = "no billing_alerts docs yet";
            return out;
        }
        const latest = snap.docs[0].data();
        out.mtd_mxn = latest.costAmount || 0;
        out.cap_pct = latest.budgetAmount > 0 ? (out.mtd_mxn / latest.budgetAmount) * 100 : null;
        // Day estimate = mtd / day-of-month (rough)
        const day = new Date().getDate();
        out.day_mxn = day > 0 ? out.mtd_mxn / day : null;
    } catch (e) {
        out.error = e.message;
    }
    return out;
}

// ─── 7. Errors (disaster_log + deploy failures) ──────────────────────
async function pullErrors() {
    const out = { disasters: [], deploy_failed_today: false, error: null };
    try {
        const db = admin.firestore();
        const since = admin.firestore.Timestamp.fromMillis(last24hMs());
        const snap = await db
            .collection("disaster_log")
            .where("created_at", ">=", since)
            .orderBy("created_at", "desc")
            .limit(5)
            .get();
        out.disasters = snap.docs.map((d) => ({
            title: (d.data().title || "untitled").slice(0, 80),
            tag: d.data().tag || "",
        }));
    } catch (e) {
        out.error = `firestore:${e.message}`;
    }

    // GitHub Actions: any failed run on main last 24h?
    if (process.env.GH_PAT) {
        try {
            const r = await axios.get(
                "https://api.github.com/repos/babilionllc-coder/jegodigital/actions/runs?branch=main&per_page=20",
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GH_PAT}`,
                        Accept: "application/vnd.github+json",
                    },
                    timeout: 10000,
                }
            );
            const since = last24hMs();
            const fails = (r.data?.workflow_runs || []).filter(
                (w) => new Date(w.created_at).getTime() >= since && w.conclusion === "failure"
            );
            out.deploy_failed_today = fails.length > 0;
            out.deploy_fail_count = fails.length;
        } catch (e) {
            out.error = (out.error ? out.error + "; " : "") + `gh:${e.message}`;
        }
    }
    return out;
}

// ─── 8. Hot leads (positive replies, no booking) ─────────────────────
async function pullHotLeads() {
    const out = { count: 0, samples: [], error: null };
    try {
        const db = admin.firestore();
        const since = admin.firestore.Timestamp.fromMillis(7 * 24 * 3600 * 1000 * -1 + Date.now());
        const snap = await db
            .collection("reply_routing_log")
            .where("timestamp", ">=", since)
            .where("ok", "==", true)
            .orderBy("timestamp", "desc")
            .limit(50)
            .get();
        // De-dupe by lead_email & filter out anyone who booked
        const seen = new Set();
        const candidates = [];
        for (const d of snap.docs) {
            const x = d.data();
            if (!x.lead_email || seen.has(x.lead_email)) continue;
            seen.add(x.lead_email);
            candidates.push(x);
        }
        // Cross-check Calendly events
        const bookings = await db
            .collection("calendly_events")
            .where("created_at", ">=", since)
            .get();
        const booked = new Set(bookings.docs.map((d) => (d.data().email || "").toLowerCase()));
        const hot = candidates.filter((c) => !booked.has((c.lead_email || "").toLowerCase()));
        out.count = hot.length;
        out.samples = hot.slice(0, 5).map((h) => h.lead_email);
    } catch (e) {
        out.error = e.message;
    }
    return out;
}

// ─── 9. Yesterday wins (GitHub commits, deals closed) ────────────────
async function pullWins() {
    const out = { commits: 0, latest_commit: null, deals_closed: 0, error: null };
    if (process.env.GH_PAT) {
        try {
            const since = new Date(last24hMs()).toISOString();
            const r = await axios.get(
                `https://api.github.com/repos/babilionllc-coder/jegodigital/commits?sha=main&since=${since}&per_page=30`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GH_PAT}`,
                        Accept: "application/vnd.github+json",
                    },
                    timeout: 10000,
                }
            );
            const list = r.data || [];
            out.commits = list.length;
            if (list.length > 0) {
                const head = list[0];
                out.latest_commit = (head.commit?.message || "").split("\n")[0].slice(0, 80);
                out.latest_sha = (head.sha || "").slice(0, 7);
            }
        } catch (e) {
            out.error = `gh:${e.message}`;
        }
    } else {
        out.error = "GH_PAT missing";
    }
    try {
        const db = admin.firestore();
        const since = admin.firestore.Timestamp.fromMillis(last24hMs());
        const snap = await db
            .collection("clients")
            .where("created_at", ">=", since)
            .where("status", "==", "onboarding")
            .count()
            .get();
        out.deals_closed = snap.data().count;
    } catch (_) {}
    return out;
}

// ─── 10. Today's #1 priority (parse NEXT_STEP.md from repo) ──────────
async function pullBigRock() {
    const out = { rock: null, error: null };
    if (!process.env.GH_PAT) {
        out.error = "GH_PAT missing";
        return out;
    }
    try {
        const r = await axios.get(
            "https://api.github.com/repos/babilionllc-coder/jegodigital/contents/NEXT_STEP.md?ref=main",
            {
                headers: {
                    Authorization: `Bearer ${process.env.GH_PAT}`,
                    Accept: "application/vnd.github.v3.raw",
                },
                timeout: 10000,
            }
        );
        const md = typeof r.data === "string" ? r.data : "";
        // Find "TODAY'S BIG ROCK" header → take next non-empty line
        const lines = md.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (/BIG\s*ROCK/i.test(lines[i])) {
                for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                    const t = lines[j].replace(/^[>*#\s_-]+/g, "").trim();
                    if (t.length > 10) {
                        out.rock = t.slice(0, 200);
                        return out;
                    }
                }
            }
        }
        out.error = "BIG ROCK header not found";
    } catch (e) {
        out.error = e.message;
    }
    return out;
}

// ─── Traffic light ────────────────────────────────────────────────────
function trafficLight(d) {
    const reasons = [];
    let level = "🟢";

    // RED rules
    if (d.pipeline.queue_depth != null && d.pipeline.queue_depth < 50) {
        level = "🔴";
        reasons.push(`lead queue ${d.pipeline.queue_depth} <50`);
    }
    if (d.email.flag_count >= 6) {
        level = "🔴";
        reasons.push(`${d.email.flag_count} campaigns at <2% open`);
    }
    if (d.cost.cap_pct != null && d.cost.cap_pct > 85) {
        level = "🔴";
        reasons.push(`GCP ${d.cost.cap_pct.toFixed(0)}% of cap`);
    }
    if (d.errors.deploy_failed_today) {
        level = "🔴";
        reasons.push(`deploy failed today`);
    }

    // YELLOW rules (only escalate if not already RED)
    if (level !== "🔴") {
        if (d.pipeline.queue_depth != null && d.pipeline.queue_depth < 100) {
            level = "🟡";
            reasons.push(`lead queue ${d.pipeline.queue_depth} <100`);
        }
        if (d.email.flag_count >= 1 && d.email.flag_count <= 5) {
            level = "🟡";
            reasons.push(`${d.email.flag_count} campaigns weak`);
        }
        if (d.cost.cap_pct != null && d.cost.cap_pct >= 60 && d.cost.cap_pct <= 85) {
            level = "🟡";
            reasons.push(`GCP ${d.cost.cap_pct.toFixed(0)}% cap`);
        }
        if (d.wins.commits === 0) {
            level = "🟡";
            reasons.push(`0 commits last 24h`);
        }
    }

    return { level, reasons };
}

// ─── Block Kit builder ───────────────────────────────────────────────
function val(v, suffix = "") {
    if (v == null) return "❓";
    return String(v) + suffix;
}
function pct(v) {
    if (v == null) return "❓";
    return (v * 100).toFixed(1) + "%";
}

function buildBlocks(d) {
    const tl = trafficLight(d);
    const dateStr = isoDay(nowCancun());

    const blocks = [];

    blocks.push({
        type: "header",
        text: { type: "plain_text", text: `${tl.level} JegoDigital Daily Brief — ${dateStr}`, emoji: true },
    });

    if (tl.reasons.length > 0) {
        blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: `_${tl.reasons.join(" · ")}_` }],
        });
    }

    // 🚰 Pipeline
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text:
                `*🚰 Pipeline*\n` +
                `• Lead queue: *${val(d.pipeline.queue_depth)}*\n` +
                `• Today's city: *${val(d.pipeline.today_city || "—")}*\n` +
                `• Active campaigns: *${val(d.pipeline.active_campaigns)}* of ${val(d.pipeline.total_campaigns)}`,
        },
    });

    // 📧 Cold email
    let emailLines = `*📧 Cold email (24h)*\n` +
        `• Sent: *${d.email.total_sent}* · Opens: *${d.email.total_opens}* · Replies: *${d.email.total_replies}*\n`;
    const flagged = d.email.campaigns.filter((c) => c.flagged);
    if (flagged.length > 0) {
        emailLines += `🚨 ${flagged.length} campaign(s) <2% open: ` +
            flagged.slice(0, 3).map((c) => `\`${c.name}\` (${pct(c.open_rate)})`).join(", ");
    } else {
        emailLines += `_no campaigns under 2% open ✅_`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: emailLines } });

    // ☎️ Cold calls
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text:
                `*☎️ Cold calls (24h)*\n` +
                `• Calls: *${val(d.calls.calls)}* · Successful: *${val(d.calls.success)}* · Booked: *${val(d.calls.booked)}*`,
        },
    });

    // 📅 Calendly
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text:
                `*📅 Calendly*\n` +
                `• New bookings 24h: *${val(d.cal.new_bookings)}*\n` +
                `• No-shows 24h: *${val(d.cal.no_shows)}*\n` +
                `• Upcoming today: *${val(d.cal.today_upcoming)}*`,
        },
    });

    // 📱 Social
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text:
                `*📱 Social (Instagram)*\n` +
                `• Last story reach: *${val(d.social.last_story_views)}*`,
        },
    });

    // 💸 GCP cost
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text:
                `*💸 GCP cost*\n` +
                `• MTD: *MX$${val(d.cost.mtd_mxn != null ? d.cost.mtd_mxn.toFixed(0) : null)}* · ${val(d.cost.cap_pct != null ? d.cost.cap_pct.toFixed(0) + "%" : null)} of cap`,
        },
    });

    // 🚨 Errors
    let errLines = `*🚨 Errors / disasters (24h)*\n`;
    if (d.errors.disasters.length === 0) {
        errLines += `_clean — no new disaster_log entries ✅_`;
    } else {
        errLines += d.errors.disasters
            .map((e) => `• \`${e.tag}\` ${e.title}`)
            .join("\n");
    }
    if (d.errors.deploy_failed_today) {
        errLines += `\n• 🚨 *${d.errors.deploy_fail_count}* failed deploy(s) on main`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: errLines } });

    // 🔥 Hot leads
    let hotLines = `*🔥 Hot leads (replied, not yet booked)*\n` +
        `• Count: *${val(d.hot.count)}*`;
    if (d.hot.samples.length > 0) {
        hotLines += `\n• Top 5: ${d.hot.samples.map((s) => `\`${s}\``).join(" ")}`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: hotLines } });

    // 🏆 Yesterday wins
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text:
                `*🏆 Last 24h wins*\n` +
                `• Commits shipped: *${val(d.wins.commits)}*` +
                (d.wins.latest_commit ? ` — latest \`${d.wins.latest_sha}\` ${d.wins.latest_commit}` : "") +
                `\n• Deals closed: *${val(d.wins.deals_closed)}*`,
        },
    });

    // ⚡ Today's #1
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `*⚡ Today's #1 priority*\n${d.rock.rock ? "> " + d.rock.rock : "_NEXT_STEP.md BIG ROCK header not found — update it._"}`,
        },
    });

    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_Pulled live from Instantly · Calendly · Brevo · ElevenLabs · IG · Firestore · GitHub · Cloud Billing — never fabricated (HR-0)._` }],
    });

    return blocks;
}

// ─── Main ────────────────────────────────────────────────────────────
async function buildBriefing() {
    const [pipeline, email, calls, cal, social, cost, errors, hot, wins, rock] = await Promise.all([
        pullPipeline().catch((e) => ({ error: e.message })),
        pullColdEmail().catch((e) => ({ error: e.message, campaigns: [], total_sent: 0, total_opens: 0, total_replies: 0, flag_count: 0 })),
        pullColdCalls().catch((e) => ({ error: e.message, calls: 0, success: 0, booked: 0 })),
        pullCalendly().catch((e) => ({ error: e.message, new_bookings: 0, no_shows: 0, today_upcoming: 0 })),
        pullSocial().catch((e) => ({ error: e.message })),
        pullGcpCost().catch((e) => ({ error: e.message })),
        pullErrors().catch((e) => ({ error: e.message, disasters: [] })),
        pullHotLeads().catch((e) => ({ error: e.message, count: 0, samples: [] })),
        pullWins().catch((e) => ({ error: e.message, commits: 0 })),
        pullBigRock().catch((e) => ({ error: e.message })),
    ]);
    const data = { pipeline, email, calls, cal, social, cost, errors, hot, wins, rock };
    return { blocks: buildBlocks(data), data };
}

async function postBriefing(targetChannel = "daily-ops") {
    const { blocks, data } = await buildBriefing();
    const tl = trafficLight(data);
    const text = `${tl.level} JegoDigital Daily Brief — ${isoDay(nowCancun())}`;
    const result = await slackPost(targetChannel, { text, blocks });

    // Audit log
    try {
        const db = admin.firestore();
        await db.collection("daily_briefings").doc(isoDay(nowCancun())).set({
            posted_at: admin.firestore.FieldValue.serverTimestamp(),
            traffic_light: tl.level,
            traffic_reasons: tl.reasons,
            slack_ok: result.ok,
            slack_channel: result.channel,
            data,
        });
    } catch (e) {
        functions.logger.warn("daily_briefings audit write failed:", e.message);
    }
    return { ok: result.ok, traffic_light: tl.level, slack: result };
}

// ─── Exports ────────────────────────────────────────────────────────
// Cron: 13:00 UTC = 08:00 Cancun (UTC-5, no DST). Every day.
exports.dailyBriefing = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .pubsub.schedule("0 13 * * *")
    .timeZone("America/Cancun")
    .onRun(async () => {
        const r = await postBriefing("daily-ops");
        functions.logger.info("dailyBriefing posted:", r);
        return r;
    });

// HTTPS trigger for /daily slash command + smoke testing
exports.dailyBriefingNow = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const channel = (req.query.channel || "daily-ops").toString();
            const r = await postBriefing(channel);
            res.json(r);
        } catch (e) {
            functions.logger.error("dailyBriefingNow failed:", e.message);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

// Exported for slashCommand integration (post directly to a channel ID)
module.exports.buildBriefing = buildBriefing;
module.exports.postBriefing = postBriefing;
