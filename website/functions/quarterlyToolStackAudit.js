/**
 * quarterlyToolStackAudit.js — quarterly DEPRECATED.md kill-list refresh.
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-9).
 *
 * WHY:
 *   MCPs, plugins, and skills accumulate. The DEPRECATED.md kill list rots
 *   without a periodic forcing function. This cron audits installed tools
 *   against last-90-day usage signals and proposes additions to DEPRECATED.md.
 *
 *   Read-only. Surface-only. Never modifies DEPRECATED.md.
 *
 * SCHEDULE: 1st of every quarter (Jan/Apr/Jul/Oct), 04:00 Cancún → `0 9 1 1,4,7,10 *`
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /tool_stack_audits/{YYYY-Q#} doc.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEPRECATED_PATH = path.join(REPO_ROOT, 'DEPRECATED.md');
const FN_DIR = path.join(REPO_ROOT, 'website', 'functions');

const QUARTER_DAYS = 90;

function quarterKey(d) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

/**
 * Use Firestore tool-usage tracking (per-tag invocation counts) when available.
 * For v1 we approximate by scanning Cloud Function logs proxy:
 * `cron_health/{name}` last_run_ts older than 90d → dormant candidate.
 */
async function findDormantFunctions(db) {
  const out = [];
  try {
    const snap = await db.collection('cron_health').limit(500).get();
    snap.forEach((d) => {
      const x = d.data() || {};
      const last = x.last_success_ts?.toDate?.() || x.last_run_ts?.toDate?.() || null;
      if (!last) return;
      const ageDays = (Date.now() - last.getTime()) / (24 * 3600 * 1000);
      if (ageDays > QUARTER_DAYS) {
        out.push({ name: d.id, age_days: Math.floor(ageDays) });
      }
    });
  } catch (err) {
    console.warn('cron_health scan failed:', err.message);
  }
  return out;
}

/**
 * Scan DEPRECATED.md to count current kill-list size — useful trend metric.
 */
function readDeprecatedKillCount() {
  try {
    const text = fs.readFileSync(DEPRECATED_PATH, 'utf8');
    const killCount = (text.match(/^[-*]\s+/gm) || []).length;
    return { exists: true, kill_lines: killCount, size_bytes: text.length };
  } catch {
    return { exists: false };
  }
}

async function runAudit() {
  const db = admin.firestore();
  const now = new Date();
  const qKey = quarterKey(now);

  const dormant = await findDormantFunctions(db);
  const deprecated = readDeprecatedKillCount();

  // Cloud Function file count (orphan baseline)
  let totalFnFiles = 0;
  try {
    totalFnFiles = fs.readdirSync(FN_DIR).filter((n) => n.endsWith('.js') && !n.startsWith('_')).length;
  } catch { /* noop */ }

  await db.collection('tool_stack_audits').doc(qKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    quarter: qKey,
    dormant_function_count: dormant.length,
    dormant_top: dormant.sort((a, b) => b.age_days - a.age_days).slice(0, 20),
    deprecated_md: deprecated,
    total_function_files: totalFnFiles,
  }, { merge: true });

  const severity = dormant.length >= 10 ? 'warn' : 'info';
  await logEvent({
    tag: 'quarterlyToolStackAudit',
    severity,
    message: `🔧 ${qKey} stack audit — ${dormant.length} dormant function(s) · ${deprecated.kill_lines || '?'} deprecated lines · ${totalFnFiles} function files`,
    payload: { quarter: qKey, dormant_count: dormant.length, top_dormant: dormant.slice(0, 5) },
  });

  return { ok: true, quarter: qKey, dormant: dormant.length, deprecated, totalFnFiles };
}

exports.quarterlyToolStackAudit = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .pubsub.schedule('0 9 1 1,4,7,10 *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runAudit());

exports.quarterlyToolStackAuditOnDemand = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runAudit();
      res.status(200).json(result);
    } catch (err) {
      console.error('quarterlyToolStackAudit onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runAudit, quarterKey, findDormantFunctions };
