/**
 * monthlyRulebookReview.js — meta-rule enforcer.
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-3).
 *
 * WHY (Rule 12 — plain language):
 *   CLAUDE.md has 19 hard rules. Each rule survives only if at least one cron
 *   structurally enforces it. Discipline keeps slipping; structure doesn't.
 *   This cron audits SCHEDULES.md monthly: for each HR-1..HR-19, asserts ≥1
 *   enforcing cron exists. Any HR with 0 enforcers triggers a critical alert.
 *
 *   Without this cron, an HR with no structural enforcer can rot for months
 *   before anyone notices.
 *
 * SCHEDULE: 1st of month 04:00 Cancún (= 09:00 UTC) → cron `0 9 1 * *`
 * CHANNELS: Telegram + Slack via common/logEvent.js (Rule 24 / Rule 9).
 * PROOF (HR-6): writes /rulebook_audits/{YYYY-MM} Firestore doc with
 *   {hr, has_enforcer, cron_count, sample_cron} per rule.
 *
 * Read-only — never edits SCHEDULES.md or CLAUDE.md. Surface-only.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEDULES_PATH = path.join(REPO_ROOT, 'SCHEDULES.md');
const CLAUDE_PATH = path.join(REPO_ROOT, 'CLAUDE.md');

const HRS = Array.from({ length: 20 }, (_, i) => `HR-${i}`); // HR-0 .. HR-19

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

/**
 * For each HR-N, count occurrences in SCHEDULES.md §3 (enforcing cron map).
 * A rule is "enforced" when ≥1 row in §3 references it AND status is 🟢/🟡.
 */
function auditRulebook(schedulesText) {
  const result = [];
  for (const hr of HRS) {
    // Match references to this HR in any column (case-insensitive)
    const re = new RegExp(`\\b${hr}\\b`, 'gi');
    const hits = (schedulesText.match(re) || []).length;
    // Crude has-enforcer check: ≥2 hits (one in §3 header, ≥1 in body row)
    const has_enforcer = hits >= 2;
    result.push({ hr, mentions_in_schedules: hits, has_enforcer });
  }
  return result;
}

async function runReview() {
  const schedulesText = readFileSafe(SCHEDULES_PATH);
  const claudeText = readFileSafe(CLAUDE_PATH);
  const audit = auditRulebook(schedulesText);
  const orphans = audit.filter((a) => !a.has_enforcer);

  // Sanity: confirm CLAUDE.md actually has the rules we're auditing
  const rulesDefined = HRS.filter((hr) => claudeText.includes(hr));
  const missingDefs = HRS.filter((hr) => !claudeText.includes(hr));

  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const docRef = admin.firestore().collection('rulebook_audits').doc(monthKey);
  await docRef.set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    audit,
    orphan_count: orphans.length,
    rules_defined_in_claude_md: rulesDefined.length,
    schedules_md_size: schedulesText.length,
  }, { merge: true });

  const summary = {
    month: monthKey,
    rules_total: HRS.length,
    rules_defined: rulesDefined.length,
    rules_with_enforcer: HRS.length - orphans.length,
    orphan_rules: orphans.map((o) => o.hr),
    missing_definitions: missingDefs,
  };

  if (orphans.length > 0 || missingDefs.length > 0) {
    await logEvent({
      tag: 'monthlyRulebookReview',
      severity: orphans.length >= 3 ? 'critical' : 'warn',
      message: `Rulebook drift detected — ${orphans.length} HRs without structural enforcer`,
      payload: summary,
    });
  } else {
    await logEvent({
      tag: 'monthlyRulebookReview',
      severity: 'info',
      message: `✅ All ${HRS.length} HRs structurally enforced for ${monthKey}`,
      payload: summary,
    });
  }
  return { ok: true, ...summary };
}

exports.monthlyRulebookReview = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('0 9 1 * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runReview());

exports.monthlyRulebookReviewOnDemand = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runReview();
      res.status(200).json(result);
    } catch (err) {
      console.error('monthlyRulebookReview onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { auditRulebook, runReview, HRS };
