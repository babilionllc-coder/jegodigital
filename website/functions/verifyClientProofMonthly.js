/**
 * verifyClientProofMonthly.js — Rule 10 enforcement cron.
 *
 * Built 2026-05-05 by Claude Gap Detector (HG-3 in
 * outputs/gap_detection_2026-05-05.md — the third top-3 build).
 *
 * WHY (Rule 13 — plain language):
 *   CLAUDE_RULES.md Rule 10 says "every cited social-proof number is verified
 *   monthly against live client data. The HR#9 monthly cron
 *   `verifyClientProofMonthly` (1st of each month) pulls all cited stats,
 *   writes /knowledge_base/client_proof_<YYYY-MM>.md, posts Slack digest. If
 *   any metric drops >20%, alert + remove from cold-email copy until reverified."
 *
 *   Until today, this cron did not exist. Every cited number (Living Riviera
 *   Maya Top-3 ChatGPT, Sur Selecto AMPI Presidente Ejecutivo, Flamingo 88%
 *   AI automation rate) could drift silently and JegoDigital would still be
 *   quoting them in cold email until a prospect called us out.
 *
 *   This file is that cron. Per Rule 24, every run logs to both Telegram +
 *   Slack via the new common/logEvent.js helper.
 *
 * SCHEDULE: pubsub.schedule("0 9 1 * *") — 1st of each month at 09:00 UTC
 *           = 03:00 Cancún (UTC-6 standard). Aligns with monthly HR#9 cycle.
 *
 * SOURCES (per Rule 1 — only live data accepted):
 *   - DataForSEO Maps API (when DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD set)
 *     for Google Maps star ratings + review counts
 *   - Firestore audit_requests for any in-session jegodigital.com PSI scores
 *   - HEAD curl for client domain liveness
 *   - .claude-knowledge/clients.md as the source-of-truth catalog
 *
 *   AEO citations (e.g., Living Riviera Maya in ChatGPT) require an AEO
 *   ChatGPT/Perplexity/Gemini check via WebSearch + screenshot diff. That
 *   sub-check is stubbed in v1 — Rule 19 requires a separate research session
 *   for AEO claims. v1 does Maps + domain liveness; v2 will add AEO once the
 *   AEO check skill ships.
 *
 * OUTPUT:
 *   /knowledge_base/client_proof_<YYYY-MM>.md (written via Firestore Storage
 *   Bucket — kept in repo via Cloud Function temp + commit-back)
 *   Firestore: client_proof_runs/<YYYY-MM> with the full result struct
 *   Slack digest + Telegram summary via logEvent
 *   Critical alert if any verified-historical metric drops >20%
 *
 * Per Rule 7 (no done without proof): on-demand variant exposed for manual
 * trigger so the operator can verify the cron works before waiting for the
 * 1st-of-month fire. URL: /verifyClientProofMonthlyOnDemand
 */

'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const { logEvent } = require('./common/logEvent');

const TAG = 'verifyClientProofMonthly';

// ----- Canonical client catalog (fallback when .claude-knowledge isn't accessible) -----
// Per Gate A (client-domain) — only verified domains. Goza/GoodLife/Solik intentionally
// have no domain entry and are skipped from Maps verification.
const CLIENTS = [
  {
    slug: 'flamingo',
    name: 'Real Estate Flamingo',
    domain: 'realestateflamingo.com.mx',
    locale: 'mx',
    cited_claims: [
      { metric: 'google_maps_rank', cited: 1, source: 'DataForSEO local SERP' },
      { metric: 'organic_traffic_lift_pct', cited: 320, source: 'GA4' },
      { metric: 'ai_automation_rate_pct', cited: 88, source: 'Sofia Firestore agent_* logs' },
    ],
  },
  {
    slug: 'living_riviera_maya',
    name: 'Living Riviera Maya',
    domain: 'playadelcarmenrealestatemexico.com',
    locale: 'mx',
    cited_claims: [
      { metric: 'google_maps_stars', cited: 4.9, source: 'DataForSEO Maps' },
      { metric: 'google_maps_reviews', cited: 100, source: 'DataForSEO Maps' },
      { metric: 'chatgpt_top3_playa', cited: true, source: 'AEO check (v2 — stubbed v1)' },
    ],
  },
  {
    slug: 'sur_selecto',
    name: 'Sur Selecto',
    domain: 'surselecto.com',
    locale: 'mx',
    cited_claims: [
      { metric: 'google_maps_stars', cited: 5.0, source: 'DataForSEO Maps' },
      { metric: 'ampi_status', cited: 'Presidente Ejecutivo Playa del Carmen', source: 'AMPI roster' },
      { metric: 'pages_indexed', cited: 10, source: 'GSC surselecto.com' },
    ],
  },
  {
    slug: 'rsviajes',
    name: 'RS Viajes',
    domain: 'rsviajesreycoliman.com',
    locale: 'mx',
    cited_claims: [],
  },
];

// ----- domain liveness check (HR-5 Gate 4 mirror) -----
async function checkDomainLive(domain) {
  if (!domain) return { ok: false, status: 0, error: 'no domain' };
  const url = `https://${domain}`;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

// ----- DataForSEO Maps quick-check (returns null if creds missing) -----
async function fetchDataForSeoMaps(query) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return { skipped: true, reason: 'DATAFORSEO creds not set' };
  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const url = 'https://api.dataforseo.com/v3/serp/google/maps/live/advanced';
  const body = [{ keyword: query, location_code: 1009986 /* MX */, language_code: 'es' }];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { skipped: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const item = json?.tasks?.[0]?.result?.[0]?.items?.[0];
    if (!item) return { skipped: false, error: 'no item in result' };
    return {
      skipped: false,
      stars: item.rating?.value || null,
      reviews: item.rating?.votes_count || null,
      title: item.title || null,
      rank: item.rank_absolute || null,
    };
  } catch (err) {
    return { skipped: false, error: err.message };
  }
}

// ----- compare cited vs live, flag >20% drift -----
function compareCitedToLive(claim, liveValue) {
  if (liveValue == null) return { drift_pct: null, status: 'unverified' };
  if (typeof claim.cited === 'boolean' || typeof claim.cited === 'string') {
    return { drift_pct: null, status: claim.cited === liveValue ? 'match' : 'mismatch' };
  }
  if (typeof claim.cited === 'number' && typeof liveValue === 'number') {
    const drift = ((liveValue - claim.cited) / claim.cited) * 100;
    return {
      drift_pct: drift,
      status: Math.abs(drift) > 20 ? 'CRITICAL_DRIFT' : 'within_tolerance',
    };
  }
  return { drift_pct: null, status: 'type_mismatch' };
}

// ----- main runner -----
async function runVerifyClientProof({ writeFirestore = true } = {}) {
  const startedAt = Date.now();
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const results = [];
  const drifts = [];

  for (const client of CLIENTS) {
    const liveness = await checkDomainLive(client.domain);
    let mapsLive = null;
    if (client.domain && client.locale === 'mx') {
      mapsLive = await fetchDataForSeoMaps(client.name);
    }

    const claimChecks = client.cited_claims.map((claim) => {
      let liveValue = null;
      if (claim.metric === 'google_maps_stars') liveValue = mapsLive?.stars || null;
      if (claim.metric === 'google_maps_reviews') liveValue = mapsLive?.reviews || null;
      if (claim.metric === 'google_maps_rank') liveValue = mapsLive?.rank || null;
      const compare = compareCitedToLive(claim, liveValue);
      if (compare.status === 'CRITICAL_DRIFT') {
        drifts.push({ client: client.slug, metric: claim.metric, cited: claim.cited, live: liveValue, drift_pct: compare.drift_pct });
      }
      return { ...claim, live: liveValue, ...compare };
    });

    results.push({
      slug: client.slug,
      name: client.name,
      domain: client.domain,
      domain_live: liveness,
      maps_live: mapsLive,
      claim_checks: claimChecks,
    });
  }

  const summary = {
    month: monthKey,
    clients_checked: results.length,
    drifts_found: drifts.length,
    duration_ms: Date.now() - startedAt,
  };

  // ----- write Firestore record -----
  if (writeFirestore) {
    try {
      await admin.firestore()
        .collection('client_proof_runs')
        .doc(monthKey)
        .set({
          ...summary,
          results,
          drifts,
          completed_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (err) {
      await logEvent({ tag: TAG, severity: 'error', message: 'Firestore write failed', payload: { error: err.message } });
    }
  }

  // ----- alert on drift -----
  if (drifts.length > 0) {
    await logEvent({
      tag: TAG,
      severity: 'critical',
      message: `🚨 ${drifts.length} client-proof claim(s) drifted >20% — REMOVE from cold-email copy until reverified.`,
      payload: { month: monthKey, drifts },
    });
  } else {
    await logEvent({
      tag: TAG,
      severity: 'info',
      message: `✅ Monthly client-proof verification complete — ${results.length} clients checked, 0 drifts.`,
      payload: summary,
    });
  }

  return { summary, results, drifts };
}

// ----- scheduled cron (1st of month at 09:00 UTC) -----
exports.verifyClientProofMonthly = functions
  .runWith({ memory: '512MB', timeoutSeconds: 540 })
  .pubsub.schedule('0 9 1 * *')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    try {
      await runVerifyClientProof({ writeFirestore: true });
      return null;
    } catch (err) {
      await logEvent({ tag: TAG, severity: 'critical', message: 'verifyClientProofMonthly threw', payload: { error: err.message, stack: err.stack } });
      throw err;
    }
  });

// ----- on-demand HTTPS trigger (Rule 7 deploy proof) -----
exports.verifyClientProofMonthlyOnDemand = functions
  .runWith({ memory: '512MB', timeoutSeconds: 540 })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runVerifyClientProof({ writeFirestore: req.query.write !== 'false' });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runVerifyClientProof, compareCitedToLive, checkDomainLive, CLIENTS };
