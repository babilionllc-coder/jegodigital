/**
 * googleReviewsSync — Live Google Maps Reviews → Firestore cache → Public API
 *
 * Pipeline:
 *   1. Daily cron (04:00 CDMX) calls Apify `compass/Google-Maps-Reviews-Scraper`
 *      with the JegoDigital Google Maps search URL.
 *   2. Filters out empty-text reviews (visual cards need real testimonials only).
 *   3. Normalizes each review into a stable shape (no Apify-internal fields).
 *   4. Writes to Firestore /public/google_reviews/{reviewId} (full set).
 *   5. Writes summary to /public/google_reviews_meta/summary
 *      (placeName, rating, reviewsCount, lastUpdated, top3 reviewIds).
 *   6. Public HTTPS endpoint returns the cached JSON for the homepage.
 *
 * Source of truth (per HR-0): Apify scrape returns Google's actual rating + count.
 * The homepage will reflect the real number, never a fabricated "5.0".
 *
 * HR-9 alignment: This is the missing freshness loop for client proof — every
 * day at 4am we pull live and write to client_proof_<YYYY-MM-DD>.md style log.
 *
 * Env required (loaded from Firebase Functions config OR website/functions/.env):
 *   APIFY_API_KEY  — Apify token (already in deploy.yml secrets)
 *
 * Cron:
 *   - googleReviewsSync           pubsub @ "0 4 * * *" America/Mexico_City
 *   - googleReviewsSyncOnDemand   HTTPS (debug / one-shot refresh)
 *   - getGoogleReviews            HTTPS (public, CORS-open, returns cache)
 *
 * Manual trigger:
 *   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/googleReviewsSyncOnDemand"
 *
 * Public read (used by homepage):
 *   curl -sS "https://jegodigital.com/api/google-reviews"
 *   curl -sS "https://us-central1-jegodigital-e02fb.cloudfunctions.net/getGoogleReviews"
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_ACTOR = "compass~Google-Maps-Reviews-Scraper";

// JegoDigital Google Maps search URL — Apify resolves this to the GMB listing.
// Source: https://share.google/EIfjKkHKNC4sctIYt → kgmid /g/11zhmvt3cs
//        → JegoDigital - Agencia de Marketing Inmobiliario (Cancún).
const PLACE_SEARCH_URL = "https://www.google.com/maps/search/JegoDigital+Cancun/";

// Maximum reviews to sync per run. Apify charges per result; we only need the
// most recent N for the homepage. 50 is well above current volume (9 as of
// 2026-04-25) and gives runway for a year of growth before bumping.
const MAX_REVIEWS = 50;

// Minimum text length for a review to be eligible for the homepage. Empty-text
// reviews (just star rating, no comment) look broken in card layout.
const MIN_TEXT_LENGTH = 8;

// Star floor for homepage display. We sync ALL reviews to Firestore but only
// surface ≥4-star on the public component. Owners reply to lower scores
// directly, no reason to amplify them.
const HOMEPAGE_MIN_STARS = 4;

// Top N reviews highlighted in the homepage 3-card grid.
const HOMEPAGE_TOP_N = 3;

/**
 * Run Apify Google-Maps-Reviews-Scraper synchronously (run-sync-get-dataset-items).
 * Returns array of review items.
 */
async function fetchFromApify(apifyToken) {
    if (!apifyToken) throw new Error("APIFY_API_KEY missing");

    const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=180`;
    const body = {
        startUrls: [{ url: PLACE_SEARCH_URL }],
        maxReviews: MAX_REVIEWS,
        language: "en",          // forces Apify's UI/sort to EN; review originalLanguage preserved
        reviewsSort: "newest",
    };

    const resp = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" },
        timeout: 200000,
        validateStatus: () => true,
    });

    if (resp.status !== 200 && resp.status !== 201) {
        throw new Error(`Apify HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 300)}`);
    }
    if (!Array.isArray(resp.data)) {
        if (resp.data && resp.data.error) {
            throw new Error(`Apify error: ${resp.data.error.message || JSON.stringify(resp.data.error)}`);
        }
        throw new Error(`Apify unexpected payload: ${JSON.stringify(resp.data).slice(0, 300)}`);
    }
    return resp.data;
}

/**
 * Normalize a raw Apify review row into our stable shape. Drops vendor fields,
 * keeps only what the homepage card + Schema.org markup actually need.
 */
function normalizeReview(raw) {
    const reviewId = raw.reviewId || raw.reviewUrl || "";
    if (!reviewId) return null;

    return {
        reviewId,
        name: raw.name || "Anonymous",
        photoUrl: raw.reviewerPhotoUrl || null,
        reviewerUrl: raw.reviewerUrl || null,
        isLocalGuide: !!raw.isLocalGuide,
        reviewerNumberOfReviews: raw.reviewerNumberOfReviews || 0,
        stars: raw.stars || 0,
        text: (raw.text || "").trim(),
        textTranslated: (raw.textTranslated || "").trim(),
        originalLanguage: raw.originalLanguage || null,
        publishedAtDate: raw.publishedAtDate || null,
        publishAt: raw.publishAt || null,        // human-readable relative ("2 hours ago")
        likesCount: raw.likesCount || 0,
        reviewUrl: raw.reviewUrl || null,
        ownerResponse: raw.responseFromOwnerText
            ? { text: raw.responseFromOwnerText, date: raw.responseFromOwnerDate }
            : null,
        // Place-level metadata (same on every row from Apify). Captured here so
        // we don't need a separate places call.
        _placeRating: raw.totalScore || null,
        _placeReviewsCount: raw.reviewsCount || null,
        _placeTitle: raw.title || null,
    };
}

/**
 * Write all normalized reviews to Firestore plus a summary doc.
 * Returns the summary object.
 */
async function writeToFirestore(reviews) {
    const db = admin.firestore();

    if (!reviews.length) {
        functions.logger.warn("googleReviewsSync: 0 reviews returned — keeping previous cache untouched");
        return { written: 0, skipped: 0, kept: true };
    }

    // Place metadata is identical across rows. Take from the first.
    const placeRating = reviews[0]._placeRating;
    const placeReviewsCount = reviews[0]._placeReviewsCount;
    const placeTitle = reviews[0]._placeTitle;

    // Filter for homepage display: has text, meets star floor.
    const eligible = reviews.filter(
        (r) => r.text.length >= MIN_TEXT_LENGTH && r.stars >= HOMEPAGE_MIN_STARS,
    );

    // Sort eligible by quality heuristic: stars desc, then text length desc, then date desc.
    eligible.sort((a, b) => {
        if (b.stars !== a.stars) return b.stars - a.stars;
        if (b.text.length !== a.text.length) return b.text.length - a.text.length;
        return (b.publishedAtDate || "").localeCompare(a.publishedAtDate || "");
    });

    const top3Ids = eligible.slice(0, HOMEPAGE_TOP_N).map((r) => r.reviewId);

    // Write each review. Use a deterministic doc ID derived from reviewId.
    const batch = db.batch();
    const reviewsCol = db.collection("public").doc("google_reviews").collection("items");

    // Stale-write guard: clear existing items so deleted reviews don't linger.
    // Done as a separate read+delete to keep batch atomic.
    const existingSnap = await reviewsCol.get();
    existingSnap.docs.forEach((doc) => batch.delete(doc.ref));

    reviews.forEach((r) => {
        const docId = r.reviewId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200) || `r_${Date.now()}`;
        const docRef = reviewsCol.doc(docId);
        // Strip _placeXxx metadata before persisting per-review.
        const {
            _placeRating: _pr, _placeReviewsCount: _prc, _placeTitle: _pt, ...persisted
        } = r;
        batch.set(docRef, {
            ...persisted,
            eligible: r.text.length >= MIN_TEXT_LENGTH && r.stars >= HOMEPAGE_MIN_STARS,
            top: top3Ids.includes(r.reviewId),
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

    // Compact projection used by both `top3` and `all` arrays.
    const projectReview = (r) => ({
        reviewId: r.reviewId,
        name: r.name,
        photoUrl: r.photoUrl,
        reviewerUrl: r.reviewerUrl,
        isLocalGuide: r.isLocalGuide,
        stars: r.stars,
        text: r.text,
        textTranslated: r.textTranslated,
        originalLanguage: r.originalLanguage,
        publishAt: r.publishAt,
        publishedAtDate: r.publishedAtDate,
        reviewUrl: r.reviewUrl,
    });

    // Summary doc — single read for the public endpoint.
    const summaryRef = db.collection("public").doc("google_reviews");
    const summary = {
        placeTitle,
        placeRating: placeRating || null,
        placeReviewsCount: placeReviewsCount || reviews.length,
        eligibleCount: eligible.length,
        top3Ids,
        // Inline top 3 — server-rendered SEO/Schema.org fallback (no-JS users + crawlers).
        top3: eligible.slice(0, HOMEPAGE_TOP_N).map(projectReview),
        // Inline ALL eligible reviews — drives the 2-row auto-scrolling marquee.
        // Bounded to MAX_REVIEWS so the JSON payload never blows up.
        all: eligible.slice(0, MAX_REVIEWS).map(projectReview),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedISO: new Date().toISOString(),
    };
    batch.set(summaryRef, summary, { merge: true });

    await batch.commit();
    functions.logger.info(
        `googleReviewsSync wrote ${reviews.length} reviews | rating ${placeRating} | top3: ${top3Ids.join(", ")}`,
    );

    return {
        written: reviews.length,
        skipped: existingSnap.size,
        eligible: eligible.length,
        placeRating,
        placeReviewsCount,
        top3Ids,
    };
}

/**
 * Core run — used by both the scheduler and the on-demand HTTPS trigger.
 */
async function runSync() {
    const apifyToken = process.env.APIFY_API_KEY || functions.config().apify?.api_key;
    const raw = await fetchFromApify(apifyToken);
    const normalized = raw.map(normalizeReview).filter(Boolean);
    return writeToFirestore(normalized);
}

// ============================================================
// EXPORTS
// ============================================================

// Scheduled — daily at 04:00 America/Mexico_City (low-traffic hour).
exports.googleReviewsSync = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("0 4 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        try {
            const result = await runSync();
            functions.logger.info("googleReviewsSync OK:", JSON.stringify(result));
            return null;
        } catch (err) {
            functions.logger.error("googleReviewsSync FAILED:", err.message, err.stack);
            return null;
        }
    });

// On-demand HTTPS — call after deploy or when Alex wants a fresh pull.
exports.googleReviewsSyncOnDemand = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const result = await runSync();
            res.json({ ok: true, result });
        } catch (err) {
            functions.logger.error("googleReviewsSyncOnDemand failed:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

// Public read — used by the homepage <script> on every page load.
// Returns the summary doc directly (top3 inline = single Firestore read).
exports.getGoogleReviews = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        // CORS — open to anyone; this is public marketing data.
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        // Short CDN cache — fresh syncs propagate to live homepage in <1 min.
        // Tradeoff: ~1 Firestore read per visitor per minute (cheap; ~$0.10/100k reads).
        res.set("Cache-Control", "public, max-age=60, s-maxage=60");
        if (req.method === "OPTIONS") return res.status(204).end();

        try {
            const db = admin.firestore();
            const snap = await db.collection("public").doc("google_reviews").get();
            if (!snap.exists) {
                return res.status(503).json({
                    ok: false,
                    error: "reviews not yet synced",
                });
            }
            const data = snap.data() || {};
            // Strip server timestamp object (returns as { _seconds, _nanoseconds }) — use ISO instead.
            delete data.lastUpdated;
            // `reviews` (top 3) preserved for backwards compat; `all` is the new
            // marquee-driving field. Old clients ignore `all`, new clients prefer it.
            res.json({
                ok: true,
                placeTitle: data.placeTitle || null,
                placeRating: data.placeRating || null,
                placeReviewsCount: data.placeReviewsCount || null,
                eligibleCount: data.eligibleCount || 0,
                lastUpdatedISO: data.lastUpdatedISO || null,
                reviews: data.top3 || [],
                all: data.all || data.top3 || [],
            });
        } catch (err) {
            functions.logger.error("getGoogleReviews failed:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

// Internal exports for unit tests / shell debugging.
exports._runSync = runSync;
exports._fetchFromApify = fetchFromApify;
exports._normalizeReview = normalizeReview;
