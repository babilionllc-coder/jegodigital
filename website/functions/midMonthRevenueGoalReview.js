/**
 * midMonthRevenueGoalReview.js — $1M-trajectory checkpoint.
 *
 * Built 2026-05-05 by Schedule Architect (Gap G-6).
 *
 * WHY (HR-7 weekly is too tactical; this is monthly strategic):
 *   The $1M/yr revenue goal demands ~$83K/mo MRR. mondayRevenueReview gives
 *   us week-over-week deltas, but a mid-month checkpoint forces an honest
 *   answer: are we on trajectory, behind, or ahead, with 15 days of runway
 *   left in the month? Anchors planning before the second-half push.
 *
 * SCHEDULE: 15th of every month, 03:00 Cancún (= 08:00 UTC) → `0 8 15 * *`
 * CHANNELS: Telegram + Slack via common/logEvent.js
 * PROOF (HR-6): writes /revenue_goal_reviews/{YYYY-MM} with deltas.
 *
 * SOURCES (HR-0/HR-2 — live only):
 *   - Firestore `revenue_events` collection (manual + Stripe ingest)
 *   - Firestore `monthly_revenue_targets` (config doc with current target)
 *
 *   If no revenue_events docs exist for the month, that itself is the
 *   message: 0 closes, 15 days of runway burned, big rock should pivot
 *   to closing existing pipeline.
 */
'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { logEvent } = require('./common/logEvent');

if (!admin.apps.length) admin.initializeApp();

const ANNUAL_TARGET_USD = 1000000; // $1M / yr stated goal
const MONTHLY_TARGET_USD = ANNUAL_TARGET_USD / 12; // ~$83,333

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

async function sumRevenue(db, fromDate, toDate) {
  const snap = await db.collection('revenue_events')
    .where('ts', '>=', admin.firestore.Timestamp.fromDate(fromDate))
    .where('ts', '<', admin.firestore.Timestamp.fromDate(toDate))
    .limit(1000)
    .get();
  let total = 0;
  let count = 0;
  let lastClose = null;
  snap.forEach((d) => {
    const x = d.data() || {};
    const usd = Number(x.amount_usd || x.amountUsd || 0);
    if (Number.isFinite(usd)) total += usd;
    count++;
    const ts = x.ts?.toDate?.();
    if (ts && (!lastClose || ts > lastClose)) lastClose = ts;
  });
  return { total, count, lastClose };
}

async function runReview() {
  const db = admin.firestore();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  // Pull live; never fabricate
  const monthly = await sumRevenue(db, monthStart, startOfNextMonth(now));
  const ytd = await sumRevenue(db, yearStart, startOfNextMonth(now));

  const monthDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFraction = monthDay / daysInMonth;
  const monthExpected = MONTHLY_TARGET_USD * monthFraction;
  const monthDelta = monthly.total - monthExpected;
  const monthDeltaPct = monthExpected > 0 ? (monthDelta / monthExpected) * 100 : 0;

  const ytdMonths = now.getMonth() + monthFraction; // fractional months elapsed
  const ytdExpected = MONTHLY_TARGET_USD * ytdMonths;
  const ytdDelta = ytd.total - ytdExpected;

  const daysSinceLastClose = monthly.lastClose
    ? Math.floor((Date.now() - monthly.lastClose.getTime()) / (24 * 3600 * 1000))
    : null;

  const monthKey = now.toISOString().slice(0, 7);
  const summary = {
    month: monthKey,
    annual_target_usd: ANNUAL_TARGET_USD,
    monthly_target_usd: Math.round(MONTHLY_TARGET_USD),
    month_to_date_usd: Math.round(monthly.total),
    month_count: monthly.count,
    month_expected_usd: Math.round(monthExpected),
    month_delta_usd: Math.round(monthDelta),
    month_delta_pct: Math.round(monthDeltaPct),
    ytd_usd: Math.round(ytd.total),
    ytd_count: ytd.count,
    ytd_expected_usd: Math.round(ytdExpected),
    ytd_delta_usd: Math.round(ytdDelta),
    days_since_last_close: daysSinceLastClose,
  };

  await db.collection('revenue_goal_reviews').doc(monthKey).set({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    ...summary,
  }, { merge: true });

  // Severity logic — Rule 17 escalation
  let severity = 'info';
  let headline;
  if (daysSinceLastClose === null) {
    severity = 'critical';
    headline = `🚨 0 paying closes recorded in ${monthKey} — pivot to closing existing pipeline`;
  } else if (daysSinceLastClose >= 30) {
    severity = 'critical';
    headline = `🚨 ${daysSinceLastClose} days since last close — pipeline freeze`;
  } else if (monthDeltaPct <= -30) {
    severity = 'warn';
    headline = `⚠️ Mid-month behind target by ${Math.abs(Math.round(monthDeltaPct))}% — push needed`;
  } else if (monthDeltaPct >= 30) {
    severity = 'info';
    headline = `🚀 Mid-month ahead of target by ${Math.round(monthDeltaPct)}%`;
  } else {
    severity = 'info';
    headline = `📊 Mid-month on trajectory (${monthDeltaPct >= 0 ? '+' : ''}${Math.round(monthDeltaPct)}%)`;
  }

  await logEvent({
    tag: 'midMonthRevenueGoalReview',
    severity,
    message: headline,
    payload: summary,
  });

  return { ok: true, ...summary };
}

exports.midMonthRevenueGoalReview = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('0 8 15 * *')
  .timeZone('America/Mexico_City')
  .onRun(async () => runReview());

exports.midMonthRevenueGoalReviewOnDemand = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    try {
      const result = await runReview();
      res.status(200).json(result);
    } catch (err) {
      console.error('midMonthRevenueGoalReview onDemand failed:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

module.exports.__internal = { runReview, MONTHLY_TARGET_USD, ANNUAL_TARGET_USD };
