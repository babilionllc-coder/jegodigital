/**
 * common/logEvent.js — shared structured-logging helper.
 *
 * Built 2026-05-05 by Claude Gap Detector (was SG-4 in the original gap report,
 * promoted to Top-3 #2 after HG-1 was reclassified to a duplicate-cleanup gap).
 *
 * WHY (Rule 13 — plain language):
 *   CLAUDE_RULES.md Rule 24 says "every automation logs to Telegram + Slack on
 *   success and failure. Silent automation = blind automation." It cites
 *   `website/functions/common/logEvent.js` as the helper to use. That helper
 *   never existed — every new Cloud Function rolled its own logging (some have
 *   none, some have ad-hoc Telegram fetches, some only console.log).
 *
 *   This file IS the canonical helper Rule 24 has always cited.
 *
 * USAGE:
 *   const { logEvent } = require('./common/logEvent');
 *
 *   // Success:
 *   await logEvent({
 *     tag: 'verifyClientProofMonthly',
 *     severity: 'info',
 *     message: 'Monthly client-proof verification complete',
 *     payload: { clientsChecked: 6, drift: 0, durationMs: 4123 }
 *   });
 *
 *   // Failure (critical → Telegram urgent + Slack <!channel>):
 *   await logEvent({
 *     tag: 'verifyClientProofMonthly',
 *     severity: 'critical',
 *     message: 'Living Riviera Maya ChatGPT citation dropped — 20%+ drift',
 *     payload: { client: 'liveinrivieramaya', priorMonth: 'top-3', currentMonth: 'not-cited' }
 *   });
 *
 * SEVERITY:
 *   - info     → Slack only (info channel)
 *   - warn     → Slack #ops + Telegram (no urgent ping)
 *   - error    → Slack #ops + Telegram (no urgent ping)
 *   - critical → Slack #ops with <!channel> + Telegram urgent + console.error
 *
 * ENV VARS REQUIRED (read on cold start):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   SLACK_WEBHOOK_URL  (or SLACK_WEBHOOK_URL_OPS for #ops channel)
 *
 * Rule 24 + Rule 12 (always find a way): if either Telegram or Slack fails,
 * the helper still completes successfully (returns partial result). It NEVER
 * throws — silent logging failures must not crash the calling cron.
 */

'use strict';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
const SLACK_WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL_OPS || process.env.SLACK_WEBHOOK_URL || '';

const SEVERITIES = ['info', 'warn', 'error', 'critical'];

/**
 * Format a structured payload as a compact, Slack-friendly string.
 * Truncates anything over 1500 chars (Slack notification budget).
 */
function formatPayload(payload) {
  if (!payload) return '';
  try {
    const json = JSON.stringify(payload, null, 2);
    return json.length > 1500 ? json.slice(0, 1497) + '...' : json;
  } catch (err) {
    return String(payload);
  }
}

/**
 * Send a Telegram message via Bot API.
 * Returns { ok: boolean, error?: string }.
 */
async function sendTelegram({ text, urgent }) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN/CHAT_ID not set' };
  }
  const prefix = urgent ? '🚨🚨🚨 ' : '';
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: prefix + text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Send a Slack message via incoming webhook.
 * Returns { ok: boolean, error?: string }.
 */
async function sendSlack({ text, atChannel }) {
  if (!SLACK_WEBHOOK_URL) {
    return { ok: false, error: 'SLACK_WEBHOOK_URL not set' };
  }
  const prefix = atChannel ? '<!channel> ' : '';
  const body = { text: prefix + text };
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Main entry point. Per Rule 12, this NEVER throws — all errors are captured
 * and returned as part of the result so the caller can decide whether to act.
 *
 * @param {object} args
 * @param {string} args.tag       — short identifier (e.g. function name)
 * @param {string} args.severity  — info | warn | error | critical
 * @param {string} args.message   — human-readable summary
 * @param {object} [args.payload] — structured data (will be JSON-stringified)
 * @returns {Promise<{tag, severity, message, telegram, slack, console}>}
 */
async function logEvent({ tag, severity, message, payload }) {
  const sev = SEVERITIES.includes(severity) ? severity : 'info';
  const safeTag = tag || 'untagged';
  const safeMsg = message || '(no message)';

  // Always console-log so Cloud Functions logs capture the event even if
  // Telegram/Slack are misconfigured.
  const consoleLine = `[${sev.toUpperCase()}][${safeTag}] ${safeMsg}`;
  if (sev === 'critical' || sev === 'error') {
    console.error(consoleLine, payload || '');
  } else if (sev === 'warn') {
    console.warn(consoleLine, payload || '');
  } else {
    console.log(consoleLine, payload || '');
  }

  // Compose the chat message body — same for both Slack and Telegram.
  const emoji = ({ info: 'ℹ️', warn: '⚠️', error: '❌', critical: '🚨' })[sev];
  const payloadBlock = payload ? `\n\n\`\`\`\n${formatPayload(payload)}\n\`\`\`` : '';
  const text = `${emoji} *[${safeTag}]* ${safeMsg}${payloadBlock}`;

  // Decide channel routing.
  // - info  → Slack only (don't spam Telegram with every success)
  // - warn  → both channels
  // - error → both channels
  // - critical → both channels, Telegram urgent + Slack <!channel>
  const sendToTelegram = sev !== 'info';
  const urgent       = sev === 'critical';
  const atChannel    = sev === 'critical';

  const [tgRes, slackRes] = await Promise.all([
    sendToTelegram ? sendTelegram({ text, urgent }) : Promise.resolve({ ok: true, skipped: true }),
    sendSlack({ text, atChannel }),
  ]);

  return {
    tag: safeTag,
    severity: sev,
    message: safeMsg,
    telegram: tgRes,
    slack: slackRes,
    console: consoleLine,
  };
}

module.exports = { logEvent };
module.exports.__internal = { sendTelegram, sendSlack, formatPayload, SEVERITIES };
