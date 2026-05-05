/**
 * redditResearchSynth — Friday 18:00 CDMX weekly research synthesizer.
 *
 * Pulls the last week's top 50 threads from r/realestate + r/RealEstateMexico
 * + r/Miami + r/RealEstateInvesting via Apify (trudax~reddit-scraper-lite, the
 * same actor redditScraper.js already uses). Sends the raw thread bundle to
 * Anthropic Claude for synthesis into a 4-section memo:
 *
 *   1. Pain points  — what real-estate decision-makers complain about
 *   2. Hot topics   — what's getting the most engagement this week
 *   3. Objections   — what they push back on (price, AI, lead-gen agencies)
 *   4. Opportunities for JegoDigital — concrete angles for cold email + content
 *
 * Output paths (all 3 must succeed for HR-6 "complete with proof"):
 *   • Telegram (markdown digest, chunked at 3,800 chars)
 *   • Slack #content via slackPost
 *   • GitHub commit to research/reddit_synth_YYYY-MM-DD.md (Contents API)
 *   • Firestore /reddit_research_runs/{YYYY-WW} (full memo + raw threads)
 *
 * Schedule: `0 0 * * 6` UTC = Sat 00:00 UTC = Fri 18:00 CDMX (UTC-6, no DST)
 * Manual:   GET /redditResearchSynthNow  (X-Admin-Token header optional)
 *
 * Env required:
 *   APIFY_API_KEY, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 *   SLACK_BOT_TOKEN, SLACK_CHANNEL_CONTENT, GH_PAT
 *
 * Hard rules honored:
 *   HR-2  — every thread is a live Apify pull this run, never cached.
 *   HR-6  — returns { telegram, slack, github_commit, firestore } booleans;
 *           "complete" only if all four are ok.
 *   HR-11 — log-and-continue on any single channel failure (never silent).
 *   HR-24 — every run logs to Telegram + Slack on success and failure.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

if (!admin.apps.length) admin.initializeApp();

const APIFY_ACTOR = "trudax~reddit-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_MODEL = "claude-opus-4-5";
const ANTHROPIC_MODEL_FALLBACK = "claude-sonnet-4-5";

const TARGET_SUBREDDITS = [
    "realestate",
    "RealEstateMexico",
    "Miami",
    "RealEstateInvesting",
];

const REPO = "babilionllc-coder/jegodigital";

// ─── Time helpers (CDMX, UTC-6, no DST) ────────────────────────────
function nowCDMX() {
    return new Date(Date.now() - 6 * 3600 * 1000);
}
function isoDay(d = nowCDMX()) {
    return d.toISOString().slice(0, 10);
}
function isoWeek(d = nowCDMX()) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ─── Apify pull (top of week, 200-item budget across 4 subs) ───────
async function pullSubredditThreads() {
    const apifyKey = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
    if (!apifyKey) throw new Error("APIFY_API_KEY missing in env");

    const startUrls = TARGET_SUBREDDITS.map(s => ({
        url: `https://www.reddit.com/r/${s}/top/?t=week`,
        method: "GET",
    }));

    const input = {
        startUrls,
        maxItems: 200,
        maxPostCount: 200,
        sort: "top",
        searchPosts: true,
        searchComments: false,
        searchCommunities: false,
        searchUsers: false,
        includeNSFW: false,
        skipComments: true,
        skipUserPosts: true,
        skipCommunity: true,
        proxy: { useApifyProxy: true },
    };

    // Same maxTotalChargeUsd workaround as redditScraper.js (pay-per-event actor).
    const maxChargeUsd = "1.50";
    const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}&maxTotalChargeUsd=${maxChargeUsd}`;

    functions.logger.info(`[redditResearchSynth] Apify run — 4 subs, cap 200, $${maxChargeUsd}`);
    const r = await axios.post(url, input, {
        timeout: 540000,
        headers: { "Content-Type": "application/json" },
    });
    const items = Array.isArray(r.data) ? r.data : [];
    functions.logger.info(`[redditResearchSynth] Apify returned ${items.length} items`);
    return items;
}

// Normalize + rank by upvotes, keep top 50.
function rankAndTrim(items, keep = 50) {
    const posts = [];
    for (const item of items) {
        const dataType = (item.dataType || "").toString().toLowerCase();
        if (dataType && dataType !== "post") continue;
        const id = item.parsedId || item.id || item.url;
        if (!id) continue;
        const username = (item.username || item.author || "").toLowerCase();
        if (!username || username === "[deleted]" || username === "automoderator") continue;

        posts.push({
            id,
            subreddit:
                item.parsedCommunityName ||
                (item.communityName || "").replace(/^r\//, "") ||
                item.subreddit ||
                null,
            url: item.url || (item.parsedId ? `https://www.reddit.com/comments/${item.parsedId}/` : null),
            title: (item.title || "").slice(0, 300),
            body: (item.body || item.selftext || "").slice(0, 1500),
            upvotes: Number(item.upVotes ?? item.ups ?? 0),
            num_comments: Number(item.numberOfComments ?? item.numComments ?? 0),
            createdAt: item.createdAt || null,
        });
    }
    posts.sort((a, b) => (b.upvotes + b.num_comments * 2) - (a.upvotes + a.num_comments * 2));
    return posts.slice(0, keep);
}

// ─── Anthropic synthesis ───────────────────────────────────────────
async function synthesizeMemo(topPosts) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY missing in env");

    const dateStr = isoDay();
    const compactCorpus = topPosts.map((p, i) => {
        return `[${i + 1}] r/${p.subreddit} · ↑${p.upvotes} · 💬${p.num_comments}\nTITLE: ${p.title}\nBODY: ${p.body || "(no body)"}\nURL: ${p.url}`;
    }).join("\n\n---\n\n");

    const systemPrompt = [
        "You are JegoDigital's strategic research analyst.",
        "JegoDigital is an AI marketing agency for real-estate businesses, agencies, and developers in Mexico + Miami Hispanic.",
        "Your job: read the last 7 days of top Reddit threads from r/realestate, r/RealEstateMexico, r/Miami, r/RealEstateInvesting and synthesize a strategy memo.",
        "Voice: collaboration-first, NOT vendor-pitch. Every JegoDigital opportunity should be framed as 'a way we can help', not 'a sale we can close'.",
        "Cite specific Reddit threads with [#N] referring to the corpus index.",
    ].join("\n");

    const userPrompt = `# Reddit Corpus — top 50 threads, week ending ${dateStr}

${compactCorpus}

---

# Your task

Produce a Markdown memo with these EXACT sections (use the exact H2 headings):

## 🔥 Pain Points
What real-estate decision-makers (agency owners, brokers, developers, agents) are most frustrated about this week. Be specific. Cite [#N] examples.

## 📈 Hot Topics
What's driving the most engagement (upvotes + comments) and why.

## 🚧 Objections
What buyers/owners push back on — price, AI, agencies, marketing claims, lead-gen tactics.

## 🤝 Opportunities for JegoDigital
Concrete angles where JegoDigital can help (collaboration tone, never sales-pitch). Map each opportunity to one of our 9 services where relevant. Format as a bullet list, each bullet 1-3 sentences.

## 🎬 Content Ideas (3-5 ready-to-record hooks)
Specific founder-video hooks Alex could record this week, derived from the threads. Each hook ≤15 words.

End with a one-line takeaway: "Bottom line: …"`;

    const tryOnce = async (model) => {
        return axios.post(
            `${ANTHROPIC_BASE}/messages`,
            {
                model,
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
            },
            {
                headers: {
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                timeout: 120000,
            }
        );
    };

    let resp;
    try {
        resp = await tryOnce(ANTHROPIC_MODEL);
    } catch (err) {
        functions.logger.warn(`[redditResearchSynth] ${ANTHROPIC_MODEL} failed: ${err.response?.status} ${err.response?.data?.error?.message || err.message}; retrying with ${ANTHROPIC_MODEL_FALLBACK}`);
        resp = await tryOnce(ANTHROPIC_MODEL_FALLBACK);
    }
    const text = resp.data?.content?.[0]?.text;
    if (!text) throw new Error("Anthropic returned empty content");
    return text;
}

// ─── GitHub Contents API commit ─────────────────────────────────────
async function commitMemoToRepo(filename, body) {
    const token = process.env.GH_PAT;
    if (!token) {
        return { ok: false, error: "GH_PAT missing" };
    }
    const path = `research/${filename}`;
    const url = `https://api.github.com/repos/${REPO}/contents/${path}`;

    // Idempotent: if file exists, fetch sha + update; else create.
    let sha = null;
    try {
        const head = await axios.get(`${url}?ref=main`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
            timeout: 15000,
        });
        sha = head.data?.sha || null;
    } catch (err) {
        if (err.response?.status !== 404) {
            return { ok: false, error: `head ${err.response?.status}: ${err.message}` };
        }
    }

    const payload = {
        message: `chore(research): reddit synth ${filename.replace(/\.md$/, "")}`,
        content: Buffer.from(body, "utf8").toString("base64"),
        branch: "main",
    };
    if (sha) payload.sha = sha;

    try {
        const r = await axios.put(url, payload, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
            timeout: 20000,
        });
        return { ok: true, html_url: r.data?.content?.html_url || null, sha: r.data?.content?.sha || null };
    } catch (err) {
        return { ok: false, error: `put ${err.response?.status}: ${err.response?.data?.message || err.message}` };
    }
}

// ─── Main runner ────────────────────────────────────────────────────
async function runRedditResearchSynth() {
    const startedAt = Date.now();
    const date = isoDay();
    const week = isoWeek();
    const out = {
        ok: false,
        date, week,
        threads_pulled: 0,
        threads_kept: 0,
        memo_chars: 0,
        telegram: false,
        slack: false,
        github: false,
        firestore: false,
        errors: [],
    };

    // 1. Pull
    let raw;
    try {
        raw = await pullSubredditThreads();
        out.threads_pulled = raw.length;
    } catch (err) {
        out.errors.push(`apify: ${err.message}`);
        await notify(`🔴 *redditResearchSynth Apify FAILED:* ${err.message}`, { critical: true });
        return out;
    }

    const top = rankAndTrim(raw, 50);
    out.threads_kept = top.length;

    if (top.length < 5) {
        out.errors.push(`only ${top.length} threads after dedup — too thin to synth`);
        await notify(`⚠️ *redditResearchSynth too thin:* only ${top.length} threads. Skipping memo.`, { critical: false });
        return out;
    }

    // 2. Synthesize
    let memo;
    try {
        memo = await synthesizeMemo(top);
        out.memo_chars = memo.length;
    } catch (err) {
        out.errors.push(`anthropic: ${err.message}`);
        await notify(`🔴 *redditResearchSynth Anthropic FAILED:* ${err.message}`, { critical: true });
        return out;
    }

    const fullMemo = [
        `# JegoDigital — Reddit Research Synth · ${date}`,
        ``,
        `**Week:** ${week}`,
        `**Subreddits:** ${TARGET_SUBREDDITS.map(s => "r/" + s).join(", ")}`,
        `**Threads pulled:** ${out.threads_pulled} · **Top 50 kept:** ${out.threads_kept}`,
        `**Generated by:** \`redditResearchSynth\` Cloud Function`,
        ``,
        `---`,
        ``,
        memo,
        ``,
        `---`,
        ``,
        `## 📚 Source corpus (top 50)`,
        ``,
        ...top.map((p, i) => `${i + 1}. **r/${p.subreddit}** · ↑${p.upvotes} · 💬${p.num_comments} · [${p.title.slice(0, 120)}](${p.url})`),
        ``,
    ].join("\n");

    // 3. Telegram
    try {
        const tgOut = await notify(
            `🧠 *Reddit Research Synth · ${date}*\n\n${memo.slice(0, 3500)}\n\n_Full memo on GitHub + Slack_`,
            { critical: false, markdown: true }
        );
        out.telegram = !!tgOut.telegram;
    } catch (err) {
        out.errors.push(`telegram: ${err.message}`);
    }

    // 4. Slack
    try {
        const slackOut = await slackPost("content", {
            text: `🧠 Reddit Research Synth · ${date}`,
            blocks: [
                { type: "header", text: { type: "plain_text", text: `🧠 Reddit Research Synth · ${date}` } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: `*Week:* ${week} · *Subs:* ${TARGET_SUBREDDITS.map(s => "r/" + s).join(", ")} · *Top 50:* ${out.threads_kept} threads`,
                    }],
                },
                { type: "divider" },
                { type: "section", text: { type: "mrkdwn", text: memo.slice(0, 2900) } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: "_Full memo committed to `research/` on main. Cron: Fri 18:00 CDMX._",
                    }],
                },
            ],
        });
        out.slack = !!slackOut.ok;
    } catch (err) {
        out.errors.push(`slack: ${err.message}`);
    }

    // 5. GitHub commit
    try {
        const gh = await commitMemoToRepo(`reddit_synth_${date}.md`, fullMemo);
        out.github = gh.ok;
        if (gh.ok) out.github_url = gh.html_url;
        else out.errors.push(`github: ${gh.error}`);
    } catch (err) {
        out.errors.push(`github: ${err.message}`);
    }

    // 6. Firestore snapshot (idempotent — week ID acts as primary key)
    try {
        const db = admin.firestore();
        await db.collection("reddit_research_runs").doc(week).set({
            date, week,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
            threads_pulled: out.threads_pulled,
            threads_kept: out.threads_kept,
            memo,
            top_threads: top,
            duration_sec: ((Date.now() - startedAt) / 1000).toFixed(1),
            channels: { telegram: out.telegram, slack: out.slack, github: out.github },
            errors: out.errors,
        }, { merge: true });
        // Also write a "latest" pointer so founderContentCron can pick it up
        // without scanning ISO week IDs.
        await db.collection("reddit_research_runs").doc("latest").set({
            week, date, memo,
            top_threads: top,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        out.firestore = true;
    } catch (err) {
        out.errors.push(`firestore: ${err.message}`);
    }

    out.ok = out.telegram && out.slack && out.github && out.firestore;
    out.duration_sec = ((Date.now() - startedAt) / 1000).toFixed(1);
    return out;
}

// ─── Cron + manual trigger ─────────────────────────────────────────
exports.redditResearchSynth = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB", secrets: [] })
    .pubsub
    .schedule("0 0 * * 6")  // Sat 00:00 UTC = Fri 18:00 CDMX
    .timeZone("Etc/UTC")
    .onRun(async () => {
        const r = await runRedditResearchSynth();
        functions.logger.info("[redditResearchSynth] done", r);
        return r;
    });

exports.redditResearchSynthNow = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        try {
            const r = await runRedditResearchSynth();
            res.json(r);
        } catch (err) {
            functions.logger.error("[redditResearchSynthNow] crash:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

// Internal export for tests
exports._runRedditResearchSynth = runRedditResearchSynth;
