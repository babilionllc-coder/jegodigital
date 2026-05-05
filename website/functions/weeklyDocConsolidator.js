/**
 * weeklyDocConsolidator.js — semantic-similarity proposal cron (read-only).
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-8).
 *
 * WHY (per `doc-consolidator` skill):
 *   .md files multiply. Same rule body lives in 3 places. README's drift.
 *   This cron walks the repo's top-level .md files, computes coarse-Jaccard
 *   similarity over header sets + first 200 chars of each section, and
 *   proposes (NEVER executes) candidate merges via Telegram + Slack.
 *
 *   Embedding-based similarity is overkill for v1; Jaccard over normalized
 *   tokens catches the >70%-overlap cases. v2 can swap in OpenAI embeddings.
 *
 * SCHEDULE: 1st of each month, 04:00 Cancún (= 09:00 UTC) → `0 9 1 * *`
 *           Stagger off monthlyRulebookReview by adding `* * 1` only-day-of-mo.
 *           NOTE: cron `0 9 1 * *` is shared with monthlyRulebookReview;
 *                 we offset to `30 9 1 * *` to keep them sequential not stacked.
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /doc_consolidation_proposals/{YYYY-MM} with results.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SIMILARITY_THRESHOLD = 0.5; // Jaccard ≥ 0.5 = candidate for merge proposal

function listTopMarkdown() {
  try {
    return fs.readdirSync(REPO_ROOT)
      .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n !== 'README.md')
      .map((n) => path.join(REPO_ROOT, n));
  } catch { return []; }
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

/**
 * Tokenize: lowercased headers + words ≥4 chars (drop common stopwords).
 */
const STOP = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'when', 'what',
  'must', 'never', 'always', 'every', 'each', 'some', 'into', 'than', 'then',
  'there', 'their', 'they', 'them', 'about', 'which', 'where', 'rule', 'rules']);
function tokenize(text) {
  const headers = (text.match(/^#+\s+(.+)$/gm) || []).map((h) => h.toLowerCase());
  const words = (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w));
  return new Set([...headers, ...words]);
}
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter++;
  return inter / (a.size + b.size - inter);
}

async function runConsolidation() {
  const files = listTopMarkdown();
  const tokens = files.map((f) => ({ file: path.basename(f), tokens: tokenize(safeRead(f)) }));

  const pairs = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const sim = jaccard(tokens[i].tokens, tokens[j].tokens);
      if (sim >= SIMILARITY_THRESHOLD) {
        pairs.push({ a: tokens[i].file, b: tokens[j].file, similarity: Math.round(sim * 100) / 100 });
      }
    }
  }
  pairs.sort((x, y) => y.similarity - x.similarity);

  const monthKey = new Date().toISOString().slice(0, 7);
  await admin.firestore().collection('doc_consolidation_proposals').doc(monthKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    files_scanned: files.length,
    candidate_pairs: pairs.slice(0, 30),
    threshold: SIMILARITY_THRESHOLD,
  }, { merge: true });

  const severity = pairs.length >= 5 ? 'warn' : 'info';
  await logEvent({
    tag: 'weeklyDocConsolidator',
    severity,
    message: pairs.length === 0
      ? `📚 No high-similarity .md pairs found across ${files.length} files`
      : `📚 ${pairs.length} merge candidate(s) found — top: ${pairs.slice(0, 3).map((p) => `${p.a}↔${p.b} (${p.similarity})`).join(' · ')}`,
    payload: { month: monthKey, files_scanned: files.length, top_pairs: pairs.slice(0, 5) },
  });
  return { ok: true, files_scanned: files.length, candidate_pairs: pairs.length, top: pairs.slice(0, 10) };
}

exports.weeklyDocConsolidator = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .pubsub.schedule('30 9 1 * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runConsolidation());

exports.weeklyDocConsolidatorOnDemand = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runConsolidation();
      res.status(200).json(result);
    } catch (err) {
      console.error('weeklyDocConsolidator onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runConsolidation, jaccard, tokenize };
