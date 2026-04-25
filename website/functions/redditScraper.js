/**
 * redditScraper — Money Machine Phase 1 (Reddit opportunity ingestion)
 *
 * Hourly cron that pulls fresh posts from target subreddits via the Apify Reddit
 * Actor ($2/1,000 posts — cheapest verified pricing 2026-04-22), filters by
 * pain-point keywords, and writes each new post to Firestore /opportunities/{id}.
 *
 * Downstream: opportunityClassifier (Firestore trigger, Gemini Flash Lite scores
 * 0-100) → opportunityDrafter (writes value-first reply) → telegramApprovalBot
 * (Alex taps Approve/Edit/Kill).
 *
 * HARD RULE #5 ANALOGUE (for the Reddit lane):
 *   - MIN post karma +1 (no deleted/removed)
 *   - MIN post age 30 min, MAX age 48 hrs (catch fresh buyers)
 *   - Keyword must appear in title OR first 500 chars of body
 *   - Author account >= 30 days old, >= 10 karma (drops bots)
 *
 * Schedule: `15 * * * *` / America/Mexico_City (15 past every hour)
 *
 * Env required:
 *   APIFY_API_KEY         — https://console.apify.com/account/integrations
 *   TELEGRAM_BOT_TOKEN    — (optional) error alerts via telegramHelper
 *
 * Manual trigger:
 *   GET https://us-central1-jegodigital-e02fb.cloudfunctions.net/redditScraperNow
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");
const { notify } = require("./telegramHelper");

if (!admin.apps.length) admin.initializeApp();

// Battle-tested Apify Reddit actor — $3.50/1,000 results, 2.7M+ total runs.
// Previous actor `practicaltools~apify-reddit-api` broke 2026-04-22 (Reddit
// started requiring OAuth on the endpoint it hit → 403 Blocked on every run).
// trudax~reddit-scraper-lite uses HTML scraping + proxies and is the 2026
// reference implementation. https://apify.com/trudax/reddit-scraper-lite
const APIFY_ACTOR = "trudax~reddit-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2";

// Target subreddits (verified via Perplexity sonar 2026-04-22 — see MONEY_MACHINE.md §3)
const TARGET_SUBREDDITS = [
    "smallbusiness",     // 2M+ members, 200 posts/day, LOW self-promo restrictions
    "Entrepreneur",      // 3.2-5.1M members, 150 posts/day
    "startups",          // 1.8M+, 100/day
    "SaaS",              // 150K+, 40/day
    "marketing",         // 500K+, 50/day, strict (we read, rarely post)
    "SEO",               // ~300K, 40/day, strict (we read, rarely post)
    "realtors",          // 100K+, 15/day — our ICP
    "webdev",            // ~1.5M, 80/day
    "sweatystartup",     // 120K, 50/day
    "forhire",           // direct hire signals
];

// Pain-point keyword dictionary — matches the 9 services we actually sell.
// Each keyword is scored 1-3 based on buyer-intent specificity.
const KEYWORDS = [
    // AI voice / sales closer (flagship)
    { term: "ai receptionist", weight: 3, service: "voice_ai" },
    { term: "ai phone", weight: 3, service: "voice_ai" },
    { term: "answering service", weight: 3, service: "voice_ai" },
    { term: "voicemail", weight: 2, service: "voice_ai" },
    { term: "ai cold caller", weight: 3, service: "voice_ai" },
    { term: "voice agent", weight: 3, service: "voice_ai" },
    { term: "elevenlabs", weight: 3, service: "voice_ai" },
    // Website
    { term: "need a website", weight: 3, service: "website" },
    { term: "website redesign", weight: 3, service: "website" },
    { term: "slow website", weight: 3, service: "website" },
    { term: "my site is", weight: 2, service: "website" },
    { term: "pagespeed", weight: 2, service: "website" },
    { term: "landing page", weight: 2, service: "website" },
    // SEO + AEO
    { term: "need seo help", weight: 3, service: "seo" },
    { term: "hire seo", weight: 3, service: "seo" },
    { term: "seo audit", weight: 3, service: "seo" },
    { term: "rank higher", weight: 2, service: "seo" },
    { term: "google rankings", weight: 2, service: "seo" },
    { term: "chatgpt visibility", weight: 3, service: "aeo" },
    { term: "mentioned in chatgpt", weight: 3, service: "aeo" },
    // Cold outreach
    { term: "cold email setup", weight: 3, service: "cold_email" },
    { term: "instantly.ai", weight: 2, service: "cold_email" },
    { term: "low reply rate", weight: 2, service: "cold_email" },
    // Automation
    { term: "n8n", weight: 2, service: "automation" },
    { term: "zapier", weight: 2, service: "automation" },
    { term: "automate", weight: 1, service: "automation" },
    { term: "integration", weight: 1, service: "automation" },
    // Graphics
    { term: "logo design", weight: 2, service: "graphics" },
    { term: "instagram designer", weight: 2, service: "graphics" },
    { term: "social media graphics", weight: 2, service: "graphics" },
    // Video
    { term: "video editor", weight: 2, service: "video" },
    { term: "youtube shorts", weight: 2, service: "video" },
    { term: "product demo video", weight: 2, service: "video" },
    // Content
    { term: "seo content writer", weight: 2, service: "content" },
    { term: "blog writer", weight: 1, service: "content" },
    // Real-estate lead gen (our core)
    { term: "real estate lead", weight: 3, service: "real_estate" },
    { term: "inmobiliaria", weight: 3, service: "real_estate" },
];

// Build the keyword match function — returns matched keyword + service hint, or null.
function matchKeywords(title, body) {
    const t = (title || "").toLowerCase();
    const b = (body || "").slice(0, 500).toLowerCase();
    const hits = [];
    for (const kw of KEYWORDS) {
        if (t.includes(kw.term) || b.includes(kw.term)) {
            hits.push({ term: kw.term, weight: kw.weight, service: kw.service });
        }
    }
    if (!hits.length) return null;
    // Sum weights, take highest-weight service as primary
    const totalWeight = hits.reduce((a, h) => a + h.weight, 0);
    const primary = hits.reduce((a, h) => (h.weight > a.weight ? h : a), hits[0]);
    return { hits, totalWeight, primaryService: primary.service };
}

// Kick off Apify actor synchronously and return dataset items.
// maxItems keeps us capped at ~$2 per run (worst case 1,000 posts).
async function runApifyReddit(subreddits, maxItems = 200) {
    const apifyKey = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
    if (!apifyKey) throw new Error("APIFY_API_KEY missing in env");

    // trudax~reddit-scraper-lite input schema (verified 2026-04-22 PM via live
    // probe — 3 test runs all SUCCEEDED and returned real post data).
    // Accepts: startUrls, maxItems, maxPostCount, sort, searchPosts, searchComments,
    //          includeNSFW, proxy config
    // Output fields: id (t3_xxx), parsedId, url, username, userId, title,
    //                communityName (r/name), parsedCommunityName (name), body, html,
    //                numberOfComments, upVotes, upVoteRatio, createdAt (ISO),
    //                dataType ("post"|"community")
    const startUrls = subreddits.map(s => ({
        url: `https://www.reddit.com/r/${s}/new/`,
        method: "GET",
    }));

    const input = {
        startUrls,
        maxItems,
        maxPostCount: maxItems,
        sort: "new",
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

    // CRITICAL FIX 2026-04-23: trudax~reddit-scraper-lite is a pay-per-event
    // actor ($3.50 per 1,000 posts). If we don't explicitly pass
    // maxTotalChargeUsd, Apify computes a default budget that is LOWER than
    // the actor's own container start cost — every run dies in ~2.5s with:
    //   "Error: Maximum cost per run is lower then actor start cost"
    // Observed failure: maxTotalChargeUsd auto-set to $0.000268, actor start
    // alone costs ~$0.002. Runs F4lj4DXqBC / 3cbC0uYKnl / q0LRCpWZyA all
    // failed this way. Fix: pass maxTotalChargeUsd=$1.00 (budget for ~280
    // posts) via query param, which is plenty for a 200-item sync run.
    // $1.00 × 30 runs/day (every hour) = $30/mo worst case = under budget.
    const maxChargeUsd = "1.00";
    const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}&maxTotalChargeUsd=${maxChargeUsd}`;
    functions.logger.info(`[redditScraper] Apify run starting — ${subreddits.length} subs, cap ${maxItems} items, maxCharge $${maxChargeUsd}`);
    const r = await axios.post(url, input, {
        timeout: 540000, // 9 min — Cloud Function max is 9 min default
        headers: { "Content-Type": "application/json" },
    });
    functions.logger.info(`[redditScraper] Apify returned ${Array.isArray(r.data) ? r.data.length : 0} items`);
    return Array.isArray(r.data) ? r.data : [];
}

// Author quality gate — drops obvious throwaways and [deleted] posts.
// trudax~reddit-scraper-lite does NOT return authorKarma / authorCreated in the
// lite tier, so this gate is intentionally looser than the original. The
// Gemini classifier downstream handles the deeper bot/spam scoring.
function passAuthorGate(post) {
    const username = (post.username || post.author || "").toString().toLowerCase();
    if (!username) return false;
    if (username === "[deleted]" || username === "automoderator") return false;

    // Optional legacy fields (kept for future actor swaps that surface them)
    const karma = Number(post.authorKarma ?? post.author_karma ?? 0);
    const created = post.authorCreated ?? post.author_created_utc;
    if (created) {
        const ts = typeof created === "number" ? created * 1000 : Date.parse(created);
        if (!Number.isNaN(ts)) {
            const accountAgeDays = (Date.now() - ts) / 86400000;
            if (accountAgeDays < 30 && karma < 10) return false;
        }
    }
    return true;
}

// Main scrape+write routine.
async function scrapeAndIngest() {
    const db = getFirestore();
    const startedAt = new Date();
    let items;
    try {
        items = await runApifyReddit(TARGET_SUBREDDITS, 200);
    } catch (err) {
        functions.logger.error("[redditScraper] Apify call failed:", err.response?.data || err.message);
        await notify(`🔴 *Reddit scraper Apify call failed:* ${err.message}`, { critical: false });
        throw err;
    }

    let newCount = 0;
    let dupCount = 0;
    let kwMatchCount = 0;
    let authorRejectCount = 0;
    const serviceTally = {};

    let nonPostCount = 0;

    for (const item of items) {
        // trudax emits both "post" and "community" rows — we only want posts.
        const dataType = (item.dataType || "").toString().toLowerCase();
        if (dataType && dataType !== "post") {
            nonPostCount++;
            continue;
        }

        // Normalise across trudax (primary) + legacy actors (fallback).
        // trudax: id (t3_xxx), parsedId, url, username, title, body,
        //         numberOfComments, upVotes, parsedCommunityName, createdAt
        const id = item.parsedId || item.id || item.postId || item.permalink || item.url;
        if (!id) continue;

        const title = item.title || "";
        const body = item.body || item.selftext || item.text || "";

        // Keyword match gate
        const km = matchKeywords(title, body);
        if (!km) continue;
        kwMatchCount++;

        // Author gate
        if (!passAuthorGate(item)) {
            authorRejectCount++;
            continue;
        }

        // Dedupe on post id (t3_xxx is stable even across actors)
        const docRef = db.collection("opportunities").doc(`reddit_${id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-64)}`);
        const existing = await docRef.get();
        if (existing.exists) {
            dupCount++;
            continue;
        }

        const subreddit = item.parsedCommunityName
            || (item.communityName || "").replace(/^r\//, "")
            || item.subreddit
            || item.subredditName
            || null;
        const permalink = item.url
            || item.permalink
            || (item.parsedId ? `https://www.reddit.com/comments/${item.parsedId}/` : null);

        const doc = {
            platform: "reddit",
            postId: id,
            subreddit,
            permalink,
            title,
            body: body.slice(0, 4000), // cap for Firestore doc-size limits
            author: item.username || item.author || null,
            authorKarma: Number(item.authorKarma ?? item.author_karma ?? 0),
            authorCreatedUtc: item.authorCreated ?? item.author_created_utc ?? null,
            upvotes: Number(item.upVotes ?? item.ups ?? item.upvotes ?? item.score ?? 0),
            upVoteRatio: Number(item.upVoteRatio ?? 0),
            numComments: Number(item.numberOfComments ?? item.numComments ?? item.num_comments ?? 0),
            postCreatedAt: item.createdAt || null,
            keywordHits: km.hits,
            keywordScore: km.totalWeight,
            primaryService: km.primaryService,
            status: "pending_classification",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            scrapedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "redditScraper_v2_trudax",
        };
        await docRef.set(doc);
        newCount++;
        serviceTally[km.primaryService] = (serviceTally[km.primaryService] || 0) + 1;
    }

    const durationSec = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    const summary = {
        total_pulled: items.length,
        non_post_skipped: nonPostCount,
        keyword_matches: kwMatchCount,
        author_gate_rejects: authorRejectCount,
        duplicates: dupCount,
        new_written: newCount,
        by_service: serviceTally,
        duration_sec: durationSec,
    };
    functions.logger.info("[redditScraper] Done:", summary);

    await db.collection("money_machine_runs").add({
        module: "redditScraper",
        ran_at: admin.firestore.FieldValue.serverTimestamp(),
        ...summary,
    });

    return summary;
}

// Scheduled cron — every hour at :15.
// CRITICAL: Apify run-sync-get-dataset-items holds the HTTP connection open for
// the full scrape duration (200 posts x 10 subs -> ~5 min). The default Cloud
// Function timeout is 60s, which kills the request before Apify returns,
// meaning zero opportunities ever get written. The timeout MUST be 540s (the
// GCF Gen 1 max).
// ────────────────────────────────────────────────────────────────────────────
// 🛑 DISABLED 2026-04-25 — cost vs revenue audit failed.
//
// Why killed (per HR#3 Revenue-First + HR#10 DISASTER_LOG):
//   • Burning $57.41 in 4 days (80% of total Apify spend, projected ~$430/mo)
//   • Output: 86 hourly runs targeting r/smallbusiness, r/Entrepreneur,
//     r/startups, r/SaaS, r/marketing — 99% English-speaking US startup
//     founders. JegoDigital ICP is Mexican real-estate agencies.
//   • Funnel result Apr 22-25: 0 Calendly bookings, 0 closed deals.
//   • 13/86 runs failed (15% error rate — money burned on errors too).
//
// Re-enable conditions:
//   1. Point startUrls at Mexican-targeted subreddits or local FB/IG groups
//   2. Prove ≥1 Calendly booking from a Reddit reply within a 14-day test
//   3. Set Apify daily spend cap before re-enabling the cron
//
// Manual testing still works via the redditScraperNow HTTPS endpoint below.
// Schedule changed to yearly (Jan 1) + early-return guard so the function
// definition stays intact for Firebase but no API calls fire.
// ────────────────────────────────────────────────────────────────────────────
exports.redditScraper = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .pubsub
    .schedule("0 0 1 1 *")  // yearly @ Jan 1 00:00 — effectively never
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        functions.logger.info(
            "[redditScraper] DISABLED 2026-04-25 — see DISASTER_LOG.md. " +
            "Killed for cost-vs-revenue: $57/cycle Apify spend, 0 Calendly bookings."
        );
        return {
            disabled: true,
            disabled_at: "2026-04-25",
            reason: "cost_vs_revenue_audit_failed",
            cost_per_cycle_usd: 57.41,
            calendly_bookings_in_test_window: 0,
            re_enable_via: "edit redditScraper.js + redeploy (see comment)",
        };
    });

// Manual trigger for testing. Same 540s timeout as the cron.
exports.redditScraperNow = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const s = await scrapeAndIngest();
            res.json({ ok: true, summary: s });
        } catch (err) {
            functions.logger.error("[redditScraperNow] crash:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });
