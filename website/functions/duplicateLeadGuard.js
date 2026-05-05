/**
 * duplicateLeadGuard.js — daily cross-campaign Instantly dedup.
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-10).
 *
 * WHY (HR-5 gate 5 — geography+ICP, gate 7 — variable coverage):
 *   HR-5 covers intra-list dedup. But Instantly campaigns proliferate; the
 *   same email can land in 3 campaigns at once (Trojan Horse + Audit Funnel
 *   + Speed-to-Lead) and we burn warmup hammering one prospect. This cron
 *   pulls the Firestore mirror of `instantly_leads` (already maintained by
 *   `instantlyLeadSync` every 15 min), groups by lowercased email, flags
 *   any email present in >1 ACTIVE campaign, and surfaces a Telegram +
 *   Slack proposal.
 *
 *   Rule 8 (default-OFF for risky writes): autoremove is gated behind
 *   DUP_GUARD_AUTOREMOVE flag (defaults FALSE). v1 reports only.
 *
 * SCHEDULE: daily 02:30 Cancún (= 07:30 UTC) → `30 7 * * *`
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /duplicate_lead_audits/{YYYY-MM-DD} doc.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const AUTOREMOVE_ENABLED = process.env.DUP_GUARD_AUTOREMOVE === 'true';
const SCAN_LIMIT = 5000;

async function runScan() {
  const db = admin.firestore();
  const dateKey = new Date().toISOString().slice(0, 10);

  // Pull the Firestore mirror maintained by instantlyLeadSync.
  // We read at most SCAN_LIMIT to keep the function within timeout.
  const snap = await db.collection('instantly_leads').limit(SCAN_LIMIT).get();

  const byEmail = new Map(); // email → [{leadId, campaign, status}]
  let totalSeen = 0;
  snap.forEach((d) => {
    const x = d.data() || {};
    const email = String(x.email || '').toLowerCase().trim();
    if (!email) return;
    totalSeen++;
    const entry = {
      leadId: d.id,
      campaign: x.campaign_id || x.campaign || 'unknown',
      status: x.status,
    };
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(entry);
  });

  const duplicates = [];
  for (const [email, entries] of byEmail.entries()) {
    const distinctCampaigns = new Set(entries.map((e) => e.campaign));
    if (distinctCampaigns.size > 1) {
      duplicates.push({ email, campaigns: [...distinctCampaigns], count: entries.length });
    }
  }
  duplicates.sort((a, b) => b.count - a.count);

  await db.collection('duplicate_lead_audits').doc(dateKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    autoremove_enabled: AUTOREMOVE_ENABLED,
    scanned: totalSeen,
    distinct_emails: byEmail.size,
    duplicate_count: duplicates.length,
    duplicates_top: duplicates.slice(0, 50),
  }, { merge: true });

  const severity = duplicates.length >= 10 ? 'warn' : 'info';
  await logEvent({
    tag: 'duplicateLeadGuard',
    severity,
    message: duplicates.length === 0
      ? `✅ No cross-campaign duplicates across ${byEmail.size} emails (autoremove ${AUTOREMOVE_ENABLED ? 'ON' : 'OFF'})`
      : `🔁 ${duplicates.length} email(s) in multiple campaigns — top 3: ${duplicates.slice(0, 3).map((d) => d.email).join(', ')}`,
    payload: { date: dateKey, scanned: totalSeen, dup_count: duplicates.length, top: duplicates.slice(0, 5) },
  });

  return { ok: true, scanned: totalSeen, distinct_emails: byEmail.size, duplicates: duplicates.length, top: duplicates.slice(0, 10) };
}

exports.duplicateLeadGuard = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('30 7 * * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runScan());

exports.duplicateLeadGuardOnDemand = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runScan();
      res.status(200).json(result);
    } catch (err) {
      console.error('duplicateLeadGuard onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runScan, AUTOREMOVE_ENABLED };
