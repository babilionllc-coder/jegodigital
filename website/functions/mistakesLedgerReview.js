/**
 * mistakesLedgerReview.js — repeat-class disaster detector.
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-4).
 *
 * WHY (Rule 17 — self-improvement; HR-10):
 *   DISASTER_LOG.md captures every failure with a `Tag:` line. We only learn
 *   if the same TAG isn't appearing twice within 30 days. This cron reads the
 *   ledger, buckets entries by tag + 30-day rolling window, and alerts when
 *   any tag has ≥2 entries in the window (= repeat class = lesson not learned).
 *
 * SCHEDULE: 1st of month 05:00 Cancún (= 10:00 UTC) → cron `0 10 1 * *`
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /mistake_reviews/{YYYY-MM} with full bucket counts.
 *
 * Read-only — never modifies DISASTER_LOG.md.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DISASTER_LOG_PATH = path.join(REPO_ROOT, 'DISASTER_LOG.md');

/**
 * Parse DISASTER_LOG.md into entries.
 * Each entry expected pattern:
 *   ## YYYY-MM-DD — title
 *   ...
 *   **Tag:** xxx
 */
function parseLedger(text) {
  if (!text) return [];
  const blocks = text.split(/^## (?=\d{4}-\d{2}-\d{2})/m).slice(1);
  const entries = [];
  for (const block of blocks) {
    const dateMatch = block.match(/^(\d{4}-\d{2}-\d{2})/);
    const tagMatch = block.match(/\*\*Tag:?\*\*\s*([a-zA-Z0-9_\-, ]+)/i);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    const tags = tagMatch
      ? tagMatch[1].split(/[,| ]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)
      : ['untagged'];
    entries.push({ date, tags });
  }
  return entries;
}

/**
 * Group by tag. For each tag, count entries within last 30, 60, 90 days.
 * Flag any tag with ≥2 in the last 30 days as "repeat-class".
 */
function bucketByTag(entries) {
  const now = Date.now();
  const days = (n) => now - n * 24 * 3600 * 1000;
  const out = {};
  for (const e of entries) {
    const t = Date.parse(e.date);
    if (Number.isNaN(t)) continue;
    for (const tag of e.tags) {
      out[tag] = out[tag] || { tag, last30: 0, last60: 0, last90: 0, total: 0, recent_dates: [] };
      out[tag].total++;
      if (t >= days(30)) { out[tag].last30++; out[tag].recent_dates.push(e.date); }
      if (t >= days(60)) out[tag].last60++;
      if (t >= days(90)) out[tag].last90++;
    }
  }
  return Object.values(out).sort((a, b) => b.last30 - a.last30 || b.total - a.total);
}

async function runReview() {
  let text = '';
  try { text = fs.readFileSync(DISASTER_LOG_PATH, 'utf8'); } catch { /* ledger may not exist yet */ }
  const entries = parseLedger(text);
  const buckets = bucketByTag(entries);
  const repeatClass = buckets.filter((b) => b.last30 >= 2);

  const monthKey = new Date().toISOString().slice(0, 7);
  await admin.firestore().collection('mistake_reviews').doc(monthKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    total_entries: entries.length,
    distinct_tags: buckets.length,
    repeat_class_count: repeatClass.length,
    repeat_class: repeatClass.slice(0, 20),
    top_tags_by_total: buckets.slice(0, 10).map((b) => ({ tag: b.tag, total: b.total })),
  }, { merge: true });

  const severity = repeatClass.length >= 3 ? 'critical' : (repeatClass.length >= 1 ? 'warn' : 'info');
  await logEvent({
    tag: 'mistakesLedgerReview',
    severity,
    message: repeatClass.length === 0
      ? `✅ No repeat-class mistakes in last 30d (${entries.length} total entries)`
      : `⚠️ ${repeatClass.length} repeat-class tags: ${repeatClass.map((r) => r.tag).join(', ')}`,
    payload: { month: monthKey, total_entries: entries.length, repeat_class: repeatClass.slice(0, 5) },
  });
  return { ok: true, total_entries: entries.length, repeat_class: repeatClass };
}

exports.mistakesLedgerReview = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('0 10 1 * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runReview());

exports.mistakesLedgerReviewOnDemand = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runReview();
      res.status(200).json(result);
    } catch (err) {
      console.error('mistakesLedgerReview onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { parseLedger, bucketByTag, runReview };
