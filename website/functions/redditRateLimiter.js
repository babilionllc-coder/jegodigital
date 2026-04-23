/**
 * redditRateLimiter — Money Machine ban-prevention guard (HR-5 for Reddit).
 *
 * Reddit's 90/10 rule is officially retired but moderator judgment now bases
 * ban decisions on behavior patterns: >3 self-promo replies per day from the
 * same account triggers spam-filter shadowban, repeat-offender ban, or sub-
 * level removal. See MONEY_MACHINE.md §8 for the compliance matrix.
 *
 * This helper enforces a GLOBAL HARD CAP of 3 Reddit posts per 24h per our
 * acting account. Used by both the manual-post flow (markDraftPosted) and the
 * future S3 auto-poster. Counter lives in Firestore at
 * /reddit_quota/{YYYY-MM-DD_UTC} with a single `count` field that increments
 * on every successful post-registration.
 *
 * Public API:
 *   checkQuota()        — returns { allowed: boolean, used: N, limit: 3, resets_at_utc }
 *   incrementQuota(url) — atomic increment; rejects if over cap. Records the
 *                         Reddit URL that consumed the slot.
 *
 * Future S3 extensions:
 *   - per-subreddit sub-caps (e.g. r/Entrepreneur max 1/day)
 *   - account hygiene pre-check (reject if account <30d or <500 karma)
 */
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

if (!admin.apps.length) admin.initializeApp();

// Hard cap per MONEY_MACHINE.md §8. Do NOT raise without reading the ban-risk
// doc and enforcing per-subreddit sub-caps first.
const DAILY_LIMIT = 3;

function todayUtcKey() {
    // ISO day in UTC — e.g. "2026-04-23"
    return new Date().toISOString().slice(0, 10);
}

function nextResetIsoUtc() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0); // next midnight UTC
    return d.toISOString();
}

/**
 * Check if a slot is available without consuming it.
 * @returns {{allowed: boolean, used: number, limit: number, resets_at_utc: string}}
 */
async function checkQuota() {
    const db = getFirestore();
    const key = todayUtcKey();
    const snap = await db.collection("reddit_quota").doc(key).get();
    const used = snap.exists ? (snap.data().count || 0) : 0;
    return {
        allowed: used < DAILY_LIMIT,
        used,
        limit: DAILY_LIMIT,
        resets_at_utc: nextResetIsoUtc(),
        day_key: key,
    };
}

/**
 * Atomically consume a slot + record the URL that consumed it.
 * Uses Firestore transaction so two parallel posts can't exceed the cap.
 * @param {string} redditUrl - The live URL of the posted reply (for audit)
 * @param {string} opportunityId - Source opportunity id (for tracing)
 * @returns {{success: boolean, quota: {...}, error?: string}}
 */
async function incrementQuota(redditUrl, opportunityId) {
    const db = getFirestore();
    const key = todayUtcKey();
    const docRef = db.collection("reddit_quota").doc(key);

    try {
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            const current = snap.exists ? (snap.data().count || 0) : 0;
            if (current >= DAILY_LIMIT) {
                return { success: false, current, limit: DAILY_LIMIT };
            }
            const newCount = current + 1;
            const entry = {
                at: admin.firestore.FieldValue.serverTimestamp(),
                reddit_url: redditUrl || null,
                opportunity_id: opportunityId || null,
                slot_number: newCount,
            };
            tx.set(docRef, {
                count: newCount,
                day_key: key,
                last_post_at: admin.firestore.FieldValue.serverTimestamp(),
                posts: admin.firestore.FieldValue.arrayUnion(entry),
            }, { merge: true });
            return { success: true, current: newCount, limit: DAILY_LIMIT };
        });
        return {
            success: result.success,
            quota: {
                used: result.current,
                limit: result.limit,
                allowed: result.current < DAILY_LIMIT,
                day_key: key,
                resets_at_utc: nextResetIsoUtc(),
            },
            error: result.success ? undefined : `daily cap reached (${result.current}/${result.limit})`,
        };
    } catch (err) {
        return {
            success: false,
            quota: await checkQuota(),
            error: `transaction failed: ${err.message}`,
        };
    }
}

module.exports = {
    checkQuota,
    incrementQuota,
    DAILY_LIMIT,
};
