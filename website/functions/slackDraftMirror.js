/**
 * slackDraftMirror — Money Machine S1 deliverable (2026-04-23 evening).
 *
 * Replaces the Telegram-only approval flow (which kept burying drafts) with
 * a parallel Slack push so Alex can act from his phone in seconds.
 *
 * Trigger: Firestore onCreate on /opportunity_drafts/{id} where
 *   ready_for_approval === true AND post_safely_final === true.
 *
 * Output: rich Block Kit card posted to the #all-jegodigital channel via
 *   existing SLACK_WEBHOOK_URL env secret. Card contains:
 *     - Title + score + primary service + word count
 *     - Full draft text in a copy-friendly code block
 *     - Tappable redd.it/{id} deep-link (opens native Reddit app on iOS)
 *     - Tappable markDraftPosted URL so Alex can mark it DONE in one tap
 *     - Current daily rate-limit status (e.g. "2/3 posts used today")
 *
 * The manual post flow:
 *   1. Alex sees card in Slack on phone
 *   2. Long-press draft text → Copy
 *   3. Tap redd.it/... link → Reddit app opens thread
 *   4. Tap Reply → Paste → Post
 *   5. Tap "Mark as posted" link in Slack card → opportunity moves to `posted`
 *
 * Also mirrors to Telegram (legacy backup) — telegramApprovalBot still runs
 * in parallel so we have redundant delivery while Alex gets used to Slack.
 *
 * MIGRATION NOTE: once S2 ships the dailyTaskDispatcher + Slack List "🎯
 * Today" feature, this trigger will post to the list instead of the channel.
 * For now, channel webhook = good enough for v1.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const { checkQuota } = require("./redditRateLimiter");

if (!admin.apps.length) admin.initializeApp();

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const MARK_POSTED_BASE = "https://us-central1-jegodigital-e02fb.cloudfunctions.net/markDraftPosted";

function formatCard(oppId, draft, quota) {
    const redditId = oppId.replace(/^reddit_/, "");
    const threadUrl = draft.permalink || `https://redd.it/${redditId}`;
    const markPostedUrl = `${MARK_POSTED_BASE}?id=${encodeURIComponent(oppId)}`;
    const scoreEmoji = draft.score >= 90 ? "🔥" : draft.score >= 80 ? "⭐" : "✅";
    const statusBadge = quota.allowed
        ? `🟢 ${quota.used}/${quota.limit} posts used today — slot available`
        : `🔴 ${quota.used}/${quota.limit} daily cap HIT — wait until ${quota.resets_at_utc.slice(11,16)} UTC`;

    return {
        text: `🤖 New Reddit draft ready — score ${draft.score} — ${draft.title || "(untitled)"}`,
        blocks: [
            {
                type: "header",
                text: { type: "plain_text", text: `${scoreEmoji} Money Machine draft — score ${draft.score}` },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Title:* ${(draft.title || "").slice(0, 150)}\n`
                        + `*Service hit:* ${draft.primary_service || draft.primaryService || "general"}\n`
                        + `*Model:* ${draft.drafted_by_model || "gemini"} · *Words:* ${draft.word_count || "?"}\n`
                        + `*Rate limit:* ${statusBadge}`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*📋 Copy this as your reply:*\n```" + (draft.draft_text || "").trim() + "```",
                },
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: { type: "plain_text", text: "🔗 Open Reddit thread" },
                        url: threadUrl,
                        style: "primary",
                    },
                    {
                        type: "button",
                        text: { type: "plain_text", text: "✅ Mark as posted" },
                        url: markPostedUrl,
                    },
                ],
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `Draft id: \`${oppId}\` · Safety: ${draft.post_safely_final ? "✅ passed" : "⚠️ flagged"}`,
                },
                ],
            },
            { type: "divider" },
        ],
    };
}

async function mirrorDraftToSlack(draftSnap) {
    if (!SLACK_WEBHOOK) {
        functions.logger.warn("[slackDraftMirror] SLACK_WEBHOOK_URL missing — skipping");
        return null;
    }
    const draft = draftSnap.data() || {};
    // Only mirror drafts that actually passed safety checks.
    if (!draft.ready_for_approval || !draft.post_safely_final) {
        functions.logger.info(`[slackDraftMirror] ${draftSnap.id} skipped — not safe/ready`);
        return null;
    }
    // Pull the parent opportunity doc for permalink fallback.
    try {
        const db = admin.firestore();
        const oppDoc = await db.collection("opportunities").doc(draftSnap.id).get();
        if (oppDoc.exists) {
            const od = oppDoc.data();
            if (!draft.permalink && od.permalink) draft.permalink = od.permalink;
            if (!draft.subreddit && od.subreddit) draft.subreddit = od.subreddit;
        }
    } catch (err) {
        functions.logger.warn(`[slackDraftMirror] parent opp lookup failed: ${err.message}`);
    }

    const quota = await checkQuota();
    const payload = formatCard(draftSnap.id, draft, quota);

    try {
        const r = await axios.post(SLACK_WEBHOOK, payload, {
            timeout: 15000,
            headers: { "Content-Type": "application/json" },
        });
        functions.logger.info(`[slackDraftMirror] ${draftSnap.id} mirrored — HTTP ${r.status}`);
        // Record that we mirrored + move draft status so telegramApprovalBot
        // and scheduledTelegramRecovery don't re-push.
        await draftSnap.ref.set({
            mirrored_to_slack_at: admin.firestore.FieldValue.serverTimestamp(),
            slack_webhook_status: r.status,
            status: draft.status === "awaiting_approval" ? "awaiting_approval_slack" : draft.status,
        }, { merge: true });
        return { ok: true };
    } catch (err) {
        const body = err.response?.data || err.message;
        functions.logger.error(`[slackDraftMirror] ${draftSnap.id} failed: ${body}`);
        await draftSnap.ref.set({ slack_mirror_error: String(body).slice(0, 500) }, { merge: true });
        return { ok: false, error: String(body) };
    }
}

// Firestore trigger — fires when drafter writes a new draft document.
exports.slackDraftMirror = functions.firestore
    .document("opportunity_drafts/{oppId}")
    .onCreate(async (snap, _ctx) => {
        try {
            return await mirrorDraftToSlack(snap);
        } catch (err) {
            functions.logger.error("[slackDraftMirror] crash:", err);
            return { ok: false, error: err.message };
        }
    });

// Also fires if drafter UPDATES a draft (e.g. fixes a failed-safety draft).
// Only re-mirrors if ready_for_approval flipped to true.
exports.slackDraftMirrorOnUpdate = functions.firestore
    .document("opportunity_drafts/{oppId}")
    .onUpdate(async (change, _ctx) => {
        const before = change.before.data();
        const after = change.after.data();
        if (!before.ready_for_approval && after.ready_for_approval) {
            return mirrorDraftToSlack(change.after);
        }
        return null;
    });

// Manual re-mirror all stranded drafts (one-shot HTTPS) — useful to catch up
// drafts created before this function existed.
exports.slackDraftMirrorBackfill = functions.https.onRequest(async (req, res) => {
    try {
        const db = admin.firestore();
        const snap = await db.collection("opportunity_drafts")
            .where("ready_for_approval", "==", true)
            .limit(Number(req.query.limit || 10))
            .get();
        const results = [];
        for (const d of snap.docs) {
            // eslint-disable-next-line no-await-in-loop
            const r = await mirrorDraftToSlack(d);
            results.push({ id: d.id, ok: r?.ok === true });
        }
        res.json({ ok: true, mirrored: results.length, results });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
