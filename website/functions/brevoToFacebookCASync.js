/**
 * brevoToFacebookCASync.js — DEPRECATED 2026-05-05 PM (Wave 2 Ship-It dedupe).
 *
 * This module was the morning v1 of the Brevo→FB Custom Audience mirror.
 * It was superseded by `syncBrevoToFbCustomAudiences.js` during the same-day
 * Wave 2 ship-it pass on 2026-05-05.
 *
 * Why v1 was rejected (independent score, Rule 14.1):
 *   - Hardcoded Telegram bot token in source (line 44-45 of v1) — violates
 *     DEPLOY.md guard rail #2 ("Don't push secrets in file contents") and
 *     would fail the GH secret scanner with HTTP 422.
 *   - Delta-only sync (modifiedSince=24h) — does NOT backfill the 1,250
 *     existing Brevo contacts that were never reaching FB, which was the
 *     audit gap the build was supposed to close.
 *   - 2-tier CA resolution (lookup/create) vs v2's 4-tier (env/Firestore-
 *     cache/lookup/create) — Rule 25 weak (Alex re-asked for CA id).
 *   - Silent on Rule 7 (no verification_tag, no discrepancy detection).
 *   - Inlined Telegram caller instead of using the standardized
 *     `telegramHelper.notify` helper.
 *
 * The replacement (`syncBrevoToFbCustomAudiences.js`) carries:
 *   - Full-mirror sync (closes the backfill gap).
 *   - 4-tier CA resolution.
 *   - Rule 7 verification_tag + push-vs-eligible discrepancy alert.
 *   - Critical Firestore-snapshot-fail alert.
 *   - Block Kit Slack digest.
 *
 * One feature lost in dedupe (filed as follow-up TODO):
 *   - Auto-creation of `JegoDigital_Brevo_Nurture_LAL1` Lookalike when the
 *     warm pool grows past 1,000 contacts. Not urgent — current pool is
 *     1,250 (barely over threshold). Port to v2 once pool exceeds 2,500.
 *
 * If you require this file, you'll get a hard error so no live cron silently
 * uses the dead code path.
 */

throw new Error(
    "brevoToFacebookCASync.js is DEPRECATED 2026-05-05. " +
    "Use syncBrevoToFbCustomAudiences.js (the v2 full-mirror replacement). " +
    "See header docstring for details."
);
