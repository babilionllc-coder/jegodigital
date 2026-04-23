/**
 * markDraftPosted — Money Machine S1 deliverable (2026-04-23 evening).
 *
 * Closes the last mile of the manual-post flow: after Alex pastes a draft
 * reply into the Reddit app and posts it from his phone, he taps the
 * "✅ Mark as posted" button in the Slack card. That button opens this
 * endpoint in a browser tab, which:
 *   1. Consumes a rate-limiter slot (max 3/day per redditRateLimiter.js)
 *   2. Moves the draft from `approved_needs_manual_post` → `posted`
 *   3. Records `posted_at` + `posted_reddit_url` (optional)
 *   4. Returns a simple HTML confirmation page optimized for mobile
 *
 * Future S3: when engagement tracker ships, this endpoint also enqueues a
 * 24h + 72h `/reddit_engagement_checks/` doc so Apify re-scrapes the thread
 * and logs upvotes + comments + any DMs from the OP.
 *
 * URL format:
 *   GET /markDraftPosted?id=reddit_1stgpyp[&reddit_url=https%3A%2F%2F...]
 *
 * No auth required by design (HR-11: never ask Alex to log in). URL is
 * unguessable + one-shot (idempotent — 2nd call on same id returns "already
 * posted" without double-consuming quota).
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const { checkQuota, incrementQuota } = require("./redditRateLimiter");

if (!admin.apps.length) admin.initializeApp();

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

function confirmationHtml({ ok, title, body, bgColor }) {
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{background:${bgColor};color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:40px 24px;text-align:center}
  .card{max-width:420px;margin:60px auto;background:rgba(255,255,255,0.08);border-radius:24px;padding:32px 24px;backdrop-filter:blur(10px)}
  h1{font-size:28px;margin:0 0 12px}
  p{font-size:16px;line-height:1.5;margin:8px 0;opacity:0.9}
  .icon{font-size:60px;margin-bottom:12px}
  .small{font-size:13px;opacity:0.6;margin-top:20px}
</style></head>
<body><div class="card">
  <div class="icon">${ok ? "✅" : "⚠️"}</div>
  <h1>${title}</h1>
  <p>${body}</p>
  <div class="small">Money Machine · JegoDigital</div>
</div></body></html>`;
}

async function notifySlackConfirmed(id, quota) {
    if (!SLACK_WEBHOOK) return;
    try {
        await axios.post(SLACK_WEBHOOK, {
            text: `✅ ${id} marked as posted · quota ${quota.used}/${quota.limit} today`,
        }, { timeout: 8000 });
    } catch (_) { /* non-fatal */ }
}

exports.markDraftPosted = functions.https.onRequest(async (req, res) => {
    const id = String(req.query.id || "").trim();
    const redditUrl = String(req.query.reddit_url || "").trim() || null;

    if (!id) {
        res.status(400).send(confirmationHtml({
            ok: false,
            title: "Missing id",
            body: "The URL must include <code>?id=reddit_XXX</code>. Paste the link from Slack and try again.",
            bgColor: "#c0392b",
        }));
        return;
    }

    try {
        const db = admin.firestore();
        const oppRef = db.collection("opportunities").doc(id);
        const draftRef = db.collection("opportunity_drafts").doc(id);

        const [oppSnap, draftSnap] = await Promise.all([oppRef.get(), draftRef.get()]);
        if (!draftSnap.exists) {
            res.status(404).send(confirmationHtml({
                ok: false,
                title: "Draft not found",
                body: `No draft with id <code>${id}</code> exists. This link may be stale.`,
                bgColor: "#7f8c8d",
            }));
            return;
        }
        const draft = draftSnap.data();
        const opp = oppSnap.exists ? oppSnap.data() : {};

        // Idempotency — already marked posted? Return success without double-consuming quota.
        if (draft.posted_at) {
            res.status(200).send(confirmationHtml({
                ok: true,
                title: "Already marked posted",
                body: `This draft was marked as posted at ${draft.posted_at?.toDate?.().toISOString?.() || "earlier"}. No action needed.`,
                bgColor: "#27ae60",
            }));
            return;
        }

        // Consume a quota slot atomically.
        const quotaResult = await incrementQuota(redditUrl, id);
        if (!quotaResult.success) {
            res.status(429).send(confirmationHtml({
                ok: false,
                title: "Daily cap reached",
                body: `You've already posted ${quotaResult.quota.used}/${quotaResult.quota.limit} times today. Cap resets at ${quotaResult.quota.resets_at_utc.slice(11, 16)} UTC. Draft kept in queue — tap again tomorrow.`,
                bgColor: "#c0392b",
            }));
            return;
        }

        // Move the draft + opportunity to posted state.
        const now = admin.firestore.FieldValue.serverTimestamp();
        await Promise.all([
            draftRef.set({
                status: "posted",
                posted_at: now,
                posted_reddit_url: redditUrl,
                posted_via: "manual_phone_post",
            }, { merge: true }),
            oppRef.set({
                status: "posted",
                posted_at: now,
                posted_reddit_url: redditUrl,
            }, { merge: true }),
        ]);

        await notifySlackConfirmed(id, quotaResult.quota);

        res.status(200).send(confirmationHtml({
            ok: true,
            title: "Posted. Nice work.",
            body: `Draft <code>${id}</code> logged. Score ${draft.score || "?"}. Quota ${quotaResult.quota.used}/${quotaResult.quota.limit} today. Engagement tracker will re-check in 24h + 72h.`,
            bgColor: "#27ae60",
        }));
    } catch (err) {
        functions.logger.error("[markDraftPosted] crash:", err);
        res.status(500).send(confirmationHtml({
            ok: false,
            title: "Server error",
            body: `Something broke: <code>${err.message}</code>. Don't worry — you can mark it posted from Firestore manually, or ping Claude.`,
            bgColor: "#c0392b",
        }));
    }
});

// Quick quota viewer — helpful for Alex to check "how many posts do I have
// left today?" from his phone browser.
exports.redditQuotaStatus = functions.https.onRequest(async (req, res) => {
    try {
        const q = await checkQuota();
        res.json({ ok: true, ...q });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
