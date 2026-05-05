/**
 * cleanupWatcher.js — weekly autonomous cruft detector (proposal-only).
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-7).
 *
 * WHY (per `cleanup-watcher` skill):
 *   Skill patches accumulate. Cloud Functions go dormant. Custom Audiences
 *   linger after campaigns die. Output files pile up. Nobody notices until
 *   someone runs out of time to clean. This cron scans READ-ONLY for cruft
 *   candidates and proposes archive/delete via Telegram + Slack with a 14-day
 *   silent-timeout to auto-archive (separate auto-archive cron not yet wired).
 *
 *   Rule 8 (default-OFF for anything risky): this version PROPOSES only.
 *   Auto-archive is gated behind feature flag CLEANUP_WATCHER_AUTO_ARCHIVE
 *   which defaults to "false". A proposal must get an explicit Alex 👍 in the
 *   resulting Telegram thread before any file is touched.
 *
 * SCHEDULE: Sunday 22:00 Cancún (= Mon 03:00 UTC) → `0 3 * * 1`
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /cleanup_proposals/{YYYY-MM-DD} with all candidates.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_PATCHES = path.join(REPO_ROOT, 'skills_patches');
const OUTPUTS_DIR = path.join(REPO_ROOT, 'outputs');
const FN_DIR = path.join(REPO_ROOT, 'website', 'functions');

// Rule 8 — default-OFF feature flag
const AUTO_ARCHIVE_ENABLED = process.env.CLEANUP_WATCHER_AUTO_ARCHIVE === 'true';

const DAY_MS = 24 * 3600 * 1000;
const STALE_DAYS = 14;
const VERY_STALE_DAYS = 30;

function safeListWithMtime(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir).map((name) => {
      const p = path.join(dir, name);
      try {
        const s = fs.statSync(p);
        return { name, path: p, mtime: s.mtimeMs, isFile: s.isFile() };
      } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function ageDays(mtime) {
  return (Date.now() - mtime) / DAY_MS;
}

async function runScan() {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  // 1. Skill patches older than 30 days = candidate for archive
  const patches = safeListWithMtime(SKILLS_PATCHES)
    .filter((e) => e.isFile && e.name.endsWith('.md'))
    .map((e) => ({ ...e, ageDays: Math.floor(ageDays(e.mtime)) }))
    .filter((e) => e.ageDays >= VERY_STALE_DAYS);

  // 2. Outputs older than 14 days = candidate for cleanup
  const outputs = safeListWithMtime(OUTPUTS_DIR)
    .filter((e) => e.isFile)
    .map((e) => ({ ...e, ageDays: Math.floor(ageDays(e.mtime)) }))
    .filter((e) => e.ageDays >= STALE_DAYS);

  // 3. Cloud Function files NOT referenced from index.js = orphan candidates
  const orphanFns = [];
  try {
    const indexJs = fs.readFileSync(path.join(FN_DIR, 'index.js'), 'utf8');
    const fnFiles = fs.readdirSync(FN_DIR)
      .filter((n) => n.endsWith('.js') && !n.startsWith('_') && n !== 'index.js')
      .map((n) => n.replace(/\.js$/, ''));
    for (const f of fnFiles) {
      // Look for `require('./<name>')` or `require("./<name>")`
      const re = new RegExp(`require\\(['"]\\.\/${f.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]\\)`);
      if (!re.test(indexJs)) orphanFns.push({ file: `${f}.js` });
    }
  } catch (err) {
    console.warn('orphan scan failed:', err.message);
  }

  const proposal = {
    date: dateKey,
    auto_archive_enabled: AUTO_ARCHIVE_ENABLED,
    skill_patches_stale: patches.slice(0, 20).map((p) => ({ name: p.name, age_days: p.ageDays })),
    outputs_stale: outputs.slice(0, 20).map((o) => ({ name: o.name, age_days: o.ageDays })),
    orphan_function_files: orphanFns.slice(0, 30),
  };

  await admin.firestore().collection('cleanup_proposals').doc(dateKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    ...proposal,
    skill_patches_total: patches.length,
    outputs_total: outputs.length,
    orphan_count: orphanFns.length,
  }, { merge: true });

  const total = patches.length + outputs.length + orphanFns.length;
  const severity = total >= 30 ? 'warn' : 'info';
  await logEvent({
    tag: 'cleanupWatcher',
    severity,
    message: `🧹 Weekly cleanup proposal — ${patches.length} stale patches · ${outputs.length} old outputs · ${orphanFns.length} orphan functions${AUTO_ARCHIVE_ENABLED ? '' : ' (auto-archive OFF)'}`,
    payload: proposal,
  });

  return { ok: true, ...proposal, totals: { patches: patches.length, outputs: outputs.length, orphanFns: orphanFns.length } };
}

exports.cleanupWatcher = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .pubsub.schedule('0 3 * * 1')
  .timeZone('America/Mexico_City')
  .onRun(async () => runScan());

exports.cleanupWatcherOnDemand = functions
  .runWith({ timeoutSeconds: 180, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runScan();
      res.status(200).json(result);
    } catch (err) {
      console.error('cleanupWatcher onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runScan, AUTO_ARCHIVE_ENABLED };
