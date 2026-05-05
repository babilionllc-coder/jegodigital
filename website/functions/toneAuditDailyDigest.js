/**
 * toneAuditDailyDigest.js — daily HR-17 + HR-19 compliance digest.
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-11).
 *
 * WHY (HR-17 collaboration tone, HR-19 JegoDigital + niche intro):
 *   SYSTEM.md §0.4 promised a daily tone-audit cron. Today the audit lives
 *   only in `tools/check_collaboration_tone.sh` (gh-actions only, no Telegram
 *   surface). This Cloud Function reads last-24h `messages_audit` Firestore
 *   docs (where every Sofia / cold email / FB ad first-touch should be
 *   logged per §0.2) and computes:
 *
 *     • % messages with intro_present (HR-19) — should be 100%
 *     • % messages with research_grounded (HR-18)
 *     • avg tone_score (HR-17 — collaboration words minus banned words)
 *     • top 5 violations (lowest tone_score with body excerpt)
 *
 *   Reports Telegram + Slack. Alerts CRITICAL when intro_present <95%.
 *
 * SCHEDULE: daily 22:00 Cancún (= 03:00 UTC next day) → `0 3 * * *`
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /tone_audit_digests/{YYYY-MM-DD} doc.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const COLLECTION = 'messages_audit';
const SCAN_LIMIT = 2000;

async function runDigest() {
  const db = admin.firestore();
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const dateKey = new Date().toISOString().slice(0, 10);

  let snap;
  try {
    snap = await db.collection(COLLECTION)
      .where('ts', '>=', admin.firestore.Timestamp.fromDate(since))
      .limit(SCAN_LIMIT)
      .get();
  } catch (err) {
    // Collection may not exist yet (first run before any client-facing send is logged)
    snap = { size: 0, forEach: () => {}, empty: true };
    console.warn('messages_audit collection unavailable:', err.message);
  }

  let total = 0;
  let introPresent = 0;
  let researchGrounded = 0;
  let toneSum = 0;
  let toneScored = 0;
  const byChannel = {};
  const violations = [];

  snap.forEach((d) => {
    const x = d.data() || {};
    total++;
    const ch = String(x.channel || 'unknown');
    byChannel[ch] = (byChannel[ch] || 0) + 1;
    if (x.intro_present === true) introPresent++;
    if (x.research_grounded === true) researchGrounded++;
    if (typeof x.tone_score === 'number') {
      toneSum += x.tone_score;
      toneScored++;
    }
    // Track worst-scoring violations
    if (typeof x.tone_score === 'number' && x.tone_score < 6) {
      violations.push({
        channel: ch,
        tone_score: x.tone_score,
        intro: !!x.intro_present,
        research: !!x.research_grounded,
        excerpt: String(x.body || '').slice(0, 120),
      });
    }
  });
  violations.sort((a, b) => a.tone_score - b.tone_score);

  const summary = {
    date: dateKey,
    total,
    intro_present_pct: total ? Math.round((introPresent / total) * 100) : null,
    research_grounded_pct: total ? Math.round((researchGrounded / total) * 100) : null,
    avg_tone_score: toneScored ? Math.round((toneSum / toneScored) * 10) / 10 : null,
    by_channel: byChannel,
    violations_count: violations.length,
  };

  await db.collection('tone_audit_digests').doc(dateKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    ...summary,
    top_violations: violations.slice(0, 5),
  }, { merge: true });

  // Severity logic (Rule 17 collaboration custodian)
  let severity = 'info';
  let headline;
  if (total === 0) {
    severity = 'info';
    headline = `🎤 No messages_audit entries in last 24h — pipeline silent or audit logging not yet wired`;
  } else if (summary.intro_present_pct < 95) {
    severity = 'critical';
    headline = `🚨 HR-19 violation — only ${summary.intro_present_pct}% of ${total} messages had JegoDigital + niche intro`;
  } else if (summary.avg_tone_score !== null && summary.avg_tone_score < 6) {
    severity = 'warn';
    headline = `⚠️ Avg tone score ${summary.avg_tone_score}/10 across ${total} messages (HR-17 drift)`;
  } else {
    severity = 'info';
    headline = `🎤 Tone audit ${dateKey} — ${total} sends · intro ${summary.intro_present_pct}% · research ${summary.research_grounded_pct}% · avg score ${summary.avg_tone_score ?? 'n/a'}/10`;
  }

  await logEvent({
    tag: 'toneAuditDailyDigest',
    severity,
    message: headline,
    payload: summary,
  });

  return { ok: true, ...summary, top_violations: violations.slice(0, 3) };
}

exports.toneAuditDailyDigest = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .pubsub.schedule('0 3 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runDigest());

exports.toneAuditDailyDigestOnDemand = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runDigest();
      res.status(200).json(result);
    } catch (err) {
      console.error('toneAuditDailyDigest onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runDigest, COLLECTION };
